/**
 * The pending checkout link is forgotten only on an answer that settles it
 * (400, 404, 409), and kept on every answer that does not: the gaps left in
 * round one's tests-5 (red team round two, truth-6 b).
 *
 * tests/checkout-link-retry.spec.js holds the 202 and the 503. Three answers
 * the real worker and the network give had no test:
 * - 429 "rate_limited": /v1/me/link throttles look-ups of a checkout id
 *   (workers/entitlements/src/api.js handleLink), as /v1/claim does.
 * - no answer at all: the request fails (offline, a dropped connection).
 * - a request that hangs until the page's own 15 s timeout gives up on it.
 * Wrong behaviour for each: the reference is dropped, or kept but never asked
 * about again while the page stays open, and the purchase never reaches the
 * account the buyer was signed in to.
 *
 * Control in this file: a 409 (another account holds it) is final, so in the
 * same windows of time neither the page nor the next load asks again. That
 * shows the "asked again" read by the other cases can come out false.
 *
 * The in-page schedule itself (red team round two, verification of truth-6 b):
 * tests/checkout-link-retry.spec.js and the cases above only reach its first
 * step, at 4 s. Its later steps (12, 30 and 90 s) and its end had no test:
 * with only the first step, a buyer whose webhook takes longer than about 4 s
 * stays on the free plan until they reload; with no end, the delay after the
 * last step is undefined, which a timer reads as 0 ms, and an open tab asks
 * the worker again after every answer for as long as it stays open.
 *
 * The oracle is what the stand-in worker is asked and ends up holding (was
 * the purchase linked to the account, which requests reached it, how each
 * ended) and what the account shows, never the stored record's shape.
 * Page time is driven with Playwright's clock, so the 4 s in-page retry and
 * the 15 s timeout are exact and nothing else in the page (the anonymous
 * claim's own polling) moves unless the test moves it.
 *
 * The stand-in is copied from tests/checkout-link-retry.spec.js and cut down
 * to the routes a signed-in return from a Creem checkout reaches. It stands
 * at the shipped worker's host, which the page's Content Security Policy
 * allows, so these run under the real policy. Licence tokens are really
 * signed with a throwaway key.
 */
const { test, expect } = require("@playwright/test");
const { mintLicense, patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev";
const DAY = 86400;
const SESSION = "sess-kept-1";
const ACCOUNT = { id: "acct_kept_1", email: "buyer@example.test", trialUsed: true };
const LIC = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";
/** Coming back from a Creem checkout. */
const RETURN = "?billing=success&checkout_id=ch_kept";
const CHECKOUT_REF = { provider: "creem", sessionId: "ch_kept" };
/** js/account.js LINK_RETRY_DELAYS_MS[0] and LINK_TIMEOUT_MS, as the page promises them. */
const FIRST_RETRY_MS = 4000;
const LINK_TIMEOUT_MS = 15000;
/** js/account.js LINK_RETRY_DELAYS_MS: past the last, only the next load asks again. */
const RETRY_DELAYS_MS = [4000, 12000, 30000, 90000];
/** The worker's answer while the webhook has not landed (workers/entitlements/src/api.js handleLink). */
const PENDING = [202, { ok: false, reason: "pending" }];
/** A link request the stand-in fails at the network, or leaves unanswered. */
const ABORT = Symbol("abort");
const HANG = Symbol("hang");

/**
 * Mutable state of the stand-in worker. The webhook has landed, so a link it
 * answers is made; `linkFails` is how it treats link requests until the test
 * clears it: a `[status, body]`, ABORT or HANG. With `hold`, each link
 * request waits at the stand-in until the test lets it be answered.
 */
function freshState(over) {
  return { linkFails: null, linked: false, linkLog: [], me: 0, hold: false, ...(over || {}) };
}

/** The claims of a paid Creem licence minted for the account. */
function licenceClaims() {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: "vocal-studio-entitlements",
    sub: LIC,
    aud: BASE,
    plan: "pro_monthly",
    status: "active",
    provider: "creem",
    iat: now,
    exp: now + 3 * DAY,
    periodEnd: now + 30 * DAY,
    accountId: ACCOUNT.id,
    source: "paid"
  };
}

