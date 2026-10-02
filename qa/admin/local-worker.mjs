/**
 * The entitlements worker, running in this Node process with a real SQLite
 * database behind it — for trying the admin page with made-up accounts.
 *
 * This is the worker's own `handleRequest`, its own SQL and its own signing
 * code. Only the platform is swapped: D1 becomes `node:sqlite` through the same
 * adapter the worker tests use, and KV becomes a Map. So what the admin page
 * does here is what it does against the deployed worker, minus Google: the
 * sandbox signs people in by writing the session row Google sign-in would
 * write, after Google has vouched for the address.
 *
 * Used by tests/admin.spec.js, qa/admin/capture-guide-shots.mjs and
 * qa/admin/sandbox.mjs. Nothing here is loaded by the site.
 */

import { webcrypto } from "node:crypto";

import { handleRequest } from "../../workers/entitlements/src/index.js";
import { ensureAccount, createSession, recordIdentity, adminEmails } from "../../workers/entitlements/src/accounts.js";
import { ensureSchema } from "../../workers/entitlements/src/db.js";
import { createD1 } from "../../workers/entitlements/test/d1-fake.mjs";
import { createFakeKv } from "../../workers/entitlements/test/fixtures.mjs";

/** The production Google client id (public: it ships in the page). */
export const GOOGLE_CLIENT_ID = "636631700114-g30d6j9nu6khf0k0in0ei0jjct4ki6bc.apps.googleusercontent.com";

/**
 * Make a throwaway signing key pair, the same shape setup.sh makes.
 * @returns {Promise<{privateKeyB64: string, publicKeyJwk: Object}>} Key material.
 */
async function makeKeys() {
  const pair = await webcrypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const pkcs8 = await webcrypto.subtle.exportKey("pkcs8", pair.privateKey);
  const jwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  return {
    privateKeyB64: Buffer.from(new Uint8Array(pkcs8)).toString("base64"),
    publicKeyJwk: {
      kty: "EC",
      crv: "P-256",
      x: jwk.x,
      y: jwk.y,
      alg: "ES256",
      use: "sig",
      kid: "k1",
      key_ops: ["verify"]
    }
  };
}

/**
 * Start a local worker.
 *
 * Configured like production (Google sign-in only, a 7-day trial, 72-hour
 * licences, anonymous statistics on), except for the site origin and the
 * admin list, which are the sandbox's own. tests/admin.spec.js checks the
 * trial length against wrangler.toml, so the two cannot drift apart.
 *
 * @param {{origin: string, admins?: string, now?: () => number}} options
 *   `origin` is where the site is served from (the worker's only CORS origin
 *   and the licence audience). `now` overrides the clock, in unix seconds.
 * @returns {Promise<Object>} The worker handle.
 */
