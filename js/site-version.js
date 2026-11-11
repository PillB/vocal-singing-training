/**
 * Site designs: the same site arranged two ways, and the control that picks.
 *
 *   a  "Clásico"  — the site as it has been: Practicar, Plan, Historial.
 *   b  "Enfocado" — Practicar and Progreso (Plan, Historial, Estadísticas and
 *                   Perfiles as tabs inside it), a catalogue whose groups
 *                   fold, and a guide whose sections fold (js/site-layout.js).
 *
 * Nothing is removed in either: b folds and regroups, it never deletes.
 *
 * This file loads in <head>, before anything is drawn, so the page is painted
 * in the visitor's design from the first frame: it sets
 * `<html data-site-version="…">` and the stylesheet does the rest. It cannot be
 * an inline script (the Content Security Policy pins those to one line).
 *
 * WHAT THIS IS, AND IS NOT. A visitor choosing a design is a preference, not an
 * experiment: people who choose differ from people who never touch the control.
 * So the events below are read as "what people chose and used"
 * (workers/entitlements/src/layouts.js), never as a winner. The fair comparison
 * is the registered experiment `site_layout_2026_11`, which — once switched on
 * in js/experiments-config.js — randomises the *default* design and is read by
 * the arm a browser was first given, whatever it chose afterwards.
 *
 * What is kept on the device, and why it does not wait for the region bar:
 * `vt_site_version_v1.ver` when the visitor picks a design. That is a setting
 * the visitor asked for, like the language (`vt_lang`), which the ePrivacy
 * rules exempt (Article 29 Working Party, Opinion 04/2012, "UI customisation").
 * The visit counter beside it exists only for statistics, so it is written
 * only where statistics may be (js/region-gate.js says so), and it is removed
 * with them when the visitor switches statistics off.
 *
 * Events, all through VTAnalytics.track, so every privacy switch applies:
 *   layout_session {ver, src, n}       a visit began on a design, or first used
 *                                      one. src: default | chosen | link.
 *   layout_switch  {from, to, via, sec} the control was used, sec into the visit.
 *   layout_time    {ver, sec}          seconds in use on a design since the
 *                                      last report. Hidden tabs and idle pages
 *                                      do not count; singing does.
 */
