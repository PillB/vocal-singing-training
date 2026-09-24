/**
 * The account routes, driven through the worker's real router.
 *
 * These are the end-to-end tests: sign in, get entitled, sync progress, gift a
 * month, take it back — each one going through `handleRequest` exactly as a
 * browser request would.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";

import { handleRequest } from "../src/index.js";
import { resetSchemaMemo } from "../src/db.js";
import { clearGoogleJwksCache } from "../src/google.js";
import { verifyLicenseToken } from "../src/license.js";
import { putEntitlement, putClaimIndex } from "../src/store.js";
import { createAccountEnv, createEntitlement, TEST_ORIGIN } from "./fixtures.mjs";

const BASE = "https://entitlements.test";

/**
 * Build a request against the worker.
 * @param {string} method HTTP method.
 * @param {string} path Path with optional query.
 * @param {{body?: unknown, token?: string, origin?: string, headers?: Object}} [options] Request options.
 * @returns {Request} Request.
 */
function req(method, path, options) {
  const opts = options || {};
  const headers = {
    ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
    ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    ...(opts.origin ? { Origin: opts.origin } : {}),
    ...(opts.headers || {})
  };
  return new Request(`${BASE}${path}`, {
    method,
    headers,
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) })
  });
}

/**
 * Call the worker and return status plus parsed body.
 * @param {Request} request Request.
 * @param {Object} env Env bindings.
 * @param {Object} [deps] Router options (`now`, `fetchImpl`).
 * @returns {Promise<{status: number, body: Object, headers: Headers}>} Result.
 */
async function call(request, env, deps) {
  const response = await handleRequest(request, env, deps);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body, headers: response.headers };
}

/** A fresh env with the account layer on and the schema memo cleared. */
function freshEnv(overrides) {
  resetSchemaMemo();
  clearGoogleJwksCache();
  return createAccountEnv(overrides);
}

/**
 * Sign in by emailed code, returning the session token.
 *
 * The code never leaves the database in plaintext, so the test reads the code
 * out of the email the fake transport was asked to send — the same path a
 * person's inbox is.
 *
 * @param {Object} env Env bindings.
 * @param {string} email Email address.
 * @param {number} now Unix seconds.
 * @returns {Promise<{token: string, body: Object}>} Session.
 */
async function signInByEmail(env, email, now) {
  let sentCode = null;
  const fetchImpl = async (url, init) => {
    const payload = JSON.parse(init.body);
    const match = /\b(\d{6})\b/.exec(payload.text || "");
    sentCode = match && match[1];
    return { ok: true, status: 200 };
  };
  const started = await call(req("POST", "/v1/auth/email/start", { body: { email } }), env, {
    now,
    fetchImpl
  });
  assert.equal(started.status, 200, "email start should succeed");
  assert.ok(sentCode, "a code should have been emailed");

  const verified = await call(
    req("POST", "/v1/auth/email/verify", { body: { email, code: sentCode } }),
    env,
    { now: now + 1 }
  );
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  return { token: verified.body.sessionToken, body: verified.body };
}

const NOW = 1800000000;
const DAY = 86400;

test("GET /v1/auth/methods reports what this deployment can offer", async () => {
  const env = freshEnv();
  const withBoth = await call(req("GET", "/v1/auth/methods"), env, { now: NOW });
  assert.equal(withBoth.status, 200);
  assert.equal(withBoth.body.email, true);
  assert.equal(withBoth.body.google, true);
  assert.equal(withBoth.body.googleClientId, "test-client-id.apps.googleusercontent.com");

  const bare = freshEnv({ RESEND_API_KEY: "", EMAIL_PROVIDER: "", GOOGLE_CLIENT_ID: "" });
  const neither = await call(req("GET", "/v1/auth/methods"), bare, { now: NOW });
  assert.equal(neither.body.email, false);
  assert.equal(neither.body.google, false);
});

test("without a D1 binding the account routes refuse and the paid flow is untouched", async () => {
  const env = freshEnv({ DB: undefined });
  const refused = await call(req("GET", "/v1/me", { token: "anything" }), env, { now: NOW });
  assert.equal(refused.status, 503);
  assert.equal(refused.body.reason, "accounts_not_configured");

  // The pre-existing license route still answers normally.
  const license = await call(req("POST", "/v1/license", { body: { licenseId: "x" } }), env, { now: NOW });
  assert.equal(license.status, 404);
});

