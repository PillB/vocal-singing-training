/**
 * Answers to requests sent under the previous session, on a browser two
 * people sign in on (red team round two: authz-2), and a link whose answer
 * grants nothing (tests-3).
 *
 * The defect (authz-2): refresh() already dropped an answer about somebody
 * who had since signed out, and the in-flight link was keyed by session;
 * nothing else was. Ana's slow request still out when she signed out and
 * Bruno signed in was acted on for Bruno: her /v1/me/link answer put her
 * account, her licence and her billing rails on his page and wiped the
 * pending reference; her /v1/me/checkout answer sent his page to the Creem
 * checkout bound to her (Bruno's own press joined hers), so if he paid, she
 * got the Pro; her portal answer opened her Creem portal for him; and a 401
 * for her ended session signed him out.
 *
 * The oracle is what reaches the worker under whose session, where the page
 * navigates, who the page says is signed in, which licence it holds, and the
 * pending links it keeps. Each case holds Ana's request at the stand-in worker
 * until after the switch, so the order is certain, and each has a control in
 * which the same answer, landing while she is still signed in, is acted on.
 */
const { test, expect } = require("@playwright/test");
const { mintLicense } = require("./helpers/billing");
const W = require("./helpers/rt2-p1-worker");

test.use({ locale: "en-US", timezoneId: "America/New_York" });

const CHECKOUT_REF = { provider: "creem", sessionId: "ch_p1_ana" };
const RETURN = `?billing=success&checkout_id=${CHECKOUT_REF.sessionId}`;

/** Sign-in state as the page and its storage hold it. */
function sessionNow(page) {
  return page.evaluate(() => ({
    signedIn: window.VTAccount.getState().signedIn,
    stored: JSON.parse(localStorage.getItem("vt_account_session_v1") || "null")?.token || null
  }));
}

test.describe("authz-2 (a): a link answered after a sign-out", () => {
  test("Ana's link answered once Bruno is signed in is not adopted for him, and her pending link stays for her", async ({ page }) => {
    const license = await mintLicense({ origin: W.BASE });
    const worker = W.freshWorker({ landed: new Set([CHECKOUT_REF.sessionId]) });
    const release = W.hold(worker, "/v1/me/link");
    await W.install(page, worker, license);
    await W.open(page, RETURN);
    await W.accountIs(page, W.ANA);
    await expect.poll(() => W.sentTo(worker, "/v1/me/link")).toContainEqual({ who: W.ANA.id, body: CHECKOUT_REF });
    // Her link still out, joined here so the case can wait for its answer (one request answers both).
    await page.evaluate((ref) => {
      window.__anaLink = window.VTAccount.linkCheckout(ref, { persist: true });
    }, CHECKOUT_REF);
    await W.switchTo(page, W.BRUNO);

    release();
    expect(await page.evaluate(() => window.__anaLink), "her answer, landing after the switch").toEqual({ ok: false, reason: "signed_out" });
    await page.evaluate(() => window.VTAccount.refresh());
    // Wrong (before): Bruno's page showed Ana's account and held her licence and rails.
    expect(await page.evaluate(() => window.VTAccount.getState().account?.id)).toBe(W.BRUNO.id);
    expect(await page.evaluate(() => window.VTAccount.getState().billingRails)).toEqual([]);
    expect(await W.licenceNow(page)).toEqual({ pro: false, provider: null, accountId: null });
    // And her reference is still kept for her, not wiped by an answer that was not Bruno's.
    expect(await W.pendingLinks(page)).toEqual([expect.objectContaining({ ...CHECKOUT_REF, acct: W.ANA.id })]);
    expect(W.sentTo(worker, "/v1/me/link").filter((r) => r.who === W.BRUNO.id), "nothing of Ana's sent under Bruno").toEqual([]);
  });

  test("control: the same answer while Ana is still signed in is her link: adopted, and the reference forgotten", async ({ page }) => {
    const license = await mintLicense({ origin: W.BASE });
    const worker = W.freshWorker({ landed: new Set([CHECKOUT_REF.sessionId]) });
    const release = W.hold(worker, "/v1/me/link");
    await W.install(page, worker, license);
    await W.open(page, RETURN);
    await W.accountIs(page, W.ANA);
    await expect.poll(() => W.sentTo(worker, "/v1/me/link")).toContainEqual({ who: W.ANA.id, body: CHECKOUT_REF });
    release();
    await expect.poll(() => W.licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: W.ANA.id });
    expect(await page.evaluate(() => window.VTAccount.getState().billingRails)).toEqual(["creem"]);
    await expect.poll(() => W.pendingLinks(page)).toBeNull();
  });
});

