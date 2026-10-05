/**
 * More states, for reviewing the whole site rather than one screen: the tour
 * step by step, the exercise coach-marks, the microphone primer, the account
 * dialog, the phone menu, the English site, the static pages and the lower
 * parts of the long pages.
 *
 * Use with --states-from qa/design-test/states-site.mjs (harness.mjs,
 * run-all.mjs, blind.mjs and firstclick.mjs all take it). Same fields as
 * states.mjs; the page clock is frozen at 2026-09-23 10:00 in Lima.
 */

const led = (keys, bank) => {
  const days = {};
  keys.forEach((k) => (days[k] = { sec: 240, n: 2, ex: ["s4-lip-trills"] }));
  return { v: 1, days, rest: { bank, earnedAt: 0, used: [] }, backfilled: true };
};
const RET3 = led(["2026-09-20", "2026-09-21", "2026-09-22"], 1);
const hist = (id, n, score, daysAgo) => {
  const at = new Date(Date.UTC(2026, 8, 23 - daysAgo, 15, 0, 0)).toISOString();
  return { completedCount: n, lastScore: score, lastAt: at, history: Array.from({ length: n }, (_, i) => ({ id: id + i, at, metrics: {}, score, notes: "", durationSec: 90 })) };
};
const RICH = {
  vt_progress_v1: JSON.stringify({
    "s4-lip-trills": hist("a", 3, 7, 0),
    "s27-lip-trill-solfege": hist("b", 3, 6, 1),
    "s2-humming": hist("c", 1, 8, 3),
    "v1-diction": hist("d", 1, 5, 9)
  })
};
// The days those sessions fell on, so the calendar, the list and the map agree.
const RICH_DAYS = led(["2026-09-14", "2026-09-20", "2026-09-22", "2026-09-23"], 1);

/** Scroll so the element's top sits just under the sticky header, without smooth scrolling. */
async function scrollToEl(p, sel) {
  for (let i = 0; i < 4; i++) {
    await p.waitForTimeout(350);
    const ok = await p.evaluate((s) => {
      const el = document.querySelector(s);
      if (!el) return true;
      const hdr = document.querySelector(".app-header");
      const off = hdr && getComputedStyle(hdr).position !== "static" ? hdr.getBoundingClientRect().height : 0;
      const top = el.getBoundingClientRect().top;
      if (Math.abs(top - off - 8) < 4) return true;
      window.scrollTo({ top: top + window.scrollY - off - 8, behavior: "instant" });
      return false;
    }, sel);
    if (ok) break;
  }
}

/** Open the home tour (the way the header's Tour button does) and step to step n (1-based). */
function tourAt(n) {
  return async (p) => {
    await p.evaluate(() => window.VTTour.start(true));
    await p.waitForTimeout(700);
    for (let i = 1; i < n; i++) {
      await p.click("[data-tour-next]").catch(() => {});
      await p.waitForTimeout(800);
    }
    await p.waitForTimeout(500);
  };
}

/**
 * Like tourAt, but never past the tour's last card: a shorter tour shows its
 * last card again, so two designs with different numbers of stops can be
 * compared stop by stop. n = Infinity is "the last card".
 */
function tourUpTo(n) {
  return async (p) => {
    await p.evaluate(() => window.VTTour.start(true));
    await p.waitForTimeout(700);
    for (let i = 1; i < n; i++) {
      const last = await p.evaluate(() => {
        const m = String(document.querySelector("[data-tour-progress]")?.textContent || "").match(/(\d+)\D+(\d+)/);
        return !m || m[1] === m[2];
      });
      if (last) break;
      await p.click("[data-tour-next]").catch(() => {});
      await p.waitForTimeout(800);
    }
    await p.waitForTimeout(500);
  };
}

/** Open an exercise and force its coach-marks, stepping to step n (1-based). */
function coachAt(id, n) {
  return async (p) => {
    await p.evaluate((x) => window.VTApp.openExercise(x), id);
    await p.waitForTimeout(1000);
    await p.evaluate(() => {
      const ex = window.VTApp.getState().exercise;
      const fam = window.VTTour.detectUiFamily(window.VTApp.getProfile(ex));
      window.VTTour.clearUiSeen(fam);
      window.VTTour.startUiPack(fam, { force: true });
    });
    await p.waitForTimeout(800);
    for (let i = 1; i < n; i++) {
      await p.click("[data-tour-next]").catch(() => {});
      await p.waitForTimeout(800);
    }
    await p.waitForTimeout(400);
  };
}

