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

  /*
   * Pitch over the whole singing range, ~50–1500 Hz (a bass's A1 to a
   * soprano's or a child's F#6), from the normalised square difference
   * function (NSDF) of McLeod & Wyvill (2005), "A smarter way to find
   * pitch": n(τ) = 2 r(τ) / m(τ), r the autocorrelation and
   * m(τ) = Σ x[i]² + x[i+τ]² over the same n − τ samples. Unlike the raw
   * autocorrelation it does not shrink with the lag, so a long period (a
   * bass) and a short one (a soprano) compete on equal terms.
   *
   * The frame: 2048 samples (43–46 ms at 44.1–48 kHz). Its longest lag
   * searched, sr / 50 (960 samples at 48 kHz), still leaves 1088 products,
   * more than one period at 50 Hz; at sr / 43 the overlap would be under a
   * period. The shortest lag, sr / 1500 (32 samples), keeps a female /i/'s
   * second formant (2.8–3.2 kHz, 15–17 samples) from passing for a period.
   */
  const PITCH_LO_HZ = 50;
  const PITCH_HI_HZ = 1500;
  /** MPM: the first key maximum within K of the highest one. */
  const MPM_K = 0.9;
  /**
   * Under this, the frame has no period: noise, breath, a hiss, silence.
   * A breathy or aspirated voice's lost frames are mostly not these: at
   * 0.45 its wrong-or-missing share moved by 0.2 % at most, while a fan or a
   * rumble got a pitch on 6–7 % of frames instead of 1–2 %.
   */
  const MIN_CLARITY = 0.55;
  /**
   * From this pitch a candidate must also be nearly as periodic as the best
   * key maximum within APER_SPAN times its lag (the period, if the candidate
   * is a part of it): its aperiodicity 1 − n under APER_C × that one's plus
   * APER_EPS. A female /i/ at 932 Hz has her third harmonic on her second
   * formant: the key maximum at 2/3 of the period reads 0.957 against 0.999,
   * passes K, and would read a fifth up (1398 Hz). Its aperiodicity, 0.043,
   * is 40 times the period's. The same happens lower wherever a harmonic
   * sits on a formant: a bright female /i/ at 349 Hz, her eighth harmonic on
   * F2, has a key maximum at 7/8 of her period (399 Hz). The span reaches a
   * third of a period (a child's /ʌ/ at 285 Hz with a weak fundamental read
   * 855 Hz without it) but not a 50/60 Hz hum's period under a voice from
   * 250 Hz, which can be the more periodic lag.
   */
  const APER_FROM_HZ = 250;
  const APER_C = 3;
  const APER_EPS = 0.02;
  const APER_SPAN = 3.06;
  /**
   * However aperiodic the best key maximum, a candidate from APER_FROM_HZ
   * that is not the best must keep its aperiodicity under APER_CAP, and a
   * pitch from HI_FROM_HZ needs a best key maximum of HI_MIN_BEST: when the
   * pitch moves fast within the frame (speech, 5 syllables a second) every
   * lag reads 0.5–0.7, and the first formant's ringing (a man's /a/ at
   * 700–800 Hz) would pass K. On such speech the readings off by more than
   * 60 cents fell from 5.7 % of the voiced frames to 0.6 %; the frames read
   * nothing instead.
   */
  const APER_CAP = 0.25;
  const HI_FROM_HZ = 400;
  const HI_MIN_BEST = 0.7;
  /**
   * A period shorter than the search allows (over 1500 Hz: a whistle, a
   * soprano's G6) still makes a key maximum, kept, under the shortest lag.
   * If it would be picked, the frame reads nothing, not an octave of it,
   * but only if it is the frame's own period: as periodic as the best key
   * maximum (aperiodicity under SHORT_C times) and nothing under it in the
   * spectrum. A voice whose harmonic on a formant made the lobe (a child's
   * /i/ at 1241 Hz, H3 on F3) is 20 times as aperiodic there, and has its
   * first harmonic below (−19 dB of its strongest or more); a whistle has
   * only noise there (−28 dB or less; SHORT_LOW is −23 dB).
   */
  const SHORT_C = 1.5;
  const SHORT_LOW = 0.005;
  /**
   * A dominant second harmonic (H2 on the first formant) puts a key maximum
   * at half the period L. Twice that lag is then more periodic, since the
   * odd harmonics (H1, H3...) are what differs between the frame and itself
   * L later. Twice the lag is taken when its aperiodicity is under OCT_RATIO
   * of the half's (0.005 against 0.053 for a child's C5 on /a/), or when
   * the aperiodicities at L, 2L and 3L (a1, a2, a3) say so with vibrato: a
   * modulation's aperiodicity grows with the square of the lag (a1 : a2 : a3
   * = 1 : 4 : 9), a noise's not at all (1 : 1 : 1), jitter's in proportion
   * (1 : 2 : 3), while the odd harmonics add the same amount at L and 3L and
   * none at 2L. (5 a1 + 3 a3 − 8 a2) / (8 a1) is 0 for any mix of the first
   * three and 1 for odd harmonics alone. A child's pressed /a/ at D5 with
   * ±80 cents of vibrato reads 0.7–0.9; a soprano's D6 with the same
   * vibrato −0.1–0.2. Under LINE_FROM_HZ it must reach OCT_ODD, 2L at least
   * as periodic as L; from there, where the spectrum has the last word
   * (below), OCT_ODD_HI with 2L up to OCT_ODD_A2_HI times as aperiodic: a
   * child's pressed C5 with ±100 cents of vibrato reads 0.47–0.61 with
   * a2/a1 up to 1.7. Never down to a pitch under OCT_FLOOR_HZ: a 50/60 Hz
   * mains hum under a 100–130 Hz voice makes twice the lag "more periodic"
   * too.
   */
  const OCT_RATIO = 0.2;
  const OCT_ODD = 0.6;
  const OCT_ODD_HI = 0.45;
  const OCT_ODD_A2_HI = 1.8;
  const OCT_MIN_APER = 0.01;
  const OCT_FLOOR_HZ = 72;
  /**
   * Odd harmonics, or noise in a formant? Breath or shimmer filtered by a
   * first formant near half the pitch (a woman's /e/ at 1064 Hz, F1 536 Hz;
   * her /i/ at 605 Hz, F1 310 Hz) also differs from itself one period later
   * and not two: to the lags it is an odd harmonic, and it sent 5 % of such
   * frames an octave down. In the spectrum (Hann window over the frame) it is
   * a band some 80 Hz wide; a harmonic is a line. From LINE_FROM_HZ the
   * octave down needs the lower pitch's H1 (at half the higher pitch) and H3
   * to stand LINE_H1 and LINE_H3 (power ratios, 15 and 3 dB) over the
   * spectrum 40–80 Hz to either side. Over 3500 octave-down candidates on
   * high voices (breathy, modal and pressed, ±0–100 cents of vibrato), a
   * true one's H1 stood 18 dB or more in 99 % of them, the formant's noise
   * under 13.5 dB in 99 %. Under LINE_FROM_HZ the harmonics are too close
   * for a 43 ms frame to tell a line from a band, and no first formant is
   * that low.
   */
  const LINE_FROM_HZ = 320;
  const LINE_H1 = 30;
  const LINE_H3 = 2;
  /**
   * Keys at lags under REFINE_MINLAGS × the shortest lag get their height
   * from r(τ) itself at the fractional lag (the spectrum's cosine sum, a
   * Newton step or two from the parabola's estimate), not the parabola
   * through three samples: a bright tone at 1158–1480 Hz has a key maximum
   * one or two samples wide, and the parabola under-reads it enough that K
   * passes to twice the period, an octave low.
   */
  const REFINE_MINLAGS = 4;
  /**
   * Mains: a reading within MAINS_TOL of 50 or 60 Hz is a hum or a buzz
   * (a transformer, a ground loop, a fridge), not a bass, unless a shorter
   * key maximum is within MAINS_K of the best: a voice over the hum, read at
   * its own period. A single 43 ms frame cannot tell a bass on that pitch
   * from a buzz, so the cost is a bass's: between A♯1 (58.3 Hz) and B1
   * (61.7 Hz) he reads nothing within 17 cents of 60 Hz, as under A1 within
   * 17 cents of 50 Hz.
   */
  const MAINS_HZ = [50, 60];
  const MAINS_TOL = 0.01;
  const MAINS_K = 0.8;
  /**
   * A sine hum within 12 dB of a man's voice (110–150 Hz) can pull him to
   * a period both share, under LOW_HZ (55 Hz for 110 Hz over 60 Hz). Under
   * LOW_HZ the key maximum at a half or a third of the pick is taken if it
   * reaches LOW_K of the best: the hum-pulled voice's own period reads
   * 0.88–0.90 of it, a bass's half period no more than 0.79 even with his
   * H2 12 dB over the rest.
   */
  const LOW_HZ = 80;
  const LOW_K = 0.85;

  /** Radix-2 FFT tables and scratch, per size. */
  const _fft = {};
  function fftPlan(n) {
    if (_fft[n]) return _fft[n];
    const bits = Math.round(Math.log2(n));
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      rev[i] = r;
    }
    const cos = new Float64Array(n >> 1);
    const sin = new Float64Array(n >> 1);
    for (let i = 0; i < n >> 1; i++) {
      cos[i] = Math.cos((2 * Math.PI * i) / n);
      sin[i] = Math.sin((2 * Math.PI * i) / n);
    }
    return (_fft[n] = {
      rev,
      cos,
      sin,
      re: new Float64Array(n),
      im: new Float64Array(n),
      pow: new Float64Array((n >> 1) + 1),
      nsdf: new Float64Array(n),
      m: new Float64Array(n)
    });
  }
  /** In-place complex FFT (sign −1) or unscaled inverse (sign +1). */
  function fftInPlace(re, im, plan, sign) {
    const n = re.length;
    const rev = plan.rev;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      if (j > i) {
        let t = re[i];
        re[i] = re[j];
        re[j] = t;
        t = im[i];
        im[i] = im[j];
        im[j] = t;
      }
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let j = 0, k = 0; j < half; j++, k += step) {
          const wr = plan.cos[k];
          const wi = sign * plan.sin[k];
          const a = i + j;
          const b = a + half;
          const xr = re[b] * wr - im[b] * wi;
          const xi = re[b] * wi + im[b] * wr;
          re[b] = re[a] - xr;
          im[b] = im[a] - xi;
          re[a] += xr;
          im[a] += xi;
        }
      }
    }
  }

  /**
   * r(τ) at a fractional lag from the power spectrum pow[0..kMax] of an
   * M-point transform (the cosine sum the inverse FFT samples at whole
   * lags), with its first two derivatives: [r, r', r''].
   */
  function lagSum(pow, kMax, M, tau) {
    const th = (2 * Math.PI * tau) / M;
    const c1 = Math.cos(th);
    const s1 = Math.sin(th);
    let c = 1;
    let s = 0;
    let r = pow[0];
    let d1 = 0;
    let d2 = 0;
    for (let k = 1; k <= kMax; k++) {
      const cn = c * c1 - s * s1;
      s = s * c1 + c * s1;
      c = cn;
      const p = 2 * pow[k];
      r += p * c;
      d1 -= k * p * s;
      d2 -= k * k * p * c;
    }
    const w = (2 * Math.PI) / M;
    return [r / M, (d1 * w) / M, (d2 * w * w) / M];
  }

  /** Power spectrum (bins 0..M/2) of the mean-removed frame under a Hann window, zero-padded to M. */
  const _hannWin = {};
  function hannPower(buf, mean, plan) {
    const N = buf.length;
    const M = plan.re.length;
    let w = _hannWin[N];
    if (!w) {
      w = _hannWin[N] = new Float64Array(N);
      for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * (i + 0.5)) / N);
    }
    const re = plan.re;
    const im = plan.im;
    for (let i = 0; i < M; i++) {
      re[i] = i < N ? (buf[i] - mean) * w[i] : 0;
      im[i] = 0;
    }
    fftInPlace(re, im, plan, -1);
    const out = new Float64Array((M >> 1) + 1);
    for (let i = 0; i <= M >> 1; i++) out[i] = re[i] * re[i] + im[i] * im[i];
    return out;
  }
  /**
   * How far a line near f (within 3 %) stands over the spectrum 40–80 Hz to
   * either side of it: the ratio of its highest bin to their mean power.
   */
  function lineOver(P, M, sr, f) {
    const bin = sr / M;
    const c = Math.round(f / bin);
    const w = Math.max(1, Math.ceil((0.03 * f) / bin));
    let pk = 0;
    for (let b = Math.max(1, c - w); b <= c + w && b < P.length; b++) if (P[b] > pk) pk = P[b];
    let s = 0;
    let n = 0;
    for (const sg of [-1, 1]) {
      for (let b = Math.ceil(40 / bin); b <= Math.floor(80 / bin); b++) {
        const k = c + sg * b;
        if (k > 0 && k < P.length) {
          s += P[k];
          n++;
        }
      }
    }
    return n && s > 0 ? pk / (s / n) : Infinity;
  }

  /**
   * Pitch of one frame (Hz), or null when the frame has none.
   */
  function detectPitch(buf, sampleRate) {
    // Over 48 kHz the engine's 43 ms frame holds more samples (4096 at
    // 96 kHz): averaged down to 44.1–48 kHz, the search costs and finds what
    // it does there (on all 4096 it took three times as long)
    const D = Math.round(sampleRate / 48000);
    if (D > 1) {
      const x = new Float32Array(Math.floor(buf.length / D));
      for (let i = 0; i < x.length; i++) {
        let s = 0;
        for (let k = 0; k < D; k++) s += buf[i * D + k];
        x[i] = s / D;
      }
      buf = x;
      sampleRate /= D;
    }
    const N = buf.length;
    let mean = 0;
    for (let i = 0; i < N; i++) mean += buf[i];
    mean /= N;
    let energy = 0;
    for (let i = 0; i < N; i++) {
      const v = buf[i] - mean;
      energy += v * v;
    }
    if (Math.sqrt(energy / N) < 0.01) return null; // silence
    const minLag = Math.max(2, Math.floor(sampleRate / PITCH_HI_HZ));
    const maxLag = Math.min(Math.ceil(sampleRate / PITCH_LO_HZ), N - 64);
    if (maxLag <= minLag + 2) return null;

    // r(τ) for every lag at once: |FFT|² of the frame, zero-padded past
    // N + maxLag so the circular product equals the linear one
    let M = 1;
    while (M < N + maxLag + 2) M <<= 1;
    const plan = fftPlan(M);
    const re = plan.re;
    const im = plan.im;
    const pow = plan.pow;
    for (let i = 0; i < M; i++) {
      re[i] = i < N ? buf[i] - mean : 0;
      im[i] = 0;
    }
    fftInPlace(re, im, plan, -1);
    let pAll = 0;
    for (let i = 0; i < M; i++) {
      const p = re[i] * re[i] + im[i] * im[i];
      re[i] = p;
      im[i] = 0;
      if (i <= M >> 1) {
        pow[i] = p;
        pAll += p;
      }
    }
    // The bins that hold all but 1e-6 of the power, for lagSum
    let kMax = M >> 1;
    for (let acc = 0; kMax > 1 && acc + pow[kMax] < 1e-6 * pAll; kMax--) acc += pow[kMax];
    fftInPlace(re, im, plan, 1);
    const L = maxLag + 2;
    const nsdf = plan.nsdf;
    const mm = plan.m;
    let m = 2 * energy;
    for (let t = 0; t < L; t++) {
      if (t > 0) {
        const a = buf[t - 1] - mean;
        const b = buf[N - t] - mean;
        m -= a * a + b * b;
      }
      mm[t] = m;
      nsdf[t] = m > 0 ? (2 * re[t]) / M / m : 0;
    }

    // Key maxima: the top of each positive lobe after the first
    // negative-going zero crossing, refined by a parabola through its three
    // samples. A lobe whose top is under sr / 1500 is kept, marked short: if
    // it is the one picked, the period is shorter than the search allows (a
    // whistle, a soprano's G6) and the frame reads nothing, not an octave of
    // it.
    const keys = [];
    let t = 1;
    while (t < L && nsdf[t] > 0) t++;
    let top = -1;
    const refineBelow = REFINE_MINLAGS * minLag;
    const close = () => {
      const a = nsdf[top - 1];
      const b = nsdf[top];
      const c = nsdf[top + 1];
      const den = a - 2 * b + c;
      const sh = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;
      let lag = top + sh;
      let n = b - 0.25 * (a - c) * sh;
      if (top < refineBelow) {
        // r(τ) itself near the top: Newton on the cosine sum, kept only
        // where it reads higher than the sample at the top
        const mAt = (x) => {
          const i = Math.min(L - 2, Math.floor(x));
          return mm[i] + (mm[i + 1] - mm[i]) * (x - i);
        };
        let x = lag;
        n = b;
        lag = top;
        for (let it = 0; it < 3; it++) {
          const g = lagSum(pow, kMax, M, x);
          const v = (2 * g[0]) / mAt(x);
          if (v > n) {
            n = v;
            lag = x;
          }
          if (!(g[2] < 0)) break;
          const dx = Math.max(-0.5, Math.min(0.5, -g[1] / g[2]));
          if (Math.abs(dx) < 1e-3) break;
          x = Math.max(top - 1, Math.min(top + 1, x + dx));
        }
      }
      keys.push({ lag, n: Math.min(1, n) });
      top = -1;
    };
    for (; t < L - 1; t++) {
      if (nsdf[t] > 0) {
        if (nsdf[t] >= nsdf[t - 1] && nsdf[t] >= nsdf[t + 1] && (top < 0 || nsdf[t] > nsdf[top])) top = t;
      } else if (top >= 0) close();
    }
    if (top >= 0) close();
    if (!keys.length) return null;
    let best = 0;
    for (const q of keys) if (q.lag >= minLag && q.n > best) best = q.n;
    if (best < MIN_CLARITY) return null;

    const kMin = MPM_K * best;
    let hann = null;
    const near = (lag) => {
      let w = null;
      for (const q of keys) if (Math.abs(q.lag - lag) <= Math.max(2, 0.03 * lag) && (!w || q.n > w.n)) w = q;
      return w;
    };
    const ok = (q, k) => {
      if (q.n < k) return false;
      // Shorter than the search allows (SHORT_C, SHORT_LOW): only as the
      // frame's own period, as periodic as the best key maximum and with
      // nothing under it in the spectrum
      if (q.lag < minLag) {
        if (1 - q.n > SHORT_C * (1 - best) + 1e-4) return false;
        if (!hann) hann = hannPower(buf, mean, plan);
        const bin = sampleRate / M;
        let low = 0;
        let peak = 0;
        for (let b = Math.round(80 / bin); b < hann.length; b++) {
          if (hann[b] > peak) peak = hann[b];
          if (b * bin <= (0.8 * sampleRate) / q.lag && hann[b] > low) low = hann[b];
        }
        return low < SHORT_LOW * peak;
      }
      if (sampleRate / q.lag < APER_FROM_HZ || q.n >= best) return true;
      if (1 - q.n > APER_CAP) return false;
      // The best key maximum up to APER_SPAN times the lag: the period, if
      // the candidate is a part of it
      let nb = 0;
      for (const o of keys) if (o.lag > q.lag && o.lag <= APER_SPAN * q.lag && o.n > nb) nb = o.n;
      return q.n >= nb || 1 - q.n <= APER_C * (1 - nb) + APER_EPS;
    };
    let pick = null;
    for (const q of keys) {
      if (!ok(q, kMin)) continue;
      pick = q;
      break;
    }
    if (!pick) return null;
    for (let i = 0; i < 2; i++) {
      const lag2 = 2 * pick.lag;
      if (lag2 > L - 2 || sampleRate / lag2 < OCT_FLOOR_HZ) break;
      const w = near(lag2);
      const a1 = 1 - pick.n;
      if (!w || a1 < OCT_MIN_APER) break;
      const a2 = 1 - w.n;
      const fp = sampleRate / pick.lag;
      const hi = fp >= LINE_FROM_HZ;
      let down = a2 <= OCT_RATIO * a1;
      if (!down && a2 <= (hi ? OCT_ODD_A2_HI : 1) * a1) {
        const w3 = near(3 * pick.lag);
        if (w3) down = (5 * a1 + 3 * (1 - w3.n) - 8 * a2) / (8 * a1) >= (hi ? OCT_ODD_HI : OCT_ODD);
      }
      // From LINE_FROM_HZ, only if the lower pitch's first and third
      // harmonics are lines in the spectrum, not a formant's band of noise
      if (down && hi) {
        if (!hann) hann = hannPower(buf, mean, plan);
        down = lineOver(hann, M, sampleRate, fp / 2) >= LINE_H1 && lineOver(hann, M, sampleRate, 1.5 * fp) >= LINE_H3;
      }
      if (!down) break;
      pick = w;
    }
    // Under LOW_HZ: a voice a loud hum pulled to a period both share?
    if (sampleRate / pick.lag < LOW_HZ) {
      for (const d of [2, 3]) {
        const h = near(pick.lag / d);
        if (h && h.lag >= minLag && h.n >= LOW_K * best && ok(h, 0)) {
          pick = h;
          break;
        }
      }
    }
    if (pick.n < MIN_CLARITY || pick.lag < minLag) return null;
    if (sampleRate / pick.lag >= HI_FROM_HZ && best < HI_MIN_BEST) return null;
    let freq = sampleRate / pick.lag;
    if (MAINS_HZ.some((h) => Math.abs(freq - h) <= MAINS_TOL * h)) {
      // A hum, or a voice over one: the voice's own period, if there is one
      let alt = null;
      for (const q of keys) {
        if (q.lag >= pick.lag) break;
        if (q.lag >= minLag && ok(q, MAINS_K * best)) {
          alt = q;
          break;
        }
      }
      if (!alt) return null;
      freq = sampleRate / alt.lag;
    }
    return freq >= PITCH_LO_HZ && freq <= PITCH_HI_HZ * 1.06 ? freq : null;
  }

  /**
   * How periodic a frame is, 0–1, at any level: a voice or a hum reads 0.7
   * and up even under a fan as loud as itself; a fan's noise, a hiss or a
   * breath stays under 0.5. detectPitch cannot say this: it reads nothing
   * under −40 dBFS, however periodic the frame.
   *
   * YIN's cumulative-mean-normalised difference (de Cheveigné & Kawahara,
   * 2002) over periods of 60–500 Hz, on the frame summed down to ~12 kHz:
   * a voice's period needs no more (a higher voice repeats at twice its
   * period too), and it takes about 0.1–0.25 ms a frame. The longest
   * period it tries is half the frame, so the frame must last 34 ms to
   * reach 60 Hz: the engine's lasts about 43 ms at any sample rate.
   */
  function clarity(buf, sampleRate) {
    const sr = sampleRate || 48000;
    const D = Math.max(1, Math.round(sr / 12000));
    const n = Math.floor(buf.length / D);
    const x = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let s = 0;
      for (let k = 0; k < D; k++) s += buf[i * D + k];
      x[i] = s;
    }
    const rate = sr / D;
    const minLag = Math.floor(rate / 500);
    const maxLag = Math.min(Math.ceil(rate / 60), n >> 1);
    const w = n - maxLag;
    let run = 0;
    let best = 1;
    for (let lag = 1; lag <= maxLag; lag++) {
      let d = 0;
      for (let i = 0; i < w; i++) {
        const e = x[i] - x[i + lag];
        d += e * e;
      }
      run += d;
      if (lag >= minLag && run > 0) best = Math.min(best, (d * lag) / run);
    }
    return run > 0 ? Math.max(0, Math.min(1, 1 - best)) : 0;
  }

  /**
   * How the highway draws, for the exercise that owns the overlay. Every
   * default is the highway as it always was; an exercise passes only what it
   * changes, as the second argument of setOverlay(fn, display) (or later with
   * setDisplay). Clearing the overlay restores all of them.
   */
  const DISPLAY_DEFAULTS = {
    /** Tick the attached pitch game (score, combo, challenge locks). */
    game: true,
    /** The game's flash words, challenge box and lock ring on the canvas. */
    gameFlash: true,
    /** A listen window: the game sees silence, so nothing scores or locks. */
    gameHold: false,
    /** Cents to the nearest octave of the target (an octave match counts). */
    foldOctave: false,
    /** Amber target trail and its dots. */
    targetTrail: true,
    /** The blue moving-average precision band. */
    band: true,
    /** "zones": the voice trail coloured by cents; "none": the overlay draws the voice. */
    trail: "zones",
    /** The green lane on the target, the amber chord-tone lanes, the dim ghost lanes. */
    primaryLane: true,
    chordLanes: true,
    ghostLanes: true,
    /** The chord / note badge at the top centre. */
    chordBadge: true,
    /** [{ midi, label }]: the ghost lanes to draw instead of the progression's. */
    lanes: null,
    /** Half-width of the green lane, exactly, in cents (the band that counts). */
    laneCents: null,
    /** { min, max, pad, minSpan } in MIDI: the Y window, whatever was locked. */
    range: null,
    /**
     * > 0: x is time, not frame count — the last `pastSec` seconds end at
     * "now", at `nowAt` of the plot width, and overlays place things ahead of
     * it with geo.xAtTime(t). Under reduced motion the picture pages instead
     * of scrolling.
     */
    pastSec: 0,
    nowAt: null,
    /** "nearest": the stats readout names the nearest note (nothing to miss). */
    stats: "target",
    /** Light the target key on the keyboard strip. */
    keyboardTarget: true,
    /** After Stop keep the last picture (the overlay's review), not the idle card. */
    keepOnStop: false,
    /**
     * Px under the stage's top rail the overlay's own header uses (a number,
     * or fn(graphH, safeTop) → px): the display.range starts below it, so the
     * top note is not drawn under the header. null = the usual 8 % margin.
     */
    headPx: null
  };

  function prefersReducedMotion() {
    try {
      return !!global.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    } catch {
      return false;
    }
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
      /**
       * Exercise-drawn layers (js/practice-modes.js): fn(ctx, geo, layer) with
       * layer "under" (after the lanes) and "over" (after your trail).
       */
      this.overlay = null;
      /**
       * Notes still to sing, current first: [{ midi, label, sub }]. When set,
       * "now" moves in from the right edge and the next notes wait to its
       * right, so a scale is read ahead like a line of music instead of
       * discovered one step at a time.
       */
      this.noteQueue = null;
      this.queueProgress = 0;
      /** See DISPLAY_DEFAULTS. */
      this.display = Object.assign({}, DISPLAY_DEFAULTS);
      /** fn(ctx, geo): what an exercise shows before Start instead of the generic card. */
      this.idlePainter = null;
      this._frozenAt = null;
      this._pageStart = null;

      this._resize();
      window.addEventListener("resize", () => this._resize());
    }

    /**
     * @param {Function|null} fn overlay painter fn(ctx, geo, "under"|"over")
     * @param {object} [display] how the highway draws while this overlay is on
     *   (see DISPLAY_DEFAULTS); omitted = the highway as always
     */
    setOverlay(fn, display) {
      this.overlay = typeof fn === "function" ? fn : null;
      this.display = Object.assign({}, DISPLAY_DEFAULTS, this.overlay && display ? display : null);
      this._pageStart = null;
    }

    /** Change some display options of the current overlay (see DISPLAY_DEFAULTS). */
    setDisplay(patch) {
      if (patch && typeof patch === "object") Object.assign(this.display, patch);
    }

    /** fn(ctx, geo) painted on the empty highway before Start; null for the default card. */
    setIdle(fn) {
      this.idlePainter = typeof fn === "function" ? fn : null;
    }

    /** @param {{midi:number,label?:string,sub?:string}[]|null} items current first */
    setNoteQueue(items) {
      this.noteQueue = items && items.length ? items.slice(0, 8) : null;
      this.queueProgress = 0;
    }

    /** How far the current queued note's hold has got, 0..1. */
    setQueueProgress(p) {
      this.queueProgress = Math.max(0, Math.min(1, Number(p) || 0));
    }

    attachGame(game) {
      this.game = game;
    }

    _resize() {
      const dpr = window.devicePixelRatio || 1;
      const rect = this.canvas.getBoundingClientRect();
      const w = Math.max(320, rect.width || 640);
      // Taller highway for multi-lane + low-vision note channels. The lanes
      // start under the coach strip now, and a laid-out canvas keeps its own
      // height: a 300 px floor only shrank the whole drawing into the middle
      // of a short box (object-fit), e.g. on a rotated phone.
      const h = Math.max(120, rect.height || 340);
      this.canvas.width = Math.floor(w * dpr);
      this.canvas.height = Math.floor(h * dpr);
      this.ctx2d.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.w = w;
      this.h = h;
      // The stage's top HUD row sits over the canvas and on phones wraps to two
      // rows; a badge drawn under it was cut off (the chord letter). The app
      // calls this after each layout fit, so measuring here stays current.
      this.safeTop = 0;
      try {
        const rail = this.canvas.closest(".highway-stage")?.querySelector(".hud-top-rail");
        let bottom = rect.top;
        [...(rail?.children || [])].forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.height) bottom = Math.max(bottom, r.bottom);
        });
        this.safeTop = Math.max(0, Math.min(h * 0.4, bottom - rect.top));
      } catch {
        /* detached canvas */
      }
      // Likewise the bottom rail (MIC, controls) covers the canvas's foot on
      // a rotated phone; overlays that draw near the bottom read this.
      this.safeBottom = 0;
      try {
        const low = this.canvas.closest(".highway-stage")?.querySelector(".hud-bottom-rail");
        let top = rect.bottom;
        [...(low?.children || [])].forEach((el) => {
          const r = el.getBoundingClientRect();
          if (r.height && r.top < rect.bottom) top = Math.min(top, r.top);
        });
        this.safeBottom = Math.max(0, Math.min(h * 0.4, rect.bottom - top));
      } catch {
        /* detached canvas */
      }
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
      // The singing register, 120–280 Hz, moved with the material by the
      // octave control (the chord's notes arrive already shifted)
      const reg = Math.pow(2, global.VTGetOctaveShift ? global.VTGetOctaveShift() : 0);
      let noteList = chord.notes.slice();
      if (oneNote) {
        let pick = opts.noteName || chord.notes[0];
        if (!opts.noteName) {
          for (const n of chord.notes) {
            const f = map[n];
            if (f && f >= 120 * reg && f <= 280 * reg) {
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
          if (f && f >= 120 * reg && f <= 280 * reg) {
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
      this.overlay = null;
      this.display = Object.assign({}, DISPLAY_DEFAULTS);
      this.idlePainter = null;
      this._frozenAt = null;
      this._pageStart = null;
      this.noteQueue = null;
      this.queueProgress = 0;
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
      this._frozenAt = null;
      this._pageStart = null;
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
      // The clock stops with the take: a review drawn later stays where it was
      this._frozenAt = performance.now();
      this._drawIdle();
    }

    _ingest(f, dtMs = 16) {
      const d = this.display || DISPLAY_DEFAULTS;
      // Multi-lane truth: score vs nearest active chord tone when lanes exist.
      // A challenge asks for one note, so it scores against that note only:
      // any nearer lane said "BIEN" on G3 while A2 was asked.
      let scoreFreq = this.targetFreq;
      let scoreName = null;
      const challenge = !!(this.game && this.game.challengeMode);
      if (f && d.stats === "nearest") {
        // Free singing (a siren, a song): there is no target to miss, so the
        // readout names the note you are on and how far from its centre
        const vm = Math.round(freqToMidi(f));
        scoreFreq = midiToFreq(vm);
        scoreName = midiToName(vm);
      } else if (f && !challenge && d.chordLanes !== false && this.chordLanes && this.chordLanes.length) {
        // (Lanes an overlay hid are not what it scores against: s9's challenge
        // note used to be scored against the progression chord left over from
        // opening the exercise.)
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
        // An octave match is the same note (and the detector itself slips octaves)
        if (d.foldOctave && Math.abs(cents) > 600) {
          cents = ((((cents + 600) % 1200) + 1200) % 1200) - 600;
        }
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
      const gameOn = !!this.game && d.game !== false;
      if (gameOn) {
        // A listen window feeds the game silence: nothing scores or locks
        gameSnap = d.gameHold ? this.game.tick(null, false, dtMs) : this.game.tick(cents, f != null, dtMs);
      }

      const now = performance.now();
      this.history.push({
        targetMidi,
        voiceMidi,
        cents,
        t: now
      });
      if (d.pastSec > 0) {
        // Time-based: keep what the window shows (plus a margin), not a frame count
        const cut = now - (d.pastSec + 1.5) * 1000;
        let drop = 0;
        while (drop < this.history.length - 2 && this.history[drop].t < cut) drop++;
        if (this.history.length - drop > 2400) drop = this.history.length - 2400;
        if (drop) this.history.splice(0, drop);
      } else if (this.history.length > this.maxPoints) {
        this.history.splice(0, this.history.length - this.maxPoints);
      }

      if (this.onStats) {
        this.onStats({
          targetFreq: scoreFreq || this.targetFreq,
          targetName: scoreName || midiToName(targetMidi),
          // targetName is the nearest note, not a target (display.stats "nearest")
          nearest: d.stats === "nearest",
          voiceFreq: f,
          voiceName: f ? midiToName(freqToMidi(f)) : "—",
          accuracyCents: this.accuracyCents,
          precisionCents: this.precisionCents,
          maAbs: this.maAbs,
          // No game: the readout stays on the note, not a score
          game: gameOn ? gameSnap || this.game.snapshot() : null
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
    /** The Y window in MIDI: an overlay's display.range wins over any lock. */
    _range() {
      const r = this.display && this.display.range;
      if (r && Number.isFinite(r.min) && Number.isFinite(r.max)) {
        const n = this._normalizeRange(r.min, r.max, r.pad != null ? r.pad : 1, r.minSpan != null ? r.minSpan : 8);
        return { min: n.minMidi, max: n.maxMidi };
      }
      if (
        this.rangeMinMidi != null &&
        this.rangeMaxMidi != null &&
        this.rangeMaxMidi > this.rangeMinMidi
      ) {
        return { min: this.rangeMinMidi, max: this.rangeMaxMidi };
      }
      return null;
    }

    _midiToY(midi, centerMidi, graphH) {
      const gh = graphH != null ? graphH : this.h - 44;
      const pad = 0.08 * gh;
      const range = this._range();
      if (range) {
        const span = range.max - range.min;
        const t = (midi - range.min) / span;
        const clamped = Math.max(0, Math.min(1, t));
        const d = this.display || DISPLAY_DEFAULTS;
        let top = pad;
        if (d.headPx != null) {
          const st = this.safeTop || 0;
          const px = typeof d.headPx === "function" ? Number(d.headPx(gh, st)) || 0 : Number(d.headPx) || 0;
          top = Math.max(pad, Math.min(gh * 0.45, st + px));
        }
        return gh - pad - clamped * (gh - pad - top);
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
      // white keys C2–C4-ish 15 keys, moved with the material by the octave
      // control (at +2 they are C4–C6, where the shifted notes are)
      const lo = 36 + 12 * (global.VTGetOctaveShift ? global.VTGetOctaveShift() : 0);
      const hi = lo + 24;
      const whites = [];
      for (let m = lo; m <= hi; m++) {
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
        if ([0, 2, 5, 7, 9].includes(pc) && m + 1 <= hi) {
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
      const h = Math.max(120, this.h || this.canvas?.clientHeight || 300);
      this.w = w;
      this.h = h;
      // A stopped take whose exercise keeps its review: redraw that, frozen
      if (this.display.keepOnStop && this.overlay && this._frozenAt) {
        try {
          this._draw();
          return;
        } catch (err) {
          console.warn("[viz review]", err);
        }
      }
      ctx.clearRect(0, 0, w, h);
      if (this.idlePainter) {
        try {
          this._drawIdleFor(ctx, w, h);
          return;
        } catch (err) {
          console.warn("[viz idle]", err);
        }
      }
      // Richer empty state (research: tuners/pitch apps show lanes before audio)
      const bg = ctx.createLinearGradient(0, 0, 0, h);
      bg.addColorStop(0, "#0e1622");
      bg.addColorStop(0.5, "#121c2c");
      bg.addColorStop(1, "#0c121a");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      const graphH = h - 58;
      const mid = graphH * 0.45;
      // Half the lane's height: 40px, less on a canvas made short by the coach
      // strip on a small phone, where the second hint line is dropped.
      const band = Math.min(40, Math.max(14, graphH * 0.2));
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
      ctx.fillRect(0, mid - band, w, band * 2);
      ctx.fillStyle = "rgba(79, 212, 146, 0.38)";
      ctx.fillRect(0, mid - band * 0.55, w, band * 1.1);
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
      ctx.moveTo(0, mid - band * 0.55);
      ctx.lineTo(w, mid - band * 0.55);
      ctx.moveTo(0, mid + band * 0.55);
      ctx.lineTo(w, mid + band * 0.55);
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
      ctx.fillText(f0.text, w / 2, mid - band - 12);
      ctx.fillStyle = "#f2f6fc";
      const f1 = fitCanvasLabel(ctx, idle1, maxIdle, "700 16px system-ui,sans-serif");
      ctx.font = f1.font;
      ctx.fillText(f1.text, w / 2, mid + band + 12);
      if (mid + band + 34 <= graphH) {
        const f2 = fitCanvasLabel(ctx, idle2, maxIdle, "600 13px system-ui,sans-serif");
        ctx.font = f2.font;
        ctx.fillStyle = "#b8c8dc";
        ctx.fillText(f2.text, w / 2, mid + band + 34);
      }
      this._drawKeyboard(ctx, w, h, null, null);
    }

    /**
     * The empty highway an exercise dressed for itself (setIdle): background,
     * a faint grid, then its painter — what the exercise will ask for, shown
     * before Start instead of the generic "sing in the green lane" card.
     */
    _drawIdleFor(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, "#0c121a");
      g.addColorStop(0.45, "#121c2a");
      g.addColorStop(1, "#0c121a");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      const graphH = h - 58;
      const centerMidi = freqToMidi(this.targetFreq || 130.81);
      const range = this._range();
      const lo = range ? Math.floor(range.min) : Math.floor(centerMidi - 6);
      const hi = range ? Math.ceil(range.max) : Math.ceil(centerMidi + 6);
      ctx.strokeStyle = "rgba(170, 195, 230, 0.12)";
      ctx.lineWidth = 1.5;
      for (let m = lo; m <= hi; m++) {
        const y = this._midiToY(m, centerMidi, graphH);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      const gutter = Math.max(72, Math.min(w * 0.14, 140));
      const laneRight = Math.max(8, w - gutter);
      const plotRight = Math.max(48, laneRight - 20);
      this.idlePainter(ctx, {
        w,
        h,
        graphH,
        laneRight,
        plotLeft: 12,
        plotRight,
        nowX: plotRight,
        safeTop: this.safeTop || 0,
        safeBottom: this.safeBottom || 0,
        midiToY: (m) => this._midiToY(m, centerMidi, graphH),
        rangeMinMidi: range ? range.min : lo,
        rangeMaxMidi: range ? range.max : hi,
        idle: true
      });
      this._drawKeyboard(ctx, w, h, null, null);
    }

    _draw() {
      const ctx = this.ctx2d;
      const w = this.w;
      const h = this.h;
      const d = this.display || DISPLAY_DEFAULTS;
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

      // Range-aware semitone grid. It recedes (.12, was .38): at 2.5:1 every grid
      // line outshone the lane to sing (PR-3).
      const range = this._range();
      const lo = range ? Math.floor(range.min) : Math.floor(centerMidi - 6);
      const hi = range ? Math.ceil(range.max) : Math.ceil(centerMidi + 6);
      ctx.strokeStyle = "rgba(170, 195, 230, 0.12)";
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
      // 3) Primary singing target = green active lane, always. It was drawn
      //    only when the target was also a chord tone, so on solfège and
      //    pitch-match drills the note to sing was the faintest lane (PR-3).
      const spanSt = Math.max(6, hi - lo);
      // Thicker lanes when canvas is tall (low-vision friendly)
      const laneHalf = Math.max(8, (zones.good / 100) * (graphH / spanSt) * 1.55);
      // An exercise can ask for the band that actually counts, exactly
      const midMidi = range ? (range.min + range.max) / 2 : centerMidi;
      const tolHalf =
        d.laneCents > 0
          ? Math.max(
              4,
              Math.abs(
                this._midiToY(midMidi + d.laneCents / 100, centerMidi, graphH) -
                  this._midiToY(midMidi, centerMidi, graphH)
              )
            )
          : null;
      const primaryMidi =
        d.primaryLane === false ? NaN : Math.round(freqToMidi(this.targetFreq) * 2) / 2;
      const lanes = d.chordLanes === false ? [] : (this.chordLanes || []).slice();
      if (
        d.primaryLane !== false &&
        !lanes.some((L) => Math.round(L.midi * 2) / 2 === primaryMidi)
      ) {
        lanes.push({ midi: primaryMidi, label: noteNameToDual(primaryMidi) });
      }
      const activeMidis = new Set(lanes.map((L) => Math.round(L.midi * 2) / 2));

      // Right gutter for dual labels (~14%); never paint past canvas edge
      const gutter = Math.max(72, Math.min(w * 0.14, 140));
      const laneRight = Math.max(8, w - gutter);
      const labelMaxW = gutter - 12;
      const labelPadR = 6;
      // Trails end left of the label column: the live dot and its halo used to
      // sit on the lane labels at the right edge ("G3 S…").
      const plotRight = Math.max(48, laneRight - 20);
      const queue = this.noteQueue;
      // With notes queued, "now" sits left of the lane labels by a third so
      // the next notes have room; otherwise it stays at the right edge.
      const timeBased = d.pastSec > 0;
      let nowX =
        timeBased && d.nowAt != null
          ? Math.round(12 + (plotRight - 12) * Math.max(0.2, Math.min(1, d.nowAt)))
          : queue
            ? Math.round(12 + (plotRight - 12) * 0.62)
            : plotRight;
      // Time-based x: the clock, frozen when the take stops
      const tNow = this.running || !this._frozenAt ? performance.now() : this._frozenAt;
      const pxPerSec = timeBased ? (nowX - 12) / d.pastSec : 0;
      let xAtTime = null;
      if (timeBased) {
        if (prefersReducedMotion()) {
          // No scrolling: "now" walks across a still page, then a new page
          // starts. What was sung stays where it was drawn.
          const pageMs = d.pastSec * 1000;
          if (this._pageStart == null || tNow < this._pageStart || tNow - this._pageStart > pageMs) {
            this._pageStart = tNow;
          }
          const p0 = this._pageStart;
          nowX = Math.round(12 + ((tNow - p0) / 1000) * pxPerSec);
          xAtTime = (t) => 12 + ((t - p0) / 1000) * pxPerSec;
        } else {
          const nx = nowX;
          xAtTime = (t) => nx - ((tNow - t) / 1000) * pxPerSec;
        }
      }
      const xAt = timeBased
        ? (i) => xAtTime(this.history[i] ? this.history[i].t : tNow)
        : (i) => (i / (this.maxPoints - 1)) * (nowX - 12) + 12;
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
        // The band that counts, when the exercise gave it in cents
        const half = isPrimary && tolHalf ? tolHalf : laneHalf;
        ctx.fillStyle = isPrimary
          ? "rgba(79, 212, 146, 0.32)"
          : "rgba(240, 184, 80, 0.26)";
        ctx.fillRect(0, y - half, laneRight, half * 2);
        if (isPrimary && tolHalf) {
          ctx.strokeStyle = "rgba(160, 255, 210, 0.6)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(0, y - half + 0.5);
          ctx.lineTo(laneRight, y - half + 0.5);
          ctx.moveTo(0, y + half - 0.5);
          ctx.lineTo(laneRight, y + half - 0.5);
          ctx.stroke();
        }
        ctx.strokeStyle = isPrimary
          ? "rgba(160, 255, 210, 1)"
          : "rgba(255, 220, 150, 0.95)";
        ctx.lineWidth = isPrimary ? (tolHalf ? 2 : 3.5) : 2.5;
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
      const ghostSource = Array.isArray(d.lanes)
        ? d.lanes
        : d.ghostLanes === false
          ? []
          : this.progressionLanes || [];
      ghostSource.forEach((lane) => {
        const k = Math.round(lane.midi * 2) / 2;
        if (activeMidis.has(k)) return;
        const y = drawLaneBand(lane, "ghost");
        ghostLanes.push({ lane, y });
      });
      const activeDrawn = [];
      lanes.forEach((lane) => {
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

      // Range labels left edge (compact dual, clamp into graph)
      const hiY = Math.max(12, Math.min(graphH - 4, this._midiToY(hi, centerMidi, graphH) + 4));
      const loY = Math.max(12, Math.min(graphH - 4, this._midiToY(lo, centerMidi, graphH) + 4));
      ctx.textAlign = "left";
      // With the octave: "D# Re♯" at both edges of a 12-semitone window read
      // as the same note (the audit's top and bottom labels)
      const hiLab = midiToDualLabel(hi, true);
      const loLab = midiToDualLabel(lo, true);
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
      // Chord/note badge — clamp width so it never clips under TR/TL, and keep
      // it below the HUD row that covers the canvas top on phones
      const badgeTop = Math.max(graphH * 0.02, (this.safeTop || 0) + 4);
      let cueTop = Math.max(graphH * 0.08, (this.safeTop || 0) + 4);
      if (this.activeChordName && d.chordBadge !== false) {
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
        ctx.fillRect(w / 2 - cw / 2 - 6, badgeTop, cw + 12, 16);
        ctx.fillStyle = "#ffe8b8";
        ctx.fillText(f.text, w / 2, badgeTop + 12);
        cueTop = Math.max(cueTop, badgeTop + 20);
      }

      const geo = {
        w,
        h,
        graphH,
        laneRight,
        plotLeft: 12,
        plotRight,
        nowX,
        laneHalf,
        safeTop: this.safeTop || 0,
        safeBottom: this.safeBottom || 0,
        midiToY: (m) => this._midiToY(m, centerMidi, graphH),
        xAt,
        history: this.history,
        maxPoints: this.maxPoints,
        rangeMinMidi: range ? range.min : this.rangeMinMidi,
        rangeMaxMidi: range ? range.max : this.rangeMaxMidi,
        // Additive (display.pastSec > 0): time runs left to right to "now"
        timeBased,
        tNow,
        pxPerSec,
        xAtTime: xAtTime || ((t) => nowX - ((tNow - t) / 1000) * ((nowX - 12) / 4)),
        /** Half-height in px of display.laneCents (null when not set) */
        tolHalf,
        running: !!this.running,
        display: d
      };
      if (this.overlay) {
        try {
          this.overlay(ctx, geo, "under");
        } catch (err) {
          console.warn("[viz overlay]", err);
        }
      }
      if (queue) this._drawQueue(ctx, geo, queue);

      const n = this.history.length;
      const lastVoiceMidi = n ? this.history[n - 1].voiceMidi : null;

      if (n && d.band !== false) {
        // Precision MA band
        const bandPtsTop = [];
        const bandPtsBot = [];
        for (let i = 0; i < n; i++) {
          const x = xAt(i);
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
      }

      if (n && d.targetTrail !== false) {
        // Target trail
        ctx.lineWidth = 3;
        ctx.strokeStyle = "rgba(240,201,160,0.4)";
        ctx.shadowColor = "rgba(240,201,160,0.9)";
        ctx.shadowBlur = 14;
        ctx.beginPath();
        for (let i = 0; i < n; i++) {
          const x = xAt(i);
          const y = this._midiToY(this.history[i].targetMidi, centerMidi, graphH);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        for (let i = 0; i < n; i++) {
          const x = xAt(i);
          const y = this._midiToY(this.history[i].targetMidi, centerMidi, graphH);
          const alpha = 0.15 + (i / n) * 0.85;
          ctx.beginPath();
          ctx.fillStyle = `rgba(240,201,160,${alpha})`;
          ctx.arc(x, y, i === n - 1 ? 6 : 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      if (n && d.trail !== "none") {
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
          const x = xAt(i);
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
          const x = xAt(i);
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
          const vx = xAt(n - 1);
          const vy = this._midiToY(last.voiceMidi, centerMidi, graphH);
          // lock-on ring (hold-to-clear)
          if (game && d.gameFlash !== false && game.lockProgress > 0) {
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
      if (game && d.game !== false && d.gameFlash !== false) {
        if (game.challengeMode) {
          const es =
            (global.VTI18n && global.VTI18n.lang === "es") ||
            document.documentElement.lang === "es";
          ctx.textAlign = "center";
          ctx.fillStyle = "rgba(12,18,26,0.65)";
          ctx.fillRect(w / 2 - 110, cueTop, 220, 28);
          ctx.fillStyle = "#f0c9a0";
          ctx.font = "600 12px system-ui,sans-serif";
          ctx.fillText(
            es
              ? `Nota ${game.challengeNote || "—"}  (${game.challengeCleared}/${game.challengeTotal})`
              : `Match ${game.challengeNote || "—"}  (${game.challengeCleared}/${game.challengeTotal})`,
            w / 2,
            cueTop + 18
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

      if (this.overlay) {
        try {
          this.overlay(ctx, geo, "over");
        } catch (err) {
          console.warn("[viz overlay]", err);
        }
      }

      this._drawKeyboard(
        ctx,
        w,
        h,
        d.keyboardTarget === false || d.primaryLane === false ? null : centerMidi,
        lastVoiceMidi
      );
    }

    /**
     * The queued notes as blocks on their lanes: the current one straddles
     * "now" and fills as you hold it; the next ones wait to its right and
     * fade with distance. Each carries its syllable, so the eye reads
     * DO RE MI where the ear hears it.
     */
    _drawQueue(ctx, geo, queue) {
      const { nowX, laneRight, laneHalf } = geo;
      const room = Math.max(40, laneRight - nowX - 6);
      const visible = Math.min(queue.length, 5);
      const bw = Math.max(34, Math.min(88, room / Math.max(1.6, visible - 0.4)));
      const gap = Math.max(6, bw * 0.14);
      const bh = Math.max(16, Math.min(34, laneHalf * 1.7));
      for (let k = visible - 1; k >= 0; k--) {
        const it = queue[k];
        if (!it || !Number.isFinite(it.midi)) continue;
        const y = geo.midiToY(it.midi);
        const x0 = k === 0 ? nowX - bw * 0.5 : nowX + bw * 0.5 + gap + (k - 1) * (bw + gap);
        if (x0 > laneRight) continue;
        const bwk = Math.min(bw, laneRight - x0);
        const cur = k === 0;
        const alpha = cur ? 1 : Math.max(0.35, 0.9 - k * 0.14);
        ctx.save();
        ctx.globalAlpha = alpha;
        const r = 7;
        ctx.beginPath();
        ctx.moveTo(x0 + r, y - bh / 2);
        ctx.arcTo(x0 + bwk, y - bh / 2, x0 + bwk, y + bh / 2, r);
        ctx.arcTo(x0 + bwk, y + bh / 2, x0, y + bh / 2, r);
        ctx.arcTo(x0, y + bh / 2, x0, y - bh / 2, r);
        ctx.arcTo(x0, y - bh / 2, x0 + bwk, y - bh / 2, r);
        ctx.closePath();
        ctx.fillStyle = cur ? "rgba(79, 212, 146, 0.28)" : "rgba(10, 16, 24, 0.82)";
        ctx.fill();
        if (cur && this.queueProgress > 0) {
          ctx.save();
          ctx.clip();
          ctx.fillStyle = "rgba(79, 212, 146, 0.62)";
          ctx.fillRect(x0, y - bh / 2, bwk * this.queueProgress, bh);
          ctx.restore();
        }
        ctx.lineWidth = cur ? 2.5 : 1.5;
        ctx.strokeStyle = cur ? "rgba(160, 255, 210, 1)" : "rgba(200, 220, 245, 0.8)";
        if (!cur) ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
        const text = it.label || midiToName(Math.round(it.midi));
        const qFont = `${cur ? 800 : 700} ${cur ? 13 : 12}px system-ui,sans-serif`;
        let f = fitCanvasLabel(ctx, text, bwk - 8, qFont);
        // Optional short form ({midi, label, short}) when the full one would be cut
        if (it.short && f.text !== text) f = fitCanvasLabel(ctx, it.short, bwk - 8, qFont);
        ctx.font = f.font;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = cur ? "#eafff4" : "#dce6f4";
        ctx.fillText(f.text, x0 + bwk / 2, y + 0.5);
        ctx.restore();
      }
      ctx.textBaseline = "alphabetic";
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
    detectPitch,
    clarity
  };
})(window);
