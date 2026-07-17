/**
 * Real-time pitch visualizer (game-inspired):
 * Game-inspired center target highway, hit feedback,
 * keyboard strip, precision MA band.
 * - Amber target trail · green voice · green "in-tune" lane
 */
(function (global) {
  "use strict";

  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  /** Fixed-Do solfège (Spanish/LATAM: Si not Ti) — C=Do */
  const SOLFEGE = ["Do", "Do♯", "Re", "Re♯", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "La♯", "Si"];

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

  function midiToSolfege(midi) {
    const rounded = Math.round(midi);
    const sol = SOLFEGE[((rounded % 12) + 12) % 12];
    const oct = Math.floor(rounded / 12) - 1;
    return `${sol}${oct}`;
  }

  /** Dual label: letter + solfège e.g. "C3 Do" (compact — fits right gutter) */
  function midiToDualLabel(midi, withOct = true) {
    const rounded = Math.round(midi);
    const letter = NOTE_NAMES[((rounded % 12) + 12) % 12];
    const sol = SOLFEGE[((rounded % 12) + 12) % 12];
    if (!withOct) return `${letter} ${sol}`;
    const oct = Math.floor(rounded / 12) - 1;
    return `${letter}${oct} ${sol}`;
  }

  /** Parse note name like C3 / Bb2 → dual label */
  function noteNameToDual(name) {
    if (!name) return "";
    if (typeof name === "number") return midiToDualLabel(name);
    const map = global.VT_NOTE_FREQ || {};
    const f = map[name];
    if (f) return midiToDualLabel(freqToMidi(f));
    const m = String(name).match(/^([A-Ga-g])([#b]?)(-?\d)?$/);
    if (!m) return String(name);
    let letter = m[1].toUpperCase() + (m[2] || "");
    const flatMap = { Bb: "A#", Eb: "D#", Ab: "G#", Db: "C#", Gb: "F#" };
    if (flatMap[letter]) letter = flatMap[letter];
    const idx = NOTE_NAMES.indexOf(letter);
    if (idx < 0) return String(name);
    const sol = SOLFEGE[idx];
    const display = m[1].toUpperCase() + (m[2] || "") + (m[3] || "");
    return `${display} ${sol}`;
  }

  /** Fit label into max width: shrink font, then truncate with … */
  function fitCanvasLabel(ctx, text, maxW, preferFont) {
    let font = preferFont;
    let t = String(text || "");
    ctx.font = font;
    if (ctx.measureText(t).width <= maxW) return { text: t, font };
    // Drop size once
    font = font.replace(/(\d+)px/, (_, n) => `${Math.max(9, Number(n) - 2)}px`);
    ctx.font = font;
    if (ctx.measureText(t).width <= maxW) return { text: t, font };
    // Truncate
    while (t.length > 2 && ctx.measureText(t + "…").width > maxW) {
      t = t.slice(0, -1);
    }
    return { text: t.length < String(text || "").length ? t + "…" : t, font };
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
      /**
       * Fixed pitch window for the highway (MIDI).
       * Once locked for a progression / note option, Y mapping must NOT
       * re-center or re-scale when the active target changes — that was confusing.
       */
      this.rangeMinMidi = null;
      this.rangeMaxMidi = null;
      this.rangeLocked = false;
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
      // Taller highway for multi-lane + low-vision note channels
      const h = Math.max(300, rect.height || 340);
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.w = w;
      this.h = h;
    }

    /**
     * Normalize a MIDI span: pad sides, enforce minimum width so a single
     * note still has room for voice deviation without recentering.
     */
    _normalizeRange(minMidi, maxMidi, pad = 1.25, minSpan = 10) {
      let lo = Number(minMidi);
      let hi = Number(maxMidi);
      if (!Number.isFinite(lo) || !Number.isFinite(hi)) {
        return { minMidi: 48, maxMidi: 60 };
      }
      if (hi < lo) {
        const t = lo;
        lo = hi;
        hi = t;
      }
      lo -= pad;
      hi += pad;
      const span = hi - lo;
      if (span < minSpan) {
        const mid = (lo + hi) / 2;
        lo = mid - minSpan / 2;
        hi = mid + minSpan / 2;
      }
      return { minMidi: lo, maxMidi: hi };
    }

    /**
     * Lock the highway Y-axis to a fixed MIDI window.
     * Subsequent chord/note changes only move the active target — not the grid.
     */
    lockMidiRange(minMidi, maxMidi, opts = {}) {
      const pad = opts.pad != null ? opts.pad : 1.25;
      const minSpan = opts.minSpan != null ? opts.minSpan : 10;
      const r = this._normalizeRange(minMidi, maxMidi, pad, minSpan);
      this.rangeMinMidi = r.minMidi;
      this.rangeMaxMidi = r.maxMidi;
      this.rangeLocked = true;
      return r;
    }

    /**
     * Lock range from note names (e.g. challenge pool, scale steps).
     * Builds optional ghost lanes when opts.ghostLanes is true (default true).
     */
    lockRangeFromNoteNames(names, noteFreqMap, opts = {}) {
      const map = noteFreqMap || global.VT_NOTE_FREQ || {};
      const list = (names || []).filter(Boolean);
      const midis = [];
      const notes = [];
      list.forEach((n) => {
        const f = typeof n === "number" ? n : map[n];
        if (!f || f < 40 || f > 2000) return;
        const midi = freqToMidi(f);
        midis.push(midi);
        notes.push({
          name: typeof n === "string" ? n : midiToName(midi),
          freq: f,
          midi
        });
      });
      if (!midis.length) return null;
      const r = this.lockMidiRange(Math.min(...midis), Math.max(...midis), opts);
      if (opts.ghostLanes !== false) {
        const seen = new Set();
        this.progressionLanes = [];
        notes.forEach((n) => {
          const k = Math.round(n.midi * 2) / 2;
          if (seen.has(k)) return;
          seen.add(k);
          this.progressionLanes.push({
            name: n.name,
            label: noteNameToDual(n.name),
            freq: n.freq,
            midi: n.midi,
            active: false
          });
        });
        this.progressionLanes.sort((a, b) => a.midi - b.midi);
      }
      return r;
    }

    /** Lock a fixed window around a center frequency in Hz (ref / hold exercises). */
    lockWindowAroundFreq(freqHz, halfSpan = 6) {
      const f = Number(freqHz);
      const midi = f > 40 && f < 2000 ? freqToMidi(f) : freqToMidi(130.81);
      return this.lockMidiRange(midi - halfSpan, midi + halfSpan, {
        pad: 0,
        minSpan: halfSpan * 2
      });
    }

    /** Lock a fixed window around a MIDI note number. */
    lockWindowAroundMidi(midi, halfSpan = 6) {
      const m = Number.isFinite(midi) ? midi : 48;
      return this.lockMidiRange(m - halfSpan, m + halfSpan, {
        pad: 0,
        minSpan: halfSpan * 2
      });
    }

    setTargetFreq(freq) {
      // Target only — never re-scale the highway when the singing note changes
      if (freq && freq > 40 && freq < 2000) this.targetFreq = freq;
    }

    setTargetNoteName(name, noteFreqMap) {
      const map = noteFreqMap || global.VT_NOTE_FREQ || {};
      if (map[name]) this.setTargetFreq(map[name]);
    }

    /**
     * Lock highway to the full max range of a progression (all chords/tones).
     * Call once when the user picks a progression — range stays fixed while chords cycle.
     */
    setProgressionRange(prog) {
      if (!prog || !global.VTProgressionRange) return;
      const r = global.VTProgressionRange(prog, global.VT_NOTE_FREQ);
      // Lock to full progression span (do not grow/shrink per chord)
      this.lockMidiRange(r.minMidi + 1, r.maxMidi - 1, { pad: 1.25, minSpan: 12 });
      // Ghost lanes: every unique pitch in the progression (dim until chord activates)
      const seen = new Set();
      this.progressionLanes = [];
      (r.notes || []).forEach((n) => {
        const k = Math.round(n.midi * 2) / 2;
        if (seen.has(k)) return;
        seen.add(k);
        this.progressionLanes.push({
          name: n.name,
          label: noteNameToDual(n.name),
          freq: n.freq,
          midi: n.midi,
          active: false
        });
      });
      this.progressionLanes.sort((a, b) => a.midi - b.midi);
    }

    /**
     * Activate chord-tone lanes.
     * opts.oneNote: show only a single target note (melodic / one-at-a-time mode).
     * opts.noteName: which note when oneNote (default: mid singing register pick).
     */
    setTargetFromChord(chord, opts = {}) {
      if (!chord || !chord.notes || !chord.notes.length) return;
      const map = global.VT_NOTE_FREQ || {};
      const oneNote = !!opts.oneNote;
      let noteList = chord.notes.slice();
      if (oneNote) {
        let pick = opts.noteName || chord.notes[0];
        if (!opts.noteName) {
          for (const n of chord.notes) {
            const f = map[n];
            if (f && f >= 120 && f <= 280) {
              pick = n;
              break;
            }
          }
        }
        noteList = [pick];
      }
      const lanes = [];
      noteList.forEach((n) => {
        const f = map[n];
        if (!f) return;
        const midi = freqToMidi(f);
        lanes.push({
          name: n,
          label: noteNameToDual(n),
          freq: f,
          midi,
          active: true
        });
      });
      // unique by rounded midi
      const seen = new Set();
      this.chordLanes = lanes.filter((L) => {
        const k = Math.round(L.midi * 2) / 2;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
      const dual = noteList[0] ? noteNameToDual(noteList[0]) : "";
      this.activeChordName = oneNote
        ? `${chord.name || ""} · ${dual}`.replace(/^ · /, "")
        : chord.name || "";

      // Primary target
      let pick = noteList[0];
      if (!oneNote) {
        pick = chord.notes[1] || chord.notes[0];
        for (const n of chord.notes) {
          const f = map[n];
          if (f && f >= 120 && f <= 280) {
            pick = n;
            break;
          }
        }
      }
      if (map[pick]) this.setTargetFreq(map[pick]);

      // Only set range from this chord when nothing is locked yet (fallback)
      if (!this.rangeLocked && this.chordLanes.length) {
        const midis = this.chordLanes.map((L) => L.midi);
        this.lockMidiRange(Math.min(...midis), Math.max(...midis), {
          pad: 1.25,
          minSpan: 10
        });
      }
    }

    /** Single melodic target (one note at a time) */
    setTargetFromNote(noteName, chordName) {
      if (!noteName) return;
      this.setTargetFromChord(
        { name: chordName || noteName, notes: [noteName] },
        { oneNote: true, noteName }
      );
    }

    clearChordLanes() {
      this.chordLanes = [];
      this.activeChordName = "";
      this.progressionLanes = [];
      this.rangeMinMidi = null;
      this.rangeMaxMidi = null;
      this.rangeLocked = false;
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

    /**
     * Public: remeasure canvas after layout and paint idle empty-state.
     * Critical: resetLanes often runs before stage height is set → blank buffer.
     */
    redrawIdle() {
      try {
        this._resize();
        this._drawIdle();
      } catch {
        /* canvas may be detached */
      }
    }

    _drawIdle() {
      const ctx = this.ctx2d;
      if (!ctx) return;
      // Prefer live layout size (after fitHighway); never draw 0×0
      if (!this.w || !this.h || this.w < 32 || this.h < 32) {
        try {
          this._resize();
        } catch {
          /* ignore */
        }
      }
      const w = Math.max(320, this.w || this.canvas?.clientWidth || 640);
      const h = Math.max(220, this.h || this.canvas?.clientHeight || 300);
      this.w = w;
      this.h = h;
      ctx.clearRect(0, 0, w, h);
      // Richer empty state (research: tuners/pitch apps show lanes before audio)
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#0e1622");
      bg.addColorStop(0.5, "#121c2c");
      bg.addColorStop(1, "#0c121a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      const graphH = h - 58;
      const mid = graphH * 0.45;
      // Faint horizontal guides (like staff / pitch channels)
      ctx.strokeStyle = "rgba(140, 175, 220, 0.22)";
      ctx.lineWidth = 1;
      for (let i = -3; i <= 3; i++) {
        if (i === 0) continue;
        const y = mid + i * (graphH * 0.09);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      // Target lane — higher contrast so idle is never “black void”
      ctx.fillStyle = "rgba(79, 212, 146, 0.22)";
      ctx.fillRect(0, mid - 40, w, 80);
      ctx.fillStyle = "rgba(79, 212, 146, 0.38)";
      ctx.fillRect(0, mid - 22, w, 44);
      ctx.strokeStyle = "rgba(255, 230, 170, 0.95)";
      ctx.lineWidth = 3;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(0, mid);
      ctx.lineTo(w, mid);
      ctx.stroke();
      ctx.setLineDash([]);
      // Edge glow on lane
      ctx.strokeStyle = "rgba(79, 212, 146, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, mid - 22);
      ctx.lineTo(w, mid - 22);
      ctx.moveTo(0, mid + 22);
      ctx.lineTo(w, mid + 22);
      ctx.stroke();
      const es =
        (global.VTI18n && global.VTI18n.lang === "es") ||
        document.documentElement.lang === "es";
      ctx.textAlign = "center";
      const idle0 = es ? "Pulsa Empezar" : "Press Start";
      const idle1 = es
        ? "Autopista · canta en el carril verde"
        : "Highway · sing in the green lane";
      const idle2 = es
        ? "Mantente en el carril · gana precisión"
        : "Stay in lane · build precision";
      const maxIdle = w * 0.88;
      ctx.fillStyle = "#8ee0b5";
      const f0 = fitCanvasLabel(ctx, idle0, maxIdle, "700 15px system-ui,sans-serif");
      ctx.font = f0.font;
      ctx.fillText(f0.text, w / 2, mid - 52);
      ctx.fillStyle = "#f2f6fc";
      const f1 = fitCanvasLabel(ctx, idle1, maxIdle, "700 16px system-ui,sans-serif");
      ctx.font = f1.font;
      ctx.fillText(f1.text, w / 2, mid + 52);
      const f2 = fitCanvasLabel(ctx, idle2, maxIdle, "600 13px system-ui,sans-serif");
      ctx.font = f2.font;
      ctx.fillStyle = "#b8c8dc";
      ctx.fillText(f2.text, w / 2, mid + 74);
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
      const graphH = h - 58;
      const midY = this._midiToY(centerMidi, centerMidi, graphH);

      // Range-aware grid (higher contrast for channel readability)
      const lo =
        this.rangeMinMidi != null ? Math.floor(this.rangeMinMidi) : Math.floor(centerMidi - 6);
      const hi =
        this.rangeMaxMidi != null ? Math.ceil(this.rangeMaxMidi) : Math.ceil(centerMidi + 6);
      ctx.strokeStyle = "rgba(170, 195, 230, 0.38)";
      ctx.lineWidth = 1.5;
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
      const laneHalf = Math.max(8, (zones.good / 100) * (graphH / spanSt) * 1.55);
      const activeMidis = new Set(
        (this.chordLanes || []).map((L) => Math.round(L.midi * 2) / 2)
      );
      const primaryMidi = Math.round(freqToMidi(this.targetFreq) * 2) / 2;

      // Right gutter for dual labels (~14%); never paint past canvas edge
      const gutter = Math.max(72, Math.min(w * 0.14, 140));
      const laneRight = Math.max(8, w - gutter);
      const labelMaxW = gutter - 12;
      const labelPadR = 6;
      // Label Ys reserved by priority paint (primary > active > ghost)
      const usedLabelYs = [];
      const canPlaceLabel = (y) => {
        for (let i = 0; i < usedLabelYs.length; i++) {
          if (Math.abs(usedLabelYs[i] - y) < 16) return false;
        }
        usedLabelYs.push(y);
        return true;
      };
      const paintRightLabel = (y, text, preferFont, fill, showDot) => {
        if (!canPlaceLabel(y)) return;
        // Prefer slightly larger type for low vision; fitCanvasLabel shrinks if needed
        const prefer = preferFont.replace(/(\d+)px/, (_, n) => `${Math.max(12, Number(n) + 1)}px`);
        const fitted = fitCanvasLabel(ctx, text, labelMaxW - (showDot ? 12 : 0), prefer);
        ctx.font = fitted.font;
        ctx.textAlign = "right";
        const tw = ctx.measureText(fitted.text).width;
        const boxW = tw + (showDot ? 20 : 12);
        const boxX = Math.max(laneRight + 2, w - labelPadR - boxW);
        ctx.fillStyle = "rgba(4, 8, 14, 0.9)";
        ctx.fillRect(boxX, y - 11, Math.min(boxW, gutter - 4), 20);
        if (showDot) {
          ctx.beginPath();
          ctx.fillStyle = fill;
          ctx.arc(boxX + 8, y - 1, 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.fillStyle = fill;
        ctx.fillText(fitted.text, w - labelPadR - 4, y + 3);
      };

      const drawLaneBand = (lane, mode) => {
        const y = this._midiToY(lane.midi, centerMidi, graphH);
        if (mode === "ghost") {
          ctx.fillStyle = "rgba(120, 150, 190, 0.12)";
          ctx.fillRect(0, y - laneHalf * 0.75, laneRight, laneHalf * 1.5);
          ctx.strokeStyle = "rgba(180, 200, 230, 0.45)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([3, 5]);
          ctx.beginPath();
          ctx.moveTo(0, y);
          ctx.lineTo(laneRight, y);
          ctx.stroke();
          ctx.setLineDash([]);
          return y;
        }
        const isPrimary = mode === "primary";
        ctx.fillStyle = isPrimary
          ? "rgba(79, 212, 146, 0.32)"
          : "rgba(240, 184, 80, 0.26)";
        ctx.fillRect(0, y - laneHalf, laneRight, laneHalf * 2);
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
        ctx.lineTo(laneRight, y);
        ctx.stroke();
        ctx.shadowBlur = 0;
        return y;
      };

      const ghostLanes = [];
      (this.progressionLanes || []).forEach((lane) => {
        const k = Math.round(lane.midi * 2) / 2;
        if (activeMidis.has(k)) return;
        const y = drawLaneBand(lane, "ghost");
        ghostLanes.push({ lane, y });
      });
      const activeDrawn = [];
      (this.chordLanes || []).forEach((lane) => {
        const k = Math.round(lane.midi * 2) / 2;
        const mode = k === primaryMidi ? "primary" : "active";
        const y = drawLaneBand(lane, mode);
        activeDrawn.push({ lane, y, mode });
      });
      // Labels by priority so sing target always wins dense stacks
      activeDrawn
        .filter((d) => d.mode === "primary")
        .forEach((d) => {
          paintRightLabel(
            d.y,
            d.lane.label || noteNameToDual(d.lane.midi),
            "800 11px system-ui,sans-serif",
            "#d4ffe8",
            true
          );
        });
      activeDrawn
        .filter((d) => d.mode === "active")
        .forEach((d) => {
          paintRightLabel(
            d.y,
            d.lane.label || noteNameToDual(d.lane.midi),
            "700 10px system-ui,sans-serif",
            "#ffe8b8",
            false
          );
        });
      ghostLanes.forEach((d) => {
        paintRightLabel(
          d.y,
          d.lane.label || noteNameToDual(d.lane.midi),
          "600 10px system-ui,sans-serif",
          "#c8d6ea",
          false
        );
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

      // Range labels left edge (compact dual, clamp into graph)
      const hiY = Math.max(12, Math.min(graphH - 4, this._midiToY(hi, centerMidi, graphH) + 4));
      const loY = Math.max(12, Math.min(graphH - 4, this._midiToY(lo, centerMidi, graphH) + 4));
      ctx.textAlign = "left";
      const hiLab = midiToDualLabel(hi, false);
      const loLab = midiToDualLabel(lo, false);
      const leftMax = Math.min(96, w * 0.2);
      const paintLeft = (lab, y) => {
        const f = fitCanvasLabel(ctx, lab, leftMax, "600 10px ui-monospace,monospace");
        ctx.font = f.font;
        const tw = ctx.measureText(f.text).width;
        ctx.fillStyle = "rgba(6, 10, 16, 0.75)";
        ctx.fillRect(2, y - 10, tw + 8, 14);
        ctx.fillStyle = "#e8eef6";
        ctx.fillText(f.text, 6, y);
      };
      paintLeft(hiLab, hiY);
      if (Math.abs(loY - hiY) >= 14) paintLeft(loLab, loY);
      // Chord/note badge — clamp width so it never clips under TR/TL
      if (this.activeChordName) {
        ctx.textAlign = "center";
        const cnMax = Math.min(w * 0.36, 200);
        const f = fitCanvasLabel(
          ctx,
          this.activeChordName,
          cnMax,
          "700 11px system-ui,sans-serif"
        );
        ctx.font = f.font;
        const cw = ctx.measureText(f.text).width;
        ctx.fillStyle = "rgba(6, 10, 16, 0.75)";
        ctx.fillRect(w / 2 - cw / 2 - 6, graphH * 0.02, cw + 12, 16);
        ctx.fillStyle = "#ffe8b8";
        ctx.fillText(f.text, w / 2, graphH * 0.02 + 12);
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
  global.VTPitchUtils = {
    freqToMidi,
    midiToFreq,
    midiToName,
    midiToSolfege,
    midiToDualLabel,
    noteNameToDual,
    detectPitch
  };
})(window);
