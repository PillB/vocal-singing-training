/**
 * A plan's checkout while it opens, and after a redirect that never happens
 * (red team round two: money-4, states-5, tests-2, states-6).
 *
 * The defects:
 * - money-4 / states-5: once the worker had answered and the page had called
 *   location.assign, the one-checkout-at-a-time guard was kept for the page's
 *   life, on the theory that the page was leaving. When it did not leave (Stop
 *   or Esc while Creem's page loaded on a slow phone, "Stay" on the page's own
 *   leave prompt), the pressed button read "Opening secure checkout…" for good,
 *   reopening the dialog drew it busy again, and a press on the other plan did
 *   nothing at all, with no word. Only a reload got the buyer to a checkout.
 * - tests-2: back from the checkout through the back/forward cache, the guard
 *   was let go but nothing drew the dialog again, so the plan pressed before
 *   leaving stayed disabled on "Opening secure checkout…"; and no test reached
 *   that line at all.
 * - states-6: while one plan's checkout opened, the other plan's Subscribe
 *   looked pressable and a press did nothing.
 *
 * The oracle is what the buyer sees on the buttons and what reaches the
 * worker: whether a press asks for a checkout (`/v1/me/checkout`) and for
 * which plan. A real back/forward-cache restore cannot be had here (Playwright
 * runs Chromium with the cache off), so the restore is stood in for as the
 * red team did: the checkout page answers 204, so the navigation does not
 * commit and the page keeps its DOM, as a restored page does, and the events
 * a restore fires are dispatched.
 */
const { test, expect } = require("@playwright/test");
const { mintLicense } = require("./helpers/billing");
const W = require("./helpers/rt2-p1-worker");

/** How long js/billing.js waits for a page sent to the checkout to leave (LEAVE_GRACE_MS). */
const GRACE_MS = 8000;

test.use({ locale: "en-US", timezoneId: "America/New_York" });

/** Signed in as Ana with Creem on sale, the Pro dialog open. */
async function ready(page, worker, creem) {
  const license = await mintLicense({ origin: W.BASE });
  const { navigations } = await W.install(page, worker, license, { config: W.ON_SALE, creem });
  await W.open(page, "");
  await W.accountIs(page, W.ANA);
  await W.openPricing(page);
  return navigations;
}

/** The plans the worker was asked to open checkouts for, in order. */
const plansAsked = (worker) => W.sentTo(worker, "/v1/me/checkout").map((r) => r.body.plan);

/** One button from `dialogButtons`. */
async function buttonOf(page, id) {
  return (await W.dialogButtons(page)).find((b) => b.id === id);
}

const IDLE = { text: "Subscribe", disabled: false, ariaDisabled: null, busy: null };

test.describe("money-4, states-5: a checkout page that never loads gives the plans back", () => {
  test("Stop while Creem's page loads: held for a few seconds, then every plan is pressable and the next press opens a checkout", async ({ page }) => {
    const worker = W.freshWorker();
    // Creem's page is slow to load, and the buyer presses Stop: the navigation
    // is cancelled (net::ERR_ABORTED) and the page stays where it was.
    const navigations = await ready(page, worker, "stopped");
    await page.evaluate(() => {
      window.__samePage = true;
    });
    await W.planButton(page, "pro_monthly").click();
    await expect.poll(() => navigations.length, { timeout: 8000 }).toBe(1);
    const sentAt = Date.now();

    // Control: straight after the redirect the guard holds, because the page
    // may still be leaving. A second caller joins the checkout already out.
    expect(await buttonOf(page, "pro_monthly")).toMatchObject({ text: "Opening secure checkout…", busy: "true", disabled: true });
    const joined = await page.evaluate(() => {
      const res = window.VTBilling.startCheckout("pro_yearly", "creem");
      return { mode: res.mode, plan: res.plan };
    });
    expect(joined, "a press meanwhile joins it").toEqual({ mode: "opening", plan: "pro_monthly" });
    expect(plansAsked(worker)).toEqual(["pro_monthly"]);
    await page.waitForTimeout(2000);
    expect(page.url(), "precondition: the navigation was cancelled and the page stayed").toMatch(/\/index\.html$/);
    expect(await page.evaluate(() => window.__samePage), "the same page, not a new one").toBe(true);

    // Wrong (before): held for the page's life; the monthly button read
    // "Opening secure checkout…" and nothing anybody pressed asked again.
    await expect
      .poll(() => buttonOf(page, "pro_monthly"), { timeout: GRACE_MS + 5000 })
      .toMatchObject(IDLE);
    expect(Date.now() - sentAt, "not before the page had its chance to leave").toBeGreaterThan(GRACE_MS - 2500);
    expect(await buttonOf(page, "pro_yearly")).toMatchObject(IDLE);
    expect(await page.evaluate(() => window.VTBilling.checkoutOpening())).toBeNull();

    // The same plan again goes back to the checkout the worker already
    // opened. Wrong (money-4, second half): a second Creem checkout, one more
    // of the account's twelve an hour, and two left open.
    await W.planButton(page, "pro_monthly").click();
    await expect.poll(() => navigations, { timeout: 5000 }).toEqual([W.checkoutPage(W.ANA), W.checkoutPage(W.ANA)]);
    expect(plansAsked(worker), "the worker was not asked again").toEqual(["pro_monthly"]);

    // Stopped again: once the plans are back, the other plan is a new
    // checkout, which only the worker can open.
    await expect.poll(() => buttonOf(page, "pro_yearly"), { timeout: GRACE_MS + 5000 }).toMatchObject(IDLE);
    await W.planButton(page, "pro_yearly").click();
    await expect.poll(() => plansAsked(worker), { timeout: 5000 }).toEqual(["pro_monthly", "pro_yearly"]);
    await expect.poll(() => navigations.length).toBe(3);
  });
});

