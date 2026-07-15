/**
 * Real-time pitch visualizer:
 * - Target note = glowing center trail
 * - Voice = live pitch dot
 * - Soft band = moving-average deviation (precision envelope)
 */
(function (global) {
  "use strict";

  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  function freqToMidi(freq) {
    return 69 + 12 * Math.log2(freq / 440);
  }

  function midiToFreq(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }

  function midiToName(midi) {
    const rounded = Math.round(midi);
    const name = NOTE_NAMES[((rounded % 12) + 12) % 12];
    const oct = Math.floor(rounded / 12) - 1;
    return `${name}${oct}`;
  }

  /**
   * Autocorrelation pitch detection (time-domain).
   * Returns Hz or null.
   */
  function detectPitch(buf, sampleRate) {
    const SIZE = buf.length;
    let rms = 0;
    for (let i = 0; i < SIZE; i++) {
      const val = buf[i];
      rms += val * val;
    }
    rms = Math.sqrt(rms / SIZE);
    if (rms < 0.01) return null; // silence

    // Normalize
    let r1 = 0;
    let r2 = SIZE - 1;
    const thres = 0.2;
    for (let i = 0; i < SIZE / 2; i++) {
      if (Math.abs(buf[i]) < thres) {
        r1 = i;
        break;
      }
    }
    for (let i = 1; i < SIZE / 2; i++) {
      if (Math.abs(buf[SIZE - i]) < thres) {
        r2 = SIZE - i;
        break;
      }
    }

    const trimmed = buf.slice(r1, r2);
    const n = trimmed.length;
    if (n < 32) return null;

    // Male mid-low focus: ~65–400 Hz (C2–G4)
    const minLag = Math.floor(sampleRate / 400);
    const maxLag = Math.floor(sampleRate / 65);
    const corr = new Float32Array(maxLag);

    for (let lag = minLag; lag < maxLag && lag < n; lag++) {
      let sum = 0;
      for (let i = 0; i < n - lag; i++) {
        sum += trimmed[i] * trimmed[i + lag];
      }
      corr[lag] = sum;
    }

    let bestLag = -1;
    let bestVal = -1;
    for (let lag = minLag + 1; lag < maxLag - 1 && lag < n; lag++) {
      const v = corr[lag];
      if (v > corr[lag - 1] && v >= corr[lag + 1] && v > bestVal) {
        bestVal = v;
        bestLag = lag;
      }
    }
    if (bestLag <= 0) return null;

    // Parabolic interpolation
    const y0 = corr[bestLag - 1] || 0;
    const y1 = corr[bestLag];
    const y2 = corr[bestLag + 1] || 0;
    const denom = 2 * (2 * y1 - y2 - y0);
    const shift = denom !== 0 ? (y2 - y0) / denom : 0;
    const lag = bestLag + shift;
    const freq = sampleRate / lag;
    if (freq < 60 || freq > 500) return null;
    return freq;
  }

  class PitchVisualizer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx2d = canvas.getContext("2d");
      this.audioCtx = null;
      this.analyser = null;
      this.stream = null;
      this.source = null;
      this.raf = null;
      this.running = false;
      this.external = false; // driven by PracticeEngine frames
      this.buf = null;

      this.targetFreq = 130.81; // C3 default
      this.voiceFreq = null;
      this.history = []; // {t, targetMidi, voiceMidi, cents}
      this.maxPoints = 240;
      this.devWindow = []; // recent cents deviations for MA band
      this.maCents = 0;
      this.maAbs = 0;
      this.precisionCents = 40; // rolling std-ish spread
      this.accuracyCents = 0;
      this.onStats = null;

      this._resize();
      window.addEventListener("resize", () => this._resize());
    }

    _resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(320, rect.width || 640);
      const h = Math.max(180, rect.height || 220);
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.w = w;
      this.h = h;
    }

    setTargetFreq(freq) {
      if (freq && freq > 40 && freq < 2000) this.targetFreq = freq;
    }

    setTargetNoteName(name, noteFreqMap) {
      const map = noteFreqMap || global.VT_NOTE_FREQ || {};
      if (map[name]) this.setTargetFreq(map[name]);
    }

    /**
     * Prefer chord root (first note) as target for matching practice.
     */
    setTargetFromChord(chord) {
      if (!chord || !chord.notes || !chord.notes.length) return;
      // Prefer mid-register chord tone (often index 1 or 2) else root
      const map = global.VT_NOTE_FREQ || {};
      let pick = chord.notes[1] || chord.notes[0];
      // Prefer a note in C3-A3 for singing comfort if present
      for (const n of chord.notes) {
        const f = map[n];
        if (f && f >= 120 && f <= 230) {
          pick = n;
          break;
        }
      }
      if (map[pick]) this.setTargetFreq(map[pick]);
    }

    /**
     * Slave mode: PracticeEngine pushes frames — no second mic stream.
     */
    startExternal() {
      this._resize();
      this.external = true;
      this.running = true;
      this.history = [];
      this.devWindow = [];
      this._drawIdle();
    }

    /**
     * Push one analysis frame from the unified practice engine.
     */
    pushFrame(voiceFreq, targetFreq) {
      if (!this.running) return;
      if (targetFreq) this.targetFreq = targetFreq;
      this.voiceFreq = voiceFreq || null;
      this._ingest(voiceFreq || null);
      this._draw();
    }

    async start() {
      if (this.running) return;
      this._resize();
      this.external = false;
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        });
      } catch (e) {
        throw e;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AC();
      if (this.audioCtx.state === "suspended") await this.audioCtx.resume();
      this.source = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.2;
      this.source.connect(this.analyser);
      this.buf = new Float32Array(this.analyser.fftSize);
      this.running = true;
      this.history = [];
      this.devWindow = [];
      this._loop();
    }

    stop() {
      this.running = false;
      this.external = false;
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
      if (this.source) {
        try {
          this.source.disconnect();
        } catch {
          /* ignore */
        }
      }
      if (this.audioCtx) {
        this.audioCtx.close().catch(() => {});
        this.audioCtx = null;
      }
      if (this.stream) {
        this.stream.getTracks().forEach((t) => t.stop());
        this.stream = null;
      }
      this.voiceFreq = null;
      this._drawIdle();
    }

    _ingest(f) {
      const targetMidi = freqToMidi(this.targetFreq);
      let voiceMidi = null;
      let cents = null;
      if (f) {
        voiceMidi = freqToMidi(f);
        cents = (voiceMidi - targetMidi) * 100;
        this.devWindow.push(cents);
        if (this.devWindow.length > 48) this.devWindow.shift();
        const n = this.devWindow.length;
        const mean = this.devWindow.reduce((a, b) => a + b, 0) / n;
        const variance =
          this.devWindow.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n;
        this.maCents = mean;
        this.maAbs = Math.abs(mean);
        this.precisionCents = Math.sqrt(variance) * 2 || 8;
        this.accuracyCents = mean;
      }

      this.history.push({
        targetMidi,
        voiceMidi,
        cents,
        t: performance.now()
      });
      if (this.history.length > this.maxPoints) this.history.shift();

      if (this.onStats) {
        this.onStats({
          targetFreq: this.targetFreq,
          targetName: midiToName(targetMidi),
          voiceFreq: f,
          voiceName: f ? midiToName(freqToMidi(f)) : "—",
          accuracyCents: this.accuracyCents,
          precisionCents: this.precisionCents,
          maAbs: this.maAbs
        });
      }
    }

    _loop() {
      if (!this.running || this.external) return;
      this.analyser.getFloatTimeDomainData(this.buf);
      const f = detectPitch(this.buf, this.audioCtx.sampleRate);
      this.voiceFreq = f;
      this._ingest(f);
      this._draw();
      this.raf = requestAnimationFrame(() => this._loop());
    }

    _midiToY(midi, centerMidi) {
      // Map ±12 semitones around target to canvas height
      const span = 12; // semitones full scale half? full ±6 better for precision
      const half = 6;
      const delta = midi - centerMidi;
      const clamped = Math.max(-half, Math.min(half, delta));
      const mid = this.h / 2;
      return mid - (clamped / half) * (this.h * 0.4);
    }

    _drawIdle() {
      const ctx = this.ctx2d;
      if (!ctx) return;
      const w = this.w || 640;
      const h = this.h || 220;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#141c28";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#6a7c94";
      ctx.font = "13px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Start pitch visualizer · sing toward the glowing target", w / 2, h / 2);
    }

    _draw() {
      const ctx = this.ctx2d;
      const w = this.w;
      const h = this.h;
      const centerMidi = freqToMidi(this.targetFreq);

      // Background
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#101822");
      g.addColorStop(0.5, "#152030");
      g.addColorStop(1, "#101822");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // Grid
      ctx.strokeStyle = "rgba(80,100,130,0.25)";
      ctx.lineWidth = 1;
      for (let s = -6; s <= 6; s++) {
        const y = this._midiToY(centerMidi + s, centerMidi);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Labels
      ctx.fillStyle = "#6a7c94";
      ctx.font = "11px ui-monospace,monospace";
      ctx.textAlign = "left";
      ctx.fillText("+6 st", 6, this._midiToY(centerMidi + 6, centerMidi) + 4);
      ctx.fillText("target", 6, h / 2 - 6);
      ctx.fillText("−6 st", 6, this._midiToY(centerMidi - 6, centerMidi) + 4);

      const n = this.history.length;
      if (!n) return;

      // Soft deviation band (moving average ± precision) — precision envelope
      const bandPtsTop = [];
      const bandPtsBot = [];
      for (let i = 0; i < n; i++) {
        const x = (i / (this.maxPoints - 1)) * (w - 24) + 12;
        // Use rolling local deviation estimate: ma + precision spread around target line
        // Show band around target shifted by ma (accuracy bias) with width = precision
        const ma = this.maCents / 100; // in semitones
        const halfW = Math.max(0.15, Math.min(3, this.precisionCents / 100));
        bandPtsTop.push({ x, y: this._midiToY(centerMidi + ma + halfW, centerMidi) });
        bandPtsBot.push({ x, y: this._midiToY(centerMidi + ma - halfW, centerMidi) });
      }
      ctx.beginPath();
      bandPtsTop.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
      for (let i = bandPtsBot.length - 1; i >= 0; i--) {
        ctx.lineTo(bandPtsBot[i].x, bandPtsBot[i].y);
      }
      ctx.closePath();
      const bandGrad = ctx.createLinearGradient(0, 0, 0, h);
      bandGrad.addColorStop(0, "rgba(124,108,240,0.05)");
      bandGrad.addColorStop(0.5, "rgba(91,159,212,0.22)");
      bandGrad.addColorStop(1, "rgba(124,108,240,0.05)");
      ctx.fillStyle = bandGrad;
      ctx.fill();

      // Target glowing trail (center)
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(240,201,160,0.35)";
      ctx.shadowColor = "rgba(240,201,160,0.85)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const x = (i / (this.maxPoints - 1)) * (w - 24) + 12;
        const y = this._midiToY(this.history[i].targetMidi, centerMidi);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Target dots trail
      for (let i = 0; i < n; i++) {
        const x = (i / (this.maxPoints - 1)) * (w - 24) + 12;
        const y = this._midiToY(this.history[i].targetMidi, centerMidi);
        const alpha = 0.15 + (i / n) * 0.85;
        ctx.beginPath();
        ctx.fillStyle = `rgba(240,201,160,${alpha})`;
        ctx.arc(x, y, i === n - 1 ? 7 : 2.2, 0, Math.PI * 2);
        ctx.fill();
      }
      // Outer glow on latest target
      const tx = ((n - 1) / (this.maxPoints - 1)) * (w - 24) + 12;
      const ty = this._midiToY(this.history[n - 1].targetMidi, centerMidi);
      ctx.beginPath();
      ctx.fillStyle = "rgba(240,201,160,0.2)";
      ctx.arc(tx, ty, 14, 0, Math.PI * 2);
      ctx.fill();

      // Voice trail
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(125,222,176,0.55)";
      ctx.beginPath();
      let started = false;
      for (let i = 0; i < n; i++) {
        const pt = this.history[i];
        if (pt.voiceMidi == null) {
          started = false;
          continue;
        }
        const x = (i / (this.maxPoints - 1)) * (w - 24) + 12;
        const y = this._midiToY(pt.voiceMidi, centerMidi);
        if (!started) {
          ctx.moveTo(x, y);
          started = true;
        } else ctx.lineTo(x, y);
      }
      ctx.stroke();

      // Voice dots
      for (let i = 0; i < n; i++) {
        const pt = this.history[i];
        if (pt.voiceMidi == null) continue;
        const x = (i / (this.maxPoints - 1)) * (w - 24) + 12;
        const y = this._midiToY(pt.voiceMidi, centerMidi);
        const alpha = 0.2 + (i / n) * 0.8;
        ctx.beginPath();
        ctx.fillStyle = `rgba(125,222,176,${alpha})`;
        ctx.arc(x, y, i === n - 1 ? 7 : 2.4, 0, Math.PI * 2);
        ctx.fill();
      }

      // Latest voice glow
      const last = this.history[n - 1];
      if (last.voiceMidi != null) {
        const vx = ((n - 1) / (this.maxPoints - 1)) * (w - 24) + 12;
        const vy = this._midiToY(last.voiceMidi, centerMidi);
        ctx.beginPath();
        ctx.fillStyle = "rgba(125,222,176,0.25)";
        ctx.arc(vx, vy, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = "#9aecc4";
        ctx.arc(vx, vy, 6, 0, Math.PI * 2);
        ctx.fill();
      }

      // Legend chip
      ctx.fillStyle = "rgba(20,28,40,0.75)";
      ctx.fillRect(w - 168, 8, 156, 52);
      ctx.fillStyle = "#f0c9a0";
      ctx.beginPath();
      ctx.arc(w - 152, 24, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c5d0de";
      ctx.font = "11px system-ui,sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("Target note", w - 142, 28);
      ctx.fillStyle = "#9aecc4";
      ctx.beginPath();
      ctx.arc(w - 152, 44, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c5d0de";
      ctx.fillText("Your voice", w - 142, 48);
    }

    getSnapshotMetrics() {
      return {
        accuracyCents: Math.round(this.accuracyCents),
        precisionCents: Math.round(this.precisionCents),
        maAbs: Math.round(this.maAbs)
      };
    }
  }

  global.VTPitchVisualizer = PitchVisualizer;
  global.VTPitchUtils = { freqToMidi, midiToFreq, midiToName, detectPitch };
})(window);
