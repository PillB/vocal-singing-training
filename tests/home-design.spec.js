/**
 * Home designs chosen in the side-by-side test (docs/37-DAILY-LOOP.md):
 *
 * - first visit: "¿Qué quieres entrenar?" with Cantar / Hablar, then that
 *   track's Mínimo and one button that starts it;
 * - today's basics say it once: kicker, headline, button;
 * - on a phone the practice record is a compact strip that still lets you
 *   change the weekly goal;
 * - on a phone the header is one row, with Pro, Cuenta, idioma and Tour
 *   behind "Más".
 *
 * Fixed clock in Lima: Wednesday 23 September 2026, 10:00; the week starts Monday 21.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const NOW = "2026-09-23T10:00:00-05:00";
const NBSP = "\u00a0";

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
 * @param {{ days?: object, tab?: string, lang?: string, query?: string, tour?: boolean }} opts
 *   tab: omit to keep the track a browser that has never been here gets
 */
async function boot(page, opts = {}) {
  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript(
    ({ days, tab, lang, tour }) => {
      try {
        if (!tour) localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", lang);
        sessionStorage.setItem("vt_e2e", "1");
        if (!sessionStorage.getItem("vt_seeded")) {
          sessionStorage.setItem("vt_seeded", "1");
          if (tab) localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: tab }));
          if (days) localStorage.setItem("vt_days_v1", JSON.stringify(days));
        }
      } catch {
        /* ignore */
      }
    },
    { days: opts.days || null, tab: opts.tab || null, lang: opts.lang || "es", tour: !!opts.tour }
  );
  await page.goto(BASE + "/" + (opts.query || ""), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && !!window.VTLoop && !!window.VTDays);
  await page.clock.runFor(500);
}

const pressed = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("#track-pick [data-track]")].map((b) => [b.dataset.track, b.getAttribute("aria-pressed")])
  );

/** The explainer steps that are drawn. Their numbers come from a CSS counter,
 *  which skips a hidden step, so what is drawn is numbered 1, 2, ... */
const visibleSteps = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("#start-steps li")]
      .filter((li) => getComputedStyle(li).display !== "none")
      .map((li) => ({
        text: li.querySelector("strong").textContent.trim(),
        counted: getComputedStyle(li).counterIncrement,
        n: getComputedStyle(li.querySelector(".start-step-n"), "::before").content
      }))
  );

