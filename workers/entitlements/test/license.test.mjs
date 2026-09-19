import test from "node:test";
import assert from "node:assert/strict";

import {
  base64UrlToBytes,
  base64UrlToString,
  buildJwks,
  buildTokenPayload,
  bytesToBase64Url,
  computeExpiry,
  createLicenseToken,
  generateLicenseId,
  isLicenseIdShape,
  isTokenIssuable,
  resolveKeyId,
  resolveTtlSeconds,
  signPayload,
  stringToBase64Url,
  timingSafeEqual,
  verifyLicenseToken
} from "../src/license.js";
import {
  createEntitlement,
  createTestEnv,
  TEST_ORIGIN,
  TEST_PRIVATE_KEY_B64_ALT
} from "./fixtures.mjs";

test("base64url helpers round-trip bytes and strings without padding", () => {
  const bytes = new Uint8Array([0, 1, 250, 251, 252, 253, 254, 255]);
  const encoded = bytesToBase64Url(bytes);
  assert.equal(/[=+/]/.test(encoded), false);
  assert.deepEqual(Array.from(base64UrlToBytes(encoded)), Array.from(bytes));
  const text = "plan=pro_yearly Ünïcode ✓";
  assert.equal(base64UrlToString(stringToBase64Url(text)), text);
});

test("generateLicenseId produces a 43-char base64url id", () => {
  const id = generateLicenseId();
  assert.equal(id.length, 43);
  assert.equal(isLicenseIdShape(id), true);
  assert.equal(isLicenseIdShape("short"), false);
  assert.equal(isLicenseIdShape(`${id}!`), false);
  assert.notEqual(generateLicenseId(), id);
});

test("resolveTtlSeconds defaults, clamps and parses", () => {
  assert.equal(resolveTtlSeconds({}), 259200);
  assert.equal(resolveTtlSeconds({ LICENSE_TTL_SECONDS: "600" }), 600);
  assert.equal(resolveTtlSeconds({ LICENSE_TTL_SECONDS: "1" }), 60);
  assert.equal(resolveTtlSeconds({ LICENSE_TTL_SECONDS: "99999999" }), 2592000);
  assert.equal(resolveTtlSeconds({ LICENSE_TTL_SECONDS: "nonsense" }), 259200);
});

test("resolveKeyId falls back to k1", () => {
  assert.equal(resolveKeyId({}), "k1");
  assert.equal(resolveKeyId({ LICENSE_KEY_ID: "  " }), "k1");
  assert.equal(resolveKeyId({ LICENSE_KEY_ID: "k9" }), "k9");
});

test("token signs and verifies, with the documented header and claims", async () => {
  const env = createTestEnv();
  const now = 1770000000;
  const entitlement = createEntitlement({ periodEnd: now + 86400 });
  const { token, payload } = await createLicenseToken(entitlement, env, now);

  const parts = token.split(".");
  assert.equal(parts.length, 3);
  const header = JSON.parse(base64UrlToString(parts[0]));
  assert.deepEqual(header, { alg: "ES256", typ: "VSL", kid: "k-test" });
  assert.equal(base64UrlToBytes(parts[2]).length, 64, "raw P-1363 signature is 64 bytes");

  assert.equal(payload.iss, "vocal-studio-entitlements");
  assert.equal(payload.sub, entitlement.licenseId);
  assert.equal(payload.aud, TEST_ORIGIN);
  assert.equal(payload.plan, "pro_monthly");
  assert.equal(payload.status, "active");
  assert.equal(payload.provider, "stripe");
  assert.equal(payload.iat, now);
  assert.equal(payload.exp, now + 3600);
  assert.equal(payload.periodEnd, now + 86400);

  const verified = await verifyLicenseToken(token, env, { now });
  assert.equal(verified.valid, true);
  assert.equal(verified.payload.sub, entitlement.licenseId);
});

test("tampered payload is rejected", async () => {
  const env = createTestEnv();
  const now = 1770000000;
  const { token } = await createLicenseToken(createEntitlement(), env, now);
  const [header, payload, signature] = token.split(".");
  const forged = JSON.parse(base64UrlToString(payload));
  forged.plan = "pro_yearly";
  const tampered = `${header}.${stringToBase64Url(JSON.stringify(forged))}.${signature}`;

  const result = await verifyLicenseToken(tampered, env, { now });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "bad_signature");
});

