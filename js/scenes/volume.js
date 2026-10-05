/**
 * Exercise pictures — volume: steady counting (v2), the volume ladder (v13)
 * and the energy triad (v20). Registers painters on window.VTViz.scenes and a
 * small measuring kit on window.VTVolumeKit for the three modes.
 *
 * What the research asks of a loudness picture (docs/39-EXERCISE-VISUALS.md):
 * - Loudness in dB, against the learner's own level. A phone at arm's length
 *   and one at the lips differ by 20 dB, so no number here is absolute and
 *   no target is a fixed RMS value.
 * - The level of each syllable, not of each frame: a frame's level falls to
 *   nothing between syllables, and open vowels are 2–3 dB louder than closed
 *   ones at the same effort, so every band is at least ±3 dB wide.
 * - When the browser evens out the volume (auto gain), the steps shrink: the
 *   picture says so instead of pretending to measure.
 * - Moving the phone closer raises the level as much as speaking louder; the
 *   copy says so.
 * - Nothing turns red; a fade or a flat step is described with a word and a
 *   shape (▽ ≈ ✓), never only a colour.
 */
(function (global) {
  "use strict";
  const V = global.VTViz;
  if (!V) return;
  const { C, L, font, clamp, panel, roundRect, glyph, fmtNum, chips } = V;
  // Text that fits whole or gives way (never squeezed): the helpers
  // speech-shape.js shares (it loads first); plain drawing if it is missing
  const TF = (V.scenes && V.scenes.textFit) || null;
  const widthAt = (ctx, text, px, weight = 700) => {
    ctx.font = font(px, weight);
    return ctx.measureText(text).width;
  };
  /**
   * Draw the first of `texts` that fits `maxW` whole at `px` (or smaller,
   * down to `min`). None fits: with `whole` nothing is drawn, else the last is
   * cut after a word. Returns the text drawn ("" for none).
   */
  function fitDraw(ctx, texts, x, y, maxW, px, weight = 800, min = 11, whole = false) {
    const list = [].concat(texts).filter((t) => t != null && t !== "");
    for (const t of list)
      for (let s = px; s >= Math.min(px, min); s--)
        if (widthAt(ctx, t, s, weight) <= maxW) {
          ctx.fillText(t, x, y);
          return t;
        }
    if (whole || !list.length) return "";
    ctx.font = font(Math.min(px, min), weight);
    const cut = TF ? TF.cutAtWord(ctx, list[list.length - 1], maxW) : list[list.length - 1];
    if (cut) ctx.fillText(cut, x, y);
    return cut;
  }
  /** Words wrapped onto at most `maxLines` lines (see speech-shape's wrapPlan). */
  function wrapPlan(ctx, text, maxW, px, weight, min, maxLines) {
    if (TF) return TF.wrapPlan(ctx, text, maxW, px, weight, min, maxLines);
    return { lines: [text], px, lh: Math.round(px * 1.28), weight, fits: widthAt(ctx, text, px, weight) <= maxW };
  }
  function drawLines(ctx, plan, x, yTop) {
    ctx.font = font(plan.px, plan.weight);
    ctx.textBaseline = "middle";
    plan.lines.forEach((l, i) => ctx.fillText(l, x, yTop + plan.lh * (i + 0.5)));
    return plan.lines.length * plan.lh;
  }
  /** The words before " · " or ":" (a headline's short form), or null. */
  function lead(text) {
    const s = String(text || "");
    const i = s.search(/:| · /);
    return i > 3 ? s.slice(0, i) : null;
  }
  /** Chips whose words fit whole (label, else short, else number; a sub that does not fit is left out). */
  function fitChips(ctx, box, items, opts = {}) {
    if (TF) return TF.fitChips(ctx, box, items, opts);
    return chips(ctx, box, items, opts);
  }

  /* —— Measuring kit —— */

  function dbfs(x) {
    return x > 1e-7 ? 20 * Math.log10(x) : -140;
  }
  function median(arr) {
    if (!arr || !arr.length) return null;
    const s = Array.from(arr).sort((a, b) => a - b);
    const k = s.length >> 1;
    return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
  }
  function percentile(arr, p) {
    if (!arr || !arr.length) return null;
    const s = Array.from(arr).sort((a, b) => a - b);
    const i = clamp((s.length - 1) * p, 0, s.length - 1);
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  }

  /**
   * Your level before the MIC slider's gain, frame by frame, and the peak of
   * each syllable (a rise and a fall of at least `dipDb` around it, at least
   * `minGap` seconds after the previous one, while sounding). The Space-key
   * assist fakes a level, so its frames are not measured.
   */
  class LevelKit {
    constructor(opts = {}) {
      this.fastMs = opts.fastMs || 35;
      this.dispMs = opts.dispMs || 110;
      this.dipDb = opts.dipDb || 3;
      this.minGap = opts.minGap || 0.12;
      this.reset();
    }
    reset() {
      this.t = 0;
      this.dt = 0;
      this.db = -140;
      this.fast = null;
      this.disp = null;
      this.sounding = false;
      this.processed = false;
      this.clip = 0;
      this._rising = true;
      this._cand = null;
      this._valley = -140;
      this._lastPeak = -1;
    }
    /** The microphone clipped on several recent frames (pre-gain samples at full scale). */
    get clipping() {
      return this.clip > 2.5;
    }
    /** Feed one engine frame; returns a new syllable peak { t, db } or null. */
    feed(frame) {
      const dt = clamp(((frame && frame.dtMs) || 16) / 1000, 0, 0.1);
      this.dt = dt;
      this.t += dt;
      if (frame.processedInput) this.processed = true;
      const gain = frame.inputGain || 1;
      const manual = !!frame.manualSound;
      this.sounding = !!frame.sounding && !manual;
      this.db = dbfs((frame.rms || 0) / gain);
      let clipped = false;
      const buf = frame.buf;
      if (buf && buf.length && !manual) {
        const lim = 0.985 * gain;
        for (let i = 0; i < buf.length; i += 2) {
          const x = buf[i];
          if (x > lim || x < -lim) {
            clipped = true;
            break;
          }
        }
      }
      this.clip = this.clip * Math.exp(-dt / 1.5) + (clipped ? 1 : 0);
      const aF = 1 - Math.exp(-(dt * 1000) / this.fastMs);
      const aD = 1 - Math.exp(-(dt * 1000) / this.dispMs);
      this.fast = this.fast == null ? this.db : this.fast + aF * (this.db - this.fast);
      if (this.sounding) this.disp = this.disp == null ? this.db : this.disp + aD * (this.db - this.disp);
      else this.disp = null;
      let peak = null;
      const s = this.fast;
      if (this._rising) {
        if (!this._cand || s > this._cand.db) this._cand = { db: s, t: this.t, ok: this.sounding };
        if (s < this._cand.db - this.dipDb) {
          const c = this._cand;
          if (c.ok && c.db - this._valley >= this.dipDb && c.t - this._lastPeak >= this.minGap) {
            peak = { t: c.t, db: c.db };
            this._lastPeak = c.t;
          }
          this._rising = false;
          this._valley = s;
        }
      } else {
        if (s < this._valley) this._valley = s;
        if (s > this._valley + this.dipDb) {
          this._rising = true;
          this._cand = { db: s, t: this.t, ok: this.sounding };
        }
      }
      return peak;
    }
  }

  /** A level as words: "+4 dB", "−5 dB", "0 dB" (decimal comma in Spanish). */
  function fmtDb(d, digits = 0) {
    if (d == null || !Number.isFinite(d)) return "—";
    const r = Number(d.toFixed(digits));
    if (r === 0) return "0 dB";
    return `${r > 0 ? "+" : "−"}${fmtNum(Math.abs(r), digits)} dB`;
  }
  function fmtClock(sec) {
    const s = Math.max(0, Math.ceil(sec));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }

  /**
   * The words under the picture after Stop: set now, and make any caption
   * still waiting its turn give way to them.
   */
  function finalCaption(viz, text) {
    if (!viz || !viz.caption) return;
    viz.caption(text, 0);
    if (viz.cap && viz.cap.dataset) viz.cap.dataset.pending = text;
  }
  /**
   * The browser's automatic gain or noise suppression evens out the very
   * level changes these exercises train. The picture says so; this says it
   * once in words too (screen readers, and anyone not reading the canvas).
   */
  function noteProcessed(st, viz) {
    if (!st || !st.processed || st.processedSaid) return;
    st.processedSaid = true;
    if (viz && viz.caption)
      viz.caption(
        L(
          "Tu navegador iguala el volumen del micrófono: los cambios de nivel se verán menores de lo que son.",
          "Your browser evens out the mic's volume: level changes will look smaller than they are."
        ),
        0
      );
  }
  global.VTVolumeKit = { LevelKit, fmtDb, fmtNum, median, percentile, dbfs, finalCaption, noteProcessed };

  /* —— Shared drawing —— */

  /** A small boxed notice with a hatched swatch: "estimated", never a verdict. */
  function notice(ctx, xRight, y, texts, color, maxW) {
    // The long words when they fit, else the short ones: whole, never squeezed
    const list = [].concat(texts);
    const text = list.find((t) => widthAt(ctx, t, 11, 700) <= maxW - 24) || list[list.length - 1];
    ctx.font = font(11, 700);
    const tw = ctx.measureText(text).width;
    const bw = tw + 24;
    const bh = 18;
    const x = xRight - bw;
    ctx.fillStyle = "rgba(6, 10, 16, 0.9)";
    roundRect(ctx, x, y, bw, bh, 5);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, y + 0.5, bw - 1, bh - 1, 5);
    ctx.stroke();
    ctx.fillStyle = V.hatch(ctx, color);
    ctx.fillRect(x + 5, y + 4, 10, 10);
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x + 19, y + bh / 2 + 0.5);
    return bh;
  }

  /** The two honest caveats a loudness picture can have. Returns the height used. */
  function cautions(ctx, xRight, y, m, maxW, short) {
    let used = 0;
    if (m.processed) {
      const s = L("volumen igualado por el navegador", "browser-levelled volume");
      used += notice(
        ctx,
        xRight,
        y,
        short ? [s, L("volumen igualado", "levelled volume")] : [L("Tu navegador iguala el volumen: las diferencias se ven menores", "Your browser evens out volume: differences look smaller"), s],
        C.muted,
        maxW
      );
      used += 3;
    }
    if (m.clipping) {
      const s = L("el micrófono satura", "mic clipping");
      used += notice(ctx, xRight, y + used, short ? [s] : [L("El micrófono satura: aléjate un poco", "The mic is clipping: move back a little"), s], C.warn, maxW);
      used += 3;
    }
    return used;
  }

  /**
   * The header line between `left` and `right`: the first of `texts` that
   * fits whole (down to `min` px). On a rotated phone the stage's live badge
   * sits over the panel's top-left corner, so the tiny layout sets its words
   * against the right instead.
   */
  function headLine(ctx, texts, left, right, y, px, color, alignRight, min) {
    const maxW = Math.max(40, right - left - 6);
    ctx.textBaseline = "middle";
    ctx.fillStyle = color || C.text;
    const lo = min || Math.min(px, alignRight ? 12 : 13);
    if (!alignRight) {
      ctx.textAlign = "left";
      return fitDraw(ctx, texts, left, y, maxW, px, 800, lo);
    }
    ctx.textAlign = "right";
    return fitDraw(ctx, texts, right - 6, y, Math.min(maxW, (right - left) * 0.72), px, 800, lo);
  }

  /** A line through [t, value] points; NaN breaks it. */
  function polyline(ctx, pts, xOf, yOf, color, width, alpha = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    let on = false;
    for (let i = 0; i < pts.length; i++) {
      const v = pts[i][1];
      if (v == null || Number.isNaN(v)) {
        on = false;
        continue;
      }
      const x = xOf(pts[i][0]);
      const y = yOf(v);
      if (on) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      on = true;
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  function dot(ctx, x, y, r, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  function youDot(ctx, x, y, r = 6) {
    ctx.fillStyle = "rgba(191, 230, 255, 0.16)";
    ctx.beginPath();
    ctx.arc(x, y, r * 2, 0, Math.PI * 2);
    ctx.fill();
    dot(ctx, x, y, r, C.you);
  }
  function ringDot(ctx, x, y, r, color) {
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  /**
   * A small label. `text` may be a list, longest first; with `maxW` the first
   * that fits whole is drawn (never squeezed), and with `whole` none at all
   * when none fits. Returns the width drawn (0 for nothing).
   */
  function small(ctx, text, x, y, color, opts = {}) {
    const px = opts.px || 11;
    const weight = opts.weight || 700;
    ctx.fillStyle = color || C.faint;
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "middle";
    if (opts.maxW == null) {
      const t = [].concat(text)[0];
      ctx.font = font(px, weight);
      ctx.fillText(t, x, y);
      return ctx.measureText(t).width;
    }
    const t = fitDraw(ctx, text, x, y, opts.maxW, px, weight, Math.min(px, opts.min || 11), opts.whole);
    return t ? ctx.measureText(t).width : 0;
  }

  /** A small label on a dark backing, so a line running under it stays out of the way. */
  function tag(ctx, text, x, y, color, opts = {}) {
    const px = opts.px || 11;
    const weight = opts.weight || 800;
    const list = [].concat(text);
    const t = opts.maxW == null ? list[0] : list.find((s) => widthAt(ctx, s, px, weight) <= opts.maxW);
    if (!t) return 0;
    ctx.font = font(px, weight);
    const tw = ctx.measureText(t).width;
    const align = opts.align || "left";
    const x0 = align === "right" ? x - tw : align === "center" ? x - tw / 2 : x;
    const hh = px + 4;
    ctx.fillStyle = "rgba(14, 21, 31, 0.86)";
    roundRect(ctx, x0 - 3, y - hh / 2, tw + 6, hh, 4);
    ctx.fill();
    small(ctx, t, x, y, color, { px, weight, align });
    return tw;
  }

  /* —— v2 · Steady volume: the count ribbon —— */

  const DB_TOP = 9;
  const DB_BOT = -15;

  /**
   * How a breath ended against how it started: medians of the syllable peaks
   * in its first and last 30 %. ±3 dB is even (vowels alone vary that much).
   */
  function breathVerdict(b) {
    const s = b && b.stats;
    if (!s || s.diff == null) return { kind: "short", word: L("corta", "short"), short: L("corta", "short"), color: C.muted, glyph: "dot" };
    if (s.diff <= -3)
      return { kind: "fade", word: L(`final ${fmtDb(s.diff)}`, `end ${fmtDb(s.diff)}`), short: fmtDb(s.diff), color: C.warn, glyph: "tri" };
    if (s.diff >= 3)
      return { kind: "rise", word: L(`final ${fmtDb(s.diff)}`, `end ${fmtDb(s.diff)}`), short: fmtDb(s.diff), color: C.muted, glyph: "up" };
    return { kind: "even", word: L("parejo", "even"), short: L("parejo", "even"), color: C.target, glyph: "check" };
  }

  function countHeadline(m, narrow) {
    const n = m.breaths.length;
    if (m.review) {
      if (!n) return { text: L("Sin respiraciones completas", "No full breaths yet"), color: C.muted };
      const med = median(m.breaths.filter((b) => b.stats && b.stats.diff != null).map((b) => b.stats.diff));
      const mid = L(`Final mediano ${fmtDb(med)} frente al inicio`, `Median end ${fmtDb(med)} vs the start`);
      return {
        texts: narrow
          ? [mid, L(`Final mediano ${fmtDb(med)}`, `Median end ${fmtDb(med)}`)]
          : [
              L(
                `${n} ${n === 1 ? "respiración" : "respiraciones"} · final mediano ${fmtDb(med)} frente al inicio`,
                `${n} ${n === 1 ? "breath" : "breaths"} · median end ${fmtDb(med)} against the start`
              ),
              mid,
              L(`Final mediano ${fmtDb(med)}`, `Median end ${fmtDb(med)}`)
            ],
        color: C.text
      };
    }
    const b = m.cur;
    if (b) {
      if (b.blind) return { text: L("A ciegas · escucha si el final sostiene", "Blind · listen for an even end"), color: C.text };
      if (b.ref == null) return { text: L("Cuenta… midiendo tu nivel", "Counting… reading your level"), color: C.text };
      return { text: L("Parejo hasta el 10", "Even all the way to 10"), color: C.text };
    }
    const last = m.breaths[n - 1];
    if (!last) return { text: L("Inhala y cuenta del 1 al 10", "Breathe in, count 1 to 10"), color: C.text };
    const v = breathVerdict(last);
    if (v.kind === "even") return { text: L("✓ Pareja · respira y otra vez", "✓ Even · breathe and go again"), color: C.target };
    if (v.kind === "fade")
      return { text: L(`Final ${fmtDb(last.stats.diff)} · empieza un poco más suave`, `End ${fmtDb(last.stats.diff)} · start a little softer`), color: C.text };
    return { text: L(`Final ${fmtDb(last.stats.diff)} · respira y otra vez`, `End ${fmtDb(last.stats.diff)} · breathe and go again`), color: C.text };
  }

  /**
   * model: {
   *   breaths: [{ start, len, ref, peaks: [{t, db}], trace: [[t, db]], stats, blind }]
   *   cur,       the breath in progress (same shape, no len yet) or null
   *   t,         clock (s); T, seconds the plot spans
   *   review, processed, clipping
   * }
   */
  function volumeCount(ctx, w, h, m) {
    panel(ctx, w, h);
    const pad = 10;
    const tiny = h < 135;
    const compact = h < 190;
    const headH = tiny ? 18 : compact ? 22 : 28;
    const cardsH = tiny ? 0 : compact ? 24 : 54;
    const ticksH = tiny ? 0 : 13;
    const gutter = tiny ? 24 : compact ? 30 : 38;
    // The band's name sits in a gutter right of the plot, never on its lines
    const bandWords = [L("tu nivel", "your level"), L("±3 dB", "±3 dB")];
    const rGutter = tiny ? 4 : Math.ceil(Math.max(...bandWords.map((s) => widthAt(ctx, s, 11, 800)))) + 10;
    const top = pad + headH + (tiny ? 3 : 8);
    const bottom = h - pad - (cardsH ? cardsH + (compact ? 6 : 10) : 0) - ticksH;
    const plot = { x: pad + gutter, y: top, w: w - pad * 2 - gutter - rGutter, h: Math.max(30, bottom - top) };
    plot.bandWords = tiny ? null : bandWords;

    // Header: what to do now, and the breaths so far
    const head = countHeadline(m, w < 460);
    const texts = head.texts || [head.text, lead(head.text)];
    const hy = pad + headH / 2;
    const n = m.breaths.length;
    ctx.font = font(tiny ? 16 : compact ? 18 : 24, 800, true);
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    ctx.fillStyle = C.text;
    ctx.fillText(String(n), w - pad - 2, hy + 1);
    let right = w - pad - 2 - ctx.measureText(String(n)).width - 8;
    const word = w >= 460 ? (n === 1 ? L("respiración", "breath") : L("respiraciones", "breaths")) : L("resp.", "breaths");
    // The count's word gives way when the whole instruction needs its room
    const pxMin = tiny ? 12 : 13;
    const wordW = widthAt(ctx, word, 11, 700) + 12;
    const needs = widthAt(ctx, texts[0], pxMin, 800) + 8;
    if (needs <= right - pad - wordW || needs > right - pad) right -= small(ctx, word, right, hy + 1, C.muted, { align: "right" }) + 12;
    headLine(ctx, texts, pad + 2, right, hy, tiny ? 13 : compact ? 14 : 17, head.color, tiny);

    const yOf = (rel) => plot.y + ((DB_TOP - clamp(rel, DB_BOT, DB_TOP)) / (DB_TOP - DB_BOT)) * plot.h;
    const T = Math.max(4, m.T || 8);
    const xOf = (t) => plot.x + (clamp(t, 0, T) / T) * plot.w;

    // Grid: dB against your level
    [6, 0, -6, -12].forEach((d) => {
      const y = yOf(d);
      ctx.strokeStyle = d === 0 ? C.gridStrong : C.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plot.x, y + 0.5);
      ctx.lineTo(plot.x + plot.w, y + 0.5);
      ctx.stroke();
      const lab = d === 0 ? "0" : d > 0 ? `+${d}` : `−${-d}`;
      small(ctx, lab, plot.x - 5, y, C.faint, { align: "right", px: tiny ? 10 : 11 });
    });
    // The unit only where it clears "+6" (the band's "±3 dB" names it anyway)
    if (!tiny && yOf(6) - plot.y >= 17) small(ctx, "dB", plot.x - 5, plot.y + 1, C.faint, { align: "right", px: 10, baseline: "top" });
    // Seconds along the bottom
    if (!tiny) {
      const step = T > 14 || plot.w < 240 ? 4 : 2;
      for (let s = 0; s <= T + 0.01; s += step) {
        small(ctx, s === 0 ? "0 s" : String(s), xOf(s), plot.y + plot.h + 7, C.faint, { align: s === 0 ? "left" : "center", px: 10 });
      }
    }

    if (m.review) countReview(ctx, plot, m, xOf, yOf, tiny, compact);
    else countLive(ctx, plot, m, xOf, yOf, tiny, compact);

    // On a narrow review the tally takes the top line; the cautions go under it
    const cy = m.review && !tiny && plot.w < 560 ? yOf(7.5) + 9 : plot.y + 3;
    cautions(ctx, plot.x + plot.w - 2, cy, m, plot.w * 0.8, tiny || w < 420);

    if (cardsH) breathCards(ctx, { x: pad, y: h - pad - cardsH, w: w - pad * 2, h: cardsH }, m, compact);
  }

  function band(ctx, plot, yOf, text, tiny) {
    const y0 = yOf(3);
    const y1 = yOf(-3);
    ctx.fillStyle = C.targetSoft;
    ctx.fillRect(plot.x, y0, plot.w, y1 - y0);
    ctx.strokeStyle = C.target;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(plot.x, y0 + 0.5);
    ctx.lineTo(plot.x + plot.w, y0 + 0.5);
    ctx.moveTo(plot.x, y1 - 0.5);
    ctx.lineTo(plot.x + plot.w, y1 - 0.5);
    ctx.stroke();
    // Its name in the gutter to the right: two short lines by the band
    if (text && !tiny && plot.bandWords) {
      const yc = (y0 + y1) / 2;
      plot.bandWords.forEach((s, i) => small(ctx, s, plot.x + plot.w + 6, yc + (i ? 7 : -7), C.target, { px: 11, weight: 800 }));
    }
  }

  function countLive(ctx, plot, m, xOf, yOf, tiny, compact) {
    const n = m.breaths.length;
    const b = m.cur || m.breaths[n - 1] || null;
    const prev = m.cur ? m.breaths[n - 1] : m.breaths[n - 2];
    const ref = b ? (b.ref != null ? b.ref : b.provRef) : null;
    if (b && b.ref != null) band(ctx, plot, yOf, L("tu nivel ±3 dB", "your level ±3 dB"), tiny);
    else {
      ctx.strokeStyle = C.gridStrong;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.moveTo(plot.x, yOf(0));
      ctx.lineTo(plot.x + plot.w, yOf(0));
      ctx.stroke();
      ctx.setLineDash([]);
      // Above the dashed line, on a backing (the first syllables may run under it)
      tag(
        ctx,
        b
          ? [L("tu nivel se fija tras 1 s de voz", "your level sets after 1 s of voice"), L("nivel: tras 1 s de voz", "level: after 1 s of voice")]
          : [L("tu nivel aparece al contar", "your level appears as you count"), L("tu nivel, al contar", "your level, as you count")],
        plot.x + plot.w - 4,
        yOf(0) - 11,
        C.faint,
        { align: "right", px: 11, weight: 700, maxW: plot.w - 12 }
      );
    }
    // The breath before, as a faint ghost to beat
    if (prev && prev.ref != null && !(m.cur && m.cur.blind)) {
      polyline(ctx, prev.peaks.map((p) => [p.t, p.db - prev.ref]), xOf, yOf, C.muted, 1.6, 0.45);
    }
    if (!b || ref == null) return;
    const hidden = b === m.cur && b.blind;
    if (hidden) {
      ctx.fillStyle = C.muted;
      ctx.textAlign = "center";
      const plan = wrapPlan(ctx, L("A ciegas: la cinta aparece al terminar", "Blind: the ribbon shows when you finish"), plot.w - 16, compact ? 13 : 15, 800, 13, 2);
      drawLines(ctx, plan, plot.x + plot.w / 2, plot.y + plot.h * 0.3 - (plan.lines.length * plan.lh) / 2);
    } else {
      // The level between syllables is texture; the peak of each syllable
      // (each number) is what the ear compares, so the peaks make the line
      polyline(ctx, b.trace, xOf, (db) => yOf(db - ref), "rgba(191, 230, 255, 0.42)", 1.2);
      peakLine(ctx, b.peaks, ref, xOf, yOf, tiny);
    }
    // Now: where you are in this breath
    if (b === m.cur) {
      const x = xOf(m.t - b.start);
      ctx.strokeStyle = "rgba(238, 243, 250, 0.45)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x, plot.y);
      ctx.lineTo(x, plot.y + plot.h);
      ctx.stroke();
      if (!hidden && m.level != null) youDot(ctx, x, yOf(m.level - ref), 5);
      return;
    }
    // A finished breath: its start and its end, side by side
    brackets(ctx, b, ref, xOf, yOf, tiny, plot);
  }

  /** Syllable peaks joined: in the band a dot, under it a hollow ▽, over it a caret. */
  function peakLine(ctx, peaks, ref, xOf, yOf, tiny) {
    polyline(
      ctx,
      peaks.map((p) => [p.t, p.db - ref]),
      xOf,
      yOf,
      C.you,
      tiny ? 2 : 2.6
    );
    peaks.forEach((pk) => {
      const rel = pk.db - ref;
      const x = xOf(pk.t);
      const y = yOf(rel);
      if (rel < -3) {
        dot(ctx, x, y, 6, C.bg);
        glyph(ctx, "tri", x, y, C.warn, 5.5);
      } else if (rel > 3) {
        dot(ctx, x, y, 6, C.bg);
        glyph(ctx, "up", x, y, pk.t < 1.2 ? C.warn : C.muted, 5.5);
      } else dot(ctx, x, y, tiny ? 3.2 : 4, C.you);
    });
  }

  function brackets(ctx, b, ref, xOf, yOf, tiny, plot) {
    const s = b.stats;
    if (!s || s.startMed == null || s.endMed == null) return;
    const v = breathVerdict(b);
    const ys = yOf(s.startMed - ref);
    const ye = yOf(s.endMed - ref);
    const x0 = xOf(0);
    const x1 = xOf(b.len * 0.3);
    const x2 = xOf(b.len * 0.7);
    const x3 = xOf(b.len);
    ctx.lineCap = "round";
    ctx.lineWidth = 3;
    ctx.strokeStyle = C.text;
    ctx.beginPath();
    ctx.moveTo(x0, ys);
    ctx.lineTo(x1, ys);
    ctx.stroke();
    ctx.strokeStyle = v.color;
    ctx.beginPath();
    ctx.moveTo(x2, ye);
    ctx.lineTo(x3, ye);
    ctx.stroke();
    ctx.setLineDash([3, 4]);
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = C.muted;
    ctx.beginPath();
    ctx.moveTo(x1, ys);
    ctx.lineTo(x2, ye);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.lineCap = "butt";
    // The two words sit above the band (or above their bracket, when it is
    // higher), each on a dark backing: never on the band's line or the curve
    const px = tiny ? 11 : 12;
    const above = (yy) => clamp(Math.min(yy, yOf(3)) - (tiny ? 8 : 10), plot.y + px / 2 + 1, plot.y + plot.h - px / 2 - 1);
    tag(ctx, L("inicio", "start"), x0 + 3, above(ys), C.text, { px, weight: 800 });
    const txt = v.word;
    const tw = widthAt(ctx, txt, px, 800);
    const lx = Math.max(x2, x3 - tw - 16);
    const ly = above(ye);
    ctx.fillStyle = "rgba(14, 21, 31, 0.86)";
    roundRect(ctx, lx - 2, ly - (px + 4) / 2, tw + 18, px + 4, 4);
    ctx.fill();
    glyph(ctx, v.glyph, lx + 5, ly, v.color, 5);
    small(ctx, txt, lx + 13, ly, v.color, { px, weight: 800 });
  }

  function countReview(ctx, plot, m, xOf, yOf, tiny) {
    band(ctx, plot, yOf, L("tu nivel ±3 dB", "your level ±3 dB"), tiny);
    const list = m.breaths.filter((b) => b.ref != null);
    list.forEach((b, i) => {
      const last = i === list.length - 1;
      polyline(ctx, b.peaks.map((p) => [p.t, p.db - b.ref]), xOf, yOf, last ? C.you : C.muted, last ? 2 : 1.4, last ? 0.75 : 0.35);
    });
    // Every breath as one slope: its start → its end
    list.forEach((b) => {
      const s = b.stats;
      if (!s || s.startMed == null || s.endMed == null) return;
      const v = breathVerdict(b);
      const xa = xOf(b.len * 0.15);
      const xb = xOf(b.len * 0.85);
      const ya = yOf(s.startMed - b.ref);
      const yb = yOf(s.endMed - b.ref);
      ctx.strokeStyle = v.color;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(xa, ya);
      ctx.lineTo(xb, yb);
      ctx.stroke();
      dot(ctx, xa, ya, 3.5, C.text);
      glyph(ctx, v.glyph, xb + 8, yb, v.color, 5);
    });
    if (!tiny && list.length) {
      const counts = { even: 0, fade: 0, rise: 0 };
      list.forEach((b) => {
        const k = breathVerdict(b).kind;
        if (counts[k] != null) counts[k]++;
      });
      tag(
        ctx,
        [
          L(`parejas ${counts.even} · caen ${counts.fade} · suben ${counts.rise}`, `even ${counts.even} · fade ${counts.fade} · rise ${counts.rise}`),
          L(`parejas ${counts.even} · caen ${counts.fade}`, `even ${counts.even} · fade ${counts.fade}`)
        ],
        plot.x + 4,
        clamp(yOf(7.5), plot.y + 8, yOf(3) - 8),
        C.muted,
        { px: 11, weight: 700, maxW: plot.w - 8 }
      );
    }
  }

  /** One card per breath, left to right, never removed. */
  function breathCards(ctx, box, m, compact) {
    const list = m.breaths;
    if (!list.length) {
      small(
        ctx,
        [L("Cada respiración deja aquí su tarjeta", "Each breath leaves its card here"), L("Aquí, una tarjeta por respiración", "A card per breath here")],
        box.x + box.w / 2,
        box.y + box.h / 2,
        C.faint,
        { align: "center", px: 11, maxW: box.w - 8, whole: true }
      );
      return;
    }
    const cw = compact ? 76 : 100;
    const gap = 6;
    const fit = Math.max(1, Math.floor((box.w + gap) / (cw + gap)));
    let shown = list.slice(-fit);
    let x = box.x;
    if (list.length > fit) {
      shown = list.slice(-(fit - 1));
      const more = list.length - shown.length;
      ctx.fillStyle = "rgba(255, 211, 110, 0.12)";
      roundRect(ctx, x, box.y, cw, box.h, 7);
      ctx.fill();
      small(ctx, `+${more}`, x + cw / 2, box.y + box.h / 2, C.done, { align: "center", px: compact ? 12 : 15, weight: 800 });
      x += cw + gap;
    }
    shown.forEach((b, i) => {
      const v = breathVerdict(b);
      const newest = i === shown.length - 1;
      ctx.fillStyle = "rgba(170, 195, 230, 0.07)";
      roundRect(ctx, x, box.y, cw, box.h, 7);
      ctx.fill();
      ctx.strokeStyle = newest ? C.text : C.grid;
      ctx.lineWidth = newest ? 1.5 : 1;
      roundRect(ctx, x + 0.5, box.y + 0.5, cw - 1, box.h - 1, 7);
      ctx.stroke();
      if (compact) {
        glyph(ctx, v.glyph, x + 12, box.y + box.h / 2, v.color, 5);
        small(ctx, v.short, x + 22, box.y + box.h / 2, v.color, { px: 11, weight: 800, maxW: cw - 26 });
      } else {
        glyph(ctx, v.glyph, x + 11, box.y + 12, v.color, 5);
        small(ctx, v.short, x + 20, box.y + 12, v.color, { px: 11, weight: 800, maxW: cw - 24 });
        const lenTxt = V.fmtSec(b.len);
        small(ctx, b.blind ? [lenTxt + " · " + L("ciega", "blind"), lenTxt] : lenTxt, x + cw - 6, box.y + box.h - 8, C.faint, {
          align: "right",
          px: 11,
          maxW: cw - 10,
          whole: true
        });
        if (b.ref != null && b.peaks.length >= 2) {
          V.sparkline(
            ctx,
            { x: x + 6, y: box.y + 21, w: cw - 12, h: box.h - 36 },
            b.peaks.map((p) => p.db - b.ref),
            { lo: -12, hi: 8, band: [-3, 3], width: 1.6 }
          );
        }
      }
      x += cw + gap;
    });
  }

  /* —— v13 · The volume ladder: the staircase you build —— */

  function levelName(m, lv) {
    const l = m.levels[lv];
    return l ? l.label : String(lv + 1);
  }
  function levelNum(lv) {
    return String(lv + 1);
  }

  function ladderSegments(m) {
    const items = [];
    (m.history || []).forEach((sgm) => items.push({ sgm, state: "done" }));
    items.push({ sgm: m.phase === "story" ? { kind: "story", k: (m.stories || []).length + 1 } : { kind: "ladder", k: m.repNo }, state: "current" });
    const doneReps = (m.history || []).filter((s) => s.kind === "ladder" && s.complete).length;
    const storyDone = (m.history || []).some((s) => s.kind === "story");
    if (m.phase === "ladder" && !storyDone) {
      let k = m.repNo;
      for (let r = doneReps + 1; r < m.repsTarget; r++) items.push({ sgm: { kind: "ladder", k: ++k }, state: "next" });
      items.push({ sgm: { kind: "story" }, state: "next" });
    }
    return items.slice(-5);
  }

  function segmentChips(ctx, box, m) {
    const segs = ladderSegments(m);
    let current = -1;
    const items = segs.map((it, i) => {
      const s = it.sgm;
      if (it.state === "current") current = i;
      const isStory = s.kind === "story";
      const label = isStory ? L("Historia 60 s", "Story 60 s") : L(`Escalera ${s.k}`, `Ladder ${s.k}`);
      const short = isStory ? L("Historia", "Story") : L(`Esc. ${s.k}`, `L${s.k}`);
      const num = isStory ? L("Hist.", "Story") : String(s.k);
      let sub = "";
      let subShort = "";
      if (it.state === "done") {
        if (isStory) [sub, subShort] = [L(`${s.used} de 5 niveles`, `${s.used} of 5 levels`), `${s.used}/5`];
        else if (s.complete) [sub, subShort] = [L(`${s.distinct} de ${s.steps} distintos`, `${s.distinct} of ${s.steps} distinct`), `${s.distinct}/${s.steps}`];
        else sub = L("a medias", "partial");
      } else if (it.state === "current" && m.review) {
        const u = m.story ? m.story.usedCount : 0;
        if (isStory) [sub, subShort] = [L(`${u} de 5 niveles`, `${u} of 5 levels`), `${u}/5`];
        else sub = L("a medias", "partial");
      } else if (it.state === "current") {
        if (isStory) sub = fmtClock((m.storySec || 60) - (m.story ? m.story.t : 0));
        else [sub, subShort] = [L(`paso ${m.pos + 1} de ${m.seq.length}`, `step ${m.pos + 1} of ${m.seq.length}`), `${m.pos + 1}/${m.seq.length}`];
      }
      return { label, short, num, sub, subShort, done: it.state === "done" };
    });
    const frac = m.phase === "story" && m.story ? m.story.t / (m.storySec || 60) : (m.pos + m.tStep / m.stepSec) / m.seq.length;
    fitChips(ctx, box, items, { current: m.review ? -1 : current, frac: m.review ? null : frac });
  }

  function ladderHeader(ctx, box, m, tiny, compact) {
    const y = box.y + box.h / 2;
    let right = box.x + box.w;
    if (!m.review) {
      const left = m.phase === "story" ? (m.storySec || 60) - (m.story ? m.story.t : 0) : m.stepSec - m.tStep;
      const txt = m.phase === "story" ? fmtClock(left) : `${Math.max(0, Math.ceil(left))} s`;
      ctx.font = font(tiny ? 15 : compact ? 17 : 22, 800, true);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = C.text;
      ctx.fillText(txt, right - 2, y + 1);
      right -= ctx.measureText(txt).width + 12;
      if (compact || tiny) {
        const rep = m.phase === "story" ? L("Historia", "Story") : L(`Esc. ${m.repNo}`, `Ladder ${m.repNo}`);
        right -= small(ctx, rep, right, y + 1, C.muted, { align: "right" }) + 10;
      }
    }
    let main;
    let mainShort = null;
    let sub = "";
    let subShort = "";
    if (m.review) {
      const full = ladderReviewFull(m);
      main = full;
      mainShort = lead(full);
      if (box.twoLines && mainShort) {
        // On two lines: the lead, then the facts under it
        main = mainShort;
        sub = full.slice(mainShort.length).replace(/^\s*(·|:)\s*/, "");
        subShort = ladderReviewLine(m).slice(mainShort.length).replace(/^\s*(·|:)\s*/, "");
      }
    } else if (m.phase === "story") {
      main = L("Historia de 60 s", "A 60 s story");
      sub = L("usa al menos 3 de tus niveles, con intención", "use at least 3 of your levels, on purpose");
      subShort = L("3+ niveles, con intención", "3+ levels, on purpose");
    } else {
      const lv = m.seq[m.pos];
      main = `${levelName(m, lv)}`;
      sub = ladderInstruction(m);
    }
    const px = tiny ? 13 : compact ? 15 : 18;
    const maxW = right - box.x - 6;
    if (tiny || compact || !box.twoLines) {
      // One line: the name and the instruction whole, else the name alone
      const texts = sub ? [`${main} · ${sub}`, subShort && `${main} · ${subShort}`, main, mainShort] : [main, mainShort];
      headLine(ctx, texts, box.x + 2, right, y, px, C.text, tiny, tiny ? 12 : 13);
      return;
    }
    // Room for two: the name, then the instruction under it
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = C.text;
    const y1 = box.y + box.lineH / 2;
    fitDraw(ctx, [main, mainShort], box.x + 2, y1, maxW, px, 800, 13);
    if (sub) {
      ctx.fillStyle = C.muted;
      fitDraw(ctx, [sub, subShort], box.x + 2, y1 + box.lineH - 2, box.w - 4, 14, 700, 13);
    }
  }
  /** Whether the ladder's header needs its instruction on a second line. */
  function ladderHeadTwoLines(ctx, w, m) {
    if (m.review) return widthAt(ctx, ladderReviewFull(m), 18, 800) > w - 20;
    const main = m.phase === "story" ? L("Historia de 60 s", "A 60 s story") : levelName(m, m.seq[m.pos]);
    const sub = m.phase === "story" ? L("usa al menos 3 de tus niveles, con intención", "use at least 3 of your levels, on purpose") : ladderInstruction(m);
    const subShort = m.phase === "story" ? L("3+ niveles, con intención", "3+ levels, on purpose") : sub;
    // Beside the countdown (~60 px) and the gaps; one line when either form fits it
    return [sub, subShort].every((x) => widthAt(ctx, `${main} · ${x}`, 16, 800) > w - 20 - 70);
  }

  function ladderInstruction(m) {
    const pos = m.pos;
    const lv = m.seq[pos];
    if (pos === 0) return L("casi susurro, la frase entera", "near-whisper, the whole sentence");
    const prevLv = m.seq[pos - 1];
    if (lv === m.levels.length - 1) return L("sala llena, sin gritar", "full room, no shouting");
    if (lv > prevLv) return L(`más fuerte que el ${levelNum(prevLv)}`, `louder than ${levelNum(prevLv)}`);
    return L(`más suave que el ${levelNum(prevLv)}`, `softer than ${levelNum(prevLv)}`);
  }

  /** The review line and, when a story was told before this ladder, its levels (as the words under the picture say). */
  function ladderReviewFull(m) {
    const line = ladderReviewLine(m);
    const st = m.phase !== "story" && m.reps.length ? (m.history || []).filter((s) => s.kind === "story").pop() : null;
    return st ? line + L(` · historia: ${st.used} de 5 niveles`, ` · story: ${st.used} of 5 levels`) : line;
  }

  function repStats(rep) {
    const set = rep.treads.filter((t) => t.db != null);
    const steps = rep.treads.filter((t, i) => i > 0 && t.db != null && t.verdict !== "first");
    const distinct = steps.filter((t) => t.verdict === "distinct").length;
    const dbs = set.map((t) => t.db);
    const span = dbs.length >= 2 ? Math.max(...dbs) - Math.min(...dbs) : null;
    return { distinct, steps: steps.length, span };
  }

  function ladderReviewLine(m) {
    const done = (m.history || []).filter((s) => s.kind === "ladder" && s.complete);
    if (m.phase === "story" || !m.reps.length) {
      const st = (m.history || []).filter((s) => s.kind === "story").pop();
      if (m.phase === "story" && m.story) return L(`Historia: ${m.story.usedCount} de 5 niveles usados`, `Story: ${m.story.usedCount} of 5 levels used`);
      if (st) return L(`Historia: ${st.used} de 5 niveles usados`, `Story: ${st.used} of 5 levels used`);
    }
    const all = m.reps.map(repStats).filter((s) => s.steps);
    const d = all.reduce((a, s) => a + s.distinct, 0);
    const s = all.reduce((a, x) => a + x.steps, 0);
    const span = Math.max(0, ...all.map((x) => x.span || 0));
    if (!s) return L("Sin escalones medidos todavía", "No measured steps yet");
    const lead = done.length
      ? L(`${done.length} ${done.length === 1 ? "escalera completa" : "escaleras completas"}`, `${done.length} full ${done.length === 1 ? "ladder" : "ladders"}`)
      : L("Escalera a medias", "Partial ladder");
    return L(`${lead} · ${d} de ${s} pasos distintos · rango ${fmtNum(span, 0)} dB`, `${lead} · ${d} of ${s} steps distinct · range ${fmtNum(span, 0)} dB`);
  }

  /**
   * model: {
   *   levels: [{ label }], seq: [level index…], pos, tStep, stepSec,
   *   reps: [{ treads: [{ level, db, delta, verdict, voiced }] }], repNo, repsTarget,
   *   cur: { median, live, voiced },   the tread being built
   *   range: { lo, hi } (dB, grows only), phase: "ladder"|"story",
   *   story: { t, trace, zones, used, usedCount, approx }, storySec,
   *   history: finished ladders and stories, review, processed, clipping
   * }
   */
  function volumeLadder(ctx, w, h, m) {
    panel(ctx, w, h);
    const pad = 10;
    const tiny = h < 135;
    const compact = h < 190;
    let y = pad;
    if (!tiny && !compact) {
      segmentChips(ctx, { x: pad, y, w: w - pad * 2, h: 34 }, m);
      y += 40;
    }
    const twoLines = !tiny && !compact && ladderHeadTwoLines(ctx, w, m);
    const lineH = 26;
    const headH = tiny ? 18 : compact ? 22 : twoLines ? lineH + 18 : lineH;
    ladderHeader(ctx, { x: pad, y, w: w - pad * 2, h: twoLines ? lineH : headH, twoLines, lineH }, m, tiny, compact);
    y += headH + (tiny ? 2 : 6);
    const body = { x: pad, y, w: w - pad * 2, h: h - pad - y };
    if (m.phase === "story") storyBody(ctx, body, m, tiny, compact);
    else stairsBody(ctx, body, m, tiny, compact);
    cautions(ctx, w - pad - 2, body.y + 2, m, body.w * 0.7, tiny || w < 420);
  }

  function stairsBody(ctx, box, m, tiny, compact) {
    const seq = m.seq;
    const n = seq.length;
    const gutter = tiny ? 4 : 30;
    const slotW = (box.w - gutter) / n;
    // Each step's name under its slot when every name fits there whole;
    // otherwise numbers in the slots and one line naming them
    const names = m.levels.map((l, i) => levelName(m, i).replace(/^\d+\s*/, ""));
    const namesFit = !tiny && !compact && names.every((s) => widthAt(ctx, "✓ " + s, 11, 700) <= slotW - 10);
    const legend =
      !tiny && !compact && !namesFit
        ? wrapPlan(ctx, m.levels.map((l, i) => `${i + 1} ${names[i]}`).join(" · "), box.w - 4, 11, 700, 11, 2)
        : null;
    const labH = tiny ? 16 : compact ? 20 : namesFit ? 34 : 22;
    // The last ladder's result, or why distance matters, under the steps
    const last = (m.history || []).filter((s) => s.kind === "ladder" && s.complete).pop();
    const noteText = last
      ? L(
          `Escalera ${last.k}: ${last.distinct} de ${last.steps} pasos distintos · rango ${fmtNum(last.span || 0, 0)} dB`,
          `Ladder ${last.k}: ${last.distinct} of ${last.steps} steps distinct · range ${fmtNum(last.span || 0, 0)} dB`
        )
      : L("Misma distancia al micrófono: acercarte también sube el nivel", "Same distance from the mic: moving closer also raises the level");
    const notePlan = tiny || compact ? null : wrapPlan(ctx, noteText, box.w - 4, 11, 700, 11, box.h >= 200 ? 2 : 1);
    const topRoom = tiny ? 12 : 18;
    // The steps keep their height first; the legend, then the note, give way
    const plotRoom = box.h - labH - topRoom - 6;
    let legendH = legend && legend.fits ? legend.lines.length * legend.lh + 2 : 0;
    if (plotRoom - legendH < 56) legendH = 0;
    let noteH = notePlan && notePlan.fits ? notePlan.lines.length * notePlan.lh + 2 : 0;
    if (plotRoom - legendH - noteH < 56) noteH = 0;
    const plot = {
      x: box.x + gutter,
      y: box.y + topRoom,
      w: box.w - gutter,
      h: Math.max(24, box.h - labH - legendH - noteH - topRoom - 6)
    };
    const range = m.range || { lo: -60, hi: -30 };
    const yOf = (db) => plot.y + plot.h - ((clamp(db, range.lo, range.hi) - range.lo) / (range.hi - range.lo)) * plot.h;
    const base = plot.y + plot.h;
    // Grid every 6 dB, and a 6 dB ruler: steps are read against it, not a number
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    for (let d = range.lo + 6; d < range.hi; d += 6) {
      const gy = Math.round(yOf(d)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(plot.x, gy);
      ctx.lineTo(plot.x + plot.w, gy);
      ctx.stroke();
    }
    ctx.strokeStyle = C.gridStrong;
    ctx.beginPath();
    ctx.moveTo(plot.x, base + 0.5);
    ctx.lineTo(plot.x + plot.w, base + 0.5);
    ctx.stroke();
    if (!tiny) {
      const y1 = base;
      const y0 = yOf(range.lo + 6);
      ctx.strokeStyle = C.muted;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(box.x + 8, y0);
      ctx.lineTo(box.x + 8, y1);
      ctx.moveTo(box.x + 4, y0);
      ctx.lineTo(box.x + 12, y0);
      ctx.moveTo(box.x + 4, y1);
      ctx.lineTo(box.x + 12, y1);
      ctx.stroke();
      // Its name along it, only where the ruler is long enough to hold it
      if (y1 - y0 >= 30) {
        ctx.save();
        ctx.translate(box.x + 21, (y0 + y1) / 2);
        ctx.rotate(-Math.PI / 2);
        small(ctx, "6 dB", 0, 0, C.muted, { align: "center", px: 10 });
        ctx.restore();
      } else if (y0 - 14 >= box.y) small(ctx, "6 dB", box.x + 2, y0 - 8, C.muted, { px: 10 });
      // (else the ruler goes unnamed rather than onto the steps)
    }
    // After Stop, a ladder barely begun gives way to the last one you finished
    let shown = m.reps.length - 1;
    if (m.review && shown > 0 && m.reps[shown].treads.filter((t) => t.db != null).length < 2) shown -= 1;
    const rep = m.reps[shown] || { treads: [] };
    const inset = Math.max(3, slotW * 0.1);
    // Other ladders, as faint ghosts at the same slots
    m.reps.forEach((r, k) => {
      if (k === shown) return;
      r.treads.forEach((td, i) => {
        if (td.db == null || i >= n) return;
        const x = plot.x + i * slotW + inset;
        const gy = yOf(td.db);
        ctx.strokeStyle = C.faint;
        ctx.globalAlpha = 0.55;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x, gy);
        ctx.lineTo(x + slotW - inset * 2, gy);
        ctx.stroke();
        ctx.globalAlpha = 1;
      });
    });
    // This ladder's treads
    rep.treads.forEach((td, i) => {
      if (i >= n) return;
      drawTread(ctx, plot.x + i * slotW + inset, slotW - inset * 2, td.db != null ? yOf(td.db) : base, base, td, m, tiny, compact);
    });
    // The tread being built
    if (!m.review && m.pos < n) {
      const i = m.pos;
      const x = plot.x + i * slotW + inset;
      const tw = slotW - inset * 2;
      const prev = [...rep.treads].reverse().find((t) => t.db != null);
      // On the way down, the same level from the way up: does it come back?
      const lv = seq[i];
      const up = rep.treads.find((t, k) => k < i && t.level === lv && t.db != null);
      if (up) {
        const uy = yOf(up.db);
        ctx.strokeStyle = C.done;
        ctx.globalAlpha = 0.7;
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 2;
        roundRect(ctx, x + 1, uy, tw - 2, base - uy, 4);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        // Named inside the box, clear of the last tread's line above it
        if (!tiny && base - uy > 26)
          small(ctx, [L(`${levelNum(lv)} al subir`, `${levelNum(lv)} going up`), L("al subir", "going up")], x + tw / 2, uy + 11, C.done, {
            align: "center",
            px: 11,
            maxW: tw - 6,
            whole: true
          });
      }
      if (prev) {
        const py = yOf(prev.db);
        ctx.strokeStyle = C.muted;
        ctx.setLineDash([4, 4]);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x - inset, py);
        ctx.lineTo(x + tw + inset, py);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      if (m.cur && m.cur.median != null) {
        const my = yOf(m.cur.median);
        ctx.fillStyle = C.youSoft;
        roundRect(ctx, x, my, tw, base - my, 4);
        ctx.fill();
      }
      if (m.cur && m.cur.live != null) youDot(ctx, x + tw / 2, yOf(m.cur.live), tiny ? 5 : 6);
      else if (!tiny) small(ctx, "…", x + tw / 2, base - 12, C.faint, { align: "center", px: 14 });
    }
    // The sequence, as a row of steps: done ✓, now outlined, next waiting
    const ly = base + 4;
    for (let i = 0; i < n; i++) {
      const x = plot.x + i * slotW + 2;
      const cw = slotW - 4;
      const td = rep.treads[i];
      const isCur = !m.review && i === m.pos;
      const done = !!td && td.db != null;
      ctx.fillStyle = done ? "rgba(255, 211, 110, 0.12)" : "rgba(170, 195, 230, 0.06)";
      roundRect(ctx, x, ly, cw, labH - 2, 6);
      ctx.fill();
      if (isCur) {
        ctx.fillStyle = C.targetSoft;
        roundRect(ctx, x, ly, Math.max(6, cw * clamp(m.tStep / m.stepSec, 0, 1)), labH - 2, 6);
        ctx.fill();
      }
      ctx.strokeStyle = isCur ? C.text : done ? "rgba(255, 211, 110, 0.5)" : C.grid;
      ctx.lineWidth = isCur ? 2 : 1;
      roundRect(ctx, x + 0.5, ly + 0.5, cw - 1, labH - 3, 6);
      ctx.stroke();
      const lv = seq[i];
      const col = done ? C.done : isCur ? C.text : C.muted;
      const mark = done ? "✓ " : "";
      if (!namesFit) {
        // The name when it fits the slot whole, else its number
        small(ctx, [mark + levelName(m, lv), mark + levelNum(lv), levelNum(lv)], x + cw / 2, ly + (labH - 2) / 2, col, {
          align: "center",
          px: tiny ? 10 : 11,
          min: tiny ? 10 : 11,
          weight: 800,
          maxW: cw - 6
        });
      } else {
        small(ctx, mark + levelNum(lv), x + cw / 2, ly + 10, col, { align: "center", px: 12, weight: 800 });
        small(ctx, names[lv], x + cw / 2, ly + 23, done ? C.done : C.faint, { align: "center", px: 11 });
      }
    }
    if (legendH) {
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      drawLines(ctx, legend, box.x + 2, ly + labH + 1);
    }
    if (noteH) {
      ctx.fillStyle = last ? C.muted : C.faint;
      ctx.textAlign = "left";
      drawLines(ctx, notePlan, box.x + 2, box.y + box.h - noteH + 2);
    }
  }

  /** A set tread: the level you held, and how far it moved from the one before. */
  function drawTread(ctx, x, w, yTop, base, td, m, tiny, compact) {
    if (td.db == null) {
      ctx.strokeStyle = C.grid;
      ctx.setLineDash([3, 3]);
      ctx.lineWidth = 1;
      roundRect(ctx, x, base - 14, w, 14, 3);
      ctx.stroke();
      ctx.setLineDash([]);
      if (!tiny) small(ctx, [L("sin voz", "no voice"), "—"], x + w / 2, base - 22, C.faint, { align: "center", px: 11, maxW: w, whole: true });
      return;
    }
    const good = td.verdict === "distinct" || td.verdict === "first";
    ctx.fillStyle = good ? "rgba(255, 211, 110, 0.2)" : "rgba(170, 195, 230, 0.1)";
    roundRect(ctx, x, yTop, w, Math.max(3, base - yTop), 4);
    ctx.fill();
    ctx.strokeStyle = good ? C.done : C.muted;
    ctx.lineWidth = good ? 3 : 2;
    if (!good) ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.moveTo(x, yTop + 1);
    ctx.lineTo(x + w, yTop + 1);
    ctx.stroke();
    ctx.setLineDash([]);
    const ly = yTop - (tiny ? 7 : 9);
    const px = tiny ? 10 : 11;
    if (td.verdict === "first") {
      if (!tiny) small(ctx, L("base", "base"), x + w / 2, ly, C.done, { align: "center", px: 11, maxW: w + 4, whole: true });
      return;
    }
    const d = td.delta;
    const txt = fmtDb(d);
    // The number whole; on a narrow tread without its "dB"
    const bare = txt.replace(/\s*dB$/, "");
    if (td.verdict === "distinct") {
      glyph(ctx, d > 0 ? "up" : "tri", x + 7, ly, C.done, 4.5);
      small(ctx, [txt, bare], x + 14, ly, C.done, { px, min: px, weight: 800, maxW: w - 12, whole: true });
    } else {
      small(ctx, ["≈ " + txt, "≈ " + bare, "≈"], x + w / 2, ly, C.muted, { align: "center", px, min: px, weight: 800, maxW: w + 4, whole: true });
      if (!tiny && !compact && base - yTop >= 22) {
        const word = td.verdict === "same" ? L("casi igual", "about the same") : d < 0 ? L("más suave", "softer") : L("más fuerte", "louder");
        small(ctx, word, x + w / 2, yTop + 11, C.muted, { align: "center", px: 11, maxW: w - 2, whole: true });
      }
    }
  }

  function storyBody(ctx, box, m, tiny, compact) {
    const s = m.story;
    if (!s) return;
    const chipH = tiny ? 0 : compact ? 20 : 28;
    const plotH = Math.max(24, box.h - chipH - (chipH ? 8 : 2));
    // Bands too thin to name leave the names to the chips below: a narrow gutter
    const gutter = tiny ? 20 : compact || plotH < 72 ? 34 : 96;
    const plot = { x: box.x + gutter, y: box.y + 2, w: box.w - gutter, h: plotH };
    const zones = s.zones;
    if (!zones) {
      ctx.fillStyle = C.muted;
      ctx.textAlign = "center";
      const plan = wrapPlan(ctx, L("Habla: tras dos segundos de voz aparecen tus niveles", "Speak: your levels appear after two seconds of voice"), box.w - 16, 13, 700, 13, 3);
      drawLines(ctx, plan, box.x + box.w / 2, plot.y + plot.h / 2 - (plan.lines.length * plan.lh) / 2);
      return;
    }
    const lo = zones[0].lo - 2;
    const hi = zones[zones.length - 1].hi + 2;
    const yOf = (db) => plot.y + plot.h - ((clamp(db, lo, hi) - lo) / (hi - lo)) * plot.h;
    zones.forEach((z, i) => {
      const y0 = yOf(z.hi);
      const y1 = yOf(z.lo);
      // Used zones glow gold; neighbours alternate so each band stays its own
      ctx.fillStyle = s.used[i]
        ? i % 2
          ? "rgba(255, 211, 110, 0.13)"
          : "rgba(255, 211, 110, 0.07)"
        : i % 2
          ? "rgba(170, 195, 230, 0.06)"
          : "rgba(170, 195, 230, 0.025)";
      ctx.fillRect(plot.x, y0, plot.w, y1 - y0);
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(plot.x, y0 + 0.5);
      ctx.lineTo(plot.x + plot.w, y0 + 0.5);
      ctx.stroke();
      // Named only where the band is tall enough for a line of its own
      if (y1 - y0 < 12) return;
      const mark = s.used[i] ? "✓ " : "";
      const nm = tiny || compact ? [mark + levelNum(i), levelNum(i)] : [mark + levelName(m, i), levelName(m, i), mark + levelNum(i)];
      small(ctx, nm, box.x + 2, (y0 + y1) / 2, s.used[i] ? C.done : C.muted, {
        px: tiny ? 10 : 11,
        min: tiny ? 10 : 11,
        weight: 800,
        maxW: gutter - 4
      });
    });
    // The ribbon: the last seconds, now at the right
    const W = plot.w < 420 ? 8 : 12;
    const reduced = V.reducedMotion();
    const tLeft = reduced ? Math.floor(s.t / W) * W : s.t - W * 0.92;
    const xOf = (t) => plot.x + ((t - tLeft) / W) * plot.w;
    const pts = s.trace.filter((p) => p[0] >= tLeft - 0.2);
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.x, plot.y, plot.w, plot.h);
    ctx.clip();
    // The syllables as texture; each phrase sets as a step at the level it held
    polyline(ctx, pts, xOf, yOf, C.you, 1.3, 0.4);
    (s.phrases || []).forEach((ph) => {
      if (ph.t1 < tLeft - 0.2) return;
      const py = Math.round(yOf(ph.db));
      const x0 = xOf(ph.t0);
      const x1 = Math.max(x0 + 4, xOf(ph.t1));
      ctx.strokeStyle = C.you;
      ctx.lineWidth = tiny ? 3 : 4;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(x0, py);
      ctx.lineTo(x1, py);
      ctx.stroke();
      ctx.lineCap = "butt";
      if (!tiny && x1 - x0 > 18) small(ctx, levelNum(ph.zone), (x0 + x1) / 2, py - 9, C.you, { align: "center", px: 10, weight: 800 });
    });
    ctx.restore();
    const nx = xOf(s.t);
    ctx.strokeStyle = "rgba(238, 243, 250, 0.45)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(nx, plot.y);
    ctx.lineTo(nx, plot.y + plot.h);
    ctx.stroke();
    if (m.level != null && !m.review) youDot(ctx, nx, yOf(m.level), 5);
    const wide = plot.w >= 420;
    const approxTag = s.approx && !tiny && wide && plot.h >= 60;
    if (approxTag) tag(ctx, L("niveles aprox.: sin escalera previa", "approx. levels: no ladder yet"), plot.x + 6, plot.y + 10, C.faint, { px: 11, weight: 700 });
    if (chipH) {
      const items = zones.map((z, i) => ({ label: levelName(m, i), short: levelNum(i), num: levelNum(i), done: !!s.used[i] }));
      fitChips(ctx, { x: box.x, y: box.y + box.h - chipH, w: box.w, h: chipH }, items, {});
    }
    // The tally, on a backing over the ribbon's corner, whole or shorter
    const approx = s.approx && !approxTag ? L(" · aprox.", " · approx.") : "";
    const px = tiny ? 11 : 12;
    tag(
      ctx,
      [
        L(`niveles usados ${s.usedCount} de 5`, `levels used ${s.usedCount} of 5`) + approx,
        L(`${s.usedCount} de 5 niveles`, `${s.usedCount} of 5 levels`) + approx,
        L(`${s.usedCount} de 5 niveles`, `${s.usedCount} of 5 levels`)
      ],
      plot.x + plot.w - 4,
      plot.y + (m.processed || m.clipping ? 24 : 4) + px / 2 + 2,
      s.usedCount >= 3 ? C.done : C.text,
      { align: "right", px, maxW: plot.w - 10 }
    );
  }

  /* —— v20 · Energy triad: three takes, three channels —— */

  const CH_SAME = { db: 2, rate: 0.4, range: 1.5 };

  function energyChannels(m) {
    const ref = m.refDb;
    const refName = m.refName || L("tu toma media", "your medium take");
    const bareDb = (v) => (ref == null ? "—" : fmtDb(v - ref).replace(/\s*dB$/, ""));
    return [
      {
        key: "db",
        title: L("Volumen", "Volume"),
        unit: L(`dB · 0 = ${refName}`, `dB · 0 = ${refName}`),
        unitShort: "dB",
        refNote: L(`dB: 0 = ${refName}`, `dB: 0 = ${refName}`),
        fmt: (v) => (ref == null ? "" : fmtDb(v - ref)),
        bare: bareDb,
        minSpan: 12
      },
      {
        key: "rate",
        title: L("Ritmo", "Pace"),
        unit: L("sílabas/s aprox.", "syllables/s approx."),
        unitShort: L("síl/s", "syl/s"),
        fmt: (v) => fmtNum(v, 1),
        bare: (v) => fmtNum(v, 1),
        minSpan: 2
      },
      {
        key: "range",
        title: L("Melodía", "Melody"),
        unit: L("semitonos de rango", "semitones of range"),
        unitShort: "st",
        fmt: (v) => `${fmtNum(v, 0)} st`,
        bare: (v) => fmtNum(v, 0),
        minSpan: 6
      }
    ];
  }

  function energyHeadline(m) {
    if (m.review) return L("Qué cambió entre tus tomas", "What changed between your takes");
    const tk = m.takeDefs[m.i];
    return tk ? tk.instruction : "";
  }

  /**
   * model: {
   *   takeDefs: [{ key, label, short, persona, instruction }]
   *   cycle: [{ db, rate, range, drop, done, voiced }]   this cycle's takes
   *   ghost: the previous cycle's takes (or null)
   *   i, tTake, stepSec, live: { db, rate, range }, refDb, refName,
   *   targets: { db, rate, range } for the lead take, review, processed, clipping
   * }
   */
  function energyTriad(ctx, w, h, m) {
    panel(ctx, w, h);
    const pad = 10;
    const tiny = h < 135;
    const compact = h < 190;
    let y = pad;
    if (!tiny) {
      const ch = compact ? 30 : 38;
      const items = m.takeDefs.map((d, i) => {
        const tk = m.cycle[i] || {};
        let sub = d.persona;
        if (tk.done && tk.drop != null && tk.drop <= -3) sub = L("↘ cae al final", "↘ fades at the end");
        else if (tk.closed && !tk.done) sub = L("sin voz", "no voice");
        return { label: d.label, short: d.short, num: String(i + 1), sub, done: !!tk.done };
      });
      fitChips(ctx, { x: pad, y, w: w - pad * 2, h: ch }, items, {
        current: m.review ? -1 : m.i,
        frac: m.review ? null : clamp(m.tTake / m.stepSec, 0, 1)
      });
      y += ch + 6;
    }
    const headH = tiny ? 18 : compact ? 20 : 26;
    const hy = y + headH / 2;
    let right = w - pad;
    if (!m.review) {
      const txt = fmtClock(m.stepSec - m.tTake);
      ctx.font = font(tiny ? 15 : compact ? 16 : 20, 800, true);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = C.text;
      ctx.fillText(txt, right - 2, hy + 1);
      right -= ctx.measureText(txt).width + 12;
    }
    const head = energyHeadline(m);
    headLine(ctx, [head, lead(head)], pad + 2, right, hy, tiny ? 13 : compact ? 14 : 16, C.text, tiny);
    y += headH + (tiny ? 2 : 6);
    const footH = tiny || compact ? 0 : 16;
    const body = { x: pad, y, w: w - pad * 2, h: h - pad - y - footH };
    const chs = energyChannels(m);
    // Three charts side by side when each keeps ~200 px, stacked when each
    // keeps its own height; else one table: values as words, never crushed
    const sideW = (body.w - 20) / 3;
    const stackH = (body.h - 12) / 3;
    const layout = (sideW >= 200 && body.h >= 96) || (tiny && sideW >= 120) ? "side" : !tiny && stackH >= 56 ? "stack" : "table";
    m._layout = layout;
    if (layout === "table") energyTable(ctx, body, chs, m, { tiny, compact });
    else {
      const side = layout === "side";
      const gap = side ? 10 : 6;
      // Stacked, the takes' names run once, under the last chart
      const footH = 14;
      const hh = (body.h - gap * 2 - footH) / 3;
      chs.forEach((ch, k) => {
        const b = side
          ? { x: body.x + k * ((body.w + gap) / 3), y: body.y, w: (body.w + gap) / 3 - gap, h: body.h }
          : { x: body.x, y: body.y + k * (hh + gap), w: body.w, h: hh + (k === 2 ? footH : 0) };
        channelChart(ctx, b, ch, m, { side, tiny, compact, foot: side || k === 2 });
      });
    }
    cautions(ctx, w - pad - 2, body.y, m, body.w * 0.7, tiny || w < 420);
    if (footH) {
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      fitDraw(
        ctx,
        [
          L("Cara y gestos: el micrófono no los ve · revísalos en la grabación", "Face and gesture: the mic can't see them · check them in the recording"),
          L("Cara y gestos: revísalos en la grabación", "Face and gesture: check them in the recording")
        ],
        pad + 2,
        h - pad - 6,
        w - pad * 2 - 4,
        11,
        700,
        11,
        true
      );
    }
  }

  /**
   * Too little room for charts: rows are the channels, columns the takes,
   * each value in words. The current take's column shows the live value.
   */
  function energyTable(ctx, box, chs, m, o) {
    const n = m.takeDefs.length;
    ctx.fillStyle = "rgba(170, 195, 230, 0.04)";
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    const inner = box.w - 12;
    const withUnit = chs.map((ch) => `${ch.title} (${ch.unitShort})`);
    const titleW0 = Math.max(...withUnit.map((s) => widthAt(ctx, s, 11, 800)));
    const unitsFit = (inner - titleW0 - 8) / n >= 42;
    const titles = unitsFit ? withUnit : chs.map((ch) => ch.title);
    const titleW = Math.max(...titles.map((s) => widthAt(ctx, s, 11, 800)));
    const colX = box.x + 6 + titleW + 8;
    const colW = (box.x + box.w - 6 - colX) / n;
    const cx = (i) => colX + (i + 0.5) * colW;
    const headRowH = 16;
    const note = chs[0].refNote;
    const avail = box.h - 4 - headRowH;
    const noteH = avail - 16 >= 3 * 16 ? 16 : 0;
    const rowH = Math.min(26, (avail - noteH) / 3);
    let y = box.y + 2;
    // Take names over their columns
    m.takeDefs.forEach((d, i) => {
      const cur = i === m.i && !m.review;
      small(ctx, [d.short, String(i + 1)], cx(i), y + headRowH / 2, cur ? C.text : C.faint, { align: "center", px: 11, weight: 800, maxW: colW - 4 });
    });
    y += headRowH;
    const live = !m.review && m.live ? m.live : null;
    chs.forEach((ch, k) => {
      const ry = y + k * rowH;
      if (k % 2 === 0) {
        ctx.fillStyle = "rgba(170, 195, 230, 0.04)";
        ctx.fillRect(box.x + 2, ry, box.w - 4, rowH);
      }
      small(ctx, titles[k], box.x + 6, ry + rowH / 2, C.text, { px: 11, weight: 800 });
      m.takeDefs.forEach((d, i) => {
        const tk = m.cycle[i];
        const v = tk && tk.done && Number.isFinite(tk[ch.key]) ? tk[ch.key] : null;
        const lv = live && i === m.i && Number.isFinite(live[ch.key]) ? live[ch.key] : null;
        const txt = v != null ? ch.bare(v) : lv != null ? ch.bare(lv) : "—";
        ctx.font = font(12, 800, true);
        ctx.fillStyle = v != null ? C.you : lv != null ? C.muted : C.faint;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(txt, cx(i), ry + rowH / 2 + 0.5);
      });
    });
    if (noteH) small(ctx, [note, "dB: 0 = " + L("referencia", "reference")], box.x + 6, box.y + box.h - noteH / 2 - 2, C.faint, { px: 11, maxW: box.w - 12, whole: true });
  }

  function channelChart(ctx, box, ch, m, o) {
    ctx.fillStyle = "rgba(170, 195, 230, 0.04)";
    roundRect(ctx, box.x, box.y, box.w, box.h, 8);
    ctx.fill();
    const titleH = o.tiny ? 12 : 16;
    const tw = small(ctx, ch.title, box.x + 6, box.y + titleH / 2 + 2, C.text, { px: o.tiny ? 11 : 12, weight: 800 });
    // Its unit beside it, whole or in short, or not at all
    if (!o.tiny) small(ctx, [ch.unit, ch.unitShort], box.x + 12 + tw, box.y + titleH / 2 + 2, C.faint, { px: 11, maxW: box.w - tw - 18, whole: true });
    const colsH = o.tiny || !o.foot ? 0 : 14;
    const area = { x: box.x + 6, y: box.y + titleH + 8, w: box.w - 12, h: box.h - titleH - 12 - colsH };
    if (area.h < 14) return;
    const n = m.takeDefs.length;
    const colW = area.w / n;
    const cx = (i) => area.x + (i + 0.5) * colW;
    const vals = m.cycle.map((t) => (t && t.done && Number.isFinite(t[ch.key]) ? t[ch.key] : null));
    const ghost = (m.ghost || []).map((t) => (t && t.done && Number.isFinite(t[ch.key]) ? t[ch.key] : null));
    const live = !m.review && m.live && Number.isFinite(m.live[ch.key]) ? m.live[ch.key] : null;
    const leadI = m.takeDefs.findIndex((d) => d.key === "lead");
    const target = m.targets && Number.isFinite(m.targets[ch.key]) ? m.targets[ch.key] : null;
    const all = [...vals, ...ghost, live, target].filter((v) => v != null);
    if (!all.length) {
      small(ctx, [L("aparece al hablar", "appears as you speak"), "…"], area.x + area.w / 2, area.y + area.h / 2, C.faint, {
        align: "center",
        px: 11,
        maxW: area.w - 8,
        whole: true
      });
      columnsFoot(ctx, m, cx, area, colsH, colW);
      return;
    }
    let lo = Math.min(...all);
    let hi = Math.max(...all);
    if (hi - lo < ch.minSpan) {
      const c = (hi + lo) / 2;
      lo = c - ch.minSpan / 2;
      hi = c + ch.minSpan / 2;
    }
    const padV = (hi - lo) * 0.12;
    lo -= padV;
    hi += padV;
    const yOf = (v) => area.y + area.h - ((clamp(v, lo, hi) - lo) / (hi - lo)) * area.h;
    // Labels stay inside the chart: under its title, over its column names
    const inY = (yy) => clamp(yy, area.y + 7, area.y + area.h - 7);
    // Over or under a mark by `off`, whichever stays inside the chart; the
    // side the line leaves from is avoided when both fit
    const overUnder = (yy, off, preferBelow) => {
      const up = yy - off;
      const dn = yy + off;
      const upOk = up - 7 >= area.y;
      const dnOk = dn + 7 <= area.y + area.h;
      if (upOk && dnOk) return preferBelow ? dn : up;
      if (upOk) return up;
      if (dnOk) return dn;
      return inY(yy - area.y > area.y + area.h - yy ? up : dn);
    };
    // A very short chart puts each number beside its dot
    const beside = area.h < 30;
    // Column guides
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    for (let i = 0; i < n; i++) {
      ctx.beginPath();
      ctx.moveTo(Math.round(cx(i)) + 0.5, area.y);
      ctx.lineTo(Math.round(cx(i)) + 0.5, area.y + area.h);
      ctx.stroke();
    }
    // The lead take's suggestion: your medium, a little brighter
    if (target != null && leadI >= 0) {
      const ty = yOf(target);
      const bw = Math.min(40, colW * 0.7);
      ctx.fillStyle = C.targetSoft;
      roundRect(ctx, cx(leadI) - bw / 2, ty - 5, bw, 10, 4);
      ctx.fill();
      ctx.strokeStyle = C.target;
      ctx.lineWidth = 1.5;
      roundRect(ctx, cx(leadI) - bw / 2 + 0.5, ty - 4.5, bw - 1, 9, 4);
      ctx.stroke();
      if (!o.tiny && m.i === leadI && !m.review && !beside) {
        // Above the band if free, else below or higher up: never over your
        // live ring or its number (the chip above already says "+10 %")
        const busy = [];
        if (live != null) busy.push(yOf(live), overUnder(yOf(live), 18, true));
        const free = (yy) => yy >= area.y + 6 && yy <= area.y + area.h - 6 && busy.every((b) => Math.abs(b - yy) >= 14);
        const ly = [ty - 12, ty + 14, ty - 26].find(free);
        if (ly != null) small(ctx, "+10 %", cx(leadI), ly, C.target, { align: "center", px: 10, weight: 800 });
      }
    }
    // Last cycle, faint
    linkDots(ctx, ghost, cx, yOf, C.faint, 1.2, 0.5, null, o);
    ghost.forEach((v, i) => v != null && dot(ctx, cx(i), yOf(v), 3, C.faint));
    // This cycle: a slope per channel; "about the same" is dashed and says so
    linkDots(ctx, vals, cx, yOf, C.you, 2.2, 1, beside ? null : CH_SAME[ch.key], o);
    vals.forEach((v, i) => {
      if (v == null) return;
      const x = cx(i);
      const y = yOf(v);
      dot(ctx, x, y, o.tiny ? 3.5 : 4.5, C.you);
      const px = o.tiny ? 10 : 11;
      if (beside) {
        // The last column labels to its left, inside the chart
        const onLeft = i === n - 1;
        tag(ctx, ch.fmt(v), onLeft ? x - 8 : x + 8, inY(y), C.text, { align: onLeft ? "right" : "left", px, maxW: colW / 2 - 10 });
        return;
      }
      // Centred over or under its own dot, inside its own column: below when
      // the line climbs away from it, above otherwise
      const other = i + 1 < n ? vals[i + 1] : i > 0 ? vals[i - 1] : null;
      const below = other != null && yOf(other) < y;
      tag(ctx, [ch.fmt(v), ch.bare(v)], x, overUnder(y, 13, below), C.text, { align: "center", px, maxW: colW - 8 });
    });
    if (live != null) {
      const x = cx(m.i);
      const y = yOf(live);
      ctx.fillStyle = "rgba(191, 230, 255, 0.16)";
      ctx.beginPath();
      ctx.arc(x, y, 11, 0, Math.PI * 2);
      ctx.fill();
      ringDot(ctx, x, y, o.tiny ? 4.5 : 6, C.you);
      // Under the ring (over it near the floor), inside the chart: never on
      // the title or the column names
      const px = o.tiny ? 10 : 11;
      if (beside) {
        const onLeft = m.i === n - 1;
        tag(ctx, ch.fmt(live), onLeft ? x - 14 : x + 14, inY(y), C.muted, { align: onLeft ? "right" : "left", px, weight: 700, maxW: colW / 2 - 14 });
      } else tag(ctx, [ch.fmt(live), ch.bare(live)], x, overUnder(y, 18, true), C.muted, { align: "center", px, weight: 700, maxW: colW - 6 });
    }
    columnsFoot(ctx, m, cx, area, colsH, colW);
  }

  function columnsFoot(ctx, m, cx, area, colsH, colW) {
    if (!colsH) return;
    m.takeDefs.forEach((d, i) => {
      small(ctx, [d.short, String(i + 1)], cx(i), area.y + area.h + colsH / 2 + 2, i === m.i && !m.review ? C.text : C.faint, {
        align: "center",
        px: 11,
        weight: 800,
        maxW: colW - 4
      });
    });
  }

  function linkDots(ctx, vals, cx, yOf, color, width, alpha, same, o) {
    for (let i = 1; i < vals.length; i++) {
      const a = vals[i - 1];
      const b = vals[i];
      if (a == null || b == null) continue;
      const flat = same != null && Math.abs(b - a) < same;
      ctx.strokeStyle = flat ? C.muted : color;
      ctx.lineWidth = width;
      ctx.globalAlpha = alpha;
      if (flat) ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(cx(i - 1), yOf(a));
      ctx.lineTo(cx(i), yOf(b));
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      if (flat && !o.tiny) {
        const mx = (cx(i - 1) + cx(i)) / 2;
        const my = (yOf(a) + yOf(b)) / 2;
        // Opposite the left dot's number (which sits below when the line climbs)
        const side = yOf(b) < yOf(a) ? -10 : 10;
        tag(ctx, o.compact ? "≈" : [L("≈ casi igual", "≈ about the same"), "≈"], mx, my + side, C.muted, {
          align: "center",
          px: 11,
          weight: 700,
          maxW: cx(i) - cx(i - 1) - 24
        });
      }
    }
  }

  V.scenes.volumeCount = volumeCount;
  V.scenes.volumeLadder = volumeLadder;
  V.scenes.energyTriad = energyTriad;
})(typeof window !== "undefined" ? window : globalThis);
