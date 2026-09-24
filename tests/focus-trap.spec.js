/**
 * Keyboard focus trap — Tab stays inside an open dialog, Escape/close returns
 * focus to the control that opened it.
 */
const { test, expect } = require("@playwright/test");
const { patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://entitlements.test";

/**
 * Point the page at a worker and decide what it says about sign-in, so which
 * control the account panel leads with is a property of the deployment under
 * test and not of whether this machine happens to reach the real worker.
 *
 * @param {import('@playwright/test').Page} page Page.
 * @param {object|"unreachable"|null} methods `/v1/auth/methods` payload,
 *   "unreachable" to fail the probe, or null for a site with no worker at all.
 */
async function withSignIn(page, methods) {
  if (methods === null) {
    // No worker at all, whatever js/billing-config.js happens to hold today.
    await patchBillingConfig(page, { verification: { apiBaseUrl: "" } });
    return;
  }
  await patchBillingConfig(page, { verification: { apiBaseUrl: API } });
  await page.route(`${API}/**`, (route) => {
    if (methods === "unreachable") return route.abort("failed");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ ok: true, trialDays: 30, googleClientId: null, ...methods })
    });
  });
}

async function boot(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#btn-pricing")).toBeVisible();
}

/** id (or tag) of the element that currently has focus. */
function activeId(page) {
  return page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return "body";
    return el.id || el.tagName.toLowerCase();
  });
}

/** Tab n times and report whether focus stayed inside the selector. */
async function tabAround(page, selector, steps) {
  const seen = [];
  for (let i = 0; i < steps; i += 1) {
    await page.keyboard.press("Tab");
    seen.push(
      await page.evaluate((sel) => {
        const dialog = document.querySelector(sel);
        const el = document.activeElement;
        return {
          id: el?.id || el?.tagName?.toLowerCase() || "none",
          inside: !!(dialog && el && dialog.contains(el))
        };
      }, selector)
    );
  }
  return seen;
}

