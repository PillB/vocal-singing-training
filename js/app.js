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
      saved: false,
      // The history entry this open already wrote, so a later record or Save
      // updates one take instead of adding a second (see recordPracticeIfDue).
      entryId: null,
      // Seconds of this open already credited to today's practice-day row.
      creditedSec: 0
    },
    leavePromptOpen: false,
    /** 5-minute micro-session mode (retention research) */
    microSession: false,
    /** Set by a "5 min" button; applies to the next exercise opened, only. */
    pendingMicro: false,
    /** The reminder shown today, kept until dismissed (renderRetentionChrome). */
    remindDue: null,
    /** The guided step on the step-done card was listening when its clock ran out. */
    stepDoneMic: false,
    /**
     * The rating card for this open: the one-tap answer, the saved result, why
     * it opened (the clock ran out), and the first save's comparison and
     * first-win flag, which a changed answer keeps.
     */
    rate: { feel: null, result: null, end: null, prevScore: null, firstWin: false },
    /** The open exercise's steps when the stage shows them (no pitch canvas). */
    stageSteps: []
  };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  function tt(key, vars) {
    return typeof globalThis.t === "function" ? globalThis.t(key, vars) : key;
  }

  /** Date locale for the interface language, so dates read like the rest of the page. */
  function locale() {
    return window.VTI18n?.lang === "en" ? "en-US" : "es-PE";
  }

  /**
   * Behaviour for every scroll this file starts: smooth, except for visitors
   * who asked for reduced motion (styles.css drops the CSS smooth scroll for
   * them too, so "auto" jumps).
   */
  function scrollBehavior() {
    try {
      return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth";
    } catch {
      return "smooth";
    }
  }

  /** An exercise's name in the interface language. */
  function exName(ex) {
    return window.VTI18n ? VTI18n.exTitle(ex) : ex.title;
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
    // Quiet toast UI during e2e (still logs); avoids covering Start/Stop on small viewports
    if (sessionStorage.getItem("vt_e2e") === "1" && sessionStorage.getItem("vt_debug") !== "1") {
      return;
    }
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
      toast(tt("toast.genericFail"), { debounceMs: 5000 });
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
        // Measured by the mode: a one-tap rating leaves it alone.
        input.dataset.measured = "1";
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

  /** Keep sticky highway under real header + exercise chrome (Back row). */
  function syncHeaderHeightVar() {
    // Set on body as well as the root: body.view-exercise carries fallback
    // values that otherwise shadowed these, so on a phone the stage stuck
    // under a header row that was taller than the fallback said.
    const setVar = (name, value) => {
      document.documentElement.style.setProperty(name, value);
      document.body?.style.setProperty(name, value);
    };
    try {
      const h = document.querySelector("header.app-header");
      if (h) {
        // A rotated phone hides the header while an exercise is open (design:
        // landscape); the sticky rows below it then start at the very top.
        const hh =
          getComputedStyle(h).display === "none"
            ? 0
            : Math.max(40, Math.ceil(h.getBoundingClientRect().height));
        setVar("--header-h", `${hh}px`);
      }
      // Sticky ← Atrás row height — stage must stick below it so hits never land on stage/header
      const ex = document.querySelector(".exercise-header-compact");
      if (ex && !ex.hidden && getComputedStyle(ex).display !== "none") {
        const eh = Math.max(36, Math.ceil(ex.getBoundingClientRect().height));
        setVar("--ex-chrome-h", `${eh}px`);
      } else {
        setVar("--ex-chrome-h", "0px");
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Visual / layout viewport height (mobile chrome + fullscreen robust).
   * Prefer visualViewport when present (MDN: layout vs visual viewport).
   */
  function getViewportMetrics() {
    const vv = window.visualViewport;
    const ih = window.innerHeight || document.documentElement.clientHeight || 600;
    const iw = window.innerWidth || document.documentElement.clientWidth || 360;
    // visualViewport.height is the *visible* area; offsetTop when address bar shifts
    const vh = vv && vv.height > 0 ? vv.height : ih;
    const offsetTop = vv && typeof vv.offsetTop === "number" ? vv.offsetTop : 0;
    // Safe-area (notch / home indicator) — CSS also pads; include in measure gap
    let safeBottom = 0;
    try {
      const probe = getComputedStyle(document.documentElement).getPropertyValue(
        "--safe-bottom"
      );
      const n = parseFloat(probe);
      if (Number.isFinite(n)) safeBottom = n;
    } catch {
      /* ignore */
    }
    return { vh, iw, offsetTop, safeBottom, layoutVh: ih };
  }

  /**
   * Fit #highway-stage to remaining viewport below its current top (title+header).
   * CSS max-height alone cannot know layout Y; explicit geometry avoids bottom overflow.
   * Multi-format: visualViewport + safe-area + multi-pass clamp so Start stays clickable.
   */
  function fitHighwayToViewport() {
    try {
      syncHeaderHeightVar();
      const stage = document.getElementById("highway-stage");
      if (!stage || !document.body.classList.contains("view-exercise")) {
        if (stage) {
          stage.style.height = "";
          stage.style.maxHeight = "";
          stage.style.minHeight = "";
        }
        return;
      }
      // Keep stage top in view so sticky geometry matches measure
      try {
        const title = document.getElementById("ex-title");
        const cock = document.getElementById("practice-cockpit");
        const anchor = title || cock || stage;
        const ar = anchor.getBoundingClientRect();
        if (ar.top < 0 || ar.top > (window.innerHeight || 600) * 0.35) {
          // "instant": html has scroll-behavior: smooth, so "auto" glided and
          // the stage below was measured mid-scroll.
          anchor.scrollIntoView({ block: "start", behavior: "instant" });
        }
      } catch {
        /* ignore */
      }
      syncStageInsets();
      const r = stage.getBoundingClientRect();
      const { vh, offsetTop, safeBottom } = getViewportMetrics();
      // Gap: short/landscape + safe-area (home indicator)
      const gap = (vh < 500 ? 12 : 8) + Math.max(0, safeBottom);
      // Visual bottom of the usable screen (visualViewport may be offset)
      const visualBottom = offsetTop + vh;
      // Size for the lowest the stage sits at rest. It is sticky, so a page
      // scrolled by a few pixels lifts it to its sticky offset; measured then,
      // the stage came out that much too tall once the page was back at the
      // top (VG-30: 400px against a 390px landscape phone). When the stage
      // starts high enough that the top of the page is where it rests, size it
      // for that position.
      let top = Math.max(0, r.top);
      const cock = document.getElementById("practice-cockpit");
      if (cock && stage.parentElement === cock) {
        const cs = getComputedStyle(cock);
        const restTop =
          cock.getBoundingClientRect().top +
          window.scrollY +
          (parseFloat(cs.borderTopWidth) || 0) +
          (parseFloat(cs.paddingTop) || 0);
        if (restTop <= vh * 0.35) top = Math.max(top, restTop);
      }
      // Remaining space under stage top within the *visual* viewport
      const avail = Math.floor(visualBottom - top - gap);
      let maxH = Math.max(120, avail);
      // Prefer tall for low vision but never past visual bottom
      const prefer = Math.min(
        maxH,
        Math.round(vh * (vh < 500 ? 0.9 : vh < 700 ? 0.8 : 0.76)),
        vh < 500 ? 360 : vh < 700 ? 460 : 720
      );
      let h = Math.max(120, Math.min(prefer, maxH));
      stage.style.minHeight = "0";
      stage.style.maxHeight = `${maxH}px`;
      stage.style.height = `${h}px`;
      // Multi-pass: borders/subpixels / sticky can push y2 past visual bottom
      for (let pass = 0; pass < 3; pass++) {
        const rb = stage.getBoundingClientRect();
        if (rb.bottom <= visualBottom - 1) break;
        const fix = Math.max(
          100,
          Math.floor(visualBottom - rb.top - (pass === 0 ? 6 : pass === 1 ? 10 : 14))
        );
        stage.style.maxHeight = `${fix}px`;
        stage.style.height = `${fix}px`;
      }
      // Rails re-measured at the fitted height, so mode-focus and the lanes
      // never run under Start/Mic (hit-target safety) or the top controls.
      syncStageInsets();
      fitStageGuide();
      // Ensure Start is fully inside visual viewport (critical for short + land)
      try {
        const start = document.getElementById("btn-practice-start");
        if (start && !start.hidden) {
          const sb = start.getBoundingClientRect();
          if (sb.bottom > visualBottom - 2 || sb.height < 1) {
            const rb = stage.getBoundingClientRect();
            const over = sb.bottom - (visualBottom - 4);
            if (over > 0) {
              const nh = Math.max(100, Math.floor(rb.height - over - 4));
              stage.style.maxHeight = `${nh}px`;
              stage.style.height = `${nh}px`;
            }
          }
        }
      } catch {
        /* ignore */
      }
      // Resize pitch canvas to new stage box; redraw idle if not live
      try {
        if (state.pitchViz) {
          if (!state.practiceLive && typeof state.pitchViz.redrawIdle === "function") {
            state.pitchViz.redrawIdle();
          } else if (typeof state.pitchViz._resize === "function") {
            state.pitchViz._resize();
          }
        }
      } catch {
        /* ignore */
      }
    } catch {
      /* ignore */
    }
  }

  /**
   * Place what sits between the stage's two rails from their measured edges.
   * The top rail (status, chords, score and, on a pitch exercise, the coach
   * strip) and the bottom rail (Start, mic, piano) change height as they wrap;
   * at a fixed 10% the top rail's second row covered the mode panel's title on
   * a phone, and the lanes ran under both rails.
   * Sets --rail-t (top rail's bottom edge) and --rail-h (bottom rail plus a gap)
   * on the stage. Returns true when either moved.
   */
  function syncStageInsets() {
    try {
      const stage = document.getElementById("highway-stage");
      if (!stage || !document.body.classList.contains("view-exercise")) return false;
      const sr = stage.getBoundingClientRect();
      if (sr.height < 1) return false;
      let railBottom = 0;
      [...(document.getElementById("hud-top-rail")?.children || [])].forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.height) railBottom = Math.max(railBottom, b.bottom - sr.top);
      });
      const rail = document.getElementById("hud-bottom-rail");
      const rh = Math.ceil(rail?.getBoundingClientRect().height || 0);
      // +12px gap so mode-focus bottom stays above rail top
      const clear = Math.max(72, rh + 12 + Math.min(12, getViewportMetrics().safeBottom));
      const t = `${Math.ceil(railBottom) + 4}px`;
      const b = `${clear}px`;
      const moved =
        stage.style.getPropertyValue("--rail-t") !== t || stage.style.getPropertyValue("--rail-h") !== b;
      stage.style.setProperty("--rail-t", t);
      stage.style.setProperty("--rail-h", b);
      return moved;
    } catch {
      return false;
    }
  }

  /**
   * Show as many of the guide's steps as fit under the mode panel, whole: a
   * clipped box cut a step through the middle of a line, and below ~90px the
   * box used to vanish and leave an empty band. When no step fits, the button
   * to all the steps still does. While practising it holds one step, so it
   * only needs room for that.
   */
  function fitStageGuide() {
    const guide = $("#stage-guide");
    // dataset.on, not .hidden: a rotate back into portrait must be able to
    // bring the guide back after a short viewport hid it.
    if (!guide || guide.dataset.on !== "1") return;
    const focus = $("#mode-focus");
    const panel = $("#mode-focus-panel");
    if (!focus || focus.hidden) return;
    const live = guide.classList.contains("is-now");
    const head = $("#stage-guide-k");
    const list = $("#stage-guide-steps");
    const items = $$("#stage-guide-steps li", guide);
    items.forEach((li) => (li.hidden = false));
    if (head) head.hidden = live;
    if (list) list.hidden = live;
    guide.classList.remove("is-bare");
    guide.hidden = false;
    const cs = getComputedStyle(focus);
    const room = Math.floor(
      focus.clientHeight -
        (parseFloat(cs.paddingTop) || 0) -
        (parseFloat(cs.paddingBottom) || 0) -
        (panel && panel.offsetHeight ? panel.offsetHeight + (parseFloat(cs.rowGap) || 0) : 0)
    );
    const fits = () => guide.scrollHeight <= room + 1;
    if (!live) {
      // Idle: drop steps from the end; "Ver todos los pasos" still opens the rest.
      for (let i = items.length - 1; i > 0 && !fits(); i--) items[i].hidden = true;
      if (!fits() && head && list) {
        head.hidden = true;
        list.hidden = true;
        guide.classList.add("is-bare");
      }
    }
    guide.hidden = !fits();
  }

  /**
   * The stage guide while practising: the step the clock has reached, "Ahora ·
   * paso 2 de 5", moving on as the time runs. The steps used to disappear at
   * Start and leave the middle of the stage empty. Idle, it lists the first
   * steps again. Cheap enough for every timer tick: it redraws on a change.
   * @param {boolean} [force] redraw even if the step is the same (new exercise, language)
   */
  function syncStageNow(force) {
    const wrap = $("#stage-guide");
    if (!wrap || wrap.dataset.on !== "1") return;
    const steps = state.stageSteps || [];
    const t = state.timer;
    const live = !!state.practiceLive && t.total > 0 && steps.length > 0;
    const idx = live
      ? Math.min(steps.length - 1, Math.floor(Math.max(0, t.total - t.remaining) / (t.total / steps.length)))
      : -1;
    const key = live ? String(idx) : "idle";
    if (!force && wrap.dataset.now === key) return;
    wrap.dataset.now = key;
    wrap.classList.toggle("is-now", live);
    // The step lives in its own polite live region, number and text together;
    // the idle list around it stays silent while it is refitted.
    const now = $("#stage-guide-now");
    if (now) {
      now.hidden = !live;
      $("#stage-now-k").textContent = live ? tt("ex.stageNow", { n: idx + 1, total: steps.length }) : "";
      $("#stage-now-t").textContent = live ? steps[idx] : "";
    }
    $("#stage-guide-k").textContent = tt("ex.stageGuideLabel");
    $("#btn-stage-guide-more").hidden = live;
    // Heading and list: fitStageGuide shows them idle, as room allows
    fitStageGuide();
  }

  /** Re-place the lanes and the guide whenever a rail changes height (wrap, live HUD, cue). */
  function watchStageRails() {
    if (typeof ResizeObserver !== "function") return;
    let raf = 0;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const moved = syncStageInsets();
        fitStageGuide();
        if (!moved) return;
        try {
          if (state.pitchViz && !$("#pitch-block")?.hidden) {
            if (!state.practiceLive && typeof state.pitchViz.redrawIdle === "function") {
              state.pitchViz.redrawIdle();
            } else {
              state.pitchViz._resize?.();
            }
          }
        } catch {
          /* ignore */
        }
      });
    });
    ["hud-top-rail", "hud-bottom-rail", "mode-focus-panel"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) ro.observe(el);
    });
    // On a phone on its side the banner's Pausar and Terminar sit in the
    // exercise header's row, which keeps their width free (design: landscape).
    const ctl = $("#session-banner .controls-row");
    if (ctl) {
      new ResizeObserver(() => {
        const w = Math.ceil(ctl.getBoundingClientRect().width);
        if (w) document.body.style.setProperty("--session-ctl-w", `${w}px`);
      }).observe(ctl);
    }
  }

  /**
   * Where an exercise's mode panel mounts; both places are on the stage. A
   * pitch exercise's mode rides with its cue in the strip under the top
   * controls (#stage-coach, design: coach-strip); any other exercise's sits in
   * the middle of the stage, above the guide. A mode empties what it mounts
   * into, hence the inner panel.
   */
  function modeMountTarget(profile) {
    if (profile.showPitch) return $("#mode-hud");
    return $("#mode-focus-panel") || $("#mode-focus");
  }

  /** Debounced fit for resize / visualViewport / orientation / fullscreen */
  let _fitHighwayTimer = null;
  function scheduleFitHighway() {
    if (_fitHighwayTimer) clearTimeout(_fitHighwayTimer);
    _fitHighwayTimer = setTimeout(() => {
      _fitHighwayTimer = null;
      fitHighwayToViewport();
    }, 50);
  }

  /* —— Design: phone-header ——
     On a phone the header is one row: the sections, then "Más", which opens
     Pro, Cuenta, idioma and Tour. They are the same buttons with the same
     handlers; below 640px CSS turns their row into this menu. */

  function headerMenuOpen() {
    return $("#btn-more")?.getAttribute("aria-expanded") === "true";
  }

  function setHeaderMenu(open, opts = {}) {
    const btn = $("#btn-more");
    const menu = $("#header-utils");
    if (!btn || !menu) return;
    btn.setAttribute("aria-expanded", String(open));
    menu.classList.toggle("is-open", open);
    if (!open && opts.focus) btn.focus();
  }

  function bindHeaderMenu() {
    const btn = $("#btn-more");
    const menu = $("#header-utils");
    if (!btn || !menu) return;
    btn.addEventListener("click", () => setHeaderMenu(!headerMenuOpen()));
    // Choosing an item closes the menu and its own handler still runs. Focus
    // moves to "Más" first (capture phase, before that handler), so a dialog
    // the item opens hands focus back to a button that is still on screen.
    menu.addEventListener(
      "click",
      (e) => {
        if (!headerMenuOpen() || !e.target.closest("button, a")) return;
        btn.focus({ preventScroll: true });
        setHeaderMenu(false);
      },
      true
    );
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !headerMenuOpen()) return;
      e.preventDefault();
      setHeaderMenu(false, { focus: true });
    });
    document.addEventListener("click", (e) => {
      if (headerMenuOpen() && !btn.contains(e.target) && !menu.contains(e.target)) setHeaderMenu(false);
    });
    // Tabbing out of the menu leaves it closed rather than open behind the page.
    menu.addEventListener("focusout", (e) => {
      if (e.relatedTarget && !menu.contains(e.relatedTarget) && e.relatedTarget !== btn) setHeaderMenu(false);
    });
    // Wider than a phone the items are a plain row again; nothing is "open".
    window.matchMedia?.("(max-width: 640px)")?.addEventListener?.("change", () => setHeaderMenu(false));
  }

  /** Paint the header nav so the current section is always identifiable. */
  function syncHeaderNav(name) {
    const current = name === "exercise" ? "home" : name;
    $$("#header-nav .nav-link").forEach((link) => {
      const on = link.dataset.view === current;
      link.classList.toggle("active", on);
      if (on) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
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
    syncHeaderNav(name);
    setHeaderMenu(false);
    if (name !== "exercise") {
      document.body.classList.remove("practice-live");
      hideStepDone();
    }
    syncHeaderHeightVar();
    updateSessionBanner();
    if (name === "exercise") {
      requestAnimationFrame(() => fitHighwayToViewport());
      setTimeout(fitHighwayToViewport, 80);
    } else {
      fitHighwayToViewport(); // clears inline sizes off exercise
    }
    if (name === "home") {
      renderValuePulse();
      renderRetentionChrome();
      renderNextStepCard();
      // Gentle trial/progress prompts only on home (never during live practice)
      setTimeout(() => showValueMoment(), 400);
      try {
        window.VTAds?.renderSlot?.("home");
      } catch {
        /* ignore */
      }
    }
    if (name === "history") {
      try {
        window.VTAds?.renderSlot?.("history");
      } catch {
        /* ignore */
      }
    }
    if (name === "exercise") {
      // Never show home/history ads on exercise; clear post-session until complete
      try {
        window.VTAds?.clearSlot?.(document.getElementById("ad-slot-home"));
        window.VTAds?.clearSlot?.(document.getElementById("ad-slot-history"));
      } catch {
        /* ignore */
      }
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

  /** Total saved sessions across all exercises (for first-win loop). */
  function totalSessionsSaved() {
    const prog = VTStorage.getProgress() || {};
    return Object.values(prog).reduce((n, row) => n + (Number(row?.completedCount) || 0), 0);
  }

  /** Rated takes (not the ones kept automatically), counted up to 2. */
  function ratedSessionsSaved() {
    const prog = VTStorage.getProgress() || {};
    let n = 0;
    for (const row of Object.values(prog)) {
      for (const h of row?.history || []) {
        if (h && !h.auto) n += 1;
        if (n > 1) return n;
      }
    }
    return n;
  }

  /**
   * Next best exercise for habit path (UI research: small next action).
   * Prefer structured current → incomplete basic → first list item.
   */
  function suggestNextExercise(opts = {}) {
    const excludeId = opts.excludeId || null;
    const s = VTSession.get();
    if (s && s.status !== "completed" && s.order?.length) {
      const cur = VTSession.currentExerciseId();
      if (cur && cur !== excludeId) {
        const ex = findExercise(cur);
        if (ex) return { ex, reason: "structured" };
      }
    }
    if (shouldSuggestDaily()) {
      const d = dailySession();
      const first = findExercise(d.order[0]);
      if (first && first.id !== excludeId) return { ex: first, reason: "daily" };
    }
    const progress = VTStorage.getProgress() || {};
    const list = VT_EXERCISES[state.tab] || [];
    const basic = list.filter((e) => (e.tier || "basic") === "basic");
    const pick =
      basic.find((e) => e.id !== excludeId && !(progress[e.id]?.completedCount)) ||
      list.find((e) => e.id !== excludeId && !(progress[e.id]?.completedCount)) ||
      basic.find((e) => e.id !== excludeId) ||
      list.find((e) => e.id !== excludeId) ||
      list[0];
    if (!pick) return null;
    return { ex: pick, reason: progress[pick.id]?.completedCount ? "repeat" : "new" };
  }

  /* —— Prepared daily session (class sequence, one press) —— */

  /** The daily session definition, or null when the catalog has none. */
  function dailySession() {
    const d = window.VT_DAILY_SESSION;
    const order = d && window.VT_STRUCTURED?.[d.id];
    return d && order?.length ? { def: d, order } : null;
  }

  /**
   * The daily session is the recommendation on the singing track whenever no
   * guided session is already open: the whole point of it is that the user
   * never has to browse and pick. Vocal keeps the per-exercise suggestion.
   */
  function shouldSuggestDaily() {
    if (state.tab !== "singing") return false;
    const s = VTSession.get();
    if (s && s.status !== "completed" && s.order?.length) return false;
    return !!dailySession();
  }

  /** Start the daily class session from step one (switches to Canto if needed). */
  function startDaily() {
    const d = dailySession();
    if (!d) return null;
    if (state.tab !== d.def.track) setTab(d.def.track);
    return startStructured("daily");
  }

  function findExercise(id) {
    for (const track of ["vocal", "singing"]) {
      const hit = (VT_EXERCISES[track] || []).find((e) => e.id === id);
      if (hit) return hit;
    }
    return null;
  }

  function renderNextStepCard() {
    const card = $("#next-step-card");
    const titleEl = $("#next-step-title");
    const whyEl = $("#next-step-why");
    const btn = $("#btn-next-step");
    if (!card || !titleEl || !btn) return;
    // Hide on empty catalog
    const sug = suggestNextExercise();
    // Once there is a day sung, today's basics are the recommendation: the
    // loop writes the panel (js/daily-loop.js). An open guided session keeps
    // its own copy below.
    if (window.VTLoop?.renderHome?.()) {
      renderTourInvite();
      return;
    }
    if (!sug?.ex) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    // The loop may have left the CTA quiet ("done for today"); this panel has one primary.
    btn.classList.add("btn-practice");
    btn.classList.remove("btn-ghost");
    card.classList.remove("is-done");
    delete card.dataset.loop;
    const daily = sug.reason === "daily";
    const d = daily ? dailySession() : null;
    if (daily && d) {
      // The card names the session, not its first exercise: the user is choosing
      // the whole prepared run, which is the point of it.
      titleEl.textContent = tt("daily.cardTitle", {
        n: String(d.order.length),
        min: String(d.def.totalMin)
      });
      if (whyEl) whyEl.textContent = tt("daily.why");
    } else {
      const name = window.VTI18n ? VTI18n.exTitle(sug.ex) : sug.ex.title;
      titleEl.textContent = `${sug.ex.number}. ${name}`;
      if (whyEl)
        whyEl.textContent = tt(
          sug.reason === "structured" ? "home.nextStepWhyGuided" : "home.nextStepWhy"
        );
    }
    // A structured suggestion resumes the guided session: continuePractice un-pauses
    // it and opens with fromStructured, so completing the exercise advances the
    // session instead of suggesting the same one again.
    const structured = sug.reason === "structured";
    btn.onclick = () => {
      if (daily) startDaily();
      else if (structured) continuePractice();
      else openExercise(sug.ex.id, false);
    };
    renderStartPanel(sug);
  }

  /**
   * Start panel copy. One decision point on home: a first visit is told what the
   * site is and what a session looks like; a returning visitor is told what to
   * resume. The CTA is the same button either way, so there is only one primary.
   */
  /**
   * First visit only: offer the tour instead of launching it unasked. A tour
   * that opens itself is the trigger people abandon most, and the written
   * guide is the better answer for anyone who wants detail rather than a
   * walkthrough. Lives in .start-main, deliberately not inside .start-steps,
   * which is removed once a session has been saved.
   */
  function renderTourInvite() {
    const main = $("#start-panel .start-main");
    if (!main) return;
    const existing = $("#home-tour-invite");
    if (window.VTTour?.isDone?.()) {
      existing?.remove();
      return;
    }
    // Rebuilt on every render rather than left alone once it exists. The row is
    // written in JS, so `if (existing) return` froze it in whatever language the
    // page first loaded in — and since the site defaults to Spanish, that meant
    // four Spanish phrases under an English hero for every English speaker, who
    // can only get an English site by switching.
    existing?.remove();
    const p = document.createElement("p");
    p.className = "start-invite";
    p.id = "home-tour-invite";
    p.innerHTML = `
      <span class="muted" data-i18n="home.tourInvite"></span>
      <button type="button" class="btn btn-ghost btn-sm" data-i18n="home.tourInviteGo" data-tour-invite-start></button>
      <a class="btn btn-ghost btn-sm" href="guide.html" data-i18n="home.tourInviteGuide" data-tour-invite-guide></a>
      <button type="button" class="btn btn-ghost btn-sm" data-i18n="home.tourInviteDismiss" data-tour-invite-dismiss></button>
    `;
    p.querySelector("[data-i18n='home.tourInvite']").textContent = tt("home.tourInvite");
    p.querySelector("[data-tour-invite-start]").textContent = tt("home.tourInviteGo");
    const guideLink = p.querySelector("[data-tour-invite-guide]");
    guideLink.textContent = tt("home.tourInviteGuide");
    guideLink.href = window.VTTour?.guideHref?.() || "guide.html";
    p.querySelector("[data-tour-invite-dismiss]").textContent = tt("home.tourInviteDismiss");
    main.appendChild(p);
    window.VTTour?.bindInvite?.();
  }

  /**
   * guide.html holds both languages in one file, so a bare `guide.html` link
   * always lands an English reader on the Spanish half. Point every static
   * guide link at the right anchor for the current language.
   */
  function syncGuideLinks() {
    const href = window.VTTour?.guideHref?.() || "guide.html";
    // The Spanish half starts the document, so `#que-es` points at the top of
    // a page that already opens there. Keep the plain link in Spanish and add
    // the anchor only when it does some work — and set it either way, so
    // switching back to Spanish takes the anchor off again.
    const clean = href === "guide.html#que-es" ? "guide.html" : href;
    $$('a[href^="guide.html"]').forEach((a) => {
      if (a.hasAttribute("data-guide-anchor")) return;
      a.href = clean;
    });
  }

  function renderStartPanel(sug) {
    renderTourInvite();
    const kicker = $("#start-kicker");
    const title = $("#start-title");
    const sub = $("#start-sub");
    const label = $("#next-step-label");
    const cta = $("#btn-next-step");
    if (!kicker || !title || !sub) return;
    const saved = totalSessionsSaved();
    const guided = sug?.reason === "structured";
    const daily = sug?.reason === "daily";
    // The first-visit explainer opens with "pick an exercise", which contradicts a
    // prepared session whose whole pitch is that there is nothing to pick.
    const step1 = $("#start-steps li:first-child strong");
    const step1sub = $("#start-steps li:first-child .muted");
    if (step1) step1.textContent = tt(daily ? "daily.step1" : "start.step1");
    if (step1sub) step1sub.textContent = tt(daily ? "daily.step1sub" : "start.step1sub");
    if (daily) {
      const d = dailySession();
      kicker.textContent = tt("daily.kicker");
      title.textContent = tt("daily.title", { min: String(d?.def.totalMin ?? 30) });
      sub.textContent = tt("daily.sub");
      if (label) label.textContent = tt("daily.label");
      if (cta) cta.textContent = tt("daily.cta");
      return;
    }
    const returning = saved > 0 || guided;
    const key = guided ? "Guided" : returning ? "Back" : "New";
    kicker.textContent = tt("start.kicker" + key);
    title.textContent = returning
      ? tt(saved === 1 ? "start.titleBack1" : "start.titleBack", { n: saved })
      : tt("start.titleNew");
    sub.textContent = tt("start.sub" + key);
    if (label) label.textContent = tt(guided ? "home.nextStepLabelGuided" : "home.nextStepLabel");
    if (cta) cta.textContent = tt("start.cta" + key);
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
    else toast(tt("toast.noExercises"));
  }

  function updateSessionBanner() {
    const banner = $("#session-banner");
    const s = VTSession.get();
    if (!s || s.status === "completed") {
      banner.classList.remove("visible");
      syncStructuredProgress();
      return;
    }
    banner.classList.add("visible");
    const trackLabel = tt(s.track === "vocal" ? "tab.vocalShort" : "tab.singingShort");
    const status = tt(s.status === "paused" ? "session.statusPaused" : "session.statusActive");
    const name =
      s.path === "daily"
        ? tt("daily.banner")
        : s.path === "basics"
          ? tt("loop.banner", { tier: tt("loop.tier." + (s.tier || "min")) })
          : tt("session.bannerTitle", { track: trackLabel });
    // One line (design: session-chrome): where you are first and never cut,
    // then "En pausa" only when it is and the routine's name, which a narrow
    // phone cuts with "…". The title keeps the whole line for a pointer.
    const pos = document.createElement("span");
    pos.className = "session-banner-pos";
    pos.textContent = VTSession.progressLabel();
    const rest = document.createElement("span");
    rest.className = "session-banner-rest";
    // A no-break space: a flex item drops its leading space ("2· Básicos")
    const restParts = [s.status === "paused" ? status : "", name].filter(Boolean);
    rest.textContent = restParts.length ? "\u00a0· " + restParts.join(" · ") : "";
    const text = $("#session-banner-text");
    text.replaceChildren(pos, rest);
    text.title = text.textContent;
    $("#btn-session-resume").hidden = s.status !== "paused";
    $("#btn-session-pause").hidden = s.status !== "active";
    syncStructuredProgress();
  }

  /**
   * The exercise header's routine line, "Ejercicio 1 de 3" and "En pausa"
   * while it is. The banner says it wherever it has a row of its own; on a
   * phone on its side the banner's buttons join the header's row and this
   * line stands in for the banner's (design: landscape).
   */
  function syncStructuredProgress() {
    const sp = $("#structured-progress");
    if (!sp) return;
    if (!state.structured) {
      sp.hidden = true;
      sp.textContent = "";
      return;
    }
    sp.hidden = false;
    const paused = VTSession.get()?.status === "paused" ? tt("session.statusPaused") : "";
    sp.textContent = [VTSession.progressLabel(), paused].filter(Boolean).join(" · ");
  }

  function filteredExercises() {
    const all = VT_EXERCISES[state.tab] || [];
    if (state.tierFilter === "all") return all;
    return all.filter((ex) => (ex.tier || "basic") === state.tierFilter);
  }

  /**
   * A group's short name on its track, for the filter chips, the card badge
   * and the counts line. The groups are named for what they hold (Clase,
   * Técnica, Expresión), not for a level: "Básico" read as "my daily basics",
   * and today's basics draw on both groups.
   */
  function tierLabel(tier, track = state.tab) {
    const t = track === "singing" ? "singing" : "vocal";
    return tt(`tier.${t}.${tier === "advanced" ? "advanced" : "basic"}`);
  }

  /** Longest row description: two lines at 360px wide (see css "Design: catalog"). */
  const SUMMARY_MAX = 64;
  /** Small words: never a meaningful lead-in, and never the last word before "…". */
  const SMALL_WORDS = new Set(
    (
      "de del la las el los lo un una unos unas y e o u a al con sin por para en que se su sus tu tus " +
      "no ni como mas más the a an and or of on for with to in at by from into your you so that than as more"
    ).split(" ")
  );

  /** Words that carry meaning, accent-free, cut to a five-letter stem. */
  function stems(s) {
    return String(s)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && !SMALL_WORDS.has(w))
      .map((w) => w.slice(0, 5));
  }

  /** No bracket or quote left open, so a cut never ends inside "(…" or «…». */
  function balanced(s) {
    const unmatched = (a, b) => s.split(a).length !== s.split(b).length;
    // A straight quote between two letters is an apostrophe (don't), not a quote.
    const quotes = (s.match(/(^|[^\p{L}])'|'(?=[^\p{L}]|$)/gu) || []).length;
    return (
      !unmatched("(", ")") && !unmatched("«", "»") && !unmatched("\u201c", "\u201d") && quotes % 2 === 0
    );
  }

  /**
   * One plain line for a catalog row: what you do. It comes from the
   * exercise's "in short" line (exField "original", both languages). A lead-in
   * that only repeats the title ("Trinos de labios (SOVT): …") is dropped, and
   * a line too long for two phone lines ends at a sentence, a clause or a
   * word, never inside a word, a bracket or on a small word like "con".
   */
  function exerciseSummary(ex) {
    const I = window.VTI18n;
    let s = String((I?.exField ? I.exField(ex, "original") : ex.original) || "")
      .replace(/\s+/g, " ")
      .trim();
    const lead = s.match(/^([^:.!?…]{2,48}):\s+(\S.*)$/);
    if (lead) {
      const title = new Set(stems(exName(ex)));
      const words = [...new Set(stems(lead[1]))];
      const hits = words.filter((w) => title.has(w)).length;
      if (words.length && hits * 2 > words.length) {
        s = lead[2].charAt(0).toUpperCase() + lead[2].slice(1);
      }
    }
    if (s.length <= SUMMARY_MAX) return s;
    const sentence = s.match(/^.{20,}?[.!?](?=\s)/);
    if (sentence && sentence[0].length <= SUMMARY_MAX) return sentence[0];
    // Room for the ellipsis: what is kept is at most SUMMARY_MAX - 1 long.
    const head = s.slice(0, SUMMARY_MAX);
    // A clause break that keeps most of the line reads best...
    let cut = -1;
    for (const m of head.matchAll(/[,;:](?=\s)|\s[—–](?=\s)/g)) {
      if (m.index >= SUMMARY_MAX * 0.6 && balanced(s.slice(0, m.index))) cut = m.index;
    }
    if (cut > 0) return `${s.slice(0, cut)}…`;
    // ...otherwise the last whole word that leaves no small word dangling.
    const words = head.slice(0, head.lastIndexOf(" ")).split(" ");
    const tail = () => words[words.length - 1].toLowerCase().replace(/[^\p{L}]/gu, "");
    while (words.length > 3 && (SMALL_WORDS.has(tail()) || !balanced(words.join(" ")))) words.pop();
    return `${words.join(" ").replace(/[\s,;:—–-]+$/, "")}…`;
  }

  function renderExerciseList() {
    const list = $("#exercise-list");
    const exercises = filteredExercises();
    const grouped = state.tierFilter === "all";
    list.innerHTML = "";
    list.className = `grid track-${state.tab}`;

    $$(".tier-chip").forEach((c) => {
      const on = c.dataset.tier === state.tierFilter;
      c.classList.toggle("selected", on);
      // Picked says so in its state and with a tick, not by colour alone.
      c.setAttribute("aria-pressed", on ? "true" : "false");
      if (c.dataset.tier !== "all") c.textContent = tierLabel(c.dataset.tier);
    });

    const basicCount = (VT_EXERCISES[state.tab] || []).filter((e) => (e.tier || "basic") === "basic")
      .length;
    const advCount = (VT_EXERCISES[state.tab] || []).filter((e) => e.tier === "advanced").length;
    const countEl = $("#tier-counts");
    if (countEl) {
      // With level group headers carrying their own counts, the summary line is
      // noise on the unfiltered view — it only earns its place once filtered.
      countEl.textContent = grouped
        ? ""
        : tt("tier.counts", {
            basic: tierLabel("basic"),
            nb: basicCount,
            advanced: tierLabel("advanced"),
            na: advCount,
            showing: exercises.length
          });
    }

    // Group by tier when nothing is filtered: 20+ identical cards in one run are
    // unscannable, two labelled groups are. Headers span the grid, so the
    // "#exercise-list .card-ex" contract used across the suite is unchanged.
    let lastTier = null;
    exercises.forEach((ex) => {
      const prog = progressFor(ex.id);
      const tier = ex.tier || "basic";
      const track = ex.track || state.tab || "vocal";
      if (grouped && tier !== lastTier) {
        lastTier = tier;
        const head = document.createElement("h4");
        head.className = `grid-group-head tier-${tier}`;
        const n = (VT_EXERCISES[state.tab] || []).filter((e) => (e.tier || "basic") === tier).length;
        const name = tt(`group.${state.tab === "singing" ? "singing" : "vocal"}.${tier}`);
        head.innerHTML = `<span>${name}</span><span class="grid-group-n">${tt("group.count", { n })}</span>`;
        list.appendChild(head);
      }
      const tools =
        (ex.audio.piano ? tt("card.piano") : "") +
        (ex.audio.pitchViz || ex.practice?.showPitch ? tt("card.pitch") : "") +
        (ex.audio.record ? tt("card.record") : tt("card.practice"));
      const sessions = prog?.completedCount || 0;
      const sessLabel =
        sessions === 1
          ? tt("card.sessions", { n: sessions })
          : tt("card.sessions_plural", { n: sessions });
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `card card-ex track-${track}`;
      btn.dataset.track = track;
      btn.dataset.id = ex.id;
      // A row: number, name, what you do, then minutes and tools. The sessions
      // badge (top right) only shows once there is a session to count, and the
      // group badge only once filtered (grouped, the head names the group).
      btn.innerHTML = `
        <span class="num">${ex.number}</span>
        <span class="card-ex-body">
          ${sessions ? `<span class="badge done">${sessLabel}</span>` : ""}
          <h3>${exName(ex)}</h3>
          <p class="card-ex-desc">${escapeHtml(exerciseSummary(ex))}</p>
          <p class="meta">${tt("card.meta", { min: ex.durationMin, tools })}</p>
          <span class="card-ex-tags">${
            grouped ? "" : `<span class="badge tier-${tier}">${tierLabel(tier, track)}</span>`
          }</span>
        </span>
      `;
      btn.addEventListener("click", () => openExercise(ex.id, false));
      list.appendChild(btn);
    });
    renderTodayBasics();

    syncSessionPathOptions();
    $("#home-track-title").textContent = tt(
      state.tab === "vocal" ? "home.vocalTitle" : "home.singingTitle"
    );
    $("#home-track-sub").textContent = tt(
      state.tab === "vocal" ? "home.vocalSub" : "home.singingSub"
    );
    // Sync track switcher a11y + active paint
    $$(".tab[data-tab], .track-tab[data-tab]").forEach((t) => {
      const on = t.dataset.tab === state.tab;
      t.classList.toggle("active", on);
      t.setAttribute("aria-selected", on ? "true" : "false");
    });
    updateHomeZeroClass();
    renderNextStepCard();
  }

  /* —— Today's basics in the catalog ——
   * The loop's routine for this track, findable without scrolling: a line above
   * the list names each exercise as a shortcut, and their rows carry a "Hoy en
   * tus básicos" tag. Nothing shows until the loop is on (VTLoop.todayBasics),
   * so a first visit is not told about basics it has not met. */
  const TODAY_SHOWN = 4; // the Mínimo shows whole; longer routines fold after 3
  let todayExpanded = false;

  function renderTodayBasics() {
    const today = window.VTLoop?.todayBasics?.(state.tab) || null;
    const ids = new Set(today?.order || []);
    $$("#exercise-list .card-ex").forEach((c) => {
      const tags = c.querySelector(".card-ex-tags");
      let tag = tags?.querySelector(".card-ex-today");
      if (!ids.has(c.dataset.id)) {
        tag?.remove();
        return;
      }
      if (!tags) return;
      if (!tag) {
        tag = document.createElement("span");
        tag.className = "card-ex-today";
        tags.appendChild(tag);
      }
      tag.textContent = tt("catalog.today");
    });

    const box = $("#today-basics");
    if (!box) return;
    box.hidden = !today;
    if (!today) {
      box.innerHTML = "";
      return;
    }
    const fold = today.order.length > TODAY_SHOWN;
    const shown = fold && !todayExpanded ? today.order.slice(0, TODAY_SHOWN - 1) : today.order;
    const name = (id) => {
      const s = String(window.VTLoop.short?.(id) || id);
      return s.charAt(0).toUpperCase() + s.slice(1);
    };
    const label = tt("catalog.todayLabel", { tier: tt("loop.tier." + today.tier) });
    box.innerHTML =
      `<span class="today-basics-label" id="today-basics-label">${escapeHtml(label)}</span>` +
      shown
        .map(
          (id) =>
            `<button type="button" class="today-basics-ex" data-id="${escapeHtml(id)}">${escapeHtml(name(id))}</button>`
        )
        .join("") +
      (fold
        ? `<button type="button" class="today-basics-more" aria-expanded="${todayExpanded}">${escapeHtml(
            todayExpanded
              ? tt("catalog.todayLess")
              : tt("catalog.todayMore", { n: today.order.length - shown.length })
          )}</button>`
        : "");
  }

  /**
   * A guided route's name on a track. Routes are named for the catalog groups
   * they walk (the class homework, then Técnica or Expresión), so the second
   * group's name depends on the track. Stored values stay basic | advanced |
   * full | daily.
   */
  function pathName(path, track = state.tab) {
    const own = `home.path.${track}.${path}`;
    const s = tt(own);
    return s && s !== own ? s : tt(`home.path.${path}`);
  }

  /**
   * The route picker, written for the track on screen. The daily route only
   * exists for the track its sequence was written for, and once the daily loop
   * owns the start panel the class is its Clase size: offering it here as well
   * gave the same class two names. So the option is left out rather than
   * hidden (a hidden option still shows in iOS's picker).
   */
  function syncSessionPathOptions() {
    const sel = $("#session-path");
    if (!sel) return;
    const d = dailySession();
    const daily = !!d && state.tab === d.def.track && !window.VTLoop?.isOn?.();
    const paths = ["basic", "advanced", "full", ...(daily ? ["daily"] : [])];
    const keep = paths.includes(sel.value) ? sel.value : "basic";
    // Each name says how many exercises the route covers: "Tareas y técnica"
    // on Canto is 16 of its 27, the class exercises outside the homework live
    // in the daily class.
    sel.replaceChildren(
      ...paths.map((p) => {
        const o = document.createElement("option");
        o.value = p;
        const seq = window.VT_STRUCTURED?.[`${state.tab}_${p}`];
        const n = Array.isArray(seq) ? seq.length : 0;
        o.textContent = n ? tt("home.path.count", { name: pathName(p), n }) : pathName(p);
        return o;
      })
    );
    sel.value = keep;
  }

  /** Progressive disclosure: zero sessions → collapse empty studio chrome */
  function updateHomeZeroClass() {
    try {
      const sessions = Number($("#vp-sessions")?.textContent || 0) || 0;
      const zero =
        sessions === 0 &&
        !(window.VTStorage?.getSessions?.() || []).length;
      document.body.classList.toggle("home-zero", zero);
    } catch {
      document.body.classList.remove("home-zero");
    }
  }

  /**
   * Fill the dead middle of the stage with the exercise's own first steps when
   * no pitch canvas occupies it. The stage has to stay tall enough to hold the
   * HUD rails in the first viewport, so the choice is guidance or empty space.
   */
  function renderStageGuide(steps, enabled) {
    const wrap = $("#stage-guide");
    const list = $("#stage-guide-steps");
    if (!wrap || !list) return;
    // Every step, for "Ahora · paso n de N" while practising; the idle list
    // shows the first three.
    state.stageSteps = enabled ? (steps || []).filter(Boolean) : [];
    const items = state.stageSteps.slice(0, 3);
    if (!items.length) {
      wrap.hidden = true;
      delete wrap.dataset.on;
      list.innerHTML = "";
      return;
    }
    list.innerHTML = items.map((step) => `<li>${escapeHtml(step)}</li>`).join("");
    const more = $("#btn-stage-guide-more");
    if (more) more.textContent = tt("ex.stageGuideMore");
    wrap.dataset.on = "1";
    wrap.hidden = false;
    syncStageNow(true);
  }

  /**
   * The track of the basics routine (js/daily-loop.js) this exercise is open
   * as a step of, or null. The Vocal basics borrow Canto's lip trills, whose
   * own labels ("Canto · avanzado", breadcrumb Canto) told a speaking learner
   * their warm-up was advanced singing.
   */
  function basicsRoutineTrack(ex) {
    if (!state.structured || !ex) return null;
    const s = VTSession.get();
    return s && s.path === "basics" && s.order?.includes(ex.id) ? s.track || null : null;
  }

  function updateExerciseBreadcrumb(ex, routineTrack) {
    const track = routineTrack || ex?.track || state.tab || "vocal";
    const trackLabel = tt(track === "vocal" ? "tab.vocalShort" : "tab.singingShort");
    const title = ex
      ? `${ex.number}. ${window.VTI18n ? VTI18n.exTitle(ex) : ex.title}`
      : "—";
    const bcTrack = $("#bc-track");
    const bcCur = $("#bc-current");
    if (bcTrack) {
      bcTrack.textContent = trackLabel;
      bcTrack.dataset.track = track;
    }
    if (bcCur) bcCur.textContent = title;
  }

  function resetSessionPractice() {
    state.sessionPractice = {
      everStarted: false,
      liveSince: null,
      accumulatedMs: 0,
      saved: false,
      entryId: null,
      creditedSec: 0
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

  /**
   * The length this open was actually asked for: the running timer (a daily or
   * basics step, a 5-minute micro-session) before the exercise's own default.
   * Measuring a 1:45 guided step against a 20-minute default made the leave
   * prompt say "14s of 20:00".
   */
  function stepTargetSec(ex = state.exercise) {
    if (state.timer?.total > 0) return state.timer.total;
    return getExerciseTargetSec(ex);
  }

  /**
   * Live seconds after which an unrated run counts as practice: a third of the
   * step, never less than 15 s and never more than 45 s. Pressing Start and
   * then Next is not practice; a real minute of lip trills is.
   */
  function practiceCreditSec(ex = state.exercise) {
    const target = stepTargetSec(ex);
    return Math.min(45, Math.max(15, Math.round(target * 0.3)));
  }

  /** True once this open holds practice worth keeping and nothing is saved yet. */
  function shouldPromptOnLeave() {
    if (state.leavePromptOpen) return false;
    if (!state.exercise || state.view !== "exercise") return false;
    if (state.sessionPractice.saved) return false;
    if (!state.sessionPractice.everStarted) return false;
    return getPracticedSec() >= practiceCreditSec();
  }

  /**
   * Record this open as practice, if it was practice (VG-27).
   *
   * Every way out of an exercise used to lose the work unless the learner
   * pressed Save: Next in a guided session, "Descartar", "Terminar", opening
   * another exercise, closing the tab. A whole daily class could finish with
   * `vt_progress_v1` still null and no streak day. This is the one choke point
   * all of those now pass through.
   *
   * Idempotent per open: the first call inserts an unrated take and credits
   * today's practice-day row; later calls update that same take and credit only
   * the new seconds. A rated Save afterwards replaces it (completeExercise).
   *
   * @param {string} source what ended or interrupted the run, for analytics
   * @returns {object|null} the history entry, or null when nothing was due
   */
  function recordPracticeIfDue(source) {
    const ex = state.exercise;
    const sp = state.sessionPractice;
    if (!ex || !sp || sp.saved || !sp.everStarted) return null;
    const sec = Math.round(getPracticedSec());
    if (sec < practiceCreditSec(ex)) return null;
    if (sp.entryId && sec <= (sp.creditedSec || 0)) return null;
    let entry = null;
    try {
      entry = VTStorage.saveExerciseResult(ex.id, {
        replaceId: sp.entryId,
        metrics: {},
        score: null,
        notes: "",
        durationSec: sec,
        auto: true
      });
    } catch (e) {
      console.warn("[VT] practice record", e);
      return null;
    }
    const inserted = !sp.entryId;
    const delta = Math.max(0, sec - (sp.creditedSec || 0));
    sp.entryId = entry.id;
    sp.creditedSec = sec;
    const day = window.VTDays?.record?.({ exerciseId: ex.id, sec: delta, bump: inserted, source });
    if (inserted) {
      window.VTSync?.schedule?.();
      try {
        window.VTAnalytics?.track?.("practice_recorded", {
          exerciseId: ex.id,
          source,
          durationSec: sec,
          structured: !!state.structured,
          micro: !!state.microSession,
          firstOfDay: !!day?.becameDay
        });
      } catch {
        /* ignore */
      }
    }
    window.VTLoop?.onPractice?.({ exerciseId: ex.id, source, day, structured: !!state.structured });
    return entry;
  }

  /**
   * Ask save / discard / stay. Resolves:
   *  "save" | "discard" | "stay"
   */
  function promptLeaveExercise() {
    const opener = document.activeElement;
    return new Promise((resolve) => {
      const modal = $("#leave-modal");
      if (!modal) {
        resolve("discard");
        return;
      }
      state.leavePromptOpen = true;
      const practiced = getPracticedSec();
      const target = stepTargetSec();
      const pct = Math.min(100, Math.round((practiced / target) * 100));
      const stats = $("#leave-modal-stats");
      if (stats) {
        stats.textContent = tt("leave.stats", {
          done: formatDurationShort(practiced),
          total: formatDurationShort(target),
          pct: String(pct)
        });
      }
      // The modal's own strings are set below. It used to run VTI18n.applyDom()
      // here, which reset every data-i18n element on the page to its default —
      // the session banner read "Sesión guiada" from then on.
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
      // Clear any test/tooling inline display:none so modal paints + receives hits
      modal.style.display = "";
      modal.style.visibility = "";
      window.VTFocusTrap?.activate(modal, { initialFocus: btnSave, returnFocus: opener });

      const finish = (choice) => {
        modal.hidden = true;
        window.VTFocusTrap?.release(modal);
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
      if (choice === "stay" || choice === "save") state.pendingMicro = false;
      if (choice === "stay") return false;
      if (choice === "save") {
        // Stop audio, keep user on exercise to complete metrics
        stopPractice(true);
        VTPiano.stopAll();
        // The silent stop skips the metrics reveal a normal stop does, so the
        // button below could be inside a collapsed card (VG-28). One tap on
        // the rating card saves and then goes where the learner was headed.
        openMetricsPanel(true, { focus: true });
        toast(tt("leave.scrollSave"));
        // Stash intended destination after save
        state.pendingLeave = destination;
        return false;
      }
      // "Leave without rating": the practice still happened, so it still
      // counts. Only the rating and the take are dropped.
      recordPracticeIfDue("leave");
      stopPractice(true);
      VTPiano.stopAll();
      stopTimer(false);
      stopHold();
      stopPitchViz();
      state.recorder.clear();
      resetSessionPractice();
      toast(tt("leave.discarded"));
    } else {
      recordPracticeIfDue("leave");
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
    // Whatever was running is kept before it is torn down.
    recordPracticeIfDue("switch");
    // A 5-minute micro-session applies to the open that asked for it, not to
    // every exercise after it: the flag used to stick until the next Save and
    // gave each later daily step a 5:00 timer.
    state.microSession = !!state.pendingMicro;
    state.pendingMicro = false;
    stopPractice(true);
    hideStepDone();
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
    // Instant jump to top so game stage is the first viewport (no smooth lag).
    // "instant", not (0, 0): html has scroll-behavior: smooth, so that glided
    // for a third of a second from wherever the list was scrolled.
    window.scrollTo({ top: 0, behavior: "instant" });
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: "instant" });
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
    // The mode and its cue moved onto the stage (#stage-coach, design:
    // coach-strip); only the stats are left to fit here.
    const stats = $("#pitch-stats");

    // Clear previous locks so we can remeasure
    [below, stats].forEach((el) => {
      if (!el) return;
      el.style.maxHeight = "";
      el.style.height = "";
      el.style.minHeight = "";
      el.style.overflow = "";
    });

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
    hideMicBlocked();

    $("#ex-title").textContent = `${ex.number}. ${
      window.VTI18n ? VTI18n.exTitle(ex) : ex.title
    }`;
    const tier = ex.tier || "basic";
    // Inside today's basics every step is a warm-up of the routine's track,
    // whatever catalog track and tier the exercise has on its own.
    const routineTrack = basicsRoutineTrack(ex);
    const badgeTrack = routineTrack || ex.track;
    $("#ex-track-badge").textContent = routineTrack
      ? tt("badge.basics")
      : `${tt(ex.track === "vocal" ? "badge.vocal" : "badge.singing")} · ${tierLabel(tier, ex.track)}`;
    $("#ex-track-badge").style.borderColor = badgeTrack === "vocal" ? "var(--vocal)" : "var(--singing)";
    updateExerciseBreadcrumb(ex, routineTrack);
    const I = window.VTI18n;
    const original = I?.exField ? I.exField(ex, "original") : ex.original;
    const research = I?.exField ? I.exField(ex, "research") : ex.research;
    const steps = I?.exField ? I.exField(ex, "steps") : ex.steps || [];
    const tips = I?.exField ? I.exField(ex, "tips") : ex.tips || [];
    const mistakes = I?.exField ? I.exField(ex, "mistakes") : ex.mistakes || [];
    const origEl = $("#ex-original");
    if (origEl) {
      const label = tt("ex.original");
      origEl.textContent = original ? `${label}: ${original}` : "";
      origEl.hidden = !original;
    }
    const researchEl = $("#ex-research");
    if (researchEl) {
      researchEl.textContent = research ? `${tt("ex.research")}${research}` : "";
      researchEl.hidden = !research;
    }
    // Escape catalog strings (trusted, but never treat as raw HTML — red-team F2)
    $("#ex-steps").innerHTML = (steps || [])
      .map((s) => `<li>${escapeHtml(s)}</li>`)
      .join("");
    $("#ex-tips").innerHTML = (tips || [])
      .map((t) => `<li>${escapeHtml(t)}</li>`)
      .join("");
    $("#ex-mistakes").innerHTML = (mistakes || [])
      .map((m) => `<li>${escapeHtml(m)}</li>`)
      .join("");

    // Timer (integrated into cockpit — always show display when timer exists)
    // Micro-session: 5 min soft cap for comeback practice
    let timerSec = state.microSession ? 5 * 60 : ex.timerDefaultSec || 0;
    // Prepared routines (the daily class, today's basics) run short per-step
    // timers so the whole sequence fits one sitting instead of summing every
    // exercise's own default. A routine carries its own map; the daily class
    // still falls back to the catalog's.
    if (!state.microSession && state.structured) {
      const ds = VTSession.get();
      const step =
        Number(ds?.sec?.[ex.id]) ||
        (ds?.path === "daily" ? Number(window.VT_DAILY_SESSION?.sec?.[ex.id]) : 0);
      if (ds && step > 0) timerSec = step;
    }
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
    if ($("#mode-focus-panel")) $("#mode-focus-panel").innerHTML = "";
    const mountTarget = modeMountTarget(profile);
    // The pitch exercise's strip shows only with its canvas
    if ($("#stage-coach")) $("#stage-coach").hidden = !profile.showPitch;
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
      // Cue already lives in the mode panel for speech; the strip is pitch-only
      $("#mode-cue").hidden = !profile.showPitch;
    }
    if (modeHud) modeHud.hidden = !profile.showPitch;

    // Pitch visualizer only when profile asks
    const pitchBlock = $("#pitch-block");
    pitchBlock.hidden = !profile.showPitch;
    renderStageGuide(steps, !profile.showPitch);
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
    // U12: clear pitch-stats footer when leaving pitch exercises
    const pitchStats = $("#pitch-stats");
    if (pitchStats) {
      if (!showPitchHud) {
        pitchStats.innerHTML = "";
        pitchStats.hidden = true;
      } else {
        pitchStats.hidden = false;
      }
    }

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
    // Lip trills, straws and the rate ladder keep the default chord and play
    // mode; their two menus only crowded a phone's stage and covered the
    // exercise's name (design: start-floor).
    if ((profile.mode === "sovtFlow" || profile.mode === "rateLadder") && $("#hud-prog-bar")) {
      $("#hud-prog-bar").hidden = true;
    }
    if (pianoMini) {
      pianoMini.style.display = showPiano || exerciseWantsSound(ex, profile) ? "" : "none";
      // U8 progressive disclosure: secondary piano opts collapsed until 🎹+
      pianoMini.classList.toggle("piano-opts-compact", !!showPiano);
      pianoMini.classList.toggle("piano-opts-expanded", false);
    }
    // Piano more button lives in BR HUD (no extra row = less scroll)
    if (pianoToggleRow) pianoToggleRow.hidden = true;
    const tbtn = $("#btn-toggle-piano");
    if (tbtn) {
      tbtn.hidden = !showPiano;
      tbtn.setAttribute("aria-expanded", "false");
      tbtn.textContent = tt("piano.more");
      tbtn.title = tt("piano.showPanel");
      // "🎹+" alone is read out as an emoji; the button says what it opens
      tbtn.setAttribute("aria-label", tbtn.title);
    }

    // Practice hint stays hidden in stage (hint is in tour / guide)
    const hint = $("#practice-hint");
    if (hint) {
      hint.hidden = true;
      hint.textContent = tt("practice.hint");
    }

    // Fit cue / mode strip under highway to full text height (no inner scroll)
    requestAnimationFrame(() => {
      fitStageBelowContent();
      fitHighwayToViewport();
    });
    setTimeout(fitHighwayToViewport, 100);

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

    // Metrics form, under the rating card's one-tap answers
    renderMetricsForm(ex);
    resetRating();

    // Structured nav
    $("#structured-nav").hidden = !state.structured;
    syncStructuredProgress();

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
        const sec = String(opts.sustainSec);
        toast(
          loop
            ? opts.oneNote
              ? tt("toast.loopOneNote", { sec })
              : opts.sustain
                ? tt("toast.loopSustain", { sec })
                : tt("toast.loopProg")
            : opts.oneNote
              ? tt("toast.playOneNote", { sec })
              : opts.sustain
                ? tt("toast.playSustain", { sec })
                : tt("toast.playOnce")
        );
      }
    } catch (e) {
      toast(tt("toast.audioStartFail"));
      console.error(e);
    }
  }

  function ensurePitchViz() {
    const canvas = $("#pitch-canvas");
    if (!canvas) return null;
    if (!state.pitchViz) {
      state.pitchViz = new VTPitchVisualizer(canvas);
      state.pitchViz.onStats = updatePitchStatsLabel;
    }
    if (!state.pitchGame) {
      state.pitchGame = new VTPitchGame();
      state.pitchGame.onUpdate = updateGameHud;
      state.pitchGame.onLock = onChallengeNoteLocked;
    }
    state.pitchViz.attachGame(state.pitchGame);
    // Paint after layout: double rAF so clientWidth reflects fitted stage
    if (!state.practiceLive) {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            state.pitchViz?.redrawIdle?.();
          } catch {
            /* ignore */
          }
        });
      });
    }
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
    toast(
      nextNote
        ? tt("toast.lockedNext", { prev: prevNote, next: nextNote })
        : tt("toast.lockedDone", { prev: prevNote })
    );
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

  /** Human label for practice mode ids (toasts / chips — never show camelCase). */
  function modeDisplayName(modeId) {
    const es =
      (window.VTI18n && VTI18n.lang === "es") ||
      (document.documentElement.lang || "").startsWith("es");
    const map = {
      rateLadder: es ? "Escalera de ritmo" : "Rate ladder",
      volumeSteady: es ? "Volumen estable" : "Steady volume",
      volumeLadder: es ? "Escalera de volumen" : "Volume ladder",
      shAirLadder: es ? "Escalera de aire SH" : "SH air ladder",
      breathS: es ? "Soporte de aire" : "Breath support",
      pitchHold: es ? "Sostén de tono" : "Pitch hold",
      pitchMatch: es ? "Afinar nota" : "Pitch match",
      pitchChord: es ? "Acordes / solfeo" : "Chords / solfege",
      pitchSong: es ? "Canción" : "Song stanzas",
      scaleSteps: es ? "Escala" : "Scale steps",
      sirenRange: es ? "Sirenas" : "Sirens",
      sovtFlow: es ? "Flujo SOVT" : "SOVT flow",
      humTargets: es ? "Tarareo" : "Hum targets",
      onsetReps: es ? "Ataques suaves" : "Easy onset",
      staccatoLegato: es ? "Staccato / legato" : "Staccato / legato",
      dynamicSwell: es ? "Dinámica" : "Dynamics",
      pitchContour: es ? "Contorno" : "Pitch contour",
      weekPlan: es ? "Plan 12 semanas" : "12-week plan",
      recordOnly: es ? "Grabar y revisar" : "Record & review",
      pauseDetect: es ? "Pausas" : "Pauses",
      fillerDetect: es ? "Muletillas" : "Fillers"
    };
    if (!modeId) return es ? "práctica" : "practice";
    return map[modeId] || String(modeId).replace(/([A-Z])/g, " $1").trim();
  }

  function setPracticeUI(live) {
    state.practiceLive = live;
    // U7: body class drives compact vs expanded pitch score strip
    try {
      document.body.classList.toggle("practice-live", !!live);
    } catch {
      /* ignore */
    }
    if (!live) {
      try {
        state.practice?.setManualSound?.(false, null, { forceClear: true });
        state._spaceDown = false;
        $("#mic-sens-hud")?.classList.remove("is-manual", "is-manual-grace");
      } catch {
        /* ignore */
      }
    }
    try {
      state._updateManualHintVisibility?.();
    } catch {
      /* ignore */
    }
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
    syncStageNow();
    // Practice clock for leave-prompt (≥10% of exercise)
    if (live) {
      state.sessionPractice.everStarted = true;
      if (state.sessionPractice.liveSince == null) {
        state.sessionPractice.liveSince = performance.now();
      }
      // Blur Start/Stop so Space is not consumed as button activation (browser default)
      try {
        start?.blur?.();
        stop?.blur?.();
        const stage = document.getElementById("highway-stage");
        if (stage) {
          if (!stage.hasAttribute("tabindex")) stage.setAttribute("tabindex", "-1");
          stage.focus({ preventScroll: true });
        } else {
          document.body?.focus?.({ preventScroll: true });
        }
      } catch {
        /* ignore */
      }
      // Remeasure bottom rail after live layout (mode panel may reflow)
      requestAnimationFrame(() => {
        fitHighwayToViewport();
        setTimeout(fitHighwayToViewport, 60);
      });
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
      // A mode that owns its targets (profile.ownsTarget) already chose the first
      // note in onStart(). Sound that one, not the generic refPitch: otherwise the
      // reference the user hears — and the target this sets — is a different note
      // from the one the mode is waiting for, so no hold can ever be credited.
      const owned = profile.ownsTarget ? state.modeInstance?.state?.wantName : null;
      const note = effectiveNoteName(owned || profile.refPitch || ex.audio?.refPitch);
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
    hideStepDone();
    const profile = getProfile(ex);
    // Generation token: Stop / leave / exercise switch aborts in-flight Start
    const gen = ++state.practiceGen;
    const stillThisStart = () => gen === state.practiceGen && state.exercise === ex;

    try {
      // weekPlan: open dashboard instead of forcing mic
      if (profile.mode === "weekPlan") {
        state.modeInstance?.onStart?.();
        document.getElementById("btn-plan")?.click();
        toast(tt("toast.planOpened"));
        return;
      }

      // Say what the browser is about to ask, once per browser, before it
      // asks. A denial is only undoable in browser settings, and on a pitch
      // exercise it currently reads as success — the piano plays and the
      // highway moves with only the voice line missing. This sits before
      // setPracticeUI(false) so #btn-practice-start is still focusable for
      // the focus trap to return to.
      const wantsMic = profile.showPitch || profile.showLevel || profile.showHold;
      if (wantsMic && window.VTTour?.needsMicPrimer?.()) {
        // The primer used to say the same thing on every exercise — that the
        // piano keeps playing and only the pitch readout is lost. Roughly half
        // the exercises that show it have no piano and no pitch readout at all,
        // including the one the home page's own first-practice button opens.
        window.VTTour.showMicPrimer(() => startPractice(), {
          piano: exerciseWantsSound(ex, profile),
          onDecline: () => toast(tt("tour.mic.declined"))
        });
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
        // The last step of the funnel, and the only one that says the trial was
        // worth giving: somebody who holds one and then actually practises. Once
        // per browser, marked in storage rather than in memory so pressing the
        // trial button and practising straight away counts once, and so does
        // coming back the next day. The mark is never cleared, so a second trial
        // does not re-fire it and clearing site data does; both are acceptable
        // for a step whose question is "did the trial lead to any practice at
        // all", and neither can inflate the count for one browser.
        const held = headerPlanState().kind;
        if (held === "trialAccount" || held === "trialLocal") {
          try {
            if (localStorage.getItem("vt_trial_first_practice_v1") !== "1") {
              localStorage.setItem("vt_trial_first_practice_v1", "1");
              window.VTAnalytics?.track?.("trial_first_practice", { kind: held === "trialAccount" ? "account" : "local" });
            }
          } catch {
            /* private mode: the event is simply not sent */
          }
        }
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
      const mountTarget = modeMountTarget(profile);
      if (mountTarget && window.VTPracticeModes) {
        state.modeInstance = VTPracticeModes.get(profile.mode);
        state.modeInstance.mount(mountTarget, profile);
        state.modeInstance.onStart();
      }

      state.practice.onFrame = (frame) => {
        if (profile.showLevel !== false) {
          // Scale meter with sensitivity so soft voices still fill the bar
          // (retuned with ~3× max sens — slightly lower boost at top to avoid always-full bar)
          const sens = state.practice.getSensitivity?.() || 7;
          const boost = 2.4 + (sens - 5) * 0.22;
          $("#level-fill").style.width = `${Math.round(Math.min(1, frame.rms * boost) * 100)}%`;
        }
        // Manual assist (+ grace): border on mic chip; grace = softer ring
        const micChip = $("#mic-sens-hud");
        if (micChip) {
          micChip.classList.toggle("is-manual", !!frame.manualSound && !frame.manualGrace);
          micChip.classList.toggle("is-manual-grace", !!frame.manualGrace);
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
        } else if (ref && !profile.ownsTarget) {
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
        } else if (ref && !profile.ownsTarget) {
          // profile.ownsTarget: the mode walks its own note list and has already
          // set the first one in onStart(). The generic refPitch bootstrap runs
          // after that, so without this guard it would point the highway and the
          // engine at a different note than the one the mode is waiting for.
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
        ["pauseDetect", "volumeSteady", "volumeLadder", "speechEnergy", "breathS", "shAirLadder", "sovtFlow", "sirenRange", "onsetReps", "concisionGate", "authorityLand", "pitchContour"].includes(
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

      // A time-driven mode (paced breathing, guided release) advances on the
      // clock alone, so a refused mic must not make the exercise unusable.
      if (!micOk && !soundOk && !profile.timeDriven) {
        state.practiceStarting = false;
        setPracticeUI(false);
        showMicBlocked(false);
        return;
      }

      setPracticeUI(true);

      // Frames come from the practice engine, which only runs when the mic or the
      // recorder was wanted AND actually started. Whenever it did not, drive a
      // time-driven mode ourselves so its phases and timer still advance.
      const engineLive = (needsMic || wantRecord) && micOk;
      if (!engineLive && (profile.timeDriven || (!needsMic && !wantRecord))) startModeTicker();

      // The step clock runs whenever the step is live. It used to wait for the
      // mic, so with the mic refused and the piano playing the timer sat still
      // and a guided step could never end (VG-40).
      if (ex.audio.timer && state.timer.total > 0) startTimer();
      if ((needsMic || wantRecord) && !micOk) showMicBlocked(true);
      else hideMicBlocked();

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
            ? tt("toast.liveRec", { mode: modeDisplayName(profile.mode) })
            : tt("toast.live", { mode: modeDisplayName(profile.mode) })
        );
      }
    } catch (e) {
      console.error(e);
      state.practiceStarting = false;
      setPracticeUI(false);
      toast(tt("toast.mic"));
    }
  }

  /**
   * Silent, time-driven modes (guided release phases) ask for no microphone, so
   * the practice engine never starts and never delivers frames — their phase
   * runner would sit frozen on its first paint. Drive those from a frame loop of
   * our own, with a zeroed frame so nothing reads it as detected sound.
   */
  function startModeTicker() {
    stopModeTicker();
    let last = performance.now();
    const tick = () => {
      if (!state.practiceLive || !state.modeInstance) {
        state._modeTicker = null;
        return;
      }
      const now = performance.now();
      const dtMs = now - last;
      last = now;
      try {
        state.modeInstance.onFrame({ dtMs, rms: 0, voiced: false, voiceFreq: 0, holdSec: 0 });
      } catch (err) {
        console.warn(err);
      }
      state._modeTicker = requestAnimationFrame(tick);
    };
    state._modeTicker = requestAnimationFrame(tick);
  }

  /**
   * A refused microphone, said where the learner is looking and kept there:
   * how to allow it, a retry, and — inside a guided routine — a way on.
   * @param {boolean} canRun true when the piano or the clock still runs
   */
  function showMicBlocked(canRun) {
    const box = $("#mic-blocked");
    if (!box) {
      toast(tt("toast.mic"));
      return;
    }
    $("#mic-blocked-text").textContent = tt(canRun ? "mic.blocked.partial" : "mic.blocked.none");
    const retry = $("#btn-mic-retry");
    const skip = $("#btn-mic-skip");
    if (retry) {
      retry.textContent = tt("mic.blocked.retry");
      retry.onclick = () => {
        hideMicBlocked();
        stopPractice(true);
        startPractice();
      };
    }
    if (skip) {
      skip.textContent = tt("mic.blocked.skip");
      skip.hidden = !state.structured;
      skip.onclick = () => advanceStructured("skip");
    }
    box.hidden = false;
    try {
      window.VTAnalytics?.track?.("mic_blocked", { exerciseId: state.exercise?.id, canRun: !!canRun });
    } catch {
      /* ignore */
    }
  }

  function hideMicBlocked() {
    const box = $("#mic-blocked");
    if (box) box.hidden = true;
  }

  function stopModeTicker() {
    if (state._modeTicker) cancelAnimationFrame(state._modeTicker);
    state._modeTicker = null;
  }

  function stopPractice(silent) {
    // Invalidate any in-flight Start
    state.practiceGen = (state.practiceGen || 0) + 1;
    state.practiceStarting = false;
    stopModeTicker();
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
      try {
        state.practice.setManualSound?.(false, null, { forceClear: true });
        state._spaceDown = false;
        $("#mic-sens-hud")?.classList.remove("is-manual", "is-manual-grace");
      } catch {
        /* ignore */
      }
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
      // Musk-mode UX: after a real stop, open reflect/save so metrics aren't hidden.
      // Detener hides itself; its focus goes to the question, not the page top.
      const a = document.activeElement;
      const lost = !a || a === document.body || a.id === "btn-practice-stop";
      openMetricsPanel(true, { focus: lost && !rateQuiet() });
    }
  }

  /**
   * Expand or collapse the rating card (#metrics-card)
   * @param {boolean} open
   * @param {{ reveal?: boolean, focus?: boolean, end?: "mic"|"time" }} [opts]
   *   reveal (unless false): bring the card into view (revealRating); focus: move focus
   *   to its question (the learner asked to rate, or the exercise just ended);
   *   end: the clock ran out, and whether the mic was on
   */
  function openMetricsPanel(open, opts = {}) {
    state.metricsOpen = !!open;
    const card = document.querySelector("#metrics-card");
    card?.classList.toggle("collapsed", !state.metricsOpen);
    const btn = $("#btn-toggle-metrics");
    if (btn) {
      btn.textContent = state.metricsOpen
        ? tt("metrics.hide")
        : tt("metrics.show");
      btn.setAttribute("aria-expanded", String(!!state.metricsOpen));
    }
    syncRoutineNav();
    if (!state.metricsOpen || !card) return;
    state.rate.end = opts.end || null;
    paintRating();
    if (opts.focus) $("#rate-q")?.focus({ preventScroll: true });
    if (opts.reveal !== false) revealRating();
  }

  /* —— Rating: one tap after a take —— */
  /** Self-ratings a one-tap answer sets, on the 1–5 sliders. */
  const FEEL = { easy: 5, ok: 3, hard: 2 };

  /**
   * Muted under automation like the step-done card: the single-exercise ending
   * stays a toast, "Más detalles" starts open so specs that fill the form and
   * press #btn-complete still reach them, and a routine keeps its "Siguiente
   * ejercicio" in view. Specs that test it opt in (vt_rate_e2e).
   */
  function rateQuiet() {
    try {
      return sessionStorage.getItem("vt_e2e") === "1" && sessionStorage.getItem("vt_rate_e2e") !== "1";
    } catch {
      return false;
    }
  }

  /**
   * How long this take ran, and the length it was asked for: a guided step's
   * own timer (1:30 of a 1:30 step), a single exercise's timer, or none. The
   * timer and the practice clock agree while it runs; the clock also holds
   * time sung after 00:00 ("30 s más", Empezar again).
   * @returns {{ done: number, total: number }} seconds
   */
  function takeTimes() {
    const total = state.timer.total > 0 ? state.timer.total : 0;
    const ran = total ? Math.max(0, Math.min(total, total - state.timer.remaining)) : 0;
    return { done: Math.round(Math.max(ran, getPracticedSec())), total };
  }

  /** A new exercise starts with nothing chosen. */
  function resetRating() {
    state.rate = { feel: null, result: null, end: null, prevScore: null, firstWin: false };
    const more = $("#rate-more");
    if (more) more.open = rateQuiet();
    paintRating();
  }

  /** Write the card's state: the time, the answer chosen, the note, the way out. */
  function paintRating() {
    const r = state.rate;
    const { done, total } = takeTimes();
    const time = $("#rate-time");
    if (time) {
      time.hidden = done < 1;
      const strong = document.createElement("strong");
      strong.textContent = total
        ? tt("metrics.timeOf", { done: VTMetrics.clock(done), total: VTMetrics.clock(total) }) +
          (done >= total - 1 ? " ✓" : "")
        : VTMetrics.clock(done);
      time.replaceChildren(document.createTextNode(`${tt("rate.time")} `), strong);
    }
    // A timed take fills the minutes itself; the field is there for practice
    // the clock never saw.
    $$("#metrics-form .field-time").forEach((f) => {
      f.hidden = done >= 1;
    });
    $$(".rate-btn").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.feel === r.feel)));
    const note = $("#rate-note");
    if (note) {
      note.textContent = r.result
        ? tt("rate.saved", { score: VTMetrics.formatScore(r.result) })
        : tt("rate.hint");
    }
    const kicker = $("#rate-done");
    if (kicker) {
      kicker.hidden = !r.end;
      kicker.textContent = r.end
        ? `${tt("stepDone.title")} ${tt(r.end === "mic" ? "stepDone.micOff" : "stepDone.timeUp")}`
        : "";
    }
    const skip = $("#btn-rate-skip");
    if (skip) {
      skip.hidden = !!state.sessionPractice.saved;
      skip.textContent = tt(state.structured ? "rate.skipNext" : "rate.skip");
    }
  }

  /**
   * Inside a routine the rating card carries the way on (Seguir sin puntuar,
   * then the score card's next step); the big "Siguiente ejercicio" under it
   * outshone the answers and read as a second way out. Other specs still
   * find it under automation.
   */
  function syncRoutineNav() {
    const nav = $("#structured-nav");
    if (nav) nav.hidden = !state.structured || (!!state.metricsOpen && !rateQuiet());
  }

  /**
   * Bring the rating card into view, its top no lower than 45% of the screen
   * and never under the sticky header: the whole card when it fits, else down
   * to the take and its save, else the question and its answers (a phone on
   * its side). An open "Más detalles" form is never measured; it may run past
   * the fold.
   */
  function revealRating() {
    requestAnimationFrame(() => {
      const card = $("#metrics-card");
      if (!card || card.classList.contains("collapsed")) return;
      const root = getComputedStyle(document.documentElement);
      const top =
        (parseFloat(root.getPropertyValue("--header-h")) || 0) +
        (parseFloat(root.getPropertyValue("--ex-chrome-h")) || 0) +
        8;
      const vh = window.innerHeight || 600;
      const r = card.getBoundingClientRect();
      const take = $("#playback-area");
      const ends = [
        $("#rate-more")?.open ? null : $("#rate"),
        take?.childElementCount ? take : null,
        $("#rate-note")
      ].filter(Boolean);
      let want = top;
      for (const el of ends) {
        want = Math.min(vh * 0.45, vh - (el.getBoundingClientRect().bottom - r.top) - 24);
        if (want >= top) break;
      }
      const delta = r.top - Math.max(top, want);
      if (Math.abs(delta) > 12) window.scrollBy({ top: delta, behavior: scrollBehavior() });
    });
  }

  /** After a save, scroll just far enough that the score itself is in view. */
  function revealScore() {
    requestAnimationFrame(() => {
      const big = $("#score-result .score-big");
      if (!big) return;
      const vh = window.innerHeight || 600;
      const b = big.getBoundingClientRect();
      const over = b.bottom + 56 - vh;
      if (over > 0) window.scrollBy({ top: over, behavior: scrollBehavior() });
    });
  }

  /**
   * One tap: set the self-rated sliders (not the ones a mode measured) and
   * save through the same path as the form. Tapping another answer later
   * re-rates the same take.
   * @param {"easy"|"ok"|"hard"} feel
   */
  function rateFeel(feel) {
    const v = FEEL[feel];
    if (!v || !state.exercise) return;
    $$('#metrics-form input[type="range"]').forEach((input) => {
      if (input.dataset.measured === "1") return;
      input.value = String(v);
      input.dispatchEvent(new Event("input"));
    });
    completeExercise({ feel });
  }

  /**
   * "Salir sin puntuar": the practice is kept (VG-27), only the rating is
   * skipped. In a routine it goes on to the next step.
   */
  function leaveUnrated() {
    if (state.structured) {
      advanceStructured("next");
      return;
    }
    const pending = state.pendingLeave;
    const dest = pending?.type && pending.type !== "next" ? pending : { type: "home" };
    state.pendingLeave = null;
    recordPracticeIfDue("leave");
    resetSessionPractice();
    leaveExercise(dest);
  }

  /**
   * A single exercise's clock reached 00:00: the practice is recorded and the
   * mic is off (tickTimer); say so and ask how it went. It used to keep
   * listening, "En vivo", with nothing on screen.
   * @param {boolean} micWasOn
   * @returns {boolean} true when the card is showing
   */
  function showExerciseEnd(micWasOn) {
    if (rateQuiet()) return false;
    openMetricsPanel(true, { focus: true, end: micWasOn ? "mic" : "time" });
    return true;
  }

  /**
   * The take's recording, in the rating card: the stage-below strip it used to
   * sit in is covered by the sticky stage, so its player and Save could not be
   * reached. A recording means a take just ended, so the card opens (quietly:
   * the stop that made it decides whether to scroll).
   */
  function showPlayback(result) {
    const area = $("#playback-area");
    if (!area || !result) return;
    area.innerHTML = `
      <p class="rate-take-k" id="rate-take-k">${escapeHtml(tt("rate.take"))}</p>
      <audio class="audio-player" controls aria-labelledby="rate-take-k" src="${result.url}"></audio>
      <div class="controls-row rate-take-actions">
        <button type="button" class="btn btn-sm btn-success" id="btn-save-rec">${escapeHtml(tt("rate.takeSave"))}</button>
        <button type="button" class="btn btn-sm btn-ghost" id="btn-discard-rec">${escapeHtml(tt("rate.takeDiscard"))}</button>
      </div>
    `;
    const save = $("#btn-save-rec");
    save?.addEventListener("click", async () => {
      try {
        await VTStorage.saveRecording({
          exerciseId: state.exercise.id,
          blob: result.blob,
          label: `${state.exercise.title} · ${new Date().toLocaleString()}`,
          meta: { durationMs: result.durationMs }
        });
        save.textContent = tt("rate.takeSaved");
        save.disabled = true;
        toast(tt("toast.recordingSaved"));
      } catch (e) {
        console.error(e);
        toast(tt("toast.recordingFail"));
      }
    });
    $("#btn-discard-rec")?.addEventListener("click", () => {
      state.recorder.clear();
      area.innerHTML = "";
    });
    if (!state.metricsOpen) openMetricsPanel(true, { reveal: false });
  }

  function updatePitchStatsLabel(stats) {
    const el = $("#pitch-stats");
    if (!el) return;
    // U12: never show residual pitch footer on non-pitch exercises
    const pitchProfile = state.exercise ? getProfile(state.exercise) : null;
    if (!pitchProfile?.showPitch && !state.exercise?.audio?.pitchViz) {
      el.innerHTML = "";
      el.hidden = true;
      return;
    }
    el.hidden = false;
    if (!stats) return;
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
      maxHold: "Mejor sostenido (s)",
      maxS: "S pareja más larga (s)",
      maxSH: "SH pareja más larga (s)",
      rungs: "Peldaños de escalera superados",
      evenness: "Uniformidad del aire",
      roots: "Tónicas completadas",
      intonation: "Afinación",
      closure: "Calidad de cierre",
      air: "Dosificación de aire",
      breathiness: "Claridad del tono (5 = limpio)",
      reps: "Repeticiones",
      repsFeel: "Reps frase completa (canción A)",
      repsBetter: "Reps frase completa (canción B)",
      phraseBreath: "Frase sin respirar a mitad",
      pitchComfort: "Comodidad de tono",
      accuracy: "Exactitud",
      precision: "Precisión (estabilidad)",
      progressions: "Progresiones",
      sirens: "Sirenas",
      smoothness: "Suavidad",
      questions: "Preguntas practicadas",
      pauseBefore: "Pausa antes de responder",
      landed: "Aterrizajes limpios",
      transfer: "Paso a vocal /A/",
      transferA: "Paso a /A/",
      targets: "Notas tarareadas",
      buzz: "Zumbido adelante",
      matches: "Emparejamientos sólidos",
      minutes: "Minutos con pajita",
      steadiness: "Estabilidad del aire",
      swells: "Crescendos hechos",
      dynamicControl: "Control dinámico",
      easyOnsets: "Ataques suaves",
      balance: "Equilibrio del ataque",
      staccatoEase: "Facilidad staccato",
      legatoLine: "Línea legato",
      pitchStable: "Estabilidad de tono",
      intervalAccuracy: "Precisión de intervalos",
      rounds: "Rondas de contraste",
      animation: "Animación facial",
      authenticity: "Autenticidad",
      calibration: "Calibración",
      congruence: "Congruencia cuerpo-palabra",
      concision: "Concisión",
      flexibility: "Flexibilidad de energía",
      impact: "Impacto",
      noTag: "Sin coletillas (¿sabes?)",
      purposeful: "Gestos con propósito",
      stillness: "Calma entre gestos",
      structure: "Estructura (inicio-pico-cierre)",
      peakClarity: "Claridad en el pico",
      paceCraft: "Oficio del ritmo",
      warmth: "Calidez"
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
        // Filled from the clock when the take was timed (paintRating).
        if (VTMetrics.isTimeMetric(m)) field.classList.add("field-time");
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

  /**
   * Save this take with its rating and show the score.
   * @param {{ feel?: "easy"|"ok"|"hard" }} [opts] feel: the one-tap answer
   *   (rateFeel), shown on the score card; absent for "Guardar con estos detalles"
   */
  function completeExercise(opts = {}) {
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
    // Minutes left blank are scored from the take's own time, against the
    // step's own length when it had a timer: a 1:30 guided step used to be
    // measured against the catalog's 5 minutes.
    const take = takeTimes();
    const result = VTMetrics.compute(ex.metrics, values, { timeSec: take.done, targetSec: take.total });
    // Stored as whole minutes, as before, so History and the Plan read it unchanged.
    (ex.metrics || []).filter((m) => VTMetrics.isTimeMetric(m)).forEach((m) => {
      if (!(Number(values[m.id]) > 0) && take.done > 0) {
        values[m.id] = String(Math.max(1, Math.round(take.done / 60)));
      }
    });
    const elapsed =
      practicedSec > 0
        ? practicedSec
        : state.timer.total > 0
          ? state.timer.total - state.timer.remaining
          : 0;

    // A take this open already recorded automatically is the same take: rate
    // it in place rather than adding a second one.
    const sp = state.sessionPractice;
    const wasSaved = !!sp.saved;
    // Progress compare (before/after emotion — r/singing "same song later").
    // A changed answer compares with the score before this take, not with itself.
    const prevScore = wasSaved ? state.rate.prevScore : VTStorage.getProgress()?.[ex.id]?.lastScore;
    const insertedNow = !sp.entryId;
    const savedEntry = VTStorage.saveExerciseResult(ex.id, {
      replaceId: sp.entryId,
      metrics: values,
      score: result.score,
      notes,
      durationSec: elapsed
    });
    const elapsedSec = Math.max(0, Math.round(Number(elapsed) || 0));
    const dayRec = window.VTDays?.record?.({
      exerciseId: ex.id,
      sec: Math.max(0, elapsedSec - (sp.creditedSec || 0)),
      saved: true,
      bump: insertedNow,
      source: "save"
    });
    sp.entryId = savedEntry.id;
    sp.creditedSec = Math.max(sp.creditedSec || 0, elapsedSec);
    // Ask for a sync rather than doing one: the scheduler collapses a whole
    // practice session's saves into a single write.
    window.VTSync?.schedule?.();
    const sessionsAfter = totalSessionsSaved();
    // First *rated* take: automatically kept steps are practice, but the
    // first-win card is about the first time somebody reviewed their own work.
    // A changed answer keeps the card its first save showed.
    const isFirstWin = wasSaved ? state.rate.firstWin : ratedSessionsSaved() === 1;
    window.VTLoop?.onPractice?.({
      exerciseId: ex.id,
      source: "save",
      day: dayRec,
      structured: !!state.structured
    });
    // One take is one save: a changed answer re-rates it without counting it again.
    try {
      if (!wasSaved) {
        window.VTAnalytics?.track?.("session_save", {
          exerciseId: ex.id,
          score: result.score,
          durationSec: elapsed,
          firstWin: isFirstWin,
          feel: opts.feel || "details"
        });
        if (isFirstWin) window.VTAnalytics?.track?.("first_win", { exerciseId: ex.id });
      }
    } catch {
      /* ignore */
    }
    renderValuePulse();
    // Success → soft moment (first_win prioritized via sessions===1). Never in
    // the middle of a guided routine: the reward there is the next step.
    if (!state.structured && !wasSaved) {
      setTimeout(() => showValueMoment(isFirstWin ? "first_save" : undefined), 600);
    }

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
    // Inside a guided routine the next thing is the routine's next step; the
    // generic suggestion used to hijack it with an unrelated exercise opened
    // outside the session (no Next button, the wrong timer).
    const sessionNow = state.structured ? VTSession.get() : null;
    const routineNextId =
      sessionNow && VTSession.currentExerciseId() === ex.id
        ? sessionNow.order[sessionNow.index + 1] || null
        : sessionNow
          ? VTSession.currentExerciseId()
          : null;
    const routineNextEx = routineNextId ? findExercise(routineNextId) : null;
    const nextSug = state.structured
      ? routineNextEx
        ? { ex: routineNextEx, reason: "structured" }
        : null
      : suggestNextExercise({ excludeId: ex.id });
    const nextName = nextSug?.ex
      ? (window.VTI18n ? VTI18n.exTitle(nextSug.ex) : nextSug.ex.title)
      : "";
    const routineHtml = state.structured
      ? `<div class="first-win-card" id="post-session-next">
          <h4>${escapeHtml(tt(routineNextEx ? "loop.routineNextTitle" : "loop.routineLastTitle"))}</h4>
          <div class="first-win-actions">
            <button type="button" class="btn btn-primary btn-sm" id="ps-routine-next">${escapeHtml(
              routineNextEx ? `${tt("home.nextStepCta")}: ${nextName}` : tt("loop.routineFinish")
            )}</button>
          </div>
        </div>`
      : "";
    const firstWinHtml = state.structured
      ? routineHtml
      : isFirstWin
      ? `<div class="first-win-card" id="first-win-card">
          <h4>${tt("retain.firstWinTitle")}</h4>
          <p>${tt("retain.firstWinBody")}</p>
          <div class="first-win-actions">
            <button type="button" class="btn btn-primary btn-sm" id="fw-micro">${tt("retain.firstWinMicro")}</button>
            <button type="button" class="btn btn-sm" id="fw-remind">${tt("retain.firstWinRemind")}</button>
            <button type="button" class="btn btn-sm" id="fw-same">${tt("retain.firstWinSame")}</button>
            ${
              nextSug?.ex
                ? `<button type="button" class="btn btn-ghost btn-sm" id="fw-next">${tt("retain.firstWinNext")}: ${nextName}</button>`
                : ""
            }
          </div>
        </div>`
      : nextSug?.ex
        ? `<div class="first-win-card" id="post-session-next">
            <h4>${tt("home.nextStepLabel")}</h4>
            <p class="muted">${tt("home.nextStepWhy")}</p>
            <div class="first-win-actions">
              <button type="button" class="btn btn-primary btn-sm" id="ps-next">${tt("home.nextStepCta")}: ${nextName}</button>
              <button type="button" class="btn btn-sm" id="ps-same">${tt("retain.firstWinSame")}</button>
            </div>
          </div>`
        : "";
    const feelHtml = FEEL[opts.feel]
      ? `<p class="score-feel">${escapeHtml(tt("rate.feel", { feel: tt(`rate.${opts.feel}`) }))}</p>`
      : "";
    box.innerHTML = `
      <div class="score-big">${VTMetrics.formatScore(result)}</div>
      ${feelHtml}
      ${compareHtml}
      <p>${result.summary}</p>
      <p class="muted" style="font-size:0.85rem;">${result.how}</p>
      <ul class="breakdown">
        ${result.breakdown
          .map((b) => {
            // The same localized label the form used; b.label is the English one.
            const def = (ex.metrics || []).find((m) => m.id === b.id) || b;
            // A count left blank is not scored: "—", not 0/5.
            const pts = b.skipped ? "—" : `${b.points}/${b.max}`;
            return `<li><span>${metricLabel(def)}<br><small class="muted">${b.detail}</small></span><strong>${pts}</strong></li>`;
          })
          .join("")}
      </ul>
      <div class="encourage">${tt("toast.sessionEncourage")}</div>
      ${firstWinHtml}
    `;

    // Wire first-win / next-step CTAs (habit loop — kind only)
    $("#fw-micro")?.addEventListener("click", () => {
      try {
        window.VTAnalytics?.track?.("first_win_micro");
      } catch {
        /* ignore */
      }
      state.pendingMicro = true;
      openExercise(ex.id, false);
    });
    $("#fw-remind")?.addEventListener("click", () => {
      setView("home");
      const chk = $("#chk-reminders");
      if (chk && !chk.checked) {
        chk.checked = true;
        chk.dispatchEvent(new Event("change", { bubbles: true }));
      }
      $("#retain-panel")?.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
      toast(tt("retain.firstWinRemind"));
    });
    $("#fw-same")?.addEventListener("click", () => openExercise(ex.id, false));
    $("#fw-next")?.addEventListener("click", () => {
      if (nextSug?.ex) openExercise(nextSug.ex.id, false);
    });
    $("#ps-next")?.addEventListener("click", () => {
      if (nextSug?.ex) openExercise(nextSug.ex.id, false);
    });
    $("#ps-same")?.addEventListener("click", () => openExercise(ex.id, false));
    $("#ps-routine-next")?.addEventListener("click", () => advanceStructured("next"));

    toast(tt("toast.sessionSaved"));
    Object.assign(state.rate, { feel: opts.feel || null, result, prevScore, firstWin: isFirstWin });
    paintRating();
    revealScore();

    // Post-session native tip (free only; never mid-practice) — research: end-of-task ads only
    if (!wasSaved) {
      try {
        setTimeout(() => window.VTAds?.onPostSession?.(), 700);
      } catch {
        /* ignore */
      }
    }

    // Advance past this step once — a second Save used to skip the next step
    // without it ever being opened.
    if (state.structured && !wasSaved && VTSession.currentExerciseId() === ex.id) {
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
    syncStageNow();
    if (left <= 0) {
      stopTimer(true);
      // The clearest "done" there is: the step ran its full length.
      recordPracticeIfDue("timer_done");
      // The time is up, so stop listening: at 00:00 it used to stay "En vivo"
      // with the mic open and nothing on screen changed (PR-1).
      const micWasOn = !!state.practice?.running;
      stopPractice(true);
      // A guided step says so on the stage; a single exercise asks how it went.
      if (state.structured ? showStepDone(micWasOn) : showExerciseEnd(micWasOn)) return;
      toast(tt("toast.timerDone"));
    }
  }

  /* —— Step done (guided sessions) —— */
  const STEP_MORE_SEC = 30;

  /** Muted under automation like the loop's done card; specs that test it opt in. */
  function stepDoneQuiet() {
    try {
      return sessionStorage.getItem("vt_e2e") === "1" && sessionStorage.getItem("vt_stepdone_e2e") !== "1";
    } catch {
      return false;
    }
  }

  /** Fill the card for the open step. False when there is no guided step to finish. */
  function renderStepDone() {
    const s = state.structured ? VTSession.get() : null;
    const ex = state.exercise;
    if (!s || !ex || !s.order?.length) return false;
    // A Save already moved the session past this step; the next one is then
    // the current one (as in the score card's routine button).
    const open = VTSession.currentExerciseId() === ex.id;
    const n = Math.max(1, Math.min(open ? s.index + 1 : s.index, s.order.length));
    const nextId = open ? s.order[s.index + 1] || null : VTSession.currentExerciseId();
    const nextEx = nextId ? findExercise(nextId) : null;
    $("#step-done-step").textContent = tt("session.progress", { n, total: s.order.length });
    $("#step-done-sub").textContent = tt(state.stepDoneMic ? "stepDone.micOff" : "stepDone.timeUp");
    $("#btn-step-done-next").textContent = nextEx
      ? tt("stepDone.next", { name: window.VTI18n ? VTI18n.exTitle(nextEx) : nextEx.title })
      : tt("loop.routineFinish");
    $("#btn-step-done-more").textContent = tt("stepDone.more", { n: STEP_MORE_SEC });
    return true;
  }

  /**
   * Cover the stage with "done" and the way on: one button that does what
   * #btn-next-structured does, plus more time and the rating form.
   * @param {boolean} micWasOn the step was listening when its clock ran out
   * @returns {boolean} true when the card is showing
   */
  function showStepDone(micWasOn) {
    const box = $("#step-done");
    if (!box || stepDoneQuiet()) return false;
    state.stepDoneMic = !!micWasOn;
    if (!renderStepDone()) return false;
    hideMicBlocked();
    // On a short landscape screen the sticky title row can cover the top of
    // the stage; centre the card in the part still in view.
    const chrome = document.querySelector(".exercise-header-compact") || document.querySelector("header.app-header");
    const sr = $("#highway-stage").getBoundingClientRect();
    const covered = Math.min(sr.height / 2, chrome ? chrome.getBoundingClientRect().bottom - sr.top : 0);
    box.style.paddingTop = covered > 2 ? `calc(1rem + ${Math.round(covered)}px)` : "";
    box.hidden = false;
    // Focus the way on, unless the learner is typing (a note in the rating form).
    const a = document.activeElement;
    if (!(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName))) $("#btn-step-done-next")?.focus();
    try {
      window.VTAnalytics?.track?.("step_done_shown", { exerciseId: state.exercise?.id, mic: !!micWasOn });
    } catch {
      /* ignore */
    }
    return true;
  }

  /** @param {boolean} [returnFocus] put focus back on Start (Escape) */
  function hideStepDone(returnFocus) {
    const box = $("#step-done");
    if (!box || box.hidden) return;
    const hadFocus = box.contains(document.activeElement);
    box.hidden = true;
    if (returnFocus && hadFocus) $("#btn-practice-start")?.focus();
  }

  function stepDoneChoice(choice) {
    try {
      window.VTAnalytics?.track?.("step_done_choice", { exerciseId: state.exercise?.id, choice });
    } catch {
      /* ignore */
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
      toast(tt("toast.holdLogged", { s: String(sec) }));
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
      toast(tt("toast.recording"));
    } catch (e) {
      console.error(e);
      toast(tt("toast.micRecordNeed"));
    }
  }

  async function stopRecording() {
    const result = await state.recorder.stop();
    $("#btn-rec-start").disabled = false;
    $("#btn-rec-stop").disabled = true;
    $("#level-fill").style.width = "0%";
    if (!result) return;
    showPlayback(result);
    openMetricsPanel(true);
  }

  /* —— History —— */

  /** The track History and the Plan speak to: the one picked on home. */
  function pageTrack() {
    return state.tab === "vocal" ? "vocal" : "singing";
  }

  /** Loop copy for a track ("días cantados" / "días de práctica"), see js/daily-loop.js. */
  function trackText(key, vars, track) {
    return window.VTLoop?.tl ? VTLoop.tl(key, vars, track) : tt(key, vars);
  }

  /** How long ago, in words: "hoy", "ayer", "hace 3 días", then a date. */
  function relativeDay(iso) {
    const D = window.VTDays;
    const d = new Date(iso);
    if (!D || !Number.isFinite(d.getTime())) return "";
    const n = Math.max(0, D.diffDays(D.dayKey(d), D.dayKey()));
    if (n < 7 && typeof Intl.RelativeTimeFormat === "function") {
      return new Intl.RelativeTimeFormat(locale(), { numeric: "auto" }).format(-n, "day");
    }
    const opts = { day: "numeric", month: "short" };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = "numeric";
    return d.toLocaleDateString(locale(), opts);
  }

  /** The months a span of days covers, as a caption: "agosto–setiembre de 2026". */
  function monthRangeLabel(a, b) {
    try {
      const f = new Intl.DateTimeFormat(locale(), { month: "long", year: "numeric" });
      return typeof f.formatRange === "function" ? f.formatRange(a, b) : `${f.format(a)} – ${f.format(b)}`;
    } catch {
      return "";
    }
  }

  /**
   * A row that opens an exercise: the Plan's exercises and History's recent
   * list. The whole row is the button; "Abrir →" says what it does (a ▶ read
   * as "play a recording").
   */
  function openRowHtml(ex, meta, cls = "") {
    // Each part of the meta stays on one line ("último puntaje 7/10" never splits).
    const parts = meta
      .filter(Boolean)
      .map((m) => `<span>${escapeHtml(m)}</span>`)
      .join(" · ");
    return `<button type="button" class="open-row${cls ? " " + cls : ""}" data-open-ex="${escapeHtml(ex.id)}">
        <span class="open-row-text"><strong>${escapeHtml(exName(ex))}</strong><span class="meta">${parts}</span></span>
        <span class="open-row-go" aria-hidden="true">${escapeHtml(tt("history.open"))} →</span>
      </button>`;
  }

  /**
   * The days practised: how many in the last five weeks, and those weeks as a
   * Monday-first calendar with today outlined. Empty until there is a day.
   */
  function historyDaysHtml(track) {
    const D = window.VTDays;
    if (!D?.span) return "";
    const sum = D.summary();
    if (!sum.practiceDays) return "";
    const monday = D.weekStart(sum.today);
    const from = D.addDays(monday, -28);
    const days = D.span(from, D.addDays(monday, 6));
    const n = days.filter((d) => d.state === "done").length;
    const names = tt("loop.weekdayFull").split(",");
    const head = tt("loop.weekLetters")
      .split(",")
      .map(
        (l, i) =>
          `<th scope="col"><span aria-hidden="true">${escapeHtml(l.trim())}</span><span class="sr-only">${escapeHtml((names[i] || "").trim())}</span></th>`
      )
      .join("");
    let rows = "";
    for (let w = 0; w < 5; w += 1) {
      rows += "<tr>";
      for (let i = 0; i < 7; i += 1) {
        const d = days[w * 7 + i];
        if (!d || d.state === "future") {
          rows += `<td class="is-future"></td>`;
          continue;
        }
        // Practised and rest days carry a mark as well as a colour.
        const mark = d.state === "done" ? "✓" : d.state === "rest" ? "☾" : "";
        const label = d.state === "missed" ? "" : trackText("loop.dayState." + d.state, null, track);
        rows += `<td class="is-${d.state}${d.isToday ? " is-today" : ""}">${Number(d.key.slice(8))}${
          mark ? `<span class="hist-mark" aria-hidden="true">${mark}</span>` : ""
        }${label ? `<span class="sr-only">: ${escapeHtml(label)}</span>` : ""}</td>`;
      }
      rows += "</tr>";
    }
    const first = sum.firstDay ? D.parseDay(sum.firstDay) : null;
    const firstLabel = first
      ? first.toLocaleDateString(locale(), {
          day: "numeric",
          month: "long",
          ...(first.getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {})
        })
      : "";
    const total =
      sum.practiceDays > n && firstLabel
        ? `<p class="muted hist-total">${escapeHtml(tt("history.daysTotal", { n: sum.practiceDays, date: firstLabel }))}</p>`
        : "";
    const legend = days.some((d) => d.state === "rest")
      ? `<p class="muted hist-legend">✓ ${escapeHtml(trackText("loop.day1", null, track))} · ☾ ${escapeHtml(tt("loop.dayState.rest"))}</p>`
      : "";
    return `<section class="hist-days" aria-labelledby="hist-days-count">
        <h3 class="hist-count" id="hist-days-count"><strong>${n}</strong> ${escapeHtml(
          n === 1 ? trackText("loop.day1", null, track) : trackText("loop.days", null, track)
        )} <span class="hist-period">${escapeHtml(tt("history.daysPeriod"))}</span></h3>
        ${total}
        <table class="hist-cal">
          <caption>${escapeHtml(monthRangeLabel(D.parseDay(from), D.parseDay(sum.today)))}</caption>
          <thead><tr>${head}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${legend}
      </section>`;
  }

  /** ["hoy", "3 veces", "último puntaje 7/10"] */
  function historyRowMeta(p) {
    const n = Number(p.completedCount) || 0;
    const parts = [p.lastAt ? relativeDay(p.lastAt) : ""];
    if (n) parts.push(n === 1 ? tt("history.times1") : tt("history.timesN", { n }));
    if (p.lastScore != null && Number.isFinite(Number(p.lastScore))) {
      const score = Number(p.lastScore).toLocaleString(locale(), { maximumFractionDigits: 1 });
      parts.push(tt("history.lastScore", { score: `${score}/10` }));
    }
    return parts;
  }

  async function renderHistory() {
    setView("history");
    const list = $("#history-list");
    const loading = document.createElement("p");
    loading.className = "muted";
    loading.textContent = tt("history.loading");
    list.replaceChildren(loading);
    try {
      const recs = await VTStorage.listRecordings();
      const progress = VTStorage.getProgress();
      const reviews = VTStorage.getReviews();
      const track = pageTrack();

      // Most recent first. An exercise that has left the catalogue cannot be
      // opened again, and its id is not a name, so it is left out.
      const recent = Object.entries(progress)
        .map(([id, p]) => ({ ex: findExercise(id), p }))
        .filter((r) => r.ex && r.p)
        .sort((a, b) => String(b.p.lastAt || "").localeCompare(String(a.p.lastAt || "")));
      const daysHtml = historyDaysHtml(track);

      let html = "";
      if (!daysHtml && !recent.length) {
        html += `<p class="muted">${tt("history.noSessions")}</p>
          <p><button type="button" class="btn btn-practice btn-sm" id="history-empty-cta">${tt("history.emptyCta")}</button></p>`;
      } else {
        html += `<div class="hist-top">${daysHtml}`;
        if (recent.length) {
          html += `<section class="hist-recent" aria-labelledby="hist-recent-h">
            <h3 id="hist-recent-h">${tt("history.recent")}</h3>
            <div class="history-list">${recent.map((r) => openRowHtml(r.ex, historyRowMeta(r.p), "history-item")).join("")}</div>
          </section>`;
        }
        html += `</div>`;
      }

      if (recs.length) {
        html += `<h3 style="margin-top:1.5rem;">${tt("history.recordings")}</h3>`;
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
                <div class="meta">${ex ? exName(ex) : r.exerciseId} · ${new Date(r.createdAt).toLocaleString(locale())} · ${Math.round((r.size || 0) / 1024)} KB</div>
              </div>
              <div class="controls-row">
                <button type="button" class="btn btn-sm" data-play="${r.id}">${tt("history.play")}</button>
                <button type="button" class="btn btn-sm btn-danger" data-del="${r.id}">${tt("history.delete")}</button>
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
              <div><strong>${ex ? exName(ex) : exId}</strong>
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

      if (reviews.length) {
        html += `<h3 style="margin-top:1.5rem;">${tt("history.reviews")}</h3>
          <div class="history-list">${reviews.slice(0, 12).map(planReviewRow).join("")}</div>`;
      }

      // No recordings: one quiet line at the end, not an empty block on top.
      if (!recs.length && (daysHtml || recent.length)) {
        html += `<p class="muted hist-rec-empty">${tt("history.noRecordings")}</p>`;
      }

      list.innerHTML = html;

      $$("[data-open-ex]", list).forEach((btn) => {
        btn.addEventListener("click", () => openExercise(btn.dataset.openEx));
      });

      $$("[data-play]", list).forEach((btn) => {
        btn.addEventListener("click", async () => {
          const blob = await VTStorage.getRecordingBlob(btn.dataset.play);
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const player = $("#history-player");
          // Object URL only — escape if ever concatenated with user text
          player.replaceChildren();
          const audio = document.createElement("audio");
          audio.className = "audio-player";
          audio.controls = true;
          audio.autoplay = true;
          audio.src = url;
          player.appendChild(audio);
        });
      });
      $("#history-empty-cta", list)?.addEventListener("click", () => {
        setView("home");
        continuePractice();
      });
      $$("[data-del]", list).forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm(tt("history.confirmDelete"))) return;
          await VTStorage.deleteRecording(btn.dataset.del);
          renderHistory();
          toast(tt("toast.deleted"));
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
      list.innerHTML = `<p class="muted">${tt("history.loadError")}</p>`;
    }
  }

  /* —— 12-week plan —— */

  /**
   * Display label for a week element. The stored value stays the English key so
   * plans saved before this change keep working; only the label is localized.
   */
  function weekElementLabel(el) {
    if (!el) return "—";
    const slug = String(el)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const key = `plan.el.${slug}`;
    const out = tt(key);
    return out === key ? el : out;
  }

  /** A review's stored verdict ("improved" / "continue"), in the interface language. */
  function planVerdictLabel(verdict) {
    const key = `plan.verdict.${verdict}`;
    const out = tt(key);
    return out === key ? String(verdict || "") : out;
  }

  /** One saved week review, on the Plan and in History. */
  function planReviewRow(r) {
    const when = r.at ? new Date(r.at).toLocaleDateString(locale()) : "";
    const meta = [planVerdictLabel(r.verdict), when, r.notes].filter(Boolean).join(" · ");
    return `<div class="history-item"><div><strong>${escapeHtml(tt("plan.weekN", { n: r.week ?? r.weekNumber ?? "" }))}: ${escapeHtml(
      weekElementLabel(r.element)
    )}</strong><div class="meta">${escapeHtml(meta)}</div></div></div>`;
  }

  /** "Ver otros" stays open across the re-render a pick causes. */
  let planShowAllElements = false;

  /** The exercises that train an element: this track's, or the other's when it has none. */
  function planExercisesFor(el, track) {
    const m = window.VT_WEEK_ELEMENT_EXERCISES?.[el];
    if (!m) return [];
    const ids = m[track]?.length ? m[track] : m[track === "vocal" ? "singing" : "vocal"] || [];
    return ids.map(findExercise).filter(Boolean);
  }

  /** Local day the plan's week started, or null before it has. */
  function planStartDay(plan) {
    if (plan.status === "idle" || !plan.startedAt) return null;
    return window.VTDays?.dayKey?.(new Date(plan.startedAt)) || null;
  }

  /** Days practised in the plan's week, counted from the practice-day ledger. */
  function planWeekDays(plan) {
    const D = window.VTDays;
    const start = planStartDay(plan);
    if (!start || !D?.countDays) return 0;
    return D.countDays(start, D.addDays(start, 6));
  }

  function renderPlan() {
    setView("plan");
    const plan = VTStorage.getWeekPlan();
    const track = pageTrack();
    const idle = plan.status === "idle";
    renderPlanWeekRail(plan);
    $("#plan-week-num").textContent = tt("plan.weekN", { n: plan.weekNumber });
    // Before the week starts, "Elige el elemento" and the start button say it all.
    const status = $("#plan-status");
    status.hidden = idle;
    status.textContent = idle
      ? ""
      : plan.status === "active"
        ? tt("plan.statusActive", { element: weekElementLabel(plan.element) })
        : tt("plan.statusReview", { element: weekElementLabel(plan.element) });

    renderPlanChips(plan, track);

    const exs = plan.element ? planExercisesFor(plan.element, track) : [];
    const exList = $("#plan-exercise-list");
    $("#plan-exercises").hidden = !exs.length;
    exList.innerHTML = exs
      .map((ex) => {
        // An exercise from the other track says which one it is.
        const other = ex.track !== track ? tt(ex.track === "vocal" ? "badge.vocal" : "badge.singing") : "";
        return openRowHtml(ex, [other, tt("plan.exMeta", { min: ex.durationMin })]);
      })
      .join("");
    $$("[data-open-ex]", exList).forEach((btn) => {
      btn.addEventListener("click", () => openPlanExercise(btn.dataset.openEx));
    });

    // Days are counted from practice, not logged by hand.
    const days = $("#plan-days");
    days.hidden = idle;
    days.textContent = idle ? "" : tt("plan.days", { n: planWeekDays(plan) });
    // Once the week is under way its exercises are the next step, not this button.
    $("#plan-start-row").hidden = !idle;

    renderPlanReview(plan);
  }

  /**
   * Focus chips: the current track's first, the rest behind "Ver otros N".
   * The picked chip says so with a check mark and aria-pressed, not colour.
   */
  function renderPlanChips(plan, track) {
    const first = (window.VT_WEEK_ELEMENTS_FIRST?.[track] || []).filter((el) => VT_WEEK_ELEMENTS.includes(el));
    const rest = VT_WEEK_ELEMENTS.filter((el) => !first.includes(el));
    const box = $("#element-chips");
    box.innerHTML = "";
    [...first, ...rest].forEach((el) => {
      const on = plan.element === el;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (on ? " selected" : "");
      b.setAttribute("aria-pressed", on ? "true" : "false");
      b.textContent = weekElementLabel(el);
      b.hidden = !planShowAllElements && !on && !first.includes(el);
      b.addEventListener("click", () => pickPlanElement(el));
      box.appendChild(b);
    });
    const more = $("#plan-focus-more");
    const extra = rest.filter((el) => el !== plan.element).length;
    more.hidden = !extra;
    more.setAttribute("aria-expanded", planShowAllElements ? "true" : "false");
    more.textContent = planShowAllElements ? tt("plan.less") : tt("plan.more", { n: extra });
  }

  function pickPlanElement(el) {
    const p = VTStorage.getWeekPlan();
    p.element = el;
    VTStorage.setWeekPlan(p);
    renderPlan();
    // The chips were rebuilt: keep keyboard focus on the one just picked.
    $("#element-chips .chip.selected")?.focus();
  }

  function togglePlanElements() {
    planShowAllElements = !planShowAllElements;
    renderPlanChips(VTStorage.getWeekPlan(), pageTrack());
  }

  /**
   * The review opens seven days after the week starts; until then the card
   * says when, instead of showing a form that cannot be used yet.
   */
  function renderPlanReview(plan) {
    const D = window.VTDays;
    const start = planStartDay(plan);
    const opensOn = start && D?.addDays ? D.addDays(start, 7) : null;
    const open =
      plan.status === "review" || (plan.status === "active" && (!opensOn || (D?.dayKey?.() || "") >= opensOn));
    const when = $("#plan-review-when");
    when.hidden = open;
    when.textContent = open
      ? ""
      : opensOn
        ? tt("plan.reviewOpensOn", {
            date: D.parseDay(opensOn).toLocaleDateString(locale(), { weekday: "long", day: "numeric", month: "long" })
          })
        : tt("plan.reviewWaiting");
    $("#plan-review-body").hidden = !open;

    const improved = plan.completedElements || [];
    $("#plan-completed-wrap").hidden = !improved.length;
    $("#plan-completed-elements").innerHTML = improved
      .map((e) => `<span class="pill">${escapeHtml(weekElementLabel(e))}</span>`)
      .join(" ");

    const reviews = (plan.reviews || []).slice(0, 8);
    $("#plan-reviews-card").hidden = !reviews.length;
    $("#plan-reviews").innerHTML = reviews.map(planReviewRow).join("");
  }

  /**
   * Twelve-week rail: a progress strip (done, this week, still to come), drawn
   * so it does not read as twelve buttons and never wraps a lone week.
   */
  function renderPlanWeekRail(plan) {
    const rail = $("#plan-week-rail");
    if (!rail) return;
    const current = Number(plan.weekNumber) || 1;
    const done = (plan.reviews || []).length;
    rail.innerHTML = "";
    for (let w = 1; w <= 12; w += 1) {
      const li = document.createElement("li");
      const stateCls = w < current || w <= done ? "done" : w === current ? "current" : "todo";
      li.className = `plan-week-dot ${stateCls}`;
      li.textContent = String(w);
      rail.appendChild(li);
    }
  }

  /** Start the plan's week (status and start date); the element is already picked. */
  function beginPlanWeek(plan) {
    plan.status = "active";
    plan.startedAt = plan.startedAt || new Date().toISOString();
    VTStorage.setWeekPlan(plan);
    toast(tt("toast.weekStarted", { n: String(plan.weekNumber), element: weekElementLabel(plan.element) }));
  }

  function startWeekPlan() {
    const plan = VTStorage.getWeekPlan();
    if (!plan.element) {
      toast(tt("toast.pickElement"));
      return;
    }
    beginPlanWeek(plan);
    renderPlan();
    // The start button is gone now; the week's first exercise is the next step.
    $("#plan-exercise-list [data-open-ex]")?.focus();
  }

  /** Opening one of the week's exercises starts the week if it has not started. */
  function openPlanExercise(id) {
    const plan = VTStorage.getWeekPlan();
    if (plan.status === "idle" && plan.element) beginPlanWeek(plan);
    openExercise(id);
  }

  function submitWeekReview(improved) {
    const plan = VTStorage.getWeekPlan();
    if (!plan.element) {
      toast(tt("toast.pickElement"));
      return;
    }
    // Reviewing a week that never started would advance weekNumber for nothing
    if (plan.status === "idle") {
      toast(tt("toast.startWeekFirst"));
      return;
    }
    const notes = $("#plan-review-notes")?.value || "";
    const review = {
      week: plan.weekNumber,
      element: plan.element,
      verdict: improved ? "improved" : "continue",
      notes,
      at: new Date().toISOString(),
      // Days practised that week: hand-logged check-ins before, the ledger now.
      checkInCount: Math.max((plan.checkIns || []).length, planWeekDays(plan))
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
      toast(tt("toast.elementImproved"));
    } else {
      plan.weekNumber += 1;
      plan.status = "active";
      plan.checkIns = [];
      plan.startedAt = new Date().toISOString();
      toast(tt("toast.elementContinue"));
    }
    VTStorage.setWeekPlan(plan);
    if ($("#plan-review-notes")) $("#plan-review-notes").value = "";
    renderPlan();
  }

  /* —— Structured session —— */
  /**
   * @param {string} [path] basic | advanced | full | daily | basics
   * @param {{ order?: string[], sec?: Object<string, number>, tier?: string, label?: string }} [routine]
   *   a prepared sequence (today's basics) instead of a catalog route
   */
  function startStructured(path, routine) {
    const p = path || $("#session-path")?.value || "basic";
    const session = VTSession.start(state.tab, p, routine);
    updateSessionBanner();
    const id = VTSession.currentExerciseId();
    if (id) openExercise(id, true);
    if (routine?.order) {
      toast(tt("loop.startToast", { tier: routine.label || "", n: String(session.order.length) }));
      return session;
    }
    toast(
      tt("toast.structuredStart", {
        track: tt(state.tab === "vocal" ? "track.vocalShort" : "track.singingShort"),
        path: pathName(["advanced", "full", "daily"].includes(p) ? p : "basic"),
        n: String(session.order.length)
      })
    );
    return session;
  }

  function resumeStructured() {
    const s = VTSession.resume();
    updateSessionBanner();
    if (!s) return;
    if (s.status === "completed") {
      toast(tt("toast.sessionAlreadyDone"));
      return;
    }
    const id = VTSession.currentExerciseId();
    if (id) openExercise(id, true);
    else toast(tt("toast.noCurrentEx"));
  }

  function pauseStructured() {
    VTSession.pause();
    stopPractice(true);
    hideStepDone();
    pauseTimer();
    VTPiano.stopAll();
    updateSessionBanner();
    toast(tt("toast.sessionPaused"));
  }

  /**
   * Finish the current guided step and open the next one.
   *
   * Practice is kept automatically now (recordPracticeIfDue), so there is no
   * save-or-discard question between steps: rating stays available through
   * Save before Next, and a 17-step class no longer costs three presses a step.
   * The last step stops everything — it used to leave the mic, the piano loop
   * and the timer running on the home page.
   */
  function advanceStructured(source) {
    if (!state.structured || !state.exercise) return;
    const s = VTSession.get();
    if (!s) return;
    recordPracticeIfDue(source === "skip" ? "guided_skip" : "guided_next");
    stopPractice(true);
    VTPiano.stopAll();
    stopTimer(false);
    stopHold();
    stopPitchViz();
    state.recorder.clear();
    // Advance only past the step that is actually open: Save followed by Next
    // must move one step, not two.
    if (VTSession.currentExerciseId() === state.exercise.id) VTSession.markCurrentComplete();
    updateSessionBanner();
    const nid = VTSession.currentExerciseId();
    if (nid) {
      forceOpenExercise(nid, true);
      return;
    }
    resetSessionPractice();
    const done = VTSession.get();
    setView("home");
    renderExerciseList();
    if (window.VTLoop?.onRoutineComplete?.(done)) return;
    toast(tt("toast.structuredDone"));
  }

  function endStructured() {
    // Keep what was practised on this step, then kill live audio/mic —
    // previously left piano/mic running on home
    recordPracticeIfDue("guided_end");
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
    toast(tt("toast.sessionCleared"));
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

    $("#today-basics")?.addEventListener("click", (e) => {
      const b = e.target.closest?.("button");
      if (!b) return;
      if (b.dataset.id) {
        openExercise(b.dataset.id, false);
        return;
      }
      todayExpanded = !todayExpanded;
      renderTodayBasics();
      $("#today-basics .today-basics-more")?.focus();
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
    $("#btn-nav-home")?.addEventListener("click", () => {
      if (state.view === "exercise") leaveExercise({ type: "home" });
      else setView("home");
    });
    $("#btn-session-pause").addEventListener("click", pauseStructured);
    $("#btn-session-resume").addEventListener("click", resumeStructured);
    $("#btn-session-end").addEventListener("click", endStructured);

    $("#btn-back-home").addEventListener("click", () => {
      leaveExercise({ type: "home" });
    });
    // Breadcrumbs: Inicio → home; track → home with that tab selected
    $("#bc-home")?.addEventListener("click", () => {
      leaveExercise({ type: "home" });
    });
    $("#bc-track")?.addEventListener("click", async () => {
      const track = $("#bc-track")?.dataset?.track || state.tab || "vocal";
      const left = await leaveExercise({ type: "home" });
      if (left || state.view === "home") setTab(track);
    });

    $("#btn-practice-start")?.addEventListener("click", startPractice);
    $("#btn-practice-stop")?.addEventListener("click", () => stopPractice(false));
    $("#btn-continue")?.addEventListener("click", continuePractice);

    // Mic sensitivity (1–10) — persists + applies live while practicing
    // Level 10 ≈ 3× more sensitive than legacy max (soft SH/air)
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

    // Hold Space to supplement sound autodetection (non-highway exercises only)
    const isTypingTarget = (el) => {
      if (!el || !el.tagName) return false;
      const tag = el.tagName.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return true;
      if (el.isContentEditable) return true;
      return false;
    };
    const manualSoundAllowed = () => {
      if (!state.practiceLive || !state.practice?.running) return false;
      const profile = state.exercise ? getProfile(state.exercise) : null;
      if (!profile) return false;
      if (profile.allowManualSound === false) return false;
      // Air a11y modes (SH ladder, breath S→A) need Space even when pitch canvas is on
      // for the voiced /A/ phase. Blocking all showPitch broke s8 breath support Space.
      const mode = profile.mode || "";
      if (
        profile.manualSoundKind === "air" ||
        mode === "shAirLadder" ||
        mode === "breathS"
      ) {
        return true;
      }
      // Pure pitch-highway games: no Space-as-sound (would fake pitch locks)
      if (profile.showPitch) return false;
      return true;
    };
    const manualKindForProfile = (profile) => {
      if (profile?.manualSoundKind === "air" || profile?.manualSoundKind === "voice") {
        return profile.manualSoundKind;
      }
      const mode = profile?.mode || "";
      // Unvoiced air modes (SH ladder, similar)
      if (mode === "shAirLadder" || mode === "breathS") return "air";
      return "voice";
    };
    const updateManualHintVisibility = () => {
      const chip = $("#mic-sens-hud");
      const range = $("#mic-sensitivity");
      const mh = $("#mic-manual-hint");
      if (mh) mh.hidden = true; // layout never shows multi-line hint
      const ok = manualSoundAllowed();
      if (range) {
        range.title = ok
          ? tt("mic.manualHint") + " · " + tt("mic.sensHint")
          : tt("mic.sensHint");
      }
      if (chip && !ok) chip.classList.remove("is-manual");
    };
    /**
     * Space hold state + a11y grace (engine keeps inject ~550ms after keyup;
     * re-press within grace continues the same count — Filter Keys / tremor).
     */
    const setManualFromKey = (down, opts) => {
      const chip = $("#mic-sens-hud");
      if (!manualSoundAllowed()) {
        state.practice?.setManualSound?.(false, null, { forceClear: true });
        state._spaceDown = false;
        chip?.classList.remove("is-manual", "is-manual-grace");
        return;
      }
      const profile = getProfile(state.exercise);
      const kind = manualKindForProfile(profile);
      if (down) {
        state._spaceDown = true;
        // refresh timestamp even on key-repeat (OS key repeat = still held)
        state.practice?.setManualSound?.(true, kind);
      } else if (opts && opts.forceClear) {
        state._spaceDown = false;
        state.practice?.setManualSound?.(false, kind, { forceClear: true });
      } else {
        // keyup → grace (do not forceClear)
        state._spaceDown = false;
        state.practice?.setManualSound?.(false, kind);
      }
      const st = state.practice?.getManualSound?.() || {};
      if (chip) {
        chip.classList.toggle("is-manual", !!st.active && !st.grace);
        chip.classList.toggle("is-manual-grace", !!st.grace);
      }
      const range = $("#mic-sensitivity");
      if (range) {
        range.title = st.active
          ? st.grace
            ? tt("mic.manualActive") + "…"
            : tt("mic.manualActive")
          : tt("mic.manualHint") + " · " + tt("mic.sensHint");
      }
    };
    /**
     * Capture-phase Space: while practice is live, block browser default
     * (Space activates focused <button> = Start/Stop) and drive manual assist.
     * See MDN/a11y: Space on button fires click — must preventDefault early.
     */
    const isSpaceKey = (e) => e.code === "Space" || e.key === " ";
    document.addEventListener(
      "keydown",
      (e) => {
        if (!isSpaceKey(e)) return;
        if (isTypingTarget(e.target)) return;
        // Live practice: always claim Space (assist + don't toggle Stop/Start)
        if (state.practiceLive || manualSoundAllowed()) {
          e.preventDefault();
          e.stopPropagation();
          if (!manualSoundAllowed()) return;
          setManualFromKey(true);
          return;
        }
        // Not live: if focus is Start, let click happen (user starting with Space is OK)
      },
      true
    );
    document.addEventListener(
      "keyup",
      (e) => {
        if (!isSpaceKey(e)) return;
        if (isTypingTarget(e.target)) return;
        if (state.practiceLive || state._spaceDown || manualSoundAllowed()) {
          e.preventDefault();
          e.stopPropagation();
          setManualFromKey(false);
        }
      },
      true
    );
    window.addEventListener("blur", () => setManualFromKey(false, { forceClear: true }));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) setManualFromKey(false, { forceClear: true });
    });
    // Expose for practice start/stop
    state._updateManualHintVisibility = updateManualHintVisibility;
    $("#btn-stage-guide-more")?.addEventListener("click", () => {
      const btn = $("#btn-toggle-guide");
      if (!btn) return;
      if (!state.guideOpen) btn.click();
      document.querySelector(".guide-card")?.scrollIntoView({ behavior: scrollBehavior(), block: "start" });
    });
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
      const mini = $("#piano-mini-opts");
      if (block) {
        if (state.pianoOpen) {
          block.hidden = false;
          // next frame so max-height transition can run
          requestAnimationFrame(() => block.classList.add("is-open"));
          // Bring progressions into view only when user asked
          block.scrollIntoView({ behavior: scrollBehavior(), block: "nearest" });
        } else {
          block.classList.remove("is-open");
          setTimeout(() => {
            if (!state.pianoOpen) block.hidden = true;
          }, 220);
        }
      }
      // Expand secondary BR opts when piano panel open (progressive disclosure)
      if (mini) {
        mini.classList.toggle("piano-opts-expanded", !!state.pianoOpen);
        mini.classList.toggle("piano-opts-compact", !state.pianoOpen);
      }
      const btn = $("#btn-toggle-piano");
      if (btn) {
        btn.textContent = state.pianoOpen ? tt("piano.less") : tt("piano.more");
        btn.title = state.pianoOpen ? tt("piano.hidePanel") : tt("piano.showPanel");
        btn.setAttribute("aria-label", btn.title);
        btn.setAttribute("aria-expanded", String(!!state.pianoOpen));
      }
    });
    $("#btn-toggle-metrics")?.addEventListener("click", () => {
      openMetricsPanel(!state.metricsOpen);
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
      toast(tt("toast.pianoStopped"));
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
      toast(tt("toast.refPitch", { note, sec: String(sec) }));
    });
    $("#btn-inhale-ticks")?.addEventListener("click", async () => {
      await VTPiano.playInhaleTicks(3);
      toast(tt("toast.inhaleTicks"));
    });
    // Legacy stub buttons (if present in DOM) — only unified practice path
    $("#btn-pitch-start")?.addEventListener("click", startPractice);
    $("#btn-pitch-stop")?.addEventListener("click", () => stopPractice(false));
    $("#btn-hold-start")?.addEventListener("click", startPractice);
    $("#btn-hold-stop")?.addEventListener("click", () => stopPractice(false));

    $("#btn-complete").addEventListener("click", () => completeExercise());
    $$(".rate-btn").forEach((b) => b.addEventListener("click", () => rateFeel(b.dataset.feel)));
    $("#btn-rate-skip")?.addEventListener("click", leaveUnrated);
    $("#btn-next-structured").addEventListener("click", () => advanceStructured("next"));
    $("#btn-step-done-next")?.addEventListener("click", () => {
      stepDoneChoice("next");
      advanceStructured("next");
    });
    $("#btn-step-done-more")?.addEventListener("click", () => {
      stepDoneChoice("more");
      hideStepDone();
      state.timer.remaining = STEP_MORE_SEC;
      $("#timer-display").textContent = formatTime(STEP_MORE_SEC);
      startPractice();
    });
    $("#btn-step-done-rate")?.addEventListener("click", () => {
      stepDoneChoice("rate");
      hideStepDone();
      openMetricsPanel(true, { focus: true });
    });
    $("#step-done")?.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      stepDoneChoice("close");
      hideStepDone(true);
    });

    $("#btn-open-plan").addEventListener("click", renderPlan);
    $("#btn-plan-start").addEventListener("click", startWeekPlan);
    $("#plan-focus-more").addEventListener("click", togglePlanElements);
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
    // A phone that locks, or a tab that closes, keeps what was practised.
    // localStorage writes are synchronous, so this lands before the page goes.
    window.addEventListener("pagehide", () => {
      if (state.view === "exercise") recordPracticeIfDue("pagehide");
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden" && state.view === "exercise") {
        recordPracticeIfDue("hidden");
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

  /**
   * Pre-launch: checkout cannot take money yet and no QA unlock stands in for
   * it. The pricing dialog then offers nothing that only answers with a toast:
   * the plan buttons say "not available yet" and the trial leads instead.
   */
  function isCheckoutPrelaunch() {
    const B = window.VTBilling;
    try {
      const h = B?.getBillingHealth?.();
      return !!h && !h.ok && !B.cfg?.()?.demoUnlockEnabled;
    } catch {
      return false;
    }
  }

  /**
   * One reading of what this person holds, for the whole header.
   *
   * The chrome used to read `VTBilling` alone, which knows a licence is valid
   * but not what bought it. So an account trial arrived wearing the paid
   * colour, a gifted month was indistinguishable from a subscription, and the
   * header could say Pro while the account panel on the same screen said
   * "Plan gratis". The account layer knows the difference, so it answers first
   * whenever somebody is signed in; `VTBilling` answers for the browser-local
   * trial and for a licence held without an account. One object, so the two
   * surfaces cannot disagree.
   *
   * @returns {{kind: "free"|"trialLocal"|"trialAccount"|"gift"|"paid"|"canceled",
   *            days: number|null}} What to show, and days left where that is known.
   */
  function headerPlanState() {
    const ent = window.VTBilling?.getEntitlement?.() || { pro: false, status: "free" };
    const acct = window.VTAccount?.getState?.() || null;
    const signedIn = !!(acct && acct.signedIn);
    const live = signedIn && acct.entitlement && acct.entitlement.pro ? acct.entitlement : null;
    // Reload a signed-in browser and `signedIn` is true from the first frame,
    // while `entitlement` only arrives when the worker answers — never, if the
    // browser is offline. The licence token survives that gap but cannot say
    // which kind of access it is: the trial grant issues plan "pro_monthly"
    // exactly like a payment. So without the remembered kind below, a free
    // trial reads as a paid subscription on every load, which is the one thing
    // this whole reading exists to stop. It is used only while the licence
    // still verifies, so a revoked gift does not keep its label.
    const remembered = !live && signedIn && ent.pro && acct.lastPlan && acct.lastPlan.pro
      ? acct.lastPlan
      : null;
    const held = live || remembered;
    // Accepts either an ISO string (VTBilling) or unix seconds (the account
    // layer), because the two halves of this answer are stored differently.
    const daysLeft = (when) => {
      const t = typeof when === "number" && Number.isFinite(when)
        ? when * 1000
        : Date.parse(when || "");
      if (!Number.isFinite(t)) return null;
      const d = Math.ceil((t - Date.now()) / 86400000);
      return d >= 0 ? d : null;
    };
    if (held) {
      // `periodEnd` is unix seconds here, which is what accountDate() reads.
      const until = accountDate(held.periodEnd);
      if (held.status === "canceled") {
        return { kind: "canceled", days: daysLeft(held.periodEnd), until };
      }
      if (held.source === "trial") {
        return { kind: "trialAccount", days: daysLeft(held.periodEnd), until };
      }
      if (held.source === "gift" || held.source === "comp") {
        return { kind: "gift", days: daysLeft(held.periodEnd), until };
      }
      return { kind: "paid", days: null, until };
    }
    // Signed out, or signed in with nothing: the browser's own view. Its dates
    // are ISO strings rather than unix seconds.
    const isoUntil = (iso) => {
      const t = Date.parse(iso || "");
      return Number.isFinite(t) ? accountDate(t / 1000) : "";
    };
    if (ent.status === "trial") {
      return { kind: "trialLocal", days: daysLeft(ent.expiresAt), until: isoUntil(ent.expiresAt) };
    }
    if (ent.pro) return { kind: "paid", days: null, until: isoUntil(ent.expiresAt) };
    return { kind: "free", days: null, until: "" };
  }

  /**
   * Whether this person has already spent their one free trial. Read from the
   * account when accounts are on, because that is where the worker records it
   * and it has to hold across browsers; from this browser's own trial mark
   * otherwise. Shared by the Pro dialog's two lines so they cannot disagree.
   * @returns {boolean} True when the free trial is gone.
   */
  function trialSpent() {
    const B = window.VTBilling;
    const acct = window.VTAccount?.getState?.() || null;
    if (accountSignIn().offered) {
      return !!(acct && acct.signedIn && acct.account && acct.account.trialUsed);
    }
    return !!B?.trialStartedAt?.();
  }

  function updateBillingChrome() {
    const B = window.VTBilling;
    if (!B) return;
    const ent = B.getEntitlement();
    const cfg = B.cfg?.() || {};
    const prelaunch = isCheckoutPrelaunch();
    const pill = $("#billing-pill");
    const btn = $("#btn-pricing");
    const plan = headerPlanState();
    const held = plan.kind !== "free";
    if (pill) {
      pill.classList.remove("is-trial", "is-free", "is-gift", "is-ending");
      // The pill is the status and nothing else. It shows only what is actually
      // held, and it names which kind, because "Pro" in the paid green over a
      // free trial is the single thing that misled the site's own owner.
      if (plan.kind === "trialAccount" || plan.kind === "trialLocal") {
        pill.hidden = false;
        pill.textContent = plan.days === null
          ? tt("nav.planTrial")
          : tt("nav.planTrialDays", { n: String(plan.days) });
        pill.classList.add("is-trial");
      } else if (plan.kind === "gift") {
        pill.hidden = false;
        pill.textContent = tt("nav.planGift");
        pill.classList.add("is-gift");
      } else if (plan.kind === "canceled") {
        pill.hidden = false;
        pill.textContent = tt("nav.planEnding");
        pill.classList.add("is-ending");
      } else if (plan.kind === "paid") {
        pill.hidden = false;
        pill.textContent = "Pro";
      } else {
        pill.hidden = true;
        pill.textContent = "";
        pill.classList.add("is-free");
      }
    }
    // Two elements saying "Pro" beside each other is what made the offer read
    // as a badge already earned. Only one of them ever says it now: while
    // nothing is held this button is the offer, and once something is held the
    // pill carries the state and the button becomes the way to the plan — named
    // for what it opens, which is also the route to cancelling.
    if (btn) {
      btn.textContent = held ? tt("nav.subscription") : tt("nav.pro");
      btn.title = held ? tt("nav.subscriptionTitle") : tt("nav.proOffer");
      btn.setAttribute("aria-label", btn.title);
      btn.classList.toggle("btn-pro", !held);
      btn.classList.toggle("btn-ghost", held);
    }
    const exp = $("#btn-export-progress");
    if (exp) exp.hidden = !B.can("export_progress");
    const demo = $("#btn-demo-pro");
    if (demo) {
      demo.hidden = !cfg.demoUnlockEnabled || ent.source === "demo" || (ent.pro && ent.source === "paid");
    }
    // Recovery for a checkout whose license never arrived.
    const recheck = $("#btn-recheck-payment");
    if (recheck) {
      recheck.hidden = !(
        !ent.pro &&
        !!B.hasPendingClaim?.() &&
        !!B.verificationConfigured?.()
      );
    }
    // Free trial is opt-in. Once accounts exist the trial belongs to the
    // account, not the browser — one per person rather than one per cleared
    // localStorage — so the button leads to sign-in when nobody is signed in.
    const trialBtn = $("#btn-start-trial");
    if (trialBtn) {
      const acct = window.VTAccount?.getState?.() || null;
      // A worker URL is not enough: the button has to name the length of the
      // trial the press will actually start, and the press only goes to the
      // account layer once the worker has said it can sign somebody in. Anything
      // short of that — still asking, unreachable, no method wired up — is the
      // browser-local trial, so the button says the browser-local length.
      const accounts = accountSignIn().offered;
      const canTrial = accounts
        ? !ent.pro && !(acct.signedIn && acct.account?.trialUsed)
        : !!B.canStartTrial?.() && !ent.pro;
      trialBtn.hidden = !canTrial;
      // Pre-launch the trial is the one thing this dialog can really do, so it
      // moves up beside the payments note as the primary; once checkout is live
      // it goes back to the foot. One element, so its id and listener stay.
      const slot = prelaunch ? $("#pricing-launch") : $("#pricing-modal .pricing-foot");
      if (slot && trialBtn.parentElement !== slot) {
        // Once checkout is live the plan cards carry the primary action, so this
        // goes back to being a secondary — but first in its row, not fourth
        // behind export, manage and recheck. "Visual or language steering toward
        // subscriptions" was the most common finding in the EU's 2023 sweep of
        // 399 shops (54 shops, more than fake countdowns), and a trial buried
        // under three controls that only Pro users ever see is that shape.
        slot.insertBefore(trialBtn, prelaunch ? null : slot.firstElementChild);
      }
      trialBtn.classList.toggle("btn-primary", prelaunch);
      trialBtn.classList.toggle("btn-sm", !prelaunch);
      // Once per load, not once per render: this sits in a path that re-runs on
      // every entitlement change and every language switch. The dialog's own
      // visibility is the gate — see noteTrialCtaView.
      noteTrialCtaView("pricing");
      if (canTrial) {
        const days = accounts
          ? Number(acct.methods?.trialDays || 7) // the worker's TRIAL_DAYS, whose default is also 7
          : Number(cfg.freeTrialDays || 0);
        trialBtn.textContent = tt(prelaunch ? "pricing.startTrialFree" : "pricing.startTrial", {
          n: String(days)
        });
      }
    }
    // The foot promised secure checkout and cancelling "the same way you
    // subscribed" while nobody can subscribe. Pre-launch it answers the
    // question the trial raises instead, and only while the trial is offered.
    const payNote = $("#pricing-pay-note");
    if (payNote) {
      const key = prelaunch ? "pricing.notePrelaunch" : "pricing.note";
      payNote.setAttribute("data-i18n", key);
      payNote.textContent = tt(key);
      payNote.hidden = prelaunch && (!trialBtn || trialBtn.hidden);
    }
    // Customer Portal: show for Pro/trial when a valid portal URL is configured
    const manage = $("#btn-manage-billing");
    if (manage) {
      const portalRaw = String(cfg.customerPortalUrl || "").trim();
      const portalOk = portalRaw && (B.isPortalUrl ? B.isPortalUrl(portalRaw) : true);
      manage.hidden = !(portalOk && (ent.pro || ent.status === "trial"));
    }
    // Ads: Pro suppresses; free may refresh home slot
    try {
      window.VTAds?.refreshAllSafe?.();
    } catch {
      /* ignore */
    }
    // Soft note for free users when checkout not live (no developer/issue jargon)
    const healthNote = $("#pricing-health-note");
    if (healthNote && B.getBillingHealth) {
      try {
        const h = B.getBillingHealth();
        if (h && !h.ok && h.links && h.verificationRequired && !h.verificationConfigured) {
          // Links are live but entitlements cannot be verified — checkout is held.
          healthNote.hidden = false;
          healthNote.textContent = tt("pricing.verifyUnavailable");
        } else if (h && !h.ok) {
          healthNote.hidden = false;
          healthNote.textContent = tt("pricing.toast.unconfigured");
        } else {
          healthNote.hidden = true;
          healthNote.textContent = "";
        }
      } catch {
        healthNote.hidden = true;
      }
    }
    // Somebody who has already spent their free trial while checkout is still
    // closed is the most interested person in the product, and the dialog used
    // to show them nothing at all: no plan they could buy, no explanation and
    // no way on. Say where they stand instead.
    const spent = $("#pricing-spent");
    if (spent) {
      const show = prelaunch && !ent.pro && trialSpent();
      spent.hidden = !show;
      spent.textContent = show ? tt("pricing.trialSpent") : "";
    }
    const launch = $("#pricing-launch");
    if (launch) {
      launch.hidden = !!(
        (!healthNote || healthNote.hidden) &&
        (!spent || spent.hidden) &&
        (!trialBtn || trialBtn.hidden || trialBtn.parentElement !== launch)
      );
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
    // The tag on the home card and the pill in the header are the same claim in
    // two places, so they read the same source. Before this they did not: this
    // one tested `ent.status === "trial"`, which is only ever the browser's own
    // opt-in trial, so a worker-granted trial month fell through to "Pro" — the
    // header's old mistake, still on the page a visitor sees first.
    const plan = headerPlanState();
    const isProUser = !!(ent.pro || ent.status === "trial" || plan.kind !== "free");
    const tag = $("#value-pulse-tag");
    if (tag) {
      tag.hidden = false;
      if (plan.kind === "trialAccount" || plan.kind === "trialLocal") {
        const n = plan.days === null ? (B?.trialDaysLeft?.() ?? 0) : plan.days;
        tag.textContent = tt("value.tagTrial", { n: String(n) });
        tag.className = "value-pulse-tag is-trial";
      } else if (plan.kind === "gift") {
        tag.textContent = tt("value.tagGift");
        tag.className = "value-pulse-tag is-gift";
      } else if (plan.kind === "canceled") {
        tag.textContent = tt("value.tagEnding");
        tag.className = "value-pulse-tag is-ending";
      } else if (plan.kind === "paid") {
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
      // role="img" hides the cells, so the label has to say what the map shows.
      const practised = data.cells.filter((c) => c.count > 0).length;
      hm.setAttribute(
        "aria-label",
        tt(practised === 1 ? "retain.heatmapAria1" : "retain.heatmapAria", { n: practised, w: data.weeks })
      );
    }
    updateHomeZeroClass();
  }

  function startMicroSession(exerciseId) {
    // Picked up by forceOpenExercise for this one open only.
    state.pendingMicro = true;
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

    const loopOn = !!window.VTLoop && !!window.VTDays;

    // Rest days (the old "freeze"): the ledger spends them on real misses; this
    // only reports one it has just spent, once.
    const fl = $("#retain-freeze-label");
    if (fl) {
      fl.textContent = tt("retain.freezesLeft", { n: String(VTReminders.freezesLeft()) });
      const fr = VTReminders.tryApplyFreeze();
      if (fr.applied) {
        // The start panel says it in its own words; the toast is the fallback.
        if (loopOn) window.VTLoop.noteRest(fr);
        else toast(tt("retain.freezeUsed", { n: String(fr.left) }), { durationMs: 3200 });
        fl.textContent = tt("retain.freezesLeft", { n: String(fr.left) });
      }
    }

    // Welcome back after ≥2 days. With the daily loop the start panel itself
    // becomes the comeback screen, so this card would only repeat it lower down.
    const days = VTReminders.daysSinceLastPractice();
    const wb = $("#welcome-back");
    if (wb) {
      const dismissed =
        sessionStorage.getItem("vt_wb_dismiss") === dayKeyLocal();
      const show = !loopOn && days != null && days >= 2 && !dismissed;
      wb.hidden = !show;
      if (show) {
        const body = $("#welcome-back-body");
        if (body) body.textContent = tt("retain.welcomeBodyDays", { n: String(days) });
      }
    }

    // Due reminder banner. Evaluating marks the day as notified, so the second
    // render during page load used to hide the banner the first had just shown:
    // it was never visible. What was shown today stays until dismissed or until
    // practice makes it moot.
    const ev = VTReminders.evaluate(isEs);
    const rd = $("#remind-due");
    if (rd) {
      const today = dayKeyLocal();
      if (ev.due && cfg.enabled) {
        state.remindDue = { day: today, message: ev.message };
        VTReminders.markNotified();
      }
      const keep =
        cfg.enabled &&
        state.remindDue &&
        state.remindDue.day === today &&
        !VTReminders.practicedToday();
      rd.hidden = !keep;
      if (keep) {
        const tx = $("#remind-due-text");
        if (tx) tx.textContent = state.remindDue.message;
        const go = $("#rd-start");
        if (go && loopOn) go.textContent = tt("loop.remindCta");
        try {
          if (!state.remindDue.tracked) {
            state.remindDue.tracked = true;
            window.VTAnalytics?.track?.("remind_due_shown", {});
          }
        } catch {
          /* ignore */
        }
      }
    }
  }

  function dayKeyLocal() {
    // Named "local" from the start but was the UTC date until the loop fixed it.
    return window.VTDays?.dayKey?.() || new Date().toISOString().slice(0, 10);
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
    // The reminder's button starts today's Mínimo when the loop is there; the
    // old one opened the Canto air ladder for everybody, Vocal users included.
    $("#rd-start")?.addEventListener("click", () => {
      state.remindDue = null;
      if (window.VTLoop?.startTier) window.VTLoop.startTier("min");
      else startMicroSession("s15-sh-air-ladder");
    });
    $("#rd-dismiss")?.addEventListener("click", () => {
      state.remindDue = null;
      const rd = $("#remind-due");
      if (rd) rd.hidden = true;
    });
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && state.view === "home") {
        // A tab left open overnight wakes up on a new day: redraw all of home,
        // not only the reminders, or "done for today" would still say today.
        renderValuePulse();
        renderRetentionChrome();
        renderNextStepCard();
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
    const prelaunch = isCheckoutPrelaunch();
    const regionEl = $("#pricing-region-label");
    if (regionEl) {
      regionEl.textContent = `${tt("pricing.region")}: ${market.name} · ${market.currency}`;
    }
    const status = $("#pricing-status");
    if (status) {
      const ent = B.getEntitlement();
      const plan = headerPlanState();
      // This line used to read "Pro activo · pro_monthly": an internal plan id
      // shown to a reader, and a free trial described as a monthly
      // subscription. It now says which kind of access this is, in words, and it
      // reads the same source as the header so the two cannot disagree.
      if (plan.kind === "trialAccount") {
        status.textContent = plan.days === null
          ? tt("pricing.statusTrial")
          : `${tt("pricing.statusTrial")} · ${tt("pricing.trialLeft", { n: String(plan.days) })}`;
      } else if (plan.kind === "trialLocal") {
        const left = plan.days === null ? (B.trialDaysLeft?.() ?? 0) : plan.days;
        status.textContent = `${tt("pricing.trial")} · ${tt("pricing.trialLeft", { n: String(left) })}`;
      } else if (plan.kind === "gift") {
        status.textContent = plan.until
          ? tt("pricing.statusGiftUntil", { date: plan.until })
          : tt("pricing.statusGift");
      } else if (plan.kind === "canceled") {
        status.textContent = plan.until
          ? tt("pricing.statusCanceled", { date: plan.until })
          : tt("pricing.statusCanceledNoDate");
      } else if (plan.kind === "paid") {
        const demo = ent.source === "demo" ? ` (${tt("pricing.statusDemo")})` : "";
        status.textContent = (plan.until
          ? tt("pricing.statusPaidUntil", { date: plan.until })
          : tt("pricing.proActive")) + demo;
      } else if (ent.status === "pending") {
        status.textContent = tt("pricing.verifying");
      } else if (ent.status === "unverified") {
        status.textContent = tt("pricing.unverified");
      } else if (ent.status === "expired" || (!prelaunch && trialSpent())) {
        // A month that has run out is not the same state as never having had
        // one, and "Plan gratis" told those two people the same thing.
        status.textContent = tt("pricing.statusEnded");
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
      // Choosing how to pay means nothing while nobody can pay.
      rails.hidden = prelaunch;
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
      // Computed from the two prices on the cards, so the badge can never
      // disagree with the numbers printed next to it.
      const savingPct = B.annualSavingPct(plans, region);
      grid.innerHTML = plans
        .map((p) => {
          const price = B.formatPrice(p, region);
          const interval =
            p.interval === "month" ? tt("pricing.month") : p.interval === "year" ? tt("pricing.year") : "";
          const name = es ? p.nameEs || p.name : p.name;
          // Eleven bullets pushed every plan's button off the modal. Show the
          // five that decide the purchase, keep the rest one click away.
          const featList = p.features || [];
          const FEAT_MAX = 5;
          const feats = featList
            .slice(0, FEAT_MAX)
            .map((f) => `<li>${tt("pricing.feat." + f)}</li>`)
            .join("");
          const restFeats = featList
            .slice(FEAT_MAX)
            .map((f) => `<li>${tt("pricing.feat." + f)}</li>`)
            .join("");
          const moreFeats = restFeats
            ? `<details class="plan-more"><summary>${tt("pricing.moreFeatures", { n: featList.length - FEAT_MAX })}</summary><ul class="plan-features">${restFeats}</ul></details>`
            : "";
          const badge =
            p.badge === "saveAnnual" && savingPct
              ? `<span class="plan-badge">${tt("pricing.savePct", { n: String(savingPct) })}</span>`
              : p.popular
                ? `<span class="plan-badge">★</span>`
                : "";
          let ctaLabel = tt("pricing.subscribe");
          let disabled = false;
          let notYet = false;
          if (p.id === "free") {
            ctaLabel = tt("pricing.current");
            disabled = true;
          } else if (ent.pro && (ent.plan === p.id || (ent.plan === "trial" && p.id !== "free"))) {
            if (ent.plan === p.id || ent.source === "demo") {
              ctaLabel = tt("pricing.current");
              disabled = ent.plan === p.id || ent.source === "paid";
            }
          }
          // A Subscribe button that can only answer with a toast is a dead end;
          // say it on the button instead, and keep it out of the Tab order.
          if (prelaunch && !disabled) {
            ctaLabel = tt("pricing.notYet");
            disabled = true;
            notYet = true;
          }
          const ctaClass = p.id === "free" ? "btn-ghost" : notYet ? "btn-ghost plan-cta-not-yet" : "btn-primary";
          const hero = p.hero || p.id === "pro_yearly" ? " is-hero" : "";
          return `
            <article class="plan-card${p.popular ? " is-popular" : ""}${hero}" data-plan="${p.id}">
              ${badge}
              <h4>${name}</h4>
              <div class="plan-price">${price.text}<span>${interval}</span></div>
              <ul class="plan-features">${feats}</ul>
              ${moreFeats}
              <button type="button" class="btn ${ctaClass} btn-sm plan-cta" data-plan="${p.id}" ${disabled ? 'disabled aria-disabled="true"' : ""}>
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
          } else if (res.mode === "verification_unavailable") {
            toast(tt("pricing.toast.verifyUnavailable"), { durationMs: 5200 });
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
    // The trial's length is the worker's to name, not this file's. Asking here
    // means the card is right by the time anyone reads it, and — as with the
    // account panel — only because somebody opened the panel.
    window.VTAccount?.ensureMethods?.();
    // Remember the trigger before renderPricingModal() rebuilds the card.
    const opener = document.activeElement;
    renderPricingModal();
    modal.hidden = false;
    // renderPricingModal() ran while the dialog was still hidden, so the CTA
    // view is counted here, once it is on screen.
    noteTrialCtaView("pricing");
    document.body.classList.add("pricing-open");
    window.VTFocusTrap?.activate(modal, { initialFocus: "#pricing-close", returnFocus: opener });
  }

  function closePricing() {
    const modal = $("#pricing-modal");
    if (modal) {
      modal.hidden = true;
      window.VTFocusTrap?.release(modal);
    }
    document.body.classList.remove("pricing-open");
  }

  /** Map a worker `reason` code onto a translated line. */
  /**
   * The account, sign-in and trial funnel, as events.
   *
   * Until this existed the funnel was unmeasurable at any traffic: all 44 names
   * in the worker's EVENT_NAMES were practice, tour, daily loop and ads, and
   * js/app.js made no track() call for accounts at all. So "how many people who
   * opened the account panel got a trial" had no answer, and no A/B test at any
   * sample size would have given one — at a 2% baseline a 20% relative lift
   * needs about 21,000 browsers per arm, which this site will not see. Each step
   * is read as one proportion with a Wilson bound instead, which finds a broken
   * step with about thirty visitors.
   *
   * None of these is an arm event for any experiment in EXPERIMENT_PRESETS: they
   * fire from this code in every arm, which is the condition a metric has to
   * meet. Props stay flat ids so the worker's PROP_STRING_RE accepts them.
   */
  const FUNNEL_SEEN = new Set();

  /**
   * @param {string} name Event name; must be in the worker's EVENT_NAMES.
   * @param {Record<string, string>} [props] Flat id props.
   * @param {string} [onceKey] When given, the event fires at most once per page
   *   load for this key — for anything that sits in a render path.
   */
  function trackFunnel(name, props, onceKey) {
    if (onceKey) {
      if (FUNNEL_SEEN.has(onceKey)) return;
      FUNNEL_SEEN.add(onceKey);
    }
    try {
      window.VTAnalytics?.track?.(name, props || {});
    } catch {
      /* analytics never breaks the page */
    }
  }

  /** A reason from the worker or the account layer, as a prop the worker accepts. */
  function funnelReason(reason) {
    return String(reason || "error").replace(/[^A-Za-z0-9_.:-]/g, "_").slice(0, 64);
  }

  /**
   * Which of the account panel's states a visitor is actually looking at. These
   * are accountSignIn()'s own answers, which is the point: it turns "an
   * extension blocked Google's script" from a hypothesis into a count, and that
   * is something no A/B test would ever report.
   * @returns {string} One flat id.
   */
  function accountPanelState() {
    const acct = window.VTAccount?.getState?.() || null;
    if (acct && acct.signedIn) return "signed_in";
    const offer = accountSignIn();
    if (!offer.configured) return "not_configured";
    if (offer.checking) return "checking";
    if (offer.unreachable) return "unreachable";
    if (offer.blocked) return "blocked";
    if (offer.offered) return "offered";
    return "no_method";
  }

  /** Which dialog each trial CTA lives in, and the button that is the CTA. */
  const TRIAL_CTA = {
    pricing: { modal: "#pricing-modal", btn: "#btn-start-trial" },
    panel: { modal: "#account-modal", btn: "#btn-account-trial" }
  };

  /**
   * Count a trial offer as seen only when it is genuinely on screen.
   *
   * Both CTAs are drawn by functions that run at boot — `updateBillingChrome()`
   * from `bindBilling()`, `refreshAccountUI()` from `bindAuth()` — while their
   * dialogs still carry `hidden` from the markup. A bare event in either one
   * therefore counts a view for every browser that merely loaded the page, and
   * because `trial_cta_view` sits downstream of signing in
   * (workers/entitlements/src/events.js FUNNEL_STEPS), that would pin the step
   * near 100% and make it report nothing. Reading both the dialog's and the
   * button's own `hidden` means the event and the pixel cannot disagree.
   * @param {"pricing"|"panel"} where Which surface.
   */
  function noteTrialCtaView(where) {
    const sel = TRIAL_CTA[where];
    if (!sel) return;
    const modal = $(sel.modal);
    const btn = $(sel.btn);
    if (!modal || modal.hidden || !btn || btn.hidden) return;
    trackFunnel("trial_cta_view", { where }, `cta:${where}`);
  }

  const ACCOUNT_ERROR_KEYS = {
    bad_email: "auth.err.email",
    bad_code: "auth.err.code",
    no_code: "auth.err.code",
    expired: "auth.err.code",
    too_many_attempts: "auth.err.rate",
    rate_limited: "auth.err.rate",
    offline: "auth.err.offline",
    not_found: "auth.err.giftNotFound",
    already_redeemed: "auth.err.giftUsed",
    exhausted: "auth.err.giftExhausted",
    revoked: "auth.err.giftRevoked",
    trial_used: "auth.err.trialUsed",
    email_not_configured: "auth.err.emailUnavailable",
    // What every /v1/auth route answers on a deploy with no database, which the
    // operator runbook explicitly allows. Without this it read as a bug.
    accounts_not_configured: "auth.err.accountsOff"
  };

  function accountError(message) {
    const el = $("#account-error");
    if (!el) return;
    if (!message) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = message;
  }

  function accountErrorFor(reason) {
    accountError(tt(ACCOUNT_ERROR_KEYS[reason] || "auth.err.generic"));
  }

  /** Format a unix-seconds period end the way the rest of the UI writes dates. */
  function accountDate(unixSeconds) {
    if (!Number.isFinite(unixSeconds)) return "";
    try {
      return new Date(unixSeconds * 1000).toLocaleDateString(
        window.VTI18n?.lang === "en" ? "en" : "es",
        { day: "numeric", month: "long" }
      );
    } catch {
      return "";
    }
  }

  /**
   * One line describing what the account currently holds. The wording follows
   * where the access came from, because "your friend gave you this until the
   * 20th" and "this renews on the 20th" are different facts to a reader.
   */
  function accountPlanLine(entitlement) {
    // A gift that was revoked, or a grant that ran out, reports pro:false — and
    // the worker's resolution keeps only the access that is still live, so from
    // here "your month was taken back" and "you never had one" are the same
    // answer. These two branches are here for when the worker does say which:
    // resolveEntitlement() in workers/entitlements/src/grants.js would have to
    // report the most recent ended grant. Until it does, the line below is the
    // honest one, and the PR says so rather than guessing from local state.
    if (entitlement && !entitlement.pro && entitlement.status === "revoked") {
      return tt("auth.planRevoked");
    }
    if (entitlement && !entitlement.pro && entitlement.status === "expired") {
      return tt("auth.planExpired");
    }
    if (!entitlement || !entitlement.pro) return tt("auth.planFree");
    const date = accountDate(entitlement.periodEnd);
    if (entitlement.status === "canceled" && date) return tt("auth.planCanceled", { date });
    if (entitlement.source === "trial") return tt("auth.planTrial", { date });
    if (entitlement.source === "gift" || entitlement.source === "comp") {
      return tt("auth.planGift", { date });
    }
    return date ? tt("auth.planPaid", { date }) : tt("auth.planPaidOpen");
  }

  function accountSyncLine() {
    const status = window.VTSync?.getStatus?.();
    if (!status || !status.available) return "";
    if (status.syncing) return tt("auth.syncing");
    if (status.lastError) return tt("auth.syncError");
    return status.lastSyncedAt ? tt("auth.syncOk") : tt("auth.syncNever");
  }

  /**
   * What sign-in this deploy actually offers.
   *
   * A configured worker URL is not the same as a usable sign-in: the worker
   * reports separately, at /v1/auth/methods, which methods its operator has
   * wired up, and it can be none. Four states, not two, because guessing at
   * the middle one is what showed a form that could never send a code:
   *
   *   !configured   no worker URL at all — the site is practice-only.
   *   checking      a worker URL, but it has not said yet.
   *   unreachable   it was asked and could not be reached.
   *   blocked       it offers only Google, and Google's script will not load
   *                 in this browser — an extension, a blocker or the network.
   *   offered       it answered with at least one method this browser can run.
   *
   * The last one is the trap: what the worker offers and what a browser can
   * actually run are different facts, and on a Google-only deploy the
   * difference is the entire sign-in.
   *
   * @returns {{configured: boolean, checking: boolean, unreachable: boolean,
   *            blocked: boolean, canEmail: boolean, offered: boolean}} What the
   *            panel may draw.
   */
  function accountSignIn() {
    const account = window.VTAccount?.getState?.() || null;
    const configured = !!(account && account.configured);
    const m = (account && account.methods) || null;
    const answered = !!m && m.ok !== false;
    const canEmail = answered && !!m.email;
    // Unknown counts as usable: the script is only attempted when the panel
    // opens, and until then the worker's word is the best answer there is.
    // A client id is part of the offer, not a detail of it: Google's script
    // needs the id to draw its button, so google:true without one leaves a
    // panel with a title, a promise and nothing to press. That is a deploy
    // with no method, and it says so.
    const hasGoogle = answered && !!m.google && !!m.googleClientId;
    const canGoogle = hasGoogle && account.googleReady !== false;
    return {
      configured,
      checking: configured && !m,
      unreachable: configured && !!m && m.ok === false,
      blocked: hasGoogle && account.googleReady === false && !canEmail,
      canEmail,
      canGoogle,
      offered: configured && (canEmail || canGoogle)
    };
  }

  /**
   * Where focus lands when the account panel opens. It has to name a control
   * that is actually on screen in each of the states above, or the focus trap
   * activates with focus on the body.
   * @param {boolean} signedIn Whether somebody is signed in.
   * @returns {string} A selector.
   */
  function accountInitialFocus(signedIn) {
    if (signedIn) return "#account-close";
    const offer = accountSignIn();
    // Nothing to lead with yet, and the QA disclosure is closed in this state,
    // so the close button is the only honest target.
    if (offer.checking) return "#account-close";
    // Every other state that offers nothing opens the disclosure, so the trap
    // has a real control to land on; the fall-through below picks it up.
    const form = $("#account-signin");
    if (form && !form.hidden) {
      // Google draws its button in its own iframe, which is no use as a target.
      return offer.canEmail ? "#account-email" : "#account-close";
    }
    // Nothing public to sign in with: the retry control is the real one, and
    // focus must not land in the staff form, which is what used to happen.
    const retry = $("#account-retry-row");
    if (retry && !retry.hidden) return "#account-retry";
    return "#account-close";
  }

  function refreshAccountUI() {
    const A = window.VTAuth;
    const account = window.VTAccount?.getState?.() || null;
    const session = A?.current?.() || null;
    const signedIn = !!(account && account.signedIn) || !!session;
    const out = $("#account-logged-out");
    const inn = $("#account-logged-in");
    // "Entra para guardar tu progreso" stayed on screen after signing in, so the
    // panel asked for something already done.
    const sub = $("#account-sub");
    if (sub) sub.textContent = signedIn ? tt("auth.subSignedIn") : tt("auth.sub");
    // The heading said "Cuenta" — the same defect the header button had, one
    // layer down: a room, not a reason. Signed out it names what you get.
    const title = $("#account-title");
    if (title) title.textContent = signedIn ? tt("auth.title") : tt("auth.titleOut");
    const admin = $("#admin-panel");
    const who = $("#account-who");
    const btnAcc = $("#btn-account");

    if (btnAcc) {
      // Signed out, this is the only door into accounts, so it is named for the
      // act and not for the room: "Cuenta" is a destination nobody who has no
      // account has a reason to press. Signed in it becomes who you are, which
      // is what tells you at a glance that you are.
      if (account && account.signedIn && account.account) {
        btnAcc.textContent = (account.account.displayName || account.account.email || "").split("@")[0]
          || tt("nav.account");
        btnAcc.title = tt("nav.accountTitle");
      } else if (session) {
        btnAcc.textContent = session.username.split(".")[0] || tt("nav.account");
        btnAcc.title = tt("nav.accountTitle");
      } else {
        btnAcc.textContent = tt("nav.signIn");
        btnAcc.title = tt("nav.signInTitle");
      }
      btnAcc.setAttribute("aria-label", btnAcc.title);
    }
    if (!out || !inn) return;

    // Signed out: offer real sign-in when an operator has wired the worker up,
    // and say so plainly when they have not, rather than showing a form that
    // cannot work.
    const signIn = $("#account-signin");
    const unconfigured = $("#account-unconfigured");
    // Exactly one of the four states is drawn, and which one is the whole point
    // of accountSignIn(): a deploy with neither an email provider nor a Google
    // client can take nobody's sign-in, and showing the form anyway means
    // typing an address and being told afterwards that it cannot be sent.
    const offer = accountSignIn();
    const hasRealSignIn = offer.offered;
    if (signIn) signIn.hidden = !hasRealSignIn;
    const checking = $("#account-checking");
    if (checking) checking.hidden = !offer.checking;
    const offline = $("#account-offline");
    if (offline) offline.hidden = !offer.unreachable;
    const blocked = $("#account-signin-blocked");
    if (blocked) blocked.hidden = !offer.blocked;
    if (unconfigured) {
      unconfigured.hidden =
        hasRealSignIn || offer.checking || offer.unreachable || offer.blocked;
    }
    const emailForm = $("#account-email-form");
    if (emailForm) emailForm.hidden = !offer.canEmail;
    // The divider only separates two things. On a Google-only deploy — which is
    // every deploy today — it used to sit under Google's button with nothing
    // beneath it, reading as "or ... " and then stopping.
    const orEl = $("#account-or");
    if (orEl) orEl.hidden = !(offer.canEmail && offer.canGoogle);
    // Asking again is the honest control for every state that cannot offer a
    // sign-in yet: the worker was unreachable, or Google's script was blocked
    // and the visitor has just turned their blocker off. With no worker URL at
    // all there is nothing to ask, so it stays hidden there.
    const retryRow = $("#account-retry-row");
    if (retryRow) {
      retryRow.hidden = !offer.configured || hasRealSignIn || offer.checking;
    }
    // What the account is for, above the button that makes one. Only where a
    // sign-in can really be performed: promising a free trial beside a notice
    // saying sign-in is off would be the worst of both.
    const offerLine = $("#account-offer");
    if (offerLine) {
      offerLine.hidden = !hasRealSignIn || signedIn;
      if (!offerLine.hidden) {
        const days = Number(account && account.methods && account.methods.trialDays);
        offerLine.textContent = days > 0
          ? tt("auth.offer", { n: String(days) })
          : tt("auth.offerNoTrial");
      }
    }
    // The internal staff login is never opened for anybody. It used to expand
    // itself whenever no public sign-in could be offered, on the reasoning that
    // it was then the only way in — but it is not a way in for the person
    // looking at it. Three of the five signed-out states put an ordinary
    // visitor in front of a Usuario/Contraseña form, with focus inside it, as
    // the single thing on the panel they could touch. It stays shut, and those
    // states get the retry control above instead.
    const internal = document.querySelector(".account-internal");
    if (internal && internal.dataset.autoOpen === "1") {
      internal.open = false;
      internal.dataset.autoOpen = "";
    }

    if (!signedIn) {
      out.hidden = false;
      inn.hidden = true;
      if (admin) admin.hidden = true;
      const serverAdmin = $("#account-admin");
      if (serverAdmin) serverAdmin.hidden = true;
      return;
    }

    out.hidden = true;
    inn.hidden = false;

    if (who) {
      if (account && account.signedIn && account.account) {
        who.textContent = tt("auth.signedInAs", { email: account.account.email });
      } else if (session) {
        who.textContent = tt("auth.welcome", {
          name: session.displayName || session.username,
          role: session.role
        });
      }
    }

    const planEl = $("#account-plan");
    if (planEl) {
      planEl.hidden = !(account && account.signedIn);
      if (account && account.signedIn) planEl.textContent = accountPlanLine(account.entitlement);
    }

    const syncEl = $("#account-sync");
    if (syncEl) {
      const line = accountSyncLine();
      syncEl.hidden = !line;
      syncEl.textContent = line;
    }

    // The trial is offered only to a signed-in account that has never used it.
    const trialBtn = $("#btn-account-trial");
    if (trialBtn) {
      trialBtn.hidden = !(
        account &&
        account.signedIn &&
        account.account &&
        !account.account.trialUsed &&
        !(account.entitlement && account.entitlement.pro)
      );
      // Name the length the press will actually give, read from the worker, the
      // same way the Pro dialog's button does. The neutral label is the fallback
      // for a worker that has not said yet; no label may name a month, because
      // the trial is seven days.
      const trialDays = Number(account && account.methods && account.methods.trialDays);
      noteTrialCtaView("panel");
      if (trialDays > 0) {
        // The generic [data-i18n] applier calls t(key) with no params, so a key
        // holding {n} would render the placeholder literally on a language
        // switch. Drop the attribute and own the label here; VTI18n.onChange
        // calls refreshAccountUI(), which is what re-translates it.
        trialBtn.removeAttribute("data-i18n");
        trialBtn.textContent = tt("auth.startTrialDays", { n: String(trialDays) });
      } else {
        trialBtn.setAttribute("data-i18n", "auth.startTrial");
        trialBtn.textContent = tt("auth.startTrial");
      }
    }
    const redeemForm = $("#account-redeem-form");
    if (redeemForm) redeemForm.hidden = !(account && account.signedIn);
    const syncBtn = $("#btn-account-sync");
    if (syncBtn) syncBtn.hidden = !(account && account.signedIn);

    // Studio gifting tools, for an account the worker itself calls an admin.
    const serverAdmin = $("#account-admin");
    if (serverAdmin) {
      serverAdmin.hidden = !(account && account.account && account.account.role === "admin");
    }

    if (admin) {
      admin.hidden = !session || session.role !== "admin";
      if (session && session.role === "admin") {
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
  }

  /**
   * Draw Google's sign-in button into the panel, if this deploy has one to draw.
   *
   * Called on every open, and again after signing out: the button lives in
   * Google's own iframe and signing out tears it down, so a panel that was only
   * ever mounted on open was left with no way back in — the person had to close
   * the modal and reopen it. Drawing happens here and not on page load because
   * loading Google's script is an off-origin request, and a visitor who only
   * practises must never make one.
   */
  function mountGoogleButton() {
    const slot = $("#account-google");
    if (!slot) return;
    if (!window.VTAccount?.isConfigured?.() || window.VTAccount.getState().signedIn) return;
    window.VTAccount.renderGoogleButton(slot, {
      onResult: (res) => {
        // Google's rendered button gives no press callback, so the earliest
        // moment we can see is the credential coming back. For Google, therefore,
        // signin_start means "returned from Google", not "pressed it", and the
        // start-to-outcome ratio is always 1. The press-but-never-return case is
        // invisible here; what covers the common cause of it is
        // account_panel_open with state "blocked", which counts the browsers
        // where Google's script would not load at all.
        trackFunnel("signin_start", { method: "google" });
        if (res && res.ok) {
          trackFunnel("signin_success", { method: "google" });
          toast(tt("auth.toast.in"));
          refreshAccountUI();
          updateBillingChrome();
        } else if (res) {
          trackFunnel("signin_fail", { method: "google", reason: funnelReason(res.reason) });
          accountErrorFor(res.reason);
        }
      }
    }).then(() => {
      // Whether the divider belongs on screen is a question about which methods
      // exist, not about whether Google's button drew, so one place decides it.
      refreshAccountUI();
    });
  }

  function openAccount() {
    const modal = $("#account-modal");
    if (!modal) return;
    const opener = document.activeElement;
    refreshAccountUI();
    const err = $("#login-error");
    if (err) {
      err.hidden = true;
      err.textContent = "";
    }
    accountError(null);
    // Opening this panel is the deliberate act that lets us ask the worker what
    // it offers; nothing is asked on page load, so a visitor who only practises
    // never touches it. The answer redraws the panel through onChange.
    const asking = window.VTAccount?.ensureMethods?.();
    mountGoogleButton();
    // What the visitor ends up looking at is the state worth counting, and on
    // the first open of a page load that is not knowable yet: nothing probes
    // /v1/auth/methods before this, so accountPanelState() would read "checking"
    // for nearly every first open and "offered" would barely appear. Waiting on
    // the same answer the panel waits on is what makes the histogram mean
    // something. `panel:open` keeps it one reading per load, so the states
    // cannot outnumber the browsers that opened the panel.
    const noteOpen = () =>
      trackFunnel("account_panel_open", { state: accountPanelState() }, "panel:open");
    Promise.resolve(asking).catch(() => null).then(noteOpen);
    // A floor, in case that answer never comes: `panel:open` means whichever of
    // the two lands first is the only one counted, so a worker that hangs leaves
    // a "checking" record rather than no record at all.
    setTimeout(noteOpen, 1500);
    modal.hidden = false;
    // Same reason as the Pro dialog: refreshAccountUI() has already run with the
    // panel hidden.
    noteTrialCtaView("panel");
    document.body.classList.add("account-open");
    const signedIn = !!window.VTAuth?.isLoggedIn?.() || !!window.VTAccount?.getState?.().signedIn;
    window.VTFocusTrap?.activate(modal, {
      initialFocus: accountInitialFocus(signedIn),
      returnFocus: opener
    });
  }

  function closeAccount() {
    const modal = $("#account-modal");
    if (modal) {
      modal.hidden = true;
      window.VTFocusTrap?.release(modal);
    }
    document.body.classList.remove("account-open");
  }

  function bindAuth() {
    $("#btn-account")?.addEventListener("click", openAccount);
    $("#account-close")?.addEventListener("click", closeAccount);
    $("#account-modal")?.addEventListener("click", (e) => {
      if (e.target === $("#account-modal")) closeAccount();
    });
    $("#btn-logout")?.addEventListener("click", async () => {
      // One button, both layers: an internal QA session and a real account can
      // both be live, and "Salir" has to mean signed out of everything.
      window.VTAuth?.logout?.();
      await window.VTAccount?.signOut?.();
      accountError(null);
      toast(tt("auth.toast.out"));
      refreshAccountUI();
      updateBillingChrome();
      // Signing out destroys Google's iframe, so without this the panel the
      // person is still looking at has no way back in.
      mountGoogleButton();
    });
    $("#account-retry")?.addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      const label = btn.textContent;
      btn.disabled = true;
      btn.textContent = tt("auth.retryChecking");
      accountError(null);
      try {
        await window.VTAccount?.refreshMethods?.();
        // The worker may now offer Google, and its script may now load, so the
        // button has to be given another chance to draw.
        mountGoogleButton();
      } finally {
        btn.disabled = false;
        btn.textContent = label;
        refreshAccountUI();
      }
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
    bindAccount();
    refreshAccountUI();
  }

  /** Everything in the account panel that talks to the entitlements worker. */
  function bindAccount() {
    /** Swap between the "enter your email" and "enter the code" steps. */
    function showCodeStep(email) {
      const emailForm = $("#account-email-form");
      const codeForm = $("#account-code-form");
      if (emailForm) emailForm.hidden = true;
      if (codeForm) {
        codeForm.hidden = false;
        codeForm.dataset.email = email;
      }
      accountError(null);
      const sent = $("#account-or");
      if (sent) sent.hidden = true;
      const google = $("#account-google");
      if (google) google.hidden = true;
      toast(tt("auth.codeSent", { email }));
      $("#account-code")?.focus();
    }

    function showEmailStep() {
      const emailForm = $("#account-email-form");
      const codeForm = $("#account-code-form");
      if (emailForm) emailForm.hidden = false;
      if (codeForm) codeForm.hidden = true;
      const google = $("#account-google");
      if (google) google.hidden = false;
      accountError(null);
    }

    $("#account-email-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = ($("#account-email")?.value || "").trim();
      accountError(null);
      trackFunnel("signin_start", { method: "email" });
      const res = await window.VTAccount?.startEmailSignIn?.(email);
      if (res && res.ok) showCodeStep(email);
      else {
        trackFunnel("signin_fail", { method: "email", reason: funnelReason(res && res.reason) });
        accountErrorFor(res && res.reason);
      }
    });

    $("#account-code-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("#account-code-form")?.dataset.email || "";
      const code = ($("#account-code")?.value || "").trim();
      accountError(null);
      const res = await window.VTAccount?.verifyEmailCode?.(email, code);
      if (res && res.ok) {
        trackFunnel("signin_success", { method: "email" });
        if ($("#account-code")) $("#account-code").value = "";
        showEmailStep();
        toast(tt("auth.toast.in"));
        refreshAccountUI();
        updateBillingChrome();
      } else {
        trackFunnel("signin_fail", { method: "email", reason: funnelReason(res && res.reason) });
        accountErrorFor(res && res.reason);
      }
    });

    $("#account-code-back")?.addEventListener("click", showEmailStep);

    $("#btn-account-trial")?.addEventListener("click", async () => {
      trackFunnel("trial_click", { where: "panel" });
      const res = await window.VTAccount?.startTrial?.();
      if (res && res.ok) {
        trackFunnel("trial_result", { outcome: "started", where: "panel", kind: "account" });
        toast(tt("pricing.toast.trialStarted", { n: res.days ?? "" }));
        refreshAccountUI();
        updateBillingChrome();
      } else {
        trackFunnel("trial_result", {
        outcome: funnelReason(res && res.reason),
        where: "panel",
        kind: "account"
      });
        accountErrorFor(res && res.reason);
      }
    });

    $("#account-redeem-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const code = ($("#account-redeem-code")?.value || "").trim();
      accountError(null);
      const res = await window.VTAccount?.redeem?.(code);
      if (res && res.ok) {
        if ($("#account-redeem-code")) $("#account-redeem-code").value = "";
        toast(tt("auth.redeemed", { days: res.days ?? "" }));
        refreshAccountUI();
        updateBillingChrome();
      } else {
        accountErrorFor(res && res.reason);
      }
    });

    $("#btn-account-sync")?.addEventListener("click", async () => {
      const res = await window.VTSync?.syncNow?.();
      refreshAccountUI();
      if (res && !res.ok) accountErrorFor(res.reason);
      else renderExerciseList();
    });

    function giftResult(text) {
      const el = $("#gift-result");
      if (!el) return;
      el.hidden = !text;
      el.textContent = text || "";
    }

    $("#gift-grant-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = ($("#gift-grant-email")?.value || "").trim();
      const days = Number($("#gift-grant-days")?.value || 30);
      const note = ($("#gift-grant-note")?.value || "").trim();
      const res = await window.VTAccount?.request?.("POST", "/v1/admin/grants", { email, days, note });
      if (res && res.ok) {
        giftResult(tt("auth.giftGranted", { days, email }));
        if ($("#gift-grant-email")) $("#gift-grant-email").value = "";
        if ($("#gift-grant-note")) $("#gift-grant-note").value = "";
      } else {
        giftResult(tt(ACCOUNT_ERROR_KEYS[res?.data?.reason] || "auth.err.generic"));
      }
    });

    $("#gift-code-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const days = Number($("#gift-code-days")?.value || 30);
      const maxRedemptions = Number($("#gift-code-uses")?.value || 1);
      const res = await window.VTAccount?.request?.("POST", "/v1/admin/gift-codes", {
        days,
        maxRedemptions
      });
      if (res && res.ok && res.data?.giftCode) {
        giftResult(tt("auth.giftMinted", { code: res.data.giftCode.code }));
        renderGiftCodes();
      } else {
        giftResult(tt("auth.err.generic"));
      }
    });

    /** List the codes an admin has minted, newest first. */
    async function renderGiftCodes() {
      const list = $("#gift-list");
      if (!list) return;
      const res = await window.VTAccount?.request?.("GET", "/v1/admin/gift-codes", null);
      if (!res || !res.ok) return;
      const esc = window.VTAuth?.escapeHtml || ((v) => String(v ?? ""));
      list.innerHTML = (res.data?.giftCodes || [])
        .map((g) => {
          const state = g.revokedAt
            ? tt("auth.giftRevoked")
            : `${g.redeemedCount}/${g.maxRedemptions}`;
          return `<li><code>${esc(g.code)}</code> · ${esc(String(g.days))}d · ${esc(state)}</li>`;
        })
        .join("");
    }

    $("#ab-results-load")?.addEventListener("click", renderAbResults);
    $("#funnel-load")?.addEventListener("click", renderFunnel);

    /**
     * The account and trial funnel for an admin: one proportion per step with
     * its 95% Wilson interval, conditional on the step before it, plus what
     * people actually saw when the account panel opened.
     *
     * Deliberately not a comparison between arms. At a 2% baseline a 20%
     * relative lift needs about 21,000 browsers per arm, which this site will
     * not see; a single proportion finds a step nobody gets through with about
     * thirty visitors. The margin is shown on every row so a small count reads
     * as a small count, and the note under the table says what the method
     * cannot do. Every number comes from the worker.
     */
    async function renderFunnel() {
      const box = $("#funnel-results");
      if (!box) return;
      const esc = window.VTAuth?.escapeHtml || ((v) => String(v ?? ""));
      box.hidden = false;
      box.textContent = tt("funnel.loading");
      const res = await window.VTAccount?.request?.("GET", "/v1/admin/funnel", null);
      if (!res || !res.ok || !res.data) {
        box.textContent = tt("funnel.error");
        return;
      }
      const data = res.data;
      const locale = window.VTI18n?.lang === "en" ? "en-GB" : "es-PE";
      const count = (v) => Number(v || 0).toLocaleString(locale);
      const pct = (v) => (v === null || v === undefined ? "–" : `${(v * 100).toFixed(1)} %`);
      if (!data.browsers) {
        box.innerHTML = `<p class="muted">${esc(tt("funnel.empty"))}</p>`;
        return;
      }
      const label = (step) => {
        const key = `funnel.step.${step.step}`;
        const translated = tt(key);
        // The worker sends an English label; use it only where no translation
        // exists, rather than showing a raw key.
        return translated === key ? step.label || step.step : translated;
      };
      const rows = (data.steps || [])
        .map((st) => {
          const range = st.rate === null ? "–" : `${pct(st.lo)} – ${pct(st.hi)}`;
          return `<tr><td>${esc(label(st))}</td><td>${count(st.browsers)}</td><td>${st.of === null ? "–" : count(st.of)}</td><td>${esc(pct(st.rate))}</td><td class="muted">${esc(range)}</td></tr>`;
        })
        .join("");
      const states = Object.entries(data.panelStates || {})
        .filter(([, n]) => Number(n) > 0)
        .map(([key, n]) => {
          const cap = key.charAt(0).toUpperCase() + key.slice(1);
          return `<li>${esc(tt(`funnel.state${cap}`))}: <strong>${count(n)}</strong></li>`;
        })
        .join("");
      // Every branch of both trial buttons ends in a trial_result, so the step's
      // rate says nothing and this list is where the leak shows: "we asked them
      // to sign in first" is a press that worked and still did not start a trial.
      const outcomes = (data.trialOutcomes || [])
        .filter((o) => Number(o.browsers) > 0)
        .map((o) => {
          const key = `funnel.outcome.${o.outcome}`;
          const name = tt(key) === key ? o.outcome : tt(key);
          return `<li>${esc(name)}: <strong>${count(o.browsers)}</strong></li>`;
        })
        .join("");
      box.innerHTML = `
        <p class="muted">${esc(tt("funnel.window", { n: String(data.window?.days ?? ""), browsers: count(data.browsers) }))}</p>
        <div class="ab-table-wrap">
          <table class="ab-table">
            <thead><tr>
              <th>${esc(tt("funnel.stepHead"))}</th>
              <th>${esc(tt("funnel.nHead"))}</th>
              <th>${esc(tt("funnel.ofHead"))}</th>
              <th>${esc(tt("funnel.rateHead"))}</th>
              <th>${esc(tt("funnel.rangeHead"))}</th>
            </tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        ${states ? `<p class="muted">${esc(tt("funnel.states"))}</p><ul class="admin-user-list">${states}</ul>` : ""}
        ${outcomes ? `<p class="muted">${esc(tt("funnel.outcomes"))}</p><ul class="admin-user-list">${outcomes}</ul>` : ""}
        <p class="muted">${esc(tt("funnel.note"))}</p>
      `;
    }

    /**
     * A/B results for an admin: how events are arriving, exposures per arm,
     * where each test stands against its plan, the preset metrics with 95%
     * intervals, and the warnings that mean "do not read this yet". The
     * numbers and verdicts come from the worker; nothing is computed here.
     * Differences and p-values appear only once the worker says the plan is
     * met (horizon.reached): until then the arms' own counts, and the date.
     */
    async function renderAbResults() {
      const box = $("#ab-results");
      if (!box) return;
      const esc = window.VTAuth?.escapeHtml || ((v) => String(v ?? ""));
      box.hidden = false;
      box.textContent = tt("ab.loading");
      const list = await window.VTAccount?.request?.("GET", "/v1/admin/experiments", null);
      if (!list || !list.ok) {
        box.textContent = tt("ab.error");
        return;
      }
      const locale = window.VTI18n?.lang === "en" ? "en-GB" : "es-PE";
      const count = (v) => Number(v || 0).toLocaleString(locale);
      const date = (sec) => new Date(sec * 1000).toLocaleDateString(locale, { day: "numeric", month: "short", year: "numeric" });
      const pct = (v) => (v === null || v === undefined ? "–" : `${(v * 100).toFixed(1)} %`);
      const num = (v) => (v === null || v === undefined ? "–" : v.toFixed(2));
      const pval = (p) => (p === null || p === undefined ? "p = –" : p < 0.001 ? "p < 0.001" : `p = ${p.toFixed(3)}`);
      const parts = [ingestHtml(list.data?.ingest, { esc, count, date })];
      const all = list.data?.experiments || [];
      const live = all.filter((x) => (x.arms || []).length);
      if (!live.length) {
        parts.push(`<p class="muted">${esc(tt("ab.none"))}</p>`);
        box.innerHTML = parts.join("");
        return;
      }
      for (const x of live) {
        const res = await window.VTAccount.request(
          "GET",
          `/v1/admin/experiments/results?experiment=${encodeURIComponent(x.experiment)}`,
          null
        );
        const d = res && res.ok ? res.data : null;
        let html = `<section class="ab-exp"><h5><code>${esc(x.experiment)}</code></h5>`;
        if (!d) {
          parts.push(`${html}<p class="muted">${esc(tt("ab.error"))}</p></section>`);
          continue;
        }
        // An older worker sends no horizon; treat it as open, as it was.
        const h = d.horizon || { reached: true };
        if (h.nPerArm) html += `<p class="muted">${esc(tt("ab.plan", { n: count(h.nPerArm), days: h.minDays }))}</p>`;
        if (h.reached) {
          if (h.readyAt) html += `<p class="ab-plan">${esc(tt("ab.ready", { date: date(h.readyAt) }))}</p>`;
        } else {
          const when = !h.readyAt
            ? tt("ab.readyUnknown")
            : tt(h.estimated ? "ab.readyAround" : "ab.readyOn", { date: date(h.readyAt) });
          html += `<p class="ab-plan">${esc(tt("ab.tooEarly", { have: count(h.counted), n: count(h.nPerArm) }))} ${esc(when)}</p>`;
        }
        // The split check is shown every time, flagged or not.
        if (d.srm?.flagged) html += `<p class="ab-warn">${esc(tt("ab.srm", { p: pval(d.srm.p) }))}</p>`;
        else if (d.srm && d.srm.p !== null && d.srm.p !== undefined) html += `<p class="muted">${esc(tt("ab.srmOk", { p: pval(d.srm.p) }))}</p>`;
        for (const e of d.eventMix?.events || []) {
          if (!e.flagged) continue;
          html += `<p class="ab-warn">${esc(tt(e.reason === "missing" ? "ab.mixMissing" : "ab.mixDiffers", { event: e.event, p: pval(e.p) }))}</p>`;
        }
        if (h.reached && d.readMe === "small_sample") html += `<p class="muted">${esc(tt("ab.small"))}</p>`;
        for (const m of d.metrics || []) {
          const share = m.kind === "share";
          const role = tt(m.role === "primary" ? "ab.primary" : "ab.guardrail");
          html += `<p class="ab-metric">${esc(tt(share ? "ab.metric.share" : "ab.metric.days", { role, event: m.event, from: m.from, to: m.to }))}</p>`;
          if (!(m.arms || []).length) {
            html += `<p class="muted">${esc(tt("ab.immature", { to: m.to }))}</p>`;
            continue;
          }
          const exposed = Object.fromEntries((d.exposed || []).map((a) => [a.variant, a.n]));
          const rows = m.arms
            .map((a) => {
              const val = share ? pct(a.rate) : num(a.mean);
              const ci = share ? `${pct(a.lo)}–${pct(a.hi)}` : `${num(a.lo)}–${num(a.hi)}`;
              return `<tr><td><code>${esc(a.variant)}</code></td><td>${esc(count(exposed[a.variant] ?? a.n))} · ${esc(count(a.n))}</td><td>${esc(val)} <span class="ab-ci">(${esc(ci)})</span></td></tr>`;
            })
            .join("");
          html += `<div class="ab-table-wrap"><table class="ab-table"><thead><tr><th>${esc(tt("ab.arm"))}</th><th>${esc(tt("ab.exposed"))}</th><th>${esc(tt("ab.value"))}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
          for (const c of m.comparisons || []) {
            const fmt = (v) => (v === null || v === undefined ? "–" : share ? `${v >= 0 ? "+" : ""}${(v * 100).toFixed(1)} pts` : `${v >= 0 ? "+" : ""}${v.toFixed(2)}`);
            html += `<p class="ab-diff">${esc(tt("ab.diff", { variant: c.variant, vs: c.vs, diff: fmt(c.diff), lo: fmt(c.lo), hi: fmt(c.hi), p: pval(c.p) }))}</p>`;
          }
        }
        parts.push(`${html}</section>`);
      }
      box.innerHTML = parts.join("");
    }

    /**
     * One line on how events are arriving: the client posts no-cors and never
     * sees a refusal, so a wrong origin or a stuck limit shows up here or
     * nowhere.
     */
    function ingestHtml(ingest, { esc, count, date }) {
      if (!ingest) return "";
      const t = ingest.totals || {};
      const sum = (keys) => keys.reduce((n, k) => n + (Number(t[k]) || 0), 0);
      const dropped = sum(["unknown_event", "bad_cid", "not_an_object"]);
      const refusedKeys = ["origin_not_allowed", "rate_limited", "opted_out", "automated", "body_too_large", "bad_request"];
      const refused = sum(refusedKeys);
      if (!t.accepted && !dropped && !refused) return `<p class="muted ab-ingest">${esc(tt("ab.ingestNone"))}</p>`;
      let line = tt("ab.ingest", { accepted: count(t.accepted), dropped: count(dropped), refused: count(refused) });
      const reasons = refusedKeys.filter((k) => t[k]).map((k) => `${k} ${count(t[k])}`);
      if (reasons.length) line += ` ${tt("ab.ingestReasons", { list: reasons.join(", ") })}`;
      if (ingest.lastAcceptedAt) line += ` ${tt("ab.ingestLast", { when: date(ingest.lastAcceptedAt) })}`;
      // A wrong origin or a stuck limit is a broken pipeline; opted-out and
      // automated refusals are the system working.
      const broken = sum(["origin_not_allowed", "rate_limited"]) > 0;
      return `<p class="${broken ? "ab-warn" : "muted"} ab-ingest">${esc(line)}</p>`;
    }

    window.VTAccount?.onChange?.(() => {
      refreshAccountUI();
      updateBillingChrome();
      // Signing in is the moment the plan becomes known, and the home card
      // carries the same claim as the header. Without this it kept whatever it
      // said before the visitor signed in, which was "Gratis".
      renderValuePulse();
    });
    window.VTSync?.onChange?.(() => refreshAccountUI());
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
    $("#btn-recheck-payment")?.addEventListener("click", () => {
      const claiming = window.VTBilling?.resumePendingClaim?.({ force: true });
      if (!claiming) {
        toast(tt("pricing.toast.verifyFailed"), { durationMs: 5200 });
        return;
      }
      toast(tt("pricing.toast.verifyPending"), { durationMs: 3600 });
      claiming.then((res) => {
        toast(res?.ok ? tt("pricing.toast.verifyOk") : tt("pricing.toast.verifyFailed"), {
          durationMs: res?.ok ? 3600 : 6000
        });
        updateBillingChrome();
        renderPricingModal();
      });
    });
    $("#btn-start-trial")?.addEventListener("click", async () => {
      trackFunnel("trial_click", { where: "pricing" });
      // Which trial this is belongs to the worker, so ask before choosing:
      // guessing "local" hands out a browser trial that a later server trial
      // then duplicates, and guessing "server" sends someone to a panel that
      // may have no way in. openPricing() has usually already asked, so this
      // returns at once — but a click must never hang on the network, so a
      // worker that has not answered by now counts as no worker.
      await Promise.race([
        window.VTAccount?.ensureMethods?.() || Promise.resolve(null),
        new Promise((resolve) => setTimeout(resolve, 1200))
      ]);
      const acct = window.VTAccount?.getState?.() || null;
      // Only hand the trial to the account layer once this deploy can actually
      // sign someone in. A worker with no sign-in method would otherwise send
      // them to a panel saying accounts are switched off, with the local trial
      // they could have had now unreachable — the free trial would dead-end.
      if (accountSignIn().offered) {
        // Not signed in: send them to the panel rather than starting a trial
        // this browser would forget and the next one would hand out again.
        if (!acct?.signedIn) {
          // Not a failure: the press worked and sent them to sign in. It is the
          // step where the funnel most plausibly leaks, so it gets its own id
          // rather than being folded into an error.
          trackFunnel("trial_result", { outcome: "needs_account", where: "pricing", kind: "account" });
          toast(tt("pricing.trialNeedsAccount"), { durationMs: 4200 });
          closePricing();
          openAccount();
          return;
        }
        const res = await window.VTAccount.startTrial();
        if (res && res.ok) {
          trackFunnel("trial_result", { outcome: "started", where: "pricing", kind: "account" });
          toast(tt("pricing.toast.trialStarted", { n: String(res.days ?? "") }));
        } else {
          trackFunnel("trial_result", {
          outcome: funnelReason(res && res.reason),
          where: "pricing",
          kind: "account"
        });
          toast(tt("pricing.toast.trialUsed"), { durationMs: 4200 });
        }
        updateBillingChrome();
        renderPricingModal();
        return;
      }
      if (!window.VTBilling?.startTrial) return;
      const res = VTBilling.startTrial();
      if (!res.ok) {
        trackFunnel("trial_result", { outcome: funnelReason(res.reason), where: "pricing", kind: "local" });
        toast(tt("pricing.toast.trialUsed"), { durationMs: 4200 });
      } else {
        trackFunnel("trial_result", { outcome: "started", where: "pricing", kind: "local" });
        toast(tt("pricing.toast.trialStarted", { n: String(VTBilling.trialDaysLeft?.() ?? 0) }));
      }
      updateBillingChrome();
      renderPricingModal();
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
        renderValuePulse();
        if ($("#pricing-modal") && !$("#pricing-modal").hidden) renderPricingModal();
      });
      const ret = VTBilling.handleReturnFromCheckout();
      // Somebody who was signed in when they paid should own the subscription,
      // not just the browser they happened to pay in. Attaching it here is what
      // makes it show up on their phone afterwards.
      if (ret?.event === "success" && ret.sessionId && ret.provider) {
        window.VTAccount?.linkCheckout?.({ provider: ret.provider, sessionId: ret.sessionId })
          .then((res) => {
            if (res?.ok) {
              updateBillingChrome();
              refreshAccountUI();
            }
          })
          .catch(() => {
            /* the anonymous claim path still grants Pro in this browser */
          });
      }
      if (ret?.event === "success" && ret.pendingVerification) {
        // Payment recorded; Pro waits on the entitlement worker's signed license.
        toast(tt("pricing.toast.verifyPending"), { durationMs: 4600 });
        ret.claiming?.then((res) => {
          toast(res?.ok ? tt("pricing.toast.verifyOk") : tt("pricing.toast.verifyFailed"), {
            durationMs: res?.ok ? 3600 : 6000
          });
          updateBillingChrome();
          if ($("#pricing-modal") && !$("#pricing-modal").hidden) renderPricingModal();
        });
      } else if (ret?.event === "success") {
        toast(tt("pricing.toast.success"));
      }
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
    fitHighwayToViewport,
    syncHeaderHeightVar,
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
    refreshStartPanel: renderNextStepCard,
    startDaily,
    startStructured,
    recordPracticeIfDue,
    advanceStructured,
    dailySession,
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
        if ($("#step-done") && !$("#step-done").hidden) renderStepDone();
        // Plan and history build their copy at render time, so a language
        // switch has to re-render them or they stay in the old language.
        if (state.view === "plan") renderPlan();
        if (state.view === "history") renderHistory();
        updateSessionBanner();
        // Refresh tour button label
        const tb = $("#btn-tour");
        if (tb) tb.textContent = tt("nav.tour");
        // Anything whose copy is written once at render time has to be redone
        // here or it keeps the language the page loaded in. The start panel
        // carries the tour invitation; the reminders panel carries the streak
        // line; the footer's guide link has to point at the right half of
        // guide.html.
        renderNextStepCard();
        renderRetentionChrome();
        syncGuideLinks();
        // The tour card is built in JS and its copy resolved once per step, so
        // without this an open tour stays in the language it opened in.
        if (window.VTTour?.isActive?.()) window.VTTour.rerender();
        updateBillingChrome();
        refreshAccountUI();
        renderValuePulse();
        if ($("#pricing-modal") && !$("#pricing-modal").hidden) renderPricingModal();
      };
    }
    syncGuideLinks();
    const settings = VTStorage.getSettings();
    state.tab = settings.lastTab || "vocal";
    // The daily loop draws into home and starts routines through these.
    window.VTLoop?.bind?.({
      getTab: () => state.tab,
      setTab,
      findExercise,
      startRoutine: (r) => startStructured(r.path || "basics", r),
      startDaily,
      toast: (msg, opts) => toast(msg, opts),
      hideToast: () => {
        clearTimeout(toast._t);
        $("#toast")?.classList.remove("show");
      },
      refresh: () => {
        renderNextStepCard();
        renderTodayBasics();
      },
      focusReminders: () => {
        if (state.view !== "home") setView("home");
        const panel = $("#retain-panel");
        panel?.scrollIntoView({ block: "center", behavior: scrollBehavior() });
        $("#chk-reminders")?.focus({ preventScroll: true });
      }
    });
    bind();
    bindHeaderMenu();
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
      toast(tt("toast.pausedSession"));
    }

    // Interactive intro tour (first visit or header Tour button)
    if (window.VTTour) {
      VTTour.bindReplayButton();
      VTTour.bindUiHelpButton?.();
      VTTour.maybeAutoStart();
    }
    // Ensure default 1-nota is reflected in select even before first exercise
    setPlayMode("oneNote", { silent: true });
    syncHeaderHeightVar();
    fitHighwayToViewport();
    watchStageRails();
    window.addEventListener("resize", () => {
      syncHeaderHeightVar();
      scheduleFitHighway();
    });
    window.addEventListener("orientationchange", () => {
      setTimeout(() => {
        syncHeaderHeightVar();
        fitHighwayToViewport();
      }, 120);
    });
    // Mobile browser chrome show/hide + pinch-zoom visual viewport
    try {
      if (window.visualViewport) {
        window.visualViewport.addEventListener("resize", scheduleFitHighway);
        window.visualViewport.addEventListener("scroll", scheduleFitHighway);
      }
    } catch {
      /* ignore */
    }
    document.addEventListener("fullscreenchange", () => {
      scheduleFitHighway();
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();
