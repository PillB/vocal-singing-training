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

  var html = document.documentElement;
  new MutationObserver(function (_, watch) {
    if (!document.body) return;
    document.body.setAttribute("aria-busy", "true");
    watch.disconnect();
  }).observe(html, { childList: true });

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