test.describe("First visit: what to train, then the Mínimo", () => {
  test("the chooser switches the routine and Empezar starts the Mínimo", async ({ page }) => {
    // Tour not taken yet, so the panel also carries its offer.
    await boot(page, { tour: true });
    const pick = page.locator("#track-pick");
    await expect(pick).toBeVisible();
    await expect(page.locator("#track-pick-q")).toHaveText("¿Qué quieres entrenar?");
    await expect(page.locator("#start-title")).toHaveText(`Empieza con 3${NBSP}minutos. Mañana, los mismos 3.`);
    // The site's default track is unchanged: a new browser starts on Vocal.
    expect(await pressed(page)).toEqual([
      ["singing", "false"],
      ["vocal", "true"]
    ]);
    await expect(page.locator("#next-step-label")).toHaveText(`Tus básicos · 3${NBSP}min`);
    await expect(page.locator("#next-step-title")).toHaveText(/^Trinos de labios 1:15 → dicción 1:45$/);
    // Vocal's Mínimo ends on diction, which reads a page aloud: the card says so.
    await expect(page.locator("#next-step-why")).toContainText(/texto corto/);
    await expect(page.locator("#btn-next-step")).toHaveText(`▶ Empezar (3${NBSP}min)`);

    // One question, one button: the other ways in, the intro line and the
    // explainer's "pick an exercise" step are gone; the tour is two quiet links.
    await expect(page.locator(".start-alt")).toBeHidden();
    await expect(page.locator("#start-sub")).toBeHidden();
    expect(await page.locator("#start-panel .btn-practice").count()).toBe(1);
    await expect(page.locator("#start-steps li").first()).toBeHidden();
    const steps = await visibleSteps(page);
    expect(steps.map((x) => x.text)).toEqual(["Practica con el micrófono", "Guarda y revisa"]);
    for (const x of steps) {
      expect(x.counted).toMatch(/start-step/);
      expect(x.n).toBe("counter(start-step)");
    }
    await expect(page.locator("[data-tour-invite-start]")).toBeVisible();
    await expect(page.locator("[data-tour-invite-guide]")).toBeVisible();
    await expect(page.locator("[data-tour-invite-dismiss]")).toBeHidden();
    // The loop's own chrome waits for a day sung.
    await expect(page.locator("#loop-tiers")).toBeHidden();
    await expect(page.locator("#loop-today")).toBeHidden();

    await page.locator('#track-pick [data-track="singing"]').click();
    await page.clock.runFor(200);
    expect(await pressed(page)).toEqual([
      ["singing", "true"],
      ["vocal", "false"]
    ]);
    await expect(page.locator("#next-step-title")).toHaveText(/^Trinos de labios 1:30 → solfeo en trino 1:30$/);
    await expect(page.locator("#next-step-why")).toHaveText("Sin libro ni partitura: solo tu voz y el micrófono.");
    // The choice is the track: the catalog, which keeps its own switch, follows it.
    await expect(page.locator("#catalog-panel #track-switch")).toBeAttached();
    await expect(page.locator("#tab-singing")).toHaveAttribute("aria-selected", "true");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("vt_settings_v1")).lastTab)).toBe("singing");

    await page.locator("#btn-next-step").click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    const started = await page.evaluate(() => {
      const s = VTStorage.getSession();
      return { path: s.path, tier: s.tier, order: s.order, open: VTApp.getState().exercise?.id };
    });
    expect(started).toEqual({
      path: "basics",
      tier: "min",
      order: ["s4-lip-trills", "s27-lip-trill-solfege"],
      open: "s4-lip-trills"
    });
    await expect(page.locator("#session-banner-text")).toContainText(/Mínimo/);
  });

  test("the choice is a keyboard control that says which one is chosen", async ({ page }) => {
    await boot(page);
    const sing = page.locator('#track-pick [data-track="singing"]');
    await sing.focus();
    await page.keyboard.press("Enter");
    await page.clock.runFor(200);
    await expect(sing).toHaveAttribute("aria-pressed", "true");
    await expect(sing).toBeFocused();
    // Chosen is a tick, not a colour alone.
    const mark = await sing.evaluate((b) => getComputedStyle(b.querySelector(".track-pick-name"), "::before").content);
    expect(mark).toContain("✓");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Space");
    await page.clock.runFor(200);
    await expect(page.locator('#track-pick [data-track="vocal"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#next-step-title")).toContainText("dicción");
  });

  test("English reads in its own words", async ({ page }) => {
    await boot(page, { lang: "en", tab: "singing" });
    await expect(page.locator("#track-pick-q")).toHaveText("What do you want to train?");
    await expect(page.locator("#start-title")).toHaveText(`Start with 3${NBSP}minutes. Tomorrow, the same 3.`);
    await expect(page.locator("#next-step-title")).toHaveText(/^Lip trills 1:30 → trill solfège 1:30$/);
    await expect(page.locator("#next-step-why")).toHaveText("No book or sheet music: just your voice and the mic.");
    await expect(page.locator("#btn-next-step")).toHaveText(`▶ Start (3${NBSP}min)`);
    const text = await page.locator("#start-panel").innerText();
    expect(text).not.toMatch(/Empieza|Cantar|Hablar|Tus básicos|minutos/);
  });

  test("the tour's second step talks about the choice, not a changing exercise", async ({ page }) => {
    await boot(page, { tour: true });
    await page.locator("[data-tour-invite-start]").click();
    await expect(page.locator(".tour-card")).toBeVisible();
    await page.locator("[data-tour-next]").click();
    await expect(page.locator("[data-tour-title]")).toHaveText("Tus básicos de cada día");
    await expect(page.locator("[data-tour-body]")).toContainText("Cantar o Hablar");
    // The step about the other ways in is skipped: they are not on screen.
    const texts = [];
    for (let i = 0; i < 6; i++) {
      texts.push(await page.locator("[data-tour-title]").textContent());
      const next = page.locator("[data-tour-next]");
      if (/Listo|Done/.test((await next.textContent()) || "")) break;
      await next.click();
    }
    expect(texts.join(" | ")).not.toMatch(/deja que te guiemos/);
  });

  test("the classic arm keeps the old first visit", async ({ page }) => {
    await boot(page, { query: "?ab_loop_home_2026_10=classic" });
    await expect(page.locator("#track-pick")).toBeHidden();
    await expect(page.locator(".start-alt")).toBeVisible();
    await expect(page.locator("#start-title")).toHaveText(/Tu primera práctica/);
    expect(await page.evaluate(() => document.body.classList.contains("loop-first"))).toBe(false);
  });
});

