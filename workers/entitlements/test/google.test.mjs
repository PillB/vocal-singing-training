/**
 * Google Sign-In: ID token verification.
 *
 * Tokens are minted here with a throwaway RSA key and served through a fake
 * JWKS endpoint, so the real verification path runs with no network.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { webcrypto } from "node:crypto";

import {
  GOOGLE_JWKS_URL,
  clearGoogleJwksCache,
  googleClientIds,
  googleConfigured,
  verifyGoogleIdToken
} from "../src/google.js";

const CLIENT_ID = "test-client-id.apps.googleusercontent.com";
const NOW = 1800000000;

/**
 * Encode bytes or text as unpadded base64url.
 * @param {Uint8Array|string} input Value to encode.
 * @returns {string} base64url text.
 */
function b64url(input) {
  const buf = typeof input === "string" ? Buffer.from(input, "utf8") : Buffer.from(input);
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Build a signer plus the JWKS that matches it.
 * @param {string} kid Key id.
 * @returns {Promise<{sign: function, jwks: Object}>} Signer and key set.
 */
async function makeSigner(kid) {
  const pair = await webcrypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const publicJwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  const jwks = { keys: [{ kty: "RSA", n: publicJwk.n, e: publicJwk.e, alg: "RS256", use: "sig", kid }] };

  /**
   * Sign a claim set.
   * @param {Object} claims Payload.
   * @param {Object} [headerPatch] Header overrides.
   * @returns {Promise<string>} Compact JWT.
   */
  const sign = async (claims, headerPatch) => {
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid, ...(headerPatch || {}) }));
    const body = b64url(JSON.stringify(claims));
    const sig = await webcrypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      pair.privateKey,
      Buffer.from(`${header}.${body}`)
    );
    return `${header}.${body}.${b64url(new Uint8Array(sig))}`;
  };
  return { sign, jwks };
}

/**
 * A fetch that serves one JWKS document.
 * @param {Object} jwks Key set.
 * @returns {function} Fetch stand-in.
 */
function jwksFetch(jwks) {
  return async (url) => {
    assert.equal(url, GOOGLE_JWKS_URL);
    return { ok: true, status: 200, json: async () => jwks };
  };
}

/**
 * A plausible Google claim set.
 * @param {Object} [patch] Overrides.
 * @returns {Object} Claims.
 */
function claims(patch) {
  return {
    iss: "https://accounts.google.com",
    aud: CLIENT_ID,
    sub: "115502984750123456789",
    email: "pablo@example.test",
    email_verified: true,
    name: "Pablo",
    locale: "es",
    iat: NOW - 60,
    exp: NOW + 3540,
    ...(patch || {})
  };
}

const env = { GOOGLE_CLIENT_ID: CLIENT_ID };

test("googleClientIds splits a comma-separated list", () => {
  assert.deepEqual(googleClientIds({ GOOGLE_CLIENT_ID: "a, b ,c" }), ["a", "b", "c"]);
  assert.deepEqual(googleClientIds({ GOOGLE_CLIENT_ID: "" }), []);
  assert.deepEqual(googleClientIds({}), []);
  assert.equal(googleConfigured(env), true);
  assert.equal(googleConfigured({}), false);
});

test("a well-formed token from Google is accepted", async () => {
  clearGoogleJwksCache();
  const { sign, jwks } = await makeSigner("kid-1");
  const token = await sign(claims());
  const result = await verifyGoogleIdToken(token, env, { fetchImpl: jwksFetch(jwks), now: NOW });
  assert.equal(result.ok, true);
  assert.equal(result.identity.email, "pablo@example.test");
  assert.equal(result.identity.subject, "115502984750123456789");
  assert.equal(result.identity.name, "Pablo");
  assert.equal(result.identity.locale, "es");
});

test("the bare accounts.google.com issuer is accepted too", async () => {
  clearGoogleJwksCache();
  const { sign, jwks } = await makeSigner("kid-1");
  const token = await sign(claims({ iss: "accounts.google.com" }));
  const result = await verifyGoogleIdToken(token, env, { fetchImpl: jwksFetch(jwks), now: NOW });
  assert.equal(result.ok, true);
});

test("email_verified as the string \"true\" is accepted", async () => {
  clearGoogleJwksCache();
  const { sign, jwks } = await makeSigner("kid-1");
  const token = await sign(claims({ email_verified: "true" }));
  const result = await verifyGoogleIdToken(token, env, { fetchImpl: jwksFetch(jwks), now: NOW });
  assert.equal(result.ok, true);
});

