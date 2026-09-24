/**
 * Pro dialog before checkout is live (design "pricing", pre-launch state).
 *
 * While checkout cannot take money (billing health not ok, no QA unlock) the
 * dialog offers nothing that only answers with a toast: the payments note and
 * the trial lead it, the plan buttons say "Aún no disponible" and are
 * disabled, the payment-method choice is gone and the foot no longer promises
 * a checkout. Once checkout is live the dialog is the usual one. The benefit
 * list is plain language in both states.
 */
const { test, expect } = require("@playwright/test");
const { mintLicense, patchBillingConfig, enableQaPro } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page, lang = "es") {
  await page.addInitScript((l) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", l);
      sessionStorage.setItem("vt_e2e", "1");
      localStorage.removeItem("vt_billing_v1");
      localStorage.removeItem("vt_billing_trial_started_v1");
      localStorage.removeItem("vt_license_v1");
    } catch {
      /* ignore */
    }
  }, lang);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await expect(page.locator("#btn-pricing")).toBeVisible();
}

async function openPricing(page) {
  // On a phone, Pro is in the header's "Más" menu.
  if (await page.locator("#btn-more").isVisible()) await page.click("#btn-more");
  await page.click("#btn-pricing");
  await expect(page.locator("#pricing-modal")).toBeVisible();
}

/** Checkout links set and entitlements verifiable: what a launched build has. */
async function makeCheckoutLive(page) {
  const license = await mintLicense({ origin: BASE });
  await patchBillingConfig(page, {
    verification: {
      apiBaseUrl: "https://entitlements.invalid",
      publicKeyJwk: license.publicKeyJwk,
      required: true,
      revalidateHours: 24 * 365
    },
    providers: {
      stripe: {
        id: "stripe",
        label: "International card",
        labelEs: "Tarjeta internacional",
        regions: ["US"],
        links: { pro_monthly: "https://buy.stripe.com/test_m", pro_yearly: "https://buy.stripe.com/test_y" }
      },
      mercadopago: {
        id: "mercadopago",
        label: "Mercado Pago",
        labelEs: "Mercado Pago (Perú / LATAM)",
        regions: ["PE"],
        links: { pro_monthly: "", pro_yearly: "" }
      }
    }
  });
}

/** Text contrast of an element against the backgrounds it is drawn over. */
function textContrast(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    const parse = (c) => {
      const m = c.match(/rgba?\(([^)]+)\)/);
      if (!m) return [0, 0, 0, 0];
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1];
    };
    const over = (top, under) => {
      const a = top[3];
      return [0, 1, 2].map((i) => top[i] * a + under[i] * (1 - a)).concat(1);
    };
    // Composite the background layers from the page up to the element.
    const chain = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) chain.push(n);
    let bg = [0, 0, 0, 1];
    chain.reverse().forEach((n) => {
      bg = over(parse(getComputedStyle(n).backgroundColor), bg);
    });
    const cs = getComputedStyle(el);
    const fg = over(parse(cs.color).slice(0, 3).concat(parse(cs.color)[3] * Number(cs.opacity)), bg);
    const lum = (c) => {
      const [r, g, b] = c.slice(0, 3).map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const a = lum(fg);
    const b = lum(bg);
    return { ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05), weight: Number(cs.fontWeight) };
  }, selector);
}

const JARGON_ES = /JSON|sparkline|insights?|Ancla|\bhold\b|freezes?|\bpack\b/i;
const JARGON_EN = /JSON|sparkline|insights?|Anchor|freezes?|\bpack\b/i;