test.describe("authz-2 (b): a checkout answered after a sign-out", () => {
  test("Bruno's press opens his own checkout, and the page never goes to the one bound to Ana", async ({ page }) => {
    const license = await mintLicense({ origin: W.BASE });
    const worker = W.freshWorker();
    const releaseAna = W.hold(worker, "/v1/me/checkout");
    const { navigations } = await W.install(page, worker, license, { config: W.ON_SALE });
    await W.open(page, "");
    await W.accountIs(page, W.ANA);
    await W.openPricing(page);
    await W.planButton(page, "pro_monthly").click();
    await expect.poll(() => W.sentTo(worker, "/v1/me/checkout").length).toBe(1);
    await W.switchTo(page, W.BRUNO);

    // Wrong (before): Bruno's page still showed Ana's checkout opening, and his press joined it.
    expect(await page.evaluate(() => window.VTBilling.checkoutOpening())).toBeNull();
    await expect(W.planButton(page, "pro_monthly")).toHaveText(/Subscribe/);
    await expect(W.planButton(page, "pro_monthly")).toBeEnabled();
    const releaseBruno = W.hold(worker, "/v1/me/checkout");
    releaseAna();
    await W.planButton(page, "pro_monthly").click();
    await expect.poll(() => W.sentTo(worker, "/v1/me/checkout").map((r) => r.who)).toEqual([W.ANA.id, W.BRUNO.id]);
    // Ana's answer has landed by now (it was let go before Bruno pressed): not followed.
    await page.evaluate(() => window.VTAccount.refresh());
    expect(navigations, "the page did not go to Ana's checkout").toEqual([]);
    releaseBruno();
    await expect.poll(() => navigations).toEqual([W.checkoutPage(W.BRUNO)]);
  });

  test("the page's own last check: a checkout URL the account layer hands back after a sign-out is not followed; control: before it, it is", async ({ page }) => {
    const license = await mintLicense({ origin: W.BASE });
    const worker = W.freshWorker();
    const { navigations } = await W.install(page, worker, license, { config: W.ON_SALE });
    await W.open(page, "");
    await W.accountIs(page, W.ANA);
    await W.openPricing(page);
    // An account layer that hands back whatever answer came, late: what
    // js/billing.js does with it is what is under test here.
    const stale = () =>
      page.evaluate(() => {
        window.__answer = undefined;
        window.VTAccount.openCheckout = () => new Promise((resolve) => {
          window.__answer = () => resolve({ ok: true, url: "https://checkout.creem.io/ch_bound_ana" });
        });
      });
    await stale();
    await W.planButton(page, "pro_monthly").click();
    await expect.poll(() => page.evaluate(() => typeof window.__answer)).toBe("function");
    await W.switchTo(page, W.BRUNO);
    await page.evaluate(() => window.__answer());
    // Wrong: the page went to the checkout bound to Ana with Bruno signed in.
    await expect(W.planButton(page, "pro_monthly")).toHaveText(/Subscribe/);
    expect(navigations).toEqual([]);
    expect(await page.evaluate(() => window.__toasts.filter((t) => /checkout/i.test(t))), "and nobody is told anything").toEqual([]);

    // Control: the same hand-back while the one who pressed is still signed in is followed.
    await stale();
    await W.planButton(page, "pro_monthly").click();
    await expect.poll(() => page.evaluate(() => typeof window.__answer)).toBe("function");
    await page.evaluate(() => window.__answer());
    await expect.poll(() => navigations).toEqual(["https://checkout.creem.io/ch_bound_ana"]);
  });
});

