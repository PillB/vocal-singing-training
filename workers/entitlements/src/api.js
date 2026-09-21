/**
 * Account, entitlement and progress routes.
 *
 * The webhook and license routes in `index.js` are unchanged and still work
 * with no account at all — somebody can pay, come back with a checkout id and
 * be Pro in that browser, exactly as before. Everything here is the layer above
 * that: an identity to hang a subscription on, progress that survives a new
 * phone, and the grants an operator hands out by hand.
 *
 * Every route answers with a `reason` code rather than a sentence, so the site
 * can translate it. Nothing here logs an email address, a code or a token.
 */

"use strict";

import {
  LOGIN_CODE_TTL_SECONDS,
  adminEmails,
  consumeLoginCode,
  createSession,
  ensureAccount,
  getAccountByEmail,
  isAdmin,
  issueLoginCode,
  recordIdentity,
  resolveSession,
  revokeAllSessions,
  revokeSession,
  toPublicAccount
} from "./accounts.js";
import { callerIp, ensureSchema, hitRateLimit, normalizeEmail, nowSec, sweepExpired } from "./db.js";
import { emailConfigured, sendLoginCode } from "./email.js";
import {
  createGiftCode,
  createGrant,
  linkLicense,
  listGrants,
  redeemGiftCode,
  resolveEntitlement,
  revokeGiftCode,
  revokeGrant,
  safePlan,
  startTrial,
  toPublicGrant,
  trialSeconds
} from "./grants.js";
import { googleConfigured, verifyGoogleIdToken } from "./google.js";
import { buildTokenPayload, isLicenseIdShape, signPayload } from "./license.js";
import { deleteProgress, getProgress, listProgress, putProgress } from "./progress.js";
import { getEntitlement, getLicenseIdForClaim } from "./store.js";

/** Largest JSON body any account route accepts (progress documents dominate). */
export const MAX_API_BODY_BYTES = 1048576;

/** Rate limits: `[limit, windowSeconds]` per bucket. */
export const RATE_LIMITS = {
  loginStartPerIp: [10, 3600],
  loginStartPerEmail: [5, 3600],
  loginVerifyPerIp: [30, 3600],
  googlePerIp: [30, 3600],
  redeemPerAccount: [20, 3600],
  progressPerAccount: [600, 3600]
};

/**
 * Read and parse a JSON body with a size cap.
 * @param {Request} request Incoming request.
 * @returns {Promise<{ok: boolean, reason?: string, body?: Object}>} Parsed body.
 */
export async function readJsonBody(request) {
  const declared = Number.parseInt(request.headers.get("content-length") || "", 10);
  if (Number.isFinite(declared) && declared > MAX_API_BODY_BYTES) {
    return { ok: false, reason: "body_too_large" };
  }
  let buffer;
  try {
    buffer = await request.arrayBuffer();
  } catch {
    return { ok: false, reason: "bad_request" };
  }
  if (buffer.byteLength > MAX_API_BODY_BYTES) {
    return { ok: false, reason: "body_too_large" };
  }
  if (!buffer.byteLength) {
    return { ok: true, body: {} };
  }
  try {
    const parsed = JSON.parse(new TextDecoder().decode(buffer));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, reason: "bad_request" };
    }
    return { ok: true, body: parsed };
  } catch {
    return { ok: false, reason: "bad_request" };
  }
}

/**
 * Pull the bearer token out of the Authorization header.
 * @param {Request} request Incoming request.
 * @returns {string} Token, or "".
 */
export function bearerToken(request) {
  const header = request.headers.get("authorization") || "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : "";
}

/**
 * Resolve the caller's session, or explain why there is none.
 * @param {Object} env Worker env bindings.
 * @param {Request} request Incoming request.
 * @param {number} [now] Injected clock.
 * @returns {Promise<{ok: boolean, reason?: string, account?: Object, session?: Object}>} Result.
 */
export async function requireSession(env, request, now) {
  const token = bearerToken(request);
  if (!token) {
    return { ok: false, reason: "no_session" };
  }
  return resolveSession(env.DB, token, now);
}

