/**
 * Every state the account and Pro surfaces can be in, walked one at a time.
 *
 * The site's owner asked for exactly this: "consider all permutations of ui
 * states for the page and how each would be seen by the user by toggling
 * options on and off and visibilities". An audit of the code and of a real
 * browser found 32 of 34 reachable states saying something wrong, misleading or
 * unreachable — two elements both claiming "Pro", a free trial wearing the paid
 * colour, a staff login put in front of visitors as their only option, a panel
 * with nothing on it at all.
 *
 * So the states are the test. Each case fixes the flags that produce one state
 * and asserts what a person would read, in the header and in the panel, rather
 * than asserting that a function was called. The worker is stubbed at the
 * network boundary, and the licence tokens are really signed, so the check that
 * decides Pro is the real one.
 */
const { test, expect } = require("@playwright/test");
const { mintLicense, patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://entitlements.test";
const DAY = 86400;
const CLIENT_ID = "test.apps.googleusercontent.com";

/** Google-only, which is what the site actually ships. */
const GOOGLE_ONLY = { email: false, google: true, googleClientId: CLIENT_ID, trialDays: 7 };

/**
 * Point the site at a stubbed worker and answer as one given account.
 *
 * @param {import('@playwright/test').Page} page Page.
 * @param {object} opts Stub shape: `methods`, `account`, `entitlement`, plus
 *   `signedIn` to seed a session, `offline` to refuse every call and `silent` to
 *   accept the connection and never answer.
 * @param {{publicKeyJwk: object, sign: function}|null} license Signing material.
 */
async function install(page, opts, license) {
  const o = opts || {};
  await patchBillingConfig(page, {
    verification: {
      apiBaseUrl: o.apiBaseUrl === undefined ? API : o.apiBaseUrl,
      ...(license ? { publicKeyJwk: license.publicKeyJwk } : {}),
      required: true,
      revalidateHours: 24 * 365
    }
  });
  if (o.blockGoogle) await page.route("https://accounts.google.com/**", (r) => r.abort("failed"));
  if (o.apiBaseUrl === "") return;

  await page.route(`${API}/**`, async (route) => {
    if (o.offline) return route.abort("failed");
    if (o.silent) return; // accepted and never answered
    const url = new URL(route.request().url());
    const json = (status, data) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(data)
      });
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    }
    if (url.pathname === "/v1/auth/methods") {
      return json(200, { ok: true, ...(o.methods || GOOGLE_ONLY) });
    }
    if (url.pathname === "/v1/me") {
      if (!o.account) return json(401, { ok: false, reason: "no_session" });
      const ent = o.entitlement || { pro: false, plan: null, status: "free", source: null, periodEnd: null };
      let token = null;
      if (ent.pro && license) {
        const now = Math.floor(Date.now() / 1000);
        token = await license.sign({
          iss: "vocal-studio-entitlements",
          sub: "grant_state_0001",
          aud: BASE,
          plan: ent.plan,
          status: ent.status,
          provider: ent.provider || "grant",
          iat: now,
          exp: ent.periodEnd,
          periodEnd: ent.periodEnd,
          accountId: o.account.id,
          source: ent.source
        });
      }
      return json(200, {
        ok: true,
        account: o.account,
        entitlement: ent,
        grants: [],
        paid: [],
        licenseId: ent.pro ? "grant_state_0001" : null,
        token
      });
    }
    return json(404, { ok: false, reason: "not_found" });
  });

  if (o.signedIn) {
    await page.addInitScript(() => {
      localStorage.setItem(
        "vt_account_session_v1",
        JSON.stringify({ token: "sess-state-1", expiresAt: 4102444800 })
      );
    });
  }
}

/** Load home and let the account layer settle. */
async function boot(page) {
  await page.addInitScript(() => sessionStorage.setItem("vt_e2e", "1"));
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTBilling && !!window.VTAccount);
}

/** What the header says, reading only what is actually on screen. */
async function header(page) {
  return page.evaluate(() => {
    const shown = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return null;
      return (el.textContent || "").trim();
    };
    const pill = document.querySelector("#billing-pill");
    return {
      door: shown("#btn-account"),
      pro: shown("#btn-pricing"),
      pill: pill && !pill.hidden ? (pill.textContent || "").trim() : null,
      pillKind: pill ? pill.className.replace("billing-pill", "").trim() : null
    };
  });
}

