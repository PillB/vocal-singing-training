/**
 * Home designs from the second side-by-side test (docs/37-DAILY-LOOP.md):
 *
 * - one naming scheme: the button says which size it starts, the sizes only
 *   select ("Elige el tamaño de hoy:"), and Continuar and the guided sessions
 *   sit behind "Otras formas de practicar". Guided sessions are named for the
 *   catalog groups they walk, and the daily class is the Clase size, not a
 *   second route;
 * - one selected style: every choose-one control shows its pick as a tint of
 *   its own colour, a bar along the bottom and a ✓, never a solid fill;
 * - the finishing card keeps its buttons pinned to its bottom edge, and on a
 *   short screen goes two columns, so "Hasta mañana" is on the first screen.
 *
 * Fixed clock in Lima: Wednesday 23 September 2026, 10:00.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const NOW = "2026-09-23T10:00:00-05:00";
const NBSP = " ";

test.use({ timezoneId: "America/Lima", locale: "es-PE" });

function ledger(dayKeys, bank = 1) {
  const days = {};
  dayKeys.forEach((k) => {
    days[k] = { sec: 240, n: 2, ex: ["s4-lip-trills"] };
  });
  return { v: 1, days, rest: { bank, earnedAt: 0, used: [] }, backfilled: true };
}
const RET3 = ledger(["2026-09-20", "2026-09-21", "2026-09-22"]);

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ days?: object, tab?: string, lang?: string, query?: string, doneCard?: boolean, toasts?: boolean }} opts
 */
async function boot(page, opts = {}) {
  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript(
    ({ days, tab, lang, doneCard, toasts }) => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", lang);
        sessionStorage.setItem("vt_e2e", "1");
        if (doneCard) sessionStorage.setItem("vt_loop_e2e", "1");
        if (toasts) sessionStorage.setItem("vt_debug", "1");
        if (!sessionStorage.getItem("vt_seeded")) {
          sessionStorage.setItem("vt_seeded", "1");
          if (tab) localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: tab }));
          if (days) localStorage.setItem("vt_days_v1", JSON.stringify(days));
        }
      } catch {
        /* ignore */
      }
    },
    { days: opts.days || null, tab: opts.tab || null, lang: opts.lang || "es", doneCard: !!opts.doneCard, toasts: !!opts.toasts }
  );
  await page.goto(BASE + "/" + (opts.query || ""), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && !!window.VTLoop && !!window.VTDays);
  await page.clock.runFor(500);
}

const options = (page) =>
  page.evaluate(() => [...document.querySelectorAll("#session-path option")].map((o) => [o.value, o.textContent]));

/** How a selected control draws: its tick, its bar, and whether its fill is a tint. */
const selectedLook = (page, sel, tickSel) =>
  page.evaluate(
    ([s, t]) => {
      // Read the settled look, not a frame of the tabs' colour transition.
      if (!document.getElementById("no-motion")) {
        const st = document.createElement("style");
        st.id = "no-motion";
        st.textContent = "*, *::before { transition: none !important; }";
        document.head.appendChild(st);
      }
      const el = document.querySelector(s);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const tickEl = t ? el.querySelector(t) : el;
      const tick = getComputedStyle(tickEl, "::before").content;
      // The fill's alpha, as rgba() or color(srgb … / a).
      const m = cs.backgroundColor.match(/[\d.]+(?=\s*\)$)/);
      const alpha = /\/|rgba/.test(cs.backgroundColor) && m ? Number(m[0]) : 1;
      return { tick, shadow: cs.boxShadow, image: cs.backgroundImage, alpha };
    },
    [sel, tickSel]
  );

