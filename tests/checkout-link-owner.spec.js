/**
 * Whose purchase it is, on a browser more than one person signs in on (a
 * family computer, a shared phone), and what happens to a licence bought
 * signed out when the buyer signs in to an account that has a token of its
 * own. Red-team findings authz-1, client-1 and money-1 (round one on the
 * subscription branch, fixed in d69fd73).
 *
 * The defects:
 * - authz-1 / client-1: Ana pays signed in and comes back before Creem's
 *   webhook, so the link to her account is answered 202 and kept as a
 *   pending link (vt_pending_link_v1). It named nobody. Ana signed out,
 *   Bruno signed in, and his sign-in sent Ana's checkout reference to
 *   /v1/me/link with his session: the worker links a purchase to whoever
 *   asks first, so Bruno got Ana's Pro (and her Creem portal) and Ana's own
 *   link was refused as already linked.
 * - client-1, second path: the checkout still waiting to be claimed
 *   (vt_billing_v1, status pending) also outlived sign-out. Claimed on
 *   Bruno's next visit, the anonymous licence it brings was linked to Bruno
 *   by the "never drop a paid licence before linking it" rule.
 * - money-1: a buyer the site could not sign in (VG-88) pays signed out and
 *   holds the licence in this browser with no account on it. Signing in
 *   later to an account with a trial or a gift running, the account's own
 *   token replaced the paid one and nothing linked it: when the trial ended
 *   the browser was free while Creem kept charging.
 *
 * The oracle is what the stand-in worker ends up holding (which account the
 * licence is linked to, and with whose session each link was asked for) and
 * what the next visit shows, plus what this page load sent: every request to
 * the worker is noted as it leaves (`window.__vtSent`), so "nothing was sent"
 * is read after the call that would have sent it has returned, not after a
 * sleep.
 *
 * Between one person signing out and the next signing in, the tab is
 * reloaded (they left; the next person opens the site later). In one tab the
 * return page's own claim keeps retrying for about 17 s after sign-out, which
 * is a separate gap (see the round's report), not what these pin.
 *
 * The worker is stood in for at the shipped worker's own host, which the
 * page's Content Security Policy allows, so these run under the real policy.
 * Licence tokens are signed with a throwaway key, so the check that grants
 * Pro is the real one. Each sign-in gets a new session token, as the real
 * worker issues them: a pending link that only matched the session it was
 * written under would never be retried by its own account after signing in
 * again, and the controls below would see it.
 */
const { test, expect } = require("@playwright/test");
const { mintLicense, patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev";
const DAY = 86400;
const CODE = "424242";
const ANA = { key: "ana", id: "acct_owner_ana", email: "ana@example.test" };
const BRUNO = { key: "bruno", id: "acct_owner_bruno", email: "bruno@example.test" };
const PEOPLE = [ANA, BRUNO];
/** The one paid licence in these stories, as the worker mints ids: 43 base64url characters. */
const LIC = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";
/** Creem's checkout that licence came from. */
const CHECKOUT = "ch_owner_1";
const CHECKOUT_REF = { provider: "creem", sessionId: CHECKOUT };
/** The id of an account's own trial or gift, which is what a grant's token carries as `sub`. */
const GRANT_ID = "grant_owner_1";
const REFUSALS = { 202: "pending", 404: "not_found", 409: "already_linked" };
const FREE = { pro: false, provider: null, accountId: null };

/**
 * Mutable state of the stand-in worker. `landed`: Creem's webhook has
 * arrived, so the checkout has a licence. `owner`: the account that licence
 * is linked to (the first to link it keeps it, as grants.js linkLicense
 * does). `grants`: account id to "trial" or "gift", a token of its own.
 * `meGate`: a promise /v1/me waits on, for an account answer slower than the
 * page.
 */
function freshWorker(over) {
  return {
    landed: false,
    owner: null,
    grants: {},
    sessions: new Map(),
    live: new Set(),
    links: [],
    claims: 0,
    meGate: null,
    ...(over || {})
  };
}

/** A new session for `person`, as /v1/auth/email/verify issues one. */
function issueSession(worker, person) {
  const token = `sess-${person.key}-${worker.sessions.size + 1}`;
  worker.sessions.set(token, person.id);
  worker.live.add(token);
  return token;
}

/** The claims of the paid Creem licence; `accountId` only on one minted for an account. */
function licenceClaims(accountId) {
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
    ...(accountId ? { accountId, source: "paid" } : {})
  };
}

