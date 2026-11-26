/**
 * A subscription still open while Pro is off ("lapsed", or "on hold"), and the
 * other places the page has to know a subscription is open before it sells one.
 *
 * Red team round two on the subscription branch (330c5d7) found these:
 * - states-1, money-3 (page half): with Pro off and /v1/me's billingRails
 *   naming a rail (a renewal being retried, a refunded period, a pause), the
 *   Pro window still said "Free plan" and "Subscribe" on both paid plans, the
 *   header said "Try Pro", and the account panel offered "Start 7 free days".
 *   A press opened a second checkout while the first subscription was retried.
 * - tests-4: the Mercado Pago half of that state had no test.
 * - tests-5: on a worker that cannot open the Creem portal, the lapsed
 *   subscriber was told nothing at all.
 * - money-5: a gift (or a trial) over a subscription still being charged named
 *   the gift as the rail, so the Manage button and its line disappeared.
 * - states-7: a Stripe payer with no portal configured was told about a
 *   button that is not drawn.
 * - truth-5: the lapsed line guessed the cause ("usually a payment that didn't
 *   go through"), which is false after a refund; /v1/me says the same for both.
 * - truth-8: a 429's retryAfter never reached the toast.
 * And the worker's new refusal: a checkout for an account with a subscription
 * open is refused with reason "subscription_open" and the rail it is open on;
 * the page sends them to manage that one and opens no second checkout.
 *
 * Every claim has its control beside it: the same set-up with the one input
 * that matters turned the other way (billingRails empty, a portal configured,
 * another refusal), so an assertion that cannot tell the two apart fails one
 * of them. The oracle is what the person can see and press and where the
 * press goes (the page navigated to, the tab opened, the requests the
 * stand-in worker received), never which function ran.
 *
 * The worker is stood in for at the shipped worker's host, which the page's
 * Content Security Policy allows, so these run under the real policy. Licence
 * tokens are really signed with a throwaway key, so the check that grants Pro
 * is the real one. The stand-in follows tests/manage-cancel-route.spec.js,
 * with the checkout route and a slow /v1/me added.
 */
const { test, expect } = require("@playwright/test");
const { mintLicense, patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev";
const DAY = 86400;
const SESSION = "sess-rt2p2-1";
/** Never used the free trial, so a page that treats them as free would offer it. */
const ACCOUNT = { id: "acct_rt2p2_1", email: "held@example.test", trialUsed: false };
const LIC = "QwErTyUiOpAsDfGhJkLzXcVbNm0123456789_-qwert";
const CHECKOUT_PAGE = "https://checkout.creem.io/ch_rt2p2_1";
const PORTAL_PAGE = "https://creem.io/my-orders/login/cust_rt2p2_1";
const MP_SUBSCRIPTIONS = "https://www.mercadopago.com.pe/subscriptions";
const STRIPE_PORTAL = "https://billing.stripe.com/p/login/test_rt2p2";
/** Creem on sale through the worker (gate step 5). */
const ON_SALE = { rails: { creem: { apiCheckout: true } } };

const nowSec = () => Math.floor(Date.now() / 1000);

/** /v1/me once the paid period is over: no Pro, no rail on the entitlement. */
const NO_PRO = { pro: false, plan: null, status: "free", source: null, provider: null, periodEnd: null };

function paidOn(provider) {
  return { pro: true, plan: "pro_monthly", status: "active", source: "paid", provider, periodEnd: nowSec() + 30 * DAY };
}

/** A gifted month, as the worker's token names it (provider "gift", the source): no rail. */
const GIFT = { pro: true, plan: "pro_monthly", status: "active", source: "gift", provider: "gift", periodEnd: nowSec() + 20 * DAY };

function freshState(over) {
  return {
    entitlement: NO_PRO,
    billingRails: [],
    account: ACCOUNT,
    checkouts: [],
    checkoutAnswer: null,
    portals: 0,
    meDelayMs: 0,
    healthDelayMs: 0,
    health: {},
    ...(over || {})
  };
}

function licenceClaims(ent) {
  const now = nowSec();
  return {
    iss: "vocal-studio-entitlements",
    sub: LIC,
    aud: BASE,
    plan: "pro_monthly",
    status: "active",
    provider: ent.provider,
    source: ent.source,
    accountId: ACCOUNT.id,
    iat: now,
    exp: now + 3 * DAY,
    periodEnd: ent.periodEnd
  };
}

async function meBody(state, license) {
  const ent = state.entitlement;
  return {
    ok: true,
    account: state.account,
    entitlement: ent,
    grants: [],
    paid: [],
    billingRails: state.billingRails,
    licenseId: ent.pro ? LIC : null,
    token: ent.pro ? await license.sign(licenceClaims(ent)) : null
  };
}

function health(state) {
  return {
    ok: true,
    signingKeyConfigured: true,
    accountsConfigured: true,
    creemConfigured: true,
    creemCheckoutConfigured: true,
    creemPortalConfigured: true,
    mercadopagoConfigured: true,
    authMethods: { email: true, google: false, googleClientId: null, trialDays: 7 },
    siteOrigin: BASE,
    ...state.health
  };
}

/** /v1/health, after `healthDelayMs` when a case needs the dialog drawn before it answers. */
async function lateHealth(state) {
  if (state.healthDelayMs) await new Promise((r) => setTimeout(r, state.healthDelayMs));
  return [200, health(state)];
}

async function answer(state, license, request) {
  const path = new URL(request.url()).pathname;
  if (path === "/v1/events") return [200, { ok: true }];
  if (path === "/v1/health") return lateHealth(state);
  if (path === "/v1/auth/methods") return [200, { ok: true, email: true, google: false, googleClientId: null, trialDays: 7 }];
  const signedIn = (request.headers().authorization || "") === `Bearer ${SESSION}`;
  if (path.startsWith("/v1/me") && !signedIn) return [401, { ok: false, reason: "no_session" }];
  if (path === "/v1/me") {
    if (state.meDelayMs) await new Promise((r) => setTimeout(r, state.meDelayMs));
    return [200, await meBody(state, license)];
  }
  if (path === "/v1/me/checkout") {
    let body = {};
    try {
      body = request.postDataJSON() || {};
    } catch {
      body = {};
    }
    state.checkouts.push(body);
    return state.checkoutAnswer || [200, { ok: true, url: CHECKOUT_PAGE, plan: body.plan, provider: "creem" }];
  }
  if (path === "/v1/me/billing-portal") {
    state.portals += 1;
    return [200, { ok: true, url: PORTAL_PAGE, provider: "creem" }];
  }
  if (path === "/v1/me/progress") return [200, { ok: true, profiles: [], rev: 0, doc: null, updatedAt: 1 }];
  return [404, { ok: false, reason: "not_found" }];
}

/**
 * Stand the worker in and sign the account in. Returns where the page went:
 * `navigations` in this tab (Creem, Mercado Pago in the same tab), `opened`
 * for Mercado Pago tabs of their own.
 */
async function install(page, state, license, opts) {
  const o = { lang: "en", e2e: true, seed: {}, ...(opts || {}) };
  const navigations = [];
  const opened = [];
  await patchBillingConfig(page, {
    verification: { publicKeyJwk: license.publicKeyJwk, required: true, revalidateHours: 24 * 365 },
    ...(o.config || {})
  });
  await page.route(`${API}/**`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    }
    const [status, body] = await answer(state, license, route.request());
    return route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  });
  // This tab's own routes, Mercado Pago included: a page's route is tried
  // before its context's, so only a tab of its own reaches the context's.
  for (const glob of ["https://checkout.creem.io/**", "https://creem.io/**", "https://billing.stripe.com/**", "https://www.mercadopago.com.pe/**"]) {
    await page.route(glob, (route) => {
      navigations.push(route.request().url());
      return route.fulfill({ status: 200, contentType: "text/html", body: "<p>elsewhere</p>" });
    });
  }
  await page.context().route("https://www.mercadopago.com.pe/**", (route) => {
    opened.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: "<p>Mercado Pago</p>" });
  });
  await page.addInitScript((seed) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", seed.lang);
      // vt_e2e pauses the home banner (valueMomentPaused); a case about that banner turns it off.
      if (seed.e2e) sessionStorage.setItem("vt_e2e", "1");
      // app.js hides toasts under vt_e2e; these cases are about what the person is told.
      sessionStorage.setItem("vt_debug", "1");
      if (!sessionStorage.getItem("vt_seeded")) {
        sessionStorage.setItem("vt_seeded", "1");
        localStorage.setItem("vt_account_session_v1", JSON.stringify({ token: seed.session, expiresAt: 4102444800 }));
        for (const [k, v] of Object.entries(seed.extra)) localStorage.setItem(k, v);
      }
    } catch {
      /* ignore */
    }
  }, { session: SESSION, lang: o.lang, e2e: o.e2e, extra: o.seed });
  return { navigations, opened };
}

