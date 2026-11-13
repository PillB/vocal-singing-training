/**
 * Every call the worker makes to another service carries a deadline.
 *
 * Mercado Pago's read already did (MP_API_TIMEOUT_MS). The login-code email
 * and Google's signing keys did not, and nothing else bounds those waits: the
 * sign-in page sends its request with no timeout of its own, so a provider
 * that hung kept the person's button spinning with no answer.
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

import { EMAIL_SEND_TIMEOUT_MS, deadlineMs, sendLoginCode } from "../src/email.js";
import { GOOGLE_JWKS_TIMEOUT_MS, clearGoogleJwksCache, verifyGoogleIdToken } from "../src/google.js";
import { createAccountEnv } from "./fixtures.mjs";

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

test("a Google sign-in whose key fetch hangs is refused when its deadline fires, not left open", async () => {
  clearGoogleJwksCache();
  const seen = [];
  const env = createAccountEnv();
  const answer = await within(
    verifyGoogleIdToken(tokenWithKid(), env, { fetchImpl: hungProvider(seen), now: 1800000000, timeoutMs: DEADLINE_MS })
  );
  clearGoogleJwksCache();
  assert.notEqual(answer, HUNG, "the key fetch has a deadline that fires");
  assert.deepEqual(answer, { ok: false, reason: "jwks_unavailable" });
  assert.equal(seen.length, 1);
  assert.equal(seen[0].reason && seen[0].reason.name, "TimeoutError");
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
});
