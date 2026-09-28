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
    // Signed in, the door is an initial plus a name; the name is what it says.
    const doorName = document.querySelector("#btn-account .door-name");
    const plan = document.querySelector("#btn-pricing");
    return {
      door: doorName ? (doorName.textContent || "").trim() : shown("#btn-account"),
      pro: shown("#btn-pricing"),
      // The one element about Pro: what it says, read even when it sits inside
      // the closed phone menu, and which state it was drawn for.
      plan: plan ? (plan.textContent || "").trim() : null,
      planKind: plan ? plan.dataset.plan || null : null,
      // The status pill that used to sit beside the button is gone for good.
      pill: document.querySelector("#billing-pill")
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
    // Exactly one element mentions Pro, and it is the offer, worded as one.
    expect(h.pro).toBe("Probar Pro");
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
    expect(seen.label).toBe("Probar Pro");
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
    await expect(page.locator("#btn-pricing")).toHaveText(/^Prueba · \d+ días$/);
    const h = await header(page);
    expect(h.planKind).toBe("trialAccount");
    await expect(page.locator("#btn-pricing")).toHaveClass(/plan-trial/);
    // One element: no pill beside it, and it no longer says Pro at all.
    expect(h.pill).toBeNull();
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
    expect(status).toContain("Prueba gratis");
    // A seven-day trial is not a month, and the paid monthly card is not the
    // plan a trial holder is on.
    expect(status).not.toContain("Mes de prueba");
    await expect(page.locator('.plan-cta[data-plan="pro_monthly"]')).not.toHaveText(/Plan actual/);
    await expect(page.locator('.plan-cta[data-plan="free"]')).not.toHaveText(/Plan actual/);
    await expect(page.locator("#pricing-health-note")).toBeHidden();
  });

  test("a gifted month says gifted, and when it ends", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {
      signedIn: true,
      account: account(),
      entitlement: { pro: true, plan: "pro_monthly", status: "active", source: "gift", periodEnd: ends(12) }
    }, license);
    await boot(page);
    await expect(page.locator("#btn-pricing")).toHaveText(/^Regalo · \d+ días$/);
    await expect(page.locator("#btn-pricing")).toHaveClass(/plan-gift/);
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
    await expect(page.locator("#btn-pricing")).toHaveText(/^Pro · termina en \d+ días$/);
    await expect(page.locator("#btn-pricing")).toHaveClass(/plan-ending/);
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
    await expect(page.locator("#btn-pricing")).toHaveText("Pro · activo");
    const h = await header(page);
    expect(h.planKind).toBe("paid");
    // The whole point: never two elements claiming the same thing. Count every
    // visible control in the header whose words mention Pro.
    const proish = await page.evaluate(() =>
      [...document.querySelectorAll(".app-header button, .app-header a, .app-header span")]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width && r.height && !el.querySelector("button, span") && /\bpro\b/i.test(el.textContent || "");
        })
        .map((el) => el.textContent.trim())
    );
    expect(proish).toEqual(["Pro · activo"]);
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
    expect(h.pro).toBe("Try Pro");
  });

  test("a trial label translates and keeps its days", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {
      signedIn: true,
      account: { id: "a", email: "x@example.test", displayName: null, locale: null, role: "member", trialUsed: true, createdAt: 1 },
      entitlement: { pro: true, plan: "pro_monthly", status: "active", source: "trial", periodEnd: Math.floor(Date.now() / 1000) + 5 * DAY }
    }, license);
    await boot(page);
    await expect(page.locator("#btn-pricing")).toHaveText(/^Prueba · \d+ días$/);
    await page.click("#btn-lang");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    expect((await header(page)).plan).toMatch(/^Trial · \d+ days$/);
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

  test("on a trial the plan is the first thing in Más, in words", async ({ page }) => {
    // The trial used to sit on the row as a pill, which pushed "Historial" out
    // of sight inside the nav. It lives in the menu now, one tap away, as the
    // same single element the desktop header shows.
    const license = await mintLicense({ origin: BASE });
    await install(page, {
      signedIn: true,
      account: { id: "a", email: "x@example.test", displayName: null, locale: null, role: "member", trialUsed: true, createdAt: 1 },
      entitlement: { pro: true, plan: "pro_monthly", status: "active", source: "trial", periodEnd: Math.floor(Date.now() / 1000) + 20 * DAY }
    }, license);
    await boot(page);
    await page.click("#btn-more");
    const plan = page.locator("#btn-pricing");
    await expect(plan).toBeVisible();
    await expect(plan).toHaveText(/^Prueba · \d+ días$/);
    const first = await page.evaluate(() => {
      const shown = [...document.querySelectorAll("#header-utils button")].filter((b) => b.getBoundingClientRect().height);
      return shown[0] && shown[0].id;
    });
    expect(first).toBe("btn-pricing");
    const size = await plan.evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(12);
  });

  test("signed in, the door is an account button, not a stray name", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {
      signedIn: true,
      account: { id: "a", email: "pablo.illescas.buendia@example.test", displayName: null, locale: null, role: "member", trialUsed: true, createdAt: 1 },
      entitlement: { pro: false, plan: null, status: "free", source: null, periodEnd: null }
    }, license);
    await boot(page);
    const door = page.locator("#btn-account");
    await expect(door.locator(".door-avatar")).toHaveText("P");
    // The name is too long for any phone row, so the initial stands in for it;
    // a screen reader still hears the name first.
    const nameWidth = await door.locator(".door-name").evaluate((el) => el.getBoundingClientRect().width);
    expect(nameWidth).toBeLessThanOrEqual(1);
    expect(await door.getAttribute("aria-label")).toMatch(/^pablo\.illescas\.buendia/);
    const box = await door.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
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
    await expect(page.locator("#btn-pricing")).toHaveText(/^Prueba · /);
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

  test("a cancelled subscription says on the home card when it ends", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {
      signedIn: true,
      account: { ...member, trialUsed: false },
      entitlement: { pro: true, plan: "pro_monthly", status: "canceled", source: "paid", periodEnd: NOW() + 10 * DAY }
    }, license);
    await boot(page);
    await expect.poll(() => homeTag(page).then((t) => t && t.kind)).toBe("is-ending");
    // "Termina" alone left the date to the account panel; the header button
    // and this tag both carry it now.
    expect((await homeTag(page)).text).toMatch(/^Termina · \d+d$/);
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
    await expect(page.locator("#btn-pricing")).toHaveText(/^Prueba · \d+ días$/);

    // Now the worker is gone: a phone on the underground, or simply the frames
    // between a reload and the first answer. The licence token survives and
    // still verifies, but it carries plan "pro_monthly" — the trial grant issues
    // the same plan id a payment does — so the licence alone cannot tell them
    // apart, and the header used to call this a subscription.
    await page.unroute(`${API}/**`);
    await page.route(`${API}/**`, (r) => r.abort("failed"));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTBilling && !!window.VTAccount);
    await expect(page.locator("#btn-pricing")).toHaveText(/^Prueba · \d+ días$/);
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
    // A gift that ended in 1970 must not leave a "Regalo" label behind, and the
    // record itself should be gone rather than re-read on every load.
    await expect(page.locator("#btn-pricing")).toHaveAttribute("data-plan", "free");
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
    await expect(page.locator("#btn-pricing")).toHaveAttribute("data-plan", "trialAccount");
    expect(await page.evaluate(() => localStorage.getItem("vt_account_plan_v1"))).not.toBeNull();
    await page.evaluate(() => window.VTAccount.signOut());
    await expect(page.locator("#btn-pricing")).toHaveAttribute("data-plan", "free");
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
    await expect(page.locator("#btn-pricing")).toHaveAttribute("data-plan", "gift");
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
    { source: "trial", status: "active", label: /^Prueba · \d+ días$/ },
    { source: "gift", status: "active", label: /^Regalo · \d+ días$/ },
    { source: "paid", status: "active", label: /^Pro · activo$/ },
    { source: "paid", status: "canceled", label: /^Pro · termina en \d+ días$/ }
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
      const pill = page.locator("#btn-pricing");
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
      await expect(p2.locator("#btn-pricing")).not.toHaveAttribute("data-plan", "free");
      seen.push((await p2.locator("#btn-pricing").textContent()).trim().replace(/\d+/, "N"));
      await ctx.close();
    }
    expect(new Set(seen).size).toBe(CASES.length);
  });

  test("the offer's name is a verb, and what you see is what is read", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {}, license);
    await boot(page);
    // A screen reader used to hear "Pro" twice, four lines apart, for a status
    // and an action. There is one element now and its words are a verb, so the
    // visible label is the accessible name (WCAG 2.5.3) and the title says more.
    const btn = page.locator("#btn-pricing");
    expect(await btn.getAttribute("aria-label")).toBeNull();
    await expect(btn).toHaveText("Probar Pro");
    expect(await btn.getAttribute("title")).toBe("Ver Pro y la prueba gratis");
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

