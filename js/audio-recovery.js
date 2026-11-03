/**
 * Mobile WebKit capture/output interruption UX. The practice and piano engines
 * stay platform-neutral; this adapter manages the on-screen recovery affordance.
 * No background permission prompts, automatic rescores, or silent retries.
 */
(function (global) {
  "use strict";

  // What a finger or a key can use on the stage: the banner leaves all of it free
  const CONTROLS = "button, input, select, textarea, label, a[href], [role='button']";
  const BAND_GAP = 4;
  // Controls a banner must leave free above all: a learner who cannot reach
  // Stop cannot end the take.
  const KEEP_CLEAR = ["btn-practice-stop", "btn-practice-start"];

  /** The sticky header and exercise bar's height, as app.js measures it. */
  function stickyChromeHeight() {
    try {
      const root = global.getComputedStyle(document.documentElement);
      return (parseFloat(root.getPropertyValue("--header-h")) || 0) + (parseFloat(root.getPropertyValue("--ex-chrome-h")) || 0);
    } catch {
      return 0;
    }
  }

  /**
   * The stage's horizontal bands that hold no control, top to bottom, inside
   * the window and below the sticky header and exercise bar (a stage
   * scrolled under them is hidden there). On a phone the stage is a stack of
   * rails (selects, octave and piano buttons, Stop, the mic slider); the
   * bands between them hold words (the status row, the step's cue), which a
   * banner may cover for a while.
   */
  function freeBands(stage, banner) {
    const s = stage.getBoundingClientRect();
    const top = Math.max(s.top, 0, stickyChromeHeight());
    const bottom = Math.min(s.bottom, global.innerHeight || s.bottom);
    const taken = Array.from(stage.querySelectorAll(CONTROLS), (c) => {
      if (banner.contains(c)) return null;
      const r = c.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, w: r.width, h: r.height, weight: KEEP_CLEAR.includes(c.id) ? 100 : 1 };
    })
      .filter((r) => r && r.w > 0 && r.h > 0 && r.bottom > top && r.top < bottom)
      .sort((a, b) => a.top - b.top);
    const bands = [];
    let y = top;
    for (const r of taken) {
      if (r.top > y) bands.push({ top: y, h: r.top - y });
      y = Math.max(y, r.bottom);
    }
    if (bottom > y) bands.push({ top: y, h: bottom - y });
    return { stageTop: s.top, top, bottom, bands, taken };
  }

  /**
   * Where a banner `h` tall covers the fewest controls when no band holds
   * it (a 320 px phone with the piano panel open): never Start or Stop if
   * any place spares them, then as few others as it can.
   */
  function leastCovered({ top, bottom, bands, taken }, h) {
    const tops = [top, bottom - h, ...bands.flatMap((b) => [b.top, b.top + b.h - h])].map((t) =>
      Math.max(top, Math.min(bottom - h, t))
    );
    const cost = (t) => taken.reduce((n, c) => n + (c.top < t + h && c.bottom > t ? c.weight : 0), 0);
    return tops.reduce((best, t) => (cost(t) < cost(best) ? t : best), tops[0]);
  }

  /**
   * Put the "sound paused" banner where it covers no control. Centred on the
   * stage it hid the octave buttons, the range box and the piano toggle on a
   * 320 px phone, and Stop on a phone turned sideways (QA round 5, PNO-02).
   * It takes the first free band it fits, else its one-line form ("Sound
   * paused" and the button; the full sentence stays for screen readers) in
   * the first band that holds that, else the place that covers least.
   */
  function placeSound(el) {
    const stage = el.offsetParent;
    if (!stage || typeof el.getBoundingClientRect !== "function") return;
    el.classList.remove("is-compact");
    el.style.removeProperty("top");
    el.style.removeProperty("transform");
    const room = freeBands(stage, el);
    if (room.bottom <= room.top) return;
    const fits = () => room.bands.find((b) => b.h >= el.offsetHeight + 2 * BAND_GAP);
    let band = fits();
    if (!band) {
      el.classList.add("is-compact");
      band = fits();
    }
    const h = el.offsetHeight;
    const y = band ? band.top + (band.h - h) / 2 : leastCovered(room, h);
    el.style.top = `${Math.round(y - room.stageTop)}px`;
    el.style.transform = "translateX(-50%)";
  }

  /**
   * A banner that is up follows the page: the phone turning, the window or
   * the language (its sentence grows or shrinks) changing under it, a rail
   * of the stage growing or shrinking (a select's new label, the piano
   * panel), and the page scrolling the stage under the sticky chrome.
   */
  function followSound(el) {
    if (!el) return;
    const again = () => {
      if (!el.hidden) placeSound(el);
    };
    let queued = false;
    const nextFrame = () => {
      if (el.hidden || queued) return;
      queued = true;
      (global.requestAnimationFrame || ((fn) => setTimeout(fn, 16)))(() => {
        queued = false;
        again();
      });
    };
    global.addEventListener?.("resize", again);
    global.addEventListener?.("orientationchange", () => setTimeout(again, 150));
    global.addEventListener?.("scroll", nextFrame, { passive: true });
    if (typeof global.MutationObserver === "function") {
      new global.MutationObserver(again).observe(el, { childList: true, characterData: true, subtree: true });
    }
    const stage = el.parentElement;
    if (stage && typeof global.ResizeObserver === "function") {
      // The banner is out of flow: placing it resizes none of these.
      const rails = new global.ResizeObserver(nextFrame);
      rails.observe(stage);
      for (const rail of stage.children) if (rail !== el) rails.observe(rail);
    }
  }

  function install() {
    const app = global.VTApp;
    const piano = global.VTPiano;
    const engine = app?.getState?.()?.practice;
    if (!app || !piano || !engine) return;
    const $ = (id) => document.getElementById(id);
    const state = () => app.getState();
    const hideSound = () => { if ($("sound-blocked")) $("sound-blocked").hidden = true; };
    const showSound = () => {
      if (state().view !== "exercise" || !state().practiceLive) return;
      if (!app.wantsSound() || !$('mic-blocked')?.hidden) return;
      const el = $("sound-blocked");
      if (!el) return;
      el.hidden = false;
      placeSound(el);
    };
    followSound($("sound-blocked"));

    const previousStatus = engine.onStatus;
    engine.onStatus = (status) => {
      previousStatus?.(status);
      if (!["mic-muted", "mic-ended", "input-interrupted"].includes(status)) return;
      if (state().view !== "exercise" || !engine.running) return;
      if (status === "input-interrupted" && engine._audioClockStalled) {
        // Only rebuild when the render clock actually froze: ordinary track
        // mutes and AudioContext.statechange should reuse the good graph.
        piano._needsFreshContext = true;
      }
      // Holding a stale pitch is not practice. End the take and require a new
      // user gesture; the browser may need to ask for the mic again.
      hideSound();
      app.stopPractice(true);
      app.showMicBlocked(false, "interrupted");
    };

    const previousAudioState = piano.onStateChange;
    piano.onStateChange = (audioState) => {
      previousAudioState?.(audioState);
      if (audioState === "running") return hideSound();
      if (document.hidden || !state().practiceLive) return;
      setTimeout(() => {
        if (document.visibilityState === "visible" &&
            piano.ctx?.state !== "running") showSound();
      }, 1200);
    };

    // WebKit requires the *first* AudioContext resume/source.start to occur
    // while a real user activation is still on the stack. The app's normal
    // Start callback awaits getUserMedia, which can show a long permission
    // prompt and lose that activation. Capture Start, retry and the first-time
    // permission-primer confirmation before their async app handlers execute.
    document.addEventListener("click", (event) => {
      const target = event.target?.closest?.(
        "#btn-practice-start, #btn-mic-retry, #mic-primer [data-primer-ok]"
      );
      if (!target || state().view !== "exercise") return;
      // Even a speaking-only exercise uses Web Audio for its mic analyser.
      // Unlock that shared context on the original tap too, before the OS
      // permission sheet can consume user activation.
      if (app.getProfile(state().exercise)?.mode === "weekPlan") return;
      if (piano._needsFreshContext) {
        if (piano.rebuildStalledContext()) piano._needsFreshContext = false;
      }
      if (piano.ctx?.state === "running") return;
      piano.unlock().catch((err) => console.warn("[VT] Audio gesture unlock failed", err));
    }, true);

    $("btn-sound-resume")?.addEventListener("click", async () => {
      const ex = state().exercise;
      if (!ex || state().view !== "exercise") return;
      try {
        const unlocked = await piano.unlock();
        if (!unlocked) return; // Keep the recovery button visible.
        if (state().practiceLive && state().exercise === ex) {
          await app.startExerciseSound(ex, app.getProfile(ex));
        }
        hideSound();
      } catch (err) {
        console.warn("[VT] Sound still interrupted; tap to retry", err);
      }
    });

    $("btn-practice-start")?.addEventListener("click", () => {
      hideSound();
      setTimeout(() => piano.onStateChange?.(piano.ctx?.state), 2000);
    });
    $("btn-practice-stop")?.addEventListener("click", hideSound);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") {
        piano.onStateChange?.(piano.ctx?.state);
      }
    });
    global.addEventListener?.("pageshow", () => piano.onStateChange?.(piano.ctx?.state));

    // Safari exposes a separate page-wide audio-session interruption state.
    // The output AudioContext can look healthy while iOS owns the device for a
    // phone call; respond to both signals without changing the user's route.
    const session = global.navigator?.audioSession;
    session?.addEventListener?.("statechange", () => {
      if (session.state === "interrupted") {
        // A short interruption that is over by then shows nothing, as on the
        // piano's own path.
        setTimeout(() => {
          if (session.state === "interrupted") showSound();
        }, 1200);
      } else if (session.state === "active" && piano.ctx?.state === "running") {
        hideSound();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", install, { once: true });
  } else {
    install();
  }
})(window);
