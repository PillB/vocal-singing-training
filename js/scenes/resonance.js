/**
 * Exercise pictures — resonance: five vowels (s20), the resonance zones
 * (s21–s25) and the placement A/B takes (s26).
 *
 * What a microphone can and cannot say here (docs/39-EXERCISE-VISUALS.md,
 * research synthesis §3F and the myths list):
 * - It hears pitch, loudness, how clear (periodic) the tone is, how much of
 *   the energy sits high in the spectrum ("brightness"), and — at low and
 *   middle pitches — roughly where the first two vowel resonances are.
 * - It cannot hear "placement", the mask, chest or head "resonance", the soft
 *   palate or the jaw. Chest and head are registers, measured here as the
 *   pitch range you are in; the mask is a sensation, and what the ear calls
 *   "forward" tracks brightness, so brightness is what is shown — named as
 *   brightness, never as placement.
 * - Every spectral reading is approximate and read against the learner's own
 *   takes: a phone at arm's length and a headset differ far more than two
 *   placements do. Nothing here says a take is right or wrong; it says what
 *   changed, and the ear decides.
 *
 * The analysis kit (spectrum, vowel formants, tone clarity, take capture) is
 * registered as VTViz.scenes.resonanceKit for js/practice-modes.js; the
 * painters are VTViz.scenes.vowels, .zones and .abTakes.
 */