test.describe("Today's basics: headline and button", () => {
  test("go, sang and back show the kicker, the headline and the button only", async ({ page }) => {
    await boot(page, { days: RET3, tab: "singing" });
    await expect(page.locator("#next-step-card")).toHaveAttribute("data-loop", "go");
    await expect(page.locator("#start-kicker")).toBeVisible();
    // A number and its unit stay together on a narrow screen.
    await expect(page.locator("#start-title")).toHaveText(`Trinos y solfeo en trino, 3${NBSP}minutos`);
    await expect(page.locator("#btn-next-step")).toBeVisible();
    await expect(page.locator("#start-sub")).toBeHidden();
    await expect(page.locator("#next-step-card .next-step-body")).toBeHidden();
    const box = await page.locator("#next-step-card").evaluate((c) => {
      const cs = getComputedStyle(c);
      return { border: cs.borderTopWidth, bg: cs.backgroundColor };
    });
    expect(box.border).toBe("0px");
    expect(box.bg).toBe("rgba(0, 0, 0, 0)");
    // With a day sung the other ways in are back, one tap away behind "Otras
    // formas de practicar" (tests/home-choices.spec.js has the rest).
    await expect(page.locator("#btn-continue")).toBeHidden();
    await page.locator("#btn-more-ways").click();
    await expect(page.locator("#btn-continue")).toBeVisible();
    await expect(page.locator("#btn-structured")).toBeVisible();

    // A comeback: the same shape.
    await page.evaluate(() => {
      localStorage.setItem(
        "vt_days_v1",
        JSON.stringify({ v: 1, days: { "2026-09-15": { sec: 200, n: 1 }, "2026-09-16": { sec: 200, n: 1 } }, rest: { bank: 0, earnedAt: 0, used: [] }, backfilled: true })
      );
      VTApp.refreshStartPanel();
    });
    await expect(page.locator("#next-step-card")).toHaveAttribute("data-loop", "back");
    await expect(page.locator("#start-sub")).toBeHidden();
    await expect(page.locator("#next-step-card .next-step-body")).toBeHidden();
  });

  test("a rest day spent is still said, and only that", async ({ page }) => {
    await boot(page, {
      days: ledger(["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21"], 1),
      tab: "singing"
    });
    const sub = page.locator("#start-sub");
    await expect(sub).toBeVisible();
    await expect(sub).toHaveText("Usamos un día de descanso y tu racha sigue en 7.");
  });

  test("done for today keeps its card", async ({ page }) => {
    await boot(page, { days: RET3, tab: "singing" });
    await page.evaluate(() => {
      const bag = JSON.parse(localStorage.getItem("vt_days_v1"));
      bag.days["2026-09-23"] = { sec: 180, n: 2, ex: ["s4-lip-trills", "s27-lip-trill-solfege"], basics: 1 };
      localStorage.setItem("vt_days_v1", JSON.stringify(bag));
      VTApp.refreshStartPanel();
    });
    await expect(page.locator("#next-step-card")).toHaveAttribute("data-loop", "done");
    await expect(page.locator("#next-step-card .next-step-body")).toBeVisible();
    await expect(page.locator("#start-sub")).toBeVisible();
  });
});

test.describe("Phone: the practice record as a strip", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("count beside this week's ticks, and the goal can still be changed", async ({ page }) => {
    await boot(page, { days: RET3, tab: "singing" });
    await expect(page.locator("#loop-today")).toBeVisible();
    await expect(page.locator("#loop-next-ms")).toBeHidden();
    // The ticks are captioned as this week, beside the lifetime count.
    await expect(page.locator("#loop-week-k")).toBeVisible();
    await expect(page.locator("#loop-week-k")).toHaveText("Esta semana");
    const g = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const label = document.querySelector("#loop-days-label");
      return {
        count: r(".loop-count"),
        week: r("#loop-week"),
        labelLines: Math.round(label.getBoundingClientRect().height / parseFloat(getComputedStyle(label).lineHeight || "16")),
        labelH: label.getBoundingClientRect().height,
        fontPx: parseFloat(getComputedStyle(label).fontSize),
        strip: r("#loop-today").height,
        overflow: document.documentElement.scrollWidth - innerWidth
      };
    });
    expect(g.week.left, "the week sits to the right of the count").toBeGreaterThanOrEqual(g.count.right);
    expect(Math.abs(g.week.top - g.count.top), "on the same row").toBeLessThan(40);
    // "días cantados" on one line, not squeezed onto two.
    expect(g.labelH).toBeLessThan(g.fontPx * 2);
    expect(g.strip).toBeLessThan(260);
    expect(g.overflow).toBeLessThanOrEqual(0);

    const sel = page.locator("#loop-goal-sel");
    await expect(sel).toBeVisible();
    // min-height is 44px; the box comes back as 43.99997 at some scroll
    // offsets (float rounding), so allow a hundredth of a pixel.
    expect((await sel.boundingBox()).height).toBeGreaterThanOrEqual(43.99);
    await sel.selectOption("5-7");
    await page.clock.runFor(200);
    await expect(page.locator("#loop-goal-text")).toContainText("5–7");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("vt_loop_v1")).goal)).toBe("5-7");
  });
});

