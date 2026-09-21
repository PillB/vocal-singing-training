/**
 * Google Sign-In: verify the ID token the browser gets from Google Identity
 * Services, so "continue with Google" costs nothing to run and needs no email
 * provider, no domain and no password.
 *
 * The browser never tells us who it is; Google does, in a token signed with a
 * key we fetch from Google's published JWKS and verify here. Nothing on the
 * client side is trusted, including the email it claims.
 *
 * Docs: https://developers.google.com/identity/gsi/web/guides/verify-google-id-token
 */

"use strict";

import { base64UrlToBytes, base64UrlToString } from "./license.js";

/** Where Google publishes the public keys its ID tokens are signed with. */
export const GOOGLE_JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs";

/** Issuers Google uses, both accepted per Google's own guidance. */
export const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

/** Clock skew allowance, in seconds. */
export const CLOCK_SKEW_SECONDS = 300;

/** How long a fetched key set is reused, in seconds. */
export const JWKS_CACHE_SECONDS = 3600;

/** Isolate-local JWKS cache: `{fetchedAt, keys}`. */
let jwksCache = null;

/**
 * Fetch (and cache) Google's signing keys.
 * @param {{fetchImpl?: function, now?: number}} [options] Injectables, for tests.
 * @returns {Promise<Object[]>} JWK entries.
 */
export async function fetchGoogleJwks(options) {
  const opts = options || {};
  const now = Number.isFinite(opts.now) ? opts.now : Math.floor(Date.now() / 1000);
  if (jwksCache && now - jwksCache.fetchedAt < JWKS_CACHE_SECONDS) {
    return jwksCache.keys;
  }
  const doFetch = opts.fetchImpl || fetch;
  const response = await doFetch(GOOGLE_JWKS_URL, { method: "GET" });
  if (!response.ok) {
    throw new Error(`google jwks fetch failed: ${response.status}`);
  }
  const body = await response.json();
  const keys = (body && Array.isArray(body.keys) ? body.keys : []).filter((key) => key && key.kty === "RSA");
  if (!keys.length) {
    throw new Error("google jwks empty");
  }
  jwksCache = { fetchedAt: now, keys };
  return keys;
}

/**
 * Drop the cached key set. Test-only helper, and the escape hatch for a key
 * rotation that lands mid-isolate.
 * @returns {void}
 */
export function clearGoogleJwksCache() {
  jwksCache = null;
}

/**
 * Client ids this worker accepts tokens for.
 * Comma-separated so a web client and (later) a native client can coexist.
 * @param {Object} env Worker env bindings.
 * @returns {string[]} Client ids.
 */
export function googleClientIds(env) {
  const raw = env && typeof env.GOOGLE_CLIENT_ID === "string" ? env.GOOGLE_CLIENT_ID : "";
  return raw
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * True when Google sign-in is configured.
 * @param {Object} env Worker env bindings.
 * @returns {boolean} Whether at least one client id is set.
 */
export function googleConfigured(env) {
  return googleClientIds(env).length > 0;
}

/**
 * Verify a Google ID token and return the identity it asserts.
 *
 * Checks, in order: shape, RS256 header, a matching published key, the
 * signature, the issuer, the audience against our own client ids, expiry and
 * issued-at, and finally that Google says the email is verified. An
 * unverified-email token is refused, because otherwise anyone could claim
 * somebody else's address by putting it on a throwaway Google Workspace.
 *
 * @param {string} idToken Compact JWT from Google Identity Services.
 * @param {Object} env Worker env bindings.
 * @param {{fetchImpl?: function, now?: number}} [options] Injectables, for tests.
 * @returns {Promise<{ok: boolean, reason?: string, identity?: {subject: string, email: string,
 *                    emailVerified: boolean, name: string|null, locale: string|null}}>} Result.
 */
export async function verifyGoogleIdToken(idToken, env, options) {
  const opts = options || {};
  const now = Number.isFinite(opts.now) ? opts.now : Math.floor(Date.now() / 1000);
  const clientIds = googleClientIds(env);
  if (!clientIds.length) {
    return { ok: false, reason: "google_not_configured" };
  }
  const raw = String(idToken || "").trim();
  if (!raw || raw.length > 8192) {
    return { ok: false, reason: "malformed" };
  }
  const parts = raw.split(".");
  if (parts.length !== 3) {
    return { ok: false, reason: "malformed" };
  }

  let header;
  let claims;
  try {
    header = JSON.parse(base64UrlToString(parts[0]));
    claims = JSON.parse(base64UrlToString(parts[1]));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!header || header.alg !== "RS256" || !header.kid) {
    return { ok: false, reason: "bad_header" };
  }

  let keys;
  try {
    keys = await fetchGoogleJwks({ fetchImpl: opts.fetchImpl, now });
  } catch {
    return { ok: false, reason: "jwks_unavailable" };
  }
  const jwk = keys.find((key) => key.kid === header.kid);
  if (!jwk) {
    return { ok: false, reason: "unknown_key" };
  }

  let verified = false;
  try {
    const key = await crypto.subtle.importKey(
      "jwk",
      { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
      { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
      false,
      ["verify"]
    );
    verified = await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5",
      key,
      base64UrlToBytes(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`)
    );
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
  if (!verified) {
    return { ok: false, reason: "bad_signature" };
  }

  if (!GOOGLE_ISSUERS.includes(String(claims.iss))) {
    return { ok: false, reason: "bad_issuer" };
  }
  if (!clientIds.includes(String(claims.aud))) {
    return { ok: false, reason: "bad_audience" };
  }
  if (!Number.isFinite(claims.exp) || claims.exp + CLOCK_SKEW_SECONDS <= now) {
    return { ok: false, reason: "expired" };
  }
  if (Number.isFinite(claims.iat) && claims.iat - CLOCK_SKEW_SECONDS > now) {
    return { ok: false, reason: "issued_in_future" };
  }
  if (!claims.sub || typeof claims.sub !== "string") {
    return { ok: false, reason: "no_subject" };
  }
  if (!claims.email || typeof claims.email !== "string") {
    return { ok: false, reason: "no_email" };
  }
  // Google sends this as a boolean or as the string "true" depending on the flow.
  const emailVerified = claims.email_verified === true || claims.email_verified === "true";
  if (!emailVerified) {
    return { ok: false, reason: "email_not_verified" };
  }

  return {
    ok: true,
    identity: {
      subject: String(claims.sub),
      email: String(claims.email),
      emailVerified: true,
      name: typeof claims.name === "string" ? claims.name.slice(0, 80) : null,
      locale: typeof claims.locale === "string" ? claims.locale.slice(0, 16) : null
    }
  };
}
