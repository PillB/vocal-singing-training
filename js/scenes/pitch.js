/**
 * Exercise pictures — pitch. For these exercises the note highway
 * (js/pitch-visualizer.js) IS the picture: it sits in the first screen and the
 * mode panel sits below the stage, often below the fold. So the cue that
 * matters is drawn on the highway, through its overlay hook, and the panel is
 * only a compact summary.
 *
 * What every picture here follows (docs/39-EXERCISE-VISUALS.md, the research
 * synthesis §3 A–C):
 * - Your voice is one light-blue line drawn from the raw pitch, so a breath is
 *   a gap and not a flat "in tune" plateau; a thin raw line under a thicker
 *   smoothed one, so vibrato is not an error.
 * - The target is a band as wide as the tolerance that actually counts, in
 *   cents; the notes still to sing wait to the right of "now" (the path ahead).
 * - No running score, no per-frame PERFECT/MISS words. A note gets its result
 *   when it ends (an offset tick), a take gets its detailed map after Stop.
 * - Nothing red. A break, a pause, a note off target is described with a
 *   shape and a word ("salto", "sube ↑"), never judged.
 * - The pitch detector is reliable from about 65 to 400 Hz and reads an octave
 *   low above that: an octave match counts, and anything estimated says
 *   "aprox.".
 *
 * Registers V.scenes.pitchKit (measuring helpers the pitch modes share) and
 * one overlay painter per exercise family: pitchSiren, pitchHold, pitchStones,
 * pitchMatch, pitchChord, pitchSong.
 */
