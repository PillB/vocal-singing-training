/**
 * The exercise catalog as rows (design "catalog") and the singing groups named
 * for what they hold, with today's basics findable from the list (design
 * "canto-groups").
 *
 * - Each row: number, name, one line on what you do (never cut inside a word,
 *   never just the title again, at most two lines on a phone), minutes and
 *   tools. The group badge only once filtered; the sessions badge only once
 *   there is a session.
 * - Canto groups are "Clase" and "Técnica" (Vocal: "Clase" and "Expresión"),
 *   in both languages, with an intro line that uses the same words. The stored
 *   tiers stay "basic" / "advanced".
 * - From the first day sung, a line above the list names today's basics as
 *   shortcuts, and their rows say so.
 *
 * Fixed clock: Wednesday 23 September 2026, 10:00 in Lima.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const NOW = "2026-09-23T10:00:00-05:00";

test.use({ timezoneId: "America/Lima", locale: "es-PE" });

/** Three days sung before today: the loop is on, today is still open. */
function ledger() {
  const days = {};
  ["2026-09-20", "2026-09-21", "2026-09-22"].forEach((k) => {
    days[k] = { sec: 240, n: 2, ex: ["s4-lip-trills"] };
  });
  return { v: 1, days, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true };
}

function loopState(tier) {
  return { v: 1, seed: "a1", tier, goal: "3-5", ms: [], cards: {}, surprises: [], since: 0, comebacks: [], completions: 0 };
}

async function boot(page, { lang = "es", tab = "singing", days = null, loop = null, progress = null } = {}) {
  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript(
    ({ lang, tab, days, loop, progress }) => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", lang);
        localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: tab }));
        sessionStorage.setItem("vt_e2e", "1");
        if (!sessionStorage.getItem("vt_seeded")) {
          sessionStorage.setItem("vt_seeded", "1");
          if (days) localStorage.setItem("vt_days_v1", JSON.stringify(days));
          if (loop) localStorage.setItem("vt_loop_v1", JSON.stringify(loop));
          if (progress) localStorage.setItem("vt_progress_v1", JSON.stringify(progress));
        }
      } catch {
        /* ignore */
      }
    },
    { lang, tab, days, loop, progress }
  );
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#exercise-list .card-ex").first()).toBeVisible();
}

/** Every row's description, with what it was made from. */
function rowLines(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("#exercise-list .card-ex")].map((c) => {
      const ex = [...VT_EXERCISES.vocal, ...VT_EXERCISES.singing].find((e) => e.id === c.dataset.id);
      const d = c.querySelectorAll(".card-ex-desc");
      const lh = d[0] ? parseFloat(getComputedStyle(d[0]).lineHeight) : 1;
      return {
        id: c.dataset.id,
        n: d.length,
        text: d[0]?.textContent || "",
        lines: d[0] ? Math.round(d[0].getBoundingClientRect().height / lh) : 0,
        title: VTI18n.exTitle(ex),
        source: String(VTI18n.exField(ex, "original")).replace(/\s+/g, " ").trim()
      };
    })
  );
}

