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
    /** Bumped on Stop/leave/open to abort in-flight Start after awaits */
    practiceGen: 0,
    practiceStarting: false,
    pendingLeave: null,
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
    /** Whole-octave material shift for singer range (−2…+2) */
    octaveShift: 0,
    rangeAuto: true,
    rangeAdapter: null,
    /** Per-open exercise practice clock (for leave save/discard prompt) */
    sessionPractice: {
      everStarted: false,
      liveSince: null,
      accumulatedMs: 0,
      saved: false
    },
    leavePromptOpen: false,
    /** 5-minute micro-session mode (retention research) */
    microSession: false
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

  function toast(msg, opts = {}) {
    const el = $("#toast");
    if (!el) return;
    const text = String(msg || "");
    // Debounce identical / hot-apply spam (rapid option flips)
    const now = performance.now();
    if (
      opts.debounceMs &&
      toast._lastText === text &&
      now - (toast._lastAt || 0) < opts.debounceMs
    ) {
      return;
    }
    toast._lastText = text;
    toast._lastAt = now;
    el.textContent = text;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), opts.durationMs || 2800);
  }

  /** Global error surfacing — fail visibly (vibe-code silent-failure defense). */
  function installGlobalErrorHandlers() {
    if (installGlobalErrorHandlers._done) return;
    installGlobalErrorHandlers._done = true;
    let lastKey = "";
    let lastAt = 0;
    const report = (kind, detail) => {
      console.error("[VT]", kind, detail);
      // Quiet during automated e2e unless explicitly debugging
      if (sessionStorage.getItem("vt_e2e") === "1" && sessionStorage.getItem("vt_debug") !== "1") {
        return;
      }
      const key = kind + ":" + String(detail).slice(0, 80);
      const now = Date.now();
      if (key === lastKey && now - lastAt < 5000) return;
      lastKey = key;
      lastAt = now;
      const es =
        (window.VTI18n && VTI18n.lang === "es") ||
        (document.documentElement.lang || "").startsWith("es");
      toast(
        es
          ? "Algo falló · mira la consola o pulsa Empezar de nuevo"
          : "Something failed · check console or press Start again",
        { debounceMs: 5000 }
      );
    };
    window.addEventListener("error", (ev) => {
      report("error", ev?.error || ev?.message || ev);
    });
    window.addEventListener("unhandledrejection", (ev) => {
      report("unhandledrejection", ev?.reason || ev);
    });
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

  function ensureRangeAdapter() {
    if (state.rangeAdapter) return state.rangeAdapter;
    if (typeof VTRangeAdapter !== "function") return null;
    let savedShift = 0;
    let savedAuto = true;
    try {
      const s = localStorage.getItem("vt_octave_shift");
      if (s != null && s !== "") savedShift = Math.max(-2, Math.min(2, parseInt(s, 10) || 0));
      const a = localStorage.getItem("vt_range_auto");
      if (a === "0") savedAuto = false;
      if (a === "1") savedAuto = true;
    } catch {
      /* private mode */
    }
    state.octaveShift = savedShift;
    state.rangeAuto = savedAuto;
    state.rangeAdapter = new VTRangeAdapter({
      auto: savedAuto,
      octaveShift: savedShift,
      onShift: (dec) => {
        applyOctaveShift(dec.shift, { source: "auto", decision: dec });
      }
    });
    return state.rangeAdapter;
  }

  function persistRangePrefs() {
    try {
      localStorage.setItem("vt_octave_shift", String(state.octaveShift));
      localStorage.setItem("vt_range_auto", state.rangeAuto ? "1" : "0");
    } catch {
      /* ignore */
    }
  }

  function formatOctLabel(shift) {
    const n = Math.round(Number(shift) || 0);
    if (n === 0) return "0";
    return n > 0 ? `+${n}` : String(n);
  }

  function updateOctaveUI() {
    const lab = $("#oct-label");
    if (lab) {
      lab.textContent = formatOctLabel(state.octaveShift);
      lab.title =
        state.octaveShift === 0
          ? tt("range.octZero")
          : tt("range.octValue", { n: formatOctLabel(state.octaveShift) });
    }
    const chk = $("#chk-range-auto");
    if (chk) chk.checked = !!state.rangeAuto;
    const down = $("#btn-oct-down");
    const up = $("#btn-oct-up");
    if (down) down.disabled = state.octaveShift <= -2;
    if (up) up.disabled = state.octaveShift >= 2;
    // Reflect shift on chord badge lightly
    const cn = $("#chord-now");
    if (cn && state.octaveShift !== 0) {
      cn.dataset.oct = formatOctLabel(state.octaveShift);
    } else if (cn) {
      delete cn.dataset.oct;
    }
  }

  /**
   * Apply whole-octave material shift. Re-locks highway + retargets + hot-applies piano.
   * @param {number} newShift
   * @param {{ source?: string, decision?: object, silent?: boolean }} opts
   */
  function applyOctaveShift(newShift, opts = {}) {
    const next = Math.max(-2, Math.min(2, Math.round(Number(newShift) || 0)));
    const prev = state.octaveShift;
    if (next === prev) {
      // still refresh adapter + UI (e.g. re-sync after external notify)
      ensureRangeAdapter()?.notifyShifted(next);
      updateOctaveUI();
      return false;
    }
    state.octaveShift = next;
    ensureRangeAdapter()?.notifyShifted(next);
    persistRangePrefs();
    updateOctaveUI();

    // Re-lock highway / targets for current exercise context
    const ex = state.exercise;
    const profile = ex ? getProfile(ex) : null;
    if (ex && (profile?.showPitch || ex.audio?.pitchViz)) {
      if (
        ex.progressions?.length ||
        ex.songs?.length ||
        ex.audio?.progressions ||
        profile?.mode === "pitchChord" ||
        profile?.mode === "pitchSong"
      ) {
        lockHighwayForProgression(state.selectedProg);
      } else if (state.pitchGame?.challengeMode && state.pitchGame.challengeNotes?.length) {
        lockHighwayForNotes(state.pitchGame.challengeNotes);
        const ch = state.pitchGame.currentChallengeNote?.();
        if (ch) {
          const nm = window.VTShiftNoteName ? VTShiftNoteName(ch, next) : ch;
          if (VT_NOTE_FREQ?.[nm]) {
            state.practice.setTargetFreq(VT_NOTE_FREQ[nm]);
            state.pitchViz?.setTargetFreq(VT_NOTE_FREQ[nm]);
          }
        }
      } else {
        const ref = profile?.refPitch || ex.audio?.refPitch;
        if (ref) {
          const nm = window.VTShiftNoteName ? VTShiftNoteName(ref, next) : ref;
          if (VT_NOTE_FREQ?.[nm] && state.pitchViz) {
            state.pitchViz.lockWindowAroundFreq(VT_NOTE_FREQ[nm], 6);
            state.practice.setTargetFreq(VT_NOTE_FREQ[nm]);
            state.pitchViz.setTargetFreq(VT_NOTE_FREQ[nm]);
          }
        }
      }
    }

    // Restart piano loop / progression so audio matches highway
    if (state.practiceLive && ex) {
      applyPianoOptionsHot("oct:" + formatOctLabel(next));
    }

    if (!opts.silent) {
      const side = opts.decision?.side;
      if (opts.source === "auto" && side === "high") {
        toast(tt("range.shiftedDown"), { durationMs: 3200 });
      } else if (opts.source === "auto" && side === "low") {
        toast(tt("range.shiftedUp"), { durationMs: 3200 });
      } else {
        toast(tt("range.shiftedManual", { n: formatOctLabel(next) }), {
          durationMs: 2200,
          debounceMs: 400
        });
      }
    }
    return true;
  }

  function nudgeOctave(delta) {
    applyOctaveShift(state.octaveShift + delta, { source: "manual" });
  }

  function setRangeAuto(on) {
    state.rangeAuto = !!on;
    ensureRangeAdapter()?.setAuto(state.rangeAuto);
    persistRangePrefs();
    updateOctaveUI();
    toast(
      state.rangeAuto ? tt("range.autoOn") : tt("range.autoOff"),
      { durationMs: 1800, debounceMs: 300 }
    );
  }

  /**
   * Lock pitch highway to the max range of a progression/option.
   * Range stays fixed while chords/notes inside that option change.
   * Applies current octaveShift so material sits in the singer's range.
   */
  function lockHighwayForProgression(progId) {
    if (!state.pitchViz) ensurePitchViz();
    const id = progId || state.selectedProg;
    const base = (window.VT_PROGRESSIONS || VTPiano?.getProgressions?.() || {})[id];
    if (!base || !state.pitchViz) return false;
    const prog =
      typeof VTTransposeProgression === "function"
        ? VTTransposeProgression(base, state.octaveShift)
        : base;
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
    const shifted =
      state.octaveShift && typeof VTShiftNoteNames === "function"
        ? VTShiftNoteNames(noteNames, state.octaveShift)
        : noteNames;
    state.pitchViz.lockRangeFromNoteNames(shifted, window.VT_NOTE_FREQ, opts);
    const first = shifted[0];
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
  window.VTApplyOctaveShift = applyOctaveShift;
  window.VTGetOctaveShift = () => state.octaveShift;

  /** Note name after current octave shift (for ref/challenge/target). */
  function effectiveNoteName(name) {
    if (!name) return name;
    if (!state.octaveShift || typeof VTShiftNoteName !== "function") return name;
    return VTShiftNoteName(name, state.octaveShift);
  }

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
    if (name === "home") {
      renderValuePulse();
      renderRetentionChrome();
      // Gentle trial/progress prompts only on home (never during live practice)
      setTimeout(() => showValueMoment(), 400);
    }
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
      if (window.VTI18n?.applyDom) {
        try {
          VTI18n.applyDom();
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

    if (destination?.type === "next") {
      // handled by caller after return true
    } else {
      navigateDestination(destination);
    }
    return true;
  }

  function navigateDestination(destination) {
    if (!destination) return;
    if (destination.type === "home") {
      setView("home");
      renderExerciseList();
    } else if (destination.type === "history") {
      renderHistory();
    } else if (destination.type === "plan") {
      renderPlan();
    } else if (destination.type === "exercise" && destination.id) {
      forceOpenExercise(destination.id, destination.fromStructured);
    }
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
    requestAnimationFrame(() => {
      window.scrollTo(0, 0);
      fitStageBelowContent();
    });
    // After layout paints: size cue strip + first-time UI tour for this layout family
    setTimeout(() => {
      fitStageBelowContent();
      const profile = getProfile(ex);
      if (window.VTTour?.maybeExerciseTour) VTTour.maybeExerciseTour(profile);
    }, 80);
  }

  function keysHaveProg(ex) {
    try {
      return progressionKeysFor(ex).length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Size .stage-below so mode cue / HUD / pitch-stats fit without internal Y-scroll.
   * Measures rendered text + window width (wrap changes height).
   */
  function fitStageBelowContent() {
    const below = document.querySelector(".stage-below");
    if (!below || !document.body.classList.contains("view-exercise")) return;
    const cue = $("#mode-cue");
    const hud = $("#mode-hud");
    const stats = $("#pitch-stats");
    const hold = $("#hold-block");
    const shell = $("#mode-shell");

    // Clear previous locks so we can remeasure
    [below, cue, hud, stats, shell].forEach((el) => {
      if (!el) return;
      el.style.maxHeight = "";
      el.style.height = "";
      el.style.minHeight = "";
      el.style.overflow = "";
    });

    if (cue && !cue.hidden) {
      cue.style.maxHeight = "none";
      cue.style.overflow = "visible";
      cue.style.whiteSpace = "normal";
      cue.style.height = "auto";
      // Force reflow then lock min-height to full wrapped text
      void cue.offsetHeight;
      const need = Math.ceil(cue.scrollHeight);
      if (need > 0) cue.style.minHeight = `${need}px`;
    }
    if (hud && !hud.hidden) {
      hud.style.maxHeight = "none";
      hud.style.overflow = "visible";
      hud.querySelectorAll(".mode-panel, .mode-big, .mode-meta").forEach((p) => {
        p.style.maxHeight = "none";
        p.style.overflow = "visible";
      });
      void hud.offsetHeight;
      const needH = Math.ceil(hud.scrollHeight);
      if (needH > 0) hud.style.minHeight = `${needH}px`;
    }
    if (stats && stats.childElementCount) {
      stats.style.maxHeight = "none";
      stats.style.overflow = "visible";
      void stats.offsetHeight;
      const needS = Math.ceil(stats.scrollHeight);
      if (needS > 0) stats.style.minHeight = `${needS}px`;
    }

    // Sum visible children heights + vertical margins for container min-height
    let total = 0;
    [...below.children].forEach((ch) => {
      if (ch.hidden) return;
      const st = getComputedStyle(ch);
      if (st.display === "none" || st.visibility === "hidden") return;
      const r = ch.getBoundingClientRect();
      if (r.height < 1) return;
      const mt = parseFloat(st.marginTop) || 0;
      const mb = parseFloat(st.marginBottom) || 0;
      total += r.height + mt + mb;
    });
    // Small padding so last line isn't flush against next card
    const pad = 12;
    if (total > 0) {
      below.style.minHeight = `${Math.ceil(total + pad)}px`;
      below.classList.add("is-fitted");
    } else {
      below.style.minHeight = "";
      below.classList.remove("is-fitted");
    }
  }

  // Recalc when wrap width changes
  let _fitBelowRaf = 0;
  window.addEventListener(
    "resize",
    () => {
      if (!document.body.classList.contains("view-exercise")) return;
      cancelAnimationFrame(_fitBelowRaf);
      _fitBelowRaf = requestAnimationFrame(() => fitStageBelowContent());
    },
    { passive: true }
  );

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
    // Micro-session: 5 min soft cap for comeback practice
    let timerSec = state.microSession ? 5 * 60 : ex.timerDefaultSec || 0;
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
      ensureRangeAdapter();
      updateOctaveUI();
      if (state.pitchViz && typeof state.pitchViz.resetLanes === "function") {
        state.pitchViz.resetLanes();
      }
      const ref = profile.refPitch || ex.audio.refPitch;
      const refS = effectiveNoteName(ref);
      if (refS && window.VT_NOTE_FREQ?.[refS]) {
        state.pitchViz.setTargetNoteName(refS, VT_NOTE_FREQ);
        state.practice.setTargetFreq(VT_NOTE_FREQ[refS]);
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
      } else if (refS && VT_NOTE_FREQ?.[refS]) {
        state.pitchViz.lockWindowAroundFreq(VT_NOTE_FREQ[refS], 6);
      }
      updatePitchStatsLabel({
        targetName: refS || ref || "C3",
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
      } else {
        const bar = $("#hud-prog-bar");
        if (bar) bar.hidden = true;
      }
      // Default play mode: 1-nota (easiest). Profile autoArpeggio can override.
      if (profile.autoArpeggio) {
        setPlayMode("arpeggio", { silent: true });
      } else if (showPiano && (ex.audio.piano || ex.progressions || ex.songs || keysHaveProg(ex))) {
        setPlayMode("oneNote", { silent: true });
      }
      // Auto piano follows profile.autoPiano (explicit pedagogy), not merely "can make sound".
      // e.g. v12 melodic speech has piano available but Auto off — variety, not note drills.
      if ($("#chk-auto-piano")) {
        $("#chk-auto-piano").checked = !!profile.autoPiano;
      }
      if ($("#chk-sustain")) $("#chk-sustain").checked = true; // sustain on by default
      syncSustainSecLabel();
      syncPlayModeSelect();
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

    // Fit cue / mode strip under highway to full text height (no inner scroll)
    requestAnimationFrame(() => fitStageBelowContent());

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

  /** Progression keys available for the open exercise */
  function progressionKeysFor(ex) {
    if (!ex) return [];
    let keys = [];
    if (ex.progressions) keys = ex.progressions.slice();
    else if (ex.songs)
      keys = [...new Set(ex.songs.map((s) => s.prog).concat(["prog1", "progJump1", "progJump2"]))];
    else if (ex.audio?.refPitch) keys = [];
    else keys = ["prog1", "prog2", "prog3", "prog4", "prog5", "progJump1", "progJump2", "progJump3"];
    if (ex.audio?.progressions || ex.practice?.mode === "pitchChord" || ex.practice?.mode === "pitchSong") {
      ["progJump1", "progJump2", "progJump3", "progJump4", "progPro1", "progPro2"].forEach((k) => {
        if (!keys.includes(k)) keys.push(k);
      });
    }
    const progs = VTPiano?.getProgressions?.() || VT_PROGRESSIONS || {};
    const canProProg = window.VTBilling?.can?.("pro_progressions");
    return keys.filter((id) => {
      const p = progs[id];
      if (!p) return false;
      if (p.proOnly && !canProProg) return false;
      return true;
    });
  }

  function currentPlayMode() {
    if ($("#chk-one-note")?.checked) return "oneNote";
    if ($("#chk-arpeggio")?.checked) return "arpeggio";
    return "chords";
  }

  function setPlayMode(mode, { silent } = {}) {
    const one = $("#chk-one-note");
    const arp = $("#chk-arpeggio");
    const sel = $("#sel-play-mode");
    if (mode === "oneNote") {
      if (one) one.checked = true;
      if (arp) arp.checked = false;
    } else if (mode === "arpeggio") {
      if (one) one.checked = false;
      if (arp) arp.checked = true;
    } else {
      if (one) one.checked = false;
      if (arp) arp.checked = false;
    }
    if (sel && sel.value !== mode) sel.value = mode;
    syncSustainSecLabel();
    if (!silent) applyPianoOptionsHot(mode);
  }

  function syncPlayModeSelect() {
    const sel = $("#sel-play-mode");
    if (!sel) return;
    const mode = currentPlayMode();
    if (sel.value !== mode) sel.value = mode;
  }

  function fillProgressionSelect(keys) {
    const sel = $("#sel-progression");
    const bar = $("#hud-prog-bar");
    const progs = VTPiano?.getProgressions?.() || VT_PROGRESSIONS || {};
    if (!sel || !bar) return;
    if (!keys.length) {
      bar.hidden = true;
      sel.innerHTML = "";
      return;
    }
    bar.hidden = false;
    const cur = keys.includes(state.selectedProg) ? state.selectedProg : keys[0];
    state.selectedProg = cur;
    sel.innerHTML = keys
      .map((id) => {
        const p = progs[id];
        if (!p) return "";
        const label = p.name || id;
        return `<option value="${id}" title="${(p.description || "").replace(/"/g, "&quot;")}">${label}</option>`;
      })
      .join("");
    sel.value = cur;
  }

  function selectProgression(id, { silent, fromUi } = {}) {
    const progs = VTPiano?.getProgressions?.() || VT_PROGRESSIONS || {};
    const p = progs[id];
    if (!p) return;
    state.selectedProg = id;
    const sel = $("#sel-progression");
    if (sel && sel.value !== id) sel.value = id;
    $$(".prog-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.progId === id);
    });
    if ($("#chord-desc")) {
      $("#chord-desc").textContent = p.description || p.name || "";
    }
    if (state.exercise?.audio?.pitchViz || state.exercise?.practice?.showPitch) {
      lockHighwayForProgression(id);
    }
    if (!silent) applyPianoOptionsHot("prog:" + (p.name || id));
  }

  /**
   * Hot-apply piano / highway options while practice is running.
   * Always updates range lock; restarts loop when Auto piano is on.
   * Returns a Promise (also stored on VTApp._hotApplyPromise) so tests can await settle.
   */
  function applyPianoOptionsHot(what) {
    const run = async () => {
      const ex = state.exercise;
      if (!ex) return false;
      const profile = getProfile(ex);
      syncSustainSecLabel();
      syncPlayModeSelect();

      // Highway range + ghost lanes follow the selected progression immediately
      if (profile?.showPitch || ex.audio?.pitchViz) {
        if (state.selectedProg) lockHighwayForProgression(state.selectedProg);
      }

      if (!state.practiceLive) return false;
      if (!autoPianoChecked()) return false;
      if (!exerciseWantsSound(ex, profile)) return false;

      try {
        await VTPiano.resume?.();
        await VTPiano.ensure?.();
        const ok = await startExerciseSound(ex, profile);
        if (ok && what) {
          const label =
            typeof what === "string" && what.startsWith("prog:")
              ? what.slice(5)
              : what === "oneNote"
                ? tt("piano.modeOneNote")
                : what === "arpeggio"
                  ? tt("piano.modeArpeggio")
                  : what === "chords"
                    ? tt("piano.modeChords")
                    : String(what);
          toast(tt("piano.hotApplied", { what: label }), { debounceMs: 450 });
        }
        return !!ok;
      } catch (e) {
        console.warn("Hot-apply piano options failed", e);
        return false;
      }
    };
    // Serialize rapid option flips so stopAll/play don't race
    const prev = state._hotApplyPromise || Promise.resolve();
    const next = prev.catch(() => {}).then(run);
    state._hotApplyPromise = next;
    return next;
  }

  function renderPianoControls(ex) {
    const progWrap = $("#prog-buttons");
    progWrap.innerHTML = "";
    const progs = VTPiano.getProgressions();
    const keys = progressionKeysFor(ex);

    keys.forEach((id) => {
      const p = progs[id];
      if (!p) return;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "prog-btn" + (state.selectedProg === id ? " active" : "");
      b.dataset.progId = id;
      b.textContent = p.name;
      b.title = p.description;
      b.addEventListener("click", () => selectProgression(id));
      progWrap.appendChild(b);
    });

    fillProgressionSelect(keys);
    syncPlayModeSelect();

    if (keys[0]) {
      state.selectedProg = keys.includes(state.selectedProg) ? state.selectedProg : keys[0];
      selectProgression(state.selectedProg, { silent: true });
    } else {
      const bar = $("#hud-prog-bar");
      if (bar) bar.hidden = true;
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
          selectProgression(btn.dataset.songProg);
        });
      });
    }
  }

  function pianoOptions() {
    const sustain = $("#chk-sustain")?.checked;
    const sustainSec = Number($("#sustain-sec")?.value || 4);
    const oneNote = !!$("#chk-one-note")?.checked;
    // 3s/4s/5s combobox: per chord when stacked; per individual note when "1 nota"
    const holdSec = sustain || oneNote ? sustainSec : 2.2;
    return {
      arpeggio: $("#chk-arpeggio")?.checked,
      oneNote,
      sustain: !!sustain,
      sustainSec: holdSec,
      chordSec: holdSec
    };
  }

  /** Keep sustain-sec label honest for one-note vs chord hold */
  function syncSustainSecLabel() {
    const sel = $("#sustain-sec");
    if (!sel) return;
    const one = !!$("#chk-one-note")?.checked;
    const es =
      (window.VTI18n && VTI18n.lang === "es") ||
      (document.documentElement.lang || "").startsWith("es");
    sel.title = one
      ? es
        ? "Duración de cada nota (1 nota a la vez)"
        : "Hold duration for each note (one at a time)"
      : es
        ? "Duración de cada acorde / sostenido"
        : "Hold duration per chord / sustain";
    sel.setAttribute(
      "aria-label",
      one
        ? es
          ? "Segundos por nota"
          : "Seconds per note"
        : es
          ? "Segundos de sostenido"
          : "Sustain seconds"
    );
  }

  function dualNoteLabel(noteName) {
    if (window.VTPitchUtils?.noteNameToDual) return VTPitchUtils.noteNameToDual(noteName);
    return noteName || "";
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
      // One-note mode: highway + target follow a single pitch at a time
      VTPiano.onChordChange = (ch, idx, prog, meta) => {
        const one = !!(meta?.oneNote || opts.oneNote || ch?.oneNote);
        const noteName = meta?.noteName || ch?.notes?.[0];
        if (one && noteName) {
          $("#chord-now").textContent = `${ch.name || ""} · ${dualNoteLabel(noteName)}`.replace(
            /^ · /,
            ""
          );
        } else {
          $("#chord-now").textContent = ch.name || "—";
        }
        if (state.exercise?.audio?.pitchViz || state.exercise?.practice?.showPitch) {
          if (state.pitchViz) {
            state.pitchViz.setTargetFromChord(ch, {
              oneNote: one,
              noteName: one ? noteName : undefined
            });
          }
          const map = VT_NOTE_FREQ || {};
          let pick = noteName || ch.notes?.[1] || ch.notes?.[0];
          if (!one) {
            for (const n of ch.notes || []) {
              const f = map[n];
              if (f && f >= 120 && f <= 280) {
                pick = n;
                break;
              }
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
        oneNote: opts.oneNote,
        sustain: opts.sustain,
        sustainSec: opts.sustainSec,
        octaveShift: state.octaveShift || 0
      });
      if (prog) {
        // Re-apply same lock (same option) — never shrink to current chord
        // prog is already transposed by playProgression
        if (state.pitchViz) state.pitchViz.setProgressionRange(prog);
        const modeHint = opts.oneNote
          ? isEsLang()
            ? " · 1 nota a la vez"
            : " · one note at a time"
          : opts.arpeggio
            ? isEsLang()
              ? " · arpegio"
              : " · arpeggio"
            : isEsLang()
              ? " · acordes"
              : " · chords";
        const holdHint = opts.oneNote
          ? isEsLang()
            ? ` · ${opts.sustainSec}s por nota`
            : ` · ${opts.sustainSec}s per note`
          : opts.sustain
            ? ` · sustain ${opts.sustainSec}s`
            : "";
        $("#chord-desc").textContent = prog.description + modeHint + holdHint;
        toast(
          loop
            ? opts.oneNote
              ? isEsLang()
                ? `Bucle: 1 nota a la vez · ${opts.sustainSec}s c/u…`
                : `Looping one note at a time · ${opts.sustainSec}s each…`
              : opts.sustain
                ? `Looping with ${opts.sustainSec}s sustain…`
                : "Looping progression…"
            : opts.oneNote
              ? isEsLang()
                ? `1 nota a la vez · ${opts.sustainSec}s c/u`
                : `One note at a time · ${opts.sustainSec}s each`
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
    const nextS = effectiveNoteName(nextNote);
    if (nextS && VT_NOTE_FREQ[nextS]) {
      state.practice.setTargetFreq(VT_NOTE_FREQ[nextS]);
      if (state.pitchViz) state.pitchViz.setTargetNoteName(nextS, VT_NOTE_FREQ);
      try {
        const sec = $("#chk-sustain")?.checked ? Number($("#sustain-sec")?.value || 4) : 2.5;
        await VTPiano.playRefPitch(nextS, sec, true);
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
    if (live) state.practiceStarting = false;
    const start = $("#btn-practice-start");
    const stop = $("#btn-practice-stop");
    if (start) {
      start.hidden = live || state.practiceStarting;
      start.disabled = !!(live || state.practiceStarting);
      start.setAttribute("aria-busy", state.practiceStarting ? "true" : "false");
    }
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

    // Unlock Web Audio (recreates if context was closed by a prior mic stop)
    await VTPiano.ensure();
    await VTPiano.resume?.();
    if (VTPiano.ctx?.state !== "running") {
      await VTPiano.unlock?.();
    }

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

    let started = false;

    if (inChallenge) {
      const note = effectiveNoteName(
        state.pitchGame?.currentChallengeNote?.() || profile.refPitch || ex.audio?.refPitch
      );
      if (note) {
        await VTPiano.playRefPitch(note, sec, true);
        started = true;
      }
    } else if (hasProg && ex.audio?.piano !== false) {
      await playSelectedProgression(true);
      started = !!(VTPiano.loopActive || (VTPiano.playing && VTPiano.playing.length));
    } else {
      const note = effectiveNoteName(profile.refPitch || ex.audio?.refPitch);
      if (note) {
        const f = await VTPiano.playRefPitch(note, sec, true);
        if (f) {
          state.practice.setTargetFreq(f);
          if (state.pitchViz) state.pitchViz.setTargetFreq(f);
        }
        started = true;
      } else if (ex.audio?.piano) {
        // Piano flagged without specific ref — still play default mid progression
        if (!state.selectedProg) state.selectedProg = "prog1";
        await playSelectedProgression(true);
        started = !!(VTPiano.loopActive || (VTPiano.playing && VTPiano.playing.length));
      }
    }

    // Safety net: profile said sound wanted but nothing scheduled (misconfigured exercise)
    if (!started && exerciseWantsSound(ex, profile)) {
      try {
        const fallback = effectiveNoteName(profile.refPitch || ex.audio?.refPitch || "C3");
        await VTPiano.playRefPitch(fallback, sec, true);
        started = !!(VTPiano.playing && VTPiano.playing.length);
        if (started) {
          console.warn("[VT] startExerciseSound fallback ref", fallback, ex.id);
        }
      } catch (e) {
        console.warn("Piano fallback failed", e);
      }
    }

    // If still silent/suspended, hard-recover: recreate graph + replay once
    if (started && VTPiano.ctx && VTPiano.ctx.state !== "running") {
      try {
        await VTPiano.unlock?.();
        await VTPiano.resume?.();
        if (hasProg) await playSelectedProgression(true);
        else if (profile.refPitch || ex.audio?.refPitch) {
          await VTPiano.playRefPitch(
            effectiveNoteName(profile.refPitch || ex.audio.refPitch),
            sec,
            true
          );
        }
      } catch (e) {
        console.warn("Piano recover failed", e);
      }
    }

    return !!(
      started &&
      VTPiano.ctx &&
      VTPiano.ctx.state !== "closed" &&
      (VTPiano.isLive?.() || (VTPiano.playing && VTPiano.playing.length > 0) || VTPiano.loopActive)
    );
  }

  async function startPractice() {
    const ex = state.exercise;
    if (!ex || state.practiceLive || state.practiceStarting) return;
    const profile = getProfile(ex);
    // Generation token: Stop / leave / exercise switch aborts in-flight Start
    const gen = ++state.practiceGen;
    const stillThisStart = () => gen === state.practiceGen && state.exercise === ex;

    try {
      // weekPlan: open dashboard instead of forcing mic
      if (profile.mode === "weekPlan") {
        state.modeInstance?.onStart?.();
        document.getElementById("btn-plan")?.click();
        toast("12-week plan opened");
        return;
      }

      state.practiceStarting = true;
      setPracticeUI(false); // hides/disables Start while bootstrapping
      try {
        window.VTAnalytics?.track?.("practice_start", {
          exerciseId: ex.id,
          mode: profile.mode,
          micro: !!state.microSession
        });
      } catch {
        /* ignore */
      }

      const wantRecord = !!(
        profile.autoRecord ||
        (ex.audio.record && $("#chk-auto-record")?.checked)
      );
      // Sound on by default for any piano/ref exercise (checkbox defaults checked)
      const wantPiano = exerciseWantsSound(ex, profile) && autoPianoChecked();
      const showHold = !!profile.showHold;

      // Unlock audio on the Start click (user gesture) — required by browsers.
      // Must happen before any await that yields (getUserMedia breaks the gesture).
      if (wantPiano) {
        try {
          await VTPiano.unlock?.();
          await VTPiano.ensure();
        } catch (e) {
          console.warn("Piano unlock failed", e);
        }
      }
      if (!stillThisStart()) return;

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
        // Adaptive range: detect plateau short of target while trying (not silence)
        if (profile.showPitch && state.rangeAuto) {
          const adapter = ensureRangeAdapter();
          if (adapter) {
            try {
              adapter.feed(frame);
            } catch (err) {
              console.warn("[range]", err);
            }
          }
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
        if (sec >= 8) {
          renderValuePulse();
          setTimeout(() => showValueMoment("hold_pr"), 500);
        }
      };
      state.practice.onRecordingReady = (result) => {
        if (result) showPlayback(result);
      };

      if (profile.showPitch) {
        ensurePitchViz();
        ensureRangeAdapter()?.resetSession();
        updateOctaveUI();
        state.pitchGame.reset();
        updateGameHud(state.pitchGame.snapshot());
        const wantChallenge =
          profile.pitchChallenge && $("#chk-pitch-challenge")?.checked !== false;
        let challengeNote = null;
        if (wantChallenge) challengeNote = state.pitchGame.startChallenge(8);
        state.pitchViz.startExternal();
        state.pitchRunning = true;
        const ref = profile.refPitch || ex.audio.refPitch;
        const shiftNote = (nm) =>
          nm && state.octaveShift && typeof VTShiftNoteName === "function"
            ? VTShiftNoteName(nm, state.octaveShift)
            : nm;
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
        } else if (ref) {
          const refS = shiftNote(ref);
          if (refS && VT_NOTE_FREQ[refS]) {
            state.pitchViz.lockWindowAroundFreq(VT_NOTE_FREQ[refS], 6);
          }
        }
        if (challengeNote) {
          const chS = shiftNote(challengeNote);
          if (chS && VT_NOTE_FREQ[chS]) {
            state.practice.setTargetFreq(VT_NOTE_FREQ[chS]);
            state.pitchViz.setTargetFreq(VT_NOTE_FREQ[chS]);
          }
        } else if (ref) {
          const refS = shiftNote(ref);
          if (refS && VT_NOTE_FREQ[refS]) {
            state.practice.setTargetFreq(VT_NOTE_FREQ[refS]);
            state.pitchViz.setTargetFreq(VT_NOTE_FREQ[refS]);
          }
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
      if (!stillThisStart()) {
        // Aborted mid-start — ensure we don't leave mic running without UI
        try {
          if (state.practice.running) state.practice.stop();
        } catch {
          /* ignore */
        }
        VTPiano.stopAll();
        state.practiceStarting = false;
        setPracticeUI(false);
        return;
      }

      // Resume + start piano AFTER mic so context is running again
      let soundOk = false;
      if (wantPiano) {
        try {
          await VTPiano.resume?.();
          await VTPiano.ensure();
          if (VTPiano.ctx?.state !== "running") await VTPiano.unlock?.();
          soundOk = await startExerciseSound(ex, profile);
          // If still silent (suspended/closed/no voices), recover + replay
          if (
            !soundOk ||
            (VTPiano.ctx && VTPiano.ctx.state !== "running") ||
            (VTPiano.playing && VTPiano.playing.length === 0 && !VTPiano.loopActive)
          ) {
            await VTPiano.resume?.();
            if (VTPiano.ctx?.state === "closed" || !VTPiano.ctx) {
              // Force new graph
              VTPiano.ctx = null;
            }
            await VTPiano.ensure();
            await VTPiano.unlock?.();
            soundOk = await startExerciseSound(ex, profile);
          }
        } catch (e) {
          console.error("Piano start failed", e);
          soundOk = false;
        }
      }
      if (!stillThisStart()) {
        try {
          if (state.practice.running) state.practice.stop();
        } catch {
          /* ignore */
        }
        VTPiano.stopAll();
        state.practiceStarting = false;
        setPracticeUI(false);
        return;
      }

      if (!micOk && !soundOk) {
        state.practiceStarting = false;
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
            VTPiano.resume?.()
              .then(() => {
                if (!VTPiano.loopActive && exerciseWantsSound(ex, profile)) {
                  startExerciseSound(ex, profile).catch((err) =>
                    console.warn("[VT] keepAlive sound", err)
                  );
                }
              })
              .catch((err) => console.warn("[VT] keepAlive resume", err));
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
      state.practiceStarting = false;
      setPracticeUI(false);
      toast(tt("toast.mic"));
    }
  }

  function stopPractice(silent) {
    // Invalidate any in-flight Start
    state.practiceGen = (state.practiceGen || 0) + 1;
    state.practiceStarting = false;
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
    // Short HUD words (long phrases overflow the TR corner)
    const accWord = es
      ? Math.abs(acc) <= 25
        ? "tono"
        : acc > 0
          ? "↑ agudo"
          : "↓ grave"
      : Math.abs(acc) <= 25
        ? "in"
        : acc > 0
          ? "↑ sharp"
          : "↓ flat";
    const accWordLong = es
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
      <span><strong>Cents</strong> ${acc > 0 ? "+" : ""}${acc}¢ · ${accWordLong}</span>
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
      // Prefer short letter form in the tight TR strip
      if (score) {
        const t = stats.targetName || "—";
        score.textContent = String(t).split(" ")[0] || t;
        score.title = t;
      }
      if (combo) {
        const v = stats.voiceName || "—";
        combo.textContent = String(v).split(" ")[0] || v;
        combo.title = v;
      }
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
    const notesLab = document.createElement("label");
    notesLab.htmlFor = "m-notes";
    notesLab.textContent = tt("metrics.notes");
    const notesTa = document.createElement("textarea");
    notesTa.id = "m-notes";
    notesTa.name = "notes";
    notesTa.placeholder = tt("metrics.notesPh");
    notes.appendChild(notesLab);
    notes.appendChild(notesTa);
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

    // Progress compare (before/after emotion — r/singing "same song later")
    const prevRow = VTStorage.getProgress()?.[ex.id];
    const prevScore = prevRow?.lastScore;

    VTStorage.saveExerciseResult(ex.id, {
      metrics: values,
      score: result.score,
      notes,
      durationSec: elapsed
    });
    try {
      window.VTAnalytics?.track?.("session_save", {
        exerciseId: ex.id,
        score: result.score,
        durationSec: elapsed
      });
    } catch {
      /* ignore */
    }
    renderValuePulse();
    // Success → soft upgrade moment (never blocks practice)
    setTimeout(() => showValueMoment(), 600);

    state.sessionPractice.saved = true;
    state.microSession = false;
    const pending = state.pendingLeave;
    state.pendingLeave = null;

    const box = $("#score-result");
    box.hidden = false;
    let compareHtml = "";
    if (prevScore != null && result.score != null && Number.isFinite(Number(prevScore))) {
      const a = Number(prevScore);
      const b = Number(result.score);
      const delta = b - a;
      const arrow = delta > 0.05 ? "↑" : delta < -0.05 ? "↓" : "→";
      compareHtml = `<p class="score-compare">${tt("retain.compare", {
        prev: a.toFixed(1),
        next: b.toFixed(1),
        arrow
      })}</p>`;
    }
    box.innerHTML = `
      <div class="score-big">${VTMetrics.formatScore(result)}</div>
      ${compareHtml}
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

    // Honor leave destination stashed when user chose Save on the leave modal
    if (pending && pending.type && pending.type !== "next") {
      setTimeout(() => navigateDestination(pending), 400);
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
        // Group by exercise for A/B compare (progress proof users love)
        const byEx = {};
        recs.forEach((r) => {
          if (!byEx[r.exerciseId]) byEx[r.exerciseId] = [];
          byEx[r.exerciseId].push(r);
        });
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
        html += `</div>`;
        // A/B compare blocks
        const pairs = Object.entries(byEx).filter(([, arr]) => arr.length >= 2);
        if (pairs.length) {
          html += `<h3 style="margin-top:1.25rem;">${tt("retain.audioCompare")}</h3><div class="history-list">`;
          pairs.forEach(([exId, arr]) => {
            const sorted = arr.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
            const newer = sorted[0];
            const older = sorted[1];
            const ex = findExercise(exId);
            html += `<div class="history-item">
              <div><strong>${ex ? ex.title : exId}</strong>
              <div class="meta">${tt("retain.audioCompareMeta")}</div></div>
              <div class="controls-row">
                <button type="button" class="btn btn-sm" data-ab-old="${older.id}" data-ab-new="${newer.id}">${tt("retain.audioCompareBtn")}</button>
              </div>
            </div>`;
          });
          html += `</div>`;
        }
        html += `<div id="history-player"></div>`;
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
      $$("[data-ab-old]", list).forEach((btn) => {
        btn.addEventListener("click", async () => {
          const oldId = btn.dataset.abOld;
          const newId = btn.dataset.abNew;
          const [bOld, bNew] = await Promise.all([
            VTStorage.getRecordingBlob(oldId),
            VTStorage.getRecordingBlob(newId)
          ]);
          if (!bOld || !bNew) {
            toast(tt("retain.audioCompareFail"));
            return;
          }
          const uOld = URL.createObjectURL(bOld);
          const uNew = URL.createObjectURL(bNew);
          const player = $("#history-player");
          player.innerHTML = `
            <div class="ab-player">
              <div><span class="muted">${tt("retain.audioOlder")}</span>
                <audio class="audio-player" controls src="${uOld}"></audio></div>
              <div><span class="muted">${tt("retain.audioNewer")}</span>
                <audio class="audio-player" controls src="${uNew}"></audio></div>
            </div>`;
          try {
            window.VTAnalytics?.track?.("audio_compare", {});
          } catch {
            /* ignore */
          }
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
    // Always kill live audio/mic — previously left piano/mic running on home
    stopPractice(true);
    VTPiano.stopAll();
    stopTimer(false);
    stopHold();
    stopPitchViz();
    state.recorder.clear();
    resetSessionPractice();
    VTSession.clear();
    updateSessionBanner();
    setView("home");
    renderExerciseList();
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
    $("#sel-progression")?.addEventListener("change", (e) => {
      selectProgression(e.target.value);
    });
    $("#sel-play-mode")?.addEventListener("change", (e) => {
      setPlayMode(e.target.value);
    });
    $("#chk-one-note")?.addEventListener("change", () => {
      // Mutual exclusivity with arpeggio when enabling 1-nota
      if ($("#chk-one-note")?.checked && $("#chk-arpeggio")) {
        $("#chk-arpeggio").checked = false;
      }
      syncPlayModeSelect();
      syncSustainSecLabel();
      applyPianoOptionsHot(currentPlayMode());
    });
    $("#chk-arpeggio")?.addEventListener("change", () => {
      if ($("#chk-arpeggio")?.checked && $("#chk-one-note")) {
        $("#chk-one-note").checked = false;
      }
      syncPlayModeSelect();
      applyPianoOptionsHot(currentPlayMode());
    });
    $("#chk-sustain")?.addEventListener("change", () => applyPianoOptionsHot("sustain"));
    $("#sustain-sec")?.addEventListener("change", () => applyPianoOptionsHot($("#sustain-sec")?.value + "s"));
    $("#chk-auto-piano")?.addEventListener("change", () => {
      if ($("#chk-auto-piano")?.checked) applyPianoOptionsHot("auto");
      else if (state.practiceLive) {
        VTPiano.stopAll();
        toast(tt("piano.stop"));
      }
    });
    syncSustainSecLabel();
    syncPlayModeSelect();
    $("#btn-stop-piano")?.addEventListener("click", () => {
      VTPiano.stopAll();
      $("#chord-now").textContent = "—";
      toast("Piano stopped");
    });
    // Vocal range octave controls (− / + / Auto)
    $("#btn-oct-down")?.addEventListener("click", () => nudgeOctave(-1));
    $("#btn-oct-up")?.addEventListener("click", () => nudgeOctave(1));
    $("#chk-range-auto")?.addEventListener("change", (e) => {
      setRangeAuto(!!e.target.checked);
    });

    $("#btn-ref-pitch")?.addEventListener("click", async () => {
      const note = effectiveNoteName(state.exercise?.audio?.refPitch || "A2");
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

  // ── Billing / pricing overlay (Stripe + Mercado Pago) ──
  let pricingRail = null;

  function isEsLang() {
    return (
      (window.VTI18n && VTI18n.lang === "es") ||
      (document.documentElement.lang || "").startsWith("es")
    );
  }

  function updateBillingChrome() {
    const B = window.VTBilling;
    if (!B) return;
    const ent = B.getEntitlement();
    const cfg = B.cfg?.() || {};
    const pill = $("#billing-pill");
    const btn = $("#btn-pricing");
    if (pill) {
      pill.classList.remove("is-trial", "is-free");
      // Only show pill when trial/pro — avoids header button overlap with Free label
      if (ent.status === "trial") {
        pill.hidden = false;
        pill.textContent = isEsLang() ? "Prueba" : "Trial";
        pill.classList.add("is-trial");
      } else if (ent.pro) {
        pill.hidden = false;
        pill.textContent = "Pro";
      } else {
        pill.hidden = true;
        pill.textContent = "";
        pill.classList.add("is-free");
      }
    }
    if (btn) btn.textContent = tt("nav.pro");
    const exp = $("#btn-export-progress");
    if (exp) exp.hidden = !B.can("export_progress");
    const demo = $("#btn-demo-pro");
    if (demo) {
      demo.hidden = !cfg.demoUnlockEnabled || ent.source === "demo" || (ent.pro && ent.source === "paid");
    }
    // Customer Portal: show for Pro/trial when a valid portal URL is configured
    const manage = $("#btn-manage-billing");
    if (manage) {
      const portalRaw = String(cfg.customerPortalUrl || "").trim();
      const portalOk = portalRaw && (B.isPortalUrl ? B.isPortalUrl(portalRaw) : true);
      manage.hidden = !(portalOk && (ent.pro || ent.status === "trial"));
    }
    // Operator-facing health strip inside pricing foot (misconfig only)
    const healthNote = $("#pricing-health-note");
    if (healthNote && B.getBillingHealth) {
      try {
        const h = B.getBillingHealth();
        if (h && !h.ok && Array.isArray(h.issues) && h.issues.length) {
          healthNote.hidden = false;
          const head = tt("pricing.healthPrefix");
          healthNote.textContent = head + " " + h.issues.slice(0, 2).join(" · ");
        } else {
          healthNote.hidden = true;
          healthNote.textContent = "";
        }
      } catch {
        healthNote.hidden = true;
      }
    }
  }

  function renderValuePulse() {
    const pulse = window.VTValuePulse?.compute?.() || {
      sessions: 0,
      minutes: 0,
      streak: 0,
      bestHoldSec: 0,
      exercisesTouched: 0,
      sessionsThisWeek: 0,
      weeklyTarget: 3,
      spark: []
    };
    const set = (id, v) => {
      const el = $(id);
      if (el) el.textContent = v;
    };
    set("#vp-sessions", String(pulse.sessions || 0));
    set("#vp-minutes", String(pulse.minutes || 0));
    set("#vp-streak", String(pulse.streak || 0));
    set(
      "#vp-hold",
      pulse.bestHoldSec >= 0.5 ? `${Number(pulse.bestHoldSec).toFixed(1)}s` : "—"
    );
    set("#vp-ex", String(pulse.exercisesTouched || 0));

    const B = window.VTBilling;
    const ent = B?.getEntitlement?.() || { pro: false, status: "free" };
    const isProUser = !!(ent.pro || ent.status === "trial");
    const tag = $("#value-pulse-tag");
    if (tag) {
      tag.hidden = false;
      if (ent.status === "trial") {
        const n = B.trialDaysLeft?.() ?? 0;
        tag.textContent = tt("value.tagTrial", { n: String(n) });
        tag.className = "value-pulse-tag is-trial";
      } else if (ent.pro) {
        tag.textContent = tt("value.tagPro");
        tag.className = "value-pulse-tag is-pro";
      } else {
        tag.textContent = tt("value.tagFree");
        tag.className = "value-pulse-tag is-free";
      }
    }

    const insights = $("#value-insights");
    if (insights && window.VTValuePulse?.narrative) {
      if (isProUser) {
        insights.hidden = false;
        insights.textContent =
          tt("value.insightsPro") + " · " + VTValuePulse.narrative(pulse, isEsLang());
      } else if (pulse.sessions > 0) {
        insights.hidden = false;
        insights.textContent = tt("value.insightsLocked");
      } else {
        insights.hidden = true;
        insights.textContent = "";
      }
    }

    renderProStudio(pulse, isProUser);
  }

  function renderProStudio(pulse, isProUser) {
    const es = isEsLang();
    // Profiles
    const sel = $("#sel-profile");
    if (sel && window.VTStorage?.getProfiles) {
      const { activeId, list } = VTStorage.getProfiles();
      const prev = sel.value;
      sel.innerHTML = list
        .map(
          (p) =>
            `<option value="${escapeHtml(p.id)}"${p.id === activeId ? " selected" : ""}>${escapeHtml(p.name || p.id)}</option>`
        )
        .join("");
      if (list.some((p) => p.id === prev)) sel.value = prev;
      else sel.value = activeId;
    }
    const goalSel = $("#sel-week-goal");
    if (goalSel) {
      const g = VTStorage?.getGoals?.() || { weeklySessionsTarget: 3 };
      const t = String(g.weeklySessionsTarget || 3);
      if (["3", "5", "7"].includes(t)) goalSel.value = t;
      goalSel.disabled = !isProUser && !window.VTBilling?.can?.("studio_goals");
      // Free can see default goal progress but not change
      if (!window.VTBilling?.can?.("studio_goals")) goalSel.disabled = true;
    }
    const gp = $("#pro-goal-progress");
    if (gp) {
      gp.textContent = `${pulse.sessionsThisWeek || 0}/${pulse.weeklyTarget || 3}`;
      gp.classList.toggle("is-met", !!pulse.goalMet);
    }

    // Insights panel
    const lock = $("#pro-insights-lock");
    const panel = $("#pro-insights-panel");
    if (lock) lock.hidden = isProUser;
    if (panel) panel.classList.toggle("is-locked", !isProUser);
    const focus = $("#pro-coach-focus");
    if (focus) {
      focus.textContent = isProUser
        ? VTValuePulse?.coachFocus?.(pulse, es) || ""
        : tt("pro.insightsTeaser");
    }
    const spark = $("#pro-spark");
    if (spark) {
      const arr = pulse.spark || [];
      const max = Math.max(1, ...arr);
      spark.innerHTML = arr
        .map((n) => {
          const h = Math.max(2, Math.round((n / max) * 28));
          return `<span class="pro-spark-bar" style="height:${h}px" title="${n}"></span>`;
        })
        .join("");
      spark.classList.toggle("is-dim", !isProUser);
    }
    const ht = $("#pro-hold-trend");
    if (ht) {
      if (isProUser && pulse.holdTrend?.length) {
        ht.textContent =
          tt("pro.holdTrend") +
          ": " +
          pulse.holdTrend.map((s) => s.toFixed(1) + "s").join(" → ");
      } else {
        ht.textContent = isProUser ? "" : tt("pro.unlockInsights");
      }
    }

    // Achievements (earn free; labels always)
    const grid = $("#pro-ach-grid");
    if (grid && VTValuePulse?.achievements) {
      const ach = VTValuePulse.achievements(pulse);
      grid.innerHTML = ach
        .map((a) => {
          const title = tt("pro.ach." + a.id);
          return `<span class="pro-ach-badge${a.unlocked ? " is-on" : ""}" title="${escapeHtml(title)}">${a.unlocked ? "★" : "☆"} <small>${escapeHtml(title)}</small></span>`;
        })
        .join("");
    }

    // Practice heatmap (26 weeks)
    const hm = $("#practice-heatmap");
    if (hm && VTValuePulse?.heatmap) {
      const data = VTValuePulse.heatmap(26);
      hm.innerHTML = data.cells
        .map((c) => {
          const level =
            c.count === 0 ? 0 : c.count === 1 ? 1 : c.count <= 3 ? 2 : c.count <= 6 ? 3 : 4;
          return `<span class="hm-cell l${level}" title="${escapeHtml(c.date)} · ${c.count}" data-date="${escapeHtml(c.date)}"></span>`;
        })
        .join("");
    }
  }

  function startMicroSession(exerciseId) {
    state.microSession = true;
    const id =
      exerciseId ||
      state.exercise?.id ||
      "s15-sh-air-ladder";
    openExercise(id);
    toast(tt("retain.microStarted"), { durationMs: 2200 });
  }

  function renderRetentionChrome() {
    if (!window.VTReminders) return;
    const isEs = isEsLang();
    const isPro = !!window.VTBilling?.can?.("extra_reminders") || !!window.VTBilling?.isPro?.();
    const cfg = VTReminders.getConfig();
    const chk = $("#chk-reminders");
    if (chk) chk.checked = !!cfg.enabled;
    const t1 = $("#rem-time-1");
    if (t1 && cfg.times[0]) t1.value = cfg.times[0];
    const wrap2 = $("#rem-time-2-wrap");
    const t2 = $("#rem-time-2");
    if (wrap2) wrap2.hidden = !isPro;
    if (t2 && cfg.times[1]) t2.value = cfg.times[1];
    const bn = $("#chk-browser-notify");
    if (bn) bn.checked = !!cfg.browserNotify;

    // Streak freeze
    const fl = $("#retain-freeze-label");
    if (fl) {
      const proFreeze = !!window.VTBilling?.can?.("extra_freezes") || !!window.VTBilling?.isPro?.();
      const left = VTReminders.freezesLeft(proFreeze);
      fl.textContent = tt("retain.freezesLeft", { n: String(left) });
      // Try apply freeze silently when returning after 1 missed day
      const fr = VTReminders.tryApplyFreeze(proFreeze);
      if (fr.applied) {
        toast(tt("retain.freezeUsed", { n: String(fr.left) }), { durationMs: 3200 });
        fl.textContent = tt("retain.freezesLeft", { n: String(fr.left) });
      }
    }

    // Welcome back after ≥2 days
    const days = VTReminders.daysSinceLastPractice();
    const wb = $("#welcome-back");
    if (wb) {
      const dismissed =
        sessionStorage.getItem("vt_wb_dismiss") === dayKeyLocal();
      const show = days != null && days >= 2 && !dismissed;
      wb.hidden = !show;
      if (show) {
        const body = $("#welcome-back-body");
        if (body) body.textContent = tt("retain.welcomeBodyDays", { n: String(days) });
      }
    }

    // Due reminder banner
    const ev = VTReminders.evaluate(isEs);
    const rd = $("#remind-due");
    if (rd) {
      if (ev.due && cfg.enabled) {
        rd.hidden = false;
        const tx = $("#remind-due-text");
        if (tx) tx.textContent = ev.message;
        VTReminders.markNotified();
      } else {
        rd.hidden = true;
      }
    }
  }

  function dayKeyLocal() {
    return new Date().toISOString().slice(0, 10);
  }

  function bindRetention() {
    const saveTimes = () => {
      const isPro = !!window.VTBilling?.can?.("extra_reminders");
      const times = [$("#rem-time-1")?.value || "18:00"];
      if (isPro && $("#rem-time-2")?.value) times.push($("#rem-time-2").value);
      VTReminders.setConfig({
        enabled: !!$("#chk-reminders")?.checked,
        times,
        browserNotify: !!$("#chk-browser-notify")?.checked
      });
    };
    $("#chk-reminders")?.addEventListener("change", async (e) => {
      if (e.target.checked) {
        // Kind copy only — never guilt
        toast(tt("retain.enabledToast"), { durationMs: 2200 });
        try {
          window.VTAnalytics?.track?.("reminder_enable", { enabled: true });
        } catch {
          /* ignore */
        }
      } else {
        try {
          window.VTAnalytics?.track?.("reminder_enable", { enabled: false });
        } catch {
          /* ignore */
        }
      }
      saveTimes();
      renderRetentionChrome();
    });
    $("#rem-time-1")?.addEventListener("change", saveTimes);
    $("#rem-time-2")?.addEventListener("change", () => {
      if (!window.VTBilling?.can?.("extra_reminders")) {
        toast(tt("retain.proTime"));
        openPricing();
        return;
      }
      saveTimes();
    });
    $("#chk-browser-notify")?.addEventListener("change", async (e) => {
      if (e.target.checked) {
        const perm = await VTReminders.requestBrowserPermission();
        if (perm !== "granted") {
          e.target.checked = false;
          toast(tt("retain.notifyDenied"));
        }
      }
      saveTimes();
    });
    $("#btn-ics-daily")?.addEventListener("click", () => {
      VTReminders.downloadIcs({ freq: "DAILY", time: $("#rem-time-1")?.value, isEs: isEsLang() });
      toast(tt("retain.icsDownloaded"));
    });
    $("#btn-ics-weekly")?.addEventListener("click", () => {
      VTReminders.downloadIcs({ freq: "WEEKLY", time: $("#rem-time-1")?.value, isEs: isEsLang() });
      toast(tt("retain.icsDownloaded"));
    });
    $("#btn-micro-5")?.addEventListener("click", () => startMicroSession("s15-sh-air-ladder"));
    $("#wb-micro")?.addEventListener("click", () => startMicroSession("s15-sh-air-ladder"));
    $("#wb-air")?.addEventListener("click", () => startMicroSession("s15-sh-air-ladder"));
    $("#wb-last")?.addEventListener("click", () => {
      const prog = VTStorage.getProgress() || {};
      let lastId = null;
      let lastAt = "";
      Object.keys(prog).forEach((id) => {
        if (prog[id].lastAt && prog[id].lastAt > lastAt) {
          lastAt = prog[id].lastAt;
          lastId = id;
        }
      });
      startMicroSession(lastId || "v2-volume");
    });
    $("#wb-dismiss")?.addEventListener("click", () => {
      sessionStorage.setItem("vt_wb_dismiss", dayKeyLocal());
      const wb = $("#welcome-back");
      if (wb) wb.hidden = true;
    });
    $("#rd-start")?.addEventListener("click", () => startMicroSession("s15-sh-air-ladder"));
    $("#rd-dismiss")?.addEventListener("click", () => {
      const rd = $("#remind-due");
      if (rd) rd.hidden = true;
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && state.view === "home") {
        renderRetentionChrome();
      }
    });
  }

  function bindProStudio() {
    $("#sel-profile")?.addEventListener("change", (e) => {
      const id = e.target.value;
      VTStorage?.setActiveProfile?.(id);
      renderValuePulse();
      toast(tt("pro.profileSwitched"), { durationMs: 1600, debounceMs: 200 });
    });
    $("#btn-profile-add")?.addEventListener("click", () => {
      const can = window.VTBilling?.can?.("multi_profile");
      const bag = VTStorage?.getProfiles?.();
      const count = bag?.list?.length || 1;
      const max = can ? VTStorage.MAX_PROFILES_PRO : VTStorage.MAX_PROFILES_FREE;
      if (!can && count >= 1) {
        toast(tt("pro.profileNeedPro"));
        openPricing();
        return;
      }
      if (count >= max) {
        toast(tt("pro.profileLimit", { n: String(max) }));
        return;
      }
      const name = window.prompt(tt("pro.profileNamePrompt"), tt("pro.profileDefaultName"));
      if (name == null) return;
      const res = VTStorage.createProfile(name, { maxSlots: max });
      if (!res.ok) {
        toast(tt("pro.profileLimit", { n: String(max) }));
        return;
      }
      renderValuePulse();
      toast(tt("pro.profileCreated"));
    });
    $("#btn-profile-rename")?.addEventListener("click", () => {
      const p = VTStorage?.getActiveProfile?.();
      if (!p) return;
      const name = window.prompt(tt("pro.profileNamePrompt"), p.name || "");
      if (name == null) return;
      VTStorage.renameProfile(p.id, name);
      renderValuePulse();
    });
    $("#sel-week-goal")?.addEventListener("change", (e) => {
      if (!window.VTBilling?.can?.("studio_goals")) {
        toast(tt("pro.goalsNeedPro"));
        openPricing();
        e.target.value = String(VTStorage?.getGoals?.()?.weeklySessionsTarget || 3);
        return;
      }
      const n = Number(e.target.value) || 3;
      const g = VTStorage.getGoals() || {};
      g.weeklySessionsTarget = n;
      VTStorage.setGoals(g);
      renderValuePulse();
      toast(tt("pro.goalSet", { n: String(n) }), { durationMs: 1500 });
    });
  }

  function showValueMoment(forceId) {
    const B = window.VTBilling;
    const VP = window.VTValuePulse;
    if (!VP?.suggestUpgradeMoment) return;
    // Don't interrupt e2e / tours
    try {
      if (sessionStorage.getItem("vt_e2e") === "1") return;
      if (document.body.classList.contains("tour-active")) return;
    } catch {
      /* ignore */
    }
    const ent = B?.getEntitlement?.() || { pro: false };
    const stats = VP.compute();
    let moment = forceId
      ? { id: forceId, priority: 99, sessions: stats.sessions, bestHoldSec: stats.bestHoldSec, trialDaysLeft: B?.trialDaysLeft?.() }
      : VP.suggestUpgradeMoment(stats, ent);
    if (!moment || VP.isDismissed(moment.id)) return;
    // If already full pro (paid/demo), skip soft upsells except trial ending
    if (ent.pro && ent.source !== "trial" && moment.id !== "trial_ending") return;

    const banner = $("#value-banner");
    const text = $("#value-banner-text");
    if (!banner || !text) return;
    const vars = {
      n: String(moment.sessions ?? moment.trialDaysLeft ?? 0),
      s: moment.bestHoldSec != null ? Number(moment.bestHoldSec).toFixed(1) : "0"
    };
    text.textContent = tt("value.moment." + moment.id, vars);
    banner.hidden = false;
    banner.dataset.momentId = moment.id;
  }

  function hideValueBanner() {
    const banner = $("#value-banner");
    if (!banner) return;
    const id = banner.dataset.momentId;
    if (id && window.VTValuePulse?.dismiss) VTValuePulse.dismiss(id);
    banner.hidden = true;
  }

  function renderPricingModal() {
    const B = window.VTBilling;
    if (!B) return;
    const es = isEsLang();
    const region = B.detectRegion();
    const market = B.marketFor(region);
    if (!pricingRail) pricingRail = B.preferredRail(region);
    const cfg = B.cfg() || {};
    const regionEl = $("#pricing-region-label");
    if (regionEl) {
      regionEl.textContent = `${tt("pricing.region")}: ${market.name} · ${market.currency}`;
    }
    const status = $("#pricing-status");
    if (status) {
      const ent = B.getEntitlement();
      if (ent.status === "trial") {
        const left = B.trialDaysLeft?.() ?? 0;
        status.textContent = `${tt("pricing.trial")} · ${tt("pricing.trialLeft", { n: String(left) })}`;
      } else if (ent.pro) {
        status.textContent = `${tt("pricing.proActive")} · ${ent.plan}${ent.source === "demo" ? " (demo)" : ""}`;
      } else {
        status.textContent = tt("pricing.free");
      }
    }
    // Personal proof line (Hormozi likelihood × investment)
    const personal = $("#pricing-personal");
    if (personal && window.VTValuePulse?.compute) {
      const p = VTValuePulse.compute();
      personal.hidden = false;
      if (!p.sessions && p.bestHoldSec < 0.5) {
        personal.textContent = tt("pricing.personalEmpty");
      } else {
        personal.textContent = tt("pricing.personalHave", {
          sessions: String(p.sessions || 0),
          minutes: String(p.minutes || 0),
          streak: String(p.streak || 0),
          hold: p.bestHoldSec >= 0.5 ? Number(p.bestHoldSec).toFixed(1) : "0"
        });
      }
    }
    const rails = $("#pricing-rails");
    if (rails) {
      const stripeLab = es ? (cfg.providers?.stripe?.labelEs || tt("pricing.railStripe")) : (cfg.providers?.stripe?.label || tt("pricing.railStripe"));
      const mpLab = es ? (cfg.providers?.mercadopago?.labelEs || tt("pricing.railMp")) : (cfg.providers?.mercadopago?.label || tt("pricing.railMp"));
      rails.innerHTML = `
        <button type="button" class="rail-btn${pricingRail === "stripe" ? " active" : ""}" data-rail="stripe">${stripeLab}</button>
        <button type="button" class="rail-btn${pricingRail === "mercadopago" ? " active" : ""}" data-rail="mercadopago">${mpLab}</button>
      `;
      $$(".rail-btn", rails).forEach((b) => {
        b.addEventListener("click", () => {
          pricingRail = b.dataset.rail;
          renderPricingModal();
        });
      });
    }
    const grid = $("#pricing-grid");
    if (grid) {
      const plans = cfg.plans || [];
      const ent = B.getEntitlement();
      grid.innerHTML = plans
        .map((p) => {
          const price = B.formatPrice(p, region);
          const interval =
            p.interval === "month" ? tt("pricing.month") : p.interval === "year" ? tt("pricing.year") : "";
          const name = es ? p.nameEs || p.name : p.name;
          const feats = (p.features || [])
            .map((f) => `<li>${tt("pricing.feat." + f)}</li>`)
            .join("");
          const badge =
            p.badge === "save20"
              ? `<span class="plan-badge">${tt("pricing.save20")}</span>`
              : p.popular
                ? `<span class="plan-badge">★</span>`
                : "";
          let ctaLabel = tt("pricing.subscribe");
          let disabled = false;
          if (p.id === "free") {
            ctaLabel = tt("pricing.current");
            disabled = true;
          } else if (ent.pro && (ent.plan === p.id || (ent.plan === "trial" && p.id !== "free"))) {
            if (ent.plan === p.id || ent.source === "demo") {
              ctaLabel = tt("pricing.current");
              disabled = ent.plan === p.id || ent.source === "paid";
            }
          }
          const hero = p.hero || p.id === "pro_yearly" ? " is-hero" : "";
          return `
            <article class="plan-card${p.popular ? " is-popular" : ""}${hero}" data-plan="${p.id}">
              ${badge}
              <h4>${name}</h4>
              <div class="plan-price">${price.text}<span>${interval}</span></div>
              <ul class="plan-features">${feats}</ul>
              <button type="button" class="btn ${p.id === "free" ? "btn-ghost" : "btn-primary"} btn-sm plan-cta" data-plan="${p.id}" ${disabled ? "disabled" : ""}>
                ${ctaLabel}
              </button>
            </article>`;
        })
        .join("");
      $$(".plan-cta", grid).forEach((btn) => {
        btn.addEventListener("click", () => {
          const planId = btn.dataset.plan;
          if (!planId || planId === "free") return;
          const res = B.startCheckout(planId, pricingRail);
          if (res.mode === "demo") {
            toast(tt("pricing.toast.demo"));
            updateBillingChrome();
            renderPricingModal();
          } else if (res.mode === "unconfigured") {
            toast(tt("pricing.toast.unconfigured"));
          }
          // redirect mode navigates away
        });
      });
    }
    updateBillingChrome();
  }

  function openPricing() {
    const modal = $("#pricing-modal");
    if (!modal) return;
    renderPricingModal();
    modal.hidden = false;
    document.body.classList.add("pricing-open");
    $("#pricing-close")?.focus();
  }

  function closePricing() {
    const modal = $("#pricing-modal");
    if (modal) modal.hidden = true;
    document.body.classList.remove("pricing-open");
  }

  function refreshAccountUI() {
    const A = window.VTAuth;
    const session = A?.current?.() || null;
    const out = $("#account-logged-out");
    const inn = $("#account-logged-in");
    const admin = $("#admin-panel");
    const who = $("#account-who");
    const btnAcc = $("#btn-account");
    if (btnAcc) {
      if (session) {
        btnAcc.textContent = session.username.split(".")[0] || tt("nav.account");
      } else {
        btnAcc.textContent = tt("nav.account");
      }
    }
    if (!out || !inn) return;
    if (session) {
      out.hidden = true;
      inn.hidden = false;
      if (who) {
        who.textContent = tt("auth.welcome", {
          name: session.displayName || session.username,
          role: session.role
        });
      }
      if (admin) {
        admin.hidden = session.role !== "admin";
        if (session.role === "admin") {
          const list = $("#admin-user-list");
          if (list && A.listPublicUsers) {
            list.innerHTML = A.listPublicUsers()
              .map(
                (u) =>
                  `<li><code>${A.escapeHtml(u.username)}</code> · ${A.escapeHtml(u.role)} · ${A.escapeHtml(u.displayName || "")}</li>`
              )
              .join("");
          }
        }
      }
    } else {
      out.hidden = false;
      inn.hidden = true;
      if (admin) admin.hidden = true;
    }
  }

  function openAccount() {
    const modal = $("#account-modal");
    if (!modal) return;
    refreshAccountUI();
    const err = $("#login-error");
    if (err) {
      err.hidden = true;
      err.textContent = "";
    }
    modal.hidden = false;
    document.body.classList.add("account-open");
    if (!window.VTAuth?.isLoggedIn?.()) $("#login-username")?.focus();
  }

  function closeAccount() {
    const modal = $("#account-modal");
    if (modal) modal.hidden = true;
    document.body.classList.remove("account-open");
  }

  function bindAuth() {
    $("#btn-account")?.addEventListener("click", openAccount);
    $("#account-close")?.addEventListener("click", closeAccount);
    $("#account-modal")?.addEventListener("click", (e) => {
      if (e.target === $("#account-modal")) closeAccount();
    });
    $("#btn-logout")?.addEventListener("click", () => {
      window.VTAuth?.logout?.();
      toast(tt("auth.toast.out"));
      refreshAccountUI();
      updateBillingChrome();
    });
    $("#btn-account-pricing")?.addEventListener("click", () => {
      closeAccount();
      openPricing();
    });
    $("#login-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const err = $("#login-error");
      const user = $("#login-username")?.value || "";
      const pass = $("#login-password")?.value || "";
      if (!window.VTAuth) return;
      const res = await VTAuth.login(user, pass);
      if (!res.ok) {
        if (err) {
          err.hidden = false;
          const map = {
            empty: "auth.err.empty",
            credentials: "auth.err.credentials",
            locked: "auth.err.locked",
            invalid: "auth.err.invalid"
          };
          err.textContent = tt(map[res.error] || "auth.err.credentials");
        }
        return;
      }
      if ($("#login-password")) $("#login-password").value = "";
      toast(tt("auth.toast.in"));
      refreshAccountUI();
      updateBillingChrome();
    });
    $("#admin-force-pro")?.addEventListener("click", () => {
      if (!window.VTAuth?.isAdmin?.()) return;
      window.VTBilling?.activateDemo?.("pro_monthly");
      toast(tt("pricing.toast.demo"));
      updateBillingChrome();
    });
    $("#admin-clear-billing")?.addEventListener("click", () => {
      if (!window.VTAuth?.isAdmin?.()) return;
      window.VTBilling?.clearEntitlement?.();
      updateBillingChrome();
    });
    $("#admin-clear-progress")?.addEventListener("click", () => {
      if (!window.VTAuth?.isAdmin?.()) return;
      try {
        localStorage.removeItem("vt_progress_v1");
        localStorage.removeItem("vt_session_v1");
        localStorage.removeItem("vt_hold_logs_v1");
      } catch {
        /* ignore */
      }
      toast(tt("auth.toast.cleared"));
      renderExerciseList();
    });
    window.VTAuth?.onChange?.(() => {
      refreshAccountUI();
      updateBillingChrome();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && $("#account-modal") && !$("#account-modal").hidden) {
        closeAccount();
      }
    });
    refreshAccountUI();
  }

  function bindBilling() {
    $("#btn-pricing")?.addEventListener("click", openPricing);
    $("#btn-value-pro")?.addEventListener("click", openPricing);
    bindProStudio();
    bindRetention();
    $("#value-banner-cta")?.addEventListener("click", () => {
      hideValueBanner();
      openPricing();
    });
    $("#value-banner-dismiss")?.addEventListener("click", hideValueBanner);
    $("#pricing-close")?.addEventListener("click", closePricing);
    $("#pricing-modal")?.addEventListener("click", (e) => {
      if (e.target === $("#pricing-modal")) closePricing();
    });
    $("#btn-demo-pro")?.addEventListener("click", () => {
      if (!window.VTBilling) return;
      VTBilling.activateDemo("pro_monthly");
      toast(tt("pricing.toast.demo"));
      updateBillingChrome();
      renderPricingModal();
    });
    $("#btn-manage-billing")?.addEventListener("click", () => {
      if (!window.VTBilling?.openCustomerPortal) return;
      const res = VTBilling.openCustomerPortal();
      if (!res?.ok) {
        toast(res?.message || tt("pricing.toast.portalUnconfigured"), { durationMs: 4200 });
        return;
      }
      toast(tt("pricing.toast.portalOpened"));
    });
    $("#btn-export-progress")?.addEventListener("click", () => {
      if (!window.VTBilling?.can("export_progress")) {
        toast(tt("pricing.toast.exportNeedPro"));
        openPricing();
        return;
      }
      const json = VTBilling.exportProgressJson();
      if (!json) return;
      const day = new Date().toISOString().slice(0, 10);
      // JSON pack
      const blob = new Blob([json], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `vocal-studio-progress-${day}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      // Human coach summary (.txt) — “coach pack” that is actually delivered
      try {
        const pulse = window.VTValuePulse?.compute?.();
        const summary =
          (window.VTValuePulse?.narrative?.(pulse, isEsLang()) || "") +
          "\n\n---\n" +
          (isEsLang()
            ? "Exportado desde Estudio Vocal Pro · comparte este resumen con tu coach."
            : "Exported from Vocal Studio Pro · share this summary with your coach.");
        const tb = new Blob([summary], { type: "text/plain;charset=utf-8" });
        const at = document.createElement("a");
        at.href = URL.createObjectURL(tb);
        at.download = `vocal-studio-coach-summary-${day}.txt`;
        at.click();
        URL.revokeObjectURL(at.href);
      } catch {
        /* ignore */
      }
      toast(tt("pricing.toast.exported"));
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && $("#pricing-modal") && !$("#pricing-modal").hidden) {
        closePricing();
      }
    });
    if (window.VTBilling) {
      VTBilling.onChange(() => {
        updateBillingChrome();
        if ($("#pricing-modal") && !$("#pricing-modal").hidden) renderPricingModal();
      });
      const ret = VTBilling.handleReturnFromCheckout();
      if (ret?.event === "success") toast(tt("pricing.toast.success"));
      if (ret?.event === "cancel") toast(tt("pricing.toast.cancel"));
      if (ret?.event === "error") {
        toast(ret.message || tt("pricing.toast.checkoutError"), { durationMs: 4200 });
      }
      // Operator console health (not shown to casual users)
      try {
        const h = VTBilling.getBillingHealth?.();
        if (h && !h.ok) console.info("[VTBilling] health:", h);
      } catch {
        /* ignore */
      }
    }
    updateBillingChrome();
    renderValuePulse();
    renderRetentionChrome();
  }

  // Test / debug helpers
  window.VTApp = {
    getOctaveShift: () => state.octaveShift,
    applyOctaveShift,
    getRangeSnapshot: () => ensureRangeAdapter()?.getSnapshot?.() || null,
    getProfile,
    fitStageBelowContent,
    renderValuePulse,
    showValueMoment,
    applyPianoOptionsHot,
    get _hotApplyPromise() {
      return state._hotApplyPromise;
    },
    getState: () => state,
    /** True if current (or given) exercise should start piano/ref on Empezar when Auto is on. */
    wantsSound: (ex) => {
      const e = ex || state.exercise;
      return exerciseWantsSound(e, e ? getProfile(e) : null);
    },
    shouldPromptOnLeave,
    getPracticedSec,
    getExerciseTargetSec,
    promptLeaveExercise,
    leaveExercise,
    resetSessionPractice,
    openExercise: forceOpenExercise,
    setView,
    setTab,
    openPricing,
    closePricing,
    openAccount,
    closeAccount
  };

  function init() {
    ensureRangeAdapter();
    updateOctaveUI();
    installGlobalErrorHandlers();
    if (window.VTI18n) {
      VTI18n.init();
      VTI18n.onChange = () => {
        renderExerciseList();
        if (state.view === "exercise" && state.exercise) renderExercise();
        updateSessionBanner();
        // Refresh tour button label
        const tb = $("#btn-tour");
        if (tb) tb.textContent = tt("nav.tour");
        updateBillingChrome();
        refreshAccountUI();
        renderValuePulse();
        if ($("#pricing-modal") && !$("#pricing-modal").hidden) renderPricingModal();
      };
    }
    const settings = VTStorage.getSettings();
    state.tab = settings.lastTab || "vocal";
    bind();
    bindBilling();
    bindAuth();
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
      VTTour.bindUiHelpButton?.();
      VTTour.maybeAutoStart();
    }
    // Ensure default 1-nota is reflected in select even before first exercise
    setPlayMode("oneNote", { silent: true });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