/** Open the account panel, from the phone menu if that is where the door is. */
async function openPanel(page) {
  if (await page.locator("#btn-more").isVisible()) {
    if (!(await page.locator("#btn-account").isVisible())) await page.click("#btn-more");
  }
  await page.click("#btn-account");
  await expect(page.locator("#account-modal")).toBeVisible();
}

test.describe("Signed out: the door says what pressing it does", () => {
  test("with a worker that offers Google, the header invites a sign-in and offers Pro", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {}, license);
    await boot(page);
    const h = await header(page);
    // "Cuenta" is a destination; nobody without an account has a reason to press
    // a destination. This is the owner's first complaint, in one assertion.
    expect(h.door).toBe("Entrar");
    // Exactly one element mentions Pro, and it is the offer.
    expect(h.pro).toBe("Pro");
    expect(h.pill).toBeNull();
  });

  test("the offer is styled as an offer, and its text clears contrast on the bar", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {}, license);
    await boot(page);
    const seen = await page.evaluate(() => {
      const el = document.querySelector("#btn-pricing");
      const cs = getComputedStyle(el);
      const lum = (c) => {
        const [r, g, b] = c.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (a, b) => {
        const l1 = Math.max(lum(a), lum(b));
        const l2 = Math.min(lum(a), lum(b));
        return (l1 + 0.05) / (l2 + 0.05);
      };
      return {
        gradient: cs.backgroundImage,
        contrast: ratio(cs.color, "rgb(14, 19, 25)"),
        label: (el.textContent || "").trim()
      };
    });
    // The old chip was a gold-to-purple gradient at 25% alpha over a near-black
    // bar: invisible as a fill, so what shouted was gold 800-weight text with no
    // button around it. It reads as a badge you hold, which is complaint two.
    expect(seen.gradient).toBe("none");
    expect(seen.contrast).toBeGreaterThanOrEqual(4.5);
    expect(seen.label).toBe("Pro");
  });

  test("a worker that cannot be reached offers a retry, not a staff login", async ({ page }) => {
    await install(page, { offline: true }, null);
    await boot(page);
    await openPanel(page);
    await expect(page.locator("#account-offline")).toBeVisible();
    await expect(page.locator("#account-retry")).toBeVisible();
    // The staff form used to expand itself here and take focus.
    expect(await page.locator(".account-internal").evaluate((d) => d.open)).toBe(false);
    await expect(page.locator("#login-username")).toBeHidden();
  });

  test("a worker that says Google but carries no client id is no method at all", async ({ page }) => {
    // Google's script needs the id to draw its button. Answering google:true
    // without one left a modal holding a title, a promise and a close button.
    await install(page, { methods: { email: false, google: true, googleClientId: null, trialDays: 30 } }, null);
    await boot(page);
    await openPanel(page);
    await expect(page.locator("#account-signin")).toBeHidden();
    await expect(page.locator("#account-unconfigured")).toBeVisible();
    await expect(page.locator("#account-retry")).toBeVisible();
    const controls = await page.locator("#account-modal button:visible").count();
    expect(controls, "the panel always has something to press").toBeGreaterThanOrEqual(2);
  });

  test("the panel leads with what an account is for, not with a method", async ({ page }) => {
    // Mozilla's Persona A/B test (226,104 widget impressions) measured a door
    // named only for returning users at 17 accounts against 212 for one that
    // also named account creation. The one button here does both, so the copy
    // carries it: what this makes, what it costs, and that it works either way.
    const license = await mintLicense({ origin: BASE });
    await install(page, {}, license);
    await boot(page);
    await openPanel(page);
    // The heading names the outcome rather than the room.
    await expect(page.locator("#account-title")).toHaveText("Guarda tu progreso");
    const offer = page.locator("#account-offer");
    await expect(offer).toBeVisible();
    const text = await offer.textContent();
    // The zero price has to be literal: the word, the number of days, no card.
    expect(text).toMatch(/gratis/i);
    expect(text).toMatch(/7 días/);
    expect(text).toMatch(/sin tarjeta/i);
    expect(text).toMatch(/si ya tienes cuenta/i);
    // And it comes before the method button, not after it. Asserted on document
    // order rather than geometry: Google's container is an empty div here,
    // because its script is not reachable from a test run, so it has no box.
    const offerIsFirst = await page.evaluate(() => {
      const a = document.querySelector("#account-offer");
      const b = document.querySelector("#account-google");
      return !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(offerIsFirst).toBe(true);
    // It must clear the 12px floor, because it carries the price.
    const size = await offer.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(12);
  });

  test("no sign-in means no promise of a free trial", async ({ page }) => {
    // Naming a free trial beside a notice saying sign-in is off is the worst of
    // both, so the offer line belongs only to states that can act.
    await install(page, { offline: true }, null);
    await boot(page);
    await openPanel(page);
    await expect(page.locator("#account-offline")).toBeVisible();
    await expect(page.locator("#account-offer")).toBeHidden();
  });

  test("on a Google-only deploy the divider has nothing to divide, so it is gone", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {}, license);
    await boot(page);
    await openPanel(page);
    await expect(page.locator("#account-or")).toBeHidden();
  });

  test("with both methods the divider comes back", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, { methods: { email: true, google: true, googleClientId: CLIENT_ID, trialDays: 30 } }, license);
    await boot(page);
    await openPanel(page);
    await expect(page.locator("#account-email-form")).toBeVisible();
    await expect(page.locator("#account-or")).toBeVisible();
  });
});

