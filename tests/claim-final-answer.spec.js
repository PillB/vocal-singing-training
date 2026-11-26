/**
 * F14 (payments state-machine inventory, 2026-11-26): a claim the worker has
 * answered for good is said to be so.
 *
 * Coming back from a checkout, the page asks the worker for the licence
 * behind it (POST /v1/claim). Some answers are final: 403 "inactive" (the
 * payment failed, was refunded, or the subscription is over) and 404
 * "not_found" (the worker has no such purchase any more). js/billing.js
 * already knew that, stopped retrying them, and then told the buyer
 * "Todavía no podemos confirmar el pago. Seguimos reintentando", and the Pro
 * dialog went on saying "Pago aún sin confirmar" for ever: the opposite of
 * what had happened, to someone deciding whether to wait or to pay again.
 *
 * Correct, pinned here:
 * - inactive: the toast says the provider reports the payment did not go
 *   through or is no longer active, with both ways on (support with the
 *   receipt, or subscribing again); the status line says the same.
 * - not_found: the toast asks for the receipt and says not to pay again,
 *   since the purchase may be real; it never invites a second payment.
 * - «Comprobar mi pago» stays: a 403 at the end of a period can still turn
 *   when the provider's own retry succeeds, and the press is the only way
 *   back from the browser.
 * - A 402 "suspended" is told the subscription is on hold, and is retried.
 * - Controls, so a fix that called every failure final fails too: a claim
 *   still answered 202 is told what the page will really do (ask again on
 *   each visit for up to 7 days after the payment, and on the button, named
 *   as it is labelled), and an answer with no reason of the worker's own (a
 *   proxy's 503 page) is not final: the record stays pending, so the next
 *   visit asks again.
 *
 * Wrong behaviour each case fails on: "Seguimos reintentando" or "Pago aún
 * sin confirmar" after a final answer, "suscribirte de nuevo" on a purchase
 * the worker cannot find, the button hidden, or a 503 page read as
 * "not_found" and never asked about again.
 */
const { test, expect } = require("@playwright/test");
const { patchBillingConfig, mintLicense } = require("./helpers/billing");

// The worker stands at a fake host the page's CSP refuses; the CSP is tested
// in tests/csp.spec.js, the copy is what is under test here.
test.use({ bypassCSP: true });

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const RETURN = "billing=success&plan=pro_monthly&checkout_id=ch_final_answer";
const INACTIVE = { status: 403, json: { ok: false, reason: "inactive" } };
const NOT_FOUND = { status: 404, json: { ok: false, reason: "not_found" } };
const SUSPENDED = { status: 402, json: { ok: false, reason: "suspended" } };
const PENDING = { status: 202, json: { ok: false, reason: "pending" } };
// What a proxy in front of the worker sends: no JSON, so no reason of the worker's.
const PROXY_503 = { status: 503, html: "<html><body>Service Unavailable</body></html>" };

const COPY = {
  es: {
    inactive: /no se completó o ya no está activo/,
    notFound: /No encontramos este pago/,
    suspended: /tiene tu suscripción en espera/,
    waiting: /hasta 7 días después del pago/,
    retrying: /Seguimos reintentando/,
    payAgain: /suscribirte de nuevo/,
    dontPayAgain: /No vuelvas a pagar/,
    support: /soporte con el comprobante/,
    names: "«Comprobar mi pago»",
    statusInactive: "Este pago no se completó o ya no está activo",
    statusNotFound: "No encontramos este pago · escribe a soporte",
    statusUnverified: "Pago aún sin confirmar",
    statusVerifying: "Confirmando tu pago con el proveedor…"
  },
  en: {
    inactive: /didn’t go through or is no longer active/,
    notFound: /We couldn’t find this payment/,
    suspended: /has your subscription on hold/,
    waiting: /for up to 7 days after the payment/,
    retrying: /keep retrying/,
    payAgain: /subscribe again/,
    dontPayAgain: /Please don’t pay again/,
    support: /support with your receipt/,
    names: "“Check my payment”",
    statusInactive: "This payment didn’t go through or is no longer active",
    statusNotFound: "We couldn’t find this payment · contact support",
    statusUnverified: "Payment not confirmed yet",
    statusVerifying: "Confirming your payment with the provider…"
  }
};

/**
 * Load the page with the worker's claim route answering `answer`, every time.
 * @param {import('@playwright/test').Page} page Page.
 * @param {{lang: string, answer: object, query?: string, stored?: object}} opts
 *   `query` is a checkout return's query string; `stored` a record already in
 *   storage, as a buyer who left and came back has.
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
    return answer.html
      ? route.fulfill({ status: answer.status, contentType: "text/html", body: answer.html })
      : route.fulfill({ status: answer.status, contentType: "application/json", body: JSON.stringify(answer.json) });
  });
  await patchBillingConfig(page, {
    verification: { apiBaseUrl: "https://entitlements.invalid", publicKeyJwk: license.publicKeyJwk, required: true }
  });
  // The claim's own retries wait 1.5 + 3 + 5 + 8 s; run them on a fake clock.
  await page.clock.install();
  await page.goto(`${BASE}/index.html${query ? `?${query}` : ""}`, { waitUntil: "domcontentloaded" });
  return { claims: () => claims };
}

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

/** The record the page keeps for the checkout. */
const stored = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("vt_billing_v1") || "null"));

