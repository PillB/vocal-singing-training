/**
 * Interactive tours — home product tour + per-UI-type exercise coach-marks.
 *
 * UX (NN/g + product-tour patterns):
 *  - Spotlight + short steps (≤7) only on visible UI
 *  - First-time per layout family; always Skip; Esc / arrows
 *  - Replay via header Tour (home) or exercise "?" button
 *  - Never trap e2e (Headless / vt_e2e / ?e2e)
 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "vt_tour_v1";
  const UI_SEEN_KEY = "vt_ui_tour_seen_v1";

  function t(key, vars) {
    if (typeof global.t === "function") return global.t(key, vars);
    if (global.VTI18n && typeof global.VTI18n.t === "function") return global.VTI18n.t(key, vars);
    return key;
  }

  function isEs() {
    if (global.VTI18n && global.VTI18n.lang) return global.VTI18n.lang === "es";
    return (document.documentElement.lang || "es").startsWith("es");
  }

  function done() {
    try {
      return localStorage.getItem(STORAGE_KEY) === "1";
    } catch {
      return false;
    }
  }

  function markDone() {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* private mode */
    }
  }

  function clearDone() {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  function readUiSeen() {
    try {
      return JSON.parse(localStorage.getItem(UI_SEEN_KEY) || "{}") || {};
    } catch {
      return {};
    }
  }

  function markUiSeen(family) {
    if (!family) return;
    try {
      const o = readUiSeen();
      o[family] = 1;
      localStorage.setItem(UI_SEEN_KEY, JSON.stringify(o));
    } catch {
      /* ignore */
    }
  }

  function clearUiSeen(family) {
    try {
      if (!family) {
        localStorage.removeItem(UI_SEEN_KEY);
        return;
      }
      const o = readUiSeen();
      delete o[family];
      localStorage.setItem(UI_SEEN_KEY, JSON.stringify(o));
    } catch {
      /* ignore */
    }
  }

  function isUiSeen(family) {
    return !!readUiSeen()[family];
  }

  /** Home / product tour steps */
  function homeSteps() {
    return [
      {
        id: "welcome",
        titleKey: "tour.s1.title",
        bodyKey: "tour.s1.body",
        target: null,
        place: "center"
      },
      {
        id: "tabs",
        titleKey: "tour.s2.title",
        bodyKey: "tour.s2.body",
        target: ".tabs",
        place: "bottom",
        ensureHome: true
      },
      {
        id: "tiers",
        titleKey: "tour.s3.title",
        bodyKey: "tour.s3.body",
        target: ".tier-filters",
        place: "bottom",
        ensureHome: true
      },
      {
        id: "cards",
        titleKey: "tour.s4.title",
        bodyKey: "tour.s4.body",
        target: "#exercise-list",
        place: "top",
        ensureHome: true
      },
      {
        id: "session",
        titleKey: "tour.s5.title",
        bodyKey: "tour.s5.body",
        target: ".continue-toolbar",
        place: "bottom",
        ensureHome: true
      },
      {
        id: "nav",
        titleKey: "tour.s6.title",
        bodyKey: "tour.s6.body",
        target: ".header-actions",
        place: "bottom",
        ensureHome: true
      },
      {
        id: "cockpit",
        titleKey: "tour.s7.title",
        bodyKey: "tour.s7.body",
        target: "#practice-cockpit",
        place: "bottom",
        openSampleExercise: true
      },
      {
        id: "start",
        titleKey: "tour.s8.title",
        bodyKey: "tour.s8.body",
        target: "#btn-practice-start",
        place: "top",
        openSampleExercise: true
      },
      {
        id: "highway",
        titleKey: "tour.s9.title",
        bodyKey: "tour.s9.body",
        target: "#highway-stage",
        place: "bottom",
        openSampleExercise: true,
        preferSinging: true
      },
      {
        id: "hud",
        titleKey: "tour.s10.title",
        bodyKey: "tour.s10.body",
        target: ".hud-bl",
        place: "top",
        openSampleExercise: true
      },
      {
        id: "metrics",
        titleKey: "tour.s11.title",
        bodyKey: "tour.s11.body",
        target: "#btn-complete",
        place: "top",
        openSampleExercise: true,
        scrollTarget: true
      },
      {
        id: "done",
        titleKey: "tour.s12.title",
        bodyKey: "tour.s12.body",
        target: null,
        place: "center",
        ensureHome: true
      }
    ];
  }

  /**
   * Exercise UI packs — only steps whose targets are visible are shown.
   * Families: highway | speech | hold
   */
  function packSteps(family) {
    const common = [
      {
        id: "ex-start",
        titleKey: "uiTour.start.title",
        bodyKey: "uiTour.start.body",
        target: "#btn-practice-start",
        place: "top"
      },
      {
        id: "ex-mic",
        titleKey: "uiTour.mic.title",
        bodyKey: "uiTour.mic.body",
        target: "#mic-sens-hud",
        place: "top"
      },
      {
        id: "ex-guide",
        titleKey: "uiTour.guide.title",
        bodyKey: "uiTour.guide.body",
        target: ".guide-card",
        place: "top",
        scrollTarget: true
      }
    ];

    if (family === "highway") {
      return [
        {
          id: "hw-intro",
          titleKey: "uiTour.hw.intro.title",
          bodyKey: "uiTour.hw.intro.body",
          target: "#practice-cockpit",
          place: "bottom"
        },
        {
          id: "hw-canvas",
          titleKey: "uiTour.hw.canvas.title",
          bodyKey: "uiTour.hw.canvas.body",
          target: "#pitch-canvas",
          place: "bottom"
        },
        {
          id: "hw-top",
          titleKey: "uiTour.hw.top.title",
          bodyKey: "uiTour.hw.top.body",
          target: "#hud-top-rail",
          place: "bottom"
        },
        {
          id: "hw-prog",
          titleKey: "uiTour.hw.prog.title",
          bodyKey: "uiTour.hw.prog.body",
          target: "#hud-prog-bar",
          place: "bottom",
          requireVisible: true
        },
        {
          id: "hw-score",
          titleKey: "uiTour.hw.score.title",
          bodyKey: "uiTour.hw.score.body",
          target: "#pitch-game-hud",
          place: "bottom"
        },
        {
          id: "hw-start",
          titleKey: "uiTour.start.title",
          bodyKey: "uiTour.start.body",
          target: "#btn-practice-start",
          place: "top"
        },
        {
          id: "hw-oct",
          titleKey: "uiTour.hw.oct.title",
          bodyKey: "uiTour.hw.oct.body",
          target: "#oct-controls",
          place: "top",
          requireVisible: true
        },
        {
          id: "hw-mode",
          titleKey: "uiTour.hw.mode.title",
          bodyKey: "uiTour.hw.mode.body",
          target: "#sel-play-mode",
          place: "top",
          requireVisible: true
        },
        {
          id: "hw-cue",
          titleKey: "uiTour.hw.cue.title",
          bodyKey: "uiTour.hw.cue.body",
          target: "#mode-cue",
          place: "top",
          requireVisible: true
        },
        {
          id: "hw-done",
          titleKey: "uiTour.done.title",
          bodyKey: "uiTour.done.body",
          target: null,
          place: "center"
        }
      ];
    }

    if (family === "hold") {
      return [
        {
          id: "hold-intro",
          titleKey: "uiTour.hold.intro.title",
          bodyKey: "uiTour.hold.intro.body",
          target: "#practice-cockpit",
          place: "bottom"
        },
        {
          id: "hold-live",
          titleKey: "uiTour.hold.live.title",
          bodyKey: "uiTour.hold.live.body",
          target: "#hold-display",
          place: "bottom",
          requireVisible: true
        },
        ...common,
        {
          id: "hold-block",
          titleKey: "uiTour.hold.block.title",
          bodyKey: "uiTour.hold.block.body",
          target: "#hold-block",
          place: "top",
          requireVisible: true
        },
        {
          id: "hold-done",
          titleKey: "uiTour.done.title",
          bodyKey: "uiTour.done.body",
          target: null,
          place: "center"
        }
      ];
    }

    // speech / generic non-pitch
    return [
      {
        id: "sp-intro",
        titleKey: "uiTour.sp.intro.title",
        bodyKey: "uiTour.sp.intro.body",
        target: "#practice-cockpit",
        place: "bottom"
      },
      {
        id: "sp-focus",
        titleKey: "uiTour.sp.focus.title",
        bodyKey: "uiTour.sp.focus.body",
        target: "#mode-focus",
        place: "bottom",
        requireVisible: true
      },
      ...common,
      {
        id: "sp-done",
        titleKey: "uiTour.done.title",
        bodyKey: "uiTour.done.body",
        target: null,
        place: "center"
      }
    ];
  }

  /** Infer UI family from live exercise profile + DOM */
  function detectUiFamily(profile) {
    if (profile?.showPitch) return "highway";
    if (profile?.showHold) return "hold";
    return "speech";
  }

  function isVisible(el) {
    if (!el) return false;
    if (el.hidden) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || Number(st.opacity) === 0) {
      return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  }

  function filterSteps(list) {
    return (list || []).filter((step) => {
      if (!step.target) return true;
      const el = document.querySelector(step.target);
      if (step.requireVisible) return isVisible(el);
      // Soft: skip if totally missing
      if (!el) return false;
      if (el.hidden) return false;
      return true;
    });
  }

  let ui = null;
  let index = 0;
  let active = false;
  let currentPack = null; // null = home tour
  let stayOnEnd = false;
  let stepList = [];

  function ensureUI() {
    if (ui) return ui;
    const root = document.createElement("div");
    root.id = "tour-root";
    root.className = "tour-root";
    root.hidden = true;
    root.innerHTML = `
      <div class="tour-backdrop" data-tour-backdrop></div>
      <div class="tour-spotlight" data-tour-spot aria-hidden="true"></div>
      <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" data-tour-card>
        <div class="tour-progress" data-tour-progress></div>
        <h3 id="tour-title" data-tour-title></h3>
        <p class="tour-body" data-tour-body></p>
        <div class="tour-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-tour-skip></button>
          <div class="tour-nav">
            <button type="button" class="btn btn-sm" data-tour-prev></button>
            <button type="button" class="btn btn-primary btn-sm" data-tour-next></button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);
    ui = {
      root,
      spot: root.querySelector("[data-tour-spot]"),
      card: root.querySelector("[data-tour-card]"),
      title: root.querySelector("[data-tour-title]"),
      body: root.querySelector("[data-tour-body]"),
      progress: root.querySelector("[data-tour-progress]"),
      skip: root.querySelector("[data-tour-skip]"),
      prev: root.querySelector("[data-tour-prev]"),
      next: root.querySelector("[data-tour-next]")
    };
    ui.skip.addEventListener("click", () => end(true));
    ui.prev.addEventListener("click", () => go(index - 1));
    ui.next.addEventListener("click", () => {
      if (index >= stepList.length - 1) end(true);
      else go(index + 1);
    });
    root.querySelector("[data-tour-backdrop]")?.addEventListener("click", () => {
      /* intentional skip only */
    });
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    return ui;
  }

  function onKey(e) {
    if (!active) return;
    if (e.key === "Escape") {
      e.preventDefault();
      end(true);
    } else if (e.key === "ArrowRight" || e.key === "Enter") {
      e.preventDefault();
      ui.next.click();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      ui.prev.click();
    }
  }

  function onResize() {
    if (active && stepList[index]) positionStep(stepList[index]);
  }

  function goHome() {
    const home = document.getElementById("view-home");
    const ex = document.getElementById("view-exercise");
    if (home && !home.classList.contains("active")) {
      document.getElementById("btn-back-home")?.click();
      const leave = document.getElementById("leave-cancel");
      if (leave && !document.getElementById("leave-modal")?.hidden) leave.click();
      home.classList.add("active");
      ex?.classList.remove("active");
      document.body.classList.remove("view-exercise");
    }
  }

  function openSample(preferSinging) {
    if (preferSinging) {
      const singingTab = document.querySelector('.tab[data-tab="singing"]');
      if (singingTab && !singingTab.classList.contains("active")) singingTab.click();
      const basic = document.querySelector('.tier-chip[data-tier="basic"]');
      if (basic) basic.click();
    } else {
      const vocalTab = document.querySelector('.tab[data-tab="vocal"]');
      if (vocalTab && !vocalTab.classList.contains("active")) vocalTab.click();
      const basic = document.querySelector('.tier-chip[data-tier="basic"]');
      if (basic) basic.click();
    }
    const card = document.querySelector("#exercise-list .card-ex");
    if (card) card.click();
  }

  function prepare(step) {
    if (step.ensureHome) {
      goHome();
      if (step.id === "tabs" || step.id === "tiers" || step.id === "cards") {
        const vocal = document.querySelector('.tab[data-tab="vocal"]');
        if (vocal && !vocal.classList.contains("active")) vocal.click();
      }
    }
    if (step.openSampleExercise) {
      const onEx = document.getElementById("view-exercise")?.classList.contains("active");
      if (!onEx || step.preferSinging) {
        openSample(!!step.preferSinging);
      }
    }
    if (step.scrollTarget && step.target) {
      const el = document.querySelector(step.target);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function clearHighlight() {
    document.querySelectorAll(".tour-highlight").forEach((el) => {
      el.classList.remove("tour-highlight");
    });
  }

  function positionStep(step) {
    const u = ensureUI();
    clearHighlight();
    u.spot.style.opacity = "0";
    u.spot.style.width = "0";
    u.spot.style.height = "0";

    if (!step.target || step.place === "center") {
      u.card.classList.add("tour-card-center");
      u.card.style.top = "50%";
      u.card.style.left = "50%";
      u.card.style.transform = "translate(-50%, -50%)";
      u.card.style.width = `${Math.min(400, window.innerWidth - 24)}px`;
      return;
    }

    u.card.classList.remove("tour-card-center");
    const el = document.querySelector(step.target);
    if (!el || !isVisible(el)) {
      u.card.classList.add("tour-card-center");
      u.card.style.top = "50%";
      u.card.style.left = "50%";
      u.card.style.transform = "translate(-50%, -50%)";
      return;
    }

    el.classList.add("tour-highlight");
    el.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });

    const r = el.getBoundingClientRect();
    const pad = 8;
    u.spot.style.opacity = "1";
    u.spot.style.left = `${Math.max(4, r.left - pad)}px`;
    u.spot.style.top = `${Math.max(4, r.top - pad)}px`;
    u.spot.style.width = `${Math.min(window.innerWidth - 8, r.width + pad * 2)}px`;
    u.spot.style.height = `${Math.min(window.innerHeight - 8, r.height + pad * 2)}px`;

    const cardW = Math.min(400, window.innerWidth - 24);
    // Measure actual card after content set — use generous estimate then clamp
    const cardH = Math.min(280, Math.max(160, u.card.offsetHeight || 220));
    let top = r.bottom + 12;
    let left = Math.min(Math.max(12, r.left), window.innerWidth - cardW - 12);
    if (step.place === "top" || top + cardH > window.innerHeight - 12) {
      top = Math.max(12, r.top - cardH - 12);
    }
    if (step.place === "bottom" && r.bottom + cardH + 24 < window.innerHeight) {
      top = r.bottom + 14;
    }
    u.card.style.transform = "none";
    u.card.style.left = `${left}px`;
    u.card.style.top = `${Math.max(12, Math.min(top, window.innerHeight - cardH - 12))}px`;
    u.card.style.width = `${cardW}px`;
  }

  function render() {
    const step = stepList[index];
    if (!step) return end(true);
    const u = ensureUI();
    prepare(step);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        u.title.textContent = t(step.titleKey);
        u.body.textContent = t(step.bodyKey);
        u.progress.textContent = t("tour.progress", {
          n: String(index + 1),
          total: String(stepList.length)
        });
        u.skip.textContent = t("tour.skip");
        u.prev.textContent = t("tour.prev");
        u.next.textContent =
          index >= stepList.length - 1 ? t("tour.finish") : t("tour.next");
        u.prev.disabled = index === 0;
        u.prev.setAttribute("aria-disabled", String(index === 0));
        positionStep(step);
        try {
          u.next.focus({ preventScroll: true });
        } catch {
          u.next.focus();
        }
      });
    });
  }

  function go(i) {
    index = Math.max(0, Math.min(stepList.length - 1, i));
    render();
  }

  function beginTour(steps, { fromButton, pack, stay } = {}) {
    ensureUI();
    stepList = filterSteps(steps);
    if (!stepList.length) {
      stepList = steps.filter((s) => !s.target);
    }
    if (!stepList.length) return;
    active = true;
    index = 0;
    currentPack = pack || null;
    stayOnEnd = !!stay;
    ui.root.hidden = false;
    document.body.classList.add("tour-active");
    if (fromButton && !pack) goHome();
    render();
  }

  function start(fromButton) {
    beginTour(homeSteps(), { fromButton: !!fromButton, pack: null, stay: false });
  }

  /**
   * Start exercise UI pack for a layout family.
   * @param {string} family highway|speech|hold
   * @param {{ force?: boolean }} opts
   */
  function startUiPack(family, opts = {}) {
    const fam = family || "speech";
    if (!opts.force && isUiSeen(fam)) return false;
    if (active) return false;
    // Auto-start respects e2e/headless block; forced replay ("?") always runs
    if (!opts.force && shouldBlockAuto()) return false;
    beginTour(packSteps(fam), { pack: fam, stay: true, fromButton: false });
    return true;
  }

  function shouldBlockAuto() {
    try {
      if (global.navigator && /Headless|Playwright|Puppeteer/i.test(navigator.userAgent)) {
        return true;
      }
      if (sessionStorage.getItem("vt_e2e") === "1") return true;
      if (new URLSearchParams(location.search).has("e2e")) return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  /**
   * After opening an exercise — auto-run pack for first-time UI family.
   * Debounced so layout (pitch canvas, mode mount) is ready.
   */
  function maybeExerciseTour(profile) {
    if (shouldBlockAuto()) return;
    if (active) return;
    // Don't stack on first-visit home tour
    if (!done()) return;
    const family = detectUiFamily(profile);
    if (isUiSeen(family)) return;
    setTimeout(() => {
      if (active) return;
      if (!document.body.classList.contains("view-exercise")) return;
      startUiPack(family, { force: false });
    }, 700);
  }

  function end(mark) {
    const pack = currentPack;
    const stay = stayOnEnd;
    active = false;
    clearHighlight();
    if (ui) ui.root.hidden = true;
    document.body.classList.remove("tour-active");
    if (mark) {
      if (pack) markUiSeen(pack);
      else markDone();
    }
    currentPack = null;
    stayOnEnd = false;
    stepList = [];
    if (!stay) goHome();
  }

  function maybeAutoStart() {
    if (done()) return;
    if (shouldBlockAuto()) return;
    setTimeout(() => start(false), 600);
  }

  function bindReplayButton() {
    const btn = document.getElementById("btn-tour");
    if (!btn || btn.dataset.tourBound) return;
    btn.dataset.tourBound = "1";
    btn.addEventListener("click", () => {
      clearDone();
      start(true);
    });
  }

  function bindUiHelpButton() {
    const btn = document.getElementById("btn-ui-help");
    if (!btn || btn.dataset.tourBound) return;
    btn.dataset.tourBound = "1";
    btn.addEventListener("click", () => {
      // Force replay current exercise family
      let family = "speech";
      try {
        const ex = global.VTApp?.getState?.()?.exercise;
        const profile =
          ex && global.VTApp?.getProfile
            ? global.VTApp.getProfile(ex)
            : ex?.practice || null;
        // Fallback: DOM sniff
        if (profile) family = detectUiFamily(profile);
        else if (!document.getElementById("pitch-block")?.hidden) family = "highway";
        else if (!document.getElementById("hold-block")?.hidden) family = "hold";
      } catch {
        /* ignore */
      }
      if (active) end(false);
      clearUiSeen(family);
      startUiPack(family, { force: true });
    });
  }

  global.VTTour = {
    start,
    end,
    maybeAutoStart,
    bindReplayButton,
    bindUiHelpButton,
    isDone: done,
    reset: clearDone,
    startUiPack,
    maybeExerciseTour,
    detectUiFamily,
    isUiSeen,
    clearUiSeen,
    markUiSeen
  };

  document.addEventListener("DOMContentLoaded", () => {
    bindReplayButton();
    bindUiHelpButton();
  });
})(window);