/**
 * Turn a resolved entitlement into a signed license token the browser can
 * verify with the key it already has.
 *
 * `sub` is the linked license id when the access came from a subscription, so
 * the token is indistinguishable from one issued by `/v1/claim`. For a grant it
 * is the grant id instead, which never collides: license ids are 43-character
 * base64url and grant ids start with `grant_`.
 *
 * @param {Object} resolution Output of `resolveEntitlement`.
 * @param {Object} account Account row.
 * @param {Object} env Worker env bindings.
 * @param {number} now Unix seconds.
 * @returns {Promise<{token: string, payload: Object}|null>} Token, or null when not entitled.
 */
export async function licenseTokenForResolution(resolution, account, env, now) {
  if (!resolution || !resolution.pro) {
    return null;
  }
  const subject = resolution.licenseId || resolution.grantId;
  if (!subject) {
    return null;
  }
  const record = {
    licenseId: subject,
    plan: safePlan(resolution.plan),
    // Grants are unconditionally active while they run; a paid record keeps
    // whatever the provider last said, so "canceled but paid through March"
    // still reads as canceled in the token.
    status: resolution.status === "free" ? "active" : resolution.status,
    provider: resolution.provider || resolution.source || "grant",
    periodEnd: resolution.periodEnd
  };
  // Build the payload, add the two account claims, then sign once — so the
  // signature covers exactly the bytes we hand out. `accountId` and `source`
  // are additive: a client that predates them simply ignores them.
  const payload = buildTokenPayload(record, env, now);
  payload.accountId = account.id;
  payload.source = resolution.source || null;
  const token = await signPayload(payload, env);
  return { token, payload };
}

/**
 * The account-shaped answer every authenticated route returns, so the browser
 * only ever has to understand one payload.
 * @param {Object} env Worker env bindings.
 * @param {Object} account Account row.
 * @param {number} now Unix seconds.
 * @returns {Promise<Object>} `{account, entitlement, token, grants}`.
 */
export async function buildMePayload(env, account, now) {
  const resolution = await resolveEntitlement(env.DB, env.ENTITLEMENTS, account.id, now);
  const minted = await licenseTokenForResolution(resolution, account, env, now).catch(() => null);
  return {
    ok: true,
    account: toPublicAccount(account),
    entitlement: {
      pro: resolution.pro,
      plan: resolution.plan,
      status: resolution.status,
      source: resolution.source,
      periodEnd: resolution.periodEnd,
      provider: resolution.provider
    },
    grants: resolution.grants,
    paid: resolution.paid,
    licenseId: minted ? minted.payload.sub : null,
    token: minted ? minted.token : null
  };
}

/**
 * Which sign-in methods this deployment can actually offer.
 * @param {Object} env Worker env bindings.
 * @returns {{email: boolean, google: boolean, googleClientId: string|null}} Availability.
 */
export function authMethods(env) {
  const ids = String((env && env.GOOGLE_CLIENT_ID) || "").split(",").map((s) => s.trim()).filter(Boolean);
  return {
    email: emailConfigured(env),
    google: googleConfigured(env),
    googleClientId: ids[0] || null
  };
}

/**
 * POST /v1/auth/email/start — email a sign-in code.
 *
 * Always answers 200 with the same shape whether or not the address has an
 * account, so this route cannot be used to find out who is registered.
 *
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables `{json, cors, now, fetchImpl}`.
 * @returns {Promise<Response>} Response.
 */
export async function handleEmailStart(request, env, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  if (!emailConfigured(env)) {
    return json({ ok: false, reason: "email_not_configured" }, 503, cors);
  }
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return json({ ok: false, reason: parsed.reason }, parsed.reason === "body_too_large" ? 413 : 400, cors);
  }
  const email = normalizeEmail(parsed.body.email);
  if (!email) {
    return json({ ok: false, reason: "bad_email" }, 400, cors);
  }

  const ip = callerIp(request);
  const byIp = await hitRateLimit(env.DB, `login:ip:${ip}`, ...RATE_LIMITS.loginStartPerIp, at);
  if (!byIp.ok) {
    return json({ ok: false, reason: "rate_limited", retryAfter: byIp.retryAfter }, 429, cors);
  }
  const byEmail = await hitRateLimit(env.DB, `login:email:${email}`, ...RATE_LIMITS.loginStartPerEmail, at);
  if (!byEmail.ok) {
    // Same 200 as the happy path: telling the caller this address is being
    // hammered would confirm the address exists.
    return json({ ok: true, sent: true, expiresInSeconds: LOGIN_CODE_TTL_SECONDS }, 200, cors);
  }

  const { code } = await issueLoginCode(env.DB, email, at);
  const sent = await sendLoginCode(env, email, code, Math.floor(LOGIN_CODE_TTL_SECONDS / 60), {
    fetchImpl: deps.fetchImpl
  });
  if (!sent.ok) {
    return json({ ok: false, reason: sent.reason }, 502, cors);
  }
  return json({ ok: true, sent: true, expiresInSeconds: LOGIN_CODE_TTL_SECONDS }, 200, cors);
}

