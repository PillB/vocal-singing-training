/**
 * The first script on index.html, in <head>, before the stylesheet and the
 * body. It was three inline scripts on PR #21's branch; main's Content
 * Security Policy allows one inline line (the region flag), so they live
 * here, under 'self'.
 *
 * 1. Site data blocked: the browser throws as soon as a script so much as
 *    reads window.localStorage or window.sessionStorage, and every script
 *    reads them. Where that happens the name is given a store that lives only
 *    in this page, so the app starts and simply keeps nothing; where storage
 *    works nothing is replaced.
 * 2. Until the app has started the page says it is busy (js/boot-ready.js
 *    ends it), so a screen reader does not read buttons that are not wired.
 * 3. A visitor whose language is English is shown the page in English or not
 *    at all: the markup is Spanish, and i18n.js comes at the end of the body.
 *    The page is held (html.vt-i18n-pending, css/styles.css) until
 *    js/i18n-early.js has translated it, and let go whatever else happens:
 *    when a script fails to load or throws, and after eight seconds (a first
 *    visit on a slow phone connection needs about four for the scripts
 *    alone). A page that was never translated says it is Spanish.
 * 4. Everything below the header is held (html.vt-boot-pending) until the app
 *    has drawn it. The markup's own home is what a page without scripts shows;
 *    painted first, the app replaced it a moment later and the page under it
 *    jumped (a layout shift of 0.5-0.7 on about half the desktop loads once
 *    #21 was merged), and a tap on it landed on whatever moved under the
 *    finger. js/boot-ready.js lets go when the app has started; this lets go
 *    when the page has loaded (boot-ready.js missing), and when no new script
 *    has been read for eight seconds (one that never arrives) or twenty have
 *    passed, whichever comes first.
 *    On this browser's first load (html.vt-boot-hero) the hero's words show at
 *    once and only what the app adds to it and what lies below wait: nothing
 *    is cached then. The scripts are asked for all at once (index.html
 *    preloads them: Chromium looks no further ahead after the page's CSP
 *    <meta>, and found them one by one, so the app started after 11 s on a 4G
 *    phone and 3.3 s on a desktop line); the app now starts after about 2.9 s
 *    and 1.2 s. Every later load has the scripts cached, or revalidates them
 *    all at once, so all of it waits.
 */
(function () {
  "use strict";

  function memoryStore() {
    var mem = {};
    var keys = function () {
      return Object.keys(mem);
    };
    var store = {
      getItem: function (k) {
        return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null;
      },
      setItem: function (k, v) {
        mem[String(k)] = String(v);
      },
      removeItem: function (k) {
        delete mem[String(k)];
      },
      clear: function () {
        mem = {};
      },
      key: function (i) {
        var all = keys();
        return i >= 0 && i < all.length ? all[i] : null;
      }
    };
    Object.defineProperty(store, "length", {
      get: function () {
        return keys().length;
      }
    });
    return store;
  }

  ["localStorage", "sessionStorage"].forEach(function (name) {
    try {
      window[name].getItem("vt_probe");
      return;
    } catch (e) {
      /* blocked: swap it below */
    }
    try {
      Object.defineProperty(window, name, { value: memoryStore(), configurable: true });
    } catch (e) {
      /* the page keeps what it had */
    }
  });

  /**
   * Kept only by the app's own scripts (js/storage.js, js/tour.js, js/app.js),
   * which no other page loads; its first start writes several of them. The
   * guide's statistics keep keys of their own (a browser id among them), so
   * "any vt_ key" took a reader of the guide for a returning visitor.
   */
  var APP_KEYS = ["vt_settings_v1", "vt_days_v1", "vt_profiles_v1", "vt_progress_v1", "vt_tour_v1", "vt_mic_sens"];

  /**
   * Where the page was asked for, and where it was left: a reload or a step
   * back to a place below the top (history.state.y, which js/app.js keeps and
   * scrolls back to; it writes none before it has started, so a reload of a
   * first load still shows the hero), and a text fragment (#:~:text=..., from
   * a search result), which is in the navigation's address but never in
   * location.hash.
   */
  function addressed() {
    var nav = (window.performance && performance.getEntriesByType && performance.getEntriesByType("navigation")[0]) || {};
    if (history.state && history.state.y > 0) return true;
    if (location.hash || String(nav.name || "").indexOf("#") !== -1) return true;
    var query = location.search;
    try {
      query = decodeURIComponent(query);
    } catch (e) {
      /* read as it is */
    }
    return /[?&]ab_/.test(query);
  }

  /**
   * This browser's first load of the app: none of the app's own keys in
   * storage, so its scripts are not cached, which is seconds on a phone, and
   * it draws the home for someone new. Arriving from the guide counts: the
   * guide caches none of the app's scripts. Blocked storage counts too:
   * nothing is stored, so the app draws the same. Not at an address (another
   * view, or a place on the home the app scrolls to), with an experiment arm
   * forced by ?ab_..., or on a reload or a step back to a place below the top:
   * the app draws something else there.
   */
  function firstLoad() {
    if (addressed()) return false;
    try {
      for (var i = 0; i < APP_KEYS.length; i++) {
        if (localStorage.getItem(APP_KEYS[i]) !== null) return false;
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  var html = document.documentElement;
  new MutationObserver(function (_, watch) {
    if (!document.body) return;
    document.body.setAttribute("aria-busy", "true");
    watch.disconnect();
  }).observe(html, { childList: true });

  html.classList.add("vt-boot-pending");
  if (firstLoad()) html.classList.add("vt-boot-hero");

  /*
   * The last resort, for a script that never arrives: let go once no new
   * script has been read for eight seconds, and after twenty in any case. Not
   * eight seconds after the start: on a slow line the scripts can arrive one
   * by one for longer than that, and let go then the markup's home showed
   * under the hero, its buttons not wired, until the app replaced it and the
   * page jumped (review of PR #42). Only the parser's progress counts, a new
   * <script>: anything else that edits the page (an extension, a translator)
   * kept a page whose app never arrives held for the twenty seconds. On the
   * page's own clock, which a correction of the system's never moves.
   */
  var STALL_MS = 8000;
  var CAP_MS = 20000;
  var clock = function () {
    return performance.now();
  };
  var began = clock();
  var last = began;
  var isScript = function (node) {
    return node.nodeName === "SCRIPT";
  };
  var reading = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      if (Array.prototype.some.call(records[i].addedNodes, isScript)) last = clock();
    }
    if (!html.classList.contains("vt-boot-pending")) reading.disconnect();
  });
  reading.observe(document, { childList: true, subtree: true });
  var show = function () {
    html.classList.remove("vt-boot-pending");
    reading.disconnect();
  };
  // Loaded, the page has been read and the app has started (or never will):
  // what js/boot-ready.js says when it is there
  window.addEventListener("load", function () {
    html.classList.add("vt-boot-ready");
    show();
  });
  (function stalled() {
    if (!html.classList.contains("vt-boot-pending")) return reading.disconnect();
    var now = clock();
    if (now - last >= STALL_MS || now - began >= CAP_MS) return show();
    setTimeout(stalled, Math.min(STALL_MS - (now - last), CAP_MS - (now - began)));
  })();

  try {
    if (localStorage.getItem("vt_lang") !== "en") return;
  } catch (e) {
    return;
  }
  html.lang = "en";
  html.classList.add("vt-i18n-pending");
  var letGo = function () {
    if (!html.classList.contains("vt-i18n-pending")) return;
    html.classList.remove("vt-i18n-pending");
    html.lang = "es";
  };
  window.addEventListener("error", letGo, true);
  setTimeout(letGo, 8000);
})();
