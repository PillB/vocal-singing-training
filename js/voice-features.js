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
  // about 20 dB under its level, a hiss's at its level). A whisper's
  // syllables hold still for 0.4 s only by chance, once or twice a phrase,
  // and an inhale between two phrases for less than 0.8 s, where a fan
  // holds the whole pause.
  const BACK_STEPS = 12;
  const BACK_HELD_STEPS = 24;
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
   *   sits high (a whisper, a held "sss", a white fan: one switched on in
   *   a silent lead-in reads as speech until the first word), unless it
   *   comes back after a voice was heard over it: a fan switched on under
   *   the talk, held still in one pause and then in the next, is the room
   *   by 0.4 s into that one, and the pause before it is told late (or, if
   *   the fan came on in a pause, runs on under it). A hiss, a whisper or
   *   an inhale said between words with no silence around it does not come
   *   back: the words fall under it, or their high part does, where they
   *   would sit over a fan, and a whisper or an inhale holds still for less
   *   than a fan's pause.
   * - An audible inhale is talk. It is as aperiodic, as still and sits as
   *   high as a whispered syllable or a short "sss", and nothing in its
   *   level tells them apart, so a breath loud enough to open the gate (a
   *   close mic) reads as speech, as it always has: between two phrases with
   *   no silence around it, the phrases run on through it; taken inside a
   *   silence, it splits that silence in two. A quieter breath is silence.
   *   One held still for 0.8 s or more between two phrases that never fall
   *   under it (no stop, no gap) can pass for a fan switched on in a pause,
   *   and the second such breath be learned as the room.
   * - A steady sound with a period is a voice (a sung note, a soft held
   *   vowel, an "mmm"), unless the take opened with it and heard nothing
   *   else for a second: a hum in the room, learned the same way. Before the
   *   floor has heard any quiet room, a hum the learner talked over from the
   *   first frame is learned from the pauses instead: 0.6 s at the quietest
   *   level heard that comes back in two more pauses (or that the take
   *   opened with). The Space assist never teaches the floor.
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
   * caller's clock opened when the fan came on still spans it.
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
      // { lvl, start, end } (start null: the take opened with it)
      this._lowDb = Infinity;
      this._hums = [];
      this._late = null;
      this._shutDb = Infinity;
      // Once the floor holds a room: the last still stretch heard since it
      // was quiet ({ lvl, held, lo, hfLo, start, end }: how many steps it
      // held still, the quietest it held and its high part's, and when a
      // voice came over it), and for how many steps in a row the sound has
      // held still
      this._stretch = null;
      this._stillRun = 0;
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
            // at its level is the same room
            if (this._openSteps >= OPEN_MIN_STEPS) {
              this._hums.push({ lvl: (this._openLoDb + this._openHiDb) / 2, start: null, end: this.t });
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
      if (st && st.end == null && db > st.lvl + this.marginDb && frame.clarity >= NOISY) st.end = this.t - 1 / 60;
      if (st && st.end != null && (db < st.lo - PAUSE_FLAT_DB || hfDb < st.hfLo - PAUSE_FLAT_DB)) this._stretch = null;
      // A consonant closes the gate for 40–100 ms inside a word: a soft
      // speaker's dips would become the floor and their weaker syllables
      // read as pauses. Only a gate still closed after the hangover is quiet.
      const closed = this._closedSince != null && (this.t - this._closedSince) * 1000 >= this.hangMs;
      if (closed || db <= this.floorDb + this.marginDb) {
        this._stretch = null;
        this._stillRun = 0;
        this._floorRing.push(db);
        if (this._floorRing.count >= 15) {
          this.floorDb = Math.max(-90, percentile(this._floorRing.last(), 0.1));
        }
        return;
      }
      const steps = this._steadyRoom();
      if (!steps) return;
      // Steady sound above the floor is a new room: a fan heard before the
      // floor knew it, or one switched on. The floor starts over from it, so
      // it stops reading as speech now rather than after 6 s of it.
      const before = this.floorDb;
      this._floorRing.clear();
      this._recentRing.last(steps).forEach((v) => this._floorRing.push(v));
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
      if (!known && this._openSteps >= OPEN_STEPS) return OPEN_STEPS;
      if (!known && this._pauseRoom()) return PAUSE_STEPS;
      if (!known) return this._still(ROOM_STEPS) ? ROOM_STEPS : 0;
      const b = this._still(BACK_STEPS);
      if (!b || b.lvl <= this.floorDb + this.marginDb || this._voiceIn(BACK_STEPS, b.lvl)) {
        this._stillRun = 0;
        return 0;
      }
      this._stillRun++;
      if (this._cameBack(b.lvl)) return ROOM_STEPS;
      // 1.2 s still, but for the last step or two of the voice before it (a
      // pause of just 1.2 s), and how high the sound sits judged after them
      if (!this._still(NEW_ROOM_STEPS)) return 0;
      const l = this._still(NEW_ROOM_STEPS - TAIL_STEPS);
      if (!l || this._voiceIn(NEW_ROOM_STEPS - TAIL_STEPS, l.lvl)) return 0;
      return !l.high || this._stillRun >= HISS_ROOM_STEPS - BACK_STEPS ? NEW_ROOM_STEPS : 0;
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
     * A still stretch at `lvl` (the last BACK_STEPS, over the floor's
     * margin) once the floor holds a room: true when an earlier one held
     * still at that level for 0.8 s until a voice came over it, and no
     * quiet step since, and no step under it (see _learnFloor). A fan
     * switched on under the talk holds every pause and stays under every
     * word; a whisper, an "sss" or a breath ends in the quiet room, or the
     * words said after it fall under it. The pause that earlier stretch
     * held is told late. A stretch well over the one still open (a fan
     * switched on in a pause the room's hiss held) takes its place, from the
     * same start.
     */
    _cameBack(lvl) {
      const h = this._stretch;
      if (h && h.end != null && h.held > BACK_HELD_STEPS - BACK_STEPS && Math.abs(h.lvl - lvl) < PAUSE_FLAT_DB) {
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
        this._stretch = { lvl, held: 1, lo, hfLo, start: i > 0 ? ts[i - 1] : h && h.end == null ? h.start : null, end: null };
      } else {
        // The same stretch, still holding: for how many steps, and the
        // quietest it has held
        h.held++;
        h.lo = Math.min(h.lo, lo);
        h.hfLo = Math.min(h.hfLo, hfLo);
      }
      return false;
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
      if (same.length >= 2 || same.some((x) => x.start == null)) {
        // Pauses heard at this level before were the room too
        this._late = same.filter((x) => x.start != null);
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
     * pause before on to where a voice came over it instead.
     */
    _heardLate(list) {
      let seg = this.segments[this.segments.length - 1];
      if (this.state !== "speech" || !seg || seg.kind !== "speech") return;
      list.forEach((h) => {
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
