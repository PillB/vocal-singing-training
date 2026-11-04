/**
 * How to cancel, for the rail the subscriber actually paid on.
 *
 * `pricing.note` used to end "Cancela cuando quieras desde el mismo sitio donde
 * te suscribiste", which reads as a promise that this page can take you there.
 * It cannot, on either rail that will ever be live. Measured on 4 November 2026:
 * the only self-service control on the page is the Stripe Customer Portal
 * button, and `isPortalUrl` in js/billing.js accepts `billing.stripe.com`,
 * `*.billing.stripe.com`, `billing.stripe.me` and `stripe.com` paths containing
 * "billing" — nothing else. So a Mercado Pago or Creem management URL is
 * rejected by the validator and the button stays hidden, on a product whose own
 * documented conclusion (VG-19) is that a Peru-registered seller cannot be a
 * Stripe merchant at all.
 *
 * Creem's portal link is generated per customer and emailed after each payment
 * (docs.creem.io/features/customer-portal, read 2026-11-04), so no single URL
 * could ever be configured here; Mercado Pago's recurring payments are managed
 * inside the payer's own Mercado Pago account. Three rails, three routes, one
 * button. The page names the route now instead of implying one.
 *
 * What these cases reject: a page that shows no route to a paying subscriber, a
 * page that shows the wrong rail's route, and a page that offers a trial or a
 * gift holder a way to cancel something nobody is charging them for.
 *
 * Why a signed licence per rail and not `VTBilling.activate(...)`: activate()
 * writes an intent, and without a worker signature the entitlement comes back
 * `{pro: false, status: "unverified"}` with the rail only inside `.raw`. That is
 * correct — a browser must not be able to self-grant Pro — so the only honest
 * way to test what a paying subscriber sees is to mint the token the worker
 * would have signed, with that rail in its claims.
 */
const { test, expect } = require("@playwright/test");
const { mintLicense, installLicense, waitForLicenseState } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

/** The rails money can actually come in on, and the words each route is known by. */
const RAILS = {
  stripe: { says: /Gestionar suscripci|Manage subscription/i, never: [/Creem/, /Mercado Pago/] },
  creem: { says: /correo|email/i, never: [/Stripe/, /Mercado Pago/] },
  mercadopago: { says: /Mercado Pago/, never: [/Stripe/, /Creem/] }
};

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
}

/** Opens the pricing panel and reads the cancellation line as it stands. */
async function readNote(page) {
  await page.evaluate(() => {
    document.getElementById("btn-pricing")?.click();
  });
  return page.evaluate(() => {
    const el = document.getElementById("pricing-cancel-note");
    const ent = window.VTBilling.getEntitlement();
    return {
      hidden: el ? !!el.hidden : null,
      key: el ? el.getAttribute("data-i18n") : null,
      text: el ? el.textContent.trim() : null,
      provider: ent.provider,
      pro: ent.pro,
      status: ent.status
    };
  });
}

test.describe("How to cancel says the true thing for the rail you paid on", () => {
  test("a free visitor is told nothing about cancelling, because there is nothing to cancel", async ({ page }) => {
    await boot(page);
    const r = await readNote(page);
    expect(r.pro).toBe(false);
    expect(r.hidden).toBe(true);
    expect(r.text).toBe("");
  });

  for (const [rail, want] of Object.entries(RAILS)) {
    test(`${rail}: a subscriber on this rail is given this rail's route and no other`, async ({ page }) => {
      const license = await mintLicense({ origin: BASE, provider: rail });
      await boot(page);
      await installLicense(page, license);
      await page.reload({ waitUntil: "domcontentloaded" });
      await waitForLicenseState(page, "ok");

      const r = await readNote(page);
      expect(r.pro, "the signed licence grants Pro").toBe(true);
      expect(r.provider, "and the entitlement reports the rail from its claims").toBe(rail);
      expect(r.hidden, "a paying subscriber is told how to cancel").toBe(false);
      expect(r.key, "the line shown is the one for this rail").toBe("pricing.cancel." + rail);
      expect(r.text, "and it names this rail's route").toMatch(want.says);
      for (const other of want.never) {
        expect(r.text, `${rail}'s line must not send them to another rail`).not.toMatch(other);
      }
    });
  }

  test("the three routes are three different sentences, not one hedge", async ({ page }) => {
    await boot(page);
    const lines = await page.evaluate((rails) => {
      const out = {};
      for (const lang of ["es", "en"]) {
        try {
          window.VTI18n.setLang(lang);
        } catch {
          /* ignore */
        }
        out[lang] = rails.map((r) => window.VTI18n.t("pricing.cancel." + r));
      }
      return out;
    }, Object.keys(RAILS));

    for (const lang of ["es", "en"]) {
      const set = new Set(lines[lang]);
      expect(set.size, `${lang}: three rails, three routes`).toBe(3);
      for (const line of lines[lang]) {
        // A missing key comes back as the key itself, which would otherwise
        // satisfy "three different strings" while saying nothing.
        expect(line, `${lang}: the key is translated, not echoed`).not.toMatch(/^pricing\.cancel\./);
        expect(line.length, `${lang}: and it is a sentence, not a label`).toBeGreaterThan(40);
      }
    }
  });

  test("a trial is not offered a way to cancel a charge nobody is making", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      try {
        window.VTBilling.clearEntitlement?.();
        window.VT_BILLING_CONFIG.freeTrialDays = 7;
        window.VTBilling.startTrial?.();
      } catch {
        /* ignore */
      }
      document.getElementById("btn-pricing")?.click();
      const el = document.getElementById("pricing-cancel-note");
      const ent = window.VTBilling.getEntitlement();
      return { status: ent.status, provider: ent.provider, hidden: !!el.hidden, text: el.textContent.trim() };
    });
    // Whether a trial can start at all depends on the account; what must never
    // happen is a cancellation route appearing for a rail nobody paid on.
    expect(["trial", "free", "none", undefined]).toContain(r.status);
    if (r.status === "trial") {
      expect(r.hidden, "a trial has nothing to cancel").toBe(true);
    }
    expect(r.text === "" || !/Mercado Pago|Creem|Stripe/.test(r.text)).toBe(true);
  });

  test("the payment note no longer promises a route this page cannot take you to", async ({ page }) => {
    await boot(page);
    const notes = await page.evaluate(() => {
      const pick = (lang) => {
        try {
          window.VTI18n.setLang(lang);
        } catch {
          /* ignore */
        }
        return window.VTI18n.t("pricing.note");
      };
      return { es: pick("es"), en: pick("en") };
    });
    expect(notes.es, "the sentence that implied a button that does not exist").not.toMatch(
      /mismo sitio donde te suscribiste/
    );
    expect(notes.en).not.toMatch(/the same way you subscribed/);
    expect(notes.es, "it still says you can cancel, which is the part that must stay").toMatch(/cancelar/i);
    expect(notes.en).toMatch(/cancel/i);
  });
});