test("health reports the account layer alongside the payment rails", async () => {
  const env = freshEnv();
  const withDb = await call(req("GET", "/v1/health"), env, { now: NOW });
  assert.equal(withDb.body.accountsConfigured, true);
  assert.equal(withDb.body.authMethods.google, true);

  const withoutDb = await call(req("GET", "/v1/health"), freshEnv({ DB: undefined }), { now: NOW });
  assert.equal(withoutDb.body.accountsConfigured, false);
});

test("CORS lets the site send an Authorization header, and only the site", async () => {
  const env = freshEnv();
  const mine = await call(req("GET", "/v1/auth/methods", { origin: TEST_ORIGIN }), env, { now: NOW });
  assert.equal(mine.headers.get("access-control-allow-origin"), TEST_ORIGIN);
  assert.match(mine.headers.get("access-control-allow-headers") || "", /authorization/);
  assert.match(mine.headers.get("access-control-allow-methods") || "", /PUT/);

  const theirs = await call(req("GET", "/v1/auth/methods", { origin: "https://evil.test" }), env, { now: NOW });
  assert.equal(theirs.headers.get("access-control-allow-origin"), null);
});

test("signing in by emailed code creates an account and a session", async () => {
  const env = freshEnv();
  const { token, body } = await signInByEmail(env, "pablo@example.test", NOW);
  assert.ok(token);
  assert.equal(body.account.email, "pablo@example.test");
  assert.equal(body.account.role, "member");
  assert.equal(body.entitlement.pro, false);
  assert.equal(body.token, null, "a free account gets no license token");

  const me = await call(req("GET", "/v1/me", { token }), env, { now: NOW + 10 });
  assert.equal(me.status, 200);
  assert.equal(me.body.account.email, "pablo@example.test");
});

test("email start answers the same whether or not the address is known", async () => {
  const env = freshEnv();
  await signInByEmail(env, "known@example.test", NOW);
  const fetchImpl = async () => ({ ok: true, status: 200 });

  const known = await call(
    req("POST", "/v1/auth/email/start", { body: { email: "known@example.test" } }),
    env,
    { now: NOW + 100, fetchImpl }
  );
  const unknown = await call(
    req("POST", "/v1/auth/email/start", { body: { email: "stranger@example.test" } }),
    env,
    { now: NOW + 100, fetchImpl }
  );
  assert.equal(known.status, unknown.status);
  assert.deepEqual(known.body, unknown.body);
});

test("hammering one address stops emailing but keeps answering 200", async () => {
  const env = freshEnv();
  const fetchImpl = async () => ({ ok: true, status: 200 });
  let last;
  for (let i = 0; i < 8; i += 1) {
    last = await call(
      req("POST", "/v1/auth/email/start", { body: { email: "target@example.test" } }),
      env,
      { now: NOW + i, fetchImpl }
    );
  }
  // Still 200: saying "rate limited" would confirm the address is real.
  assert.equal(last.status, 200);
  assert.equal(last.body.ok, true);
});

test("email sign-in is refused outright when no provider is configured", async () => {
  const env = freshEnv({ RESEND_API_KEY: "", EMAIL_PROVIDER: "" });
  const started = await call(
    req("POST", "/v1/auth/email/start", { body: { email: "p@example.test" } }),
    env,
    { now: NOW }
  );
  assert.equal(started.status, 503);
  assert.equal(started.body.reason, "email_not_configured");
});

test("a wrong code never yields a session", async () => {
  const env = freshEnv();
  const fetchImpl = async () => ({ ok: true, status: 200 });
  await call(req("POST", "/v1/auth/email/start", { body: { email: "p@example.test" } }), env, {
    now: NOW,
    fetchImpl
  });
  const verified = await call(
    req("POST", "/v1/auth/email/verify", { body: { email: "p@example.test", code: "000000" } }),
    env,
    { now: NOW + 1 }
  );
  assert.equal(verified.status, 401);
  assert.equal(verified.body.sessionToken, undefined);
});

