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
 *    when the page has loaded (boot-ready.js missing), and when nothing new has
 *    been read for eight seconds (a script that never arrives) or twenty have
 *    passed, whichever comes first.
 *    On this browser's first load (html.vt-boot-hero) the hero's words show at
 *    once and only its buttons and what lies below it wait. Nothing is cached
 *    then, and the scripts arrive one after another (Chromium looks no further
 *    ahead after the page's CSP <meta>): the app starts after about 3.3 s on a
 *    desktop line and 5.5-11 s on a 4G phone (70-170 ms round trips), and
 *    holding the whole page made that the time anything showed. Every later
 *    load has the scripts cached and the app starts in about 0.3 s on a
 *    desktop and 0.8-1 s on a phone, so all of it waits.
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
   * Where the page was asked for and how: a reload or a step back is not a
   * first visit (the app restores the place it kept), and a text fragment
   * (#:~:text=..., from a search result) is in the navigation's address but
   * never in location.hash.
   */
  function addressed() {
    var nav = (window.performance && performance.getEntriesByType && performance.getEntriesByType("navigation")[0]) || {};
    if (nav.type === "reload" || nav.type === "back_forward") return true;
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
   * forced by ?ab_..., on a reload or a step back: the app draws something
   * else there.
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
   * The last resort, for a script that never arrives: let go once nothing new
   * has been read for eight seconds, and after twenty in any case. Not eight
   * seconds after the start: on a slow phone the scripts arrive one by one for
   * longer than that (11-14 s on a 4G or Lighthouse mobile profile), and let
   * go then the markup's home showed under the hero, its buttons not wired,
   * until the app replaced it and the page jumped (review of PR #42).
   */
  var STALL_MS = 8000;
  var CAP_MS = 20000;
  var began = Date.now();
  var last = began;
  var reading = new MutationObserver(function () {
    last = Date.now();
    if (!html.classList.contains("vt-boot-pending")) reading.disconnect();
  });
  reading.observe(document, { childList: true, subtree: true });
  var show = function () {
    html.classList.remove("vt-boot-pending");
    reading.disconnect();
  };
  window.addEventListener("load", show);
  (function stalled() {
    if (!html.classList.contains("vt-boot-pending")) return reading.disconnect();
    var now = Date.now();
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
