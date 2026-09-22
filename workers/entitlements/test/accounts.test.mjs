/**
 * Accounts, identities, sessions and emailed sign-in codes.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  LOGIN_CODE_MAX_ATTEMPTS,
  adminEmails,
  consumeLoginCode,
  createSession,
  ensureAccount,
  getAccountByEmail,
  isAdmin,
  issueLoginCode,
  mintLoginCode,
  recordIdentity,
  resolveSession,
  revokeAllSessions,
  revokeSession,
  toPublicAccount
} from "../src/accounts.js";
import { ensureSchema, normalizeEmail, resetSchemaMemo, sha256Hex } from "../src/db.js";
import { createAccountEnv } from "./fixtures.mjs";

/**
 * Fresh env with the schema already in place.
 * @returns {Promise<Object>} Env bindings.
 */
async function freshEnv() {
  resetSchemaMemo();
  const env = createAccountEnv();
  await ensureSchema(env.DB);
  return env;
}

test("normalizeEmail lowercases and trims but keeps dots and plus tags", () => {
  assert.equal(normalizeEmail("  Pablo@Example.TEST "), "pablo@example.test");
  assert.equal(normalizeEmail("a.b+tag@gmail.com"), "a.b+tag@gmail.com");
  assert.equal(normalizeEmail("nope"), "");
  assert.equal(normalizeEmail("no@domain"), "");
  assert.equal(normalizeEmail("a b@c.com"), "");
  assert.equal(normalizeEmail(`${"x".repeat(250)}@a.com`), "");
  assert.equal(normalizeEmail(null), "");
});

test("ensureAccount is idempotent across casing and whitespace", async () => {
  const env = await freshEnv();
  const first = await ensureAccount(env.DB, "Pablo@Example.test", {}, 1000);
  const second = await ensureAccount(env.DB, "  pablo@example.TEST  ", {}, 1100);
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.account.id, first.account.id);
  assert.equal(first.account.email, "pablo@example.test");
});

test("ensureAccount fills a missing display name but never overwrites one", async () => {
  const env = await freshEnv();
  await ensureAccount(env.DB, "p@example.test", {}, 1000);
  await ensureAccount(env.DB, "p@example.test", { displayName: "Pablo" }, 1100);
  let row = await getAccountByEmail(env.DB, "p@example.test");
  assert.equal(row.display_name, "Pablo");

  await ensureAccount(env.DB, "p@example.test", { displayName: "Somebody Else" }, 1200);
  row = await getAccountByEmail(env.DB, "p@example.test");
  assert.equal(row.display_name, "Pablo");
});

test("ensureAccount rejects an unusable email", async () => {
  const env = await freshEnv();
  await assert.rejects(() => ensureAccount(env.DB, "not-an-email", {}, 1000), /invalid_email/);
});

test("an account listed in ADMIN_EMAILS is created as admin", async () => {
  const env = await freshEnv();
  const { account } = await ensureAccount(
    env.DB,
    "admin@example.test",
    { adminEmails: adminEmails(env) },
    1000
  );
  assert.equal(account.role, "admin");
  assert.equal(isAdmin(account, env), true);
});

test("isAdmin follows the current env, not the stored role", async () => {
  const env = await freshEnv();
  const { account } = await ensureAccount(
    env.DB,
    "admin@example.test",
    { adminEmails: adminEmails(env) },
    1000
  );
  assert.equal(isAdmin(account, env), true);
  // Taking the email out of the worker config removes admin at once, without
  // anybody having to remember to edit the row.
  assert.equal(isAdmin(account, { ...env, ADMIN_EMAILS: "" }), false);
  assert.equal(isAdmin(account, { ...env, ADMIN_EMAILS: "other@example.test" }), false);
});