test("every /v1/me route refuses without a valid session", async () => {
  const env = freshEnv();
  const paths = [
    ["GET", "/v1/me"],
    ["POST", "/v1/me/trial"],
    ["POST", "/v1/me/redeem"],
    ["POST", "/v1/me/link"],
    ["GET", "/v1/me/progress?profileId=default"],
    ["PUT", "/v1/me/progress"]
  ];
  for (const [method, path] of paths) {
    // A GET request may not carry a body, so only send one where it is allowed.
    const body = method === "GET" ? undefined : {};
    const anonymous = await call(req(method, path, { body }), env, { now: NOW });
    assert.equal(anonymous.status, 401, `${method} ${path} should need a session`);
    const bogus = await call(req(method, path, { body, token: "not-a-real-token" }), env, { now: NOW });
    assert.equal(bogus.status, 401, `${method} ${path} should reject a forged token`);
  }
});

test("signing out kills the token, and everywhere kills the rest", async () => {
  const env = freshEnv();
  const phone = await signInByEmail(env, "p@example.test", NOW);
  const laptop = await signInByEmail(env, "p@example.test", NOW + 100);

  await call(req("POST", "/v1/auth/logout", { token: phone.token, body: {} }), env, { now: NOW + 200 });
  assert.equal((await call(req("GET", "/v1/me", { token: phone.token }), env, { now: NOW + 201 })).status, 401);
  assert.equal((await call(req("GET", "/v1/me", { token: laptop.token }), env, { now: NOW + 201 })).status, 200);

  await call(req("POST", "/v1/auth/logout", { token: laptop.token, body: { everywhere: true } }), env, {
    now: NOW + 300
  });
  assert.equal((await call(req("GET", "/v1/me", { token: laptop.token }), env, { now: NOW + 301 })).status, 401);
});

test("logging out when already logged out is a success", async () => {
  const env = freshEnv();
  const out = await call(req("POST", "/v1/auth/logout", { body: {} }), env, { now: NOW });
  assert.equal(out.status, 200);
  assert.equal(out.body.ok, true);
});

test("starting the trial entitles the account and mints a verifiable token", async () => {
  const env = freshEnv();
  const { token } = await signInByEmail(env, "p@example.test", NOW);

  const started = await call(req("POST", "/v1/me/trial", { token, body: {} }), env, { now: NOW + 10 });
  assert.equal(started.status, 200);
  assert.equal(started.body.entitlement.pro, true);
  assert.equal(started.body.entitlement.source, "trial");
  assert.equal(started.body.account.trialUsed, true);
  assert.equal(started.body.entitlement.periodEnd, NOW + 10 + 30 * DAY);

  // The token must verify with the same key and claims the browser checks.
  const verified = await verifyLicenseToken(started.body.token, env, { now: NOW + 11 });
  assert.equal(verified.valid, true, verified.reason);
  assert.equal(verified.payload.plan, "pro_monthly");
  assert.equal(verified.payload.status, "active");
  assert.equal(verified.payload.aud, TEST_ORIGIN);
  assert.equal(verified.payload.accountId, started.body.account.id);
  assert.equal(verified.payload.source, "trial");
  // Never outlives what was granted.
  assert.ok(verified.payload.exp <= started.body.entitlement.periodEnd);
});

test("the trial cannot be started twice", async () => {
  const env = freshEnv();
  const { token } = await signInByEmail(env, "p@example.test", NOW);
  assert.equal((await call(req("POST", "/v1/me/trial", { token, body: {} }), env, { now: NOW + 10 })).status, 200);
  const again = await call(req("POST", "/v1/me/trial", { token, body: {} }), env, { now: NOW + 20 });
  assert.equal(again.status, 409);
  assert.equal(again.body.reason, "trial_used");
});

test("the trial runs out and the account drops back to free", async () => {
  const env = freshEnv();
  const { token } = await signInByEmail(env, "p@example.test", NOW);
  await call(req("POST", "/v1/me/trial", { token, body: {} }), env, { now: NOW + 10 });

  const later = await call(req("GET", "/v1/me", { token }), env, { now: NOW + 31 * DAY });
  assert.equal(later.body.entitlement.pro, false);
  assert.equal(later.body.token, null);
});

