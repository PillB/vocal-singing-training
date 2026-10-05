/**
 * Speech-shape pictures: the melody of speech (v12), how a sentence lands
 * (v19), the silence before an answer (v17) and the arc of a story (v18).
 *
 * What these follow (docs/39-EXERCISE-VISUALS.md, research on speech prosody):
 * - Pitch in speech is shown in semitones against the learner's own usual
 *   pitch, never as notes: a speaking voice is not singing a scale.
 * - Speech pitch comes in fragments. The line is smoothed (a median per
 *   50 ms, then over three neighbours), octave slips are folded or dropped,
 *   gaps stay gaps, and every number is labelled "aprox.".
 * - How a phrase ends (it falls, stays level, or rises) is read from the last
 *   voiced 150 ms against the body of the same phrase, so it is relative to
 *   the phrase, not to an absolute "low" voice. Nothing tells anyone to
 *   lower their voice.
 * - While speaking, one slow cue; the detailed map comes after Stop.
 * - Authority, clarity and vividness are never scored: those ratings stay
 *   with the learner. A rise is described ("sube"), never marked as an error.
 */
(function (global) {
  "use strict";
  const V = global.VTViz;
  const F = global.VTFeatures;
  if (!V || !F) return;
  const { C, L, font, clamp, fmtNum, roundRect, panel, chips, glyph } = V;

  /** Pitch bins: 20 a second. */
  const BIN = 0.05;
  /** An ending this many semitones under (over) the phrase reads as a fall (rise). [H] */
  const FALL_ST = 1.5;
  const RISE_ST = 1.5;
  const DONE_SOFT = "rgba(255, 211, 110, 0.16)";
  const PANEL_SOFT = "rgba(170, 195, 230, 0.06)";

  function median(a) {
    return a && a.length ? V.median(a) : null;
  }
  function pct(a, p) {
    return a && a.length ? F.percentile(a, p) : null;
  }
  /** "+3,2 st" / "−1,5 st" with a real minus sign and the language's decimal mark. */
  function fmtSt(v, digits = 1) {
    if (v == null || !Number.isFinite(v)) return "—";
    const sign = v >= 0.05 ? "+" : v <= -0.05 ? "−" : "";
    return sign + fmtNum(Math.abs(v), digits) + " st";
  }
  function clock(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  /* —— The phrase analyser —— */

  /**
   * Speech/silence (VTFeatures.Vad), a smoothed pitch track in 50 ms bins
   * (VTFeatures.StablePitch, then octave folding against your own median),
   * the level of each bin in dB before the MIC slider, and each phrase as it
   * closes with the shape of its ending.
   *
   * opts: onPhrase(phrase), onSpeech(t), onPauseEnd(start, len), onBin(bin),
   *       syllables (also run VTFeatures.SyllableRate).
   * phrase: { start, end, bins: [{ t, m (MIDI or null), db, s }], fin, medDb }
   */
  class ShapeTracker {
    constructor(opts = {}) {
      this.o = opts;
      this.vad = new F.Vad({
        hangMs: opts.hangMs != null ? opts.hangMs : 220,
        onSpeech: (t) => this._speech(t),
        onPause: (t) => this._pause(t),
        onPauseEnd: (s, len) => this.o.onPauseEnd && this.o.onPauseEnd(s, len)
      });
      this.pitch = new F.StablePitch({ maxJump: 7 });
      this.syll = opts.syllables ? new F.SyllableRate() : null;
      this._refRing = new F.Ring(1200);
      this.reset();
    }
    reset() {
      this.vad.reset();
      this.pitch.reset();
      if (this.syll) this.syll.reset();
      this.bins = [];
      this.phrases = [];
      this.cur = null;
      this._k = -1;
      this._m = [];
      this._db = [];
      this._snd = false;
      this._refRing.clear();
      this._refVal = null;
      this._refN = 0;
      this.locked = null;
    }
    get t() {
      return this.vad.t;
    }
    /** Your usual pitch (MIDI): locked by a baseline, else the running median. */
    get ref() {
      return this.locked != null ? this.locked : this._refVal;
    }
    lockRef(m) {
      this.locked = m;
    }
    feed(frame) {
      this.vad.feed(frame);
      if (this.syll) this.syll.feed(frame);
      const t = this.vad.t;
      let m = this.pitch.feed(frame);
      // A pitch on a frame too quiet to be speech is room noise
      if (m != null && !frame.sounding) m = null;
      if (m != null) m = this._fold(m);
      const db = frame.sounding ? F.dbfs((frame.rms || 0) / (frame.inputGain || 1)) : null;
      const k = Math.floor(t / BIN);
      if (k !== this._k) {
        this._closeBin();
        this._k = k;
      }
      if (m != null) this._m.push(m);
      if (db != null) this._db.push(db);
      if (frame.sounding) this._snd = true;
    }
    /**
     * The detector's known slip is an octave low; speech almost never leaps
     * nine semitones under its own median and holds there. Fold those up; drop
     * anything further than 15 semitones either way.
     */
    _fold(m) {
      const ref = this.ref;
      if (ref == null) return m;
      const d = m - ref;
      if (d < -9 && Math.abs(d + 12) < 6) return m + 12;
      if (Math.abs(d) > 15) return null;
      return m;
    }
    _closeBin() {
      if (this._k < 0) return;
      const b = {
        t: (this._k + 0.5) * BIN,
        m: this._m.length ? median(this._m) : null,
        db: this._db.length ? Math.max(...this._db) : null,
        s: this._snd
      };
      this._m.length = 0;
      this._db.length = 0;
      this._snd = false;
      this.bins.push(b);
      if (this.bins.length > 2400) this.bins.splice(0, this.bins.length - 2000);
      if (b.m != null) {
        this._refRing.push(b.m);
        this._refN++;
        if (this._refRing.count >= 20 && (this._refVal == null || this._refN % 10 === 0)) {
          this._refVal = median(Array.from(this._refRing.last()));
        }
      }
      if (this.o.onBin) this.o.onBin(b);
    }
    _speech(t) {
      this.cur = { start: t, end: null };
      if (this.o.onSpeech) this.o.onSpeech(t);
    }
    _pause(t) {
      const p = this.cur;
      if (!p) return;
      this.cur = null;
      p.end = Math.max(p.start + BIN, t);
      p.bins = this.binsIn(p.start - 0.02, p.end + 0.02);
      p.fin = analyseEnding(p.bins, p.end);
      const dbs = p.bins.filter((b) => b.db != null).map((b) => b.db);
      p.medDb = median(dbs);
      this.phrases.push(p);
      if (this.phrases.length > 400) this.phrases.splice(0, this.phrases.length - 400);
      if (this.o.onPhrase) this.o.onPhrase(p);
    }
    /** Close what is open (Stop while speaking). */
    finish() {
      this._closeBin();
      this._k = -1;
      if (this.cur) this._pause(this.t);
    }
    binsIn(a, b) {
      const out = [];
      for (let i = this.bins.length - 1; i >= 0; i--) {
        const x = this.bins[i];
        if (x.t < a) break;
        if (x.t <= b) out.push(x);
      }
      return out.reverse();
    }
    /** The phrase being spoken now, as a phrase-like object. */
    live() {
      if (!this.cur) return null;
      return { start: this.cur.start, end: this.t, bins: this.binsIn(this.cur.start - 0.02, this.t), live: true };
    }
    /** Syllable peaks (approximate) between a and b. */
    syllIn(a, b) {
      if (!this.syll) return 0;
      let n = 0;
      this.syll.allPeaks.forEach((p) => {
        if (p >= a && p <= b) n++;
      });
      return n;
    }
    /** Seconds of speech between a and b. */
    talkIn(a, b) {
      let s = 0;
      this.vad.segments.forEach((g) => {
        if (g.kind !== "speech") return;
        const e = g.end != null ? g.end : this.vad.t;
        s += Math.max(0, Math.min(b, e) - Math.max(a, g.start));
      });
      return s;
    }
  }

  /**
   * How a phrase ends: the median of its last voiced 150 ms against the
   * median of the phrase before its last 350 ms.
   *   fall   the ending sits ≥1.5 st under the phrase
   *   rise   ≥1.5 st over it
   *   level  in between
   *   unclear  the voice lost its pitch well before the phrase stopped
   *            (creak, a whisper, an unvoiced last sound): not guessed
   *   short  too little voice to say anything
   * Also `fade`: the ending's loudest bin against the phrase's median, in dB.
   */
  function analyseEnding(bins, end) {
    const vb = bins.filter((b) => b.m != null);
    if (vb.length < 5) return { kind: "short", move: null, fin: null, body: null, fade: null, tLast: null };
    const tLast = vb[vb.length - 1].t;
    const tail = vb.filter((b) => b.t >= tLast - 0.15).map((b) => b.m);
    const bodyBins = vb.filter((b) => b.t < tLast - 0.35);
    const body = median((bodyBins.length >= 4 ? bodyBins : vb).map((b) => b.m));
    const fin = median(tail);
    const dbs = bins.filter((b) => b.db != null).map((b) => b.db);
    const endDb = bins.filter((b) => b.db != null && b.t >= tLast - 0.3).map((b) => b.db);
    const fade = endDb.length && dbs.length ? Math.max(...endDb) - median(dbs) : null;
    if (end - tLast > 0.45) return { kind: "unclear", move: null, fin, body, fade, tLast };
    const move = fin - body;
    const kind = move <= -FALL_ST ? "fall" : move >= RISE_ST ? "rise" : "level";
    return { kind, move, fin, body, fade, tLast };
  }

  /**
   * Smoothed pitch runs of a phrase, relative to `ref`: a median over three
   * neighbouring bins, and a new run wherever the voice was gone for more
   * than 160 ms (no invented line across a gap).
   */
  function runsOf(bins, ref, from, to) {
    const vb = [];
    for (let i = 0; i < bins.length; i++) {
      const b = bins[i];
      if (b.m == null) continue;
      if (from != null && b.t < from) continue;
      if (to != null && b.t > to) continue;
      vb.push(b);
    }
    const out = [];
    let run = null;
    let lastT = -1;
    for (let i = 0; i < vb.length; i++) {
      const b = vb[i];
      const nb = [b.m];
      if (i > 0 && b.t - vb[i - 1].t <= 0.16) nb.push(vb[i - 1].m);
      if (i < vb.length - 1 && vb[i + 1].t - b.t <= 0.16) nb.push(vb[i + 1].m);
      const m = nb.length === 3 ? nb.sort((x, y) => x - y)[1] : b.m;
      if (!run || b.t - lastT > 0.16) {
        run = [];
        out.push(run);
      }
      run.push({ t: b.t, v: m - ref, db: b.db });
      lastT = b.t;
    }
    return out;
  }

  /** Draw runs; the line is heavier where the voice was louder (stress). */
  function drawRuns(ctx, runs, xOf, yOf, o = {}) {
    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = o.color || C.you;
    ctx.fillStyle = o.color || C.you;
    ctx.globalAlpha = o.alpha != null ? o.alpha : 1;
    if (o.dash) ctx.setLineDash(o.dash);
    const base = o.width || 2.4;
    runs.forEach((run) => {
      if (run.length === 1) {
        ctx.beginPath();
        ctx.arc(xOf(run[0].t), yOf(run[0].v), base * 0.7, 0, Math.PI * 2);
        ctx.fill();
        return;
      }
      for (let i = 1; i < run.length; i++) {
        const p = run[i - 1];
        const q = run[i];
        let lw = base;
        if (!o.fixed && o.medDb != null && q.db != null) lw = clamp(base + (q.db - o.medDb) * 0.28, 1.2, 6);
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.moveTo(xOf(p.t), yOf(p.v));
        ctx.lineTo(xOf(q.t), yOf(q.v));
        ctx.stroke();
      }
    });
    ctx.restore();
  }

  /** An arrow for how a phrase ended: ↘ fall, → level, ↗ rise; "?" unclear. */
  function endArrow(ctx, kind, x, y, s, color, lw = 2.2) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (kind !== "fall" && kind !== "rise" && kind !== "level") {
      ctx.font = font(Math.round(s * 1.9), 800);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(kind === "unclear" ? "?" : "·", x, y + 0.5);
      ctx.restore();
      return;
    }
    const dy = kind === "fall" ? 0.8 : kind === "rise" ? -0.8 : 0;
    const n = Math.hypot(1, dy);
    const ux = 1 / n;
    const uy = dy / n;
    const x1 = x + ux * s;
    const y1 = y + uy * s;
    ctx.beginPath();
    ctx.moveTo(x - ux * s, y - uy * s);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    const hs = Math.max(4, s * 0.8);
    const a = Math.atan2(uy, ux);
    ctx.beginPath();
    ctx.moveTo(x1 + ux * 1.5, y1 + uy * 1.5);
    ctx.lineTo(x1 - hs * Math.cos(a - 0.55), y1 - hs * Math.sin(a - 0.55));
    ctx.lineTo(x1 - hs * Math.cos(a + 0.55), y1 - hs * Math.sin(a + 0.55));
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /** Words and colour for an ending. `riseColor` differs by exercise. */
  function endInfo(fin, riseColor) {
    const k = fin ? fin.kind : "short";
    if (k === "fall") return { kind: k, word: L("cae", "falls"), Word: L("Cae", "Falls"), num: fmtSt(fin.move), color: C.target };
    if (k === "rise") return { kind: k, word: L("sube", "rises"), Word: L("Sube", "Rises"), num: fmtSt(fin.move), color: riseColor || C.you };
    if (k === "level") return { kind: k, word: L("plano", "level"), Word: L("Plano", "Level"), num: fmtSt(fin.move), color: C.muted };
    if (k === "unclear")
      return { kind: k, word: L("sin tono claro", "no clear pitch"), Word: L("Sin tono claro", "No clear pitch"), num: "", color: C.muted };
    return { kind: k, word: L("muy corta", "too short"), Word: L("Muy corta", "Too short"), num: "", color: C.faint };
  }

  /** Semitone grid: 0 = the reference, lines every 3 st. */
  function stGrid(ctx, x, w, yOf, R, o = {}) {
    ctx.save();
    ctx.font = font(10, 700);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    const step = o.step || 3;
    for (let s = -12; s <= 12; s += step) {
      if (Math.abs(s) > R + 0.01) continue;
      const y = Math.round(yOf(s)) + 0.5;
      ctx.strokeStyle = s === 0 ? C.gridStrong : C.grid;
      ctx.lineWidth = 1;
      ctx.setLineDash(s === 0 ? [6, 4] : []);
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + w, y);
      ctx.stroke();
      if (o.labels !== false && (s === 0 || Math.abs(s) % 6 === 0 || o.every)) {
        ctx.fillStyle = s === 0 ? C.muted : C.faint;
        ctx.fillText(s === 0 ? "0" : (s > 0 ? "+" : "−") + Math.abs(s), x - 4, y);
      }
    }
    ctx.setLineDash([]);
    ctx.restore();
  }

  /* —— Words that fit whole ——
   * ctx.fillText(text, x, y, maxWidth) squeezes letters together when the
   * words are wider than maxWidth: unreadable on a phone. These pick words
   * that fit (a shorter version, a second line, a smaller size down to a
   * readable minimum) and never pass a maxWidth. */

  function widthAt(ctx, text, px, weight = 800) {
    ctx.font = font(px, weight);
    return ctx.measureText(String(text)).width;
  }

  /** The words of `text` on lines no wider than `maxW` (at the current font). */
  function lineBreak(ctx, text, maxW) {
    const words = String(text).split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    words.forEach((wd) => {
      const test = line ? line + " " + wd : wd;
      if (line && ctx.measureText(test).width > maxW) {
        lines.push(line);
        line = wd;
      } else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }

  /** `text` cut after a whole word, with "…", to fit `maxW` (current font); "" when no word fits. */
  function cutAtWord(ctx, text, maxW) {
    const words = String(text).split(/\s+/).filter(Boolean);
    if (ctx.measureText(words.join(" ")).width <= maxW) return words.join(" ");
    while (words.length > 1) {
      words.pop();
      const t = words.join(" ").replace(/[\s,;:·(]+$/, "") + "…";
      if (ctx.measureText(t).width <= maxW) return t;
    }
    return "";
  }

  /**
   * Draw the first of `texts` (longest first) that fits `maxW` whole at `px`,
   * or smaller down to `min`. When none does, the last is cut after a word.
   * Returns { text, px } (text "" when nothing was drawn).
   */
  function fitOne(ctx, texts, x, y, maxW, px, weight = 800, min = 11) {
    const list = [].concat(texts).filter((t) => t != null && t !== "");
    for (const t of list)
      for (let s = px; s >= min; s--)
        if (widthAt(ctx, t, s, weight) <= maxW) {
          ctx.fillText(t, x, y);
          return { text: t, px: s };
        }
    if (!list.length) return { text: "", px: min };
    ctx.font = font(min, weight);
    const cut = cutAtWord(ctx, list[list.length - 1], maxW);
    if (cut) ctx.fillText(cut, x, y);
    return { text: cut, px: min };
  }

  /**
   * `text` wrapped whole onto at most `maxLines` lines of `maxW`, at `px` or
   * smaller down to `min`. Does not draw. `fits` is false when even `min`
   * needed more lines: the last line is then cut after a word.
   */
  function wrapPlan(ctx, text, maxW, px, weight, min, maxLines) {
    for (let s = px; s >= min; s--) {
      ctx.font = font(s, weight);
      const lines = lineBreak(ctx, text, maxW);
      if (lines.length <= maxLines && lines.every((l) => ctx.measureText(l).width <= maxW))
        return { lines, px: s, lh: Math.round(s * 1.28), weight, fits: true };
    }
    ctx.font = font(min, weight);
    const all = lineBreak(ctx, text, maxW);
    const lines = all.slice(0, maxLines);
    if (all.length > maxLines) lines[maxLines - 1] = cutAtWord(ctx, all.slice(maxLines - 1).join(" "), maxW);
    return { lines: lines.filter((l) => ctx.measureText(l).width <= maxW), px: min, lh: Math.round(min * 1.28), weight, fits: false };
  }

  /** Draw a wrapPlan with the block's top at `yTop` (align as set by the caller). */
  function drawLines(ctx, plan, x, yTop) {
    ctx.font = font(plan.px, plan.weight);
    ctx.textBaseline = "middle";
    plan.lines.forEach((l, i) => ctx.fillText(l, x, yTop + plan.lh * (i + 0.5)));
    return plan.lines.length * plan.lh;
  }

  /** A legend: `parts` joined by " · " on up to `maxLines` lines; a part that does not fit is left out. */
  function legendPlan(ctx, parts, maxW, px, maxLines) {
    ctx.font = font(px, 700);
    const lines = [];
    let line = "";
    parts.filter(Boolean).forEach((p) => {
      const test = line ? line + " · " + p : p;
      if (ctx.measureText(test).width <= maxW) line = test;
      else if (line && lines.length + 1 < maxLines && ctx.measureText(p).width <= maxW) {
        lines.push(line);
        line = p;
      }
    });
    if (line) lines.push(line);
    return { lines, px, lh: Math.round(px * 1.3), weight: 700, fits: true };
  }

  /** Text on a small dark backing, so a line running under it does not cross the letters. */
  function backed(ctx, text, x, y, color, px = 11, weight = 800) {
    ctx.font = font(px, weight);
    const tw = ctx.measureText(text).width;
    const al = ctx.textAlign;
    const x0 = al === "right" || al === "end" ? x - tw : al === "center" ? x - tw / 2 : x;
    const bl = ctx.textBaseline;
    const hh = px + 4;
    const yc = bl === "top" ? y + px / 2 : bl === "bottom" || bl === "alphabetic" ? y - px / 2 : y;
    ctx.save();
    ctx.fillStyle = "rgba(11, 17, 25, 0.86)";
    roundRect(ctx, x0 - 3, yc - hh / 2, tw + 6, hh, 4);
    ctx.fill();
    ctx.restore();
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
    return tw;
  }

  /** The words before a ":" or " · " (a headline's short form), or null. */
  function lead(text) {
    const s = String(text || "");
    const i = s.search(/:| · /);
    return i > 3 ? s.slice(0, i) : null;
  }

  /**
   * A label and its shorter forms: "Aprendizaje" → "Aprendizaj.", … "Apr.".
   * For a row of tabs whose width follows time, not words.
   */
  function abbrevs(label, mark = "") {
    const s = String(label || "");
    const out = [mark + s];
    for (let n = s.length - 2; n >= 3; n--) if (!/\s$/.test(s.slice(0, n))) out.push(mark + s.slice(0, n) + ".");
    return out;
  }

  /**
   * V.chips with words that fit. chips() squeezes a label wider than its chip,
   * so for each chip this picks the longest of its label, its short form and
   * its number that fits whole at the size chips() draws it, and keeps its
   * second line only when that (or its short form) fits. Mirrors chips()'s
   * widths. item: { label, short, num, sub, subShort, done }.
   */
  function fitChips(ctx, box, items, opts = {}) {
    const n = items.length;
    if (!n) return;
    const gap = 4;
    const cur = opts.current != null ? opts.current : -1;
    const weightCur = n > 5 ? 2.2 : 1.4;
    const unit = (box.w - gap * (n - 1)) / (n - 1 + (cur >= 0 && cur < n ? weightCur : 1));
    const small = box.h < 30 || unit < 44;
    const out = items.map((it, i) => {
      const isCur = i === cur;
      const w = isCur ? unit * weightCur : unit;
      // Clear of the chip's edges, not only inside them
      const room = w - 9;
      const mark = it.done || (opts.doneBefore && i < cur) ? "✓ " : "";
      ctx.font = font(isCur ? (small ? 11 : 12) : small ? 10 : 11, isCur ? 800 : 700);
      const first = isCur || !small ? it.label : it.short || it.label;
      const options = [first, it.short, it.num].filter(Boolean);
      const pick = options.find((t) => ctx.measureText(mark + t).width <= room) || options[options.length - 1] || "";
      const o = Object.assign({}, it, { label: pick, short: pick });
      if (it.sub) {
        ctx.font = font(10, 600);
        o.sub = [it.sub, it.subShort].filter(Boolean).find((t) => ctx.measureText(t).width <= room) || "";
      }
      return o;
    });
    chips(ctx, box, out, opts);
  }

  /**
   * A picture's headline row: `big` (a number) at the right, the words at the
   * left, whole — on one line, else (lines: 2) wrapped onto a second, else the
   * first shorter form in `texts` that fits. A small `caption` before the big
   * number shows only when the words keep their room. `dots(right)` may draw
   * something between them and return its width. Returns the extra height a
   * second line took (0 on one line).
   */
  function headRow(ctx, o) {
    const x = o.x;
    const y = o.y;
    let end = o.right;
    if (o.big) {
      ctx.font = font(o.bigPx, 800, true);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = o.bigColor || C.text;
      ctx.fillText(o.big, end, y + 1);
      end -= ctx.measureText(o.big).width + 12;
    }
    if (o.dots) end -= o.dots(end) + 8;
    const texts = [].concat(o.texts).filter(Boolean);
    const px = o.px;
    const min = o.min || 13;
    const fitsIn = (room) => texts.length && widthAt(ctx, texts[0], min, 800) <= room;
    if (o.caption) {
      const cw = widthAt(ctx, o.caption, 11, 700);
      if (fitsIn(end - cw - 8 - x - 2)) {
        ctx.font = font(11, 700);
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillStyle = C.muted;
        ctx.fillText(o.caption, end, y + 1);
        end -= cw + 8;
      }
    }
    const maxW = end - x - 2;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = o.color || C.text;
    if (!texts.length) return 0;
    for (let s = px; s >= min; s--)
      if (widthAt(ctx, texts[0], s, 800) <= maxW) {
        ctx.fillText(texts[0], x, y);
        return 0;
      }
    const twoLines = (t) => {
      const plan = wrapPlan(ctx, t, maxW, Math.min(px, 14), 800, min, 2);
      if (!plan.fits) return -1;
      drawLines(ctx, plan, x, y - plan.lh / 2);
      return plan.lh * (plan.lines.length - 1);
    };
    // The full words on two lines, else a shorter form on one, else on two
    if (o.lines === 2) {
      const r = twoLines(texts[0]);
      if (r >= 0) return r;
    }
    const rest = texts.length > 1 ? texts.slice(1) : texts;
    for (const t of rest)
      for (let s = px; s >= min; s--)
        if (widthAt(ctx, t, s, 800) <= maxW) {
          ctx.fillText(t, x, y);
          return 0;
        }
    if (o.lines === 2)
      for (const t of rest) {
        const r = twoLines(t);
        if (r >= 0) return r;
      }
    fitOne(ctx, rest, x, y, maxW, px, 800, min);
    return 0;
  }

  /** A centred note, wrapped whole onto up to `maxLines` lines. */
  function note(ctx, text, x, y, maxW, color, px = 12, maxLines = 2, wholeOnly = false) {
    ctx.fillStyle = color || C.muted;
    const plan = wrapPlan(ctx, text, maxW, px, 600, Math.min(px, 11), maxLines);
    // A placeholder that cannot show whole is left out rather than cut
    if (wholeOnly && !plan.fits) return;
    ctx.textAlign = "center";
    drawLines(ctx, plan, x, y - (plan.lines.length * plan.lh) / 2);
  }

  /* —— v12 · Melody while speaking —— */

  function takeRange(t) {
    return t && t.range != null ? t.range : null;
  }
  function takeOf(p) {
    return p.takeIdx != null ? p.takeIdx : 0;
  }

  /**
   * "Tu melodía al hablar": each phrase's pitch line against your usual
   * pitch (the dashed 0 line), pauses squeezed to a small gap, and at the end
   * of every phrase an arrow for how it landed. On the right, this take's
   * range (10th–90th percentile) beside the flat baseline's, the contrast the
   * exercise is built on. After Stop: the takes stacked for comparison.
   *
   * model: { tracker, takes: [{ name, short, hint, start, end, range, p10,
   *          p90, R, ends }], current, review }
   */
  function melodyRibbon(ctx, w, h, m) {
    panel(ctx, w, h);
    const pad = 10;
    const tiny = h < 135;
    const compact = h < 190;
    const trk = m.tracker;
    const takes = m.takes;
    const take = takes[m.current];
    let top = pad;
    if (!tiny) {
      const chipH = compact ? (h >= 150 ? 30 : 26) : 36;
      fitChips(
        ctx,
        { x: pad, y: top, w: w - pad * 2, h: chipH },
        takes.map((t, i) => ({
          label: t.name,
          short: t.short,
          num: String(i + 1),
          sub:
            t.range != null
              ? fmtNum(t.range, 1) + " st"
              : i === m.current && !m.review && t.start != null
                ? clock(trk.t - t.start)
                : "",
          done: m.review ? t.start != null : i < m.current
        })),
        { current: m.review ? -1 : m.current }
      );
      top += chipH + (compact ? 6 : 10);
    }
    if (m.review) {
      melodyReview(ctx, { x: pad, y: top, w: w - pad * 2, h: h - top - pad }, m);
      return;
    }
    const ref = trk.ref;
    const headY = top + (tiny ? 6 : compact ? 9 : 12);
    let texts =
      ref == null
        ? [
            L("Habla normal unos segundos: tu tono habitual será la línea 0", "Speak normally for a few seconds: your usual pitch becomes the 0 line"),
            L("Habla normal unos segundos", "Speak normally for a few seconds")
          ]
        : [take.hint, lead(take.hint)];
    // No chips on a rotated phone: the take's name leads the line
    if (tiny) texts = [...texts.map((t) => t && take.short + " · " + t), texts[1]];
    // This take's range, large, on the right
    const range = takeRange(take);
    const extra = headRow(ctx, {
      x: pad + 2,
      right: w - pad - 2,
      y: headY,
      big: range != null ? fmtNum(range, 1) + " st" : "— st",
      bigPx: tiny ? 15 : compact ? 18 : 22,
      caption: w >= 420 ? L("rango aprox.", "range approx.") : null,
      texts,
      px: tiny || compact ? 14 : 16,
      min: tiny ? 12 : 13,
      lines: tiny || (compact && w >= 420) ? 1 : 2
    });

    // The plot, and under it what its marks mean (on two lines on a phone)
    const legend = compact
      ? null
      : legendPlan(
          ctx,
          [
            L("0 = tu tono habitual", "0 = your usual pitch"),
            L("↘ cae  → plano  ↗ sube", "↘ falls  → level  ↗ rises"),
            L("st = semitonos", "st = semitones"),
            L("más grueso = más fuerte", "thicker = louder")
          ],
          w - pad * 2,
          11,
          h >= 260 ? 2 : 1
        );
    const legendH = legend ? legend.lines.length * legend.lh + 4 : 0;
    const plotTop = headY + extra + (tiny ? 12 : compact ? 16 : 20);
    const plotBot = h - pad - legendH;
    const axisW = 22;
    const colW = w >= 380 ? 58 : 42;
    const px = pad + axisW;
    const pw = Math.max(60, w - pad * 2 - axisW - colW - 6);
    const py = plotTop;
    const ph = Math.max(30, plotBot - plotTop);
    const R = take.R || 6;
    const mid = py + ph / 2;
    const half = ph / 2 - 5;
    const yOf = (v) => mid - clamp(v / R, -1.1, 1.1) * half;
    ctx.fillStyle = PANEL_SOFT;
    roundRect(ctx, px, py - 2, pw, ph + 4, 6);
    ctx.fill();
    stGrid(ctx, px, pw, yOf, R, { labels: true, every: ph >= 150 });

    if (ref == null) {
      note(ctx, L("Escuchando tu tono habitual…", "Listening for your usual pitch…"), px + pw / 2, mid + (tiny ? 0 : 16), pw - 20, C.muted, 13);
    } else {
      drawPhrases(ctx, trk, m, take, ref, { px, py, pw, ph, yOf, tiny });
      rangeColumn(ctx, m, take, ref, { x: px + pw + 8, w: colW - 8, y: py, h: ph, yOf, R });
    }
    if (!tiny && !legendH && w >= 360) {
      // No legend line at this height: name the 0 line in the plot's corner,
      // on a backing so a pitch line under it does not cross the words
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      backed(ctx, L("0 = tu tono habitual", "0 = your usual pitch"), px + 6, py + ph - 1, C.muted, 11, 700);
    }

    if (legend) {
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      drawLines(ctx, legend, pad + 2, h - pad - legendH + 4);
    }
  }

  /** Phrases of the current take, newest at the right; pauses become gaps. */
  function drawPhrases(ctx, trk, m, take, ref, g) {
    const { px, py, pw, ph, yOf, tiny } = g;
    const list = trk.phrases.filter((p) => takeOf(p) === m.current);
    const live = trk.live();
    if (live) list.push(live);
    if (!list.length) {
      note(ctx, L("Tu primera frase aparece aquí", "Your first phrase appears here"), px + pw / 2, py + ph / 2 + 16, pw - 20, C.faint, 12);
      return;
    }
    const pps = clamp(pw / 9, 26, 80);
    const gap = 46;
    const endRoom = 52;
    const widths = list.map((p) => Math.max(4, (p.end - p.start) * pps));
    const placed = [];
    if (V.reducedMotion()) {
      // No scrolling: phrases fill a page left to right; a full page starts a new one
      let from = clamp(take._pageFrom || 0, 0, list.length - 1);
      let need = 0;
      for (let i = from; i < list.length; i++) need += widths[i] + gap;
      if (need > pw - endRoom + gap) from = take._pageFrom = list.length - 1;
      let x = px + 6;
      for (let i = from; i < list.length; i++) {
        placed.push({ p: list[i], x0: x });
        x += widths[i] + gap;
      }
    } else {
      let xr = px + pw - endRoom;
      for (let i = list.length - 1; i >= 0; i--) {
        const x0 = xr - widths[i];
        placed.unshift({ p: list[i], x0 });
        xr = x0 - gap;
        if (xr < px - 20) break;
      }
    }
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py - 4, pw, ph + 8);
    ctx.clip();
    // The newest closed phrase gets the big arrow and the word (not the live one)
    let lastClosed = -1;
    placed.forEach(({ p }, idx) => {
      if (!p.live) lastClosed = idx;
    });
    placed.forEach(({ p, x0 }, idx) => {
      const newest = idx === lastClosed;
      const xOf = (t) => x0 + (t - p.start) * pps;
      const medDb = p.medDb != null ? p.medDb : median(p.bins.filter((b) => b.db != null).map((b) => b.db));
      drawRuns(ctx, runsOf(p.bins, ref), xOf, yOf, { medDb, alpha: p.live || newest ? 1 : 0.6 });
      if (p.live || !p.fin) return;
      const info = endInfo(p.fin, C.you);
      if (p.fin.tLast != null && info.kind !== "unclear" && info.kind !== "short") {
        drawRuns(ctx, runsOf(p.bins, ref, p.fin.tLast - 0.3, p.fin.tLast + 0.01), xOf, yOf, {
          color: info.color,
          width: newest ? 4 : 3,
          fixed: true,
          alpha: newest ? 1 : 0.7
        });
      }
      const big = newest && !tiny;
      const ax = xOf(p.end) + (big ? 18 : 13);
      const ay = p.fin.fin != null ? clamp(yOf(p.fin.fin - ref), py + 12, py + ph - 26) : py + ph / 2;
      endArrow(ctx, info.kind, ax, ay, big ? 10 : 7, info.color, big ? 3.2 : 2.4);
      const words = big ? (info.num ? info.num.replace(" st", "") + " " : "") + info.word : info.num.replace(" st", "");
      if (words) {
        // On a backing: the next phrase's line may run under it
        const fpx = big ? 12 : 11;
        const tw = widthAt(ctx, words, fpx, 800);
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        backed(ctx, words, clamp(ax, px + tw / 2 + 4, px + pw - tw / 2 - 4), ay + (big ? 13 : 10), info.color, fpx, 800);
      }
    });
    ctx.restore();
  }

  /** This take's range (10th–90th percentile) beside the flat baseline's. */
  function rangeColumn(ctx, m, take, ref, g) {
    const { x, w, yOf, R } = g;
    const base = m.takes[0];
    const two = m.current > 0 && base.p10 != null;
    const bw = two ? w / 2 - 3 : Math.min(22, w - 6);
    const cx = x + w / 2;
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx, yOf(R));
    ctx.lineTo(cx, yOf(-R));
    ctx.stroke();
    const bar = (t, bx, ghost) => {
      const y1 = yOf(t.p90 - ref);
      const y2 = yOf(t.p10 - ref);
      ctx.save();
      if (ghost) {
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = C.muted;
        ctx.lineWidth = 1.5;
        roundRect(ctx, bx, y1, bw, Math.max(3, y2 - y1), 4);
        ctx.stroke();
      } else {
        ctx.fillStyle = C.youSoft;
        roundRect(ctx, bx, y1, bw, Math.max(3, y2 - y1), 4);
        ctx.fill();
        ctx.strokeStyle = C.you;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
      // Side by side the two words would meet: the baseline's goes over its
      // bar, this take's under it
      ctx.font = font(11, 700);
      ctx.fillStyle = ghost ? C.muted : C.you;
      ctx.textAlign = "center";
      if (ghost) {
        ctx.textBaseline = "bottom";
        ctx.fillText(L("base", "base"), bx + bw / 2, Math.max(y1 - 3, g.y + 10));
      } else {
        ctx.textBaseline = "top";
        ctx.fillText(L("ahora", "now"), bx + bw / 2, Math.min(y2 + 3, g.y + g.h - 10));
      }
    };
    if (two) bar(base, x + 2, true);
    if (take.p10 != null) bar(take, two ? x + w / 2 + 1 : cx - bw / 2, false);
    else {
      ctx.font = font(11, 700);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(L("rango", "range"), cx, yOf(0) - 10);
      ctx.fillText("…", cx, yOf(0) + 4);
    }
  }

  /** After Stop: every take as a row, on one shared semitone scale. */
  function melodyReview(ctx, box, m) {
    const trk = m.tracker;
    const ref = trk.ref;
    const rows = m.takes
      .map((t, i) => ({ t, i, ps: trk.phrases.filter((p) => takeOf(p) === i) }))
      .filter((r) => r.t.start != null && r.ps.length);
    if (!rows.length || ref == null) {
      note(ctx, L("Sin frases con tono todavía.", "No phrases with pitch yet."), box.x + box.w / 2, box.y + box.h / 2, box.w, C.muted, 13);
      return;
    }
    const R = Math.max(6, ...rows.map((r) => r.t.R || 6));
    const rowH = Math.min(200, box.h / rows.length);
    const narrow = box.w < 480;
    const labelW = narrow ? Math.min(118, box.w * 0.34) : Math.min(200, box.w * 0.28);
    rows.forEach((r, n) => {
      const y = box.y + n * rowH;
      const t = r.t;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = C.text;
      fitOne(ctx, [t.name, t.short, String(r.i + 1)], box.x, y + 9, labelW - 8, 12, 800, 11);
      let ly = y + 18;
      if (rowH >= 34) {
        ctx.fillStyle = C.muted;
        const words =
          t.range != null ? L(`rango ${fmtNum(t.range, 1)} st aprox.`, `range ${fmtNum(t.range, 1)} st approx.`) : L("rango: poca voz", "range: little voice");
        // Two lines when the row has the height, rather than squeezed
        const plan = wrapPlan(ctx, words, labelW - 8, 11, 700, 11, rowH >= 62 ? 2 : 1);
        if (plan.fits) ly += drawLines(ctx, plan, box.x, ly);
        else {
          fitOne(ctx, t.range != null ? [`${fmtNum(t.range, 1)} st aprox.`, `${fmtNum(t.range, 1)} st`] : [L("poca voz", "little voice")], box.x, ly + 7, labelW - 8, 11, 700, 11);
          ly += 14;
        }
      }
      if (rowH >= 50 && ly + 12 <= y + rowH) endCounts(ctx, box.x, ly + 2, r.ps);
      // The take's phrases, squeezed to fit its row
      const px = box.x + labelW;
      const pw = box.w - labelW;
      const py = y + 3;
      const ph = rowH - 8;
      const mid = py + ph / 2;
      const yOf = (v) => mid - clamp(v / R, -1.1, 1.1) * (ph / 2 - 3);
      ctx.fillStyle = PANEL_SOFT;
      roundRect(ctx, px, py, pw, ph, 5);
      ctx.fill();
      stGrid(ctx, px, pw, yOf, R, { labels: false, step: 6 });
      const gap = 12;
      let ps = r.ps;
      let total = ps.reduce((a, p) => a + (p.end - p.start), 0);
      let pps = (pw - 16 - gap * (ps.length - 1)) / Math.max(0.5, total);
      while (pps < 8 && ps.length > 1) {
        ps = ps.slice(1);
        total = ps.reduce((a, p) => a + (p.end - p.start), 0);
        pps = (pw - 16 - gap * (ps.length - 1)) / Math.max(0.5, total);
      }
      pps = Math.min(pps, 60);
      let x = px + 4;
      ctx.save();
      ctx.beginPath();
      ctx.rect(px, py, pw, ph);
      ctx.clip();
      ps.forEach((p) => {
        const x0 = x;
        const xOf = (tt) => x0 + (tt - p.start) * pps;
        drawRuns(ctx, runsOf(p.bins, ref), xOf, yOf, { medDb: p.medDb, alpha: 0.85, width: 2 });
        if (p.fin) {
          const info = endInfo(p.fin, C.you);
          const ay = p.fin.fin != null ? clamp(yOf(p.fin.fin - ref), py + 6, py + ph - 6) : mid;
          endArrow(ctx, info.kind, xOf(p.end) + 6, ay, 4, info.color, 1.8);
        }
        x += (p.end - p.start) * pps + gap;
      });
      ctx.restore();
    });
  }

  /** "↘3 →1 ↗2": how the phrases of a take ended, as shapes and counts. */
  function endCounts(ctx, x, y, phrases) {
    const n = { fall: 0, level: 0, rise: 0 };
    phrases.forEach((p) => {
      if (p.fin && n[p.fin.kind] != null) n[p.fin.kind]++;
    });
    let cx = x + 6;
    ["fall", "level", "rise"].forEach((k) => {
      const info = endInfo({ kind: k, move: 0 }, C.you);
      endArrow(ctx, k, cx, y + 6, 4.5, info.color, 1.8);
      ctx.font = font(11, 800, true);
      ctx.fillStyle = info.color;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(String(n[k]), cx + 8, y + 6.5);
      cx += 32;
    });
  }

  /* —— v19 · Landing strip —— */

  function landedCount(m) {
    return m.slots.filter((s) => s.attempts.some((a) => a.landed)).length;
  }

  /**
   * "Pista de aterrizaje": a slot per claim across the top; the current
   * claim's pitch line against its own middle; when you stop speaking, an
   * arrow for how it ended and a ring that fills over the second of silence.
   * A short rising burst after the claim is asked about ("¿etiqueta?"), not
   * asserted. After Stop, every claim as a row.
   *
   * model: { tracker, claims, need, slots: [{ attempts: [att] }], shown,
   *          phase, again, review }
   * att: { start, end, fin, pause, tag, landed, committed, bins }
   */
  function landingStrip(ctx, w, h, m) {
    panel(ctx, w, h);
    const pad = 10;
    const tiny = h < 135;
    const compact = h < 190;
    let top = pad;
    if (!tiny) {
      const slotH = compact ? 28 : 40;
      slotRow(ctx, { x: pad, y: top, w: w - pad * 2, h: slotH }, m);
      top += slotH + (compact ? 6 : 10);
    }
    if (m.review) {
      landingReview(ctx, { x: pad, y: top, w: w - pad * 2, h: h - top - pad }, m);
      return;
    }
    const headY = top + (tiny ? 6 : compact ? 9 : 12);
    const n = m.slots.length;
    const idx = Math.min(n + (m.again && n ? 0 : 1), 99);
    let texts;
    const ph = m.phase;
    if (ph === "idle") texts = [L(`Afirmación ${idx}: dila y deja que caiga`, `Claim ${idx}: say it and let it land`), L(`Afirmación ${idx}`, `Claim ${idx}`)];
    else if (ph === "speaking" || ph === "maybeTag")
      texts = [L("Hablando… termina la frase y calla", "Speaking… finish the sentence, then stop"), L("Termina la frase y calla", "Finish, then stop")];
    else if (ph === "landing") texts = [L("Silencio… sostén 1 s", "Silence… hold 1 s")];
    else if (ph === "landed")
      texts = [L("✓ Pausa completa · la siguiente cuando quieras", "✓ Pause held · the next one when you like"), L("✓ Pausa completa", "✓ Pause held")];
    else texts = [L("Siguiente afirmación cuando quieras", "Next claim when you like"), L("Siguiente afirmación", "Next claim")];
    if (m.again && ph !== "speaking") {
      const pre = L(`Otra vez la ${Math.max(1, n)}: `, `Claim ${Math.max(1, n)} again: `);
      texts = [...texts.map((t) => pre + t), texts[texts.length - 1]];
    }
    const extra = headRow(ctx, {
      x: pad + 2,
      right: w - pad - 2,
      y: headY,
      big: `${landedCount(m)}/${m.claims}`,
      bigPx: tiny ? 15 : compact ? 18 : 22,
      caption: w >= 460 ? L("cierres que caen + 1 s (aprox.)", "falls + 1 s pause (approx.)") : null,
      dots: tiny ? (right) => miniDots(ctx, right, headY + 1, m) : null,
      texts,
      color: ph === "landed" ? C.target : C.text,
      px: tiny || compact ? 14 : 16,
      min: tiny ? 12 : 13,
      lines: tiny || (compact && w >= 420) ? 1 : 2
    });

    // The card: the claim's line on the left, its ending and pause on the
    // right — on an upright phone, under it, where its words have the width
    const cardTop = headY + extra + (tiny ? 12 : compact ? 16 : 20);
    const cardH = Math.max(40, h - pad - cardTop);
    let cbox;
    let rbox;
    const stack = w < 420 && !tiny && cardH >= 120;
    if (stack) {
      const resH = clamp(cardH * 0.3, 74, 96);
      cbox = { x: pad, y: cardTop, w: w - pad * 2, h: cardH - resH - 8 };
      rbox = { x: pad, y: cardTop + cardH - resH, w: w - pad * 2, h: resH, side: true };
    } else {
      const resW = clamp(w * 0.36, 118, 230);
      cbox = { x: pad, y: cardTop, w: w - pad * 2 - resW - 8, h: cardH };
      rbox = { x: w - pad - resW, y: cardTop, w: resW, h: cardH };
    }
    m._layout = { stack, cbox, rbox };
    claimCard(ctx, cbox, m, m.shown, ghostFor(m));
    landingResult(ctx, rbox, m, m.shown);
  }

  /** The attempt drawn dashed under the current one (the "again" contrast). */
  function ghostFor(m) {
    const s = m.shown;
    if (s && s.committed) {
      for (const slot of m.slots) {
        const i = slot.attempts.indexOf(s);
        if (i > 0) return slot.attempts[i - 1];
      }
      return null;
    }
    if (m.again && m.slots.length) {
      const last = m.slots[m.slots.length - 1].attempts;
      return last[last.length - 1];
    }
    return null;
  }

  function slotRow(ctx, box, m) {
    const filled = m.slots.length;
    const total = Math.max(m.claims, filled + (m.again || m.review ? 0 : 1));
    const show = Math.min(total, box.w < 420 ? 6 : 8);
    const first = total - show;
    const gap = 4;
    const sw = (box.w - gap * (show - 1)) / show;
    const cur = m.again ? filled - 1 : filled;
    for (let k = 0; k < show; k++) {
      const i = first + k;
      const x = box.x + k * (sw + gap);
      const slot = m.slots[i];
      const att = slot ? slot.attempts[slot.attempts.length - 1] : null;
      const landed = slot && slot.attempts.some((a) => a.landed);
      ctx.fillStyle = landed ? DONE_SOFT : "rgba(170, 195, 230, 0.07)";
      roundRect(ctx, x, box.y, sw, box.h, 7);
      ctx.fill();
      const isCur = i === cur && !m.review;
      ctx.lineWidth = isCur ? 2 : 1;
      ctx.strokeStyle = isCur ? C.text : landed ? "rgba(255, 211, 110, 0.55)" : C.grid;
      roundRect(ctx, x + 0.5, box.y + 0.5, sw - 1, box.h - 1, 7);
      ctx.stroke();
      const cy = box.y + box.h / 2;
      ctx.textBaseline = "middle";
      if (!att) {
        ctx.font = font(11, 700);
        ctx.fillStyle = isCur ? C.text : C.faint;
        ctx.textAlign = "center";
        ctx.fillText(String(i + 1), x + sw / 2, cy + 0.5);
        continue;
      }
      const info = endInfo(att.fin, C.warn);
      const roomy = sw >= 64;
      const ax = x + (roomy ? 14 : sw / 2 - (landed ? 6 : 0));
      endArrow(ctx, info.kind, ax, cy, box.h < 34 ? 5 : 6, info.color, 2);
      if (roomy) {
        ctx.font = font(11, 800, true);
        ctx.fillStyle = att.pause >= m.need ? C.text : C.muted;
        ctx.textAlign = "left";
        const ps = fmtNum(Math.min(att.pause, 9.9), 1) + " s";
        if (ctx.measureText(ps).width <= sw - (landed || att.tag ? 44 : 30)) ctx.fillText(ps, x + 26, cy + 0.5);
      }
      if (landed) {
        glyph(ctx, "check", x + sw - 10, cy, C.done, 4);
      } else if (att.tag) {
        ctx.font = font(11, 800);
        ctx.fillStyle = C.warn;
        ctx.textAlign = "right";
        ctx.fillText("¿?", x + sw - 4, box.y + 9);
      }
      if (slot.attempts.length > 1 && box.h >= 34) {
        ctx.font = font(9, 700);
        ctx.fillStyle = C.faint;
        ctx.textAlign = "right";
        ctx.fillText("×" + slot.attempts.length, x + sw - 4, box.y + box.h - 7);
      }
    }
    if (first > 0) {
      ctx.font = font(9, 700);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText("+" + first, box.x + 2, box.y + 2);
    }
  }

  /** A row of small dots for the claims (rotated phone), returns its width. */
  function miniDots(ctx, right, y, m) {
    const n = Math.max(m.claims, m.slots.length);
    const step = 11;
    const wd = n * step;
    for (let i = 0; i < n; i++) {
      const x = right - wd + i * step + 5;
      const slot = m.slots[i];
      const landed = slot && slot.attempts.some((a) => a.landed);
      ctx.beginPath();
      ctx.arc(x, y, 3.5, 0, Math.PI * 2);
      if (landed) {
        ctx.fillStyle = C.done;
        ctx.fill();
      } else if (slot) {
        ctx.fillStyle = C.muted;
        ctx.fill();
      } else {
        ctx.strokeStyle = C.faint;
        ctx.lineWidth = 1.2;
        ctx.stroke();
      }
    }
    return wd;
  }

  /** One claim's pitch line against the claim's own middle (not your voice's). */
  function claimCard(ctx, b, m, att, ghost) {
    ctx.fillStyle = PANEL_SOFT;
    roundRect(ctx, b.x, b.y, b.w, b.h, 8);
    ctx.fill();
    const trk = m.tracker;
    if (!att) {
      note(
        ctx,
        L("Aquí se dibuja tu frase; al final verás si cae", "Your sentence is drawn here; at the end you'll see if it falls"),
        b.x + b.w / 2,
        b.y + b.h / 2,
        b.w - 16,
        C.faint,
        12,
        b.h >= 70 ? 3 : 2
      );
      return;
    }
    const endT = att.tagEnd || att.end || trk.t;
    const bins = att.bins || trk.binsIn(att.start - 0.02, endT);
    const vb = bins.filter((x) => x.m != null);
    const refc = att.fin && att.fin.body != null ? att.fin.body : median(vb.map((x) => x.m));
    if (refc == null) {
      note(ctx, L("Escuchando…", "Listening…"), b.x + b.w / 2, b.y + b.h / 2, b.w - 16, C.muted, 12);
      return;
    }
    const runs = runsOf(bins, refc);
    let maxAbs = 0;
    runs.forEach((r) => r.forEach((p) => (maxAbs = Math.max(maxAbs, Math.abs(p.v)))));
    const R = clamp(Math.ceil(maxAbs + 1), 5, 12);
    // A row under the plot names the 0 line, so the words never sit on a line
    const zeroRow = b.h >= 96 ? 16 : 0;
    const inner = { x: b.x + 26, y: b.y + 8, w: b.w - 26 - 24, h: b.h - 16 - zeroRow };
    const mid = inner.y + inner.h / 2;
    const yOf = (v) => mid - clamp(v / R, -1.1, 1.1) * (inner.h / 2 - 2);
    stGrid(ctx, inner.x, inner.w + 16, yOf, R, { labels: inner.h >= 60, step: R > 8 ? 6 : 3 });
    const dur = Math.max(2.2, endT - att.start);
    const xOf = (t) => inner.x + ((t - att.start) / dur) * inner.w;
    if (ghost && ghost !== att) {
      const gBins = ghost.bins || [];
      const gref = ghost.fin && ghost.fin.body != null ? ghost.fin.body : median(gBins.filter((x) => x.m != null).map((x) => x.m));
      if (gref != null) {
        const gEnd = ghost.tagEnd || ghost.end || ghost.start + 1;
        const gdur = Math.max(2.2, gEnd - ghost.start);
        const gx = (t) => inner.x + ((t - ghost.start) / gdur) * inner.w;
        drawRuns(ctx, runsOf(gBins, gref), gx, yOf, { color: C.muted, dash: [5, 4], width: 1.8, fixed: true, alpha: 0.8 });
        if (inner.h >= 60) {
          ctx.textAlign = "right";
          ctx.textBaseline = "top";
          const t = [L("- - intento anterior", "- - previous try"), L("- - anterior", "- - previous")].find((s) => widthAt(ctx, s, 10, 700) <= inner.w - 8);
          if (t) backed(ctx, t, inner.x + inner.w, inner.y, C.muted, 10, 700);
        }
      }
    }
    const medDb = median(bins.filter((x) => x.db != null).map((x) => x.db));
    drawRuns(ctx, runs, xOf, yOf, { medDb, alpha: att.fin ? 0.85 : 1 });
    if (zeroRow) {
      // What the 0 line is, whole, in its own row under the plot
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = C.muted;
      const t = [L("0 = el medio de tu frase", "0 = the middle of your sentence"), L("0 = medio de la frase", "0 = sentence middle")].find(
        (s) => widthAt(ctx, s, 11, 700) <= b.w - 36
      );
      if (t) ctx.fillText(t, inner.x, inner.y + inner.h + 4 + zeroRow / 2);
    }
    if (att.fin && att.fin.tLast != null) {
      const info = endInfo(att.fin, C.warn);
      if (info.kind === "fall" || info.kind === "rise" || info.kind === "level") {
        drawRuns(ctx, runsOf(bins, refc, att.fin.tLast - 0.3, att.fin.tLast + 0.01), xOf, yOf, { color: info.color, width: 4.5, fixed: true });
      }
      const ay = att.fin.fin != null ? clamp(yOf(att.fin.fin - refc), inner.y + 8, inner.y + inner.h - 8) : mid;
      endArrow(ctx, info.kind, Math.min(xOf(att.fin.tLast) + 14, b.x + b.w - 10), ay, 7, info.color, 2.6);
    }
  }

  /** The ending in words, and the ring for the second of silence. */
  function landingResult(ctx, b, m, att) {
    ctx.fillStyle = PANEL_SOFT;
    roundRect(ctx, b.x, b.y, b.w, b.h, 8);
    ctx.fill();
    // Words beside the ring (a short box, or the strip under the card on a
    // phone), or over it (a tall, narrow box)
    const side = b.side || b.h < 96;
    const ringR = side ? clamp(b.h * 0.3, 14, 26) : clamp(Math.min(b.w * 0.2, (b.h - 56) * 0.34), 14, 34);
    const waiting = !att || !att.fin || m.phase === "speaking" || (m.phase === "maybeTag" && !att.fin);
    const tx = b.x + 10;
    const wordsW = side ? b.w - ringR * 2 - 36 : b.w - 20;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    if (waiting) {
      // The question the picture answers when you stop: whole and readable
      ctx.fillStyle = C.muted;
      const plan = wrapPlan(ctx, L("Al final: ¿cae, plano o sube?", "At the end: falls, level or rises?"), wordsW, 13, 700, 12, side ? 2 : 3);
      const hh = plan.lines.length * plan.lh;
      drawLines(ctx, plan, tx, side ? b.y + b.h / 2 - 4 - hh / 2 : b.y + 12);
    } else {
      const info = endInfo(att.fin, C.warn);
      // What follows the ending's name, a line each, as far as there is room
      const more = [];
      if (info.kind === "rise") more.push({ t: [L("suena a pregunta", "sounds like a question")], c: C.muted, wt: 700 });
      if (att.tag)
        more.push({
          t: [L("¿etiqueta al final? (¿no?, ¿sabes?)", "tag at the end? (right?, you know?)"), L("¿etiqueta al final?", "tag at the end?")],
          c: C.warn,
          wt: 800
        });
      else if (att.fin.fade != null && att.fin.fade < -10)
        more.push({
          t: [L(`el final se apaga (${fmtNum(att.fin.fade, 0)} dB)`, `the ending fades (${fmtNum(att.fin.fade, 0)} dB)`), L("el final se apaga", "the ending fades")],
          c: C.muted,
          wt: 700
        });
      const lineH = 16;
      const shown = more.slice(0, side ? Math.max(0, Math.floor((b.h - 34) / lineH)) : 3);
      const blockH = 20 + shown.length * lineH;
      const ty = side ? b.y + b.h / 2 - 4 - blockH / 2 + 10 : b.y + 20;
      endArrow(ctx, info.kind, tx + 10, ty, 8, info.color, 2.8);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = info.color;
      const wx = tx + 26;
      const maxW = wordsW - 26;
      fitOne(ctx, [info.Word + (info.num ? " " + info.num : ""), info.Word], wx, ty, maxW, 15, 800, 12);
      let ly = ty + 19;
      shown.forEach((ln) => {
        ctx.fillStyle = ln.c;
        fitOne(ctx, ln.t, wx, ly, maxW, 11, ln.wt, 11);
        ly += lineH;
      });
    }
    // The landing pause: fills over `need` seconds of silence
    const rcx = side ? b.x + b.w - ringR - 14 : b.x + b.w / 2;
    const rcy = side ? b.y + b.h / 2 - 6 : b.y + b.h - ringR - 22;
    const pause = att && !waiting ? att.pause || 0 : 0;
    const full = pause >= m.need;
    V.ring(ctx, rcx, rcy, ringR, waiting ? 0 : pause / m.need, {
      color: full ? C.done : C.target,
      width: Math.max(4, ringR * 0.22)
    });
    ctx.font = font(ringR >= 22 ? 13 : 11, 800, true);
    ctx.fillStyle = waiting ? C.faint : C.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(waiting ? "—" : fmtNum(Math.min(pause, 9.9), 1) + " s", rcx, rcy + 0.5);
    ctx.font = font(11, 700);
    ctx.fillStyle = full ? C.done : C.muted;
    ctx.fillText((full ? "✓ " : "") + L("pausa", "pause"), rcx, Math.min(rcy + ringR + 10, b.y + b.h - 7));
  }

  /** After Stop: every claim with its ending, its pause and its line. */
  function landingReview(ctx, box, m) {
    const rows = [];
    m.slots.forEach((s, i) => s.attempts.forEach((a, j) => rows.push({ a, i, j, of: s.attempts.length })));
    if (!rows.length) {
      note(ctx, L("Sin afirmaciones todavía.", "No claims yet."), box.x + box.w / 2, box.y + box.h / 2, box.w, C.muted, 13);
      return;
    }
    ctx.textAlign = "left";
    ctx.fillStyle = C.text;
    const sum = L(
      `${landedCount(m)} de ${m.slots.length} cayeron y sostuvieron ${fmtNum(m.need, 0)} s de silencio (aprox.)`,
      `${landedCount(m)} of ${m.slots.length} fell and held ${fmtNum(m.need, 0)} s of silence (approx.)`
    );
    // Whole, on a second line when a phone needs one
    const sumPlan = wrapPlan(ctx, sum, box.w, 13, 800, 12, box.h >= 120 ? 2 : 1);
    const sumH = drawLines(ctx, sumPlan, box.x, box.y - 2);
    const top = box.y + sumH + 2;
    const avail = box.h - sumH - 2;
    const cols = rows.length > 4 && box.w >= 560 ? 2 : 1;
    const perCol = Math.ceil(rows.length / cols);
    const colW = (box.w - (cols - 1) * 12) / cols;
    // Narrow: the words on one line and the sentence's line under them
    const stack = colW < 480;
    const rowH = clamp(avail / Math.max(perCol, stack ? 3 : 1), 16, stack ? 96 : 56);
    const shown = Math.max(1, Math.floor(avail / rowH)) * cols;
    rows.slice(-shown).forEach((r, k) => {
      const col = Math.floor(k / perCol);
      const row = k % perCol;
      const x = box.x + col * (colW + 12);
      const y = top + row * rowH;
      const info = endInfo(r.a.fin, C.warn);
      const cy = stack ? y + 9 : y + Math.min(rowH, 30) / 2;
      ctx.font = font(11, 800, true);
      ctx.fillStyle = C.muted;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(`${r.i + 1}${r.of > 1 ? String.fromCharCode(97 + r.j) : ""}`, x, cy);
      endArrow(ctx, info.kind, x + 30, cy, 5.5, info.color, 2);
      const pauseW = `${L("pausa", "pause")} ${fmtNum(Math.min(r.a.pause, 9.9), 1)} s${r.a.landed ? " ✓" : ""}`;
      const tagW = r.a.tag ? " · " + L("¿etiqueta?", "tag?") : "";
      const endW = `${info.word}${info.num ? " " + info.num : ""}`;
      const textW = stack ? colW - 46 : Math.min(colW * 0.55, 260);
      ctx.fillStyle = r.a.landed ? C.text : C.muted;
      fitOne(ctx, [`${endW} · ${pauseW}${tagW}`, `${endW} · ${pauseW}`, `${info.word} · ${pauseW}`], x + 42, cy, textW, 12, 700, 11);
      // Its line, small
      const lx = stack ? x + 42 : x + 46 + textW;
      const lw = stack ? colW - 42 : colW - (lx - x);
      const ly = stack ? y + 20 : y + 3;
      const hh = stack ? rowH - 26 : rowH - 6;
      if (lw > 40 && hh >= 16 && r.a.bins) {
        const bins = r.a.bins;
        const refc = r.a.fin && r.a.fin.body != null ? r.a.fin.body : median(bins.filter((b) => b.m != null).map((b) => b.m));
        if (refc != null) {
          const endT = r.a.tagEnd || r.a.end || r.a.start + 1;
          const dur = Math.max(1, endT - r.a.start);
          const xOf = (t) => lx + ((t - r.a.start) / dur) * (lw - 8);
          const yOf = (v) => ly + hh / 2 - clamp(v / 8, -1, 1) * (hh / 2 - 1);
          if (stack) {
            ctx.fillStyle = PANEL_SOFT;
            roundRect(ctx, lx - 4, ly - 2, lw, hh + 4, 5);
            ctx.fill();
          }
          drawRuns(ctx, runsOf(bins, refc), xOf, yOf, { width: stack ? 2 : 1.6, fixed: true, alpha: 0.85 });
          if (r.a.fin && r.a.fin.tLast != null && (info.kind === "fall" || info.kind === "rise" || info.kind === "level")) {
            drawRuns(ctx, runsOf(bins, refc, r.a.fin.tLast - 0.3, r.a.fin.tLast + 0.01), xOf, yOf, {
              color: info.color,
              width: stack ? 3.2 : 2.6,
              fixed: true
            });
          }
        }
      }
    });
  }

  /* —— v17 · Concision gate —— */

  /**
   * "Puerta de concisión": a slot per question; the question; a doorway that
   * fills with your thinking silence and opens at the gate (a pacer, so the
   * silence is easier to hold); then your answer as speech and silence
   * against a soft time guide, with its pauses ticked (never called
   * "sentences"). A silence of `closeSec` closes the answer.
   *
   * model: { qs: [{ text, silent, gateOk, aStart, aEnd, pauses, blips }], q,
   *          phase ("think"|"answer"), gate, guide, closeSec, tracker, maxQ,
   *          review, flash }
   */
  function concisionGate(ctx, w, h, m) {
    panel(ctx, w, h);
    const pad = 10;
    const tiny = h < 135;
    const compact = h < 190;
    const trk = m.tracker;
    let top = pad;
    const n = Math.max(m.maxQ, m.qs.length);
    if (!tiny) {
      const chipH = compact ? (h >= 150 ? 30 : 26) : 36;
      const items = [];
      for (let i = 0; i < n; i++) {
        const q = m.qs[i];
        const answered = q && q.aStart != null;
        const len = answered ? clock((q.aEnd != null ? q.aEnd : trk.t) - q.aStart) : "";
        items.push({
          label: L(`P${i + 1}`, `Q${i + 1}`),
          short: L(`P${i + 1}`, `Q${i + 1}`),
          // The silence before · the answer; where both do not fit, the answer's length
          sub: answered ? `${fmtNum(q.silent, 1)} s · ${len}` : q && q.skipped ? L("saltada", "skipped") : "",
          subShort: answered ? len : "",
          done: answered && (q.aEnd != null || m.review)
        });
      }
      const cq = m.qs[m.q];
      fitChips(ctx, { x: pad, y: top, w: w - pad * 2, h: chipH }, items, {
        current: m.review ? -1 : m.q,
        frac: !m.review && m.phase === "think" && cq ? clamp(cq.silent / m.gate, 0, 1) : null
      });
      top += chipH + (compact ? 6 : 10);
    }
    if (m.review) {
      gateReview(ctx, { x: pad, y: top, w: w - pad * 2, h: h - top - pad }, m);
      return;
    }
    const q = m.qs[m.q];
    if (!q) return;
    const t = trk.t;
    // Headline + one number
    let texts;
    let big;
    let headColor = C.text;
    if (m.flash && t < m.flash.until) {
      texts = [m.flash.text, lead(m.flash.text)];
      headColor = C.done;
      big = m.phase === "answer" ? clock(t - q.aStart) : fmtNum(q.silent, 1) + " s";
    } else if (m.phase === "think" && !q.gateOk) {
      texts = [L("Lee la pregunta en silencio · respira", "Read the question silently · breathe"), L("Lee en silencio · respira", "Read silently · breathe")];
      big = fmtNum(q.silent, 1) + " s";
    } else if (m.phase === "think") {
      texts = [L("✓ Puerta abierta · responde con la idea primero", "✓ Gate open · answer, point first"), L("✓ Puerta abierta · responde", "✓ Gate open · answer")];
      headColor = C.target;
      big = "✓ " + fmtNum(q.silent, 1) + " s";
    } else {
      texts = [L("Responde: la idea primero, luego cierra", "Answer: point first, then stop"), L("La idea primero, luego cierra", "Point first, then stop")];
      big = clock(t - q.aStart);
    }
    // No chips on a rotated phone: the question's number leads the line
    if (tiny) texts = [...texts.map((s) => s && L(`P${m.q + 1} · `, `Q${m.q + 1} · `) + s), texts[texts.length - 1]];
    const headY = top + (tiny ? 6 : compact ? 9 : 12);
    const extra = headRow(ctx, {
      x: pad + 2,
      right: w - pad - 2,
      y: headY,
      big,
      bigPx: tiny ? 15 : compact ? 18 : 22,
      texts,
      color: headColor,
      px: tiny || compact ? 14 : 16,
      min: tiny ? 12 : 13,
      lines: tiny || (compact && w >= 420) ? 1 : 2
    });
    let y = headY + extra + (tiny ? 12 : compact ? 16 : 20);
    // The question, whole on up to two lines (a fixed room, so nothing jumps)
    if (!tiny) {
      const qH = compact ? 18 : 40;
      ctx.fillStyle = C.muted;
      ctx.textAlign = "left";
      const plan = wrapPlan(ctx, `«${q.text}»`, w - pad * 2 - 4, compact ? 12 : 14, 600, 12, compact ? 1 : 2);
      drawLines(ctx, plan, pad + 2, y - 2);
      y += qH;
    }
    // The beats: doorway → answer
    const bottom = h - pad;
    const open = q.gateOk || m.phase === "answer";
    const blips = q.blips.length;
    const fil = q.blips.filter((b) => b.filler).length;
    const blipWords = fil ? L(`¿relleno? ×${fil}`, `filler? ×${fil}`) : L(`sonido ×${blips}`, `sound ×${blips}`);
    if (w < 520 && bottom - y >= 210) {
      // Tall and narrow (a phone upright): the door with its words beside it,
      // the answer strip full width under it
      const doorH = clamp((bottom - y) * 0.36, 70, 120);
      const doorW = clamp(doorH * 0.72, 54, 88);
      const door = { x: pad + 2, y: y + 2, w: doorW, h: doorH };
      drawDoor(ctx, door, clamp(q.silent / m.gate, 0, 1), open, m.phase === "think" && !q.gateOk);
      const tx = door.x + door.w + 14;
      const tw = w - pad - tx - 2;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = C.muted;
      fitOne(ctx, [L("Silencio para pensar", "Thinking silence"), L("Silencio", "Silence")], tx, door.y + 10, tw, 12, 700, 11);
      ctx.font = font(24, 800, true);
      ctx.fillStyle = open ? C.target : C.text;
      ctx.fillText(open ? `✓ ${fmtNum(q.silent, 1)} s` : `${fmtNum(q.silent, 1)} s`, tx, door.y + door.h / 2);
      ctx.fillStyle = open ? C.target : C.muted;
      fitOne(
        ctx,
        open
          ? [L("puerta abierta", "gate open")]
          : [
              L(`la puerta se abre a los ${fmtNum(m.gate, 1)} s`, `the gate opens at ${fmtNum(m.gate, 1)} s`),
              L(`se abre a los ${fmtNum(m.gate, 1)} s`, `opens at ${fmtNum(m.gate, 1)} s`)
            ],
        tx,
        door.y + door.h / 2 + 24,
        tw,
        11,
        700,
        11
      );
      if (blips) {
        ctx.fillStyle = C.muted;
        fitOne(ctx, [blipWords], tx, door.y + door.h - 6, tw, 11, 700, 11);
      }
      const sy = door.y + door.h + 14;
      const sbox = { x: pad + 2, y: sy, w: w - pad * 2 - 4, h: Math.min(bottom - sy, 130) };
      answerStrip(ctx, sbox, m, q, trk, true, 64);
      return;
    }
    const trackH = clamp(bottom - y, 34, 130);
    const labelH = 16;
    const doorW = clamp(w * 0.15, 46, 86);
    const doorH = Math.min(trackH - labelH, 96);
    const door = { x: pad + 2, y: y + (trackH - labelH - doorH) / 2, w: doorW, h: doorH };
    drawDoor(ctx, door, clamp(q.silent / m.gate, 0, 1), open, m.phase === "think" && !q.gateOk);
    ctx.font = font(11, 800, true);
    ctx.fillStyle = open ? C.target : C.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    // Centred under the door, but never past the picture's left edge
    const doorWords = open ? `✓ ${fmtNum(q.silent, 1)} s` : `${fmtNum(q.silent, 1)} / ${fmtNum(m.gate, 1)} s`;
    ctx.fillText(doorWords, Math.max(door.x + door.w / 2, pad + ctx.measureText(doorWords).width / 2), door.y + door.h + 3);
    if (blips && trackH >= 60) {
      ctx.font = font(11, 700);
      ctx.fillStyle = C.muted;
      ctx.textBaseline = "bottom";
      ctx.fillText(blipWords, Math.max(door.x + door.w / 2, pad + ctx.measureText(blipWords).width / 2), door.y - 2);
    }
    // Arrow between the beats
    const ax = door.x + door.w + 6;
    const aw = 14;
    const amid = door.y + door.h / 2;
    ctx.strokeStyle = open ? C.target : C.faint;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(ax, amid);
    ctx.lineTo(ax + aw, amid);
    ctx.moveTo(ax + aw - 5, amid - 4);
    ctx.lineTo(ax + aw, amid);
    ctx.lineTo(ax + aw - 5, amid + 4);
    ctx.stroke();
    const sx = ax + aw + 8;
    const sbox = { x: sx, y: door.y, w: w - pad - sx, h: door.h };
    answerStrip(ctx, sbox, m, q, trk, !tiny);
  }

  /** The doorway: it fills from the floor while you are silent, opens at the gate. */
  function drawDoor(ctx, b, frac, open, filling) {
    ctx.save();
    if (open) {
      ctx.fillStyle = C.targetSoft;
      roundRect(ctx, b.x, b.y, b.w, b.h, 6);
      ctx.fill();
      // The door swung open against the left jamb
      ctx.fillStyle = "rgba(52, 178, 122, 0.55)";
      ctx.beginPath();
      ctx.moveTo(b.x + 2, b.y + 2);
      ctx.lineTo(b.x + b.w * 0.34, b.y + b.h * 0.12);
      ctx.lineTo(b.x + b.w * 0.34, b.y + b.h * 0.88);
      ctx.lineTo(b.x + 2, b.y + b.h - 2);
      ctx.closePath();
      ctx.fill();
      glyph(ctx, "check", b.x + b.w * 0.66, b.y + b.h / 2, C.target, Math.min(9, b.w * 0.14));
    } else {
      const fh = (b.h - 4) * frac;
      if (fh > 0) {
        ctx.fillStyle = C.targetSoft;
        roundRect(ctx, b.x + 2, b.y + b.h - 2 - fh, b.w - 4, fh, 4);
        ctx.fill();
      }
      ctx.fillStyle = C.muted;
      ctx.beginPath();
      ctx.arc(b.x + b.w - 9, b.y + b.h * 0.55, 2.6, 0, Math.PI * 2);
      ctx.fill();
      if (filling && b.h >= 50) {
        // A breath mark: two soft waves
        ctx.strokeStyle = C.muted;
        ctx.lineWidth = 1.5;
        for (let k = 0; k < 2; k++) {
          const yy = b.y + b.h * 0.3 + k * 7;
          ctx.beginPath();
          for (let i = 0; i <= 12; i++) {
            const xx = b.x + b.w * 0.25 + (i / 12) * b.w * 0.45;
            const v = yy + Math.sin((i / 12) * Math.PI * 2) * 2;
            if (i) ctx.lineTo(xx, v);
            else ctx.moveTo(xx, v);
          }
          ctx.stroke();
        }
      }
    }
    ctx.strokeStyle = open ? C.target : C.gridStrong;
    ctx.lineWidth = 2;
    roundRect(ctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, 6);
    ctx.stroke();
    ctx.restore();
  }

  /** A pause of ≥0.5 s: a mark over the answer's bar, pointing at its gap. */
  function pauseMark(ctx, x, yBottom, s = 5) {
    ctx.fillStyle = C.muted;
    ctx.beginPath();
    ctx.moveTo(x - s, yBottom - s * 1.25);
    ctx.lineTo(x + s, yBottom - s * 1.25);
    ctx.lineTo(x, yBottom);
    ctx.closePath();
    ctx.fill();
  }

  /**
   * Speech as blocks between `a` and `e` on a bar at (by, bh), and a mark over
   * the bar (never on it) for each pause of ≥0.5 s. Returns the marks' x.
   */
  function speechBlocks(ctx, vad, a, e, now, xOf, by, bh, marks) {
    const xs = [];
    let lastX = -99;
    vad.segments.forEach((sg) => {
      const s0 = Math.max(a, sg.start);
      const s1 = Math.min(e, sg.end != null ? sg.end : now);
      if (s1 <= s0) return;
      if (sg.kind === "speech") {
        ctx.fillStyle = C.you;
        ctx.globalAlpha = 0.85;
        roundRect(ctx, xOf(s0 - a), by + bh * 0.2, Math.max(2, xOf(s1 - a) - xOf(s0 - a)), bh * 0.6, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else if (marks && sg.end != null && sg.end - sg.start >= 0.5 && sg.end <= e) {
        const px = xOf((s0 + s1) / 2 - a);
        // Two pauses closer than a mark's width share one
        if (px - lastX < 11) return;
        lastX = px;
        pauseMark(ctx, px, by - 2, 5);
        xs.push(px);
      }
    });
    return xs;
  }

  /**
   * Seconds under a strip every 10 s, and the guide's name between its two
   * seconds where they leave room for it (whole, or just "guía").
   */
  function secondsRow(ctx, xOf, T, y, right, guide, last = T) {
    ctx.font = font(10, 700);
    ctx.fillStyle = C.faint;
    ctx.textBaseline = "top";
    const spans = [];
    for (let s = 0; s <= last + 0.01; s += 10) {
      const lab = `${s} s`;
      const lw = ctx.measureText(lab).width;
      let x = xOf(s);
      let al = s === 0 ? "left" : "center";
      if (s > 0 && x + lw / 2 > right) {
        al = "right";
        x = right;
      }
      ctx.textAlign = al;
      ctx.fillText(lab, x, y);
      const x0 = al === "left" ? x : al === "right" ? x - lw : x - lw / 2;
      spans.push([x0, x0 + lw]);
    }
    const gc = (xOf(guide[0]) + xOf(guide[1])) / 2;
    ctx.font = font(11, 800);
    const gl = [L(`guía ${guide[0]}–${guide[1]} s`, `guide ${guide[0]}–${guide[1]} s`), L("guía", "guide")].find((s) => {
      const lw = ctx.measureText(s).width;
      return spans.every(([p, q]) => gc + lw / 2 + 4 < p || gc - lw / 2 - 4 > q);
    });
    if (gl) {
      ctx.fillStyle = C.target;
      ctx.textAlign = "center";
      ctx.fillText(gl, gc, y);
    }
  }

  /** The guide: a soft green band between two dashed edges (a guide, not a limit). */
  function guideBand(ctx, x0, x1, y, hh, alpha = 0.12) {
    ctx.fillStyle = `rgba(52, 178, 122, ${alpha})`;
    ctx.fillRect(x0, y, x1 - x0, hh);
    ctx.strokeStyle = "rgba(52, 178, 122, 0.55)";
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0 + 0.5, y);
    ctx.lineTo(x0 + 0.5, y + hh);
    ctx.moveTo(x1 - 0.5, y);
    ctx.lineTo(x1 - 0.5, y + hh);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /**
   * The answer: speech and silence against a soft time guide. Top to bottom:
   * a row for the pause marks, the bar, the seconds (with the guide's name),
   * and where there is room the count of pauses.
   */
  function answerStrip(ctx, b, m, q, trk, words, maxBh = 44) {
    const vad = trk.vad;
    const t = trk.t;
    const len = q.aStart != null ? (q.aEnd != null ? q.aEnd : t) - q.aStart : 0;
    const T = Math.max(m.guide[1] + 10, len + 6);
    const xOf = (s) => b.x + (s / T) * b.w;
    const markH = b.h >= 40 ? 11 : 0;
    const ticksH = words && b.h - markH >= 40 ? 15 : 0;
    const avail = b.h - markH - ticksH;
    const countH = words && avail - 16 >= Math.min(maxBh, 28) ? 16 : 0;
    const bh = Math.max(12, Math.min(avail - countH, maxBh));
    const by = b.y + markH + Math.max(0, (avail - countH - bh) / 2);
    ctx.fillStyle = PANEL_SOFT;
    roundRect(ctx, b.x, by, b.w, bh, 6);
    ctx.fill();
    const g0 = xOf(m.guide[0]);
    const g1 = xOf(m.guide[1]);
    guideBand(ctx, g0, g1, by, bh);
    if (q.aStart == null) {
      const nw = Math.max(60, g0 - b.x - 12);
      note(ctx, L("tu respuesta aparece aquí", "your answer appears here"), b.x + 6 + nw / 2, by + bh / 2, nw, C.muted, 11, bh >= 30 ? 2 : 1, true);
    } else {
      const a = q.aStart;
      const e = q.aEnd != null ? q.aEnd : t;
      speechBlocks(ctx, vad, a, e, t, xOf, by, bh, !!markH);
      if (q.aEnd == null) {
        const nx = xOf(t - a);
        ctx.strokeStyle = "rgba(238, 243, 250, 0.55)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(nx, by - 1);
        ctx.lineTo(nx, by + bh + 1);
        ctx.stroke();
      }
    }
    if (ticksH) secondsRow(ctx, xOf, T, by + bh + 3, b.x + b.w, m.guide);
    if (countH && q.aStart != null) {
      ctx.font = font(11, 700);
      ctx.fillStyle = C.muted;
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText(L(`pausas ≥0,5 s: ${q.pauses}`, `pauses ≥0.5 s: ${q.pauses}`), b.x + b.w, by + bh + ticksH + 3);
    }
  }

  /**
   * After Stop: one row per question — the question itself when the row has
   * the height, the silence before it (a chip, ✓ when it reached the gate)
   * and the answer on a shared seconds axis with the soft guide band — under
   * a line of plain facts, and over a key to the marks.
   */
  function gateReview(ctx, box, m) {
    const trk = m.tracker;
    const rows = m.qs.map((q, i) => ({ q, i })).filter((r) => r.q.aStart != null || r.q.silent > 0.3);
    if (!rows.length) {
      note(ctx, L("Sin respuestas todavía.", "No answers yet."), box.x + box.w / 2, box.y + box.h / 2, box.w, C.muted, 13);
      return;
    }
    const lenOf = (q) => (q.aStart != null ? (q.aEnd != null ? q.aEnd : trk.t) - q.aStart : null);
    const answered = rows.filter((r) => r.q.aStart != null);
    const sil = rows.map((r) => r.q.silent);
    const lens = answered.map((r) => lenOf(r.q));
    const narrow = box.w < 480;
    // One line of facts (two on a phone; no score: whether it was concise is the learner's call)
    const facts = [
      L(`${answered.length} ${answered.length === 1 ? "respuesta" : "respuestas"}`, `${answered.length} ${answered.length === 1 ? "answer" : "answers"}`),
      L(`silencio antes ${fmtNum(median(sil), 1)} s`, `silence before ${fmtNum(median(sil), 1)} s`)
    ];
    if (lens.length) facts.push(L(`respuesta ${clock(median(lens))}`, `answer ${clock(median(lens))}`));
    ctx.textAlign = "left";
    ctx.fillStyle = C.text;
    const fplan = wrapPlan(ctx, facts.join(" · ") + (rows.length > 1 ? L(" (medianas)", " (medians)") : ""), box.w - 4, 13, 800, 12, box.h >= 130 ? 2 : 1);
    const factsH = drawLines(ctx, fplan, box.x + 2, box.y - 1) + 5;
    const axisH = 16;
    let avail = box.h - factsH - axisH;
    // The key to the marks, when the rows keep their height
    const keyH = avail - 18 >= rows.length * 30 ? 18 : 0;
    avail -= keyH;
    const rowH = clamp(avail / rows.length, 26, 92);
    const shown = rows.slice(-Math.max(1, Math.floor(avail / rowH)));
    const top = box.y + factsH;
    const labelW = narrow ? 30 : 44;
    const doorW = narrow ? 56 : 64;
    const sx = box.x + labelW + doorW + 12;
    const sw = box.x + box.w - sx;
    const T = Math.max(m.guide[1] + 10, ...m.qs.map((q) => lenOf(q) || 0)) + 2;
    const xOf = (sec) => sx + (sec / T) * sw;
    // The soft guide band across all rows
    const bandBottom = top + shown.length * rowH;
    ctx.fillStyle = "rgba(52, 178, 122, 0.10)";
    ctx.fillRect(xOf(m.guide[0]), top, xOf(m.guide[1]) - xOf(m.guide[0]), bandBottom - top);
    shown.forEach((r, k) => {
      const q = r.q;
      const y = top + k * rowH;
      // A tall row names its question over its line
      const qLine = rowH >= 58 && q.text;
      if (qLine) {
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = C.muted;
        fitOne(ctx, [`«${q.text}»`], box.x + labelW, y + 8, box.w - labelW, 12, 600, 11);
      }
      const lineTop = qLine ? y + 17 : y;
      const region = y + rowH - 3 - lineTop;
      const markH = region >= 30 ? 11 : 0;
      const bh = Math.min(region - markH - 2, 28);
      const by = lineTop + markH + Math.max(0, (region - markH - bh) / 2);
      const cy = by + bh / 2;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = C.muted;
      ctx.font = font(12, 800);
      ctx.fillText(L(`P${r.i + 1}`, `Q${r.i + 1}`), box.x + 2, cy);
      const chipH = Math.min(bh + 4, 28);
      const chip = { x: box.x + labelW, y: cy - chipH / 2, w: doorW, h: chipH };
      ctx.fillStyle = q.gateOk ? C.targetSoft : PANEL_SOFT;
      roundRect(ctx, chip.x, chip.y, chip.w, chip.h, 5);
      ctx.fill();
      ctx.strokeStyle = q.gateOk ? C.target : C.gridStrong;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = q.gateOk ? C.target : C.muted;
      ctx.textAlign = "center";
      // Its words clear of the chip's edges
      const sw0 = `${q.gateOk ? "✓ " : ""}${fmtNum(q.silent, 1)} s`;
      const sw1 = `${fmtNum(q.silent, 1)} s`;
      const cpx = [12, 11].find((p) => {
        ctx.font = font(p, 800, true);
        return ctx.measureText(sw0).width <= chip.w - 12;
      });
      ctx.font = font(cpx || 11, 800, true);
      ctx.fillText(cpx ? sw0 : sw1, chip.x + chip.w / 2, cy + 0.5);
      // The answer
      ctx.fillStyle = PANEL_SOFT;
      roundRect(ctx, sx, by, sw, bh, 4);
      ctx.fill();
      const len = lenOf(q);
      if (len == null) {
        ctx.fillStyle = C.muted;
        ctx.textAlign = "left";
        fitOne(ctx, [q.skipped ? L("saltada", "skipped") : L("sin respuesta", "no answer")], sx + 8, cy, sw - 16, 11, 700, 11);
        return;
      }
      const a = q.aStart;
      const e = q.aEnd != null ? q.aEnd : trk.t;
      speechBlocks(ctx, trk.vad, a, e, trk.t, xOf, by, bh, !!markH);
      // Its length (and pauses when there is room), right after it
      const ex = xOf(len);
      const lenText = clock(len);
      ctx.font = font(12, 800, true);
      const lw = ctx.measureText(lenText).width;
      const rightRoom = sx + sw - ex - 8;
      const after = rightRoom > lw + 6;
      const tx = after ? ex + 6 : ex - 6;
      ctx.fillStyle = C.text;
      ctx.textBaseline = "middle";
      ctx.textAlign = after ? "left" : "right";
      if (!after) backed(ctx, lenText, tx, cy, C.text, 12, 800);
      else ctx.fillText(lenText, tx, cy);
      if (after) {
        const one = q.pauses === 1;
        const pw = L(` · ${q.pauses} ${one ? "pausa" : "pausas"}`, ` · ${q.pauses} ${one ? "pause" : "pauses"}`);
        ctx.font = font(11, 700);
        if (ctx.measureText(pw).width <= rightRoom - lw - 4) {
          ctx.fillStyle = C.muted;
          ctx.textAlign = "left";
          ctx.fillText(pw, tx + lw, cy);
        }
      }
    });
    // Seconds and the guide's name under the rows
    secondsRow(ctx, xOf, T, bandBottom + 3, box.x + box.w, m.guide, T - 2);
    if (keyH) gateKey(ctx, box.x + 2, bandBottom + axisH + keyH / 2 + 1, box.w - 4, m.guide);
  }

  /** The key to the review's marks: voice, a pause, the guide — as far as the width allows. */
  function gateKey(ctx, x, y, maxW, guide) {
    const items = [
      {
        icon: (ix) => {
          ctx.fillStyle = C.you;
          roundRect(ctx, ix, y - 4, 14, 8, 2);
          ctx.fill();
          return 14;
        },
        text: L("voz", "voice")
      },
      { icon: (ix) => (pauseMark(ctx, ix + 5, y + 4, 5), 10), text: L("pausa ≥0,5 s", "pause ≥0.5 s") },
      {
        icon: (ix) => {
          ctx.fillStyle = "rgba(52, 178, 122, 0.3)";
          ctx.fillRect(ix, y - 5, 14, 10);
          return 14;
        },
        text: L(`guía ${guide[0]}–${guide[1]} s`, `guide ${guide[0]}–${guide[1]} s`)
      }
    ];
    ctx.font = font(11, 700);
    let cx = x;
    for (const it of items) {
      const tw = ctx.measureText(it.text).width;
      if (cx + 20 + tw > x + maxW) break;
      const iw = it.icon(cx);
      ctx.font = font(11, 700);
      ctx.fillStyle = C.muted;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(it.text, cx + iw + 5, y);
      cx += iw + 5 + tw + 16;
    }
  }

  /* —— v18 · Story arc —— */

  /**
   * "Arco de historia": the parts of the story as a bar sized by their time
   * (a guide you can move on early, never a cage), and under it on the same
   * time axis your loudness as a ribbon (dB against your own median; pauses
   * are gaps), with a flag where you marked the peak. After Stop: the peak
   * against the context in loudness, pace and the pause before it, and how
   * the last sentence landed — all approximate, no score.
   *
   * model: { phases: [{ label, sec, hint }], starts, index, over, overAt,
   *          ebins: [{ t, db, sp }], medDb, marks, tracker, review, compare }
   */
  function storyArc(ctx, w, h, m) {
    panel(ctx, w, h);
    const pad = 10;
    const tiny = h < 135;
    const compact = h < 190;
    const trk = m.tracker;
    const t = trk.t;
    const ph = m.phases[m.index];
    // Headline + countdown
    const headY = pad + (tiny ? 6 : compact ? 9 : 12);
    let texts;
    let big;
    let bigColor = C.text;
    if (m.review) {
      texts = [L("Tu historia: volumen y pausas, parte por parte", "Your story: loudness and pauses, part by part"), L("Tu historia, parte por parte", "Your story, part by part")];
      big = clock(t);
    } else if (m.over) {
      texts = [L("Cierra con una frase quieta, cuando quieras", "Close with one still sentence, when you like"), L("Cierra con una frase quieta", "Close with one still sentence")];
      big = "+" + clock(t - m.overAt);
      bigColor = C.muted;
    } else {
      texts = [ph.hint || ph.label, lead(ph.hint), ph.label];
      big = clock(Math.ceil(ph.sec - (t - m.starts[m.index])));
    }
    const extra = headRow(ctx, {
      x: pad + 2,
      right: w - pad - 2,
      y: headY,
      big,
      bigPx: tiny ? 15 : compact ? 18 : 22,
      bigColor,
      texts,
      px: tiny || compact ? 14 : 16,
      min: tiny ? 12 : 13,
      lines: tiny || compact || m.review ? 1 : 2
    });

    // One time axis for the bar and the ribbon: the parts as run so far, the
    // rest as planned
    const segs = storySegments(m, t);
    const T = Math.max(segs[segs.length - 1].b, t) + 1;
    const x0 = pad + 2;
    const W = w - pad * 2 - 4;
    const xOf = (s) => x0 + (clamp(s, 0, T) / T) * W;
    const barY = headY + extra + (tiny ? 12 : compact ? 15 : 20);
    const barH = tiny ? 18 : compact ? 22 : m.review && W < 520 ? 26 : 30;
    segs.forEach((s) => {
      const a = xOf(s.a) + 1.5;
      const bw = Math.max(4, xOf(s.b) - xOf(s.a) - 3);
      if (s.over) {
        ctx.fillStyle = V.hatch(ctx, "rgba(170, 195, 230, 0.35)");
        roundRect(ctx, a, barY, bw, barH, 5);
        ctx.fill();
        ctx.fillStyle = C.muted;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (widthAt(ctx, L("extra", "extra"), 11, 700) <= bw - 8) ctx.fillText(L("extra", "extra"), a + bw / 2, barY + barH / 2);
        return;
      }
      const done = s.state === "done" || (m.review && s.state === "cur");
      ctx.fillStyle = done ? DONE_SOFT : "rgba(170, 195, 230, 0.07)";
      roundRect(ctx, a, barY, bw, barH, 5);
      ctx.fill();
      if (s.state === "cur" && !m.review) {
        const f = clamp((t - s.a) / Math.max(0.1, s.b - s.a), 0, 1);
        ctx.fillStyle = C.targetSoft;
        roundRect(ctx, a, barY, Math.max(4, bw * f), barH, 5);
        ctx.fill();
      }
      ctx.lineWidth = s.state === "cur" && !m.review ? 2 : 1;
      ctx.strokeStyle = s.state === "cur" && !m.review ? C.text : done ? "rgba(255, 211, 110, 0.55)" : C.grid;
      roundRect(ctx, a + 0.5, barY + 0.5, bw - 1, barH - 1, 5);
      ctx.stroke();
      ctx.fillStyle = done ? C.done : s.state === "cur" ? C.text : C.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // A part's width follows its time, not its name: the name whole, else
      // shortened with a point ("Aprend."), else the part's number
      const mark = done ? "✓ " : "";
      fitOne(ctx, [...abbrevs(s.label, mark), ...(mark ? abbrevs(s.label) : []), String(s.i + 1)], a + bw / 2, barY + barH / 2 + 0.5, bw - 8, tiny ? 11 : 12, s.state === "cur" ? 800 : 700, 11);
    });

    // The ribbon, and after Stop the facts under it: they get the height they
    // need to be read whole, the ribbon keeps at least 24 px
    const rTop = barY + barH + (tiny ? 5 : 8);
    let cmp = null;
    if (m.review && m.compare) cmp = comparePlan(ctx, m.compare, W, Math.max(22, h - pad - rTop - 24 - 6));
    const cmpH = cmp ? cmp.h : 0;
    const legend =
      compact || m.review
        ? null
        : legendPlan(
            ctx,
            [
              W < 340
                ? L("cinta = tu volumen (dB, aprox.)", "ribbon = your loudness (dB, approx.)")
                : L("cinta = tu volumen (dB, frente a tu mediana)", "ribbon = your loudness (dB, against your median)"),
              L("huecos = pausas", "gaps = pauses"),
              L("⚑ = tu pico", "⚑ = your peak")
            ],
            W,
            11,
            W < 520 ? 2 : 1
          );
    const legendH = legend ? legend.lines.length * legend.lh + 4 : 0;
    const rH = Math.max(18, h - pad - legendH - cmpH - (cmpH ? 6 : 0) - rTop);
    const rMid = rTop + rH / 2;
    ctx.fillStyle = PANEL_SOFT;
    roundRect(ctx, x0, rTop, W, rH, 6);
    ctx.fill();
    // Where the peak is planned: a faint band, so it is coming, not a surprise
    const peakSeg = segs.find((s) => s.key === "peak");
    if (peakSeg && !m.review) {
      ctx.fillStyle = "rgba(255, 211, 110, 0.07)";
      ctx.fillRect(xOf(peakSeg.a), rTop, xOf(peakSeg.b) - xOf(peakSeg.a), rH);
    }
    if (m.review && m.compare) {
      const c = m.compare;
      if (c.setup) {
        ctx.fillStyle = "rgba(170, 195, 230, 0.08)";
        ctx.fillRect(xOf(c.setup[0]), rTop, xOf(c.setup[1]) - xOf(c.setup[0]), rH);
      }
      if (c.peak) {
        ctx.fillStyle = "rgba(255, 211, 110, 0.14)";
        ctx.fillRect(xOf(c.peak[0]), rTop, xOf(c.peak[1]) - xOf(c.peak[0]), rH);
      }
    }
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x0, rMid);
    ctx.lineTo(x0 + W, rMid);
    ctx.stroke();
    const med = m.medDb;
    // One filled band per stretch of speech (half-second bins joined at their
    // centres), thick where you were loud; pauses leave a gap
    ctx.save();
    // Pauses the sound edge found (≥0.3 s) are cut out of the band, so a
    // pause shorter than a bin still shows as a gap
    ctx.beginPath();
    ctx.rect(x0, rTop, W, rH);
    let lastCut = -1;
    trk.vad.segments.forEach((g) => {
      if (g.kind !== "pause") return;
      const e = g.end != null ? g.end : t;
      if (e - g.start < 0.3) return;
      const a = Math.max(xOf(g.start), lastCut);
      const b = xOf(e);
      if (b - a < 0.5) return;
      ctx.rect(a, rTop, b - a, rH);
      lastCut = b;
    });
    ctx.clip("evenodd");
    ctx.fillStyle = C.you;
    ctx.globalAlpha = 0.85;
    let run = [];
    const flush = () => {
      if (!run.length) return;
      const a = run[0];
      const z = run[run.length - 1];
      ctx.beginPath();
      ctx.moveTo(xOf(a.t - 0.25), rMid - a.hh);
      run.forEach((q) => ctx.lineTo(xOf(q.t), rMid - q.hh));
      ctx.lineTo(xOf(z.t + 0.25), rMid - z.hh);
      ctx.lineTo(xOf(z.t + 0.25), rMid + z.hh);
      for (let i = run.length - 1; i >= 0; i--) ctx.lineTo(xOf(run[i].t), rMid + run[i].hh);
      ctx.lineTo(xOf(a.t - 0.25), rMid + a.hh);
      ctx.closePath();
      ctx.fill();
      run = [];
    };
    let prevT = null;
    m.ebins.forEach((b) => {
      if (!b.sp || b.db == null || med == null) {
        flush();
        prevT = null;
        return;
      }
      if (prevT != null && b.t - prevT > 0.55) flush();
      const hh = clamp((b.db - med + 14) / 20, 0.08, 1) * (rH / 2 - 3);
      run.push({ t: b.t, hh });
      prevT = b.t;
    });
    flush();
    ctx.globalAlpha = 1;
    ctx.restore();
    if (med == null && !m.review) {
      note(ctx, L("Tu volumen aparece aquí mientras hablas", "Your loudness appears here as you speak"), x0 + W / 2, rMid, W - 20, C.muted, 12);
    }
    // Peak flags (every mark stays; the last one is the one compared)
    let peakAt = null;
    m.marks.forEach((mk, i) => {
      const fx = xOf(mk);
      const last = i === m.marks.length - 1;
      ctx.strokeStyle = C.done;
      ctx.globalAlpha = last ? 1 : 0.5;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(fx, rTop + 2);
      ctx.lineTo(fx, rTop + rH - 2);
      ctx.stroke();
      glyph(ctx, "flag", fx, rTop + 8, C.done, 5);
      if (last && rH >= 40) peakAt = fx;
      ctx.globalAlpha = 1;
    });
    // Now: a line through the ribbon only; the part's own fill shows where
    // you are in the bar, so the line never runs through a part's name
    if (!m.review) {
      const nx = xOf(t);
      ctx.strokeStyle = "rgba(238, 243, 250, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(nx, rTop - 2);
      ctx.lineTo(nx, rTop + rH + 2);
      ctx.stroke();
    }
    // The flag's word last, on its own backing: over the ribbon and clear of
    // the now line (it goes to the side the line is not on)
    if (peakAt != null) {
      const word = L("pico", "peak");
      ctx.font = font(11, 800);
      const ww = ctx.measureText(word).width;
      const nx = m.review ? null : xOf(t);
      const fitsRight = peakAt + 9 + ww + 3 <= x0 + W;
      const hitsNow = nx != null && nx > peakAt && nx < peakAt + 9 + ww + 6;
      const right = fitsRight && !hitsNow;
      ctx.textAlign = right ? "left" : "right";
      ctx.textBaseline = "top";
      backed(ctx, word, peakAt + (right ? 9 : -10), rTop + 3, C.done, 11, 800);
    }
    m._layout = { barY, barH, rTop, rH, cmpH };
    if (legend) {
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      drawLines(ctx, legend, x0, h - pad - legendH + 4);
    }
    if (cmp) compareCard(ctx, { x: x0, y: h - pad - cmpH, w: W, h: cmpH }, cmp);
  }

  /** Parts of the story on the time axis: as run so far, the rest as planned. */
  function storySegments(m, t) {
    const out = [];
    let at = 0;
    m.phases.forEach((p, i) => {
      let a;
      let b;
      let state;
      if (i < m.index || (m.over && i === m.index)) {
        a = m.starts[i];
        b = i + 1 < m.phases.length ? m.starts[i + 1] : m.overAt;
        state = "done";
      } else if (i === m.index) {
        a = m.starts[i];
        b = a + p.sec;
        state = m.review ? "done" : "cur";
        if (m.review) b = Math.max(a + 0.5, t);
      } else {
        a = at;
        b = a + p.sec;
        state = "next";
      }
      if (m.review && i > m.index) return;
      out.push({ a, b, state, label: p.label, key: p.key, i });
      at = b;
    });
    if (m.over) out.push({ a: m.overAt, b: Math.max(m.overAt + 0.5, t), over: true, state: "over" });
    return out;
  }

  /** The peak against the context as facts: value, words, and an arrow for the way it went. */
  function compareFacts(c) {
    const facts = [];
    if (c.peak) {
      // Words say which way it went, so the sign and arrow are not the only cue
      if (c.dDb != null)
        facts.push({
          k: c.dDb >= 0 ? "rise" : "fall",
          label: c.dDb >= 0 ? L("Pico más fuerte", "Peak louder") : L("Pico más suave", "Peak softer"),
          val: (c.dDb >= 0 ? "+" : "−") + fmtNum(Math.abs(c.dDb), 1) + " dB"
        });
      else facts.push({ k: null, label: L("Volumen: poca voz para comparar", "Loudness: too little voice to compare"), val: "—" });
      if (c.dRate != null)
        facts.push({
          k: c.dRate >= 0 ? "rise" : "fall",
          label: c.dRate >= 0 ? L("Pico más rápido", "Peak quicker") : L("Pico más lento", "Peak slower"),
          val: (c.dRate >= 0 ? "+" : "−") + fmtNum(Math.abs(c.dRate) * 100, 0) + " %"
        });
      facts.push({ k: null, label: L("Pausa antes del pico", "Pause before the peak"), val: c.pauseBefore != null ? fmtNum(c.pauseBefore, 1) + " s" : "—" });
    }
    // Without a peak, what to do about it is the card's title
    if (c.end) {
      const info = endInfo(c.end, C.you);
      facts.push({
        k: info.kind,
        color: info.color,
        label: L("Última frase", "Last sentence"),
        val: info.word + (c.endSilence != null ? ` + ${fmtNum(c.endSilence, 1)} s` : "")
      });
    }
    return facts;
  }

  /** The card's title: what the facts compare, or how to get a peak to compare. */
  function compareTitle(c) {
    if (!c.peak) return L("Sin pico: marca ⚑ o llega a «Pico» para compararlo con el contexto", "No peak: mark ⚑ or reach “Peak” to compare it with the context");
    return c.fromMark
      ? L("Tu pico marcado frente al contexto (aprox.)", "Your marked peak against the context (approx.)")
      : L("La parte «Pico» frente al contexto (aprox.)", "The “Peak” part against the context (approx.)");
  }

  /**
   * How the facts after Stop are laid out: the first layout, roomiest first,
   * whose words all fit whole in the width and whose height fits `maxH` —
   * all in a row (value over words), two columns, then a line each. Without
   * room for the title it goes; with room for nothing, one line of values.
   */
  function comparePlan(ctx, c, W, maxH) {
    const facts = compareFacts(c);
    const inner = W - 12;
    const n = facts.length;
    const iconW = (f) => (f.k ? 20 : 2);
    const valW = (f, px) => {
      ctx.font = font(px, 800, true);
      return ctx.measureText(f.val).width;
    };
    const labW = (f) => widthAt(ctx, f.label, 11, 700);
    const stackOk = (cols) => facts.every((f) => iconW(f) + Math.max(valW(f, 15), labW(f)) <= inner / cols - 8);
    const inlineOk = (cols) => facts.every((f) => iconW(f) + valW(f, 13) + 6 + labW(f) <= inner / cols - 8);
    const layouts = [];
    if (n && stackOk(n)) layouts.push({ kind: "stack", cols: n, h: 38 });
    if (n > 2 && stackOk(2)) layouts.push({ kind: "stack", cols: 2, h: Math.ceil(n / 2) * 38 });
    if (n && inlineOk(1)) layouts.push({ kind: "inline", cols: 1, h: n * 20 });
    if (n > 1 && inlineOk(2)) layouts.push({ kind: "inline", cols: 2, h: Math.ceil(n / 2) * 20 });
    const tplan = wrapPlan(ctx, compareTitle(c), inner, 11, 700, 11, 2);
    const titleH = tplan.fits ? tplan.lines.length * tplan.lh + 2 : 0;
    for (const th of titleH ? [titleH, 0] : [0]) {
      if (!n && th) return { facts, title: tplan, lay: { kind: "none", h: 0 }, h: 8 + th };
      const lay = layouts.find((l) => 8 + th + l.h <= maxH);
      if (lay) return { facts, title: th ? tplan : null, lay, h: 8 + th + lay.h };
    }
    return { facts, title: null, lay: { kind: "line" }, h: Math.min(Math.max(22, maxH), 24) };
  }

  /** After Stop: the peak against the context, as facts with arrows, laid out by comparePlan. */
  function compareCard(ctx, b, plan) {
    const { facts, title, lay } = plan;
    ctx.fillStyle = PANEL_SOFT;
    roundRect(ctx, b.x, b.y, b.w, b.h, 6);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    if (lay.kind === "line") {
      ctx.fillStyle = C.text;
      fitOne(
        ctx,
        [facts.map((f) => `${f.label}: ${f.val}`).join(" · ") + L(" (aprox.)", " (approx.)"), facts.map((f) => f.val).join(" · ")],
        b.x + 6,
        b.y + b.h / 2,
        b.w - 12,
        11,
        700,
        11
      );
      return;
    }
    let y = b.y + 4;
    if (title) {
      ctx.fillStyle = C.muted;
      y += drawLines(ctx, title, b.x + 6, y) + 2;
    }
    const cols = lay.cols || 1;
    const cw = (b.w - 12) / cols;
    const ch = lay.kind === "stack" ? 38 : 20;
    facts.forEach((f, i) => {
      const cx = b.x + 6 + (i % cols) * cw;
      const cy = y + Math.floor(i / cols) * ch;
      const midY = cy + ch / 2;
      if (f.k) endArrow(ctx, f.k, cx + 8, midY, 5, f.color || C.you, 2);
      const vx = cx + (f.k ? 20 : 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      if (lay.kind === "stack") {
        ctx.font = font(15, 800, true);
        ctx.fillStyle = C.text;
        ctx.fillText(f.val, vx, midY - 7);
        ctx.font = font(11, 700);
        ctx.fillStyle = C.muted;
        ctx.fillText(f.label, vx, midY + 10);
      } else {
        ctx.font = font(13, 800, true);
        ctx.fillStyle = C.text;
        ctx.fillText(f.val, vx, midY);
        const vw = ctx.measureText(f.val).width;
        ctx.font = font(11, 700);
        ctx.fillStyle = C.muted;
        ctx.fillText(f.label, vx + vw + 6, midY);
      }
    });
  }

  Object.assign(V.scenes, {
    ShapeTracker,
    analyseEnding,
    melodyRibbon,
    landingStrip,
    concisionGate,
    storyArc,
    speechShapeUtil: { fmtSt, clock, endInfo, runsOf, median, pct },
    textFit: { widthAt, cutAtWord, fitOne, wrapPlan, drawLines, legendPlan, backed, lead, abbrevs, fitChips, headRow, note }
  });
})(typeof window !== "undefined" ? window : globalThis);