/** The `/v1/me` body as the account now stands. */
async function meBody(state, license) {
  const ent = state.linked
    ? { pro: true, plan: "pro_monthly", status: "active", source: "paid", provider: "creem", periodEnd: Math.floor(Date.now() / 1000) + 30 * DAY }
    : { pro: false, plan: null, status: "free", source: null, periodEnd: null };
  const token = ent.pro ? await license.sign(licenceClaims()) : null;
  return { ok: true, account: ACCOUNT, entitlement: ent, grants: [], paid: [], licenseId: ent.pro ? LIC : null, token, billingRails: [] };
}

/** `/v1/me/link`, logged with how it ended; while `linkFails` is set, it fails that way. */
async function linkAnswer(state, body, license) {
  const entry = { body, status: null };
  state.linkLog.push(entry);
  if (state.hold) {
    await new Promise((resolve) => {
      entry.release = resolve;
    });
  }
  if (state.linkFails === ABORT || state.linkFails === HANG) {
    entry.status = state.linkFails === ABORT ? "aborted" : "unanswered";
    return state.linkFails;
  }
  if (state.linkFails) {
    entry.status = state.linkFails[0];
    return state.linkFails;
  }
  state.linked = true;
  entry.status = 200;
  return [200, await meBody(state, license)];
}

/** What the stand-in worker answers, as `[status, body]`, ABORT or HANG. */
async function answer(state, license, request) {
  const path = new URL(request.url()).pathname;
  let body = {};
  try {
    body = request.postDataJSON() || {};
  } catch {
    body = {};
  }
  if (path === "/v1/events") return [200, { ok: true }];
  if (path === "/v1/health") return [200, health()];
  if (path === "/v1/auth/methods") return [200, { ok: true, email: true, google: false, googleClientId: null, trialDays: 7 }];
  // The anonymous claim never lands, so it never triggers a link of its own.
  if (path === "/v1/claim") return [202, { ok: false, reason: "pending" }];
  if ((request.headers().authorization || "") !== `Bearer ${SESSION}`) return [401, { ok: false, reason: "no_session" }];
  if (path === "/v1/me") {
    state.me += 1;
    return [200, await meBody(state, license)];
  }
  if (path === "/v1/me/link") return linkAnswer(state, body, license);
  if (path === "/v1/me/progress") return [200, { ok: true, profiles: [], rev: 0, doc: null, updatedAt: 1 }];
  return [404, { ok: false, reason: "not_found" }];
}

/** The worker's health, with accounts and Creem switched on. */
function health() {
  return {
    ok: true,
    signingKeyConfigured: true,
    accountsConfigured: true,
    creemConfigured: true,
    creemCheckoutConfigured: true,
    creemPortalConfigured: true,
    mercadopagoConfigured: true,
    authMethods: { email: true, google: false, googleClientId: null, trialDays: 7 },
    siteOrigin: BASE
  };
}

/** Init script: signed in, once per test. */
function seedStorage(session) {
  try {
    localStorage.setItem("vt_tour_v1", "1");
    localStorage.setItem("vt_lang", "en");
    sessionStorage.setItem("vt_e2e", "1");
    if (sessionStorage.getItem("vt_seeded")) return;
    sessionStorage.setItem("vt_seeded", "1");
    localStorage.setItem("vt_account_session_v1", JSON.stringify({ token: session, expiresAt: 4102444800 }));
  } catch {
    /* ignore */
  }
}

/**
 * Init script: count the page's calls for a link as it makes them. A timer
 * that fires inside clock.fastForward makes its call before fastForward
 * returns, so this count answers "did that move of page time send a link?"
 * at once, with no wait of real time; the stand-in's log then shows what
 * reached the worker. It starts again at 0 on every load.
 */
function countLinkCalls() {
  const send = window.fetch;
  window.__linkCalls = 0;
  window.fetch = function countedFetch(input, init) {
    const url = typeof input === "string" ? input : input && input.url;
    if (String(url || "").includes("/v1/me/link")) window.__linkCalls += 1;
    return send.call(window, input, init);
  };
}

/** How many link calls this page has made since it loaded. */
function linkCalls(page) {
  return page.evaluate(() => window.__linkCalls);
}

