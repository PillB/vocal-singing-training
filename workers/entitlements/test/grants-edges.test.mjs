/**
 * Gift codes, grants and the trial at their edges: one code among several, a
 * second request landing between a read and its write, a note longer than the
 * cap or not a string, a failed write, and a D1 error in D1's own words.
 *
 * A sweep of planted defects on PR #38 found changes to src/grants.js that
 * every worker test let through, and each was confirmed by a second run. They
 * slipped for a handful of reasons, and each test below removes one:
 * - every older gift-code test made one code, so a write that lost its
 *   `WHERE code_normalized = ?1` hit the same row it was meant to;
 * - the race tests used accounts with no earlier redemption, and read one
 *   field off the losing admin's answer;
 * - `createGrant` answers with the row it built, so its POST response cannot
 *   show what D1 stored, and nobody read a grant's note back;
 * - the fake runs a write at once, so a write nobody waits for still lands;
 * - node:sqlite's errors do not carry the words D1 puts around its own.
 *
 * Wherever the defect reaches a person, the test goes through the router
 * (`handleRequest`), signed in as that person. Where it only reaches the
 * database, the route still drives it and the stored row is read with SQL.
 * Each test was run against its planted defect and turned red there.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { resetSchemaMemo } from "../src/db.js";
import { handleRequest } from "../src/index.js";
import { createAccountEnv } from "./fixtures.mjs";

const BASE = "https://entitlements.test";
const T = 1800000000;
const DAY = 86400;

// ------------------------------------------------------------------ helpers

/** A fresh env with D1, and the schema memo cleared. */
function freshEnv(overrides) {
  resetSchemaMemo();
  return createAccountEnv(overrides);
}

