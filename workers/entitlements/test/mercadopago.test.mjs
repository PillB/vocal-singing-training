import test from "node:test";
import assert from "node:assert/strict";

import { hmacSha256Hex } from "../src/license.js";
import {
  buildMercadoPagoManifest,
  confirmAndMapNotification,
  fetchMercadoPagoResource,
  isoToUnixSeconds,
  mapAuthorizedPaymentResource,
  mapMercadoPagoResource,
  mapPaymentStatus,
  mapPreapprovalStatus,
  normalizeTimestampSeconds,
  parseMercadoPagoSignatureHeader,
  planForPreapproval,
  planFromAutoRecurring,
  planFromText,
  resolveNotificationTarget,
  verifyMercadoPagoSignature
} from "../src/mercadopago.js";

const SECRET = "mp_unit_test_secret";
const NOW = 1770000000;

/**
 * Build a valid x-signature header for a manifest.
 * @param {{dataId?: string, requestId?: string, ts?: number, secret?: string}} parts Manifest parts.
 * @returns {Promise<string>} Header value.
 */
async function signHeader(parts) {
  const ts = String(Number.isFinite(parts.ts) ? parts.ts : NOW);
  const manifest = buildMercadoPagoManifest({ dataId: parts.dataId, requestId: parts.requestId, ts });
  const v1 = await hmacSha256Hex(parts.secret || SECRET, manifest);
  return `ts=${ts},v1=${v1}`;
}

/**
 * Build a fetch fake that records its calls.
 * @param {{status?: number, body?: Object}} response Canned response.
 * @returns {function} Fetch implementation with a `calls` array.
 */
function fakeFetch(response) {
  const calls = [];
  const impl = async (url, init) => {
    calls.push({ url, init });
    const status = response.status || 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      async json() {
        if (response.body === undefined) {
          throw new Error("not json");
        }
        return response.body;
      }
    };
  };
  impl.calls = calls;
  return impl;
}

test("the manifest omits segments whose value is absent", () => {
  assert.equal(
    buildMercadoPagoManifest({ dataId: "ABC123", requestId: "req-1", ts: "1770000000" }),
    "id:abc123;request-id:req-1;ts:1770000000;"
  );
  assert.equal(
    buildMercadoPagoManifest({ dataId: "abc", requestId: null, ts: "17" }),
    "id:abc;ts:17;"
  );
  assert.equal(buildMercadoPagoManifest({ ts: "17" }), "ts:17;");
  assert.equal(buildMercadoPagoManifest({}), "");
});

test("parseMercadoPagoSignatureHeader reads ts and v1", () => {
  assert.deepEqual(parseMercadoPagoSignatureHeader("ts=1,v1=AABB"), { ts: "1", v1: "aabb" });
  assert.deepEqual(parseMercadoPagoSignatureHeader(""), { ts: null, v1: null });
  assert.deepEqual(parseMercadoPagoSignatureHeader("nope"), { ts: null, v1: null });
});

test("a correctly signed notification is accepted", async () => {
  const header = await signHeader({ dataId: "123456", requestId: "req-abc" });
  const result = await verifyMercadoPagoSignature({
    header,
    dataId: "123456",
    requestId: "req-abc",
    secret: SECRET,
    now: NOW
  });
  assert.deepEqual(result, { ok: true });
});

test("the data id is lowercased before hashing, as the docs require", async () => {
  const header = await signHeader({ dataId: "ABC-XYZ", requestId: "req-1" });
  const result = await verifyMercadoPagoSignature({
    header,
    dataId: "ABC-XYZ",
    requestId: "req-1",
    secret: SECRET,
    now: NOW
  });
  assert.equal(result.ok, true);
});

test("a notification with no x-request-id still verifies against the shortened manifest", async () => {
  const header = await signHeader({ dataId: "999" });
  const result = await verifyMercadoPagoSignature({
    header,
    dataId: "999",
    requestId: null,
    secret: SECRET,
    now: NOW
  });
  assert.equal(result.ok, true);
});

test("a swapped data id, a wrong secret and a tampered digest are rejected", async () => {
  const header = await signHeader({ dataId: "111", requestId: "req-1" });
  const swapped = await verifyMercadoPagoSignature({
    header,
    dataId: "222",
    requestId: "req-1",
    secret: SECRET,
    now: NOW
  });
  assert.equal(swapped.ok, false);
  assert.equal(swapped.reason, "signature_mismatch");

  const otherSecret = await signHeader({ dataId: "111", requestId: "req-1", secret: "nope" });
  const wrongSecret = await verifyMercadoPagoSignature({
    header: otherSecret,
    dataId: "111",
    requestId: "req-1",
    secret: SECRET,
    now: NOW
  });
  assert.equal(wrongSecret.reason, "signature_mismatch");

  const tampered = await verifyMercadoPagoSignature({
    header: `ts=${NOW},v1=${"a".repeat(64)}`,
    dataId: "111",
    requestId: "req-1",
    secret: SECRET,
    now: NOW
  });
  assert.equal(tampered.reason, "signature_mismatch");
});