/**
 * POST /v1/auth/email/verify — exchange a code for a session.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>} Response.
 */
export async function handleEmailVerify(request, env, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return json({ ok: false, reason: parsed.reason }, parsed.reason === "body_too_large" ? 413 : 400, cors);
  }
  const email = normalizeEmail(parsed.body.email);
  if (!email) {
    return json({ ok: false, reason: "bad_email" }, 400, cors);
  }
  const ip = callerIp(request);
  const limited = await hitRateLimit(env.DB, `verify:ip:${ip}`, ...RATE_LIMITS.loginVerifyPerIp, at);
  if (!limited.ok) {
    return json({ ok: false, reason: "rate_limited", retryAfter: limited.retryAfter }, 429, cors);
  }

  const consumed = await consumeLoginCode(env.DB, email, parsed.body.code, at);
  if (!consumed.ok) {
    return json({ ok: false, reason: consumed.reason }, 401, cors);
  }

  const { account } = await ensureAccount(
    env.DB,
    email,
    { locale: parsed.body.locale, adminEmails: adminEmails(env) },
    at
  );
  await recordIdentity(env.DB, account.id, "email", email, at);
  const session = await createSession(env.DB, account.id, at);
  const payload = await buildMePayload(env, account, at);
  return json({ ...payload, sessionToken: session.token, expiresAt: session.expiresAt }, 200, cors);
}

/**
 * POST /v1/auth/google — exchange a Google ID token for a session.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>} Response.
 */
export async function handleGoogleSignIn(request, env, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  if (!googleConfigured(env)) {
    return json({ ok: false, reason: "google_not_configured" }, 503, cors);
  }
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return json({ ok: false, reason: parsed.reason }, parsed.reason === "body_too_large" ? 413 : 400, cors);
  }
  const ip = callerIp(request);
  const limited = await hitRateLimit(env.DB, `google:ip:${ip}`, ...RATE_LIMITS.googlePerIp, at);
  if (!limited.ok) {
    return json({ ok: false, reason: "rate_limited", retryAfter: limited.retryAfter }, 429, cors);
  }

  const verified = await verifyGoogleIdToken(parsed.body.idToken, env, {
    fetchImpl: deps.fetchImpl,
    now: at
  });
  if (!verified.ok) {
    return json({ ok: false, reason: verified.reason }, 401, cors);
  }
  const { account } = await ensureAccount(
    env.DB,
    verified.identity.email,
    {
      displayName: verified.identity.name,
      locale: verified.identity.locale,
      adminEmails: adminEmails(env)
    },
    at
  );
  await recordIdentity(env.DB, account.id, "google", verified.identity.subject, at);
  const session = await createSession(env.DB, account.id, at);
  const payload = await buildMePayload(env, account, at);
  return json({ ...payload, sessionToken: session.token, expiresAt: session.expiresAt }, 200, cors);
}

/**
 * POST /v1/auth/logout — end this session, or every session.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>} Response.
 */
export async function handleLogout(request, env, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  const auth = await requireSession(env, request, at);
  if (!auth.ok) {
    // Already signed out is a success, not an error.
    return json({ ok: true }, 200, cors);
  }
  const parsed = await readJsonBody(request);
  const everywhere = parsed.ok && parsed.body.everywhere === true;
  if (everywhere) {
    await revokeAllSessions(env.DB, auth.account.id, at);
  } else {
    await revokeSession(env.DB, auth.session.id, at);
  }
  return json({ ok: true, everywhere }, 200, cors);
}

/**
 * GET/POST /v1/me — the account, what it is entitled to, and a fresh token.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>} Response.
 */
