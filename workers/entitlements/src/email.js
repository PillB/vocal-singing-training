/**
 * Transactional email for sign-in codes.
 *
 * Deliberately provider-agnostic and dependency-free: pick a provider by
 * setting its API key as a worker secret and nothing else changes. All of them
 * are one authenticated JSON POST, so there is no SDK worth the weight.
 *
 * Supported, chosen by whichever secret is present:
 *   EMAIL_PROVIDER=resend     + RESEND_API_KEY
 *   EMAIL_PROVIDER=brevo      + BREVO_API_KEY
 *   EMAIL_PROVIDER=mailersend + MAILERSEND_API_KEY
 *
 * When no provider is configured the sender refuses rather than pretending, so
 * the sign-in route can answer "email sign-in is not available here" instead of
 * leaving somebody waiting for a code that was never sent. Google sign-in does
 * not touch this module and works with no email provider at all.
 */

"use strict";

/** Providers this module knows how to talk to. */
export const EMAIL_PROVIDERS = ["resend", "brevo", "mailersend"];

/**
 * Resolve which provider to use and with what credentials.
 * @param {Object} env Worker env bindings.
 * @returns {{provider: string|null, apiKey: string, from: string, fromName: string}} Configuration.
 */
export function resolveEmailConfig(env) {
  const declared = String((env && env.EMAIL_PROVIDER) || "").trim().toLowerCase();
  const keys = {
    resend: (env && env.RESEND_API_KEY) || "",
    brevo: (env && env.BREVO_API_KEY) || "",
    mailersend: (env && env.MAILERSEND_API_KEY) || ""
  };
  const provider = EMAIL_PROVIDERS.includes(declared) && keys[declared]
    ? declared
    : EMAIL_PROVIDERS.find((name) => keys[name]) || null;
  return {
    provider,
    apiKey: provider ? String(keys[provider]) : "",
    from: String((env && env.EMAIL_FROM) || "").trim(),
    fromName: String((env && env.EMAIL_FROM_NAME) || "Vocal Studio").trim()
  };
}

/**
 * True when email sign-in can actually deliver.
 * @param {Object} env Worker env bindings.
 * @returns {boolean} Whether a provider and a from-address are configured.
 */
export function emailConfigured(env) {
  const config = resolveEmailConfig(env);
  return Boolean(config.provider && config.apiKey && config.from);
}

/**
 * Plain-text and HTML bodies for a sign-in code.
 *
 * Spanish first with English underneath, matching the site's own default. The
 * code is shown in both bodies because plenty of mail clients strip HTML.
 *
 * @param {string} code The login code.
 * @param {number} minutes How long it stays valid.
 * @returns {{subject: string, text: string, html: string}} Message bodies.
 */
export function buildLoginCodeMessage(code, minutes) {
  const subject = `${code} — Vocal Studio`;
  const text = [
    `Tu código para entrar a Vocal Studio es: ${code}`,
    `Vence en ${minutes} minutos. Si no lo pediste, ignora este correo.`,
    "",
    `Your Vocal Studio sign-in code is: ${code}`,
    `It expires in ${minutes} minutes. If you did not request it, ignore this email.`
  ].join("\n");
  const html = [
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:16px;line-height:1.5;color:#1a1a1a">',
    "<p>Tu código para entrar a <strong>Vocal Studio</strong>:</p>",
    `<p style="font-size:32px;font-weight:700;letter-spacing:6px;margin:24px 0">${code}</p>`,
    `<p>Vence en ${minutes} minutos. Si no lo pediste, ignora este correo.</p>`,
    '<hr style="border:none;border-top:1px solid #e5e5e5;margin:24px 0">',
    "<p>Your sign-in code for <strong>Vocal Studio</strong> is above.</p>",
    `<p>It expires in ${minutes} minutes. If you did not request it, ignore this email.</p>`,
    "</div>"
  ].join("");
  return { subject, text, html };
}

/**
 * Build the provider-specific request for one message.
 * @param {string} provider Provider id.
 * @param {{apiKey: string, from: string, fromName: string}} config Credentials.
 * @param {{to: string, subject: string, text: string, html: string}} message Message.
 * @returns {{url: string, init: Object}} Fetch arguments.
 */
export function buildSendRequest(provider, config, message) {
  if (provider === "resend") {
    return {
      url: "https://api.resend.com/emails",
      init: {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          from: config.fromName ? `${config.fromName} <${config.from}>` : config.from,
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html
        })
      }
    };
  }
  if (provider === "brevo") {
    return {
      url: "https://api.brevo.com/v3/smtp/email",
      init: {
        method: "POST",
        headers: {
          "api-key": config.apiKey,
          "content-type": "application/json",
          accept: "application/json"
        },
        body: JSON.stringify({
          sender: { email: config.from, name: config.fromName || undefined },
          to: [{ email: message.to }],
          subject: message.subject,
          textContent: message.text,
          htmlContent: message.html
        })
      }
    };
  }
  if (provider === "mailersend") {
    return {
      url: "https://api.mailersend.com/v1/email",
      init: {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.apiKey}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          from: { email: config.from, name: config.fromName || undefined },
          to: [{ email: message.to }],
          subject: message.subject,
          text: message.text,
          html: message.html
        })
      }
    };
  }
  throw new Error(`unsupported email provider: ${provider}`);
}

/**
 * Send a sign-in code.
 *
 * Nothing here logs the address or the code: a delivery failure reports the
 * provider and the HTTP status and stops there.
 *
 * @param {Object} env Worker env bindings.
 * @param {string} to Recipient email.
 * @param {string} code Login code.
 * @param {number} minutes Validity in minutes.
 * @param {{fetchImpl?: function}} [options] Injectable fetch, for tests.
 * @returns {Promise<{ok: boolean, reason?: string, provider?: string, status?: number}>} Result.
 */
export async function sendLoginCode(env, to, code, minutes, options) {
  const config = resolveEmailConfig(env);
  if (!config.provider || !config.apiKey) {
    return { ok: false, reason: "email_not_configured" };
  }
  if (!config.from) {
    return { ok: false, reason: "email_from_not_configured" };
  }
  const message = { to, ...buildLoginCodeMessage(code, minutes) };
  const { url, init } = buildSendRequest(config.provider, config, message);
  const doFetch = (options && options.fetchImpl) || fetch;
  let response;
  try {
    response = await doFetch(url, init);
  } catch {
    return { ok: false, reason: "email_transport_error", provider: config.provider };
  }
  if (!response.ok) {
    console.warn("login code send failed", config.provider, response.status);
    return { ok: false, reason: "email_send_failed", provider: config.provider, status: response.status };
  }
  return { ok: true, provider: config.provider, status: response.status };
}