test("admin mints a gift code, a member redeems it, and both see it", async () => {
  const env = freshEnv();
  const admin = await signInByEmail(env, "admin@example.test", NOW);
  assert.equal(admin.body.account.role, "admin");
  const friend = await signInByEmail(env, "friend@example.test", NOW + 10);

  const minted = await call(
    req("POST", "/v1/admin/gift-codes", {
      token: admin.token,
      body: { days: 30, maxRedemptions: 5, note: "familia" }
    }),
    env,
    { now: NOW + 20 }
  );
  assert.equal(minted.status, 200);
  assert.match(minted.body.giftCode.code, /^VOCAL-/);

  const redeemed = await call(
    req("POST", "/v1/me/redeem", { token: friend.token, body: { code: minted.body.giftCode.code } }),
    env,
    { now: NOW + 30 }
  );
  assert.equal(redeemed.status, 200);
  assert.equal(redeemed.body.entitlement.pro, true);
  assert.equal(redeemed.body.entitlement.source, "gift");
  assert.equal(redeemed.body.redeemedDays, 30);

  const listed = await call(req("GET", "/v1/admin/gift-codes", { token: admin.token }), env, {
    now: NOW + 40
  });
  assert.equal(listed.body.giftCodes[0].redeemedCount, 1);
});

test("a member cannot reach any admin route", async () => {
  const env = freshEnv();
  const member = await signInByEmail(env, "member@example.test", NOW);
  const attempts = [
    ["POST", "/v1/admin/gift-codes", { days: 30 }],
    ["GET", "/v1/admin/gift-codes", undefined],
    ["POST", "/v1/admin/gift-codes/revoke", { code: "VOCAL-AAAA-AAAA" }],
    ["POST", "/v1/admin/grants", { email: "victim@example.test", days: 3650 }],
    ["POST", "/v1/admin/grants/revoke", { grantId: "grant_x" }],
    ["GET", "/v1/admin/account?email=victim@example.test", undefined],
    ["POST", "/v1/admin/sweep", {}]
  ];
  for (const [method, path, body] of attempts) {
    const result = await call(req(method, path, { token: member.token, body }), env, { now: NOW + 10 });
    assert.equal(result.status, 403, `${method} ${path} must be forbidden for a member`);
    assert.equal(result.body.reason, "forbidden");
  }
});

test("admin grants months by email, then takes them back", async () => {
  const env = freshEnv();
  const admin = await signInByEmail(env, "admin@example.test", NOW);

  // The friend has never signed in; granting creates the account for them.
  const granted = await call(
    req("POST", "/v1/admin/grants", {
      token: admin.token,
      body: { email: "tester@example.test", days: 60, note: "tester round 2" }
    }),
    env,
    { now: NOW + 10 }
  );
  assert.equal(granted.status, 200);
  assert.equal(granted.body.account.email, "tester@example.test");
  assert.equal(granted.body.grant.status, "active");

  const tester = await signInByEmail(env, "tester@example.test", NOW + 20);
  assert.equal(tester.body.entitlement.pro, true);
  assert.equal(tester.body.entitlement.source, "gift");

  const revoked = await call(
    req("POST", "/v1/admin/grants/revoke", { token: admin.token, body: { grantId: granted.body.grant.id } }),
    env,
    { now: NOW + 30 }
  );
  assert.equal(revoked.status, 200);
  assert.equal(revoked.body.grant.status, "revoked");

  const after = await call(req("GET", "/v1/me", { token: tester.token }), env, { now: NOW + 40 });
  assert.equal(after.body.entitlement.pro, false);
  assert.equal(after.body.token, null, "revocation stops the token being reissued");
});

test("granting the same person again is just another row", async () => {
  const env = freshEnv();
  const admin = await signInByEmail(env, "admin@example.test", NOW);
  for (let i = 0; i < 3; i += 1) {
    const granted = await call(
      req("POST", "/v1/admin/grants", {
        token: admin.token,
        body: { email: "friend@example.test", days: 30, note: `round ${i}` }
      }),
      env,
      { now: NOW + 10 + i }
    );
    assert.equal(granted.status, 200);
  }
  const looked = await call(
    req("GET", "/v1/admin/account?email=friend@example.test", { token: admin.token }),
    env,
    { now: NOW + 20 }
  );
  assert.equal(looked.body.grants.length, 3);
  assert.equal(looked.body.entitlement.pro, true);
});

test("admin lookup reports an unknown email rather than inventing one", async () => {
  const env = freshEnv();
  const admin = await signInByEmail(env, "admin@example.test", NOW);
  const missing = await call(
    req("GET", "/v1/admin/account?email=nobody@example.test", { token: admin.token }),
    env,
    { now: NOW + 10 }
  );
  assert.equal(missing.status, 404);
});

