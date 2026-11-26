/**
 * A stand-in account worker for two people on one browser, for the specs
 * named tests/rt2-p1-*.spec.js (red team round two, group P1: checkouts that
 * open, sessions that change while a request is out, and the pending link).
 *
 * It answers at the shipped worker's own host, which the page's Content
 * Security Policy allows, so the page runs under its real policy. Each person
 * has a session token; every request is noted with whose session it carried,
 * so a case reads "which account asked" from what reached the worker rather
 * than from which function ran. Any route can be held (`hold(worker, path)`)
 * until the case lets it answer, which is how an answer is made to land after
 * a sign-out. Licence tokens are signed with a throwaway key
 * (tests/helpers/billing.js mintLicense), so the check that grants Pro is the
 * real one.
 */
const { expect } = require("@playwright/test");
const { patchBillingConfig } = require("./billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev";
const DAY = 86400;
const CODE = "424242";
/** The two people. `token` is the session the worker issues each of them. */
const ANA = { key: "ana", id: "acct_p1_ana", email: "ana@example.test", token: "sess-p1-ana" };
const BRUNO = { key: "bruno", id: "acct_p1_bruno", email: "bruno@example.test", token: "sess-p1-bruno" };
const PEOPLE = [ANA, BRUNO];
/** A licence id as the worker mints them: 43 base64url characters. */
const LIC = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";
/** Creem's checkout page and portal for each person, so a navigation says whose it was. */
const checkoutPage = (person) => `https://checkout.creem.io/ch_bound_${person.key}`;
const portalPage = (person) => `https://creem.io/my-orders/login/cust_${person.key}`;
/** Creem sold through the worker, as at go-live (docs/40 step 5). */
const ON_SALE = { rails: { creem: { apiCheckout: true } } };

/**
 * Mutable state of the stand-in worker.
 * - `sent`: every request, as `{path, who, body}` (`who`: account id, or null).
 * - `answers`: per path, a function `(who, body) => [status, body]` or a fixed
 *   `[status, body]`, in place of the default.
 * - `held`: per path, the gates the next requests wait on, one each (see `hold`).
 * - `pro`: account ids with a paid Creem licence; `billingRails` per account.
 * - `landed`: checkout ids whose webhook has arrived (their link answers 200).
 */
function freshWorker(over) {
  return { sent: [], answers: {}, held: {}, pro: new Set(), billingRails: {}, landed: new Set(), ...(over || {}) };
}

/**
 * Hold the next request to `path` that is not held already, until the
 * returned function is called; it then gets its normal answer, or `answer`.
 * Two holds on a path hold its next two requests, in the order they come.
 * @returns {(answer?: [number, object]) => void} Let it answer.
 */
function hold(worker, path) {
  let release;
  const gate = new Promise((resolve) => (release = resolve));
  (worker.held[path] = worker.held[path] || []).push(gate);
  return (answer) => release(answer || null);
}

/** The requests to `path` that reached the worker, as `{who, body}`. */
function sentTo(worker, path) {
  return worker.sent.filter((r) => r.path === path).map(({ who, body }) => ({ who, body }));
}

/** The claims of a paid Creem licence; `accountId` only on one minted for an account. */
function licenceClaims(accountId) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: "vocal-studio-entitlements",
    sub: LIC,
    aud: BASE,
    plan: "pro_monthly",
    status: "active",
    provider: "creem",
    iat: now,
    exp: now + 3 * DAY,
    periodEnd: now + 30 * DAY,
    ...(accountId ? { accountId, source: "paid" } : {})
  };
}

/** The `/v1/me` body for `person` as the account now stands. */
async function meBody(worker, person, license) {
  const pro = worker.pro.has(person.id);
  const ent = pro
    ? { pro: true, plan: "pro_monthly", status: "active", source: "paid", provider: "creem", periodEnd: Math.floor(Date.now() / 1000) + 30 * DAY }
    : { pro: false, plan: null, status: "free", source: null, periodEnd: null };
  const token = pro ? await license.sign(licenceClaims(person.id)) : null;
  return {
    ok: true,
    account: { id: person.id, email: person.email, trialUsed: true },
    entitlement: ent,
    grants: [],
    paid: [],
    licenseId: pro ? LIC : null,
    token,
    billingRails: worker.billingRails[person.id] || (pro ? ["creem"] : [])
  };
}

