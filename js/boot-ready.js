/**
 * Last on index.html: the busy state js/boot-head.js set ends when the app has
 * started. The app starts when the page has been read (its own listener is
 * registered before this one), so by the time this runs it is wired. Busy
 * ends then, or when the page has loaded, whichever comes first, so a script
 * that fails cannot leave it busy. (An inline script on PR #21's branch.)
 * The hold on everything below the header (html.vt-boot-pending) ends at the
 * same moment, so the first view of the page is the one the app has drawn.
 * html.vt-boot-ready says so for the rest of the page's life: the first load's
 * hero keeps its held layout until then (css/styles.css), even when the hold
 * itself was let go before, because a script stalled.
 * Ending a first load's hold (html.vt-boot-hero), it marks the moment for 0.4 s
 * (html.vt-boot-reveal): what the app has added to the hero fades in under the
 * words already on screen, instead of replacing the line under them in one
 * frame.
 */
(function () {
  "use strict";
  var html = document.documentElement;
  var ready = function () {
    var hero = html.classList.contains("vt-boot-hero") && html.classList.contains("vt-boot-pending");
    html.classList.add("vt-boot-ready");
    html.classList.remove("vt-boot-pending");
    if (document.body) document.body.removeAttribute("aria-busy");
    if (!hero) return;
    html.classList.add("vt-boot-reveal");
    setTimeout(function () {
      html.classList.remove("vt-boot-reveal");
    }, 400);
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
  window.addEventListener("load", ready);
})();