/** The account's entitlement, as resolveEntitlement reports it: the paid licence outlasts a grant. */
function entitlementOf(worker, accountId) {
  const now = Math.floor(Date.now() / 1000);
  if (worker.owner === accountId) {
    return { pro: true, plan: "pro_monthly", status: "active", source: "paid", provider: "creem", periodEnd: now + 30 * DAY };
  }
  const kind = worker.grants[accountId];
  if (kind) return { pro: true, plan: "pro_monthly", status: "active", source: kind, provider: null, periodEnd: now + 7 * DAY };
  return { pro: false, plan: null, status: "free", source: null, provider: null, periodEnd: null };
}

/** The `/v1/me` body for an account; a grant's token names the grant and its kind (api.js licenseTokenForResolution). */
async function meBody(worker, license, accountId) {
  const person = PEOPLE.find((p) => p.id === accountId);
  const ent = entitlementOf(worker, accountId);
  const sub = ent.source === "paid" ? LIC : ent.pro ? GRANT_ID : null;
  const token = sub
    ? await license.sign({ ...licenceClaims(accountId), sub, source: ent.source, provider: ent.provider || ent.source })
    : null;
  return {
    ok: true,
    account: { id: person.id, email: person.email, role: "member", trialUsed: true, createdAt: 1 },
    entitlement: ent,
    grants: [],
    paid: [],
    billingRails: ent.source === "paid" ? ["creem"] : [],
    licenseId: sub,
    token
  };
}

/** `/v1/auth/email/verify`: a new session and the account as it stands. */
async function verifyAnswer(worker, license, body) {
  const person = PEOPLE.find((p) => p.email === body.email);
  if (!person || body.code !== CODE) return [401, { ok: false, reason: "bad_code" }];
  const sessionToken = issueSession(worker, person);
  return [200, { ...(await meBody(worker, license, person.id)), sessionToken, expiresAt: 4102444800 }];
}

/**
 * `/v1/me/link`, as the real route answers: 202 for a checkout whose webhook
 * has not landed, 409 for a purchase another account already holds, else the
 * purchase is now this account's.
 */
async function linkAnswer(worker, license, who, body) {
  const known = body.licenseId === LIC || (body.provider === "creem" && body.sessionId === CHECKOUT);
  let status = 200;
  if (!known) status = 404;
  else if (body.sessionId && !worker.landed) status = 202;
  else if (worker.owner && worker.owner !== who) status = 409;
  else worker.owner = who;
  worker.links.push({ who, body, status });
  if (status !== 200) return [status, { ok: false, reason: REFUSALS[status] }];
  return [200, await meBody(worker, license, who)];
}

/** `/v1/claim`: pending until the webhook lands, then the anonymous licence. */
async function claimAnswer(worker, license) {
  worker.claims += 1;
  if (!worker.landed) return [202, { ok: false, reason: "pending" }];
  return [200, { ok: true, token: await license.sign(licenceClaims(null)), licenseId: LIC }];
}

/** The routes that need no session, or null. */
function openRoute(worker, license, path, body) {
  if (path === "/v1/events") return [200, { ok: true }];
  if (path === "/v1/health") return [200, health()];
  if (path === "/v1/auth/methods") return [200, { ok: true, email: true, google: false, googleClientId: null, trialDays: 7 }];
  if (path === "/v1/auth/email/start") return [200, { ok: true, sent: true, expiresInSeconds: 900 }];
  if (path === "/v1/auth/email/verify") return verifyAnswer(worker, license, body);
  if (path === "/v1/claim") return claimAnswer(worker, license);
  return null;
}

