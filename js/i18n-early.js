/**
 * Right after i18n.js on index.html: put the page in the visitor's language
 * now, not after the last script (it only needs i18n.js), and end the hold
 * js/boot-head.js put on an English visitor's page. Safe to repeat; the app's
 * own start does it too. (An inline script on PR #21's branch; main's CSP
 * allows none.)
 */
(function () {
  "use strict";
  try {
    window.VTI18n.init();
  } catch (e) {
    /* the page stays as it was written, which is Spanish */
    document.documentElement.lang = "es";
  } finally {
    document.documentElement.classList.remove("vt-i18n-pending");
  }
})();