test("a paid subscription links to an account and follows it to another device", async () => {
  const env = freshEnv();
  const record = createEntitlement({ periodEnd: NOW + 40 * DAY });
  await putEntitlement(env.ENTITLEMENTS, record);
  await putClaimIndex(env.ENTITLEMENTS, "stripe", "cs_test_123", record.licenseId);

  const { token } = await signInByEmail(env, "buyer@example.test", NOW);
  const linked = await call(
    req("POST", "/v1/me/link", { token, body: { provider: "stripe", sessionId: "cs_test_123" } }),
    env,
    { now: NOW + 10 }
  );
  assert.equal(linked.status, 200);
  assert.equal(linked.body.entitlement.pro, true);
  assert.equal(linked.body.entitlement.source, "paid");
  assert.equal(linked.body.entitlement.provider, "stripe");

  // A brand new browser: sign in, and Pro is simply there.
  const elsewhere = await signInByEmail(env, "buyer@example.test", NOW + 100);
  assert.equal(elsewhere.body.entitlement.pro, true);
  const verified = await verifyLicenseToken(elsewhere.body.token, env, { now: NOW + 101 });
  assert.equal(verified.valid, true, verified.reason);
});

test("linking a checkout whose webhook has not landed answers 202", async () => {
  const env = freshEnv();
  const { token } = await signInByEmail(env, "buyer@example.test", NOW);
  const pending = await call(
    req("POST", "/v1/me/link", { token, body: { provider: "stripe", sessionId: "cs_not_yet" } }),
    env,
    { now: NOW + 10 }
  );
  assert.equal(pending.status, 202);
  assert.equal(pending.body.reason, "pending");
});

test("a subscription cannot be stolen by linking it to a second account", async () => {
  const env = freshEnv();
  const record = createEntitlement();
  await putEntitlement(env.ENTITLEMENTS, record);

  const owner = await signInByEmail(env, "owner@example.test", NOW);
  const thief = await signInByEmail(env, "thief@example.test", NOW + 10);

  assert.equal(
    (await call(req("POST", "/v1/me/link", { token: owner.token, body: { licenseId: record.licenseId } }), env, { now: NOW + 20 })).status,
    200
  );
  const stolen = await call(
    req("POST", "/v1/me/link", { token: thief.token, body: { licenseId: record.licenseId } }),
    env,
    { now: NOW + 30 }
  );
  assert.equal(stolen.status, 409);
  assert.equal(stolen.body.reason, "already_linked");
  assert.equal((await call(req("GET", "/v1/me", { token: thief.token }), env, { now: NOW + 40 })).body.entitlement.pro, false);
});

test("linking rejects a malformed request and an unknown license", async () => {
  const env = freshEnv();
  const { token } = await signInByEmail(env, "p@example.test", NOW);
  assert.equal((await call(req("POST", "/v1/me/link", { token, body: {} }), env, { now: NOW + 10 })).status, 400);
  assert.equal(
    (await call(req("POST", "/v1/me/link", { token, body: { provider: "paypal", sessionId: "x" } }), env, { now: NOW + 10 })).status,
    400
  );
  assert.equal(
    (await call(req("POST", "/v1/me/link", { token, body: { licenseId: "Z".repeat(43) } }), env, { now: NOW + 10 })).status,
    404
  );
});

test("progress round-trips and refuses a stale write", async () => {
  const env = freshEnv();
  const { token } = await signInByEmail(env, "p@example.test", NOW);

  const empty = await call(req("GET", "/v1/me/progress?profileId=default", { token }), env, { now: NOW + 10 });
  assert.equal(empty.body.rev, 0);
  assert.equal(empty.body.doc, null);

  const first = await call(
    req("PUT", "/v1/me/progress", { token, body: { profileId: "default", doc: { streak: 3 }, baseRev: 0 } }),
    env,
    { now: NOW + 20 }
  );
  assert.equal(first.status, 200);
  assert.equal(first.body.rev, 1);

  const read = await call(req("GET", "/v1/me/progress?profileId=default", { token }), env, { now: NOW + 30 });
  assert.deepEqual(read.body.doc, { streak: 3 });

  const stale = await call(
    req("PUT", "/v1/me/progress", { token, body: { profileId: "default", doc: { streak: 1 }, baseRev: 0 } }),
    env,
    { now: NOW + 40 }
  );
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.body.server.doc, { streak: 3 });
});

