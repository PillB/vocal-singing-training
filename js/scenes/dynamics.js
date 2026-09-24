/**
 * Exercise pictures — dynamics, onset and articulation (s11, s12, s14).
 * Registers painters on window.VTViz.scenes: swell, onset, articulation.
 *
 * What the research says these should do (SP/audit-out/synthesis.md §3G):
 * - Loudness in dB against the learner's own soft start, never linear RMS and
 *   never an absolute level: a phone at arm's length and a headset differ by
 *   20 dB, and every 6 dB of it can be distance.
 * - A swell is a continuous task the guide can pace, so it is drawn live
 *   against the hairpin ahead; the pitch line under it shows whether the
 *   pitch rides up with the volume.
 * - An onset is over in under 100 ms: nothing to steer while it happens, so
 *   its shape is shown after it, next to the learner's own examples.
 * - Staccato and legato differ in the gaps between notes, not in the notes:
 *   note lengths and gaps come from the raw sound edge, never from `voiced`.
 * - Abrupt, breathy, a break in the line: information with a shape and a word,
 *   never red.
 */
(function (global) {
  "use strict";
  const V = global.VTViz;
  if (!V) return;
  const { C, L, font, clamp, panel, roundRect, fitText, fmtNum, fmtSec, glyph, hatch } = V;

  /* —— shared bits —— */

  function signed(n, digits = 0) {
    const v = Number(n || 0);
    const s = fmtNum(Math.abs(v), digits);
    return (v > 0 ? "+" : v < 0 ? "−" : "±") + s;
  }
  function dbText(n) {
    return signed(n, 0) + " dB";
  }
  function centsText(n) {
    return signed(Math.round(n), 0) + "¢";
  }
  function text(ctx, s, x, y, opts = {}) {
    ctx.font = opts.font || font(11, 700);
    ctx.fillStyle = opts.color || C.muted;
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "middle";
    ctx.fillText(s, x, y, opts.max || 9999);
  }
  /** A tiny hatched swatch + words: "measured with care" notes. */
  function hatchNote(ctx, s, x, y, maxW, color = C.air) {
    ctx.font = font(10, 700);
    const tw = Math.min(ctx.measureText(s).width, maxW - 16);
    ctx.fillStyle = "rgba(6, 10, 16, 0.82)";
    roundRect(ctx, x - 3, y - 8, tw + 22, 16, 4);
    ctx.fill();
    ctx.fillStyle = hatch(ctx, color);
    ctx.fillRect(x, y - 5, 10, 10);
    ctx.fillStyle = color;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(s, x + 14, y + 0.5, maxW - 16);
  }

  /** A row of small keys (swatch + word) that wraps to what fits. */
  function legend(ctx, x, y, maxW, items) {
    let cx = x;
    ctx.font = font(10, 700);
    for (const it of items) {
      const tw = ctx.measureText(it.text).width;
      if (cx + it.w + 5 + tw > x + maxW) break;
      it.swatch(cx, y);
      text(ctx, it.text, cx + it.w + 5, y, { font: font(10, 700), color: C.faint });
      cx += it.w + 5 + tw + 14;
    }
  }

  /* ================================================================
   * s11 · Swell — "Regulador"
   * model (Modes.dynamicSwell state):
   *   level, cents   embedded VTViz.Timeline tracks (one time axis)
   *   LO, hi         the level track's dB scale, relative to your soft start
   *   floorRel       the room's floor in the same dB (null when unknown)
   *   processed      the browser evened the level out (auto gain)
   *   clipped        the raw input hit full scale
   *   done: [swell]  finished swells for the review
   *   review         true after Stop
   * ================================================================ */

  function swell(ctx, w, h, m) {
    panel(ctx, w, h);
    if (m.review) return swellReview(ctx, w, h, m);
    const tiny = h < 135;
    const compact = h < 190;
    const gap = 6;
    const levelH = tiny ? h : Math.round(h * (compact ? 0.64 : 0.63));
    const centsH = tiny ? 0 : h - levelH - gap;
    // The mode writes the pitch into the headline when there is no room for its track
    m.tiny = tiny || h - levelH - gap < 44;
    m.level.o.top = tiny ? "" : L("más fuerte", "louder");
    m.level.paintAt(ctx, 0, 0, w, levelH);
    V.paintBox(ctx, 0, 0, w, levelH, () => swellLevelAxis(ctx, w, levelH, m, tiny));
    if (centsH >= 44) {
      m.cents.paintAt(ctx, 0, levelH + gap, w, centsH);
      V.paintBox(ctx, 0, levelH + gap, w, centsH, () => swellCentsAxis(ctx, w, centsH, m));
    }
  }

  /** dB ticks against your start, the room's floor, and honest notes. */
  function swellLevelAxis(ctx, w, h, m, tiny) {
    const plot = m.level._plot;
    if (!plot) return;
    const yOf = (db) => plot.top + plot.h - clamp((db - m.LO) / (m.hi - m.LO), 0, 1) * plot.h;
    ctx.lineWidth = 1;
    const ticks = [0, 10, 20, 30].filter((d) => d < m.hi - 1);
    ticks.forEach((d) => {
      const y = Math.round(yOf(d)) + 0.5;
      ctx.strokeStyle = d === 0 ? C.gridStrong : C.grid;
      ctx.setLineDash(d === 0 ? [] : [2, 4]);
      ctx.beginPath();
      ctx.moveTo(8, y);
      ctx.lineTo(w - 8, y);
      ctx.stroke();
      ctx.setLineDash([]);
      const words = d === 0 ? L("tu inicio · 0 dB", "your start · 0 dB") : `+${d} dB`;
      if (y > plot.top + 10 && y < plot.top + plot.h - 8) {
        V.label(ctx, words, 14, y, { font: font(10, 700), color: C.faint, backColor: "rgba(11, 17, 25, 0.86)" });
      }
    });
    if (m.floorRel != null && m.floorRel > m.LO + 0.5 && m.floorRel < m.hi) {
      const y = Math.round(yOf(m.floorRel)) + 0.5;
      ctx.strokeStyle = "rgba(169, 184, 204, 0.35)";
      ctx.setLineDash([1, 3]);
      ctx.beginPath();
      ctx.moveTo(8, y);
      ctx.lineTo(w - 8, y);
      ctx.stroke();
      ctx.setLineDash([]);
      text(ctx, L("ruido de la sala", "room noise"), w - 12, y - 7, { align: "right", font: font(9, 700), color: C.faint });
    }
    const notes = [];
    if (m.processed) {
      notes.push(
        tiny
          ? L("Mic con auto-volumen: forma aprox.", "Mic auto-levels: shape approx.")
          : L(
              "Tu micrófono iguala el volumen (control automático): la subida se ve más plana de lo que suena",
              "Your mic evens out the volume (auto gain): the swell looks flatter than it sounds"
            )
      );
    }
    if (m.clipped) notes.push(L("Muy cerca del micrófono: satura", "Too close to the mic: it clips"));
    notes.forEach((s, i) => hatchNote(ctx, s, 14, plot.top + plot.h - 12 - i * 19, w - 30, C.air));
  }

  function swellCentsAxis(ctx, w, h, m) {
    const plot = m.cents._plot;
    if (!plot) return;
    const y0 = Math.round(plot.top + plot.h / 2) + 0.5;
    ctx.strokeStyle = C.gridStrong;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(8, y0);
    ctx.lineTo(w - 8, y0);
    ctx.stroke();
  }

  /** After Stop: one card per swell, the shape over its hairpin and 3 numbers. */
  function swellReview(ctx, w, h, m) {
    const pad = 10;
    const done = m.done || [];
    const tiny = h < 135;
    const counted = done.filter((s) => s.counted);
    const rises = done.map((s) => s.rise);
    const pk = done.map((s) => s.peakCents).filter((c) => c != null);
    const medRise = V.median(rises);
    const medPk = V.median(pk);
    ctx.fillStyle = C.text;
    ctx.textBaseline = "middle";
    ctx.textAlign = "left";
    const head = done.length
      ? L(
          `${counted.length} ${counted.length === 1 ? "regulador" : "reguladores"} · subida mediana ${dbText(medRise)}` +
            (medPk != null ? ` · afinación en el pico ${centsText(medPk)}` : ""),
          `${counted.length} ${counted.length === 1 ? "swell" : "swells"} · median rise ${dbText(medRise)}` +
            (medPk != null ? ` · pitch at the peak ${centsText(medPk)}` : "")
        )
      : L("Sin reguladores todavía: empieza suave, crece y vuelve", "No swells yet: start soft, grow, come back");
    fitText(ctx, head, pad, pad + 8, w - pad * 2, tiny ? 12 : 14, 800, 10);
    if (!done.length) return;
    const top = pad + (tiny ? 18 : 24);
    const legendH = tiny ? 0 : 18;
    const list = done.slice(-(w < 420 ? 4 : 6));
    const n = list.length;
    const cols = w < 420 && !tiny ? Math.min(2, n) : n;
    const rows = Math.ceil(n / cols);
    const gap = 8;
    const cw = (w - pad * 2 - gap * (cols - 1)) / cols;
    const ch = Math.min(240, (h - top - pad - legendH - gap * (rows - 1)) / rows);
    if (legendH) {
      const ly = top + rows * ch + (rows - 1) * gap + 12;
      legend(ctx, pad, ly, w - pad * 2, [
        { swatch: (x, y) => ((ctx.fillStyle = C.targetSoft), ctx.fillRect(x, y - 5, 16, 10)), w: 16, text: L("forma guía", "guide shape") },
        {
          swatch: (x, y) => {
            ctx.strokeStyle = C.you;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + 16, y);
            ctx.stroke();
          },
          w: 16,
          text: L("tu volumen", "your level")
        },
        { swatch: (x, y) => glyph(ctx, "tri", x + 5, y - 1, C.text, 4), w: 10, text: L("tu pico", "your peak") },
        { swatch: (x, y) => text(ctx, "✓", x, y, { color: C.done, font: font(11, 800) }), w: 10, text: L("contó", "counted") }
      ]);
    }
    list.forEach((s, i) => {
      const cx = pad + (i % cols) * (cw + gap);
      const cy = top + Math.floor(i / cols) * (ch + gap);
      swellCard(ctx, { x: cx, y: cy, w: cw, h: ch }, s, m, done.length - n + i + 1);
    });
  }

  function swellCard(ctx, box, s, m, num) {
    const { x, y, w, h } = box;
    ctx.fillStyle = s.counted ? "rgba(255, 211, 110, 0.08)" : "rgba(170, 195, 230, 0.06)";
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.strokeStyle = s.counted ? "rgba(255, 211, 110, 0.5)" : C.grid;
    ctx.lineWidth = 1;
    roundRect(ctx, x + 0.5, y + 0.5, w - 1, h - 1, 8);
    ctx.stroke();
    const small = h < 90;
    // Title: number + tick for a counted swell
    text(ctx, (s.counted ? "✓ " : "") + `${num}`, x + 7, y + 10, { font: font(11, 800), color: s.counted ? C.done : C.muted });
    text(ctx, fmtSec(s.dur, 1), x + w - 7, y + 10, { align: "right", font: font(10, 700), color: C.faint });
    const linesH = small ? 14 : 30;
    const plot = { x: x + 6, y: y + 20, w: w - 12, h: Math.max(20, h - 26 - linesH) };
    const lo = -6;
    const hi = Math.max(s.H + 6, s.rise + 3, 14);
    const yOf = (db) => plot.y + plot.h - clamp((db - lo) / (hi - lo), 0, 1) * plot.h;
    // The hairpin it was sung against
    ctx.beginPath();
    for (let i = 0; i <= 40; i++) {
      const u = i / 40;
      const px = plot.x + u * Math.min(1, s.D / Math.max(s.dur, s.D)) * plot.w;
      const c = (s.H * (1 - Math.cos(2 * Math.PI * u))) / 2;
      if (i) ctx.lineTo(px, yOf(c + 2.5));
      else ctx.moveTo(px, yOf(c + 2.5));
    }
    for (let i = 40; i >= 0; i--) {
      const u = i / 40;
      const px = plot.x + u * Math.min(1, s.D / Math.max(s.dur, s.D)) * plot.w;
      const c = (s.H * (1 - Math.cos(2 * Math.PI * u))) / 2;
      ctx.lineTo(px, yOf(c - 2.5));
    }
    ctx.closePath();
    ctx.fillStyle = C.targetSoft;
    ctx.fill();
    // Your level, across the whole swell
    const span = Math.max(s.dur, s.D);
    ctx.strokeStyle = C.you;
    ctx.lineWidth = 2;
    ctx.lineJoin = "round";
    ctx.beginPath();
    let pen = false;
    s.shape.forEach((v, i) => {
      if (!Number.isFinite(v)) {
        pen = false;
        return;
      }
      const px = plot.x + ((i / (s.shape.length - 1)) * s.dur * plot.w) / span;
      if (pen) ctx.lineTo(px, yOf(v));
      else ctx.moveTo(px, yOf(v));
      pen = true;
    });
    ctx.stroke();
    // Where the peak landed
    const px = plot.x + ((s.peakFrac * s.dur) / span) * plot.w;
    glyph(ctx, "tri", px, yOf(s.rise) - 9, C.text, 4);
    const words = [
      dbText(s.rise),
      L(`pico ${Math.round(s.peakFrac * 100)} %`, `peak ${Math.round(s.peakFrac * 100)}%`),
      s.peakCents != null ? L(`afin. ${centsText(s.peakCents)}`, `pitch ${centsText(s.peakCents)}`) : ""
    ].filter(Boolean);
    if (small) {
      text(ctx, words.join(" · "), x + 7, y + h - 8, { font: font(10, 700), color: C.text, max: w - 12 });
    } else {
      text(ctx, words[0] + " · " + words[1], x + 7, y + h - 22, { font: font(11, 800), color: C.text, max: w - 12 });
      const drift = s.peakCents != null && Math.abs(s.peakCents) >= 20;
      if (words[2]) {
        text(ctx, words[2] + (drift ? (s.peakCents > 0 ? L(" · subió con el volumen", " · rose with the volume") : L(" · bajó", " · dropped")) : ""), x + 7, y + h - 8, {
          font: font(10, 700),
          color: drift ? C.warn : C.muted,
          max: w - 12
        });
      }
    }
  }


  /* ================================================================
   * s12 · Onset — "Forma del ataque"
   * model (Modes.onsetReps state):
   *   phase        "contrast" (your three kinds, on purpose) | "reps"
   *   asks, step   the contrast examples asked for, and how many are in
   *   examples     { abrupt: [res], breathy: [res], balanced: [res] }
   *   examplesSeq  the contrast examples in the order they came
   *   latest       the last onset (VTFeatures.OnsetCapture result + kind2)
   *   onsets       every rep, kept
   *   counts       { balanced, breathy, abrupt, unmeasured }
   *   target       reps asked for (10)
   *   ready        "armed" | "sound" | "wait"; head (the headline)
   *   processed    the browser filters the input (noise suppression)
   *   calNote      a word about the calibration, when it could not be used
   *   review       true after Stop
   * ================================================================ */

  const KIND = {
    balanced: { color: C.target, es: "Equilibrado", en: "Balanced", short: ["equil.", "balanced"] },
    breathy: { color: C.air, es: "Soplado", en: "Breathy", short: ["soplado", "breathy"] },
    abrupt: { color: C.warn, es: "Brusco", en: "Abrupt", short: ["brusco", "abrupt"] },
    unmeasured: { color: C.faint, es: "No medido", en: "Not measured", short: ["sin medida", "no measure"] }
  };
  function kindWord(k) {
    const d = KIND[k] || KIND.unmeasured;
    return L(d.es, d.en);
  }
  function kindShort(k) {
    const d = KIND[k] || KIND.unmeasured;
    return L(d.short[0], d.short[1]);
  }
  /** The shape of each kind, without a colour: a spike, a smooth dot, hatched air. */
  function kindGlyph(ctx, k, x, y, s = 6) {
    const col = (KIND[k] || KIND.unmeasured).color;
    if (k === "abrupt") {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x - s * 0.8, y + s * 0.7);
      ctx.lineTo(x, y - s * 0.9);
      ctx.lineTo(x + s * 0.8, y + s * 0.7);
      ctx.closePath();
      ctx.fill();
    } else if (k === "breathy") {
      ctx.fillStyle = hatch(ctx, col);
      ctx.fillRect(x - s * 0.75, y - s * 0.75, s * 1.5, s * 1.5);
      ctx.strokeStyle = col;
      ctx.lineWidth = 1;
      ctx.strokeRect(x - s * 0.75 + 0.5, y - s * 0.75 + 0.5, s * 1.5 - 1, s * 1.5 - 1);
    } else if (k === "balanced") {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.7, 0, Math.PI * 2);
      ctx.fill();
    } else glyph(ctx, "cross", x, y, col, s);
  }

  /** Model shapes (0..1, 1 = 1.6 × the settled level) for when you skipped the examples. */
  const MODEL = (() => {
    const n = 136;
    const on = 16;
    const mk = (fn) => Array.from({ length: n }, (_, i) => clamp(fn((i - on) / 400), 0, 1));
    const st = 0.625;
    return {
      balanced: { shape: mk((t) => (t < 0 ? 0 : st * (1 - Math.exp(-t / 0.022)))), onsetIndex: on, leadMs: 0, overshoot: 1, model: true },
      abrupt: {
        shape: mk((t) => (t < 0 ? 0 : t < 0.005 ? (0.97 * t) / 0.005 : st + (0.97 - st) * Math.exp(-(t - 0.005) / 0.025))),
        onsetIndex: on,
        leadMs: 0,
        overshoot: 1.55,
        model: true
      },
      breathy: {
        shape: mk((t) => (t < 0 ? 0 : t < 0.18 ? 0.13 : 0.13 + (st - 0.13) * (1 - Math.exp(-(t - 0.18) / 0.05)))),
        onsetIndex: on,
        leadMs: 180,
        overshoot: 1,
        model: true
      }
    };
  })();

  /** 10 % → 90 % of the settled level, found on a drawn shape (indices). */
  function riseMarks(shape) {
    const st = 0.625;
    let i10 = -1;
    let i90 = -1;
    for (let i = 0; i < shape.length; i++) {
      if (i10 < 0 && shape[i] >= st * 0.1) i10 = i;
      if (i10 >= 0 && shape[i] >= st * 0.9) {
        i90 = i;
        break;
      }
    }
    return { i10, i90 };
  }

  /** The first ~300 ms of one onset: its envelope, the air before the tone, the spike. */
  function onsetPlot(ctx, box, res, opts = {}) {
    const { x, y, w, h } = box;
    const shape = res.shape || [];
    const n = shape.length || 136;
    const kind = opts.kind || res.kind2 || res.kind;
    const col = (KIND[kind] || KIND.balanced).color;
    const xOf = (i) => x + (i / (n - 1)) * w;
    const yOf = (v) => y + h - clamp(v, 0, 1) * h;
    const on = res.onsetIndex != null ? res.onsetIndex : 16;
    // The air heard before the tone arrived
    if (res.leadMs > 12) {
      const a = xOf(on);
      const b = xOf(Math.min(n - 1, on + (res.leadMs / 1000) * 400));
      ctx.fillStyle = hatch(ctx, C.air);
      ctx.globalAlpha = opts.faint ? 0.35 : 0.55;
      ctx.fillRect(a, y, b - a, h);
      ctx.globalAlpha = 1;
      if (opts.labels && b - a > 34) text(ctx, L("aire", "air"), (a + b) / 2, y + 8, { align: "center", font: font(10, 800), color: C.air });
    }
    if (opts.labels) {
      // The level the note settles at, and the time axis
      ctx.strokeStyle = C.gridStrong;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x, Math.round(yOf(0.625)) + 0.5);
      ctx.lineTo(x + w, Math.round(yOf(0.625)) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      text(ctx, L("nivel estable", "settled level"), x + w - 2, yOf(0.625) - 8, { align: "right", font: font(9, 700), color: C.faint });
      for (let ms = 0; ms <= 300; ms += 100) {
        const px = xOf(on + (ms / 1000) * 400);
        if (px > x + w - 2) break;
        ctx.strokeStyle = C.grid;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, y + h);
        ctx.lineTo(px, y + h + 3);
        ctx.stroke();
        text(ctx, ms ? `${ms} ms` : "0", px, y + h + 9, { align: "center", font: font(9, 700), color: C.faint });
      }
    }
    if (!shape.length) return;
    // The envelope, filled
    ctx.beginPath();
    ctx.moveTo(xOf(0), yOf(0));
    shape.forEach((v, i) => ctx.lineTo(xOf(i), yOf(v)));
    ctx.lineTo(xOf(n - 1), yOf(0));
    ctx.closePath();
    ctx.fillStyle = col;
    ctx.globalAlpha = opts.faint ? 0.12 : 0.22;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = opts.faint ? col : C.you;
    ctx.lineWidth = opts.thin ? 1.5 : 2.5;
    ctx.lineJoin = "round";
    ctx.beginPath();
    shape.forEach((v, i) => (i ? ctx.lineTo(xOf(i), yOf(v)) : ctx.moveTo(xOf(i), yOf(v))));
    ctx.stroke();
    if (!opts.labels) return;
    // The rise, 10 → 90 %
    const { i10, i90 } = riseMarks(shape);
    if (i10 >= 0 && i90 > i10) {
      const a = xOf(i10);
      const b = xOf(i90);
      const by = y + h - 6;
      ctx.strokeStyle = C.text;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(a, by - 4);
      ctx.lineTo(a, by);
      ctx.lineTo(b, by);
      ctx.lineTo(b, by - 4);
      ctx.stroke();
      text(ctx, L("subida", "rise"), b + 5, by - 3, { font: font(9, 800), color: C.muted });
    }
    // The spike above the settled level
    if (res.overshoot >= 1.15) {
      let pk = on;
      for (let i = on; i < Math.min(n, on + 40); i++) if (shape[i] > shape[pk]) pk = i;
      kindGlyph(ctx, "abrupt", xOf(pk), yOf(shape[pk]) - 9, 6);
      text(ctx, `×${fmtNum(res.overshoot, 1)}`, xOf(pk) + 9, yOf(shape[pk]) - 9, { font: font(10, 800), color: C.warn });
    }
  }

  function onsetNumbers(res) {
    if (!res || res.model) return "";
    if (res.kind2 === "unmeasured") return L("la pantalla se saltó cuadros: sin medida", "the screen skipped frames: no measure");
    return L(
      `subida ${Math.round(res.riseMs)} ms · pico ×${fmtNum(res.overshoot, 1)} · aire antes ${Math.round(res.leadMs)} ms`,
      `rise ${Math.round(res.riseMs)} ms · peak ×${fmtNum(res.overshoot, 1)} · air first ${Math.round(res.leadMs)} ms`
    );
  }

  /** The big card: the latest onset, named, with its numbers. */
  function onsetCard(ctx, box, m) {
    const { x, y, w, h } = box;
    ctx.fillStyle = "rgba(170, 195, 230, 0.05)";
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    const res = m.latest;
    const pad = 8;
    const small = h < 110;
    if (!res) {
      text(ctx, L("Aquí se dibuja cada inicio", "Each onset is drawn here"), x + w / 2, y + h / 2 - 8, {
        align: "center",
        font: font(small ? 11 : 13, 700),
        color: C.muted,
        max: w - 16
      });
      text(ctx, L("cuando termina, no mientras suena", "once it's over, not while it sounds"), x + w / 2, y + h / 2 + 10, {
        align: "center",
        font: font(10, 600),
        color: C.faint,
        max: w - 16
      });
      return;
    }
    const kind = res.kind2 || res.kind;
    const titleY = y + (small ? 10 : 14);
    kindGlyph(ctx, kind, x + pad + 6, titleY, small ? 5 : 7);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = (KIND[kind] || KIND.unmeasured).color;
    const title = res.asked ? `${kindWord(kind)} · ${L("ejemplo", "example")}` : kindWord(kind);
    fitText(ctx, title, x + pad + 18, titleY, small ? w * 0.42 : w * 0.6, small ? 13 : 17, 800, 11);
    const numbers = onsetNumbers(res);
    if (!small) text(ctx, numbers, x + pad, titleY + 18, { font: font(11, 700), color: C.text, max: w - pad * 2 });
    else text(ctx, numbers, x + w - pad, titleY, { align: "right", font: font(9, 700), color: C.muted, max: w * 0.52 });
    const top = small ? titleY + 10 : titleY + 30;
    const bottom = y + h - (small ? 6 : 18);
    if (kind === "unmeasured") return;
    onsetPlot(ctx, { x: x + pad, y: top, w: w - pad * 2, h: Math.max(20, bottom - top) }, res, { labels: !small, kind });
  }

  /** Your three examples (or the model shapes); the kind of the latest onset is outlined. */
  function examplesStrip(ctx, box, m, vertical) {
    const kinds = ["breathy", "balanced", "abrupt"];
    const n = kinds.length;
    const gap = 6;
    const cw = vertical ? box.w : (box.w - gap * (n - 1)) / n;
    const ch = vertical ? (box.h - gap * (n - 1)) / n : box.h;
    const cur = m.latest && !m.latest.asked ? m.latest.kind2 : null;
    kinds.forEach((k, i) => {
      const x = box.x + (vertical ? 0 : i * (cw + gap));
      const y = box.y + (vertical ? i * (ch + gap) : 0);
      const ex = (m.examples?.[k] || []).slice(-1)[0];
      const res = ex || MODEL[k];
      ctx.fillStyle = "rgba(170, 195, 230, 0.05)";
      roundRect(ctx, x, y, cw, ch, 7);
      ctx.fill();
      if (k === cur) {
        ctx.strokeStyle = C.text;
        ctx.lineWidth = 1.5;
        roundRect(ctx, x + 0.75, y + 0.75, cw - 1.5, ch - 1.5, 7);
        ctx.stroke();
      }
      kindGlyph(ctx, k, x + 11, y + 11, 5);
      text(ctx, kindWord(k), x + 20, y + 11, { font: font(11, 800), color: KIND[k].color, max: cw * 0.5 });
      const tag = ex ? L("tu ejemplo", "your example") : m.phase === "contrast" ? L("pendiente", "to do") : L("referencia", "reference");
      if (cw >= 110) text(ctx, tag, x + cw - 6, y + 11, { align: "right", font: font(9, 700), color: C.faint, max: cw * 0.4 });
      if (ch >= 40) {
        const py = y + 21;
        const ph = ch - 26;
        if (!ex && m.phase === "contrast") {
          ctx.strokeStyle = C.grid;
          ctx.lineWidth = 1;
          ctx.setLineDash([3, 3]);
          roundRect(ctx, x + 6, py, cw - 12, ph, 4);
          ctx.stroke();
          ctx.setLineDash([]);
        } else onsetPlot(ctx, { x: x + 6, y: py, w: cw - 12, h: ph }, res, { faint: !ex, thin: true, kind: k });
      }
    });
  }

  /** The tray: one small glyph per onset, kept (contrast: the six examples asked for). */
  function onsetTray(ctx, box, m) {
    const { x, y, w, h } = box;
    const contrast = m.phase === "contrast";
    let items;
    if (contrast) {
      items = m.asks.map((k, i) => ({ kind: k, res: i < m.step ? m.examplesSeq[i] : null, cur: i === m.step }));
    } else {
      const all = m.onsets.map((r, i) => ({ kind: r.kind2, res: r, num: i + 1 }));
      items = all.slice(-m.target);
      for (let i = items.length; i < m.target; i++) items.push({ kind: null, res: null, cur: i === items.length, num: all.length + i - items.length + 1 });
      // the slots still to come are numbered from what is already there
      let next = all.length + 1;
      items.forEach((it) => {
        if (!it.res) it.num = next++;
      });
    }
    const n = items.length;
    const rows = h >= 70 && n > 6 && w / n < 64 ? 2 : 1;
    const perRow = Math.ceil(n / rows);
    const gap = 4;
    const cw = (w - gap * (perRow - 1)) / perRow;
    const ch = (h - gap * (rows - 1)) / rows;
    items.forEach((it, i) => {
      const cx = x + (i % perRow) * (cw + gap);
      const cy = y + Math.floor(i / perRow) * (ch + gap);
      const done = !!it.res;
      ctx.fillStyle = done ? "rgba(170, 195, 230, 0.08)" : "rgba(170, 195, 230, 0.03)";
      roundRect(ctx, cx, cy, cw, ch, 6);
      ctx.fill();
      ctx.strokeStyle = it.cur ? C.text : done ? C.grid : "rgba(170, 195, 230, 0.16)";
      ctx.lineWidth = it.cur ? 1.5 : 1;
      if (!done) ctx.setLineDash([3, 3]);
      roundRect(ctx, cx + 0.5, cy + 0.5, cw - 1, ch - 1, 6);
      ctx.stroke();
      ctx.setLineDash([]);
      const k = done ? it.res.kind2 || it.kind : it.kind;
      const withPlot = done && it.res.shape && ch >= 34 && k !== "unmeasured";
      if (withPlot) onsetPlot(ctx, { x: cx + 3, y: cy + 3, w: cw - 6, h: ch - 17 }, it.res, { thin: true, kind: k });
      if (k) {
        const gy = withPlot || ch >= 34 ? cy + ch - 8 : cy + ch / 2;
        kindGlyph(ctx, k, cx + 8, gy, 4);
        if (cw >= 40) text(ctx, kindShort(k), cx + 15, gy, { font: font(9, 800), color: done ? (KIND[k] || KIND.unmeasured).color : C.faint, max: cw - 18 });
      } else if (cw >= 18) {
        text(ctx, String(it.num), cx + cw / 2, cy + ch / 2, { align: "center", font: font(9, 700), color: C.faint });
      }
    });
  }

  function onsetHead(ctx, x, y, w, m, size) {
    // The ready light: armed (a filled dot), sounding (a ringed dot), or waiting (a ring)
    const r = size >= 15 ? 6 : 5;
    const cx = x + r + 1;
    if (m.ready === "armed") {
      ctx.fillStyle = C.target;
      ctx.beginPath();
      ctx.arc(cx, y, r, 0, Math.PI * 2);
      ctx.fill();
    } else if (m.ready === "sound") {
      ctx.fillStyle = C.you;
      ctx.beginPath();
      ctx.arc(cx, y, r - 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = C.you;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, y, r + 2, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = C.faint;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, y, r - 0.5, 0, Math.PI * 2);
      ctx.stroke();
    }
    const count =
      m.phase === "contrast"
        ? L(`Ejemplos ${m.step}/${m.asks.length}`, `Examples ${m.step}/${m.asks.length}`)
        : L(`Equilibrados ${m.counts.balanced}/${m.target}`, `Balanced ${m.counts.balanced}/${m.target}`);
    ctx.font = font(size - 1, 800, true);
    const cwid = ctx.measureText(count).width;
    text(ctx, count, x + w, y, { align: "right", font: font(size - 1, 800, true), color: C.text });
    ctx.fillStyle = C.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    fitText(ctx, m.head || "", x + r * 2 + 8, y, Math.max(60, w - cwid - r * 2 - 22), size, 800, 10);
  }

  function onset(ctx, w, h, m) {
    panel(ctx, w, h);
    if (m.review) return onsetReview(ctx, w, h, m);
    const pad = 10;
    const tiny = h < 135;
    const compact = h < 190;
    const narrow = w < 520;
    const headY = pad + (tiny ? 4 : 9);
    onsetHead(ctx, pad, headY, w - pad * 2, m, tiny ? 13 : narrow ? 14 : 16);
    let top = headY + (tiny ? 10 : 16);
    const notes = [];
    if (m.processed) notes.push(L("Tu micrófono filtra ruido: el aire antes del tono puede no verse", "Your mic filters noise: air before the tone may not show"));
    if (m.calNote) notes.push(m.calNote);
    if (!compact && notes.length) {
      notes.forEach((s, i) => hatchNote(ctx, s, pad + 4, top + 7 + i * 18, w - pad * 2 - 8, C.air));
      top += notes.length * 18 + 2;
    }
    const bottom = h - pad;
    if (compact) {
      // Card left, tray right
      const cardW = Math.round((w - pad * 3) * (tiny ? 0.46 : 0.55));
      onsetCard(ctx, { x: pad, y: top, w: cardW, h: bottom - top }, m);
      onsetTray(ctx, { x: pad * 2 + cardW, y: top, w: w - pad * 3 - cardW, h: bottom - top }, m);
      return;
    }
    const trayH = narrow ? Math.min(92, Math.round((bottom - top) * 0.27)) : Math.min(62, Math.round((bottom - top) * 0.24));
    const trayY = bottom - trayH;
    const bodyB = trayY - 20;
    text(
      ctx,
      m.phase === "contrast" ? L("tus seis ejemplos", "your six examples") : L("tus inicios (se quedan todos)", "your onsets (every one stays)"),
      pad,
      trayY - 9,
      { font: font(10, 700), color: C.faint, max: w - pad * 2 }
    );
    if (narrow) {
      const exH = Math.min(80, Math.round((bodyB - top) * 0.34));
      const cardH = bodyB - top - exH - 6;
      onsetCard(ctx, { x: pad, y: top, w: w - pad * 2, h: cardH }, m);
      examplesStrip(ctx, { x: pad, y: top + cardH + 6, w: w - pad * 2, h: exH }, m, false);
    } else {
      const cardW = Math.round((w - pad * 3) * 0.62);
      onsetCard(ctx, { x: pad, y: top, w: cardW, h: bodyB - top }, m);
      examplesStrip(ctx, { x: pad * 2 + cardW, y: top, w: w - pad * 3 - cardW, h: bodyB - top }, m, true);
    }
    onsetTray(ctx, { x: pad, y: trayY, w: w - pad * 2, h: trayH }, m);
  }

  /** After Stop: the tray is the replay, with each kind counted and its median. */
  function onsetReview(ctx, w, h, m) {
    const pad = 10;
    const tiny = h < 135;
    const c = m.counts;
    const total = c.balanced + c.breathy + c.abrupt;
    const head = total
      ? L(
          `${c.balanced} ${c.balanced === 1 ? "equilibrado" : "equilibrados"} · ${c.breathy} ${c.breathy === 1 ? "soplado" : "soplados"} · ${c.abrupt} ${c.abrupt === 1 ? "brusco" : "bruscos"}` +
            (c.unmeasured ? ` · ${c.unmeasured} sin medida` : ""),
          `${c.balanced} balanced · ${c.breathy} breathy · ${c.abrupt} abrupt` + (c.unmeasured ? ` · ${c.unmeasured} not measured` : "")
        )
      : m.step
        ? L(`${m.step} ejemplos grabados; sin repeticiones todavía`, `${m.step} examples in; no reps yet`)
        : L("Sin inicios todavía: parte del silencio y di «a»", "No onsets yet: start from silence and say 'ah'");
    ctx.fillStyle = C.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    fitText(ctx, head, pad, pad + 9, w - pad * 2, tiny ? 13 : 15, 800, 10);
    let y = pad + (tiny ? 20 : 26);
    if (!tiny) {
      const meds = ["balanced", "breathy", "abrupt"]
        .map((k) => {
          const rs = m.onsets.filter((r) => r.kind2 === k);
          if (!rs.length) return "";
          return `${kindWord(k)} ${Math.round(V.median(rs.map((r) => r.riseMs)))} ms`;
        })
        .filter(Boolean)
        .join(" · ");
      if (meds) {
        text(ctx, L("subida mediana — ", "median rise — ") + meds, pad, y, { font: font(11, 700), color: C.muted, max: w - pad * 2 });
        y += 18;
      }
    }
    const all = m.onsets.map((r) => ({ kind: r.kind2, res: r }));
    if (!all.length) {
      if (!tiny) examplesStrip(ctx, { x: pad, y: y + 4, w: w - pad * 2, h: Math.min(110, h - y - pad - 4) }, m, false);
      return;
    }
    // Tiles as large as the box allows, never taller than wide
    const gap = 5;
    const aw = w - pad * 2;
    const ah = h - y - pad;
    let perRow = Math.max(5, Math.min(10, Math.floor(aw / 64)));
    let ch = 0;
    for (let pr = 3; pr <= 12; pr++) {
      const rows = Math.ceil(all.length / pr);
      const cw = (aw - gap * (pr - 1)) / pr;
      const c2 = Math.min(cw / 1.25, (ah - gap * (rows - 1)) / rows, 130);
      if (c2 > ch + 0.5) {
        ch = c2;
        perRow = pr;
      }
    }
    if (ch < 26) ch = Math.max(26, Math.min(70, ah / Math.ceil(all.length / perRow)));
    const cw = (aw - gap * (perRow - 1)) / perRow;
    const fit = Math.max(1, Math.floor((ah + gap) / (ch + gap)));
    const shown = all.slice(-fit * perRow);
    shown.forEach((it, i) => {
      const cx = pad + (i % perRow) * (cw + gap);
      const cy = y + Math.floor(i / perRow) * (ch + gap);
      ctx.fillStyle = "rgba(170, 195, 230, 0.07)";
      roundRect(ctx, cx, cy, cw, ch, 6);
      ctx.fill();
      if (it.res.shape && it.kind !== "unmeasured" && ch >= 34) {
        onsetPlot(ctx, { x: cx + 3, y: cy + 3, w: cw - 6, h: ch - 17 }, it.res, { thin: true, kind: it.kind });
      }
      const gy = ch >= 34 ? cy + ch - 8 : cy + ch / 2;
      kindGlyph(ctx, it.kind, cx + 8, gy, 4);
      text(ctx, kindShort(it.kind), cx + 15, gy, { font: font(9, 800), color: (KIND[it.kind] || KIND.unmeasured).color, max: cw - 18 });
    });
  }


  /* ================================================================
   * s14 · Staccato / legato — "Rollo de articulación"
   * model (Modes.staccatoLegato state):
   *   phases: [{ label, sec, kind }]   kind "staccato" | "legato"
   *   phaseIdx, remaining, phaseKind, allDone
   *   runs: [run]   every stretch of sound, from the raw edge:
   *     { t0, t1 (null while open), phaseIdx, kind, notes (pitch steps),
   *       hammer (fast attack, or null when not measured), breakBefore,
   *       dip (deepest level dip inside, dB) }
   *   t             the take's clock (s)
   *   medMidi       your pitch centre (median of your notes)
   *   notesOf(run)  the run's notes [{ t0, t1, midi|null }]
   *   stats(i)      the numbers of phase i
   *   review        true after Stop
   * ================================================================ */

  const ART = {
    staccato: { es: "Staccato", en: "Staccato", mark: "· · ·" },
    legato: { es: "Legato", en: "Legato", mark: "———" }
  };

  /** The model of an articulation, drawn as outlines: what to aim for, not a pacer. */
  function artModel(ctx, x, yMid, span, pxPerSec, kind, maxX) {
    const step = Math.min(10, span * 0.3);
    ctx.strokeStyle = C.target;
    ctx.fillStyle = C.targetSoft;
    ctx.lineWidth = 1.5;
    if (kind === "legato") {
      let cx = x;
      const levels = [1, 0, -1];
      ctx.beginPath();
      levels.forEach((lv, i) => {
        const y = yMid - lv * step;
        const x2 = Math.min(maxX, cx + 0.5 * pxPerSec);
        if (i) ctx.lineTo(cx, y);
        else ctx.moveTo(cx, y);
        ctx.lineTo(x2, y);
        cx = x2;
      });
      ctx.lineWidth = 7;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = C.targetSoft;
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = C.target;
      ctx.setLineDash([4, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.lineCap = "butt";
      return cx;
    }
    let cx = x;
    [1, 0, -1].forEach((lv) => {
      const w = Math.max(6, 0.18 * pxPerSec);
      if (cx + w > maxX) return;
      const y = yMid - lv * step;
      roundRect(ctx, cx, y - 4, w, 8, 4);
      ctx.fill();
      ctx.setLineDash([3, 2]);
      ctx.stroke();
      ctx.setLineDash([]);
      cx += w + Math.max(6, 0.27 * pxPerSec);
    });
    return cx;
  }

  function artChips(ctx, box, m) {
    // Narrow: the phases to come are their marks alone (· · · or ———)
    const narrow = box.w / Math.max(1, m.phases.length) < 110;
    const items = m.phases.map((p, i) => {
      const k = ART[p.kind] || ART.staccato;
      const cur = i === m.phaseIdx && !m.allDone;
      const mm = Math.floor(Math.max(0, m.remaining) / 60);
      const ss = String(Math.floor(Math.max(0, m.remaining) % 60)).padStart(2, "0");
      return {
        label: narrow && !cur ? k.mark : `${L(k.es, k.en)} ${k.mark}`,
        short: k.mark,
        sub: cur ? `${mm}:${ss}` : "",
        done: i < m.phaseIdx || m.allDone
      };
    });
    V.chips(ctx, box, items, { current: m.allDone ? -1 : m.phaseIdx, frac: m.phases[m.phaseIdx] ? 1 - m.remaining / m.phases[m.phaseIdx].sec : 1 });
  }

  /** One run of sound: its notes as pills (joined when they are one line). */
  function drawRun(ctx, run, notes, xOf, yOf, opts) {
    const ph = opts.pillH;
    const t1 = run.t1 != null ? run.t1 : opts.now;
    const x0 = xOf(run.t0);
    const x1 = xOf(t1);
    if (x1 < opts.left || x0 > opts.right) return;
    let prevY = null;
    let prevX = null;
    notes.forEach((nt, i) => {
      if (nt.glide) {
        // The way from one note to the next: a slanted line; a slow one is a slide
        const next = notes[i + 1];
        const a = xOf(nt.t0);
        const b = xOf(nt.t1 != null ? nt.t1 : t1);
        const y0 = prevY != null ? prevY : yOf(null);
        const y1 = next && next.midi != null ? yOf(next.midi) : y0;
        ctx.strokeStyle = C.you;
        ctx.lineWidth = Math.max(2, ph * 0.4);
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(a, y0);
        ctx.lineTo(b, y1);
        ctx.stroke();
        ctx.lineCap = "butt";
        if (nt.slide && opts.lengths && a >= opts.left && b <= opts.right) {
          text(ctx, L("deslizado", "slide"), (a + b) / 2, Math.min(y0, y1) - ph / 2 - 6, { align: "center", font: font(9, 800), color: C.warn });
        }
        prevY = y1;
        prevX = b;
        return;
      }
      const a = clamp(xOf(nt.t0), opts.left, opts.right);
      const b = clamp(xOf(nt.t1 != null ? nt.t1 : t1), opts.left, opts.right);
      const y = nt.midi != null ? yOf(nt.midi) : prevY != null ? prevY : yOf(null);
      // Joined notes of one line: a vertical step from the last one
      if (prevY != null && prevX != null && Math.abs(prevX - a) < 3) {
        ctx.fillStyle = C.you;
        ctx.fillRect(a - 1.5, Math.min(prevY, y) - ph / 2 + 2, 3, Math.abs(prevY - y) + ph - 4);
      }
      if (nt.midi != null) {
        ctx.fillStyle = C.you;
        roundRect(ctx, a, y - ph / 2, Math.max(3, b - a), ph, ph / 2);
        ctx.fill();
      } else {
        // No reliable pitch (too short): an outline, not a guessed note
        ctx.strokeStyle = C.you;
        ctx.lineWidth = 1.5;
        roundRect(ctx, a + 0.75, y - ph / 2 + 0.75, Math.max(3, b - a - 1.5), ph - 1.5, ph / 2);
        ctx.stroke();
      }
      prevY = y;
      prevX = b;
    });
    if (run.hammer && x0 >= opts.left) {
      const ny = notes[0] && notes[0].midi != null ? yOf(notes[0].midi) : yOf(null);
      kindGlyph(ctx, "abrupt", x0 + 3, ny - ph / 2 - 7, 5);
    }
    if (opts.lengths && run.t1 != null && run.t1 - run.t0 < 0.8 && x1 - x0 >= 0 && x0 >= opts.left) {
      const ny = notes[0] && notes[0].midi != null ? yOf(notes[0].midi) : yOf(null);
      const y = ny + ph / 2 + 9;
      if (opts.labelEnd == null || x0 > opts.labelEnd + 4) {
        const s = fmtNum(run.t1 - run.t0, 2).replace(/^0/, "");
        text(ctx, s, x0, y, { font: font(9, 700), color: C.muted });
        ctx.font = font(9, 700);
        opts.labelEnd = x0 + ctx.measureText(s).width;
      }
    }
  }

  /** The roll: your notes over time; ahead of now, the articulation to aim for. */
  function artRoll(ctx, box, m) {
    const { x, y, w, h } = box;
    const reduced = V.reducedMotion();
    const seconds = clamp(w / 110, 4.5, 9);
    const nowAt = 0.7;
    const secPerPx = seconds / w;
    let nowX;
    let tLeft;
    if (reduced) {
      const page = seconds * nowAt;
      const inPage = m.t % page;
      tLeft = m.t - inPage;
      nowX = x + inPage / secPerPx;
    } else {
      nowX = x + w * nowAt;
      tLeft = m.t - (nowX - x) * secPerPx;
    }
    const xOf = (t) => x + (t - tLeft) / secPerPx;
    const ph = h < 90 ? 8 : 12;
    // Pitch: semitones against your own centre
    let range = 6;
    const vis = m.runs.filter((r) => (r.t1 == null ? m.t : r.t1) >= tLeft);
    const visNotes = vis.map((r) => ({ r, notes: m.notesOf(r) }));
    if (m.medMidi != null) {
      visNotes.forEach(({ notes }) =>
        notes.forEach((n) => {
          if (n.midi != null) range = Math.max(range, Math.min(12, Math.abs(n.midi - m.medMidi) + 1));
        })
      );
    }
    const top = y + 14;
    const bot = y + h - 16;
    const yOf = (midi) => {
      if (midi == null || m.medMidi == null) return (top + bot) / 2;
      return (top + bot) / 2 - clamp((midi - m.medMidi) / range, -1, 1) * ((bot - top) / 2);
    };
    ctx.fillStyle = "rgba(170, 195, 230, 0.04)";
    roundRect(ctx, x, y, w, h, 8);
    ctx.fill();
    ctx.fillStyle = "rgba(143, 211, 255, 0.045)";
    ctx.fillRect(nowX, y, x + w - nowX, h);
    // Lanes every two semitones; your centre a little stronger
    for (let s = -range; s <= range; s += 2) {
      const ly = Math.round((top + bot) / 2 - (s / range) * ((bot - top) / 2)) + 0.5;
      ctx.strokeStyle = s === 0 ? C.gridStrong : C.grid;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x + 4, ly);
      ctx.lineTo(x + w - 4, ly);
      ctx.stroke();
    }
    if (h >= 90) {
      text(ctx, L("agudo", "higher"), x + 6, y + 8, { font: font(9, 700), color: C.faint });
      text(ctx, L("grave", "lower"), x + 6, y + h - 8, { font: font(9, 700), color: C.faint });
    }
    // Ahead of now: the articulation to aim for, and where the phase changes
    const pxPerSec = 1 / secPerPx;
    const future = (x + w - nowX) * secPerPx;
    const cur = m.phases[m.phaseIdx];
    if (cur && !m.allDone) {
      const ahead = nowX + 14;
      const change = m.remaining < future - 0.3 ? nowX + m.remaining * pxPerSec : null;
      const lim = change != null ? change - 8 : x + w - 8;
      if (lim - ahead > 30) {
        text(ctx, L("así", "like this"), ahead, top - 4, { font: font(9, 800), color: C.target });
        artModel(ctx, ahead, (top + bot) / 2, (bot - top) / 2, pxPerSec, cur.kind, lim);
      }
      const nxt = m.phases[m.phaseIdx + 1];
      if (change != null && nxt) {
        ctx.strokeStyle = C.done;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(change, y + 3);
        ctx.lineTo(change, y + h - 3);
        ctx.stroke();
        ctx.setLineDash([]);
        const k = ART[nxt.kind] || ART.staccato;
        text(ctx, `${L(k.es, k.en)} ▸`, change + 5, top - 4, { font: font(10, 800), color: C.done, max: x + w - change - 8 });
        if (x + w - change > 44) artModel(ctx, change + 8, (top + bot) / 2, (bot - top) / 2, pxPerSec, nxt.kind, x + w - 6);
      }
    }
    // Phase changes behind now
    m.phases.forEach((p, i) => {
      if (i === 0 || p.startT == null) return;
      const px = xOf(p.startT);
      if (px < x || px > nowX) return;
      ctx.strokeStyle = C.gridStrong;
      ctx.setLineDash([3, 4]);
      ctx.beginPath();
      ctx.moveTo(px, y + 3);
      ctx.lineTo(px, y + h - 3);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    // Your notes
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, nowX - x + 1, h);
    ctx.clip();
    const opts = { pillH: ph, now: m.t, left: x, right: nowX, lengths: h >= 90, labelEnd: null };
    let prev = null;
    visNotes.forEach(({ r, notes }) => {
      drawRun(ctx, r, notes, xOf, yOf, opts);
      // A break inside a legato line: a notch in the gap, with its word
      if (r.breakBefore && prev && prev.t1 != null) {
        const gx = (xOf(prev.t1) + xOf(r.t0)) / 2;
        const pn = m.notesOf(prev);
        const gy = yOf(pn.length ? pn[pn.length - 1].midi : null);
        if (gx > x && gx < nowX) {
          glyph(ctx, "notch", gx, gy - ph / 2 - 8, C.warn, 5);
          text(ctx, L("corte", "break"), gx, gy + ph / 2 + 9, { align: "center", font: font(9, 800), color: C.warn });
        }
      }
      prev = r;
    });
    ctx.restore();
    // Now
    ctx.strokeStyle = "rgba(238, 243, 250, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(nowX, y + 2);
    ctx.lineTo(nowX, y + h - 2);
    ctx.stroke();
  }

  function artStatsLine(m, i, short) {
    const s = m.stats(i);
    const p = m.phases[i];
    if (!p) return "";
    if (p.kind === "legato") {
      if (!s.lines) return L("Aún sin líneas: une las notas sin parar el sonido", "No lines yet: join the notes without stopping the sound");
      return L(
        `${s.lines} ${s.lines === 1 ? "línea" : "líneas"} · ${s.breaks} ${s.breaks === 1 ? "corte" : "cortes"}` +
          (s.slides ? ` · ${s.slides} ${s.slides === 1 ? "deslizado" : "deslizados"}` : "") +
          (s.dip != null && s.dip >= 2 && !short ? ` · caída máx ${fmtNum(s.dip, 0)} dB` : "") +
          (s.longest ? ` · la más larga ${fmtSec(s.longest)}` : ""),
        `${s.lines} ${s.lines === 1 ? "line" : "lines"} · ${s.breaks} ${s.breaks === 1 ? "break" : "breaks"}` +
          (s.slides ? ` · ${s.slides} ${s.slides === 1 ? "slide" : "slides"}` : "") +
          (s.dip != null && s.dip >= 2 && !short ? ` · deepest dip ${fmtNum(s.dip, 0)} dB` : "") +
          (s.longest ? ` · longest ${fmtSec(s.longest)}` : "")
      );
    }
    if (!s.notes) return L("Aún sin notas: cortas, con silencio entre ellas", "No notes yet: short, with silence between");
    return L(
      `${s.notes} ${s.notes === 1 ? "nota" : "notas"} · largo mediano ${fmtSec(s.medLen, 2)}` + (s.medGap != null ? ` · silencio mediano ${fmtSec(s.medGap, 2)}` : "") + (s.hammers ? ` · ${s.hammers} de golpe ▲` : ""),
      `${s.notes} ${s.notes === 1 ? "note" : "notes"} · median length ${fmtSec(s.medLen, 2)}` + (s.medGap != null ? ` · median gap ${fmtSec(s.medGap, 2)}` : "") + (s.hammers ? ` · ${s.hammers} hammered ▲` : "")
    );
  }

  function articulation(ctx, w, h, m) {
    panel(ctx, w, h);
    if (m.review) return artReview(ctx, w, h, m);
    const pad = 10;
    const tiny = h < 135;
    const compact = h < 190;
    let y = pad;
    if (!tiny) {
      const chipH = compact ? 26 : 34;
      artChips(ctx, { x: pad, y, w: w - pad * 2, h: chipH }, m);
      y += chipH + (compact ? 6 : 10);
    }
    // Headline: what to do in this phase, and its one number
    const cur = m.phases[m.phaseIdx];
    const kind = cur ? cur.kind : "staccato";
    const s = m.stats(m.phaseIdx);
    let head = m.allDone
      ? L("Fases completas: sigue si quieres", "Phases done: carry on if you like")
      : kind === "legato"
        ? L("Legato: une las notas en una sola línea", "Legato: join the notes into one line")
        : L("Staccato: notas cortas, con silencio entre ellas", "Staccato: short notes, silence between");
    if (tiny && cur) {
      const mm = Math.floor(Math.max(0, m.remaining) / 60);
      const ss = String(Math.floor(Math.max(0, m.remaining) % 60)).padStart(2, "0");
      head = `${mm}:${ss} · ${head}`;
    }
    const big = kind === "legato" ? (s.current != null ? fmtSec(s.current) : s.longest ? fmtSec(s.longest) : "—") : s.medLen != null ? fmtSec(s.medLen, 2) : "—";
    const bigWord = kind === "legato" ? L("línea", "line") : L("largo mediano", "median length");
    const hy = y + (tiny ? 6 : 10);
    ctx.font = font(tiny ? 15 : 20, 800, true);
    const bw = ctx.measureText(big).width;
    text(ctx, big, w - pad, hy, { align: "right", font: font(tiny ? 15 : 20, 800, true), color: C.text });
    let wordW = 0;
    if (w >= 420) {
      ctx.font = font(10, 700);
      wordW = ctx.measureText(bigWord).width + 8;
      text(ctx, bigWord, w - pad - bw - 8, hy + 1, { align: "right", font: font(10, 700), color: C.muted });
    }
    ctx.fillStyle = C.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    fitText(ctx, head, pad, hy, w - pad * 2 - bw - wordW - 12, tiny ? 13 : compact ? 14 : 16, 800, 10);
    y = hy + (tiny ? 10 : 16);
    const statsH = tiny ? 0 : 16;
    artRoll(ctx, { x: pad, y, w: w - pad * 2, h: h - y - pad - statsH }, m);
    if (m.processed && !tiny) {
      // Auto gain lifts the tails and the room between notes
      text(ctx, L("mic procesado: largos y silencios aprox.", "processed mic: lengths and gaps approx."), w - pad - 6, y + 8, {
        align: "right",
        font: font(9, 800),
        color: C.warn
      });
    }
    if (statsH) {
      text(ctx, artStatsLine(m, m.phaseIdx, w < 420), pad, h - pad - 6, { font: font(11, 700), color: C.muted, max: w - pad * 2 });
    }
  }

  /**
   * Every note's length on one scale (log, 0,05–4 s): staccato dots should
   * sit in "short", legato lines in "long". The contrast is the gap between
   * the two clusters.
   */
  function lengthScale(ctx, box, m) {
    const { x, y, w, h } = box;
    const lo = 0.05;
    const hi = 4;
    const ax = x + (w < 420 ? 8 : 92);
    const aw = x + w - 10 - ax;
    const xOf = (v) => ax + (Math.log(clamp(v, lo, hi) / lo) / Math.log(hi / lo)) * aw;
    ctx.fillStyle = "rgba(170, 195, 230, 0.05)";
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();
    const laneTop = y + 16;
    const axisY = y + h - 14;
    const laneH = (axisY - 4 - laneTop) / 2;
    // Zones with words: short, long
    const zone = (a, b, word) => {
      ctx.fillStyle = "rgba(52, 178, 122, 0.10)";
      ctx.fillRect(xOf(a), laneTop - 2, xOf(b) - xOf(a), axisY - laneTop);
      text(ctx, word, (xOf(a) + xOf(b)) / 2, y + 8, { align: "center", font: font(9, 800), color: C.target });
    };
    zone(0.08, 0.45, L("corto", "short"));
    zone(1.2, hi, L("largo", "long"));
    // Axis
    ctx.strokeStyle = C.gridStrong;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(ax, axisY + 0.5);
    ctx.lineTo(ax + aw, axisY + 0.5);
    ctx.stroke();
    [0.1, 0.2, 0.5, 1, 2].forEach((v) => {
      const tx = Math.round(xOf(v)) + 0.5;
      ctx.beginPath();
      ctx.moveTo(tx, axisY - 2);
      ctx.lineTo(tx, axisY + 3);
      ctx.stroke();
      text(ctx, v < 1 ? fmtNum(v, 1) : fmtNum(v, 0), tx, axisY + 8, { align: "center", font: font(9, 700), color: C.faint });
    });
    text(ctx, "s", ax + aw + 4, axisY + 8, { font: font(9, 700), color: C.faint });
    const lanes = [
      { kind: "staccato", y: laneTop + laneH * 0.5 },
      { kind: "legato", y: laneTop + laneH * 1.5 }
    ];
    lanes.forEach((ln) => {
      const k = ART[ln.kind];
      if (w >= 420) text(ctx, `${L(k.es, k.en)} ${k.mark}`, x + 8, ln.y, { font: font(10, 800), color: C.muted, max: ax - x - 12 });
      const runs = m.runs.filter((r) => r.kind === ln.kind && r.t1 != null);
      runs.forEach((r, i) => {
        const px = xOf(r.t1 - r.t0);
        // A little spread so equal lengths do not hide each other
        const jy = ln.y + (((i * 7) % 5) - 2) * Math.min(2.5, laneH / 10);
        ctx.fillStyle = C.you;
        if (ln.kind === "staccato") {
          ctx.beginPath();
          ctx.arc(px, jy, 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(px - 6, jy - 1.5, 12, 3);
        }
      });
      if (w < 420 && runs.length) {
        text(ctx, k.mark, x + 4, ln.y, { font: font(9, 800), color: C.faint });
      }
    });
  }

  /** After Stop: one row per phase you sang, its notes and its numbers; then every length on one scale. */
  function artReview(ctx, w, h, m) {
    const pad = 10;
    const tiny = h < 135;
    const rows = m.phases.map((p, i) => ({ p, i, runs: m.runs.filter((r) => r.phaseIdx === i) })).filter((r) => r.runs.length);
    ctx.fillStyle = C.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    const off = m.pitchOffset();
    const head = rows.length
      ? L("Staccato frente a legato", "Staccato against legato") +
        (off != null ? L(` · afinación del staccato ${centsText(off)} aprox.`, ` · staccato pitch ${centsText(off)} approx.`) : "")
      : L("Sin notas todavía", "No notes yet");
    fitText(ctx, head, pad, pad + 9, w - pad * 2, tiny ? 13 : 15, 800, 10);
    if (!rows.length) return;
    const top = pad + (tiny ? 20 : 26);
    const avail = h - top - pad;
    const scaleH = !tiny && avail >= 170 ? clamp(avail * 0.34, 70, 110) : 0;
    const rowsAvail = avail - (scaleH ? scaleH + 10 : 0);
    const narrow = w < 420;
    const rowH = Math.min(tiny ? 60 : narrow ? 120 : 110, rowsAvail / rows.length);
    const labelW = narrow ? 0 : Math.min(190, w * 0.24);
    rows.forEach((row, k) => {
      const ry = top + k * rowH;
      const kd = ART[row.p.kind] || ART.staccato;
      text(ctx, `${row.p.label} ${kd.mark}`, pad, ry + 9, { font: font(12, 800), color: C.text, max: labelW ? labelW - 8 : w - pad * 2 });
      if (labelW) {
        ctx.font = font(11, 700);
        ctx.fillStyle = C.muted;
        V.wrapText(ctx, artStatsLine(m, row.i, true), pad, ry + 26, labelW - 10, 13, Math.max(1, Math.floor((rowH - 28) / 13)));
      } else {
        text(ctx, artStatsLine(m, row.i, true), pad, ry + rowH - 12, { font: font(10, 700), color: C.muted, max: w - pad * 2 });
      }
      // Up to the last 10 s of the phase, as a strip
      const end = row.runs[row.runs.length - 1].t1 || m.t;
      const from = Math.max(row.runs[0].t0, end - 10);
      const bx = pad + labelW;
      const bw = w - pad - bx;
      const by = labelW ? ry + 4 : ry + 18;
      const bh = labelW ? rowH - 12 : rowH - 38;
      if (bh < 14) return;
      ctx.fillStyle = "rgba(170, 195, 230, 0.05)";
      roundRect(ctx, bx, by, bw, bh, 6);
      ctx.fill();
      const span = Math.max(1, end - from);
      const xOf = (t) => bx + 6 + ((t - from) / span) * (bw - 12);
      const all = row.runs.flatMap((r) => m.notesOf(r)).map((n) => n.midi).filter((v) => v != null);
      const med = all.length ? V.median(all) : null;
      const rng = all.length ? Math.max(3, ...all.map((v) => Math.abs(v - med) + 0.5)) : 3;
      const yOf = (midi) => (midi == null || med == null ? by + bh / 2 : by + bh / 2 - clamp((midi - med) / rng, -1, 1) * (bh / 2 - 8));
      const opts = { pillH: clamp(bh / 6, 6, 11), now: end, left: bx + 2, right: bx + bw - 2, lengths: false };
      let prev = null;
      row.runs.forEach((r) => {
        if ((r.t1 || end) < from) return;
        drawRun(ctx, r, m.notesOf(r), xOf, yOf, opts);
        if (r.breakBefore && prev && prev.t1 != null && prev.t1 >= from) {
          const gx = (xOf(prev.t1) + xOf(r.t0)) / 2;
          glyph(ctx, "notch", gx, by + 8, C.warn, 4);
        }
        prev = r;
      });
    });
    if (scaleH) {
      const sy = top + rows.length * rowH + 10;
      lengthScale(ctx, { x: pad, y: sy, w: w - pad * 2, h: Math.min(scaleH, h - pad - sy) }, m);
    }
  }

  V.scenes.articulation = articulation;
  V.scenes.onset = onset;
  V.scenes.swell = swell;
  /** Words the modes share with the pictures (decimal comma in Spanish). */
  V.scenes.dynFmt = { db: dbText, cents: centsText, signed };
})(typeof window !== "undefined" ? window : globalThis);