test.describe("Signed in: the header names which kind of access this is", () => {
  const account = (over) => ({
    id: "acct_state",
    email: "pablo@example.test",
    displayName: null,
    locale: null,
    role: "member",
    trialUsed: false,
    createdAt: 1,
    ...(over || {})
  });
  const ends = (days) => Math.floor(Date.now() / 1000) + days * DAY;

  test("a granted trial reads as a trial, not the paid green", async ({ page }) => {
    // This is the state the owner was in when he wrote. The header said "PRO" in
    // the colour a subscription wears, beside a second element also saying Pro.
    const license = await mintLicense({ origin: BASE });
    await install(page, {
      signedIn: true,
      account: account({ trialUsed: true }),
      entitlement: { pro: true, plan: "pro_monthly", status: "active", source: "trial", periodEnd: ends(27) }
    }, license);
    await boot(page);
    await expect(page.locator("#billing-pill")).toBeVisible();
    const h = await header(page);
    expect(h.pill).toMatch(/^Prueba · \d+ d$/);
    expect(h.pillKind).toContain("is-trial");
    // The other element stops saying Pro and becomes the way to the plan.
    expect(h.pro).toBe("Suscripción");
    expect(h.door).toBe("pablo");
  });

  test("and the Pro dialog calls it a free trial, not pro_monthly", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {
      signedIn: true,
      account: account({ trialUsed: true }),
      entitlement: { pro: true, plan: "pro_monthly", status: "active", source: "trial", periodEnd: ends(27) }
    }, license);
    await boot(page);
    await page.click("#btn-pricing");
    await expect(page.locator("#pricing-modal")).toBeVisible();
    const status = await page.locator("#pricing-status").textContent();
    // It used to print an internal plan id at a reader, and call a free trial a
    // monthly subscription in the same breath.
    expect(status).not.toContain("pro_monthly");
    expect(status).toContain("Mes de prueba");
  });

  test("a gifted month says gifted, and when it ends", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {
      signedIn: true,
      account: account(),
      entitlement: { pro: true, plan: "pro_monthly", status: "active", source: "gift", periodEnd: ends(12) }
    }, license);
    await boot(page);
    await expect(page.locator("#billing-pill")).toBeVisible();
    const h = await header(page);
    expect(h.pill).toBe("Regalo");
    expect(h.pillKind).toContain("is-gift");
    await page.click("#btn-pricing");
    expect(await page.locator("#pricing-status").textContent()).toMatch(/regalo/i);
  });

  test("a subscription that will not renew says so instead of 'active'", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {
      signedIn: true,
      account: account(),
      entitlement: { pro: true, plan: "pro_monthly", status: "canceled", source: "paid", periodEnd: ends(9) }
    }, license);
    await boot(page);
    const h = await header(page);
    expect(h.pill).toBe("Pro · termina");
    expect(h.pillKind).toContain("is-ending");
    await page.click("#btn-pricing");
    expect(await page.locator("#pricing-status").textContent()).toMatch(/no se renueva/i);
  });

  test("a paid subscriber gets the paid green and one Pro element", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {
      signedIn: true,
      account: account(),
      entitlement: { pro: true, plan: "pro_yearly", status: "active", source: "paid", periodEnd: ends(300) }
    }, license);
    await boot(page);
    const h = await header(page);
    expect(h.pill).toBe("Pro");
    expect(h.pillKind).not.toContain("is-trial");
    expect(h.pro).toBe("Suscripción");
    // The whole point: never two elements claiming the same thing.
    expect([h.pill, h.pro].filter((t) => t === "Pro")).toHaveLength(1);
  });

  test("someone who has spent their free trial is told where they stand", async ({ page }) => {
    // The dead end: the most interested person in the product, with checkout
    // closed, used to be shown nothing at all.
    const license = await mintLicense({ origin: BASE });
    await install(page, {
      signedIn: true,
      account: account({ trialUsed: true }),
      entitlement: { pro: false, plan: null, status: "free", source: null, periodEnd: null }
    }, license);
    await boot(page);
    await page.click("#btn-pricing");
    await expect(page.locator("#pricing-modal")).toBeVisible();
    await expect(page.locator("#pricing-spent")).toBeVisible();
    await expect(page.locator("#btn-start-trial")).toBeHidden();
    expect(await page.locator("#pricing-spent").textContent()).toMatch(/gratis/i);
  });

  test("the panel stops asking a signed-in person to sign in", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {
      signedIn: true,
      account: account(),
      entitlement: { pro: false, plan: null, status: "free", source: null, periodEnd: null }
    }, license);
    await boot(page);
    await openPanel(page);
    await expect(page.locator("#account-logged-in")).toBeVisible();
    expect(await page.locator("#account-sub").textContent()).not.toMatch(/Entra para/i);
    // The heading and the offer belong to the signed-out panel only.
    await expect(page.locator("#account-title")).toHaveText("Cuenta");
    await expect(page.locator("#account-offer")).toBeHidden();
  });
});