export async function handleMe(request, env, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  const auth = await requireSession(env, request, at);
  if (!auth.ok) {
    return json({ ok: false, reason: auth.reason }, 401, cors);
  }
  return json(await buildMePayload(env, auth.account, at), 200, cors);
}

/**
 * POST /v1/me/link — attach a completed checkout to the signed-in account.
 *
 * Accepts either the provider checkout id (same one `/v1/claim` takes) or a
 * license id the browser already holds from an anonymous purchase, so somebody
 * who paid before signing up keeps what they bought.
 *
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>} Response.
 */
export async function handleLink(request, env, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  const auth = await requireSession(env, request, at);
  if (!auth.ok) {
    return json({ ok: false, reason: auth.reason }, 401, cors);
  }
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return json({ ok: false, reason: parsed.reason }, 400, cors);
  }

  let licenseId = null;
  const provider = parsed.body.provider;
  if (typeof parsed.body.licenseId === "string" && isLicenseIdShape(parsed.body.licenseId)) {
    licenseId = parsed.body.licenseId;
  } else if ((provider === "stripe" || provider === "mercadopago") && typeof parsed.body.sessionId === "string") {
    const sessionId = parsed.body.sessionId.trim();
    if (!sessionId || sessionId.length > 200) {
      return json({ ok: false, reason: "bad_request" }, 400, cors);
    }
    licenseId = await getLicenseIdForClaim(env.ENTITLEMENTS, provider, sessionId);
    if (!licenseId) {
      // The webhook has not landed yet; the browser retries, same as /v1/claim.
      return json({ ok: false, reason: "pending" }, 202, cors);
    }
  } else {
    return json({ ok: false, reason: "bad_request" }, 400, cors);
  }

  const record = await getEntitlement(env.ENTITLEMENTS, licenseId);
  if (!record) {
    return json({ ok: false, reason: "not_found" }, 404, cors);
  }
  const linked = await linkLicense(env.DB, auth.account.id, licenseId, record.provider, at);
  if (!linked.ok) {
    return json({ ok: false, reason: linked.reason }, 409, cors);
  }
  return json(await buildMePayload(env, auth.account, at), 200, cors);
}

/**
 * POST /v1/me/trial — start the one free trial this account gets.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>} Response.
 */
export async function handleStartTrial(request, env, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  const auth = await requireSession(env, request, at);
  if (!auth.ok) {
    return json({ ok: false, reason: auth.reason }, 401, cors);
  }
  const started = await startTrial(env.DB, auth.account, env, at);
  if (!started.ok) {
    return json({ ok: false, reason: started.reason }, 409, cors);
  }
  const fresh = await getAccountByEmail(env.DB, auth.account.email_normalized);
  return json(await buildMePayload(env, fresh || auth.account, at), 200, cors);
}

/**
 * POST /v1/me/redeem — redeem a gift code.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>} Response.
 */
export async function handleRedeem(request, env, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  const auth = await requireSession(env, request, at);
  if (!auth.ok) {
    return json({ ok: false, reason: auth.reason }, 401, cors);
  }
  const limited = await hitRateLimit(
    env.DB,
    `redeem:acct:${auth.account.id}`,
    ...RATE_LIMITS.redeemPerAccount,
    at
  );
  if (!limited.ok) {
    return json({ ok: false, reason: "rate_limited", retryAfter: limited.retryAfter }, 429, cors);
  }
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return json({ ok: false, reason: parsed.reason }, 400, cors);
  }
  const redeemed = await redeemGiftCode(env.DB, auth.account.id, parsed.body.code, at);
  if (!redeemed.ok) {
    return json({ ok: false, reason: redeemed.reason }, redeemed.reason === "not_found" ? 404 : 409, cors);
  }
  const payload = await buildMePayload(env, auth.account, at);
  return json({ ...payload, redeemedDays: redeemed.days }, 200, cors);
}

/**
 * GET /v1/me/progress — read saved progress (one profile, or the index).
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {URL} url Parsed URL.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>} Response.
 */
export async function handleGetProgress(request, env, url, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  const auth = await requireSession(env, request, at);
  if (!auth.ok) {
    return json({ ok: false, reason: auth.reason }, 401, cors);
  }
  const profileId = url.searchParams.get("profileId");
  if (!profileId) {
    return json({ ok: true, profiles: await listProgress(env.DB, auth.account.id) }, 200, cors);
  }
  const stored = await getProgress(env.DB, auth.account.id, profileId);
  if (!stored) {
    return json({ ok: true, rev: 0, doc: null, updatedAt: null }, 200, cors);
  }
  return json({ ok: true, ...stored }, 200, cors);
}