/** The routes that carry a session: sign-out, and /v1/me and below, for whoever it belongs to. */
async function sessionRoute(worker, license, request, path, body) {
  const token = (request.headers().authorization || "").replace(/^Bearer /, "");
  const who = worker.live.has(token) ? worker.sessions.get(token) : null;
  if (path === "/v1/auth/logout") {
    worker.live.delete(token);
    return [200, { ok: true }];
  }
  if (!who) return [401, { ok: false, reason: "no_session" }];
  if (path === "/v1/me") return [200, await meBody(worker, license, who)];
  if (path === "/v1/me/link") return linkAnswer(worker, license, who, body);
  if (path === "/v1/me/progress") return [200, { ok: true, profiles: [], rev: 0, doc: null, updatedAt: 1 }];
  return [404, { ok: false, reason: "not_found" }];
}

/** What the stand-in worker answers, as `[status, body]`. */
async function answer(worker, license, request) {
  const path = new URL(request.url()).pathname;
  let body = {};
  try {
    body = request.postDataJSON() || {};
  } catch {
    body = {};
  }
  if (path === "/v1/me" && worker.meGate) await worker.meGate;
  return openRoute(worker, license, path, body) || sessionRoute(worker, license, request, path, body);
}

/** The worker's health: accounts and Creem configured. */
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

/**
 * Runs in the page before any of its scripts, on every load: seeds storage
 * once per tab, and notes every request to the worker as it leaves, so a
 * request the page sent is in `window.__vtSent` the moment the call that
 * sent it returns.
 * @param {{api: string, session: string|null, stored: string|null, pending: object|null, lic: string}} seed What to seed.
 */
function seedAndWatch(seed) {
  const put = (key, value) => localStorage.setItem(key, JSON.stringify(value));
  try {
    localStorage.setItem("vt_tour_v1", "1");
    localStorage.setItem("vt_lang", "en");
    sessionStorage.setItem("vt_e2e", "1");
    if (!sessionStorage.getItem("vt_seeded")) {
      sessionStorage.setItem("vt_seeded", "1");
      if (seed.session) put("vt_account_session_v1", { token: seed.session, expiresAt: 4102444800 });
      if (seed.stored) put("vt_license_v1", { licenseId: seed.lic, token: seed.stored, storedAt: new Date().toISOString() });
      if (seed.pending) put("vt_pending_link_v1", seed.pending);
    }
  } catch {
    /* ignore */
  }
  const sent = [];
  window.__vtSent = sent;
  const send = window.fetch;
  const note = (url, init) => {
    const headers = (init && init.headers) || {};
    sent.push({ path: new URL(url).pathname, auth: headers.authorization || "", body: (init && init.body) || null });
  };
  window.fetch = function watched(input, init) {
    const url = String((input && input.url) || input);
    if (url.startsWith(seed.api)) note(url, init);
    return send.apply(this, arguments);
  };
}

/**
 * Stand the worker in, and optionally leave a session (issued by the
 * stand-in), a licence token and a pending link in storage.
 * @param {import('@playwright/test').Page} page Page.
 * @param {object} worker From `freshWorker`.
 * @param {object} license From `mintLicense`.
 * @param {{session?: string, stored?: string, pending?: object}} [opts] Extras.
 */
async function install(page, worker, license, opts) {
  const o = opts || {};
  await patchBillingConfig(page, {
    verification: { publicKeyJwk: license.publicKeyJwk, required: true, revalidateHours: 24 * 365 }
  });
  await page.route(`${API}/**`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    }
    const [status, body] = await answer(worker, license, route.request());
    return route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  });
  await page.addInitScript(seedAndWatch, { api: API, session: o.session || null, stored: o.stored || null, pending: o.pending || null, lic: LIC });
}