test("two sign-in methods for one email land on one account", async () => {
  const env = await freshEnv();
  const { account } = await ensureAccount(env.DB, "p@example.test", {}, 1000);
  await recordIdentity(env.DB, account.id, "email", "p@example.test", 1000);
  await recordIdentity(env.DB, account.id, "google", "google-subject-1", 1100);
  const rows = await env.DB.prepare("SELECT provider FROM identities WHERE account_id = ?1")
    .bind(account.id)
    .all();
  assert.deepEqual(
    rows.results.map((r) => r.provider).sort(),
    ["email", "google"]
  );
});

test("recording the same identity twice adds one row", async () => {
  const env = await freshEnv();
  const { account } = await ensureAccount(env.DB, "p@example.test", {}, 1000);
  await recordIdentity(env.DB, account.id, "google", "sub-1", 1000);
  await recordIdentity(env.DB, account.id, "google", "sub-1", 1100);
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM identities").first();
  assert.equal(Number(row.n), 1);
});

test("recordIdentity ignores an unknown provider", async () => {
  const env = await freshEnv();
  const { account } = await ensureAccount(env.DB, "p@example.test", {}, 1000);
  await recordIdentity(env.DB, account.id, "myspace", "sub-1", 1000);
  const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM identities").first();
  assert.equal(Number(row.n), 0);
});

test("a session token is stored only as a hash", async () => {
  const env = await freshEnv();
  const { account } = await ensureAccount(env.DB, "p@example.test", {}, 1000);
  const session = await createSession(env.DB, account.id, 1000);
  const row = await env.DB.prepare("SELECT token_hash FROM sessions WHERE id = ?1")
    .bind(session.sessionId)
    .first();
  assert.notEqual(row.token_hash, session.token);
  assert.equal(row.token_hash, await sha256Hex(session.token));
});

test("resolveSession accepts a live token and rejects everything else", async () => {
  const env = await freshEnv();
  const { account } = await ensureAccount(env.DB, "p@example.test", {}, 1000);
  const session = await createSession(env.DB, account.id, 1000);

  const good = await resolveSession(env.DB, session.token, 1001);
  assert.equal(good.ok, true);
  assert.equal(good.account.id, account.id);

  assert.equal((await resolveSession(env.DB, "", 1001)).reason, "no_session");
  assert.equal((await resolveSession(env.DB, "not-a-token", 1001)).reason, "no_session");
  assert.equal((await resolveSession(env.DB, "x".repeat(300), 1001)).reason, "no_session");
  assert.equal((await resolveSession(env.DB, session.token, session.expiresAt + 1)).reason, "expired");
});

test("a revoked session stops working, and revoking all covers every device", async () => {
  const env = await freshEnv();
  const { account } = await ensureAccount(env.DB, "p@example.test", {}, 1000);
  const phone = await createSession(env.DB, account.id, 1000);
  const laptop = await createSession(env.DB, account.id, 1000);

  await revokeSession(env.DB, phone.sessionId, 1100);
  assert.equal((await resolveSession(env.DB, phone.token, 1101)).reason, "revoked");
  assert.equal((await resolveSession(env.DB, laptop.token, 1101)).ok, true);

  await revokeAllSessions(env.DB, account.id, 1200);
  assert.equal((await resolveSession(env.DB, laptop.token, 1201)).reason, "revoked");
});

test("a disabled account cannot use a session it already holds", async () => {
  const env = await freshEnv();
  const { account } = await ensureAccount(env.DB, "p@example.test", {}, 1000);
  const session = await createSession(env.DB, account.id, 1000);
  await env.DB.prepare("UPDATE accounts SET disabled_at = ?2 WHERE id = ?1").bind(account.id, 1100).run();
  assert.equal((await resolveSession(env.DB, session.token, 1101)).reason, "disabled");
});

