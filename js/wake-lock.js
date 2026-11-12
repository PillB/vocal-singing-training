/**
 * The screen stays on while a practice is live.
 *
 * A phone dims and locks after 30 seconds to a few minutes without a touch,
 * and a locked phone stops the microphone and the clock. Most exercises are
 * touched often enough for that never to happen; the guided drills are not
 * (the voice recovery drill opens with five quiet minutes), and a learner
 * reading a sentence aloud is not touching anything either.
 *
 * So while `body.practice-live` is set (js/app.js sets it on Start and clears
 * it on Stop) this file holds a screen wake lock (W3C Screen Wake Lock API),
 * and lets it go the moment the practice ends. The browser itself drops the
 * lock when the page is hidden; coming back to a practice that is still live
 * asks again.
 *
 * What this does not do:
 * - It does not keep the phone awake outside a live practice: reading the
 *   catalogue or a result drains nothing extra.
 * - It does not insist. A browser may refuse (battery saver, a policy): the
 *   screen then follows the phone's own timer, as before this file existed.
 *   One refusal is not retried until the next Start or the next return to
 *   the page, so a refusing browser is not asked sixty times a second.
 * - Browsers without the API (Safari before 16.4, Firefox before 126) are
 *   left exactly as they were. So is a site added to an iPhone's home screen
 *   before iOS 18.4, where the API is present but does not hold the screen
 *   (WebKit bug 254545); in a Safari tab it works from 16.4.
 * - No hidden looping video (the older "NoSleep" trick). On an iPhone a
 *   playing video takes part in the audio session the microphone needs.
 *
 * Built from outside js/app.js: it watches the class, it edits no function.
 */
(function (global) {
  "use strict";

  const doc = global.document;
  /** The lock held now, whether a request is on its way, and whether this stretch of practice was refused one. */
  const state = { lock: null, asking: false, refused: false };

  function supported() {
    const nav = global.navigator;
    return !!(nav && nav.wakeLock && typeof nav.wakeLock.request === "function");
  }

  /** A lock is wanted only while a practice is live on a page somebody can see. */
  function wanted() {
    return !!doc.body && doc.body.classList.contains("practice-live") && doc.visibilityState === "visible";
  }

  function drop(lock) {
    Promise.resolve()
      .then(() => lock.release())
      .catch(() => {
        /* already released by the browser */
      });
  }

  async function acquire() {
    if (state.lock || state.asking || !supported()) return;
    state.asking = true;
    const lock = await global.navigator.wakeLock.request("screen").catch(() => null);
    state.asking = false;
    if (!lock) {
      // Refused: the screen follows the phone's own timer.
      state.refused = true;
      return;
    }
    // Stop may have been pressed while the browser was answering.
    if (!wanted()) {
      drop(lock);
      return;
    }
    state.lock = lock;
    lock.addEventListener("release", () => {
      if (state.lock === lock) state.lock = null;
    });
  }

  function release() {
    const lock = state.lock;
    state.lock = null;
    if (lock) drop(lock);
  }

  function sync() {
    if (wanted()) {
      if (!state.refused) acquire();
      return;
    }
    // The practice ended or the page was hidden: the next stretch may ask afresh.
    state.refused = false;
    release();
  }

  function init() {
    if (!doc.body) return;
    new MutationObserver(sync).observe(doc.body, { attributes: true, attributeFilter: ["class"] });
    doc.addEventListener("visibilitychange", sync);
    sync();
  }

  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", init);
  else init();

  global.VTWakeLock = { supported, held: () => !!state.lock, sync };
})(window);
