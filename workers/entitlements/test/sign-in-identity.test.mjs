/**
 * Which account a sign-in reaches, and whether a switched-off account gets in
 * at all (red team 2026-11-18, AUTHN-1, AUTHN-2 and AUTHN-7).
 *
 * AUTHN-1: Google sign-in looked the account up by the token's email and
 * ignored `sub`, Google's stable id for one Google account. Two defects
 * followed, and both are modelled here:
 * - a second Google account holding the same address (possible for any
 *   address that is not Gmail or a Workspace domain the sender controls)
 *   landed in the first one's account, its practice and its admin role;
 * - a Google account whose address changed got a new, empty account, and
 *   its `sub` stayed bound to the old one where nothing could reach it.
 * The wrong behaviour each test rejects is the one main had; the controls
 * keep the joins that must go on working (the same `sub` again, and an
 * account that no Google account owns yet).
 *
 * AUTHN-2: `disabled_at` was checked only when a session was used, so both
 * sign-in routes answered 200 with a new session and a licence token signed
 * for 72 hours. GAP-REGISTER item 54 names that column as the way to stop an
 * account; these tests hold it to that.
 *
 * AUTHN-7: no worker response said `nosniff`.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";

import { resetSchemaMemo } from "../src/db.js";
import { clearGoogleJwksCache } from "../src/google.js";
import { handleRequest } from "../src/index.js";
import { createAccountEnv } from "./fixtures.mjs";

const BASE = "https://entitlements.test";
const NOW = 1800000000;
const CLIENT_ID = "test-client-id.apps.googleusercontent.com";

const b64 = (v) => Buffer.from(v).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const pair = await webcrypto.subtle.generateKey(
  { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
  true,
  ["sign", "verify"]
);
const publicJwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
const jwks = { keys: [{ kty: "RSA", n: publicJwk.n, e: publicJwk.e, alg: "RS256", use: "sig", kid: "k" }] };
const googleKeys = async () => ({ ok: true, status: 200, json: async () => jwks });

/** A Google ID token signed by the test key, for one `sub` and one email. */
async function idToken(sub, email) {
  const header = b64(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "k" }));
  const payload = b64(JSON.stringify({
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub,
    email,
    email_verified: true,
    iat: NOW,
    exp: NOW + 3600
  }));
  const signature = await webcrypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, Buffer.from(`${header}.${payload}`));
  return `${header}.${payload}.${b64(new Uint8Array(signature))}`;
}

function freshEnv() {
  resetSchemaMemo();
  clearGoogleJwksCache();
  return createAccountEnv();
}

