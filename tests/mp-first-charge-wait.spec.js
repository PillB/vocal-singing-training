/**
 * VG-84: coming back from Mercado Pago, the buyer waits about an hour for Pro,
 * and a buyer whose card Mercado Pago turned down is told so.
 *
 * The worker now signs a Mercado Pago subscription only once its first charge
 * has gone through, and Mercado Pago takes that charge "approximately one
 * hour" after the card is authorised. So the claim the page makes on the way
 * back answers 202 for its whole retry loop, in the ordinary case. What the
 * buyer read then was "We can't confirm the payment yet … if you were
 * charged, contact support with your receipt": a failure, for a wait that is
 * normal. And once that first charge was turned down the worker kept
 * answering 202, so the buyer was told to wait about an hour, for good
 * (VG-84 review); it now answers 402 "declined".
 *
 * These tests pin, on both paths a buyer reaches the answer by (the return
 * from Mercado Pago, and the "Comprobar mi pago" button they press while
 * they wait), that a Mercado Pago claim still waiting says how long to
 * expect, that one turned down says to check the card, and (controls) that
 * a Stripe claim keeps the generic wording, so a change that reworded every
 * claim would fail too.
 *
 * Wrong behaviour each case fails on: the generic "contact support" toast on
 * a Mercado Pago claim, the "about an hour" wording on a turned-down card or
 * on a Stripe claim, or a recheck that has lost which rail it is waiting on.
 */
const { test, expect } = require("@playwright/test");
const { patchBillingConfig, mintLicense } = require("./helpers/billing");

// The worker stands at a fake host the page's CSP refuses; the CSP is tested
// in tests/csp.spec.js, the copy is what is under test here.
test.use({ bypassCSP: true });

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const PREAPPROVAL = "2c938084726fca480172750000000abc";
const PENDING = { status: 202, body: { ok: false, reason: "pending" } };
const DECLINED = { status: 402, body: { ok: false, reason: "declined" } };

/**
 * Load the page with the worker's claim route answering `answer`, every time.
 * @param {import('@playwright/test').Page} page Page.
 * @param {{lang: string, answer: {status: number, body: object}, query?: string, stored?: object}} opts
 *   `query` is a checkout return's query string; `stored` a pending record
 *   already in storage, as a buyer who left and came back has.
 * @returns {Promise<{claims: () => number}>} How many claims went out.
 */
async function load(page, { lang, answer, query, stored }) {
  const license = await mintLicense({ origin: BASE });
  let claims = 0;
  await page.addInitScript(([language, record]) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", language);
      localStorage.removeItem("vt_billing_v1");
      if (record) {
        localStorage.setItem("vt_billing_v1", JSON.stringify({ ...record, activatedAt: new Date().toISOString() }));
      }
      sessionStorage.setItem("vt_e2e", "1");
      // app.js hides toasts under vt_e2e; the toast is what is under test.
      sessionStorage.setItem("vt_debug", "1");
    } catch {
      /* ignore */
    }
  }, [lang, stored || null]);
  await page.route("**/v1/**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, reason: "not_stubbed" }) })
  );
  await page.route("**/v1/claim", (route) => {
    claims += 1;
    return route.fulfill({ status: answer.status, contentType: "application/json", body: JSON.stringify(answer.body) });
  });
  await patchBillingConfig(page, {
    verification: { apiBaseUrl: "https://entitlements.invalid", publicKeyJwk: license.publicKeyJwk, required: true }
  });
  // The claim's own retries wait 1.5 + 3 + 5 + 8 s; run them on a fake clock.
  await page.clock.install();
  await page.goto(`${BASE}/index.html${query ? `?${query}` : ""}`, { waitUntil: "domcontentloaded" });
  return { claims: () => claims };
}

/** A pending checkout record, as the return page leaves it. */
const pendingRecord = (provider, sessionId) => ({
  status: "pending",
  plan: "pro_monthly",
  provider,
  source: "checkout_return",
  sessionId,
  verified: false
});

/** Advance the page's clock until the toast says something matching `pattern`, and return it. */
async function toastMatching(page, pattern) {
  let text = "";
  await expect
    .poll(async () => {
      await page.clock.runFor(1000);
      text = (await page.locator("#toast").textContent()) || "";
      return pattern.test(text);
    }, { timeout: 20000 })
    .toBe(true);
  return text;
}

/**
 * Press "Comprobar mi pago" in the Pro dialog, after the claim the page made
 * on load has settled, and return how many claims the press itself sent.
 */
