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
 *    when a script fails to load (its own tag, not the request made ahead
 *    for it) or throws, and after eight seconds (a first visit on a slow
 *    phone connection needs about four for the scripts alone). A page that
 *    was never translated says it is Spanish.
 * 4. Everything below the header is held (html.vt-boot-pending) until the app
 *    has drawn it. The markup's own home is what a page without scripts shows;
 *    painted first, the app replaced it a moment later and the page under it
 *    jumped (a layout shift of 0.5-0.7 on about half the desktop loads once
 *    #21 was merged), and a tap on it landed on whatever moved under the
 *    finger. js/boot-ready.js lets go when the app has started; this lets go
 *    when the page has loaded (boot-ready.js missing), and when it has waited
 *    eight seconds for one of its scripts (one that never arrives) or twenty
 *    have passed, whichever comes first.
 *    On this browser's first load (html.vt-boot-hero) the hero's words show at
 *    once and only what the app adds to it and what lies below wait: nothing
 *    is cached then. The scripts are asked for all at once (index.html
 *    preloads them: Chromium looks no further ahead after the page's CSP
 *    <meta>, and found them one by one, so the app started after 11 s on a 4G
 *    phone and 3.3 s on a desktop line); the app now starts after about 2.9 s
 *    and 1.2 s. Every later load has the scripts cached, or revalidates them
 *    all at once, so all of it waits.
 * 0. Before all of that, a page loaded in another page's frame hides itself
 *    and asks to be the top window (red team CXSS-2, clickjacking). GitHub
 *    Pages sends no headers, so neither frame-ancestors nor X-Frame-Options
 *    can refuse the frame, and a <meta> policy cannot carry frame-ancestors
 *    (CSP3 ignores it there). Hiding is what holds: browsers block a
 *    cross-origin frame from moving the top window without a tap (Chrome's
 *    framebusting intervention), and an attacker's onbeforeunload or a
 *    sandbox can stop the move too, but not undo the hiding. A frame that
 *    runs no script runs no app either, so there is nothing in it to click.
 *    admin.html runs the same lines as js/frame-guard.js.
 */
(function () {
  "use strict";

  /** Whether this page is inside a frame: of any origin, a page of this one included (the origin is shared). */
  function framed() {
    try {
      return window.top !== window.self;
    } catch (e) {
      return true;
    }
  }
  if (framed()) {
    // CSSOM, not a style attribute: the CSP's style rules do not apply to it, and nothing on the page sets display on <html>
    document.documentElement.style.setProperty("display", "none", "important");
    try {
      window.top.location.replace(window.location.href);
    } catch (e) {
      /* refused (another origin, no tap): the page stays hidden */
    }
  }

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
   * location.hash. Only in Chromium: Safari (18) and Firefox (133) strip it
   * from the navigation's address too, and no API there tells a page it was
   * asked for one, so a first visit from a search result's text link shows
   * the hero (review of PR #42, rt5).
   */
  function addressed() {
    var nav = (window.performance && performance.getEntriesByType && performance.getEntriesByType("navigation")[0]) || {};
    if (history.state && history.state.y > 0) return true;
    if (location.hash || String(nav.name || "").indexOf("#") !== -1) return true;
    return forced();
  }

  /**
   * An experiment's arm forced in the address (?ab_<name>=<arm>), read as
   * js/experiments.js reads it: each name decoded on its own, so %61b_ is
   * ab_, a malformed escape elsewhere changes nothing, and a name inside
   * another one's value (?x=1%26ab_...) forces nothing. Decoded whole, the
   * address was read both ways wrong (review of PR #42, rt2).
   */
  function forced() {
    var arm = false;
    new URLSearchParams(location.search).forEach(function (_, name) {
      if (name.indexOf("ab_") === 0) arm = true;
    });
    return arm;
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

  /*
   * Where scrollbars take room (Windows, Linux, a Mac with a mouse), the page
   * keeps a scrollbar's room for its whole life (html.vt-scrollbar-room,
   * css/styles.css), so nothing centred moves sideways as the app starts or
   * between views. Measured here, before the first paint, on a box that always
   * scrolls: where scrollbars are drawn over the page (phones, a Mac's
   * default) or hidden (headless test runs) it takes none, and none is kept.
   * Kept by the stylesheet alone, Chromium kept it where its scrollbars are
   * hidden too, and laid every page of a headless run out 15 px narrower than
   * the phone it stands for (review of PR #42, CI on round 7).
   */
  var probe = document.createElement("div");
  probe.style.cssText = "position:absolute;top:-200px;width:100px;height:100px;overflow:scroll;visibility:hidden";
  html.appendChild(probe);
  if (probe.offsetWidth > probe.clientWidth) html.classList.add("vt-scrollbar-room");
  html.removeChild(probe);

  new MutationObserver(function (_, watch) {
    if (!document.body) return;
    document.body.setAttribute("aria-busy", "true");
    watch.disconnect();
  }).observe(html, { childList: true });

  html.classList.add("vt-boot-pending");
  if (firstLoad()) html.classList.add("vt-boot-hero");

  /*
   * The last resort, for a script that never arrives: let go once the page
   * has waited eight seconds for one of its own scripts, and after twenty in
   * any case. Not eight seconds after the start: on a slow line the scripts
   * can arrive one by one for longer than that, and let go then the markup's
   * home showed under the hero, its buttons not wired, until the app replaced
   * it and the page jumped (review of PR #42). Only the wait for a script the
   * parser stops at counts, from when it is read until it has run or failed:
   * - markup still arriving is the page being read, not stalled (let go
   *   eight seconds after the last script, it showed the markup's home
   *   mid-stream: layout shift 0.68 on a phone, review of PR #42, rt2);
   * - what anything else does to the page, an extension's edits and the
   *   scripts it adds, a translator's, neither holds it nor lets it go (any
   *   edit counted as progress held a page whose app never arrives for the
   *   whole twenty seconds).
   * On the page's own clock, which a correction of the system's never moves.
   */
  var STALL_MS = 8000;
  var CAP_MS = 20000;
  var clock = function () {
    return performance.now();
  };
  var began = clock();
  // The script the parser waits for, and since when
  var waiting = null;
  var since = began;
  // One the parser stops at: in the markup (a script that another adds is
  // async), with a file to fetch, and neither deferred nor a module
  var blocking = function (node) {
    return !!node && node.nodeName === "SCRIPT" && !!node.src && !node.async && !node.defer && node.type !== "module";
  };
  var reading = new MutationObserver(function (records) {
    for (var i = 0; i < records.length; i++) {
      var read = Array.prototype.filter.call(records[i].addedNodes, blocking);
      if (!read.length) continue;
      // Seen before it runs: the parser hands what it has read to observers
      // before it runs a script (HTML: a microtask checkpoint)
      waiting = read[read.length - 1];
      since = clock();
    }
    if (!html.classList.contains("vt-boot-pending")) stop();
  });
  // Run, or failed: the parser goes on
  var done = function (e) {
    if (e.target === waiting) waiting = null;
  };
  var stop = function () {
    reading.disconnect();
    document.removeEventListener("load", done, true);
    document.removeEventListener("error", done, true);
  };
  var show = function () {
    html.classList.remove("vt-boot-pending");
    stop();
  };
  reading.observe(document, { childList: true, subtree: true });
  document.addEventListener("load", done, true);
  document.addEventListener("error", done, true);
  // Loaded, the page has been read and the app has started (or never will):
  // what js/boot-ready.js says when it is there, the end of the busy state too
  window.addEventListener("load", function () {
    html.classList.add("vt-boot-ready");
    if (document.body) document.body.removeAttribute("aria-busy");
    show();
  });
  (function stalled() {
    if (!html.classList.contains("vt-boot-pending")) return stop();
    var now = clock();
    var waited = waiting ? now - since : 0;
    if (waited >= STALL_MS || now - began >= CAP_MS) return show();
    setTimeout(stalled, Math.min(STALL_MS - waited, CAP_MS - (now - began)));
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
  // A script that fails to load (its own element's error: the request
  // index.html makes ahead for each script fails first, while the strings may
  // still come, and let go then the Spanish page showed under lang="en";
  // review of PR #42, rt3) or that throws (the window's)
  var failed = function (e) {
    var target = e && e.target;
    if (target && target !== window && target.nodeName !== "SCRIPT") return;
    letGo();
  };
  window.addEventListener("error", failed, true);
  setTimeout(letGo, 8000);
})();
