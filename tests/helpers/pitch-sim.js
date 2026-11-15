/**
 * Synthetic voices for testing a pitch detector, sample by sample, with the
 * true F0 of every sample: a glottal source (Rosenberg-C pulses, one per
 * period, with jitter and shimmer) through a cascade of five vowel
 * formants (male, female and child sets), and the variations that break
 * detectors: spectral tilt (pressed to breathy), a weak or missing
 * fundamental, a strong second harmonic, vibrato, aspiration noise, a fan
 * or mains hum underneath, onsets and releases, glides, speech-like
 * contours; plus noise and silence alone. Then the frames the practice
 * engine (js/practice-engine.js) hands the detector: the analyser's last
 * frameSize(sr) samples (2048 at 44.1 and 48 kHz) after the MIC gain, once
 * per animation frame (60 a second, ±0.55 ms of jitter, on 128-sample
 * render quanta).
 *
 * Works in a page (window.VTPitchSim) and in Node (module.exports). Same
 * spec and seed, same samples.
 *
 *   const r = VTPitchSim.render({ kind: "vowel", voice: "female", vowel: "a", f0: 880 }, 48000);
 *   // r.x: samples at the mic (before the MIC gain), r.f0: true F0 per sample (0 = unvoiced),
 *   // r.env: the voice's envelope (0-1)
 *   const fr = VTPitchSim.frames(r, 48000);   // [{ buf, end, truth, voiced }]
 *
 * Formants: Peterson & Barney 1952 (i, a, u) and Hillenbrand et al. 1995
 * (e, o; their /eɪ/ and /oʊ/), F1-F3 for men, women and children; F4-F5
 * typical values. The Rosenberg-C pulse: Rosenberg 1971.
 */