(function (global) {
  "use strict";
  const V = global.VTViz;
  if (!V) return;
  const { C, L, clamp } = V;

  /* ——————————————————————— Analysis kit ——————————————————————— */

  function median(arr) {
    if (!arr || !arr.length) return null;
    const s = Array.from(arr).sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function quantile(arr, p) {
    if (!arr || !arr.length) return null;
    const s = Array.from(arr).sort((a, b) => a - b);
    const i = clamp((s.length - 1) * p, 0, s.length - 1);
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  }
  function dbOf(rms) {
    return rms > 1e-7 ? 20 * Math.log10(rms) : -140;
  }
  function midiOf(f) {
    return 69 + 12 * Math.log2(f / 440);
  }

  /**
   * The engine's frames carry raw per-frame fields (`sounding`, `rawFreq`).
   * Older callers (and a few unit specs) hand in only `voiced`/`voiceFreq`;
   * those bridge about a second of silence, so they are used only when the
   * raw ones are absent altogether, never when a raw field says "nothing".
   */
  function rawOf(frame) {
    const f = frame || {};
    return {
      sounding: f.sounding !== undefined ? !!f.sounding : !!f.voiced,
      freq: f.rawFreq !== undefined ? f.rawFreq || null : f.voiceFreq || null,
      dt: clamp((f.dtMs || 16) / 1000, 0, 0.1),
      // Level before the MIC slider, so moving the slider does not move you
      db: dbOf((f.rms || 0) / (f.inputGain || 1))
    };
  }

  /* —— Spectrum —— */

  const _fft = {};
  function fftTables(n) {
    if (_fft[n]) return _fft[n];
    const win = new Float64Array(n);
    for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    const rev = new Uint32Array(n);
    const bits = Math.round(Math.log2(n));
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r = (r << 1) | ((i >> b) & 1);
      rev[i] = r;
    }
    const cos = new Float64Array(n / 2);
    const sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      cos[i] = Math.cos((2 * Math.PI * i) / n);
      sin[i] = -Math.sin((2 * Math.PI * i) / n);
    }
    _fft[n] = { win, rev, cos, sin, re: new Float64Array(n), im: new Float64Array(n), pow: new Float64Array(n / 2) };
    return _fft[n];
  }

  /** Power spectrum (Hann window) of a frame's samples; bins of sr/n Hz. */
  function powerSpectrum(buf) {
    let n = 1;
    while (n * 2 <= buf.length && n < 4096) n *= 2;
    const T = fftTables(n);
    const off = buf.length - n;
    const { re, im, rev, win, cos, sin, pow } = T;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      re[j] = buf[off + i] * win[i];
      im[j] = 0;
    }
    for (let size = 2; size <= n; size *= 2) {
      const half = size / 2;
      const step = n / size;
      for (let s = 0; s < n; s += size) {
        for (let k = 0; k < half; k++) {
          const wr = cos[k * step];
          const wi = sin[k * step];
          const a = s + k;
          const b = a + half;
          const tr = re[b] * wr - im[b] * wi;
          const ti = re[b] * wi + im[b] * wr;
          re[b] = re[a] - tr;
          im[b] = im[a] - ti;
          re[a] += tr;
          im[a] += ti;
        }
      }
    }
    for (let k = 0; k < n / 2; k++) pow[k] = re[k] * re[k] + im[k] * im[k];
    return { pow, n };
  }

  function bandPower(spec, sr, lo, hi) {
    const hz = sr / spec.n;
    const a = Math.max(1, Math.floor(lo / hz));
    const b = Math.min(spec.pow.length - 1, Math.ceil(hi / hz));
    let s = 0;
    for (let k = a; k <= b; k++) s += spec.pow[k];
    return s;
  }

  /**
   * Brightness: energy 2–4 kHz against 0.1–2 kHz, in dB. Louder singing
   * raises it too (a flatter spectral tilt), which is why every picture that
   * shows it also shows loudness. Needs a sample rate that reaches 4 kHz
   * cleanly — a Bluetooth headset at 8–16 kHz does not.
   */
  function brightnessDb(spec, sr) {
    if (!sr || sr < 16000) return null;
    const lo = bandPower(spec, sr, 100, 2000);
    const hi = bandPower(spec, sr, 2000, 4000);
    if (lo <= 1e-12 || hi <= 1e-14) return null;
    return 10 * Math.log10(hi / lo);
  }

  /** Third-octave band centres 125 Hz … 5 kHz (long-term average spectrum). */
  const THIRDS = [125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000];
  function thirdOctave(spec, sr) {
    return THIRDS.map((c) => bandPower(spec, sr, c / 1.1225, c * 1.1225));
  }

  /* —— Tone clarity (periodicity) —— */

  /**
   * How periodic the sound is at the detected pitch: the normalised
   * autocorrelation at one period, 0..1. A clear tone reads above ~0.9;
   * creak, rattle or a lot of air bring it down. It cannot tell rough from
   * breathy — the words say "rough or airy" for that reason.
   */
  function clarityAt(buf, sr, f0) {
    if (!buf || !f0 || f0 < 50) return null;
    const T0 = sr / f0;
    const n = buf.length;
    let best = 0;
    for (let d = -2; d <= 2; d++) {
      const T = Math.round(T0) + d;
      if (T < 8 || T > n / 2) continue;
      let xy = 0;
      let xx = 0;
      let yy = 0;
      for (let i = 0; i + T < n; i++) {
        const x = buf[i];
        const y = buf[i + T];
        xy += x * y;
        xx += x * x;
        yy += y * y;
      }
      const r = xx > 1e-12 && yy > 1e-12 ? xy / Math.sqrt(xx * yy) : 0;
      if (r > best) best = r;
    }
    return clamp(best, 0, 1);
  }

  /* —— Vowel formants (LPC), approximate —— */

  const _lpc = {};
  function lpcTables(sr) {
    const D = Math.max(1, Math.round(sr / 11025));
    const key = sr + ":" + D;
    if (_lpc[key]) return _lpc[key];
    const fs = sr / D;
    // Low-pass FIR (windowed sinc) before taking every D-th sample
    const taps = 31;
    const fc = 0.45 / D;
    const h = new Float64Array(taps);
    let sum = 0;
    for (let k = 0; k < taps; k++) {
      const m = k - (taps - 1) / 2;
      const sinc = m === 0 ? 2 * fc : Math.sin(2 * Math.PI * fc * m) / (Math.PI * m);
      const w = 0.54 - 0.46 * Math.cos((2 * Math.PI * k) / (taps - 1));
      h[k] = sinc * w;
      sum += h[k];
    }
    for (let k = 0; k < taps; k++) h[k] /= sum;
    // Envelope sample points 0 … 4800 Hz
    const pts = 240;
    const maxHz = Math.min(4800, fs / 2 - 100);
    const hz = new Float64Array(pts);
    for (let i = 0; i < pts; i++) hz[i] = 90 + (i / (pts - 1)) * (maxHz - 90);
    const order = 12;
    const cs = [];
    const sn = [];
    for (let i = 0; i < pts; i++) {
      const c = new Float64Array(order + 1);
      const s = new Float64Array(order + 1);
      const wv = (2 * Math.PI * hz[i]) / fs;
      for (let k = 0; k <= order; k++) {
        c[k] = Math.cos(wv * k);
        s[k] = Math.sin(wv * k);
      }
      cs.push(c);
      sn.push(s);
    }
    _lpc[key] = { D, fs, h, hz, cs, sn, order, x: null, env: new Float64Array(pts) };
    return _lpc[key];
  }

  /**
   * F1 and F2 from one frame, by linear prediction on the samples decimated
   * to ~11 kHz (pre-emphasis 0.97, Hamming, order 12, envelope peaks).
   * Returns { f1, f2 } or null when the envelope has no two clear peaks.
   * Unreliable above ~300 Hz of pitch (the harmonics are too sparse to
   * trace the resonance) and on O/U, where the two peaks merge — callers
   * gate on pitch and treat the result as "aprox.".
   */
  function formants(buf, sr) {
    if (!buf || !sr || sr < 16000) return null;
    const T = lpcTables(sr);
    const { D, h, order } = T;
    const taps = h.length;
    const n = Math.floor((buf.length - taps) / D);
    if (n < 200) return null;
    if (!T.x || T.x.length !== n) T.x = new Float64Array(n);
    const x = T.x;
    for (let i = 0; i < n; i++) {
      let acc = 0;
      const base = i * D;
      for (let k = 0; k < taps; k++) acc += h[k] * buf[base + k];
      x[i] = acc;
    }
    // Pre-emphasis (from the end so the input stays usable) + Hamming
    for (let i = n - 1; i > 0; i--) x[i] -= 0.97 * x[i - 1];
    for (let i = 0; i < n; i++) x[i] *= 0.54 - 0.46 * Math.cos((2 * Math.PI * i) / (n - 1));
    const r = new Float64Array(order + 1);
    for (let k = 0; k <= order; k++) {
      let s = 0;
      for (let i = 0; i + k < n; i++) s += x[i] * x[i + k];
      r[k] = s;
    }
    if (r[0] <= 1e-10) return null;
    r[0] *= 1.0001; // a touch of white-noise correction keeps Levinson stable
    // Levinson–Durbin
    const a = new Float64Array(order + 1);
    const tmp = new Float64Array(order + 1);
    a[0] = 1;
    let err = r[0];
    for (let i = 1; i <= order; i++) {
      let acc = r[i];
      for (let j = 1; j < i; j++) acc += a[j] * r[i - j];
      const k = -acc / err;
      for (let j = 0; j < i; j++) tmp[j] = a[j];
      for (let j = 1; j < i; j++) a[j] = tmp[j] + k * tmp[i - j];
      a[i] = k;
      err *= 1 - k * k;
      if (err <= 0) return null;
    }
    // Envelope in dB
    const env = T.env;
    for (let i = 0; i < env.length; i++) {
      let re = 0;
      let im = 0;
      const c = T.cs[i];
      const s = T.sn[i];
      for (let k = 0; k <= order; k++) {
        re += a[k] * c[k];
        im -= a[k] * s[k];
      }
      env[i] = -10 * Math.log10(re * re + im * im + 1e-12);
    }
    // Peaks with their prominence over the valleys either side
    const peaks = [];
    for (let i = 1; i < env.length - 1; i++) {
      if (env[i] > env[i - 1] && env[i] >= env[i + 1]) {
        let l = env[i];
        for (let j = i - 1; j >= 0; j--) {
          l = Math.min(l, env[j]);
          if (env[j] > env[i]) break;
        }
        let rr = env[i];
        for (let j = i + 1; j < env.length; j++) {
          rr = Math.min(rr, env[j]);
          if (env[j] > env[i]) break;
        }
        // Parabolic refinement of the peak frequency
        const y0 = env[i - 1];
        const y1 = env[i];
        const y2 = env[i + 1];
        const den = y0 - 2 * y1 + y2;
        const off = den !== 0 ? clamp((0.5 * (y0 - y2)) / den, -0.5, 0.5) : 0;
        const step = T.hz[1] - T.hz[0];
        peaks.push({ hz: T.hz[i] + off * step, prom: env[i] - Math.max(l, rr) });
      }
    }
    const f1c = peaks.filter((p) => p.hz >= 200 && p.hz <= 1100 && p.prom >= 1.5);
    if (!f1c.length) return null;
    const f1 = f1c[0].hz;
    const f2c = peaks.filter((p) => p.hz >= Math.max(550, f1 + 180) && p.hz <= 3000 && p.prom >= 1.5);
    if (!f2c.length) return null;
    return { f1, f2: f2c[0].hz };
  }

  /* —— Take capture: the frames' samples, stitched back into audio —— */

  /**
   * Each frame hands over the analyser's latest 2048 samples; consecutive
   * frames overlap. The stream advances in whole render quanta (128 samples),
   * so the new part is found by matching the overlap exactly; when the
   * overlap is silent (nothing to match) the frame's own duration decides.
   * The result is the take as audio, for A/B playback without a second
   * recorder on the microphone.
   */
  class Capture {
    constructor(maxSec = 30) {
      this.maxSec = maxSec;
      this.reset();
    }
    reset() {
      this.chunks = [];
      this.length = 0;
      this.prev = null;
      this.sr = 48000;
      this.recording = false;
      this._pre = [];
      this._preLen = 0;
    }
    /** New samples in this frame (a copy), or null. */
    _fresh(buf, sr, dtMs) {
      const N = buf.length;
      // The stream moves in render quanta of 128 samples
      const est = Math.max(128, Math.round((((dtMs || 16) / 1000) * sr) / 128) * 128);
      let adv = Math.min(N, est);
      const prev = this.prev;
      if (prev && prev.length === N) {
        // Energy of the overlap probe: silence cannot be matched
        let e = 0;
        for (let i = 0; i < 64; i++) e += Math.abs(buf[i * 8]);
        if (e > 1e-6) {
          let found = -1;
          let bestDist = 1e9;
          for (let k = 0; k < N; k += 128) {
            let ok = true;
            for (let i = 0; i < 24 && ok; i++) {
              const j = i * 37;
              if (j + k >= N) break;
              if (buf[j] !== prev[j + k]) ok = false;
            }
            if (ok) {
              const dist = Math.abs(k - est);
              if (dist < bestDist) {
                bestDist = dist;
                found = k;
              }
            }
          }
          adv = found >= 0 ? found : N;
        }
      } else adv = Math.min(N, est);
      if (!this.prev || this.prev.length !== N) this.prev = new Float32Array(N);
      this.prev.set(buf);
      if (adv <= 0) return null;
      return buf.slice(N - adv);
    }
    /** Feed every frame; keeps a short pre-roll so a take's onset is not cut. */
    feed(frame) {
      if (!frame || !frame.buf) return;
      const sr = frame.sampleRate || 48000;
      this.sr = sr;
      const fresh = this._fresh(frame.buf, sr, frame.dtMs);
      if (!fresh) return;
      if (this.recording) {
        if (this.length < this.maxSec * sr) {
          this.chunks.push(fresh);
          this.length += fresh.length;
        }
      } else {
        this._pre.push(fresh);
        this._preLen += fresh.length;
        const keep = Math.round(0.35 * sr);
        while (this._pre.length > 1 && this._preLen - this._pre[0].length >= keep) {
          this._preLen -= this._pre.shift().length;
        }
      }
    }
    start() {
      this.chunks = this._pre.slice();
      this.length = this._preLen;
      this.recording = true;
    }
    /** Stop and return the take as one Float32Array (trimmed to `keepSec` if given). */
    stop(keepSec) {
      this.recording = false;
      let len = this.length;
      if (keepSec != null) len = Math.min(len, Math.round(keepSec * this.sr));
      const out = new Float32Array(len);
      let o = 0;
      for (const c of this.chunks) {
        if (o >= len) break;
        const take = Math.min(c.length, len - o);
        out.set(take === c.length ? c : c.subarray(0, take), o);
        o += take;
      }
      this.chunks = [];
      this.length = 0;
      this._pre = [];
      this._preLen = 0;
      return out;
    }
  }

  /** Play samples through the app's audio context; returns a stop function. */
  function playSamples(samples, sr, gain = 1, onEnd) {
    const ctx = global.VTSharedAudioCtx || global.VTPiano?.ctx;
    if (!ctx || !samples || !samples.length) return null;
    try {
      if (ctx.state === "suspended") ctx.resume();
      const b = ctx.createBuffer(1, samples.length, sr);
      b.copyToChannel ? b.copyToChannel(samples, 0) : b.getChannelData(0).set(samples);
      const src = ctx.createBufferSource();
      src.buffer = b;
      const g = ctx.createGain();
      g.gain.value = gain;
      src.connect(g).connect(ctx.destination);
      let done = false;
      src.onended = () => {
        if (!done) {
          done = true;
          onEnd && onEnd();
        }
      };
      src.start();
      return () => {
        if (done) return;
        done = true;
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
        onEnd && onEnd();
      };
    } catch (err) {
      console.warn("[resonance playback]", err);
      return null;
    }
  }

  function peakOf(samples) {
    let p = 0;
    for (let i = 0; i < samples.length; i++) {
      const a = Math.abs(samples[i]);
      if (a > p) p = a;
    }
    return p;
  }

  /** Pearson correlation of two equal-length arrays (NaN entries skipped). */
  function correlation(a, b) {
    let n = 0;
    let sa = 0;
    let sb = 0;
    for (let i = 0; i < a.length; i++) {
      if (Number.isFinite(a[i]) && Number.isFinite(b[i])) {
        n++;
        sa += a[i];
        sb += b[i];
      }
    }
    if (n < 4) return null;
    const ma = sa / n;
    const mb = sb / n;
    let xy = 0;
    let xx = 0;
    let yy = 0;
    for (let i = 0; i < a.length; i++) {
      if (Number.isFinite(a[i]) && Number.isFinite(b[i])) {
        xy += (a[i] - ma) * (b[i] - mb);
        xx += (a[i] - ma) ** 2;
        yy += (b[i] - mb) ** 2;
      }
    }
    return xx > 1e-9 && yy > 1e-9 ? xy / Math.sqrt(xx * yy) : null;
  }

  const kit = {
    median,
    quantile,
    dbOf,
    midiOf,
    rawOf,
    powerSpectrum,
    bandPower,
    brightnessDb,
    thirdOctave,
    THIRDS,
    clarityAt,
    formants,
    Capture,
    playSamples,
    peakOf,
    correlation
  };
  V.scenes.resonanceKit = kit;

  /* ——————————————————————— Shared drawing bits ——————————————————————— */

  const { font, roundRect, panel, fitText, glyph, hatch } = V;

  function fmtSigned(n, digits = 0) {
    const v = Number(n) || 0;
    const s = V.fmtNum(Math.abs(v), digits);
    if (Math.abs(v) < Math.pow(10, -digits) / 2) return s;
    return (v > 0 ? "+" : "−") + s;
  }
  function cents(c) {
    return fmtSigned(Math.round(c)) + " ¢";
  }
  function dB(d) {
    return fmtSigned(d, Math.abs(d) < 10 ? 1 : 0) + " dB";
  }
  function text(ctx, s, x, y, o = {}) {
    ctx.font = o.font || font(o.px || 11, o.weight || 700);
    ctx.fillStyle = o.color || C.text;
    ctx.textAlign = o.align || "left";
    ctx.textBaseline = o.baseline || "middle";
    if (o.maxW) ctx.fillText(s, x, y, o.maxW);
    else ctx.fillText(s, x, y);
  }
  /** A small "direction" glyph for a signed value past a threshold. */
  function dirGlyph(ctx, v, thr, x, y, color, s = 5) {
    if (v == null || Math.abs(v) <= thr) return false;
    glyph(ctx, v > 0 ? "up" : "tri", x, y, color, s);
    return true;
  }
  function noteLabel(name) {
    if (!name) return "";
    try {
      const f = global.VT_NOTE_FREQ?.[name];
      if (f && global.VTPitchUtils?.midiToDualLabel) {
        return global.VTPitchUtils.midiToDualLabel(Math.round(midiOf(f)), true) || name;
      }
    } catch {
      /* fall through */
    }
    return name;
  }
  /** The app's own two-name label for a MIDI note, e.g. "D3 Re". */
  function dualLabel(m) {
    try {
      if (global.VTPitchUtils?.midiToDualLabel) return global.VTPitchUtils.midiToDualLabel(Math.round(m), true) || midiLabel(m);
    } catch {
      /* fall through */
    }
    return midiLabel(m);
  }
  /** Solfège (Spanish) or letter name with the octave, e.g. "Re3" / "D3". */
  function midiLabel(m) {
    const n = Math.round(m);
    const names = V.isEs()
      ? ["Do", "Do♯", "Re", "Re♯", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "La♯", "Si"]
      : ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
    const oct = Math.floor(n / 12) - 1;
    return names[((n % 12) + 12) % 12] + oct;
  }

  /* ——————————————————————— Five vowels (s20) ——————————————————————— */

  /**
   * "Una nota, cinco formas". The round is one page, a column per vowel:
   * the vowel to sing and the ones after it are always in view, the page
   * fills left to right (nothing scrolls), and your pitch against the note
   * is drawn inside each vowel's column — so a pitch that moves when the
   * vowel changes shows as a step at the column edge. Under each finished
   * column: how far the pitch sat from the note and how loud that vowel was
   * against the round's own average (open vowels are naturally 2–4 dB
   * louder, hence the ±3 dB allowance). Beside it, where each vowel sat in
   * the first two resonances, approximately and against your own vowels only.
   *
   * model: { vowels, secPer, i, t, pages:[{cells:[{cents,db,f1,f2,sec}]}],
   *          trace:[{x,c}], prevPage, live:{f1,f2,at}|null, trail, gate,
   *          target, octave, sung, review, clock }
   */
  function vowels(ctx, w, h, m) {
    panel(ctx, w, h);
    const pad = 10;
    const tiny = h < 135;
    const compact = h < 190;
    const headH = tiny ? 0 : compact ? 20 : 26;
    if (!tiny) {
      const page = m.pages.length;
      const narrow = w < 480;
      const right = L(`${m.sung} ${m.sung === 1 ? "vuelta cantada" : "vueltas cantadas"}`, `${m.sung} ${m.sung === 1 ? "round sung" : "rounds sung"}`);
      ctx.font = font(compact ? 10 : 11, 700);
      const rightW = Math.min(w * 0.34, ctx.measureText(right).width);
      const head = m.review
        ? L(`Tus vueltas · nota ${m.target || ""}`, `Your rounds · note ${m.target || ""}`)
        : narrow
          ? L(`Vuelta ${page} · nota ${m.target || ""}`, `Round ${page} · note ${m.target || ""}`)
          : L(`Vuelta ${page} · una sola nota: ${m.target || ""}`, `Round ${page} · one note: ${m.target || ""}`);
      ctx.fillStyle = C.text;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      fitText(ctx, head, pad + 2, pad + headH / 2 - 2, w - pad * 2 - rightW - 14, compact ? 13 : 15, 800, 9);
      text(ctx, right, w - pad - 2, pad + headH / 2 - 2, {
        align: "right",
        color: m.sung ? C.done : C.muted,
        px: compact ? 10 : 11,
        maxW: w * 0.34
      });
    }
    const top = tiny ? pad - 4 : pad + headH + 2;
    const bodyH = h - top - pad + (tiny ? 4 : 0);
    const wide = w >= 560 && !tiny;
    const mapRoom = wide ? Math.min(w * 0.4, bodyH * 1.35 + 20) : 0;
    const tall = !wide && !tiny && bodyH >= 280;
    const pageBox = wide
      ? { x: pad, y: top, w: w - pad * 3 - mapRoom, h: bodyH }
      : tall
        ? { x: pad, y: top, w: w - pad * 2, h: Math.round(bodyH * 0.55) }
        : { x: pad, y: top, w: w - pad * 2, h: bodyH };
    const page = pickPage(m);
    roundPage(ctx, pageBox, m, page, { tiny, compact: compact || (tall && pageBox.h < 190) });
    if (wide) vowelMap(ctx, { x: w - pad - mapRoom, y: top, w: mapRoom, h: bodyH }, m);
    else if (tall) vowelMap(ctx, { x: pad, y: pageBox.y + pageBox.h + 10, w: w - pad * 2, h: bodyH - pageBox.h - 10 }, m);
  }

  /** The page to show: the live one, or after Stop the last one with singing. */
  function pickPage(m) {
    const cur = m.pages[m.pages.length - 1];
    if (!m.review) return cur;
    const hasData = (p) => p && p.cells.some((c) => c.cents != null);
    if (hasData(cur) && cur.cells.filter((c) => c.cents != null).length >= 2) return cur;
    for (let k = m.pages.length - 2; k >= 0; k--) if (hasData(m.pages[k])) return m.pages[k];
    return cur;
  }

  function roundPage(ctx, box, m, page, o) {
    const n = m.vowels.length;
    const cw = box.w / n;
    const hh = o.tiny ? 22 : o.compact ? 26 : 34;
    const isCurPage = page === m.pages[m.pages.length - 1];
    const stampH = o.tiny ? 0 : o.compact ? 16 : 34;
    // Review adds a row per earlier round under the page
    const rows = m.review && !o.tiny ? m.pages.filter((p) => p !== page && p.cells.some((c) => c.cents != null)).slice(-3) : [];
    const rowH = o.compact ? 15 : 17;
    const tableH = rows.length ? rows.length * rowH + 14 : 0;
    const areaTop = box.y + hh + 4;
    const areaBot = box.y + box.h - stampH - tableH - (stampH ? 4 : 0);
    const areaH = Math.max(24, areaBot - areaTop);
    const range = 100;
    const mid = areaTop + areaH / 2;
    const yOf = (c) => mid - (clamp(c, -range, range) / range) * (areaH / 2);
    const levels = relLevels(page);
    // Header cells: the vowel queue, aligned with the columns below
    for (let i = 0; i < n; i++) {
      const x = box.x + i * cw;
      const done = !isCurPage || m.review ? page.cells[i].sec > 0 || page.cells[i].cents != null : i < m.i;
      const cur = isCurPage && !m.review && i === m.i;
      ctx.fillStyle = done ? "rgba(255, 211, 110, 0.14)" : "rgba(170, 195, 230, 0.07)";
      roundRect(ctx, x + 2, box.y, cw - 4, hh, 7);
      ctx.fill();
      if (cur) {
        ctx.fillStyle = C.targetSoft;
        roundRect(ctx, x + 2, box.y, Math.max(6, (cw - 4) * clamp(m.t / m.secPer, 0, 1)), hh, 7);
        ctx.fill();
      }
      ctx.lineWidth = cur ? 2 : 1;
      ctx.strokeStyle = cur ? C.text : done ? "rgba(255, 211, 110, 0.5)" : C.grid;
      roundRect(ctx, x + 2.5, box.y + 0.5, cw - 5, hh - 1, 7);
      ctx.stroke();
      const letter = m.vowels[i];
      let label = letter;
      if (o.tiny && done) {
        const c = page.cells[i];
        if (c.cents != null) label = `${letter}  ${cents(c.cents)}${levels[i] != null ? "  " + dB(levels[i]) : ""}`;
      }
      ctx.fillStyle = cur ? C.text : done ? C.done : C.muted;
      ctx.font = font(o.tiny ? (label.length > 2 ? 11 : 14) : o.compact ? 15 : 19, 800);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, x + cw / 2, box.y + hh / 2 + 0.5, cw - 8);
    }
    // Pitch area
    ctx.fillStyle = "rgba(170, 195, 230, 0.05)";
    roundRect(ctx, box.x, areaTop, box.w, areaH, 6);
    ctx.fill();
    ctx.fillStyle = C.targetSoft;
    ctx.fillRect(box.x, yOf(25), box.w, yOf(-25) - yOf(25));
    ctx.strokeStyle = C.target;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(box.x, mid);
    ctx.lineTo(box.x + box.w, mid);
    ctx.stroke();
    ctx.strokeStyle = C.grid;
    ctx.setLineDash([3, 4]);
    [50, -50].forEach((c) => {
      ctx.beginPath();
      ctx.moveTo(box.x, yOf(c));
      ctx.lineTo(box.x + box.w, yOf(c));
      ctx.stroke();
    });
    ctx.setLineDash([]);
    for (let i = 1; i < n; i++) {
      ctx.strokeStyle = C.gridStrong;
      ctx.beginPath();
      ctx.moveTo(box.x + i * cw, areaTop);
      ctx.lineTo(box.x + i * cw, areaTop + areaH);
      ctx.stroke();
    }
    if (!o.tiny && areaH >= 60) {
      text(ctx, L("↑ más alto", "↑ higher"), box.x + 4, areaTop + 8, { px: 9, color: C.faint });
      text(ctx, L("↓ más bajo", "↓ lower"), box.x + 4, areaTop + areaH - 8, { px: 9, color: C.faint });
    }
    // Last round's centre per vowel, as a hollow marker to sing against
    const prev = m.prevPage && isCurPage ? m.prevPage : null;
    if (prev && !o.tiny) {
      prev.cells.forEach((c, i) => {
        if (c.cents == null) return;
        const x = box.x + (i + 0.5) * cw;
        const y = yOf(c.cents);
        ctx.strokeStyle = C.faint;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - 5, y);
        ctx.lineTo(x, y - 5);
        ctx.lineTo(x + 5, y);
        ctx.lineTo(x, y + 5);
        ctx.closePath();
        ctx.stroke();
      });
    }
    // Your pitch, on the page
    const roundSec = m.secPer * n;
    const trace = page.trace || [];
    ctx.strokeStyle = C.you;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    let prevPt = null;
    trace.forEach((p) => {
      if (p.c == null) {
        prevPt = null;
        return;
      }
      const x = box.x + (p.x / roundSec) * box.w;
      const y = yOf(p.c);
      if (prevPt && p.x - prevPt.x < 0.15) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      prevPt = p;
    });
    ctx.stroke();
    // Playhead
    if (isCurPage && !m.review) {
      const px = box.x + ((m.i * m.secPer + m.t) / roundSec) * box.w;
      ctx.strokeStyle = "rgba(238, 243, 250, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(px, areaTop - 2);
      ctx.lineTo(px, areaTop + areaH + 2);
      ctx.stroke();
      const last = trace[trace.length - 1];
      if (last && last.c != null && m.clock - (last.at || 0) < 0.2) {
        ctx.fillStyle = C.you;
        ctx.beginPath();
        ctx.arc(px, yOf(last.c), 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (m.octave && !m.review) {
      V.label(ctx, m.octave > 0 ? L("una octava arriba", "an octave up") : L("una octava abajo", "an octave down"), box.x + box.w - 4, areaTop + 10, {
        align: "right",
        font: font(10, 700),
        color: C.muted
      });
    }
    // Stamps under each finished vowel
    if (stampH) {
      const sy = areaTop + areaH + 4;
      for (let i = 0; i < n; i++) {
        const c = page.cells[i];
        const finished = !isCurPage || m.review || i < m.i;
        if (!finished) continue;
        const cx = box.x + (i + 0.5) * cw;
        if (c.cents == null) {
          text(ctx, "—", cx, sy + stampH / 2, { align: "center", color: C.faint, px: 11 });
          continue;
        }
        const lv = levels[i];
        const pitchOff = Math.abs(c.cents) > 25;
        const loud = lv != null && Math.abs(lv) > 3;
        if (o.compact) {
          text(ctx, `${cents(c.cents)}${lv != null ? " · " + dB(lv) : ""}`, cx, sy + stampH / 2, {
            align: "center",
            px: 10,
            color: pitchOff || loud ? C.warn : C.muted,
            maxW: cw - 4
          });
        } else {
          const y1 = sy + 8;
          const y2 = sy + 25;
          const hasG1 = dirGlyph(ctx, c.cents, 25, cx - cw / 2 + 10, y1, C.warn, 4.5);
          text(ctx, cents(c.cents), cx + (hasG1 ? 5 : 0), y1, { align: "center", px: 11, color: pitchOff ? C.warn : C.text, maxW: cw - 18 });
          if (lv != null) {
            const hasG2 = dirGlyph(ctx, lv, 3, cx - cw / 2 + 10, y2, C.warn, 4.5);
            text(ctx, dB(lv), cx + (hasG2 ? 5 : 0), y2, { align: "center", px: 10, color: loud ? C.warn : C.muted, maxW: cw - 18 });
          }
        }
      }
    }
    // After Stop: the earlier rounds as rows, for a round-by-round look
    if (rows.length) {
      let y = box.y + box.h - tableH + 10;
      text(ctx, L("otras vueltas", "other rounds"), box.x + 2, y - 4, { px: 9, color: C.faint });
      rows.forEach((p) => {
        y += rowH;
        const lv = relLevels(p);
        p.cells.forEach((c, i) => {
          const cx = box.x + (i + 0.5) * cw;
          const s = c.cents == null ? "—" : `${cents(c.cents)}${lv[i] != null ? " · " + dB(lv[i]) : ""}`;
          text(ctx, s, cx, y - rowH / 2 + 2, { align: "center", px: 10, color: C.muted, maxW: cw - 4 });
        });
      });
    }
  }

  /** Each vowel's level against the mean of the round's vowels (dB). */
  function relLevels(page) {
    const dbs = page.cells.map((c) => c.db);
    const have = dbs.filter((d) => d != null);
    if (have.length < 2) return dbs.map(() => null);
    const mean = have.reduce((a, b) => a + b, 0) / have.length;
    return dbs.map((d) => (d == null ? null : d - mean));
  }

  /**
   * Vowel map in the usual chart orientation: front vowels (I, E) left,
   * back (O, U) right; closed at the top, open at the bottom — from the
   * first two resonances, approximately, with no numbers. Your first round
   * is a hollow ring, your latest a filled dot, so a vowel that changed
   * shape shows as a line between them.
   */
  function vowelMap(ctx, box, m) {
    const { x, y, w, h } = box;
    ctx.fillStyle = "rgba(170, 195, 230, 0.05)";
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    text(ctx, L("Forma de cada vocal · aprox.", "Shape of each vowel · approx."), x + 8, y + 11, { px: 11, color: C.muted, maxW: w - 16 });
    const pl = x + 18;
    const pr = x + w - 12;
    const pt = y + 26;
    const pb = y + h - 20;
    if (pb - pt < 40 || pr - pl < 60) return;
    const pts = [];
    m.pages.forEach((p) => p.cells.forEach((c) => c.f1 != null && pts.push(c)));
    if (m.live) pts.push(m.live);
    const f1s = pts.map((p) => p.f1);
    const f2s = pts.map((p) => p.f2);
    let f1lo = Math.min(260, ...f1s) * 0.92;
    let f1hi = Math.max(800, ...f1s) * 1.06;
    let f2lo = Math.min(750, ...f2s) * 0.92;
    let f2hi = Math.max(2300, ...f2s) * 1.05;
    const X = (f2) => pl + ((f2hi - f2) / (f2hi - f2lo)) * (pr - pl);
    const Y = (f1) => pt + ((f1 - f1lo) / (f1hi - f1lo)) * (pb - pt);
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(pl + 0.5, pt + 0.5, pr - pl - 1, pb - pt - 1);
    // Axis words: what up/down and left/right mean, no Hz
    text(ctx, L("cerrada", "closed"), pl + 4, pt + 8, { px: 9, color: C.faint });
    text(ctx, L("abierta", "open"), pl + 4, pb - 8, { px: 9, color: C.faint });
    text(ctx, L("adelante", "front"), pl, pb + 10, { px: 9, color: C.faint });
    text(ctx, L("atrás", "back"), pr, pb + 10, { px: 9, color: C.faint, align: "right" });
    // First round (ring) → latest (dot), per vowel
    let any = false;
    m.vowels.forEach((v, k) => {
      const seen = m.pages.map((p) => p.cells[k]).filter((c) => c && c.f1 != null);
      if (!seen.length) return;
      any = true;
      const first = seen[0];
      const last = seen[seen.length - 1];
      const x1 = X(first.f2);
      const y1 = Y(first.f1);
      const x2 = X(last.f2);
      const y2 = Y(last.f1);
      if (seen.length > 1) {
        ctx.strokeStyle = C.faint;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x1, y1, 7, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      ctx.fillStyle = C.done;
      ctx.beginPath();
      ctx.arc(x2, y2, 9, 0, Math.PI * 2);
      ctx.fill();
      text(ctx, v, x2, y2 + 0.5, { align: "center", px: 11, weight: 800, color: "#1b1406" });
    });
    // Live: where the vowel you are singing sits now, with a short trail
    const fresh = m.live && m.clock - (m.live.at || 0) < 0.35;
    if (fresh && !m.review) {
      (m.trail || []).forEach((p, i, arr) => {
        ctx.globalAlpha = 0.15 + (0.5 * i) / Math.max(1, arr.length);
        ctx.fillStyle = C.you;
        ctx.beginPath();
        ctx.arc(X(p.f2), Y(p.f1), 3, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      ctx.fillStyle = C.youSoft;
      ctx.beginPath();
      ctx.arc(X(m.live.f2), Y(m.live.f1), 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.you;
      ctx.beginPath();
      ctx.arc(X(m.live.f2), Y(m.live.f1), 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
    const msg =
      m.gate === "high"
        ? L("Muy agudo para leer la vocal — escucha", "Too high to read the vowel — listen instead")
        : !any && !fresh
          ? L("Canta: cada vocal aparece aquí", "Sing: each vowel appears here")
          : "";
    if (msg && !m.review) {
      V.label(ctx, msg, (pl + pr) / 2, (pt + pb) / 2, { align: "center", font: font(11, 700), color: C.muted });
    }
  }

  V.scenes.vowels = vowels;

  /* ——————————————————————— Resonance zones (s21–s25) ——————————————————————— */

  function zoneName(z) {
    return z ? (V.isEs() ? z.labelEs || z.label : z.label) || "" : "";
  }
  function stLabel(n) {
    const v = Math.round(n);
    return fmtSigned(v, 0) + " " + (Math.abs(v) === 1 ? L("semitono", "semitone") : L("semitonos", "semitones"));
  }
  function sectionTitle(ctx, s, x, y, maxW) {
    text(ctx, s, x, y, { px: 11, color: C.muted, maxW });
  }

  /**
   * The zone lane plus one side panel per drill. The lane is pitch against
   * time: the zone is a band of pitches, your voice the light line, the
   * target notes wait to the right of "now" (the next three too) and each
   * fills with gold as you hold it. Past targets stay as green segments with
   * a check where they were held. With reduced motion the past fills a page
   * left to right instead of scrolling. After Stop the lane shows the whole
   * run.
   *
   * model: the resonanceZone state (zones, z, zoneMidis, wantMidi, wantLabel,
   * queue, inBand, holdMs, trace, targets, cards, fresh, clock, focus,
   * lvl, clar, floor, sp, br, soft, seams, passes, octHint, review, held)
   */
  function zones(ctx, w, h, m) {
    panel(ctx, w, h);
    const pad = 10;
    const tiny = h < 135;
    const compact = h < 190;
    const headH = tiny ? 0 : compact ? 20 : 26;
    if (!tiny) {
      const right = L(`${m.held} ${m.held === 1 ? "nota sostenida" : "notas sostenidas"}`, `${m.held} ${m.held === 1 ? "note held" : "notes held"}`);
      ctx.font = font(compact ? 10 : 11, 700);
      const rightW = Math.min(w * 0.36, ctx.measureText(right).width);
      const z = m.zones[m.z];
      const head = m.review
        ? L("Tu recorrido", "Your run")
        : m.zones.length > 1
          ? `${zoneName(z)} · ${L("nota", "note")} ${noteLabel(m.wantLabel)}`
          : `${L("Nota", "Note")} ${noteLabel(m.wantLabel)} · ${zoneName(z)}`;
      ctx.fillStyle = C.text;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      fitText(ctx, head, pad + 2, pad + headH / 2 - 2, w - pad * 2 - rightW - 14, compact ? 13 : 15, 800, 9);
      text(ctx, right, w - pad - 2, pad + headH / 2 - 2, { align: "right", color: m.held ? C.done : C.muted, px: compact ? 10 : 11, maxW: w * 0.36 });
    }
    const top = tiny ? pad - 3 : pad + headH + 2;
    const bodyH = h - top - pad + (tiny ? 3 : 0);
    const wide = w >= 560;
    const hasSide = !!m.focus;
    let laneBox;
    let sideBox = null;
    let mini = false;
    if (!hasSide) {
      laneBox = { x: pad, y: top, w: w - pad * 2, h: bodyH };
    } else if (wide) {
      const sideW = Math.round(tiny ? clamp(w * 0.3, 170, 260) : clamp(w * 0.36, 210, 380));
      laneBox = { x: pad, y: top, w: w - pad * 3 - sideW, h: bodyH };
      sideBox = { x: w - pad - sideW, y: top, w: sideW, h: bodyH };
      mini = tiny;
    } else if (bodyH >= 250) {
      const laneH = Math.round(bodyH * (m.focus === "bright" ? 0.44 : 0.5));
      laneBox = { x: pad, y: top, w: w - pad * 2, h: laneH };
      sideBox = { x: pad, y: top + laneH + 8, w: w - pad * 2, h: bodyH - laneH - 8 };
    } else {
      const sideH = Math.min(52, Math.round(bodyH * 0.34));
      laneBox = { x: pad, y: top, w: w - pad * 2, h: bodyH - sideH - 6 };
      sideBox = { x: pad, y: top + bodyH - sideH, w: w - pad * 2, h: sideH };
      mini = true;
    }
    zoneLane(ctx, laneBox, m, { tiny, compact, narrow: !wide });
    if (sideBox) {
      const o = { mini, review: m.review, compact };
      const f = { body: sideBody, speech: sideSpeech, bright: sideBright, soft: sideSoft, seams: sideSeams }[m.focus];
      if (f) f(ctx, sideBox, m, o);
    }
  }

  function zoneLane(ctx, box, m, o) {
    const { x, y, w, h } = box;
    ctx.fillStyle = "rgba(170, 195, 230, 0.05)";
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    const mids = (m.zoneMidis || []).flat();
    if (m.wantMidi != null) mids.push(m.wantMidi);
    let lo = mids.length ? Math.min(...mids) - 2.5 : 45;
    let hi = mids.length ? Math.max(...mids) + 2.5 : 60;
    const band = m.focus === "speech" && m.sp && m.sp.band;
    if (band) {
      lo = Math.min(lo, band.lo - 1);
      hi = Math.max(hi, band.hi + 1);
    }
    const Y = (mm) => y + h - 3 - ((clamp(mm, lo, hi) - lo) / (hi - lo)) * (h - 6);
    const review = m.review;
    const win = o.tiny ? 5 : 7;
    const rightRoom = review ? 34 : 0;
    const nowX = review ? x + w - rightRoom : x + w * (o.narrow ? 0.5 : 0.56);
    let t0;
    let t1;
    let head = null;
    if (review) {
      t0 = m.trace.length ? m.trace[0].t : 0;
      t1 = Math.max(t0 + 1, m.clock);
    } else if (V.reducedMotion()) {
      // No scrolling: the past fills a page, then a fresh page starts
      t0 = Math.floor(m.clock / win) * win;
      t1 = t0 + win;
      head = m.clock;
    } else {
      t1 = m.clock;
      t0 = t1 - win;
    }
    const X = (t) => x + 4 + ((t - t0) / (t1 - t0)) * (nowX - x - 4);
    // Zone bands: the pitch range each zone covers
    (m.zoneMidis || []).forEach((zm, i) => {
      if (!zm.length) return;
      const zt = Y(Math.max(...zm) + 0.5);
      const zb = Y(Math.min(...zm) - 0.5);
      const cur = i === m.z && !review;
      ctx.fillStyle = cur ? "rgba(52, 178, 122, 0.10)" : "rgba(170, 195, 230, 0.06)";
      ctx.fillRect(x, zt, w, zb - zt);
      ctx.strokeStyle = cur ? "rgba(52, 178, 122, 0.45)" : C.grid;
      ctx.lineWidth = 1;
      ctx.setLineDash(cur ? [] : [4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, zt + 0.5);
      ctx.lineTo(x + w, zt + 0.5);
      ctx.moveTo(x, zb - 0.5);
      ctx.lineTo(x + w, zb - 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      if (m.zones.length > 1 && !o.tiny) {
        text(ctx, zoneName(m.zones[i]), x + 6, zt + 8, { px: 9, color: cur ? C.text : C.faint });
      }
    });
    // Your speaking pitch (s22), hatched: measured from your spoken turns
    if (band) {
      const bt = Y(band.hi);
      const bb = Y(band.lo);
      ctx.fillStyle = hatch(ctx, "rgba(191, 230, 255, 0.35)");
      ctx.fillRect(x, bt, w, Math.max(3, bb - bt));
      if (!o.tiny) V.label(ctx, L("tu voz hablada", "your speaking voice"), x + 6, (bt + bb) / 2, { font: font(10, 700), color: C.you });
    }
    // Note lines with names at the right edge
    const seen = new Set();
    mids.forEach((mm) => {
      const r = Math.round(mm);
      if (seen.has(r)) return;
      seen.add(r);
      ctx.strokeStyle = C.grid;
      ctx.beginPath();
      ctx.moveTo(x, Y(r) + 0.5);
      ctx.lineTo(x + w, Y(r) + 0.5);
      ctx.stroke();
    });
    const labelEvery = h / Math.max(1, hi - lo) < 9 ? 2 : 1;
    // Names at the right edge, where the queue ahead leaves room for them
    if ((!o.tiny || h >= 90) && (review || w >= 480)) {
      [...seen].sort((a, b) => a - b).forEach((r, k) => {
        if (k % labelEvery) return;
        text(ctx, dualLabel(r), x + w - 4, Y(r), { px: 9, color: C.faint, align: "right" });
      });
    }
    // Floor (s21): the lowest note held with a clear tone today
    if (m.floor) {
      const fy = Y(m.floor.midi);
      ctx.strokeStyle = C.done;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x, fy + 6);
      ctx.lineTo(x + w - 36, fy + 6);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!o.tiny) V.label(ctx, L("tu nota clara más grave hoy", "your lowest clear note today"), x + 8, fy + 15, { font: font(9, 700), color: C.done });
    }
    // Seams (s25) inside the window
    (m.seams || []).forEach((s) => {
      if (s.t < t0 || s.t > t1) return;
      const sx = X(s.t);
      ctx.strokeStyle = C.gridStrong;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, y + 2);
      ctx.lineTo(sx, y + h - 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!o.tiny) text(ctx, L("costura", "seam"), sx + 3, y + 9, { px: 9, color: C.muted });
    });
    // Past targets: a green segment each, a check where it was held
    const segH = Math.max(6, (h - 6) / (hi - lo) * 0.9);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, nowX - x, h);
    ctx.clip();
    (m.targets || []).forEach((tg) => {
      const a = Math.max(t0, tg.t0);
      const b = Math.min(t1, tg.t1 == null ? m.clock : tg.t1);
      if (b <= a) return;
      const ty = Y(tg.midi);
      ctx.fillStyle = C.targetSoft;
      ctx.fillRect(X(a), ty - segH / 2, Math.max(2, X(b) - X(a)), segH);
      if (tg.held && tg.t1 != null && tg.t1 <= t1) glyph(ctx, "check", X(tg.t1) - 7, ty - segH / 2 - 6, C.done, 4);
    });
    ctx.restore();
    // Your voice
    ctx.strokeStyle = C.you;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    let prev = null;
    let started = false;
    for (let i = 0; i < m.trace.length; i++) {
      const p = m.trace[i];
      if (p.t < t0) continue;
      if (p.t > t1) break;
      if (p.m == null) {
        prev = null;
        continue;
      }
      const px = X(p.t);
      const py = Y(p.m);
      if (prev && p.t - prev.t < 0.2) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
      started = true;
      prev = p;
    }
    if (started) ctx.stroke();
    if (review) return;
    // Now line (or the page's playhead with reduced motion)
    const hx = head != null ? X(head) : nowX;
    ctx.strokeStyle = "rgba(238, 243, 250, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hx, y + 2);
    ctx.lineTo(hx, y + h - 2);
    ctx.stroke();
    // The current target, filling as you hold it, then the next ones
    const qRight = x + w - 34;
    const bw = clamp((qRight - nowX) / 4.6, 22, 90);
    const gap = 6;
    if (m.wantMidi != null) {
      const ty = Y(m.wantMidi);
      const bh = Math.max(12, segH + 4);
      ctx.fillStyle = C.targetSoft;
      roundRect(ctx, nowX, ty - bh / 2, bw, bh, 4);
      ctx.fill();
      const frac = clamp((m.inBand || 0) / (m.holdMs || 900), 0, 1);
      if (frac > 0) {
        ctx.fillStyle = "rgba(255, 211, 110, 0.75)";
        roundRect(ctx, nowX, ty - bh / 2, Math.max(4, bw * frac), bh, 4);
        ctx.fill();
      }
      ctx.strokeStyle = C.target;
      ctx.lineWidth = 2;
      roundRect(ctx, nowX + 0.5, ty - bh / 2 + 0.5, bw - 1, bh - 1, 4);
      ctx.stroke();
      const above = ty - bh / 2 - 9 > y + 6;
      V.label(ctx, noteLabel(m.wantLabel), nowX + bw / 2, above ? ty - bh / 2 - 9 : ty + bh / 2 + 9, {
        align: "center",
        font: font(o.tiny ? 10 : 11, 800),
        color: C.text
      });
      // s24: above your starting volume, the target says so
      if (m.focus === "soft" && m.soft && m.soft.overMs > 600) {
        const wy = above ? ty + bh / 2 + 10 : ty - bh / 2 - 22;
        glyph(ctx, "tri", nowX + 6, wy, C.warn, 4.5);
        V.label(ctx, L("más suave", "softer"), nowX + 14, wy, { font: font(10, 800), color: C.warn });
      }
    }
    (m.queue || []).forEach((q, k) => {
      if (q.midi == null) return;
      const qx = nowX + (bw + gap) * (k + 1);
      if (qx + bw * 0.8 > qRight + 30) return;
      const qy = Y(q.midi);
      const qh = Math.max(10, segH);
      ctx.strokeStyle = C.target;
      ctx.globalAlpha = 0.75 - k * 0.18;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      roundRect(ctx, qx + 0.5, qy - qh / 2 + 0.5, bw * 0.8 - 1, qh - 1, 4);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!o.tiny || k === 0) text(ctx, noteLabel(q.label), qx + bw * 0.4, qy - qh / 2 - 7, { px: 9, color: C.muted, align: "center", maxW: bw + gap });
      ctx.globalAlpha = 1;
    });
    // Where you are now
    if (m.fresh && m.clock - m.fresh.at < 0.2) {
      const out = m.fresh.m > hi ? 1 : m.fresh.m < lo ? -1 : 0;
      const py = Y(m.fresh.m);
      if (out) glyph(ctx, out > 0 ? "up" : "tri", hx, out > 0 ? y + 8 : y + h - 8, C.you, 6);
      else {
        ctx.fillStyle = C.you;
        ctx.beginPath();
        ctx.arc(hx, py, 5.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (m.octHint) {
      const s =
        m.octHint > 0
          ? L("Una octava por encima de la nota · si ahí está tu voz, pulsa + en octava", "An octave above the note · if your voice lives there, press octave +")
          : L("Una octava por debajo de la nota · si ahí está tu voz, pulsa − en octava", "An octave below the note · if your voice lives there, press octave −");
      const short = m.octHint > 0 ? L("Una octava arriba · octava +", "An octave up · octave +") : L("Una octava abajo · octava −", "An octave down · octave −");
      ctx.font = font(10, 700);
      const use = ctx.measureText(s).width < w - 20 ? s : short;
      V.label(ctx, use, x + w / 2, y + 12, { align: "center", font: font(10, 700), color: C.text });
    }
  }

  function sideFrame(ctx, box) {
    ctx.fillStyle = "rgba(170, 195, 230, 0.05)";
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
  }

  /** s21: level against your own average, tone clarity, the clear floor. */
  function sideBody(ctx, box, m, o) {
    sideFrame(ctx, box);
    const { x, y, w, h } = box;
    const rel = m.lvl && m.lvl.rel;
    const clar = m.clar && m.clar.now;
    const clarWord = (c) => (c == null ? "—" : c >= 0.85 ? L("claro", "clear") : c >= 0.8 ? L("casi claro", "nearly clear") : L("áspero o con aire", "rough or airy"));
    if (o.mini) {
      const lv = rel == null || o.review ? "—" : dB(rel);
      text(ctx, `${L("Volumen", "Level")} ${lv}`, x + 8, y + h * 0.3, { px: 11, color: C.text, maxW: w - 16 });
      text(ctx, `${L("Tono", "Tone")}: ${clarWord(o.review ? null : clar)}`, x + 8, y + h * 0.72, { px: 11, color: clar != null && clar < 0.8 && !o.review ? C.warn : C.muted, maxW: w - 16 });
      return;
    }
    if (o.review) return bodyReview(ctx, box, m);
    const gx = x + 10;
    const gw = w - 20;
    sectionTitle(ctx, L("Volumen · frente a tu media", "Level · against your average"), gx, y + 12, gw * 0.72);
    if (rel != null) text(ctx, dB(rel), gx + gw, y + 12, { px: 12, weight: 800, align: "right", color: Math.abs(rel) > 3 ? C.warn : C.you });
    V.gauge(ctx, { x: gx, y: y + 24, w: gw, h: 38 }, {
      lo: -9,
      hi: 9,
      value: rel,
      bands: [{ from: -3, to: 3, label: L("parejo", "even") }],
      left: L("más suave", "softer"),
      right: L("más fuerte", "louder")
    });
    const cy = y + 84;
    sectionTitle(ctx, L("Claridad del tono · aprox.", "Tone clarity · approx."), gx, cy, gw);
    V.gauge(ctx, { x: gx, y: cy + 10, w: gw, h: 38 }, {
      lo: 0.5,
      hi: 1,
      value: clar,
      bands: [
        { from: 0.5, to: 0.8, color: hatch(ctx, "rgba(255, 159, 90, 0.6)"), stroke: C.warn, label: L("áspero o con aire", "rough or airy") },
        { from: 0.85, to: 1, label: L("claro", "clear") }
      ]
    });
    let ty = cy + 64;
    if (m.clar && m.clar.lowMs > 1000 && ty < y + h - 10) {
      glyph(ctx, "tri", gx + 5, ty, C.warn, 4.5);
      text(ctx, L("Áspero o con aire: no bajes más de lo cómodo", "Rough or airy: go no lower than is easy"), gx + 14, ty, { px: 11, color: C.warn, maxW: gw - 14 });
      ty += 18;
    }
    if (m.floor && ty < y + h - 8) {
      glyph(ctx, "check", gx + 5, ty, C.done, 4.5);
      text(ctx, L(`Nota clara más grave hoy: ${noteLabel(m.floor.name)}`, `Lowest clear note today: ${noteLabel(m.floor.name)}`), gx + 14, ty, { px: 11, color: C.done, maxW: gw - 14 });
    }
  }

  function bodyReview(ctx, box, m) {
    const { x, y, w, h } = box;
    const gx = x + 10;
    const gw = w - 20;
    sectionTitle(ctx, L("Cada nota sostenida · aprox.", "Each note you held · approx."), gx, y + 12, gw);
    const byNote = new Map();
    (m.cards || []).forEach((c) => {
      const k = Math.round(c.midi);
      if (!byNote.has(k)) byNote.set(k, { name: c.name, midi: c.midi, clar: [], db: [] });
      const e = byNote.get(k);
      if (c.clar != null) e.clar.push(c.clar);
      if (c.db != null) e.db.push(c.db);
    });
    const K = V.scenes.resonanceKit;
    const allDb = (m.cards || []).map((c) => c.db).filter((d) => d != null);
    const mean = allDb.length ? allDb.reduce((a, b) => a + b, 0) / allDb.length : null;
    const rows = [...byNote.entries()].sort((a, b) => b[0] - a[0]);
    if (!rows.length) {
      text(ctx, L("Sin notas sostenidas en esta toma", "No notes held in this take"), gx, y + 36, { px: 11, color: C.faint, maxW: gw });
      return;
    }
    const rowH = clamp((h - 30) / rows.length, 15, 22);
    rows.forEach(([, e], i) => {
      const ry = y + 30 + i * rowH;
      if (ry > y + h - 6) return;
      const c = K.median(e.clar);
      const d = mean != null && e.db.length ? K.median(e.db) - mean : null;
      const rough = c != null && c < 0.8;
      text(ctx, noteLabel(e.name), gx, ry, { px: 11, color: C.text, maxW: gw * 0.34 });
      if (rough) glyph(ctx, "tri", gx + gw * 0.36 + 4, ry, C.warn, 4);
      text(ctx, c == null ? "—" : c >= 0.85 ? L("claro", "clear") : c >= 0.8 ? L("casi claro", "nearly clear") : L("áspero o con aire", "rough or airy"), gx + gw * 0.36 + (rough ? 12 : 0), ry, {
        px: 11,
        color: rough ? C.warn : C.muted,
        maxW: gw * 0.4
      });
      if (d != null) text(ctx, dB(d), gx + gw, ry, { px: 10, color: C.muted, align: "right" });
      if (m.floor && Math.round(m.floor.midi) === Math.round(e.midi || -1)) glyph(ctx, "check", gx + gw * 0.3, ry, C.done, 4);
    });
  }

  /** s22: where your speaking pitch sits, and how a sung turn compares. */
  function sideSpeech(ctx, box, m, o) {
    sideFrame(ctx, box);
    const { x, y, w, h } = box;
    const sp = m.sp || { pairs: [], turns: [] };
    const K = V.scenes.resonanceKit;
    const pairs = sp.pairs || [];
    const last = o.review && pairs.length
      ? { dDb: K.median(pairs.map((p) => p.dDb)), dBr: pairs.some((p) => p.dBr != null) ? K.median(pairs.filter((p) => p.dBr != null).map((p) => p.dBr)) : null, dSt: K.median(pairs.map((p) => p.dSt)) }
      : pairs[pairs.length - 1];
    const lvWord = (d) => (Math.abs(d) <= 3 ? L("parejo", "even") : d > 0 ? L("más fuerte al cantar", "louder when sung") : L("más suave al cantar", "softer when sung"));
    const brWord = (d) => (d == null ? "—" : Math.abs(d) <= 1.5 ? L("parecido", "similar") : d > 0 ? L("más brillante al cantar", "brighter when sung") : L("más oscuro al cantar", "darker when sung"));
    if (o.mini) {
      const s = last
        ? `${L("Cantado vs hablado", "Sung vs spoken")}: ${dB(last.dDb)} · ${brWord(last.dBr)}`
        : L("Di «hola» y luego cántalo", "Say 'hola', then sing it");
      text(ctx, s, x + 8, y + h / 2, { px: 11, color: last ? C.text : C.muted, maxW: w - 16 });
      return;
    }
    const gx = x + 10;
    const gw = w - 20;
    const spoken = (sp.turns || []).filter((t) => t.kind === "spoken").length;
    const sung = (sp.turns || []).filter((t) => t.kind === "sung").length;
    const counts = L(`${spoken} hablados · ${sung} cantados`, `${spoken} spoken · ${sung} sung`);
    const title = o.review ? L("Cantado frente a hablado · mediana", "Sung against spoken · median") : L("Hablado → cantado", "Spoken → sung");
    ctx.font = font(10, 700);
    const cw = ctx.measureText(counts).width;
    ctx.font = font(11, 700);
    const both = ctx.measureText(title).width + cw + 16 <= gw;
    sectionTitle(ctx, title, gx, y + 12, both ? gw - cw - 12 : gw);
    if (both) text(ctx, counts, gx + gw, y + 12, { px: 10, color: C.faint, align: "right" });
    if (!last) {
      text(ctx, L("Di «hola, hola» y luego canta la nota:", "Say 'hola, hola', then sing the note:"), gx, y + 40, { px: 11, color: C.muted, maxW: gw });
      text(ctx, L("aquí verás la diferencia.", "the difference shows here."), gx, y + 58, { px: 11, color: C.muted, maxW: gw });
      if (sp.band) text(ctx, L(`Tu voz hablada: ${dualLabel(sp.band.med)} (aprox.)`, `Your speaking voice: ${dualLabel(sp.band.med)} (approx.)`), gx, y + 84, { px: 11, color: C.you, maxW: gw });
      return;
    }
    const level = Math.abs(last.dSt) < 0.5;
    const rows = [
      {
        k: L("Altura", "Pitch"),
        v: level ? "0" : stLabel(last.dSt),
        wd: level ? L("a la altura de tu voz hablada", "at your speaking pitch") : last.dSt > 0 ? L("sobre tu voz hablada", "above your speaking voice") : L("bajo tu voz hablada", "below your speaking voice"),
        warn: false,
        bar: null
      },
      { k: L("Volumen", "Level"), v: dB(last.dDb), wd: lvWord(last.dDb), warn: Math.abs(last.dDb) > 3, bar: { v: last.dDb, lo: -9, hi: 9, ok: 3 } },
      { k: L("Brillo · aprox.", "Brightness · approx."), v: last.dBr == null ? "—" : dB(last.dBr), wd: brWord(last.dBr), warn: false, bar: last.dBr == null ? null : { v: last.dBr, lo: -8, hi: 8, ok: 1.5 } }
    ];
    // Two lines a row: the name and the number, then the words and a small bar
    const rowH = clamp((h - 26) / 3, 26, 46);
    rows.forEach((r, i) => {
      const ry = y + 30 + i * rowH;
      if (ry > y + h - 8) return;
      text(ctx, r.k, gx, ry, { px: 10, color: C.faint, maxW: gw * 0.55 });
      text(ctx, r.v, gx + gw, ry, { px: 12, weight: 800, color: r.warn ? C.warn : C.text, align: "right", maxW: gw * 0.44 });
      if (rowH < 34) return;
      const wy = ry + 15;
      const bw = r.bar ? Math.min(gw * 0.42, 150) : 0;
      text(ctx, r.wd, gx, wy, { px: 10, color: r.warn ? C.warn : C.muted, maxW: gw - bw - 10 });
      if (r.bar) {
        const bx = gx + gw - bw;
        const by = wy - 2.5;
        const xOf = (v) => bx + ((clamp(v, r.bar.lo, r.bar.hi) - r.bar.lo) / (r.bar.hi - r.bar.lo)) * bw;
        ctx.fillStyle = "rgba(170, 195, 230, 0.1)";
        ctx.fillRect(bx, by, bw, 5);
        ctx.fillStyle = C.targetSoft;
        ctx.fillRect(xOf(-r.bar.ok), by, xOf(r.bar.ok) - xOf(-r.bar.ok), 5);
        ctx.fillStyle = C.faint;
        ctx.fillRect(xOf(0) - 0.5, by - 2, 1, 9);
        ctx.fillStyle = C.you;
        ctx.beginPath();
        ctx.arc(xOf(r.bar.v), by + 2.5, 4.5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  /** s23: brightness against loudness, both against your normal "YA". */
  function sideBright(ctx, box, m, o) {
    sideFrame(ctx, box);
    const { x, y, w, h } = box;
    const br = m.br || { p: 0, pts: [], med: [] };
    const names = [L("Normal", "Normal"), L("Exagera", "Exaggerate"), L("Mantén", "Keep"), L("Equilibra", "Balance")];
    const letters = ["N", "E", "M", "B"];
    let plotBox;
    if (o.mini) {
      const s = Math.min(h - 8, w * 0.55);
      plotBox = { x: x + w - s - 6, y: y + 4, w: s, h: h - 8 };
      text(ctx, names[br.p], x + 8, y + 14, { px: 11, weight: 800, color: C.text, maxW: w - s - 20 });
      if (br.louder) {
        glyph(ctx, "tri", x + 12, y + 34, C.warn, 4);
        text(ctx, L("más fuerte, no más brillante", "louder, not brighter"), x + 20, y + 34, { px: 10, color: C.warn, maxW: w - s - 30 });
      } else text(ctx, L("brillo · aprox.", "brightness · approx."), x + 8, y + 34, { px: 10, color: C.faint, maxW: w - s - 20 });
    } else {
      V.chips(ctx, { x: x + 8, y: y + 6, w: w - 16, h: o.compact ? 22 : 26 }, names.map((n, i) => ({ label: n, short: letters[i], done: o.review ? br.med[i] != null : i < br.p })), {
        current: o.review ? -1 : br.p
      });
      const top = y + (o.compact ? 34 : 40);
      const foot = h >= 200 ? 30 : 16;
      const side = Math.min(w - 40, h - (top - y) - foot);
      plotBox = { x: x + (w - side) / 2 + 8, y: top, w: side, h: side };
      text(ctx, L("Brillo = energía aguda (2–4 kHz) · aprox.", "Brightness = high energy (2–4 kHz) · approx."), x + w / 2, y + h - (foot > 16 ? 22 : 8), { px: 9, color: C.faint, align: "center", maxW: w - 12 });
      if (foot > 16) text(ctx, L("La máscara la sientes tú; aquí ves el brillo", "The mask is yours to feel; this shows brightness"), x + w / 2, y + h - 9, { px: 9, color: C.faint, align: "center", maxW: w - 12 });
    }
    const { x: px, y: py, w: pw, h: ph } = plotBox;
    if (pw < 40 || ph < 40) return;
    const R = 9;
    const X = (v) => px + ((clamp(v, -R, R) + R) / (2 * R)) * pw;
    const Y = (v) => py + ph - ((clamp(v, -R, R) + R) / (2 * R)) * ph;
    ctx.fillStyle = "rgba(170, 195, 230, 0.06)";
    ctx.fillRect(px, py, pw, ph);
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 0.5, py + 0.5, pw - 1, ph - 1);
    ctx.strokeStyle = C.gridStrong;
    ctx.beginPath();
    ctx.moveTo(X(0), py);
    ctx.lineTo(X(0), py + ph);
    ctx.moveTo(px, Y(0));
    ctx.lineTo(px + pw, Y(0));
    ctx.stroke();
    if (!o.mini) {
      text(ctx, L("↑ más brillante", "↑ brighter"), px + 4, py + 8, { px: 9, color: C.faint });
      text(ctx, L("↓ más oscuro", "↓ darker"), px + 4, py + ph - 8, { px: 9, color: C.faint });
      // Loudness words sit outside the plot when there is room beside it
      const room = Math.min(px - x, x + w - px - pw) - 8;
      if (room >= 58) {
        text(ctx, L("más fuerte →", "louder →"), px + pw + 4, Y(0), { px: 9, color: C.faint, maxW: room });
        text(ctx, L("← más suave", "← softer"), px - 4, Y(0), { px: 9, color: C.faint, align: "right", maxW: room });
      } else {
        text(ctx, L("más fuerte →", "louder →"), px + pw - 4, Y(0) - 7, { px: 9, color: C.faint, align: "right" });
        if (ph >= 140) text(ctx, L("← más suave", "← softer"), px + 4, Y(0) + 8, { px: 9, color: C.faint });
      }
    }
    if (!br.base) {
      if (!o.mini) V.label(ctx, L("Canta «YA» normal: será tu punto de partida", "Sing a normal 'YA': your starting point"), px + pw / 2, py + ph * 0.32, { align: "center", font: font(10, 700), color: C.muted });
      return;
    }
    // Each phase's median: a letter, gold once the phase is behind you
    (br.med || []).forEach((p, i) => {
      if (!p) return;
      const done = o.review || i < br.p;
      const cx = X(p.x);
      const cy = Y(p.y);
      ctx.beginPath();
      ctx.arc(cx, cy, 8, 0, Math.PI * 2);
      if (done) {
        ctx.fillStyle = C.done;
        ctx.fill();
      } else {
        ctx.strokeStyle = C.text;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      text(ctx, letters[i], cx, cy + 0.5, { px: 9, weight: 800, align: "center", color: done ? "#1b1406" : C.text });
    });
    if (!o.review) {
      const pts = br.pts || [];
      pts.forEach((p) => {
        const age = m.clock - p.t;
        ctx.globalAlpha = clamp(1 - age / 3, 0.08, 0.7);
        ctx.fillStyle = C.you;
        ctx.beginPath();
        ctx.arc(X(p.x), Y(p.y), 2.5, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      const lastP = pts[pts.length - 1];
      if (lastP && m.clock - lastP.t < 0.3) {
        ctx.fillStyle = C.you;
        ctx.beginPath();
        ctx.arc(X(lastP.x), Y(lastP.y), 5.5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (br.louder && !o.mini) {
        ctx.strokeStyle = C.warn;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(X(0.5), Y(0) + 12);
        ctx.lineTo(X(6), Y(0) + 12);
        ctx.stroke();
        glyph(ctx, "tri", X(6) + 4, Y(0) + 12, C.warn, 4);
        V.label(ctx, L("más fuerte, no más brillante", "louder, not brighter"), px + pw / 2, py + ph - 18, { align: "center", font: font(10, 800), color: C.warn });
      }
    }
  }

  /** s24: your level against the volume you started with, and each note held. */
  function sideSoft(ctx, box, m, o) {
    sideFrame(ctx, box);
    const { x, y, w, h } = box;
    const soft = m.soft || {};
    const gx = x + 10;
    const gw = w - 20;
    const gaugeOpts = {
      lo: -6,
      hi: 12,
      value: o.review ? null : soft.rel,
      bands: [
        { from: -6, to: 3, label: L("suave", "soft") },
        { from: 3, to: 12, color: hatch(ctx, "rgba(255, 159, 90, 0.5)"), stroke: C.warn, label: L("más fuerte", "louder") }
      ],
      ghosts: [{ v: 0, label: L("inicio", "start") }]
    };
    if (o.mini) {
      if (soft.ref == null) text(ctx, L("Empieza suave: tomo tu volumen de inicio", "Start soft: taking your starting volume"), x + 8, y + h / 2, { px: 11, color: C.muted, maxW: w - 16 });
      else V.gauge(ctx, { x: gx, y: y + 6, w: gw, h: h - 12 }, Object.assign({}, gaugeOpts, { ghosts: [] }));
      return;
    }
    sectionTitle(ctx, L("Volumen · frente a tu inicio", "Level · against your start"), gx, y + 12, gw * 0.72);
    if (soft.rel != null && !o.review) text(ctx, dB(soft.rel), gx + gw, y + 12, { px: 12, weight: 800, align: "right", color: soft.rel > 3 ? C.warn : C.you });
    let cy = y + 26;
    if (soft.ref == null && !o.review) {
      text(ctx, L("Empieza suave: tu primer segundo y medio", "Start soft: your first second and a half"), gx, cy + 14, { px: 11, color: C.muted, maxW: gw });
      text(ctx, L("marca tu volumen de inicio.", "sets your starting volume."), gx, cy + 30, { px: 11, color: C.muted, maxW: gw });
      cy += 48;
    } else if (!o.review) {
      V.gauge(ctx, { x: gx, y: cy, w: gw, h: 44 }, gaugeOpts);
      cy += 56;
      if (soft.overMs > 600) {
        glyph(ctx, "tri", gx + 5, cy, C.warn, 4.5);
        text(ctx, L("Más suave: vuelve a tu volumen de inicio", "Softer: back to your starting volume"), gx + 14, cy, { px: 11, color: C.warn, maxW: gw - 14 });
      }
      cy += 16;
    }
    // A card per note held: soft or not, and how steady
    const cards = (m.cards || []).slice(o.review ? -12 : -6);
    if (!cards.length) return;
    const cw = clamp(gw / Math.min(6, cards.length), 50, 78);
    const perRow = Math.max(1, Math.floor(gw / cw));
    const ch = 46;
    const rows = Math.max(1, Math.floor((y + h - cy - 4) / (ch + 4)));
    const shown = cards.slice(-perRow * rows);
    shown.forEach((c, i) => {
      const cx = gx + (i % perRow) * cw;
      const ry = cy + Math.floor(i / perRow) * (ch + 4);
      ctx.fillStyle = c.soft === false ? C.warnSoft : "rgba(255, 211, 110, 0.12)";
      roundRect(ctx, cx + 1, ry, cw - 4, ch, 6);
      ctx.fill();
      text(ctx, dualLabel(c.midi), cx + (cw - 3) / 2, ry + 10, { px: 10, weight: 800, align: "center", color: C.text, maxW: cw - 8 });
      if (c.soft === false) {
        text(ctx, dB(c.maxRel), cx + (cw - 3) / 2, ry + 24, { px: 10, align: "center", color: C.warn, maxW: cw - 8 });
      } else if (c.soft) {
        glyph(ctx, "check", cx + 10, ry + 24, C.done, 3.5);
        text(ctx, L("suave", "soft"), cx + (cw - 3) / 2 + 5, ry + 24, { px: 10, align: "center", color: C.done, maxW: cw - 18 });
      }
      if (c.sd != null) text(ctx, `±${Math.round(c.sd)} ¢`, cx + (cw - 3) / 2, ry + 37, { px: 9, align: "center", color: C.muted, maxW: cw - 8 });
    });
  }

  /** s25: where you are in the tour, and what each seam did to your level. */
  function sideSeams(ctx, box, m, o) {
    sideFrame(ctx, box);
    const { x, y, w, h } = box;
    const gx = x + 10;
    const gw = w - 20;
    const zs = m.zones || [];
    const total = zs.reduce((a, z) => a + (z.sec || 0), 0) || 1;
    // The tour: one segment per zone, the marker where you are
    const tlY = y + (o.mini ? 10 : 26);
    const tlH = o.mini ? 16 : 20;
    if (!o.mini) {
      sectionTitle(ctx, o.review ? L("Tu recorrido · volumen", "Your tour · level") : L(`Pasada ${m.passes + 1}`, `Pass ${m.passes + 1}`), gx, y + 12, gw * 0.5);
      const zone = zs[m.z];
      const left = zone && zone.sec ? zone.sec - m.t : null;
      if (!o.review && left != null && left <= 10) {
        text(ctx, L(`costura en ${Math.ceil(left)} s`, `seam in ${Math.ceil(left)} s`), gx + gw, y + 12, { px: 11, weight: 800, color: C.text, align: "right" });
      }
    }
    if (o.review) return seamsReview(ctx, box, m);
    let acc = 0;
    zs.forEach((z, i) => {
      const zx = gx + (acc / total) * gw;
      const zw = ((z.sec || 0) / total) * gw;
      acc += z.sec || 0;
      const cur = i === m.z;
      const done = i < m.z;
      ctx.fillStyle = done ? "rgba(255, 211, 110, 0.14)" : cur ? C.targetSoft : "rgba(170, 195, 230, 0.07)";
      roundRect(ctx, zx + 1, tlY, zw - 2, tlH, 5);
      ctx.fill();
      if (cur) {
        ctx.strokeStyle = C.text;
        ctx.lineWidth = 1.5;
        roundRect(ctx, zx + 1.5, tlY + 0.5, zw - 3, tlH - 1, 5);
        ctx.stroke();
      }
      text(ctx, zoneName(z), zx + zw / 2, tlY + tlH / 2 + 0.5, { px: o.mini ? 9 : 10, weight: cur ? 800 : 700, align: "center", color: done ? C.done : cur ? C.text : C.muted, maxW: zw - 6 });
    });
    const before = zs.slice(0, m.z).reduce((a, z) => a + (z.sec || 0), 0);
    const mx = gx + ((before + m.t) / total) * gw;
    ctx.fillStyle = C.you;
    ctx.fillRect(mx - 1, tlY - 3, 2.5, tlH + 6);
    if (o.mini) return;
    // Seam cards: level 3 s after against 3 s before
    const cards = (m.seams || []).slice(-3);
    let cy = tlY + tlH + 16;
    sectionTitle(ctx, L("Costuras · volumen al entrar", "Seams · level on entering"), gx, cy, gw);
    cy += 16;
    if (!cards.length) {
      text(ctx, L("La primera costura llega al cambiar de zona", "The first seam comes when the zone changes"), gx, cy + 4, { px: 11, color: C.faint, maxW: gw });
      return;
    }
    cards.forEach((s) => {
      if (cy > y + h - 8) return;
      const lbl = `${zoneName(zs[s.from])} → ${zoneName(zs[s.to])}`;
      text(ctx, lbl, gx, cy, { px: 11, color: C.text, maxW: gw * 0.5 });
      let wd;
      let col = C.muted;
      if (s.d == null) wd = L("midiendo…", "measuring…");
      else if (!Number.isFinite(s.d)) wd = L("sin datos (silencio)", "no data (silence)");
      else if (Math.abs(s.d) <= 3) wd = `${dB(s.d)} · ${L("parejo", "even")}`;
      else {
        wd = `${dB(s.d)} · ${s.d > 0 ? L("más fuerte al entrar", "louder on entering") : L("más suave al entrar", "softer on entering")}`;
        col = C.warn;
        glyph(ctx, s.d > 0 ? "up" : "tri", gx + gw * 0.52, cy, C.warn, 4);
      }
      text(ctx, wd, gx + gw, cy, { px: 10, color: col, align: "right", maxW: gw * 0.44 });
      cy += 18;
    });
  }

  /** After Stop: the whole tour's level against your average, seams marked. */
  function seamsReview(ctx, box, m) {
    const { x, y, w, h } = box;
    const gx = x + 10;
    const gw = w - 20;
    const K = V.scenes.resonanceKit;
    const pts = (m.trace || []).filter((p) => p.db != null);
    const rx = gx;
    const ry = y + 26;
    const rh = Math.max(40, h - 60);
    ctx.fillStyle = "rgba(170, 195, 230, 0.05)";
    ctx.fillRect(rx, ry, gw, rh);
    if (pts.length < 10) {
      text(ctx, L("Sin sonido suficiente para el recorrido", "Not enough sound for the tour"), gx, ry + rh / 2, { px: 11, color: C.faint, maxW: gw });
      return;
    }
    const med = K.median(pts.map((p) => p.db));
    const t0 = m.trace[0].t;
    const t1 = Math.max(t0 + 1, m.clock);
    const X = (t) => rx + ((t - t0) / (t1 - t0)) * gw;
    const Y = (d) => ry + rh / 2 - (clamp(d, -12, 12) / 12) * (rh / 2 - 4);
    ctx.fillStyle = C.targetSoft;
    ctx.fillRect(rx, Y(3), gw, Y(-3) - Y(3));
    text(ctx, L("tu media ±3 dB", "your average ±3 dB"), rx + 4, Y(3) - 7, { px: 9, color: C.faint });
    // Each phrase (a run of sound) as one bar at its median level, so the
    // ribbon reads as phrases and a note's quiet tail does not look like a dip
    const runs = [];
    let run = null;
    pts.forEach((p) => {
      if (!run || p.t - run.t1 > 0.3) {
        run = { t0: p.t, t1: p.t, db: [] };
        runs.push(run);
      }
      run.t1 = p.t;
      run.db.push(p.db);
    });
    runs.forEach((r) => {
      if (r.t1 - r.t0 < 0.3) return;
      const v = K.median(r.db) - med;
      const off = Math.abs(v) > 3;
      ctx.fillStyle = off ? C.warn : C.you;
      const bx = X(r.t0);
      const bw = Math.max(2, X(r.t1) - bx - 1);
      ctx.fillRect(bx, Y(v) - 1.5, bw, 3);
      if (off) glyph(ctx, v > 0 ? "up" : "tri", bx + bw / 2, v > 0 ? Y(v) - 8 : Y(v) + 8, C.warn, 3.5);
    });
    (m.seams || []).forEach((s) => {
      const sx = X(s.t);
      ctx.strokeStyle = Number.isFinite(s.d) && Math.abs(s.d) > 3 ? C.warn : C.gridStrong;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(sx, ry);
      ctx.lineTo(sx, ry + rh);
      ctx.stroke();
      ctx.setLineDash([]);
      if (Number.isFinite(s.d)) text(ctx, dB(s.d), sx + 3, ry + 8, { px: 9, color: Math.abs(s.d) > 3 ? C.warn : C.muted });
    });
    const n = (m.seams || []).length;
    text(ctx, L(`${n} ${n === 1 ? "costura" : "costuras"} · ${m.passes} ${m.passes === 1 ? "pasada completa" : "pasadas completas"}`, `${n} ${n === 1 ? "seam" : "seams"} · ${m.passes} full ${m.passes === 1 ? "pass" : "passes"}`), gx, y + h - 12, {
      px: 10,
      color: C.muted,
      maxW: gw
    });
  }

  V.scenes.zones = zones;

  /* ——————————————————————— Placement A/B (s26) ——————————————————————— */

  /**
   * Two lanes, A above B, on one time scale: the line is the pitch against
   * take A's own middle (so a take sung in another key sits visibly off the
   * dashed line), the shade underneath is the level. Beside them the facts
   * that decide whether the comparison is fair, then what differs
   * (brightness and the spectrum's shape, approximate). No verdict.
   *
   * model: the placementAB state (stage, takes, A, B, cur, recording,
   * facts, playing, match, review, clock)
   */
  function abTakes(ctx, w, h, m) {
    panel(ctx, w, h);
    const pad = 10;
    const tiny = h < 135;
    const compact = h < 190;
    const headH = tiny ? 0 : compact ? 20 : 26;
    if (!tiny) {
      const right = L(`${m.takes}/2 tomas`, `${m.takes}/2 takes`);
      ctx.font = font(compact ? 10 : 11, 700);
      const rightW = ctx.measureText(right).width;
      let head;
      if (m.review) head = L("Tus dos tomas · decide tu oído", "Your two takes · your ear decides");
      else if (m.stage === "listen") head = L("Escucha las dos: ▶ A y ▶ B", "Listen to both: ▶ A and ▶ B");
      else if (m.recording) head = L(`Grabando la toma ${m.stage} · ${V.fmtSec(m.cur ? m.cur.dur : 0, 1)}`, `Recording take ${m.stage} · ${V.fmtSec(m.cur ? m.cur.dur : 0, 1)}`);
      else if (m.stage === "A") head = L("Toma A · canta la frase tal cual", "Take A · sing the phrase as it comes");
      else head = L("Toma B · la misma frase, colocada", "Take B · the same phrase, placed");
      ctx.fillStyle = C.text;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      fitText(ctx, head, pad + 2, pad + headH / 2 - 2, w - pad * 2 - rightW - 14, compact ? 13 : 15, 800, 9);
      text(ctx, right, w - pad - 2, pad + headH / 2 - 2, { align: "right", color: m.takes >= 2 ? C.done : C.muted, px: compact ? 10 : 11 });
    }
    const top = tiny ? pad - 3 : pad + headH + 2;
    const bodyH = h - top - pad + (tiny ? 3 : 0);
    const wide = w >= 560;
    let lanesBox;
    let factsBox = null;
    let mini = false;
    if (wide) {
      const fw = Math.round(tiny ? clamp(w * 0.34, 200, 300) : clamp(w * 0.38, 220, 400));
      lanesBox = { x: pad, y: top, w: w - pad * 3 - fw, h: bodyH };
      factsBox = { x: w - pad - fw, y: top, w: fw, h: bodyH };
      mini = tiny;
    } else if (bodyH >= 250) {
      const lh = Math.round(bodyH * 0.46);
      lanesBox = { x: pad, y: top, w: w - pad * 2, h: lh };
      factsBox = { x: pad, y: top + lh + 8, w: w - pad * 2, h: bodyH - lh - 8 };
    } else {
      const fh = Math.min(26, Math.round(bodyH * 0.24));
      lanesBox = { x: pad, y: top, w: w - pad * 2, h: bodyH - fh - 4 };
      factsBox = { x: pad, y: top + bodyH - fh, w: w - pad * 2, h: fh };
      mini = true;
    }
    const gap = 6;
    const lh = (lanesBox.h - gap) / 2;
    const T = Math.max(4, (m.A && m.A.dur) || 0, (m.B && m.B.dur) || 0, (m.cur && m.cur.dur + 1) || 0);
    const ref = m.A && m.A.medMidi != null ? m.A.medMidi : null;
    const refDb = m.A && m.A.medDb != null ? m.A.medDb : null;
    ["A", "B"].forEach((k, i) => {
      takeLane(ctx, { x: lanesBox.x, y: lanesBox.y + i * (lh + gap), w: lanesBox.w, h: lh }, m, k, { T, ref, refDb, tiny, compact });
    });
    if (factsBox) abFacts(ctx, factsBox, m, { mini, compact, tiny });
  }

  function takeLane(ctx, box, m, k, o) {
    const { x, y, w, h } = box;
    ctx.fillStyle = "rgba(170, 195, 230, 0.05)";
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    const live = m.recording && m.cur && m.cur.name === k;
    const tk = live ? m.cur : m[k];
    // The take's letter, and what it is for
    const chip = Math.min(26, h - 8);
    const done = !!(m[k] && !live);
    ctx.fillStyle = done ? "rgba(255, 211, 110, 0.18)" : live ? C.youSoft : "rgba(170, 195, 230, 0.08)";
    roundRect(ctx, x + 6, y + 5, chip, chip, 6);
    ctx.fill();
    text(ctx, k, x + 6 + chip / 2, y + 5 + chip / 2 + 0.5, { px: Math.min(15, chip * 0.6), weight: 800, align: "center", color: done ? C.done : C.text });
    const px = x + chip + 14;
    const pw = w - chip - 20;
    const py = y + 4;
    const ph = h - 8;
    if (!o.tiny && h >= 54) {
      text(ctx, k === "A" ? L("tal cual", "as it comes") : L("colocada", "placed"), x + 6, y + chip + 16, { px: 9, color: C.faint, maxW: chip + 30 });
    }
    const X = (t) => px + (clamp(t, 0, o.T) / o.T) * pw;
    const R = 7;
    const center = o.ref != null ? o.ref : tk && tk.medMidi != null ? tk.medMidi : null;
    const Y = (mm) => py + ph / 2 - (clamp(mm - center, -R, R) / R) * (ph / 2 - 3);
    // Take A's middle pitch, dashed, in both lanes
    if (center != null) {
      ctx.strokeStyle = C.gridStrong;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(px, py + ph / 2);
      ctx.lineTo(px + pw, py + ph / 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!o.tiny && k === "B" && o.ref != null) text(ctx, L("altura de A", "A's pitch"), px + pw - 2, py + ph / 2 - 7, { px: 9, color: C.faint, align: "right" });
    }
    if (!tk) {
      const waiting = !m.review && m.stage === k;
      const s = waiting
        ? L("Canta la frase: la toma empieza sola y acaba tras 2 s de silencio", "Sing the phrase: the take starts by itself and ends after 2 s of quiet")
        : k === "B" && !m.review
          ? L("Después: la misma frase, en la misma tonalidad", "Next: the same phrase, in the same key")
          : L("Sin toma", "No take");
      text(ctx, s, px + pw / 2, py + ph / 2, { px: o.tiny ? 10 : 11, color: waiting ? C.muted : C.faint, align: "center", maxW: pw - 10 });
      return;
    }
    if (tk.noAudio) {
      text(ctx, L("Toma marcada sin audio", "Take marked without audio"), px + pw / 2, py + ph / 2, { px: 11, color: C.faint, align: "center", maxW: pw - 10 });
      return;
    }
    // Level as a shade from the bottom (dB against take A's level)
    const pts = tk.pts || [];
    const base = o.refDb != null ? o.refDb : tk.medDb != null ? tk.medDb : null;
    if (base != null) {
      ctx.fillStyle = "rgba(191, 230, 255, 0.13)";
      ctx.beginPath();
      let open = false;
      let lastX = px;
      pts.forEach((p) => {
        if (p.db == null) {
          if (open) {
            ctx.lineTo(lastX, py + ph);
            ctx.closePath();
            ctx.fill();
            ctx.beginPath();
            open = false;
          }
          return;
        }
        const lx = X(p.t);
        const ly = py + ph - clamp((p.db - (base - 24)) / 30, 0, 1) * ph * 0.6;
        if (!open) {
          ctx.moveTo(lx, py + ph);
          open = true;
        }
        ctx.lineTo(lx, ly);
        lastX = lx;
      });
      if (open) {
        ctx.lineTo(lastX, py + ph);
        ctx.closePath();
        ctx.fill();
      }
    }
    // Pitch against A's middle
    if (center != null) {
      ctx.strokeStyle = C.you;
      ctx.lineWidth = 2.2;
      ctx.lineJoin = "round";
      ctx.beginPath();
      let prev = null;
      pts.forEach((p) => {
        if (p.m == null) {
          prev = null;
          return;
        }
        const lx = X(p.t);
        const ly = Y(p.m);
        if (prev && p.t - prev.t < 0.2) ctx.lineTo(lx, ly);
        else ctx.moveTo(lx, ly);
        prev = p;
      });
      ctx.stroke();
    }
    if (live) {
      const ex = X(tk.dur);
      ctx.strokeStyle = "rgba(238, 243, 250, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(ex, py);
      ctx.lineTo(ex, py + ph);
      ctx.stroke();
      glyph(ctx, "dot", px + pw - 60, py + 9, C.text, 9);
      text(ctx, L("grabando", "recording"), px + pw - 52, py + 9, { px: 10, color: C.text });
    } else {
      text(ctx, V.fmtSec(tk.dur, 1), px + pw - 2, py + ph - 8, { px: 10, color: C.muted, align: "right" });
    }
    // Playback position
    const pl = m.playing;
    if (pl && pl.which === k && !V.reducedMotion()) {
      const t = clamp((performance.now() - pl.at) / 1000, 0, pl.dur);
      const hx = X((t / Math.max(0.01, pl.dur)) * tk.dur);
      ctx.strokeStyle = C.done;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(hx, py);
      ctx.lineTo(hx, py + ph);
      ctx.stroke();
    } else if (pl && pl.which === k) {
      text(ctx, L("▶ sonando", "▶ playing"), px + 4, py + 9, { px: 10, color: C.done });
    }
  }

  function abFacts(ctx, box, m, o) {
    const { x, y, w, h } = box;
    ctx.fillStyle = "rgba(170, 195, 230, 0.05)";
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    const f = m.facts;
    const gx = x + 10;
    const gw = w - 20;
    const n1 = (v) => fmtSigned(v, 1);
    if (o.mini) {
      let s;
      if (f) {
        const bits = [];
        if (f.key != null) bits.push(f.keyOk ? L("tonalidad ✓", "key ✓") : L(`tonalidad ${n1(f.key / 100)} st`, `key ${n1(f.key / 100)} st`));
        if (f.vol != null) bits.push(f.volOk ? L("volumen ✓", "level ✓") : L(`volumen ${dB(f.vol)}`, `level ${dB(f.vol)}`));
        if (f.bright != null) bits.push(L(`brillo ${dB(f.bright)} aprox.`, `brightness ${dB(f.bright)} approx.`));
        s = bits.join(" · ");
      } else s = L("1 · Toma A   2 · Toma B   3 · Escucha", "1 · Take A   2 · Take B   3 · Listen");
      text(ctx, s, x + 8, y + h / 2, { px: 10, color: f && !f.fair ? C.warn : C.muted, maxW: w - 16 });
      return;
    }
    if (!f) {
      // The protocol, until both takes are in
      sectionTitle(ctx, L("Cómo se compara", "How to compare"), gx, y + 12, gw);
      const steps = [
        { s: L("Toma A: la frase tal cual", "Take A: the phrase as it comes"), done: !!m.A },
        { s: L("Toma B: misma frase, misma tonalidad, mismo volumen", "Take B: same phrase, same key, same volume"), done: !!m.B },
        { s: L("Escucha las dos y quédate con una", "Listen to both and keep one"), done: false }
      ];
      steps.forEach((st, i) => {
        const ry = y + 34 + i * 22;
        if (ry > y + h - 8) return;
        if (st.done) glyph(ctx, "check", gx + 5, ry, C.done, 4.5);
        else text(ctx, String(i + 1), gx + 5, ry, { px: 11, weight: 800, align: "center", color: C.muted });
        text(ctx, st.s, gx + 16, ry, { px: 11, color: st.done ? C.done : C.text, maxW: gw - 16 });
      });
      if (m.A && m.B && (m.A.noAudio || m.B.noAudio) && y + 110 < y + h) {
        text(ctx, L("Una toma no tiene audio: no hay datos que comparar", "One take has no audio: nothing to compare"), gx, y + 106, { px: 10, color: C.faint, maxW: gw });
      }
      return;
    }
    sectionTitle(ctx, f.fair ? L("Se pueden comparar · aprox.", "A fair comparison · approx.") : L("Antes de comparar · aprox.", "Before comparing · approx."), gx, y + 12, gw);
    const rows = [];
    if (f.key != null) {
      rows.push(
        f.keyOk
          ? { ok: true, s: L("Misma tonalidad", "Same key"), sub: L(`B ${cents(f.key)} de A`, `B ${cents(f.key)} from A`) }
          : { ok: false, s: L(`B ${n1(f.key / 100)} semitonos de A`, `B ${n1(f.key / 100)} semitones from A`), sub: L("repite B en la misma tonalidad", "retake B in the same key") }
      );
    }
    if (f.vol != null) {
      rows.push(
        f.volOk
          ? { ok: true, s: L("Mismo volumen", "Same volume"), sub: L(`B ${dB(f.vol)} (±3 dB)`, `B ${dB(f.vol)} (±3 dB)`) }
          : { ok: false, s: L(`B ${dB(f.vol)} ${f.vol > 0 ? "más fuerte" : "más suave"}`, `B ${dB(f.vol)} ${f.vol > 0 ? "louder" : "softer"}`), sub: L("iguala el volumen o pulsa «= volumen»", "match the volume or press '= level'") }
      );
    }
    if (f.corr != null) {
      rows.push(f.melOk ? { ok: true, s: L("Misma melodía", "Same melody") } : { ok: false, s: L("¿La misma frase?", "The same phrase?"), sub: L("las melodías no coinciden", "the melodies do not match") });
    }
    rows.push({ ok: null, s: L(`Duración: A ${V.fmtSec(f.durA, 1)} · B ${V.fmtSec(f.durB, 1)}`, `Length: A ${V.fmtSec(f.durA, 1)} · B ${V.fmtSec(f.durB, 1)}`) });
    if (f.bright != null) {
      const bw = Math.abs(f.bright) <= 1.5 ? L("brillo parecido", "similar brightness") : f.bright > 0 ? L("B más brillante", "B brighter") : L("B más oscura", "B darker");
      rows.push({ ok: null, s: `${bw} (${dB(f.bright)})`, sub: f.volOk ? null : L("el volumen también cambia el brillo", "volume changes brightness too") });
    }
    let ry = y + 32;
    const rowGap = o.compact ? 16 : 18;
    rows.forEach((r) => {
      if (ry > y + h - 8) return;
      if (r.ok === true) glyph(ctx, "check", gx + 5, ry, C.done, 4.5);
      else if (r.ok === false) glyph(ctx, "tri", gx + 5, ry, C.warn, 4.5);
      else glyph(ctx, "dot", gx + 5, ry, C.muted, 6);
      text(ctx, r.s, gx + 16, ry, { px: 11, weight: 700, color: r.ok === false ? C.warn : C.text, maxW: gw - 16 });
      ry += rowGap - 4;
      if (r.sub && !o.compact && ry <= y + h - 8) {
        text(ctx, r.sub, gx + 16, ry, { px: 10, color: C.muted, maxW: gw - 16 });
        ry += rowGap - 4;
      }
      ry += 4;
    });
    // The spectrum's shape, A against B, when there is room
    const room = y + h - ry - 6;
    if (room >= 70 && m.A && m.A.ltas && m.B && m.B.ltas) ltasChart(ctx, { x: gx, y: ry, w: gw, h: room }, m.A.ltas, m.B.ltas);
  }

  /** Third-octave shape of each take (peak = 0 dB), 2–4 kHz marked. */
  function ltasChart(ctx, box, a, b) {
    const { x, y, w, h } = box;
    const K = V.scenes.resonanceKit;
    const n = K.THIRDS.length;
    const top = y + 14;
    const ch = h - 26;
    const X = (i) => x + (i / (n - 1)) * w;
    const Y = (d) => top + (clamp(-d, 0, 40) / 40) * ch;
    text(ctx, L("Forma del sonido · aprox.", "Shape of the sound · approx."), x, y + 5, { px: 10, color: C.muted, maxW: w * 0.62 });
    const i2 = K.THIRDS.indexOf(2000);
    const i4 = K.THIRDS.indexOf(4000);
    ctx.fillStyle = "rgba(170, 195, 230, 0.08)";
    ctx.fillRect(X(i2), top, X(i4) - X(i2), ch);
    text(ctx, "2–4 kHz", (X(i2) + X(i4)) / 2, top + ch + 7, { px: 9, color: C.faint, align: "center" });
    text(ctx, "125 Hz", x, top + ch + 7, { px: 9, color: C.faint });
    text(ctx, "5 kHz", x + w, top + ch + 7, { px: 9, color: C.faint, align: "right" });
    const line = (arr, color, dash) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.setLineDash(dash || []);
      ctx.beginPath();
      arr.forEach((d, i) => (i ? ctx.lineTo(X(i), Y(d)) : ctx.moveTo(X(i), Y(d))));
      ctx.stroke();
      ctx.setLineDash([]);
    };
    line(a, C.muted, [5, 4]);
    line(b, C.you);
    text(ctx, L("A - - -", "A - - -"), x + w - 70, y + 5, { px: 9, color: C.muted });
    text(ctx, L("B ——", "B ——"), x + w - 30, y + 5, { px: 9, color: C.you });
  }

  V.scenes.abTakes = abTakes;
})(typeof window !== "undefined" ? window : globalThis);