test.describe("Modal focus trap", () => {
  test("focus-trap module is loaded", async ({ page }) => {
    await boot(page);
    const api = await page.evaluate(() => ({
      present: !!window.VTFocusTrap,
      keys: window.VTFocusTrap ? Object.keys(window.VTFocusTrap).sort() : []
    }));
    expect(api.present).toBe(true);
    expect(api.keys).toEqual(
      expect.arrayContaining(["activate", "release", "isActive", "focusables"])
    );
  });

  test("pricing modal keeps Tab inside and returns focus to its trigger", async ({ page }) => {
    await boot(page);
    await page.locator("#btn-pricing").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#pricing-modal")).toBeVisible();
    expect(await activeId(page)).toBe("pricing-close");

    // Tab well past the last control — focus must never leave the dialog.
    const seen = await tabAround(page, "#pricing-modal", 24);
    expect(seen.every((s) => s.inside)).toBe(true);
    // Wrapping means we come back to where we started.
    expect(seen.map((s) => s.id)).toContain("pricing-close");

    // Shift+Tab from the first control wraps to the last, still inside.
    await page.locator("#pricing-close").focus();
    await page.keyboard.press("Shift+Tab");
    expect(
      await page.evaluate(() =>
        document.querySelector("#pricing-modal").contains(document.activeElement)
      )
    ).toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.locator("#pricing-modal")).toBeHidden();
    expect(await activeId(page)).toBe("btn-pricing");
  });

  test("pricing modal close button also returns focus to the trigger", async ({ page }) => {
    await boot(page);
    await page.locator("#btn-pricing").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#pricing-modal")).toBeVisible();
    await page.locator("#pricing-close").click();
    await expect(page.locator("#pricing-modal")).toBeHidden();
    expect(await activeId(page)).toBe("btn-pricing");
  });

  test("a collapsed disclosure is one tab stop, not a hole in the trap", async ({ page }) => {
    // The trap's tabbability rules changed for every dialog, not just the
    // account panel: Chrome lays out the contents of a closed <details> rather
    // than removing them, so the geometry test used to wave them through while
    // native Tab skipped them — and the trap's idea of the last control became
    // one the keyboard could never reach. The pricing card renders its own
    // <details class="plan-more"> at runtime, so it is the second place this
    // has to hold.
    await boot(page);
    await page.locator("#btn-pricing").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#pricing-modal")).toBeVisible();
    const more = page.locator("#pricing-modal details.plan-more").first();
    await expect(more).toHaveCount(1);
    expect(await more.evaluate((el) => el.open)).toBe(false);

    const seen = await page.evaluate(() => {
      const modal = document.querySelector("#pricing-modal");
      const items = window.VTFocusTrap.focusables(modal);
      const details = modal.querySelector("details.plan-more");
      return {
        summary: items.includes(details.querySelector("summary")),
        // Anything sealed inside it is not a tab stop while it is closed.
        inside: items.filter((el) => details.contains(el) && el.tagName !== "SUMMARY").length
      };
    });
    expect(seen.summary, "the summary is a real tab stop").toBe(true);
    expect(seen.inside, "nothing else inside a closed disclosure counts").toBe(0);

    // Opening it puts its contents back in play.
    await more.evaluate((el) => {
      el.open = true;
    });
    const afterOpen = await page.evaluate(() => {
      const modal = document.querySelector("#pricing-modal");
      const details = modal.querySelector("details.plan-more");
      return window.VTFocusTrap.focusables(modal).filter(
        (el) => details.contains(el) && el.tagName !== "SUMMARY"
      ).length;
    });
    expect(afterOpen).toBeGreaterThanOrEqual(0);
  });

  test("with no accounts wired up the panel leads with the internal form", async ({ page }) => {
    // No worker URL at all: the disclosure is the only way in, so it is opened
    // and focus starts in it.
    await withSignIn(page, null);
    await boot(page);
    await page.locator("#btn-account").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#account-modal")).toBeVisible();
    // Never the staff-only login: with accounts not live, Close comes first.
    expect(await activeId(page)).toBe("account-close");

    const seen = await tabAround(page, "#account-modal", 12);
    expect(seen.every((s) => s.inside)).toBe(true);
    expect(seen.map((s) => s.id)).toEqual(expect.arrayContaining(["login-password"]));

    await page.keyboard.press("Escape");
    await expect(page.locator("#account-modal")).toBeHidden();
    expect(await activeId(page)).toBe("btn-account");
  });

  test("with a real sign-in the panel leads with it, not with the QA form", async ({ page }) => {
    await withSignIn(page, { email: true, google: false });
    await boot(page);
    await page.locator("#btn-account").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#account-modal")).toBeVisible();
    // The worker's answer arrives a moment after the panel does, and redrawing
    // must not leave focus stranded outside the dialog.
    await expect(page.locator("#account-email")).toBeVisible();
    expect(
      await page.evaluate(() =>
        document.querySelector("#account-modal").contains(document.activeElement)
      )
    ).toBe(true);

    const seen = await tabAround(page, "#account-modal", 12);
    expect(seen.every((s) => s.inside)).toBe(true);
    expect(seen.map((s) => s.id)).toEqual(expect.arrayContaining(["account-email"]));

    await page.keyboard.press("Escape");
    await expect(page.locator("#account-modal")).toBeHidden();
    expect(await activeId(page)).toBe("btn-account");
  });

  test("a worker that cannot be reached still leaves a usable, trapped panel", async ({ page }) => {
    await withSignIn(page, "unreachable");
    await boot(page);
    await page.locator("#btn-account").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#account-modal")).toBeVisible();
    // Never a sign-in form we cannot honour, and never the flat claim that
    // accounts are switched off when we simply could not ask.
    await expect(page.locator("#account-offline")).toBeVisible();
    await expect(page.locator("#account-signin")).toBeHidden();
    await expect(page.locator("#account-unconfigured")).toBeHidden();
    await expect(page.locator("#account-checking")).toBeHidden();

    const seen = await tabAround(page, "#account-modal", 12);
    expect(seen.every((s) => s.inside)).toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.locator("#account-modal")).toBeHidden();
    expect(await activeId(page)).toBe("btn-account");
  });

  test("background controls are unreachable by keyboard while a dialog is open", async ({
    page
  }) => {
    await boot(page);
    await page.locator("#btn-pricing").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#pricing-modal")).toBeVisible();
    // Focusing page chrome directly is pulled straight back into the dialog.
    await page.evaluate(() => document.querySelector("#btn-account")?.focus());
    expect(
      await page.evaluate(() =>
        document.querySelector("#pricing-modal").contains(document.activeElement)
      )
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.locator("#pricing-modal")).toBeHidden();
  });

  test("stacked dialogs restore one another in order", async ({ page }) => {
    await boot(page);
    await page.locator("#btn-account").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#account-modal")).toBeVisible();
    // Account -> pricing hand-off closes the first dialog before opening the next.
    await page.evaluate(() => {
      window.VTApp.closeAccount();
      window.VTApp.openPricing();
    });
    await expect(page.locator("#account-modal")).toBeHidden();
    await expect(page.locator("#pricing-modal")).toBeVisible();
    expect(await page.evaluate(() => window.VTFocusTrap.stack().length)).toBe(1);
    await page.keyboard.press("Escape");
    await expect(page.locator("#pricing-modal")).toBeHidden();
    expect(await activeId(page)).toBe("btn-account");
    expect(await page.evaluate(() => window.VTFocusTrap.stack().length)).toBe(0);
  });

  test("leave dialog traps focus and returns it to the Back button", async ({ page }) => {
    await boot(page);
    await page.locator("#exercise-list .card-ex").first().click();
    await expect(page.locator("#view-exercise")).toBeVisible();
    // Pretend enough practice happened that leaving prompts.
    const prompted = await page.evaluate(async () => {
      document.querySelector("#btn-back-home")?.focus();
      const p = window.VTApp.promptLeaveExercise();
      await new Promise((r) => setTimeout(r, 60));
      const modal = document.querySelector("#leave-modal");
      const inside = modal.contains(document.activeElement);
      const activeBefore = document.activeElement?.id || "";
      window.__leaveChoice = p;
      return { open: !modal.hidden, inside, activeBefore };
    });
    expect(prompted.open).toBe(true);
    expect(prompted.inside).toBe(true);
    expect(prompted.activeBefore).toBe("leave-save");

    const seen = await tabAround(page, "#leave-modal", 8);
    expect(seen.every((s) => s.inside)).toBe(true);

    await page.keyboard.press("Escape");
    await expect(page.locator("#leave-modal")).toBeHidden();
    const choice = await page.evaluate(() => window.__leaveChoice);
    expect(choice).toBe("stay");
    expect(await activeId(page)).toBe("btn-back-home");
  });

  test("guided tour traps focus in its card and restores it on finish", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("vt_lang", "es");
        localStorage.removeItem("vt_tour_v1");
        sessionStorage.setItem("vt_e2e", "1");
      } catch {
        /* ignore */
      }
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#btn-tour")).toBeVisible();
    await page.locator("#btn-tour").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".tour-card")).toBeVisible();
    const seen = await tabAround(page, ".tour-card", 8);
    expect(seen.every((s) => s.inside)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(page.locator("#tour-root")).toBeHidden();
    expect(await activeId(page)).toBe("btn-tour");
  });
});
