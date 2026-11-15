/**
 * Shared kit for the trial-length QA tests (round 4, PR 26, attacker "trial").
 * Not a test file. Drop it next to the *.test.mjs files that import it.
 *
 * HAND-WRITTEN GOLDEN VECTORS. The arm of an account is
 *   parity( first 8 hex digits of HMAC-SHA256(key, "trial-arm:v1:trial_len_2026_11:" + id) )
 * with parity 0 = "seven" and parity 1 = "fourteen" (TRIAL_ARMS order). The values
 * below were computed OUTSIDE the code under test with
 *   printf 'trial-arm:v1:trial_len_2026_11:%s' ID | openssl dgst -sha256 -hmac KEY -hex
 * and pasted here, so no expectation in these tests is computed by the worker.
 */

import { createSession } from "../src/accounts.js";
import { ensureSchema, resetSchemaMemo } from "../src/db.js";
import { handleRequest } from "../src/index.js";
import { createAccountEnv, TEST_ORIGIN } from "./fixtures.mjs";

export const DAY = 86400;
export const NOW = 1762000000;
export const BASE = "https://worker.test";
export { TEST_ORIGIN };

/** The worker secret the golden vectors were made with. */
export const KEY = "trial-arm-test-key";
/** A second secret; of the ids below only acct_fourteen1 changes arm under it. */
export const KEY2 = "k2";

/** The experiment on, with its secret. */
export const ON = { TRIAL_LEN_EXPERIMENT: "on", LICENSE_ID_KEY: KEY };

/** Ids whose arm under KEY is "seven" (openssl parity 0). */
export const SEVEN_IDS = ["acc_3", "acc_5", "acct_seven1", "acct_fourteen1", "acct_fourteen2"];
/** Ids whose arm under KEY is "fourteen" (openssl parity 1). */
export const FOURTEEN_IDS = ["acc_0", "acc_1", "acc_2", "acc_4", "acct_seven2"];

/**
 * Golden arms with the secret being the SIGNING key only (no LICENSE_ID_KEY):
 * the key is then "license-id:SIGNKEY". 0 = seven, 1 = fourteen.
 */
export const SIGNKEY_GOLDEN = { a: "seven", b: "fourteen", c: "fourteen", d: "seven", e: "fourteen", f: "seven", g: "fourteen", h: "seven" };

/**
 * Fresh env with the schema in place.
 * @param {Object} [overrides] Env overrides.
 * @returns {Promise<Object>} Env.
 */
export async function freshEnv(overrides) {
  resetSchemaMemo();
  const env = createAccountEnv(overrides);
  await ensureSchema(env.DB);
  return env;
}

/**
 * Insert an account with a CHOSEN id (the worker mints random ones) and open a
 * session for it, so the arm of the account is known in advance.
 * @param {Object} env Env.
 * @param {string} id Account id.
 * @param {string} [email] Address.
 * @param {string} [role] "member" | "admin".
 * @returns {Promise<string>} Session token.
 */
export async function seedAccount(env, id, email, role) {
  const mail = email || `${id}@example.test`;
  await env.DB.prepare(
    `INSERT INTO accounts (id, email, email_normalized, display_name, locale, role,
                           trial_used_at, disabled_at, created_at, updated_at)
     VALUES (?1, ?2, ?2, NULL, NULL, ?3, NULL, NULL, ?4, ?4)`
  )
    .bind(id, mail, role || "member", NOW)
    .run();
  return (await createSession(env.DB, id, NOW)).token;
}

/**
 * Call the worker with full control over headers, query and raw body.
 * @param {string} method HTTP method.
 * @param {string} path Path, query included.
 * @param {Object} opts `{env, token, headers, body, rawBody, contentType, now}`.
 * @returns {Promise<{status: number, body: Object|null}>} Result.
 */
export async function call(method, path, opts) {
  const headers = { ...(opts.headers || {}) };
  if (opts.token) {
    headers.authorization = `Bearer ${opts.token}`;
  }
  let body;
  if (opts.rawBody !== undefined) {
    body = opts.rawBody;
    headers["content-type"] = opts.contentType || "text/plain";
  } else if (opts.body !== undefined) {
    body = JSON.stringify(opts.body);
    headers["content-type"] = "application/json";
  }
  const response = await handleRequest(
    new Request(`${BASE}${path}`, { method, headers, ...(body === undefined ? {} : { body }) }),
    opts.env,
    { now: opts.now === undefined ? NOW + 10 : opts.now, ...(opts.deps || {}) }
  );
  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  return { status: response.status, body: parsed };
}

/**
 * Trial grant rows of an account, straight from SQL.
 * @param {Object} env Env.
 * @param {string} accountId Account id.
 * @returns {Promise<Object[]>} Rows.
 */
export async function trialRows(env, accountId) {
  const res = await env.DB.prepare("SELECT * FROM grants WHERE account_id = ?1 AND kind = 'trial' ORDER BY created_at, id")
    .bind(accountId)
    .all();
  return res.results;
}

/**
 * A browser id that passes the worker's validation.
 * @param {number} i Index.
 * @param {string} [prefix] One letter.
 * @returns {string} 16 characters.
 */
export function cid(i, prefix) {
  return `${prefix || "c"}${String(i).padStart(15, "0")}`;
}