(function (root) {
  "use strict";

  const FORMANTS = {
    male: {
      a: [730, 1090, 2440, 3400, 4500],
      e: [476, 2089, 2691, 3500, 4500],
      i: [270, 2290, 3010, 3500, 4500],
      o: [497, 910, 2459, 3400, 4500],
      u: [300, 870, 2240, 3400, 4500]
    },
    female: {
      a: [850, 1220, 2810, 4100, 5000],
      e: [536, 2530, 3047, 4200, 5000],
      i: [310, 2790, 3310, 4200, 5000],
      o: [555, 1035, 2828, 4100, 5000],
      u: [370, 950, 2670, 4100, 5000]
    },
    child: {
      a: [1030, 1370, 3170, 4600, 5600],
      e: [564, 2656, 3323, 4600, 5600],
      i: [370, 3200, 3730, 4600, 5600],
      o: [597, 1137, 3050, 4600, 5600],
      u: [430, 1170, 3260, 4600, 5600]
    }
  };
  const BANDWIDTHS = [80, 100, 140, 200, 260];
  /**
   * Open phase (tp) and closing phase (tn) of the pulse, as shares of the
   * period, per voice. Women's glottal pulses stay open longer than men's
   * and children's longer still (open quotient about 0.6 / 0.7 / 0.8 in
   * modal voice; Holmberg, Hillman & Perkell 1988), which gives them a
   * stronger fundamental against the second harmonic. Pressed: short, abrupt
   * closure; breathy: long, smooth closure, a low-pass and (in the grid)
   * aspiration noise.
   */
  const TILT = {
    male: {
      pressed: { tp: 0.36, tn: 0.08, lp: 0 },
      modal: { tp: 0.42, tn: 0.16, lp: 0 },
      breathy: { tp: 0.5, tn: 0.32, lp: 1200 }
    },
    female: {
      pressed: { tp: 0.4, tn: 0.1, lp: 0 },
      modal: { tp: 0.5, tn: 0.2, lp: 0 },
      breathy: { tp: 0.55, tn: 0.35, lp: 1500 }
    },
    child: {
      pressed: { tp: 0.42, tn: 0.12, lp: 0 },
      modal: { tp: 0.55, tn: 0.25, lp: 0 },
      breathy: { tp: 0.58, tn: 0.36, lp: 1800 }
    }
  };
  const OS = 4;

  function prng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rnd) {
    return Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  }
  function rmsOf(x, mask) {
    let s = 0;
    let n = 0;
    for (let i = 0; i < x.length; i++) {
      if (mask && !mask(i)) continue;
      s += x[i] * x[i];
      n++;
    }
    return n ? Math.sqrt(s / n) : 0;
  }

  /** Windowed-sinc low-pass for the decimation (Blackman). */
  const _fir = {};
  function decimFir(taps) {
    if (_fir[taps]) return _fir[taps];
    const h = new Float64Array(taps);
    const fc = 0.45 / OS;
    const M = taps - 1;
    let s = 0;
    for (let i = 0; i < taps; i++) {
      const k = i - M / 2;
      const sinc = k === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * k) / (Math.PI * k);
      const w = 0.42 - 0.5 * Math.cos((2 * Math.PI * i) / M) + 0.08 * Math.cos((4 * Math.PI * i) / M);
      h[i] = sinc * w;
      s += h[i];
    }
    for (let i = 0; i < taps; i++) h[i] /= s;
    return (_fir[taps] = h);
  }
  function decimate(y, n) {
    const h = decimFir(128);
    const out = new Float32Array(n);
    const half = h.length >> 1;
    for (let i = 0; i < n; i++) {
      const c = i * OS + half;
      let acc = 0;
      for (let k = 0; k < h.length; k++) {
        const j = c - k;
        if (j >= 0 && j < y.length) acc += h[k] * y[j];
      }
      out[i] = acc;
    }
    return out;
  }

  /** RBJ biquad coefficients. */
  function biquad(type, f, q, gainDb, sr) {
    const w = (2 * Math.PI * Math.min(f, sr * 0.45)) / sr;
    const cs = Math.cos(w);
    const sn = Math.sin(w);
    const al = sn / (2 * q);
    let b0, b1, b2, a0, a1, a2;
    if (type === "hp") {
      b0 = (1 + cs) / 2;
      b1 = -(1 + cs);
      b2 = (1 + cs) / 2;
      a0 = 1 + al;
      a1 = -2 * cs;
      a2 = 1 - al;
    } else if (type === "lp") {
      b0 = (1 - cs) / 2;
      b1 = 1 - cs;
      b2 = (1 - cs) / 2;
      a0 = 1 + al;
      a1 = -2 * cs;
      a2 = 1 - al;
    } else if (type === "bp") {
      b0 = al;
      b1 = 0;
      b2 = -al;
      a0 = 1 + al;
      a1 = -2 * cs;
      a2 = 1 - al;
    } else {
      const A = Math.pow(10, gainDb / 40);
      b0 = 1 + al * A;
      b1 = -2 * cs;
      b2 = 1 - al * A;
      a0 = 1 + al / A;
      a1 = -2 * cs;
      a2 = 1 - al / A;
    }
    return [b0 / a0, b1 / a0, b2 / a0, a1 / a0, a2 / a0];
  }
  /**
   * A biquad whose frequency follows fn(i) (Hz), coefficients updated every
   * 32 samples, applied in place.
   */
  function sweepFilter(x, sr, type, fn, q, gainDb) {
    let z1 = 0;
    let z2 = 0;
    let c = null;
    for (let i = 0; i < x.length; i++) {
      if (i % 32 === 0) {
        const f = fn(i);
        if (f > 0) c = biquad(type, f, q, gainDb, sr);
      }
      if (!c) continue;
      const v = x[i];
      const y = c[0] * v + z1;
      z1 = c[1] * v - c[3] * y + z2;
      z2 = c[2] * v - c[4] * y;
      x[i] = y;
    }
    return x;
  }

  /** The pulse's shape for a voice and tilt (TILT), its jitter and its shimmer. */
  function sourceOf(o) {
    const tv = TILT[o.voice] || TILT.male;
    return {
      tilt: tv[o.tilt || "modal"] || tv.modal,
      jit: o.jitter != null ? o.jitter : 0.002,
      shim: o.shimmer != null ? o.shimmer : 0.02
    };
  }
  /** The Rosenberg-C pulse at phase ph: the flow's derivative (0 while closed). */
  function pulseSlope(ph, tp, tn) {
    if (ph <= tp) return ((0.5 * Math.PI) / tp) * Math.sin((Math.PI * ph) / tp);
    if (ph <= tp + tn) return (-Math.PI / (2 * tn)) * Math.sin((Math.PI * (ph - tp)) / (2 * tn));
    return 0;
  }
  /** The Rosenberg-C pulse at phase ph: the flow itself, 0-1 (0 while closed). */
  function pulseFlow(ph, tp, tn) {
    if (ph <= tp) return 0.5 * (1 - Math.cos((Math.PI * ph) / tp));
    if (ph <= tp + tn) return Math.cos((Math.PI * (ph - tp)) / (2 * tn));
    return 0;
  }

  /**
   * The voice at OS × sr: pulses at f0[i] (output-rate arrays, read at
   * i = floor(j / OS)), shaped by env, through five formants that may change
   * per sample (formantAt(i) → [F1..F5]); then decimated to sr.
   */
  function voice(f0, env, formantAt, sr, o, rnd) {
    const n = f0.length;
    const fs = sr * OS;
    const N = n * OS;
    const { tilt, jit, shim } = sourceOf(o);
    const tp = tilt.tp;
    const tn = tilt.tn;
    const exc = new Float64Array(N);
    const asp = o.aspDb != null ? new Float64Array(N) : null;
    let ph = 0;
    let pf = 0;
    let pa = 1;
    let aspLp = 0;
    for (let j = 0; j < N; j++) {
      const i = (j / OS) | 0;
      const f = f0[i];
      if (!(f > 0) || !(env[i] > 0)) {
        ph = 0;
        pf = 0;
        continue;
      }
      if (pf === 0) {
        pf = f * Math.exp(jit * gauss(rnd));
        pa = Math.max(0.2, 1 + shim * gauss(rnd));
      }
      ph += pf / fs;
      if (ph >= 1) {
        ph -= 1;
        pf = f * Math.exp(jit * gauss(rnd));
        pa = Math.max(0.2, 1 + shim * gauss(rnd));
      }
      exc[j] = pulseSlope(ph, tp, tn) * pa * env[i];
      if (asp) {
        // Turbulence at the glottis while it is open, high-passed at ~400 Hz
        const w = gauss(rnd);
        aspLp += (w - aspLp) * ((2 * Math.PI * 400) / fs);
        asp[j] = (w - aspLp) * (0.25 + pulseFlow(ph, tp, tn)) * env[i];
      }
    }
    const tract = (src) => {
      const y = new Float64Array(N);
      const st = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      let co = null;
      for (let j = 0; j < N; j++) {
        if (j % 64 === 0) {
          const F = formantAt((j / OS) | 0);
          co = F.map((fr, k) => {
            const bw = BANDWIDTHS[k] * (o.bwScale || 1);
            const T = 1 / fs;
            const C = -Math.exp(-2 * Math.PI * bw * T);
            const B = 2 * Math.exp(-Math.PI * bw * T) * Math.cos(2 * Math.PI * fr * T);
            return [1 - B - C, B, C];
          });
        }
        let v = src[j];
        for (let k = 0; k < 5; k++) {
          const c = co[k];
          const out = c[0] * v + c[1] * st[2 * k] + c[2] * st[2 * k + 1];
          st[2 * k + 1] = st[2 * k];
          st[2 * k] = out;
          v = out;
        }
        y[j] = v;
      }
      return y;
    };
    // Radiation is in the source already (the flow's derivative)
    let x = decimate(tract(exc), n);
    if (tilt.lp) sweepFilter(x, sr, "lp", () => tilt.lp, 0.6);
    if (asp) {
      const a = decimate(tract(asp), n);
      const core = (i) => env[i] > 0.5;
      const rv = rmsOf(x, core);
      const ra = rmsOf(a, core);
      const k = ra > 0 ? (rv / ra) * Math.pow(10, -o.aspDb / 20) : 0;
      for (let i = 0; i < n; i++) x[i] += a[i] * k;
    }
    return x;
  }

  /*
   * The noises, each written into x (zeros) in place at any level; noise()
   * scales them to rms 1. `w` draws a standard normal sample.
   */
  function whiteNoise(x, sr, w) {
    for (let i = 0; i < x.length; i++) x[i] = w();
  }
  function pinkNoise(x, sr, w) {
    // Paul Kellet's filter
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < x.length; i++) {
      const v = w();
      b0 = 0.99886 * b0 + v * 0.0555179;
      b1 = 0.99332 * b1 + v * 0.0750759;
      b2 = 0.969 * b2 + v * 0.153852;
      b3 = 0.8665 * b3 + v * 0.3104856;
      b4 = 0.55 * b4 + v * 0.5329522;
      b5 = -0.7616 * b5 - v * 0.016898;
      x[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + v * 0.5362;
      b6 = v * 0.115926;
    }
  }
  function rumbleNoise(x, sr, w, hiss) {
    // A fan: noise under ~200 Hz (two one-pole low-passes), and for "fan"
    // the motor's broadband hiss 12 dB under it
    const n = x.length;
    const a = (2 * Math.PI * 200) / sr;
    let l1 = 0;
    let l2 = 0;
    for (let i = 0; i < n; i++) {
      l1 += (w() - l1) * a;
      l2 += (l1 - l2) * a;
      x[i] = l2;
    }
    const r = rmsOf(x);
    for (let i = 0; i < n; i++) x[i] /= r;
    if (hiss) for (let i = 0; i < n; i++) x[i] += 0.25 * w();
  }
  function breathNoise(x, sr, w) {
    whiteNoise(x, sr, w);
    sweepFilter(x, sr, "bp", () => 1400, 0.5);
    // an exhalation: swells and fades over ~1.6 s
    for (let i = 0; i < x.length; i++) x[i] *= 0.3 + 0.7 * Math.sin((Math.PI * ((i / sr) % 1.6)) / 1.6);
  }
  function sssNoise(x, sr, w) {
    whiteNoise(x, sr, w);
    sweepFilter(x, sr, "hp", () => 3500, 0.7);
    sweepFilter(x, sr, "hp", () => 3500, 0.7);
  }
  function humTone(x, sr) {
    for (let i = 0; i < x.length; i++) {
      const t = i / sr;
      x[i] = Math.sin(2 * Math.PI * 60 * t) + 0.5 * Math.sin(2 * Math.PI * 120 * t) + 0.25 * Math.sin(2 * Math.PI * 180 * t);
    }
  }
  function sineTone(x, sr, f) {
    for (let i = 0; i < x.length; i++) x[i] = Math.sin((2 * Math.PI * f * i) / sr);
  }
  function buzzTone(x, sr, f) {
    // a ground loop's buzz: every harmonic of the mains, falling 1.2 × 6 dB an octave
    for (let k = 1; k <= 40 && k * f < sr / 2; k++) for (let i = 0; i < x.length; i++) x[i] += Math.sin((2 * Math.PI * k * f * i) / sr + k) / Math.pow(k, 1.2);
  }
  function squareTone(x, sr) {
    for (let i = 0; i < x.length; i++) x[i] = Math.sin((2 * Math.PI * 60 * i) / sr) >= 0 ? 1 : -1;
  }
  function clickNoise(x, sr, w) {
    // keyboard-like clicks: 4 a second, decaying noise bursts
    for (let i = 0; i < x.length; i++) {
      const t = (i / sr) % 0.25;
      x[i] = t < 0.012 ? w() * Math.exp(-t / 0.002) : 0;
    }
  }
  const NOISES = {
    white: whiteNoise,
    pink: pinkNoise,
    rumble: (x, sr, w) => rumbleNoise(x, sr, w, false),
    fan: (x, sr, w) => rumbleNoise(x, sr, w, true),
    breath: breathNoise,
    sss: sssNoise,
    hum: humTone,
    sine50: (x, sr) => sineTone(x, sr, 50),
    sine60: (x, sr) => sineTone(x, sr, 60),
    buzz50: (x, sr) => buzzTone(x, sr, 50),
    buzz60: (x, sr) => buzzTone(x, sr, 60),
    square60: squareTone,
    clicks: clickNoise
  };
  const own = (table, key) => Object.prototype.hasOwnProperty.call(table, key);

  /** Noise of a kind, rms 1 (a kind it does not know: silence). */
  function noise(kind, n, sr, rnd) {
    const x = new Float32Array(n);
    if (own(NOISES, kind)) NOISES[kind](x, sr, () => gauss(rnd));
    const r = rmsOf(x);
    if (r > 0) for (let i = 0; i < n; i++) x[i] /= r;
    return x;
  }

  /** The vibrato as a pitch ratio at t s: ±vibCents at vibHz (5.5 Hz), from phase vibPh. */
  function vibrato(s, vibPh) {
    return (t) => (s.vibCents ? Math.pow(2, (s.vibCents * Math.sin(2 * Math.PI * (s.vibHz || 5.5) * t + vibPh)) / 1200) : 1);
  }

  /** kind "noise": the noise alone, at levelDb (−40 dBFS when it is unset). */
  function renderNoise(s, n, sr, rnd, f0, env) {
    const x = s.noise === "silence" ? new Float32Array(n) : noise(s.noise || "white", n, sr, rnd);
    const g = Math.pow(10, (s.levelDb != null ? s.levelDb : -40) / 20);
    for (let i = 0; i < n; i++) x[i] *= g;
    return { x, f0, env, sr };
  }

  /** kind "tone". */
  function renderTone(s, n, sr, f0, env, vib) {
    // No voice: `partials` harmonics of f0 (1: a whistle), falling tiltDb
    // an octave, at levelDb, with the vibrato
    const x = new Float32Array(n);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      f0[i] = s.f0 * vib(t);
      env[i] = Math.min(1, t / 0.02, (s.sec - t) / 0.02);
      ph += (2 * Math.PI * f0[i]) / sr;
      let v = 0;
      for (let k = 1; k <= (s.partials || 1) && k * f0[i] < sr / 2; k++) v += Math.pow(10, ((s.tiltDb || 0) * Math.log2(k)) / 20) * Math.sin(k * ph + k);
      x[i] = v * env[i];
    }
    const g = Math.pow(10, s.levelDb / 20) / (rmsOf(x, (i) => env[i] > 0.5) || 1);
    for (let i = 0; i < n; i++) x[i] *= g;
    return { x, f0, env, sr };
  }

  /*
   * The voice's contours, by kind: F0 and envelope per sample, written into
   * c.f0 and c.env (c: { s, spec, sr, n, f0, env, vib, rnd }); speech also
   * sets c.formantIdx (each sample's vowel) and c.cons (its consonants).
   */
  function steadyContour(c) {
    const { s, sr, n, f0, env, vib } = c;
    const pre = s.kind === "onset" ? 0.25 : 0;
    const att = s.kind === "onset" ? 0.04 : 0.02;
    const rel = s.kind === "onset" ? 0.08 : 0.02;
    const post = s.kind === "onset" ? 0.25 : 0;
    const on = pre;
    const off = s.sec - post;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      if (t < on || t >= off) continue;
      f0[i] = s.f0 * vib(t);
      const a = Math.min(1, (t - on) / att, (off - t) / rel);
      env[i] = 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, a));
    }
  }
  function glideContour(c) {
    const { s, sr, n, f0, env, vib } = c;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const u = Math.min(1, Math.max(0, (t - 0.05) / (s.sec - 0.1)));
      f0[i] = s.f0 * Math.pow(s.f0b / s.f0, u) * vib(t);
      env[i] = Math.min(1, t / 0.02, (s.sec - t) / 0.02);
    }
  }
  function pathContour(c) {
    const { s, sr, n, f0, env, vib } = c;
    // A scripted line: per segment [t0, t1, f0 (Hz), f0 at t1] (a
    // log-linear glide; without the fourth, a held note). Segments back
    // to back are one sung line (a step from one to the next is not a new
    // onset); a gap between two is silence, each side ramped in 20 ms.
    const segs = s.path || [];
    const runs = [];
    for (const q of segs) {
      const r = runs[runs.length - 1];
      if (r && Math.abs(q[0] - r.off) < 1e-9) {
        r.segs.push(q);
        r.off = q[1];
      } else runs.push({ on: q[0], off: q[1], segs: [q] });
    }
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const r = runs.find((q) => t >= q.on && t < q.off);
      if (!r) continue;
      const g = r.segs.find((q) => t >= q[0] && t < q[1]);
      f0[i] = (g[3] ? g[2] * Math.pow(g[3] / g[2], (t - g[0]) / (g[1] - g[0])) : g[2]) * vib(t);
      env[i] = Math.min(1, (t - r.on) / 0.02, (r.off - t) / 0.02);
    }
  }
  /** Speech: an unvoiced consonant from t s into c.cons. Returns its length (s). */
  function consonant(c, t) {
    const { sr, n, cons, rnd } = c;
    const fric = rnd() < 0.6;
    const cd = fric ? 0.05 + 0.05 * rnd() : 0.04;
    const c0 = Math.round(t * sr);
    const c1 = Math.round((t + cd) * sr);
    for (let i = c0; i < c1 && i < n; i++) {
      const u = (i - c0) / Math.max(1, c1 - c0);
      cons[i] = fric ? Math.sin(Math.PI * u) : u > 0.75 ? 1 : 0;
    }
    return cd;
  }
  /** Speech: the voiced vowel of syllable k of a phrase, from t s. Returns its length (s). */
  function speechVowel(c, t, phrase, k) {
    const { sr, n, f0, env, vib, rnd, formantIdx } = c;
    const vd = 0.11 + 0.11 * rnd();
    const v0 = Math.round(t * sr);
    const v1 = Math.round((t + vd) * sr);
    const acc = rnd() < 0.4 ? phrase.accent * (0.5 + 0.5 * rnd()) : 0;
    const vi = Math.floor(rnd() * 5);
    for (let i = v0; i < v1 && i < n; i++) {
      const tt = i / sr;
      const u = (i - v0) / Math.max(1, v1 - v0);
      const decl = (-2 * (tt - phrase.p0)) / Math.max(0.5, phrase.syl * 0.25);
      const fin = phrase.rise && k === phrase.syl - 1 ? 5 * u : 0;
      // the accent peaks mid-vowel; a small drift inside the vowel
      const st = decl + acc * Math.sin(Math.PI * u) + fin + 0.5 * Math.sin(2 * Math.PI * 3 * tt);
      f0[i] = phrase.base * Math.pow(2, st / 12) * vib(tt);
      env[i] = Math.min(1, u / 0.15, (1 - u) / 0.2);
      formantIdx[i] = vi;
    }
    return vd;
  }
  function speechContour(c) {
    const { s, spec, n, rnd } = c;
    // Phrases of syllables: an unvoiced consonant (a fricative or a stop's
    // closure and burst), then a voiced vowel. F0: the speaker's base,
    // a declination of 2 semitones over the phrase, a pitch accent on some
    // syllables, a rise at the end of half the phrases.
    const base = (spec && spec.f0) || { male: 110, female: 205, child: 280 }[s.voice] || 150;
    const accent = (s.style === "lively" ? 7 : 3) * ({ male: 1, female: 1.2, child: 1.4 }[s.voice] || 1);
    c.formantIdx = new Int8Array(n);
    c.cons = new Float32Array(n);
    let t = 0.15;
    while (t < s.sec - 0.4) {
      const syl = 4 + Math.floor(rnd() * 5);
      const p0 = t;
      const rise = rnd() < 0.5;
      const phrase = { base, accent, p0, syl, rise };
      let pend = p0;
      for (let k = 0; k < syl && t < s.sec - 0.3; k++) {
        t += consonant(c, t);
        t += speechVowel(c, t, phrase, k);
        pend = t;
      }
      t = pend + 0.25 + 0.2 * rnd();
    }
  }
  const CONTOURS = { vowel: steadyContour, onset: steadyContour, glide: glideContour, path: pathContour, speech: speechContour };

  /** F0 at sample i: its own, else the last one up to 2000 samples before, else spec's f0 (or 200). */
  function lastF0(f0, s) {
    return (i) => {
      for (let k = i; k >= 0 && k > i - 2000; k--) if (f0[k] > 0) return f0[k];
      return s.f0 || 200;
    };
  }
  /** formantAt(i) → [F1..F5]: the vowel's, or each speech sample's own; F1 tracking F0 with f1track. */
  function formantsOf(s, formantIdx, F0) {
    const set = FORMANTS[s.voice] || FORMANTS.male;
    const fixed = set[s.vowel] || set.a;
    return (i) => {
      const F = formantIdx ? set["aeiou"[formantIdx[i]]] : fixed;
      if (!s.f1track) return F;
      const f = F0(i);
      return f * 1.1 > F[0] ? [f * 1.1, Math.max(F[1], f * 1.1 + 300), F[2], F[3], F[4]] : F;
    };
  }
  /** The voice's colour after the tract, in place: fund, h2Db, dark, bright, hp (see render). */
  function colour(x, s, sr, F0) {
    // A weak or missing fundamental: high-passes that follow F0
    if (s.fund === "weak") {
      sweepFilter(x, sr, "hp", (i) => 1.5 * F0(i), 0.7071);
      sweepFilter(x, sr, "hp", (i) => 1.5 * F0(i), 0.7071);
    } else if (s.fund === "none") {
      for (let k = 0; k < 4; k++) sweepFilter(x, sr, "hp", (i) => 1.6 * F0(i), 0.7071);
    }
    if (s.h2Db) sweepFilter(x, sr, "peak", (i) => 2 * F0(i), 3, s.h2Db);
    if (s.dark) for (let k = 0; k < 2; k++) sweepFilter(x, sr, "lp", () => s.dark, 0.7071);
    if (s.bright) for (let i = x.length - 1; i > 0; i--) x[i] -= x[i - 1];
    if (s.hp) sweepFilter(x, sr, "hp", () => s.hp, 0.7071);
  }
  /** Added to the voice at its level, in place: speech's consonants, a fan (fanDb), a hum (humDb). */
  function addNoises(x, s, sr, rnd, cons) {
    const n = x.length;
    const lv = Math.pow(10, s.levelDb / 20);
    if (cons) {
      // the consonants' noise, ~8 dB under the vowels
      const nz = noise("white", n, sr, rnd);
      sweepFilter(nz, sr, "hp", () => 2500, 0.7);
      const k = lv * Math.pow(10, -8 / 20) * 1.4;
      for (let i = 0; i < n; i++) x[i] += nz[i] * cons[i] * k;
    }
    if (s.fanDb != null) {
      const nz = noise("fan", n, sr, rnd);
      const k = lv * Math.pow(10, -s.fanDb / 20);
      for (let i = 0; i < n; i++) x[i] += nz[i] * k;
    }
    if (s.humDb != null) {
      const nz = noise(s.humKind || "hum", n, sr, rnd);
      const k = lv * Math.pow(10, -s.humDb / 20);
      for (let i = 0; i < n; i++) x[i] += nz[i] * k;
    }
  }

  /**
   * Render one signal. spec:
   *  kind: "vowel" (steady), "onset" (silence, attack, hold, release, silence),
   *        "glide" (f0 → f0b, log-linear), "path" (spec.path: segments
   *        [t0, t1, f0, f0 at t1], glides and held notes; a gap between
   *        two is silence),
   *        "speech" (phrases of syllables), "tone" (no voice: `partials`
   *        harmonics of f0 falling `tiltDb` an octave; 1 is a whistle),
   *        "noise" (noise only: spec.noise = "white" | "pink" | "rumble" |
   *        "fan" | "breath" | "sss" | "hum" | "clicks" | "silence" |
   *        "sine50" | "sine60" | "buzz50" | "buzz60" | "square60")
   *  voice: "male" | "female" | "child"; vowel: a e i o u
   *  f0, f0b (Hz), sec, seed, levelDb (rms of the voiced part at the mic,
   *  dBFS, default −30), tilt: modal | pressed | breathy, fund: full | weak |
   *  none (H1 −14 dB / −30 dB), h2Db (a peak of that many dB on the 2nd
   *  harmonic), vibCents (±, 5.5 Hz or vibHz), jitter (relative period sd),
   *  shimmer (relative amplitude sd), aspDb (harmonics over aspiration, dB),
   *  fanDb / humDb (voice over a fan / a 60 Hz hum, dB; humKind: that
   *  noise kind instead of "hum"), hp (a mic's high-pass, Hz, 2nd order),
   *  dark (a soft, dark voice: a 4th-order low-pass at that many Hz),
   *  bright (true: +6 dB an octave, a first difference), bwScale
   *  (the formants' bandwidths times this),
   *  f1track (F1 raised to 1.1 × F0 when F0 is above it, as sopranos do),
   *  style (speech: "calm" | "lively")
   * Returns { x, f0, env, sr }.
   */
  function render(spec, sr) {
    const s = Object.assign({ kind: "vowel", voice: "male", vowel: "a", f0: 220, sec: 0.7, seed: 1, levelDb: -30, tilt: "modal" }, spec || {});
    const rnd = prng(s.seed * 7919 + Math.round((s.f0 || 1) * 10));
    const n = Math.round(s.sec * sr);
    const f0 = new Float32Array(n);
    const env = new Float32Array(n);
    if (s.kind === "noise") return renderNoise(s, n, sr, rnd, f0, env);
    const vibPh = rnd() * 2 * Math.PI;
    const vib = vibrato(s, vibPh);
    if (s.kind === "tone") return renderTone(s, n, sr, f0, env, vib);
    const c = { s, spec, sr, n, f0, env, vib, rnd, formantIdx: null, cons: null };
    if (own(CONTOURS, s.kind)) CONTOURS[s.kind](c);
    const F0 = lastF0(f0, s);
    const x = voice(f0, env, formantsOf(s, c.formantIdx, F0), sr, s, rnd);
    colour(x, s, sr, F0);
    // Level: the voiced part's rms
    const core = (i) => env[i] > 0.5;
    const r = rmsOf(x, core);
    const g = r > 0 ? Math.pow(10, s.levelDb / 20) / r : 0;
    for (let i = 0; i < n; i++) x[i] *= g;
    addNoises(x, s, sr, rnd, c.cons);
    return { x, f0, env, sr };
  }

  /** The engine's frame length (js/practice-engine.js frameSize). */
  function frameSize(sr) {
    let n = 2048;
    while (n < 32768 && n < (sr || 48000) * 0.04) n *= 2;
    return n;
  }
  /** The MIC gain at a sensitivity (js/practice-engine.js _gainFromSens). */
  function gainFromSens(s) {
    const t = (s - 1) / 9;
    return Math.min(8, 0.7 + t * 5.7 + t * t * 1.4);
  }

  /**
   * The frames the engine reads: every animation frame (fps, default 60,
   * ±0.55 ms jitter) the analyser's last frameSize(sr) samples, ending on a
   * 128-sample render quantum, after the MIC gain at `sens` (default 7).
   * Each: { buf, end, t, truth (Hz: the voiced samples' mean log F0, or 0),
   * voiced (share of the window's samples that are voiced) }.
   */
  function frames(sig, sr, o = {}) {
    const N = o.size || frameSize(sr);
    const g = o.gain != null ? o.gain : gainFromSens(o.sens || 7);
    const x = new Float32Array(sig.x.length);
    for (let i = 0; i < x.length; i++) x[i] = sig.x[i] * g;
    const rnd = prng(o.seed || 3);
    const fps = o.fps || 60;
    const out = [];
    let tf = 0;
    const endMs = (x.length / sr) * 1000;
    for (;;) {
      tf += 1000 / fps + (rnd() - 0.5) * 1.1;
      if (tf > endMs) break;
      const end = Math.floor(((tf / 1000) * sr) / 128) * 128;
      if (end < N || end > x.length) continue;
      const { v, lg } = voicedIn(sig, end - N, end);
      out.push({ buf: x.subarray(end - N, end), end, t: end / sr, truth: v ? Math.exp(lg / v) : 0, voiced: v / N });
    }
    return out;
  }
  /** The voiced samples of sig in [from, end): how many (v), and the sum of their log F0 (lg). */
  function voicedIn(sig, from, end) {
    let v = 0;
    let lg = 0;
    for (let i = from; i < end; i++) {
      if (sig.f0[i] > 0 && sig.env[i] > 0.1) {
        v++;
        lg += Math.log(sig.f0[i]);
      }
    }
    return { v, lg };
  }

  /** Cents from b to a. */
  function cents(a, b) {
    return 1200 * Math.log2(a / b);
  }

  const API = { FORMANTS, TILT, render, frames, frameSize, gainFromSens, noise, cents, prng };
  root.VTPitchSim = API;
  if (typeof module !== "undefined" && module.exports) module.exports = API;
})(typeof window !== "undefined" ? window : globalThis);