export async function createLocalWorker(options) {
  const opts = options || {};
  const keys = await makeKeys();
  const env = {
    SITE_ORIGIN: opts.origin,
    LICENSE_KEY_ID: "k1",
    LICENSE_TTL_SECONDS: "259200",
    LICENSE_PRIVATE_KEY_PKCS8_B64: keys.privateKeyB64,
    TRIAL_DAYS: "7",
    EVENTS_ENABLED: "true",
    ADMIN_EMAILS: opts.admins || "admin@example.com",
    GOOGLE_CLIENT_ID,
    EMAIL_PROVIDER: "",
    EMAIL_FROM: "",
    EMAIL_FROM_NAME: "Vocal Studio",
    ENTITLEMENTS: createFakeKv(),
    DB: createD1()
  };
  await ensureSchema(env.DB);
  const clock = typeof opts.now === "function" ? opts.now : () => Math.floor(Date.now() / 1000);

  /**
   * Answer one request exactly as the deployed worker would.
   * @param {Request} request Fetch request.
   * @returns {Promise<Response>} Response.
   */
  async function fetchWorker(request) {
    try {
      return await handleRequest(request, env, { now: clock() });
    } catch (error) {
      return new Response(JSON.stringify({ ok: false, reason: "internal_error", message: String(error && error.message) }), {
        status: 500,
        headers: { "content-type": "application/json" }
      });
    }
  }

  /**
   * Sign somebody in the way the Google route does once Google has vouched
   * for the address: find or create the account, record a Google identity,
   * open a session.
   * @param {string} email Address.
   * @param {{displayName?: string, at?: number}} [extra] Name and time.
   * @returns {Promise<{token: string, expiresAt: number, accountId: string}>} Session.
   */
  async function signIn(email, extra) {
    const at = (extra && extra.at) || clock();
    const { account } = await ensureAccount(
      env.DB,
      email,
      { displayName: extra && extra.displayName, locale: "es", adminEmails: adminEmails(env) },
      at
    );
    await recordIdentity(env.DB, account.id, "google", `sandbox-${account.id}`, at);
    const session = await createSession(env.DB, account.id, at);
    return { token: session.token, expiresAt: session.expiresAt, accountId: account.id };
  }

  /**
   * Call a route with JSON, as a signed-in browser would.
   * @param {string} method HTTP method.
   * @param {string} path Path and query.
   * @param {{token?: string, body?: Object}} [call] Session and body.
   * @returns {Promise<{status: number, body: Object}>} Result.
   */
  async function call(method, path, call) {
    const c = call || {};
    const headers = { origin: opts.origin };
    if (c.body !== undefined) headers["content-type"] = "application/json";
    if (c.token) headers.authorization = `Bearer ${c.token}`;
    const response = await fetchWorker(
      new Request(`http://worker.local${path}`, {
        method,
        headers,
        body: c.body === undefined ? undefined : JSON.stringify(c.body)
      })
    );
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, body };
  }

  /**
   * Run SQL straight against the database, for seeding history the routes
   * cannot create on demand (a trial that ended last month, say).
   * @param {string} sql Statement.
   * @param {...unknown} params Parameters.
   * @returns {Promise<Object>} D1 result.
   */
  async function sql(statement, ...params) {
    return env.DB.prepare(statement).bind(...params).run();
  }

  return {
    env,
    publicKeyJwk: keys.publicKeyJwk,
    fetch: fetchWorker,
    signIn,
    call,
    sql,
    now: clock
  };
}

/**
 * Made-up people for the sandbox and the guide's screenshots. Every address is
 * on example.com, which is reserved and reaches nobody.
 */
export const PEOPLE = {
  admin: { email: "admin@example.com", displayName: "Admin (prueba)" },
  ana: { email: "ana.tester@example.com", displayName: "Ana Tester" },
  bruno: { email: "bruno.tester@example.com", displayName: "Bruno Tester" },
  carla: { email: "carla@example.com", displayName: "Carla" },
  diego: { email: "diego@example.com", displayName: "Diego" }
};

const DAY = 86400;

/**
 * Fill the database with a small, believable beta: an admin, a tester with a
 * gifted month, one whose seven-day trial ended ten days ago, one invited who
 * has not signed in, and a gift code half used.
 * @param {Object} worker Handle from createLocalWorker.
 * @returns {Promise<{adminToken: string, tokens: Object, codes: Object}>} Sessions and codes.
 */