test("a token signed by somebody else is refused", async () => {
  clearGoogleJwksCache();
  const real = await makeSigner("kid-1");
  const impostor = await makeSigner("kid-1");
  const token = await impostor.sign(claims());
  const result = await verifyGoogleIdToken(token, env, { fetchImpl: jwksFetch(real.jwks), now: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "bad_signature");
});

test("a tampered payload is refused", async () => {
  clearGoogleJwksCache();
  const { sign, jwks } = await makeSigner("kid-1");
  const token = await sign(claims());
  const [header, , signature] = token.split(".");
  const forged = `${header}.${b64url(JSON.stringify(claims({ email: "victim@example.test" })))}.${signature}`;
  const result = await verifyGoogleIdToken(forged, env, { fetchImpl: jwksFetch(jwks), now: NOW });
  assert.equal(result.reason, "bad_signature");
});

test("a token for another client id is refused", async () => {
  clearGoogleJwksCache();
  const { sign, jwks } = await makeSigner("kid-1");
  const token = await sign(claims({ aud: "someone-elses-app.apps.googleusercontent.com" }));
  const result = await verifyGoogleIdToken(token, env, { fetchImpl: jwksFetch(jwks), now: NOW });
  assert.equal(result.reason, "bad_audience");
});

test("a wrong issuer is refused", async () => {
  clearGoogleJwksCache();
  const { sign, jwks } = await makeSigner("kid-1");
  const token = await sign(claims({ iss: "https://evil.test" }));
  const result = await verifyGoogleIdToken(token, env, { fetchImpl: jwksFetch(jwks), now: NOW });
  assert.equal(result.reason, "bad_issuer");
});

test("an expired token is refused past the skew allowance", async () => {
  clearGoogleJwksCache();
  const { sign, jwks } = await makeSigner("kid-1");
  const token = await sign(claims({ exp: NOW - 400 }));
  const result = await verifyGoogleIdToken(token, env, { fetchImpl: jwksFetch(jwks), now: NOW });
  assert.equal(result.reason, "expired");
});

test("an unverified email is refused", async () => {
  clearGoogleJwksCache();
  const { sign, jwks } = await makeSigner("kid-1");
  const token = await sign(claims({ email_verified: false }));
  const result = await verifyGoogleIdToken(token, env, { fetchImpl: jwksFetch(jwks), now: NOW });
  assert.equal(result.reason, "email_not_verified");
});

test("an alg=none token is refused before any key lookup", async () => {
  clearGoogleJwksCache();
  const header = b64url(JSON.stringify({ alg: "none", typ: "JWT", kid: "kid-1" }));
  const body = b64url(JSON.stringify(claims()));
  const result = await verifyGoogleIdToken(`${header}.${body}.`, env, {
    fetchImpl: async () => assert.fail("must not fetch keys for an unsigned token"),
    now: NOW
  });
  assert.equal(result.reason, "bad_header");
});

test("an unknown key id is refused", async () => {
  clearGoogleJwksCache();
  const { sign } = await makeSigner("kid-1");
  const other = await makeSigner("kid-2");
  const token = await sign(claims());
  const result = await verifyGoogleIdToken(token, env, { fetchImpl: jwksFetch(other.jwks), now: NOW });
  assert.equal(result.reason, "unknown_key");
});

test("garbage input is refused without throwing", async () => {
  clearGoogleJwksCache();
  for (const bad of ["", "a.b", "....", "x".repeat(9000), null, undefined]) {
    const result = await verifyGoogleIdToken(bad, env, { fetchImpl: async () => ({ ok: false }), now: NOW });
    assert.equal(result.ok, false);
  }
});

test("an unreachable JWKS endpoint fails closed", async () => {
  clearGoogleJwksCache();
  const { sign } = await makeSigner("kid-1");
  const token = await sign(claims());
  const result = await verifyGoogleIdToken(token, env, {
    fetchImpl: async () => ({ ok: false, status: 503 }),
    now: NOW
  });
  assert.equal(result.reason, "jwks_unavailable");
});

test("with no client id configured nothing verifies", async () => {
  clearGoogleJwksCache();
  const { sign } = await makeSigner("kid-1");
  const token = await sign(claims());
  const result = await verifyGoogleIdToken(token, {}, { fetchImpl: async () => ({ ok: false }), now: NOW });
  assert.equal(result.reason, "google_not_configured");
});

test("the key set is fetched once and reused", async () => {
  clearGoogleJwksCache();
  const { sign, jwks } = await makeSigner("kid-1");
  const token = await sign(claims());
  let fetches = 0;
  const counting = async () => {
    fetches += 1;
    return { ok: true, status: 200, json: async () => jwks };
  };
  await verifyGoogleIdToken(token, env, { fetchImpl: counting, now: NOW });
  await verifyGoogleIdToken(token, env, { fetchImpl: counting, now: NOW + 10 });
  assert.equal(fetches, 1);

  // Past the cache window it is fetched again, so a key rotation lands.
  await verifyGoogleIdToken(token, env, { fetchImpl: counting, now: NOW + 7200 });
  assert.equal(fetches, 2);
});
