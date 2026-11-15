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
import { ensureSchema, resetSchemaMemo, sweepExpired } from "../src/db.js";
import {
  REPORT_LIMITS,
  clampText,
  isReferenceShape,
  mintReference,
  redactLongDigitRuns,
  sanitizeEnvironment,
  sanitizeReport
} from "../src/reports.js";
import { ipBucketKey } from "../src/events.js";
import { createAccountEnv, TEST_ORIGIN } from "./fixtures.mjs";

const BASE = "https://entitlements.test";

/** What the scrub leaves where a card was. */
const HIDDEN = "[n\u00famero oculto]";
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
  // A paste is rarely as tidy as a hand-typed card: every one of these walked
  // straight through the first version of the scrub (QA round 5, QA-41).
  assert.equal(redactLongDigitRuns("4111\n1111 1111 1111"), "[número oculto]", "a line break");
  assert.equal(redactLongDigitRuns("4111  1111  1111  1111"), "[número oculto]", "two spaces");
  assert.equal(redactLongDigitRuns("4111\u00a01111\u00a01111\u00a01111"), "[número oculto]", "no-break spaces");
  assert.equal(redactLongDigitRuns("4111.1111.1111.1111"), "[número oculto]", "dots");
  assert.equal(redactLongDigitRuns("4111 - 1111 - 1111 - 1111"), "[número oculto]", "space, dash, space");
  assert.equal(redactLongDigitRuns("４１１１１１１１１１１１１１１１"), "[número oculto]", "full-width digits");
  assert.equal(redactLongDigitRuns("3782 822463 10005"), "[número oculto]", "an Amex as Amex groups it");
  assert.equal(redactLongDigitRuns("4111 1111 1111 1"), "[número oculto]", "a thirteen-digit card");
  // A card after a number that is not one: judging the whole run of digits and
  // separators would find twenty digits, call it not a card, and store it.
  assert.equal(
    redactLongDigitRuns("a las 10.30 el 4111 1111 1111 1111 falló"),
    "a las 10.30 el [número oculto] falló"
  );
  assert.equal(
    redactLongDigitRuns("4111 1111 1111 1111 y 5500 0000 0000 0004"),
    "[número oculto] y [número oculto]",
    "two of them"
  );

  // A number typed in FRONT of a card moves the card-shaped window across the
  // join, so hiding only that window hid the card's first four digits and
  // stored its last twelve, in order (QA round 5 re-attack). Twelve
  // consecutive digits of a card is the card, so the whole run goes.
  assert.equal(redactLongDigitRuns("123456789 4111 1111 1111 1111"), HIDDEN, "an order number in front");
  assert.equal(redactLongDigitRuns("pago 1234567 4111-1111-1111-1111"), "pago [n\u00famero oculto]", "and with hyphens");
  assert.equal(
    redactLongDigitRuns("5555 5555 5555 5555 5555 5555 5555"),
    HIDDEN,
    "seven groups: no window of four may be hidden while the rest stays"
  );

  // The invisible separators. Each of these is what a paste out of a PDF, a
  // rich-text field or a CJK keyboard actually carries, and every one of them
  // leaked the whole card until the separator set became \\p{Zs} and \\p{Cf}
  // rather than a hand-written list (QA round 5 re-attack found the thin and
  // zero-width spaces still walking through the list version).
  const SEPARATORS = {
    "thin space": "\u2009",
    "hair space": "\u200a",
    "ideographic space": "\u3000",
    "narrow no-break space": "\u202f",
    "figure space": "\u2007",
    "medium mathematical space": "\u205f",
    "zero-width space": "\u200b",
    "zero-width non-joiner": "\u200c",
    "zero-width joiner": "\u200d",
    "word joiner": "\u2060",
    "byte-order mark": "\ufeff",
    "soft hyphen": "\u00ad"
  };
  for (const [name, separator] of Object.entries(SEPARATORS)) {
    assert.equal(
      redactLongDigitRuns(["4111", "1111", "1111", "1111"].join(separator)),
      HIDDEN,
      name
    );
  }

  // Things a report about singing legitimately contains are left alone.
  assert.equal(redactLongDigitRuns("el do4 a 261.63 Hz"), "el do4 a 261.63 Hz");
  assert.equal(redactLongDigitRuns("duró 1200 ms"), "duró 1200 ms");
  assert.equal(redactLongDigitRuns("VS-7F3KQ2MXNP"), "VS-7F3KQ2MXNP");
  // And so is ordinary prose with several numbers in it, which is what the
  // wider separator set could have cost. Every one of these is a run of digits
  // and separators as long as a card; what saves them is that a card's groups
  // are three digits or more.
  assert.equal(redactLongDigitRuns("+51 987 654 321"), "+51 987 654 321", "a phone number");
  assert.equal(
    redactLongDigitRuns("987 654 321 el 5 a las 10.30 y el 2026"),
    "987 654 321 el 5 a las 10.30 y el 2026"
  );
  assert.equal(redactLongDigitRuns("10.30 11.45 12.00 13.15"), "10.30 11.45 12.00 13.15", "four times");
  for (const decoy of [
    "+54 9 11 5555-1234",
    "+55 11 91234-5678",
    "(415) 555-2671",
    "192.168.100.200",
    "8.8.8.8 8.8.4.4",
    "Chrome/130.0.6723.92",
    "v2026.11.03.1234",
    "20261102a",
    "1234 5678 9012",
    "12 34 56 78 90 12 34"
  ]) {
    assert.equal(redactLongDigitRuns(decoy), decoy, `decoy: ${decoy}`);
  }
  assert.equal(
    redactLongDigitRuns("2026-11-03 2026-11-04 2026-11-05"),
    "2026-11-03 2026-11-04 2026-11-05",
    "three dates"
  );
  // This one used to be pinned the other way round, as "twenty digits is no
  // card". It was the wrong judgement: a card with an expiry or a CVV typed
  // onto the end of it is the commonest way one arrives, and there is no
  // length at which twenty unbroken digits becomes something a report about
  // singing needs. Any single unbroken run of thirteen or more now goes.
  assert.equal(redactLongDigitRuns("41111111111111119999"), HIDDEN, "a card with four digits glued on");
  assert.equal(redactLongDigitRuns("tarjeta 4111111111111111122026 x"), "tarjeta [n\u00famero oculto] x", "card and expiry");

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