/**
 * Record every text the toast shows, in Node, so a toast shown just before
 * the page leaves (for the Creem portal, for Mercado Pago) is still seen.
 * Call before the page is opened.
 */
async function recordToasts(page) {
  const seen = [];
  await page.exposeBinding("__vtToastSeen", (_src, t) => {
    seen.push(t);
  });
  await page.addInitScript(() => {
    const hook = () => {
      const el = document.getElementById("toast");
      if (!el) return setTimeout(hook, 20);
      new MutationObserver(() => {
        const t = (el.textContent || "").trim();
        if (t) window.__vtToastSeen(t);
      }).observe(el, { childList: true, characterData: true, subtree: true });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hook);
    else hook();
  });
  return seen;
}

/** Whether the home card's Pro analysis is locked: its lock shown, its panel marked locked. */
function insightsLock(page) {
  return page.evaluate(() => {
    const lock = document.getElementById("pro-insights-lock");
    const panel = document.getElementById("pro-insights-panel");
    return { lockShown: !!lock && !lock.hidden, locked: !!panel && panel.classList.contains("is-locked") };
  });
}

/** How the header's Pro element looks, once any transition has run its course. */
function headerLook(page) {
  return page.evaluate(() => {
    const b = document.getElementById("btn-pricing");
    b.getAnimations().forEach((a) => a.finish());
    const cs = getComputedStyle(b);
    return { color: cs.color, fill: `${cs.backgroundColor} ${cs.backgroundImage}`, border: cs.borderTopColor };
  });
}

