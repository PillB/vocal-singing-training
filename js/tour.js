/**
 * Interactive intro tour — spotlight steps with bilingual copy.
 * First visit auto-starts; replay from header "Tour" button.
 */
(function (global) {
  "use strict";

  const STORAGE_KEY = "vt_tour_v1";

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

  /** Step definitions: selectors + optional navigation */
  function steps() {
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

  let ui = null;
  let index = 0;
  let active = false;
  let resizeObs = null;

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
      if (index >= steps().length - 1) end(true);
      else go(index + 1);
    });
    root.querySelector("[data-tour-backdrop]")?.addEventListener("click", () => {
      /* don't dismiss on backdrop — force intentional skip */
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
    if (active) positionStep(steps()[index]);
  }

  function goHome() {
    const home = document.getElementById("view-home");
    const ex = document.getElementById("view-exercise");
    if (home && !home.classList.contains("active")) {
      document.getElementById("btn-back-home")?.click();
      // if leave modal appears, cancel stay
      const leave = document.getElementById("leave-cancel");
      if (leave && !document.getElementById("leave-modal")?.hidden) leave.click();
      // force home if still stuck
      home.classList.add("active");
      ex?.classList.remove("active");
      document.body.classList.remove("view-exercise");
    }
  }

  function openSample(preferSinging) {
    // Prefer first singing exercise with pitch if preferSinging, else first vocal basic card
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
      // ensure vocal tab visible for early steps
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
      return;
    }

    u.card.classList.remove("tour-card-center");
    const el = document.querySelector(step.target);
    if (!el || el.offsetParent === null && getComputedStyle(el).display === "none") {
      // fallback center
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

    // Place card near target without going off-screen
    const cardW = Math.min(400, window.innerWidth - 24);
    const cardH = 220;
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
    const list = steps();
    const step = list[index];
    if (!step) return end(true);
    const u = ensureUI();
    prepare(step);
    // allow layout to settle after navigation
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        u.title.textContent = t(step.titleKey);
        u.body.textContent = t(step.bodyKey);
        u.progress.textContent = t("tour.progress", {
          n: String(index + 1),
          total: String(list.length)
        });
        u.skip.textContent = t("tour.skip");
        u.prev.textContent = t("tour.prev");
        u.next.textContent =
          index >= list.length - 1 ? t("tour.finish") : t("tour.next");
        u.prev.disabled = index === 0;
        u.prev.setAttribute("aria-disabled", String(index === 0));
        positionStep(step);
        u.next.focus();
      });
    });
  }

  function go(i) {
    const list = steps();
    index = Math.max(0, Math.min(list.length - 1, i));
    render();
  }

  function start(fromButton) {
    ensureUI();
    active = true;
    index = 0;
    ui.root.hidden = false;
    document.body.classList.add("tour-active");
    if (fromButton) {
      // replay: start from home welcome
      goHome();
    }
    render();
  }

  function end(mark) {
    active = false;
    clearHighlight();
    if (ui) ui.root.hidden = true;
    document.body.classList.remove("tour-active");
    if (mark) markDone();
    // Return home after tour so user can pick an exercise
    goHome();
  }

  function maybeAutoStart() {
    if (done()) return;
    // slight delay so home list is painted
    setTimeout(() => start(false), 600);
  }

  function bindReplayButton() {
    const btn = document.getElementById("btn-tour");
    if (!btn) return;
    btn.addEventListener("click", () => {
      clearDone();
      start(true);
    });
  }

  global.VTTour = {
    start,
    end,
    maybeAutoStart,
    bindReplayButton,
    isDone: done,
    reset: clearDone
  };

  document.addEventListener("DOMContentLoaded", () => {
    bindReplayButton();
    // App init also calls maybeAutoStart after list render
  });
})(window);
