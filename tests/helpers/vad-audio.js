/**
 * A take as sound for VTFeatures.Vad (js/voice-features.js): samples built
 * from a list of parts over a room, framed as the practice engine frames the
 * microphone (js/practice-engine.js), each frame carrying its samples (`buf`)
 * and `sampleRate` as the engine sends them. The level sim
 * (tests/helpers/vad-sim.js) hands the Vad levels only, and the floor's
 * spectral rules (a white room, a held "sss") need the sound itself. Same
 * seed, same samples, same frames.
 *
 * Injected into a page that has loaded js/pitch-visualizer.js (for
 * VTPitchUtils.clarity) and js/voice-features.js:
 *   await page.addScriptTag({ path: require.resolve("./helpers/vad-audio.js") });
 *   const r = await page.evaluate((s) => VTVadAudio.run(s), { parts: [...] });
 *
 * The engine model, all levels after the MIC gain:
 * - frames at 60 a second with the browser's jitter (±0.55 ms), each the
 *   last frameSize(sr) samples (2048 at 44.1–48 kHz, 4096 at 96 kHz), copied
 *   into one array that the next frame writes over, as the engine's `buf`;
 * - `rms`, `hfRms` (the first difference's), and `clarity`
 *   (VTPitchUtils.clarity) from those samples;
 * - `rawFreq`: the voice's pitch where voiced speech carries the frame and
 *   it is over −40 dBFS, otherwise null (the Vad reads no pitch; the gate
 *   below does, under holdRms, where the detector reads nothing anyway);
 * - `sounding`: rms ≥ holdRms (−46.3 dBFS at sensitivity 7), or
 *   ≥ 0.55 × holdRms with a pitch.
 * `buf: false` sends the same frames without their samples (as the level
 * sim does): the Vad then has only levels to go on.
 */