test.describe("Catalog rows", () => {
  for (const lang of ["es", "en"]) {
    test(`one line on what you do, never cut inside a word (${lang})`, async ({ page }) => {
      await boot(page, { lang });
      for (const tab of ["vocal", "singing"]) {
        await page.click(`.tab[data-tab="${tab}"]`);
        const rows = await rowLines(page);
        expect(rows.length).toBeGreaterThan(10);
        for (const r of rows) {
          expect(r.n, `${r.id}: one description`).toBe(1);
          expect(r.text.length, `${r.id}: not empty`).toBeGreaterThan(8);
          // A shortened line is a prefix of the full one (or of it without a
          // lead-in that repeats the title) that stops where a word stops.
          const kept = r.text.replace(/…$/, "");
          const i = r.source.toLowerCase().indexOf(kept.slice(1).toLowerCase());
          expect(i, `${r.id}: "${r.text}" comes from "${r.source}"`).toBeGreaterThan(-1);
          if (r.text.endsWith("…")) {
            const next = r.source.charAt(i + kept.length - 1);
            expect(/\p{L}|\d/u.test(next), `${r.id}: cut inside a word: "${r.text}"`).toBe(false);
          }
        }
      }
    });
  }

  test("a lead-in that only repeats the title is dropped", async ({ page }) => {
    await boot(page, { lang: "es" });
    const rows = await rowLines(page);
    const byId = Object.fromEntries(rows.map((r) => [r.id, r.text]));
    // "Trinos de labios (SOVT): …", "Respiración costo-abdominal: …", "Sirenas / deslizamientos de tono: …"
    expect(byId["s4-lip-trills"]).toMatch(/^Equilibra aire y vibración/);
    expect(byId["s18-costal-breath"]).toMatch(/^Inhala bajo por la nariz/);
    expect(byId["s5-sirens"]).toMatch(/^Conectan registros/);
    // A lead-in that says something new stays.
    expect(byId["s1-vocal-fry"]).toMatch(/^De un fry suave/);
    for (const r of rows) {
      expect(r.text.toLowerCase().startsWith(r.title.toLowerCase()), `${r.id} repeats its title`).toBe(false);
    }
  });

  for (const vp of [
    { width: 390, height: 844 },
    { width: 360, height: 740 }
  ]) {
    test(`at most two lines on a ${vp.width}px phone`, async ({ page }) => {
      await page.setViewportSize(vp);
      for (const lang of ["es", "en"]) {
        await boot(page, { lang });
        for (const tab of ["vocal", "singing"]) {
          await page.click(`.tab[data-tab="${tab}"]`);
          const over = (await rowLines(page)).filter((r) => r.lines > 2).map((r) => `${r.id} (${r.lines}): ${r.text}`);
          expect(over, `${lang} ${tab}`).toEqual([]);
        }
      }
    });
  }

  test("a row opens its exercise by click and by keyboard", async ({ page }) => {
    await boot(page, { lang: "es" });
    await page.locator('#exercise-list .card-ex[data-id="s18-costal-breath"]').click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await expect(page.locator("#view-exercise")).toContainText("Respiración costo-abdominal");

    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#exercise-list .card-ex").first()).toBeVisible();
    await page.locator('#exercise-list .card-ex[data-id="s4-lip-trills"]').focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await expect(page.locator("#view-exercise")).toContainText("Trinos de labios");
  });

  test("badges: group only once filtered, sessions only once there is one", async ({ page }) => {
    await boot(page, { lang: "es", progress: { "s1-vocal-fry": { completedCount: 12 }, "s2-solfege-chords": { completedCount: 1 } } });
    const grouped = await page.evaluate(() => ({
      tier: document.querySelectorAll("#exercise-list .card-ex .badge[class*='tier-']").length,
      done: [...document.querySelectorAll("#exercise-list .card-ex .badge.done")].map((b) => b.closest(".card-ex").dataset.id),
      text: document.querySelector("#exercise-list").textContent
    }));
    expect(grouped.tier).toBe(0);
    expect(grouped.done.sort()).toEqual(["s1-vocal-fry", "s2-solfege-chords"]);
    expect(grouped.text).not.toMatch(/Aún no practicado/);
    await expect(page.locator('#exercise-list .card-ex[data-id="s1-vocal-fry"] .badge.done')).toHaveText("✓ 12 sesiones");

    await page.click('.tier-chip[data-tier="advanced"]');
    const badges = page.locator("#exercise-list .card-ex .badge.tier-advanced");
    await expect(badges).toHaveCount(11);
    await expect(badges.first()).toHaveText("Técnica");
    // One line: the badge never wraps.
    const h = await badges.evaluateAll((els) => els.map((b) => b.getBoundingClientRect().height));
    const one = await badges.first().evaluate((b) => parseFloat(getComputedStyle(b).lineHeight) + 12);
    expect(Math.max(...h)).toBeLessThan(one);
  });

  test("desktop rows start at the same height side by side", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await boot(page, { lang: "es" });
    const spread = await page.evaluate(() => {
      const rows = new Map();
      document.querySelectorAll("#exercise-list .card-ex").forEach((c) => {
        const top = Math.round(c.getBoundingClientRect().top);
        const t = Math.round(c.querySelector("h3").getBoundingClientRect().top - top);
        if (!rows.has(top)) rows.set(top, []);
        rows.get(top).push(t);
      });
      return Math.max(...[...rows.values()].map((ts) => Math.max(...ts) - Math.min(...ts)));
    });
    expect(spread).toBeLessThanOrEqual(1);
  });
});

