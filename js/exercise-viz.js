/**
 * Exercise visuals — the canvas pictures each practice mode draws while you
 * practise, and the short replay it leaves when you stop.
 *
 * The practice modes (js/practice-modes.js) used to show a title, a number and
 * a line of text, and for the speaking and breathing drills the rest of the
 * stage stayed empty. Each exercise trains something different, so each gets
 * the picture that shows that thing: a loudness trace for steady volume, a
 * pacer for breathing, a timeline of speech and silence for pauses, a
 * continuity strip for lip trills, the attack shape of every onset, the length
 * of every note. The pitch highway keeps drawing pitch; these draw the rest.
 *
 * Rules every visual here follows (docs/39-EXERCISE-VISUALS.md has the why):
 * - Measure only what the microphone can measure. A timed guide is fine where
 *   nothing can be measured; a score for something unmeasurable is not.
 * - Colour is never the only cue: every state also has a position, a shape or
 *   a word.
 * - prefers-reduced-motion: nothing pulses or glides; values still update.
 * - Loudness is drawn in decibels, because that is how loudness is heard; a
 *   linear RMS scale squeezes everything quiet into the bottom few pixels.
 *
 * Nothing here opens the microphone. Modes feed frames from the practice
 * engine; a scene draws when it is fed, so a stopped exercise costs nothing.
 */