(function (global) {
  "use strict";
  const V = global.VTViz;
  if (!V) return;
  const { C, L, font, clamp, roundRect, glyph, fmtNum, median, std } = V;

  /* —— Notes and numbers —— */

  const SOL = ["Do", "Do♯", "Re", "Re♯", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "La♯", "Si"];
  const LET = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

  function hzToMidi(f) {
    return 69 + 12 * Math.log2(f / 440);
  }
  function midiToHz(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }
  function pcOf(m) {
    return ((Math.round(m) % 12) + 12) % 12;
  }
  /** "Mi3" in Spanish (fixed Do), "E3" in English. */
  function noteName(midi) {
    if (!Number.isFinite(midi)) return "—";
    const r = Math.round(midi);
    const oct = Math.floor(r / 12) - 1;
    return (V.isEs() ? SOL[pcOf(r)] : LET[pcOf(r)]) + oct;
  }
  /** "Mi3 · E3" in Spanish, "E3" in English (lane labels). */
  function noteDual(midi) {
    const r = Math.round(midi);
    const oct = Math.floor(r / 12) - 1;
    return V.isEs() ? `${SOL[pcOf(r)]}${oct} · ${LET[pcOf(r)]}${oct}` : `${LET[pcOf(r)]}${oct}`;
  }
  function nameToMidi(name) {
    const f = global.VT_NOTE_FREQ && global.VT_NOTE_FREQ[name];
    return f ? hzToMidi(f) : null;
  }
  /** "+12¢", "−8¢" (a real minus sign). */
  function fmtCents(c) {
    const r = Math.round(c);
    return (r > 0 ? "+" : r < 0 ? "−" : "±") + Math.abs(r) + "¢";
  }
  /** Cents to the nearest octave of the target: an octave match is the same note. */
  function foldCents(c) {
    return Math.abs(c) > 600 ? ((((c + 600) % 1200) + 1200) % 1200) - 600 : c;
  }
  /** Semitones, in words ("19 semitonos"). */
  function semis(n) {
    const k = Math.round(n);
    return L(`${k} ${k === 1 ? "semitono" : "semitonos"}`, `${k} ${k === 1 ? "semitone" : "semitones"}`);
  }
  /** Octave shift from the app (whole octaves the material moved for this voice). */
  function octaveShift() {
    try {
      return typeof global.VTGetOctaveShift === "function" ? Number(global.VTGetOctaveShift()) || 0 : 0;
    } catch {
      return 0;
    }
  }
  function highway() {
    try {
      return typeof global.VTGetPitchViz === "function" ? global.VTGetPitchViz() : null;
    } catch {
      return null;
    }
  }

  /* —— A pitch trace of your own voice, by the clock —— */

  /**
   * Points { t (performance.now ms), m (MIDI | null for no pitch), db (level vs
   * your own median, dB | null), q (0 plain · 1 estimated "aprox." · 2 creak) }.
   * Fed from frame.rawFreq, which has no grace: a breath is a gap.
   */
  class Trace {
    constructor(sec = 12) {
      this.sec = sec;
      this.pts = [];
    }
    push(t, m, db, q) {
      this.pts.push({ t, m: Number.isFinite(m) ? m : null, db: Number.isFinite(db) ? db : null, q: q || 0 });
      const cut = t - (this.sec + 2) * 1000;
      let k = 0;
      while (k < this.pts.length - 2 && this.pts[k].t < cut) k++;
      if (k > 48) this.pts.splice(0, k);
    }
    clear() {
      this.pts.length = 0;
    }
    get last() {
      return this.pts[this.pts.length - 1] || null;
    }
  }

  /**
   * Holding a note inside a band: a five-frame median of the raw pitch, a
   * short blank while the reference note rings (it bleeds into the mic), an
   * accumulator that bleeds at half rate instead of resetting on one stray
   * frame (vibrato brushing the edge), and the note's result — median offset
   * and spread over the steady part, the first 150 ms of it left out.
   */
  class NoteGate {
    constructor(opts = {}) {
      this.o = Object.assign(
        { tol: 40, holdMs: 700, blankMs: 300, fold: true, bleed: 0.5, skipMs: 150 },
        opts
      );
      this.targets = [];
      this.reset();
    }
    /** One target MIDI, or several (any chord tone counts). */
    setTarget(midi, opts = {}) {
      this.targets = (Array.isArray(midi) ? midi : [midi]).filter(Number.isFinite);
      this.reset();
      if (opts.blankMs != null) this.blank = opts.blankMs;
    }
    reset() {
      this.acc = 0;
      this.blank = this.o.blankMs;
      this.hist = [];
      this.samples = [];
      this.levels = [];
      this.elapsed = 0;
      this.firstIn = null;
      this.gapMs = 0;
      this.outMs = 0;
      this.cents = null;
      this.rawCents = null;
      this.hit = null;
      this.midi = null;
      this.done = false;
    }
    get frac() {
      return clamp(this.acc / this.o.holdMs, 0, 1);
    }
    /** @returns {boolean} true on the frame the note locks */
    feed(frame, relDb) {
      if (this.done || !this.targets.length) return false;
      const dt = Math.min(100, Math.max(0, (frame && frame.dtMs) || 16));
      this.elapsed += dt;
      const f = frame && frame.rawFreq;
      const live = !!f && frame.sounding !== false;
      if (this.blank > 0) {
        this.blank -= dt;
        this.cents = null;
        return false;
      }
      if (!live) {
        this.gapMs += dt;
        this.cents = null;
        if (this.gapMs > 150) {
          this.hist.length = 0;
          this.acc = Math.max(0, this.acc - dt * this.o.bleed);
          this.outMs = 0;
        }
        return false;
      }
      this.gapMs = 0;
      this.hist.push(hzToMidi(f));
      if (this.hist.length > 5) this.hist.shift();
      const m = median(this.hist);
      this.midi = m;
      // Nearest target (any chord tone counts)
      let best = null;
      this.targets.forEach((t) => {
        const raw = (m - t) * 100;
        const c = this.o.fold ? foldCents(raw) : raw;
        if (!best || Math.abs(c) < Math.abs(best.c)) best = { t, c, raw };
      });
      this.cents = best.c;
      this.rawCents = best.raw;
      this.hit = best.t;
      if (Math.abs(best.c) <= this.o.tol) {
        if (this.firstIn == null) this.firstIn = this.elapsed;
        this.acc += dt;
        this.outMs = 0;
        if (this.elapsed - this.firstIn >= this.o.skipMs) {
          this.samples.push(best.c);
          if (Number.isFinite(relDb)) this.levels.push(relDb);
        }
      } else {
        this.acc = Math.max(0, this.acc - dt * this.o.bleed);
        this.outMs += dt;
      }
      if (this.acc >= this.o.holdMs) {
        this.done = true;
        return true;
      }
      return false;
    }
    /** The note's result: median offset, spread, settle time, level, octave. */
    result() {
      const s = this.samples.length ? this.samples : this.cents != null ? [this.cents] : [];
      return {
        cents: s.length ? median(s) : null,
        sd: s.length > 2 ? std(s) : null,
        settleMs: this.firstIn,
        level: this.levels.length ? median(this.levels) : null,
        octave: this.rawCents != null && Math.abs(this.rawCents) > 600,
        hit: this.hit
      };
    }
    /** "sube ↑" / "baja ↓" once you have been outside the band for 250 ms. */
    direction() {
      if (this.cents == null || this.outMs < 250) return null;
      return this.cents < 0 ? "up" : "down";
    }
  }

  /* —— Painting helpers —— */

  const BACK = "rgba(6, 10, 16, 0.8)";

  function room(geo) {
    return (geo.graphH || 0) - (geo.safeTop || 0);
  }
  /** "tiny" (a rotated phone), "compact", "full" — by the plot height left under the top rail. */
  function sizeOf(geo) {
    const h = room(geo);
    return h < 150 ? "tiny" : h < 250 ? "compact" : "full";
  }
  /**
   * The px an overlay's header rows take under the top rail, for the
   * highway's display.headPx: header only when tiny; with the chips or the
   * chord strip otherwise.
   */
  function headPx(rows) {
    return (gh, safeTop) => {
      const h = gh - (safeTop || 0);
      const size = h < 150 ? "tiny" : h < 250 ? "compact" : "full";
      if (size === "tiny") return 30;
      if (rows === "chips") return size === "compact" ? 62 : 66;
      if (rows === "strip") return 56;
      if (rows === "phrases") return size === "compact" ? 56 : 72;
      // Title, the 2 s bar and (full size) the shelf of recent holds
      if (rows === "hold") return size === "compact" ? 62 : 104;
      return 32;
    };
  }
  function clipPlot(ctx, geo) {
    ctx.beginPath();
    ctx.rect(geo.plotLeft, 0, geo.laneRight - geo.plotLeft, geo.graphH);
    ctx.clip();
  }
  function textW(ctx, text, px, weight) {
    ctx.font = font(px, weight);
    return ctx.measureText(text).width;
  }

  /* —— Words that fit: never condensed with fillText's maxWidth —— */

  let measure = null;
  /** A 2D context for measuring words outside a draw (the review's layout). */
  function measureCtx() {
    if (!measure) {
      try {
        measure = document.createElement("canvas").getContext("2d");
      } catch {
        measure = null;
      }
    }
    return measure;
  }
  /** Words wrapped into lines no wider than maxW, at the font already set. */
  function wrapLines(ctx, text, maxW) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    words.forEach((w) => {
      const test = line ? line + " " + w : w;
      if (line && ctx.measureText(test).width > maxW) {
        lines.push(line);
        line = w;
      } else line = test;
    });
    if (line) lines.push(line);
    return lines;
  }
  /** The first of `options` that fits maxW whole at this size, or null (then nothing is drawn). */
  function fitOption(ctx, options, maxW, px, weight) {
    ctx.font = font(px, weight);
    for (const t of [].concat(options)) {
      if (t != null && t !== "" && ctx.measureText(t).width <= maxW) return t;
    }
    return null;
  }
  /** Text at (x, y) only when one of `options` fits whole; returns its width or 0. */
  function textIfFits(ctx, options, x, y, maxW, px, weight) {
    const t = fitOption(ctx, options, maxW, px, weight);
    if (t == null) return 0;
    ctx.fillText(t, x, y);
    return ctx.measureText(t).width;
  }

  /** Text on a dark pill, so it reads over lanes and traces. Returns its width. */
  function pill(ctx, text, x, y, opts = {}) {
    const px = opts.px || 12;
    const weight = opts.weight || 800;
    ctx.font = font(px, weight);
    let t = String(text);
    const maxW = opts.maxW || 9999;
    while (t.length > 2 && ctx.measureText(t).width > maxW - 10) t = t.slice(0, -2) + "…";
    const tw = ctx.measureText(t).width;
    const h = opts.h || px + 9;
    const align = opts.align || "left";
    const bx = align === "right" ? x - tw - 10 : align === "center" ? x - tw / 2 - 5 : x;
    ctx.fillStyle = opts.back || BACK;
    roundRect(ctx, bx, y, tw + 10, h, 6);
    ctx.fill();
    if (opts.stroke) {
      ctx.strokeStyle = opts.stroke;
      ctx.lineWidth = 1.5;
      roundRect(ctx, bx + 0.5, y + 0.5, tw + 9, h - 1, 6);
      ctx.stroke();
    }
    ctx.fillStyle = opts.color || C.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(t, bx + 5, y + h / 2 + 0.5);
    return tw + 10;
  }

  const HEAD_H = 23;
  /** The y under the header row. */
  function headBottom(geo) {
    return (geo.safeTop || 0) + 4 + HEAD_H;
  }

  /**
   * The top line of the picture, just under the stage's top rail: what is
   * happening, in words, on the left; the count or the extent on the right.
   * `left` and `right` may each be a list, longest first: the first pair that
   * fits whole is drawn (the left one wins, the right one may be left out),
   * so a phone gets shorter words instead of cut ones. Returns the y under it.
   */
  function header(ctx, geo, left, right, opts = {}) {
    const size = sizeOf(geo);
    const y = (geo.safeTop || 0) + 4;
    const px = 13;
    const pxR = 12;
    const h = HEAD_H;
    const x = geo.plotLeft;
    const span = geo.laneRight - x - 4;
    const lefts = [].concat(left || []).filter(Boolean);
    const rights = [].concat(right || []).filter(Boolean);
    const wOf = (t, p, wt) => (t ? textW(ctx, t, p, wt) + 10 : 0);
    let pick = null;
    for (const l of lefts.length ? lefts : [""]) {
      const wl = wOf(l, px, 800);
      if (wl > span) continue;
      let r = "";
      for (const rr of rights) {
        if (wl + 8 + wOf(rr, pxR, 700) <= span) {
          r = rr;
          break;
        }
      }
      pick = { l, r };
      break;
    }
    // Nothing fits whole (should not happen with a short form last): the pill cuts it
    if (!pick) pick = { l: lefts[lefts.length - 1] || "", r: "" };
    let used = 0;
    if (pick.l) {
      used = pill(ctx, pick.l, x, y, { px, h, color: opts.leftColor || C.text, maxW: span, stroke: opts.leftStroke });
    }
    // The pips only where there is room for them and the words on the right
    if (opts.pips && size !== "tiny" && span > 460) {
      const pw = Math.min(12, opts.pips.of || 0) * 11 + 8;
      const wr = pick.r ? wOf(pick.r, pxR, 700) + 8 : 0;
      if (used + 12 + pw + wr <= span) used += drawPips(ctx, x + used + 6, y + h / 2, opts.pips, size) + 6;
    }
    if (pick.r) {
      pill(ctx, pick.r, geo.laneRight - 4, y, { px: pxR, h, weight: 700, align: "right", color: opts.rightColor || C.muted });
    }
    return y + h;
  }

  /** ●●●○○ — done ones filled gold, the rest outlined: shape and colour. */
  function drawPips(ctx, x, cy, pips, size) {
    const n = Math.min(12, pips.of || 0);
    if (!n || size === "tiny") return 0;
    const r = 4;
    const gap = 11;
    ctx.fillStyle = BACK;
    roundRect(ctx, x - 5, cy - 9, n * gap + 8, 18, 9);
    ctx.fill();
    for (let i = 0; i < n; i++) {
      const cx = x + i * gap + r;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      if (i < pips.done) {
        ctx.fillStyle = C.done;
        ctx.fill();
      } else {
        ctx.strokeStyle = C.muted;
        ctx.lineWidth = 1.3;
        ctx.stroke();
      }
    }
    return n * gap + 8;
  }

  /** Line width from level in dB vs your own median: louder = thicker, never a colour. */
  function levelWidth(db, base = 2.6) {
    if (!Number.isFinite(db)) return base;
    return clamp(base + (clamp(db, -9, 12) / 12) * 2.6, 1.3, 5.6);
  }

  /**
   * Your voice: a thin raw line and a thicker smoothed centre line (about
   * 120 ms) on top, so vibrato reads as a wobble around a line, not as error.
   * Gaps stay gaps. Estimated stretches (q=1) are dashed. opts: { alpha,
   * widthOf(p), color, skip(p) }
   */
  /** Whether your line (as drawTrace draws it) runs through the rectangle r. */
  function traceHits(geo, pts, r, gapMs = 160) {
    if (!pts || !geo.xAtTime) return false;
    const inside = (x, y) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    let prev = null;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.m == null) {
        prev = null;
        continue;
      }
      const x = geo.xAtTime(p.t);
      const y = geo.midiToY(p.m);
      if (inside(x, y)) return true;
      if (prev && p.t - prev.t < gapMs && Math.max(x, prev.x) >= r.x && Math.min(x, prev.x) <= r.x + r.w) {
        for (let k = 1; k < 8; k++) {
          if (inside(prev.x + ((x - prev.x) * k) / 8, prev.y + ((y - prev.y) * k) / 8)) return true;
        }
      }
      prev = { t: p.t, x, y };
    }
    return false;
  }

  function drawTrace(ctx, geo, pts, opts = {}) {
    if (!pts || pts.length < 2 || !geo.xAtTime) return;
    const gapMs = opts.gapMs || 160;
    const x0 = geo.plotLeft - 2;
    const color = opts.color || C.you;
    const alpha = opts.alpha != null ? opts.alpha : 1;
    const skip = opts.skip || null;
    ctx.save();
    clipPlot(ctx, geo);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    // Raw
    ctx.globalAlpha = 0.32 * alpha;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    let prev = null;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.m == null || (skip && skip(p))) {
        prev = null;
        continue;
      }
      const x = geo.xAtTime(p.t);
      const y = geo.midiToY(p.m);
      if (prev && p.t - prev.t < gapMs && x >= x0) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      prev = p;
    }
    ctx.stroke();
    // Smoothed, in runs of the same width and kind
    ctx.globalAlpha = alpha;
    let s = null;
    let run = null;
    const flush = () => {
      if (run && run.n > 1) {
        ctx.lineWidth = run.w;
        ctx.setLineDash(run.q === 1 ? [5, 4] : []);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      run = null;
    };
    prev = null;
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.m == null || (skip && skip(p))) {
        flush();
        prev = null;
        s = null;
        continue;
      }
      const cont = prev && p.t - prev.t < gapMs;
      if (!cont) s = p.m;
      else s += (1 - Math.exp(-(p.t - prev.t) / 120)) * (p.m - s);
      const x = geo.xAtTime(p.t);
      const y = geo.midiToY(s);
      const w = Math.round((opts.widthOf ? opts.widthOf(p) : 2.6) * 2) / 2;
      const q = p.q === 1 ? 1 : 0;
      if (!cont || !run || run.w !== w || run.q !== q) {
        const last = run ? run.last : null;
        flush();
        run = { w, q, n: 0, last: null };
        ctx.strokeStyle = color;
        ctx.beginPath();
        if (cont && last) {
          ctx.moveTo(last[0], last[1]);
          run.n = 1;
        } else ctx.moveTo(x, y);
      }
      ctx.lineTo(x, y);
      run.n++;
      run.last = [x, y];
      prev = p;
    }
    flush();
    ctx.restore();
  }

  /** The live dot at "now", only while sound is coming in. */
  function drawNowDot(ctx, geo, pts, opts = {}) {
    const p = pts && pts[pts.length - 1];
    if (!p || p.m == null || !geo.running || geo.tNow - p.t > 220) return null;
    const x = geo.xAtTime(p.t);
    const y = geo.midiToY(p.m);
    ctx.beginPath();
    ctx.fillStyle = "rgba(191, 230, 255, 0.2)";
    ctx.arc(x, y, 13, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.fillStyle = opts.color || C.you;
    ctx.arc(x, y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#0b1119";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (opts.ring > 0) {
      ctx.strokeStyle = C.target;
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.arc(x, y, 14, -Math.PI / 2, -Math.PI / 2 + clamp(opts.ring, 0, 1) * Math.PI * 2);
      ctx.stroke();
      ctx.lineCap = "butt";
    }
    return { x, y };
  }

  /** A direction, in words, beside your dot: never "MISS". */
  function drawDirection(ctx, geo, at, dir) {
    if (!at || !dir) return;
    const text = dir === "up" ? L("sube ↑", "go up ↑") : L("baja ↓", "go down ↓");
    const y = clamp(at.y + (dir === "up" ? 16 : -34), headBottom(geo) + 3, geo.graphH - 22);
    pill(ctx, text, at.x - 8, y, { px: 12, align: "right", color: C.text });
  }

  /**
   * A landed note: a check and its offset by the lane, in the "done" colour —
   * above it, or below it when your line leaves upward from there (opts.below),
   * so the line to the next note does not run through the words.
   */
  function drawResultMark(ctx, geo, x, y, res, opts = {}) {
    if (x < geo.plotLeft || x > geo.laneRight) return;
    const below = !!opts.below;
    glyph(ctx, "check", x, below ? y + 11 : y - 12, C.done, 5);
    if (res && res.cents != null && opts.cents !== false) {
      ctx.font = font(11, 800);
      ctx.fillStyle = C.done;
      ctx.textAlign = "center";
      ctx.textBaseline = below ? "top" : "bottom";
      ctx.fillText(res.octave ? "8va" : fmtCents(res.cents), x, below ? y + 18 : y - 20);
    }
  }

  /**
   * How many queued notes the highway draws whole (the layout of
   * js/pitch-visualizer.js _drawQueue): a block cut at the lane labels read
   * "Do…". n: the notes left.
   */
  function queueFits(n) {
    const pv = highway();
    if (!pv || !pv.w || n <= 1) return Math.max(0, n);
    const d = pv.display || {};
    const box = plotBox(pv.w, 0, 0);
    const plotRight = Math.max(48, box.laneRight - 20);
    const at = d.pastSec > 0 && d.nowAt != null ? Math.max(0.2, Math.min(1, d.nowAt)) : 0.62;
    const nowX = Math.round(12 + (plotRight - 12) * at);
    const span = Math.max(40, box.laneRight - nowX - 6);
    for (let v = Math.min(n, 5); v >= 2; v--) {
      const bw = Math.max(34, Math.min(88, span / Math.max(1.6, v - 0.4)));
      const gap = Math.max(6, bw * 0.14);
      const x0 = nowX + bw * 0.5 + gap + (v - 2) * (bw + gap);
      if (x0 + bw <= box.laneRight) return v;
    }
    return 1;
  }

  /**
   * A row of steps under the header (the scale's shape, the notes of a
   * round): done ones keep a check and stay filled, the current one is
   * outlined and fills with its hold, the next ones wait. Every chip keeps
   * its words whole at full size: when they do not all fit (a phone), the
   * row shows a window around the current step, with "…" where steps are
   * left out. items: [{ label, short, done }]
   */
  function stepRow(ctx, geo, y, items, current, frac) {
    const size = sizeOf(geo);
    if (size === "tiny" || !items.length) return y;
    const plan = chipPlan(ctx, geo, items, current);
    const h = size === "compact" ? 26 : 30;
    const x0 = geo.plotLeft;
    ctx.fillStyle = "rgba(6, 10, 16, 0.55)";
    roundRect(ctx, x0 - 2, y - 2, plan.W + 4, h + 4, 8);
    ctx.fill();
    let x = x0;
    const mark = (mx) => {
      ctx.font = font(13, 800);
      ctx.fillStyle = C.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("…", mx + CHIP_MARK / 2, y + h / 2);
    };
    if (plan.before) {
      mark(x);
      x += CHIP_MARK + CHIP_GAP;
    }
    plan.shown.forEach((c) => {
      const it = items[c.i];
      const isCur = c.i === plan.cur;
      const w = c.w;
      ctx.fillStyle = it.done ? "rgba(255, 211, 110, 0.16)" : "rgba(170, 195, 230, 0.07)";
      roundRect(ctx, x, y, w, h, 7);
      ctx.fill();
      if (isCur && frac != null) {
        ctx.fillStyle = C.targetSoft;
        roundRect(ctx, x, y, Math.max(6, w * clamp(frac, 0, 1)), h, 7);
        ctx.fill();
      }
      ctx.lineWidth = isCur ? 2 : 1;
      ctx.strokeStyle = isCur ? C.text : it.done ? "rgba(255, 211, 110, 0.55)" : C.grid;
      roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 7);
      ctx.stroke();
      ctx.font = font(isCur ? 13 : 12, isCur ? 800 : 700);
      ctx.fillStyle = it.done ? C.done : isCur ? C.text : C.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(c.text, x + w / 2, y + h / 2 + 0.5);
      x += w + CHIP_GAP;
    });
    if (plan.after) mark(x);
    return y + h + 4;
  }

  const CHIP_GAP = 4;
  const CHIP_MARK = 14;
  /** Which chips the row shows and how wide, words at full size (see stepRow). */
  function chipPlan(ctx, geo, items, current) {
    const n = items.length;
    const W = Math.max(120, geo.laneRight - geo.plotLeft - 4);
    const cur = current != null && current >= 0 && current < n ? current : -1;
    const textOf = (i, short) => {
      const it = items[i];
      const words = i === cur || !short ? it.label : it.short || it.label;
      return (it.done ? "✓ " : "") + (words || "");
    };
    const widthOf = (i, short) => {
      const isCur = i === cur;
      return Math.max(isCur ? 44 : 28, textW(ctx, textOf(i, short), isCur ? 13 : 12, isCur ? 800 : 700) + 14);
    };
    const sum = (a, b, short) => {
      let s = 0;
      for (let i = a; i <= b; i++) s += widthOf(i, short) + (i > a ? CHIP_GAP : 0);
      return s + (a > 0 ? CHIP_MARK + CHIP_GAP : 0) + (b < n - 1 ? CHIP_MARK + CHIP_GAP : 0);
    };
    let lo = 0;
    let hi = n - 1;
    let short = false;
    if (sum(0, n - 1, false) > W) {
      short = true;
      if (sum(0, n - 1, true) > W) {
        // A window: up to two steps before the current one, then the ones ahead
        const c = Math.max(0, cur);
        lo = hi = c;
        for (let guard = 0; guard < n * 2; guard++) {
          if (lo > 0 && c - lo < 2 && sum(lo - 1, hi, true) <= W) lo--;
          else if (hi < n - 1 && sum(lo, hi + 1, true) <= W) hi++;
          else if (lo > 0 && sum(lo - 1, hi, true) <= W) lo--;
          else break;
        }
      }
    }
    const shown = [];
    for (let i = lo; i <= hi; i++) shown.push({ i, text: textOf(i, short), w: widthOf(i, short) });
    // The room left over is shared, the current chip taking a larger part
    const used = sum(lo, hi, short);
    const extra = Math.max(0, W - used);
    const shares = shown.reduce((s, c) => s + (c.i === cur ? 1.6 : 1), 0) || 1;
    shown.forEach((c) => (c.w += (extra * (c.i === cur ? 1.6 : 1)) / shares));
    return { shown, before: lo > 0, after: hi < n - 1, cur, W };
  }

  /* —— The review after Stop: words beside or above the take, never over it —— */

  const ROW_PX = 12;
  const ROW_LH = 15;

  /** The review rows a model carries (the siren's are built from its take). */
  function rowsOf(m) {
    return (m && (m.reviewRows && m.reviewRows.length ? m.reviewRows : m.summary)) || [];
  }
  /** The highway's plot box for a canvas `w` wide (as js/pitch-visualizer.js lays it out). */
  function plotBox(w, gh, safeTop) {
    const gutter = Math.max(72, Math.min(w * 0.14, 140));
    return { w, plotLeft: 12, laneRight: Math.max(8, w - gutter), graphH: gh, safeTop: safeTop || 0 };
  }

  /**
   * Where the words of the review go after Stop, so they never cover the
   * picture. A wide canvas: a card beside the take (the take is drawn
   * narrower, on the left, see reviewGeo). A narrow one (a phone): a card
   * under the header, and the lanes move down below it (reviewHeadPx), so the
   * take keeps the rest. Rows that do not fit are left out whole, the first
   * ones being the ones that matter most.
   * g: { w, plotLeft, laneRight, graphH, safeTop }; opts: { top (y the card
   * starts at beside the take), extra (px the family's own row needs under
   * the card when it is above the take) }
   */
  function reviewPlan(ctx, g, rows, opts = {}) {
    const list = [].concat(rows || []).map((r) => (typeof r === "string" ? { text: r } : r)).filter((r) => r && r.text);
    if (!list.length || !ctx) return null;
    const plotW = g.laneRight - g.plotLeft;
    ctx.font = font(ROW_PX, 650);
    const lay = (w, maxH) => {
      const lines = [];
      const fit = Math.floor((maxH - 14) / ROW_LH);
      for (const r of list) {
        const ls = wrapLines(ctx, r.text, w - 20);
        if (lines.length + ls.length > fit) break;
        ls.forEach((t) => lines.push({ text: t, color: r.color }));
      }
      return lines;
    };
    if (plotW >= 520) {
      const w = clamp(Math.round(plotW * 0.42), 250, 400);
      const x = g.laneRight - 6 - w;
      const y = (opts.top != null ? opts.top : headBottom(g) + 4) + 2;
      const lines = lay(w, g.graphH - 6 - y);
      if (!lines.length) return null;
      return { mode: "side", x, y, w, h: lines.length * ROW_LH + 14, lines, right: x - 16 };
    }
    // Above the take: across the whole canvas (the lane labels move down too)
    const x = g.plotLeft - 4;
    const w = g.w - 6 - x;
    const y = headBottom(g) + 4;
    const extra = opts.extra || 0;
    // The highway lets the header rows take at most 45 % of the plot
    const lines = lay(w, g.graphH * 0.45 - 10 - extra - y);
    if (!lines.length) return null;
    const h = lines.length * ROW_LH + 14;
    return { mode: "top", x, y, w, h, lines, reserve: y + h + 10 + extra };
  }

  /** The take drawn narrower, left of a card beside it (a "side" plan); otherwise as it is. */
  function reviewGeo(geo, plan) {
    if (!plan || plan.mode !== "side") return geo;
    const x0 = geo.plotLeft;
    const k = (plan.right - x0) / Math.max(1, geo.laneRight - x0);
    const map = (x) => x0 + (x - x0) * k;
    return Object.assign({}, geo, {
      nowX: map(geo.nowX),
      plotRight: map(geo.plotRight != null ? geo.plotRight : geo.laneRight),
      laneRight: plan.right,
      xAtTime: (t) => map(geo.xAtTime(t)),
      xAt: typeof geo.xAt === "function" ? (i) => map(geo.xAt(i)) : geo.xAt
    });
  }

  /** The card itself: rows of words on a dark card with a gold edge. */
  function drawReview(ctx, plan) {
    if (!plan) return;
    ctx.fillStyle = "rgba(8, 13, 20, 0.94)";
    roundRect(ctx, plan.x, plan.y, plan.w, plan.h, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 211, 110, 0.45)";
    ctx.lineWidth = 1;
    roundRect(ctx, plan.x + 0.5, plan.y + 0.5, plan.w - 1, plan.h - 1, 10);
    ctx.stroke();
    ctx.font = font(ROW_PX, 650);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    plan.lines.forEach((l, i) => {
      ctx.fillStyle = l.color || C.text;
      ctx.fillText(l.text, plan.x + 10, plan.y + 7 + ROW_LH * i + ROW_LH / 2 + 0.5);
    });
  }

  /**
   * display.headPx for a pitch mode: its own rows while live (`base`) and,
   * after Stop on a narrow canvas, room for the review card above the lanes.
   * extra: px the family's own row needs under the card (the phrase brackets).
   */
  function reviewHeadPx(model, base, extra = 0) {
    let memo = null;
    return (gh, safeTop) => {
      if (model && model.review) {
        const pv = highway();
        const w = (pv && pv.w) || 640;
        const rows = rowsOf(model);
        const key = [w, gh, safeTop, rows.length, V.isEs()].join("|");
        if (!memo || memo.key !== key) {
          const plan = reviewPlan(measureCtx(), plotBox(w, gh, safeTop), rows, { extra });
          memo = { key, px: plan && plan.mode === "top" ? plan.reserve - (safeTop || 0) : null };
        }
        if (memo.px != null) return memo.px;
      }
      return base(gh, safeTop);
    };
  }

  /** Before Start: what the exercise will ask, on the empty highway (words wrap, never squeezed). */
  function idleCard(title, lines, extra) {
    return (ctx, geo) => {
      if (extra) {
        try {
          extra(ctx, geo);
        } catch {
          /* ignore */
        }
      }
      const cx = (geo.plotLeft + geo.laneRight) / 2;
      const w = Math.min(geo.laneRight - geo.plotLeft - 20, 460);
      const inner = w - 24;
      let tpx = 16;
      ctx.font = font(tpx, 800);
      while (tpx > 13 && ctx.measureText(title).width > inner) {
        tpx--;
        ctx.font = font(tpx, 800);
      }
      const tLines = wrapLines(ctx, title, inner);
      ctx.font = font(13, 650);
      const body = [];
      lines.forEach((t, i) => wrapLines(ctx, t, inner).forEach((s) => body.push({ s, first: i === 0 })));
      const tLH = tpx + 5;
      const bLH = 17;
      const h = 12 + tLines.length * tLH + 4 + body.length * bLH + 8;
      let top = Math.max((geo.safeTop || 0) + 8, geo.graphH * 0.2);
      if (top + h > geo.graphH - 4) top = Math.max((geo.safeTop || 0) + 4, geo.graphH - 4 - h);
      ctx.fillStyle = "rgba(8, 13, 20, 0.86)";
      roundRect(ctx, cx - w / 2, top, w, h, 12);
      ctx.fill();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = C.text;
      ctx.font = font(tpx, 800);
      tLines.forEach((s, i) => ctx.fillText(s, cx, top + 12 + tLH * i + tLH / 2));
      ctx.font = font(13, 650);
      const by = top + 12 + tLines.length * tLH + 4;
      body.forEach((b, i) => {
        ctx.fillStyle = b.first ? C.target : C.muted;
        ctx.fillText(b.s, cx, by + bLH * i + bLH / 2);
      });
      ctx.textAlign = "left";
    };
  }

  /** Stones on their lanes, left to right (the idle preview of a scale or a melody). */
  function idleStones(stones) {
    return (ctx, geo) => {
      const n = stones.length;
      if (!n) return;
      const x0 = geo.plotLeft + 20;
      const x1 = geo.laneRight - 16;
      const step = (x1 - x0) / n;
      // Stones never overlap: narrower ones on a phone, their words only when whole
      const bw = Math.max(10, Math.min(60, step - 3));
      stones.forEach((s, i) => {
        const x = x0 + i * step + (step - bw) / 2;
        const y = geo.midiToY(s.midi);
        ctx.fillStyle = "rgba(10, 16, 24, 0.85)";
        roundRect(ctx, x, y - 10, bw, 20, 6);
        ctx.fill();
        ctx.setLineDash([4, 3]);
        ctx.strokeStyle = "rgba(200, 220, 245, 0.75)";
        ctx.lineWidth = 1.3;
        roundRect(ctx, x + 0.5, y - 9.5, bw - 1, 19, 6);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = C.muted;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        textIfFits(ctx, [s.label, s.short], x + bw / 2, y + 0.5, bw - 2, 11, 800);
      });
    };
  }

  /* —— Sirens (s5) —— */

  /** The siren review in words (built from the take; the mode stores them on Stop). */
  function sirenRows(m) {
    const rows = [];
    const ext = m.extent;
    const done = m.sirens.length;
    if (ext) {
      rows.push(
        L(
          `De ${noteName(ext.lo)} a ${noteName(ext.hi)}: ${semis(ext.hi - ext.lo)}${ext.approx ? " (arriba, aprox.)" : ""}`,
          `From ${noteName(ext.lo)} to ${noteName(ext.hi)}: ${semis(ext.hi - ext.lo)}${ext.approx ? " (top approx.)" : ""}`
        )
      );
    }
    const uniq = [...new Set(m.breaks.map((b) => noteName(b.m)))];
    rows.push(
      m.breaks.length
        ? {
            text: L(
              `${m.breaks.length} ${m.breaks.length === 1 ? "salto" : "saltos"} cerca de ${uniq.slice(0, 4).join(", ")}: ahí está tu cambio de registro`,
              `${m.breaks.length} ${m.breaks.length === 1 ? "jump" : "jumps"} near ${uniq.slice(0, 4).join(", ")}: that is where your register shifts`
            ),
            color: C.warn
          }
        : L("Sin saltos: la línea fue continua", "No jumps: the line was continuous")
    );
    if (m.ceil.length) {
      rows.push(
        L("Por encima de ~Sol4 el micrófono pierde el tono: ahí la línea es aprox.", "Above ~G4 the mic loses the pitch: the line is approx. there")
      );
    }
    if (!done) {
      rows.push(
        L("Una sirena cuenta al subir 5 semitonos o más y volver a bajar", "A siren counts when you rise 5 semitones or more and come back down")
      );
    }
    return rows;
  }

  /**
   * model: { trace, breaks: [{t, m, kind}], ceil: [t…], sirens: [{lo, hi, approx,
   *   breaks: [m…]}], run: { lo, hi } | null, goal, lastSirenAt, review,
   *   extent: { lo, hi, approx } | null, reviewRows }
   */
  function pitchSiren(ctx, geo, layer, m) {
    if (layer !== "over") return;
    const size = sizeOf(geo);
    const plan = m.review ? reviewPlan(ctx, geo, rowsOf(m), { top: headBottom(geo) + 4 }) : null;
    const g = reviewGeo(geo, plan);
    // Where the picture's own top rows start: under the header, or under the card above it
    const top = plan && plan.mode === "top" ? plan.y + plan.h + 6 : headBottom(geo) + 4;
    drawTrace(ctx, g, m.trace.pts, { widthOf: (p) => levelWidth(p.db) });
    ctx.save();
    clipPlot(ctx, g);
    // A break: a notch where the line jumped or cut, and the note it was at
    // Its words go above the notch, else beside it, wherever your line does
    // not run through them and no other words are; otherwise only the notch
    const placed = [];
    m.breaks.forEach((b) => {
      const x = g.xAtTime(b.t);
      if (x < g.plotLeft - 4 || x > g.nowX + 2) return;
      const y = g.midiToY(b.m);
      glyph(ctx, "notch", x, y - 12, C.warn, 6);
      if (size === "tiny") return;
      const words = [(b.kind === "cut" ? L("corte ", "cut ") : L("salto ", "jump ")) + noteName(b.m), noteName(b.m)];
      for (const t of words) {
        const tw = textW(ctx, t, 11, 800);
        const spots = [
          { x: x - tw / 2, y: y - 34 },
          { x: x - 9 - tw, y: y - 19 },
          { x: x + 9, y: y - 19 },
          { x: x - tw / 2, y: y + 6 }
        ].map((q) => ({ x: q.x, y: q.y, w: tw, h: 14 }));
        const spot = spots.find(
          (r) =>
            r.x >= g.plotLeft + 2 &&
            r.x + r.w <= g.nowX - 4 &&
            r.y >= top &&
            r.y + r.h <= g.graphH - 2 &&
            !placed.some((o) => boxesMeet(r, o)) &&
            !traceHits(g, m.trace.pts, { x: r.x - 2, y: r.y - 1, w: r.w + 4, h: r.h + 2 })
        );
        if (!spot) continue;
        placed.push(spot);
        ctx.font = font(11, 800);
        ctx.fillStyle = C.warn;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(t, spot.x, spot.y + 1);
        break;
      }
    });
    // Sound with no pitch above the detector's reach: an arrow up, not a break
    let lastCx = -99;
    m.ceil.forEach((t) => {
      const x = g.xAtTime(t);
      if (x < g.plotLeft || x > g.nowX + 2 || x - lastCx < 60) return;
      lastCx = x;
      const y = top + (size === "tiny" ? 2 : 28);
      glyph(ctx, "up", x, y, C.muted, 6);
      if (size !== "tiny") {
        ctx.fillStyle = C.muted;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        // Whole, and inside the take, or not at all
        const words = [L("más agudo de lo que mide el micro", "above what the mic can measure"), L("fuera del micro", "above the mic")];
        const room2 = 2 * Math.min(x - g.plotLeft, g.nowX - x) - 4;
        textIfFits(ctx, words, x, y + 6, room2, 11, 700);
      }
    });
    ctx.restore();
    const dot = drawNowDot(ctx, g, m.trace.pts);
    if (dot && m.trace.last && m.trace.last.q === 1 && size !== "tiny") {
      pill(ctx, L("aprox.", "approx."), dot.x - 10, dot.y - 30, { px: 11, align: "right", color: C.muted });
    }
    sirenColumn(ctx, g, m, size, top);

    const done = m.sirens.length;
    const goal = m.goal || 8;
    const ext = m.extent;
    const approx = ext && ext.approx;
    let right = ext
      ? [
          `${noteName(ext.lo)} → ${noteName(ext.hi)} · ${semis(ext.hi - ext.lo)}${approx ? " " + L("aprox.", "approx.") : ""}`,
          `${noteName(ext.lo)}–${noteName(ext.hi)} · ${Math.round(ext.hi - ext.lo)} st${approx ? " ~" : ""}`,
          `${Math.round(ext.hi - ext.lo)} st${approx ? " ~" : ""}`
        ]
      : [L("desliza de grave a agudo y vuelve", "glide low to high and back"), L("grave → agudo → grave", "low → high → low")];
    let rightColor = C.muted;
    if (!m.review && m.lastSirenAt && geo.tNow - m.lastSirenAt < 2600) {
      right = [L(`✓ sirena ${done} · respira`, `✓ siren ${done} · breathe`), L(`✓ sirena ${done}`, `✓ siren ${done}`)];
      rightColor = C.done;
    }
    const left = m.review
      ? L(`${done} ${done === 1 ? "sirena" : "sirenas"}`, `${done} ${done === 1 ? "siren" : "sirens"}`)
      : L(`Sirenas ${done}/${goal}`, `Sirens ${done}/${goal}`);
    header(ctx, geo, left, right, { rightColor, pips: { done, of: goal } });
    drawReview(ctx, plan);
  }

  /** Right of "now": one bar per siren from its lowest to its highest note. */
  function sirenColumn(ctx, geo, m, size, top0) {
    const x0 = geo.nowX + 14;
    const x1 = geo.laneRight - 6;
    if (x1 - x0 < 30) return;
    const bars = m.sirens.slice(-8);
    const live = !m.review && m.run && m.run.hi - m.run.lo >= 1 ? m.run : null;
    const n = Math.max(4, bars.length + (live ? 1 : 0));
    const step = (x1 - x0) / n;
    const bw = clamp(step * 0.45, 4, 12);
    const top = top0 != null ? top0 : headBottom(geo) + 4;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 - 6, top, x1 - x0 + 12, geo.graphH - top);
    ctx.clip();
    if (size !== "tiny") {
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      // Whole words or none: the column is narrow on a phone
      textIfFits(ctx, [L("tu rango por sirena", "your range per siren"), L("rango", "range")], x0 - 4, top + 2, x1 - x0 + 8, 11, 700);
    }
    const drawBar = (s, i, dashed) => {
      const cx = x0 + step * (i + 0.5);
      const yHi = geo.midiToY(s.hi);
      const yLo = geo.midiToY(s.lo);
      const approxY = s.approx ? geo.midiToY(Math.max(s.lo, 67)) : null;
      if (dashed) {
        ctx.setLineDash([3, 3]);
        ctx.strokeStyle = C.you;
        ctx.lineWidth = 1.5;
        roundRect(ctx, cx - bw / 2, yHi, bw, Math.max(3, yLo - yHi), bw / 2);
        ctx.stroke();
        ctx.setLineDash([]);
      } else {
        ctx.fillStyle = C.you;
        ctx.globalAlpha = 0.8;
        roundRect(ctx, cx - bw / 2, yHi, bw, Math.max(3, yLo - yHi), bw / 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        if (approxY != null && approxY > yHi) {
          ctx.fillStyle = V.hatch(ctx, "rgba(11, 17, 25, 0.9)");
          ctx.fillRect(cx - bw / 2, yHi, bw, approxY - yHi);
        }
      }
      (s.breaks || []).forEach((b) => {
        const by = geo.midiToY(b);
        ctx.strokeStyle = C.warn;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx - bw / 2 - 5, by);
        ctx.lineTo(cx + bw / 2 + 5, by);
        ctx.stroke();
      });
    };
    bars.forEach((s, i) => drawBar(s, i, false));
    if (live) drawBar(live, bars.length, true);
    // Name the extremes of the last full siren
    const last = bars[bars.length - 1];
    if (last && size !== "tiny") {
      const cx = x0 + step * (bars.length - 0.5);
      ctx.font = font(11, 800);
      ctx.fillStyle = C.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(noteName(last.hi), cx, geo.midiToY(last.hi) - 3);
      ctx.textBaseline = "top";
      ctx.fillText(noteName(last.lo), cx, geo.midiToY(last.lo) + 3);
    }
    ctx.restore();
  }

  /* —— Fry → clear /A/ (s1) —— */

  /** The width of the highway's own range label at the bottom left ("C#2 Do♯"), to keep clear of it. */
  function lowLabelW(ctx, geo) {
    const U = global.VTPitchUtils;
    if (!U || !U.midiToDualLabel || !Number.isFinite(geo.rangeMinMidi)) return 64;
    ctx.font = "600 10px ui-monospace,monospace";
    return ctx.measureText(U.midiToDualLabel(Math.floor(geo.rangeMinMidi), true)).width + 8;
  }

  /** Where the highway paints its top and bottom note names at the left edge ("A#3 La♯"). */
  function edgeLabelRects(ctx, geo) {
    const U = global.VTPitchUtils;
    if (!U || !U.midiToDualLabel) return [];
    ctx.font = "600 10px ui-monospace,monospace";
    const rect = (midi) => {
      const y = Math.max(12, Math.min(geo.graphH - 4, geo.midiToY(midi) + 4));
      return { x: 0, y: y - 11, w: ctx.measureText(U.midiToDualLabel(midi, true)).width + 12, h: 16 };
    };
    const out = [];
    if (Number.isFinite(geo.rangeMaxMidi)) out.push(rect(Math.ceil(geo.rangeMaxMidi)));
    if (Number.isFinite(geo.rangeMinMidi)) out.push(rect(Math.floor(geo.rangeMinMidi)));
    return out;
  }

  /**
   * model: { trace (q=2 creak-like), phase "fry"|"clear", cur: { start, clearFrom,
   *   clearSec, creakSec } | null, holds: [{ total, creak, clear, best }], best,
   *   comfort (MIDI | null), fryM (MIDI of the fry floor), loud (bool), review, reviewRows }
   */
  function pitchHold(ctx, geo, layer, m) {
    const size = sizeOf(geo);
    const plan = m.review ? reviewPlan(ctx, geo, rowsOf(m), { top: headBottom(geo) + 4 }) : null;
    const g = reviewGeo(geo, plan);
    if (layer === "under") {
      if (m.comfort != null) {
        const yA = g.midiToY(m.comfort + 1);
        const yB = g.midiToY(m.comfort - 1);
        ctx.fillStyle = "rgba(52, 178, 122, 0.1)";
        ctx.fillRect(g.plotLeft, yA, g.laneRight - g.plotLeft, yB - yA);
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = "rgba(52, 178, 122, 0.55)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(g.plotLeft, yA);
        ctx.lineTo(g.laneRight, yA);
        ctx.moveTo(g.plotLeft, yB);
        ctx.lineTo(g.laneRight, yB);
        ctx.stroke();
        ctx.setLineDash([]);
        if (size !== "tiny") {
          // Above the band; the "clara" marks sit below it, on their own lines
          ctx.fillStyle = C.target;
          ctx.textAlign = "left";
          ctx.textBaseline = "bottom";
          textIfFits(
            ctx,
            [L("tu tono cómodo (no se puntúa)", "your comfortable pitch (not scored)"), L("tu tono cómodo", "your comfortable pitch")],
            g.plotLeft + 4,
            yA - 2,
            g.laneRight - g.plotLeft - 8,
            11,
            700
          );
        }
      }
      // The fry floor: creak has no steady pitch, so it lives on its own lane
      const yF = g.midiToY(m.fryM);
      ctx.setLineDash([2, 5]);
      ctx.strokeStyle = "rgba(169, 184, 204, 0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(g.plotLeft, yF);
      ctx.lineTo(g.laneRight, yF);
      ctx.stroke();
      ctx.setLineDash([]);
      // Under the floor, right of the highway's own low label (they shared a spot)
      const lowY = g.midiToY(Math.floor(g.rangeMinMidi != null ? g.rangeMinMidi : m.fryM - 2)) + 4;
      const fx = Math.abs(yF + 10 - (lowY - 3)) < 16 ? g.plotLeft + lowLabelW(ctx, g) + 4 : g.plotLeft + 4;
      ctx.fillStyle = C.muted;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      textIfFits(ctx, [L("fry (sin tono estable)", "fry (no steady pitch)"), "fry"], fx, yF + 4, g.laneRight - fx - 4, 11, 700);
      return;
    }
    // Clear tone: the line at its pitch, as thick as it is loud
    drawTrace(ctx, g, m.trace.pts, { widthOf: (p) => levelWidth(p.db), skip: (p) => p.q === 2 });
    // Creak-like sound: dots along the fry floor
    ctx.save();
    clipPlot(ctx, g);
    const yF = g.midiToY(m.fryM);
    ctx.fillStyle = C.you;
    let lastX = -99;
    m.trace.pts.forEach((p) => {
      if (p.q !== 2) return;
      const x = g.xAtTime(p.t);
      if (x - lastX < 5) return;
      lastX = x;
      ctx.beginPath();
      ctx.arc(x, yF - 5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
    // Where each hold turned clear: a line up from the floor, "clara" beside it
    let lastLab = -99;
    (m.clearMarks || []).forEach((cm) => {
      const x = g.xAtTime(cm.t);
      if (x < g.plotLeft || x > g.laneRight) return;
      const yT = g.midiToY(cm.m) + 8;
      ctx.strokeStyle = C.done;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, yF - 12);
      ctx.lineTo(x, yT);
      ctx.stroke();
      if (size !== "tiny" && yF - 12 - yT >= 16 && x - lastLab > 50) {
        ctx.fillStyle = C.done;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        if (textIfFits(ctx, [L("clara", "clear")], x + 4, (yF - 12 + yT) / 2, g.laneRight - x - 6, 11, 800)) lastLab = x;
      }
    });
    ctx.restore();
    drawNowDot(ctx, g, m.trace.pts);

    const fryPhase = m.phase === "fry";
    const phase = fryPhase ? L("Paso 1 · fry suave", "Step 1 · gentle fry") : L("Paso 2 · /A/ clara", "Step 2 · clear /A/");
    const phaseShort = fryPhase ? L("Fry suave", "Gentle fry") : L("/A/ clara", "Clear /A/");
    const cur = m.cur;
    let left = [phase, phaseShort];
    let leftColor = C.text;
    if (m.review) left = [L("Tus sostenidos", "Your holds")];
    else if (cur && cur.clearSec > 0) {
      const s = V.fmtSec(cur.clearSec);
      left = fryPhase
        ? [`${phase} · ${L("clara", "clear")} ${s}`, `${L("Clara", "Clear")} ${s}`]
        : [`${phase} ${s}`, `${phaseShort} ${s}`];
      leftColor = cur.clearSec >= 2 ? C.done : C.text;
    } else if (cur) {
      const s = V.fmtSec(cur.creakSec);
      left = [`${phase} · ${L("sonando", "sounding")} ${s}`, `${phaseShort} ${s}`];
    }
    // In review the card carries the best hold
    const right = m.review
      ? []
      : m.best > 0
        ? [L(`mejor clara ${V.fmtSec(m.best)}`, `best clear ${V.fmtSec(m.best)}`), L(`mejor ${V.fmtSec(m.best)}`, `best ${V.fmtSec(m.best)}`)]
        : [L("2 s claros se registran", "2 s clear gets logged"), L("meta 2 s", "goal 2 s")];
    let y = header(ctx, geo, left, right, { leftColor });
    if (!m.review) {
      if (size !== "tiny") y = holdBar(ctx, g, y + 4, m, size);
      if (size === "full") y = shelf(ctx, g, y + 2, m, size);
      if (m.loud && size !== "tiny") {
        pill(ctx, L("más fuerte no es más claro", "louder is not clearer"), geo.plotLeft, y + 4, { px: 11, color: C.muted, weight: 700 });
      }
    } else if (plan && plan.mode === "side" && size !== "tiny") {
      // Beside the card: the shelf of holds, left of it
      shelf(ctx, g, y + 6, m, size);
    }
    drawReview(ctx, plan);
  }

  /** The current clear hold against the 2 s mark and your best (a hollow ghost). */
  function holdBar(ctx, geo, y, m, size) {
    const x = geo.plotLeft;
    const w = Math.min(geo.nowX - x - 10, 420);
    if (w < 80) return y;
    const h = size === "compact" ? 8 : 10;
    const max = Math.max(4, (m.best || 0) * 1.25, (m.cur && m.cur.clearSec) || 0);
    const xOf = (s) => x + (clamp(s, 0, max) / max) * w;
    ctx.fillStyle = "rgba(6, 10, 16, 0.7)";
    roundRect(ctx, x - 3, y - 3, w + 6, h + 20, 6);
    ctx.fill();
    ctx.fillStyle = "rgba(170, 195, 230, 0.12)";
    roundRect(ctx, x, y, w, h, h / 2);
    ctx.fill();
    const cur = m.cur ? m.cur.clearSec : 0;
    if (cur > 0) {
      ctx.fillStyle = cur >= 2 ? C.done : C.you;
      roundRect(ctx, x, y, Math.max(h, xOf(cur) - x), h, h / 2);
      ctx.fill();
    }
    if (m.best > 0) {
      const bx = xOf(m.best);
      ctx.strokeStyle = C.done;
      ctx.lineWidth = 2;
      ctx.strokeRect(bx - 1.5, y - 3, 3, h + 6);
    }
    const tx = xOf(2);
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(tx, y - 3);
    ctx.lineTo(tx, y + h + 3);
    ctx.stroke();
    ctx.font = font(11, 700);
    ctx.textBaseline = "top";
    ctx.textAlign = "center";
    ctx.fillStyle = C.muted;
    ctx.fillText("2 s", tx, y + h + 3);
    if (m.best > 0 && Math.abs(xOf(m.best) - tx) > 40) {
      ctx.fillStyle = C.done;
      ctx.fillText(L("mejor", "best"), xOf(m.best), y + h + 3);
    }
    return y + h + 18;
  }

  /** The last holds, newest last: total length, the creak part hatched, the best outlined. */
  function shelf(ctx, geo, y, m, size) {
    const holds = m.holds.slice(-6);
    if (!holds.length) return y;
    const x0 = geo.plotLeft;
    const avail = Math.min(geo.nowX - x0 - 10, 460);
    const cw = Math.min(74, (avail - (holds.length - 1) * 5) / holds.length);
    if (cw < 40) return y;
    const h = 30;
    holds.forEach((hd, i) => {
      const x = x0 + i * (cw + 5);
      ctx.fillStyle = "rgba(6, 10, 16, 0.82)";
      roundRect(ctx, x, y, cw, h, 6);
      ctx.fill();
      const barW = cw - 10;
      const tot = Math.max(0.1, hd.total);
      const cf = clamp(hd.creak / tot, 0, 1);
      ctx.fillStyle = V.hatch(ctx, "rgba(169, 184, 204, 0.8)");
      ctx.fillRect(x + 5, y + h - 9, barW * cf, 5);
      ctx.fillStyle = C.you;
      ctx.fillRect(x + 5 + barW * cf, y + h - 9, barW * (1 - cf), 5);
      ctx.fillStyle = hd.clear >= 2 ? C.done : C.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const s = V.fmtSec(hd.clear);
      textIfFits(ctx, hd.clear >= 2 ? ["✓ " + s, s] : [s], x + cw / 2, y + 3, cw - 4, 11, 800);
      if (hd === m.bestHold) {
        ctx.strokeStyle = C.done;
        ctx.lineWidth = 1.5;
        roundRect(ctx, x + 0.5, y + 0.5, cw - 1, h - 1, 6);
        ctx.stroke();
      }
    });
    if (size === "full") {
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      textIfFits(ctx, [L("clara ▬  fry ▨", "clear ▬  fry ▨")], x0, y + h + 3, avail, 11, 700);
    }
    return y + h + 16;
  }

  /* —— Stepping stones: scales (s10, s16) and hum targets (s7) —— */

  /**
   * model: { trace, steps: [{ label, short, done, res }], i, frac, dir, head,
   *   headAlt, right, rightAlt, marks: [{ t, m, res }], review, reviewRows }
   */
  function pitchStones(ctx, geo, layer, m) {
    if (layer !== "over") return;
    const size = sizeOf(geo);
    const chipsY = headBottom(geo) + 4;
    const chipH = size === "tiny" ? 0 : size === "compact" ? 26 : 30;
    const plan = m.review ? reviewPlan(ctx, geo, rowsOf(m), { top: chipH ? chipsY + chipH + 4 : chipsY }) : null;
    const g = reviewGeo(geo, plan);
    drawTrace(ctx, g, m.trace.pts, { alpha: m.dim ? 0.45 : 1 });
    ctx.save();
    clipPlot(ctx, g);
    (m.marks || []).forEach((k) => drawResultMark(ctx, g, g.xAtTime(k.t), g.midiToY(k.m), k.res, { cents: size !== "tiny", below: k.below }));
    ctx.restore();
    const at = drawNowDot(ctx, g, m.trace.pts);
    if (!m.review) drawDirection(ctx, g, at, m.dir);
    header(ctx, geo, [m.head].concat(m.headAlt || []), [m.right].concat(m.rightAlt || []), { leftColor: m.headColor });
    if (!m.review) stepRow(ctx, geo, chipsY, m.steps, m.i, m.frac);
    // After Stop the steps stay only where the card is beside the take
    else if (!plan || plan.mode === "side") stepRow(ctx, geo, chipsY, m.steps, -1, null);
    drawReview(ctx, plan);
  }

  /* —— Listen → sing → lock (s9) —— */

  /**
   * model: { trace, slots: [{ label, res, state: "done"|"cur"|"next" }], idx,
   *   phase "listen"|"sing"|"done", listenFrac, lock, dir, review, summary }
   */
  function pitchMatch(ctx, geo, layer, m) {
    if (layer !== "over") return;
    const size = sizeOf(geo);
    const listening = m.phase === "listen";
    const chipsY = headBottom(geo) + 4;
    const chipH = size === "tiny" ? 0 : size === "compact" ? 26 : 30;
    const plan = m.review ? reviewPlan(ctx, geo, rowsOf(m), { top: chipH ? chipsY + chipH + 4 : chipsY }) : null;
    const g = reviewGeo(geo, plan);
    drawTrace(ctx, g, m.trace.pts, { alpha: listening ? 0.4 : 1 });
    const at = drawNowDot(ctx, g, m.trace.pts, { ring: listening ? 0 : m.lock });
    if (!m.review && m.phase === "sing") drawDirection(ctx, g, at, m.dir);
    const total = m.slots.length;
    const done = m.slots.filter((s) => s.state === "done").length;
    const n = m.noteLabel;
    let left;
    let leftColor = C.text;
    if (m.review) left = [L(`Fijaste ${done} de ${total}`, `You locked ${done} of ${total}`)];
    else if (m.phase === "done") {
      left = [L("✓ Ronda completa", "✓ Round complete")];
      leftColor = C.done;
    } else if (listening) left = [L(`Escucha ${n}… luego canta`, `Listen to ${n}… then sing`), L(`Escucha ${n}…`, `Listen: ${n}…`)];
    else left = [L(`Canta ${n} y sostenlo`, `Sing ${n} and hold it`), L(`Canta ${n}`, `Sing ${n}`)];
    const right = m.review ? [] : [L(`fijadas ${done}/${total}`, `locked ${done}/${total}`), `${done}/${total}`];
    header(ctx, geo, left, right, { leftColor });
    if (listening && !m.review) earCue(ctx, g, m);
    const items = m.slots.map((s) => ({
      label: s.state === "done" && s.res ? `${s.label} ${s.res.octave ? "8va" : fmtCents(s.res.cents)}` : s.label,
      short: s.label,
      done: s.state === "done"
    }));
    if (!m.review) stepRow(ctx, geo, chipsY, items, m.idx, listening ? null : m.lock);
    else if (!plan || plan.mode === "side") stepRow(ctx, geo, chipsY, items, -1, null);
    drawReview(ctx, plan);
  }

  /** While the reference rings: sound waves by the target lane and a countdown ring. */
  function earCue(ctx, geo, m) {
    if (!Number.isFinite(m.targetMidi)) return;
    const y = geo.midiToY(m.targetMidi);
    const x = geo.nowX + 30;
    if (x > geo.laneRight - 10) return;
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 2;
    for (let k = 0; k < 3; k++) {
      ctx.globalAlpha = 1 - k * 0.28;
      ctx.beginPath();
      ctx.arc(x - 18, y, 6 + k * 6, -Math.PI / 4, Math.PI / 4);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    V.ring(ctx, x + 12, y, 9, 1 - clamp(m.listenFrac || 0, 0, 1), { width: 3, color: C.text });
  }

  /* —— Chord tones with the path ahead (s2, s13) —— */

  /** The chord strip's row under the header (none on a rotated phone). */
  function stripTop(geo) {
    return headBottom(geo) + 4;
  }

  /**
   * model: { trace, events: [{ t0, t1, chord, targets: [{ midi, label, deg, dashed,
   *   lit, amber }], landed, frac, cur, stones }], chords: [{ t0, t1, name, cur }],
   *   leap: { t, dir, n } | null, dir, head, headAlt, right, rightAlt, review, reviewRows }
   */
  function pitchChord(ctx, geo, layer, m) {
    const size = sizeOf(geo);
    const top = size === "tiny" ? headBottom(geo) + 4 : stripTop(geo) + 24;
    const plan = m.review ? reviewPlan(ctx, geo, rowsOf(m), { top }) : null;
    const g = reviewGeo(geo, plan);
    if (layer === "under") {
      chordBars(ctx, g, m, size);
      return;
    }
    drawTrace(ctx, g, m.trace.pts);
    const at = drawNowDot(ctx, g, m.trace.pts, { ring: m.review ? 0 : m.ring || 0 });
    if (!m.review) drawDirection(ctx, g, at, m.dir);
    // A big leap coming: its size and direction, before it sounds
    if (!m.review && m.leap && size !== "tiny") {
      const x = g.xAtTime(m.leap.t);
      if (x > g.nowX && x < g.laneRight - 40) {
        // Beside the bar it leads to, on the side the leap comes from, and
        // only where it covers no other bar or its name
        const text = `${m.leap.dir > 0 ? "↑" : "↓"}${m.leap.n}`;
        const w = textW(ctx, text, 12, 800) + 10;
        const h = 21;
        const ym = g.midiToY(m.leap.m);
        const lo = stripTop(geo) + 26;
        const hi = g.graphH - 24;
        const ys = m.leap.dir > 0 ? [ym + 14, ym - 14 - h] : [ym - 14 - h, ym + 14];
        const spot = ys
          .map((y) => ({ x: x + 4, y, w, h }))
          .find((r) => r.y >= lo && r.y <= hi && r.x + r.w <= g.laneRight - 2 && !chordBoxes.some((b) => boxesMeet(r, b)));
        if (spot) pill(ctx, text, spot.x, spot.y, { px: 12, h, color: C.text, stroke: C.gridStrong });
      }
    }
    header(ctx, geo, [m.head].concat(m.headAlt || []), [m.right].concat(m.rightAlt || []), { leftColor: m.headColor });
    if (size !== "tiny" && (!plan || plan.mode === "side")) chordStrip(ctx, g, stripTop(geo), m);
    drawReview(ctx, plan);
  }

  /** The bars chordBars drew this frame, so the leap pill can keep off them. */
  let chordBoxes = [];
  const boxesMeet = (r, b) => r.x < b.x + b.w && r.x + r.w > b.x && r.y < b.y + b.h && r.y + r.h > b.y;

  /**
   * Target bars by the clock: now filled, ahead dashed, behind faint with a
   * check. A bar's name sits where your line is not: whole bars ahead are
   * named in their middle, the one you sing in its part still ahead of "now",
   * the ones behind are not named (their lane label on the right is).
   */
  function chordBars(ctx, geo, m, size) {
    ctx.save();
    clipPlot(ctx, geo);
    const bhMax = Math.max(12, Math.min(24, (geo.tolHalf || 6) * 2 + 6));
    const boxes = [];
    const names = [];
    chordBoxes = boxes;
    (m.events || []).forEach((ev) => {
      const xa = geo.xAtTime(ev.t0);
      const xb = geo.xAtTime(ev.t1);
      if (xb < geo.plotLeft || xa > geo.laneRight) return;
      const past = ev.t1 <= geo.tNow;
      const cur = ev.cur;
      const list = ev.stones || ev.targets;
      // Bars no taller than the gap between their lanes, so none covers another
      const ys = list.map((tg) => geo.midiToY(tg.midi)).sort((a, b) => a - b);
      let gap = Infinity;
      for (let i = 1; i < ys.length; i++) if (ys[i] - ys[i - 1] > 0.5) gap = Math.min(gap, ys[i] - ys[i - 1]);
      const bh = Math.max(8, Math.min(bhMax, gap - 2));
      list.forEach((tg, si) => {
        const sa = tg.t0 != null ? geo.xAtTime(tg.t0) : xa + 2;
        const sb = tg.t1 != null ? geo.xAtTime(tg.t1) : xb - 2;
        const y = geo.midiToY(tg.midi);
        const w = Math.max(6, sb - sa);
        boxes.push({ x: sa, y: y - bh / 2, w, h: bh });
        ctx.globalAlpha = past && !cur ? 0.45 : cur ? 1 : 0.85;
        if (tg.lit) ctx.fillStyle = "rgba(255, 211, 110, 0.3)";
        else if (cur && tg.now) ctx.fillStyle = "rgba(52, 178, 122, 0.34)";
        else ctx.fillStyle = "rgba(10, 16, 24, 0.8)";
        roundRect(ctx, sa, y - bh / 2, w, bh, 6);
        ctx.fill();
        if (cur && tg.now && tg.frac > 0) {
          ctx.save();
          roundRect(ctx, sa, y - bh / 2, w, bh, 6);
          ctx.clip();
          ctx.fillStyle = "rgba(52, 178, 122, 0.6)";
          ctx.fillRect(sa, y - bh / 2, w * clamp(tg.frac, 0, 1), bh);
          ctx.restore();
        }
        ctx.lineWidth = cur && tg.now ? 2.2 : 1.3;
        ctx.strokeStyle = tg.lit
          ? C.done
          : tg.amber
            ? C.warn
            : cur && tg.now
              ? "rgba(160, 255, 210, 1)"
              : "rgba(200, 220, 245, 0.75)";
        if (!tg.lit && (!cur || !tg.now || tg.dashed)) ctx.setLineDash([4, 3]);
        roundRect(ctx, sa + 0.5, y - bh / 2 + 0.5, w - 1, bh - 1, 6);
        ctx.stroke();
        ctx.setLineDash([]);
        // The bar's name, only where no line runs through it
        const ahead = sa >= geo.nowX + 2;
        const lx0 = ahead ? sa : Math.max(sa, geo.nowX + 16);
        const room = sb - lx0 - 6;
        const px = bh >= 20 ? 12 : 11;
        if (bh >= 13 && room > 14 && !past) {
          const words = (tg.lit ? ["✓ " + tg.label, "✓ " + (tg.deg || "")] : [tg.label, tg.deg]).filter(Boolean);
          const t = fitOption(ctx, words, room, px, 800);
          const cx = lx0 + 3 + room / 2;
          const r = t ? { x: cx - ctx.measureText(t).width / 2, y: y - px / 2 - 1, w: ctx.measureText(t).width, h: px + 2 } : null;
          if (r && !names.some((o) => boxesMeet(r, o))) {
            names.push(r);
            ctx.fillStyle = tg.lit ? C.done : cur && tg.now ? "#eafff4" : C.muted;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(t, cx, y + 0.5);
          }
        }
        // A landed stone behind "now": its check at the end your line had left
        if (tg.lit && ev.stones && (past || sb < geo.nowX)) {
          glyph(ctx, "check", si === 0 ? Math.max(sa + 8, sb - 9) : sa + 9, y, C.done, 4);
        }
        ctx.globalAlpha = 1;
      });
      if (ev.landed && !ev.stones) {
        const tg = ev.targets[0];
        if (tg) glyph(ctx, "check", Math.max(geo.plotLeft + 6, xb - 8), geo.midiToY(tg.midi) - bh / 2 - 7, C.done, 5);
      }
    });
    // Intervals between landed stones (s13): the sung interval against the
    // written one, named only where the words touch no bar and stay whole
    const meets = boxesMeet;
    const hit = (r) => boxes.some((b) => meets(r, b));
    const tags = [];
    (m.links || []).forEach((k) => {
      const xa = geo.xAtTime(k.ta);
      const xb = geo.xAtTime(k.tb);
      if (xb < geo.plotLeft || xa > geo.laneRight || size === "tiny") return;
      const ya = geo.midiToY(k.ma);
      const yb = geo.midiToY(k.mb);
      ctx.strokeStyle = "rgba(255, 211, 110, 0.6)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(xa, ya);
      ctx.lineTo(xb, yb);
      ctx.stroke();
      const text = `${k.name} ${fmtCents(k.err)}`;
      const tw = textW(ctx, text, 11, 800);
      const cx = (xa + xb) / 2;
      const r = { x: cx - tw / 2 - 2, y: Math.min(ya, yb) - 17, w: tw + 4, h: 14 };
      if (r.x < geo.plotLeft + 2 || r.x + r.w > geo.laneRight - 2 || hit(r) || tags.some((t) => meets(r, t))) return;
      tags.push(r);
      ctx.fillStyle = C.done;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(text, cx, Math.min(ya, yb) - 4);
    });
    ctx.restore();
  }

  /** Chord names by the clock along the top: the one sounding, the next ones. */
  function chordStrip(ctx, geo, y, m) {
    const chords = m.chords || [];
    if (!chords.length) return y;
    const h = 20;
    ctx.save();
    ctx.beginPath();
    ctx.rect(geo.plotLeft, y - 2, geo.laneRight - geo.plotLeft, h + 4);
    ctx.clip();
    chords.forEach((c) => {
      const xa = Math.max(geo.plotLeft, geo.xAtTime(c.t0));
      const xb = Math.min(geo.laneRight, geo.xAtTime(c.t1));
      if (xb - xa < 6) return;
      ctx.fillStyle = c.cur ? "rgba(52, 178, 122, 0.3)" : "rgba(6, 10, 16, 0.78)";
      roundRect(ctx, xa + 1, y, xb - xa - 2, h, 5);
      ctx.fill();
      ctx.strokeStyle = c.cur ? C.target : C.grid;
      ctx.lineWidth = 1;
      roundRect(ctx, xa + 1.5, y + 0.5, xb - xa - 3, h - 1, 5);
      ctx.stroke();
      ctx.fillStyle = c.cur ? C.text : C.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      // The name keeps off the "now" line: in the part ahead of it, else behind
      const tw = textW(ctx, c.name, 11, 800);
      const parts = geo.nowX > xa + 3 && geo.nowX < xb - 3 ? [[geo.nowX + 3, xb], [xa, geo.nowX - 3]] : [[xa, xb]];
      const part = parts.find(([a, b]) => b - a - 6 >= tw);
      if (part) textIfFits(ctx, [c.name], (part[0] + part[1]) / 2, y + h / 2 + 0.5, part[1] - part[0] - 6, 11, 800);
    });
    // "now" through the strip
    ctx.strokeStyle = "rgba(238, 243, 250, 0.6)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(geo.nowX, y - 2);
    ctx.lineTo(geo.nowX, y + h + 2);
    ctx.stroke();
    ctx.restore();
    return y + h + 4;
  }

  /* —— Song phrases (s3) —— */

  /** Px the phrase brackets and their lengths need under the review card when it sits above them. */
  const PHRASE_ROW = 24;

  /**
   * model: { trace, phrases: [{ t0, t1, len, ok, shape }], cur: { t0 } | null,
   *   target (s), head, headAlt, right, rightAlt, review, reviewRows }
   */
  function pitchSong(ctx, geo, layer, m) {
    if (layer !== "over") return;
    const size = sizeOf(geo);
    const plan = m.review ? reviewPlan(ctx, geo, rowsOf(m), { top: headBottom(geo) + 4, extra: PHRASE_ROW }) : null;
    const g = reviewGeo(geo, plan);
    drawTrace(ctx, g, m.trace.pts, { widthOf: (p) => levelWidth(p.db) });
    drawNowDot(ctx, g, m.trace.pts);
    header(ctx, geo, [m.head].concat(m.headAlt || []), [m.right].concat(m.rightAlt || []), { leftColor: m.headColor });
    const by = plan && plan.mode === "top" ? plan.y + plan.h + 8 : headBottom(geo) + (size === "tiny" ? 8 : 14);
    ctx.save();
    clipPlot(ctx, g);
    // Each phrase as a bracket with its length; pauses between them, neutral
    let prevEnd = null;
    let lastRight = -99;
    // The highway's own note names at the left edge are obstacles too
    const edges = edgeLabelRects(ctx, geo);
    const labelAt = (text, cx, y, px, weight, color, maxW) => {
      const t = fitOption(ctx, text, maxW, px, weight);
      if (t == null) return false;
      const tw = ctx.measureText(t).width;
      let x = cx - tw / 2;
      edges.forEach((r) => {
        if (boxesMeet({ x, y, w: tw, h: px + 3 }, r)) x = r.x + r.w + 4;
      });
      if (x + tw > cx + maxW / 2 || x < lastRight + 6) return false;
      ctx.fillStyle = color;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(t, x, y);
      lastRight = x + tw;
      return true;
    };
    m.phrases.forEach((p) => {
      const xa = g.xAtTime(p.t0);
      const xb = g.xAtTime(p.t1);
      if (prevEnd != null) pauseMark(ctx, g, prevEnd, p.t0, by, size, false, labelAt);
      prevEnd = p.t1;
      if (xb < g.plotLeft || xa > g.laneRight) return;
      bracket(ctx, xa, xb, by, p.ok ? C.done : C.muted);
      const len = V.fmtSec(p.len);
      labelAt(p.ok ? ["✓ " + len, len] : [len], (xa + xb) / 2, by + 4, 11, 800, p.ok ? C.done : C.text, Math.max(40, xb - xa + 24));
      if (size === "full" && !(plan && plan.mode === "top") && p.shape && xb - xa > 50) {
        const t = fitOption(ctx, [shapeWord(p.shape)], xb - xa, 11, 700);
        if (t) {
          ctx.fillStyle = C.muted;
          ctx.fillText(t, (xa + xb) / 2, by + 18);
        }
      }
    });
    if (m.cur) {
      if (prevEnd != null) pauseMark(ctx, g, prevEnd, m.cur.t0, by, size, false, labelAt);
      const xa = g.xAtTime(m.cur.t0);
      bracket(ctx, xa, g.nowX, by, C.you);
      // The finish mark: your phrase length, ahead of you
      if (m.target > 0) {
        const tf = m.cur.t0 + m.target * 1000;
        const xf = g.xAtTime(tf);
        const reached = g.tNow >= tf;
        ctx.setLineDash(reached ? [] : [5, 4]);
        ctx.strokeStyle = reached ? C.done : C.text;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(xf, by - 6);
        ctx.lineTo(xf, g.graphH - 6);
        ctx.stroke();
        ctx.setLineDash([]);
        const t = reached ? L("✓ frase completa", "✓ full phrase") : L(`meta ${fmtNum(m.target, 0)} s`, `goal ${fmtNum(m.target, 0)} s`);
        // Right of the mark when it fits before the lane labels, else left of it
        const tw = textW(ctx, t, 11, 800) + 10;
        const px0 = xf + 4 + tw <= g.laneRight - 2 ? xf + 4 : xf - 4;
        pill(ctx, t, px0, by + 2, { px: 11, color: reached ? C.done : C.text, align: px0 < xf ? "right" : "left" });
      }
    } else if (prevEnd != null && g.running) pauseMark(ctx, g, prevEnd, g.tNow, by, size, true, labelAt);
    ctx.restore();
    drawReview(ctx, plan);
  }

  function bracket(ctx, xa, xb, y, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(xa, y + 5);
    ctx.lineTo(xa, y);
    ctx.lineTo(xb, y);
    ctx.lineTo(xb, y + 5);
    ctx.stroke();
  }

  /** A pause: its length in the gap, neutral grey — a breath is not a fault. */
  function pauseMark(ctx, geo, t0, t1, y, size, open, labelAt) {
    const xa = geo.xAtTime(t0);
    const xb = geo.xAtTime(t1);
    const len = (t1 - t0) / 1000;
    if (xb - xa < 30 || len < 0.3 || size === "tiny") return;
    const s = V.fmtSec(len);
    labelAt(open ? [s] : [L("pausa ", "pause ") + s, s], (xa + xb) / 2, y + 4, 11, 700, C.faint, xb - xa - 4);
  }

  function shapeWord(shape) {
    if (shape === "fades") return L("◣ cae al final", "◣ fades at the end");
    if (shape === "grows") return L("◢ crece al final", "◢ grows at the end");
    return L("▬ parejo", "▬ even");
  }

  V.scenes.pitchKit = {
    Trace,
    NoteGate,
    hzToMidi,
    midiToHz,
    noteName,
    noteDual,
    nameToMidi,
    fmtCents,
    foldCents,
    semis,
    octaveShift,
    highway,
    idleCard,
    idleStones,
    shapeWord,
    sizeOf,
    headPx,
    reviewHeadPx,
    reviewPlan,
    plotBox,
    chipPlan,
    sirenRows,
    measureCtx,
    queueFits
  };
  V.scenes.pitchSiren = pitchSiren;
  V.scenes.pitchHold = pitchHold;
  V.scenes.pitchStones = pitchStones;
  V.scenes.pitchMatch = pitchMatch;
  V.scenes.pitchChord = pitchChord;
  V.scenes.pitchSong = pitchSong;
})(typeof window !== "undefined" ? window : globalThis);
