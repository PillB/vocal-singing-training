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
  mapOneOffPaymentStatus,
  mapPaymentResource,
  mapPreapprovalResource,
  mapPreapprovalStatus,
  normalizeTimestampSeconds,
  parseMercadoPagoSignatureHeader,
  planForPreapproval,
  planFromAutoRecurring,
  planFromText,
  resolveNotificationTarget,
  resourceOccurredAt,
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
  // A subscription's charge: only an approved one is paid. One that is still
  // in flight or did not go through changes nothing and does not move the
  // clock, while Mercado Pago retries it.
  const approved = mapAuthorizedPaymentResource({
    id: "ap_ok",
    preapproval_id: "pre_s",
    date_last_updated: "2026-03-01T10:00:00.000-05:00",
    payment: { status: "approved" }
  }, {});
  assert.equal(approved.status, "active");
  assert.equal(approved.occurredAt, isoToUnixSeconds("2026-03-01T10:00:00.000-05:00"));
  for (const status of ["authorized", "pending", "in_process", "rejected", "cancelled", "something_new"]) {
    const charge = mapAuthorizedPaymentResource({
      id: "ap_no",
      preapproval_id: "pre_s",
      status: "processed",
      date_last_updated: "2026-03-01T10:00:00.000-05:00",
      payment: { status }
    }, {});
    assert.equal(charge.status, undefined, `${status}: no money yet, or none at all`);
    assert.equal(charge.occurredAt, null, status);
    assert.equal(charge.periodEndFromCharge, null, status);
  }
  for (const status of ["scheduled", "recycling", "cancelled"]) {
    const charge = mapAuthorizedPaymentResource({ id: "ap_np", preapproval_id: "pre_s", status }, {});
    assert.equal(charge.status, undefined, `${status} with no payment yet`);
    assert.equal(charge.occurredAt, null, status);
  }

  // A one-off payment has no retries behind it: settling, or not entitled.
  assert.equal(mapOneOffPaymentStatus("approved"), "active");
  for (const status of ["pending", "in_process", "authorized", "in_mediation"]) {
    assert.equal(mapOneOffPaymentStatus(status), "pending", status);
  }
  for (const status of ["rejected", "cancelled", "refunded", "charged_back", "something_new"]) {
    assert.equal(mapOneOffPaymentStatus(status), "canceled", status);
  }

  assert.equal(mapPreapprovalStatus("authorized"), "active");
  assert.equal(mapPreapprovalStatus("pending"), "pending", "a card never authorized never entitles");
  assert.equal(mapPreapprovalStatus("paused"), "canceled");
  assert.equal(mapPreapprovalStatus("cancelled"), "canceled");
  assert.equal(mapPreapprovalStatus("something_new"), "canceled", "an unknown state never extends access");
});

test("only an approved payment buys time, and only from its approval", () => {
  for (const status of ["pending", "in_process", "authorized", "rejected", "cancelled"]) {
    const mapped = mapPaymentResource({
      id: 501,
      status,
      date_created: "2026-03-01T10:00:00.000-05:00",
      date_last_updated: "2026-03-01T10:00:00.000-05:00",
      date_of_expiration: "2026-03-04T10:00:00.000-05:00"
    }, {});
    assert.equal(mapped.periodEndFromCharge, null, status);
    assert.equal(mapped.periodEnd, undefined, `${status}: a voucher's deadline is not a paid-through date`);
  }
});

test("a subscription's charge that did not go through says nothing about the subscription", () => {
  const rejected = mapPaymentResource({
    id: 502,
    status: "rejected",
    metadata: { preapproval_id: "pre_r" },
    description: "Pro mensual",
    date_created: "2026-03-01T10:00:00.000-05:00",
    date_last_updated: "2026-03-01T10:00:00.000-05:00"
  }, {});
  assert.equal(rejected.subscriptionId, "pre_r");
  assert.equal(rejected.claimId, "502", "the payment id still finds the subscription's license");
  assert.equal(rejected.status, undefined);
  assert.equal(rejected.plan, undefined);
  assert.equal(rejected.periodEndFromCharge, null);
  assert.equal(rejected.occurredAt, null, "it must not move the subscription's clock either");

  const approved = mapPaymentResource({
    id: 503,
    status: "approved",
    preapproval_id: "pre_r",
    date_approved: "2026-03-01T10:05:00.000-05:00"
  }, {});
  assert.equal(approved.status, "active");
  assert.equal(approved.plan, undefined, "the monthly default must not overwrite a yearly subscription");
  assert.equal(approved.periodEndFromCharge, isoToUnixSeconds("2026-03-01T10:05:00.000-05:00"));
});

