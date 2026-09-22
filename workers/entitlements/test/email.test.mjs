/**
 * Transactional email for sign-in codes: provider selection, request shape and
 * the refusal when nothing is configured.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildLoginCodeMessage,
  buildSendRequest,
  emailConfigured,
  resolveEmailConfig,
  sendLoginCode
} from "../src/email.js";

/**
 * Collect the outgoing request instead of sending it.
 * @param {{ok?: boolean, status?: number}} [response] Response to return.
 * @returns {{fetchImpl: function, calls: Object[]}} Recorder.
 */
function recorder(response) {
  const calls = [];
  return {
    calls,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return { ok: response ? response.ok !== false : true, status: (response && response.status) || 200 };
    }
  };
}

test("no key configured means no provider", () => {
  assert.equal(resolveEmailConfig({}).provider, null);
  assert.equal(emailConfigured({}), false);
  assert.equal(emailConfigured({ RESEND_API_KEY: "re_x" }), false, "a from-address is required too");
  assert.equal(emailConfigured({ RESEND_API_KEY: "re_x", EMAIL_FROM: "a@b.test" }), true);
});

test("the provider can be named explicitly or inferred from whichever key exists", () => {
  assert.equal(resolveEmailConfig({ BREVO_API_KEY: "b" }).provider, "brevo");
  assert.equal(resolveEmailConfig({ MAILERSEND_API_KEY: "m" }).provider, "mailersend");
  assert.equal(
    resolveEmailConfig({ EMAIL_PROVIDER: "brevo", BREVO_API_KEY: "b", RESEND_API_KEY: "r" }).provider,
    "brevo"
  );
  // Naming a provider whose key is missing falls back to one that has a key,
  // rather than refusing to send at all.
  assert.equal(resolveEmailConfig({ EMAIL_PROVIDER: "brevo", RESEND_API_KEY: "r" }).provider, "resend");
  assert.equal(resolveEmailConfig({ EMAIL_PROVIDER: "carrier-pigeon", RESEND_API_KEY: "r" }).provider, "resend");
});

test("the message carries the code in both the text and the HTML body", () => {
  const message = buildLoginCodeMessage("483920", 15);
  assert.ok(message.subject.includes("483920"));
  assert.ok(message.text.includes("483920"));
  assert.ok(message.html.includes("483920"));
  assert.ok(message.text.includes("15"));
  assert.ok(/Vence|expires/i.test(message.text));
  // Spanish first, English underneath — the site's own default.
  assert.ok(message.text.indexOf("Tu código") < message.text.indexOf("Your Vocal Studio"));
});

test("each provider gets the request shape its API documents", () => {
  const config = { apiKey: "key-123", from: "hola@vocal.test", fromName: "Vocal Studio" };
  const message = { to: "p@example.test", ...buildLoginCodeMessage("123456", 15) };

  const resend = buildSendRequest("resend", config, message);
  assert.equal(resend.url, "https://api.resend.com/emails");
  assert.equal(resend.init.headers.authorization, "Bearer key-123");
  const resendBody = JSON.parse(resend.init.body);
  assert.equal(resendBody.from, "Vocal Studio <hola@vocal.test>");
  assert.deepEqual(resendBody.to, ["p@example.test"]);

  const brevo = buildSendRequest("brevo", config, message);
  assert.equal(brevo.url, "https://api.brevo.com/v3/smtp/email");
  assert.equal(brevo.init.headers["api-key"], "key-123");
  const brevoBody = JSON.parse(brevo.init.body);
  assert.equal(brevoBody.sender.email, "hola@vocal.test");
  assert.deepEqual(brevoBody.to, [{ email: "p@example.test" }]);

  const mailersend = buildSendRequest("mailersend", config, message);
  assert.equal(mailersend.url, "https://api.mailersend.com/v1/email");
  assert.equal(mailersend.init.headers.authorization, "Bearer key-123");

  assert.throws(() => buildSendRequest("nope", config, message), /unsupported email provider/);
});

test("sending refuses rather than pretending when nothing is configured", async () => {
  assert.equal((await sendLoginCode({}, "p@example.test", "123456", 15)).reason, "email_not_configured");
  assert.equal(
    (await sendLoginCode({ RESEND_API_KEY: "r" }, "p@example.test", "123456", 15)).reason,
    "email_from_not_configured"
  );
});

test("a successful send reports which provider took it", async () => {
  const rec = recorder();
  const result = await sendLoginCode(
    { RESEND_API_KEY: "re_x", EMAIL_FROM: "hola@vocal.test" },
    "p@example.test",
    "123456",
    15,
    { fetchImpl: rec.fetchImpl }
  );
  assert.equal(result.ok, true);
  assert.equal(result.provider, "resend");
  assert.equal(rec.calls.length, 1);
});

test("a provider rejection and a transport error are both reported, not thrown", async () => {
  const rejecting = recorder({ ok: false, status: 422 });
  const rejected = await sendLoginCode(
    { RESEND_API_KEY: "re_x", EMAIL_FROM: "hola@vocal.test" },
    "p@example.test",
    "123456",
    15,
    { fetchImpl: rejecting.fetchImpl }
  );
  assert.equal(rejected.ok, false);
  assert.equal(rejected.reason, "email_send_failed");
  assert.equal(rejected.status, 422);

  const thrown = await sendLoginCode(
    { RESEND_API_KEY: "re_x", EMAIL_FROM: "hola@vocal.test" },
    "p@example.test",
    "123456",
    15,
    {
      fetchImpl: async () => {
        throw new Error("network down");
      }
    }
  );
  assert.equal(thrown.reason, "email_transport_error");
});

test("the outgoing request never carries the API key in the body", async () => {
  const rec = recorder();
  await sendLoginCode(
    { RESEND_API_KEY: "re_secret_value", EMAIL_FROM: "hola@vocal.test" },
    "p@example.test",
    "123456",
    15,
    { fetchImpl: rec.fetchImpl }
  );
  assert.equal(rec.calls[0].init.body.includes("re_secret_value"), false);
});
