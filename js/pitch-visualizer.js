/**
 * Real-time pitch visualizer (game-inspired):
 * Game-inspired center target highway, hit feedback,
 * keyboard strip, precision MA band.
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
      /** All unique tones across progression (ghost lanes) */
      this.progressionLanes = [];
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
     * Also builds ghost lanes for every unique note in the progression.
     */
    setProgressionRange(prog) {
      if (!prog || !global.VTProgressionRange) return;
      const r = global.VTProgressionRange(prog, global.VT_NOTE_FREQ);
      this.rangeMinMidi = r.minMidi;
      this.rangeMaxMidi = r.maxMidi;
      // Ghost lanes: every unique pitch in the progression (dim until chord activates)
      const seen = new Set();
      this.progressionLanes = [];
      (r.notes || []).forEach((n) => {
        const k = Math.round(n.midi * 2) / 2;
        if (seen.has(k)) return;
        seen.add(k);
        this.progressionLanes.push({
          name: n.name,
          freq: n.freq,
          midi: n.midi,
          active: false
        });
      });
      this.progressionLanes.sort((a, b) => a.midi - b.midi);
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
      this.progressionLanes = [];
      this.rangeMinMidi = null;
      this.rangeMaxMidi = null;
    }

    /** Full reset when switching exercises (no stale multi-lane highway). */
    resetLanes() {
      this.clearChordLanes();
      this.history = [];
      this.devWindow = [];
      this.targetFreq = 130.81;
      this.targetName = "";
      this.maCents = 0;
      this.maAbs = 0;
      this.precisionCents = 0;
      this.accuracyCents = 0;
      try {
        this._drawIdle();
      } catch {
        /* canvas may not be sized yet */
      }
    }

    /**
     * Nearest active chord-tone lane for multi-lane scoring (any chord tone counts).
     * Returns { name, freq, midi, cents } or null.
     */
    nearestActiveLane(voiceFreq) {
      if (!voiceFreq || !this.chordLanes || !this.chordLanes.length) return null;
      let best = null;
      let bestAbs = Infinity;
      const vMidi = freqToMidi(voiceFreq);
      this.chordLanes.forEach((L) => {
        if (!L.active && L.active !== undefined) return;
        const cents = (vMidi - L.midi) * 100;
        const a = Math.abs(cents);
        if (a < bestAbs) {
          bestAbs = a;
          best = { name: L.name, freq: L.freq, midi: L.midi, cents };
        }
      });
      return best;
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
      // Multi-lane truth: score vs nearest active chord tone when lanes exist
      let scoreFreq = this.targetFreq;
      let scoreName = null;
      if (f && this.chordLanes && this.chordLanes.length) {
        const near = this.nearestActiveLane(f);
        if (near && near.freq) {
          scoreFreq = near.freq;
          scoreName = near.name;
        }
      }
      const targetMidi = freqToMidi(scoreFreq || this.targetFreq || 130.81);
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
          targetFreq: scoreFreq || this.targetFreq,
          targetName: scoreName || midiToName(targetMidi),
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
      ctx.fillStyle = "#0a1018";
      ctx.fillRect(0, 0, w, h);
      // preview highway — wider band for low vision
      const mid = h * 0.42;
      ctx.fillStyle = "rgba(79, 212, 146, 0.18)";
      ctx.fillRect(0, mid - 28, w, 56);
      ctx.strokeStyle = "rgba(240, 201, 160, 0.75)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.stroke();
      const es =
        (global.VTI18n && global.VTI18n.lang === "es") ||
        document.documentElement.lang === "es";
      ctx.fillStyle = "#e8eef6";
      ctx.font = "700 15px system-ui,sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(
        es
          ? "Autopista de afinación · Empieza y canta en el carril verde"
          : "Pitch highway · Start practice & sing into the green lane",
        w / 2,
        h / 2 + 22
      );
      ctx.font = "600 13px system-ui,sans-serif";
      ctx.fillStyle = "#c5d4e8";
      ctx.fillText(
        es
          ? "Mantente en el carril · gana precisión · bloquea notas"
          : "Stay in the lane · build precision · lock notes",
        w / 2,
        h / 2 + 44
      );
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

      // Graph area (leave bottom for keyboard) — taller canvas = thicker channels
      const graphH = h - 52;
      const midY = this._midiToY(centerMidi, centerMidi, graphH);

      // Range-aware grid (higher contrast for channel readability)
      const lo =
        this.rangeMinMidi != null ? Math.floor(this.rangeMinMidi) : Math.floor(centerMidi - 6);
      const hi =
        this.rangeMaxMidi != null ? Math.ceil(this.rangeMaxMidi) : Math.ceil(centerMidi + 6);
      ctx.strokeStyle = "rgba(150, 175, 210, 0.28)";
      ctx.lineWidth = 1.25;
      for (let m = lo; m <= hi; m++) {
        const y = this._midiToY(m, centerMidi, graphH);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      // Multi-lane highway:
      // 1) Ghost lanes = full progression note set (dim)
      // 2) Active chord tones = bright lanes
      // 3) Primary singing target = green active lane
      const spanSt = Math.max(6, hi - lo);
      // Thicker lanes when canvas is tall (low-vision friendly)
      const laneHalf = Math.max(6, (zones.good / 100) * (graphH / spanSt) * 1.35);
      const activeMidis = new Set(
        (this.chordLanes || []).map((L) => Math.round(L.midi * 2) / 2)
      );
      const primaryMidi = Math.round(freqToMidi(this.targetFreq) * 2) / 2;

      const drawLane = (lane, mode) => {
        // mode: ghost | active | primary
        const y = this._midiToY(lane.midi, centerMidi, graphH);
        if (mode === "ghost") {
          ctx.fillStyle = "rgba(120, 150, 190, 0.12)";
          ctx.fillRect(0, y - laneHalf * 0.75, w, laneHalf * 1.5);
          ctx.strokeStyle = "rgba(180, 200, 230, 0.45)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 5]);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(w, y);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = "#c8d6ea";
          ctx.font = "600 12px system-ui,sans-serif";
          ctx.textAlign = "right";
          ctx.fillText(lane.name, w - 10, y - 3);
          return;
        }
        const isPrimary = mode === "primary";
        ctx.fillStyle = isPrimary
          ? "rgba(79, 212, 146, 0.32)"
          : "rgba(240, 184, 80, 0.26)";
        ctx.fillRect(0, y - laneHalf, w, laneHalf * 2);
        ctx.strokeStyle = isPrimary
          ? "rgba(160, 255, 210, 1)"
          : "rgba(255, 220, 150, 0.95)";
        ctx.lineWidth = isPrimary ? 3.5 : 2.5;
        ctx.shadowColor = isPrimary
          ? "rgba(79, 212, 146, 0.65)"
          : "rgba(240, 184, 80, 0.5)";
        ctx.shadowBlur = isPrimary ? 14 : 8;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
        ctx.shadowBlur = 0;
        const esLane =
          (global.VTI18n && global.VTI18n.lang === "es") ||
          document.documentElement.lang === "es";
        // Label with dark pill for contrast on any lane color
        const label =
          (lane.name || "") +
          (isPrimary
            ? esLane
              ? " ● canta aquí"
              : " ● sing here"
            : esLane
              ? " · activo"
              : " · active");
        ctx.font = isPrimary
          ? "800 14px system-ui,sans-serif"
          : "700 13px system-ui,sans-serif";
        ctx.textAlign = "left";
        const tw = ctx.measureText(label).width;
        const ly = y - laneHalf - 4;
        ctx.fillStyle = "rgba(6, 10, 16, 0.78)";
        ctx.fillRect(4, ly - 14, tw + 12, 18);
        ctx.fillStyle = isPrimary ? "#d4ffe8" : "#ffe8b8";
        ctx.fillText(label, 10, ly);
      };

      // Ghost: all progression tones not currently active
      (this.progressionLanes || []).forEach((lane) => {
        const k = Math.round(lane.midi * 2) / 2;
        if (activeMidis.has(k)) return;
        drawLane(lane, "ghost");
      });
      // Active chord tones
      (this.chordLanes || []).forEach((lane) => {
        const k = Math.round(lane.midi * 2) / 2;
        drawLane(lane, k === primaryMidi ? "primary" : "active");
      });

      // Fallback single lane when no chord context
      if (!this.chordLanes.length && !this.progressionLanes.length) {
        const goodHalf = Math.max(14, (zones.good / 100) * (graphH * 0.45 / 6));
        const perfectHalf = Math.max(8, (zones.perfect / 100) * (graphH * 0.45 / 6));
        ctx.fillStyle = "rgba(79, 212, 146, 0.16)";
        ctx.fillRect(0, midY - goodHalf, w, goodHalf * 2);
        ctx.fillStyle = "rgba(79, 212, 146, 0.28)";
        ctx.fillRect(0, midY - perfectHalf, w, perfectHalf * 2);
        ctx.strokeStyle = "rgba(160, 255, 210, 0.85)";
        ctx.lineWidth = 2.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(0, midY);
        ctx.lineTo(w, midY);
        ctx.stroke();
        ctx.strokeStyle = "rgba(160, 255, 210, 0.55)";
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

      // Range labels + active chord badge (high contrast)
      ctx.font = "700 13px ui-monospace,monospace";
      ctx.textAlign = "left";
      const hiY = this._midiToY(hi, centerMidi, graphH) + 4;
      const loY = this._midiToY(lo, centerMidi, graphH) + 4;
      ctx.fillStyle = "rgba(6, 10, 16, 0.75)";
      ctx.fillRect(2, hiY - 12, 42, 16);
      ctx.fillRect(2, loY - 12, 42, 16);
      ctx.fillStyle = "#e8eef6";
      ctx.fillText(midiToName(hi), 6, hiY);
      ctx.fillText(midiToName(lo), 6, loY);
      if (this.activeChordName) {
        ctx.font = "800 15px system-ui,sans-serif";
        ctx.textAlign = "center";
        const cn = this.activeChordName;
        const cw = ctx.measureText(cn).width;
        ctx.fillStyle = "rgba(6, 10, 16, 0.8)";
        ctx.fillRect(w / 2 - cw / 2 - 8, 6, cw + 16, 22);
        ctx.fillStyle = "#ffe8b8";
        ctx.fillText(cn, w / 2, 22);
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
          // lock-on ring (hold-to-clear)
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

      // Challenge cue only (score lives in DOM .hud-tr — avoid double HUD under corners)
      if (game) {
        if (game.challengeMode) {
          const es =
            (global.VTI18n && global.VTI18n.lang === "es") ||
            document.documentElement.lang === "es";
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(12,18,26,0.65)";
          ctx.fillRect(w / 2 - 110, graphH * 0.08, 220, 28);
          ctx.fillStyle = "#f0c9a0";
          ctx.font = "600 12px system-ui,sans-serif";
          ctx.fillText(
            es
              ? `Nota ${game.challengeNote || "—"}  (${game.challengeCleared}/${game.challengeTotal})`
              : `Match ${game.challengeNote || "—"}  (${game.challengeCleared}/${game.challengeTotal})`,
            w / 2,
            graphH * 0.08 + 18
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