async function pressRecheck(page, flow) {
  // Let the load's own resumed claim finish its retries, so what follows is the press's.
  await page.clock.runFor(20000);
  const before = flow.claims();
  expect(before, "the page resumed the stored claim on load").toBeGreaterThan(0);
  await page.click("#btn-pricing");
  const recheck = page.locator("#btn-recheck-payment");
  await expect(recheck, "the button a waiting buyer presses is offered").toBeVisible();
  await recheck.click();
  return before;
}

const COPY = {
  es: { hour: /alrededor de una hora/, declined: /no pudo cobrar con tu tarjeta/, alarm: /soporte|comprobante/, generic: /Todavía no podemos confirmar el pago/,
    // The button the page names must be the one it shows; "cuota" reads in
    // Peru as card instalments; "en cuanto entre" promised a switch-on the
    // page does not do on its own (VG-84 review).
    names: "«Comprobar mi pago»", misleading: /cuota|en cuanto entre/ },
  en: { hour: /about an hour/, declined: /couldn’t charge your card/, alarm: /support|receipt/, generic: /We can’t confirm the payment yet/,
    names: "“Check my payment”", misleading: /as soon as it goes through/ }
};

test.describe("VG-84 Mercado Pago's first charge is about an hour away", () => {
  for (const lang of ["es", "en"]) {
    const copy = COPY[lang];
    test(`a Mercado Pago return still waiting says to expect about an hour (${lang})`, async ({ page }) => {
      const flow = await load(page, { lang, answer: PENDING,
        query: `billing=success&plan=pro_monthly&provider=mercadopago&preapproval_id=${PREAPPROVAL}` });
      const text = await toastMatching(page, copy.hour);
      expect(flow.claims(), "the claim went out and kept getting 202").toBeGreaterThan(3);
      expect(text).not.toMatch(copy.alarm);
      expect(text).toMatch(/Mercado Pago/);
      expect(text).not.toMatch(copy.misleading);
      // When Pro switches on: on reopening the app, or on the button, named as it is labelled.
      const label = (await page.locator("#btn-recheck-payment").textContent()).trim();
      expect(text).toContain(copy.names);
      expect(copy.names).toContain(label);
      // Still waiting, not given up: the status line says it is confirming.
      expect(await page.evaluate(() => VTBilling.getEntitlement().status)).toBe("pending");
    });

    test(`a Mercado Pago return whose card was turned down says so, not to wait (${lang})`, async ({ page }) => {
      const flow = await load(page, { lang, answer: DECLINED,
        query: `billing=success&plan=pro_monthly&provider=mercadopago&preapproval_id=${PREAPPROVAL}` });
      const text = await toastMatching(page, copy.declined);
      expect(flow.claims()).toBeGreaterThan(0);
      expect(text).not.toMatch(copy.hour);
      expect(text).not.toMatch(copy.alarm);
      expect(text).toContain(copy.names);
      // Not given up on: Mercado Pago retries the card, so the page keeps asking.
      expect(await page.evaluate(() => VTBilling.getEntitlement().status)).toBe("pending");
    });
  }

  test("control: a Stripe return still waiting keeps the generic wording", async ({ page }) => {
    const flow = await load(page, { lang: "es", answer: PENDING,
      query: "billing=success&plan=pro_monthly&provider=stripe&session_id=cs_test_vg84" });
    const text = await toastMatching(page, COPY.es.generic);
    expect(flow.claims()).toBeGreaterThan(3);
    expect(text).not.toMatch(/una hora/);
  });

  // The path a buyer actually uses during the hour's wait (VG-84 review,
  // mutant B2: the recheck losing its rail survived the return-path tests).
  for (const [label, provider, sessionId, answer, expected, not] of [
    ["a Mercado Pago claim still waiting", "mercadopago", PREAPPROVAL, PENDING, COPY.es.hour, COPY.es.alarm],
    ["a Mercado Pago claim turned down", "mercadopago", PREAPPROVAL, DECLINED, COPY.es.declined, COPY.es.hour],
    ["control: a Stripe claim still waiting", "stripe", "cs_test_vg84_recheck", PENDING, COPY.es.generic, /una hora/]
  ]) {
    test(`"Comprobar mi pago" on ${label}`, async ({ page }) => {
      const flow = await load(page, { lang: "es", answer, stored: pendingRecord(provider, sessionId) });
      const before = await pressRecheck(page, flow);
      const text = await toastMatching(page, expected);
      expect(flow.claims(), "the press sent its own claim").toBeGreaterThan(before);
      expect(text).not.toMatch(not);
    });
  }
});
