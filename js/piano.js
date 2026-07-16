/**
 * Realistic multi-partial piano for mid-lower male practice range.
 * Roots and voicings sit roughly C2–E4 (baritone-friendly) by default;
 * octave shift (±2) can move material into other singers' ranges.
 */
(function (global) {
  "use strict";

  /** Build chromatic map C1–C6 so octave-shifted progressions always resolve. */
  function buildNoteFreqMap() {
    const sharp = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    const flatPrefer = {
      "C#": "Db",
      "D#": "Eb",
      "F#": "Gb",
      "G#": "Ab",
      "A#": "Bb"
    };
    const map = {};
    for (let oct = 1; oct <= 6; oct++) {
      for (let i = 0; i < 12; i++) {
        // MIDI: C4 = 60 → 12*(oct+1)+i with C=0
        const midi = 12 * (oct + 1) + i;
        const freq = +(440 * Math.pow(2, (midi - 69) / 12)).toFixed(2);
        const sn = sharp[i] + oct;
        map[sn] = freq;
        const flatBase = flatPrefer[sharp[i]];
        if (flatBase) map[flatBase + oct] = freq;
      }
    }
    return map;
  }

  const NOTE_FREQ = buildNoteFreqMap();

  /** Shift a note name by whole octaves: "C3" + 1 → "C4". */
  function shiftNoteName(name, octaves) {
    const n = Math.round(Number(octaves) || 0);
    if (!n || name == null) return name;
    const m = String(name).match(/^([A-G](?:#|b)?)(-?\d+)$/i);
    if (!m) return name;
    return m[1] + (parseInt(m[2], 10) + n);
  }

  function shiftNoteNames(names, octaves) {
    const n = Math.round(Number(octaves) || 0);
    if (!n) return (names || []).slice();
    return (names || []).map((nm) => shiftNoteName(nm, n));
  }

  /** Deep-clone progression with every chord tone shifted by octaves. */
  function transposeProgression(prog, octaves) {
    if (!prog) return null;
    const n = Math.round(Number(octaves) || 0);
    if (!n) {
      return {
        name: prog.name,
        description: prog.description,
        wide: prog.wide,
        chords: (prog.chords || []).map((ch) => ({
          name: ch.name,
          notes: (ch.notes || []).slice(),
          oneNote: ch.oneNote
        }))
      };
    }
    return {
      name: prog.name,
      description: prog.description,
      wide: prog.wide,
      octaveShift: n,
      chords: (prog.chords || []).map((ch) => ({
        name: ch.name,
        notes: shiftNoteNames(ch.notes, n),
        oneNote: ch.oneNote
      }))
    };
  }

  function freqForNote(name, octaveShift) {
    const shifted = shiftNoteName(name, octaveShift);
    return NOTE_FREQ[shifted] || NOTE_FREQ[name] || null;
  }

  /** Chord progressions in mid-lower piano range for men */
  const PROGRESSIONS = {
    prog1: {
      name: "I – vi – IV – V (C)",
      description: "C – Am – F – G · classic pop",
      chords: [
        { name: "C", notes: ["C2", "C3", "E3", "G3"] },
        { name: "Am", notes: ["A2", "C3", "E3", "A3"] },
        { name: "F", notes: ["F2", "C3", "F3", "A3"] },
        { name: "G", notes: ["G2", "B2", "D3", "G3"] }
      ]
    },
    prog2: {
      name: "vi – IV – I – V (Am)",
      description: "Am – F – C – G",
      chords: [
        { name: "Am", notes: ["A2", "C3", "E3", "A3"] },
        { name: "F", notes: ["F2", "C3", "F3", "A3"] },
        { name: "C", notes: ["C2", "C3", "E3", "G3"] },
        { name: "G", notes: ["G2", "B2", "D3", "G3"] }
      ]
    },
    prog3: {
      name: "I – vi – IV – V (G)",
      description: "G – Em – C – D",
      chords: [
        { name: "G", notes: ["G2", "B2", "D3", "G3"] },
        { name: "Em", notes: ["E2", "B2", "E3", "G3"] },
        { name: "C", notes: ["C2", "C3", "E3", "G3"] },
        { name: "D", notes: ["D2", "A2", "D3", "F3"] }
      ]
    },
    prog4: {
      name: "IV – I – ii – bVII (F)",
      description: "F – C – Dm – Bb",
      chords: [
        { name: "F", notes: ["F2", "C3", "F3", "A3"] },
        { name: "C", notes: ["C2", "C3", "E3", "G3"] },
        { name: "Dm", notes: ["D2", "A2", "D3", "F3"] },
        { name: "Bb", notes: ["Bb2", "D3", "F3", "Bb3"] }
      ]
    },
    prog5: {
      name: "ii – bVII – IV – I (Dm)",
      description: "Dm – Bb – F – C",
      chords: [
        { name: "Dm", notes: ["D2", "A2", "D3", "F3"] },
        { name: "Bb", notes: ["Bb2", "D3", "F3", "Bb3"] },
        { name: "F", notes: ["F2", "C3", "F3", "A3"] },
        { name: "C", notes: ["C2", "C3", "E3", "G3"] }
      ]
    },
    songFeel: {
      name: "Song A progression (G area)",
      description: "G – Em – C – D · mid-low male",
      chords: [
        { name: "G", notes: ["G2", "B2", "D3", "G3"] },
        { name: "Em", notes: ["E2", "B2", "E3", "G3"] },
        { name: "C", notes: ["C2", "C3", "E3", "G3"] },
        { name: "D", notes: ["D2", "A2", "D3", "F3"] }
      ]
    },
    songBetter: {
      name: "Song B progression (C area)",
      description: "C – G – Am – F · mid-low male",
      chords: [
        { name: "C", notes: ["C2", "G2", "C3", "E3"] },
        { name: "G", notes: ["G2", "B2", "D3", "G3"] },
        { name: "Am", notes: ["A2", "C3", "E3", "A3"] },
        { name: "F", notes: ["F2", "C3", "F3", "A3"] }
      ]
    },
    /** Wider root jumps — trains larger intonation moves on the highway */
    progJump1: {
      name: "Wide jumps · C–E–Am–G",
      description: "C – E – Am – G · bigger root leaps (3rds–5ths)",
      wide: true,
      chords: [
        { name: "C", notes: ["C2", "C3", "E3", "G3"] },
        { name: "E", notes: ["E2", "B2", "E3", "G3"] },
        { name: "Am", notes: ["A2", "C3", "E3", "A3"] },
        { name: "G", notes: ["G2", "B2", "D3", "G3"] }
      ]
    },
    progJump2: {
      name: "Wide jumps · Am–F–C–E",
      description: "Am – F – C – E · pop leap progression",
      wide: true,
      chords: [
        { name: "Am", notes: ["A2", "C3", "E3", "A3"] },
        { name: "F", notes: ["F2", "C3", "F3", "A3"] },
        { name: "C", notes: ["C2", "E3", "G3", "C4"] },
        { name: "E", notes: ["E2", "B2", "E3", "G3"] }
      ]
    },
    progJump3: {
      name: "Wide jumps · D–Bb–F–C",
      description: "D – Bb – F – C · larger horizontal jumps",
      wide: true,
      chords: [
        { name: "D", notes: ["D2", "A2", "D3", "F3"] },
        { name: "Bb", notes: ["Bb2", "D3", "F3", "Bb3"] },
        { name: "F", notes: ["F2", "C3", "F3", "A3"] },
        { name: "C", notes: ["C2", "G2", "C3", "E3"] }
      ]
    },
    progJump4: {
      name: "Octave span · G–Em–C–D",
      description: "G – Em – C – D with open voicings (wide range on highway)",
      wide: true,
      chords: [
        { name: "G", notes: ["G2", "B2", "D3", "G3", "B3"] },
        { name: "Em", notes: ["E2", "B2", "E3", "G3", "B3"] },
        { name: "C", notes: ["C2", "G2", "C3", "E3", "G3"] },
        { name: "D", notes: ["D2", "A2", "D3", "F3", "A3"] }
      ]
    }
  };

  function progressionMidiRange(prog, noteMap) {
    const map = noteMap || NOTE_FREQ;
    let min = Infinity;
    let max = -Infinity;
    const all = [];
    (prog.chords || []).forEach((ch) => {
      (ch.notes || []).forEach((n) => {
        const f = map[n];
        if (!f) return;
        const midi = 69 + 12 * Math.log2(f / 440);
        min = Math.min(min, midi);
        max = Math.max(max, midi);
        all.push({ name: n, freq: f, midi });
      });
    });
    if (!isFinite(min)) return { minMidi: 48, maxMidi: 60, notes: [] };
    // pad half step each side
    return { minMidi: min - 1, maxMidi: max + 1, notes: all };
  }

  /** One shared AudioContext for piano + mic analysis (avoids post-mic silence). */
  function getAudioContextCtor() {
    return global.AudioContext || global.webkitAudioContext || null;
  }

  function getSharedAudioContext() {
    const existing = global.VTSharedAudioCtx;
    if (existing && existing.state !== "closed") return existing;
    const AC = getAudioContextCtor();
    if (!AC) throw new Error("Web Audio API not available");
    // Prefer default latency; Safari iOS is picky about options
    let ctx;
    try {
      ctx = new AC({ latencyHint: "interactive" });
    } catch {
      ctx = new AC();
    }
    global.VTSharedAudioCtx = ctx;
    return ctx;
  }

  /** Safari rejects exponentialRamp if value ≤ 0; keep a tiny floor. */
  const GAIN_EPS = 0.0001;
  function safeExpRamp(param, value, time) {
    const v = Math.max(GAIN_EPS, Number(value) || GAIN_EPS);
    try {
      param.exponentialRampToValueAtTime(v, time);
    } catch {
      try {
        param.linearRampToValueAtTime(v, time);
      } catch {
        try {
          param.setValueAtTime(v, time);
        } catch {
          /* ignore */
        }
      }
    }
  }

  function uaFlags() {
    const ua = (global.navigator && navigator.userAgent) || "";
    return {
      safari: /Safari/i.test(ua) && !/Chrome|CriOS|Chromium|Edg|OPR|Firefox/i.test(ua),
      ios: /iPhone|iPad|iPod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1),
      firefox: /Firefox/i.test(ua),
      edge: /Edg/i.test(ua),
      opera: /OPR|Opera/i.test(ua),
      chrome: /Chrome|CriOS|Chromium/i.test(ua) && !/Edg|OPR/i.test(ua),
      android: /Android/i.test(ua)
    };
  }

  class PianoEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.comp = null;
      this.playing = [];
      this.loopTimer = null;
      this.loopActive = false;
      this.onChordChange = null;
      this._monitor = null; // AnalyserNode on master for audibility checks
      this._visibilityBound = false;
    }

    _wireGraph(ctx) {
      this.ctx = ctx;
      global.VTSharedAudioCtx = ctx;
      this.master = ctx.createGain();
      this.master.gain.value = 0.7;
      this.comp = ctx.createDynamicsCompressor();
      this.comp.threshold.value = -18;
      this.comp.knee.value = 12;
      this.comp.ratio.value = 4;
      this.comp.attack.value = 0.003;
      this.comp.release.value = 0.25;
      this.master.connect(this.comp);
      this.comp.connect(ctx.destination);
      this._monitor = ctx.createAnalyser();
      this._monitor.fftSize = 1024;
      try {
        this.master.connect(this._monitor);
      } catch {
        /* already connected */
      }
      this._bindVisibilityResume();
    }

    /**
     * iOS Safari / mobile Chrome suspend or "interrupt" AudioContext on tab
     * background / silent switch / lock — resume on foreground.
     */
    _bindVisibilityResume() {
      if (this._visibilityBound || typeof document === "undefined") return;
      this._visibilityBound = true;
      const nudge = () => {
        this.resume().catch(() => {});
      };
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") nudge();
      });
      // pageshow fires on bfcache restore (Safari)
      global.addEventListener?.("pageshow", nudge);
      // iOS audio session interruptions
      global.addEventListener?.("focus", nudge);
      document.addEventListener("pointerdown", () => {
        // Opportunistic unlock on any user gesture (Safari policy)
        if (this.ctx && (this.ctx.state === "suspended" || this.ctx.state === "interrupted")) {
          this.resume().catch(() => {});
        }
      }, { passive: true });
    }

    async ensure() {
      // Recreate when missing OR closed (PracticeEngine used to close a twin ctx;
      // a closed context stays non-null and permanently silences the piano).
      if (!this.ctx || this.ctx.state === "closed") {
        this.playing = [];
        this.master = null;
        this.comp = null;
        this._monitor = null;
        this._wireGraph(getSharedAudioContext());
      }
      // Safari iOS: "suspended" | "interrupted"; both need resume()
      if (this.ctx.state === "suspended" || this.ctx.state === "interrupted") {
        try {
          await this.ctx.resume();
        } catch (e) {
          console.warn("Piano ensure resume failed", e);
        }
      }
      // Graph may have been lost if context was recreated mid-session
      if (!this.master || !this.comp) {
        this._wireGraph(this.ctx);
      }
      if (this.master && this.master.gain.value < 0.2) {
        try {
          this.master.gain.cancelScheduledValues(this.ctx.currentTime);
          this.master.gain.setValueAtTime(0.7, this.ctx.currentTime);
        } catch {
          this.master.gain.value = 0.7;
        }
      }
      return this.ctx;
    }

    /**
     * Call inside a user-gesture handler to unlock Web Audio
     * (Safari, Chrome, Firefox, Edge, Opera, mobile WebViews).
     * Buffer-source blip is more reliable than oscillator-only on some WebKit builds.
     */
    async unlock() {
      await this.ensure();
      try {
        if (this.ctx.state === "suspended" || this.ctx.state === "interrupted") {
          await this.ctx.resume();
        }
      } catch {
        /* ignore */
      }
      // Dual prime: silent buffer + tiny oscillator (covers WebKit + Gecko quirks)
      try {
        const t = this.ctx.currentTime;
        const frames = Math.max(1, Math.floor(this.ctx.sampleRate * 0.02));
        const buf = this.ctx.createBuffer(1, frames, this.ctx.sampleRate);
        const data = buf.getChannelData(0);
        for (let i = 0; i < frames; i++) data[i] = (i < 8 ? 0.0003 : 0);
        const src = this.ctx.createBufferSource();
        src.buffer = buf;
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0.001, t);
        src.connect(g);
        g.connect(this.master || this.ctx.destination);
        src.start(t);
        src.stop(t + 0.02);
      } catch (e) {
        console.warn("Piano unlock buffer blip failed", e);
      }
      try {
        const t = this.ctx.currentTime;
        const osc = this.ctx.createOscillator();
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(GAIN_EPS, t);
        osc.frequency.setValueAtTime(440, t);
        osc.connect(g);
        g.connect(this.master || this.ctx.destination);
        osc.start(t);
        osc.stop(t + 0.03);
      } catch (e) {
        console.warn("Piano unlock osc blip failed", e);
      }
      // Second resume after scheduling (Safari sometimes needs it)
      try {
        if (this.ctx.state !== "running") await this.ctx.resume();
      } catch {
        /* ignore */
      }
      return this.ctx?.state === "running" || this.ctx?.state === "suspended";
    }

    /** Peak absolute sample on master bus (0 if silent / not ready). */
    outputPeak() {
      if (!this._monitor) return 0;
      const buf = new Float32Array(this._monitor.fftSize);
      try {
        this._monitor.getFloatTimeDomainData(buf);
      } catch {
        return 0;
      }
      let peak = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = Math.abs(buf[i]);
        if (v > peak) peak = v;
      }
      return peak;
    }

    /** True if context running and we recently scheduled voices. */
    isLive() {
      return !!(
        this.ctx &&
        this.ctx.state === "running" &&
        this.master &&
        (this.loopActive || (this.playing && this.playing.length > 0))
      );
    }

    /**
     * Additive piano-like partials with hammer noise burst + exponential decay.
     */
    playNote(freq, when, duration = 1.4, velocity = 0.48, sustain = false) {
      const ctx = this.ctx;
      if (!ctx || !this.master) {
        console.warn("Piano playNote: context not ready");
        return null;
      }
      const t0 = when != null ? when : ctx.currentTime + 0.02;
      const partials = [
        { mul: 1, gain: 1.0, type: "sine" },
        { mul: 2, gain: 0.42, type: "sine" },
        { mul: 3, gain: 0.18, type: "sine" },
        { mul: 4, gain: 0.09, type: "sine" },
        { mul: 5, gain: 0.045, type: "sine" },
        { mul: 6, gain: 0.025, type: "triangle" },
        { mul: 0.5, gain: 0.12, type: "sine" } // sub for body
      ];

      const noteGain = ctx.createGain();
      noteGain.connect(this.master);
      // Cross-browser envelope: never ramp to 0 (Safari throws / mutes)
      try {
        noteGain.gain.setValueAtTime(GAIN_EPS, t0);
      } catch {
        noteGain.gain.value = GAIN_EPS;
      }
      const vel = Math.max(GAIN_EPS, velocity || 0.4);
      safeExpRamp(noteGain.gain, vel, t0 + 0.012);
      if (sustain && duration >= 2.5) {
        // Hold near full level so students can home in for 3–5s, then gentle release
        const holdEnd = t0 + Math.max(0.2, duration - 0.45);
        safeExpRamp(noteGain.gain, vel * 0.72, t0 + 0.06);
        try {
          noteGain.gain.setValueAtTime(Math.max(GAIN_EPS, vel * 0.68), holdEnd);
        } catch {
          /* ignore */
        }
        safeExpRamp(noteGain.gain, GAIN_EPS, t0 + duration);
      } else {
        safeExpRamp(noteGain.gain, vel * 0.55, t0 + 0.08);
        safeExpRamp(noteGain.gain, GAIN_EPS, t0 + duration);
      }

      const nodes = [];
      for (const p of partials) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        // slight inharmonicity like real piano strings
        const detune = (p.mul > 1 ? (p.mul - 1) * 0.8 : 0);
        osc.type = p.type;
        osc.frequency.setValueAtTime(freq * p.mul + detune, t0);
        g.gain.value = p.gain;
        osc.connect(g);
        g.connect(noteGain);
        osc.start(t0);
        osc.stop(t0 + duration + 0.05);
        nodes.push(osc);
      }

      // soft hammer noise
      const noiseDur = 0.03;
      const bufferSize = Math.floor(ctx.sampleRate * noiseDur);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const ng = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = Math.min(freq * 4, 4000);
      filter.Q.value = 1.2;
      ng.gain.value = velocity * 0.15;
      noise.connect(filter);
      filter.connect(ng);
      ng.connect(noteGain);
      noise.start(t0);
      noise.stop(t0 + noiseDur);

      this.playing.push(...nodes);
      return noteGain;
    }

    playChord(noteNames, duration = 1.6, when = null, velocity = 0.4, sustain = false) {
      const t = when != null ? when : this.ctx.currentTime + 0.02;
      noteNames.forEach((n, i) => {
        const f = NOTE_FREQ[n];
        if (!f) return;
        // slight roll from low to high for realism
        this.playNote(f, t + i * 0.012, duration, velocity * (1 - i * 0.04), sustain);
      });
    }

    async playRefPitch(noteName = "A2", duration = 2.0, sustain = true) {
      await this.ensure();
      const f = NOTE_FREQ[noteName] || NOTE_FREQ.A2;
      this.playNote(f, this.ctx.currentTime + 0.02, duration, 0.5, sustain);
      return f;
    }

    async playSustainedNote(noteName = "C3", duration = 4.0) {
      return this.playRefPitch(noteName, duration, true);
    }

    async playInhaleTicks(seconds = 3) {
      await this.ensure();
      const t0 = this.ctx.currentTime + 0.05;
      for (let i = 0; i < seconds; i++) {
        this.playNote(NOTE_FREQ.C3, t0 + i, 0.12, 0.25);
      }
    }

    stopAll() {
      this.loopActive = false;
      if (this.loopTimer) {
        clearTimeout(this.loopTimer);
        this.loopTimer = null;
      }
      // Stop scheduled oscillators at *now* (stop(0) is wrong once context time > 0)
      const now = this.ctx ? this.ctx.currentTime : 0;
      try {
        (this.playing || []).forEach((n) => {
          try {
            if (n.stop) n.stop(now);
          } catch {
            /* already stopped / invalid when */
          }
        });
      } catch {
        /* ignore */
      }
      this.playing = [];
      if (this.ctx && this.master) {
        this.master.gain.cancelScheduledValues(now);
        // Keep master audible for the next Start
        this.master.gain.setValueAtTime(0.7, now);
      }
    }

    /** Resume context after mic prompt / tab blur (common silent-piano bug). */
    async resume() {
      if (!this.ctx) return this.ensure();
      if (this.ctx.state === "suspended" || this.ctx.state === "interrupted") {
        try {
          await this.ctx.resume();
        } catch (e) {
          console.warn("Piano resume failed", e);
        }
      }
      if (this.master) {
        const t = this.ctx.currentTime;
        try {
          this.master.gain.cancelScheduledValues(t);
          this.master.gain.setValueAtTime(0.7, t);
        } catch {
          try {
            this.master.gain.value = 0.7;
          } catch {
            /* ignore */
          }
        }
      }
      return this.ctx;
    }

    /** Browser capability snapshot for diagnostics / e2e. */
    capabilities() {
      const flags = uaFlags();
      return {
        ...flags,
        hasAudioContext: !!getAudioContextCtor(),
        hasMediaDevices: !!(global.navigator && navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        hasMediaRecorder: typeof global.MediaRecorder !== "undefined",
        ctxState: this.ctx?.state || "none",
        sampleRate: this.ctx?.sampleRate || null
      };
    }

    getProgressions() {
      return PROGRESSIONS;
    }

    async playProgression(
      progId,
      {
        loop = false,
        chordSec = 2.0,
        arpeggio = false,
        /** oneNote: melodic — play & target one pitch at a time (not stacked chords) */
        oneNote = false,
        sustain = false,
        sustainSec = 4.0,
        /** Whole-octave transpose for singer range (−2…+2 typical) */
        octaveShift = 0
      } = {}
    ) {
      await this.ensure();
      await this.resume();
      // If still not running (autoplay policy), try unlock path once
      if (this.ctx && this.ctx.state !== "running") {
        await this.unlock();
      }
      this.stopAll();
      // Ensure context is running after stopAll
      if (this.ctx.state === "suspended") {
        try {
          await this.ctx.resume();
        } catch {
          /* ignore */
        }
      }
      if (this.ctx.state === "closed") {
        await this.ensure();
      }
      if (this.master) this.master.gain.setValueAtTime(0.7, this.ctx.currentTime);
      const baseProg = PROGRESSIONS[progId];
      if (!baseProg) {
        console.warn("Unknown progression", progId);
        return null;
      }
      const oct = Math.round(Number(octaveShift) || 0);
      this._lastOctaveShift = oct;
      // Play + callbacks use transposed copy so highway targets match audio
      const prog = transposeProgression(baseProg, oct);

      // Hold duration from combobox (3–5s) or chordSec when sustain is off
      let stepSec = Number(chordSec) || 2.2;
      if (sustain || oneNote) {
        // one-note mode always uses the 3s/4s/5s control (per note, not per chord)
        stepSec = Math.max(1.5, Math.min(5.5, Number(sustainSec) || Number(chordSec) || 4));
      }

      // Flatten to sequential note events when oneNote (or arpeggio for audio + single targets)
      const melodic = !!oneNote;
      const broken = melodic || !!arpeggio;

      const playOnce = () => {
        if (!this.loopActive && loop) return;
        const t0 = this.ctx.currentTime + 0.05;

        if (melodic) {
          // Strict one-note-at-a-time: combobox duration applies to EACH note
          // (not divided across tones of a chord)
          const events = [];
          prog.chords.forEach((ch, cidx) => {
            (ch.notes || []).forEach((n) => {
              events.push({ note: n, chord: ch, cidx });
            });
          });
          const noteSec = Math.max(0.55, stepSec);
          const holdEnv = sustain || noteSec >= 2.5;
          events.forEach((ev, ei) => {
            const when = t0 + ei * noteSec;
            const f = NOTE_FREQ[ev.note];
            if (f) {
              // Slightly hotter than stacked chord voices so 1-nota stays clearly audible
              this.playNote(f, when, Math.max(0.45, noteSec * 0.95), 0.55, holdEnv);
            }
            if (this.onChordChange || this.onNoteChange) {
              const delay = Math.max(0, (when - this.ctx.currentTime) * 1000);
              setTimeout(() => {
                const mini = { name: ev.chord.name, notes: [ev.note], oneNote: true };
                if (this.onNoteChange) this.onNoteChange(ev.note, ev.chord, ei, prog);
                if (this.onChordChange) this.onChordChange(mini, ev.cidx, prog, { oneNote: true, noteName: ev.note });
              }, delay);
            }
          });
          const total = events.length * noteSec * 1000 + 50;
          if (loop) {
            this.loopTimer = setTimeout(() => {
              if (this.loopActive) playOnce();
            }, total);
          }
          return;
        }

        prog.chords.forEach((ch, idx) => {
          const when = t0 + idx * stepSec;
          if (broken) {
            const noteStep = sustain ? Math.min(0.35, stepSec / (ch.notes.length + 1)) : 0.18;
            ch.notes.forEach((n, ni) => {
              const f = NOTE_FREQ[n];
              if (f) {
                const dur = sustain
                  ? stepSec - ni * noteStep * 0.15
                  : stepSec - ni * 0.1;
                this.playNote(f, when + ni * noteStep, Math.max(0.4, dur), 0.38, sustain);
              }
            });
          } else {
            this.playChord(ch.notes, stepSec * (sustain ? 0.98 : 0.95), when, 0.42, sustain);
          }
          if (this.onChordChange) {
            const delay = Math.max(0, (when - this.ctx.currentTime) * 1000);
            setTimeout(() => {
              if (this.onChordChange) this.onChordChange(ch, idx, prog, { oneNote: false });
            }, delay);
          }
        });
        const total = prog.chords.length * stepSec * 1000 + 50;
        if (loop) {
          this.loopTimer = setTimeout(() => {
            if (this.loopActive) playOnce();
          }, total);
        }
      };

      this.loopActive = !!loop;
      playOnce();
      return prog;
    }
  }

  global.VTPiano = new PianoEngine();
  global.VT_PROGRESSIONS = PROGRESSIONS;
  global.VT_NOTE_FREQ = NOTE_FREQ;
  global.VTProgressionRange = progressionMidiRange;
  global.VTShiftNoteName = shiftNoteName;
  global.VTShiftNoteNames = shiftNoteNames;
  global.VTTransposeProgression = transposeProgression;
  global.VTFreqForNote = freqForNote;
  global.VTGetSharedAudioContext = getSharedAudioContext;
  global.VTAudioUaFlags = uaFlags;
})(window);
