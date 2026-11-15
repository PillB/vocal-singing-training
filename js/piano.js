/**
 * Realistic multi-partial piano for mid-lower male practice range.
 * Roots and voicings sit roughly C2–E4 (baritone-friendly) by default;
 * octave shift (±2) can move material into other singers' ranges.
 */
(function (global) {
  "use strict";

  /** Build chromatic map C0–B8 so every octave-shifted progression (±2) resolves. */
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
    for (let oct = 0; oct <= 8; oct++) {
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
      descriptionEs: "C – Am – F – G · pop clásico",
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
      nameEs: "Progresión canción A (G)",
      description: "G – Em – C – D · mid-low male",
      descriptionEs: "G – Em – C – D · registro medio-bajo masculino",
      chords: [
        { name: "G", notes: ["G2", "B2", "D3", "G3"] },
        { name: "Em", notes: ["E2", "B2", "E3", "G3"] },
        { name: "C", notes: ["C2", "C3", "E3", "G3"] },
        { name: "D", notes: ["D2", "A2", "D3", "F3"] }
      ]
    },
    songBetter: {
      name: "Song B progression (C area)",
      nameEs: "Progresión canción B (C)",
      description: "C – G – Am – F · mid-low male",
      descriptionEs: "C – G – Am – F · registro medio-bajo masculino",
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
      nameEs: "Saltos · C–E–Am–G",
      description: "C – E – Am – G · bigger root leaps (3rds–5ths)",
      descriptionEs: "C – E – Am – G · saltos de fundamental más grandes (3.ª–5.ª)",
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
      nameEs: "Saltos · Am–F–C–E",
      description: "Am – F – C – E · pop leap progression",
      descriptionEs: "Am – F – C – E · progresión pop con saltos",
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
      nameEs: "Saltos · D–Bb–F–C",
      description: "D – Bb – F – C · larger horizontal jumps",
      descriptionEs: "D – Bb – F – C · saltos horizontales más grandes",
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
      nameEs: "Octava · G–Em–C–D",
      description: "G – Em – C – D with open voicings (wide range on highway)",
      descriptionEs: "G – Em – C – D con acordes abiertos (rango amplio en la autopista de notas)",
      wide: true,
      chords: [
        { name: "G", notes: ["G2", "B2", "D3", "G3", "B3"] },
        { name: "Em", notes: ["E2", "B2", "E3", "G3", "B3"] },
        { name: "C", notes: ["C2", "G2", "C3", "E3", "G3"] },
        { name: "D", notes: ["D2", "A2", "D3", "F3", "A3"] }
      ]
    },
    /** Pro-only packs — new content (does not lock free progressions) */
    progPro1: {
      name: "Pro · Modal colors (Am–F–G–Em)",
      nameEs: "Pro · Color modal (Am–F–G–Em)",
      description: "Am – F – G – Em · color changes for expressive singing (Pro)",
      descriptionEs: "Am – F – G – Em · cambios de color para cantar con expresión (Pro)",
      proOnly: true,
      wide: true,
      chords: [
        { name: "Am", notes: ["A2", "C3", "E3", "A3"] },
        { name: "F", notes: ["F2", "A2", "C3", "F3"] },
        { name: "G", notes: ["G2", "B2", "D3", "G3"] },
        { name: "Em", notes: ["E2", "G2", "B2", "E3"] }
      ]
    },
    progPro2: {
      name: "Pro · Ladder leaps (C–G–Am–Em)",
      nameEs: "Pro · Escalera (C–G–Am–Em)",
      description: "C – G – Am – Em · larger horizontal jumps for pitch agility (Pro)",
      descriptionEs: "C – G – Am – Em · saltos horizontales más grandes para la agilidad de afinación (Pro)",
      proOnly: true,
      wide: true,
      chords: [
        { name: "C", notes: ["C2", "E3", "G3", "C4"] },
        { name: "G", notes: ["G2", "B2", "D3", "G3"] },
        { name: "Am", notes: ["A2", "C3", "E3", "A3"] },
        { name: "Em", notes: ["E2", "B2", "E3", "G3"] }
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
  // iOS can keep resume() pending through a call or an "interrupted"
  // session. A Start that awaits it would wait forever with the microphone
  // granted; past this the piano reports "not running" and Start goes on
  // (the engine's own resume wait then offers Retry).
  const RESUME_WAIT_MS = 8000;
  // A resume asked for while an earlier one is still pending past its 8 s
  // still gets this long: the interruption may just have ended.
  const RESUME_RETRY_MS = 250;
  const clockNow = () => (typeof performance !== "undefined" ? performance.now() : Date.now());

  /** Wait for `promise` at most `ms`; true if it settled in time. */
  function settledWithin(promise, ms) {
    let timer;
    const late = new Promise((resolve) => {
      timer = setTimeout(() => resolve(false), ms);
    });
    return Promise.race([Promise.resolve(promise).then(() => true, () => true), late]).finally(() => clearTimeout(timer));
  }
  /**
   * How long each chord (or each note, one at a time) sounds: the 3/4/5 s
   * control when held or one note at a time, else chordSec.
   */
  function stepSeconds(chordSec, held, sustainSec) {
    if (!held) return Number(chordSec) || 2.2;
    return Math.max(1.5, Math.min(5.5, Number(sustainSec) || Number(chordSec) || 4));
  }
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

  /**
   * A note's loudness over time. Cross-browser: never ramps to 0 (Safari throws
   * or mutes). A sustained note holds near full level so students can home in
   * for 3–5 s, then releases gently.
   */
  function noteEnvelope(gain, t0, duration, velocity, sustain) {
    try {
      gain.setValueAtTime(GAIN_EPS, t0);
    } catch {
      gain.value = GAIN_EPS;
    }
    const vel = Math.max(GAIN_EPS, velocity || 0.4);
    safeExpRamp(gain, vel, t0 + 0.012);
    if (sustain && duration >= 2.5) {
      const holdEnd = t0 + Math.max(0.2, duration - 0.45);
      safeExpRamp(gain, vel * 0.72, t0 + 0.06);
      try {
        gain.setValueAtTime(Math.max(GAIN_EPS, vel * 0.68), holdEnd);
      } catch {
        /* ignore */
      }
      safeExpRamp(gain, GAIN_EPS, t0 + duration);
    } else {
      safeExpRamp(gain, vel * 0.55, t0 + 0.08);
      safeExpRamp(gain, GAIN_EPS, t0 + duration);
    }
  }

  /** The soft hammer noise at a note's start: its source, which the caller stops with the strings. */
  function hammerNoise(ctx, freq, t0, velocity, out) {
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
    ng.connect(out);
    noise.start(t0);
    noise.stop(t0 + noiseDur);
    return noise;
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
      this._observedContexts = new WeakSet();
      this.onStateChange = null;
      // Every Stop (stopAll) bumps this: a sound still waiting for a held context when the
      // learner stopped is dropped, not played after the Stop under the next exercise
      this._stopGen = 0;
      // Every progression asked for bumps this: the newest plays, an older one still waiting is dropped
      this._progGen = 0;
      // Every silence bumps this: a pass's chord and note timers that fire after it announce nothing
      this._passGen = 0;
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
      if (!this._observedContexts.has(ctx)) {
        this._observedContexts.add(ctx);
        ctx.addEventListener?.("statechange", () => {
          // A retired iOS context can close *after* its replacement starts.
          // Do not let that stale event override the new graph's UI state.
          if (this.ctx !== ctx) return;
          if (ctx.state === "running") this._resumeWait = null;
          this.onStateChange?.(ctx.state);
        });
      }
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
          this.unlock().catch(() => {});
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
          await this._awaitResume(this.ctx.resume(), "Piano ensure resume failed");
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

    /** User-tap recovery for WebKit's running-but-frozen render clock. */
    rebuildStalledContext() {
      const AC = getAudioContextCtor();
      if (!AC) return false;
      let fresh;
      try { fresh = new AC({ latencyHint: "interactive" }); }
      catch {
        try { fresh = new AC(); } catch { return false; }
      }
      const retired = this.ctx;
      this._silence();
      this._wireGraph(fresh);
      try { retired?.close?.()?.catch?.(() => {}); } catch { /* old Safari device may be stuck */ }
      // Both playback sources are scheduled synchronously in the tap, before
      // a resume promise can yield and lose Safari's transient activation.
      this._primeSoundSync();
      if (fresh.state !== "running") fresh.resume().catch(() => {});
      return true;
    }

    /**
     * Call inside a user-gesture handler to unlock Web Audio
     * (Safari, Chrome, Firefox, Edge, Opera, mobile WebViews).
     * Buffer-source blip is more reliable than oscillator-only on some WebKit builds.
     */
    _unlockGraphSync() {
      if (!this.ctx || this.ctx.state === "closed") {
        this.playing = [];
        this.master = null;
        this.comp = null;
        this._monitor = null;
        this._wireGraph(getSharedAudioContext());
      } else if (!this.master || !this.comp) {
        this._wireGraph(this.ctx);
      }
    }

    _primeSoundSync() {
      // Both sources MUST start before the first await: iOS can revoke the
      // transient user activation when an AudioContext.resume promise yields.
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
    }

    /**
     * Wait for `resuming` (this.ctx.resume()) at most RESUME_WAIT_MS; true if
     * it settled. iOS can hold every resume through a call or Siri, and Start
     * asks for one at each piano step (unlock, ensure, resume, the
     * progression's own): every resume of this context shares the first
     * one's 8 s, so a held session costs Start one wait, not one per step.
     */
    _awaitResume(resuming, what) {
      const ctx = this.ctx;
      const now = clockNow();
      const held = this._resumeWait?.ctx === ctx ? this._resumeWait : null;
      if (!held) this._resumeWait = { ctx, until: now + RESUME_WAIT_MS };
      const done = () => {
        if (this._resumeWait?.ctx === ctx) this._resumeWait = null;
      };
      Promise.resolve(resuming).then(done, (e) => {
        console.warn(what, e);
        done();
      });
      const left = held ? Math.max(RESUME_RETRY_MS, held.until - now) : RESUME_WAIT_MS;
      return settledWithin(resuming, left);
    }

    async unlock() {
      this._unlockGraphSync();
      // Invoke resume during the tap too; awaiting it comes only after both
      // sound sources are scheduled under the original user activation.
      let resumed;
      try {
        if (["suspended", "interrupted"].includes(this.ctx.state)) {
          resumed = this.ctx.resume();
        }
      } catch (e) {
        console.warn("Piano gesture resume failed", e);
      }
      this._primeSoundSync();
      if (resumed && !(await this._awaitResume(resumed, "Piano gesture resume rejected"))) return false;
      // Second resume after scheduling (Safari sometimes needs it)
      try {
        if (this.ctx.state !== "running") await this._awaitResume(this.ctx.resume(), "Piano second resume failed");
      } catch {
        /* ignore */
      }
      return this.ctx?.state === "running";
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

    /**
     * True while a note is actually sounding (or within `tailSec` after it),
     * for modes that must not count the piano bleeding into the mic as the
     * learner's voice. `playing` keeps every voice until stopAll(), so it
     * can't answer this.
     */
    isSounding(tailSec = 0.25) {
      if (!this.ctx || this.ctx.state !== "running") return false;
      if (this.loopActive) return true;
      // Nothing scheduled yet (or stopAll): silent, even in the context's first tailSec
      if (!this.soundingUntil) return false;
      return this.ctx.currentTime < this.soundingUntil + tailSec;
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
      noteEnvelope(noteGain.gain, t0, duration, velocity, sustain);

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
      // When the last scheduled voice ends, in context time (see isSounding)
      this.soundingUntil = Math.max(this.soundingUntil || 0, t0 + duration + 0.05);

      const noise = hammerNoise(ctx, freq, t0, velocity, noteGain);

      // The hammer noise too: a pass schedules every chord up front, and a Stop must silence them all
      this.playing.push(...nodes, noise);
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
      const asked = this._stopGen;
      await this.ensure();
      if (asked !== this._stopGen) return null; // stopped while the context resumed
      const f = NOTE_FREQ[noteName] || NOTE_FREQ.A2;
      this.playNote(f, this.ctx.currentTime + 0.02, duration, 0.5, sustain);
      return f;
    }

    async playSustainedNote(noteName = "C3", duration = 4.0) {
      return this.playRefPitch(noteName, duration, true);
    }

    async playInhaleTicks(seconds = 3) {
      const asked = this._stopGen;
      await this.ensure();
      if (asked !== this._stopGen) return false;
      const t0 = this.ctx.currentTime + 0.05;
      for (let i = 0; i < seconds; i++) {
        this.playNote(NOTE_FREQ.C3, t0 + i, 0.12, 0.25);
      }
      return true;
    }

    /** The learner's Stop: silence now, and drop every sound still waiting for its context. */
    stopAll() {
      this._stopGen += 1;
      this._silence();
    }

    /** Every voice and the loop off, now. Pending sounds keep their turn (a progression silences before it plays). */
    _silence() {
      this._passGen += 1;
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
      this.soundingUntil = 0;
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
          await this._awaitResume(this.ctx.resume(), "Piano resume failed");
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

    /**
     * The context running, the graph wired and the master up, before a
     * progression plays. Every resume here is bounded (_awaitResume), so a
     * session iOS holds cannot hold Start with it. False, before its silence,
     * when `stale()` says the call was dropped while it waited.
     */
    async _readyToPlay(stale) {
      await this.ensure();
      await this.resume();
      // If still not running (autoplay policy), try unlock path once
      if (this.ctx && this.ctx.state !== "running") {
        await this.unlock();
      }
      // A Stop, or a newer progression, came while the context was held: the silence below
      // would end the voices and the chord loop of whatever plays now
      if (stale()) return false;
      this._silence();
      // Ensure context is running after the silence
      if (this.ctx.state === "suspended") {
        try {
          await this._awaitResume(this.ctx.resume(), "Piano resume before playing failed");
        } catch {
          /* ignore */
        }
      }
      if (this.ctx.state === "closed") {
        await this.ensure();
      }
      if (this.master) this.master.gain.setValueAtTime(0.7, this.ctx.currentTime);
      return true;
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
      const asked = { stop: this._stopGen, prog: ++this._progGen };
      const stale = () => asked.stop !== this._stopGen || asked.prog !== this._progGen;
      // A Stop, or a newer progression, while this one waited for a held context
      if (!(await this._readyToPlay(stale)) || stale()) return null;
      const baseProg = PROGRESSIONS[progId];
      if (!baseProg) {
        console.warn("Unknown progression", progId);
        return null;
      }
      const oct = Math.round(Number(octaveShift) || 0);
      this._lastOctaveShift = oct;
      // Play + callbacks use transposed copy so highway targets match audio
      const prog = transposeProgression(baseProg, oct);

      const stepSec = stepSeconds(chordSec, sustain || oneNote, sustainSec);

      // Flatten to sequential note events when oneNote (or arpeggio for audio + single targets)
      const melodic = !!oneNote;
      const broken = melodic || !!arpeggio;

      const playOnce = () => {
        if (!this.loopActive && loop) return;
        const t0 = this.ctx.currentTime + 0.05;
        // A silence (Stop, or the next progression) ends this pass: its timers then tell no one of a chord
        const pass = this._passGen;

        if (melodic) {
          // Strict one-note-at-a-time: combobox duration applies to EACH note
          // (not divided across tones of a chord)
          const events = [];
          const pitchClass = (n) => String(n).replace(/-?\d+$/, "");
          prog.chords.forEach((ch, cidx) => {
            const notes = ch.notes || [];
            notes.forEach((n, i) => {
              // The voicing's left-hand bass doubles a chord tone an octave
              // down (C2 under C3): it is under the lanes and not a note to
              // sing, so one note at a time walks the tones above it.
              if (i === 0 && notes.length > 3 && notes.slice(1).some((m) => pitchClass(m) === pitchClass(n))) return;
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
                if (pass !== this._passGen) return;
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
              if (pass === this._passGen && this.onChordChange) this.onChordChange(ch, idx, prog, { oneNote: false });
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