/** Open the Pro dialog and read its status line, and whether «Comprobar mi pago» is offered. */
async function dialog(page) {
  await page.click("#btn-pricing");
  await expect(page.locator("#pricing-modal")).toBeVisible();
  return {
    status: ((await page.locator("#pricing-status").textContent()) || "").trim(),
    recheck: await page.locator("#btn-recheck-payment").isVisible(),
    label: ((await page.locator("#btn-recheck-payment").textContent()) || "").trim()
  };
}

/** A record as the return page leaves it after a final answer. */
const unclaimed = (claimReason) => ({
  status: "unclaimed",
  claimReason,
  plan: "pro_monthly",
  provider: "creem",
  source: "checkout_return",
  sessionId: "ch_final_answer",
  verified: false
});

test.describe("F14 a final answer to a claim is said to be final", () => {
  for (const lang of ["es", "en"]) {
    const copy = COPY[lang];

    test(`a payment the provider calls inactive is told so, with both ways on (${lang})`, async ({ page }) => {
      const flow = await load(page, { lang, answer: INACTIVE, query: RETURN });
      const text = await toastMatching(page, copy.inactive);
      expect(text).not.toMatch(copy.retrying);
      expect(text).not.toMatch(copy.waiting);
      expect(text).toMatch(copy.support);
      expect(text).toMatch(copy.payAgain);
      expect(flow.claims(), "a final answer is not asked again on the return page").toBe(1);
      expect(await stored(page)).toMatchObject({ status: "unclaimed", claimReason: "inactive" });
      const d = await dialog(page);
      expect(d.status).toBe(copy.statusInactive);
      // Kept: a 403 at the end of a period can still turn, and this is the way back.
      expect(d.recheck).toBe(true);
    });

    test(`a purchase the worker cannot find asks for the receipt, not a second payment (${lang})`, async ({ page }) => {
      await load(page, { lang, answer: NOT_FOUND, query: RETURN });
      const text = await toastMatching(page, copy.notFound);
      expect(text).toMatch(copy.dontPayAgain);
      expect(text).toMatch(copy.support);
      expect(text).not.toMatch(copy.payAgain);
      expect(text).not.toMatch(copy.retrying);
      expect(await stored(page)).toMatchObject({ status: "unclaimed", claimReason: "not_found" });
      const d = await dialog(page);
      expect(d.status).toBe(copy.statusNotFound);
      expect(d.recheck).toBe(true);
    });

    test(`control: a claim still answered 202 is told what the page will do, and until when (${lang})`, async ({ page }) => {
      const flow = await load(page, { lang, answer: PENDING, query: RETURN });
      const text = await toastMatching(page, copy.waiting);
      expect(flow.claims(), "the return page asked, and kept getting 202").toBeGreaterThan(3);
      expect(text).not.toMatch(copy.retrying);
      expect(text).not.toMatch(copy.inactive);
      expect(text).not.toMatch(copy.notFound);
      expect(text).toContain(copy.names);
      const d = await dialog(page);
      // The button the toast names is the one the dialog shows.
      expect(copy.names).toContain(d.label);
      expect(d.recheck).toBe(true);
      expect(d.status).toBe(copy.statusVerifying);
      expect((await stored(page)).status).toBe("pending");
    });
  }

  test("control: a proxy's 503 page carries no reason of the worker's, so it is not final and the next visit asks again", async ({ page }) => {
    await load(page, { lang: "es", answer: PROXY_503, query: RETURN });
    const text = await toastMatching(page, COPY.es.waiting);
    expect(text).not.toMatch(COPY.es.notFound);
    const record = await stored(page);
    expect(record.status, "the record is still waiting, so every visit resumes it").toBe("pending");
    expect(record.claimReason).toBeUndefined();
    const d = await dialog(page);
    expect(d.status).not.toBe(COPY.es.statusNotFound);
  });

  test("a subscription the provider holds (402 suspended) is told it is on hold, and stays waiting", async ({ page }) => {
    await load(page, { lang: "es", answer: SUSPENDED, query: RETURN });
    const text = await toastMatching(page, COPY.es.suspended);
    expect(text).not.toMatch(COPY.es.retrying);
    expect(text).toContain(COPY.es.names);
    expect((await stored(page)).status).toBe("pending");
  });

  test("a buyer who comes back after a final answer reads it, sends no claim, and can still press «Comprobar mi pago»", async ({ page }) => {
    const flow = await load(page, { lang: "es", answer: INACTIVE, stored: unclaimed("inactive") });
    await page.clock.runFor(20000);
    expect(flow.claims(), "a final answer is not asked about on every visit").toBe(0);
    const d = await dialog(page);
    expect(d.status).toBe(COPY.es.statusInactive);
    expect(d.status).not.toBe(COPY.es.statusUnverified);
    expect(d.recheck).toBe(true);
    await page.click("#btn-recheck-payment");
    const text = await toastMatching(page, COPY.es.inactive);
    expect(flow.claims(), "the press asked the worker again").toBe(1);
    expect(text).not.toMatch(COPY.es.retrying);
  });

  test("control: a record given up on at 7 days with no answer of the worker's keeps saying it is unconfirmed", async ({ page }) => {
    // The 7-day cut-off writes "unclaimed" with no reason: the worker never
    // said no, so the status line must not claim it did.
    const record = unclaimed(undefined);
    delete record.claimReason;
    await load(page, { lang: "es", answer: PENDING, stored: record });
    await page.clock.runFor(2000);
    const d = await dialog(page);
    expect(d.status).toBe(COPY.es.statusUnverified);
    expect(d.recheck).toBe(true);
  });
});
