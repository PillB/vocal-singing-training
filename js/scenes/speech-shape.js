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
  const { C, L, font, clamp, fitText, fmtNum, roundRect, panel, chips, glyph } = V;

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

  function note(ctx, text, x, y, maxW, color, px = 12) {
    ctx.fillStyle = color || C.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fitText(ctx, text, x, y, maxW, px, 600, 9);
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
      const chipH = compact ? 26 : 36;
      chips(
        ctx,
        { x: pad, y: top, w: w - pad * 2, h: chipH },
        takes.map((t, i) => ({
          label: t.name,
          short: t.short,
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
    let head = ref == null
      ? L("Habla normal unos segundos: tu tono habitual será la línea 0", "Speak normally for a few seconds: your usual pitch becomes the 0 line")
      : take.hint;
    if (tiny) head = take.short + " · " + head;
    // This take's range, large, on the right
    const range = takeRange(take);
    const big = range != null ? fmtNum(range, 1) + " st" : "— st";
    ctx.font = font(tiny ? 15 : compact ? 18 : 22, 800, true);
    const bigW = ctx.measureText(big).width;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = C.text;
    ctx.fillText(big, w - pad - 2, headY + 1);
    let labW = 0;
    if (w >= 420) {
      ctx.font = font(10, 700);
      ctx.fillStyle = C.muted;
      const lab = L("rango aprox.", "range approx.");
      labW = ctx.measureText(lab).width + 8;
      ctx.fillText(lab, w - pad - 2 - bigW - 8, headY + 1);
    }
    ctx.textAlign = "left";
    ctx.fillStyle = C.text;
    fitText(ctx, head, pad + 2, headY, w - pad * 2 - bigW - labW - 16, tiny || compact ? 13 : 16, 800, 10);

    // The plot
    const legendH = compact ? 0 : 16;
    const plotTop = headY + (tiny ? 12 : compact ? 16 : 20);
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
    if (!tiny && !legendH && w >= 360) {
      // No legend line at this height: name the 0 line in the plot's corner
      ctx.font = font(10, 700);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(L("0 = tu tono habitual", "0 = your usual pitch"), px + 6, py + ph);
    }

    if (ref == null) {
      note(ctx, L("Escuchando tu tono habitual…", "Listening for your usual pitch…"), px + pw / 2, mid + (tiny ? 0 : 16), pw - 20, C.muted, 13);
    } else {
      drawPhrases(ctx, trk, m, take, ref, { px, py, pw, ph, yOf, tiny });
      rangeColumn(ctx, m, take, ref, { x: px + pw + 8, w: colW - 8, y: py, h: ph, yOf, R });
    }

    if (legendH) {
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      fitText(
        ctx,
        L(
          "0 = tu tono habitual · st = semitonos · más grueso = más fuerte · ↘ cae  → plano  ↗ sube",
          "0 = your usual pitch · st = semitones · thicker = louder · ↘ falls  → level  ↗ rises"
        ),
        pad + 2,
        h - pad + 2,
        w - pad * 2,
        10,
        700,
        8
      );
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
      ctx.font = font(big ? 12 : 10, 800);
      ctx.fillStyle = info.color;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const words = big ? (info.num ? info.num.replace(" st", "") + " " : "") + info.word : info.num.replace(" st", "");
      if (words) ctx.fillText(words, clamp(ax, px + 30, px + pw - 34), ay + (big ? 13 : 10), big ? 84 : 40);
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
      ctx.font = font(9, 700);
      ctx.fillStyle = ghost ? C.faint : C.you;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(ghost ? L("base", "base") : L("ahora", "now"), bx + bw / 2, Math.min(y2 + 3, g.y + g.h - 10), bw + 6);
    };
    if (two) bar(base, x + 2, true);
    if (take.p10 != null) bar(take, two ? x + w / 2 + 1 : cx - bw / 2, false);
    else {
      ctx.font = font(9, 700);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(L("rango", "range"), cx, yOf(0) - 10, w);
      ctx.fillText("…", cx, yOf(0) + 4, w);
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
      ctx.textBaseline = "top";
      ctx.fillStyle = C.text;
      fitText(ctx, t.name, box.x, y + 2, labelW - 8, 12, 800, 9);
      if (rowH >= 34) {
        ctx.font = font(10, 700);
        ctx.fillStyle = C.muted;
        ctx.fillText(
          t.range != null ? L(`rango ${fmtNum(t.range, 1)} st aprox.`, `range ${fmtNum(t.range, 1)} st approx.`) : L("rango: poca voz", "range: little voice"),
          box.x,
          y + 18,
          labelW - 8
        );
      }
      if (rowH >= 50) endCounts(ctx, box.x, y + 36, r.ps);
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
    let head;
    const ph = m.phase;
    if (ph === "idle") head = L(`Afirmación ${idx}: dila y deja que caiga`, `Claim ${idx}: say it and let it land`);
    else if (ph === "speaking" || ph === "maybeTag") head = L("Hablando… termina la frase y calla", "Speaking… finish the sentence, then stop");
    else if (ph === "landing") head = L("Silencio… sostén 1 s", "Silence… hold 1 s");
    else if (ph === "landed") head = L("✓ Pausa completa · la siguiente cuando quieras", "✓ Pause held · the next one when you like");
    else head = L("Siguiente afirmación cuando quieras", "Next claim when you like");
    if (m.again && ph !== "speaking") head = L(`Otra vez la ${Math.max(1, n)}: `, `Claim ${Math.max(1, n)} again: `) + head;
    const big = `${landedCount(m)}/${m.claims}`;
    ctx.font = font(tiny ? 15 : compact ? 18 : 22, 800, true);
    const bigW = ctx.measureText(big).width;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = C.text;
    ctx.fillText(big, w - pad - 2, headY + 1);
    let labW = 0;
    if (w >= 460) {
      ctx.font = font(10, 700);
      ctx.fillStyle = C.muted;
      const lab = L("cierres que caen + 1 s (aprox.)", "falls + 1 s pause (approx.)");
      labW = ctx.measureText(lab).width + 8;
      ctx.fillText(lab, w - pad - 2 - bigW - 8, headY + 1);
    } else if (tiny) {
      labW = miniDots(ctx, w - pad - 2 - bigW - 8, headY + 1, m) + 8;
    }
    ctx.textAlign = "left";
    ctx.fillStyle = ph === "landed" ? C.target : C.text;
    fitText(ctx, head, pad + 2, headY, w - pad * 2 - bigW - labW - 14, tiny || compact ? 13 : 16, 800, 10);

    // The card: the claim's line on the left, its ending and pause on the right
    const cardTop = headY + (tiny ? 12 : compact ? 16 : 20);
    const cardH = Math.max(40, h - pad - cardTop);
    const resW = clamp(w * 0.36, 118, 230);
    const cbox = { x: pad, y: cardTop, w: w - pad * 2 - resW - 8, h: cardH };
    const rbox = { x: w - pad - resW, y: cardTop, w: resW, h: cardH };
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
        ctx.font = font(box.h < 34 ? 10 : 11, 800, true);
        ctx.fillStyle = att.pause >= m.need ? C.text : C.muted;
        ctx.textAlign = "left";
        ctx.fillText(fmtNum(Math.min(att.pause, 9.9), 1) + " s", x + 26, cy + 0.5, sw - 30);
      }
      if (landed) {
        glyph(ctx, "check", x + sw - 10, cy, C.done, 4);
      } else if (att.tag) {
        ctx.font = font(10, 800);
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
        12
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
    const inner = { x: b.x + 26, y: b.y + 8, w: b.w - 26 - 24, h: b.h - 16 };
    const mid = inner.y + inner.h / 2;
    const yOf = (v) => mid - clamp(v / R, -1.1, 1.1) * (inner.h / 2 - 2);
    stGrid(ctx, inner.x, inner.w + 16, yOf, R, { labels: inner.h >= 60, step: R > 8 ? 6 : 3 });
    if (inner.h >= 60) {
      ctx.font = font(10, 700);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(L("0 = el medio de tu frase", "0 = the middle of your sentence"), inner.x + 4, inner.y + inner.h);
    }
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
          ctx.font = font(9, 700);
          ctx.fillStyle = C.faint;
          ctx.textAlign = "right";
          ctx.textBaseline = "top";
          ctx.fillText(L("- - intento anterior", "- - previous try"), inner.x + inner.w, inner.y);
        }
      }
    }
    const medDb = median(bins.filter((x) => x.db != null).map((x) => x.db));
    drawRuns(ctx, runs, xOf, yOf, { medDb, alpha: att.fin ? 0.85 : 1 });
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
    const side = b.h < 96;
    const ringR = side ? clamp(b.h * 0.32, 14, 26) : clamp(Math.min(b.w * 0.2, (b.h - 56) * 0.34), 14, 34);
    const waiting = !att || !att.fin || m.phase === "speaking" || (m.phase === "maybeTag" && !att.fin);
    // Ending, in shape and words
    const tx = b.x + 10;
    const ty = side ? b.y + b.h / 2 - 9 : b.y + 20;
    if (waiting) {
      ctx.font = font(12, 700);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      fitText(ctx, L("Al final: ¿cae, plano o sube?", "At the end: falls, level or rises?"), tx, ty, (side ? b.w - ringR * 2 - 24 : b.w - 20), 12, 700, 9);
    } else {
      const info = endInfo(att.fin, C.warn);
      endArrow(ctx, info.kind, tx + 10, ty, 8, info.color, 2.8);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = info.color;
      const wx = tx + 26;
      const maxW = (side ? b.w - ringR * 2 - 24 : b.w - 20) - 26;
      fitText(ctx, info.Word + (info.num ? " " + info.num : ""), wx, ty, maxW, 15, 800, 10);
      let ly = ty + 18;
      if (info.kind === "rise") {
        ctx.font = font(10, 700);
        ctx.fillStyle = C.muted;
        ctx.fillText(L("suena a pregunta", "sounds like a question"), wx, ly, maxW);
        ly += 14;
      }
      if (att.tag) {
        ctx.font = font(10, 800);
        ctx.fillStyle = C.warn;
        ctx.fillText(L("¿etiqueta al final? (¿no?, ¿sabes?)", "tag at the end? (right?, you know?)"), wx, ly, maxW);
        ly += 14;
      } else if (att.fin.fade != null && att.fin.fade < -10 && (!side || ly < b.y + b.h - 6)) {
        ctx.font = font(10, 700);
        ctx.fillStyle = C.muted;
        ctx.fillText(L(`el final se apaga (${fmtNum(att.fin.fade, 0)} dB)`, `the ending fades (${fmtNum(att.fin.fade, 0)} dB)`), wx, ly, maxW);
      }
    }
    // The landing pause: fills over `need` seconds of silence
    const rcx = side ? b.x + b.w - ringR - 12 : b.x + b.w / 2;
    const rcy = side ? b.y + b.h / 2 - 4 : b.y + b.h - ringR - 22;
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
    ctx.font = font(10, 700);
    ctx.fillStyle = full ? C.done : C.muted;
    ctx.fillText((full ? "✓ " : "") + L("pausa", "pause"), rcx, rcy + ringR + 10);
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
    ctx.textBaseline = "top";
    ctx.fillStyle = C.text;
    const sum = L(
      `${landedCount(m)} de ${m.slots.length} cayeron y sostuvieron ${fmtNum(m.need, 0)} s de silencio (aprox.)`,
      `${landedCount(m)} of ${m.slots.length} fell and held ${fmtNum(m.need, 0)} s of silence (approx.)`
    );
    fitText(ctx, sum, box.x, box.y, box.w, 13, 800, 10);
    const top = box.y + 20;
    const cols = rows.length > 4 && box.w >= 560 ? 2 : 1;
    const perCol = Math.ceil(rows.length / cols);
    const colW = (box.w - (cols - 1) * 12) / cols;
    // Narrow: the words on one line and the sentence's line under them
    const stack = colW < 480;
    const rowH = clamp((box.h - 22) / Math.max(perCol, stack ? 3 : 1), 16, stack ? 96 : 56);
    const shown = Math.floor((box.h - 22) / rowH) * cols;
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
      const words = `${info.word}${info.num ? " " + info.num : ""} · ${L("pausa", "pause")} ${fmtNum(Math.min(r.a.pause, 9.9), 1)} s${
        r.a.landed ? " ✓" : ""
      }${r.a.tag ? " · " + L("¿etiqueta?", "tag?") : ""}`;
      const textW = stack ? colW - 46 : Math.min(colW * 0.55, 260);
      ctx.fillStyle = r.a.landed ? C.text : C.muted;
      fitText(ctx, words, x + 42, cy, textW, 11, 700, 9);
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
      const chipH = compact ? 26 : 36;
      const items = [];
      for (let i = 0; i < n; i++) {
        const q = m.qs[i];
        const answered = q && q.aStart != null;
        items.push({
          label: L(`P${i + 1}`, `Q${i + 1}`),
          short: L(`P${i + 1}`, `Q${i + 1}`),
          sub: answered ? `${fmtNum(q.silent, 1)} s · ${clock((q.aEnd != null ? q.aEnd : trk.t) - q.aStart)}` : q && q.skipped ? L("saltada", "skipped") : "",
          done: answered && (q.aEnd != null || m.review)
        });
      }
      const cq = m.qs[m.q];
      chips(ctx, { x: pad, y: top, w: w - pad * 2, h: chipH }, items, {
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
    let head;
    let big;
    let headColor = C.text;
    if (m.flash && t < m.flash.until) {
      head = m.flash.text;
      headColor = C.done;
      big = m.phase === "answer" ? clock(t - q.aStart) : fmtNum(q.silent, 1) + " s";
    } else if (m.phase === "think" && !q.gateOk) {
      head = L("Lee la pregunta en silencio · respira", "Read the question silently · breathe");
      big = fmtNum(q.silent, 1) + " s";
    } else if (m.phase === "think") {
      head = L("✓ Puerta abierta · responde con la idea primero", "✓ Gate open · answer, point first");
      headColor = C.target;
      big = "✓ " + fmtNum(q.silent, 1) + " s";
    } else {
      head = L("Responde: la idea primero, luego cierra", "Answer: point first, then stop");
      big = clock(t - q.aStart);
    }
    const headY = top + (tiny ? 6 : compact ? 9 : 12);
    ctx.font = font(tiny ? 15 : compact ? 18 : 22, 800, true);
    const bigW = ctx.measureText(big).width;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = C.text;
    ctx.fillText(big, w - pad - 2, headY + 1);
    ctx.textAlign = "left";
    ctx.fillStyle = headColor;
    fitText(ctx, (tiny ? L(`P${m.q + 1} · `, `Q${m.q + 1} · `) : "") + head, pad + 2, headY, w - pad * 2 - bigW - 14, tiny || compact ? 13 : 16, 800, 10);
    let y = headY + (tiny ? 12 : compact ? 16 : 20);
    // The question
    if (!tiny) {
      const qH = compact ? 18 : 40;
      ctx.fillStyle = C.muted;
      ctx.font = font(compact ? 12 : 14, 600);
      ctx.textAlign = "left";
      V.wrapText(ctx, `«${q.text}»`, pad + 2, y + (compact ? 7 : 9), w - pad * 2 - 4, compact ? 15 : 18, compact ? 1 : 2);
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
      ctx.font = font(11, 700);
      ctx.fillStyle = C.muted;
      ctx.fillText(L("Silencio para pensar", "Thinking silence"), tx, door.y + 10, tw);
      ctx.font = font(24, 800, true);
      ctx.fillStyle = open ? C.target : C.text;
      ctx.fillText(open ? `✓ ${fmtNum(q.silent, 1)} s` : `${fmtNum(q.silent, 1)} s`, tx, door.y + door.h / 2, tw);
      ctx.font = font(10, 700);
      ctx.fillStyle = open ? C.target : C.faint;
      ctx.fillText(
        open ? L("puerta abierta", "gate open") : L(`la puerta se abre a los ${fmtNum(m.gate, 1)} s`, `the gate opens at ${fmtNum(m.gate, 1)} s`),
        tx,
        door.y + door.h / 2 + 22,
        tw
      );
      if (blips) {
        ctx.fillStyle = C.muted;
        ctx.fillText(blipWords, tx, door.y + door.h - 6, tw);
      }
      const sy = door.y + door.h + 12;
      const sbox = { x: pad + 2, y: sy, w: w - pad * 2 - 4, h: Math.min(bottom - sy, 120) };
      answerStrip(ctx, sbox, m, q, trk, true, 64);
      return;
    }
    const trackH = clamp(bottom - y, 34, 120);
    const labelH = 14;
    const doorW = clamp(w * 0.15, 46, 86);
    const doorH = Math.min(trackH - labelH, 96);
    const door = { x: pad + 2, y: y + (trackH - labelH - doorH) / 2, w: doorW, h: doorH };
    drawDoor(ctx, door, clamp(q.silent / m.gate, 0, 1), open, m.phase === "think" && !q.gateOk);
    ctx.font = font(10, 800, true);
    ctx.fillStyle = open ? C.target : C.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText(
      open ? `✓ ${fmtNum(q.silent, 1)} s` : `${fmtNum(q.silent, 1)} / ${fmtNum(m.gate, 1)} s`,
      door.x + door.w / 2,
      door.y + door.h + 3,
      door.w + 24
    );
    if (blips && trackH >= 60) {
      ctx.font = font(9, 700);
      ctx.fillStyle = C.muted;
      ctx.textBaseline = "bottom";
      ctx.fillText(blipWords, door.x + door.w / 2, door.y - 2, door.w + 24);
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

  /** The answer: speech and silence against a soft time guide; pauses ticked. */
  function answerStrip(ctx, b, m, q, trk, words, maxBh = 44) {
    const vad = trk.vad;
    const t = trk.t;
    const len = q.aStart != null ? (q.aEnd != null ? q.aEnd : t) - q.aStart : 0;
    const T = Math.max(m.guide[1] + 10, len + 6);
    const xOf = (s) => b.x + (s / T) * b.w;
    const bh = Math.min(b.h - (maxBh > 44 ? 40 : 0), maxBh);
    const by = b.y + (b.h - bh) / 2;
    ctx.fillStyle = PANEL_SOFT;
    roundRect(ctx, b.x, by, b.w, bh, 6);
    ctx.fill();
    // The guide: a soft bracket, not a limit
    const g0 = xOf(m.guide[0]);
    const g1 = xOf(m.guide[1]);
    ctx.fillStyle = "rgba(52, 178, 122, 0.12)";
    ctx.fillRect(g0, by, g1 - g0, bh);
    ctx.strokeStyle = "rgba(52, 178, 122, 0.55)";
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(g0 + 0.5, by);
    ctx.lineTo(g0 + 0.5, by + bh);
    ctx.moveTo(g1 - 0.5, by);
    ctx.lineTo(g1 - 0.5, by + bh);
    ctx.stroke();
    ctx.setLineDash([]);
    if (words && b.y + (b.h - bh) / 2 >= b.y + 12) {
      ctx.font = font(9, 700);
      ctx.fillStyle = C.target;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(L(`guía ${m.guide[0]}–${m.guide[1]} s`, `guide ${m.guide[0]}–${m.guide[1]} s`), (g0 + g1) / 2, by - 2, Math.max(60, g1 - g0 + 30));
    }
    if (q.aStart == null) {
      note(ctx, L("tu respuesta aparece aquí", "your answer appears here"), b.x + Math.min(b.w, g0 - b.x) / 2, by + bh / 2, Math.max(60, g0 - b.x - 8), C.faint, 11);
    } else {
      const a = q.aStart;
      const e = q.aEnd != null ? q.aEnd : t;
      vad.segments.forEach((sg) => {
        const s0 = Math.max(a, sg.start);
        const s1 = Math.min(e, sg.end != null ? sg.end : t);
        if (s1 <= s0) return;
        if (sg.kind === "speech") {
          ctx.fillStyle = C.you;
          ctx.globalAlpha = 0.85;
          roundRect(ctx, xOf(s0 - a), by + bh * 0.22, Math.max(2, xOf(s1 - a) - xOf(s0 - a)), bh * 0.56, 3);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else if (sg.end != null && sg.end - sg.start >= 0.5 && sg.end <= e) {
          glyph(ctx, "notch", xOf((s0 + s1) / 2 - a), by + 6, C.muted, 4);
        }
      });
      if (q.aEnd == null) {
        const nx = xOf(t - a);
        ctx.strokeStyle = "rgba(238, 243, 250, 0.55)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(nx, by - 3);
        ctx.lineTo(nx, by + bh + 3);
        ctx.stroke();
      }
    }
    // Seconds under the strip
    if (words && b.h - bh >= 20) {
      ctx.font = font(9, 700);
      ctx.fillStyle = C.faint;
      ctx.textBaseline = "top";
      for (let s = 0; s <= T; s += 10) {
        ctx.textAlign = s === 0 ? "left" : "center";
        ctx.fillText(`${s} s`, xOf(s), by + bh + 3);
      }
      if (q.aStart != null) {
        ctx.textAlign = "right";
        ctx.fillStyle = C.muted;
        ctx.fillText(L(`pausas ≥0,5 s: ${q.pauses}`, `pauses ≥0.5 s: ${q.pauses}`), b.x + b.w, by + bh + 14);
      }
    }
  }

  /**
   * After Stop: one row per question — the silence before it (a chip, ✓ when
   * it reached the gate) and the answer on a shared seconds axis with the
   * soft guide band — under a line of plain facts.
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
    // One line of facts (no score: whether it was concise is the learner's call)
    const facts = [
      L(`${answered.length} ${answered.length === 1 ? "respuesta" : "respuestas"}`, `${answered.length} ${answered.length === 1 ? "answer" : "answers"}`),
      L(`silencio antes ${fmtNum(median(sil), 1)} s`, `silence before ${fmtNum(median(sil), 1)} s`)
    ];
    if (lens.length) facts.push(L(`respuesta ${clock(median(lens))}`, `answer ${clock(median(lens))}`));
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = C.text;
    fitText(ctx, facts.join(" · ") + (rows.length > 1 ? L(" (medianas)", " (medians)") : ""), box.x + 2, box.y + 8, box.w - 4, 13, 800, 9);
    const axisH = 14;
    const top = box.y + 22;
    const avail = box.h - 22 - axisH;
    const rowH = clamp(avail / Math.max(rows.length, 3), 20, 58);
    const shown = rows.slice(-Math.max(1, Math.floor(avail / rowH)));
    const labelW = narrow ? 30 : 44;
    // The silence before each answer as a chip: "✓ 3,3 s" when it reached the gate
    const chipH = Math.min(rowH - 8, 28);
    const doorW = narrow ? 50 : 60;
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
      const cy = y + rowH / 2;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = C.muted;
      ctx.font = font(11, 800);
      ctx.fillText(L(`P${r.i + 1}`, `Q${r.i + 1}`), box.x + 2, cy, labelW - 4);
      const chip = { x: box.x + labelW, y: cy - chipH / 2, w: doorW, h: chipH };
      ctx.fillStyle = q.gateOk ? C.targetSoft : PANEL_SOFT;
      roundRect(ctx, chip.x, chip.y, chip.w, chip.h, 5);
      ctx.fill();
      ctx.strokeStyle = q.gateOk ? C.target : C.gridStrong;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.font = font(11, 800, true);
      ctx.fillStyle = q.gateOk ? C.target : C.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(`${q.gateOk ? "✓ " : ""}${fmtNum(q.silent, 1)} s`, chip.x + chip.w / 2, cy + 0.5, chip.w - 6);
      // The answer
      const bh = Math.min(rowH - 8, 26);
      const by = cy - bh / 2;
      ctx.fillStyle = PANEL_SOFT;
      roundRect(ctx, sx, by, sw, bh, 4);
      ctx.fill();
      const len = lenOf(q);
      if (len == null) {
        ctx.fillStyle = C.faint;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        fitText(ctx, q.skipped ? L("saltada", "skipped") : L("sin respuesta", "no answer"), sx + 8, cy, sw - 16, 11, 700, 9);
        return;
      }
      const a = q.aStart;
      const e = q.aEnd != null ? q.aEnd : trk.t;
      trk.vad.segments.forEach((sg) => {
        const s0 = Math.max(a, sg.start);
        const s1 = Math.min(e, sg.end != null ? sg.end : trk.t);
        if (s1 <= s0) return;
        if (sg.kind === "speech") {
          ctx.fillStyle = C.you;
          ctx.globalAlpha = 0.85;
          roundRect(ctx, xOf(s0 - a), by + bh * 0.18, Math.max(2, xOf(s1 - a) - xOf(s0 - a)), bh * 0.64, 2);
          ctx.fill();
          ctx.globalAlpha = 1;
        } else if (sg.end != null && sg.end - sg.start >= 0.5 && sg.end <= e && bh >= 18) {
          glyph(ctx, "notch", xOf((s0 + s1) / 2 - a), by + 4, C.muted, 3.5);
        }
      });
      // Its length (and pauses when there is room), right after it
      const ex = xOf(len);
      const lenText = clock(len);
      ctx.font = font(11, 800, true);
      const lw = ctx.measureText(lenText).width;
      const rightRoom = sx + sw - ex - 8;
      const after = rightRoom > lw + 6;
      const tx = after ? ex + 6 : ex - 6;
      ctx.fillStyle = C.text;
      ctx.textBaseline = "middle";
      ctx.textAlign = after ? "left" : "right";
      ctx.fillText(lenText, tx, cy);
      if (after && rowH >= 30 && rightRoom > lw + 70) {
        ctx.font = font(10, 700);
        ctx.fillStyle = C.muted;
        ctx.textAlign = "left";
        const one = q.pauses === 1;
        ctx.fillText(L(` · ${q.pauses} ${one ? "pausa" : "pausas"}`, ` · ${q.pauses} ${one ? "pause" : "pauses"}`), tx + lw, cy, rightRoom - lw - 4);
      }
    });
    // Seconds and the guide's name under the rows
    ctx.font = font(9, 700);
    ctx.textBaseline = "top";
    const ay = bandBottom + 2;
    for (let sec = 0; sec <= T - 2; sec += 10) {
      ctx.fillStyle = C.faint;
      ctx.textAlign = sec === 0 ? "left" : "center";
      ctx.fillText(`${sec} s`, xOf(sec), ay);
    }
    if (xOf(m.guide[1]) - xOf(m.guide[0]) >= 80) {
      ctx.fillStyle = C.target;
      ctx.textAlign = "center";
      ctx.fillText(L("guía", "guide"), (xOf(m.guide[0]) + xOf(m.guide[1])) / 2, ay);
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
    let head;
    let big;
    let bigColor = C.text;
    if (m.review) {
      head = L("Tu historia: volumen y pausas, parte por parte", "Your story: loudness and pauses, part by part");
      big = clock(t);
    } else if (m.over) {
      head = L("Cierra con una frase quieta, cuando quieras", "Close with one still sentence, when you like");
      big = "+" + clock(t - m.overAt);
      bigColor = C.muted;
    } else {
      head = ph.hint || ph.label;
      big = clock(Math.ceil(ph.sec - (t - m.starts[m.index])));
    }
    ctx.font = font(tiny ? 15 : compact ? 18 : 22, 800, true);
    const bigW = ctx.measureText(big).width;
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = bigColor;
    ctx.fillText(big, w - pad - 2, headY + 1);
    ctx.textAlign = "left";
    ctx.fillStyle = C.text;
    fitText(ctx, head, pad + 2, headY, w - pad * 2 - bigW - 14, tiny || compact ? 13 : 16, 800, 10);

    // One time axis for the bar and the ribbon: the parts as run so far, the
    // rest as planned
    const segs = storySegments(m, t);
    const T = Math.max(segs[segs.length - 1].b, t) + 1;
    const x0 = pad + 2;
    const W = w - pad * 2 - 4;
    const xOf = (s) => x0 + (clamp(s, 0, T) / T) * W;
    const barY = headY + (tiny ? 12 : compact ? 15 : 20);
    const barH = tiny ? 18 : compact ? 22 : 30;
    segs.forEach((s) => {
      const a = xOf(s.a) + 1.5;
      const bw = Math.max(4, xOf(s.b) - xOf(s.a) - 3);
      if (s.over) {
        ctx.fillStyle = V.hatch(ctx, "rgba(170, 195, 230, 0.35)");
        roundRect(ctx, a, barY, bw, barH, 5);
        ctx.fill();
        ctx.font = font(10, 700);
        ctx.fillStyle = C.muted;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        if (bw > 30) ctx.fillText(L("extra", "extra"), a + bw / 2, barY + barH / 2, bw - 4);
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
      fitText(ctx, (done ? "✓ " : "") + s.label, a + bw / 2, barY + barH / 2 + 0.5, bw - 6, tiny ? 10 : 12, s.state === "cur" ? 800 : 700, 8);
    });

    // The ribbon
    // After Stop the facts get room; on a tall, narrow panel one fact per row
    let cmpH = 0;
    if (m.review && m.compare) {
      const nf = compareFacts(m.compare).length;
      cmpH = tiny ? 16 : compact ? 34 : W < 520 && h > 360 ? 18 + nf * 42 : 64;
    }
    const legendH = compact || m.review ? 0 : 16;
    const rTop = barY + barH + (tiny ? 5 : 8);
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
      note(ctx, L("Tu volumen aparece aquí mientras hablas", "Your loudness appears here as you speak"), x0 + W / 2, rMid, W - 20, C.faint, 12);
    }
    // Peak flags (every mark stays; the last one is the one compared)
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
      if (last && rH >= 40) {
        ctx.font = font(10, 800);
        ctx.fillStyle = C.done;
        ctx.textAlign = fx > x0 + W - 50 ? "right" : "left";
        ctx.textBaseline = "top";
        ctx.fillText(L("pico", "peak"), fx + (fx > x0 + W - 50 ? -10 : 9), rTop + 3);
      }
      ctx.globalAlpha = 1;
    });
    // Now
    if (!m.review) {
      const nx = xOf(t);
      ctx.strokeStyle = "rgba(238, 243, 250, 0.6)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(nx, barY - 3);
      ctx.lineTo(nx, rTop + rH + 2);
      ctx.stroke();
    }
    if (legendH) {
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      fitText(
        ctx,
        L("cinta = tu volumen (dB, frente a tu mediana) · huecos = pausas · ⚑ = tu pico", "ribbon = your loudness (dB, against your median) · gaps = pauses · ⚑ = your peak"),
        x0,
        h - pad + 2,
        W,
        10,
        700,
        8
      );
    }
    if (cmpH) compareCard(ctx, { x: x0, y: h - pad - cmpH, w: W, h: cmpH }, m.compare, tiny);
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
      out.push({ a, b, state, label: p.label, key: p.key });
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
    } else {
      facts.push({ k: null, label: L("Marca ⚑ o llega a «Pico» para compararlo", "Mark ⚑ or reach “Peak” to compare it"), val: L("Sin pico", "No peak") });
    }
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

  /** After Stop: the peak against the context, as facts with arrows. */
  function compareCard(ctx, b, c, tiny) {
    const facts = compareFacts(c);
    ctx.fillStyle = PANEL_SOFT;
    roundRect(ctx, b.x, b.y, b.w, b.h, 6);
    ctx.fill();
    if (tiny || b.h < 30) {
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillStyle = C.text;
      fitText(ctx, facts.map((f) => `${f.label}: ${f.val}`).join(" · ") + L(" (aprox.)", " (approx.)"), b.x + 6, b.y + b.h / 2, b.w - 12, 11, 700, 8);
      return;
    }
    ctx.font = font(10, 700);
    ctx.fillStyle = C.faint;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    const title = !c.peak
      ? L("El pico frente al contexto", "The peak against the context")
      : c.fromMark
        ? L("Tu pico marcado frente al contexto (aprox.)", "Your marked peak against the context (approx.)")
        : L("La parte «Pico» frente al contexto (aprox.)", "The “Peak” part against the context (approx.)");
    ctx.fillText(title, b.x + 6, b.y + 4, b.w - 12);
    const cols = b.w >= 520 ? facts.length : b.h - 18 >= facts.length * 38 ? 1 : 2;
    const rows = Math.ceil(facts.length / cols);
    const cw = (b.w - 12) / cols;
    const ch = (b.h - 18) / rows;
    facts.forEach((f, i) => {
      const cx = b.x + 6 + (i % cols) * cw;
      const cy = b.y + 18 + Math.floor(i / cols) * ch;
      const midY = cy + ch / 2;
      if (f.k) endArrow(ctx, f.k, cx + 8, midY, 5, f.color || C.you, 2);
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = font(ch >= 40 ? 15 : 12, 800, true);
      ctx.fillStyle = C.text;
      const vx = cx + (f.k ? 20 : 2);
      ctx.fillText(f.val, vx, ch >= 40 ? midY - 7 : midY, cw - 24);
      if (ch >= 40) {
        ctx.font = font(10, 700);
        ctx.fillStyle = C.muted;
        ctx.fillText(f.label, vx, midY + 10, cw - 24);
      } else {
        const vw = ctx.measureText(f.val).width;
        ctx.font = font(10, 700);
        ctx.fillStyle = C.muted;
        ctx.fillText(f.label, vx + vw + 6, midY, Math.max(10, cw - 30 - vw));
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
    speechShapeUtil: { fmtSt, clock, endInfo, runsOf, median, pct }
  });
})(typeof window !== "undefined" ? window : globalThis);
