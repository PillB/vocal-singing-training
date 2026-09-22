/**
 * Interactive tours — a short home tour plus per-UI-type exercise coach-marks,
 * and the microphone primer that runs before the browser's own permission
 * prompt.
 *
 * Shape, and why:
 *  - The home tour is four steps. Long tours are abandoned, and everything the
 *    old twelve steps narrated about the practice screen is better said on the
 *    practice screen, which is what the exercise packs do.
 *  - It does not open itself by default. The start panel offers it; the
 *    `tour_shape_2026_10` experiment (js/experiments-config.js) can put a share
 *    of visitors on the old auto-start behaviour to compare.
 *  - Steps only ever point at what is already on screen, and the popover is
 *    placed so it never covers the thing it is describing.
 *  - Everything durable lives in the written guide (guide.html), which every
 *    step links to, because most people leave a tour partway through.
 *
 * Contract other files depend on — do not rename: `#tour-root`, `.tour-card`,
 * `body.tour-active`, `[data-tour-title|body|progress|skip|prev|next]`, and
 * `window.VTTour`. Roughly fifteen specs and QA scripts hide the tour by those
 * literals before measuring layout.
 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "vt_tour_v1";
  const UI_SEEN_KEY = "vt_ui_tour_seen_v1";
  const MIC_PRIMED_KEY = "vt_mic_primed_v1";
  const EXPERIMENT = "tour_shape_2026_10";

  /** Widths at or under this get the bottom-sheet card; CSS owns its position. */
  const SHEET_MAX_W = 520;
  /** A "spotlight" over most of the screen highlights nothing — drop it instead. */
  const MAX_SPOT_FRACTION = 0.6;

  function t(key, vars) {
    if (typeof global.t === "function") return global.t(key, vars);
    if (global.VTI18n && typeof global.VTI18n.t === "function") return global.VTI18n.t(key, vars);
    return key;
  }

  function track(name, props) {
    try {
      global.VTAnalytics?.track?.(name, props || {});
    } catch {
      /* analytics must never break the tour */
    }
  }

  function reduceMotion() {
    try {
      return !!global.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    } catch {
      return false;
    }
  }

  function scrollBehavior() {
    return reduceMotion() ? "auto" : "smooth";
  }

  /* ── State the tour remembers ─────────────────────────────────────────── */

  /**
   * `finished` and `dismissed` both mean "do not open by itself again", but
   * only `finished` unlocks the per-screen packs — somebody who skipped the
   * home tour is telling us they do not want coach-marks either. Legacy "1"
   * reads as finished: ~15 test and QA files write it to suppress the tour.
   */
  function readState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === "1") return "finished";
      return raw === "finished" || raw === "dismissed" ? raw : "";
    } catch {
      return "";
    }
  }

  function writeState(value) {
    try {
      localStorage.setItem(STORAGE_KEY, value);
    } catch {
      /* private mode */
    }
  }

  function done() {
    return readState() !== "";
  }

  function finished() {
    return readState() === "finished";
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

  /* ── Steps ────────────────────────────────────────────────────────────── */

  /**
   * Home tour. Four steps, all on the home view, all pointing at something in
   * the first screen of a cold visit.
   *
   * The order follows the page: the recommended exercise first, because that is
   * the single decision the start panel was built to present, then the two
   * quieter ways in, then where everything else lives. The catalog narration
   * the old tour led with pointed below the fold and is now the guide's job.
   */
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
        id: "nextstep",
        titleKey: "tour.s2b.title",
        bodyKey: "tour.s2b.body",
        target: "#next-step-card",
        place: "bottom",
        guideAnchor: "inicio"
      },
      {
        id: "session",
        titleKey: "tour.s5.title",
        bodyKey: "tour.s5.body",
        target: ".start-alt",
        place: "bottom",
        guideAnchor: "rutas"
      },
      {
        id: "nav",
        titleKey: "tour.s6.title",
        bodyKey: "tour.s6.body",
        target: ".header-actions",
        place: "bottom",
        guideAnchor: "que-es"
      }
    ];
  }

  /**
   * Exercise UI packs — only steps whose targets are really on screen run.
   * Families: highway | speech | hold
   */
  function packSteps(family) {
    const common = [
      {
        id: "ex-mic",
        titleKey: "uiTour.mic.title",
        bodyKey: "uiTour.mic.body",
        target: "#mic-sens-hud",
        place: "top",
        requireVisible: true,
        guideAnchor: "micro"
      },
      {
        id: "ex-guide",
        titleKey: "uiTour.guide.title",
        bodyKey: "uiTour.guide.body",
        target: ".guide-card",
        place: "top",
        requireVisible: true,
        scrollTarget: true,
        guideAnchor: "practica"
      }
    ];

    if (family === "highway") {
      return [
        {
          id: "hw-intro",
          titleKey: "uiTour.hw.intro.title",
          bodyKey: "uiTour.hw.intro.body",
          target: "#practice-cockpit",
          place: "bottom",
          requireVisible: true,
          guideAnchor: "practica"
        },
        {
          id: "hw-canvas",
          titleKey: "uiTour.hw.canvas.title",
          bodyKey: "uiTour.hw.canvas.body",
          target: "#pitch-canvas",
          place: "bottom",
          requireVisible: true,
          guideAnchor: "autopista"
        },
        {
          id: "hw-top",
          titleKey: "uiTour.hw.top.title",
          bodyKey: "uiTour.hw.top.body",
          target: "#hud-top-rail",
          place: "bottom",
          requireVisible: true
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
          place: "bottom",
          requireVisible: true,
          guideAnchor: "numeros"
        },
        // Eight pitch exercises also log sustained notes. They show the hold
        // readout and the hold strip on screen, and before this the highway
        // pack never named either — detectUiFamily answers "highway" for all
        // of them, so the hold pack below never ran for anybody.
        {
          id: "hw-hold",
          titleKey: "uiTour.hold.live.title",
          bodyKey: "uiTour.hold.live.body",
          target: "#hold-display",
          place: "bottom",
          requireVisible: true,
          guideAnchor: "numeros"
        },
        {
          id: "hw-start",
          titleKey: "uiTour.start.title",
          bodyKey: "uiTour.start.body",
          target: "#btn-practice-start",
          place: "top",
          requireVisible: true
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
          place: "bottom",
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
        ...common,
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
          place: "bottom",
          requireVisible: true
        },
        {
          id: "hold-live",
          titleKey: "uiTour.hold.live.title",
          bodyKey: "uiTour.hold.live.body",
          target: "#hold-display",
          place: "bottom",
          requireVisible: true,
          guideAnchor: "numeros"
        },
        {
          id: "hold-start",
          titleKey: "uiTour.start.title",
          bodyKey: "uiTour.start.body",
          target: "#btn-practice-start",
          place: "top",
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
        place: "bottom",
        requireVisible: true,
        guideAnchor: "practica"
      },
      {
        id: "sp-focus",
        titleKey: "uiTour.sp.focus.title",
        bodyKey: "uiTour.sp.focus.body",
        target: "#mode-focus",
        place: "bottom",
        requireVisible: true
      },
      {
        id: "sp-start",
        titleKey: "uiTour.start.title",
        bodyKey: "uiTour.start.body",
        target: "#btn-practice-start",
        place: "top",
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

  /**
   * Keep only steps that will actually have something to point at. Every
   * anchored step is checked strictly: a step whose element exists but is
   * `display:none` used to survive and then render as a bare centered card
   * describing a control that was nowhere on screen.
   */
  function filterSteps(list) {
    return (list || []).filter((step) => {
      if (!step.target) return true;
      return isVisible(document.querySelector(step.target));
    });
  }

  /* ── Overlay ──────────────────────────────────────────────────────────── */

  let ui = null;
  let index = 0;
  let active = false;
  let currentPack = null; // null = home tour
  let stayOnEnd = false;
  let stepList = [];
  let listening = false;

  function ensureUI() {
    if (ui) return ui;
    const root = document.createElement("div");
    root.id = "tour-root";
    // `modal-overlay` is also what qa/capture-mobile.mjs uses to tell which
    // layer a control belongs to; without it the card's buttons are compared
    // against the page buttons behind the backdrop and reported as overlaps.
    root.className = "tour-root modal-overlay";
    root.hidden = true;
    root.innerHTML = `
      <div class="tour-backdrop" data-tour-backdrop></div>
      <div class="tour-spotlight" data-tour-spot aria-hidden="true"></div>
      <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body" data-tour-card>
        <button type="button" class="tour-close" data-tour-close aria-label="Cerrar">&times;</button>
        <div class="tour-progress" data-tour-progress role="status"></div>
        <h3 id="tour-title" tabindex="-1" data-tour-title></h3>
        <p class="tour-body" id="tour-body" data-tour-body></p>
        <div class="tour-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-tour-skip></button>
          <a class="btn btn-ghost btn-sm tour-guide-link" data-tour-guide href="guide.html" target="_blank" rel="noopener"></a>
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
      close: root.querySelector("[data-tour-close]"),
      guide: root.querySelector("[data-tour-guide]"),
      skip: root.querySelector("[data-tour-skip]"),
      prev: root.querySelector("[data-tour-prev]"),
      next: root.querySelector("[data-tour-next]")
    };
    ui.skip.addEventListener("click", () => end("skip"));
    ui.close.addEventListener("click", () => end("skip"));
    ui.prev.addEventListener("click", () => go(index - 1));
    ui.next.addEventListener("click", () => {
      if (index >= stepList.length - 1) end("complete");
      else go(index + 1);
    });
    ui.guide.addEventListener("click", () => {
      track("tour_guide_open", { stepId: stepList[index]?.id || null, pack: currentPack });
    });
    // A click on the dim used to be swallowed in silence. It is the commonest
    // way people dismiss an overlay, so let it dismiss.
    root.querySelector("[data-tour-backdrop]")?.addEventListener("click", () => end("skip"));
    return ui;
  }

  function bindListeners() {
    if (listening) return;
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    listening = true;
  }

  function unbindListeners() {
    if (!listening) return;
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("resize", onResize);
    window.removeEventListener("scroll", onResize, true);
    listening = false;
  }

  function onKey(e) {
    if (!active) return;
    if (e.key === "Escape") {
      e.preventDefault();
      end("dismiss");
      return;
    }
    // Enter used to be captured globally, so a keyboard user who tabbed to
    // "Skip" and pressed Enter was pushed forward instead of out. Let a
    // focused control in the card handle its own activation.
    const onOwnControl =
      ui &&
      ui.card.contains(document.activeElement) &&
      /^(BUTTON|A)$/.test(document.activeElement.tagName || "");
    if (e.key === "Enter" && onOwnControl) return;
    if (e.key === "ArrowRight" || e.key === "Enter") {
      e.preventDefault();
      ui.next.click();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      ui.prev.click();
    }
  }

  function onResize() {
    // Layout only. Scrolling here would fight the corrective scroll below:
    // moving the page fires this listener, which re-centred the target and
    // undid the correction, every time.
    if (active && stepList[index]) positionStep(stepList[index], { scroll: false });
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

  function prepare(step) {
    if (step.scrollTarget && step.target) {
      document
        .querySelector(step.target)
        ?.scrollIntoView({ behavior: scrollBehavior(), block: "center" });
    }
  }

  function clearHighlight() {
    document.querySelectorAll(".tour-highlight").forEach((el) => {
      el.classList.remove("tour-highlight");
    });
  }

  function hideSpot() {
    if (!ui) return;
    ui.spot.style.opacity = "0";
    ui.spot.style.width = "0";
    ui.spot.style.height = "0";
    // With no ring drawn the dim moves back onto the backdrop, or the step
    // would show over an undimmed page.
    document.body.classList.remove("tour-spot-on");
  }

  function centerCard() {
    const u = ensureUI();
    u.card.classList.add("tour-card-center");
    u.card.style.top = "";
    u.card.style.left = "";
  }

  function intersects(a, b) {
    return !(
      a.left >= b.right ||
      a.right <= b.left ||
      a.top >= b.bottom ||
      a.bottom <= b.top
    );
  }

  /**
   * Pick a placement that keeps the popover fully on screen and clear of the
   * element it describes. The old code pinned the card to the target's left
   * edge and, for `place:"top"`, never checked that the result cleared the
   * target — which is how the step explaining the play-mode select covered it
   * completely.
   */
  function placeCard(step, r) {
    const u = ui;
    const cw = u.card.offsetWidth;
    const ch = u.card.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const M = 12;
    const GAP = 12;

    const clampX = (x) => Math.max(M, Math.min(x, vw - cw - M));
    const clampY = (y) => Math.max(M, Math.min(y, vh - ch - M));
    const midX = clampX(r.left + r.width / 2 - cw / 2);
    const midY = clampY(r.top + r.height / 2 - ch / 2);

    const byPlace = {
      bottom: { left: midX, top: r.bottom + GAP },
      top: { left: midX, top: r.top - GAP - ch },
      right: { left: r.right + GAP, top: midY },
      left: { left: r.left - GAP - cw, top: midY }
    };
    const order = [step.place, "bottom", "top", "right", "left"].filter(
      (p, i, a) => byPlace[p] && a.indexOf(p) === i
    );

    for (const place of order) {
      const c = byPlace[place];
      const box = {
        left: c.left,
        top: c.top,
        right: c.left + cw,
        bottom: c.top + ch
      };
      const onScreen =
        box.left >= M - 0.5 &&
        box.top >= M - 0.5 &&
        box.right <= vw - M + 0.5 &&
        box.bottom <= vh - M + 0.5;
      if (onScreen && !intersects(box, r)) {
        u.card.classList.remove("tour-card-center");
        u.card.style.left = `${Math.round(c.left)}px`;
        u.card.style.top = `${Math.round(c.top)}px`;
        return true;
      }
    }
    return false;
  }

  function positionStep(step, { scroll = true } = {}) {
    const u = ensureUI();
    clearHighlight();
    hideSpot();

    const sheet = window.innerWidth <= SHEET_MAX_W;
    const el = step.target ? document.querySelector(step.target) : null;

    if (!step.target || step.place === "center" || !isVisible(el)) {
      centerCard();
      return;
    }

    el.classList.add("tour-highlight");
    // Instant, not smooth: every measurement below is taken straight after
    // this, and a smooth scroll is still moving when they are read.
    if (scroll) el.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });

    let r = el.getBoundingClientRect();
    const vh = window.innerHeight;
    const vw = window.innerWidth;

    // On a phone the card is a bottom sheet positioned by CSS; JS only decides
    // whether a spotlight is worth drawing.
    if (!sheet) {
      const placed = placeCard(step, r);
      if (!placed) centerCard();
    } else {
      u.card.classList.remove("tour-card-center");
      u.card.style.left = "";
      u.card.style.top = "";
      // The sheet defaults to the bottom, which is exactly where the practice
      // screen keeps its controls. Flip it to the top when the bottom would
      // cover the target, and only then try scrolling the target clear.
      u.card.classList.remove("tour-sheet-top");
      if (intersects(u.card.getBoundingClientRect(), r)) {
        u.card.classList.add("tour-sheet-top");
        if (intersects(u.card.getBoundingClientRect(), r)) {
          u.card.classList.remove("tour-sheet-top");
          const cardTop = u.card.getBoundingClientRect().top;
          const delta = r.bottom - (cardTop - 10);
          if (scroll && delta > 0) {
            window.scrollBy({ top: delta, behavior: "auto" });
            r = el.getBoundingClientRect();
          }
        }
      }
    }

    // A ring around something taller than most of the screen points at
    // nothing — the exercise list is 3000px tall. Leave it unlit rather than
    // outlining the whole viewport.
    const pad = 8;
    const top = Math.max(4, r.top - pad);
    const bottom = Math.min(vh - 4, r.bottom + pad);
    const left = Math.max(4, r.left - pad);
    const right = Math.min(vw - 4, r.right + pad);
    const h = bottom - top;
    const w = right - left;
    if (h <= 0 || w <= 0 || r.height > vh * MAX_SPOT_FRACTION) return;

    u.spot.style.opacity = "1";
    u.spot.style.left = `${left}px`;
    u.spot.style.top = `${top}px`;
    u.spot.style.width = `${w}px`;
    u.spot.style.height = `${h}px`;
    document.body.classList.add("tour-spot-on");
  }

  function render() {
    const step = stepList[index];
    if (!step) return end("complete");
    const u = ensureUI();
    prepare(step);
    // Copy is written synchronously: beginTour unhides the popover before this
    // runs, so deferring the text showed an empty card for two frames.
    u.title.textContent = t(step.titleKey);
    u.body.textContent = t(step.bodyKey);
    u.progress.textContent = t("tour.progress", {
      n: String(index + 1),
      total: String(stepList.length)
    });
    u.close.setAttribute("aria-label", t("tour.close"));
    u.skip.textContent = t("tour.skip");
    u.prev.textContent = t("tour.prev");
    u.guide.textContent = t("tour.guideLink");
    u.guide.href = guideHref(step.guideAnchor);
    u.next.textContent = index >= stepList.length - 1 ? t("tour.finish") : t("tour.next");
    u.prev.disabled = index === 0;
    u.prev.setAttribute("aria-disabled", String(index === 0));
    track("tour_step", { pack: currentPack, stepId: step.id, n: index + 1, total: stepList.length });
    // Placement waits for layout to settle after prepare()'s scroll, and reads
    // the card's real height — the old estimate was written before the copy.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        positionStep(step);
        // Focus the heading, not Next: an AT user used to hear "Next, button"
        // on every step and never the step itself.
        try {
          u.title.focus({ preventScroll: true });
        } catch {
          u.title.focus();
        }
      });
    });
  }

  /** Re-render the open step, e.g. after a language switch. */
  function rerender() {
    if (active) render();
  }

  function guideHref(anchor) {
    const en = global.VTI18n?.lang === "en";
    const base = anchor || "que-es";
    return `guide.html#${en ? `${base}-en` : base}`;
  }

  function go(i) {
    index = Math.max(0, Math.min(stepList.length - 1, i));
    render();
  }

  function setPageInert(on) {
    // `aria-modal` alone is a promise the page does not keep: without this a
    // screen reader can still walk the whole dimmed page behind the card.
    ["#view-home", "#view-exercise", "#view-history", "#view-plan", ".app-header", ".app-footer"].forEach(
      (sel) => {
        document.querySelectorAll(sel).forEach((el) => {
          if (on) el.setAttribute("inert", "");
          else el.removeAttribute("inert");
        });
      }
    );
  }

  function beginTour(steps, { fromButton, pack, stay } = {}) {
    const opener = document.activeElement;
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
    setPageInert(true);
    bindListeners();
    if (fromButton && !pack) goHome();
    track("tour_start", {
      pack: currentPack,
      steps: stepList.length,
      authored: steps.length,
      fromButton: !!fromButton,
      variant: global.VTExperiments?.variant?.(EXPERIMENT) || null
    });
    // Keep Tab inside the tour card.
    window.VTFocusTrap?.activate(ui.card, { initialFocus: ui.next, returnFocus: opener });
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
    // Somebody who skipped the home tour does not want coach-marks either.
    if (!finished()) return;
    const family = detectUiFamily(profile);
    if (isUiSeen(family)) return;
    setTimeout(() => {
      if (active) return;
      if (!document.body.classList.contains("view-exercise")) return;
      startUiPack(family, { force: false });
    }, 700);
  }

  /**
   * @param {"complete"|"skip"|"dismiss"|false} reason how the tour ended.
   *   Anything truthy stops it opening again; only "complete" counts as
   *   finished. `false` closes without recording anything, for a replay that
   *   is being restarted.
   */
  function end(reason) {
    const pack = currentPack;
    const stay = stayOnEnd;
    const step = stepList[index];
    active = false;
    clearHighlight();
    document.body.classList.remove("tour-active");
    document.body.classList.remove("tour-spot-on");
    // Lift inert before releasing the trap, or focus cannot return to the
    // button that opened the tour — it is in the header we just made inert.
    setPageInert(false);
    unbindListeners();
    if (ui) {
      ui.root.hidden = true;
      window.VTFocusTrap?.release(ui.card);
    }
    if (reason) {
      track(`tour_${reason}`, {
        pack,
        lastStepId: step?.id || null,
        n: index + 1,
        total: stepList.length
      });
      if (pack) markUiSeen(pack);
      else writeState(reason === "complete" ? "finished" : "dismissed");
    }
    currentPack = null;
    stayOnEnd = false;
    stepList = [];
    if (!stay) goHome();
  }

  /**
   * First visit: either open the tour, or leave the start panel's invitation to
   * do the asking. Which one is the `tour_shape_2026_10` experiment; with it
   * disabled everybody gets the invitation.
   */
  function maybeAutoStart() {
    if (done()) return;
    if (shouldBlockAuto()) return;
    const variant = global.VTExperiments?.exposeOnce?.(EXPERIMENT) || "invite";
    if (variant !== "auto") return;
    setTimeout(() => {
      if (!active && !done()) start(false);
    }, 600);
  }

  /* ── Microphone primer ────────────────────────────────────────────────── */

  function micPrimed() {
    try {
      return localStorage.getItem(MIC_PRIMED_KEY) === "1";
    } catch {
      return false;
    }
  }

  function needsMicPrimer() {
    if (micPrimed()) return false;
    if (shouldBlockAuto()) return false;
    return true;
  }

  function markMicPrimed() {
    try {
      localStorage.setItem(MIC_PRIMED_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  /**
   * Say what the browser is about to ask, before it asks. A denial is only
   * undoable in browser settings, and on a pitch exercise a denied microphone
   * currently looks like success — the piano plays, the highway moves, and
   * only the voice line is missing.
   *
   * @param {() => void} onContinue runs when the user accepts; the caller
   *   re-enters whatever it was doing.
   */
  function showMicPrimer(onContinue) {
    const opener = document.activeElement;
    let modal = document.getElementById("mic-primer");
    if (!modal) {
      modal = document.createElement("div");
      modal.id = "mic-primer";
      modal.className = "modal-overlay mic-primer";
      modal.hidden = true;
      modal.innerHTML = `
        <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="mic-primer-title">
          <h3 id="mic-primer-title" data-primer-title></h3>
          <p class="muted" data-primer-body></p>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-primer-no></button>
            <button type="button" class="btn btn-primary" data-primer-ok></button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
    }
    const close = () => {
      modal.hidden = true;
      document.body.classList.remove("modal-open");
      window.VTFocusTrap?.release(modal);
      document.removeEventListener("keydown", onPrimerKey);
    };
    function onPrimerKey(e) {
      if (e.key !== "Escape" || modal.hidden) return;
      e.preventDefault();
      track("mic_primer_dismiss", {});
      markMicPrimed();
      close();
    }
    modal.querySelector("[data-primer-title]").textContent = t("tour.mic.title");
    modal.querySelector("[data-primer-body]").textContent = t("tour.mic.body");
    const ok = modal.querySelector("[data-primer-ok]");
    const no = modal.querySelector("[data-primer-no]");
    ok.textContent = t("tour.mic.ok");
    no.textContent = t("tour.mic.no");
    ok.onclick = () => {
      track("mic_primer_accept", {});
      markMicPrimed();
      close();
      if (typeof onContinue === "function") onContinue();
    };
    no.onclick = () => {
      track("mic_primer_decline", {});
      markMicPrimed();
      close();
    };
    modal.hidden = false;
    document.body.classList.add("modal-open");
    document.addEventListener("keydown", onPrimerKey);
    track("mic_primer_show", {});
    window.VTFocusTrap?.activate(modal, { initialFocus: ok, returnFocus: opener });
  }

  /* ── Wiring ───────────────────────────────────────────────────────────── */

  function bindReplayButton() {
    const btn = document.getElementById("btn-tour");
    if (!btn || btn.dataset.tourBound) return;
    btn.dataset.tourBound = "1";
    btn.addEventListener("click", () => {
      // Deliberately does NOT clear the stored state first: doing so meant
      // skipping a replay re-armed the auto-start on the next visit.
      if (active) end(false);
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

  /** Wire the start panel's invitation, which renderStartPanel() emits. */
  function bindInvite() {
    const start_ = document.querySelector("[data-tour-invite-start]");
    if (start_ && !start_.dataset.tourBound) {
      start_.dataset.tourBound = "1";
      start_.addEventListener("click", (e) => {
        e.preventDefault();
        track("tour_invite_accept", {});
        start(true);
      });
    }
    const dismiss = document.querySelector("[data-tour-invite-dismiss]");
    if (dismiss && !dismiss.dataset.tourBound) {
      dismiss.dataset.tourBound = "1";
      dismiss.addEventListener("click", () => {
        track("tour_invite_dismiss", {});
        writeState("dismissed");
        document.getElementById("home-tour-invite")?.remove();
      });
    }
  }

  global.VTTour = {
    start,
    end,
    maybeAutoStart,
    bindReplayButton,
    bindUiHelpButton,
    bindInvite,
    isDone: done,
    isFinished: finished,
    isActive: () => active,
    rerender,
    reset: clearDone,
    startUiPack,
    maybeExerciseTour,
    detectUiFamily,
    isUiSeen,
    clearUiSeen,
    markUiSeen,
    needsMicPrimer,
    showMicPrimer,
    guideHref
  };

  document.addEventListener("DOMContentLoaded", () => {
    bindReplayButton();
    bindUiHelpButton();
    bindInvite();
  });
})(window);
