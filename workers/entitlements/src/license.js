/**
 * License token minting and verification.
 *
 * Token format (compact JWS-like, three base64url parts joined by "."):
 *   header    {"alg":"ES256","typ":"VSL","kid":"<LICENSE_KEY_ID>"}
 *   payload   {"iss","sub","aud","plan","status","provider","iat","exp","periodEnd"}
 *   signature ECDSA P-256 / SHA-256 over ASCII `header.payload`,
 *             raw IEEE-P1363 64-byte output, base64url, no padding.
 *
 * Nothing in this module reads process/global secrets: everything comes from
 * the `env` object that the Worker (or a test) passes in.
 */

"use strict";

/** Issuer claim baked into every token. */
export const TOKEN_ISSUER = "vocal-studio-entitlements";

/** Token `typ` header value. */
export const TOKEN_TYPE = "VSL";

/** Default token lifetime when LICENSE_TTL_SECONDS is unset (72h). */
export const DEFAULT_TTL_SECONDS = 259200;

/** Hard bounds so a typo in env cannot mint a decade-long token. */
const MIN_TTL_SECONDS = 60;
const MAX_TTL_SECONDS = 2592000;

/** Plan ids this worker is willing to issue. */
export const PLAN_IDS = ["pro_monthly", "pro_yearly"];

/**
 * Entitlement status values.
 * "pending" means a checkout completed but the money has not arrived yet
 * (delayed payment methods); it never entitles.
 */
export const STATUS_IDS = ["active", "past_due", "canceled", "pending"];

/**
 * How long one paid interval lasts, used to give payment-only records (no
 * subscription lifecycle to follow) an enforceable period end.
 * Monthly gets 31 days so a 31-day month never expires early.
 */
export const PLAN_INTERVAL_SECONDS = {
  pro_monthly: 2678400,
  pro_yearly: 31536000
};

/**
 * Period end for a single charge: when it was paid plus one plan interval.
 * @param {string} plan Plan id.
 * @param {number} chargedAt Unix seconds the charge was approved.
 * @returns {number|null} Unix seconds, or null when either input is unusable.
 */
export function periodEndForPlan(plan, chargedAt) {
  const interval = PLAN_INTERVAL_SECONDS[plan];
  if (!interval || !Number.isFinite(chargedAt)) {
    return null;
  }
  return Math.floor(chargedAt) + interval;
}

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Module-scope key cache, keyed by the base64 PKCS#8 material so a redeploy or
 * a key rotation inside the same isolate cannot serve a stale key.
 * @type {Map<string, Promise<{privateKey: CryptoKey, publicKey: CryptoKey, publicJwk: Object}>>}
 */
const keyCache = new Map();

/**
 * Encode bytes as unpadded base64url.
 * @param {Uint8Array|ArrayBuffer} input Raw bytes.
 * @returns {string} base64url text.
 */