test.describe("authz-2 (b): the last person's checkout, and their late answer, are not the next person's", () => {
  test("Ana's late answer leaves Bruno's opening checkout held: a second caller joins his, and only his is followed", async ({ page }) => {
    const license = await mintLicense({ origin: W.BASE });
    const worker = W.freshWorker();
    const releaseAna = W.hold(worker, "/v1/me/checkout");
    const releaseBruno = W.hold(worker, "/v1/me/checkout");
    const { navigations } = await W.install(page, worker, license, { config: W.ON_SALE });
    await W.open(page, "");
    await W.accountIs(page, W.ANA);
    await W.openPricing(page);
    await W.planButton(page, "pro_monthly").click();
    await expect.poll(() => W.sentTo(worker, "/v1/me/checkout").length).toBe(1);
    await W.switchTo(page, W.BRUNO);
    await W.planButton(page, "pro_yearly").click();
    await expect.poll(() => W.sentTo(worker, "/v1/me/checkout").map((r) => r.who)).toEqual([W.ANA.id, W.BRUNO.id]);
    expect(await page.evaluate(() => window.VTBilling.checkoutOpening()?.plan), "precondition: Bruno's is the one opening").toBe("pro_yearly");

    releaseAna();
    // Ana's answer has landed and been dropped once a request sent after it has been answered.
    await page.evaluate(() => window.VTAccount.refresh());
    // Wrong: settling Ana's opening let go of whichever was opening, Bruno's
    // too, while his request was still out: a second caller asked the worker
    // for another checkout, and a redraw showed his plans pressable.
    const state = await page.evaluate(() => ({
      opening: window.VTBilling.checkoutOpening()?.plan || null,
      joined: window.VTBilling.startCheckout("pro_monthly", "creem").plan
    }));
    expect(state, "Bruno's checkout is still the one opening; a second caller joins it").toEqual({ opening: "pro_yearly", joined: "pro_yearly" });
    await expect(W.planButton(page, "pro_yearly")).toHaveAttribute("aria-busy", "true");
    expect(W.sentTo(worker, "/v1/me/checkout"), "no third checkout").toHaveLength(2);
    expect(navigations, "Ana's checkout is not followed").toEqual([]);
    releaseBruno();
    await expect.poll(() => navigations).toEqual([W.checkoutPage(W.BRUNO)]);
  });

  test("the checkout Ana was sent to is not reopened for Bruno: his press of the same plan asks the worker for his own", async ({ page }) => {
    const license = await mintLicense({ origin: W.BASE });
    const worker = W.freshWorker();
    const { navigations } = await W.install(page, worker, license, { config: W.ON_SALE, creem: "empty" });
    await W.open(page, "");
    await W.accountIs(page, W.ANA);
    await W.openPricing(page);
    await W.planButton(page, "pro_monthly").click();
    await expect.poll(() => navigations, { timeout: 8000 }).toEqual([W.checkoutPage(W.ANA)]);
    // Ana comes back from the checkout through the back/forward cache, and signs out; Bruno signs in.
    await page.evaluate(() => {
      window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
      window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
    });
    await W.switchTo(page, W.BRUNO);
    await expect(W.planButton(page, "pro_monthly")).toBeEnabled();
    await W.planButton(page, "pro_monthly").click();
    // Wrong: the page went back to the checkout bound to Ana, so if Bruno
    // paid, Ana got the Pro.
    await expect.poll(() => W.sentTo(worker, "/v1/me/checkout").map((r) => r.who), { timeout: 5000 }).toEqual([W.ANA.id, W.BRUNO.id]);
    await expect.poll(() => navigations).toEqual([W.checkoutPage(W.ANA), W.checkoutPage(W.BRUNO)]);
  });
});

test.describe("authz-2 (b): a checkout still opening when the session that asked for it is lost without a sign-out", () => {
  test("Ana's session ends elsewhere mid-checkout and Bruno signs in here: his press asks for his own checkout, and only his is followed", async ({ page }) => {
    const license = await mintLicense({ origin: W.BASE });
    const worker = W.freshWorker();
    const releaseAna = W.hold(worker, "/v1/me/checkout");
    const { navigations } = await W.install(page, worker, license, { config: W.ON_SALE });
    await W.open(page, "");
    await W.accountIs(page, W.ANA);
    await W.openPricing(page);
    await W.planButton(page, "pro_monthly").click();
    await expect.poll(() => W.sentTo(worker, "/v1/me/checkout").length).toBe(1);
    // Control: while her session stands, the checkout out is hers, and a second press joins it.
    expect(await page.evaluate(() => window.VTBilling.checkoutOpening()?.plan)).toBe("pro_monthly");

    // Her session is ended elsewhere (signed out everywhere from her phone):
    // this page learns it from a 401, and nothing here runs the sign-out code.
    worker.answers["/v1/me"] = [401, { ok: false, reason: "revoked" }];
    expect(await page.evaluate(() => window.VTAccount.refresh())).toEqual({ ok: false, reason: "signed_out" });
    delete worker.answers["/v1/me"];
    const signedIn = await page.evaluate(([email, code]) => window.VTAccount.verifyEmailCode(email, code), [W.BRUNO.email, W.CODE]);
    expect(signedIn, "precondition: Bruno signed in").toMatchObject({ ok: true });
    await W.accountIs(page, W.BRUNO);

    // Wrong: Ana's checkout still counted as opening, so the dialog drew it
    // busy for Bruno and his press joined it, asking the worker nothing.
    expect(await page.evaluate(() => window.VTBilling.checkoutOpening())).toBeNull();
    await expect(W.planButton(page, "pro_yearly")).toBeEnabled();
    const releaseBruno = W.hold(worker, "/v1/me/checkout");
    await W.planButton(page, "pro_yearly").click();
    await expect
      .poll(() => W.sentTo(worker, "/v1/me/checkout").map((r) => [r.who, r.body.plan]))
      .toEqual([[W.ANA.id, "pro_monthly"], [W.BRUNO.id, "pro_yearly"]]);
    releaseAna();
    releaseBruno();
    await expect.poll(() => navigations).toEqual([W.checkoutPage(W.BRUNO)]);
  });
});

