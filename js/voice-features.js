/**
 * Voice features — what the exercise pictures measure, computed from the
 * practice engine's frames (js/practice-engine.js).
 *
 * The engine answers "is there a voice, and what note": its `voiced` flag and
 * `voiceFreq` deliberately bridge about a second of silence so a sustained
 * note survives a flaky detector. That is right for a hold and wrong for
 * nearly everything else an exercise wants to know — a one-second pause, a
 * note's length, the attack of an onset, a lip trill's flutter. These
 * trackers work from the raw per-frame values instead (`rms`, `sounding`,
 * `rawFreq`, and the frame's own samples in `buf`).
 *
 * Everything is relative to the person and the session: a phone held at arm's
 * length and a headset differ by 20 dB, so levels are read against the
 * learner's own median and silences against the room's own floor.
 *
 * Nothing here draws; js/exercise-viz.js does.
 */
(function (global) {
  "use strict";

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }
  function dbfs(rms) {
    return rms > 1e-7 ? 20 * Math.log10(rms) : -140;
  }
  function percentile(arr, p) {
    if (!arr.length) return null;
    const s = Array.from(arr).sort((a, b) => a - b);
    const i = clamp((s.length - 1) * p, 0, s.length - 1);
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  }
  function median(arr) {
    return percentile(arr, 0.5);
  }
  /** Seconds this frame covers (the engine caps a stalled tab at 50 ms). */
  function frameDt(frame) {
    return clamp(((frame && frame.dtMs) || 16) / 1000, 0, 0.1);
  }

  /** A fixed-size ring of numbers, oldest first when read. */
  class Ring {
    constructor(n) {
      this.n = Math.max(1, n | 0);
      this.a = new Float32Array(this.n);
      this.i = 0;
      this.count = 0;
    }
    push(v) {
      this.a[this.i] = v;
      this.i = (this.i + 1) % this.n;
      if (this.count < this.n) this.count++;
    }
    /** The most recent `k` values, oldest first. */
    last(k = this.count) {
      k = Math.min(k, this.count);
      const out = new Float32Array(k);
      const start = (this.i - k + this.n) % this.n;
      for (let j = 0; j < k; j++) out[j] = this.a[(start + j) % this.n];
      return out;
    }
    get latest() {
      return this.count ? this.a[(this.i - 1 + this.n) % this.n] : null;
    }
    clear() {
      this.i = 0;
      this.count = 0;
    }
  }

  /* —— Fast envelope —— */

  /**
   * Loudness at 400 values a second, from the samples of each frame.
   *
   * A frame's `rms` is one number per screen refresh over a 43 ms window, which
   * cannot see a lip trill (flutter at 15–35 Hz is one cycle per window) or the
   * first 50 ms of an onset. The engine hands over its latest ~43 ms of samples
   * each frame (2048 at 44.1–48 kHz); only the ones that arrived since the
   * previous frame are new, so those are cut into 2.5 ms blocks. The envelope
   * value is the RMS of the last 12.5 ms — at least one pitch period for voices
   * above 80 Hz, so the voice's own waveform does not ripple through it, and
   * short enough to follow 35 Hz.
   */
  class Envelope {
    constructor(opts = {}) {
      this.blockMs = opts.blockMs || 2.5;
      this.smoothBlocks = opts.smoothBlocks || 5;
      this.rate = 1000 / this.blockMs;
      this.ring = new Ring(Math.round((opts.keepSec || 2) * this.rate));
      this._sq = new Ring(this.smoothBlocks);
      this._acc = 0;
      this._accN = 0;
      this._blockN = 0;
      this._primed = false;
      /** Total blocks ever pushed: a clock in envelope samples */
      this.total = 0;
    }
    feed(frame) {
      const buf = frame && frame.buf;
      if (!buf || !buf.length) return 0;
      const sr = frame.sampleRate || 48000;
      this._blockN = Math.max(16, Math.round((sr * this.blockMs) / 1000));
      let n = this._primed
        ? Math.round(((frame.dtMs || 16) / 1000) * sr)
        : Math.round(0.02 * sr);
      this._primed = true;
      n = clamp(n, 0, buf.length);
      let pushed = 0;
      for (let i = buf.length - n; i < buf.length; i++) {
        const x = buf[i];
        this._acc += x * x;
        this._accN++;
        if (this._accN >= this._blockN) {
          this._sq.push(this._acc / this._accN);
          this._acc = 0;
          this._accN = 0;
          const sq = this._sq.last();
          let s = 0;
          for (let j = 0; j < sq.length; j++) s += sq[j];
          this.ring.push(Math.sqrt(s / (sq.length || 1)));
          this.total++;
          pushed++;
        }
      }
      return pushed;
    }
    /** The last `sec` seconds of envelope, oldest first. */
    window(sec) {
      return this.ring.last(Math.round(sec * this.rate));
    }
    reset() {
      this.ring.clear();
      this._sq.clear();
      this._acc = 0;
      this._accN = 0;
      this._primed = false;
      this.total = 0;
    }
  }

  /* —— Lip-trill / bubble flutter —— */

  /**
   * Is the sound fluttering, and how fast? A lip trill chops the sound 15–35
   * times a second; a straw or a hum does not. Two numbers over the last
   * 0.4 s of envelope: the flutter's depth (how far the level swings) and the
   * strength of its repetition between 8 and 45 Hz (autocorrelation). Speech
   * syllables (4–7 Hz) and vibrato (5–7 Hz) sit below that band.
   *
   * States, held for 200 ms before they change so the picture does not flicker:
   *   "trill"     flutter with a pitch (voiced lip trill)
   *   "airTrill"  flutter with no pitch (the unvoiced "brrr")
   *   "tone"      sound with a pitch and no flutter (the trill stopped, or a hum)
   *   "air"       sound with no pitch and no flutter (just air)
   *   "silence"
   */
  class TrillDetector {
    constructor(opts = {}) {
      this.env = opts.envelope || new Envelope();
      this.ownsEnv = !opts.envelope;
      this.minDepth = opts.minDepth != null ? opts.minDepth : 0.22;
      this.minCorr = opts.minCorr != null ? opts.minCorr : 0.25;
      this.holdMs = opts.holdMs || 200;
      this.state = "silence";
      this._cand = "silence";
      this._candMs = 0;
      this._pitchMs = 0; // time since the last frame with a pitch
      this.depth = 0;
      this.corr = 0;
      this.hz = 0;
      this._sinceCalc = 0;
    }
    feed(frame) {
      if (this.ownsEnv) this.env.feed(frame);
      const dtMs = (frame && frame.dtMs) || 16;
      this._pitchMs = frame && frame.rawFreq ? 0 : this._pitchMs + dtMs;
      // The flutter math runs on 0.4 s of envelope; every other frame is plenty
      this._sinceCalc += dtMs;
      if (this._sinceCalc >= 30) {
        this._sinceCalc = 0;
        this._measure();
      }
      const sounding = !!(frame && frame.sounding);
      // A trill chops the pitch detector too: keep "has a pitch" for 150 ms
      const pitched = this._pitchMs < 150;
      const flutter = sounding && this.depth >= this.minDepth && this.corr >= this.minCorr;
      let raw;
      if (!sounding) raw = "silence";
      else if (flutter) raw = pitched ? "trill" : "airTrill";
      else raw = pitched ? "tone" : "air";
      if (raw === this.state) {
        this._cand = raw;
        this._candMs = 0;
      } else if (raw === this._cand) {
        this._candMs += dtMs;
        // Silence arrives fast (the learner stopped); flutter needs to prove itself
        const need = raw === "silence" ? 120 : this.holdMs;
        if (this._candMs >= need) {
          this.state = raw;
          this._candMs = 0;
        }
      } else {
        this._cand = raw;
        this._candMs = dtMs;
      }
      return this.state;
    }
    _measure() {
      const x = this.env.window(0.4);
      const n = x.length;
      if (n < 60) {
        this.depth = 0;
        this.corr = 0;
        return;
      }
      const p95 = percentile(x, 0.95);
      const p5 = percentile(x, 0.05);
      this.depth = p95 + p5 > 1e-6 ? (p95 - p5) / (p95 + p5) : 0;
      let m = 0;
      for (let i = 0; i < n; i++) m += x[i];
      m /= n;
      let v = 0;
      for (let i = 0; i < n; i++) v += (x[i] - m) * (x[i] - m);
      if (v <= 1e-12) {
        this.corr = 0;
        return;
      }
      const rate = this.env.rate;
      const lagMin = Math.floor(rate / 45);
      const lagMax = Math.ceil(rate / 8);
      const rs = [];
      let best = 0;
      for (let L = lagMin; L <= lagMax && L < n - 8; L++) {
        let s = 0;
        for (let i = 0; i + L < n; i++) s += (x[i] - m) * (x[i + L] - m);
        // Normalise by the overlap so long lags are not penalised
        const r = (s / (n - L)) / (v / n);
        rs.push([L, r]);
        if (r > best) best = r;
      }
      // A periodic flutter repeats at 2× and 3× its period too; the rate is
      // the first lag that reaches (nearly) the best repetition, not the last.
      let bestLag = 0;
      for (let k = 0; k < rs.length; k++) {
        const [L, r] = rs[k];
        const prev = k > 0 ? rs[k - 1][1] : -1;
        const next = k + 1 < rs.length ? rs[k + 1][1] : -1;
        if (r >= best * 0.85 && r >= prev && r >= next) {
          bestLag = L;
          break;
        }
      }
      this.corr = best;
      this.hz = bestLag ? rate / bestLag : 0;
    }
    reset() {
      if (this.ownsEnv) this.env.reset();
      this.state = "silence";
      this._cand = "silence";
      this._candMs = 0;
      this.depth = 0;
      this.corr = 0;
    }
  }

  /* —— Speech and silence —— */

  // The room's steadiness test: 0.6 s of learning steps within 4.5 dB. A fan
  // rumbling at 150–250 Hz wanders 3–4 dB over that time; soft speech whose
  // syllables swing only 8 dB slips under a looser or shorter test, and a
  // whisper (no period, so clarity reads it as a fan) is learned as the room
  // and erased. Only a rumble gets a looser one (NOISE_SPREAD_DB).
  const ROOM_STEPS = 18;
  const ROOM_FLAT_DB = 4.5;
  // Once the floor holds a room, a sound that would replace it must hold
  // still twice as long: a stretch of speech misread as a room (a whisper's
  // long phrase) must not throw away the room it has heard
  const NEW_ROOM_STEPS = 36;
  // ... of which the first TAIL_STEPS may be the voice before it fading out:
  // a fan in a pause of just 1.2 s is learned in that pause
  const TAIL_STEPS = 3;
  // ... unless it comes back: a fan switched on under the talk is heard only
  // in the pauses, too short for that. 0.4 s still at the level of an earlier
  // still stretch that a voice then came over is the room, if that stretch
  // held still for 0.8 s (BACK_HELD_STEPS) and stayed under the voice: a
  // fan is under every frame of the talk, so no step falls PAUSE_FLAT_DB
  // under the quietest it held, and neither does any step's high part
  // (`hfRms`). A held "sss" said between words is not under them: the
  // words' dips fall under it, or their high part does (a voiced word's sits
  // about 20 dB under its level, a hiss's at its level). A whisper or an
  // inhale 15 dB or more under the talk is under every word, as a fan is,
  // and a whisper whose syllables swing only 3 dB holds still for its whole
  // phrase.
  const BACK_STEPS = 12;
  const BACK_HELD_STEPS = 24;
  // ... so if either sits high (see LOW_HF), the earlier one's high part
  // must also have held within BACK_HF_STEADY_DB (its 10th to 90th
  // percentiles in dB) over every 0.8 s of it. A white fan's holds within
  // 0.2–0.5 dB: a 43 ms frame holds thousands of its waves. A whisper's
  // follows its syllables, 2 dB and more over 0.8 s when its level swings
  // 3 dB (one that moves only 2 dB can pass: see the class doc); an
  // inhale's follows its swell, by 1–1.5 dB. A rumble's
  // high part is its own level, which wobbles (a frame holds only a few of
  // its waves), so the test is only for a sound that sits high.
  const BACK_HF_STEADY_DB = 1.5;
  // ... and one that sits high (see LOW_HF), as a held "sss" does, must hold
  // still for 5 s: it has no period and is flatter than a fan, and only its
  // length tells it from a hiss that has come to stay. A rumble keeps 1.2 s.
  const HISS_ROOM_STEPS = 150;
  // The engine's `clarity` (how periodic a frame is), as the median of a
  // steady stretch: under NOISY there is no voice in it (a fan, a hiss)
  const NOISY = 0.5;
  // A low rumble's stretch may instead hold its 10th to 90th percentiles
  // within 6 dB: under ~100 Hz a 43 ms frame holds only a few of its waves,
  // so its level swings 1.5–2 dB from one step to the next and its extremes
  // over 0.6 s span 6–7 dB
  const NOISE_SPREAD_DB = 6;
  // Low is the engine's `hfRms` (its first difference) over `rms`, scaled to
  // 48 kHz, under LOW_HF as the median of the stretch: about 2π × the
  // sound's typical frequency ÷ 48 000, so under ~750 Hz. Measured through
  // the engine: a rumble at 100 Hz 0.015, at 250 Hz 0.04; a whisper 0.55, a
  // back-vowel whisper or one through a headset's low-pass 0.15–0.3, a
  // white fan 1.4 (steady enough for the strict test), a voice 0.08–0.1. A
  // whisper's syllables swing as little as a rumble's level and it has no
  // period either, but its sound sits high.
  const LOW_HF = 0.1;
  // A real mic adds its own hiss under a rumble (14–18 dB under it reads
  // 0.18–0.3), and that hiss holds still: the 10th to 90th percentiles of
  // `hfRms` in dB within HF_STEADY_DB (0.2–0.5 dB; a whisper's high part
  // follows its syllables, 5–7 dB). Such a sound gets the loose test too.
  // It sits low when its level wobbles HISS_UNDER_DB more than its high part
  // (the wobble is a rumble's, over the hiss); a held "sss" or a white fan
  // wobbles with its high part and sits high.
  const HF_STEADY_DB = 2;
  const HISS_UNDER_DB = 1.5;
  // A sound the take opened with is the room whatever its clarity (a hum, a
  // fan with a motor's tone) once it has held within OPEN_FLAT_DB for
  // OPEN_STEPS (1 s), counted from when the mic settled: the first frames
  // still hold the silence from before it opened
  const OPEN_SETTLE_SEC = 0.2;
  const OPEN_STEPS = 30;
  const OPEN_FLAT_DB = 3;
  // Until the floor has heard a quiet room, a hum the learner talked over
  // from the start is learned from the pauses in the talk: a stretch of
  // PAUSE_STEPS (0.6 s) within PAUSE_FLAT_DB at the quietest level the take
  // has heard, after a voice, the third time it comes at the same level (or
  // the first, at the level the take opened with for OPEN_MIN_STEPS before
  // the first word)
  const PAUSE_STEPS = 18;
  const PAUSE_FLAT_DB = 3;
  const OPEN_MIN_STEPS = 3;
  // ... and that sits less than SHUT_DB over the quietest level the engine's
  // gate has shut at: in a quiet room a stop or a breath shuts it far under
  // any filler, and a voiced stop's murmur 2.5 dB under them; a hum near the
  // gate shuts it only on its own dips
  const SHUT_DB = 2;

  /* —— The room's spectrum (frames that carry their samples) —— */

  // Level, `hfRms` and `clarity` cannot tell a soft, flat whisper from a fan
  // (both aperiodic, as still, and as high), nor an "mmm" said at one level
  // three times from a hum, nor a white fan from a held "sss": every rule on
  // them moved those edges and closed none. Where a frame brings its samples
  // (`buf`, as the engine sends it), each learning step also takes the
  // room's spectrum (a Hann window over the frame: SPEC_EDGES' bands as the
  // mean power per FFT bin, so white noise reads the same in all, and the
  // bins under LINE_MAX_HZ, where a hum's lines are), and the floor uses
  // three differences that are physical, not tuned to one sound:
  // - A room sound adds to the voice: a fan is under every frame of the talk
  //   in every band it fills, and a hum's lines go on through the talk. A
  //   sound the person makes stops while they voice (one throat cannot
  //   whisper, inhale or hum and talk at once): where a voice is weak (a
  //   whisper's high band; between the harmonics of a moving pitch, at a
  //   filler's lines) the talk's quietest frames fall far under it.
  // - A whisper's spectrum moves with its formants; a fan's holds its shape.
  // - Electronic hiss and a white fan are flat to the top of the spectrum;
  //   every sound a person makes is band-limited (breath and a whisper fade
  //   by 4–5 kHz, an /s/ peaks near 7 kHz and is 20 dB down under 3 kHz).
  // A frame without samples (the node sim) gets the rules above unchanged.
  const SPEC_EDGES = [100, 200, 350, 550, 800, 1150, 1600, 2200, 3000, 4200, 6000, 8500, 12500];
  const LINE_MAX_HZ = 4000;
  // A stretch that comes back (`_cameBack`) is the room only if it was under
  // the voice that came over it: in each band it fills (within BAND_OCC_DB of
  // its strongest and BAND_BED_DB over the quiet room's), the 10th percentile
  // of its last 0.8 s sits at most PERSIST_DB over that band's 10th
  // percentile in the voice's first 0.8 s (PERSIST_STEPS, at least
  // PERSIST_MIN_STEPS of it), and its shape held still (SHAPE_DB: the spread
  // over its steps of each band from 550 Hz less the step's mean band,
  // averaged over the bands: shapeSpread). Measured through the engine (the
  // shape there as an sd): rooms switched on mid-talk −17.6 to 1.8 dB (an
  // oscillating fan ±4 dB the highest; a white fan whose level wobbles ±4 dB
  // 0.5), whispers 0.9 to 39 (the probe's flat whisper 15 to 29), inhales 9
  // to 27, hisses 19 to 37; shape: rooms 0.9–1.4, whispers with moving
  // formants 2.8–7.3. Both come on top of BACK_HF_STEADY_DB (the high part
  // held still), which reads only how still the high part's level is (a flat
  // whisper holds as still as a fan), and which only a white stretch (see
  // WHITE_DB) may fail: a white fan whose level wobbles moves its high part
  // as much as a whisper, and no voice is white. So with samples the floor
  // learns less than without, never more, but for a white fan.
  const PERSIST_STEPS = 24;
  const PERSIST_MIN_STEPS = 9;
  const PERSIST_DB = 3;
  const SHAPE_DB = 2;
  const BAND_OCC_DB = 25;
  const BAND_BED_DB = 6;
  // A hum learned from pauses (`_pauseRoom`, three stretches at one level)
  // must also go on under the talk between the last two: at its lines (bins
  // standing LINE_PEAK_DB over their neighbours, the strongest LINE_N within
  // LINE_RANGE_DB), the stretch's median minus the talk's 10th percentile
  // at the same bin, the median over lines, at most LINE_STOP_DB. A hum's
  // line is in every frame of the talk (a voice harmonic on it at a random
  // phase can cancel it in a few); an "mmm" stops, and the talk's harmonics
  // move with its intonation, so at the filler's lines the talk falls
  // between them.
  const LINE_PEAK_DB = 10;
  const LINE_N = 12;
  const LINE_RANGE_DB = 30;
  const LINE_STOP_DB = 6;
  const LINE_KEEP_STEPS = 150;
  // A new room whose spectrum is flat from 350 Hz to the top band (the mean
  // power of each band over 0.6 s within WHITE_DB) is learned after 0.6 s
  // whether it sits high or not, but only while no voice has been heard (no
  // step with a period over the floor's margin since the Vad began): a white
  // fan switched on in the silent lead-in. White rooms measured 0.5–1.3,
  // pink noise 12, a held "sss" more (its bands under 3 kHz sit 20–40 dB
  // under its peak), breath and whispers 8 and more. An /f/ or a /θ/ is
  // noise made at the lips or the teeth with nothing in front to shape it,
  // and some are as flat as a fan: recorded at the start of words ("three",
  // "four", "five", 30 speakers, 48 kHz) /f/ read 3.7–20 dB, median 11, and
  // /θ/ 4.3–34, median 13, one in ten of them 6 or less. A held one was
  // learned as the room 0.6 s in and its talk lost, so once a voice has been
  // heard a white fan switched on is learned as without samples: when it
  // comes back in the next pause (`_cameBack`), or once it has held 1.2 s
  // (5 s if it sits high).
  const WHITE_DB = 4;
  const WHITE_FROM_BAND = 2;
  // A still sound whose spectrum, room and all, has nothing under 1.6 kHz
  // (the power of the bands from 100 Hz to 1.6 kHz SIBILANT_DB or more under
  // that from 3 to 8.5 kHz, in most of its steps: the median over them, so
  // a step or two of the word before it cannot fill its low bands) is not
  // learned as a new room: not after 5 s high (HISS_ROOM_STEPS), not as the
  // sound the take opened with, not as the first room the floor hears, and
  // from the pauses (`_pauseRoom`) only if its bands went on under the talk,
  // as a room's do. That is an "sss" or a "shh" (−22 dB or lower through
  // the engine; a person can hold one for 20 s and more), never a fan or a
  // rumble (white noise −5.6, pink +4, every room measured −5.9 or higher);
  // a hiss through a steep low cut reads as one. Over a room that fills the
  // low bands it reads higher and the 5 s rule stays.
  const SIBILANT_DB = -15;
  const SIB_LOW = [0, 6];
  const SIB_HIGH = [8, 11];

  const specPlans = {};
  function specPlan(n) {
    if (specPlans[n]) return specPlans[n];
    const bits = Math.round(Math.log2(n));
    const rev = new Uint32Array(n);
    for (let i = 0; i < n; i++) {
      let r = 0;
      for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
      rev[i] = r;
    }
    const cos = new Float64Array(n / 2);
    const sin = new Float64Array(n / 2);
    for (let i = 0; i < n / 2; i++) {
      cos[i] = Math.cos((2 * Math.PI * i) / n);
      sin[i] = -Math.sin((2 * Math.PI * i) / n);
    }
    const win = new Float64Array(n);
    for (let i = 0; i < n; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
    specPlans[n] = { rev, cos, sin, win, re: new Float64Array(n), im: new Float64Array(n) };
    return specPlans[n];
  }
  const LOG10 = Math.log(10);
  const pdb = (p) => (10 * Math.log(p > 1e-30 ? p : 1e-30)) / LOG10;

  /**
   * One learning step's spectrum from a frame's samples (the last power of
   * two of them): { bands (dB per bin, NaN above Nyquist), lines (dB of
   * each bin under LINE_MAX_HZ), hz (Hz per bin) }, or null. `spare` is an
   * old `lines` no longer kept: it is written over when it has the length.
   */
  function spectrumOf(buf, sr, spare) {
    let n = 1;
    while (n * 2 <= buf.length && n < 16384) n *= 2;
    if (n < 512) return null;
    const p = specPlan(n);
    const { re, im, win, rev, cos, sin } = p;
    const off = buf.length - n;
    for (let i = 0; i < n; i++) {
      const j = rev[i];
      re[j] = buf[off + i] * win[i];
      im[j] = 0;
    }
    for (let size = 2; size <= n; size <<= 1) {
      const half = size >> 1;
      const step = n / size;
      for (let i = 0; i < n; i += size) {
        for (let k = 0; k < half; k++) {
          const wr = cos[k * step];
          const wi = sin[k * step];
          const a = i + k;
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
    const hz = sr / n;
    const half = n / 2;
    const bands = new Float32Array(SPEC_EDGES.length - 1);
    for (let b = 0; b < bands.length; b++) {
      const k0 = Math.max(1, Math.round(SPEC_EDGES[b] / hz));
      const k1 = Math.round(SPEC_EDGES[b + 1] / hz);
      if (k1 > half || k1 <= k0) {
        bands[b] = NaN;
        continue;
      }
      let s = 0;
      for (let k = k0; k < k1; k++) s += re[k] * re[k] + im[k] * im[k];
      bands[b] = pdb(s / (k1 - k0));
    }
    const nl = Math.min(half, Math.round(LINE_MAX_HZ / hz) + 1);
    const lines = spare && spare.length === nl ? spare : new Float32Array(nl);
    for (let k = 0; k < nl; k++) lines[k] = pdb(re[k] * re[k] + im[k] * im[k]);
    return { bands, lines, hz };
  }
  /**
   * Is a list of band vectors white: the mean power of each band from
   * 350 Hz (WHITE_FROM_BAND) to the top within WHITE_DB, the 6–8.5 kHz band
   * there (a sample rate of 17 kHz or more)? Returns the spread (dB), or
   * Infinity when it cannot tell.
   */
  function whiteSpread(list) {
    const nb = SPEC_EDGES.length - 1;
    let lo = Infinity;
    let hi = -Infinity;
    let top = -1;
    for (let k = WHITE_FROM_BAND; k < nb; k++) {
      if (Number.isNaN(list[0][k])) continue;
      let s = 0;
      for (const x of list) s += Math.pow(10, x[k] / 10);
      const d = pdb(s / list.length);
      lo = Math.min(lo, d);
      hi = Math.max(hi, d);
      top = k;
    }
    return top >= nb - 2 ? hi - lo : Infinity;
  }
  /** Per band, the p-th percentile over a list of band vectors (NaN where any is NaN). */
  function bandPct(list, p) {
    const nb = SPEC_EDGES.length - 1;
    const out = new Float32Array(nb);
    const v = new Float64Array(list.length);
    for (let b = 0; b < nb; b++) {
      for (let i = 0; i < list.length; i++) v[i] = list[i][b];
      out[b] = percentile(v, p);
    }
    return out;
  }
  /**
   * How far a stretch's spectral shape moves (dB): per band from 550 Hz
   * (within BAND_OCC_DB of the strongest and BAND_BED_DB over the quiet
   * room's `bed`, where it is known: a band the room's own hiss shares
   * moves with the sound's level), the spread over steps of the band less
   * the step's mean over those bands (its interquartile range / 1.349, the
   * sd of a normal spread, but blind to a step or two of a word's tail at
   * the stretch's edge), averaged. Steady noise ~1 (bands of few FFT bins
   * jitter most), a whisper's moving formants 3 and more.
   */
  function shapeSpread(list, bed) {
    const med = bandPct(list, 0.5);
    let top = -Infinity;
    for (let b = 3; b < med.length; b++) if (med[b] > top) top = med[b];
    const act = [];
    for (let b = 3; b < med.length; b++) if (med[b] >= top - BAND_OCC_DB && (!bed || med[b] >= bed[b] + BAND_BED_DB)) act.push(b);
    if (act.length < 2) return 0;
    const sh = list.map((x) => {
      let m = 0;
      act.forEach((b) => (m += x[b]));
      m /= act.length;
      return act.map((b) => x[b] - m);
    });
    let s = 0;
    const col = new Float64Array(sh.length);
    for (let j = 0; j < act.length; j++) {
      sh.forEach((r, i) => (col[i] = r[j]));
      s += (percentile(col, 0.75) - percentile(col, 0.25)) / 1.349;
    }
    return s / act.length;
  }

  /**
   * Speech/silence with the room's own floor, a short hangover, and pauses
   * dated from when the sound actually stopped.
   *
   * - Floor: the 10th percentile of the last 6 s of quiet level, learned 30
   *   times a second. Quiet is the engine's gate closed for longer than a
   *   consonant (`hangMs`; a word's own dips must not teach it) or a level
   *   within `marginDb` of the floor. Speech swings 10 dB and more between
   *   syllables, so a learner who talks from the first frame never becomes
   *   the floor.
   * - A room loud enough to open the gate (a fan, or any room's hiss at
   *   sensitivity 9–10) is learned from its steadiness instead: 0.6 s that
   *   holds still with no period in it (the engine's `clarity`, which works
   *   at any level) is the room. Still is within 4.5 dB or, for a sound
   *   that sits low (the engine's `hfRms`) or whose high part holds still,
   *   6 dB from its 10th to its 90th percentile: a fan's rumble under
   *   ~100 Hz wobbles 1.5–2 dB from frame to frame over a mic's steady hiss,
   *   while a whisper, as flat and as aperiodic, sits high, its high part
   *   follows its syllables, and it gets the strict test. The floor starts
   *   over from it, speech it was read as until then is taken back, and a
   *   pause it hid is dated from when the voice stopped. Once the floor
   *   holds a room, a new one must hold still for 1.2 s, or for 5 s if it
   *   sits high (a whisper, a held "sss"), unless it comes back after a
   *   voice was heard over it: a fan switched on under the talk, held still
   *   in one pause and then in the next, is the room by 0.4 s into that
   *   one, and the pause before it is told late (or, if the fan came on in
   *   a pause, runs on under it). A hiss said between words with no silence
   *   around it does not come back: the words fall under it, or their high
   *   part does, where they would sit over a fan.
   *   A stretch that sits high comes back only if its high part held
   *   within 1.5 dB over 0.8 s: a soft whisper whose level moves only about
   *   2 dB (its high part 1.4–1.7 dB) passes that. A fan that sits high and
   *   whose high part wobbles as much (no broadband noise does over a 43 ms
   *   frame) is learned only once it has held still for 5 s; the pauses
   *   until then read as speech.
   * - Where a frame brings its samples (`buf`), the floor also reads the
   *   room's spectrum (12 bands from 100 Hz to 12.5 kHz, and the bins under
   *   4 kHz) and uses three things a level cannot show: a room sound adds
   *   to the voice, while a sound the person makes stops while they voice;
   *   a whisper's shape moves with its formants; no voiced sound is white.
   *   A stretch comes back as the room only if, besides the above, in every
   *   band it fills the talk's quietest frames over it stayed within 3 dB
   *   of its own (a whisper, an inhale or an "sss" between phrases is gone
   *   under the talk where the voice is weak) and its shape held still, so
   *   a soft, flat whisper alternating with voice is talk however little
   *   its level moves; a white stretch may fail the high-part test (a white
   *   fan whose level wobbles). Before any voice has been heard, a new room
   *   flat from 350 Hz to the top of the spectrum (a white fan, a hiss) is
   *   the room after 0.6 s however high it sits, so one switched on in a
   *   silent lead-in is the room before the first word. After one, a white
   *   sound is learned as any other: a held /f/ or /θ/ is as flat as a fan
   *   (recorded ones read 3.7 dB and more, a white fan 0.5–1.3), and one
   *   held between phrases or right after words is talk. A still sound with
   *   nothing under 1.6 kHz in most of its steps (an "sss", a "shh", held
   *   for any length) is not the room: not after 5 s, not as the sound the
   *   take opened with, not as the first room, and from the pauses before
   *   the floor has heard a quiet room only if its bands went on under the
   *   talk, as a room's do and an "sss"'s do not, so an "sss" between
   *   phrases is talk in talk from Start too. Three "mmm"s at one level are
   *   not a hum (below). So with samples the floor learns less than
   *   without, never more, but for a white sound before the first voice
   *   (and the lead-in of a hiss it learns from the pauses, below). Without
   *   them (the node sim) the rules above alone decide: the soft flat
   *   whisper can pass for a fan, a white fan switched on in a silent
   *   lead-in reads as speech until the first word, an "sss" held 5 s is
   *   learned as the room, and three "mmm"s at one level in talk from Start
   *   are a hum. The level sim can show none of the spectral rules.
   *   What they need: `buf` must still hold the frame's own samples when
   *   `feed` is called (the engine writes the next frame over it, so a
   *   caller that keeps frames and feeds them later hands the floor
   *   another frame's sound). The engine asks for a mic with no processing:
   *   automatic gain or noise suppression (`processedInput`) pushes a fan
   *   down under the talk, so one switched on mid-talk would fail the
   *   band test and read as speech until it held 1.2 s in one pause. They
   *   cost 0.05–0.1 ms a frame on average (one FFT per learning step, 2048
   *   or 4096 samples), the hum's line test 2–3 ms in the step it runs, and
   *   the first FFT plan about 13 ms, once.
   *   Known limits: an /f/ or /θ/ held 0.6 s or more in a silent lead-in,
   *   before any voice, is learned as a white fan and taken back (its talk
   *   lost; the floor is the quiet room again once it ends); a hiss with
   *   nothing under 2 kHz (a mic's steep low cut) there from Start reads as
   *   an "sss" does and is learned only at the first pause after the first
   *   word, where it has gone on under the talk: the speech read from Start
   *   is then cut to begin at the first word (`segments`, talkSec), but
   *   until that pause it reads as talk however long the lead-in, and a
   *   caller's clock opened at onSpeech still spans it; a fan that is not
   *   white, switched on in a silent lead-in, still waits 1.2 s, or 5 s if
   *   it sits high; once a voice has been heard a white fan switched on in
   *   a pause waits to come back in the next one, as without samples; a
   *   held "sss" over a room that fills the low bands reads like a hiss and
   *   still meets the 5 s rule, as does a held /f/ or /θ/ (it fills them);
   *   and a whisper over a fan within the margin is silence where it dips
   *   (the margin is on the level, not per band).
   * - An audible inhale is talk. It is as aperiodic, as still and sits as
   *   high as a whispered syllable or a short "sss", and nothing in its
   *   level tells them apart, so a breath loud enough to open the gate (a
   *   close mic) reads as speech, as it always has: between two phrases with
   *   no silence around it, the phrases run on through it; taken inside a
   *   silence, it splits that silence in two. A quieter breath is silence.
   *   One held still for 0.8 s or more, its swell barely moving its high
   *   part, between two phrases that never fall under it (no stop, no gap)
   *   can still pass for a fan switched on in a pause, and the second such
   *   breath be learned as the room.
   * - A steady sound with a period is a voice (a sung note, a soft held
   *   vowel, an "mmm"), unless the take opened with it and heard nothing
   *   else for a second: a hum in the room, learned the same way. Before the
   *   floor has heard any quiet room, a hum the learner talked over from the
   *   first frame is learned from the pauses instead: 0.6 s at the quietest
   *   level heard that comes back in two more pauses (or that the take
   *   opened with), and, where frames bring samples, whose spectral lines
   *   went on under the talk between the last two: a hum's lines are in
   *   every frame of the talk, an "mmm" stops and the talk's harmonics move
   *   off its lines, so three "mmm"s at one level in talk from Start are
   *   not a hum. A still sound with nothing under 1.6 kHz learned this way
   *   must have gone on under that talk in every band it fills (a hiss
   *   through a steep low cut does, an "sss" does not), and if the take
   *   opened with it, the speech it was read as from Start is cut to begin
   *   where the first voice came. The Space assist never teaches the floor.
   * - Sound must clear the floor by `marginDb` and also clear the engine's
   *   own sensitivity gate (`frame.sounding`), so a fan does not read as
   *   speech and a quiet room does not turn a breath into a word.
   * - A pause starts only after `hangMs` of quiet (stop consonants leave
   *   100–250 ms gaps inside words) but is dated from the first quiet frame,
   *   so a 1.2 s pause measures 1.2 s.
   * Callbacks: onSpeech(t), onPause(tStart), onPauseEnd(tStart, len), and
   * onTakeBack(t) when the speech onSpeech(t) opened turns out to have been
   * the room: it is gone from `segments`, and the Vad is back to idle or to
   * the pause it interrupted (whose end is not reported a second time). A
   * pause held by a hum the floor learned only later is cut out of the
   * speech then, and its onPauseEnd comes late (no onPause before it):
   * `segments`, pauses() and talkSec have it, but a breath, phrase or talk
   * clock a caller opened at onSpeech still spans it (a hum room, talked
   * over from Start). A pause a high fan came on in (a white fan) is told
   * when it came on, at the length it had then; once the fan comes back in
   * the next pause, `segments` runs that pause on to the next word, and a
   * caller's clock opened when the fan came on still spans it. Speech read
   * from Start over a hiss the take opened with, learned from the pauses,
   * is cut to begin at the first word (no onTakeBack: the speech is still
   * there), and a caller's clock opened at Start still spans the lead-in.
   */
  class Vad {
    constructor(opts = {}) {
      this.marginDb = opts.marginDb != null ? opts.marginDb : 8;
      this.hangMs = opts.hangMs != null ? opts.hangMs : 220;
      this.onsetMs = opts.onsetMs != null ? opts.onsetMs : 40;
      this.minPauseSec = opts.minPauseSec != null ? opts.minPauseSec : 0.25;
      this.cb = opts;
      this._floorRing = new Ring(Math.round(6 * 30));
      // The last 1.2 s of learning steps: level, time, clarity, how high
      // the sound sits (−1 = none) and the level of its high part
      this._recentRing = new Ring(NEW_ROOM_STEPS);
      this._recentT = new Ring(NEW_ROOM_STEPS);
      this._recentClarity = new Ring(NEW_ROOM_STEPS);
      this._recentHf = new Ring(NEW_ROOM_STEPS);
      this._recentHfDb = new Ring(NEW_ROOM_STEPS);
      this._floorAcc = 0;
      this.floorDb = -70;
      this.reset();
    }
    reset() {
      this.t = 0;
      this.state = "idle"; // idle (nothing said yet) · speech · pause
      this.segments = []; // { kind: "speech"|"pause", start, end }
      this._quietSince = null;
      this._loudSince = null;
      this._closedSince = null;
      // The loudest level of the open speech and of the loud run that may
      // open it: speech that never rose above the room it turned out to be
      // was that room
      this._runPeakDb = -140;
      this._peakDb = -140;
      this._pauseTold = false;
      // The take's quietest and loudest learning steps since the mic
      // settled, and how many it has held still for (−1: it moved)
      this._openLoDb = Infinity;
      this._openHiDb = -Infinity;
      this._openSteps = 0;
      // The quietest learning step since the mic settled, and the steady
      // stretches heard at about that level while no quiet room had been:
      // { lvl, start, end } (start null: the take opened with it; then sib:
      // it had nothing under 1.6 kHz, see SIBILANT_DB)
      this._lowDb = Infinity;
      this._hums = [];
      this._late = null;
      this._shutDb = Infinity;
      // Once the floor holds a room: the last still stretch heard since it
      // was quiet ({ lvl, held, lo, hfLo, hfMove, high, start, end }: how
      // many steps it held still, the quietest it held and its high part's,
      // how far its high part moved over 0.8 s, whether it sat high, and
      // when a voice came over it), and for how many steps in a row the
      // sound has held still
      this._stretch = null;
      this._stillRun = 0;
      // Whether a voice (a learning step with a period over the floor's
      // margin) has been heard: a white sound is learned only before one
      this._voiced = false;
      // The spectra of the last learning steps (null: the frame had no
      // samples), the bins under LINE_MAX_HZ and the bands of the last 5 s
      // ({ t, lines, hz, bands }), and the bands of the quiet steps the floor
      // learned from
      this._recentSpec = [];
      this._lineHist = [];
      this._quietBands = [];
      this.pauseStart = null;
      this.speechStart = null;
      this.levelDb = -140;
      this._floorRing.clear();
      this._recentRing.clear();
      this._recentT.clear();
      this._recentClarity.clear();
      this._recentHf.clear();
      this._recentHfDb.clear();
      this._floorAcc = 0;
    }
    get pauseLen() {
      return this.state === "pause" && this.pauseStart != null ? this.t - this.pauseStart : 0;
    }
    get runLen() {
      return this.state === "speech" && this.speechStart != null ? this.t - this.speechStart : 0;
    }
    /** Total seconds of speech so far (pauses excluded). */
    get talkSec() {
      let s = 0;
      this.segments.forEach((g) => {
        if (g.kind === "speech") s += (g.end != null ? g.end : this.t) - g.start;
      });
      return s;
    }
    feed(frame) {
      const dt = frameDt(frame);
      this.t += dt;
      const db = dbfs(frame.rms || 0);
      this.levelDb = db;
      if (frame.sounding) this._closedSince = null;
      else if (this._closedSince == null) this._closedSince = this.t - dt;
      // A room that holds the gate open never lets it close: a stop
      // consonant or a breath in a quiet room does, for a few frames
      if (this._closedSince != null && this.t >= OPEN_SETTLE_SEC && (this.t - this._closedSince) * 1000 >= this.onsetMs) {
        this._shutDb = Math.min(this._shutDb, db);
      }
      // The floor learns 30 times a second at any frame rate: the remainder is
      // kept (dropping it learned ~24 times a second at 60 fps and ~20 at 30),
      // capped so a stalled tab does not learn a burst of copies of one frame
      this._floorAcc += dt;
      if (this._floorAcc >= 1 / 30) {
        this._floorAcc = Math.min(this._floorAcc - 1 / 30, 1 / 30);
        if (frame.manualSound) {
          // The Space assist fakes a flat level: never the room, and not part
          // of any steady stretch either
          this._recentRing.clear();
          this._recentT.clear();
          this._recentClarity.clear();
          this._recentHf.clear();
          this._recentHfDb.clear();
          this._recentSpec.length = 0;
          this._lineHist.length = 0;
        } else {
          this._learnFloor(frame, db);
        }
      }
      const loud = !!frame.sounding && db > this.floorDb + this.marginDb;
      if (loud) {
        this._quietSince = null;
        if (this._loudSince == null) this._loudSince = this.t - dt;
        if (this.state === "speech") this._peakDb = Math.max(this._peakDb, db);
        else this._runPeakDb = Math.max(this._runPeakDb, db);
        if (this.state !== "speech" && (this.t - this._loudSince) * 1000 >= this.onsetMs) {
          const start = this._loudSince;
          if (this.state === "pause" && this.pauseStart != null) {
            const len = start - this.pauseStart;
            const seg = this.segments[this.segments.length - 1];
            if (seg && seg.kind === "pause") seg.end = start;
            if (this.cb.onPauseEnd && !this._pauseTold) this.cb.onPauseEnd(this.pauseStart, len);
          }
          this._pauseTold = false;
          this.state = "speech";
          this.speechStart = start;
          this.pauseStart = null;
          this._peakDb = this._runPeakDb;
          this.segments.push({ kind: "speech", start, end: null });
          if (this.cb.onSpeech) this.cb.onSpeech(start);
        }
      } else {
        this._loudSince = null;
        this._runPeakDb = -140;
        if (this._quietSince == null) this._quietSince = this.t - dt;
        if (
          this.state === "speech" &&
          (this.t - this._quietSince) * 1000 >= this.hangMs
        ) {
          const start = this._quietSince;
          const seg = this.segments[this.segments.length - 1];
          if (seg && seg.kind === "speech") seg.end = start;
          this.state = "pause";
          this.pauseStart = start;
          this.segments.push({ kind: "pause", start, end: null });
          if (this.cb.onPause) this.cb.onPause(start);
        }
      }
      if (this.segments.length > 600) this.segments.splice(0, this.segments.length - 600);
      return this.state;
    }
    /** One learning step: does this frame's level belong to the room? */
    _learnFloor(frame, db) {
      this._recentRing.push(db);
      this._recentT.push(this.t);
      this._recentClarity.push(frame.clarity != null ? frame.clarity : -1);
      this._recentHf.push(frame.hfRms != null && frame.rms > 0 ? (frame.hfRms / frame.rms) * ((frame.sampleRate || 48000) / 48000) : -1);
      const hfDb = frame.hfRms > 0 ? dbfs(frame.hfRms) : -140;
      this._recentHfDb.push(hfDb);
      // The frame's samples are valid only now: take their spectrum. The
      // bins of the step that leaves the last 5 s are written over (each
      // step's bands are kept as they are: the quiet room's, a stretch's and
      // the last 5 s's hold on to them)
      const gone = this._lineHist.length >= LINE_KEEP_STEPS ? this._lineHist.shift() : null;
      const sp = frame.buf && frame.buf.length ? spectrumOf(frame.buf, frame.sampleRate || 48000, gone && gone.lines) : null;
      this._recentSpec.push(sp);
      if (this._recentSpec.length > NEW_ROOM_STEPS) this._recentSpec.shift();
      if (sp) {
        const line = gone || {};
        line.t = this.t;
        line.lines = sp.lines;
        line.hz = sp.hz;
        line.bands = sp.bands;
        this._lineHist.push(line);
      } else this._lineHist.length = 0;
      if (this.t >= OPEN_SETTLE_SEC) {
        this._lowDb = Math.min(this._lowDb, db);
        if (this._openSteps >= 0) {
          const lo = Math.min(this._openLoDb, db);
          const hi = Math.max(this._openHiDb, db);
          if (hi - lo < OPEN_FLAT_DB) {
            this._openLoDb = lo;
            this._openHiDb = hi;
            this._openSteps++;
          } else {
            // What the take opened with before the first word: a pause back
            // at its level is the same room (its steps are the ones before
            // this one)
            if (this._openSteps >= OPEN_MIN_STEPS) {
              const sib = this._sibilant(Math.min(this._openSteps, NEW_ROOM_STEPS - 1), 1);
              this._hums.push({ lvl: (this._openLoDb + this._openHiDb) / 2, start: null, end: this.t, sib });
            }
            this._openSteps = -1;
          }
        }
      }
      // A stretch ends when a voice comes back over it (3 dB short of the
      // margin: a voice that clears a stretch a little quieter than this one)
      const h = this._hums[this._hums.length - 1];
      if (h && h.end == null && db > h.lvl + this.marginDb - PAUSE_FLAT_DB) h.end = this.t - 1 / 60;
      // A still stretch ends when a voice (a sound with a period) clears it,
      // and is gone once a step, or its high part, falls under the quietest
      // it held: the voice came instead of it (an "sss" between words), not
      // over it (a fan)
      const st = this._stretch;
      if (st && st.end == null && db > st.lvl + this.marginDb && frame.clarity >= NOISY) {
        st.end = this.t - 1 / 60;
        this._freeze(st);
      }
      // The voice that came over it, band by band
      if (st && st.end != null && st.vb && st.vb.length < PERSIST_STEPS) st.vb.push({ t: this.t, b: sp ? sp.bands : null });
      if (st && st.end != null && (db < st.lo - PAUSE_FLAT_DB || hfDb < st.hfLo - PAUSE_FLAT_DB)) this._stretch = null;
      // A consonant closes the gate for 40–100 ms inside a word: a soft
      // speaker's dips would become the floor and their weaker syllables
      // read as pauses. Only a gate still closed after the hangover is quiet.
      const closed = this._closedSince != null && (this.t - this._closedSince) * 1000 >= this.hangMs;
      if (closed || db <= this.floorDb + this.marginDb) {
        this._stretch = null;
        this._stillRun = 0;
        this._floorRing.push(db);
        if (sp) {
          this._quietBands.push(sp.bands);
          if (this._quietBands.length > this._floorRing.n) this._quietBands.shift();
        }
        if (this._floorRing.count >= 15) {
          this.floorDb = Math.max(-90, percentile(this._floorRing.last(), 0.1));
        }
        return;
      }
      if (frame.clarity >= NOISY) this._voiced = true;
      const steps = this._steadyRoom();
      if (!steps) return;
      // Steady sound above the floor is a new room: a fan heard before the
      // floor knew it, or one switched on. The floor starts over from it, so
      // it stops reading as speech now rather than after 6 s of it.
      const before = this.floorDb;
      this._floorRing.clear();
      this._recentRing.last(steps).forEach((v) => this._floorRing.push(v));
      this._quietBands = this._recentSpec.slice(-steps).filter((x) => x).map((x) => x.bands);
      this.floorDb = Math.max(-90, percentile(this._floorRing.last(), 0.1));
      this._hums = [];
      this._stretch = null;
      this._stillRun = 0;
      if (this._late) this._heardLate(this._late);
      this._late = null;
      if (this.state === "speech" && this.floorDb > before) this._roomFound();
    }
    /**
     * How many of the last learning steps are a room the floor should start
     * over from (0: none). A fan or a hiss is steady with no period, and can
     * come on at any time. A sound with a period (a sung note, a soft held
     * vowel, an "mmm") is a voice, unless it is a hum in the room: the take
     * opened with it and heard nothing else, or, before any quiet room was
     * heard, it fills a pause in the talk (_pauseRoom).
     */
    _steadyRoom() {
      // Until the floor holds a room, it starts from the first one heard
      const known = this._floorRing.count >= 15;
      if (!known && this._openSteps >= OPEN_STEPS) return this._sibilant(OPEN_STEPS) ? 0 : OPEN_STEPS;
      if (!known && this._pauseRoom()) return PAUSE_STEPS;
      if (!known) return this._still(ROOM_STEPS) && !this._sibilant(ROOM_STEPS) ? ROOM_STEPS : 0;
      const b = this._still(BACK_STEPS);
      if (!b || b.lvl <= this.floorDb + this.marginDb || this._voiceIn(BACK_STEPS, b.lvl)) {
        this._stillRun = 0;
        return 0;
      }
      this._stillRun++;
      if (this._cameBack(b)) return ROOM_STEPS;
      // Flat to the top of the spectrum, before any voice: a white fan or
      // hiss switched on in the lead-in (a held /f/ is as flat: see WHITE_DB)
      const w = !this._voiced && this._stillRun >= ROOM_STEPS - BACK_STEPS ? this._still(ROOM_STEPS) : null;
      if (w && !this._voiceIn(ROOM_STEPS, w.lvl) && this._white(ROOM_STEPS)) return ROOM_STEPS;
      // 1.2 s still, but for the last step or two of the voice before it (a
      // pause of just 1.2 s), and how high the sound sits judged after them
      if (!this._still(NEW_ROOM_STEPS)) return 0;
      const l = this._still(NEW_ROOM_STEPS - TAIL_STEPS);
      if (!l || this._voiceIn(NEW_ROOM_STEPS - TAIL_STEPS, l.lvl)) return 0;
      if (!l.high) return NEW_ROOM_STEPS;
      if (this._sibilant(NEW_ROOM_STEPS - TAIL_STEPS)) return 0;
      return this._stillRun >= HISS_ROOM_STEPS - BACK_STEPS ? NEW_ROOM_STEPS : 0;
    }
    /**
     * Whether most of the `steps` learning steps before the last `skip` have
     * nothing under 1.6 kHz (see SIBILANT_DB): the median of each step's
     * ratio, so a step or two of the word before cannot fill its low bands.
     */
    _sibilant(steps, skip = 0) {
      const n = this._recentSpec.length - skip;
      const sp = this._recentSpec.slice(Math.max(0, n - steps), n);
      if (sp.length < steps || sp.some((x) => !x)) return false;
      const pow = (x, b0, b1) => {
        let s = 0;
        for (let k = b0; k < b1; k++) s += Math.pow(10, x.bands[k] / 10) * (SPEC_EDGES[k + 1] - SPEC_EDGES[k]);
        return s;
      };
      const r = new Float64Array(sp.length);
      for (let i = 0; i < sp.length; i++) {
        const lo = pow(sp[i], SIB_LOW[0], SIB_LOW[1]);
        const hi = pow(sp[i], SIB_HIGH[0], SIB_HIGH[1]);
        // no band up to 8.5 kHz at this sample rate: no verdict
        if (!(lo >= 0) || !(hi > 0)) return false;
        r[i] = pdb(lo) - pdb(hi);
      }
      return percentile(r, 0.5) < SIBILANT_DB;
    }
    /**
     * Whether one of the last `steps` learning steps is a voice over the
     * still sound at `lvl` (`marginDb` over it). _still's percentiles let a
     * step or two through: at the very step a word comes in over a still
     * stretch the 0.4 s test would hear the stretch come back, and a word's
     * tail in the 1.2 s window makes a hiss right after it read as a rumble
     * over a steady hiss (that test judges the sound after the tail).
     */
    _voiceIn(steps, lvl) {
      return Math.max(...this._recentRing.last(steps)) > lvl + this.marginDb;
    }
    /**
     * Whether the last `steps` learning steps hold still with no period in
     * them: { lvl (their median), high (the sound sits high) }, or null.
     */
    _still(steps) {
      const r = this._recentRing.last(steps);
      if (r.length < steps) return null;
      // Speech swings 10 dB and more between syllables, and its vowels have a
      // period even when they are too soft for the pitch detector. No
      // clarity from the engine (−1): no way to tell.
      const c = median(this._recentClarity.last(steps));
      if (c == null || c < 0 || c >= NOISY) return null;
      // No hfRms from the engine (−1): neither low nor high
      const hf = median(this._recentHf.last(steps));
      const low = hf != null && hf >= 0 && hf < LOW_HF;
      const spread = percentile(r, 0.9) - percentile(r, 0.1);
      // A hiss holds its high part still (a whisper's follows its
      // syllables); a level that wobbles more than that part is a rumble's
      // over the hiss
      const hd = this._recentHfDb.last(steps);
      const hfSpread = percentile(hd, 0.9) - percentile(hd, 0.1);
      const under = !low && hf != null && hf >= 0 && hfSpread < HF_STEADY_DB;
      const high = hf != null && hf >= LOW_HF && !(under && spread >= hfSpread + HISS_UNDER_DB);
      if (Math.max(...r) - Math.min(...r) < ROOM_FLAT_DB) return { lvl: median(r), high };
      // A low rumble's extremes span more than that, but most of it holds
      // still. Not a whisper's: it sits high and its high part moves.
      if (!(low || under) || spread >= NOISE_SPREAD_DB) return null;
      return { lvl: median(r), high };
    }
    /**
     * A still stretch `b` (the last BACK_STEPS, over the floor's margin:
     * _still's { lvl, high }) once the floor holds a room: true when an
     * earlier one held still at that level for 0.8 s until a voice came
     * over it, and no quiet step since, and no step under it (see
     * _learnFloor), and, if either sits high, the earlier one's high part
     * held still. A fan switched on under the talk holds every pause and
     * stays under every word; a whisper, an "sss" or a breath ends in the
     * quiet room, or the words said after it fall under it, or its high part
     * follows its syllables. The pause that earlier stretch held is told
     * late. A stretch well over the one still open (a fan switched on in a
     * pause the room's hiss held) takes its place, from the same start.
     */
    _cameBack(b) {
      const lvl = b.lvl;
      const h = this._stretch;
      if (
        h &&
        h.end != null &&
        h.held > BACK_HELD_STEPS - BACK_STEPS &&
        Math.abs(h.lvl - lvl) < PAUSE_FLAT_DB &&
        this._underVoice(h, b)
      ) {
        this._late = h.start != null ? [h] : null;
        return true;
      }
      // The quietest this 0.4 s held, and its high part: its own steps, not
      // the tail of the word before it (a step with a period), which can sit
      // under a hiss said after it, and its high part far under
      const cl = this._recentClarity.last(BACK_STEPS);
      const own = (ring) => ring.last(BACK_STEPS).filter((_, i) => cl[i] < NOISY);
      const lo = percentile(own(this._recentRing), 0.1);
      const hfLo = percentile(own(this._recentHfDb), 0.1);
      if (!h || h.end != null || lvl > h.lvl + this.marginDb - PAUSE_FLAT_DB) {
        // From the last voice step over it, as a pause (none in reach: null)
        const lv = this._recentRing.last();
        const ts = this._recentT.last();
        let i = lv.length - BACK_STEPS;
        while (i > 0 && lv[i - 1] <= lvl + this.marginDb) i--;
        this._stretch = { lvl, held: 1, lo, hfLo, hfMove: 0, high: b.high, start: i > 0 ? ts[i - 1] : h && h.end == null ? h.start : null, end: null, sb: this._ownBands(BACK_STEPS) };
      } else {
        // The same stretch, still holding: for how many steps, the quietest
        // it has held, whether it sat high, and how far its high part moved
        // over 0.8 s (once it has held that long)
        h.held++;
        const sp = this._recentSpec[this._recentSpec.length - 1];
        const cnow = this._recentClarity.latest;
        if (h.sb) {
          if (!sp) h.sb = null;
          else if (cnow < NOISY) {
            h.sb.push(sp.bands);
            if (h.sb.length > PERSIST_STEPS) h.sb.shift();
          }
        }
        h.lo = Math.min(h.lo, lo);
        h.hfLo = Math.min(h.hfLo, hfLo);
        h.high = h.high || b.high;
        if (h.held > BACK_HELD_STEPS - BACK_STEPS) {
          const hd = this._recentHfDb.last(BACK_HELD_STEPS);
          h.hfMove = Math.max(h.hfMove, percentile(hd, 0.9) - percentile(hd, 0.1));
        }
      }
      return false;
    }
    /** The bands of the last `steps` learning steps with no period (null: a step without samples). */
    _ownBands(steps) {
      const sp = this._recentSpec.slice(-steps);
      if (sp.length < steps || sp.some((x) => !x)) return null;
      const cl = this._recentClarity.last(steps);
      return sp.filter((_, i) => cl[i] < NOISY).map((x) => x.bands);
    }
    /**
     * A voice just came over still stretch `st`: keep the 10th percentile and
     * the median of each band over its last 0.8 s, and those bands, from
     * which _underVoice judges how far its shape moved, and start collecting
     * the voice's bands.
     */
    _freeze(st) {
      if (!st.sb || st.sb.length < PERSIST_MIN_STEPS) {
        st.sb = null;
        return;
      }
      const own = st.sb.slice(-PERSIST_STEPS);
      st.s10 = bandPct(own, 0.1);
      st.smed = bandPct(own, 0.5);
      st.own = own;
      st.sb = null;
      st.vb = [];
    }
    /**
     * Was the earlier still stretch `h` under the voice that came over it,
     * in every band it fills, and did its shape hold still (see PERSIST_DB)?
     * Without the spectra (a frame with no samples, or too little voice
     * before `b`, the stretch coming back) the old test: if either sits
     * high, its high part held within BACK_HF_STEADY_DB.
     */
    _underVoice(h, b) {
      const old = !((b.high || h.high) && h.hfMove >= BACK_HF_STEADY_DB);
      if (!h.s10 || !h.vb) return old;
      // The voice's steps before the still window that came back
      const ts = this._recentT.last(BACK_STEPS);
      const from = ts[0];
      const v = h.vb.filter((x) => x.t < from);
      if (v.length < PERSIST_MIN_STEPS || v.some((x) => !x.b)) return old;
      const v10 = bandPct(v.map((x) => x.b), 0.1);
      const bed = this._quietBands.length >= 15 ? bandPct(this._quietBands, 0.1) : null;
      let top = -Infinity;
      h.smed.forEach((x) => x > top && (top = x));
      let persist = -Infinity;
      for (let k = 0; k < h.smed.length; k++) {
        if (!(h.smed[k] >= top - BAND_OCC_DB)) continue;
        if (bed && !(h.smed[k] >= bed[k] + BAND_BED_DB)) continue;
        persist = Math.max(persist, h.s10[k] - v10[k]);
      }
      if (h.shape == null) h.shape = shapeSpread(h.own, bed);
      // ... and either its high part held still (the test without
      // samples), or it is white (no voice is: a white fan whose level
      // wobbles moves its high part as much as a whisper does)
      if (h.white == null) h.white = whiteSpread(h.own) <= WHITE_DB;
      return persist <= PERSIST_DB && h.shape <= SHAPE_DB && (old || h.white);
    }
    /** Whether the last `steps` learning steps' spectrum is flat from 350 Hz to the top band (see WHITE_DB). */
    _white(steps) {
      const sp = this._recentSpec.slice(-steps);
      if (sp.length < steps || sp.some((x) => !x)) return false;
      return whiteSpread(sp.map((x) => x.bands)) <= WHITE_DB;
    }
    /**
     * Do the lines of the stretch now ending the take's last PAUSE_STEPS go
     * on under the talk heard in (from, to]? true: a hum's do; false: they
     * stop (an "mmm"); null: no verdict (no samples, no line, too little
     * talk). See LINE_STOP_DB.
     */
    _linesGoOn(from, to) {
      const hist = this._lineHist;
      const n = hist.length;
      if (n < PAUSE_STEPS) return null;
      const S = hist.slice(n - PAUSE_STEPS);
      const T = hist.filter((x) => x.t > from && x.t <= to);
      if (T.length < PERSIST_MIN_STEPS) return null;
      const nb = S[0].lines.length;
      const hz = S[0].hz;
      const med = new Float32Array(nb);
      const col = new Float64Array(S.length);
      for (let k = 0; k < nb; k++) {
        for (let i = 0; i < S.length; i++) col[i] = S[i].lines[k];
        med[k] = percentile(col, 0.5);
      }
      const k0 = Math.max(2, Math.round(60 / hz));
      const cand = [];
      for (let k = k0; k < nb - 1; k++) {
        if (med[k] < med[k - 1] || med[k] < med[k + 1]) continue;
        const nbh = [];
        for (let j = k - 8; j <= k + 8; j++) if (j >= 0 && j < nb && Math.abs(j - k) > 2) nbh.push(med[j]);
        if (med[k] >= median(nbh) + LINE_PEAK_DB) cand.push(k);
      }
      if (!cand.length) return null;
      cand.sort((a, b) => med[b] - med[a]);
      const top = med[cand[0]];
      const lines = cand.filter((k) => med[k] >= top - LINE_RANGE_DB).slice(0, LINE_N);
      const tc = new Float64Array(T.length);
      const d = lines.map((k) => {
        for (let i = 0; i < T.length; i++) tc[i] = T[i].lines[k];
        return med[k] - percentile(tc, 0.1);
      });
      return median(d) <= LINE_STOP_DB;
    }
    /**
     * Did the still stretch now ending the take's last PAUSE_STEPS go on
     * under the talk heard in (from, to]: in each band it fills, the talk's
     * 10th percentile at most PERSIST_DB under its own? null: no verdict.
     */
    _bandsGoOn(from, to) {
      const S = this._recentSpec.slice(-PAUSE_STEPS);
      if (S.length < PAUSE_STEPS || S.some((x) => !x)) return null;
      const T = this._lineHist.filter((x) => x.t > from && x.t <= to);
      if (T.length < PERSIST_MIN_STEPS) return null;
      const own = S.map((x) => x.bands);
      const s10 = bandPct(own, 0.1);
      const smed = bandPct(own, 0.5);
      const v10 = bandPct(T.map((x) => x.bands), 0.1);
      let top = -Infinity;
      smed.forEach((x) => x > top && (top = x));
      let persist = -Infinity;
      for (let k = 0; k < smed.length; k++) if (smed[k] >= top - BAND_OCC_DB) persist = Math.max(persist, s10[k] - v10[k]);
      return persist <= PERSIST_DB;
    }
    /**
     * A hum in a pause, before the floor has heard any quiet room: the last
     * 0.6 s holds still at the quietest level the take has heard, after a
     * voice at least `marginDb` above it, and the take has held still at
     * that level before, in two earlier pauses or before the first word.
     * One such stretch could be a soft "mmm" or a held note; a room comes
     * back in every pause. A voice that stops in a quiet room closes the
     * gate and the room is heard instead; a stretch SHUT_DB or more over
     * where the gate shut (a filler over a voiced stop's murmur) is not one.
     *
     * Two stretches are not enough: a learner already talking 0.2 s after
     * Start, in a quiet room, whose talk never closes the gate for 40 ms
     * (few stops, no gap between words) and never dips 3 dB under two
     * fillers ("mmm") said at one level, had the second filler learned as
     * the room, both read as pauses, and talk as soft as them lost until
     * the first real silence. The cost: a hum room is learned a pause later
     * (the first two told late). Three such fillers at one level, from a
     * learner whose talk never once shuts the gate, are still a hum.
     */
    _pauseRoom() {
      const lv = this._recentRing.last();
      const ts = this._recentT.last();
      const n = lv.length;
      if (n <= PAUSE_STEPS) return false;
      const r = lv.slice(n - PAUSE_STEPS);
      if (Math.max(...r) - Math.min(...r) >= PAUSE_FLAT_DB) return false;
      const lvl = median(r);
      if (lvl > this._lowDb + PAUSE_FLAT_DB || lvl >= this._shutDb + SHUT_DB) return false;
      const last = this._hums[this._hums.length - 1];
      // The same stretch, still going (no voice has come back over it)
      if (last && last.end == null && Math.abs(last.lvl - lvl) < PAUSE_FLAT_DB) return false;
      // A pause starts after a voice: from its last step over the stretch
      let i = n - PAUSE_STEPS;
      while (i > 0 && lv[i - 1] <= lvl + this.marginDb) i--;
      if (i === 0) return false;
      const voice = ts[i - 1];
      const same = this._hums.filter((x) => Math.abs(x.lvl - lvl) < PAUSE_FLAT_DB && x.end != null && x.end <= voice);
      const opened = same.some((x) => x.start == null);
      // Three stretches at one level, but their lines stopped under the talk
      // between the last two: "mmm"s, not a hum
      const lines = !opened && same.length >= 2 ? this._linesGoOn(Math.max(...same.map((x) => x.end)), voice) : null;
      let room = (same.length >= 2 && lines !== false) || opened;
      // One with nothing under 1.6 kHz must have gone on under the talk
      // since: a hiss through a steep low cut does, an "sss" does not
      if (room && this._sibilant(PAUSE_STEPS)) room = this._bandsGoOn(Math.max(...same.map((x) => x.end)), voice) === true;
      if (room) {
        // Pauses heard at this level before were the room too, and so was
        // the take's start if it opened with a hiss like this one
        this._late = same.filter((x) => x.start != null || x.sib);
        return true;
      }
      this._hums.push({ lvl, start: voice, end: null });
      if (this._hums.length > 8) this._hums.shift();
      return false;
    }
    /**
     * Earlier pauses the floor could not hear at the time (it learned the
     * hum they held only now): cut out of the open speech, and their end
     * told now, so a pause count still counts them. One that began before
     * the open speech (a fan switched on in a pause and opened it) runs the
     * pause before on to where a voice came over it instead. A hiss the take
     * opened with (read as speech from Start) cuts that first speech to
     * begin where the first voice came.
     */
    _heardLate(list) {
      let seg = this.segments[this.segments.length - 1];
      if (this.state !== "speech" || !seg || seg.kind !== "speech") return;
      list.forEach((h) => {
        if (h.start == null) {
          if (this.segments.length === 1 && seg.start < h.end) {
            seg.start = h.end;
            this.speechStart = h.end;
          }
          return;
        }
        if (h.end <= h.start) return;
        if (h.start <= seg.start) {
          // It came on in a pause and opened this speech: the pause ran on
          // under it (its end was told when it came on, and is not again)
          const prev = this.segments[this.segments.length - 2];
          if (h.end > seg.start && prev && prev.kind === "pause" && prev.end === seg.start) {
            prev.end = h.end;
            seg.start = h.end;
            this.speechStart = h.end;
          }
          return;
        }
        seg.end = h.start;
        this.segments.push({ kind: "pause", start: h.start, end: h.end });
        seg = { kind: "speech", start: h.end, end: null };
        this.segments.push(seg);
        this.speechStart = h.end;
        if (this.cb.onPauseEnd) this.cb.onPauseEnd(h.start, h.end - h.start);
      });
    }
    /**
     * The floor just rose under open speech. Speech that never cleared the
     * new floor, and does not now, was the room all along; otherwise the
     * pause began when the level fell to the room, which was up to a second
     * ago, not now.
     */
    _roomFound() {
      const lim = this.floorDb + this.marginDb;
      const seg = this.segments[this.segments.length - 1];
      if (Math.max(this._peakDb, this.levelDb) <= lim && seg && seg.kind === "speech") {
        // A fan or a hum read as speech before the floor knew it: take it
        // back, to nothing said yet or to the pause it interrupted
        this.segments.pop();
        const prev = this.segments[this.segments.length - 1];
        if (prev && prev.kind === "pause") {
          prev.end = null;
          this.state = "pause";
          this.pauseStart = prev.start;
          // Its end was already reported when the fan came on: reporting it
          // again when the learner speaks would count one pause twice
          this._pauseTold = true;
        } else {
          this.state = "idle";
        }
        this.speechStart = null;
        this._loudSince = null;
        if (this.cb.onTakeBack) this.cb.onTakeBack(seg.start);
        return;
      }
      const lv = this._recentRing.last();
      const ts = this._recentT.last();
      let i = lv.length;
      while (i > 0 && lv[i - 1] <= lim) i--;
      if (i === lv.length) return;
      // From the last step that was still loud (the frame's 43 ms window
      // trails the voice, so this is within a step of the real end)
      const since = i > 0 ? ts[i - 1] : ts[0] - 1 / 30;
      this._quietSince = Math.max(this.speechStart, since);
    }
    /** Closed pauses of at least `minSec`, as { start, len }. */
    pauses(minSec = this.minPauseSec) {
      const out = [];
      this.segments.forEach((g) => {
        if (g.kind === "pause" && g.end != null && g.end - g.start >= minSec) {
          out.push({ start: g.start, len: g.end - g.start });
        }
      });
      return out;
    }
  }

  /* —— Level relative to you —— */

  /**
   * Your level in dB against your own median while sounding, over the last
   * `windowSec`. The median settles after a couple of seconds of voice; until
   * then `ready` is false and a picture should say it is still listening.
   */
  class RelativeLevel {
    constructor(opts = {}) {
      this.windowSec = opts.windowSec || 20;
      this.smoothMs = opts.smoothMs || 150;
      this._ring = new Ring(Math.round(this.windowSec * 20));
      this._acc = 0;
      this._since = 0;
      this.refDb = null;
      this.db = -140;
      this.smoothDb = null;
      this.voicedSec = 0;
    }
    get ready() {
      return this.voicedSec >= (this.readySec || 1.5) && this.refDb != null;
    }
    /** Fix the reference (a calibration) instead of following the median. */
    lock(db) {
      this.lockedDb = db;
      this.refDb = db;
    }
    feed(frame) {
      const dt = frameDt(frame);
      // Before the MIC slider's gain, so moving the slider does not move you
      this.db = dbfs((frame.rms || 0) / (frame.inputGain || 1));
      const a = 1 - Math.exp(-(dt * 1000) / this.smoothMs);
      if (frame.sounding) {
        this.smoothDb = this.smoothDb == null ? this.db : this.smoothDb + a * (this.db - this.smoothDb);
        this.voicedSec += dt;
        this._acc += dt;
        if (this._acc >= 0.05) {
          this._acc = 0;
          this._ring.push(this.smoothDb);
        }
        this._since += dt;
        if (this.lockedDb == null && (this._since >= 0.5 || this.refDb == null) && this._ring.count >= 10) {
          this._since = 0;
          this.refDb = median(this._ring.last());
        }
      } else if (this.smoothDb != null) {
        // Let the smoothed value fall away in silence rather than freeze
        this.smoothDb += a * (this.db - this.smoothDb);
      }
      return this.rel;
    }
    /** dB above (+) or below (−) your reference; null before it exists. */
    get rel() {
      if (this.refDb == null || this.smoothDb == null) return null;
      return this.smoothDb - this.refDb;
    }
    reset() {
      this._ring.clear();
      this.refDb = this.lockedDb != null ? this.lockedDb : null;
      this.smoothDb = null;
      this.voicedSec = 0;
    }
  }

  /* —— Syllable rate —— */

  /**
   * Syllables per second, roughly, from peaks in the loudness envelope (after
   * de Jong & Wempe): a peak counts when it rises at least `dipDb` above the
   * valley before it, falls `dipDb` after, sits within 25 dB of the loudest
   * recent peak, and comes at least 90 ms after the previous one. Rate is
   * counted over speaking time only (pauses excluded: the articulation rate),
   * over the last `windowSec` of speech.
   *
   * It undercounts fast connected speech (merged vowels, diphthongs), so the
   * number is shown as a change against your own baseline, never as a norm.
   */
  class SyllableRate {
    constructor(opts = {}) {
      this.dipDb = opts.dipDb || 2.5;
      this.minGapSec = opts.minGapSec || 0.09;
      this.windowSec = opts.windowSec || 4;
      this.smoothMs = opts.smoothMs || 35;
      this.reset();
    }
    reset() {
      this.t = 0;
      this.speechT = 0; // clock that only runs while sounding
      this.peaks = []; // speech-clock times of counted syllables
      this.allPeaks = []; // wall times, for pictures
      this._s = null;
      this._rising = true;
      this._valley = 0;
      this._cand = null; // { db, t, st }
      this._lastPeakT = -1;
      this._maxRecent = -140;
      this._quietMs = 1e9;
      this._started = false;
    }
    feed(frame) {
      const dt = frameDt(frame);
      this.t += dt;
      const db = dbfs(frame.rms || 0);
      const a = 1 - Math.exp(-(dt * 1000) / this.smoothMs);
      this._s = this._s == null ? db : this._s + a * (db - this._s);
      const s = this._s;
      // Speaking time runs through the dips between syllables and stops only
      // in a real pause (a quarter second of quiet), so the rate is syllables
      // per second of talking, not per second of voicing.
      if (frame.sounding) this._quietMs = 0;
      else this._quietMs = (this._quietMs || 0) + dt * 1000;
      if (this._quietMs < 250 && this._started) this.speechT += dt;
      if (frame.sounding) this._started = true;
      this._maxRecent = Math.max(this._maxRecent - dt * 3, s);
      if (this._rising) {
        if (this._cand == null || s > this._cand.db) {
          this._cand = { db: s, t: this.t, st: this.speechT, voiced: !!frame.sounding };
        }
        if (this._cand && s < this._cand.db - this.dipDb) {
          const c = this._cand;
          const risen = c.db - this._valley >= this.dipDb;
          const loudEnough = c.db > this._maxRecent - 25;
          if (risen && loudEnough && c.voiced && c.t - this._lastPeakT >= this.minGapSec) {
            this.peaks.push(c.st);
            this.allPeaks.push(c.t);
            this._lastPeakT = c.t;
            if (this.peaks.length > 400) this.peaks.shift();
            if (this.allPeaks.length > 400) this.allPeaks.shift();
          }
          this._rising = false;
          this._valley = s;
        }
      } else {
        if (s < this._valley) this._valley = s;
        if (s > this._valley + this.dipDb) {
          this._rising = true;
          this._cand = { db: s, t: this.t, st: this.speechT, voiced: !!frame.sounding };
        }
      }
      return this.rate;
    }
    /** Syllables per speaking second over the last window, or null early on. */
    get rate() {
      if (this.speechT < 1.5) return null;
      const w = Math.min(this.windowSec, this.speechT);
      const from = this.speechT - w;
      let n = 0;
      for (let i = this.peaks.length - 1; i >= 0 && this.peaks[i] >= from; i--) n++;
      return n / w;
    }
    /** Rate over all speech so far. */
    get overall() {
      return this.speechT >= 1.5 ? this.peaks.length / this.speechT : null;
    }
  }

  /* —— Onsets —— */

  /**
   * The first 300 ms of each sound after at least `minGapMs` of quiet, cut
   * from the fast envelope, with the numbers that tell a breathy, a balanced
   * and an abrupt onset apart:
   *   riseMs     10% → 90% of the level the note settles at
   *   overshoot  loudest point in the first 100 ms ÷ that settled level
   *   leadMs     sound with no pitch before the pitch locks (air first)
   * Classification thresholds start from published ranges and can be
   * replaced by the learner's own three contrast examples (`calibrate`).
   */
  class OnsetCapture {
    constructor(opts = {}) {
      this.env = opts.envelope || new Envelope({ keepSec: 1.5 });
      this.ownsEnv = !opts.envelope;
      this.minGapMs = opts.minGapMs || 350;
      this.onOnset = opts.onOnset || null;
      this.thresholds = Object.assign(
        { breathyLeadMs: 90, breathyRiseMs: 140, abruptRiseMs: 22, abruptOvershoot: 1.35 },
        opts.thresholds || {}
      );
      this.reset();
    }
    reset() {
      if (this.ownsEnv) this.env.reset();
      this._quietMs = 1e9;
      this._pending = null;
      this.last = null;
    }
    feed(frame) {
      if (this.ownsEnv) this.env.feed(frame);
      const dtMs = (frame && frame.dtMs) || 16;
      const sounding = !!(frame && frame.sounding);
      if (!sounding) {
        this._quietMs += dtMs;
        if (this._pending && this._pending.age < 120) this._pending = null; // a blip, not a note
        return null;
      }
      if (!this._pending && this._quietMs >= this.minGapMs) {
        this._pending = { startTotal: this.env.total, age: 0, pitchAt: null, envAtStart: null };
      }
      this._quietMs = 0;
      const p = this._pending;
      if (!p) return null;
      p.age += dtMs;
      if (p.pitchAt == null && frame.rawFreq) p.pitchAt = p.age;
      if (p.age >= 340) {
        this._pending = null;
        const res = this._analyse(p);
        this.last = res;
        if (res && this.onOnset) this.onOnset(res);
        return res;
      }
      return null;
    }
    _analyse(p) {
      const rate = this.env.rate;
      // From 40 ms before the sound was first seen to 300 ms after
      const back = Math.round(0.04 * rate);
      const len = Math.round(0.34 * rate);
      const since = this.env.total - p.startTotal + back;
      const w = this.env.window(since / rate);
      const seg = w.slice(0, Math.min(w.length, back + len));
      if (seg.length < back + 20) return null;
      const settleFrom = Math.round((0.04 + 0.15) * rate);
      const settle = seg.slice(Math.min(settleFrom, seg.length - 10));
      const steady = median(settle) || 1e-6;
      const noise = percentile(seg.slice(0, back), 0.2) || 0;
      const lo = noise + (steady - noise) * 0.1;
      const hi = noise + (steady - noise) * 0.9;
      let i10 = -1;
      let i90 = -1;
      for (let i = 0; i < seg.length; i++) {
        if (i10 < 0 && seg[i] >= lo) i10 = i;
        if (i10 >= 0 && seg[i] >= hi) {
          i90 = i;
          break;
        }
      }
      const riseMs = i10 >= 0 && i90 >= 0 ? ((i90 - i10) * 1000) / rate : 300;
      let peak = 0;
      const first = seg.slice(Math.max(0, i10), Math.max(0, i10) + Math.round(0.1 * rate));
      for (let i = 0; i < first.length; i++) peak = Math.max(peak, first[i]);
      const overshoot = peak / steady;
      const leadMs = p.pitchAt == null ? 300 : Math.max(0, p.pitchAt - 20);
      const t = this.thresholds;
      let kind = "balanced";
      if (leadMs >= t.breathyLeadMs || riseMs >= t.breathyRiseMs) kind = "breathy";
      else if (riseMs <= t.abruptRiseMs && overshoot >= t.abruptOvershoot) kind = "abrupt";
      // Normalised shape for drawing: 0..1 against the settled level
      const shape = Array.from(seg, (v) => clamp((v - noise) / Math.max(1e-6, (steady - noise) * 1.6), 0, 1));
      return { kind, riseMs, overshoot, leadMs, shape, pitched: p.pitchAt != null, onsetIndex: back };
    }
    /**
     * Set thresholds from the learner's own examples of each kind, halfway
     * between them. `examples` = { breathy: res, balanced: res, abrupt: res }.
     */
    calibrate(examples) {
      const b = examples.breathy;
      const m = examples.balanced;
      const a = examples.abrupt;
      if (b && m) {
        this.thresholds.breathyLeadMs = clamp((b.leadMs + m.leadMs) / 2, 40, 200);
        this.thresholds.breathyRiseMs = clamp((b.riseMs + m.riseMs) / 2, 60, 250);
      }
      if (a && m) {
        this.thresholds.abruptRiseMs = clamp((a.riseMs + m.riseMs) / 2, 8, 60);
        this.thresholds.abruptOvershoot = clamp((a.overshoot + m.overshoot) / 2, 1.1, 2);
      }
    }
  }

  /* —— Pitch helpers —— */

  /**
   * A pitch track that ignores single-frame octave slips: a median over five
   * frames, and a jump of more than `maxJump` semitones must last 50 ms before
   * it is believed.
   */
  class StablePitch {
    constructor(opts = {}) {
      this.maxJump = opts.maxJump || 8;
      this._win = [];
      this.midi = null;
      this._jumpMs = 0;
    }
    feed(frame) {
      const f = frame && frame.rawFreq;
      if (!f) {
        this._win.length = 0;
        this._jumpMs = 0;
        this.midi = null;
        return null;
      }
      const m = 69 + 12 * Math.log2(f / 440);
      this._win.push(m);
      if (this._win.length > 5) this._win.shift();
      const med = median(this._win);
      if (this.midi != null && Math.abs(med - this.midi) > this.maxJump) {
        this._jumpMs += (frame && frame.dtMs) || 16;
        if (this._jumpMs < 50) return this.midi;
      }
      this._jumpMs = 0;
      this.midi = med;
      return this.midi;
    }
    reset() {
      this._win.length = 0;
      this.midi = null;
      this._jumpMs = 0;
    }
  }

  global.VTFeatures = {
    Ring,
    Envelope,
    TrillDetector,
    Vad,
    RelativeLevel,
    SyllableRate,
    OnsetCapture,
    StablePitch,
    dbfs,
    percentile,
    median,
    clamp,
    frameDt
  };
})(typeof window !== "undefined" ? window : globalThis);