export const states = {
  // ---- The home tour, step by step (first visit, Spanish) ----------------
  "tour-1": { label: "tour, paso 1", tour: false, action: tourAt(1) },
  "tour-2": { label: "tour, paso 2", tour: false, action: tourAt(2) },
  "tour-3": { label: "tour, paso 3", tour: false, action: tourAt(3) },
  "tour-4": { label: "tour, paso 4", tour: false, action: tourAt(4) },
  "tour-5": { label: "tour, paso 5", tour: false, action: tourAt(5) },
  "tour-6": { label: "tour, paso 6", tour: false, action: tourAt(6) },
  "tour-7": { label: "tour, paso 7", tour: false, action: tourAt(7) },
  "tour-8": { label: "tour, paso 8", tour: false, action: tourAt(8) },
  "tour-9": { label: "tour, paso 9", tour: false, action: tourAt(9) },
  "tour-10": { label: "tour, paso 10", tour: false, action: tourAt(10) },
  // Stop by stop, clamped to the last card (for comparing tours of different lengths).
  "tourc-1": { label: "tour, primera tarjeta", tour: false, action: tourUpTo(1) },
  "tourc-2": { label: "tour, segunda tarjeta (o la última)", tour: false, action: tourUpTo(2) },
  "tourc-3": { label: "tour, tercera tarjeta (o la última)", tour: false, action: tourUpTo(3) },
  "tourc-4": { label: "tour, cuarta tarjeta (o la última)", tour: false, action: tourUpTo(4) },
  "tourc-5": { label: "tour, quinta tarjeta (o la última)", tour: false, action: tourUpTo(5) },
  "tour-last": { label: "tour, última tarjeta", tour: false, action: tourUpTo(Infinity) },
  "tour-returning-last": { label: "tour repetido por alguien que ya practicó, última tarjeta", days: RET3, action: tourUpTo(Infinity) },
  // A returning visitor replaying the tour from the header.
  "tour-returning-1": { label: "tour repetido por alguien que ya practicó, paso 1", days: RET3, action: tourAt(1) },
  "tour-returning-2": { label: "tour repetido por alguien que ya practicó, paso 2", days: RET3, action: tourAt(2) },
  "tour-returning-3": { label: "tour repetido por alguien que ya practicó, paso 3", days: RET3, action: tourAt(3) },
  "tour-returning-4": { label: "tour repetido por alguien que ya practicó, paso 4", days: RET3, action: tourAt(4) },
  "tour-returning-5": { label: "tour repetido por alguien que ya practicó, paso 5", days: RET3, action: tourAt(5) },

  // ---- Exercise coach-marks ------------------------------------------------
  "coach-pitch-1": { label: "ejercicio de afinación, ayuda en pantalla, paso 1", days: RET3, action: coachAt("s9-pitch-match", 1) },
  "coach-pitch-3": { label: "ejercicio de afinación, ayuda en pantalla, paso 3", days: RET3, action: coachAt("s9-pitch-match", 3) },
  "coach-chords-1": { label: "ejercicio con acordes, ayuda en pantalla, paso 1", days: RET3, action: coachAt("s2-solfege-chords", 1) },
  "coach-chords-2": { label: "ejercicio con acordes, ayuda en pantalla, paso 2", days: RET3, action: coachAt("s2-solfege-chords", 2) },
  "coach-chords-3": { label: "ejercicio con acordes, ayuda en pantalla, paso 3", days: RET3, action: coachAt("s2-solfege-chords", 3) },
  "coach-chords-4": { label: "ejercicio con acordes, ayuda en pantalla, paso 4", days: RET3, action: coachAt("s2-solfege-chords", 4) },
  "coach-chords-5": { label: "ejercicio con acordes, ayuda en pantalla, paso 5", days: RET3, action: coachAt("s2-solfege-chords", 5) },
  "coach-chords-6": { label: "ejercicio con acordes, ayuda en pantalla, paso 6", days: RET3, action: coachAt("s2-solfege-chords", 6) },
  "coach-speech-1": { label: "ejercicio de voz hablada, ayuda en pantalla, paso 1", days: RET3, tab: "vocal", action: coachAt("v1-diction", 1) },
  "coach-speech-2": { label: "ejercicio de voz hablada, ayuda en pantalla, paso 2", days: RET3, tab: "vocal", action: coachAt("v1-diction", 2) },

  // ---- Dialogs and menus ---------------------------------------------------
  // The microphone primer, as the first Start on a fresh browser shows it.
  "mic-primer": {
    label: "antes de pedir el micrófono",
    days: RET3,
    seed: { vt_mic_primed_v1: "" },
    action: async (p) => {
      await p.evaluate(() => {
        localStorage.removeItem("vt_mic_primed_v1");
        window.VTApp.openExercise("s9-pitch-match");
      });
      await p.waitForTimeout(900);
      await p.evaluate(() => window.VTTour.showMicPrimer(() => {}, { piano: true }));
      await p.waitForTimeout(400);
    }
  },
  account: {
    label: "cuenta (Entrar)",
    days: RET3,
    action: async (p) => {
      await p.click("#btn-account").catch(() => {});
      await p.waitForTimeout(700);
    }
  },
  "menu-new": {
    label: "inicio, primera visita, tras tocar Más",
    action: async (p) => {
      await p.click("#btn-more", { timeout: 1500 }).catch(() => {});
      await p.waitForTimeout(300);
    }
  },

  // ---- Home, lower down --------------------------------------------------
  "home-catalog-singing": {
    label: "catálogo, pista Cantar",
    days: RET3,
    action: async (p) => scrollToEl(p, "#catalog-panel")
  },
  "reminder-open": {
    label: "inicio, al buscar dónde poner un recordatorio diario",
    days: RET3,
    // Wherever the design keeps the reminder: a dialog off the week card
    // (site review round 2), else the panel at the bottom of Practicar.
    action: async (p) => {
      const b = await p.$("#btn-reminder");
      if (b && (await b.isVisible())) {
        await b.click();
        await p.waitForTimeout(400);
      } else {
        await scrollToEl(p, "#retain-panel");
      }
    }
  },
  "home-catalog-vocal": {
    label: "catálogo, pista Vocal",
    days: RET3,
    tab: "vocal",
    action: async (p) => scrollToEl(p, "#catalog-panel")
  },
  "home-studio": {
    label: "inicio, sección Tu estudio",
    days: RICH_DAYS,
    seed: RICH,
    action: async (p) => scrollToEl(p, "#value-pulse")
  },
  "home-retain": {
    label: "inicio, sección Volver a practicar",
    days: RET3,
    action: async (p) => scrollToEl(p, "#retain-panel")
  },
  "home-bottom": {
    label: "inicio, al final de la página",
    days: RET3,
    action: async (p) => {
      for (let i = 0; i < 6; i++) {
        await p.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
        await p.waitForTimeout(300);
      }
    }
  },

  // ---- Exercise screen, more of it ----------------------------------------
  "exercise-guide-open": {
    label: "ejercicio, pasos y consejos abiertos",
    days: RET3,
    action: async (p) => {
      await p.evaluate(() => window.VTApp.openExercise("s4-lip-trills"));
      await p.waitForTimeout(900);
      await p.click("#btn-toggle-guide").catch(() => {});
      await p.waitForTimeout(300);
      await scrollToEl(p, ".guide-card");
    }
  },
  // Opened the way most people open one: a tap on its card in the list.
  "exercise-from-list": {
    label: "ejercicio abierto desde la lista, antes de empezar",
    days: RET3,
    tab: "singing",
    action: async (p) => {
      await scrollToEl(p, '#exercise-list .card-ex[data-id="s4-lip-trills"]');
      await p.click('#exercise-list .card-ex[data-id="s4-lip-trills"]');
      await p.waitForTimeout(1000);
    }
  },
  "exercise-pitch": {
    label: "ejercicio de afinación abierto, antes de empezar",
    days: RET3,
    action: async (p) => {
      await p.evaluate(() => window.VTApp.openExercise("s9-pitch-match"));
      await p.waitForTimeout(1000);
    }
  },
  "exercise-below": {
    label: "ejercicio, debajo del escenario",
    days: RET3,
    action: async (p) => {
      await p.evaluate(() => window.VTApp.openExercise("s4-lip-trills"));
      await p.waitForTimeout(900);
      await scrollToEl(p, ".guide-card");
    }
  },

  // ---- Other pages -------------------------------------------------------
  "plan-new": {
    label: "Plan, antes de empezar",
    action: async (p) => {
      await p.click("#btn-plan").catch(() => {});
      await p.clock.runFor(500);
      await p.waitForTimeout(700);
    }
  },
  "plan-picked": {
    label: "Plan, con algo elegido para la semana",
    action: async (p) => {
      await p.click("#btn-plan").catch(() => {});
      await p.clock.runFor(500);
      await p.waitForTimeout(500);
      await p.click("#element-chips .chip:nth-child(3)").catch(() => {});
      await p.waitForTimeout(500);
    }
  },
  "plan-end": {
    label: "Plan, desplazado al final",
    days: RET3,
    action: async (p) => {
      await p.click("#btn-plan").catch(() => {});
      await p.clock.runFor(500);
      await p.waitForTimeout(700);
      await p.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      await p.waitForTimeout(300);
    }
  },
  "history-new": {
    label: "Historial, sin nada guardado",
    action: async (p) => {
      await p.click("#btn-history").catch(() => {});
      await p.clock.runFor(500);
      await p.waitForTimeout(700);
    }
  },
  "history-rich-btn": {
    label: "Historial con práctica guardada",
    days: RICH_DAYS,
    seed: RICH,
    action: async (p) => {
      await p.click("#btn-history").catch(() => {});
      await p.clock.runFor(1000);
      await p.waitForTimeout(900);
    }
  },
  "exercise-piano": {
    label: "ejercicio abierto, opciones del piano abiertas",
    days: RET3,
    action: async (p) => {
      await p.evaluate(() => window.VTApp.openExercise("s4-lip-trills"));
      await p.waitForTimeout(900);
      await p.click("#btn-toggle-piano").catch(() => {});
      await p.waitForTimeout(600);
    }
  },
  privacy: { label: "privacidad", url: "/privacy.html" },
  "guide-practica": {
    label: "guía, sección Practicar",
    url: "/guide.html#practica",
    action: async (p) => {
      await p.waitForTimeout(1500);
    }
  },

  // ---- English -------------------------------------------------------------
  "home-en-new": { label: "home, English, nothing practised yet", seed: { vt_lang: "en" } },
  "home-en-returning": { label: "home, English, sang 3 days", days: RET3, seed: { vt_lang: "en" } }
};
