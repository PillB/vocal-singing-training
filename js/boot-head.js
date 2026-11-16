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
 *    when the page has loaded (boot-ready.js missing) and after eight seconds
 *    (a script that never arrives), whichever comes first.
 *    On this browser's first load (html.vt-boot-hero) the hero's words show at
 *    once and only its buttons and what lies below it wait. Nothing is cached
 *    then: the app starts after about 1.8 s on a fast line and 5 s on a 4G
 *    phone, and holding the whole page made that the time anything showed
 *    (0.3 and 0.8 s before). Every later load has the scripts cached and the
 *    app starts in about half a second, so all of it waits.
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

  /** Written by the guide, terms and privacy pages too: no sign that the app has run here */
  var PAGE_KEYS = { vt_site_version_v1: 1, vt_analytics_v1: 1, vt_analytics_optout_v1: 1, vt_eu_consent_v1: 1 };

  /**
   * This browser's first load of the app: none of the app's own vt_ keys in
   * storage (its first load writes several), so its scripts are not cached,
   * which is seconds on a phone, and it draws the home for someone new.
   * Arriving from the guide counts: the guide caches none of the app's
   * scripts. Blocked storage counts too: nothing is stored, so the app draws
   * the same. Not with an address (another view, or a place on the home the
   * app scrolls to) nor with an experiment arm forced by ?ab_..., where the
   * app draws something else.
   */
  function firstLoad() {
    if (location.hash || /[?&]ab_/.test(location.search)) return false;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var key = String(localStorage.key(i));
        if (key.indexOf("vt_") === 0 && !PAGE_KEYS[key]) return false;
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
  var show = function () {
    html.classList.remove("vt-boot-pending");
  };
  window.addEventListener("load", show);
  setTimeout(show, 8000);

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