test("a subscription's charge that was turned down says when it was due, on either topic", () => {
  const due = "2026-03-01T10:00:00.000-05:00";
  const updated = "2026-03-01T10:00:35.000-05:00";
  for (const status of ["rejected", "cancelled"]) {
    const charge = mapPaymentResource({
      id: 504,
      status,
      metadata: { preapproval_id: "pre_d" },
      date_created: due,
      date_last_updated: updated
    }, {});
    assert.equal(charge.declinedAt, isoToUnixSeconds(due), status);
    assert.equal(charge.status, undefined, `${status}: still says nothing about the subscription`);
    assert.equal(charge.occurredAt, null, status);
    const alone = mapPaymentResource({ id: 505, status, date_created: due, date_last_updated: updated }, {});
    assert.equal(alone.declinedAt, undefined, `${status}: a payment on its own has no subscription to stop`);

    const authorized = mapAuthorizedPaymentResource({
      id: "ap_d",
      preapproval_id: "pre_d",
      status: "recycling",
      debit_date: due,
      date_created: "2026-02-28T10:00:00.000-05:00",
      date_last_updated: updated,
      payment: { status }
    }, {});
    assert.equal(authorized.declinedAt, isoToUnixSeconds(due), status);
    assert.equal(authorized.occurredAt, null, status);
  }
  for (const payment of [{ status: "approved", date_approved: due }, { status: "in_process" }, { status: "refunded", date_approved: due }]) {
    const mapped = mapAuthorizedPaymentResource({ id: "ap_n", preapproval_id: "pre_d", debit_date: due, payment }, {});
    assert.equal(mapped.declinedAt, undefined, payment.status);
    const onPaymentTopic = mapPaymentResource({ id: 506, preapproval_id: "pre_d", date_created: due, ...payment }, {});
    assert.equal(onPaymentTopic.declinedAt, undefined, payment.status);
  }
  const noPaymentYet = mapAuthorizedPaymentResource({ id: "ap_y", preapproval_id: "pre_d", status: "recycling", debit_date: due }, {});
  assert.equal(noPaymentYet.declinedAt, undefined, "nothing was turned down yet");
});

test("a charge called off before it was due was not turned down", () => {
  // Stopping a subscription calls off its next scheduled charge. Reported as
  // cancelled with a debit date still ahead, it must not count as a decline:
  // the store keeps only the latest one, so it would hide the first charge's
  // real decline and leave a never-paid year signed.
  const updated = "2026-03-10T10:00:00.000-05:00";
  const calledOff = mapAuthorizedPaymentResource({
    id: "ap_c",
    preapproval_id: "pre_c",
    status: "cancelled",
    debit_date: "2027-03-01T10:00:00.000-05:00",
    date_created: "2026-03-01T10:00:00.000-05:00",
    date_last_updated: updated,
    payment: { status: "cancelled" }
  }, {});
  assert.equal(calledOff.declinedAt, undefined);
  const retriedLate = mapAuthorizedPaymentResource({
    id: "ap_r",
    preapproval_id: "pre_c",
    status: "recycling",
    debit_date: "2026-03-01T10:00:00.000-05:00",
    date_last_updated: updated,
    payment: { status: "rejected" }
  }, {});
  assert.equal(retriedLate.declinedAt, isoToUnixSeconds("2026-03-01T10:00:00.000-05:00"), "a charge that was due is still a decline");
});

test("a refund or chargeback says when the money left and which charge it was, on either topic", () => {
  const approved = "2026-03-01T10:00:00.000-05:00";
  const reversedAt = "2026-03-03T09:00:00.000-05:00";
  for (const status of ["refunded", "charged_back"]) {
    for (const extra of [{}, { metadata: { preapproval_id: "pre_x" } }]) {
      const mapped = mapPaymentResource({
        id: 601,
        status,
        date_approved: approved,
        date_created: approved,
        date_last_updated: reversedAt,
        ...extra
      }, {});
      assert.equal(mapped.reversedAt, isoToUnixSeconds(reversedAt), status);
      assert.equal(mapped.reversedChargeAt, isoToUnixSeconds(approved), status);
      assert.equal(mapped.periodEndFromCharge, null, `${status}: the charge it reverses must not extend again`);
    }
    // A payment on its own ends with its money; a subscription's charge leaves
    // the subscription's state and clock to the subscription's notifications.
    const alone = mapPaymentResource({ id: 602, status, date_approved: approved, date_last_updated: reversedAt }, {});
    assert.equal(alone.status, "canceled", status);
    assert.equal(alone.occurredAt, isoToUnixSeconds(reversedAt), status);
    const charge = mapPaymentResource({
      id: 603,
      status,
      preapproval_id: "pre_x",
      date_approved: approved,
      date_last_updated: reversedAt
    }, {});
    assert.equal(charge.status, undefined, status);
    assert.equal(charge.occurredAt, null, status);

    const authorized = mapAuthorizedPaymentResource({
      id: "ap_r",
      preapproval_id: "pre_x",
      status: "processed",
      date_last_updated: reversedAt,
      payment: { status, date_approved: approved }
    }, {});
    assert.equal(authorized.status, undefined, status);
    assert.equal(authorized.occurredAt, null, status);
    assert.equal(authorized.reversedAt, isoToUnixSeconds(reversedAt), status);
    assert.equal(authorized.reversedChargeAt, isoToUnixSeconds(approved), status);
    assert.equal(authorized.periodEndFromCharge, null, status);
  }

  // Without a date of its own, the charge counts from the reversal.
  const undated = mapAuthorizedPaymentResource({
    id: "ap_u",
    preapproval_id: "pre_x",
    date_last_updated: reversedAt,
    payment: { status: "refunded" }
  }, {});
  assert.equal(undated.reversedChargeAt, isoToUnixSeconds(reversedAt));
  const approvedOnly = mapAuthorizedPaymentResource({ id: "ap_a", preapproval_id: "pre_x", payment: { status: "approved", date_approved: approved } }, {});
  assert.equal(approvedOnly.reversedAt, undefined);
  assert.equal(approvedOnly.reversedChargeAt, undefined);
});