test("one account cannot read or overwrite another's progress", async () => {
  const env = freshEnv();
  const mine = await signInByEmail(env, "mine@example.test", NOW);
  const yours = await signInByEmail(env, "yours@example.test", NOW + 10);

  await call(
    req("PUT", "/v1/me/progress", { token: mine.token, body: { profileId: "default", doc: { secret: 1 }, baseRev: 0 } }),
    env,
    { now: NOW + 20 }
  );
  const peek = await call(req("GET", "/v1/me/progress?profileId=default", { token: yours.token }), env, {
    now: NOW + 30
  });
  assert.equal(peek.body.doc, null);

  // And writing to the same profile id touches only the caller's own row.
  await call(
    req("PUT", "/v1/me/progress", { token: yours.token, body: { profileId: "default", doc: { theirs: 1 }, baseRev: 0 } }),
    env,
    { now: NOW + 40 }
  );
  const still = await call(req("GET", "/v1/me/progress?profileId=default", { token: mine.token }), env, {
    now: NOW + 50
  });
  assert.deepEqual(still.body.doc, { secret: 1 });
});

test("progress can be listed and deleted", async () => {
  const env = freshEnv();
  const { token } = await signInByEmail(env, "p@example.test", NOW);
  await call(
    req("PUT", "/v1/me/progress", { token, body: { profileId: "default", doc: { a: 1 }, baseRev: 0 } }),
    env,
    { now: NOW + 20 }
  );
  const listed = await call(req("GET", "/v1/me/progress", { token }), env, { now: NOW + 30 });
  assert.equal(listed.body.profiles.length, 1);

  const deleted = await call(req("DELETE", "/v1/me/progress?profileId=default", { token }), env, {
    now: NOW + 40
  });
  assert.equal(deleted.status, 200);
  assert.equal((await call(req("GET", "/v1/me/progress?profileId=default", { token }), env, { now: NOW + 50 })).body.rev, 0);
});

test("signing in with Google reaches the same account as the emailed code", async () => {
  const env = freshEnv();
  const byEmail = await signInByEmail(env, "pablo@example.test", NOW);

  const pair = await webcrypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const publicJwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  const jwks = { keys: [{ kty: "RSA", n: publicJwk.n, e: publicJwk.e, alg: "RS256", use: "sig", kid: "k" }] };
  const b64 = (v) => Buffer.from(v).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "k" }));
  const payload = b64(
    JSON.stringify({
      iss: "https://accounts.google.com",
      aud: "test-client-id.apps.googleusercontent.com",
      sub: "google-sub-1",
      email: "Pablo@Example.test",
      email_verified: true,
      name: "Pablo",
      iat: NOW + 90,
      exp: NOW + 3600
    })
  );
  const signature = await webcrypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    pair.privateKey,
    Buffer.from(`${header}.${payload}`)
  );
  const idToken = `${header}.${payload}.${b64(new Uint8Array(signature))}`;

  const signed = await call(req("POST", "/v1/auth/google", { body: { idToken } }), env, {
    now: NOW + 100,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => jwks })
  });
  assert.equal(signed.status, 200, JSON.stringify(signed.body));
  assert.equal(signed.body.account.id, byEmail.body.account.id, "same email means the same account");
  assert.equal(signed.body.account.displayName, "Pablo");
});

test("a forged Google token gets no session", async () => {
  const env = freshEnv();
  const forged = await call(req("POST", "/v1/auth/google", { body: { idToken: "a.b.c" } }), env, {
    now: NOW,
    fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ keys: [] }) })
  });
  assert.equal(forged.status, 401);
  assert.equal(forged.body.sessionToken, undefined);
});

test("methods are enforced on every account route", async () => {
  const env = freshEnv();
  const cases = [
    ["GET", "/v1/auth/email/start"],
    ["GET", "/v1/auth/google"],
    ["POST", "/v1/auth/methods"],
    ["DELETE", "/v1/me"],
    ["GET", "/v1/me/trial"],
    ["PATCH", "/v1/me/progress"]
  ];
  for (const [method, path] of cases) {
    const result = await call(req(method, path), env, { now: NOW });
    assert.equal(result.status, 405, `${method} ${path} should be refused`);
    assert.ok(result.headers.get("allow"), "405 must say what is allowed");
  }
});

test("an unknown account path is a 404, not a crash", async () => {
  const env = freshEnv();
  const missing = await call(req("GET", "/v1/me/nonsense"), env, { now: NOW });
  assert.equal(missing.status, 404);
  const admin = await call(req("GET", "/v1/admin/nonsense"), env, { now: NOW });
  assert.equal(admin.status, 404);
});

