/**
 * What each thing a learner does costs, against the ceilings that refuse.
 *
 * Cloudflare's free plans do not degrade, they refuse, and the two that matter
 * here are not the ones anybody watches. Read on 3 November 2026:
 *
 *   - **Workers KV: 1,000 writes a day**, 1,000 deletes, 1,000 lists, 100,000
 *     reads, 1 GB stored. Past a limit, "further operations of that type will
 *     fail with an error", and the day resets at 00:00 UTC
 *     (developers.cloudflare.com/kv/platform/pricing).
 *   - **D1: 100,000 rows written and 5,000,000 rows read a day**, 5 GB. Past
 *     either, "D1 API will return errors to your client indicating that your
 *     daily limits have been exceeded" until 00:00 UTC
 *     (developers.cloudflare.com/d1/platform/pricing). A row written counts
 *     twice when an index covers the column, and a row read counts every row
 *     scanned, not every row returned.
 *   - **Workers: 100,000 requests a day** and 10 ms CPU per request.
 *
 * KV is the tight one, and it is tight around the thing that must not fail. A
 * new paid subscriber costs ten or eleven KV writes and a renewal five or six,
 * so the free plan buys about ninety new subscribers in a day. What happens at
 * the ninety-first is not a slow page: `kv.put` throws, the webhook answers 500,
 * and whether the sale survives depends on how patient the provider is. Mercado
 * Pago retries every fifteen minutes until it gets an answer and Stripe for up
 * to three days, so both come back after midnight UTC. Creem retries at 30 s,
 * 1 min, 5 min and 1 hour — so on the international rail the purchase is simply
 * lost. `docs/43-WHEN-IT-BREAKS.md` has the whole of that reasoning and what to
 * do about it; this file is the half that can be measured, so that it stays
 * measured.
 *
 * The budgets below are the numbers this tree actually spends, each a little
 * above what was measured so that an ordinary change does not fail the build and
 * a doubling does. They are a ratchet, not a target: when one of them has to go
 * up, the daily ceiling it implies goes down, and that belongs in the commit
 * message rather than in a quiet edit.
 *
 * What this cannot measure: D1's own row counts. `rows_read` depends on the
 * query plan and `rows_written` on the indexes, and only real D1 reports them.
 * Statements are the proxy here, and a statement that scans is the thing a
 * statement count hides — so the last test asks SQLite for the query plan of
 * every statement a hot path runs and fails on a SCAN of a table that grows with
 * use. VG-60.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { handleRequest } from "../src/index.js";
import { resetSchemaMemo } from "../src/db.js";
import { createAccountEnv, createFakeKv, createTestEnv } from "./fixtures.mjs";

const DAY = 86400;
const T = Math.floor(Date.now() / 1000);
const hmacHex = (secret, message) => createHmac("sha256", secret).update(message).digest("hex");
const iso = (days) => new Date((T + days * DAY) * 1000).toISOString();
const msAt = (days) => (T + Math.round(days * DAY)) * 1000;

/**
 * Wrap an env's bindings so every KV operation and D1 statement is counted.
 *
 * Also records the query plan of each statement, because a statement count is
 * blind to the cost that grows: one `SELECT` that scans a million rows is one
 * statement and a million rows read.
 * @param {Object} env Env bindings to instrument in place.
 * @returns {{kvWrites: number, kvReads: number, statements: number, scans: string[], reset: Function}} The meter.
 */