test.describe("Naming: one button, sizes that choose, other ways folded", () => {
  test("the button names the size it starts; a size only selects", async ({ page }) => {
    await boot(page, { days: RET3, tab: "singing" });
    const cta = page.locator("#btn-next-step");
    await expect(cta.locator(".cta-go")).toHaveText("▶ Empezar básicos");
    await expect(cta.locator(".cta-size")).toHaveText(`Mínimo · 3 min`);
    await expect(cta).toHaveAccessibleName(/Empezar básicos\s+Mínimo · 3 min/);
    await expect(page.locator("#loop-tiers-label")).toHaveText("Elige el tamaño de hoy:");
    await expect(page.locator("#loop-tiers")).toHaveAttribute("aria-labelledby", "loop-tiers-label");

    const ess = page.locator('#loop-tiers [data-tier="ess"]');
    await expect(ess).toHaveAccessibleName(`Esencial 10${NBSP}min`);
    await ess.click();
    await page.clock.runFor(200);
    // Choosing starts nothing: still home, the button now says Esencial.
    await expect(page.locator("#view-home")).toHaveClass(/active/);
    await expect(ess).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('#loop-tiers [data-tier="min"]')).toHaveAttribute("aria-pressed", "false");
    await expect(cta.locator(".cta-size")).toHaveText(/^Esencial · \d+ min$/);
    await expect(page.locator("#start-title")).toContainText("Básicos esenciales");
    expect(await page.locator("#start-panel .btn-practice").count()).toBe(1);

    await cta.click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    expect(await page.evaluate(() => VTStorage.getSession().tier)).toBe("ess");
  });

  test("Otras formas de practicar opens and closes the other ways in", async ({ page }) => {
    await boot(page, { days: RET3, tab: "singing" });
    const more = page.locator("#btn-more-ways");
    await expect(more).toBeVisible();
    await expect(more).toContainText("Otras formas de practicar");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(more).toHaveAttribute("aria-controls", "start-alt");
    expect((await more.boundingBox()).height).toBeGreaterThanOrEqual(44);
    for (const id of ["#btn-continue", "#btn-structured", "#session-path"]) await expect(page.locator(id)).toBeHidden();

    // Keyboard opens it; the controls it reveals are real and reachable.
    await more.focus();
    await page.keyboard.press("Enter");
    await expect(more).toHaveAttribute("aria-expanded", "true");
    for (const id of ["#btn-continue", "#btn-structured", "#session-path"]) await expect(page.locator(id)).toBeVisible();
    await expect(page.locator(".start-path > span")).toHaveText("Sesión guiada:");
    await page.keyboard.press("Tab");
    await expect(page.locator("#btn-continue")).toBeFocused();
    // Still one primary on the panel.
    expect(await page.locator("#start-panel .btn-practice").count()).toBe(1);

    // A re-render (a size picked) keeps it open; a second press closes it.
    await page.locator('#loop-tiers [data-tier="ess"]').click();
    await page.clock.runFor(200);
    await expect(page.locator("#btn-continue")).toBeVisible();
    await more.click();
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(page.locator("#btn-continue")).toBeHidden();
  });

  test("guided sessions are named for the catalog groups, and the class is a size", async ({ page }) => {
    await boot(page, { days: RET3, tab: "singing" });
    expect(await options(page)).toEqual([
      ["basic", "Tareas de la clase (5 ejercicios)"],
      ["advanced", "Técnica (11 ejercicios)"],
      ["full", "Tareas y técnica (16 ejercicios)"]
    ]);
    // Nothing on the panel calls a route "Básica" beside "Empezar básicos",
    // and the class has one name: the Clase size.
    await page.locator("#btn-more-ways").click();
    const text = await page.locator("#start-panel").innerText();
    expect(text).not.toMatch(/Básica|Avanzada|Completa|Diaria|Ruta/);
    await expect(page.locator('#loop-tiers [data-tier="class"]')).toContainText("Clase");

    await page.locator('.tab[data-tab="vocal"]').click();
    await page.clock.runFor(200);
    expect(await options(page)).toEqual([
      ["basic", "Tareas de la clase (9 ejercicios)"],
      ["advanced", "Expresión (11 ejercicios)"],
      ["full", "Tareas y expresión (20 ejercicios)"]
    ]);

    // The stored route stays English; the banner uses the same name.
    await page.selectOption("#session-path", "advanced");
    await page.locator("#btn-structured").click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    expect(await page.evaluate(() => VTStorage.getSession().path)).toBe("advanced");
    await expect(page.locator("#session-banner-text")).toContainText("Expresión");
  });

  test("English reads in its own words", async ({ page }) => {
    await boot(page, { days: RET3, tab: "singing", lang: "en" });
    await expect(page.locator("#btn-next-step .cta-go")).toHaveText("▶ Start the basics");
    await expect(page.locator("#btn-next-step .cta-size")).toHaveText("Minimum · 3 min");
    await expect(page.locator("#loop-tiers-label")).toHaveText("Pick today’s size:");
    await expect(page.locator("#btn-more-ways")).toContainText("Other ways to practise");
    expect(await options(page)).toEqual([
      ["basic", "Class homework (5 exercises)"],
      ["advanced", "Technique (11 exercises)"],
      ["full", "Homework and technique (16 exercises)"]
    ]);
    await page.locator("#btn-more-ways").click();
    await expect(page.locator(".start-path > span")).toHaveText("Guided session:");
    await expect(page.locator("#btn-structured")).toHaveText("Start guided session");
    // Switching language keeps the panel as it is, in the other language.
    await page.locator("#btn-lang").click();
    await expect(page.locator("#btn-more-ways")).toContainText("Otras formas de practicar");
    await expect(page.locator("#btn-continue")).toBeVisible();
    expect((await options(page))[1]).toEqual(["advanced", "Técnica (11 ejercicios)"]);
  });

  test("a first visit shows no other ways in", async ({ page }) => {
    await boot(page, { tab: "singing" });
    await expect(page.locator("#more-ways")).toBeHidden();
    await expect(page.locator("#btn-more-ways")).toBeHidden();
  });

  test("the classic arm keeps its row open, with the daily route", async ({ page }) => {
    await boot(page, { days: RET3, tab: "singing", query: "?ab_loop_home_2026_10=classic" });
    await expect(page.locator("#btn-more-ways")).toBeHidden();
    await expect(page.locator("#btn-continue")).toBeVisible();
    await expect(page.locator("#session-path")).toBeVisible();
    expect((await options(page)).map((o) => o[0])).toEqual(["basic", "advanced", "full", "daily"]);
  });

  test("the tour's guided-session step points at the toggle", async ({ page }) => {
    await boot(page, { days: RET3, tab: "singing" });
    await page.evaluate(() => window.VTTour.start(true));
    const titles = [];
    for (let i = 0; i < 6; i += 1) {
      await page.clock.runFor(400);
      const s = await page.evaluate(() => {
        const hl = document.querySelector(".tour-highlight")?.getBoundingClientRect();
        const t = document.querySelector("#btn-more-ways").getBoundingClientRect();
        return {
          title: document.querySelector("[data-tour-title]").textContent,
          covers: !!hl && hl.left <= t.left + 1 && hl.right >= t.right - 1 && hl.top <= t.top + 1 && hl.bottom >= t.bottom - 1
        };
      });
      titles.push(s);
      const next = page.locator("[data-tour-next]");
      if (/Listo|Done/.test((await next.textContent()) || "")) break;
      await next.click();
    }
    const step = titles.find((x) => /deja que te guiemos/.test(x.title));
    expect(step, JSON.stringify(titles)).toBeTruthy();
    expect(step.covers).toBe(true);
  });
});