/** Routes anybody may call. */
async function openAnswer(worker, path, body, license) {
  if (path === "/v1/events") return [200, { ok: true }];
  if (path === "/v1/auth/methods") return [200, { ok: true, email: true, google: false, googleClientId: null, trialDays: 7 }];
  if (path === "/v1/claim") return [202, { ok: false, reason: "pending" }];
  if (path === "/v1/health") {
    return [200, { ok: true, signingKeyConfigured: true, accountsConfigured: true, creemConfigured: true, creemCheckoutConfigured: true, creemPortalConfigured: true, mercadopagoConfigured: true, siteOrigin: BASE }];
  }
  if (path === "/v1/auth/email/start") return [200, { ok: true }];
  if (path === "/v1/auth/email/verify") {
    const person = PEOPLE.find((p) => p.email === body.email);
    if (!person || body.code !== CODE) return [400, { ok: false, reason: "bad_code" }];
    return [200, { ...(await meBody(worker, person, license)), sessionToken: person.token, expiresAt: 4102444800 }];
  }
  if (path === "/v1/auth/logout") return [200, { ok: true }];
  return null;
}

/** Routes that need a session, answered for `person`. */
async function accountAnswer(worker, person, path, body, license) {
  if (path === "/v1/me") return [200, await meBody(worker, person, license)];
  if (path === "/v1/me/link") {
    if (body.sessionId && !worker.landed.has(body.sessionId)) return [202, { ok: false, reason: "pending" }];
    worker.pro.add(person.id);
    return [200, await meBody(worker, person, license)];
  }
  if (path === "/v1/me/checkout") return [200, { ok: true, url: checkoutPage(person), plan: body.plan, provider: "creem" }];
  if (path === "/v1/me/billing-portal") return [200, { ok: true, url: portalPage(person), provider: "creem" }];
  if (path === "/v1/me/progress") return [200, { ok: true, profiles: [], rev: 0, doc: null, updatedAt: 1 }];
  return [404, { ok: false, reason: "not_found" }];
}

/** What the stand-in worker answers, as `[status, body]`. */
async function answer(worker, license, request) {
  const path = new URL(request.url()).pathname;
  let body = {};
  try {
    body = request.postDataJSON() || {};
  } catch {
    body = {};
  }
  const bearer = (request.headers().authorization || "").replace(/^Bearer /, "");
  const person = PEOPLE.find((p) => p.token === bearer) || null;
  worker.sent.push({ path, who: person ? person.id : null, body });
  const queue = worker.held[path];
  const given = queue && queue.length ? await queue.shift() : null;
  if (given) return given;
  const fixed = worker.answers[path];
  if (fixed) return typeof fixed === "function" ? fixed(person, body) : fixed;
  const open = await openAnswer(worker, path, body, license);
  if (open) return open;
  if (!person) return [401, { ok: false, reason: "no_session" }];
  return accountAnswer(worker, person, path, body, license);
}

/**
 * Stand the worker in and seed the browser. Returns where the page navigated
 * to: Creem's pages answer as `creem` says ("ok" by default; "stopped" loads
 * for a moment and is then cancelled, net::ERR_ABORTED, which is what Stop or
 * Esc does to a slow page, and the page stays; "empty" answers 204, so the
 * navigation does not commit and the page keeps its DOM).
 * @param {{config?: object, session?: object|null, stored?: string, pending?: any, pendingList?: object[], creem?: string, lang?: string}} [opts]
 */