/**
 * Freeze page time, stand the worker in and sign the account in.
 * @param {import('@playwright/test').Page} page Page.
 * @param {object} state From `freshState`.
 * @returns {Promise<string[]>} Every load of the site's page in this test.
 */
async function install(page, state) {
  const t0 = Date.now();
  await page.clock.install({ time: t0 });
  await page.clock.pauseAt(t0 + 1000);
  const license = await mintLicense({ origin: BASE });
  await patchBillingConfig(page, {
    verification: { publicKeyJwk: license.publicKeyJwk, required: true, revalidateHours: 24 * 365 }
  });
  await page.route(`${API}/**`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    }
    const reply = await answer(state, license, route.request());
    if (reply === ABORT) return route.abort("internetdisconnected");
    // Left unanswered on purpose: the request stays open until the page gives up on it.
    if (reply === HANG) return undefined;
    const [status, body] = reply;
    return route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  });
  await page.addInitScript(seedStorage, SESSION);
  await page.addInitScript(countLinkCalls);
  const loads = [];
  page.on("request", (req) => {
    if (req.isNavigationRequest() && req.resourceType() === "document" && req.frame() === page.mainFrame()) loads.push(req.url());
  });
  return loads;
}

/** Load a page of the site and wait for the account layer and its first answer. */
async function open(page, query) {
  await page.goto(`${BASE}/index.html${query || ""}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTAccount && window.VTAccount.getState().account?.id, null, { timeout: 10000 });
}

/**
 * Wait until the return page's own link request has ended, and say how the
 * page took it. The account layer sends one request per reference at a time,
 * so a retry asked for while it is out is handed that same request; asked
 * for after it ended, it sends the kept reference again. Null means nothing
 * is left to send: the reference was forgotten.
 * @returns {Promise<object|null>} The link's outcome as the account layer reports it.
 */
async function firstLinkEnded(page, state) {
  await expect.poll(() => state.linkLog.length, { timeout: 10000 }).toBeGreaterThan(0);
  return page.evaluate(() => window.VTAccount.retryPendingLink());
}

/** What this browser's licence says right now. */
function licenceNow(page) {
  return page.evaluate(() => {
    const claims = window.VTLicense.getClaims();
    return { pro: !!claims, provider: claims?.provider || null, accountId: claims?.accountId || null };
  });
}

/** How each link request ended, in the order they reached the worker. */
function ends(state) {
  return state.linkLog.map((l) => l.status);
}

/** Move page time on until the first in-page retry is due. */
async function pastFirstRetry(page) {
  await page.clock.fastForward(FIRST_RETRY_MS + 500);
}

/**
 * Link request number `n` of this page (from 1) is held at the stand-in. Join
 * it from the page, which sends nothing new (one request per reference at a
 * time), let the stand-in answer it, and wait until the page has taken the
 * answer. Its next in-page retry, if it has one, is then on the clock, so
 * the next move of page time cannot jump past it.
 * @returns {Promise<object>} The link's outcome as the account layer reports it.
 */
async function answerHeld(page, state, n) {
  await expect.poll(() => state.linkLog.length, { timeout: 10000 }).toBe(n);
  await page.evaluate(() => {
    window.__joined = window.VTAccount.retryPendingLink();
  });
  state.linkLog[n - 1].release();
  const res = await page.evaluate(() => window.__joined);
  expect(await linkCalls(page), "joining the held request sent nothing new").toBe(n);
  return res;
}

/**
 * Move page time to just short of an in-page retry, then just past it.
 * @returns {Promise<{before: number, after: number}>} Link calls made by then.
 */
async function aroundStep(page, delay) {
  await page.clock.fastForward(delay - 500);
  const before = await linkCalls(page);
  await page.clock.fastForward(1000);
  return { before, after: await linkCalls(page) };
}

test.use({ locale: "en-US", timezoneId: "America/New_York" });

test.describe("an answer that does not settle the reference keeps it, and the page asks again", () => {
  // The worker's throttle counts by the hour, and its retryAfter is the
  // seconds left in the hour that refused. Here that hour ends 3 s after the
  // refusal, so the worker really does accept the link at the 4 s step. The
  // case claims only "kept, and asked again": a page that waited out
  // retryAfter before its next step would ask at 4 s all the same.
  test("a 429 (the worker throttling look-ups, its hour ending 3 s later) is kept and asked again in the page 4 s later, and the purchase is linked", async ({ page }) => {
    const state = freshState({ linkFails: [429, { ok: false, reason: "rate_limited", retryAfter: 3 }] });
    const loads = await install(page, state);
    await open(page, RETURN);
    const first = await firstLinkEnded(page, state);
    expect(first).toMatchObject({ ok: false, status: 429, reason: "rate_limited" });
    expect(state.linkLog[0].body).toEqual(CHECKOUT_REF);
    const asked = state.linkLog.length;
    expect(ends(state).every((s) => s === 429)).toBe(true);
    expect(state.linked).toBe(false);

    // The throttle has passed; only the page's own schedule can ask again.
    state.linkFails = null;
    await pastFirstRetry(page);
    // Wrong (any 4xx taken as final, or only a 202 retried): nothing asks
    // again while they look, and the account stays free.
    await expect.poll(() => state.linked, { timeout: 10000 }).toBe(true);
    expect(state.linkLog[asked]).toEqual({ body: CHECKOUT_REF, status: 200 });
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
    expect(loads, "linked in the page they were looking at").toHaveLength(1);
  });

  test("a request that never reached the worker (offline) is kept, and the next load sends it", async ({ page }) => {
    const state = freshState({ linkFails: ABORT });
    const loads = await install(page, state);
    await open(page, RETURN);
    const first = await firstLinkEnded(page, state);
    expect(first).toMatchObject({ ok: false, status: 0, reason: "offline" });
    expect(state.linkLog[0]).toEqual({ body: CHECKOUT_REF, status: "aborted" });
    expect(state.linked).toBe(false);

    // Back online, and the buyer opens the site again before any in-page retry.
    state.linkFails = null;
    const asked = state.linkLog.length;
    await open(page, "");
    // Wrong (no answer taken as final): the reference went with the failed
    // request, so the load has nothing to send and the purchase is never linked.
    await expect.poll(() => state.linked, { timeout: 10000 }).toBe(true);
    expect(state.linkLog[asked]).toEqual({ body: CHECKOUT_REF, status: 200 });
    expect(loads).toHaveLength(2);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
  });

  test("a request that hangs is given up at 15 s, kept, and asked again in the page 4 s later", async ({ page }) => {
    const state = freshState({ linkFails: HANG });
    const loads = await install(page, state);
    await open(page, RETURN);
    await expect.poll(() => state.linkLog.length, { timeout: 10000 }).toBe(1);
    await page.evaluate(() => {
      window.__firstLink = "waiting";
      window.VTAccount.retryPendingLink().then((r) => {
        window.__firstLink = r;
      });
    });
    // Control: just short of the timeout the request is still out, and nothing else was sent.
    await page.clock.fastForward(LINK_TIMEOUT_MS - 1000);
    expect(await page.evaluate(() => window.__firstLink)).toBe("waiting");
    expect(state.linkLog).toHaveLength(1);

    // The worker answers new requests from here on; the stalled one stays stalled.
    state.linkFails = null;
    await page.clock.fastForward(2000);
    // Wrong (no timeout on the link): it waits for ever, and nothing asks again.
    await expect.poll(() => page.evaluate(() => window.__firstLink), { timeout: 5000 }).toMatchObject({ ok: false, status: 0 });
    expect(state.linkLog).toHaveLength(1);
    await pastFirstRetry(page);
    // Wrong (no answer taken as final, or only a 202 retried): kept or not,
    // nothing asks again while they look.
    await expect.poll(() => state.linked, { timeout: 10000 }).toBe(true);
    expect(ends(state)).toEqual(["unanswered", 200]);
    expect(state.linkLog[1].body).toEqual(CHECKOUT_REF);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
    expect(loads).toHaveLength(1);
  });
});

test.describe("a pending link is asked again on the page's schedule, and the schedule ends", () => {
  test("still pending at the 4 s step and landed by the 12 s step: linked in the page they are looking at", async ({ page }) => {
    const state = freshState({ linkFails: PENDING, hold: true });
    const loads = await install(page, state);
    await open(page, RETURN);
    expect(await answerHeld(page, state, 1)).toMatchObject({ ok: false, status: 202 });
    expect(state.linkLog[0].body).toEqual(CHECKOUT_REF);
    // The 4 s step: asked again, and the webhook has still not landed.
    expect(await aroundStep(page, RETRY_DELAYS_MS[0])).toEqual({ before: 1, after: 2 });
    expect(await answerHeld(page, state, 2)).toMatchObject({ ok: false, status: 202 });

    // The webhook lands between the 4 s and the 12 s steps.
    state.linkFails = null;
    state.hold = false;
    const step = await aroundStep(page, RETRY_DELAYS_MS[1]);
    // Control: half a second before the step was due, nothing had asked again.
    expect(step.before).toBe(2);
    // Wrong (only the first step kept): nothing asks again at 12 s, and they
    // stay on the free plan until they reload the page.
    expect(step.after, "asked again at the 12 s step").toBe(3);
    await expect.poll(() => state.linked, { timeout: 10000 }).toBe(true);
    expect(state.linkLog[2]).toMatchObject({ body: CHECKOUT_REF, status: 200 });
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
    expect(loads, "linked with no reload").toHaveLength(1);
  });

  test("pending for good: asked at 4, 12, 30 and 90 s, then never again in the page, and the next load still sends it", async ({ page }) => {
    const state = freshState({ linkFails: PENDING, hold: true });
    const loads = await install(page, state);
    await open(page, RETURN);
    expect(await answerHeld(page, state, 1)).toMatchObject({ ok: false, status: 202 });
    for (const [i, delay] of RETRY_DELAYS_MS.entries()) {
      // Each step on its delay: not half a second early, and by half a second late.
      expect(await aroundStep(page, delay), `the ${delay / 1000} s step`).toEqual({ before: i + 1, after: i + 2 });
      expect(await answerHeld(page, state, i + 2)).toMatchObject({ ok: false, status: 202 });
    }
    const asked = 1 + RETRY_DELAYS_MS.length;
    expect(ends(state)).toEqual(Array(asked).fill(202));

    // The schedule is spent. Wrong (no end to it): the delay after the last
    // step is undefined, a timer reads that as 0 ms, and the page asks again
    // at once, then after every answer, for as long as the tab is open.
    await page.clock.fastForward(60000);
    expect(await linkCalls(page), "a minute after the 90 s step").toBe(asked);
    await page.clock.fastForward(60 * 60000);
    expect(await linkCalls(page), "an hour after the 90 s step").toBe(asked);
    expect(state.linkLog).toHaveLength(asked);
    expect(state.linked).toBe(false);

    // Control: the reference was kept, not dropped with the schedule. The
    // webhook lands, the buyer opens the site again, and that load sends it.
    state.hold = false;
    state.linkFails = null;
    await open(page, "");
    await expect.poll(() => state.linked, { timeout: 10000 }).toBe(true);
    expect(state.linkLog[asked]).toMatchObject({ body: CHECKOUT_REF, status: 200 });
    expect(loads).toHaveLength(2);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
  });
});

test.describe("control: an answer that settles the reference forgets it", () => {
  test("a 409 (another account holds the purchase) is not asked again, in the page or on the next load", async ({ page }) => {
    const state = freshState({ linkFails: [409, { ok: false, reason: "already_linked" }] });
    await install(page, state);
    await open(page, RETURN);
    const first = await firstLinkEnded(page, state);
    // The retry asked for above found the first request still out, or found nothing left to send.
    expect(first === null || first.status === 409, JSON.stringify(first)).toBe(true);
    const asked = state.linkLog.length;
    expect(ends(state).every((s) => s === 409)).toBe(true);

    // The same windows the cases above are asked again in.
    state.linkFails = null;
    await pastFirstRetry(page);
    await page.clock.fastForward(LINK_TIMEOUT_MS);
    await page.evaluate(() => window.VTAccount.refresh());
    expect(state.linkLog).toHaveLength(asked);
    const me = state.me;
    await open(page, "");
    await page.evaluate(() => window.VTAccount.refresh());
    expect(state.me, "the next load did reach the worker").toBeGreaterThan(me);
    expect(state.linkLog).toHaveLength(asked);
    expect(state.linked).toBe(false);
  });
});
