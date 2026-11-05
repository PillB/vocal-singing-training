/**
 * QA-05: one console line used to unlock the six Pro features
 * (`VT_BILLING_CONFIG.demoUnlockEnabled = true; VTBilling.activateDemo()`).
 * Wrong behaviour rejected: any of the cheap console routes granting Pro —
 * turning on the QA unlock, loosening the license check beside a forged
 * record, swapping the config object, or overwriting the billing or license
 * answer. Two controls keep the test honest: with the freeze stripped from
 * the served files the same lines do unlock Pro (so the test can see the
 * defect), and the test harness, which patches the config as the page loads,
 * still can (so QA builds keep working).
 *
 * What it cannot stop, and does not claim to: a script that runs before the
 * page's own (an extension, a local override) or an edited copy of the
 * files. Paid access rests on the server-signed license for that reason.
 */
const { test, expect } = require("@playwright/test");
const { enableQaPro } = require("./helpers/billing");

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
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTBilling && !!window.VTLicense && !!window.VTApp);
}

/** Each console route, in a fresh page state; what Pro looks like after each. */
const ROUTES = {
  "turn on the QA unlock": () => {
    window.VT_BILLING_CONFIG.demoUnlockEnabled = true;
    window.VTBilling.activateDemo("pro_monthly");
  },
  "swap the config for one with the unlock on": () => {
    window.VT_BILLING_CONFIG = Object.assign({}, window.VT_BILLING_CONFIG, { demoUnlockEnabled: true });
    window.VTBilling.activateDemo("pro_monthly");
  },
  "loosen the license check beside a forged record": () => {
    window.VT_BILLING_CONFIG.verification.required = false;
    localStorage.setItem(
      "vt_billing_v1",
      JSON.stringify({ plan: "pro_yearly", status: "active", source: "paid", provider: "stripe", activatedAt: new Date().toISOString() })
    );
  },
  "overwrite the billing answer": () => {
    window.VTBilling.isPro = () => true;
    window.VTBilling.can = () => true;
  },
  "overwrite the license claims": () => {
    window.VTLicense.getClaims = () => ({ plan: "pro_yearly", status: "active", exp: Date.now() / 1000 + 86400 });
  }
};

/** Run one route in the page (errors from a frozen object are the point, not a failure) and read Pro back. */
const attempt = (page, name) =>
  page.evaluate(
    ([src]) => {
      try {
        // eslint-disable-next-line no-new-func
        new Function(`"use strict"; (${src})()`)();
      } catch {
        /* a frozen object refuses the write in strict code */
      }
      const B = window.VTBilling;
      return { pro: !!B.isPro(), export: !!B.can("export_progress"), entitlement: B.getEntitlement().pro };
    },
    [ROUTES[name].toString()]
  );

const NONE = { pro: false, export: false, entitlement: false };

for (const name of Object.keys(ROUTES)) {
  test(`console: "${name}" does not unlock Pro`, async ({ page }) => {
    await boot(page);
    expect(await attempt(page, name)).toEqual(NONE);
  });
}

test("control: with the freeze stripped from the served files, the same lines do unlock Pro", async ({ page }) => {
  // The freeze is the lines after each `global.X = ...` that lock X; serve the
  // files without them and everything else unchanged.
  const strip = {
    "billing-config.js": /\n\s*const held = global\.VT_BILLING_CONFIG;[\s\S]*?enumerable: true \}\);/,
    "billing.js": /\n\s*Object\.defineProperty\(global, "VTBilling"[^\n]*/,
    "license.js": /\n\s*Object\.defineProperty\(global, "VTLicense"[^\n]*/
  };
  await page.route(/\/js\/(billing-config|billing|license)\.js(\?.*)?$/, async (route) => {
    const res = await route.fetch();
    const file = new URL(route.request().url()).pathname.split("/").pop();
    const body = (await res.text()).replace(strip[file], "");
    await route.fulfill({ response: res, body });
  });
  // Every route must unlock here, or its test above proves nothing
  for (const name of Object.keys(ROUTES)) {
    await boot(page);
    const r = await attempt(page, name);
    expect(r.pro, `"${name}" unlocks Pro on unfrozen files`).toBe(true);
    await page.evaluate(() => localStorage.removeItem("vt_billing_v1"));
  }
});

test("control: the harness still patches the config as the page loads (QA builds keep their unlock)", async ({ page }) => {
  await enableQaPro(page);
  await boot(page);
  const r = await page.evaluate(() => {
    window.VTBilling.activateDemo("pro_monthly");
    return { pro: window.VTBilling.isPro(), frozen: Object.isFrozen(window.VT_BILLING_CONFIG) };
  });
  expect(r).toEqual({ pro: true, frozen: true });
});