test.describe("The menu, read by someone who has never seen it", () => {
  // The owner's question after the account rework merged: did it fix the
  // ambiguous menu — duplicate Pro buttons, no immediate way to sign in? It
  // fixed those and broke the row: with the door on it, "Historial" scrolled
  // out of sight inside the nav on every phone narrower than 390, and entirely
  // at 390 too once a plan pill joined it. These walk the states that matter
  // at the widths phones actually are.
  const NOW = () => Math.floor(Date.now() / 1000);
  const member = (over) => ({
    id: "a",
    email: "pablo.illescas.buendia@example.test",
    displayName: null,
    locale: null,
    role: "member",
    trialUsed: true,
    createdAt: 1,
    ...(over || {})
  });
  const STATES = {
    "signed out": {},
    trial: { signedIn: true, account: member(), entitlement: { pro: true, plan: "pro_monthly", status: "active", source: "trial", periodEnd: NOW() + 5 * DAY } },
    gift: { signedIn: true, account: member({ trialUsed: false }), entitlement: { pro: true, plan: "pro_monthly", status: "active", source: "gift", periodEnd: NOW() + 20 * DAY } },
    ending: { signedIn: true, account: member(), entitlement: { pro: true, plan: "pro_monthly", status: "canceled", source: "paid", periodEnd: NOW() + 10 * DAY } }
  };

  for (const width of [320, 360, 390]) {
    for (const [name, opts] of Object.entries(STATES)) {
      test(`${width}px, ${name}: every section is whole and pressable, and the door is on the row`, async ({ browser }) => {
        const ctx = await browser.newContext({ viewport: { width, height: 740 } });
        const page = await ctx.newPage();
        const license = await mintLicense({ origin: BASE });
        await install(page, opts, license);
        await boot(page);
        if (opts.signedIn) await expect(page.locator("#btn-pricing")).not.toHaveAttribute("data-plan", "free");
        const seen = await page.evaluate(() => {
          const nav = document.querySelector("#header-nav");
          const hits = ["btn-nav-home", "btn-plan", "btn-history", "btn-account", "btn-more"].map((id) => {
            const el = document.getElementById(id);
            const r = el.getBoundingClientRect();
            const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
            return {
              id,
              whole: r.left >= 0 && r.right <= innerWidth && r.left >= nav.getBoundingClientRect().left - 1,
              hit: !!top && el.contains(top),
              w: r.width,
              h: r.height
            };
          });
          return {
            hidden: nav.scrollWidth - nav.clientWidth,
            overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
            hits
          };
        });
        // Nothing in the nav is behind a sideways scroll...
        expect(seen.hidden).toBeLessThanOrEqual(1);
        expect(seen.overflow).toBe(0);
        for (const h of seen.hits) {
          // ...and a finger on each control lands on that control.
          expect(h, h.id).toMatchObject({ whole: true, hit: true });
          expect(h.h, h.id).toBeGreaterThanOrEqual(44);
          expect(h.w, h.id).toBeGreaterThanOrEqual(44);
        }
        await ctx.close();
      });
    }
  }

  for (const width of [320, 390]) {
    for (const [name, opts] of Object.entries(STATES)) {
      test(`${width}px, ${name}: inside an exercise the header stays one row`, async ({ browser }) => {
        // The exercise screen has no Más menu, so the offer and the door sit on
        // the row with the language switch. Full-length labels there wrapped
        // the header to a second row, and the stage hid its guide to make room
        // (stage-design.spec.js checks the guide itself).
        const ctx = await browser.newContext({ viewport: { width, height: width === 320 ? 640 : 844 } });
        const page = await ctx.newPage();
        const license = await mintLicense({ origin: BASE });
        await install(page, { ...opts, account: opts.account && { ...opts.account, displayName: "Maximiliano Alejandro" } }, license);
        await boot(page);
        if (opts.signedIn) await expect(page.locator("#btn-pricing")).not.toHaveAttribute("data-plan", "free");
        await page.evaluate(() => window.VTApp.openExercise("s4-lip-trills"));
        await expect(page.locator("#view-exercise")).toHaveClass(/active/);
        await page.waitForTimeout(300);
        const { row, headerBottom } = await page.evaluate(() => ({
          row: ["btn-nav-home", "btn-account", "btn-pricing", "btn-lang"]
            .map((id) => {
              const el = document.getElementById(id);
              const r = el.getBoundingClientRect();
              return r.width ? { id, top: Math.round(r.top), bottom: r.bottom, text: el.innerText.trim(), w: r.width, h: r.height } : null;
            })
            .filter(Boolean),
          headerBottom: document.querySelector("header.app-header").getBoundingClientRect().bottom
        }));
        expect(new Set(row.map((c) => c.top)).size, JSON.stringify(row)).toBe(1);
        // Nothing below that row: the header ends with it.
        expect(headerBottom - row[0].bottom).toBeLessThanOrEqual(10);
        for (const c of row) {
          expect(c.h, c.id).toBeGreaterThanOrEqual(44);
          expect(c.w, c.id).toBeGreaterThanOrEqual(44);
        }
        // The offer is still there for someone without Pro, as "Pro".
        const offer = row.find((c) => c.id === "btn-pricing");
        if (opts.signedIn) expect(offer).toBeUndefined();
        else expect(offer && offer.text).toBe("Pro");
        await ctx.close();
      });
    }
  }

  for (const [name, opts] of Object.entries(STATES)) {
    test(`${name}: one element about Pro in the header and its menu, and the home card offers nothing already held`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      const license = await mintLicense({ origin: BASE });
      await install(page, opts, license);
      await boot(page);
      if (opts.signedIn) await expect(page.locator("#btn-pricing")).not.toHaveAttribute("data-plan", "free");
      await page.click("#btn-more");
      const words = await page.evaluate(() =>
        [...document.querySelectorAll(".app-header button, .app-header span, .app-header a")]
          .filter((el) => {
            const r = el.getBoundingClientRect();
            // Leaves, except that a button counts as one thing whatever
            // spans it is built from.
            if (!r.width || !r.height || el.querySelector("button")) return false;
            return el.tagName === "BUTTON" ? true : !el.closest("button") && !el.querySelector("span");
          })
          .map((el) => (el.textContent || "").trim())
          .filter((t) => /\b(pro|prueba|regalo|suscripci[oó]n)\b/i.test(t))
      );
      expect(words).toHaveLength(1);
      // "Pro: exportar y coach" is an offer; someone holding Pro is not sold it.
      if (opts.signedIn) await expect(page.locator("#btn-value-pro")).toBeHidden();
      else await expect(page.locator("#btn-value-pro")).toBeAttached();
    });
  }

  test("a desktop header holds a long name and a plan on one row", async ({ page }) => {
    // With the old pill and "Suscripción" side by side, a signed-in trial
    // wrapped the 1280px header onto a second row.
    await page.setViewportSize({ width: 1280, height: 800 });
    const license = await mintLicense({ origin: BASE });
    await install(page, { ...STATES.trial, account: member({ displayName: "Maria Fernanda de la Torre" }) }, license);
    await boot(page);
    await expect(page.locator("#btn-pricing")).toHaveText(/^Prueba · /);
    const tops = await page.evaluate(() =>
      ["btn-nav-home", "btn-account", "btn-pricing", "btn-lang", "btn-tour"].map((id) =>
        Math.round(document.getElementById(id).getBoundingClientRect().top)
      )
    );
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(4);
    await expect(page.locator("#btn-account .door-name")).toBeVisible();
  });

  test("the account panel names its plan button for what it opens", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, STATES.trial, license);
    await boot(page);
    await expect(page.locator("#btn-pricing")).toHaveAttribute("data-plan", "trialAccount");
    await openPanel(page);
    await expect(page.locator("#btn-account-pricing")).toHaveText("Ver tu plan");
  });
});