export async function seedBeta(worker) {
  const now = worker.now();
  const admin = await worker.signIn(PEOPLE.admin.email, { displayName: PEOPLE.admin.displayName, at: now - 20 * DAY });
  const tokens = { admin: admin.token };

  // Bruno: signed in two weeks ago, gifted a month, practising.
  const bruno = await worker.signIn(PEOPLE.bruno.email, { displayName: PEOPLE.bruno.displayName, at: now - 14 * DAY });
  tokens.bruno = bruno.token;
  await worker.call("POST", "/v1/admin/grants", {
    token: admin.token,
    body: { email: PEOPLE.bruno.email, days: 30, note: "Beta ronda 1" }
  });

  // Carla: used her free trial, which ended ten days ago.
  const carla = await worker.signIn(PEOPLE.carla.email, { displayName: PEOPLE.carla.displayName, at: now - 40 * DAY });
  tokens.carla = carla.token;
  await worker.call("POST", "/v1/me/trial", { token: carla.token });
  await worker.sql("UPDATE grants SET starts_at = ?1, ends_at = ?2 WHERE account_id = ?3 AND kind = 'trial'", now - 17 * DAY, now - 10 * DAY, carla.accountId);
  await worker.sql("UPDATE accounts SET trial_used_at = ?1 WHERE id = ?2", now - 17 * DAY, carla.accountId);

  // Diego: invited by email, has not signed in yet.
  await worker.call("POST", "/v1/admin/grants", {
    token: admin.token,
    body: { email: PEOPLE.diego.email, days: 30, note: "Familia" }
  });

  // A code for a group chat, used by two of five.
  const group = await worker.call("POST", "/v1/admin/gift-codes", {
    token: admin.token,
    body: { days: 30, maxRedemptions: 5, note: "Coro del barrio" }
  });
  const code = group.body && group.body.giftCode && group.body.giftCode.code;
  for (const who of ["coro1@example.com", "coro2@example.com"]) {
    const s = await worker.signIn(who, { at: now - 3 * DAY });
    await worker.call("POST", "/v1/me/redeem", { token: s.token, body: { code } });
  }

  return { adminToken: admin.token, tokens, codes: { group: code } };
}

/**
 * Made-up browsers walking the account funnel, sent through the worker's own
 * event route the way the site sends them, so the admin page's Statistics
 * section has something to show. Forty browsers open the site and fewer get
 * through each step; one then presses the delete switch, and one arrives with
 * Global Privacy Control on, so both show in the arrival counters.
 *
 * Every id is made up and random-looking only in shape; nothing here is a
 * real browser.
 * @param {Object} worker Handle from createLocalWorker.
 * @returns {Promise<{accepted: number}>} Events the worker kept.
 */
export async function seedStats(worker) {
  const origin = worker.env.SITE_ORIGIN;
  const post = async (path, body, extra) => {
    const response = await worker.fetch(
      new Request(`http://worker.local${path}`, {
        method: "POST",
        headers: {
          origin,
          "content-type": "text/plain;charset=UTF-8",
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
          ...(extra || {})
        },
        body: JSON.stringify(body)
      })
    );
    return response.json().catch(() => null);
  };
  const day = new Date(worker.now() * 1000).toISOString().slice(0, 10);
  // How many browsers reach each step, in funnel order.
  const reach = [
    ["app_open", 40],
    ["account_panel_open", 14],
    ["signin_start", 8],
    ["signin_success", 6],
    ["trial_cta_view", 5],
    ["trial_click", 4],
    ["trial_result", 4],
    ["trial_first_practice", 2]
  ];
  const panelStates = ["offered", "offered", "offered", "offered", "offered", "offered", "offered", "offered", "offered", "signed_in", "signed_in", "signed_in", "blocked", "blocked"];
  const outcomes = ["started", "started", "needs_account", "trial_used"];
  let accepted = 0;
  for (let i = 0; i < 40; i++) {
    const cid = `sbx${String(i).padStart(5, "0")}`;
    const events = [];
    reach.forEach(([name, n]) => {
      if (i >= n) return;
      const props = {};
      if (name === "account_panel_open") props.state = panelStates[i];
      if (name === "trial_result") props.outcome = outcomes[i];
      events.push({ name, cid, day, tz: 300, props });
    });
    const res = await post("/v1/events", { events });
    accepted += (res && res.accepted) || 0;
  }
  // One browser that later asked for its statistics to be deleted.
  const gone = "sbxforget1";
  await post("/v1/events", { events: [{ name: "app_open", cid: gone, day, tz: 300, props: {} }] });
  await post("/v1/events/forget", { cid: gone });
  // One browser that sends Global Privacy Control: refused, counted, not kept.
  await post("/v1/events", { events: [{ name: "app_open", cid: "sbxgpc001", day, tz: 300, props: {} }] }, { "sec-gpc": "1" });
  return { accepted };
}
