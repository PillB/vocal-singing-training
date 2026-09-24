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

  Modes.rateLadder = baseMode({
    id: "rateLadder",
    render() {
      const phases = this.profile.phases || [];
      // BPM rises each phase: 72 → 96 → 120 → 144
      this.state.bpms = phases.map((_, i) => 72 + i * 24);
      // Localize phase labels (profiles store English keys / EN copy)
      const phaseLabel = (p) => phaseLabelFor(p);
      this.state.phaseLabel = phaseLabel;
      this.state.runner = createPhaseRunner(phases, (i, p) => {
        if (global.VTToast)
          global.VTToast(`${phaseLabel(p, i)} · ~${this.state.bpms[i]} BPM`);
      });
      this.state.beatMs = 0;
      this.state.flash = false;
      const p0 = phases[0];
      const idlePhase = phaseLabel(p0, 0);
      const idleRemain = p0?.sec != null ? `${p0.sec}s` : "—";
      this.hud.innerHTML = `
        <div class="mode-title">${L("Dicción · escalera de ritmo", "Diction · rate ladder")}</div>
        <div class="mode-phase" data-phase>${idlePhase}</div>
        <div class="metro-dot" data-metro aria-hidden="true"></div>
        <div class="mode-big" data-remain>${idleRemain}</div>
        <div class="mode-bar"><span data-bar style="width:0%"></span></div>
        <p class="mode-meta">${L("Ritmo <strong data-bpm>~72 BPM</strong> · sobre-articula · hablando: <strong data-act>0%</strong>", "Pace cue <strong data-bpm>~72 BPM</strong> · over-articulate · speech on: <strong data-act>0%</strong>")}</p>
        <p class="mode-meta muted">${L("Mantén las consonantes claras al subir el ritmo en cada fase.", "Keep consonants crisp as the pulse speeds up each phase.")}</p>
      `;
    },
    onFrame(frame) {
      const r = this.state.runner;
      if (!r) return;
      r.tick(performance.now());
      const phase = this.profile.phases[r.index];
      const total = phase?.sec || 1;
      const pct = phase ? clamp(((total - r.remaining) / total) * 100, 0, 100) : 100;
      const bpm = this.state.bpms[Math.min(r.index, this.state.bpms.length - 1)] || 72;
      const beatPeriod = 60000 / bpm;
      this.state.beatMs = (this.state.beatMs || 0) + (frame.dtMs || 16);
      if (this.state.beatMs >= beatPeriod) {
        this.state.beatMs = 0;
        const dot = this.$("[data-metro]");
        if (dot) {
          dot.classList.remove("pulse");
          // reflow
          void dot.offsetWidth;
          dot.classList.add("pulse");
        }
      }
      if (this.$("[data-bpm]")) this.$("[data-bpm]").textContent = `~${bpm} BPM`;
      if (this.$("[data-phase]")) {
        const lab =
          r.index < r.count
            ? this.state.phaseLabel?.(phase, r.index) || r.label
            : L("Escalera lista — mezcla libre", "Ladder complete — free mix");
        this.$("[data-phase]").textContent = lab;
      }
      if (this.$("[data-remain]"))
        this.$("[data-remain]").textContent =
          r.index < r.count ? `${Math.ceil(r.remaining)}s` : "✓";
      if (this.$("[data-bar]")) this.$("[data-bar]").style.width = `${pct}%`;
      this.state.samples = (this.state.samples || 0) + 1;
      if (frame.voiced || frame.rms > 0.02) this.state.active = (this.state.active || 0) + 1;
      const act = Math.round(((this.state.active || 0) / this.state.samples) * 100);
      if (this.$("[data-act]")) this.$("[data-act]").textContent = `${act}%`;
    },
    onStop() {
      const r = this.state.runner;
      const done = r ? Math.min(r.count, r.index + (r.remaining <= 0 ? 0 : 1)) : 0;
      const mins = Math.max(1, Math.round((performance.now() - this.state.startedAt) / 60000));
      return {
        patches: {
          duration: mins,
          rateControl: clamp(1 + done, 1, 5)
        },
        summary: L(
          `${done}/${r?.count || 0} fases de ritmo · ${mins} min`,
          `${done}/${r?.count || 0} rate phases · ${mins} min`
        )
      };
    }
  });

  /** v8 — distinct from rate ladder: log metaphors per topic */
  Modes.metronomeSpeech = baseMode({
    id: "metronomeSpeech",
    render() {
      const phases = this.profile.phases || [];
      this.state.runner = createPhaseRunner(phases, (i, p) => {
        if (global.VTToast) global.VTToast(p.label);
      });
      this.state.logged = 0;
      this.hud.innerHTML = `
        <div class="mode-title">${L("Fluidez con metáforas", "Metaphor fluency")}</div>
        <div class="mode-phase" data-phase>${phases[0]?.label || L("Tema", "Topic")}</div>
        <div class="mode-big" data-remain>—</div>
        <button type="button" class="btn btn-primary btn-sm" data-log>${L("Dije una metáfora ✓", "I spoke a metaphor ✓")}</button>
        <p class="mode-meta">${L("Metáforas: <strong data-n>0</strong> / " + phases.length, "Metaphors logged: <strong data-n>0</strong> / " + phases.length)}</p>
        <p class="mode-meta muted">${L("Una imagen concreta por tema — dilo en voz alta y toca.", "One concrete image per topic — say it out loud, then tap.")}</p>
      `;
      this.$("[data-log]")?.addEventListener("click", () => {
        this.state.logged++;
        if (this.$("[data-n]")) this.$("[data-n]").textContent = String(this.state.logged);
      });
    },
    onFrame() {
      const r = this.state.runner;
      if (!r) return;
      r.tick(performance.now());
      if (this.$("[data-phase]"))
        this.$("[data-phase]").textContent =
          r.index < r.count ? r.label : L("Todos los temas listos", "All topics done");
      if (this.$("[data-remain]"))
        this.$("[data-remain]").textContent =
          r.index < r.count ? `${Math.ceil(r.remaining)}s` : "✓";
    },
    onStop() {
      const n = this.state.logged || 0;
      return {
        patches: {
          metaphorCount: n,
          vividness: n >= 5 ? 5 : n >= 3 ? 4 : n >= 1 ? 3 : 2
        },
        summary: `${n} metaphors logged`
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
          p && p.kind === "story" ? { draw: G.art.story, aspect: 3.2, stackAspect: 2, plain: true } : { draw: G.art.persona, aspect: 2.6, stackAspect: 1.5, plain: true },
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

  Modes.speechEnergy = baseMode({
    id: "speechEnergy",
    render() {
      const phases = this.profile.phases;
      if (phases) {
        this.state.runner = createPhaseRunner(phases, (i, p) => {
          if (global.VTToast) global.VTToast(p.label);
        });
      }
      this.state.voice = 0;
      this.state.silent = 0;
      this.state.slot = "you"; // you speak | they speak (scripted silence window)
      this.state.slotT = performance.now();
      this.hud.innerHTML = `
        <div class="mode-title">${L("Conexión · bucles de curiosidad", "Connection · curiosity loops")}</div>
        <div class="mode-phase" data-phase>${phases?.[0]?.label || L("Práctica de conversación", "Conversation practice")}</div>
        <div class="mode-big" data-slot>YOU ask / speak</div>
        <div class="listen-bars">
          <div class="listen-speak" data-speak style="width:50%"></div>
        </div>
        <p class="mode-meta">${L("Tú hablas <strong data-sp>50%</strong> · silencio/escucha <strong data-si>50%</strong>", "You speaking <strong data-sp>50%</strong> · silence/listen slots <strong data-si>50%</strong>")}</p>
        <p class="mode-meta muted" data-tip>${L("Imagina su respuesta — cállate en SU turno. Califica presencia al final.", "Imagine their answer — stay quiet in THEIR slot. Rate presence yourself after.")}</p>
      `;
    },
    onFrame(frame) {
      // Alternate 20s you / 25s they (scripted listen)
      if (performance.now() - this.state.slotT > (this.state.slot === "you" ? 20000 : 25000)) {
        this.state.slot = this.state.slot === "you" ? "them" : "you";
        this.state.slotT = performance.now();
        if (this.$("[data-slot]"))
          this.$("[data-slot]").textContent =
            this.state.slot === "you" ? "YOU ask / speak" : "THEIR turn — listen (stay quiet)";
        if (this.$("[data-tip]"))
          this.$("[data-tip]").textContent =
            this.state.slot === "them"
              ? "Scripted listen window — don't monologue."
              : "Open question → reflect one detail → deeper question.";
      }
      if (frame.voiced || frame.rms > 0.025) this.state.voice++;
      else this.state.silent++;
      const t = this.state.voice + this.state.silent || 1;
      const sp = Math.round((this.state.voice / t) * 100);
      const si = 100 - sp;
      if (this.$("[data-speak]")) this.$("[data-speak]").style.width = `${sp}%`;
      if (this.$("[data-sp]")) this.$("[data-sp]").textContent = `${sp}%`;
      if (this.$("[data-si]")) this.$("[data-si]").textContent = `${si}%`;
      if (this.state.runner) {
        this.state.runner.tick(performance.now());
        if (this.$("[data-phase]") && this.state.runner.index < this.state.runner.count)
          this.$("[data-phase]").textContent = this.state.runner.label;
      }
    },
    onStop() {
      const t = this.state.voice + this.state.silent || 1;
      const listenBias = this.state.silent / t;
      // Honest: show data only — do not auto-score presence from silence
      return {
        patches: {},
        summary: `Speak ${Math.round((1 - listenBias) * 100)}% · silence ${Math.round(listenBias * 100)}% — rate presence yourself`
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

  /** v11 — distinct from power pause: user flags fillers + replaces with pause */
  Modes.fillerDetect = baseMode({
    id: "fillerDetect",
    render() {
      this.state.fillers = 0;
      this.state.replacements = 0;
      this.state.pauses = 0;
      this.state.hadSpeech = false;
      this.state.inSilence = false;
      this.state.minP = (this.profile.minPauseSec || 0.7) * 1000;
      this.hud.innerHTML = `
        <div class="mode-title">${L("Elimina rellenos", "Kill the fillers")}</div>
        <div class="controls-row">
          <button type="button" class="btn btn-danger btn-sm" data-fill>Caught an um/like +</button>
          <button type="button" class="btn btn-success btn-sm" data-rep>Paused instead +</button>
        </div>
        <p class="mode-meta">${L("Rellenos <strong data-f>0</strong> · Reemplazos <strong data-r>0</strong> · Pausas auto <strong data-p>0</strong>", "Fillers noted <strong data-f>0</strong> · Replacements <strong data-r>0</strong> · Auto pauses <strong data-p>0</strong>")}</p>
        <p class="mode-meta muted">${L("Toca al notar un relleno. Prefiere “Pausé en su lugar” si te atrapas a tiempo.", "Tap when you notice a filler. Prefer “Paused instead” when you catch yourself.")}</p>
      `;
      this.$("[data-fill]")?.addEventListener("click", () => {
        this.state.fillers++;
        if (this.$("[data-f]")) this.$("[data-f]").textContent = String(this.state.fillers);
      });
      this.$("[data-rep]")?.addEventListener("click", () => {
        this.state.replacements++;
        if (this.$("[data-r]")) this.$("[data-r]").textContent = String(this.state.replacements);
      });
    },
    onFrame(frame) {
      const now = performance.now();
      const quiet = !frame.voiced && (frame.rms || 0) < 0.02;
      if (!quiet) {
        this.state.hadSpeech = true;
        this.state.inSilence = false;
        this.state.countedThis = false;
        return;
      }
      if (!this.state.hadSpeech) return;
      if (!this.state.inSilence) {
        this.state.inSilence = true;
        this.state.silenceStart = now;
      } else if (now - this.state.silenceStart >= this.state.minP && !this.state.countedThis) {
        this.state.pauses++;
        this.state.countedThis = true;
        this.state.hadSpeech = false;
        if (this.$("[data-p]")) this.$("[data-p]").textContent = String(this.state.pauses);
      }
    },
    onStop() {
      const f = this.state.fillers;
      const r = this.state.replacements;
      // Honest: filler count is user-logged; replacement scale from user taps only
      return {
        patches: {
          fillerCount: f,
          awareness: f + r >= 3 ? 4 : 3,
          replacement: r >= 3 ? 5 : r >= 1 ? 4 : 2
        },
        summary: `${f} fillers noted · ${r} pause-replacements · ${this.state.pauses} auto pauses`
      };
    }
  });

  Modes.keyPointPace = baseMode({
    id: "keyPointPace",
    render() {
      this.state.keys = 0;
      this.state.confirmed = 0;
      this.state.slowUntil = 0;
      this.state.quietMs = 0;
      this.hud.innerHTML = `
        <div class="mode-title">${L("Ritmo con impacto", "Pace for impact")}</div>
        <div class="mode-big" data-k>0 / 3 confirmed</div>
        <button type="button" class="btn btn-primary btn-sm" data-key>Mark key point — then slow 1s</button>
        <p class="mode-meta" data-st>${L("Toca y baja ritmo/energía ~1s para confirmar.", "Tap, then drop pace/energy ~1 second to confirm.")}</p>
      `;
      this.$("[data-key]")?.addEventListener("click", () => {
        this.state.keys++;
        this.state.slowUntil = performance.now() + 1200;
        this.state.quietMs = 0;
        if (this.$("[data-st]"))
          this.$("[data-st]").textContent = L("Ventana lenta — suaviza ~1 s…", "Slow window — ease off ~1s…");
      });
    },
    onFrame(frame) {
      if (performance.now() < this.state.slowUntil) {
        // confirm if speech is softer or sparse
        if ((frame.rms || 0) < 0.04 || !frame.voiced) {
          this.state.quietMs += frame.dtMs || 16;
          if (this.state.quietMs >= 600 && this.state.confirming !== this.state.keys) {
            this.state.confirming = this.state.keys;
            this.state.confirmed++;
            if (this.$("[data-k]"))
              this.$("[data-k]").textContent = `${this.state.confirmed} / 3 confirmed`;
            if (this.$("[data-st]")) this.$("[data-st]").textContent = L("Bajada confirmada ✓", "Slow-down confirmed ✓");
          }
        }
      }
    },
    onStop() {
      const n = this.state.confirmed || 0;
      return {
        patches: n > 0 ? { keySlowdowns: n, paceCraft: clamp(n + 1, 1, 5) } : { keySlowdowns: this.state.keys || 0 },
        summary: `${n} confirmed slow-downs (${this.state.keys} marked)`
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