/** A JSON request, signed in when given a session token. */
function jsonRequest(method, path, body, token) {
  const headers = { "content-type": "application/json" };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  return new Request(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

/**
 * Call the router and read the JSON answer. A worker error comes back as
 * `{status: 500, thrown}`, the 500 the worker's fetch wrapper answers with.
 * A failed assertion (a control inside a race hook) is not the worker's
 * error, so it is thrown on and reports as itself.
 */
async function call(env, request, options) {
  try {
    const res = await handleRequest(request, env, options);
    return { status: res.status, body: await res.json() };
  } catch (error) {
    if (error instanceof assert.AssertionError) {
      throw error;
    }
    return { status: 500, thrown: error };
  }
}

/** Sign in by emailed code; returns the session token and the account id. */
async function signIn(env, email) {
  let code = null;
  const fetchImpl = async (url, init) => {
    code = (/\b(\d{6})\b/.exec(JSON.parse(init.body).text || "") || [])[1];
    return { ok: true, status: 200 };
  };
  assert.equal((await call(env, jsonRequest("POST", "/v1/auth/email/start", { email }), { now: T, fetchImpl })).status, 200);
  const verified = await call(env, jsonRequest("POST", "/v1/auth/email/verify", { email, code }), { now: T + 1 });
  assert.equal(verified.status, 200, `${email} signed in`);
  return { token: verified.body.sessionToken, id: verified.body.account.id };
}

/** An admin mints a gift code; returns it in display form. */
async function newCode(env, admin, body, now) {
  const made = await call(env, jsonRequest("POST", "/v1/admin/gift-codes", body, admin.token), { now });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  return made.body.giftCode.code;
}

/** A member redeems a code. */
function redeem(env, member, code, now) {
  return call(env, jsonRequest("POST", "/v1/me/redeem", { code }, member.token), { now });
}

/** An admin revokes a code. */
function revokeCode(env, admin, code, now) {
  return call(env, jsonRequest("POST", "/v1/admin/gift-codes/revoke", { code }, admin.token), { now });
}

/** Every code on the admin's list, as code -> {redeemedCount, revokedAt}. */
async function codeStates(env, admin, now) {
  const listed = await call(env, jsonRequest("GET", "/v1/admin/gift-codes", undefined, admin.token), { now });
  assert.equal(listed.status, 200);
  return Object.fromEntries(listed.body.giftCodes.map((c) => [c.code, { redeemedCount: c.redeemedCount, revokedAt: c.revokedAt }]));
}

/** The ids of the grants on a member's own account page. */
async function grantIdsOf(env, member, now) {
  const me = await call(env, jsonRequest("GET", "/v1/me", undefined, member.token), { now });
  assert.equal(me.status, 200);
  return me.body.grants.map((g) => g.id);
}

/**
 * A member who has already redeemed one code, so their account has an
 * earlier redemption on it; returns them, that code, and the one grant it left.
 */
async function memberWithEarlierMonth(env, admin, email) {
  const member = await signIn(env, email);
  const earlierCode = await newCode(env, admin, { days: 30, maxRedemptions: 5 }, T + 10);
  const earlier = await redeem(env, member, earlierCode, T + 20);
  assert.equal(earlier.status, 200);
  const held = earlier.body.grants.map((g) => g.id);
  assert.equal(held.length, 1, "one month, from the earlier code");
  return { member, earlierCode, held };
}

/**
 * The database with every write (a `run`, or a `batch` as one) passed to
 * `hook(sqls, go)`, where `sqls` is the SQL of the statements it runs and
 * `go()` runs it. Reads pass straight through.
 * @param {Object} db D1 fake.
 * @param {function(string[], function(): Promise<unknown>): Promise<unknown>} hook Write hook.
 * @returns {Object} D1-shaped wrapper.
 */
function onWrite(db, hook) {
  const wrap = (statement, sql) => ({
    raw: statement,
    sql,
    bind: (...values) => wrap(statement.bind(...values), sql),
    first: (column) => statement.first(column),
    all: () => statement.all(),
    run: () => hook([sql], () => statement.run())
  });
  return {
    prepare: (sql) => wrap(db.prepare(sql), sql),
    batch: (list) => hook(list.map((s) => s.sql), () => db.batch(list.map((s) => s.raw)))
  };
}

/** True when any of `sqls` matches `pattern`. */
const touches = (sqls, pattern) => sqls.some((sql) => pattern.test(sql));

/**
 * The database with another request run to completion once, just before this
 * request's first write that touches `pattern`. Keyed on the statement rather
 * than on the first write, because a route writes its session and its rate
 * limit before the write the race is about.
 * @param {Object} db D1 fake.
 * @param {RegExp} pattern SQL of the write to land before.
 * @param {function(): Promise<unknown>} others The other request.
 * @returns {{db: Object, seen: {ran: boolean}}} Wrapper, and whether the other request ran.
 */
function landsBefore(db, pattern, others) {
  const seen = { ran: false };
  const hook = async (sqls, go) => {
    if (!seen.ran && touches(sqls, pattern)) {
      seen.ran = true;
      await others();
    }
    return go();
  };
  return { db: onWrite(db, hook), seen };
}

/** The database with every write touching `pattern` refused, as D1 refuses one when its connection drops. */
function refusing(db, pattern) {
  const lost = () => Promise.reject(new Error("D1_ERROR: Network connection lost."));
  return onWrite(db, (sqls, go) => (touches(sqls, pattern) ? lost() : go()));
}

// ------------------------------------------------------------- gift codes

test("revoking one gift code, or spending one of its uses, leaves every other code as it was", async () => {
  // Both writes find their code by its key. Without it, the admin's revoke of
  // one code retired every live code in the deployment, and one member's
  // redemption spent a use of every code: the next person to type in a code
  // they were sent was told "revoked" or "used up" about a code nobody had
  // touched. Every older test made a single code, so the row the write was
  // meant for was the only row there was.
  //
  // Codes are minted at random, so the five are put in order and the two
  // that are touched (the 2nd and the 4th) each sit between untouched ones.
  // A write whose key reaches past its own row, in either direction, then
  // lands on an untouched code on every run, not only on the runs where the
  // draw happened to put one there.
  const env = freshEnv();
  const admin = await signIn(env, "admin@example.test");
  const singer = await signIn(env, "singer@example.test");
  const friend = await signIn(env, "friend@example.test");
  const minted = [];
  for (const offset of [10, 11, 12, 13, 14]) {
    minted.push(await newCode(env, admin, { days: 30, maxRedemptions: 1 }, T + offset));
  }
  const [first, spent, middle, retired, last] = minted.sort();

  assert.equal((await redeem(env, singer, spent, T + 20)).status, 200);
  const revoked = await revokeCode(env, admin, retired, T + 30);
  assert.deepEqual([revoked.status, revoked.body], [200, { ok: true, reason: null }]);

  // The 2nd and 4th lines are the control: the redemption and the revoke
  // both happened. The other three are the codes neither of them named.
  assert.deepEqual(await codeStates(env, admin, T + 35), {
    [first]: { redeemedCount: 0, revokedAt: null },
    [spent]: { redeemedCount: 1, revokedAt: null },
    [middle]: { redeemedCount: 0, revokedAt: null },
    [retired]: { redeemedCount: 0, revokedAt: T + 30 },
    [last]: { redeemedCount: 0, revokedAt: null }
  });
  const third = await redeem(env, friend, middle, T + 40);
  assert.deepEqual([third.status, third.body.reason, third.body.redeemedDays], [200, undefined, 30], "a code nobody touched still pays out");
});

test("a code revoked mid-redemption pays nothing, even to an account that redeemed another code before", async () => {
  // The grant is written only once this redemption's own row exists. Asked
  // instead whether the account had any redemption at all, a request that
  // read the code as live and reached its write after an admin had revoked
  // it still wrote the month, whenever the member had redeemed some other
  // code before: the member was told "revoked" and kept the month anyway.
  // Attempts made after the revoke has landed are refused at the read and
  // never reach the write, so the cost is one month for each member caught
  // in that window, which is where a leaked code being redeemed by a crowd
  // while the admin revokes it puts them. The race tests in d1-atomicity used
  // accounts with no earlier redemption, where the two questions have the
  // same answer.
  const env = freshEnv();
  const admin = await signIn(env, "admin@example.test");
  const { member: singer, earlierCode, held } = await memberWithEarlierMonth(env, admin, "singer@example.test");
  const leaked = await newCode(env, admin, { days: 30, maxRedemptions: 5 }, T + 11);

  const race = landsBefore(env.DB, /INSERT INTO gift_redemptions/, async () => {
    assert.equal((await revokeCode(env, admin, leaked, T + 30)).status, 200);
  });
  const refused = await redeem({ ...env, DB: race.db }, singer, leaked, T + 40);
  assert.equal(race.seen.ran, true, "control: the revoke landed between the redemption's read and its write");
  assert.deepEqual([refused.status, refused.body], [409, { ok: false, reason: "revoked" }]);

  assert.deepEqual(await grantIdsOf(env, singer, T + 50), held, "still only the month from the earlier code");
  assert.deepEqual(await codeStates(env, admin, T + 50), {
    [earlierCode]: { redeemedCount: 1, revokedAt: null },
    [leaked]: { redeemedCount: 0, revokedAt: T + 30 }
  });
});

test("a code used up mid-redemption pays nothing to the member who lost the race, even one who redeemed another code before", async () => {
  // The same guard, and the commoner way to lose the race: a code with one
  // use left, redeemed by two people at the same moment. The one whose write
  // comes second is told "exhausted". With the grant asked about the account
  // instead of this redemption, that member was given the month anyway
  // whenever they had redeemed any earlier code, so a limited code shared in
  // a group chat paid out one month more than its limit for each such loser.
  const env = freshEnv();
  const admin = await signIn(env, "admin@example.test");
  const { member: singer, earlierCode, held } = await memberWithEarlierMonth(env, admin, "singer@example.test");
  const friend = await signIn(env, "friend@example.test");
  const lastUse = await newCode(env, admin, { days: 30, maxRedemptions: 1 }, T + 11);

  let took = null;
  const race = landsBefore(env.DB, /INSERT INTO gift_redemptions/, async () => {
    took = await redeem(env, friend, lastUse, T + 30);
  });
  const refused = await redeem({ ...env, DB: race.db }, singer, lastUse, T + 40);
  assert.equal(race.seen.ran, true, "control: the friend's redemption landed between this one's read and its write");
  assert.equal(took.status, 200, "control: and it took the last use");
  assert.deepEqual([refused.status, refused.body], [409, { ok: false, reason: "exhausted" }]);

  assert.deepEqual(await grantIdsOf(env, singer, T + 50), held, "still only the month from the earlier code");
  assert.deepEqual(await codeStates(env, admin, T + 50), {
    [earlierCode]: { redeemedCount: 1, revokedAt: null },
    [lastUse]: { redeemedCount: 1, revokedAt: null }
  });
});

test("a redemption records the grant it bought, and the grant carries the code's note and the admin who made it", async () => {
  // `gift_redemptions.grant_id` is the operator's way from "who used this
  // code" to the month it bought: the row to revoke when a code turns out to
  // have leaked. With the redemption's own id stored there instead, no grant
  // matched, no foreign key refused it, and every redemption's trail led
  // nowhere. Nothing in the worker reads the column, so only D1 shows it.
  // The note and the issuer are the other half: bound into each other's
  // columns, the member's own list showed the admin's account id as the note.
  const env = freshEnv();
  const admin = await signIn(env, "admin@example.test");
  const singer = await signIn(env, "singer@example.test");
  const code = await newCode(env, admin, { days: 30, maxRedemptions: 1, note: "spring choir" }, T + 10);
  const redeemed = await redeem(env, singer, code, T + 20);
  assert.equal(redeemed.status, 200);
  assert.equal(redeemed.body.grants.length, 1);
  const [bought] = redeemed.body.grants;
  assert.deepEqual([bought.kind, bought.note], ["gift", "spring choir"], "the member sees the code's note");

  const trail = await env.DB
    .prepare(
      `SELECT r.grant_id, g.id AS found, g.issued_by FROM gift_redemptions r
       LEFT JOIN grants g ON g.id = r.grant_id WHERE r.account_id = ?1`
    )
    .bind(singer.id)
    .first();
  assert.deepEqual({ ...trail }, { grant_id: bought.id, found: bought.id, issued_by: admin.id });
});

test("a UNIQUE failure in D1's words is still 'already redeemed', and any other D1 failure is not", async () => {
  // D1 puts its own words around SQLite's text. "D1_ERROR" is the "Prefix of
  // a specific D1 error" in Cloudflare's D1 debugging guide
  // (developers.cloudflare.com/d1/observability/debug-d1, read 13 November
  // 2026), and reports quote "D1_ERROR: no such table: users". Reports of
  // constraint failures on D1 also end the message with SQLite's result code
  // (": SQLITE_CONSTRAINT"); Cloudflare's own pages do not show that ending,
  // so the model carries both and the match must not depend on either.
  // node:sqlite's message starts with "UNIQUE constraint failed", so a test
  // against the bare fake cannot tell a match anywhere in the message from
  // one anchored at its start. Anchored, a member's second tap on "redeem"
  // in production was a 500 ("something went wrong, try again") instead of
  // "you already redeemed this code", and trying again failed the same way
  // for ever.
  const env = freshEnv();
  const admin = await signIn(env, "admin@example.test");
  const singer = await signIn(env, "singer@example.test");
  const friend = await signIn(env, "friend@example.test");
  const code = await newCode(env, admin, { days: 30, maxRedemptions: 3 }, T + 10);
  assert.equal((await redeem(env, singer, code, T + 20)).status, 200);

  const messages = [];
  const inD1Words = onWrite(env.DB, async (sqls, go) => {
    try {
      return await go();
    } catch (error) {
      messages.push(`D1_ERROR: ${error.message}: SQLITE_CONSTRAINT`);
      throw new Error(messages[messages.length - 1]);
    }
  });
  const again = await redeem({ ...env, DB: inD1Words }, singer, code, T + 30);
  assert.match(
    String(messages[0]),
    /^D1_ERROR: UNIQUE constraint failed: gift_redemptions.*: SQLITE_CONSTRAINT$/,
    "control: the batch failed on the index, in D1's words"
  );
  assert.deepEqual([again.status, again.body], [409, { ok: false, reason: "already_redeemed" }]);

  // Control: the match is on the constraint, not on any error. A dropped
  // connection is thrown (a 500 worth retrying), and the code still works
  // for that person a moment later.
  const lost = await redeem({ ...env, DB: refusing(env.DB, /INSERT INTO gift_redemptions/) }, friend, code, T + 40);
  assert.equal(lost.status, 500);
  assert.match(String(lost.thrown && lost.thrown.message), /Network connection lost/);
  assert.equal((await redeem(env, friend, code, T + 50)).status, 200);
});

// ------------------------------------------------------------------ grants

test("an admin's note on a grant is cut to 200 characters once, and every view shows those 200 in the note", async () => {
  // `createGrant` answers with the row it built, so the POST response alone
  // could not show what D1 stored, and no test read a stored note back. What
  // each way of getting this wrong costs:
  // - with no cap, a pasted paragraph fills every admin list and the
  //   member's own;
  // - a cap at 201 shows one character more than the 200 the field promises;
  // - with the note and the issuing admin's id bound into each other's
  //   columns, every view after the first answer shows the admin's account
  //   id as the note;
  // - an answer built from the uncut note disagrees with every later view of
  //   the same grant, a second after it was made.
  const env = freshEnv();
  const admin = await signIn(env, "admin@example.test");
  const note = `${"n".repeat(199)}XYZ`; // 202 characters
  const kept = `${"n".repeat(199)}X`; // its first 200

  const created = await call(env, jsonRequest("POST", "/v1/admin/grants", { email: "tester@example.test", days: 30, kind: "comp", note }, admin.token), { now: T + 10 });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal(created.body.grant.note, kept, "the answer to the admin who made it");

  const listed = await call(env, jsonRequest("GET", "/v1/admin/grants", undefined, admin.token), { now: T + 20 });
  assert.deepEqual(listed.body.grants.map((g) => g.note), [kept], "the admin's list of every grant");
  const looked = await call(env, jsonRequest("GET", "/v1/admin/account?email=tester%40example.test", undefined, admin.token), { now: T + 20 });
  assert.deepEqual(looked.body.grants.map((g) => g.note), [kept], "the account lookup");

  const stored = await env.DB.prepare("SELECT note, issued_by FROM grants").first();
  assert.deepEqual({ ...stored }, { note: kept, issued_by: admin.id }, "and each value in its own column");
});

test("a note sent as a number is stored and answered as the same text", async () => {
  // The admin page always sends text, but the route takes any JSON, and a
  // script calling the API can send `"note": 12345`. The note is turned into
  // text once, before it is cut and bound, so the answer and every list read
  // "12345". Cut without being turned into text, the answer carried the
  // number 12345 while D1 held its own text for it ("12345.0" here, which is
  // how SQLite writes a JS number bound into a TEXT column), so the caller's
  // own record of the grant and every list after it disagreed about the note.
  const env = freshEnv();
  const admin = await signIn(env, "admin@example.test");
  const created = await call(env, jsonRequest("POST", "/v1/admin/grants", { email: "script@example.test", days: 30, kind: "comp", note: 12345 }, admin.token), { now: T + 10 });
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.strictEqual(created.body.grant.note, "12345", "the answer, as text");

  const listed = await call(env, jsonRequest("GET", "/v1/admin/grants", undefined, admin.token), { now: T + 20 });
  assert.deepEqual(listed.body.grants.map((g) => [g.id, g.note]), [[created.body.grant.id, "12345"]], "the admin's list, the same text");
});

test("a gift code's note is answered as it is stored: cut to 200 characters, and as text", async () => {
  // The same rule for gift codes, and a bug in the code before this test
  // (found by the sweep, not planted): the code was stored with its note cut
  // and made text, but the admin was answered with the note as sent. The
  // admin who made the code saw the whole pasted paragraph, or the number
  // 12345, and the list a second later showed something else for the same
  // code.
  const env = freshEnv();
  const admin = await signIn(env, "admin@example.test");
  const note = `${"n".repeat(199)}XYZ`; // 202 characters
  const kept = `${"n".repeat(199)}X`; // its first 200
  const made = await call(env, jsonRequest("POST", "/v1/admin/gift-codes", { days: 30, maxRedemptions: 1, note }, admin.token), { now: T + 10 });
  assert.equal(made.status, 200, JSON.stringify(made.body));
  assert.equal(made.body.giftCode.note, kept, "the answer to the admin who made it");
  const numeric = await call(env, jsonRequest("POST", "/v1/admin/gift-codes", { days: 30, maxRedemptions: 1, note: 12345 }, admin.token), { now: T + 11 });
  assert.strictEqual(numeric.body.giftCode.note, "12345", "a number, answered as text");

  const listed = await call(env, jsonRequest("GET", "/v1/admin/gift-codes", undefined, admin.token), { now: T + 20 });
  const notes = Object.fromEntries(listed.body.giftCodes.map((c) => [c.code, c.note]));
  assert.deepEqual(notes, { [made.body.giftCode.code]: kept, [numeric.body.giftCode.code]: "12345" }, "and the list shows the same notes");
});

test("a grant D1 refuses to store is answered as a failure, not 200", async () => {
  // The admin is told only what D1 kept. A grant whose write nobody waited
  // for was answered 200 although D1 had refused it: the admin believed the
  // tester had Pro and the tester never got it. The fake runs every write at
  // once, so the write always landed and no test could tell.
  const env = freshEnv();
  const admin = await signIn(env, "admin@example.test");
  const body = { email: "tester@example.test", days: 30 };
  const failed = await call({ ...env, DB: refusing(env.DB, /^INSERT INTO grants/) }, jsonRequest("POST", "/v1/admin/grants", body, admin.token), { now: T + 10 });
  assert.equal(failed.status, 500, JSON.stringify(failed.body));
  assert.match(String(failed.thrown && failed.thrown.message), /Network connection lost/);
  // A sanity check, not the point: the refused write never ran, so no
  // version of createGrant can leave a grant here. The status above is what
  // tells a waited-for write from one nobody waited for.
  const empty = await call(env, jsonRequest("GET", "/v1/admin/grants", undefined, admin.token), { now: T + 20 });
  assert.deepEqual(empty.body.grants, []);

  // Control: the same request with D1 answering is stored and listed.
  const stored = await call(env, jsonRequest("POST", "/v1/admin/grants", body, admin.token), { now: T + 30 });
  assert.equal(stored.status, 200);
  const listed = await call(env, jsonRequest("GET", "/v1/admin/grants", undefined, admin.token), { now: T + 40 });
  assert.deepEqual(listed.body.grants.map((g) => g.id), [stored.body.grant.id]);
});

test("two admins revoking one grant at once: the second is shown the whole grant, revoked by the first", async () => {
  // Both read the grant as live; the first UPDATE wins, and the second
  // changes no row and reads the grant again. Two planted defects broke what
  // the second admin is shown: answered ok: false, which the route turns into
  // a 404 "not found" for a grant that is right there; or the second read
  // fetched two columns, and the answer was a grant with no id, kind or
  // dates, which the admin page cannot match to the row that was tapped. The
  // race test in d1-atomicity read only `revoked_by` off that answer.
  const env = freshEnv({ ADMIN_EMAILS: "admin@example.test,boss@example.test" });
  const admin = await signIn(env, "admin@example.test");
  const boss = await signIn(env, "boss@example.test");
  const created = await call(env, jsonRequest("POST", "/v1/admin/grants", { email: "tester@example.test", days: 30, kind: "comp", note: "beta tester" }, admin.token), { now: T + 10 });
  assert.equal(created.status, 200);
  const grantId = created.body.grant.id;

  let first = null;
  const race = landsBefore(env.DB, /^UPDATE grants SET revoked_at/, async () => {
    first = await call(env, jsonRequest("POST", "/v1/admin/grants/revoke", { grantId }, boss.token), { now: T + 50 });
  });
  const second = await call({ ...env, DB: race.db }, jsonRequest("POST", "/v1/admin/grants/revoke", { grantId }, admin.token), { now: T + 100 });
  assert.equal(race.seen.ran, true, "control: the boss's revoke landed between this one's read and its write");
  assert.deepEqual([first.status, first.body.grant.revokedAt], [200, T + 50], "control: and it was the boss's that took");

  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.deepEqual(second.body.grant, {
    id: grantId,
    kind: "comp",
    plan: "pro_monthly",
    startsAt: T + 10,
    endsAt: T + 10 + 30 * DAY,
    note: "beta tester",
    source: "admin",
    revokedAt: T + 50,
    openEnded: false,
    status: "revoked"
  });
  const stored = await env.DB.prepare("SELECT revoked_at, revoked_by FROM grants WHERE id = ?1").bind(grantId).first();
  assert.deepEqual({ ...stored }, { revoked_at: T + 50, revoked_by: boss.id });
});

// ------------------------------------------------------------------- trial

test("two trials started at once leave the account's claim time at the trial that was granted", async () => {
  // The claim on the account's one trial is written only while it is
  // unclaimed. Without that guard the request that lost the race still wrote
  // its own clock over the winner's: the account's claim time and its
  // updated_at moved to the loser's clock (backwards, when the loser's clock
  // was behind the winner's) and no longer matched the trial grant's
  // starts_at, so an operator who asks D1 when the account used its trial
  // gets the wrong time. Members see no difference: one trial, and the loser
  // is told "trial_used". Only the database shows it.
  const env = freshEnv();
  const singer = await signIn(env, "singer@example.test");
  let winner = null;
  const race = landsBefore(env.DB, /UPDATE accounts SET trial_used_at/, async () => {
    winner = await call(env, jsonRequest("POST", "/v1/me/trial", {}, singer.token), { now: T + 50 });
  });
  const loser = await call({ ...env, DB: race.db }, jsonRequest("POST", "/v1/me/trial", {}, singer.token), { now: T + 100 });
  assert.equal(race.seen.ran, true, "control: the other request landed between this one's read and its write");
  assert.equal(winner.status, 200, "control: and it took the trial");
  assert.deepEqual([loser.status, loser.body], [409, { ok: false, reason: "trial_used" }]);

  const row = await env.DB
    .prepare(
      `SELECT a.trial_used_at, a.updated_at, g.starts_at FROM accounts a
       JOIN grants g ON g.account_id = a.id AND g.kind = 'trial' WHERE a.id = ?1`
    )
    .bind(singer.id)
    .first();
  assert.deepEqual({ ...row }, { trial_used_at: T + 50, updated_at: T + 50, starts_at: T + 50 });
});