test("last_seen_at is only rewritten once an hour", async () => {
  const env = await freshEnv();
  const { account } = await ensureAccount(env.DB, "p@example.test", {}, 1000);
  const session = await createSession(env.DB, account.id, 1000);

  await resolveSession(env.DB, session.token, 1500);
  let row = await env.DB.prepare("SELECT last_seen_at FROM sessions WHERE id = ?1")
    .bind(session.sessionId)
    .first();
  assert.equal(Number(row.last_seen_at), 1000);

  await resolveSession(env.DB, session.token, 1000 + 3601);
  row = await env.DB.prepare("SELECT last_seen_at FROM sessions WHERE id = ?1")
    .bind(session.sessionId)
    .first();
  assert.equal(Number(row.last_seen_at), 4601);
});

test("mintLoginCode returns six digits", () => {
  for (let i = 0; i < 50; i += 1) {
    assert.match(mintLoginCode(), /^\d{6}$/);
  }
});

test("a login code is stored only as a hash and verifies once", async () => {
  const env = await freshEnv();
  const { code } = await issueLoginCode(env.DB, "p@example.test", 1000);
  const row = await env.DB.prepare("SELECT code_hash FROM login_codes").first();
  assert.notEqual(row.code_hash, code);

  assert.equal((await consumeLoginCode(env.DB, "p@example.test", code, 1001)).ok, true);
  // Consumed: the same code cannot be replayed.
  assert.equal((await consumeLoginCode(env.DB, "p@example.test", code, 1002)).reason, "no_code");
});

test("asking for a second code invalidates the first", async () => {
  const env = await freshEnv();
  const first = await issueLoginCode(env.DB, "p@example.test", 1000);
  const second = await issueLoginCode(env.DB, "p@example.test", 1100);
  assert.equal((await consumeLoginCode(env.DB, "p@example.test", first.code, 1101)).reason, "bad_code");
  assert.equal((await consumeLoginCode(env.DB, "p@example.test", second.code, 1102)).ok, true);
});

test("a login code expires", async () => {
  const env = await freshEnv();
  const { code, expiresAt } = await issueLoginCode(env.DB, "p@example.test", 1000);
  assert.equal((await consumeLoginCode(env.DB, "p@example.test", code, expiresAt + 1)).reason, "expired");
});

test("wrong guesses burn the code", async () => {
  const env = await freshEnv();
  const { code } = await issueLoginCode(env.DB, "p@example.test", 1000);
  for (let i = 1; i < LOGIN_CODE_MAX_ATTEMPTS; i += 1) {
    assert.equal((await consumeLoginCode(env.DB, "p@example.test", "000000", 1000 + i)).reason, "bad_code");
  }
  assert.equal(
    (await consumeLoginCode(env.DB, "p@example.test", "000000", 1100)).reason,
    "too_many_attempts"
  );
  // The real code is dead too, so brute force costs a fresh email every time.
  assert.equal((await consumeLoginCode(env.DB, "p@example.test", code, 1101)).reason, "no_code");
});

test("a code issued for one address does not work for another", async () => {
  const env = await freshEnv();
  const { code } = await issueLoginCode(env.DB, "p@example.test", 1000);
  assert.equal((await consumeLoginCode(env.DB, "other@example.test", code, 1001)).reason, "no_code");
});

test("a malformed code is refused before any lookup", async () => {
  const env = await freshEnv();
  await issueLoginCode(env.DB, "p@example.test", 1000);
  assert.equal((await consumeLoginCode(env.DB, "p@example.test", "12345", 1001)).reason, "bad_code");
  assert.equal((await consumeLoginCode(env.DB, "p@example.test", "", 1001)).reason, "bad_code");
  assert.equal((await consumeLoginCode(env.DB, "bad-email", "123456", 1001)).reason, "bad_code");
});

test("toPublicAccount exposes no internal columns", async () => {
  const env = await freshEnv();
  const { account } = await ensureAccount(env.DB, "p@example.test", {}, 1000);
  const view = toPublicAccount(account);
  assert.deepEqual(
    Object.keys(view).sort(),
    ["createdAt", "displayName", "email", "id", "locale", "role", "trialUsed"]
  );
  assert.equal(view.trialUsed, false);
});
