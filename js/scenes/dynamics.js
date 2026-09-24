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

  V.scenes.onset = onset;
  V.scenes.swell = swell;
  /** Words the modes share with the pictures (decimal comma in Spanish). */
  V.scenes.dynFmt = { db: dbText, cents: centsText, signed };
})(typeof window !== "undefined" ? window : globalThis);