test("a stale notification is rejected and millisecond timestamps are understood", async () => {
  const stale = await signHeader({ dataId: "111", requestId: "r", ts: NOW - 301 });
  const result = await verifyMercadoPagoSignature({
    header: stale,
    dataId: "111",
    requestId: "r",
    secret: SECRET,
    now: NOW
  });
  assert.equal(result.reason, "timestamp_out_of_tolerance");

  assert.equal(normalizeTimestampSeconds("1770000000"), 1770000000);
  assert.equal(normalizeTimestampSeconds("1770000000123"), 1770000000);
  assert.equal(normalizeTimestampSeconds("nope"), null);

  const millis = await signHeader({ dataId: "111", requestId: "r", ts: NOW * 1000 });
  const msResult = await verifyMercadoPagoSignature({
    header: millis,
    dataId: "111",
    requestId: "r",
    secret: SECRET,
    now: NOW
  });
  assert.equal(msResult.ok, true);
});

test("missing pieces are refused with safe reasons", async () => {
  assert.equal(
    (await verifyMercadoPagoSignature({ header: "ts=1", secret: SECRET, now: 1 })).reason,
    "missing_signature"
  );
  assert.equal(
    (await verifyMercadoPagoSignature({ header: "v1=aa", secret: SECRET, now: 1 })).reason,
    "missing_timestamp"
  );
  assert.equal(
    (await verifyMercadoPagoSignature({ header: "ts=1,v1=aa", secret: "", now: 1 })).reason,
    "secret_not_configured"
  );
});

test("the notification target comes from the body or the query string", () => {
  const fromBody = resolveNotificationTarget(
    { type: "payment", action: "payment.updated", data: { id: "123" } },
    new URL("https://w.test/v1/webhooks/mercadopago")
  );
  assert.equal(fromBody.kind, "payment");
  assert.equal(fromBody.id, "123");
  assert.equal(fromBody.eventId, "payment.updated:123");

  const fromQuery = resolveNotificationTarget(
    {},
    new URL("https://w.test/v1/webhooks/mercadopago?topic=subscription_preapproval&data.id=abc")
  );
  assert.equal(fromQuery.kind, "subscription_preapproval");
  assert.equal(fromQuery.id, "abc");

  const empty = resolveNotificationTarget({}, new URL("https://w.test/x"));
  assert.equal(empty.kind, null);
  assert.equal(empty.id, null);
});

test("status mapping follows the documented resource states", () => {
  assert.equal(mapPaymentStatus("approved"), "active");
  assert.equal(mapPaymentStatus("authorized"), "active");
  assert.equal(mapPaymentStatus("pending"), "past_due");
  assert.equal(mapPaymentStatus("rejected"), "past_due");
  assert.equal(mapPaymentStatus("cancelled"), "canceled");
  assert.equal(mapPaymentStatus("refunded"), "canceled");
  assert.equal(mapPreapprovalStatus("authorized"), "active");
  assert.equal(mapPreapprovalStatus("pending"), "past_due");
  assert.equal(mapPreapprovalStatus("paused"), "canceled");
  assert.equal(mapPreapprovalStatus("cancelled"), "canceled");
});

test("plan derivation reads configured plan ids, then text, then recurrence", () => {
  const env = { MP_PLAN_PRO_MONTHLY: "2c93_m", MP_PLAN_PRO_YEARLY: "2c93_y" };
  assert.deepEqual(
    planForPreapproval({ preapproval_plan_id: "2c93_y" }, env),
    { plan: "pro_yearly", planSource: "preapproval_plan_id" }
  );
  assert.deepEqual(
    planForPreapproval({ reason: "Estudio Vocal Pro anual" }, env),
    { plan: "pro_yearly", planSource: "reason" }
  );
  assert.deepEqual(
    planForPreapproval({ external_reference: "pro_monthly" }, env),
    { plan: "pro_monthly", planSource: "external_reference" }
  );
  assert.deepEqual(
    planForPreapproval({ auto_recurring: { frequency: 12, frequency_type: "months" } }, env),
    { plan: "pro_yearly", planSource: "auto_recurring" }
  );
  assert.equal(planFromText("Vocal Studio monthly"), "pro_monthly");
  assert.equal(planFromText("something else"), null);
  assert.equal(planFromAutoRecurring({ frequency: 1, frequency_type: "months" }), "pro_monthly");
  assert.equal(planFromAutoRecurring(null), null);
});

test("an unknowable plan defaults to monthly and records what was seen", () => {
  const fallback = planForPreapproval({ preapproval_plan_id: "unseen_plan" }, {});
  assert.equal(fallback.plan, "pro_monthly");
  assert.match(fallback.planSource, /^default\(plan_id=unseen_plan\)$/);
  assert.equal(planForPreapproval({}, {}).planSource, "default(no_hints)");
});

