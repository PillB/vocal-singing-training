/**
 * Plan and History (design "planhist", audit SEC-2 and SEC-4).
 *
 * Plan: one focus for the week (the current track's first, the rest behind
 * "Ver otros N"), the exercises that train it as rows that open the exercise
 * and start the week, and the days practised counted from the practice-day
 * ledger instead of a hand-logged check-in.
 *
 * History: the days practised first (a count for a stated period and a
 * Monday-first calendar of five weeks, today outlined), then what was
 * practised last, most recent first, each row opening its exercise.
 *
 * Fixed clock: Wednesday 23 September 2026, 10:00 in Lima; the week starts
 * Monday 21 and the calendar Monday 24 August.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const NOW = "2026-09-23T10:00:00-05:00";

test.use({ timezoneId: "America/Lima" });

function ledger(dayKeys, used = []) {
  const days = {};
  dayKeys.forEach((k) => {
    days[k] = { sec: 240, n: 2, ex: ["s4-lip-trills"] };
  });
  return { v: 1, days, rest: { bank: 1, earnedAt: 0, used }, backfilled: true };
}

/** A progress row last practised `daysAgo` days before the fixed today, at 10:00 Lima. */
function row(n, score, daysAgo) {
  const at = new Date(Date.UTC(2026, 8, 23 - daysAgo, 15, 0, 0)).toISOString();
  return {
    completedCount: n,
    lastScore: score,
    lastAt: at,
    history: Array.from({ length: n }, (_, i) => ({ id: `${daysAgo}-${i}`, at, metrics: {}, score, notes: "", durationSec: 90 }))
  };
}

function weekPlan(patch) {
  return { weekNumber: 1, element: null, status: "idle", startedAt: null, checkIns: [], reviews: [], completedElements: [], ...patch };
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ lang?: string, tab?: string, days?: object, progress?: object, plan?: object, reviews?: object[] }} opts
 */
async function boot(page, opts = {}) {
  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript((o) => {
    try {
      if (sessionStorage.getItem("ph_seeded")) return;
      sessionStorage.setItem("ph_seeded", "1");
      sessionStorage.setItem("vt_e2e", "1");
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", o.lang || "es");
      localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: o.tab || "singing" }));
      if (o.days) localStorage.setItem("vt_days_v1", JSON.stringify(o.days));
      if (o.progress) localStorage.setItem("vt_progress_v1", JSON.stringify(o.progress));
      if (o.plan) localStorage.setItem("vt_week_plan_v1", JSON.stringify(o.plan));
      if (o.reviews) localStorage.setItem("vt_reviews_v1", JSON.stringify(o.reviews));
    } catch {
      /* ignore */
    }
  }, opts);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && !!window.VTDays && !!window.VTLoop);
  await page.clock.runFor(500);
}

async function openPlan(page) {
  await page.locator("#btn-plan").click();
  await expect(page.locator("#view-plan")).toHaveClass(/active/);
}

async function openHistory(page) {
  await page.locator("#btn-history").click();
  await expect(page.locator("#view-history")).toHaveClass(/active/);
  await expect(page.locator("#history-list")).not.toContainText(/Cargando|Loading/);
}

