/**
 * The first script on admin.html: a page loaded in another page's frame hides
 * itself and asks to be the top window (red team CXSS-2, clickjacking: an
 * invisible frame over a decoy could take an admin's click on "grant Pro" or
 * "revoke"). GitHub Pages sends no headers, so neither frame-ancestors nor
 * X-Frame-Options can refuse the frame, and a <meta> policy cannot carry
 * frame-ancestors (CSP3 ignores it there).
 *
 * Hiding is what holds: browsers block a cross-origin frame from moving the
 * top window without a tap (Chrome's framebusting intervention), and an
 * attacker's onbeforeunload or a sandbox can stop the move too, but not undo
 * the hiding. A frame that runs no script runs no admin panel either.
 *
 * index.html runs the same lines first thing in js/boot-head.js, which does
 * the app's own first-paint work and must not hold this page's.
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
  if (!framed()) return;
  // CSSOM, not a style attribute: the CSP's style rules do not apply to it, and nothing on the page sets display on <html>
  document.documentElement.style.setProperty("display", "none", "important");
  try {
    window.top.location.replace(window.location.href);
  } catch (e) {
    /* refused (another origin, no tap): the page stays hidden */
  }
})();
