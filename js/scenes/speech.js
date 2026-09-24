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

  V.scenes.rateLadder = rateLadder;
  V.scenes.fillerRounds = fillerRounds;
  V.speechTiming = {
    RateTrack,
    SlowValue,
    Hesitations,
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
