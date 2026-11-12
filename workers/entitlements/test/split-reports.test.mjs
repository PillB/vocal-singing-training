/**
 * Killers for the report route's split (handleSubmitReport, sanitizeReport and
 * updateReport went under the complexity ceiling as eight small functions).
 *
 * Twenty mutants were planted in the split code and fourteen died on the
 * existing suite. These six tests are for the six that lived, each of which is
 * a real promise the route makes and nothing checked:
 *
 *   R3  a body whose Content-Length is over the cap is refused before it is read
 *   R8  a signed-in reporter has a daily share across every address they use
 *   R14 the environment blob is stored through its closed list, also via the route
 *   R15 updateReport leaves the status alone when handed one it does not know
 *   R18 a note added later does not wipe who handled the report
 *   R20 the reporter's steps to reproduce are stored and come back
 *
 * Each test names the mutant it kills. They drive the real router, except R15
 * and R18, which pin `updateReport`'s own contract: the admin route validates
 * the status and always passes an admin id first, so those two guards are the
 * function's defence for any other caller, and only a direct call reaches them.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "../src/index.js";
import { ensureSchema, resetSchemaMemo } from "../src/db.js";
import { REPORT_LIMITS, insertReport, sanitizeReport, updateReport } from "../src/reports.js";
import { createAccountEnv, TEST_ORIGIN } from "./fixtures.mjs";

const BASE = "https://entitlements.test";
const NOW = 1800000000;

function req(method, path, opts = {}) {
  const headers = {
    ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
    ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    ...(opts.origin === undefined ? {} : { Origin: opts.origin }),
    ...(opts.headers || {})
  };
  return new Request(`${BASE}${path}`, {
    method,
    headers,
    ...(opts.body === undefined ? {} : { body: typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body) })
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
  return { status: response.status, body, headers: response.headers };
}

function freshEnv() {
  resetSchemaMemo();
  return createAccountEnv();
}

function submit(env, body, { now = NOW, token, ip = "203.0.113.7", headers = {} } = {}) {
  return call(
    req("POST", "/v1/reports", { body, origin: TEST_ORIGIN, token, headers: { "cf-connecting-ip": ip, ...headers } }),
    env,
    { now }
  );
}

async function signIn(env, email, now) {
  let sentCode = null;
  const fetchImpl = async (url, init) => {
    const match = /\b(\d{6})\b/.exec(JSON.parse(init.body).text || "");
    sentCode = match && match[1];
    return { ok: true, status: 200 };
  };
  await call(req("POST", "/v1/auth/email/start", { body: { email } }), env, { now, fetchImpl });
  const verified = await call(req("POST", "/v1/auth/email/verify", { body: { email, code: sentCode } }), env, { now: now + 1 });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  return verified.body.sessionToken;
}

test("R3 a Content-Length over the cap is refused before the body is read, even when the body itself is small", async () => {
  const env = freshEnv();
  const control = await submit(env, { kind: "bug", summary: "el piano no suena" });
  assert.equal(control.status, 200, `control: an honest small report is taken: ${JSON.stringify(control.body)}`);
  const lying = await submit(env, { kind: "bug", summary: "el piano no suena" }, { ip: "203.0.113.8", headers: { "content-length": "99999" } });
  assert.equal(lying.status, 413, JSON.stringify(lying.body));
  assert.equal(lying.body.reason, "body_too_large");
});

test("R8 a signed-in reporter's daily share holds across addresses, and a signed-out one on fresh addresses is not held to it", async () => {
  const env = freshEnv();
  const token = await signIn(env, "cantante@example.test", NOW);
  const share = REPORT_LIMITS.perAccount[0];
  // A fresh address per report keeps every per-address gate open, so the
  // account's own share is the only thing that can refuse.
  for (let i = 0; i < share; i += 1) {
    const ok = await submit(env, { kind: "idea", summary: `idea ${i}` }, { token, ip: `198.51.100.${i + 1}`, now: NOW + 10 + i });
    assert.equal(ok.status, 200, `report ${i + 1} of ${share}: ${JSON.stringify(ok.body)}`);
  }
  const over = await submit(env, { kind: "idea", summary: "una más" }, { token, ip: "198.51.100.250", now: NOW + 100 });
  assert.equal(over.status, 429, JSON.stringify(over.body));
  assert.equal(over.body.reason, "rate_limited");
  assert.ok(Number(over.headers.get("retry-after")) > 0);
  // Control: the same report signed out, from a fresh address, still lands.
  const anon = await submit(env, { kind: "idea", summary: "una más" }, { ip: "198.51.100.251", now: NOW + 101 });
  assert.equal(anon.status, 200, JSON.stringify(anon.body));
});

test("R14 + R20 the steps and the environment a report carries are stored, and the environment only through its closed list", async () => {
  const env = freshEnv();
  const admin = await signIn(env, "admin@example.test", NOW);
  const steps = "1. abrir la escala\n2. tocar el piano";
  const posted = await submit(env, {
    kind: "bug",
    summary: "el piano no suena",
    steps,
    environment: { ua: "Safari 18", dpr: 2, mic: true, cookie: "secret", screen: { w: 390 } }
  });
  assert.equal(posted.status, 200, JSON.stringify(posted.body));
  assert.equal(posted.body.report.steps, steps);
  const listed = await call(req("GET", "/v1/admin/reports", { token: admin }), env, { now: NOW + 10 });
  const mine = listed.body.reports.find((r) => r.reference === posted.body.reference);
  assert.equal(mine.steps, steps, "steps to reproduce must reach the triage view");
  assert.deepEqual(mine.environment, { ua: "Safari 18", dpr: 2, mic: true });
});

async function storedReport() {
  resetSchemaMemo();
  const env = createAccountEnv();
  await ensureSchema(env.DB);
  const parsed = sanitizeReport({ kind: "bug", summary: "el metrónomo se adelanta" }, { at: NOW });
  await insertReport(env.DB, parsed.report);
  return { db: env.DB, id: parsed.report.id };
}

test("R15 updateReport keeps the stored status when handed one it does not know, and still applies the note", async () => {
  const { db, id } = await storedReport();
  const moved = await updateReport(db, id, { status: "triaged", by: "acct_admin" }, NOW + 10);
  assert.equal(moved.report.status, "triaged", "control: a known status is applied");
  const odd = await updateReport(db, id, { status: "maybe", note: "mirar en iOS", by: "acct_admin" }, NOW + 20);
  assert.equal(odd.ok, true);
  assert.equal(odd.report.status, "triaged");
  assert.equal(odd.report.adminNote, "mirar en iOS");
  const row = await db.prepare("SELECT status FROM reports WHERE id = ?1").bind(id).first();
  assert.equal(row.status, "triaged");
});

test("R18 a later change made without a handler keeps who handled the report", async () => {
  const { db, id } = await storedReport();
  await updateReport(db, id, { status: "triaged", by: "acct_admin" }, NOW + 10);
  const noted = await updateReport(db, id, { note: "duplicado de otro" }, NOW + 20);
  assert.equal(noted.report.handledBy, "acct_admin");
  const row = await db.prepare("SELECT handled_by FROM reports WHERE id = ?1").bind(id).first();
  assert.equal(row.handled_by, "acct_admin");
  const reassigned = await updateReport(db, id, { note: "lo veo yo", by: "acct_other" }, NOW + 30);
  assert.equal(reassigned.report.handledBy, "acct_other", "control: a named handler replaces the old one");
});