test("the day's write ceiling does not reopen at midnight for a request that began before it", async () => {
  // The ceiling exists so that a public POST cannot spend the 100,000 D1 writes
  // a day that sign-in, gifts and progress saving need. A Worker reads its clock
  // once and may write seconds later, so a request that began at 23:59:59 can
  // reach the limiter after midnight, when another request has already opened
  // the new day. It then computes yesterday's window. The limiter used to treat
  // any difference as a turnover, which reset the counter and dragged the window
  // back to yesterday — so one such request per midnight reopened the whole
  // day's ceiling, and the next request with a current clock reopened it again
  // (QA round 5 re-attack).
  const env = freshEnv();
  const midnight = Math.floor(NOW / DAY) * DAY + DAY;

  // One report after midnight opens today's bucket, then it is filled to the
  // ceiling directly rather than by posting five hundred reports.
  assert.equal((await submit(env, { kind: "bug", summary: "primero" }, { now: midnight + 1 })).status, 200);
  await env.DB.prepare("UPDATE rate_limits SET count = ?1 WHERE bucket = 'rep:all'")
    .bind(REPORT_LIMITS.perDeploymentDaily[0])
    .run();
  const before = (await env.DB.prepare("SELECT COUNT(*) AS n FROM reports").first()).n;

  // The straggler from yesterday meets the full ceiling...
  const straggler = await submit(
    env,
    { kind: "bug", summary: "desde ayer" },
    { now: midnight - 1, ip: "198.51.100.1" }
  );
  assert.equal(straggler.status, 429);
  assert.equal(straggler.body.reason, "too_busy");

  // ...and, the point of the test, so does everybody after it.
  for (let i = 0; i < 5; i += 1) {
    const later = await submit(
      env,
      { kind: "bug", summary: "despues" },
      { now: midnight + 10 + i, ip: `198.51.100.${20 + i}` }
    );
    assert.equal(later.status, 429, `request ${i} after the straggler`);
  }
  assert.equal((await env.DB.prepare("SELECT COUNT(*) AS n FROM reports").first()).n, before, "nothing was stored");

  // Tomorrow is a new day, which is the behaviour the fix must not break.
  assert.equal(
    (await submit(env, { kind: "bug", summary: "manana" }, { now: midnight + DAY + 1, ip: "198.51.100.9" })).status,
    200
  );
});

