/**
 * A synthetic room and speaker for VTFeatures.Vad (js/voice-features.js),
 * frame by frame and with no audio: the level, gate and pitch the practice
 * engine would hand the Vad, built from a list of parts (speech, silence, a
 * held note, the Space assist) over a room bed, an optional fan and an
 * optional hum. Same seed, same frames, so a spec can say exactly how long a
 * pause measured.
 *
 * Injected into a page that has loaded js/voice-features.js:
 *   await page.addScriptTag({ path: require.resolve("./helpers/vad-sim.js") });
 *   const r = await page.evaluate((s) => VTVadSim.run(s), { parts: [...] });
 *
 * The engine model (js/practice-engine.js), all levels after the MIC gain:
 * - frames at 60 a second (or `fps`) with the browser's jitter (±0.55 ms),
 *   each frame's rms over the last 43 ms (2048 samples at 48 kHz);
 * - `sounding` is the engine's gate: rms ≥ holdRms (−46.3 dBFS at sensitivity
 *   7, −59.7 at 10), or ≥ 0.55 × holdRms with a pitch;
 * - `rawFreq` is null under −40 dBFS (the detector's own floor). Above it,
 *   it is the voice's pitch on voiced frames, the hum's (±2 %) where a hum
 *   carries the window, and a random value on any other: the detector has no
 *   clarity test and reports a pitch for a fan's noise too (measured 156 of
 *   156 frames);
 * - `clarity` (VTPitchUtils.clarity) at any level, from the share p of the
 *   window's power that has a period (voiced speech, a note, a hum):
 *   1 − (1 − cn)(1 − p)/(1 + 2.5p), toward cv (0.93–1) for the periodic part,
 *   with cn a noise's own 0.08–0.44 (white noise reads ~0.17, a low rumble up
 *   to ~0.45). The fit to the real function: a vowel or a hum under white
 *   noise as loud as itself reads ~0.8, at a fifth of the power ~0.55;
 * - the Space assist forces rms ≥ 0.06 and `sounding`, with no pitch.
 */