test.describe("Plan: one focus, its exercises, days counted", () => {
  test("the element map names real exercises for every element", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const ids = new Set([...VT_EXERCISES.vocal, ...VT_EXERCISES.singing].map((e) => e.id));
      const map = window.VT_WEEK_ELEMENT_EXERCISES;
      const missing = [];
      const unknown = [];
      VT_WEEK_ELEMENTS.forEach((el) => {
        const m = map[el];
        if (!m || ![...(m.vocal || []), ...(m.singing || [])].length) missing.push(el);
      });
      Object.entries(map).forEach(([el, m]) => {
        if (!VT_WEEK_ELEMENTS.includes(el)) unknown.push(el);
        [...(m.vocal || []), ...(m.singing || [])].forEach((id) => {
          if (!ids.has(id)) unknown.push(`${el}: ${id}`);
        });
      });
      Object.values(window.VT_WEEK_ELEMENTS_FIRST).flat().forEach((el) => {
        if (!VT_WEEK_ELEMENTS.includes(el)) unknown.push(`first: ${el}`);
      });
      return { missing, unknown };
    });
    expect(r.missing).toEqual([]);
    expect(r.unknown).toEqual([]);
  });

  test("ES, Canto: five chips first, the rest behind a real button, and a picked focus lists exercises that open", async ({ page }) => {
    await boot(page, { days: ledger(["2026-09-22"]) });
    await openPlan(page);
    await expect(page.locator("#plan-week-num")).toHaveText("Semana 1");
    // No hand-logged check-in any more, and no empty review history.
    await expect(page.locator("#btn-plan-checkin")).toHaveCount(0);
    await expect(page.locator("#plan-reviews-card")).toBeHidden();
    await expect(page.locator("#plan-review-body")).toBeHidden();
    await expect(page.locator("#plan-review-when")).toHaveText("Se abre 7 días después de empezar la semana.");

    const chips = page.locator("#element-chips .chip:visible");
    await expect(chips).toHaveText(["Apoyo del aire", "Cierre vocal (canto)", "Afinación", "Resonancia y velo del paladar", "Precisión y estabilidad del tono"]);
    const more = page.locator("#plan-focus-more");
    await expect(more).toHaveText("Ver otros 12");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    expect((await more.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#element-chips .chip:visible")).toHaveCount(17);
    await expect(more).toHaveText("Ver menos");
    await more.click();
    await expect(page.locator("#element-chips .chip:visible")).toHaveCount(5);

    await expect(page.locator("#plan-exercises")).toBeHidden();
    await page.locator("#element-chips .chip", { hasText: "Afinación" }).click();
    const picked = page.locator("#element-chips .chip.selected");
    await expect(picked).toHaveAttribute("aria-pressed", "true");
    await expect(picked).toBeFocused();
    // Selected is said in text too (a check mark), not only in colour.
    expect(await picked.evaluate((el) => getComputedStyle(el, "::before").content)).toContain("✓");

    const rows = page.locator("#plan-exercise-list .open-row");
    await expect(rows).toHaveCount(3);
    await expect(rows.first()).toContainText("Afinar una nota");
    await expect(rows.first()).toContainText("~8 min");
    // Stored value stays the English key.
    expect(await page.evaluate(() => VTStorage.getWeekPlan().element)).toBe("Pitch accuracy");

    // Opening an exercise starts the week.
    await rows.first().click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    const after = await page.evaluate(() => ({ id: VTApp.getState().exercise?.id, plan: VTStorage.getWeekPlan() }));
    expect(after.id).toBe("s9-pitch-match");
    expect(after.plan.status).toBe("active");
    expect(after.plan.startedAt).toBeTruthy();
    expect(after.plan.element).toBe("Pitch accuracy");

    // Back on the Plan (the header nav is hidden on the exercise screen): the
    // week is under way, from today, with nothing practised in it yet.
    await page.evaluate(() => VTApp.setView("home"));
    await openPlan(page);
    await expect(page.locator("#plan-start-row")).toBeHidden();
    await expect(page.locator("#plan-status")).toHaveText("Foco de la semana: Afinación");
    await expect(page.locator("#plan-days")).toHaveText("0 de 7 días practicados esta semana");
    await expect(page.locator("#plan-review-when")).toHaveText("Se abre el miércoles, 30 de setiembre.");
  });

  test("the days count comes from the practice-day ledger since the week started", async ({ page }) => {
    // 19 and 20 are before the week started; 21 and 23 are in it; 22 has too little to count.
    const days = ledger(["2026-09-19", "2026-09-20", "2026-09-21", "2026-09-23"]);
    days.days["2026-09-22"] = { sec: 10, n: 0, ex: [] };
    await boot(page, {
      days,
      plan: weekPlan({ weekNumber: 3, element: "Breath support", status: "active", startedAt: "2026-09-21T15:00:00.000Z", reviews: [{ week: 2, element: "Pitch accuracy", verdict: "continue", notes: "", at: "2026-09-20T15:00:00.000Z" }] })
    });
    await openPlan(page);
    await expect(page.locator("#plan-week-num")).toHaveText("Semana 3");
    await expect(page.locator("#plan-days")).toHaveText("2 de 7 días practicados esta semana");
    await expect(page.locator("#plan-exercise-list .open-row")).toHaveCount(3);
    await expect(page.locator("#plan-exercise-list .open-row").first()).toContainText("Respiración costo-abdominal");
    await expect(page.locator("#plan-review-body")).toBeHidden();
    await expect(page.locator("#plan-review-when")).toHaveText("Se abre el lunes, 28 de setiembre.");
    await expect(page.locator("#plan-reviews-card")).toBeVisible();
    await expect(page.locator("#plan-reviews")).toContainText("Semana 2: Afinación");
    await expect(page.locator("#plan-reviews")).toContainText("Aún no, otra semana");
    // The rail: weeks 1–2 done, 3 current, all twelve on one line.
    const rail = page.locator("#plan-week-rail li");
    await expect(rail).toHaveCount(12);
    await expect(page.locator("#plan-week-rail li.done")).toHaveCount(2);
    await expect(page.locator("#plan-week-rail li.current")).toHaveText("3");
  });

  test("seven days on, the review opens and records the days practised", async ({ page }) => {
    await boot(page, {
      days: ledger(["2026-09-14", "2026-09-16", "2026-09-17", "2026-09-22"]),
      plan: weekPlan({ element: "Pitch accuracy", status: "active", startedAt: "2026-09-14T15:00:00.000Z" })
    });
    await openPlan(page);
    await expect(page.locator("#plan-days")).toHaveText("3 de 7 días practicados esta semana");
    await expect(page.locator("#plan-review-when")).toBeHidden();
    await expect(page.locator("#plan-review-body")).toBeVisible();
    await page.locator("#btn-plan-improved").click();
    const plan = await page.evaluate(() => VTStorage.getWeekPlan());
    expect(plan.weekNumber).toBe(2);
    expect(plan.status).toBe("idle");
    expect(plan.completedElements).toEqual(["Pitch accuracy"]);
    expect(plan.reviews[0].checkInCount).toBe(3);
    await expect(page.locator("#plan-completed-wrap")).toBeVisible();
    await expect(page.locator("#plan-completed-elements")).toContainText("Afinación");
  });

  test("EN, Vocal: speaking elements first, Start this week, days in English", async ({ page }) => {
    await boot(page, { lang: "en", tab: "vocal", days: ledger(["2026-09-23"]) });
    await openPlan(page);
    await expect(page.locator("#element-chips .chip:visible")).toHaveText([
      "Volume",
      "Diction",
      "Pace / rate control",
      "Filler reduction",
      "Strategic pause",
      "Tonality"
    ]);
    await expect(page.locator("#plan-focus-more")).toHaveText("Show 11 more");
    await page.locator("#element-chips .chip", { hasText: "Volume" }).click();
    await expect(page.locator("#plan-exercise-list .open-row")).toHaveCount(2);
    await expect(page.locator("#plan-exercise-list .open-row").nth(0)).toContainText("Maintain Volume");
    await expect(page.locator("#plan-exercise-list .open-row").nth(0)).toContainText("Open →");
    await page.locator("#btn-plan-start").click();
    await expect(page.locator("#plan-days")).toHaveText("1 of 7 days practised this week");
    await expect(page.locator("#plan-review-when")).toHaveText("Opens on Wednesday, September 30.");
    // The start button gave way to the week's exercises.
    await expect(page.locator("#plan-exercise-list .open-row").first()).toBeFocused();
    // A singing element picked from "Show more" lists its singing exercises.
    await page.locator("#plan-focus-more").click();
    await page.locator("#element-chips .chip", { hasText: "Pitch accuracy" }).click();
    await expect(page.locator("#plan-exercise-list .open-row").first()).toContainText("Single-Note Pitch Match");
    await expect(page.locator("#plan-exercise-list .open-row").first()).toContainText("Singing");
  });
});

