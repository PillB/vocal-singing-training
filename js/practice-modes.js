/**
 * Exercise-specific practice modes — HUD + detectors + metric patches.
 * Each mode is pedagogically distinct (not a renamed pitch game).
 */
(function (global) {
  "use strict";

  function el(html) {
    const d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstChild;
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  /** Smooth scrolling, unless the visitor asked for reduced motion. */
  function scrollBehavior() {
    try {
      return global.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth";
    } catch {
      return "smooth";
    }
  }

  /** ES default (Peruvian-clear) / EN when toggle — no heavy jargon */
  function isEs() {
    if (global.VTI18n && global.VTI18n.lang) return global.VTI18n.lang === "es";
    return (document.documentElement.lang || "es").startsWith("es");
  }
  function L(es, en) {
    return isEs() ? es : en;
  }

  /**
   * Phase labels live on the practice profiles in English only, so every mode
   * printed them untranslated in the middle of the Spanish practice screen.
   * Localize once, where the profile is mounted, rather than at each read.
   */
  const PHASE_ES = {
    "1 Whisper": "1 Susurro",
    "2 Soft": "2 Suave",
    "3 Conversational": "3 Conversacional",
    "4 Projected": "4 Proyectada",
    "5 Full room": "5 Toda la sala",
    "Curiosity face": "Cara de curiosidad",
    "Legato again": "Legato otra vez",
    "Legato line": "Línea legato",
    "Peak emotion": "Pico emocional",
    "Pen off · feel the ease": "Sin bolígrafo · siente la soltura",
    "Point / takeaway": "Idea / conclusión",
    "Rate 5 · comfortable": "Ritmo 5 · cómodo",
    "Rate 6 · slightly faster": "Ritmo 6 · un poco más rápido",
    "Rate 7 · brisk": "Ritmo 7 · ágil",
    "Rate 8 · challenge": "Ritmo 8 · reto",
    "Resolve / warmth": "Resolución / calidez",
    "Scenario 1 · colleague": "Situación 1 · colega",
    "Scenario 2 · acquaintance": "Situación 2 · conocido",
    "Scenario 3 · new contact": "Situación 3 · contacto nuevo",
    Setup: "Planteamiento",
    "Staccato again": "Staccato otra vez",
    "Staccato rounds": "Rondas de staccato",
    "Surprise face": "Cara de sorpresa",
    "Topic 1 · metaphor": "Tema 1 · metáfora",
    "Topic 2 · metaphor": "Tema 2 · metáfora",
    "Topic 3 · metaphor": "Tema 3 · metáfora",
    "Topic 4 · metaphor": "Tema 4 · metáfora",
    "Topic 5 · metaphor": "Tema 5 · metáfora",
    "With pen · count 1–60": "Con bolígrafo · cuenta 1–60"
  };

  function phaseLabelFor(phase) {
    if (!phase) return "—";
    if (isEs()) return phase.labelEs || PHASE_ES[phase.label] || phase.label || "—";
    return phase.label || phase.labelEs || "—";
  }

  /** Profiles are shared objects — clone before localizing so a language switch
   *  does not leave the previous language baked into them. */
  function localizeProfile(profile) {
    if (!profile || !Array.isArray(profile.phases)) return profile;
    return Object.assign({}, profile, {
      phases: profile.phases.map((p) => Object.assign({}, p, { label: phaseLabelFor(p) }))
    });
  }

  /** Shared phase runner for multi-step timers */
  function createPhaseRunner(phases, onPhase) {
    let idx = 0;
    let remaining = phases[0]?.sec || 0;
    let lastTick = performance.now();
    return {
      get index() {
        return idx;
      },
      get label() {
        return phases[idx]?.label || "—";
      },
      get remaining() {
        return remaining;
      },
      get count() {
        return phases.length;
      },
      tick(now) {
        if (idx >= phases.length) return;
        const dt = (now - lastTick) / 1000;
        lastTick = now;
        remaining -= dt;
        if (remaining <= 0) {
          idx++;
          if (idx < phases.length) {
            remaining = phases[idx].sec;
            if (onPhase) onPhase(idx, phases[idx]);
          } else remaining = 0;
        }
      },
      reset() {
        idx = 0;
        remaining = phases[0]?.sec || 0;
        lastTick = performance.now();
      }
    };
  }

  const Modes = {};

  /** Base helpers for all modes */
  function baseMode(spec) {
    const mode = {
      id: spec.id,
      state: {},
      profile: null,
      hud: null,
      mount(container, profile) {
        this._destroyViz();
        this.profile = localizeProfile(profile);
        this.state = { startedAt: performance.now(), patches: {}, extras: {} };
        container.innerHTML = "";
        this.hud = el(`<div class="mode-panel mode-${spec.id}"></div>`);
        container.appendChild(this.hud);
        if (spec.render) spec.render.call(this);
        // #mode-hud is not a live region (its numbers change many times a
        // second): a panel without its own announcer has its step read out
        if (this.hud && !this.hud.querySelector("[aria-live]")) {
          this.hud.querySelectorAll("[data-phase], .mode-phase").forEach((p) => p.setAttribute("aria-live", "polite"));
        }
        return this;
      },
      unmount() {
        // A mode that owns something outside its panel (a playing take, a
        // timer) lets go of it here, even when the tab is hidden
        if (typeof this.onUnmount === "function") {
          try {
            this.onUnmount();
          } catch (err) {
            console.warn("[mode unmount]", err);
          }
        }
        this._destroyViz();
        if (this.hud && this.hud.parentNode) this.hud.parentNode.removeChild(this.hud);
        this.hud = null;
      },
      /** A mode's picture (js/exercise-viz.js) and any highway layer it drew. */
      _destroyViz() {
        try {
          this.viz?.destroy?.();
        } catch {
          /* ignore */
        }
        this.viz = null;
        const pv = typeof global.VTGetPitchViz === "function" ? global.VTGetPitchViz() : null;
        if (pv && this._ownsOverlay) {
          pv.setOverlay?.(null);
          pv.setNoteQueue?.(null);
        }
        this._ownsOverlay = false;
      },
      onStart() {
        if (spec.onStart) spec.onStart.call(this);
      },
      onFrame(frame) {
        if (spec.onFrame) spec.onFrame.call(this, frame);
      },
      onStop(ctx) {
        if (spec.onStop) return spec.onStop.call(this, ctx) || { patches: this.state.patches };
        return { patches: this.state.patches || {}, summary: "" };
      },
      $(sel) {
        return this.hud ? this.hud.querySelector(sel) : null;
      }
    };
    // Bind helper methods from spec (e.g. _setStepTarget, _pushTarget)
    Object.keys(spec).forEach((k) => {
      if (
        typeof spec[k] === "function" &&
        !["render", "onStart", "onFrame", "onStop"].includes(k)
      ) {
        mode[k] = function (...args) {
          return spec[k].apply(this, args);
        };
      }
    });
    return mode;
  }

  // ——— VOCAL ———

  /**
   * v1 diction — rate ladder. Rungs 5 (comfortable) → 8 (challenge) are a pace
   * relative to the learner's own first rung: syllables per talking second
   * from the loudness envelope (VTFeatures.SyllableRate), approximate, so only
   * ever shown against that baseline. While reading (eyes on the page) one
   * slow dot on a staircase; after Stop, the pace each rung was read at and
   * how often the learner breathed. Clarity is not measurable: it stays the
   * learner's own rating, and so does "rate control".
   */
  Modes.rateLadder = baseMode({
    id: "rateLadder",
    render() {
      const phases = this.profile.phases || [];
      const st = this.state;
      // A prepared routine can give this step less time than the four rungs
      // add up to (105 s in the daily minimum): fit the ladder to the step so
      // every rung still happens.
      const total = phases.reduce((a, p) => a + (p.sec || 0), 0);
      let avail = 0;
      try {
        avail = Number(global.VTApp?.getState?.()?.timer?.total) || 0;
      } catch {
        avail = 0;
      }
      const scale = avail > 0 && total > avail ? avail / total : 1;
      const words = [
        [L("cómodo", "comfortable"), L("cómodo", "easy")],
        [L("un poco más rápido", "a bit faster"), L("+ rápido", "faster")],
        [L("ágil", "brisk"), L("ágil", "brisk")],
        [L("reto", "challenge"), L("reto", "push")]
      ];
      st.rungs = phases.map((p, i) => {
        const num = String((String(p.label || "").match(/\d+/) || [5 + i])[0]);
        // Treads relative to the first rung, wide because the count is approximate
        const lo = [0.9, 1.05, 1.15, 1.25][i] || 1.25 + (i - 3) * 0.1;
        const hi = [1.1, 1.3, 1.45, 1.65][i] || 1.65 + (i - 3) * 0.1;
        const w = words[i] || [phaseLabelFor(p), phaseLabelFor(p)];
        return {
          num,
          name: `${num} · ${w[0]}`,
          word: w[1],
          label: phaseLabelFor(p),
          sec: Math.max(12, Math.round((p.sec || 60) * scale)),
          lo,
          hi,
          mid: (lo + hi) / 2,
          start: null,
          end: null,
          rel: null,
          samples: [],
          run: null
        };
      });
      st.phaseLabel = (p) => phaseLabelFor(p);
      const r0 = st.rungs[0];
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${L("Dicción · escalera de ritmo", "Diction · rate ladder")}</div>
          <button type="button" class="btn btn-ghost viz-tap" data-next-rung>${L("Siguiente peldaño →", "Next rung →")}</button>
        </div>
        <div class="viz-words">
          <span class="mode-phase" data-phase>${r0 ? r0.label : "—"}</span>
          <strong class="mode-big" data-remain>${r0 ? r0.sec + "s" : "—"}</strong>
          <span data-rate>—</span>
        </div>
        <p class="mode-meta muted">${L(
          "Sobre-articula la misma página. El punto es tu ritmo (sílabas por segundo, aprox.) frente a tu propio primer peldaño; la claridad la juzgas tú.",
          "Over-articulate the same page. The dot is your pace (syllables per second, approx.) against your own first rung; clarity is yours to judge."
        )}</p>
      `;
      this.$("[data-next-rung]")?.addEventListener("click", () => this._nextRung(false));
      this._resetLadder();
      this._mountViz();
    },
    _resetLadder() {
      const st = this.state;
      const F = global.VTFeatures;
      const K = global.VTViz?.speechTiming;
      st.current = 0;
      st.remaining = st.rungs[0]?.sec || 0;
      st.frac = 0;
      st.done = !st.rungs.length;
      st.review = false;
      st.base = null;
      st.calib = 0;
      st.live = null;
      st.state = "idle";
      st.sinceUpd = 0;
      st.last = performance.now();
      st.rungs.forEach((r) => {
        r.start = null;
        r.end = null;
        r.rel = null;
        r.samples = [];
        r.run = null;
      });
      if (F && K) {
        st.vad = new F.Vad();
        st.rt = new K.RateTrack({ windowSec: 4 });
        st.slow = new K.SlowValue(0.8);
        if (st.rungs.length) {
          st.rt.begin(0);
          st.rungs[0].start = 0;
        }
      }
      const b = this.$("[data-next-rung]");
      if (b) b.disabled = st.done;
    },
    _mountViz() {
      const V = global.VTViz;
      if (!V || !V.scenes.rateLadder || !this.state.rt) return;
      this.hud.classList.add("has-viz");
      this.viz = new V.Surface(this.hud, (ctx, w, h) => V.scenes.rateLadder(ctx, w, h, this.state), {
        label: L(
          "Escalera de ritmo: cuatro peldaños de izquierda a derecha, cada uno un poco más rápido que tu primer peldaño. El punto es tu ritmo al leer; la franja verde, el peldaño actual.",
          "Rate ladder: four rungs from left to right, each a little faster than your first rung. The dot is your reading pace; the green band is the current rung."
        ),
        captionHidden: true
      });
      this.viz.draw();
    },
    /** Pace relative to the first rung, for a finished stretch of reading. */
    _relOf(bin) {
      const K = global.VTViz?.speechTiming;
      const st = this.state;
      if (!K || !st.base) return null;
      const r = K.RateTrack.binRate(bin, 2);
      return r != null ? r / st.base : null;
    },
    _closeRung() {
      const st = this.state;
      const r = st.rungs[st.current];
      if (!r || r.end != null || !st.rt) return;
      const bin = st.rt.bins[st.rt.bins.length - 1];
      r.end = st.rt.t;
      r.rel = this._relOf(bin);
      r.samples = bin ? bin.samples.slice() : [];
      r.run = global.VTViz.speechTiming.meanRun(st.vad, r.start, r.end);
    },
    _nextRung(auto) {
      const st = this.state;
      if (st.done || !st.rt) return;
      this._closeRung();
      const b = this.$("[data-next-rung]");
      if (st.current < st.rungs.length - 1) {
        st.current += 1;
        const nx = st.rungs[st.current];
        nx.start = st.rt.t;
        st.remaining = nx.sec;
        st.frac = 0;
        st.rt.begin(st.current);
        st.sinceUpd = 0;
        if (global.VTToast) global.VTToast(`${L("Peldaño", "Rung")} ${nx.name}`);
        this.viz?.caption?.(`${L("Peldaño", "Rung")} ${nx.name}`, 0);
      } else {
        st.done = true;
        st.remaining = 0;
        st.frac = 1;
        st.rt.begin("free");
        if (b) b.disabled = true;
        if (global.VTToast) global.VTToast(L("Escalera lista — mezcla libre", "Ladder complete — free mix"));
        this.viz?.caption?.(L("Escalera lista — mezcla libre", "Ladder complete — free mix"), 0);
      }
      if (!auto) this.viz?.draw();
    },
    _ladderState() {
      const st = this.state;
      if (!st.vad || st.vad.state === "idle") return "idle";
      if (!st.base) return "calib";
      if (!st.rt.talking && st.vad.pauseLen > 0.6) return "pause";
      const v = st.live;
      if (v == null) return st.state === "calib" ? "calib" : "pause";
      // The first rung is the baseline itself: no direction to give there
      if (st.current === 0 && !st.done) return "base";
      const r = st.rungs[Math.min(st.current, st.rungs.length - 1)];
      // A little hysteresis so the words do not flicker at the band's edge
      const m = st.state === "in" ? 0.02 : 0;
      if (v < r.lo - m) return "low";
      if (v > r.hi + m) return "high";
      return "in";
    },
    onStart() {
      this._resetLadder();
      this.hud?.classList.remove("is-replay");
      this.state.wallStart = performance.now();
      this.viz?.draw();
    },
    onFrame(frame) {
      const st = this.state;
      if (!st.rt || st.review) return;
      const K = global.VTViz.speechTiming;
      const now = performance.now();
      const dt = Math.min(0.25, Math.max(0, (now - st.last) / 1000));
      st.last = now;
      const before = st.vad.state;
      st.vad.feed(frame);
      st.rt.feed(frame);
      const phraseEnded = before === "speech" && st.vad.state === "pause";
      if (!st.done) {
        st.remaining -= dt;
        const r = st.rungs[st.current];
        st.frac = clamp(1 - st.remaining / (r.sec || 1), 0, 1);
        if (st.remaining <= 0) this._nextRung(true);
      }
      // The baseline: the first rung's own pace, refined all through it.
      // If the first rung went by unread, the next few seconds of reading
      // set it instead.
      const CALIB = 6;
      const bin = st.rt.cur;
      if (bin && (st.current === 0 || !st.base) && !(st.done && st.base)) {
        st.calib = clamp(bin.speech / CALIB, 0, 1);
        if (bin.speech >= CALIB) st.base = bin.peaks / bin.speech;
      }
      // The dot moves at the end of a phrase, or every 2.5 s of talking
      if (st.rt.talking) st.sinceUpd += dt;
      const rate = st.rt.rate;
      if (st.base && rate != null && (phraseEnded || st.sinceUpd >= 2.5 || st.slow.target == null)) {
        st.slow.set(rate / st.base);
        st.sinceUpd = 0;
      }
      st.live = st.slow.step(dt);
      const prevState = st.state;
      st.state = this._ladderState();
      // Words, for screen readers and tests (a few times a second at most)
      st._wordsAcc = (st._wordsAcc || 0) + dt;
      if (st._wordsAcc >= 0.25) {
        st._wordsAcc = 0;
        const r = st.rungs[Math.min(st.current, st.rungs.length - 1)];
        if (this.$("[data-phase]"))
          this.$("[data-phase]").textContent = st.done ? L("Escalera lista — mezcla libre", "Ladder complete — free mix") : r?.label || "—";
        if (this.$("[data-remain]")) this.$("[data-remain]").textContent = st.done ? "✓" : `${Math.ceil(st.remaining)}s`;
        if (this.$("[data-rate]")) this.$("[data-rate]").textContent = st.live != null ? K.pct(st.live) : "—";
      }
      if (phraseEnded && prevState !== st.state && (st.state === "in" || st.state === "low" || st.state === "high")) {
        const say = {
          in: L("En el peldaño", "On the rung"),
          low: L("Un poco más rápido", "A little faster"),
          high: L("Más rápido que el peldaño", "Faster than the rung")
        }[st.state];
        this.viz?.caption?.(say, 4000);
      }
      this.viz?.draw();
    },
    onStop() {
      const st = this.state;
      const K = global.VTViz?.speechTiming;
      if (st.rt && !st.review) {
        if (!st.done) this._closeRung();
        st.rt.end();
      }
      st.review = true;
      if (this.viz) {
        this.hud.classList.add("is-replay");
        this.viz.draw();
      }
      const b = this.$("[data-next-rung]");
      if (b) b.disabled = true;
      const sec = (performance.now() - (st.wallStart || st.startedAt)) / 1000;
      const mins = Math.max(1, Math.round(sec / 60));
      const seq = (st.rungs || []).filter((r) => r.rel != null).map((r) => Math.round(r.rel * 100));
      // Only what was measured: the minutes. Clarity and rate control are the
      // learner's own ratings.
      const patches = sec >= 20 ? { duration: mins } : {};
      return {
        patches,
        summary: seq.length
          ? L(`Escalera aprox.: ${seq.join(" → ")} % · ${mins} min`, `Ladder approx.: ${seq.join(" → ")}% · ${mins} min`)
          : K
            ? L("Sin ritmo medido todavía — lee unos segundos en voz alta", "No pace measured yet — read aloud for a few seconds")
            : L(`${mins} min de escalera de ritmo`, `${mins} min of rate ladder`)
      };
    }
  });

  /** v8 — distinct from rate ladder: log metaphors per topic */
  /**
   * Dry topics for the metaphor minute (v8): ordinary, concrete, a little
   * boring on purpose, so the image has to come from the speaker. Each
   * day starts at a different place in the deck.
   */
  const METAPHOR_TOPICS = [
    ["La factura del agua", "The water bill"],
    ["Una reunión de presupuesto", "A budget meeting"],
    ["Actualizar el teléfono", "Updating your phone"],
    ["El reglamento del edificio", "The building's rules"],
    ["Esperar el autobús", "Waiting for the bus"],
    ["Una hoja de cálculo", "A spreadsheet"],
    ["El seguro del auto", "Car insurance"],
    ["Ordenar el correo", "Sorting your email"],
    ["La fila del banco", "The queue at the bank"],
    ["Las contraseñas", "Passwords"],
    ["Un contrato de alquiler", "A rental contract"],
    ["La lavadora", "The washing machine"],
    ["El acta de una reunión", "Meeting minutes"],
    ["El tráfico de la mañana", "Morning traffic"],
    ["Declarar impuestos", "Filing taxes"],
    ["El manual de una impresora", "A printer manual"],
    ["Cambiar una bombilla", "Changing a light bulb"],
    ["La lista del súper", "The grocery list"]
  ];

  /**
   * v8 — metaphor fluency: five dry topics, a minute each, one fresh
   * metaphor out loud per topic. The card shows the topic; the ribbon under
   * it shows only what a microphone can tell (when you speak, how long you
   * think, when the first word came); the star is the learner's own tap.
   * The metaphor's quality is never scored.
   */
  Modes.metronomeSpeech = baseMode({
    id: "metronomeSpeech",
    render() {
      const st = this.state;
      const phases = this.profile.phases || [];
      const n = phases.length || 5;
      const deck = METAPHOR_TOPICS;
      const day = Math.floor(Date.now() / 86400000);
      st.deckNext = (day * n) % deck.length;
      const draw = () => {
        const pair = deck[st.deckNext % deck.length];
        st.deckNext += 1;
        return L(pair[0], pair[1]);
      };
      st.topics = Array.from({ length: n }, (_, i) => ({
        name: L(`Tema ${i + 1}`, `Topic ${i + 1}`),
        short: String(i + 1),
        sec: phases[i]?.sec || 60,
        text: draw(),
        start: null,
        end: null,
        stars: [],
        firstWord: null
      }));
      st.draw = draw;
      const first = st.topics[0];
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${L("Fluidez con metáforas", "Metaphor fluency")}</div>
          <button type="button" class="btn btn-ghost viz-tap" data-next-topic>${L("Siguiente tema →", "Next topic →")}</button>
        </div>
        <div class="viz-words" aria-live="polite">
          <span class="mode-phase" data-phase>${first.name} · ${first.text}</span>
          <strong class="mode-big" data-remain>${this._clock(first.sec)}</strong>
          ${L("Metáforas", "Metaphors")} <strong data-n>0</strong> / ${n}
        </div>
        <p class="mode-meta muted">${L(
          "Una imagen concreta por tema, en voz alta: «esto es como… porque…». Pensar en silencio está bien. El micrófono no juzga la metáfora: solo muestra cuándo hablas y cuánto piensas.",
          "One concrete image per topic, out loud: “this is like… because…”. Thinking in silence is fine. The mic does not judge the metaphor: it only shows when you speak and how long you think."
        )}</p>
        <div class="viz-row st-taps">
          <button type="button" class="btn btn-primary viz-tap st-tap" data-log>${L("Dije una metáfora ✓", "I spoke a metaphor ✓")}</button>
          <button type="button" class="btn btn-ghost viz-tap st-tap st-tap-swap" data-swap>${L("Otro tema ↻", "Other topic ↻")}</button>
        </div>
      `;
      this.$("[data-log]")?.addEventListener("click", () => this._star());
      this.$("[data-swap]")?.addEventListener("click", () => this._swap());
      this.$("[data-next-topic]")?.addEventListener("click", () => this._nextTopic(false));
      this._resetTopics();
      this._mountViz();
    },
    _clock(sec) {
      const s = Math.max(0, Math.ceil(sec || 0));
      return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    },
    _resetTopics() {
      const st = this.state;
      const F = global.VTFeatures;
      st.current = 0;
      st.remaining = st.topics[0]?.sec || 60;
      st.frac = 0;
      st.done = false;
      st.review = false;
      st.running = false;
      st.logged = 0;
      st.last = performance.now();
      st.lastWords = 0;
      st.topics.forEach((k) => {
        k.start = null;
        k.end = null;
        k.stars = [];
        k.firstWord = null;
      });
      if (F) st.vad = new F.Vad({});
      if (this.$("[data-n]")) this.$("[data-n]").textContent = "0";
      const b = this.$("[data-next-topic]");
      if (b) b.disabled = false;
    },
    _mountViz() {
      const V = global.VTViz;
      if (!V || !V.scenes.topicRibbon || !this.state.vad) return;
      this.hud.classList.add("has-viz");
      this.viz = new V.Surface(this.hud, (ctx, w, h) => V.scenes.topicRibbon(ctx, w, h, this.state), {
        label: L(
          "Tarjeta del tema y cinta de un minuto: bloques cuando hablas, huecos con su duración cuando piensas, y una estrella donde dijiste una metáfora.",
          "Topic card and a one-minute ribbon: blocks while you speak, gaps with their length while you think, and a star where you spoke a metaphor."
        ),
        captionHidden: true
      });
      const taps = this.$(".st-taps");
      if (taps && this.viz.wrap) this.hud.insertBefore(this.viz.wrap, taps);
      this.viz.draw();
    },
    _words() {
      const st = this.state;
      const k = st.topics[Math.min(st.current, st.topics.length - 1)];
      if (this.$("[data-phase]"))
        this.$("[data-phase]").textContent = st.done ? L("Todos los temas listos", "All topics done") : `${k.name} · ${k.text}`;
      if (this.$("[data-remain]")) this.$("[data-remain]").textContent = st.done ? "✓" : this._clock(st.remaining);
    },
    _star() {
      const st = this.state;
      const k = st.topics[Math.min(st.current, st.topics.length - 1)];
      if (!st.running || !k || !st.vad) return;
      k.stars.push(st.vad.t);
      st.logged += 1;
      if (this.$("[data-n]")) this.$("[data-n]").textContent = String(st.logged);
      this.viz?.draw();
    },
    /** A topic that gives nothing: another from the deck, and its minute starts again. */
    _swap() {
      const st = this.state;
      if (st.done) return;
      const k = st.topics[st.current];
      if (!k) return;
      k.text = st.draw();
      if (st.running && st.vad) {
        k.start = st.vad.t;
        k.firstWord = null;
        k.stars = [];
        st.logged = st.topics.reduce((s, x) => s + x.stars.length, 0);
        if (this.$("[data-n]")) this.$("[data-n]").textContent = String(st.logged);
        st.remaining = k.sec;
        st.frac = 0;
      }
      this._words();
      this.viz?.draw();
    },
    _nextTopic(auto) {
      const st = this.state;
      if (st.done || !st.vad) return;
      const k = st.topics[st.current];
      if (k && k.start != null && k.end == null) k.end = st.vad.t;
      if (st.current < st.topics.length - 1) {
        st.current += 1;
        const nx = st.topics[st.current];
        nx.start = st.running ? st.vad.t : null;
        st.remaining = nx.sec;
        st.frac = 0;
        if (global.VTToast) global.VTToast(`${nx.name} · ${nx.text}`);
      } else {
        st.done = true;
        st.remaining = 0;
        st.frac = 1;
      }
      if (st.done || st.current >= st.topics.length - 1) {
        const b = this.$("[data-next-topic]");
        if (b) b.disabled = true;
      }
      if (st.done && this.$("[data-swap]")) this.$("[data-swap]").disabled = true;
      this._words();
      if (!auto) this.viz?.draw();
    },
    onStart() {
      this._resetTopics();
      const st = this.state;
      st.running = true;
      if (st.topics[0]) st.topics[0].start = 0;
      this.hud?.classList.remove("is-replay");
      ["[data-log]", "[data-swap]"].forEach((s) => {
        if (this.$(s)) this.$(s).disabled = false;
      });
      this._words();
      this.viz?.draw();
    },
    onFrame(frame) {
      const st = this.state;
      if (!st.running || !st.vad) return;
      const now = performance.now();
      const dt = Math.min(0.25, Math.max(0, (now - st.last) / 1000));
      st.last = now;
      st.vad.feed(frame);
      const k = st.topics[st.current];
      if (k && k.start != null && k.firstWord == null && st.vad.state === "speech" && st.vad.speechStart != null) {
        k.firstWord = Math.max(0, st.vad.speechStart - k.start);
      }
      if (!st.done) {
        st.remaining -= dt;
        st.frac = clamp(1 - st.remaining / (k?.sec || 60), 0, 1);
        if (st.remaining <= 0) this._nextTopic(true);
      }
      if (now - st.lastWords > 250) {
        st.lastWords = now;
        this._words();
      }
      this.viz?.draw();
    },
    onStop() {
      const st = this.state;
      st.running = false;
      if (st.vad) {
        const k = st.topics[st.current];
        if (k && k.start != null && k.end == null) k.end = st.vad.t;
      }
      st.review = true;
      ["[data-log]", "[data-swap]", "[data-next-topic]"].forEach((s) => {
        if (this.$(s)) this.$(s).disabled = true;
      });
      if (this.viz) {
        this.hud.classList.add("is-replay");
        this.viz.draw();
      }
      const n = st.logged || 0;
      const played = (st.topics || []).filter((k) => k.start != null);
      const fw = played.filter((k) => k.firstWord != null).map((k) => global.VTViz?.fmtSec?.(k.firstWord) || `${k.firstWord.toFixed(1)} s`);
      const fwTxt = fw.length ? L(` · 1.ª palabra: ${fw.join(" → ")}`, ` · first word: ${fw.join(" → ")}`) : "";
      return {
        // Spoken metaphors are the learner's own taps; vividness stays theirs to rate
        patches: n > 0 ? { metaphorCount: n } : {},
        summary: played.length
          ? L(
              `Metáforas por tema: ${played.map((k) => k.stars.length).join(" → ")}${fwTxt}`,
              `Metaphors per topic: ${played.map((k) => k.stars.length).join(" → ")}${fwTxt}`
            )
          : L("Sin temas todavía", "No topics yet")
      };
    }
  });

  /**
   * v2 — steady volume while counting 1 to 10 on one breath. The picture is
   * the count ribbon (js/scenes/volume.js): each breath's loudness in dB
   * against your own level, the end read against the start, a card per
   * breath that stays. Breaths come from the raw sound edge (0.6 s of
   * silence ends one; `voiced` bridges a second and made every breath look
   * faded), levels from before the MIC slider's gain.
   */
  Modes.volumeSteady = baseMode({
    id: "volumeSteady",
    render() {
      this._fresh();
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${L("Volumen parejo · del 1 al 10", "Even volume · 1 to 10")}</div>
          <button type="button" class="btn btn-ghost viz-tap" data-blind aria-pressed="false">${L("A ciegas", "Blind round")}</button>
        </div>
        <div class="viz-words">
          <span data-status>${L("Inhala y cuenta del 1 al 10.", "Breathe in and count 1 to 10.")}</span>
          <strong class="mode-big" data-cyc>0</strong>
          <span data-fade></span>
        </div>
        <p class="mode-meta muted">${L(
          "Tu nivel en dB frente a ti mismo · misma distancia al micrófono en cada respiración",
          "Your level in dB against your own · the same distance from the mic every breath"
        )}</p>
      `;
      this.$("[data-blind]")?.addEventListener("click", () => this._toggleBlind());
      this._mountViz();
    },
    _fresh() {
      const st = this.state;
      st.breaths = [];
      st.cur = null;
      st.nextRef = null;
      st.T = 8;
      st.t = 0;
      st.level = null;
      st.review = false;
      st.processed = false;
      st.clipping = false;
      st.blind = !!st.blind;
    },
    _mountViz() {
      const V = global.VTViz;
      const F = global.VTFeatures;
      const K = global.VTVolumeKit;
      if (!V || !F || !K || !V.scenes.volumeCount) return;
      this.hud.classList.add("has-viz");
      this.state.kit = new K.LevelKit();
      this.state.vad = new F.Vad({});
      // .volume-lane: the name the page has always given this exercise's level picture
      this.viz = new V.Surface(this.hud, (ctx, w, h) => V.scenes.volumeCount(ctx, w, h, this.state), {
        className: "volume-lane vz-volume",
        label: L(
          "Cinta del conteo: tu volumen en dB durante cada respiración, frente a tu propio nivel (franja verde de ±3 dB). Al terminar la respiración se compara el final con el inicio y queda una tarjeta por respiración.",
          "Count ribbon: your loudness in dB through each breath, against your own level (green band, ±3 dB). When the breath ends its end is compared with its start, and each breath leaves a card."
        )
      });
      this.viz.draw();
    },
    _toggleBlind() {
      const st = this.state;
      st.blind = !st.blind;
      if (st.cur) st.cur.blind = st.blind;
      const b = this.$("[data-blind]");
      if (b) {
        b.setAttribute("aria-pressed", String(st.blind));
        b.classList.toggle("is-on", st.blind);
      }
      this.viz?.caption?.(
        st.blind
          ? L("Ronda a ciegas: la cinta aparece al terminar cada respiración.", "Blind round: the ribbon appears when each breath ends.")
          : L("Cinta visible mientras cuentas.", "Ribbon visible while you count."),
        0
      );
      this.viz?.draw();
    },
    _openBreath(start) {
      const st = this.state;
      st.cur = {
        start,
        ref: st.nextRef,
        provRef: null,
        peaks: [],
        trace: [],
        soundSec: 0,
        lastSample: -1,
        blind: st.blind
      };
      if (this.$("[data-status]")) this.$("[data-status]").textContent = L("Contando…", "Counting…");
    },
    _breathStats(b) {
      const K = global.VTVolumeKit;
      const len = b.len;
      const pick = (a, z) => {
        const p = b.peaks.filter((x) => x.t >= a && x.t <= z).map((x) => x.db);
        if (p.length) return K.median(p);
        const tr = b.trace.filter((x) => x[0] >= a && x[0] <= z && !Number.isNaN(x[1])).map((x) => x[1]);
        return tr.length >= 3 ? K.median(tr) : null;
      };
      const startMed = pick(0, len * 0.3);
      const endMed = pick(len * 0.7, len + 0.05);
      const all = b.peaks.length
        ? K.median(b.peaks.map((x) => x.db))
        : K.median(b.trace.filter((x) => !Number.isNaN(x[1])).map((x) => x[1]));
      const early = b.peaks.filter((x) => x.t <= 1).map((x) => x.db);
      return {
        startMed,
        endMed,
        diff: startMed != null && endMed != null ? endMed - startMed : null,
        median: all,
        push: early.length > 0 && all != null && Math.max(...early) - all > 4
      };
    },
    _closeBreath(endT) {
      const st = this.state;
      const K = global.VTVolumeKit;
      const b = st.cur;
      st.cur = null;
      if (!b) return;
      b.len = Math.max(0, endT - b.start);
      b.trace = b.trace.filter((p) => p[0] <= b.len + 0.05);
      b.peaks = b.peaks.filter((p) => p.t <= b.len + 0.05);
      // A cough or a single word is not a count
      if (b.len < 1.2 || b.soundSec < 0.8) return;
      if (b.ref == null) {
        b.ref = b.peaks.length >= 2 ? K.median(b.peaks.map((p) => p.db)) : K.median(b.trace.filter((p) => !Number.isNaN(p[1])).map((p) => p[1]));
      }
      if (b.ref == null) return;
      b.stats = this._breathStats(b);
      st.breaths.push(b);
      // The next breath's band: your level so far, from every breath's own median
      st.nextRef = K.median(st.breaths.map((x) => x.stats.median).filter((v) => Number.isFinite(v)));
      st.T = Math.max(8, Math.ceil(Math.max(...st.breaths.map((x) => x.len)) + 1));
      const n = st.breaths.length;
      const d = b.stats.diff;
      let words;
      if (d == null) words = L(`Respiración ${n}: corta para comparar.`, `Breath ${n}: too short to compare.`);
      else if (d <= -3)
        words = L(
          `Respiración ${n}: el final quedó ${K.fmtNum(-d, 0)} dB por debajo del inicio. Prueba a empezar un poco más suave.`,
          `Breath ${n}: the end was ${K.fmtNum(-d, 0)} dB below the start. Try starting a little softer.`
        );
      else if (d >= 3)
        words = L(`Respiración ${n}: el final subió ${K.fmtNum(d, 0)} dB sobre el inicio.`, `Breath ${n}: the end rose ${K.fmtNum(d, 0)} dB above the start.`);
      else words = L(`Respiración ${n}: pareja (${K.fmtDb(d)}).`, `Breath ${n}: even (${K.fmtDb(d)}).`);
      if (this.$("[data-cyc]")) this.$("[data-cyc]").textContent = String(n);
      if (this.$("[data-fade]")) this.$("[data-fade]").textContent = words;
      if (this.$("[data-status]")) this.$("[data-status]").textContent = L("Respira… y cuenta otra vez.", "Breathe… and count again.");
      this.viz?.caption?.(words, 1500);
    },
    onStart() {
      const st = this.state;
      this._fresh();
      st.kit?.reset();
      st.vad?.reset();
      this.hud?.classList.remove("is-replay");
      if (this.$("[data-cyc]")) this.$("[data-cyc]").textContent = "0";
      if (this.$("[data-fade]")) this.$("[data-fade]").textContent = "";
      this.viz?.draw();
    },
    onFrame(frame) {
      const st = this.state;
      if (!st.kit || st.review) return;
      const K = global.VTVolumeKit;
      const peak = st.kit.feed(frame);
      st.vad.feed(frame);
      st.t = st.kit.t;
      st.processed = st.kit.processed;
      st.clipping = st.kit.clipping;
      K.noteProcessed(st, this.viz);
      st.level = st.kit.disp;
      const vad = st.vad;
      if (!st.cur && vad.state === "speech") this._openBreath(vad.speechStart);
      const b = st.cur;
      if (b) {
        const tb = st.t - b.start;
        if (st.kit.sounding) b.soundSec += st.kit.dt;
        if (peak && peak.t >= b.start - 0.05) b.peaks.push({ t: Math.max(0, peak.t - b.start), db: peak.db });
        if (st.t - b.lastSample >= 0.04) {
          b.trace.push([tb, st.kit.sounding ? st.kit.fast : NaN]);
          b.lastSample = st.t;
        }
        if (b.ref == null) {
          // First breath: your level is what you do in its first second
          const vals = b.peaks.length >= 2 ? b.peaks.map((p) => p.db) : b.trace.filter((p) => !Number.isNaN(p[1])).map((p) => p[1]);
          b.provRef = vals.length ? K.median(vals) : null;
          if (b.soundSec >= 1.2 && b.provRef != null) b.ref = b.provRef;
        }
        if (tb > st.T - 0.6) st.T = Math.ceil(tb + 2);
        if (vad.state === "pause" && vad.pauseLen >= 0.6) this._closeBreath(vad.pauseStart);
      }
      this.viz?.draw();
    },
    onStop() {
      const st = this.state;
      const K = global.VTVolumeKit;
      if (st.cur && st.t - st.cur.start >= 1.2) this._closeBreath(st.t);
      st.cur = null;
      st.review = true;
      if (this.$("[data-status]")) this.$("[data-status]").textContent = L("Repaso de la sesión", "Session review");
      if (this.viz) {
        this.hud.classList.add("is-replay");
        this.viz.draw();
      }
      const breaths = st.breaths || [];
      // A full 1–10 count on one breath takes about 3 s or more
      const counts = breaths.filter((b) => b.len >= 3).length;
      const diffs = breaths.map((b) => b.stats && b.stats.diff).filter((v) => Number.isFinite(v));
      const med = K && diffs.length ? K.median(diffs) : null;
      const even = diffs.filter((d) => Math.abs(d) < 3).length;
      const n = breaths.length;
      const fmt = (d) => (K ? K.fmtDb(d) : `${Math.round(d)} dB`);
      const summary = n
        ? L(
            `${n} ${n === 1 ? "respiración" : "respiraciones"} · ${even} parejas · final mediano ${fmt(med)} frente al inicio`,
            `${n} ${n === 1 ? "breath" : "breaths"} · ${even} even · median end ${fmt(med)} against the start`
          )
        : L("Sin respiraciones completas todavía", "No full breaths yet");
      K?.finalCaption?.(this.viz, summary);
      return { patches: counts > 0 ? { cycles: counts } : {}, summary };
    }
  });

  /**
   * v13 — the volume ladder: the same sentence at five levels, up and back
   * down (1 2 3 4 5 · 3 1), then a short story that uses your levels. Each
   * tread sets at the level you held (dB against yourself, before the MIC
   * gain) and says how far it moved from the one before; ≥3 dB in the asked
   * direction is a distinct step. Nothing is reset: finished ladders stay as
   * ghosts, and a partial one keeps its treads.
   */
  Modes.volumeLadder = baseMode({
    id: "volumeLadder",
    render() {
      const st = this.state;
      const ladder = this.profile.ladder || [];
      st.levels = ladder.map((l) => ({ label: phaseLabelFor(l) }));
      const seq = Array.isArray(this.profile.sequence) ? this.profile.sequence : [0, 1, 2, 3, 4, 2, 0];
      st.seq = seq.filter((i) => i >= 0 && i < st.levels.length);
      st.stepSec = this.profile.stepSec || 8;
      st.storySec = this.profile.storySec || 60;
      st.repsTarget = this.profile.reps || 3;
      this._fresh();
      const first = st.levels[st.seq[0]]?.label || "—";
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${L("Escalera de volumen", "Volume ladder")}</div>
          <button type="button" class="btn btn-ghost viz-tap" data-phase-btn>${L("Historia →", "Story →")}</button>
        </div>
        <div class="viz-words">
          <span class="mode-phase" data-phase>${first}</span>
          <strong class="mode-big" data-remain>${st.stepSec}s</strong>
          <span>${L("Paso", "Step")} <strong data-step>1</strong>/${st.seq.length} · ${L("Escaleras", "Ladders")} <strong data-cyc>0</strong> · ${L(
            "Pasos distintos",
            "Distinct steps"
          )} <strong data-cr>0</strong></span>
        </div>
        <p class="mode-meta muted">${L(
          "Un escalón distinto cambia al menos 3 dB · medido en dB frente a ti mismo",
          "A distinct step changes by at least 3 dB · measured in dB against yourself"
        )}</p>
      `;
      this.$("[data-phase-btn]")?.addEventListener("click", () => this._togglePhase());
      this._mountViz();
    },
    _fresh() {
      const st = this.state;
      st.reps = [{ treads: [] }];
      st.repNo = 1;
      st.pos = 0;
      st.tStep = 0;
      st.cur = this._freshTread();
      st.range = null;
      st.phase = "ladder";
      st.story = null;
      st.stories = [];
      st.history = [];
      st.review = false;
      st.level = null;
      st.processed = false;
      st.clipping = false;
      st.distinctTotal = 0;
    },
    _freshTread() {
      return { dbs: [], recent: [], voiced: 0, lastSample: -1, median: null, live: null };
    },
    _mountViz() {
      const V = global.VTViz;
      const K = global.VTVolumeKit;
      if (!V || !K || !V.scenes.volumeLadder) return;
      this.hud.classList.add("has-viz");
      this.state.kit = new K.LevelKit();
      this.viz = new V.Surface(this.hud, (ctx, w, h) => V.scenes.volumeLadder(ctx, w, h, this.state), {
        className: "vz-volume",
        label: L(
          "Escalera de volumen: un escalón por nivel, del susurro a la sala llena y de vuelta. Cada escalón queda a la altura que sostuviste, en dB frente a ti, con cuánto subió o bajó respecto al anterior.",
          "Volume ladder: one step per level, from whisper to full room and back. Each step sets at the level you held, in dB against yourself, with how far it rose or fell from the one before."
        )
      });
      this.viz.draw();
    },
    /** Level of a tread: the upper quartile of its voiced frames, near the syllable peaks. */
    _treadLevel(c) {
      const K = global.VTVolumeKit;
      return c.dbs.length >= 20 ? K.percentile(c.dbs, 0.75) : null;
    },
    _growRange(db) {
      const st = this.state;
      if (!st.range) st.range = { lo: db - 8, hi: db + 24 };
      if (db > st.range.hi - 2) st.range.hi = db + 5;
      if (db < st.range.lo + 2) st.range.lo = db - 5;
    },
    _setTread(advance = true) {
      const st = this.state;
      const K = global.VTVolumeKit;
      const rep = st.reps[st.reps.length - 1];
      const lv = st.seq[st.pos];
      const db = this._treadLevel(st.cur);
      const prev = [...rep.treads].reverse().find((t) => t.db != null);
      let verdict = db == null ? "silent" : "first";
      let delta = null;
      if (db != null && prev) {
        delta = db - prev.db;
        const dir = Math.sign(lv - prev.level) || 1;
        if (dir * delta >= 3) verdict = "distinct";
        else if (Math.abs(delta) < 3) verdict = "same";
        else verdict = "wrong";
      }
      rep.treads.push({ level: lv, db, delta, verdict });
      if (db != null) this._growRange(db);
      if (verdict === "distinct") st.distinctTotal += 1;
      const name = st.levels[lv]?.label || String(lv + 1);
      let words;
      if (verdict === "silent") words = L(`${name}: sin voz en este escalón.`, `${name}: no voice on this step.`);
      else if (verdict === "first") words = L(`${name}: base fijada.`, `${name}: base set.`);
      else if (verdict === "distinct") words = L(`${name}: ${K.fmtDb(delta)}, distinto.`, `${name}: ${K.fmtDb(delta)}, distinct.`);
      else if (verdict === "same") words = L(`${name}: ${K.fmtDb(delta)}, casi igual al anterior.`, `${name}: ${K.fmtDb(delta)}, about the same as the last.`);
      else words = L(`${name}: ${K.fmtDb(delta)}, hacia el otro lado.`, `${name}: ${K.fmtDb(delta)}, the other way.`);
      this.viz?.caption?.(words, 1500);
      if (!advance) return;
      st.pos += 1;
      st.tStep = 0;
      st.cur = this._freshTread();
      if (st.pos >= st.seq.length) this._finishRep(true);
      this._syncWords();
    },
    _repSummary(rep) {
      const set = rep.treads.filter((t) => t.db != null);
      const steps = rep.treads.filter((t) => t.db != null && t.verdict !== "first");
      const dbs = set.map((t) => t.db);
      return {
        distinct: steps.filter((t) => t.verdict === "distinct").length,
        steps: steps.length,
        span: dbs.length >= 2 ? Math.max(...dbs) - Math.min(...dbs) : 0
      };
    },
    _finishRep(complete) {
      const st = this.state;
      const rep = st.reps[st.reps.length - 1];
      if (!rep.treads.length && !complete) return;
      const s = this._repSummary(rep);
      const voiced = complete && rep.treads.length === st.seq.length && rep.treads.every((t) => t.db != null);
      st.history.push({ kind: "ladder", k: st.repNo, complete, voiced, distinct: s.distinct, steps: s.steps, span: s.span });
      if (complete) {
        this.viz?.caption?.(
          L(
            `Escalera ${st.repNo}: ${s.distinct} de ${s.steps} pasos distintos, rango ${Math.round(s.span)} dB.`,
            `Ladder ${st.repNo}: ${s.distinct} of ${s.steps} steps distinct, range ${Math.round(s.span)} dB.`
          ),
          0
        );
      }
      const finished = st.history.filter((h) => h.kind === "ladder" && h.complete).length;
      const storyDone = st.history.some((h) => h.kind === "story");
      if (complete && !storyDone && finished >= st.repsTarget) this._startStory();
      else if (complete) this._newRep();
    },
    _newRep() {
      const st = this.state;
      // A ladder left before its first tread is taken up again, not skipped
      const last = st.reps[st.reps.length - 1];
      if (!last || last.treads.length) {
        st.reps.push({ treads: [] });
        if (st.reps.length > 6) st.reps.shift();
        st.repNo += 1;
      }
      st.pos = 0;
      st.tStep = 0;
      st.cur = this._freshTread();
      st.phase = "ladder";
      const b = this.$("[data-phase-btn]");
      if (b) b.textContent = L("Historia →", "Story →");
    },
    /** Five zones from your own ladder: its whisper and its full room, split evenly. */
    _zones() {
      const st = this.state;
      const K = global.VTVolumeKit;
      const n = st.levels.length;
      const by = st.levels.map(() => []);
      st.reps.forEach((r) => r.treads.forEach((t) => t.db != null && by[t.level] && by[t.level].push(t.db)));
      const lo = by[0].length ? K.median(by[0]) : null;
      const hi = by[n - 1].length ? K.median(by[n - 1]) : null;
      if (lo == null || hi == null || hi - lo < 8) return null;
      const step = (hi - lo) / (n - 1);
      return st.levels.map((_, i) => ({ c: lo + i * step, lo: lo + (i - 0.5) * step, hi: lo + (i + 0.5) * step }));
    },
    _startStory() {
      const st = this.state;
      const zones = this._zones();
      st.phase = "story";
      st.story = {
        t: 0,
        trace: [],
        lastSample: -1,
        zones,
        approx: !zones,
        used: st.levels.map(() => false),
        usedCount: 0,
        voiced: [],
        voicedSec: 0,
        phrase: null,
        phrases: [],
        quiet: 0
      };
      const b = this.$("[data-phase-btn]");
      if (b) b.textContent = L("Escalera →", "Ladder →");
      this.viz?.caption?.(
        L("Historia de 60 s: usa al menos 3 de tus niveles, con intención.", "A 60 s story: use at least 3 of your levels, on purpose."),
        0
      );
      this._syncWords();
    },
    _closePhrase() {
      const st = this.state;
      const s = st.story;
      const K = global.VTVolumeKit;
      const p = s.phrase;
      s.phrase = null;
      if (!p || !s.zones || p.dbs.length < 10) return;
      const lvl = K.percentile(p.dbs, 0.75);
      let best = 0;
      s.zones.forEach((z, i) => {
        if (Math.abs(z.c - lvl) < Math.abs(s.zones[best].c - lvl)) best = i;
      });
      // Each phrase sets as one step at the level it held
      s.phrases.push({ t0: p.t0, t1: Math.max(p.t0, s.t - s.quiet), db: lvl, zone: best });
      if (s.phrases.length > 60) s.phrases.shift();
      if (!s.used[best]) {
        s.used[best] = true;
        s.usedCount = s.used.filter(Boolean).length;
        this.viz?.caption?.(
          L(`Nivel ${best + 1} usado · ${s.usedCount} de 5.`, `Level ${best + 1} used · ${s.usedCount} of 5.`),
          1500
        );
      }
    },
    _finishStory() {
      const st = this.state;
      const s = st.story;
      if (!s) return;
      if (s.phrase) this._closePhrase();
      st.history.push({ kind: "story", used: s.usedCount });
      st.stories.push(s);
      this.viz?.caption?.(L(`Historia: ${s.usedCount} de 5 niveles usados.`, `Story: ${s.usedCount} of 5 levels used.`), 0);
      st.story = null;
      this._newRep();
      this._syncWords();
    },
    _togglePhase() {
      const st = this.state;
      if (st.review) return;
      if (st.phase === "story") this._finishStory();
      else {
        this._finishRep(false);
        this._startStory();
      }
      this.viz?.draw();
    },
    _syncWords() {
      const st = this.state;
      const set = (sel, txt) => {
        const el = this.$(sel);
        if (el && el.textContent !== txt) el.textContent = txt;
      };
      if (st.phase === "story") {
        set("[data-phase]", L("Historia", "Story"));
        set("[data-remain]", `${Math.max(0, Math.ceil(st.storySec - (st.story ? st.story.t : 0)))}s`);
      } else {
        set("[data-phase]", st.levels[st.seq[st.pos]]?.label || "—");
        set("[data-remain]", `${Math.max(0, Math.ceil(st.stepSec - st.tStep))}s`);
        set("[data-step]", String(Math.min(st.pos + 1, st.seq.length)));
      }
      set("[data-cyc]", String(st.history.filter((h) => h.kind === "ladder" && h.voiced).length));
      set("[data-cr]", String(st.distinctTotal));
    },
    onStart() {
      const st = this.state;
      this._fresh();
      st.kit?.reset();
      this.hud?.classList.remove("is-replay");
      const b = this.$("[data-phase-btn]");
      if (b) {
        b.textContent = L("Historia →", "Story →");
        b.disabled = false;
      }
      this._syncWords();
      this.viz?.draw();
    },
    onFrame(frame) {
      const st = this.state;
      if (!st.kit || st.review) return;
      const K = global.VTVolumeKit;
      st.kit.feed(frame);
      const kit = st.kit;
      const dt = kit.dt;
      // Steps run on the wall clock: frame steps are capped, so a busy
      // machine would otherwise stretch an 8 s step
      const now = performance.now();
      const wdt = Math.min(0.25, Math.max(0, (now - (st.lastNow || now)) / 1000));
      st.lastNow = now;
      st.processed = kit.processed;
      st.clipping = kit.clipping;
      K.noteProcessed(st, this.viz);
      st.level = kit.disp;
      if (st.phase === "story") {
        const s = st.story;
        s.t += wdt;
        if (kit.t - s.lastSample >= 0.05) {
          s.trace.push([s.t, kit.disp == null ? NaN : kit.disp]);
          s.lastSample = kit.t;
          while (s.trace.length && s.trace[0][0] < s.t - 20) s.trace.shift();
          if (kit.sounding && kit.disp != null) {
            s.voiced.push(kit.disp);
            if (s.voiced.length > 600) s.voiced.shift();
            if (!s.phrase) s.phrase = { dbs: [], t0: s.t };
            s.phrase.dbs.push(kit.disp);
          }
        }
        if (kit.sounding) {
          s.voicedSec += dt;
          s.quiet = 0;
        } else if (s.phrase) {
          s.quiet += dt;
          if (s.quiet >= 0.35) this._closePhrase();
        }
        // No ladder yet: five zones 5 dB apart around your story's own level
        if (!s.zones && s.voicedSec >= 2 && s.voiced.length >= 20) {
          const med = K.median(s.voiced);
          s.zones = st.levels.map((_, i) => ({ c: med + (i - 2) * 5, lo: med + (i - 2.5) * 5, hi: med + (i - 1.5) * 5 }));
          s.approx = true;
        }
        if (s.t >= st.storySec) this._finishStory();
      } else {
        st.tStep += wdt;
        const c = st.cur;
        if (kit.sounding && kit.disp != null) {
          c.voiced += dt;
          c.recent.push([kit.t, kit.disp]);
          // The first 0.6 s of a step is the change of level, not the level
          if (st.tStep >= 0.6 && kit.t - c.lastSample >= 0.05) {
            c.dbs.push(kit.disp);
            c.lastSample = kit.t;
          }
        }
        while (c.recent.length && c.recent[0][0] < kit.t - 0.5) c.recent.shift();
        c.live = c.recent.length >= 5 ? K.median(c.recent.map((r) => r[1])) : null;
        c.median = this._treadLevel(c);
        if (c.live != null) this._growRange(c.live);
        if (st.tStep >= st.stepSec) this._setTread(true);
      }
      this._syncWords();
      this.viz?.draw();
    },
    onStop() {
      const st = this.state;
      if (st.phase === "story" && st.story && st.story.phrase) this._closePhrase();
      else if (st.phase === "ladder" && st.cur && this._treadLevel(st.cur) != null && st.pos < st.seq.length) this._setTread(false);
      this._syncWords();
      st.review = true;
      const b = this.$("[data-phase-btn]");
      if (b) b.disabled = true;
      if (this.viz) {
        this.hud.classList.add("is-replay");
        this.viz.draw();
      }
      const hist = st.history || [];
      const full = hist.filter((h) => h.kind === "ladder" && h.voiced).length;
      const reps = (st.reps || []).map((r) => this._repSummary(r)).filter((s) => s.steps);
      const d = reps.reduce((a, s) => a + s.distinct, 0);
      const s = reps.reduce((a, x) => a + x.steps, 0);
      const span = Math.round(Math.max(0, ...reps.map((x) => x.span)));
      const story = st.phase === "story" && st.story ? st.story.usedCount : hist.filter((h) => h.kind === "story").map((h) => h.used).pop();
      const lead = full
        ? L(`${full} ${full === 1 ? "escalera completa" : "escaleras completas"}`, `${full} full ${full === 1 ? "ladder" : "ladders"}`)
        : L("Escalera a medias", "Partial ladder");
      let summary = s
        ? L(`${lead} · ${d} de ${s} pasos distintos · rango ${span} dB`, `${lead} · ${d} of ${s} steps distinct · range ${span} dB`)
        : L("Sin escalones medidos todavía", "No measured steps yet");
      if (story != null) summary += L(` · historia: ${story} de 5 niveles`, ` · story: ${story} of 5 levels`);
      const ph = this.$("[data-phase]");
      if (ph) ph.textContent = L("Repaso", "Review");
      const rm = this.$("[data-remain]");
      if (rm) rm.textContent = "—";
      global.VTVolumeKit?.finalCaption?.(this.viz, summary);
      // Only the count of full ladders is measured; control and ease stay yours to rate
      return { patches: full > 0 ? { ladderReps: full } : {}, summary };
    }
  });

  /**
   * v3 — lift the soft palate: tongue gently out, count aloud to 60. Each
   * number is a burst of voice after a short silence, so the count comes
   * from the microphone (approximately: "treinta y uno" may split, a click
   * may add one), with −1 / +1 to correct it. The next bead's ring fills
   * over an unhurried beat as a pace to count against. Nothing here can
   * tell palate height or nasality: openness and comfort stay self-rated.
   */
  Modes.countPace = baseMode({
    id: "countPace",
    render() {
      const st = this.state;
      st.goal = this.profile.countTo || 60;
      st.pace = this.profile.paceSec || 1.1;
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${L("Paladar blando · cuenta hasta 60", "Soft palate · count to 60")}</div>
        </div>
        <div class="viz-words" aria-live="polite">
          ${L("Cuenta, aprox. por voz:", "Count, approx. by voice:")} <strong class="mode-big" data-c>0</strong> / ${st.goal} ·
          ${L("Tiempo", "Time")} <strong data-t>0:00</strong>
          <span data-nudge></span>
        </div>
        <p class="mode-meta muted">${L(
          "Cada número que dices en voz alta llena una cuenta; si una palabra larga cuenta doble, corrige con −1. El dibujo es una guía, no una medida: el micrófono no ve el paladar.",
          "Each number you say aloud fills a bead; if a long word counts twice, correct with −1. The drawing is a guide, not a measure: the mic cannot see your palate."
        )}</p>
        <div class="viz-row st-taps">
          <button type="button" class="btn btn-ghost viz-tap st-tap st-tap-small" data-minus aria-label="${L("Quitar un número", "Remove one number")}">−1</button>
          <button type="button" class="btn btn-ghost viz-tap st-tap st-tap-small" data-plus aria-label="${L("Añadir un número", "Add one number")}">+1</button>
        </div>
      `;
      this.$("[data-plus]")?.addEventListener("click", () => this._adjust(1));
      this.$("[data-minus]")?.addEventListener("click", () => this._adjust(-1));
      this._resetCount();
      this._mountViz();
    },
    _resetCount() {
      const st = this.state;
      const F = global.VTFeatures;
      st.beads = [];
      st.running = false;
      st.review = false;
      st.elapsed = 0;
      st.lastT = null;
      st.startT = 0;
      st.counted = false;
      st.note = null;
      st.reminder = "";
      st.last = performance.now();
      st.lastWords = 0;
      st.clock = 0;
      const K = global.VTViz?.speechTiming;
      if (F && K) st.bursts = new K.Bursts({ onBurst: (t) => this._number(t) });
      if (this.$("[data-c]")) this.$("[data-c]").textContent = "0";
    },
    _mountViz() {
      const V = global.VTViz;
      if (!V || !V.scenes.beads || !this.state.bursts) return;
      this.hud.classList.add("has-viz");
      this.viz = new V.Surface(this.hud, (ctx, w, h) => V.scenes.beads(ctx, w, h, this.state), {
        label: L(
          "Sesenta cuentas en seis filas de diez: cada número que dices llena una; el anillo de la siguiente se llena a un ritmo sin prisa. Al lado, un dibujo de la lengua afuera y el espacio alto.",
          "Sixty beads in six rows of ten: each number you say fills one; the next bead's ring fills at an unhurried pace. Beside it, a drawing of the tongue out and the tall space."
        ),
        captionHidden: true
      });
      const taps = this.$(".st-taps");
      if (taps && this.viz.wrap) this.hud.insertBefore(this.viz.wrap, taps);
      this.viz.draw();
    },
    _adjust(d) {
      const st = this.state;
      if (st.review) return;
      if (d > 0) st.beads.push({ t: st.clock || 0, early: false, manual: true });
      else st.beads.pop();
      if (this.$("[data-c]")) this.$("[data-c]").textContent = String(st.beads.length);
      this.viz?.draw();
    },
    onStart() {
      this._resetCount();
      const st = this.state;
      st.running = true;
      st.startT = 0;
      this.hud?.classList.remove("is-replay");
      ["[data-plus]", "[data-minus]"].forEach((s) => {
        if (this.$(s)) this.$(s).disabled = false;
      });
      this.viz?.draw();
    },
    /** A number heard: the next bead, marked "»" if it came well before the beat. */
    _number(t) {
      const st = this.state;
      if (!st.running) return;
      const prev = st.beads[st.beads.length - 1];
      const early = !!prev && !prev.manual && t - prev.t < st.pace * 0.6;
      st.beads.push({ t, early, manual: false });
      st.lastT = t;
      if (this.$("[data-c]")) this.$("[data-c]").textContent = String(st.beads.length);
      if (st.beads.length === st.goal)
        st.note = { text: L(`¡${st.goal}! Descansa la lengua`, `${st.goal}! Rest your tongue`), color: global.VTViz.C.done, until: performance.now() + 4000 };
    },
    onFrame(frame) {
      const st = this.state;
      if (!st.running || !st.bursts) return;
      const now = performance.now();
      const dt = Math.min(0.25, Math.max(0, (now - st.last) / 1000));
      st.last = now;
      st.elapsed += dt;
      st.bursts.feed(frame);
      st.clock = st.bursts.t;
      // Two gentle reminders, as words in the card
      const sec = st.elapsed;
      const rem =
        sec >= 60
          ? L("Descansa si la lengua se cansa", "Rest if your tongue tires")
          : sec >= 30
            ? L("Mandíbula suelta", "Jaw loose")
            : "";
      if (rem !== st.reminder) {
        st.reminder = rem;
        if (rem) st.note = { text: rem, until: now + 3000 };
        if (this.$("[data-nudge]")) this.$("[data-nudge]").textContent = rem ? ` · ${rem}` : "";
      }
      if (now - st.lastWords > 500) {
        st.lastWords = now;
        const s = Math.floor(sec);
        if (this.$("[data-t]")) this.$("[data-t]").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
      }
      this.viz?.draw();
    },
    onStop() {
      const st = this.state;
      st.running = false;
      st.review = true;
      ["[data-plus]", "[data-minus]"].forEach((s) => {
        if (this.$(s)) this.$(s).disabled = true;
      });
      if (this.viz) {
        this.hud.classList.add("is-replay");
        this.viz.draw();
      }
      const c = st.beads ? st.beads.length : 0;
      const K = global.VTViz?.speechTiming;
      let tempoTxt = "";
      const iv = [];
      (st.beads || []).forEach((b, i, a) => {
        if (i && !b.manual && !a[i - 1].manual) {
          const d = b.t - a[i - 1].t;
          if (d > 0.15 && d < 3) iv.push(d);
        }
      });
      if (iv.length >= 3 && K) {
        const mu = K.mean(iv);
        const sd = Math.sqrt(K.mean(iv.map((d) => (d - mu) * (d - mu))));
        const f = global.VTViz.fmtNum;
        tempoTxt = L(` · ~${f(mu, 1)} s por número (±${f(sd, 1)} s)`, ` · ~${f(mu, 1)} s per number (±${f(sd, 1)} s)`);
      }
      const secs = Math.round(st.elapsed || 0);
      return {
        // The count is measured (and corrected by the learner); openness and
        // comfort are theirs to rate
        patches: c > 0 ? { countReached: c } : {},
        summary: c
          ? L(`Llegaste a ${c}${tempoTxt} · ${secs} s`, `You reached ${c}${tempoTxt} · ${secs} s`)
          : L("Sin números contados todavía", "No numbers counted yet")
      };
    }
  });

  /**
   * v4 pen articulation — a count pacer. One number per beat, the pen shown in
   * or out, then the same numbers without the pen. After Stop the take is cut
   * into "with pen" and "without pen" (the same numbers) so the contrast is
   * heard, not scored: clarity stays the learner's rating in the metrics.
   * Pictures: js/scenes/guided.js (VTViz.guided).
   */
  Modes.articulationContrast = baseMode({
    id: "articulationContrast",
    render() {
      const G = global.VTViz?.guided;
      const title = L("Contraste con bolígrafo", "Pen contrast");
      const phases = this.profile.phases || [
        { label: "With pen · count 1–60", kind: "count", pen: true, from: 1, to: 60, pace: 1.5, sec: 90 },
        { label: L("Sin bolígrafo · cuenta 1–20", "Pen off · count 1–20"), kind: "count", pen: false, from: 1, to: 20, pace: 1.5, sec: 30 }
      ];
      if (!G) {
        this.hud.innerHTML = `<div class="mode-title">${title}</div><div class="mode-phase" data-phase>${phases[0].label}</div>`;
        return;
      }
      this.viz = new G.Drill(this, {
        kind: "pen",
        title,
        phases,
        mic: true,
        strip: true,
        recorded: true,
        skip: true,
        preCue: 3,
        label: L(
          "Cuenta al pulso: el número grande es el que toca ahora, la bola marca el pulso. Arriba, el paso y lo que viene; abajo, todos los pasos.",
          "Count on the beat: the big number is the one to say now, the ball marks the beat. Above, the step and what comes next; below, every step."
        ),
        artFor: () => ({ draw: G.art.numbers, aspect: 3.4, stackAspect: 1.8, plain: true }),
        doneText: L("Contraste listo", "Contrast done"),
        chapters: (d) => this._chapters(d),
        reviewTitle: (d) =>
          d.chapters.some((c) => c.segs) ? L("Escucha con y sin bolígrafo", "Hear it with and without the pen") : L("Escucha tu toma", "Listen to your take"),
        reviewNote: L(
          "Mismos números con y sin bolígrafo. La claridad la valoras tú en Métricas.",
          "The same numbers with and without the pen. You rate clarity in Metrics."
        )
      });
    },
    /** A: the start of the count with the pen · B: the same numbers without it. */
    _chapters(d) {
      const run = d.run;
      const stopAt = { t: run.clock, rec: run.rec };
      const cut = (i, sec) => {
        const s = i >= 0 ? run.span(i, stopAt) : null;
        if (!s || s.t1 - s.t0 < 1.5) return null;
        const k = Math.min(sec, s.t1 - s.t0);
        const p = run.phases[i];
        const n = Math.max(1, Math.floor(k / (p.pace || 1.5)));
        const from = p.from || 1;
        return { t0: s.t0, t1: s.t0 + k, r0: s.r0, r1: s.r0 + k, sub: L(`cuenta ${from}–${from + n - 1}`, `count ${from}–${from + n - 1}`) };
      };
      const iA = run.phases.findIndex((p) => p.kind === "count" && p.pen !== false);
      const iB = run.phases.findIndex((p) => p.kind === "count" && p.pen === false);
      const a = cut(iA, 15);
      const b = cut(iB, 15);
      const out = [];
      if (a) out.push(Object.assign({ label: L("A · con bolígrafo", "A · with pen") }, a));
      if (b) out.push(Object.assign({ label: L("B · sin bolígrafo", "B · without pen") }, b));
      if (a && b) {
        out.push(
          Object.assign({}, a, {
            label: L("A y luego B", "A, then B"),
            sub: L("seguidos", "back to back"),
            segs: [
              [a.r0, a.r1],
              [b.r0, b.r1]
            ]
          })
        );
      }
      return out.concat(d.stepChapters((p) => p.kind === "count"));
    },
    onStart() {
      this.viz?.start?.();
    },
    onFrame(frame) {
      this.viz?.frame?.(frame);
    },
    onStop() {
      const d = this.viz;
      d?.stop?.();
      const n = d ? d.run.completed : 0;
      const total = d ? d.run.count : 0;
      // Clarity is a self-rating: it stays empty for the learner to fill in
      return {
        patches: {},
        summary: L(
          `Contraste: ${n} de ${total} pasos · escucha A y B antes de valorar`,
          `Contrast: ${n} of ${total} steps · hear A and B before you rate`
        )
      };
    }
  });

  /**
   * v5 neutral ears (persona & story) — a persona deck, then a story arc
   * (setup → turn → point), recorded. Nothing judges mid-take; after Stop the
   * take is split by card and by story beat to listen back. Without phases
   * (an exercise with no profile falls back here) it is a plain take clock.
   */
  Modes.recordOnly = baseMode({
    id: "recordOnly",
    render() {
      const G = global.VTViz?.guided;
      const phases = this.profile.phases;
      if (!G) {
        this.hud.innerHTML = `<div class="mode-title">${L("Toma", "Take")}</div><div class="mode-big" data-t>0:00</div>`;
        return;
      }
      if (!phases || !phases.length) {
        this.viz = new G.Take(this, {
          title: L("Toma", "Take"),
          minSec: 0,
          maxSec: 300,
          idle: L("Pulsa Empezar para grabar tu toma", "Press Start to record your take"),
          label: L("Tu toma mientras crece: cada barra es un segundo de voz.", "Your take as it grows: each bar is a second of voice.")
        });
        return;
      }
      this.viz = new G.Drill(this, {
        kind: "persona",
        title: L("Persona e historia", "Persona & story"),
        phases,
        mic: true,
        strip: true,
        recorded: true,
        skip: true,
        preCue: 3,
        label: L(
          "Tarjeta de persona o arco de la historia del paso actual, con el tiempo que queda y lo que viene. Sin juicio a mitad de toma.",
          "The persona card or story arc for this step, with the time left and what comes next. No judging mid-take."
        ),
        artFor: (p) =>
          p && p.kind === "story" ? { draw: G.art.story, aspect: 3.2, stackAspect: 2, plain: true } : { draw: G.art.persona, aspect: 3.4, stackAspect: 4, plain: true },
        // A persona card's words: what to say with it, then how
        cueFor: (p) => [p && p.kind === "persona" ? G.loc(p, "intent") : "", G.loc(p, "cue")].filter(Boolean).join(" "),
        doneText: L("Toma completa", "Take complete"),
        chapters: (d) => {
          const out = d.stepChapters();
          const idx = [];
          d.run.phases.forEach((p, i) => {
            if (p.kind === "story") idx.push(i);
          });
          if (idx.length > 1) {
            const stopAt = { t: d.run.clock, rec: d.run.rec };
            const a = d.run.span(idx[0], stopAt);
            const b = d.run.span(idx[idx.length - 1], stopAt);
            if (a && b && b.t1 - a.t0 > 3) {
              const s = { t0: a.t0, t1: b.t1, r0: a.r0, r1: b.r1 };
              out.push(Object.assign({ label: L("La historia entera", "The whole story"), sub: d.chapterSub(s) }, s));
            }
          }
          return out;
        },
        reviewTitle: L("Escucha con oídos neutrales", "Listen with neutral ears"),
        reviewNote: L(
          "Mejor mañana: ¿qué funcionó? Guarda la toma y la historia para reutilizarla.",
          "Best tomorrow: what landed? Save the take and keep the story to reuse it."
        )
      });
    },
    onStart() {
      this.viz?.start?.();
    },
    onFrame(frame) {
      this.viz?.frame?.(frame);
    },
    onStop() {
      const v = this.viz;
      v?.stop?.();
      const G = global.VTViz?.guided;
      const sec = v ? (v.run ? v.run.clock : v.t) : 0;
      const len = G ? G.mmss(sec) : `${Math.round(sec)} s`;
      return {
        patches: {},
        summary: L(`Toma de ${len} · escúchala con oídos neutrales`, `${len} take · listen with neutral ears`)
      };
    }
  });

  /**
   * v16 facial expression — no camera here, so the face is a drawing: each
   * step's expression (resting, warm hello, curiosity, surprise, resolve)
   * with the next one announced a few seconds early so the face can arrive
   * with the word. Recorded; nothing is scored.
   */
  Modes.facePhases = baseMode({
    id: "facePhases",
    render() {
      const G = global.VTViz?.guided;
      const title = L("Expresión facial", "Facial expression");
      const phases = this.profile.phases || [];
      if (!G) {
        this.hud.innerHTML = `<div class="mode-title">${title}</div><div class="mode-phase" data-phase>${phases[0]?.label || ""}</div><div class="mode-big" data-remain>—</div>`;
        return;
      }
      this.viz = new G.Drill(this, {
        kind: "face",
        title,
        phases,
        mic: true,
        strip: true,
        recorded: true,
        skip: true,
        preCue: 3,
        label: L(
          "Dibujo de la expresión del paso actual, el tiempo que queda y la siguiente expresión, que se anuncia 3 s antes.",
          "A drawing of this step's expression, the time left, and the next expression, announced 3 s early."
        ),
        artFor: () => ({ draw: G.art.face, aspect: 1 }),
        scriptFor: (p) => {
          const line = G.loc(p, "line");
          return line ? { text: line, hot: true } : null;
        },
        doneText: L("Historia completa", "Story complete"),
        reviewTitle: L("Escucha tu toma", "Listen to your take"),
        reviewNote: L(
          "Mira primero tu video sin sonido: ¿la cara cuenta la historia?",
          "Watch your video muted first: does your face tell the story?"
        )
      });
    },
    onStart() {
      this.viz?.start?.();
    },
    onFrame(frame) {
      this.viz?.frame?.(frame);
    },
    onStop() {
      const d = this.viz;
      d?.stop?.();
      const n = d ? d.run.completed : 0;
      const total = d ? d.run.count : 0;
      // Animation, match and warmth are the learner's own ratings
      return {
        patches: {},
        summary: L(
          `Expresión: ${n} de ${total} pasos · revisa el video sin sonido`,
          `Expression: ${n} of ${total} steps · review your video muted`
        )
      };
    }
  });

  /**
   * v6 — how to connect: curiosity loops played solo. Each minute is a
   * loop of scripted turns (10 s your open question, 20 s their imagined
   * answer, 10 s your reflection and deeper question, 20 s listening), in
   * three scenarios. The mic can only tell when a voice sounds, so the
   * picture shows when you spoke, whether their turns stayed quiet, and
   * your longest turn; presence and question quality stay self-rated.
   */
  Modes.speechEnergy = baseMode({
    id: "speechEnergy",
    render() {
      const st = this.state;
      const phases = this.profile.phases || [{ label: L("Conversación", "Conversation"), sec: 120 }];
      st.loop = [
        {
          kind: "you",
          sec: 10,
          name: L("Pregunta abierta", "Open question"),
          short: L("Pregunta", "Ask"),
          cue: L("Tu turno: una pregunta abierta", "Your turn: one open question")
        },
        {
          kind: "them",
          sec: 20,
          name: L("Escucha", "Listen"),
          short: L("Escucha", "Listen"),
          cue: L("Su turno: escucha e imagina la respuesta", "Their turn: listen, imagine the answer")
        },
        {
          kind: "you",
          sec: 10,
          name: L("Refleja + pregunta más honda", "Reflect + deeper question"),
          short: L("Refleja", "Reflect"),
          cue: L("Tu turno: refleja un detalle, pregunta más hondo", "Your turn: reflect a detail, ask deeper")
        },
        {
          kind: "them",
          sec: 20,
          name: L("Escucha", "Listen"),
          short: L("Escucha", "Listen"),
          cue: L("Su turno: escucha, busca un dato real", "Their turn: listen for one real fact")
        }
      ];
      st.scenarios = phases.map((p, i) => ({
        name: p.label,
        short: String(i + 1),
        sec: p.sec || 120,
        start: null,
        end: null,
        talk: 0,
        elapsed: 0,
        overlap: 0,
        longest: 0,
        fact: false
      }));
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${L("Conexión · bucles de curiosidad", "Connection · curiosity loops")}</div>
          <button type="button" class="btn btn-ghost viz-tap" data-next-scenario>${L("Siguiente situación →", "Next scenario →")}</button>
        </div>
        <div class="viz-words" aria-live="polite">
          <span class="mode-phase" data-phase>${st.scenarios[0]?.name || ""}</span> ·
          <strong data-slot>${st.loop[0].cue}</strong>
          <span data-remain>0:10</span> ·
          ${L("Hablaste", "You spoke")} <strong data-sp>—</strong> ·
          ${L("Turno más largo", "Longest turn")} <strong data-long>0 s</strong> ·
          ${L("En su turno", "In their turn")} <strong data-over>0 s</strong>
        </div>
        <p class="mode-meta muted">${L(
          "Juego de rol a solas: pregunta en tu turno y calla en el suyo, imaginando la respuesta. El micrófono solo sabe cuándo suena una voz: cualquier voz en la sala cuenta como «tú». La presencia y las preguntas las calificas tú.",
          "Solo role-play: ask in your turn and stay quiet in theirs, imagining the answer. The mic only knows when a voice sounds: any voice in the room counts as “you”. Presence and questions are yours to rate."
        )}</p>
        <div class="viz-row st-taps">
          <button type="button" class="btn btn-ghost viz-tap st-tap st-tap-fact" data-fact>${L("Aprendí un dato real ✓", "I learned a real fact ✓")}</button>
        </div>
      `;
      this.$("[data-next-scenario]")?.addEventListener("click", () => this._nextScenario());
      this.$("[data-fact]")?.addEventListener("click", () => this._fact());
      this._resetTurns();
      this._mountViz();
    },
    _resetTurns() {
      const st = this.state;
      const F = global.VTFeatures;
      st.current = 0;
      st.done = false;
      st.review = false;
      st.running = false;
      st.slot = null;
      st.run = 0;
      st.runStart = null;
      st.lastSpeech = null;
      st.overlapNow = 0;
      st.lastWords = 0;
      st.scenarios.forEach((s) => {
        s.start = null;
        s.end = null;
        s.talk = 0;
        s.elapsed = 0;
        s.overlap = 0;
        s.longest = 0;
        s.fact = false;
      });
      if (F) st.vad = new F.Vad({ hangMs: 250 });
      const b = this.$("[data-next-scenario]");
      if (b) b.disabled = false;
      const f = this.$("[data-fact]");
      if (f) f.classList.remove("is-on");
    },
    _mountViz() {
      const V = global.VTViz;
      if (!V || !V.scenes.turns || !this.state.vad) return;
      this.hud.classList.add("has-viz");
      this.viz = new V.Surface(this.hud, (ctx, w, h) => V.scenes.turns(ctx, w, h, this.state), {
        label: L(
          "Línea de turnos: arriba, tu voz; abajo, los turnos imaginados de la otra persona, que llegan desde la derecha. Tu voz dentro de su turno aparece rayada; un turno suyo en silencio se cierra con una marca.",
          "Turn-taking line: above, your voice; below, the other person's imagined turns, arriving from the right. Your voice inside their turn shows hatched; a quiet turn of theirs closes with a check."
        ),
        captionHidden: true
      });
      const taps = this.$(".st-taps");
      if (taps && this.viz.wrap) this.hud.insertBefore(this.viz.wrap, taps);
      this.viz.draw();
    },
    _fact() {
      const st = this.state;
      const sc = st.scenarios[Math.min(st.current, st.scenarios.length - 1)];
      if (!sc || !st.running) return;
      sc.fact = !sc.fact;
      this.$("[data-fact]")?.classList.toggle("is-on", sc.fact);
      this.viz?.caption?.(sc.fact ? L("Dato real anotado", "Real fact noted") : L("Dato quitado", "Fact removed"), 900);
      this.viz?.draw();
    },
    _closeRun(at) {
      const st = this.state;
      if (st.runStart == null) return;
      const len = Math.max(0, at - st.runStart);
      const sc = st.scenarios[st.current];
      if (sc) sc.longest = Math.max(sc.longest, len);
      st.runStart = null;
      st.run = 0;
    },
    _nextScenario(auto) {
      const st = this.state;
      if (st.done || !st.vad) return;
      const sc = st.scenarios[st.current];
      const t = st.vad.t;
      if (sc && sc.start != null && sc.end == null) sc.end = t;
      this._closeRun(st.lastSpeech != null ? st.lastSpeech : t);
      if (st.current < st.scenarios.length - 1) {
        st.current += 1;
        const nx = st.scenarios[st.current];
        nx.start = st.running ? t : null;
        const f = this.$("[data-fact]");
        if (f) f.classList.remove("is-on");
        if (this.$("[data-phase]")) this.$("[data-phase]").textContent = nx.name;
        if (global.VTToast) global.VTToast(nx.name);
      } else {
        st.done = true;
        st.slot = null;
        if (this.$("[data-phase]")) this.$("[data-phase]").textContent = L("Situaciones listas", "Scenarios done");
      }
      if (st.done || st.current >= st.scenarios.length - 1) {
        const b = this.$("[data-next-scenario]");
        if (b) b.disabled = true;
      }
      if (!auto) this.viz?.draw();
    },
    onStart() {
      this._resetTurns();
      const st = this.state;
      st.running = true;
      if (st.scenarios[0]) st.scenarios[0].start = 0;
      if (this.$("[data-phase]")) this.$("[data-phase]").textContent = st.scenarios[0]?.name || "";
      this.hud?.classList.remove("is-replay");
      if (this.$("[data-fact]")) this.$("[data-fact]").disabled = false;
      this.viz?.draw();
    },
    onFrame(frame) {
      const st = this.state;
      if (!st.running || !st.vad) return;
      const V = global.VTViz;
      const K = V.speechTiming;
      st.vad.feed(frame);
      const dt = K.frameDt(frame);
      const t = st.vad.t;
      const sc = st.scenarios[st.current];
      if (!st.done && sc && sc.start != null) {
        sc.elapsed += dt;
        // Which scripted turn is it now?
        const u = t - sc.start;
        const cyc = st.loop.reduce((s, p) => s + p.sec, 0);
        let off = u % cyc;
        let step = 0;
        while (step < st.loop.length - 1 && off >= st.loop[step].sec) {
          off -= st.loop[step].sec;
          step += 1;
        }
        const a = t - off;
        const prevKind = st.slot?.kind;
        st.slot = { kind: st.loop[step].kind, step, a, b: Math.min(a + st.loop[step].sec, sc.start + sc.sec) };
        if (prevKind && prevKind !== st.slot.kind) st.overlapNow = 0;
        const speaking = st.vad.state === "speech";
        if (speaking) {
          sc.talk += dt;
          if (st.slot.kind === "them") {
            sc.overlap += dt;
            st.overlapNow += dt;
          }
        }
        if (u >= sc.sec) this._nextScenario(true);
      }
      // Turns: speech with no pause of 1.5 s or more
      if (st.vad.state === "speech") {
        if (st.runStart == null) st.runStart = st.vad.speechStart != null ? st.vad.speechStart : t;
        st.lastSpeech = t;
        st.run = t - st.runStart;
      } else if (st.runStart != null && st.lastSpeech != null && t - st.lastSpeech >= 1.5) this._closeRun(st.lastSpeech);
      const now = performance.now();
      if (now - st.lastWords > 250) {
        st.lastWords = now;
        const cur = st.scenarios[Math.min(st.current, st.scenarios.length - 1)];
        if (this.$("[data-slot]")) this.$("[data-slot]").textContent = st.done ? "✓" : st.loop[st.slot?.step || 0].cue;
        if (this.$("[data-remain]")) this.$("[data-remain]").textContent = st.done || !st.slot ? "✓" : K.clockUp(st.slot.b - t);
        if (this.$("[data-sp]")) this.$("[data-sp]").textContent = cur && cur.elapsed > 3 ? K.pct(cur.talk / cur.elapsed) : "—";
        if (this.$("[data-long]")) this.$("[data-long]").textContent = `${V.fmtNum(Math.max(cur?.longest || 0, st.run || 0), 0)} s`;
        if (this.$("[data-over]")) this.$("[data-over]").textContent = `${V.fmtNum(cur?.overlap || 0, 0)} s`;
      }
      this.viz?.draw();
    },
    onStop() {
      const st = this.state;
      st.running = false;
      if (st.vad) {
        const sc = st.scenarios[st.current];
        if (sc && sc.start != null && sc.end == null) sc.end = st.vad.t;
        this._closeRun(st.lastSpeech != null ? st.lastSpeech : st.vad.t);
      }
      st.review = true;
      ["[data-fact]", "[data-next-scenario]"].forEach((s) => {
        if (this.$(s)) this.$(s).disabled = true;
      });
      if (this.viz) {
        this.hud.classList.add("is-replay");
        this.viz.draw();
      }
      const K = global.VTViz?.speechTiming;
      const played = (st.scenarios || []).filter((s) => s.start != null && s.elapsed > 1);
      const share = played.map((s) => (K ? K.pct(s.talk / Math.max(1, s.elapsed)) : `${Math.round((s.talk / Math.max(1, s.elapsed)) * 100)}%`));
      const longest = Math.max(0, ...played.map((s) => s.longest));
      const over = played.reduce((a, s) => a + s.overlap, 0);
      const facts = played.filter((s) => s.fact).length;
      return {
        // Presence and question quality are the learner's to rate
        patches: {},
        summary: played.length
          ? L(
              `Hablaste ${share.join(" → ")} (ref. 30 %) · turno más largo ${Math.round(longest)} s · ${Math.round(over)} s en su turno · datos reales: ${facts}`,
              `You spoke ${share.join(" → ")} (ref. 30%) · longest turn ${Math.round(longest)} s · ${Math.round(over)} s in their turn · real facts: ${facts}`
            )
          : L("Sin situaciones todavía", "No scenarios yet")
      };
    }
  });

  /**
   * v7 record & review — one long improvised take. The picture keeps the take
   * (a ribbon from 0 to 10:00, one bar per second of voice, the 5:00 minimum
   * marked) and judges nothing mid-take. After Stop it offers the take by the
   * minute and says when the review opens: tomorrow, in three passes.
   */
  Modes.reviewSession = baseMode({
    id: "reviewSession",
    render() {
      const G = global.VTViz?.guided;
      const title = L("Grabar y revisar", "Record & review");
      if (!G) {
        this.hud.innerHTML = `<div class="mode-title">${title}</div><div class="mode-big" data-t>0:00</div>`;
        return;
      }
      const topics = (isEs() ? this.profile.topicsEs : this.profile.topics) || this.profile.topics || [];
      this.viz = new G.Take(this, {
        title,
        topics,
        minSec: this.profile.minSec || 300,
        maxSec: this.profile.maxSec || 600,
        delayReview: true,
        label: L(
          "Tu toma mientras crece, de 0 a 10 minutos: cada barra es un segundo de voz, los huecos son silencios. La línea dorada marca el mínimo de 5 minutos.",
          "Your take as it grows, from 0 to 10 minutes: each bar is a second of voice, gaps are silences. The gold line marks the 5-minute minimum."
        )
      });
    },
    onStart() {
      this.viz?.start?.();
    },
    onFrame(frame) {
      this.viz?.frame?.(frame);
    },
    onStop() {
      const v = this.viz;
      v?.stop?.();
      const G = global.VTViz?.guided;
      const sec = v ? v.t : 0;
      const len = G ? G.mmss(sec) : `${Math.round(sec)} s`;
      const min = v ? v.minSec : 300;
      return {
        patches: {},
        summary:
          sec >= min
            ? L(`Toma de ${len} · revísala mañana: oído, vista, transcripción`, `${len} take · review it tomorrow: ear, eyes, transcript`)
            : L(`Toma de ${len} · para la revisión, mejor 5 min o más`, `${len} take · for the review, 5 min or more works best`)
      };
    }
  });

  /**
   * v9 twelve-week plan — a plan, not a drill. The picture is drawn when the
   * page opens: this week's seven days (gold = a day you practised your
   * focus), today ringed, the twelve weeks as a rising staircase with each
   * week's verdict, and the one next action. Days come from the practice
   * ledger (VTDays); nothing is lost for a missed day.
   */
  Modes.weekPlan = baseMode({
    id: "weekPlan",
    render() {
      // Same copy as the exercise's plan card (week.*)
      const t = (k) => global.VTI18n?.t?.(k) ?? k;
      const G = global.VTViz?.guided;
      if (!G) {
        this.hud.innerHTML = `
          <div class="mode-title">${t("week.cta")}</div>
          <p class="mode-meta">${t("week.ctaSub")}</p>
          <button type="button" class="btn btn-primary btn-sm" data-open-plan>${t("week.open")}</button>
        `;
        this.$("[data-open-plan]")?.addEventListener("click", () => document.getElementById("btn-plan")?.click());
        return;
      }
      const model = this._weekModel();
      const buttons = [];
      if (model.focusEx) buttons.push({ attr: "data-open-focus", label: L("Practicar", "Practise") });
      buttons.push({ attr: "data-open-plan", label: L("Abrir el plan", "Open the plan") });
      this.viz = new G.Week(this, {
        title: t("week.cta"),
        buttons,
        words: `<span data-week-head>${model.head}</span> <span data-week-action>${model.action}</span>`,
        model: () => this._weekModel(),
        label: L(
          "Tu semana: siete días, en dorado los que practicaste tu foco y hoy rodeado. Debajo, las 12 semanas como una escalera, con la tuya marcada, y la próxima acción.",
          "Your week: seven days, gold where you practised your focus, today ringed. Below, the 12 weeks as a staircase with yours outlined, and the next action."
        )
      });
      this.$("[data-open-plan]")?.addEventListener("click", () => document.getElementById("btn-plan")?.click());
      this.$("[data-open-focus]")?.addEventListener("click", () => {
        const id = this._weekModel().focusEx;
        if (id && global.VTApp?.openExercise) global.VTApp.openExercise(id);
      });
    },
    /** The plan as it stands: stored plan + practice-day ledger. */
    _weekModel() {
      const S = global.VTStorage;
      const D = global.VTDays;
      const I = global.VTI18n;
      const tr = (k, v) => (I && I.t ? I.t(k, v) : k);
      const plan = (S && S.getWeekPlan && S.getWeekPlan()) || { weekNumber: 1, status: "idle", reviews: [] };
      const elLabel = (el) => {
        if (!el) return "";
        const key = "plan.el." + String(el).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        const out = tr(key);
        return out === key ? el : out;
      };
      const all = [...(global.VT_EXERCISES?.vocal || []), ...(global.VT_EXERCISES?.singing || [])];
      const exTitle = (id) => {
        const ex = all.find((e) => e.id === id);
        return ex ? (I && I.exTitle ? I.exTitle(ex) : ex.title) : id;
      };
      const track = global.VTApp?.getState?.()?.exercise?.track || "vocal";
      const map = plan.element ? global.VT_WEEK_ELEMENT_EXERCISES?.[plan.element] : null;
      const ids = map ? (map[track]?.length ? map[track] : map[track === "vocal" ? "singing" : "vocal"] || []) : [];
      const focusEx = ids.find((id) => id !== "v9-12-week") || null;
      const weekN = Number(plan.weekNumber) || 1;
      const active = plan.status !== "idle" && !!plan.startedAt;
      const loc = isEs() ? "es-PE" : "en-GB";

      let days = [];
      let focusDays = null;
      let dayIndex = 0;
      let todayFocus = false;
      if (D && D.dayKey) {
        const today = D.dayKey();
        let bag = { days: {} };
        try {
          bag = D.read();
        } catch {
          bag = { days: {} };
        }
        const start = active ? D.dayKey(new Date(plan.startedAt)) : D.weekStart(today);
        dayIndex = D.diffDays(start, today) + 1;
        let n = 0;
        for (let i = 0; i < 7; i++) {
          const key = D.addDays(start, i);
          const row = bag.days ? bag.days[key] : null;
          const practised = D.counts(row);
          const focus = active && practised && ids.some((id) => (row.ex || []).includes(id));
          if (focus) n += 1;
          if (focus && key === today) todayFocus = true;
          const d = D.parseDay(key);
          let label = "";
          try {
            label = d.toLocaleDateString(loc, { weekday: "short" }).replace(".", "");
          } catch {
            label = String(i + 1);
          }
          days.push({
            label,
            num: String(d.getDate()),
            state: key > today ? "future" : focus ? "focus" : practised ? "other" : "none",
            today: key === today
          });
        }
        focusDays = active ? n : null;
      } else {
        days = Array.from({ length: 7 }, (_, i) => ({ label: String(i + 1), num: "", state: "none", today: false }));
      }

      const el = elLabel(plan.element);
      const head = active
        ? L(`Semana ${weekN} · ${el}`, `Week ${weekN} · ${el}`) + (dayIndex >= 1 && dayIndex <= 7 ? L(` · día ${dayIndex} de 7`, ` · day ${dayIndex} of 7`) : "")
        : plan.element
          ? L(`Semana ${weekN} · foco: ${el}`, `Week ${weekN} · focus: ${el}`)
          : L(`Semana ${weekN} · elige un foco`, `Week ${weekN} · pick a focus`);
      let action;
      if (!active && !plan.element) action = L("Abre el plan y elige UN elemento para esta semana", "Open the plan and pick ONE element for this week");
      else if (!active) action = focusEx ? L(`Empieza la semana con ${exTitle(focusEx)}`, `Start the week with ${exTitle(focusEx)}`) : L("Empieza la semana en el plan", "Start the week in the plan");
      else if (plan.status === "review" || dayIndex > 7) action = L("La semana terminó: graba una muestra corta y revisa en el plan", "The week is done: record a short sample and review it in the plan");
      else if (todayFocus) action = L("Hoy ya practicaste tu foco ✓ · mañana, otra ronda corta", "Focus practised today ✓ · another short round tomorrow");
      else action = focusEx ? L(`Hoy: unos minutos de ${exTitle(focusEx)}`, `Today: a few minutes of ${exTitle(focusEx)}`) : L("Hoy: una ronda corta de tu foco", "Today: one short round of your focus");

      const reviews = plan.reviews || [];
      const weeks = [];
      for (let w = 1; w <= 12; w++) {
        const r = reviews.find((x) => Number(x.week ?? x.weekNumber) === w);
        weeks.push({
          state: w < weekN ? "done" : w === weekN ? "current" : "todo",
          verdict: r ? r.verdict : null,
          label: r ? elLabel(r.element) : w === weekN ? el : ""
        });
      }
      return { head, focusDays, action, days, weeks, focusEx };
    },
    onStart() {
      // app.js opens the plan on Start; the picture stays as it was drawn
    },
    onStop() {
      return { patches: {}, summary: L("Tu plan está en la pestaña Plan", "Your plan lives in the Plan tab") };
    }
  });

  /**
   * v10 power pause — "Pausa medida". The silence is the exercise, so the
   * silence is what the picture shows: a gauge that grows while you are
   * quiet, a strip of speech and silence, and three takes (baseline, a pause
   * after every idea, pauses only at the peaks) compared after Stop.
   *
   * Pauses come from the raw sound edge (VTFeatures.Vad), not `voiced`: that
   * flag bridges ~1.2 s of silence, so a correct 1.2 s pause never counted.
   */
  Modes.pauseDetect = baseMode({
    id: "pauseDetect",
    render() {
      const lo = this.profile.minPauseSec || 0.8;
      const hi = this.profile.maxPauseSec || 3;
      this.state.band = [lo, hi];
      this.state.pauses = 0;
      this.state.takes = [
        { name: L("1 · Base", "1 · Baseline"), short: L("1 · Base", "1 · Base"), start: null, end: null, counted: [] },
        { name: L("2 · Tras cada idea", "2 · After each idea"), short: L("2 · Ideas", "2 · Ideas"), start: null, end: null, counted: [] },
        { name: L("3 · Solo en los picos", "3 · Only at the peaks"), short: L("3 · Picos", "3 · Peaks"), start: null, end: null, counted: [] }
      ];
      this.state.current = 0;
      this.state.lastPauses = [];
      this.state.review = false;
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${L("Pausa de poder", "Power pause")}</div>
          <button type="button" class="btn btn-ghost viz-tap" data-next-take>${L("Siguiente toma →", "Next take →")}</button>
        </div>
        <div class="viz-words">
          <span data-status>${L("Di un punto… y aterriza en silencio.", "Speak a point… then land in silence.")}</span>
          <strong class="mode-big" data-p>0</strong>
        </div>
        <p class="mode-meta muted">${L(
          `Cuenta cada silencio de ${lo.toString().replace(".", ",")} a ${hi} s después de hablar.`,
          `Counts each silence of ${lo}–${hi} s after speech.`
        )}</p>
      `;
      this.$("[data-next-take]")?.addEventListener("click", () => this._nextTake());
      this._mountViz();
    },
    _mountViz() {
      const V = global.VTViz;
      const F = global.VTFeatures;
      if (!V || !F || !V.scenes.pause) return;
      this.hud.classList.add("has-viz");
      this.state.vad = new F.Vad({
        onPauseEnd: (start, len) => this._pauseClosed(len)
      });
      this.viz = new V.Surface(this.hud, (ctx, w, h) => V.scenes.pause(ctx, w, h, this.state), {
        label: L(
          "Medidor de pausas: crece mientras estás en silencio; la franja verde es la pausa de poder. Debajo, tu habla y tus silencios de los últimos segundos.",
          "Pause meter: it grows while you are silent; the green band is a power pause. Below, your speech and silences over the last seconds."
        )
      });
      this.viz.draw();
    },
    _nextTake() {
      const st = this.state;
      const cur = st.takes[st.current];
      if (cur && cur.start != null && cur.end == null) cur.end = st.vad ? st.vad.t : 0;
      if (st.current < st.takes.length - 1) {
        st.current += 1;
        const nxt = st.takes[st.current];
        nxt.start = st.vad ? st.vad.t : 0;
        nxt.end = null;
        this.viz?.caption?.(nxt.name, 0);
      }
      if (st.current >= st.takes.length - 1) {
        const b = this.$("[data-next-take]");
        if (b) b.disabled = true;
      }
      this.viz?.draw();
    },
    _pauseClosed(len) {
      const st = this.state;
      st.lastPauses.push(len);
      if (st.lastPauses.length > 6) st.lastPauses.shift();
      const [lo, hi] = st.band;
      if (len >= lo && len <= hi) {
        st.pauses += 1;
        st.takes[st.current]?.counted.push(len);
        if (this.$("[data-p]")) this.$("[data-p]").textContent = String(st.pauses);
        const words = L(`Pausa de ${len.toFixed(1).replace(".", ",")} s ✓`, `Pause ${len.toFixed(1)} s ✓`);
        if (this.$("[data-status]")) this.$("[data-status]").textContent = words;
        this.viz?.caption?.(words, 1500);
      }
    },
    onStart() {
      const st = this.state;
      st.review = false;
      this.hud?.classList.remove("is-replay");
      st.vad?.reset();
      st.takes.forEach((t) => {
        t.start = null;
        t.end = null;
        t.counted = [];
      });
      st.current = 0;
      st.takes[0].start = 0;
      st.pauses = 0;
      st.lastPauses = [];
      const b = this.$("[data-next-take]");
      if (b) b.disabled = false;
      if (this.$("[data-p]")) this.$("[data-p]").textContent = "0";
      this.viz?.draw();
    },
    onFrame(frame) {
      const st = this.state;
      if (!st.vad) return;
      const before = st.vad.state;
      st.vad.feed(frame);
      if (before !== st.vad.state && this.$("[data-status]")) {
        this.$("[data-status]").textContent =
          st.vad.state === "speech" ? L("Hablando…", "Speaking…") : L("Silencio…", "Silence…");
      }
      this.viz?.draw();
    },
    onStop() {
      const st = this.state;
      const cur = st.takes[st.current];
      if (cur && cur.start != null && cur.end == null) cur.end = st.vad ? st.vad.t : 0;
      st.review = true;
      if (this.viz) {
        this.hud.classList.add("is-replay");
        this.viz.draw();
      }
      const n = st.pauses || 0;
      // Only the count is measured; felt authority stays the learner's rating
      return {
        patches: n > 0 ? { pauseCount: n } : {},
        summary: L(
          `${n} ${n === 1 ? "pausa de poder" : "pausas de poder"} después de hablar`,
          `${n} power ${n === 1 ? "pause" : "pauses"} after speech`
        )
      };
    }
  });

  /**
   * v11 — kill the fillers, in three rounds on the same topic. Round 1 is
   * awareness (the learner taps when they catch a filler), rounds 2–3 the
   * competing response (close the mouth and pause instead). A microphone
   * cannot tell which word was said: the taps are the learner's, the pauses
   * are measured from the raw sound edge (VTFeatures.Vad), and long flat
   * voiced sounds ("eee", "mmm") are marked only as possible hesitations,
   * approximate, never counted as fillers and never red.
   */
  Modes.fillerDetect = baseMode({
    id: "fillerDetect",
    render() {
      const st = this.state;
      const n = this.profile.rounds || 3;
      const sec = this.profile.roundSec || 120;
      st.goal = this.profile.minPauseSec || 0.7;
      st.rounds = Array.from({ length: n }, (_, i) => ({
        name: L(`Ronda ${i + 1}`, `Round ${i + 1}`),
        short: L(`R${i + 1}`, `R${i + 1}`),
        sec,
        start: null,
        end: null,
        noted: [],
        replaced: [],
        hes: [],
        pauses: [],
        talk: 0
      }));
      const goalTxt = String(st.goal);
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${L("Elimina rellenos", "Kill the fillers")}</div>
          <button type="button" class="btn btn-ghost viz-tap" data-next-round>${L("Siguiente ronda →", "Next round →")}</button>
        </div>
        <div class="viz-words" aria-live="polite">
          <span data-status>${L("Ronda 1: habla de tu tema y toca al notar un relleno.", "Round 1: talk on your topic and tap when you catch a filler.")}</span>
          ${L("Rellenos notados", "Fillers caught")} <strong data-f>0</strong> ·
          ${L("Pausas en su lugar", "Paused instead")} <strong data-r>0</strong> ·
          ${L(`Pausas de ${goalTxt.replace(".", ",")} s o más`, `Pauses of ${goalTxt} s or more`)} <strong data-p>0</strong> ·
          ${L("Posibles sonidos de duda (aprox.)", "Possible hesitation sounds (approx.)")} <strong data-hes>0</strong>
        </div>
        <p class="mode-meta muted">${L(
          "El micrófono no distingue palabras: los «o sea», «este» o «entonces» los notas tú. Solo marca, aprox., sonidos largos y planos («eee», «mmm») y tus silencios.",
          "The mic cannot tell words apart: the “like”, “you know” and “so” are yours to notice. It only marks, approx., long flat sounds (“uhh”, “mmm”) and your silences."
        )}</p>
        <div class="viz-row st-taps">
          <button type="button" class="btn btn-ghost viz-tap st-tap st-tap-fill" data-fill>▽ ${L("Noté un relleno", "Caught a filler")}</button>
          <button type="button" class="btn btn-success viz-tap st-tap st-tap-rep" data-rep>■ ${L("Pausé en su lugar", "Paused instead")}</button>
        </div>
      `;
      this.$("[data-fill]")?.addEventListener("click", () => this._tap("noted"));
      this.$("[data-rep]")?.addEventListener("click", () => this._tap("replaced"));
      this.$("[data-next-round]")?.addEventListener("click", () => this._nextRound(false));
      this._resetRounds();
      this._mountViz();
    },
    _resetRounds() {
      const st = this.state;
      const F = global.VTFeatures;
      const K = global.VTViz?.speechTiming;
      st.current = 0;
      st.remaining = st.rounds[0]?.sec || 0;
      st.frac = 0;
      st.done = false;
      st.review = false;
      st.running = false;
      st.fillers = 0;
      st.replacements = 0;
      st.pauses = 0;
      st.hesCount = 0;
      st.last = performance.now();
      st.rounds.forEach((r) => {
        r.start = null;
        r.end = null;
        r.noted = [];
        r.replaced = [];
        r.hes = [];
        r.pauses = [];
        r.talk = 0;
      });
      if (F && K) {
        st.vad = new F.Vad({ onPauseEnd: (start, len) => this._pauseClosed(len) });
        st.hes = new K.Hesitations({ onFound: (hit) => this._hesFound(hit) });
      }
      ["[data-f]", "[data-r]", "[data-p]", "[data-hes]"].forEach((s) => {
        if (this.$(s)) this.$(s).textContent = "0";
      });
      const b = this.$("[data-next-round]");
      if (b) b.disabled = false;
    },
    _mountViz() {
      const V = global.VTViz;
      if (!V || !V.scenes.fillerRounds || !this.state.vad) return;
      this.hud.classList.add("has-viz");
      this.viz = new V.Surface(this.hud, (ctx, w, h) => V.scenes.fillerRounds(ctx, w, h, this.state), {
        label: L(
          "Rondas sin relleno: el anillo se llena mientras haces una pausa; debajo, tu habla y tus silencios, con tus marcas: triángulo, relleno notado; cuadrado, pausa en su lugar; círculo, posible sonido de duda.",
          "Filler-free rounds: the ring fills while you pause; below, your speech and silences with your marks: triangle, filler caught; square, paused instead; circle, possible hesitation sound."
        ),
        captionHidden: true
      });
      // The picture sits above the two tap buttons
      const taps = this.$(".st-taps");
      if (taps && this.viz.wrap) this.hud.insertBefore(this.viz.wrap, taps);
      this.viz.draw();
    },
    _tap(kind) {
      const st = this.state;
      const r = st.rounds[st.current];
      if (!st.running || !r || !st.vad) return;
      const t = st.vad.t;
      if (kind === "noted") {
        // A tap comes a beat after the filler: place the mark where it was
        r.noted.push(Math.max(r.start, t - 0.6));
        st.fillers += 1;
        if (this.$("[data-f]")) this.$("[data-f]").textContent = String(st.fillers);
      } else {
        r.replaced.push(t);
        st.replacements += 1;
        if (this.$("[data-r]")) this.$("[data-r]").textContent = String(st.replacements);
      }
      this.viz?.caption?.(kind === "noted" ? L("Relleno notado", "Filler caught") : L("Pausa en su lugar", "Paused instead"), 800);
      this.viz?.draw();
    },
    _pauseClosed(len) {
      const st = this.state;
      if (!st.running || len < st.goal) return;
      st.pauses += 1;
      st.rounds[st.current]?.pauses.push(len);
      if (this.$("[data-p]")) this.$("[data-p]").textContent = String(st.pauses);
    },
    _hesFound(hit) {
      const st = this.state;
      if (!st.running) return;
      st.rounds[st.current]?.hes.push(hit);
      st.hesCount += 1;
      if (this.$("[data-hes]")) this.$("[data-hes]").textContent = String(st.hesCount);
    },
    _nextRound(auto) {
      const st = this.state;
      if (st.done || !st.vad) return;
      const r = st.rounds[st.current];
      if (st.current < st.rounds.length - 1) {
        if (r && r.start != null && r.end == null) r.end = st.vad.t;
        st.current += 1;
        const nx = st.rounds[st.current];
        nx.start = st.vad.t;
        st.remaining = nx.sec;
        st.frac = 0;
        const words = L(
          `${nx.name}: mismo tema. Si viene un relleno, cierra la boca y pausa.`,
          `${nx.name}: same topic. If a filler comes, close your mouth and pause.`
        );
        if (this.$("[data-status]")) this.$("[data-status]").textContent = words;
        if (global.VTToast) global.VTToast(words);
      } else {
        // The last round keeps listening; Stop shows the map
        st.done = true;
        st.remaining = 0;
        st.frac = 1;
      }
      if (st.done || st.current >= st.rounds.length - 1) {
        const b = this.$("[data-next-round]");
        if (b) b.disabled = true;
      }
      if (!auto) this.viz?.draw();
    },
    onStart() {
      this._resetRounds();
      const st = this.state;
      st.running = true;
      if (st.rounds[0]) st.rounds[0].start = 0;
      this.hud?.classList.remove("is-replay");
      ["[data-fill]", "[data-rep]"].forEach((s) => {
        if (this.$(s)) this.$(s).disabled = false;
      });
      this.viz?.draw();
    },
    onFrame(frame) {
      const st = this.state;
      if (!st.vad || !st.running) return;
      const now = performance.now();
      const dt = Math.min(0.25, Math.max(0, (now - st.last) / 1000));
      st.last = now;
      st.vad.feed(frame);
      st.hes.feed(frame);
      const r = st.rounds[st.current];
      if (r && st.vad.state === "speech") r.talk += global.VTViz.speechTiming.frameDt(frame);
      if (!st.done) {
        st.remaining -= dt;
        st.frac = clamp(1 - st.remaining / (r?.sec || 1), 0, 1);
        if (st.remaining <= 0) this._nextRound(true);
      }
      this.viz?.draw();
    },
    onStop() {
      const st = this.state;
      if (st.vad) {
        const r = st.rounds[st.current];
        if (r && r.start != null && r.end == null) r.end = st.vad.t;
      }
      st.running = false;
      st.review = true;
      ["[data-fill]", "[data-rep]", "[data-next-round]"].forEach((s) => {
        if (this.$(s)) this.$(s).disabled = true;
      });
      if (this.viz) {
        this.hud.classList.add("is-replay");
        this.viz.draw();
      }
      const played = (st.rounds || []).filter((r) => r.start != null);
      const seq = played.map((r) => r.noted.length);
      const seqR = played.map((r) => r.replaced.length);
      // The best round is the one with the fewest fillers caught, among the
      // rounds long enough to mean something; only when the learner used the
      // taps at all (no taps is not "no fillers").
      const patches = {};
      const tapped = (st.fillers || 0) + (st.replacements || 0) > 0;
      const real = played.filter((r) => r.talk >= 20);
      if (tapped && real.length) patches.fillerCount = Math.min(...real.map((r) => r.noted.length));
      const hes = st.hesCount || 0;
      const hesTxt = hes ? L(` · ≈${hes} posibles sonidos de duda (aprox.)`, ` · ≈${hes} possible hesitation sounds (approx.)`) : "";
      return {
        patches,
        summary: played.length
          ? L(
              `Rellenos notados por ronda: ${seq.join(" → ")} · pausas en su lugar: ${seqR.join(" → ")}${hesTxt}`,
              `Fillers caught per round: ${seq.join(" → ")} · paused instead: ${seqR.join(" → ")}${hesTxt}`
            )
          : L("Sin rondas todavía", "No rounds yet")
      };
    }
  });

  /**
   * v14 — pace for impact, in three takes of the same short message: an
   * even take that measures the learner's own pace, a take that slows on
   * each key idea, and a take with a brake (a pause) before it. The pace is
   * syllables per second, approximate, only ever shown against the even
   * take. The learner taps «Punto clave» as a key idea starts; the next five
   * seconds decide whether it landed (slower than the base, or a pause) —
   * which idea is the key one only the learner knows.
   */
  Modes.keyPointPace = baseMode({
    id: "keyPointPace",
    render() {
      const st = this.state;
      st.goal = this.profile.keyPoints || 3;
      st.pauseGoal = this.profile.minPauseSec || 0.7;
      st.win = 5;
      const takes = [
        {
          word: L("uniforme", "even"),
          how: L("Toma 1: di tu mensaje a un solo ritmo, sin frenos. Mide tu base.", "Take 1: say your message at one even pace, no brakes. It measures your base."),
          cue: ""
        },
        {
          word: L("varía", "vary"),
          how: L(
            "Toma 2: lento en cada idea clave (toca «Punto clave» al llegar) y un poco más vivo en los puentes.",
            "Take 2: slow on each key idea (tap “Key point” as it starts), a little brisker on the bridges."
          ),
          cue: L("Lento en lo clave · toca «Punto clave»", "Slow on the key idea · tap “Key point”")
        },
        {
          word: L("frenos", "brakes"),
          how: L(
            "Toma 3: un freno — una pausa — antes de cada idea clave, y luego lento.",
            "Take 3: a brake — a pause — before each key idea, then slow."
          ),
          cue: L("Un freno antes de lo clave, luego lento", "A brake before the key idea, then slow")
        }
      ];
      st.takes = takes.map((k, i) =>
        Object.assign(k, { name: `${i + 1} · ${k.word}`, short: String(i + 1), start: null, end: null, flags: [], spread: null })
      );
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${L("Ritmo con impacto", "Pace for impact")}</div>
          <button type="button" class="btn btn-ghost viz-tap" data-next-take>${L("Siguiente toma →", "Next take →")}</button>
        </div>
        <div class="viz-words" aria-live="polite">
          <span data-status>${takes[0].how}</span>
          ${L("Ritmo, aprox.", "Pace, approx.")} <strong data-rate>—</strong> ·
          ${L("Anclas en esta toma", "Anchors this take")} <strong data-k>0</strong> / ${st.goal} ·
          ${L("Puntos clave marcados", "Key points marked")} <strong data-marked>0</strong>
          <span data-last></span>
        </div>
        <p class="mode-meta muted">${L(
          "Tu ritmo en sílabas por segundo, aprox., frente a tu propia toma uniforme. Qué idea es la clave lo sabes tú: el micrófono solo mide si bajaste el ritmo o hiciste una pausa después de tocar.",
          "Your pace in syllables per second, approx., against your own even take. Which idea is the key one only you know: the mic only measures whether you slowed down or paused after the tap."
        )}</p>
        <div class="viz-row st-taps">
          <button type="button" class="btn btn-primary viz-tap st-tap st-tap-key" data-key>${L("Punto clave", "Key point")}</button>
        </div>
      `;
      this.$("[data-key]")?.addEventListener("click", () => this._keyPoint());
      this.$("[data-next-take]")?.addEventListener("click", () => this._nextTake());
      this._resetTakes();
      this._mountViz();
    },
    _resetTakes() {
      const st = this.state;
      const F = global.VTFeatures;
      const K = global.VTViz?.speechTiming;
      st.current = 0;
      st.elapsed = 0;
      st.done = false;
      st.review = false;
      st.running = false;
      st.talked = false;
      st.waiting = false;
      st.base = null;
      st.provBase = null;
      st.baseFrac = 0;
      st.band = null;
      st.baseAcc = { peaks: 0, speech: 0, samples: [], sampleAcc: 0 };
      st.open = [];
      st.flash = null;
      st.marked = 0;
      st.last = performance.now();
      st.lastWords = 0;
      st.lastLive = 0;
      st.takes.forEach((k) => {
        k.start = null;
        k.end = null;
        k.flags = [];
        k.spread = null;
        k.bin = null;
      });
      if (F && K) {
        st.vad = new F.Vad({});
        st.rt = new K.RateTrack({ windowSec: 3 });
        st.live = new K.SlowValue(0.6);
      }
      ["[data-k]", "[data-marked]"].forEach((s) => {
        if (this.$(s)) this.$(s).textContent = "0";
      });
      if (this.$("[data-rate]")) this.$("[data-rate]").textContent = "—";
      if (this.$("[data-last]")) this.$("[data-last]").textContent = "";
      const b = this.$("[data-next-take]");
      if (b) b.disabled = false;
    },
    _mountViz() {
      const V = global.VTViz;
      if (!V || !V.scenes.paceRiver || !this.state.rt) return;
      this.hud.classList.add("has-viz");
      this.viz = new V.Surface(this.hud, (ctx, w, h) => V.scenes.paceRiver(ctx, w, h, this.state), {
        label: L(
          "Río de ritmo: una línea con tu ritmo de habla en el último medio minuto, frente a la banda de tu ritmo uniforme; cada punto clave deja una bandera, que se vuelve ancla dorada si bajaste el ritmo o hiciste una pausa.",
          "Pace river: a line with your speaking pace over the last half minute, against the band of your even pace; each key point drops a flag, which becomes a gold anchor if you slowed down or paused."
        ),
        captionHidden: true
      });
      const taps = this.$(".st-taps");
      if (taps && this.viz.wrap) this.hud.insertBefore(this.viz.wrap, taps);
      this.viz.draw();
    },
    _keyPoint() {
      const st = this.state;
      const k = st.takes[st.current];
      if (!st.running || !k || !st.rt) return;
      // The tap comes as the key idea starts; a beat of lag is fine here
      const f = { t: st.rt.t, state: "wait", rel: null, pause: 0, peaks: 0, speech: 0 };
      k.flags.push(f);
      st.open.push(f);
      st.marked += 1;
      st.waiting = true;
      if (this.$("[data-marked]")) this.$("[data-marked]").textContent = String(st.marked);
      this.viz?.draw();
    },
    /** Five seconds after a tap: did the pace drop, or did a pause come? */
    _judge(f, base) {
      const st = this.state;
      const rate = f.speech >= 1.2 ? f.peaks / f.speech : null;
      f.rel = rate != null && base ? rate / base : null;
      let pause = 0;
      const from = f.t - 1.5;
      const to = f.t + st.win + 2.5;
      (st.vad?.segments || []).forEach((g) => {
        if (g.kind !== "pause") return;
        const end = g.end != null ? g.end : st.vad.t;
        if (end < from || g.start > to) return;
        pause = Math.max(pause, end - g.start);
      });
      f.pause = pause;
      const slowed = f.rel != null && f.rel <= 0.85;
      const paused = pause >= st.pauseGoal;
      f.state = slowed || paused ? "anchor" : "flat";
      const V = global.VTViz;
      const k = st.takes.find((x) => x.flags.includes(f));
      const n = k ? k.flags.filter((x) => x.state === "anchor").length : 0;
      if (k === st.takes[st.current] && this.$("[data-k]")) this.$("[data-k]").textContent = String(n);
      let words;
      if (f.state === "anchor") {
        const parts = [];
        if (slowed) parts.push(L(`${Math.round((1 - f.rel) * 100)} % más lento`, `${Math.round((1 - f.rel) * 100)}% slower`));
        if (paused) parts.push(L(`pausa de ${V.fmtSec(pause)}`, `a ${V.fmtSec(pause)} pause`));
        words = L("✓ Ancla: ", "✓ Anchor: ") + parts.join(" · ");
        st.flash = { text: words, color: V.C.done, until: performance.now() + 3000 };
      } else {
        words = L("Ese punto sonó a tu ritmo base", "That one was at your usual pace");
        st.flash = { text: words, color: V.C.text, until: performance.now() + 3000 };
      }
      if (this.$("[data-last]")) this.$("[data-last]").textContent = " · " + words;
    },
    _closeTake() {
      const st = this.state;
      const k = st.takes[st.current];
      if (!k || k.start == null || k.end != null) return;
      k.end = st.rt ? st.rt.t : 0;
      const bin = st.rt?.cur;
      const base = st.base || st.provBase;
      if (bin && base && bin.samples.length >= 4) {
        const K = global.VTViz.speechTiming;
        k.spread = (K.quantile(bin.samples, 0.75) - K.quantile(bin.samples, 0.25)) / 2 / base;
      }
      k.bin = bin || null;
    },
    _nextTake() {
      const st = this.state;
      if (st.done || !st.rt) return;
      if (st.current < st.takes.length - 1) {
        this._closeTake();
        st.current += 1;
        const k = st.takes[st.current];
        k.start = st.rt.t;
        st.rt.begin(st.current);
        st.elapsed = 0;
        st.flash = null;
        if (this.$("[data-status]")) this.$("[data-status]").textContent = k.how;
        if (this.$("[data-k]")) this.$("[data-k]").textContent = "0";
        if (global.VTToast) global.VTToast(k.how);
      } else {
        st.done = true;
      }
      if (st.done || st.current >= st.takes.length - 1) {
        const b = this.$("[data-next-take]");
        if (b) b.disabled = true;
        if (st.done && this.$("[data-status]"))
          this.$("[data-status]").textContent = L("Tres tomas listas: Detener muestra el mapa.", "Three takes done: Stop shows the map.");
      }
      this.viz?.draw();
    },
    onStart() {
      this._resetTakes();
      const st = this.state;
      st.running = true;
      if (st.takes[0]) st.takes[0].start = 0;
      st.rt?.begin(0);
      this.hud?.classList.remove("is-replay");
      if (this.$("[data-key]")) this.$("[data-key]").disabled = false;
      this.viz?.draw();
    },
    onFrame(frame) {
      const st = this.state;
      if (!st.running || !st.rt) return;
      const K = global.VTViz.speechTiming;
      const now = performance.now();
      const dt = Math.min(0.25, Math.max(0, (now - st.last) / 1000));
      st.last = now;
      st.elapsed += dt;
      st.vad.feed(frame);
      const s0 = st.rt.sr.speechT;
      const peak = st.rt.feed(frame) ? 1 : 0;
      const dS = Math.max(0, st.rt.sr.speechT - s0);
      const t = st.rt.t;
      if (st.rt.talking) st.talked = true;
      // The five seconds after each tap
      st.open.forEach((f) => {
        if (t <= f.t + st.win) {
          f.peaks += peak;
          f.speech += dS;
        }
      });
      // The base: the even take, away from any key point, until it has 8 s
      // of talking (and on into take 2 if take 1 was cut short)
      const near = st.takes.some((k) => k.flags.some((f) => t >= f.t - 1 && t <= f.t + st.win + 1));
      const measuring = st.current === 0 || st.base == null;
      if (measuring && !near) {
        const A = st.baseAcc;
        A.peaks += peak;
        A.speech += dS;
        A.sampleAcc += dS;
        if (A.sampleAcc >= 1) {
          A.sampleAcc -= 1;
          const r = st.rt.rate;
          if (r != null) A.samples.push(r);
        }
        st.baseFrac = clamp(A.speech / 8, 0, 1);
        if (A.speech >= 8 && A.peaks > 0) {
          const first = st.base == null;
          st.base = A.peaks / A.speech;
          if (A.samples.length >= 4) {
            const q1 = K.quantile(A.samples, 0.25) / st.base;
            const q3 = K.quantile(A.samples, 0.75) / st.base;
            st.band = [Math.min(0.95, q1), Math.max(1.05, q3)];
          }
          if (first) st.flash = { text: L("✓ Base medida", "✓ Base measured"), color: global.VTViz.C.done, until: now + 2000 };
        }
      }
      if (st.base == null) st.provBase = st.rt.sr.overall;
      // Judge each tap once its five seconds are up (and a pause that is
      // still going has had its chance to count)
      const base = st.base;
      if (base) {
        st.open = st.open.filter((f) => {
          if (t < f.t + st.win) return true;
          if (st.vad.state === "pause" && t < f.t + st.win + 2.5) return true;
          this._judge(f, base);
          return false;
        });
      }
      st.waiting = st.open.some((f) => t < f.t + st.win);
      // One slow value for the dot: a new target every half second of talking
      const denom = st.base || st.provBase;
      if (denom && st.rt.rate != null && st.rt.talking && now - st.lastLive > 500) {
        st.lastLive = now;
        st.live.set(st.rt.rate / denom);
      }
      st.live.step(dt);
      if (now - st.lastWords > 300) {
        st.lastWords = now;
        const r = st.rt.rate;
        if (this.$("[data-rate]"))
          this.$("[data-rate]").textContent =
            r != null && denom ? `${global.VTViz.fmtNum(r, 1)} ${L("síl/s", "syll/s")} (${K.pct(r / denom)})` : "—";
      }
      this.viz?.draw();
    },
    onStop() {
      const st = this.state;
      st.running = false;
      if (st.rt) {
        this._closeTake();
        st.rt.end();
        const base = st.base || st.rt.sr.overall;
        (st.open || []).forEach((f) => this._judge(f, base));
        st.open = [];
        if (!st.base) st.provBase = base;
      }
      st.waiting = false;
      st.flash = null;
      st.review = true;
      ["[data-key]", "[data-next-take]"].forEach((s) => {
        if (this.$(s)) this.$(s).disabled = true;
      });
      if (this.viz) {
        this.hud.classList.add("is-replay");
        this.viz.draw();
      }
      const played = (st.takes || []).filter((k) => k.start != null);
      const anchors = played.map((k) => k.flags.filter((f) => f.state === "anchor").length);
      const patches = {};
      // Intentional slow-downs: the best take's anchors, and only when the
      // learner marked key points at all
      if (st.marked > 0 && anchors.length) patches.keySlowdowns = Math.max(...anchors);
      const spread = played.map((k) => (k.spread != null ? L(`±${Math.round(k.spread * 100)} %`, `±${Math.round(k.spread * 100)}%`) : "—"));
      return {
        patches,
        summary:
          played.length && (st.base || st.provBase)
            ? L(
                `Anclas por toma: ${anchors.join(" → ")} · variación de ritmo aprox.: ${spread.join(" → ")}`,
                `Anchors per take: ${anchors.join(" → ")} · pace variation, approx.: ${spread.join(" → ")}`
              )
            : L("Sin ritmo medido todavía: habla unos segundos.", "No pace measured yet: speak for a few seconds.")
      };
    }
  });

  /**
   * v15 gestures — no camera here, so each gesture is a drawing on a 4 s
   * loop: home base, then the gesture arriving just before its key word
   * lights up in the line to say. Hands still → open palms → size → count →
   * location. Recorded; purposefulness and congruence stay self-ratings.
   */
  Modes.gestureReps = baseMode({
    id: "gestureReps",
    render() {
      const G = global.VTViz?.guided;
      const title = L("Gestos con intención", "Purposeful gestures");
      const phases = this.profile.phases || [];
      if (!G || !phases.length) {
        this.hud.innerHTML = `<div class="mode-title">${title}</div><p class="mode-meta">${L("Tamaño · cuenta · lugar", "Size · count · location")}</p>`;
        return;
      }
      this.viz = new G.Drill(this, {
        kind: "gesture",
        title,
        phases,
        mic: true,
        strip: true,
        recorded: true,
        skip: true,
        preCue: 3,
        label: L(
          "Dibujo del gesto del paso actual: vuelve a la base y el gesto llega justo antes de la palabra clave, que se ilumina en la frase de ejemplo.",
          "A drawing of this step's gesture: back to home base, and the gesture arrives just before the key word, which lights up in the example line."
        ),
        artFor: () => ({ draw: G.art.gesture, aspect: 1.3 }),
        scriptFor: (p, info) => {
          const line = G.loc(p, "line");
          return line ? { text: line, hot: G.gestureCycle(info.t || 0, info.reduced).hot } : null;
        },
        doneText: L("Ronda de gestos completa", "Gesture round complete"),
        reviewTitle: L("Escucha tu toma", "Listen to your take"),
        reviewNote: L(
          "Primero mira tu video sin sonido: ¿el gesto llega con la palabra o antes?",
          "Watch your video muted first: does the gesture land with the word, or before it?"
        )
      });
    },
    onStart() {
      this.viz?.start?.();
    },
    onFrame(frame) {
      this.viz?.frame?.(frame);
    },
    onStop() {
      const d = this.viz;
      d?.stop?.();
      const n = d ? d.run.completed : 0;
      const total = d ? d.run.count : 0;
      // Purposeful, congruent and calm are judged by the learner on video
      return {
        patches: {},
        summary: L(
          `Gestos: ${n} de ${total} pasos · mira el video sin sonido primero`,
          `Gestures: ${n} of ${total} steps · watch your video muted first`
        )
      };
    }
  });

  /**
   * v17 — receive, breathe, answer. The thinking silence is the skill, so it
   * is paced (a doorway that fills while you are silent and opens at the gate)
   * and measured from the raw sound edge, not the grace-bridged `voiced`. The
   * answer's length and its pauses are measured; whether it was concise is
   * the learner's own rating, so nothing fills it in.
   */
  Modes.concisionGate = baseMode({
    id: "concisionGate",
    render() {
      const st = this.state;
      st.maxQ = this.profile.questions || 5;
      st.gate = this.profile.preSilenceSec || 2.5;
      st.closeSec = this.profile.closeSilenceSec || 2;
      st.guide = this.profile.answerGuideSec || [20, 30];
      const d = new Date();
      st.offset = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 864e5);
      st.live = false;
      this._resetQs();
      const gate = global.VTViz ? global.VTViz.fmtNum(st.gate, 1) : String(st.gate);
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${L("Puerta de concisión", "Concision gate")}</div>
          <button type="button" class="btn btn-ghost viz-tap" data-next>${L("Siguiente pregunta →", "Next question →")}</button>
        </div>
        <div class="viz-words">
          <span class="mode-phase" data-phase></span>
          <strong class="mode-big" data-g></strong>
          <span>${L("Puertas abiertas", "Gates opened")}: <strong data-ok>0</strong>/${st.maxQ}</span>
        </div>
        <p class="mode-meta muted">${L(
          `Lee la pregunta, calla ${gate} s mientras piensas y responde con la idea primero. Medimos el silencio y cuánto dura la respuesta; la concisión la valoras tú.`,
          `Read the question, stay silent ${gate} s while you think, then answer point first. We measure the silence and how long the answer runs; you rate the concision.`
        )}</p>
      `;
      this.$("[data-next]")?.addEventListener("click", () => this._skip());
      this._mountViz();
      this._words();
    },
    /** A small bilingual bank; the learner may always use their own question. */
    _bank() {
      return [
        ["¿Qué cambiarías de tu último proyecto?", "What would you change about your last project?"],
        ["¿Por qué deberíamos elegir tu propuesta?", "Why should we pick your proposal?"],
        ["¿Qué aprendiste este mes?", "What did you learn this month?"],
        ["¿Cuál es el mayor riesgo de este plan?", "What is the biggest risk in this plan?"],
        ["¿Qué necesitas de tu equipo esta semana?", "What do you need from your team this week?"],
        ["¿Qué harías con el doble de presupuesto?", "What would you do with twice the budget?"],
        ["¿Qué error no volverías a cometer?", "Which mistake would you not make again?"],
        ["¿Cómo le explicarías tu trabajo a un niño?", "How would you explain your work to a child?"]
      ];
    },
    _newQ(i, t) {
      const bank = this._bank();
      const pair = bank[(this.state.offset + i) % bank.length];
      return {
        text: L(pair[0], pair[1]),
        shownAt: t,
        silent: 0,
        gateOk: false,
        aStart: null,
        aEnd: null,
        pauses: 0,
        blips: [],
        skipped: false
      };
    },
    _resetQs() {
      const st = this.state;
      st.qs = [this._newQ(0, 0)];
      st.q = 0;
      st.phase = "think";
      st.flash = null;
      st.review = false;
      st._lastT = 0;
    },
    _mountViz() {
      const V = global.VTViz;
      const S = V && V.scenes;
      if (!S || !S.ShapeTracker || !S.concisionGate) return;
      this.hud.classList.add("has-viz");
      this.state.tracker = new S.ShapeTracker({
        onPhrase: (p) => this._burst(p),
        onPauseEnd: (s, len) => this._pauseEnd(s, len)
      });
      this.viz = new V.Surface(this.hud, (ctx, w, h) => S.concisionGate(ctx, w, h, this.state), {
        label: L(
          "Puerta de concisión: la puerta se llena mientras piensas en silencio y se abre a los segundos pedidos; después, tu respuesta como habla y pausas frente a una guía de tiempo.",
          "Concision gate: the doorway fills while you think in silence and opens at the asked seconds; then your answer as speech and pauses against a time guide."
        ),
        captionHidden: true
      });
      this.viz.draw();
    },
    /** A burst of sound during the thinking time: noted, never a reset. */
    _burst(p) {
      const st = this.state;
      const q = st.qs[st.q];
      if (!q || st.phase !== "think" || q.aStart != null) return;
      const len = p.end - p.start;
      if (len >= 1.0) return;
      // A held, flat voiced sound ("eeh", "mmm") may be a filler; asked, not asserted
      const vb = p.bins.filter((b) => b.m != null).map((b) => b.m);
      let filler = false;
      if (vb.length >= 6) {
        const mean = vb.reduce((a, b) => a + b, 0) / vb.length;
        const sd = Math.sqrt(vb.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vb.length);
        filler = sd < 1;
      }
      q.blips.push({ t: p.start, len, filler });
    },
    _pauseEnd(start, len) {
      const st = this.state;
      const q = st.qs[st.q];
      if (st.phase === "answer" && q && q.aStart != null && start >= q.aStart && len >= 0.5) q.pauses += 1;
    },
    _tick() {
      const st = this.state;
      const trk = st.tracker;
      const vad = trk.vad;
      const t = trk.t;
      const dt = Math.max(0, t - (st._lastT || 0));
      st._lastT = t;
      const q = st.qs[st.q];
      if (!q) return;
      if (st.phase === "think") {
        if (vad.state !== "speech") {
          q.silent += dt;
          if (!q.gateOk && q.silent >= st.gate) {
            q.gateOk = true;
            this.viz?.caption?.(L("Puerta abierta: responde", "Gate open: answer"), 0);
          }
        } else if (q.gateOk || vad.runLen >= 1.0) {
          // Speech after the gate, or sustained speech before it, is the answer
          this._answer(vad.speechStart != null ? vad.speechStart : t);
        }
      } else if (st.phase === "answer") {
        if (vad.state === "pause" && vad.pauseLen >= st.closeSec) this._close(vad.pauseStart);
      }
    },
    _answer(t0) {
      const st = this.state;
      const q = st.qs[st.q];
      q.aStart = t0;
      st.phase = "answer";
      st.flash = null;
      this.viz?.caption?.(L("Respondiendo", "Answering"), 0);
    },
    _close(tEnd) {
      const st = this.state;
      const q = st.qs[st.q];
      const V = global.VTViz;
      q.aEnd = Math.max(q.aStart, tEnd);
      const len = q.aEnd - q.aStart;
      const words = L(
        `P${st.q + 1}: ${V.fmtNum(q.silent, 1)} s de silencio · respuesta de ${V.fmtNum(len, 0)} s`,
        `Q${st.q + 1}: ${V.fmtNum(q.silent, 1)} s of silence · ${V.fmtNum(len, 0)} s answer`
      );
      this.viz?.caption?.(words, 0);
      st.flash = { text: "✓ " + words, until: st.tracker.t + 2.5 };
      this._nextQ(st.tracker.t);
    },
    _nextQ(t) {
      const st = this.state;
      st.qs.push(this._newQ(st.qs.length, t));
      st.q = st.qs.length - 1;
      st.phase = "think";
    },
    /** "Next question": closes an answer in progress, or moves on without one. */
    _skip() {
      const st = this.state;
      if (st.review) return;
      if (!st.live || !st.tracker) {
        // Before Start: offer another question from the bank
        st.offset += 1;
        st.qs = [this._newQ(0, 0)];
        this._words();
        this.viz?.draw();
        return;
      }
      const t = st.tracker.t;
      if (st.phase === "answer") this._close(t);
      else {
        const q = st.qs[st.q];
        if (q && q.aStart == null) q.skipped = true;
        st.flash = null;
        this._nextQ(t);
      }
      this._words();
      this.viz?.draw();
    },
    _words() {
      const st = this.state;
      const q = st.qs[st.q];
      if (!q) return;
      const V = global.VTViz;
      const n = st.q + 1;
      let phase;
      let big;
      if (st.phase === "answer") {
        phase = L(`P${n} · Respondiendo`, `Q${n} · Answering`);
        const len = (q.aEnd != null ? q.aEnd : st.tracker ? st.tracker.t : 0) - q.aStart;
        big = `${Math.floor(len)} s`;
      } else {
        phase = q.gateOk
          ? L(`P${n} · Puerta abierta: responde`, `Q${n} · Gate open: answer`)
          : L(`P${n} · Recibe la pregunta y respira`, `Q${n} · Receive the question and breathe`);
        big = V ? `${V.fmtNum(q.silent, 1)} s` : `${q.silent.toFixed(1)} s`;
      }
      const set = (sel, text) => {
        const el = this.$(sel);
        if (el && el.textContent !== text) el.textContent = text;
      };
      set("[data-phase]", phase);
      set("[data-g]", big);
      set("[data-ok]", String(st.qs.filter((x) => x.gateOk).length));
    },
    onStart() {
      const st = this.state;
      st.live = true;
      st.review = false;
      this.hud?.classList.remove("is-replay");
      st.tracker?.reset();
      this._resetQs();
      this._words();
      this.viz?.draw();
    },
    onFrame(frame) {
      const st = this.state;
      if (!st.tracker) return;
      st.tracker.feed(frame);
      this._tick();
      this._words();
      this.viz?.draw();
    },
    onStop() {
      const st = this.state;
      const V = global.VTViz;
      st.live = false;
      const trk = st.tracker;
      if (trk) {
        trk.finish();
        const q = st.qs[st.q];
        if (st.phase === "answer" && q && q.aEnd == null) {
          q.aEnd = trk.vad.state === "pause" && trk.vad.pauseStart != null ? Math.max(q.aStart, trk.vad.pauseStart) : trk.t;
          // Stop right as an answer began: not an answer to measure
          if (q.aEnd - q.aStart < 1) {
            q.aStart = null;
            q.aEnd = null;
            q.pauses = 0;
          }
        }
      }
      st.review = true;
      if (this.viz) {
        this.hud.classList.add("is-replay");
        this.viz.draw();
      }
      const answered = st.qs.filter((q) => q.aStart != null);
      const gates = st.qs.filter((q) => q.gateOk).length;
      const n = answered.length;
      const sil = answered.map((q) => q.silent).sort((a, b) => a - b);
      const med = sil.length ? sil[Math.floor((sil.length - 1) / 2)] : null;
      const fmt = (v) => (V ? V.fmtNum(v, 1) : v.toFixed(1));
      return {
        // Only the count is measured; concision and the pause habit are the learner's ratings
        patches: n > 0 ? { questions: n } : {},
        summary:
          n > 0
            ? L(
                `${n} ${n === 1 ? "respuesta" : "respuestas"} · ${gates} con ${fmt(st.gate)} s de silencio antes · silencio mediano ${fmt(med)} s`,
                `${n} ${n === 1 ? "answer" : "answers"} · ${gates} after ${fmt(st.gate)} s of silence · median silence ${fmt(med)} s`
              )
            : L("Sin respuestas medidas todavía", "No answers measured yet")
      };
    }
  });

  /**
   * v18 — a story in parts: context, tension, the peak, the point. The parts
   * are a pacer you can move on from early; under them runs your loudness,
   * and a flag where you mark the peak. After Stop the peak is set against
   * the context in loudness, pace and the pause before it — delivery facts,
   * approximate; how vivid or clear the story was stays the learner's rating.
   */
  Modes.storyTimer = baseMode({
    id: "storyTimer",
    render() {
      const st = this.state;
      const keys = ["context", "tension", "peak", "point"];
      const phases = (this.profile.phases || []).length
        ? this.profile.phases
        : [
            { label: L("Contexto", "Context"), sec: 20 },
            { label: L("Tensión", "Tension"), sec: 25 },
            { label: L("Pico", "Peak"), sec: 30 },
            { label: L("Aprendizaje", "Point"), sec: 15 }
          ];
      st.phases = phases.map((p, i) => ({
        key: p.key || keys[i] || "part" + i,
        label: p.label,
        sec: p.sec || 20,
        hint: L(p.hintEs || p.hint || p.label, p.hint || p.label)
      }));
      st.live = false;
      this._resetStory();
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${L("Arco de historia", "Story arc")}</div>
          <span class="viz-btns">
            <button type="button" class="btn btn-ghost viz-tap" data-peak aria-label="${L("Marcar el pico ahora", "Mark the peak now")}"><span aria-hidden="true">⚑</span> <span class="ss-long">${L("Marcar pico", "Mark peak")}</span><span class="ss-short">${L("Pico", "Peak")}</span></button>
            <button type="button" class="btn btn-ghost viz-tap" data-next-phase aria-label="${L("Pasar a la siguiente parte", "Go to the next part")}"><span class="ss-long">${L("Siguiente parte →", "Next part →")}</span><span class="ss-short">${L("Parte →", "Part →")}</span></button>
          </span>
        </div>
        <div class="viz-words">
          <span class="mode-phase" data-phase>${st.phases[0].label}</span>
          <strong class="mode-big" data-remain>${st.phases[0].sec}s</strong>
          <span data-peak-st>${L("Pico aún no marcado", "Peak not marked yet")}</span>
        </div>
        <p class="mode-meta muted">${L(
          "Las partes son una guía: pasa a la siguiente cuando termines. Marca el pico cuando llegues; al detener verás el pico frente al contexto.",
          "The parts are a guide: move on when you are done. Mark the peak when you reach it; on Stop you see the peak against the context."
        )}</p>
      `;
      this.$("[data-peak]")?.addEventListener("click", () => this._mark());
      this.$("[data-next-phase]")?.addEventListener("click", () => {
        if (this.state.live && this.state.tracker) this._advance(this.state.tracker.t);
      });
      this._mountViz();
    },
    _resetStory() {
      const st = this.state;
      st.index = 0;
      st.starts = [0];
      st.over = false;
      st.overAt = null;
      st.ebins = [];
      st.medDb = null;
      st.marks = [];
      st.review = false;
      st.compare = null;
      st._eb = { k: 0, dbs: [], sp: 0, n: 0 };
      st._shown = "";
    },
    _mountViz() {
      const V = global.VTViz;
      const S = V && V.scenes;
      if (!S || !S.ShapeTracker || !S.storyArc) return;
      this.hud.classList.add("has-viz");
      this.state.tracker = new S.ShapeTracker({ syllables: true });
      this.viz = new V.Surface(this.hud, (ctx, w, h) => S.storyArc(ctx, w, h, this.state), {
        label: L(
          "Arco de historia: las partes de la historia como una barra según su tiempo, y debajo tu volumen con huecos en las pausas y una bandera donde marcas el pico.",
          "Story arc: the parts of the story as a bar sized by their time, and under it your loudness with gaps at pauses and a flag where you mark the peak."
        ),
        captionHidden: true
      });
      this.viz.draw();
    },
    /** Loudness in half-second bins: the 90th percentile of the sounding frames. */
    _energy(frame) {
      const st = this.state;
      const trk = st.tracker;
      const F = global.VTFeatures;
      const e = st._eb;
      const k = Math.floor(trk.t / 0.5);
      if (k !== e.k) {
        this._closeEnergy();
        st._eb = { k, dbs: [], sp: 0, n: 0 };
      }
      const cur = st._eb;
      cur.n += 1;
      if (trk.vad.state === "speech") cur.sp += 1;
      if (frame.sounding && F) cur.dbs.push(F.dbfs((frame.rms || 0) / (frame.inputGain || 1)));
    },
    _closeEnergy() {
      const st = this.state;
      const F = global.VTFeatures;
      const e = st._eb;
      if (!e || !e.n || !F) return;
      st.ebins.push({ t: (e.k + 0.5) * 0.5, db: e.dbs.length ? F.percentile(e.dbs, 0.9) : null, sp: e.sp / e.n > 0.4 });
      if (st.ebins.length > 1440) st.ebins.splice(0, st.ebins.length - 1440);
      const dbs = st.ebins.filter((b) => b.sp && b.db != null).map((b) => b.db);
      st.medDb = dbs.length >= 4 ? F.median(dbs) : null;
      e.n = 0;
    },
    _advance(t) {
      const st = this.state;
      if (st.over) return;
      if (st.index + 1 < st.phases.length) {
        st.index += 1;
        st.starts[st.index] = t;
        this.viz?.caption?.(st.phases[st.index].label, 0);
      } else {
        st.over = true;
        st.overAt = t;
        this.viz?.caption?.(L("Tiempo guía cumplido: cierra cuando quieras", "Guide time reached: close when you like"), 0);
        const b = this.$("[data-next-phase]");
        if (b) b.disabled = true;
      }
      this._words();
      this.viz?.draw();
    },
    _mark() {
      const st = this.state;
      if (!st.live || !st.tracker) return;
      const t = st.tracker.t;
      st.marks.push(t);
      if (st.marks.length > 20) st.marks.shift();
      const label = st.phases[st.index].label;
      const V = global.VTViz;
      const at = V && V.scenes.speechShapeUtil ? V.scenes.speechShapeUtil.clock(t) : Math.round(t) + " s";
      const words = L(`Pico marcado en “${label}” (${at})`, `Peak marked in “${label}” (${at})`);
      const el = this.$("[data-peak-st]");
      if (el) el.textContent = words;
      this.viz?.caption?.(words, 0);
      this.viz?.draw();
    },
    _words() {
      const st = this.state;
      const t = st.tracker ? st.tracker.t : 0;
      const ph = st.phases[st.index];
      const label = st.over ? L("Historia completa", "Story complete") : ph.label;
      const remain = st.over ? "✓" : `${Math.max(0, Math.ceil(ph.sec - (t - st.starts[st.index])))}s`;
      const key = label + "|" + remain;
      if (key === st._shown) return;
      st._shown = key;
      const p = this.$("[data-phase]");
      if (p) p.textContent = label;
      const r = this.$("[data-remain]");
      if (r) r.textContent = remain;
    },
    onStart() {
      const st = this.state;
      st.live = true;
      this.hud?.classList.remove("is-replay");
      st.tracker?.reset();
      this._resetStory();
      const b = this.$("[data-next-phase]");
      if (b) b.disabled = false;
      const el = this.$("[data-peak-st]");
      if (el) el.textContent = L("Pico aún no marcado", "Peak not marked yet");
      this._words();
      this.viz?.draw();
    },
    onFrame(frame) {
      const st = this.state;
      if (!st.tracker) return;
      st.tracker.feed(frame || {});
      this._energy(frame || {});
      const t = st.tracker.t;
      if (!st.over && t - st.starts[st.index] >= st.phases[st.index].sec) this._advance(t);
      this._words();
      this.viz?.draw();
    },
    /** The peak against the context: loudness, pace, the pause before; and the ending. */
    _compare() {
      const st = this.state;
      const trk = st.tracker;
      const t = trk.t;
      const F = global.VTFeatures;
      const endOf = (i) => (i + 1 < st.phases.length && st.starts[i + 1] != null ? st.starts[i + 1] : st.over ? st.overAt : t);
      const peakIdx = st.phases.findIndex((p) => p.key === "peak");
      let peak = null;
      let fromMark = false;
      if (st.marks.length) {
        const mk = st.marks[st.marks.length - 1];
        peak = [Math.max(0, mk - 5), Math.min(t, mk + 5)];
        fromMark = true;
      } else if (peakIdx >= 0 && st.starts[peakIdx] != null) {
        peak = [st.starts[peakIdx], endOf(peakIdx)];
      }
      let setup = [0, st.starts[1] != null ? st.starts[1] : t];
      if (trk.talkIn(setup[0], setup[1]) < 3 && st.starts[2] != null) setup = [0, st.starts[2]];
      const c = { peak, setup, fromMark, dDb: null, dRate: null, pauseBefore: null, end: null, endSilence: null };
      if (peak && peak[1] - peak[0] >= 2) {
        const overlap = Math.max(0, Math.min(peak[1], setup[1]) - Math.max(peak[0], setup[0]));
        if (overlap < 0.5 * (peak[1] - peak[0])) {
          const inWin = (a, b) => st.ebins.filter((x) => x.sp && x.db != null && x.t >= a && x.t <= b).map((x) => x.db);
          const dp = inWin(peak[0], peak[1]);
          const ds = inWin(setup[0], setup[1]);
          if (dp.length >= 4 && ds.length >= 4 && F) c.dDb = F.median(dp) - F.median(ds);
          const tp = trk.talkIn(peak[0], peak[1]);
          const ts = trk.talkIn(setup[0], setup[1]);
          const sp = trk.syllIn(peak[0], peak[1]);
          const ss = trk.syllIn(setup[0], setup[1]);
          if (tp >= 2.5 && ts >= 2.5 && sp >= 6 && ss >= 6) c.dRate = sp / tp / (ss / ts) - 1;
        }
        let best = 0;
        trk.vad.segments.forEach((g) => {
          if (g.kind !== "pause" || g.end == null) return;
          const len = g.end - g.start;
          if (g.end >= peak[0] - 3 && g.end <= peak[0] + 1.5 && len > best) best = len;
        });
        if (best >= 0.4) c.pauseBefore = best;
      }
      const last = trk.phrases[trk.phrases.length - 1];
      if (last && last.fin && last.fin.kind !== "short") {
        c.end = last.fin;
        const after = t - last.end;
        c.endSilence = after >= 0.2 ? after : null;
      }
      return c;
    },
    onStop() {
      const st = this.state;
      const V = global.VTViz;
      st.live = false;
      const trk = st.tracker;
      let summary = L("Historia detenida", "Story stopped");
      if (trk) {
        trk.finish();
        this._closeEnergy();
        st.compare = this._compare();
        const c = st.compare;
        const fmt = (v, d) => (V ? V.fmtNum(v, d) : v.toFixed(d));
        const sign = (v) => (v >= 0 ? "+" : "−");
        const parts = [];
        if (c.dDb != null) parts.push(L(`pico ${sign(c.dDb)}${fmt(Math.abs(c.dDb), 1)} dB`, `peak ${sign(c.dDb)}${fmt(Math.abs(c.dDb), 1)} dB`));
        if (c.dRate != null) parts.push(L(`ritmo ${sign(c.dRate)}${fmt(Math.abs(c.dRate) * 100, 0)} %`, `pace ${sign(c.dRate)}${fmt(Math.abs(c.dRate) * 100, 0)} %`));
        if (c.pauseBefore != null) parts.push(L(`pausa antes ${fmt(c.pauseBefore, 1)} s`, `pause before ${fmt(c.pauseBefore, 1)} s`));
        const clock = V && V.scenes.speechShapeUtil ? V.scenes.speechShapeUtil.clock(trk.t) : Math.round(trk.t) + " s";
        summary =
          L(`Historia de ${clock}`, `Story of ${clock}`) +
          (parts.length
            ? " · " + parts.join(" · ") + L(" (aprox., frente al contexto)", " (approx., against the context)")
            : !c.peak
              ? L(" · sin pico que comparar: marca ⚑ o llega a «Pico»", " · no peak to compare: mark ⚑ or reach “Peak”")
              : L(" · poca voz para comparar el pico", " · too little voice to compare the peak"));
      }
      st.review = true;
      if (this.viz) {
        this.hud.classList.add("is-replay");
        this.viz.draw();
      }
      // Peak clarity, structure and impact are the learner's ratings: nothing is filled in
      return { patches: {}, summary };
    }
  });

  /**
   * v19 — land the sentence. When you stop speaking, the end of the sentence
   * is read against the sentence's own middle (↘ cae / → plano / ↗ sube),
   * then a ring fills over the second of silence. No button between speaking
   * and silence: the sound edge (not the grace-bridged `voiced`) ends a claim.
   * "Landed" (measured, approximate) = a fall plus the full pause and no tag.
   * Felt authority and "no tag" stay the learner's ratings.
   */
  Modes.authorityLand = baseMode({
    id: "authorityLand",
    render() {
      const st = this.state;
      st.claims = this.profile.claims || 5;
      st.need = this.profile.landSilenceSec || 1;
      this._resetClaims();
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${L("Cierre con autoridad", "Authority close")}</div>
          <button type="button" class="btn btn-ghost viz-tap" data-again aria-pressed="false" disabled>${L("↺ Otra vez", "↺ Again")}</button>
        </div>
        <div class="viz-words">
          <strong class="mode-big" data-l>0 / ${st.claims}</strong>
          <span data-st>${L("Di la afirmación y guarda silencio ~1 s (sin “¿sabes?”)", "State the claim, then hold ~1 s of silence (no “you know?”)")}</span>
        </div>
        <p class="mode-meta muted">${L(
          "Al callar verás cómo terminó tu frase frente a su propio medio (↘ cae, → plano, ↗ sube) y un anillo para el segundo de silencio. «Otra vez» repite la misma afirmación y deja la anterior a la vista.",
          "When you stop you see how the sentence ended against its own middle (↘ falls, → level, ↗ rises) and a ring for the second of silence. “Again” repeats the same claim and keeps the last one in view."
        )}</p>
      `;
      this.$("[data-again]")?.addEventListener("click", () => this._toggleAgain());
      this._mountViz();
    },
    _resetClaims() {
      const st = this.state;
      st.slots = [];
      st.cur = null;
      st.shown = null;
      st.maybe = null;
      st.last = null;
      st.phase = "idle";
      st.again = false;
      st.review = false;
    },
    _mountViz() {
      const V = global.VTViz;
      const S = V && V.scenes;
      if (!S || !S.ShapeTracker || !S.landingStrip) return;
      this.hud.classList.add("has-viz");
      this.state.tracker = new S.ShapeTracker({
        onSpeech: (t) => this._onSpeech(t),
        onPhrase: (p) => this._onPhrase(p)
      });
      this.viz = new V.Surface(this.hud, (ctx, w, h) => S.landingStrip(ctx, w, h, this.state), {
        label: L(
          "Pista de aterrizaje: una casilla por afirmación; la línea de tono de tu frase y, al callar, una flecha de cómo terminó y un anillo que se llena con un segundo de silencio.",
          "Landing strip: a slot per claim; your sentence's pitch line and, when you stop, an arrow for how it ended and a ring that fills with a second of silence."
        ),
        captionHidden: true
      });
      this.viz.draw();
    },
    _toggleAgain() {
      const st = this.state;
      if (!st.slots.length || st.review) return;
      st.again = !st.again;
      const b = this.$("[data-again]");
      if (b) b.setAttribute("aria-pressed", String(st.again));
      this.viz?.draw();
    },
    _newClaim(start) {
      return { start, end: null, fin: null, pause: 0, tag: false, landed: false, committed: false, bins: null };
    },
    _onSpeech(t) {
      const st = this.state;
      if (st.phase === "idle" || st.phase === "landed") {
        if (st.phase === "landed" && st.last) st.last.pause = Math.max(st.last.pause, t - (st.last.pauseFrom != null ? st.last.pauseFrom : st.last.end));
        st.cur = this._newClaim(t);
        st.shown = st.cur;
        st.phase = "speaking";
        this._status(L("Hablando…", "Speaking…"));
      } else if (st.phase === "landing") {
        // Speech before the pause was complete: a tag, the same claim going
        // on, or the next claim — the next half second decides
        st.maybe = { start: t, gap: t - (st.cur.pauseFrom != null ? st.cur.pauseFrom : st.cur.end) };
        st.phase = "maybeTag";
      }
    },
    _onPhrase(p) {
      const st = this.state;
      if (st.phase === "speaking" && st.cur) {
        st.cur.end = p.end;
        st.cur.fin = p.fin;
        st.phase = "landing";
        this._status(this._endWords(p.fin));
        return;
      }
      if (st.phase === "maybeTag" && st.cur && st.maybe) {
        const mb = st.maybe;
        const len = p.end - mb.start;
        st.maybe = null;
        if (len <= 0.8 && this._rising(p)) {
          st.cur.tag = true;
          st.cur.tagEnd = p.end;
          st.cur.pauseFrom = p.end;
          st.phase = "landing";
          this._status(L("¿Etiqueta al final?", "A tag at the end?"));
          return;
        }
        if (mb.gap < 0.45) {
          // A short breath inside one sentence: it goes on
          st.cur.end = p.end;
          st.cur.fin = p.fin;
          st.cur.pauseFrom = null;
          st.phase = "landing";
          return;
        }
        st.cur.pause = mb.gap;
        this._commit(st.cur);
        st.cur = this._newClaim(mb.start);
        st.cur.end = p.end;
        st.cur.fin = p.fin;
        st.shown = st.cur;
        st.phase = "landing";
      }
    },
    /** A short burst that climbs 2 st or more within itself (¿no?, ¿sabes?). [H] */
    _rising(p) {
      if (p.fin && p.fin.kind === "rise") return true;
      const vb = p.bins.filter((b) => b.m != null);
      if (vb.length < 3 || !p.fin || p.fin.fin == null) return false;
      const first = vb.slice(0, Math.max(1, Math.min(3, vb.length - 1))).map((b) => b.m);
      first.sort((a, b) => a - b);
      return p.fin.fin - first[first.length >> 1] >= 2;
    },
    _tick() {
      const st = this.state;
      const t = st.tracker.t;
      if (st.phase === "landing" && st.cur) {
        const from = st.cur.pauseFrom != null ? st.cur.pauseFrom : st.cur.end;
        st.cur.pause = Math.max(0, t - from);
        if (st.cur.pause >= st.need) {
          this._commit(st.cur);
          st.phase = "landed";
        }
      } else if (st.phase === "landed" && st.last) {
        const c = st.last;
        c.pause = Math.max(c.pause, t - (c.pauseFrom != null ? c.pauseFrom : c.end));
      } else if (st.phase === "maybeTag" && st.maybe && t - st.maybe.start > 0.9) {
        // Too long for a tag
        const mb = st.maybe;
        st.maybe = null;
        if (mb.gap < 0.45) {
          st.cur.end = null;
          st.cur.fin = null;
          st.cur.pauseFrom = null;
        } else {
          st.cur.pause = mb.gap;
          this._commit(st.cur);
          st.cur = this._newClaim(mb.start);
          st.shown = st.cur;
        }
        st.phase = "speaking";
      }
    },
    _commit(att) {
      const st = this.state;
      if (att.committed) return;
      att.committed = true;
      const until = (att.tagEnd || att.end || st.tracker.t) + 0.02;
      att.bins = st.tracker.binsIn(att.start - 0.02, until);
      att.landed = !!(att.fin && att.fin.kind === "fall" && att.pause >= st.need - 1e-6 && !att.tag);
      if (st.again && st.slots.length) {
        st.slots[st.slots.length - 1].attempts.push(att);
        st.again = false;
        this.$("[data-again]")?.setAttribute("aria-pressed", "false");
      } else st.slots.push({ attempts: [att] });
      st.last = att;
      const b = this.$("[data-again]");
      if (b) b.disabled = false;
      const landed = st.slots.filter((s) => s.attempts.some((a) => a.landed)).length;
      const l = this.$("[data-l]");
      if (l) l.textContent = `${landed} / ${st.claims}`;
      const V = global.VTViz;
      const pause = V ? V.fmtNum(Math.min(att.pause, 9.9), 1) : att.pause.toFixed(1);
      const words = `${this._endWords(att.fin)} · ${L("pausa", "pause")} ${pause} s${att.landed ? " ✓" : ""}${
        att.tag ? " · " + L("¿etiqueta?", "tag?") : ""
      }`;
      this._status(words);
      this.viz?.caption?.(words, 0);
    },
    _endWords(fin) {
      const V = global.VTViz;
      const U = V && V.scenes.speechShapeUtil;
      if (!U || !fin) return L("Terminó", "Ended");
      const info = U.endInfo(fin);
      return info.Word + (info.num ? " " + info.num : "");
    },
    _status(text) {
      const el = this.$("[data-st]");
      if (el) el.textContent = text;
    },
    onStart() {
      const st = this.state;
      this.hud?.classList.remove("is-replay");
      st.tracker?.reset();
      this._resetClaims();
      const b = this.$("[data-again]");
      if (b) {
        b.disabled = true;
        b.setAttribute("aria-pressed", "false");
      }
      const l = this.$("[data-l]");
      if (l) l.textContent = `0 / ${st.claims}`;
      this.viz?.draw();
    },
    onFrame(frame) {
      const st = this.state;
      if (!st.tracker) return;
      st.tracker.feed(frame);
      this._tick();
      this.viz?.draw();
    },
    onStop() {
      const st = this.state;
      const trk = st.tracker;
      if (trk) {
        if (st.phase === "maybeTag" && st.maybe && st.cur) {
          // Stop came while speech had resumed: the claim before it keeps the gap it had
          st.cur.pause = st.maybe.gap;
          st.maybe = null;
          this._commit(st.cur);
          st.cur = null;
          st.phase = "idle";
        } else if (st.phase === "speaking") {
          // Cut off mid-sentence by Stop: no ending to read, so no slot
          st.cur = null;
          st.phase = "idle";
        }
        trk.finish();
        if (st.cur && !st.cur.committed && st.cur.fin) this._commit(st.cur);
      }
      st.review = true;
      st.again = false;
      if (this.viz) {
        this.hud.classList.add("is-replay");
        this.viz.draw();
      }
      const n = st.slots.length;
      const landed = st.slots.filter((s) => s.attempts.some((a) => a.landed)).length;
      return {
        // Measured (approximate): a fall plus the full pause. Authority and
        // "no tag" stay with the learner.
        patches: landed > 0 ? { landed } : {},
        summary:
          n > 0
            ? L(
                `${landed} de ${n} ${n === 1 ? "afirmación cayó" : "afirmaciones cayeron"} y sostuvieron el silencio (aprox.)`,
                `${landed} of ${n} ${n === 1 ? "claim" : "claims"} fell and held the silence (approx.)`
              )
            : L("Sin afirmaciones medidas todavía", "No claims measured yet")
      };
    }
  });

  /**
   * v20 — energy triad: the same message low, medium and high, then a lead
   * take a little above your medium. The mic hears three channels of
   * energy — volume (dB against your medium take), pace (syllables per
   * second, approx.) and melody (pitch range in semitones) — and the picture
   * sets one dot per take on each, so what changed and what stayed flat is
   * visible. Face and gesture are not heard: they are in the recording.
   * Flexibility, calibration and authenticity stay the learner's to rate.
   */
  Modes.energyMatch = baseMode({
    id: "energyMatch",
    render() {
      const st = this.state;
      st.takeDefs = [
        {
          key: "low",
          label: L("Baja", "Low"),
          short: L("Baja", "Low"),
          persona: L("1:1 calmado", "tired colleague"),
          instruction: L("Energía baja · para un 1:1 calmado", "Low energy · for a tired colleague")
        },
        {
          key: "med",
          label: L("Media", "Medium"),
          short: L("Media", "Med"),
          persona: L("presentación formal", "formal panel"),
          instruction: L("Energía media · para una presentación formal", "Medium energy · for a formal panel")
        },
        {
          key: "high",
          label: L("Alta", "High"),
          short: L("Alta", "High"),
          persona: L("equipo animado", "excited friend"),
          instruction: L("Energía alta · equipo animado, sin gritar", "High energy · an excited friend, no shouting")
        },
        {
          key: "lead",
          label: L("Guía +10 %", "Lead +10%"),
          short: L("Guía", "Lead"),
          persona: L("tu media, algo más viva", "your medium, a bit brighter"),
          instruction: L("Guía: tu media, un 10 % más viva", "Lead: your medium, 10% brighter")
        }
      ];
      st.stepSec = this.profile.stepSec || 30;
      this._fresh();
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${L("Energía · tres tomas y una guía", "Energy · three takes and a lead")}</div>
          <button type="button" class="btn btn-ghost viz-tap" data-next-take>${L("Siguiente toma →", "Next take →")}</button>
        </div>
        <div class="viz-words">
          <span class="mode-phase" data-phase>${st.takeDefs[0].instruction}</span>
          <strong class="mode-big" data-remain>${st.stepSec}s</strong>
          <span>${L("Ciclos", "Cycles")} <strong data-c>0</strong></span>
          <span data-tip></span>
        </div>
        <p class="mode-meta muted">${L(
          "El mismo mensaje en cada toma · volumen, ritmo y melodía frente a ti mismo · cara y gestos, en la grabación",
          "The same message every take · volume, pace and melody against yourself · face and gesture in the recording"
        )}</p>
      `;
      this.$("[data-next-take]")?.addEventListener("click", () => {
        if (!this.state.review) this._closeTake(true);
      });
      this._mountViz();
    },
    _newCycle() {
      return this.state.takeDefs.map(() => ({ closed: false, done: false, db: null, rate: null, range: null, drop: null, voiced: 0 }));
    },
    _freshTake() {
      const F = global.VTFeatures;
      const st = this.state;
      st.cur = { peaks: [], dbs: [], midis: [], voiced: 0, lastSample: -1, lastMidi: -1 };
      st.syl = F ? new F.SyllableRate({ windowSec: 5 }) : null;
    },
    _fresh() {
      const F = global.VTFeatures;
      const st = this.state;
      st.cycles = [this._newCycle()];
      st.i = 0;
      st.tTake = 0;
      st.completed = 0;
      st.review = false;
      st.processed = false;
      st.clipping = false;
      st.recentPeaks = [];
      st.recentMidi = [];
      st.sessionPeaks = [];
      st.live = { db: null, rate: null, range: null };
      st.liveAt = 0;
      st.pitch = F ? new F.StablePitch() : null;
      this._freshTake();
      this._derive();
    },
    _mountViz() {
      const V = global.VTViz;
      const F = global.VTFeatures;
      const K = global.VTVolumeKit;
      if (!V || !F || !K || !V.scenes.energyTriad) return;
      this.hud.classList.add("has-viz");
      this.state.kit = new K.LevelKit();
      this.viz = new V.Surface(this.hud, (ctx, w, h) => V.scenes.energyTriad(ctx, w, h, this.state), {
        className: "vz-volume",
        label: L(
          "Tres canales de energía por toma: volumen en dB frente a tu toma media, ritmo en sílabas por segundo (aprox.) y rango de melodía en semitonos. Cada toma deja un punto por canal; las líneas muestran qué cambió entre baja, media y alta.",
          "Three channels of energy per take: volume in dB against your medium take, pace in syllables per second (approx.) and melody range in semitones. Each take leaves a dot per channel; the lines show what changed between low, medium and high."
        )
      });
      this.viz.draw();
    },
    /** What the picture reads: this cycle, the last one as ghosts, the reference, the lead's suggestion. */
    _derive() {
      const st = this.state;
      const K = global.VTVolumeKit;
      const cyc = st.cycles[st.cycles.length - 1];
      let prev = st.cycles.length > 1 ? st.cycles[st.cycles.length - 2] : null;
      let main = cyc;
      // After Stop, review whichever of the last two cycles holds more takes
      const doneIn = (c) => c.filter((t) => t.done).length;
      if (st.review && prev && doneIn(prev) > doneIn(cyc)) {
        main = prev;
        prev = st.cycles.length > 2 ? st.cycles[st.cycles.length - 3] : null;
      }
      st.cycle = main;
      st.ghost = prev;
      const medOf = (c) => (c && c[1] && c[1].done ? c[1] : null);
      const med = medOf(main) || medOf(prev);
      let ref = med ? med.db : null;
      let refName = L("tu toma media", "your medium take");
      if (ref == null && main[0] && main[0].done) {
        ref = main[0].db;
        refName = L("tu toma baja", "your low take");
      }
      if (ref == null && K && st.sessionPeaks.length >= 5) {
        ref = K.median(st.sessionPeaks);
        refName = L("tu nivel de hoy", "your level today");
      }
      st.refDb = ref;
      st.refName = refName;
      // "10 % more" is a framing, not a constant: about +1 dB, +10 % pace and range
      st.targets = med
        ? { db: med.db + 1, rate: med.rate != null ? med.rate * 1.1 : null, range: med.range != null ? med.range * 1.1 : null }
        : null;
    },
    _closeTake(advance) {
      const st = this.state;
      const K = global.VTVolumeKit;
      const cyc = st.cycles[st.cycles.length - 1];
      const rec = cyc[st.i];
      const c = st.cur;
      if (rec && !rec.closed) {
        rec.closed = true;
        rec.voiced = c.voiced;
        if (c.voiced >= 3 && K) {
          rec.done = true;
          rec.db = c.peaks.length >= 4 ? K.median(c.peaks.map((p) => p.db)) : K.percentile(c.dbs, 0.75);
          rec.rate = st.syl ? st.syl.overall : null;
          rec.range = c.midis.length >= 45 ? K.percentile(c.midis, 0.9) - K.percentile(c.midis, 0.1) : null;
          const half = st.tTake / 2;
          const a = c.peaks.filter((p) => p.t < half).map((p) => p.db);
          const b = c.peaks.filter((p) => p.t >= half).map((p) => p.db);
          rec.drop = a.length >= 3 && b.length >= 3 ? K.median(b) - K.median(a) : null;
        }
        this._derive();
        const d = st.takeDefs[st.i];
        const words = rec.done
          ? [
              d.label,
              st.refDb != null ? K.fmtDb(rec.db - st.refDb) : "",
              rec.rate != null ? L(`${K.fmtNum(rec.rate, 1)} síl/s`, `${K.fmtNum(rec.rate, 1)} syll/s`) : "",
              rec.range != null ? L(`${Math.round(rec.range)} semitonos`, `${Math.round(rec.range)} semitones`) : ""
            ]
              .filter(Boolean)
              .join(" · ")
          : L(`${d.label}: sin voz suficiente para medir.`, `${d.label}: not enough voice to measure.`);
        this.viz?.caption?.(words, 0);
        if (this.$("[data-tip]")) this.$("[data-tip]").textContent = words;
      }
      if (!advance) return;
      st.i += 1;
      st.tTake = 0;
      this._freshTake();
      if (st.i >= st.takeDefs.length) {
        if (cyc.every((t) => t.done)) st.completed += 1;
        st.cycles.push(this._newCycle());
        if (st.cycles.length > 8) st.cycles.shift();
        st.i = 0;
        if (this.$("[data-c]")) this.$("[data-c]").textContent = String(st.completed);
      }
      this._derive();
      const d = st.takeDefs[st.i];
      if (this.$("[data-phase]")) this.$("[data-phase]").textContent = d.instruction;
      this.viz?.draw();
    },
    onStart() {
      this._fresh();
      this.state.kit?.reset();
      this.hud?.classList.remove("is-replay");
      const b = this.$("[data-next-take]");
      if (b) b.disabled = false;
      if (this.$("[data-c]")) this.$("[data-c]").textContent = "0";
      if (this.$("[data-phase]")) this.$("[data-phase]").textContent = this.state.takeDefs[0].instruction;
      this.viz?.draw();
    },
    onFrame(frame) {
      const st = this.state;
      if (!st.kit || st.review) return;
      const K = global.VTVolumeKit;
      const kit = st.kit;
      const peak = kit.feed(frame);
      const dt = kit.dt;
      const now = performance.now();
      st.tTake += Math.min(0.25, Math.max(0, (now - (st.lastNow || now)) / 1000));
      st.lastNow = now;
      st.processed = kit.processed;
      st.clipping = kit.clipping;
      K.noteProcessed(st, this.viz);
      const manual = !!frame.manualSound;
      if (st.syl && !manual) st.syl.feed(frame);
      const midi = st.pitch && !manual ? st.pitch.feed(frame) : null;
      const c = st.cur;
      if (kit.sounding) {
        c.voiced += dt;
        if (kit.disp != null && kit.t - c.lastSample >= 0.05) {
          c.dbs.push(kit.disp);
          c.lastSample = kit.t;
        }
        if (midi != null && kit.t - c.lastMidi >= 1 / 30) {
          c.midis.push(midi);
          c.lastMidi = kit.t;
          st.recentMidi.push([kit.t, midi]);
        }
      }
      if (peak) {
        c.peaks.push({ t: st.tTake, db: peak.db });
        st.recentPeaks.push([kit.t, peak.db]);
        st.sessionPeaks.push(peak.db);
        if (st.sessionPeaks.length > 600) st.sessionPeaks.shift();
      }
      while (st.recentPeaks.length && st.recentPeaks[0][0] < kit.t - 3) st.recentPeaks.shift();
      while (st.recentMidi.length && st.recentMidi[0][0] < kit.t - 6) st.recentMidi.shift();
      // The live dots move slowly (twice a second): a reading, not a needle
      if (kit.t - st.liveAt >= 0.5) {
        st.liveAt = kit.t;
        const pk = st.recentPeaks.map((p) => p[1]);
        const mi = st.recentMidi.map((p) => p[1]);
        st.live = {
          db: pk.length >= 3 ? K.median(pk) : null,
          rate: st.syl ? st.syl.rate : null,
          range: mi.length >= 30 ? K.percentile(mi, 0.9) - K.percentile(mi, 0.1) : null
        };
        if (st.refDb == null) this._derive();
        const left = Math.max(0, Math.ceil(st.stepSec - st.tTake));
        const r = this.$("[data-remain]");
        if (r && r.textContent !== `${left}s`) r.textContent = `${left}s`;
      }
      if (st.tTake >= st.stepSec) this._closeTake(true);
      this.viz?.draw();
    },
    onStop() {
      const st = this.state;
      const K = global.VTVolumeKit;
      if (st.cur && st.cur.voiced >= 3) this._closeTake(false);
      st.review = true;
      this._derive();
      const b = this.$("[data-next-take]");
      if (b) b.disabled = true;
      if (this.$("[data-phase]")) this.$("[data-phase]").textContent = L("Repaso", "Review");
      if (this.$("[data-remain]")) this.$("[data-remain]").textContent = "—";
      if (this.viz) {
        this.hud.classList.add("is-replay");
        this.viz.draw();
      }
      const cyc = st.cycle || [];
      const done = cyc.map((t, i) => ({ t, d: st.takeDefs[i] })).filter((x) => x.t.done);
      if (!done.length || !K) {
        return { patches: {}, summary: L("Ninguna toma con voz todavía", "No take with voice yet") };
      }
      const vol = done.map((x) => `${x.d.short} ${st.refDb != null ? K.fmtDb(x.t.db - st.refDb) : "—"}`).join(" · ");
      const rates = done.map((x) => (x.t.rate != null ? K.fmtNum(x.t.rate, 1) : "—")).join(" → ");
      const ranges = done.map((x) => (x.t.range != null ? String(Math.round(x.t.range)) : "—")).join(" → ");
      const summary = L(`${vol}; ritmo ${rates} síl/s; melodía ${ranges} semitonos`, `${vol}; pace ${rates} syll/s; melody ${ranges} semitones`);
      K.finalCaption(this.viz, summary);
      // Only measured facts: the ratings (flexibility, calibration, authenticity) stay yours
      return { patches: {}, summary };
    }
  });

  /**
   * v12 — the melody of speech, in semitones against your own usual pitch
   * (not notes on a highway: speech is not a scale). Four takes follow the
   * steps: a flat baseline, an exaggerated one, one with coloured words, a
   * natural final one. Each phrase ends with an arrow for how it landed, and
   * the range of each take (10th–90th percentile, never min–max, which one
   * glitch would set) stands beside the baseline's. Variety, naturalness and
   * engagement stay the learner's own ratings.
   */
  Modes.pitchContour = baseMode({
    id: "pitchContour",
    render() {
      const st = this.state;
      st.takes = [
        {
          name: L("1 · Base plana", "1 · Flat baseline"),
          short: L("1 Base", "1 Base"),
          hint: L("Toma base: léelo plano, sin melodía", "Baseline: read it flat, no melody")
        },
        {
          name: L("2 · Exagerada", "2 · Exaggerated"),
          short: L("2 Exag.", "2 Exag."),
          hint: L("Exagera: sube las palabras clave, cae al final", "Exaggerate: lift the key words, fall at the end")
        },
        {
          name: L("3 · Color", "3 · Colour"),
          short: L("3 Color", "3 Colour"),
          hint: L("Colorea 3 palabras: calidez, sorpresa, resolución", "Colour 3 words: warmth, surprise, resolve")
        },
        {
          name: L("4 · Final natural", "4 · Natural final"),
          short: L("4 Final", "4 Final"),
          hint: L("Natural pero musical: la melodía sigue al sentido", "Natural but musical: the melody follows the meaning")
        }
      ];
      this._resetTakes();
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${L("Melodía al hablar", "Speech melody")}</div>
          <button type="button" class="btn btn-ghost viz-tap" data-next-take>${L("Siguiente toma →", "Next take →")}</button>
        </div>
        <div class="viz-words">
          <span data-d>${L("Empieza con la toma base: plano, sin melodía.", "Start with the baseline take: flat, no melody.")}</span>
          <strong class="mode-big" data-r>— st</strong>
        </div>
        <p class="mode-meta muted">${L(
          "Tu tono en semitonos frente a tu tono habitual, frase a frase, y cómo termina cada frase: ↘ cae, → plano, ↗ sube.",
          "Your pitch in semitones against your usual pitch, phrase by phrase, and how each phrase ends: ↘ falls, → level, ↗ rises."
        )}</p>
      `;
      this.$("[data-next-take]")?.addEventListener("click", () => this._nextTake());
      this._mountViz();
    },
    _resetTakes() {
      const st = this.state;
      st.takes.forEach((t) => {
        t.start = null;
        t.end = null;
        t.vals = [];
        t.p10 = null;
        t.p90 = null;
        t.range = null;
        t.R = 6;
        t._n = 0;
        t._pageFrom = 0;
      });
      st.current = 0;
      st.review = false;
    },
    _mountViz() {
      const V = global.VTViz;
      const S = V && V.scenes;
      if (!S || !S.ShapeTracker || !S.melodyRibbon) return;
      this.hud.classList.add("has-viz");
      this.state.tracker = new S.ShapeTracker({
        onBin: (b) => this._bin(b),
        onPhrase: (p) => this._phrase(p)
      });
      this.viz = new V.Surface(this.hud, (ctx, w, h) => S.melodyRibbon(ctx, w, h, this.state), {
        label: L(
          "Melodía al hablar: tu tono en semitonos frente a tu tono habitual (la línea 0), frase a frase, con una flecha de cómo termina cada frase; a la derecha, el rango de esta toma junto al de la toma base.",
          "Speech melody: your pitch in semitones against your usual pitch (the 0 line), phrase by phrase, with an arrow for how each phrase ends; on the right, this take's range beside the baseline take's."
        ),
        captionHidden: true
      });
      this.viz.draw();
    },
    /** Each voiced 50 ms bin joins the current take's pitch sample. */
    _bin(b) {
      const st = this.state;
      const take = st.takes[st.current];
      if (b.m == null || !take || take.start == null) return;
      take.vals.push(b.m);
      if (take.vals.length > 6000) take.vals.splice(0, 1000);
      take._n += 1;
      if (take._n % 10 === 0 && take.vals.length >= 40) this._stats(take);
    },
    _stats(take) {
      const F = global.VTFeatures;
      const V = global.VTViz;
      if (!F || take.vals.length < 40) return;
      take.p10 = F.percentile(take.vals, 0.1);
      take.p90 = F.percentile(take.vals, 0.9);
      take.range = take.p90 - take.p10;
      const ref = this.state.tracker ? this.state.tracker.ref : null;
      if (ref != null) {
        const lo = F.percentile(take.vals, 0.03) - ref;
        const hi = F.percentile(take.vals, 0.97) - ref;
        take.R = clamp(Math.ceil(Math.max(Math.abs(lo), Math.abs(hi)) + 1), take.R || 6, 14);
      }
      const r = this.$("[data-r]");
      if (r) r.textContent = `${V ? V.fmtNum(take.range, 1) : take.range.toFixed(1)} st`;
    },
    _phrase(p) {
      const st = this.state;
      p.takeIdx = st.current;
      const U = global.VTViz && global.VTViz.scenes.speechShapeUtil;
      if (!U || !p.fin || p.fin.kind === "short") return;
      const info = U.endInfo(p.fin);
      const words = L("Final de frase: ", "Phrase ending: ") + info.word + (info.num ? " " + info.num : "");
      const d = this.$("[data-d]");
      if (d) d.textContent = words;
      this.viz?.caption?.(words);
    },
    _nextTake() {
      const st = this.state;
      const trk = st.tracker;
      if (!trk || st.review) return;
      const t = trk.t;
      const cur = st.takes[st.current];
      if (cur.start == null) cur.start = t;
      cur.end = t;
      this._stats(cur);
      // The flat baseline sets "your usual pitch" for the takes after it
      if (st.current === 0 && cur.vals.length >= 40 && global.VTFeatures) trk.lockRef(global.VTFeatures.median(cur.vals));
      if (st.current < st.takes.length - 1) {
        st.current += 1;
        const nxt = st.takes[st.current];
        nxt.start = t;
        nxt.end = null;
        this.viz?.caption?.(nxt.name, 0);
        const d = this.$("[data-d]");
        if (d) d.textContent = nxt.hint;
      }
      if (st.current >= st.takes.length - 1) {
        const b = this.$("[data-next-take]");
        if (b) b.disabled = true;
      }
      const r = this.$("[data-r]");
      if (r) r.textContent = "— st";
      this.viz?.draw();
    },
    onStart() {
      const st = this.state;
      this.hud?.classList.remove("is-replay");
      st.tracker?.reset();
      this._resetTakes();
      st.takes[0].start = 0;
      const b = this.$("[data-next-take]");
      if (b) b.disabled = false;
      const r = this.$("[data-r]");
      if (r) r.textContent = "— st";
      this.viz?.draw();
    },
    onFrame(frame) {
      const st = this.state;
      if (!st.tracker) return;
      st.tracker.feed(frame);
      this.viz?.draw();
    },
    onStop() {
      const st = this.state;
      const V = global.VTViz;
      const trk = st.tracker;
      if (trk) {
        trk.finish();
        const cur = st.takes[st.current];
        if (cur.start != null && cur.end == null) cur.end = trk.t;
        this._stats(cur);
      }
      st.review = true;
      if (this.viz) {
        this.hud.classList.add("is-replay");
        this.viz.draw();
      }
      const fmt = (v) => (V ? V.fmtNum(v, 1) : v.toFixed(1));
      const done = st.takes.filter((t) => t.range != null);
      const falls = trk ? trk.phrases.filter((p) => p.fin && p.fin.kind === "fall").length : 0;
      const ends = trk ? trk.phrases.filter((p) => p.fin && ["fall", "rise", "level"].includes(p.fin.kind)).length : 0;
      const summary = done.length
        ? L("Rango aprox.: ", "Range approx.: ") +
          done.map((t) => `${t.short} ${fmt(t.range)} st`).join(" → ") +
          (ends ? L(` · ${falls} de ${ends} finales caen`, ` · ${falls} of ${ends} endings fall`) : "")
        : L("Poca voz con tono para medir la melodía", "Too little voiced speech to measure the melody");
      // Variety, naturalness and engagement are the learner's ratings: nothing is filled in
      return { patches: {}, summary };
    }
  });
  // ——— SINGING ———

  /*
   * The pitch family (s1 s2 s3 s5 s7 s9 s10 s13 s16). The note highway is the
   * picture: each mode paints on it through its overlay hook, with the
   * painters in js/scenes/pitch.js, and keeps its panel under the stage a
   * compact summary, because that panel is often below the fold while the
   * highway is in the first screen. Measured from the mic: pitch (from the raw
   * detector frame, so a breath is a gap), level against your own median, and
   * time. Nothing here rates ease, support or placement.
   */

  function pzKit() {
    return (global.VTViz && global.VTViz.scenes && global.VTViz.scenes.pitchKit) || null;
  }
  function pzHighway() {
    try {
      return typeof global.VTGetPitchViz === "function" ? global.VTGetPitchViz() : null;
    } catch {
      return null;
    }
  }
  /** n with the singular or plural word */
  function pzPl(n, one, many) {
    return `${n} ${n === 1 ? one : many}`;
  }
  function pzSec(s) {
    return global.VTViz?.fmtSec ? global.VTViz.fmtSec(s) : `${Number(s || 0).toFixed(1)} s`;
  }
  function pzMedian(a) {
    if (!a || !a.length) return null;
    const s = a.slice().sort((x, y) => x - y);
    const k = Math.floor(s.length / 2);
    return s.length % 2 ? s[k] : (s[k - 1] + s[k]) / 2;
  }
  function pzHz(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  /** "C#3" for the piano and VT_NOTE_FREQ. */
  function pzKey(midi) {
    return global.VTPitchUtils ? global.VTPitchUtils.midiToName(midi) : null;
  }
  function pzLevel() {
    const RL = global.VTFeatures && global.VTFeatures.RelativeLevel;
    return RL ? new RL() : null;
  }

  /** Paint this mode's picture on the highway while it is live, and its review after Stop. */
  function pzOverlay(mode, painter, display) {
    const pv = pzHighway();
    const paint = global.VTViz?.scenes?.[painter];
    if (!pv || typeof pv.setOverlay !== "function" || typeof paint !== "function") return null;
    pv.setOverlay((ctx, geo, layer) => {
      if (mode.state && mode.state.viz) paint(ctx, geo, layer, mode.state.viz);
    }, display);
    mode._ownsOverlay = true;
    return pv;
  }

  /**
   * Before Start: what the exercise will ask, drawn on the empty highway. The
   * app resets the highway's lanes right after mounting the mode, so this
   * waits for that to finish.
   */
  function pzIdle(mode, paint, display) {
    Promise.resolve().then(() => {
      const pv = pzHighway();
      if (!pv || pv.running || !mode.hud || typeof pv.setIdle !== "function") return;
      if (display && pv.setDisplay) pv.setDisplay(display);
      pv.setIdle(paint);
      try {
        pv.redrawIdle?.();
      } catch {
        /* ignore */
      }
    });
  }

  /** A reference note on the piano, unless the learner turned Auto piano off. */
  function pzPlay(midi, sec) {
    const P = global.VTPiano;
    const name = pzKey(midi);
    if (!name || !P || typeof P.playRefPitch !== "function") return;
    const auto = document.getElementById("chk-auto-piano");
    if (auto && auto.checked === false) return;
    try {
      const p = P.playRefPitch(name, sec || 1.8, true);
      if (p && p.catch) p.catch(() => {});
    } catch {
      /* the piano is optional */
    }
  }

  /**
   * Point the practice engine and the highway at the note this mode waits for.
   * The app's chord loop and its octave re-lock also set a target, so modes
   * call this every frame and it only writes when something moved it.
   */
  function pzTarget(midi, frame, name) {
    if (!Number.isFinite(midi) || typeof global.VTSetPracticeTarget !== "function") return;
    const f = pzHz(midi);
    const pv = pzHighway();
    const off = (x) => !x || Math.abs(1200 * Math.log2(x / f)) > 3;
    if (!frame || off(frame.targetFreq) || off(pv && pv.targetFreq)) global.VTSetPracticeTarget(f, name);
  }

  /**
   * Free singing (a siren, fry → /A/) has no note to reach. The engine target
   * follows your voice instead, so the auto-octave adapter, which moves the
   * material when you plateau far from the target, has nothing to chase.
   */
  function pzFollowVoice(st, frame, now) {
    if (!frame.voiceFreq || now - (st.followAt || 0) < 250) return;
    st.followAt = now;
    pzTarget(69 + 12 * Math.log2(frame.voiceFreq / 440), frame);
  }

  /**
   * The app starts an exercise's chord loop on Start when the exercise lists
   * progressions. A mode that plays its own notes (a scale, hum targets) stops
   * that loop in the first seconds of a take and after an octave change, then
   * sounds its own reference. A loop the learner starts later stays theirs.
   */
  function pzOwnSound(st, replay) {
    if (performance.now() > (st.ownSoundUntil || 0)) return;
    const P = global.VTPiano;
    if (P && P.loopActive) {
      try {
        P.stopAll();
      } catch {
        /* ignore */
      }
      replay();
    }
  }

  /** Scale 1–5 from a measured spread in cents (small is better). */
  function pzScale(c, cuts) {
    if (!Number.isFinite(c)) return null;
    return c <= cuts[0] ? 5 : c <= cuts[1] ? 4 : c <= cuts[2] ? 3 : 2;
  }

  /* —— Stepping stones: a scale on three roots (s10, s16), hum targets (s7) —— */

  const DEGREE = { 0: "1", 2: "2", 4: "3", 5: "4", 7: "5", 9: "6", 11: "7", 12: "8" };

  const pzStones = {
    /** The notes of the current pass, shifted to the learner's octave. */
    seq(st) {
      const kit = st.kit;
      const sh = 12 * st.shift;
      if (st.cfg.kind === "hum") {
        return st.cfg.notes.map((m) => ({ midi: m + sh, label: kit.noteName(m + sh), short: kit.noteName(m + sh) }));
      }
      const root = st.cfg.roots[st.rootIdx % st.cfg.roots.length] + sh;
      return st.cfg.pattern.map((s) => {
        const d = DEGREE[s] || String(s);
        return { midi: root + s, label: `${d} ${kit.noteName(root + s)}`, short: d };
      });
    },
    /** Every note the take can ask for: the Y window stays still across roots. */
    span(st) {
      const sh = 12 * st.shift;
      const all =
        st.cfg.kind === "hum"
          ? st.cfg.notes.map((m) => m + sh)
          : st.cfg.roots.flatMap((r) => st.cfg.pattern.map((s) => r + s + sh));
      return { min: Math.min(...all), max: Math.max(...all) };
    },
    display(st) {
      const sp = pzStones.span(st);
      const seen = new Set();
      const lanes = [];
      pzStones.seq(st).forEach((n) => {
        if (seen.has(n.midi)) return;
        seen.add(n.midi);
        lanes.push({ midi: n.midi });
      });
      return {
        range: { min: sp.min, max: sp.max, pad: 1.5, minSpan: 10 },
        lanes
      };
    },
    idle(mode, cfg) {
      const kit = pzKit();
      if (!kit) return;
      const st = { cfg, kit, shift: kit.octaveShift(), rootIdx: 0 };
      const seq = pzStones.seq(st);
      const sp = pzStones.span(st);
      const title =
        cfg.kind === "hum"
          ? L("Tararea 10 notas suaves", "Hum 10 soft notes")
          : L(`Escala en ${kit.noteName(seq[0].midi)}, luego sube de raíz`, `Scale on ${kit.noteName(seq[0].midi)}, then the root moves up`);
      const line =
        cfg.kind === "hum"
          ? L(`Cada nota cuenta al sostenerla ${pzSec(cfg.holdMs / 1000)} cerca del centro`, `Each note counts once held ${pzSec(cfg.holdMs / 1000)} near the centre`)
          : L("Escucha el paso, cántalo y sostenlo: el siguiente espera a la derecha", "Hear the step, sing it and hold it: the next one waits to the right");
      pzIdle(mode, kit.idleCard(title, [line], kit.idleStones(seq.map((n) => ({ midi: n.midi, label: n.label, short: n.short })))), {
        range: { min: sp.min - 1, max: sp.max + 7, pad: 0, minSpan: 12 },
        lanes: pzStones.display(st).lanes,
        primaryLane: false,
        chordLanes: false,
        chordBadge: false
      });
    },
    start(mode, cfg) {
      const kit = pzKit();
      const st = mode.state;
      if (!kit) return;
      const now = performance.now();
      Object.assign(st, {
        cfg,
        kit,
        shift: kit.octaveShift(),
        rootIdx: 0,
        i: 0,
        passes: 0,
        locked: 0,
        results: [],
        level: pzLevel(),
        gate: new kit.NoteGate({ tol: cfg.tol, holdMs: cfg.holdMs, blankMs: 300, fold: true }),
        trace: new kit.Trace(8),
        ownSoundUntil: now + 4000,
        doneUntil: 0,
        softUntil: 0,
        lastPanel: 0
      });
      st.viz = {
        trace: st.trace,
        steps: [],
        i: 0,
        frac: 0,
        dir: null,
        head: "",
        right: "",
        headColor: null,
        marks: [],
        review: false,
        reviewTitle: "",
        reviewRows: [],
        levels: []
      };
      pzOverlay(
        mode,
        "pitchStones",
        Object.assign(
          {
            game: false,
            gameFlash: false,
            trail: "none",
            band: false,
            targetTrail: false,
            chordLanes: false,
            chordBadge: false,
            laneCents: cfg.tol,
            pastSec: 6,
            nowAt: 0.6,
            keepOnStop: true,
            headPx: kit.headPx("chips")
          },
          pzStones.display(st)
        )
      );
      pzStones.step(mode, false);
    },
    /** Aim at step i: the gate, the engine target, the queue ahead, the chips. */
    step(mode, play) {
      const st = mode.state;
      const seq = pzStones.seq(st);
      const cur = seq[st.i];
      st.gate.setTarget(cur.midi, { blankMs: play ? 300 : 0 });
      st.wantMidi = cur.midi;
      // The app sounds this note on Start for a mode that owns its target
      st.wantName = pzKey(cur.midi - 12 * st.shift);
      st.wantFreq = pzHz(cur.midi);
      pzTarget(cur.midi, null, st.kit.noteDual(cur.midi));
      const pv = pzHighway();
      if (pv && pv.setNoteQueue) pv.setNoteQueue(seq.slice(st.i).map((n) => ({ midi: n.midi, label: n.label, short: n.short })));
      if (play) pzPlay(cur.midi, st.cfg.refSec);
      st.viz.steps = seq.map((n, k) => ({ label: n.label, short: n.short, done: k < st.i }));
      st.viz.i = st.i;
    },
    frame(mode, frame) {
      const st = mode.state;
      if (!st.viz || !st.kit) return;
      const kit = st.kit;
      const now = performance.now();
      const pv = pzHighway();
      // The learner's octave moved (auto range or the ± buttons): same step, new pitch
      const sh = kit.octaveShift();
      if (sh !== st.shift) {
        st.shift = sh;
        if (pv && pv.setDisplay) pv.setDisplay(pzStones.display(st));
        pzStones.step(mode, false);
        st.ownSoundUntil = now + 4000;
      }
      pzOwnSound(st, () => pzPlay(st.wantMidi, st.cfg.refSec));
      const rel = st.level ? st.level.feed(frame) : null;
      const f = frame.rawFreq;
      st.trace.push(now, f && frame.sounding !== false ? kit.hzToMidi(f) : null, rel, 0);
      const seq = pzStones.seq(st);
      const cur = seq[st.i];
      pzTarget(cur.midi, frame, kit.noteDual(cur.midi));
      const locked = st.gate.feed(frame, rel);
      if (pv && pv.setQueueProgress) pv.setQueueProgress(st.gate.frac);
      st.viz.frac = st.gate.frac;
      st.viz.dir = st.gate.direction();
      if (st.cfg.kind === "hum" && rel != null && rel > 6 && st.gate.cents != null) st.softUntil = now + 1800;
      if (locked) {
        const res = st.gate.result();
        st.results.push(Object.assign({ short: cur.short, label: cur.label, root: st.rootIdx }, res));
        st.viz.marks.push({ t: now, m: cur.midi, res });
        if (st.viz.marks.length > 40) st.viz.marks.shift();
        st.locked++;
        st.i++;
        if (st.i >= seq.length) {
          st.passes++;
          st.doneName = st.cfg.kind === "hum" ? "" : kit.noteName(seq[0].midi);
          st.doneUntil = now + 2600;
          st.i = 0;
          st.rootIdx++;
          if (st.cfg.kind !== "hum" && pv && pv.setDisplay) pv.setDisplay(pzStones.display(st));
        }
        pzStones.step(mode, true);
        st.lastPanel = 0;
      }
      pzStones.words(mode, now);
      if (now - st.lastPanel > 150) {
        st.lastPanel = now;
        pzStones.panel(mode);
      }
    },
    words(mode, now) {
      const st = mode.state;
      const kit = st.kit;
      const v = st.viz;
      const seq = pzStones.seq(st);
      const cur = seq[st.i];
      v.headColor = null;
      if (st.cfg.kind === "hum") {
        v.head = L(`Tararea ${kit.noteName(cur.midi)} · ${st.i + 1}/${seq.length}`, `Hum ${kit.noteName(cur.midi)} · ${st.i + 1}/${seq.length}`);
        v.right = L(`sostenidas ${st.locked}`, `held ${st.locked}`);
        if (now < st.doneUntil) {
          v.head = L(`✓ Ronda ${st.passes} completa`, `✓ Round ${st.passes} complete`);
          v.headColor = global.VTViz?.C?.done;
        }
        if (now < st.softUntil) v.right = L("más suave: sin empujar", "softer: no pushing");
      } else {
        const root = kit.noteName(seq[0].midi);
        v.head = L(`Paso ${st.i + 1}/${seq.length} · canta ${kit.noteName(cur.midi)}`, `Step ${st.i + 1}/${seq.length} · sing ${kit.noteName(cur.midi)}`);
        v.right = L(`raíz ${root} · ${st.passes} hechas`, `root ${root} · ${st.passes} done`);
        if (now < st.doneUntil) {
          v.head = L(`✓ Raíz ${st.doneName} completa · ahora ${root}`, `✓ Root ${st.doneName} complete · now ${root}`);
          v.headColor = global.VTViz?.C?.done;
        }
      }
    },
    panel(mode) {
      const st = mode.state;
      const seq = pzStones.seq(st);
      const set = (sel, t) => {
        const e = mode.$(sel);
        if (e && e.textContent !== t) e.textContent = t;
      };
      if (st.cfg.kind === "hum") {
        set("[data-n]", L(`Objetivo: ${st.kit.noteName(seq[st.i].midi)}`, `Target: ${st.kit.noteName(seq[st.i].midi)}`));
        set("[data-l]", `${st.locked} / ${seq.length}`);
      } else {
        set("[data-step]", `${L("Paso", "Step")} ${st.i + 1} / ${seq.length}`);
        set("[data-r]", String(st.passes));
        set("[data-k]", String(st.locked));
      }
    },
    stop(mode) {
      const st = mode.state;
      if (!st.viz || !st.kit) return { patches: {}, summary: "" };
      const kit = st.kit;
      const pv = pzHighway();
      if (pv && pv.setNoteQueue) pv.setNoteQueue(null);
      const res = st.results.filter((r) => r.cents != null);
      const abs = res.map((r) => Math.abs(r.cents));
      const medAbs = abs.length ? Math.round(pzMedian(abs)) : null;
      const medSigned = res.length ? pzMedian(res.map((r) => r.cents)) : null;
      const rows = [];
      const hum = st.cfg.kind === "hum";
      rows.push(
        hum
          ? L(`Notas sostenidas: ${st.locked} · rondas completas: ${st.passes}`, `Notes held: ${st.locked} · full rounds: ${st.passes}`)
          : L(`Raíces completas: ${st.passes} · notas fijadas: ${st.locked}`, `Roots complete: ${st.passes} · notes locked: ${st.locked}`)
      );
      if (res.length >= 3) {
        const lean =
          Math.abs(medSigned) >= 8
            ? L(` · tiendes a quedar ${medSigned > 0 ? "alto" : "bajo"} (${kit.fmtCents(medSigned)})`, ` · you lean ${medSigned > 0 ? "sharp" : "flat"} (${kit.fmtCents(medSigned)})`)
            : "";
        rows.push(L(`A ${medAbs}¢ del centro, en mediana (aprox.)${lean}`, `${medAbs}¢ from the centre, median (approx.)${lean}`));
        if (!hum) {
          const by = {};
          res.forEach((r) => (by[r.short] = by[r.short] || []).push(r.cents));
          const far = Object.keys(by)
            .map((d) => ({ d, c: pzMedian(by[d]) }))
            .filter((x) => Math.abs(x.c) >= 15)
            .sort((a, b) => Math.abs(b.c) - Math.abs(a.c))
            .slice(0, 2);
          rows.push(
            far.length
              ? L(`Más lejos: ${far.map((x) => `grado ${x.d} (${kit.fmtCents(x.c)})`).join(", ")}`, `Furthest: ${far.map((x) => `degree ${x.d} (${kit.fmtCents(x.c)})`).join(", ")}`)
              : L("Todos los grados quedaron cerca del centro", "Every degree stayed close to the centre")
          );
        }
        const settle = pzMedian(st.results.map((r) => r.settleMs).filter(Number.isFinite));
        if (settle != null) rows.push(L(`Llegas a cada nota en ~${pzSec(settle / 1000)}`, `You reach each note in ~${pzSec(settle / 1000)}`));
      } else if (!st.locked) {
        rows.push(
          L(
            `Una nota cuenta al sostenerla ${pzSec(st.cfg.holdMs / 1000)} dentro de ±${st.cfg.tol}¢ (una octava arriba también vale)`,
            `A note counts once held ${pzSec(st.cfg.holdMs / 1000)} within ±${st.cfg.tol}¢ (an octave up counts too)`
          )
        );
      }
      const last = st.results.slice(-Math.min(15, pzStones.seq(st).length));
      st.viz.levels = last.filter((r) => Number.isFinite(r.level)).length >= 3 ? last.map((r) => ({ label: r.short, db: r.level })) : [];
      st.viz.head = hum
        ? L(pzPl(st.locked, "nota sostenida", "notas sostenidas"), pzPl(st.locked, "note held", "notes held"))
        : L(`${pzPl(st.passes, "raíz completa", "raíces completas")} · ${pzPl(st.locked, "nota", "notas")}`, `${pzPl(st.passes, "root", "roots")} complete · ${pzPl(st.locked, "note", "notes")}`);
      st.viz.headColor = null;
      st.viz.right = "";
      st.viz.dir = null;
      st.viz.reviewTitle = hum ? L("Tus tarareos", "Your hums") : L("Tu escala", "Your scale");
      st.viz.reviewRows = rows;
      st.viz.steps = st.viz.steps.map((s) => Object.assign({}, s));
      st.viz.review = true;
      const patches = {};
      if (hum) {
        if (st.locked > 0) patches.targets = st.locked;
      } else {
        if (st.passes > 0) patches.roots = st.passes;
        if (st.cfg.intonation && abs.length >= 5) patches.intonation = pzScale(medAbs, [10, 18, 28]);
      }
      const off = medAbs != null ? L(` · a ${medAbs}¢ del centro (aprox.)`, ` · ${medAbs}¢ from centre (approx.)`) : "";
      const summary = hum
        ? L(`${pzPl(st.locked, "nota tarareada", "notas tarareadas")} · ${pzPl(st.passes, "ronda", "rondas")}${off}`, `${pzPl(st.locked, "note", "notes")} hummed · ${pzPl(st.passes, "round", "rounds")}${off}`)
        : L(`${pzPl(st.passes, "raíz completa", "raíces completas")} · ${pzPl(st.locked, "nota fijada", "notas fijadas")}${off}`, `${pzPl(st.passes, "root", "roots")} complete · ${pzPl(st.locked, "note", "notes")} locked${off}`);
      return { patches, summary };
    }
  };

  /** s1 — fry that clears into /A/: creak on its own floor lane, clear tone at its pitch. */
  Modes.pitchHold = baseMode({
    id: "pitchHold",
    render() {
      const fry = this.profile.fryPhase !== false && this.profile.modeCue !== "hum";
      this.state.phase = fry ? "fry" : "clear";
      this.state.best = 0;
      this.hud.classList.add("pz");
      this.hud.innerHTML = `
        <div class="mode-title">${fry ? L("Fry → /A/ clara sostenida", "Fry → clear /A/ hold") : L("Sostén y mantén", "Sustain & hold")}</div>
        <div class="mode-phase" data-phase>${fry ? L("Paso 1 · fry suave (buscador)", "Step 1 · gentle fry (finder)") : L("Sostén", "Sustain")}</div>
        <div class="mode-big" data-h>${pzSec(0)}</div>
        <p class="mode-meta">${L("Mejor /A/ clara:", "Best clear /A/:")} <strong data-best>${pzSec(0)}</strong> · ${L("sostenidos de 2 s:", "2 s holds:")} <strong data-n>0</strong></p>
        ${
          fry
            ? `<div class="pz-row"><button type="button" class="btn btn-sm btn-singing" data-clear>${L("Pasar a /A/ clara", "Move to clear /A/")}</button></div>`
            : ""
        }
        <p class="mode-meta muted">${L("Clara = tono estable, medido. El fry no tiene tono estable: se ve como puntos abajo. No es un juego de notas.", "Clear = a steady tone, measured. Fry has no steady pitch: it shows as dots at the bottom. Not a note-challenge game.")}</p>
      `;
      this.$("[data-clear]")?.addEventListener("click", () => this._setPhase("clear"));
      const kit = pzKit();
      if (kit) {
        pzIdle(
          this,
          kit.idleCard(L("Fry suave → /A/ clara", "Gentle fry → clear /A/"), [
            L("Empieza en fry y deja que se aclare en /A/", "Start in fry and let it clear into /A/"),
            L("Verás cuándo el tono se vuelve estable y cuánto dura", "You will see when the tone turns steady and how long it lasts")
          ]),
          { primaryLane: false, chordBadge: false }
        );
      }
    },
    _setPhase(p) {
      this.state.phase = p;
      if (this.state.viz) this.state.viz.phase = p;
      const el = this.$("[data-phase]");
      if (el) el.textContent = p === "fry" ? L("Paso 1 · fry suave (buscador)", "Step 1 · gentle fry (finder)") : L("Paso 2 · /A/ clara sostenida", "Step 2 · clear /A/ hold");
    },
    _range(center) {
      const st = this.state;
      st.range = { min: center - 9, max: center + 9 };
      st.viz.fryM = st.range.min + 1.5;
      const pv = pzHighway();
      if (pv && pv.setDisplay) pv.setDisplay({ range: { min: st.range.min, max: st.range.max, pad: 0, minSpan: 14 } });
    },
    onStart() {
      const kit = pzKit();
      if (!kit) return;
      const st = this.state;
      const ref = kit.nameToMidi(this.profile.refPitch || "A2") || 45;
      Object.assign(st, {
        kit,
        trace: new kit.Trace(10),
        level: pzLevel(),
        hist: [],
        cur: null,
        run: 0,
        nonClear: 0,
        clearMs: [],
        logs: 0,
        loudUntil: 0,
        lastPanel: 0,
        lastComfort: 0
      });
      st.viz = {
        trace: st.trace,
        phase: st.phase,
        cur: null,
        holds: [],
        best: 0,
        bestHold: null,
        comfort: null,
        fryM: 0,
        clearMarks: [],
        loud: false,
        review: false
      };
      pzOverlay(this, "pitchHold", {
        game: false,
        gameFlash: false,
        trail: "none",
        primaryLane: false,
        chordLanes: false,
        ghostLanes: false,
        band: false,
        targetTrail: false,
        chordBadge: false,
        keyboardTarget: false,
        stats: "nearest",
        pastSec: 10,
        nowAt: 0.8,
        keepOnStop: true,
        headPx: kit.headPx("hold")
      });
      this._range(ref + 12 * kit.octaveShift() + 1);
    },
    onFrame(frame) {
      const st = this.state;
      if (!st.viz || !st.kit) return;
      const kit = st.kit;
      const now = performance.now();
      const dt = clamp(frame.dtMs || 16, 0, 100);
      const rel = st.level ? st.level.feed(frame) : null;
      const f = frame.rawFreq;
      const snd = !!frame.sounding;
      let kind = null;
      let m = null;
      if (snd) {
        if (!f || f < 72) kind = "creak";
        else {
          m = kit.hzToMidi(f);
          st.hist.push(m);
          if (st.hist.length > 5) st.hist.shift();
          kind = st.hist.length >= 3 && Math.abs(m - pzMedian(st.hist)) > 0.7 ? "creak" : "clear";
        }
      } else st.hist.length = 0;
      st.trace.push(now, kind === "clear" ? m : null, rel, kind === "creak" ? 2 : 0);
      pzFollowVoice(st, frame, now);

      if (snd) {
        if (!st.cur) st.cur = { t0: now, total: 0, creakSec: 0, clearSec: 0, bestClear: 0, hadCreak: false, marked: false, last: now };
        const c = st.cur;
        c.total += dt;
        c.last = now;
        if (kind === "creak") {
          c.creakSec += dt / 1000;
          c.hadCreak = true;
          st.nonClear += dt;
          if (st.nonClear > 120) st.run = 0;
        } else {
          st.nonClear = 0;
          st.run += dt;
          st.clearMs.push(m);
          if (st.clearMs.length > 900) st.clearMs.shift();
          if (!c.marked && c.hadCreak && st.run >= 300) {
            c.marked = true;
            st.viz.clearMarks.push({ t: now - 300, m });
          }
          if (rel != null && rel > 8) st.loudUntil = now + 2000;
        }
        c.clearSec = st.run / 1000;
        c.bestClear = Math.max(c.bestClear, c.clearSec);
        if (st.phase === "fry" && st.run >= 1000) this._setPhase("clear");
      } else if (st.cur && now - st.cur.last > 250) this._endHold();
      st.viz.cur = st.cur ? { clearSec: st.cur.clearSec, creakSec: st.cur.creakSec } : null;
      st.viz.loud = now < st.loudUntil;
      // Your comfortable pitch: the middle of your clear tone so far (shown, never scored)
      if (st.clearMs.length >= 90 && now - st.lastComfort > 500) {
        st.lastComfort = now;
        const cm = pzMedian(st.clearMs);
        st.viz.comfort = cm;
        if (cm < st.range.min + 4 || cm > st.range.max - 3) this._range(cm + 1);
      }
      if (now - st.lastPanel > 120) {
        st.lastPanel = now;
        const shown = st.cur ? st.cur.clearSec : st.lastClear || 0;
        const h = this.$("[data-h]");
        if (h) h.textContent = pzSec(shown);
        const b = this.$("[data-best]");
        if (b) b.textContent = pzSec(st.viz.best);
        const n = this.$("[data-n]");
        if (n) n.textContent = String(st.logs);
      }
    },
    _endHold() {
      const st = this.state;
      const c = st.cur;
      st.cur = null;
      st.run = 0;
      st.nonClear = 0;
      if (!c) return;
      const hold = { total: c.total / 1000, creak: c.creakSec, clear: c.bestClear, best: false };
      st.lastClear = c.bestClear;
      if (hold.total < 0.5) return;
      st.viz.holds.push(hold);
      if (hold.clear >= 2) st.logs++;
      if (hold.clear > st.viz.best) {
        st.viz.best = hold.clear;
        st.viz.bestHold = hold;
      }
    },
    onStop() {
      const st = this.state;
      if (!st.viz) return { patches: {}, summary: "" };
      if (st.cur) this._endHold();
      st.viz.cur = null;
      const holds = st.viz.holds;
      const rows = [];
      if (holds.length) {
        rows.push(
          L(
            `Mejor /A/ clara: ${pzSec(st.viz.best)} · ${st.logs} de ${holds.length} ${holds.length === 1 ? "sostenido" : "sostenidos"} ${st.logs === 1 ? "llegó" : "llegaron"} a 2 s claros`,
            `Best clear /A/: ${pzSec(st.viz.best)} · ${st.logs} of ${holds.length} holds reached 2 s clear`
          )
        );
        const fry = holds.filter((h) => h.creak > 0.2 && h.clear > 0.3).map((h) => h.creak);
        if (fry.length) rows.push(L(`El fry duró ~${pzSec(pzMedian(fry))} antes de aclararse`, `The fry lasted ~${pzSec(pzMedian(fry))} before it cleared`));
        if (st.viz.comfort != null) rows.push(L(`Tu /A/ clara quedó cerca de ${st.kit.noteName(st.viz.comfort)} (aprox.)`, `Your clear /A/ sat near ${st.kit.noteName(st.viz.comfort)} (approx.)`));
      }
      st.viz.reviewRows = rows;
      st.viz.review = true;
      const best = Math.round((st.viz.best || 0) * 10) / 10;
      const patches = {};
      if (best > 0) patches.maxHold = best;
      return {
        patches,
        summary: L(
          `Mejor /A/ clara: ${pzSec(best)} · ${st.logs} ${st.logs === 1 ? "sostenido" : "sostenidos"} de 2 s o más`,
          `Best clear /A/: ${pzSec(best)} · ${st.logs} ${st.logs === 1 ? "hold" : "holds"} of 2 s or more`
        )
      };
    }
  });

  /* —— Chord tones with the path ahead (s2 landing, s13 arpeggio stones) —— */

  const pzChord = {
    /** The progression the piano plays, as the events it will fire (from the app's own settings). */
    sched(st) {
      const app = (global.VTApp && global.VTApp.getState && global.VTApp.getState()) || {};
      const id = app.selectedProg || "prog1";
      const base = (global.VT_PROGRESSIONS || {})[id];
      if (!base) return null;
      const shift = st.kit.octaveShift();
      const prog = typeof global.VTTransposeProgression === "function" ? global.VTTransposeProgression(base, shift) : base;
      const one = !!document.getElementById("chk-one-note")?.checked;
      const arp = !!document.getElementById("chk-arpeggio")?.checked;
      const sus = document.getElementById("chk-sustain")?.checked !== false;
      const sec = Number(document.getElementById("sustain-sec")?.value || 4);
      const stepMs = (one || sus ? clamp(sec, 1.5, 5.5) : 2.2) * 1000;
      const perChord = st.stones || !one;
      const flat = [];
      prog.chords.forEach((ch, ci) => {
        if (perChord) flat.push({ ci, dur: one ? ch.notes.length * Math.max(550, stepMs) : stepMs });
        else ch.notes.forEach((n) => flat.push({ ci, note: n, dur: Math.max(550, stepMs) }));
      });
      return { key: [id, shift, one, arp, stepMs, !!st.stones].join("|"), id, shift, prog, one, arp, flat };
    },
    /** Bass notes an octave up: sing the chord where your voice is. */
    fold(st, midi) {
      const low = 45 + 12 * st.kit.octaveShift();
      let m = midi;
      while (m < low) m += 12;
      return m;
    },
    targets(st, s, e) {
      const kit = st.kit;
      const ch = s.prog.chords[e.ci];
      if (st.stones) {
        const mm = /^([A-G])([#b]?)(m(?!aj))?/.exec(ch.name || "") || [];
        const pc = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[mm[1]] ?? 0;
        const acc = mm[2] === "#" ? 1 : mm[2] === "b" ? -1 : 0;
        const sh = 12 * kit.octaveShift();
        let root = 36 + ((pc + acc + 12) % 12) + sh;
        while (root < 43 + sh) root += 12;
        const third = mm[3] ? 3 : 4;
        return [
          { deg: "1", midi: root },
          { deg: "3", midi: root + third },
          { deg: "5", midi: root + 7 },
          { deg: "8", midi: root + 12 }
        ].map((x) => ({ deg: x.deg, midi: x.midi, label: `${x.deg} ${kit.noteName(x.midi)}` }));
      }
      const names = e.note ? [e.note] : ch.notes;
      const seen = new Set();
      const out = [];
      names.forEach((n) => {
        const f = (global.VT_NOTE_FREQ || {})[n];
        if (!f) return;
        const m = Math.round(pzChord.fold(st, kit.hzToMidi(f)));
        if (seen.has(m)) return;
        seen.add(m);
        out.push({ midi: m, label: kit.noteName(m) });
      });
      return out.sort((a, b) => a.midi - b.midi);
    },
    /** Lanes and the Y window over every note the progression asks for. */
    layout(mode) {
      const st = mode.state;
      const s = st.sched;
      if (!s) return;
      const all = new Set();
      s.flat.forEach((e) => pzChord.targets(st, s, e).forEach((t) => all.add(t.midi)));
      const ms = [...all].sort((a, b) => a - b);
      const pv = pzHighway();
      if (pv && pv.setDisplay && ms.length) {
        pv.setDisplay({
          lanes: ms.map((m) => ({ midi: m })),
          range: { min: ms[0], max: ms[ms.length - 1], pad: 1.5, minSpan: 10 }
        });
      }
    },
    start(mode) {
      const kit = pzKit();
      const st = mode.state;
      if (!kit) return;
      const stones = !!mode.profile.autoArpeggio;
      Object.assign(st, {
        kit,
        stones,
        trace: new kit.Trace(10),
        level: pzLevel(),
        sched: null,
        schedAt: 0,
        k: -1,
        cur: null,
        past: [],
        seen: 0,
        landed: 0,
        missed: {},
        leaps: 0,
        leapsLanded: 0,
        chordsDone: 0,
        run: 0,
        passes: 0,
        intervals: [],
        gate: new kit.NoteGate(stones ? { tol: 35, holdMs: 400, blankMs: 0, fold: true } : { tol: 50, holdMs: 1000, blankMs: 0, fold: true }),
        alt: stones ? new kit.NoteGate({ tol: 35, holdMs: 400, blankMs: 0, fold: true }) : null,
        lastLanes: null,
        lastPanel: 0
      });
      st.viz = {
        trace: st.trace,
        events: [],
        chords: [],
        links: [],
        leap: null,
        dir: null,
        ring: 0,
        head: "",
        right: "",
        headColor: null,
        review: false,
        reviewTitle: "",
        reviewRows: []
      };
      const pv = pzOverlay(mode, "pitchChord", {
        game: false,
        gameFlash: false,
        trail: "none",
        band: false,
        targetTrail: false,
        primaryLane: false,
        chordLanes: false,
        chordBadge: false,
        keyboardTarget: false,
        foldOctave: true,
        stats: "nearest",
        laneCents: stones ? 35 : 50,
        pastSec: 6,
        nowAt: 0.42,
        keepOnStop: true,
        lanes: [],
        headPx: kit.headPx("strip")
      });
      st.lastLanes = pv ? pv.chordLanes : null;
      st.sched = pzChord.sched(st);
      pzChord.layout(mode);
    },
    /** The piano moved on: which event of the schedule just started. */
    observe(mode, now) {
      const st = mode.state;
      const pv = pzHighway();
      if (!pv || pv.chordLanes === st.lastLanes) return;
      st.lastLanes = pv.chordLanes;
      const s = st.sched;
      const lanes = pv.chordLanes || [];
      if (!s || !lanes.length) return;
      const label = pv.activeChordName || "";
      const isOne = lanes.length === 1 && label.indexOf("·") >= 0;
      const name = label.split("·")[0].trim();
      if (!st.stones && isOne !== s.one) return; // the app's lock-time preview, not a note
      const n = s.flat.length;
      if (st.cur) {
        const ce = s.flat[st.k];
        const cname = s.prog.chords[ce.ci].name;
        // Same event re-announced (lock, or one note of a chord in the stones mode)
        if (cname === name && (!ce.note || (lanes[0] && lanes[0].name === ce.note)) && now - st.cur.t0 < ce.dur - 250) return;
      }
      for (let j = 1; j <= n; j++) {
        const k = (st.k + j + n) % n;
        const e = s.flat[k];
        if (s.prog.chords[e.ci].name !== name) continue;
        if (e.note && !(lanes[0] && lanes[0].name === e.note)) continue;
        pzChord.begin(mode, k, now);
        return;
      }
    },
    begin(mode, k, now) {
      const st = mode.state;
      const s = st.sched;
      if (st.cur) pzChord.finish(mode, st.cur);
      const e = s.flat[k];
      const tg = pzChord.targets(st, s, e);
      const prev = st.cur;
      st.k = k;
      st.cur = {
        k,
        t0: now,
        t1: now + e.dur,
        ci: e.ci,
        name: s.prog.chords[e.ci].name,
        targets: tg.map((t) => Object.assign({ lit: false, amber: false, now: true, frac: 0 }, t)),
        landed: false,
        si: 0,
        leap: prev && prev.targets[0] && tg[0] ? tg[0].midi - prev.targets[0].midi : 0
      };
      st.seen++;
      if (Math.abs(st.cur.leap) >= 5) st.leaps++;
      if (st.stones) {
        st.gate.setTarget(tg[0].midi);
        st.alt.setTarget(tg.slice(1).map((t) => t.midi));
      } else st.gate.setTarget(tg.map((t) => t.midi));
    },
    finish(mode, ev) {
      const st = mode.state;
      ev.cur = false;
      ev.t1 = Math.min(ev.t1, performance.now());
      if (st.stones) {
        const full = ev.si >= 3;
        if (full) st.chordsDone++;
        st.run = full ? st.run + 1 : 0;
        if (st.sched && st.run >= st.sched.prog.chords.length) {
          st.passes++;
          st.run = 0;
        }
      } else if (!ev.landed) {
        ev.targets.forEach((t) => (st.missed[t.label] = (st.missed[t.label] || 0) + 1));
      }
      ev.targets.forEach((t) => (t.now = false));
      st.past.push(ev);
      if (st.past.length > 8) st.past.shift();
    },
    frame(mode, frame) {
      const st = mode.state;
      if (!st.viz || !st.kit) return;
      const kit = st.kit;
      const now = performance.now();
      if (now - st.schedAt > 500) {
        st.schedAt = now;
        const s = pzChord.sched(st);
        if (s && (!st.sched || s.key !== st.sched.key)) {
          st.sched = s;
          st.k = -1;
          if (st.cur) pzChord.finish(mode, st.cur);
          st.cur = null;
          pzChord.layout(mode);
        }
      }
      pzChord.observe(mode, now);
      const rel = st.level ? st.level.feed(frame) : null;
      const f = frame.rawFreq;
      st.trace.push(now, f && frame.sounding !== false ? kit.hzToMidi(f) : null, rel, 0);
      const ev = st.cur;
      st.viz.ring = 0;
      st.viz.dir = null;
      if (ev) {
        if (st.stones) pzChord.stoneFrame(mode, frame, ev, now, rel);
        else {
          const locked = ev.landed ? false : st.gate.feed(frame, rel);
          const hit = st.gate.hit;
          ev.targets.forEach((t) => (t.frac = !ev.landed && t.midi === hit ? st.gate.frac : 0));
          if (locked) {
            ev.landed = true;
            st.landed++;
            if (Math.abs(ev.leap) >= 5) st.leapsLanded++;
            ev.targets.forEach((t) => (t.lit = t.midi === hit));
          }
          st.viz.ring = ev.landed ? 0 : st.gate.frac;
          st.viz.dir = ev.landed ? null : st.gate.direction();
          const aim = ev.targets.find((t) => t.midi === hit) || ev.targets[0];
          if (aim) pzTarget(aim.midi, frame);
        }
      }
      pzChord.picture(mode, now);
      if (now - st.lastPanel > 150) {
        st.lastPanel = now;
        const r = mode.$("[data-r]");
        const val = String(st.stones ? st.passes : st.landed);
        if (r && r.textContent !== val) r.textContent = val;
        const s2 = mode.$("[data-st]");
        const line = st.stones
          ? L(`Acordes 1-3-5 completos: ${st.chordsDone}`, `Chords with 1-3-5 complete: ${st.chordsDone}`)
          : L(`Acertadas ${st.landed} de ${st.seen}`, `Landed ${st.landed} of ${st.seen}`);
        if (s2 && s2.textContent !== line) s2.textContent = line;
      }
    },
    stoneFrame(mode, frame, ev, now, rel) {
      const st = mode.state;
      const kit = st.kit;
      const tg = ev.targets;
      if (ev.si < tg.length) {
        const cur = tg[ev.si];
        const locked = st.gate.feed(frame, rel);
        tg.forEach((t, i) => {
          t.now = i === ev.si;
          t.frac = i === ev.si ? st.gate.frac : 0;
        });
        // Another chord tone, held: shown in amber on its stone (the order is 1-3-5-8)
        if (st.alt.feed(frame, rel)) {
          const other = tg.find((t) => t.midi === st.alt.hit && !t.lit);
          if (other) other.amber = true;
          st.alt.setTarget(tg.filter((t, i) => i > ev.si && !t.amber).map((t) => t.midi));
        }
        if (locked) {
          cur.lit = true;
          cur.amber = false;
          cur.t = now;
          cur.sung = st.gate.midi;
          const prev = tg[ev.si - 1];
          if (prev && prev.lit && Number.isFinite(prev.sung) && Number.isFinite(cur.sung)) {
            const written = cur.midi - prev.midi;
            const err = kit.foldCents((cur.sung - prev.sung - written) * 100);
            const name = { 3: L("3m", "m3"), 4: L("3M", "M3"), 5: L("4J", "P4"), 7: L("5J", "P5"), 12: L("8J", "P8") }[written] || `${written}st`;
            st.intervals.push({ name, err });
            st.viz.links.push({ ta: prev.t, tb: now, ma: prev.midi, mb: cur.midi, name, err });
            if (st.viz.links.length > 16) st.viz.links.shift();
          }
          ev.si++;
          if (ev.si >= 3) ev.landed = true;
          if (ev.si < tg.length) {
            st.gate.setTarget(tg[ev.si].midi);
            st.alt.setTarget(tg.filter((t, i) => i > ev.si && !t.amber).map((t) => t.midi));
          }
        }
        st.viz.ring = st.gate.frac;
        st.viz.dir = st.gate.direction();
      }
      const aim = tg[Math.min(ev.si, tg.length - 1)];
      if (aim) pzTarget(aim.midi, frame);
    },
    /** Past, current and the next events by the clock; chord names along the top. */
    picture(mode, now) {
      const st = mode.state;
      const kit = st.kit;
      const v = st.viz;
      const s = st.sched;
      const C = global.VTViz?.C || {};
      const events = st.past.slice(-4);
      const future = [];
      if (st.cur && s) {
        events.push(st.cur);
        let t = st.cur.t0 + s.flat[st.k].dur;
        for (let j = 1; j <= 5; j++) {
          const k = (st.k + j) % s.flat.length;
          const e = s.flat[k];
          const tg = pzChord.targets(st, s, e);
          future.push({
            t0: t,
            t1: t + e.dur,
            ci: e.ci,
            name: s.prog.chords[e.ci].name,
            cur: false,
            targets: tg.map((x) => Object.assign({ dashed: true, now: false }, x))
          });
          t += e.dur;
        }
      }
      const all = events.concat(future);
      v.events = all.map((e) => (st.stones ? Object.assign({}, e, { stones: e.targets }) : e));
      // Chord names: consecutive events of one chord merge
      const chords = [];
      all.forEach((e) => {
        const last = chords[chords.length - 1];
        if (last && last.ci === e.ci && Math.abs(last.t1 - e.t0) < 400) {
          last.t1 = e.t1;
          last.cur = last.cur || !!e.cur;
        } else chords.push({ ci: e.ci, t0: e.t0, t1: e.t1, name: e.name, cur: !!e.cur });
      });
      v.chords = chords;
      v.leap = null;
      if (st.cur && future[0] && future[0].targets[0] && st.cur.targets[0]) {
        const d = future[0].targets[0].midi - st.cur.targets[0].midi;
        if (Math.abs(d) >= 5) v.leap = { t: future[0].t0, m: future[0].targets[0].midi, dir: Math.sign(d), n: Math.abs(d) };
      }
      v.headColor = null;
      if (!st.cur) {
        v.head = L("Espera al piano: cada acorde marca tus notas", "Wait for the piano: each chord marks your notes");
        v.right = "";
        return;
      }
      const ev = st.cur;
      if (st.stones) {
        const t = ev.targets[Math.min(ev.si, 3)];
        if (ev.si >= 3) {
          v.head = L(`✓ ${ev.name}: 1-3-5${ev.si >= 4 ? "-8" : ""}`, `✓ ${ev.name}: 1-3-5${ev.si >= 4 ? "-8" : ""}`);
          v.headColor = C.done;
        } else v.head = L(`${ev.name}: canta el ${t.deg} (${kit.noteName(t.midi)})`, `${ev.name}: sing the ${t.deg} (${kit.noteName(t.midi)})`);
        v.right = L(`vueltas completas ${st.passes}`, `full passes ${st.passes}`);
      } else {
        if (ev.landed) {
          const lit = ev.targets.find((x) => x.lit) || ev.targets[0];
          v.head = `✓ ${lit ? lit.label : ev.name}`;
          v.headColor = C.done;
        } else if (ev.targets.length === 1) v.head = L(`Canta ${ev.targets[0].label} (${ev.name})`, `Sing ${ev.targets[0].label} (${ev.name})`);
        else v.head = L(`${ev.name}: canta cualquier nota del acorde`, `${ev.name}: sing any chord tone`);
        v.right = L(`acertadas ${st.landed}`, `landed ${st.landed}`);
      }
    },
    stop(mode) {
      const st = mode.state;
      if (!st.viz || !st.kit) return { patches: {}, summary: "" };
      const kit = st.kit;
      if (st.cur) pzChord.finish(mode, st.cur);
      st.cur = null;
      pzChord.picture(mode, performance.now());
      const rows = [];
      const patches = {};
      let summary;
      if (st.stones) {
        rows.push(L(`Acordes con 1-3-5 completo: ${st.chordsDone} de ${st.seen}`, `Chords with 1-3-5 complete: ${st.chordsDone} of ${st.seen}`));
        rows.push(L(`Vueltas completas (todos los acordes seguidos): ${st.passes}`, `Full passes (every chord in a row): ${st.passes}`));
        const errs = st.intervals.map((x) => Math.abs(x.err));
        const med = errs.length ? Math.round(pzMedian(errs)) : null;
        if (errs.length >= 3) {
          rows.push(L(`Intervalos: a ${med}¢ de lo escrito, en mediana (aprox.)`, `Intervals: ${med}¢ from the written ones, median (approx.)`));
          const by = {};
          st.intervals.forEach((x) => (by[x.name] = by[x.name] || []).push(x.err));
          const worst = Object.keys(by)
            .map((k) => ({ k, c: pzMedian(by[k]) }))
            .sort((a, b) => Math.abs(b.c) - Math.abs(a.c))[0];
          if (worst && Math.abs(worst.c) >= 15) {
            rows.push(L(`El que más se aleja: ${worst.k} (${kit.fmtCents(worst.c)})`, `Furthest off: ${worst.k} (${kit.fmtCents(worst.c)})`));
          }
        }
        if (st.passes > 0) patches.progressions = st.passes;
        if (errs.length >= 4) patches.intervalAccuracy = pzScale(med, [10, 20, 35]);
        summary = L(
          `${st.passes} vueltas completas · ${st.chordsDone} acordes 1-3-5${med != null ? ` · intervalos a ${med}¢ (aprox.)` : ""}`,
          `${st.passes} full passes · ${st.chordsDone} chords 1-3-5${med != null ? ` · intervals ${med}¢ off (approx.)` : ""}`
        );
      } else {
        rows.push(L(`Acertaste ${st.landed} de ${st.seen} notas (±50¢ durante 1 s)`, `You landed ${st.landed} of ${st.seen} notes (±50¢ for 1 s)`));
        const hard = Object.keys(st.missed)
          .sort((a, b) => st.missed[b] - st.missed[a])
          .slice(0, 3);
        if (hard.length) rows.push(L(`Te costaron más: ${hard.join(", ")}`, `Hardest: ${hard.join(", ")}`));
        if (st.leaps) rows.push(L(`Saltos grandes (5 semitonos o más): ${st.leapsLanded} de ${st.leaps}`, `Big leaps (5 semitones or more): ${st.leapsLanded} of ${st.leaps}`));
        if (st.landed > 0) patches.reps = st.landed;
        summary = L(`${st.landed} de ${st.seen} notas acertadas`, `${st.landed} of ${st.seen} notes landed`);
      }
      st.viz.head = st.stones ? L(pzPl(st.passes, "vuelta completa", "vueltas completas"), pzPl(st.passes, "full pass", "full passes")) : L(`Acertaste ${st.landed} de ${st.seen}`, `Landed ${st.landed} of ${st.seen}`);
      st.viz.right = "";
      st.viz.reviewTitle = st.stones ? L("Tus arpegios", "Your arpeggios") : L("Tus notas del acorde", "Your chord tones");
      st.viz.reviewRows = rows;
      st.viz.review = true;
      return { patches, summary };
    }
  };

  Modes.pitchChord = baseMode({
    id: "pitchChord",
    render() {
      const arp = !!this.profile.autoArpeggio;
      this.hud.classList.add("pz");
      this.hud.innerHTML = `
        <div class="mode-title">${arp ? L("Arpegio · tonos del acorde 1-3-5-8", "Arpeggio chord tones 1-3-5-8") : L("Acorde / solfeo · canta sus notas", "Chord / solfège · sing its tones")}</div>
        <div class="mode-big" data-r>0</div>
        <p class="mode-meta" data-st>${arp ? L("Acordes 1-3-5 completos: 0", "Chords with 1-3-5 complete: 0") : L("Acertadas 0 de 0", "Landed 0 of 0")}</p>
        <p class="mode-meta muted">${
          arp
            ? L("Cada acorde: 1 → 3 → 5 → 8, en orden, ~0,4 s cada uno dentro de ±35¢. El número cuenta vueltas completas.", "Each chord: 1 → 3 → 5 → 8, in order, ~0.4 s each within ±35¢. The number counts full passes.")
            : L("Una nota del acorde cuenta al sostenerla 1 s dentro de ±50¢ (el bajo se canta una octava arriba).", "A chord tone counts once held 1 s within ±50¢ (bass notes are sung an octave up).")
        }</p>
      `;
      const kit = pzKit();
      if (kit) {
        pzIdle(
          this,
          kit.idleCard(
            arp ? L("Arpegio: 1 → 3 → 5 → 8", "Arpeggio: 1 → 3 → 5 → 8") : L("Canta las notas del acorde", "Sing the chord tones"),
            [
              arp ? L("Las piedras de cada acorde esperan a la derecha", "Each chord's stones wait to the right") : L("La nota que toca el piano es tu objetivo", "The note the piano plays is your target"),
              L("Los saltos grandes se anuncian antes de llegar", "Big leaps are announced before they come")
            ]
          ),
          { chordBadge: false }
        );
      }
    },
    onStart() {
      pzChord.start(this);
    },
    onFrame(frame) {
      pzChord.frame(this, frame);
    },
    onStop() {
      return pzChord.stop(this);
    }
  });

  /* —— Song phrases (s3): each phrase as a bracket with its length —— */

  Modes.pitchSong = baseMode({
    id: "pitchSong",
    render() {
      this.state.feel = 0;
      this.state.better = 0;
      this.state.goal = 6;
      this.state.ok = 0;
      this.hud.classList.add("pz");
      const chip = (s) =>
        `<button type="button" class="btn btn-sm pz-chip" data-goal="${s}" aria-pressed="${s === 6}">${s} s</button>`;
      this.hud.innerHTML = `
        <div class="mode-title">${L("Frases de canción · sin respirar a mitad", "Song phrases · no mid-breath")}</div>
        <div class="pz-row" role="group" aria-label="${L("Meta de frase", "Phrase goal")}">
          <span class="pz-lab">${L("Meta de frase", "Phrase goal")}</span>${chip(4)}${chip(6)}${chip(8)}
        </div>
        <div class="pz-row">
          <button type="button" class="btn btn-sm" data-feel>${L("Canción A +1", "Song A +1")}</button>
          <button type="button" class="btn btn-sm" data-better>${L("Canción B +1", "Song B +1")}</button>
        </div>
        <p class="mode-meta">A <strong data-f>0</strong>/5 · B <strong data-b>0</strong>/5 · ${L("frases a la meta", "phrases at goal")} <strong data-p>0</strong></p>
        <p class="mode-meta muted">${L("Marca +1 al terminar una estrofa. La línea mide cada frase: su largo, las pausas y si el volumen cae al final.", "Tap +1 when you finish a stanza. The line measures each phrase: its length, the pauses, and whether the level falls at the end.")}</p>
      `;
      this.hud.querySelectorAll("[data-goal]").forEach((b) =>
        b.addEventListener("click", () => {
          this.state.goal = Number(b.getAttribute("data-goal")) || 6;
          this.hud.querySelectorAll("[data-goal]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
          if (this.state.viz) this.state.viz.target = this.state.goal;
        })
      );
      this.$("[data-feel]")?.addEventListener("click", () => {
        this.state.feel++;
        if (this.$("[data-f]")) this.$("[data-f]").textContent = this.state.feel;
      });
      this.$("[data-better]")?.addEventListener("click", () => {
        this.state.better++;
        if (this.$("[data-b]")) this.$("[data-b]").textContent = this.state.better;
      });
      const kit = pzKit();
      if (kit) {
        pzIdle(
          this,
          kit.idleCard(L("Una frase, un aire", "One phrase, one breath"), [
            L("Cada frase se mide: su largo y la meta que eliges", "Each phrase is measured: its length against the goal you pick"),
            L("Respirar entre frases es parte de cantar: no resta", "Breathing between phrases is part of singing: it costs nothing")
          ]),
          { chordBadge: false }
        );
      }
    },
    onStart() {
      const kit = pzKit();
      if (!kit) return;
      const st = this.state;
      Object.assign(st, {
        kit,
        trace: new kit.Trace(10),
        level: pzLevel(),
        phrases: [],
        cur: null,
        sndMs: 0,
        silMs: 0,
        lo: null,
        hi: null,
        med: [],
        lastRange: 0,
        lastLanes: null,
        lastPanel: 0
      });
      st.viz = {
        trace: st.trace,
        phrases: st.phrases,
        cur: null,
        target: st.goal,
        head: "",
        right: "",
        headColor: null,
        review: false,
        reviewTitle: "",
        reviewRows: []
      };
      pzOverlay(this, "pitchSong", {
        game: false,
        gameFlash: false,
        trail: "none",
        band: false,
        targetTrail: false,
        primaryLane: false,
        chordLanes: false,
        chordBadge: false,
        keyboardTarget: false,
        stats: "nearest",
        lanes: [],
        pastSec: 8,
        nowAt: 0.55,
        keepOnStop: true,
        headPx: kit.headPx("phrases")
      });
    },
    onFrame(frame) {
      const st = this.state;
      if (!st.viz || !st.kit) return;
      const kit = st.kit;
      const now = performance.now();
      const dt = clamp(frame.dtMs || 16, 0, 100);
      const rel = st.level ? st.level.feed(frame) : null;
      const f = frame.rawFreq;
      const m = f && frame.sounding !== false ? kit.hzToMidi(f) : null;
      st.trace.push(now, m, rel, 0);
      if (m != null) {
        st.med.push(m);
        if (st.med.length > 5) st.med.shift();
        const mm = pzMedian(st.med);
        st.lo = st.lo == null ? mm : Math.min(st.lo, mm);
        st.hi = st.hi == null ? mm : Math.max(st.hi, mm);
      } else st.med.length = 0;
      if (frame.sounding) {
        st.sndMs += dt;
        st.silMs = 0;
        if (!st.cur && st.sndMs >= 60) st.cur = { t0: now - st.sndMs, last: now, dbs: [] };
        if (st.cur) {
          st.cur.last = now;
          if (rel != null) st.cur.dbs.push(rel);
        }
      } else {
        st.sndMs = 0;
        if (st.cur) {
          st.silMs += dt;
          if (st.silMs >= 350) this._endPhrase();
        }
      }
      st.viz.cur = st.cur ? { t0: st.cur.t0 } : null;
      // The harmony under you: the chord the piano plays, folded into singing
      // range (bass notes an octave up) as quiet lanes; the Y window covers the
      // progression's folded tones and wherever your voice went
      if (now - st.lastRange > 250) {
        st.lastRange = now;
        const pv = pzHighway();
        if (pv && pv.chordLanes !== st.lastLanes) {
          st.lastLanes = pv.chordLanes;
          const seen = new Set();
          const lanes = [];
          (pv.chordLanes || []).forEach((ln) => {
            const m = Math.round(pzChord.fold(st, ln.midi));
            if (seen.has(m)) return;
            seen.add(m);
            lanes.push({ midi: m });
          });
          if (pv.setDisplay) pv.setDisplay({ lanes });
        }
        const sch = pzChord.sched(st);
        const tones = [];
        if (sch) sch.prog.chords.forEach((c) => c.notes.forEach((n) => {
          const f = (global.VT_NOTE_FREQ || {})[n];
          if (f) tones.push(pzChord.fold(st, kit.hzToMidi(f)));
        }));
        const lo = Math.min(tones.length ? Math.min(...tones) : 45, st.lo != null ? st.lo - 2 : 99);
        const hi = Math.max(tones.length ? Math.max(...tones) : 57, st.hi != null ? st.hi + 2 : 0);
        const r = { min: Math.floor(lo), max: Math.ceil(hi) };
        if (!st.range || r.min !== st.range.min || r.max !== st.range.max) {
          st.range = r;
          if (pv && pv.setDisplay) pv.setDisplay({ range: { min: r.min, max: r.max, pad: 1, minSpan: 12 } });
        }
      }
      const pv = pzHighway();
      const chord = pv && pv.activeChordName ? pv.activeChordName.split("·")[0].trim() : "";
      const n = st.phrases.length;
      if (st.cur) st.viz.head = L(`Frase ${n + 1} · ${pzSec((now - st.cur.t0) / 1000)}`, `Phrase ${n + 1} · ${pzSec((now - st.cur.t0) / 1000)}`);
      else st.viz.head = n ? L("Respira y empieza la frase siguiente", "Breathe, then start the next phrase") : L("Canta la primera frase", "Sing the first phrase");
      st.viz.right = (chord ? chord + " · " : "") + L(`meta ${st.goal} s · ${pzPl(st.ok, "completa", "completas")}`, `goal ${st.goal} s · ${st.ok} full`);
      if (now - st.lastPanel > 200) {
        st.lastPanel = now;
        const p = this.$("[data-p]");
        if (p && p.textContent !== String(st.ok)) p.textContent = String(st.ok);
      }
    },
    _endPhrase() {
      const st = this.state;
      const c = st.cur;
      st.cur = null;
      st.silMs = 0;
      if (!c) return;
      const len = (c.last - c.t0) / 1000;
      if (len < 0.8) return;
      let shape = "even";
      if (c.dbs.length >= 12) {
        const k = Math.floor(c.dbs.length / 3);
        const d = pzMedian(c.dbs.slice(-k)) - pzMedian(c.dbs.slice(0, k));
        shape = d <= -4 ? "fades" : d >= 4 ? "grows" : "even";
      }
      const ok = len >= st.goal - 0.05;
      if (ok) st.ok++;
      st.phrases.push({ t0: c.t0, t1: c.last, len, ok, shape });
      if (st.phrases.length > 60) st.phrases.shift();
    },
    onStop() {
      const st = this.state;
      const patches = {};
      if (st.feel > 0) patches.repsFeel = st.feel;
      if (st.better > 0) patches.repsBetter = st.better;
      if (!st.viz || !st.kit) return { patches, summary: "" };
      if (st.cur) this._endPhrase();
      st.viz.cur = null;
      const ps = st.phrases;
      const rows = [];
      if (ps.length) {
        rows.push(L(`${pzPl(ps.length, "frase", "frases")} · ${st.ok} ${st.ok === 1 ? "llegó" : "llegaron"} a ${st.goal} s sin respirar`, `${pzPl(ps.length, "phrase", "phrases")} · ${st.ok} reached ${st.goal} s without a breath`));
        rows.push(L(`La más larga: ${pzSec(Math.max(...ps.map((p) => p.len)))}`, `Longest: ${pzSec(Math.max(...ps.map((p) => p.len)))}`));
        const fades = ps.filter((p) => p.shape === "fades").length;
        rows.push(
          fades >= 2
            ? L(`${fades === 1 ? "1 frase cae" : fades + " frases caen"} al final (◣): guarda aire para el final`, `${fades === 1 ? "1 phrase fades" : fades + " phrases fade"} at the end (◣): save air for the end`)
            : L("El volumen se mantuvo hasta el final de las frases", "The level held to the end of your phrases")
        );
        const gaps = [];
        for (let i = 1; i < ps.length; i++) gaps.push((ps[i].t0 - ps[i - 1].t1) / 1000);
        if (gaps.length) rows.push(L(`Pausas para respirar: ${pzSec(pzMedian(gaps))} de mediana`, `Breathing pauses: ${pzSec(pzMedian(gaps))} median`));
      } else rows.push(L("Sin frases medidas todavía: canta una frase y respira al final", "No phrases measured yet: sing a phrase and breathe at its end"));
      st.viz.reviewTitle = L("Tus frases", "Your phrases");
      st.viz.reviewRows = rows;
      st.viz.head = L(pzPl(ps.length, "frase", "frases"), pzPl(ps.length, "phrase", "phrases"));
      st.viz.review = true;
      return {
        patches,
        summary: L(
          `${st.ok} de ${ps.length} frases a la meta (${st.goal} s) · A ${st.feel} · B ${st.better}`,
          `${st.ok} of ${ps.length} phrases at goal (${st.goal} s) · A ${st.feel} · B ${st.better}`
        )
      };
    }
  });

  /* —— Listen, then sing (s9): the app's note challenge, with a listening gate —— */

  const PZ_LISTEN_MS = 1800;

  Modes.pitchMatch = baseMode({
    id: "pitchMatch",
    render() {
      this.hud.classList.add("pz");
      this.hud.innerHTML = `
        <div class="mode-title">${L("Afinar nota · escucha y canta", "Pitch match · listen, then sing")}</div>
        <div class="mode-big" data-s>0 / 8</div>
        <p class="mode-meta muted">${L("Escucha la nota entera; luego cántala en /A/ y sostenla ~0,8 s dentro de ±35¢. Una octava arriba o abajo también vale.", "Hear the whole note; then sing it on /A/ and hold it ~0.8 s within ±35¢. An octave up or down counts too.")}</p>
        <div class="pz-row"><button type="button" class="btn btn-sm btn-singing" data-again hidden>${L("Otra ronda", "Another round")}</button></div>
      `;
      this.$("[data-again]")?.addEventListener("click", () => this._newRound());
      const kit = pzKit();
      if (kit) {
        pzIdle(
          this,
          kit.idleCard(L("Escucha, luego canta", "Listen, then sing"), [
            L("El piano toca una nota: escúchala entera", "The piano plays a note: hear all of it"),
            L("Luego cántala y sostenla hasta que se fije · 8 notas", "Then sing it and hold it until it locks · 8 notes")
          ]),
          { chordBadge: false }
        );
      }
    },
    onStart() {
      const kit = pzKit();
      if (!kit) return;
      const st = this.state;
      Object.assign(st, {
        kit,
        trace: new kit.Trace(6),
        level: pzLevel(),
        gate: new kit.NoteGate({ tol: 35, holdMs: 1e9, blankMs: 0, fold: true }),
        notes: null,
        idx: 0,
        shift: kit.octaveShift(),
        results: [],
        locks: 0,
        listenFrom: null,
        singFrom: null,
        lastPanel: 0
      });
      st.viz = {
        trace: st.trace,
        slots: [],
        idx: 0,
        phase: "listen",
        listenFrac: 0,
        lock: 0,
        dir: null,
        noteLabel: "—",
        targetMidi: NaN,
        review: false,
        summary: []
      };
      pzOverlay(this, "pitchMatch", {
        game: true,
        gameFlash: false,
        gameHold: true,
        foldOctave: true,
        laneCents: 35,
        trail: "none",
        band: false,
        targetTrail: false,
        chordLanes: false,
        chordBadge: false,
        pastSec: 5,
        nowAt: 0.62,
        keepOnStop: true,
        headPx: kit.headPx("chips")
      });
    },
    _midi(i) {
      const st = this.state;
      const f = (global.VT_NOTE_FREQ || {})[st.notes[i]];
      return f ? st.kit.hzToMidi(f) + 12 * st.shift : NaN;
    },
    _aim(now) {
      const st = this.state;
      const pv = pzHighway();
      const m = this._midi(st.idx);
      st.gate.setTarget(m);
      st.viz.targetMidi = m;
      st.viz.noteLabel = st.kit.noteName(m);
      st.viz.idx = st.idx;
      st.viz.phase = "listen";
      st.listenFrom = now;
      if (pv && pv.setDisplay) pv.setDisplay({ gameHold: true });
      if (pv && pv.setNoteQueue) {
        pv.setNoteQueue(st.notes.slice(st.idx).map((n, j) => {
          const mm = this._midi(st.idx + j);
          return { midi: mm, label: st.kit.noteName(mm) };
        }));
      }
    },
    _newRound() {
      const pv = pzHighway();
      const game = pv && pv.game;
      if (!game || !this.state.viz || this.state.viz.review) return;
      const first = game.startChallenge(8);
      if (typeof global.VTLockHighwayNotes === "function") global.VTLockHighwayNotes(game.challengeNotes);
      const nm = typeof global.VTShiftNoteName === "function" ? global.VTShiftNoteName(first, this.state.kit.octaveShift()) : first;
      const f = (global.VT_NOTE_FREQ || {})[nm];
      if (f) {
        global.VTSetPracticeTarget?.(f);
        pzPlay(this.state.kit.hzToMidi(f), 4);
      }
      const b = this.$("[data-again]");
      if (b) b.hidden = true;
    },
    onFrame(frame) {
      const st = this.state;
      if (!st.viz || !st.kit) return;
      const kit = st.kit;
      const now = performance.now();
      const pv = pzHighway();
      const game = pv && pv.game;
      const rel = st.level ? st.level.feed(frame) : null;
      const f = frame.rawFreq;
      st.trace.push(now, f && frame.sounding !== false ? kit.hzToMidi(f) : null, rel, 0);
      if (!game || !game.challengeNotes || !game.challengeNotes.length) {
        // Challenge turned off: free matching against the reference lane
        if (pv && pv.display && pv.display.gameHold) pv.setDisplay({ gameHold: false });
        st.viz.phase = "sing";
        st.viz.noteLabel = pv && pv.targetFreq ? kit.noteName(kit.hzToMidi(pv.targetFreq)) : "—";
        st.viz.lock = game ? game.lockProgress || 0 : 0;
        return;
      }
      // A new round (the app's, or "Another round")
      if (game.challengeNotes !== st.notes) {
        st.notes = game.challengeNotes;
        st.idx = game.challengeIndex;
        st.viz.slots = st.notes.map((n, i) => ({ label: kit.noteName(this._midi(i)), res: null, state: i < st.idx ? "done" : i === st.idx ? "cur" : "next" }));
        this._aim(now);
      }
      const sh = kit.octaveShift();
      if (sh !== st.shift) {
        st.shift = sh;
        st.viz.slots.forEach((s, i) => (s.label = kit.noteName(this._midi(i))));
        if (st.idx < st.notes.length) this._aim(now);
      }
      // Locked by the game (800 ms inside ±35¢): the note's result
      while (game.challengeIndex > st.idx && st.idx < st.notes.length) {
        const res = st.gate.result();
        res.settleMs = st.singFrom != null && st.gate.firstIn != null ? st.gate.firstIn : null;
        const slot = st.viz.slots[st.idx];
        if (slot) {
          slot.state = "done";
          slot.res = res;
        }
        if (res.cents != null) st.results.push(res);
        st.locks++;
        st.idx++;
        if (st.viz.slots[st.idx]) st.viz.slots[st.idx].state = "cur";
        if (st.idx < st.notes.length) this._aim(now);
      }
      if (st.idx >= st.notes.length) {
        if (st.viz.phase !== "done") {
          st.viz.phase = "done";
          if (pv && pv.setNoteQueue) pv.setNoteQueue(null);
          const b = this.$("[data-again]");
          if (b) b.hidden = false;
        }
      } else if (st.viz.phase === "listen") {
        st.viz.listenFrac = (now - st.listenFrom) / PZ_LISTEN_MS;
        if (now - st.listenFrom >= PZ_LISTEN_MS) {
          st.viz.phase = "sing";
          st.singFrom = now;
          if (pv && pv.setDisplay) pv.setDisplay({ gameHold: false });
        }
      } else {
        st.gate.feed(frame, rel);
        st.viz.dir = st.gate.direction();
        const m = this._midi(st.idx);
        pzTarget(m, frame);
      }
      st.viz.lock = game.lockProgress || 0;
      if (pv && pv.setQueueProgress) pv.setQueueProgress(st.viz.phase === "sing" ? st.viz.lock : 0);
      // Throttled, but a new lock shows at once (the canvas already counts it)
      if (now - st.lastPanel > 150 || st.panelIdx !== st.idx) {
        st.lastPanel = now;
        st.panelIdx = st.idx;
        const s = this.$("[data-s]");
        const t = `${Math.min(st.idx, st.notes.length)} / ${st.notes.length}`;
        if (s && s.textContent !== t) s.textContent = t;
      }
    },
    onStop() {
      const st = this.state;
      if (!st.viz || !st.kit) return { patches: {}, summary: "" };
      const kit = st.kit;
      const pv = pzHighway();
      if (pv && pv.setNoteQueue) pv.setNoteQueue(null);
      const res = st.results;
      const abs = res.map((r) => Math.abs(r.cents));
      const medAbs = abs.length ? Math.round(pzMedian(abs)) : null;
      const sds = res.map((r) => r.sd).filter(Number.isFinite);
      const sd = sds.length ? Math.round(pzMedian(sds)) : null;
      const rows = [];
      if (res.length) {
        const signed = pzMedian(res.map((r) => r.cents));
        rows.push(L(`Afinación: a ${medAbs}¢ del centro, en mediana (aprox.)`, `Accuracy: ${medAbs}¢ from the centre, median (approx.)`));
        rows.push(
          Math.abs(signed) >= 8
            ? L(`Tiendes a quedar ${signed > 0 ? "alto" : "bajo"} (${kit.fmtCents(signed)})`, `You lean ${signed > 0 ? "sharp" : "flat"} (${kit.fmtCents(signed)})`)
            : L("Sin tendencia alta ni baja", "No sharp or flat lean")
        );
        if (sd != null) rows.push(L(`Estabilidad: ±${sd}¢ mientras sostienes`, `Stability: ±${sd}¢ while you hold`));
        const settle = pzMedian(res.map((r) => r.settleMs).filter(Number.isFinite));
        if (settle != null) rows.push(L(`Llegas a la nota en ~${pzSec(settle / 1000)} tras escuchar`, `You reach the note in ~${pzSec(settle / 1000)} after listening`));
      } else {
        rows.push(L("Ninguna nota fijada todavía: escucha la nota entera y luego cántala suave", "No note locked yet: hear the whole note, then sing it softly"));
      }
      st.viz.summary = rows;
      st.viz.review = true;
      const patches = {};
      if (st.locks > 0) patches.matches = st.locks;
      if (res.length >= 3) {
        patches.accuracy = pzScale(medAbs, [8, 15, 25]);
        if (sd != null) patches.precision = pzScale(sd, [8, 14, 22]);
      }
      return {
        patches,
        summary: L(
          `${st.locks} notas fijadas${medAbs != null ? ` · a ${medAbs}¢ del centro` : ""}${sd != null ? ` · ±${sd}¢` : ""} (aprox.)`,
          `${st.locks} notes locked${medAbs != null ? ` · ${medAbs}¢ from centre` : ""}${sd != null ? ` · ±${sd}¢` : ""} (approx.)`
        )
      };
    }
  });

  /**
   * s4 lip trills / s6 straw — a continuity ribbon (js/scenes/breath.js).
   * The microphone can tell whether the lips are still flapping (a 20–30 Hz
   * flutter in the envelope), whether there is a tone or only air, and the
   * pitch. It cannot tell ease or support, so those stay the learner's own
   * ratings: only the measured minutes are filled in on Stop.
   */
  Modes.sovtFlow = baseMode({
    id: "sovtFlow",
    render() {
      const straw = this.profile.variant === "straw";
      this.state.straw = straw;
      this.state.step = "flow";
      this.state.transfer = false;
      this.state.review = false;
      this.state.targets = [];
      this.state.ahead = [];
      this.state.flowPrev = 0;
      this.state.onMark = 0;
      this.state.match = { sec: 0, diff: null, ok: false };
      this.state.refMidi = null;
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${straw ? L("Fonación con pajita · SOVT", "Straw phonation · SOVT") : L("Trinos de labios · SOVT", "Lip trills · SOVT")}</div>
          <button type="button" class="btn btn-ghost viz-tap" data-xfer aria-pressed="false">${this._xferLabel()}</button>
        </div>
        <div class="viz-words">
          <span data-status>${straw ? L("Canta suave por la pajita", "Sing softly into the straw") : L("Empieza con un brrr sin voz", "Start with a brrr, no voice")}</span>
          <strong data-run>0.0</strong>
          <span data-ev>—</span>
          <span>${L("Paso a vocal marcado:", "Transfer marked:")} <span data-x>no</span></span>
        </div>
        <p class="mode-meta muted">${
          straw
            ? L(
                "El aire solo por la pajita; mejillas sueltas. Después, sin pajita: la misma nota en /u/ y luego en /A/.",
                "Air only through the straw; cheeks soft. Then, without it: the same note on /u/, then /A/."
              )
            : L(
                "Burbujas parejas, mandíbula suelta. Si los labios se paran, más aire y menos presión. Al final, la misma nota en /A/.",
                "Even bubbles, loose jaw. If the lips stop, more air and less pressing. Last, the same note on /A/."
              )
        }</p>
      `;
      this.$("[data-xfer]")?.addEventListener("click", () => this._toggleStep());
      this._mountViz();
    },
    _xferLabel() {
      const straw = this.state.straw;
      if (this.state.step === "vowel") return straw ? L("← Otra vez con pajita", "← Back to the straw") : L("← Otra vez en trino", "← Back to the trill");
      return straw ? L("Sin pajita: /u/ → /A/", "No straw: /u/ → /A/") : L("Paso a /A/ →", "On to /A/ →");
    },
    _kit() {
      return global.VTViz?.scenes?.breathKit || null;
    },
    /**
     * The live picture redraws about 30 times a second, painted inside the
     * engine's own frame: smooth to read, half the paint work, no extra frame.
     */
    _paceDraw(dt, now) {
      this._drawAcc = (this._drawAcc || 0) + dt;
      if (now || this._drawAcc >= 0.03) {
        this._drawAcc = 0;
        const kit = global.VTViz?.scenes?.breathKit;
        if (kit?.paintNow) kit.paintNow(this.viz);
        else this.viz?.draw();
      }
    },
    /** Seconds of the asked-for sound (trill, or tone in the straw) in the flow step. */
    _flowSec() {
      const st = this.state;
      const on = st.step === "flow" && st.track ? st.track.onSec - st.onMark : 0;
      return st.flowPrev + Math.max(0, on);
    },
    _flowTags() {
      const T = this._kit().T;
      return this.state.straw ? [T.TONE, T.TRILL] : [T.TRILL, T.AIRTRILL];
    },
    _mountViz() {
      const V = global.VTViz;
      const K = this._kit();
      if (!V || !K || !V.scenes.sovt) return;
      this.hud.classList.add("has-viz");
      this.state.track = new K.TrillTrack({ onTags: this._flowTags() });
      this.viz = new V.Surface(this.hud, (ctx, w, h) => V.scenes.sovt(ctx, w, h, this._model()), {
        label: this.state.straw
          ? L(
              "Cinta de la pajita: una barra lisa mientras suena un tono, puntos en el suelo cuando solo pasa aire, nada en silencio. Arriba y abajo es la altura; la línea verde es la nota del piano.",
              "Straw ribbon: a smooth bar while a tone sounds, dots along the floor when only air goes through, nothing in silence. Up and down is pitch; the green line is the piano's note."
            )
          : L(
              "Cinta del trino: zigzag mientras los labios burbujean, una línea plana gris si el burbujeo se para y el sonido sigue, nada en silencio. Arriba y abajo es la altura; las líneas verdes son las notas del piano, las siguientes a la derecha.",
              "Trill ribbon: a zig-zag while the lips bubble, a flat grey line if the bubbling stops while the sound goes on, nothing in silence. Up and down is pitch; the green lines are the piano's notes, the next ones to the right."
            ),
        captionHidden: true
      });
      this.viz.draw();
    },
    _model() {
      const st = this.state;
      const targets = st.targets.map((g) => (g.t1 == null && st.ahead.length ? Object.assign({}, g, { t1: st.curEnd }) : g));
      return {
        track: st.track,
        straw: st.straw,
        step: st.step,
        review: st.review,
        targets: st.review ? targets : targets.concat(st.ahead),
        refMidi: st.refMidi,
        match: st.match
      };
    },
    _toggleStep() {
      const st = this.state;
      const K = this._kit();
      if (st.step === "flow") {
        st.flowPrev = this._flowSec();
        st.step = "vowel";
        st.transfer = true;
        st.refMidi = st.track ? st.track.lastRunMidi() : null;
        if (st.track && K) st.track.setOnTags([K.T.TONE]);
      } else {
        st.step = "flow";
        if (st.track && K) st.track.setOnTags(this._flowTags());
        st.onMark = st.track ? st.track.onSec : 0;
      }
      st.match = { sec: st.match.sec, diff: null, ok: false };
      const b = this.$("[data-xfer]");
      if (b) {
        b.textContent = this._xferLabel();
        b.setAttribute("aria-pressed", String(st.step === "vowel"));
      }
      if (this.$("[data-x]")) this.$("[data-x]").textContent = st.transfer ? L("sí", "yes") : "no";
      this._say(true);
      this.viz?.draw();
    },
    /** The piano's note in "1 nota" mode, with the next two from the progression. */
    _pianoNote(note, ei, prog) {
      const st = this.state;
      const K = this._kit();
      const P = global.VTPiano;
      if (!this.hud || !this.hud.isConnected || !st.track || !K) {
        if (P && P.onNoteChange === this._onNote) P.onNoteChange = null;
        return;
      }
      const tr = st.track;
      const midi = K.hzToMidi(global.VT_NOTE_FREQ?.[note]);
      if (midi == null) return;
      st.gotNoteHook = true;
      const list = st.targets;
      const last = list[list.length - 1];
      if (last && last.t1 == null) {
        last.t1 = tr.t;
        st.noteSec = clamp(tr.t - last.t0, 1, 8);
      }
      list.push({ t0: tr.t, t1: null, midi, name: K.noteName(midi) });
      if (list.length > 200) list.shift();
      const events = [];
      (prog?.chords || []).forEach((ch) => (ch.notes || []).forEach((n) => events.push(n)));
      const sec = st.noteSec || Number(document.getElementById("sustain-sec")?.value) || 4;
      st.curEnd = tr.t + sec;
      st.ahead = [];
      for (let k = 1; k <= 2 && events.length > 1; k++) {
        const fm = K.hzToMidi(global.VT_NOTE_FREQ?.[events[(ei + k) % events.length]]);
        if (fm != null) st.ahead.push({ t0: tr.t + k * sec, t1: tr.t + (k + 1) * sec, midi: fm, name: K.noteName(fm) });
      }
    },
    /** Without the note hook (chord mode, a single reference): follow the target. */
    _targetFallback(frame) {
      const st = this.state;
      const K = this._kit();
      const f = frame.targetFreq || 0;
      if (st.gotNoteHook || !(f >= 80) || Math.abs(f - (st.lastTgt || 0)) < 0.5) return;
      st.lastTgt = f;
      const midi = K.hzToMidi(f);
      const list = st.targets;
      const last = list[list.length - 1];
      if (last && last.t1 == null) last.t1 = st.track.t;
      list.push({ t0: st.track.t, t1: null, midi, name: K.noteName(midi) });
      if (list.length > 200) list.shift();
    },
    _say(now) {
      const K = this._kit();
      const st = this.state;
      if (!K || !st.track) return;
      const w = K.sovtWords(this._model());
      if (this.$("[data-status]")) this.$("[data-status]").textContent = w.head;
      if (this.$("[data-ev]")) this.$("[data-ev]").textContent = w.head;
      this.viz?.caption?.(w.head, now ? 0 : 2500);
    },
    onStart() {
      const st = this.state;
      st.review = false;
      this.hud?.classList.remove("is-replay");
      st.track?.reset();
      if (st.track) st.track.setOnTags(st.step === "vowel" ? [this._kit().T.TONE] : this._flowTags());
      st.targets = [];
      st.ahead = [];
      st.flowPrev = 0;
      st.onMark = 0;
      st.gotNoteHook = false;
      st.lastTgt = 0;
      st.match = { sec: 0, diff: null, ok: false };
      const P = global.VTPiano;
      if (P && st.track) {
        this._onNote = (note, chord, ei, prog) => this._pianoNote(note, ei, prog);
        P.onNoteChange = this._onNote;
      }
      this.viz?.draw();
    },
    onFrame(frame) {
      const st = this.state;
      const tr = st.track;
      const K = this._kit();
      if (!tr || !K || st.review) return;
      const T = K.T;
      const before = tr.tag;
      tr.feed(frame);
      this._targetFallback(frame);
      const dt = global.VTFeatures.frameDt(frame);
      if (st.step === "vowel" && st.refMidi != null && tr.tag === T.TONE && tr.smoothMidi != null) {
        let d = tr.smoothMidi - st.refMidi;
        d -= 12 * Math.round(d / 12);
        // The detector reads a lip trill 30–60 cents sharp and an open vowel
        // true, so the /A/ may sit a little under the trill's reading
        const lo = st.straw ? -0.6 : -1.1;
        const hi = st.straw ? 0.6 : 0.7;
        st.match.diff = d;
        st.match.ok = d >= lo && d <= hi;
        if (st.match.ok) st.match.sec += dt;
      } else if (tr.tag !== T.TONE) {
        st.match.diff = null;
        st.match.ok = false;
      }
      const run = this.$("[data-run]");
      if (run) {
        const txt = tr.runLen.toFixed(1);
        if (run.textContent !== txt) run.textContent = txt;
      }
      if (before !== tr.tag) this._say(false);
      this._paceDraw(dt, before !== tr.tag);
    },
    onStop() {
      const st = this.state;
      const P = global.VTPiano;
      if (P && this._onNote && P.onNoteChange === this._onNote) P.onNoteChange = null;
      const tr = st.track;
      const V = global.VTViz;
      if (!tr || !V) return { patches: {}, summary: "" };
      const last = st.targets[st.targets.length - 1];
      if (last && last.t1 == null) last.t1 = tr.t;
      st.review = true;
      this.hud?.classList.add("is-replay");
      this._say(true);
      this.viz?.draw();
      const K = this._kit();
      const patches = {};
      // Measured minutes of the asked-for sound (the flutter, or the tone
      // through the straw). Ease, steadiness and the transfer stay the
      // learner's own ratings.
      const flowSec = this._flowSec();
      if (flowSec >= 30) patches[st.straw ? "minutes" : "duration"] = Math.max(1, Math.round(flowSec / 60));
      if (!tr.heard) {
        return {
          patches,
          summary: st.straw
            ? L("Sin sonido todavía — canta suave por la pajita", "No sound yet — sing softly into the straw")
            : L("Sin sonido todavía — empieza con un brrr sin voz", "No sound yet — start with a brrr, no voice")
        };
      }
      const best = V.fmtSec(tr.best, 1);
      const clock = K.fmtClock(flowSec);
      const same = st.match.sec >= 1.5 ? L(" · /A/ en la misma nota ✓", " · /A/ on the same note ✓") : "";
      if (st.straw) {
        const air = tr.sec[K.T.AIR];
        return {
          patches,
          summary:
            L(`Tono por la pajita ${clock} · mejor ${best}`, `Tone through the straw ${clock} · best ${best}`) +
            (air >= 1 ? L(` · solo aire ${V.fmtSec(air, 0)}`, ` · air only ${V.fmtSec(air, 0)}`) : "") +
            same
        };
      }
      const n = tr.stalls.length;
      return {
        patches,
        summary:
          L(
            `Burbujeo ${clock} · mejor racha ${best} · ${n} ${n === 1 ? "parada" : "paradas"}`,
            `Bubbling ${clock} · best run ${best} · ${n} ${n === 1 ? "stop" : "stops"}`
          ) + same
      };
    }
  });

  /** s7 humming — ten soft targets as stepping stones (not a fry-hold clone) */
  const PZ_HUM = {
    kind: "hum",
    notes: [48, 50, 52, 53, 55, 57, 55, 52, 48, 50], // C3 D3 E3 F3 G3 A3 G3 E3 C3 D3
    tol: 45,
    holdMs: 1500,
    refSec: 2.2
  };

  Modes.humTargets = baseMode({
    id: "humTargets",
    render() {
      const kit = pzKit();
      const first = kit ? kit.noteName(PZ_HUM.notes[0] + 12 * kit.octaveShift()) : "C3";
      this.state.notes = PZ_HUM.notes.slice();
      this.hud.classList.add("pz");
      this.hud.innerHTML = `
        <div class="mode-title">${L("Tarareo · objetivos suaves", "Humming · soft targets")}</div>
        <div class="mode-phase" data-n>${L("Objetivo: ", "Target: ")}${first}</div>
        <div class="mode-big" data-l>0 / ${PZ_HUM.notes.length}</div>
        <p class="mode-meta muted">${L("Sostén cada nota ~1,5 s dentro de ±45¢ para pasar a la siguiente. Tararea suave: el zumbido en los labios lo sientes tú, el micrófono no lo mide.", "Hold each note ~1.5 s within ±45¢ to move on. Hum softly: you feel the lip buzz, the mic does not measure it.")}</p>
      `;
      pzStones.idle(this, PZ_HUM);
    },
    onStart() {
      pzStones.start(this, PZ_HUM);
    },
    onFrame(frame) {
      pzStones.frame(this, frame);
    },
    onStop() {
      return pzStones.stop(this);
    }
  });

  /* —— Sirens (s5): the span you actually covered, and where the voice jumped —— */

  Modes.sirenRange = baseMode({
    id: "sirenRange",
    render() {
      this.hud.classList.add("pz");
      this.hud.innerHTML = `
        <div class="mode-title">${L("Sirena · tu rango", "Siren · your range")}</div>
        <div class="mode-big" data-r>— st</div>
        <p class="mode-meta"><span data-ext>—</span></p>
        <p class="mode-meta">${L("Sirenas", "Sirens")}: <strong data-s>0</strong>/8 · ${L("saltos", "jumps")}: <strong data-k>0</strong></p>
        <p class="mode-meta muted">${L("Una sirena cuenta al subir 5 semitonos o más y volver a bajar. No hay nota que acertar: la línea muestra hasta dónde llegas.", "A siren counts when you rise 5 semitones or more and come back down. There is no note to hit: the line shows how far you go.")}</p>
      `;
      const kit = pzKit();
      if (kit) {
        const arc = (ctx, geo) => {
          // An example siren: low, up, back down (dashed, not a target)
          const x0 = geo.plotLeft + 30;
          const x1 = geo.laneRight - 30;
          ctx.save();
          ctx.setLineDash([6, 6]);
          ctx.strokeStyle = "rgba(191, 230, 255, 0.45)";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          for (let i = 0; i <= 60; i++) {
            const u = i / 60;
            const m = 47 + 16 * Math.sin(Math.PI * u);
            const x = x0 + (x1 - x0) * u;
            const y = geo.midiToY(m);
            if (i) ctx.lineTo(x, y);
            else ctx.moveTo(x, y);
          }
          ctx.stroke();
          ctx.restore();
        };
        pzIdle(
          this,
          kit.idleCard(L("Desliza de grave a agudo y vuelve", "Glide low to high and back"), [
            L("Verás hasta dónde llegas y dónde salta la voz", "You will see how far you reach and where the voice jumps"),
            L("Por encima de ~Sol4 el micrófono solo estima (aprox.)", "Above ~G4 the mic only estimates (approx.)")
          ], arc),
          { range: { min: 43, max: 69, pad: 0, minSpan: 14 }, lanes: this._lanes(43, 69), primaryLane: false, chordBadge: false }
        );
      }
    },
    /** Reference lanes on every C and G: a map of the range, not targets. */
    _lanes(lo, hi) {
      const out = [];
      for (let m = Math.ceil(lo); m <= hi; m++) if (m % 12 === 0 || m % 12 === 7) out.push({ midi: m });
      return out;
    },
    onStart() {
      const kit = pzKit();
      if (!kit) return;
      const st = this.state;
      Object.assign(st, {
        kit,
        trace: new kit.Trace(12),
        level: pzLevel(),
        med: [],
        prevM: null,
        prevAt: 0,
        lastPitchAt: 0,
        runFrom: null,
        prevQ: 0,
        gapStart: null,
        lastBreakAt: 0,
        lastCeilAt: 0,
        s: null,
        dir: 0,
        ext: null,
        turn: null,
        legApprox: false,
        pend: null,
        runBreaks: [],
        runLo: null,
        runHi: null,
        runApprox: false,
        range: { min: 43, max: 69 },
        lastPanel: 0
      });
      st.viz = {
        trace: st.trace,
        breaks: [],
        ceil: [],
        sirens: [],
        run: null,
        goal: 8,
        lastSirenAt: 0,
        review: false,
        extent: null
      };
      pzOverlay(this, "pitchSiren", {
        game: false,
        gameFlash: false,
        trail: "none",
        primaryLane: false,
        chordLanes: false,
        targetTrail: false,
        band: false,
        chordBadge: false,
        keyboardTarget: false,
        stats: "nearest",
        pastSec: 9,
        nowAt: 0.72,
        keepOnStop: true,
        lanes: this._lanes(43, 69),
        range: { min: 43, max: 69, pad: 0, minSpan: 14 },
        headPx: kit.headPx("header")
      });
    },
    onFrame(frame) {
      const st = this.state;
      if (!st.viz || !st.kit) return;
      const kit = st.kit;
      const now = performance.now();
      const dt = clamp(frame.dtMs || 16, 0, 100);
      const rel = st.level ? st.level.feed(frame) : null;
      const f = frame.rawFreq;
      const snd = !!frame.sounding || !!f;
      let m = null;
      let q = 0;
      if (f) {
        let raw = kit.hzToMidi(f);
        // Above ~400 Hz the detector reads an octave low: a sudden octave drop
        // in the middle of a glide is folded back up and marked "aprox."
        const p = st.prevM;
        const gap = now - st.prevAt;
        if (p != null && gap < 400 && p >= 60) {
          // The glide can move ~10 semitones a second between two frames
          const tol = 3 + (10 * gap) / 1000;
          if (p - raw > 12 - tol && Math.abs(raw + 12 - p) < tol) {
            raw += 12;
            q = 1;
          }
        }
        const unfoldFlip = q !== st.prevQ;
        st.prevQ = q;
        st.med.push(raw);
        if (st.med.length > 3) st.med.shift();
        m = st.med.length === 3 ? pzMedian(st.med) : raw;
        if (m > 67) q = 1;
        if (st.gapStart != null || st.runFrom == null) st.runFrom = now;
        if (p != null && Math.max(m, p) <= 67 && now - st.lastBreakAt > 400) {
          // A jump: the line leapt in one step, in the middle of a glide (median
          // of three frames, so one stray frame is not a jump; not at an onset)
          if (now - st.prevAt < 80 && now - st.runFrom > 150 && !unfoldFlip && Math.abs(m - p) > 2.5) this._break(now, (m + p) / 2, "jump");
          // A cut: the voice dropped out for a moment mid-glide and came back near the same note
          else if (st.gapStart != null && now - st.gapStart >= 60 && now - st.gapStart <= 300 && Math.abs(m - p) < 4) this._break(st.gapStart, p, "cut");
        }
        st.gapStart = null;
        st.prevM = m;
        st.prevAt = now;
        st.lastPitchAt = now;
        const ext = st.viz.extent;
        if (!ext) st.viz.extent = { lo: m, hi: m, approx: q === 1 };
        else {
          if (m < ext.lo) ext.lo = m;
          if (m > ext.hi) {
            ext.hi = m;
            if (q === 1) ext.approx = true;
          }
        }
        st.runLo = st.runLo == null ? m : Math.min(st.runLo, m);
        st.runHi = st.runHi == null ? m : Math.max(st.runHi, m);
        if (q === 1) st.runApprox = st.legApprox = true;
        this._legs(m, dt, now);
      } else {
        st.med.length = 0;
        if (st.prevM != null && st.gapStart == null) st.gapStart = now;
        // Sound, but no pitch, right after a high note: above what the mic can measure
        if (snd && st.prevM != null && st.prevM >= 64 && now - st.lastPitchAt > 150 && now - st.lastPitchAt < 1500 && now - st.lastCeilAt > 1000) {
          st.lastCeilAt = now;
          st.viz.ceil.push(now);
          if (st.viz.ceil.length > 30) st.viz.ceil.shift();
          if (st.viz.extent) st.viz.extent.approx = true;
          st.runApprox = st.legApprox = true;
        }
        // A breath ends the glide: the leg in progress counts, then a new siren starts
        if (st.turn != null && now - st.lastPitchAt > 400) this._endGlide(now);
      }
      st.trace.push(now, m, rel, q);
      pzFollowVoice(st, frame, now);
      st.viz.run = st.runLo != null ? { lo: st.runLo, hi: st.runHi, approx: st.runApprox } : null;
      if (now - st.lastPanel > 150) {
        st.lastPanel = now;
        this._panel();
        this._fit();
      }
    },
    _break(t, m, kind) {
      const st = this.state;
      st.lastBreakAt = performance.now();
      st.viz.breaks.push({ t, m, kind });
      if (st.viz.breaks.length > 40) st.viz.breaks.shift();
      st.runBreaks.push(m);
    },
    /** Turning points on the smoothed line, with 2 semitones of hysteresis. */
    _legs(m, dt, now) {
      const st = this.state;
      st.s = st.s == null ? m : st.s + (1 - Math.exp(-dt / 150)) * (m - st.s);
      const s = st.s;
      if (st.turn == null) {
        st.turn = s;
        st.ext = s;
        st.dir = 0;
        return;
      }
      if (st.dir === 0) {
        if (s - st.turn > 2) st.dir = 1;
        else if (st.turn - s > 2) st.dir = -1;
        st.ext = s;
        return;
      }
      if (st.dir === 1) {
        if (s > st.ext) st.ext = s;
        else if (st.ext - s > 2) {
          this._leg(st.turn, st.ext, now);
          st.turn = st.ext;
          st.dir = -1;
          st.ext = s;
        }
      } else if (s < st.ext) st.ext = s;
      else if (s - st.ext > 2) {
        this._leg(st.turn, st.ext, now);
        st.turn = st.ext;
        st.dir = 1;
        st.ext = s;
      }
    },
    /** Two opposite legs of 5 semitones or more, one after the other, make a siren. */
    _leg(from, to, now) {
      const st = this.state;
      const span = Math.abs(to - from);
      const approx = st.legApprox;
      st.legApprox = false;
      if (span < 5) {
        st.pend = null;
        return;
      }
      const leg = { lo: Math.min(from, to), hi: Math.max(from, to), up: to > from, approx };
      if (st.pend && st.pend.up !== leg.up) {
        st.viz.sirens.push({
          lo: Math.min(st.pend.lo, leg.lo),
          hi: Math.max(st.pend.hi, leg.hi),
          approx: st.pend.approx || leg.approx,
          breaks: st.runBreaks.slice()
        });
        st.viz.lastSirenAt = now;
        st.pend = null;
        st.runBreaks = [];
        st.runLo = st.runHi = null;
        st.runApprox = false;
      } else st.pend = leg;
    },
    _endGlide(now) {
      const st = this.state;
      if (st.dir !== 0 && st.turn != null && st.ext != null) this._leg(st.turn, st.ext, now);
      st.dir = 0;
      st.s = null;
      st.turn = null;
      st.ext = null;
      st.pend = null;
      st.runLo = st.runHi = null;
      st.runApprox = false;
      st.runBreaks = [];
    },
    /** The Y window grows to whatever you reach (never shrinks during a take). */
    _fit() {
      const st = this.state;
      const ext = st.viz.extent;
      if (!ext) return;
      // Grow in steps with headroom, so the picture rescales rarely (each
      // rescale moves everything drawn so far)
      let lo = st.range.min;
      let hi = st.range.max;
      if (ext.lo - 2 < lo) lo = Math.max(34, Math.floor(ext.lo - 5));
      if (ext.hi + 2 > hi) hi = Math.min(79, Math.ceil(ext.hi + 5));
      if (lo === st.range.min && hi === st.range.max) return;
      st.range = { min: lo, max: hi };
      const pv = pzHighway();
      if (pv && pv.setDisplay) pv.setDisplay({ range: { min: lo, max: hi, pad: 0, minSpan: 14 }, lanes: this._lanes(lo, hi) });
    },
    _panel() {
      const st = this.state;
      const kit = st.kit;
      const ext = st.viz.extent;
      const set = (sel, t) => {
        const e = this.$(sel);
        if (e && e.textContent !== t) e.textContent = t;
      };
      if (ext) {
        set("[data-r]", `${Math.round(ext.hi - ext.lo)} st`);
        set("[data-ext]", `${kit.noteName(ext.lo)} → ${kit.noteName(ext.hi)}${ext.approx ? " " + L("(arriba aprox.)", "(top approx.)") : ""}`);
      }
      set("[data-s]", String(st.viz.sirens.length));
      set("[data-k]", String(st.viz.breaks.length));
    },
    onStop() {
      const st = this.state;
      if (!st.viz || !st.kit) return { patches: {}, summary: "" };
      const kit = st.kit;
      this._endGlide(performance.now());
      st.viz.run = null;
      st.viz.review = true;
      this._panel();
      const n = st.viz.sirens.length;
      const ext = st.viz.extent;
      const k = st.viz.breaks.length;
      const range = ext
        ? L(
            ` · de ${kit.noteName(ext.lo)} a ${kit.noteName(ext.hi)} (${kit.semis(ext.hi - ext.lo)}${ext.approx ? ", arriba aprox." : ""})`,
            ` · ${kit.noteName(ext.lo)} to ${kit.noteName(ext.hi)} (${kit.semis(ext.hi - ext.lo)}${ext.approx ? ", top approx." : ""})`
          )
        : "";
      // Only the count is measured well enough to log; smoothness and ease stay yours to rate
      return {
        patches: n > 0 ? { sirens: n } : {},
        summary: L(
          `${n} ${n === 1 ? "sirena" : "sirenas"}${range} · ${k} ${k === 1 ? "salto" : "saltos"}`,
          `${n} ${n === 1 ? "siren" : "sirens"}${range} · ${k} ${k === 1 ? "jump" : "jumps"}`
        )
      };
    }
  });

  /**
   * s8 — S, then /A/ (js/scenes/breath.js, breathLanes). The microphone can
   * time an unvoiced S (hiss with no kept pitch) and a sung /A/ (a pitch the
   * detector keeps finding, little hiss), and show how even each one's level
   * stays against its own median. It cannot hear support, ribs or air flow,
   * so nothing here scores them: the lengths are measured, and how the /A/
   * felt stays the learner's rating.
   */
  Modes.breathS = baseMode({
    id: "breathS",
    render() {
      this.state.phase = "S"; // S | A: the step being asked for
      this.state.bestS = 0;
      this.state.bestA = 0;
      this.state.cur = 0;
      this.state._airHoldFrames = 0;
      this.state._airOnset = 0;
      this.state.inhale = 0;
      this.state.review = false;
      this.state.assisted = false;
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${L("Soporte de aire · S y luego /A/", "Breath support · S then /A/")}</div>
          <button type="button" class="btn btn-ghost viz-tap" data-sw aria-pressed="false">${this._swLabel()}</button>
        </div>
        <div class="viz-words">
          <span class="mode-phase" data-phase>${this._phaseLabel()}</span>
          <span class="mode-big" data-h>0.0s</span>
          <span>${L("Mejor S <strong data-s>0</strong>s · Mejor /A/ <strong data-a>0</strong>s", "Best S <strong data-s>0</strong>s · Best /A/ <strong data-a>0</strong>s")}</span>
          <span data-say></span>
        </div>
        <p class="mode-meta muted">${L(
          "Una S sin voz, larga y pareja; respira; luego la misma duración tranquila en una /A/ cantada. Medimos cuánto dura cada una y lo pareja que suena.",
          "A long, even S with no voice; breathe; then the same easy length on a sung /A/. We time each and show how even it sounds."
        )}</p>
      `;
      this.$("[data-sw]")?.addEventListener("click", () => this._switch());
      this._mountViz();
    },
    _phaseLabel() {
      return this.state.phase === "S"
        ? L("Paso 1 · S pareja (sin voz)", "Step 1 · even S (no voice)")
        : L("Paso 2 · /A/ tan larga y tranquila como tu S", "Step 2 · /A/ as long and easy as your S");
    },
    _swLabel() {
      return this.state.phase === "S" ? L("Paso 2: /A/ →", "Step 2: /A/ →") : L("← Paso 1: S", "← Step 1: S");
    },
    _switch() {
      const st = this.state;
      st.phase = st.phase === "S" ? "A" : "S";
      if (this.$("[data-phase]")) this.$("[data-phase]").textContent = this._phaseLabel();
      const b = this.$("[data-sw]");
      if (b) {
        b.textContent = this._swLabel();
        b.setAttribute("aria-pressed", String(st.phase === "A"));
      }
      this.viz?.draw();
    },
    _kit() {
      return global.VTViz?.scenes?.breathKit || null;
    },
    _mountViz() {
      const V = global.VTViz;
      const K = this._kit();
      if (!V || !K || !V.scenes.breathLanes) return;
      this.hud.classList.add("has-viz");
      this.state.sTrack = new K.HoldTrack({ holdOffSec: 0.35 });
      this.state.aTrack = new K.HoldTrack({ holdOffSec: 0.35 });
      // After a real try: breathe in, and the next step is the other sound
      // (the button still picks the step by hand)
      this.state.sTrack.onClose = (h) => {
        if (h.len >= 1) this.state.inhale = 3;
        if (h.len >= 2 && this.state.phase === "S" && !this.state.review) this._switch();
      };
      this.state.aTrack.onClose = (h) => {
        if (h.len >= 1) this.state.inhale = 3;
        if (h.len >= 2 && this.state.phase === "A" && !this.state.review) this._switch();
      };
      this.state.gate = new K.PitchGate();
      this.viz = new V.Surface(this.hud, (ctx, w, h) => V.scenes.breathLanes(ctx, w, h, this._model()), {
        label: L(
          "Dos carriles de segundos: arriba la S sin voz (violeta), abajo la /A/ cantada (azul claro). Cada barra crece mientras suena; la línea dentro es el nivel frente a tu propia media, ±3 dB (aprox.); los cortes son huecos. La estrella marca tu mejor; la raya violeta en la /A/ es tu mejor S.",
          "Two lanes of seconds: the unvoiced S on top (violet), the sung /A/ below (light blue). Each bar grows while it sounds; the line inside is the level against your own median, ±3 dB (approx.); breaks are gaps. The star marks your best; the violet dash in the /A/ lane is your best S."
        ),
        captionHidden: true
      });
      this.viz.draw();
    },
    _model() {
      const st = this.state;
      return { s: st.sTrack, a: st.aTrack, step: st.phase, review: st.review, inhale: st.inhale, assisted: st.assisted };
    },
    onStart() {
      const st = this.state;
      st.review = false;
      this.hud?.classList.remove("is-replay");
      st.sTrack?.reset();
      st.aTrack?.reset();
      st.gate?.reset();
      st.bestS = 0;
      st.bestA = 0;
      st.cur = 0;
      st.inhale = 0;
      // The reference note Start plays reaches the mic through speakers (the
      // app asks for no echo cancellation) and would read as a sung /A/: the
      // /A/ lane stays shut while it rings. The S lane is unaffected (a piano
      // note has a kept pitch and no hiss).
      const auto = document.getElementById("chk-auto-piano");
      const ring = Number(document.getElementById("sustain-sec")?.value) || 4;
      st.refBlank = auto && auto.checked === false ? 0 : Math.min(8, ring) + 0.4;
      this.viz?.draw();
    },
    onFrame(frame) {
      const st = this.state;
      const K = this._kit();
      if (!K || !st.sTrack || st.review) return;
      const a = K.airBits(frame, st.gate);
      st.assisted = a.assisted;
      // S: air with no kept pitch, or Space. /A/: a kept pitch with little hiss.
      const hadA = !!st.aTrack.hold;
      if (st.refBlank > 0) st.refBlank -= a.dt;
      st.sTrack.feed(a.dt, a.air && !a.voiced, a.assisted, a.db);
      const v = st.aTrack.feed(a.dt, a.voiced && !a.assisted && !(st.refBlank > 0), false, a.db);
      // A sung onset is air for a moment before its pitch is caught: when the
      // /A/ starts, a short "S" just before it was that onset, not an S
      if (!hadA && st.aTrack.hold && st.sTrack.hold && !a.assisted) {
        const h = st.sTrack.hold;
        if (h.lastPresent - h.start < 0.6) st.sTrack.cancel();
      }
      st.cur = st.sTrack.hold ? st.sTrack.cur : st.aTrack.hold ? v : 0;
      st._airOnset = st.sTrack._onset;
      st._airHoldFrames = st.sTrack._off > 0 ? Math.ceil(st.sTrack._off / 0.016) : 0;
      if (!st.sTrack.hold && !st.aTrack.hold && st.inhale > 0) st.inhale = Math.max(0, st.inhale - a.dt);
      else if (st.sTrack.hold || st.aTrack.hold) st.inhale = 0;
      st.bestS = st.sTrack.best;
      st.bestA = st.aTrack.best;
      const set = (sel, txt) => {
        const el = this.$(sel);
        if (el && el.textContent !== txt) el.textContent = txt;
      };
      set("[data-h]", `${st.cur.toFixed(1)}s`);
      set("[data-s]", st.bestS.toFixed(1));
      set("[data-a]", st.bestA.toFixed(1));
      this.$("[data-h]")?.classList.toggle("is-air", !!st.sTrack.hold);
      this._paceDraw(a.dt);
    },
    /**
     * The live picture redraws about 30 times a second, painted inside the
     * engine's own frame: smooth to read, half the paint work, no extra frame.
     */
    _paceDraw(dt) {
      this._drawAcc = (this._drawAcc || 0) + dt;
      if (this._drawAcc >= 0.03) {
        this._drawAcc = 0;
        const kit = global.VTViz?.scenes?.breathKit;
        if (kit?.paintNow) kit.paintNow(this.viz);
        else this.viz?.draw();
      }
    },
    onStop() {
      const st = this.state;
      const V = global.VTViz;
      if (!st.sTrack || !V) {
        return { patches: {}, summary: "" };
      }
      st.review = true;
      st.sTrack.flush();
      st.aTrack.flush();
      st.bestS = st.sTrack.best;
      st.bestA = st.aTrack.best;
      this.hud?.classList.add("is-replay");
      this.viz?.draw();
      // Only the S is a measured length the form asks for; evenness and the
      // transfer to /A/ stay the learner's own ratings.
      const patches = {};
      if (st.bestS >= 1) patches.maxS = Math.round(st.bestS);
      const summary =
        st.bestS < 0.5 && st.bestA < 0.5
          ? L("Sin S ni /A/ todavía — una S larga y sin voz para empezar", "No S or /A/ yet — start with a long S, no voice")
          : L(`S ${V.fmtSec(st.bestS, 1)} · /A/ ${V.fmtSec(st.bestA, 1)}`, `S ${V.fmtSec(st.bestS, 1)} · /A/ ${V.fmtSec(st.bestA, 1)}`);
      const say = this.$("[data-say]");
      if (say) say.textContent = summary;
      return { patches, summary };
    }
  });

  /**
   * s15 — the SH ladder (js/scenes/breath.js, ladder): one hold at a time
   * against the goal rung, the one before as a ghost, a rest between tries.
   * A hold is timed from the engine's raw air decision (no grace window)
   * with a 0.35 s hold-off, so its length is the SH itself; a sung tone does
   * not count as air. Every rung a hold passes is cleared (the count never
   * goes back), and the hold keeps counting: nothing resets under you.
   */
  Modes.shAirLadder = baseMode({
    id: "shAirLadder",
    render() {
      this.state.rungs = this.profile.rungs || [5, 10, 20, 25, 30];
      this.state.i = 0;
      this.state.cleared = 0;
      this.state.best = 0;
      this.state.cur = 0;
      /** Mirrors of the hold gate, kept for older probes */
      this.state._airHoldFrames = 0;
      this.state._airOnset = 0;
      this.state.rest = 0;
      this.state.t = 0;
      this.state.justCleared = null;
      this.state.justAt = -99;
      this.state.review = false;
      this.state.assisted = false;
      const target = this.state.rungs[0];
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${L("Escalera de aire SH", "SH air-dosing ladder")}</div>
        </div>
        <div class="viz-words">
          <span class="mode-phase" data-ph>${L("Meta", "Target")}: <strong data-t>${target}</strong>s · ${L("SH pareja", "even SH")}</span>
          <span class="mode-big" data-h>0.0s</span>
          <span>${L("Peldaños", "Rungs")} <strong data-c>0</strong>/${this.state.rungs.length} · ${L("Mejor", "Best")} <strong data-b>0</strong>s</span>
          <span data-say></span>
        </div>
        <p class="mode-meta muted" data-airhint>${L(
          "Inhala por la nariz · exhala SH constante · sin pulsos. Si no cuenta, sube Mic o mantén Espacio.",
          "Nose inhale · steady SH · no pulses. If it won’t count, raise Mic or hold Space."
        )}</p>
      `;
      this._mountViz();
    },
    _kit() {
      return global.VTViz?.scenes?.breathKit || null;
    },
    _mountViz() {
      const V = global.VTViz;
      const K = this._kit();
      if (!V || !K || !V.scenes.ladder) return;
      this.hud.classList.add("has-viz");
      this.state.track = new K.HoldTrack({ holdOffSec: 0.35 });
      this.state.track.onClose = (h) => {
        // A rest after every real try: guidance only, it never blocks counting
        if (h.len >= 1) this.state.rest = 8;
      };
      this.state.gate = new K.PitchGate();
      this.viz = new V.Surface(this.hud, (ctx, w, h) => V.scenes.ladder(ctx, w, h, this._model()), {
        label: L(
          "Escalera SH: los peldaños arriba (dorados los superados); debajo, tu SH de ahora como una barra violeta que crece hacia la bandera verde de la meta. La línea dentro es el nivel frente a tu propia media, ±3 dB (aprox.); los cortes son huecos; lo rayado se contó con Espacio. La raya discontinua es el intento anterior.",
          "SH ladder: the rungs on top (gold once cleared); below, your SH now as a violet bar growing towards the green goal flag. The line inside is the level against your own median, ±3 dB (approx.); breaks are gaps; hatched parts were counted with Space. The dashed outline is the try before."
        ),
        captionHidden: true
      });
      this.viz.draw();
    },
    _model() {
      const st = this.state;
      return {
        track: st.track,
        rungs: st.rungs,
        cleared: st.cleared,
        i: st.i,
        rest: st.rest,
        assisted: st.assisted,
        review: st.review,
        justCleared: st.justCleared != null && st.t - st.justAt < 5 && !st.track.hold ? st.justCleared : null
      };
    },
    onStart() {
      const st = this.state;
      st.review = false;
      this.hud?.classList.remove("is-replay");
      st.track?.reset();
      st.gate?.reset();
      st.i = 0;
      st.cleared = 0;
      st.best = 0;
      st.cur = 0;
      st.rest = 0;
      st.t = 0;
      st.justCleared = null;
      this._paintWords();
      this.viz?.draw();
    },
    onFrame(frame) {
      const st = this.state;
      const K = this._kit();
      if (!K || !st.track || st.review) return;
      const a = K.airBits(frame, st.gate);
      st.t += a.dt;
      st.assisted = a.assisted;
      const tr = st.track;
      st.cur = tr.feed(a.dt, a.air, a.assisted, a.db);
      st._airOnset = tr._onset;
      st._airHoldFrames = tr._off > 0 ? Math.ceil(tr._off / 0.016) : 0;
      const h = tr.hold;
      if (h) {
        st.rest = 0;
        // Every rung this hold has passed, timed to the last moment the SH was there
        const held = h.lastPresent - h.start;
        while (st.cleared < st.rungs.length && held >= st.rungs[st.cleared]) {
          st.cleared += 1;
          st.justCleared = st.rungs[st.cleared - 1];
          st.justAt = st.t;
        }
      } else if (st.rest > 0) {
        st.rest = Math.max(0, st.rest - a.dt);
      }
      st.i = Math.min(st.cleared, st.rungs.length - 1);
      st.best = tr.best;
      this._paintWords();
      this.$("[data-h]")?.classList.toggle("is-air", !!h);
      this._paceDraw(a.dt);
    },
    /**
     * The live picture redraws about 30 times a second, painted inside the
     * engine's own frame: smooth to read, half the paint work, no extra frame.
     */
    _paceDraw(dt) {
      this._drawAcc = (this._drawAcc || 0) + dt;
      if (this._drawAcc >= 0.03) {
        this._drawAcc = 0;
        const kit = global.VTViz?.scenes?.breathKit;
        if (kit?.paintNow) kit.paintNow(this.viz);
        else this.viz?.draw();
      }
    },
    _paintWords() {
      const st = this.state;
      const set = (sel, txt) => {
        const el = this.$(sel);
        if (el && el.textContent !== txt) el.textContent = txt;
      };
      set("[data-h]", `${st.cur.toFixed(1)}s`);
      set("[data-b]", st.best.toFixed(1));
      set("[data-c]", String(st.cleared));
      set("[data-t]", String(st.rungs[st.i]));
    },
    onStop() {
      const st = this.state;
      const V = global.VTViz;
      if (!st.track || !V) return { patches: {}, summary: "" };
      st.track.flush();
      st.best = st.track.best;
      st.cur = 0;
      st.review = true;
      this.hud?.classList.add("is-replay");
      this._paintWords();
      this.viz?.draw();
      // The rungs and the longest SH are measured; how even the air felt
      // stays the learner's own rating.
      const patches = {};
      if (st.best >= 1) {
        patches.rungs = st.cleared;
        patches.maxSH = Math.round(st.best);
      }
      const n = st.rungs.length;
      const summary =
        st.best < 0.5
          ? L("Sin SH todavía — inhala por la nariz y una SH pareja", "No SH yet — breathe in through the nose, then an even SH")
          : L(`Escalera SH ${st.cleared}/${n} · mejor ${V.fmtSec(st.best, 1)}`, `SH ladder ${st.cleared}/${n} · best ${V.fmtSec(st.best, 1)}`);
      const say = this.$("[data-say]");
      if (say) say.textContent = summary;
      return { patches, summary };
    }
  });

  /**
   * s10 five-note and s16 major scale: stepping stones on three roots. Each
   * step lands when held inside ±40¢ (the green band, exactly that wide); the
   * next steps wait to the right of "now"; the root moves up after a full pass.
   */
  Modes.scaleSteps = baseMode({
    id: "scaleSteps",
    _cfg() {
      const p = this.profile || {};
      return {
        kind: "scale",
        pattern:
          p.pattern ||
          (p.majorScale ? [0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0] : [0, 2, 4, 5, 7, 5, 4, 2, 0]),
        roots: Array.isArray(p.roots) && p.roots.length ? p.roots : [p.rootMidi || 48, (p.rootMidi || 48) + 2, (p.rootMidi || 48) + 4],
        tol: p.tolCents || 40,
        holdMs: p.holdMs || 700,
        refSec: 1.6,
        intonation: !!p.majorScale
      };
    },
    render() {
      const cfg = this._cfg();
      const nSteps = cfg.pattern.length;
      const title = this.profile.majorScale
        ? L("Escala mayor · coordinación", "Major scale · coordination")
        : L("Escala de 5 notas · con afinación", "Five-note scale · pitch-gated");
      this.hud.classList.add("pz");
      this.hud.innerHTML = `
        <div class="mode-title">${title}</div>
        <div class="mode-big" data-step>${L("Paso", "Step")} 1 / ${nSteps}</div>
        <p class="mode-meta">${L("Raíces", "Roots")}: <strong data-r>0</strong> · ${L("notas fijadas", "notes locked")}: <strong data-k>0</strong></p>
        <p class="mode-meta muted" data-st>${L(
          `Escucha, luego canta: cada paso cuenta al sostenerlo ${pzSec(cfg.holdMs / 1000)} dentro de ±${cfg.tol}¢. Tras cada pasada la raíz sube un tono.`,
          `Listen, then sing: each step counts once held ${pzSec(cfg.holdMs / 1000)} within ±${cfg.tol}¢. After each pass the root moves up a tone.`
        )}</p>
      `;
      pzStones.idle(this, cfg);
    },
    onStart() {
      pzStones.start(this, this._cfg());
    },
    onFrame(frame) {
      pzStones.frame(this, frame);
    },
    onStop() {
      return pzStones.stop(this);
    }
  });

  /**
   * s11 messa di voce — "Regulador". Your level in dB against your own soft
   * start, drawn against a hairpin that waits for you and then scrolls in from
   * the right; under it your pitch against the note you started on, so a
   * pitch that rides up with the volume shows as a bend under the peak.
   *
   * A swell counts from its shape: at least 6 dB up from your start and 6 dB
   * back down, with the peak in the middle. Nothing is absolute: the MIC
   * slider, the distance and the device do not move it (level is read before
   * the slider's gain and against your own start).
   */
  Modes.dynamicSwell = baseMode({
    id: "dynamicSwell",
    render() {
      const st = this.state;
      st.target = this.profile.targetSwells || 6;
      // A length picked before Start outlives the fresh mount (see _mem)
      st.D = this._mem().D || this.profile.swellSec || 7;
      this._resetSwell();
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${L("Regulador: crece y vuelve", "Swell: grow and return")}</div>
          <button type="button" class="btn btn-ghost viz-tap" data-len aria-label="${L(
            "Duración de cada regulador",
            "Length of each swell"
          )}">${this._lenLabel()}</button>
        </div>
        <div class="viz-words">
          <span class="mode-phase" data-phase>${L("Empieza suave cuando quieras", "Start soft when you're ready")}</span>
          <strong class="mode-big" data-s>0</strong>
          <span data-w>—</span>
        </div>
        <p class="mode-meta muted">${L(
          "Volumen en dB frente a tu propio inicio suave; afinación frente a la nota con que empiezas.",
          "Level in dB against your own soft start; pitch against the note you start on."
        )}</p>
      `;
      this.$("[data-len]")?.addEventListener("click", () => {
        const opts = [6, 7, 8, 10];
        st.D = opts[(opts.indexOf(st.D) + 1) % opts.length] || 7;
        this._mem().D = st.D;
        const b = this.$("[data-len]");
        if (b) b.textContent = this._lenLabel();
        this.viz?.draw();
      });
      this._mountViz();
    },
    /**
     * What outlives one take: the app mounts a fresh copy of the mode on every
     * Start (VTPracticeModes.get), so choices are kept on the registered mode.
     */
    _mem() {
      const M = Modes.dynamicSwell;
      if (!M._kept) M._kept = {};
      return M._kept;
    },
    /** dB and cents in words, with the language's decimal mark (js/scenes/dynamics.js). */
    _fmt() {
      return global.VTViz?.scenes?.dynFmt || { db: (n) => `${Math.round(n)} dB`, cents: (n) => `${Math.round(n)}¢` };
    },
    _lenLabel() {
      // No break between the number and its unit on a narrow button
      return L(`Duración ${this.state.D}\u00a0s`, `Length ${this.state.D}\u00a0s`);
    },
    _resetSwell() {
      const st = this.state;
      st.t = 0;
      st.LO = -6;
      st.hi = 16;
      st.H = 10; // the hairpin's height, fitted to your own swells as you go
      st.swells = 0;
      st.done = [];
      st.hairpins = [];
      st.cur = null;
      st.lastEnd = null;
      st.sm = null;
      st.floorRing = global.VTFeatures ? new global.VTFeatures.Ring(240) : null;
      st.floorDb = null;
      st.floorRel = null;
      st.processed = false;
      st.clipped = false;
      st.review = false;
      st.lastWords = "";
      st.pitch = global.VTFeatures ? new global.VTFeatures.StablePitch() : null;
    },
    _mountViz() {
      const V = global.VTViz;
      const F = global.VTFeatures;
      if (!V || !F || !V.scenes.swell) return;
      const st = this.state;
      this.hud.classList.add("has-viz");
      this.viz = new V.Surface(this.hud, (ctx, w, h) => V.scenes.swell(ctx, w, h, st), {
        label: L(
          "Regulador: la banda verde es la forma a seguir, suave, crece hasta el centro y vuelve; tu línea azul es tu volumen en dB frente a tu propio inicio. Debajo, tu afinación frente a la nota con que empezaste.",
          "Swell: the green band is the shape to follow, soft, growing to the middle and back; your blue line is your level in dB against your own start. Below, your pitch against the note you started on."
        ),
        captionHidden: true
      });
      const common = { seconds: 14, nowAt: 0.6, minPxPerSec: 18, hz: 30 };
      st.level = new V.Timeline(this.viz, {
        ...common,
        top: L("más fuerte", "louder"),
        bottom: "",
        guide: (t) => this._guide(t)
      });
      st.cents = new V.Timeline(this.viz, {
        ...common,
        top: "+50¢",
        bottom: "−50¢",
        tagColors: { 1: V.C.warn },
        guide: (t) => (this._hairpinAt(t) ? { y: 0.5, lo: 0.35, hi: 0.65 } : null)
      });
      this._words();
      this.viz.draw();
    },
    /** The dB scale of the level track, 0..1. */
    _norm(db) {
      const st = this.state;
      return (db - st.LO) / (st.hi - st.LO);
    },
    /** Past and current hairpins sit where you sang them; the next one waits for you. */
    _hairpinAt(t) {
      const st = this.state;
      for (let i = st.hairpins.length - 1; i >= 0; i--) {
        const hp = st.hairpins[i];
        if (t >= hp.t0 && t <= hp.t0 + hp.D) return hp;
      }
      const rest = 2.5;
      const next = st.cur
        ? Math.max(st.cur.t0 + st.cur.D, st.t) + rest
        : Math.max(st.lastEnd != null ? st.lastEnd + rest : 0, st.t + 0.35);
      if (t >= next && t <= next + st.D) return { t0: next, D: st.D, H: st.H, next: true };
      return null;
    },
    _guide(t) {
      const hp = this._hairpinAt(t);
      if (!hp) return null;
      const u = (t - hp.t0) / hp.D;
      const c = (hp.H * (1 - Math.cos(2 * Math.PI * u))) / 2;
      return { y: this._norm(c), lo: this._norm(c - 2.5), hi: this._norm(c + 2.5) };
    },
    /** Grow the scale when a swell goes past the top (the drawn line is rescaled with it). */
    _growScale(rel) {
      const st = this.state;
      if (rel < st.hi - 1.5) return;
      const hi = Math.min(40, Math.ceil((rel + 4) / 2) * 2);
      if (hi <= st.hi) return;
      const k = (st.hi - st.LO) / (hi - st.LO);
      const v = st.level?.value?.v;
      if (v) for (let i = 0; i < v.length; i++) if (!Number.isNaN(v[i])) v[i] *= k;
      st.hi = hi;
    },
    _startSwell() {
      const st = this.state;
      st.cur = { t0: st.t, D: st.D, H: st.H, last: st.t, lv: [], pv: [], base: null, f0: null, peak: -99, peakT: st.t };
      st.hairpins.push({ t0: st.t, D: st.D, H: st.H });
      if (st.hairpins.length > 12) st.hairpins.shift();
      st.pitch?.reset();
    },
    _endSwell() {
      const f = this._fmt();
      const st = this.state;
      const c = st.cur;
      st.cur = null;
      st.lastEnd = c.last;
      const dur = c.last - c.t0;
      if (dur < 1.5 || c.base == null) {
        // A cough or a false start: no swell, and no hairpin left behind
        const i = st.hairpins.findIndex((hp) => hp.t0 === c.t0);
        if (i >= 0) st.hairpins.splice(i, 1);
        return;
      }
      const V = global.VTViz;
      const F = global.VTFeatures;
      const tail = c.lv.filter((p) => p.t >= c.last - 0.9 && p.t <= c.last - 0.2).map((p) => p.rel);
      const endRel = tail.length ? F.median(tail) : c.lv[c.lv.length - 1].rel;
      const rise = c.peak;
      const fall = c.peak - endRel;
      const peakFrac = clamp((c.peakT - c.t0) / dur, 0, 1);
      const near = c.pv.filter((p) => Math.abs(p.t - c.peakT) <= 0.45 && p.c != null).map((p) => p.c);
      const peakCents = near.length >= 5 ? near.reduce((a, b) => a + b, 0) / near.length : null;
      // Largest change over 100 ms: a step instead of a slope
      let jump = 0;
      for (let i = 0, j = 0; i < c.lv.length; i++) {
        while (j < c.lv.length && c.lv[j].t - c.lv[i].t < 0.1) j++;
        if (j < c.lv.length && c.lv[i].t > c.t0 + 0.2 && c.lv[j].t < c.last - 0.2) {
          jump = Math.max(jump, Math.abs(c.lv[j].rel - c.lv[i].rel));
        }
      }
      const minRise = st.processed ? 3 : 6;
      const counted = rise >= minRise && fall >= minRise && peakFrac >= 0.2 && peakFrac <= 0.8;
      // A 48-point outline of the level for the review card, without the
      // first and last 120 ms (the edge from and back into silence)
      const shape = [];
      const edge = Math.min(0.12, dur / 10);
      for (let k = 0; k < 48; k++) {
        const t = c.t0 + edge + (k / 47) * (dur - 2 * edge);
        let best = null;
        let bd = 1e9;
        for (const p of c.lv) {
          const d = Math.abs(p.t - t);
          if (d < bd) {
            bd = d;
            best = p;
          }
        }
        shape.push(best && bd < 0.2 ? best.rel : NaN);
      }
      const rec = { t0: c.t0, t1: c.last, dur, rise, fall, peakFrac, peakCents, jump, counted, H: c.H, D: c.D, shape };
      st.done.push(rec);
      if (counted) {
        st.swells += 1;
        const s = this.$("[data-s]");
        if (s) s.textContent = String(st.swells);
      }
      // The next hairpin fits the swells you actually sing
      st.H = clamp(Math.round(0.6 * st.H + 0.4 * rise), 8, 20);
      st.level?.mark(`${counted ? "✓ " : ""}${f.db(rise)}`, { at: c.last, color: counted ? V.C.done : V.C.muted });
      if (peakCents != null && Math.abs(peakCents) >= 20) {
        st.cents?.mark((peakCents > 0 ? "↑ " : "↓ ") + f.cents(peakCents), { at: c.peakT, color: V.C.warn });
      }
      if (peakCents != null) {
        const w = this.$("[data-w]");
        if (w) w.textContent = f.cents(peakCents);
      }
      const words =
        L(`Regulador: subió ${f.db(rise)}, pico al ${Math.round(peakFrac * 100)} %`, `Swell: rose ${f.db(rise)}, peak at ${Math.round(peakFrac * 100)}%`) +
        (peakCents != null ? L(`, afinación en el pico ${f.cents(peakCents)}`, `, pitch at the peak ${f.cents(peakCents)}`) : "");
      this.viz?.caption(words, 0);
      st.lastWords = words;
    },
    /** Words for now: the headline, the count, and the last swell. */
    _words() {
      const f = this._fmt();
      const st = this.state;
      let head;
      if (st.cur) {
        const u = (st.t - st.cur.t0) / st.cur.D;
        head =
          u < 0.12
            ? L("Suave… empieza a crecer", "Soft… start to grow")
            : u < 0.42
              ? L("Crece poco a poco", "Grow little by little")
              : u < 0.58
                ? L("Arriba: la afinación quieta", "At the top: keep the pitch still")
                : u < 1
                  ? L("Vuelve suave hasta el final", "Ease back down to the end")
                  : L("Termina suave y respira", "Finish soft, then breathe");
      } else if (st.done.length && st.t - (st.lastEnd || 0) < 2.5) {
        const d = st.done[st.done.length - 1];
        head = d.counted
          ? L(`✓ Subiste ${f.db(d.rise)} y volviste`, `✓ Up ${f.db(d.rise)} and back`)
          : d.rise < (st.processed ? 3 : 6)
            ? L(`Subiste ${f.db(d.rise)}: puedes crecer más`, `Rose ${f.db(d.rise)}: room to grow`)
            : d.fall < (st.processed ? 3 : 6)
              ? L("Subiste; la vuelta quedó arriba", "Up, but the return stayed high")
              : L("El pico llegó muy al borde", "The peak came at the very edge");
      } else {
        head = st.done.length ? L("Respira… y otra vez desde suave", "Breathe… and again from soft") : L("Empieza suave cuando quieras", "Start soft when you're ready");
      }
      const big = `${st.swells}/${st.target}`;
      const last = st.done[st.done.length - 1];
      const sub = last
        ? L(`Último: ${f.db(last.rise)} · pico al ${Math.round(last.peakFrac * 100)} %`, `Last: ${f.db(last.rise)} · peak at ${Math.round(last.peakFrac * 100)}%`) +
          (last.peakCents != null ? L(` · afinación ${f.cents(last.peakCents)}`, ` · pitch ${f.cents(last.peakCents)}`) : "")
        : L("La banda espera a que empieces; dura lo que marca el botón.", "The band waits for you to start; it lasts what the button says.");
      // A rotated phone has no room for the pitch track: the pitch goes in words
      const cn = st.centsNow;
      const headLine = st.tiny && cn != null ? `${head} · ${L("afin.", "pitch")} ${f.cents(cn)}` : head;
      st.level?.setText(headLine, big, sub);
      const cnow = st.centsNow;
      st.cents?.setText(L("Afinación frente a tu inicio", "Pitch against your start"), cnow != null ? f.cents(cnow) : "—", "");
      const ph = this.$("[data-phase]");
      if (ph && ph.textContent !== head) ph.textContent = head;
    },
    onStart() {
      const st = this.state;
      const D = st.D;
      this._resetSwell();
      st.D = D;
      this.hud?.classList.remove("is-replay");
      st.level?.reset();
      st.cents?.reset();
      const s = this.$("[data-s]");
      if (s) s.textContent = "0";
      this._words();
    },
    onFrame(frame) {
      const st = this.state;
      const F = global.VTFeatures;
      if (!F || !st.level || st.review) return;
      const dt = F.frameDt(frame);
      st.t += dt;
      const snd = !!frame.sounding && !frame.manualSound;
      // Before the MIC slider's gain, so the slider does not move you
      const db = Math.max(-100, F.dbfs((frame.rms || 0) / (frame.inputGain || 1)));
      const a = 1 - Math.exp(-(dt * 1000) / 120);
      st.sm = st.sm == null ? db : st.sm + a * (db - st.sm);
      st.processed = !!frame.processedInput;
      if (!snd && st.floorRing && db > -100) {
        st.floorRing.push(db);
        if (st.floorRing.count >= 20) st.floorDb = F.percentile(st.floorRing.last(), 0.2);
      }
      if (frame.buf && snd) {
        let pk = 0;
        const b = frame.buf;
        for (let i = 0; i < b.length; i += 2) pk = Math.max(pk, Math.abs(b[i]));
        if (pk / (frame.inputGain || 1) >= 0.98) st.clipped = true;
      }
      // Segment swells on the raw sound edge, bridging only 300 ms
      if (snd) {
        if (!st.cur) {
          this._startSwell();
          st.sm = db; // do not carry the silence into the new note
        }
        st.cur.last = st.t;
      } else if (st.cur && st.t - st.cur.last >= 0.3) {
        this._endSwell();
      }
      const c = st.cur;
      let lv = null;
      let cv = null;
      let tag = 0;
      if (c) {
        const age = st.t - c.t0;
        // Your soft start: the median level 0.2–0.7 s into the note (the
        // attack is not the start). Until then, the note so far.
        if (snd && age <= 0.7) {
          c._early = c._early || [];
          c._early.push({ age, db });
          const settled = c._early.filter((p) => p.age >= 0.2).map((p) => p.db);
          c.base = F.median(settled.length >= 3 ? settled : c._early.map((p) => p.db));
        }
        const base = c.base != null ? c.base : st.sm;
        const rel = st.sm - base;
        if (snd) {
          c.lv.push({ t: st.t, rel });
          if (c.lv.length > 1200) c.lv.shift();
          if (age > 0.7 && rel > c.peak) {
            c.peak = rel;
            c.peakT = st.t;
          }
          this._growScale(rel);
          lv = this._norm(rel);
        }
        st.floorRel = st.floorDb != null ? st.floorDb - base : null;
        // Pitch against the note you started on, averaged over ~2 vibrato cycles
        const midi = snd && frame.rawFreq ? st.pitch.feed(frame) : (st.pitch.feed({ rawFreq: null }), null);
        if (midi != null) {
          if (age >= 0.2 && age <= 0.9) {
            c._f = c._f || [];
            c._f.push(midi);
            c.f0 = F.median(c._f);
          }
          if (c.f0 != null) {
            c._cw = c._cw || [];
            c._cw.push({ t: st.t, c: (midi - c.f0) * 100 });
            while (c._cw.length && st.t - c._cw[0].t > 0.33) c._cw.shift();
            const mean = c._cw.reduce((s2, p) => s2 + p.c, 0) / c._cw.length;
            // Soft tails near the floor lose pitch: no line there rather than a wrong one
            if (rel > -3) {
              cv = clamp(0.5 + mean / 100, 0, 1);
              tag = Math.abs(mean) > 20 ? 1 : 0;
              c.pv.push({ t: st.t, c: mean });
              if (c.pv.length > 1200) c.pv.shift();
              st.centsNow = mean;
            }
          }
        } else if (!snd) st.centsNow = null;
      } else {
        st.centsNow = null;
        st.pitch?.reset();
      }
      st.level.push(dt, lv, 0);
      st.cents.push(dt, cv, tag);
      this._words();
    },
    onStop() {
      const f = this._fmt();
      const st = this.state;
      if (st.cur) this._endSwell();
      st.review = true;
      if (this.viz) {
        this.hud.classList.add("is-replay");
        this.viz.draw();
      }
      const counted = st.done.filter((s) => s.counted);
      const pk = st.done.map((s) => s.peakCents).filter((c) => c != null);
      const patches = {};
      if (st.swells > 0) patches.swells = st.swells;
      // Pitch stability is measured (the pitch at each peak against its own
      // start); dynamic control is left to the learner's own rating
      if (pk.length) {
        const med = global.VTViz.median(pk.map((c) => Math.abs(c)));
        patches.pitchStable = med <= 10 ? 5 : med <= 20 ? 4 : med <= 35 ? 3 : med <= 50 ? 2 : 1;
      }
      const medRise = counted.length ? global.VTViz.median(counted.map((s) => s.rise)) : null;
      const medPk = pk.length ? global.VTViz.median(pk) : null;
      return {
        patches,
        summary: L(
          `${st.swells} ${st.swells === 1 ? "regulador" : "reguladores"}` +
            (medRise != null ? ` · subida mediana ${f.db(medRise)}` : "") +
            (medPk != null ? ` · afinación en el pico ${f.cents(medPk)}` : ""),
          `${st.swells} ${st.swells === 1 ? "swell" : "swells"}` +
            (medRise != null ? ` · median rise ${f.db(medRise)}` : "") +
            (medPk != null ? ` · pitch at the peak ${f.cents(medPk)}` : "")
        )
      };
    }
  });

  /**
   * s14 sung staccato vs legato — "Rollo de articulación". The difference is
   * in the gaps, not the notes. Every stretch of sound is cut from the raw
   * sound edge (frame.sounding, 40 ms hangover) and trimmed with the fast
   * envelope to where it falls 15 dB under its own peak, so neither room echo
   * nor the engine's silence bridge (voiced/voiceFreq hold ~1.1 s) joins two
   * staccato notes. Notes inside a stretch are pitch steps; a legato line that
   * stops for a moment is a break, drawn as a notch with a word, never red.
   */
  Modes.staccatoLegato = baseMode({
    id: "staccatoLegato",
    render() {
      const st = this.state;
      const raw =
        this.profile.phases && this.profile.phases.length
          ? this.profile.phases
          : [
              { label: L("Staccato", "Staccato"), sec: 90, kind: "staccato" },
              { label: L("Legato", "Legato"), sec: 90, kind: "legato" }
            ];
      st.phases = raw.map((p) => ({
        label: p.label,
        sec: p.sec || 60,
        kind: p.kind || (/legato/i.test(p.label || "") ? "legato" : "staccato"),
        round: p.round !== false,
        startT: null
      }));
      // What the picture asks of the state
      st.notesOf = (r) => this._notesOf(r);
      st.stats = (i) => this._stats(i);
      st.pitchOffset = () => this._pitchOffset();
      this._reset();
      const p0 = st.phases[st.phaseIdx];
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${L("Staccato y legato (cantado)", "Staccato and legato (sung)")}</div>
          <button type="button" class="btn btn-ghost viz-tap" data-next-phase>${L("Siguiente fase", "Next phase")}</button>
        </div>
        <div class="viz-words">
          <span class="mode-phase" data-phase>${p0.label}</span>
          <strong class="mode-big" data-remain>${Math.ceil(p0.sec)}s</strong>
          <span>${L("Notas cortas (&lt;0,45 s):", "Short notes (&lt;0.45 s):")} <strong data-sh>0</strong> · ${L(
            "Largas (≥1,2 s):",
            "Long (≥1.2 s):"
          )} <strong data-lg>0</strong></span>
        </div>
        <p class="mode-meta muted">${L(
          "Staccato: rebote de aire, no golpe de garganta. Legato: aire constante que une las notas.",
          "Staccato: a bounce of air, not a throat hit. Legato: steady air that joins the notes."
        )}</p>
      `;
      this.$("[data-next-phase]")?.addEventListener("click", () => {
        if (st.live) {
          if (!st.allDone) this._nextPhase();
        } else {
          // Not live: choose the phase the next take begins with
          const cur = st.review ? this._mem().resume || 0 : st.phaseIdx;
          this._mem().resume = (cur + 1) % st.phases.length;
          if (st.review) {
            const label = st.phases[this._mem().resume].label;
            const ph = this.$("[data-phase]");
            if (ph) ph.textContent = label;
            this.viz?.caption(L(`La próxima toma empieza en: ${label}`, `The next take starts at: ${label}`), 0);
          } else {
            this._reset();
            this._words();
          }
        }
        this.viz?.draw();
      });
      this._mountViz();
    },
    /**
     * What outlives one take: the app mounts a fresh copy of the mode on every
     * Start (VTPracticeModes.get), so choices are kept on the registered mode.
     */
    _mem() {
      const M = Modes.staccatoLegato;
      if (!M._kept) M._kept = {};
      return M._kept;
    },
    _reset() {
      const st = this.state;
      const F = global.VTFeatures;
      // A new take goes on from the phase the last one stopped in
      const start = clamp(this._mem().resume || 0, 0, st.phases.length - 1);
      st.t = 0;
      st.phaseIdx = start;
      st.remaining = st.phases[start].sec;
      st.phaseKind = st.phases[start].kind;
      st.phases.forEach((p, i) => (p.startT = i === start ? 0 : null));
      st.allDone = false;
      st.lastNow = null;
      st.runs = [];
      st.open = null;
      st.lastSnd = -1;
      st.waitLoud = null;
      st.short = 0;
      st.long = 0;
      st.medMidi = null;
      st.processed = false;
      st.review = false;
      st.bufMs = 43;
      st.env = F ? new F.Envelope({ keepSec: 3 }) : null;
    },
    _mountViz() {
      const V = global.VTViz;
      if (!V || !global.VTFeatures || !V.scenes.articulation) return;
      const st = this.state;
      this.hud.classList.add("has-viz");
      this.viz = new V.Surface(this.hud, (ctx, w, h) => V.scenes.articulation(ctx, w, h, st), {
        label: L(
          "Rollo de articulación: cada nota que cantas es una píldora tan larga como sonó, a la altura de su tono; los huecos son silencios reales. Delante del ahora, la forma de la fase: staccato, notas cortas separadas; legato, una línea unida.",
          "Articulation roll: each note you sing is a pill as long as it sounded, at the height of its pitch; the gaps are real silences. Ahead of now, the shape of the phase: staccato, short separate notes; legato, one joined line."
        )
      });
      this.viz.draw();
    },
    _nextPhase() {
      const st = this.state;
      if (st.open) this._closeRun(st.open, st.lastSnd);
      st.phaseIdx += 1;
      if (st.phaseIdx >= st.phases.length) {
        st.phaseIdx = st.phases.length - 1;
        st.allDone = true;
        st.remaining = 0;
      } else {
        const p = st.phases[st.phaseIdx];
        p.startT = st.t;
        st.remaining = p.sec;
        st.phaseKind = p.kind;
        if (global.VTToast) global.VTToast(p.label);
        this.viz?.caption(
          p.kind === "legato"
            ? L("Ahora legato: une las notas sin parar el sonido", "Now legato: join the notes without stopping the sound")
            : L("Ahora staccato: notas cortas, silencio entre ellas", "Now staccato: short notes, silence between"),
          2500
        );
      }
      this._words();
    },
    _words() {
      const st = this.state;
      const ph = this.$("[data-phase]");
      if (ph) ph.textContent = st.allDone ? L("Contraste listo", "Contrast complete") : st.phases[st.phaseIdx].label;
      const rem = this.$("[data-remain]");
      if (rem) rem.textContent = st.allDone ? "✓" : `${Math.ceil(Math.max(0, st.remaining))}s`;
      const b = this.$("[data-next-phase]");
      if (b) b.disabled = !!st.allDone;
    },
    /** Envelope index → the take's clock. */
    _tOfIdx(idx) {
      const E = this.state.env;
      return this.state.t - (E.total - 1 - idx) / E.rate;
    },
    /**
     * The attack of a run from the fast envelope: where it really started and
     * how fast it rose. A rise under ~14 ms is a hammer (a glottal "slap"),
     * unless frames were dropped and the attack was not seen.
     */
    _attack(run) {
      const st = this.state;
      const E = st.env;
      run.attackDone = true;
      if (!E || !E.total) return;
      const rate = E.rate;
      const back = Math.round(0.04 * rate);
      const since = E.total - run.startTotal + back;
      const seg = E.window(since / rate);
      if (seg.length < since || seg.length < back + 8) return;
      const n = Math.min(seg.length, back + Math.round(0.12 * rate));
      const head = seg.slice(0, back);
      const noise = global.VTFeatures.percentile(head, 0.2) || 0;
      let peak = 0;
      for (let i = 0; i < n; i++) peak = Math.max(peak, seg[i]);
      if (peak <= noise * 1.5) return;
      const lo = noise + (peak - noise) * 0.1;
      const hi = noise + (peak - noise) * 0.9;
      let i10 = -1;
      let i90 = -1;
      for (let i = 0; i < n; i++) {
        if (i10 < 0 && seg[i] >= lo) i10 = i;
        if (i10 >= 0 && seg[i] >= hi) {
          i90 = i;
          break;
        }
      }
      if (i10 < 0 || i90 < 0) return;
      run.t0 = Math.min(run.t0, this._tOfIdx(run.startTotal - back + i10));
      run.riseMs = ((i90 - i10) * 1000) / rate;
      run.hammer = run.maxDt > st.bufMs + 6 ? null : run.riseMs <= 14;
    },
    /** Where the sound really ended: the last moment within 15 dB of its peak. */
    _release(run, lastSnd) {
      const st = this.state;
      const E = st.env;
      if (!E || !E.total || !run.peakRms) return lastSnd;
      const look = Math.max(0.05, st.t - lastSnd + 0.25);
      const seg = E.window(look);
      const thr = run.peakRms * 0.178;
      let idx = -1;
      for (let i = seg.length - 1; i >= 0; i--) {
        if (seg[i] >= thr) {
          idx = i;
          break;
        }
      }
      if (idx < 0) return lastSnd;
      const t = this._tOfIdx(E.total - seg.length + idx);
      return clamp(t, lastSnd - 0.08, lastSnd + 0.02);
    },
    _closeRun(run, lastSnd, cutAt) {
      const st = this.state;
      st.open = null;
      if (!run.attackDone) this._attack(run);
      run.t1 = Math.max(run.t0 + 0.02, cutAt != null ? cutAt : this._release(run, lastSnd));
      const len = run.t1 - run.t0;
      if (len < 0.06) {
        // A click, not a note
        const i = st.runs.indexOf(run);
        if (i >= 0) st.runs.splice(i, 1);
        return;
      }
      if (len >= 0.08 && len < 0.45) st.short += 1;
      if (len >= 1.2) st.long += 1;
      run.notes = null;
      run.notes = this._segment(run);
      // A legato line that thins out: the deepest dip under its own middle level
      if (len >= 0.8) {
        const inner = run.samples.filter((s) => s.t > run.t0 + 0.15 && s.t < run.t1 - 0.15).map((s) => s.db);
        if (inner.length >= 8) {
          const mid = global.VTFeatures.median(inner);
          let dip = 0;
          for (let i = 2; i < inner.length - 2; i++) {
            const sm = global.VTFeatures.median(inner.slice(i - 2, i + 3));
            dip = Math.max(dip, mid - sm);
          }
          run.dip = dip;
        }
      }
      const mids = [];
      for (let k = st.runs.length - 1; k >= 0 && mids.length < 40; k--) {
        (st.runs[k].notes || []).forEach((nt) => {
          if (nt.midi != null) mids.push(nt.midi);
        });
      }
      if (mids.length) st.medMidi = global.VTFeatures.median(mids);
      const sh = this.$("[data-sh]");
      if (sh) sh.textContent = String(st.short);
      const lg = this.$("[data-lg]");
      if (lg) lg.textContent = String(st.long);
    },
    /**
     * A run's notes: a new note when the pitch moves more than 0.8 semitone and
     * stays moved for four frames. A note's pitch is the median of its middle
     * 60 %, only for notes of 120 ms or more (none is better than a wrong one).
     * Short pieces between two notes are the way from one to the other: a
     * slide when that takes longer than a quarter second.
     */
    _segment(run) {
      const S = run.samples;
      const t1 = run.t1 != null ? run.t1 : this.state.t;
      const med = global.VTFeatures.median;
      const sm = S.map((s, i) => {
        if (s.midi == null) return null;
        const w = [];
        for (let j = Math.max(0, i - 2); j <= Math.min(S.length - 1, i + 2); j++) if (S[j].midi != null) w.push(S[j].midi);
        return w.length >= 2 ? med(w) : s.midi;
      });
      const pieces = [];
      let cur = { t0: run.t0, idx: [], ref: null };
      let pend = [];
      // A note's pitch is where it settled first: a slide must not drag it along
      const refOf = (idx) => {
        const v = idx.slice(0, 20).map((i) => sm[i]).filter((x) => x != null);
        return v.length ? med(v) : null;
      };
      for (let i = 0; i < S.length; i++) {
        const m = sm[i];
        if (m == null) {
          (pend.length ? pend : cur.idx).push(i);
          continue;
        }
        if (cur.ref == null) {
          cur.idx.push(i);
          cur.ref = m;
          continue;
        }
        if (Math.abs(m - cur.ref) > 0.8) {
          pend.push(i);
          const pv = pend.map((k) => sm[k]).filter((x) => x != null);
          if (pv.length >= 4 && Math.abs(med(pv) - cur.ref) > 0.8) {
            cur.t1 = S[pend[0]].t;
            pieces.push(cur);
            cur = { t0: S[pend[0]].t, idx: pend, ref: med(pv) };
            pend = [];
          }
        } else {
          if (pend.length) cur.idx.push(...pend);
          pend = [];
          cur.idx.push(i);
          cur.ref = refOf(cur.idx);
        }
      }
      if (pend.length) cur.idx.push(...pend);
      cur.t1 = t1;
      pieces.push(cur);
      const notes = pieces.map((p) => {
        const dur = p.t1 - p.t0;
        const v = p.idx.map((i) => S[i]).filter((s) => s.midi != null);
        let midi = null;
        if (dur >= 0.12 && v.length >= 4) {
          const a = Math.floor(v.length * 0.2);
          const mid = v.slice(a, Math.max(a + 1, v.length - a)).map((s) => s.midi);
          midi = med(mid);
        }
        return { t0: p.t0, t1: p.t1, midi, dur };
      });
      // Short pitched pieces between two notes are a way, not notes
      let out = [];
      for (let i = 0; i < notes.length; i++) {
        const nt = notes[i];
        const between = i > 0 && i < notes.length - 1 && nt.dur < 0.15;
        if (between) {
          const last = out[out.length - 1];
          if (last && last.glide) last.t1 = nt.t1;
          else out.push({ t0: nt.t0, t1: nt.t1, midi: null, glide: true });
          continue;
        }
        out.push({ t0: nt.t0, t1: nt.t1, midi: nt.midi });
      }
      // How long each step takes: from the last moment on the old pitch to the
      // first on the new one (within a third of a semitone). Over a quarter
      // second it is a slide, drawn as the slanted way it took.
      const pitched = out.filter((nt) => nt.midi != null);
      const steps = [];
      for (let k = 1; k < pitched.length; k++) {
        const A = pitched[k - 1];
        const B = pitched[k];
        if (Math.abs(B.midi - A.midi) < 1) continue;
        const from = (A.t0 + A.t1) / 2;
        const to = (B.t0 + B.t1) / 2;
        let leave = null;
        let arrive = null;
        for (let i = 0; i < S.length; i++) {
          const s = S[i];
          if (s.t < from || s.t > to || sm[i] == null) continue;
          if (Math.abs(sm[i] - B.midi) <= 0.35) {
            arrive = s.t;
            break;
          }
          if (Math.abs(sm[i] - A.midi) <= 0.35) leave = s.t;
        }
        if (leave != null && arrive != null && arrive - leave > 0.25) steps.push({ A, B, leave, arrive });
      }
      steps.forEach(({ A, B, leave, arrive }) => {
        out = out.filter((nt) => !(nt.glide && nt.t0 >= A.t0 && nt.t1 <= B.t1));
        A.t1 = leave;
        B.t0 = arrive;
        out.splice(out.indexOf(B), 0, { t0: leave, t1: arrive, midi: null, glide: true, slide: true });
      });
      // An open run's last note is still growing: the picture draws it to now
      if (run.t1 == null && out.length) out[out.length - 1].t1 = null;
      return out;
    },
    _notesOf(run) {
      if (run.notes) return run.notes;
      // The open run: re-cut every few frames, not every paint
      if (!run._cut || run.samples.length - run._cutN >= 4) {
        run._cut = this._segment(run);
        run._cutN = run.samples.length;
      }
      return run._cut;
    },
    _stats(i) {
      const st = this.state;
      const p = st.phases[i];
      const runs = st.runs.filter((r) => r.phaseIdx === i);
      const closed = runs.filter((r) => r.t1 != null);
      const len = (r) => (r.t1 != null ? r.t1 : st.t) - r.t0;
      const med = global.VTFeatures.median;
      if (!p) return {};
      if (p.kind === "legato") {
        const lines = closed.filter((r) => len(r) >= 0.8);
        const open = st.open && st.open.phaseIdx === i ? st.open : null;
        const dips = lines.map((r) => r.dip).filter((d) => d != null);
        let slides = 0;
        closed.forEach((r) => (r.notes || []).forEach((nt) => (slides += nt.slide ? 1 : 0)));
        return {
          lines: lines.length + (open && len(open) >= 0.8 ? 1 : 0),
          breaks: runs.filter((r) => r.breakBefore).length,
          dip: dips.length ? Math.max(...dips) : null,
          longest: runs.length ? Math.max(...runs.map(len)) : 0,
          current: open ? len(open) : null,
          slides
        };
      }
      const lens = closed.map(len);
      const gaps = [];
      for (let k = 1; k < closed.length; k++) {
        const g = closed[k].t0 - closed[k - 1].t1;
        if (g > 0 && g < 1) gaps.push(g);
      }
      return {
        notes: closed.length,
        medLen: lens.length ? med(lens) : null,
        medGap: gaps.length ? med(gaps) : null,
        hammers: closed.filter((r) => r.hammer).length
      };
    },
    /**
     * Staccato pitch against legato pitch, each as its median offset from the
     * nearest piano key, when both have five notes with a pitch (aprox.).
     */
    _pitchOffset() {
      const st = this.state;
      const devs = { staccato: [], legato: [] };
      st.runs.forEach((r) =>
        (r.notes || []).forEach((nt) => {
          if (nt.midi != null && devs[r.kind]) devs[r.kind].push((nt.midi - Math.round(nt.midi)) * 100);
        })
      );
      if (devs.staccato.length < 5 || devs.legato.length < 5) return null;
      const med = global.VTFeatures.median;
      let d = med(devs.staccato) - med(devs.legato);
      if (d > 50) d -= 100;
      if (d < -50) d += 100;
      return d;
    },
    onStart() {
      const st = this.state;
      this._reset();
      st.live = true;
      this.hud?.classList.remove("is-replay");
      const sh = this.$("[data-sh]");
      if (sh) sh.textContent = "0";
      const lg = this.$("[data-lg]");
      if (lg) lg.textContent = "0";
      this._words();
      st.lastNow = null;
      this.viz?.draw();
    },
    onFrame(frame) {
      const st = this.state;
      if (st.review || !frame) return;
      const now = performance.now();
      const wall = st.lastNow == null ? 0 : Math.min(0.25, (now - st.lastNow) / 1000);
      st.lastNow = now;
      const dtMs = frame.dtMs || 16;
      st.t += dtMs / 1000;
      st.processed = !!frame.processedInput;
      if (frame.buf && frame.sampleRate) st.bufMs = (frame.buf.length / frame.sampleRate) * 1000;
      const pushed = st.env ? st.env.feed(frame) : 0;
      // The phases are a wall clock, like the countdown that names them
      if (!st.allDone) {
        st.remaining -= wall;
        if (st.remaining <= 0) this._nextPhase();
      }
      const snd = !!frame.sounding && !frame.manualSound;
      // A frame's level spans 43 ms, so a short gap barely shows in it: the
      // fast envelope cuts the run where it stays 15 dB under its peak for
      // 50 ms (about 65 ms of real gap once its 12,5 ms smoothing is counted),
      // and the next run waits until the sound is clearly back.
      let loudAt = null;
      if (st.env && pushed) {
        const E = st.env;
        const seg = E.window(pushed / E.rate);
        const base = E.total - seg.length;
        for (let i = 0; i < seg.length; i++) {
          const v = seg[i];
          const run = st.open;
          if (run) {
            if (v > run.peakEnv) run.peakEnv = v;
            if (v < run.peakEnv * 0.178) {
              if (run.qStart == null) run.qStart = base + i;
              const quietMs = (base + i - run.qStart + 1) * E.blockMs;
              if (quietMs >= 50 && (run.qStart - run.startTotal) * E.blockMs > 60) {
                const peak = run.peakEnv;
                this._closeRun(run, st.lastSnd, this._tOfIdx(run.qStart));
                st.waitLoud = peak * 0.25;
              }
            } else run.qStart = null;
          } else if (st.waitLoud != null && v >= st.waitLoud && loudAt == null) {
            loudAt = base + i;
          }
        }
      }
      if (!snd) st.waitLoud = null;
      if (snd && (st.waitLoud == null || loudAt != null)) {
        let run = st.open;
        if (!run) {
          st.waitLoud = null;
          const prev = st.runs[st.runs.length - 1];
          const kind = st.phases[st.phaseIdx].kind;
          const t0 = loudAt != null ? this._tOfIdx(loudAt) : st.t - dtMs / 2000;
          run = {
            t0,
            t1: null,
            phaseIdx: st.phaseIdx,
            kind,
            samples: [],
            startTotal: loudAt != null ? loudAt : st.env ? st.env.total : 0,
            attackDone: false,
            hammer: null,
            maxDt: 0,
            peakRms: 0,
            peakEnv: 0,
            qStart: null,
            dip: null,
            notes: null,
            // A legato line that stopped for a moment, not a breath between phrases
            breakBefore:
              kind === "legato" &&
              !!prev &&
              prev.phaseIdx === st.phaseIdx &&
              prev.t1 != null &&
              prev.t1 - prev.t0 >= 0.25 &&
              t0 - prev.t1 < 0.35
          };
          st.runs.push(run);
          st.open = run;
          if (st.runs.length > 600) st.runs.splice(0, st.runs.length - 600);
        }
        const age = st.t - run.t0;
        if (age < 0.2) run.maxDt = Math.max(run.maxDt, dtMs);
        const rms = frame.rms || 0;
        run.peakRms = Math.max(run.peakRms, rms);
        const f = frame.rawFreq;
        const midi = f && f >= 60 && f <= 1100 ? 69 + 12 * Math.log2(f / 440) : null;
        const db = rms > 0 ? Math.max(-100, 20 * Math.log10(rms / (frame.inputGain || 1))) : -100;
        run.samples.push({ t: st.t, midi, db });
        if (st.medMidi == null && midi != null) st.medMidi = midi;
        if (!run.attackDone && age >= 0.13) this._attack(run);
        st.lastSnd = st.t;
      } else if (st.open && st.t - st.lastSnd > 0.04) {
        this._closeRun(st.open, st.lastSnd);
      }
      const rem = this.$("[data-remain]");
      if (rem) {
        const s = st.allDone ? "✓" : `${Math.ceil(Math.max(0, st.remaining))}s`;
        if (rem.textContent !== s) rem.textContent = s;
      }
      this.viz?.draw();
    },
    onStop() {
      const st = this.state;
      if (st.open) this._closeRun(st.open, st.lastSnd);
      st.review = true;
      st.live = false;
      this._mem().resume = st.allDone ? 0 : st.phaseIdx;
      if (this.viz) {
        this.hud.classList.add("is-replay");
        this.viz.draw();
      }
      // A phase counts as a round once it was sung in its own way
      let rounds = 0;
      st.phases.forEach((p, i) => {
        if (!p.round || i > st.phaseIdx) return;
        const runs = st.runs.filter((r) => r.phaseIdx === i);
        const ok =
          p.kind === "legato"
            ? runs.some((r) => r.t1 - r.t0 >= 1.2)
            : runs.filter((r) => r.t1 - r.t0 < 0.45).length >= 3;
        if (ok) rounds += 1;
      });
      const patches = {};
      // Ease and line quality stay the learner's own ratings
      if (rounds > 0) patches.rounds = rounds;
      const sIdx = st.phases.findIndex((p, i) => p.kind === "staccato" && st.runs.some((r) => r.phaseIdx === i));
      const lIdx = st.phases.findIndex((p, i) => p.kind === "legato" && st.runs.some((r) => r.phaseIdx === i));
      const parts = [];
      const allStacc = st.runs.filter((r) => r.kind === "staccato" && r.t1 != null);
      if (sIdx >= 0 && allStacc.length) {
        const ml = global.VTFeatures.median(allStacc.map((r) => r.t1 - r.t0));
        parts.push(L(`staccato ${ml.toFixed(2).replace(".", ",")} s de mediana`, `staccato ${ml.toFixed(2)} s median`));
      }
      if (lIdx >= 0) {
        const br = st.runs.filter((r) => r.breakBefore).length;
        parts.push(L(`legato ${br} ${br === 1 ? "corte" : "cortes"}`, `legato ${br} ${br === 1 ? "break" : "breaks"}`));
      }
      return {
        patches,
        summary:
          L(`${rounds} ${rounds === 1 ? "ronda" : "rondas"}`, `${rounds} ${rounds === 1 ? "round" : "rounds"}`) +
          (parts.length ? " · " + parts.join(" · ") : "")
      };
    }
  });

  /**
   * s12 easy onset — "Forma del ataque". An onset is over in under 100 ms:
   * nothing to steer while it happens, so each one is drawn after it (its
   * first 300 ms: the rise, a spike above the level it settles at, air heard
   * before the tone) and named against the learner's own examples. The
   * exercise's contrast step (2 abrupt "uh", 2 breathy "ha", 2 easy) is the
   * calibration: each later onset is called the kind of example it is
   * nearest to. Abrupt and breathy are information, never red.
   *
   * Onsets come from the raw sound edge and the 400 Hz envelope
   * (VTFeatures.OnsetCapture), normalised to each note's own settled level,
   * so a loud gradual start is not called hard and a soft sudden one is.
   */
  Modes.onsetReps = baseMode({
    id: "onsetReps",
    render() {
      const st = this.state;
      st.target = this.profile.targetReps || 10;
      this._resetOnsets(true);
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${L("Forma del ataque", "Onset shape")}</div>
          <button type="button" class="btn btn-ghost viz-tap" data-skip>${this._skipLabel()}</button>
        </div>
        <div class="viz-words">
          <span class="mode-phase" data-phase>${st.head}</span>
          <strong class="mode-big" data-e>0 / ${st.target}</strong>
          <span>${L("Bruscos", "Abrupt")}: <strong data-h>0</strong> · ${L("Soplados", "Breathy")}: <strong data-br>0</strong></span>
        </div>
        <p class="mode-meta muted">${L(
          "Parte del silencio. Cada inicio se dibuja al terminar y se compara con tus propios ejemplos.",
          "Start from silence. Each onset is drawn once it's over and compared with your own examples."
        )}</p>
      `;
      this.$("[data-skip]")?.addEventListener("click", () => {
        if (st.phase === "contrast") this._toReps(false);
        else this._toContrast();
        this.viz?.draw();
      });
      this._mountViz();
    },
    _skipLabel() {
      return this.state.phase === "contrast" ? L("Saltar ejemplos", "Skip examples") : L("Repetir ejemplos", "Redo examples");
    },
    /**
     * What outlives one take: the app mounts a fresh copy of the mode on every
     * Start (VTPracticeModes.get), so choices are kept on the registered mode.
     */
    _mem() {
      const M = Modes.onsetReps;
      if (!M._kept) M._kept = {};
      return M._kept;
    },
    _remember() {
      const st = this.state;
      this._mem().onsets = { phase: st.phase, step: st.step, examples: st.examples, examplesSeq: st.examplesSeq, refs: st.refs, calNote: st.calNote };
    },
    _resetOnsets(full) {
      const st = this.state;
      const F = global.VTFeatures;
      st.t = 0;
      if (full) {
        // Your examples outlive the take (see _mem): given once, not once per take
        const k = this._mem().onsets;
        st.phase = k ? k.phase : "contrast";
        st.asks = ["abrupt", "abrupt", "breathy", "breathy", "balanced", "balanced"];
        st.step = k ? k.step : 0;
        st.examples = k ? k.examples : { abrupt: [], breathy: [], balanced: [] };
        st.examplesSeq = k ? k.examplesSeq : [];
        st.refs = k ? k.refs : null;
        st.calNote = k ? k.calNote : "";
        st.onsets = [];
        st.counts = { balanced: 0, breathy: 0, abrupt: 0, unmeasured: 0 };
        st.latest = null;
      }
      st.review = false;
      st.quiet = 0; // the take starts unarmed: a sound needs 0.5 s of silence before it
      st.snd = false;
      st.ready = "wait";
      st.soundStart = 0;
      st.startArmed = false;
      st.maxDt = 0;
      st.processed = false;
      st.capture = F ? new F.OnsetCapture({ minGapMs: 500, onOnset: (r) => this._onOnset(r) }) : null;
      st.head = this._head();
    },
    _mountViz() {
      const V = global.VTViz;
      if (!V || !global.VTFeatures || !V.scenes.onset) return;
      const st = this.state;
      this.hud.classList.add("has-viz");
      this.viz = new V.Surface(this.hud, (ctx, w, h) => V.scenes.onset(ctx, w, h, st), {
        label: L(
          "Forma del ataque: cada inicio se dibuja al terminar, su subida, un pico sobre el nivel estable y el aire antes del tono, y se nombra como equilibrado, soplado o brusco comparándolo con tus propios ejemplos.",
          "Onset shape: each onset is drawn once it is over, its rise, a spike above the settled level and any air before the tone, and named balanced, breathy or abrupt against your own examples."
        )
      });
      this.viz.draw();
    },
    _toReps(calibrated) {
      const st = this.state;
      st.phase = "reps";
      if (!calibrated) {
        st.refs = null;
        st.calNote = "";
      }
      st.head = this._head();
      this._remember();
      const b = this.$("[data-skip]");
      if (b) b.textContent = this._skipLabel();
      this.viz?.caption(L("Ahora 10 inicios fáciles", "Now 10 easy onsets"), 0);
    },
    _toContrast() {
      const st = this.state;
      st.phase = "contrast";
      st.step = 0;
      st.examples = { abrupt: [], breathy: [], balanced: [] };
      st.examplesSeq = [];
      st.refs = null;
      st.calNote = "";
      this._mem().onsets = null;
      st.head = this._head();
      const b = this.$("[data-skip]");
      if (b) b.textContent = this._skipLabel();
    },
    /**
     * How well the last buffer repeats at the detector's period (0 = noise,
     * 1 = a clean tone). Tried at the period, one sample either side and twice
     * it, so an octave slip of the detector does not read as air.
     */
    _periodicity(frame) {
      const buf = frame.buf;
      const sr = frame.sampleRate;
      if (!buf || !sr || !frame.rawFreq) return 1;
      const lag0 = Math.round(sr / frame.rawFreq);
      let best = 0;
      for (const lag of [lag0 - 1, lag0, lag0 + 1, lag0 * 2]) {
        if (lag < 8 || lag >= buf.length / 2) continue;
        let xy = 0;
        let xx = 0;
        let yy = 0;
        for (let i = 0, n = buf.length - lag; i < n; i++) {
          const a = buf[i];
          const b = buf[i + lag];
          xy += a * b;
          xx += a * a;
          yy += b * b;
        }
        best = Math.max(best, xy / Math.sqrt(xx * yy + 1e-12));
      }
      return best;
    },
    /** The numbers that tell the kinds apart, on scales where a step means about the same. */
    _features(r) {
      return [Math.log2(Math.max(5, r.riseMs)), (Math.max(1, r.overshoot) - 1) * 4, Math.log2(Math.max(10, r.leadMs + 10))];
    },
    /** Your examples become the references, if they came out different enough to tell apart. */
    _calibrate() {
      const st = this.state;
      const mean = (arr) => arr[0].map((_, j) => arr.reduce((s, v) => s + v[j], 0) / arr.length);
      const refs = {};
      for (const k of ["abrupt", "breathy", "balanced"]) {
        if (!st.examples[k].length) return this._toReps(false);
        refs[k] = mean(st.examples[k].map((r) => this._features(r)));
      }
      const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
      const close = Math.min(d(refs.abrupt, refs.balanced), d(refs.breathy, refs.balanced), d(refs.abrupt, refs.breathy));
      if (close < 0.7) {
        st.refs = null;
        st.calNote = L(
          "Tus ejemplos salieron parecidos: comparo con formas de referencia",
          "Your examples came out alike: comparing with reference shapes"
        );
      } else {
        st.refs = refs;
        st.calNote = "";
      }
      this._toReps(true);
    },
    /** Nearest of your examples; before (or without) them, published starting points. */
    _classify(r) {
      const st = this.state;
      if (st.refs) {
        const f = this._features(r);
        let best = "balanced";
        let bd = 1e9;
        for (const k of Object.keys(st.refs)) {
          const g = st.refs[k];
          const dd = Math.hypot(f[0] - g[0], f[1] - g[1], f[2] - g[2]);
          if (dd < bd) {
            bd = dd;
            best = k;
          }
        }
        return best;
      }
      if (r.leadMs >= 90 || r.riseMs >= 140) return "breathy";
      if (r.riseMs <= 22 && (r.overshoot >= 1.35 || r.riseMs <= 14)) return "abrupt";
      return "balanced";
    },
    _onOnset(res) {
      const st = this.state;
      // The take's first sound (or one that followed noise) had no silence before it
      if (!st.startArmed || st.review) return;
      const span = st.bufMs || 43;
      res.t = st.soundStart;
      // A frame late enough to lose samples of the rise (the engine caps dt at 50 ms)
      const unmeasured = st.maxDt > span + 6;
      if (st.phase === "contrast") {
        const ask = st.asks[st.step];
        if (unmeasured) {
          st.latest = Object.assign(res, { kind2: "unmeasured", asked: ask });
          this.viz?.caption(L("Ese no se pudo medir: otra vez", "That one could not be measured: again"), 0);
        } else {
          res.asked = ask;
          res.kind2 = ask;
          st.examples[ask].push(res);
          st.examplesSeq.push(res);
          st.step += 1;
          st.latest = res;
          if (st.step >= st.asks.length) this._calibrate();
          else this._remember();
        }
      } else {
        res.kind2 = unmeasured ? "unmeasured" : this._classify(res);
        st.onsets.push(res);
        st.counts[res.kind2] = (st.counts[res.kind2] || 0) + 1;
        st.latest = res;
        const e = this.$("[data-e]");
        if (e) e.textContent = `${st.counts.balanced} / ${st.target}`;
        const hEl = this.$("[data-h]");
        if (hEl) hEl.textContent = String(st.counts.abrupt);
        const bEl = this.$("[data-br]");
        if (bEl) bEl.textContent = String(st.counts.breathy);
      }
      const words = {
        balanced: L("Equilibrado", "Balanced"),
        breathy: L("Soplado", "Breathy"),
        abrupt: L("Brusco", "Abrupt"),
        unmeasured: L("Sin medida", "Not measured")
      }[st.latest.kind2];
      this.viz?.caption(
        `${words} · ${L("subida", "rise")} ${Math.round(res.riseMs)} ms · ${L("aire antes", "air first")} ${Math.round(res.leadMs)} ms`,
        1500
      );
      st.head = this._head();
      this.viz?.draw();
    },
    _head() {
      const st = this.state;
      const secs = (n) => String(n.toFixed(1)).replace(".", L(",", "."));
      if (st.phase === "contrast") {
        const k = st.asks[st.step];
        const n = `${st.step + 1}/${st.asks.length}`;
        if (st.ready === "sound") return L(`Ejemplo ${n} · sostén un momento…`, `Example ${n} · hold it a moment…`);
        const ask = {
          abrupt: L("un «uh» brusco, a propósito", "an abrupt 'uh', on purpose"),
          breathy: L("un «ha» soplado, a propósito", "a breathy 'ha', on purpose"),
          balanced: L("uno cómodo y fácil", "a comfortable, easy one")
        }[k];
        return st.ready === "armed" ? L(`Ejemplo ${n}: ${ask}`, `Example ${n}: ${ask}`) : L(`Silencio… luego ${ask}`, `Silence… then ${ask}`);
      }
      if (st.ready === "sound") return L(`Sostén 3–5 s · ${secs(st.soundSec || 0)} s`, `Hold 3–5 s · ${secs(st.soundSec || 0)} s`);
      if (st.ready === "armed") return L("Listo: inhala en silencio y di «a»", "Ready: breathe in silently, then 'ah'");
      return L("Silencio… (medio segundo)", "Silence… (half a second)");
    },
    onStart() {
      const st = this.state;
      this._resetOnsets(false);
      // A fresh take keeps the examples you already gave, not the reps
      st.onsets = [];
      st.counts = { balanced: 0, breathy: 0, abrupt: 0, unmeasured: 0 };
      st.latest = null;
      this.hud?.classList.remove("is-replay");
      const e = this.$("[data-e]");
      if (e) e.textContent = `0 / ${st.target}`;
      const hEl = this.$("[data-h]");
      if (hEl) hEl.textContent = "0";
      st.head = this._head();
      this.viz?.draw();
    },
    onFrame(frame) {
      const st = this.state;
      if (!st.capture || st.review) return;
      const dtMs = (frame && frame.dtMs) || 16;
      st.t += dtMs / 1000;
      st.processed = !!frame.processedInput;
      if (frame.buf && frame.sampleRate) st.bufMs = (frame.buf.length / frame.sampleRate) * 1000;
      const snd = !!frame.sounding && !frame.manualSound;
      const was = st.ready;
      if (snd) {
        if (!st.snd) {
          st.soundStart = st.t;
          // A reference note through the speakers is not an onset
          const P = global.VTPiano;
          const piano = !!(P && P.isSounding && !P.loopActive && P.isSounding(0.25));
          st.startArmed = st.quiet >= 480 && !piano;
          st.maxDt = 0;
        }
        if (st.t - st.soundStart < 0.15) st.maxDt = Math.max(st.maxDt, dtMs);
        st.quiet = 0;
        st.snd = true;
        st.ready = "sound";
        st.soundSec = st.t - st.soundStart;
      } else {
        st.quiet += dtMs;
        st.snd = false;
        st.ready = st.quiet >= 500 ? "armed" : "wait";
      }
      // Space-as-sound is not a voice: the capture sees silence. In the first
      // 400 ms of a sound the detector's pitch only counts once the waveform
      // really repeats: it also names a "pitch" for plain breath noise, which
      // would hide the air before the tone.
      if (frame.manualSound) st.capture.feed(Object.assign({}, frame, { sounding: false, rawFreq: null }));
      else if (snd && frame.rawFreq && st.t - st.soundStart < 0.4 && this._periodicity(frame) < 0.55)
        st.capture.feed(Object.assign({}, frame, { rawFreq: null }));
      else st.capture.feed(frame);
      const head = this._head();
      if (head !== st.head || was !== st.ready) {
        st.head = head;
        const ph = this.$("[data-phase]");
        if (ph) ph.textContent = head;
      }
      this.viz?.draw();
    },
    onStop() {
      const st = this.state;
      st.review = true;
      if (this.viz) {
        this.hud.classList.add("is-replay");
        this.viz.draw();
      }
      const c = st.counts;
      const patches = {};
      // Only the count is measured; balance and comfort stay the learner's ratings
      if (c.balanced > 0) patches.easyOnsets = c.balanced;
      return {
        patches,
        summary: L(
          `${c.balanced} ${c.balanced === 1 ? "equilibrado" : "equilibrados"} · ${c.breathy} ${c.breathy === 1 ? "soplado" : "soplados"} · ${c.abrupt} ${c.abrupt === 1 ? "brusco" : "bruscos"}`,
          `${c.balanced} balanced · ${c.breathy} breathy · ${c.abrupt} abrupt`
        )
      };
    }
  });

  // ——— CLASS MODES (placement / resonance course) ———

  /**
   * Note name after the app's active octave shift. `VTLockHighwayNotes` shifts
   * the names it is given and the piano reference is shifted too, so a mode that
   * picks its own targets must look them up at the same octave or the user is
   * chasing a note the highway never shows.
   */
  function shiftedNote(name) {
    const n = global.VTGetOctaveShift ? global.VTGetOctaveShift() : 0;
    if (!name || !n || typeof global.VTShiftNoteName !== "function") return name;
    return global.VTShiftNoteName(name, n) || name;
  }

  /** Per-phase cue text, localized like the phase label itself. */
  function phaseCueFor(phase) {
    if (!phase) return "";
    return (isEs() ? phase.cueEs || phase.cue : phase.cue) || "";
  }

  /**
   * s17 jaw & neck release — guided steps with the mic closed. Nothing to
   * detect: the value is being walked through the four releases (hanging jaw,
   * neck half-circles, chewing hum, pre-yawns), each drawn, with the time left,
   * the next step and a soft tone at each change for eyes-closed practice.
   */
  Modes.releaseFlow = baseMode({
    id: "releaseFlow",
    render() {
      const G = global.VTViz?.guided;
      const title = L("Soltar mandíbula y cuello", "Jaw & neck release");
      const phases = this.profile.phases || [];
      if (!G) {
        this.hud.innerHTML = `
          <div class="mode-title">${title}</div>
          <div class="mode-phase" data-phase>${phases[0]?.label || L("Suelta", "Release")}</div>
          <div class="mode-big" data-remain>—</div>
          <p class="mode-meta" data-cue>${phaseCueFor(phases[0])}</p>
        `;
        return;
      }
      const aspect = { jaw: 1.75, neck: 1.2, chew: 1.5, yawns: 2.6 };
      const stack = { yawns: 1.9 };
      this.viz = new G.Drill(this, {
        kind: "release",
        title,
        phases,
        skip: true,
        chime: true,
        preCue: 3,
        meta: L("Sin prisa. Si algo tira o duele, hazlo más pequeño.", "No hurry. If anything pulls or hurts, make it smaller."),
        label: L(
          "Dibujo del movimiento del paso actual, el tiempo que queda y el siguiente paso. Los pasos avanzan solos; un tono suave marca cada cambio.",
          "A drawing of this step's movement, the time left and the next step. Steps move on by themselves; a soft tone marks each change."
        ),
        artFor: (p) => {
          const key = p && G.art[p.art] ? p.art : "jaw";
          return { draw: G.art[key], aspect: aspect[key] || 1.4, stackAspect: stack[key] };
        },
        doneText: L("Listo: mandíbula y cuello sueltos", "Done: jaw and neck free"),
        doneSub: L("Ahora, a cantar", "Now, sing"),
        doneCue: L("Lleva esta soltura al primer ejercicio con sonido.", "Take this ease into your first sung exercise.")
      });
    },
    onStart() {
      this.viz?.start?.();
    },
    onFrame(frame) {
      this.viz?.frame?.(frame);
    },
    onStop() {
      const d = this.viz;
      d?.stop?.();
      const n = d ? d.run.completed : 0;
      const total = d ? d.run.count : this.profile.phases?.length || 0;
      // Steps walked through is the only thing known; ease is the learner's rating
      return {
        patches: n > 0 ? { phasesDone: n } : {},
        summary: L(`${n} de ${total} pasos de soltura`, `${n} of ${total} release steps`)
      };
    }
  });

  /**
   * s18 costo-abdominal breath — paced inhale / retention / exhale. The belt bar
   * is the low expansion: it fills on the inhale, holds, then empties slowly so
   * the ribs have something to resist against (apoyo).
   */
  Modes.breathCycle = baseMode({
    id: "breathCycle",
    render() {
      const p = this.profile.pattern || {};
      this.state.inSec = p.in || 4;
      this.state.holdSec = p.hold != null ? p.hold : 2;
      this.state.outSec = p.out || 8;
      this.state.stage = 0; // 0 in · 1 hold · 2 out
      this.state.t = 0;
      this.state.clock = 0;
      this.state.cycles = 0;
      this.state.last = performance.now();
      this.hud.innerHTML = `
        <div class="mode-title">${L("Respiración costo-abdominal", "Low rib & belly breath")}</div>
        <div class="viz-row viz-words">
          <span class="mode-phase" data-stage>${L("Inhala por la nariz", "Inhale through the nose")}</span>
          <strong class="mode-big" data-count>${this.state.inSec}</strong>
        </div>
        <p class="mode-meta">${L("Ciclos", "Cycles")} <strong data-cy>0</strong> · ${this.state
          .inSec}–${this.state.holdSec}–${this.state.outSec} · ${L(
          "manos en costillas bajas y abdomen; los hombros no suben",
          "hands on the low ribs and belly; the shoulders stay down"
        )}</p>
      `;
      // A scrolling breath wave with "now" fixed and the next breath visible
      // ahead of it: the turn from in to out never arrives as a surprise.
      // The mic cannot see ribs, so nothing here is scored — it paces.
      this._mountViz();
    },
    _lens() {
      return [this.state.inSec, this.state.holdSec, this.state.outSec];
    },
    _labels() {
      // The hold is a suspension with the throat open, not a locked breath:
      // a held glottis primes the hard onset the next exercises undo.
      return [
        L("Inhala por la nariz", "Inhale through the nose"),
        L("Suspende · garganta abierta", "Suspend · throat open"),
        L("Exhala parejo · costillas anchas", "Even exhale · ribs wide")
      ];
    },
    _mountViz() {
      const V = global.VTViz;
      if (!V) return;
      this.hud.classList.add("has-viz");
      const lens = this._lens();
      const cyc = lens[0] + lens[1] + lens[2];
      const lo = 0.1;
      const hi = 0.9;
      const ease = (x) => (1 - Math.cos(Math.PI * clamp(x, 0, 1))) / 2;
      const phaseAt = (t) => {
        const u = ((t % cyc) + cyc) % cyc;
        if (u < lens[0]) return [0, u / (lens[0] || 1)];
        if (u < lens[0] + lens[1]) return [1, (u - lens[0]) / (lens[1] || 1)];
        return [2, (u - lens[0] - lens[1]) / (lens[2] || 1)];
      };
      // The air: in, suspended, out evenly
      this.state.wave = (t) => {
        const [st, f] = phaseAt(t);
        const y = st === 0 ? lo + (hi - lo) * ease(f) : st === 1 ? hi : hi - (hi - lo) * f;
        return { y, lo: y - 0.045, hi: y + 0.045 };
      };
      // The ribs: they open with the air, then stay wide while the air leaves
      // and only let go at the end — the apoyo this drill is for. A model of
      // what to do, drawn as a guide; nothing measures it.
      const ribs = (t) => {
        const [st, f] = phaseAt(t);
        if (st === 0) return lo + 0.05 + (hi - lo - 0.05) * ease(f);
        if (st === 1) return hi;
        return f < 0.7 ? hi - 0.06 * (f / 0.7) : hi - 0.06 - (hi - lo - 0.06) * ease((f - 0.7) / 0.3) * 0.85;
      };
      this.viz?.destroy?.();
      this.viz = new V.Timeline(this.hud, {
        seconds: Math.max(10, Math.min(18, cyc * 1.15)),
        minPxPerSec: 26,
        nowAt: 0.4,
        top: L("lleno · anchas", "full · wide"),
        bottom: L("vacío", "empty"),
        label: L(
          "Guía de respiración: la banda verde es el aire, sube al inhalar y baja parejo al exhalar; la línea discontinua son las costillas, que se quedan anchas casi hasta el final",
          "Breath guide: the green band is the air, rising on the inhale and falling evenly on the exhale; the dashed line is the ribs, which stay wide almost to the end"
        ),
        tagColors: { 0: V.C.target },
        captionHidden: true,
        guide: this.state.wave,
        lines: [{ fn: ribs, color: V.C.done, dash: [7, 5], width: 2, label: L("costillas", "ribs") }]
      });
      this._markAhead();
      this.viz.push(0, this.state.wave(0).y);
      this.viz.setText(this._labels()[0], String(lens[0]), this._subLine());
      this.viz.surface.caption(this._labels()[0]);
    },
    _subLine() {
      return `${this.state.inSec}–${this.state.holdSec}–${this.state.outSec} · ${L("una guía: el micrófono no ve las costillas", "a guide: the mic cannot see your ribs")}`;
    },
    /** Name each phase where it starts, for the stretch of wave ahead. */
    _markAhead() {
      if (!this.viz) return;
      const lens = this._lens();
      const cyc = lens[0] + lens[1] + lens[2];
      const names = [
        L("Inhala", "Inhale") + " " + lens[0],
        L("Suspende", "Suspend") + " " + lens[1],
        L("Exhala", "Exhale") + " " + lens[2]
      ];
      const until = this.state.clock + 24;
      this._markedTo = this._markedTo || 0;
      while (this._markedTo < until) {
        const base = this._markedTo;
        let at = base;
        for (let i = 0; i < 3; i++) {
          if (lens[i] > 0) this.viz.mark(names[i], { at, line: false, color: global.VTViz.C.muted });
          at += lens[i];
        }
        this._markedTo = base + cyc;
      }
    },
    onStart() {
      this.state.last = performance.now();
      this.state.stage = 0;
      this.state.t = 0;
      this.state.clock = 0;
      this.state.cycles = 0;
      this._markedTo = 0;
      if (this.viz) {
        this.viz.reset();
        this._markAhead();
      }
    },
    onFrame() {
      const now = performance.now();
      const dt = Math.min(0.25, (now - this.state.last) / 1000);
      this.state.last = now;
      this.state.t += dt;
      this.state.clock += dt;
      const lens = this._lens();
      const prevStage = this.state.stage;
      let guard = 0;
      while (this.state.t >= lens[this.state.stage] && guard++ < 6) {
        this.state.t -= lens[this.state.stage];
        this.state.stage = (this.state.stage + 1) % 3;
        if (this.state.stage === 0) {
          this.state.cycles += 1;
          if (this.$("[data-cy]")) this.$("[data-cy]").textContent = String(this.state.cycles);
        }
        // A zero-length stage (no hold) is skipped by the loop condition
      }
      const len = lens[this.state.stage] || 1;
      const labels = this._labels();
      const count = String(Math.max(1, Math.ceil(len - this.state.t)));
      if (this.$("[data-stage]")) this.$("[data-stage]").textContent = labels[this.state.stage];
      if (this.$("[data-count]")) this.$("[data-count]").textContent = count;
      if (this.viz && this.state.wave) {
        this.viz.push(dt, this.state.wave(this.state.clock).y, 0);
        this.viz.setText(labels[this.state.stage], count, this._subLine());
        if (prevStage !== this.state.stage) {
          this.viz.surface.caption(labels[this.state.stage], 0);
          global.VTViz.chime(this.state.stage === 0 ? "done" : "phase");
          this._markAhead();
        }
      }
    },
    onStop() {
      const n = this.state.cycles || 0;
      return {
        patches: n > 0 ? { cycles: n } : {},
        summary: L(
          `${n} ${n === 1 ? "ciclo" : "ciclos"} de respiración ${this.state.inSec}–${this.state.holdSec}–${this.state.outSec}`,
          `${n} breath ${n === 1 ? "cycle" : "cycles"} ${this.state.inSec}–${this.state.holdSec}–${this.state.outSec}`
        )
      };
    }
  });

  /**
   * s19 soft palate — the surprise face and the pre-yawn are silent steps,
   * drawn (a face; the palate rising to the "stop here" line). The sung steps
   * show what the mic can hear: each hold of 1.5 s or more as a bar against
   * that line, and a closed-then-open pair of phrases compared after Stop by
   * level (dB) and pitch (cents) — more space should not mean more volume.
   * The space itself is never scored: the learner's ear and rating decide.
   * Holds use the raw sound edge (`sounding`); `voiced` bridges ~1 s gaps.
   */
  Modes.openSpace = baseMode({
    id: "openSpace",
    render() {
      const G = global.VTViz?.guided;
      const phases = this.profile.phases || [];
      this.state.minHoldMs = this.profile.minHoldMs || 1500;
      this._resetSpace();
      const title = L("Paladar blando · espacio interno", "Soft palate · inner space");
      const count = `<strong class="mode-big" data-h>0</strong> <span>${L("sostenidos", "holds")}</span>`;
      if (!G) {
        this.hud.innerHTML = `<div class="mode-title">${title}</div><div class="mode-phase" data-phase>${phases[0]?.label || ""}</div>${count}<p class="mode-meta" data-cue>${phaseCueFor(phases[0])}</p>`;
        return;
      }
      this.viz = new G.Drill(this, {
        kind: "space",
        title,
        phases,
        mic: true,
        recorded: true,
        skip: true,
        preCue: 3,
        words: " " + count,
        label: L(
          "Pasos en silencio: un dibujo de la cara y del paladar que sube hasta la línea. Pasos cantados: cada sostenido como una barra frente a la línea de 1,5 s, y dos frases, cerrada y abierta, para comparar.",
          "Silent steps: a drawing of the face and of the palate rising to the line. Sung steps: each hold as a bar against the 1.5 s line, and two phrases, closed and open, to compare."
        ),
        artFor: (p) => {
          if (p && p.sound) return p.ab ? { draw: G.art.ab, aspect: 2.6, stackAspect: 2, measured: true } : { draw: G.art.holds, aspect: 2.4, stackAspect: 1.6, measured: true };
          return p && p.art === "chapel" ? { draw: G.art.chapel, aspect: 1.25 } : { draw: G.art.surprise, aspect: 1 };
        },
        status: (info) => this._spaceStatus(info),
        onStart: () => this._resetSpace(),
        onFrame: (frame, d) => this._spaceFrame(frame, d),
        onStep: (i, d) => this._spaceStep(d),
        chapters: (d) => this._spaceChapters(d),
        doneText: L("Listo: guarda ese espacio", "Done: keep that space"),
        reviewTitle: () => (this._abDone().length === 2 ? L("Escucha cerrado y abierto", "Hear closed and open") : L("Escucha tu toma", "Listen to your take")),
        reviewExtraH: (w) => (this._abDone().length === 2 ? (w < 420 ? 62 : 46) : 0),
        reviewExtra: (ctx, box) => this._abCard(ctx, box),
        reviewNote: L(
          "El espacio no se mide: decide tu oído. La amplitud la valoras tú en Métricas.",
          "Space isn't measured: your ear decides. You rate the width in Metrics."
        )
      });
      this._syncSpace();
    },
    _resetSpace() {
      const st = this.state;
      st.holds = 0;
      st.holdList = [];
      st.ab = [];
      st.hold = null;
      st.gap = 0;
      st.phrase = null;
      st.pgap = 0;
      st.noiseAt = -1;
      st.refUntil = -1;
      st.lastEl = null;
      st.abArmed = false;
      st.abQuiet = 0;
      this._syncSpace();
    },
    /** What the art reads (the Drill is `info.m` in js/scenes/guided.js). */
    _syncSpace() {
      const st = this.state;
      const d = this.viz;
      if (d) {
        d.holds = st.holdList;
        d.ab = st.ab;
        d.holdLive = st.hold ? st.hold.len : null;
        d.minHoldMs = st.minHoldMs;
      }
      const el = this.$("[data-h]");
      if (el && el.textContent !== String(st.holds)) el.textContent = String(st.holds);
    },
    _spaceFrame(frame, d) {
      const st = this.state;
      const run = d.run;
      // Time between frames: the recording clock when there is one (frames
      // come further apart on a busy device and dtMs is capped), so a 1 s
      // breath between two phrases is never read as one long phrase.
      let dt = Math.min(0.1, Math.max(0, (frame.dtMs || 16) / 1000));
      if (frame.elapsedMs != null) {
        if (st.lastEl != null && frame.elapsedMs >= st.lastEl) dt = Math.min(0.5, (frame.elapsedMs - st.lastEl) / 1000);
        st.lastEl = frame.elapsedMs;
      }
      const on = frame.sounding != null ? !!frame.sounding : !!frame.voiced;
      const phase = run.done ? null : run.cur;
      const sound = !!(phase && phase.sound);
      // The reference note the mode plays is not the singer
      const heard = on && run.clock >= st.refUntil;
      if (sound && heard) {
        st.gap = 0;
        if (!st.hold) st.hold = { len: 0, step: run.index, counted: false };
        st.hold.len += dt;
        if (!st.hold.counted && st.hold.len * 1000 >= st.minHoldMs) {
          st.hold.counted = true;
          st.holds += 1;
          d.caption(L(`Sostenido ${st.holds} ✓`, `Hold ${st.holds} ✓`), 1200);
        }
      } else if (st.hold) {
        st.gap += dt;
        if (st.gap > 0.25 || !sound) this._endHold();
      }
      if (sound && phase.ab) this._abFrame(frame, heard, dt, run);
      else if (st.phrase) this._endPhrase(run);
      // Silent steps: say so if there is sound (the start-of-practice piano aside)
      if (!sound && on && run.clock > 5) st.noiseAt = run.clock;
      this._syncSpace();
    },
    _endHold() {
      const st = this.state;
      if (st.hold && st.hold.len >= 0.3) st.holdList.push({ len: st.hold.len, step: st.hold.step });
      if (st.holdList.length > 60) st.holdList.splice(0, st.holdList.length - 60);
      st.hold = null;
      st.gap = 0;
    },
    /** Closed, then open: the first two phrases of 1 s or more in the step. */
    _abFrame(frame, on, dt, run) {
      const st = this.state;
      // A phrase already under way when the step starts is the last step's
      // tail: wait for a breath before taking the closed one
      if (!st.phrase && !st.abArmed) {
        st.abQuiet = on ? 0 : st.abQuiet + dt;
        if (st.abQuiet >= 0.3) st.abArmed = true;
        return;
      }
      if (on) {
        st.pgap = 0;
        if (!st.phrase && st.ab.length < 2) {
          st.phrase = { start: run.clock - dt, r0: run.rec - dt, end: null, r1: null, dbs: [], midis: [], db: null, midi: null };
          st.ab.push(st.phrase);
        }
        if (st.phrase) {
          const rms = frame.rms || 0;
          if (rms > 0) st.phrase.dbs.push(20 * Math.log10(rms));
          const f = frame.rawFreq || frame.voiceFreq || 0;
          if (f > 60 && f < 1000) st.phrase.midis.push(69 + 12 * Math.log2(f / 440));
        }
      } else if (st.phrase) {
        st.pgap += dt;
        if (st.pgap > 0.35) this._endPhrase(run);
      }
    },
    _endPhrase(run) {
      const st = this.state;
      const p = st.phrase;
      if (!p) return;
      const back = Math.min(st.pgap, 0.35);
      st.phrase = null;
      st.pgap = 0;
      const end = run.clock - back;
      const r1 = run.rec - back;
      if (r1 - p.r0 < 1) {
        st.ab.splice(st.ab.indexOf(p), 1);
        return;
      }
      const med = (a) => {
        if (!a.length) return null;
        const s = a.slice().sort((x, y) => x - y);
        return s[Math.floor(s.length / 2)];
      };
      p.end = end;
      p.r1 = r1;
      p.len = r1 - p.r0;
      p.db = med(p.dbs);
      p.midi = med(p.midis);
      p.dbs = [];
      p.midis = [];
    },
    _abDone() {
      return (this.state.ab || []).filter((s) => s.end != null);
    },
    _spaceStep(d) {
      const st = this.state;
      if (st.hold) this._endHold();
      st.abArmed = false;
      st.abQuiet = 0;
      const p = d.run.done ? null : d.run.cur;
      // The first sung step starts from a reference note (once, short)
      if (p && p.ref && global.VTPiano?.playRefPitch && document.getElementById("chk-auto-piano")?.checked !== false) {
        try {
          const played = global.VTPiano.playRefPitch(shiftedNote(this.profile.refPitch || "C3"), 1.2, false);
          if (played && played.catch) played.catch(() => {});
          st.refUntil = d.run.clock + 1.8;
        } catch {
          /* no reference is fine */
        }
      }
      this._syncSpace();
    },
    _spaceStatus(info) {
      const st = this.state;
      const d = this.viz;
      const C = global.VTViz.C;
      if (!d || !d.live || info.done || !info.phase) return null;
      if (!info.phase.sound) {
        return st.noiseAt >= 0 && d.run.clock - st.noiseAt < 1.2
          ? { text: L("Se oye sonido · este paso va sin voz", "Sound heard · this step is silent"), color: C.warn }
          : { text: L("En silencio ✓", "Silent ✓"), color: C.muted };
      }
      if (d.run.clock < st.refUntil) return { text: L("Escucha la nota de referencia…", "Listen to the reference note…"), color: C.muted };
      return { text: L(`Sostenidos ≥ 1,5 s en total: ${st.holds}`, `Holds ≥ 1.5 s in all: ${st.holds}`), color: C.muted };
    },
    _spaceChapters(d) {
      const V = global.VTViz;
      const [a, b] = this._abDone();
      const seg = (s) => ({ t0: s.start, t1: s.end, r0: s.r0, r1: s.r1, sub: V.fmtSec(s.len != null ? s.len : s.end - s.start) });
      const out = [];
      if (a) out.push(Object.assign({ label: L("1 · Cerrado", "1 · Closed") }, seg(a)));
      if (b) out.push(Object.assign({ label: L("2 · Abierto", "2 · Open") }, seg(b)));
      if (a && b) {
        out.push(
          Object.assign(seg(a), {
            label: L("Cerrado → abierto", "Closed → open"),
            sub: L("una tras otra", "one after the other"),
            segs: [
              [a.r0, a.r1],
              [b.r0, b.r1]
            ]
          })
        );
      }
      return out.concat(d.stepChapters((p) => p.sound && !p.ab));
    },
    /** After Stop: open vs closed, in dB and cents (estimates, relative to you). */
    _abCard(ctx, box) {
      const V = global.VTViz;
      const { C } = V;
      const [a, b] = this._abDone();
      if (!a || !b) return;
      const dDb = a.db != null && b.db != null ? b.db - a.db : null;
      const dC = a.midi != null && b.midi != null ? (b.midi - a.midi) * 100 : null;
      const sgn = (x, digits) => {
        const r = Number(Math.abs(x).toFixed(digits));
        return (r === 0 ? "±" : x >= 0 ? "+" : "−") + V.fmtNum(r, digits);
      };
      const facts = [
        dDb != null ? L(`nivel ${sgn(dDb, 1)} dB`, `level ${sgn(dDb, 1)} dB`) : L("nivel —", "level —"),
        dC != null ? L(`tono ${sgn(dC, 0)} cents`, `pitch ${sgn(dC, 0)} cents`) : L("tono —", "pitch —")
      ].join(" · ");
      // What the numbers mean (the long line, and a short one for phones)
      let verdict;
      let short;
      let color;
      if (dDb != null && dDb >= 3) {
        verdict = L("Más espacio ≠ más volumen: la abierta sonó más fuerte", "More space ≠ more volume: the open one was louder");
        short = L("Más fuerte: más espacio ≠ más volumen", "Louder: more space ≠ more volume");
        color = C.warn;
      } else if (dDb != null && dDb <= -3) {
        verdict = L("La abierta sonó más suave: busca el mismo volumen", "The open one was softer: aim for the same loudness");
        short = L("Más suave: busca el mismo volumen", "Softer: aim for the same loudness");
        color = C.muted;
      } else {
        verdict = L("Mismo volumen ✓ · escucha la diferencia de color", "Same loudness ✓ · listen for the change in colour");
        short = L("Mismo volumen ✓ · escucha el color", "Same loudness ✓ · listen for colour");
        color = C.target;
      }
      const moved = dC != null && Math.abs(dC) > 50 ? L(" · la nota se movió", " · the note moved") : "";
      const { x, y, w, h } = box;
      const fit = V.guided?.fitLine || V.fitText;
      ctx.fillStyle = "rgba(170, 195, 230, 0.06)";
      V.roundRect(ctx, x, y, w, h, 8);
      ctx.fill();
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const title = L("Abierta frente a cerrada (aprox.)", "Open vs closed (approx.)");
      if (h >= 60) {
        // Narrow: the title, then the numbers, then what they mean
        ctx.fillStyle = C.muted;
        fit(ctx, title, x + 10, y + 13, w - 20, 11, 700, 9);
        ctx.fillStyle = C.text;
        fit(ctx, facts + moved, x + 10, y + 31, w - 20, 13, 800, 10);
        ctx.fillStyle = color;
        fit(ctx, short, x + 10, y + 49, w - 20, 12, 800, 9);
        return;
      }
      ctx.fillStyle = C.text;
      fit(ctx, title + ": " + facts, x + 10, y + h * 0.3, w - 20, 13, 800, 10);
      ctx.fillStyle = color;
      fit(ctx, verdict + moved, x + 10, y + h * 0.72, w - 20, 12, 800, 9);
    },
    onStart() {
      this.viz?.start?.();
    },
    onFrame(frame) {
      if (this.viz) this.viz.frame(frame);
    },
    onStop() {
      const d = this.viz;
      const st = this.state;
      if (d) {
        if (st.hold) this._endHold();
        if (st.phrase) this._endPhrase(d.run);
        this._syncSpace();
        d.stop();
      }
      const n = st.holds || 0;
      let summary = L(`${n} ${n === 1 ? "sostenido cantado" : "sostenidos cantados"} ≥1,5 s`, `${n} sung ${n === 1 ? "hold" : "holds"} ≥1.5 s`);
      const [a, b] = this._abDone();
      if (a && b && a.db != null && b.db != null) {
        const x = b.db - a.db;
        const V = global.VTViz;
        const r = Number(Math.abs(x).toFixed(1));
        const num = V ? V.fmtNum(r, 1) : r.toFixed(1);
        const sign = r === 0 ? "±" : x >= 0 ? "+" : "−";
        summary += L(` · abierta ${sign}${num} dB aprox. frente a cerrada`, ` · open ${sign}${num} dB approx. vs closed`);
      }
      // Only the sung holds are measured; space and a free jaw stay self-rated
      return { patches: n > 0 ? { openHolds: n } : {}, summary };
    }
  });

  /**
   * s20 five vowels — I E A O U on one pitch, 4 s each. The vowels walk on
   * the clock like a pacer; what is measured is what the microphone can hear
   * of the listed mistakes: the pitch moving when the vowel changes, a vowel
   * sung louder than the others, and — approximately, only at low and middle
   * pitches — each vowel's shape (its first two resonances), read against the
   * learner's own vowels. The "space" and the palate are felt, not measured,
   * so they stay self-rated.
   */
  Modes.vowelLadder = baseMode({
    id: "vowelLadder",
    render() {
      const st = this.state;
      st.vowels = this.profile.vowels || ["I", "E", "A", "O", "U"];
      st.secPer = this.profile.secPerVowel || 4;
      this._resetRun();
      const chips = st.vowels
        .map((v, i) => `<span class="vowel-chip${i === 0 ? " is-on" : ""}" data-v="${i}">${v}</span>`)
        .join("");
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${L("Cinco vocales · I E A O U", "Five vowels · I E A O U")}</div>
        </div>
        <div class="viz-words">
          <span class="vowel-row" data-chips>${chips}</span>
          <strong class="mode-big" data-cur>${st.vowels[0]}</strong>
          <span>${L("Vueltas cantadas", "Rounds sung")} <strong data-r>0</strong></span>
          <span data-status></span>
        </div>
        <p class="mode-meta muted">${L(
          "Una sola nota; la vocal cambia de forma, no de tamaño. Debajo de cada vocal: tu tono y tu volumen.",
          "One note; the vowel changes shape, not size. Under each vowel: your pitch and your level."
        )}</p>
      `;
      if (this.profile.refPitch && global.VT_NOTE_FREQ?.[this.profile.refPitch]) {
        st.refName = this.profile.refPitch;
        st.wantName = this.profile.refPitch;
        this._target();
      }
      this._mountViz();
    },
    _newPage() {
      return {
        cells: this.state.vowels.map(() => ({ cents: null, db: null, f1: null, f2: null, sec: 0, _c: [], _d: [], _f1: [], _f2: [] })),
        trace: []
      };
    },
    _resetRun() {
      const st = this.state;
      st.i = 0;
      st.t = 0;
      st.clock = 0;
      st.sung = 0;
      st.rounds = 0;
      st.pages = [this._newPage()];
      st.prevPage = null;
      st.live = null;
      st.trail = [];
      st.gate = "";
      st.octave = 0;
      st.review = false;
      st._octMs = 0;
      st._frame = 0;
      st._lastTraceAt = -1;
      st._lvl = [];
    },
    _mountViz() {
      const V = global.VTViz;
      if (!V || !V.scenes.vowels || !V.scenes.resonanceKit) return;
      this.hud.classList.add("has-viz");
      this.viz = new V.Surface(this.hud, (ctx, w, h) => V.scenes.vowels(ctx, w, h, this.state), {
        label: L(
          "Cinco vocales en una nota: una columna por vocal con tu tono respecto a la nota (la franja verde es la nota) y, al terminar cada vocal, cuánto se alejó el tono y su volumen frente a las demás. Al lado, la forma aproximada de cada vocal.",
          "Five vowels on one note: a column per vowel with your pitch against the note (the green band is the note) and, when each vowel ends, how far the pitch sat and its level against the others. Beside it, the approximate shape of each vowel."
        ),
        captionHidden: true
      });
      this.viz.draw();
    },
    onStart() {
      this._resetRun();
      this.hud?.classList.remove("is-replay");
      this._syncWords();
      this._ref();
      this.viz?.caption?.(L(`Vocal ${this.state.vowels[0]}`, `Vowel ${this.state.vowels[0]}`), 0);
      this.viz?.draw();
    },
    /** The note, at the octave the octave control asks for. */
    _target() {
      const st = this.state;
      const n = shiftedNote(st.refName);
      if (!n) return null;
      st.target = global.VTPitchUtils?.noteNameToDual ? global.VTPitchUtils.noteNameToDual(n) : n;
      st.targetMidi = global.VT_NOTE_FREQ?.[n] ? 69 + 12 * Math.log2(global.VT_NOTE_FREQ[n] / 440) : null;
      return n;
    },
    _ref() {
      // Published for the app: an ownsTarget mode's current note is what the
      // piano reference sounds on Start, in place of the generic refPitch.
      // The mode does not sound it again at each round: a piano note under
      // the first vowel would be read as the vowel.
      const st = this.state;
      st.wantName = st.refName;
      const n = this._target();
      if (n && typeof global.VTSetPracticeTarget === "function" && global.VT_NOTE_FREQ?.[n]) {
        global.VTSetPracticeTarget(global.VT_NOTE_FREQ[n], n);
      }
    },
    _syncWords() {
      const st = this.state;
      if (this.$("[data-cur]")) this.$("[data-cur]").textContent = st.vowels[st.i];
      if (this.$("[data-r]")) this.$("[data-r]").textContent = String(st.sung);
      this.hud?.querySelectorAll?.(".vowel-chip").forEach((c, idx) => c.classList.toggle("is-on", idx === st.i));
    },
    /** Close the vowel that just ended: medians of its steady part. */
    _closeCell(cell) {
      const K = global.VTViz?.scenes?.resonanceKit;
      const med = K ? K.median : (a) => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : null);
      // A vowel counts once there is a second of steady singing in it
      if (cell._c.length >= 12 && cell.sec >= 1) {
        cell.cents = med(cell._c);
        cell.db = med(cell._d);
      }
      if (cell._f1.length >= 6) {
        cell.f1 = med(cell._f1);
        cell.f2 = med(cell._f2);
      }
    },
    onFrame(frame) {
      const st = this.state;
      const V = global.VTViz;
      const K = V?.scenes?.resonanceKit;
      if (!K || st.review) return;
      const raw = K.rawOf(frame);
      const dt = raw.dt;
      st.t += dt;
      st.clock += dt;
      st._frame++;
      const page = st.pages[st.pages.length - 1];
      const cell = page.cells[st.i];
      const roundX = st.i * st.secPer + st.t;
      let c = null;
      if (raw.sounding && raw.freq && st.targetMidi != null) {
        // Pitch against the note, folded to the nearest octave: an octave
        // match is the same note, sung where the voice lives
        const d = (K.midiOf(raw.freq) - st.targetMidi) * 100;
        const oct = Math.round(d / 1200);
        c = d - oct * 1200;
        st._octMs = oct === st.octave ? 0 : st._octMs + dt * 1000;
        if (st._octMs > 600) {
          st.octave = oct;
          st._octMs = 0;
        }
        // The first half second after a change is the change itself
        if (st.t >= 0.5) {
          cell._c.push(c);
          cell._d.push(raw.db);
          cell.sec += dt;
        }
        st._lvl.push(raw.db);
        if (st._lvl.length > 400) st._lvl.shift();
      }
      if (roundX - st._lastTraceAt >= 1 / 30 || c == null) {
        st._lastTraceAt = roundX;
        page.trace.push({ x: roundX, c, at: st.clock });
      }
      // The vowel's shape, only where it can be read: a steady voiced frame,
      // not the quiet tail of a note, and a pitch low enough for the
      // harmonics to trace the resonances (above ~300 Hz they cannot)
      if (raw.sounding && raw.freq && frame.buf && st._frame % 2 === 0) {
        if (raw.freq > 300) st.gate = "high";
        else {
          const ref = K.median(st._lvl) ?? raw.db;
          st.gate = "";
          if (raw.db > ref - 12) {
            const f = K.formants(frame.buf, frame.sampleRate || 48000);
            if (f && f.f1 >= 1.8 * raw.freq) {
              st.trail.push({ f1: f.f1, f2: f.f2 });
              if (st.trail.length > 8) st.trail.shift();
              const f1 = K.median(st.trail.slice(-5).map((p) => p.f1));
              const f2 = K.median(st.trail.slice(-5).map((p) => p.f2));
              st.live = { f1, f2, at: st.clock };
              if (st.t >= 0.5) {
                cell._f1.push(f.f1);
                cell._f2.push(f.f2);
              }
            }
          }
        }
      } else if (!raw.sounding) st.gate = "";
      // Next vowel on the clock
      if (st.t >= st.secPer) {
        st.t -= st.secPer;
        this._closeCell(cell);
        st.i += 1;
        st.trail = [];
        if (st.i >= st.vowels.length) {
          // A round counts when at least four of its vowels were sung
          const sungCells = page.cells.filter((x) => x.cents != null).length;
          if (sungCells >= Math.min(4, st.vowels.length)) {
            st.sung += 1;
            st.rounds = st.sung;
          }
          st.prevPage = page.cells.some((x) => x.cents != null) ? page : st.prevPage;
          st.pages.push(this._newPage());
          if (st.pages.length > 12) st.pages.splice(1, 1); // keep the first round for the map
          st.i = 0;
          this._ref();
        }
        this._syncWords();
        this.viz?.caption?.(L(`Vocal ${st.vowels[st.i]}`, `Vowel ${st.vowels[st.i]}`), 0);
      }
      this.viz?.draw();
    },
    onStop() {
      const st = this.state;
      const page = st.pages[st.pages.length - 1];
      if (!st.review && page) this._closeCell(page.cells[st.i]);
      st.review = true;
      if (this.viz) {
        this.hud.classList.add("is-replay");
        this.viz.draw();
      }
      const n = st.sung || 0;
      // Facts across every sung vowel: where the pitch sat furthest from the
      // note, and which vowel came out louder than the round around it
      let far = null;
      let loud = null;
      st.pages.forEach((p) => {
        const dbs = p.cells.map((c) => c.db).filter((d) => d != null);
        const mean = dbs.length >= 2 ? dbs.reduce((a, b) => a + b, 0) / dbs.length : null;
        p.cells.forEach((c, i) => {
          if (c.cents != null && (!far || Math.abs(c.cents) > Math.abs(far.c))) far = { v: st.vowels[i], c: c.cents };
          if (mean != null && c.db != null && (!loud || c.db - mean > loud.d)) loud = { v: st.vowels[i], d: c.db - mean };
        });
      });
      const fmt = (x, d = 0) => {
        const s = Math.abs(x).toFixed(d);
        return (x < 0 ? "−" : "+") + (isEs() ? s.replace(".", ",") : s);
      };
      const parts = [L(`${n} ${n === 1 ? "vuelta cantada" : "vueltas cantadas"}`, `${n} ${n === 1 ? "round sung" : "rounds sung"}`)];
      if (far && Math.abs(far.c) > 25) parts.push(L(`tono más lejos en ${far.v} (${fmt(far.c)} ¢)`, `pitch furthest on ${far.v} (${fmt(far.c)} ¢)`));
      if (loud && loud.d > 3) parts.push(L(`más fuerte: ${loud.v} (${fmt(loud.d, 1)} dB)`, `loudest: ${loud.v} (${fmt(loud.d, 1)} dB)`));
      // Only the count is measured; evenness and space stay the learner's rating
      return { patches: n > 0 ? { rounds: n } : {}, summary: parts.join(" · ") };
    }
  });

  /**
   * s21–s25 resonance zones — low / middle / high. One mode, configured with
   * the zones each exercise works: a single zone for the focused drills, all
   * three for the tour. A microphone cannot hear "chest", "mask" or
   * "placement"; it hears which pitch range you are in (that is what a zone
   * is here), how loud you are against yourself, how clear the tone is and
   * how much energy sits high in the spectrum. So the picture is a lane of
   * the zone with your voice and the targets ahead, and beside it the one
   * measurable thing each drill is about (profile.focus):
   *   body   (s21) level against your own average, tone clarity, the lowest
   *                 note you held clear today
   *   speech (s22) your speaking pitch as a band, spoken vs sung turns
   *   bright (s23) brightness against loudness, in the drill's four phases
   *   soft   (s24) level against the volume you started with, per-note cards
   *   seams  (s25) the tour's timeline and what happened at each seam
   * Targets are held by pitch (±45 cents for 0.9 s on sounding frames), and
   * the only scores patched are what that measures: targets held, and — where
   * the exercise names it (profile.stabilityMetric) — pitch steadiness over
   * the holds. Body, buzz, balance, comfort, pushing and transitions stay the
   * learner's own rating.
   *
   * Each new target sounds a short reference note, and a learner sings along
   * with it. The speakers reach the microphone too, so while the note sounds
   * the mic may be hearing the piano: time in tune then is kept aside (refRun)
   * and counts only once the same run carries on by itself, in tune, for
   * ZONE_HOLD_CLEAN_MS after the piano and its tail are gone. If the sound
   * stops when the piano does, it was the piano, and the kept time goes.
   * Everything a card measures (level, clarity, steadiness) comes from the
   * frames heard without the piano.
   */
  const ZONE_REF_SEC = 1.5;
  const ZONE_HOLD_CLEAN_MS = 250;
  Modes.resonanceZone = baseMode({
    id: "resonanceZone",
    render() {
      const zones = this.profile.zones || [];
      const st = this.state;
      st.zones = zones;
      st.focus = this.profile.focus || (zones.length > 1 ? "seams" : "");
      this._resetRun();
      const zl = (z) => (z ? (isEs() ? z.labelEs || z.label : z.label) || "" : "");
      const strip = zones
        .map((z, i) => `<span class="zone-chip${i === 0 ? " is-on" : ""}" data-z="${i}">${zl(z)}</span>`)
        .join("");
      const titles = {
        body: L("Graves con cuerpo · volumen y claridad", "Low notes with body · level and clarity"),
        speech: L("Zona media · de hablar a cantar", "Middle zone · from speech to song"),
        bright: L("«YA» · brillo frente a volumen", "'YA' · brightness against loudness"),
        soft: L("Agudos suaves · volumen de inicio", "Soft high notes · starting volume"),
        seams: L("Recorrido de zonas · las costuras", "Zone tour · the seams")
      };
      const metas = {
        body: L(
          "Tu voz en la zona grave, con tu volumen y lo claro del tono. El cuerpo lo sientes tú.",
          "Your voice in the low zone, with your level and how clear the tone is. The body is yours to feel."
        ),
        speech: L(
          "Di «hola» y luego cántalo: la franja rayada es tu voz hablada.",
          "Say 'hola', then sing it: the hatched band is your speaking voice."
        ),
        bright: L(
          "La máscara la sientes tú; aquí ves el brillo (energía aguda) frente al volumen.",
          "The mask is yours to feel; here you see brightness (high energy) against loudness."
        ),
        soft: L(
          "Empieza suave: tu primer segundo y medio marca tu volumen de inicio.",
          "Start soft: your first second and a half sets your starting volume."
        ),
        seams: L(
          "Graves → medios → agudos. Mira qué pasa en cada costura.",
          "Low → middle → high. See what happens at each seam."
        )
      };
      this.hud.dataset.focus = st.focus || "zone";
      const next =
        st.focus === "bright"
          ? `<button type="button" class="btn btn-sm viz-tap" data-next>${L("Siguiente fase ›", "Next phase ›")}</button>`
          : "";
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${titles[st.focus] || L("Zonas de resonancia", "Resonance zones")}</div>
          ${next}
        </div>
        <div class="viz-words">
          <span class="zone-row" data-zones>${strip}</span>
          <span data-zn>${zl(zones[0])}</span>
          <strong class="mode-big" data-t>${st.allNotes[0] || "—"}</strong>
          <span>${L("Objetivos", "Targets")} <strong data-h>0</strong></span>
          <span>${L("En la zona", "In zone")} <strong data-iz>0 %</strong></span>
          <span data-cue>${phaseCueFor(zones[0])}</span>
          <span data-status></span>
        </div>
        <p class="mode-meta muted">${metas[st.focus] || L("Sostén cada nota objetivo; la zona es el rango de alturas.", "Hold each target note; the zone is the pitch range.")}</p>
      `;
      this.$("[data-next]")?.addEventListener("click", () => this._nextPhase());
      this._mountViz();
    },
    _resetRun() {
      const st = this.state;
      const zones = st.zones || [];
      st.z = 0;
      st.t = 0;
      st.ni = 0;
      st.held = 0;
      st.inBand = 0;
      st.refRun = 0;
      st.holdMs = 900;
      st.holdClean = ZONE_HOLD_CLEAN_MS;
      st.inZoneMs = 0;
      st.voicedMs = 0;
      st.zoneHits = zones.map(() => 0);
      st.allNotes = zones.reduce((a, z) => a.concat(z.notes || []), []);
      st.zoneMidis = zones.map((z) => (z.notes || []).map((x) => this._midiOfNote(x)).filter((x) => x != null));
      st.wantLabel = st.allNotes[0] ? shiftedNote(st.allNotes[0]) : "";
      st.wantMidi = st.allNotes[0] ? this._midiOfNote(st.allNotes[0]) : null;
      st.queue = [];
      st.passes = 0;
      st.clock = 0;
      st.trace = [];
      st._lastTraceAt = -1;
      st.targets = [];
      st.cards = [];
      st._hold = [];
      st.lvl = { vals: [], med: null, now: null, rel: null };
      st.clar = { now: null, lowMs: 0 };
      st.floor = null;
      st.octHint = 0;
      st._octMs = 0;
      st.review = false;
      st._frame = 0;
      st.fresh = null;
      st._m3 = [];
      st._acc = null;
      st._jump = null;
      // speech
      st.sp = { seg: null, turns: [], band: null, pairs: [] };
      // bright
      st.br = { p: 0, phaseHeld: 0, soundSec: 0, vals: [[], [], [], []], base: null, pts: [], med: [null, null, null, null], louder: false };
      // soft
      st.soft = { ref: null, refVals: [], rel: null, overMs: 0 };
      // seams
      st.seams = [];
    },
    _mountViz() {
      const V = global.VTViz;
      if (!V || !V.scenes.zones || !V.scenes.resonanceKit) return;
      this.hud.classList.add("has-viz");
      this.viz = new V.Surface(this.hud, (ctx, w, h) => V.scenes.zones(ctx, w, h, this.state), {
        label: L(
          "Carril de la zona: la franja es el rango de alturas de la zona, tu voz es la línea azul clara y las notas objetivo esperan a la derecha; cada una se llena al sostenerla. Al lado, lo que se mide en este ejercicio.",
          "Zone lane: the band is the zone's pitch range, your voice is the light blue line and the target notes wait on the right; each fills as you hold it. Beside it, what this drill measures."
        ),
        captionHidden: true
      });
      this.viz.draw();
    },
    onStart() {
      const V = global.VTViz;
      this._resetRun();
      this.hud?.classList.remove("is-replay");
      this._setChips();
      this._pushTarget();
      this.viz?.caption?.(this._say(), 0);
      if (V) this.viz?.draw();
    },
    _zoneNotes() {
      return this.state.zones[this.state.z]?.notes || [];
    },
    _midiOfNote(n) {
      const f = global.VT_NOTE_FREQ?.[shiftedNote(n)];
      return f ? 69 + 12 * Math.log2(f / 440) : null;
    },
    /** The notes after the current one, for the queue ahead of "now". */
    _upcoming(k = 3) {
      const notes = this._zoneNotes();
      const out = [];
      for (let j = 1; j <= k && notes.length; j++) {
        const n = notes[(this.state.ni + j) % notes.length];
        out.push({ name: n, label: shiftedNote(n), midi: this._midiOfNote(n) });
      }
      return out;
    },
    _pushTarget() {
      const st = this.state;
      const notes = this._zoneNotes();
      const n = notes[st.ni % Math.max(1, notes.length)];
      if (!n) return;
      const sounded = shiftedNote(n);
      st.wantName = n;
      st.wantLabel = sounded;
      st.wantFreq = global.VT_NOTE_FREQ?.[sounded];
      st.wantMidi = st.wantFreq ? 69 + 12 * Math.log2(st.wantFreq / 440) : null;
      st.queue = this._upcoming(3);
      st.zoneMidis = st.zones.map((z) => (z.notes || []).map((x) => this._midiOfNote(x)).filter((x) => x != null));
      st.inBand = 0;
      st.refRun = 0;
      st._hold = [];
      const last = st.targets[st.targets.length - 1];
      if (last && last.t1 == null) last.t1 = st.clock;
      if (st.wantMidi != null) st.targets.push({ t0: st.clock, t1: null, midi: st.wantMidi, name: sounded, held: false });
      if (st.targets.length > 400) st.targets.splice(0, st.targets.length - 400);
      if (typeof global.VTSetPracticeTarget === "function" && st.wantFreq) {
        global.VTSetPracticeTarget(st.wantFreq, sounded);
      }
      // A short cue, not a drone: while it sounds the hold is only provisional
      if (global.VTPiano?.playRefPitch) global.VTPiano.playRefPitch(sounded, ZONE_REF_SEC, true).catch(() => {});
      if (this.$("[data-t]")) this.$("[data-t]").textContent = sounded;
    },
    _setChips() {
      const st = this.state;
      const z = st.zones[st.z];
      const zl = z ? (isEs() ? z.labelEs || z.label : z.label) || "" : "";
      if (this.$("[data-zn]")) this.$("[data-zn]").textContent = zl;
      if (this.$("[data-cue]")) this.$("[data-cue]").textContent = phaseCueFor(z);
      this.hud?.querySelectorAll?.(".zone-chip").forEach((c, idx) => c.classList.toggle("is-on", idx === st.z));
    },
    _setZone(i) {
      const st = this.state;
      const from = st.z;
      st.z = i;
      st.ni = 0;
      st.inBand = 0;
      st.refRun = 0;
      this._setChips();
      if (from !== i && st.zones.length > 1) {
        // A seam: level just before against level just after, filled in 3 s later
        st.seams.push({ t: st.clock, from, to: i, d: null, pass: st.passes });
        if (st.seams.length > 60) st.seams.shift();
      }
      this._pushTarget();
    },
    /**
     * Which configured zone the detected pitch falls in, or -1. Neighbouring
     * zones share boundary notes on purpose (C3 is the top of the low zone and
     * the bottom of the middle one), so the zone the exercise is currently
     * asking for is checked first — otherwise singing exactly what was asked
     * would score as the wrong zone.
     */
    _zoneOf(freq) {
      if (!freq || !global.VTPitchUtils || !global.VT_NOTE_FREQ) return -1;
      const m = global.VTPitchUtils.freqToMidi(freq);
      const inZone = (i) => {
        const notes = this.state.zones[i]?.notes || [];
        const mids = notes
          .map((n) => global.VT_NOTE_FREQ[shiftedNote(n)])
          .filter(Boolean)
          .map((f) => global.VTPitchUtils.freqToMidi(f));
        if (!mids.length) return false;
        return m >= Math.min(...mids) - 1.5 && m <= Math.max(...mids) + 1.5;
      };
      if (inZone(this.state.z)) return this.state.z;
      for (let i = 0; i < this.state.zones.length; i++) {
        if (i !== this.state.z && inZone(i)) return i;
      }
      return -1;
    },
    /** s23: the drill's four phases — normal, exaggerated, kept, balanced. */
    _nextPhase() {
      const br = this.state.br;
      if (!br || br.p >= 3) return;
      br.p += 1;
      br.phaseHeld = 0;
      this.viz?.caption?.(this._say(), 0);
      this.viz?.draw();
    },
    _say() {
      const st = this.state;
      const t = st.wantLabel || "";
      if (st.focus === "bright") {
        const ph = [L("«YA» normal", "Normal 'YA'"), L("Exagera el «YA»", "Exaggerate the 'YA'"), L("Mantenlo en las notas", "Keep it on the notes"), L("Equilibra el color", "Balance the colour")];
        return `${ph[st.br.p]} · ${t}`;
      }
      return L(`Nota ${t}`, `Note ${t}`);
    },
    /** Pitch steadiness over one hold: SD in cents of the ~200 ms smoothed pitch. */
    _holdSd(samples) {
      const s = samples.filter((x) => x.at >= 0.2);
      if (s.length < 8) return null;
      // A hold finished just after the reference has too little of its own to
      // say how steady it was: no number rather than a flattering one
      if (s[s.length - 1].at - s[0].at < 0.45) return null;
      const sm = [];
      let acc = 0;
      let accT = 0;
      let j = 0;
      for (let i = 0; i < s.length; i++) {
        acc += s[i].c * s[i].dt;
        accT += s[i].dt;
        while (accT - s[j].dt >= 0.2 && j < i) {
          acc -= s[j].c * s[j].dt;
          accT -= s[j].dt;
          j++;
        }
        if (accT >= 0.15) sm.push(acc / accT);
      }
      if (sm.length < 4) return null;
      const mean = sm.reduce((a, b) => a + b, 0) / sm.length;
      return Math.sqrt(sm.reduce((a, b) => a + (b - mean) * (b - mean), 0) / sm.length);
    },
    _credit() {
      const st = this.state;
      const K = global.VTViz?.scenes?.resonanceKit;
      const med = K ? K.median : (a) => (a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : null);
      const h = st._hold;
      const sd = this._holdSd(h);
      const dbs = h.map((x) => x.db);
      const clars = h.map((x) => x.clar).filter((x) => x != null);
      const rels = h.map((x) => x.rel).filter((x) => x != null);
      const card = {
        name: st.wantLabel,
        midi: st.wantMidi,
        z: st.z,
        sd,
        db: med(dbs),
        clar: clars.length >= 4 ? med(clars) : null,
        maxRel: rels.length ? Math.max(...rels) : null,
        t: st.clock
      };
      card.soft = card.maxRel == null ? null : card.maxRel <= 3;
      st.cards.push(card);
      if (st.cards.length > 200) st.cards.shift();
      const cur = st.targets[st.targets.length - 1];
      if (cur) cur.held = true;
      // s21: the lowest note held with a clear tone today
      if (st.focus === "body" && card.clar != null && card.clar >= 0.85 && (!st.floor || card.midi < st.floor.midi)) {
        st.floor = { midi: card.midi, name: card.name };
      }
      st.held += 1;
      st.zoneHits[st.z] += 1;
      st.ni += 1;
      if (st.focus === "bright") {
        st.br.phaseHeld += 1;
        if (st.br.p < 3 && st.br.phaseHeld >= 3) this._nextPhase();
      }
      this._pushTarget();
      if (this.$("[data-h]")) this.$("[data-h]").textContent = String(st.held);
      this.viz?.caption?.(this._say(), 1500);
    },
    onFrame(frame) {
      const st = this.state;
      const K = global.VTViz?.scenes?.resonanceKit;
      if (!K || st.review) return;
      const raw = K.rawOf(frame);
      const dt = raw.dt;
      st.clock += dt;
      st._frame++;
      // Zone advances on time (single-zone exercises simply never advance)
      const zone = st.zones[st.z];
      if (zone && zone.sec && st.zones.length > 1) {
        st.t += dt;
        if (st.t >= zone.sec) {
          st.t = 0;
          const nz = (st.z + 1) % st.zones.length;
          if (nz === 0) st.passes += 1;
          this._setZone(nz);
        }
      }
      const freq = raw.sounding ? raw.freq : null;
      // Median of the last three sounding frames, and a jump of more than
      // four semitones only once it has lasted four frames: a tracker slip
      // at an onset is not your voice, so it is neither drawn nor counted
      let midi = null;
      if (freq) {
        st._m3.push(K.midiOf(freq));
        if (st._m3.length > 3) st._m3.shift();
        const cand = st._m3.length >= 3 ? K.median(st._m3) : null;
        const prev = st._acc;
        if (cand == null) {
          // the first two frames of a sound: too few to outvote a slip
        } else if (prev && st.clock - prev.at < 0.15 && Math.abs(cand - prev.m) > 4) {
          st._jump = st._jump && Math.abs(st._jump.m - cand) <= 1 ? { m: cand, n: st._jump.n + 1 } : { m: cand, n: 1 };
          if (st._jump.n >= 4) midi = cand;
        } else midi = cand;
        if (midi != null) {
          st._acc = { m: midi, at: st.clock };
          st._jump = null;
        }
      } else st._m3 = [];
      // Level against your own average (dB), smoothed ~0.3 s
      const a = 1 - Math.exp(-dt / 0.3);
      if (raw.sounding) {
        st.lvl.vals.push(raw.db);
        if (st.lvl.vals.length > 900) st.lvl.vals.shift();
        if (st._frame % 15 === 0 || st.lvl.med == null) st.lvl.med = K.median(st.lvl.vals);
        st.lvl.now = st.lvl.now == null ? raw.db : st.lvl.now + (raw.db - st.lvl.now) * a;
        st.lvl.rel = st.lvl.vals.length >= 20 ? st.lvl.now - st.lvl.med : null;
      }
      // Spectrum-derived readings, every other frame, only while sounding
      let clar = null;
      let bright = null;
      if (freq && frame.buf && st._frame % 2 === 0) {
        const sr = frame.sampleRate || 48000;
        if (st.focus === "body") clar = K.clarityAt(frame.buf, sr, freq);
        if ((st.focus === "bright" || st.focus === "speech") && (st.lvl.med == null || raw.db > st.lvl.med - 12)) {
          bright = K.brightnessDb(K.powerSpectrum(frame.buf), sr);
        }
      }
      if (clar != null) {
        st.clar.now = st.clar.now == null ? clar : st.clar.now + (clar - st.clar.now) * (1 - Math.exp(-(dt * 2) / 0.4));
        st.clar.lowMs = st.clar.now < 0.8 ? st.clar.lowMs + dt * 2000 : Math.max(0, st.clar.lowMs - dt * 2000);
      }
      if (!raw.sounding) st.clar.lowMs = Math.max(0, st.clar.lowMs - dt * 1000);
      // s24: the starting volume is the first 1.5 s of sound
      const soft = st.soft;
      if (st.focus === "soft" && raw.sounding) {
        if (soft.ref == null) {
          soft.refVals.push(raw.db);
          if (soft.refVals.length * dt >= 1.5 || soft.refVals.length >= 90) soft.ref = K.median(soft.refVals);
        } else {
          soft.rel = st.lvl.now - soft.ref;
          soft.overMs = soft.rel > 3 ? soft.overMs + dt * 1000 : Math.max(0, soft.overMs - dt * 2000);
        }
      }
      // Lane trace, ~30 per second
      if (st.clock - st._lastTraceAt >= 1 / 30 || (midi == null) !== (st.trace[st.trace.length - 1]?.m == null)) {
        st._lastTraceAt = st.clock;
        st.trace.push({ t: st.clock, m: midi, db: raw.sounding ? raw.db : null });
        if (st.trace.length > 36000) st.trace.splice(0, 6000);
      }
      if (midi != null) st.fresh = { m: midi, at: st.clock };
      // In-zone share of sung time
      if (freq) {
        st.voicedMs += dt * 1000;
        if (this._zoneOf(freq) === st.z) st.inZoneMs += dt * 1000;
        if (this.$("[data-iz]") && st._frame % 10 === 0) {
          this.$("[data-iz]").textContent = `${Math.round((st.inZoneMs / st.voicedMs) * 100)} %`;
        }
      }
      // s22: spoken and sung turns
      if (st.focus === "speech") this._speechFrame(raw, midi, bright, dt);
      // s23: brightness against loudness, relative to the normal "YA"
      if (st.focus === "bright") this._brightFrame(raw, bright, dt);
      // s25: fill in each seam's level change once 3 s have passed
      st.seams.forEach((s) => {
        if (s.d == null && st.clock - s.t >= 3) {
          const before = st.trace.filter((p) => p.db != null && p.t >= s.t - 3 && p.t < s.t).map((p) => p.db);
          const after = st.trace.filter((p) => p.db != null && p.t >= s.t && p.t < s.t + 3).map((p) => p.db);
          s.d = before.length >= 15 && after.length >= 15 ? K.median(after) - K.median(before) : NaN;
        }
      });
      // Target hold: ±45 cents at the target's own octave, on sounding frames.
      // A reference note from the speakers reaches the mic too: while one
      // sounds, time in tune is only provisional (refRun, see above).
      const P = global.VTPiano;
      const refSounding = !!(P && P.isSounding && !P.loopActive && P.isSounding(0.25));
      if (st.wantMidi != null) {
        const c = midi != null ? (midi - st.wantMidi) * 100 : null;
        const inTune = c != null && Math.abs(c) <= 45;
        // Silence breaks a run at once; a pitch off the note only wears it down
        const drain = (v, rate) => Math.max(0, v - dt * rate);
        if (refSounding) {
          if (inTune) st.refRun += dt * 1000;
          else st.refRun = drain(st.refRun, c == null ? 6000 : 2000);
        } else if (inTune) {
          st.inBand += dt * 1000;
          st._octMs = 0;
          st.octHint = 0;
          st._hold.push({ c, dt, at: (st.inBand + st.refRun) / 1000, db: raw.db, clar, rel: st.focus === "soft" && soft.ref != null ? soft.rel : null });
          // Sung along with the reference and carried on alone: the kept time counts
          const need = st.refRun > 0 ? Math.max(st.holdClean, st.holdMs - st.refRun) : st.holdMs;
          if (st.inBand >= need) this._credit();
        } else {
          // A brief wobble costs a little, it does not wipe the hold
          st.inBand = Math.max(0, st.inBand - dt * 2000);
          st.refRun = drain(st.refRun, c == null ? 6000 : 2000);
          if (st.inBand === 0) st._hold = [];
          // Singing the same note an octave away: say so once it is steady
          if (c != null && Math.abs(Math.abs(c) - 1200) <= 60) {
            st._octMs += dt * 1000;
            if (st._octMs > 1500) st.octHint = c > 0 ? 1 : -1;
          } else if (c != null) st._octMs = Math.max(0, st._octMs - dt * 1000);
        }
      }
      this.viz?.draw();
    },
    _speechFrame(raw, midi, bright, dt) {
      const sp = this.state.sp;
      const now = this.state.clock;
      if (midi != null) {
        if (!sp.seg) sp.seg = { t0: now, t1: now, pts: [], gap: 0 };
        sp.seg.t1 = now;
        sp.seg.gap = 0;
        sp.seg.pts.push({ t: now, m: midi, db: raw.db, br: bright });
      } else if (sp.seg) {
        sp.seg.gap += dt;
        // A turn ends after a quarter second of quiet
        if (sp.seg.gap >= 0.25) this._endTurn();
      }
    },
    /**
     * Close the turn in progress. Speech moves its pitch every syllable;
     * singing holds one. So a turn is sung when it holds a pitch (within half
     * a semitone) for 0.6 s or more, and a sung turn is measured on that held
     * stretch alone: a note that slides on to the next target when it is
     * credited, or a "hola" run straight into the note, is still the note
     * that was held. Talking just before the held stretch, without a pause,
     * is kept as a spoken turn of its own.
     */
    _endTurn() {
      const sp = this.state.sp;
      const s = sp.seg;
      sp.seg = null;
      if (!s || s.t1 - s.t0 < 0.3 || s.pts.length < 8) return;
      const pts = s.pts;
      let best = null;
      let a = 0;
      let sum = 0;
      for (let j = 0; j < pts.length; j++) {
        const n = j - a;
        const mean = n ? sum / n : pts[j].m;
        const broken = n && (Math.abs(pts[j].m - mean) > 0.5 || pts[j].t - pts[j - 1].t > 0.12);
        if (broken) {
          a = j;
          sum = 0;
        }
        sum += pts[j].m;
        const len = pts[j].t - pts[a].t;
        if (!best || len > best.len) best = { a, b: j, len };
      }
      const sung = best && best.len >= 0.6 ? pts.slice(best.a, best.b + 1) : null;
      if (sung) {
        const before = pts.slice(0, best.a);
        if (before.length >= 8 && before[before.length - 1].t - before[0].t >= 0.3) this._pushTurn("spoken", before);
        this._pushTurn("sung", sung);
      } else this._pushTurn("spoken", pts);
    },
    _pushTurn(kind, pts) {
      const sp = this.state.sp;
      const K = global.VTViz.scenes.resonanceKit;
      const brs = pts.map((p) => p.br).filter((b) => b != null);
      const turn = {
        t0: pts[0].t,
        t1: pts[pts.length - 1].t,
        kind,
        med: K.median(pts.map((p) => p.m)),
        db: K.median(pts.map((p) => p.db)),
        br: brs.length >= 4 ? K.median(brs) : null
      };
      sp.turns.push(turn);
      if (sp.turns.length > 120) sp.turns.shift();
      const spoken = sp.turns.filter((x) => x.kind === "spoken").slice(-12);
      if (kind === "spoken") {
        const all = spoken.map((x) => x.med);
        sp.band = { lo: K.quantile(all, 0.25) - 0.5, hi: K.quantile(all, 0.75) + 0.5, med: K.median(all) };
        return;
      }
      const lastSpoken = spoken[spoken.length - 1];
      if (!lastSpoken) return;
      sp.pairs.push({
        dDb: turn.db - lastSpoken.db,
        dBr: turn.br != null && lastSpoken.br != null ? turn.br - lastSpoken.br : null,
        dSt: turn.med - lastSpoken.med,
        t: turn.t1
      });
      if (sp.pairs.length > 40) sp.pairs.shift();
    },
    _brightFrame(raw, bright, dt) {
      const st = this.state;
      const br = st.br;
      const K = global.VTViz.scenes.resonanceKit;
      if (raw.sounding) br.soundSec += dt;
      // The normal "YA" moves on by itself after 3 s of sound
      if (br.p === 0 && br.soundSec >= 3 && br.vals[0].length >= 20) this._nextPhase();
      if (bright == null) return;
      br.vals[br.p].push({ db: raw.db, br: bright });
      if (br.vals[br.p].length > 600) br.vals[br.p].shift();
      if (br.p === 0 || !br.base) {
        const v = br.vals[0];
        if (v.length >= 10) br.base = { db: K.median(v.map((x) => x.db)), br: K.median(v.map((x) => x.br)) };
      }
      if (!br.base) return;
      br.pts.push({ t: st.clock, x: raw.db - br.base.db, y: bright - br.base.br });
      while (br.pts.length && st.clock - br.pts[0].t > 3) br.pts.shift();
      if (st._frame % 10 === 0) {
        br.med = br.vals.map((v) =>
          v.length >= 10 ? { x: K.median(v.map((q) => q.db)) - br.base.db, y: K.median(v.map((q) => q.br)) - br.base.br } : null
        );
        // Louder without brighter, over the last 1.5 s
        const recent = br.pts.filter((p) => st.clock - p.t <= 1.5);
        if (br.p > 0 && recent.length >= 10) {
          const x = K.median(recent.map((p) => p.x));
          const y = K.median(recent.map((p) => p.y));
          br.louder = x >= 4 && y < 1;
        } else br.louder = false;
      }
    },
    onStop() {
      const st = this.state;
      const K = global.VTViz?.scenes?.resonanceKit;
      const last = st.targets[st.targets.length - 1];
      if (last && last.t1 == null) last.t1 = st.clock;
      // A turn still sounding at Stop is a turn too (s22)
      if (st.focus === "speech" && st.sp.seg && K) this._endTurn();
      st.review = true;
      if (this.viz) {
        this.hud.classList.add("is-replay");
        this.viz.draw();
      }
      const held = st.held || 0;
      const pct = st.voicedMs ? Math.round((st.inZoneMs / st.voicedMs) * 100) : 0;
      const patches = {};
      if (held > 0) patches.zoneTargets = held;
      // Pitch steadiness over the holds, where the exercise scores it. s24's
      // is steadiness at soft volume, so only the holds sung soft count.
      const key =
        this.profile.stabilityMetric !== undefined
          ? this.profile.stabilityMetric
          : st.zones.length > 1
            ? null
            : "steadiness";
      const used = st.cards.filter((c) => c.sd != null && (st.focus !== "soft" || c.soft !== false));
      let sdMed = null;
      if (key && used.length >= 2) {
        sdMed = K ? K.median(used.map((c) => c.sd)) : used[0].sd;
        patches[key] = sdMed <= 8 ? 5 : sdMed <= 15 ? 4 : sdMed <= 25 ? 3 : sdMed <= 40 ? 2 : 1;
      }
      const parts = [
        L(`${held} ${held === 1 ? "objetivo" : "objetivos"}`, `${held} ${held === 1 ? "target" : "targets"}`),
        L(`${pct} % en la zona`, `${pct}% in zone`)
      ];
      if (sdMed != null) parts.push(L(`tono ±${Math.round(sdMed)} ¢`, `pitch ±${Math.round(sdMed)} ¢`));
      if (st.focus === "body" && st.floor) parts.push(L(`nota clara más grave: ${st.floor.name}`, `lowest clear note: ${st.floor.name}`));
      if (st.focus === "soft") {
        const known = st.cards.filter((c) => c.soft != null);
        if (known.length) {
          const n = known.filter((c) => c.soft).length;
          parts.push(L(`${n} de ${known.length} notas suaves`, `${n} of ${known.length} notes soft`));
        }
      }
      if (st.focus === "speech" && st.sp.pairs.length) {
        const d = K.median(st.sp.pairs.map((p) => p.dDb));
        const s = (Math.abs(d) < 0.05 ? "" : d > 0 ? "+" : "−") + Math.abs(d).toFixed(1);
        parts.push(L(`cantado frente a hablado: ${s.replace(".", ",")} dB`, `sung vs spoken: ${s} dB`));
      }
      if (st.focus === "seams") {
        const big = st.seams.filter((s) => Number.isFinite(s.d) && Math.abs(s.d) > 3);
        const zl = (i) => (isEs() ? st.zones[i]?.labelEs || st.zones[i]?.label : st.zones[i]?.label) || "";
        if (big.length) {
          const b = big.reduce((x, y) => (Math.abs(y.d) > Math.abs(x.d) ? y : x));
          const s = (b.d > 0 ? "+" : "−") + Math.abs(b.d).toFixed(1);
          parts.push(L(`costura más marcada: ${zl(b.to)} (${s.replace(".", ",")} dB)`, `biggest seam: ${zl(b.to)} (${s} dB)`));
        } else if (st.seams.some((s) => Number.isFinite(s.d))) parts.push(L("costuras parejas", "even seams"));
      }
      return { patches, summary: parts.join(" · ") };
    }
  });

  /**
   * s26 placement A/B — the same phrase twice, plain then placed, then
   * listen. The ear is the judge; what the microphone adds is a fair
   * comparison. Each take starts by itself when you sing and ends after two
   * seconds of quiet (or on "Take done"); the audio is kept in memory on
   * this device only, for ▶ A / ▶ B playback, optionally level-matched.
   * Beside the takes: whether they are comparable — same key (±50 cents),
   * same volume (±3 dB), the same melody — and, approximately, how the
   * brightness and the spectrum's shape differ. Nothing says which take is
   * better; the learner rates that.
   */
  Modes.placementAB = baseMode({
    id: "placementAB",
    render() {
      const st = this.state;
      st.phases = this.profile.phases || [];
      this._resetRun();
      this.hud.innerHTML = `
        <div class="viz-row viz-head ab-head">
          <div class="mode-title">${L("Comparar colocaciones · A/B", "Placement compare · A/B")}</div>
          <div class="ab-btns">
            <button type="button" class="btn btn-sm viz-tap" data-take>${L("Toma lista ✓", "Take done ✓")}</button>
            <button type="button" class="btn btn-sm viz-tap" data-play="A" hidden>▶ A</button>
            <button type="button" class="btn btn-sm viz-tap" data-play="B" hidden>▶ B</button>
            <button type="button" class="btn btn-sm viz-tap" data-match aria-pressed="false" hidden>${L("= volumen", "= level")}</button>
            <button type="button" class="btn btn-sm viz-tap" data-retake hidden>${L("↺ Toma B", "↺ Take B")}</button>
          </div>
        </div>
        <div class="viz-words">
          <span data-phase>${st.phases[0] ? phaseLabelFor(st.phases[0]) : L("Toma A", "Take A")}</span>
          <span>${L("Tomas", "Takes")} <strong data-n>0</strong>/2</span>
          <span data-cue>${phaseCueFor(st.phases[0])}</span>
          <span data-facts></span>
          <span data-status></span>
        </div>
        <p class="mode-meta muted">${L(
          "Misma frase, misma tonalidad, mismo volumen. Luego escucha las dos: decide tu oído. Las tomas no salen de este dispositivo.",
          "Same phrase, same key, same volume. Then listen to both: your ear decides. The takes stay on this device."
        )}</p>
      `;
      this.$("[data-take]")?.addEventListener("click", () => this._markTake());
      this.hud.querySelectorAll("[data-play]").forEach((b) => b.addEventListener("click", () => this._play(b.dataset.play)));
      this.$("[data-match]")?.addEventListener("click", () => {
        st.match = !st.match;
        this._syncButtons();
        if (st.playing) this._play(st.playing.which, true);
        this.viz?.draw();
      });
      this.$("[data-retake]")?.addEventListener("click", () => this._retakeB());
      this._mountViz();
      this._syncButtons();
    },
    _resetRun() {
      const st = this.state;
      this._stopPlay?.();
      const K = global.VTViz?.scenes?.resonanceKit;
      st.stage = "A";
      st.takes = 0;
      st.A = null;
      st.B = null;
      st.cur = null;
      st.recording = false;
      st.facts = null;
      st.match = false;
      st.playing = null;
      st.review = false;
      st.clock = 0;
      st._onMs = 0;
      st._sil = 0;
      st._mute = 0;
      st._frame = 0;
      st._m3 = [];
      st.cap = K ? new K.Capture(30) : null;
    },
    _mountViz() {
      const V = global.VTViz;
      if (!V || !V.scenes.abTakes || !V.scenes.resonanceKit) return;
      this.hud.classList.add("has-viz");
      this.viz = new V.Surface(this.hud, (ctx, w, h) => V.scenes.abTakes(ctx, w, h, this.state), {
        label: L(
          "Dos tomas, A arriba y B abajo: la línea es tu altura frente a la de la toma A y la sombra tu volumen. Al lado, si las tomas se pueden comparar (misma tonalidad, mismo volumen, misma melodía) y en qué se diferencian, aproximadamente.",
          "Two takes, A on top and B below: the line is your pitch against take A's and the shade your level. Beside them, whether the takes compare fairly (same key, same volume, same melody) and how they differ, approximately."
        ),
        captionHidden: true
      });
      this.viz.draw();
    },
    onStart() {
      this._resetRun();
      this.hud?.classList.remove("is-replay");
      this._syncButtons();
      this.viz?.caption?.(L("Toma A: canta la frase", "Take A: sing the phrase"), 0);
      this.viz?.draw();
    },
    _stageLabel() {
      const st = this.state;
      const p = st.phases;
      if (st.review) return L("Tus dos tomas", "Your two takes");
      if (st.stage === "A") return p[0] ? phaseLabelFor(p[0]) : L("Toma A", "Take A");
      if (st.stage === "B") return p[1] ? phaseLabelFor(p[1]) : L("Toma B", "Take B");
      return p[2] ? phaseLabelFor(p[2]) : L("Escucha las dos", "Listen to both");
    },
    _syncButtons() {
      const st = this.state;
      const q = (s) => this.$(s);
      const taking = !st.review && (st.stage === "A" || st.stage === "B");
      const listening = st.review || st.stage === "listen";
      const has = (k) => !!(st[k] && st[k].samples && st[k].samples.length);
      if (q("[data-take]")) q("[data-take]").hidden = !taking;
      ["A", "B"].forEach((k) => {
        const b = q(`[data-play="${k}"]`);
        if (!b) return;
        // During take B, ▶ A recalls the key (nothing is recorded while it plays)
        const recall = k === "A" && st.stage === "B" && !st.recording && !st.review;
        b.hidden = !((listening || recall) && has(k));
        b.textContent = st.playing && st.playing.which === k ? `■ ${k}` : `▶ ${k}`;
        b.setAttribute("aria-label", st.playing && st.playing.which === k ? L(`Parar la toma ${k}`, `Stop take ${k}`) : L(`Escuchar la toma ${k}`, `Play take ${k}`));
      });
      if (q("[data-match]")) {
        q("[data-match]").hidden = !(listening && has("A") && has("B"));
        q("[data-match]").setAttribute("aria-pressed", st.match ? "true" : "false");
      }
      if (q("[data-retake]")) q("[data-retake]").hidden = !(st.stage === "listen" && !st.review);
      if (q("[data-n]")) q("[data-n]").textContent = String(st.takes);
      if (q("[data-phase]")) q("[data-phase]").textContent = this._stageLabel();
      const cueIdx = st.stage === "A" ? 0 : st.stage === "B" ? 1 : 2;
      if (q("[data-cue]")) q("[data-cue]").textContent = phaseCueFor(st.phases[cueIdx]);
      if (q("[data-facts]")) q("[data-facts]").textContent = this._factsText();
    },
    /** "Take done": ends the take being sung; with nothing recorded it still marks one. */
    _markTake() {
      const st = this.state;
      if (st.review || (st.stage !== "A" && st.stage !== "B")) return;
      if (st.recording && st.cur && st.cur.sound >= 0.3) {
        this._endTake();
        return;
      }
      if (st.recording) this._dropTake();
      st[st.stage] = { name: st.stage, noAudio: true, pts: [], dur: 0 };
      this._advance();
    },
    _advance() {
      const st = this.state;
      st.takes = Math.min(2, st.takes + 1);
      if (st.stage === "A") st.stage = "B";
      else if (st.stage === "B") {
        st.stage = "listen";
        st.facts = this._facts();
      }
      this._syncButtons();
      this.viz?.caption?.(this._stageLabel(), 0);
      this.viz?.draw();
    },
    _retakeB() {
      const st = this.state;
      if (st.review) return;
      this._stopPlay();
      st.B = null;
      st.facts = null;
      st.stage = "B";
      st.takes = Math.min(st.takes, 1);
      st._onMs = 0;
      this._syncButtons();
      this.viz?.draw();
    },
    _startTake() {
      const st = this.state;
      if (!st.cap) return;
      st.cap.start();
      st.recording = true;
      st._sil = 0;
      st.cur = { name: st.stage, t0: st.clock - 0.15, pts: [], dbs: [], bright: [], ltasSum: null, ltasN: 0, sound: 0.15, dur: 0.15 };
      this.viz?.caption?.(L(`Grabando la toma ${st.stage}`, `Recording take ${st.stage}`), 0);
    },
    _dropTake() {
      const st = this.state;
      st.cap?.stop();
      st.recording = false;
      st.cur = null;
      st._onMs = 0;
    },
    _endTake() {
      const st = this.state;
      const K = global.VTViz?.scenes?.resonanceKit;
      const tk = st.cur;
      if (!tk || !K) return;
      // Keep a third of a second of the quiet that ended the take
      const recorded = st.cap.length / (st.cap.sr || 48000);
      const keep = Math.max(0.5, recorded - Math.max(0, st._sil - 0.3));
      tk.sr = st.cap.sr;
      tk.samples = st.cap.stop(keep);
      tk.dur = Math.max(0.1, tk.dur - Math.max(0, st._sil - 0.3));
      tk.pts = tk.pts.filter((p) => p.t <= tk.dur);
      st.recording = false;
      st.cur = null;
      st._onMs = 0;
      // The take's own level: its sounding frames without the quiet tails
      const loud = tk.dbs.length ? K.median(tk.dbs) : null;
      const body = loud == null ? [] : tk.dbs.filter((d) => d > loud - 15);
      tk.medDb = body.length ? K.median(body) : null;
      const ms = tk.pts.filter((p) => p.m != null).map((p) => p.m);
      tk.medMidi = ms.length >= 5 ? K.median(ms) : null;
      tk.bright = tk.bright.length >= 6 ? K.median(tk.bright) : null;
      if (tk.ltasN >= 6) {
        const db = tk.ltasSum.map((v) => 10 * Math.log10(v / tk.ltasN + 1e-20));
        const top = Math.max(...db);
        tk.ltas = db.map((v) => v - top);
      } else tk.ltas = null;
      tk.peak = K.peakOf(tk.samples);
      delete tk.dbs;
      delete tk.ltasSum;
      st[tk.name] = tk;
      this._advance();
    },
    /** Is the comparison fair, and what differs — measured, approximate. */
    _facts() {
      const st = this.state;
      const K = global.VTViz?.scenes?.resonanceKit;
      const A = st.A;
      const B = st.B;
      if (!K || !A || !B || A.noAudio || B.noAudio) return null;
      const f = { durA: A.dur, durB: B.dur };
      f.key = A.medMidi != null && B.medMidi != null ? (B.medMidi - A.medMidi) * 100 : null;
      f.vol = A.medDb != null && B.medDb != null ? B.medDb - A.medDb : null;
      f.bright = A.bright != null && B.bright != null ? B.bright - A.bright : null;
      // The melody: both pitch lines stretched to the same length, correlated
      const res = (tk) => {
        const p = tk.pts.filter((q) => q.m != null);
        if (p.length < 10) return null;
        const out = [];
        const t0 = p[0].t;
        const t1 = p[p.length - 1].t;
        for (let i = 0; i < 40; i++) {
          const t = t0 + ((t1 - t0) * i) / 39;
          let best = p[0];
          for (const q of p) if (Math.abs(q.t - t) < Math.abs(best.t - t)) best = q;
          out.push(best.m);
        }
        return out;
      };
      const ra = res(A);
      const rb = res(B);
      f.corr = ra && rb ? K.correlation(ra, rb) : null;
      // A flat melody (one held note) correlates by chance: only judge a moving one
      if (ra && rb && Math.max(...ra) - Math.min(...ra) < 1.5) f.corr = null;
      f.keyOk = f.key == null || Math.abs(f.key) <= 50;
      f.volOk = f.vol == null || Math.abs(f.vol) <= 3;
      f.melOk = f.corr == null || f.corr >= 0.5;
      f.fair = f.keyOk && f.volOk && f.melOk;
      return f;
    },
    _factsText() {
      const st = this.state;
      const f = st.facts;
      if (!f) return "";
      const n1 = (x) => {
        const s = Math.abs(x).toFixed(1);
        return (x < 0 ? "−" : "+") + (isEs() ? s.replace(".", ",") : s);
      };
      const parts = [];
      if (f.key != null) parts.push(f.keyOk ? L("misma tonalidad", "same key") : L(`B ${n1(f.key / 100)} semitonos`, `B ${n1(f.key / 100)} semitones`));
      if (f.vol != null) parts.push(f.volOk ? L("mismo volumen", "same volume") : L(`B ${n1(f.vol)} dB`, `B ${n1(f.vol)} dB`));
      if (f.corr != null && !f.melOk) parts.push(L("¿la misma frase?", "the same phrase?"));
      if (f.bright != null) parts.push(L(`brillo B ${n1(f.bright)} dB (aprox.)`, `brightness B ${n1(f.bright)} dB (approx.)`));
      return parts.join(" · ");
    },
    _play(which, restart) {
      const st = this.state;
      const K = global.VTViz?.scenes?.resonanceKit;
      const tk = st[which];
      if (!K || !tk || !tk.samples) return;
      const same = st.playing && st.playing.which === which;
      this._stopPlay();
      if (same && !restart) return;
      // Level-matched: the louder take is turned down to the softer one
      let gain = 1;
      if (st.match && st.A?.medDb != null && st.B?.medDb != null) {
        const target = Math.min(st.A.medDb, st.B.medDb);
        gain = Math.pow(10, (target - tk.medDb) / 20);
      }
      const stop = K.playSamples(tk.samples, tk.sr || 48000, gain, () => {
        if (st.playing && st.playing.stop === stop) {
          st.playing = null;
          this._syncButtons();
          this.viz?.draw();
        }
      });
      if (!stop) {
        if (this.$("[data-status]")) this.$("[data-status]").textContent = L("No se pudo reproducir", "Could not play back");
        return;
      }
      st.playing = { which, at: performance.now(), dur: tk.samples.length / (tk.sr || 48000), stop };
      this._syncButtons();
      this._tick();
    },
    _stopPlay() {
      const st = this.state;
      if (st && st.playing) {
        const p = st.playing;
        st.playing = null;
        try {
          p.stop();
        } catch {
          /* already stopped */
        }
        this._syncButtons?.();
      }
    },
    /** Leaving the exercise or starting again stops a take that is playing. */
    onUnmount() {
      this._stopPlay();
    },
    /**
     * While a take plays: after Stop no frames arrive, so this redraws the
     * playhead; and once the panel is gone (the learner left the exercise)
     * it stops the take instead of letting it play on.
     */
    _tick() {
      const st = this.state;
      if (!st.playing || !global.requestAnimationFrame) return;
      requestAnimationFrame(() => {
        if (!st.playing) return;
        if (!this.hud) {
          this._stopPlay();
          return;
        }
        if (st.review && !global.VTViz?.reducedMotion?.()) this.viz?.draw();
        this._tick();
      });
    },
    onFrame(frame) {
      const st = this.state;
      const K = global.VTViz?.scenes?.resonanceKit;
      if (!K || st.review) return;
      const raw = K.rawOf(frame);
      const dt = raw.dt;
      st.clock += dt;
      st._frame++;
      // Listening: nothing is recorded, so playback is never taken for a take
      if (st.stage === "listen") {
        if (st.playing) this.viz?.draw();
        return;
      }
      st.cap?.feed(frame);
      let midi = null;
      if (raw.sounding && raw.freq) {
        st._m3.push(K.midiOf(raw.freq));
        if (st._m3.length > 3) st._m3.shift();
        midi = K.median(st._m3);
      } else st._m3 = [];
      if (!st.recording) {
        // Not while a take is playing back, nor just after: that is not you
        if (st.playing) st._mute = 0.4;
        else if (st._mute > 0) st._mute -= dt;
        st._onMs = raw.sounding && !st.playing && !(st._mute > 0) ? st._onMs + dt * 1000 : 0;
        if (st._onMs >= 150) {
          this._startTake();
          this._syncButtons();
        }
      }
      const tk = st.cur;
      if (st.recording && tk) {
        tk.dur = st.clock - tk.t0;
        if (raw.sounding) {
          tk.sound += dt;
          st._sil = 0;
          tk.dbs.push(raw.db);
        } else st._sil += dt;
        const last = tk.pts[tk.pts.length - 1];
        if (!last || tk.dur - last.t >= 0.04 || (midi == null) !== (last.m == null)) {
          tk.pts.push({ t: tk.dur, m: midi, db: raw.sounding ? raw.db : null });
        }
        // Spectrum of the take, every other sounding frame
        if (raw.sounding && frame.buf && st._frame % 2 === 0) {
          const sr = frame.sampleRate || 48000;
          const spec = K.powerSpectrum(frame.buf);
          const b = K.brightnessDb(spec, sr);
          if (b != null) tk.bright.push(b);
          if (sr >= 16000) {
            const bands = K.thirdOctave(spec, sr);
            if (!tk.ltasSum) tk.ltasSum = bands.map(() => 0);
            bands.forEach((v, i) => (tk.ltasSum[i] += v));
            tk.ltasN += 1;
          }
        }
        if (st._sil >= 1.8) {
          if (tk.sound >= 1.2) this._endTake();
          else this._dropTake();
        } else if (tk.dur >= 29.5) this._endTake();
      }
      this.viz?.draw();
    },
    onStop() {
      const st = this.state;
      if (st.recording && st.cur) {
        if (st.cur.sound >= 1.2) this._endTake();
        else this._dropTake();
      }
      st.review = true;
      if (this.viz) {
        this.hud.classList.add("is-replay");
        this.viz.draw();
      }
      this._syncButtons();
      const n = st.takes || 0;
      const f = st.facts;
      const parts = [L(`${n}/2 tomas`, `${n}/2 takes`)];
      const t = this._factsText();
      if (t) parts.push(t);
      else if (n >= 2) parts.push(L("escucha las dos", "listen to both"));
      if (f && !f.fair) parts.push(L("repite B para comparar en igualdad", "retake B for a fair comparison"));
      // Only the count is measured; which take was better is the learner's call
      return { patches: n > 0 ? { takes: n } : {}, summary: parts.join(" · ") };
    }
  });

  /**
   * s27 lip-trill solfège — a scale carried on the bubble, root walking up and
   * back down. This is deliberately NOT `scaleSteps` with a different cue.
   *
   * Two things make a trill different from a vowel scale, and both were measured
   * against the shipped detector rather than guessed:
   *
   * 1. `detectPitch` reads a lip trill SHARP. The lips flutter at 25–30 Hz, which
   *    is below the 65 Hz search floor in js/pitch-visualizer.js, so the flap
   *    lands inside the analysis window instead of being resolved, and the
   *    autocorrelation peak drifts up — of the order of +30…+60 cents at C3–D3,
   *    less as pitch rises. A symmetric ±40¢ band (what `scaleSteps` uses) sits
   *    below a correctly sung trill and never advances. So the acceptance window
   *    here is ASYMMETRIC: tolerant sharp, tight flat. Tight on the flat side
   *    matters — a wide-open flat side would lock on the note before it at the
   *    two half steps in the pattern.
   * 2. A trill scatters frame to frame, so a hard `else acc = 0` reset (again
   *    what `scaleSteps` does) throws away the whole accumulator on one stray
   *    frame. The accumulator bleeds at half fill rate instead, which needs
   *    about 1.2s of continuously bad frames to undo a full 600ms lock.
   *
   * The sharp-side figure comes from simulating trills through the real
   * `detectPitch`, not from recordings of actual students, so every constant is
   * overridable from the profile.
   */
  Modes.trillSolfege = baseMode({
    id: "trillSolfege",
    render() {
      const p = this.profile;
      this.state.pattern = p.pattern || [0, 2, 4, 5, 7, 5, 4, 2, 0];
      this.state.syllables = p.syllables || ["DO", "RE", "MI", "FA", "SOL", "FA", "MI", "RE", "DO"];
      this.state.baseMidi = p.rootMidi || 48; // C3
      this.state.topMidi = p.topRootMidi || this.state.baseMidi + 7; // walk up a fifth
      this.state.rootMidi = this.state.baseMidi;
      this.state.dir = 1;
      this.state.i = 0;
      this.state.patterns = 0;
      this.state.acc = 0;
      this.state.hist = [];
      this.state.lastFreq = null;
      this.state.refBlank = 0;
      this.state.review = false;
      this.state.rows = [];
      this.state.rec = [];
      this.state.stallMarks = [];
      this.hud.innerHTML = `
        <div class="viz-row viz-head">
          <div class="mode-title">${L("Solfeo en trino de labios", "Lip-trill solfège")}</div>
        </div>
        <div class="viz-words">
          <span data-syl>${this.state.syllables[0]}</span>
          <span data-note>—</span>
          <span data-ev>—</span>
          <span>${L("Paso", "Step")} <strong data-step>1</strong>/${this.state.pattern.length} · ${L(
            "Pasadas",
            "Patterns"
          )} <strong data-p>0</strong> · ${L("Raíz", "Root")} <strong data-root>—</strong></span>
        </div>
        <p class="mode-meta muted">${L(
          "En la autopista: las notas que vienen y, abajo, tu burbujeo (zigzag; plano si los labios se paran). Aquí, cada pasada nota a nota.",
          "On the highway: the notes coming next and, along the bottom, your bubble (zig-zag; flat if the lips stop). Here, each pattern note by note."
        )}</p>
      `;
      this._mountViz();
      this._lockLadder();
      this._pushTarget();
    },
    _kit() {
      return global.VTViz?.scenes?.breathKit || null;
    },
    _mountViz() {
      const V = global.VTViz;
      const K = this._kit();
      if (!V || !K || !V.scenes.trillMap) return;
      this.hud.classList.add("has-viz");
      this.state.track = new K.TrillTrack({ onTags: [K.T.TRILL, K.T.AIRTRILL] });
      this.viz = new V.Surface(this.hud, (ctx, w, h) => V.scenes.trillMap(ctx, w, h, this._mapModel()), {
        label: L(
          "Pasadas del solfeo en trino: una fila por pasada y una piedra por nota. Zigzag: el burbujeo siguió toda la nota; línea plana con muesca: los labios se pararon; línea plana sin muesca: sonó sin burbuja; contorno: por cantar.",
          "Lip-trill solfège patterns: one row per pattern, one stone per note. Zig-zag: the bubble carried the whole note; flat line with a notch: the lips stopped; flat line alone: sung with no bubble; outline: still to sing."
        ),
        captionHidden: true
      });
      this._newRow();
      this.viz.draw();
    },
    /** Real sounding MIDI: the highway plots detected pitch, not written pitch. */
    _shift() {
      return 12 * (global.VTGetOctaveShift ? global.VTGetOctaveShift() : 0);
    },
    /**
     * Lock the highway once over the whole ladder — base root to the top note of
     * the highest pattern — so the Y axis does not jump every time the root moves.
     */
    _lockLadder() {
      if (!global.VTPitchUtils || typeof global.VTGetPitchViz !== "function") return;
      const viz = global.VTGetPitchViz();
      if (!viz?.lockMidiRange) return;
      const sh = this._shift();
      // Two semitones more below the lowest note: the bubble strip runs there
      viz.lockMidiRange(
        this.state.baseMidi + Math.min(...this.state.pattern) + sh - 2,
        this.state.topMidi + Math.max(...this.state.pattern) + sh,
        { pad: 1.5, minSpan: 10 }
      );
      this._drawLanes();
    },
    /**
     * Ghost lanes for the pattern at the CURRENT root only. The ladder spans
     * fifteen semitones, and a lane on every one of them is a chromatic wall
     * that buries the five notes the student is actually being asked for.
     */
    _drawLanes() {
      if (!global.VTPitchUtils || typeof global.VTGetPitchViz !== "function") return;
      const viz = global.VTGetPitchViz();
      if (!viz) return;
      const sh = this._shift();
      const seen = new Set();
      viz.progressionLanes = [];
      this.state.pattern.forEach((step) => {
        const m = this.state.rootMidi + step + sh;
        if (seen.has(m)) return;
        seen.add(m);
        viz.progressionLanes.push({
          name: global.VTPitchUtils.midiToName(m),
          freq: global.VTPitchUtils.midiToFreq(m),
          midi: m,
          active: false
        });
      });
      viz.progressionLanes.sort((a, b) => a.midi - b.midi);
      try {
        viz._draw?.();
      } catch {
        /* ignore */
      }
    },
    _pushTarget() {
      if (!global.VTPitchUtils) return;
      const midi = this.state.rootMidi + this.state.pattern[this.state.i];
      const name = global.VTPitchUtils.midiToName(midi);
      const sounded = shiftedNote(name);
      this.state.wantName = name;
      this.state.wantFreq =
        global.VT_NOTE_FREQ?.[sounded] ?? global.VTPitchUtils.midiToFreq(midi);
      this.state.hist = [];
      this.state.lastFreq = null;
      if (typeof global.VTSetPracticeTarget === "function" && this.state.wantFreq) {
        global.VTSetPracticeTarget(this.state.wantFreq, sounded);
      }
      // The reference note bleeds into the mic (the app asks for no echo
      // cancellation), so the gate stays shut while it rings. Counted down in
      // frame time like everything else here, not against the wall clock.
      this.state.refBlank = this.profile.refBlankMs == null ? 250 : this.profile.refBlankMs;
      if (global.VTPiano?.playRefPitch && sounded) {
        global.VTPiano.playRefPitch(sounded, 1.2, true).catch(() => {});
      }
      if (this.$("[data-syl]"))
        this.$("[data-syl]").textContent = this.state.syllables[this.state.i] || "";
      if (this.$("[data-note]")) this.$("[data-note]").textContent = sounded;
      if (this.$("[data-step]")) this.$("[data-step]").textContent = String(this.state.i + 1);
      if (this.$("[data-root]"))
        this.$("[data-root]").textContent = shiftedNote(
          global.VTPitchUtils.midiToName(this.state.rootMidi)
        );
      this._pushQueue();
    },
    /** The rest of the pattern, read ahead on the highway: DO RE MI … */
    _pushQueue() {
      if (!this._ownsOverlay) return;
      const pv = typeof global.VTGetPitchViz === "function" ? global.VTGetPitchViz() : null;
      if (!pv?.setNoteQueue) return;
      const st = this.state;
      const sh = this._shift();
      const items = [];
      for (let k = st.i; k < st.pattern.length; k++) {
        const m = st.rootMidi + st.pattern[k] + sh;
        items.push({ midi: m, label: st.syllables[k] || "", sub: global.VTPitchUtils?.midiToName(m) || "" });
      }
      pv.setNoteQueue(items);
      pv.setQueueProgress?.(0);
    },
    /** A new row of stones for the pattern at the current root. */
    _newRow() {
      const st = this.state;
      const K = this._kit();
      if (!K) return;
      st.rows.push({
        root: st.rootMidi,
        rootName: K.noteName(st.rootMidi + this._shift()),
        stones: st.pattern.map(() => ({ state: "todo", trillSec: 0, soundSec: 0, stalls: 0, frac: 0 }))
      });
      if (st.rows.length > 40) st.rows.shift();
    },
    /** What the finished note was: bubble all through, stopped, or no bubble. */
    _settleStone(s) {
      if (!s) return;
      if (s.stalls > 0) s.state = "stall";
      else if (s.trillSec >= 0.25 && s.trillSec >= 0.5 * s.soundSec) s.state = "trill";
      else s.state = s.soundSec > 0.05 ? "tone" : "todo";
    },
    _curStone() {
      const row = this.state.rows[this.state.rows.length - 1];
      return row ? row.stones[this.state.i] : null;
    },
    _mapModel() {
      const st = this.state;
      const K = this._kit();
      const V = global.VTViz;
      const rows = st.rows.map((r, ri) => ({
        rootName: r.rootName,
        stones: r.stones.map((s, i) =>
          !st.review && ri === st.rows.length - 1 && i === st.i
            ? { state: "now", frac: s.frac, trilling: s.trillSec > 0 }
            : s
        )
      }));
      const tr = st.track;
      let summary;
      if (st.review) {
        const c = this._stoneCounts();
        const top = K ? K.noteName(st.rootMidi + this._shift()) : "";
        summary =
          L(
            `${st.patterns} ${st.patterns === 1 ? "pasada" : "pasadas"} · raíz ${top} · ${c.trill} de ${c.sung} notas con burbujeo`,
            `${st.patterns} ${st.patterns === 1 ? "pattern" : "patterns"} · root ${top} · ${c.trill} of ${c.sung} notes bubbling`
          ) + (tr && tr.best > 0 ? L(` · mejor racha ${V.fmtSec(tr.best, 1)}`, ` · best run ${V.fmtSec(tr.best, 1)}`) : "");
      } else {
        summary = this._evText();
      }
      return { patterns: rows, degrees: st.syllables, review: st.review, summary };
    },
    _stoneCounts() {
      let trill = 0;
      let sung = 0;
      let stall = 0;
      this.state.rows.forEach((r) =>
        r.stones.forEach((s) => {
          if (s.state === "trill") trill++;
          if (s.state === "stall") stall++;
          if (s.state === "trill" || s.state === "stall" || s.state === "tone") sung++;
        })
      );
      return { trill, sung, stall };
    },
    /** The bubble now, in words (also the screen reader's line). */
    _evText() {
      const K = this._kit();
      const tr = this.state.track;
      const V = global.VTViz;
      if (!K || !tr) return "—";
      const T = K.T;
      const syl = this.state.syllables[this.state.i] || "";
      const lead = `${L("Pasada", "Pattern")} ${this.state.patterns + 1} · ${syl}`;
      if (tr.tag === T.TRILL || tr.tag === T.AIRTRILL)
        return `${lead} · ${L("burbujeo seguido", "unbroken bubble")} ${V.fmtSec(tr.runLen, 1)}`;
      const last = tr.runs.length ? tr.runs[tr.runs.length - 1] : null;
      if (tr.tag === T.TONE || tr.tag === T.AIR)
        return `${lead} · ${
          last && last.kind === "stall" && tr.t - last.end < 4
            ? L("se paró el burbujeo: labios sueltos, más aire", "the bubble stopped: loose lips, more air")
            : L("sin burbuja", "no bubble")
        }`;
      if (tr.tag === T.PEND) return `${lead} · ${L("escuchando…", "listening…")}`;
      return `${lead} · ${tr.heard ? L("respira y sigue", "breathe and go on") : L("empieza a trinar", "start the trill")}`;
    },
    /** The bubble strip along the bottom of the highway. */
    _overlay(ctx, geo, layer) {
      if (layer !== "under") return;
      if (!this.hud || !this.hud.isConnected) return;
      const V = global.VTViz;
      if (!V?.scenes?.trillStrip) return;
      V.scenes.trillStrip(ctx, geo, this.state.rec, { stalls: this.state.stallMarks });
    },
    onStart() {
      const st = this.state;
      st.review = false;
      this.hud?.classList.remove("is-replay");
      st.track?.reset();
      st.rec = [];
      st.stallMarks = [];
      st.rows = [];
      this._newRow();
      const pv = typeof global.VTGetPitchViz === "function" ? global.VTGetPitchViz() : null;
      if (pv?.setOverlay && st.track) {
        this._ownsOverlay = true;
        pv.setOverlay((ctx, geo, layer) => this._overlay(ctx, geo, layer));
      }
      this._lockLadder();
      this._pushTarget();
      this.viz?.draw();
    },
    /** Median of the accepted pitch history — one stray frame cannot move it. */
    _median() {
      const a = this.state.hist.slice().sort((x, y) => x - y);
      if (!a.length) return null;
      const m = a.length >> 1;
      return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
    },
    /** Advance one step; at the end of a pattern the root walks up, then back down. */
    _advance() {
      this._settleStone(this._curStone());
      this.state.acc = 0;
      this.state.i += 1;
      if (this.state.i >= this.state.pattern.length) {
        this.state.i = 0;
        this.state.patterns += 1;
        if (this.$("[data-p]")) this.$("[data-p]").textContent = String(this.state.patterns);
        const next = this.state.rootMidi + this.state.dir;
        if (next > this.state.topMidi) {
          this.state.dir = -1;
          this.state.rootMidi = Math.max(this.state.baseMidi, this.state.rootMidi - 1);
        } else if (next < this.state.baseMidi) {
          this.state.dir = 1;
          this.state.rootMidi = Math.min(this.state.topMidi, this.state.rootMidi + 1);
        } else {
          this.state.rootMidi = next;
        }
        this._drawLanes();
        this._newRow();
      }
      this._pushTarget();
    },
    /**
     * The bubble, measured apart from the pitch gate: the flutter track tags
     * each moment (trill, brrr, tone, air, silence) for the strip on the
     * highway and for the stone of the note being sung.
     */
    _feedTrack(frame) {
      const st = this.state;
      const tr = st.track;
      const K = this._kit();
      if (!tr || !K) return;
      const T = K.T;
      const before = tr.tag;
      const nStall = tr.stalls.length;
      tr.feed(frame);
      const dt = global.VTFeatures.frameDt(frame);
      const now = performance.now();
      // The start of a sound, once told apart, takes the tag it turned out to be
      if (before === T.PEND && tr.tag !== T.PEND && st.rec.length && tr.pendFrom != null) {
        const last = st.rec[st.rec.length - 1];
        if (last.tag === T.PEND) last.tag = tr.tagAt(tr.pendFrom);
      }
      const lastRec = st.rec[st.rec.length - 1];
      if (!lastRec || lastRec.tag !== tr.tag) st.rec.push({ t: now, tag: tr.tag });
      if (tr.stalls.length > nStall) {
        const s = tr.stalls[tr.stalls.length - 1];
        const at = now - (tr.t - s.t) * 1000;
        st.stallMarks.push({ t: at });
        // The strip turns flat from when the lips stopped, not when it was heard
        const r = st.rec[st.rec.length - 1];
        const prev = st.rec[st.rec.length - 2];
        if (r && r.tag === s.tag) r.t = Math.max(prev ? prev.t + 1 : 0, Math.min(r.t, at));
        const stone = this._curStone();
        if (stone) stone.stalls++;
      }
      if (st.rec.length > 600) st.rec.splice(0, st.rec.length - 400);
      if (st.stallMarks.length > 100) st.stallMarks.shift();
      const stone = this._curStone();
      if (stone) {
        if (tr.tag === T.TRILL || tr.tag === T.AIRTRILL) stone.trillSec += dt;
        if (tr.tag !== T.SIL && tr.tag !== T.PEND) stone.soundSec += dt;
      }
    },
    onFrame(frame) {
      const st = this.state;
      if (st.review) return;
      this._feedTrack(frame);
      this._frameGate(frame);
      const hold = this.profile.holdMs || 600;
      const stone = this._curStone();
      if (stone) stone.frac = clamp(st.acc / hold, 0, 1);
      if (this._ownsOverlay) {
        const pv = typeof global.VTGetPitchViz === "function" ? global.VTGetPitchViz() : null;
        pv?.setQueueProgress?.(st.acc / hold);
      }
      const ev = this.$("[data-ev]");
      if (ev && st.track) {
        const txt = this._evText();
        if (ev.textContent !== txt) ev.textContent = txt;
      }
      // The map of stones changes slowly: about ten redraws a second, painted
      // inside the engine's frame
      this._drawAcc = (this._drawAcc || 0) + (frame.dtMs || 16) / 1000;
      if (this._drawAcc >= 0.1) {
        this._drawAcc = 0;
        const kit = global.VTViz?.scenes?.breathKit;
        if (kit?.paintNow) kit.paintNow(this.viz);
        else this.viz?.draw();
      }
    },
    /** The pitch gate that walks the scale (see the note above the mode). */
    _frameGate(frame) {
      const dt = frame.dtMs || 16;
      const rms = frame.rms || 0;
      if (!this.state.wantFreq || !global.VTPitchUtils) return;
      // The clock-only fallback frame carries voiceFreq 0, not null.
      const f = frame.voiceFreq || 0;
      // `voiced` stays true through a grace window after the sound stops, and
      // `voiceFreq` repeats its last value bit for bit while it does. Require
      // real energy, and ignore a pitch that has not changed at all.
      const floor = Math.max(0.02, (frame.airRmsThreshold || 0.006) * 3);
      const live = !!frame.voiced && rms >= floor && f > 0 && f !== this.state.lastFreq;
      const blanked = this.state.refBlank > 0;
      if (blanked) this.state.refBlank -= dt;
      if (!live || blanked) {
        if (!blanked && f <= 0) this.state.acc = Math.max(0, this.state.acc - dt * 0.5);
        return;
      }
      this.state.lastFreq = f;
      const n = this.profile.smoothN || 7;
      this.state.hist.push(f);
      if (this.state.hist.length > n) this.state.hist.shift();
      const med = this._median();
      if (med == null) return;
      const cents =
        (global.VTPitchUtils.freqToMidi(med) -
          global.VTPitchUtils.freqToMidi(this.state.wantFreq)) *
        100;
      const lo = this.profile.centsLo == null ? -40 : this.profile.centsLo;
      const hi = this.profile.centsHi == null ? 120 : this.profile.centsHi;
      if (cents >= lo && cents <= hi) {
        this.state.acc += dt;
        if (this.state.acc >= (this.profile.holdMs || 600)) this._advance();
      } else {
        this.state.acc = Math.max(0, this.state.acc - dt * 0.5);
      }
    },
    onStop() {
      const st = this.state;
      const p = st.patterns || 0;
      // The note being sung when Stop came counts as far as it got
      const stone = this._curStone();
      if (stone && stone.soundSec > 0.05) this._settleStone(stone);
      // A last row that never started is not part of the take
      const lastRow = st.rows[st.rows.length - 1];
      if (st.rows.length > 1 && lastRow && lastRow.stones.every((s) => s.state === "todo")) st.rows.pop();
      st.review = true;
      this.hud?.classList.add("is-replay");
      const pv = typeof global.VTGetPitchViz === "function" ? global.VTGetPitchViz() : null;
      if (pv && this._ownsOverlay) {
        pv.setOverlay?.(null);
        pv.setNoteQueue?.(null);
        this._ownsOverlay = false;
      }
      const ev = this.$("[data-ev]");
      if (ev && st.track) ev.textContent = this._mapModel().summary;
      this.viz?.draw();
      // Only the count of patterns is measured into the form; how steady and
      // how easy the trill felt stay the learner's own ratings.
      const patches = {};
      if (p > 0) patches.patterns = p;
      const top = global.VTPitchUtils
        ? global.VTPitchUtils.midiToName(st.rootMidi)
        : "—";
      let tail = "";
      if (st.track && p > 0) {
        const c = this._stoneCounts();
        if (c.trill) tail = L(` · ${c.trill} de ${c.sung} notas con burbujeo`, ` · ${c.trill} of ${c.sung} notes bubbling`);
      }
      return {
        patches,
        summary: p
          ? L(
              `${p} ${p === 1 ? "pasada" : "pasadas"} · raíz alcanzada ${top}`,
              `${p} ${p === 1 ? "pattern" : "patterns"} · root reached ${top}`
            ) + tail
          : L(
              "Ninguna pasada completa todavía — mantén el burbujeo por las nueve notas",
              "No pattern completed yet — keep the bubble going through all nine notes"
            )
      };
    }
  });

  // API
  const Registry = {
    get(modeId) {
      const M = Modes[modeId] || Modes.recordOnly;
      // fresh instance
      return Object.assign(Object.create(Object.getPrototypeOf(M)), M, {
        state: {},
        hud: null,
        profile: null
      });
    },
    ids() {
      return Object.keys(Modes);
    }
  };

  global.VTPracticeModes = Registry;
})(window);