test("a token signed by a different key is rejected", async () => {
  const signer = createTestEnv();
  const verifier = createTestEnv({ LICENSE_PRIVATE_KEY_PKCS8_B64: TEST_PRIVATE_KEY_B64_ALT });
  const now = 1770000000;
  const { token } = await createLicenseToken(createEntitlement(), signer, now);
  const result = await verifyLicenseToken(token, verifier, { now });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "bad_signature");
});

test("expired token is rejected", async () => {
  const env = createTestEnv({ LICENSE_TTL_SECONDS: "60" });
  const now = 1770000000;
  const { token } = await createLicenseToken(createEntitlement(), env, now);
  assert.equal((await verifyLicenseToken(token, env, { now: now + 59 })).valid, true);
  const late = await verifyLicenseToken(token, env, { now: now + 61 });
  assert.equal(late.valid, false);
  assert.equal(late.reason, "expired");
});

test("wrong audience and malformed tokens are rejected", async () => {
  const env = createTestEnv();
  const now = 1770000000;
  const { token } = await createLicenseToken(createEntitlement(), env, now);
  const wrongAud = await verifyLicenseToken(token, env, { now, audience: "https://evil.test" });
  assert.equal(wrongAud.valid, false);
  assert.equal(wrongAud.reason, "bad_audience");

  assert.equal((await verifyLicenseToken("", env, { now })).reason, "missing_token");
  assert.equal((await verifyLicenseToken("a.b", env, { now })).reason, "malformed");
  assert.equal((await verifyLicenseToken("!!.??.zz", env, { now })).reason, "malformed");

  const badAlg = await signPayload({ iss: "x" }, env);
  const forgedHeader = stringToBase64Url(JSON.stringify({ alg: "none", typ: "VSL", kid: "k-test" }));
  const parts = badAlg.split(".");
  const result = await verifyLicenseToken(`${forgedHeader}.${parts[1]}.${parts[2]}`, env, { now });
  assert.equal(result.valid, false);
  assert.equal(result.reason, "bad_header");
});

test("a canceled entitlement never outlives its paid period", () => {
  const now = 1770000000;
  const canceled = createEntitlement({ status: "canceled", periodEnd: now + 100 });
  assert.equal(computeExpiry(canceled, now, 3600), now + 100);
  assert.equal(isTokenIssuable(canceled, now), true);
  assert.equal(isTokenIssuable({ ...canceled, periodEnd: now - 1 }, now), false);
  assert.equal(isTokenIssuable({ ...canceled, periodEnd: null }, now), false);

  const active = createEntitlement({ status: "active", periodEnd: now + 100 });
  assert.equal(computeExpiry(active, now, 3600), now + 3600);
  assert.equal(isTokenIssuable(active, now), true);
  assert.equal(isTokenIssuable({ ...active, status: "past_due" }, now), true);
  assert.equal(isTokenIssuable(null, now), false);
  assert.equal(isTokenIssuable({ status: "bogus" }, now), false);
});

test("buildTokenPayload normalises a missing period end to null", () => {
  const env = createTestEnv();
  const payload = buildTokenPayload(createEntitlement({ periodEnd: undefined }), env, 1770000000);
  assert.equal(payload.periodEnd, null);
});

test("jwks exposes only the public half, with a kid", async () => {
  const env = createTestEnv();
  const jwks = await buildJwks(env);
  assert.equal(jwks.keys.length, 1);
  const jwk = jwks.keys[0];
  assert.equal(jwk.kty, "EC");
  assert.equal(jwk.crv, "P-256");
  assert.equal(jwk.alg, "ES256");
  assert.equal(jwk.kid, "k-test");
  assert.equal(typeof jwk.x, "string");
  assert.equal(typeof jwk.y, "string");
  assert.equal("d" in jwk, false, "private scalar must never be published");
});

test("importing a key fails loudly when the secret is missing", async () => {
  await assert.rejects(
    () => buildJwks({ LICENSE_PRIVATE_KEY_PKCS8_B64: "" }),
    /not configured/
  );
});

test("timingSafeEqual compares content and length", () => {
  assert.equal(timingSafeEqual("abc", "abc"), true);
  assert.equal(timingSafeEqual("abc", "abd"), false);
  assert.equal(timingSafeEqual("abc", "abcd"), false);
  assert.equal(timingSafeEqual("", ""), true);
  assert.equal(timingSafeEqual(null, "abc"), false);
});
