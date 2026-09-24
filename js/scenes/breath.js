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
      this.last = h;
      if (h.len >= 0.5) {
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
    if (!small) {
      ctx.font = font(9, 700);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(L("agudo", "higher"), x + 4, plotTop);
      ctx.textBaseline = "bottom";
      ctx.fillText(L("grave", "lower"), x + 4, plotBot);
      ctx.textBaseline = "middle";
      ctx.fillText(L("sin tono", "no pitch"), x + 4, floorY);
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
    const y = geo.graphH - h - 3;
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
    ctx.font = font(10, 800);
    ctx.textAlign = "left";
    ctx.textBaseline = "bottom";
    ctx.fillStyle = C.muted;
    ctx.fillText(opts.label || L("burbujeo", "bubbling"), x0, y - 3);
    ctx.restore();
  }

  /**
   * The lip-trill scale under the highway: one row per pattern, one stone
   * per note (1 2 3 4 5 4 3 2 1). A stone the bubble carried all the way is
   * a zig-zag; one where it stopped is flat with a notch; a stone not sung
   * yet is an outline. After Stop, the rows are the review.
   * model: { patterns: [{ root, stones: [{ state: "trill"|"stall"|"todo"|"now", frac }] }],
   *          degrees, syllables, current, review, summary }
   */
  function trillMap(ctx, w, h, m) {
    panel(ctx, w, h);
    const pad = 8;
    const labelW = Math.min(64, w * 0.16);
    const rows = m.patterns.slice(-Math.max(1, Math.floor((h - pad * 2 - 18) / 26)));
    const rowH = Math.min(30, (h - pad * 2 - 18) / Math.max(1, rows.length));
    const stoneW = (w - pad * 2 - labelW) / m.degrees.length;
    ctx.font = font(10, 700);
    ctx.fillStyle = C.muted;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    fitText(ctx, m.summary || "", pad, pad + 6, w - pad * 2, 11, 700, 9);
    rows.forEach((row, ri) => {
      const ry = pad + 18 + ri * rowH;
      const isCur = !m.review && ri === rows.length - 1 && m.patterns[m.patterns.length - 1] === row;
      ctx.fillStyle = isCur ? C.text : C.muted;
      ctx.font = font(11, 800);
      ctx.textAlign = "left";
      ctx.fillText(row.rootName, pad, ry + rowH / 2);
      row.stones.forEach((s, i) => {
        const sx = pad + labelW + i * stoneW + 2;
        const sw = stoneW - 4;
        const sh = rowH - 6;
        const cy = ry + rowH / 2;
        ctx.save();
        ctx.lineWidth = s.state === "now" ? 2 : 1;
        ctx.strokeStyle = s.state === "now" ? C.text : C.grid;
        ctx.fillStyle = s.state === "trill" ? "rgba(191, 230, 255, 0.12)" : "rgba(170, 195, 230, 0.05)";
        roundRect(ctx, sx, ry + 3, sw, sh, 5);
        ctx.fill();
        ctx.stroke();
        if (s.state === "trill" || (s.state === "now" && s.frac > 0)) {
          ctx.strokeStyle = C.you;
          ctx.lineWidth = 1.8;
          ctx.beginPath();
          const end = sx + 3 + (sw - 6) * (s.state === "now" ? clamp(s.frac, 0, 1) : 1);
          let up = true;
          ctx.moveTo(sx + 3, cy);
          for (let px = sx + 5; px <= end; px += 3.5) {
            ctx.lineTo(px, cy + (up ? -sh * 0.22 : sh * 0.22));
            up = !up;
          }
          ctx.stroke();
        } else if (s.state === "stall") {
          ctx.fillStyle = C.muted;
          roundRect(ctx, sx + 3, cy - 1.5, sw - 6, 3, 1.5);
          ctx.fill();
          glyph(ctx, "notch", sx + sw / 2, ry + 7, C.warn, 4);
        }
        ctx.restore();
        if (sw > 20 && rowH >= 22) {
          ctx.font = font(9, 700);
          ctx.fillStyle = C.faint;
          ctx.textAlign = "center";
          ctx.textBaseline = "top";
          ctx.fillText(String(m.degrees[i]), sx + sw / 2, ry + 4);
        }
      });
    });
    if (!rows.length || !rows[0].stones.length) {
      ctx.fillStyle = C.faint;
      ctx.font = font(12, 600);
      ctx.textAlign = "center";
      ctx.fillText(L("Las pasadas aparecen aquí", "Your patterns appear here"), w / 2, h / 2);
    }
  }

  V.scenes.sovt = sovt;
  V.scenes.trillStrip = trillStrip;
  V.scenes.trillMap = trillMap;
  V.scenes.breathKit = { T, TrillTrack, HoldTrack, PitchGate, frameBits, holdStats, noteName, hzToMidi, foldTo, fmtClock, tagIcon, legend, timeWindow, sovtWords };
})(typeof window !== "undefined" ? window : globalThis);
