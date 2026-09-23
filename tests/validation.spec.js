const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function dismissTour(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
  });
}

/**
 * A day sung yesterday. A first visit shows only the Mínimo and its button;
 * the other ways in (Continuar, sesión guiada, Ruta) come with a day sung.
 */
async function seedPracticeDay(page) {
  await page.addInitScript(() => {
    try {
      if (localStorage.getItem("vt_days_v1")) return;
      const d = new Date(Date.now() - 864e5);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const days = { [key]: { sec: 240, n: 2, ex: ["s4-lip-trills"] } };
      localStorage.setItem("vt_days_v1", JSON.stringify({ v: 1, days, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true }));
    } catch {
      /* ignore */
    }
  });
}

/** Ensure English for tests that assert English mode copy; default app is Spanish */
async function forceEn(page) {
  await dismissTour(page);
  await page.goto(BASE);
  const lang = await page.locator("html").getAttribute("lang");
  if (lang === "es") await page.click("#btn-lang");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
}

async function forceEs(page) {
  await dismissTour(page);
  await page.goto(BASE);
  const lang = await page.locator("html").getAttribute("lang");
  if (lang === "en") await page.click("#btn-lang");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
}

test.describe("Exercise-specific practice modes", () => {
  test.beforeEach(async ({ page }) => {
    await dismissTour(page);
  });

  test("profiles and modes load for all exercises", async ({ page }) => {
    await page.goto(BASE);
    const report = await page.evaluate(() => {
      const all = [...VT_EXERCISES.vocal, ...VT_EXERCISES.singing];
      const missing = all.filter((e) => !e.practice?.mode).map((e) => e.id);
      const modes = typeof VTPracticeModes !== "undefined" ? VTPracticeModes.ids() : [];
      return { total: all.length, missing, modeCount: modes.length };
    });
    expect(report.total).toBeGreaterThanOrEqual(36);
    expect(report.missing).toEqual([]);
    expect(report.modeCount).toBeGreaterThan(10);
  });

  test("v2 volume shows volume lane not pitch challenge", async ({ page }) => {
    await forceEn(page);
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").nth(1).click();
    await expect(page.locator("#ex-title")).toContainText("Maintain Volume");
    await expect(page.locator(".mode-panel.mode-volumeSteady")).toBeVisible();
    await expect(page.locator(".volume-lane")).toBeVisible();
    await expect(page.locator("#pitch-block")).toBeHidden();
  });

  test("v10 pause detect UI not pitch game", async ({ page }) => {
    await forceEn(page);
    await page.click('.tier-chip[data-tier="advanced"]');
    await page.locator("#exercise-list .card-ex").first().click();
    await expect(page.locator("#ex-title")).toContainText("Pause");
    await expect(page.locator(".mode-panel.mode-pauseDetect")).toBeVisible();
    await expect(page.locator("#pitch-block")).toBeHidden();
  });

  test("v11 fillers is distinct from pause mode", async ({ page }) => {
    await forceEn(page);
    await page.click('.tier-chip[data-tier="advanced"]');
    await page.locator("#exercise-list .card-ex", { hasText: "Kill the Fillers" }).click();
    await expect(page.locator(".mode-panel.mode-fillerDetect")).toBeVisible();
    await expect(page.locator(".mode-panel.mode-pauseDetect")).toHaveCount(0);
  });

  test("v8 metaphors is not rate ladder", async ({ page }) => {
    await forceEn(page);
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex", { hasText: "Metaphors" }).click();
    await expect(page.locator(".mode-panel.mode-metronomeSpeech")).toBeVisible();
    await expect(page.locator(".mode-title")).toContainText("Metaphor");
  });

  test("v3 soft palate has count logger", async ({ page }) => {
    await forceEn(page);
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex", { hasText: "Soft Palate" }).click();
    await expect(page.locator(".mode-panel.mode-countPace")).toBeVisible();
    await expect(page.locator("[data-plus]")).toBeVisible();
  });

  test("s14 staccato is not pen contrast shell", async ({ page }) => {
    await forceEn(page);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="advanced"]');
    await page.locator("#exercise-list .card-ex", { hasText: "Staccato" }).click();
    await expect(page.locator(".mode-panel.mode-staccatoLegato")).toBeVisible();
  });

  test("s10 scale is pitch-gated wording", async ({ page }) => {
    await forceEn(page);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="advanced"]');
    await page.getByRole("button", { name: /Five-Note Scale/i }).click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await expect(page.locator("#mode-hud")).toContainText("pitch-gated");
  });

  test("s1 fry is pitchHold without forcing challenge game hud", async ({ page }) => {
    await forceEn(page);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").first().click();
    await expect(page.locator(".mode-panel.mode-pitchHold")).toBeVisible();
    await expect(page.locator("#pitch-block")).toBeVisible();
    await expect(page.locator("#hold-display")).toBeVisible();
    // Score corner may show; challenge option stays off for fry
    await expect(page.locator("#chk-pitch-challenge")).not.toBeChecked();
  });

  test("s9 pitch match enables game HUD", async ({ page }) => {
    await forceEn(page);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="advanced"]');
    await page.locator("#exercise-list .card-ex", { hasText: "Single-Note Pitch Match" }).click();
    await expect(page.locator(".mode-panel.mode-pitchMatch")).toBeVisible();
    await expect(page.locator("#pitch-game-hud")).toBeVisible();
    await expect(page.locator("#chk-pitch-challenge")).toBeChecked();
  });

  test("s5 sirens use range mode not pitchMatch", async ({ page }) => {
    await forceEn(page);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="advanced"]');
    await page.locator("#exercise-list .card-ex", { hasText: "Sirens" }).click();
    await expect(page.locator(".mode-panel.mode-sirenRange")).toBeVisible();
    await expect(page.locator("#chk-pitch-challenge")).not.toBeChecked();
  });

  test("single Start practice CTA still primary", async ({ page }) => {
    await forceEs(page);
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").first().click();
    await expect(page.locator("#btn-practice-start")).toBeVisible();
    await expect(page.locator("#btn-pitch-start")).toBeHidden();
    // Speech modes mount into sticky #mode-focus; pitch modes keep #mode-hud
    await expect(page.locator("#mode-focus .mode-panel, #mode-hud .mode-panel")).toBeVisible();
  });

  test("structured session + continue still work", async ({ page }) => {
    await seedPracticeDay(page);
    await forceEs(page);
    await page.selectOption("#session-path", "basic");
    await page.click("#btn-structured");
    await expect(page.locator("#session-banner")).toHaveClass(/visible/);
    await expect(page.locator("#mode-focus .mode-panel, #mode-hud .mode-panel")).toBeVisible();
    await page.click("#btn-session-end");
    await page.click("#btn-continue");
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  });

  test("tier counts match catalog", async ({ page }) => {
    await page.goto(BASE);
    // Counts come from the live catalog rather than being frozen here: the
    // contract this test owns is that each filter shows exactly the exercises of
    // that tier. Inventory shrinkage is caught by the catalog snapshot instead,
    // so adding exercises does not mean hand-editing numbers in two places.
    const counts = await page.evaluate(() => {
      const n = (track, tier) =>
        (window.VT_EXERCISES[track] || []).filter((e) => (e.tier || "basic") === tier).length;
      return {
        vocalBasic: n("vocal", "basic"),
        vocalAdvanced: n("vocal", "advanced"),
        singingBasic: n("singing", "basic"),
        singingAdvanced: n("singing", "advanced"),
        singingAll: (window.VT_EXERCISES.singing || []).length
      };
    });
    expect(counts.vocalBasic).toBeGreaterThan(0);
    expect(counts.singingBasic).toBeGreaterThan(0);

    await page.click('.tier-chip[data-tier="basic"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(counts.vocalBasic);
    await page.click('.tier-chip[data-tier="advanced"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(counts.vocalAdvanced);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="basic"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(counts.singingBasic);
    await page.click('.tier-chip[data-tier="advanced"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(counts.singingAdvanced);
    await page.click('.tier-chip[data-tier="all"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(counts.singingAll);
    expect(counts.singingBasic + counts.singingAdvanced).toBe(counts.singingAll);
  });

  test("save metrics still works", async ({ page }) => {
    await forceEs(page);
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").first().click();
    // Metrics folded by default (less scroll) — expand then save
    await page.click("#btn-toggle-metrics");
    await page.fill('#metrics-form [name="duration"]', "5");
    await page.click("#btn-complete");
    await expect(page.locator("#score-result .score-big")).toContainText("/ 10");
  });

  test("Spanish is default; English toggle works", async ({ page }) => {
    await page.goto(BASE);
    // reset lang via evaluate to es
    await page.evaluate(() => {
      localStorage.setItem("vt_lang", "es");
    });
    await page.goto(BASE);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.locator("h1")).toContainText("Entrenamiento");
    await expect(page.locator("#btn-continue")).toContainText("Continuar");
    await page.click("#btn-lang");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("h1")).toContainText("Vocal");
    await expect(page.locator("#btn-continue")).toContainText("Continue");
    await page.click("#btn-lang");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
  });

  test("hold grace constants are lenient", async ({ page }) => {
    await page.goto(BASE);
    const grace = await page.evaluate(() => ({
      grace: window.VT_HOLD_GRACE_MS,
      silence: window.VT_SILENCE_END_MS,
      min: window.VT_HOLD_MIN_SEC
    }));
    expect(grace.grace).toBeGreaterThanOrEqual(500);
    expect(grace.silence).toBeGreaterThanOrEqual(800);
    expect(grace.min).toBe(2);
  });

  test("sustain checkbox still present with arpeggio and one-note mode", async ({ page }) => {
    await forceEn(page);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").nth(1).click();
    await expect(page.locator("#chk-sustain")).toBeVisible();
    await expect(page.locator("#chk-arpeggio")).toBeVisible();
    await expect(page.locator("#chk-one-note")).toBeVisible();
  });

  test("one-note mode sets single highway target from progression", async ({ page }) => {
    await forceEn(page);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="basic"]');
    // Solfege chords card (has piano opts)
    await page.locator("#exercise-list .card-ex", { hasText: /Solfège|Solfege|solfeo|chord/i }).first().click();
    await page.waitForTimeout(300);
    await expect(page.locator("#chk-one-note")).toBeAttached();
    await page.evaluate(() => {
      const el = document.querySelector("#chk-one-note");
      if (el) {
        el.checked = true;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    const ok = await page.evaluate(() => {
      let v = window.VTApp?.getState?.()?.pitchViz || window.VTGetPitchViz?.();
      if (!v && window.VTPitchVisualizer) {
        const canvas = document.querySelector("#pitch-canvas");
        if (canvas) v = new window.VTPitchVisualizer(canvas);
      }
      if (!v || !v.setTargetFromChord) return { ok: false, why: "no-viz" };
      v.setTargetFromChord(
        { name: "C", notes: ["C2", "C3", "E3", "G3"] },
        { oneNote: true, noteName: "E3" }
      );
      return {
        ok:
          v.chordLanes.length === 1 &&
          v.chordLanes[0].name === "E3" &&
          /E3|Mi/.test(v.chordLanes[0].label || ""),
        lanes: v.chordLanes.length,
        name: v.chordLanes[0]?.name,
        label: v.chordLanes[0]?.label
      };
    });
    expect(ok.ok, JSON.stringify(ok)).toBe(true);
  });

  test("dual letter + solfege labels available", async ({ page }) => {
    await page.goto(BASE);
    const dual = await page.evaluate(() => {
      const U = window.VTPitchUtils;
      return {
        c: U.midiToDualLabel(U.freqToMidi(261.63)),
        do: U.midiToSolfege(U.freqToMidi(261.63)),
        a: U.noteNameToDual("A3")
      };
    });
    expect(dual.c).toMatch(/C4|C/);
    expect(dual.c).toMatch(/Do/);
    expect(dual.do).toMatch(/Do/);
    expect(dual.a).toMatch(/La/);
  });

  test("Spanish exercise titles on cards", async ({ page }) => {
    await forceEs(page);
    await page.click('.tier-chip[data-tier="basic"]');
    await expect(page.locator("#exercise-list .card-ex").first()).toContainText("dicción");
  });

  test("chord highway stage is above the fold with overlays", async ({ page }) => {
    await forceEn(page);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").nth(1).click();
    await expect(page.locator("#highway-stage")).toBeVisible();
    await expect(page.locator(".hud-tl")).toBeVisible();
    await expect(page.locator(".hud-bl #btn-practice-start")).toBeVisible();
    await expect(page.locator("#pitch-canvas")).toBeVisible();
    // guide + metrics below fold, collapsed by default
    await expect(page.locator(".guide-card")).toHaveClass(/collapsed/);
    await expect(page.locator("#metrics-card")).toHaveClass(/collapsed/);
    // Game stage owns most of the first viewport — Start must be usable without scrolling
    const fold = await page.evaluate(() => {
      window.VTApp?.fitHighwayToViewport?.();
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      const b = document.querySelector("#btn-practice-start")?.getBoundingClientRect();
      const h = document.querySelector("#highway-stage")?.getBoundingClientRect();
      return {
        startY: b ? b.top + b.height / 2 : null,
        startBottom: b ? b.bottom : null,
        startInView: !!(b && b.top >= -8 && b.bottom <= window.innerHeight + 14),
        stageBottom: h ? h.bottom : null,
        stageTop: h ? h.top : null,
        stageH: h ? h.height : null,
        vh: window.innerHeight
      };
    });
    expect(fold.startInView, JSON.stringify(fold)).toBe(true);
    expect(fold.startY).toBeLessThan(fold.vh);
    expect(fold.startBottom).toBeLessThanOrEqual(fold.vh + 14);
    expect(fold.stageBottom).toBeLessThanOrEqual(fold.vh + 24);
    expect(fold.stageH / fold.vh).toBeGreaterThanOrEqual(0.45);
    expect(fold.stageTop).toBeLessThan(fold.vh * 0.35);
  });

  test("wide jump progressions available for solfege", async ({ page }) => {
    await forceEn(page);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").nth(1).click();
    // Piano panel is collapsed by default — open it for progression list
    await page.locator("#btn-toggle-piano").click();
    await expect(page.locator("#prog-buttons")).toContainText("Wide jumps");
    const hasJump = await page.evaluate(() => !!window.VT_PROGRESSIONS?.progJump1);
    expect(hasJump).toBeTruthy();
  });
});
