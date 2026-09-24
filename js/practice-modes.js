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
