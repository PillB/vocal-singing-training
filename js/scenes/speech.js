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

/**
 * Speaking-drill pictures, part two: pace and timing.
 *
 *   rateLadder   v1  diction rate ladder: a staircase of your own pace
 *   fillerRounds v11 filler-free rounds: a pause ring, tap marks, round map
 *   paceRiver    v14 pace for impact: your pace over time, key-point anchors
 *   topicRibbon  v8  metaphor topics: a card, a one-minute fluency ribbon
 *   turns        v6  curiosity loops: your turns against imagined listening
 *   beads        v3  count to 60: a bead pacer filled by your voice
 *
 * What a microphone can and cannot tell (docs/39-EXERCISE-VISUALS.md):
 * - Pace is syllables per second from peaks in the loudness envelope. It
 *   undercounts fast connected speech, so it is only ever shown against the
 *   learner's own baseline and marked "aprox.".
 * - It cannot tell which word was said. A filler is only visible as a
 *   sustained, flat, voiced sound ("eee", "mmm"); "o sea", "like", "este"
 *   are the learner's to notice. Such counts are "aprox." and never red.
 * - While speaking, one slow cue; the detailed map comes after Stop.
 */
(function (global) {
  "use strict";
  const V = global.VTViz;
  if (!V) return;
  const { C, L, font, clamp, chips, speechStrip, fmtSec, fitText, panel, glyph, roundRect } = V;

  function frameDt(frame) {
    return clamp(((frame && frame.dtMs) || 16) / 1000, 0, 0.1);
  }
  function dbOf(rms) {
    return rms > 1e-7 ? 20 * Math.log10(rms) : -140;
  }
  /** 112 % (Spanish keeps the space) / 112% */
  function pct(rel) {
    const n = Math.round(rel * 100);
    return L(`${n} %`, `${n}%`);
  }
  /** Countdown clock 0:52 (rounded up) */
  function clockUp(sec) {
    const s = Math.max(0, Math.ceil(sec || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  /** Elapsed clock 1:05 (rounded down) */
  function clockDown(sec) {
    const s = Math.max(0, Math.floor(sec || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }
  function mean(a) {
    return a.length ? a.reduce((s, v) => s + v, 0) / a.length : null;
  }
  function quantile(a, p) {
    if (!a.length) return null;
    const s = a.slice().sort((x, y) => x - y);
    const i = clamp((s.length - 1) * p, 0, s.length - 1);
    const lo = Math.floor(i);
    const hi = Math.ceil(i);
    return s[lo] + (s[hi] - s[lo]) * (i - lo);
  }

  /* —— Measures —— */

  /**
   * Syllable rate, split into named stretches (a rung, a take, a round).
   * Each stretch keeps its own syllable count and speaking time, so its
   * rate is the whole stretch's rather than a noisy few seconds; a sample of
   * the windowed rate every second of speech keeps the spread for the map
   * after Stop, and a 4 Hz trace keeps the shape over time.
   */
  class RateTrack {
    constructor(opts = {}) {
      const F = global.VTFeatures;
      this.sr = new F.SyllableRate({ windowSec: opts.windowSec || 4 });
      this.t = 0;
      this.bins = [];
      this.cur = null;
      this.trace = []; // { t, rate | null } at 4 Hz
      this._traceAcc = 0;
      this._sampleAcc = 0;
      this._lastPeak = null;
      this.quietMs = 1e9;
    }
    /** Start a new stretch; later syllables count toward it. */
    begin(key) {
      if (this.cur) this.cur.end = this.t;
      this.cur = { key, peaks: 0, speech: 0, samples: [], start: this.t, end: null };
      this.bins.push(this.cur);
      return this.cur;
    }
    end() {
      if (this.cur) this.cur.end = this.t;
      this.cur = null;
    }
    feed(frame) {
      const dt = frameDt(frame);
      this.t += dt;
      this.quietMs = frame.sounding ? 0 : this.quietMs + dt * 1000;
      const st0 = this.sr.speechT;
      this.sr.feed(frame);
      const dSt = Math.max(0, this.sr.speechT - st0);
      const ap = this.sr.allPeaks;
      const last = ap.length ? ap[ap.length - 1] : null;
      const newPeak = last != null && last !== this._lastPeak;
      if (newPeak) this._lastPeak = last;
      const b = this.cur;
      if (b) {
        b.speech += dSt;
        if (newPeak) b.peaks += 1;
      }
      this._sampleAcc += dSt;
      if (this._sampleAcc >= 1) {
        this._sampleAcc -= 1;
        const r = this.sr.rate;
        if (b && r != null) b.samples.push(r);
      }
      this._traceAcc += dt;
      if (this._traceAcc >= 0.25) {
        this._traceAcc = 0;
        this.trace.push({ t: this.t, rate: this.talking ? this.sr.rate : null });
        if (this.trace.length > 4000) this.trace.shift();
      }
      return newPeak;
    }
    /** Talking now: sound within the last quarter second (the dips between words do not stop it). */
    get talking() {
      return this.quietMs < 250;
    }
    /** Windowed rate (syllables per talking second), or null early on. */
    get rate() {
      return this.sr.rate;
    }
    /** A stretch's rate, once it has `minSpeech` seconds of talking. */
    static binRate(b, minSpeech = 3) {
      return b && b.speech >= minSpeech ? b.peaks / b.speech : null;
    }
  }

  /**
   * A value shown slowly: the target moves only when the mode says so (at the
   * end of a phrase, or every few seconds of talking), and the shown value
   * eases toward it — or jumps, with reduced motion.
   */
  class SlowValue {
    constructor(tau = 0.7) {
      this.tau = tau;
      this.target = null;
      this.shown = null;
    }
    set(v) {
      this.target = v;
      if (this.shown == null || v == null || V.reducedMotion()) this.shown = v;
    }
    step(dt) {
      if (this.target == null || this.shown == null) return this.shown;
      if (V.reducedMotion()) this.shown = this.target;
      else this.shown += (this.target - this.shown) * (1 - Math.exp(-dt / this.tau));
      return this.shown;
    }
    reset() {
      this.target = null;
      this.shown = null;
    }
  }

  /** Mean length of the speech runs (between pauses) inside [from, to]. */
  function meanRun(vad, from, to) {
    const runs = [];
    (vad?.segments || []).forEach((g) => {
      if (g.kind !== "speech") return;
      const end = g.end != null ? g.end : vad.t;
      if (g.start >= from - 0.05 && end <= to + 0.05 && end - g.start >= 0.3) runs.push(end - g.start);
    });
    return runs.length >= 2 ? mean(runs) : null;
  }

  /* —— v1 · Rate ladder —— */

  // Relative pace axis: 70 % … 180 % of your own baseline
  const AX_LO = 0.7;
  const AX_HI = 1.8;

  /**
   * Diction rate ladder — "Escalera de ritmo".
   * A staircase of four rungs. The first rung measures your own comfortable
   * over-articulated pace (100 %); each higher rung is a tread a step above
   * it. While you read, one slow dot shows where your pace stands on the
   * current rung, readable from the corner of the eye; after Stop each rung
   * shows the pace you actually read at, and how often you breathed.
   * model: {
   *   rungs: [{ num, name, word, sec, lo, hi, mid, start, end, rel, samples, run }]
   *   current, remaining, frac, done, review,
   *   base (syll/s) | null, calib 0..1, live (relative, eased) | null,
   *   state: "idle"|"calib"|"low"|"in"|"high"|"pause", vad
   * }
   */
  function rateLadder(ctx, w, h, m) {
    panel(ctx, w, h);
    const pad = 10;
    const tiny = h < 135;
    const compact = h < 190;
    const R = m.rungs;
    const review = !!m.review;
    const chipH = tiny ? 0 : compact ? 26 : 36;
    if (!tiny) {
      const wide = w >= 560;
      chips(
        ctx,
        { x: pad, y: pad, w: w - pad * 2, h: chipH },
        R.map((r, i) => ({
          label: wide ? r.name : i === m.current && !review && !m.done ? `${r.num} · ${r.word}` : r.num,
          short: r.num,
          sub: rungSub(m, r, i),
          done: r.end != null && r.rel != null
        })),
        { current: review || m.done ? -1 : m.current, frac: review || m.done ? null : m.frac }
      );
    }
    const top = tiny ? pad - 2 : pad + chipH + (compact ? 6 : 10);
    const headY = top + (tiny ? 8 : compact ? 9 : 12);
    const head = ladderHead(m, tiny);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = head.color;
    fitText(ctx, head.text, pad + 2, headY, w * (review ? 0.94 : 0.64), compact ? 14 : 17, 800, 10);
    if (!review) {
      // The rung's own clock, large, on the right; what comes next beside it
      ctx.textAlign = "right";
      ctx.fillStyle = C.text;
      ctx.font = font(compact ? 16 : 22, 800, true);
      const big = m.done ? "✓" : clockUp(m.remaining);
      ctx.fillText(big, w - pad - 2, headY + 1);
      const nxt = R[m.current + 1];
      if (nxt && !m.done && w >= 480) {
        const bw = ctx.measureText(big).width;
        ctx.font = font(10, 700);
        ctx.fillStyle = m.remaining <= 6 ? C.text : C.muted;
        ctx.fillText(L("siguiente: ", "next: ") + nxt.name, w - pad - bw - 12, headY + 1, w * 0.28);
      }
    }
    const stripBlock = !tiny && !compact && !review && h >= 230 ? 40 : 0;
    const boxTop = headY + (tiny ? 9 : compact ? 13 : 20);
    const box = { x: pad, y: boxTop, w: w - pad * 2, h: h - boxTop - pad - stripBlock };
    stairs(ctx, box, m, { tiny, compact, review });
    if (stripBlock) {
      const sy = h - pad - 24;
      ctx.font = font(10, 700);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillText(L("habla ▬   respiración ␣ (segundos)", "speech ▬   breath ␣ (seconds)"), pad + 2, sy - 3);
      speechStrip(ctx, { x: pad, y: sy, w: w - pad * 2, h: 24 }, m.vad, { seconds: w < 420 ? 12 : 20, minLabel: 0.35 });
    }
  }

  function rungSub(m, r, i) {
    if (r.end != null) return r.rel != null ? pct(r.rel) : "—";
    if (i === m.current && !m.review && !m.done) return clockUp(m.remaining);
    return `${Math.round(r.sec)} s`;
  }

  /** The headline: what is happening now, in words, with a glyph. */
  function ladderHead(m, tiny) {
    const r = m.rungs[Math.min(m.current, m.rungs.length - 1)];
    const pre = tiny && r && !m.review ? (m.done ? L("Libre", "Free") : r.num) + " · " : "";
    if (m.review) {
      const seq = m.rungs.filter((x) => x.rel != null).map((x) => Math.round(x.rel * 100));
      if (!seq.length)
        return {
          text: L("Sin ritmo medido todavía: lee en voz alta unos segundos.", "No pace measured yet: read aloud for a few seconds."),
          color: C.muted
        };
      return {
        text: L("Tu escalera, aprox.: ", "Your ladder, approx.: ") + seq.join(" → ") + L(" %", "%"),
        color: C.text
      };
    }
    const s = m.state;
    if (m.done && s !== "idle" && s !== "calib") {
      return { text: pre + L("Escalera lista · mezcla libre", "Ladder done · free mix"), color: C.done };
    }
    if (s === "idle") return { text: pre + L("Lee en voz alta, sobre-articulando", "Read aloud, over-articulating"), color: C.text };
    if (s === "calib") return { text: pre + L("Ritmo cómodo: midiendo tu base…", "Comfortable pace: measuring your baseline…"), color: C.text };
    if (s === "base") return { text: pre + L("Tu ritmo base · cómodo", "Your baseline · comfortable"), color: C.text };
    if (s === "in") return { text: pre + L("✓ En el peldaño", "✓ On the rung"), color: C.target };
    if (s === "low") return { text: pre + L("▲ Un poco más rápido", "▲ A little faster"), color: C.you };
    if (s === "high") return { text: pre + L("▼ Más rápido que el peldaño", "▼ Faster than the rung"), color: C.you };
    return { text: pre + L("Respira…", "Breathe…"), color: C.muted };
  }

  /** The staircase: one column per rung, its tread, and where you stand. */
  function stairs(ctx, box, m, o) {
    const { x, y, w, h } = box;
    const R = m.rungs;
    const n = R.length || 1;
    const axisW = o.tiny || w < 380 ? 0 : 62;
    const labH = o.tiny ? 0 : o.review && w >= 520 ? 30 : 18;
    const px = x + axisW;
    const pw = w - axisW;
    const ph = Math.max(20, h - labH);
    const yOf = (v) => y + ph - ((clamp(v, AX_LO, AX_HI) - AX_LO) / (AX_HI - AX_LO)) * ph;
    const colW = pw / n;
    const cur = o.review ? -1 : Math.min(m.current, n - 1);
    ctx.fillStyle = "rgba(170, 195, 230, 0.04)";
    roundRect(ctx, px, y, pw, ph, 6);
    ctx.fill();
    if (cur >= 0) {
      ctx.fillStyle = "rgba(143, 211, 255, 0.08)";
      roundRect(ctx, px + cur * colW + 2, y, colW - 4, ph, 6);
      ctx.fill();
    }
    // The staircase silhouette through the middle of each tread
    ctx.strokeStyle = C.target;
    ctx.globalAlpha = 0.45;
    ctx.lineWidth = 2;
    ctx.beginPath();
    R.forEach((r, i) => {
      const x0 = px + i * colW;
      if (i === 0) ctx.moveTo(x0 + 4, yOf(r.mid));
      else ctx.lineTo(x0, yOf(r.mid));
      ctx.lineTo(x0 + colW - (i === n - 1 ? 4 : 0), yOf(r.mid));
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
    // Treads: the band that counts for each rung. Ahead of you they are
    // outlines (what comes next); yours and the ones behind are filled.
    R.forEach((r, i) => {
      const x0 = px + i * colW + 6;
      const tw = colW - 12;
      const yt = yOf(r.hi);
      const yb = yOf(r.lo);
      const ahead = o.review ? r.start == null : i > m.current;
      if (!ahead) {
        ctx.fillStyle = C.targetSoft;
        roundRect(ctx, x0, yt, tw, yb - yt, 5);
        ctx.fill();
      }
      ctx.strokeStyle = C.target;
      ctx.lineWidth = i === cur ? 2 : 1.2;
      if (ahead) ctx.setLineDash([5, 4]);
      roundRect(ctx, x0 + 0.5, yt + 0.5, tw - 1, yb - yt - 1, 5);
      ctx.stroke();
      ctx.setLineDash([]);
    });
    // Your baseline: 100 %
    const yb1 = yOf(1);
    ctx.strokeStyle = C.gridStrong;
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(px, yb1 + 0.5);
    ctx.lineTo(px + pw, yb1 + 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
    // Axis words: what up and down mean, and the baseline
    if (axisW) {
      ctx.font = font(10, 700);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(L("▲ más rápido", "▲ faster"), x, y + 2, axisW - 4);
      ctx.textBaseline = "bottom";
      ctx.fillText(L("▼ más lento", "▼ slower"), x, y + ph - 2, axisW - 4);
      ctx.textBaseline = "middle";
      ctx.fillStyle = C.muted;
      ctx.fillText(L("tu base", "your base"), x, yb1, axisW - 4);
      ctx.font = font(9, 700);
      ctx.fillStyle = C.faint;
      ctx.fillText(L("sílabas/s aprox.", "syll/s approx."), x, yb1 + 13, axisW - 4);
    }
    // Rungs you have read: the pace you actually read at, as a gold tread
    R.forEach((r, i) => {
      if (r.rel == null) return;
      if (!o.review && !(r.end != null || i < m.current)) return;
      const cx = px + i * colW + colW / 2;
      const bw = Math.min(colW * 0.62, 120);
      if (o.review && r.samples && r.samples.length && m.base) {
        // The spread: one faint dot per second of reading
        ctx.fillStyle = C.you;
        ctx.globalAlpha = 0.35;
        r.samples.forEach((s, k) => {
          const jx = ((k * 37) % 17) / 17 - 0.5;
          ctx.beginPath();
          ctx.arc(cx + jx * bw * 0.8, yOf(s / m.base), 2.2, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.globalAlpha = 1;
      }
      const yy = yOf(r.rel);
      const inBand = r.rel >= r.lo && r.rel <= r.hi;
      ctx.fillStyle = C.done;
      roundRect(ctx, cx - bw / 2, yy - 2.5, bw, 5, 2.5);
      ctx.fill();
      ctx.font = font(o.tiny ? 10 : 11, 800);
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      const txt = (inBand ? "✓ " : "") + pct(r.rel);
      const ty = yy - 5 < y + 12 ? yy + 18 : yy - 5;
      ctx.fillText(txt, cx, ty, colW - 6);
    });
    // Calibrating: the first rung fills a ring while it learns your pace
    if (!o.review && m.state === "calib" && m.current === 0) {
      const cx = px + colW / 2;
      const rr = clamp(Math.min(colW, ph) * 0.2, 9, 22);
      const cy = clamp(yOf(1), y + rr + 4, y + ph - rr - 4);
      V.ring(ctx, cx, cy, rr, m.calib || 0, { color: C.you, width: o.tiny ? 3 : 4 });
    }
    // You, now: one dot on the current rung, eased and slow
    if (!o.review && m.live != null && m.base) {
      const i = Math.min(m.current, n - 1);
      const cx = px + i * colW + colW / 2;
      const v = m.live;
      const out = v < AX_LO || v > AX_HI;
      const yy = yOf(v);
      ctx.globalAlpha = m.state === "pause" ? 0.45 : 1;
      ctx.fillStyle = "rgba(191, 230, 255, 0.18)";
      ctx.beginPath();
      ctx.arc(cx, yy, o.tiny ? 10 : 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = C.you;
      if (out) {
        glyph(ctx, v > AX_HI ? "up" : "tri", cx, v > AX_HI ? yy + 6 : yy - 6, C.you, 8);
      } else {
        ctx.beginPath();
        ctx.arc(cx, yy, o.tiny ? 5.5 : 7.5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    // Rung numbers under the columns (inside them, on a rotated phone)
    R.forEach((r, i) => {
      const cx = px + i * colW + colW / 2;
      ctx.textAlign = "center";
      if (o.tiny) {
        ctx.font = font(10, 800);
        ctx.fillStyle = i === cur ? C.text : C.faint;
        ctx.textBaseline = "bottom";
        ctx.fillText(r.num, px + i * colW + 12, y + ph - 2);
        return;
      }
      ctx.textBaseline = "top";
      ctx.font = font(12, 800);
      ctx.fillStyle = i === cur ? C.text : r.rel != null ? C.done : C.muted;
      ctx.fillText(L("Ritmo ", "Rate ") + r.num, cx, y + ph + 4, colW - 4);
      if (o.review && labH >= 30 && r.run != null) {
        ctx.font = font(10, 600);
        ctx.fillStyle = C.muted;
        ctx.fillText(L("respiras cada ~", "a breath every ~") + fmtSec(r.run), cx, y + ph + 18, colW - 4);
      }
    });
  }

  /* —— Shared: a strip of speech and silence that pages under reduced motion —— */

  /**
   * The last `seconds` of speech and silence with a "now" line. With reduced
   * motion it does not scroll: a page fills left to right, then a fresh page.
   * Returns the time → x mapping so marks can be drawn on it.
   */
  function timeStrip(ctx, box, vad, seconds, opts = {}) {
    const t = vad.t;
    let from = t - seconds;
    if (V.reducedMotion()) from = Math.floor(t / seconds) * seconds;
    const range = [from, from + seconds];
    speechStrip(ctx, box, vad, Object.assign({}, opts, { range }));
    const xOf = (tt) => box.x + ((tt - from) / seconds) * box.w;
    const nx = Math.min(box.x + box.w, xOf(t));
    ctx.strokeStyle = "rgba(238, 243, 250, 0.55)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(nx, box.y - 3);
    ctx.lineTo(nx, box.y + box.h + 3);
    ctx.stroke();
    return { xOf, from, to: from + seconds, now: t };
  }

  /** Mark shapes for taps and hints: ▽ caught, ■ paused instead, ○ possible hesitation. */
  function mark(ctx, kind, x, y, s = 6) {
    if (kind === "noted") {
      glyph(ctx, "tri", x, y, C.text, s);
    } else if (kind === "replaced") {
      glyph(ctx, "square", x, y, C.target, s);
    } else if (kind === "hes") {
      ctx.strokeStyle = C.muted;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x, y, s * 0.62, 0, Math.PI * 2);
      ctx.stroke();
    } else if (kind === "star") {
      glyph(ctx, "star", x, y, C.done, s + 1);
    } else if (kind === "flag") {
      glyph(ctx, "flag", x, y, C.text, s);
    } else if (kind === "anchor") {
      glyph(ctx, "flag", x, y, C.done, s);
    } else glyph(ctx, "dot", x, y, C.muted, s);
  }

  /* —— v11 · Filler-free rounds —— */

  /**
   * A possible hesitation sound: a voiced stretch that holds one pitch and
   * one level for 0.4–1.6 s — "eee", "mmm", a drawn-out "queee" — instead of
   * moving syllable by syllable as words do (Goto-style: no transcript, so no
   * word is ever named). A held vowel in a word looks the same, so every
   * count built on it is "aprox." and only ever a hint.
   */
  class Hesitations {
    constructor(opts = {}) {
      this.minSec = opts.minSec || 0.4;
      this.maxSec = opts.maxSec || 1.6;
      this.maxSemis = opts.maxSemis || 0.8;
      this.dipDb = opts.dipDb || 5;
      this.onFound = opts.onFound || null;
      this.reset();
    }
    reset() {
      this.t = 0;
      this.run = null;
      this.gapMs = 0;
      this._s = null;
      this.found = [];
    }
    feed(frame) {
      const dt = frameDt(frame);
      this.t += dt;
      const db = dbOf(frame.rms || 0);
      const a = 1 - Math.exp(-(dt * 1000) / 40);
      this._s = this._s == null ? db : this._s + a * (db - this._s);
      const f = frame.rawFreq;
      if (!frame.sounding || !f || f < 60) {
        this.gapMs += dt * 1000;
        if (this.run && this.gapMs > 70) this._close();
        return;
      }
      this.gapMs = 0;
      const midi = 69 + 12 * Math.log2(f / 440);
      const r = this.run;
      if (!r) {
        this.run = { t0: this.t - dt, mids: [midi], peak: this._s, lastT: this.t };
        return;
      }
      const med = quantile(r.mids.slice(-7), 0.5);
      // An octave slip of the detector: skip the frame, keep the run
      if (Math.abs(midi - med) > 6) {
        r.lastT = this.t;
        return;
      }
      const moved = Math.abs(midi - med) > this.maxSemis * 1.5;
      const dipped = this._s < r.peak - this.dipDb;
      if (moved || dipped) {
        this._close();
        this.run = { t0: this.t - dt, mids: [midi], peak: this._s, lastT: this.t };
        return;
      }
      r.mids.push(midi);
      r.peak = Math.max(r.peak, this._s);
      r.lastT = this.t;
    }
    _close() {
      const r = this.run;
      this.run = null;
      if (!r) return;
      const len = r.lastT - r.t0;
      if (len < this.minSec || len > this.maxSec) return;
      const m = mean(r.mids);
      const sd = Math.sqrt(mean(r.mids.map((v) => (v - m) * (v - m))));
      if (sd > this.maxSemis) return;
      const hit = { t: r.t0, len };
      this.found.push(hit);
      if (this.found.length > 200) this.found.shift();
      if (this.onFound) this.onFound(hit);
    }
  }

  /**
   * Kill the fillers — "Rondas sin relleno".
   * Round 1 is awareness (tap ▽ when you catch a filler), rounds 2–3 the
   * competing response (close the mouth and pause; tap ■). While speaking the
   * one cue is the pause ring, which fills as a silence grows to the length
   * that replaces a filler; the strip under it carries your taps and, as
   * hollow circles, possible hesitation sounds (aprox.). After Stop every
   * round is a row, so round 2 and 3 read against round 1.
   * model: {
   *   rounds: [{ name, short, sec, start, end, noted:[t], replaced:[t], hes:[{t,len}], talk }]
   *   current, remaining, frac, done, review, goal (s), vad
   * }
   */
  function fillerRounds(ctx, w, h, m) {
    panel(ctx, w, h);
    const pad = 10;
    const tiny = h < 135;
    const compact = h < 190;
    const chipH = tiny ? 0 : compact ? 26 : 36;
    if (!tiny) {
      chips(
        ctx,
        { x: pad, y: pad, w: w - pad * 2, h: chipH },
        m.rounds.map((r, i) => ({
          label: r.name,
          short: r.short,
          sub: r.end != null ? `▽ ${r.noted.length} · ■ ${r.replaced.length}` : i === m.current && !m.review ? clockUp(m.remaining) : `${Math.round(r.sec / 60)} min`,
          done: r.end != null
        })),
        { current: m.review ? -1 : m.current, frac: m.review ? null : m.frac }
      );
    }
    const top = tiny ? pad - 2 : pad + chipH + (compact ? 6 : 10);
    if (m.review) return fillerReview(ctx, { x: pad, y: top, w: w - pad * 2, h: h - top - pad }, m, compact);
    const vad = m.vad;
    const r = m.rounds[m.current];
    const headY = top + (tiny ? 8 : compact ? 9 : 12);
    // Headline: what to do now, in words
    const inPause = vad.state === "pause";
    const len = vad.pauseLen;
    let head;
    let color = C.text;
    if (m.done) {
      head = L("Tres rondas listas: Detener muestra el mapa", "Three rounds done: Stop shows the map");
      color = C.done;
    } else if (inPause && len >= m.goal) {
      head = L(`✓ Pausa de ${fmtSec(len)}`, `✓ ${fmtSec(len)} pause`);
      color = C.target;
    } else if (inPause && len > 0.25) head = L("Pausa… sostenla", "Pause… hold it");
    else if (m.current === 0) head = L("Habla de tu tema · toca ▽ al notar un relleno", "Talk on your topic · tap ▽ when you catch a filler");
    else head = L("¿Viene un relleno? Cierra la boca y pausa", "Filler coming? Close your mouth and pause");
    if (tiny && r) head = r.short + " · " + head;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = color;
    fitText(ctx, head, pad + 2, headY, w * 0.72, compact ? 14 : 17, 800, 10);
    ctx.textAlign = "right";
    ctx.fillStyle = C.text;
    ctx.font = font(compact ? 16 : 22, 800, true);
    ctx.fillText(m.done ? "✓" : clockUp(m.remaining), w - pad - 2, headY + 1);

    // The pause ring and the strip: side by side when there is width,
    // stacked on a phone held upright
    const bodyTop = headY + (tiny ? 10 : compact ? 16 : 24);
    const bodyH = h - bodyTop - pad;
    const stacked = !tiny && w < 460 && bodyH > 170;
    const legend = !tiny && !compact;
    let ringR;
    let ringBox;
    let stripBox;
    if (stacked) {
      // Upright phone: the ring in the upper part, the strip and its legend below
      const lower = 34 + 14 + 40;
      ringR = clamp(Math.min((bodyH - lower - 30) * 0.42, w * 0.22), 30, 70);
      const ringZone = bodyH - lower;
      ringBox = { cx: w / 2, cy: bodyTop + ringZone / 2 - 8 };
      stripBox = { x: pad, y: bodyTop + ringZone + 14, w: w - pad * 2, h: 34 };
    } else {
      ringR = tiny ? clamp(bodyH / 2 - 2, 14, 30) : clamp(Math.min(bodyH * 0.34, w * 0.09), 22, 58);
      const ringW = ringR * 2 + (tiny ? 16 : 40);
      ringBox = { cx: pad + ringW / 2, cy: bodyTop + bodyH / 2 - (tiny ? 0 : 8) };
      const sh = tiny ? 22 : compact ? 28 : 48;
      const sx = pad + ringW + 8;
      stripBox = { x: sx, y: bodyTop + (bodyH - sh) / 2 + (legend ? -8 : 4), w: w - pad - sx, h: sh };
    }
    // The ring: a silence growing to the length that replaces a filler
    const frac = inPause ? clamp(len / m.goal, 0, 1) : 0;
    const full = inPause && len >= m.goal;
    V.ring(ctx, ringBox.cx, ringBox.cy, ringR, frac, { color: full ? C.target : C.you, width: tiny ? 4 : Math.max(5, ringR * 0.16) });
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    if (inPause && len > 0.15) {
      ctx.fillStyle = full ? C.target : C.text;
      ctx.font = font(tiny ? 12 : ringR > 40 ? 17 : 14, 800, true);
      ctx.fillText((full ? "✓ " : "") + V.fmtNum(len, 1), ringBox.cx, ringBox.cy + 1);
    } else {
      ctx.fillStyle = C.faint;
      ctx.font = font(tiny ? 9 : 11, 700);
      ctx.fillText(vad.state === "speech" ? L("hablando", "speaking") : L("pausa", "pause"), ringBox.cx, ringBox.cy + 1, ringR * 1.6);
    }
    if (!tiny) {
      ctx.font = font(10, 700);
      ctx.fillStyle = C.muted;
      ctx.textBaseline = "top";
      ctx.fillText(
        L(`pausa de ${V.fmtNum(m.goal, 1)} s en vez de relleno`, `a ${V.fmtNum(m.goal, 1)} s pause instead of a filler`),
        ringBox.cx,
        ringBox.cy + ringR + 8,
        stacked ? w - pad * 2 : ringR * 2 + 34
      );
    }
    // The strip: speech, silences, and the marks of this round
    const secs = stripBox.w < 380 ? 12 : 20;
    const map = timeStrip(ctx, stripBox, vad, secs, { minLabel: 0.5, goodPause: [m.goal, 99] });
    const my = stripBox.y - 7;
    const put = (list, kind, key) =>
      list.forEach((it) => {
        const t = key ? it[key] : it;
        if (t < map.from || t > map.now) return;
        mark(ctx, kind, map.xOf(t), my, tiny ? 5 : 6);
      });
    if (r) {
      put(r.hes, "hes", "t");
      put(r.noted, "noted");
      put(r.replaced, "replaced");
    }
    if (legend) {
      const ly = stripBox.y + stripBox.h + 8;
      legendRow(
        ctx,
        stripBox.x,
        ly,
        stripBox.w,
        [
          ["noted", L("notaste un relleno", "you caught a filler")],
          ["replaced", L("pausaste en su lugar", "you paused instead")],
          ["hes", L("posible «eee» (aprox.)", "possible “uhh” (approx.)")]
        ],
        stacked
      );
    }
  }

  /**
   * A row of mark + words; an item that does not fit goes to a second line
   * when `wrap` allows, else it is left out. Returns the height used.
   */
  function legendRow(ctx, x, y, w, items, wrap = false) {
    ctx.font = font(10, 700);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let cx = x + 6;
    let cy = y + 6;
    items.forEach(([kind, text]) => {
      const tw = ctx.measureText(text).width;
      if (cx + 14 + tw > x + w) {
        if (!wrap || cx === x + 6) return;
        cx = x + 6;
        cy += 15;
      }
      mark(ctx, kind, cx, cy, 5);
      ctx.fillStyle = C.muted;
      ctx.fillText(text, cx + 9, cy);
      cx += 9 + tw + 16;
    });
    return cy - y + 8;
  }

  /** After Stop: one row per round, taps and hints on its own strip. */
  function fillerReview(ctx, box, m, compact) {
    const done = m.rounds.filter((r) => r.start != null);
    if (!done.length) {
      ctx.fillStyle = C.muted;
      ctx.font = font(13, 600);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(L("Sin rondas todavía.", "No rounds yet."), box.x, box.y);
      return;
    }
    const seq = done.map((r) => r.noted.length).join(" → ");
    const seqR = done.map((r) => r.replaced.length).join(" → ");
    const a = L(`Rellenos notados ▽ ${seq}`, `Fillers caught ▽ ${seq}`);
    const b = L(`pausas en su lugar ■ ${seqR}`, `paused instead ■ ${seqR}`);
    // Two short lines on a narrow screen, one line otherwise
    const twoLines = box.w < 520 && !compact;
    const headH = compact ? 18 : twoLines ? 40 : 26;
    ctx.fillStyle = C.text;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    if (twoLines) {
      fitText(ctx, a, box.x + 2, box.y + 10, box.w - 4, 14, 800, 10);
      ctx.fillStyle = C.muted;
      fitText(ctx, b.charAt(0).toUpperCase() + b.slice(1), box.x + 2, box.y + 29, box.w - 4, 13, 700, 10);
    } else fitText(ctx, `${a} · ${b}`, box.x + 2, box.y + headH / 2, box.w - 4, compact ? 13 : 15, 800, 10);
    const legendH = compact ? 0 : twoLines ? 32 : 18;
    const rowsTop = box.y + headH + 4;
    const rowH = Math.min(72, (box.h - headH - 4 - legendH) / done.length);
    const labelW = Math.min(150, box.w * 0.3);
    done.forEach((r, i) => {
      const y = rowsTop + i * rowH;
      ctx.fillStyle = C.text;
      ctx.font = font(12, 800);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(r.name, box.x, y + 2, labelW - 6);
      if (rowH >= 30) {
        ctx.fillStyle = C.muted;
        ctx.font = font(11, 600);
        const hes = r.hes.length ? ` · ○ ≈${r.hes.length}` : "";
        ctx.fillText(`▽ ${r.noted.length} · ■ ${r.replaced.length}${hes}`, box.x, y + 17, labelW - 6);
      }
      const sb = { x: box.x + labelW, y: y + 9, w: box.w - labelW, h: Math.max(14, rowH - 18) };
      const end = r.end != null ? r.end : m.vad.t;
      const span = Math.max(0.5, end - r.start);
      speechStrip(ctx, sb, m.vad, { range: [r.start, end], goodPause: [m.goal, 99], minLabel: 0.7 });
      const xOf = (t) => sb.x + ((t - r.start) / span) * sb.w;
      r.hes.forEach((hh) => mark(ctx, "hes", xOf(hh.t), sb.y - 4, 5));
      r.noted.forEach((t) => mark(ctx, "noted", xOf(t), sb.y - 4, 5));
      r.replaced.forEach((t) => mark(ctx, "replaced", xOf(t), sb.y - 4, 5));
    });
    if (legendH) {
      legendRow(
        ctx,
        box.x,
        box.y + box.h - legendH + 4,
        box.w,
        [
          ["noted", L("notaste un relleno", "you caught a filler")],
          ["replaced", L("pausaste en su lugar", "you paused instead")],
          ["hes", L("posible «eee» (aprox.)", "possible “uhh” (approx.)")]
        ],
        twoLines
      );
    }
  }

  /* —— v14 · Pace for impact —— */

  // Relative pace axis for the river: 40 % … 160 % of your own even pace
  const RV_LO = 0.4;
  const RV_HI = 1.6;
  // A key point counts as slowed at 15 % under your base (the rate itself
  // is only good to ±15–20 %, so less than that would be noise)
  const SLOW_REL = 0.85;

  /** A flag on a pole: filled once it has become an anchor, outlined before. */
  function flagMark(ctx, x, y, s, color, filled) {
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, y + s * 1.6);
    ctx.lineTo(x, y - s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - s);
    ctx.lineTo(x + s * 1.3, y - s * 0.45);
    ctx.lineTo(x, y + s * 0.1);
    ctx.closePath();
    if (filled) ctx.fill();
    else {
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  const anchorsOf = (k) => k.flags.filter((f) => f.state === "anchor").length;

  /** What happened at a key point, in words: "−25 % · pausa 1,1 s". */
  function flagWords(f, goal) {
    if (f.state === "wait") return "…";
    if (f.state !== "anchor") return L("como tu base", "like your base");
    const parts = [];
    if (f.rel != null && f.rel <= SLOW_REL) {
      const n = Math.round((1 - f.rel) * 100);
      parts.push(L(`−${n} %`, `−${n}%`));
    }
    if (f.pause >= goal) parts.push(L(`pausa ${fmtSec(f.pause)}`, `pause ${fmtSec(f.pause)}`));
    return parts.join(" · ");
  }

  /**
   * Pace for impact — "Río de ritmo con anclas".
   * Your pace over the last half minute as a line, against the band of
   * your own even pace (take 1). Tap «Punto clave» as a key idea starts: a
   * flag drops there and the next five seconds decide it. Slower than your
   * base, or a pause after it, and the flag fills into a gold anchor with
   * the words of what happened; otherwise it stays an outlined flag, "like
   * your base" — never red. After Stop, one row per take: its pace profile,
   * its anchors and how much it varied.
   * model: {
   *   takes: [{ name, short, cue, start, end, flags: [{ t, state, rel, pause }], spread }],
   *   current, elapsed, done, review, talked, waiting,
   *   base | null (syll/s), provBase, baseFrac 0..1, band [lo, hi],
   *   live: SlowValue, flash { text, color, until } | null,
   *   goal, pauseGoal, win, rt: RateTrack, vad
   * }
   */
  function paceRiver(ctx, w, h, m) {
    panel(ctx, w, h);
    const pad = 10;
    const tiny = h < 135;
    const compact = h < 190;
    const chipH = tiny ? 0 : compact ? 26 : 36;
    const T = m.takes;
    if (!tiny) {
      chips(
        ctx,
        { x: pad, y: pad, w: w - pad * 2, h: chipH },
        T.map((k, i) => ({
          label: w >= 520 || (i === m.current && !m.review) ? k.name : k.short,
          short: k.short,
          sub: takeSub(m, k, i),
          done: k.end != null
        })),
        { current: m.review || m.done ? -1 : m.current, frac: null }
      );
    }
    const top = tiny ? pad - 2 : pad + chipH + (compact ? 6 : 10);
    if (m.review) return riverReview(ctx, { x: pad, y: top, w: w - pad * 2, h: h - top - pad }, m, compact);
    const headY = top + (tiny ? 8 : compact ? 9 : 12);
    const slotW = riverSlots(ctx, w - pad - 2, headY, m, compact);
    const head = riverHead(m, tiny);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = head.color;
    fitText(ctx, head.text, pad + 2, headY, w - pad * 2 - slotW - 14, compact ? 14 : 17, 800, 10);

    // The river over the strip of speech and pauses, on one time axis
    const flagRoom = tiny ? 2 : 16;
    const plotTop = headY + (tiny ? 10 : compact ? 13 : 18) + flagRoom;
    const stripH = tiny ? 14 : compact ? 18 : 26;
    const stripBox = { x: pad, y: h - pad - stripH, w: w - pad * 2, h: stripH };
    const plot = { x: pad, y: plotTop, w: w - pad * 2, h: Math.max(20, stripBox.y - 6 - plotTop) };
    const secs = w < 420 ? 20 : 30;
    const map = timeStrip(ctx, stripBox, m.vad, secs, { minLabel: 0.6, goodPause: [m.pauseGoal, 99] });
    riverPlot(ctx, plot, m, map, { tiny, compact, live: true });
  }

  function takeSub(m, k, i) {
    if (k.end != null) return i === 0 && !k.flags.length ? L("tu base", "your base") : L(`anclas ${anchorsOf(k)}`, `anchors ${anchorsOf(k)}`);
    if (i === m.current && !m.review) return m.done ? "✓" : clockDown(m.elapsed);
    return "~90 s";
  }

  /** The headline: one slow cue, in words. */
  function riverHead(m, tiny) {
    const pre = tiny ? `${Math.min(m.current, m.takes.length - 1) + 1} · ` : "";
    const f = m.flash;
    if (f && performance.now() < f.until) return { text: pre + f.text, color: f.color };
    if (m.done) return { text: pre + L("Tres tomas listas: Detener muestra el mapa", "Three takes done: Stop shows the map"), color: C.done };
    if (m.waiting) return { text: pre + L("Punto clave: más lento… y una pausa", "Key point: slower… and a pause"), color: C.text };
    if (m.current === 0) {
      if (!m.talked) return { text: pre + L("Di tu mensaje a un solo ritmo", "Say your message at one even pace"), color: C.text };
      if (m.base == null) return { text: pre + L("Ritmo uniforme · midiendo tu base…", "One even pace · measuring your base…"), color: C.text };
      return { text: pre + L("Base lista · sigue, o pasa a la toma 2", "Base ready · go on, or move to take 2"), color: C.text };
    }
    return { text: pre + (m.takes[m.current]?.cue || ""), color: C.text };
  }

  /**
   * Right of the headline: in the even take, a small ring filling while
   * the base is measured; afterwards, one flag slot per key point, filled
   * gold as anchors land. Returns the width used.
   */
  function riverSlots(ctx, right, cy, m, small) {
    const k = m.takes[Math.min(m.current, m.takes.length - 1)];
    ctx.textAlign = "right";
    ctx.textBaseline = "middle";
    if (m.current === 0 && !m.done) {
      const r = small ? 7 : 9;
      ctx.font = font(small ? 10 : 11, 700);
      ctx.fillStyle = m.base != null ? C.done : C.muted;
      const txt = m.base != null ? L("base ✓", "base ✓") : L("base", "base");
      ctx.fillText(txt, right, cy + 1);
      const tw = ctx.measureText(txt).width;
      V.ring(ctx, right - tw - 8 - r, cy, r, m.base != null ? 1 : m.baseFrac || 0, {
        color: m.base != null ? C.done : C.you,
        width: 3
      });
      return tw + 8 + r * 2;
    }
    const n = m.goal || 3;
    const a = anchorsOf(k);
    const s = small ? 5 : 7;
    const step = s * 2.8;
    ctx.font = font(small ? 12 : 15, 800, true);
    ctx.fillStyle = a >= n ? C.done : C.text;
    const txt = `${a}/${n}`;
    ctx.fillText(txt, right, cy + 1);
    const tw = ctx.measureText(txt).width;
    const x0 = right - tw - 10 - step * n + s * 0.4;
    for (let i = 0; i < n; i++) flagMark(ctx, x0 + i * step, cy - s * 0.3, s, i < a ? C.done : C.faint, i < a);
    return tw + 10 + step * n;
  }

  /** The river itself: your pace as a line against your own even band. */
  function riverPlot(ctx, box, m, map, o) {
    const { x, y, w, h } = box;
    const yOf = (rel) => y + h - ((clamp(rel, RV_LO, RV_HI) - RV_LO) / (RV_HI - RV_LO)) * h;
    ctx.save();
    ctx.fillStyle = "rgba(170, 195, 230, 0.05)";
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();
    // Where a key idea lands: under 85 % of your base
    ctx.fillStyle = "rgba(52, 178, 122, 0.08)";
    ctx.fillRect(x, yOf(SLOW_REL), w, y + h - yOf(SLOW_REL));
    // The band of your even pace, and its middle
    const band = m.band || [0.92, 1.08];
    ctx.fillStyle = m.base != null ? "rgba(170, 195, 230, 0.16)" : "rgba(170, 195, 230, 0.08)";
    ctx.fillRect(x, yOf(band[1]), w, yOf(band[0]) - yOf(band[1]));
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = C.gridStrong;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(x, yOf(1));
    ctx.lineTo(x + w, yOf(1));
    ctx.stroke();
    ctx.setLineDash([]);
    if (!o.tiny && h >= 70) {
      ctx.font = font(10, 700);
      ctx.textAlign = "left";
      ctx.fillStyle = C.faint;
      ctx.textBaseline = "top";
      ctx.fillText(L("▲ más rápido", "▲ faster"), x + 6, y + 4);
      ctx.textBaseline = "bottom";
      ctx.fillText(L("▼ más lento: aquí aterriza lo clave", "▼ slower: where key ideas land"), x + 6, y + h - 3, w - 12);
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillStyle = C.faint;
      ctx.fillText(L("sílabas/s, aprox.", "syllables/s, approx."), x + w - 6, y + 4);
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      const bl = m.base != null ? L("tu ritmo uniforme (toma 1)", "your even pace (take 1)") : L("midiendo tu base…", "measuring your base…");
      const bw = ctx.measureText(bl).width;
      ctx.fillStyle = "rgba(14, 21, 31, 0.75)";
      roundRect(ctx, x + 3, yOf(band[1]) - 15, bw + 6, 13, 3);
      ctx.fill();
      ctx.fillStyle = C.muted;
      ctx.fillText(bl, x + 6, yOf(band[1]) - 3);
    }
    // Your pace: a line with gaps where you paused
    const denom = m.base || m.provBase;
    if (denom) {
      ctx.beginPath();
      let pen = false;
      const tr = m.rt.trace;
      // A whole syllable more or less in the window is a visible step: a
      // short running mean over the 4 Hz trace keeps the line calm
      const smooth = (i) => {
        let sum = 0;
        let n = 0;
        for (let j = Math.max(0, i - 2); j <= Math.min(tr.length - 1, i + 2); j++) {
          if (tr[j].rate != null) {
            sum += tr[j].rate;
            n += 1;
          }
        }
        return n ? sum / n : tr[i].rate;
      };
      for (let i = 0; i < tr.length; i++) {
        const p = tr[i];
        if (p.t < map.from) continue;
        if (p.t > map.to) break;
        if (p.rate == null) {
          pen = false;
          continue;
        }
        const px = map.xOf(p.t);
        const py = yOf(smooth(i) / denom);
        if (pen) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
        pen = true;
      }
      ctx.strokeStyle = C.you;
      ctx.lineWidth = o.tiny ? 2.5 : 3.2;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.stroke();
      const live = m.live && m.live.shown;
      if (o.live && live != null && m.rt.talking) {
        const nx = Math.min(x + w, map.xOf(map.now));
        ctx.fillStyle = C.you;
        ctx.strokeStyle = C.bg;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(nx, yOf(live), o.tiny ? 5 : 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    }
    // Key points: a flag at each tap, the five deciding seconds shaded
    const flagS = o.tiny ? 5 : 6;
    const all = [];
    m.takes.forEach((k) => k.flags.forEach((f) => all.push(f)));
    all.sort((a, b) => a.t - b.t);
    all.forEach((f, i) => {
      if (f.t > map.to || f.t < map.from - m.win) return;
      const fx = map.xOf(f.t);
      if (f.state === "wait") {
        const a = Math.max(x, fx);
        const b = Math.min(x + w, map.xOf(f.t + m.win));
        ctx.fillStyle = "rgba(238, 243, 250, 0.07)";
        if (b > a) ctx.fillRect(a, y, b - a, h);
      }
      if (fx < x) return;
      const anchor = f.state === "anchor";
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = anchor ? "rgba(255, 207, 102, 0.55)" : "rgba(238, 243, 250, 0.3)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(fx, y);
      ctx.lineTo(fx, y + h);
      ctx.stroke();
      ctx.setLineDash([]);
      const fy = o.tiny ? y + flagS + 2 : y - flagS - 3;
      flagMark(ctx, fx, fy, flagS, anchor ? C.done : f.state === "wait" ? C.text : C.muted, anchor);
      // Words beside the flag, as far as the next flag allows
      const nx = all[i + 1] && all[i + 1].t <= map.to ? map.xOf(all[i + 1].t) - 6 : x + w;
      const tx = fx + flagS * 1.5 + 3;
      if (!o.tiny && f.state !== "wait" && nx - tx >= 34) {
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillStyle = anchor ? C.done : C.muted;
        fitText(ctx, (anchor ? "✓ " : "") + flagWords(f, m.pauseGoal), tx, fy - flagS * 0.4, nx - tx, 10, 800, 8);
      }
    });
    ctx.restore();
  }

  /** After Stop: a row per take — how much it varied, its anchors, its profile. */
  function riverReview(ctx, box, m, compact) {
    const played = m.takes.filter((k) => k.start != null);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    if (!played.length || !(m.base || m.provBase)) {
      ctx.fillStyle = C.muted;
      ctx.font = font(13, 600);
      ctx.fillText(L("Sin ritmo medido todavía: habla unos segundos.", "No pace measured yet: speak for a few seconds."), box.x, box.y + 10, box.w);
      return;
    }
    const spreadTxt = (k) => (k.spread != null ? L(`±${Math.round(k.spread * 100)} %`, `±${Math.round(k.spread * 100)}%`) : "—");
    const a = L("Variación aprox. ", "Variation, approx. ") + played.map(spreadTxt).join(" → ");
    const b = L("anclas ", "anchors ") + played.map((k) => anchorsOf(k)).join(" → ");
    const twoLines = box.w < 520 && !compact;
    const headH = compact ? 18 : twoLines ? 40 : 26;
    ctx.fillStyle = C.text;
    if (twoLines) {
      fitText(ctx, a, box.x + 2, box.y + 10, box.w - 4, 14, 800, 10);
      ctx.fillStyle = C.done;
      fitText(ctx, b.charAt(0).toUpperCase() + b.slice(1), box.x + 2, box.y + 29, box.w - 4, 13, 700, 10);
    } else fitText(ctx, `${a} · ${b}`, box.x + 2, box.y + headH / 2, box.w - 4, compact ? 13 : 15, 800, 10);
    const footH = compact ? 0 : 16;
    const rowsTop = box.y + headH + 6;
    const rowH = Math.min(90, (box.h - headH - 6 - footH) / played.length);
    const labelW = Math.min(150, box.w * 0.3);
    played.forEach((k, i) => {
      const y = rowsTop + i * rowH;
      ctx.fillStyle = C.text;
      ctx.font = font(12, 800);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(k.name, box.x, y + 2, labelW - 6);
      if (rowH >= 30) {
        ctx.fillStyle = C.muted;
        ctx.font = font(11, 600);
        ctx.fillText(`${spreadTxt(k)} · ${L("anclas", "anchors")} ${anchorsOf(k)}`, box.x, y + 17, labelW - 6);
      }
      const end = k.end != null ? k.end : m.vad.t;
      const span = Math.max(1, end - k.start);
      const stripH = rowH >= 56 ? 8 : 0;
      const pb = { x: box.x + labelW, y: y + 10, w: box.w - labelW, h: Math.max(14, rowH - 16 - stripH) };
      const xOf = (t) => pb.x + ((t - k.start) / span) * pb.w;
      riverPlot(ctx, pb, m, { from: k.start, to: end, now: end, xOf }, { tiny: true, compact: true, live: false });
      if (stripH) speechStrip(ctx, { x: pb.x, y: pb.y + pb.h + 2, w: pb.w, h: stripH }, m.vad, { range: [k.start, end], minLabel: 99 });
      // In a small row the flag words would crowd: the anchors say it
      if (rowH >= 56) {
        k.flags.forEach((f, j) => {
          if (f.state !== "anchor") return;
          const fx = xOf(f.t);
          const nx = k.flags[j + 1] ? xOf(k.flags[j + 1].t) - 6 : pb.x + pb.w;
          if (nx - (fx + 11) < 34) return;
          ctx.fillStyle = C.done;
          ctx.textAlign = "left";
          ctx.textBaseline = "top";
          fitText(ctx, flagWords(f, m.pauseGoal), fx + 11, pb.y + 2, nx - fx - 11, 10, 800, 8);
        });
      }
    });
    if (footH) {
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = C.faint;
      fitText(
        ctx,
        L(
          `banda = tu ritmo uniforme · ancla = ${Math.round((1 - SLOW_REL) * 100)} % más lento o pausa de ${V.fmtNum(m.pauseGoal, 1)} s tras «Punto clave»`,
          `band = your even pace · anchor = ${Math.round((1 - SLOW_REL) * 100)}% slower or a ${V.fmtNum(m.pauseGoal, 1)} s pause after “Key point”`
        ),
        box.x + 2,
        box.y + box.h,
        box.w - 4,
        10,
        700,
        8
      );
    }
  }

  /* —— v8 · Metaphor topics —— */

  // A thinking gap long enough to be worth naming (never a fault)
  const GAP_SEC = 1.5;

  /** Word-wrap `text` into at most `maxLines` lines at the largest size from `px` down that fits. */
  function wrapFit(ctx, text, maxW, px, min, weight, maxLines) {
    const words = String(text || "").split(/\s+/);
    for (let size = px; size >= min; size -= 1) {
      ctx.font = font(size, weight);
      const lines = [];
      let cur = "";
      words.forEach((wd) => {
        const t = cur ? cur + " " + wd : wd;
        if (!cur || ctx.measureText(t).width <= maxW) cur = t;
        else {
          lines.push(cur);
          cur = wd;
        }
      });
      if (cur) lines.push(cur);
      if (lines.length <= maxLines || size === min) return { size, lines: lines.slice(0, maxLines) };
    }
    return { size: min, lines: [text] };
  }

  /** The pauses of one topic, clipped to it: [{ a, b, len, lead }] (lead = before the first word). */
  function topicGaps(vad, k, now) {
    const out = [];
    if (!vad || k.start == null) return out;
    const to = k.end != null ? k.end : now;
    let spoke = false;
    vad.segments.forEach((g) => {
      const end = g.end != null ? g.end : vad.t;
      if (end <= k.start || g.start >= to) return;
      if (g.kind === "speech") {
        spoke = true;
        return;
      }
      const a = Math.max(g.start, k.start);
      const b = Math.min(end, to);
      out.push({ a, b, len: b - a, lead: !spoke, open: g.end == null });
    });
    return out;
  }

  /**
   * Metaphor fluency — "Baraja de temas y cinta de fluidez".
   * A topic card (a dry topic, and the frame "… es como ___ porque ___"),
   * the five topics as a track, and under the card one minute of ribbon for
   * this topic: your speech as blocks, thinking gaps of 1,5 s or more named
   * by their length in a neutral tone, the time to your first word, and a
   * star where you said a metaphor. The metaphor itself is never judged.
   * model: {
   *   topics: [{ name, short, text, sec, start, end, stars: [t], firstWord }],
   *   current, remaining, frac, done, review, vad
   * }
   */
  function topicRibbon(ctx, w, h, m) {
    panel(ctx, w, h);
    const pad = 10;
    const tiny = h < 135;
    const compact = h < 190;
    const chipH = tiny ? 0 : compact ? 26 : 36;
    const T = m.topics;
    if (!tiny) {
      const wide = w >= 560;
      chips(
        ctx,
        { x: pad, y: pad, w: w - pad * 2, h: chipH },
        T.map((k, i) => ({
          label: wide ? k.name : k.short,
          short: k.short,
          sub: topicSub(m, k, i),
          done: k.end != null && k.stars.length > 0
        })),
        { current: m.review || m.done ? -1 : m.current, frac: m.review || m.done ? null : m.frac }
      );
    }
    const top = tiny ? pad - 2 : pad + chipH + (compact ? 6 : 10);
    if (m.review) return topicReview(ctx, { x: pad, y: top, w: w - pad * 2, h: h - top - pad }, m, compact);
    const i = Math.min(m.current, T.length - 1);
    const k = T[i];
    const vad = m.vad;
    // Bottom block: stars, the one-minute ribbon, a line of readouts
    const ribH = tiny ? 16 : compact ? 20 : clamp(h * 0.12, 26, 64);
    const readH = tiny ? 0 : 16;
    const starRoom = tiny ? 11 : 17;
    const ribY = h - pad - readH - ribH;
    const card = { x: pad, y: top, w: w - pad * 2, h: Math.max(20, ribY - starRoom - (tiny ? 2 : 8) - top) };
    topicCard(ctx, card, m, k, i, { tiny, compact });
    const box = { x: pad, y: ribY, w: w - pad * 2, h: ribH };
    const from = k.start != null ? k.start : vad.t;
    const read = ribbon(ctx, box, m, k, from, from + k.sec, { tiny, live: true, starY: ribY - (tiny ? 6 : 9) });
    if (readH) {
      ctx.font = font(10, 700);
      ctx.textBaseline = "top";
      ctx.textAlign = "left";
      ctx.fillStyle = C.muted;
      const parts = [];
      if (k.firstWord != null) parts.push(L(`1.ª palabra ${fmtSec(k.firstWord)}`, `first word ${fmtSec(k.firstWord)}`));
      parts.push(L(`pausas de ${V.fmtNum(GAP_SEC, 1)} s o más: ${read.long}`, `pauses of ${V.fmtNum(GAP_SEC, 1)} s or more: ${read.long}`));
      const legend = box.w >= 520;
      fitText(ctx, parts.join(" · "), box.x + 2, ribY + ribH + 4, legend ? box.w * 0.68 : box.w - 4, 10, 700, 8);
      if (legend) {
        ctx.textAlign = "right";
        ctx.fillStyle = C.faint;
        ctx.fillText(L("1 min · hablas ▬ piensas ␣", "1 min · speaking ▬ thinking ␣"), box.x + box.w - 2, ribY + ribH + 4, box.w * 0.3);
      }
    }
  }

  function topicSub(m, k, i) {
    if (k.end != null) return k.stars.length ? `★ ${k.stars.length}` : "—";
    if (i === m.current && !m.review && !m.done) return clockUp(m.remaining);
    return `${Math.round(k.sec)} s`;
  }

  /** The card: which topic, the topic itself, the frame, and one slow cue. */
  function topicCard(ctx, box, m, k, i, o) {
    const { x, y, w, h } = box;
    const n = m.topics.length;
    ctx.fillStyle = "rgba(170, 195, 230, 0.07)";
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.strokeStyle = C.grid;
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, w, h, 10);
    ctx.stroke();
    const ix = x + 12;
    const iw = w - 24;
    // The clock, top right
    ctx.textAlign = "right";
    ctx.textBaseline = "top";
    ctx.fillStyle = C.text;
    const clockPx = o.tiny ? 15 : o.compact ? 17 : 22;
    ctx.font = font(clockPx, 800, true);
    const clock = m.done ? "✓" : clockUp(m.remaining);
    ctx.fillText(clock, x + w - 10, y + (o.tiny ? 4 : 8));
    const cw = ctx.measureText(clock).width + 14;
    if (o.tiny) {
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = C.text;
      fitText(ctx, `${i + 1}/${n} · ${k.text}`, ix, y + 5, iw - cw, 15, 800, 10);
      if (h >= 40) {
        ctx.fillStyle = C.muted;
        fitText(ctx, topicCue(m, k), ix, y + 24, iw, 11, 700, 9);
      }
      return;
    }
    ctx.textAlign = "left";
    ctx.fillStyle = C.muted;
    let lead = L(`Tema ${i + 1} de ${n}`, `Topic ${i + 1} of ${n}`);
    const nx = m.topics[i + 1];
    if (nx && !m.done && m.remaining <= 8) lead += L(` · siguiente: ${nx.text}`, ` · next: ${nx.text}`);
    fitText(ctx, lead, ix, y + 9, iw - cw, 11, 700, 9);
    // The topic, as big as the card allows (up to two lines), and the
    // frame for the image under it; on a tall card the frame takes two lines
    const cueH = o.compact ? 0 : 18;
    const tall = !o.compact && h >= 230;
    const frameH = o.compact ? 0 : tall ? 50 : 20;
    const avail = h - 28 - cueH - frameH - 6;
    const px = clamp(Math.floor(avail / 2.4), 13, tall ? 40 : 30);
    const fit = wrapFit(ctx, k.text, iw - (avail < 40 ? cw : 0), px, 12, 800, avail >= px * 2.2 ? 2 : 1);
    const blockH = fit.lines.length * fit.size * 1.18 + frameH;
    let ty = y + 26 + Math.max(0, (h - 28 - cueH - 6 - blockH) / 2);
    ctx.fillStyle = C.text;
    ctx.font = font(fit.size, 800);
    ctx.textBaseline = "top";
    fit.lines.forEach((ln) => {
      ctx.fillText(ln, ix, ty, iw);
      ty += fit.size * 1.18;
    });
    if (frameH) {
      ctx.fillStyle = C.faint;
      if (tall) {
        fitText(ctx, L("… es como ______", "… is like ______"), ix, ty + 4, iw, 18, 700, 11);
        fitText(ctx, L("… porque ______", "… because ______"), ix, ty + 28, iw, 18, 700, 11);
      } else fitText(ctx, L("… es como ______ porque ______", "… is like ______ because ______"), ix, ty + 2, iw, 13, 700, 10);
    }
    if (cueH) {
      const cue = topicCue(m, k);
      ctx.fillStyle = k.stars.length && !m.done ? C.done : C.muted;
      fitText(ctx, cue, ix, y + h - cueH - 2, iw, 12, 700, 9);
    }
  }

  /** One slow cue for the card. */
  function topicCue(m, k) {
    const vad = m.vad;
    if (m.done) return L("Cinco temas listos: Detener muestra tus cintas", "Five topics done: Stop shows your ribbons");
    if (k.firstWord == null) return L("Busca una imagen concreta… y empieza a hablar", "Find a concrete image… then start speaking");
    if (vad.state === "pause" && vad.pauseLen >= GAP_SEC) return L("Pensar está bien · sigue cuando la tengas", "Thinking is fine · go on when you have it");
    if (k.stars.length) return L(`★ ${k.stars.length} en este tema · sigue hablando`, `★ ${k.stars.length} on this topic · keep talking`);
    return L("Al decir la metáfora, toca «Dije una metáfora»", "When you say the metaphor, tap “I spoke a metaphor”");
  }

  /**
   * One topic's ribbon over [from, to]: speech blocks, named thinking
   * gaps, the lead-in before the first word, stars. Returns { long }.
   */
  function ribbon(ctx, box, m, k, from, to, o) {
    const vad = m.vad;
    const span = Math.max(0.5, to - from);
    const now = Math.min(vad.t, to, k.end != null ? k.end : Infinity);
    const xOf = (t) => box.x + ((t - from) / span) * box.w;
    // Only this topic's sound, on the scale of its whole minute
    ctx.fillStyle = "rgba(170, 195, 230, 0.06)";
    roundRect(ctx, box.x, box.y, box.w, box.h, 6);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.rect(box.x - 1, box.y - 2, Math.max(0, xOf(now) - box.x + 1), box.h + 4);
    ctx.clip();
    speechStrip(ctx, box, vad, { range: [from, to], minLabel: 99 });
    ctx.restore();
    // Thinking gaps, clipped to this topic, named by length, neutral
    let long = 0;
    topicGaps(vad, k, now).forEach((g) => {
      if (g.len < GAP_SEC) return;
      if (!g.lead) long += 1;
      const a = xOf(g.a);
      const b = xOf(g.b);
      if (b - a < 24 || o.tiny) return;
      ctx.font = font(box.h < 26 ? 10 : 11, 800);
      ctx.fillStyle = C.muted;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const txt = g.lead ? (b - a > 90 ? L(`1.ª palabra ${fmtSec(g.len)}`, `first word ${fmtSec(g.len)}`) : `⏱ ${fmtSec(g.len)}`) : fmtSec(g.len);
      ctx.fillText(txt, (a + b) / 2, box.y + box.h / 2 + 0.5, b - a - 4);
    });
    if (o.live && vad.t <= to) {
      const nx = xOf(vad.t);
      ctx.strokeStyle = "rgba(238, 243, 250, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(nx, box.y - 3);
      ctx.lineTo(nx, box.y + box.h + 3);
      ctx.stroke();
    }
    k.stars.forEach((t) => {
      if (t < from || t > to + 0.5) return;
      mark(ctx, "star", Math.min(box.x + box.w - 4, xOf(t)), o.starY, o.tiny ? 5 : 7);
    });
    return { long };
  }

  /** After Stop: a mini ribbon per topic, stacked, and where to keep the best line. */
  function topicReview(ctx, box, m, compact) {
    const played = m.topics.filter((k) => k.start != null);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    if (!played.length) {
      ctx.fillStyle = C.muted;
      ctx.font = font(13, 600);
      ctx.fillText(L("Sin temas todavía.", "No topics yet."), box.x, box.y + 10);
      return;
    }
    const total = played.reduce((s, k) => s + k.stars.length, 0);
    const seq = played.map((k) => k.stars.length).join(" → ");
    ctx.fillStyle = C.text;
    fitText(ctx, L(`Metáforas ★ ${seq} · total ${total}`, `Metaphors ★ ${seq} · total ${total}`), box.x + 2, box.y + 10, box.w - 4, compact ? 13 : 15, 800, 10);
    const footH = compact ? 0 : 18;
    const rowsTop = box.y + 24;
    const rowH = Math.min(64, (box.h - 24 - footH) / played.length);
    const labelW = Math.min(230, box.w * 0.4);
    played.forEach((k, i) => {
      const y = rowsTop + i * rowH;
      const end = k.end != null ? k.end : m.vad.t;
      ctx.fillStyle = C.text;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      fitText(ctx, `${k.short} · ${k.text}`, box.x, y + 2, labelW - 8, 12, 800, 9);
      const gaps = topicGaps(m.vad, k, end).filter((g) => !g.lead && g.len >= GAP_SEC).length;
      if (rowH >= 30) {
        ctx.fillStyle = C.muted;
        const fw = k.firstWord != null ? L(`1.ª palabra ${fmtSec(k.firstWord)}`, `first word ${fmtSec(k.firstWord)}`) : L("sin habla", "no speech");
        fitText(ctx, `${fw} · ${L("pausas largas", "long pauses")} ${gaps}`, box.x, y + 17, labelW - 8, 11, 600, 8);
      }
      const rb = { x: box.x + labelW, y: y + 11, w: box.w - labelW, h: Math.max(10, Math.min(24, rowH - 18)) };
      // The whole topic minute on the same scale, so the rows compare
      ribbon(ctx, rb, m, k, k.start, k.start + Math.max(k.sec, end - k.start), { tiny: rb.h < 18, live: false, starY: rb.y - 5 });
    });
    if (footH) {
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = C.done;
      fitText(ctx, L("★ Escribe tu mejor metáfora de hoy en «Notas de la sesión», abajo.", "★ Write today's best metaphor in “Session notes”, below."), box.x + 2, box.y + box.h, box.w - 4, 12, 700, 9);
    }
  }

  /* —— v6 · Curiosity loops —— */

  /**
   * The scripted turns of one scenario, from its start to its planned (or
   * actual) end: [{ kind: "you"|"them", step, a, b }].
   */
  function slotsOf(sc, loop, startAt) {
    const out = [];
    const start = startAt != null ? startAt : sc.start;
    if (start == null) return out;
    const end = sc.end != null ? sc.end : start + sc.sec;
    let t = start;
    let i = 0;
    while (t < end - 0.05 && out.length < 400) {
      const p = loop[i % loop.length];
      out.push({ kind: p.kind, step: i % loop.length, a: t, b: Math.min(end, t + p.sec) });
      t += p.sec;
      i += 1;
    }
    return out;
  }

  /** Seconds of your speech inside [a, b]. */
  function speechIn(vad, a, b) {
    let s = 0;
    for (let i = vad.segments.length - 1; i >= 0; i--) {
      const g = vad.segments[i];
      const end = g.end != null ? g.end : vad.t;
      if (end <= a) break;
      if (g.kind !== "speech" || g.start >= b) continue;
      s += Math.max(0, Math.min(end, b) - Math.max(g.start, a));
    }
    return s;
  }

  /** Diagonal hatching over a box: your voice in their turn, marked by shape, not by alarm. */
  function hatch(ctx, x, y, w, h, color) {
    if (w <= 0) return;
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.fillStyle = "rgba(191, 230, 255, 0.16)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    for (let d = -h; d < w + h; d += 6) {
      ctx.moveTo(x + d, y + h);
      ctx.lineTo(x + d + h, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  /**
   * Curiosity loops — "Línea de turnos".
   * Two lanes on one clock: above, your voice; below, the imagined other
   * person's turns, arriving from the right so a flip is never a surprise.
   * Your voice inside their turn is hatched and tallied in seconds, never
   * red; a listening turn you left quiet closes with a check. The loop's
   * four steps run as a track above; the talk share and the longest turn
   * of this scenario sit beside the lanes, with 30 % as a reference only.
   * model: {
   *   scenarios: [{ name, short, sec, start, end, talk, elapsed, overlap, longest, fact }],
   *   loop: [{ kind, name, short, sec, cue }], current, done, review,
   *   slot { kind, step, a, b } | null, run (current turn, s), vad
   * }
   */
  function turns(ctx, w, h, m) {
    panel(ctx, w, h);
    const pad = 10;
    const tiny = h < 135;
    const compact = h < 190;
    const chipH = tiny ? 0 : compact ? 26 : 36;
    const vad = m.vad;
    const now = vad.t;
    if (m.review) {
      const top = pad;
      return turnsReview(ctx, { x: pad, y: top, w: w - pad * 2, h: h - top - pad }, m, compact);
    }
    const slot = m.slot;
    if (!tiny) {
      const wide = w >= 620;
      chips(
        ctx,
        { x: pad, y: pad, w: w - pad * 2, h: chipH },
        m.loop.map((p, i) => ({
          label: wide ? p.name : p.short,
          short: p.short,
          sub: slot && slot.step === i && !m.done ? clockUp(slot.b - now) : `${p.sec} s`,
          done: !!slot && !m.done && i < slot.step
        })),
        { current: slot && !m.done ? slot.step : -1, frac: slot && !m.done ? clamp((now - slot.a) / Math.max(0.1, slot.b - slot.a), 0, 1) : null }
      );
    }
    const top = tiny ? pad - 2 : pad + chipH + (compact ? 6 : 10);
    const headY = top + (tiny ? 8 : compact ? 9 : 12);
    // Right: when the turn flips, counted down in words and a big number
    let rightW = 0;
    if (slot && !m.done) {
      const left = Math.max(0, slot.b - now);
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.font = font(compact ? 16 : 22, 800, true);
      ctx.fillStyle = C.text;
      const big = clockUp(left);
      ctx.fillText(big, w - pad - 2, headY + 1);
      const bw = ctx.measureText(big).width;
      ctx.font = font(10, 700);
      ctx.fillStyle = left <= 5 ? C.text : C.muted;
      const words = slot.kind === "you" ? L("su turno en", "their turn in") : L("tu turno en", "your turn in");
      ctx.fillText(words, w - pad - bw - 8, headY + 1);
      rightW = bw + 12 + ctx.measureText(words).width;
    }
    const head = turnsHead(m, tiny);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = head.color;
    // A narrow picture gives the cue its own line under the countdown
    const own = !tiny && !compact && w < 480;
    const cueY = own ? headY + 24 : headY;
    fitText(ctx, head.text, pad + 2, cueY, own ? w - pad * 2 - 4 : w - pad * 2 - rightW - 12, compact ? 14 : 17, 800, 10);
    if (own && m.scenarios[m.current]) {
      ctx.fillStyle = C.muted;
      fitText(ctx, m.scenarios[m.current].name, pad + 2, headY, w - pad * 2 - rightW - 12, 12, 700, 9);
    }

    // Readouts beside the lanes when there is width, else under them
    const side = w >= 640 && !tiny;
    const readW = side ? 170 : 0;
    const readH = side || tiny ? 0 : compact ? 16 : 34;
    const lanesTop = cueY + (tiny ? 10 : compact ? 13 : 20);
    const lanes = { x: pad, y: lanesTop, w: w - pad * 2 - (side ? readW + 10 : 0), h: h - lanesTop - pad - readH };
    lanesPlot(ctx, lanes, m, { tiny, compact, live: true });
    const sc = m.scenarios[Math.min(m.current, m.scenarios.length - 1)];
    if (side) turnsReadouts(ctx, { x: w - pad - readW, y: lanesTop, w: readW, h: lanes.h }, m, sc, false);
    else if (readH) turnsReadouts(ctx, { x: pad, y: h - pad - readH, w: w - pad * 2, h: readH }, m, sc, true);
  }

  function turnsHead(m, tiny) {
    const sc = m.scenarios[Math.min(m.current, m.scenarios.length - 1)];
    const pre = tiny && sc ? `${sc.short} · ` : "";
    if (m.done) return { text: pre + L("Tres situaciones listas: Detener muestra el mapa", "Three scenarios done: Stop shows the map"), color: C.done };
    const slot = m.slot;
    if (!slot) return { text: pre + L("Empieza con una pregunta abierta", "Start with an open question"), color: C.text };
    const p = m.loop[slot.step];
    if (slot.kind === "them" && m.overlapNow >= 1) return { text: pre + L("Su turno: deja espacio a su respuesta", "Their turn: leave room for the answer"), color: C.text };
    return { text: pre + p.cue, color: slot.kind === "you" ? C.you : C.text };
  }

  /** The two lanes: your voice above, their imagined turns below, one clock. */
  function lanesPlot(ctx, box, m, o) {
    const vad = m.vad;
    const now = o.range ? o.range[1] : vad.t;
    const labelW = o.tiny || box.w < 420 ? 0 : 66;
    const lx = box.x + labelW;
    const lw = box.w - labelW;
    const secs = o.range ? Math.max(1, o.range[1] - o.range[0]) : lw < 380 ? 24 : 40;
    let from;
    if (o.range) from = o.range[0];
    else if (V.reducedMotion()) from = Math.floor(now / secs) * secs;
    else from = now - secs * 0.72; // what is coming shows on the right
    const to = from + secs;
    const xOf = (t) => lx + ((t - from) / secs) * lw;
    const gap = o.tiny ? 4 : 6;
    const laneH = (box.h - gap) / 2;
    const youY = box.y;
    const themY = box.y + laneH + gap;
    ctx.fillStyle = "rgba(170, 195, 230, 0.05)";
    roundRect(ctx, lx, youY, lw, laneH, 6);
    ctx.fill();
    roundRect(ctx, lx, themY, lw, laneH, 6);
    ctx.fill();
    if (labelW) {
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.font = font(12, 800);
      ctx.fillStyle = C.you;
      ctx.fillText(L("Tú", "You"), box.x, youY + laneH / 2);
      ctx.fillStyle = C.muted;
      ctx.font = font(11, 800);
      ctx.fillText(L("Su turno", "Their turn"), box.x, themY + laneH / 2 - 6, labelW - 4);
      ctx.font = font(9, 700);
      ctx.fillStyle = C.faint;
      ctx.fillText(L("(imaginado)", "(imagined)"), box.x, themY + laneH / 2 + 7, labelW - 4);
    }
    if (!labelW && !o.tiny && laneH >= 34) {
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.font = font(10, 800);
      ctx.fillStyle = C.you;
      ctx.fillText(L("tú", "you"), lx + 6, youY + 4);
      ctx.fillStyle = C.faint;
      ctx.fillText(L("su turno (imaginado)", "their turn (imagined)"), lx + 6, themY + 4, lw - 12);
    }
    // The scripted turns: yours as a faint slot above, theirs outlined below
    const scs = m.scenarios;
    const all = [];
    scs.forEach((sc, i) => {
      if (sc.start != null) all.push(...slotsOf(sc, m.loop));
      else if (!o.range && !m.done && i === m.current + 1) {
        const cur = scs[m.current];
        if (cur && cur.start != null) all.push(...slotsOf(sc, m.loop, cur.start + cur.sec));
      }
    });
    ctx.save();
    ctx.beginPath();
    ctx.rect(lx, box.y - 2, lw, box.h + 4);
    ctx.clip();
    all.forEach((s) => {
      if (s.b <= from || s.a >= to) return;
      const a = Math.max(lx, xOf(s.a));
      const b = Math.min(lx + lw, xOf(s.b));
      if (s.kind === "you") {
        ctx.fillStyle = "rgba(191, 230, 255, 0.1)";
        roundRect(ctx, a + 1, youY + 1, b - a - 2, laneH - 2, 5);
        ctx.fill();
        ctx.strokeStyle = "rgba(191, 230, 255, 0.28)";
        ctx.lineWidth = 1;
        ctx.stroke();
        return;
      }
      const over = speechIn(vad, s.a, Math.min(s.b, now));
      const past = s.b <= now;
      ctx.strokeStyle = past ? C.grid : C.gridStrong;
      ctx.lineWidth = 1.5;
      ctx.setLineDash(past ? [] : [5, 4]);
      roundRect(ctx, a + 2, themY + 2, b - a - 4, laneH - 4, 5);
      ctx.stroke();
      ctx.setLineDash([]);
      // What the window is, and how it went
      const mid = (a + b) / 2;
      if (b - a > 40 && !o.tiny) {
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.font = font(laneH < 26 ? 9 : 11, 700);
        let txt = L("escucha", "listen");
        ctx.fillStyle = C.faint;
        if (past && over < 0.5) {
          txt = L("✓ en silencio", "✓ quiet");
          ctx.fillStyle = C.target;
        } else if (over >= 0.5) {
          txt = L(`${V.fmtNum(over, 0)} s en su turno`, `${V.fmtNum(over, 0)} s in their turn`);
          ctx.fillStyle = C.muted;
        }
        ctx.fillText(txt, mid, themY + laneH / 2 + 0.5, b - a - 8);
      } else if (past && over < 0.5) glyph(ctx, "check", mid, themY + laneH / 2, C.target, 5);
    });
    // Your voice: blocks above; the part inside their turn hatched
    vad.segments.forEach((g) => {
      if (g.kind !== "speech") return;
      const end = g.end != null ? g.end : vad.t;
      if (end <= from || g.start >= Math.min(to, now)) return;
      const a = Math.max(lx, xOf(g.start));
      const b = Math.min(lx + lw, xOf(Math.min(end, now)));
      if (b - a < 0.5) return;
      ctx.fillStyle = C.you;
      ctx.globalAlpha = 0.85;
      roundRect(ctx, a, youY + laneH * 0.22, Math.max(2, b - a), laneH * 0.56, 3);
      ctx.fill();
      ctx.globalAlpha = 1;
      all.forEach((s) => {
        if (s.kind !== "them" || s.b <= g.start || s.a >= end) return;
        const ha = Math.max(a, xOf(Math.max(s.a, g.start)));
        const hb = Math.min(b, xOf(Math.min(s.b, end, now)));
        if (hb - ha < 1) return;
        ctx.fillStyle = C.panel;
        ctx.fillRect(ha, youY + laneH * 0.18, hb - ha, laneH * 0.64);
        hatch(ctx, ha, youY + laneH * 0.22, hb - ha, laneH * 0.56, C.you);
      });
    });
    ctx.restore();
    if (!o.range) {
      const nx = xOf(now);
      ctx.strokeStyle = "rgba(238, 243, 250, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(nx, box.y - 3);
      ctx.lineTo(nx, box.y + box.h + 3);
      ctx.stroke();
    }
  }

  /** Beside or under the lanes: this scenario's talk share and longest turn. */
  function turnsReadouts(ctx, box, m, sc, row) {
    if (!sc) return;
    const share = sc.elapsed > 3 ? sc.talk / sc.elapsed : null;
    const longest = Math.max(sc.longest || 0, m.run || 0);
    const shareTxt = share != null ? pct(share) : "—";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    if (row) {
      ctx.font = font(11, 700);
      ctx.fillStyle = C.muted;
      const parts = [
        L(`Hablaste ${shareTxt} (ref. 30 %)`, `You spoke ${shareTxt} (ref. 30%)`),
        L(`turno más largo ${V.fmtNum(longest, 0)} s`, `longest turn ${V.fmtNum(longest, 0)} s`)
      ];
      if (box.h >= 30) {
        const left = clockUp(Math.max(0, sc.start + sc.sec - m.vad.t));
        fitText(ctx, L(`Quedan ${left} en esta situación`, `${left} left in this scenario`), box.x + 2, box.y + 2, box.w - 4, 11, 700, 9);
        ctx.fillStyle = C.muted;
        fitText(ctx, parts.join(" · "), box.x + 2, box.y + 18, box.w - 4, 11, 700, 9);
      } else fitText(ctx, parts.join(" · "), box.x + 2, box.y + 2, box.w - 4, 11, 700, 9);
      return;
    }
    const { x, y, w } = box;
    ctx.font = font(11, 700);
    ctx.fillStyle = C.muted;
    fitText(ctx, sc.name, x, y, w, 11, 700, 9);
    ctx.fillStyle = C.faint;
    ctx.font = font(10, 700);
    ctx.fillText(L(`quedan ${clockUp(Math.max(0, sc.start + sc.sec - m.vad.t))}`, `${clockUp(Math.max(0, sc.start + sc.sec - m.vad.t))} left`), x, y + 15, w);
    // Talk share, with 30 % as a reference tick
    const by = y + 36;
    ctx.fillStyle = C.text;
    ctx.font = font(12, 800);
    ctx.fillText(L(`Hablaste ${shareTxt}`, `You spoke ${shareTxt}`), x, by, w);
    const barY = by + 18;
    ctx.fillStyle = "rgba(170, 195, 230, 0.12)";
    roundRect(ctx, x, barY, w, 8, 4);
    ctx.fill();
    if (share != null) {
      ctx.fillStyle = C.you;
      roundRect(ctx, x, barY, Math.max(4, w * clamp(share, 0, 1)), 8, 4);
      ctx.fill();
    }
    ctx.strokeStyle = C.text;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(x + w * 0.3, barY - 3);
    ctx.lineTo(x + w * 0.3, barY + 11);
    ctx.stroke();
    ctx.font = font(9, 700);
    ctx.fillStyle = C.faint;
    ctx.fillText(L("30 %: referencia", "30%: reference"), x + w * 0.3 - 4, barY + 13, w * 0.7);
    if (box.h >= 110) {
      ctx.font = font(12, 800);
      ctx.fillStyle = C.text;
      ctx.fillText(L(`Turno más largo ${V.fmtNum(longest, 0)} s`, `Longest turn ${V.fmtNum(longest, 0)} s`), x, barY + 30, w);
    }
  }

  /** After Stop: a row per scenario, its two lanes over its whole length. */
  function turnsReview(ctx, box, m, compact) {
    const played = m.scenarios.filter((s) => s.start != null && s.elapsed > 1);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    if (!played.length) {
      ctx.fillStyle = C.muted;
      ctx.font = font(13, 600);
      ctx.fillText(L("Sin situaciones todavía.", "No scenarios yet."), box.x, box.y + 10);
      return;
    }
    const shares = played.map((s) => pct(s.talk / Math.max(1, s.elapsed))).join(" → ");
    ctx.fillStyle = C.text;
    fitText(ctx, L(`Hablaste ${shares} · ref. 30 %`, `You spoke ${shares} · ref. 30%`), box.x + 2, box.y + 10, box.w - 4, compact ? 13 : 15, 800, 10);
    const rowsTop = box.y + 24;
    const footH = compact ? 0 : 16;
    const rowH = Math.min(96, (box.h - 24 - footH) / played.length);
    const labelW = Math.min(170, box.w * 0.32);
    played.forEach((s, i) => {
      const y = rowsTop + i * rowH;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillStyle = C.text;
      fitText(ctx, s.name, box.x, y + 2, labelW - 8, 12, 800, 9);
      if (rowH >= 30) {
        ctx.fillStyle = C.muted;
        const over = s.overlap >= 0.5 ? L(` · ${V.fmtNum(s.overlap, 0)} s en su turno`, ` · ${V.fmtNum(s.overlap, 0)} s in their turn`) : "";
        fitText(ctx, L(`turno más largo ${V.fmtNum(s.longest, 0)} s`, `longest turn ${V.fmtNum(s.longest, 0)} s`) + over, box.x, y + 17, labelW - 8, 11, 600, 8);
      }
      if (rowH >= 46) {
        ctx.fillStyle = s.fact ? C.done : C.faint;
        fitText(ctx, s.fact ? L("✓ aprendiste un dato", "✓ you learned a fact") : L("sin dato marcado", "no fact marked"), box.x, y + 31, labelW - 8, 11, 700, 8);
      }
      const end = s.end != null ? s.end : m.vad.t;
      lanesPlot(ctx, { x: box.x + labelW, y: y + 3, w: box.w - labelW, h: Math.max(18, rowH - 10) }, m, { tiny: rowH < 50, range: [s.start, end] });
    });
    if (footH) {
      ctx.textAlign = "left";
      ctx.textBaseline = "bottom";
      ctx.fillStyle = C.faint;
      fitText(
        ctx,
        L("Cualquier voz en la sala cuenta como «tú». La presencia y las preguntas las calificas tú.", "Any voice in the room counts as “you”. Presence and questions are yours to rate."),
        box.x + 2,
        box.y + box.h,
        box.w - 4,
        10,
        700,
        8
      );
    }
  }

  /* —— v3 · Count to 60 —— */

  /**
   * Bursts of voice, one per spoken number: a burst starts when the level
   * rises well above the room, and ends when it falls 10 dB under the
   * burst's own peak (or the sound stops) for 120 ms — longer than the
   * stop consonants inside a word, shorter than the gap between two
   * numbers said briskly. A burst counts once it has lasted 0.1 s, so a
   * click or a breath does not.
   */
  class Bursts {
    constructor(opts = {}) {
      this.dipDb = opts.dipDb || 10;
      this.gapSec = opts.gapSec || 0.12;
      this.minSec = opts.minSec || 0.1;
      this.smoothMs = opts.smoothMs || 25;
      this.onBurst = opts.onBurst || null;
      this.t = 0;
      this.s = null;
      this.state = "quiet";
      this.start = null;
      this.peak = -140;
      this.lowFor = 0;
      this.loudFor = 0;
      this.counted = false;
      this.floorDb = -70;
      this._floor = [];
      this._floorAcc = 0;
    }
    feed(frame) {
      const dt = frameDt(frame);
      this.t += dt;
      const db = dbOf(frame.rms || 0);
      const a = 1 - Math.exp(-(dt * 1000) / this.smoothMs);
      this.s = this.s == null ? db : this.s + a * (db - this.s);
      // The room's level: a low percentile of the last few seconds
      this._floorAcc += dt;
      if (this._floorAcc >= 0.1) {
        this._floorAcc = 0;
        this._floor.push(this.s);
        if (this._floor.length > 60) this._floor.shift();
        if (this._floor.length >= 5) this.floorDb = Math.max(-90, quantile(this._floor, 0.1));
      }
      const loud = !!frame.sounding && this.s > this.floorDb + 8;
      if (this.state === "burst") {
        this.peak = Math.max(this.peak, this.s);
        const low = !frame.sounding || this.s < this.peak - this.dipDb;
        this.lowFor = low ? this.lowFor + dt : 0;
        if (this.lowFor >= this.gapSec) {
          this.state = "quiet";
          this.loudFor = 0;
        } else if (!this.counted && this.t - this.start >= this.minSec) {
          this.counted = true;
          if (this.onBurst) this.onBurst(this.start);
        }
      } else {
        this.loudFor = loud ? this.loudFor + dt : 0;
        if (this.loudFor >= 0.03) {
          this.state = "burst";
          this.start = this.t - this.loudFor;
          this.peak = this.s;
          this.lowFor = 0;
          this.counted = false;
        }
      }
    }
  }

  /** The steady intervals between numbers: mean and spread, leaving out rests of 3 s or more. */
  function countTempo(beads) {
    const iv = [];
    for (let i = 1; i < beads.length; i++) {
      const a = beads[i - 1];
      const b = beads[i];
      if (a.manual || b.manual) continue;
      const d = b.t - a.t;
      if (d > 0.15 && d < 3) iv.push(d);
    }
    if (iv.length < 3) return { n: iv.length, mean: null, sd: null, iv };
    const mu = mean(iv);
    const sd = Math.sqrt(mean(iv.map((d) => (d - mu) * (d - mu))));
    return { n: iv.length, mean: mu, sd, iv };
  }

  /**
   * Count to 60 — "Collar de 60 cuentas".
   * Six rows of ten beads, one row per ten numbers. Each number you say
   * aloud (a burst of voice after a short silence) fills the next bead —
   * filled means heard, hollow means not yet — and the next bead's ring
   * fills over about a second, an unhurried pace to count against. It
   * never runs ahead of you: a number said before its ring is nearly full
   * gets a small "»" and the words "un poco rápido", as information only.
   * A card beside it shows, as an illustration, what the mouth is doing.
   * model: {
   *   beads: [{ t, early, manual }], goal, pace (s), lastT, running, review,
   *   elapsed, vad, note { text, until } | null
   * }
   */
  function beads(ctx, w, h, m) {
    panel(ctx, w, h);
    const pad = 10;
    const tiny = h < 135;
    const compact = h < 190;
    const n = m.beads.length;
    const goal = m.goal || 60;
    const tempo = countTempo(m.beads);
    // Headline: one slow cue
    const headY = pad + (tiny ? 6 : 10);
    const head = beadsHead(m, tempo);
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = head.color;
    fitText(ctx, head.text, pad + 2, headY, w - pad * 2 - 70, compact ? 14 : 17, 800, 10);
    ctx.textAlign = "right";
    ctx.fillStyle = C.muted;
    ctx.font = font(compact ? 13 : 15, 800, true);
    ctx.fillText(clockDown(m.elapsed), w - pad - 2, headY + 1);
    const bodyTop = headY + (tiny ? 10 : compact ? 14 : 20);
    const bodyH = h - bodyTop - pad;
    // Where things go: count, beads, card
    const stacked = !tiny && w < 520;
    let countBox;
    let gridBox;
    let cardBox = null;
    if (tiny) {
      countBox = { x: pad, y: bodyTop, w: 78, h: bodyH };
      gridBox = { x: pad + 84, y: bodyTop, w: w - pad * 2 - 84, h: bodyH };
    } else if (stacked) {
      const countH = 50;
      const cardH = bodyH >= 280 ? clamp(bodyH * 0.3, 90, 150) : 0;
      countBox = { x: pad, y: bodyTop, w: w - pad * 2, h: countH };
      gridBox = { x: pad, y: bodyTop + countH + 6, w: w - pad * 2, h: bodyH - countH - 6 - (cardH ? cardH + 8 : 0) };
      if (cardH) cardBox = { x: pad, y: h - pad - cardH, w: w - pad * 2, h: cardH };
    } else {
      const countW = clamp(w * 0.2, 120, 180);
      const cardW = w >= 760 ? clamp(w * 0.27, 200, 280) : 0;
      countBox = { x: pad, y: bodyTop, w: countW, h: bodyH };
      gridBox = { x: pad + countW + 10, y: bodyTop, w: w - pad * 2 - countW - 10 - (cardW ? cardW + 12 : 0), h: bodyH };
      if (cardW) cardBox = { x: w - pad - cardW, y: bodyTop, w: cardW, h: bodyH };
    }
    beadCount(ctx, countBox, m, n, goal, tempo, { tiny, row: stacked });
    beadGrid(ctx, gridBox, m, goal, { tiny, compact });
    if (cardBox) {
      if (m.review) tempoCard(ctx, cardBox, m, tempo);
      else mouthCard(ctx, cardBox, m, { wide: !stacked });
    }
  }

  function beadsHead(m, tempo) {
    const n = m.beads.length;
    const goal = m.goal || 60;
    if (m.review) {
      if (!n) return { text: L("Sin números contados todavía", "No numbers counted yet"), color: C.muted };
      return { text: L(`Llegaste a ${n}`, `You reached ${n}`) + (n >= goal ? " ✓" : ""), color: n >= goal ? C.done : C.text };
    }
    const note = m.note;
    if (note && performance.now() < note.until) return { text: note.text, color: note.color || C.text };
    if (n >= goal) return { text: L(`¡${goal}! Descansa la lengua`, `${goal}! Rest your tongue`), color: C.done };
    if (!n) return { text: L("Lengua afuera, suave · cuenta en voz alta: uno…", "Tongue gently out · count aloud: one…"), color: C.text };
    if (m.beads[n - 1]?.early) return { text: L("» Un poco rápido: deja que el círculo se llene", "» A bit fast: let the ring fill"), color: C.text };
    return { text: L("Sin prisa: un número cuando el círculo se llena", "No rush: one number as the ring fills"), color: C.text };
  }

  /** The count, large, and what it means. */
  function beadCount(ctx, box, m, n, goal, tempo, o) {
    const { x, y, w, h } = box;
    const done = n >= goal;
    ctx.textBaseline = "alphabetic";
    ctx.textAlign = "left";
    const big = o.tiny ? 26 : o.row ? 34 : clamp(h * 0.3, 30, 52);
    ctx.font = font(big, 800, true);
    ctx.fillStyle = done ? C.done : C.text;
    const num = String(n);
    const baseY = o.row || o.tiny ? y + big * 0.9 : y + h * 0.42;
    ctx.fillText(num, x + 2, baseY);
    const nw = ctx.measureText(num).width;
    ctx.font = font(o.tiny ? 12 : 15, 800, true);
    ctx.fillStyle = C.muted;
    ctx.fillText(` / ${goal}`, x + 4 + nw, baseY);
    ctx.font = font(10, 700);
    ctx.fillStyle = C.faint;
    ctx.textBaseline = "top";
    const byVoice = L("≈ por voz", "≈ by voice");
    const tempoTxt =
      tempo.mean != null
        ? L(`~${V.fmtNum(tempo.mean, 1)} s por número (±${V.fmtNum(tempo.sd, 1)})`, `~${V.fmtNum(tempo.mean, 1)} s per number (±${V.fmtNum(tempo.sd, 1)})`)
        : L("ritmo: después de 4 números", "pace: after 4 numbers");
    if (o.row) {
      // Upright phone: words to the right of the number
      const tx = x + 4 + nw + 60;
      ctx.fillText(byVoice, tx, y + 6, w - (tx - x));
      ctx.fillStyle = C.muted;
      ctx.font = font(11, 700);
      ctx.fillText(tempoTxt, tx, y + 22, w - (tx - x));
      return;
    }
    if (o.tiny) {
      ctx.fillText(byVoice, x + 2, baseY + 4, w - 4);
      return;
    }
    ctx.fillText(byVoice, x + 2, baseY + 6, w - 4);
    ctx.fillStyle = C.muted;
    ctx.font = font(11, 700);
    const lines = wrapFit(ctx, tempoTxt, w - 4, 11, 9, 700, 2);
    ctx.font = font(lines.size, 700);
    lines.lines.forEach((ln, i) => ctx.fillText(ln, x + 2, baseY + 24 + i * (lines.size + 3), w - 4));
  }

  /** Six rows of ten; the next bead's ring is the pace. */
  function beadGrid(ctx, box, m, goal, o) {
    const { x, y, w, h } = box;
    const rows = o.tiny ? (w / h > 7 ? 2 : 3) : 6;
    const cols = Math.ceil(goal / rows);
    const labelW = !o.tiny && rows === 6 && w >= 260 ? 22 : 0;
    const cw = (w - labelW) / cols;
    const rh = h / rows;
    const r = clamp(Math.min(cw, rh) * 0.34, 2.5, 11);
    const n = m.beads.length;
    const pos = (i) => ({ x: x + labelW + cw * ((i % cols) + 0.5), y: y + rh * (Math.floor(i / cols) + 0.5) });
    if (labelW) {
      ctx.font = font(9, 700);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let row = 0; row < rows; row++) ctx.fillText(String((row + 1) * cols), x + labelW - 5, y + rh * (row + 0.5));
    }
    const now = m.clock || 0;
    for (let i = 0; i < goal; i++) {
      const p = pos(i);
      const b = m.beads[i];
      if (b) {
        ctx.fillStyle = b.manual ? C.muted : n >= goal ? C.done : C.you;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        if (b.early && r >= 4) {
          ctx.fillStyle = C.muted;
          ctx.font = font(Math.max(8, r * 1.1), 800);
          ctx.textAlign = "left";
          ctx.textBaseline = "middle";
          ctx.fillText("»", p.x + r + 1, p.y - r * 0.6);
        }
      } else {
        ctx.strokeStyle = C.grid;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
      // The pacer: the next bead's ring fills over one unhurried beat
      if (i === n && m.running) {
        let f = clamp((now - (m.lastT != null ? m.lastT : m.startT || 0)) / (m.pace || 1.1), 0, 1);
        if (V.reducedMotion()) f = Math.floor(f * 4) / 4;
        V.ring(ctx, p.x, p.y, r + 2.5, f, { color: f >= 1 ? C.target : C.you, width: 2.5, track: "rgba(170, 195, 230, 0.2)" });
      }
    }
  }

  /** An illustration, not a measure: the tongue out, the tall space, the rose. */
  function mouthCard(ctx, box, m, o) {
    const { x, y, w, h } = box;
    ctx.fillStyle = "rgba(170, 195, 230, 0.06)";
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    // The drawing: an open mouth taller than wide, the tongue resting out
    // over the lower lip, an arrow up for the lifted palate
    const dh = o.wide ? Math.min(h * 0.46, (w - 20) * 0.9) : h - 16;
    const dw = dh * 0.8;
    const dx = o.wide ? x + w / 2 : x + 12 + dw / 2;
    const dy = o.wide ? y + 10 + dh / 2 : y + 8 + dh * 0.42;
    ctx.strokeStyle = C.muted;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(dx, dy, dw * 0.32, dh * 0.42, 0, 0, Math.PI * 2);
    ctx.stroke();
    // tongue
    ctx.fillStyle = "rgba(238, 243, 250, 0.2)";
    ctx.strokeStyle = C.muted;
    ctx.beginPath();
    ctx.ellipse(dx, dy + dh * 0.42, dw * 0.2, dh * 0.16, 0, 0, Math.PI);
    ctx.fill();
    ctx.stroke();
    // lifted palate: an arrow up inside the mouth
    ctx.strokeStyle = C.you;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(dx, dy + dh * 0.12);
    ctx.lineTo(dx, dy - dh * 0.26);
    ctx.moveTo(dx - 5, dy - dh * 0.18);
    ctx.lineTo(dx, dy - dh * 0.26);
    ctx.lineTo(dx + 5, dy - dh * 0.18);
    ctx.stroke();
    const lines = [
      L("lengua afuera, suave", "tongue gently out"),
      L("espacio alto: bostezo suave", "tall space: a soft yawn"),
      L("huele una rosa", "smell a rose")
    ];
    const reminder = m.reminder || "";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    if (o.wide) {
      let ty = y + 18 + dh * 1.1;
      lines.forEach((ln) => {
        ctx.fillStyle = C.muted;
        fitText(ctx, ln, x + 10, ty, w - 20, 11, 700, 9);
        ty += 15;
      });
      if (reminder && ty + 14 <= y + h) {
        ctx.fillStyle = C.text;
        fitText(ctx, reminder, x + 10, ty + 2, w - 20, 12, 800, 9);
      }
    } else {
      const tx = x + 24 + dw;
      let ty = y + 12;
      lines.forEach((ln) => {
        ctx.fillStyle = C.muted;
        fitText(ctx, ln, tx, ty, x + w - tx - 8, 12, 700, 9);
        ty += 18;
      });
      if (reminder) {
        ctx.fillStyle = C.text;
        fitText(ctx, reminder, tx, ty + 4, x + w - tx - 8, 13, 800, 9);
      }
    }
    ctx.font = font(9, 700);
    ctx.fillStyle = C.faint;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(L("ilustrativo", "illustration"), x + w - 8, y + h - 5);
  }

  /** After Stop, in the card's place: each interval between numbers, against the pacer's beat. */
  function tempoCard(ctx, box, m, tempo) {
    const { x, y, w, h } = box;
    ctx.fillStyle = "rgba(170, 195, 230, 0.06)";
    roundRect(ctx, x, y, w, h, 10);
    ctx.fill();
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillStyle = C.muted;
    fitText(ctx, L("Segundos entre números", "Seconds between numbers"), x + 10, y + 8, w - 20, 11, 700, 9);
    const iv = tempo.iv;
    const px = { x: x + 10, y: y + 28, w: w - 20, h: h - 44 };
    if (iv.length < 2 || px.h < 20) return;
    const hi = Math.max(2, ...iv);
    const yOf = (d) => px.y + px.h - (d / hi) * px.h;
    // The pacer's beat as a line
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = C.target;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(px.x, yOf(m.pace || 1.1));
    ctx.lineTo(px.x + px.w, yOf(m.pace || 1.1));
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = font(9, 700);
    ctx.fillStyle = C.faint;
    ctx.fillText(L(`pauta ${V.fmtNum(m.pace || 1.1, 1)} s`, `pacer ${V.fmtNum(m.pace || 1.1, 1)} s`), px.x + 2, yOf(m.pace || 1.1) + 2);
    iv.forEach((d, i) => {
      const cx = px.x + ((i + 0.5) / iv.length) * px.w;
      ctx.fillStyle = C.you;
      ctx.beginPath();
      ctx.arc(cx, yOf(d), 3, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.fillStyle = C.faint;
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(L("número →", "number →"), x + w - 10, y + h - 4);
  }

  V.scenes.rateLadder = rateLadder;
  V.scenes.fillerRounds = fillerRounds;
  V.scenes.paceRiver = paceRiver;
  V.scenes.topicRibbon = topicRibbon;
  V.scenes.turns = turns;
  V.scenes.beads = beads;
  V.speechTiming = {
    RateTrack,
    SlowValue,
    Hesitations,
    Bursts,
    meanRun,
    timeStrip,
    mark,
    legendRow,
    pct,
    clockUp,
    clockDown,
    quantile,
    mean,
    dbOf,
    frameDt
  };
})(typeof window !== "undefined" ? window : globalThis);
