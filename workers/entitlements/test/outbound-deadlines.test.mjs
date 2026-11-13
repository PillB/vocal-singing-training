/**
 * Every call the worker makes to another service carries a deadline.
 *
 * The login-code email and Google's signing keys had none, and nothing else
 * bounds those waits: the sign-in page sends its request with no timeout of
 * its own, so a provider that hung kept the person's button spinning with no
 * answer. Mercado Pago's API read had one (MP_API_TIMEOUT_MS) that no test
 * watched fire.
 *
 * The provider here behaves as `fetch` does against a server that never
 * answers: it settles only when its signal aborts, with the signal's reason.
 * The tests set a 50 ms deadline through `timeoutMs` and wait for it to fire
 * for real, inside a one-second guard; a missing signal, or one that never
 * aborts, leaves the call hung and the guard turns that red. (An earlier
 * version answered as soon as it saw any signal, so a signal that never fired
 * passed too; Codex review on PR #38.)
 */

import assert from "node:assert/strict";
import test from "node:test";

import { deadlineMs } from "../src/deadline.js";
import { EMAIL_SEND_TIMEOUT_MS, sendLoginCode } from "../src/email.js";
import { GOOGLE_JWKS_TIMEOUT_MS, clearGoogleJwksCache, fetchGoogleJwks, verifyGoogleIdToken } from "../src/google.js";
import { MP_API_TIMEOUT_MS, fetchMercadoPagoResource } from "../src/mercadopago.js";
import { createAccountEnv, createTestEnv } from "./fixtures.mjs";

const HUNG = "hung";
const DEADLINE_MS = 50;

/**
 * A provider that never answers: only its signal aborting ends the wait, and
 * then with the signal's reason, as fetch rejects.
 * @param {AbortSignal[]} seen Collects the signals that fired.
 * @returns {function(string, Object): Promise<never>} fetch-shaped.
 */
function hungProvider(seen) {
  return (url, init) =>
    new Promise((resolve, reject) => {
      const signal = init && init.signal;
      if (!signal || typeof signal.addEventListener !== "function") {
        return;
      }
      signal.addEventListener("abort", () => {
        seen.push(signal);
        reject(signal.reason);
      });
    });
}

/** The call's answer, or HUNG if it has none within a second. */
function within(promise) {
  let timer;
  const guard = new Promise((resolve) => {
    timer = setTimeout(() => resolve(HUNG), 1000);
  });
  return Promise.race([promise, guard]).finally(() => clearTimeout(timer));
}

/** A JWT-shaped Google token with a key id, enough to reach the key fetch. */
function tokenWithKid() {
  const part = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${part({ alg: "RS256", kid: "k1" })}.${part({ iss: "accounts.google.com" })}.sig`;
}

test("control: the harness sees a call whose signal never fires as hung", async () => {
  // Without this, a provider that answered on its own would make every test
  // below pass whatever the deadline did.
  const seen = [];
  const never = new AbortController().signal;
  assert.equal(await within(hungProvider(seen)("https://x.test", { signal: never })), HUNG);
  assert.equal(await within(hungProvider(seen)("https://x.test", {})), HUNG);
  assert.equal(seen.length, 0);
});

test("a login-code email whose provider hangs is cut off when its deadline fires, and reported", async () => {
  const seen = [];
  const env = createAccountEnv();
  const answer = await within(
    sendLoginCode(env, "p@example.test", "123456", 10, { fetchImpl: hungProvider(seen), timeoutMs: DEADLINE_MS })
  );
  assert.notEqual(answer, HUNG, "the send has a deadline that fires");
  assert.deepEqual(answer, { ok: false, reason: "email_transport_error", provider: "resend" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].reason && seen[0].reason.name, "TimeoutError", "it was the deadline, not something else");
});

test("control: a provider that answers is not cut off by the deadline", async () => {
  const env = createAccountEnv();
  let given = null;
  const answer = await sendLoginCode(env, "p@example.test", "123456", 10, {
    timeoutMs: DEADLINE_MS,
    fetchImpl: async (url, init) => {
      given = init.signal;
      return { ok: true, status: 200 };
    }
  });
  assert.deepEqual(answer, { ok: true, provider: "resend", status: 200 });
  assert.equal(given.aborted, false, "the deadline had not fired");
});

test("Google's key fetch is cut off when its deadline fires, so a sign-in waiting on it is refused, not left open", async () => {
  // verifyGoogleIdToken answers any failure of this fetch with
  // "jwks_unavailable"; what it needed was for the fetch to fail at all.
  clearGoogleJwksCache();
  const seen = [];
  const answer = await within(
    fetchGoogleJwks({ fetchImpl: hungProvider(seen), now: 1800000000, timeoutMs: DEADLINE_MS }).catch((error) => error)
  );
  clearGoogleJwksCache();
  assert.notEqual(answer, HUNG, "the key fetch has a deadline that fires");
  assert.equal(answer && answer.name, "TimeoutError");
  assert.equal(seen.length, 1);
  const refused = await verifyGoogleIdToken(tokenWithKid(), createAccountEnv(), {
    fetchImpl: async () => Promise.reject(answer),
    now: 1800000000
  });
  clearGoogleJwksCache();
  assert.deepEqual(refused, { ok: false, reason: "jwks_unavailable" });
});

test("a Mercado Pago API read that hangs is cut off when its deadline fires, and reported as unreachable", async () => {
  // Mercado Pago waits about 22 s for the webhook's answer and then counts the
  // delivery as failed. "api_unreachable" is answered 500 inside that window,
  // so it retries cleanly instead of leaving the outcome to the runtime.
  const seen = [];
  const answer = await within(
    fetchMercadoPagoResource("payment", "4242", createTestEnv(), { fetchImpl: hungProvider(seen), timeoutMs: DEADLINE_MS })
  );
  assert.notEqual(answer, HUNG, "the read has a deadline that fires");
  assert.deepEqual(answer, { ok: false, status: 0, reason: "api_unreachable" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].reason && seen[0].reason.name, "TimeoutError", "it was the deadline, not something else");
});

test("without a test deadline, each call uses its own default, and the defaults are ones a person would wait for", () => {
  assert.equal(deadlineMs(undefined, EMAIL_SEND_TIMEOUT_MS), EMAIL_SEND_TIMEOUT_MS);
  assert.equal(deadlineMs({ timeoutMs: 0 }, GOOGLE_JWKS_TIMEOUT_MS), GOOGLE_JWKS_TIMEOUT_MS);
  assert.equal(deadlineMs({ timeoutMs: -5 }, 7), 7);
  assert.equal(deadlineMs({ timeoutMs: "soon" }, 7), 7);
  assert.equal(deadlineMs({ timeoutMs: 50 }, 7), 50);
  // Long enough for a slow but working provider (Resend and Google answer in
  // well under a second), short enough that the page answers before a person
  // gives up on it.
  assert.ok(EMAIL_SEND_TIMEOUT_MS >= 3000 && EMAIL_SEND_TIMEOUT_MS <= 15000);
  assert.ok(GOOGLE_JWKS_TIMEOUT_MS >= 2000 && GOOGLE_JWKS_TIMEOUT_MS <= 10000);
  // Mercado Pago's API answers in well under a second; the webhook has about
  // 22 s in all, and the ledger's own work has to fit after the read.
  assert.ok(MP_API_TIMEOUT_MS >= 2000 && MP_API_TIMEOUT_MS <= 15000);
});