test.describe("History: days sung first, then what you did last", () => {
  test("ES: count for a stated period, a five-week calendar, the most recent exercise first", async ({ page }) => {
    await boot(page, {
      days: ledger(["2026-09-20", "2026-09-21", "2026-09-22"]),
      // Insertion order oldest first, plus an id that left the catalogue.
      progress: {
        "v1-diction": row(1, 5, 9),
        "s2-humming": row(1, 8, 3),
        "s27-lip-trill-solfege": row(3, 6, 1),
        "s4-lip-trills": row(3, 7, 0)
      },
      reviews: [{ week: 1, element: "Pitch accuracy", verdict: "improved", notes: "Más afinado", at: "2026-09-20T15:00:00.000Z" }]
    });
    await openHistory(page);
    const list = page.locator("#history-list");
    await expect(list.locator(".hist-count")).toHaveText("3 días cantados en las últimas 5 semanas");
    const cal = list.locator("table.hist-cal");
    await expect(cal.locator("caption")).toContainText("agosto");
    await expect(cal.locator("caption")).toContainText("setiembre de 2026");
    await expect(cal.locator("thead th")).toHaveCount(7);
    await expect(cal.locator("tbody tr")).toHaveCount(5);
    await expect(cal.locator("tbody td").first()).toContainText("24");
    await expect(cal.locator("td.is-done")).toHaveCount(3);
    // Practised days carry a mark as well as a colour; the plain days are not buttons.
    await expect(cal.locator("td.is-done .hist-mark")).toHaveCount(3);
    await expect(cal.locator("td.is-done").first()).toContainText("✓");
    await expect(cal.locator("button")).toHaveCount(0);
    const today = cal.locator("td.is-today");
    await expect(today).toHaveCount(1);
    await expect(today).toContainText("23");
    expect(await today.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");

    await expect(list.locator("#hist-recent-h")).toHaveText("Lo último que practicaste");
    const rows = list.locator(".hist-recent .history-item");
    // The retired id is not shown as a raw id.
    await expect(rows).toHaveCount(3);
    await expect(list).not.toContainText("s2-humming");
    await expect(rows.nth(0)).toContainText("Trinos de labios");
    await expect(rows.nth(0).locator(".meta")).toHaveText("hoy · 3 veces · último puntaje 7/10");
    await expect(rows.nth(1).locator(".meta")).toHaveText("ayer · 3 veces · último puntaje 6/10");
    await expect(rows.nth(2).locator(".meta")).toHaveText("14 set. · 1 vez · último puntaje 5/10");
    await expect(rows.nth(0)).toContainText("Abrir →");

    // No recordings: one quiet line at the end, no empty block on top.
    await expect(list).not.toContainText("Grabaciones (en este dispositivo)");
    await expect(list.locator(".hist-rec-empty")).toHaveText("Aún no hay grabaciones. Abre un ejercicio y usa Grabar.");
    // Saved reviews render under their heading.
    await expect(list).toContainText("Revisiones guardadas");
    await expect(list).toContainText("Semana 1: Afinación");
    await expect(list).toContainText("Más afinado");

    await rows.nth(1).click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    expect(await page.evaluate(() => VTApp.getState().exercise?.id)).toBe("s27-lip-trill-solfege");
  });

  test("EN, Vocal: the count says practice days; rest days are marked and explained", async ({ page }) => {
    await boot(page, {
      lang: "en",
      tab: "vocal",
      days: ledger(["2026-05-03", "2026-09-15", "2026-09-17", "2026-09-22"], ["2026-09-16"]),
      progress: { "v2-volume": row(2, 8, 1), "v1-diction": row(1, null, 4) }
    });
    await openHistory(page);
    const list = page.locator("#history-list");
    await expect(list.locator(".hist-count")).toHaveText("3 practice days in the last 5 weeks");
    await expect(list.locator(".hist-total")).toHaveText("4 in all since May 3");
    await expect(list.locator("table.hist-cal caption")).toContainText("August");
    await expect(list.locator("td.is-rest")).toHaveCount(1);
    await expect(list.locator("td.is-rest")).toContainText("☾");
    await expect(list.locator(".hist-legend")).toHaveText("✓ practice day · ☾ rest day");
    await expect(list.locator("#hist-recent-h")).toHaveText("What you practised last");
    const rows = list.locator(".hist-recent .history-item");
    await expect(rows.nth(0).locator(".meta")).toHaveText("yesterday · 2 times · last score 8/10");
    // No score yet: the part is left out, not shown as a dash.
    await expect(rows.nth(1).locator(".meta")).toHaveText("4 days ago · once");
    await expect(rows.nth(0)).toContainText("Open →");
  });

  test("recordings keep their list, players and compare, after the days and the recent list", async ({ page }) => {
    await boot(page, { days: ledger(["2026-09-22"]), progress: { "s4-lip-trills": row(2, 7, 1) } });
    await page.evaluate(async () => {
      const blob = new Blob([new Uint8Array(64)], { type: "audio/webm" });
      await VTStorage.saveRecording({ exerciseId: "s4-lip-trills", blob, label: "Toma 1" });
      await VTStorage.saveRecording({ exerciseId: "s4-lip-trills", blob, label: "Toma 2" });
    });
    await openHistory(page);
    const list = page.locator("#history-list");
    await expect(list.locator("h3")).toHaveText([
      /día cantado/,
      "Lo último que practicaste",
      "Grabaciones (en este dispositivo)",
      "Comparar tomas (antes / después)"
    ]);
    await expect(list.locator("[data-play]")).toHaveCount(2);
    await expect(list.locator("[data-del]")).toHaveCount(2);
    await expect(list.locator(".hist-rec-empty")).toHaveCount(0);
    await list.locator("[data-ab-old]").click();
    await expect(page.locator("#history-player audio")).toHaveCount(2);
  });

  test("a brand-new browser keeps the one-message empty state", async ({ page }) => {
    await boot(page);
    await openHistory(page);
    const list = page.locator("#history-list");
    await expect(list.locator("table.hist-cal")).toHaveCount(0);
    await expect(list.locator("#history-empty-cta")).toBeVisible();
    await expect(list.locator("h3")).toHaveCount(0);
  });
});

test.describe("Plan and History on phones", () => {
  for (const vp of [
    { width: 320, height: 640 },
    { width: 360, height: 740 },
    { width: 390, height: 844 }
  ]) {
    test(`${vp.width}px: no sideways scroll, 44px controls, twelve weeks on one line`, async ({ page }) => {
      await page.setViewportSize(vp);
      await boot(page, {
        days: ledger(["2026-09-20", "2026-09-21", "2026-09-22"]),
        progress: { "s27-lip-trill-solfege": row(3, 6, 1), "s4-lip-trills": row(3, 7, 0) },
        plan: weekPlan({ weekNumber: 12, element: "Resonance / soft palate", status: "active", startedAt: "2026-09-21T15:00:00.000Z" })
      });
      await openPlan(page);
      const plan = await page.evaluate(() => {
        const tops = [...document.querySelectorAll("#plan-week-rail li")].map((li) => Math.round(li.getBoundingClientRect().top));
        const small = [...document.querySelectorAll("#view-plan button")]
          .filter((b) => b.offsetParent && b.getBoundingClientRect().height < 43.5)
          .map((b) => b.id || b.textContent.trim());
        return { tops: new Set(tops).size, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth, small };
      });
      expect(plan.tops).toBe(1);
      expect(plan.overflow).toBeLessThanOrEqual(0);
      expect(plan.small).toEqual([]);

      await openHistory(page);
      const hist = await page.evaluate(() => {
        const small = [...document.querySelectorAll("#history-list button")]
          .filter((b) => b.offsetParent && b.getBoundingClientRect().height < 43.5)
          .map((b) => b.textContent.trim());
        const tiny = [...document.querySelectorAll("#history-list *")]
          .filter((el) => el.offsetParent && el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()))
          .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 12)
          .map((el) => el.textContent.trim());
        return { small, tiny, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
      });
      expect(hist.overflow).toBeLessThanOrEqual(0);
      expect(hist.small).toEqual([]);
      expect(hist.tiny).toEqual([]);
    });
  }

  test("390x844: the Plan's start button and History's first recent row are on the first screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, {
      days: ledger(["2026-09-20", "2026-09-21", "2026-09-22"]),
      progress: { "s4-lip-trills": row(3, 7, 0) }
    });
    await openPlan(page);
    const start = await page.locator("#btn-plan-start").boundingBox();
    expect(start.y + start.height).toBeLessThanOrEqual(844);
    await openHistory(page);
    const first = await page.locator(".hist-recent .history-item").first().boundingBox();
    expect(first.y + first.height).toBeLessThanOrEqual(844);
  });
});