async function open(page, hash) {
  await page.goto(`${BASE}/index.html${hash || ""}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTBilling && !!window.VTAccount && !!window.VTLicense, null, { timeout: 10000 });
}

/** The account's /v1/me answer has landed, with the rails and the Pro it gives. */
async function accountLanded(page, rails) {
  await expect.poll(() => page.evaluate(() => window.VTAccount.getState().account?.id || null)).toBe(ACCOUNT.id);
  await expect.poll(() => page.evaluate(() => window.VTAccount.getState().billingRails)).toEqual(rails);
}

function licenceNow(page) {
  return page.evaluate(() => {
    const claims = window.VTLicense.getClaims();
    return { pro: !!claims, provider: claims?.provider || null };
  });
}

async function openPricing(page) {
  await page.locator("#btn-pricing").click();
  await expect(page.locator("#pricing-modal")).toBeVisible();
}

/** Open the dialog a second time, once /v1/health has answered, so it follows what the worker said. */
async function openPricingSettled(page) {
  await openPricing(page);
  await expect.poll(() => page.evaluate(() => window.VTAccount.knownRails() !== null), { timeout: 8000 }).toBe(true);
  await page.locator("#pricing-close").click();
  await expect(page.locator("#pricing-modal")).toBeHidden();
  await openPricing(page);
}

/** What the Pro dialog draws: status, header, the plans' buttons, the trial, Manage and the cancel line. */
function dialogNow(page) {
  return page.evaluate(() => {
    const shown = (el) => !!el && !el.hidden && el.getClientRects().length > 0;
    const manage = document.getElementById("btn-manage-billing");
    const note = document.getElementById("pricing-cancel-note");
    // The line for a second subscription open on another rail: what it says while shown.
    const alsoEl = document.getElementById("pricing-also-open");
    const also = shown(alsoEl) ? { key: alsoEl.getAttribute("data-i18n"), text: alsoEl.textContent.trim() } : { key: null, text: "" };
    return {
      status: (document.getElementById("pricing-status")?.textContent || "").trim(),
      header: (document.getElementById("btn-pricing")?.textContent || "").trim(),
      plans: [...document.querySelectorAll("#pricing-grid .plan-cta")].map((b) => ({
        plan: b.dataset.plan,
        text: b.textContent.trim(),
        manage: b.dataset.route === "manage",
        disabled: b.disabled
      })),
      trialShown: shown(document.getElementById("btn-start-trial")),
      manageShown: shown(manage),
      manageLabel: (manage?.textContent || "").trim(),
      noteShown: !!note && !note.hidden,
      noteKey: note?.getAttribute("data-i18n") || null,
      noteText: (note?.textContent || "").trim(),
      alsoKey: also.key,
      alsoText: also.text
    };
  });
}

/** The pre-launch line for somebody whose free trial is spent. */
function spentLineNow(page) {
  return page.evaluate(() => {
    const el = document.getElementById("pricing-spent");
    return { shown: !!el && !el.hidden && el.getClientRects().length > 0, text: (el?.textContent || "").trim() };
  });
}

/** The paid plans' buttons only. */
const paid = (d) => d.plans.filter((p) => p.plan !== "free");

/** What the home card's plan tag says, and the class it wears, as tests/account-pro-states.spec.js reads it. */
function homeTag(page) {
  return page.evaluate(() => {
    const el = document.querySelector("#value-pulse-tag");
    if (!el || el.hidden) return null;
    return { text: (el.textContent || "").trim(), kind: el.className.replace("value-pulse-tag", "").trim() };
  });
}

/** What the account panel says about the plan, and whether it offers the trial. */
async function accountPanelNow(page) {
  await page.locator("#btn-account").click();
  await expect(page.locator("#account-modal")).toBeVisible();
  return page.evaluate(() => {
    const trial = document.getElementById("btn-account-trial");
    return {
      plan: (document.getElementById("account-plan")?.textContent || "").trim(),
      trialShown: !!trial && !trial.hidden && trial.getClientRects().length > 0,
      pricing: (document.getElementById("btn-account-pricing")?.textContent || "").trim()
    };
  });
}

// states-1 and money-3 (page half).
test.describe("Pro off with a Creem subscription still open is on hold, never sold again", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  test("the header, the Pro window and the account panel say on hold, offer no trial, and the plans go to the portal, not to a checkout", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ billingRails: ["creem"] });
    const { navigations } = await install(page, state, license, { config: ON_SALE });
    await open(page);
    await accountLanded(page, ["creem"]);
    expect(await licenceNow(page), "precondition: no Pro").toEqual({ pro: false, provider: null });
    // Wrong (before): the home card said "Free", the header's old reading.
    await expect.poll(() => homeTag(page)).toEqual({ text: "On hold", kind: "is-hold" });
    // On hold is not Pro: the home card's Pro analysis stays locked (the
    // paying control below has it open).
    await expect.poll(() => insightsLock(page)).toEqual({ lockShown: true, locked: true });

    const panel = await accountPanelNow(page);
    // Wrong (before): "Free plan" and "Start 7 free days" for a subscriber.
    expect(panel.plan).toMatch(/^Pro on hold\. Your subscription is still open/);
    expect(panel.trialShown, "no free trial for somebody with a subscription open").toBe(false);
    await page.locator("#account-close").click();

    await openPricingSettled(page);
    const d = await dialogNow(page);
    // Wrong (before): "Try Pro" in the header and "Free plan" in the window.
    expect(d.header).toBe("Pro on hold");
    expect(d.status).toMatch(/^Pro on hold · your subscription is still open/);
    expect(d.trialShown).toBe(false);
    // Wrong (before): both paid plans said "Subscribe" and opened a checkout.
    expect(paid(d)).toEqual([
      { plan: "pro_monthly", text: "Manage my subscription", manage: true, disabled: false },
      { plan: "pro_yearly", text: "Manage my subscription", manage: true, disabled: false }
    ]);
    expect(d.manageShown).toBe(true);
    expect(d.noteKey).toBe("pricing.cancel.lapsed");

    await page.locator('#pricing-grid .plan-cta[data-plan="pro_yearly"]').click();
    await page.waitForURL(PORTAL_PAGE);
    expect(state.checkouts, "no second checkout was asked for").toEqual([]);
    expect(state.portals).toBe(1);
    expect(navigations).toEqual([PORTAL_PAGE]);
  });

  test("control: the same account with no subscription open is free, is offered the trial, and Subscribe opens the checkout", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ billingRails: [] });
    const { navigations } = await install(page, state, license, { config: ON_SALE });
    await open(page);
    await accountLanded(page, []);
    await expect.poll(() => homeTag(page)).toEqual({ text: "Free", kind: "is-free" });
    const panel = await accountPanelNow(page);
    expect(panel.plan).toBe("Free plan");
    expect(panel.trialShown).toBe(true);
    await page.locator("#account-close").click();

    await openPricingSettled(page);
    const d = await dialogNow(page);
    expect(d.header).toBe("Try Pro");
    expect(d.status).toBe("Free plan");
    expect(d.trialShown).toBe(true);
    expect(paid(d).map((p) => [p.text, p.manage])).toEqual([["Subscribe", false], ["Subscribe", false]]);
    expect(d.manageShown).toBe(false);
    expect(d.noteShown).toBe(false);

    await page.locator('#pricing-grid .plan-cta[data-plan="pro_monthly"]').click();
    await page.waitForURL(CHECKOUT_PAGE);
    expect(state.checkouts).toEqual([{ plan: "pro_monthly", provider: "creem", returnPath: "/index.html", currency: "USD" }]);
    expect(state.portals).toBe(0);
    expect(navigations).toEqual([CHECKOUT_PAGE]);
  });

  test("control: a paying Creem subscriber's home card says Pro and has its Pro analysis open", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ entitlement: paidOn("creem"), billingRails: ["creem"] });
    await install(page, state, license, { config: ON_SALE });
    await open(page);
    await accountLanded(page, ["creem"]);
    await expect.poll(() => homeTag(page).then((t) => t && t.kind)).toBe("is-pro");
    await expect.poll(() => insightsLock(page)).toEqual({ lockShown: false, locked: false });
  });

  test("the on-hold header does not wear the offer's look, and takes the offer's look once nothing is open", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ billingRails: ["creem"] });
    await install(page, state, license, { config: ON_SALE });
    await open(page);
    await accountLanded(page, ["creem"]);
    await expect(page.locator("#btn-pricing")).toHaveText("Pro on hold");
    const held = await headerLook(page);
    // The subscription is closed elsewhere; the same element is the offer again.
    state.billingRails = [];
    await page.evaluate(() => window.VTAccount.refresh());
    await accountLanded(page, []);
    await expect(page.locator("#btn-pricing")).toHaveText("Try Pro");
    // Wrong: the on-hold pill in the offer's gold, so "Pro on hold" reads as
    // one more "buy Pro" button. Colour agrees with the words, never against them.
    await expect.poll(() => headerLook(page)).not.toEqual(held);
  });

  for (const [title, rails, want] of [
    ["the home banner does not sell Pro to a subscriber on hold", ["creem"], false],
    ["control: the same banner, asked for by a free account, sells Pro", [], true]
  ]) {
    test(title, async ({ page }) => {
      const license = await mintLicense({ origin: BASE });
      const state = freshState({ billingRails: rails });
      // vt_e2e off: it pauses the banner for every other case.
      await install(page, state, license, { config: ON_SALE, e2e: false });
      // The history view, where the home card and its banner are.
      await open(page, "#historial");
      await accountLanded(page, rails);
      await expect(page.locator("#btn-pricing")).toHaveText(rails.length ? "Pro on hold" : "Try Pro");
      // showValueMoment draws synchronously, so its answer is read in the same
      // step. (A banner forced on an empty profile is put away a moment later
      // by the page's own re-check, which has no moment of its own to show.)
      const drawn = await page.evaluate(() => {
        window.VTApp.showValueMoment("hold_pr");
        const b = document.getElementById("value-banner");
        return { shown: !b.hidden && b.getClientRects().length > 0, text: (document.getElementById("value-banner-text")?.textContent || "").trim() };
      });
      if (want) {
        expect(drawn.shown).toBe(true);
        expect(drawn.text).toContain("With Pro");
      } else {
        // Wrong (before): "New record... With Pro you keep and download that
        // history" under a header saying the subscription is on hold.
        expect(drawn.shown).toBe(false);
      }
    });
  }

  for (const [title, rails, want] of [
    ["a free trial in this browser over a subscription still open: the line says so, and the plans go to Manage", ["creem"], { noteKey: "pricing.cancel.aside", plans: ["Manage my subscription", "Manage my subscription"] }],
    ["control: the same trial with no subscription open: no line, and the plans are offers", [], { noteKey: null, plans: ["Subscribe", "Subscribe"] }]
  ]) {
    test(title, async ({ page }) => {
      const license = await mintLicense({ origin: BASE });
      const state = freshState({ billingRails: rails });
      // Started in this browser before signing in: its entitlement is the browser's own trial.
      await install(page, state, license, { config: ON_SALE, seed: { vt_billing_trial_started_v1: new Date().toISOString() } });
      await open(page);
      await accountLanded(page, rails);
      expect(await page.evaluate(() => window.VTBilling.getEntitlement().status), "precondition: the browser's own trial").toBe("trial");
      await openPricingSettled(page);
      const d = await dialogNow(page);
      // Wrong: a trial read as Pro paid on the open subscription, so the line
      // said "You paid by card through Creem".
      expect(d.noteKey).toBe(want.noteKey);
      if (want.noteKey) expect(d.noteText).toContain(d.manageLabel);
      expect(paid(d).map((p) => p.text)).toEqual(want.plans);
    });
  }

  test("an account answer that lands after the dialog is drawn turns its Subscribe buttons into Manage", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ billingRails: ["creem"], meDelayMs: 2500 });
    await install(page, state, license, { config: ON_SALE });
    await open(page);
    await openPricing(page);
    // Precondition: drawn before /v1/me landed, as a free account.
    expect(await page.evaluate(() => window.VTAccount.getState().account)).toBeNull();
    expect(paid(await dialogNow(page)).map((p) => p.text)).toEqual(["Subscribe", "Subscribe"]);
    await accountLanded(page, ["creem"]);
    // Wrong: the open dialog kept "Subscribe" until it was closed and opened again.
    await expect.poll(async () => paid(await dialogNow(page)).map((p) => p.text)).toEqual(["Manage my subscription", "Manage my subscription"]);
    expect((await dialogNow(page)).header).toBe("Pro on hold");
  });
});

// truth-5: the cause is not on the wire, so the line must not guess it.
test.describe("the on-hold line says what is known, not a guessed cause", () => {
  test.use({ locale: "es-PE", timezoneId: "America/Lima" });

  test("Pro off with a subscription open: the line names the three possible causes and asserts none", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    // A refund (refund.created, no cancel) and a renewal being retried give
    // the browser this same answer (red team round two, truth-5).
    const state = freshState({ billingRails: ["creem"] });
    await install(page, state, license, { lang: "es", config: ON_SALE });
    await open(page);
    await accountLanded(page, ["creem"]);
    await openPricingSettled(page);
    const d = await dialogNow(page);
    expect(d.noteKey).toBe("pricing.cancel.lapsed");
    // Wrong (before): "suele ser un cobro que no pasó", false after a refund.
    expect(d.noteText).not.toMatch(/cobro que no pasó|no se pudo hacer/);
    expect(d.noteText).toMatch(/reintentando/);
    expect(d.noteText).toMatch(/devolvió/);
    expect(d.noteText).toMatch(/pausa/);
    expect(d.noteText).toContain(d.manageLabel);
  });

  test("control: where the worker does say the payment failed (past_due, Pro still on), the window says so", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const pastDue = { ...paidOn("creem"), status: "past_due" };
    const state = freshState({ entitlement: pastDue, billingRails: ["creem"] });
    await install(page, state, license, { lang: "es", config: ON_SALE });
    await open(page);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem" });
    await accountLanded(page, ["creem"]);
    await openPricingSettled(page);
    const d = await dialogNow(page);
    expect(d.status).toMatch(/el último cobro no se pudo hacer/);
    expect(d.noteKey).toBe("pricing.cancel.creem");
  });
});

// tests-4: the Mercado Pago half of the lapsed state.
test.describe("Pro off with a Mercado Pago subscription still open", () => {
  test.use({ locale: "es-PE", timezoneId: "America/Lima" });

  test("the button and the line are there, and Manage and the plans open their Mercado Pago subscriptions, with nothing on sale yet", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ billingRails: ["mercadopago"] });
    // The shipped config: nothing on sale (pre-launch), which must not hold the route back.
    const { navigations, opened } = await install(page, state, license, { lang: "es" });
    await open(page);
    await accountLanded(page, ["mercadopago"]);
    expect(await licenceNow(page)).toEqual({ pro: false, provider: null });
    await openPricingSettled(page);
    const d = await dialogNow(page);
    expect(d.header).toBe("Pro en espera");
    // Wrong (the mutant that drops "mercadopago" from billingRailFor): no button, no line.
    expect(d.manageShown).toBe(true);
    expect(d.manageLabel).toBe("Gestionar o cancelar suscripción");
    expect(d.noteKey).toBe("pricing.cancel.lapsed");
    expect(d.noteText).toContain(d.manageLabel);
    // Pre-launch the plans said "Aún no"; for a subscriber they go to Manage.
    expect(paid(d).map((p) => [p.text, p.manage, p.disabled])).toEqual([
      ["Gestionar mi suscripción", true, false],
      ["Gestionar mi suscripción", true, false]
    ]);

    let tab = page.context().waitForEvent("page");
    await page.locator("#btn-manage-billing").click();
    await expect.poll(async () => (await tab).url()).toBe(MP_SUBSCRIPTIONS);
    tab = page.context().waitForEvent("page");
    await page.locator('#pricing-grid .plan-cta[data-plan="pro_monthly"]').click();
    await expect.poll(async () => (await tab).url()).toBe(MP_SUBSCRIPTIONS);
    expect(opened).toEqual([MP_SUBSCRIPTIONS, MP_SUBSCRIPTIONS]);
    expect(navigations, "the site's own tab stays").toEqual([]);
    expect(state.portals).toBe(0);
    expect(state.checkouts).toEqual([]);
  });

  test("control: no subscription open on any rail: no button, no line, and the plans are not Manage", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ billingRails: [] });
    await install(page, state, license, { lang: "es" });
    await open(page);
    await accountLanded(page, []);
    await openPricingSettled(page);
    const d = await dialogNow(page);
    expect(d.manageShown).toBe(false);
    expect(d.noteShown).toBe(false);
    expect(paid(d).some((p) => p.manage)).toBe(false);
    expect(d.header).toBe("Probar Pro");
  });

  // Pre-launch, the line for a spent trial says "cuando los pagos abran podrás
  // suscribirte desde aquí". To somebody with a subscription still open that
  // is an offer to buy a second one, and it is false: they already have one.
  test("pre-launch, a subscriber whose trial is spent is not told they can subscribe once payments open", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ billingRails: ["mercadopago"], account: { ...ACCOUNT, trialUsed: true } });
    await install(page, state, license, { lang: "es" });
    await open(page);
    await accountLanded(page, ["mercadopago"]);
    await openPricingSettled(page);
    expect((await dialogNow(page)).header).toBe("Pro en espera");
    expect(await spentLineNow(page)).toEqual({ shown: false, text: "" });
  });

  test("control: the same spent trial with no subscription open is told where they stand", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ billingRails: [], account: { ...ACCOUNT, trialUsed: true } });
    await install(page, state, license, { lang: "es" });
    await open(page);
    await accountLanded(page, []);
    await openPricingSettled(page);
    expect(await spentLineNow(page)).toEqual({
      shown: true,
      text: "Ya usaste tu prueba gratis. Todo lo gratis sigue igual, y cuando los pagos abran podrás suscribirte desde aquí."
    });
  });
});

// tests-5: no portal route, and still never nothing.
test.describe("Pro off with a Creem subscription open, on a worker that cannot open the portal", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  test("no button, but a line saying where Creem's link is, and plans that say a subscription is open instead of selling one", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ billingRails: ["creem"], health: { creemPortalConfigured: false } });
    const { navigations } = await install(page, state, license, { config: ON_SALE });
    await open(page);
    await accountLanded(page, ["creem"]);
    await openPricingSettled(page);
    expect(await page.evaluate(() => window.VTAccount.knownRails().creemPortal), "precondition: the worker said no").toBe(false);
    const d = await dialogNow(page);
    expect(d.manageShown).toBe(false);
    expect(d.manageLabel).toBe("Manage or cancel subscription");
    // Wrong (before): no line at all, and two live "Subscribe" buttons.
    expect(d.noteShown).toBe(true);
    expect(d.noteKey).toBe("pricing.cancel.lapsedEmail");
    expect(d.noteText).toMatch(/still open, but Pro is off/);
    expect(d.noteText).toMatch(/link Creem emails you/);
    expect(d.noteText, "the line never names a button that is not drawn").not.toContain(d.manageLabel);
    // No route from this page: a button that could only answer with a toast
    // says why it cannot be pressed, as the pre-launch "Not available yet" does.
    expect(paid(d)).toEqual([
      { plan: "pro_monthly", text: "You already have a subscription", manage: false, disabled: true },
      { plan: "pro_yearly", text: "You already have a subscription", manage: false, disabled: true }
    ]);
    await page.locator('#pricing-grid .plan-cta[data-plan="pro_monthly"]').click({ force: true });
    expect(state.checkouts).toEqual([]);
    expect(state.portals).toBe(0);
    expect(navigations).toEqual([]);
  });

  for (const [title, rails, want] of [
    ["on the first opening, plans drawn before the worker said no are drawn again once it does", ["creem"], ["You already have a subscription", true]],
    ["control: with no subscription open, the same first opening keeps Subscribe", [], ["Subscribe", false]]
  ]) {
    test(title, async ({ page }) => {
      const license = await mintLicense({ origin: BASE });
      // /v1/health answers late, so the dialog is surely drawn before it does.
      const state = freshState({ billingRails: rails, health: { creemPortalConfigured: false }, healthDelayMs: 1500 });
      await install(page, state, license, { config: ON_SALE });
      await open(page);
      await accountLanded(page, rails);
      await openPricing(page);
      // Precondition: drawn before the worker's answer, when the portal was still possible.
      expect(await page.evaluate(() => window.VTAccount.knownRails())).toBeNull();
      expect(paid(await dialogNow(page)).map((p) => p.text)).toEqual(rails.length ? ["Manage my subscription", "Manage my subscription"] : ["Subscribe", "Subscribe"]);
      await expect.poll(() => page.evaluate(() => window.VTAccount.knownRails()?.creemPortal ?? null), { timeout: 8000 }).toBe(false);
      // Wrong (before): "Manage my subscription" stayed live beside a hidden Manage button until the dialog was opened again.
      await expect.poll(async () => paid(await dialogNow(page)).map((p) => [p.text, p.disabled])).toEqual([want, want]);
    });
  }

  test("a Manage press left over from before the worker said no says where Creem's link is, and opens nothing", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    // The dialog is drawn while /v1/health still says yes, then the worker says no.
    const state = freshState({ billingRails: ["creem"] });
    const { navigations } = await install(page, state, license, { config: ON_SALE });
    await open(page);
    await accountLanded(page, ["creem"]);
    await openPricingSettled(page);
    const cta = page.locator('#pricing-grid .plan-cta[data-plan="pro_monthly"]');
    await expect(cta).toHaveText("Manage my subscription");
    await page.evaluate(() => {
      const r = window.VTAccount.knownRails();
      // The worker has since said it cannot open the portal (a redeploy without CREEM_API_KEY).
      window.VTAccount.knownRails = () => ({ ...r, creemPortal: false });
      document.querySelector("#toast").textContent = "";
    });
    await cta.click();
    await expect(page.locator("#toast")).toContainText(/still open, but Pro is off.*link Creem emails you/);
    expect(state.checkouts).toEqual([]);
    expect(state.portals).toBe(0);
    expect(navigations).toEqual([]);
  });

  // The line above for Pro off is the control: same worker, same open
  // subscription, only where Pro comes from differs.
  test("a gift over the open subscription, same worker: the line says the gift, never that Pro is off, and where Creem's link is", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ entitlement: GIFT, billingRails: ["creem"], health: { creemPortalConfigured: false } });
    await install(page, state, license, { config: ON_SALE });
    await open(page);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "gift" });
    await accountLanded(page, ["creem"]);
    await openPricingSettled(page);
    const d = await dialogNow(page);
    expect(d.manageShown).toBe(false);
    // Wrong: "Your subscription is still open, but Pro is off", to somebody
    // whose gift gives them Pro right now.
    expect(d.noteKey).toBe("pricing.cancel.asideEmail");
    expect(d.noteText).not.toMatch(/Pro is off/);
    expect(d.noteText).toMatch(/gift or a trial.*link Creem emails you/);
    expect(paid(d).map((p) => [p.text, p.disabled])).toEqual([
      ["You already have a subscription", true],
      ["You already have a subscription", true]
    ]);
  });

  test("control: no subscription open, same worker: no line, and Subscribe is an offer", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ billingRails: [], health: { creemPortalConfigured: false } });
    await install(page, state, license, { config: ON_SALE });
    await open(page);
    await accountLanded(page, []);
    await openPricingSettled(page);
    const d = await dialogNow(page);
    expect(d.noteShown).toBe(false);
    expect(d.manageShown).toBe(false);
    expect(paid(d).map((p) => [p.text, p.disabled])).toEqual([["Subscribe", false], ["Subscribe", false]]);
  });
});

// The redraw when /v1/health answers, for an account with nothing open: only
// the chrome is painted again (the plan buttons, and a focus on one, stay).
// A Creem subscription cancelled at the end of its period still gives Pro and
// still has its Manage button, but the worker lists no open subscription for it.
test.describe("a cancelled Creem subscription, still in its paid period, on the dialog's first opening", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });
  const CANCELLED = { ...paidOn("creem"), status: "canceled" };

  for (const [title, portal, want] of [
    ["first opening on a worker that cannot open the portal: the button goes once the worker says so", false, { manageShown: false, noteKey: "pricing.cancel.creemEmail" }],
    ["control: first opening on a worker that can: the button stays, and the line names it", true, { manageShown: true, noteKey: "pricing.cancel.creem" }]
  ]) {
    test(title, async ({ page }) => {
      const license = await mintLicense({ origin: BASE });
      const state = freshState({ entitlement: CANCELLED, billingRails: [], health: { creemPortalConfigured: portal }, healthDelayMs: 1500 });
      await install(page, state, license, { config: ON_SALE });
      await open(page);
      await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem" });
      await accountLanded(page, []);
      await openPricing(page);
      // Precondition: drawn before the worker's answer, when the portal was still possible.
      expect(await page.evaluate(() => window.VTAccount.knownRails())).toBeNull();
      expect((await dialogNow(page)).manageShown).toBe(true);
      await expect.poll(() => page.evaluate(() => window.VTAccount.knownRails()?.creemPortal ?? null), { timeout: 8000 }).toBe(portal);
      // Wrong: the button the worker cannot open, and the line naming it, kept for the whole first opening.
      await expect.poll(async () => {
        const d = await dialogNow(page);
        return { manageShown: d.manageShown, noteKey: d.noteKey };
      }).toEqual(want);
    });
  }
});

// money-5: a gift's licence names the gift, not the card being charged.
test.describe("a gift month over a Creem subscription whose renewal is being retried", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  test("keeps the Manage button, a line saying the subscription is open beside the gift, and plans that go to the portal", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ entitlement: GIFT, billingRails: ["creem"] });
    const { navigations } = await install(page, state, license, { config: ON_SALE });
    await open(page);
    // Precondition: Pro, and the licence names the gift, as the worker mints it.
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "gift" });
    await accountLanded(page, ["creem"]);
    await openPricingSettled(page);
    const d = await dialogNow(page);
    // Wrong (before): billingRailFor returned "gift", so no button and no line.
    expect(d.manageShown).toBe(true);
    expect(d.noteKey).toBe("pricing.cancel.aside");
    expect(d.noteText).toContain(d.manageLabel);
    expect(d.header, "the gift is what the header names").toMatch(/^Gift · /);
    expect(paid(d).every((p) => p.manage)).toBe(true);
    await page.locator("#btn-manage-billing").click();
    await page.waitForURL(PORTAL_PAGE);
    expect(state.portals).toBe(1);
    expect(state.checkouts).toEqual([]);
    expect(navigations).toEqual([PORTAL_PAGE]);
  });

  test("control: Pro paid on Mercado Pago with a Creem subscription also open is paid Pro, never said to come from a gift", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ entitlement: paidOn("mercadopago"), billingRails: ["creem", "mercadopago"] });
    await install(page, state, license, { config: ON_SALE });
    await open(page);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "mercadopago" });
    await accountLanded(page, ["creem", "mercadopago"]);
    await openPricingSettled(page);
    const d = await dialogNow(page);
    expect(d.header).toBe("Pro · active");
    // Wrong: "Your Pro comes from a gift or a trial right now", said to somebody paying.
    expect(d.noteKey).toBe("pricing.cancel.mercadopago");
    expect(d.noteText).not.toMatch(/gift/);
  });

  // A licence minted before the token named its rail (provider missing) is
  // the paid subscription itself; the gift above is the control.
  test("a licence older than the rail field over an open Creem subscription is that subscription, never said to come from a gift or a trial", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ entitlement: { ...paidOn(undefined), source: "paid" }, billingRails: ["creem"] });
    await install(page, state, license, { config: ON_SALE });
    await open(page);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: null });
    await accountLanded(page, ["creem"]);
    await openPricingSettled(page);
    const d = await dialogNow(page);
    expect(d.header).toBe("Pro · active");
    // Wrong: "Your Pro comes from a gift or a trial right now", to a payer.
    expect(d.noteKey).toBe("pricing.cancel.creem");
    expect(d.noteText).not.toMatch(/gift or a trial/);
    expect(d.manageShown).toBe(true);
  });

  test("control: the same gift with no subscription open charges nobody: no button, no line, Subscribe stays an offer", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ entitlement: GIFT, billingRails: [] });
    await install(page, state, license, { config: ON_SALE });
    await open(page);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "gift" });
    await accountLanded(page, []);
    await openPricingSettled(page);
    const d = await dialogNow(page);
    expect(d.manageShown).toBe(false);
    expect(d.noteShown).toBe(false);
    expect(paid(d).map((p) => p.text)).toEqual(["Subscribe", "Subscribe"]);
  });
});

// A second subscription open on another rail than the one Pro is paid on (a
// Creem renewal still retried after a move to Mercado Pago) can still renew:
// it is named, with the route that needs no second button.
test.describe("a second subscription open on another rail is named, with its own route", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  for (const [title, provider, rails, want] of [
    ["Pro paid on Mercado Pago, a Creem subscription also open: a line names Creem and its emailed link", "mercadopago", ["creem", "mercadopago"], { note: "pricing.cancel.mercadopago", also: "pricing.cancel.alsoOpenCreem", text: /also have a subscription open with Creem.*link Creem emails you/ }],
    ["Pro paid on Creem, a Mercado Pago subscription also open: a line names Mercado Pago and where it is cancelled", "creem", ["creem", "mercadopago"], { note: "pricing.cancel.creem", also: "pricing.cancel.alsoOpenMp", text: /also have a subscription open with Mercado Pago.*Mercado Pago account, under subscriptions/ }],
    ["control: Pro paid on Mercado Pago with only that subscription open: no second line", "mercadopago", ["mercadopago"], { note: "pricing.cancel.mercadopago", also: null, text: /^$/ }]
  ]) {
    test(title, async ({ page }) => {
      const license = await mintLicense({ origin: BASE });
      const state = freshState({ entitlement: paidOn(provider), billingRails: rails });
      await install(page, state, license, { config: ON_SALE });
      await open(page);
      await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider });
      await accountLanded(page, rails);
      await openPricingSettled(page);
      const d = await dialogNow(page);
      expect(d.noteKey).toBe(want.note);
      // Wrong (before): the second subscription, which can still renew, was mentioned nowhere.
      expect(d.alsoKey).toBe(want.also);
      expect(d.alsoText).toMatch(want.text);
    });
  }

  test("the line follows a change of language", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ entitlement: paidOn("mercadopago"), billingRails: ["creem", "mercadopago"] });
    await install(page, state, license, { config: ON_SALE });
    await open(page);
    await accountLanded(page, ["creem", "mercadopago"]);
    await openPricingSettled(page);
    expect((await dialogNow(page)).alsoText).toMatch(/^You also have a subscription open with Creem/);
    await page.evaluate(() => window.VTI18n.setLang("es"));
    await expect.poll(async () => (await dialogNow(page)).alsoText).toMatch(/^También tienes una suscripción abierta con Creem/);
  });
});

// states-7: the line names the button only where the button is drawn, on every rail.
test.describe("a Stripe payer's cancel line follows whether the portal button is drawn", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  test("no portal configured: no button, and no line naming it", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ entitlement: paidOn("stripe"), billingRails: [] });
    await install(page, state, license);
    await open(page);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "stripe" });
    await openPricingSettled(page);
    const d = await dialogNow(page);
    expect(d.manageShown).toBe(false);
    // Wrong (before): "The “Manage or cancel subscription” button opens the portal..."
    expect(d.noteShown).toBe(false);
    expect(d.noteText).not.toContain(d.manageLabel);
  });

  test("control: with a Stripe portal configured, the button is drawn and the line names it", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ entitlement: paidOn("stripe"), billingRails: [] });
    await install(page, state, license, { config: { customerPortalUrl: STRIPE_PORTAL } });
    await open(page);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "stripe" });
    await openPricingSettled(page);
    const d = await dialogNow(page);
    expect(d.manageShown).toBe(true);
    expect(d.noteKey).toBe("pricing.cancel.stripe");
    expect(d.noteText).toContain(d.manageLabel);
  });
});

// A paying subscriber's other plan (red team round two, verifier): the worker
// refuses every checkout for an account with a subscription open, so an offer
// there could only ever answer with a refusal. Changing plan is done on the
// provider's own pages, where the Manage route goes.
test.describe("a paying subscriber is not sold the other plan as a second subscription", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  for (const [title, portal, rails, want] of [
    ["the yearly plan of a monthly Creem subscriber goes to their portal, and no checkout is asked for", true, ["creem"], { text: "Manage my subscription", manage: true, disabled: false }],
    ["on a worker that cannot open the portal, the yearly plan says a subscription is open and cannot be pressed", false, ["creem"], { text: "You already have a subscription", manage: false, disabled: true }],
    ["control: with no subscription open on the account, the yearly plan stays an offer and opens a checkout", true, [], { text: "Subscribe", manage: false, disabled: false }]
  ]) {
    test(title, async ({ page }) => {
      const license = await mintLicense({ origin: BASE });
      const state = freshState({ entitlement: paidOn("creem"), billingRails: rails, health: { creemPortalConfigured: portal } });
      const { navigations } = await install(page, state, license, { config: ON_SALE });
      await open(page);
      await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem" });
      await accountLanded(page, rails);
      await openPricingSettled(page);
      const d = await dialogNow(page);
      // Wrong (before): "Subscribe" on the yearly plan beside the monthly one paid for.
      expect(paid(d)).toEqual([
        { plan: "pro_monthly", text: "Current plan", manage: false, disabled: true },
        { plan: "pro_yearly", ...want }
      ]);
      await page.locator('#pricing-grid .plan-cta[data-plan="pro_yearly"]').click({ force: true });
      if (want.manage) {
        await page.waitForURL(PORTAL_PAGE);
        expect(state.checkouts).toEqual([]);
        expect(state.portals).toBe(1);
      } else if (want.disabled) {
        expect(state.checkouts).toEqual([]);
        expect(state.portals).toBe(0);
        expect(navigations).toEqual([]);
      } else {
        await page.waitForURL(CHECKOUT_PAGE);
        expect(state.checkouts.map((c) => c.plan)).toEqual(["pro_yearly"]);
        expect(state.portals).toBe(0);
      }
    });
  }

  for (const [title, rails, want] of [
    ["first opening on a worker that cannot open the portal: the yearly plan drawn as Manage is drawn again once the worker says no", ["creem"], ["You already have a subscription", true]],
    ["control: the same first opening with no subscription open keeps the yearly offer", [], ["Subscribe", false]]
  ]) {
    test(title, async ({ page }) => {
      const license = await mintLicense({ origin: BASE });
      // /v1/health answers late, so the dialog is surely drawn before it does.
      const state = freshState({ entitlement: paidOn("creem"), billingRails: rails, health: { creemPortalConfigured: false }, healthDelayMs: 1500 });
      await install(page, state, license, { config: ON_SALE });
      await open(page);
      await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem" });
      await accountLanded(page, rails);
      await openPricing(page);
      const yearly = page.locator('#pricing-grid .plan-cta[data-plan="pro_yearly"]');
      // Precondition: drawn before the worker's answer, when the portal was still possible.
      expect(await page.evaluate(() => window.VTAccount.knownRails())).toBeNull();
      await expect(yearly).toHaveText(rails.length ? "Manage my subscription" : "Subscribe");
      await expect.poll(() => page.evaluate(() => window.VTAccount.knownRails()?.creemPortal ?? null), { timeout: 8000 }).toBe(false);
      // Wrong: a live "Manage my subscription" beside a Manage button the worker just hid.
      await expect.poll(async () => [((await yearly.textContent()) || "").trim(), await yearly.isDisabled()]).toEqual(want);
    });
  }
});

/**
 * Open the dialog as an account whose /v1/me said nothing is open, and press
 * the monthly plan's Subscribe, with the worker answering `reply`. The page's
 * reading is stale: a subscription was opened since, in another tab or on
 * another device, which is the case the worker's own guard is there for.
 * `later` is what /v1/me says from then on.
 */
async function pressStaleSubscribe(page, reply, extra, later) {
  const seen = await recordToasts(page);
  const license = await mintLicense({ origin: BASE });
  const state = freshState({ billingRails: [], checkoutAnswer: reply, ...(extra || {}) });
  const ways = await install(page, state, license, { config: ON_SALE });
  await open(page);
  await accountLanded(page, []);
  await openPricingSettled(page);
  const monthly = page.locator('#pricing-grid .plan-cta[data-plan="pro_monthly"]');
  // Precondition: an offer, because as far as this page knows nothing is open.
  await expect(monthly).toHaveText("Subscribe");
  if (later) state.billingRails = later;
  await monthly.click();
  await expect.poll(() => state.checkouts.length).toBe(1);
  return { state, seen, ...ways };
}

const NO_SECOND = /did not open a second one and nothing was charged/;

// The worker's subscription_open refusal (group W) and what the page does with it.
test.describe("a checkout the worker refuses because a subscription is already open", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  test("on Creem: says so before it leaves, opens no second checkout, and takes them to their Creem portal", async ({ page }) => {
    const { state, seen, navigations } = await pressStaleSubscribe(page, [409, { ok: false, reason: "subscription_open", provider: "creem" }]);
    await page.waitForURL(PORTAL_PAGE);
    expect(state.checkouts.map((c) => c.plan), "one refused checkout, nothing more").toEqual(["pro_monthly"]);
    expect(state.portals).toBe(1);
    expect(navigations).toEqual([PORTAL_PAGE]);
    // Wrong: only "Opening billing portal", so the press looked like it did
    // something else than what was asked, with nothing said about the charge.
    expect(seen.some((t) => NO_SECOND.test(t) && /Creem portal/.test(t)), JSON.stringify(seen)).toBe(true);
  });

  test("on Mercado Pago: says so before it leaves, and takes them to their Mercado Pago subscriptions in this tab", async ({ page }) => {
    const { state, seen, navigations } = await pressStaleSubscribe(page, [409, { ok: false, reason: "subscription_open", provider: "mercadopago" }]);
    await page.waitForURL(MP_SUBSCRIPTIONS);
    expect(navigations).toEqual([MP_SUBSCRIPTIONS]);
    expect(state.portals).toBe(0);
    // Wrong: the page left for Mercado Pago without a word on why.
    expect(seen.some((t) => NO_SECOND.test(t) && /Mercado Pago/.test(t)), JSON.stringify(seen)).toBe(true);
  });

  test("control: a press of Manage says it is opening the portal, never the refusal", async ({ page }) => {
    const seen = await recordToasts(page);
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ entitlement: paidOn("creem"), billingRails: ["creem"] });
    await install(page, state, license, { config: ON_SALE });
    await open(page);
    await accountLanded(page, ["creem"]);
    await openPricingSettled(page);
    await page.locator("#btn-manage-billing").click();
    await page.waitForURL(PORTAL_PAGE);
    expect(seen.some((t) => NO_SECOND.test(t)), JSON.stringify(seen)).toBe(false);
    expect(seen.some((t) => /Opening billing portal/.test(t)), JSON.stringify(seen)).toBe(true);
  });

  test("on a worker that cannot open the portal: says where Creem's link is, and goes nowhere", async ({ page }) => {
    const { state, navigations } = await pressStaleSubscribe(
      page,
      [409, { ok: false, reason: "subscription_open", provider: "creem" }],
      { health: { creemPortalConfigured: false } }
    );
    const toast = page.locator("#toast");
    await expect(toast).toContainText("You already have a subscription open, so we did not open a second one and nothing was charged.");
    await expect(toast).toContainText(/link Creem emails you/);
    await expect(toast).not.toContainText(/couldn't open the checkout/);
    expect(state.portals).toBe(0);
    expect(navigations).toEqual([]);
  });

  for (const [title, reply, want] of [
    ["on that worker, the refusal teaches the page the open subscription: the plans stop selling", [409, { ok: false, reason: "subscription_open", provider: "creem" }], [["You already have a subscription", true], ["You already have a subscription", true]]],
    ["control: a plain failure on that worker leaves the plans as offers", [502, { ok: false, reason: "provider_error" }], [["Subscribe", false], ["Subscribe", false]]]
  ]) {
    test(title, async ({ page }) => {
      // /v1/me lists the subscription from the press on, as the real worker would.
      const { state } = await pressStaleSubscribe(page, reply, { health: { creemPortalConfigured: false } }, ["creem"]);
      // Wrong: the page never asked again, so "Subscribe" stayed on both plans
      // after the worker had said a subscription is open.
      await expect.poll(async () => paid(await dialogNow(page)).map((p) => [p.text, p.disabled]), { timeout: 8000 }).toEqual(want);
      expect(state.checkouts).toHaveLength(1);
    });
  }

  test("control: a refusal for another reason is a failed checkout, and no portal is opened", async ({ page }) => {
    const { state, navigations } = await pressStaleSubscribe(page, [502, { ok: false, reason: "provider_error" }]);
    const toast = page.locator("#toast");
    await expect(toast).toContainText(/couldn't open the checkout, and nothing was charged/);
    await expect(toast).not.toContainText(/subscription open/);
    expect(state.portals).toBe(0);
    expect(navigations).toEqual([]);
  });
});

/** Press Subscribe as a free account with the worker answering 429 `body`; returns the toast. */
async function pressRateLimited(page, body, lang) {
  const license = await mintLicense({ origin: BASE });
  const state = freshState({ checkoutAnswer: [429, { ok: false, reason: "rate_limited", ...body }] });
  const { navigations } = await install(page, state, license, { config: ON_SALE, lang });
  await open(page);
  await accountLanded(page, []);
  await openPricing(page);
  const cta = page.locator('#pricing-grid .plan-cta[data-plan="pro_monthly"]');
  await cta.click();
  await expect.poll(() => state.checkouts.length).toBe(1);
  expect(navigations).toEqual([]);
  return page.locator("#toast");
}

// truth-8: the wait the worker sends, in minutes, the same in both languages.
for (const [lang, locale, words] of [
  ["en", "en-US", { three: "Try again in 3 minutes; nothing was charged.", one: "Try again in 1 minute; nothing was charged.", none: "Wait an hour at most, then try again; nothing was charged." }],
  ["es", "es-PE", { three: "Vuelve a intentarlo en 3 minutos; no se cobró nada.", one: "Vuelve a intentarlo en 1 minuto; no se cobró nada.", none: "Vuelve a intentarlo dentro de una hora como mucho; no se cobró nada." }]
]) {
  test.describe(`truth-8 (${lang}): a refused checkout for too many tries says the wait the worker sent`, () => {
    test.use({ locale, timezoneId: "America/Lima" });

    test("125 seconds left: 3 minutes, rounded up so it never says to come back early", async ({ page }) => {
      const toast = await pressRateLimited(page, { retryAfter: 125 }, lang);
      // Wrong (before): the number was dropped and the toast said an hour.
      await expect(toast).toContainText(words.three);
    });

    test("30 seconds left: 1 minute, in the singular", async ({ page }) => {
      const toast = await pressRateLimited(page, { retryAfter: 30 }, lang);
      await expect(toast).toContainText(words.one);
    });

    test("control: a 429 with no wait in it falls back to an hour at most", async ({ page }) => {
      const toast = await pressRateLimited(page, {}, lang);
      await expect(toast).toContainText(words.none);
      await expect(toast).not.toContainText(/minut/);
    });
  });
}
