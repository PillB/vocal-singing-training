#!/usr/bin/env node
/**
 * Generate the ECDSA P-256 key pair this worker signs license tokens with.
 *
 * Node 20+, no dependencies:
 *   node workers/entitlements/scripts/generate-keys.mjs
 *
 * Prints:
 *   1. the base64 PKCS#8 private key -> wrangler secret put LICENSE_PRIVATE_KEY_PKCS8_B64
 *   2. the public JWK               -> js/billing-config.js  verification.publicKeyJwk
 */

import { webcrypto } from "node:crypto";

/**
 * Encode bytes as standard base64.
 * @param {ArrayBuffer} buffer Raw bytes.
 * @returns {string} base64 text.
 */
function toBase64(buffer) {
  return Buffer.from(new Uint8Array(buffer)).toString("base64");
}

/**
 * Generate a key pair and print both halves.
 * @returns {Promise<void>} Resolves when printed.
 */
async function main() {
  const keyId = process.argv[2] || "k1";
  const pair = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const pkcs8 = await webcrypto.subtle.exportKey("pkcs8", pair.privateKey);
  const publicJwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);

  const jwk = {
    kty: "EC",
    crv: "P-256",
    x: publicJwk.x,
    y: publicJwk.y,
    alg: "ES256",
    use: "sig",
    kid: keyId,
    key_ops: ["verify"]
  };

  console.log("");
  console.log("=== PRIVATE KEY (base64 PKCS#8) — SECRET ===");
  console.log("");
  console.log(toBase64(pkcs8));
  console.log("");
  console.log("Feed it to the worker (it is read from stdin, never from a file):");
  console.log("  wrangler secret put LICENSE_PRIVATE_KEY_PKCS8_B64");
  console.log("");
  console.log("!!! WARNING ------------------------------------------------------");
  console.log("!!! NEVER commit this private key, paste it into js/, or send it in");
  console.log("!!! chat/email. Anyone holding it can mint unlimited Pro licenses.");
  console.log("!!! If it leaks: generate a new pair, bump LICENSE_KEY_ID, redeploy,");
  console.log("!!! and replace verification.publicKeyJwk on the site.");
  console.log("!!! ---------------------------------------------------------------");
  console.log("");
  console.log("=== PUBLIC JWK — safe to commit ===");
  console.log("");
  console.log("Paste into js/billing-config.js -> verification.publicKeyJwk:");
  console.log("");
  console.log(JSON.stringify(jwk, null, 2));
  console.log("");
  console.log(`Set LICENSE_KEY_ID = "${keyId}" in wrangler.toml [vars] so the token`);
  console.log("header kid matches this JWK.");
  console.log("");
}

main().catch((error) => {
  console.error("key generation failed:", error && error.message);
  process.exit(1);
});
