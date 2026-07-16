/**
 * Real-time pitch visualizer (game-inspired):
 * SingStar-style center target highway, Yousician-like hit feedback,
 * Singing Carrots-style keyboard strip, precision MA band.
 * - Amber target trail · green voice · green "in-tune" lane
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
      this.game = null; // optional VTPitchGame
      this.lastIngestAt = 0;
      this.hitZoneCents = 35; // "good" zone width for highway
      /** Active chord tones as lanes [{name,freq,midi,active}] */
      this.chordLanes = [];
      /** Full progression pitch window for multi-note highway */
      this.rangeMinMidi = null;
      this.rangeMaxMidi = null;
      this.activeChordName = "";

      this._resize();
      window.addEventListener("resize", () => this._resize());
    }

    attachGame(game) {
      this.game = game;
    }

    _resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(320, rect.width || 640);
      // Taller highway for multi-lane chord view (game stage)
      const h = Math.max(240, rect.height || 300);
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
     * Set full progression pitch span so highway shows all chord tones.
     */
    setProgressionRange(prog) {
      if (!prog || !global.VTProgressionRange) return;
      const r = global.VTProgressionRange(prog, global.VT_NOTE_FREQ);
      this.rangeMinMidi = r.minMidi;
      this.rangeMaxMidi = r.maxMidi;
    }

    /**
     * Activate all chord-tone lanes; highlight primary match note.
     */
    setTargetFromChord(chord) {
      if (!chord || !chord.notes || !chord.notes.length) return;
      const map = global.VT_NOTE_FREQ || {};
      const lanes = [];
      chord.notes.forEach((n) => {
        const f = map[n];
        if (!f) return;
        const midi = freqToMidi(f);
        lanes.push({ name: n, freq: f, midi, active: true });
      });
      // unique by rounded midi
      const seen = new Set();
      this.chordLanes = lanes.filter((L) => {
        const k = Math.round(L.midi * 2) / 2;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      this.activeChordName = chord.name || "";

      // Primary target: mid-register singing tone
      let pick = chord.notes[1] || chord.notes[0];
      for (const n of chord.notes) {
        const f = map[n];
        if (f && f >= 120 && f <= 280) {
          pick = n;
          break;
        }
      }
      if (map[pick]) this.setTargetFreq(map[pick]);

      // Expand range to include these lanes
      if (this.chordLanes.length) {
        const midis = this.chordLanes.map((L) => L.midi);
        const lo = Math.min(...midis);
        const hi = Math.max(...midis);
        if (this.rangeMinMidi == null) this.rangeMinMidi = lo - 1;
        else this.rangeMinMidi = Math.min(this.rangeMinMidi, lo - 1);
        if (this.rangeMaxMidi == null) this.rangeMaxMidi = hi + 1;
        else this.rangeMaxMidi = Math.max(this.rangeMaxMidi, hi + 1);
      }
    }

    clearChordLanes() {
      this.chordLanes = [];
      this.activeChordName = "";
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
      this.lastIngestAt = performance.now();
      this._drawIdle();
    }

    /**
     * Push one analysis frame from the unified practice engine.
     */
    pushFrame(voiceFreq, targetFreq) {
      if (!this.running) return;
      if (targetFreq) this.targetFreq = targetFreq;
      this.voiceFreq = voiceFreq || null;
      const now = performance.now();
      const dt = Math.min(50, now - (this.lastIngestAt || now));
      this.lastIngestAt = now;
      this._ingest(voiceFreq || null, dt);
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

    _ingest(f, dtMs = 16) {
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

      let gameSnap = null;
      if (this.game) {
        gameSnap = this.game.tick(cents, f != null, dtMs);
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
          maAbs: this.maAbs,
          game: gameSnap || (this.game && this.game.snapshot())
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

    /**
     * Map MIDI → Y. When progression range is set, use full span so all chord
     * tones fit on the highway (not just ±6 around one note).
     */
    _midiToY(midi, centerMidi, graphH) {
      const gh = graphH != null ? graphH : this.h - 44;
      const pad = 0.08 * gh;
      if (
        this.rangeMinMidi != null &&
        this.rangeMaxMidi != null &&
        this.rangeMaxMidi > this.rangeMinMidi
      ) {
        const span = this.rangeMaxMidi - this.rangeMinMidi;
        const t = (midi - this.rangeMinMidi) / span;
        const clamped = Math.max(0, Math.min(1, t));
        return gh - pad - clamped * (gh - pad * 2);
      }
      const half = 6;
      const delta = midi - centerMidi;
      const c = Math.max(-half, Math.min(half, delta));
      const mid = gh / 2;
      return mid - (c / half) * (gh * 0.4);
    }

    _drawKeyboard(ctx, w, h, targetMidi, voiceMidi) {
      const y0 = h - 40;
      const kh = 36;
      // white keys C2–C4-ish 15 keys
      const whites = [];
      for (let m = 36; m <= 60; m++) {
        const name = NOTE_NAMES[((m % 12) + 12) % 12];
        if (!name.includes("#")) whites.push(m);
      }
      const ww = w / whites.length;
      whites.forEach((m, i) => {
        const x = i * ww;
        const isTarget = targetMidi != null && Math.round(targetMidi) === m;
        const isVoice = voiceMidi != null && Math.round(voiceMidi) === m;
        ctx.fillStyle = isTarget
          ? "rgba(240,201,160,0.55)"
          : isVoice
            ? "rgba(125,222,176,0.45)"
            : "#1a2433";
        ctx.strokeStyle = "#2f3d52";
        ctx.lineWidth = 1;
        ctx.fillRect(x + 0.5, y0, ww - 1, kh);
        ctx.strokeRect(x + 0.5, y0, ww - 1, kh);
        if (isTarget || isVoice) {
          ctx.fillStyle = isTarget ? "#f0c9a0" : "#9aecc4";
          ctx.font = "9px system-ui,sans-serif";
          ctx.textAlign = "center";
          ctx.fillText(midiToName(m).replace(/\d/, ""), x + ww / 2, y0 + kh - 8);
        }
      });
      // black keys
      whites.forEach((m, i) => {
        const pc = ((m % 12) + 12) % 12;
        // black after C D F G A (0,2,5,7,9)
        if ([0, 2, 5, 7, 9].includes(pc) && m + 1 <= 60) {
          const bm = m + 1;
          const x = (i + 1) * ww - ww * 0.3;
          const isTarget = targetMidi != null && Math.round(targetMidi) === bm;
          const isVoice = voiceMidi != null && Math.round(voiceMidi) === bm;
          ctx.fillStyle = isTarget
            ? "rgba(240,201,160,0.9)"
            : isVoice
              ? "rgba(125,222,176,0.85)"
              : "#0a0e14";
          ctx.fillRect(x, y0, ww * 0.55, kh * 0.62);
        }
      });
    }

    _drawIdle() {
      const ctx = this.ctx2d;
      if (!ctx) return;
      const w = this.w || 640;
      const h = this.h || 260;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "#101822";
      ctx.fillRect(0, 0, w, h);
      // preview highway
      const mid = h * 0.42;
      ctx.fillStyle = "rgba(61,186,122,0.12)";
      ctx.fillRect(0, mid - 18, w, 36);
      ctx.strokeStyle = "rgba(240,201,160,0.5)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.stroke();
      ctx.fillStyle = "#9aabc0";
      ctx.font = "600 13px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Pitch highway · Start practice & sing into the green lane", w / 2, h / 2 + 20);
      ctx.font = "11px system-ui,sans-serif";
      ctx.fillStyle = "#6a7c94";
      ctx.fillText("Like SingStar / Yousician: stay in the lane · build combo · lock notes", w / 2, h / 2 + 40);
      this._drawKeyboard(ctx, w, h, null, null);
    }

    _draw() {
      const ctx = this.ctx2d;
      const w = this.w;
      const h = this.h;
      const centerMidi = freqToMidi(this.targetFreq);
      const game = this.game ? this.game.snapshot() : null;
      const zones = (game && game.zones) || { perfect: 15, good: 35, close: 60 };

      // Background
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#0c121a");
      g.addColorStop(0.45, "#121c2a");
      g.addColorStop(1, "#0c121a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // Graph area (leave bottom for keyboard)
      const graphH = h - 44;
      const midY = this._midiToY(centerMidi, centerMidi, graphH);

      // Range-aware grid
      const lo =
        this.rangeMinMidi != null ? Math.floor(this.rangeMinMidi) : Math.floor(centerMidi - 6);
      const hi =
        this.rangeMaxMidi != null ? Math.ceil(this.rangeMaxMidi) : Math.ceil(centerMidi + 6);
      ctx.strokeStyle = "rgba(80,100,130,0.18)";
      ctx.lineWidth = 1;
      for (let m = lo; m <= hi; m++) {
        const y = this._midiToY(m, centerMidi, graphH);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Multi-lane: all active chord tones as horizontal highways
      // Inactive-looking dim lanes for full progression span notes would clutter;
      // show active chord tones strongly + primary target strongest.
      const laneHalf = Math.max(4, (zones.good / 100) * (graphH / Math.max(8, hi - lo)) * 0.9);
      (this.chordLanes || []).forEach((lane) => {
        const y = this._midiToY(lane.midi, centerMidi, graphH);
        const isPrimary = Math.abs(lane.freq - this.targetFreq) < 0.5;
        ctx.fillStyle = isPrimary
          ? "rgba(61,186,122,0.22)"
          : "rgba(240,201,160,0.12)";
        ctx.fillRect(0, y - laneHalf, w, laneHalf * 2);
        ctx.strokeStyle = isPrimary
          ? "rgba(61,186,122,0.75)"
          : "rgba(240,201,160,0.45)";
        ctx.lineWidth = isPrimary ? 2 : 1;
        ctx.setLineDash(isPrimary ? [] : [4, 5]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = isPrimary ? "#9aecc4" : "#f0c9a0";
        ctx.font = isPrimary ? "700 11px system-ui,sans-serif" : "600 10px system-ui,sans-serif";
        ctx.textAlign = "left";
        ctx.fillText(lane.name + (isPrimary ? " ●" : ""), 8, y - laneHalf - 2);
      });

      // Fallback single lane when no chord context
      if (!this.chordLanes.length) {
        const goodHalf = (zones.good / 100) * (graphH * 0.4 / 6);
        const perfectHalf = (zones.perfect / 100) * (graphH * 0.4 / 6);
        ctx.fillStyle = "rgba(61,186,122,0.1)";
        ctx.fillRect(0, midY - goodHalf, w, goodHalf * 2);
        ctx.fillStyle = "rgba(61,186,122,0.18)";
        ctx.fillRect(0, midY - perfectHalf, w, perfectHalf * 2);
        ctx.strokeStyle = "rgba(61,186,122,0.45)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 6]);
        ctx.beginPath();
        ctx.moveTo(0, midY - goodHalf);
        ctx.lineTo(w, midY - goodHalf);
        ctx.moveTo(0, midY + goodHalf);
        ctx.lineTo(w, midY + goodHalf);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Range labels + active chord badge
      ctx.fillStyle = "#6a7c94";
      ctx.font = "11px ui-monospace,monospace";
      ctx.textAlign = "left";
      ctx.fillText(midiToName(hi), 6, this._midiToY(hi, centerMidi, graphH) + 4);
      ctx.fillText(midiToName(lo), 6, this._midiToY(lo, centerMidi, graphH) + 4);
      if (this.activeChordName) {
        ctx.fillStyle = "rgba(240,201,160,0.95)";
        ctx.font = "800 13px system-ui,sans-serif";
        ctx.textAlign = "center";
        ctx.fillText(this.activeChordName, w / 2, 16);
      }

      const n = this.history.length;
      const lastVoiceMidi = n ? this.history[n - 1].voiceMidi : null;

      if (n) {
        // Precision MA band
        const bandPtsTop = [];
        const bandPtsBot = [];
        for (let i = 0; i < n; i++) {
          const x = (i / (this.maxPoints - 1)) * (w - 24) + 12;
          const ma = this.maCents / 100;
          const halfW = Math.max(0.15, Math.min(3, this.precisionCents / 100));
          bandPtsTop.push({
            x,
            y: this._midiToY(centerMidi + ma + halfW, centerMidi, graphH)
          });
          bandPtsBot.push({
            x,
            y: this._midiToY(centerMidi + ma - halfW, centerMidi, graphH)
          });
        }
        ctx.beginPath();
        bandPtsTop.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
        for (let i = bandPtsBot.length - 1; i >= 0; i--) {
          ctx.lineTo(bandPtsBot[i].x, bandPtsBot[i].y);
        }
        ctx.closePath();
        ctx.fillStyle = "rgba(91,159,212,0.16)";
        ctx.fill();

        // Target trail
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(240,201,160,0.4)";
        ctx.shadowColor = "rgba(240,201,160,0.9)";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = (i / (this.maxPoints - 1)) * (w - 24) + 12;
          const y = this._midiToY(this.history[i].targetMidi, centerMidi, graphH);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        for (let i = 0; i < n; i++) {
          const x = (i / (this.maxPoints - 1)) * (w - 24) + 12;
          const y = this._midiToY(this.history[i].targetMidi, centerMidi, graphH);
          const alpha = 0.15 + (i / n) * 0.85;
          ctx.beginPath();
          ctx.fillStyle = `rgba(240,201,160,${alpha})`;
          ctx.arc(x, y, i === n - 1 ? 6 : 2, 0, Math.PI * 2);
          ctx.fill();
        }

        // Voice trail colored by zone
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        let started = false;
        for (let i = 0; i < n; i++) {
          const pt = this.history[i];
          if (pt.voiceMidi == null) {
            started = false;
            continue;
          }
          const x = (i / (this.maxPoints - 1)) * (w - 24) + 12;
          const y = this._midiToY(pt.voiceMidi, centerMidi, graphH);
          if (!started) {
            ctx.moveTo(x, y);
            started = true;
          } else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = "rgba(125,222,176,0.65)";
        ctx.stroke();

        for (let i = 0; i < n; i++) {
          const pt = this.history[i];
          if (pt.voiceMidi == null) continue;
          const x = (i / (this.maxPoints - 1)) * (w - 24) + 12;
          const y = this._midiToY(pt.voiceMidi, centerMidi, graphH);
          const absC = pt.cents != null ? Math.abs(pt.cents) : 99;
          let col = "rgba(224,108,117,0.7)";
          if (absC <= zones.perfect) col = "rgba(125,222,176,0.95)";
          else if (absC <= zones.good) col = "rgba(159,208,240,0.9)";
          else if (absC <= zones.close) col = "rgba(224,168,74,0.85)";
          ctx.beginPath();
          ctx.fillStyle = col;
          ctx.arc(x, y, i === n - 1 ? 7 : 2.2, 0, Math.PI * 2);
          ctx.fill();
        }

        const last = this.history[n - 1];
        if (last.voiceMidi != null) {
          const vx = ((n - 1) / (this.maxPoints - 1)) * (w - 24) + 12;
          const vy = this._midiToY(last.voiceMidi, centerMidi, graphH);
          // lock-on ring (Yousician hold-to-clear)
          if (game && game.lockProgress > 0) {
            ctx.beginPath();
            ctx.strokeStyle = "rgba(125,222,176,0.9)";
            ctx.lineWidth = 3;
            ctx.arc(vx, vy, 18, -Math.PI / 2, -Math.PI / 2 + game.lockProgress * Math.PI * 2);
            ctx.stroke();
          }
          ctx.beginPath();
          ctx.fillStyle = "rgba(125,222,176,0.2)";
          ctx.arc(vx, vy, 16, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.fillStyle = "#b8f0d4";
          ctx.arc(vx, vy, 6, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Score HUD
      if (game) {
        ctx.fillStyle = "rgba(12,18,26,0.72)";
        ctx.fillRect(w - 148, 6, 140, 58);
        ctx.textAlign = "right";
        ctx.fillStyle = "#e8eef6";
        ctx.font = "700 16px system-ui,sans-serif";
        ctx.fillText(`${game.score}`, w - 14, 26);
        ctx.font = "11px system-ui,sans-serif";
        ctx.fillStyle = "#9aabc0";
        ctx.fillText("SCORE", w - 14, 40);
        ctx.fillStyle = game.combo > 5 ? "#7ddeb0" : "#9aabc0";
        ctx.fillText(`×${game.combo} combo`, w - 14, 56);
        if (game.challengeMode) {
          ctx.textAlign = "left";
          ctx.fillStyle = "#f0c9a0";
          ctx.font = "600 12px system-ui,sans-serif";
          ctx.fillText(
            `Match ${game.challengeNote || "—"}  (${game.challengeCleared}/${game.challengeTotal})`,
            10,
            20
          );
        }
        if (game.flash) {
          ctx.textAlign = "center";
          ctx.font = "800 28px system-ui,sans-serif";
          ctx.fillStyle = game.flash.color;
          ctx.shadowColor = game.flash.color;
          ctx.shadowBlur = 18;
          ctx.fillText(game.flash.text, w / 2, graphH * 0.35);
          ctx.shadowBlur = 0;
        }
      }

      this._drawKeyboard(ctx, w, h, centerMidi, lastVoiceMidi);
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
