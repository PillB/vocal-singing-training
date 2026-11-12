/**
 * The screen stays on while a practice is live (js/wake-lock.js).
 *
 * A phone locks after a short while without a touch, and a locked phone stops
 * the microphone and the clock. The voice recovery drill opens with five
 * quiet minutes in which nobody touches anything.
 *
 * The browser's wake lock is replaced by one the test owns, so each rule is
 * checked against the behaviour that would be wrong:
 * - Start asks for a screen lock, once; Stop gives it back (wrong: a phone
 *   kept awake for the rest of the visit);
 * - nothing is asked for before Start (wrong: the catalogue drains a battery);
 * - the browser drops a lock when the page is hidden; coming back to a live
 *   practice asks again, coming back to a stopped one does not;
 * - a lock that arrives after Stop is given straight back;
 * - a refusal is not asked again until the next Start, and the practice runs
 *   regardless; so does a browser with no wake lock at all.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

/**
 * @param {import('@playwright/test').Page} page
 * @param {"grant" | "refuse" | "late" | "absent"} mode How the browser answers a request.
 */
async function boot(page, mode = "grant") {
  await page.context().grantPermissions(["microphone"]).catch(() => {});
  await page.addInitScript((answer) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
    const log = { requests: 0, types: [], held: 0, releases: 0, pending: [], locks: [] };
    window.__wl = log;
    const make = () => {
      const lock = new EventTarget();
      lock.released = false;
      lock.release = () => {
        if (!lock.released) {
          lock.released = true;
          log.held -= 1;
          log.releases += 1;
          lock.dispatchEvent(new Event("release"));
        }
        return Promise.resolve();
      };
      log.held += 1;
      log.locks.push(lock);
      return lock;
    };
    const api = {
      request(type) {
        log.requests += 1;
        log.types.push(type);
        if (answer === "refuse") return Promise.reject(new DOMException("refused", "NotAllowedError"));
        if (answer === "late") return new Promise((resolve) => log.pending.push(() => resolve(make())));
        return Promise.resolve(make());
      }
    };
    Object.defineProperty(Navigator.prototype, "wakeLock", { configurable: true, get: () => (answer === "absent" ? undefined : api) });
  }, mode);
  await page.goto(BASE + "/?e2e", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise && !!window.VTWakeLock);
  await page.evaluate(() => window.VTApp.openExercise("v22-voice-recovery"));
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
}

const log = (page) => page.evaluate(() => ({ requests: window.__wl.requests, held: window.__wl.held, releases: window.__wl.releases, types: window.__wl.types }));
const live = (page) => page.evaluate(() => document.body.classList.contains("practice-live"));

async function start(page) {
  await page.evaluate(() => document.getElementById("btn-practice-start").click());
  await expect.poll(() => live(page)).toBe(true);
}

async function stop(page) {
  await page.evaluate(() => document.getElementById("btn-practice-stop").click());
  await expect.poll(() => live(page)).toBe(false);
}

/** The page changes a class on <body> three times, as a live exercise does (a step, a banner, a size). */
async function restyle(page) {
  for (let i = 0; i < 3; i++) {
    await page.evaluate((n) => document.body.classList.toggle("wl-restyle-" + n), i);
    // Each change is seen by the page on its next turn.
    await page.evaluate(() => new Promise((done) => setTimeout(done, 30)));
  }
}

/** What a browser does when the page goes to the background: it says so, and it drops any screen lock. */
async function hide(page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    window.__wl.locks.forEach((lock) => lock.release());
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

async function show(page) {
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

test.describe("The screen stays on while a practice is live", () => {
  test("Start asks for a screen lock once, Stop gives it back, and nothing is asked before Start", async ({ page }) => {
    await boot(page);
    expect((await log(page)).requests, "an open exercise that is not running asks for nothing").toBe(0);
    await start(page);
    await expect.poll(async () => (await log(page)).held).toBe(1);
    expect((await log(page)).types).toEqual(["screen"]);
    expect(await page.evaluate(() => window.VTWakeLock.held())).toBe(true);
    // The live page restyles itself while it runs: still one lock, asked for once.
    await restyle(page);
    expect((await log(page)).requests).toBe(1);

    await stop(page);
    await expect.poll(async () => (await log(page)).held).toBe(0);
    expect((await log(page)).releases).toBe(1);
    expect(await page.evaluate(() => window.VTWakeLock.held())).toBe(false);
  });

  test("back from the background a live practice asks again; a stopped one does not", async ({ page }) => {
    await boot(page);
    await start(page);
    await expect.poll(async () => (await log(page)).held).toBe(1);
    await hide(page);
    expect((await log(page)).held).toBe(0);
    expect((await log(page)).requests, "a hidden page asks for nothing").toBe(1);
    expect(await live(page), "the practice itself goes on").toBe(true);
    await show(page);
    await expect.poll(async () => (await log(page)).held).toBe(1);
    expect((await log(page)).requests).toBe(2);

    await stop(page);
    await expect.poll(async () => (await log(page)).held).toBe(0);
    await hide(page);
    await show(page);
    await page.waitForTimeout(300);
    expect((await log(page)).requests, "nothing is live: nothing to keep awake").toBe(2);
  });

  test("a lock that arrives after Stop is given straight back", async ({ page }) => {
    await boot(page, "late");
    await start(page);
    await expect.poll(async () => (await log(page)).requests).toBe(1);
    await stop(page);
    // The browser answers only now.
    await page.evaluate(() => window.__wl.pending.splice(0).forEach((answer) => answer()));
    await expect.poll(async () => (await log(page)).releases).toBe(1);
    expect((await log(page)).held).toBe(0);
    expect(await page.evaluate(() => window.VTWakeLock.held())).toBe(false);
  });

  test("a refusal is asked once per Start and the practice runs anyway", async ({ page }) => {
    await boot(page, "refuse");
    await start(page);
    await expect.poll(async () => (await log(page)).requests).toBe(1);
    // The live page restyles itself while it runs: a browser that said no is not asked again each time.
    await restyle(page);
    expect((await log(page)).requests).toBe(1);
    expect(await live(page)).toBe(true);
    await stop(page);
    await start(page);
    await expect.poll(async () => (await log(page)).requests, "the next Start may ask again").toBe(2);
    await stop(page);
  });

  test("a browser with no wake lock practises as before", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await boot(page, "absent");
    expect(await page.evaluate(() => window.VTWakeLock.supported())).toBe(false);
    await start(page);
    await page.waitForTimeout(400);
    expect(await live(page)).toBe(true);
    await stop(page);
    expect(errors).toEqual([]);
  });
});