(function (global) {
  "use strict";

  /* —— Language —— */

  function isEs() {
    return (
      (global.VTI18n && global.VTI18n.lang === "es") ||
      (document.documentElement.lang || "").startsWith("es")
    );
  }
  function L(es, en) {
    return isEs() ? es : en;
  }

  /* —— Motion —— */

  let rmq = null;
  function reducedMotion() {
    try {
      if (!rmq && global.matchMedia) rmq = global.matchMedia("(prefers-reduced-motion: reduce)");
      return !!(rmq && rmq.matches);
    } catch {
      return false;
    }
  }

  /* —— Colours: meaning, not mood ——
   * Checked for colour blindness (Machado 2009 simulation): your line is at
   * least twice as bright as the target it crosses under every simulation,
   * so it reads by brightness where the hues merge. Warn and done stay close
   * in hue for deuteranopes, so neither is ever used without its shape. */

  const C = {
    bg: "#0b1119",
    panel: "rgba(14, 21, 31, 0.92)",
    grid: "rgba(170, 195, 230, 0.12)",
    gridStrong: "rgba(170, 195, 230, 0.28)",
    text: "#eef3fa",
    muted: "#a9b8cc",
    faint: "#6f8199",
    /** your voice, now */
    you: "#bfe6ff",
    youSoft: "rgba(191, 230, 255, 0.28)",
    /** the target: where to be */
    target: "#34b27a",
    targetSoft: "rgba(52, 178, 122, 0.26)",
    /** a thing worth fixing (never the only cue) */
    warn: "#ff9f5a",
    warnSoft: "rgba(255, 159, 90, 0.22)",
    off: "#ff8fa3",
    offSoft: "rgba(255, 143, 163, 0.22)",
    /** air, unvoiced */
    air: "#9f86ff",
    airSoft: "rgba(159, 134, 255, 0.25)",
    /** a done step, a cleared rung */
    done: "#ffd36e"
  };

  /* —— Signal helpers —— */

  /** dBFS of an RMS value; -100 for silence. */
  function dbfs(rms) {
    return rms > 0 ? 20 * Math.log10(rms) : -100;
  }
  /** Loudness 0..1 on a dB scale from `floor` to `ceil` dBFS. */
  function levelNorm(rms, floor = -54, ceil = -6) {
    const d = dbfs(rms);
    return Math.max(0, Math.min(1, (d - floor) / (ceil - floor)));
  }
  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }
  function median(arr) {
    if (!arr.length) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }
  function freqToMidi(f) {
    return 69 + 12 * Math.log2(f / 440);
  }
  function mean(arr) {
    if (!arr.length) return 0;
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }
  function std(arr) {
    if (arr.length < 2) return 0;
    const m = mean(arr);
    let s = 0;
    for (let i = 0; i < arr.length; i++) s += (arr[i] - m) * (arr[i] - m);
    return Math.sqrt(s / arr.length);
  }

  /**
   * Seconds since the previous frame, from the frame itself. Modes are fed by
   * the engine's rAF loop (or the app's silent ticker); a hidden tab can
   * deliver one huge step, so it is capped.
   */
  function frameSec(frame) {
    return Math.min(0.1, Math.max(0, (frame && frame.dtMs) || 16) / 1000);
  }

  /** Fixed-length time series sampled at a steady rate (not per frame). */
  class Series {
    constructor(seconds, hz = 30) {
      this.hz = hz;
      this.n = Math.max(2, Math.round(seconds * hz));
      this.v = new Float32Array(this.n).fill(NaN);
      this.k = new Uint8Array(this.n); // a small tag per sample (state, class)
      this.i = 0; // next write
      this.count = 0;
      this._acc = 0;
    }
    /** Advance by dt seconds, writing `value`/`tag` for each tick that passes. */
    push(dt, value, tag = 0) {
      this._acc += dt * this.hz;
      while (this._acc >= 1) {
        this._acc -= 1;
        this.v[this.i] = value;
        this.k[this.i] = tag;
        this.i = (this.i + 1) % this.n;
        this.count = Math.min(this.n, this.count + 1);
      }
    }
    /** Oldest → newest, calling fn(value, tag, index 0..n-1). */
    each(fn) {
      const start = (this.i - this.count + this.n) % this.n;
      const offset = this.n - this.count;
      for (let j = 0; j < this.count; j++) {
        const idx = (start + j) % this.n;
        fn(this.v[idx], this.k[idx], offset + j);
      }
    }
    clear() {
      this.v.fill(NaN);
      this.k.fill(0);
      this.i = 0;
      this.count = 0;
      this._acc = 0;
    }
  }

  /* —— Canvas host —— */

  /**
   * A canvas that fills `host`, keeps itself sharp on high-DPI screens and
   * redraws on resize. `draw(ctx, w, h)` is the scene's painter.
   */
  class Surface {
    constructor(host, draw, opts = {}) {
      this.host = host;
      this.drawFn = draw;
      this.wrap = document.createElement("div");
      this.wrap.className = "vz" + (opts.className ? " " + opts.className : "");
      this.canvas = document.createElement("canvas");
      this.canvas.className = "vz-canvas";
      this.canvas.setAttribute("role", "img");
      if (opts.label) this.canvas.setAttribute("aria-label", opts.label);
      this.wrap.appendChild(this.canvas);
      if (opts.caption !== false) {
        // captionHidden: the picture already writes these words large; the
        // caption then only speaks (screen readers), it is not shown twice.
        // A short line of words under the picture: the picture's meaning in
        // text, for screen readers (aria-live, throttled) and for anyone who
        // cannot tell the colours apart.
        this.cap = document.createElement("p");
        this.cap.className = "vz-cap" + (opts.captionHidden ? " vz-sr" : "");
        this.cap.setAttribute("aria-live", "polite");
        this.wrap.appendChild(this.cap);
      }
      host.appendChild(this.wrap);
      this.ctx = this.canvas.getContext("2d");
      this.w = 0;
      this.h = 0;
      this._capText = "";
      this._capAt = 0;
      this._raf = 0;
      this._resize();
      if (global.ResizeObserver) {
        this._ro = new ResizeObserver(() => {
          this._resize();
          this.draw();
        });
        this._ro.observe(this.wrap);
      }
    }
    _resize() {
      const dpr = Math.min(3, global.devicePixelRatio || 1);
      const r = this.canvas.getBoundingClientRect();
      const w = Math.max(120, Math.round(r.width || this.wrap.clientWidth || 300));
      const h = Math.max(60, Math.round(r.height || 120));
      if (w === this.w && h === this.h && this._dpr === dpr) return;
      this.w = w;
      this.h = h;
      this._dpr = dpr;
      this.canvas.width = Math.round(w * dpr);
      this.canvas.height = Math.round(h * dpr);
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    /** Coalesce draws to one per animation frame. */
    draw() {
      if (this._raf || !this.ctx) return;
      const run = () => {
        this._raf = 0;
        if (!this.canvas.isConnected) return;
        this.ctx.clearRect(0, 0, this.w, this.h);
        try {
          this.drawFn(this.ctx, this.w, this.h);
        } catch (err) {
          console.warn("[viz]", err);
        }
      };
      this._raf = global.requestAnimationFrame ? requestAnimationFrame(run) : (run(), 0);
    }
    /** Draw now (tests, final frame). */
    drawNow() {
      if (this._raf && global.cancelAnimationFrame) cancelAnimationFrame(this._raf);
      this._raf = 0;
      this._resize();
      this.ctx.clearRect(0, 0, this.w, this.h);
      this.drawFn(this.ctx, this.w, this.h);
    }
    /**
     * Words for the caption. Screen readers hear a change at most every
     * `minMs`, so a live value does not become a stream of announcements.
     */
    caption(text, minMs = 2500) {
      if (!this.cap) return;
      // An immediate caption replaces any throttled one still waiting
      if (minMs === 0) {
        clearTimeout(this._capT);
        delete this.cap.dataset.pending;
      }
      if (text === this._capText) return;
      const now = performance.now();
      if (now - this._capAt < minMs && this._capText) {
        this.cap.dataset.pending = text;
        clearTimeout(this._capT);
        this._capT = setTimeout(() => this.caption(this.cap?.dataset.pending || text, 0), minMs);
        return;
      }
      this._capText = text;
      this._capAt = now;
      this.cap.textContent = text;
    }
    destroy() {
      if (this._ro) this._ro.disconnect();
      if (this._raf && global.cancelAnimationFrame) cancelAnimationFrame(this._raf);
      clearTimeout(this._capT);
      if (this.wrap.parentNode) this.wrap.parentNode.removeChild(this.wrap);
      this.ctx = null;
    }
  }

  /* —— Drawing helpers —— */

  function roundRect(ctx, x, y, w, h, r) {
    const rr = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }
  function font(px, weight = 600, mono = false) {
    return `${weight} ${px}px ${mono ? "ui-monospace, SFMono-Regular, monospace" : "system-ui, -apple-system, 'Segoe UI', sans-serif"}`;
  }
  /** Text with a dark backing so it stays readable over lanes and traces. */
  function label(ctx, text, x, y, opts = {}) {
    ctx.font = opts.font || font(12, 700);
    ctx.textAlign = opts.align || "left";
    ctx.textBaseline = opts.baseline || "middle";
    if (opts.back !== false) {
      const tw = ctx.measureText(text).width;
      const pad = 4;
      const bx = opts.align === "right" ? x - tw - pad : opts.align === "center" ? x - tw / 2 - pad : x - pad;
      ctx.fillStyle = opts.backColor || "rgba(6, 10, 16, 0.78)";
      roundRect(ctx, bx, y - 9, tw + pad * 2, 18, 4);
      ctx.fill();
    }
    ctx.fillStyle = opts.color || C.text;
    ctx.fillText(text, x, y + 0.5);
  }

  /* —— Timeline: the shared scrolling picture —— */

  /**
   * Time runs right to left past a fixed "now" line. Left of it is what you
   * did; right of it is what comes next — the breath wave, the swell, the
   * ladder's next rung — so a change never arrives as a surprise (showing the
   * path ahead improves tracking over showing only the current target).
   *
   * Values are 0..1 (bottom..top). Tracks:
   *   guide:  fn(t) → { y, lo, hi } | null, drawn past and future
   *   line:   a Series of values, drawn up to now; tag 1 = "outside the band"
   *   blocks: a Series of tags drawn as a strip along the bottom
   * With reduced motion the picture does not scroll: it fills left to right
   * and starts a fresh page when full.
   */
  class Timeline {
    constructor(host, opts = {}) {
      this.o = Object.assign(
        {
          seconds: 12,
          nowAt: 0.7,
          hz: 30,
          top: "",
          bottom: "",
          label: "",
          stripH: 0,
          tagColors: {},
          stripColors: {},
          stripLabels: null
        },
        opts
      );
      this.t = 0;
      this.pastSec = this.o.seconds * this.o.nowAt;
      this.value = new Series(this.pastSec + 1, this.o.hz);
      this.strip = this.o.stripH ? new Series(this.pastSec + 1, this.o.hz) : null;
      this.guide = this.o.guide || null;
      this.markers = [];
      this.now = null; // latest value (0..1) or null when silent
      this.nowTag = 0;
      this.banner = "";
      this.sub = "";
      this.big = "";
      // Inside a bigger picture (host is that picture's Surface), the
      // picture paints this with paintAt(); otherwise it owns a canvas.
      this.embedded = host instanceof Surface;
      this.surface = this.embedded
        ? host
        : new Surface(host, (ctx, w, h) => this._paint(ctx, w, h), {
            label: this.o.label,
            captionHidden: this.o.captionHidden,
            className: "vz-timeline" + (this.o.className ? " " + this.o.className : "")
          });
    }
    /** Paint into a box of a bigger picture. */
    paintAt(ctx, x, y, w, h) {
      paintBox(ctx, x, y, w, h, () => this._paint(ctx, w, h));
    }
    /** Advance time; `value` null = nothing to plot (silence). */
    push(dt, value, tag = 0, stripTag = 0) {
      this.t += dt;
      this.now = value;
      this.nowTag = tag;
      this.value.push(dt, value == null ? NaN : value, tag);
      if (this.strip) this.strip.push(dt, stripTag, stripTag);
      this.surface.draw();
    }
    /** A labelled tick at the current time (or at time `at`). */
    mark(text, opts = {}) {
      this.markers.push({
        t: opts.at != null ? opts.at : this.t,
        text,
        color: opts.color || C.done,
        line: opts.line
      });
      if (this.markers.length > 60) this.markers.shift();
      this.surface.draw();
    }
    setGuide(fn) {
      this.guide = fn;
      this.surface.draw();
    }
    /** Words drawn over the picture: a headline, a big number, a sub-line. */
    setText(banner, big, sub) {
      this.banner = banner || "";
      this.big = big || "";
      this.sub = sub || "";
      this.surface.draw();
    }
    reset() {
      this.t = 0;
      this.value.clear();
      if (this.strip) this.strip.clear();
      this.markers = [];
      this.now = null;
      this.surface.draw();
    }
    destroy() {
      if (!this.embedded) this.surface.destroy();
    }

    _paint(ctx, w, h) {
      const o = this.o;
      const reduced = reducedMotion();
      const padL = 8;
      const padR = 8;
      // A short picture (a rotated phone) keeps the words on one tight line
      const compact = h < 150;
      this._compact = compact;
      const padT = compact ? 22 : 30; // room for the banner line
      const stripH = this.strip ? o.stripH : 0;
      const padB = (compact || !this.sub ? 8 : 18) + stripH;
      const plotW = w - padL - padR;
      const plotH = Math.max(30, h - padT - padB);
      // On a narrow phone fewer seconds fit legibly: keep at least
      // `minPxPerSec` so a slope still reads as a slope.
      const seconds = o.minPxPerSec ? Math.min(o.seconds, plotW / o.minPxPerSec) : o.seconds;
      const secPerPx = seconds / plotW;
      // Scroll: now sits at nowAt. Reduced motion: a page fills left to right.
      let nowX;
      let tLeft;
      if (reduced) {
        const page = this.pastSec;
        const inPage = this.t % page;
        tLeft = this.t - inPage;
        nowX = padL + (inPage / secPerPx) * 1;
      } else {
        nowX = padL + plotW * o.nowAt;
        tLeft = this.t - (nowX - padL) * secPerPx;
      }
      const xOf = (t) => padL + (t - tLeft) / secPerPx;
      this._plot = { top: padT, h: plotH };
      const yOf = (v) => padT + plotH - clamp(v, 0, 1) * plotH;

      // Panel + the "coming up" side
      ctx.fillStyle = C.bg;
      roundRect(ctx, 0, 0, w, h, 10);
      ctx.fill();
      ctx.fillStyle = "rgba(143, 211, 255, 0.045)";
      ctx.fillRect(nowX, padT, w - padR - nowX, plotH);
      // Grid: quarters
      ctx.strokeStyle = C.grid;
      ctx.lineWidth = 1;
      for (let k = 1; k < 4; k++) {
        const y = padT + (plotH * k) / 4;
        ctx.beginPath();
        ctx.moveTo(padL, y);
        ctx.lineTo(w - padR, y);
        ctx.stroke();
      }
      // Axis words (what up and down mean) — words, not numbers
      ctx.font = font(10, 700);
      ctx.fillStyle = C.faint;
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      if (o.top) ctx.fillText(o.top, padL + 2, padT + 2);
      ctx.textBaseline = "bottom";
      if (o.bottom) ctx.fillText(o.bottom, padL + 2, padT + plotH - 2);

      // Guide: band + centre line, past and future
      if (this.guide) {
        const tA = tLeft;
        const tB = tLeft + plotW * secPerPx;
        const step = Math.max(1 / 30, secPerPx * 3);
        const top = [];
        const bot = [];
        const mid = [];
        for (let t = Math.max(0, tA); t <= tB; t += step) {
          const g = this.guide(t);
          if (!g) {
            if (top.length) this._band(ctx, top, bot, mid, xOf, yOf, nowX);
            top.length = bot.length = mid.length = 0;
            continue;
          }
          top.push([t, g.hi != null ? g.hi : g.y]);
          bot.push([t, g.lo != null ? g.lo : g.y]);
          mid.push([t, g.y]);
        }
        if (top.length) this._band(ctx, top, bot, mid, xOf, yOf, nowX);
      }

      // Extra guide lines (e.g. the ribs, which stay wide while the air goes)
      (o.lines || []).forEach((ln) => {
        const tA = Math.max(0, tLeft);
        const tB = tLeft + plotW * secPerPx;
        const step = Math.max(1 / 30, secPerPx * 3);
        ctx.strokeStyle = ln.color || C.text;
        ctx.lineWidth = ln.width || 2;
        ctx.setLineDash(ln.dash || [6, 5]);
        ctx.beginPath();
        let started = false;
        let lastY = null;
        for (let t = tA; t <= tB; t += step) {
          const v = ln.fn(t);
          if (v == null) {
            started = false;
            continue;
          }
          const px = xOf(t);
          const py = yOf(v);
          if (started) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
          started = true;
          lastY = py;
        }
        ctx.stroke();
        ctx.setLineDash([]);
        if (ln.label && lastY != null) {
          label(ctx, ln.label, w - padR - 2, clamp(lastY - 11, padT + 8, padT + plotH - 8), {
            align: "right",
            font: font(10, 700),
            color: ln.color || C.text
          });
        }
      });

      // Markers (rungs cleared, pauses counted, phases)
      let labelEnd = -1e9;
      this.markers.forEach((m) => {
        const x = xOf(m.t);
        if (x < padL - 2 || x > w - padR) return;
        if (m.line === false) {
          // A light label only: the name of what starts here, ahead of now
          // (behind now it is history the wave already shows)
          if (x < nowX - 1) return;
          ctx.strokeStyle = m.color;
          ctx.globalAlpha = 0.6;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.moveTo(x, padT + plotH - 6);
          ctx.lineTo(x, padT + plotH);
          ctx.stroke();
          ctx.globalAlpha = 1;
          if (m.text && x < w - padR - 20) {
            ctx.font = font(10, 700);
            const tw = ctx.measureText(m.text).width;
            if (x + 3 > labelEnd + 6) {
              ctx.fillStyle = m.color;
              ctx.textAlign = "left";
              ctx.textBaseline = "bottom";
              ctx.fillText(m.text, x + 3, padT + plotH - 2, Math.max(30, w - padR - x - 6));
              labelEnd = x + 3 + tw;
            }
          }
          return;
        }
        ctx.strokeStyle = m.color;
        ctx.globalAlpha = 0.8;
        ctx.setLineDash([3, 4]);
        ctx.beginPath();
        ctx.moveTo(x, padT);
        ctx.lineTo(x, padT + plotH);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        if (m.text) label(ctx, m.text, x + 3, padT + 10, { font: font(10, 700), color: m.color });
      });

      // Your line
      const v = this.value;
      const dtS = 1 / v.hz;
      const tEnd = this.t;
      let prev = null;
      ctx.lineWidth = 2.5;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      v.each((val, tag, idx) => {
        const t = tEnd - (v.n - 1 - idx) * dtS;
        const x = xOf(t);
        if (x < padL || x > nowX + 0.5 || Number.isNaN(val)) {
          prev = null;
          return;
        }
        const y = yOf(val);
        if (prev) {
          ctx.strokeStyle = o.tagColors[tag] || C.you;
          ctx.beginPath();
          ctx.moveTo(prev[0], prev[1]);
          ctx.lineTo(x, y);
          ctx.stroke();
        }
        prev = [x, y];
      });

      // Strip along the bottom (speech / silence, trill on / off …)
      if (this.strip) {
        const sy = padT + plotH + 6;
        let run = null;
        const flush = (endX) => {
          if (!run) return;
          const col = o.stripColors[run.tag];
          if (col) {
            ctx.fillStyle = col;
            roundRect(ctx, run.x, sy, Math.max(2, endX - run.x), stripH - 4, 3);
            ctx.fill();
          }
          run = null;
        };
        this.strip.each((val, tag, idx) => {
          const t = tEnd - (this.strip.n - 1 - idx) * dtS;
          const x = xOf(t);
          if (x < padL || x > nowX) return;
          if (!run || run.tag !== tag) {
            flush(x);
            run = { x, tag };
          }
        });
        flush(nowX);
        if (o.stripLabels) {
          ctx.font = font(9, 700);
          ctx.fillStyle = C.faint;
          ctx.textAlign = "right";
          ctx.textBaseline = "middle";
          ctx.fillText(o.stripLabels, w - padR - 2, sy + (stripH - 4) / 2);
        }
      }

      // Now line + your dot
      ctx.strokeStyle = "rgba(238, 243, 250, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(nowX, padT - 4);
      ctx.lineTo(nowX, padT + plotH + 2);
      ctx.stroke();
      if (this.now != null && !Number.isNaN(this.now)) {
        const y = yOf(this.now);
        const col = o.tagColors[this.nowTag] || C.you;
        ctx.fillStyle = "rgba(191, 230, 255, 0.16)";
        ctx.beginPath();
        ctx.arc(nowX, y, 11, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = col;
        ctx.beginPath();
        ctx.arc(nowX, y, 5.5, 0, Math.PI * 2);
        ctx.fill();
      }

      // Words: banner (what to do now) left, big number right
      const lineY = compact ? 11 : 15;
      if (this.banner) {
        ctx.font = font(compact || w < 360 ? 13 : 15, 800);
        ctx.fillStyle = C.text;
        ctx.textAlign = "left";
        ctx.textBaseline = "middle";
        ctx.fillText(this.banner, padL + 2, lineY, w * 0.74);
      }
      if (this.big) {
        ctx.font = font(compact ? 16 : w < 360 ? 18 : 22, 800, true);
        ctx.fillStyle = C.text;
        ctx.textAlign = "right";
        ctx.textBaseline = "middle";
        ctx.fillText(this.big, w - padR - 2, lineY);
      }
      if (this.sub && !compact) {
        ctx.font = font(11, 600);
        ctx.fillStyle = C.muted;
        ctx.textAlign = "left";
        ctx.textBaseline = "bottom";
        ctx.fillText(this.sub, padL + 2, h - 3 - stripH, w - padL - padR);
      }
    }

    _band(ctx, top, bot, mid, xOf, yOf, nowX) {
      // Fill the band, brighter past "now" is not needed: the future is the
      // part to read, so it keeps full strength and the past dims.
      ctx.beginPath();
      top.forEach(([t, v], i) => (i ? ctx.lineTo(xOf(t), yOf(v)) : ctx.moveTo(xOf(t), yOf(v))));
      for (let i = bot.length - 1; i >= 0; i--) ctx.lineTo(xOf(bot[i][0]), yOf(bot[i][1]));
      ctx.closePath();
      ctx.fillStyle = C.targetSoft;
      ctx.fill();
      ctx.strokeStyle = C.target;
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      mid.forEach(([t, v], i) => (i ? ctx.lineTo(xOf(t), yOf(v)) : ctx.moveTo(xOf(t), yOf(v))));
      ctx.stroke();
      // Dim the past half of the guide
      const x0 = xOf(top[0][0]);
      if (x0 < nowX) {
        ctx.fillStyle = "rgba(11, 17, 25, 0.35)";
        ctx.fillRect(x0, this._plot.top, nowX - x0, this._plot.h);
      }
    }
  }

  /* —— Phase track: timed guidance where nothing can be measured —— */

  /**
   * The current step in large type with its countdown, and every step of the
   * exercise as a segmented bar underneath, sized by its duration. Used where
   * the microphone has nothing honest to say (a jaw release, a face change,
   * a pen in the teeth): the value is being walked through all of it at the
   * right pace. `art(ctx, box, index, frac)` may draw a small illustration of
   * the step above the bar.
   */
  class PhaseTrack {
    constructor(host, opts = {}) {
      this.o = Object.assign({ phases: [], label: "", art: null, doneText: "" }, opts);
      this.index = 0;
      this.remaining = this.o.phases[0]?.sec || 0;
      this.done = false;
      this.note = "";
      this.cue = "";
      this.embedded = host instanceof Surface;
      this.surface = this.embedded
        ? host
        : new Surface(host, (ctx, w, h) => this._paint(ctx, w, h), {
            label: this.o.label,
            className: "vz-phases"
          });
    }
    paintAt(ctx, x, y, w, h) {
      paintBox(ctx, x, y, w, h, () => this._paint(ctx, w, h));
    }
    set(index, remaining, done) {
      this.index = index;
      this.remaining = remaining;
      this.done = !!done;
      this.surface.draw();
    }
    setText(cue, note) {
      this.cue = cue || "";
      this.note = note || "";
      this.surface.draw();
    }
    destroy() {
      if (!this.embedded) this.surface.destroy();
    }
    _paint(ctx, w, h) {
      const phases = this.o.phases;
      const total = phases.reduce((a, p) => a + (p.sec || 0), 0) || 1;
      ctx.fillStyle = C.bg;
      roundRect(ctx, 0, 0, w, h, 10);
      ctx.fill();
      const pad = 10;
      const cur = phases[Math.min(this.index, phases.length - 1)];
      const frac = cur && cur.sec ? clamp(1 - this.remaining / cur.sec, 0, 1) : 1;
      // Headline + countdown ring
      const ringR = Math.min(26, h * 0.16);
      const cx = w - pad - ringR - 2;
      const cy = pad + ringR + 2;
      ctx.lineWidth = 5;
      ctx.strokeStyle = C.grid;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = this.done ? C.done : C.target;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + (this.done ? 1 : 1 - frac) * Math.PI * 2);
      ctx.stroke();
      ctx.font = font(ringR > 20 ? 15 : 12, 800, true);
      ctx.fillStyle = C.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(this.done ? "✓" : String(Math.max(0, Math.ceil(this.remaining))), cx, cy + 1);
      const title = this.done ? this.o.doneText || L("Listo", "Done") : cur?.label || "";
      ctx.textAlign = "left";
      ctx.fillStyle = C.text;
      ctx.font = font(w < 360 ? 15 : 17, 800);
      ctx.fillText(title, pad, pad + 12, cx - ringR - pad * 2);
      if (!this.done && phases.length > 1) {
        ctx.font = font(11, 700);
        ctx.fillStyle = C.muted;
        ctx.fillText(
          L(`Paso ${this.index + 1} de ${phases.length}`, `Step ${this.index + 1} of ${phases.length}`),
          pad,
          pad + 32
        );
      }
      // Illustration area
      const barH = 12;
      const barY = h - pad - barH - 14;
      const artTop = pad + 44;
      const artH = barY - artTop - 8;
      if (this.o.art && artH > 40) {
        try {
          this.o.art(ctx, { x: pad, y: artTop, w: w - pad * 2, h: artH }, this.index, frac, this.done);
        } catch (err) {
          console.warn("[viz art]", err);
        }
      } else if (this.cue && artH > 24) {
        ctx.font = font(13, 600);
        ctx.fillStyle = C.muted;
        wrapText(ctx, this.cue, pad, artTop + 10, w - pad * 2, 17, Math.max(1, Math.floor(artH / 17)));
      }
      // Segmented bar
      let x = pad;
      const bw = w - pad * 2;
      phases.forEach((p, i) => {
        const segW = Math.max(6, (bw * (p.sec || 0)) / total - 3);
        ctx.fillStyle = C.grid;
        roundRect(ctx, x, barY, segW, barH, 4);
        ctx.fill();
        const f = this.done || i < this.index ? 1 : i === this.index ? frac : 0;
        if (f > 0) {
          ctx.fillStyle = i < this.index || this.done ? C.done : C.target;
          roundRect(ctx, x, barY, Math.max(4, segW * f), barH, 4);
          ctx.fill();
        }
        if (i === this.index && !this.done) {
          ctx.strokeStyle = C.text;
          ctx.lineWidth = 1.5;
          roundRect(ctx, x, barY, segW, barH, 4);
          ctx.stroke();
        }
        x += segW + 3;
      });
      if (this.note) {
        ctx.font = font(11, 600);
        ctx.fillStyle = C.muted;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText(this.note, pad, barY + barH + 3, bw);
      }
    }
  }

  function wrapText(ctx, text, x, y, maxW, lineH, maxLines) {
    const words = String(text).split(/\s+/);
    let line = "";
    let n = 0;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    for (let i = 0; i < words.length; i++) {
      const test = line ? line + " " + words[i] : words[i];
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(n === maxLines - 1 && i < words.length ? line + " …" : line, x, y + n * lineH);
        n++;
        if (n >= maxLines) return;
        line = words[i];
      } else line = test;
    }
    if (line) ctx.fillText(line, x, y + n * lineH);
  }

  /* —— Painters: small pieces a picture is built from —— */

  /** Run `fn` with the origin moved to (x, y) and drawing clipped to w×h. */
  function paintBox(ctx, x, y, w, h, fn) {
    ctx.save();
    ctx.translate(Math.round(x), Math.round(y));
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
    try {
      fn();
    } finally {
      ctx.restore();
    }
  }

  /** The dark rounded panel every picture sits on. */
  function panel(ctx, w, h) {
    ctx.fillStyle = C.bg;
    roundRect(ctx, 0, 0, w, h, 10);
    ctx.fill();
  }

  let _hatch = null;
  /** Diagonal hatching: "estimated", "assisted" or "air only" — never a verdict. */
  function hatch(ctx, color) {
    if (!_hatch || _hatch.color !== color) {
      const c = document.createElement("canvas");
      c.width = c.height = 8;
      const g = c.getContext("2d");
      g.strokeStyle = color;
      g.lineWidth = 1.5;
      g.beginPath();
      g.moveTo(-2, 10);
      g.lineTo(10, -2);
      g.moveTo(6, 10);
      g.lineTo(10, 6);
      g.moveTo(-2, 2);
      g.lineTo(2, -2);
      g.stroke();
      _hatch = { color, pattern: ctx.createPattern(c, "repeat") };
    }
    return _hatch.pattern;
  }

  /**
   * A row of steps (rungs, takes, rounds, topics, notes): done ones keep a
   * check and stay filled, the current one is outlined and fills with its
   * time, the next ones wait as outlines — so what comes next is always in
   * view and nothing earned ever empties.
   * items: [{ label, sub?, done?, value? }]; opts: { current, frac, compact }
   */
  function chips(ctx, box, items, opts = {}) {
    const n = items.length;
    if (!n) return;
    const gap = 4;
    const cur = opts.current != null ? opts.current : -1;
    const h = box.h;
    // The current chip gets more room so its words fit
    const weightCur = n > 5 ? 2.2 : 1.4;
    const unit = (box.w - gap * (n - 1)) / (n - 1 + (cur >= 0 && cur < n ? weightCur : 1));
    let x = box.x;
    const small = h < 30 || unit < 44;
    items.forEach((it, i) => {
      const isCur = i === cur;
      const w = isCur ? unit * weightCur : unit;
      const done = !!it.done || (opts.doneBefore && i < cur);
      ctx.fillStyle = done ? "rgba(255, 211, 110, 0.16)" : "rgba(170, 195, 230, 0.07)";
      roundRect(ctx, x, box.y, w, h, 7);
      ctx.fill();
      if (isCur && opts.frac != null) {
        ctx.fillStyle = C.targetSoft;
        roundRect(ctx, x, box.y, Math.max(6, w * clamp(opts.frac, 0, 1)), h, 7);
        ctx.fill();
      }
      ctx.lineWidth = isCur ? 2 : 1;
      ctx.strokeStyle = isCur ? C.text : done ? "rgba(255, 211, 110, 0.55)" : C.grid;
      roundRect(ctx, x + 0.5, box.y + 0.5, w - 1, h - 1, 7);
      ctx.stroke();
      const mark = done ? "✓ " : "";
      const text = (isCur || !small ? it.label : it.short || it.label) || "";
      ctx.fillStyle = done ? C.done : isCur ? C.text : C.muted;
      ctx.font = font(isCur ? (small ? 11 : 12) : small ? 10 : 11, isCur ? 800 : 700);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const hasSub = it.sub && h >= 34;
      ctx.fillText(mark + text, x + w / 2, box.y + (hasSub ? h * 0.36 : h / 2) + 0.5, w - 6);
      if (hasSub) {
        ctx.font = font(10, 600);
        ctx.fillStyle = done ? C.done : C.faint;
        ctx.fillText(it.sub, x + w / 2, box.y + h * 0.72, w - 6);
      }
      x += w + gap;
    });
  }

  /**
   * A horizontal gauge: a scale from lo to hi, target band(s) with words, and
   * your marker. For readings meant for the corner of the eye (pace while
   * reading, level while counting), the words matter as much as the marker.
   * opts: { value, lo, hi, bands: [{ from, to, label }], ghosts: [{ v, label }],
   *         left, right (end words), markerLabel, estimate (hatched = aprox.) }
   */
  function gauge(ctx, box, opts) {
    const { x, y, w, h } = box;
    const lo = opts.lo;
    const hi = opts.hi;
    const xOf = (v) => x + ((clamp(v, lo, hi) - lo) / (hi - lo)) * w;
    const barY = y + h * 0.3;
    const barH = Math.max(10, h * 0.34);
    ctx.fillStyle = "rgba(170, 195, 230, 0.08)";
    roundRect(ctx, x, barY, w, barH, barH / 2);
    ctx.fill();
    (opts.bands || []).forEach((b) => {
      const bx = xOf(b.from);
      const bw = Math.max(4, xOf(b.to) - bx);
      ctx.fillStyle = b.color || C.targetSoft;
      roundRect(ctx, bx, barY, bw, barH, 5);
      ctx.fill();
      ctx.strokeStyle = b.stroke || C.target;
      ctx.lineWidth = 1.5;
      roundRect(ctx, bx + 0.5, barY + 0.5, bw - 1, barH - 1, 5);
      ctx.stroke();
      if (b.label) {
        ctx.font = font(10, 700);
        ctx.fillStyle = b.stroke || C.target;
        ctx.textAlign = "center";
        ctx.textBaseline = "bottom";
        ctx.fillText(b.label, bx + bw / 2, barY - 3, Math.max(40, bw + 30));
      }
    });
    (opts.ghosts || []).forEach((g) => {
      const gx = xOf(g.v);
      ctx.strokeStyle = C.faint;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(gx, barY - 2);
      ctx.lineTo(gx, barY + barH + 2);
      ctx.stroke();
      if (g.label) {
        ctx.font = font(9, 700);
        ctx.fillStyle = C.faint;
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(g.label, gx, barY + barH + 3);
      }
    });
    ctx.font = font(10, 700);
    ctx.fillStyle = C.faint;
    ctx.textBaseline = "top";
    if (opts.left) {
      ctx.textAlign = "left";
      ctx.fillText(opts.left, x, barY + barH + 3);
    }
    if (opts.right) {
      ctx.textAlign = "right";
      ctx.fillText(opts.right, x + w, barY + barH + 3);
    }
    if (opts.value != null && Number.isFinite(opts.value)) {
      const mx = xOf(opts.value);
      const out = opts.value < lo || opts.value > hi;
      ctx.fillStyle = C.you;
      ctx.beginPath();
      // A triangle pointing at the bar; clamped values get a chevron instead
      if (out) {
        const dir = opts.value < lo ? -1 : 1;
        ctx.moveTo(mx + dir * 7, barY + barH / 2);
        ctx.lineTo(mx - dir * 3, barY - 4);
        ctx.lineTo(mx - dir * 3, barY + barH + 4);
      } else {
        ctx.moveTo(mx, barY + barH - 2);
        ctx.lineTo(mx - 7, barY - 9);
        ctx.lineTo(mx + 7, barY - 9);
      }
      ctx.closePath();
      ctx.fill();
      ctx.fillRect(mx - 1.5, barY, 3, barH);
      if (opts.markerLabel) {
        label(ctx, opts.markerLabel, clamp(mx, x + 30, x + w - 30), barY - 17, {
          align: "center",
          font: font(11, 800),
          color: C.you
        });
      }
    }
  }

  /** A progress ring (a pause filling to its target, a hold, a countdown). */
  function ring(ctx, cx, cy, r, frac, opts = {}) {
    ctx.lineCap = "round";
    ctx.lineWidth = opts.width || Math.max(4, r * 0.18);
    ctx.strokeStyle = opts.track || C.grid;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.stroke();
    if (frac > 0) {
      ctx.strokeStyle = opts.color || C.target;
      ctx.beginPath();
      ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + clamp(frac, 0, 1) * Math.PI * 2);
      ctx.stroke();
    }
    (opts.ticks || []).forEach((t) => {
      const a = -Math.PI / 2 + clamp(t, 0, 1) * Math.PI * 2;
      ctx.strokeStyle = C.text;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (r - 7), cy + Math.sin(a) * (r - 7));
      ctx.lineTo(cx + Math.cos(a) * (r + 7), cy + Math.sin(a) * (r + 7));
      ctx.stroke();
    });
    ctx.lineCap = "butt";
  }

  /**
   * Speech and silence over the last `seconds` (from a VTFeatures.Vad):
   * speech as solid blocks, pauses as gaps with their length written in the
   * gap once they are long enough to matter. Pauses in `goodPause` [lo, hi]
   * seconds get a notch and a check — shape and word, not only colour.
   * Marks (taps, flags) are { t, kind, label } drawn as small glyphs above.
   */
  function speechStrip(ctx, box, vad, opts = {}) {
    const { x, y, w, h } = box;
    // Live: the last `seconds` up to now. Review: a fixed `range` [from, to].
    const range = opts.range || null;
    const seconds = range ? Math.max(0.5, range[1] - range[0]) : opts.seconds || 20;
    const tNow = range ? range[1] : vad.t;
    const t0 = range ? range[0] : tNow - seconds * (opts.nowAt != null ? opts.nowAt : 1);
    const xOf = (t) => x + ((t - t0) / seconds) * w;
    const nowX = xOf(tNow);
    ctx.fillStyle = "rgba(170, 195, 230, 0.06)";
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();
    const good = opts.goodPause || null;
    const minLabel = opts.minLabel != null ? opts.minLabel : 0.4;
    vad.segments.forEach((g) => {
      const end = g.end != null ? g.end : vad.t;
      if (end < t0 || g.start > tNow) return;
      const a = Math.max(x, xOf(g.start));
      const b = Math.min(nowX, xOf(end));
      if (b <= a) return;
      if (g.kind === "speech") {
        ctx.fillStyle = C.you;
        ctx.globalAlpha = 0.85;
        roundRect(ctx, a, y + h * 0.22, Math.max(2, b - a), h * 0.56, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        const len = end - g.start;
        const inGood = good && len >= good[0] && len <= good[1];
        if (inGood && g.end != null) {
          ctx.fillStyle = C.targetSoft;
          roundRect(ctx, a, y + 2, b - a, h - 4, 4);
          ctx.fill();
        }
        if (len >= minLabel && b - a > 26) {
          ctx.font = font(h < 26 ? 10 : 11, 800);
          ctx.fillStyle = inGood ? C.target : C.muted;
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          const txt = (inGood && g.end != null ? "✓ " : "") + fmtSec(len);
          ctx.fillText(txt, (a + b) / 2, y + h / 2 + 0.5, b - a - 4);
        }
      }
    });
    (opts.marks || []).forEach((m) => {
      const mx = xOf(m.t);
      if (mx < x || mx > nowX + 1) return;
      glyph(ctx, m.kind || "dot", mx, y - 1, m.color || C.done, 6);
    });
    if (!range) {
      ctx.strokeStyle = "rgba(238, 243, 250, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(nowX, y - 3);
      ctx.lineTo(nowX, y + h + 3);
      ctx.stroke();
    }
  }

  /** Seconds as words: 0,8 s / 0.8 s (decimal comma in Spanish). */
  function fmtSec(sec, digits = 1) {
    const s = Number(sec || 0).toFixed(digits);
    return (isEs() ? s.replace(".", ",") : s) + " s";
  }
  /** A number with the language's decimal mark. */
  function fmtNum(n, digits = 1) {
    const s = Number(n || 0).toFixed(digits);
    return isEs() ? s.replace(".", ",") : s;
  }

  /**
   * Small shapes that carry meaning without colour:
   * check ✓, flag, tri (down triangle), up (up caret), square, dot, star,
   * notch (a V cut), cross.
   */
  function glyph(ctx, kind, x, y, color, s = 6) {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    switch (kind) {
      case "check":
        ctx.moveTo(x - s, y);
        ctx.lineTo(x - s * 0.3, y + s * 0.7);
        ctx.lineTo(x + s, y - s * 0.8);
        ctx.stroke();
        return;
      case "flag":
        ctx.moveTo(x, y + s * 1.6);
        ctx.lineTo(x, y - s);
        ctx.lineTo(x + s * 1.3, y - s * 0.45);
        ctx.lineTo(x, y + s * 0.1);
        ctx.stroke();
        ctx.fill();
        return;
      case "tri":
        ctx.moveTo(x - s, y - s * 0.6);
        ctx.lineTo(x + s, y - s * 0.6);
        ctx.lineTo(x, y + s * 0.9);
        ctx.closePath();
        ctx.stroke();
        return;
      case "up":
        ctx.moveTo(x - s, y + s * 0.6);
        ctx.lineTo(x, y - s * 0.7);
        ctx.lineTo(x + s, y + s * 0.6);
        ctx.stroke();
        return;
      case "square":
        ctx.rect(x - s * 0.7, y - s * 0.7, s * 1.4, s * 1.4);
        ctx.fill();
        return;
      case "star": {
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? s * 0.45 : s;
          const a = -Math.PI / 2 + (i * Math.PI) / 5;
          const px = x + Math.cos(a) * r;
          const py = y + Math.sin(a) * r;
          if (i) ctx.lineTo(px, py);
          else ctx.moveTo(px, py);
        }
        ctx.closePath();
        ctx.fill();
        return;
      }
      case "notch":
        ctx.moveTo(x - s * 0.8, y - s * 0.8);
        ctx.lineTo(x, y + s * 0.5);
        ctx.lineTo(x + s * 0.8, y - s * 0.8);
        ctx.stroke();
        return;
      case "cross":
        ctx.moveTo(x - s * 0.6, y - s * 0.6);
        ctx.lineTo(x + s * 0.6, y + s * 0.6);
        ctx.moveTo(x + s * 0.6, y - s * 0.6);
        ctx.lineTo(x - s * 0.6, y + s * 0.6);
        ctx.stroke();
        return;
      default:
        ctx.arc(x, y, s * 0.55, 0, Math.PI * 2);
        ctx.fill();
    }
  }

  /**
   * A strip of tagged cells over time (a Series of tags): each tag has a
   * shape, not only a colour — e.g. a zig-zag for a trill, a flat bar for a
   * plain tone, dots for air, nothing for silence.
   * styles: { tag: { color, shape: "zigzag"|"bar"|"dots"|"hatch"|"none", label } }
   */
  function tagStrip(ctx, box, series, styles, opts = {}) {
    const { x, y, w, h } = box;
    ctx.fillStyle = "rgba(170, 195, 230, 0.06)";
    roundRect(ctx, x, y, w, h, 6);
    ctx.fill();
    const n = series.n;
    const cellW = w / n;
    let run = null;
    const flush = (endX) => {
      if (!run) return;
      const st = styles[run.tag];
      if (st && st.shape !== "none") drawRun(ctx, st, run.x, y, endX - run.x, h);
      run = null;
    };
    series.each((v, tag, idx) => {
      const cx = x + idx * cellW;
      if (!run || run.tag !== tag) {
        flush(cx);
        run = { tag, x: cx };
      }
    });
    flush(x + n * cellW);
    if (opts.nowLine !== false) {
      ctx.strokeStyle = "rgba(238, 243, 250, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(x + w, y - 2);
      ctx.lineTo(x + w, y + h + 2);
      ctx.stroke();
    }
  }
  function drawRun(ctx, st, x, y, w, h) {
    if (w < 1) return;
    const mid = y + h / 2;
    ctx.strokeStyle = st.color;
    ctx.fillStyle = st.color;
    if (st.shape === "zigzag") {
      const amp = h * 0.32;
      const step = 5;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(x, mid);
      let up = true;
      for (let px = x + step / 2; px <= x + w; px += step / 2) {
        ctx.lineTo(px, mid + (up ? -amp : amp));
        up = !up;
      }
      ctx.stroke();
    } else if (st.shape === "bar") {
      roundRect(ctx, x, mid - h * 0.14, Math.max(2, w), h * 0.28, 3);
      ctx.fill();
    } else if (st.shape === "dots") {
      for (let px = x + 3; px < x + w; px += 7) {
        ctx.beginPath();
        ctx.arc(px, mid, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    } else if (st.shape === "hatch") {
      ctx.fillStyle = hatch(ctx, st.color);
      roundRect(ctx, x, y + 3, w, h - 6, 3);
      ctx.fill();
    } else if (st.shape === "block") {
      roundRect(ctx, x, y + h * 0.2, Math.max(2, w), h * 0.6, 3);
      ctx.fill();
    }
  }

  /** A small line of values (a breath card, a rung's ribbon). */
  function sparkline(ctx, box, values, opts = {}) {
    const { x, y, w, h } = box;
    const vals = Array.from(values).filter((v) => Number.isFinite(v));
    if (vals.length < 2) return;
    const lo = opts.lo != null ? opts.lo : Math.min(...vals);
    const hi = opts.hi != null ? opts.hi : Math.max(...vals);
    const span = hi - lo || 1;
    if (opts.band) {
      const by0 = y + h - ((opts.band[1] - lo) / span) * h;
      const by1 = y + h - ((opts.band[0] - lo) / span) * h;
      ctx.fillStyle = C.targetSoft;
      ctx.fillRect(x, clamp(by0, y, y + h), w, clamp(by1, y, y + h) - clamp(by0, y, y + h));
    }
    ctx.strokeStyle = opts.color || C.you;
    ctx.lineWidth = opts.width || 1.8;
    ctx.beginPath();
    vals.forEach((v, i) => {
      const px = x + (i / (vals.length - 1)) * w;
      const py = y + h - ((clamp(v, lo, hi) - lo) / span) * h;
      if (i) ctx.lineTo(px, py);
      else ctx.moveTo(px, py);
    });
    ctx.stroke();
  }

  /** Words in a box, shrinking the font until they fit (down to `min`). */
  function fitText(ctx, text, x, y, maxW, px, weight = 800, min = 10) {
    let size = px;
    ctx.font = font(size, weight);
    while (size > min && ctx.measureText(text).width > maxW) {
      size -= 1;
      ctx.font = font(size, weight);
    }
    ctx.fillText(text, x, y, maxW);
    return size;
  }

  /** A soft chime or tick for eyes-closed practice (phase changes). */
  function chime(kind = "phase") {
    try {
      if (global.VTVizSound === false) return;
      const ctx = global.VTSharedAudioCtx;
      if (!ctx || ctx.state !== "running") return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = "sine";
      o.frequency.value = kind === "done" ? 880 : kind === "tick" ? 1320 : 660;
      const t = ctx.currentTime;
      const peak = kind === "tick" ? 0.03 : 0.05;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(peak, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0005, t + (kind === "tick" ? 0.08 : 0.35));
      o.connect(g);
      g.connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.4);
    } catch {
      /* no sound is fine */
    }
    try {
      if (kind !== "tick" && global.navigator?.vibrate) global.navigator.vibrate(30);
    } catch {
      /* ignore */
    }
  }

  global.VTViz = {
    PhaseTrack,
    wrapText,
    Timeline,
    C,
    L,
    isEs,
    reducedMotion,
    dbfs,
    levelNorm,
    clamp,
    median,
    mean,
    std,
    freqToMidi,
    frameSec,
    Series,
    Surface,
    roundRect,
    font,
    label,
    paintBox,
    panel,
    hatch,
    chips,
    gauge,
    ring,
    speechStrip,
    tagStrip,
    sparkline,
    glyph,
    fitText,
    fmtSec,
    fmtNum,
    chime,
    /** Scene constructors register here (below and in later files). */
    scenes: {}
  };
})(typeof window !== "undefined" ? window : globalThis);