/**
 * PUT /v1/me/progress — store progress, refusing a write that would clobber a
 * revision the caller has not seen.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>} Response.
 */
export async function handlePutProgress(request, env, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  const auth = await requireSession(env, request, at);
  if (!auth.ok) {
    return json({ ok: false, reason: auth.reason }, 401, cors);
  }
  const limited = await hitRateLimit(
    env.DB,
    `progress:acct:${auth.account.id}`,
    ...RATE_LIMITS.progressPerAccount,
    at
  );
  if (!limited.ok) {
    return json({ ok: false, reason: "rate_limited", retryAfter: limited.retryAfter }, 429, cors);
  }
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return json({ ok: false, reason: parsed.reason }, parsed.reason === "body_too_large" ? 413 : 400, cors);
  }
  const result = await putProgress(
    env.DB,
    auth.account.id,
    parsed.body.profileId,
    parsed.body.doc,
    parsed.body.baseRev,
    at
  );
  if (!result.ok) {
    const status = result.reason === "conflict" ? 409 : result.reason === "too_large" ? 413 : 400;
    return json({ ok: false, ...result }, status, cors);
  }
  return json(result, 200, cors);
}

/**
 * DELETE /v1/me/progress — forget one profile's stored progress.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {URL} url Parsed URL.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>} Response.
 */
export async function handleDeleteProgress(request, env, url, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  const auth = await requireSession(env, request, at);
  if (!auth.ok) {
    return json({ ok: false, reason: auth.reason }, 401, cors);
  }
  const profileId = url.searchParams.get("profileId");
  if (!profileId) {
    return json({ ok: false, reason: "bad_profile" }, 400, cors);
  }
  await deleteProgress(env.DB, auth.account.id, profileId);
  return json({ ok: true }, 200, cors);
}

/**
 * Require an admin session.
 * @param {Object} env Worker env bindings.
 * @param {Request} request Incoming request.
 * @param {number} at Unix seconds.
 * @returns {Promise<{ok: boolean, reason?: string, status?: number, account?: Object}>} Result.
 */
async function requireAdmin(env, request, at) {
  const auth = await requireSession(env, request, at);
  if (!auth.ok) {
    return { ok: false, reason: auth.reason, status: 401 };
  }
  if (!isAdmin(auth.account, env)) {
    return { ok: false, reason: "forbidden", status: 403 };
  }
  return { ok: true, account: auth.account };
}

/**
 * POST /v1/admin/gift-codes — mint a code to hand out.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>} Response.
 */
export async function handleAdminCreateGiftCode(request, env, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  const admin = await requireAdmin(env, request, at);
  if (!admin.ok) {
    return json({ ok: false, reason: admin.reason }, admin.status, cors);
  }
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return json({ ok: false, reason: parsed.reason }, 400, cors);
  }
  const created = await createGiftCode(
    env.DB,
    {
      plan: parsed.body.plan,
      days: parsed.body.days || Math.floor(trialSeconds(env) / 86400),
      maxRedemptions: parsed.body.maxRedemptions,
      note: parsed.body.note,
      createdBy: admin.account.id,
      expiresAt: parsed.body.expiresAt
    },
    at
  );
  return json({ ok: true, giftCode: created }, 200, cors);
}

/**
 * POST /v1/admin/gift-codes/revoke — stop a code being redeemed again.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>} Response.
 */
export async function handleAdminRevokeGiftCode(request, env, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  const admin = await requireAdmin(env, request, at);
  if (!admin.ok) {
    return json({ ok: false, reason: admin.reason }, admin.status, cors);
  }
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return json({ ok: false, reason: parsed.reason }, 400, cors);
  }
  const revoked = await revokeGiftCode(env.DB, parsed.body.code, at);
  if (!revoked.ok) {
    return json({ ok: false, reason: revoked.reason }, revoked.reason === "not_found" ? 404 : 400, cors);
  }
  return json({ ok: true, reason: revoked.reason || null }, 200, cors);
}

/**
 * GET /v1/admin/gift-codes — list codes, newest first.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>} Response.
 */