test.describe("Singing groups named for what they hold", () => {
  const NAMES = {
    es: {
      heads: ["Ejercicios de la clase", "Calentamientos y técnica"],
      chips: ["Todos", "Clase", "Técnica"],
      vocal: ["Todos", "Clase", "Expresión"],
      old: /Básico|Avanzado/
    },
    en: {
      heads: ["Class exercises", "Warm-ups & technique"],
      chips: ["All", "Class", "Technique"],
      vocal: ["All", "Class", "Expression"],
      old: /\bBasic\b|\bAdvanced\b/
    }
  };
  for (const lang of ["es", "en"]) {
    test(`group heads, chips and intro agree (${lang})`, async ({ page }) => {
      const N = NAMES[lang];
      await boot(page, { lang });
      const heads = await page.locator("#exercise-list .grid-group-head > span:first-child").allTextContents();
      expect(heads).toEqual(N.heads);
      expect(await page.locator(".tier-chip").allTextContents()).toEqual(N.chips);
      const blurb = await page.locator("#home-track-sub").textContent();
      expect(blurb).not.toMatch(N.old);
      expect(blurb).toContain(`${N.chips[1]}:`);
      expect(blurb).toContain(`${N.chips[2]}:`);
      // Labels only: the chips still filter by the stored tier.
      expect(await page.locator(".tier-chip").evaluateAll((els) => els.map((c) => c.dataset.tier))).toEqual([
        "all",
        "basic",
        "advanced"
      ]);
      await page.click('.tier-chip[data-tier="basic"]');
      await expect(page.locator("#tier-counts")).toContainText(`${N.chips[1]}: 16`);

      await page.click('.tab[data-tab="vocal"]');
      expect(await page.locator(".tier-chip").allTextContents()).toEqual(N.vocal);
      expect(await page.locator("#home-track-sub").textContent()).not.toMatch(N.old);
      expect(await page.locator("#catalog-panel").textContent()).not.toMatch(N.old);
    });
  }

  test("the names follow a language switch", async ({ page }) => {
    await boot(page, { lang: "es" });
    await page.evaluate(() => VTI18n.setLang("en"));
    await expect(page.locator(".tier-chip[data-tier='advanced']")).toHaveText("Technique");
    await expect(page.locator("#exercise-list .grid-group-head").nth(1)).toContainText("Warm-ups & technique");
  });

  test("the stored tiers are unchanged", async ({ page }) => {
    await boot(page);
    const tiers = await page.evaluate(() => {
      const count = (t, k) => VT_EXERCISES[t].filter((e) => e.tier === k).length;
      return [count("singing", "basic"), count("singing", "advanced"), count("vocal", "basic"), count("vocal", "advanced")];
    });
    expect(tiers).toEqual([16, 11, 9, 11]);
  });
});

