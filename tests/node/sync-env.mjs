/**
 * A browser for the sync tests: the real js/storage.js, js/account.js and
 * js/sync.js in a vm, talking to the real account worker router
 * (workers/entitlements/src/index.js) over a fake fetch. Only the platform is
 * swapped: localStorage is a Map (with an optional byte quota), timers are a
 * table the test fires by hand, and the worker's mail provider is a function
 * that keeps the sign-in codes. Shared by the sync node tests; not a test itself.
 *
 * Signing in goes through VTAccount.startEmailSignIn / verifyEmailCode, the
 * same calls the account panel's form makes, so the session the sync sees is
 * the one the page really holds.
 */
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { webcrypto } from "node:crypto";
import { handleRequest } from "../../workers/entitlements/src/index.js";
import { createAccountEnv } from "../../workers/entitlements/test/fixtures.mjs";

export const API = "https://entitlements.test";
const ORIGIN = "https://site.test";
const SOURCES = Object.fromEntries(
  ["storage.js", "account.js", "sync.js"].map((f) => [f, readFileSync(new URL(`../../js/${f}`, import.meta.url), "utf8")])
);

/** One account worker (one database), shared by every browser built on it. */
export function createWorker() {
  const env = createAccountEnv({ SITE_ORIGIN: ORIGIN });
  const mail = new Map();
  // The mail provider: keeps the six-digit code each address was sent.
  const fetchImpl = async (url, init) => {
    try {
      const payload = JSON.parse(init.body);
      const code = /\b(\d{6})\b/.exec(payload.text || payload.html || "");
      const to = payload.to && (payload.to[0].email || payload.to[0]);
      if (code) mail.set(String(to), code[1]);
    } catch {
      /* not a mail */
    }
    return new Response("{}", { status: 200 });
  };
  /** Answer one request as the deployed worker would. */
  async function serve(method, path, { body, token } = {}) {
    const headers = { origin: ORIGIN };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (token) headers.authorization = `Bearer ${token}`;
    const res = await handleRequest(
      new Request(API + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }),
      env,
      { fetchImpl }
    );
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
    return { status: res.status, data };
  }
  /** Sign in straight against the worker, as another device would. */
  async function signIn(email) {
    await serve("POST", "/v1/auth/email/start", { body: { email } });
    const v = await serve("POST", "/v1/auth/email/verify", { body: { email, code: mail.get(email) } });
    return { token: v.data.sessionToken, accountId: v.data.account.id };
  }
  /** The account's stored copy of one profile, as that account would read it. */
  async function progress(token, profileId = "default") {
    const r = await serve("GET", `/v1/me/progress?profileId=${encodeURIComponent(profileId)}`, { token });
    return r.data || {};
  }
  /** Write an account's copy of one profile on top of whatever is stored. */
  async function writeProgress(token, doc, profileId = "default") {
    const cur = await progress(token, profileId);
    return serve("PUT", "/v1/me/progress", { token, body: { profileId, baseRev: cur.rev || 0, doc } });
  }
  return { env, mail, serve, signIn, progress, writeProgress };
}

/** A localStorage over a Map; `quota` (characters) makes a write past it throw as a full origin does. */
function makeStorage(store, quota) {
  const used = (skip) => [...store].reduce((n, [k, v]) => n + (k === skip ? 0 : k.length + v.length), 0);
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem(k, v) {
      if (quota && used(k) + k.length + String(v).length > quota) {
        const e = new Error("The quota has been exceeded.");
        e.name = "QuotaExceededError";
        throw e;
      }
      store.set(k, String(v));
    },
    removeItem: (k) => store.delete(k),
    key: (i) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    }
  };
}

/**
 * One browser tab: its own storage, the three real modules, and a fetch to `worker`.
 * @param {object} worker From createWorker().
 * @param {{store?: Map, quota?: number, extra?: object}} [opts] Shared storage (a reload,
 *   or a second tab), a quota in characters, and more window globals (VT_WEEK_ELEMENTS).
 */
export function createBrowser(worker, opts = {}) {
  const store = opts.store || new Map();
  const localStorage = makeStorage(store, opts.quota);
  const log = [];
  const holds = [];
  const fetch = async (url, init) => {
    const path = String(url).slice(API.length);
    const auth = (init.headers && init.headers.authorization) || "";
    const token = auth.replace(/^Bearer /, "");
    const body = init.body === undefined ? undefined : JSON.parse(init.body);
    const entry = { method: init.method, path, token, body };
    log.push(entry);
    const answer = await worker.serve(init.method, path, { body, token: token || undefined });
    entry.status = answer.status;
    const hold = holds.find((h) => !h.used && h.match(entry));
    if (hold) {
      hold.used = true;
      hold.reached(entry);
      await hold.released;
    }
    return new Response(JSON.stringify(answer.data), { status: answer.status, headers: { "content-type": "application/json" } });
  };
  /**
   * Hold the answer to the next request matching `match` (the worker has
   * already acted on it) until `release()`; `held` settles when it is reached.
   */
  function gate(match) {
    let release;
    let reached;
    const released = new Promise((r) => (release = r));
    const held = new Promise((r) => (reached = r));
    holds.push({ match, released, reached, used: false });
    return { release, held };
  }
  const timers = new Map();
  let nextTimer = 1;
  const setTimeout = (fn, ms) => {
    timers.set(nextTimer, { fn, ms: Number(ms) || 0 });
    return nextTimer++;
  };
  const clearTimeout = (id) => timers.delete(id);
  const win = {
    VT_BILLING_CONFIG: { verification: { apiBaseUrl: API } },
    addEventListener: () => {},
    dispatchEvent: () => true,
    ...(opts.extra || {})
  };
  win.window = win;
  const document = { documentElement: { dataset: {} } };
  const ctx = {
    window: win, document, localStorage, fetch, setTimeout, clearTimeout,
    AbortController, Response, Request, Headers, Blob, TextEncoder, URL, Intl,
    console, crypto: webcrypto, CustomEvent: class { constructor(type) { this.type = type; } }
  };
  for (const [name, src] of Object.entries(SOURCES)) runInNewContext(src, ctx, { filename: name });

  const settle = async () => {
    for (let i = 0; i < 300; i += 1) await new Promise((r) => setImmediate(r));
  };
  /** Fire every pending timer set for one of `delays` (ms), then let everything settle. */
  async function fire(delays) {
    for (const [id, t] of [...timers]) {
      if (delays.includes(t.ms)) {
        timers.delete(id);
        t.fn();
      }
    }
    await settle();
  }
  /** Sign in with the emailed code, as the account panel's form does. */
  async function signIn(email) {
    await win.VTAccount.startEmailSignIn(email);
    return win.VTAccount.verifyEmailCode(email, worker.mail.get(email));
  }
  /** One rated take on `exerciseId`, with `marker` in its notes. */
  function take(marker, exerciseId = "ex-1") {
    return win.VTStorage.saveExerciseResult(exerciseId, { score: 7, notes: marker, durationSec: 60 });
  }
  return { win, store, log, gate, timers, fire, settle, signIn, take, localStorage };
}

/** The notes of every take in a sync bag or stored document, sorted. */
export function takes(doc) {
  const out = [];
  for (const row of Object.values((doc && doc.progress) || {})) {
    for (const h of (row && row.history) || []) out.push(h.notes);
  }
  return out.sort();
}