export async function handleAdminListGiftCodes(request, env, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  const admin = await requireAdmin(env, request, at);
  if (!admin.ok) {
    return json({ ok: false, reason: admin.reason }, admin.status, cors);
  }
  const res = await env.DB.prepare(
    `SELECT code_display, plan, days, max_redemptions, redeemed_count, note, expires_at, revoked_at, created_at
     FROM gift_codes ORDER BY created_at DESC LIMIT 100`
  ).all();
  return json(
    {
      ok: true,
      giftCodes: ((res && res.results) || []).map((row) => ({
        code: row.code_display,
        plan: row.plan,
        days: Number(row.days),
        maxRedemptions: Number(row.max_redemptions),
        redeemedCount: Number(row.redeemed_count),
        note: row.note || null,
        expiresAt: row.expires_at === null || row.expires_at === undefined ? null : Number(row.expires_at),
        revokedAt: row.revoked_at === null || row.revoked_at === undefined ? null : Number(row.revoked_at),
        createdAt: Number(row.created_at)
      }))
    },
    200,
    cors
  );
}

/**
 * POST /v1/admin/grants — give a named person months directly, no code.
 *
 * Creates the account if the email has never signed in, so friends and family
 * can be set up before they ever open the site.
 *
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>} Response.
 */
export async function handleAdminCreateGrant(request, env, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  const admin = await requireAdmin(env, request, at);
  if (!admin.ok) {
    return json({ ok: false, reason: admin.reason }, admin.status, cors);
  }
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return json({ ok: false, reason: parsed.reason }, 400, cors);
  }
  const email = normalizeEmail(parsed.body.email);
  if (!email) {
    return json({ ok: false, reason: "bad_email" }, 400, cors);
  }
  const days = Math.floor(Number(parsed.body.days) || 30);
  if (!Number.isFinite(days) || days < 1) {
    return json({ ok: false, reason: "bad_days" }, 400, cors);
  }
  const { account } = await ensureAccount(env.DB, email, { adminEmails: adminEmails(env) }, at);
  const grant = await createGrant(
    env.DB,
    {
      accountId: account.id,
      kind: parsed.body.kind === "comp" ? "comp" : "gift",
      plan: parsed.body.plan,
      days,
      source: "admin",
      note: parsed.body.note,
      issuedBy: admin.account.id
    },
    at
  );
  return json({ ok: true, account: toPublicAccount(account), grant: toPublicGrant(grant, at) }, 200, cors);
}

/**
 * POST /v1/admin/grants/revoke — take a granted month back.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>} Response.
 */
export async function handleAdminRevokeGrant(request, env, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  const admin = await requireAdmin(env, request, at);
  if (!admin.ok) {
    return json({ ok: false, reason: admin.reason }, admin.status, cors);
  }
  const parsed = await readJsonBody(request);
  if (!parsed.ok) {
    return json({ ok: false, reason: parsed.reason }, 400, cors);
  }
  const revoked = await revokeGrant(env.DB, String(parsed.body.grantId || ""), admin.account.id, at);
  if (!revoked.ok) {
    return json({ ok: false, reason: revoked.reason }, 404, cors);
  }
  return json({ ok: true, grant: toPublicGrant(revoked.grant, at) }, 200, cors);
}

/**
 * GET /v1/admin/account?email= — look somebody up and see everything they hold.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {URL} url Parsed URL.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>} Response.
 */
export async function handleAdminLookupAccount(request, env, url, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  const admin = await requireAdmin(env, request, at);
  if (!admin.ok) {
    return json({ ok: false, reason: admin.reason }, admin.status, cors);
  }
  const account = await getAccountByEmail(env.DB, url.searchParams.get("email"));
  if (!account) {
    return json({ ok: false, reason: "not_found" }, 404, cors);
  }
  const resolution = await resolveEntitlement(env.DB, env.ENTITLEMENTS, account.id, at);
  const grants = await listGrants(env.DB, account.id, { includeRevoked: true, limit: 200 });
  return json(
    {
      ok: true,
      account: toPublicAccount(account),
      entitlement: {
        pro: resolution.pro,
        plan: resolution.plan,
        status: resolution.status,
        source: resolution.source,
        periodEnd: resolution.periodEnd
      },
      grants: grants.map((row) => toPublicGrant(row, at)),
      paid: resolution.paid
    },
    200,
    cors
  );
}

