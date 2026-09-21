/**
 * Shared test fixtures: an in-memory KV fake and a throwaway signing key.
 * No network, no Workers runtime, no dependencies.
 */

import { webcrypto } from "node:crypto";

import { createD1 } from "./d1-fake.mjs";

/**
 * Generate a throwaway PKCS#8 P-256 private key as base64.
 * @returns {Promise<string>} base64 PKCS#8 key material.
 */
async function generatePrivateKeyB64() {
  const pair = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const pkcs8 = await webcrypto.subtle.exportKey("pkcs8", pair.privateKey);
  return Buffer.from(new Uint8Array(pkcs8)).toString("base64");
}

/** Throwaway PKCS#8 private key, generated fresh for every test run. */
export const TEST_PRIVATE_KEY_B64 = await generatePrivateKeyB64();

/** A second, unrelated key, for "signed by someone else" tests. */
export const TEST_PRIVATE_KEY_B64_ALT = await generatePrivateKeyB64();

/** Origin the fake site is served from. */
export const TEST_ORIGIN = "https://example.test";

/**
 * Minimal Workers KV fake: get/put/delete plus write bookkeeping for assertions.
 * @returns {Object} Fake KV namespace.
 */
export function createFakeKv() {
  const store = new Map();
  return {
    store,
    writes: 0,
    /**
     * Read a value.
     * @param {string} key KV key.
     * @returns {Promise<string|null>} Stored text or null.
     */
    async get(key) {
      const entry = store.get(key);
      return entry === undefined ? null : entry.value;
    },
    /**
     * Write a value.
     * @param {string} key KV key.
     * @param {string} value Text value.
     * @param {{expirationTtl?: number}} [options] Write options.
     * @returns {Promise<void>} Resolves when written.
     */
    async put(key, value, options) {
      this.writes += 1;
      store.set(key, {
        value: String(value),
        expirationTtl: (options && options.expirationTtl) || null
      });
    },
    /**
     * Delete a value.
     * @param {string} key KV key.
     * @returns {Promise<void>} Resolves when deleted.
     */
    async delete(key) {
      store.delete(key);
    },
    /**
     * Read the TTL recorded for a key.
     * @param {string} key KV key.
     * @returns {number|null} TTL in seconds or null.
     */
    ttlOf(key) {
      const entry = store.get(key);
      return entry ? entry.expirationTtl : null;
    }
  };
}

/**
 * Build an env object with the test key, test secrets and a fresh fake KV.
 * @param {Object} [overrides] Fields to override.
 * @returns {Object} Env bindings.
 */
export function createTestEnv(overrides) {
  return {
    SITE_ORIGIN: TEST_ORIGIN,
    LICENSE_KEY_ID: "k-test",
    LICENSE_TTL_SECONDS: "3600",
    LICENSE_PRIVATE_KEY_PKCS8_B64: TEST_PRIVATE_KEY_B64,
    STRIPE_WEBHOOK_SECRET: "whsec_unit_test_secret",
    MP_WEBHOOK_SECRET: "mp_unit_test_secret",
    MP_ACCESS_TOKEN: "mp_unit_test_token",
    ENTITLEMENTS: createFakeKv(),
    ...(overrides || {})
  };
}

/**
 * Build a stored entitlement record for tests.
 * @param {Object} [overrides] Fields to override.
 * @returns {Object} Entitlement record.
 */
export function createEntitlement(overrides) {
  const now = Math.floor(Date.now() / 1000);
  return {
    licenseId: "L".repeat(43),
    plan: "pro_monthly",
    status: "active",
    provider: "stripe",
    customerId: "cus_test",
    subscriptionId: "sub_test",
    periodEnd: now + 86400,
    createdAt: now,
    updatedAt: now,
    ...(overrides || {})
  };
}

/**
 * Env bindings with the account layer wired up: a fresh D1 fake plus the vars
 * the auth routes read.
 * @param {Object} [overrides] Fields to override.
 * @returns {Object} Env bindings including `DB`.
 */
export function createAccountEnv(overrides) {
  return {
    ...createTestEnv(),
    DB: createD1(),
    ADMIN_EMAILS: "admin@example.test",
    TRIAL_DAYS: "30",
    GOOGLE_CLIENT_ID: "test-client-id.apps.googleusercontent.com",
    EMAIL_PROVIDER: "resend",
    RESEND_API_KEY: "re_unit_test_key",
    EMAIL_FROM: "hola@vocalstudio.test",
    EMAIL_FROM_NAME: "Vocal Studio",
    ...(overrides || {})
  };
}
