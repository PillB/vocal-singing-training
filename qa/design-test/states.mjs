/**
 * The states and viewports a design test can render.
 *
 * A state is one moment in the app: what is in the browser's storage when the
 * page loads, and what a person has done since. harness.mjs renders every arm
 * of a question in the same states, so the arms are compared at the same
 * moment. blind.mjs uses each state's `label` (Spanish, like the site) as the
 * heading of the blinded images.
 *
 * A state is an object with any of:
 *   label   heading shown to judges, e.g. "ejercicio abierto, antes de empezar"
 *   url     path to open instead of "/" (e.g. "/guide.html")
 *   bare    true: seed nothing at all (a browser that has never been here)
 *   tour    false: leave the product tour and coach-marks unseen
 *   tab     "singing" (default) or "vocal": the track the site opens on
 *   days    value for vt_days_v1 (days practised; see led() below)
 *   loop    value for vt_loop_v1 (daily-loop state)
 *   seed    { localStorageKey: string } for anything else
 *   action  async (page) => {...}: what the person does after the page loads
 *
 * The page clock is frozen at 2026-09-23 10:00 in Lima (harness.mjs), so the
 * dates below are "the last three days", "last week" and so on.
 *
 * Both rounds of design questions (rounds/) used these states. Where a round
 * relied on one that has since been renamed, the comment says so.
 */

/** Days practised, as the daily loop stores them, plus the rest-day bank. */
const led = (keys, bank) => {
  const days = {};
  keys.forEach((k) => (days[k] = { sec: 240, n: 2, ex: ["s4-lip-trills"] }));
  return { v: 1, days, rest: { bank, earnedAt: 0, used: [] }, backfilled: true };
};
/** Practised the three days before today. */
const RET3 = led(["2026-09-20", "2026-09-21", "2026-09-22"], 1);
/** Practised the six days before today. */
const LED6 = led(["2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22"], 1);
/** A daily loop that has a card waiting to be shown at the end of today's basics. */
const LOOP_WITH_CARD = { v: 1, seed: "a1", tier: "min", goal: "3-5", ms: [1, 3], cards: {}, surprises: [], since: 6, comebacks: [], completions: 6 };
/** One exercise's progress record: n takes with the same score, daysAgo days back. */
const hist = (id, n, score, daysAgo) => {
  const at = new Date(Date.UTC(2026, 8, 23 - daysAgo, 15, 0, 0)).toISOString();
  return { completedCount: n, lastScore: score, lastAt: at, history: Array.from({ length: n }, (_, i) => ({ id: id + i, at, metrics: {}, score, notes: "", durationSec: 90 })) };
};

/** Sing both steps of today's basics to the end, which opens the finishing card. */
async function finishBasics(p) {
  await p.click("#btn-next-step");
  await p.waitForTimeout(500);
  for (let i = 0; i < 2; i++) {
    await p.click("#btn-practice-start").catch(() => {});
    await p.clock.runFor(40000);
    await p.waitForTimeout(150);
    await p.evaluate(() => window.VTApp.advanceStructured("next"));
    await p.waitForTimeout(350);
  }
  await p.waitForTimeout(500);
}

/**
 * Step 1 of today's basics (Trinos, 1:30) sung to the end of its timer, then
 * Detener pressed: the app opens the rating card and scrolls to it itself.
 */
async function singStepThenStop(p) {
  await p.click("#btn-next-step");
  await p.waitForTimeout(700);
  await p.click("#btn-practice-start").catch(() => {});
  await p.clock.runFor(10000);
  await p.waitForTimeout(200);
  await p.clock.runFor(82000);
  await p.waitForTimeout(600);
  // A slow start (mic, audio) can leave the step's timer a few seconds short
  // under load: sing on until it has really run out.
  for (let i = 0; i < 3; i++) {
    const left = await p.evaluate(() => window.VTApp?.getState?.().timer?.remaining || 0).catch(() => 0);
    if (!(left > 0.05)) break;
    await p.clock.runFor(Math.ceil(left * 1000) + 500);
    await p.waitForTimeout(400);
  }
  await p.click("#btn-practice-stop").catch(() => {});
  // Long enough for the stop toast (2.8 s) to clear and any scroll to settle.
  await p.waitForTimeout(3100);
}

/** A guided step, singing, held until the session's start and mode toasts have cleared. */
async function guidedLiveClear(p) {
  await p.click("#btn-next-step");
  await p.waitForTimeout(700);
  await p.click("#btn-practice-start").catch(() => {});
  await p.clock.runFor(8000);
  await p.waitForTimeout(3000);
}

