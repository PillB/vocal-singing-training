/**
 * Keyboard focus trap — Tab stays inside an open dialog, Escape/close returns
 * focus to the control that opened it.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

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

  test("account modal traps focus and restores it on Escape", async ({ page }) => {
    await boot(page);
    await page.locator("#btn-account").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#account-modal")).toBeVisible();
    expect(await activeId(page)).toBe("login-username");

    const seen = await tabAround(page, "#account-modal", 12);
    expect(seen.every((s) => s.inside)).toBe(true);
    expect(seen.map((s) => s.id)).toEqual(expect.arrayContaining(["login-password"]));

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
