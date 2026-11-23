/**
 * When a press of the same plan goes back to the checkout this page already
 * opened (red team money-4), and when it asks the worker again. Found
 * reviewing the merge of the euro change with round two, 2026-11-23.
 *
 * The defects:
 * - Money. A European who pressed before /v1/health answered was shown
 *   US$ 7.99 and sent to a US$ checkout. Back or Stop, the card turns to
 *   7,99 € when the answer lands, and the next press went back to the US$
 *   checkout: the price shown was not the price charged (VG-85).
 * - The account. The worker refuses a second checkout while a subscription is
 *   open (409 subscription_open), but going back never asked it. Pay on the
 *   laptop, come back to the phone, press again: the phone went back to the
 *   first checkout, still payable, and a second subscription could be opened.
 *
 * The real js/billing-config.js and js/billing.js run in a vm, on the go-live
 * setting (providers.creem.apiCheckout true, patched in as the config is
 * assigned). Stood in for: the platform, and the account layer's answers
 * (/v1/health's rails, /v1/me's billingRails, /v1/me/checkout). The expected
 * outcomes are written out by hand.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ROOT = new URL("../../", import.meta.url);
const SOURCES = ["js/billing-config.js", "js/billing.js"].map((f) => readFileSync(new URL(f, ROOT), "utf8"));

function emptyStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

/**
 * A signed-in browser in `timeZone`, with a worker that opens a checkout per
 * ask unless `world.subscriptionOpen`. `world.rails` is what /v1/health has
 * said (null before it answers); `world.meRails` what /v1/me lists.
 */
function browser(language, timeZone) {
  const world = { rails: null, meRails: [], subscriptionOpen: false, meFails: false, asks: [], went: [], meAsked: 0 };
  const listeners = {};
  const account = { configured: true, signedIn: true, methods: { ok: true, email: true }, billingRails: [] };
  const win = {
    console: { ...console, warn() {} },
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
    JSON,
    Date,
    Math,
    Promise,
    Intl: { ...Intl, DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone }) }) },
    navigator: { language, languages: [language] },
    localStorage: emptyStorage(),
    sessionStorage: emptyStorage(),
    location: { href: "https://example.test/", pathname: "/", search: "", hash: "", assign: (u) => world.went.push(String(u)) },
    history: { replaceState() {} },
    addEventListener: (name, fn) => (listeners[name] ||= []).push(fn),
    removeEventListener() {},
    document: { documentElement: { lang: "es" } },
    VTLicense: { isConfigured: () => true },
    VTAccount: {
      getState: () => account,
      knownRails: () => world.rails,
      getSessionToken: () => "sess-1",
      refresh: async () => {
        world.meAsked++;
        if (world.meFails) return { ok: false, reason: "offline" };
        account.billingRails = world.meRails.slice();
        return { ok: true };
      },
      openCheckout: async (input) => {
        world.asks.push(input);
        if (world.subscriptionOpen) return { ok: false, reason: "subscription_open", provider: "creem" };
        return { ok: true, url: `https://checkout.creem.io/ch_${world.asks.length}_${input.currency}` };
      }
    }
  };
  win.window = win;
  let held;
  Object.defineProperty(win, "VT_BILLING_CONFIG", {
    configurable: true,
    enumerable: true,
    get: () => held,
    set: (v) => {
      held = { ...v, providers: { ...v.providers, creem: { ...v.providers.creem, apiCheckout: true } } };
    }
  });
  const ctx = vm.createContext(win);
  for (const src of SOURCES) vm.runInContext(src, ctx);
  const billing = win.VTBilling;
  return {
    world,
    billing,
    press: (plan = "pro_monthly") => billing.startCheckout(plan, "creem").done,
    /** Back to this page through the back/forward cache. */
    back: () => (listeners.pageshow || []).forEach((fn) => fn({ persisted: true }))
  };
}

const EURO_RAILS = { ok: true, creem: true, creemCheckout: true, creemPortal: true, creemEur: true };

test("money: a US$ checkout opened before /v1/health answered is not gone back to under a card that now shows €", async () => {
  const b = browser("es-ES", "Europe/Madrid");
  assert.equal(b.billing.formatPrice(b.billing.cfg().plans.find((p) => p.id === "pro_monthly"), "ES").text, "US$ 7.99", "precondition: the card shows dollars before the answer");
  const first = await b.press();
  assert.equal(first.url, "https://checkout.creem.io/ch_1_USD");
  b.back();
  b.world.rails = EURO_RAILS;
  const second = await b.press();
  // Wrong (before): straight back to ch_1_USD, with the worker never asked.
  assert.deepEqual(b.world.asks.map((a) => a.currency), ["USD", "EUR"]);
  assert.equal(second.url, "https://checkout.creem.io/ch_2_EUR");
  assert.deepEqual(b.world.went, ["https://checkout.creem.io/ch_1_USD", "https://checkout.creem.io/ch_2_EUR"]);
});

test("control: with the card still in the money it was opened in, the same plan goes back to the same checkout", async () => {
  const b = browser("es-ES", "Europe/Madrid");
  b.world.rails = EURO_RAILS;
  await b.press();
  b.back();
  const second = await b.press();
  assert.equal(second.url, "https://checkout.creem.io/ch_1_EUR");
  assert.equal(b.world.asks.length, 1, "the worker was asked once");
  assert.equal(b.world.meAsked, 1, "and /v1/me was asked before going back");
});

test("the account: a subscription opened on another device meanwhile sends the press to the worker, not back to the old checkout", async () => {
  const b = browser("en-US", "America/New_York");
  b.world.rails = EURO_RAILS;
  const first = await b.press();
  assert.equal(first.url, "https://checkout.creem.io/ch_1_USD");
  b.back();
  // Paid on the laptop: /v1/me now lists the subscription, and the worker would refuse a second checkout.
  b.world.meRails = ["creem"];
  b.world.subscriptionOpen = true;
  const second = await b.press();
  // Wrong (before): back to ch_1_USD, still payable, a second subscription one press away.
  assert.equal(second.ok, false);
  assert.equal(second.mode, "subscription_open");
  assert.equal(second.openProvider, "creem");
  assert.deepEqual(b.world.went, ["https://checkout.creem.io/ch_1_USD"], "the page did not go back");
  assert.equal(b.world.asks.length, 2, "the worker was asked, and answered subscription_open");
});

test("the account: when /v1/me cannot be asked, the worker decides instead of the old checkout being gone back to", async () => {
  const b = browser("en-US", "America/New_York");
  b.world.rails = EURO_RAILS;
  await b.press();
  b.back();
  b.world.meFails = true;
  const second = await b.press();
  assert.equal(second.url, "https://checkout.creem.io/ch_2_USD");
  assert.equal(b.world.asks.length, 2);
});