test.describe("authz-2 (c): a 401 for a session that has already gone", () => {
  test("Ana's checkout answered 401 once Bruno is signed in does not sign Bruno out", async ({ page }) => {
    const license = await mintLicense({ origin: W.BASE });
    const worker = W.freshWorker();
    const release = W.hold(worker, "/v1/me/checkout");
    await W.install(page, worker, license, { config: W.ON_SALE });
    await W.open(page, "");
    await W.accountIs(page, W.ANA);
    const asked = page.evaluate(() => window.VTAccount.openCheckout({ plan: "pro_monthly", provider: "creem", returnPath: "/" }));
    await expect.poll(() => W.sentTo(worker, "/v1/me/checkout").length).toBe(1);
    await W.switchTo(page, W.BRUNO);
    release([401, { ok: false, reason: "revoked" }]);
    expect(await asked).toEqual({ ok: false, reason: "signed_out" });
    // Wrong (before): the 401 for Ana's ended session forgot Bruno's.
    expect(await sessionNow(page)).toEqual({ signedIn: true, stored: W.BRUNO.token });
  });

  test("control: the same 401 while Ana is still signed in signs her out", async ({ page }) => {
    const license = await mintLicense({ origin: W.BASE });
    const worker = W.freshWorker();
    const release = W.hold(worker, "/v1/me/checkout");
    await W.install(page, worker, license, { config: W.ON_SALE });
    await W.open(page, "");
    await W.accountIs(page, W.ANA);
    const asked = page.evaluate(() => window.VTAccount.openCheckout({ plan: "pro_monthly", provider: "creem", returnPath: "/" }));
    await expect.poll(() => W.sentTo(worker, "/v1/me/checkout").length).toBe(1);
    release([401, { ok: false, reason: "revoked" }]);
    expect(await asked).toMatchObject({ ok: false, status: 401, reason: "no_session" });
    expect(await sessionNow(page)).toEqual({ signedIn: false, stored: null });
  });
});

