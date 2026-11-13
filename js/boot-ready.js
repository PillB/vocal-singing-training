/**
 * Last on index.html: the busy state js/boot-head.js set ends when the app has
 * started. The app starts when the page has been read (its own listener is
 * registered before this one), so by the time this runs it is wired. Busy
 * ends then, or when the page has loaded, whichever comes first, so a script
 * that fails cannot leave it busy. (An inline script on PR #21's branch.)
 */
(function () {
  "use strict";
  var ready = function () {
    if (document.body) document.body.removeAttribute("aria-busy");
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", ready);
  else ready();
  window.addEventListener("load", ready);
})();