(function (global) {
  "use strict";

  function prng(seed) {
    let s = seed >>> 0;
    return () => {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }
  const amp = (db) => Math.pow(10, db / 20);
  const frameSize = (sr) => {
    let n = 2048;
    while (n < 32768 && n < sr * 0.04) n *= 2;
    return n;
  };
  /** Uniform white noise at 1 rms. */
  function white(n, rnd) {
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) x[i] = (rnd() * 2 - 1) * Math.sqrt(3);
    return x;
  }
  /** Scaled in place to 1 rms. */
  function unit(x) {
    let s = 0;
    for (let i = 0; i < x.length; i++) s += x[i] * x[i];
    const k = s > 0 ? 1 / Math.sqrt(s / x.length) : 0;
    for (let i = 0; i < x.length; i++) x[i] *= k;
    return x;
  }
  /** A band-pass biquad (the browser's: 0 dB at `f`), in place. */
  function bandpass(x, f, q, sr) {
    const w = (2 * Math.PI * f) / sr;
    const al = Math.sin(w) / (2 * q);
    const a0 = 1 + al;
    const b0 = al / a0;
    const b2 = -al / a0;
    const a1 = (-2 * Math.cos(w)) / a0;
    const a2 = (1 - al) / a0;
    const y = new Float32Array(x.length);
    let x1 = 0;
    let x2 = 0;
    let y1 = 0;
    let y2 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = b0 * x[i] + b2 * x2 - a1 * y1 - a2 * y2;
      x2 = x1;
      x1 = x[i];
      y2 = y1;
      y1 = v;
      y[i] = v;
    }
    return y;
  }
  /** `order` one-pole high-passes (`hp`) or low-passes at `hz`, in place. */
  function onePole(x, hz, sr, order, hp) {
    const a = 1 - Math.exp((-2 * Math.PI * hz) / sr);
    for (let k = 0; k < order; k++) {
      let lp = 0;
      for (let i = 0; i < x.length; i++) {
        lp += a * (x[i] - lp);
        x[i] = hp ? x[i] - lp : lp;
      }
    }
    return x;
  }

  /**
   * Parts, each { kind, sec, ... }:
   *  silence — the room alone
   *  speech  — voiced syllables at `rate` (5) a second: a sawtooth at 135 Hz
   *            whose pitch moves up to ±4 semitones from one syllable to the
   *            next, through two low-passes at 2400 Hz (the qa voice), at
   *            `dip` dB between syllables rising to `peak` dB (±3 dB from one
   *            to the next) and sagging
   *  hiss    — noise through band-passes at `bands` (5000 and 7000 Hz) with
   *            a Q of `q` (1.2), syllables at 4.5 a second at `db` dipping
   *            `swingDb` (1.5) between them: a held "sss"
   * The room: white noise at `room` dB (−62) from the first sample, and a
   * `fan` { db, from, until, hp } from `from` s: white noise, or through four
   * one-pole high-passes at `hp` Hz (nothing under ~2 kHz: a hiss with no
   * low end). Returns the samples, the voice's pitch per sample (0: none)
   * and the parts' times.
   */
  function render(spec, rnd) {
    const sr = spec.sr || 48000;
    const pre = frameSize(sr);
    const sec = spec.parts.reduce((s, p) => s + p.sec, 0);
    const n = pre + Math.round(sec * sr);
    const wave = unit(white(n, rnd));
    const roomAmp = amp(spec.room != null ? spec.room : -62);
    for (let i = 0; i < n; i++) wave[i] *= roomAmp;
    const f0 = new Float32Array(n);
    const fan = spec.fan;
    if (fan) {
      let x = white(n, rnd);
      if (fan.hp) x = onePole(x, fan.hp, sr, 4, true);
      unit(x);
      const a = amp(fan.db);
      const i0 = pre + Math.round((fan.from || 0) * sr);
      const i1 = fan.until != null ? pre + Math.round(fan.until * sr) : n;
      const ramp = Math.round(0.02 * sr);
      for (let i = i0; i < i1; i++) wave[i] += x[i] * a * Math.min(1, (i - i0 + 1) / ramp);
    }
    const truth = [];
    let t = 0;
    spec.parts.forEach((p) => {
      const i0 = pre + Math.round(t * sr);
      const len = Math.round(p.sec * sr);
      if (p.kind === "speech") {
        const peak = p.peak != null ? p.peak : -25;
        const dip = p.dip != null ? p.dip : -42;
        const rate = p.rate || 5;
        const env = new Float32Array(len);
        const hz = new Float32Array(len);
        let i = 0;
        let semis = 0;
        while (i < len) {
          const syl = Math.round((sr / rate) * (0.75 + 0.5 * rnd()));
          const cons = Math.round(syl * (0.2 + 0.2 * rnd()));
          const pk = peak + (rnd() - 0.5) * 6;
          semis = Math.max(-4, Math.min(4, semis + (rnd() - 0.5) * 3));
          const f = 135 * Math.pow(2, semis / 12);
          for (let k = 0; k < syl && i < len; k++, i++) {
            let db = dip;
            if (k >= cons) {
              const u = (k - cons) / Math.max(1, syl - cons);
              const shape = u < 0.2 ? u / 0.2 : 1 - 0.35 * ((u - 0.2) / 0.8);
              db = dip + (pk - dip) * Math.max(0, shape);
            }
            env[i] = amp(db);
            hz[i] = f;
          }
        }
        // The sawtooth, its pitch gliding 20 ms into each new one
        const x = new Float32Array(len);
        let ph = 0;
        let g = hz[0];
        const glide = 1 - Math.exp(-1 / (0.02 * sr));
        for (let k = 0; k < len; k++) {
          g += (hz[k] - g) * glide;
          ph += g / sr;
          ph -= Math.floor(ph);
          x[k] = 2 * ph - 1;
        }
        unit(onePole(x, 2400, sr, 2, false));
        // a 5 ms fade in and out, so a phrase starts and stops without a click
        const fade = Math.round(0.005 * sr);
        for (let k = 0; k < len; k++) {
          const e = Math.min(1, (k + 1) / fade, (len - k) / fade);
          wave[i0 + k] += x[k] * env[k] * e;
          f0[i0 + k] = hz[k];
        }
      } else if (p.kind === "hiss") {
        const bands = p.bands || [5000, 7000];
        const raw = white(len, rnd);
        const x = new Float32Array(len);
        bands.forEach((f) => bandpass(raw, f, p.q || 1.2, sr).forEach((v, k) => (x[k] += v)));
        unit(x);
        const top = amp(p.db != null ? p.db : -30);
        const low = amp(-(p.swingDb != null ? p.swingDb : 1.5));
        // Each syllable glides to its level (30 ms) and, 62 % of the way
        // through, down to `low` of it (40 ms); the hold ends in 50 ms
        const syl = sr / 4.5;
        const stop = len - Math.round(0.05 * sr);
        let g = 0;
        let target = 0;
        let tau = 1;
        let lvl = 0;
        let s = -1;
        let dipped = false;
        for (let k = 0; k < len; k++) {
          const j = Math.floor(k / syl);
          if (j !== s) {
            s = j;
            lvl = top * (0.8 + rnd() * 0.2);
            target = lvl;
            tau = 0.03 * sr;
            dipped = false;
          } else if (!dipped && k / syl - j >= 0.62) {
            target = lvl * low;
            tau = 0.04 * sr;
            dipped = true;
          }
          if (k >= stop) {
            target = 0;
            tau = 0.05 * sr;
          }
          g += (target - g) / tau;
          wave[i0 + k] += x[k] * g;
        }
      }
      truth.push({ kind: p.kind, start: t, end: t + p.sec });
      t += p.sec;
    });
    return { wave, f0, truth, sr, pre, sec };
  }

  /**
   * The engine's frames over a rendered take, each handed to `feed` while its
   * `buf` holds its samples (the next frame writes over them).
   */
  function frames(tk, spec, rnd, feed) {
    const sr = tk.sr;
    const N = frameSize(sr);
    const sens = spec.sens || 7;
    const holdRms = 0.008 * (1.55 - ((sens - 1) / 9) * 1.42);
    const buf = new Float32Array(N);
    const withBuf = spec.buf !== false;
    const clarity = global.VTPitchUtils && global.VTPitchUtils.clarity;
    let tf = 0;
    for (;;) {
      const dtMs = 1000 / (spec.fps || 60) + (rnd() - 0.5) * 1.1;
      tf += dtMs;
      const end = tk.pre + Math.floor((tf / 1000) * sr);
      if (end > tk.wave.length) break;
      let s = 0;
      let d = 0;
      let voiced = 0;
      for (let i = 0; i < N; i++) {
        const v = tk.wave[end - N + i];
        buf[i] = v;
        s += v * v;
        if (i) d += (v - buf[i - 1]) * (v - buf[i - 1]);
        if (tk.f0[end - N + i] > 0) voiced++;
      }
      const rms = Math.sqrt(s / N);
      const hfRms = Math.sqrt(d / (N - 1));
      const rawFreq = voiced > N / 2 && rms >= 0.01 ? tk.f0[end - 1] : null;
      const frame = {
        dtMs,
        rms,
        hfRms,
        clarity: clarity ? clarity(buf, sr) : null,
        rawFreq,
        sounding: rms >= holdRms || (rawFreq != null && rms >= holdRms * 0.55),
        sampleRate: sr,
        t: tf / 1000
      };
      if (withBuf) frame.buf = buf;
      feed(frame);
    }
  }

  function overlap(a0, a1, b0, b1) {
    return Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
  }

  /**
   * Run one take through a fresh Vad. spec: { parts, room (dB, default −62),
   * fan: { db, from, until, hp }, sr (48000), sens (7), fps (60), seed,
   * buf (true), at: [seconds to read the floor at] }. The result reads as
   * VTVadSim.run's.
   */
  function run(spec) {
    const F = global.VTFeatures;
    const seed = spec.seed != null ? spec.seed : 12345;
    const tk = render(spec, prng(seed));
    const ended = [];
    const takenBack = [];
    const vad = new F.Vad({
      onPauseEnd: (start, len) => ended.push({ start, len }),
      onTakeBack: (start) => takenBack.push(start)
    });
    const at = (spec.at || []).slice().sort((a, b) => a - b);
    const floorAt = {};
    frames(tk, spec, prng(seed ^ 0x5bd1e995), (f) => {
      vad.feed(f);
      while (at.length && vad.t >= at[0]) floorAt[at.shift()] = Math.round(vad.floorDb * 10) / 10;
    });
    const T = vad.t;
    const voice = new Set(["speech", "hiss"]);
    const segs = vad.segments.map((g) => ({ kind: g.kind, start: g.start, end: g.end != null ? g.end : T }));
    // Speech read where there was only the room (a fan heard as a voice)
    let ghost = 0;
    segs.forEach((g) => {
      if (g.kind !== "speech") return;
      tk.truth.forEach((x) => {
        if (x.kind === "silence") ghost += overlap(g.start, g.end, x.start, x.end);
      });
    });
    // Pauses whose middle sits inside a voice part: silences that were not there
    const falsePauses = segs.filter((g) => {
      if (g.kind !== "pause") return false;
      const mid = (g.start + g.end) / 2;
      return tk.truth.some((x) => voice.has(x.kind) && mid > x.start && mid < x.end);
    }).length;
    // Each real silence between two voice parts, and the pause measured there
    const silences = [];
    tk.truth.forEach((x, i) => {
      if (x.kind !== "silence" || i === 0 || i === tk.truth.length - 1) return;
      const hit = ended.find((e) => overlap(e.start, e.start + e.len, x.start, x.end) > 0.5 * (x.end - x.start));
      silences.push({ start: x.start, sec: x.end - x.start, measured: hit ? hit.len : null });
    });
    return {
      T,
      talk: vad.talkSec,
      truthTalk: tk.truth.filter((x) => voice.has(x.kind)).reduce((s, x) => s + (x.end - x.start), 0),
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

  global.VTVadAudio = { run, render };
})(typeof window !== "undefined" ? window : globalThis);
