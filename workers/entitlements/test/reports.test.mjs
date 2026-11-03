/**
 * Bug reports and ideas, driven through the worker's real router.
 *
 * The things that must hold: anybody can report without an account, what they
 * typed comes back unmangled, a card number never reaches the database, no
 * amount of posting can spend the daily write budget, and only an admin can
 * read what people wrote.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "../src/index.js";
import { resetSchemaMemo, sweepExpired } from "../src/db.js";
import {
  REPORT_LIMITS,
  clampText,
  isReferenceShape,
  mintReference,
  redactLongDigitRuns,
  sanitizeEnvironment,
  sanitizeReport
} from "../src/reports.js";
import { createAccountEnv, TEST_ORIGIN } from "./fixtures.mjs";

const BASE = "https://entitlements.test";
const NOW = 1800000000;
const DAY = 86400;

/**
 * Build a request against the worker.
 * @param {string} method HTTP method.
 * @param {string} path Path with optional query.
 * @param {{body?: unknown, token?: string, origin?: string, headers?: Object}} [options] Options.
 * @returns {Request} Request.
 */
function req(method, path, options) {
  const opts = options || {};
  const headers = {
    ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
    ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
    ...(opts.origin === undefined ? {} : { Origin: opts.origin }),
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
 * @param {Object} [deps] Router options.
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
  return createAccountEnv(overrides);
}

/**
 * Post a report from the site, as a browser does.
 * @param {Object} env Env bindings.
 * @param {Object} body Report body.
 * @param {{now?: number, token?: string, ip?: string}} [options] Options.
 * @returns {Promise<{status: number, body: Object, headers: Headers}>} Result.
 */
function submit(env, body, options) {
  const opts = options || {};
  return call(
    req("POST", "/v1/reports", {
      body,
      origin: TEST_ORIGIN,
      token: opts.token,
      headers: { "cf-connecting-ip": opts.ip || "203.0.113.7" }
    }),
    env,
    { now: opts.now === undefined ? NOW : opts.now }
  );
}

/**
 * Sign in by emailed code, returning the session token.
 * @param {Object} env Env bindings.
 * @param {string} email Address.
 * @param {number} now Unix seconds.
 * @returns {Promise<{token: string, body: Object}>} Session.
 */
async function signIn(env, email, now) {
  let sentCode = null;
  const fetchImpl = async (url, init) => {
    const payload = JSON.parse(init.body);
    const match = /\b(\d{6})\b/.exec(payload.text || "");
    sentCode = match && match[1];
    return { ok: true, status: 200 };
  };
  await call(req("POST", "/v1/auth/email/start", { body: { email } }), env, { now, fetchImpl });
  const verified = await call(req("POST", "/v1/auth/email/verify", { body: { email, code: sentCode } }), env, {
    now: now + 1
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  return { token: verified.body.sessionToken, body: verified.body };
}

test("a reference is readable out loud and recognisable as ours", () => {
  for (let i = 0; i < 200; i += 1) {
    const ref = mintReference();
    assert.match(ref, /^VS-[2-9A-HJKMNP-TV-Z]{10}$/, ref);
    assert.equal(isReferenceShape(ref), true);
    // The characters a person mishears or mistypes are not in the alphabet.
    assert.equal(/[01ILOU]/.test(ref.slice(3)), false, ref);
  }
  assert.equal(isReferenceShape("VS-0000000000"), false);
  assert.equal(isReferenceShape("VS-ABC"), false);
  assert.equal(isReferenceShape("vs-ABCDEFGHJK"), false);
  assert.equal(isReferenceShape(""), false);
  assert.equal(isReferenceShape(null), false);
});

test("a card number pasted into a report never reaches the database", async () => {
  // Every shape a person actually types one in.
  assert.equal(redactLongDigitRuns("pagué con 4111111111111111 y falló"), "pagué con [número oculto] y falló");
  assert.equal(redactLongDigitRuns("4111 1111 1111 1111"), "[número oculto]");
  assert.equal(redactLongDigitRuns("4111-1111-1111-1111"), "[número oculto]");
  // Fifteen and nineteen digits are cards too (Amex, some Maestro).
  assert.equal(redactLongDigitRuns("378282246310005"), "[número oculto]");
  assert.equal(redactLongDigitRuns("6759649826438453058"), "[número oculto]");
  // Things a report about singing legitimately contains are left alone.
  assert.equal(redactLongDigitRuns("el do4 a 261.63 Hz"), "el do4 a 261.63 Hz");
  assert.equal(redactLongDigitRuns("duró 1200 ms"), "duró 1200 ms");
  assert.equal(redactLongDigitRuns("VS-7F3KQ2MXNP"), "VS-7F3KQ2MXNP");

  const env = freshEnv();
  const posted = await submit(env, {
    kind: "bug",
    summary: "no pude pagar",
    detail: "usé la tarjeta 4111 1111 1111 1111 y se quedó cargando"
  });
  assert.equal(posted.status, 200, JSON.stringify(posted.body));
  const stored = await env.DB.prepare("SELECT detail FROM reports WHERE id = ?1").bind(posted.body.reference).first();
  assert.equal(stored.detail.includes("4111"), false);
  assert.match(stored.detail, /\[número oculto\]/);
});

test("typed text is clamped and stripped, and line breaks survive", () => {
  assert.equal(clampText("  hola  ", 40), "hola");
  // A reporter's own line breaks and tabs are information, so they survive.
  assert.equal(clampText("una\nlínea\notra", 40), "una\nlínea\notra");
  assert.equal(clampText("paso 1\tabrir", 40), "paso 1\tabrir");
  assert.equal(clampText("x".repeat(500), 10), "x".repeat(10));
  assert.equal(clampText(undefined, 10), "");
  assert.equal(clampText(42, 10), "");
  // A null byte or an escape sequence cannot reach storage.
  assert.equal(clampText("a\u0000b\u001bc", 40), "a b c");
});

test("the environment blob keeps known keys only, and has a ceiling", () => {
  const clean = sanitizeEnvironment({
    ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)",
    viewport: "390x844",
    dpr: 3,
    signedIn: false,
    cookies: "session=secret",
    __proto__: { polluted: true },
    nested: { deep: "no" },
    list: [1, 2, 3]
  });
  assert.deepEqual(Object.keys(clean).sort(), ["dpr", "signedIn", "ua", "viewport"]);
  assert.equal(clean.cookies, undefined);
  assert.equal(clean.nested, undefined);
  assert.equal(JSON.stringify(sanitizeEnvironment(null)), "{}");
  assert.equal(JSON.stringify(sanitizeEnvironment("nope")), "{}");
  assert.equal(JSON.stringify(sanitizeEnvironment([1, 2])), "{}");
  // A client that sends long values gets them cut, and the whole blob capped.
  const big = sanitizeEnvironment({
    ua: "u".repeat(400),
    viewport: "v".repeat(400),
    screen: "s".repeat(400),
    platform: "p".repeat(400),
    lang: "l".repeat(400)
  });
  assert.ok(JSON.stringify(big).length <= 600, JSON.stringify(big).length);
  assert.ok(big.ua.length <= 120);
});

test("a report needs a kind and some words, and nothing else", () => {
  assert.equal(sanitizeReport({ kind: "rant", summary: "x" }, { at: NOW }).reason, "bad_kind");
  assert.equal(sanitizeReport({ summary: "x" }, { at: NOW }).reason, "bad_kind");
  assert.equal(sanitizeReport({ kind: "bug", summary: "   " }, { at: NOW }).reason, "empty");
  assert.equal(sanitizeReport(null, { at: NOW }).reason, "bad_request");
  assert.equal(sanitizeReport([], { at: NOW }).reason, "bad_request");

  // An unknown area is "other" rather than a refusal.
  const odd = sanitizeReport({ kind: "idea", summary: "más ejercicios", area: "kitchen" }, { at: NOW });
  assert.equal(odd.ok, true);
  assert.equal(odd.report.area, "other");
  // Severity belongs to bugs; an idea carries none even when one is sent.
  assert.equal(sanitizeReport({ kind: "idea", summary: "x", severity: "blocks" }, { at: NOW }).report.severity, null);
  assert.equal(sanitizeReport({ kind: "bug", summary: "x", severity: "blocks" }, { at: NOW }).report.severity, "blocks");
  assert.equal(sanitizeReport({ kind: "bug", summary: "x", severity: "awful" }, { at: NOW }).report.severity, null);

  // Somebody who only wrote the long field still gets a readable list entry.
  const long = sanitizeReport({ kind: "bug", detail: "el piano no suena\nni en Chrome" }, { at: NOW });
  assert.equal(long.report.summary, "el piano no suena");
  // A contact address is normalized; junk in that field is simply not kept.
  assert.equal(sanitizeReport({ kind: "bug", summary: "x", contact: " Ana@Example.TEST " }, { at: NOW }).report.contact, "ana@example.test");
  assert.equal(sanitizeReport({ kind: "bug", summary: "x", contact: "not an address" }, { at: NOW }).report.contact, null);
});

test("a signed-out visitor can report, and gets a reference back", async () => {
  const env = freshEnv();
  const posted = await submit(env, {
    kind: "bug",
    area: "audio",
    severity: "blocks",
    summary: "el micrófono no se enciende",
    detail: "toco Empezar y no pasa nada",
    steps: "1. abrir el estudio\n2. tocar Empezar",
    page: "/#practice",
    build: "20261102a",
    locale: "es",
    environment: { ua: "Mozilla/5.0 (iPhone)", viewport: "390x844" }
  });
  assert.equal(posted.status, 200, JSON.stringify(posted.body));
  assert.equal(isReferenceShape(posted.body.reference), true);
  assert.equal(posted.body.report.status, "new");
  assert.equal(posted.body.report.summary, "el micrófono no se enciende");
  // Nothing in the answer tells the reporter anything about us.
  assert.equal(posted.body.report.adminNote, undefined);
  assert.equal(posted.body.report.contact, undefined);

  const row = await env.DB.prepare("SELECT * FROM reports WHERE id = ?1").bind(posted.body.reference).first();
  assert.equal(row.kind, "bug");
  assert.equal(row.area, "audio");
  assert.equal(row.severity, "blocks");
  assert.equal(row.account_id, null);
  assert.equal(row.status, "new");
  assert.equal(row.handled_at, null);
  assert.match(row.env, /iPhone/);
});

test("a report from a signed-in person belongs to them, and they can see it", async () => {
  const env = freshEnv();
  const member = await signIn(env, "cantante@example.test", NOW);
  const posted = await submit(env, { kind: "idea", summary: "quiero más escalas" }, { token: member.token, now: NOW + 10 });
  assert.equal(posted.status, 200, JSON.stringify(posted.body));

  const mine = await call(req("GET", "/v1/reports/mine", { token: member.token }), env, { now: NOW + 20 });
  assert.equal(mine.status, 200);
  assert.equal(mine.body.reports.length, 1);
  assert.equal(mine.body.reports[0].reference, posted.body.reference);
  assert.equal(mine.body.reports[0].summary, "quiero más escalas");
  // Our own notes are not the reporter's business.
  assert.equal(mine.body.reports[0].adminNote, undefined);
  assert.equal(mine.body.reports[0].contact, undefined);

  // Somebody else's reports are not in this list, and no session means no list.
  const other = await signIn(env, "otro@example.test", NOW + 30);
  const theirs = await call(req("GET", "/v1/reports/mine", { token: other.token }), env, { now: NOW + 40 });
  assert.equal(theirs.body.reports.length, 0);
  const anonymous = await call(req("GET", "/v1/reports/mine"), env, { now: NOW + 50 });
  assert.equal(anonymous.status, 401);
});

test("the report route refuses another site's page, an oversized body and a wrong method", async () => {
  const env = freshEnv();
  const foreign = await call(
    req("POST", "/v1/reports", { body: { kind: "bug", summary: "x" }, origin: "https://evil.test" }),
    env,
    { now: NOW }
  );
  assert.equal(foreign.status, 403);
  assert.equal(foreign.body.reason, "origin_not_allowed");

  // No Origin at all is not the site either: a browser always sends one here.
  const headless = await call(req("POST", "/v1/reports", { body: { kind: "bug", summary: "x" } }), env, { now: NOW });
  assert.equal(headless.status, 403);

  const huge = await call(
    req("POST", "/v1/reports", {
      body: { kind: "bug", summary: "x", detail: "y".repeat(40000) },
      origin: TEST_ORIGIN
    }),
    env,
    { now: NOW }
  );
  assert.equal(huge.status, 413);
  assert.equal(huge.body.reason, "body_too_large");

  const wrongMethod = await call(req("GET", "/v1/reports", { origin: TEST_ORIGIN }), env, { now: NOW });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get("allow"), "POST");
});

test("REPORTS_ENABLED=false closes the route and says so in health", async () => {
  const env = freshEnv({ REPORTS_ENABLED: "false" });
  const refused = await submit(env, { kind: "bug", summary: "x" });
  assert.equal(refused.status, 503);
  assert.equal(refused.body.reason, "reports_disabled");

  const health = await call(req("GET", "/v1/health"), env, { now: NOW });
  assert.equal(health.body.reportsEnabled, false);

  const on = freshEnv();
  assert.equal((await call(req("GET", "/v1/health"), on, { now: NOW })).body.reportsEnabled, true);
});

test("without a D1 binding the report route refuses instead of pretending", async () => {
  const env = freshEnv({ DB: undefined });
  const refused = await submit(env, { kind: "bug", summary: "x" });
  assert.equal(refused.status, 503);
  assert.equal(refused.body.reason, "accounts_not_configured");
});

test("one address cannot post more than its share, and the deployment has a ceiling", async () => {
  const env = freshEnv();
  const ip = "198.51.100.4";
  for (let i = 0; i < REPORT_LIMITS.perIp[0]; i += 1) {
    const ok = await submit(env, { kind: "bug", summary: `fallo ${i}` }, { ip, now: NOW + i });
    assert.equal(ok.status, 200, `report ${i} should be accepted`);
  }
  const over = await submit(env, { kind: "bug", summary: "uno más" }, { ip, now: NOW + 100 });
  assert.equal(over.status, 429);
  assert.equal(over.body.reason, "rate_limited");
  assert.ok(Number(over.headers.get("retry-after")) > 0);

  // Another address is unaffected by the first one's spending.
  const elsewhere = await submit(env, { kind: "bug", summary: "desde otra red" }, { ip: "198.51.100.9", now: NOW + 101 });
  assert.equal(elsewhere.status, 200);

  // The flat ceiling is what stops many addresses together from spending the
  // daily write budget the paid side of this worker needs.
  await env.DB
    .prepare(
      `INSERT INTO rate_limits (bucket, count, window_start) VALUES ('rep:all', ?1, ?2)
       ON CONFLICT(bucket) DO UPDATE SET count = ?1, window_start = ?2`
    )
    .bind(REPORT_LIMITS.perDeploymentDaily[0], NOW - (NOW % DAY))
    .run();
  const busy = await submit(env, { kind: "bug", summary: "y otro" }, { ip: "198.51.100.33", now: NOW + 102 });
  assert.equal(busy.status, 429);
  assert.equal(busy.body.reason, "too_busy");
});

test("only an admin reads reports, and the list filters, counts and pages", async () => {
  const env = freshEnv();
  const admin = await signIn(env, "admin@example.test", NOW);
  const member = await signIn(env, "member@example.test", NOW + 5);

  const refs = [];
  const seed = [
    { kind: "bug", area: "audio", summary: "primero" },
    { kind: "idea", area: "exercises", summary: "segundo" },
    { kind: "bug", area: "payment", summary: "tercero", contact: "ana@example.test" }
  ];
  for (let i = 0; i < seed.length; i += 1) {
    const posted = await submit(env, seed[i], { now: NOW + 10 + i * 10, ip: `203.0.113.${20 + i}` });
    assert.equal(posted.status, 200, JSON.stringify(posted.body));
    refs.push(posted.body.reference);
  }

  const anonymous = await call(req("GET", "/v1/admin/reports"), env, { now: NOW + 100 });
  assert.equal(anonymous.status, 401);
  const asMember = await call(req("GET", "/v1/admin/reports", { token: member.token }), env, { now: NOW + 100 });
  assert.equal(asMember.status, 403);
  assert.equal(asMember.body.reason, "forbidden");

  const all = await call(req("GET", "/v1/admin/reports", { token: admin.token }), env, { now: NOW + 100 });
  assert.equal(all.status, 200);
  assert.equal(all.body.reports.length, 3);
  // Newest first, so the thing that just broke is at the top.
  assert.deepEqual(all.body.reports.map((r) => r.summary), ["tercero", "segundo", "primero"]);
  assert.equal(all.body.more, false);
  assert.equal(all.body.counts.new, 3);
  assert.equal(all.body.counts.fixed, 0);
  // The admin view is the only one that carries how to answer somebody.
  assert.equal(all.body.reports[0].contact, "ana@example.test");

  const bugs = await call(req("GET", "/v1/admin/reports?kind=bug", { token: admin.token }), env, { now: NOW + 100 });
  assert.deepEqual(bugs.body.reports.map((r) => r.summary), ["tercero", "primero"]);

  const firstPage = await call(req("GET", "/v1/admin/reports?limit=2", { token: admin.token }), env, {
    now: NOW + 100
  });
  assert.equal(firstPage.body.reports.length, 2);
  assert.equal(firstPage.body.more, true);
  const last = firstPage.body.reports[1];
  const nextPage = await call(
    req("GET", `/v1/admin/reports?limit=2&before=${last.createdAt}&beforeId=${last.reference}`, {
      token: admin.token
    }),
    env,
    { now: NOW + 100 }
  );
  assert.equal(nextPage.body.reports.length, 1);
  assert.equal(nextPage.body.reports[0].summary, "primero");
  assert.equal(nextPage.body.more, false);
});

test("triage moves a report, writes a note, and stamps when we first looked", async () => {
  const env = freshEnv();
  const admin = await signIn(env, "admin@example.test", NOW);
  const member = await signIn(env, "member@example.test", NOW + 5);
  const posted = await submit(env, { kind: "bug", summary: "el piano no suena" }, { now: NOW + 10 });
  const ref = posted.body.reference;

  const asMember = await call(
    req("POST", "/v1/admin/reports/update", { token: member.token, body: { reference: ref, status: "fixed" } }),
    env,
    { now: NOW + 20 }
  );
  assert.equal(asMember.status, 403);

  const triaged = await call(
    req("POST", "/v1/admin/reports/update", {
      token: admin.token,
      body: { reference: ref, status: "triaged", note: "pasa solo en iOS 16" }
    }),
    env,
    { now: NOW + 30 }
  );
  assert.equal(triaged.status, 200, JSON.stringify(triaged.body));
  assert.equal(triaged.body.report.status, "triaged");
  assert.equal(triaged.body.report.adminNote, "pasa solo en iOS 16");
  assert.equal(triaged.body.report.handledAt, NOW + 30);
  assert.equal(triaged.body.counts.triaged, 1);
  assert.equal(triaged.body.counts.new, 0);

  // Closing it later keeps the moment somebody first looked.
  const fixed = await call(
    req("POST", "/v1/admin/reports/update", { token: admin.token, body: { reference: ref, status: "fixed" } }),
    env,
    { now: NOW + 500 }
  );
  assert.equal(fixed.body.report.status, "fixed");
  assert.equal(fixed.body.report.handledAt, NOW + 30);
  // A status-only update leaves the note alone.
  assert.equal(fixed.body.report.adminNote, "pasa solo en iOS 16");
  assert.equal(fixed.body.report.updatedAt, NOW + 500);

  // The reporter sees the new status, not the note.
  const missing = await call(
    req("POST", "/v1/admin/reports/update", {
      token: admin.token,
      body: { reference: "VS-ZZZZZZZZZZ", status: "fixed" }
    }),
    env,
    { now: NOW + 600 }
  );
  assert.equal(missing.status, 404);
  const malformed = await call(
    req("POST", "/v1/admin/reports/update", { token: admin.token, body: { reference: "oops", status: "fixed" } }),
    env,
    { now: NOW + 600 }
  );
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.reason, "bad_reference");
  const badStatus = await call(
    req("POST", "/v1/admin/reports/update", { token: admin.token, body: { reference: ref, status: "maybe" } }),
    env,
    { now: NOW + 600 }
  );
  assert.equal(badStatus.status, 400);
  assert.equal(badStatus.body.reason, "bad_status");
});

test("housekeeping drops reports we closed long ago and keeps the open ones", async () => {
  const env = freshEnv();
  const admin = await signIn(env, "admin@example.test", NOW);
  const oldOpen = await submit(env, { kind: "bug", summary: "sigue roto" }, { now: NOW, ip: "203.0.113.41" });
  const oldClosed = await submit(env, { kind: "bug", summary: "ya arreglado" }, { now: NOW, ip: "203.0.113.42" });
  await call(
    req("POST", "/v1/admin/reports/update", {
      token: admin.token,
      body: { reference: oldClosed.body.reference, status: "fixed" }
    }),
    env,
    { now: NOW + 10 }
  );

  await sweepExpired(env.DB, NOW + 10 + 181 * DAY);
  const left = await env.DB.prepare("SELECT id FROM reports ORDER BY id").all();
  assert.deepEqual(
    (left.results || []).map((r) => r.id),
    [oldOpen.body.reference],
    "an open report outlives the retention window; a closed one does not"
  );
});