test.describe("Pro dialog before checkout is live", () => {
  test("leads with the payments note and the trial as the one primary action", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await openPricing(page);

    const launch = page.locator("#pricing-launch");
    await expect(launch).toBeVisible();
    await expect(launch.locator("#pricing-health-note")).toHaveText(/no están públicos/);
    const trial = launch.locator("#btn-start-trial");
    await expect(trial).toBeVisible();
    await expect(trial).toHaveText("Probar Pro 7 días gratis");
    await expect(trial).toHaveClass(/btn-primary/);
    // The only primary in the dialog, and on the first screen of a phone.
    await expect(page.locator("#pricing-modal .btn-primary:visible")).toHaveCount(1);
    const box = await trial.boundingBox();
    expect(box.y + box.height).toBeLessThanOrEqual(844);
    // The dialog describes itself with the note, so it is heard on opening.
    await expect(page.locator("#pricing-modal")).toHaveAttribute("aria-describedby", "pricing-health-note");
  });

  test("plan buttons say not available yet and are disabled, readably", async ({ page }) => {
    await boot(page);
    await openPricing(page);
    for (const plan of ["pro_monthly", "pro_yearly"]) {
      const sel = `#pricing-grid .plan-cta[data-plan="${plan}"]`;
      const btn = page.locator(sel);
      await expect(btn).toHaveText("Aún no disponible");
      await expect(btn).toBeDisabled();
      await expect(btn).toHaveAttribute("aria-disabled", "true");
      await expect(btn).not.toHaveClass(/btn-primary/);
      const c = await textContrast(page, sel);
      // Readable (4.5:1) yet clearly muted next to a live label, and not bold.
      expect(c.ratio).toBeGreaterThanOrEqual(4.5);
      expect(c.ratio).toBeLessThan(9);
      expect(c.weight).toBeLessThan(600);
    }
    // Every disabled plan button carries both signals.
    const mismatched = await page.evaluate(() =>
      [...document.querySelectorAll("#pricing-grid .plan-cta")]
        .filter((b) => b.disabled !== (b.getAttribute("aria-disabled") === "true"))
        .map((b) => b.dataset.plan)
    );
    expect(mismatched).toEqual([]);
  });

  test("hides the payment-method choice and the checkout promise", async ({ page }) => {
    await boot(page);
    await openPricing(page);
    await expect(page.locator("#pricing-rails")).toBeHidden();
    const pay = page.locator("#pricing-pay-note");
    await expect(pay).toBeVisible();
    await expect(pay).toHaveText(/no pide tarjeta/);
    await expect(pay).not.toHaveText(/Pago seguro|Cancela cuando quieras/);
  });

  test("keyboard reaches the trial and the folded benefits, and stays inside", async ({ page }) => {
    await boot(page);
    await page.locator("#btn-pricing").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#pricing-modal")).toBeVisible();
    const seen = [];
    for (let i = 0; i < 8; i += 1) {
      await page.keyboard.press("Tab");
      seen.push(
        await page.evaluate(() => {
          const el = document.activeElement;
          return {
            key: el.id || el.tagName.toLowerCase(),
            inside: document.querySelector("#pricing-modal").contains(el)
          };
        })
      );
    }
    expect(seen.every((s) => s.inside)).toBe(true);
    const keys = seen.map((s) => s.key);
    expect(keys[0]).toBe("btn-start-trial");
    expect(keys).toContain("summary");
    // Disabled plan buttons are skipped, as disabled controls are.
    expect(keys.indexOf("summary")).toBeGreaterThan(keys.indexOf("btn-start-trial"));
  });

  test("after starting the trial the note stays and nothing asks to pay", async ({ page }) => {
    await boot(page);
    await openPricing(page);
    await page.click("#btn-start-trial");
    await expect(page.locator("#btn-start-trial")).toBeHidden();
    await expect(page.locator("#pricing-health-note")).toBeVisible();
    await expect(page.locator("#pricing-pay-note")).toBeHidden();
    await expect(page.locator('#pricing-grid .plan-cta[data-plan="pro_monthly"]')).toHaveText("Aún no disponible");
    await expect(page.locator('#pricing-grid .plan-cta[data-plan="pro_monthly"]')).toBeDisabled();
  });

  test("English labels", async ({ page }) => {
    await boot(page, "en");
    await openPricing(page);
    await expect(page.locator("#btn-start-trial")).toHaveText("Try Pro free for 7 days");
    await expect(page.locator('#pricing-grid .plan-cta[data-plan="pro_yearly"]')).toHaveText("Not available yet");
    await expect(page.locator("#pricing-pay-note")).toHaveText(/needs no card/);
  });
});

test.describe("Pro dialog benefits in plain language", () => {
  test("Spanish and English benefit copy carries no internal jargon", async ({ page }) => {
    await boot(page);
    await openPricing(page);
    await page.locator("#pricing-grid .plan-more summary").first().click();
    const es = await page.locator("#pricing-modal .pricing-card").innerText();
    expect(es).not.toMatch(JARGON_ES);
    await expect(page.locator("#pricing-grid .plan-features li", { hasText: "profesor" })).toHaveCount(1);

    await page.click("#pricing-close");
    await page.click("#btn-lang");
    await openPricing(page);
    await page.locator("#pricing-grid .plan-more summary").first().click();
    const en = await page.locator("#pricing-modal .pricing-card").innerText();
    expect(en).not.toMatch(JARGON_EN);
    await expect(page.locator("#pricing-grid .plan-features li", { hasText: "teacher" })).toHaveCount(1);
  });
});

test.describe("Pro dialog once checkout is live", () => {
  test("is the usual dialog: payment choice, Subscribe, trial in the foot", async ({ page }) => {
    await makeCheckoutLive(page);
    await boot(page);
    expect(await page.evaluate(() => window.VTBilling.getBillingHealth().ok)).toBe(true);
    await openPricing(page);
    await expect(page.locator("#pricing-rails")).toBeVisible();
    await expect(page.locator("#pricing-rails .rail-btn")).toHaveCount(2);
    for (const plan of ["pro_monthly", "pro_yearly"]) {
      const btn = page.locator(`#pricing-grid .plan-cta[data-plan="${plan}"]`);
      await expect(btn).toHaveText("Suscribirse");
      await expect(btn).toBeEnabled();
      await expect(btn).toHaveClass(/btn-primary/);
    }
    await expect(page.locator("#pricing-launch")).toBeHidden();
    const trial = page.locator("#pricing-modal .pricing-foot #btn-start-trial");
    await expect(trial).toBeVisible();
    // With the entitlements worker set, the trial is the account's (30 days).
    await expect(trial).toHaveText(/^Empezar prueba Pro de \d+ días$/);
    await expect(trial).not.toHaveClass(/btn-primary/);
    await expect(page.locator("#pricing-pay-note")).toHaveText(/Pago seguro/);
  });

  test("a QA build with the demo unlock keeps Subscribe and shows the note", async ({ page }) => {
    await enableQaPro(page);
    await boot(page);
    await openPricing(page);
    await expect(page.locator('#pricing-grid .plan-cta[data-plan="pro_monthly"]')).toHaveText("Suscribirse");
    await expect(page.locator('#pricing-grid .plan-cta[data-plan="pro_monthly"]')).toBeEnabled();
    await expect(page.locator("#pricing-rails")).toBeVisible();
    await expect(page.locator("#pricing-health-note")).toBeVisible();
    await expect(page.locator("#pricing-modal .pricing-foot #btn-start-trial")).toBeVisible();
  });
});