test("one address cannot get a fresh hourly share by reading a clock from before the hour", async () => {
  const env = freshEnv();
  const HOUR = REPORT_LIMITS.perIp[1];
  const turned = Math.floor(NOW / HOUR) * HOUR + HOUR;
  const ip = "198.51.100.77";
  for (let i = 0; i < REPORT_LIMITS.perIp[0]; i += 1) {
    assert.equal((await submit(env, { kind: "bug", summary: `r${i}` }, { now: turned + 5 + i, ip })).status, 200);
  }
  assert.equal((await submit(env, { kind: "bug", summary: "stale" }, { now: turned - 1, ip })).status, 429);
  assert.equal((await submit(env, { kind: "bug", summary: "after" }, { now: turned + 60, ip })).status, 429);
  assert.equal(
    (await env.DB.prepare("SELECT COUNT(*) AS n FROM reports").first()).n,
    REPORT_LIMITS.perIp[0],
    "the share was spent once, not twice"
  );
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

test("a report writes the reporter's address nowhere, not even in its rate limits", async () => {
  // The privacy page promises the address is not written to the database. The
  // per-address limits used to keep it in the bucket name, `rep:ip:<address>`,
  // in a table that is swept daily but is the database all the same.
  const env = freshEnv();
  for (const ip of ["198.51.100.23", "2001:db8:85a3::8a2e:370:7334"]) {
    const answer = await submit(env, { kind: "bug", summary: "no carga el micrófono" }, { ip });
    assert.equal(answer.status, 200, JSON.stringify(answer.body));
    const rows = await env.DB.prepare("SELECT bucket FROM rate_limits").all();
    const buckets = rows.results.map((row) => row.bucket);
    assert.equal(buckets.some((bucket) => bucket.includes(ip)), false, `${ip} is in ${buckets.join(", ")}`);
    const stored = await env.DB.prepare("SELECT * FROM reports").all();
    assert.equal(JSON.stringify(stored.results).includes(ip), false, `${ip} is in a report row`);
  }
  // Control: the limits did run, per address: two hourly and two daily buckets.
  const rows = await env.DB.prepare("SELECT bucket FROM rate_limits WHERE bucket LIKE 'rep:ip%'").all();
  assert.equal(rows.results.length, 4);
  // And the pseudonym is still per address: a second report from the first
  // address counts against the same bucket, not a new one.
  await submit(env, { kind: "bug", summary: "otra vez" }, { ip: "198.51.100.23" });
  const again = await env.DB.prepare("SELECT bucket FROM rate_limits WHERE bucket LIKE 'rep:ip%'").all();
  assert.equal(again.results.length, 4);
  // And it is not the statistics route's pseudonym for the same address and
  // day, so a report's bucket cannot be joined to that address's event buckets.
  const asCaller = req("POST", "/v1/reports", { headers: { "cf-connecting-ip": "198.51.100.23" } });
  const eventsKey = await ipBucketKey(env, asCaller, NOW);
  const reportsKey = await ipBucketKey(env, asCaller, NOW, "reports");
  assert.equal(again.results.some((row) => row.bucket.endsWith(eventsKey)), false);
  assert.equal(again.results.some((row) => row.bucket.endsWith(reportsKey)), true, "control: it is the reports pseudonym");
});

test("a deployment with no key to pseudonymise addresses under takes no reports", async () => {
  // Wrong: limiting by the raw address, or by an unkeyed hash of it, which is
  // reversed by trying all 2^32 IPv4 addresses.
  const env = freshEnv({ EVENTS_IP_KEY: "", LICENSE_PRIVATE_KEY_PKCS8_B64: "" });
  const refused = await submit(env, { kind: "bug", summary: "x" });
  assert.equal(refused.status, 503);
  assert.equal(refused.body.reason, "reports_disabled");
  assert.equal((await call(req("GET", "/v1/health"), env, { now: NOW })).body.reportsEnabled, false);
  // Control: either key on its own is enough.
  const own = freshEnv({ EVENTS_IP_KEY: "reports-test-key", LICENSE_PRIVATE_KEY_PKCS8_B64: "" });
  assert.equal((await submit(own, { kind: "bug", summary: "x" })).status, 200);
  const derived = freshEnv({ EVENTS_IP_KEY: "" });
  assert.equal((await submit(derived, { kind: "bug", summary: "x" })).status, 200);
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

/** How many rows the rate-limit table holds, and what one bucket says. */
async function limitRows(env) {
  const rows = await env.DB.prepare("SELECT bucket, count FROM rate_limits ORDER BY bucket").all();
  return rows.results || rows;
}

/** How many reports are stored. */
async function storedReports(env) {
  return Number((await env.DB.prepare("SELECT COUNT(*) AS n FROM reports").first()).n);
}

/** Spend the whole day's ceiling, as a flood would have. */
function spendTheCeiling(env, at) {
  return env.DB
    .prepare(
      `INSERT INTO rate_limits (bucket, count, window_start) VALUES ('rep:all', ?1, ?2)
       ON CONFLICT(bucket) DO UPDATE SET count = ?1, window_start = ?2`
    )
    .bind(REPORT_LIMITS.perDeploymentDaily[0], at - (at % REPORT_LIMITS.perDeploymentDaily[1]))
    .run();
}

test("reports arriving at the same moment cannot all pass one address's share", async () => {
  const env = freshEnv();
  await ensureSchema(env.DB);
  const ip = "198.51.100.77";
  // Four times the hourly allowance, all in flight together. The limiter used
  // to read the count, decide, and write the new count back, so every one of
  // these read zero and every one of them passed (QA round 5, QA-39).
  const burst = REPORT_LIMITS.perIp[0] * 4;
  const answers = await Promise.all(
    Array.from({ length: burst }, (_, i) => submit(env, { kind: "bug", summary: `a la vez ${i}` }, { ip, now: NOW }))
  );
  const accepted = answers.filter((a) => a.status === 200).length;
  assert.equal(accepted, REPORT_LIMITS.perIp[0], `${accepted} of ${burst} got through a limit of ${REPORT_LIMITS.perIp[0]}`);
  assert.equal(await storedReports(env), REPORT_LIMITS.perIp[0], "and that is what the database holds");
  const asCaller = req("POST", "/v1/reports", { headers: { "cf-connecting-ip": ip } });
  const ipKey = await ipBucketKey(env, asCaller, NOW, "reports");
  const bucket = await env.DB.prepare("SELECT count FROM rate_limits WHERE bucket = ?1").bind(`rep:ip:${ipKey}`).first();
  assert.equal(Number(bucket.count), REPORT_LIMITS.perIp[0], "the stored count never ran past the limit");
  for (const answer of answers.filter((a) => a.status !== 200)) {
    assert.equal(answer.status, 429, JSON.stringify(answer.body));
  }
});

test("the day's ceiling cannot be overspent by requests arriving together", async () => {
  const env = freshEnv();
  await ensureSchema(env.DB);
  const window = NOW - (NOW % REPORT_LIMITS.perDeploymentDaily[1]);
  await env.DB
    .prepare(
      `INSERT INTO rate_limits (bucket, count, window_start) VALUES ('rep:all', ?1, ?2)
       ON CONFLICT(bucket) DO UPDATE SET count = ?1, window_start = ?2`
    )
    .bind(REPORT_LIMITS.perDeploymentDaily[0] - 1, window)
    .run();
  // One place left, twenty callers from twenty different addresses.
  const answers = await Promise.all(
    Array.from({ length: 20 }, (_, i) =>
      submit(env, { kind: "bug", summary: `el último ${i}` }, { ip: `198.51.100.${100 + i}`, now: NOW })
    )
  );
  assert.equal(answers.filter((a) => a.status === 200).length, 1, "exactly one took the last place");
  assert.equal(await storedReports(env), 1);
  const ceiling = await env.DB.prepare("SELECT count FROM rate_limits WHERE bucket = 'rep:all'").first();
  assert.equal(Number(ceiling.count), REPORT_LIMITS.perDeploymentDaily[0]);
});

test("once the day's ceiling is reached, being refused costs the database nothing", async () => {
  const env = freshEnv();
  await ensureSchema(env.DB);
  await spendTheCeiling(env, NOW);
  const before = await limitRows(env);

  // A flood does not come from one address: an IPv6 /64 hands out more than
  // anybody can use. Each refusal used to write the two per-address buckets
  // before the ceiling was even consulted, so the thing protecting the day's
  // writes was itself spending them (QA round 5, QA-40).
  for (let i = 0; i < 25; i += 1) {
    const refused = await submit(env, { kind: "bug", summary: `desde otra red ${i}` }, {
      ip: `2001:db8:0:${i.toString(16)}::1`,
      now: NOW + i
    });
    assert.equal(refused.status, 429);
    assert.equal(refused.body.reason, "too_busy");
  }

  const after = await limitRows(env);
  assert.deepEqual(after, before, "not one row was written, added or moved");
  assert.equal(await storedReports(env), 0);
});

test("a report this route would refuse anyway does not spend the reporter's share", async () => {
  const env = freshEnv();
  await ensureSchema(env.DB);
  const ip = "198.51.100.200";
  // A client bug, or somebody pressing send on an empty form. Validation runs
  // before the limits, so it costs neither a slot nor a row (QA round 5,
  // QA-43).
  for (const body of [{}, { kind: "bug" }, { kind: "nonsense", summary: "x" }, { kind: "bug", summary: "   " }]) {
    const refused = await submit(env, body, { ip, now: NOW });
    assert.equal(refused.status, 400, JSON.stringify(refused.body));
  }
  assert.deepEqual(await limitRows(env), [], "nothing was counted against them");

  // And their whole hourly allowance is still there.
  for (let i = 0; i < REPORT_LIMITS.perIp[0]; i += 1) {
    const ok = await submit(env, { kind: "bug", summary: `ahora sí ${i}` }, { ip, now: NOW + i });
    assert.equal(ok.status, 200, `report ${i}`);
  }
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

/**
 * Build a number in a non-ASCII decimal script.
 * @param {number} zero Code point of that script's digit zero.
 * @param {string} ascii The number in ASCII digits.
 * @returns {string} The same number in that script.
 */
function inScript(zero, ascii) {
  return [...ascii].map((d) => String.fromCodePoint(zero + Number(d))).join("");
}

const ARABIC_INDIC = 0x0660;
const DEVANAGARI = 0x0966;
const MATH_BOLD = 0x1d7ce;
const THAI = 0x0e50;

test("a card is a card in every decimal script, not only in ASCII", () => {
  // The scrub matched `[0-9]` with full-width digits folded to ASCII first.
  // That covered exactly one script and let every other one through: the same
  // card in Arabic-Indic digits, in Devanagari, in Thai, or in the
  // mathematical bold digits a copy out of styled text produces, was stored as
  // typed (QA round 6). `\p{Nd}` is the whole category, which is why there is
  // nothing left to enumerate.
  for (const [name, zero] of [
    ["Arabic-Indic", ARABIC_INDIC],
    ["Devanagari", DEVANAGARI],
    ["Thai", THAI],
    ["mathematical bold", MATH_BOLD]
  ]) {
    assert.equal(redactLongDigitRuns(inScript(zero, "4111111111111111")), HIDDEN, `${name}, unbroken`);
    const grouped = ["4111", "1111", "1111", "1111"].map((g) => inScript(zero, g)).join(" ");
    assert.equal(redactLongDigitRuns(grouped), HIDDEN, `${name}, in groups of four`);
  }
  // Mixed scripts in one run, which is what a half-finished paste looks like.
  assert.equal(redactLongDigitRuns(`4111 ${inScript(ARABIC_INDIC, "1111")} 1111 1111`), HIDDEN, "mixed");
});

test("a digit outside the plane is counted once, not twice", () => {
  // A mathematical bold digit is a surrogate pair, so a group of three of them
  // has a string LENGTH of six. Counting length instead of code points turns a
  // twelve-digit number into an eighteen-digit one and hides it.
  //
  // The obvious case does not test this. Eight bold digits with no separators
  // never reach the group counting at all: the cheap early-out in
  // `redactLongDigitRuns` already measures the run in code points and lets
  // anything under thirteen through. The run has to be long enough in code
  // points to get past that, while still holding fewer than thirteen digits —
  // which is what separators do. A first version of this test used the
  // no-separator form, passed, and the length-counting mutant survived it.
  const grouped = ["411", "111", "111", "111"].map((g) => inScript(MATH_BOLD, g)).join(" ");
  assert.equal([...grouped].length >= 13, true, "the run must be long enough to pass the early-out");
  assert.equal(redactLongDigitRuns(grouped), grouped, "twelve bold digits in groups of three are not a card");

  // And the early-out itself, which is the same count by a shorter road.
  assert.equal(
    redactLongDigitRuns(inScript(MATH_BOLD, "41111111")),
    inScript(MATH_BOLD, "41111111"),
    "eight bold digits are eight digits"
  );
  assert.equal(redactLongDigitRuns(inScript(MATH_BOLD, "4111111111111")), HIDDEN, "thirteen of them are a card");
});

test("the full-width hyphen and the real minus sign separate digits too", () => {
  // U+FF0D off a CJK keyboard and U+2212 out of a spreadsheet or a formatted
  // document. Neither was in the list, so either one leaked the whole card.
  assert.equal(redactLongDigitRuns("4111－1111－1111－1111"), HIDDEN, "full-width hyphen");
  assert.equal(redactLongDigitRuns("4111−1111−1111−1111"), HIDDEN, "minus sign");
});

test("the scrub no longer rewrites text it is not hiding", () => {
  // Folding full-width digits to ASCII made a narrower character class match,
  // and the cost was the reporter's own text coming back altered. The class
  // covers every script now, so there is nothing to fold and nothing to alter.
  const typed = "la pista １２ falla en el compas 3";
  assert.equal(redactLongDigitRuns(typed), typed);
  assert.equal(redactLongDigitRuns(inScript(DEVANAGARI, "12")), inScript(DEVANAGARI, "12"));
});

test("one and two digits at a time are stored as typed, and that is the trade", () => {
  // Known and deliberate (QA round 6). The group-of-three rule is what keeps
  // the decoys below readable, and the proposed alternative — accept short
  // groups when the run passes Luhn and starts with a card brand's digit — was
  // declined: one run in ten passes Luhn by chance (it passes on the clock
  // times below, which is why a brand filter had to be bolted on), and the
  // measured cost was about one short-group run in twenty hidden without being
  // a card. In a form for telling us what broke, hiding the text costs a
  // report. This test is here so the gap stays a decision somebody made rather
  // than a hole nobody noticed; if it ever starts failing, the rule changed.
  assert.equal(
    redactLongDigitRuns("4 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1"),
    "4 1 1 1 1 1 1 1 1 1 1 1 1 1 1 1",
    "one digit at a time"
  );
  assert.equal(redactLongDigitRuns("41 11 11 11 11 11 11 11"), "41 11 11 11 11 11 11 11", "in pairs");

  // What that rule buys, which is the other half of the trade.
  assert.equal(redactLongDigitRuns("10.30 11.45 12.00 13.15"), "10.30 11.45 12.00 13.15", "four clock times");
  assert.equal(redactLongDigitRuns("987 654 321 y 987 654 322"), "987 654 321 y 987 654 322", "two mobiles");
});

test("superscripts and circled digits are left alone", () => {
  // `\p{No}` is not a digit here. A footnote marker and "①" appear in ordinary
  // text, and hiding the numbers around them would cost a report its meaning.
  // Nobody writes a card this way.
  const typed = "el error ⁴ pasa 3 veces y ① no abre";
  assert.equal(redactLongDigitRuns(typed), typed);
});

test("every separator a card can arrive with, one test per code point", () => {
  // The separator set was a hand-written list of four dashes, and the other
  // twenty-three in Unicode's dash category walked straight through it. U+2011
  // is the one that matters: Word and Google Docs turn a typed hyphen inside a
  // number into a non-breaking hyphen, so a card pasted out of an order
  // confirmation was stored exactly as typed (QA round 7).
  //
  // One case per code point, named, so a separator dropped from the set fails
  // a test that says which one it was rather than a single any-of assertion.
  const separators = {
    "U+0009 tab": "\u0009",
    "U+000A line feed": "\u000a",
    "U+000D carriage return": "\u000d",
    "U+0085 next line": "\u0085",
    "U+0020 space": "\u0020",
    "U+00A0 no-break space": "\u00a0",
    "U+2007 figure space": "\u2007",
    "U+202F narrow no-break space": "\u202f",
    "U+3000 ideographic space": "\u3000",
    "U+2028 line separator": "\u2028",
    "U+2029 paragraph separator": "\u2029",
    "U+200B zero-width space": "\u200b",
    "U+200D zero-width joiner": "\u200d",
    "U+00AD soft hyphen": "\u00ad",
    "U+FEFF byte-order mark": "\ufeff",
    "U+002D hyphen-minus": "\u002d",
    "U+2010 hyphen": "\u2010",
    "U+2011 non-breaking hyphen": "\u2011",
    "U+2012 figure dash": "\u2012",
    "U+2013 en dash": "\u2013",
    "U+2014 em dash": "\u2014",
    "U+2015 horizontal bar": "\u2015",
    "U+2212 minus sign": "\u2212",
    "U+FF0D full-width hyphen": "\uff0d",
    "U+FE58 small em dash": "\ufe58",
    "U+FE63 small hyphen-minus": "\ufe63",
    "U+002E full stop": "."
  };
  for (const [name, separator] of Object.entries(separators)) {
    assert.equal(
      redactLongDigitRuns(["4111", "1111", "1111", "1111"].join(separator)),
      "[número oculto]",
      `a card separated by ${name} was stored as typed`
    );
  }
});

test("a letter between the groups is not a separator, so two numbers stay two numbers", () => {
  // The other half of the set: widening it must not make prose into one run.
  assert.equal(
    redactLongDigitRuns("pedido 1002345 del 2024-11-03"),
    "pedido 1002345 del 2024-11-03"
  );
  assert.equal(redactLongDigitRuns("4111x1111x1111x1111"), "4111x1111x1111x1111");
});

test("thirteen digits is a card and twelve is not, group by group", () => {
  // The threshold, from both sides, in the two shapes it has to hold for: one
  // unbroken group, and groups of four where the last one is short.
  assert.equal(redactLongDigitRuns("4".repeat(12)), "4".repeat(12));
  assert.equal(redactLongDigitRuns("4".repeat(13)), "[número oculto]");
  assert.equal(redactLongDigitRuns("4111 1111 1111"), "4111 1111 1111", "twelve digits in groups");
  assert.equal(redactLongDigitRuns("4111 1111 1111 1"), "[número oculto]", "and thirteen");
});

test("a group of two can only ever end a window, so a clock is not a card", () => {
  // The per-group minimum of three. Raise it to four and a 4-6-5 Amex stops
  // being a card; drop it to two and a column of times becomes one.
  assert.equal(
    redactLongDigitRuns("3782 822463 10005"),
    "[número oculto]",
    "a 4-6-5 Amex is a card"
  );
  assert.equal(
    redactLongDigitRuns("10:30 11:30 12:30 13:30 14:30 15:30 16:30"),
    "10:30 11:30 12:30 13:30 14:30 15:30 16:30",
    "seven clock times are fourteen digits and no card"
  );
  assert.equal(
    redactLongDigitRuns("987 654 321 el 5 a las 10.30"),
    "987 654 321 el 5 a las 10.30",
    "a Peruvian mobile and a time"
  );
});

test("nineteen digits in groups is a card and twenty is past the longest one", () => {
  // The window cap. The unbroken rule above is what still catches twenty in a
  // row; this is about a window of whole groups.
  assert.equal(redactLongDigitRuns("4111 1111 1111 1111 111"), "[número oculto]", "nineteen");
  // Twelve digits and then eight: the first window is twelve, the second is
  // twenty, and twenty is past the longest card there is, so neither is one.
  // Raise the cap by one and this is hidden.
  assert.equal(
    redactLongDigitRuns("123456789012 12345678"),
    "123456789012 12345678",
    "no window of whole groups lands between thirteen and nineteen"
  );
});

test("an unbroken run past nineteen digits is still a card", () => {
  // A card with the expiry and the CVV typed onto the end of it. This used to
  // be stored as typed.
  assert.equal(redactLongDigitRuns("4".repeat(25)), "[número oculto]");
});

test("what a legitimate report loses, stated exactly", () => {
  // A comment here used to say a legitimate report loses nothing. It does lose
  // something, and these are the shapes, so nobody has to rediscover them: two
  // unrelated numbers that add to thirteen digits with only separators between
  // them, and any unbroken thirteen-digit number.
  //
  // Hiding them is the chosen side to be wrong on — a hidden order number
  // costs a sentence of a report, a stored card number cannot be taken back —
  // and these assertions are here to make the cost visible rather than to
  // defend it.
  for (const text of [
    "pedido 1002345 2024-11-03",
    "987654321 2024-11-03",
    "paso en 1730645400123",
    "Screenshot_20241103-143025.png"
  ]) {
    assert.notEqual(redactLongDigitRuns(text), text, `${text} is left alone now`);
  }
  // And the ones it does not touch, so the cost is not worse than stated.
  for (const text of [
    "grabado 2024-11-03 14:30:25",
    "v1.2.3 build 20241103",
    "mi numero 987 654 321",
    "48000 Hz, 1024 samples, 16 bits"
  ]) {
    assert.equal(redactLongDigitRuns(text), text, `${text} should be stored as typed`);
  }
});
