/**
 * The pending checkout link's lifecycle in js/account.js, in the browser:
 * retried while the page stays open, retried when its account signs back in,
 * forgotten on an answer that settles it and kept on one that does not,
 * expired a week after it was first asked about, kept in memory when storage
 * refuses it, and never allowed to hold the account up when the worker does
 * not answer (red team round one: tests-5 a-d, client-4, client-3).
 *
 * The oracle is what the stand-in worker is asked and ends up holding (was
 * the purchase linked to the account, which requests reached it, when) and
 * what the page keeps in `vt_pending_links_v2` (seeded under the old key,
 * `vt_pending_link_v1`, as the shipped page kept it), never which function ran.
 * Each claim has its control beside it: the state the defect would leave is
 * shown to be reachable and distinguishable (a reference kept while the
 * webhook is late, a reload that does send a kept reference, a record another
 * account wrote that sign-in leaves alone, a refresh that is still waiting
 * just short of the timeout).
 *
 * The worker is stood in for at the shipped worker's own host, which the
 * page's Content Security Policy allows, so these run under the real policy
 * with every request answered here. Licence tokens are really signed with a
 * throwaway key, so the check that grants Pro is the real one.
 *
 * The stand-in is copied from tests/checkout-bound.spec.js and extended
 * (sign-in routes, sessions the worker honours, a webhook that lands at a set
 * time, a link that never answers, per-request timing); that file is left as
 * it is.
 */