test.describe("The same states in English", () => {
  test("the door and the offer both translate", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {}, license);
    await boot(page);
    await page.click("#btn-lang");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    const h = await header(page);
    expect(h.door).toBe("Sign in");
    expect(h.pro).toBe("Pro");
  });

  test("a trial pill translates and keeps its days", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {
      signedIn: true,
      account: { id: "a", email: "x@example.test", displayName: null, locale: null, role: "member", trialUsed: true, createdAt: 1 },
      entitlement: { pro: true, plan: "pro_monthly", status: "active", source: "trial", periodEnd: Math.floor(Date.now() / 1000) + 5 * DAY }
    }, license);
    await boot(page);
    await expect(page.locator("#billing-pill")).toBeVisible();
    await page.click("#btn-lang");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect((await header(page)).pill).toMatch(/^Trial · \d+ d$/);
  });
});

test.describe("Phone: the door is on the row, not in the menu", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("signed out, one tap reaches the panel", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {}, license);
    await boot(page);
    await expect(page.locator("#btn-more")).toBeVisible();
    const door = page.locator("#btn-account");
    await expect(door).toBeVisible();
    expect((await door.boundingBox()).height).toBeGreaterThanOrEqual(44);
    await door.click();
    await expect(page.locator("#account-modal")).toBeVisible();
  });

  test("on a trial the pill is readable without opening anything", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {
      signedIn: true,
      account: { id: "a", email: "x@example.test", displayName: null, locale: null, role: "member", trialUsed: true, createdAt: 1 },
      entitlement: { pro: true, plan: "pro_monthly", status: "active", source: "trial", periodEnd: Math.floor(Date.now() / 1000) + 20 * DAY }
    }, license);
    await boot(page);
    const pill = page.locator("#billing-pill");
    await expect(pill).toBeVisible();
    // It carries meaning, so it holds the 12px floor — its old 0.72rem rendered
    // at 11.52px everywhere the phone media query did not reach.
    const size = await pill.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(12);
  });
});