(function (global) {
  "use strict";

  const db2p = (db) => Math.pow(10, db / 10);

  function prng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /**
   * Parts, each { kind, sec, ... }:
   *  silence — the room alone
   *  speech  — syllables at `rate` a second: a consonant at `dip` dB, then a
   *            vowel rising to `peak` dB (±3 dB from one to the next) and
   *            sagging; `voicedCons` keeps the pitch through the consonant,
   *            and `stops` is the share of consonants that are a stop's
   *            closure, the room alone
   *  tone    — a held note at `level` dB with `vibDb` of level wobble and
   *            `vibCents` of pitch vibrato at 5.5 Hz
   *  space   — the Space assist held down
   * Returns a 1 kHz power envelope with a pitch per millisecond (0 = none).
   */
  function build(parts, rnd) {
    const p = [];
    const hz = [];
    const manual = [];
    const truth = [];
    let t = 0;
    parts.forEach((s) => {
      const n = Math.round(s.sec * 1000);
      const start = t;
      if (s.kind === "speech") {
        const peak = s.peak != null ? s.peak : -25;
        const dip = s.dip != null ? s.dip : -42;
        const rate = s.rate || 5;
        let i = 0;
        let semis = 0;
        while (i < n) {
          const sylMs = Math.round((1000 / rate) * (0.75 + 0.5 * rnd()));
          const consMs = Math.round(sylMs * (0.2 + 0.2 * rnd()));
          const pk = peak + (rnd() - 0.5) * 6;
          const dp = dip + (rnd() - 0.5) * 4;
          const stop = s.stops ? rnd() < s.stops : false;
          // Intonation moves a little from one syllable to the next
          semis = Math.max(-4, Math.min(4, semis + (rnd() - 0.5) * 3));
          const f0 = 135 * Math.pow(2, semis / 12);
          for (let k = 0; k < sylMs && i < n; k++, i++) {
            let db;
            let voiced;
            if (k < consMs) {
              db = stop ? -Infinity : dp;
              voiced = !!s.voicedCons && !stop;
            } else {
              const u = (k - consMs) / Math.max(1, sylMs - consMs);
              const shape = u < 0.2 ? u / 0.2 : 1 - 0.35 * ((u - 0.2) / 0.8);
              db = dp + (pk - dp) * Math.max(0, shape);
              voiced = true;
            }
            p.push(db2p(db));
            hz.push(voiced ? f0 : 0);
            manual.push(0);
          }
        }
      } else if (s.kind === "tone") {
        const level = s.level != null ? s.level : -24;
        for (let i = 0; i < n; i++) {
          const w = Math.sin(2 * Math.PI * 5.5 * ((start + i) / 1000));
          p.push(db2p(level + (s.vibDb != null ? s.vibDb : 1.5) * w));
          hz.push((s.hz || 220) * Math.pow(2, ((s.vibCents != null ? s.vibCents : 15) * w) / 1200));
          manual.push(0);
        }
      } else {
        for (let i = 0; i < n; i++) {
          p.push(0);
          hz.push(0);
          manual.push(s.kind === "space" ? 1 : 0);
        }
      }
      t += n;
      truth.push({ kind: s.kind, start: start / 1000, end: t / 1000 });
    });
    return { p, hz, manual, truth, ms: t };
  }

  const during = (x, i) => i / 1000 >= (x.from || 0) && i / 1000 < (x.until != null ? x.until : Infinity);

  /**
   * The room under everything: a bed, plus a fan and a hum (mains or a
   * motor: a steady tone at `hum.hz`) from their `from` seconds. `p` is all of
   * it, `hum` the part with a period.
   */
  function bed(env, rnd, ms) {
    const out = new Float64Array(ms);
    const hum = new Float64Array(ms);
    const room = env.room != null ? env.room : -62;
    const fan = env.fan || null;
    let wob = 0;
    for (let i = 0; i < ms; i++) {
      // A real fan's level wanders: ±1.5 dB frame to frame, as measured on
      // low-rumble noise through the engine (white noise is far steadier)
      if (i % 10 === 0) wob = (rnd() - 0.5) * 2 * (fan && fan.wobble != null ? fan.wobble : 4);
      let v = db2p(room + wob * 0.1);
      if (fan && during(fan, i)) v += db2p(fan.db + wob);
      if (env.hum && during(env.hum, i)) hum[i] = db2p(env.hum.db);
      out[i] = v + hum[i];
    }
    return { p: out, hum };
  }

  /**
   * Engine-like frames over the envelope. `crnd` is a second random stream
   * for clarity and the hum's pitch, so a seed gives the same levels and
   * gate as it did before they were modelled.
   */
  function frames(sig, room, env, rnd, crnd) {
    const sens = env.sens || 7;
    const holdRms = 0.008 * (1.55 - ((sens - 1) / 9) * 1.42);
    const out = [];
    let tf = 0;
    while (true) {
      const dtMs = 1000 / (env.fps || 60) + (rnd() - 0.5) * 1.1;
      tf += dtMs;
      const end = Math.floor(tf);
      if (end > sig.ms) break;
      let pw = 0;
      let c = 0;
      let voicedN = 0;
      let voicePw = 0;
      let periodicPw = 0;
      let humPw = 0;
      let manual = false;
      let f0 = 0;
      for (let k = Math.max(0, end - 43); k < end; k++) {
        pw += sig.p[k] + room.p[k];
        c++;
        if (sig.hz[k] > 0) periodicPw += sig.p[k];
        humPw += room.hum[k];
        if (sig.hz[k] > 0 && sig.p[k] > room.p[k]) {
          voicedN++;
          voicePw += sig.p[k];
          f0 = sig.hz[k];
        }
        if (sig.manual[k]) manual = true;
      }
      let rms = Math.sqrt(pw / Math.max(1, c));
      // The detector analyses nothing under −40 dBFS; above it, it finds the
      // voice when the voice carries most of the window, the hum when it
      // does, and makes a pitch up for anything else
      let rawFreq = null;
      if (rms >= 0.01) {
        if (voicedN > c * 0.5 && voicePw > 0) rawFreq = f0;
        else if (humPw > 0.5 * pw) rawFreq = env.hum.hz * (1 + (crnd() - 0.5) * 0.04);
        else rawFreq = 60 + rnd() * 440;
      }
      const p = pw > 0 ? (periodicPw + humPw) / pw : 0;
      const cn = 0.08 + 0.36 * crnd();
      const cv = 0.93 + 0.07 * crnd();
      const clarity = cv - ((cv - cn) * (1 - p)) / (1 + 2.5 * p);
      if (manual) {
        rms = Math.max(rms, 0.06);
        rawFreq = null;
      }
      const sounding = manual || rms >= holdRms || (rawFreq != null && rms >= holdRms * 0.55);
      out.push({ dtMs, rms, sounding, rawFreq, clarity, manualSound: manual, t: tf / 1000 });
    }
    return out;
  }

  function overlap(a0, a1, b0, b1) {
    return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  }

  /**
   * Run one take through a fresh Vad. spec: { parts, room (dB, default −62),
   * fan: { db, from, until, wobble }, hum: { db, hz, from, until }, sens,
   * fps, seed, at: [seconds to read the floor at] }.
   */
  function run(spec) {
    const F = global.VTFeatures;
    const seed = spec.seed != null ? spec.seed : 12345;
    const rnd = prng(seed);
    const sig = build(spec.parts, rnd);
    const room = bed(spec, rnd, sig.ms);
    const fr = frames(sig, room, spec, rnd, prng(seed ^ 0x5bd1e995));
    const ended = [];
    const takenBack = [];
    const vad = new F.Vad({
      onPauseEnd: (start, len) => ended.push({ start, len }),
      onTakeBack: (start) => takenBack.push(start)
    });
    const at = (spec.at || []).slice().sort((a, b) => a - b);
    const floorAt = {};
    fr.forEach((f) => {
      vad.feed(f);
      while (at.length && vad.t >= at[0]) floorAt[at.shift()] = Math.round(vad.floorDb * 10) / 10;
    });
    const T = vad.t;
    const voice = new Set(["speech", "tone", "space"]);
    const segs = vad.segments.map((g) => ({ kind: g.kind, start: g.start, end: g.end != null ? g.end : T }));
    // Speech read where there was only the room (a fan heard as a voice)
    let ghost = 0;
    segs.forEach((g) => {
      if (g.kind !== "speech") return;
      sig.truth.forEach((x) => {
        if (x.kind === "silence") ghost += overlap(g.start, g.end, x.start, x.end);
      });
    });
    // Pauses whose middle sits inside a voice part: silences that were not there
    const falsePauses = segs.filter((g) => {
      if (g.kind !== "pause") return false;
      const mid = (g.start + g.end) / 2;
      return sig.truth.some((x) => voice.has(x.kind) && mid > x.start && mid < x.end);
    }).length;
    // Each real silence between two voice parts, and the pause measured there
    const silences = [];
    sig.truth.forEach((x, i) => {
      if (x.kind !== "silence" || i === 0 || i === sig.truth.length - 1) return;
      const hit = ended.find((e) => overlap(e.start, e.start + e.len, x.start, x.end) > 0.5 * (x.end - x.start));
      silences.push({ start: x.start, sec: x.end - x.start, measured: hit ? hit.len : null });
    });
    return {
      T,
      talk: vad.talkSec,
      truthTalk: sig.truth.filter((x) => voice.has(x.kind)).reduce((s, x) => s + (x.end - x.start), 0),
      ghost,
      falsePauses,
      ended,
      takenBack,
      silences,
      floor: vad.floorDb,
      floorAt,
      state: vad.state,
      segs: segs.map((g) => `${g.kind[0]}${g.start.toFixed(2)}-${g.end.toFixed(2)}`).join(" ")
    };
  }

  global.VTVadSim = { run };
})(typeof window !== "undefined" ? window : globalThis);
