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
      if (rows === "chips") return size === "compact" ? 58 : 66;
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

  /**
   * The top line of the picture, just under the stage's top rail: what is
   * happening, in words, on the left; the count or the extent on the right.
   * Returns the y under it.
   */
  function header(ctx, geo, left, right, opts = {}) {
    const size = sizeOf(geo);
    const y = (geo.safeTop || 0) + 4;
    const px = size === "tiny" ? 12 : 13;
    const h = px + 10;
    const x = geo.plotLeft;
    const span = geo.laneRight - x - 4;
    let used = 0;
    if (left) {
      used = pill(ctx, left, x, y, {
        px,
        h,
        color: opts.leftColor || C.text,
        maxW: right ? span * 0.64 : span,
        stroke: opts.leftStroke
      });
    }
    // The pips only where there is room for them and the words on the right
    if (opts.pips && span > 460) used += drawPips(ctx, x + used + 6, y + h / 2, opts.pips, size) + 6;
    if (right) {
      pill(ctx, right, geo.laneRight - 4, y, {
        px: px - 1,
        h,
        weight: 700,
        align: "right",
        color: opts.rightColor || C.muted,
        maxW: Math.max(60, span - used - 10)
      });
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
    const y = clamp(at.y + (dir === "up" ? 16 : -34), (geo.safeTop || 0) + 30, geo.graphH - 22);
    pill(ctx, text, at.x - 8, y, { px: 12, align: "right", color: C.text });
  }

  /** A landed note: a check and its offset, above the lane, in the "done" colour. */
  function drawResultMark(ctx, geo, x, y, res, opts = {}) {
    if (x < geo.plotLeft || x > geo.laneRight) return;
    glyph(ctx, "check", x, y - 12, C.done, 5);
    if (res && res.cents != null && opts.cents !== false) {
      ctx.font = font(10, 800);
      ctx.fillStyle = C.done;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(res.octave ? "8va" : fmtCents(res.cents), x, y - 20);
    }
  }

  /**
   * A row of steps under the header (the scale's shape, the 8 notes of a
   * round): done ones keep a check and stay filled, the current one fills
   * with its hold. Built on VTViz.chips.
   */
  function stepRow(ctx, geo, y, items, current, frac) {
    const size = sizeOf(geo);
    if (size === "tiny" || !items.length) return y;
    const h = size === "compact" ? 24 : 30;
    const x = geo.plotLeft;
    const w = Math.max(120, geo.laneRight - x - 4);
    ctx.fillStyle = "rgba(6, 10, 16, 0.55)";
    roundRect(ctx, x - 2, y - 2, w + 4, h + 4, 8);
    ctx.fill();
    V.chips(ctx, { x, y, w, h }, items, { current, frac });
    return y + h + 4;
  }

  /** A card of words over the frozen take (the review after Stop). */
  function reviewCard(ctx, geo, y, title, rows, opts = {}) {
    const size = sizeOf(geo);
    const x = geo.plotLeft + 4;
    const w = Math.min(geo.laneRight - x - 8, opts.w || 470);
    const lineH = size === "tiny" ? 15 : 18;
    const maxRows = Math.max(1, Math.floor((geo.graphH - y - 18) / lineH) - 1);
    const shown = rows.slice(0, maxRows);
    const h = 12 + lineH + shown.length * lineH;
    ctx.fillStyle = "rgba(8, 13, 20, 0.9)";
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = "rgba(255, 211, 110, 0.45)";
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 10);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = C.done;
    V.fitText(ctx, title, x + 10, y + 6 + lineH / 2, w - 20, size === "tiny" ? 12 : 14, 800, 10);
    shown.forEach((r, i) => {
      const ry = y + 6 + lineH * (i + 1) + lineH / 2;
      const text = typeof r === "string" ? r : r.text;
      ctx.fillStyle = (r && r.color) || C.text;
      V.fitText(ctx, text, x + 10, ry, w - 20, size === "tiny" ? 11 : 12, 650, 9);
    });
    return y + h;
  }

  /** Before Start: what the exercise will ask, on the empty highway. */
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
      const top = Math.max((geo.safeTop || 0) + 8, geo.graphH * 0.2);
      const w = Math.min(geo.laneRight - geo.plotLeft - 20, 460);
      const lineH = 18;
      const h = 16 + 22 + lines.length * lineH;
      ctx.fillStyle = "rgba(8, 13, 20, 0.86)";
      roundRect(ctx, cx - w / 2, top, w, h, 12);
      ctx.fill();
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = C.text;
      V.fitText(ctx, title, cx, top + 8 + 11, w - 24, 16, 800, 11);
      lines.forEach((t, i) => {
        ctx.fillStyle = i === 0 ? C.target : C.muted;
        V.fitText(ctx, t, cx, top + 8 + 22 + lineH * i + lineH / 2, w - 24, 13, 650, 10);
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
      const bw = Math.max(18, Math.min(60, step - 6));
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
        ctx.font = font(11, 800);
        const text = s.short && ctx.measureText(s.label).width > bw - 6 ? s.short : s.label;
        ctx.fillText(text, x + bw / 2, y + 0.5, bw - 4);
      });
    };
  }

  /* —— Sirens (s5) —— */

  /**
   * model: { trace, breaks: [{t, m, kind}], ceil: [t…], sirens: [{lo, hi, approx,
   *   breaks: [m…]}], run: { lo, hi } | null, goal, lastSirenAt, review,
   *   extent: { lo, hi, approx } | null }
   */
  function pitchSiren(ctx, geo, layer, m) {
    if (layer !== "over") return;
    const size = sizeOf(geo);
    drawTrace(ctx, geo, m.trace.pts, { widthOf: (p) => levelWidth(p.db) });
    ctx.save();
    clipPlot(ctx, geo);
    // A break: a notch where the line jumped or cut, and the note it was at
    m.breaks.forEach((b) => {
      const x = geo.xAtTime(b.t);
      if (x < geo.plotLeft - 4 || x > geo.nowX + 2) return;
      const y = geo.midiToY(b.m);
      glyph(ctx, "notch", x, y - 12, C.warn, 6);
      if (size !== "tiny") {
        ctx.font = font(10, 800);
        ctx.fillStyle = C.warn;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(
          (b.kind === "cut" ? L("corte ", "cut ") : L("salto ", "jump ")) + noteName(b.m),
          x,
          y - 20
        );
      }
    });
    // Sound with no pitch above the detector's reach: an arrow up, not a break
    let lastCx = -99;
    m.ceil.forEach((t) => {
      const x = geo.xAtTime(t);
      if (x < geo.plotLeft || x > geo.nowX + 2 || x - lastCx < 60) return;
      lastCx = x;
      const y = (geo.safeTop || 0) + (size === "tiny" ? 30 : 60);
      glyph(ctx, "up", x, y, C.muted, 6);
      if (size !== "tiny") {
        ctx.font = font(10, 700);
        ctx.fillStyle = C.muted;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(L("más agudo de lo que mide el micro", "above what the mic can measure"), x, y + 6);
      }
    });
    ctx.restore();
    const dot = drawNowDot(ctx, geo, m.trace.pts);
    if (dot && m.trace.last && m.trace.last.q === 1 && size !== "tiny") {
      pill(ctx, L("aprox.", "approx."), dot.x - 10, dot.y - 30, { px: 10, align: "right", color: C.muted });
    }
    sirenColumn(ctx, geo, m, size);

    const done = m.sirens.length;
    const goal = m.goal || 8;
    const ext = m.extent;
    const wide = geo.laneRight - geo.plotLeft > 520;
    let right = ext
      ? wide
        ? `${noteName(ext.lo)} → ${noteName(ext.hi)} · ${semis(ext.hi - ext.lo)}${ext.approx ? " " + L("aprox.", "approx.") : ""}`
        : `${noteName(ext.lo)}–${noteName(ext.hi)} · ${Math.round(ext.hi - ext.lo)} st${ext.approx ? " ~" : ""}`
      : L("desliza de grave a agudo y vuelve", "glide low to high and back");
    let rightColor = C.muted;
    if (!m.review && m.lastSirenAt && geo.tNow - m.lastSirenAt < 2600) {
      right = L(`✓ sirena ${done} · respira`, `✓ siren ${done} · breathe`);
      rightColor = C.done;
    }
    const left = m.review
      ? L(`${done} ${done === 1 ? "sirena" : "sirenas"}`, `${done} ${done === 1 ? "siren" : "sirens"}`)
      : L(`Sirenas ${done}/${goal}`, `Sirens ${done}/${goal}`);
    const y = header(ctx, geo, left, right, { rightColor, pips: { done, of: goal } });
    if (m.review) {
      const rows = [];
      if (ext) {
        rows.push(
          L(
            `De ${noteName(ext.lo)} a ${noteName(ext.hi)}: ${semis(ext.hi - ext.lo)}${ext.approx ? " (arriba, aprox.)" : ""}`,
            `From ${noteName(ext.lo)} to ${noteName(ext.hi)}: ${semis(ext.hi - ext.lo)}${ext.approx ? " (top approx.)" : ""}`
          )
        );
      }
      const bn = m.breaks.map((b) => noteName(b.m));
      const uniq = [...new Set(bn)];
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
          L(
            "Por encima de ~Sol4 el micrófono pierde el tono: ahí la línea es aprox.",
            "Above ~G4 the mic loses the pitch: the line is approx. there"
          )
        );
      }
      if (!done) {
        rows.push(
          L(
            "Una sirena cuenta al subir 5 semitonos o más y volver a bajar",
            "A siren counts when you rise 5 semitones or more and come back down"
          )
        );
      }
      reviewCard(ctx, geo, y + 6, L("Tus sirenas", "Your sirens"), rows, { w: Math.max(200, geo.nowX - geo.plotLeft - 10) });
    }
  }

  /** Right of "now": one bar per siren from its lowest to its highest note. */
  function sirenColumn(ctx, geo, m, size) {
    const x0 = geo.nowX + 14;
    const x1 = geo.laneRight - 6;
    if (x1 - x0 < 30) return;
    const bars = m.sirens.slice(-8);
    const live = !m.review && m.run && m.run.hi - m.run.lo >= 1 ? m.run : null;
    const n = Math.max(4, bars.length + (live ? 1 : 0));
    const step = (x1 - x0) / n;
    const bw = clamp(step * 0.45, 4, 12);
    const top = (geo.safeTop || 0) + (size === "tiny" ? 26 : 32);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x0 - 6, top, x1 - x0 + 12, geo.graphH - top);
    ctx.clip();
    if (size !== "tiny") {
      ctx.font = font(10, 700);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(L("tu rango por sirena", "your range per siren"), x0 - 4, top + 2, x1 - x0 + 8);
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
      ctx.font = font(10, 800);
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

  /**
   * model: { trace (q=2 creak-like), phase "fry"|"clear", cur: { start, clearFrom,
   *   clearSec, creakSec } | null, holds: [{ total, creak, clear, best }], best,
   *   comfort (MIDI | null), fryM (MIDI of the fry floor), loud (bool), review }
   */
  function pitchHold(ctx, geo, layer, m) {
    const size = sizeOf(geo);
    if (layer === "under") {
      if (m.comfort != null) {
        const yA = geo.midiToY(m.comfort + 1);
        const yB = geo.midiToY(m.comfort - 1);
        ctx.fillStyle = "rgba(52, 178, 122, 0.1)";
        ctx.fillRect(geo.plotLeft, yA, geo.laneRight - geo.plotLeft, yB - yA);
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = "rgba(52, 178, 122, 0.55)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(geo.plotLeft, yA);
        ctx.lineTo(geo.laneRight, yA);
        ctx.moveTo(geo.plotLeft, yB);
        ctx.lineTo(geo.laneRight, yB);
        ctx.stroke();
        ctx.setLineDash([]);
        if (size !== "tiny") {
          ctx.font = font(10, 700);
          ctx.fillStyle = C.target;
          ctx.textAlign = "left";
          ctx.textBaseline = "bottom";
          ctx.fillText(L("tu tono cómodo (no se puntúa)", "your comfortable pitch (not scored)"), geo.plotLeft + 4, yA - 2);
        }
      }
      // The fry floor: creak has no steady pitch, so it lives on its own lane
      const yF = geo.midiToY(m.fryM);
      ctx.setLineDash([2, 5]);
      ctx.strokeStyle = "rgba(169, 184, 204, 0.5)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(geo.plotLeft, yF);
      ctx.lineTo(geo.laneRight, yF);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.font = font(10, 700);
      ctx.fillStyle = C.muted;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(L("fry (sin tono estable)", "fry (no steady pitch)"), geo.plotLeft + 4, yF + 4);
      return;
    }
    // Clear tone: the line at its pitch, as thick as it is loud
    drawTrace(ctx, geo, m.trace.pts, { widthOf: (p) => levelWidth(p.db), skip: (p) => p.q === 2 });
    // Creak-like sound: dots along the fry floor
    ctx.save();
    clipPlot(ctx, geo);
    const yF = geo.midiToY(m.fryM);
    ctx.fillStyle = C.you;
    let lastX = -99;
    m.trace.pts.forEach((p) => {
      if (p.q !== 2) return;
      const x = geo.xAtTime(p.t);
      if (x - lastX < 5) return;
      lastX = x;
      ctx.beginPath();
      ctx.arc(x, yF - 5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    });
    // Where each hold turned clear
    (m.clearMarks || []).forEach((cm) => {
      const x = geo.xAtTime(cm.t);
      if (x < geo.plotLeft || x > geo.laneRight) return;
      ctx.strokeStyle = C.done;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, yF - 12);
      ctx.lineTo(x, geo.midiToY(cm.m) + 8);
      ctx.stroke();
      if (size !== "tiny") {
        ctx.font = font(10, 800);
        ctx.fillStyle = C.done;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(L("clara", "clear"), x, geo.midiToY(cm.m) + 6 - 14);
      }
    });
    ctx.restore();
    drawNowDot(ctx, geo, m.trace.pts);

    const phase =
      m.phase === "fry"
        ? L("Paso 1 · fry suave", "Step 1 · gentle fry")
        : L("Paso 2 · /A/ clara", "Step 2 · clear /A/");
    const cur = m.cur;
    let left = phase;
    let leftColor = C.text;
    if (m.review) left = L("Tus sostenidos", "Your holds");
    else if (cur && cur.clearSec > 0) {
      left = `${phase} · ${L("clara", "clear")} ${V.fmtSec(cur.clearSec)}`;
      leftColor = cur.clearSec >= 2 ? C.done : C.text;
    } else if (cur) left = `${phase} · ${L("sonando", "sounding")} ${V.fmtSec(cur.creakSec)}`;
    // In review the card below carries the best hold
    const right = m.review && m.reviewRows && m.reviewRows.length ? "" : m.best > 0 ? L(`mejor clara ${V.fmtSec(m.best)}`, `best clear ${V.fmtSec(m.best)}`) : L("2 s claros se registran", "2 s clear gets logged");
    let y = header(ctx, geo, left, right, { leftColor });
    if (size !== "tiny") y = holdBar(ctx, geo, y + 4, m, size);
    if (size === "full" || m.review) y = shelf(ctx, geo, y + 2, m, size);
    if (!m.review && m.loud && size !== "tiny") {
      pill(ctx, L("más fuerte no es más claro", "louder is not clearer"), geo.plotLeft, y + 4, { px: 11, color: C.muted, weight: 700 });
    }
    if (m.review && !m.holds.length) {
      reviewCard(ctx, geo, y + 4, L("Sin sostenidos todavía", "No holds yet"), [
        L("Empieza con un fry suave y deja que se aclare en /A/", "Start with a gentle fry and let it clear into /A/")
      ]);
    } else if (m.review && m.reviewRows && m.reviewRows.length) {
      reviewCard(ctx, geo, y + 4, L("Tus sostenidos", "Your holds"), m.reviewRows, { w: Math.max(220, geo.nowX - geo.plotLeft - 10) });
    }
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
    ctx.font = font(10, 700);
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
    if (cw < 34) return y;
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
      ctx.font = font(11, 800);
      ctx.fillStyle = hd.clear >= 2 ? C.done : C.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText((hd.clear >= 2 ? "✓ " : "") + V.fmtSec(hd.clear), x + cw / 2, y + 3, cw - 4);
      if (hd === m.bestHold) {
        ctx.strokeStyle = C.done;
        ctx.lineWidth = 1.5;
        roundRect(ctx, x + 0.5, y + 0.5, cw - 1, h - 1, 6);
        ctx.stroke();
      }
    });
    if (size === "full") {
      ctx.font = font(10, 700);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(L("clara ▬  fry ▨", "clear ▬  fry ▨"), x0, y + h + 3);
    }
    return y + h + 16;
  }

  /* —— Stepping stones: scales (s10, s16) and hum targets (s7) —— */

  /**
   * model: { trace, steps: [{ label, short, done, res }], i, frac, dir, head,
   *   right, marks: [{ t, m, res }], review, reviewRows, reviewTitle, levels? }
   */
  function pitchStones(ctx, geo, layer, m) {
    if (layer !== "over") return;
    const size = sizeOf(geo);
    drawTrace(ctx, geo, m.trace.pts, { alpha: m.dim ? 0.45 : 1 });
    ctx.save();
    clipPlot(ctx, geo);
    (m.marks || []).forEach((k) => drawResultMark(ctx, geo, geo.xAtTime(k.t), geo.midiToY(k.m), k.res, { cents: size !== "tiny" }));
    ctx.restore();
    const at = drawNowDot(ctx, geo, m.trace.pts);
    if (!m.review) drawDirection(ctx, geo, at, m.dir);
    let y = header(ctx, geo, m.head, m.right, { leftColor: m.headColor });
    if (!m.review) {
      stepRow(ctx, geo, y + 4, m.steps, m.i, m.frac);
      return;
    }
    y = stepRow(ctx, geo, y + 4, m.steps, -1, null);
    if (m.reviewRows && m.reviewRows.length) {
      const bottom = reviewCard(ctx, geo, y + 2, m.reviewTitle || "", m.reviewRows);
      if (m.levels && m.levels.length > 2 && size === "full") levelBars(ctx, geo, bottom + 6, m.levels);
    }
  }

  /**
   * Level per step, relative to your own median (dB): the honest proxy for
   * "all the air at the start" — shown after the take, never live.
   * levels: [{ label, db }]
   */
  function levelBars(ctx, geo, y, levels) {
    const x = geo.plotLeft + 4;
    const w = Math.min(geo.laneRight - x - 8, 470);
    const h = 64;
    if (y + h + 18 > geo.graphH) return;
    ctx.fillStyle = "rgba(8, 13, 20, 0.9)";
    roundRect(ctx, x, y, w, h + 16, 10);
    ctx.fill();
    ctx.font = font(10, 800);
    ctx.fillStyle = C.muted;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(L("nivel por nota (vs. tu mediana)", "level per note (vs your median)"), x + 8, y + 4);
    const n = levels.length;
    const slot = (w - 16) / n;
    const mid = y + 16 + (h - 20) / 2;
    const scale = (h - 24) / 2 / 8; // ±8 dB fills the half height
    ctx.strokeStyle = C.grid;
    ctx.beginPath();
    ctx.moveTo(x + 8, mid);
    ctx.lineTo(x + w - 8, mid);
    ctx.stroke();
    ctx.fillStyle = C.targetSoft;
    ctx.fillRect(x + 8, mid - 3 * scale, w - 16, 6 * scale);
    levels.forEach((l, i) => {
      const cx = x + 8 + slot * (i + 0.5);
      if (Number.isFinite(l.db)) {
        const v = clamp(l.db, -8, 8) * scale;
        ctx.fillStyle = Math.abs(l.db) > 3 ? C.warn : C.you;
        ctx.fillRect(cx - Math.min(6, slot * 0.3), v > 0 ? mid - v : mid, Math.min(12, slot * 0.6), Math.max(1.5, Math.abs(v)));
      }
      ctx.font = font(9, 700);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(l.label, cx, y + h + 14);
    });
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
    drawTrace(ctx, geo, m.trace.pts, { alpha: listening ? 0.4 : 1 });
    const at = drawNowDot(ctx, geo, m.trace.pts, { ring: listening ? 0 : m.lock });
    if (!m.review && m.phase === "sing") drawDirection(ctx, geo, at, m.dir);
    const total = m.slots.length;
    const done = m.slots.filter((s) => s.state === "done").length;
    const narrow = geo.laneRight - geo.plotLeft < 460;
    let left;
    let leftColor = C.text;
    if (m.review) left = L(`Fijaste ${done} de ${total}`, `You locked ${done} of ${total}`);
    else if (m.phase === "done") {
      left = L("✓ Ronda completa", "✓ Round complete");
      leftColor = C.done;
    } else if (listening) left = narrow ? L(`Escucha ${m.noteLabel}…`, `Listen: ${m.noteLabel}…`) : L(`Escucha ${m.noteLabel}… luego canta`, `Listen to ${m.noteLabel}… then sing`);
    else left = narrow ? L(`Canta ${m.noteLabel}`, `Sing ${m.noteLabel}`) : L(`Canta ${m.noteLabel} y sostenlo`, `Sing ${m.noteLabel} and hold it`);
    const right = L(`fijadas ${done}/${total}`, `locked ${done}/${total}`);
    const y = header(ctx, geo, left, right, { leftColor });
    if (listening && !m.review) earCue(ctx, geo, m);
    const items = m.slots.map((s) => ({
      label: s.state === "done" && s.res ? `${s.label} ${s.res.octave ? "8va" : fmtCents(s.res.cents)}` : s.label,
      short: s.label,
      sub:
        s.state === "done" && s.res && s.res.sd != null
          ? `±${Math.round(s.res.sd)}¢`
          : s.state === "cur" && !m.review
            ? listening
              ? L("escucha", "listen")
              : L("canta", "sing")
            : "",
      done: s.state === "done"
    }));
    const y2 = stepRow(ctx, geo, y + 4, items, m.review ? -1 : m.idx, listening ? null : m.lock);
    if (m.review && m.summary && m.summary.length) {
      reviewCard(ctx, geo, y2 + 2, L("Afinación y estabilidad", "Accuracy and stability"), m.summary);
    }
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

  /**
   * model: { trace, events: [{ t0, t1, chord, targets: [{ midi, label, dashed,
   *   lit, amber }], landed, frac, cur, stones }], chords: [{ t0, t1, name, cur }],
   *   leap: { t, dir, n } | null, dir, head, right, review, reviewTitle, reviewRows }
   */
  function pitchChord(ctx, geo, layer, m) {
    const size = sizeOf(geo);
    if (layer === "under") {
      chordBars(ctx, geo, m, size);
      return;
    }
    drawTrace(ctx, geo, m.trace.pts);
    const at = drawNowDot(ctx, geo, m.trace.pts, { ring: m.review ? 0 : m.ring || 0 });
    if (!m.review) drawDirection(ctx, geo, at, m.dir);
    // A big leap coming: its size and direction, before it sounds
    if (!m.review && m.leap && size !== "tiny") {
      const x = geo.xAtTime(m.leap.t);
      if (x > geo.nowX && x < geo.laneRight) {
        const y = geo.midiToY(m.leap.m) + (m.leap.dir > 0 ? 22 : -38);
        pill(ctx, `${m.leap.dir > 0 ? "↑" : "↓"}${m.leap.n}`, x + 4, clamp(y, (geo.safeTop || 0) + 30, geo.graphH - 24), {
          px: 12,
          color: C.text,
          stroke: C.gridStrong
        });
      }
    }
    let y = header(ctx, geo, m.head, m.right, { leftColor: m.headColor });
    if (size !== "tiny") y = chordStrip(ctx, geo, y + 4, m);
    if (m.review && m.reviewRows && m.reviewRows.length) reviewCard(ctx, geo, y + 4, m.reviewTitle || "", m.reviewRows);
  }

  /** Target bars by the clock: now filled, ahead dashed, behind faint with a check. */
  function chordBars(ctx, geo, m, size) {
    ctx.save();
    clipPlot(ctx, geo);
    const bh = Math.max(12, Math.min(24, (geo.tolHalf || 6) * 2 + 6));
    (m.events || []).forEach((ev) => {
      const xa = geo.xAtTime(ev.t0);
      const xb = geo.xAtTime(ev.t1);
      if (xb < geo.plotLeft || xa > geo.laneRight) return;
      const past = ev.t1 <= geo.tNow;
      const cur = ev.cur;
      (ev.stones || ev.targets).forEach((tg) => {
        const sa = tg.t0 != null ? geo.xAtTime(tg.t0) : xa + 2;
        const sb = tg.t1 != null ? geo.xAtTime(tg.t1) : xb - 2;
        const y = geo.midiToY(tg.midi);
        const w = Math.max(6, sb - sa);
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
        if (w > 18 && bh >= 14) {
          ctx.font = font(bh >= 20 ? 12 : 10, 800);
          ctx.fillStyle = tg.lit ? C.done : cur && tg.now ? "#eafff4" : C.muted;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText((tg.lit ? "✓ " : "") + tg.label, sa + w / 2, y + 0.5, w - 4);
        } else if (tg.lit) glyph(ctx, "check", sa + w / 2, y, C.done, 4);
        ctx.globalAlpha = 1;
      });
      if (ev.landed && !ev.stones) {
        const tg = ev.targets[0];
        if (tg) glyph(ctx, "check", Math.max(geo.plotLeft + 6, xb - 8), geo.midiToY(tg.midi) - bh / 2 - 7, C.done, 5);
      }
    });
    // Intervals between landed stones (s13): the sung interval against the written one
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
      ctx.font = font(10, 800);
      ctx.fillStyle = C.done;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText(`${k.name} ${fmtCents(k.err)}`, (xa + xb) / 2, Math.min(ya, yb) - 4);
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
      ctx.font = font(11, 800);
      ctx.fillStyle = c.cur ? C.text : C.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(c.name, (xa + xb) / 2, y + h / 2 + 0.5, xb - xa - 6);
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

  /**
   * model: { trace, phrases: [{ t0, t1, len, ok, shape }], cur: { t0 } | null,
   *   target (s), head, right, chord, review, reviewRows }
   */
  function pitchSong(ctx, geo, layer, m) {
    if (layer !== "over") return;
    const size = sizeOf(geo);
    drawTrace(ctx, geo, m.trace.pts, { widthOf: (p) => levelWidth(p.db) });
    drawNowDot(ctx, geo, m.trace.pts);
    let y = header(ctx, geo, m.head, m.right, { leftColor: m.headColor });
    const by = y + (size === "tiny" ? 8 : 14);
    ctx.save();
    clipPlot(ctx, geo);
    // Each phrase as a bracket with its length; pauses between them, neutral
    let prevEnd = null;
    m.phrases.forEach((p) => {
      const xa = geo.xAtTime(p.t0);
      const xb = geo.xAtTime(p.t1);
      if (prevEnd != null) pauseMark(ctx, geo, prevEnd, p.t0, by, size);
      prevEnd = p.t1;
      if (xb < geo.plotLeft || xa > geo.laneRight) return;
      bracket(ctx, xa, xb, by, p.ok ? C.done : C.muted);
      const label = (p.ok ? "✓ " : "") + V.fmtSec(p.len);
      ctx.font = font(11, 800);
      ctx.fillStyle = p.ok ? C.done : C.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(label, (xa + xb) / 2, by + 4, Math.max(30, xb - xa));
      if (size === "full" && p.shape && xb - xa > 50) {
        ctx.font = font(10, 700);
        ctx.fillStyle = C.muted;
        ctx.fillText(shapeWord(p.shape), (xa + xb) / 2, by + 18, xb - xa);
      }
    });
    if (m.cur) {
      if (prevEnd != null) pauseMark(ctx, geo, prevEnd, m.cur.t0, by, size);
      const xa = geo.xAtTime(m.cur.t0);
      bracket(ctx, xa, geo.nowX, by, C.you);
      // The finish mark: your phrase length, ahead of you
      if (m.target > 0) {
        const tf = m.cur.t0 + m.target * 1000;
        const xf = geo.xAtTime(tf);
        const reached = geo.tNow >= tf;
        ctx.setLineDash(reached ? [] : [5, 4]);
        ctx.strokeStyle = reached ? C.done : C.text;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(xf, by - 6);
        ctx.lineTo(xf, geo.graphH - 6);
        ctx.stroke();
        ctx.setLineDash([]);
        const t = reached ? L("✓ frase completa", "✓ full phrase") : L(`meta ${fmtNum(m.target, 0)} s`, `goal ${fmtNum(m.target, 0)} s`);
        pill(ctx, t, xf + 4, by + 2, { px: 11, color: reached ? C.done : C.text });
      }
    } else if (prevEnd != null && geo.running) pauseMark(ctx, geo, prevEnd, geo.tNow, by, size, true);
    ctx.restore();
    if (m.review && m.reviewRows && m.reviewRows.length) reviewCard(ctx, geo, by + 34, m.reviewTitle || "", m.reviewRows);
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
  function pauseMark(ctx, geo, t0, t1, y, size, open) {
    const xa = geo.xAtTime(t0);
    const xb = geo.xAtTime(t1);
    const len = (t1 - t0) / 1000;
    if (xb - xa < 30 || len < 0.3 || size === "tiny") return;
    ctx.font = font(10, 700);
    ctx.fillStyle = C.faint;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText((open ? "" : L("pausa ", "pause ")) + V.fmtSec(len), (xa + xb) / 2, y + 4, xb - xa - 4);
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
    headPx
  };
  V.scenes.pitchSiren = pitchSiren;
  V.scenes.pitchHold = pitchHold;
  V.scenes.pitchStones = pitchStones;
  V.scenes.pitchMatch = pitchMatch;
  V.scenes.pitchChord = pitchChord;
  V.scenes.pitchSong = pitchSong;
})(typeof window !== "undefined" ? window : globalThis);
