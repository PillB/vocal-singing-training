/**
 * Speaking-drill pictures: pauses, fillers, pace, rate.
 *
 * What the research says these should do (docs/39-EXERCISE-VISUALS.md):
 * - While you speak, one cue at a time, readable from the corner of the eye,
 *   updated slowly. Reading numbers competes with planning speech.
 * - The silence you are asked to make is the thing to show: a pause grows in
 *   real time, because the gap between how long a pause feels and how long it
 *   is can only be calibrated in the moment.
 * - After the take comes the detailed picture: a map of speech and silence,
 *   takes side by side. That is the main feedback channel.
 * - Nothing turns red for a long pause or a filler: those are information.
 */
(function (global) {
  "use strict";
  const V = global.VTViz;
  if (!V) return;
  const { C, L, font, clamp, chips, gauge, speechStrip, fmtSec, fitText, panel, label } = V;

  /**
   * Power pause — "Pausa medida".
   * model: {
   *   vad,               VTFeatures.Vad
   *   takes: [{ name, short, start, end, counted: [len…] }]
   *   current,           index of the take in progress
   *   band: [lo, hi],    the pause lengths that count (seconds)
   *   review,            true after Stop: takes side by side
   *   lastPauses: [len…] the last few closed pauses, as ghosts on the gauge
   * }
   */
  function pause(ctx, w, h, m) {
    panel(ctx, w, h);
    const pad = 10;
    // A rotated phone leaves ~100 px: drop the take chips (the take is named
    // in the headline instead) and keep the gauge and the strip
    const tiny = h < 135;
    const compact = h < 190;
    const chipH = tiny ? 0 : compact ? 26 : 36;
    if (!tiny) {
      const chipItems = m.takes.map((t, i) => ({
        label: t.name,
        short: t.short,
        sub: i < m.current || m.review ? countWords(t.counted.length) : i === m.current ? takeClock(m, t) : "",
        done: i < m.current || (m.review && t.start != null)
      }));
      chips(ctx, { x: pad, y: pad, w: w - pad * 2, h: chipH }, chipItems, {
        current: m.review ? -1 : m.current
      });
    }
    const top = tiny ? pad - 4 : pad + chipH + (compact ? 6 : 10);
    if (m.review) return reviewTakes(ctx, { x: pad, y: top, w: w - pad * 2, h: h - top - pad }, m);

    const take = m.takes[m.current];
    const vad = m.vad;
    const stripH = tiny ? 20 : compact ? 26 : 34;
    const stripY = h - pad - stripH;
    // Headline: what is happening now, in words
    const inPause = vad.state === "pause";
    const len = vad.pauseLen;
    const [lo, hi] = m.band;
    let head;
    let headColor = C.text;
    if (vad.state === "idle") head = L("Empieza a hablar cuando quieras", "Start speaking when you're ready");
    else if (!inPause) head = L("Hablando… aterriza la idea y calla", "Speaking… land the idea, then stop");
    else if (len < lo) head = L("Silencio… sostenlo", "Silence… hold it");
    else if (len <= hi) {
      head = L("✓ Pausa de poder", "✓ Power pause");
      headColor = C.target;
    } else head = L("Pausa larga: retoma cuando quieras", "Long pause: pick up when ready");
    if (tiny && take) head = take.short + " — " + head;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = headColor;
    const headY = top + (compact ? 9 : 12);
    fitText(ctx, head, pad + 2, headY, w * 0.62, compact ? 14 : 17, 800, 11);
    // The count for this take, large, on the right
    ctx.textAlign = "right";
    ctx.fillStyle = C.text;
    ctx.font = font(compact ? 18 : 24, 800, true);
    ctx.fillText(String(take ? take.counted.length : 0), w - pad - 2, headY + 1);
    if (w >= 520) {
      ctx.font = font(10, 700);
      ctx.fillStyle = C.muted;
      ctx.fillText(L("pausas en esta toma", "pauses this take"), w - pad - (compact ? 26 : 36), headY + 1, w * 0.3);
    }

    // The pause gauge: it grows while you are silent
    const gTop = headY + (tiny ? 6 : compact ? 14 : 22);
    const gH = tiny ? Math.max(30, h - pad - stripH - 8 - gTop) : compact ? 44 : 64;
    const gMax = hi + 1;
    gauge(ctx, { x: pad + 6, y: gTop, w: w - pad * 2 - 12, h: gH }, {
      lo: 0,
      hi: gMax,
      value: inPause ? Math.min(len, gMax) : null,
      bands: [{ from: lo, to: hi, label: L("pausa de poder", "power pause") + ` ${fmtRange(lo, hi)}` }],
      ghosts: (m.lastPauses || []).slice(-3).map((p) => ({ v: Math.min(p, gMax), label: "" })),
      left: "0 s",
      right: `${V.fmtNum(gMax, 0)} s+`,
      markerLabel: inPause ? fmtSec(len) : ""
    });

    // Your last pauses as bars against the band: are they all short, all
    // long, or landing where they should? The calibration the drill is for.
    const barsTop = gTop + gH + (compact ? 4 : 10);
    const barsBottom = stripY - (compact ? 6 : 20);
    if (barsBottom - barsTop >= 46) {
      pauseBars(ctx, { x: pad + 6, y: barsTop, w: w - pad * 2 - 12, h: barsBottom - barsTop }, m.lastPauses || [], lo, hi, gMax);
    }

    // Speech and silence over the last 20 seconds
    speechStrip(ctx, { x: pad, y: stripY, w: w - pad * 2, h: stripH }, vad, {
      seconds: w < 420 ? 12 : 20,
      goodPause: [lo, hi],
      minLabel: 0.3
    });
    if (!compact) {
      ctx.font = font(10, 700);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(L("habla ▬   silencio ␣   ✓ pausa de poder", "speech ▬   silence ␣   ✓ power pause"), pad + 2, stripY - 3);
    }
  }

  /** Your last pauses as bars, tallest = longest, against the band. */
  function pauseBars(ctx, box, lens, lo, hi, max) {
    const { x, y, w, h } = box;
    const labelH = 14;
    const plotH = h - labelH - 4;
    const yOf = (v) => y + labelH + plotH - (clamp(v, 0, max) / max) * plotH;
    // The band, as a horizontal stripe behind the bars
    ctx.fillStyle = C.targetSoft;
    ctx.fillRect(x, yOf(hi), w, yOf(lo) - yOf(hi));
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, y + labelH + plotH + 0.5);
    ctx.lineTo(x + w, y + labelH + plotH + 0.5);
    ctx.stroke();
    ctx.font = font(10, 700);
    ctx.fillStyle = C.faint;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText(L("tus últimas pausas", "your last pauses"), x, y);
    ctx.textAlign = "right";
    ctx.fillStyle = C.target;
    ctx.fillText(`${V.fmtNum(lo, 1)}–${V.fmtNum(hi, 0)} s`, x + w, yOf(hi) + 2);
    if (!lens.length) {
      ctx.fillStyle = C.faint;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(L("aparecen aquí al terminar cada silencio", "they appear here as each silence ends"), x + w / 2, y + labelH + plotH / 2);
      return;
    }
    const n = 8;
    const slot = w / n;
    const bw = Math.min(46, slot * 0.6);
    lens.slice(-n).forEach((len, i) => {
      const cx = x + slot * (i + 0.5);
      const top = yOf(len);
      const good = len >= lo && len <= hi;
      ctx.fillStyle = good ? C.target : C.muted;
      ctx.globalAlpha = good ? 0.9 : 0.55;
      V.roundRect(ctx, cx - bw / 2, top, bw, y + labelH + plotH - top, 4);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.font = font(10, 800);
      ctx.fillStyle = good ? C.target : C.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.fillText((good ? "✓ " : "") + V.fmtNum(len, 1), cx, top - 2);
    });
  }

  function countWords(n) {
    return L(`${n} ${n === 1 ? "pausa" : "pausas"}`, `${n} ${n === 1 ? "pause" : "pauses"}`);
  }
  function takeClock(m, t) {
    if (t.start == null) return L("pendiente", "next");
    const sec = Math.max(0, (t.end != null ? t.end : m.vad.t) - t.start);
    return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
  }
  function fmtRange(lo, hi) {
    return `${V.fmtNum(lo, 1)}–${V.fmtNum(hi, 0)} s`;
  }

  /** After Stop: each take as its own strip, so take 2 and 3 read against take 1. */
  function reviewTakes(ctx, box, m) {
    const done = m.takes.filter((t) => t.start != null);
    if (!done.length) {
      ctx.fillStyle = C.muted;
      ctx.font = font(13, 600);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(L("Sin tomas todavía.", "No takes yet."), box.x, box.y);
      return;
    }
    const rowH = Math.min(64, box.h / done.length);
    const labelW = Math.min(150, box.w * 0.3);
    done.forEach((t, i) => {
      const y = box.y + i * rowH;
      ctx.fillStyle = C.text;
      ctx.font = font(12, 800);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(t.name, box.x, y + 2, labelW - 6);
      const med = V.median(t.counted);
      ctx.fillStyle = C.muted;
      ctx.font = font(11, 600);
      ctx.fillText(
        countWords(t.counted.length) + (med != null ? " · " + L("mediana ", "median ") + fmtSec(med) : ""),
        box.x,
        y + 18,
        labelW - 6
      );
      speechStrip(
        ctx,
        { x: box.x + labelW, y: y + 4, w: box.w - labelW, h: Math.max(18, rowH - 16) },
        m.vad,
        { range: [t.start, t.end != null ? t.end : m.vad.t], goodPause: m.band, minLabel: 0.6 }
      );
    });
  }

  V.scenes.pause = pause;
})(typeof window !== "undefined" ? window : globalThis);
