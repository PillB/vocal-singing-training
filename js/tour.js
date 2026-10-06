/**
 * Interactive tours — a short home tour plus per-UI-type exercise coach-marks,
 * and the microphone primer that runs before the browser's own permission
 * prompt.
 *
 * Shape, and why:
 *  - The site tour ("Recorrido") is five stops, one per place: Practicar, the
 *    exercise screen, Plan, Historial, then the account and help in the
 *    header. Each stop opens its page, without an address of its own, and the
 *    tour puts the page back when it ends. Long tours are abandoned, so each
 *    stop is one card; the detail of the exercise screen is said there, by
 *    its own short help ("Ayuda"), which never opens inside a routine.
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
  const AUTO_KEY = "vt_tour_auto_v1";
  /** "1" once someone pressed "Saltar ayuda" on an exercise's help: no more automatic help. */
  const UI_OFF_KEY = "vt_ui_tour_off_v1";
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

  function uiOff() {
    try {
      return localStorage.getItem(UI_OFF_KEY) === "1";
    } catch {
      return false;
    }
  }

  function setUiOff() {
    try {
      localStorage.setItem(UI_OFF_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  /* ── Steps ────────────────────────────────────────────────────────────── */

  /**
   * The site tour: one stop per place, in the order a first session meets
   * them. The first stop rings today's start (the track choice and the button,
   * or the button and the routine sizes); the exercise stop opens the exercise
   * that button leads to; the last turns the end of the tour into the first
   * practice ("Empezar mis 3 min"), with "Ahora no" beside it.
   */
  function homeSteps() {
    const first = document.body.classList.contains("loop-first");
    const loopOn = !first && !!global.VTApp?.loopDrewPanel?.();
    const phone = isVisible(document.getElementById("btn-more"));
    // Historial before any practice is an empty page: its card says what will
    // fill it instead of describing marked days nobody can see.
    const histEmpty = (() => {
      try {
        const S = global.VTStorage;
        const n = (o) => (Array.isArray(o) ? o.length : Object.keys(o || {}).length);
        return !!S && !n(S.getProgress?.()) && !n(S.getDays?.()?.days ?? S.getDays?.());
      } catch {
        return false;
      }
    })();
    return [
      {
        id: "practice",
        view: "home",
        placeKey: "tour.place.practice",
        titleKey: first ? "tour.practice.titleFirst" : loopOn ? "tour.practice.titleLoop" : "tour.practice.title",
        bodyKey: first ? "tour.practice.bodyFirst" : loopOn ? "tour.practice.bodyLoop" : "tour.practice.body",
        target: ["#track-pick", "#next-step-card"],
        also: ["#next-step-card", "#loop-tiers", "#btn-more-ways", "#start-alt"],
        place: "right",
        guideAnchor: "basicos"
      },
      {
        id: "exercise",
        view: "exercise",
        placeKey: "tour.place.exercise",
        titleKey: "tour.exercise.title",
        bodyKey: "tour.exercise.body",
        target: "#btn-practice-start",
        also: ["#opt-auto-record"],
        place: "top",
        guideAnchor: "practica"
      },
      {
        id: "plan",
        view: "plan",
        placeKey: "tour.place.plan",
        titleKey: "tour.plan.title",
        bodyKey: "tour.plan.body",
        target: "#plan-week-num",
        also: ["#plan-week-rail", "#plan-pick", "#element-chips", "#plan-focus-more", "#plan-start-row"],
        place: "bottom",
        guideAnchor: "plan"
      },
      {
        id: "history",
        view: "history",
        placeKey: "tour.place.history",
        titleKey: "tour.history.title",
        bodyKey: histEmpty ? "tour.history.bodyEmpty" : "tour.history.body",
        target: [".hist-cal", "#history-list"],
        place: "bottom",
        guideAnchor: "guardar"
      },
      {
        id: "more",
        view: "home",
        placeKey: "tour.place.more",
        titleKey: "tour.more.title",
        bodyKey: phone ? "tour.more.bodyPhone" : "tour.more.body",
        target: ".header-door",
        also: ["#btn-more", "#header-utils"],
        place: "bottom",
        guideAnchor: "pro",
        handoff: true
      }
    ];
  }

  /**
   * Exercise help ("Ayuda"), per kind of screen: three or four cards, each
   * naming a control by what it does, never by where it sits (a phone stacks
   * what a desktop puts in corners). Only steps whose targets are on screen
   * run. Families: highway | speech | hold
   */
  function packSteps(family) {
    // Speaking exercises have no piano, so their card does not mention one.
    const piano = !!global.VTApp?.getState?.()?.exercise?.audio?.piano;
    const start = {
      id: "ex-start",
      titleKey: "uiTour.start.title",
      bodyKey: piano ? "uiTour.start.bodyPiano" : "uiTour.start.body",
      target: "#btn-practice-start",
      also: ["#opt-auto-record"],
      place: "top",
      requireVisible: true,
      guideAnchor: "micro"
    };
    const guide = {
      id: "ex-guide",
      titleKey: "uiTour.guide.title",
      bodyKey: "uiTour.guide.body",
      target: ["#stage-guide", ".guide-card"],
      place: "top",
      requireVisible: true,
      scrollTarget: true,
      guideAnchor: "trucos"
    };

    if (family === "highway") {
      return [
        {
          id: "hw-canvas",
          titleKey: "uiTour.hw.canvas.title",
          bodyKey: "uiTour.hw.canvas.body",
          target: "#pitch-canvas",
          trim: [".hud-bottom-rail"],
          place: "bottom",
          requireVisible: true,
          guideAnchor: "autopista"
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
        // Chord exercises only: the sequence and what the piano plays of it
        {
          id: "hw-prog",
          titleKey: "uiTour.hw.prog.title",
          bodyKey: "uiTour.hw.prog.body",
          target: "#hud-prog-bar",
          place: "bottom",
          requireVisible: true,
          guideAnchor: "autopista"
        },
        // Eight pitch exercises also log sustained notes and show the hold
        // readout; detectUiFamily answers "highway" for them, so the counter
        // is explained here (filterSteps drops it where it is not shown).
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
          id: "hw-oct",
          titleKey: "uiTour.hw.oct.title",
          bodyKey: "uiTour.hw.oct.body",
          target: "#oct-controls",
          place: "top",
          requireVisible: true
        },
        start
      ];
    }

    if (family === "hold") {
      return [
        {
          id: "hold-live",
          titleKey: "uiTour.hold.live.title",
          bodyKey: "uiTour.hold.live.body",
          target: "#hold-display",
          place: "bottom",
          requireVisible: true,
          guideAnchor: "numeros"
        },
        start,
        {
          id: "hold-block",
          titleKey: "uiTour.hold.block.title",
          bodyKey: "uiTour.hold.block.body",
          target: "#hold-block",
          place: "top",
          requireVisible: true
        }
      ];
    }

    // Everything without a pitch lane: speaking, and singing such as lip
    // trills. The copy says what to do, not which track this is.
    return [
      {
        id: "sp-focus",
        titleKey: "uiTour.sp.focus.title",
        bodyKey: "uiTour.sp.focus.body",
        // The panel itself: #mode-focus also holds the stage guide and runs
        // the stage's height, so a card could not sit clear of it
        target: "#mode-focus-panel",
        place: "bottom",
        requireVisible: true,
        guideAnchor: "practica"
      },
      start,
      guide
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
      // A stop on another page is checked when it opens that page.
      if (step.view) return true;
      return !!resolveTarget(step);
    });
  }

  /** The first of a step's targets that is on screen (a step may name fallbacks). */
  function resolveTarget(step) {
    for (const sel of [].concat(step.target || [])) {
      const el = document.querySelector(sel);
      if (isVisible(el)) return el;
    }
    return null;
  }

  /**
   * The area a step points at: its target plus the neighbours it names in
   * `also` ("Empezar" with "Grabarme", the account door with "Más"), so one
   * ring holds what the card talks about. Neighbours join in order, and only
   * while the ring still fits beside the card: on a phone the returning
   * visitor's week card sits between the routine sizes and "Otras formas de
   * practicar", and a ring around all of it pushed Empezar under the header.
   */
  function targetRect(step, el) {
    let { left, top, right, bottom } = el.getBoundingClientRect();
    const sheet = window.innerWidth <= SHEET_MAX_W;
    const fit = window.innerHeight * (sheet ? 0.45 : MAX_SPOT_FRACTION);
    for (const sel of step.also || []) {
      const o = document.querySelector(sel);
      if (!o || o === el || !isVisible(o)) continue;
      const b = o.getBoundingClientRect();
      const t = Math.min(top, b.top);
      const btm = Math.max(bottom, b.bottom);
      if (btm - t > fit) {
        // Left out, so keep the ring (8px out from what it holds) off it: its
        // edge sliced through "Ver otros 12" under the Plan's chips.
        if (b.top >= bottom) bottom = Math.max(top + 1, Math.min(bottom, b.top - 12));
        else if (b.bottom <= top) top = Math.min(bottom - 1, Math.max(top, b.bottom + 12));
        break;
      }
      left = Math.min(left, b.left);
      top = t;
      right = Math.max(right, b.right);
      bottom = btm;
    }
    // Controls laid over the target (the exercise's bottom rail sits on the
    // lane on a phone) are cut off the ring, so it holds only what the card names.
    for (const sel of step.trim || []) {
      const o = document.querySelector(sel);
      if (!o || !isVisible(o)) continue;
      const b = o.getBoundingClientRect();
      if (b.bottom <= top || b.top >= bottom || b.right <= left || b.left >= right) continue;
      if (b.top + b.height / 2 > (top + bottom) / 2) bottom = Math.max(top + 1, Math.min(bottom, b.top));
      else top = Math.min(bottom - 1, Math.max(top, b.bottom));
    }
    return new DOMRect(left, top, right - left, bottom - top);
  }

  /* ── Overlay ──────────────────────────────────────────────────────────── */

  let ui = null;
  let index = 0;
  let active = false;
  let currentPack = null; // null = home tour
  let stayOnEnd = false;
  let resumeAt = null;
  let positioning = false;
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
        <a class="tour-guide-link" data-tour-guide href="guide.html" target="_blank" rel="noopener"></a>
        <div class="tour-actions">
          <button type="button" class="btn btn-ghost btn-sm tour-skip" data-tour-skip></button>
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
    // On the tour's last stop the quiet button is "Ahora no": the person has
    // seen every stop, so it counts as finished, it just does not start.
    ui.skip.addEventListener("click", () => end(isHandoff() ? "complete" : "skip"));
    ui.close.addEventListener("click", () => end("skip"));
    ui.prev.addEventListener("click", () => go(index - 1));
    ui.next.addEventListener("click", () => {
      if (index >= stepList.length - 1) end("complete", { start: isHandoff() });
      else go(index + 1);
    });
    ui.guide.addEventListener("click", () => {
      track("tour_guide_open", { stepId: stepList[index]?.id || null, pack: currentPack });
    });
    // The backdrop covers the spotlight hole too, and .tour-highlight carries
    // `pointer-events: none`, so the lit element cannot receive the click. That
    // made the one thing the tour is pointing at the worst thing to touch: it
    // dismissed the tour, wrote "dismissed", and took the per-screen coach-marks
    // with it. On a phone the dim is most of the screen, so it was easy to hit
    // by accident and there was no way back except a header button the tour had
    // not explained yet.
    //
    // So: a click inside the lit ring acknowledges the step and moves on, and a
    // click on the dim does nothing. Leaving is still Skip, the close button or
    // Escape — three deliberate acts, none of them a stray tap.
    root.querySelector("[data-tour-backdrop]")?.addEventListener("click", (e) => {
      if (!inSpotlight(e.clientX, e.clientY)) return;
      if (index >= stepList.length - 1) end("complete");
      else go(index + 1);
    });
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
    if (positioning) return;
    if (active && stepList[index]) positionStep(stepList[index], { scroll: false });
  }

  function goHome() {
    const home = document.getElementById("view-home");
    const ex = document.getElementById("view-exercise");
    if (home && !home.classList.contains("active")) {
      if (global.VTApp?.goHome) global.VTApp.goHome();
      else document.getElementById("btn-back-home")?.click();
      const leave = document.getElementById("leave-cancel");
      if (leave && !document.getElementById("leave-modal")?.hidden) leave.click();
      home.classList.add("active");
      ex?.classList.remove("active");
      document.body.classList.remove("view-exercise");
    }
  }

  function prepare(step) {
    // Deliberately does not scroll. It used to start a *smooth* scroll to the
    // same target positionStep then scrolled to instantly; the smooth one was
    // still running while positionStep measured, and every frame of it fired
    // the scroll listener, whose re-layout runs without the corrective scroll.
    // The last word therefore went to a pass that could not correct anything,
    // which is why stepping *backwards* on a narrow phone parked the card on
    // top of the control the step was describing.
    void step;
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

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

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
  /**
   * Height of anything pinned over the bottom of the screen that the card must
   * clear: the statistics question shown in the EEA sits above every layer, so
   * a phone's bottom sheet under it had its buttons covered.
   */
  function bottomInset() {
    const bar = document.querySelector("[data-region-consent]");
    if (!bar || !isVisible(bar)) return 0;
    const r = bar.getBoundingClientRect();
    return r.height > 0 && r.bottom >= window.innerHeight - 1 ? Math.ceil(r.height) : 0;
  }

  function placeCard(step, r) {
    const u = ui;
    const cw = u.card.offsetWidth;
    const ch = u.card.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight - bottomInset();
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

  /**
   * Is this viewport point inside the drawn spotlight ring? False whenever no
   * ring is drawn, which is what makes a click on a plain dimmed step a no-op.
   */
  function inSpotlight(x, y) {
    if (!ui || !ui.spot) return false;
    if (!document.body.classList.contains("tour-spot-on")) return false;
    const r = ui.spot.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return false;
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  /**
   * The lowest edge of whatever is pinned to the top of the screen. Both the
   * site header and the exercise screen's own compact header are sticky, so a
   * target scrolled to the top of the document is not necessarily visible.
   */
  function stickyBottom() {
    let low = 0;
    [".app-header", ".exercise-header-compact"].forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => {
        const st = getComputedStyle(el);
        if (st.position !== "sticky" && st.position !== "fixed") return;
        if (st.display === "none" || st.visibility === "hidden") return;
        const r = el.getBoundingClientRect();
        if (r.top <= 2 && r.bottom > low) low = r.bottom;
      });
    });
    return low;
  }

  function positionStep(step, { scroll = true } = {}) {
    if (positioning) return;
    positioning = true;
    try {
      placeStep(step, scroll);
    } finally {
      // Our own scrollBy calls fire the scroll listener; let them settle before
      // it is allowed to re-enter, or the correction fights itself.
      requestAnimationFrame(() => {
        positioning = false;
      });
    }
  }

  function placeStep(step, scroll) {
    const u = ensureUI();
    clearHighlight();
    hideSpot();

    const sheet = window.innerWidth <= SHEET_MAX_W;
    const el = step.target ? resolveTarget(step) : null;
    const inset = bottomInset();
    u.card.style.setProperty("--tour-sheet-bottom", `${inset + 16}px`);

    if (!el || step.place === "center") {
      // A step with no target is about the page as a whole, so it should open
      // against the top of it. Replaying from the bottom used to put "Welcome
      // to your voice studio" over the reminder settings.
      if (scroll) window.scrollTo({ top: 0, behavior: "auto" });
      centerCard();
      return;
    }

    el.classList.add("tour-highlight");
    // On a desktop a ring already in full view stays put: scrolling it to the
    // middle anyway moved the page under people for nothing. Otherwise: instant,
    // not smooth, since every measurement below is taken straight after this,
    // and a smooth scroll is still moving when they are read.
    const inView = (() => {
      const b = targetRect(step, el);
      return b.top >= stickyBottom() + 4 && b.bottom <= window.innerHeight - inset - 4;
    })();
    if (scroll && (sheet || !inView)) {
      el.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
      // scrollIntoView cannot centre a target near the end of the page, so it
      // can leave it under the sticky header — which on the practice screen is
      // exactly what happened to the top-rail step: the ring was drawn around a
      // rail whose first line the header was covering.
      const under = stickyBottom() - targetRect(step, el).top;
      if (under > 0) window.scrollBy({ top: -under - 8, behavior: "auto" });
    }

    let r = targetRect(step, el);
    const vh = window.innerHeight - inset;
    const vw = window.innerWidth;

    // On a phone the card is a bottom sheet positioned by CSS; JS only decides
    // whether a spotlight is worth drawing.
    if (!sheet) {
      let placed = placeCard(step, r);
      if (!placed && scroll && inView) {
        // No room beside it where it stands: centre it after all, and retry.
        el.scrollIntoView({ behavior: "auto", block: "center", inline: "nearest" });
        r = targetRect(step, el);
        placed = placeCard(step, r);
      }
      if (!placed) centerCard();
    } else {
      u.card.classList.remove("tour-card-center");
      u.card.style.left = "";
      u.card.style.top = "";
      // The sheet spans the screen, so the only way to keep it off the target is
      // to scroll the target into the band the sheet leaves free. Both sides are
      // costed and the better one wins; if neither can clear it — a target
      // taller than the band — the one that covers least does. Costing both on
      // every pass, rather than only when a step first opens, is what makes
      // stepping backwards behave like stepping forwards.
      //
      // Everything here is PREDICTED, never measured after scrolling.
      // `window.scrollY` does not update until the next frame, so the earlier
      // measure-scroll-remeasure version read the pre-scroll position back every
      // time, scored both candidates as failures and kept the first. That is
      // what put the card on top of the control the step was describing.
      const startY = window.scrollY;
      const maxY = Math.max(0, document.documentElement.scrollHeight - vh);
      const docTop = r.top + startY;
      let best = null;
      for (const top of [r.top > vh - r.bottom, r.top <= vh - r.bottom]) {
        u.card.classList.toggle("tour-sheet-top", top);
        const c = u.card.getBoundingClientRect(); // fixed: independent of scroll
        const b0 = top ? c.bottom + 10 : 8;
        const b1 = top ? vh - 8 : c.top - 10;
        // Centre the target in the free band, then keep it inside it.
        const wantTop = clamp((b0 + b1 - r.height) / 2, b0, Math.max(b0, b1 - r.height));
        const y = scroll ? clamp(docTop - wantTop, 0, maxY) : startY;
        const vTop = docTop - y;
        const over =
          Math.max(0, Math.min(c.right, r.right) - Math.max(c.left, r.left)) *
          Math.max(0, Math.min(c.bottom, vTop + r.height) - Math.max(c.top, vTop));
        if (!best || over < best.over) best = { top, y, over };
        if (over === 0) break;
      }
      u.card.classList.toggle("tour-sheet-top", best.top);
      if (scroll && Math.abs(best.y - startY) > 0.5) {
        window.scrollTo({ top: best.y, behavior: "auto" });
        // Predicted, for the spotlight below; the scroll listener repositions
        // everything again once the browser has actually applied it.
        r = new DOMRect(r.left, docTop - best.y, r.width, r.height);
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
    if (h <= 0 || w <= 0 || r.height > vh * MAX_SPOT_FRACTION) {
      // No ring is drawn, so the backdrop's own dim takes over — and on the
      // step that teaches the pitch highway, the thing being taught is the
      // target, so the dim landed on it. With nothing to contrast against,
      // drop the dim rather than veil the subject.
      document.body.classList.add("tour-spot-on");
      return;
    }

    u.spot.style.opacity = "1";
    u.spot.style.left = `${left}px`;
    u.spot.style.top = `${top}px`;
    u.spot.style.width = `${w}px`;
    u.spot.style.height = `${h}px`;
    document.body.classList.add("tour-spot-on");
  }

  /** Is the open step the site tour's last stop, whose button starts practice? */
  function isHandoff() {
    return !currentPack && !!stepList[index]?.handoff && index === stepList.length - 1;
  }

  /** The last stop's button: the same practice the start panel's button begins. */
  function handoffLabel() {
    if (document.body.classList.contains("loop-first")) {
      const track = global.VTApp?.getState?.()?.tab === "vocal" ? "vocal" : "singing";
      const r = global.VTLoop?.routine?.(track, "min");
      const min = r ? Math.max(1, Math.round(r.totalSec / 60)) : 3;
      return t("tour.ctaFirst", { min: String(min) });
    }
    return t(global.VTApp?.loopDrewPanel?.() ? "tour.ctaLoop" : "tour.cta");
  }

  /**
   * Open the page a stop is about. Resolves when it has laid out; the card is
   * kept out of sight meanwhile, or it would point at the page being left.
   */
  function enterView(step) {
    if (currentPack || !step.view || !global.VTApp?.tourShow) return null;
    const now = global.VTApp.getState?.()?.view;
    const sameExercise = step.view === "exercise" && now === "exercise";
    if (now === step.view && !sameExercise) return null;
    clearHighlight();
    hideSpot();
    ui.card.classList.add("tour-card-moving");
    // On a new page the ring appears where its target is; sliding over from
    // where it stood on the last page would point at nothing on the way.
    ui.spot.classList.add("tour-spot-jump");
    return global.VTApp.tourShow(step.view);
  }

  function render() {
    const step = stepList[index];
    if (!step) return end("complete");
    const u = ensureUI();
    prepare(step);
    const last = index >= stepList.length - 1;
    const handoff = isHandoff();
    // Copy is written synchronously: beginTour unhides the popover before this
    // runs, so deferring the text showed an empty card for two frames.
    u.title.textContent = t(step.titleKey);
    u.body.textContent = t(step.bodyKey);
    const nums = { n: String(index + 1), total: String(stepList.length) };
    u.progress.textContent = step.placeKey
      ? t("tour.progressPlace", { ...nums, place: t(step.placeKey) })
      : t("tour.progress", nums);
    u.close.setAttribute("aria-label", t(currentPack ? "tour.closeHelp" : "tour.close"));
    u.skip.textContent = handoff ? t("tour.notNow") : t(currentPack ? "tour.skipHelp" : "tour.skip");
    u.prev.textContent = t("tour.prev");
    u.guide.textContent = t("tour.guideLink");
    u.guide.href = guideHref(step.guideAnchor);
    u.next.textContent = handoff ? handoffLabel() : last ? t("tour.finish") : t("tour.next");
    u.card.classList.toggle("tour-handoff", handoff);
    u.prev.disabled = index === 0;
    u.prev.setAttribute("aria-disabled", String(index === 0));
    // Nothing to go back to on the first card: out of sight, but its place kept.
    u.prev.style.visibility = index === 0 ? "hidden" : "";
    track("tour_step", { pack: currentPack, stepId: step.id, n: index + 1, total: stepList.length });
    const ready = enterView(step);
    // Placement waits for layout to settle after prepare()'s scroll, and reads
    // the card's real height — the old estimate was written before the copy.
    Promise.resolve(ready).then(() => {
      if (!active || stepList[index] !== step) return;
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          if (!active || stepList[index] !== step) return;
          positionStep(step);
          u.card.classList.remove("tour-card-moving");
          requestAnimationFrame(() => u.spot.classList.remove("tour-spot-jump"));
          // Focus the heading, not Next: an AT user used to hear "Next, button"
          // on every step and never the step itself.
          try {
            u.title.focus({ preventScroll: true });
          } catch {
            u.title.focus();
          }
        });
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
    // Where the user was before we moved them. The home tour scrolls the page
    // and switches to the home view to do its job; leaving them there when it
    // ends means a one-minute tour costs them their place.
    resumeAt = stay
      ? null
      : { view: global.VTApp?.getState?.().view || null, scrollY: window.scrollY || 0 };
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
    const go = () => beginTour(homeSteps(), { fromButton: !!fromButton, pack: null, stay: false });
    // The header's tour can be pressed on an exercise. Leave it the way its own
    // back button does first, so the mic, the piano, the timer and the
    // recorder stop, and practice worth keeping asks before it goes. Staying
    // ("Seguir practicando", "Puntuar ahora") starts no tour.
    if (fromButton && global.VTApp?.getState?.()?.view === "exercise" && global.VTApp.goHome) {
      Promise.resolve(global.VTApp.goHome()).then((left) => {
        if (left !== false) go();
      });
      return;
    }
    go();
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
    // Somebody who skipped the site tour does not want help opening by itself
    // either, nor somebody who pressed "Saltar ayuda" on an exercise.
    if (!finished() || uiOff()) return;
    // Never inside a routine (today's basics, a guided session): it would
    // stop a three-minute practice for a pack of cards. "Ayuda" is there.
    if (global.VTApp?.getState?.()?.structured) return;
    const family = detectUiFamily(profile);
    if (isUiSeen(family)) return;
    setTimeout(() => {
      if (active) return;
      if (!document.body.classList.contains("view-exercise")) return;
      if (global.VTApp?.getState?.()?.structured) return;
      startUiPack(family, { force: false });
    }, 700);
  }

  /**
   * @param {"complete"|"skip"|"dismiss"|false} reason how the tour ended.
   *   Anything truthy stops it opening again; only "complete" counts as
   *   finished. `false` closes without recording anything, for a replay that
   *   is being restarted.
   */
  function end(reason, opts = {}) {
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
      if (pack) {
        markUiSeen(pack);
        // "Saltar ayuda": no more help opening by itself, on any exercise.
        if (reason !== "complete") setUiOff();
      } else writeState(reason === "complete" ? "finished" : "dismissed");
    }
    currentPack = null;
    stayOnEnd = false;
    stepList = [];
    if (opts.start) {
      // The last stop's button: today's practice, from Practicar's own button.
      resumeAt = null;
      Promise.resolve(global.VTApp?.tourShow?.("home")).then(() => {
        document.getElementById("btn-next-step")?.click();
      });
    } else if (!stay) restorePlace();
    // The start panel's invitation is built once and only re-read when the
    // panel re-renders, so without this the page the tour drops you back onto
    // is still asking whether you would like a tour.
    if (reason && !pack) global.VTApp?.refreshStartPanel?.();
  }

  /**
   * Put the page back where the tour found it: the view the user was reading
   * and the scroll position they were at. Falls back to home, which is what it
   * used to do unconditionally.
   */
  function restorePlace() {
    const at = resumeAt;
    resumeAt = null;
    if (at && at.view && at.view !== "exercise") {
      // Silently: the stops never wrote an address, so the page's own is still right.
      if (global.VTApp?.tourShow) global.VTApp.tourShow(at.view);
      else global.VTApp?.setView?.(at.view);
    } else {
      goHome();
    }
    if (at && typeof at.scrollY === "number") {
      // "instant", not "auto": `html { scroll-behavior: smooth }` in the
      // stylesheet turns an "auto" restore into a one-second glide across the
      // whole page, which reads as the page running away from you rather than
      // as being put back. Going back to where you already were should not be
      // a journey.
      //
      // Twice, a frame apart, because the home page renders its lower sections
      // lazily: at the moment the tour closes the document can still be shorter
      // than it was when the tour opened, and the browser clamps the scroll to
      // the shorter page. The second pass runs once that layout has caught up.
      const back = () => window.scrollTo({ top: at.scrollY, behavior: "instant" });
      back();
      requestAnimationFrame(() => requestAnimationFrame(back));
    }
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
    // Only ever once per browser. `done()` is written when the tour is finished
    // or explicitly dismissed, so without this an auto-opened tour that the
    // visitor simply reloaded past reopened itself on every single load.
    if (autoFired()) return;
    setTimeout(() => {
      if (active || done() || autoFired()) return;
      markAutoFired();
      start(false);
    }, 600);
  }

  function autoFired() {
    try {
      return localStorage.getItem(AUTO_KEY) === "1";
    } catch {
      return false;
    }
  }

  function markAutoFired() {
    try {
      localStorage.setItem(AUTO_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  /* ── Microphone primer ────────────────────────────────────────────────── */

  /** Closes the open primer without an answer; null while none is open. */
  let closePrimer = null;

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
  function showMicPrimer(onContinue, opts = {}) {
    const opener = document.activeElement;
    // One string for every exercise was wrong for about half of them: it
    // promised a piano and a pitch readout, and the exercise the home page's
    // own first-practice button opens has neither. Say what is true here:
    // a paced exercise (opts.pacer) runs without the microphone too.
    const bodyKey = opts.piano
      ? "tour.mic.bodyPiano"
      : opts.pacer
        ? "tour.mic.bodyPacer"
        : "tour.mic.body";
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
      closePrimer = null;
      modal.hidden = true;
      document.body.classList.remove("modal-open");
      window.VTFocusTrap?.release(modal);
      document.removeEventListener("keydown", onPrimerKey);
    };
    const decline = (how) => {
      track(`mic_primer_${how}`, {});
      markMicPrimed();
      close();
      // Saying no here cancels the Start the user just pressed. Without this the
      // product's one primary button was a silent no-op the first time anybody
      // pressed it, and pressing it again went straight through with no
      // explanation of why the first press did nothing.
      if (typeof opts.onDecline === "function") opts.onDecline();
    };
    function onPrimerKey(e) {
      if (e.key !== "Escape" || modal.hidden) return;
      e.preventDefault();
      decline("dismiss");
    }
    modal.querySelector("[data-primer-title]").textContent = t("tour.mic.title");
    modal.querySelector("[data-primer-body]").textContent = t(bodyKey);
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
    no.onclick = () => decline("decline");
    modal.hidden = false;
    document.body.classList.add("modal-open");
    document.addEventListener("keydown", onPrimerKey);
    closePrimer = close;
    track("mic_primer_show", {});
    window.VTFocusTrap?.activate(modal, { initialFocus: ok, returnFocus: opener });
  }

  /**
   * Close the primer without taking it as an answer, for when the page under it
   * changes (the browser's Back). It is not a "no": nothing is stored, so the
   * next Empezar asks again, and the "we won't ask again" toast is not shown on
   * a page with no Empezar.
   */
  function closeMicPrimer() {
    if (closePrimer) closePrimer();
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
    closeMicPrimer,
    guideHref
  };

  document.addEventListener("DOMContentLoaded", () => {
    bindReplayButton();
    bindUiHelpButton();
    bindInvite();
  });
})(window);