test.describe("The same claim wherever it appears", () => {
  const NOW = () => Math.floor(Date.now() / 1000);
  const member = {
    id: "a",
    email: "x@example.test",
    displayName: null,
    locale: null,
    role: "member",
    trialUsed: true,
    createdAt: 1
  };

  /** What the home card's plan tag says, and which colour it wears. */
  async function homeTag(page) {
    return page.evaluate(() => {
      const el = document.querySelector("#value-pulse-tag");
      if (!el || el.hidden) return null;
      return { text: (el.textContent || "").trim(), kind: el.className.replace("value-pulse-tag", "").trim() };
    });
  }

  test("a granted trial reads as a trial on the home card too", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {
      signedIn: true,
      account: member,
      entitlement: { pro: true, plan: "pro_monthly", status: "active", source: "trial", periodEnd: NOW() + 12 * DAY }
    }, license);
    await boot(page);
    await expect(page.locator("#billing-pill")).toBeVisible();
    // The card a visitor sees first used to say PRO here, in the paid green,
    // because it tested VTBilling's own trial flag and a worker-granted trial
    // does not set it. Two elements, one truth.
    await expect.poll(() => homeTag(page).then((t) => t && t.kind)).toBe("is-trial");
    const tag = await homeTag(page);
    expect(tag.text).toMatch(/^Prueba · \d+d$/);
    expect(tag.text).not.toMatch(/Pro/);
  });

  test("a gifted month reads as a gift on the home card", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {
      signedIn: true,
      account: { ...member, trialUsed: false },
      entitlement: { pro: true, plan: "pro_monthly", status: "active", source: "gift", periodEnd: NOW() + 20 * DAY }
    }, license);
    await boot(page);
    await expect.poll(() => homeTag(page).then((t) => t && t.kind)).toBe("is-gift");
    expect((await homeTag(page)).text).toBe("Regalo");
  });

  test("a paid subscription still reads as Pro on the home card", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {
      signedIn: true,
      account: { ...member, trialUsed: false },
      entitlement: { pro: true, plan: "pro_monthly", status: "active", source: "paid", periodEnd: NOW() + 28 * DAY }
    }, license);
    await boot(page);
    await expect.poll(() => homeTag(page).then((t) => t && t.kind)).toBe("is-pro");
    expect((await homeTag(page)).text).toBe("Pro");
  });

  test("a free visitor's home card says free, not nothing", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {}, license);
    await boot(page);
    expect((await homeTag(page)).kind).toBe("is-free");
  });
});

test.describe("Reload and offline: a trial must not become a subscription", () => {
  const NOW = () => Math.floor(Date.now() / 1000);
  const member = {
    id: "a",
    email: "x@example.test",
    displayName: null,
    locale: null,
    role: "member",
    trialUsed: true,
    createdAt: 1
  };

  test("a signed-in trial reloaded with the worker unreachable still says Prueba", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {
      signedIn: true,
      account: member,
      entitlement: { pro: true, plan: "pro_monthly", status: "active", source: "trial", periodEnd: NOW() + 9 * DAY }
    }, license);
    await boot(page);
    await expect(page.locator("#billing-pill")).toHaveText(/^Prueba · \d+ d$/);

    // Now the worker is gone: a phone on the underground, or simply the frames
    // between a reload and the first answer. The licence token survives and
    // still verifies, but it carries plan "pro_monthly" — the trial grant issues
    // the same plan id a payment does — so the licence alone cannot tell them
    // apart, and the header used to call this a subscription.
    await page.unroute(`${API}/**`);
    await page.route(`${API}/**`, (r) => r.abort("failed"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTBilling && !!window.VTAccount);
    await expect(page.locator("#billing-pill")).toHaveText(/^Prueba · \d+ d$/);
    expect(await page.locator("#btn-pricing").textContent()).toBe("Suscripción");
    // And Pro itself is still the signature check, not the remembered wording.
    expect(await page.evaluate(() => window.VTBilling.isPro())).toBe(true);
  });

  test("the remembered wording is dropped once its period has passed", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, { signedIn: true }, license);
    await page.addInitScript(() => {
      localStorage.setItem(
        "vt_account_plan_v1",
        JSON.stringify({ pro: true, plan: "pro_monthly", status: "active", source: "gift", periodEnd: 1000 })
      );
    });
    await boot(page);
    // A gift that ended in 1970 must not leave a "Regalo" pill behind, and the
    // record itself should be gone rather than re-read on every load.
    await expect(page.locator("#billing-pill")).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem("vt_account_plan_v1"))).toBeNull();
  });

  test("signing out forgets the remembered wording", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {
      signedIn: true,
      account: member,
      entitlement: { pro: true, plan: "pro_monthly", status: "active", source: "trial", periodEnd: NOW() + 9 * DAY }
    }, license);
    await boot(page);
    await expect(page.locator("#billing-pill")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("vt_account_plan_v1"))).not.toBeNull();
    await page.evaluate(() => window.VTAccount.signOut());
    await expect(page.locator("#billing-pill")).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem("vt_account_plan_v1"))).toBeNull();
    expect(await page.locator("#btn-account").textContent()).toBe("Entrar");
  });

  test("the remembered wording holds no personal detail", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {
      signedIn: true,
      account: member,
      entitlement: { pro: true, plan: "pro_monthly", status: "active", source: "gift", periodEnd: NOW() + 9 * DAY }
    }, license);
    await boot(page);
    await expect(page.locator("#billing-pill")).toBeVisible();
    const rec = await page.evaluate(() => JSON.parse(localStorage.getItem("vt_account_plan_v1")));
    // It exists to pick a word, so it may hold nothing that identifies anybody.
    expect(Object.keys(rec).sort()).toEqual(["periodEnd", "plan", "pro", "source", "status"]);
    expect(JSON.stringify(rec)).not.toContain("example.test");
  });
});