/**
 * Route one account-layer request, or return null so the caller's own router
 * keeps handling the webhook and license paths untouched.
 *
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {URL} url Parsed URL.
 * @param {string} path Normalized path.
 * @param {Object} deps Injectables `{json, cors, now, fetchImpl}`.
 * @returns {Promise<Response|null>} Response, or null when the path is not ours.
 */
export async function routeAccountApi(request, env, url, path, deps) {
  if (!path.startsWith("/v1/auth/") && !path.startsWith("/v1/me") && !path.startsWith("/v1/admin/")) {
    return null;
  }
  const { json, cors } = deps;
  if (!env.DB) {
    return json({ ok: false, reason: "accounts_not_configured" }, 503, cors);
  }
  await ensureSchema(env.DB);

  const method = request.method;
  /**
   * Refuse a method mismatch with the same shape everywhere.
   * @param {string} allow Allowed methods.
   * @returns {Response} 405.
   */
  const notAllowed = (allow) => json({ ok: false, reason: "method_not_allowed" }, 405, { ...cors, allow });

  if (path === "/v1/auth/methods") {
    return method === "GET" ? json({ ok: true, ...authMethods(env) }, 200, cors) : notAllowed("GET");
  }
  if (path === "/v1/auth/email/start") {
    return method === "POST" ? handleEmailStart(request, env, deps) : notAllowed("POST");
  }
  if (path === "/v1/auth/email/verify") {
    return method === "POST" ? handleEmailVerify(request, env, deps) : notAllowed("POST");
  }
  if (path === "/v1/auth/google") {
    return method === "POST" ? handleGoogleSignIn(request, env, deps) : notAllowed("POST");
  }
  if (path === "/v1/auth/logout") {
    return method === "POST" ? handleLogout(request, env, deps) : notAllowed("POST");
  }
  if (path === "/v1/me") {
    if (method !== "GET" && method !== "POST") {
      return notAllowed("GET, POST");
    }
    return handleMe(request, env, deps);
  }
  if (path === "/v1/me/link") {
    return method === "POST" ? handleLink(request, env, deps) : notAllowed("POST");
  }
  if (path === "/v1/me/trial") {
    return method === "POST" ? handleStartTrial(request, env, deps) : notAllowed("POST");
  }
  if (path === "/v1/me/redeem") {
    return method === "POST" ? handleRedeem(request, env, deps) : notAllowed("POST");
  }
  if (path === "/v1/me/progress") {
    if (method === "GET") {
      return handleGetProgress(request, env, url, deps);
    }
    if (method === "PUT" || method === "POST") {
      return handlePutProgress(request, env, deps);
    }
    if (method === "DELETE") {
      return handleDeleteProgress(request, env, url, deps);
    }
    return notAllowed("GET, PUT, DELETE");
  }
  if (path === "/v1/admin/gift-codes") {
    if (method === "POST") {
      return handleAdminCreateGiftCode(request, env, deps);
    }
    if (method === "GET") {
      return handleAdminListGiftCodes(request, env, deps);
    }
    return notAllowed("GET, POST");
  }
  if (path === "/v1/admin/gift-codes/revoke") {
    return method === "POST" ? handleAdminRevokeGiftCode(request, env, deps) : notAllowed("POST");
  }
  if (path === "/v1/admin/grants") {
    return method === "POST" ? handleAdminCreateGrant(request, env, deps) : notAllowed("POST");
  }
  if (path === "/v1/admin/grants/revoke") {
    return method === "POST" ? handleAdminRevokeGrant(request, env, deps) : notAllowed("POST");
  }
  if (path === "/v1/admin/account") {
    return method === "GET" ? handleAdminLookupAccount(request, env, url, deps) : notAllowed("GET");
  }
  if (path === "/v1/admin/sweep") {
    if (method !== "POST") {
      return notAllowed("POST");
    }
    const admin = await requireAdmin(env, request, nowSec(deps.now));
    if (!admin.ok) {
      return json({ ok: false, reason: admin.reason }, admin.status, cors);
    }
    await sweepExpired(env.DB, nowSec(deps.now));
    return json({ ok: true }, 200, cors);
  }

  return json({ ok: false, reason: "not_found" }, 404, cors);
}