function meter(env) {
  const m = {
    kvWrites: 0,
    kvReads: 0,
    statements: 0,
    scans: [],
    reset() {
      this.kvWrites = 0;
      this.kvReads = 0;
      this.statements = 0;
      this.scans = [];
    }
  };
  if (env.ENTITLEMENTS) {
    const kv = env.ENTITLEMENTS;
    const put = kv.put.bind(kv);
    const get = kv.get.bind(kv);
    kv.put = async (...args) => {
      m.kvWrites += 1;
      return put(...args);
    };
    kv.get = async (...args) => {
      m.kvReads += 1;
      return get(...args);
    };
  }
  if (env.DB) {
    const db = env.DB;
    const prepare = db.prepare.bind(db);
    db.prepare = (sql) => {
      m.statements += 1;
      try {
        // `?1` style parameters are D1's; SQLite's planner takes a bare `?`.
        const plan = db.db.prepare(`EXPLAIN QUERY PLAN ${sql.replace(/\?\d+/g, "?")}`).all();
        for (const row of plan) {
          const detail = String((row && row.detail) || "");
          const hit = /^SCAN (\S+)/.exec(detail);
          // A scan of CONSTANT or of a subquery is a scan of nothing that grows;
          // only a named table matters here.
          if (hit && hit[1] !== "CONSTANT" && !hit[1].startsWith("(")) {
            m.scans.push(`${detail} :: ${sql.replace(/\s+/g, " ").trim().slice(0, 80)}`);
          }
        }
      } catch {
        // DDL and a few pragmas have no plan; nothing to record.
      }
      return prepare(sql);
    };
  }
  return m;
}

// ---------------------------------------------------------------- the paid rails

const checkoutSession = {
  id: "cs", mode: "subscription", customer: "cus", subscription: "sub",
  payment_intent: null, payment_status: "paid"
};
const line = (startDays, endDays) => ({ period: { start: T + startDays * DAY, end: T + endDays * DAY } });
const invoice = (id, lines) => ({
  id, customer: "cus", subscription: "sub", payment_intent: `pi_${id}`, lines: { data: lines }
});

function stripeEvent(env, id, type, atDays, object) {
  const raw = JSON.stringify({ id, type, created: T + Math.round(atDays * DAY), data: { object } });
  const ts = Math.floor(Date.now() / 1000);
  return handleRequest(new Request("https://w.test/v1/webhooks/stripe", {
    method: "POST",
    body: raw,
    headers: { "Stripe-Signature": `t=${ts},v1=${hmacHex(env.STRIPE_WEBHOOK_SECRET, `${ts}.${raw}`)}` }
  }), env);
}
function creemEvent(env, id, eventType, atDays, object) {
  const raw = JSON.stringify({ id, eventType, created_at: msAt(atDays), object });
  return handleRequest(new Request("https://w.test/v1/webhooks/creem", {
    method: "POST", body: raw, headers: { "creem-signature": hmacHex(env.CREEM_WEBHOOK_SECRET, raw) }
  }), env);
}
const creemSub = (status, startDays, endDays, over) => ({
  id: "sub_1", object: "subscription", status, collection_method: "charge_automatically",
  product: { id: "prod_monthly", billing_period: "every-month" }, customer: { id: "cust_1" },
  items: [{ id: "si", product_id: "prod_monthly", units: 1 }],
  current_period_start_date: iso(startDays), current_period_end_date: iso(endDays), canceled_at: null,
  ...(over || {})
});
const creemPaid = (tran, startDays, endDays, chargedDays) => creemSub("active", startDays, endDays, {
  last_transaction_id: tran,
  last_transaction: { id: tran, amount: 1000, amount_paid: 1000, status: "paid" },
  last_transaction_date: iso(chargedDays)
});
const creemCheckout = {
  id: "ch_1", object: "checkout", status: "completed", mode: "prod",
  order: { id: "ord_1", status: "paid", transaction: "tran_1" },
  product: { id: "prod_monthly", billing_period: "every-month" },
  customer: { id: "cust_1" }, subscription: { id: "sub_1" }, metadata: {}
};

/** KV writes a new paid subscriber may cost, on either rail. */
const NEW_SUBSCRIBER_KV_WRITES = 12;
/** KV writes a renewal may cost. */
const RENEWAL_KV_WRITES = 7;

test("a new Stripe subscriber, from checkout to a minted licence, stays inside its KV write budget", async () => {
  const env = createTestEnv({ ENTITLEMENTS: createFakeKv() });
  const m = meter(env);
  await stripeEvent(env, "e1", "checkout.session.completed", 0, checkoutSession);
  await stripeEvent(env, "e2", "invoice.paid", 0, invoice("in1", [line(0, 31)]));
  const claim = await handleRequest(new Request("https://w.test/v1/claim", {
    method: "POST", body: JSON.stringify({ provider: "stripe", sessionId: "cs" }),
    headers: { "content-type": "application/json" }
  }), env);
  assert.equal(claim.status, 200, "the flow has to succeed or the count means nothing");
  assert.ok(
    m.kvWrites <= NEW_SUBSCRIBER_KV_WRITES,
    `a new Stripe subscriber cost ${m.kvWrites} KV writes, budget ${NEW_SUBSCRIBER_KV_WRITES}; `
    + `at ${m.kvWrites} the free plan's 1,000 a day is ${Math.floor(1000 / Math.max(1, m.kvWrites))} subscribers`
  );
});