test("malformed JSON is refused without a stack trace escaping", async () => {
  const env = freshEnv();
  const request = new Request(`${BASE}/v1/auth/email/start`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{not json"
  });
  const result = await call(request, env, { now: NOW });
  assert.equal(result.status, 400);
  assert.equal(result.body.reason, "bad_request");
});

test("the webhook and claim routes still behave exactly as before", async () => {
  const env = freshEnv();
  const record = createEntitlement({ periodEnd: NOW + 40 * DAY });
  await putEntitlement(env.ENTITLEMENTS, record);
  await putClaimIndex(env.ENTITLEMENTS, "stripe", "cs_anon", record.licenseId);

  // No account, no session: the original anonymous path is untouched.
  const claimed = await call(
    req("POST", "/v1/claim", { body: { provider: "stripe", sessionId: "cs_anon" } }),
    env,
    { now: NOW }
  );
  assert.equal(claimed.status, 200);
  assert.ok(claimed.body.token);

  const refreshed = await call(
    req("POST", "/v1/license", { body: { licenseId: record.licenseId } }),
    env,
    { now: NOW }
  );
  assert.equal(refreshed.status, 200);
  assert.ok(refreshed.body.token);
});

test("the admin role follows today's ADMIN_EMAILS, not the one stored at first sign-in", async () => {
  // Signed in once as an ordinary member, then added to the list later.
  const env = freshEnv({ ADMIN_EMAILS: "admin@example.test" });
  const late = await signInByEmail(env, "late-admin@example.test", NOW);
  assert.equal(late.body.account.role, "member");

  env.ADMIN_EMAILS = "admin@example.test, Late-Admin@example.test";
  const promoted = await call(req("GET", "/v1/me", { token: late.token }), env, { now: NOW + 10 });
  assert.equal(promoted.body.account.role, "admin", "the site shows the tools the routes already allow");
  const allowed = await call(req("GET", "/v1/admin/gift-codes", { token: late.token }), env, { now: NOW + 11 });
  assert.equal(allowed.status, 200);

  // Taken off the list again: the stored row still says admin, the answer must not.
  const founder = await signInByEmail(env, "admin@example.test", NOW + 20);
  assert.equal(founder.body.account.role, "admin");
  env.ADMIN_EMAILS = "late-admin@example.test";
  const demoted = await call(req("GET", "/v1/me", { token: founder.token }), env, { now: NOW + 30 });
  assert.equal(demoted.body.account.role, "member");
  const refused = await call(req("GET", "/v1/admin/gift-codes", { token: founder.token }), env, { now: NOW + 31 });
  assert.equal(refused.status, 403);
});

test("admin lookup says whether, how and when the person has signed in", async () => {
  const env = freshEnv();
  const admin = await signInByEmail(env, "admin@example.test", NOW);

  // Gifted before the friend ever signs in: the account exists, nobody has used it.
  await call(
    req("POST", "/v1/admin/grants", { token: admin.token, body: { email: "friend@example.test", days: 30 } }),
    env,
    { now: NOW + 10 }
  );
  const before = await call(
    req("GET", "/v1/admin/account?email=friend@example.test", { token: admin.token }),
    env,
    { now: NOW + 20 }
  );
  assert.equal(before.status, 200);
  assert.deepEqual(before.body.signIns, { methods: [], lastSeenAt: null, activeSessions: 0 });
  assert.equal(before.body.account.role, "member");

  const friend = await signInByEmail(env, "friend@example.test", NOW + 100);
  const after = await call(
    req("GET", "/v1/admin/account?email=Friend@Example.test", { token: admin.token }),
    env,
    { now: NOW + 200 }
  );
  assert.deepEqual(after.body.signIns.methods, ["email"]);
  assert.equal(after.body.signIns.lastSeenAt, NOW + 101);
  assert.equal(after.body.signIns.activeSessions, 1);

  // Signing out everywhere leaves the history but no live session.
  await call(req("POST", "/v1/auth/logout", { token: friend.token, body: { everywhere: true } }), env, {
    now: NOW + 300
  });
  const out = await call(
    req("GET", "/v1/admin/account?email=friend@example.test", { token: admin.token }),
    env,
    { now: NOW + 400 }
  );
  assert.deepEqual(out.body.signIns.methods, ["email"]);
  assert.equal(out.body.signIns.activeSessions, 0);
});
