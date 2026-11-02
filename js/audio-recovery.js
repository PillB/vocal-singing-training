/**
 * Mobile WebKit capture/output interruption UX. The practice and piano engines
 * stay platform-neutral; this adapter manages the on-screen recovery affordance.
 * No background permission prompts, automatic rescores, or silent retries.
 */
(function (global) {
  "use strict";

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
      if ($("sound-blocked")) $("sound-blocked").hidden = false;
    };

    const previousStatus = engine.onStatus;
    engine.onStatus = (status) => {
      previousStatus?.(status);
      if (status !== "mic-muted" && status !== "mic-ended") return;
      if (state().view !== "exercise" || !engine.running) return;
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
      if (!target || state().view !== "exercise" || !app.wantsSound()) return;
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
        setTimeout(showSound, 1200);
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