test("a preapproval's next charge date is a period end only while it is authorized", () => {
  const nextPayment = "2027-03-01T00:00:00.000-05:00";
  const authorized = mapPreapprovalResource({ id: "pre_a", status: "authorized", next_payment_date: nextPayment }, {});
  assert.equal(authorized.periodEnd, isoToUnixSeconds(nextPayment));
  for (const status of ["pending", "cancelled", "paused"]) {
    const mapped = mapPreapprovalResource({ id: "pre_a", status, next_payment_date: nextPayment }, {});
    assert.equal(mapped.periodEnd, undefined, status);
  }
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

test("a one-time payment entitles for one interval, not forever", () => {
  const approved = "2026-03-01T10:00:00.000-05:00";
  const approvedUnix = isoToUnixSeconds(approved);
  const monthly = mapPaymentResource({
    id: 12345,
    status: "approved",
    date_approved: approved,
    date_created: approved,
    date_last_updated: approved
  }, {});
  assert.equal(monthly.status, "active");
  assert.equal(monthly.plan, "pro_monthly");
  assert.equal(monthly.periodEndFromCharge, approvedUnix);
  assert.equal(monthly.occurredAt, approvedUnix);

  const yearly = mapPaymentResource({
    id: 12346,
    status: "approved",
    external_reference: "pro_yearly",
    date_created: approved
  }, {});
  assert.equal(yearly.plan, "pro_yearly");
  assert.equal(yearly.periodEndFromCharge, approvedUnix, "falls back to date_created");
});

test("a dunning retry date never becomes the paid-through date", () => {
  const charged = mapAuthorizedPaymentResource({
    id: "ap_x",
    preapproval_id: "pre_x",
    status: "processed",
    date_created: "2026-03-01T10:00:00.000-05:00",
    payment: { status: "approved", date_approved: "2026-03-01T10:05:00.000-05:00" }
  }, {});
  assert.equal(charged.periodEnd, undefined);
  assert.equal(charged.periodEndFromCharge, isoToUnixSeconds("2026-03-01T10:05:00.000-05:00"));

  const failed = mapAuthorizedPaymentResource({
    id: "ap_y",
    preapproval_id: "pre_x",
    status: "recycling",
    next_retry_date: "2026-03-05T10:00:00.000-05:00",
    payment: { status: "rejected" }
  }, {});
  assert.equal(failed.status, undefined);
  assert.equal(failed.periodEnd, undefined);
  assert.equal(failed.periodEndFromCharge, null, "a failed charge buys no time");
});

test("resourceOccurredAt prefers the most specific timestamp", () => {
  assert.equal(
    resourceOccurredAt({ date_last_updated: "2026-03-02T00:00:00Z", date_created: "2026-01-01T00:00:00Z" }),
    isoToUnixSeconds("2026-03-02T00:00:00Z")
  );
  assert.equal(
    resourceOccurredAt({ last_modified: "2026-03-03T00:00:00Z" }),
    isoToUnixSeconds("2026-03-03T00:00:00Z")
  );
  assert.equal(resourceOccurredAt({}), null);
  assert.equal(resourceOccurredAt(null), null);
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
  // Paused: the period it already paid for stays on the record; the next
  // charge date is not a paid-through date while nothing is being charged.
  assert.equal(preapproval.update.periodEnd, undefined);

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
  assert.equal(recycling.status, undefined, "a charge being retried leaves the subscription as it was");
  assert.equal(recycling.subscriptionId, "pre_9");

  assert.equal(mapMercadoPagoResource("payment", null, {}).reason, "missing_resource");
  assert.equal(mapMercadoPagoResource("other", {}, {}).reason, "unhandled_kind");
  assert.equal(mapMercadoPagoResource("payment", { status: "approved" }, {}).reason, "no_license_identity");
});