test.describe("Today's basics in the catalog", () => {
  test("a first visit sees no basics line and no tags", async ({ page }) => {
    await boot(page, { lang: "es" });
    await expect(page.locator("#today-basics")).toBeHidden();
    await expect(page.locator("#exercise-list .card-ex-today")).toHaveCount(0);
  });

  test("the Mínimo: a line above the list opens each exercise, and their rows say so", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, { lang: "es", days: ledger() });
    const box = page.locator("#today-basics");
    await expect(box).toBeVisible();
    await expect(box).toContainText("Tus básicos de hoy (Mínimo)");
    const ids = await box.locator(".today-basics-ex").evaluateAll((els) => els.map((b) => b.dataset.id));
    expect(ids).toEqual(["s4-lip-trills", "s27-lip-trill-solfege"]);
    // The line sits right above the list, before the first group head.
    const [boxBottom, listTop] = await page.evaluate(() => [
      document.getElementById("today-basics").getBoundingClientRect().bottom,
      document.getElementById("exercise-list").getBoundingClientRect().top
    ]);
    expect(listTop - boxBottom).toBeLessThan(40);

    const tagged = await page.locator("#exercise-list .card-ex-today").evaluateAll((els) =>
      els.map((t) => t.closest(".card-ex").dataset.id).sort()
    );
    expect(tagged).toEqual(["s27-lip-trill-solfege", "s4-lip-trills"]);
    await expect(page.locator('#exercise-list .card-ex[data-id="s4-lip-trills"] .card-ex-today')).toHaveText(
      "Hoy en tus básicos"
    );

    // Targets hold the phone floor.
    const hs = await box.locator("button").evaluateAll((els) => els.map((b) => b.getBoundingClientRect().height));
    expect(Math.min(...hs)).toBeGreaterThanOrEqual(44);

    await box.locator('.today-basics-ex[data-id="s27-lip-trill-solfege"]').click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await expect(page.locator("#view-exercise")).toContainText("Solfeo en trino de labios");
  });

  test("Esencial folds after three and unfolds by keyboard", async ({ page }) => {
    await boot(page, { lang: "es", days: ledger(), loop: loopState("ess") });
    const order = await page.evaluate(() => VTLoop.routine("singing", "ess").order);
    expect(order.length).toBe(7);
    const box = page.locator("#today-basics");
    await expect(box).toContainText("(Esencial)");
    await expect(box.locator(".today-basics-ex")).toHaveCount(3);
    const more = box.locator(".today-basics-more");
    await expect(more).toHaveText("+4 más");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await more.focus();
    await page.keyboard.press("Enter");
    await expect(box.locator(".today-basics-ex")).toHaveCount(7);
    await expect(box.locator(".today-basics-more")).toHaveAttribute("aria-expanded", "true");
    await expect(box.locator(".today-basics-more")).toBeFocused();
    expect(await box.locator(".today-basics-ex").evaluateAll((els) => els.map((b) => b.dataset.id))).toEqual(order);
    // Every routine exercise in this catalog is tagged, and nothing else.
    const tagged = await page.locator("#exercise-list .card-ex-today").evaluateAll((els) =>
      els.map((t) => t.closest(".card-ex").dataset.id).sort()
    );
    expect(tagged).toEqual([...order].sort());
  });

  test("picking another size on the start panel updates the line", async ({ page }) => {
    await boot(page, { lang: "es", days: ledger() });
    await expect(page.locator("#today-basics .today-basics-ex")).toHaveCount(2);
    await page.locator('#loop-tiers [data-tier="ess"]').click();
    await expect(page.locator("#today-basics")).toContainText("(Esencial)");
    await expect(page.locator("#exercise-list .card-ex-today")).toHaveCount(7);
  });

  test("English, and the Vocal track (whose basics start with a Canto warm-up)", async ({ page }) => {
    await boot(page, { lang: "en", tab: "vocal", days: ledger() });
    const box = page.locator("#today-basics");
    await expect(box).toContainText("Today's basics (Minimum)");
    expect(await box.locator(".today-basics-ex").evaluateAll((els) => els.map((b) => b.dataset.id))).toEqual([
      "s4-lip-trills",
      "v1-diction"
    ]);
    await expect(page.locator('#exercise-list .card-ex[data-id="v1-diction"] .card-ex-today')).toHaveText(
      "In today's basics"
    );
    // The Canto warm-up is not in the Vocal list, but the line still opens it.
    await box.locator('.today-basics-ex[data-id="s4-lip-trills"]').click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  });
});
