/**
 * Design "b" (Enfocado): the same screens, regrouped. See js/site-version.js
 * for what a design is and how one is chosen. Everything here is undone the
 * moment the visitor goes back to "a", with no reload.
 *
 * What b changes, and why:
 *
 * 1. Practicar | Progreso. Plan and Historial become two of four tabs inside
 *    one "Progreso" section, with Estadísticas and Perfiles, which in "a" sit
 *    at the bottom of a long Historial page. Five header controls on a 360 px
 *    phone were the reason Plan and Historial clip at large text sizes; two
 *    destinations fit. The views, their addresses (#plan, #historial) and
 *    every id are the ones "a" uses, so Back, shared links and the tour work
 *    unchanged: the Progreso tabs press the same hidden buttons a visitor in
 *    "a" presses.
 * 2. Historial is split: the record, the numbers and the profiles are one tab
 *    each instead of one page three screens long.
 * 3. The catalogue's groups fold. The first is open; a closed one says how
 *    many exercises it holds. Nothing is removed from the list, and a search
 *    or a filter chip shows everything as before.
 *
 * No function of js/app.js is edited for this: the file watches which view is
 * showing and what the catalogue draws. That keeps "a" byte-for-byte what it
 * was, which is the point of a comparison.
 */
(function (global) {
  "use strict";

  const doc = global.document;
  const $ = (sel) => doc.querySelector(sel);
  const PROGRESS_TABS = ["history", "plan", "stats", "profiles"];
  /** Which catalogue groups the visitor closed or opened, by track and group. */
  const folds = new Map();
  const state = { tab: "history", wanted: null, view: "home", bound: false };

  function isB() {
    return doc.documentElement.getAttribute("data-site-version") === "b";
  }

  function t(key, vars) {
    return global.VTI18n ? global.VTI18n.t(key, vars) : key;
  }

  function currentView() {
    const active = $(".view.active");
    return active ? active.id.replace(/^view-/, "") : "home";
  }

  // ------------------------------------------------------------ Progreso

  function inProgress(view) {
    return view === "plan" || view === "history";
  }

  /** Show the tab strip in Plan and Historial, and mark where the visitor is. */
  function syncProgress() {
    const strip = $("#progress-tabs");
    const nav = $("#btn-nav-progress");
    const view = currentView();
    const on = isB() && inProgress(view);
    if (view === "plan") state.tab = "plan";
    else if (view === "history") state.tab = state.wanted || (state.view === "history" ? state.tab : "history");
    if (state.tab === "plan" && view === "history") state.tab = "history";
    state.wanted = null;
    state.view = view;
    if (strip) strip.hidden = !on;
    if (nav) {
      nav.classList.toggle("active", on);
      if (on) nav.setAttribute("aria-current", "page");
      else nav.removeAttribute("aria-current");
    }
    const history = $("#view-history");
    if (history) {
      if (isB()) history.setAttribute("data-progress-tab", state.tab === "plan" ? "history" : state.tab);
      else history.removeAttribute("data-progress-tab");
    }
    syncStatsEmpty(on);
    PROGRESS_TABS.forEach((name) => {
      const button = $(`#progress-tabs [data-progress="${name}"]`);
      if (!button) return;
      const current = on && name === state.tab;
      button.classList.toggle("active", current);
      if (current && button.scrollIntoView) button.scrollIntoView({ block: "nearest", inline: "nearest" });
      if (current) button.setAttribute("aria-current", "true");
      else button.removeAttribute("aria-current");
    });
  }

  /**
   * Estadísticas before the first saved practice: js/app.js hides the card,
   * which in "a" leaves the rest of Historial; here it would leave a blank
   * tab, so say why it is empty.
   * @param {boolean} on Whether Progreso is showing.
   */
  function syncStatsEmpty(on) {
    const note = $("#progress-empty");
    if (!note) return;
    const card = $("#value-pulse");
    const blank = !!card && (card.hidden || global.getComputedStyle(card).display === "none");
    note.hidden = !(on && state.tab === "stats" && blank);
  }

  /**
   * A sideways swipe on Plan or Historial moves to the next or previous tab,
   * as the strip above suggests it would. Only a clearly horizontal flick
   * counts, and never one that starts on something that scrolls sideways
   * itself (the week rail, the practice map, the strip).
   */
  const swipe = { x: 0, y: 0, t: 0, on: false };

  function scrollsSideways(node) {
    let el = node;
    while (el && el !== doc.body && el.nodeType === 1) {
      if (el.scrollWidth > el.clientWidth + 4) {
        const flow = global.getComputedStyle(el).overflowX;
        if (flow === "auto" || flow === "scroll") return true;
      }
      el = el.parentElement;
    }
    return false;
  }

  function onSwipeStart(event) {
    swipe.on = false;
    if (!isB() || !inProgress(currentView()) || event.touches.length !== 1) return;
    const target = event.target.nodeType === 1 ? event.target : event.target.parentElement;
    // Not over the header, a dialog or the tour, and not on a control that
    // takes a sideways drag itself.
    if (!target || target.closest("header, dialog, .modal-overlay, #tour-root, input, select, textarea, [role='slider']")) return;
    if (scrollsSideways(target)) return;
    swipe.on = true;
    swipe.x = event.touches[0].clientX;
    swipe.y = event.touches[0].clientY;
    swipe.t = Date.now();
  }

  function onSwipeEnd(event) {
    if (!swipe.on) return;
    swipe.on = false;
    const touch = event.changedTouches[0];
    const dx = touch.clientX - swipe.x;
    const dy = touch.clientY - swipe.y;
    if (Math.abs(dx) < 70 || Math.abs(dx) < Math.abs(dy) * 2 || Date.now() - swipe.t > 600) return;
    const next = PROGRESS_TABS.indexOf(state.tab) + (dx < 0 ? 1 : -1);
    if (next >= 0 && next < PROGRESS_TABS.length) openProgress(PROGRESS_TABS[next]);
  }

  /** Go to one of the four tabs through the buttons "a" uses. */
  function openProgress(name) {
    const tab = PROGRESS_TABS.includes(name) ? name : "history";
    if (tab === "plan") {
      $("#btn-plan")?.click();
      return;
    }
    state.wanted = tab;
    if (currentView() === "history") syncProgress();
    else $("#btn-history")?.click();
  }

  function bindProgress() {
    $("#btn-nav-progress")?.addEventListener("click", () => {
      // From Plan or Historial the button is "the top of where you are", like
      // Practicar is; from anywhere else it opens the tab last looked at.
      if (inProgress(currentView())) global.scrollTo({ top: 0 });
      else openProgress(state.tab);
    });
    PROGRESS_TABS.forEach((name) => {
      $(`#progress-tabs [data-progress="${name}"]`)?.addEventListener("click", () => openProgress(name));
    });
    // On the document, not <main>: a short page leaves most of the screen
    // below it, and a thumb does not aim for where the content happens to end.
    doc.addEventListener("touchstart", onSwipeStart, { passive: true });
    doc.addEventListener("touchend", onSwipeEnd, { passive: true });
  }

  // ------------------------------------------------------------ catalogue

  function trackKey() {
    const tab = $("#track-switch .tab.active");
    return (tab && tab.getAttribute("data-tab")) || "vocal";
  }

  function tierOf(head) {
    const match = /\btier-([a-z]+)\b/.exec(head.className);
    return match ? match[1] : "basic";
  }

  /** The cards a group head stands over: its siblings up to the next head. */
  function cardsOf(head) {
    const cards = [];
    let node = head.nextElementSibling;
    while (node && !node.classList.contains("grid-group-head")) {
      if (node.classList.contains("card-ex")) cards.push(node);
      node = node.nextElementSibling;
    }
    return cards;
  }

  function setFold(head, open) {
    const toggle = head.querySelector(".group-fold");
    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
    head.classList.toggle("is-folded", !open);
    cardsOf(head).forEach((card) => card.classList.toggle("sv-folded", !open));
  }

  /**
   * Turn a group's heading into its own fold control. The heading stays a
   * heading (the button goes inside it), so the outline a screen reader walks
   * is the one "a" has.
   */
  function dressHead(head, index) {
    const key = `${trackKey()}:${tierOf(head)}`;
    if (!head.querySelector(".group-fold")) {
      const button = doc.createElement("button");
      button.type = "button";
      button.className = "group-fold";
      while (head.firstChild) button.appendChild(head.firstChild);
      const caret = doc.createElement("span");
      caret.className = "group-fold-caret";
      caret.setAttribute("aria-hidden", "true");
      caret.textContent = "▾";
      button.appendChild(caret);
      head.appendChild(button);
      button.addEventListener("click", () => {
        const open = button.getAttribute("aria-expanded") !== "true";
        folds.set(key, open);
        setFold(head, open);
      });
    }
    setFold(head, folds.has(key) ? folds.get(key) : index === 0);
  }

  /** Undo dressHead: the heading as js/app.js drew it, every card showing. */
  function undressHead(head) {
    const button = head.querySelector(".group-fold");
    if (button) {
      button.querySelector(".group-fold-caret")?.remove();
      while (button.firstChild) head.insertBefore(button.firstChild, button);
      button.remove();
    }
    head.classList.remove("is-folded");
  }

  function syncCatalog() {
    const list = $("#exercise-list");
    if (!list) return;
    const heads = Array.from(list.querySelectorAll(".grid-group-head"));
    if (!isB()) {
      heads.forEach(undressHead);
      list.querySelectorAll(".sv-folded").forEach((card) => card.classList.remove("sv-folded"));
      return;
    }
    heads.forEach(dressHead);
  }

  /**
   * An exercise the app wants on screen (the tour's, or "continue") must not
   * be inside a closed group: open the group that holds it.
   * @param {string} id Exercise id.
   */
  function reveal(id) {
    const card = doc.querySelector(`#exercise-list .card-ex[data-id="${String(id).replace(/["\\]/g, "")}"]`);
    if (!card || !card.classList.contains("sv-folded")) return;
    let node = card.previousElementSibling;
    while (node && !node.classList.contains("grid-group-head")) node = node.previousElementSibling;
    if (node) setFold(node, true);
  }

  // ------------------------------------------------------------ the guide

  /**
   * In "b" the written guide opens as a list of its sections: fourteen
   * headings on one screen instead of fourteen screens of text. A section
   * opens on its heading, on a link to it or to anything inside it, and
   * "open all" restores the page "a" shows. Printing shows everything.
   */
  const guide = { built: false };

  function guideHeads() {
    return Array.from(doc.querySelectorAll(".guide-wrap h2[id]"));
  }

  /** Wrap what follows a heading, up to the next heading, so it can fold. */
  function wrapSection(head) {
    const body = doc.createElement("div");
    body.className = "guide-fold-body";
    let node = head.nextSibling;
    while (node && !(node.nodeType === 1 && /^(H1|H2|SECTION|NAV)$/.test(node.tagName))) {
      const next = node.nextSibling;
      body.appendChild(node);
      node = next;
    }
    head.after(body);
    const button = doc.createElement("button");
    button.type = "button";
    button.className = "guide-fold";
    while (head.firstChild) button.appendChild(head.firstChild);
    head.appendChild(button);
    button.addEventListener("click", () => {
      if (isB()) openGuide(head, body.hidden);
    });
  }

  function openGuide(head, open) {
    const body = head.nextElementSibling;
    if (!body || !body.classList.contains("guide-fold-body")) return;
    body.hidden = !open;
    head.querySelector(".guide-fold")?.setAttribute("aria-expanded", open ? "true" : "false");
  }

  /** Open the section an address points into (#basicos lives inside #inicio). */
  function openGuideTarget() {
    let target = null;
    try {
      target = doc.getElementById(decodeURIComponent(global.location.hash.slice(1)));
    } catch {
      target = null;
    }
    if (!target) return;
    const body = target.closest(".guide-fold-body");
    const head = body ? body.previousElementSibling : target;
    if (head && head.tagName === "H2") openGuide(head, true);
    if (body) target.scrollIntoView();
  }

  function syncGuide() {
    const heads = guideHeads();
    if (!heads.length) return;
    if (!guide.built) {
      if (!isB()) return;
      guide.built = true;
      heads.forEach(wrapSection);
      global.addEventListener("hashchange", openGuideTarget);
      global.addEventListener("beforeprint", () => heads.forEach((head) => openGuide(head, true)));
      doc.addEventListener("click", (event) => {
        const link = event.target.closest && event.target.closest('a[href^="#"]');
        // A link to the section already in the address fires no hashchange.
        if (link && link.getAttribute("href") === global.location.hash) openGuideTarget();
      });
    }
    // "a": every section open, as the page is written.
    heads.forEach((head, index) => openGuide(head, !isB() || index === 0));
    if (isB()) openGuideTarget();
  }

  // ------------------------------------------------------------ wiring

  /** The tour makes the page behind it inert; these two strips are part of that page. */
  function syncInert() {
    const on = doc.body.classList.contains("tour-active");
    ["#site-version-bar", "#progress-tabs"].forEach((sel) => {
      const node = $(sel);
      if (!node) return;
      if (on) node.setAttribute("inert", "");
      else node.removeAttribute("inert");
    });
  }

  function syncAll() {
    syncProgress();
    syncCatalog();
    syncGuide();
  }

  function watch() {
    const views = new MutationObserver(syncProgress);
    doc.querySelectorAll(".view").forEach((view) => {
      views.observe(view, { attributes: true, attributeFilter: ["class"] });
    });
    const list = $("#exercise-list");
    if (list) new MutationObserver(syncCatalog).observe(list, { childList: true });
    new MutationObserver(syncInert).observe(doc.body, { attributes: true, attributeFilter: ["class"] });
  }

  function init() {
    if (state.bound) return;
    state.bound = true;
    bindProgress();
    watch();
    doc.addEventListener("vt:site-version", syncAll);
    syncAll();
    syncInert();
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();

  global.VTSiteLayout = { openProgress, reveal, sync: syncAll, t };
})(window);
