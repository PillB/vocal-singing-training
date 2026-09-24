/**
 * Breath and SOVT pictures: lip trills and the straw (sovtFlow), the lip-trill
 * scale on the pitch highway (trillSolfege), the SH air ladder (shAirLadder)
 * and the S-then-/A/ drill (breathS).
 *
 * What a microphone can say about these, and what it cannot:
 * - A lip trill chops the sound 20–30 times a second. Whether the lips are
 *   still flapping, and for how long without stopping, is measurable from the
 *   fast envelope (VTFeatures.TrillDetector); ease, support and jaw freedom
 *   are not, so they are never scored here.
 * - An S or SH is noise with no pitch. Its presence, its length and how
 *   steady its level stays against its own median are measurable; the air
 *   behind it is not (hiss energy is not a flow meter), so the level is shown
 *   in dB relative to the learner and labelled approximate.
 * - Pitch in hiss is noise: the detector invents a new note every frame.
 *   A pitch only counts here when the detector keeps finding it (PitchGate).
 *
 * Shapes carry the state as well as colour: a zig-zag is a trill, a flat bar
 * is a tone, dots are air, nothing is silence. The raw flutter is never
 * animated (it would flicker at 25 Hz); the zig-zag is drawn at a fixed
 * spacing anchored to time, so it scrolls without shimmering.
 */
