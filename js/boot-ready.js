/**
 * Last on index.html: the busy state js/boot-head.js set ends when the app has
 * started. The app starts when the page has been read (its own listener is
 * registered before this one), so by the time this runs it is wired. Busy
 * ends then, or when the page has loaded, whichever comes first, so a script
 * that fails cannot leave it busy (boot-head.js ends it on load as well, for
 * when this one is the script that fails). (An inline script on PR #21's
 * branch.)
 * The hold on everything below the header (html.vt-boot-pending) ends at the
 * same moment, so the first view of the page is the one the app has drawn.
 * html.vt-boot-ready says so for the rest of the page's life: the first load's
 * hero keeps its held layout until then (css/styles.css), even when the hold
 * itself was let go before, because a script stalled.
 * Ending the hold, the view's entrance is over: the page shows the view the
 * app has drawn whole. Hidden, its entrance ran from the view's first style,
 * and the hold now ends soon enough that its tail played in sight (a later
 * load, at 89-99.5 %; review of PR #42, rt5). On a first load (0 s while
 * held, as the hero is on screen) a new duration updates a running animation:
 * back to 0.22 s within 0.22 s of the first paint, it played on from there,
 * the hero already read dropping to 19-89 % and rising (rt3).
 * Ending a first load's hold (html.vt-boot-hero), what the app has added to
 * the hero fades in under the words already on screen (0.2 s, opacity only,
 * none under reduced motion), instead of replacing the line under them in one
 * frame. Once, on the elements there then: a class held for the length of the
 * fade also faded in, from nothing, what the app rebuilt in it meanwhile (a
 * language switch), and cut it short (rt3).
 */
(function () {
  "use strict";
  var html = document.documentElement;
  // The hero but its kicker and title, which the first paint showed as they
  // stay. Not the catalog: from 861 px its line is the largest text, and a
  // fade held back its paint (LCP) by 0.28 s.
  var ADDED = "#start-panel .start-main > :not(#start-kicker, #start-title), #start-panel > :not(.start-main)";
  var settle = function () {
    Array.prototype.forEach.call(document.querySelectorAll(".view"), function (view) {
      if (!view.getAnimations) return;
      view.getAnimations().forEach(function (a) {
        a.finish();
      });
    });
  };
  var reveal = function () {
    if (!window.matchMedia || !window.matchMedia("(prefers-reduced-motion: no-preference)").matches) return;
    Array.prototype.forEach.call(document.querySelectorAll(ADDED), function (el) {
      if (el.animate) el.animate({ opacity: [0, 1] }, { duration: 200, easing: "cubic-bezier(0, 0, 0.2, 1)", id: "vt-boot-reveal" });
    });
  };
  var ready = function () {
    var held = html.classList.contains("vt-boot-pending");
    var hero = held && html.classList.contains("vt-boot-hero");
    html.classList.add("vt-boot-ready");
    html.classList.remove("vt-boot-pending");
    if (document.body) document.body.removeAttribute("aria-busy");
    if (!held) return;
    settle();
    if (hero) reveal();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
  window.addEventListener("load", ready);
})();