/** Load a page of the site and wait for the account layer. */
async function open(page, query) {
  await page.goto(`${BASE}/index.html${query || ""}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTBilling && !!window.VTAccount && !!window.VTLicense, null, { timeout: 10000 });
}

/** Wait until the page knows the account signed in is `person`. */
async function accountIs(page, person) {
  await page.waitForFunction((id) => window.VTAccount.getState().account?.id === id, person.id, { timeout: 10000 });
}

/** Open the account panel, from the phone menu when that is where the door is. */
async function openPanel(page) {
  if (await page.locator("#account-modal").isVisible()) return;
  if (!(await page.locator("#btn-account").isVisible()) && (await page.locator("#btn-more").isVisible())) {
    await page.click("#btn-more");
  }
  await page.click("#btn-account");
  await expect(page.locator("#account-modal")).toBeVisible();
}

/** Sign in through the panel's emailed-code form, as a person would. */
async function signInByCode(page, person) {
  await openPanel(page);
  await expect(page.locator("#account-signin")).toBeVisible();
  await page.fill("#account-email", person.email);
  await page.click("#account-email-submit");
  await expect(page.locator("#account-code-form")).toBeVisible();
  await page.fill("#account-code", CODE);
  await page.click("#account-code-submit");
  await expect(page.locator("#account-logged-in")).toBeVisible();
  await accountIs(page, person);
}

/** Sign out from the panel's own button. */
async function signOutByPanel(page) {
  await openPanel(page);
  await page.click("#btn-logout");
  await expect(page.locator("#account-logged-out")).toBeVisible({ timeout: 8000 });
}

/** Open the Pro dialog. */
async function openPricing(page) {
  await page.locator("#btn-pro, #btn-pricing, [data-open-pricing]").first().click();
  await expect(page.locator("#pricing-modal")).toBeVisible();
}

/** Close the Pro dialog. */
async function closePricing(page) {
  await page.click("#pricing-close");
  await expect(page.locator("#pricing-modal")).toBeHidden();
}

/**
 * The pending link as stored, or null. The page keeps a list of them (red
 * team states-2); these cases make one at most, so that one entry comes back,
 * and a list of several comes back whole, which no single reference matches.
 */
function pendingNow(page) {
  return page.evaluate(() => {
    const kept = JSON.parse(localStorage.getItem("vt_pending_links_v2") || "null");
    return Array.isArray(kept) && kept.length === 1 ? kept[0] : kept;
  });
}

/** Whether this browser still has a checkout waiting for its licence. */
function claimWaiting(page) {
  return page.evaluate(() => window.VTBilling.hasPendingClaim());
}

/** What this browser's licence says right now. */
function licenceNow(page) {
  return page.evaluate(() => {
    const claims = window.VTLicense.getClaims();
    return { pro: !!claims, provider: claims?.provider || null, accountId: claims?.accountId || null };
  });
}

/**
 * The requests to `path` this page load has sent, each as `{who, body}`:
 * `who` is the account whose session it carried (null for none).
 */
async function sentTo(page, worker, path) {
  const sent = await page.evaluate(() => window.__vtSent.slice());
  return sent
    .filter((r) => r.path === path)
    .map((r) => ({ who: worker.sessions.get(r.auth.replace(/^Bearer /, "")) || null, body: r.body ? JSON.parse(r.body) : null }));
}

/** The links the stand-in worker was asked for under `person`'s sessions. */
function linksBy(worker, person) {
  return worker.links.filter((l) => l.who === person.id).map((l) => l.body);
}

/**
 * Ana pays signed in and comes back before the webhook: her link is told to
 * wait and kept, and the checkout waits for its licence. She signs out and
 * leaves (the tab is loaded again, signed out).
 */
async function anaPaysAndLeaves(page, worker, license) {
  await install(page, worker, license, { session: issueSession(worker, ANA) });
  await open(page, `?billing=success&checkout_id=${CHECKOUT}`);
  await accountIs(page, ANA);
  await expect.poll(() => linksBy(worker, ANA), { timeout: 5000 }).toContainEqual(CHECKOUT_REF);
  expect(worker.links.map((l) => l.status), "precondition: the webhook is later than Ana").not.toContain(200);
  await expect.poll(() => pendingNow(page)).toMatchObject(CHECKOUT_REF);
  await signOutByPanel(page);
  await open(page, "");
}

// authz-1, client-1: the pending link names who wrote it, and only they retry it.
test.describe("a pending link is retried only by the account that wrote it", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  test("Ana's pending link is not sent with Bruno's session when he signs in after her on the same browser", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const worker = freshWorker();
    await anaPaysAndLeaves(page, worker, license);
    // Kept for Ana, not dropped at sign-out: the control below links it to her.
    expect(await pendingNow(page)).toMatchObject(CHECKOUT_REF);
    // The webhook lands: from here, whoever links that checkout gets it.
    worker.landed = true;

    await signInByCode(page, BRUNO);
    // Wrong (before): his sign-in sent Ana's checkout reference with his
    // session, the worker linked it to him, and Ana's own link got a 409.
    expect(await sentTo(page, worker, "/v1/me/link")).toEqual([]);

    // His next visit, and the in-page retry (called as its timer would), do not either.
    await open(page, "");
    await accountIs(page, BRUNO);
    expect(await page.evaluate(() => window.VTAccount.retryPendingLink())).toBeNull();
    expect(await sentTo(page, worker, "/v1/me/link")).toEqual([]);
    expect(linksBy(worker, BRUNO)).toEqual([]);
    expect(worker.owner).toBeNull();
    expect(await licenceNow(page)).toEqual(FREE);
  });

  test("control: Ana, signing back in after Bruno has been and gone, links it to herself", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const worker = freshWorker();
    await anaPaysAndLeaves(page, worker, license);
    worker.landed = true;
    await signInByCode(page, BRUNO);
    await signOutByPanel(page);

    // A new session for Ana: the record has to name her account, not only the session that wrote it.
    await signInByCode(page, ANA);
    await expect.poll(() => worker.owner, { timeout: 5000 }).toBe(ANA.id);
    expect(linksBy(worker, ANA).at(-1)).toEqual(CHECKOUT_REF);
    expect(linksBy(worker, BRUNO)).toEqual([]);
    await expect.poll(() => pendingNow(page)).toBeNull();
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ANA.id });
  });

  test("a pending link that names nobody (stored before this fix) is not sent with whoever signs in", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const worker = freshWorker({ landed: true });
    // The record as the code before d69fd73 wrote it: the checkout and when, nothing about who.
    await install(page, worker, license, { pending: { ...CHECKOUT_REF, at: Date.now() - 60000 } });
    await open(page, "");
    await signInByCode(page, BRUNO);
    // Wrong: with nobody named, anybody's session would do.
    expect(await sentTo(page, worker, "/v1/me/link")).toEqual([]);
    expect(await page.evaluate(() => window.VTAccount.retryPendingLink())).toBeNull();
    expect(await sentTo(page, worker, "/v1/me/link")).toEqual([]);
    expect(worker.owner).toBeNull();
  });

  test("control: a pending link written before the page heard from the account is retried by the session that wrote it", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    let answerMe;
    const worker = freshWorker({ meGate: new Promise((resolve) => (answerMe = resolve)) });
    await install(page, worker, license, { session: issueSession(worker, ANA) });
    await open(page, `?billing=success&checkout_id=${CHECKOUT}`);
    await expect.poll(() => linksBy(worker, ANA), { timeout: 5000 }).toEqual([CHECKOUT_REF]);
    await expect.poll(() => pendingNow(page)).toMatchObject(CHECKOUT_REF);
    // Precondition: the reference was kept before the page knew whose account this is.
    expect(await page.evaluate(() => window.VTAccount.getState().account)).toBeNull();

    worker.meGate = null;
    answerMe();
    await accountIs(page, ANA);
    // Wrong: taken for nobody's, the session that wrote it never asks again
    // (the account's answer is often slower than the page, so this is the usual case).
    await expect.poll(() => linksBy(worker, ANA).length, { timeout: 5000 }).toBeGreaterThanOrEqual(2);
    expect(linksBy(worker, ANA).every((b) => b.sessionId === CHECKOUT)).toBe(true);
  });
});

// client-1, second path: the checkout waiting for its licence goes at sign-out.
test.describe("signing out drops a checkout still waiting to be claimed", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  test("Ana's checkout waiting for its licence goes when she signs out, so Bruno's visits neither claim nor link it", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const worker = freshWorker();
    await install(page, worker, license, { session: issueSession(worker, ANA) });
    await open(page, `?billing=success&checkout_id=${CHECKOUT}`);
    await accountIs(page, ANA);
    await expect.poll(() => claimWaiting(page)).toBe(true);
    await expect.poll(() => worker.claims, { timeout: 5000 }).toBeGreaterThan(0);

    await signOutByPanel(page);
    // Wrong (before): it stayed, for the next visit to claim.
    expect(await claimWaiting(page)).toBe(false);

    // Ana leaves; the next visit claims nothing and offers nobody "I already paid" for it.
    await open(page, "");
    expect(await sentTo(page, worker, "/v1/claim")).toEqual([]);
    await openPricing(page);
    await expect(page.locator("#btn-recheck-payment")).toBeHidden();
    await closePricing(page);

    // The webhook lands; Bruno signs in on this browser and comes back.
    worker.landed = true;
    await signInByCode(page, BRUNO);
    await open(page, "");
    await accountIs(page, BRUNO);
    // A later refresh, as the sync and the licence refresher make.
    await page.evaluate(() => window.VTAccount.refresh());
    // Wrong (before): the claim brought Ana's licence into the browser and
    // the next refresh linked it to Bruno by its id.
    expect(await sentTo(page, worker, "/v1/claim")).toEqual([]);
    expect(await sentTo(page, worker, "/v1/me/link")).toEqual([]);
    expect(worker.owner).toBeNull();
    expect(await licenceNow(page)).toEqual(FREE);
  });

  test("control: a buyer who paid signed out (VG-88) keeps the checkout waiting until its licence lands", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const worker = freshWorker();
    await install(page, worker, license);
    await open(page, `?billing=success&checkout_id=${CHECKOUT}`);
    await expect.poll(() => claimWaiting(page)).toBe(true);
    await expect.poll(() => worker.claims, { timeout: 5000 }).toBeGreaterThan(0);
    await openPricing(page);
    await expect(page.locator("#btn-recheck-payment")).toBeVisible();

    // Their next visit: still waiting. Nobody signed out, so nothing drops it.
    await open(page, "");
    expect(await claimWaiting(page)).toBe(true);

    // The webhook lands, and the visit after picks the licence up, with no account to link it to.
    worker.landed = true;
    await open(page, "");
    await expect.poll(() => licenceNow(page), { timeout: 8000 }).toEqual({ pro: true, provider: "creem", accountId: null });
    expect(await sentTo(page, worker, "/v1/me/link")).toEqual([]);
  });
});

// money-1: the VG-88 buyer's licence is linked before a trial or gift token replaces it.
test.describe("a paid licence held in the browser is linked before the account's own token replaces it", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  for (const kind of ["trial", "gift"]) {
    test(`a licence bought signed out is linked to the account before its ${kind} token replaces it, and outlasts the ${kind}`, async ({ page }) => {
      const license = await mintLicense({ origin: BASE });
      const worker = freshWorker({ landed: true, grants: { [ANA.id]: kind } });
      await install(page, worker, license, { stored: await license.sign(licenceClaims(null)) });
      await open(page, "");
      await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: null });

      await signInByCode(page, ANA);
      // Wrong (before): the account's own token replaced the paid one and nothing was linked.
      await expect.poll(() => linksBy(worker, ANA), { timeout: 5000 }).toEqual([{ licenseId: LIC }]);
      expect(worker.owner).toBe(ANA.id);

      // The trial or gift ends; the purchase is still on the account.
      delete worker.grants[ANA.id];
      await open(page, "");
      await accountIs(page, ANA);
      await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ANA.id });
    });
  }

  test("control: when the account's answer names that same licence, no link is sent", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const worker = freshWorker({ landed: true, owner: ANA.id });
    await install(page, worker, license, { stored: await license.sign(licenceClaims(null)) });
    await open(page, "");
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: null });

    await signInByCode(page, ANA);
    expect(await sentTo(page, worker, "/v1/me/link")).toEqual([]);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ANA.id });
    expect(worker.links).toEqual([]);
  });
});

test.describe("round two: the claim already running, and a session the worker refused", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  test("a claim still retrying when Ana signs out stops, so the licence it would bring is not linked to Bruno", async ({ page }) => {
    // Wrong (round one's fix): the stored claim went at sign-out, but the
    // return page's own claim kept retrying in the tab (about 17 s). When the
    // webhook landed inside that window it stored Ana's licence, and Bruno's
    // next load linked it to Bruno by id.
    const license = await mintLicense({ origin: BASE });
    const worker = freshWorker();
    await install(page, worker, license, { session: issueSession(worker, ANA) });
    await open(page, `?billing=success&checkout_id=${CHECKOUT}`);
    await accountIs(page, ANA);
    await expect.poll(() => worker.claims, { timeout: 5000 }).toBeGreaterThan(0);
    await signOutByPanel(page);
    expect(await claimWaiting(page), "the stored claim went at sign-out").toBe(false);
    // Same tab, moments later: Bruno signs in, and the webhook lands.
    await signInByCode(page, BRUNO);
    worker.landed = true;
    // Long enough for the old loop's remaining tries (1.5 + 3 + 5 + 8 s from the return).
    await page.waitForTimeout(12000);
    await page.evaluate(() => window.VTAccount.refresh());
    expect(linksBy(worker, BRUNO), "nothing of Ana's is linked under Bruno's session").toEqual([]);
    expect(worker.owner).toBeNull();
    expect(await licenceNow(page), "and Bruno's browser holds no licence of hers").toEqual(FREE);
  });

  test("a session refused (401) after the return wrote its records keeps the claim, so Ana's purchase reaches her when she signs in again", async ({ page }) => {
    // Wrong (round one's fix): every forgotten session dropped the claim, a
    // 401 included. The pending link, written before the account answered,
    // names only the lapsed session, so after Ana signed in again nothing
    // could bring her purchase to her account or to this browser.
    const license = await mintLicense({ origin: BASE });
    let answerMe;
    const worker = freshWorker({ meGate: new Promise((resolve) => (answerMe = resolve)) });
    const lapsed = issueSession(worker, ANA);
    worker.live.delete(lapsed); // expired, or signed out everywhere from another device, while at the checkout
    await install(page, worker, license, { session: lapsed });
    await open(page, `?billing=success&checkout_id=${CHECKOUT}`);
    await expect.poll(() => claimWaiting(page)).toBe(true);
    await expect.poll(() => pendingNow(page)).toMatchObject(CHECKOUT_REF);
    worker.meGate = null;
    answerMe();
    await expect.poll(() => page.evaluate(() => window.VTAccount.getState().signedIn)).toBe(false);
    expect(await claimWaiting(page), "a refused session is not a sign-out: the claim stays").toBe(true);
    // Ana comes back later and signs in again (a new session); the webhook has landed.
    await open(page, "");
    await signInByCode(page, ANA);
    worker.landed = true;
    await open(page, "");
    await accountIs(page, ANA);
    await expect.poll(() => worker.owner, { timeout: 10000 }).toBe(ANA.id);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ANA.id });
  });
});