test.describe("Colour is never the only thing that says which state this is", () => {
  const NOW = () => Math.floor(Date.now() / 1000);
  const member = {
    id: "a",
    email: "x@example.test",
    displayName: null,
    locale: null,
    role: "member",
    trialUsed: false,
    createdAt: 1
  };
  const CASES = [
    { source: "trial", status: "active", label: /^Prueba · \d+ d$/ },
    { source: "gift", status: "active", label: /^Regalo$/ },
    { source: "paid", status: "active", label: /^Pro$/ },
    { source: "paid", status: "canceled", label: /^Pro · termina$/ }
  ];

  for (const c of CASES) {
    test(`${c.source}/${c.status} names itself in words, and its border clears 3:1`, async ({ page }) => {
      const license = await mintLicense({ origin: BASE });
      await install(page, {
        signedIn: true,
        account: member,
        entitlement: { pro: true, plan: "pro_monthly", status: c.status, source: c.source, periodEnd: NOW() + 15 * DAY }
      }, license);
      await boot(page);
      const pill = page.locator("#billing-pill");
      await expect(pill).toBeVisible();
      // WCAG 2.2 SC 1.4.1: the four states used to differ by hue alone, all of
      // them saying "Pro". Each now carries its own word.
      await expect(pill).toHaveText(c.label);
      const seen = await pill.evaluate((el) => {
        const cs = getComputedStyle(el);
        const lum = (c) => {
          const p = c.match(/[\d.]+/g).map(Number);
          const a = p.length > 3 ? p[3] : 1;
          // Composited over the header bar, which is what sits behind it.
          const bar = [14, 19, 25];
          const [r, g, b] = p.slice(0, 3).map((v, i) => v * a + bar[i] * (1 - a)).map((v) => {
            const s = v / 255;
            return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
          });
          return 0.2126 * r + 0.7152 * g + 0.0722 * b;
        };
        const bar = lum("rgb(14, 19, 25)");
        const b = lum(cs.borderTopColor);
        return { ratio: (Math.max(bar, b) + 0.05) / (Math.min(bar, b) + 0.05) };
      });
      expect(seen.ratio).toBeGreaterThanOrEqual(3);
    });
  }

  test("the four labels are four different words", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const seen = [];
    for (const c of CASES) {
      const ctx = await page.context().browser().newContext();
      const p2 = await ctx.newPage();
      await install(p2, {
        signedIn: true,
        account: member,
        entitlement: { pro: true, plan: "pro_monthly", status: c.status, source: c.source, periodEnd: NOW() + 15 * DAY }
      }, license);
      await boot(p2);
      await expect(p2.locator("#billing-pill")).toBeVisible();
      seen.push((await p2.locator("#billing-pill").textContent()).trim().replace(/\d+/, "N"));
      await ctx.close();
    }
    expect(new Set(seen).size).toBe(CASES.length);
  });

  test("the offer's accessible name is a verb, not the badge again", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {}, license);
    await boot(page);
    // The visible label stays short because the header is narrow, but a screen
    // reader used to hear "Pro" twice, four lines apart, for a status and an
    // action. This is the one that tells them apart.
    expect(await page.locator("#btn-pricing").getAttribute("aria-label")).toBe(
      "Ver Pro y la prueba gratis"
    );
  });

  test("with the scripts dead, the static page still promises nothing it cannot do", async ({ page }) => {
    // No JS at all: what is hard-coded in index.html is the whole message. It
    // used to name "el portal del proveedor" as where you cancel, a route that
    // does not exist while nobody can be charged in the first place.
    await page.route("**/js/**", (r) => r.abort("failed"));
    await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    const note = (await page.locator("#pricing-pay-note").textContent()).trim();
    expect(note).not.toMatch(/portal del proveedor/);
    expect(note).toMatch(/no pide tarjeta/);
  });
});
