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
        return this;
      },
      unmount() {
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

  Modes.volumeSteady = baseMode({
    id: "volumeSteady",
    render() {
      this.state.breathCycles = 0;
      this.state.inBreath = false;
      this.state.peakRms = 0;
      this.state.samples = [];
      this.hud.innerHTML = `
        <div class="mode-title">${L("Carril de volumen · energía estable", "Volume lane · steady energy")}</div>
        <div class="volume-lane">
          <div class="volume-band"></div>
          <div class="volume-needle" data-needle style="left:50%"></div>
        </div>
        <p class="mode-meta">${L("Nivel en vivo · apunta a la franja central · ciclos de aire: <strong data-cyc>0</strong>", "Live level · aim for the center band · breath cycles: <strong data-cyc>0</strong>")}</p>
        <p class="mode-meta" data-fade>—</p>
      `;
    },
    onFrame(frame) {
      const rms = frame.rms || 0;
      // smooth
      this.state.smooth = (this.state.smooth || 0.2) * 0.85 + rms * 0.15;
      const x = clamp(this.state.smooth * 180, 2, 98);
      if (this.$("[data-needle]")) this.$("[data-needle]").style.left = `${x}%`;
      // breath cycle: voice then silence
      if (frame.voiced || rms > 0.025) {
        if (!this.state.inBreath) {
          this.state.inBreath = true;
          this.state.breathStartPeak = this.state.smooth;
          this.state.breathSamples = [];
        }
        this.state.breathSamples.push(this.state.smooth);
        this.state.peakRms = Math.max(this.state.peakRms, this.state.smooth);
      } else if (this.state.inBreath && rms < 0.015) {
        this.state.inBreath = false;
        this.state.breathCycles++;
        const arr = this.state.breathSamples || [];
        if (arr.length > 8) {
          const first = arr.slice(0, Math.floor(arr.length / 3));
          const last = arr.slice(-Math.floor(arr.length / 3));
          const fAvg = first.reduce((a, b) => a + b, 0) / first.length;
          const lAvg = last.reduce((a, b) => a + b, 0) / last.length;
          this.state.lastFade = lAvg < fAvg * 0.7;
        }
        if (this.$("[data-cyc]")) this.$("[data-cyc]").textContent = String(this.state.breathCycles);
        if (this.$("[data-fade]"))
          this.$("[data-fade]").textContent = this.state.lastFade
            ? "Last breath: faded at the end — start slightly softer next time."
            : "Last breath: solid evenness.";
      }
    },
    onStop() {
      const cyc = this.state.breathCycles || 0;
      const consistency = this.state.lastFade === false ? 4 : this.state.lastFade ? 2 : 3;
      return {
        patches: { cycles: Math.max(cyc, 1), consistency },
        summary: `${cyc} breath cycles logged`
      };
    }
  });

  Modes.volumeLadder = baseMode({
    id: "volumeLadder",
    render() {
      const ladder = this.profile.ladder || [];
      this.state.step = 0;
      this.state.stepStarted = performance.now();
      this.state.cycles = 0;
      this.state.inBandMs = 0;
      this.state.stepMs = 0;
      this.state.creditedSteps = 0;
      this.hud.innerHTML = `
        <div class="mode-title">${L("Escalera de volumen / energía", "Volume / energy ladder")}</div>
        <div class="mode-phase" data-phase>${ladder[0]?.label || "—"}</div>
        <div class="volume-lane">
          <div class="volume-band" data-band></div>
          <div class="volume-needle" data-needle style="left:10%"></div>
        </div>
        <div class="mode-big" data-remain>${this.profile.stepSec || 8}s</div>
        <p class="mode-meta">${L("Paso <strong data-step>1</strong>/" + ladder.length + " · Pasos contados: <strong data-cr>0</strong> · Subidas: <strong data-cyc>0</strong>", "Step <strong data-step>1</strong>/" + ladder.length + " · Credited steps: <strong data-cr>0</strong> · Climbs: <strong data-cyc>0</strong>")}</p>
        <p class="mode-meta muted">${L("El paso solo cuenta si te mantienes en la franja ≥50% del tiempo.", "Step only credits if you stay in the band ≥50% of the step.")}</p>
      `;
    },
    onFrame(frame) {
      const ladder = this.profile.ladder || [];
      const stepSec = (this.profile.stepSec || 8) * 1000;
      const elapsed = performance.now() - this.state.stepStarted;
      const left = Math.max(0, (stepSec - elapsed) / 1000);
      if (this.$("[data-remain]")) this.$("[data-remain]").textContent = `${Math.ceil(left)}s`;
      const target = ladder[this.state.step]?.target || 0.35;
      this.state.smooth = (this.state.smooth || 0) * 0.8 + (frame.rms || 0) * 0.2;
      const x = clamp(this.state.smooth * 160, 2, 98);
      if (this.$("[data-needle]")) this.$("[data-needle]").style.left = `${x}%`;
      if (this.$("[data-band]")) {
        const bandLeft = clamp(target * 160 - 8, 5, 85);
        this.$("[data-band]").style.left = `${bandLeft}%`;
        this.$("[data-band]").style.width = "16%";
      }
      const dt = frame.dtMs || 16;
      this.state.stepMs += dt;
      if (Math.abs(this.state.smooth - target) < 0.1) this.state.inBandMs += dt;

      if (elapsed >= stepSec) {
        const ratio = this.state.stepMs ? this.state.inBandMs / this.state.stepMs : 0;
        if (ratio >= 0.5) {
          this.state.creditedSteps++;
          if (this.$("[data-cr]")) this.$("[data-cr]").textContent = String(this.state.creditedSteps);
        }
        this.state.inBandMs = 0;
        this.state.stepMs = 0;
        this.state.step++;
        if (this.state.step >= ladder.length) {
          if (this.state.creditedSteps >= ladder.length) this.state.cycles++;
          this.state.step = 0;
          this.state.creditedSteps = 0;
          if (this.$("[data-cyc]")) this.$("[data-cyc]").textContent = String(this.state.cycles);
          if (this.$("[data-cr]")) this.$("[data-cr]").textContent = "0";
        }
        this.state.stepStarted = performance.now();
        if (this.$("[data-phase]"))
          this.$("[data-phase]").textContent = ladder[this.state.step]?.label || "—";
        if (this.$("[data-step]")) this.$("[data-step]").textContent = String(this.state.step + 1);
      }
    },
    onStop() {
      const patches = {};
      if (this.state.cycles > 0) {
        patches.ladderReps = this.state.cycles;
        patches.control = clamp(2 + this.state.cycles, 1, 5);
      }
      return {
        patches,
        summary: `${this.state.cycles} band-credited climb(s)`
      };
    }
  });

  Modes.countPace = baseMode({
    id: "countPace",
    render() {
      this.state.count = 0;
      this.state.lastNudge = 0;
      this.hud.innerHTML = `
        <div class="mode-title">${L("Paladar blando · cuenta hasta 60", "Soft palate · count to 60")}</div>
        <div class="mode-big" data-c>0</div>
        <div class="controls-row">
          <button type="button" class="btn btn-primary btn-sm" data-plus>+1 count</button>
          <button type="button" class="btn btn-sm" data-plus5>+5</button>
        </div>
        <p class="mode-meta">${L("Tiempo <strong data-t>0:00</strong> · Meta 60 · espacio alto, lengua suave afuera", "Time <strong data-t>0:00</strong> · Target 60 · tall space, tongue gently out")}</p>
        <p class="mode-meta" data-nudge>${L("Toca al contar — o +5 cada pocos números.", "Tap as you count — or +5 every few numbers.")}</p>
      `;
      this.$("[data-plus]")?.addEventListener("click", () => {
        this.state.count++;
        if (this.$("[data-c]")) this.$("[data-c]").textContent = String(this.state.count);
      });
      this.$("[data-plus5]")?.addEventListener("click", () => {
        this.state.count += 5;
        if (this.$("[data-c]")) this.$("[data-c]").textContent = String(this.state.count);
      });
    },
    onFrame() {
      const sec = Math.floor((performance.now() - this.state.startedAt) / 1000);
      if (this.$("[data-t]"))
        this.$("[data-t]").textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
      if (sec > 0 && sec % 15 === 0 && sec !== this.state.lastNudge) {
        this.state.lastNudge = sec;
        if (this.$("[data-nudge]"))
          this.$("[data-nudge]").textContent =
            this.state.count < 30
              ? "Rose-smell lift — keep counting."
              : "Past 30 — stay free in the jaw.";
      }
    },
    onStop() {
      const c = this.state.count || 0;
      return {
        patches: {
          countReached: c,
          openness: c >= 60 ? 4 : c >= 30 ? 3 : 2,
          comfort: 3
        },
        summary: `Counted to ${c}`
      };
    }
  });

  Modes.articulationContrast = baseMode({
    id: "articulationContrast",
    render() {
      const phases = this.profile.phases || [
        { label: "With pen · count 1–60", sec: 90 },
        { label: "Pen off · feel the ease", sec: 45 }
      ];
      this.state.runner = createPhaseRunner(phases, (i, p) => {
        if (global.VTToast) global.VTToast(p.label);
        if (i === 1 && this.$("[data-rate]")) this.$("[data-rate]").hidden = false;
      });
      this.state.clarityPen = null;
      this.state.clarityAfter = null;
      this.hud.innerHTML = `
        <div class="mode-title">${L("Contraste de articulación con bolígrafo", "Pen articulation contrast")}</div>
        <div class="mode-phase" data-phase>${phases[0].label}</div>
        <div class="mode-big" data-remain>${phases[0].sec}s</div>
        <div class="mode-bar"><span data-bar style="width:0%"></span></div>
        <div data-rate hidden>
          <p class="mode-meta">${L("Califica la claridad después de cada fase:", "Rate clarity after each phase:")}</p>
          <label class="mode-meta">${L("Con bolígrafo (1–5)", "With pen (1–5)")}
            <input type="range" min="1" max="5" value="3" data-pen />
          </label>
          <label class="mode-meta">${L("Sin bolígrafo (1–5)", "After pen (1–5)")}
            <input type="range" min="1" max="5" value="3" data-after />
          </label>
        </div>
      `;
    },
    onFrame() {
      const r = this.state.runner;
      r.tick(performance.now());
      const phase = this.profile.phases[r.index];
      if (this.$("[data-phase]"))
        this.$("[data-phase]").textContent =
          r.index < r.count ? r.label : L("Contraste listo — valora ambos", "Contrast complete — rate both");
      if (this.$("[data-remain]"))
        this.$("[data-remain]").textContent =
          r.index < r.count ? `${Math.ceil(r.remaining)}s` : "✓";
      if (phase && this.$("[data-bar]")) {
        const pct = clamp(((phase.sec - r.remaining) / phase.sec) * 100, 0, 100);
        this.$("[data-bar]").style.width = `${pct}%`;
      }
      if (r.index >= 1 && this.$("[data-rate]")) this.$("[data-rate]").hidden = false;
    },
    onStop() {
      const pen = Number(this.$("[data-pen]")?.value || 0);
      const after = Number(this.$("[data-after]")?.value || 0);
      const patches = {};
      if (pen) patches.clarityPen = pen;
      if (after) patches.clarityAfter = after;
      return {
        patches,
        summary: after ? `Clarity pen ${pen} → after ${after}` : "Contrast phases done"
      };
    }
  });

  Modes.recordOnly = baseMode({
    id: "recordOnly",
    render() {
      const prompts = this.profile.prompts || [
        "Open as Motivator — genuine compliment",
        "Shift to Coach — one clear tip",
        "Friend energy — warm story beat",
        "Educator — land the takeaway"
      ];
      this.state.prompts = prompts;
      this.state.pi = 0;
      this.state.lastSwap = performance.now();
      this.hud.innerHTML = `
        <div class="mode-title">${L("Toma de actuación · persona", "Performance take · persona")}</div>
        <div class="mode-phase" data-pr>${prompts[0]}</div>
        <div class="mode-big" data-t>0:00</div>
        <p class="mode-meta">${L("Las pistas rotan cada ~25s. No te juzgues a mitad — revisa después.", "Prompts rotate every ~25s. Don't judge mid-take — review later.")}</p>
      `;
    },
    onFrame() {
      const sec = Math.floor((performance.now() - this.state.startedAt) / 1000);
      if (this.$("[data-t]"))
        this.$("[data-t]").textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
      if (performance.now() - this.state.lastSwap > 25000) {
        this.state.lastSwap = performance.now();
        this.state.pi = (this.state.pi + 1) % this.state.prompts.length;
        if (this.$("[data-pr]")) this.$("[data-pr]").textContent = this.state.prompts[this.state.pi];
      }
    },
    onStop() {
      return { patches: {}, summary: "Take captured — review with neutral ears" };
    }
  });

  Modes.facePhases = baseMode({
    id: "facePhases",
    render() {
      const phases = this.profile.phases || [];
      this.state.runner = createPhaseRunner(phases, (i, p) => {
        if (global.VTToast) global.VTToast(p.label);
      });
      this.hud.innerHTML = `
        <div class="mode-title">${L("Expresión facial", "Facial expressiveness")}</div>
        <div class="mode-phase" data-phase>${phases[0]?.label || L("Gesto", "Face")}</div>
        <div class="mode-big" data-remain>—</div>
        <p class="mode-meta">${L("Cambia la cara con la fase. Revisa en silencio al detener.", "Change the face with the phase. Review muted after stop.")}</p>
      `;
    },
    onFrame() {
      const r = this.state.runner;
      if (!r) return;
      r.tick(performance.now());
      if (this.$("[data-phase]"))
        this.$("[data-phase]").textContent =
          r.index < r.count ? r.label : L("Listo — revisa sin sonido", "Done — review muted");
      if (this.$("[data-remain]"))
        this.$("[data-remain]").textContent =
          r.index < r.count ? `${Math.ceil(r.remaining)}s` : "✓";
    },
    onStop() {
      return {
        patches: {},
        summary: "Face phases done — review muted for congruence"
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

  Modes.reviewSession = baseMode({
    id: "reviewSession",
    render() {
      this.hud.innerHTML = `
        <div class="mode-title">${L("Grabar y revisar", "Record &amp; review take")}</div>
        <div class="mode-big" data-t>0:00</div>
        <p class="mode-meta mode-warn">${L("Espera <strong>1 día completo</strong> antes de Audición → Visual → Transcripción.", "Leave <strong>1 full day</strong> before Auditory → Visual → Transcription.")}</p>
      `;
    },
    onFrame() {
      const sec = Math.floor((performance.now() - this.state.startedAt) / 1000);
      if (this.$("[data-t]"))
        this.$("[data-t]").textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    },
    onStop() {
      // focus review block
      const rev = document.getElementById("review-block");
      if (rev) {
        rev.hidden = false;
        rev.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
      }
      return { patches: {}, summary: "Take ready — schedule review tomorrow" };
    }
  });

  Modes.weekPlan = baseMode({
    id: "weekPlan",
    render() {
      // Same copy as the exercise's plan card (week.*): the days are counted
      // from practice now, so there is no "check in" to ask for.
      const t = (k) => global.VTI18n?.t?.(k) ?? k;
      this.hud.innerHTML = `
        <div class="mode-title">${t("week.cta")}</div>
        <p class="mode-meta">${t("week.ctaSub")}</p>
        <button type="button" class="btn btn-primary btn-sm" data-open-plan>${t("week.open")}</button>
      `;
      this.$("[data-open-plan]")?.addEventListener("click", () => {
        document.getElementById("btn-plan")?.click();
      });
    },
    onStart() {
      // soft redirect path: app.js opens the plan on Start
    },
    onStop() {
      return { patches: {}, summary: "Use plan dashboard for week logic" };
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

  Modes.gestureReps = baseMode({
    id: "gestureReps",
    render() {
      this.state.reps = { size: 0, count: 0, location: 0 };
      this.state.mutedReview = false;
      this.hud.innerHTML = `
        <div class="mode-title">${L("Repeticiones de gestos", "Gesture reps")}</div>
        <div class="controls-row">
          <button type="button" class="btn btn-sm" data-g="size">Size +</button>
          <button type="button" class="btn btn-sm" data-g="count">Count +</button>
          <button type="button" class="btn btn-sm" data-g="location">Location +</button>
        </div>
        <p class="mode-meta">${L("Tamaño <strong data-s>0</strong> · Cuenta <strong data-c>0</strong> · Lugar <strong data-l>0</strong>", "Size <strong data-s>0</strong> · Count <strong data-c>0</strong> · Location <strong data-l>0</strong>")}</p>
        <label class="mode-meta" style="display:flex;gap:0.4rem;align-items:center;margin-top:0.5rem;">
          <input type="checkbox" data-muted /> I reviewed the take muted first
        </label>
      `;
      this.hud.querySelectorAll("[data-g]").forEach((b) => {
        b.addEventListener("click", () => {
          const k = b.getAttribute("data-g");
          this.state.reps[k]++;
          if (this.$("[data-s]")) this.$("[data-s]").textContent = this.state.reps.size;
          if (this.$("[data-c]")) this.$("[data-c]").textContent = this.state.reps.count;
          if (this.$("[data-l]")) this.$("[data-l]").textContent = this.state.reps.location;
        });
      });
      this.$("[data-muted]")?.addEventListener("change", (e) => {
        this.state.mutedReview = e.target.checked;
      });
    },
    onStop() {
      const t = this.state.reps.size + this.state.reps.count + this.state.reps.location;
      if (!this.state.mutedReview && global.VTToast) {
        global.VTToast("Tip: check muted review before scoring congruence");
      }
      return {
        patches: t > 0 ? { purposeful: clamp(1 + Math.floor(t / 2), 1, 5) } : {},
        summary: `${t} gesture reps`
      };
    }
  });

  Modes.concisionGate = baseMode({
    id: "concisionGate",
    render() {
      this.state.q = 1;
      this.state.maxQ = this.profile.questions || 5;
      this.state.phase = "receive";
      this.state.silenceNeed = (this.profile.preSilenceSec || 2.5) * 1000;
      this.state.silenceAcc = 0;
      this.state.gates = 0;
      this.hud.innerHTML = `
        <div class="mode-title">${L("Puerta de concisión", "Concision gate")}</div>
        <div class="mode-phase" data-phase>${L("P1 · Recibe la pregunta", "Q1 · Receive the question")}</div>
        <div class="mode-big" data-g>${L("Respira", "Breathe")}</div>
        <p class="mode-meta">${L("Puertas pasadas: <strong data-ok>0</strong>/" + this.state.maxQ, "Gates passed: <strong data-ok>0</strong>/" + this.state.maxQ)}</p>
        <button type="button" class="btn btn-sm" data-next>${L("Siguiente pregunta", "Next question")}</button>
      `;
      this.$("[data-next]")?.addEventListener("click", () => {
        if (this.state.q < this.state.maxQ) {
          this.state.q++;
          this.state.phase = "receive";
          this.state.silenceAcc = 0;
          if (this.$("[data-phase]"))
            this.$("[data-phase]").textContent = L(`P${this.state.q} · Recibe la pregunta`, `Q${this.state.q} · Receive the question`);
          if (this.$("[data-g]")) this.$("[data-g]").textContent = L("Respira", "Breathe");
        }
      });
    },
    onFrame(frame) {
      const quiet = !frame.voiced && (frame.rms || 0) < 0.02;
      const dt = frame.dtMs || 16;
      if (this.state.phase === "receive" || this.state.phase === "silence") {
        if (quiet) {
          this.state.phase = "silence";
          this.state.silenceAcc += dt;
          const left = Math.max(0, (this.state.silenceNeed - this.state.silenceAcc) / 1000);
          if (this.$("[data-g]"))
            this.$("[data-g]").textContent =
              left > 0 ? `Silence ${left.toFixed(1)}s` : "Answer now";
          if (this.state.silenceAcc >= this.state.silenceNeed && this.state.phase === "silence") {
            this.state.phase = "answer";
            this.state.gates++;
            if (this.$("[data-ok]")) this.$("[data-ok]").textContent = String(this.state.gates);
            if (this.$("[data-g]")) this.$("[data-g]").textContent = L("Responde en ≤3 oraciones", "Answer ≤3 sentences");
          }
        } else if (this.state.phase === "silence") {
          this.state.silenceAcc = Math.max(0, this.state.silenceAcc - dt * 2);
        }
      }
    },
    onStop() {
      return {
        patches: {
          questions: this.state.q,
          pauseBefore: clamp(this.state.gates, 1, 5),
          concision: clamp(2 + this.state.gates, 1, 5)
        },
        summary: `${this.state.gates} pre-answer silence gates`
      };
    }
  });

  Modes.storyTimer = baseMode({
    id: "storyTimer",
    render() {
      const phases = this.profile.phases || [];
      this.state.runner = createPhaseRunner(phases);
      this.state.peakMarked = false;
      this.hud.innerHTML = `
        <div class="mode-title">${L("Arco de historia", "Story arc")}</div>
        <div class="mode-phase" data-phase>${phases[0]?.label}</div>
        <div class="mode-big" data-remain>—</div>
        <button type="button" class="btn btn-singing btn-sm" data-peak>Mark PEAK now</button>
        <p class="mode-meta" data-peak-st>${L("Pico aún no marcado", "Peak not marked yet")}</p>
      `;
      this.$("[data-peak]")?.addEventListener("click", () => {
        this.state.peakMarked = true;
        if (this.$("[data-peak-st]"))
          this.$("[data-peak-st]").textContent = L(`Pico marcado en “${this.state.runner.label}”`, `Peak marked in “${this.state.runner.label}”`);
      });
    },
    onFrame() {
      const r = this.state.runner;
      r.tick(performance.now());
      if (this.$("[data-phase]"))
        this.$("[data-phase]").textContent =
          r.index < r.count ? r.label : L("Historia completa", "Story complete");
      if (this.$("[data-remain]"))
        this.$("[data-remain]").textContent =
          r.index < r.count ? `${Math.ceil(r.remaining)}s` : "✓";
    },
    onStop() {
      return {
        patches: {
          peakClarity: this.state.peakMarked ? 4 : 2,
          structure: this.state.runner.index >= 2 ? 4 : 3
        },
        summary: this.state.peakMarked ? "Peak marked" : "Consider marking the peak next time"
      };
    }
  });

  Modes.authorityLand = baseMode({
    id: "authorityLand",
    render() {
      this.state.lands = 0;
      this.state.need = (this.profile.landSilenceSec || 1) * 1000;
      this.state.waitingLand = false;
      this.state.silenceAcc = 0;
      this.hud.innerHTML = `
        <div class="mode-title">${L("Cierres con autoridad", "Authority landings")}</div>
        <div class="mode-big" data-l>0 / ${this.profile.claims || 5}</div>
        <button type="button" class="btn btn-primary btn-sm" data-claim>I stated a claim — now land</button>
        <p class="mode-meta" data-st>${L("Di la afirmación y guarda silencio ~1s (sin “¿sabes?”)", "State claim, then hold silence ~1s (no “you know?”)")}</p>
      `;
      this.$("[data-claim]")?.addEventListener("click", () => {
        this.state.waitingLand = true;
        this.state.silenceAcc = 0;
        if (this.$("[data-st]")) this.$("[data-st]").textContent = L("Mantén el silencio para aterrizar…", "Hold silence to land…");
      });
    },
    onFrame(frame) {
      if (!this.state.waitingLand) return;
      const quiet = !frame.voiced && (frame.rms || 0) < 0.02;
      const dt = frame.dtMs || 16;
      if (quiet) {
        this.state.silenceAcc += dt;
        if (this.state.silenceAcc >= this.state.need) {
          this.state.lands++;
          this.state.waitingLand = false;
          if (this.$("[data-l]"))
            this.$("[data-l]").textContent = `${this.state.lands} / ${this.profile.claims || 5}`;
          if (this.$("[data-st]")) this.$("[data-st]").textContent = L("Aterrizado ✓", "Landed ✓");
        }
      } else this.state.silenceAcc = 0;
    },
    onStop() {
      return {
        patches: {
          landed: this.state.lands,
          authority: clamp(1 + this.state.lands, 1, 5)
          // noTag left for honest self-rate
        },
        summary: `${this.state.lands} clean landings`
      };
    }
  });

  /** v20 — energy triad (not pure volume ladder) */
  Modes.energyMatch = baseMode({
    id: "energyMatch",
    render() {
      this.state.levels = ["Low", "Medium", "High"];
      this.state.i = 0;
      this.state.completed = 0;
      this.state.stepStarted = performance.now();
      this.state.stepSec = (this.profile.stepSec || 30) * 1000;
      this.hud.innerHTML = `
        <div class="mode-title">${L("Ajuste de energía · trío", "Energy match · triad")}</div>
        <div class="mode-phase" data-phase>Low energy</div>
        <div class="mode-big" data-remain>30s</div>
        <div class="volume-lane"><div class="volume-band" data-band></div><div class="volume-needle" data-n style="left:20%"></div></div>
        <p class="mode-meta">${L("El volumen es un canal — también ritmo y cara. Ciclos: <strong data-c>0</strong>", "Volume is one channel — also match pace &amp; face. Cycles: <strong data-c>0</strong>")}</p>
        <p class="mode-meta muted" data-tip>${L("Bajo: ojos calmados, más lento. Alto: cara viva, más rápido (sin gritar).", "Low: calm eyes, slower pace. High: brighter face, quicker (not shout).")}</p>
      `;
    },
    onFrame(frame) {
      const targets = [0.2, 0.38, 0.58];
      const elapsed = performance.now() - this.state.stepStarted;
      const left = Math.max(0, (this.state.stepSec - elapsed) / 1000);
      if (this.$("[data-remain]")) this.$("[data-remain]").textContent = `${Math.ceil(left)}s`;
      this.state.smooth = (this.state.smooth || 0) * 0.8 + (frame.rms || 0) * 0.2;
      if (this.$("[data-n]")) this.$("[data-n]").style.left = `${clamp(this.state.smooth * 160, 2, 98)}%`;
      if (this.$("[data-band]")) {
        const t = targets[this.state.i];
        this.$("[data-band]").style.left = `${clamp(t * 160 - 8, 5, 85)}%`;
        this.$("[data-band]").style.width = "16%";
      }
      if (elapsed >= this.state.stepSec) {
        this.state.i++;
        if (this.state.i >= 3) {
          this.state.i = 0;
          this.state.completed++;
          if (this.$("[data-c]")) this.$("[data-c]").textContent = String(this.state.completed);
        }
        this.state.stepStarted = performance.now();
        const tips = [
          "Low: calm eyes, slower pace.",
          "Medium: conversational body + voice.",
          "High: brighter face, quicker (not shout)."
        ];
        if (this.$("[data-phase]"))
          this.$("[data-phase]").textContent = L(`${this.state.levels[this.state.i]} de energía`, `${this.state.levels[this.state.i]} energy`);
        if (this.$("[data-tip]")) this.$("[data-tip]").textContent = tips[this.state.i];
      }
    },
    onStop() {
      // flexibility only if they completed cycles — still modest autofill
      const c = this.state.completed;
      return {
        patches: c > 0 ? { flexibility: clamp(2 + c, 1, 5) } : {},
        summary: `${c} full L/M/H energy cycle(s) — rate authenticity yourself`
      };
    }
  });

  Modes.pitchContour = baseMode({
    id: "pitchContour",
    render() {
      this.state.minM = 999;
      this.state.maxM = 0;
      this.hud.innerHTML = `
        <div class="mode-title">${L("Rango melódico (habla)", "Melodic range (speech)")}</div>
        <div class="mode-big" data-r>— st</div>
        <p class="mode-meta">${L("Rango mín–máx al hablar. Variedad sin ejercicios de nota.", "Min–max pitch span while you speak. Variety without note drills.")}</p>
        <p class="mode-meta" data-d>${L("Empieza a hablar con color…", "Start speaking with color…")}</p>
      `;
    },
    onFrame(frame) {
      if (frame.voiceFreq && global.VTPitchUtils) {
        const m = global.VTPitchUtils.freqToMidi(frame.voiceFreq);
        this.state.minM = Math.min(this.state.minM, m);
        this.state.maxM = Math.max(this.state.maxM, m);
        const span = this.state.maxM - this.state.minM;
        if (this.$("[data-r]")) this.$("[data-r]").textContent = `${span.toFixed(1)} st`;
        if (this.$("[data-d]"))
          this.$("[data-d]").textContent =
            span < 2 ? "Still flat — paint more highs/lows on meaning." : "Nice contour range.";
      }
    },
    onStop() {
      const span = Math.max(0, this.state.maxM - this.state.minM);
      return {
        patches: { variety: span >= 5 ? 5 : span >= 3 ? 4 : span >= 1.5 ? 3 : 2 },
        summary: `Pitch span ~${span.toFixed(1)} semitones`
      };
    }
  });

  // ——— SINGING ———

  Modes.pitchHold = baseMode({
    id: "pitchHold",
    render() {
      const fry = this.profile.fryPhase !== false && this.profile.modeCue !== "hum";
      this.state.phase = fry ? "fry" : "hold";
      this.state.best = 0;
      this.hud.innerHTML = `
        <div class="mode-title">${fry ? L("Fry → /A/ clara sostenida", "Fry → clear /A/ hold") : L("Sostén y mantén", "Sustain & hold")}</div>
        <div class="mode-phase" data-phase>${fry ? L("Paso 1 · fry suave (buscador)", "Step 1 · gentle fry (finder)") : L("Sostén", "Sustain")}</div>
        <div class="mode-big" data-h>0.0s</div>
        <p class="mode-meta">${L("Mejor sostenido: <strong data-best>0s</strong> · registros: <strong data-n>0</strong>", "Best clear hold: <strong data-best>0s</strong> · logs: <strong data-n>0</strong>")}</p>
        ${
          fry
            ? `<button type="button" class="btn btn-sm btn-singing" data-clear>${L("Pasar a /A/ clara", "Move to clear /A/")}</button>`
            : ""
        }
        <p class="mode-meta muted">${L("Los sostenidos de 2+ s se registran al soltar. No es un juego de notas.", "Holds of 2+ s are logged when you release. Not a note-challenge game.")}</p>
      `;
      this.$("[data-clear]")?.addEventListener("click", () => {
        this.state.phase = "hold";
        if (this.$("[data-phase]"))
          this.$("[data-phase]").textContent = L("Paso 2 · /A/ clara sostenida", "Step 2 · clear /A/ hold");
      });
    },
    onFrame(frame) {
      if (this.$("[data-h]")) this.$("[data-h]").textContent = `${(frame.holdSec || 0).toFixed(1)}s`;
      if (this.$("[data-n]")) this.$("[data-n]").textContent = String((frame.holds || []).length);
      // Only track best during clear hold phase (or always if hum)
      if (this.state.phase === "hold" || this.profile.modeCue === "hum") {
        const best = (frame.holds || []).reduce((m, h) => Math.max(m, h.seconds), 0);
        this.state.best = Math.max(this.state.best || 0, best, frame.holdSec >= 2 ? frame.holdSec : 0);
        if (this.$("[data-best]"))
          this.$("[data-best]").textContent = `${(this.state.best || 0).toFixed(1)}s`;
      }
    },
    onStop() {
      const best = Math.round((this.state.best || 0) * 10) / 10;
      const patches = {};
      if (best > 0) patches.maxHold = best;
      // do not invent targets/holdCount
      return { patches, summary: `Best hold ${best}s` };
    }
  });

  Modes.pitchChord = baseMode({
    id: "pitchChord",
    render() {
      this.state.reps = 0;
      this.state.inBandMs = 0;
      const title = this.profile.autoArpeggio
        ? L("Arpegio · tonos del acorde", "Arpeggio chord tones")
        : L("Acorde / solfeo", "Chord / solfège");
      this.hud.innerHTML = `
        <div class="mode-title">${title}</div>
        <div class="mode-big" data-r>0</div>
        <p class="mode-meta">${L("Rep auto si te quedas ~1,2s en cualquier tono activo del acorde · o +1", "Auto-rep when ~1.2s near any active chord tone · or tap +1")}</p>
        <button type="button" class="btn btn-sm btn-singing" data-rep>+1</button>
        <p class="mode-meta" data-st>${L("Canta en los carriles cuando el piano cambie de acorde.", "Sing into the lanes when the piano changes chords.")}</p>
      `;
      this.$("[data-rep]")?.addEventListener("click", () => {
        this.state.reps++;
        if (this.$("[data-r]")) this.$("[data-r]").textContent = String(this.state.reps);
      });
    },
    onFrame(frame) {
      // Multi-lane: any active chord tone within ~50¢ counts (not only primary)
      if (!frame.voiceFreq || !frame.voiced) {
        this.state.inBandMs = 0;
        return;
      }
      let cents = Infinity;
      const viz = global.VTPitchVizInstance || null;
      // Prefer visualizer nearest active lane when available via app singleton
      const appViz = document.getElementById("pitch-canvas") && global.VTGetPitchViz
        ? global.VTGetPitchViz()
        : null;
      const nearest =
        appViz?.nearestActiveLane?.(frame.voiceFreq) ||
        viz?.nearestActiveLane?.(frame.voiceFreq);
      if (nearest) {
        cents = Math.abs(nearest.cents);
      } else if (frame.targetFreq && global.VTPitchUtils) {
        const vm = global.VTPitchUtils.freqToMidi(frame.voiceFreq);
        const tm = global.VTPitchUtils.freqToMidi(frame.targetFreq);
        cents = Math.abs((vm - tm) * 100);
      }
      if (cents <= 50) {
        this.state.inBandMs += frame.dtMs || 16;
        const fill = Math.min(1, this.state.inBandMs / 1200);
        if (this.$("[data-st]")) {
          this.$("[data-st]").textContent = L(
            `En carril · ${(fill * 100).toFixed(0)}%`,
            `In-lane · ${(fill * 100).toFixed(0)}%`
          );
        }
        if (this.state.inBandMs >= 1200) {
          this.state.reps++;
          this.state.inBandMs = 0;
          if (this.$("[data-r]")) this.$("[data-r]").textContent = String(this.state.reps);
          if (this.$("[data-st]")) {
            this.$("[data-st]").textContent = L("Rep contada ✓", "Rep credited ✓");
          }
        }
      } else this.state.inBandMs = 0;
    },
    onStop() {
      return {
        patches: { reps: this.state.reps, progressions: this.state.reps },
        summary: `${this.state.reps} reps`
      };
    }
  });

  Modes.pitchSong = baseMode({
    id: "pitchSong",
    render() {
      this.state.feel = 0;
      this.state.better = 0;
      this.state.phraseOk = 0;
      this.state.inBand = 0;
      this.state.samples = 0;
      this.hud.innerHTML = `
        <div class="mode-title">${L("Frases de canción · sin respirar a mitad", "Song phrases · no mid-breath")}</div>
        <div class="controls-row">
          <button type="button" class="btn btn-sm" data-feel>${L("Canción A +1", "Song A +1")}</button>
          <button type="button" class="btn btn-sm" data-better>${L("Canción B +1", "Song B +1")}</button>
          <button type="button" class="btn btn-sm btn-primary" data-phrase>${L("Frase completa ✓", "Phrase complete ✓")}</button>
        </div>
        <p class="mode-meta">${L("A <strong data-f>0</strong>/5 · B <strong data-b>0</strong>/5 · Frases OK <strong data-p>0</strong> · Carril <strong data-lane>0%</strong>", "A <strong data-f>0</strong>/5 · B <strong data-b>0</strong>/5 · Phrases OK <strong data-p>0</strong> · Lane <strong data-lane>0%</strong>")}</p>
        <p class="mode-meta muted">${L("Respira entre frases · dosifica el aire · no fuerces el volumen.", "Breathe between phrases · dose air · don’t force volume.")}</p>
      `;
      this.$("[data-feel]")?.addEventListener("click", () => {
        this.state.feel++;
        if (this.$("[data-f]")) this.$("[data-f]").textContent = this.state.feel;
      });
      this.$("[data-better]")?.addEventListener("click", () => {
        this.state.better++;
        if (this.$("[data-b]")) this.$("[data-b]").textContent = this.state.better;
      });
      this.$("[data-phrase]")?.addEventListener("click", () => {
        this.state.phraseOk++;
        if (this.$("[data-p]")) this.$("[data-p]").textContent = this.state.phraseOk;
      });
    },
    onFrame(frame) {
      if (!frame.voiceFreq) return;
      this.state.samples++;
      let cents = Infinity;
      const near = global.VTGetPitchViz?.()?.nearestActiveLane?.(frame.voiceFreq);
      if (near) cents = Math.abs(near.cents);
      else if (frame.targetFreq && global.VTPitchUtils) {
        cents = Math.abs(
          (global.VTPitchUtils.freqToMidi(frame.voiceFreq) -
            global.VTPitchUtils.freqToMidi(frame.targetFreq)) *
            100
        );
      }
      if (cents <= 50) this.state.inBand++;
      if (this.$("[data-lane]") && this.state.samples > 5) {
        this.$("[data-lane]").textContent = `${Math.round(
          (this.state.inBand / this.state.samples) * 100
        )}%`;
      }
    },
    onStop() {
      const patches = {
        repsFeel: this.state.feel,
        repsBetter: this.state.better,
        phraseBreath: this.state.phraseOk >= 5 ? 5 : this.state.phraseOk >= 3 ? 4 : this.state.phraseOk >= 1 ? 3 : 2
      };
      if (this.state.samples > 20) {
        const pct = Math.round((this.state.inBand / this.state.samples) * 100);
        patches.accuracy = pct >= 70 ? 5 : pct >= 50 ? 4 : pct >= 30 ? 3 : 2;
      }
      return {
        patches,
        summary: `A ${this.state.feel} · B ${this.state.better} · phrases ${this.state.phraseOk}`
      };
    }
  });

  Modes.pitchMatch = baseMode({
    id: "pitchMatch",
    render() {
      this.hud.innerHTML = `
        <div class="mode-title">${L("Juego de afinación", "Pitch match game")}</div>
        <p class="mode-meta">${L("Autopista + puntos + bloquea 8 notas. Quédate en el carril verde.", "Full highway + score + lock 8 notes. Stay in the green lane.")}</p>
        <p class="mode-meta" data-s>${L("El puntaje se actualiza en el HUD de arriba.", "Score updates in the pitch HUD above.")}</p>
      `;
    },
    onStop(ctx) {
      const g = (ctx && ctx.pitchGame) || global.VTAppPitchGameSnap || null;
      if (!g) return { patches: {}, summary: "Pitch match session" };
      const patches = { matches: g.challengeCleared || 0 };
      if (g.totalSamples > 30) {
        patches.accuracy = g.accuracyPct >= 80 ? 5 : g.accuracyPct >= 60 ? 4 : g.accuracyPct >= 40 ? 3 : 2;
        patches.precision = g.maxCombo >= 40 ? 5 : g.maxCombo >= 20 ? 4 : g.maxCombo >= 10 ? 3 : 2;
      }
      return {
        patches,
        summary: `Score ${g.score} · ${g.accuracyPct}% in-lane · ${g.challengeCleared} locks`
      };
    }
  });

  Modes.sovtFlow = baseMode({
    id: "sovtFlow",
    render() {
      this.state.samples = [];
      const straw = this.profile.variant === "straw";
      this.hud.innerHTML = `
        <div class="mode-title">${straw ? L("Fonación con pajita · SOVT", "Straw phonation · SOVT") : L("Trinos de labios · SOVT", "Lip trills · SOVT")}</div>
        <div class="mode-bar thick"><span data-bar style="width:0%"></span></div>
        <p class="mode-meta">${L("Uniformidad: <strong data-ev>—</strong>", "Evenness: <strong data-ev>—</strong>")}</p>
        <p class="mode-meta muted">${
          straw
            ? L(
                "El aire solo por la pajita; mejillas sueltas. Después, lleva la misma facilidad a /u/ y luego a /A/.",
                "Air only through straw; cheeks soft. Transfer to /u/ then /A/ after."
              )
            : L(
                "Burbujas parejas, mandíbula suelta. Después, lleva la misma facilidad a una /A/ abierta.",
                "Steady bubbles — jaw free. Transfer same ease to open /A/ after."
              )
        }</p>
        <button type="button" class="btn btn-sm" data-xfer>${L("Marcar paso a vocal abierta ✓", "Mark transfer to open vowel ✓")}</button>
        <p class="mode-meta">${L("Transferencia marcada: <strong data-x>no</strong>", "Transfer marked: <strong data-x>no</strong>")}</p>
      `;
      this.$("[data-xfer]")?.addEventListener("click", () => {
        this.state.transfer = true;
        if (this.$("[data-x]")) this.$("[data-x]").textContent = L("sí", "yes");
      });
    },
    onFrame(frame) {
      const rms = frame.rms || 0;
      if (rms > 0.01) {
        this.state.samples.push(rms);
        if (this.state.samples.length > 120) this.state.samples.shift();
      }
      const arr = this.state.samples;
      if (arr.length > 10) {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const v = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
        const steady = clamp(1 - Math.sqrt(v) * 8, 0, 1);
        if (this.$("[data-bar]")) this.$("[data-bar]").style.width = `${steady * 100}%`;
        if (this.$("[data-ev]"))
          this.$("[data-ev]").textContent =
            steady > 0.7 ? L("pareja", "steady") : steady > 0.4 ? L("ok", "ok") : L("irregular", "uneven");
        this.state.steadyScore = steady;
      }
    },
    onStop() {
      const s = this.state.steadyScore || 0;
      const patches = {};
      if (s > 0.2) {
        const scale = s > 0.75 ? 5 : s > 0.55 ? 4 : 3;
        patches.ease = scale;
        patches.steadiness = scale;
      }
      if (this.state.transfer) patches.transfer = 4;
      return {
        patches,
        summary: this.state.transfer
          ? L("SOVT con paso a vocal marcado", "SOVT + transfer marked")
          : L("SOVT (la próxima vez marca el paso a vocal)", "SOVT flow (mark transfer next time)")
      };
    }
  });

  /** s7 humming — soft multi-target, not fry hold clone */
  Modes.humTargets = baseMode({
    id: "humTargets",
    render() {
      this.state.notes = ["C3", "D3", "E3", "F3", "G3", "A3", "G3", "E3", "C3", "D3"];
      this.state.i = 0;
      this.state.locked = 0;
      this.state.inBand = 0;
      this.hud.innerHTML = `
        <div class="mode-title">${L("Tarareo · objetivos suaves", "Humming · soft targets")}</div>
        <div class="mode-phase" data-n>${L("Objetivo: ", "Target: ")}${this.state.notes[0]}</div>
        <div class="mode-big" data-l>0 / 10</div>
        <p class="mode-meta">${L("Mantén el tarareo cerca del objetivo ~0,9s para avanzar. Siente el zumbido en los labios.", "Hold hum near target ~0.9s to advance. Feel lip buzz.")}</p>
      `;
      // Lock highway to full note set so steps don't re-scale the Y-axis
      if (typeof global.VTLockHighwayNotes === "function") {
        global.VTLockHighwayNotes(this.state.notes);
      }
      // set first target
      if (global.VT_NOTE_FREQ && global.VT_NOTE_FREQ[this.state.notes[0]]) {
        // app practice engine target set via onFrame consumer — set on window for app
        this.state.wantFreq = global.VT_NOTE_FREQ[this.state.notes[0]];
      }
    },
    onStart() {
      if (typeof global.VTLockHighwayNotes === "function") {
        global.VTLockHighwayNotes(this.state.notes);
      }
      this._pushTarget();
    },
    _pushTarget() {
      const n = this.state.notes[this.state.i];
      this.state.wantFreq = global.VT_NOTE_FREQ?.[n];
      if (typeof global.VTSetPracticeTarget === "function" && this.state.wantFreq) {
        global.VTSetPracticeTarget(this.state.wantFreq, n);
      }
      // Audible reference each step (soft sustain) — default sound for this mode
      if (this.state.wantFreq && global.VTPiano?.playRefPitch) {
        global.VTPiano.playRefPitch(n, 2.2, true).catch(() => {});
      }
      if (this.$("[data-n]")) {
        this.$("[data-n]").textContent = L(`Objetivo: ${n}`, `Target: ${n}`);
      }
    },
    onFrame(frame) {
      if (this.state.wantFreq && frame.voiceFreq && global.VTPitchUtils) {
        const cents = Math.abs(
          (global.VTPitchUtils.freqToMidi(frame.voiceFreq) -
            global.VTPitchUtils.freqToMidi(this.state.wantFreq)) *
            100
        );
        if (cents <= 45 && frame.voiced) {
          this.state.inBand += frame.dtMs || 16;
          if (this.state.inBand >= 900) {
            this.state.locked++;
            this.state.inBand = 0;
            this.state.i = Math.min(this.state.i + 1, this.state.notes.length - 1);
            if (this.state.locked < 10) this._pushTarget();
            if (this.$("[data-l]")) this.$("[data-l]").textContent = `${this.state.locked} / 10`;
          }
        } else this.state.inBand = 0;
      }
    },
    onStop() {
      const n = this.state.locked;
      return {
        patches: n > 0 ? { targets: n, buzz: n >= 6 ? 4 : 3 } : {},
        summary: `${n} hum targets held`
      };
    }
  });

  Modes.sirenRange = baseMode({
    id: "sirenRange",
    render() {
      this.state.minM = 999;
      this.state.maxM = 0;
      this.state.sirens = 0;
      this.state.voicedLong = 0;
      this.hud.innerHTML = `
        <div class="mode-title">${L("Sirena · cuerda de rango", "Siren range rope")}</div>
        <div class="mode-big" data-r>— st</div>
        <p class="mode-meta">Sirens counted: <strong data-s>0</strong> (long glides ≥1.5s)</p>
        <p class="mode-meta">Not a single-note lock game — ride the rope smooth.</p>
      `;
    },
    onFrame(frame) {
      if (frame.voiceFreq && global.VTPitchUtils) {
        const m = global.VTPitchUtils.freqToMidi(frame.voiceFreq);
        this.state.minM = Math.min(this.state.minM, m);
        this.state.maxM = Math.max(this.state.maxM, m);
        const span = this.state.maxM - this.state.minM;
        if (this.$("[data-r]")) this.$("[data-r]").textContent = `${span.toFixed(1)} st`;
      }
      if (frame.voiced) {
        this.state.voicedLong += 16;
        if (this.state.voicedLong >= 1500 && !this.state.counted) {
          this.state.sirens++;
          this.state.counted = true;
          if (this.$("[data-s]")) this.$("[data-s]").textContent = String(this.state.sirens);
        }
      } else {
        this.state.voicedLong = 0;
        this.state.counted = false;
      }
    },
    onStop() {
      const span = Math.max(0, this.state.maxM - this.state.minM);
      return {
        patches: {
          sirens: this.state.sirens,
          smoothness: span >= 4 ? 4 : 3
        },
        summary: `${this.state.sirens} sirens · ${span.toFixed(1)} st range`
      };
    }
  });

  Modes.breathS = baseMode({
    id: "breathS",
    render() {
      this.state.phase = "S"; // S | A
      this.state.bestS = 0;
      this.state.bestA = 0;
      this.state.cur = 0;
      this.state._airHoldFrames = 0;
      this.state._airOnset = 0;
      this.hud.innerHTML = `
        <div class="mode-title">${L("Soporte de aire · S y luego /A/", "Breath support · S then /A/")}</div>
        <div class="mode-phase" data-phase>${L("Paso 1 · S pareja (sin voz)", "Step 1 · even S (no voice)")}</div>
        <div class="mode-big" data-h>0.0s</div>
        <p class="mode-meta">${L("Mejor S <strong data-s>0</strong>s · Mejor /A/ <strong data-a>0</strong>s", "Best S <strong data-s>0</strong>s · Best /A/ <strong data-a>0</strong>s")}</p>
        <button type="button" class="btn btn-sm" data-sw>${L("Pasar a fase /A/", "Switch to /A/ phase")}</button>
      `;
      this.$("[data-sw]")?.addEventListener("click", () => {
        this.state.phase = this.state.phase === "S" ? "A" : "S";
        if (this.$("[data-phase]"))
          this.$("[data-phase]").textContent =
            this.state.phase === "S"
              ? L("Paso 1 · S pareja (sin voz)", "Step 1 · even S (no voice)")
              : L("Paso 2 · /A/ con el mismo apoyo", "Step 2 · /A/ with same support");
      });
    },
    onFrame(frame) {
      // S phase: ONLY airDetected or Space — never bare RMS (room noise free-run).
      // Space latches immediately; mic needs a short onset to reject blips.
      const thr = frame.airRmsThreshold != null ? frame.airRmsThreshold * 1.1 : 0.02;
      const manualAir = !!(frame.manualSound && frame.manualKind === "air");
      let airNow =
        this.state.phase === "S"
          ? !!frame.airDetected || manualAir
          : frame.voiced ||
            !!(frame.manualSound && frame.manualKind === "voice") ||
            !!frame.airDetected ||
            (frame.rms || 0) > thr * 1.4;
      if (this.state.phase === "S") {
        if (manualAir) {
          this.state._airOnset = 5;
          this.state._airHoldFrames = 16;
        } else if (airNow) {
          this.state._airOnset = (this.state._airOnset || 0) + 1;
          if ((this.state._airOnset || 0) >= 4) this.state._airHoldFrames = 16;
        } else {
          this.state._airOnset = 0;
          if (this.state._airHoldFrames > 0) this.state._airHoldFrames -= 1;
        }
      } else {
        this.state._airOnset = 0;
        this.state._airHoldFrames = 0;
      }
      const air =
        this.state.phase === "S"
          ? manualAir ||
            (this.state._airOnset || 0) >= 4 ||
            this.state._airHoldFrames > 0
          : airNow;
      if (air) {
        this.state.cur += (frame.dtMs || 16) / 1000;
        if (this.state.phase === "S") this.state.bestS = Math.max(this.state.bestS, this.state.cur);
        else this.state.bestA = Math.max(this.state.bestA, this.state.cur);
      } else this.state.cur = 0;
      if (this.$("[data-h]")) this.$("[data-h]").textContent = `${this.state.cur.toFixed(1)}s`;
      if (this.$("[data-s]")) this.$("[data-s]").textContent = this.state.bestS.toFixed(1);
      if (this.$("[data-a]")) this.$("[data-a]").textContent = this.state.bestA.toFixed(1);
    },
    onStop() {
      return {
        patches: {
          maxS: Math.round(this.state.bestS),
          maxHold: Math.round(this.state.bestA),
          transferA: this.state.bestA > 3 ? 4 : 3
        },
        summary: `S ${this.state.bestS.toFixed(1)}s · A ${this.state.bestA.toFixed(1)}s`
      };
    }
  });

  /** Class-1 SH air ladder: 5→10→20→25→30s even unvoiced fricative */
  Modes.shAirLadder = baseMode({
    id: "shAirLadder",
    render() {
      this.state.rungs = this.profile.rungs || [5, 10, 20, 25, 30];
      this.state.i = 0;
      this.state.cleared = 0;
      this.state.best = 0;
      this.state.cur = 0;
      this.state.holdOk = 0;
      /** Frame-based hold-off after a real latch — not wall-clock */
      this.state._airHoldFrames = 0;
      /** Consecutive positive frames before count starts (reject ambient blips) */
      this.state._airOnset = 0;
      const target = this.state.rungs[0];
      this.hud.innerHTML = `
        <div class="mode-title">${L("Escalera de aire SH", "SH air-dosing ladder")}</div>
        <div class="mode-phase" data-ph>${L("Meta", "Target")}: <strong data-t>${target}</strong>s · SH pareja</div>
        <div class="mode-big" data-h>0.0s</div>
        <p class="mode-meta">${L("Peldaños", "Rungs")} <strong data-c>0</strong>/${this.state.rungs.length} · ${L("Mejor", "Best")} <strong data-b>0</strong>s</p>
        <p class="mode-meta muted" data-airhint>${L("Inhala por la nariz · exhala SH constante · sin pulsos. Si no cuenta, sube Mic o mantén Espacio.", "Nose inhale · steady SH · no pulses. If it won’t count, raise Mic or hold Space.")}</p>
      `;
    },
    onFrame(frame) {
      // ONLY airDetected or Space — never bare RMS (room noise free-run).
      // Space → count immediately; mic needs ~4 frames onset then short hold-off.
      const manualAir = !!(frame.manualSound && frame.manualKind === "air");
      const airNow = !!frame.airDetected || manualAir;
      if (manualAir) {
        this.state._airOnset = 5;
        this.state._airHoldFrames = 16;
      } else if (airNow) {
        this.state._airOnset = (this.state._airOnset || 0) + 1;
        if ((this.state._airOnset || 0) >= 4) this.state._airHoldFrames = 16;
      } else {
        this.state._airOnset = 0;
        if (this.state._airHoldFrames > 0) this.state._airHoldFrames -= 1;
      }
      const air =
        manualAir || (this.state._airOnset || 0) >= 4 || this.state._airHoldFrames > 0;
      const target = this.state.rungs[this.state.i] || this.state.rungs[this.state.rungs.length - 1];
      if (air) {
        this.state.cur += (frame.dtMs || 16) / 1000;
        this.state.best = Math.max(this.state.best, this.state.cur);
        if (this.state.cur >= target && this.state.i < this.state.rungs.length) {
          // credit rung once when held continuously
          if (this.state.holdOk !== this.state.i + 1) {
            this.state.holdOk = this.state.i + 1;
            this.state.cleared = Math.max(this.state.cleared, this.state.i + 1);
            this.state.i = Math.min(this.state.i + 1, this.state.rungs.length - 1);
            const next = this.state.rungs[this.state.i];
            if (this.$("[data-t]")) this.$("[data-t]").textContent = String(next);
            if (this.$("[data-c]")) this.$("[data-c]").textContent = String(this.state.cleared);
            // reset hold for next rung after short release expectation
            this.state.cur = 0;
          }
        }
      } else {
        this.state.cur = 0;
      }
      if (this.$("[data-h]")) this.$("[data-h]").textContent = `${this.state.cur.toFixed(1)}s`;
      if (this.$("[data-b]")) this.$("[data-b]").textContent = this.state.best.toFixed(1);
      // Visual: hearing air (auto) vs Space assist
      const panel = this.hud?.querySelector?.(".mode-panel") || this.hud;
      if (panel) {
        panel.classList.toggle("is-air", !!air && !frame.manualSound);
        panel.classList.toggle("is-manual-air", !!(frame.manualSound && frame.manualKind === "air"));
      }
      const big = this.$("[data-h]");
      if (big) {
        big.classList.toggle("is-air", !!air);
      }
    },
    onStop() {
      return {
        patches: {
          rungs: this.state.cleared,
          maxSH: Math.round(this.state.best),
          evenness: this.state.cleared >= 4 ? 5 : this.state.cleared >= 2 ? 4 : 3
        },
        summary: `SH ladder ${this.state.cleared}/${this.state.rungs.length} · best ${this.state.best.toFixed(1)}s`
      };
    }
  });

  Modes.scaleSteps = baseMode({
    id: "scaleSteps",
    render() {
      // Major scale (profile.majorScale) or classic 5-note
      this.state.pattern = this.profile.pattern ||
        (this.profile.majorScale
          ? [0, 2, 4, 5, 7, 9, 11, 12, 11, 9, 7, 5, 4, 2, 0]
          : [0, 2, 4, 5, 7, 5, 4, 2, 0]);
      this.state.rootMidi = this.profile.rootMidi || 48; // C3
      this.state.i = 0;
      this.state.roots = 0;
      this.state.inBand = 0;
      const nSteps = this.state.pattern.length;
      const title = this.profile.majorScale
        ? L("Escala mayor · coordinación", "Major scale · coordination")
        : L("Escala de 5 notas · con afinación", "Five-note scale · pitch-gated");
      this.hud.innerHTML = `
        <div class="mode-title">${title}</div>
        <div class="mode-big" data-step>Step 1 / ${nSteps}</div>
        <p class="mode-meta">${L("Mantén el paso (~40¢) 0,7s · Raíces:", "Hold near step (~40¢) 0.7s · Roots:")} <strong data-r>0</strong></p>
        <p class="mode-meta muted" data-st>${L("Escucha, luego canta — sin saltar.", "Listen, then sing — no free skip.")}</p>
      `;
      this._lockScaleRange();
      this._setStepTarget();
    },
    _lockScaleRange() {
      // Max span of the full 5-note pattern — fixed for the whole option
      if (global.VTPitchUtils && global.VTGetPitchViz) {
        const viz = global.VTGetPitchViz();
        if (viz?.lockMidiRange) {
          const midis = this.state.pattern.map((s) => this.state.rootMidi + s);
          viz.lockMidiRange(Math.min(...midis), Math.max(...midis), {
            pad: 1.5,
            minSpan: 10
          });
          // Ghost lanes for each unique step
          const seen = new Set();
          viz.progressionLanes = [];
          midis.forEach((m) => {
            const k = Math.round(m * 2) / 2;
            if (seen.has(k)) return;
            seen.add(k);
            viz.progressionLanes.push({
              name: global.VTPitchUtils.midiToName(m),
              freq: global.VTPitchUtils.midiToFreq(m),
              midi: m,
              active: false
            });
          });
          viz.progressionLanes.sort((a, b) => a.midi - b.midi);
        }
      }
    },
    _setStepTarget() {
      const semi = this.state.pattern[this.state.i];
      const midi = this.state.rootMidi + semi;
      if (global.VTPitchUtils) {
        const f = global.VTPitchUtils.midiToFreq(midi);
        const name = global.VTPitchUtils.midiToName(midi);
        this.state.wantFreq = f;
        this.state.wantName = name;
        // Retarget only — range already locked to full scale span
        if (typeof global.VTSetPracticeTarget === "function") {
          global.VTSetPracticeTarget(f, name);
        }
        // Play the step note so the student hears the target
        if (global.VTPiano?.playRefPitch && name) {
          global.VTPiano.playRefPitch(name, 1.8, true).catch(() => {});
        } else if (global.VTPiano?.playNote && f && global.VTPiano.ctx) {
          try {
            global.VTPiano.playNote(f, global.VTPiano.ctx.currentTime + 0.02, 1.8, 0.45, true);
          } catch {
            /* ignore */
          }
        }
      }
    },
    onStart() {
      this._lockScaleRange();
      this._setStepTarget();
    },
    onFrame(frame) {
      if (!this.state.wantFreq || !frame.voiceFreq || !global.VTPitchUtils) return;
      const cents = Math.abs(
        (global.VTPitchUtils.freqToMidi(frame.voiceFreq) -
          global.VTPitchUtils.freqToMidi(this.state.wantFreq)) *
          100
      );
      if (cents <= 40 && frame.voiced) {
        this.state.inBand += frame.dtMs || 16;
        if (this.state.inBand >= 700) {
          this.state.inBand = 0;
          this.state.i++;
          if (this.state.i >= this.state.pattern.length) {
            this.state.i = 0;
            this.state.roots++;
            if (this.$("[data-r]")) this.$("[data-r]").textContent = String(this.state.roots);
          }
          this._setStepTarget();
          if (this.$("[data-step]"))
            this.$("[data-step]").textContent = `Step ${this.state.i + 1} / ${this.state.pattern.length}`;
          if (this.$("[data-st]")) this.$("[data-st]").textContent = "Step locked ✓";
        }
      } else this.state.inBand = 0;
    },
    onStop() {
      return {
        patches: this.state.roots > 0 ? { roots: this.state.roots } : {},
        summary: `${this.state.roots} roots completed (pitch-gated)`
      };
    }
  });

  Modes.dynamicSwell = baseMode({
    id: "dynamicSwell",
    render() {
      this.state.swells = 0;
      this.state.phase = 0;
      this.state.phaseT = performance.now();
      this.state.midiSamples = [];
      this.hud.innerHTML = `
        <div class="mode-title">${L("Crescendo dinámico", "Dynamic swell")}</div>
        <div class="mode-phase" data-phase>Soft</div>
        <div class="volume-lane"><div class="volume-band" data-band></div><div class="volume-needle" data-n style="left:20%"></div></div>
        <p class="mode-meta">Swells: <strong data-s>0</strong> · Pitch wobble: <strong data-w>—</strong></p>
      `;
    },
    onFrame(frame) {
      const targets = [0.18, 0.42, 0.18];
      const elapsed = performance.now() - this.state.phaseT;
      // advance only if roughly in band for half a second cumulative
      this.state.bandMs = this.state.bandMs || 0;
      const rms = frame.rms || 0;
      if (Math.abs(rms - targets[this.state.phase]) < 0.12) this.state.bandMs += frame.dtMs || 16;
      else this.state.bandMs = Math.max(0, (this.state.bandMs || 0) - 10);

      if (elapsed > 2000 && this.state.bandMs > 400) {
        this.state.phase = (this.state.phase + 1) % 3;
        this.state.phaseT = performance.now();
        this.state.bandMs = 0;
        if (this.state.phase === 0) this.state.swells++;
        if (this.$("[data-phase]"))
          this.$("[data-phase]").textContent = ["Soft", "Medium", "Soft"][this.state.phase];
        if (this.$("[data-s]")) this.$("[data-s]").textContent = String(this.state.swells);
      }
      if (this.$("[data-n]")) this.$("[data-n]").style.left = `${clamp(rms * 160, 2, 98)}%`;
      if (this.$("[data-band]")) {
        const t = targets[this.state.phase];
        this.$("[data-band]").style.left = `${clamp(t * 160 - 8, 5, 85)}%`;
        this.$("[data-band]").style.width = "18%";
      }
      if (frame.voiceFreq && global.VTPitchUtils) {
        this.state.midiSamples.push(global.VTPitchUtils.freqToMidi(frame.voiceFreq));
        if (this.state.midiSamples.length > 80) this.state.midiSamples.shift();
        if (this.state.midiSamples.length > 20) {
          const arr = this.state.midiSamples;
          const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
          const v = Math.sqrt(arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length);
          this.state.wobble = v;
          if (this.$("[data-w]"))
            this.$("[data-w]").textContent =
              v < 0.15 ? "stable" : v < 0.35 ? "ok" : "wandering";
        }
      }
    },
    onStop() {
      const patches = {};
      if (this.state.swells > 0) {
        patches.swells = this.state.swells;
        patches.dynamicControl = clamp(2 + this.state.swells, 1, 5);
      }
      if (this.state.wobble != null) {
        patches.pitchStable =
          this.state.wobble < 0.15 ? 5 : this.state.wobble < 0.35 ? 4 : this.state.wobble < 0.55 ? 3 : 2;
      }
      return { patches, summary: `${this.state.swells} swells` };
    }
  });

  /** s14 sung staccato vs legato — note length contrast via onset/offset (not ≥2s holds) */
  Modes.staccatoLegato = baseMode({
    id: "staccatoLegato",
    render() {
      const phases = this.profile.phases || [
        { label: L("Staccato", "Staccato"), sec: 90 },
        { label: L("Legato", "Legato"), sec: 90 }
      ];
      this.state.runner = createPhaseRunner(phases, (i, p) => {
        if (global.VTToast) global.VTToast(p.label);
      });
      this.state.shortHolds = 0;
      this.state.longHolds = 0;
      this.state.noteOn = false;
      this.state.noteStart = 0;
      this.hud.innerHTML = `
        <div class="mode-title">${L("Staccato vs legato (cantado)", "Staccato vs legato (sung)")}</div>
        <div class="mode-phase" data-phase>${phases[0].label}</div>
        <div class="mode-big" data-remain>—</div>
        <p class="mode-meta">${L("Notas cortas (&lt;0,45s):", "Short notes (&lt;0.45s):")} <strong data-sh>0</strong> · ${L("Largas (≥1,2s):", "Long (≥1.2s):")} <strong data-lg>0</strong></p>
        <p class="mode-meta muted">${L("Staccato = aire con rebote. Legato = línea conectada con aire estable.", "Staccato = bounce air. Legato = connect with steady air.")}</p>
      `;
    },
    onFrame(frame) {
      const r = this.state.runner;
      r.tick(performance.now());
      if (this.$("[data-phase]"))
        this.$("[data-phase]").textContent =
          r.index < r.count ? r.label : L("Contraste listo", "Contrast complete");
      if (this.$("[data-remain]"))
        this.$("[data-remain]").textContent =
          r.index < r.count ? `${Math.ceil(r.remaining)}s` : "✓";
      // Note events from RMS (works for short staccato; hold logger only keeps ≥2s)
      const voiced = !!frame.voiced || (frame.rms || 0) >= 0.018;
      const now = performance.now();
      if (voiced && !this.state.noteOn) {
        this.state.noteOn = true;
        this.state.noteStart = now;
      } else if (!voiced && this.state.noteOn) {
        this.state.noteOn = false;
        const sec = (now - this.state.noteStart) / 1000;
        if (sec >= 0.08 && sec < 0.45) this.state.shortHolds++;
        if (sec >= 1.2) this.state.longHolds++;
        if (this.$("[data-sh]")) this.$("[data-sh]").textContent = String(this.state.shortHolds);
        if (this.$("[data-lg]")) this.$("[data-lg]").textContent = String(this.state.longHolds);
      }
    },
    onStop() {
      // flush open note
      if (this.state.noteOn) {
        const sec = (performance.now() - this.state.noteStart) / 1000;
        if (sec >= 0.08 && sec < 0.45) this.state.shortHolds++;
        if (sec >= 1.2) this.state.longHolds++;
        this.state.noteOn = false;
      }
      const patches = { rounds: this.state.runner?.index || 0 };
      if (this.state.shortHolds + this.state.longHolds > 0) {
        patches.staccatoEase = this.state.shortHolds >= 4 ? 4 : 3;
        patches.legatoLine = this.state.longHolds >= 3 ? 4 : 3;
      }
      return {
        patches,
        summary: `short ${this.state.shortHolds} · long ${this.state.longHolds}`
      };
    }
  });

  Modes.onsetReps = baseMode({
    id: "onsetReps",
    render() {
      this.state.easy = 0;
      this.state.hard = 0;
      this.state.wasQuiet = true;
      this.hud.innerHTML = `
        <div class="mode-title">${L("Repeticiones de ataque suave", "Easy onset reps")}</div>
        <div class="mode-big" data-e>0 / ${this.profile.targetReps || 10}</div>
        <p class="mode-meta">${L("Ataques duros marcados: <strong data-h>0</strong>", "Hard attacks flagged: <strong data-h>0</strong>")}</p>
        <p class="mode-meta muted">${L("Parte del silencio; un inicio brusco cuenta como duro.", "Start from silence; a spiky onset counts as hard.")}</p>
      `;
    },
    onFrame(frame) {
      const quiet = (frame.rms || 0) < 0.015;
      if (quiet) {
        this.state.wasQuiet = true;
        return;
      }
      if (this.state.wasQuiet && (frame.rms || 0) > 0.02) {
        this.state.wasQuiet = false;
        // hard if sudden high rms without gradual
        if ((frame.rms || 0) > 0.12) {
          this.state.hard++;
          if (this.$("[data-h]")) this.$("[data-h]").textContent = String(this.state.hard);
        } else {
          this.state.easy++;
          if (this.$("[data-e]"))
            this.$("[data-e]").textContent = `${this.state.easy} / ${this.profile.targetReps || 10}`;
        }
      }
    },
    onStop() {
      return {
        patches: {
          easyOnsets: this.state.easy,
          balance: this.state.easy >= 8 && this.state.hard <= 2 ? 5 : 3
        },
        summary: `${this.state.easy} easy / ${this.state.hard} hard onsets`
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
   * s17 jaw & neck release — silent guided phases. Nothing to detect: the value
   * is being walked through the four releases instead of skipping them because
   * they make no sound.
   */
  Modes.releaseFlow = baseMode({
    id: "releaseFlow",
    render() {
      const phases = this.profile.phases || [];
      this.state.phases = phases;
      this.state.runner = createPhaseRunner(phases, (i, p) => {
        if (global.VTToast) global.VTToast(p.label);
        const cueEl = this.$("[data-cue]");
        if (cueEl) cueEl.textContent = phaseCueFor(p);
      });
      this.hud.innerHTML = `
        <div class="mode-title">${L("Soltar mandíbula y cuello", "Jaw & neck release")}</div>
        <div class="mode-phase" data-phase>${phases[0]?.label || L("Suelta", "Release")}</div>
        <div class="mode-big" data-remain>—</div>
        <div class="mode-bar"><span data-bar style="width:0%"></span></div>
        <p class="mode-meta" data-cue>${phaseCueFor(phases[0])}</p>
        <p class="mode-meta muted">${L(
          "Sin sonido y sin prisa. Si algo tira o duele, hazlo más pequeño.",
          "No sound, no hurry. If anything pulls or hurts, make it smaller."
        )}</p>
      `;
    },
    onFrame() {
      const r = this.state.runner;
      if (!r) return;
      r.tick(performance.now());
      const done = r.index >= r.count;
      this.state.done = Math.min(r.index, r.count);
      if (this.$("[data-phase]")) {
        this.$("[data-phase]").textContent = done
          ? L("Listo — cuello y mandíbula sueltos", "Done — jaw and neck free")
          : r.label;
      }
      if (this.$("[data-remain]"))
        this.$("[data-remain]").textContent = done ? "✓" : `${Math.ceil(r.remaining)}s`;
      if (this.$("[data-bar]"))
        this.$("[data-bar]").style.width = `${(this.state.done / Math.max(1, r.count)) * 100}%`;
    },
    onStop() {
      const n = this.state.done || 0;
      return {
        patches: n > 0 ? { phasesDone: n } : {},
        summary: `${n}/${this.state.phases?.length || 0} release phases`
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
   * s19 soft palate — surprise / pre-yawn phases, then sound in that space.
   * A sustained voiced hold during a sounding phase is what counts, so the
   * exercise rewards singing from the open space rather than just opening.
   */
  Modes.openSpace = baseMode({
    id: "openSpace",
    render() {
      const phases = this.profile.phases || [];
      this.state.phases = phases;
      this.state.holds = 0;
      this.state.voiced = 0;
      this.state.minHoldMs = this.profile.minHoldMs || 1500;
      this.state.runner = createPhaseRunner(phases, (i, p) => {
        if (global.VTToast) global.VTToast(p.label);
        const cueEl = this.$("[data-cue]");
        if (cueEl) cueEl.textContent = phaseCueFor(p);
        this.state.voiced = 0;
      });
      this.hud.innerHTML = `
        <div class="mode-title">${L("Paladar blando · espacio interno", "Soft palate · inner space")}</div>
        <div class="mode-phase" data-phase>${phases[0]?.label || L("Sorpresa", "Surprise")}</div>
        <div class="mode-big" data-h>0 ${L("abiertos", "open")}</div>
        <p class="mode-meta" data-cue>${phaseCueFor(phases[0])}</p>
        <p class="mode-meta muted">${L(
          "Sostén ≥1,5 s en las fases con sonido para sumar un espacio abierto.",
          "Hold ≥1.5s during the sounding phases to log an open space."
        )}</p>
      `;
    },
    onFrame(frame) {
      const r = this.state.runner;
      if (!r) return;
      r.tick(performance.now());
      const done = r.index >= r.count;
      const phase = this.state.phases[r.index];
      if (this.$("[data-phase]")) {
        this.$("[data-phase]").textContent = done
          ? L("Listo — guarda ese espacio", "Done — keep that space")
          : r.label;
      }
      // Only sounding phases log holds; the silent ones are the setup
      if (!done && phase && phase.sound && frame.voiced) {
        this.state.voiced += frame.dtMs || 16;
        if (this.state.voiced >= this.state.minHoldMs) {
          this.state.holds += 1;
          this.state.voiced = 0;
          if (this.$("[data-h]"))
            this.$("[data-h]").textContent = `${this.state.holds} ${L("abiertos", "open")}`;
        }
      } else if (!frame.voiced) {
        this.state.voiced = 0;
      }
    },
    onStop() {
      const n = this.state.holds || 0;
      return {
        patches: n > 0 ? { openHolds: n } : {},
        summary: `${n} open-space holds`
      };
    }
  });

  /**
   * s20 five vowels — I E A O U on one pitch. Each vowel gets its own steadiness
   * reading, so the closed vowels that usually collapse show up as the weak ones
   * instead of being hidden inside one average.
   */
  Modes.vowelLadder = baseMode({
    id: "vowelLadder",
    render() {
      this.state.vowels = this.profile.vowels || ["I", "E", "A", "O", "U"];
      this.state.secPer = this.profile.secPerVowel || 4;
      this.state.i = 0;
      this.state.t = 0;
      this.state.rounds = 0;
      this.state.last = performance.now();
      this.state.samples = [];
      this.state.scores = this.state.vowels.map(() => []);
      const chips = this.state.vowels
        .map(
          (v, i) =>
            `<span class="vowel-chip${i === 0 ? " is-on" : ""}" data-v="${i}">${v}</span>`
        )
        .join("");
      this.hud.innerHTML = `
        <div class="mode-title">${L("Cinco vocales · I E A O U", "Five vowels · I E A O U")}</div>
        <div class="vowel-row" data-chips>${chips}</div>
        <div class="mode-big" data-cur>${this.state.vowels[0]}</div>
        <div class="mode-bar thick"><span data-bar style="width:0%"></span></div>
        <p class="mode-meta">${L("Vueltas", "Rounds")} <strong data-r>0</strong> · ${L(
          "Uniformidad",
          "Evenness"
        )} <strong data-ev>—</strong></p>
        <p class="mode-meta muted">${L(
          "Mismo espacio en todas. La vocal cambia de forma, no de tamaño.",
          "Same space on all of them. The vowel changes shape, not size."
        )}</p>
      `;
      if (this.profile.refPitch && global.VT_NOTE_FREQ?.[this.profile.refPitch]) {
        this.state.refName = this.profile.refPitch;
        this.state.wantName = this.profile.refPitch;
      }
    },
    onStart() {
      this.state.last = performance.now();
      this._ref();
    },
    _ref() {
      // Published for the app: an ownsTarget mode's current note is what the
      // piano reference should sound, in place of the generic refPitch.
      this.state.wantName = this.state.refName;
      const n = shiftedNote(this.state.refName);
      if (!n) return;
      if (typeof global.VTSetPracticeTarget === "function" && global.VT_NOTE_FREQ?.[n]) {
        global.VTSetPracticeTarget(global.VT_NOTE_FREQ[n], n);
      }
      if (global.VTPiano?.playRefPitch) global.VTPiano.playRefPitch(n, 2.2, true).catch(() => {});
    },
    onFrame(frame) {
      const now = performance.now();
      const dt = Math.min(0.25, (now - this.state.last) / 1000);
      this.state.last = now;
      this.state.t += dt;
      // Steadiness of the current vowel from loudness variance
      const rms = frame.rms || 0;
      if (rms > 0.01) {
        this.state.samples.push(rms);
        if (this.state.samples.length > 90) this.state.samples.shift();
      }
      let steady = 0;
      const arr = this.state.samples;
      if (arr.length > 10) {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const v = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
        steady = clamp(1 - Math.sqrt(v) * 8, 0, 1);
        if (this.$("[data-bar]")) this.$("[data-bar]").style.width = `${steady * 100}%`;
        if (this.$("[data-ev]"))
          this.$("[data-ev]").textContent =
            steady > 0.7 ? L("pareja", "steady") : steady > 0.4 ? L("ok", "ok") : L("irregular", "uneven");
      }
      if (this.state.t >= this.state.secPer) {
        this.state.t = 0;
        if (steady > 0) this.state.scores[this.state.i].push(steady);
        this.state.samples = [];
        this.state.i += 1;
        if (this.state.i >= this.state.vowels.length) {
          this.state.i = 0;
          this.state.rounds += 1;
          if (this.$("[data-r]")) this.$("[data-r]").textContent = String(this.state.rounds);
          this._ref();
        }
        const cur = this.state.vowels[this.state.i];
        if (this.$("[data-cur]")) this.$("[data-cur]").textContent = cur;
        this.hud?.querySelectorAll?.(".vowel-chip").forEach((c, idx) => {
          c.classList.toggle("is-on", idx === this.state.i);
        });
      }
    },
    onStop() {
      const rounds = this.state.rounds || 0;
      const means = this.state.scores.map((a) =>
        a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0
      );
      const seen = means.filter((m) => m > 0);
      const patches = {};
      if (rounds > 0) patches.rounds = rounds;
      if (seen.length >= 3) {
        const worst = Math.min(...seen);
        patches.evenVowels = worst > 0.7 ? 5 : worst > 0.55 ? 4 : worst > 0.35 ? 3 : 2;
      }
      const weakIdx = means.findIndex((m) => m > 0 && m === Math.min(...seen));
      const weak = weakIdx >= 0 ? this.state.vowels[weakIdx] : null;
      return {
        patches,
        summary: weak ? `${rounds} rounds · weakest vowel ${weak}` : `${rounds} vowel rounds`
      };
    }
  });

  /**
   * s21–s25 resonance zones — low / middle / high. One mode, configured with the
   * zones each exercise works: a single zone for the focused drills, all three
   * for the tour. Targets are held by pitch like the hum mode, zones advance on
   * time, and the zone strip shows where the voice actually is versus where the
   * exercise asked for it.
   */
  Modes.resonanceZone = baseMode({
    id: "resonanceZone",
    render() {
      const zones = this.profile.zones || [];
      this.state.zones = zones;
      this.state.z = 0;
      this.state.t = 0;
      this.state.last = performance.now();
      this.state.ni = 0;
      this.state.held = 0;
      this.state.inBand = 0;
      this.state.inZoneMs = 0;
      this.state.voicedMs = 0;
      this.state.zoneHits = zones.map(() => 0);
      const allNotes = zones.reduce((a, z) => a.concat(z.notes || []), []);
      this.state.allNotes = allNotes;
      const strip = zones
        .map(
          (z, i) =>
            `<span class="zone-chip${i === 0 ? " is-on" : ""}" data-z="${i}">${
              isEs() ? z.labelEs || z.label : z.label
            }</span>`
        )
        .join("");
      this.hud.innerHTML = `
        <div class="mode-title">${L("Zonas de resonancia", "Resonance zones")}</div>
        <div class="zone-row" data-zones>${strip}</div>
        <div class="mode-phase" data-zn>${
          isEs() ? zones[0]?.labelEs || zones[0]?.label || "" : zones[0]?.label || ""
        }</div>
        <div class="mode-big" data-t>${allNotes[0] || "—"}</div>
        <p class="mode-meta">${L("Objetivos", "Targets")} <strong data-h>0</strong> · ${L(
          "En zona",
          "In zone"
        )} <strong data-iz>0%</strong></p>
        <p class="mode-meta" data-cue>${phaseCueFor(zones[0])}</p>
      `;
      if (typeof global.VTLockHighwayNotes === "function" && allNotes.length) {
        global.VTLockHighwayNotes(allNotes);
      }
    },
    onStart() {
      this.state.last = performance.now();
      if (typeof global.VTLockHighwayNotes === "function" && this.state.allNotes?.length) {
        global.VTLockHighwayNotes(this.state.allNotes);
      }
      this._pushTarget();
    },
    _zoneNotes() {
      return this.state.zones[this.state.z]?.notes || [];
    },
    _pushTarget() {
      const notes = this._zoneNotes();
      const n = notes[this.state.ni % Math.max(1, notes.length)];
      if (!n) return;
      const sounded = shiftedNote(n);
      this.state.wantName = n;
      this.state.wantFreq = global.VT_NOTE_FREQ?.[sounded];
      if (typeof global.VTSetPracticeTarget === "function" && this.state.wantFreq) {
        global.VTSetPracticeTarget(this.state.wantFreq, sounded);
      }
      if (global.VTPiano?.playRefPitch)
        global.VTPiano.playRefPitch(sounded, 2.2, true).catch(() => {});
      if (this.$("[data-t]")) this.$("[data-t]").textContent = sounded;
    },
    _setZone(i) {
      this.state.z = i;
      this.state.ni = 0;
      this.state.inBand = 0;
      const z = this.state.zones[i];
      if (this.$("[data-zn]"))
        this.$("[data-zn]").textContent = isEs() ? z.labelEs || z.label : z.label;
      if (this.$("[data-cue]")) this.$("[data-cue]").textContent = phaseCueFor(z);
      this.hud?.querySelectorAll?.(".zone-chip").forEach((c, idx) => {
        c.classList.toggle("is-on", idx === i);
      });
      if (global.VTToast) global.VTToast(isEs() ? z.labelEs || z.label : z.label);
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
    onFrame(frame) {
      const now = performance.now();
      const dt = Math.min(0.25, (now - this.state.last) / 1000);
      this.state.last = now;
      const zone = this.state.zones[this.state.z];
      // Zone advances on time (single-zone exercises simply never advance)
      if (zone && zone.sec && this.state.zones.length > 1) {
        this.state.t += dt;
        if (this.state.t >= zone.sec) {
          this.state.t = 0;
          this._setZone((this.state.z + 1) % this.state.zones.length);
        }
      }
      // Target lock inside the zone
      if (this.state.wantFreq && frame.voiceFreq && global.VTPitchUtils) {
        const cents = Math.abs(
          (global.VTPitchUtils.freqToMidi(frame.voiceFreq) -
            global.VTPitchUtils.freqToMidi(this.state.wantFreq)) *
            100
        );
        if (cents <= 45 && frame.voiced) {
          this.state.inBand += frame.dtMs || 16;
          if (this.state.inBand >= 900) {
            this.state.inBand = 0;
            this.state.held += 1;
            this.state.zoneHits[this.state.z] += 1;
            this.state.ni += 1;
            this._pushTarget();
            if (this.$("[data-h]")) this.$("[data-h]").textContent = String(this.state.held);
          }
        } else this.state.inBand = 0;
      }
      // How much of your sung time landed in the zone the exercise asked for
      if (frame.voiced && frame.voiceFreq) {
        this.state.voicedMs += frame.dtMs || 16;
        if (this._zoneOf(frame.voiceFreq) === this.state.z)
          this.state.inZoneMs += frame.dtMs || 16;
        if (this.$("[data-iz]")) {
          const pct = this.state.voicedMs
            ? Math.round((this.state.inZoneMs / this.state.voicedMs) * 100)
            : 0;
          this.$("[data-iz]").textContent = `${pct}%`;
        }
      }
    },
    onStop() {
      const held = this.state.held || 0;
      const pct = this.state.voicedMs
        ? Math.round((this.state.inZoneMs / this.state.voicedMs) * 100)
        : 0;
      const patches = {};
      if (held > 0) patches.zoneTargets = held;
      if (this.state.voicedMs > 3000) {
        const scale = pct >= 80 ? 5 : pct >= 60 ? 4 : pct >= 40 ? 3 : 2;
        // Each zone exercise names its own quality metric ("body", "buzz",
        // "stability"…): a patch under any other key is silently dropped.
        const key =
          this.profile.qualityMetric || (this.state.zones.length > 1 ? "transitions" : "steadiness");
        patches[key] = scale;
      }
      const spread = this.state.zoneHits
        .map((n, i) => `${isEs() ? this.state.zones[i].labelEs : this.state.zones[i].label}:${n}`)
        .join(" · ");
      return { patches, summary: `${held} targets · ${pct}% in zone · ${spread}` };
    }
  });

  /**
   * s26 placement A/B — two takes of the same phrase, plain then placed. There is
   * nothing to detect here that the ear cannot do better, so the mode's job is to
   * hold the protocol: same key, same melody, both takes marked, then listen.
   */
  Modes.placementAB = baseMode({
    id: "placementAB",
    render() {
      const phases = this.profile.phases || [];
      this.state.phases = phases;
      this.state.takes = 0;
      this.state.runner = createPhaseRunner(phases, (i, p) => {
        if (global.VTToast) global.VTToast(p.label);
        const cueEl = this.$("[data-cue]");
        if (cueEl) cueEl.textContent = phaseCueFor(p);
      });
      this.hud.innerHTML = `
        <div class="mode-title">${L("Comparar colocaciones · A/B", "Placement compare · A/B")}</div>
        <div class="mode-phase" data-phase>${phases[0]?.label || L("Toma A", "Take A")}</div>
        <div class="mode-big" data-remain>—</div>
        <p class="mode-meta" data-cue>${phaseCueFor(phases[0])}</p>
        <div class="controls-row">
          <button type="button" class="btn btn-sm" data-take>${L(
            "Marcar toma ✓",
            "Mark take ✓"
          )}</button>
        </div>
        <p class="mode-meta">${L("Tomas marcadas", "Takes marked")} <strong data-n>0</strong>/2 · ${L(
          "misma tonalidad en las dos",
          "same key in both"
        )}</p>
      `;
      this.$("[data-take]")?.addEventListener("click", () => {
        this.state.takes = Math.min(2, this.state.takes + 1);
        if (this.$("[data-n]")) this.$("[data-n]").textContent = String(this.state.takes);
      });
    },
    onFrame() {
      const r = this.state.runner;
      if (!r) return;
      r.tick(performance.now());
      const done = r.index >= r.count;
      if (this.$("[data-phase]"))
        this.$("[data-phase]").textContent = done
          ? L("Escucha las dos y quédate con una", "Play both back and keep one")
          : r.label;
      if (this.$("[data-remain]"))
        this.$("[data-remain]").textContent = done ? "✓" : `${Math.ceil(r.remaining)}s`;
    },
    onStop() {
      const n = this.state.takes || 0;
      return {
        patches: n > 0 ? { takes: n } : {},
        summary: n >= 2 ? "A/B takes marked — compare the playback" : `${n}/2 takes marked`
      };
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
      this.state.levels = [];
      this.state.steadyScore = 0;
      this.hud.innerHTML = `
        <div class="mode-title">${L("Solfeo en trino de labios", "Lip-trill solfège")}</div>
        <div class="trill-row">
          <span class="trill-syl" data-syl>${this.state.syllables[0]}</span>
          <span class="trill-note" data-note>—</span>
        </div>
        <div class="mode-bar thick"><span data-bar style="width:0%"></span></div>
        <p class="mode-meta">${L("Uniformidad del trino:", "Trill evenness:")} <strong data-ev>—</strong></p>
        <p class="mode-meta">${L("Paso", "Step")} <strong data-step>1</strong>/${
          this.state.pattern.length
        } · ${L("Pasadas", "Patterns")} <strong data-p>0</strong> · ${L(
          "Raíz",
          "Root"
        )} <strong data-root>—</strong></p>
        <p class="mode-meta muted">${L(
          "No dejes que el burbujeo se pare entre notas. La raíz sube sola al completar la pasada.",
          "Do not let the bubble stop between notes. The root moves up on its own once the pattern lands."
        )}</p>
      `;
      this._lockLadder();
      this._pushTarget();
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
      viz.lockMidiRange(
        this.state.baseMidi + Math.min(...this.state.pattern) + sh,
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
    },
    onStart() {
      this._lockLadder();
      this._pushTarget();
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
      }
      this._pushTarget();
    },
    /**
     * Trill evenness as a coefficient of variation rather than a bare standard
     * deviation: the same trill would otherwise score differently at different
     * input gains. The window is short enough to stay inside one scale step, so
     * the legitimate level change between notes is not counted as unevenness.
     */
    _evenness(rms) {
      if (!(rms > 0)) return;
      const win = this.profile.evenWindow || 40;
      this.state.levels.push(rms);
      if (this.state.levels.length > win) this.state.levels.shift();
      const a = this.state.levels;
      if (a.length < 12) return;
      const mean = a.reduce((x, y) => x + y, 0) / a.length;
      if (!(mean > 0)) return;
      const sd = Math.sqrt(a.reduce((x, y) => x + (y - mean) ** 2, 0) / a.length);
      const steady = clamp(1 - (sd / mean) * (this.profile.evenK || 6), 0, 1);
      this.state.steadyScore = steady;
      if (this.$("[data-bar]")) this.$("[data-bar]").style.width = `${Math.round(steady * 100)}%`;
      if (this.$("[data-ev]"))
        this.$("[data-ev]").textContent =
          steady > 0.7
            ? L("estable", "steady")
            : steady > 0.4
              ? L("aceptable", "ok")
              : L("irregular", "uneven");
    },
    onFrame(frame) {
      const dt = frame.dtMs || 16;
      const rms = frame.rms || 0;
      this._evenness(rms);
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
      const p = this.state.patterns || 0;
      const s = this.state.steadyScore || 0;
      const patches = {};
      if (p > 0) patches.patterns = p;
      if (this.state.levels.length >= 12 && s > 0.2) {
        patches.trillSteady = s > 0.75 ? 5 : s > 0.55 ? 4 : 3;
      }
      const top = global.VTPitchUtils
        ? global.VTPitchUtils.midiToName(this.state.rootMidi)
        : "—";
      return {
        patches,
        summary: p
          ? L(
              `${p} ${p === 1 ? "pasada" : "pasadas"} · raíz alcanzada ${top}`,
              `${p} ${p === 1 ? "pattern" : "patterns"} · root reached ${top}`
            )
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
