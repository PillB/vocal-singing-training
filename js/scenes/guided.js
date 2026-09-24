/**
 * Exercise pictures — guided drills.
 *
 * Eight exercises whose skill the microphone cannot see, or can only
 * confirm: a jaw and neck release, a soft-palate lift, a face change,
 * gestures, a pen in the teeth, a persona deck, a long improvised take and a
 * twelve-week plan. What helps is being walked through the steps at the
 * right pace — the step you are on, what comes next, how long is left — with
 * a picture of the movement itself, and, for the recorded drills, a
 * listen-back that becomes the main event once you press Stop.
 *
 * Rules these pictures keep (synthesis §3K, docs/39-EXERCISE-VISUALS.md):
 * - Timed guidance where nothing is measurable. Nothing here scores ease,
 *   openness, relaxation, neutrality or expressiveness: self-ratings stay
 *   the learner's. Only what the mic hears is counted (a sung hold, speech).
 * - An illustration says it is one and moves on the clock, never on the
 *   voice. Under reduced motion it holds a still key frame.
 * - Every state has a word and a shape as well as a colour.
 * - A rotated phone gives the picture ~100 px: the art then sits left of the
 *   words and is drawn to stay readable at that height.
 *
 * The mode objects in js/practice-modes.js configure the controllers here
 * (Drill, Take, Week); this file owns the drawing and the listen-back.
 */