async function install(page, worker, license, opts) {
  const o = opts || {};
  const navigations = [];
  await patchBillingConfig(page, {
    verification: { publicKeyJwk: license.publicKeyJwk, required: true, revalidateHours: 24 * 365 },
    ...(o.config || {})
  });
  await page.route(`${API}/**`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    }
    const [status, body] = await answer(worker, license, route.request());
    return route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  });
  for (const glob of ["https://checkout.creem.io/**", "https://creem.io/**"]) {
    await page.route(glob, (route) => {
      navigations.push(route.request().url());
      if (o.creem === "stopped") return new Promise((resolve) => setTimeout(resolve, 1500)).then(() => route.abort("aborted"));
      if (o.creem === "empty") return route.fulfill({ status: 204, body: "" });
      return route.fulfill({ status: 200, contentType: "text/html", body: "<p>Creem</p>" });
    });
  }
  await page.addInitScript((seed) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", seed.lang);
      sessionStorage.setItem("vt_e2e", "1");
      // app.js hides toasts under vt_e2e; some of these cases are about what the person is told.
      sessionStorage.setItem("vt_debug", "1");
      if (!sessionStorage.getItem("vt_seeded")) {
        sessionStorage.setItem("vt_seeded", "1");
        if (seed.session) localStorage.setItem("vt_account_session_v1", JSON.stringify({ token: seed.session, expiresAt: 4102444800 }));
        if (seed.stored) localStorage.setItem("vt_license_v1", JSON.stringify({ licenseId: seed.lic, token: seed.stored, storedAt: new Date().toISOString() }));
        // `pending`: under the old key, as the shipped page (or a tab still
        // running it) keeps it; `pendingList`: the list, under its own key.
        if (seed.pending) localStorage.setItem("vt_pending_link_v1", JSON.stringify(seed.pending));
        if (seed.pendingList) localStorage.setItem("vt_pending_links_v2", JSON.stringify(seed.pendingList));
      }
    } catch {
      /* ignore */
    }
    // Every toast the page shows, in order, so "nothing was said" is read from a record.
    window.__toasts = [];
    document.addEventListener("DOMContentLoaded", () => {
      const el = document.querySelector("#toast");
      if (!el) return;
      new MutationObserver(() => {
        if (el.textContent) window.__toasts.push(el.textContent);
      }).observe(el, { childList: true, characterData: true, subtree: true });
    });
  }, { session: o.session === undefined ? ANA.token : o.session && o.session.token, stored: o.stored || null, lic: LIC, pending: o.pending || null, pendingList: o.pendingList || null, lang: o.lang || "en" });
  return { navigations };
}

/** Load a page of the site and wait for the account layer. */
async function open(page, query) {
  await page.goto(`${BASE}/index.html${query || ""}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTBilling && !!window.VTAccount && !!window.VTLicense, null, { timeout: 10000 });
}

/** Wait until the page's account is `person` (null: nobody signed in). */
async function accountIs(page, person) {
  await expect
    .poll(() => page.evaluate(() => window.VTAccount.getState().account?.id || null), { timeout: 10000 })
    .toBe(person ? person.id : null);
}

/** Sign out and sign `person` in, in this tab, through the account layer the panel calls. */
async function switchTo(page, person) {
  await page.evaluate(() => window.VTAccount.signOut());
  const res = await page.evaluate(([email, code]) => window.VTAccount.verifyEmailCode(email, code), [person.email, CODE]);
  expect(res, `precondition: ${person.key} signed in`).toMatchObject({ ok: true });
  await accountIs(page, person);
}

/** What this browser's licence says right now. */
function licenceNow(page) {
  return page.evaluate(() => {
    const claims = window.VTLicense.getClaims();
    return { pro: !!claims, provider: claims?.provider || null, accountId: claims?.accountId || null };
  });
}

/** The pending links as stored under the list's key, or null when none is. */
function pendingLinks(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("vt_pending_links_v2") || "null"));
}

/** What is under the old key (one object, as the shipped page writes it), or null. */
function legacyPending(page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("vt_pending_link_v1") || "null"));
}

/** Open the Pro dialog. */
async function openPricing(page) {
  await page.locator("#btn-pro, #btn-pricing, [data-open-pricing]").first().click();
  await expect(page.locator("#pricing-modal")).toBeVisible();
}

/** A plan's button in the Pro dialog. */
function planButton(page, plan) {
  return page.locator(`#pricing-modal .plan-cta[data-plan="${plan}"]`);
}

/**
 * Every plan and rail button in the Pro dialog: what it says, whether it can
 * be pressed, and how it is drawn (`dimmed`: its computed opacity is below 1,
 * which is how the page draws a control that cannot be pressed).
 */
function dialogButtons(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("#pricing-modal .plan-cta, #pricing-modal .rail-btn")].map((b) => ({
      id: b.dataset.plan || `rail:${b.dataset.rail}`,
      text: b.textContent.trim(),
      disabled: b.disabled,
      ariaDisabled: b.getAttribute("aria-disabled"),
      busy: b.getAttribute("aria-busy"),
      dimmed: Number(getComputedStyle(b).opacity) < 1
    }))
  );
}

module.exports = {
  BASE,
  API,
  CODE,
  ANA,
  BRUNO,
  LIC,
  ON_SALE,
  checkoutPage,
  portalPage,
  freshWorker,
  hold,
  sentTo,
  licenceClaims,
  install,
  open,
  accountIs,
  switchTo,
  licenceNow,
  pendingLinks,
  legacyPending,
  openPricing,
  planButton,
  dialogButtons
};