test("a Stripe renewal stays inside its KV write budget", async () => {
  const env = createTestEnv({ ENTITLEMENTS: createFakeKv() });
  await stripeEvent(env, "e1", "checkout.session.completed", 0, checkoutSession);
  await stripeEvent(env, "e2", "invoice.paid", 0, invoice("in1", [line(0, 31)]));
  const m = meter(env);
  await stripeEvent(env, "e3", "invoice.paid", 31, invoice("in2", [line(31, 62)]));
  assert.ok(m.kvWrites <= RENEWAL_KV_WRITES, `a Stripe renewal cost ${m.kvWrites} KV writes, budget ${RENEWAL_KV_WRITES}`);
});

test("a new Creem subscriber stays inside its KV write budget", async () => {
  const env = createTestEnv({ ENTITLEMENTS: createFakeKv() });
  const m = meter(env);
  await creemEvent(env, "c1", "checkout.completed", 0, creemCheckout);
  await creemEvent(env, "c2", "subscription.paid", 0, creemPaid("tran_1", 0, 31, 0));
  assert.ok(
    m.kvWrites <= NEW_SUBSCRIBER_KV_WRITES,
    `a new Creem subscriber cost ${m.kvWrites} KV writes, budget ${NEW_SUBSCRIBER_KV_WRITES}. `
    + "Creem retries a failed webhook for about an hour, so a day that runs out of KV writes loses the sale rather than deferring it"
  );
});

test("a Creem renewal stays inside its KV write budget", async () => {
  const env = createTestEnv({ ENTITLEMENTS: createFakeKv() });
  await creemEvent(env, "c1", "checkout.completed", 0, creemCheckout);
  await creemEvent(env, "c2", "subscription.paid", 0, creemPaid("tran_1", 0, 31, 0));
  const m = meter(env);
  await creemEvent(env, "c3", "subscription.paid", 31, creemPaid("tran_2", 31, 62, 31));
  assert.ok(m.kvWrites <= RENEWAL_KV_WRITES, `a Creem renewal cost ${m.kvWrites} KV writes, budget ${RENEWAL_KV_WRITES}`);
});

test("minting a licence from a claim writes nothing to KV, because the record is already there", async () => {
  const env = createTestEnv({ ENTITLEMENTS: createFakeKv() });
  await stripeEvent(env, "e1", "checkout.session.completed", 0, checkoutSession);
  await stripeEvent(env, "e2", "invoice.paid", 0, invoice("in1", [line(0, 31)]));
  const m = meter(env);
  for (let i = 0; i < 5; i += 1) {
    await handleRequest(new Request("https://w.test/v1/claim", {
      method: "POST", body: JSON.stringify({ provider: "stripe", sessionId: "cs" }),
      headers: { "content-type": "application/json" }
    }), env);
  }
  assert.equal(m.kvWrites, 0, "a browser re-checking its licence must not spend the day's write budget");
});

// ------------------------------------------------------- the account layer, on D1

