/**
 * Exercise pictures — voice drills written as data.
 *
 * The drills of Modes.voiceDrill (js/practice-modes.js) are lists of timed
 * steps in js/practice-profiles.js: straw to speech, recovery after a lot of
 * talking, clear speech, the voice-function exercises, a singer's cool-down.
 * This file draws their steps, on top of the guided panel of
 * js/scenes/guided.js (the step, what comes next, the countdown, the bar of
 * steps), and adds its painters to VTViz.guided.art.
 *
 * The rules are that file's (docs/39-EXERCISE-VISUALS.md):
 * - a drawing moves on the clock, never on the voice, and holds one still
 *   frame under reduced motion; the panel labels it "Dibujo guía, no una
 *   medida";
 * - only what the microphone hears is drawn as data: how long each sound
 *   lasted against a line (`holds`), and two takes side by side (`pair`);
 * - nothing is red and nothing is judged; a state has a word and a shape as
 *   well as a colour.
 */
(function (global) {
  "use strict";
  const V = global.VTViz;
  const G = V && V.guided;
  if (!G) return;
  const { C, L, font, clamp, roundRect, fmtSec, fmtNum } = V;
  const fit = G.fitLine;
  const TAU = Math.PI * 2;
  const ease = (x) => (1 - Math.cos(Math.PI * clamp(x, 0, 1))) / 2;

  /** The step's own clock, or the middle of the movement when motion is reduced. */
  function loopAt(info, period) {
    if (info.reduced) return 0.5;
    const t = info.t || 0;
    return (((t % period) + period) % period) / period;
  }

  /** A caption under a drawing, only where there is height for it. */
  function caption(ctx, box, text, color) {
    if (box.h < 96) return;
    ctx.fillStyle = color || C.muted;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    fit(ctx, text, box.x + box.w / 2, box.y + box.h - 1, box.w, 11, 700, 9);
  }

  const STRAW_FACE = { brow: -0.05, eye: 0.8, happy: 0, smile: 0, open: 0.1, jaw: 0, tilt: 0 };

  /**
   * A face with a straw between the lips. Rings of air leave the far end on
   * the clock: the picture says where the air goes, not how well.
   */
  function artStraw(ctx, box, info) {
    const { x, y, w, h } = box;
    const s = Math.min(h * 0.88, w * 0.5);
    const cx = x + Math.max(s * 0.42, w * 0.3);
    const cy = y + h * 0.43;
    G.drawFace(ctx, cx, cy, s, STRAW_FACE);
    const th = Math.max(4, s * 0.055);
    const len = Math.max(20, Math.min(x + w - cx - th * 7, s * 0.95));
    ctx.save();
    ctx.translate(cx, cy + s * 0.2);
    ctx.rotate(0.2);
    ctx.fillStyle = "rgba(255, 211, 110, 0.2)";
    ctx.strokeStyle = C.done;
    ctx.lineWidth = 1.5;
    roundRect(ctx, -th * 0.3, -th / 2, len, th, th / 2);
    ctx.fill();
    ctx.stroke();
    const u0 = loopAt(info, 2.4);
    ctx.strokeStyle = C.air;
    for (let i = 0; i < 3; i += 1) {
      const u = info.reduced ? (i + 1) / 4 : (u0 + i / 3) % 1;
      ctx.globalAlpha = info.reduced ? 0.7 : 1 - u;
      ctx.beginPath();
      ctx.arc(len + th * (0.8 + u * 5), 0, th * (0.35 + u * 0.6), 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    caption(ctx, box, L("el aire sale solo por la pajita", "the air leaves only through the straw"));
  }

  /** A glass of water, drawn small beside the quiet ring. */
  function glass(ctx, gx, gy, s) {
    ctx.beginPath();
    ctx.moveTo(gx - s * 0.5, gy - s);
    ctx.lineTo(gx - s * 0.38, gy + s);
    ctx.lineTo(gx + s * 0.38, gy + s);
    ctx.lineTo(gx + s * 0.5, gy - s);
    ctx.strokeStyle = C.you;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(gx - s * 0.44, gy - s * 0.2);
    ctx.lineTo(gx - s * 0.38, gy + s);
    ctx.lineTo(gx + s * 0.38, gy + s);
    ctx.lineTo(gx + s * 0.44, gy - s * 0.2);
    ctx.closePath();
    ctx.fillStyle = C.youSoft;
    ctx.fill();
  }

  /**
   * Quiet rest: a slow ring and a glass of water. The ring keeps time; it is
   * not a breathing instruction and it does not listen.
   */
  function artRest(ctx, box, info) {
    const { x, y, w, h } = box;
    const rMax = Math.min(w * 0.26, h * 0.36);
    const cx = x + w * 0.42;
    const cy = y + h * 0.42;
    const u = loopAt(info, 9);
    const k = info.reduced ? 0.6 : u < 0.5 ? ease(u * 2) : 1 - ease((u - 0.5) * 2);
    ctx.beginPath();
    ctx.arc(cx, cy, rMax * (0.6 + 0.4 * k), 0, TAU);
    ctx.fillStyle = C.airSoft;
    ctx.fill();
    ctx.setLineDash([3, 4]);
    ctx.beginPath();
    ctx.arc(cx, cy, rMax, 0, TAU);
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = C.text;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    fit(ctx, L("silencio", "quiet"), cx, cy, rMax * 1.5, h < 100 ? 11 : 13, 800, 9);
    glass(ctx, Math.min(x + w - rMax * 0.5, cx + rMax * 1.7), cy + rMax * 0.2, rMax * 0.42);
    caption(ctx, box, L("sin hablar ni susurrar · un sorbo de agua", "no talking, no whispering · a sip of water"));
  }

  /** Height of a glide at u (0 to 1), 0 low and 1 high. */
  function glideAt(kind, u) {
    if (kind === "up") return ease(u);
    if (kind === "down") return 1 - ease(u);
    return Math.sin(Math.PI * clamp(u, 0, 1));
  }

  /**
   * The shape of a glide (up, down, or up and back) with a dot travelling it
   * every six seconds: a shape to follow by ear. Pitch is not measured here.
   */
  function artGlide(ctx, box, info) {
    const { x, y, w, h } = box;
    const kind = (info.phase && info.phase.glide) || "updown";
    const top = y + (h < 90 ? 6 : 14);
    const base = y + h - (h < 96 ? 8 : 20);
    const left = x + 34;
    const right = x + w - 10;
    const px = (u) => left + u * (right - left);
    const py = (u) => base - glideAt(kind, u) * (base - top);
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(left, base + 0.5);
    ctx.lineTo(right, base + 0.5);
    ctx.stroke();
    ctx.beginPath();
    for (let i = 0; i <= 40; i += 1) {
      if (i) ctx.lineTo(px(i / 40), py(i / 40));
      else ctx.moveTo(px(0), py(0));
    }
    ctx.strokeStyle = C.target;
    ctx.lineWidth = 2.5;
    ctx.lineJoin = "round";
    ctx.stroke();
    // Five seconds along the line, one to breathe.
    const u = info.reduced ? 0.5 : clamp(loopAt(info, 6) * 1.2, 0, 1);
    ctx.beginPath();
    ctx.arc(px(u), py(u), 6, 0, TAU);
    ctx.fillStyle = C.text;
    ctx.fill();
    ctx.fillStyle = C.muted;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.font = font(10, 700);
    ctx.fillText(L("agudo", "high"), x, top - 2);
    ctx.textBaseline = "bottom";
    ctx.fillText(L("grave", "low"), x, base + 2);
    caption(ctx, box, L("suave y sin saltos · solo hasta donde sea cómodo", "soft and unbroken · only as far as is comfortable"));
  }

  /**
   * The sentence of the step in a speech bubble, one chunk a line. On a
   * "clear" step each chunk ends in a pause mark: where the sentence breaks.
   */
  function artSpeak(ctx, box, info) {
    const { x, y, w, h } = box;
    const p = info.phase || {};
    const text = G.loc(p, "say") || L("Tu frase", "Your sentence");
    const lines = text.split(" / ").slice(0, 4);
    const foot = p.clear && h >= 96 ? 16 : 0;
    const bh = h - foot - 8;
    ctx.fillStyle = "rgba(170, 195, 230, 0.07)";
    roundRect(ctx, x + 2, y + 2, w - 4, bh, 12);
    ctx.fill();
    ctx.strokeStyle = C.gridStrong;
    ctx.lineWidth = 1.2;
    roundRect(ctx, x + 2.5, y + 2.5, w - 5, bh - 1, 12);
    ctx.stroke();
    const lineH = Math.min(26, (bh - 12) / lines.length);
    const px = clamp(lineH * 0.68, 11, 17);
    const y0 = y + 2 + (bh - lineH * lines.length) / 2 + lineH / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    lines.forEach((line, i) => {
      const last = i === lines.length - 1;
      ctx.fillStyle = C.text;
      fit(ctx, p.clear && !last ? line + "  ‖" : line, x + w / 2, y0 + i * lineH, w - 24, px, 800, 10);
    });
    if (foot) {
      ctx.fillStyle = C.muted;
      ctx.textBaseline = "bottom";
      fit(ctx, L("‖ = una pausa corta", "‖ = a short pause"), x + w / 2, y + h - 1, w, 11, 700, 9);
    }
  }

  /**
   * Each sound of this step as a bar, as tall as it was long, against the
   * line of the step's goal. m (the Drill) carries holds, holdLive, minHoldMs
   * and holdHint, written by the mode.
   */
  function artHoldBars(ctx, box, info) {
    const { x, y, w, h } = box;
    const m = info.m;
    const min = (m.minHoldMs || 1500) / 1000;
    const list = (m.holds || []).filter((q) => q.step === info.index).slice(-10);
    const bars = list.map((q) => ({ len: q.len, live: false }));
    if (m.holdLive != null) bars.push({ len: m.holdLive, live: true });
    // The goal line starts two fifths of the way up; a longer sound stretches the scale
    const maxS = Math.max(min * 2.5, ...bars.map((b) => b.len * 1.15));
    const labelH = h >= 80 ? 16 : 0;
    const top = y + labelH + 14;
    const base = y + h - 6;
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
    ctx.font = font(11, 800);
    ctx.fillStyle = C.target;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(fmtSec(min), x + w, yOf(min) - 2);
    if (labelH) {
      // The sound still going counts as soon as it reaches the line
      const n = bars.filter((b) => b.len >= min).length;
      ctx.fillStyle = C.muted;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      fit(ctx, L(`De ${fmtNum(min, 1)} s o más en este paso: ${n}`, `Of ${fmtNum(min, 1)} s or more this step: ${n}`), x, y, w, 11, 800, 9);
    }
    if (!bars.length) {
      ctx.fillStyle = C.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      fit(ctx, m.holdHint || L("haz el sonido y sostenlo", "make the sound and hold it"), x + w / 2, (top + base) / 2, w, 12, 700, 10);
      return;
    }
    holdBars(ctx, bars, { x, w, base, yOf, min, floor: y + labelH + 8 });
  }

  function holdBars(ctx, bars, g) {
    const slots = 11;
    const sw = g.w / slots;
    const bw = Math.min(40, sw * 0.62);
    bars.slice(-slots).forEach((b, i) => {
      const cx = g.x + sw * (i + 0.5);
      const good = b.len >= g.min;
      const topY = g.yOf(b.len);
      const bh = Math.max(2, g.base - topY);
      ctx.fillStyle = C.you;
      ctx.globalAlpha = b.live ? 0.95 : good ? 0.75 : 0.25;
      roundRect(ctx, cx - bw / 2, topY, bw, bh, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (!good && !b.live) {
        // Shorter than the line: an outline as well as a paler fill
        ctx.strokeStyle = C.muted;
        ctx.lineWidth = 1;
        roundRect(ctx, cx - bw / 2 + 0.5, topY + 0.5, bw - 1, bh - 1, 4);
        ctx.stroke();
      }
      ctx.font = font(10, 800);
      ctx.fillStyle = good ? C.text : C.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      if (topY - 2 > g.floor) ctx.fillText((good && !b.live ? "✓ " : "") + fmtNum(b.len, 1), cx, topY - 2);
    });
  }

  /**
   * How one take of a pair stands: "got" (taken), "now" (being taken, or the
   * one this step asks for), "none" (its step went by without a sound) or
   * "later". `take` is the take with that key, if there is one.
   */
  function pairState(take, key, phase) {
    if (take && take.end != null) return "got";
    const asked = phase ? phase.compare : null;
    if (take || asked === key) return "now";
    return key === "a" && asked === "b" ? "none" : "later";
  }

  /** A slot's look: a taken one is gold with a ✓, the current one has the bright outline. */
  const PAIR_LOOK = {
    got: { fill: "rgba(255, 211, 110, 0.12)", stroke: "rgba(255, 211, 110, 0.55)", lw: 1 },
    now: { fill: "rgba(170, 195, 230, 0.06)", stroke: C.text, lw: 1.6 },
    none: { fill: "rgba(170, 195, 230, 0.03)", stroke: C.grid, lw: 1 },
    later: { fill: "rgba(170, 195, 230, 0.06)", stroke: C.grid, lw: 1 }
  };

  /** What a pair slot says under its name: its length, the running clock, "now", "then" or "no take". */
  function pairLine(m, take, state) {
    if (state === "got") return fmtSec(take.len != null ? take.len : take.end - take.start);
    if (take) return "● " + fmtSec(m.run.clock - take.start);
    if (state === "now") return L("ahora…", "now…");
    return state === "none" ? L("sin toma", "no take") : L("después", "then");
  }

  /**
   * Two takes side by side, A then B (the usual way, then the new way). m
   * carries `pair` (the takes, each with its key) and `pairLabels` (their two
   * names).
   */
  function artPair(ctx, box, info) {
    const { x, y, w, h } = box;
    const m = info.m;
    const takes = m.pair || [];
    const names = m.pairLabels || ["A", "B"];
    const gap = 10;
    const cw = (w - gap) / 2;
    const small = h < 90;
    ["a", "b"].forEach((key, i) => {
      const take = takes.find((t) => t.key === key) || null;
      const state = pairState(take, key, info.phase);
      const look = PAIR_LOOK[state];
      const cx = x + i * (cw + gap);
      ctx.fillStyle = look.fill;
      roundRect(ctx, cx, y, cw, h, 9);
      ctx.fill();
      ctx.strokeStyle = look.stroke;
      ctx.lineWidth = look.lw;
      roundRect(ctx, cx + 0.5, y + 0.5, cw - 1, h - 1, 9);
      ctx.stroke();
      ctx.fillStyle = C.text;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      fit(ctx, (state === "got" ? "✓ " : "") + `${i ? "B" : "A"} · ${names[i]}`, cx + 10, y + 8, cw - 20, small ? 13 : 15, 900, 10);
      ctx.fillStyle = C.muted;
      fit(ctx, pairLine(m, take, state), cx + 10, y + (small ? 28 : 32), cw - 20, small ? 11 : 12, 700, 9);
    });
  }

  Object.assign(G.art, {
    straw: artStraw,
    rest: artRest,
    glide: artGlide,
    speak: artSpeak,
    holdBars: artHoldBars,
    pair: artPair
  });
  /** For tests: the glide's shape and a pair slot's state, without a canvas. */
  G.glideAt = glideAt;
  G.pairState = pairState;
})(typeof window !== "undefined" ? window : globalThis);
