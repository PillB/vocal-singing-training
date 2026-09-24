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
          st.startArmed = st.quiet >= 480;
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
