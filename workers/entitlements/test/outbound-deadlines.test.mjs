/**
 * Every call the worker makes to another service carries a deadline.
 *
 * Mercado Pago's read already did (MP_API_TIMEOUT_MS). The login-code email
 * and Google's signing keys did not, and nothing else bounds those waits: the
 * sign-in page sends its request with no timeout of its own, so a provider
 * that hung kept the person's button spinning with no answer.
 *
 * The provider here behaves as `fetch` does: it settles only when its signal
 * fires. Given no signal it never settles, which is the defect, and the race
 * against a one-second guard turns that into a red test rather than a hung
 * run. Given a signal, it answers as the deadline would, at once, so the
 * test does not wait the real ten seconds.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { EMAIL_SEND_TIMEOUT_MS, sendLoginCode } from "../src/email.js";
import { GOOGLE_JWKS_TIMEOUT_MS, clearGoogleJwksCache, verifyGoogleIdToken } from "../src/google.js";
import { createAccountEnv } from "./fixtures.mjs";

const HUNG = "hung";

/**
 * A provider that never answers: only a signal ends the wait, as a deadline
 * would, with fetch's TimeoutError.
 * @param {AbortSignal[]} seen Collects the signals it was given.
 * @returns {function(string, Object): Promise<never>} fetch-shaped.
 */
function hungProvider(seen) {
  return (url, init) => {
    const signal = init && init.signal;
    if (!(signal instanceof AbortSignal) || signal.aborted) {
      return new Promise(() => {});
    }
    seen.push(signal);
    return Promise.reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
  };
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

test("a login-code email whose provider hangs is cut off and reported, not left spinning", async () => {
  const seen = [];
  const env = createAccountEnv();
  const answer = await within(sendLoginCode(env, "p@example.test", "123456", 10, { fetchImpl: hungProvider(seen) }));
  assert.notEqual(answer, HUNG, "the send has a deadline");
  assert.deepEqual(answer, { ok: false, reason: "email_transport_error", provider: "resend" });
  assert.equal(seen.length, 1);
  assert.ok(EMAIL_SEND_TIMEOUT_MS >= 3000 && EMAIL_SEND_TIMEOUT_MS <= 15000, "long enough for a slow send, short enough to wait for");
});

test("control: a provider that answers is not cut off by the deadline", async () => {
  const env = createAccountEnv();
  let given = null;
  const answer = await sendLoginCode(env, "p@example.test", "123456", 10, {
    fetchImpl: async (url, init) => {
      given = init.signal;
      return { ok: true, status: 200 };
    }
  });
  assert.deepEqual(answer, { ok: true, provider: "resend", status: 200 });
  assert.equal(given.aborted, false, "the deadline had not fired");
});

test("a Google sign-in whose key fetch hangs is refused at once, not left open", async () => {
  clearGoogleJwksCache();
  const seen = [];
  const env = createAccountEnv();
  const answer = await within(verifyGoogleIdToken(tokenWithKid(), env, { fetchImpl: hungProvider(seen), now: 1800000000 }));
  clearGoogleJwksCache();
  assert.notEqual(answer, HUNG, "the key fetch has a deadline");
  assert.deepEqual(answer, { ok: false, reason: "jwks_unavailable" });
  assert.equal(seen.length, 1);
  assert.ok(GOOGLE_JWKS_TIMEOUT_MS >= 2000 && GOOGLE_JWKS_TIMEOUT_MS <= 10000);
});
