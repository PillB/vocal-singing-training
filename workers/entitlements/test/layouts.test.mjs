/**
 * The site-layout readout (src/layouts.js, GET /v1/admin/layouts).
 *
 * Each test names the wrong behaviour it would catch. The oracle is always a
 * number worked out by hand from the events the test sends, never by the code
 * under test.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "../src/index.js";
import { resetSchemaMemo } from "../src/db.js";
import { clearGoogleJwksCache } from "../src/google.js";
import { EVENT_NAMES, EXPERIMENT_PRESETS, MAX_EVENTS_PER_REQUEST } from "../src/events.js";
import {
  finishVersions,
  foldVersions,
  LAYOUT_EVENTS,
  LAYOUT_VERSIONS,
  MAX_SESSIONS_PER_BROWSER,
  windowDays
} from "../src/layouts.js";
import { createAccountEnv, TEST_ORIGIN } from "./fixtures.mjs";

const BASE = "https://entitlements.test";
const UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const NOW = 1800000000;
const DAY = 86400;

function freshEnv() {
  resetSchemaMemo();
  clearGoogleJwksCache();
  return createAccountEnv();
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

function ev(name, cid, props, day) {
  return { name, cid, props: props || {}, day: day || "2027-01-15", tz: -300 };
}

function cid(i) {
  return `d${String(i).padStart(15, "0")}`;
}

let address = 0;
async function send(env, events, when) {
  for (let i = 0; i < events.length; i += MAX_EVENTS_PER_REQUEST) {
    address += 1;
    const res = await call(
      new Request(`${BASE}/v1/events`, {
        method: "POST",
        headers: {
          "content-type": "text/plain;charset=UTF-8",
          "user-agent": UA,
          Origin: TEST_ORIGIN,
          "cf-connecting-ip": `10.9.${(address >> 8) & 255}.${address & 255}`
        },
        body: JSON.stringify({ v: 1, events: events.slice(i, i + MAX_EVENTS_PER_REQUEST) })
      }),
      env,
      { now: when }
    );
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.dropped, 0, `the worker dropped a layout event: ${JSON.stringify(res.body)}`);
  }
}

async function signIn(env, email, now) {
  let code = null;
  const fetchImpl = async (url, init) => {
    const match = /\b(\d{6})\b/.exec(JSON.parse(init.body).text || "");
    code = match && match[1];
    return { ok: true, status: 200 };
  };
  const post = (path, body) =>
    new Request(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  await call(post("/v1/auth/email/start", { email }), env, { now, fetchImpl });
  const verified = await call(post("/v1/auth/email/verify", { email, code }), env, { now: now + 1 });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  return verified.body.sessionToken;
}

function adminGet(path, token) {
  return new Request(`${BASE}${path}`, {
    method: "GET",
    headers: token ? { authorization: `Bearer ${token}` } : {}
  });
}

async function read(env, query) {
  const admin = await signIn(env, "admin@example.test", NOW);
  const res = await call(adminGet(`/v1/admin/layouts${query || ""}`, admin), env, { now: NOW });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
}

function version(body, ver) {
  return body.versions.find((v) => v.ver === ver);
}

test("the layout events are on the allowlist, so a real browser's are stored", () => {
  // Wrong behaviour: a name missing here is dropped as unknown_event and the
  // dashboard stays empty for ever while the site looks fine.
  for (const name of LAYOUT_EVENTS) assert.ok(EVENT_NAMES.has(name), name);
  assert.deepEqual(LAYOUT_EVENTS, ["layout_session", "layout_switch", "layout_time"]);
});

test("the layout route is admin-only", async () => {
  // Wrong behaviour: the numbers readable by anybody, or by any signed-in account.
  const env = freshEnv();
  const anon = await call(adminGet("/v1/admin/layouts"), env, { now: NOW });
  assert.equal(anon.status, 401);
  const member = await signIn(env, "someone@example.test", NOW);
  const forbidden = await call(adminGet("/v1/admin/layouts", member), env, { now: NOW });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.versions, undefined);
  const post = await call(
    new Request(`${BASE}/v1/admin/layouts`, { method: "POST", headers: { authorization: `Bearer ${member}` } }),
    env,
    { now: NOW }
  );
  assert.equal(post.status, 405);
});

test("visits, browsers and who came back are counted per design, by browser", async () => {
  // Wrong behaviours: counting visits as browsers; calling a browser with two
  // visits on one day "back on another day"; mixing the designs' counts.
  const env = freshEnv();
  await send(
    env,
    [
      // Browser 1 on A: three visits over two days.
      ev("layout_session", cid(1), { ver: "a", src: "default", n: 1 }, "2027-01-13"),
      ev("layout_session", cid(1), { ver: "a", src: "default", n: 2 }, "2027-01-13"),
      ev("layout_session", cid(1), { ver: "a", src: "default", n: 3 }, "2027-01-15"),
      // Browser 2 on A: two visits the same day.
      ev("layout_session", cid(2), { ver: "a", src: "default", n: 1 }),
      ev("layout_session", cid(2), { ver: "a", src: "default", n: 2 }),
      // Browser 3 on A once, then on B once after choosing it.
      ev("layout_session", cid(3), { ver: "a", src: "default", n: 1 }),
      ev("layout_session", cid(3), { ver: "b", src: "chosen", n: 2 }),
      // Browser 4 on B from a link.
      ev("layout_session", cid(4), { ver: "b", src: "link", n: 1 })
    ],
    NOW - 100
  );
  const body = await read(env);
  const a = version(body, "a");
  const b = version(body, "b");
  assert.equal(a.browsers, 3);
  assert.equal(a.sessions, 6);
  assert.equal(a.repeatBrowsers, 2);
  assert.equal(a.multidayBrowsers, 1);
  assert.equal(a.repeat.rate, 2 / 3);
  assert.ok(a.repeat.lo < 2 / 3 && a.repeat.hi > 2 / 3, "the interval brackets the rate");
  assert.deepEqual(a.bySource, { default: 6, chosen: 0, link: 0 });
  assert.equal(b.browsers, 2);
  assert.equal(b.sessions, 2);
  assert.equal(b.repeatBrowsers, 0);
  assert.deepEqual(b.bySource, { default: 0, chosen: 1, link: 1 });
  assert.equal(a.sessionShare, 6 / 8);
  assert.equal(body.readMe, "self_selected");
  // No browser id leaves the worker.
  assert.ok(!JSON.stringify(body).includes(cid(1)), "a browser id is in the answer");
});

test("time is summed per design, and one report cannot claim more than the ceiling", async () => {
  // Wrong behaviour: a single forged or clock-skewed report of a million
  // seconds deciding which design "people spend the most time in".
  const env = freshEnv();
  await send(
    env,
    [
      ev("layout_session", cid(1), { ver: "a", src: "default", n: 1 }),
      ev("layout_session", cid(2), { ver: "b", src: "chosen", n: 1 }),
      ev("layout_time", cid(1), { ver: "a", sec: 120 }),
      ev("layout_time", cid(1), { ver: "a", sec: 60.4 }),
      ev("layout_time", cid(2), { ver: "b", sec: 1000000 }),
      ev("layout_time", cid(2), { ver: "b", sec: -500 }),
      // Not a number: adds nothing rather than poisoning the sum.
      ev("layout_time", cid(2), { ver: "b", sec: "900" })
    ],
    NOW - 100
  );
  const body = await read(env);
  assert.equal(version(body, "a").seconds, 180);
  // One hour, written out: a cap the test reads from the code would agree with any cap.
  assert.equal(version(body, "b").seconds, 3600);
  assert.equal(version(body, "a").secondsPerSession, 180);
  assert.equal(version(body, "a").timeShare, 180 / (180 + 3600));
  assert.equal(version(body, "a").timeBrowsers, 1);
});

test("switches are counted by direction, and a browser switching twice is one switcher", async () => {
  // Wrong behaviours: A->B and B->A folded together; switches counted as people.
  const env = freshEnv();
  await send(
    env,
    [
      ev("layout_switch", cid(1), { from: "a", to: "b", via: "menu", sec: 12 }),
      ev("layout_switch", cid(1), { from: "b", to: "a", via: "menu", sec: 40 }),
      ev("layout_switch", cid(1), { from: "a", to: "b", via: "menu", sec: 90 }),
      ev("layout_switch", cid(2), { from: "a", to: "b", via: "menu", sec: 5 }),
      // A switch to itself and one to a design that does not exist are not switches.
      ev("layout_switch", cid(3), { from: "a", to: "a", via: "menu", sec: 5 }),
      ev("layout_switch", cid(3), { from: "a", to: "zz", via: "menu", sec: 5 })
    ],
    NOW - 100
  );
  const body = await read(env);
  assert.deepEqual(body.switches, [
    { from: "a", to: "b", count: 3, browsers: 2 },
    { from: "b", to: "a", count: 1, browsers: 1 }
  ]);
  // Browser 3 pressed the control, even though what it sent was nonsense.
  assert.equal(body.switchers, 3);
});

test("a design the site does not have is counted as ignored, never as a design", async () => {
  // Wrong behaviour: a stale page or a forged post inventing a third column.
  const env = freshEnv();
  await send(
    env,
    [
      ev("layout_session", cid(1), { ver: "a", src: "default", n: 1 }),
      ev("layout_session", cid(2), { ver: "zz", src: "default", n: 1 }),
      ev("layout_session", cid(3), { ver: "zz", src: "default", n: 1 }),
      ev("layout_session", cid(4), { src: "default", n: 1 }),
      ev("layout_time", cid(2), { ver: "zz", sec: 500 })
    ],
    NOW - 100
  );
  const body = await read(env);
  assert.deepEqual(
    body.versions.map((v) => v.ver),
    LAYOUT_VERSIONS
  );
  assert.equal(version(body, "a").sessions, 1);
  assert.equal(version(body, "b").sessions, 0);
  assert.equal(version(body, "b").repeat.rate, null, "no browsers, no rate: not 0%");
  assert.equal(body.ignoredSessions, 3);
  assert.equal(version(body, "a").timeShare, null, "no time on a known design: no share");
});

test("the window leaves older events out, and a nonsense window falls back", async () => {
  const env = freshEnv();
  await send(env, [ev("layout_session", cid(1), { ver: "a", src: "default", n: 1 }, "2026-12-01")], NOW - 40 * DAY);
  await send(env, [ev("layout_session", cid(2), { ver: "a", src: "default", n: 1 })], NOW - 100);
  assert.equal(version(await read(env, "?days=7"), "a").browsers, 1);
  assert.equal(version(await read(env, "?days=90"), "a").browsers, 2);
  assert.equal(windowDays(new URL("https://x.test/?days=nonsense")), 28);
  assert.equal(windowDays(new URL("https://x.test/?days=-4")), 28);
  assert.equal(windowDays(new URL("https://x.test/?days=100000")), 180);
});

test("the daily series has one row per day and design, with that day's visits and seconds", async () => {
  const env = freshEnv();
  await send(
    env,
    [
      ev("layout_session", cid(1), { ver: "a", src: "default", n: 1 }, "2027-01-14"),
      ev("layout_time", cid(1), { ver: "a", sec: 30 }, "2027-01-14"),
      ev("layout_session", cid(1), { ver: "a", src: "default", n: 2 }, "2027-01-15"),
      ev("layout_session", cid(2), { ver: "b", src: "chosen", n: 1 }, "2027-01-15"),
      ev("layout_time", cid(2), { ver: "b", sec: 75 }, "2027-01-15")
    ],
    NOW - 100
  );
  const body = await read(env);
  assert.deepEqual(body.daily, [
    { day: "2027-01-14", ver: "a", sessions: 1, seconds: 30 },
    { day: "2027-01-15", ver: "a", sessions: 1, seconds: 0 },
    { day: "2027-01-15", ver: "b", sessions: 1, seconds: 75 }
  ]);
});

test("one browser claiming thousands of visits counts as the ceiling, not as a crowd", () => {
  // Driven through the fold with the SQL's own clamp expressed as its result:
  // the worker's MIN() is exercised in the next test with real rows.
  const folded = foldVersions({
    sessions: [{ ver: "a", browsers: 1, sessions: MAX_SESSIONS_PER_BROWSER, repeat: 1, multiday: 0 }],
    sources: [],
    times: []
  });
  const [a, b] = finishVersions(folded.versions);
  assert.equal(a.sessions, MAX_SESSIONS_PER_BROWSER);
  assert.equal(a.sessionShare, 1);
  assert.equal(b.sessionShare, 0);
});

test("the SQL clamps a shouting browser's visits", async () => {
  const env = freshEnv();
  const many = [];
  for (let i = 0; i < MAX_SESSIONS_PER_BROWSER + 25; i += 1) {
    many.push(ev("layout_session", cid(1), { ver: "a", src: "default", n: i + 1 }));
  }
  // Straight into the table: the route's own rate limit would stop one
  // browser long before this many posts, and the clamp is the second fence.
  await call(adminGet("/v1/admin/layouts"), env, { now: NOW });
  for (const e of many) {
    await env.DB.prepare("INSERT INTO events (received_at, cid, name, day, tz, props) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
      .bind(NOW - 50, e.cid, e.name, e.day, e.tz, JSON.stringify(e.props))
      .run();
  }
  await env.DB.prepare("INSERT INTO events (received_at, cid, name, day, tz, props) VALUES (?1, ?2, ?3, ?4, ?5, ?6)")
    .bind(NOW - 50, cid(2), "layout_session", "2027-01-15", -300, "not json at all")
    .run();
  const body = await read(env);
  assert.equal(version(body, "a").sessions, MAX_SESSIONS_PER_BROWSER);
  assert.equal(version(body, "a").browsers, 1);
  // The row whose props are not JSON has no design: ignored, and it did not break the query.
  assert.equal(body.ignoredSessions, 1);
});

test("the randomised default is registered as an experiment whose arms are the designs", () => {
  // Wrong behaviour: the experiment's arms drifting from the designs the site
  // has, so half the visitors would be assigned a design that does not exist.
  const preset = EXPERIMENT_PRESETS.site_layout_2026_11;
  assert.deepEqual(preset.arms, LAYOUT_VERSIONS);
  assert.equal(preset.control, "a");
  // The layout events come from both arms, so none may be a metric.
  const metrics = [preset.primary, ...preset.guardrails].map((m) => m.event);
  for (const name of LAYOUT_EVENTS) assert.ok(!metrics.includes(name), `${name} is a metric`);
});