(function (global) {
  "use strict";
  const V = global.VTViz;
  const F = global.VTFeatures;
  if (!V || !F) return;
  const { C, L, font, clamp, chips, fmtSec, fmtNum, fitText, panel, glyph, roundRect, hatch, ring } = V;

  /* —— Tags: what the microphone hears, one per sample —— */

  const T = {
    SIL: 0, // silence
    TRILL: 1, // flutter with a pitch (voiced lip trill)
    AIRTRILL: 2, // flutter with no pitch (the unvoiced "brrr")
    TONE: 3, // a pitch with no flutter
    AIR: 4, // sound with no pitch and no flutter
    PEND: 5 // the first moments of a sound, before it can be told apart
  };

  const NAMES_ES = ["Do", "Do♯", "Re", "Re♯", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "La♯", "Si"];
  const NAMES_EN = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
  /** A note name in the page's language: Do3 / C3. */
  function noteName(midi) {
    if (!Number.isFinite(midi)) return "—";
    const m = Math.round(midi);
    const names = V.isEs() ? NAMES_ES : NAMES_EN;
    return names[((m % 12) + 12) % 12] + (Math.floor(m / 12) - 1);
  }
  function hzToMidi(f) {
    return f > 0 ? 69 + 12 * Math.log2(f / 440) : null;
  }
  /** The same pitch class moved to the octave nearest `center`. */
  function foldTo(m, center) {
    if (!Number.isFinite(m) || !Number.isFinite(center)) return m;
    return m + 12 * Math.round((center - m) / 12);
  }
  function fmtClock(sec) {
    const s = Math.max(0, Math.round(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  /* —— Pitch you keep, not pitch the detector invents —— */

  /**
   * In hiss and in an unvoiced brrr the autocorrelation detector returns a
   * different "note" every few frames (241, 329, 194, 367 Hz…), repeating
   * each one for a frame or two because successive analysis windows overlap.
   * A pitch counts only when most of the last 0.2 s of estimates sit within
   * `tol` semitones of their median: a sung note, a vibrato or a siren
   * passes; noise, spread over octaves, does not.
   */
  class PitchGate {
    constructor(winSec = 0.2, tol = 1.5, share = 0.7) {
      this.winSec = winSec;
      this.tol = tol;
      this.share = share;
      this.w = [];
      this.t = 0;
    }
    feed(f, dt = 1 / 60) {
      this.t += dt;
      const m = f ? hzToMidi(f) : null;
      this.w.push({ t: this.t, m });
      while (this.w.length && this.t - this.w[0].t > this.winSec) this.w.shift();
      if (m == null) return null;
      const vals = [];
      for (const e of this.w) if (e.m != null) vals.push(e.m);
      if (vals.length < 4) return null;
      const med = F.median(vals);
      let k = 0;
      for (const v of vals) if (Math.abs(v - med) <= this.tol) k++;
      const enough = vals.length >= 0.4 * this.w.length;
      return enough && k >= this.share * vals.length && Math.abs(m - med) <= this.tol ? f : null;
    }
    reset() {
      this.w.length = 0;
      this.t = 0;
    }
  }

  /** The bits of an engine frame these pictures read, with safe defaults. */
  function frameBits(frame) {
    const rms = (frame && frame.rms) || 0;
    const sounding = frame && frame.sounding != null ? !!frame.sounding : rms >= 0.02;
    // Frames built by hand (tests, the clock-only ticker) carry no rawFreq
    const raw =
      frame && frame.rawFreq !== undefined
        ? frame.rawFreq || null
        : frame && frame.voiced && rms >= 0.02
          ? frame.voiceFreq || null
          : null;
    return { rms, sounding, raw };
  }

  /**
   * Air (S, SH), a sung tone, or Space, for one frame.
   * - air: the engine's raw air decision (airRaw, no grace window; hand-made
   *   frames without it fall back to airDetected), unless the frame is
   *   plainly a sung tone. airRaw alone is not enough: it also fires on a
   *   loud sung vowel.
   * - voiced: a pitch the detector keeps finding (PitchGate) while sounding,
   *   with little hiss for its level. An S or SH carries high-frequency
   *   energy near its whole level (first-difference hf/rms ≈ 0.9); a sung
   *   /A/ has about a tenth of it.
   * - assisted: Space held for air (the manual assist), counted but drawn apart.
   */
  function airBits(frame, gate) {
    const b = frameBits(frame);
    const dt = F.frameDt(frame);
    const kept = gate ? gate.feed(b.raw, dt) : b.raw;
    const hf = frame && frame.hfRms;
    const hissy = hf != null && b.rms > 0 ? hf / b.rms >= 0.3 : null;
    const assisted = !!(frame && frame.manualSound && frame.manualKind === "air");
    const airFlag = frame && frame.airRaw !== undefined ? !!frame.airRaw : !!(frame && frame.airDetected);
    const voiced = !!kept && b.sounding && hissy !== true;
    return {
      air: airFlag && !(kept && hissy === false),
      voiced,
      assisted,
      db: b.rms > 0 ? 20 * Math.log10(b.rms) : null,
      dt
    };
  }

  /* —— Lip trill / straw: the continuity track —— */

  /** How long after the lips stop the flutter measure lets go of it (s). */
  const STALL_LAG = 0.45;

  /**
   * Feeds on engine frames and keeps what the SOVT pictures draw:
   * - `tag` of each 1/20 s (silence, trill, brrr, tone, air), with the pitch;
   * - runs of the sound being asked for (`onTags`), how each one ended —
   *   with a breath (silence) or with the flutter stopping while the sound
   *   went on (a stall), which is the thing the lip trill drill is about;
   * - seconds of each kind of sound, the longest run, and pitch ranges.
   * The first 0.65 s of every sound is held as "pending" and then filled in
   * with what it turned out to be: at an onset the flutter window still
   * holds the silence before it, which reads as a flutter for a moment.
   */
  class TrillTrack {
    constructor(opts = {}) {
      this.hz = 20;
      this.keepSec = opts.keepSec || 900;
      this.n = Math.round(this.keepSec * this.hz);
      this.tags = new Uint8Array(this.n);
      this.midis = new Float32Array(this.n);
      this.onTags = opts.onTags || [T.TRILL, T.AIRTRILL];
      this.det = new F.TrillDetector();
      this.gate = new PitchGate();
      this.pitch = new F.StablePitch();
      this.reset();
    }
    reset() {
      this.det.reset();
      this.gate.reset();
      this.pitch.reset();
      this.t = 0;
      this.total = 0;
      this._acc = 0;
      this.tag = T.SIL;
      this.quiet = 1;
      this.soundSince = null;
      this.pendFrom = null;
      this.smoothMidi = null;
      this._pitchAt = -9;
      this.center = null;
      this.sec = [0, 0, 0, 0, 0, 0];
      this.soundSec = 0;
      this.run = null;
      this.runs = [];
      this.best = 0;
      this.onSec = 0;
      this.stalls = [];
      this.bestRange = 0;
      this.heard = false;
      this._flut = false;
      this._flutMs = 0;
    }
    setOnTags(tags) {
      if (this.run) this._endRun(this.t, "switch");
      this.onTags = tags;
    }
    isOn(tag) {
      return this.onTags.includes(tag);
    }
    get runLen() {
      return this.run ? this.run.len : 0;
    }
    /** Median pitch of the last finished (or current) run of the asked-for sound. */
    lastRunMidi() {
      if (this.run && this.run.midis.length >= 4) return F.median(this.run.midis);
      for (let i = this.runs.length - 1; i >= 0; i--) {
        if (this.runs[i].midi != null) return this.runs[i].midi;
      }
      return null;
    }
    feed(frame) {
      const dt = F.frameDt(frame);
      this.t += dt;
      const b = frameBits(frame);
      const f = this.gate.feed(b.raw, dt);
      const df = {
        sounding: b.sounding,
        rawFreq: f,
        buf: frame && frame.buf,
        sampleRate: frame && frame.sampleRate,
        dtMs: (frame && frame.dtMs) || 16
      };
      this.det.feed(df);
      const m = this.pitch.feed(df);
      if (m != null) {
        const a = 1 - Math.exp(-dt / 0.12);
        this.smoothMidi = this.smoothMidi == null ? m : this.smoothMidi + a * (m - this.smoothMidi);
        this._pitchAt = this.t;
        // The picture's centre drifts slowly towards where you sing
        const ac = 1 - Math.exp(-dt / 1.8);
        this.center = this.center == null ? m : this.center + ac * (m - this.center);
      } else if (this.t - this._pitchAt > 0.35) {
        this.smoothMidi = null;
      }
      const pitched = this.t - this._pitchAt < 0.2;

      let tag;
      if (!b.sounding) {
        this.quiet += dt;
        tag = this.quiet >= 0.09 ? T.SIL : this.tag;
        if (tag === T.SIL) {
          this._flut = false;
          this._flutMs = 0;
        }
      } else {
        this.quiet = 0;
        if (this.tag === T.SIL || this.soundSince == null) {
          this.soundSince = this.t - dt;
          this.pendFrom = this.total;
        }
        const flutter = this._flutter(dt);
        const base = flutter ? (pitched ? T.TRILL : T.AIRTRILL) : pitched ? T.TONE : T.AIR;
        tag = this.t - this.soundSince < 0.65 ? T.PEND : base;
      }
      // A sound that has lasted long enough to be told apart: fill in its start
      if (this.tag === T.PEND && tag !== T.PEND) {
        const resolved = tag === T.SIL ? this._pendGuess(pitched) : tag;
        this._backfill(this.pendFrom, resolved);
        const pendSec = Math.max(0, this.t - dt - this.soundSince);
        this.sec[resolved] += pendSec;
        if (tag !== T.SIL && this.isOn(resolved)) {
          this._startRun(this.soundSince);
          this.onSec += pendSec;
        }
      }
      if (tag !== T.PEND && tag !== T.SIL) this.sec[tag] += dt;
      if (b.sounding) {
        this.soundSec += dt;
        this.heard = true;
      }

      // Runs of the asked-for sound, and how each one ends
      if (tag !== T.PEND) {
        const on = tag !== T.SIL && this.isOn(tag);
        if (on) {
          if (!this.run) this._startRun(this.t - dt);
          const r = this.run;
          r.tag = tag;
          r.len = this.t - r.start;
          this.onSec += dt;
          if (r.len > this.best) this.best = r.len;
          if (this.smoothMidi != null) {
            r.n = (r.n || 0) + 1;
            if (r.n % 3 === 0) r.midis.push(this.smoothMidi);
            r.lo = Math.min(r.lo, this.smoothMidi);
            r.hi = Math.max(r.hi, this.smoothMidi);
            if (r.hi - r.lo > this.bestRange) this.bestRange = r.hi - r.lo;
          }
        } else if (this.run) {
          this._endRun(this.t - dt, tag === T.SIL ? "breath" : "stall", tag);
        }
      }
      this.tag = tag;

      // History at 20 values a second
      this._acc += dt * this.hz;
      while (this._acc >= 1) {
        this._acc -= 1;
        const i = this.total % this.n;
        this.tags[i] = tag;
        this.midis[i] = this.smoothMidi == null ? NaN : this.smoothMidi;
        this.total++;
      }
      return tag;
    }
    /**
     * Flutter judged from the detector's own measures, not its state: its
     * 0.4 s envelope window straddles the silence before an onset, and that
     * step reads as a deep, fast "flutter" (≈ 45–50 Hz) for half a second.
     * Flutter counts once the window holds only this sound, at a lip rate
     * (12–42 Hz), and after 0.12 s on (0.2 s off) so it does not flicker.
     */
    _flutter(dt) {
      const d = this.det;
      const clean = this.soundSince != null && this.t - this.soundSince >= 0.45;
      const raw = clean && d.depth >= d.minDepth && d.corr >= d.minCorr && d.hz >= 12 && d.hz <= 42;
      if (raw === this._flut) this._flutMs = 0;
      else {
        this._flutMs += dt;
        if (this._flutMs >= (raw ? 0.12 : 0.2)) {
          this._flut = raw;
          this._flutMs = 0;
        }
      }
      return this._flut;
    }
    _pendGuess(pitched) {
      return pitched ? T.TONE : T.AIR;
    }
    _backfill(from, tag) {
      if (from == null) return;
      for (let k = Math.max(from, this.total - this.n); k < this.total; k++) this.tags[k % this.n] = tag;
    }
    _startRun(start) {
      this.run = { start, len: this.t - start, midis: [], lo: Infinity, hi: -Infinity, tag: null, bestBefore: this.best };
    }
    _endRun(end, kind, tag) {
      const r = this.run;
      this.run = null;
      if (!r) return;
      // The flutter is measured over 0.4 s of envelope and confirmed over
      // 0.2 s more, so it is heard to stop about half a second after the lips
      // did. Date the stall from when they stopped, in the history too.
      if (kind === "stall" && r.tag != null && r.tag !== tag) {
        const lag = Math.min(STALL_LAG, Math.max(0, end - r.start - 0.1));
        if (lag > 0) {
          end -= lag;
          const k0 = Math.max(this.total - this.n, Math.floor(end * this.hz));
          for (let k = k0; k < this.total; k++) {
            const i = k % this.n;
            if (this.isOn(this.tags[i])) this.tags[i] = tag;
          }
          this.sec[r.tag] = Math.max(0, this.sec[r.tag] - lag);
          this.sec[tag] += lag;
          this.onSec = Math.max(0, this.onSec - lag);
          this.best = Math.max(r.bestBefore, end - r.start);
        }
      }
      const len = Math.max(0, end - r.start);
      const rec = { start: r.start, end, len, kind, midi: r.midis.length ? F.median(r.midis) : null };
      this.runs.push(rec);
      if (this.runs.length > 400) this.runs.shift();
      // A stall worth naming: the asked-for sound held a moment, then its
      // flutter (or tone) went while you were still sounding
      if (kind === "stall" && len >= 0.4) {
        this.stalls.push({ t: end, midi: this.smoothMidi, tag });
        if (this.stalls.length > 200) this.stalls.shift();
      }
    }
    /** Pitched samples of the last `sec` seconds, for a steady picture centre. */
    tagAt(k) {
      return this.tags[k % this.n];
    }
    midiAt(k) {
      return this.midis[k % this.n];
    }
  }

  /* —— Holds of air (SH, S) or voice (/A/) —— */

  /**
   * One continuous hold of a sound, with the same gate the old counters used
   * (four frames to start, so a click does not count; a short hold-off so a
   * flicker of the detector does not end it) and the level trace inside it:
   * dB against the hold's own median, which a phone at arm's length and a
   * headset can both show honestly.
   * feed(dt, present, assisted, db) → the current hold length in seconds.
   */
  class HoldTrack {
    constructor(opts = {}) {
      this.onsetFrames = opts.onsetFrames || 4;
      this.holdOffSec = opts.holdOffSec || 0.27;
      this.hz = 30;
      this.reset();
    }
    reset() {
      this.t = 0;
      this.cur = 0;
      this._onset = 0;
      this._off = 0;
      this.hold = null;
      this.last = null;
      this.holds = [];
      this.best = 0;
      this.bestHold = null;
      this._sdb = null;
    }
    get active() {
      return !!this.hold;
    }
    /**
     * @param {number} dt seconds
     * @param {boolean} present the sound is there this frame (no grace)
     * @param {boolean} assisted Space held (manual assist): counted, drawn apart
     * @param {number|null} db level this frame in dBFS, or null
     */
    feed(dt, present, assisted, db) {
      this.t += dt;
      let on;
      if (assisted) {
        this._onset = this.onsetFrames + 1;
        this._off = this.holdOffSec;
        on = true;
      } else if (present) {
        this._onset++;
        if (this._onset >= this.onsetFrames) this._off = this.holdOffSec;
        on = this._onset >= this.onsetFrames || this._off > 0;
      } else {
        this._onset = 0;
        if (this._off > 0) this._off -= dt;
        on = this._off > 0;
      }
      if (db != null && Number.isFinite(db)) {
        const a = 1 - Math.exp(-dt / 0.08);
        this._sdb = this._sdb == null ? db : this._sdb + a * (db - this._sdb);
      }
      if (on) {
        if (!this.hold) {
          this.hold = {
            start: this.t - dt,
            len: 0,
            lastPresent: this.t,
            samples: [],
            gaps: [],
            assistSec: 0,
            _acc: 0,
            _gapFrom: null,
            ref: null
          };
        }
        const h = this.hold;
        this.cur += dt;
        h.len = this.cur;
        if (assisted) h.assistSec += dt;
        if (present || assisted) {
          if (h._gapFrom != null && this.t - h._gapFrom >= 0.12) {
            h.gaps.push({ t: h._gapFrom - h.start, len: this.t - h._gapFrom });
          }
          h._gapFrom = null;
          h.lastPresent = this.t;
        } else if (h._gapFrom == null) h._gapFrom = this.t - dt;
        h._acc += dt * this.hz;
        while (h._acc >= 1) {
          h._acc -= 1;
          h.samples.push({
            t: this.t - h.start,
            db: present && !assisted && this._sdb != null ? this._sdb : NaN,
            assisted: !!assisted,
            gap: !present && !assisted
          });
        }
        // The hold's own reference level: median from 0.4 s on
        if (h.samples.length % 6 === 0) {
          const vals = [];
          for (const s of h.samples) if (s.t >= 0.4 && Number.isFinite(s.db)) vals.push(s.db);
          if (vals.length >= 8) h.ref = F.median(vals);
        }
        if (this.cur > this.best) {
          this.best = Math.max(this.best, h.lastPresent - h.start);
        }
      } else if (this.hold) {
        this._close();
      } else {
        this.cur = 0;
      }
      return this.cur;
    }
    _close() {
      const h = this.hold;
      this.hold = null;
      this.cur = 0;
      if (!h) return;
      // Its honest length ends at the last frame the sound was there
      h.len = Math.max(0, h.lastPresent - h.start);
      h.stats = holdStats(h);
      // A blip (a consonant, the breath at the end of a note) does not
      // replace the last real try
      if (h.len >= 0.5) {
        this.last = h;
        this.holds.push(h);
        if (this.holds.length > 60) this.holds.shift();
      }
      if (h.len >= this.best) {
        this.best = h.len;
        this.bestHold = h;
      }
      if (this.onClose) this.onClose(h);
    }
    /** End the hold now (Stop). */
    flush() {
      if (this.hold) this._close();
    }
    /** Drop the hold in progress without keeping it (it was something else). */
    cancel() {
      this.hold = null;
      this.cur = 0;
      this._onset = 0;
      this._off = 0;
    }
  }

  /**
   * Steadiness of one hold, from its own trace: the share of time within
   * ±3 dB of its median (after the first 0.5 s), how far the last fifth sits
   * from that median (a fading end), and the gaps inside it.
   */
  function holdStats(h) {
    const ref = h.ref;
    const body = h.samples.filter((s) => s.t >= 0.5 && Number.isFinite(s.db));
    let inBand = null;
    let endDrop = null;
    if (ref != null && body.length >= 10) {
      inBand = body.filter((s) => Math.abs(s.db - ref) <= 3).length / body.length;
      const tail = body.slice(Math.floor(body.length * 0.8));
      if (tail.length >= 4) endDrop = F.median(tail.map((s) => s.db)) - ref;
    }
    return { inBand, endDrop, gaps: h.gaps.length, assisted: h.assistSec };
  }

  /* —— Small drawing pieces —— */

  /** A tiny picture of a tag, for headlines and legends: shape, not only colour. */
  function tagIcon(ctx, tag, x, y, s, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    if (tag === T.TRILL || tag === T.AIRTRILL) {
      const n = 4;
      for (let i = 0; i <= n; i++) {
        const px = x - s + (i * 2 * s) / n;
        const py = y + (i % 2 ? -s * 0.55 : s * 0.55);
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.stroke();
    } else if (tag === T.TONE) {
      roundRect(ctx, x - s, y - 2, s * 2, 4, 2);
      ctx.fill();
    } else if (tag === T.AIR) {
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.arc(x + i * s * 0.75, y, 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.arc(x, y, s * 0.6, 0, Math.PI * 2);
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }

  /** A row of legend items: [{tag, text, color}] with their shapes. Returns its width. */
  function legend(ctx, items, x, y, maxW) {
    ctx.font = font(10, 700);
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    let cx = x;
    for (const it of items) {
      const tw = ctx.measureText(it.text).width;
      if (cx + 18 + tw > x + maxW) break;
      tagIcon(ctx, it.tag, cx + 7, y, 6, it.color);
      ctx.fillStyle = C.muted;
      ctx.fillText(it.text, cx + 16, y + 0.5);
      cx += 16 + tw + 12;
    }
    return cx - x;
  }

  /** Where "now" sits and which stretch of time is drawn. */
  function timeWindow(tNow, seconds, nowAt, review, tFirst) {
    if (review) {
      const t0 = Math.max(0, tFirst);
      return { t0, span: Math.max(4, tNow - t0), nowFrac: 1 };
    }
    if (V.reducedMotion()) {
      // A page fills left to right and then turns; nothing scrolls
      const page = seconds * nowAt;
      const t0 = tNow - (tNow % page);
      return { t0, span: seconds, nowFrac: (tNow - t0) / seconds };
    }
    return { t0: tNow - seconds * nowAt, span: seconds, nowFrac: nowAt };
  }

  /* —— The trill / straw ribbon —— */

  /**
   * The ribbon: time runs right to left past "now". Up and down is pitch
   * (the piano's notes are the green lines, the ones still to come to the
   * right of now); sounds with no pitch run along the floor lane.
   *   trill   a zig-zag at its pitch
   *   brrr    a zig-zag on the floor
   *   tone    a flat bar (thin and grey where a trill stalled; full where a
   *           tone is what is asked for)
   *   air     dots on the floor
   *   silence nothing
   * o: { seconds, nowAt, review, goal: "flutter"|"tone", span, targets,
   *      refMidi, refLabel, small }
   */
  function sovtRibbon(ctx, box, tr, o) {
    const { x, y, w, h } = box;
    const small = !!o.small;
    const floorH = clamp(h * 0.17, 11, 22);
    const plotTop = y + 4;
    const plotBot = y + h - floorH - 3;
    const floorY = y + h - floorH / 2 - 1;
    const tFirst = (tr.total - Math.min(tr.total, tr.n)) / tr.hz;
    const tw = timeWindow(tr.t, o.seconds, o.nowAt, o.review, tFirst);
    const xOf = (t) => x + ((t - tw.t0) / tw.span) * w;
    const secPerPx = tw.span / w;
    const nowX = o.review ? x + w : xOf(tr.t);
    let center = tr.center;
    if (center == null) center = o.targets && o.targets.length ? o.targets[o.targets.length - 1].midi : 55;
    const span = o.span || 14;
    const yOfMidi = (m) =>
      clamp(plotTop + (plotBot - plotTop) * (0.5 - (m - center) / span), plotTop + 4, plotBot - 4);

    // Plot and floor lane
    ctx.fillStyle = "rgba(170, 195, 230, 0.05)";
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(159, 134, 255, 0.07)";
    roundRect(ctx, x, y + h - floorH - 1, w, floorH + 1, 6);
    ctx.fill();
    if (!o.review && nowX < x + w) {
      ctx.fillStyle = "rgba(143, 211, 255, 0.045)";
      ctx.fillRect(nowX, y, x + w - nowX, h - floorH - 1);
    }

    // The piano's notes: past dim, the current one bright, the next ones ahead
    (o.targets || []).forEach((g) => {
      const t1 = g.t1 == null ? tr.t + (o.review ? 0 : tw.span) : g.t1;
      const xa = Math.max(x, xOf(g.t0));
      const xb = Math.min(x + w, xOf(t1));
      if (xb <= xa + 1) return;
      const yy = yOfMidi(foldTo(g.midi, center));
      const ahead = g.t0 > tr.t;
      ctx.save();
      ctx.strokeStyle = C.target;
      ctx.lineWidth = ahead ? 2 : 3;
      ctx.globalAlpha = o.review ? 0.4 : ahead ? 0.65 : g.t1 != null && g.t1 < tr.t ? 0.3 : 0.9;
      if (ahead) ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(xa, yy);
      ctx.lineTo(xb, yy);
      ctx.stroke();
      ctx.restore();
      if (!o.review && g.name && (ahead || (t1 > tr.t && g.t0 <= tr.t))) {
        const lx = ahead ? xa + 3 : Math.max(xa, nowX) + 6;
        if (lx < x + w - 22) {
          ctx.font = font(small ? 10 : 11, 800);
          ctx.fillStyle = C.target;
          ctx.globalAlpha = ahead ? 0.8 : 1;
          ctx.textAlign = "left";
          ctx.textBaseline = "bottom";
          ctx.fillText(g.name, lx, yy - 3, Math.max(24, xb - lx - 2));
          ctx.globalAlpha = 1;
        }
      }
    });
    // Your trill's note, for the /A/ that follows it
    if (o.refMidi != null) {
      const yy = yOfMidi(foldTo(o.refMidi, center));
      ctx.save();
      ctx.strokeStyle = C.target;
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(x, yy);
      ctx.lineTo(x + w, yy);
      ctx.stroke();
      ctx.restore();
      if (o.refLabel && !small) {
        ctx.font = font(10, 800);
        ctx.fillStyle = C.target;
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        ctx.fillText(o.refLabel, x + w - 4, yy - 3);
      }
    }

    // Your sound, run by run
    const hz = tr.hz;
    const kLo = Math.max(tr.total - tr.n, Math.floor(tw.t0 * hz) - 1, 0);
    const kHi = tr.total;
    const amp = clamp(h * 0.055, 2.5, 7);
    const dz = Math.max(1 / hz, 3.5 * secPerPx); // zig-zag vertex spacing, in seconds
    const midY = (k, lastY) => {
      const m = tr.midiAt(k);
      return Number.isFinite(m) ? yOfMidi(m) : lastY != null ? lastY : (plotTop + plotBot) / 2;
    };
    let runStart = kLo;
    let lastY = null;
    let nowY = null;
    const drawRun = (k0, k1, tag) => {
      if (k1 <= k0 || tag === T.SIL) return;
      const tA = k0 / hz;
      const tB = k1 / hz;
      const xa = Math.max(x, xOf(tA));
      const xb = Math.min(nowX, xOf(tB));
      if (xb <= xa) return;
      const onFloor = tag === T.AIRTRILL || tag === T.AIR;
      // Start each run at its own first pitch, not where the last one ended
      lastY = null;
      for (let k = k0; k < k1; k++) {
        const m0 = tr.midiAt(k);
        if (Number.isFinite(m0)) {
          lastY = yOfMidi(m0);
          break;
        }
      }
      const yAt = (t) => {
        if (onFloor) return floorY;
        const k = clamp(Math.floor(t * hz), k0, k1 - 1);
        const yy = midY(k, lastY);
        lastY = yy;
        return yy;
      };
      ctx.save();
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      if (tag === T.TRILL || tag === T.AIRTRILL) {
        ctx.strokeStyle = tag === T.TRILL ? C.you : C.air;
        ctx.lineWidth = small ? 2 : 2.4;
        ctx.beginPath();
        let started = false;
        const j0 = Math.ceil(tA / dz);
        const j1 = Math.floor(tB / dz);
        const a = tag === T.AIRTRILL ? amp * 0.8 : amp;
        for (let j = j0; j <= j1; j++) {
          const t = j * dz;
          const px = xOf(t);
          if (px < x - 4 || px > nowX + 0.5) continue;
          const py = yAt(t) + (j % 2 ? -a : a);
          if (started) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
          started = true;
        }
        ctx.stroke();
      } else if (tag === T.TONE || tag === T.PEND) {
        const full = tag === T.TONE && o.goal === "tone";
        ctx.strokeStyle = tag === T.PEND ? C.faint : full ? C.you : C.muted;
        ctx.lineWidth = tag === T.PEND ? 1.5 : full ? (small ? 4 : 5) : 2;
        ctx.beginPath();
        let started = false;
        const step = Math.max(1 / hz, 2 * secPerPx);
        for (let t = tA; t <= tB + 1e-6; t += step) {
          const px = clamp(xOf(t), x, nowX);
          const py = tag === T.PEND && !Number.isFinite(tr.midiAt(Math.floor(t * hz))) ? floorY : yAt(t);
          if (started) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
          started = true;
        }
        ctx.stroke();
      } else if (tag === T.AIR) {
        ctx.fillStyle = C.air;
        const gap = small ? 6 : 7;
        const g0 = Math.ceil(tA / (gap * secPerPx));
        for (let j = g0; ; j++) {
          const px = xOf(j * gap * secPerPx);
          if (px > xb) break;
          if (px < xa) continue;
          ctx.beginPath();
          ctx.arc(px, floorY, small ? 1.6 : 2, 0, Math.PI * 2);
          ctx.fill();
        }
        // In the straw, air with no tone is the mistake worth naming
        if (o.goal === "tone" && tB - tA >= 1 && xb - xa > 60 && !small) {
          ctx.fillStyle = hatch(ctx, "rgba(159, 134, 255, 0.55)");
          roundRect(ctx, xa, floorY - floorH / 2 + 1, xb - xa, floorH - 2, 4);
          ctx.fill();
          ctx.font = font(10, 800);
          ctx.fillStyle = C.air;
          ctx.textAlign = "left";
          ctx.textBaseline = "bottom";
          ctx.fillText(L("solo aire", "air only"), xa + 2, floorY - floorH / 2 - 1);
        }
      }
      ctx.restore();
      if (k1 === kHi) nowY = onFloor ? floorY : lastY;
    };
    let prevTag = kLo < kHi ? tr.tagAt(kLo) : T.SIL;
    for (let k = kLo + 1; k <= kHi; k++) {
      const tag = k < kHi ? tr.tagAt(k) : -1;
      if (tag !== prevTag) {
        drawRun(runStart, k, prevTag);
        runStart = k;
        prevTag = tag;
      }
    }

    // The axis words, over whatever runs past them
    if (!small) {
      ctx.font = font(9, 700);
      ctx.textAlign = "left";
      const tag = (text, ty, base) => {
        ctx.textBaseline = base;
        const tw = ctx.measureText(text).width;
        const by = base === "top" ? ty : base === "bottom" ? ty - 10 : ty - 5;
        ctx.fillStyle = "rgba(11, 17, 25, 0.72)";
        ctx.fillRect(x + 2, by - 1, tw + 4, 12);
        ctx.fillStyle = C.faint;
        ctx.fillText(text, x + 4, ty);
      };
      tag(L("agudo", "higher"), plotTop, "top");
      tag(L("grave", "lower"), plotBot, "bottom");
      tag(L("sin tono", "no pitch"), floorY, "middle");
    }

    // Where the trill stopped while you kept sounding: a notch, and words
    let lastLabelX = 1e9;
    const stalls = tr.stalls;
    for (let i = stalls.length - 1; i >= 0; i--) {
      const s = stalls[i];
      const sx = xOf(s.t);
      if (sx < x || sx > nowX + 1) continue;
      const sy = Number.isFinite(s.midi) && s.midi != null ? yOfMidi(s.midi) : floorY;
      const gy = Math.max(plotTop + 6, sy - amp - 9);
      glyph(ctx, "notch", sx, gy, C.warn, small ? 5 : 6);
      const recent = o.review || tr.t - s.t < 8;
      if (!small && recent && lastLabelX - sx > 70) {
        ctx.font = font(10, 800);
        ctx.fillStyle = C.warn;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(o.stallWord || L("se paró", "stopped"), clamp(sx, x + 24, x + w - 24), gy - 6);
        lastLabelX = sx;
      }
    }

    // Now
    if (!o.review) {
      ctx.strokeStyle = "rgba(238, 243, 250, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(nowX, y + 2);
      ctx.lineTo(nowX, y + h - 2);
      ctx.stroke();
      if (tr.tag !== T.SIL && nowY != null) {
        const col = tr.tag === T.AIRTRILL || tr.tag === T.AIR ? C.air : tr.tag === T.PEND ? C.faint : C.you;
        ctx.fillStyle = "rgba(191, 230, 255, 0.16)";
        ctx.beginPath();
        ctx.arc(nowX, nowY, 10, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(nowX, nowY, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    return { nowX, yOfMidi, center };
  }

  /* —— Lip trills / straw: the whole picture —— */

  /**
   * model: {
   *   track       TrillTrack
   *   straw       true for the straw (a tone is the goal, air alone is the slip)
   *   step        "flow" | "vowel" (after "Paso a /A/": a tone on the trill's note)
   *   review      after Stop: the whole take, with its numbers
   *   targets     [{ t0, t1, midi, name }] the piano's notes (t1 null = still sounding)
   *   refMidi     the trill's (or straw's) note, for the /A/ step
   *   match       { sec, diff } how the /A/ sits against it
   * }
   */
  function sovt(ctx, w, h, m) {
    panel(ctx, w, h);
    const tr = m.track;
    const pad = 10;
    const tiny = h < 135;
    const compact = h < 190;
    const narrow = w < 420;
    const words = sovtWords(m);

    // Headline: the state in words, with its shape; the run on the right
    const headY = tiny ? 12 : 17;
    const bigW = narrow ? 76 : 110;
    tagIcon(ctx, words.icon, pad + 9, headY, 7, words.iconColor);
    ctx.fillStyle = words.color || C.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    fitText(ctx, words.head, pad + 22, headY, w - pad * 2 - 22 - bigW, tiny ? 13 : narrow ? 14 : 16, 800, 10);
    ctx.textAlign = "right";
    ctx.fillStyle = C.text;
    ctx.font = font(tiny ? 17 : 22, 800, true);
    ctx.fillText(words.big, w - pad, headY + 1);
    if (!tiny && words.bigCap) {
      ctx.font = font(10, 700);
      ctx.fillStyle = C.muted;
      ctx.textBaseline = "top";
      ctx.fillText(words.bigCap, w - pad, headY + 13);
    }

    let top = headY + (tiny ? 12 : 30);
    // Steps, as a checklist the microphone fills in (nothing ever empties)
    if (!compact) {
      const chipH = narrow ? 34 : 36;
      const cur = m.review ? -1 : sovtCurrent(m);
      // A narrow panel names the other steps by their short names
      const steps = sovtSteps(m).map((s, i) => (narrow && i !== cur ? Object.assign({}, s, { label: s.short }) : s));
      chips(ctx, { x: pad, y: top, w: w - pad * 2, h: chipH }, steps, { current: cur });
      top += chipH + 8;
    }
    // On a narrow, tall panel the numbers get their own line above the legend
    const twoLines = narrow && !compact;
    const legendH = tiny ? 0 : twoLines ? 34 : 16;
    const ribbonBox = { x: pad, y: top, w: w - pad * 2, h: Math.max(40, h - top - pad - legendH) };
    sovtRibbon(ctx, ribbonBox, tr, {
      seconds: narrow ? 8 : compact ? 10 : 12,
      nowAt: 0.72,
      review: m.review,
      goal: m.straw || m.step === "vowel" ? "tone" : "flutter",
      span: tiny ? 10 : compact ? 12 : 14,
      targets: m.targets,
      refMidi: m.step === "vowel" ? m.refMidi : null,
      refLabel: m.straw ? L("tu nota en la pajita", "your straw note") : L("tu nota en el trino", "your trill note"),
      small: tiny,
      stallWord: m.straw ? L("sin tono", "no tone") : L("se paró", "stopped")
    });
    if (!tiny) {
      const ly = h - pad - 5;
      const items = m.straw
        ? [
            { tag: T.TONE, text: L("tono", "tone"), color: C.you },
            { tag: T.AIR, text: L("solo aire", "air only"), color: C.air },
            { tag: T.TRILL, text: L("burbujas", "bubbles"), color: C.you }
          ]
        : [
            { tag: T.TRILL, text: L("burbujeo", "bubbling"), color: C.you },
            { tag: T.AIRTRILL, text: narrow ? "brrr" : L("brrr sin voz", "brrr, no voice"), color: C.air },
            { tag: T.TONE, text: narrow ? L("sin burbuja", "no bubble") : L("tono sin burbuja", "tone, no bubble"), color: C.muted }
          ];
      const used = legend(ctx, items, pad + 2, ly, w - pad * 2 - (narrow ? 0 : 170));
      const tail = sovtTail(m);
      ctx.font = font(twoLines ? 12 : 10, 700);
      ctx.fillStyle = twoLines ? C.text : C.muted;
      ctx.textBaseline = "middle";
      if (twoLines) {
        ctx.textAlign = "left";
        ctx.fillText(tail, pad + 2, ly - 17, w - pad * 2);
      } else if (!narrow || used < w * 0.45) {
        ctx.textAlign = "right";
        ctx.fillText(tail, w - pad, ly + 0.5, Math.max(80, w - pad * 2 - used - 8));
      }
    }
  }

  function sovtCurrent(m) {
    const tr = m.track;
    if (m.step === "vowel") return 2;
    if (m.straw) return tr.sec[T.TONE] + tr.sec[T.TRILL] >= 5 ? 1 : 0;
    return tr.sec[T.TRILL] > 0.5 || tr.tag === T.TRILL ? 1 : 0;
  }

  function sovtSteps(m) {
    const tr = m.track;
    const sec = (s) => (s > 0.05 ? fmtSec(s, s >= 10 ? 0 : 1) : "—");
    const match = m.match || { sec: 0 };
    if (m.straw) {
      const tone = tr.sec[T.TONE] + tr.sec[T.TRILL];
      const range = tr.bestRange;
      return [
        { label: L("1 · Tono en la pajita", "1 · Tone in the straw"), short: L("1 · Tono", "1 · Tone"), sub: sec(tone), done: tone >= 5 },
        {
          label: L("2 · Desliza", "2 · Glide"),
          short: L("2 · Desliza", "2 · Glide"),
          sub: range >= 0.5 ? L(`${fmtNum(range, 0)} semitonos`, `${fmtNum(range, 0)} semitones`) : "—",
          done: range >= 4
        },
        {
          label: L("3 · /u/ → /A/ sin pajita", "3 · /u/ → /A/, no straw"),
          short: "3 · /A/",
          sub: match.sec > 0.05 ? L("misma nota ", "same note ") + fmtSec(match.sec, 1) : m.step === "vowel" ? L("canta", "sing") : "—",
          done: match.sec >= 1.5
        }
      ];
    }
    const brrr = tr.sec[T.AIRTRILL];
    const trill = tr.sec[T.TRILL];
    return [
      { label: L("1 · Brrr sin voz", "1 · Brrr, no voice"), short: "1 · Brrr", sub: sec(brrr), done: brrr >= 3 },
      { label: L("2 · Trino con voz", "2 · Trill with voice"), short: L("2 · Trino", "2 · Trill"), sub: sec(trill), done: trill >= 5 },
      {
        label: L("3 · /A/ en la misma nota", "3 · /A/ on the same note"),
        short: "3 · /A/",
        sub: match.sec > 0.05 ? L("misma nota ", "same note ") + fmtSec(match.sec, 1) : m.step === "vowel" ? L("canta", "sing") : "—",
        done: match.sec >= 1.5
      }
    ];
  }

  /** The headline, the big number and the icon for the state now. */
  function sovtWords(m) {
    const tr = m.track;
    const run = tr.runLen;
    const out = {
      icon: tr.tag,
      iconColor: C.you,
      head: "",
      big: fmtSec(run, 1),
      bigCap: m.straw || m.step === "vowel" ? L("tono seguido", "steady tone") : L("burbujeo seguido", "unbroken trill")
    };
    if (m.review) {
      const on = tr.onSec;
      const snd = tr.soundSec;
      const pct = snd > 0.5 ? Math.round((on / snd) * 100) : 0;
      out.icon = m.straw ? T.TONE : T.TRILL;
      out.head = m.straw
        ? L(`Tono por la pajita: ${fmtClock(on)} de ${fmtClock(snd)} con sonido`, `Tone through the straw: ${fmtClock(on)} of ${fmtClock(snd)} sounding`)
        : L(`Burbujeo: ${fmtClock(on)} de ${fmtClock(snd)} con sonido`, `Bubbling: ${fmtClock(on)} of ${fmtClock(snd)} sounding`);
      out.big = snd > 0.5 ? `${pct} %` : "—";
      out.bigCap = L("del tiempo con sonido", "of the sounding time");
      return out;
    }
    const tag = tr.tag;
    out.iconColor = tag === T.AIR || tag === T.AIRTRILL ? C.air : tag === T.TONE && !(m.straw || m.step === "vowel") ? C.muted : C.you;
    if (m.step === "vowel") {
      if (tag === T.TONE || (m.straw && tag === T.TRILL)) {
        const d = m.match && m.match.diff;
        if (d == null) out.head = L("/A/ abierta…", "Open /A/…");
        else if (m.match.ok) out.head = L("/A/ en la misma nota ✓", "/A/ on the same note ✓");
        else out.head = d > 0 ? L("/A/ un poco más aguda que tu nota ↓", "/A/ a little above your note ↓") : L("/A/ un poco más grave que tu nota ↑", "/A/ a little below your note ↑");
      } else if (tag === T.TRILL || tag === T.AIRTRILL) out.head = L("Aún en trino: abre a /A/", "Still trilling: open to /A/");
      else if (tag === T.AIR) out.head = L("Solo aire: canta la /A/", "Air only: sing the /A/");
      else if (tag === T.PEND) out.head = L("Escuchando…", "Listening…");
      else out.head = m.straw ? L("Sin pajita: /u/ y luego /A/ en tu nota", "No straw: /u/ then /A/ on your note") : L("Respira y canta /A/ en la nota del trino", "Breathe, then sing /A/ on the trill's note");
      return out;
    }
    if (m.straw) {
      if (tag === T.TONE) out.head = L("Tono por la pajita ✓", "Tone through the straw ✓");
      else if (tag === T.TRILL) out.head = L("Tono con burbujas ✓", "Tone with bubbles ✓");
      else if (tag === T.AIR) out.head = L("Solo aire: añade un tono suave", "Air only: add a soft tone");
      else if (tag === T.AIRTRILL) out.head = L("Burbujas sin tono: añade voz", "Bubbles, no tone: add voice");
      else if (tag === T.PEND) out.head = L("Escuchando…", "Listening…");
      else out.head = tr.heard ? L("Respira… y sigue por la pajita", "Breathe… and back into the straw") : L("Canta suave por la pajita", "Sing softly into the straw");
      return out;
    }
    const lastRun = tr.runs.length ? tr.runs[tr.runs.length - 1] : null;
    const stalledNow = lastRun && lastRun.kind === "stall" && tr.t - lastRun.end < 4;
    if (tag === T.TRILL) out.head = L("Burbujeo con voz ✓", "Bubbling with voice ✓");
    else if (tag === T.AIRTRILL) out.head = L("Brrr sin voz ✓", "Brrr, no voice ✓");
    else if (tag === T.TONE) {
      out.head = stalledNow
        ? L("Se paró el burbujeo: más aire, labios sueltos", "The bubble stopped: more air, loose lips")
        : L("Tono sin burbuja: suelta los labios", "Tone, no bubble: loosen the lips");
      out.color = C.warn;
    } else if (tag === T.AIR) {
      out.head = stalledNow ? L("Se paró el burbujeo: solo aire", "The bubble stopped: air only") : L("Solo aire, sin burbuja", "Air only, no bubble");
    } else if (tag === T.PEND) out.head = L("Escuchando…", "Listening…");
    else out.head = tr.heard ? L("Respira… y otra vez", "Breathe… and again") : L("Empieza con un brrr sin voz", "Start with a brrr, no voice");
    if (out.color === C.warn) out.iconColor = C.warn;
    return out;
  }

  function sovtTail(m) {
    const tr = m.track;
    const best = L("mejor ", "best ") + fmtSec(tr.best, 1);
    const n = tr.stalls.length;
    if (m.straw) {
      const air = tr.sec[T.AIR];
      return air >= 1 ? `${best} · ${L("solo aire", "air only")} ${fmtSec(air, 0)}` : best;
    }
    return `${best} · ${n} ${n === 1 ? L("parada", "stop") : L("paradas", "stops")}`;
  }

  /* —— Lip-trill scale: the strip on the pitch highway —— */

  /**
   * Drawn by the highway's overlay hook along the bottom of its plot, under
   * the notes: the same shapes as the lip-trill ribbon, lined up with the
   * highway's own history so the strip sits under the pitch it belongs to.
   * `rec` is a ring of { t (performance.now()), tag }.
   */
  function trillStrip(ctx, geo, rec, opts = {}) {
    const hist = geo.history || [];
    const n = hist.length;
    const h = opts.h || clamp(geo.graphH * 0.05, 12, 18);
    // A semitone above the bottom of the locked range (the mode leaves room
    // there under its lowest note), else along the bottom of the plot
    const m = opts.midi != null ? opts.midi : geo.rangeMinMidi != null ? geo.rangeMinMidi + 1 : null;
    const yc = m != null ? geo.midiToY(m) : geo.graphH - h / 2 - 3;
    // safeBottom (when the highway reports it) is the part the bottom rail covers
    const floor = Math.min(geo.graphH, geo.h - (geo.safeBottom || 0));
    const y = clamp(yc - h / 2, (geo.safeTop || 0) + 4, floor - h - 3);
    const x0 = geo.plotLeft;
    ctx.save();
    ctx.fillStyle = "rgba(6, 10, 16, 0.55)";
    roundRect(ctx, x0 - 4, y - 3, geo.nowX - x0 + 8, h + 6, 5);
    ctx.fill();
    if (n >= 2 && rec.length) {
      // For each history point, the tag at its time
      let j = 0;
      const tagAt = (t) => {
        while (j + 1 < rec.length && rec[j + 1].t <= t) j++;
        return rec[j].t <= t ? rec[j].tag : T.SIL;
      };
      let runX = geo.xAt(0);
      let runTag = tagAt(hist[0].t);
      const mid = y + h / 2;
      const flush = (xEnd) => {
        if (xEnd <= runX) return;
        if (runTag === T.TRILL || runTag === T.AIRTRILL) {
          ctx.strokeStyle = runTag === T.TRILL ? C.you : C.air;
          ctx.lineWidth = 2;
          ctx.beginPath();
          const step = 3.5;
          let up = Math.floor(runX / step) % 2 === 0;
          for (let px = Math.ceil(runX / step) * step, s = 0; px <= xEnd; px += step, s++) {
            const py = mid + (up ? -h * 0.32 : h * 0.32);
            if (s) ctx.lineTo(px, py);
            else ctx.moveTo(px, py);
            up = !up;
          }
          ctx.stroke();
        } else if (runTag === T.TONE) {
          ctx.fillStyle = C.muted;
          roundRect(ctx, runX, mid - 1.5, Math.max(2, xEnd - runX), 3, 1.5);
          ctx.fill();
        } else if (runTag === T.AIR) {
          ctx.fillStyle = C.air;
          for (let px = runX + 3; px < xEnd; px += 7) {
            ctx.beginPath();
            ctx.arc(px, mid, 1.7, 0, Math.PI * 2);
            ctx.fill();
          }
        } else if (runTag === T.PEND) {
          ctx.fillStyle = C.faint;
          ctx.fillRect(runX, mid - 0.75, xEnd - runX, 1.5);
        }
      };
      for (let i = 1; i < n; i++) {
        const tg = tagAt(hist[i].t);
        if (tg !== runTag) {
          const xx = geo.xAt(i);
          flush(xx);
          runX = xx;
          runTag = tg;
        }
      }
      flush(geo.xAt(n - 1));
      // Where the bubble stopped mid-sound
      (opts.stalls || []).forEach((s) => {
        if (s.t < hist[0].t || s.t > hist[n - 1].t) return;
        let k = 0;
        while (k + 1 < n && hist[k + 1].t <= s.t) k++;
        glyph(ctx, "notch", geo.xAt(k), y - 4, C.warn, 5);
      });
    }
    // Its name sits just past "now", where the strip ends
    ctx.font = font(10, 800);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = C.muted;
    const lx = geo.nowX + 8;
    if (lx < geo.laneRight - 30) ctx.fillText(opts.label || L("burbujeo", "bubbling"), lx, y + h / 2, geo.laneRight - lx - 4);
    ctx.restore();
  }

  /**
   * The lip-trill scale under the highway: one row per pattern, one stone
   * per note (DO RE MI FA SOL FA MI RE DO). A stone the bubble carried is a
   * zig-zag; one where the lips stopped is flat with a notch; one sung with
   * no bubble is flat; one not sung yet is an outline. The stone being sung
   * fills green as its note is held. After Stop, the rows are the review.
   * model: { patterns: [{ rootName, stones: [{ state: "trill"|"stall"|"tone"|"todo"|"now", frac, trilling }] }],
   *          degrees, review, summary }
   */
  function trillMap(ctx, w, h, m) {
    panel(ctx, w, h);
    const pad = 8;
    const headH = 20;
    const labelW = Math.min(58, Math.max(40, w * 0.12));
    const avail = h - pad * 2 - headH;
    const maxRows = Math.max(1, Math.floor(avail / 24));
    const rows = m.patterns.slice(-maxRows);
    const rowH = Math.min(32, avail / Math.max(1, rows.length));
    const n = m.degrees.length;
    const stoneW = (w - pad * 2 - labelW) / n;
    ctx.fillStyle = m.review ? C.text : C.muted;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    fitText(ctx, m.summary || "", pad, pad + 8, w - pad * 2, 12, 800, 9);
    rows.forEach((row, ri) => {
      const ry = pad + headH + ri * rowH;
      const isCur = !m.review && ri === rows.length - 1;
      ctx.fillStyle = isCur ? C.text : C.muted;
      ctx.font = font(11, 800);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(row.rootName, pad, ry + rowH / 2, labelW - 4);
      row.stones.forEach((s, i) => {
        const sx = pad + labelW + i * stoneW + 1.5;
        const sw = stoneW - 3;
        const sh = rowH - 5;
        const top = ry + 2.5;
        const cy = top + sh / 2 + (sh >= 20 ? 3 : 0);
        const now = s.state === "now";
        ctx.save();
        ctx.fillStyle = s.state === "trill" ? "rgba(191, 230, 255, 0.10)" : "rgba(170, 195, 230, 0.05)";
        roundRect(ctx, sx, top, sw, sh, 5);
        ctx.fill();
        if (now && s.frac > 0) {
          ctx.save();
          roundRect(ctx, sx, top, sw, sh, 5);
          ctx.clip();
          ctx.fillStyle = C.targetSoft;
          ctx.fillRect(sx, top, sw * clamp(s.frac, 0, 1), sh);
          ctx.restore();
        }
        ctx.lineWidth = now ? 2 : 1;
        ctx.strokeStyle = now ? C.text : s.state === "todo" ? C.grid : "rgba(170, 195, 230, 0.22)";
        if (s.state === "todo") ctx.setLineDash([3, 3]);
        roundRect(ctx, sx + 0.5, top + 0.5, sw - 1, sh - 1, 5);
        ctx.stroke();
        ctx.setLineDash([]);
        const zig = s.state === "trill" || (now && s.trilling);
        if (zig) {
          ctx.strokeStyle = C.you;
          ctx.lineWidth = 1.8;
          ctx.lineJoin = "round";
          ctx.beginPath();
          const end = sx + sw - 4;
          let up = true;
          ctx.moveTo(sx + 4, cy);
          for (let px = sx + 6.5; px <= end; px += 3.5) {
            ctx.lineTo(px, cy + (up ? -1 : 1) * Math.min(4, sh * 0.2));
            up = !up;
          }
          ctx.stroke();
        } else if (s.state === "stall" || s.state === "tone") {
          ctx.fillStyle = C.muted;
          roundRect(ctx, sx + 4, cy - 1.5, sw - 8, 3, 1.5);
          ctx.fill();
          if (s.state === "stall") glyph(ctx, "notch", sx + sw - 9, cy - 6, C.warn, 4);
        }
        ctx.restore();
        if (sw > 22 && sh >= 20) {
          ctx.font = font(8, 700);
          ctx.fillStyle = C.faint;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(String(m.degrees[i]), sx + sw / 2, top + 2, sw - 2);
        }
      });
    });
  }

  /* —— Holds on a seconds axis: the SH ladder, and S then /A/ —— */

  /** A round end for a seconds axis: 6, 8, 10, 12, 15, 20, 25, 30, 40… */
  function niceSec(s) {
    const steps = [6, 8, 10, 12, 15, 20, 25, 30, 35, 40, 50, 60, 75, 90, 120];
    for (const v of steps) if (s <= v) return v;
    return Math.ceil(s / 30) * 30;
  }

  /**
   * One hold as a bar along a seconds axis. Inside it, the level against
   * the hold's own median: a line, with the ±3 dB corridor shaded (the
   * microphone's level, not air flow, so it is labelled approximate). Gaps
   * are breaks; Space-assisted stretches are hatched.
   * o: { x0, pps (px per second), y, h, color, soft, ghost, maxX }
   */
  function holdBar(ctx, hold, o) {
    if (!hold) return;
    const { x0, pps, y, h } = o;
    const len = Math.max(0, hold.len);
    const xEnd = Math.min(o.maxX || Infinity, x0 + len * pps);
    const r = Math.min(6, h / 2);
    if (xEnd - x0 < 1) return;
    if (o.ghost) {
      ctx.save();
      ctx.strokeStyle = o.color;
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      roundRect(ctx, x0 + 0.5, y + 0.5, xEnd - x0 - 1, h - 1, r);
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.save();
    ctx.fillStyle = o.soft;
    roundRect(ctx, x0, y, xEnd - x0, h, r);
    ctx.fill();
    roundRect(ctx, x0, y, xEnd - x0, h, r);
    ctx.clip();
    const mid = y + h / 2;
    const k = (h / 2 - 2) / 6; // px per dB: ±6 dB fills the bar
    ctx.fillStyle = "rgba(238, 243, 250, 0.07)";
    ctx.fillRect(x0, mid - 3 * k, xEnd - x0, 6 * k);
    // Space-assisted stretches
    const S = hold.samples || [];
    let a0 = null;
    const flushAssist = (t1) => {
      if (a0 == null) return;
      ctx.fillStyle = hatch(ctx, "rgba(238, 243, 250, 0.4)");
      ctx.fillRect(x0 + a0 * pps, y, Math.max(2, (t1 - a0) * pps), h);
      a0 = null;
    };
    for (const s of S) {
      if (s.assisted && a0 == null) a0 = s.t - 1 / 30;
      else if (!s.assisted) flushAssist(s.t);
    }
    flushAssist(len);
    // The level line
    ctx.strokeStyle = o.color;
    ctx.lineWidth = h >= 26 ? 2 : 1.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    let pen = false;
    const ref = hold.ref;
    for (const s of S) {
      if (!Number.isFinite(s.db) || ref == null) {
        pen = false;
        continue;
      }
      const px = x0 + s.t * pps;
      const py = mid - clamp((s.db - ref) * k, -h / 2 + 1.5, h / 2 - 1.5);
      if (pen) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
      pen = true;
    }
    if (ref == null) {
      // Not enough of it yet to have its own level: a plain centre line
      ctx.moveTo(x0 + 2, mid);
      ctx.lineTo(xEnd - 2, mid);
    }
    ctx.stroke();
    ctx.restore();
    // Gaps: the bar is cut where the sound was not there
    (hold.gaps || []).forEach((g) => {
      const ga = x0 + g.t * pps;
      const gb = Math.min(xEnd, ga + g.len * pps);
      if (gb - ga < 1) return;
      ctx.fillStyle = C.bg;
      ctx.fillRect(ga, y - 1, Math.max(2, gb - ga), h + 2);
      ctx.strokeStyle = C.muted;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ga, y + h / 2);
      ctx.lineTo(gb, y + h / 2);
      ctx.stroke();
      if (o.words !== false && h >= 20) {
        ctx.font = font(9, 800);
        ctx.fillStyle = C.muted;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(L("hueco", "gap"), (ga + gb) / 2, y - 2);
      }
    });
  }

  /** Seconds along the bottom of an axis, with the rungs (or marks) as ticks. */
  function secAxis(ctx, x0, pps, y, maxSec, w, ticks) {
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x0 + maxSec * pps, y);
    ctx.stroke();
    ctx.font = font(9, 700);
    ctx.fillStyle = C.faint;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    let lastX = -1e9;
    (ticks || []).forEach((t) => {
      const x = x0 + t * pps;
      if (t > maxSec + 0.01 || x - lastX < 26) return;
      ctx.beginPath();
      ctx.moveTo(x, y - 3);
      ctx.lineTo(x, y + 3);
      ctx.stroke();
      ctx.fillText(fmtNum(t, 0) + " s", clamp(x, x0 + 8, x0 + w - 12), y + 4);
      lastX = x;
    });
  }

  /**
   * The SH ladder.
   * model: { track (HoldTrack), rungs, cleared, i (target rung), rest (s left),
   *          assisted (Space now), review, justCleared (rung seconds or null) }
   */
  function ladder(ctx, w, h, m) {
    panel(ctx, w, h);
    const tr = m.track;
    const pad = 10;
    const tiny = h < 135;
    const compact = h < 190;
    const narrow = w < 420;
    const rungs = m.rungs;
    const target = rungs[Math.min(m.i, rungs.length - 1)];
    const hold = tr.hold;
    const last = tr.last;

    // Headline and the big number
    let head;
    let big;
    let cap;
    let color = C.text;
    let icon = null;
    if (m.review) {
      head = L(
        `Escalera: ${m.cleared} de ${rungs.length} peldaños · mejor ${fmtSec(tr.best, 1)}`,
        `Ladder: ${m.cleared} of ${rungs.length} rungs · best ${fmtSec(tr.best, 1)}`
      );
      big = fmtSec(tr.best, 1);
      cap = L("SH más larga", "longest SH");
    } else if (hold) {
      head = m.assisted ? L("Contando con Espacio", "Counting with Space") : L("SH sonando", "SH sounding");
      icon = "air";
      big = fmtSec(hold.len, 1);
      cap = L(`meta ${fmtNum(target, 0)} s`, `goal ${fmtNum(target, 0)} s`);
      if (hold.len >= target && m.cleared > 0) {
        head = L(`Peldaño ${fmtNum(target, 0)} s ✓ · sigue si es cómodo`, `${fmtNum(target, 0)} s rung ✓ · go on if it's easy`);
        color = C.done;
      }
    } else if (m.justCleared != null) {
      head = L(`Peldaño ${fmtNum(m.justCleared, 0)} s ✓`, `${fmtNum(m.justCleared, 0)} s rung ✓`);
      color = C.done;
      big = m.rest > 0 ? String(Math.ceil(m.rest)) : fmtSec(last ? last.len : 0, 1);
      cap = m.rest > 0 ? L("descansa e inhala", "rest and inhale") : L("última", "last");
    } else if (m.rest > 0) {
      head = L("Descansa · inhala por la nariz", "Rest · breathe in through the nose");
      big = String(Math.ceil(m.rest));
      cap = L("descanso", "rest");
    } else {
      head = last
        ? L(`Cuando quieras: SH pareja, meta ${fmtNum(target, 0)} s`, `When ready: even SH, goal ${fmtNum(target, 0)} s`)
        : L("Inhala por la nariz… y una SH pareja", "Breathe in through the nose… then an even SH");
      big = fmtSec(last ? last.len : 0, 1);
      cap = last ? L("última", "last") : L(`meta ${fmtNum(target, 0)} s`, `goal ${fmtNum(target, 0)} s`);
    }
    const headY = tiny ? 12 : 17;
    const bigW = narrow ? 80 : 120;
    if (icon) tagIcon(ctx, T.AIR, pad + 9, headY, 7, C.air);
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    fitText(ctx, head, pad + (icon ? 22 : 0), headY, w - pad * 2 - (icon ? 22 : 0) - bigW, tiny ? 13 : narrow ? 14 : 16, 800, 10);
    ctx.textAlign = "right";
    ctx.fillStyle = C.text;
    ctx.font = font(tiny ? 17 : 22, 800, true);
    ctx.fillText(big, w - pad, headY + 1);
    if (!tiny) {
      ctx.font = font(10, 700);
      ctx.fillStyle = C.muted;
      ctx.textBaseline = "top";
      ctx.fillText(cap, w - pad, headY + 13);
    }
    let top = headY + (tiny ? 12 : 30);

    // The rungs, as a checklist the microphone fills in
    if (!compact) {
      const chipH = 34;
      const items = rungs.map((r, k) => ({
        label: `${fmtNum(r, 0)} s`,
        short: fmtNum(r, 0),
        sub: k < m.cleared ? "" : k === m.i && !m.review ? L("meta", "goal") : "",
        done: k < m.cleared
      }));
      chips(ctx, { x: pad, y: top, w: w - pad * 2, h: chipH }, items, { current: m.review ? -1 : Math.min(m.i, rungs.length - 1) });
      top += chipH + 10;
    }

    const legendH = tiny ? 0 : 16;
    const areaX = pad + (narrow ? 2 : 6);
    const areaW = w - pad * 2 - (narrow ? 4 : 12);
    const areaTop = top;
    const areaBot = h - pad - legendH - (tiny ? 0 : 14);

    if (m.review) {
      ladderReview(ctx, { x: areaX, y: areaTop, w: areaW, h: areaBot - areaTop }, m);
    } else {
      // One attempt at a time, against the goal
      const cur = hold ? hold.len : 0;
      const maxSec = niceSec(Math.max(target * 1.1, cur * 1.08, last ? last.len * 1.05 : 0, 6));
      const pps = areaW / maxSec;
      const barH = clamp((areaBot - areaTop) * 0.36, 16, 96);
      const barY = areaTop + (areaBot - areaTop - barH) / 2 + (tiny ? 0 : 4);
      // Rung lines behind the bar; the goal as a green flag
      rungs.forEach((r, k) => {
        if (r > maxSec) return;
        const x = areaX + r * pps;
        const isGoal = k === Math.min(m.i, rungs.length - 1);
        ctx.strokeStyle = isGoal ? C.target : k < m.cleared ? "rgba(255, 211, 110, 0.45)" : C.grid;
        ctx.lineWidth = isGoal ? 2 : 1;
        ctx.setLineDash(isGoal ? [] : [3, 4]);
        ctx.beginPath();
        ctx.moveTo(x, areaTop + (tiny ? 0 : 8));
        ctx.lineTo(x, areaBot);
        ctx.stroke();
        ctx.setLineDash([]);
        if (isGoal) {
          glyph(ctx, "flag", x, areaTop + (tiny ? 5 : 12), C.target, tiny ? 4 : 5);
          if (!tiny) {
            ctx.font = font(10, 800);
            ctx.fillStyle = C.target;
            ctx.textAlign = x > areaX + areaW - 60 ? "right" : "left";
            ctx.textBaseline = "middle";
            ctx.fillText(L("meta", "goal"), x + (ctx.textAlign === "right" ? -6 : 9), areaTop + 10);
          }
        } else if (k < m.cleared) {
          glyph(ctx, "check", x, areaTop + (tiny ? 5 : 12), C.done, 4);
        }
      });
      // Your best, as a gold tick
      if (tr.best > 0.5 && tr.best <= maxSec) {
        const bx = areaX + tr.best * pps;
        glyph(ctx, "star", bx, barY + barH + 7, C.done, 4);
      }
      // The attempt before, as a ghost; the one now (or the last) solid
      if (hold && last) holdBar(ctx, last, { x0: areaX, pps, y: barY, h: barH, color: C.air, ghost: true });
      holdBar(ctx, hold || last, { x0: areaX, pps, y: barY, h: barH, color: C.air, soft: hold ? C.airSoft : "rgba(159, 134, 255, 0.14)" });
      if (hold) {
        const nx = areaX + Math.min(maxSec, hold.len) * pps;
        ctx.fillStyle = C.air;
        ctx.beginPath();
        ctx.arc(nx, barY + barH / 2, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      if (!tiny) secAxis(ctx, areaX, pps, areaBot + 2, maxSec, areaW, [0].concat(rungs));
    }

    // What the shapes mean, and the numbers
    if (!tiny) {
      const ly = h - pad - 5;
      let x = pad + 2;
      ctx.font = font(10, 700);
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      // corridor swatch
      ctx.fillStyle = C.airSoft;
      roundRect(ctx, x, ly - 5, 18, 10, 3);
      ctx.fill();
      ctx.strokeStyle = C.air;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + 2, ly + 1);
      ctx.lineTo(x + 6, ly - 2);
      ctx.lineTo(x + 11, ly + 2);
      ctx.lineTo(x + 16, ly - 1);
      ctx.stroke();
      ctx.fillStyle = C.muted;
      const t1 = narrow ? L("nivel ±3 dB aprox.", "level ±3 dB approx.") : L("nivel frente a tu media, ±3 dB (aprox.)", "level vs your own median, ±3 dB (approx.)");
      ctx.fillText(t1, x + 23, ly + 0.5);
      x += 23 + ctx.measureText(t1).width + 12;
      if (!narrow) {
        ctx.fillStyle = hatch(ctx, "rgba(238, 243, 250, 0.45)");
        ctx.fillRect(x, ly - 5, 14, 10);
        ctx.fillStyle = C.muted;
        ctx.fillText(L("Espacio", "Space"), x + 19, ly + 0.5);
        x += 19 + ctx.measureText(L("Espacio", "Space")).width + 12;
      }
      const tail = L(`mejor ${fmtSec(tr.best, 1)} · ${m.cleared}/${rungs.length} peldaños`, `best ${fmtSec(tr.best, 1)} · ${m.cleared}/${rungs.length} rungs`);
      if (narrow && !compact) {
        // A narrow, tall panel: the numbers get their own line above
        ctx.font = font(12, 700);
        ctx.fillStyle = C.text;
        ctx.textAlign = "left";
        ctx.fillText(tail, pad + 2, ly - 34, w - pad * 2);
      } else {
        ctx.textAlign = "right";
        if (x < w - pad - ctx.measureText(tail).width - 6) ctx.fillText(tail, w - pad, ly + 0.5);
      }
    }
  }

  /** After Stop: every attempt, one row each, on one axis with the rungs. */
  function ladderReview(ctx, box, m) {
    const tr = m.track;
    const holds = tr.holds.slice();
    if (tr.last && !holds.includes(tr.last) && tr.last.len >= 0.5) holds.push(tr.last);
    const { x, y, w, h } = box;
    if (!holds.length) {
      ctx.fillStyle = C.faint;
      ctx.font = font(12, 600);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(L("Sin SH todavía", "No SH yet"), x + w / 2, y + h / 2);
      return;
    }
    const rowH = clamp((h - 16) / Math.max(1, holds.length), 12, 40);
    const show = holds.slice(-Math.max(1, Math.floor((h - 16) / rowH)));
    const textW = w < 420 ? 0 : w < 700 ? 150 : 200;
    const numW = 18;
    const maxSec = niceSec(Math.max(...show.map((hd) => hd.len), m.rungs[Math.min(m.cleared, m.rungs.length - 1)], 6));
    const x0 = x + numW;
    const pps = (w - numW - textW) / maxSec;
    m.rungs.forEach((r, k) => {
      if (r > maxSec) return;
      const rx = x0 + r * pps;
      ctx.strokeStyle = k < m.cleared ? "rgba(255, 211, 110, 0.5)" : C.grid;
      ctx.setLineDash([3, 4]);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(rx, y);
      ctx.lineTo(rx, y + show.length * rowH);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    const first = holds.length - show.length;
    show.forEach((hd, k) => {
      const ry = y + k * rowH;
      const bh = Math.max(8, rowH - 8);
      ctx.font = font(10, 800);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(String(first + k + 1), x, ry + rowH / 2);
      holdBar(ctx, hd, { x0, pps, y: ry + (rowH - bh) / 2, h: bh, color: C.air, soft: C.airSoft, words: false });
      if (hd === tr.bestHold) glyph(ctx, "star", x0 + hd.len * pps + 8, ry + rowH / 2, C.done, 4);
      if (textW) {
        const st = hd.stats || holdStats(hd);
        let txt = fmtSec(hd.len, 1);
        if (st.inBand != null) txt += L(` · ${Math.round(st.inBand * 100)} % en ±3 dB`, ` · ${Math.round(st.inBand * 100)} % within ±3 dB`);
        if (st.gaps) txt += L(` · ${st.gaps} ${st.gaps === 1 ? "hueco" : "huecos"}`, ` · ${st.gaps} ${st.gaps === 1 ? "gap" : "gaps"}`);
        ctx.font = font(10, 700);
        ctx.fillStyle = C.muted;
        ctx.textAlign = "right";
        ctx.fillText(txt, x + w, ry + rowH / 2, textW - 6);
      }
    });
    secAxis(ctx, x0, pps, y + show.length * rowH + 2, maxSec, w - numW - textW, [0].concat(m.rungs));
  }

  /**
   * S, then /A/: two lanes on one seconds axis. The S lane holds unvoiced
   * air (violet); the /A/ lane holds a sung tone (light blue) with your best
   * S as a dashed mark to reach for. The step being asked for is outlined.
   * model: { s: HoldTrack, a: HoldTrack, step: "S"|"A", review, inhale (s left),
   *          assisted }
   */
  function breathLanes(ctx, w, h, m) {
    panel(ctx, w, h);
    const pad = 10;
    const tiny = h < 135;
    const compact = h < 190;
    const narrow = w < 420;
    const S = m.s;
    const A = m.a;
    const active = S.hold ? "S" : A.hold ? "A" : null;
    let head;
    let big;
    let cap;
    const color = C.text;
    if (m.review) {
      head = L(`S más larga ${fmtSec(S.best, 1)} · /A/ más larga ${fmtSec(A.best, 1)}`, `Longest S ${fmtSec(S.best, 1)} · longest /A/ ${fmtSec(A.best, 1)}`);
      big = fmtSec(m.step === "A" ? A.best : S.best, 1);
      cap = m.step === "A" ? L("/A/ más larga", "longest /A/") : L("S más larga", "longest S");
    } else if (active === "S") {
      head = m.assisted ? L("S · contando con Espacio", "S · counting with Space") : L("S sonando, sin voz", "S sounding, no voice");
      big = fmtSec(S.hold.len, 1);
      cap = L("S seguida", "unbroken S");
    } else if (active === "A") {
      head =
        S.best > 0.5
          ? L(`/A/ sonando · tu mejor S: ${fmtSec(S.best, 1)}`, `/A/ sounding · your best S: ${fmtSec(S.best, 1)}`)
          : L("/A/ sonando", "/A/ sounding");
      big = fmtSec(A.hold.len, 1);
      cap = L("/A/ seguida", "unbroken /A/");
    } else if (m.inhale > 0) {
      const n = clamp(4 - Math.ceil(m.inhale), 1, 3);
      head = L(`Inhala suave · ${[1, 2, 3].slice(0, n).join(" · ")}`, `Breathe in softly · ${[1, 2, 3].slice(0, n).join(" · ")}`);
      big = fmtSec((m.step === "A" ? A.last : S.last)?.len || 0, 1);
      cap = L("última", "last");
    } else {
      head =
        m.step === "A"
          ? S.best > 0.5
            ? L(`Paso 2 · /A/ tan larga y tranquila como tu S (${fmtSec(S.best, 1)})`, `Step 2 · an /A/ as long and easy as your S (${fmtSec(S.best, 1)})`)
            : L("Paso 2 · una /A/ cómoda y larga", "Step 2 · a long, easy /A/")
          : L("Paso 1 · inhala y una S larga y pareja", "Step 1 · breathe in, then a long, even S");
      big = fmtSec((m.step === "A" ? A.last : S.last)?.len || 0, 1);
      cap = L("última", "last");
    }
    const headY = tiny ? 12 : 17;
    const bigW = narrow ? 80 : 120;
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    fitText(ctx, head, pad, headY, w - pad * 2 - bigW, tiny ? 13 : narrow ? 14 : 16, 800, 10);
    ctx.textAlign = "right";
    ctx.fillStyle = C.text;
    ctx.font = font(tiny ? 17 : 22, 800, true);
    ctx.fillText(big, w - pad, headY + 1);
    if (!tiny) {
      ctx.font = font(10, 700);
      ctx.fillStyle = C.muted;
      ctx.textBaseline = "top";
      ctx.fillText(cap, w - pad, headY + 13);
    }

    const top = headY + (tiny ? 12 : compact ? 26 : 34);
    const legendH = tiny ? 0 : 16;
    const axisH = tiny ? 0 : 14;
    const bottom = h - pad - legendH - axisH;
    const labelW = narrow ? 44 : 104;
    const x0 = pad + labelW;
    const areaW = w - pad * 2 - labelW - 16;
    const cur = active === "S" ? S.hold.len : active === "A" ? A.hold.len : 0;
    const maxSec = niceSec(Math.max(S.best * 1.1, A.best * 1.1, cur * 1.08, 8));
    const pps = areaW / maxSec;
    const laneH = (bottom - top) / 2;
    const lanes = [
      { key: "S", tr: S, name: narrow ? "S" : L("S sin voz", "S, no voice"), color: C.air, soft: C.airSoft, icon: T.AIR },
      { key: "A", tr: A, name: narrow ? "/A/" : L("/A/ cantada", "/A/ sung"), color: C.you, soft: C.youSoft, icon: T.TONE }
    ];
    lanes.forEach((ln, k) => {
      const ly = top + k * laneH;
      const asked = m.step === ln.key;
      const bh = clamp(laneH * 0.52, 12, 44);
      const by = ly + (laneH - bh) / 2;
      // The lane being asked for is outlined
      ctx.save();
      ctx.fillStyle = asked ? "rgba(170, 195, 230, 0.07)" : "rgba(170, 195, 230, 0.025)";
      roundRect(ctx, pad, ly + 2, w - pad * 2, laneH - 4, 8);
      ctx.fill();
      if (asked && !m.review) {
        ctx.strokeStyle = C.gridStrong;
        ctx.lineWidth = 1.5;
        roundRect(ctx, pad + 0.5, ly + 2.5, w - pad * 2 - 1, laneH - 5, 8);
        ctx.stroke();
      }
      ctx.restore();
      tagIcon(ctx, ln.icon, pad + 12, ly + laneH / 2, 6, ln.color);
      ctx.font = font(narrow ? 11 : 12, 800);
      ctx.fillStyle = asked ? C.text : C.muted;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(ln.name, pad + 24, ly + laneH / 2, labelW - 26);
      // In the /A/ lane, your best S as the length to reach for
      if (ln.key === "A" && S.best > 0.5) {
        const sx = x0 + Math.min(maxSec, S.best) * pps;
        ctx.save();
        ctx.strokeStyle = C.air;
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(sx, by - 5);
        ctx.lineTo(sx, by + bh + 5);
        ctx.stroke();
        ctx.restore();
        if (!tiny && laneH >= 40) {
          ctx.font = font(9, 800);
          ctx.fillStyle = C.air;
          ctx.textAlign = sx > x0 + areaW - 70 ? "right" : "left";
          ctx.textBaseline = "top";
          ctx.fillText(L("tu mejor S", "your best S"), sx + (ctx.textAlign === "right" ? -4 : 4), by + bh + 1);
        }
      }
      const tr = ln.tr;
      if (tr.hold && tr.last) holdBar(ctx, tr.last, { x0, pps, y: by, h: bh, color: ln.color, ghost: true });
      holdBar(ctx, tr.hold || (m.review ? tr.bestHold : tr.last), { x0, pps, y: by, h: bh, color: ln.color, soft: tr.hold ? ln.soft : "rgba(170, 195, 230, 0.10)", words: laneH >= 40 });
      if (tr.best > 0.5) {
        glyph(ctx, "star", x0 + Math.min(maxSec, tr.best) * pps, by - 5, C.done, 4);
      }
      if (tr.hold) {
        ctx.fillStyle = ln.color;
        ctx.beginPath();
        ctx.arc(x0 + Math.min(maxSec, tr.hold.len) * pps, by + bh / 2, 5, 0, Math.PI * 2);
        ctx.fill();
      }
    });
    if (!tiny) secAxis(ctx, x0, pps, bottom + 2, maxSec, areaW, [0, 5, 10, 15, 20, 25, 30, 40, 50, 60]);
    if (!tiny) {
      const ly = h - pad - 5;
      ctx.font = font(10, 700);
      ctx.textBaseline = "middle";
      ctx.textAlign = "left";
      ctx.fillStyle = C.muted;
      let x = pad + 2;
      glyph(ctx, "star", x + 5, ly, C.done, 4);
      const t0 = L("mejor", "best");
      ctx.fillStyle = C.muted;
      ctx.fillText(t0, x + 13, ly + 0.5);
      x += 13 + ctx.measureText(t0).width + 12;
      const t1 = narrow ? L("nivel ±3 dB aprox.", "level ±3 dB approx.") : L("línea: nivel frente a tu media, ±3 dB (aprox.)", "line: level vs your own median, ±3 dB (approx.)");
      ctx.fillText(t1, x, ly + 0.5, w - pad - x);
    }
  }

  /**
   * Paint a picture now. The modes call this from their frame callback, which
   * already runs inside the engine's animation frame: painting there shows
   * this frame's sound in this frame, asks for no second frame, and reads no
   * layout (the Surface keeps its size from its own resize observer).
   */
  function paintNow(s) {
    if (!s || !s.ctx || !s.canvas || !s.canvas.isConnected) return;
    if (!s.w || !s.h) {
      s.draw();
      return;
    }
    s.ctx.clearRect(0, 0, s.w, s.h);
    try {
      s.drawFn(s.ctx, s.w, s.h);
    } catch (err) {
      console.warn("[viz]", err);
    }
  }

  V.scenes.sovt = sovt;
  V.scenes.trillStrip = trillStrip;
  V.scenes.trillMap = trillMap;
  V.scenes.ladder = ladder;
  V.scenes.breathLanes = breathLanes;
  V.scenes.breathKit = { T, TrillTrack, HoldTrack, PitchGate, frameBits, airBits, holdStats, holdBar, niceSec, noteName, hzToMidi, foldTo, fmtClock, tagIcon, legend, timeWindow, sovtWords, paintNow };
})(typeof window !== "undefined" ? window : globalThis);