const { test, expect } = require("@playwright/test");
const { mintLicense, patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev";
const DAY = 86400;
const DAY_MS = DAY * 1000;
const SESSION = "sess-retry-1";
const ACCOUNT = { id: "acct_retry_1", email: "buyer@example.test", trialUsed: true };
/** A licence id as the worker mints them: 43 base64url characters. */
const LIC = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";
/** Coming back from a Creem checkout. */
const RETURN = "?billing=success&checkout_id=ch_1";
const CHECKOUT_REF = { provider: "creem", sessionId: "ch_1" };
/** js/account.js LINK_RETRY_DELAYS_MS[0] and LINK_TIMEOUT_MS, as the page promises them. */
const FIRST_RETRY_MS = 4000;
const LINK_TIMEOUT_MS = 15000;
/** A route the stand-in leaves unanswered: a worker that took the connection and went quiet. */
const HANG = Symbol("hang");

/**
 * Mutable state of the stand-in worker. `landed` is whether Creem's webhook
 * has arrived (or `landAfterMs` after the first link); `linked` whether the
 * purchase belongs to the account; `sessions` the tokens it honours.
 */
function freshState(over) {
  return {
    landed: false,
    landAfterMs: null,
    firstLinkAt: null,
    linked: false,
    linkedAt: null,
    landedAt: null,
    links: [],
    linkLog: [],
    linkAnswer: null,
    linkHang: false,
    claims: 0,
    claimsPendForever: false,
    me: 0,
    refused: 0,
    signIns: [],
    sessions: new Set([SESSION]),
    ...(over || {})
  };
}

/** Whether the webhook has reached the worker by now. */
function webhookLanded(state) {
  if (state.landed) return true;
  if (state.landAfterMs === null || state.firstLinkAt === null) return false;
  return Date.now() - state.firstLinkAt >= state.landAfterMs;
}

/** The claims of a paid Creem licence; `accountId` only on one minted for the account. */
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

/** The `/v1/me` body as the account now stands. */
async function meBody(state, license) {
  const ent = state.linked
    ? { pro: true, plan: "pro_monthly", status: "active", source: "paid", provider: "creem", periodEnd: Math.floor(Date.now() / 1000) + 30 * DAY }
    : { pro: false, plan: null, status: "free", source: null, periodEnd: null };
  const token = ent.pro ? await license.sign({ ...licenceClaims(ACCOUNT.id), source: ent.source, provider: ent.provider }) : null;
  return { ok: true, account: ACCOUNT, entitlement: ent, grants: [], paid: [], licenseId: ent.pro ? LIC : null, token };
}

/** `/v1/me/link`, logged with its time and answer; HANG while `linkHang`. */
async function linkAnswer(state, body, license) {
  const entry = { at: Date.now(), body, status: null };
  state.links.push(body);
  state.linkLog.push(entry);
  if (state.firstLinkAt === null) state.firstLinkAt = entry.at;
  if (state.linkHang) return HANG;
  const reply = await linkReply(state, body, license);
  entry.status = reply[0];
  return reply;
}

/** What the real route answers: 202 before the webhook, the account after. */
async function linkReply(state, body, license) {
  if (state.linkAnswer) return state.linkAnswer;
  if (body.sessionId && !webhookLanded(state)) return [202, { ok: false, reason: "pending" }];
  if (!state.linked) state.linkedAt = Date.now();
  state.linked = true;
  return [200, await meBody(state, license)];
}

/** `/v1/claim`: pending once, then the anonymous licence, unless it pends forever. */
async function claimAnswer(state, license) {
  state.claims += 1;
  if (state.claimsPendForever || state.claims < 2) return [202, { ok: false, reason: "pending" }];
  if (!state.landedAt) state.landedAt = Date.now();
  state.landed = true;
  return [200, { ok: true, token: await license.sign(licenceClaims(null)), licenseId: LIC }];
}

/** Both sign-in routes: a new session for the account, as the real ones answer. */
async function signInAnswer(state, license, path) {
  state.signIns.push(path);
  return [200, { ...(await meBody(state, license)), sessionToken: SESSION, expiresAt: 4102444800 }];
}

/** Routes that need no session; null for one that does. */
function openRoute(state, license, path) {
  if (path === "/v1/events") return [200, { ok: true }];
  if (path === "/v1/health") return [200, health()];
  if (path === "/v1/auth/methods") return [200, { ok: true, email: true, google: false, googleClientId: null, trialDays: 7 }];
  if (path === "/v1/auth/email/start") return [200, { ok: true, sent: true, expiresInSeconds: 900 }];
  if (path === "/v1/auth/email/verify" || path === "/v1/auth/google") return signInAnswer(state, license, path);
  if (path === "/v1/claim") return claimAnswer(state, license);
  return null;
}

/** Routes under `/v1/me`, for a session the worker honours. */
async function accountRoute(state, license, path, body) {
  if (path === "/v1/me") {
    state.me += 1;
    return [200, await meBody(state, license)];
  }
  if (path === "/v1/me/link") return linkAnswer(state, body, license);
  if (path === "/v1/me/progress") return [200, { ok: true, profiles: [], rev: 0, doc: null, updatedAt: 1 }];
  return [404, { ok: false, reason: "not_found" }];
}

/** What the stand-in worker answers, as `[status, body]`, or HANG. */
async function answer(state, license, request) {
  const path = new URL(request.url()).pathname;
  let body = {};
  try {
    body = request.postDataJSON() || {};
  } catch {
    body = {};
  }
  const open = await openRoute(state, license, path);
  if (open) return open;
  const token = (request.headers().authorization || "").replace(/^Bearer /, "");
  if (!state.sessions.has(token)) {
    // A session that ended elsewhere (signed out everywhere, expired).
    state.refused += 1;
    return [401, { ok: false, reason: "revoked" }];
  }
  return accountRoute(state, license, path, body);
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

/** Init script: what the browser holds before the first load (once per test). */
function seedStorage(seed) {
  try {
    localStorage.setItem("vt_tour_v1", "1");
    localStorage.setItem("vt_lang", "en");
    sessionStorage.setItem("vt_e2e", "1");
    if (sessionStorage.getItem("vt_seeded")) return;
    sessionStorage.setItem("vt_seeded", "1");
    if (seed.session) localStorage.setItem("vt_account_session_v1", JSON.stringify({ token: seed.session, expiresAt: 4102444800 }));
    if (seed.stored) {
      localStorage.setItem("vt_license_v1", JSON.stringify({ licenseId: seed.lic, token: seed.stored, storedAt: new Date().toISOString() }));
    }
    if (seed.pending) localStorage.setItem("vt_pending_link_v1", JSON.stringify(seed.pending));
  } catch {
    /* ignore */
  }
}

/**
 * Init script: localStorage refuses the calls `window.__vtRefuse` names, the
 * way a full quota (QuotaExceededError on writes, the github.io origin's
 * shared 5 MB) or site data blocked after load (SecurityError) does.
 */
function refuseStorage(initial) {
  const store = window.localStorage;
  window.__vtRefuse = { ...initial };
  for (const name of ["getItem", "setItem", "removeItem"]) {
    const original = Storage.prototype[name];
    Storage.prototype[name] = function refusing(...args) {
      if (this === store && window.__vtRefuse[name]) {
        throw new DOMException(`${name} refused`, name === "setItem" ? "QuotaExceededError" : "SecurityError");
      }
      return original.apply(this, args);
    };
  }
}

/**
 * Stand the worker in and seed the browser. By default somebody is signed in
 * with a session the worker honours.
 * @param {import('@playwright/test').Page} page Page.
 * @param {object} state From `freshState`.
 * @param {object} license From `mintLicense`.
 * @param {{session?: string|null, stored?: string, pending?: object, refuse?: object}} [opts] Extras.
 */
async function install(page, state, license, opts) {
  const o = opts || {};
  await patchBillingConfig(page, {
    verification: { publicKeyJwk: license.publicKeyJwk, required: true, revalidateHours: 24 * 365 }
  });
  await page.route(`${API}/**`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    }
    const reply = await answer(state, license, route.request());
    // Left unanswered on purpose: the request stays open until the page gives up on it.
    if (reply === HANG) return undefined;
    const [status, body] = reply;
    return route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  });
  const seed = { session: o.session === undefined ? SESSION : o.session, stored: o.stored || null, lic: LIC, pending: o.pending || null };
  await page.addInitScript(seedStorage, seed);
  if (o.refuse) await page.addInitScript(refuseStorage, o.refuse);
}