const BASE = "https://entitlements.test";
const NOW = 1800000000;
function req(method, path, options) {
  const opts = options || {};
  return new Request(`${BASE}${path}`, {
    method,
    headers: {
      ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers || {})
    },
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) })
  });
}
async function call(request, env, deps) {
  const response = await handleRequest(request, env, deps);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

/**
 * Sign in by email, returning the session token and the meter, warmed so that
 * `ensureSchema`'s thirty-odd statements are not counted against a request.
 * @returns {Promise<{env: Object, meter: Object, token: string}>} The signed-in fixture.
 */
async function signedIn() {
  resetSchemaMemo();
  const env = createAccountEnv();
  let sentCode = null;
  const fetchImpl = async (url, init) => {
    const payload = JSON.parse(init.body);
    const match = /\b(\d{6})\b/.exec(payload.text || "");
    sentCode = match && match[1];
    return { ok: true, status: 200 };
  };
  // One throwaway sign-in start creates the schema, which is a one-off per
  // isolate and would otherwise be charged to whichever request came first.
  await call(req("POST", "/v1/auth/email/start", { body: { email: "warm@example.test" } }), env, { now: NOW, fetchImpl });
  const m = meter(env);
  await call(req("POST", "/v1/auth/email/start", { body: { email: "a@example.test" } }), env, { now: NOW, fetchImpl });
  const verified = await call(
    req("POST", "/v1/auth/email/verify", { body: { email: "a@example.test", code: sentCode } }),
    env, { now: NOW + 1 }
  );
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  return { env, meter: m, token: verified.body.sessionToken };
}

test("signing in by email costs a bounded number of statements, schema aside", async () => {
  const { meter: m } = await signedIn();
  // Measured on 3 November 2026: 7 for the code, 12 for the verification.
  assert.ok(m.statements <= 24, `a whole email sign-in ran ${m.statements} statements, budget 24`);
});

test("a day of practice syncing is a handful of statements and no KV at all", async () => {
  const { env, meter: m, token } = await signedIn();
  m.reset();
  const first = await call(req("PUT", "/v1/me/progress", {
    token, body: { profileId: "default", doc: { a: 1 }, baseRev: 0 }
  }), env, { now: NOW + 2 });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const firstWrite = m.statements;
  m.reset();
  // Twelve pushes is a heavy evening: the browser waits 8 s of quiet before each.
  for (let i = 0; i < 12; i += 1) {
    const r = await call(req("PUT", "/v1/me/progress", {
      token, body: { profileId: "default", doc: { a: i + 2 }, baseRev: i + 1 }
    }), env, { now: NOW + 3 + i });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  assert.ok(firstWrite <= 8, `a first write ran ${firstWrite} statements, budget 8`);
  assert.ok(m.statements <= 12 * 9, `twelve pushes ran ${m.statements} statements, budget ${12 * 9}`);
  assert.equal(m.kvWrites, 0, "saved progress lives in D1; it must not touch the KV write budget");
});

test("a batch of 25 usage events is one statement, which is the whole point of batching", async () => {
  const { env, meter: m } = await signedIn();
  m.reset();
  const sent = await call(req("POST", "/v1/events", {
    headers: { Origin: "https://example.test" },
    body: {
      cid: "c".repeat(22),
      events: Array.from({ length: 25 }, () => ({ name: "app_open", day: "2026-11-03", tz: "America/Lima", props: {} }))
    }
  }), env, { now: NOW + 20 });
  assert.equal(sent.status, 202, JSON.stringify(sent.body));
  assert.ok(m.statements <= 3, `25 events ran ${m.statements} statements, budget 3`);
});

test("nothing a learner can do makes the database scan a table that grows with use", async () => {
  const { env, meter: m, token } = await signedIn();
  m.reset();
  await call(req("GET", "/v1/me", { token }), env, { now: NOW + 2 });
  await call(req("POST", "/v1/me/trial", { token }), env, { now: NOW + 3 });
  await call(req("PUT", "/v1/me/progress", { token, body: { profileId: "default", doc: { a: 1 }, baseRev: 0 } }), env, { now: NOW + 4 });
  await call(req("GET", "/v1/me/progress?profileId=default", { token }), env, { now: NOW + 5 });
  await call(req("POST", "/v1/events", {
    headers: { Origin: "https://example.test" },
    body: { cid: "c".repeat(22), events: [{ name: "app_open", day: "2026-11-03", tz: "America/Lima", props: {} }] }
  }), env, { now: NOW + 6 });
  // D1 charges every row a query scans, not every row it returns, so a scan of
  // `events` or `progress` is a bill that grows with the product's success.
  assert.deepEqual(m.scans, [], `these statements scan a whole table:\n${m.scans.join("\n")}`);
});

test("/v1/health answers without touching either binding, and ?probe=1 reads one of each", async () => {
  const { env, meter: m } = await signedIn();
  m.reset();
  const plain = await call(req("GET", "/v1/health"), env, { now: NOW + 30 });
  assert.equal(plain.status, 200);
  assert.equal(m.statements, 0, "the plain health route must stay free to call");
  assert.equal(m.kvReads, 0);
  assert.equal(plain.body.probe, undefined);

  m.reset();
  const probed = await call(req("GET", "/v1/health?probe=1"), env, { now: NOW + 31 });
  assert.equal(probed.status, 200);
  assert.deepEqual(probed.body.probe, { db: "ok", kv: "ok" });
  assert.equal(m.statements, 1, "one row read, so a probe a minute is 1,440 a day of D1's 5,000,000");
  assert.equal(m.kvReads, 1, "and one of KV's 100,000");
});

test("?probe=1 answers 503 when a binding refuses, which is the whole reason it exists", async () => {
  const env = createAccountEnv();
  await call(req("GET", "/v1/health?probe=1"), env, { now: NOW });
  const broken = {
    ...env,
    DB: { prepare() { throw new Error("D1_ERROR: daily limit exceeded"); } }
  };
  const probed = await call(req("GET", "/v1/health?probe=1"), broken, { now: NOW + 1 });
  assert.equal(probed.status, 503, "a worker whose database refuses every query is not healthy");
  assert.equal(probed.body.ok, false);
  assert.equal(probed.body.probe.db, "error");
  assert.equal(probed.body.accountsConfigured, true, "configured and working are different questions");
  assert.ok(
    !JSON.stringify(probed.body).includes("daily limit"),
    "this route is public; a database error message is not ours to publish"
  );
});

test("the admin funnel reads the whole events table, which is a known cost with a known threshold", async () => {
  // Not a defect, and not left silent either. The funnel groups by browser, and
  // SQLite serves that from the covering index on (cid, name, received_at) by
  // scanning it, which is the cheapest plan in I/O and the most expensive one in
  // D1's accounting: D1 charges every row a query scans. So one press of the
  // funnel reads the whole table, whatever window it was asked for.
  //
  // Measured attempts to avoid it, 3 November 2026: an index on
  // (received_at, cid, name) and one on (cid, received_at, name) both leave the
  // plan a scan, because using a range index would cost a sort for the GROUP BY
  // and the planner prefers the scan. Forcing it with INDEXED BY would read only
  // the window and would also break hard the day that index is renamed.
  //
  // So it is recorded rather than contorted. D1's free plan allows 5,000,000 rows
  // read a day, events are kept 180 days, and the number worth knowing is that
  // the table has to reach about half a million rows before one press of the
  // funnel costs a tenth of the day's reads. At this site's traffic that is years
  // away, and `docs/43-WHEN-IT-BREAKS.md` says what to do when it is not.
  //
  // What this test is for: one known scan, named. A second one is somebody's new
  // query, and it should be looked at rather than discovered on a bill.
  const { env, meter: m } = await signedIn();
  let sentCode = null;
  const fetchImpl = async (url, init) => {
    const match = /\b(\d{6})\b/.exec(JSON.parse(init.body).text || "");
    sentCode = match && match[1];
    return { ok: true, status: 200 };
  };
  await call(req("POST", "/v1/auth/email/start", { body: { email: "admin@example.test" } }), env, { now: NOW, fetchImpl });
  const admin = await call(
    req("POST", "/v1/auth/email/verify", { body: { email: "admin@example.test", code: sentCode } }),
    env, { now: NOW + 1 }
  );
  assert.equal(admin.status, 200, JSON.stringify(admin.body));

  m.reset();
  const funnel = await call(req("GET", "/v1/admin/funnel?days=28", { token: admin.body.sessionToken }), env, { now: NOW + 2 });
  assert.equal(funnel.status, 200, JSON.stringify(funnel.body));
  assert.equal(
    m.scans.length, 1,
    `the admin funnel now scans ${m.scans.length} tables, not the one known scan:\n${m.scans.join("\n")}`
  );
  assert.match(m.scans[0], /SCAN events/, m.scans[0]);
});