test.describe("Selected style: tint, bar and tick", () => {
  test("every choose-one control on home shows its pick the same way", async ({ page }) => {
    await boot(page, { days: RET3, tab: "singing" });
    const looks = {
      size: await selectedLook(page, '.loop-tier[aria-pressed="true"]', ".loop-tier-name"),
      track: await selectedLook(page, ".track-tab.active", ".track-label-short"),
      filter: await selectedLook(page, '.tier-chip[aria-pressed="true"]')
    };
    for (const [name, l] of Object.entries(looks)) {
      expect(l, name).not.toBeNull();
      expect(l.tick, `${name}: a tick, not colour alone`).toContain("✓");
      expect(l.shadow, `${name}: a bar along the bottom`).toMatch(/inset/);
      expect(l.shadow, `${name}: 3px`).toMatch(/0px -3px 0px/);
      expect(l.image, `${name}: no gradient fill`).toBe("none");
      expect(l.alpha, `${name}: a tint, not a solid fill`).toBeLessThan(0.3);
    }
    // The filters say which one is picked in their state too.
    await expect(page.locator('.tier-chip[data-tier="all"]')).toHaveAttribute("aria-pressed", "true");
    await page.locator('.tier-chip[data-tier="advanced"]').click();
    await expect(page.locator('.tier-chip[data-tier="advanced"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('.tier-chip[data-tier="all"]')).toHaveAttribute("aria-pressed", "false");
    // The tick is drawn, not read out twice: the label stays the group's name.
    await expect(page.locator('.tier-chip[data-tier="advanced"]')).toHaveText("Técnica");
  });

  test("the first-visit chooser and the plan's focus use it too", async ({ page }) => {
    await boot(page, { tab: "singing" });
    const pick = await selectedLook(page, '.track-pick-btn[aria-pressed="true"]', ".track-pick-name");
    expect(pick.tick).toContain("✓");
    expect(pick.shadow).toMatch(/inset/);
    expect(pick.alpha).toBeLessThan(0.3);

    await page.locator("#btn-plan").click();
    await expect(page.locator("#view-plan")).toHaveClass(/active/);
    await page.locator("#element-chips .chip:visible").first().click();
    const plan = await selectedLook(page, '#element-chips .chip[aria-pressed="true"]');
    expect(plan.tick).toContain("✓");
    expect(plan.shadow).toMatch(/inset/);
    expect(plan.alpha).toBeLessThan(0.3);
  });

  for (const width of [320, 360, 390]) {
    test(`sizes are one joined row at ${width}px, in both languages`, async ({ page }) => {
      await page.setViewportSize({ width, height: 740 });
      for (const lang of ["es", "en"]) {
        await boot(page, { days: RET3, tab: "singing", lang });
        for (const tier of ["min", "ess", "class"]) {
          await page.locator(`#loop-tiers [data-tier="${tier}"]`).click();
          await page.clock.runFor(150);
          const g = await page.evaluate(() =>
            [...document.querySelectorAll(".loop-tier")].map((b) => {
              const r = b.getBoundingClientRect();
              const n = b.querySelector(".loop-tier-name").getBoundingClientRect();
              return { top: r.top, left: r.left, right: r.right, h: r.height, nl: n.left, nr: n.right, font: parseFloat(getComputedStyle(b.querySelector(".loop-tier-min")).fontSize) };
            })
          );
          for (let i = 0; i < g.length; i += 1) {
            expect(Math.abs(g[i].top - g[0].top), `${lang} ${tier}: one row`).toBeLessThan(1);
            expect(g[i].h, "a 44px target").toBeGreaterThanOrEqual(44);
            expect(g[i].font, "12px floor").toBeGreaterThanOrEqual(12);
            expect(g[i].nl, `${lang} ${tier}: name inside its segment`).toBeGreaterThanOrEqual(g[i].left);
            expect(g[i].nr, `${lang} ${tier}: name inside its segment`).toBeLessThanOrEqual(g[i].right);
            if (i) expect(Math.abs(g[i].left - g[i - 1].right), "joined").toBeLessThanOrEqual(1);
          }
          expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
        }
      }
    });
  }
});

test.describe("Finishing card: buttons pinned, two columns when short", () => {
  const LOOP = { v: 1, seed: "a1", tier: "min", goal: "3-5", ms: [1, 3], cards: { c03: "2026-09-23" }, surprises: [], since: 0, comebacks: [], completions: 7 };
  const SEVEN = ledger(["2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22", "2026-09-23"]);

  async function openDone(page, vp) {
    await page.setViewportSize(vp);
    await page.addInitScript((l) => {
      if (!sessionStorage.getItem("vt_loop_seeded")) {
        sessionStorage.setItem("vt_loop_seeded", "1");
        localStorage.setItem("vt_loop_v1", JSON.stringify(l));
      }
    }, LOOP);
    await boot(page, { days: SEVEN, tab: "singing", doneCard: true, toasts: true });
    // A toast left by the last step (a hold logged) is showing when the card opens.
    await page.evaluate(() => document.getElementById("toast").classList.add("show"));
    await page.evaluate(() =>
      VTLoop.showDone({ sum: VTDays.summary(), tier: "min", track: "singing", surprise: { kind: "card", id: "c03" }, ms: 7, comeback: false, first: false })
    );
    await page.clock.runFor(600);
    return page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      return {
        vw: innerWidth,
        vh: innerHeight,
        card: r(".loop-done-card"),
        earned: r(".loop-done-earned"),
        next: r(".loop-done-next"),
        close: r("#loop-done-close"),
        remind: r("#loop-done-remind"),
        toast: document.getElementById("toast").classList.contains("show")
      };
    });
  }

  const onScreen = (b, g) => b.top >= 0 && b.bottom <= g.vh && b.left >= 0 && b.right <= g.vw;

  test("844x390: two columns and both buttons on the first screen", async ({ page }) => {
    const g = await openDone(page, { width: 844, height: 390 });
    await expect(page.locator("#loop-done")).toBeVisible();
    expect(onScreen(g.close, g), JSON.stringify(g.close)).toBe(true);
    expect(onScreen(g.remind, g), JSON.stringify(g.remind)).toBe(true);
    expect(g.close.bottom).toBeLessThanOrEqual(g.card.bottom);
    // What today earned on the left, what is new and tomorrow on the right.
    expect(g.next.left).toBeGreaterThanOrEqual(g.earned.right);
    expect(Math.abs(g.next.top - g.earned.top)).toBeLessThan(4);
    // Both buttons in one row across the card.
    expect(Math.abs(g.close.top - g.remind.top)).toBeLessThan(2);
    // The toast no longer sits on the card's top line.
    expect(g.toast).toBe(false);
    // Ids the loop writes to are all in the card, and it closes as before.
    for (const id of ["#loop-done-kicker", "#loop-done-title", "#loop-done-count", "#loop-done-week", "#loop-done-line", "#loop-done-extra", "#loop-done-tomorrow"]) {
      await expect(page.locator(`.loop-done-card ${id}`)).toHaveCount(1);
    }
    await expect(page.locator("#loop-done-close")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#loop-done")).toBeHidden();
  });

  test("390x844 keeps one column", async ({ page }) => {
    const g = await openDone(page, { width: 390, height: 844 });
    expect(g.next.top).toBeGreaterThanOrEqual(g.earned.bottom - 1);
    expect(onScreen(g.close, g)).toBe(true);
    expect(onScreen(g.remind, g)).toBe(true);
  });

  for (const vp of [{ width: 360, height: 740 }, { width: 320, height: 640 }]) {
    test(`${vp.width}x${vp.height}: the buttons stay on screen while the card scrolls`, async ({ page }) => {
      const g = await openDone(page, vp);
      expect(onScreen(g.close, g), JSON.stringify(g)).toBe(true);
      expect(onScreen(g.remind, g), JSON.stringify(g)).toBe(true);
      expect(g.close.height).toBeGreaterThanOrEqual(44);
    });
  }
});