test.describe("Phone: one-row header with Más", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("one row; the menu opens and closes by keyboard and pointer", async ({ page }) => {
    await boot(page, { days: RET3, tab: "singing" });
    const more = page.locator("#btn-more");
    const menu = page.locator("#header-utils");
    await expect(more).toBeVisible();
    await expect(more).toContainText("Más");
    await expect(more).toContainText("▾");
    await expect(more).toHaveAttribute("aria-controls", "header-utils");
    await expect(page.locator("#btn-pricing")).toBeHidden();
    const hdr = await page.evaluate(() => ({
      h: document.querySelector(".app-header").getBoundingClientRect().height,
      v: parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--header-h"))
    }));
    expect(hdr.h).toBeLessThanOrEqual(70);
    // The header-height variable follows the smaller header.
    expect(Math.abs(hdr.v - Math.ceil(hdr.h))).toBeLessThanOrEqual(1);
    // The mark stands in for the name and carries it.
    await expect(page.locator(".app-header .brand-mark")).toHaveAccessibleName("Entrenamiento vocal y de canto");

    // Keyboard: open, walk in, Escape closes and hands focus back.
    await more.focus();
    await page.keyboard.press("Enter");
    await expect(more).toHaveAttribute("aria-expanded", "true");
    await expect(menu).toBeVisible();
    for (const id of ["#btn-pricing", "#btn-account", "#btn-lang", "#btn-tour"]) {
      const b = page.locator(id);
      await expect(b).toBeVisible();
      expect((await b.boundingBox()).height, `${id} is a 44px target`).toBeGreaterThanOrEqual(44);
    }
    await page.keyboard.press("Tab");
    await expect(page.locator("#btn-pricing")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(more).toHaveAttribute("aria-expanded", "false");
    await expect(menu).toBeHidden();
    await expect(more).toBeFocused();

    // Pointer: a tap outside closes it.
    await more.click();
    await expect(menu).toBeVisible();
    await page.locator("#start-title").click();
    await expect(menu).toBeHidden();
    await expect(more).toHaveAttribute("aria-expanded", "false");
  });

  test("the moved buttons still work, and the menu closes after each", async ({ page }) => {
    await boot(page, { days: RET3, tab: "singing" });
    const more = page.locator("#btn-more");

    // Language, from the keyboard.
    await more.focus();
    await page.keyboard.press("Enter");
    await page.locator("#btn-lang").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("#header-utils")).toBeHidden();
    await expect(more).toContainText("More");
    await expect(more).toBeFocused();

    // Account: the dialog opens, and closing it returns focus to a button on screen.
    await more.click();
    await page.locator("#btn-account").click();
    await expect(page.locator("#account-modal")).toBeVisible();
    await expect(page.locator("#header-utils")).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.locator("#account-modal")).toBeHidden();
    await expect(more).toBeFocused();

    // Pro.
    await more.click();
    await page.locator("#btn-pricing").click();
    await expect(page.locator("#pricing-modal")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#pricing-modal")).toBeHidden();

    // Tour.
    await more.click();
    await page.locator("#btn-tour").click();
    await expect(page.locator(".tour-card")).toBeVisible();
  });

  test("the exercise view and a wide screen keep today's header", async ({ page }) => {
    await boot(page, { days: RET3, tab: "singing" });
    await page.evaluate(() => VTApp.openExercise("s4-lip-trills"));
    await page.clock.runFor(500);
    await expect(page.locator("#btn-more")).toBeHidden();
    await expect(page.locator("#btn-pricing")).toBeVisible();
    await page.evaluate(() => VTApp.setView("home"));
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.clock.runFor(300);
    await expect(page.locator("#btn-more")).toBeHidden();
    await expect(page.locator("#btn-pricing")).toBeVisible();
    await expect(page.locator("#btn-lang")).toBeVisible();
  });

  test("at 320 and 360 the row fits and stays pinned", async ({ page }) => {
    await boot(page, { days: RET3, tab: "singing" });
    for (const width of [320, 360]) {
      await page.setViewportSize({ width, height: 700 });
      await page.clock.runFor(300);
      const g = await page.evaluate(() => {
        const nav = document.querySelector("#header-nav").getBoundingClientRect();
        const more = document.querySelector("#btn-more").getBoundingClientRect();
        window.scrollTo(0, 900);
        return {
          overlap: nav.right - more.left,
          right: more.right,
          overflow: document.documentElement.scrollWidth - innerWidth
        };
      });
      expect(g.overlap, `${width}: sections and Más do not overlap`).toBeLessThanOrEqual(0);
      expect(g.right).toBeLessThanOrEqual(width);
      expect(g.overflow).toBeLessThanOrEqual(0);
      await page.clock.runFor(200);
      const top = await page.evaluate(() => document.querySelector(".app-header").getBoundingClientRect().top);
      expect(top, `${width}: the header stays at the top`).toBe(0);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
  });
});