test("isoToUnixSeconds parses Mercado Pago dates", () => {
  assert.equal(isoToUnixSeconds("2026-01-01T00:00:00.000-05:00"), 1767243600);
  assert.equal(isoToUnixSeconds("nope"), null);
  assert.equal(isoToUnixSeconds(null), null);
});

test("state is taken from the API, never from the notification body", async () => {
  const env = { MP_ACCESS_TOKEN: "mp_unit_test_token" };
  const impl = fakeFetch({
    body: { id: 42, status: "approved", external_reference: "pro_yearly", payer: { id: 7 } }
  });
  const result = await confirmAndMapNotification(
    { kind: "payment", id: "42" },
    env,
    { fetchImpl: impl }
  );
  assert.equal(impl.calls.length, 1);
  assert.equal(impl.calls[0].url, "https://api.mercadopago.com/v1/payments/42");
  assert.equal(impl.calls[0].init.headers.authorization, "Bearer mp_unit_test_token");
  assert.equal(result.handled, true);
  assert.equal(result.update.status, "active");
  assert.equal(result.update.plan, "pro_yearly");
  assert.equal(result.update.claimId, "42");
  assert.equal(result.update.customerId, "7");
});

test("each notification kind hits its documented endpoint", async () => {
  const env = { MP_ACCESS_TOKEN: "t" };
  const preapproval = fakeFetch({ body: { id: "pre_1", status: "authorized" } });
  await fetchMercadoPagoResource("subscription_preapproval", "pre_1", env, { fetchImpl: preapproval });
  assert.equal(preapproval.calls[0].url, "https://api.mercadopago.com/preapproval/pre_1");

  const authorized = fakeFetch({ body: { id: "ap_1" } });
  await fetchMercadoPagoResource("subscription_authorized_payment", "ap_1", env, { fetchImpl: authorized });
  assert.equal(authorized.calls[0].url, "https://api.mercadopago.com/authorized_payments/ap_1");

  assert.equal(
    (await fetchMercadoPagoResource("unknown", "1", env, { fetchImpl: authorized })).reason,
    "unsupported_kind"
  );
  assert.equal(
    (await fetchMercadoPagoResource("payment", "1", {}, { fetchImpl: authorized })).reason,
    "access_token_not_configured"
  );
});

test("an API failure is reported instead of trusted", async () => {
  const env = { MP_ACCESS_TOKEN: "t" };
  const failing = fakeFetch({ status: 404 });
  const result = await confirmAndMapNotification({ kind: "payment", id: "1" }, env, { fetchImpl: failing });
  assert.equal(result.handled, false);
  assert.equal(result.reason, "api_error");
  assert.equal(result.status, 404);

  const badJson = fakeFetch({ status: 200 });
  const parsed = await confirmAndMapNotification({ kind: "payment", id: "1" }, env, { fetchImpl: badJson });
  assert.equal(parsed.reason, "api_bad_json");

  assert.equal((await confirmAndMapNotification(null, env, {})).reason, "missing_target");
});

test("preapproval and authorized payment resources key on the preapproval id", () => {
  const preapproval = mapMercadoPagoResource("subscription_preapproval", {
    id: "pre_9",
    status: "paused",
    payer_id: 55,
    reason: "Vocal Studio Pro mensual",
    next_payment_date: "2026-02-01T00:00:00.000-05:00"
  }, {});
  assert.equal(preapproval.update.provider, "mercadopago");
  assert.equal(preapproval.update.status, "canceled");
  assert.equal(preapproval.update.plan, "pro_monthly");
  assert.equal(preapproval.update.subscriptionId, "pre_9");
  assert.equal(preapproval.update.claimId, "pre_9");
  assert.equal(preapproval.update.customerId, "55");
  assert.equal(preapproval.update.periodEnd, 1769922000);

  const authorized = mapAuthorizedPaymentResource({
    id: "ap_2",
    preapproval_id: "pre_9",
    status: "processed",
    payment: { status: "approved" }
  }, {});
  assert.equal(authorized.status, "active");
  assert.equal(authorized.subscriptionId, "pre_9");
  assert.equal(authorized.plan, undefined, "a renewal charge must not rewrite the plan");

  const recycling = mapAuthorizedPaymentResource({ id: "ap_3", preapproval_id: "pre_9", status: "recycling" }, {});
  assert.equal(recycling.status, "past_due");

  assert.equal(mapMercadoPagoResource("payment", null, {}).reason, "missing_resource");
  assert.equal(mapMercadoPagoResource("other", {}, {}).reason, "unhandled_kind");
  assert.equal(mapMercadoPagoResource("payment", { status: "approved" }, {}).reason, "no_license_identity");
});