/** Load a page of the site and wait for the account layer. */
async function open(page, query) {
  await page.goto(`${BASE}/index.html${query || ""}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTBilling && !!window.VTAccount && !!window.VTLicense, null, { timeout: 10000 });
}

/** Every page load (document request) of the site in this test. */
function countLoads(page) {
  const loads = [];
  page.on("request", (req) => {
    if (req.isNavigationRequest() && req.resourceType() === "document" && req.frame() === page.mainFrame()) loads.push(req.url());
  });
  return loads;
}

/** What this browser's licence says right now. */
function licenceNow(page) {
  return page.evaluate(() => {
    const claims = window.VTLicense.getClaims();
    return { pro: !!claims, provider: claims?.provider || null, accountId: claims?.accountId || null };
  });
}

/**
 * The stored pending link, as the page left it in localStorage. The page
 * keeps a list of them (red team states-2); these cases make one at most, so
 * that one entry comes back, and a list of several comes back whole, which no
 * single reference matches.
 */
function pendingRecord(page) {
  return page.evaluate(() => {
    const kept = JSON.parse(localStorage.getItem("vt_pending_links_v2") || "null");
    return Array.isArray(kept) && kept.length === 1 ? kept[0] : kept;
  });
}

/** Answered link requests by status, in the order they reached the worker. */
function statuses(state) {
  return state.linkLog.map((l) => l.status);
}

/**
 * The load is done asking: the account has answered (the load's own retry is
 * sent straight after), and one more round trip to the worker has been made
 * after it, so anything the load was going to send has been sent.
 */
async function loadSettled(page) {
  await page.waitForFunction(() => !!window.VTAccount.getState().account, null, { timeout: 10000 });
  await page.evaluate(() => window.VTAccount.refresh());
}

/** Sign in through the emailed-code form, as a person does. */
async function signInByEmail(page) {
  await page.locator("#btn-account").click();
  await expect(page.locator("#account-modal")).toBeVisible();
  await expect(page.locator("#account-signin")).toBeVisible();
  await page.fill("#account-email", ACCOUNT.email);
  await page.click("#account-email-submit");
  await expect(page.locator("#account-code-form")).toBeVisible();
  await page.fill("#account-code", "424242");
  await page.click("#account-code-submit");
  await expect(page.locator("#account-logged-in")).toBeVisible();
}

/**
 * Sign in with Google: what the Google button's callback calls with the ID
 * token (js/account.js renderGoogleButton). Google's own script cannot run
 * here, so the credential is handed over the way that callback hands it.
 */
async function signInByGoogle(page) {
  const res = await page.evaluate(() => window.VTAccount.signInWithGoogle("google-id-token-for-test"));
  expect(res).toMatchObject({ ok: true, account: { id: ACCOUNT.id } });
}

const SIGN_INS = [
  ["the emailed code", signInByEmail, "/v1/auth/email/verify"],
  ["Google", signInByGoogle, "/v1/auth/google"]
];

test.use({ locale: "en-US", timezoneId: "America/New_York" });

// Red team tests-5 (a): the 4/12/30/90 s in-page retries after a 202.
test.describe("a link the worker answered 'pending' is asked again while the page stays open", () => {
  test("about 4 s later the page asks again by itself and links the purchase once the webhook has landed, with no reload", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    // The claim never lands here, so the only way back to the worker is the
    // page's own schedule; the webhook reaches the worker 2.5 s after the first link.
    const state = freshState({ claimsPendForever: true, landAfterMs: 2500 });
    await install(page, state, license);
    const loads = countLoads(page);
    await open(page, RETURN);
    await expect.poll(() => statuses(state)[0], { timeout: 5000 }).toBe(202);
    expect(state.links[0]).toEqual(CHECKOUT_REF);
    await loadSettled(page);
    // Control: what the defect leaves is a kept, unlinked reference.
    expect(await pendingRecord(page)).toMatchObject(CHECKOUT_REF);
    expect(state.linked).toBe(false);
    const fromLoad = state.links.length;
    expect(statuses(state).every((s) => s === 202), "the load's own asks came before the webhook").toBe(true);

    // Wrong (scheduleLinkRetry deleted): nothing asks again until the next
    // load, and `linked` stays false while they look at the page.
    await expect.poll(() => state.linked, { timeout: 15000 }).toBe(true);
    const retry = state.linkLog[fromLoad];
    expect(retry.body).toEqual(CHECKOUT_REF);
    expect(retry.status).toBe(200);
    // On the schedule: not hammered at once, and not left for the next load.
    const gap = retry.at - state.linkLog[0].at;
    expect(gap).toBeGreaterThanOrEqual(FIRST_RETRY_MS - 500);
    expect(gap).toBeLessThan(FIRST_RETRY_MS + 4000);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
    await expect.poll(() => pendingRecord(page)).toBeNull();
    expect(loads, "linked in the page they were looking at").toHaveLength(1);
  });
});

// Red team tests-5 (b): retryPendingLink() after verifyEmailCode and signInWithGoogle.
test.describe("a link kept through a signed-out moment is sent when its account signs in again", () => {
  /** A reference this account left on an earlier visit, under a session that has since ended. */
  const ownRecord = (acct) => ({ provider: "creem", sessionId: "ch_kept", at: Date.now() - 60000, acct, sess: "0badc0de" });

  for (const [via, signIn, route] of SIGN_INS) {
    test(`signing in with ${via} links it at once`, async ({ page }) => {
      const license = await mintLicense({ origin: BASE });
      // The webhook landed while they were signed out.
      const state = freshState({ landed: true });
      await install(page, state, license, { session: "sess-ended", pending: ownRecord(ACCOUNT.id) });
      await open(page, "");
      // The ended session is refused and forgotten; with nobody signed in,
      // nothing is sent, and the reference is kept (it names its account).
      await expect.poll(() => page.evaluate(() => window.VTAccount.getState().signedIn), { timeout: 10000 }).toBe(false);
      expect(state.refused).toBeGreaterThan(0);
      expect(state.links).toEqual([]);
      expect(await pendingRecord(page)).toMatchObject({ provider: "creem", sessionId: "ch_kept" });

      await signIn(page);
      expect(state.signIns).toEqual([route]);
      // Wrong (no retryPendingLink() after sign-in): nothing asks until the
      // next load, so the account they just signed into is still free.
      await expect.poll(() => state.links, { timeout: 5000 }).toEqual([{ provider: "creem", sessionId: "ch_kept" }]);
      expect(state.linked).toBe(true);
      await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
      await expect.poll(() => pendingRecord(page)).toBeNull();
    });
  }

  test("control: a reference another account left is not sent when this one signs in", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ landed: true });
    await install(page, state, license, { session: "sess-ended", pending: ownRecord("acct_previous_buyer") });
    await open(page, "");
    await expect.poll(() => page.evaluate(() => window.VTAccount.getState().signedIn), { timeout: 10000 }).toBe(false);
    await signInByEmail(page);
    await loadSettled(page);
    expect(state.links).toEqual([]);
    // Asked directly, the page has nothing of this account's to link either.
    expect(await page.evaluate(() => window.VTAccount.retryPendingLink())).toBeNull();
    expect(state.links).toEqual([]);
    expect(state.linked).toBe(false);
    expect(await pendingRecord(page)).toMatchObject({ sessionId: "ch_kept", acct: "acct_previous_buyer" });
  });
});

// Red team tests-5 (c): LINK_FINAL_STATUSES in settlePendingLink.
test.describe("an answer that settles a checkout reference forgets it; one that does not keeps it", () => {
  const FINAL = [
    [409, "already_linked"],
    [404, "not_found"],
    [400, "bad_request"]
  ];
  const PASSING = [
    [202, "pending"],
    [503, "unavailable"]
  ];

  for (const [status, reason] of FINAL) {
    test(`a ${status} (${reason}) forgets it, and the next load sends nothing`, async ({ page }) => {
      const license = await mintLicense({ origin: BASE });
      const state = freshState({ claimsPendForever: true, linkAnswer: [status, { ok: false, reason }] });
      await install(page, state, license);
      await open(page, RETURN);
      await expect.poll(() => statuses(state)[0], { timeout: 5000 }).toBe(status);
      // Wrong: kept, and retried on every load for a week for a purchase
      // that is malformed, unknown, or somebody else's.
      await expect.poll(() => pendingRecord(page)).toBeNull();
      const sent = state.links.length;
      await open(page, "");
      await loadSettled(page);
      expect(state.links).toHaveLength(sent);
      expect(await pendingRecord(page)).toBeNull();
      expect(await page.evaluate(() => window.VTAccount.retryPendingLink())).toBeNull();
      expect(state.links).toHaveLength(sent);
    });
  }

  for (const [status, reason] of PASSING) {
    test(`control: a ${status} (${reason}) keeps it, and the next load asks again`, async ({ page }) => {
      const license = await mintLicense({ origin: BASE });
      const state = freshState({ claimsPendForever: true, linkAnswer: [status, { ok: false, reason }] });
      await install(page, state, license);
      await open(page, RETURN);
      await expect.poll(() => statuses(state)[0], { timeout: 5000 }).toBe(status);
      await loadSettled(page);
      expect(await pendingRecord(page)).toMatchObject(CHECKOUT_REF);
      const sent = state.links.length;
      await open(page, "");
      // The same check point the cases above read "nothing sent" at.
      await loadSettled(page);
      expect(state.links.length).toBeGreaterThan(sent);
      expect(state.links.at(-1)).toEqual(CHECKOUT_REF);
      expect(await pendingRecord(page)).toMatchObject(CHECKOUT_REF);
    });
  }
});

// Red team tests-5 (d): writePendingLink keeps the first `at`.
test.describe("the week a reference is kept counts from when it was first asked about", () => {
  test("opened every day and asked again each time, it is still dropped a week after the return page first asked", async ({ page }) => {
    await page.clock.install({ time: Date.now() });
    const license = await mintLicense({ origin: BASE });
    // The webhook never lands: every ask is told to wait.
    const state = freshState({ claimsPendForever: true });
    await install(page, state, license);
    await open(page, RETURN);
    await expect.poll(() => statuses(state)[0], { timeout: 5000 }).toBe(202);
    await loadSettled(page);
    const first = await pendingRecord(page);
    expect(first).toMatchObject(CHECKOUT_REF);
    // Control: within the week it is asked again on every visit, so the
    // expiry below is the week ending, not a reference nobody retries.
    for (let day = 1; day <= 6; day += 1) {
      await page.clock.setSystemTime(first.at + day * DAY_MS);
      const sent = state.links.length;
      await open(page, "");
      await loadSettled(page);
      expect(state.links.length, `day ${day}: asked again`).toBeGreaterThan(sent);
      expect(await pendingRecord(page), `day ${day}: still dated from the first ask`).toMatchObject({ ...CHECKOUT_REF, at: first.at });
    }
    // Wrong (each ask re-dated): it is only a day old now and never expires.
    await page.clock.setSystemTime(first.at + 7 * DAY_MS + 60000);
    const sent = state.links.length;
    await open(page, "");
    await loadSettled(page);
    expect(await pendingRecord(page)).toBeNull();
    expect(state.links).toHaveLength(sent);
  });
});

// Red team client-4: pendingMem, read when localStorage refuses the record.
test.describe("storage that refuses the reference does not stop the link", () => {
  test("with every write refused (quota full), the page's own retry still sends it and the purchase is linked", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ claimsPendForever: true, landAfterMs: 2500 });
    await install(page, state, license, { refuse: { setItem: true } });
    await open(page, RETURN);
    await expect.poll(() => statuses(state)[0], { timeout: 5000 }).toBe(202);
    await loadSettled(page);
    // Precondition: the write really was refused (the first test in this
    // file, with working storage, reads the same record back at this point).
    expect(await pendingRecord(page)).toBeNull();
    const fromLoad = state.links.length;
    // Wrong (the retry reads storage only): it finds nothing, sends nothing,
    // and the purchase is linked nowhere.
    await expect.poll(() => state.linked, { timeout: 15000 }).toBe(true);
    expect(state.linkLog[fromLoad]).toMatchObject({ body: CHECKOUT_REF, status: 200 });
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
  });

  test("with every write refused, the claim landing links the reference at once", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    // The claim lands on its second try, about 1.5 s in; the webhook with it.
    const state = freshState();
    await install(page, state, license, { refuse: { setItem: true } });
    await open(page, RETURN);
    await expect.poll(() => state.landedAt !== null, { timeout: 9000 }).toBe(true);
    // Wrong: app.js's "claim landed, link again now" reads nothing and sends
    // nothing; the reference itself is never linked.
    await expect.poll(() => state.linkLog.some((l) => l.body.sessionId === "ch_1" && l.status === 200), { timeout: 9000 }).toBe(true);
    const linkedRef = state.linkLog.find((l) => l.body.sessionId === "ch_1" && l.status === 200);
    // At once, not at the next scheduled retry, 4 s after the first ask.
    expect(linkedRef.at - state.landedAt).toBeLessThan(1500);
    expect(await pendingRecord(page)).toBeNull();
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
  });

  test("with site data blocked after the page loaded (reads throw too), the retry sends the copy it kept", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ claimsPendForever: true, landAfterMs: 2500 });
    await install(page, state, license, { refuse: {} });
    await open(page, RETURN);
    await expect.poll(() => statuses(state)[0], { timeout: 5000 }).toBe(202);
    await loadSettled(page);
    expect(await pendingRecord(page)).toMatchObject(CHECKOUT_REF);
    const fromLoad = state.links.length;
    await page.evaluate(() => {
      window.__vtRefuse = { getItem: true, setItem: true, removeItem: true };
    });
    const blockedAt = Date.now();
    const read = await page.evaluate(() => {
      try {
        localStorage.getItem("vt_pending_links_v2");
        return "read";
      } catch (err) {
        return err.name;
      }
    });
    expect(read, "precondition: storage now throws on a read").toBe("SecurityError");
    await expect.poll(() => state.linked, { timeout: 15000 }).toBe(true);
    const retry = state.linkLog[fromLoad];
    expect(retry).toMatchObject({ body: CHECKOUT_REF, status: 200 });
    expect(retry.at, "the retry came after storage was blocked").toBeGreaterThan(blockedAt);
  });
});

// Red team client-3: LINK_TIMEOUT_MS on the /v1/me/link request.
test.describe("a link that never answers does not hold the account up", () => {
  test("refresh() settles once the link times out at 15 s, keeps the licence, and a later refresh asks the worker again", async ({ page }) => {
    // Page time stands still until the test moves it, so "just short of the
    // timeout" is 14 s of page time however long the machine takes to get here.
    const t0 = Date.now();
    await page.clock.install({ time: t0 });
    await page.clock.pauseAt(t0 + 1000);
    const license = await mintLicense({ origin: BASE });
    // The browser holds a paid licence the account does not show yet, and
    // the link that would attach it is accepted and never answered.
    const state = freshState({ landed: true, linkHang: true });
    await install(page, state, license, { stored: await license.sign(licenceClaims(null)) });
    await open(page, "");
    await expect.poll(() => state.links, { timeout: 10000 }).toEqual([{ licenseId: LIC }]);
    await page.evaluate(() => {
      window.__refreshed = "waiting";
      window.VTAccount.refresh().then((r) => {
        window.__refreshed = r;
      });
    });
    // Control: the hang is real; just short of the timeout, still waiting.
    await page.clock.fastForward(LINK_TIMEOUT_MS - 1000);
    expect(await page.evaluate(() => window.__refreshed)).toBe("waiting");
    // The worker answers new requests from here on; the stalled one stays stalled.
    state.linkHang = false;
    // Wrong (no timeout on the link): it waits forever, and every later
    // refresh() is handed the same stuck promise.
    await page.clock.fastForward(2000);
    await expect.poll(() => page.evaluate(() => window.__refreshed), { timeout: 5000 }).toMatchObject({ ok: true });
    expect(state.linkLog[0].status, "the first link was never answered").toBeNull();
    // No answer is not a refusal: the licence stood when refresh() settled.
    const settled = await page.evaluate(() => window.__refreshed.claims);
    expect(settled).toMatchObject({ sub: LIC, provider: "creem" });
    expect(settled.accountId).toBeUndefined();

    // A later refresh is a new ask to the worker, not the stuck one.
    const meBefore = state.me;
    await page.evaluate(() => {
      window.__later = "waiting";
      window.VTAccount.refresh().then((r) => {
        window.__later = r;
      });
    });
    await expect.poll(() => page.evaluate(() => window.__later), { timeout: 5000 }).toMatchObject({ ok: true });
    expect(state.me).toBeGreaterThan(meBefore);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
  });
});