export const states = {
  // ---- Home ----------------------------------------------------------------

  // A browser that has never been here: no language, track or tour seeded.
  // Used by: first-visit, tour-invite (round 1).
  fresh: { label: "primera visita", bare: true, tour: false },
  // Spanish seeded, but the tour not yet seen, so it opens.
  "home-first": { label: "inicio, primera visita con el tour", tour: false },
  // Tour seen, nothing practised yet.
  "home-new": { label: "inicio, alguien que aún no ha practicado" },
  // Practised the three days before today. Used by: loop-copy, phone-header,
  // record-strip (round 1); naming, selected-style (round 2).
  "home-returning": { label: "inicio, alguien que ya cantó 3 días", days: RET3 },
  // Back after most of a week away.
  "home-comeback": { label: "inicio, alguien que vuelve tras unos días sin practicar", days: led(["2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17"], 0) },
  // Already practised today.
  "home-sang": { label: "inicio, alguien que ya practicó hoy", days: led(["2026-09-21", "2026-09-22", "2026-09-23"], 1) },
  // Returning, on the speaking track.
  "home-vocal": { label: "inicio, pista Vocal", days: RET3, tab: "vocal" },
  // Returning, the other ways to practise in view: an arm that keeps them
  // behind a disclosure has it opened; an arm without one shows the same row
  // as it stands. Scrolled so that row sits in the middle of the screen.
  // Used by: naming (round 2).
  "home-returning-more": {
    label: "inicio, con las otras opciones a la vista",
    days: RET3,
    action: async (p) => {
      await p.evaluate(() => {
        const d = document.querySelector("details.more-ways");
        if (d) d.open = true;
        const t = d || document.querySelector(".start-alt");
        if (!t) return;
        const r = t.getBoundingClientRect();
        window.scrollTo(0, Math.max(0, window.scrollY + r.top - (innerHeight - r.height) / 2));
      });
      await p.waitForTimeout(300);
    }
  },
  // The home screen with the phone header's menu open; an arm without a menu
  // shows home. The rounds' challengers used #hdr-more / .hd1-more; #btn-more
  // is the menu the site shipped afterwards. Used by: phone-header (round 1).
  "home-menu": {
    label: "inicio, tras tocar el menú (si lo hay)",
    days: RET3,
    action: async (p) => {
      await p.click("#btn-more, #hdr-more, .hd1-more", { timeout: 1500 }).catch(() => {});
      await p.waitForTimeout(300);
    }
  },
  // Today's basics just finished: the finishing card is open.
  // Used by: done-landscape (round 2).
  done: { label: "inicio, al terminar los básicos de hoy", days: LED6, loop: LOOP_WITH_CARD, action: finishBasics },
  // Today's basics finished, and the finishing card closed.
  // Used by: done-card (round 1).
  "done-closed": {
    label: "inicio, básicos de hoy terminados",
    days: LED6,
    loop: LOOP_WITH_CARD,
    action: async (p) => {
      await finishBasics(p);
      await p.click("#loop-done-close").catch(() => {});
      // Let the "hold recorded" toast from the last step fade first.
      await p.clock.runFor(5000);
      await p.waitForTimeout(300);
      await p.evaluate(() => window.scrollTo(0, 0));
    }
  },

  // ---- Guided session (today's basics) --------------------------------------

  // Step 1 open, straight after tapping the start button.
  "guided-step": {
    label: "sesión guiada, paso 1 abierto",
    days: RET3,
    action: async (p) => {
      await p.click("#btn-next-step");
      await p.waitForTimeout(900);
    }
  },
  // Step 1 open, held until the session's toasts have cleared.
  // Used by: session-chrome (round 2).
  "guided-idle": {
    label: "sesión guiada, antes de empezar el paso 1",
    days: RET3,
    action: async (p) => {
      await p.click("#btn-next-step");
      await p.waitForTimeout(3200);
    }
  },
  // Singing a guided step, live. Used by: landscape (round 1).
  "guided-live": {
    label: "sesión guiada, cantando",
    days: RET3,
    action: async (p) => {
      await p.click("#btn-next-step");
      await p.waitForTimeout(700);
      await p.click("#btn-practice-start").catch(() => {});
      await p.clock.runFor(8000);
      await p.waitForTimeout(400);
    }
  },
  // The same moment, held until the toasts have cleared so the session's own
  // chrome is visible. Used by: session-chrome (round 2).
  "guided-live-clear": { label: "sesión guiada, cantando", days: RET3, action: guidedLiveClear },
  // The same again, scrolled to the top, so the app's own stage-fit scroll
  // cannot leave two arms at different scroll positions. Used to re-measure
  // the session-chrome guardrail (rounds/decisions-r2.md); not judged.
  "guided-live-top": {
    label: "sesión guiada, cantando",
    days: RET3,
    action: async (p) => {
      await guidedLiveClear(p);
      await p.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await p.waitForTimeout(400);
    }
  },
  // The first step's time has just run out. Used by: step-end (round 1).
  "step-end": {
    label: "sesión guiada, el tiempo del paso 1 acaba de terminar",
    days: RET3,
    action: async (p) => {
      await p.click("#btn-next-step");
      await p.waitForTimeout(700);
      await p.click("#btn-practice-start").catch(() => {});
      await p.clock.runFor(10000);
      await p.waitForTimeout(200);
      await p.clock.runFor(85000);
      await p.waitForTimeout(900);
    }
  },
  // The moment a learner meets the rating: a guided step ran its 1:30 and
  // they pressed Detener. Used by: rating (round 2).
  rating: { label: "sesión guiada, justo después de tocar Detener", days: RET3, action: singStepThenStop },
  // One tap later: the take saved with a middle rating (a one-tap arm's
  // "Normal", else the form's own Save with its defaults), and the learner
  // reading the score card it produced. Used by: rating (round 2).
  "rating-saved": {
    label: "sesión guiada, después de puntuar",
    days: RET3,
    action: async (p) => {
      await singStepThenStop(p);
      const quick = await p.$('[data-vt-feel="3"]');
      if (quick && (await quick.isVisible())) await quick.click();
      else await p.click("#btn-complete").catch(() => {});
      await p.waitForTimeout(600);
      await p.evaluate(() => {
        const box = document.getElementById("score-result");
        if (!box || box.hidden) return;
        let top = 0;
        document.querySelectorAll(".app-header, .exercise-header-compact").forEach((el) => {
          const cs = getComputedStyle(el);
          if (cs.position === "sticky" || cs.position === "fixed") top = Math.max(top, el.getBoundingClientRect().bottom);
        });
        window.scrollBy({ top: box.getBoundingClientRect().top - top - 8, behavior: "instant" });
      });
      await p.waitForTimeout(2600);
    }
  },

  // ---- A single exercise -----------------------------------------------------

  // Lip trills open, before pressing Start. Used by: big-start (round 1),
  // start-floor (round 2).
  exercise: {
    label: "ejercicio abierto, antes de empezar",
    days: RET3,
    action: async (p) => {
      await p.evaluate(() => window.VTApp.openExercise("s4-lip-trills"));
      await p.waitForTimeout(900);
    }
  },
  // A speaking exercise open, before pressing Start.
  "exercise-vocal": {
    label: "ejercicio de voz hablada abierto, antes de empezar",
    days: RET3,
    tab: "vocal",
    action: async (p) => {
      await p.evaluate(() => window.VTApp.openExercise("v1-diction"));
      await p.waitForTimeout(900);
    }
  },
  // Lip trills, singing. Used by: landscape (round 1), coach-strip (round 2).
  practicing: {
    label: "ejercicio, cantando",
    days: RET3,
    action: async (p) => {
      await p.evaluate(() => window.VTApp.openExercise("s4-lip-trills"));
      await p.waitForTimeout(900);
      await p.click("#btn-practice-start").catch(() => {});
      await p.clock.runFor(6000);
      await p.waitForTimeout(400);
    }
  },
  // Pitch matching, singing, so the note to sing is on the lane.
  // Used by: target-lane (round 1), coach-strip (round 2).
  "practicing-s9": {
    label: "ejercicio de afinación, cantando",
    days: RET3,
    action: async (p) => {
      await p.evaluate(() => window.VTApp.openExercise("s9-pitch-match"));
      await p.waitForTimeout(900);
      await p.click("#btn-practice-start").catch(() => {});
      await p.clock.runFor(6000);
      await p.waitForTimeout(500);
    }
  },
  // A single exercise (not a guided routine) whose timer has just reached 0:00.
  // Used by: exercise-end (round 2).
  "exercise-timeup": {
    label: "ejercicio suelto, el tiempo acaba de terminar",
    days: RET3,
    action: async (p) => {
      await p.evaluate(() => window.VTApp.openExercise("s4-lip-trills"));
      await p.waitForTimeout(900);
      await p.click("#btn-practice-start").catch(() => {});
      await p.clock.runFor(5000);
      await p.waitForTimeout(200);
      const total = await p.evaluate(() => window.VTApp.getState().timer?.total || 300);
      await p.clock.runFor(total * 1000);
      await p.waitForTimeout(1200);
    }
  },

  // ---- Other pages ---------------------------------------------------------

  // The exercise catalogue, scrolled to its top without smooth scrolling.
  // Used by: catalog, canto-groups (round 1).
  catalog: {
    label: "catálogo de ejercicios",
    days: RET3,
    action: async (p) => {
      // The app may still scroll itself to the top shortly after load, so
      // scroll, wait, and scroll again until it sticks.
      for (let i = 0; i < 4; i++) {
        await p.waitForTimeout(500);
        const ok = await p.evaluate(() => {
          const el = document.querySelector("#catalog-panel");
          const top = el.getBoundingClientRect().top;
          if (Math.abs(top - 8) < 4) return true;
          window.scrollTo({ top: top + window.scrollY - 8, behavior: "instant" });
          return false;
        });
        if (ok) break;
      }
    }
  },
  // The Plan page, opened the way a person opens it. Used by: plan (round 1).
  plan: {
    label: "Plan",
    days: RET3,
    action: async (p) => {
      await p.click("#btn-plan");
      await p.clock.runFor(500);
      await p.waitForTimeout(700);
    }
  },
  // The History page with days practised but no exercise records.
  history: {
    label: "Historial",
    days: RET3,
    action: async (p) => {
      await p.evaluate(() => window.VTApp.setView("history"));
      await p.waitForTimeout(600);
    }
  },
  // History with real activity in it. Used by: history (round 1).
  "history-rich": {
    label: "Historial",
    days: RET3,
    seed: {
      vt_progress_v1: JSON.stringify({
        "s4-lip-trills": hist("a", 3, 7, 0),
        "s27-lip-trill-solfege": hist("b", 3, 6, 1),
        "s2-humming": hist("c", 1, 8, 3),
        "v1-diction": hist("d", 1, 5, 9)
      })
    },
    action: async (p) => {
      await p.click("#btn-history");
      await p.clock.runFor(1000);
      await p.waitForTimeout(900);
    }
  },
  // The written guide.
  guide: { label: "guía", url: "/guide.html" },

  // ---- Pro dialog ----------------------------------------------------------

  // The Pro dialog, just opened. Used by: pricing (round 1),
  // pricing-prelaunch (round 2).
  pricing: {
    label: "precios",
    days: RET3,
    action: async (p) => {
      await p.evaluate(() => window.VTApp.openPricing());
      await p.waitForTimeout(600);
    }
  },
  // The Pro dialog with every part of it that scrolls scrolled to its end,
  // where the last actions are. Used by: pricing (round 1).
  "pricing-end": {
    label: "precios, desplazado al final",
    days: RET3,
    action: async (p) => {
      await p.evaluate(() => window.VTApp.openPricing());
      await p.waitForTimeout(600);
      await p.evaluate(() => {
        const m = document.getElementById("pricing-modal");
        [m, ...m.querySelectorAll("*")].forEach((el) => {
          if (el.scrollHeight > el.clientHeight + 4 && /(auto|scroll)/.test(getComputedStyle(el).overflowY)) el.scrollTop = el.scrollHeight;
        });
      });
      await p.waitForTimeout(300);
    }
  },
  // The Pro dialog with its card and its overlay scrolled to the end, where
  // the payment status note and the trial button sat at the time. Round 2
  // used this one under the name "pricing-end" (pricing-prelaunch); it was
  // renamed here so both rounds' versions can be kept.
  "pricing-end-card": {
    label: "precios, desplazado al final",
    days: RET3,
    action: async (p) => {
      await p.evaluate(() => window.VTApp.openPricing());
      await p.waitForTimeout(600);
      await p.evaluate(() => {
        const c = document.querySelector("#pricing-modal .pricing-card");
        if (c) c.scrollTop = c.scrollHeight;
        const o = document.querySelector("#pricing-modal");
        if (o) o.scrollTop = o.scrollHeight;
      });
      await p.waitForTimeout(250);
    }
  }
};

/**
 * Viewports. `label` heads the blinded images. Mobile viewports get a phone
 * user agent, touch and a device pixel ratio of 2. blind.mjs lays out a
 * portrait phone's arms side by side, a landscape phone's stacked, and a
 * desktop's one image per arm.
 */
export const viewports = {
  desktop: { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false, label: "Escritorio 1280×800" },
  laptop: { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false, label: "Portátil 1280×720" },
  phone: { width: 390, height: 844, deviceScaleFactor: 2, mobile: true, label: "Teléfono 390×844" },
  small: { width: 360, height: 740, deviceScaleFactor: 2, mobile: true, label: "Teléfono pequeño 360×740" },
  land: { width: 844, height: 390, deviceScaleFactor: 2, mobile: true, label: "Teléfono horizontal 844×390" }
};
