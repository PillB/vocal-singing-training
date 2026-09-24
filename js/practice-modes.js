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
   */
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
      st.holdMs = 900;
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
      st._hold = [];
      const last = st.targets[st.targets.length - 1];
      if (last && last.t1 == null) last.t1 = st.clock;
      if (st.wantMidi != null) st.targets.push({ t0: st.clock, t1: null, midi: st.wantMidi, name: sounded, held: false });
      if (st.targets.length > 400) st.targets.splice(0, st.targets.length - 400);
      if (typeof global.VTSetPracticeTarget === "function" && st.wantFreq) {
        global.VTSetPracticeTarget(st.wantFreq, sounded);
      }
      if (global.VTPiano?.playRefPitch) global.VTPiano.playRefPitch(sounded, 2.2, true).catch(() => {});
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
      // Target hold: ±45 cents at the target's own octave, on sounding frames
      if (st.wantMidi != null) {
        const c = midi != null ? (midi - st.wantMidi) * 100 : null;
        if (c != null && Math.abs(c) <= 45) {
          st.inBand += dt * 1000;
          st._octMs = 0;
          st.octHint = 0;
          st._hold.push({ c, dt, at: st.inBand / 1000, db: raw.db, clar, rel: st.focus === "soft" && soft.ref != null ? soft.rel : null });
          if (st.inBand >= st.holdMs) this._credit();
        } else {
          // A brief wobble costs a little, it does not wipe the hold
          st.inBand = Math.max(0, st.inBand - dt * 2000);
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
      const K = global.VTViz.scenes.resonanceKit;
      const now = this.state.clock;
      if (midi != null) {
        if (!sp.seg) sp.seg = { t0: now, t1: now, m: [], db: [], br: [], gap: 0 };
        sp.seg.t1 = now;
        sp.seg.gap = 0;
        sp.seg.m.push(midi);
        sp.seg.db.push(raw.db);
        if (bright != null) sp.seg.br.push(bright);
      } else if (sp.seg) {
        sp.seg.gap += dt;
        // A turn ends after a quarter second of quiet
        if (sp.seg.gap >= 0.25) {
          const s = sp.seg;
          sp.seg = null;
          const dur = s.t1 - s.t0;
          if (dur >= 0.3 && s.m.length >= 8) {
            const med = K.median(s.m);
            const mean = s.m.reduce((a, b) => a + b, 0) / s.m.length;
            const sd = Math.sqrt(s.m.reduce((a, b) => a + (b - mean) * (b - mean), 0) / s.m.length);
            // Held on one pitch and long enough: sung; otherwise spoken
            const kind = sd < 0.6 && dur >= 0.6 ? "sung" : "spoken";
            const turn = { t0: s.t0, t1: s.t1, kind, med, db: K.median(s.db), br: s.br.length >= 4 ? K.median(s.br) : null };
            sp.turns.push(turn);
            if (sp.turns.length > 120) sp.turns.shift();
            const spoken = sp.turns.filter((x) => x.kind === "spoken").slice(-12);
            if (spoken.length) {
              const all = spoken.map((x) => x.med);
              sp.band = { lo: K.quantile(all, 0.25) - 0.5, hi: K.quantile(all, 0.75) + 0.5, med: K.median(all) };
            }
            if (kind === "sung") {
              const lastSpoken = spoken[spoken.length - 1];
              if (lastSpoken) {
                sp.pairs.push({
                  dDb: turn.db - lastSpoken.db,
                  dBr: turn.br != null && lastSpoken.br != null ? turn.br - lastSpoken.br : null,
                  dSt: turn.med - lastSpoken.med,
                  t: turn.t1
                });
                if (sp.pairs.length > 40) sp.pairs.shift();
              }
            }
          }
        }
      }
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
    /** After Stop no frames arrive: redraw the playhead while a take plays. */
    _tick() {
      const st = this.state;
      if (!st.playing || !st.review || !global.requestAnimationFrame || global.VTViz?.reducedMotion?.()) return;
      requestAnimationFrame(() => {
        if (!this.hud || !st.playing) return;
        this.viz?.draw();
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