test.describe("authz-2 (c): a portal answered after a sign-out", () => {
  test("Ana's Manage press answered once Bruno is signed in opens nothing and says nothing; a late 401 leaves Bruno signed in", async ({ page }) => {
    const license = await mintLicense({ origin: W.BASE });
    const worker = W.freshWorker({ pro: new Set([W.ANA.id]) });
    const { navigations } = await W.install(page, worker, license, { config: W.ON_SALE });
    await W.open(page, "");
    await expect.poll(() => W.licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: W.ANA.id });
    await W.openPricing(page);
    const release = W.hold(worker, "/v1/me/billing-portal");
    await page.locator("#btn-manage-billing").click();
    await expect.poll(() => W.sentTo(worker, "/v1/me/billing-portal").length).toBe(1);
    await W.switchTo(page, W.BRUNO);
    const toastsBefore = await page.evaluate(() => window.__toasts.length);
    release();
    await expect.poll(() => page.evaluate(() => window.VTAccount.getState().signedIn)).toBe(true);
    await page.evaluate(() => window.VTAccount.refresh());
    // Wrong (before): the page went to Ana's own Creem portal, Bruno signed in.
    expect(navigations).toEqual([]);
    const said = await page.evaluate((from) => window.__toasts.slice(from), toastsBefore);
    expect(said, "nothing said about a press Bruno did not make").toEqual([]);

    // The 401 for her ended session, asked as she did and answered after the switch.
    await W.switchTo(page, W.ANA);
    const release401 = W.hold(worker, "/v1/me/billing-portal");
    const asked = page.evaluate(() => window.VTAccount.openBillingPortal());
    await expect.poll(() => W.sentTo(worker, "/v1/me/billing-portal").length).toBe(2);
    await W.switchTo(page, W.BRUNO);
    release401([401, { ok: false, reason: "revoked" }]);
    expect(await asked).toEqual({ ok: false, reason: "signed_out" });
    expect(await sessionNow(page)).toEqual({ signedIn: true, stored: W.BRUNO.token });
  });

  test("the page's own last check on Manage: a portal the account layer hands back after a sign-out is not opened, and nothing is said; control: before it, it is opened", async ({ page }) => {
    const license = await mintLicense({ origin: W.BASE });
    const worker = W.freshWorker({ pro: new Set([W.ANA.id]) });
    const { navigations } = await W.install(page, worker, license, { config: W.ON_SALE });
    await W.open(page, "");
    await expect.poll(() => W.licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: W.ANA.id });
    await W.openPricing(page);
    // An account layer that hands back whatever answer came, late: what the
    // page does with it is what is under test here.
    const stale = () =>
      page.evaluate((url) => {
        window.__answer = undefined;
        window.VTAccount.openBillingPortal = () => new Promise((resolve) => {
          window.__answer = () => resolve({ ok: true, url });
        });
      }, W.portalPage(W.ANA));
    const answered = () => expect.poll(() => page.locator("#btn-manage-billing").getAttribute("aria-busy")).toBeNull();
    await stale();
    await page.locator("#btn-manage-billing").click();
    await expect.poll(() => page.evaluate(() => typeof window.__answer)).toBe("function");
    await W.switchTo(page, W.BRUNO);
    const toastsBefore = await page.evaluate(() => window.__toasts.length);
    await page.evaluate(() => window.__answer());
    // The press's own handler has run once the button is no longer busy.
    await answered();
    // Wrong: the page went to Ana's Creem portal with Bruno signed in.
    expect(navigations).toEqual([]);
    expect(await page.evaluate((from) => window.__toasts.slice(from), toastsBefore), "and nobody is told anything").toEqual([]);

    // Control: the same hand-back while the one who pressed is still signed in is opened.
    await W.switchTo(page, W.ANA);
    await expect.poll(() => W.licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: W.ANA.id });
    await expect(page.locator("#btn-manage-billing")).toBeVisible();
    await stale();
    await page.locator("#btn-manage-billing").click();
    await expect.poll(() => page.evaluate(() => typeof window.__answer)).toBe("function");
    await page.evaluate(() => window.__answer());
    await expect.poll(() => navigations).toEqual([W.portalPage(W.ANA)]);
  });

  test("control: the same portal answer while Ana is still signed in opens her portal", async ({ page }) => {
    const license = await mintLicense({ origin: W.BASE });
    const worker = W.freshWorker({ pro: new Set([W.ANA.id]) });
    const { navigations } = await W.install(page, worker, license, { config: W.ON_SALE });
    await W.open(page, "");
    await expect.poll(() => W.licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: W.ANA.id });
    await W.openPricing(page);
    const release = W.hold(worker, "/v1/me/billing-portal");
    await page.locator("#btn-manage-billing").click();
    await expect.poll(() => W.sentTo(worker, "/v1/me/billing-portal").length).toBe(1);
    release();
    await expect.poll(() => navigations).toEqual([W.portalPage(W.ANA)]);
  });
});

test.describe("tests-3: a link the worker makes whose answer grants nothing", () => {
  test("the licence goes with that answer, and refresh() settles rather than waiting on itself", async ({ page }) => {
    const license = await mintLicense({ origin: W.BASE });
    // Linked, but the licence's record has ended (refunded, or a cancelled
    // period run out): the worker's /v1/me-shaped answer carries no token.
    const worker = W.freshWorker();
    worker.answers["/v1/me/link"] = async (person) => [200, { ok: true, account: { id: person.id, email: person.email }, entitlement: { pro: false, plan: null, status: "free", source: null, periodEnd: null }, grants: [], paid: [], licenseId: null, token: null, billingRails: [] }];
    await W.install(page, worker, license, { stored: await license.sign(W.licenceClaims(null)) });
    await W.open(page, "");
    await expect.poll(() => W.sentTo(worker, "/v1/me/link")).toEqual([{ who: W.ANA.id, body: { licenseId: W.LIC } }]);
    // Wrong (before the fix of tests-3): kept until the next refresh, though
    // the account had just said the licence grants nothing.
    await expect.poll(() => W.licenceNow(page), { timeout: 5000 }).toEqual({ pro: false, provider: null, accountId: null });
    // Wrong (the linkAsking guard gone): adopting the link's answer asks for
    // the same link again, which waits on that very adopt; refresh() never
    // settles, and every later refresh joins it.
    const settled = await page.evaluate(() => Promise.race([
      window.VTAccount.refresh().then(() => "settled"),
      new Promise((resolve) => setTimeout(() => resolve("still waiting after 3 s"), 3000))
    ]));
    expect(settled).toBe("settled");
    expect(W.sentTo(worker, "/v1/me/link"), "asked once; the answer settled it").toHaveLength(1);
  });
});
