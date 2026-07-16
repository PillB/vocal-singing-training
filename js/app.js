/**
 * Vocal & Singing Training — app shell
 */
(function () {
  "use strict";

  const state = {
    tab: "vocal",
    tierFilter: "all", // all | basic | advanced
    view: "home", // home | exercise | history | plan
    exercise: null,
    structured: false,
    timer: {
      remaining: 0,
      total: 0,
      running: false,
      handle: null,
      startedAt: null,
      pausedAccum: 0
    },
    recorder: new VTRecorder(),
    practice: new VTPracticeEngine(),
    practiceLive: false,
    selectedProg: "prog1",
    holdSeconds: 0,
    holdTimer: null,
    holdRunning: false,
    reviewChecks: { auditory: false, visual: false, transcription: false },
    pitchViz: null,
    pitchRunning: false,
    pitchGame: null,
    modeInstance: null,
    guideOpen: true,
    pianoOpen: false,
    /** Per-open exercise practice clock (for leave save/discard prompt) */
    sessionPractice: {
      everStarted: false,
      liveSince: null,
      accumulatedMs: 0,
      saved: false
    },
    leavePromptOpen: false
  };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  function tt(key, vars) {
    return typeof globalThis.t === "function" ? globalThis.t(key, vars) : key;
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2800);
  }
  // modes can toast / set pitch target
  window.VTToast = toast;
  window.VTSetPracticeTarget = function (freq, name) {
    if (freq) state.practice.setTargetFreq(freq);
    // Move target only — highway Y-range stays locked for the current option
    if (state.pitchViz && freq) {
      state.pitchViz.setTargetFreq(freq);
    }
    if (name && $("#chord-now")) $("#chord-now").textContent = name;
  };

  /**
   * Lock pitch highway to the max range of a progression/option.
   * Range stays fixed while chords/notes inside that option change.
   */
  function lockHighwayForProgression(progId) {
    if (!state.pitchViz) ensurePitchViz();
    const id = progId || state.selectedProg;
    const prog = (window.VT_PROGRESSIONS || VTPiano?.getProgressions?.() || {})[id];
    if (!prog || !state.pitchViz) return false;
    state.pitchViz.setProgressionRange(prog);
    if (prog.chords?.[0]) state.pitchViz.setTargetFromChord(prog.chords[0]);
    try {
      state.pitchViz._draw?.();
    } catch {
      /* ignore */
    }
    return true;
  }

  /** Lock highway for a flat list of note names (scales, challenges, hum steps). */
  function lockHighwayForNotes(noteNames, opts) {
    if (!state.pitchViz) ensurePitchViz();
    if (!state.pitchViz || !noteNames?.length) return false;
    state.pitchViz.lockRangeFromNoteNames(noteNames, window.VT_NOTE_FREQ, opts);
    const first = noteNames[0];
    if (first && VT_NOTE_FREQ?.[first]) state.pitchViz.setTargetNoteName(first, VT_NOTE_FREQ);
    try {
      state.pitchViz._draw?.();
    } catch {
      /* ignore */
    }
    return true;
  }

  window.VTLockHighwayNotes = lockHighwayForNotes;
  window.VTLockHighwayProg = lockHighwayForProgression;

  function getProfile(ex) {
    return (
      ex?.practice || {
        mode: "recordOnly",
        showPitch: !!ex?.audio?.pitchViz,
        showHold: !!ex?.holdLogger,
        showLevel: true,
        pitchChallenge: false,
        autoPiano: !!ex?.audio?.piano,
        autoRecord: false,
        cue: "Start practice to begin."
      }
    );
  }

  function applyMetricPatches(patches) {
    if (!patches) return;
    Object.entries(patches).forEach(([k, v]) => {
      const input = $(`#metrics-form [name="${k}"]`);
      if (!input || v == null) return;
      if (input.type === "range") {
        input.value = String(v);
        input.dispatchEvent(new Event("input"));
      } else {
        const cur = Number(input.value);
        if (!input.value || Number.isNaN(cur) || v > cur) input.value = v;
      }
    });
  }

  function findExercise(id) {
    const all = [...VT_EXERCISES.vocal, ...VT_EXERCISES.singing];
    return all.find((e) => e.id === id) || null;
  }

  function progressFor(id) {
    return VTStorage.getProgress()[id] || null;
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function setView(name) {
    state.view = name;
    $$(".view").forEach((v) => v.classList.remove("active"));
    const map = {
      home: "#view-home",
      exercise: "#view-exercise",
      history: "#view-history",
      plan: "#view-plan"
    };
    const target = $(map[name]);
    if (target) target.classList.add("active");
    document.body.classList.toggle("view-exercise", name === "exercise");
    updateSessionBanner();
  }

  function setTab(tab) {
    state.tab = tab;
    $$(".tab").forEach((t) => {
      t.classList.toggle("active", t.dataset.tab === tab);
      t.setAttribute("aria-selected", String(t.dataset.tab === tab));
    });
    const settings = VTStorage.getSettings();
    settings.lastTab = tab;
    VTStorage.setSettings(settings);
    renderExerciseList();
    setView("home");
  }

  /** Continue: resume structured session or open first incomplete basic exercise */
  function continuePractice() {
    const s = VTSession.get();
    if (s && s.status !== "completed" && s.order?.length) {
      if (s.status === "paused") VTSession.resume();
      const id = VTSession.currentExerciseId();
      if (id) {
        openExercise(id, true);
        updateSessionBanner();
        return;
      }
    }
    const progress = VTStorage.getProgress();
    const list = VT_EXERCISES[state.tab] || [];
    const basic = list.filter((e) => (e.tier || "basic") === "basic");
    const next =
      basic.find((e) => !progress[e.id]?.completedCount) ||
      list.find((e) => !progress[e.id]?.completedCount) ||
      basic[0] ||
      list[0];
    if (next) openExercise(next.id, false);
    else toast("No exercises available");
  }

  function updateSessionBanner() {
    const banner = $("#session-banner");
    const s = VTSession.get();
    if (!s || s.status === "completed") {
      banner.classList.remove("visible");
      return;
    }
    banner.classList.add("visible");
    const trackLabel = s.track === "vocal" ? "Vocal" : "Singing";
    const status = s.status === "paused" ? "Paused" : "Active";
    $("#session-banner-text").textContent = `${trackLabel} structured session · ${status} · ${VTSession.progressLabel()}`;
    $("#btn-session-resume").hidden = s.status !== "paused";
    $("#btn-session-pause").hidden = s.status !== "active";
  }

  function filteredExercises() {
    const all = VT_EXERCISES[state.tab] || [];
    if (state.tierFilter === "all") return all;
    return all.filter((ex) => (ex.tier || "basic") === state.tierFilter);
  }

  function renderExerciseList() {
    const list = $("#exercise-list");
    const exercises = filteredExercises();
    list.innerHTML = "";
    list.className = `grid track-${state.tab}`;

    $$(".tier-chip").forEach((c) =>
      c.classList.toggle("selected", c.dataset.tier === state.tierFilter)
    );

    const basicCount = (VT_EXERCISES[state.tab] || []).filter((e) => (e.tier || "basic") === "basic")
      .length;
    const advCount = (VT_EXERCISES[state.tab] || []).filter((e) => e.tier === "advanced").length;
    const countEl = $("#tier-counts");
    if (countEl) {
      countEl.textContent = tt("tier.counts", {
        basic: basicCount,
        advanced: advCount,
        showing: exercises.length
      });
    }

    exercises.forEach((ex) => {
      const prog = progressFor(ex.id);
      const tier = ex.tier || "basic";
      const tools =
        (ex.audio.piano ? tt("card.piano") : "") +
        (ex.audio.pitchViz || ex.practice?.showPitch ? tt("card.pitch") : "") +
        (ex.audio.record ? tt("card.record") : tt("card.practice"));
      const sessions = prog?.completedCount || 0;
      const sessLabel =
        sessions === 0
          ? tt("card.notPracticed")
          : sessions === 1
            ? tt("card.sessions", { n: sessions })
            : tt("card.sessions_plural", { n: sessions });
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "card card-ex";
      btn.innerHTML = `
        <div class="card-ex-top">
          <span class="num">${ex.number}</span>
          <span class="badge tier-${tier}">${tt("badge." + tier)}</span>
        </div>
        <h3>${window.VTI18n ? VTI18n.exTitle(ex) : ex.title}</h3>
        <p class="meta">${tt("card.meta", { min: ex.durationMin, tools })}</p>
        <span class="badge ${sessions ? "done" : ""}">${sessLabel}</span>
      `;
      btn.addEventListener("click", () => openExercise(ex.id, false));
      list.appendChild(btn);
    });

    $("#home-track-title").textContent = tt(
      state.tab === "vocal" ? "home.vocalTitle" : "home.singingTitle"
    );
    $("#home-track-sub").textContent = tt(
      state.tab === "vocal" ? "home.vocalSub" : "home.singingSub"
    );
  }

  function resetSessionPractice() {
    state.sessionPractice = {
      everStarted: false,
      liveSince: null,
      accumulatedMs: 0,
      saved: false
    };
  }

  function getExerciseTargetSec(ex) {
    if (!ex) return 300;
    if (ex.timerDefaultSec > 0) return ex.timerDefaultSec;
    if (ex.durationMin > 0) return Math.round(ex.durationMin * 60);
    return 300;
  }

  function flushPracticeClock() {
    if (state.sessionPractice.liveSince != null) {
      state.sessionPractice.accumulatedMs +=
        performance.now() - state.sessionPractice.liveSince;
      state.sessionPractice.liveSince = null;
    }
  }

  function getPracticedSec() {
    let ms = state.sessionPractice.accumulatedMs || 0;
    if (state.sessionPractice.liveSince != null) {
      ms += performance.now() - state.sessionPractice.liveSince;
    }
    return ms / 1000;
  }

  function formatDurationShort(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (m <= 0) return `${s}s`;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  /** True if user practiced ≥10% of planned exercise length and hasn't saved */
  function shouldPromptOnLeave() {
    if (state.leavePromptOpen) return false;
    if (!state.exercise || state.view !== "exercise") return false;
    if (state.sessionPractice.saved) return false;
    if (!state.sessionPractice.everStarted) return false;
    const target = getExerciseTargetSec(state.exercise);
    if (target <= 0) return false;
    return getPracticedSec() >= target * 0.1;
  }

  /**
   * Ask save / discard / stay. Resolves:
   *  "save" | "discard" | "stay"
   */
  function promptLeaveExercise() {
    return new Promise((resolve) => {
      const modal = $("#leave-modal");
      if (!modal) {
        resolve("discard");
        return;
      }
      state.leavePromptOpen = true;
      const practiced = getPracticedSec();
      const target = getExerciseTargetSec(state.exercise);
      const pct = Math.min(100, Math.round((practiced / target) * 100));
      const stats = $("#leave-modal-stats");
      if (stats) {
        stats.textContent = tt("leave.stats", {
          done: formatDurationShort(practiced),
          total: formatDurationShort(target),
          pct: String(pct)
        });
      }
      // Refresh i18n titles if available
      if (window.VTI18n?.apply) {
        try {
          VTI18n.apply(modal);
        } catch {
          /* optional */
        }
      }
      const title = $("#leave-modal-title");
      const body = $("#leave-modal-body");
      const btnSave = $("#leave-save");
      const btnDiscard = $("#leave-discard");
      const btnStay = $("#leave-cancel");
      if (title) title.textContent = tt("leave.title");
      if (body) body.textContent = tt("leave.body");
      if (btnSave) btnSave.textContent = tt("leave.save");
      if (btnDiscard) btnDiscard.textContent = tt("leave.discard");
      if (btnStay) btnStay.textContent = tt("leave.stay");

      modal.hidden = false;
      btnSave?.focus();

      const finish = (choice) => {
        modal.hidden = true;
        state.leavePromptOpen = false;
        btnSave?.removeEventListener("click", onSave);
        btnDiscard?.removeEventListener("click", onDiscard);
        btnStay?.removeEventListener("click", onStay);
        modal.removeEventListener("keydown", onKey);
        resolve(choice);
      };
      const onSave = () => finish("save");
      const onDiscard = () => finish("discard");
      const onStay = () => finish("stay");
      const onKey = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          finish("stay");
        }
      };
      btnSave?.addEventListener("click", onSave);
      btnDiscard?.addEventListener("click", onDiscard);
      btnStay?.addEventListener("click", onStay);
      modal.addEventListener("keydown", onKey);
    });
  }

  async function leaveExercise(destination) {
    // destination: { type: "home"|"exercise"|"history"|"plan"|"next", id? }
    if (shouldPromptOnLeave()) {
      const choice = await promptLeaveExercise();
      if (choice === "stay") return false;
      if (choice === "save") {
        // Stop audio, keep user on exercise to complete metrics
        stopPractice(true);
        VTPiano.stopAll();
        const metrics = $("#metrics-form") || $("#btn-complete");
        metrics?.scrollIntoView({ behavior: "smooth", block: "center" });
        $("#btn-complete")?.focus();
        toast(tt("leave.scrollSave"));
        // Stash intended destination after save
        state.pendingLeave = destination;
        return false;
      }
      // discard
      stopPractice(true);
      VTPiano.stopAll();
      stopTimer(false);
      stopHold();
      stopPitchViz();
      state.recorder.clear();
      resetSessionPractice();
      toast(tt("leave.discarded"));
    } else {
      stopPractice(true);
      VTPiano.stopAll();
      stopTimer(false);
      stopHold();
      stopPitchViz();
      state.recorder.clear();
    }

    if (destination?.type === "home") {
      setView("home");
      renderExerciseList();
    } else if (destination?.type === "history") {
      renderHistory();
    } else if (destination?.type === "plan") {
      renderPlan();
    } else if (destination?.type === "exercise" && destination.id) {
      forceOpenExercise(destination.id, destination.fromStructured);
    } else if (destination?.type === "next") {
      // handled by caller after return true
    }
    return true;
  }

  function forceOpenExercise(id, fromStructured) {
    const ex = findExercise(id);
    if (!ex) return;
    stopPractice(true);
    state.exercise = ex;
    state.structured = !!fromStructured;
    state.reviewChecks = { auditory: false, visual: false, transcription: false };
    state.pendingLeave = null;
    stopTimer(false);
    stopHold();
    stopPitchViz();
    state.recorder.clear();
    VTPiano.stopAll();
    resetSessionPractice();
    renderExercise();
    setView("exercise");
    // Instant jump to top so game stage is the first viewport (no smooth lag)
    window.scrollTo(0, 0);
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }

  function openExercise(id, fromStructured) {
    // Switching away from current exercise with meaningful practice
    if (
      state.view === "exercise" &&
      state.exercise &&
      state.exercise.id !== id &&
      shouldPromptOnLeave()
    ) {
      leaveExercise({ type: "exercise", id, fromStructured: !!fromStructured });
      return;
    }
    forceOpenExercise(id, fromStructured);
  }

  function renderExercise() {
    const ex = state.exercise;
    if (!ex) return;

    $("#ex-title").textContent = `${ex.number}. ${
      window.VTI18n ? VTI18n.exTitle(ex) : ex.title
    }`;
    const tier = ex.tier || "basic";
    $("#ex-track-badge").textContent = `${tt(
      ex.track === "vocal" ? "badge.vocal" : "badge.singing"
    )} · ${tt("badge." + tier)}`;
    $("#ex-track-badge").style.borderColor = ex.track === "vocal" ? "var(--vocal)" : "var(--singing)";
    $("#ex-original").textContent = ex.original;
    const researchEl = $("#ex-research");
    if (researchEl) {
      researchEl.textContent = ex.research || "";
      researchEl.hidden = !ex.research;
    }
    $("#ex-steps").innerHTML = ex.steps.map((s) => `<li>${s}</li>`).join("");
    $("#ex-tips").innerHTML = ex.tips.map((t) => `<li>${t}</li>`).join("");
    $("#ex-mistakes").innerHTML = ex.mistakes.map((m) => `<li>${m}</li>`).join("");

    // Timer (integrated into cockpit — always show display when timer exists)
    const timerSec = ex.timerDefaultSec || 0;
    state.timer.total = timerSec;
    state.timer.remaining = timerSec;
    $("#timer-display").textContent = timerSec ? formatTime(timerSec) : "—";
    $("#timer-display").style.opacity = timerSec ? "1" : "0.45";

    $("#playback-area").innerHTML = "";
    $("#level-fill").style.width = "0%";
    setPracticeUI(false);

    // Exercise-specific practice profile
    const profile = getProfile(ex);
    if (state.modeInstance) {
      try {
        state.modeInstance.unmount();
      } catch {
        /* ignore */
      }
      state.modeInstance = null;
    }
    const modeHud = $("#mode-hud");
    const modeFocus = $("#mode-focus");
    if (modeHud) modeHud.innerHTML = "";
    if (modeFocus) modeFocus.innerHTML = "";
    // Non-pitch: mount live mode into sticky stage (less scroll). Pitch: mode below highway.
    const mountTarget = !profile.showPitch && modeFocus ? modeFocus : modeHud;
    if (modeFocus) {
      if (!profile.showPitch) {
        modeFocus.hidden = false;
        modeFocus.setAttribute("aria-hidden", "false");
        modeFocus.classList.add("mode-focus-live");
      } else {
        modeFocus.hidden = true;
        modeFocus.setAttribute("aria-hidden", "true");
        modeFocus.classList.remove("mode-focus-live");
      }
    }
    if (window.VTPracticeModes && mountTarget) {
      state.modeInstance = VTPracticeModes.get(profile.mode);
      state.modeInstance.mount(mountTarget, profile);
    }
    if ($("#mode-cue")) {
      const es =
        (window.VTI18n && VTI18n.lang === "es") ||
        (document.documentElement.lang || "").startsWith("es");
      $("#mode-cue").textContent =
        (es && profile.cueEs) || profile.cue || tt("practice.hint");
      // Cue already lives in sticky stage for speech; hide duplicate below
      $("#mode-cue").hidden = !profile.showPitch;
    }
    // Hide empty mode-hud shell when mode lives in sticky focus
    if (modeHud) {
      modeHud.hidden = !profile.showPitch && mountTarget === modeFocus;
    }

    // Pitch visualizer only when profile asks
    const pitchBlock = $("#pitch-block");
    pitchBlock.hidden = !profile.showPitch;
    if (state.pitchViz) {
      // Prevent multi-lane leak across exercises
      if (typeof state.pitchViz.resetLanes === "function") state.pitchViz.resetLanes();
      else state.pitchViz.clearChordLanes?.();
    }
    if (profile.showPitch) {
      ensurePitchViz();
      if (state.pitchViz && typeof state.pitchViz.resetLanes === "function") {
        state.pitchViz.resetLanes();
      }
      const ref = profile.refPitch || ex.audio.refPitch;
      if (ref && window.VT_NOTE_FREQ) {
        state.pitchViz.setTargetNoteName(ref, VT_NOTE_FREQ);
        state.practice.setTargetFreq(VT_NOTE_FREQ[ref]);
      }
      // Prefer full progression span when exercise has chords; else fixed window on ref
      const wantsProg =
        !!(ex.progressions?.length ||
          ex.songs?.length ||
          ex.audio?.progressions ||
          profile.mode === "pitchChord" ||
          profile.mode === "pitchSong");
      if (wantsProg) {
        lockHighwayForProgression(state.selectedProg || "prog1");
      } else if (ref && VT_NOTE_FREQ?.[ref]) {
        state.pitchViz.lockWindowAroundFreq(VT_NOTE_FREQ[ref], 6);
      }
      updatePitchStatsLabel({
        targetName: ref || "C3",
        voiceName: "—",
        accuracyCents: 0,
        precisionCents: 0
      });
    }
    // Challenge only for pitchMatch-style (row lives below highway)
    const ch = $("#chk-pitch-challenge");
    const chRow = $("#pitch-challenge-row");
    if (ch) ch.checked = !!profile.pitchChallenge;
    if (chRow) chRow.hidden = !profile.pitchChallenge;

    // Pitch corner: always on for pitch (cents/quality); full score only for challenge
    const gameHud = $("#pitch-game-hud");
    const showPitchHud = !!profile.showPitch;
    if (gameHud) {
      gameHud.style.display = showPitchHud ? "" : "none";
      gameHud.style.opacity = "1";
      gameHud.classList.toggle("hud-challenge", !!profile.pitchChallenge);
      gameHud.classList.toggle("hud-cents-only", showPitchHud && !profile.pitchChallenge);
    }
    const tr = $(".hud-tr");
    if (tr) tr.style.display = showPitchHud ? "" : "none";

    // Hold strip
    const showHold = !!profile.showHold;
    $("#hold-block").hidden = !showHold;
    $("#hold-display").hidden = !showHold;
    $("#hold-display").textContent = tt("practice.hold", { s: "0.0" });
    renderHoldHistory();

    // Level meter
    const lvl = $("#level-meter-wrap");
    if (lvl) lvl.style.display = profile.showLevel === false ? "none" : "";

    // Piano: mini opts in HUD; full panel collapsed/hidden by default
    const pianoBlock = $("#piano-block");
    const pianoMini = $("#piano-mini-opts");
    const pianoToggleRow = $("#piano-toggle-row");
    const showPiano = !!(ex.audio.piano || profile.autoPiano);
    state.pianoOpen = false;
    if (pianoBlock) {
      pianoBlock.classList.remove("is-open");
      pianoBlock.hidden = true; // closed until toggle
      if (showPiano && (ex.audio.piano || ex.progressions || ex.songs)) {
        renderPianoControls(ex);
      }
      if (profile.autoArpeggio && $("#chk-arpeggio")) $("#chk-arpeggio").checked = true;
      // Auto piano ON by default whenever this exercise can play sound
      if ($("#chk-auto-piano")) {
        $("#chk-auto-piano").checked = exerciseWantsSound(ex, profile);
      }
      if ($("#chk-sustain")) $("#chk-sustain").checked = true; // sustain on by default
    }
    if (pianoMini) pianoMini.style.display = showPiano || exerciseWantsSound(ex, profile) ? "" : "none";
    // Piano more button lives in BR HUD (no extra row = less scroll)
    if (pianoToggleRow) pianoToggleRow.hidden = true;
    const tbtn = $("#btn-toggle-piano");
    if (tbtn) {
      tbtn.hidden = !showPiano;
      tbtn.setAttribute("aria-expanded", "false");
      tbtn.textContent = tt("piano.more");
      tbtn.title = tt("piano.showPanel");
    }

    // Practice hint stays hidden in stage (hint is in tour / guide)
    const hint = $("#practice-hint");
    if (hint) {
      hint.hidden = true;
      hint.textContent = tt("practice.hint");
    }

    // Review workflow
    const reviewBlock = $("#review-block");
    reviewBlock.hidden = !ex.audio.reviewWorkflow;
    if (ex.reviewSteps) {
      const esRev =
        (window.VTI18n && VTI18n.lang === "es") ||
        (document.documentElement.lang || "").startsWith("es");
      reviewBlock.innerHTML = `
        <h3>${esRev ? "Revisión en 3 pasos (espera 1 día completo tras grabar)" : "3-step review (wait 1 full day after recording)"}</h3>
        <p class="muted">${esRev ? "Marca cada paso al terminarlo. Sé amable: anota 3 fortalezas y 3 puntos de crecimiento primero." : "Mark each step as you complete it. Be kind — note 3 strengths and 3 growth points first."}</p>
        ${ex.reviewSteps
          .map(
            (step) => `
          <div class="review-step">
            <h4>${step.titleEs && esRev ? step.titleEs : step.title}</h4>
            <ul>${step.prompts.map((p) => `<li>${typeof p === "object" ? (esRev && p.es) || p.en || p : p}</li>`).join("")}</ul>
            <label style="display:flex;gap:0.4rem;align-items:center;margin-top:0.55rem;font-size:0.9rem;">
              <input type="checkbox" data-review="${step.id}" /> ${esRev ? "Paso listo" : "Step complete"}
            </label>
          </div>`
          )
          .join("")}
      `;
      $$("[data-review]", reviewBlock).forEach((cb) => {
        cb.addEventListener("change", () => {
          state.reviewChecks[cb.dataset.review] = cb.checked;
          if (cb.dataset.review === "transcription" || true) {
            const stepsDone = Object.values(state.reviewChecks).filter(Boolean).length;
            const input = $('#metrics-form [name="stepsDone"]');
            if (input) input.value = stepsDone;
          }
        });
      });
    }

    // Week plan deep link
    if (ex.isWeekPlan) {
      $("#week-plan-cta").hidden = false;
    } else {
      $("#week-plan-cta").hidden = true;
    }

    // Metrics form
    renderMetricsForm(ex);

    // Structured nav
    $("#structured-nav").hidden = !state.structured;
    const sp = $("#structured-progress");
    if (sp) {
      if (state.structured) {
        sp.hidden = false;
        sp.textContent = VTSession.progressLabel();
      } else {
        sp.hidden = true;
        sp.textContent = "";
      }
    }

    $("#score-result").hidden = true;

    // Doing > reading: collapse coach notes + metrics by default (less scroll)
    state.guideOpen = false;
    document.querySelector(".guide-card")?.classList.add("collapsed");
    const guideBtn = $("#btn-toggle-guide");
    if (guideBtn) {
      guideBtn.textContent = tt("ex.showGuide");
      guideBtn.setAttribute("aria-expanded", "false");
    }
    state.metricsOpen = false;
    document.querySelector("#metrics-card")?.classList.add("collapsed");
    const metricsBtn = $("#btn-toggle-metrics");
    if (metricsBtn) {
      metricsBtn.textContent = tt("metrics.show");
      metricsBtn.setAttribute("aria-expanded", "false");
    }

    // Record opt only when exercise supports record
    const recOpt = $("#opt-auto-record");
    if (recOpt) recOpt.style.display = ex.audio.record ? "" : "none";
  }

  function renderPianoControls(ex) {
    const progWrap = $("#prog-buttons");
    progWrap.innerHTML = "";
    const progs = VTPiano.getProgressions();

    let keys = [];
    if (ex.progressions) keys = ex.progressions.slice();
    else if (ex.songs)
      keys = [...new Set(ex.songs.map((s) => s.prog).concat(["prog1", "progJump1", "progJump2"]))];
    else if (ex.audio.refPitch) keys = [];
    else keys = ["prog1", "prog2", "prog3", "prog4", "prog5", "progJump1", "progJump2", "progJump3"];
    // Chord exercises always expose wide-jump progressions
    if (ex.audio.progressions || ex.practice?.mode === "pitchChord" || ex.practice?.mode === "pitchSong") {
      ["progJump1", "progJump2", "progJump3", "progJump4"].forEach((k) => {
        if (!keys.includes(k)) keys.push(k);
      });
    }

    keys.forEach((id) => {
      const p = progs[id];
      if (!p) return;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "prog-btn" + (state.selectedProg === id ? " active" : "");
      b.textContent = p.name;
      b.title = p.description;
      b.addEventListener("click", () => {
        state.selectedProg = id;
        $$(".prog-btn", progWrap).forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        $("#chord-desc").textContent = p.description;
        // Lock highway to this option's full max range (stable while chords cycle)
        if (state.exercise?.audio?.pitchViz || state.exercise?.practice?.showPitch) {
          lockHighwayForProgression(id);
        }
      });
      progWrap.appendChild(b);
    });

    if (keys[0]) {
      state.selectedProg = keys.includes(state.selectedProg) ? state.selectedProg : keys[0];
      $("#chord-desc").textContent = progs[state.selectedProg]?.description || "";
      // Initial lock for currently selected progression
      if (state.exercise?.audio?.pitchViz || state.exercise?.practice?.showPitch) {
        lockHighwayForProgression(state.selectedProg);
      }
    }

    const refBtn = $("#btn-ref-pitch");
    const inhaleBtn = $("#btn-inhale-ticks");
    if (refBtn) refBtn.hidden = !ex.audio.refPitch;
    if (inhaleBtn) inhaleBtn.hidden = !ex.audio.refPitch;
    if ($("#songs-row")) $("#songs-row").hidden = !ex.songs;
    if (ex.songs) {
      $("#songs-row").innerHTML = ex.songs
        .map(
          (s) => `
        <div class="card" style="padding:0.75rem;">
          <strong>${s.title}</strong>
          <p class="muted" style="margin:0.25rem 0 0.5rem;font-size:0.85rem;">${s.keyHint} · Use stanzas you know. Practice with piano, not full copyrighted tracks.</p>
          <button type="button" class="btn btn-sm btn-singing" data-song-prog="${s.prog}">Play song progression</button>
        </div>`
        )
        .join("");
      $$("[data-song-prog]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          state.selectedProg = btn.dataset.songProg;
          await playSelectedProgression(true);
        });
      });
    }
  }

  function pianoOptions() {
    const sustain = $("#chk-sustain")?.checked;
    const sustainSec = Number($("#sustain-sec")?.value || 4);
    return {
      arpeggio: $("#chk-arpeggio")?.checked,
      sustain: !!sustain,
      sustainSec: sustain ? sustainSec : 2.2,
      chordSec: sustain ? sustainSec : 2.2
    };
  }

  async function playSelectedProgression(loop) {
    try {
      await VTPiano.ensure();
      await VTPiano.resume?.();
      if (!state.selectedProg || !VT_PROGRESSIONS?.[state.selectedProg]) {
        state.selectedProg = "prog1";
      }
      const opts = pianoOptions();
      // Sustain default ON for practice loops (helps newbies home in)
      if (opts.sustain == null) opts.sustain = true;
      VTPiano.onChordChange = (ch) => {
        $("#chord-now").textContent = ch.name;
        if (state.exercise?.audio?.pitchViz || state.exercise?.practice?.showPitch) {
          if (state.pitchViz) state.pitchViz.setTargetFromChord(ch);
          // Sync practice engine target to primary singing tone
          const map = VT_NOTE_FREQ || {};
          let pick = ch.notes?.[1] || ch.notes?.[0];
          for (const n of ch.notes || []) {
            const f = map[n];
            if (f && f >= 120 && f <= 280) {
              pick = n;
              break;
            }
          }
          if (map[pick]) state.practice.setTargetFreq(map[pick]);
        }
      };
      // Full progression max range — locked for this option (chords must not re-scale)
      lockHighwayForProgression(state.selectedProg);
      const prog = await VTPiano.playProgression(state.selectedProg, {
        loop: !!loop,
        chordSec: opts.chordSec,
        arpeggio: opts.arpeggio,
        sustain: opts.sustain,
        sustainSec: opts.sustainSec
      });
      if (prog) {
        // Re-apply same lock (same option) — never shrink to current chord
        if (state.pitchViz) state.pitchViz.setProgressionRange(prog);
        $("#chord-desc").textContent =
          prog.description +
          (opts.sustain ? ` · sustain ${opts.sustainSec}s per chord` : "");
        toast(
          loop
            ? opts.sustain
              ? `Looping with ${opts.sustainSec}s sustain…`
              : "Looping progression…"
            : opts.sustain
              ? `Playing with ${opts.sustainSec}s sustain`
              : "Playing progression once"
        );
      }
    } catch (e) {
      toast("Could not start audio — interact with the page and try again.");
      console.error(e);
    }
  }

  function ensurePitchViz() {
    const canvas = $("#pitch-canvas");
    if (!canvas) return null;
    if (!state.pitchViz) {
      state.pitchViz = new VTPitchVisualizer(canvas);
      state.pitchViz.onStats = updatePitchStatsLabel;
      state.pitchViz._drawIdle();
    }
    if (!state.pitchGame) {
      state.pitchGame = new VTPitchGame();
      state.pitchGame.onUpdate = updateGameHud;
      state.pitchGame.onLock = onChallengeNoteLocked;
    }
    state.pitchViz.attachGame(state.pitchGame);
    return state.pitchViz;
  }
  // Modes may resolve nearest multi-lane tone via this hook
  window.VTGetPitchViz = () => state.pitchViz;

  function updateGameHud(snap) {
    if (!snap) return;
    const score = $("#hud-score");
    const combo = $("#hud-combo");
    const acc = $("#hud-acc");
    const q = $("#hud-quality");
    if (score) score.textContent = String(snap.score);
    if (combo) combo.textContent = `×${snap.combo}`;
    if (acc) acc.textContent = `${snap.accuracyPct}%`;
    if (q) {
      const es =
        (window.VTI18n && VTI18n.lang === "es") ||
        (document.documentElement.lang || "").startsWith("es");
      const labels = es
        ? { perfect: "PERFECTO", good: "BIEN", close: "CERCA", off: "BÚSCALA", "—": "—" }
        : { perfect: "PERFECT", good: "GOOD", close: "CLOSE", off: "FIND IT", "—": "—" };
      q.textContent = labels[snap.quality] || snap.quality;
      q.className = "hud-quality " + (snap.quality === "—" ? "" : snap.quality);
    }
  }

  async function onChallengeNoteLocked(prevNote, nextNote) {
    toast(nextNote ? `Locked ${prevNote} → next ${nextNote}` : `Locked ${prevNote} · round done!`);
    // Only retarget — highway range already locked to full challenge pool
    if (nextNote && VT_NOTE_FREQ[nextNote]) {
      state.practice.setTargetFreq(VT_NOTE_FREQ[nextNote]);
      if (state.pitchViz) state.pitchViz.setTargetNoteName(nextNote, VT_NOTE_FREQ);
      try {
        const sec = $("#chk-sustain")?.checked ? Number($("#sustain-sec")?.value || 4) : 2.5;
        await VTPiano.playRefPitch(nextNote, sec, true);
      } catch {
        /* piano optional */
      }
    }
    // fill accuracy metric from game
    const accInput = $('#metrics-form [name="accuracy"]');
    if (accInput && accInput.type === "range" && state.pitchGame) {
      const pct = state.pitchGame.accuracyPct();
      accInput.value = pct >= 80 ? 5 : pct >= 60 ? 4 : pct >= 40 ? 3 : 2;
      accInput.dispatchEvent(new Event("input"));
    }
  }

  function setPracticeUI(live) {
    state.practiceLive = live;
    const start = $("#btn-practice-start");
    const stop = $("#btn-practice-stop");
    if (start) start.hidden = live;
    if (stop) stop.hidden = !live;
    const pill = $("#practice-status");
    if (pill) {
      pill.textContent = live ? tt("practice.live") : tt("practice.ready");
      pill.classList.toggle("live", live);
    }
    // Practice clock for leave-prompt (≥10% of exercise)
    if (live) {
      state.sessionPractice.everStarted = true;
      if (state.sessionPractice.liveSince == null) {
        state.sessionPractice.liveSince = performance.now();
      }
    } else {
      flushPracticeClock();
    }
  }

  /** Exercises that use piano/ref pitch should play sound by default on Start */
  function exerciseWantsSound(ex, profile) {
    if (!ex) return false;
    return !!(
      profile?.autoPiano ||
      ex.audio?.piano ||
      profile?.refPitch ||
      ex.audio?.refPitch ||
      ex.progressions ||
      ex.audio?.progressions ||
      ex.songs
    );
  }

  function autoPianoChecked() {
    const el = $("#chk-auto-piano");
    // Default ON when checkbox missing or when it is checked
    return !el || el.checked !== false;
  }

  async function startExerciseSound(ex, profile) {
    if (!ex || !window.VTPiano) return false;
    if (!autoPianoChecked()) return false;
    if (!exerciseWantsSound(ex, profile)) return false;

    // Unlock Web Audio on the user gesture (must not wait on mic)
    await VTPiano.ensure();

    if (profile.autoArpeggio && $("#chk-arpeggio")) {
      $("#chk-arpeggio").checked = true;
    }

    const sustainOn = $("#chk-sustain")?.checked !== false; // sustain default ON
    if ($("#chk-sustain") && $("#chk-sustain").checked === false && profile.autoPiano) {
      // keep user choice if they turned it off; otherwise leave as-is
    }
    const sec = sustainOn ? Number($("#sustain-sec")?.value || 4) : 2.5;
    const inChallenge = !!(profile.pitchChallenge && state.pitchGame?.challengeMode);
    const hasProg =
      !!(ex.progressions?.length || ex.songs?.length || ex.audio?.progressions);

    // Ensure a progression is selected before looping
    if (hasProg && !state.selectedProg) {
      if (ex.progressions?.length) state.selectedProg = ex.progressions[0];
      else if (ex.songs?.length) state.selectedProg = ex.songs[0].prog || "prog1";
      else state.selectedProg = "prog1";
    }

    if (inChallenge) {
      const note = state.pitchGame?.currentChallengeNote?.() || profile.refPitch || ex.audio?.refPitch;
      if (note) await VTPiano.playRefPitch(note, sec, true);
      return true;
    }

    if (hasProg && ex.audio?.piano !== false) {
      await playSelectedProgression(true);
      return true;
    }

    const note = profile.refPitch || ex.audio?.refPitch;
    if (note) {
      const f = await VTPiano.playRefPitch(note, sec, true);
      if (f) {
        state.practice.setTargetFreq(f);
        if (state.pitchViz) state.pitchViz.setTargetFreq(f);
      }
      return true;
    }

    // Piano flagged without specific ref — still play default mid progression
    if (ex.audio?.piano) {
      if (!state.selectedProg) state.selectedProg = "prog1";
      await playSelectedProgression(true);
      return true;
    }
    return false;
  }

  async function startPractice() {
    const ex = state.exercise;
    if (!ex || state.practiceLive) return;
    const profile = getProfile(ex);
    try {
      // weekPlan: open dashboard instead of forcing mic
      if (profile.mode === "weekPlan") {
        state.modeInstance?.onStart?.();
        document.getElementById("btn-plan")?.click();
        toast("12-week plan opened");
        return;
      }

      const wantRecord = !!(
        profile.autoRecord ||
        (ex.audio.record && $("#chk-auto-record")?.checked)
      );
      // Sound on by default for any piano/ref exercise (checkbox defaults checked)
      const wantPiano = exerciseWantsSound(ex, profile) && autoPianoChecked();
      const showHold = !!profile.showHold;

      // Unlock audio on the Start click (user gesture) — required by browsers
      if (wantPiano) {
        try {
          await VTPiano.ensure();
        } catch (e) {
          console.warn("Piano unlock failed", e);
        }
      }

      // Fresh mode instance every Start (reviews: restart must reset phases/reps)
      if (state.modeInstance) {
        try {
          state.modeInstance.unmount();
        } catch {
          /* ignore */
        }
      }
      const modeHud = $("#mode-hud");
      const modeFocus = $("#mode-focus");
      const mountTarget =
        !profile.showPitch && modeFocus ? modeFocus : modeHud;
      if (mountTarget && window.VTPracticeModes) {
        state.modeInstance = VTPracticeModes.get(profile.mode);
        state.modeInstance.mount(mountTarget, profile);
        state.modeInstance.onStart();
      }

      state.practice.onFrame = (frame) => {
        if (profile.showLevel !== false) {
          // Scale meter with sensitivity so soft voices still fill the bar
          const sens = state.practice.getSensitivity?.() || 7;
          const boost = 3.2 + (sens - 5) * 0.35;
          $("#level-fill").style.width = `${Math.round(Math.min(1, frame.rms * boost) * 100)}%`;
        }
        if (showHold) {
          const holdEl = $("#hold-display");
          if (holdEl) {
            holdEl.textContent = tt("practice.hold", {
              s: frame.holdSec.toFixed(1)
            });
            holdEl.classList.toggle("is-grace", !!frame.holdGrace && !frame.holdSolid);
            // Solid green when energy/pitch solid; amber during grace bridge
            if (frame.holdSec >= 0.3 && (frame.holdSolid || frame.voiced || frame.holdGrace)) {
              holdEl.style.color = frame.holdGrace && !frame.holdSolid ? "#e0a84a" : "#8ee0b5";
            } else {
              holdEl.style.color = "";
            }
          }
        }
        if (profile.showPitch && state.pitchViz) {
          state.pitchViz.pushFrame(frame.voiceFreq, frame.targetFreq);
        }
        try {
          state.modeInstance?.onFrame?.(frame);
        } catch (err) {
          console.warn(err);
        }
      };
      state.practice.onHoldLogged = (sec) => {
        if (window.VTStorage) VTStorage.addHoldLog(sec);
        renderHoldHistory();
        const input = $('#metrics-form [name="maxHold"]');
        if (input) {
          const prev = Number(input.value) || 0;
          if (sec > prev) input.value = sec;
        }
        toast(tt("toast.hold", { s: sec }));
      };
      state.practice.onRecordingReady = (result) => {
        if (result) showPlayback(result);
      };

      if (profile.showPitch) {
        ensurePitchViz();
        state.pitchGame.reset();
        updateGameHud(state.pitchGame.snapshot());
        const wantChallenge =
          profile.pitchChallenge && $("#chk-pitch-challenge")?.checked !== false;
        let challengeNote = null;
        if (wantChallenge) challengeNote = state.pitchGame.startChallenge(8);
        state.pitchViz.startExternal();
        state.pitchRunning = true;
        const ref = profile.refPitch || ex.audio.refPitch;
        if (wantChallenge && state.pitchGame.challengeNotes?.length) {
          // Lock once to full challenge set so notes don't jump the Y-axis
          lockHighwayForNotes(state.pitchGame.challengeNotes);
        } else if (
          ex.progressions?.length ||
          ex.songs?.length ||
          ex.audio?.progressions ||
          profile.mode === "pitchChord" ||
          profile.mode === "pitchSong"
        ) {
          lockHighwayForProgression(state.selectedProg);
        } else if (ref && VT_NOTE_FREQ[ref]) {
          state.pitchViz.lockWindowAroundFreq(VT_NOTE_FREQ[ref], 6);
        }
        if (challengeNote && VT_NOTE_FREQ[challengeNote]) {
          state.practice.setTargetFreq(VT_NOTE_FREQ[challengeNote]);
          state.pitchViz.setTargetFreq(VT_NOTE_FREQ[challengeNote]);
        } else if (ref && VT_NOTE_FREQ[ref]) {
          state.practice.setTargetFreq(VT_NOTE_FREQ[ref]);
          state.pitchViz.setTargetFreq(VT_NOTE_FREQ[ref]);
        }
      }

      // Needs mic?
      const needsMic =
        profile.showLevel !== false ||
        profile.showPitch ||
        profile.showHold ||
        wantRecord ||
        ["pauseDetect", "volumeSteady", "volumeLadder", "speechEnergy", "breathS", "sovtFlow", "sirenRange", "onsetReps", "concisionGate", "authorityLand", "pitchContour"].includes(
          profile.mode
        );

      // Mic first: getUserMedia dialog often suspends AudioContext if piano
      // already started — then solfege/ref sound goes silent for the whole session.
      let micOk = !needsMic && !wantRecord;
      if (needsMic || wantRecord) {
        try {
          await state.practice.start({ record: wantRecord });
          micOk = true;
        } catch (e) {
          console.error(e);
          micOk = false;
        }
      }

      // Resume + start piano AFTER mic so context is running again
      let soundOk = false;
      if (wantPiano) {
        try {
          await VTPiano.resume?.();
          await VTPiano.ensure();
          soundOk = await startExerciseSound(ex, profile);
          // If still silent (suspended), one more resume + replay
          if (VTPiano.ctx && VTPiano.ctx.state === "suspended") {
            await VTPiano.resume?.();
            soundOk = await startExerciseSound(ex, profile);
          }
        } catch (e) {
          console.error("Piano start failed", e);
        }
      }

      if (!micOk && !soundOk) {
        setPracticeUI(false);
        toast(tt("toast.mic"));
        return;
      }

      setPracticeUI(true);

      if (ex.audio.timer && state.timer.total > 0 && micOk) startTimer();

      // Keep piano awake while practicing (tab blur / OS audio policies)
      if (wantPiano && soundOk) {
        state._pianoKeepAlive = setInterval(() => {
          if (!state.practiceLive) return;
          if (window.VTPiano?.ctx?.state === "suspended") {
            VTPiano.resume?.().then(() => {
              // restart loop if it died while suspended
              if (!VTPiano.loopActive && exerciseWantsSound(ex, profile)) {
                startExerciseSound(ex, profile).catch(() => {});
              }
            });
          }
        }, 2000);
      }

      if (!micOk && soundOk) {
        toast(tt("toast.pianoOnly"));
      } else if (wantPiano && !soundOk) {
        toast(tt("toast.pianoFail"));
      } else {
        toast(
          wantRecord
            ? tt("toast.liveRec", { mode: profile.mode })
            : tt("toast.live", { mode: profile.mode })
        );
      }
    } catch (e) {
      console.error(e);
      setPracticeUI(false);
      toast(tt("toast.mic"));
    }
  }

  function stopPractice(silent) {
    if (state._pianoKeepAlive) {
      clearInterval(state._pianoKeepAlive);
      state._pianoKeepAlive = null;
    }
    // Snapshot pitch game BEFORE mode onStop (architecture review critical fix)
    if (state.pitchGame) {
      window.VTAppPitchGameSnap = state.pitchGame.snapshot();
    }
    let modeResult = null;
    try {
      if (state.modeInstance) {
        modeResult = state.modeInstance.onStop({
          pitchGame: window.VTAppPitchGameSnap || null
        });
      }
    } catch (e) {
      console.warn(e);
    }
    if (state.practiceLive || state.practice.running) {
      state.practice.stop();
    }
    pauseTimer();
    VTPiano.stopAll();
    if (state.pitchViz && state.pitchRunning) {
      state.pitchViz.stop();
      state.pitchRunning = false;
      if (getProfile(state.exercise).showPitch) ensurePitchViz();
    }
    if (modeResult?.patches) applyMetricPatches(modeResult.patches);
    setPracticeUI(false);
    $("#level-fill").style.width = "0%";
    if (!silent) {
      toast(modeResult?.summary ? `⏹ ${modeResult.summary}` : tt("toast.stopped"));
    }
  }

  function showPlayback(result) {
    const area = $("#playback-area");
    if (!area || !result) return;
    area.innerHTML = `
      <audio class="audio-player" controls src="${result.url}"></audio>
      <div class="controls-row" style="margin-top:0.5rem;">
        <button type="button" class="btn btn-sm btn-success" id="btn-save-rec">Save to history</button>
        <button type="button" class="btn btn-sm btn-ghost" id="btn-discard-rec">Discard</button>
      </div>
    `;
    $("#btn-save-rec")?.addEventListener("click", async () => {
      try {
        await VTStorage.saveRecording({
          exerciseId: state.exercise.id,
          blob: result.blob,
          label: `${state.exercise.title} · ${new Date().toLocaleString()}`,
          meta: { durationMs: result.durationMs }
        });
        toast("Recording saved in this browser");
      } catch (e) {
        console.error(e);
        toast("Could not save recording");
      }
    });
    $("#btn-discard-rec")?.addEventListener("click", () => {
      area.innerHTML = "";
    });
  }

  function updatePitchStatsLabel(stats) {
    const el = $("#pitch-stats");
    if (!el || !stats) return;
    const es =
      (window.VTI18n && VTI18n.lang === "es") ||
      (document.documentElement.lang || "").startsWith("es");
    const acc = stats.accuracyCents != null ? Math.round(stats.accuracyCents) : 0;
    const prec = stats.precisionCents != null ? Math.round(stats.precisionCents) : 0;
    const accWord = es
      ? Math.abs(acc) <= 25
        ? "en el tono"
        : acc > 0
          ? "un poco agudo"
          : "un poco grave"
      : Math.abs(acc) <= 25
        ? "on target"
        : acc > 0
          ? "a bit sharp"
          : "a bit flat";
    const precWord = es
      ? prec <= 30
        ? "estable (preciso)"
        : prec <= 60
          ? "ajustando"
          : "variable"
      : prec <= 30
        ? "stable (precise)"
        : prec <= 60
          ? "settling"
          : "variable";
    const g = stats.game;
    el.innerHTML = `
      <span><strong>${es ? "Objetivo" : "Target"}</strong> ${stats.targetName || "—"}</span>
      <span><strong>${es ? "Tú" : "You"}</strong> ${stats.voiceName || "—"}</span>
      <span><strong>Cents</strong> ${acc > 0 ? "+" : ""}${acc}¢ · ${accWord}</span>
      <span><strong>${es ? "Precisión" : "Precision"}</strong> ±${prec}¢ · ${precWord}</span>
      ${g ? `<span><strong>${es ? "Juego" : "Game"}</strong> ${g.score} pts · ${g.accuracyPct}%</span>` : ""}
    `;
    // Live cents in TR corner for non-challenge pitch modes
    const profile = state.exercise ? getProfile(state.exercise) : null;
    if (profile?.showPitch && !profile?.pitchChallenge) {
      const q = $("#hud-quality");
      const accEl = $("#hud-acc");
      if (q) {
        q.textContent = `${acc > 0 ? "+" : ""}${acc}¢`;
        q.className =
          "hud-quality " +
          (Math.abs(acc) <= 15
            ? "perfect"
            : Math.abs(acc) <= 35
              ? "good"
              : Math.abs(acc) <= 60
                ? "close"
                : "off");
      }
      if (accEl) accEl.textContent = accWord;
      const score = $("#hud-score");
      const combo = $("#hud-combo");
      if (score) score.textContent = stats.targetName || "—";
      if (combo) combo.textContent = stats.voiceName || "—";
    }
    if (g) updateGameHud(g);
  }

  async function startPitchViz() {
    // Legacy path → unified practice
    return startPractice();
  }

  function stopPitchViz() {
    if (state.pitchViz && state.pitchRunning) {
      const snap = state.pitchViz.getSnapshotMetrics?.();
      if (snap) {
        const accInput = $('#metrics-form [name="accuracy"]');
        const precInput = $('#metrics-form [name="precision"]');
        if (accInput && accInput.type === "range") {
          const a = Math.abs(snap.accuracyCents || 0);
          accInput.value = a <= 20 ? 5 : a <= 40 ? 4 : a <= 70 ? 3 : a <= 100 ? 2 : 1;
          accInput.dispatchEvent(new Event("input"));
        }
        if (precInput && precInput.type === "range") {
          const p = snap.precisionCents || 50;
          precInput.value = p <= 25 ? 5 : p <= 45 ? 4 : p <= 70 ? 3 : p <= 100 ? 2 : 1;
          precInput.dispatchEvent(new Event("input"));
        }
      }
      state.pitchViz.stop();
    }
    state.pitchRunning = false;
  }

  function metricLabel(m) {
    const es =
      (window.VTI18n && VTI18n.lang === "es") ||
      (document.documentElement.lang || "").startsWith("es");
    if (es && m.labelEs) return m.labelEs;
    // Common id fallbacks (clear LatAm Spanish)
    const byId = {
      duration: "Minutos practicados",
      clarity: "Claridad (autoevaluación)",
      rateControl: "Control del ritmo",
      cycles: "Ciclos 1–10 completos",
      consistency: "Consistencia de volumen",
      countReached: "Conteo más alto",
      openness: "Apertura de resonancia",
      comfort: "Comodidad",
      clarityPen: "Claridad con bolígrafo",
      clarityAfter: "Claridad sin bolígrafo",
      personaReady: "Listo con la persona",
      storyStructure: "Estructura de la historia",
      confidence: "Confianza al entregar",
      questionQuality: "Calidad de la pregunta",
      presence: "Presencia al escuchar",
      fillerCount: "Palabras de relleno",
      stepsDone: "Revisión en 3 pasos (0–3)",
      metaphorCount: "Metáforas dichas",
      vividness: "Viveza",
      daysPracticed: "Días practicados esta semana",
      improvement: "Mejora percibida",
      pauseCount: "Pausas intencionales",
      fillerReduction: "Control de rellenos",
      authority: "Autoridad percibida",
      awareness: "Conciencia de rellenos",
      replacement: "Éxito al pausar en su lugar",
      variety: "Variedad de tono",
      naturalness: "¿Sigue natural?",
      engagement: "Sensación de interés",
      ladderReps: "Repeticiones de escalera",
      control: "Control dinámico",
      ease: "Facilidad / sin tensión",
      keySlowdowns: "Bajadas de ritmo clave",
      maxHold: "Mejor sostenido",
      reps: "Repeticiones",
      accuracy: "Exactitud",
      precision: "Precisión",
      progressions: "Progresiones",
      sirens: "Sirenas",
      smoothness: "Suavidad",
      questions: "Preguntas",
      pauseBefore: "Pausa antes de responder",
      landed: "Aterrizajes"
    };
    if (es && byId[m.id]) return byId[m.id];
    return m.label;
  }

  function renderMetricsForm(ex) {
    const form = $("#metrics-form");
    form.innerHTML = "";
    const es =
      (window.VTI18n && VTI18n.lang === "es") ||
      (document.documentElement.lang || "").startsWith("es");
    (ex.metrics || []).forEach((m) => {
      const field = document.createElement("div");
      field.className = "field";
      const lab = metricLabel(m);
      if (m.type === "scale") {
        field.innerHTML = `
          <label for="m-${m.id}">${lab} (1–${m.max || 5})</label>
          <input type="range" id="m-${m.id}" name="${m.id}" min="${m.min || 1}" max="${m.max || 5}" value="3" />
          <span class="muted scale-val" data-for="${m.id}">3</span>
        `;
      } else {
        const tgt =
          m.target != null
            ? es
              ? ` · meta ${m.target}`
              : ` · target ${m.target}`
            : "";
        field.innerHTML = `
          <label for="m-${m.id}">${lab}${m.unit ? ` (${m.unit})` : ""}${tgt}</label>
          <input type="number" id="m-${m.id}" name="${m.id}" min="0" step="1" placeholder="0" />
        `;
      }
      form.appendChild(field);
    });

    const notes = document.createElement("div");
    notes.className = "field";
    notes.innerHTML = `
      <label for="m-notes">${tt("metrics.notes")}</label>
      <textarea id="m-notes" name="notes" placeholder="${tt("metrics.notesPh")}"></textarea>
    `;
    form.appendChild(notes);

    $$('input[type="range"]', form).forEach((r) => {
      const span = $(`.scale-val[data-for="${r.name}"]`, form);
      r.addEventListener("input", () => {
        if (span) span.textContent = r.value;
      });
    });
  }

  function collectMetrics() {
    const values = {};
    $$("#metrics-form [name]").forEach((el) => {
      if (el.name === "notes") return;
      values[el.name] = el.value;
    });
    const notes = $("#m-notes")?.value || "";
    return { values, notes };
  }

  function completeExercise() {
    const ex = state.exercise;
    if (!ex) return;
    if (state.practiceLive) stopPractice(true);
    else if (state.pitchRunning) stopPitchViz();
    flushPracticeClock();
    // Prefer best auto-hold into metrics
    const best = state.practice.bestHold?.() || 0;
    if (best > 0) {
      const input = $('#metrics-form [name="maxHold"]');
      if (input && !(Number(input.value) > best)) input.value = best;
    }
    // Pitch game → self-scores
    if (state.pitchGame && state.exercise?.audio?.pitchViz) {
      const snap = state.pitchGame.snapshot();
      const accInput = $('#metrics-form [name="accuracy"]');
      const precInput = $('#metrics-form [name="precision"]');
      if (accInput && accInput.type === "range") {
        accInput.value =
          snap.accuracyPct >= 80 ? 5 : snap.accuracyPct >= 60 ? 4 : snap.accuracyPct >= 40 ? 3 : 2;
        accInput.dispatchEvent(new Event("input"));
      }
      if (precInput && precInput.type === "range") {
        precInput.value =
          snap.maxCombo >= 40 ? 5 : snap.maxCombo >= 20 ? 4 : snap.maxCombo >= 10 ? 3 : 2;
        precInput.dispatchEvent(new Event("input"));
      }
    }
    const { values, notes } = collectMetrics();
    if (ex.audio.reviewWorkflow) {
      values.stepsDone = Object.values(state.reviewChecks).filter(Boolean).length;
    }
    // Prefer actual practice clock over timer-only elapsed
    const practicedSec = Math.round(getPracticedSec());
    if (values.duration == null || values.duration === "" || Number(values.duration) === 0) {
      const durInput = $('#metrics-form [name="duration"]');
      if (durInput && practicedSec > 0) {
        // store minutes for duration metric when present
        const mins = Math.max(1, Math.round(practicedSec / 60));
        if (durInput.type === "number") durInput.value = mins;
        values.duration = durInput.value;
      }
    }
    const result = VTMetrics.compute(ex.metrics, values);
    const elapsed =
      practicedSec > 0
        ? practicedSec
        : state.timer.total > 0
          ? state.timer.total - state.timer.remaining
          : 0;

    VTStorage.saveExerciseResult(ex.id, {
      metrics: values,
      score: result.score,
      notes,
      durationSec: elapsed
    });

    state.sessionPractice.saved = true;
    state.pendingLeave = null;

    const box = $("#score-result");
    box.hidden = false;
    box.innerHTML = `
      <div class="score-big">${VTMetrics.formatScore(result)}</div>
      <p>${result.summary}</p>
      <p class="muted" style="font-size:0.85rem;">${result.how}</p>
      <ul class="breakdown">
        ${result.breakdown
          .map(
            (b) =>
              `<li><span>${b.label}<br><small class="muted">${b.detail}</small></span><strong>${b.points}/${b.max}</strong></li>`
          )
          .join("")}
      </ul>
      <div class="encourage">You practiced with intention. Save that feeling — consistency beats intensity.</div>
    `;

    toast("Session saved to progress");

    if (state.structured) {
      VTSession.markCurrentComplete();
      updateSessionBanner();
    }
  }

  /* —— Timer —— */
  function startTimer() {
    if (state.timer.running) return;
    if (state.timer.remaining <= 0) state.timer.remaining = state.timer.total;
    state.timer.running = true;
    // Wall-clock: remaining anchored to now so interval drift doesn't steal seconds
    state.timer.startedAt = performance.now();
    state.timer.endAt = performance.now() + state.timer.remaining * 1000;
    tickTimer();
    state.timer.handle = setInterval(tickTimer, 100);
  }

  function tickTimer() {
    if (!state.timer.running) return;
    const left = Math.max(0, (state.timer.endAt - performance.now()) / 1000);
    state.timer.remaining = left;
    $("#timer-display").textContent = formatTime(left);
    if (left <= 0) {
      stopTimer(true);
      toast("Timer complete — nice work");
      if (state.practiceLive) {
        // Soft cue only — don't force stop voice mid-rep
      }
    }
  }

  function pauseTimer() {
    if (state.timer.running && state.timer.endAt) {
      state.timer.remaining = Math.max(0, (state.timer.endAt - performance.now()) / 1000);
    }
    state.timer.running = false;
    if (state.timer.handle) clearInterval(state.timer.handle);
    state.timer.handle = null;
  }

  function stopTimer(keepDisplay) {
    pauseTimer();
    if (!keepDisplay && state.exercise) {
      state.timer.remaining = state.timer.total;
      $("#timer-display").textContent = formatTime(state.timer.remaining);
    }
  }

  function resetTimer() {
    stopTimer(false);
  }

  /* —— Hold logger —— */
  function startHold() {
    if (state.holdRunning) return;
    state.holdRunning = true;
    state.holdSeconds = 0;
    const t0 = performance.now();
    state.holdTimer = setInterval(() => {
      state.holdSeconds = (performance.now() - t0) / 1000;
      $("#hold-display").textContent = state.holdSeconds.toFixed(1) + "s";
    }, 50);
  }

  function stopHold() {
    if (!state.holdRunning) {
      if (state.holdTimer) clearInterval(state.holdTimer);
      state.holdTimer = null;
      return;
    }
    state.holdRunning = false;
    clearInterval(state.holdTimer);
    state.holdTimer = null;
    const sec = Math.round(state.holdSeconds * 10) / 10;
    if (sec > 0.3) {
      VTStorage.addHoldLog(sec);
      const input = $('#metrics-form [name="maxHold"]');
      if (input) {
        const prev = Number(input.value) || 0;
        if (sec > prev) input.value = sec;
      }
      renderHoldHistory();
      toast(`Logged hold: ${sec}s`);
    }
  }

  function renderHoldHistory() {
    const el = $("#hold-history");
    if (!el) return;
    const fromEngine = state.practice?.getHolds?.() || [];
    const stored = VTStorage.getHoldLogs().slice(0, 8);
    const logs = fromEngine.length
      ? fromEngine.slice(0, 8).map((h) => ({ seconds: h.seconds }))
      : stored;
    el.innerHTML = logs.length
      ? logs.map((l) => `<span class="pill">${l.seconds}s</span>`).join("")
      : `<span class="muted">Holds appear here automatically (≥2s)</span>`;
  }

  /* —— Recording —— */
  async function startRecording() {
    try {
      state.recorder.onLevel = (lvl) => {
        $("#level-fill").style.width = `${Math.round(lvl * 100)}%`;
      };
      await state.recorder.start();
      $("#btn-rec-start").disabled = true;
      $("#btn-rec-stop").disabled = false;
      toast("Recording…");
    } catch (e) {
      console.error(e);
      toast("Microphone permission needed for recording");
    }
  }

  async function stopRecording() {
    const result = await state.recorder.stop();
    $("#btn-rec-start").disabled = false;
    $("#btn-rec-stop").disabled = true;
    $("#level-fill").style.width = "0%";
    if (!result) return;

    const area = $("#playback-area");
    area.innerHTML = `
      <audio class="audio-player" controls src="${result.url}"></audio>
      <div class="controls-row" style="margin-top:0.5rem;">
        <button type="button" class="btn btn-sm btn-success" id="btn-save-rec">Save to history</button>
        <button type="button" class="btn btn-sm btn-ghost" id="btn-discard-rec">Discard</button>
      </div>
    `;
    $("#btn-save-rec").addEventListener("click", async () => {
      try {
        await VTStorage.saveRecording({
          exerciseId: state.exercise.id,
          blob: result.blob,
          label: `${state.exercise.title} · ${new Date().toLocaleString()}`,
          meta: { durationMs: result.durationMs }
        });
        toast("Recording saved in this browser");
      } catch (e) {
        console.error(e);
        toast("Could not save recording");
      }
    });
    $("#btn-discard-rec").addEventListener("click", () => {
      state.recorder.clear();
      area.innerHTML = "";
    });
  }

  /* —— History —— */
  async function renderHistory() {
    setView("history");
    const list = $("#history-list");
    list.innerHTML = `<p class="muted">Loading…</p>`;
    try {
      const recs = await VTStorage.listRecordings();
      const progress = VTStorage.getProgress();
      const reviews = VTStorage.getReviews();

      let html = "<h3>Recordings (this device)</h3>";
      if (!recs.length) {
        html += `<p class="empty-state">No recordings yet. Open an exercise and use Record.</p>`;
      } else {
        html += `<div class="history-list">`;
        for (const r of recs) {
          const ex = findExercise(r.exerciseId);
          html += `
            <div class="history-item" data-id="${r.id}">
              <div>
                <strong>${r.label}</strong>
                <div class="meta">${ex ? ex.title : r.exerciseId} · ${new Date(r.createdAt).toLocaleString()} · ${Math.round((r.size || 0) / 1024)} KB</div>
              </div>
              <div class="controls-row">
                <button type="button" class="btn btn-sm" data-play="${r.id}">Play</button>
                <button type="button" class="btn btn-sm btn-danger" data-del="${r.id}">Delete</button>
              </div>
            </div>`;
        }
        html += `</div><div id="history-player"></div>`;
      }

      html += `<h3 style="margin-top:1.5rem;">Exercise completions</h3><div class="history-list">`;
      const entries = Object.entries(progress);
      if (!entries.length) html += `<p class="muted">No completed sessions yet.</p>`;
      else {
        entries.forEach(([id, p]) => {
          const ex = findExercise(id);
          html += `<div class="history-item">
            <div><strong>${ex ? ex.title : id}</strong>
            <div class="meta">${p.completedCount}× · last score ${p.lastScore != null ? p.lastScore + "/10" : "—"} · ${p.lastAt ? new Date(p.lastAt).toLocaleString() : ""}</div></div>
          </div>`;
        });
      }
      html += `</div>`;

      if (reviews.length) {
        html += `<h3 style="margin-top:1.5rem;">Saved reviews</h3>`;
      }

      list.innerHTML = html;

      $$("[data-play]", list).forEach((btn) => {
        btn.addEventListener("click", async () => {
          const blob = await VTStorage.getRecordingBlob(btn.dataset.play);
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const player = $("#history-player");
          player.innerHTML = `<audio class="audio-player" controls autoplay src="${url}"></audio>`;
        });
      });
      $$("[data-del]", list).forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm("Delete this recording?")) return;
          await VTStorage.deleteRecording(btn.dataset.del);
          renderHistory();
          toast("Deleted");
        });
      });
    } catch (e) {
      console.error(e);
      list.innerHTML = `<p class="muted">Could not load history.</p>`;
    }
  }

  /* —— 12-week plan —— */
  function renderPlan() {
    setView("plan");
    const plan = VTStorage.getWeekPlan();
    $("#plan-week-num").textContent = `Week ${plan.weekNumber}`;
    $("#plan-status").textContent =
      plan.status === "idle"
        ? "Not started — pick an element to begin."
        : plan.status === "active"
          ? `Focus: ${plan.element}`
          : `Ready to review: ${plan.element}`;
    $("#plan-element-label").textContent = plan.element || "—";

    const chips = $("#element-chips");
    chips.innerHTML = "";
    VT_WEEK_ELEMENTS.forEach((el) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (plan.element === el ? " selected" : "");
      b.textContent = el;
      b.addEventListener("click", () => {
        const p = VTStorage.getWeekPlan();
        p.element = el;
        VTStorage.setWeekPlan(p);
        renderPlan();
      });
      chips.appendChild(b);
    });

    const checkins = $("#plan-checkins");
    const days = plan.checkIns || [];
    checkins.innerHTML = days.length
      ? days.map((d) => `<span class="pill">${d.date} ✓</span>`).join("")
      : `<span class="muted">No daily check-ins yet</span>`;

    const completed = $("#plan-completed-elements");
    completed.innerHTML = (plan.completedElements || []).length
      ? plan.completedElements.map((e) => `<span class="pill">${e}</span>`).join(" ")
      : `<span class="muted">None yet — finish a week review with “improved”</span>`;

    const reviews = $("#plan-reviews");
    reviews.innerHTML = (plan.reviews || [])
      .slice(0, 8)
      .map(
        (r) =>
          `<div class="history-item"><div><strong>Week ${r.week}: ${r.element}</strong><div class="meta">${r.verdict} · ${new Date(r.at).toLocaleDateString()} · ${r.notes || ""}</div></div></div>`
      )
      .join("") || `<p class="muted">No weekly reviews yet.</p>`;
  }

  function startWeekPlan() {
    const plan = VTStorage.getWeekPlan();
    if (!plan.element) {
      toast("Select a focus element first");
      return;
    }
    plan.status = "active";
    plan.startedAt = plan.startedAt || new Date().toISOString();
    VTStorage.setWeekPlan(plan);
    renderPlan();
    toast(`Week ${plan.weekNumber} started: ${plan.element}`);
  }

  function checkInDay() {
    const plan = VTStorage.getWeekPlan();
    if (plan.status === "idle") {
      toast("Start the week first");
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    plan.checkIns = plan.checkIns || [];
    if (plan.checkIns.some((c) => c.date === date)) {
      toast("Already checked in today");
      return;
    }
    plan.checkIns.push({ date });
    VTStorage.setWeekPlan(plan);
    renderPlan();
    toast("Daily check-in saved");
  }

  function submitWeekReview(improved) {
    const plan = VTStorage.getWeekPlan();
    if (!plan.element) {
      toast("Pick an element first");
      return;
    }
    const notes = $("#plan-review-notes")?.value || "";
    const review = {
      week: plan.weekNumber,
      element: plan.element,
      verdict: improved ? "improved" : "continue",
      notes,
      at: new Date().toISOString(),
      checkInCount: (plan.checkIns || []).length
    };
    plan.reviews = plan.reviews || [];
    plan.reviews.unshift(review);
    VTStorage.saveReview(review);

    if (improved) {
      plan.completedElements = plan.completedElements || [];
      if (!plan.completedElements.includes(plan.element)) {
        plan.completedElements.push(plan.element);
      }
      plan.weekNumber += 1;
      plan.element = null;
      plan.status = "idle";
      plan.checkIns = [];
      plan.startedAt = null;
      toast("Great — element improved. Pick a new focus for next week.");
    } else {
      plan.weekNumber += 1;
      plan.status = "active";
      plan.checkIns = [];
      plan.startedAt = new Date().toISOString();
      toast("Keep going on the same element — depth wins.");
    }
    VTStorage.setWeekPlan(plan);
    if ($("#plan-review-notes")) $("#plan-review-notes").value = "";
    renderPlan();
  }

  /* —— Structured session —— */
  function startStructured(path) {
    const p = path || $("#session-path")?.value || "basic";
    const session = VTSession.start(state.tab, p);
    updateSessionBanner();
    const id = VTSession.currentExerciseId();
    if (id) openExercise(id, true);
    toast(
      `${state.tab === "vocal" ? "Vocal" : "Singing"} · ${p} structured session (${session.order.length} exercises)`
    );
    return session;
  }

  function resumeStructured() {
    const s = VTSession.resume();
    updateSessionBanner();
    if (!s) return;
    if (s.status === "completed") {
      toast("Session already completed");
      return;
    }
    const id = VTSession.currentExerciseId();
    if (id) openExercise(id, true);
    else toast("No current exercise");
  }

  function pauseStructured() {
    VTSession.pause();
    stopPractice(true);
    pauseTimer();
    VTPiano.stopAll();
    updateSessionBanner();
    toast("Session paused — resume anytime");
  }

  function endStructured() {
    VTSession.clear();
    updateSessionBanner();
    setView("home");
    toast("Structured session cleared");
  }

  /* —— Bindings —— */
  function bind() {
    $$(".tab").forEach((t) => t.addEventListener("click", () => setTab(t.dataset.tab)));

    $$(".tier-chip").forEach((c) => {
      c.addEventListener("click", () => {
        state.tierFilter = c.dataset.tier;
        renderExerciseList();
      });
    });

    $("#btn-structured").addEventListener("click", () => startStructured());
    $("#btn-history").addEventListener("click", () => {
      if (state.view === "exercise") leaveExercise({ type: "history" });
      else renderHistory();
    });
    $("#btn-plan").addEventListener("click", () => {
      if (state.view === "exercise") leaveExercise({ type: "plan" });
      else renderPlan();
    });
    $("#btn-session-pause").addEventListener("click", pauseStructured);
    $("#btn-session-resume").addEventListener("click", resumeStructured);
    $("#btn-session-end").addEventListener("click", endStructured);

    $("#btn-back-home").addEventListener("click", () => {
      leaveExercise({ type: "home" });
    });

    $("#btn-practice-start")?.addEventListener("click", startPractice);
    $("#btn-practice-stop")?.addEventListener("click", () => stopPractice(false));
    $("#btn-continue")?.addEventListener("click", continuePractice);

    // Mic sensitivity (1–10) — persists + applies live while practicing
    const micRange = $("#mic-sensitivity");
    const micVal = $("#mic-sens-val");
    const applyMicSens = (raw) => {
      const n = state.practice.setSensitivity?.(raw) ?? Number(raw);
      if (micVal) micVal.textContent = String(n);
      if (micRange) {
        micRange.value = String(n);
        micRange.setAttribute("aria-valuenow", String(n));
        micRange.title = tt("mic.sensHint");
      }
      try {
        localStorage.setItem("vt_mic_sens", String(n));
      } catch {
        /* ignore */
      }
    };
    if (micRange) {
      let saved = 7;
      try {
        saved = Number(localStorage.getItem("vt_mic_sens")) || window.VT_DEFAULT_MIC_SENS || 7;
      } catch {
        saved = window.VT_DEFAULT_MIC_SENS || 7;
      }
      applyMicSens(saved);
      micRange.addEventListener("input", () => applyMicSens(micRange.value));
    }
    $("#btn-toggle-guide")?.addEventListener("click", () => {
      state.guideOpen = !state.guideOpen;
      const card = document.querySelector(".guide-card");
      card?.classList.toggle("collapsed", !state.guideOpen);
      const btn = $("#btn-toggle-guide");
      if (btn) {
        btn.textContent = state.guideOpen ? tt("ex.hideGuide") : tt("ex.showGuide");
        btn.setAttribute("aria-expanded", String(state.guideOpen));
      }
    });
    $("#btn-toggle-piano")?.addEventListener("click", () => {
      state.pianoOpen = !state.pianoOpen;
      const block = $("#piano-block");
      if (block) {
        if (state.pianoOpen) {
          block.hidden = false;
          // next frame so max-height transition can run
          requestAnimationFrame(() => block.classList.add("is-open"));
          // Bring progressions into view only when user asked
          block.scrollIntoView({ behavior: "smooth", block: "nearest" });
        } else {
          block.classList.remove("is-open");
          setTimeout(() => {
            if (!state.pianoOpen) block.hidden = true;
          }, 220);
        }
      }
      const btn = $("#btn-toggle-piano");
      if (btn) {
        btn.textContent = state.pianoOpen ? tt("piano.less") : tt("piano.more");
        btn.title = state.pianoOpen ? tt("piano.hidePanel") : tt("piano.showPanel");
        btn.setAttribute("aria-expanded", String(!!state.pianoOpen));
      }
    });
    $("#btn-toggle-metrics")?.addEventListener("click", () => {
      state.metricsOpen = !state.metricsOpen;
      const card = document.querySelector("#metrics-card");
      card?.classList.toggle("collapsed", !state.metricsOpen);
      const btn = $("#btn-toggle-metrics");
      if (btn) {
        btn.textContent = state.metricsOpen ? tt("metrics.hide") : tt("metrics.show");
        btn.setAttribute("aria-expanded", String(!!state.metricsOpen));
      }
      if (state.metricsOpen) {
        card?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });

    $("#btn-timer-start")?.addEventListener("click", startTimer);
    $("#btn-timer-pause")?.addEventListener("click", pauseTimer);
    $("#btn-timer-reset")?.addEventListener("click", resetTimer);

    $("#btn-rec-start")?.addEventListener("click", startRecording);
    $("#btn-rec-stop")?.addEventListener("click", stopRecording);

    $("#btn-play-prog")?.addEventListener("click", () => playSelectedProgression(false));
    $("#btn-loop-prog")?.addEventListener("click", () => playSelectedProgression(true));
    $("#btn-stop-piano")?.addEventListener("click", () => {
      VTPiano.stopAll();
      $("#chord-now").textContent = "—";
      toast("Piano stopped");
    });
    $("#btn-ref-pitch")?.addEventListener("click", async () => {
      const note = state.exercise?.audio?.refPitch || "A2";
      const sustain = $("#chk-sustain")?.checked;
      const sec = sustain ? Number($("#sustain-sec")?.value || 4) : 2.5;
      const f = await VTPiano.playRefPitch(note, sec, true);
      if (f) {
        state.practice.setTargetFreq(f);
        if (state.pitchViz) state.pitchViz.setTargetFreq(f);
      }
      toast(`Reference ${note} (${sec}s)`);
    });
    $("#btn-inhale-ticks")?.addEventListener("click", async () => {
      await VTPiano.playInhaleTicks(3);
      toast("3-second inhale ticks");
    });
    // Legacy stub buttons (if present in DOM) — only unified practice path
    $("#btn-pitch-start")?.addEventListener("click", startPractice);
    $("#btn-pitch-stop")?.addEventListener("click", () => stopPractice(false));
    $("#btn-hold-start")?.addEventListener("click", startPractice);
    $("#btn-hold-stop")?.addEventListener("click", () => stopPractice(false));

    $("#btn-complete").addEventListener("click", completeExercise);
    $("#btn-next-structured").addEventListener("click", async () => {
      if (!state.structured) return;
      const s = VTSession.get();
      if (!s) return;
      const next = () => {
        if (!s.completedIds.includes(state.exercise.id)) {
          VTSession.markCurrentComplete();
        }
        updateSessionBanner();
        const nid = VTSession.currentExerciseId();
        if (nid) forceOpenExercise(nid, true);
        else {
          toast("Structured session complete — excellent work!");
          resetSessionPractice();
          setView("home");
          renderExerciseList();
        }
      };
      if (shouldPromptOnLeave()) {
        const choice = await promptLeaveExercise();
        if (choice === "stay") return;
        if (choice === "save") {
          stopPractice(true);
          VTPiano.stopAll();
          $("#metrics-form")?.scrollIntoView({ behavior: "smooth", block: "center" });
          $("#btn-complete")?.focus();
          toast(tt("leave.scrollSave"));
          return;
        }
        // discard then advance
        stopPractice(true);
        VTPiano.stopAll();
        stopTimer(false);
        stopHold();
        stopPitchViz();
        state.recorder.clear();
        resetSessionPractice();
        next();
        return;
      }
      next();
    });

    $("#btn-open-plan").addEventListener("click", renderPlan);
    $("#btn-plan-start").addEventListener("click", startWeekPlan);
    $("#btn-plan-checkin").addEventListener("click", checkInDay);
    $("#btn-plan-improved").addEventListener("click", () => submitWeekReview(true));
    $("#btn-plan-continue").addEventListener("click", () => submitWeekReview(false));
    $("#btn-plan-back").addEventListener("click", () => {
      setView("home");
      renderExerciseList();
    });
    $("#btn-history-back").addEventListener("click", () => {
      setView("home");
      renderExerciseList();
    });

    // Warn on tab close if meaningful unsaved practice
    window.addEventListener("beforeunload", (e) => {
      if (shouldPromptOnLeave()) {
        e.preventDefault();
        e.returnValue = "";
      }
    });
  }

  // Test / debug helpers
  window.VTApp = {
    getState: () => state,
    shouldPromptOnLeave,
    getPracticedSec,
    getExerciseTargetSec,
    promptLeaveExercise,
    leaveExercise,
    resetSessionPractice,
    openExercise: forceOpenExercise,
    setView,
    setTab
  };

  function init() {
    if (window.VTI18n) {
      VTI18n.init();
      VTI18n.onChange = () => {
        renderExerciseList();
        if (state.view === "exercise" && state.exercise) renderExercise();
        updateSessionBanner();
        // Refresh tour button label
        const tb = $("#btn-tour");
        if (tb) tb.textContent = tt("nav.tour");
      };
    }
    const settings = VTStorage.getSettings();
    state.tab = settings.lastTab || "vocal";
    bind();
    setTab(state.tab);
    updateSessionBanner();

    $("#btn-lang")?.addEventListener("click", () => {
      const next = (window.VTI18n?.lang || "es") === "es" ? "en" : "es";
      VTI18n.setLang(next);
    });

    const s = VTSession.get();
    if (s && s.status === "paused") {
      toast(
        VTI18n?.lang === "es"
          ? "Tienes una sesión pausada — reanuda desde el aviso superior"
          : "You have a paused structured session — resume from the banner"
      );
    }

    // Interactive intro tour (first visit or header Tour button)
    if (window.VTTour) {
      VTTour.bindReplayButton();
      VTTour.maybeAutoStart();
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
