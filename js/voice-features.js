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
   * first 50 ms of an onset. The engine hands over its latest 2048 samples each
   * frame; only the ones that arrived since the previous frame are new, so
   * those are cut into 2.5 ms blocks. The envelope value is the RMS of the last
   * 12.5 ms — at least one pitch period for voices above 80 Hz, so the voice's
   * own waveform does not ripple through it, and short enough to follow 35 Hz.
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

  /**
   * Speech/silence with the room's own floor, a short hangover, and pauses
   * dated from when the sound actually stopped.
   *
   * - Floor: the 10th percentile of the last 6 s of level. Sound must clear it
   *   by `marginDb` and also clear the engine's own sensitivity gate
   *   (`frame.sounding`), so a fan does not read as speech and a quiet room
   *   does not turn a breath into a word.
   * - A pause starts only after `hangMs` of quiet (stop consonants leave
   *   100–250 ms gaps inside words) but is dated from the first quiet frame,
   *   so a 1.2 s pause measures 1.2 s.
   * Callbacks: onSpeech(t), onPause(tStart), onPauseEnd(tStart, len).
   */
  class Vad {
    constructor(opts = {}) {
      this.marginDb = opts.marginDb != null ? opts.marginDb : 8;
      this.hangMs = opts.hangMs != null ? opts.hangMs : 220;
      this.onsetMs = opts.onsetMs != null ? opts.onsetMs : 40;
      this.minPauseSec = opts.minPauseSec != null ? opts.minPauseSec : 0.25;
      this.cb = opts;
      this._floorRing = new Ring(Math.round(6 * 30));
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
      this.pauseStart = null;
      this.speechStart = null;
      this.levelDb = -140;
      this._floorRing.clear();
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
      // The floor learns ~30 times a second
      this._floorAcc += dt;
      if (this._floorAcc >= 1 / 30) {
        this._floorAcc = 0;
        this._floorRing.push(db);
        if (this._floorRing.count >= 15) {
          this.floorDb = Math.max(-90, percentile(this._floorRing.last(), 0.1));
        }
      }
      const loud = !!frame.sounding && db > this.floorDb + this.marginDb;
      if (loud) {
        this._quietSince = null;
        if (this._loudSince == null) this._loudSince = this.t - dt;
        if (this.state !== "speech" && (this.t - this._loudSince) * 1000 >= this.onsetMs) {
          const start = this._loudSince;
          if (this.state === "pause" && this.pauseStart != null) {
            const len = start - this.pauseStart;
            const seg = this.segments[this.segments.length - 1];
            if (seg && seg.kind === "pause") seg.end = start;
            if (this.cb.onPauseEnd) this.cb.onPauseEnd(this.pauseStart, len);
          }
          this.state = "speech";
          this.speechStart = start;
          this.pauseStart = null;
          this.segments.push({ kind: "speech", start, end: null });
          if (this.cb.onSpeech) this.cb.onSpeech(start);
        }
      } else {
        this._loudSince = null;
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