async function call(env, method, path, body, deps) {
  const response = await handleRequest(new Request(`${BASE}${path}`, {
    method,
    headers: body === undefined ? {} : { "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  }), env, deps);
  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed, headers: response.headers };
}

async function google(env, sub, email, now) {
  return call(env, "POST", "/v1/auth/google", { idToken: await idToken(sub, email) }, { now, fetchImpl: googleKeys });
}

/** Ask for a code and return it, read from the email the fake transport was handed. */
async function emailedCode(env, email, now) {
  let code = null;
  const fetchImpl = async (url, init) => {
    code = (/\b(\d{6})\b/.exec(JSON.parse(init.body).text || "") || [])[1] || null;
    return { ok: true, status: 200 };
  };
  const started = await call(env, "POST", "/v1/auth/email/start", { email }, { now, fetchImpl });
  assert.equal(started.status, 200, JSON.stringify(started.body));
  assert.ok(code, "a code was emailed");
  return code;
}

async function count(env, sql, ...args) {
  const row = await env.DB.prepare(sql).bind(...args).first();
  return Object.values(row)[0];
}

test("a second Google account with the same address does not enter the first one's account", async () => {
  const env = freshEnv();
  const owner = await google(env, "sub-111", "alice@smalldomain.example", NOW + 1);
  assert.equal(owner.status, 200, JSON.stringify(owner.body));

  const other = await google(env, "sub-222", "alice@smalldomain.example", NOW + 3);
  assert.equal(other.status, 409, "main answered 200 into the owner's account");
  assert.equal(other.body.reason, "identity_conflict");
  assert.equal(other.body.sessionToken, undefined, "no session for the second Google account");
  assert.equal(other.body.account, undefined, "nothing of the owner's account is shown");
  assert.equal(
    await count(env, "SELECT COUNT(*) AS n FROM identities WHERE provider = 'google' AND subject = ?1", "sub-222"),
    0,
    "the second Google account is not bound to the owner's account"
  );
  assert.equal(await count(env, "SELECT COUNT(*) AS n FROM sessions WHERE account_id = ?1", owner.body.account.id), 1);
});

test("the operator's admin role does not pass to another Google account with the operator's address", async () => {
  const env = freshEnv();
  const operator = await google(env, "sub-op", "admin@example.test", NOW + 1);
  assert.equal(operator.status, 200);
  assert.equal(operator.body.account.role, "admin", "the fixture's ADMIN_EMAILS makes this an admin");
  const impostor = await google(env, "sub-imp", "admin@example.test", NOW + 2);
  assert.equal(impostor.status, 409);
  assert.equal(impostor.body.sessionToken, undefined);
});

test("a Google account whose address changed keeps its account", async () => {
  const env = freshEnv();
  const before = await google(env, "sub-maria", "maria.lopez@corp.example", NOW + 1);
  const after = await google(env, "sub-maria", "maria.garcia@corp.example", NOW + 2);
  assert.equal(after.status, 200, JSON.stringify(after.body));
  assert.equal(after.body.account.id, before.body.account.id, "main made a new, empty account here");
  assert.equal(
    await count(env, "SELECT COUNT(*) AS n FROM accounts WHERE email = ?1", "maria.garcia@corp.example"),
    0,
    "no second account is opened for the new address"
  );
});

test("an address handed on to a new Google account does not hand over the account", async () => {
  const env = freshEnv();
  // A Workspace address is reassigned: the first holder's Google account now
  // has a new address, and a new Google account holds the old one.
  const first = await google(env, "sub-first", "sales@shop.example", NOW + 1);
  const moved = await google(env, "sub-first", "ana@shop.example", NOW + 2);
  assert.equal(moved.body.account.id, first.body.account.id);
  const successor = await google(env, "sub-next", "sales@shop.example", NOW + 3);
  assert.equal(successor.status, 409, "the account still carries the old address, and it is the first holder's");
  assert.equal(successor.body.sessionToken, undefined);
});

test("control: the same Google account signs back into its own account", async () => {
  const env = freshEnv();
  const a = await google(env, "sub-111", "alice@smalldomain.example", NOW + 1);
  const b = await google(env, "sub-111", "Alice@SmallDomain.example", NOW + 2);
  assert.equal(b.status, 200);
  assert.equal(b.body.account.id, a.body.account.id);
  assert.ok(b.body.sessionToken);
});

test("control: an account no Google account owns yet is joined by its address", async () => {
  const env = freshEnv();
  const code = await emailedCode(env, "carla@example.test", NOW);
  const byEmail = await call(env, "POST", "/v1/auth/email/verify", { email: "carla@example.test", code }, { now: NOW + 1 });
  assert.equal(byEmail.status, 200);
  const byGoogle = await google(env, "sub-carla", "carla@example.test", NOW + 2);
  assert.equal(byGoogle.status, 200, JSON.stringify(byGoogle.body));
  assert.equal(byGoogle.body.account.id, byEmail.body.account.id, "an emailed-code account and Google meet by address");
  const back = await google(env, "sub-carla", "carla@example.test", NOW + 3);
  assert.equal(back.body.account.id, byEmail.body.account.id, "and from then on by sub");
});

test("a switched-off account gets no session and no licence from Google sign-in", async () => {
  const env = freshEnv();
  const first = await google(env, "sub-off", "someone@gmail.com", NOW + 1);
  await env.DB.prepare("UPDATE accounts SET disabled_at = ?2 WHERE id = ?1").bind(first.body.account.id, NOW + 5).run();
  const sessionsBefore = await count(env, "SELECT COUNT(*) AS n FROM sessions WHERE account_id = ?1", first.body.account.id);

  const again = await google(env, "sub-off", "someone@gmail.com", NOW + 10);
  assert.equal(again.status, 403, "main answered 200 with a new session");
  assert.equal(again.body.reason, "disabled");
  assert.equal(again.body.sessionToken, undefined);
  assert.equal(again.body.token, undefined, "no signed licence");
  assert.equal(
    await count(env, "SELECT COUNT(*) AS n FROM sessions WHERE account_id = ?1", first.body.account.id),
    sessionsBefore,
    "no session row was written"
  );
});

test("a switched-off account gets no session and no licence from an emailed code", async () => {
  const env = freshEnv();
  const code = await emailedCode(env, "off@example.test", NOW);
  const opened = await call(env, "POST", "/v1/auth/email/verify", { email: "off@example.test", code }, { now: NOW + 1 });
  assert.equal(opened.status, 200);
  await env.DB.prepare("UPDATE accounts SET disabled_at = ?2 WHERE id = ?1").bind(opened.body.account.id, NOW + 5).run();

  const next = await emailedCode(env, "off@example.test", NOW + 100);
  const refused = await call(env, "POST", "/v1/auth/email/verify", { email: "off@example.test", code: next }, { now: NOW + 101 });
  assert.equal(refused.status, 403, "main answered 200 with a new session");
  assert.equal(refused.body.reason, "disabled");
  assert.equal(refused.body.sessionToken, undefined);
  assert.equal(refused.body.token, undefined);
  assert.equal(await count(env, "SELECT COUNT(*) AS n FROM sessions WHERE account_id = ?1", opened.body.account.id), 1);
});

test("switching an account back on lets it sign in again", async () => {
  const env = freshEnv();
  const first = await google(env, "sub-back", "back@example.test", NOW + 1);
  await env.DB.prepare("UPDATE accounts SET disabled_at = ?2 WHERE id = ?1").bind(first.body.account.id, NOW + 5).run();
  assert.equal((await google(env, "sub-back", "back@example.test", NOW + 6)).status, 403);
  await env.DB.prepare("UPDATE accounts SET disabled_at = NULL WHERE id = ?1").bind(first.body.account.id).run();
  const back = await google(env, "sub-back", "back@example.test", NOW + 7);
  assert.equal(back.status, 200);
  assert.ok(back.body.sessionToken);
});

test("worker answers say nosniff: a success, an error and a preflight", async () => {
  const env = freshEnv();
  const ok = await call(env, "GET", "/v1/auth/methods", undefined, { now: NOW });
  const missing = await call(env, "GET", "/v1/me/nonsense", undefined, { now: NOW });
  const preflight = await handleRequest(new Request(`${BASE}/v1/me`, {
    method: "OPTIONS",
    headers: { Origin: "https://example.test", "access-control-request-method": "GET" }
  }), env, { now: NOW });
  assert.equal(ok.status, 200);
  assert.equal(missing.status, 404);
  for (const [label, headers] of [["methods", ok.headers], ["404", missing.headers], ["preflight", preflight.headers]]) {
    assert.equal(headers.get("x-content-type-options"), "nosniff", `${label} carries nosniff`);
  }
});