/** Stand in for leaving to the checkout and coming back through the back/forward cache. */
async function backFromCheckout(page) {
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true }));
    window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true }));
  });
  await expect.poll(() => buttonOf(page, "pro_monthly")).toMatchObject(IDLE);
}

/** Move the page's clock on by `ms` (Date.now only; timers keep real time). */
function clockOn(page, ms) {
  return page.evaluate((by) => {
    const was = Date.now;
    Date.now = () => was() + by;
  }, ms);
}

test.describe("money-4: the same plan pressed again goes back to the checkout already opened", () => {
  test("back from the checkout, the same plan reopens it without asking the worker, once, and only while it is fresh; another plan asks", async ({ page }) => {
    const worker = W.freshWorker();
    const navigations = await ready(page, worker, "empty");
    await W.planButton(page, "pro_monthly").click();
    await expect.poll(() => navigations, { timeout: 8000 }).toEqual([W.checkoutPage(W.ANA)]);
    await backFromCheckout(page);

    // Control: another plan is another checkout, which only the worker can
    // open. Wrong: sent to the monthly checkout for a yearly press.
    await W.planButton(page, "pro_yearly").click();
    await expect.poll(() => plansAsked(worker), { timeout: 5000 }).toEqual(["pro_monthly", "pro_yearly"]);
    await expect.poll(() => navigations).toHaveLength(2);
    await backFromCheckout(page);

    // 29 minutes on, the same plan: back to that checkout, and the worker is not asked.
    await clockOn(page, 29 * 60000);
    await W.planButton(page, "pro_yearly").click();
    await expect.poll(() => navigations).toHaveLength(3);
    expect(plansAsked(worker), "reopened, not asked for again").toEqual(["pro_monthly", "pro_yearly"]);
    await backFromCheckout(page);

    // Once only: a checkout that has expired early costs one wasted trip, and
    // the next press asks the worker. Wrong: sent back to it every time.
    await W.planButton(page, "pro_yearly").click();
    await expect.poll(() => plansAsked(worker), { timeout: 5000 }).toEqual(["pro_monthly", "pro_yearly", "pro_yearly"]);
    await expect.poll(() => navigations).toHaveLength(4);
    await backFromCheckout(page);

    // 31 minutes after the worker opened that one: too old to go back to.
    // Wrong: sent to a checkout that may have expired.
    await clockOn(page, 31 * 60000);
    await W.planButton(page, "pro_yearly").click();
    await expect.poll(() => plansAsked(worker), { timeout: 5000 }).toEqual(["pro_monthly", "pro_yearly", "pro_yearly", "pro_yearly"]);
    await expect.poll(() => navigations).toHaveLength(5);
  });
});