export function bytesToBase64Url(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/**
 * Decode unpadded (or padded) base64url text into bytes.
 * @param {string} value base64url text.
 * @returns {Uint8Array} Raw bytes.
 */
export function base64UrlToBytes(value) {
  const normalized = String(value).replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Decode standard base64 (with or without padding/whitespace) into bytes.
 * @param {string} value base64 text.
 * @returns {Uint8Array} Raw bytes.
 */
export function base64ToBytes(value) {
  const cleaned = String(value).replace(/\s+/g, "");
  return base64UrlToBytes(cleaned);
}

/**
 * Encode a UTF-8 string as unpadded base64url.
 * @param {string} value Text to encode.
 * @returns {string} base64url text.
 */
export function stringToBase64Url(value) {
  return bytesToBase64Url(textEncoder.encode(value));
}

/**
 * Decode unpadded base64url text back into a UTF-8 string.
 * @param {string} value base64url text.
 * @returns {string} Decoded text.
 */
export function base64UrlToString(value) {
  return textDecoder.decode(base64UrlToBytes(value));
}

/**
 * Mint an opaque license id: 32 random bytes as base64url.
 * Doubles as the bearer "license key" the browser stores.
 * @returns {string} 43-character base64url id.
 */
export function generateLicenseId() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

/**
 * True when a string looks like a license id we could have minted.
 * @param {unknown} value Candidate id.
 * @returns {boolean} Whether the shape is plausible.
 */
export function isLicenseIdShape(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/**
 * Resolve the configured token lifetime in seconds.
 * @param {Object} env Worker env bindings.
 * @returns {number} Clamped TTL in seconds.
 */
export function resolveTtlSeconds(env) {
  const raw = Number.parseInt(String(env && env.LICENSE_TTL_SECONDS), 10);
  if (!Number.isFinite(raw) || raw <= 0) {
    return DEFAULT_TTL_SECONDS;
  }
  return Math.min(MAX_TTL_SECONDS, Math.max(MIN_TTL_SECONDS, raw));
}

/**
 * Resolve the key id advertised in the token header and the JWKS.
 * @param {Object} env Worker env bindings.
 * @returns {string} Key id.
 */
export function resolveKeyId(env) {
  const raw = env && typeof env.LICENSE_KEY_ID === "string" ? env.LICENSE_KEY_ID.trim() : "";
  return raw || "k1";
}

/**
 * Import (and cache) the signing key material configured in env.
 * Derives the matching public key/JWK from the private key, so there is only
 * ever one secret to rotate.
 * @param {Object} env Worker env bindings (needs LICENSE_PRIVATE_KEY_PKCS8_B64).
 * @returns {Promise<{privateKey: CryptoKey, publicKey: CryptoKey, publicJwk: Object}>} Key bundle.
 */
export function importLicenseKeys(env) {
  const material = env && typeof env.LICENSE_PRIVATE_KEY_PKCS8_B64 === "string"
    ? env.LICENSE_PRIVATE_KEY_PKCS8_B64.trim()
    : "";
  if (!material) {
    return Promise.reject(new Error("LICENSE_PRIVATE_KEY_PKCS8_B64 is not configured"));
  }
  const cached = keyCache.get(material);
  if (cached) {
    return cached;
  }
  const pending = (async () => {
    const pkcs8 = base64ToBytes(material);
    const privateKey = await crypto.subtle.importKey(
      "pkcs8",
      pkcs8,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign"]
    );
    const privateJwk = await crypto.subtle.exportKey("jwk", privateKey);
    const publicJwk = {
      kty: "EC",
      crv: "P-256",
      x: privateJwk.x,
      y: privateJwk.y,
      ext: true,
      key_ops: ["verify"]
    };
    const publicKey = await crypto.subtle.importKey(
      "jwk",
      publicJwk,
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["verify"]
    );
    return { privateKey, publicKey, publicJwk };
  })();
  keyCache.set(material, pending);
  pending.catch(() => keyCache.delete(material));
  return pending;
}

/**
 * Build the JWKS document served at GET /v1/jwks.
 * @param {Object} env Worker env bindings.
 * @returns {Promise<{keys: Object[]}>} JWK set including kid/alg/use.
 */
export async function buildJwks(env) {
  const { publicJwk } = await importLicenseKeys(env);
  return {
    keys: [
      {
        kty: publicJwk.kty,
        crv: publicJwk.crv,
        x: publicJwk.x,
        y: publicJwk.y,
        alg: "ES256",
        use: "sig",
        kid: resolveKeyId(env),
        key_ops: ["verify"]
      }
    ]
  };
}

/**
 * Compute the token expiry for an entitlement.
 *
 * A token never outlives the period that was actually paid for, whatever the
 * status: that is what stops a one-off payment (no subscription lifecycle to
 * follow) from becoming lifetime Pro. A renewal moves `periodEnd` forward and
 * the next token follows it.
 *
 * @param {Object} entitlement Stored entitlement record.
 * @param {number} issuedAt Unix seconds.
 * @param {number} ttlSeconds Configured lifetime.
 * @returns {number} Unix seconds.
 */
export function computeExpiry(entitlement, issuedAt, ttlSeconds) {
  const exp = issuedAt + ttlSeconds;
  const periodEnd = entitlement && Number.isFinite(entitlement.periodEnd) ? entitlement.periodEnd : null;
  if (periodEnd !== null && periodEnd < exp) {
    return periodEnd;
  }
  return exp;
}

/**
 * True when an entitlement still deserves a token.
 *
 * Rules, in order:
 *   - an unknown status, or "pending" (money not in yet), never entitles;
 *   - a known period end that has passed never entitles, whatever the status —
 *     access stops at the end of what was paid for until a renewal moves it;
 *   - "canceled" needs a future period end, so it stops at once when we have
 *     no period to run out.
 *
 * @param {Object} entitlement Stored entitlement record.
 * @param {number} nowSeconds Unix seconds.
 * @returns {boolean} Whether a token may be issued.
 */
export function isTokenIssuable(entitlement, nowSeconds) {
  if (!entitlement || typeof entitlement !== "object") {
    return false;
  }
  if (!STATUS_IDS.includes(entitlement.status) || entitlement.status === "pending") {
    return false;
  }
  const periodEnd = Number.isFinite(entitlement.periodEnd) ? entitlement.periodEnd : null;
  if (periodEnd !== null && periodEnd <= nowSeconds) {
    return false;
  }
  if (entitlement.status === "canceled") {
    return periodEnd !== null;
  }
  return true;
}

/**
 * Build the token payload for an entitlement.
 * @param {Object} entitlement Stored entitlement record.
 * @param {Object} env Worker env bindings.
 * @param {number} nowSeconds Unix seconds.
 * @returns {Object} Payload object in the documented claim order.
 */
export function buildTokenPayload(entitlement, env, nowSeconds) {
  const issuedAt = Math.floor(nowSeconds);
  const periodEnd = Number.isFinite(entitlement.periodEnd) ? Math.floor(entitlement.periodEnd) : null;
  return {
    iss: TOKEN_ISSUER,
    sub: entitlement.licenseId,
    aud: (env && env.SITE_ORIGIN) || "",
    plan: entitlement.plan,
    status: entitlement.status,
    provider: entitlement.provider,
    iat: issuedAt,
    exp: computeExpiry({ ...entitlement, periodEnd }, issuedAt, resolveTtlSeconds(env)),
    periodEnd
  };
}

/**
 * Sign an arbitrary payload object into the compact token format.
 * @param {Object} payload Claim set.
 * @param {Object} env Worker env bindings.
 * @returns {Promise<string>} `header.payload.signature`.
 */
export async function signPayload(payload, env) {
  const { privateKey } = await importLicenseKeys(env);
  const header = { alg: "ES256", typ: TOKEN_TYPE, kid: resolveKeyId(env) };
  const signingInput = `${stringToBase64Url(JSON.stringify(header))}.${stringToBase64Url(JSON.stringify(payload))}`;
  const signature = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    privateKey,
    textEncoder.encode(signingInput)
  );
  return `${signingInput}.${bytesToBase64Url(signature)}`;
}

/**
 * Mint a license token for a stored entitlement.
 * @param {Object} entitlement Stored entitlement record.
 * @param {Object} env Worker env bindings.
 * @param {number} [nowSeconds] Unix seconds (defaults to the clock).
 * @returns {Promise<{token: string, payload: Object}>} Token and its payload.
 */
export async function createLicenseToken(entitlement, env, nowSeconds) {
  const now = Number.isFinite(nowSeconds) ? nowSeconds : Math.floor(Date.now() / 1000);
  const payload = buildTokenPayload(entitlement, env, now);
  const token = await signPayload(payload, env);
  return { token, payload };
}

/**
 * Verify a license token against the configured key pair.
 * Used by the test-suite and by any server-side re-check; the browser runs the
 * same algorithm against the published JWK.
 * @param {string} token Compact token.
 * @param {Object} env Worker env bindings.
 * @param {{now?: number, audience?: string, issuer?: string}} [options] Verification options.
 * @returns {Promise<{valid: boolean, reason?: string, header?: Object, payload?: Object}>} Result.
 */
export async function verifyLicenseToken(token, env, options) {
  const opts = options || {};
  const now = Number.isFinite(opts.now) ? opts.now : Math.floor(Date.now() / 1000);
  if (typeof token !== "string" || token.length === 0) {
    return { valid: false, reason: "missing_token" };
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    return { valid: false, reason: "malformed" };
  }
  let header;
  let payload;
  try {
    header = JSON.parse(base64UrlToString(parts[0]));
    payload = JSON.parse(base64UrlToString(parts[1]));
  } catch {
    return { valid: false, reason: "malformed" };
  }
  if (!header || header.alg !== "ES256" || header.typ !== TOKEN_TYPE) {
    return { valid: false, reason: "bad_header" };
  }
  let signatureBytes;
  try {
    signatureBytes = base64UrlToBytes(parts[2]);
  } catch {
    return { valid: false, reason: "malformed" };
  }
  if (signatureBytes.length !== 64) {
    return { valid: false, reason: "bad_signature_length" };
  }
  const { publicKey } = await importLicenseKeys(env);
  const verified = await crypto.subtle.verify(
    { name: "ECDSA", hash: "SHA-256" },
    publicKey,
    signatureBytes,
    textEncoder.encode(`${parts[0]}.${parts[1]}`)
  );
  if (!verified) {
    return { valid: false, reason: "bad_signature" };
  }
  const expectedIssuer = opts.issuer || TOKEN_ISSUER;
  if (payload.iss !== expectedIssuer) {
    return { valid: false, reason: "bad_issuer" };
  }
  const expectedAudience = opts.audience !== undefined ? opts.audience : (env && env.SITE_ORIGIN);
  if (expectedAudience && payload.aud !== expectedAudience) {
    return { valid: false, reason: "bad_audience" };
  }
  if (!Number.isFinite(payload.exp) || payload.exp <= now) {
    return { valid: false, reason: "expired" };
  }
  if (Number.isFinite(payload.iat) && payload.iat > now + 300) {
    return { valid: false, reason: "issued_in_future" };
  }
  return { valid: true, header, payload };
}

/**
 * Reset the module-scope key cache. Test-only helper.
 * @returns {void}
 */
export function clearKeyCache() {
  keyCache.clear();
}

/**
 * HMAC-SHA256 a message with a UTF-8 secret and return lowercase hex.
 * Shared by both webhook signature verifiers.
 * @param {string} secret Shared secret (never logged).
 * @param {string} message Message to sign.
 * @returns {Promise<string>} Lowercase hex digest.
 */
export async function hmacSha256Hex(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const mac = await crypto.subtle.sign("HMAC", key, textEncoder.encode(message));
  const bytes = new Uint8Array(mac);
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Length-aware constant-time string comparison (ASCII/hex inputs).
 * @param {string} a First value.
 * @param {string} b Second value.
 * @returns {boolean} Whether the values match.
 */
export function timingSafeEqual(a, b) {
  const left = typeof a === "string" ? a : "";
  const right = typeof b === "string" ? b : "";
  let diff = left.length ^ right.length;
  const max = Math.max(left.length, right.length);
  for (let i = 0; i < max; i += 1) {
    diff |= (left.charCodeAt(i) || 0) ^ (right.charCodeAt(i) || 0);
  }
  return diff === 0;
}