(function (global) {
  "use strict";

  const LS_KEY = "vt_site_version_v1";
  /** Keep in step with LAYOUT_VERSIONS in workers/entitlements/src/layouts.js. */
  const VERSIONS = ["a", "b"];
  const DEFAULT = "a";
  const EXPERIMENT = "site_layout_2026_11";
  /** A visit ends after this long with nothing done (the usual analytics definition). */
  const SESSION_GAP_MS = 30 * 60 * 1000;
  /** With no input for this long the page is open but nobody is using it. */
  const IDLE_MS = 5 * 60 * 1000;
  /** Report in chunks, so a page left open all evening is not one giant claim. */
  const CHUNK_MS = 5 * 60 * 1000;
  const TICK_MS = 30 * 1000;
  /** The worker clamps one report at an hour; never send more than it keeps. */
  const MAX_REPORT_SEC = 3600;

  const doc = global.document;
  const root = doc.documentElement;

  /** What this page is showing and how it came to. */
  const live = { ver: DEFAULT, src: "default", preview: false };
  /** The stretch of use being timed: when it began, and the last input seen. */
  const clock = { since: 0, lastInput: 0, timer: 0, started: false, lastSave: 0 };

  function isVersion(v) {
    return typeof v === "string" && VERSIONS.includes(v);
  }

  function readBag() {
    try {
      const bag = JSON.parse(localStorage.getItem(LS_KEY) || "null");
      if (bag && typeof bag === "object" && !Array.isArray(bag)) return bag;
    } catch {
      /* private mode, or JSON of the wrong kind */
    }
    return {};
  }

  function writeBag(bag) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(bag));
      return true;
    } catch {
      return false;
    }
  }

  /** `?version=b` shows a design for this page only, storing nothing. */
  function linkedVersion() {
    try {
      const q = new URLSearchParams(global.location.search).get("version");
      return isVersion(q) ? q : null;
    } catch {
      return null;
    }
  }

  /**
   * May the visit counter be kept? Not where the law wants the visitor asked
   * first and they have not said yes, and not when they switched statistics off.
   * @returns {boolean} Whether statistics-only bookkeeping may touch the device.
   */
  function mayCount() {
    if (global.VT_REGION_REQUIRED && typeof global.VTRegion?.inert !== "function") return false;
    if (global.VTRegion?.inert?.()) return false;
    const state = global.VTAnalytics?.remoteState?.();
    return !(state && state.optedOut);
  }

  function track(name, props) {
    try {
      return global.VTAnalytics?.track?.(name, props) || "";
    } catch {
      return "";
    }
  }

  function paint(ver) {
    live.ver = isVersion(ver) ? ver : DEFAULT;
    root.setAttribute("data-site-version", live.ver);
  }

  /** Before first paint: the link, else what the visitor (or the experiment) last settled. */
  function early() {
    const linked = linkedVersion();
    if (linked) {
      live.preview = true;
      live.src = "link";
      paint(linked);
      return;
    }
    const bag = readBag();
    live.src = bag.src === "chosen" ? "chosen" : "default";
    paint(isVersion(bag.ver) ? bag.ver : DEFAULT);
  }

  /**
   * With no choice made, the default is the experiment's arm: the control for
   * everybody while it is off. Asked once the experiment code has loaded.
   */
  function settleDefault() {
    if (live.preview || live.src === "chosen") return;
    const exp = global.VTExperiments;
    if (!exp || typeof exp.exposeOnce !== "function") return;
    const arm = exp.exposeOnce(EXPERIMENT);
    if (!isVersion(arm)) return;
    rememberDefault(arm, !!exp.assignment(EXPERIMENT).enabled);
    if (arm === live.ver) return;
    paint(arm);
    announce();
  }

  /**
   * Keep the assigned default so the next load paints it at once — only while
   * a split is running, which is never before an ask-first visitor has said
   * yes. A default left over from a split that has since been switched off is
   * removed, or every later load would flash the old arm before the control.
   * @param {string} arm The design assigned.
   * @param {boolean} splitting Whether the experiment is on.
   */
  function rememberDefault(arm, splitting) {
    const bag = readBag();
    if (splitting && mayCount()) {
      if (bag.ver === arm && bag.src === "default") return;
      bag.ver = arm;
      bag.src = "default";
      writeBag(bag);
    } else if (bag.ver !== undefined && bag.src !== "chosen") {
      delete bag.ver;
      delete bag.src;
      writeBag(bag);
    }
  }

  function announce() {
    try {
      doc.dispatchEvent(new CustomEvent("vt:site-version", { detail: { version: live.ver, source: live.src } }));
    } catch {
      /* a browser without CustomEvent has no listeners that could care */
    }
  }

  // ------------------------------------------------------------ visits

  /**
   * Note that this design is in use now. A new visit is counted after thirty
   * quiet minutes; within a visit each design is reported once, the first time
   * it is used. The counter is shared by every tab, so two tabs are one visit.
   * @param {number} now Milliseconds.
   */
  function touchVisit(now) {
    if (!mayCount()) return;
    const bag = readBag();
    const last = Number(bag.last) || 0;
    const fresh = !last || now - last > SESSION_GAP_MS || now < last - SESSION_GAP_MS;
    if (fresh) {
      bag.n = Math.min((Number(bag.n) || 0) + 1, 100000);
      bag.start = now;
      bag.seen = [];
    }
    bag.last = now;
    const seen = Array.isArray(bag.seen) ? bag.seen.filter(isVersion) : [];
    const first = !seen.includes(live.ver);
    if (first) seen.push(live.ver);
    bag.seen = seen;
    // The mark goes down before the event: if the device refuses the write,
    // every page load would otherwise report the same visit again.
    if (!writeBag(bag)) return;
    clock.lastSave = now;
    if (first) track("layout_session", { ver: live.ver, src: live.src, n: bag.n });
  }

  /** Seconds since the visit began, for a switch; 0 when unknown. */
  function visitSeconds(now) {
    const start = Number(readBag().start) || 0;
    if (!start || now < start) return 0;
    return Math.min(Math.round((now - start) / 1000), MAX_REPORT_SEC);
  }

  // ------------------------------------------------------------ time in use

  function visible() {
    return doc.visibilityState !== "hidden";
  }

  /** Singing is use, though nothing is pressed for minutes (js/app.js sets the class). */
  function practising() {
    return !!doc.body && doc.body.classList.contains("practice-live");
  }

  /**
   * Close the stretch being timed and report it. The end of a stretch is the
   * last moment anybody was there: now while singing, otherwise no later than
   * five minutes after the last input.
   * @param {number} now Milliseconds.
   * @param {boolean} [leaving] The page is going away: send at once.
   */
  function closeStretch(now, leaving) {
    if (!clock.since) return;
    const end = practising() ? now : Math.min(now, clock.lastInput + IDLE_MS);
    const sec = Math.round((end - clock.since) / 1000);
    clock.since = 0;
    if (sec >= 1) track("layout_time", { ver: live.ver, sec: Math.min(sec, MAX_REPORT_SEC) });
    // analytics.js bound its own page-hide listener first, so its flush has
    // already run by the time this report is queued: send what was just added.
    if (leaving) global.VTAnalytics?.flush?.(true);
  }

  function openStretch(now) {
    if (!visible()) return;
    clock.since = now;
    clock.lastInput = now;
  }

  function onInput() {
    const now = Date.now();
    const idleFor = now - clock.lastInput;
    if (clock.since && idleFor > IDLE_MS && !practising()) {
      // Back after a pause: report what was used, and start counting afresh.
      closeStretch(now);
      touchVisit(now);
      openStretch(now);
      return;
    }
    clock.lastInput = now;
    if (!clock.since) openStretch(now);
    // The shared "last active" mark, written sparingly.
    if (now - clock.lastSave > TICK_MS) touchVisit(now);
  }

  function onTick() {
    const now = Date.now();
    if (!clock.since) return;
    if (now - clock.since >= CHUNK_MS) {
      closeStretch(now);
      openStretch(now);
      if (practising()) touchVisit(now);
    }
  }

  function onVisibility() {
    const now = Date.now();
    if (visible()) {
      touchVisit(now);
      openStretch(now);
    } else {
      closeStretch(now, true);
    }
  }

  function startClock() {
    if (clock.started) return;
    clock.started = true;
    const now = Date.now();
    touchVisit(now);
    openStretch(now);
    doc.addEventListener("visibilitychange", onVisibility);
    // pagehide for the browsers that end a page without a visibility change;
    // pageshow for a page restored from the back/forward cache, whose timers
    // were frozen. Never `unload`: it switches that cache off.
    global.addEventListener("pagehide", () => closeStretch(Date.now(), true));
    global.addEventListener("pageshow", (event) => {
      if (event.persisted) onVisibility();
    });
    ["pointerdown", "keydown", "touchstart", "scroll"].forEach((type) => {
      global.addEventListener(type, onInput, { passive: true, capture: true });
    });
    clock.timer = global.setInterval(onTick, TICK_MS);
  }

  // ------------------------------------------------------------ the control

  /**
   * Change design, by the visitor's hand.
   * @param {string} ver "a" or "b".
   * @param {string} [via] Where from: "menu" (the control) is the default.
   * @returns {boolean} Whether anything changed.
   */
  function set(ver, via) {
    if (!isVersion(ver) || ver === live.ver) return false;
    const now = Date.now();
    const from = live.ver;
    closeStretch(now);
    const bag = readBag();
    bag.ver = ver;
    bag.src = "chosen";
    writeBag(bag);
    live.src = "chosen";
    live.preview = false;
    paint(ver);
    track("layout_switch", {
      from,
      to: ver,
      via: /^[a-z]{1,12}$/.test(String(via || "")) ? via : "menu",
      sec: visitSeconds(now)
    });
    touchVisit(now);
    openStretch(now);
    syncControl();
    announce();
    return true;
  }

  function syncControl() {
    const select = doc.getElementById("site-version");
    if (select && select.value !== live.ver) select.value = live.ver;
  }

  function bindControl() {
    const select = doc.getElementById("site-version");
    if (!select) return;
    syncControl();
    select.addEventListener("change", () => {
      if (!set(select.value, "menu")) syncControl();
    });
    select.addEventListener("focus", () => revealBelowHeader(select));
  }

  /**
   * Tab can land on the control while the page is scrolled so that it sits
   * behind the sticky header: in the viewport as far as the browser can tell,
   * so it does not scroll, and focused where nobody can see it (WCAG 2.4.11).
   * @param {Element} el The control that took focus.
   */
  function revealBelowHeader(el) {
    const header = doc.querySelector(".app-header");
    if (!header) return;
    const gap = el.getBoundingClientRect().top - header.getBoundingClientRect().bottom;
    if (gap < 4) global.scrollBy({ top: gap - 8, behavior: "auto" });
  }

  /** Another tab changed the design: follow it, and count nothing twice. */
  function onStorage(event) {
    if (event.key !== LS_KEY || live.preview) return;
    const bag = readBag();
    if (!isVersion(bag.ver) || bag.ver === live.ver || bag.src !== "chosen") return;
    closeStretch(Date.now());
    live.src = "chosen";
    paint(bag.ver);
    openStretch(Date.now());
    syncControl();
    announce();
  }

  /**
   * Statistics were switched off (js/privacy-switch.js): drop the visit
   * counter, keep the design the visitor chose.
   */
  function forgetCounts() {
    const bag = readBag();
    const kept = {};
    if (isVersion(bag.ver) && bag.src === "chosen") {
      kept.ver = bag.ver;
      kept.src = "chosen";
    }
    clock.since = 0;
    try {
      if (kept.ver) localStorage.setItem(LS_KEY, JSON.stringify(kept));
      else localStorage.removeItem(LS_KEY);
    } catch {
      /* nothing was kept, then */
    }
  }

  function ready() {
    settleDefault();
    bindControl();
    announce();
    if (global.VTAnalytics) startClock();
    global.addEventListener("storage", onStorage);
  }

  early();
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", ready);
  else ready();

  global.VTSiteVersion = {
    VERSIONS: VERSIONS.slice(),
    current: () => live.ver,
    source: () => live.src,
    set,
    forgetCounts
  };
})(window);