test.describe("tests-2: back from the checkout through the back/forward cache", () => {
  test("a page that has left keeps the hold; the restore draws both plans pressable and either opens a checkout", async ({ page }) => {
    const worker = W.freshWorker();
    const navigations = await ready(page, worker, "empty");
    await W.planButton(page, "pro_monthly").click();
    await expect.poll(() => navigations.length, { timeout: 8000 }).toBe(1);
    // The page leaves for the checkout and goes into the back/forward cache.
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: true })));
    // Wrong: let go while it was away, as if the redirect had not happened.
    await page.waitForTimeout(GRACE_MS + 1500);
    expect(await buttonOf(page, "pro_monthly"), "held while the page is away").toMatchObject({ busy: "true", disabled: true });
    expect(await page.evaluate(() => !!window.VTBilling.checkoutOpening())).toBe(true);

    // Control: a pageshow that is not a restore (a first load) changes nothing.
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: false })));
    expect(await buttonOf(page, "pro_monthly")).toMatchObject({ busy: "true", disabled: true });
    expect(await page.evaluate(() => !!window.VTBilling.checkoutOpening())).toBe(true);

    // Back: the restore. Wrong (before): the guard went but the dialog was not
    // drawn again, so the plan pressed before leaving stayed disabled and busy.
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted: true })));
    await expect.poll(() => buttonOf(page, "pro_monthly")).toMatchObject(IDLE);
    expect(await buttonOf(page, "pro_yearly")).toMatchObject(IDLE);
    await W.planButton(page, "pro_yearly").click();
    await expect.poll(() => plansAsked(worker), { timeout: 5000 }).toEqual(["pro_monthly", "pro_yearly"]);
  });
});

test.describe("states-6: while one plan's checkout opens, the other choices are drawn disabled", () => {
  test("the other plan and the rail are disabled while it opens, also when the dialog is drawn again; all come back on a failure, and 'Current plan' stays as it was", async ({ page }) => {
    const worker = W.freshWorker();
    const release = W.hold(worker, "/v1/me/checkout");
    await ready(page, worker);
    const before = await W.dialogButtons(page);
    expect(before.find((b) => b.id === "free"), "precondition: the free plan's button is disabled for its own reason").toMatchObject({ disabled: true });
    expect(before.find((b) => b.id === "rail:creem"), "precondition: a rail button is drawn, pressable and not dimmed").toMatchObject({ disabled: false, dimmed: false });
    expect(before.find((b) => b.id === "pro_yearly"), "precondition: the other plan starts pressable and not dimmed").toMatchObject({ ...IDLE, dimmed: false });

    await W.planButton(page, "pro_monthly").click();
    await expect.poll(() => W.sentTo(worker, "/v1/me/checkout").length).toBe(1);
    // Held, and drawn as held: a control that cannot be pressed must not look
    // as if it could (the rail buttons are not .btn, so no stylesheet dims them).
    const held = { disabled: true, ariaDisabled: "true", dimmed: true };
    // Wrong (before): the yearly button read "Subscribe", enabled, and a press did nothing.
    await expect.poll(() => buttonOf(page, "pro_yearly")).toMatchObject({ text: "Subscribe", ...held });
    expect(await buttonOf(page, "rail:creem")).toMatchObject(held);
    expect(await buttonOf(page, "pro_monthly")).toMatchObject({ text: "Opening secure checkout…", busy: "true" });

    // Drawn again mid-request (closed and opened): still held.
    await page.click("#pricing-close");
    await W.openPricing(page);
    expect(await buttonOf(page, "pro_yearly")).toMatchObject(held);
    expect(await buttonOf(page, "rail:creem")).toMatchObject(held);

    release([502, { ok: false, reason: "provider_error" }]);
    await expect.poll(() => page.evaluate(() => window.__toasts.join(" | "))).toContain("couldn't open the checkout");
    await expect.poll(() => buttonOf(page, "pro_yearly")).toMatchObject({ ...IDLE, dimmed: false });
    expect(await buttonOf(page, "pro_monthly")).toMatchObject({ ...IDLE, dimmed: false });
    expect(await buttonOf(page, "rail:creem")).toMatchObject({ disabled: false, ariaDisabled: null, dimmed: false });
    // Control: a button that was disabled before the press is not "given back" enabled.
    expect(await buttonOf(page, "free")).toMatchObject({ disabled: true });
    expect(plansAsked(worker)).toEqual(["pro_monthly"]);
  });
});
