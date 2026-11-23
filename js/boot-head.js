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
 * 3. A visitor whose language is English (their choice, or with none their
 *    browser's: see window.VTLangPref below) is shown the page in English or
 *    not at all: the markup is Spanish, and i18n.js comes at the end of the body.
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

  /*
   * Which language the app opens in. Decided here, before the first paint,
   * because the page is held for an English visitor (below); js/i18n.js asks
   * the same question through window.VTLangPref, so the two cannot disagree.
   *
   * 1. An address that names one (?lang=es, ?lang=en): the URL of one version,
   *    which index.html's hreflang links point search engines at. It is shown,
   *    never stored as a choice; the language button keeps the address in step.
   * 2. A choice the visitor made: the language button writes vt_lang, and
   *    only "es" or "en" there is a choice.
   * 3. The language an address named earlier in this tab (vt_lang_link,
   *    below), for the pages of the visit that come back without it.
   * 4. Without one, the browser's own list (navigator.languages, the order
   *    set in its settings, most wanted first), walked in order (RFC 4647
   *    lookup on the primary subtag): the first entry in one of the site's
   *    languages wins, so a list that puts English after Spanish (Firefox's
   *    Spanish builds, Android in-app browsers) stays Spanish. A language whose
   *    readers read Spanish more easily than English counts as Spanish where
   *    it stands in the list: CLDR's close matches into Spanish (Aymara,
   *    Basque, Catalan, Galician, Guarani, Quechua) and Portuguese.
   * 5. A list that names only other languages: English, which more of their
   *    readers share. Chrome lists English after most of them anyway
   *    (de-DE, de, en-US, en), and Safari exposes the first language alone, so
   *    without this a German on an iPhone got Spanish and on Chrome English.
   * 6. No language named at all: Spanish, the site's own and its market's.
   * What the browser said is read on every load and never stored, so a guess
   * never turns into a choice. Safari, and Firefox resisting fingerprinting
   * (en-US for everyone), expose less than the visitor set; the button and
   * a remembered choice are what correct that.
   */
  var LANGS = ["es", "en"];
  var LANG_KEY = "vt_lang";
  // CLDR languageInfo.xml lists ay, ca, eu, gl, gn (distance 20) and qu (30) as one-way matches to es. It has
  // no pt entry: Portuguese is this site's call, for readers far likelier to read Spanish than English
  var READS_SPANISH = ["ay", "ca", "eu", "gl", "gn", "qu", "pt"];
  // Step 5: what a browser that names only other languages is shown
  var OTHER_LANGS = "en";
  // ISO 639-2's codes that name no language: undetermined, multiple, uncoded, no linguistic content
  var NO_LANGUAGE = ["und", "mul", "mis", "zxx"];

  /** The primary language subtag of a tag, lower case ("es" for "es-PE", "en" for " EN_us"). */
  function primaryOf(tag) {
    return String(tag == null ? "" : tag).trim().toLowerCase().split(/[-_]/)[0];
  }

  /** The language these tags, most wanted first, ask the site for (steps 4 to 6 above). */
  function fromBrowser(tags) {
    var list = [].concat(tags || []);
    var named = false;
    for (var i = 0; i < list.length; i++) {
      var primary = primaryOf(list[i]);
      if (LANGS.indexOf(primary) !== -1) return primary;
      if (READS_SPANISH.indexOf(primary) !== -1) return "es";
      // "*", "i-default", "x-..." and "und" name no language
      if (/^[a-z]{2,3}$/.test(primary) && NO_LANGUAGE.indexOf(primary) === -1) named = true;
    }
    return named ? OTHER_LANGS : LANGS[0];
  }

  /** The browser's languages, most wanted first; navigator.language alone where there is no list. */
  function browserTags() {
    try {
      var nav = window.navigator;
      if (nav.languages && nav.languages.length) return Array.prototype.slice.call(nav.languages);
      return nav.language ? [nav.language] : [];
    } catch (e) {
      return [];
    }
  }

  /** The language the address names (?lang=en), or null. */
  function linked() {
    try {
      var v = String(new URLSearchParams(location.search).get("lang") || "").toLowerCase();
      return LANGS.indexOf(v) !== -1 ? v : null;
    } catch (e) {
      return null;
    }
  }

  /*
   * The language a link opened this tab in, for the rest of the tab's life.
   * Some links back into the app drop the address's ?lang: the "← App" in
   * the guide's, privacy page's and terms' headers (./), a checkout's return
   * (?billing=success). (The "back to the app" at the end of each half of
   * those pages names its half's language.) Someone who came in through the
   * English address, on a browser set to Spanish, would be switched to
   * Spanish by the next page of their own visit. Below a choice: the address
   * shows its language on the page it names (step 1), but its memory never
   * outranks what the visitor picked, so on the visit's later pages a stored
   * choice wins again. Kept per tab (sessionStorage), so it ends with the
   * visit; the ePrivacy exemption for a user-interface preference kept for a
   * session covers it (WP29 Opinion 04/2012, 3.6).
   */
  var LINK_KEY = "vt_lang_link";

  /** The language a link opened this tab in, or null. */
  function linkedBefore() {
    try {
      var v = sessionStorage.getItem(LINK_KEY);
      return LANGS.indexOf(v) !== -1 ? v : null;
    } catch (e) {
      return null;
    }
  }

  try {
    if (linked()) sessionStorage.setItem(LINK_KEY, linked());
  } catch (e) {
    /* storage refused: the address alone decides, on this page */
  }

  /** The visitor's own choice, or null when they never made one (or what is kept is not a language of ours). */
  function chosen() {
    try {
      var v = localStorage.getItem(LANG_KEY);
      return LANGS.indexOf(v) !== -1 ? v : null;
    } catch (e) {
      return null;
    }
  }

  /** Whether this stored ledger or progress bag holds any practice: a day, or an exercise. */
  function holdsPractice(key) {
    try {
      var bag = JSON.parse(localStorage.getItem(key));
      var rows = /vt_days_v1$/.test(key) ? bag && bag.days : bag;
      return !!rows && typeof rows === "object" && Object.keys(rows).length > 0;
    } catch (e) {
      return false;
    }
  }

  /** Practice kept in this browser, under any profile (vt_days_v1, vt_prof_<id>_vt_progress_v1, ...). */
  function practised() {
    for (var i = 0; i < localStorage.length; i++) {
      var key = String(localStorage.key(i) || "");
      if (/(?:^|_)vt_(?:days|progress)_v1$/.test(key) && holdsPractice(key)) return true;
    }
    return false;
  }

  /*
   * Before this rule a missing vt_lang meant Spanish, and nothing else wrote
   * it but the button. Someone who has been practising in Spanish on a
   * browser set to English never pressed it, and would wake up to an English
   * app: on the first load under this rule, their practice is taken for the
   * choice it was, and kept. Only that once (vt_lang_seen_v1): practice made
   * after it, an English first visit's own, or days a sync brings to a new
   * device, says nothing about the old default. A first visit has no practice,
   * so nothing is kept for it but the mark. Storage refused: nothing is kept.
   */
  var SEEN_KEY = "vt_lang_seen_v1";
  try {
    if (localStorage.getItem(SEEN_KEY) === null) {
      if (chosen() === null && practised()) localStorage.setItem(LANG_KEY, "es");
      localStorage.setItem(SEEN_KEY, "1");
    }
  } catch (e) {
    /* storage refused: the rule applies as for a first visit */
  }

  var langPref = Object.freeze({
    KEY: LANG_KEY,
    LANGS: Object.freeze(LANGS.slice()),
    fromBrowser: fromBrowser,
    chosen: chosen,
    linked: linked,
    linkedBefore: linkedBefore,
    resolve: function () {
      return linked() || chosen() || linkedBefore() || fromBrowser(browserTags());
    }
  });
  try {
    window.VTLangPref = langPref;
  } catch (e) {
    /* a binding someone else made read-only: this page's own hold still uses its own */
  }

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

  if (langPref.resolve() !== "en") return;
  html.lang = "en";
  html.classList.add("vt-i18n-pending");
  // The tab's title is on screen while the page is held: the English one the
  // markup keeps beside its own (<title data-en>), its own put back with the
  // Spanish page (data-es, which js/i18n-early.js reads too)
  var titleEl = document.querySelector("title[data-en]");
  if (titleEl) {
    titleEl.setAttribute("data-es", titleEl.textContent);
    titleEl.textContent = titleEl.getAttribute("data-en");
  }
  var letGo = function () {
    if (!html.classList.contains("vt-i18n-pending")) return;
    html.classList.remove("vt-i18n-pending");
    html.lang = "es";
    if (titleEl) titleEl.textContent = titleEl.getAttribute("data-es");
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