test.describe("One way in, and the panel says true things about saving", () => {
  test("a visitor on a deploy with accounts is not shown the staff login", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {}, license);
    await boot(page);
    await openPanel(page);
    await expect(page.locator("#account-signin")).toBeVisible();
    // "Acceso interno" sat under the Google button as a second way in, and its
    // form's button said "Entrar", the header door's own word.
    await expect(page.locator(".account-internal")).toBeHidden();
  });

  test("staff who ask for it still get the staff login", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {}, license);
    await page.addInitScript(() => sessionStorage.setItem("vt_e2e", "1"));
    await page.goto(`${BASE}/index.html?staff`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTBilling && !!window.VTAccount);
    await openPanel(page);
    await expect(page.locator(".account-internal")).toBeVisible();
  });

  test("the unreachable panel does not tell you to close it to retry beside a retry button", async ({ page }) => {
    await install(page, { offline: true }, null);
    await boot(page);
    await openPanel(page);
    await expect(page.locator("#account-retry")).toBeVisible();
    await expect(page.locator("#account-offline")).not.toContainText(/Cierra y vuelve/);
    await page.click("#account-retry");
    // Pressing it used to leave focus on the page behind the dialog.
    await expect.poll(() => page.evaluate(() => !!document.activeElement.closest("#account-modal"))).toBe(true);
  });

  test("signed in, home and history stop saying progress stays in this browser", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {
      signedIn: true,
      account: { id: "a", email: "x@example.test", displayName: null, locale: null, role: "member", trialUsed: false, createdAt: 1 },
      entitlement: { pro: false, plan: null, status: "free", source: null, periodEnd: null }
    }, license);
    await boot(page);
    await expect(page.locator("#start-step3-sub")).toHaveText("Tu progreso se guarda en tu cuenta.");
    await expect(page.locator("#history-sub")).toContainText("se guardan en tu cuenta");
  });

  test("signed out, home says where progress lives and how to take it along", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, {}, license);
    await boot(page);
    await expect(page.locator("#start-step3-sub")).toContainText("Con Entrar lo llevas");
  });
});