(function (global) {
  "use strict";
  const V = global.VTViz;
  if (!V) return;
  const { C, L, font, clamp, roundRect, fmtSec, fmtNum, panel, glyph, speechStrip } = V;
  const TAU = Math.PI * 2;
  const ease = (x) => (1 - Math.cos(Math.PI * clamp(x, 0, 1))) / 2;
  const lerp = (a, b, k) => a + (b - a) * k;

  function isEs() {
    return V.isEs ? V.isEs() : L(true, false);
  }
  /** A profile field in the interface language (`key` / `keyEs`). */
  function loc(obj, key) {
    if (!obj) return "";
    return (isEs() ? obj[key + "Es"] || obj[key] : obj[key] || obj[key + "Es"]) || "";
  }
  function mmss(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
  }
  /** One line of text: shrinks to `min` px, then ends in "…" rather than squashing letters. */
  function fitLine(ctx, text, x, y, maxW, px, weight = 800, min = 10) {
    let size = px;
    let str = String(text == null ? "" : text);
    ctx.font = font(size, weight);
    while (size > min && ctx.measureText(str).width > maxW) {
      size -= 1;
      ctx.font = font(size, weight);
    }
    if (ctx.measureText(str).width > maxW) {
      while (str.length > 1 && ctx.measureText(str + "…").width > maxW) str = str.slice(0, -1);
      str = str.replace(/\s+$/, "") + "…";
    }
    ctx.fillText(str, x, y);
    return size;
  }
  function setText(el, text) {
    if (el && el.textContent !== text) el.textContent = text;
  }

  /* —— The clock of a guided drill —— */

  /**
   * Steps on a clock. Time comes from the frames: `clock` is practice time
   * (capped per frame, like VTFeatures.Vad.t, so a hidden tab pauses the
   * guide instead of skipping steps), `rec` is time into the recording (the
   * engine's own elapsed time) so a step can be found again in the take.
   */
  class Run {
    constructor(phases) {
      this.phases = phases || [];
      this.reset();
    }
    reset() {
      this.clock = 0;
      this.rec = 0;
      this.index = 0;
      this.t = 0;
      this.done = !this.phases.length;
      this.starts = [{ t: 0, rec: 0 }];
      this.ended = null;
      this.skipped = [];
    }
    get count() {
      return this.phases.length;
    }
    get cur() {
      return this.phases[Math.min(this.index, this.phases.length - 1)] || null;
    }
    get next() {
      return this.done ? null : this.phases[this.index + 1] || null;
    }
    get remaining() {
      return this.done ? 0 : Math.max(0, (this.cur?.sec || 0) - this.t);
    }
    get frac() {
      const s = this.cur?.sec || 0;
      return this.done ? 1 : s ? clamp(this.t / s, 0, 1) : 1;
    }
    get total() {
      return this.phases.reduce((a, p) => a + (p.sec || 0), 0);
    }
    /** Steps finished so far (a skipped step counts: the learner moved on). */
    get completed() {
      return this.done ? this.count : this.index;
    }
    tick(frame) {
      const dt = clamp(((frame && frame.dtMs) || 16) / 1000, 0, 0.1);
      this.clock += dt;
      this.rec = frame && frame.elapsedMs != null ? frame.elapsedMs / 1000 : this.rec + dt;
      if (this.done) return false;
      this.t += dt;
      let changed = false;
      let guard = 0;
      while (!this.done && this.t >= (this.cur.sec || 0) && guard++ < 64) {
        this.t -= this.cur.sec || 0;
        this._step();
        changed = true;
      }
      return changed;
    }
    _step() {
      this.index += 1;
      const mark = { t: this.clock - this.t, rec: this.rec - this.t };
      if (this.index >= this.count) {
        this.done = true;
        this.index = this.count;
        this.t = 0;
        this.ended = mark;
      } else this.starts[this.index] = mark;
    }
    /** Move on now: the learner is ready before the clock. */
    skip() {
      if (this.done) return false;
      this.skipped.push(this.index);
      this.t = 0;
      this._step();
      return true;
    }
    /** Where step i ran, in practice time (t0, t1) and recording time (r0, r1). */
    span(i, stopAt) {
      const a = this.starts[i];
      if (!a) return null;
      const b = this.starts[i + 1] || this.ended || stopAt || { t: this.clock, rec: this.rec };
      return { t0: a.t, t1: b.t, r0: a.rec, r1: b.rec };
    }
  }

  /* —— Listen-back —— */

  /**
   * Plays chapters of the take the engine just recorded: a chapter is one
   * range of the recording, or several played in a row ("A, then B").
   */
  class ChapterPlayer {
    constructor(onChange) {
      this.onChange = onChange || (() => {});
      this.audio = null;
      this.url = null;
      this.chapters = [];
      this.sel = 0;
      this.playing = false;
      this._segs = [];
      this._end = null;
      this._raf = 0;
    }
    get ready() {
      return !!this.audio;
    }
    get pos() {
      return this.audio ? this.audio.currentTime || 0 : 0;
    }
    attach(url) {
      if (!url || url === this.url) return;
      this.detach();
      this.url = url;
      const a = new Audio();
      a.preload = "auto";
      a.src = url;
      a.addEventListener("timeupdate", () => this._check());
      a.addEventListener("ended", () => this._stopped());
      this.audio = a;
      this.onChange();
    }
    setChapters(list) {
      this.chapters = list || [];
      this.sel = clamp(this.sel, 0, Math.max(0, this.chapters.length - 1));
    }
    select(i) {
      if (!this.chapters.length) return;
      this.sel = clamp(i, 0, this.chapters.length - 1);
      if (this.playing) this.play(this.sel);
      else this.onChange();
    }
    toggle() {
      if (this.playing) this.pause();
      else this.play(this.sel);
    }
    play(i) {
      if (!this.audio || !this.chapters.length) return;
      this.sel = clamp(i, 0, this.chapters.length - 1);
      const ch = this.chapters[this.sel];
      this._segs = (ch.segs || [[ch.start, ch.end]]).filter((s) => s && s[1] > s[0]).map((s) => s.slice());
      this._next();
    }
    _next() {
      const seg = this._segs.shift();
      if (!seg) {
        this.pause();
        return;
      }
      this._end = seg[1];
      try {
        this.audio.currentTime = Math.max(0, seg[0]);
      } catch {
        /* not seekable yet: plays from where it is */
      }
      this.playing = true;
      const p = this.audio.play();
      if (p && p.catch) p.catch(() => this._stopped());
      this._loop();
      this.onChange();
    }
    _loop() {
      cancelAnimationFrame(this._raf);
      const step = () => {
        if (!this.playing) return;
        this._check();
        this.onChange();
        this._raf = requestAnimationFrame(step);
      };
      this._raf = requestAnimationFrame(step);
    }
    _check() {
      if (!this.playing || this._end == null || !this.audio) return;
      if (this.audio.currentTime >= this._end) {
        if (this._segs.length) this._next();
        else this.pause();
      }
    }
    pause() {
      const was = this.playing;
      this.playing = false;
      cancelAnimationFrame(this._raf);
      try {
        if (this.audio && !this.audio.paused) this.audio.pause();
      } catch {
        /* ignore */
      }
      if (was) this.onChange();
    }
    _stopped() {
      if (!this.playing) return;
      this.playing = false;
      cancelAnimationFrame(this._raf);
      this.onChange();
    }
    detach() {
      this.pause();
      if (this.audio) {
        try {
          this.audio.removeAttribute("src");
          this.audio.load();
        } catch {
          /* ignore */
        }
      }
      this.audio = null;
      this.url = null;
    }
    destroy() {
      this.onChange = () => {};
      this.detach();
    }
  }

  /** The take the engine just recorded, if it is not one of the `prev` takes. */
  function findTake(prev) {
    const old = Array.isArray(prev) ? prev : prev ? [prev] : [];
    let url = null;
    try {
      url = global.VTApp?.getState?.()?.practice?.recUrl || null;
    } catch {
      url = null;
    }
    if (url && !old.includes(url)) return url;
    url = document.querySelector("#playback-area audio")?.src || null;
    return url && !old.includes(url) ? url : null;
  }
  function currentTakeUrl() {
    try {
      return global.VTApp?.getState?.()?.practice?.recUrl || null;
    } catch {
      return null;
    }
  }

  /* —— Drawing pieces —— */

  /**
   * The steps as one bar, each segment as long as its step: done steps gold
   * with a check, the current one filling with its time and outlined, the
   * rest waiting as outlines. Labels underneath when there is room.
   */
  function stepBar(ctx, box, run, opts = {}) {
    const { x, y, w, h } = box;
    const phases = run.phases;
    const n = phases.length;
    if (!n) return;
    const total = run.total || 1;
    const gap = n > 8 ? 2 : 3;
    const avail = w - gap * (n - 1);
    let px = x;
    const r = Math.min(5, h / 2);
    phases.forEach((p, i) => {
      const sw = Math.max(5, (avail * (p.sec || 0)) / total);
      const done = run.done || i < run.index;
      const cur = !run.done && i === run.index;
      ctx.fillStyle = done ? C.done : "rgba(170, 195, 230, 0.12)";
      ctx.globalAlpha = done ? 0.85 : 1;
      roundRect(ctx, px, y, sw, h, r);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (done && sw >= 16 && h >= 9) glyph(ctx, "check", px + sw / 2, y + h / 2, "#1a1405", Math.min(4, h * 0.35));
      if (cur) {
        ctx.fillStyle = C.target;
        roundRect(ctx, px, y, Math.max(3, sw * run.frac), h, r);
        ctx.fill();
        ctx.strokeStyle = C.text;
        ctx.lineWidth = 1.5;
        roundRect(ctx, px + 0.5, y + 0.5, sw - 1, h - 1, r);
        ctx.stroke();
      }
      if (opts.labels) {
        const text = loc(p, "short") || p.label || "";
        ctx.font = font(10, cur ? 800 : 700);
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillStyle = cur ? C.text : done ? C.done : C.muted;
        const tw = ctx.measureText(text).width;
        const words = tw <= sw - 4 ? text : sw >= 16 ? String(i + 1) : "";
        if (words) ctx.fillText(words, px + sw / 2, y + h + 3, sw - 2);
      }
      px += sw + gap;
    });
  }

  /** Words with *starred* key words; the key words light up while `hot`. */
  function scriptLine(ctx, text, x, y, maxW, px, hot) {
    const parts = String(text).split("*");
    let size = px;
    const width = () => {
      let tw = 0;
      parts.forEach((s, i) => {
        ctx.font = font(size, i % 2 ? 900 : 700);
        tw += ctx.measureText(s).width;
      });
      return tw;
    };
    while (size > 11 && width() > maxW) size -= 1;
    let cx = x;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    parts.forEach((s, i) => {
      if (!s) return;
      const key = i % 2 === 1;
      ctx.font = font(size, key ? 900 : 700);
      const tw = ctx.measureText(s).width;
      ctx.fillStyle = key ? (hot ? C.done : C.text) : C.muted;
      ctx.fillText(s, cx, y, Math.max(10, maxW - (cx - x)));
      if (key && hot) {
        ctx.fillStyle = C.done;
        ctx.fillRect(cx, y + size * 0.62, tw, 2);
      }
      cx += tw;
    });
  }

  /** Wrapped text; returns the height used. */
  function wrap(ctx, text, x, y, maxW, lineH, maxLines) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    words.forEach((w) => {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        lines.push(line);
        line = w;
      } else line = test;
    });
    if (line) lines.push(line);
    const out = lines.slice(0, maxLines);
    if (lines.length > maxLines && out.length) out[out.length - 1] = out[out.length - 1].replace(/\s*\S*$/, "") + " …";
    ctx.textBaseline = "top";
    out.forEach((l, i) => ctx.fillText(l, x, y + i * lineH, maxW));
    return out.length * lineH;
  }
  function lineCount(ctx, text, maxW) {
    const words = String(text || "").split(/\s+/).filter(Boolean);
    let n = words.length ? 1 : 0;
    let line = "";
    words.forEach((w) => {
      const test = line ? line + " " + w : w;
      if (ctx.measureText(test).width > maxW && line) {
        n++;
        line = w;
      } else line = test;
    });
    return n;
  }

  /* —— Faces —— */

  const EXPR = {
    neutral: { brow: 0, eye: 1, happy: 0, smile: 0, open: 0, jaw: 0, tilt: 0 },
    calm: { brow: -0.1, eye: 0.72, happy: 0, smile: 0.05, open: 0, jaw: 0, tilt: 0 },
    warm: { brow: 0.15, eye: 0.85, happy: 0.75, smile: 0.75, open: 0, jaw: 0, tilt: 0 },
    curious: { brow: 0.3, browL: 1, browR: 0.05, eye: 1.15, happy: 0, smile: 0.12, open: 0.06, jaw: 0, tilt: -0.12 },
    surprise: { brow: 1, eye: 1.55, happy: 0, smile: 0, open: 0.85, jaw: 0.8, tilt: 0 },
    resolve: { brow: -0.05, eye: 0.78, happy: 0.5, smile: 0.5, open: 0, jaw: 0, tilt: 0.07 },
    hang: { brow: -0.12, eye: 0.62, happy: 0, smile: 0, open: 0.55, jaw: 0.85, tilt: 0 },
    chew: { brow: -0.05, eye: 0.75, happy: 0, smile: 0, open: 0, jaw: 0.1, tilt: 0, lips: 1 }
  };
  const EXPR_KEYS = ["brow", "eye", "happy", "smile", "open", "jaw", "tilt", "lips"];
  function mixExpr(a, b, k) {
    const o = {};
    EXPR_KEYS.forEach((key) => {
      o[key] = lerp(a[key] || 0, b[key] || 0, k);
    });
    o.browL = lerp(a.browL != null ? a.browL : a.brow || 0, b.browL != null ? b.browL : b.brow || 0, k);
    o.browR = lerp(a.browR != null ? a.browR : a.brow || 0, b.browR != null ? b.browR : b.brow || 0, k);
    return o;
  }

  /** A face `s` px tall centred at (cx, cy) wearing expression `e`. */
  function drawFace(ctx, cx, cy, s, e) {
    const lw = Math.max(1.5, s * 0.026);
    const rx = s * 0.36;
    const ry = s * 0.42;
    const drop = (e.jaw || 0) * s * 0.11;
    ctx.save();
    ctx.translate(cx, cy - drop * 0.4);
    ctx.rotate(e.tilt || 0);
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    // Crown, and a jaw that can hang
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, Math.PI, TAU);
    ctx.bezierCurveTo(rx, ry * 0.7 + drop * 0.5, rx * 0.5, ry + drop, 0, ry + drop);
    ctx.bezierCurveTo(-rx * 0.5, ry + drop, -rx, ry * 0.7 + drop * 0.5, -rx, 0);
    ctx.closePath();
    ctx.fillStyle = "rgba(191, 230, 255, 0.07)";
    ctx.fill();
    ctx.strokeStyle = C.you;
    ctx.lineWidth = lw;
    ctx.stroke();
    // Eyes
    const ey = -s * 0.05;
    const ex = s * 0.14;
    const erx = s * 0.064;
    const ery = Math.max(1.2, s * 0.034 * (e.eye == null ? 1 : e.eye) * (1 - 0.4 * (e.happy || 0)));
    [-1, 1].forEach((sd) => {
      ctx.beginPath();
      ctx.ellipse(sd * ex, ey, erx, ery, 0, 0, TAU);
      ctx.strokeStyle = C.you;
      ctx.lineWidth = lw * 0.85;
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sd * ex, ey, Math.max(1, Math.min(ery * 0.75, s * 0.024)), 0, TAU);
      ctx.fillStyle = C.you;
      ctx.fill();
      if ((e.happy || 0) > 0.2) {
        const cy2 = ey + ery + s * 0.035;
        ctx.beginPath();
        ctx.moveTo(sd * ex - erx, cy2);
        ctx.quadraticCurveTo(sd * ex, cy2 - e.happy * s * 0.04, sd * ex + erx, cy2);
        ctx.lineWidth = lw * 0.6;
        ctx.stroke();
      }
    });
    // Brows
    [-1, 1].forEach((sd) => {
      const raise = sd < 0 ? (e.browL != null ? e.browL : e.brow || 0) : e.browR != null ? e.browR : e.brow || 0;
      const by = ey - s * 0.1 - raise * s * 0.08;
      ctx.beginPath();
      ctx.moveTo(sd * ex - s * 0.078, by + s * 0.014);
      ctx.quadraticCurveTo(sd * ex, by - s * 0.02 - raise * s * 0.025, sd * ex + s * 0.078, by + s * 0.014);
      ctx.strokeStyle = C.you;
      ctx.lineWidth = lw * 1.3;
      ctx.stroke();
    });
    // Mouth
    const my = s * 0.2 + drop * 0.72;
    const mw = s * (0.11 + 0.05 * (e.smile || 0));
    const open = e.open || 0;
    ctx.lineWidth = lw;
    ctx.strokeStyle = C.you;
    if (open > 0.04 && !(e.lips > 0.5)) {
      ctx.beginPath();
      ctx.ellipse(0, my + open * s * 0.025, mw * (1 - 0.35 * open), s * 0.016 + open * s * 0.085, 0, 0, TAU);
      ctx.fillStyle = "#04070b";
      ctx.fill();
      ctx.stroke();
    } else {
      const sm = e.smile || 0;
      ctx.beginPath();
      ctx.moveTo(-mw, my - sm * s * 0.025);
      ctx.quadraticCurveTo(0, my + sm * s * 0.07, mw, my - sm * s * 0.025);
      ctx.stroke();
    }
    ctx.restore();
    return { rx, ry, drop, top: cy - ry, bottom: cy + ry + drop };
  }

  /** A face that settles into `to` from `from` over the first 0.7 s of a step. */
  function faceStep(ctx, box, info, from, to) {
    const s = Math.min(box.h * 0.92, box.w * 0.9);
    const k = info.reduced ? 1 : ease(info.t / 0.7);
    const e = mixExpr(from || EXPR.neutral, to, k);
    return drawFace(ctx, box.x + box.w / 2, box.y + box.h * 0.47, s, e);
  }

  /* —— Art: jaw and neck release (s17) —— */

  function breathDot(ctx, box, t, reduced) {
    const { x, y, w, h } = box;
    const cx = x + w / 2;
    const rMax = Math.min(w * 0.42, h * 0.3);
    const rMin = rMax * 0.45;
    const u = ((t % 10) + 10) % 10;
    const inhale = u < 4;
    const k = reduced ? 0.7 : inhale ? ease(u / 4) : 1 - ease((u - 4) / 6);
    const r = rMin + (rMax - rMin) * k;
    const cy = y + h * 0.42;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fillStyle = C.airSoft;
    ctx.fill();
    ctx.strokeStyle = C.air;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, rMax, 0, TAU);
    ctx.strokeStyle = C.grid;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = font(h < 100 ? 10 : 11, 800);
    ctx.fillStyle = C.air;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const word = reduced ? L("respira", "breathe") : inhale ? L("inhala", "in") : L("exhala", "out");
    ctx.fillText(word, cx, cy + rMax + 4, w);
    if (h >= 110) {
      ctx.fillStyle = C.muted;
      ctx.font = font(10, 700);
      ctx.fillText(L("no aguantes el aire", "don't hold your breath"), cx, cy + rMax + 18, w + 20);
    }
  }

  function artJaw(ctx, box, info) {
    const { x, y, w, h } = box;
    const faceW = Math.min(w * 0.6, h);
    const k = info.reduced ? 1 : ease(info.t / 5);
    const sway = info.reduced ? 0 : Math.sin(info.t * 0.9) * 0.06 * k;
    const e = mixExpr(EXPR.calm, EXPR.hang, clamp(k + sway, 0, 1));
    const s = Math.min(h * 0.86, faceW);
    const cx = x + faceW / 2;
    const cy = y + h * 0.45;
    const g = drawFace(ctx, cx, cy, s, e);
    // Two fingers resting on each hinge, in front of the ear
    [-1, 1].forEach((sd) => {
      const fx = cx + sd * (g.rx + s * 0.01);
      const fy = cy - s * 0.02;
      ctx.fillStyle = C.done;
      ctx.globalAlpha = 0.9;
      roundRect(ctx, fx - s * 0.03, fy - s * 0.02, s * 0.06, s * 0.13, s * 0.03);
      ctx.fill();
      roundRect(ctx, fx - s * 0.03 + sd * s * 0.05, fy - s * 0.005, s * 0.06, s * 0.12, s * 0.03);
      ctx.fill();
      ctx.globalAlpha = 1;
    });
    // The jaw falls on its own: an arrow down under the chin
    if (h >= 90) {
      const ay = Math.min(y + h - 6, g.bottom + 8);
      ctx.strokeStyle = C.muted;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx, ay - 8);
      ctx.lineTo(cx, ay);
      ctx.stroke();
      glyph(ctx, "tri", cx, ay, C.muted, 3.5);
    }
    breathDot(ctx, { x: x + faceW + 6, y, w: w - faceW - 6, h }, info.clock || info.t, info.reduced);
  }

  function artNeck(ctx, box, info) {
    const { x, y, w, h } = box;
    const cx = x + w / 2;
    const r = Math.min(h * 0.18, w * 0.16);
    const pivotY = y + h * 0.8;
    const cyU = pivotY - r * 2.05; // upright head centre
    const A = r * 1.5;
    const B = r * 0.85;
    // The half circle the head draws: left, down to the chest, right — and back
    const period = 16;
    const u = ((info.t % period) + period) % period;
    const tri = u < period / 2 ? u / (period / 2) : 2 - u / (period / 2);
    const theta = info.reduced ? Math.PI / 2 : Math.PI * (1 - ease(tri));
    // The back half (never)
    ctx.setLineDash([3, 5]);
    ctx.strokeStyle = C.faint;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(cx, cyU, A, B, 0, Math.PI, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    glyph(ctx, "cross", cx, cyU - B, C.muted, Math.max(4, r * 0.35));
    if (h >= 100 && w >= 120) {
      ctx.font = font(10, 800);
      ctx.fillStyle = C.muted;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(L("nunca atrás", "never back"), cx + r * 0.5, cyU - B - 1, w / 2);
    }
    // The front half (the path)
    ctx.setLineDash([6, 5]);
    ctx.strokeStyle = C.done;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(cx, cyU, A, B, 0, 0, Math.PI);
    ctx.stroke();
    ctx.setLineDash([]);
    // Shoulders and neck
    ctx.strokeStyle = C.you;
    ctx.lineWidth = Math.max(1.8, r * 0.14);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cx - r * 2.6, y + h - 2);
    ctx.quadraticCurveTo(cx - r * 2.4, pivotY + r * 0.2, cx - r * 0.9, pivotY + r * 0.15);
    ctx.lineTo(cx + r * 0.9, pivotY + r * 0.15);
    ctx.quadraticCurveTo(cx + r * 2.4, pivotY + r * 0.2, cx + r * 2.6, y + h - 2);
    ctx.stroke();
    const hx = cx + A * Math.cos(theta);
    const hy = cyU + B * Math.sin(theta);
    ctx.beginPath();
    ctx.moveTo(cx, pivotY + r * 0.1);
    ctx.lineTo(lerp(cx, hx, 0.6), lerp(pivotY, hy + r * 0.8, 0.8));
    ctx.stroke();
    // Head, tilting into the curve
    ctx.save();
    ctx.translate(hx, hy);
    ctx.rotate(0.45 * Math.cos(theta));
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.82, r, 0, 0, TAU);
    ctx.fillStyle = "rgba(191, 230, 255, 0.08)";
    ctx.fill();
    ctx.lineWidth = Math.max(1.5, r * 0.12);
    ctx.stroke();
    ctx.fillStyle = C.you;
    [-1, 1].forEach((sd) => {
      ctx.beginPath();
      ctx.arc(sd * r * 0.32, -r * 0.05 + r * 0.18 * Math.sin(theta), Math.max(1, r * 0.08), 0, TAU);
      ctx.fill();
    });
    ctx.restore();
    // Direction
    if (info.reduced) {
      glyph(ctx, "up", cx - A, cyU + 2, C.done, 5);
      glyph(ctx, "up", cx + A, cyU + 2, C.done, 5);
    } else {
      const dir = u < period / 2 ? 1 : -1;
      const ax = cx + A * Math.cos(theta + dir * -0.35);
      const ay = cyU + B * Math.sin(theta + dir * -0.35);
      ctx.fillStyle = C.done;
      ctx.beginPath();
      ctx.arc(ax, ay, 3, 0, TAU);
      ctx.fill();
    }
  }

  function artChew(ctx, box, info) {
    const { x, y, w, h } = box;
    const faceW = Math.min(w * 0.72, h);
    const s = Math.min(h * 0.86, faceW);
    const k = info.reduced ? 0.4 : 0.5 - 0.5 * Math.cos(TAU * info.t);
    const e = Object.assign({}, EXPR.chew, { jaw: 0.04 + 0.2 * k });
    const cx = x + faceW / 2;
    const cy = y + h * 0.45;
    const g = drawFace(ctx, cx, cy, s, e);
    // The hum: soft waves by the closed lips
    const mx = cx + s * 0.2;
    const my = cy + s * 0.2 + g.drop * 0.5;
    ctx.strokeStyle = C.air;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < 3; i++) {
      const a = info.reduced ? 0.8 : 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(info.t * 3 - i));
      ctx.globalAlpha = a;
      const wx = mx + i * s * 0.1;
      ctx.beginPath();
      for (let j = 0; j <= 12; j++) {
        const py = my - s * 0.1 + (j / 12) * s * 0.2;
        const px = wx + Math.sin(j * 1.1) * s * 0.018;
        if (j) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (w - faceW > 30) {
      ctx.font = font(h < 100 ? 12 : 14, 800);
      ctx.fillStyle = C.air;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("mmm", mx + s * 0.32, my, w - faceW);
    }
  }

  /** One mouth seen from the front, the soft palate rising to `lift` (0..1). */
  function palate(ctx, box, lift, opts = {}) {
    const { x, y, w, h } = box;
    const top = y + h * 0.1;
    const stopY = y + h * 0.3;
    const base = y + h * 0.78;
    const left = x + w * 0.1;
    const right = x + w * 0.9;
    // The yawn itself: above the line, not visited
    ctx.fillStyle = V.hatch(ctx, "rgba(170, 195, 230, 0.16)");
    roundRect(ctx, left, top, right - left, stopY - top, 5);
    ctx.fill();
    // Mouth outline
    ctx.strokeStyle = opts.color || C.grid;
    ctx.lineWidth = opts.current ? 1.6 : 1;
    roundRect(ctx, left, top, right - left, y + h * 0.92 - top, Math.min(14, w * 0.15));
    ctx.stroke();
    // Tongue, low and loose
    ctx.strokeStyle = C.faint;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(left + 4, y + h * 0.88);
    ctx.quadraticCurveTo((left + right) / 2, y + h * 0.8, right - 4, y + h * 0.88);
    ctx.stroke();
    // Stop line: the instant before the yawn
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = C.target;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(left, stopY);
    ctx.lineTo(right, stopY);
    ctx.stroke();
    ctx.setLineDash([]);
    // The arch
    const apex = lerp(base, stopY + 2, clamp(lift, 0, 1));
    ctx.strokeStyle = opts.archColor || C.you;
    ctx.lineWidth = Math.max(2, w * 0.03);
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(left + 3, base + (y + h * 0.92 - base) * 0.3);
    ctx.bezierCurveTo(left + (right - left) * 0.22, apex, left + (right - left) * 0.78, apex, right - 3, base + (y + h * 0.92 - base) * 0.3);
    ctx.stroke();
    return { stopY, top, left, right, apex };
  }

  function artYawns(ctx, box, info) {
    const { x, y, w, h } = box;
    const sec = info.phase?.sec || 20;
    const slotSec = sec / 3;
    const cur = info.done ? 3 : Math.min(2, Math.floor(info.t / slotSec));
    const u = info.done ? 1 : (info.t - cur * slotSec) / slotSec;
    const gap = 8;
    const labelH = h >= 80 ? 14 : 0;
    const sw = (w - gap * 2) / 3;
    for (let i = 0; i < 3; i++) {
      const sx = x + i * (sw + gap);
      const done = i < cur;
      const now = i === cur;
      let lift = 0;
      if (done) lift = 1;
      else if (now && !info.reduced) lift = u < 0.55 ? ease(u / 0.55) : u < 0.85 ? 1 : 1 - ease((u - 0.85) / 0.15);
      else if (now) lift = 1;
      palate(ctx, { x: sx, y, w: sw, h: h - labelH }, lift, {
        current: now,
        color: now ? C.text : done ? "rgba(255, 211, 110, 0.55)" : C.grid,
        archColor: done ? C.done : now ? C.you : C.faint
      });
      if (labelH) {
        ctx.font = font(11, now ? 800 : 700);
        ctx.fillStyle = done ? C.done : now ? C.text : C.muted;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText((done ? "✓ " : "") + (i + 1), sx + sw / 2, y + h);
      }
    }
    if (h >= 110 && w >= 240) {
      ctx.font = font(10, 700);
      ctx.fillStyle = C.target;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(L("para aquí", "stop here"), x + sw * 0.1 + 2, y + (h - labelH) * 0.3 - 3);
    }
  }

  /* —— Art: soft palate (s19) —— */

  function artSurprise(ctx, box, info) {
    const loop = 6;
    const u = ((info.t % loop) + loop) % loop;
    let k = 1;
    if (!info.reduced) k = u < 0.8 ? 0 : u < 1.4 ? ease((u - 0.8) / 0.6) : u < 5 ? 1 : 1 - ease((u - 5) / 1);
    const s = Math.min(box.h * 0.92, box.w * 0.9);
    drawFace(ctx, box.x + box.w / 2, box.y + box.h * 0.46, s, mixExpr(EXPR.neutral, EXPR.surprise, k));
  }

  function artChapel(ctx, box, info) {
    const loop = 7.5;
    const u = ((info.t % loop) + loop) % loop;
    let lift = 1;
    if (!info.reduced) lift = u < 3 ? ease(u / 3) : u < 6 ? 1 : 1 - ease((u - 6) / 1.5);
    const w = Math.min(box.w, box.h * 1.25);
    const b = { x: box.x + (box.w - w) / 2, y: box.y, w, h: box.h };
    const g = palate(ctx, b, lift, { current: true, color: C.muted });
    if (box.h >= 90) {
      ctx.font = font(10, 800);
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = C.target;
      ctx.fillText(L("para aquí", "stop here"), (g.left + g.right) / 2, g.stopY - 3);
      ctx.fillStyle = C.muted;
      ctx.textBaseline = "top";
      ctx.fillText(L("espacio", "space"), (g.left + g.right) / 2, g.apex + 8);
    }
  }

  /* —— Art: gestures (v15) —— */

  const POSES = {
    base: { l: [-0.3, -0.08, -0.05, 0.07], r: [0.3, -0.08, 0.05, 0.07] },
    palms: { l: [-0.34, -0.06, -0.24, -0.12], r: [0.34, -0.06, 0.24, -0.12] },
    size: { l: [-0.5, -0.34, -0.72, -0.4], r: [0.5, -0.34, 0.72, -0.4] },
    count: { l: [-0.3, -0.08, -0.05, 0.07], r: [0.4, -0.1, 0.32, -0.42] },
    here: { l: [-0.46, -0.28, -0.7, -0.3], r: [0.3, -0.08, 0.05, 0.07] },
    there: { l: [-0.3, -0.08, -0.05, 0.07], r: [0.46, -0.28, 0.7, -0.3] }
  };

  /**
   * One gesture on a 4 s loop: at home base, then the gesture arrives about
   * 0.2 s before the key word lights up — "with or slightly before the word".
   * Returns whether the key word is lit.
   */
  function gestureCycle(t, reduced) {
    if (reduced) return { k: 1, hot: true, n: 3, alt: 0 };
    const loop = 4;
    const cycle = Math.floor(t / loop);
    const u = t - cycle * loop;
    const k = u < 1.2 ? 0 : u < 1.6 ? ease((u - 1.2) / 0.4) : u < 3.4 ? 1 : 1 - ease((u - 3.4) / 0.6);
    const hot = u >= 1.8 && u < 3.3;
    const n = u < 1.8 ? 1 : Math.min(3, 1 + Math.floor((u - 1.8) / 0.5));
    return { k, hot, n, alt: cycle % 2 };
  }

  function artGesture(ctx, box, info) {
    const { x, y, w, h } = box;
    const kind = info.phase?.pose || "base";
    const cyc = gestureCycle(info.t, info.reduced);
    // Figure from the frame's top (−0.97 s) to its bottom (+0.38 s)
    const s = Math.min(h / 1.38, w / 1.6);
    const cx = x + w / 2;
    const cy = y + 0.97 * s + Math.max(0, (h - 1.35 * s) / 2);
    const P = (px, py) => [cx + px * s, cy + py * s];
    const lw = Math.max(1.8, s * 0.03);
    let target = POSES[kind] || POSES.base;
    let word = "";
    if (kind === "location") {
      target = cyc.alt ? POSES.there : POSES.here;
      word = cyc.alt ? L("allá", "there") : L("aquí", "here");
    }
    const pose = { l: [], r: [] };
    ["l", "r"].forEach((side) => {
      for (let i = 0; i < 4; i++) pose[side][i] = lerp(POSES.base[side][i], target[side][i], kind === "base" || kind === "frame" ? 0 : cyc.k);
    });
    // Framing: the phone camera, waist up
    if (kind === "frame") {
      const [fx0, fy0] = P(-0.62, -0.95);
      const [fx1, fy1] = P(0.62, 0.36);
      ctx.strokeStyle = C.done;
      ctx.lineWidth = 2;
      ctx.setLineDash([7, 5]);
      roundRect(ctx, fx0, fy0, fx1 - fx0, fy1 - fy0, 10);
      ctx.stroke();
      ctx.setLineDash([]);
      if (h >= 100) {
        ctx.font = font(10, 800);
        ctx.fillStyle = C.done;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(L("cámara: cintura arriba", "camera: waist up"), fx0 + 4, fy0 + 3, fx1 - fx0 - 8);
      }
    }
    // Home base band at the navel
    const [bx0, by] = P(-0.42, 0.07);
    const [bx1] = P(0.42, 0.07);
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = "rgba(255, 211, 110, 0.45)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(bx0, by);
    ctx.lineTo(bx1, by);
    ctx.stroke();
    ctx.setLineDash([]);
    if (w >= 150 && h >= 90) {
      ctx.font = font(9, 700);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "right";
      ctx.textBaseline = "bottom";
      ctx.fillText(L("base", "home"), bx0 - 2, by + 4);
    }
    // Body
    ctx.strokeStyle = C.you;
    ctx.fillStyle = "rgba(191, 230, 255, 0.07)";
    ctx.lineWidth = lw;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    const [hx, hy] = P(0, -0.66);
    ctx.beginPath();
    ctx.arc(hx, hy, s * 0.13, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    const [sl, sy] = P(-0.27, -0.42);
    const [sr] = P(0.27, -0.42);
    const [wl, wy] = P(-0.2, 0.3);
    const [wr] = P(0.2, 0.3);
    ctx.moveTo(...P(-0.05, -0.53));
    ctx.lineTo(...P(-0.05, -0.47));
    ctx.quadraticCurveTo(sl, sy - s * 0.02, sl, sy + s * 0.06);
    ctx.lineTo(wl, wy);
    ctx.lineTo(wr, wy);
    ctx.lineTo(sr, sy + s * 0.06);
    ctx.quadraticCurveTo(sr, sy - s * 0.02, ...P(0.05, -0.47));
    ctx.lineTo(...P(0.05, -0.53));
    ctx.fill();
    ctx.stroke();
    // Arms
    [
      ["l", -1],
      ["r", 1]
    ].forEach(([side, sd]) => {
      const [ex, ey, hx2, hy2] = pose[side];
      const [shx, shy] = P(sd * 0.25, -0.38);
      const [elx, ely] = P(ex, ey);
      const [hdx, hdy] = P(hx2, hy2);
      ctx.strokeStyle = C.you;
      ctx.lineWidth = lw * 1.3;
      ctx.beginPath();
      ctx.moveTo(shx, shy);
      ctx.lineTo(elx, ely);
      ctx.lineTo(hdx, hdy);
      ctx.stroke();
      // Hand: an open palm for the palms pose, a dot otherwise
      ctx.fillStyle = C.you;
      ctx.beginPath();
      if (kind === "palms" && cyc.k > 0.5) {
        ctx.ellipse(hdx, hdy, s * 0.06, s * 0.03, 0, 0, Math.PI);
        ctx.lineWidth = lw;
        ctx.stroke();
      } else {
        ctx.arc(hdx, hdy, s * 0.045, 0, TAU);
        ctx.fill();
      }
      // Fingers for the count, on the raised hand
      if (kind === "count" && side === "r" && cyc.k > 0.6) {
        ctx.strokeStyle = C.done;
        ctx.lineWidth = Math.max(1.6, lw * 0.9);
        for (let i = 0; i < cyc.n; i++) {
          const fx = hdx - s * 0.04 + i * s * 0.04;
          ctx.beginPath();
          ctx.moveTo(fx, hdy - s * 0.03);
          ctx.lineTo(fx, hdy - s * 0.12);
          ctx.stroke();
        }
      }
    });
    // Movement cues
    if (kind === "size" && cyc.k > 0.5) {
      [-1, 1].forEach((sd) => {
        const [ax, ay] = P(sd * 0.86, -0.4);
        ctx.strokeStyle = C.done;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(ax - sd * s * 0.08, ay);
        ctx.lineTo(ax, ay);
        ctx.lineTo(ax - sd * s * 0.04, ay - s * 0.04);
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - sd * s * 0.04, ay + s * 0.04);
        ctx.stroke();
      });
    }
    if (kind === "count" && cyc.k > 0.6 && w >= 120) {
      const [nx, ny] = P(0.52, -0.6);
      ctx.font = font(Math.max(12, s * 0.12), 900, true);
      ctx.fillStyle = C.done;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(cyc.n), nx, ny);
    }
    if (kind === "palms" && cyc.hot) {
      [-1, 1].forEach((sd) => glyph(ctx, "dot", ...P(sd * 0.24, -0.24), C.done, 6));
    }
    if (word && cyc.k > 0.5) {
      const [lx, ly] = P(cyc.alt ? 0.72 : -0.72, -0.5);
      ctx.font = font(Math.max(11, s * 0.1), 900);
      ctx.fillStyle = C.done;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(word, lx, ly);
    }
    return cyc;
  }

  /* —— Art: faces for the story beats (v16) —— */

  function artFace(ctx, box, info) {
    const run = info.m && info.m.run;
    const prevKey = run && info.index > 0 ? run.phases[info.index - 1].face : "neutral";
    const key = info.phase?.face || "neutral";
    faceStep(ctx, box, info, EXPR[prevKey] || EXPR.neutral, EXPR[key] || EXPR.neutral);
  }

  /* —— Art: counting with a pen (v4) —— */

  function penGlyph(ctx, cx, cy, s, state) {
    // Lips
    ctx.strokeStyle = C.you;
    ctx.lineWidth = Math.max(1.5, s * 0.05);
    ctx.beginPath();
    ctx.ellipse(cx, cy, s * 0.42, s * 0.2, 0, 0, TAU);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.42, cy);
    ctx.lineTo(cx + s * 0.42, cy);
    ctx.strokeStyle = C.faint;
    ctx.lineWidth = 1;
    ctx.stroke();
    const out = state === "out";
    const off = state === "off";
    const dx = out ? s * 0.55 : 0;
    ctx.globalAlpha = off ? 0.35 : 1;
    ctx.fillStyle = C.done;
    roundRect(ctx, cx - s * 0.62 + dx, cy - s * 0.045, s * 1.1, s * 0.09, s * 0.04);
    ctx.fill();
    ctx.fillStyle = "#e7ecf3";
    ctx.beginPath();
    ctx.moveTo(cx + s * 0.48 + dx, cy - s * 0.045);
    ctx.lineTo(cx + s * 0.6 + dx, cy);
    ctx.lineTo(cx + s * 0.48 + dx, cy + s * 0.045);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (off) glyph(ctx, "cross", cx, cy, C.muted, s * 0.25);
    if (out) {
      ctx.strokeStyle = C.muted;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + s * 0.75, cy + s * 0.3);
      ctx.lineTo(cx + s * 1.05, cy + s * 0.3);
      ctx.stroke();
      glyph(ctx, "tri", cx + s * 1.05, cy + s * 0.3, C.muted, 3);
    }
  }

  function artNumbers(ctx, box, info) {
    let { y, h } = box;
    const { x, w } = box;
    const p = info.phase || {};
    const penState = p.kind === "penOff" ? "out" : p.pen === false ? "off" : "in";
    const penWord = penState === "in" ? L("sin morder", "don't bite") : penState === "out" ? L("fuera", "out") : L("sin bolígrafo", "no pen");
    // Narrow and tall (a phone upright): the pen on a row of its own, so the
    // numbers get the whole width
    if (w < 380 && h >= 110) {
      const rowH = Math.min(40, h * 0.26);
      const ps = rowH * 0.9;
      penGlyph(ctx, x + ps * 0.7, y + rowH / 2, ps, penState);
      ctx.font = font(12, 800);
      ctx.fillStyle = penState === "in" ? C.done : C.muted;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(penWord, x + ps * 1.6 + (penState === "out" ? ps * 0.6 : 0), y + rowH / 2, w - ps * 2);
      y += rowH + 6;
      h -= rowH + 6;
    }
    const showPen = w >= 180 && !(w < 380 && box.h >= 110);
    const penW = showPen ? Math.min(w * 0.22, h * 1.1) : 0;
    if (showPen) {
      const ps = Math.min(penW * 0.75, h * 0.55);
      penGlyph(ctx, x + penW / 2 - (penState === "out" ? ps * 0.25 : 0), y + h * 0.42, ps, penState);
      if (h >= 70) {
        ctx.font = font(10, 800);
        ctx.fillStyle = penState === "in" ? C.done : C.muted;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(penWord, x + penW / 2, y + h * 0.42 + ps * 0.4, penW);
      }
    }
    const rx = x + penW + (showPen ? 8 : 0);
    const rw = w - (rx - x);
    if (p.kind === "penOff") {
      ctx.font = font(Math.min(22, h * 0.26), 800);
      ctx.fillStyle = C.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(L("Quita el bolígrafo", "Take the pen out"), rx + rw / 2, y + h * 0.4, rw);
      ctx.font = font(12, 700);
      ctx.fillStyle = C.muted;
      ctx.fillText(L("mismo ritmo, ahora sin él", "same pace, now without it"), rx + rw / 2, y + h * 0.4 + Math.min(26, h * 0.3), rw);
      return;
    }
    const pace = p.pace || 1.5;
    const from = p.from || 1;
    const to = p.to || 60;
    const k = info.t / pace;
    const i = Math.min(to - from, Math.floor(k));
    const finished = info.done || k >= to - from + 1;
    const f = finished ? 1 : k - Math.floor(k);
    const n = from + i;
    const slot = Math.min(rw / 6.2, h * 0.9);
    const cx = rx + rw * 0.4;
    const cy = y + h * 0.5;
    const shift = info.reduced || finished ? 0 : (1 - ease(Math.min(1, f / 0.16))) * slot;
    // Beat: a ball that lands on each number (a moving mark keeps time
    // better than a flash)
    const ballY = cy - h * 0.36 + (info.reduced ? 0 : Math.abs(Math.sin(Math.PI * f)) * -h * 0.08);
    for (let d = -2; d <= 3; d++) {
      const v = n + d;
      if (v < from || v > to) continue;
      const px = cx + d * slot + shift;
      if (px < rx + slot * 0.3 || px > rx + rw - slot * 0.3) continue;
      const big = d === 0;
      const size = big ? Math.min(h * 0.5, slot * 0.72) : Math.min(h * 0.28, slot * 0.42);
      ctx.font = font(size, big ? 900 : 700, true);
      ctx.fillStyle = big ? (finished ? C.done : C.text) : d < 0 ? C.faint : C.muted;
      ctx.globalAlpha = d > 0 ? 1 - (d - 1) * 0.25 : d < 0 ? 0.6 : 1;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(v), px, cy + (big ? 0 : size * 0.1));
      ctx.globalAlpha = 1;
    }
    if (!finished) {
      ctx.fillStyle = C.done;
      ctx.beginPath();
      ctx.arc(cx + shift, Math.max(y + 5, ballY), Math.max(3, h * 0.035), 0, TAU);
      ctx.fill();
      // Time to the next number
      ctx.fillStyle = C.grid;
      ctx.fillRect(cx - slot * 0.35, cy + h * 0.32, slot * 0.7, 3);
      ctx.fillStyle = C.target;
      ctx.fillRect(cx - slot * 0.35, cy + h * 0.32, slot * 0.7 * f, 3);
    } else if (h >= 60) {
      ctx.font = font(12, 800);
      ctx.fillStyle = C.done;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText("✓ " + L("hasta el " + to, "up to " + to), cx + slot * 0.55, cy, rw * 0.5);
    }
  }

  /* —— Art: persona deck and story arc (v5) —— */

  function heart(ctx, x, y, s, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 0.7);
    ctx.bezierCurveTo(x - s * 1.2, y - s * 0.1, x - s * 0.5, y - s * 0.9, x, y - s * 0.3);
    ctx.bezierCurveTo(x + s * 0.5, y - s * 0.9, x + s * 1.2, y - s * 0.1, x, y + s * 0.7);
    ctx.fill();
  }

  function artPersona(ctx, box, info) {
    const { x, y, w, h } = box;
    const p = info.phase || {};
    const run = info.m.run;
    const nx = run.next && run.next.kind === "persona" ? run.next : null;
    const cw = nx ? Math.min(w * 0.7, Math.max(w * 0.55, h * 2.4)) : Math.min(w, h * 2.6);
    ctx.fillStyle = "rgba(170, 195, 230, 0.07)";
    roundRect(ctx, x, y, cw, h, 10);
    ctx.fill();
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 1.5;
    roundRect(ctx, x + 0.5, y + 0.5, cw - 1, h - 1, 10);
    ctx.stroke();
    const ip = Math.min(14, h * 0.12);
    const iconS = Math.min(12, h * 0.12);
    if (p.icon === "heart") heart(ctx, x + ip + iconS, y + ip + iconS, iconS * 0.9, C.done);
    else glyph(ctx, p.icon || "star", x + ip + iconS, y + ip + iconS, C.done, iconS);
    ctx.fillStyle = C.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    fitLine(ctx, loc(p, "persona") || p.label || "", x + ip + iconS * 2 + 8, y + ip + iconS, cw - ip * 2 - iconS * 2 - 8, Math.min(22, h * 0.2), 900, 12);
    const intent = loc(p, "intent");
    if (intent && h >= 64) {
      const big = h >= 130 && cw >= 240;
      const lh = h < 110 ? 15 : big ? 23 : 18;
      ctx.font = font(h < 110 ? 12 : big ? 18 : 14, 700);
      ctx.fillStyle = C.text;
      ctx.globalAlpha = 0.85;
      wrap(ctx, intent, x + ip, y + ip + iconS * 2 + 10, cw - ip * 2, lh, Math.max(1, Math.floor((h - ip * 2 - iconS * 2 - 18) / lh)));
      ctx.globalAlpha = 1;
    }
    // Time left on this card
    ctx.fillStyle = C.grid;
    ctx.fillRect(x + ip, y + h - 7, cw - ip * 2, 3);
    ctx.fillStyle = C.target;
    ctx.fillRect(x + ip, y + h - 7, (cw - ip * 2) * (1 - info.frac), 3);
    // The next card, peeking
    if (nx && w - cw > 44) {
      const px = x + cw + 10;
      const pw = w - cw - 10;
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "rgba(170, 195, 230, 0.05)";
      roundRect(ctx, px, y + h * 0.12, pw, h * 0.76, 9);
      ctx.fill();
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 1;
      roundRect(ctx, px + 0.5, y + h * 0.12 + 0.5, pw - 1, h * 0.76 - 1, 9);
      ctx.stroke();
      ctx.globalAlpha = 1;
      ctx.font = font(10, 700);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(L("luego", "next"), px + 8, y + h * 0.12 + 7, pw - 12);
      ctx.fillStyle = C.muted;
      ctx.textBaseline = "middle";
      fitLine(ctx, loc(nx, "persona") || nx.label, px + 8, y + h * 0.5, pw - 14, 14, 800, 10);
    }
  }

  function artStory(ctx, box, info) {
    const { x, y, w, h } = box;
    const run = info.m.run;
    const zones = [];
    run.phases.forEach((p, i) => {
      if (p.kind === "story") zones.push({ p, i });
    });
    if (!zones.length) return;
    const total = zones.reduce((a, z) => a + (z.p.sec || 0), 0) || 1;
    let before = 0;
    zones.forEach((z) => {
      if (z.i < info.index) before += z.p.sec || 0;
    });
    const el = run.done ? total : before + (info.phase?.kind === "story" ? info.t : 0);
    const labelH = h >= 70 ? 16 : 12;
    const top = y + 4;
    const base = y + h - labelH - 4;
    const xOf = (s) => x + (s / total) * w;
    // Hill: setup climbs, the turn is the top, the point lands
    const curve = (s) => {
      const u = s / total;
      return base - (base - top) * (u < 0.62 ? Math.sin((u / 0.62) * (Math.PI / 2)) : 1 - 0.55 * ease((u - 0.62) / 0.38));
    };
    // Landing band: the last zone
    const last = zones[zones.length - 1];
    const land0 = total - (last.p.sec || 0);
    ctx.fillStyle = C.targetSoft;
    roundRect(ctx, xOf(land0), top, xOf(total) - xOf(land0), base - top, 6);
    ctx.fill();
    if (h >= 80) {
      ctx.font = font(10, 800);
      ctx.fillStyle = C.target;
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillText(L("aterriza el punto", "land the point"), xOf(total) - 4, top + 3, xOf(total) - xOf(land0) - 6);
    }
    // Zone dividers and names
    let acc = 0;
    zones.forEach((z, k) => {
      const a = acc;
      acc += z.p.sec || 0;
      const cur = !run.done && z.i === info.index;
      const done = run.done || z.i < info.index;
      if (k) {
        ctx.strokeStyle = C.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(xOf(a), top);
        ctx.lineTo(xOf(a), base);
        ctx.stroke();
      }
      ctx.font = font(h < 90 ? 10 : 12, cur ? 900 : 700);
      ctx.fillStyle = cur ? C.text : done ? C.done : C.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText((done ? "✓ " : "") + (loc(z.p, "short") || z.p.label), (xOf(a) + xOf(acc)) / 2, y + h, xOf(acc) - xOf(a) - 4);
    });
    // The arc
    ctx.strokeStyle = C.faint;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let s = 0; s <= total; s += total / 80) {
      const px = xOf(s);
      const py = curve(s);
      if (s) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.stroke();
    ctx.strokeStyle = C.you;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let s = 0; s <= el; s += total / 80) {
      const px = xOf(s);
      const py = curve(s);
      if (s) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    }
    ctx.stroke();
    // Now
    const nx = xOf(Math.min(el, total));
    ctx.strokeStyle = "rgba(238, 243, 250, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(nx, top);
    ctx.lineTo(nx, base);
    ctx.stroke();
    ctx.fillStyle = C.you;
    ctx.beginPath();
    ctx.arc(nx, curve(Math.min(el, total)), 5, 0, TAU);
    ctx.fill();
  }

  /* —— Measured pictures for the sung steps (s19) —— */

  /**
   * Your sung holds in this step as bars against the 1.5 s line: long enough
   * counts (check), shorter ones stay as outlines — no red, nothing taken back.
   * m.holds: [{ len, step }], m.holdLive: seconds of the hold under way or null.
   */
  function artHolds(ctx, box, info) {
    const { x, y, w, h } = box;
    const m = info.m;
    const min = (m.minHoldMs || 1500) / 1000;
    const maxS = 8;
    const list = (m.holds || []).filter((q) => q.step === info.index).slice(-10);
    const labelH = h >= 80 ? 16 : 0;
    const top = y + labelH + 4;
    const base = y + h - 12;
    const yOf = (s) => base - (clamp(s, 0, maxS) / maxS) * (base - top);
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, base + 0.5);
    ctx.lineTo(x + w, base + 0.5);
    ctx.stroke();
    ctx.setLineDash([5, 4]);
    ctx.strokeStyle = C.target;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x, yOf(min));
    ctx.lineTo(x + w, yOf(min));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = font(10, 800);
    ctx.fillStyle = C.target;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(fmtSec(min), x + w, yOf(min) - 2);
    if (labelH) {
      const n = list.filter((q) => q.len >= min).length;
      ctx.font = font(11, 800);
      ctx.fillStyle = C.muted;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(L(`Sostenidos ≥ ${fmtNum(min, 1)} s en este paso: ${n}`, `Holds ≥ ${fmtNum(min, 1)} s this step: ${n}`), x, y, w);
    }
    const slots = 11;
    const sw = w / slots;
    const bw = Math.min(40, sw * 0.62);
    const bars = list.map((q) => ({ len: q.len, live: false }));
    if (m.holdLive != null) bars.push({ len: m.holdLive, live: true });
    bars.slice(-slots).forEach((b, i) => {
      const cx = x + sw * (i + 0.5);
      const good = b.len >= min;
      const topY = yOf(b.len);
      ctx.fillStyle = C.you;
      ctx.globalAlpha = b.live ? 0.95 : good ? 0.75 : 0.25;
      roundRect(ctx, cx - bw / 2, topY, bw, Math.max(2, base - topY), 4);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (!good && !b.live) {
        ctx.strokeStyle = C.muted;
        ctx.lineWidth = 1;
        roundRect(ctx, cx - bw / 2 + 0.5, topY + 0.5, bw - 1, Math.max(2, base - topY) - 1, 4);
        ctx.stroke();
      }
      ctx.font = font(10, 800);
      ctx.fillStyle = good ? C.text : C.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      if (topY - 2 > y + labelH + 8) ctx.fillText((good && !b.live ? "✓ " : "") + fmtNum(b.len, 1), cx, topY - 2);
    });
    if (!bars.length) {
      ctx.font = font(12, 700);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(L("canta /A/ y sostén", "sing /A/ and hold"), x + w / 2, (top + base) / 2, w);
    }
  }

  /** Two capture slots — the phrase with the space closed, then open. */
  function artAB(ctx, box, info) {
    const { x, y, w, h } = box;
    const m = info.m;
    const slots = m.ab || [];
    const gap = 10;
    const cw = (w - gap) / 2;
    const cardH = h;
    [0, 1].forEach((i) => {
      const s = slots[i] || null;
      const cx = x + i * (cw + gap);
      const waiting = !s && (slots.length === i);
      const recording = s && s.end == null;
      const got = s && s.end != null;
      ctx.fillStyle = got ? "rgba(255, 211, 110, 0.12)" : "rgba(170, 195, 230, 0.06)";
      roundRect(ctx, cx, y, cw, cardH, 9);
      ctx.fill();
      ctx.strokeStyle = waiting || recording ? C.text : got ? "rgba(255, 211, 110, 0.55)" : C.grid;
      ctx.lineWidth = waiting || recording ? 1.6 : 1;
      roundRect(ctx, cx + 0.5, y + 0.5, cw - 1, cardH - 1, 9);
      ctx.stroke();
      ctx.fillStyle = C.text;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      fitLine(ctx, (got ? "✓ " : "") + (i ? L("2 · Abierto", "2 · Open") : L("1 · Cerrado", "1 · Closed")), cx + 10, y + 8, cw - 20, h < 90 ? 13 : 15, 900, 10);
      ctx.font = font(h < 90 ? 11 : 12, 700);
      ctx.fillStyle = C.muted;
      let line = "";
      if (got) line = fmtSec(s.len != null ? s.len : s.end - s.start);
      else if (recording) line = "● " + fmtSec(s.r0 != null ? m.run.rec - s.r0 : m.run.clock - s.start);
      else if (waiting) line = L("canta la frase…", "sing the phrase…");
      else line = L("después", "then");
      ctx.textBaseline = "top";
      ctx.fillText(line, cx + 10, y + (h < 90 ? 28 : 32), cw - 20);
      if (h >= 90) {
        ctx.font = font(10, 600);
        ctx.fillStyle = C.faint;
        ctx.fillText(i ? L("pre-bostezo, mismo volumen", "pre-yawn, same loudness") : L("espacio cerrado", "space closed"), cx + 10, y + cardH - 18, cw - 20);
      }
    });
  }

  /* —— The guided picture —— */

  function drawArt(ctx, art, box, info) {
    if (!art || !art.draw || box.w < 20 || box.h < 20) return;
    ctx.save();
    try {
      art.draw(ctx, box, info);
    } catch (err) {
      console.warn("[guided art]", err);
    }
    ctx.restore();
  }

  /**
   * The step you are on (large), what comes next and when, the countdown,
   * an illustration of the step with its words beside it, and every step
   * as a bar underneath. m: a Drill (below).
   */
  function guided(ctx, w, h, m) {
    panel(ctx, w, h);
    if (m.review && m.paintReview) {
      m.paintReview(ctx, w, h);
      return;
    }
    const run = m.run;
    const tiny = h < 135;
    const compact = !tiny && h < 190;
    const pad = tiny ? 8 : 10;
    const idx = Math.min(run.index, Math.max(0, run.count - 1));
    const phase = run.cur;
    const info = {
      t: run.done ? phase?.sec || 0 : run.t,
      frac: run.frac,
      index: idx,
      phase,
      done: run.done,
      reduced: V.reducedMotion(),
      tiny,
      compact,
      clock: run.clock,
      m
    };
    const art = run.done && m.doneArt ? m.doneArt() : m.artFor(phase, info);
    info.illustrated = !!(art && !art.measured && !art.plain);
    const title = run.done ? m.doneText() : phase?.label || "";
    const nx = run.next;
    const soon = !!nx && run.remaining <= (m.preCue || 4) && m.live;
    let nextText;
    if (run.done) nextText = m.doneSub();
    else if (nx) nextText = (soon ? L(`En ${Math.ceil(run.remaining)} s → `, `In ${Math.ceil(run.remaining)} s → `) : L("Luego: ", "Next: ")) + nx.label;
    else nextText = L("Último paso", "Last step");
    const stepWord = run.done || run.count < 2 ? "" : L(`Paso ${idx + 1} de ${run.count}`, `Step ${idx + 1} of ${run.count}`);
    const strip = m.strip();
    const status = m.status(info);
    const cd = run.done ? "✓" : String(Math.ceil(run.remaining));

    if (tiny) {
      const artH = h - pad * 2;
      const artW = art ? Math.min(w * 0.42, artH * (art.aspect || 1)) : 0;
      if (art) drawArt(ctx, art, { x: pad, y: pad, w: artW, h: artH }, info);
      const x0 = pad + (art ? artW + 12 : 0);
      const tw = w - x0 - pad;
      ctx.font = font(22, 800, true);
      ctx.fillStyle = run.done ? C.done : C.text;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillText(cd, w - pad, pad + 12);
      const cdW = ctx.measureText(cd).width + 10;
      ctx.fillStyle = C.text;
      ctx.textAlign = "left";
      fitLine(ctx, title, x0, pad + 12, tw - cdW, 16, 800, 11);
      ctx.fillStyle = soon ? C.done : C.muted;
      fitLine(ctx, nextText, x0, pad + 33, tw, 12, soon ? 800 : 700, 10);
      let yy = pad + 44;
      if (status && status.text) {
        ctx.fillStyle = status.color || C.muted;
        fitLine(ctx, status.text, x0, yy + 7, tw, 11, 700, 9);
        yy += 16;
      }
      if (strip && h - pad - 14 - yy >= 16) speechStrip(ctx, { x: x0, y: yy + 2, w: tw, h: 13 }, strip.vad, { seconds: 10, minLabel: 1e9 });
      stepBar(ctx, { x: x0, y: h - pad - 9, w: tw, h: 9 }, run, {});
      return;
    }

    // Head: the step, the countdown ring, the next step
    const ringR = compact ? 15 : 21;
    const rcx = w - pad - ringR - 2;
    const rcy = pad + ringR + 1;
    V.ring(ctx, rcx, rcy, ringR, run.done ? 1 : 1 - run.frac, { color: run.done ? C.done : C.target, width: compact ? 4 : 5 });
    ctx.font = font(ringR > 18 ? 15 : 12, 800, true);
    ctx.fillStyle = C.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(cd, rcx, rcy + 1);
    const headW = rcx - ringR - pad * 2;
    ctx.textAlign = "left";
    ctx.fillStyle = C.text;
    fitLine(ctx, title, pad + 2, pad + (compact ? 11 : 14), headW, compact ? 16 : w < 360 ? 17 : 20, 800, 12);
    const line2Y = pad + (compact ? 30 : 38);
    ctx.fillStyle = soon ? C.done : C.muted;
    fitLine(ctx, stepWord ? `${stepWord} · ${nextText}` : nextText, pad + 2, line2Y, headW, compact ? 11 : 13, soon ? 800 : 700, 10);

    // Foot: every step, as a bar
    const barH = compact ? 8 : 11;
    const labels = !compact && w >= 260;
    const barY = h - pad - barH - (labels ? 15 : 0);
    stepBar(ctx, { x: pad, y: barY, w: w - pad * 2, h: barH }, run, { labels });
    let bottom = barY - (compact ? 6 : 10);
    if (strip) {
      const sh = compact ? 13 : 18;
      if (!compact) {
        ctx.font = font(9, 700);
        ctx.fillStyle = C.faint;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(strip.label || L("tu voz", "your voice"), pad + 2, bottom - sh - 2);
      }
      speechStrip(ctx, { x: pad, y: bottom - sh, w: w - pad * 2, h: sh }, strip.vad, { seconds: w < 420 ? 10 : 20, minLabel: 1e9 });
      bottom -= sh + (compact ? 6 : 16);
    }
    const region = { x: pad, y: line2Y + (compact ? 10 : 16), w: w - pad * 2, h: 0 };
    region.h = bottom - region.y;
    artAndWords(ctx, region, art, info, m, status);
  }

  /** The illustration, with the step's words beside it (wide) or under it. */
  function artAndWords(ctx, region, art, info, m, status) {
    if (region.h < 24) return;
    const cue = info.done ? m.doneCue() : m.cueFor(info.phase, info);
    const script = info.done ? null : m.scriptFor(info.phase, info);
    const aspect = art ? art.aspect || 1 : 1;
    let artW = art ? Math.min(region.w, region.h * aspect) : 0;
    const side = art && region.w - artW >= 210;
    if (side || !art) {
      const textW = art ? Math.min(440, region.w - artW - 24) : region.w;
      if (art && artW > region.w - textW - 24) artW = region.w - textW - 24;
      const artH = art ? Math.min(region.h, artW / aspect) : 0;
      const totalW = (art ? artW + 24 : 0) + textW;
      const x0 = region.x + Math.max(0, (region.w - totalW) / 2);
      if (art) drawArt(ctx, art, { x: x0, y: region.y + (region.h - artH) / 2, w: artW, h: artH }, info);
      words(ctx, { x: x0 + (art ? artW + 24 : 0), y: region.y, w: textW, h: region.h }, cue, script, status, info, true);
      return;
    }
    // Stacked (a phone held upright): the art on top, the words under it
    const sAspect = art.stackAspect || aspect;
    ctx.font = font(13, 600);
    const cueLines = cue ? Math.min(4, lineCount(ctx, cue, region.w)) : 0;
    const textH = cueLines * 17 + (script ? 26 : 0) + (status && status.text ? 18 : 0) + (info.illustrated ? 16 : 0);
    const artH = Math.max(0, Math.min(region.h - textH - 12, region.w / sAspect));
    const aW = Math.min(region.w, artH * sAspect);
    const used = (artH >= 40 ? artH + 12 : 0) + textH;
    const y0 = region.y + Math.max(0, (region.h - used) / 2);
    if (artH >= 40) drawArt(ctx, art, { x: region.x + (region.w - aW) / 2, y: y0, w: aW, h: artH }, info);
    words(ctx, { x: region.x, y: y0 + (artH >= 40 ? artH + 12 : 0), w: region.w, h: region.h - (y0 - region.y) - (artH >= 40 ? artH + 12 : 0) }, cue, script, status, info, false);
  }

  function words(ctx, box, cue, script, status, info, center) {
    const big = box.w >= 260 && box.h >= 90;
    const lh = big ? 19 : 17;
    const ill = info.illustrated && box.h >= 60 ? L("Dibujo guía, no una medida", "A guide drawing, not a measurement") : "";
    const extra = (script ? 26 : 0) + (status && status.text ? 18 : 0) + (ill ? 16 : 0);
    ctx.font = font(big ? 14 : 13, 600);
    const maxLines = Math.max(1, Math.min(4, Math.floor((box.h - extra) / lh)));
    const cueLines = cue ? Math.min(maxLines, lineCount(ctx, cue, box.w)) : 0;
    const used = extra + cueLines * lh;
    let y = center ? box.y + Math.max(0, (box.h - used) / 2) : box.y;
    if (script) {
      scriptLine(ctx, script.text, box.x, y + 10, box.w, big ? 18 : 15, script.hot);
      y += 26;
    }
    if (cue && cueLines) {
      ctx.font = font(big ? 14 : 13, 600);
      ctx.fillStyle = C.text;
      ctx.globalAlpha = 0.86;
      ctx.textAlign = "left";
      y += wrap(ctx, cue, box.x, y, box.w, lh, cueLines);
      ctx.globalAlpha = 1;
    }
    if (status && status.text) {
      ctx.fillStyle = status.color || C.muted;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      fitLine(ctx, status.text, box.x, y + 4, box.w, 12, 800, 10);
      y += 18;
    }
    if (ill) {
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      fitLine(ctx, ill, box.x, y + 4, box.w, 10, 700, 9);
    }
  }

  /* —— After Stop: the take in chapters —— */

  /**
   * Each chapter of the take as a row — its name, its length, and your
   * speech and silence in it — with the one you picked outlined and a
   * playhead while it plays. The rows are tap targets on the canvas too.
   */
  function chapterReview(ctx, w, h, m) {
    const tiny = h < 135;
    const narrow = !tiny && w < 440;
    const pad = tiny ? 8 : 10;
    const P = m.player;
    const chs = m.chapters || [];
    const sel = P ? P.sel : 0;
    const title = m.reviewTitle();
    const status = !chs.length
      ? L("sin tramos que escuchar", "nothing to play yet")
      : m.noTake
        ? L("sin grabación", "no recording")
        : !P || !P.ready
          ? L("preparando…", "getting it ready…")
          : P.playing
            ? "▶ " + mmss(Math.max(0, P.pos - (chs[sel]?.r0 || 0)))
            : L("elige un tramo y ▶", "pick a part and ▶");
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let y;
    if (narrow) {
      // A phone held upright: the title, then the player's state under it
      ctx.fillStyle = C.text;
      fitLine(ctx, title, pad + 2, pad + 11, w - pad * 2, 17, 800, 12);
      ctx.fillStyle = P && P.playing ? C.done : C.muted;
      fitLine(ctx, status, pad + 2, pad + 32, w - pad * 2, 13, 800, 10);
      y = pad + 46;
    } else {
      ctx.font = font(tiny ? 12 : 13, 800);
      const stW = ctx.measureText(status).width;
      ctx.fillStyle = C.text;
      fitLine(ctx, title, pad + 2, pad + 10, w - pad * 2 - stW - 16, tiny ? 14 : 17, 800, 11);
      ctx.font = font(tiny ? 12 : 13, 800);
      ctx.fillStyle = P && P.playing ? C.done : C.muted;
      ctx.textAlign = "right";
      ctx.fillText(status, w - pad - 2, pad + 10);
      y = pad + (tiny ? 22 : 28);
    }
    const extraH = !tiny && m.reviewExtra ? m.reviewExtraH(w, h) : 0;
    if (extraH > 0) {
      m.reviewExtra(ctx, { x: pad, y, w: w - pad * 2, h: extraH });
      y += extraH + 8;
    }
    const note = m.reviewNote();
    ctx.font = font(11, 600);
    const noteLines = !tiny && note && h - y > 120 ? (narrow ? Math.min(3, lineCount(ctx, note, w - pad * 2 - 4)) : 1) : 0;
    const noteH = noteLines ? noteLines * 15 + 4 : 0;
    const bottom = h - pad - noteH;
    m._hits = [];
    if (!chs.length) {
      ctx.font = font(13, 600);
      ctx.fillStyle = C.muted;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      wrap(ctx, L("No hubo tiempo de práctica que escuchar.", "There was no practice time to play back."), pad + 2, y, w - pad * 2, 17, 2);
    } else {
      const avail = bottom - y;
      const minRow = tiny ? avail : narrow ? 46 : 26;
      const fit = Math.max(1, Math.floor(avail / minRow));
      const n = Math.min(chs.length, fit);
      const first = clamp(sel - Math.floor(n / 2), 0, chs.length - n);
      const rowH = Math.min(tiny ? avail : narrow ? 64 : 50, avail / n);
      const labelW = narrow ? 0 : Math.min(tiny ? 130 : 190, w * (tiny ? 0.3 : 0.34));
      for (let k = 0; k < n; k++) {
        const i = first + k;
        const ch = chs[i];
        const ry = y + k * rowH;
        const isSel = i === sel;
        if (isSel) {
          ctx.fillStyle = "rgba(170, 195, 230, 0.07)";
          roundRect(ctx, pad - 2, ry + 1, w - pad * 2 + 4, rowH - 2, 7);
          ctx.fill();
          ctx.strokeStyle = C.text;
          ctx.lineWidth = 1.5;
          roundRect(ctx, pad - 2 + 0.5, ry + 1.5, w - pad * 2 + 3, rowH - 3, 7);
          ctx.stroke();
        }
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        const idxText = chs.length > 1 ? `${i + 1}/${chs.length} · ` : "";
        const sub = ch.sub || fmtSec(ch.t1 - ch.t0);
        let sx;
        let sw;
        let sy;
        let sh;
        if (narrow) {
          // Name and length on one line, the speech strip under them
          ctx.font = font(10, 600);
          const subW = Math.min(w * 0.45, ctx.measureText(sub).width);
          ctx.fillStyle = isSel ? C.text : C.muted;
          fitLine(ctx, ch.label, pad + 6, ry + 13, w - pad * 2 - subW - 22, 13, 800, 10);
          ctx.font = font(10, 600);
          ctx.fillStyle = C.faint;
          ctx.textAlign = "right";
          ctx.fillText(sub, w - pad - 6, ry + 13, subW);
          sx = pad + 6;
          sw = w - pad * 2 - 12;
          sy = ry + 23;
          sh = Math.max(10, Math.min(24, rowH - 30));
        } else {
          ctx.fillStyle = isSel ? C.text : C.muted;
          const twoLines = rowH >= 34;
          fitLine(ctx, (tiny ? idxText : "") + ch.label, pad + 6, ry + (twoLines ? rowH * 0.36 : rowH / 2), labelW - 12, 12, 800, 9);
          if (twoLines) {
            ctx.font = font(10, 600);
            ctx.fillStyle = C.faint;
            ctx.fillText(sub, pad + 6, ry + rowH * 0.7, labelW - 12);
          }
          sx = pad + labelW;
          sw = w - pad - 6 - sx;
          sh = Math.min(26, rowH - 10);
          sy = ry + (rowH - sh) / 2;
        }
        if (m.vad && ch.t1 > ch.t0) {
          speechStrip(ctx, { x: sx, y: sy, w: sw, h: sh }, m.vad, { range: [ch.t0, ch.t1], minLabel: 2 });
        } else {
          ctx.fillStyle = "rgba(170, 195, 230, 0.06)";
          roundRect(ctx, sx, sy, sw, sh, 6);
          ctx.fill();
        }
        if (P && P.playing && isSel && ch.segs == null) {
          const dur = Math.max(0.1, ch.r1 - ch.r0);
          const px = sx + clamp((P.pos - ch.r0) / dur, 0, 1) * sw;
          ctx.strokeStyle = C.done;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(px, sy - 3);
          ctx.lineTo(px, sy + sh + 3);
          ctx.stroke();
          glyph(ctx, "tri", px, sy - 4, C.done, 4);
        } else if (P && P.playing && isSel) {
          glyph(ctx, "dot", sx + sw - 6, sy - 3, C.done, 7);
        }
        m._hits.push({ y0: ry, y1: ry + rowH, i });
      }
      if (n < chs.length && !tiny) {
        ctx.font = font(10, 700);
        ctx.fillStyle = C.faint;
        ctx.textAlign = "right";
        ctx.textBaseline = "bottom";
        const more = chs.length - n;
        ctx.fillText(more === 1 ? L("1 tramo más: ‹ ›", "1 more part: ‹ ›") : L(`${more} tramos más: ‹ ›`, `${more} more parts: ‹ ›`), w - pad, y - 1);
      }
    }
    if (noteLines) {
      ctx.font = font(11, 600);
      ctx.fillStyle = C.muted;
      ctx.textAlign = "left";
      if (noteLines > 1) wrap(ctx, note, pad + 2, h - pad - noteLines * 15, w - pad * 2 - 4, 15, noteLines);
      else {
        ctx.textBaseline = "bottom";
        fitLine(ctx, note, pad + 2, h - pad + 1, w - pad * 2, 11, 600, 9);
      }
    }
  }

  /* —— Panel scaffolding shared by the controllers —— */

  const PLAY = "▶︎";
  const PAUSE = "❚❚";

  function panelHtml(cfg) {
    const live = (cfg.buttons || [])
      .map((b) => `<button type="button" class="btn btn-ghost viz-tap" ${b.attr}>${esc(b.label)}</button>`)
      .join("");
    const play = cfg.recorded
      ? `<div class="gd-ctl gd-play" hidden>
          <button type="button" class="btn btn-ghost viz-tap" data-ch-prev aria-label="${esc(L("Tramo anterior", "Previous part"))}">‹</button>
          <button type="button" class="btn btn-ghost viz-tap gd-main" data-ch-play aria-label="${esc(L("Escuchar", "Play"))}" disabled>${PLAY}</button>
          <button type="button" class="btn btn-ghost viz-tap" data-ch-next aria-label="${esc(L("Tramo siguiente", "Next part"))}">›</button>
          <button type="button" class="btn btn-ghost viz-tap" data-save-take disabled>${esc(L("Guardar", "Save"))}</button>
        </div>`
      : "";
    return `
      <div class="viz-row viz-head">
        <div class="mode-title">${esc(cfg.title)}</div>
        ${live ? `<div class="gd-ctl gd-live">${live}</div>` : ""}
        ${play}
      </div>
      <div class="viz-words">${cfg.words || ""}</div>
      ${cfg.meta ? `<p class="mode-meta muted">${esc(cfg.meta)}</p>` : ""}
    `;
  }

  /**
   * What every controller shares: the panel, the canvas and — for a recorded
   * drill — the listen-back controls that take over the head after Stop.
   */
  class Panel {
    constructor(mode, cfg, paint) {
      this.mode = mode;
      this.cfg = cfg;
      this.review = false;
      this.chapters = [];
      this.noTake = false;
      this.recorded = false;
      this.prevUrl = null;
      this.live = false;
      const hud = mode.hud;
      hud.classList.add("has-viz", "gd", "gd-" + (cfg.kind || "drill"));
      hud.innerHTML = panelHtml(cfg);
      this.surface = new V.Surface(hud, paint, { label: cfg.label || cfg.title, captionHidden: true });
      this.player = cfg.recorded ? new ChapterPlayer(() => this._playerChanged()) : null;
      const q = (s) => hud.querySelector(s);
      this.el = {
        prev: q("[data-ch-prev]"),
        play: q("[data-ch-play]"),
        next: q("[data-ch-next]"),
        save: q("[data-save-take]"),
        live: q(".gd-live"),
        playBox: q(".gd-play")
      };
      this.el.prev?.addEventListener("click", () => this.player?.select(this.player.sel - 1));
      this.el.next?.addEventListener("click", () => this.player?.select(this.player.sel + 1));
      this.el.play?.addEventListener("click", () => this.player?.toggle());
      this.el.save?.addEventListener("click", () => this._save());
      this.surface.canvas.addEventListener("click", (e) => this._tap(e));
    }
    draw() {
      this.surface.draw();
    }
    caption(text, ms) {
      this.surface.caption(text, ms);
    }
    destroy() {
      if (this.player) this.player.destroy();
      this.surface.destroy();
    }
    /** Remember the take already on the engine, so an old one is never replayed. */
    begin() {
      this.prevUrl = [currentTakeUrl(), document.querySelector("#playback-area audio")?.src].filter(Boolean);
      this.recorded = false;
      this.review = false;
      this.noTake = false;
      this.chapters = [];
      this.live = true;
      if (this.player) this.player.detach();
      this.mode.hud?.classList.remove("is-replay", "gd-review");
      if (this.el.playBox) this.el.playBox.hidden = true;
      if (this.el.live) this.el.live.hidden = false;
      if (this.el.save) {
        this.el.save.disabled = true;
        this.el.save.textContent = L("Guardar", "Save");
      }
    }
    /** After Stop: the head swaps to the listen-back controls. */
    openReview(chapters) {
      this.live = false;
      this.review = true;
      this.chapters = chapters || [];
      this.mode.hud?.classList.add("is-replay", "gd-review");
      if (!this.player) return;
      this.player.setChapters(this.chapters.map((c) => ({ start: c.r0, end: c.r1, segs: c.segs })));
      this.player.sel = 0;
      if (this.el.live) this.el.live.hidden = true;
      if (this.el.playBox) this.el.playBox.hidden = false;
      this._attach(30);
      this._playerChanged();
    }
    _attach(tries) {
      if (!this.player || !this.review) return;
      const url = this.recorded ? findTake(this.prevUrl) : null;
      if (url) {
        this.player.attach(url);
        if (this.el.save) this.el.save.disabled = !document.getElementById("btn-save-rec");
        this._playerChanged();
        return;
      }
      if (tries > 0 && this.recorded) {
        setTimeout(() => this._attach(tries - 1), 100);
        return;
      }
      this.noTake = true;
      this._playerChanged();
    }
    _playerChanged() {
      const P = this.player;
      if (P && this.el.play) {
        const label = P.playing ? PAUSE : PLAY;
        if (this.el.play.textContent !== label) this.el.play.textContent = label;
        this.el.play.setAttribute("aria-label", P.playing ? L("Pausa", "Pause") : L("Escuchar", "Play"));
        this.el.play.disabled = !P.ready || !this.chapters.length;
        if (this.el.prev) this.el.prev.disabled = !this.chapters.length || P.sel <= 0;
        if (this.el.next) this.el.next.disabled = !this.chapters.length || P.sel >= this.chapters.length - 1;
      }
      this.draw();
    }
    _save() {
      const b = document.getElementById("btn-save-rec");
      if (!b || !this.el.save) return;
      b.click();
      this.el.save.disabled = true;
      this.el.save.textContent = L("Guardada ✓", "Saved ✓");
    }
    _tap(e) {
      if (!this.review || !this.player || !this._hits) return;
      const r = this.surface.canvas.getBoundingClientRect();
      const y = e.clientY - r.top;
      const hit = this._hits.find((q) => y >= q.y0 && y < q.y1);
      if (!hit) return;
      if (hit.i === this.player.sel && this.player.ready) this.player.toggle();
      else if (this.player.ready) this.player.play(hit.i);
      else this.player.select(hit.i);
    }
  }

  /**
   * A timed guided drill. cfg (all optional unless noted):
   *   phases (localized, required), title, meta, label, words (extra sr html),
   *   mic (feed a Vad), strip (show the voice strip), recorded (listen-back),
   *   skip (a "Next step" button), chime (a soft tone at each step, only
   *   where the mic is closed), preCue (seconds), artFor(phase, info) →
   *   { draw, aspect, measured }, cueFor, scriptFor, status(info),
   *   onFrame(frame, drill), onStep(index, drill), chapters(drill),
   *   doneText, doneSub, doneCue, reviewTitle, reviewNote,
   *   reviewExtra(ctx, box, drill), reviewExtraH(w, h, drill).
   */
  class Drill extends Panel {
    constructor(mode, cfg) {
      const buttons = (cfg.buttons || []).slice();
      if (cfg.skip) buttons.push({ attr: "data-next-step", label: L("Siguiente →", "Next →") });
      const words = `<span data-phase></span> <strong class="mode-big" data-remain></strong> <span data-next></span> <span data-cue></span>${cfg.words || ""}`;
      super(mode, Object.assign({}, cfg, { buttons, words }), (ctx, w, h) => guided(ctx, w, h, this));
      this.run = new Run(cfg.phases || []);
      this.vad = cfg.mic && global.VTFeatures ? new global.VTFeatures.Vad({}) : null;
      this.preCue = cfg.preCue || 4;
      this.mode.hud.querySelector("[data-next-step]")?.addEventListener("click", () => this.skip());
      this._words(true);
      this.draw();
    }
    artFor(phase, info) {
      return this.cfg.artFor ? this.cfg.artFor(phase, info, this) : null;
    }
    cueFor(phase, info) {
      return this.cfg.cueFor ? this.cfg.cueFor(phase, info, this) : loc(phase, "cue");
    }
    scriptFor(phase, info) {
      return this.cfg.scriptFor ? this.cfg.scriptFor(phase, info, this) : null;
    }
    status(info) {
      return this.cfg.status ? this.cfg.status(info, this) : null;
    }
    strip() {
      return this.cfg.strip && this.vad && this.live ? { vad: this.vad, label: this.cfg.stripLabel } : null;
    }
    doneText() {
      return this.cfg.doneText || L("Listo", "Done");
    }
    doneSub() {
      return this.cfg.doneSub || (this.cfg.recorded ? L("Pulsa Detener para escuchar tu toma", "Press Stop to hear your take") : "");
    }
    doneCue() {
      return this.cfg.doneCue || "";
    }
    reviewTitle() {
      return this.cfg.reviewTitle || L("Escucha tu toma", "Listen to your take");
    }
    reviewNote() {
      return this.cfg.reviewNote || "";
    }
    reviewExtraH(w, h) {
      return this.cfg.reviewExtraH ? this.cfg.reviewExtraH(w, h, this) : 0;
    }
    reviewExtra(ctx, box) {
      if (this.cfg.reviewExtra) this.cfg.reviewExtra(ctx, box, this);
    }
    paintReview(ctx, w, h) {
      chapterReview(ctx, w, h, this);
    }
    start() {
      this.begin();
      this.run.reset();
      this.vad?.reset();
      if (this.cfg.onStart) this.cfg.onStart(this);
      this._words(true);
      this.caption(this.run.cur?.label || "", 0);
      this.draw();
    }
    frame(frame) {
      if (this.review) return;
      this.live = true;
      if (frame && frame.recording) this.recorded = true;
      if (this.vad && frame && frame.rms != null) this.vad.feed(frame);
      const changed = this.run.tick(frame);
      if (this.cfg.onFrame) this.cfg.onFrame(frame, this);
      if (changed) this._stepChanged();
      this._words(changed);
      this.draw();
    }
    skip() {
      if (!this.live || this.review || !this.run.skip()) return;
      this._stepChanged();
      this._words(true);
      this.draw();
    }
    _stepChanged() {
      const r = this.run;
      this.caption(r.done ? this.doneText() : r.cur.label, 0);
      if (this.cfg.chime) V.chime(r.done ? "done" : "phase");
      if (this.cfg.onStep) this.cfg.onStep(r.index, this);
      const b = this.mode.hud?.querySelector("[data-next-step]");
      if (b) b.disabled = r.done;
    }
    /** The words the picture draws, kept in the page for screen readers and tests. */
    _words(full) {
      const hud = this.mode.hud;
      if (!hud) return;
      const r = this.run;
      setText(hud.querySelector("[data-remain]"), r.done ? "✓" : `${Math.ceil(r.remaining)}s`);
      if (!full) return;
      setText(hud.querySelector("[data-phase]"), r.done ? this.doneText() : r.cur?.label || "");
      setText(hud.querySelector("[data-next]"), r.next ? L("Luego: ", "Next: ") + r.next.label : "");
      setText(hud.querySelector("[data-cue]"), r.done ? this.doneCue() : this.cueFor(r.cur, {}) || "");
    }
    /** Chapters: each step that ran, found again in the recording. */
    stepChapters(filter) {
      const out = [];
      const stopAt = { t: this.run.clock, rec: this.run.rec };
      this.run.phases.forEach((p, i) => {
        if (filter && !filter(p, i)) return;
        const s = this.run.span(i, stopAt);
        if (!s || s.t1 - s.t0 < 1.5) return;
        out.push({ label: p.label, sub: this.chapterSub(s), t0: s.t0, t1: s.t1, r0: s.r0, r1: s.r1 });
      });
      return out;
    }
    chapterSub(s) {
      const len = s.t1 - s.t0;
      const dur = len < 60 ? fmtSec(len, len < 10 ? 1 : 0) : mmss(len);
      if (!this.vad) return dur;
      let talk = 0;
      this.vad.segments.forEach((g) => {
        if (g.kind !== "speech") return;
        const a = Math.max(s.t0, g.start);
        const b = Math.min(s.t1, g.end != null ? g.end : this.vad.t);
        if (b > a) talk += b - a;
      });
      return `${dur} · ${L("voz", "voice")} ${Math.round((talk / Math.max(0.1, len)) * 100)}%`;
    }
    stop() {
      this.live = false;
      if (this.cfg.recorded) {
        const chs = this.cfg.chapters ? this.cfg.chapters(this) : this.stepChapters();
        if (!chs.length && this.run.clock >= 1) {
          const s = { t0: 0, t1: this.run.clock, r0: Math.max(0, this.run.rec - this.run.clock), r1: this.run.rec };
          chs.push(Object.assign({ label: L("Toda la toma", "The whole take"), sub: this.chapterSub(s) }, s));
        }
        this.openReview(chs);
      } else {
        this.mode.hud?.classList.add("is-replay");
      }
      this.draw();
    }
  }

  /* —— v7: the take ribbon —— */

  /**
   * A long improvised take as it grows, 0 to 10:00, read like lines of text:
   * one row per stretch of time (a minute a row on a tall phone, two on a
   * desktop, one strip on a rotated phone). Each second is a bar as loud as
   * you were (dB over the room), silence is a gap, pauses of 2 s or more get
   * a tick, and the 5:00 minimum is marked. Nothing judges mid-take.
   */
  function ribbonLayout(box, m) {
    const maxSec = Math.max(m.maxSec, Math.ceil(m.t / 60) * 60);
    const minutes = Math.round(maxSec / 60);
    const options = [minutes, minutes / 2, minutes / 5, 2, 1].filter((r) => r >= 1 && Number.isInteger(r));
    let rows = 1;
    for (const r of options) {
      if (box.h / r >= 34) {
        rows = r;
        break;
      }
    }
    const labelW = rows > 1 ? 34 : 0;
    const gap = rows > 1 ? Math.min(8, (box.h / rows) * 0.2) : 0;
    const rowH = (box.h - gap * (rows - 1)) / rows;
    const secPerRow = maxSec / rows;
    const x0 = box.x + labelW;
    const rw = box.w - labelW;
    return {
      maxSec,
      rows,
      rowH,
      gap,
      secPerRow,
      labelW,
      x0,
      rw,
      box,
      /** Row and x of a time; a row boundary belongs to the end of the row before */
      at(s, endSide) {
        let r = Math.floor(s / secPerRow);
        let u = s - r * secPerRow;
        if (endSide && r > 0 && u < 1e-6) {
          r -= 1;
          u = secPerRow;
        }
        if (r > rows - 1) {
          r = rows - 1;
          u = secPerRow;
        }
        r = Math.max(0, r);
        return { r, x: x0 + (u / secPerRow) * rw, y: box.y + r * (rowH + gap) };
      },
      /** The time under a point, or null */
      timeAt(px, py) {
        const r = Math.floor((py - box.y) / (rowH + gap));
        if (r < 0 || r >= rows) return null;
        return r * secPerRow + clamp((px - x0) / rw, 0, 1) * secPerRow;
      }
    };
  }

  function takeRibbon(ctx, box, m, opts = {}) {
    const R = ribbonLayout(box, m);
    m._ribbon = R;
    const { rows, rowH, gap, secPerRow, x0, rw } = R;
    const rowY = (r) => box.y + r * (rowH + gap);
    for (let r = 0; r < rows; r++) {
      const ry = rowY(r);
      ctx.fillStyle = "rgba(170, 195, 230, 0.05)";
      roundRect(ctx, x0, ry, rw, rowH, 5);
      ctx.fill();
      if (rows > 1) {
        ctx.font = font(10, 700, true);
        ctx.fillStyle = C.faint;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(mmss(r * secPerRow), x0 - 5, ry + rowH / 2);
      }
      // Minute grid inside the row
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 1;
      for (let s = 60; s < secPerRow; s += 60) {
        const gx = x0 + (s / secPerRow) * rw;
        ctx.beginPath();
        ctx.moveTo(gx, ry);
        ctx.lineTo(gx, ry + rowH);
        ctx.stroke();
      }
    }
    if (rows === 1 && opts.minuteLabels) {
      ctx.font = font(9, 700);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      const every = rw / (R.maxSec / 60) < 26 ? 2 : 1;
      // Few marks: "1:00"; many: bare minutes, the last one with its unit
      const roomy = rw / Math.max(1, R.maxSec / 60 / every) >= 40;
      for (let s = 0; s <= R.maxSec; s += 60 * every) {
        const txt = roomy ? mmss(s) : s === R.maxSec ? `${s / 60} min` : String(s / 60);
        ctx.textAlign = s === 0 ? "left" : s === R.maxSec ? "right" : "center";
        ctx.fillText(txt, x0 + (s / R.maxSec) * rw, box.y + rowH + 2);
      }
    }
    // The part picked for listening (review), row by row
    if (opts.sel != null && m.chapters && m.chapters[opts.sel]) {
      const ch = m.chapters[opts.sel];
      for (let r = Math.floor(ch.t0 / secPerRow); r < rows && r * secPerRow < ch.t1; r++) {
        const a = Math.max(ch.t0, r * secPerRow);
        const b = Math.min(ch.t1, (r + 1) * secPerRow);
        if (b <= a) continue;
        const sx = x0 + ((a - r * secPerRow) / secPerRow) * rw;
        const sw = Math.max(2, ((b - a) / secPerRow) * rw);
        ctx.fillStyle = "rgba(238, 243, 250, 0.08)";
        ctx.fillRect(sx, rowY(r), sw, rowH);
        ctx.strokeStyle = C.text;
        ctx.lineWidth = 1.2;
        ctx.strokeRect(sx + 0.5, rowY(r) + 0.5, sw - 1, rowH - 1);
      }
    }
    // Loudness per second, mirrored like a voice memo
    const pxPerSec = rw / secPerRow;
    ctx.fillStyle = C.you;
    ctx.globalAlpha = 0.85;
    for (let r = 0; r < rows; r++) {
      const mid = rowY(r) + rowH / 2;
      const s0 = r * secPerRow;
      if (pxPerSec >= 1) {
        for (let s = Math.floor(s0); s < s0 + secPerRow && s < m.bins.length; s++) {
          const v = m.bins[s];
          if (v < 0) continue;
          const bh = Math.max(1.5, clamp(v / 36, 0.06, 1) * (rowH / 2 - 2));
          ctx.fillRect(x0 + (s - s0) * pxPerSec, mid - bh, Math.max(1, pxPerSec - (pxPerSec > 3 ? 1 : 0)), bh * 2);
        }
      } else {
        const cols = Math.max(1, Math.floor(rw));
        const secPerCol = secPerRow / cols;
        for (let c = 0; c < cols; c++) {
          const a = Math.floor(s0 + c * secPerCol);
          const b = Math.max(a + 1, Math.floor(s0 + (c + 1) * secPerCol));
          let v = -1;
          for (let s = a; s < b && s < m.bins.length; s++) if (m.bins[s] > v) v = m.bins[s];
          if (v < 0) continue;
          const bh = Math.max(1.5, clamp(v / 36, 0.06, 1) * (rowH / 2 - 2));
          ctx.fillRect(x0 + c, mid - bh, 1, bh * 2);
        }
      }
    }
    ctx.globalAlpha = 1;
    // Pauses of 2 s or more
    (m.pauses || []).forEach((p) => {
      const q = R.at(p.start + p.len / 2);
      glyph(ctx, "notch", q.x, q.y + 5, C.muted, 3);
      if (opts.pauseLabels && p.len * pxPerSec > 30) {
        ctx.font = font(9, 700);
        ctx.fillStyle = C.muted;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(fmtNum(p.len, 1), q.x, q.y + rowH - 2);
      }
    });
    // The minimum and the end
    [
      [m.minSec, L("mínimo", "minimum")],
      [m.maxSec, L("fin", "end")]
    ].forEach(([s, word]) => {
      if (!s || s > R.maxSec) return;
      const q = R.at(s, true);
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = C.done;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(q.x, q.y - 2);
      ctx.lineTo(q.x, q.y + rowH + 2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!opts.markLabels) return;
      const txt = `${mmss(s)} ${word}`;
      ctx.font = font(10, 800);
      if (rows > 1) {
        // Beside the line, inside its row, so it never runs into the next row
        const tw = ctx.measureText(txt).width;
        ctx.fillStyle = "rgba(9, 13, 20, 0.85)";
        ctx.fillRect(q.x - tw - 9, q.y + rowH / 2 - 7, tw + 5, 14);
        ctx.fillStyle = C.done;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(txt, q.x - 5, q.y + rowH / 2);
      } else {
        ctx.fillStyle = C.done;
        ctx.textAlign = q.x >= x0 + rw - 2 ? "right" : "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(txt, q.x, q.y - 3);
      }
    });
    // Now / playhead
    const nowT = opts.playPos != null ? opts.playPos : m.t;
    const q = R.at(clamp(nowT, 0, R.maxSec), true);
    ctx.strokeStyle = opts.playPos != null ? C.done : "rgba(238, 243, 250, 0.7)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(q.x, q.y - 3);
    ctx.lineTo(q.x, q.y + rowH + 3);
    ctx.stroke();
    return R;
  }

  function take(ctx, w, h, m) {
    panel(ctx, w, h);
    const tiny = h < 135;
    const compact = !tiny && h < 190;
    const pad = tiny ? 8 : 10;
    const review = m.review;
    const P = m.player;
    // Head: REC and one clock
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    let hx = pad + 2;
    const hy = pad + (tiny ? 10 : 13);
    if (!review && m.live) {
      ctx.fillStyle = C.off;
      ctx.beginPath();
      ctx.arc(hx + 6, hy, 6, 0, TAU);
      ctx.fill();
      hx += 18;
    }
    ctx.fillStyle = C.text;
    const headWord = review
      ? L(`Toma de ${mmss(m.t)}`, `${mmss(m.t)} take`)
      : m.live
        ? !m.minSec
          ? L("Grabando", "Recording")
          : m.t < m.minSec
            ? L(`Grabando · el mínimo llega en ${mmss(m.minSec - m.t)}`, `Recording · minimum in ${mmss(m.minSec - m.t)}`)
            : L("Grabando · ya pasaste el mínimo ✓", "Recording · past the minimum ✓")
        : m.cfg.idle || L("Graba 5 a 10 minutos sobre un tema", "Record 5 to 10 minutes on one topic");
    const clockText = review ? (P && P.playing ? mmss(P.pos) : mmss(m.t)) : mmss(m.t);
    ctx.font = font(tiny ? 20 : compact ? 22 : 28, 800, true);
    const cw = ctx.measureText(clockText).width;
    ctx.fillStyle = review && P && P.playing ? C.done : C.text;
    ctx.textAlign = "right";
    ctx.fillText(clockText, w - pad - 2, hy + 1);
    ctx.textAlign = "left";
    ctx.fillStyle = C.text;
    fitLine(ctx, headWord, hx, hy, w - hx - pad - cw - 12, tiny ? 13 : compact ? 15 : 17, 800, 10);
    let top = hy + (tiny ? 12 : 18);
    // Topic, or the review line
    const sub = review ? m.reviewLine() : m.topic ? L("Tema: ", "Topic: ") + m.topic : "";
    if (sub && !tiny) {
      ctx.fillStyle = review ? C.done : C.muted;
      fitLine(ctx, sub, pad + 2, top + 8, w - pad * 2, compact ? 12 : 14, 700, 10);
      top += compact ? 18 : 24;
    } else if (sub && tiny && review) {
      ctx.fillStyle = C.done;
      fitLine(ctx, sub, pad + 2, top + 6, w - pad * 2, 11, 700, 9);
      top += 14;
    }
    const footH = tiny ? 0 : 16;
    const rTop = top + (tiny ? 4 : 8);
    const rH = Math.max(18, h - rTop - pad - footH - (tiny ? 0 : 4));
    const rBox = { x: pad + 2, y: rTop, w: w - pad * 2 - 4, h: rH };
    // One strip: room above for the marks' words and below for the minutes
    if (!tiny && ribbonLayout(rBox, m).rows === 1) {
      rBox.y += 12;
      rBox.h = Math.max(18, rBox.h - 26);
    }
    // Rows no taller than a voice memo's; the block sits in the middle
    const RL = ribbonLayout(rBox, m);
    const need = RL.rows * Math.min(RL.rowH, 120) + RL.gap * (RL.rows - 1);
    if (need < rBox.h - 1) {
      rBox.y += (rBox.h - need) / 2;
      rBox.h = need;
    }
    takeRibbon(ctx, rBox, m, {
      minuteLabels: !tiny,
      markLabels: !tiny,
      pauseLabels: !compact && !tiny,
      sel: review && P ? P.sel : null,
      playPos: review && P && P.playing ? P.pos - m.recOffset : null
    });
    if (!tiny) {
      ctx.font = font(10, 700);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      const foot = review
        ? w < 520
          ? L("‹ › elige el minuto · ▶ escucha", "‹ › pick the minute · ▶ play")
          : L("‹ › elige el minuto · ▶ escucha · Guardar la deja en tu historial", "‹ › pick the minute · ▶ play · Save keeps it in your history")
        : w < 520
          ? L("barra = tu voz · hueco = silencio · ⌄ pausa ≥ 2 s", "bar = your voice · gap = silence · ⌄ pause ≥ 2 s")
          : L("barra = tu voz (dB sobre la sala) · hueco = silencio · ⌄ pausa de 2 s o más · sin juicio a mitad de toma", "bar = your voice (dB over the room) · gap = silence · ⌄ pause of 2 s or more · no judging mid-take");
      fitLine(ctx, foot, pad + 2, h - pad + 2, w - pad * 2, 10, 700, 8);
    }
  }

  /**
   * v7 controller: a take clock, the ribbon, one topic card, and the take
   * cut into minutes to listen to after Stop.
   */
  class Take extends Panel {
    constructor(mode, cfg) {
      const buttons = cfg.topics && cfg.topics.length ? [{ attr: "data-topic", label: L("Otro tema", "Another topic") }] : [];
      const words = `<strong class="mode-big" data-t>0:00</strong> <span data-topic-text></span>`;
      super(mode, Object.assign({ kind: "take" }, cfg, { buttons, words, recorded: true }), (ctx, w, h) => take(ctx, w, h, this));
      this.minSec = cfg.minSec != null ? cfg.minSec : 300;
      this.maxSec = cfg.maxSec || 600;
      this.topics = cfg.topics || [];
      this.topicIndex = 0;
      this.topic = this.topics.length ? this.topics[0] : "";
      this.vad = global.VTFeatures ? new global.VTFeatures.Vad({}) : null;
      this.bins = [];
      this.pauses = [];
      this.t = 0;
      this.rec = 0;
      this.recOffset = 0;
      this.mode.hud.querySelector("[data-topic]")?.addEventListener("click", () => this.nextTopic());
      setText(this.mode.hud.querySelector("[data-topic-text]"), this.topic);
      this.draw();
    }
    nextTopic() {
      if (!this.topics.length) return;
      this.topicIndex = (this.topicIndex + 1) % this.topics.length;
      this.topic = this.topics[this.topicIndex];
      setText(this.mode.hud.querySelector("[data-topic-text]"), this.topic);
      this.caption(L("Tema: ", "Topic: ") + this.topic, 0);
      this.draw();
    }
    start() {
      this.begin();
      this.vad?.reset();
      this.bins = [];
      this.pauses = [];
      this.t = 0;
      this.rec = 0;
      this._minSaid = false;
      this.draw();
    }
    frame(frame) {
      if (this.review) return;
      this.live = true;
      if (frame && frame.recording) this.recorded = true;
      const dt = clamp(((frame && frame.dtMs) || 16) / 1000, 0, 0.1);
      this.t += dt;
      this.rec = frame && frame.elapsedMs != null ? frame.elapsedMs / 1000 : this.rec + dt;
      this.recOffset = this.rec - this.t;
      if (this.vad && frame) {
        const before = this.vad.segments.length;
        this.vad.feed(frame);
        const bin = Math.floor(this.t);
        while (this.bins.length <= bin) this.bins.push(-1);
        if (this.vad.state === "speech") {
          const lvl = this.vad.levelDb - this.vad.floorDb;
          if (lvl > this.bins[bin]) this.bins[bin] = Math.max(1, lvl);
        }
        if (this.vad.segments.length !== before) {
          this.pauses = this.vad.pauses(2);
        }
      }
      const clock = mmss(this.t);
      setText(this.mode.hud.querySelector("[data-t]"), clock);
      if (this.minSec && this.t >= this.minSec && !this._minSaid) {
        this._minSaid = true;
        this.caption(L("Ya pasaste los 5 minutos", "Five minutes reached"), 0);
      }
      this.draw();
    }
    reviewLine() {
      if (!this.cfg.delayReview) return this.cfg.reviewLine || L("Escúchala por minutos: ‹ › elige, ▶ escucha", "Play it back by the minute: ‹ › pick, ▶ play");
      const d = new Date(Date.now() + 86400000);
      let when = "";
      try {
        when = d.toLocaleString(isEs() ? "es-PE" : "en-GB", { weekday: "short", hour: "2-digit", minute: "2-digit" });
      } catch {
        when = "";
      }
      return L(`Revísala desde mañana${when ? ", " + when : ""}: Oído → Vista → Transcripción`, `Review it from tomorrow${when ? ", " + when : ""}: Ear → Eyes → Transcript`);
    }
    stop() {
      this.live = false;
      const chs = [];
      for (let s = 0; s < this.t - 0.5; s += 60) {
        const e = Math.min(this.t, s + 60);
        chs.push({ label: L(`Minuto ${s / 60 + 1}`, `Minute ${s / 60 + 1}`), t0: s, t1: e, r0: s + this.recOffset, r1: e + this.recOffset });
      }
      this.openReview(chs);
      this.draw();
    }
    _tap(e) {
      if (!this.review || !this.player || !this.chapters.length || !this._ribbon) return;
      const r = this.surface.canvas.getBoundingClientRect();
      const at = this._ribbon.timeAt(e.clientX - r.left, e.clientY - r.top);
      if (at == null) return;
      const i = this.chapters.findIndex((c) => at >= c.t0 && at < c.t1);
      if (i < 0) return;
      if (this.player.ready) this.player.play(i);
      else this.player.select(i);
    }
  }

  /* —— v9: the week and the twelve —— */

  function weekPaint(ctx, w, h, m) {
    panel(ctx, w, h);
    const d = m.model();
    const tiny = h < 135;
    const compact = !tiny && h < 190;
    const pad = tiny ? 8 : 10;
    // Head
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = C.text;
    const headY = pad + (tiny ? 9 : 13);
    const right = d.focusDays != null ? L(`${d.focusDays} de 7 días con tu foco`, `${d.focusDays} of 7 days on your focus`) : "";
    ctx.font = font(tiny ? 11 : 13, 800);
    // A narrow, tall panel: the week's name gets the whole line, the count goes under it
    const stack = !!right && !tiny && !compact && w < 480;
    const rw = right && !stack ? ctx.measureText(right).width : 0;
    ctx.fillStyle = C.text;
    fitLine(ctx, d.head, pad + 2, headY, w - pad * 2 - rw - (rw ? 14 : 4), tiny ? 14 : compact ? 16 : 19, 800, 11);
    if (right) {
      ctx.fillStyle = C.done;
      ctx.textAlign = stack ? "left" : "right";
      fitLine(ctx, right, stack ? pad + 2 : w - pad - 2, stack ? headY + 22 : headY, stack ? w - pad * 2 - 4 : rw + 2, tiny ? 11 : 13, 800, 10);
      ctx.textAlign = "left";
    }
    // The action line at the bottom
    const actH = tiny ? 0 : compact ? 18 : 24;
    if (actH) {
      ctx.textAlign = "left";
      ctx.fillStyle = C.text;
      fitLine(ctx, "→ " + d.action, pad + 2, h - pad - actH / 2 + 2, w - pad * 2, compact ? 13 : 15, 800, 10);
    }
    const top = headY + (tiny ? 12 : 20) + (stack ? 22 : 0);
    const bottom = h - pad - actH - (actH ? 6 : 0);
    const avail = bottom - top;
    // Days of this week, then the twelve weeks
    const daysH = tiny ? Math.min(40, avail * 0.55) : compact ? Math.min(46, avail * 0.45) : Math.min(76, avail * 0.42);
    const weeksH = avail - daysH - (tiny ? 4 : 12);
    days(ctx, { x: pad + 2, y: top, w: w - pad * 2 - 4, h: daysH }, d, tiny);
    weeks(ctx, { x: pad + 2, y: top + daysH + (tiny ? 4 : 12), w: w - pad * 2 - 4, h: weeksH }, d, tiny || compact);
  }

  function days(ctx, box, d, small) {
    const { x, y, w, h } = box;
    const n = 7;
    const labelH = h >= 44 ? 14 : 11;
    const r = Math.max(6, Math.min((w / n) * 0.3, (h - labelH * 2 - 8) / 2));
    const slot = w / n;
    d.days.forEach((day, i) => {
      const cx = x + slot * (i + 0.5);
      const cy = y + labelH + r + 1;
      ctx.lineWidth = 2;
      if (day.state === "focus") {
        ctx.fillStyle = C.done;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, TAU);
        ctx.fill();
        glyph(ctx, "check", cx, cy, "#1a1405", Math.max(3, r * 0.5));
      } else if (day.state === "other") {
        ctx.strokeStyle = C.you;
        ctx.lineWidth = Math.max(2, r * 0.25);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.85, 0, TAU);
        ctx.stroke();
      } else {
        ctx.strokeStyle = C.grid;
        ctx.lineWidth = 1.5;
        if (day.state === "future") ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(cx, cy, r * 0.85, 0, TAU);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (day.today) {
        ctx.strokeStyle = C.text;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, r + 4, 0, TAU);
        ctx.stroke();
      }
      ctx.font = font(labelH > 12 ? 11 : 9, day.today ? 900 : 700);
      ctx.fillStyle = day.today ? C.text : C.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(day.label, cx, y, slot - 2);
      ctx.textBaseline = "top";
      ctx.fillStyle = day.today ? C.text : C.faint;
      const under = day.today ? L("hoy", "today") : day.num;
      const uy = cy + r + (day.today ? 6 : 3);
      if (under && y + h - uy >= 9) ctx.fillText(under, cx, uy, slot - 2);
    });
  }

  function weeks(ctx, box, d, flat) {
    const { x, y, w, h } = box;
    if (h < 14) return;
    const n = 12;
    const gap = w < 400 ? 3 : 5;
    const tw = (w - gap * (n - 1)) / n;
    const minH = Math.min(h, flat ? h : Math.max(24, h * 0.5));
    const step = flat ? 0 : (h - minH) / (n - 1);
    for (let i = 0; i < n; i++) {
      const wk = d.weeks[i];
      const th = minH + step * i;
      const tx = x + i * (tw + gap);
      const ty = y + h - th;
      const done = wk.state === "done";
      const cur = wk.state === "current";
      ctx.fillStyle = done ? "rgba(255, 211, 110, 0.18)" : cur ? "rgba(52, 178, 122, 0.18)" : "rgba(170, 195, 230, 0.06)";
      roundRect(ctx, tx, ty, tw, th, 5);
      ctx.fill();
      ctx.strokeStyle = cur ? C.text : done ? "rgba(255, 211, 110, 0.6)" : C.grid;
      ctx.lineWidth = cur ? 2 : 1;
      roundRect(ctx, tx + 0.5, ty + 0.5, tw - 1, th - 1, 5);
      ctx.stroke();
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.font = font(th < 22 ? 9 : 11, 800);
      ctx.fillStyle = done ? C.done : cur ? C.text : C.muted;
      ctx.fillText(String(i + 1), tx + tw / 2, ty + (th < 22 ? 2 : 4), tw - 2);
      if (done && th >= 30) {
        glyph(ctx, wk.verdict === "improved" ? "up" : "notch", tx + tw / 2, ty + th * 0.55, C.done, Math.min(5, tw * 0.2));
      }
      if (th >= 52 && tw >= 30 && wk.label) {
        ctx.font = font(9, 700);
        ctx.fillStyle = done ? C.done : C.muted;
        ctx.textBaseline = "bottom";
        const words = wk.label.split(/\s+/);
        const lines = [];
        let line = "";
        words.forEach((wd) => {
          const test = line ? line + " " + wd : wd;
          if (ctx.measureText(test).width > tw - 4 && line) {
            lines.push(line);
            line = wd;
          } else line = test;
        });
        if (line) lines.push(line);
        lines.slice(0, 2).forEach((l, k) => ctx.fillText(l, tx + tw / 2, ty + th - 3 - (Math.min(2, lines.length) - 1 - k) * 10, tw - 3));
      }
    }
    if (!flat && h >= 60) {
      ctx.font = font(9, 700);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(L("↑ avanzó · ⌄ otra semana", "↑ improved · ⌄ another week"), x, y, w * 0.6);
    }
  }

  /** v9 controller: the plan as it stands, drawn when the page opens. */
  class Week extends Panel {
    constructor(mode, cfg) {
      super(mode, Object.assign({ kind: "week" }, cfg), (ctx, w, h) => weekPaint(ctx, w, h, this));
      this._model = null;
      this.draw();
    }
    model() {
      if (!this._model) this._model = this.cfg.model();
      return this._model;
    }
    refresh() {
      this._model = null;
      this.draw();
    }
  }

  V.scenes.guided = guided;
  V.scenes.guidedTake = take;
  V.scenes.guidedWeek = weekPaint;
  V.guided = {
    fitLine,
    Run,
    ChapterPlayer,
    Drill,
    Take,
    Week,
    EXPR,
    art: {
      jaw: artJaw,
      neck: artNeck,
      chew: artChew,
      yawns: artYawns,
      surprise: artSurprise,
      chapel: artChapel,
      gesture: artGesture,
      face: artFace,
      numbers: artNumbers,
      persona: artPersona,
      story: artStory,
      holds: artHolds,
      ab: artAB
    },
    gestureCycle,
    drawFace,
    loc,
    mmss,
    findTake
  };
})(typeof window !== "undefined" ? window : globalThis);
