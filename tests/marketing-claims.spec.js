/**
 * The promises the selling copy makes, proved by what the product does rather than by a line in a file
 * (docs/48 section 11: a string can stay while the behaviour behind it changes, AGENTS.md's rejected pattern).
 *
 *  - "sin límite de minutos" / "no time limit": after more than an hour practised today, Start still starts
 *    and no Pro window opens.
 *  - "Tu voz se queda en tu dispositivo" / "your voice stays on your device": a recorded take sends no audio,
 *    and nothing big, to any server. The detector is shown to catch an upload in the same test.
 *  - "No necesitas cuenta" / "no account needed": a take rated without signing in is there in a new tab.
 *  - "nunca durante la práctica" (terms.html): with ads switched on, no ad appears between the steps of a
 *    guided routine; after a single exercise, the end-of-task card does, so the check can see one.
 *
 * Each has a planted defect in qa/mutate.mjs ("claims" set, MK19 to MK22) that turns it red.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const NOW = "2026-09-23T10:00:00-05:00";
const TODAY = "2026-09-23";

/** A free visitor with a fake microphone, the tour seen, on a clock the test owns. */
async function boot(page, { daysToday = null } = {}) {
  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript(
    ({ today, daysToday }) => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", "es");
        localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: "singing" }));
        sessionStorage.setItem("vt_e2e", "1");
        sessionStorage.setItem("vt_stepdone_e2e", "1");
        sessionStorage.setItem("vt_rate_e2e", "1");
        if (daysToday && !sessionStorage.getItem("vt_seeded")) {
          sessionStorage.setItem("vt_seeded", "1");
          const days = { [today]: daysToday };
          localStorage.setItem("vt_days_v1", JSON.stringify({ v: 1, days, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true }));
        }
      } catch {
        /* ignore */
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      async function fakeGUM() {
        let ctx = window.VTSharedAudioCtx;
        if (!ctx || ctx.state === "closed") {
          ctx = new AC();
          window.VTSharedAudioCtx = ctx;
        }
        const dest = ctx.createMediaStreamDestination();
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.value = 0.05;
        osc.frequency.value = 220;
        osc.connect(g);
        g.connect(dest);
        osc.start();
        return dest.stream;
      }
      if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
      navigator.mediaDevices.getUserMedia = fakeGUM;
      if (typeof MediaDevices !== "undefined") MediaDevices.prototype.getUserMedia = fakeGUM;
    },
    { today: TODAY, daysToday }
  );
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && !!window.VTLoop && !!window.VTSession && !!window.VTAds);
  await page.clock.runFor(500);
}

const live = (page) => page.evaluate(() => !!window.VTApp.getState().practiceLive);

async function start(page) {
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => live(page), { timeout: 10000 }).toBe(true);
}

/** Start the open exercise and run its clock out (shortened to `sec`, most of it jumped over). */
async function runOut(page, sec = 50) {
  await page.evaluate((n) => (window.VTApp.getState().timer.remaining = n), sec);
  await start(page);
  await page.clock.fastForward((sec - 5) * 1000);
  await page.clock.runFor(5600);
}

async function openSingle(page, id) {
  await page.evaluate((x) => window.VTApp.openExercise(x), id);
  await page.clock.runFor(300);
}

/** Ads on, in the mode that draws a slot with no third-party script and no network. */
const adsOn = (page) =>
  page.evaluate(() => {
    const c = window.VT_ADS_CONFIG;
    c.adsEnabled = true;
    c.mode = "preview";
    localStorage.removeItem("vt_ads_last_post_v1");
  });

const adShown = (page) => page.evaluate(() => !!document.querySelector("#ad-slot-post-session .ad-native-card"));

/**
 * Every request the page makes that could carry a recording: any body over 4 KB, or any audio, video, multipart or
 * raw-bytes body, whatever its size.
 */
function watchUploads(page) {
  const seen = [];
  page.on("request", async (req) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method())) return;
    const type = (await req.allHeaders().catch(() => ({})))["content-type"] || "";
    const size = req.postDataBuffer()?.length ?? 0;
    if (size > 4096 || /^(audio|video)\/|multipart\/|octet-stream/i.test(type)) seen.push({ url: req.url(), type, size });
  });
  return seen;
}

test.describe("What the copy promises, by what the product does", () => {
  test("no time limit: after an hour and a bit practised today, Start still starts and no Pro window opens", async ({ page }) => {
    await boot(page, { daysToday: { sec: 3720, n: 24, ex: ["s4-lip-trills"] } });
    const today = await page.evaluate((d) => JSON.parse(localStorage.getItem("vt_days_v1")).days[d].sec, TODAY);
    expect(today, "control: the day already holds over an hour").toBeGreaterThan(3600);
    for (const id of ["s4-lip-trills", "v1-diction"]) {
      await openSingle(page, id);
      await runOut(page, 50);
      await expect(page.locator("#pricing-modal")).toBeHidden();
    }
    const after = await page.evaluate((d) => JSON.parse(localStorage.getItem("vt_days_v1")).days[d].sec, TODAY);
    expect(after, "both takes were counted as practice").toBeGreaterThan(today);
  });

  test("your voice stays on your device: a recorded take sends no audio anywhere", async ({ page }) => {
    const uploads = watchUploads(page);
    await boot(page);
    await openSingle(page, "v10-power-pause");
    await expect(page.locator("#chk-auto-record"), "control: this exercise records every take").toBeChecked();
    await start(page);
    await page.waitForTimeout(1500);
    await page.clock.runFor(2500);
    await page.locator("#btn-practice-stop").click();
    await expect(page.locator("#btn-save-rec"), "control: there is a recording to send").toBeVisible();
    await page.locator("#btn-save-rec").click();
    await page.clock.runFor(1500);
    await page.waitForTimeout(500);
    expect(uploads, "no request carried a recording").toEqual([]);

    // Control: the same detector sees an upload when one is made.
    await page.evaluate((u) => fetch(u, { method: "POST", body: new Blob([new Uint8Array(6000)], { type: "audio/webm" }) }).catch(() => {}), BASE + "/__upload_probe");
    await expect.poll(() => uploads.length, { message: "control: an audio upload is caught" }).toBe(1);
  });

  test("no account needed: a take rated without signing in is there in a new tab", async ({ page }) => {
    await boot(page);
    await openSingle(page, "s4-lip-trills");
    await runOut(page);
    await page.locator('.rate-btn[data-feel="ok"]').click();
    await expect(page.locator("#score-result")).toBeVisible();
    const second = await page.context().newPage();
    await second.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await second.waitForFunction(() => !!window.VTStorage);
    const there = await second.evaluate(() => ({
      takes: window.VTStorage.getProgress()?.["s4-lip-trills"]?.history?.length || 0,
      session: sessionStorage.length
    }));
    expect(there.session, "control: the new tab shares no session storage").toBe(0);
    expect(there.takes).toBe(1);
  });

  test("no ad during practice: with ads on, none appears between a routine's steps; one does after a single exercise", async ({ page }) => {
    await boot(page);
    await adsOn(page);
    await page.locator("#btn-next-step").click();
    await page.clock.runFor(400);
    await runOut(page, 35);
    await page.locator("#btn-step-done-rate").click();
    await page.locator('.rate-btn[data-feel="ok"]').click();
    await expect(page.locator("#score-result")).toBeVisible();
    await page.clock.runFor(1500);
    await expect(page.locator("#ps-routine-next"), "control: the routine goes on").toBeVisible();
    expect(await adShown(page)).toBe(false);

    // While the microphone is live, even a direct call for the end-of-task card draws nothing.
    await page.evaluate(() => window.VTSession.clear?.());
    await openSingle(page, "v1-diction");
    await adsOn(page);
    await page.evaluate(() => (window.VTApp.getState().timer.remaining = 50));
    await start(page);
    await page.evaluate(() => window.VTAds.onPostSession());
    expect(await adShown(page), "no ad while the take is live").toBe(false);

    // Control: once the single exercise is over, the end-of-task card is drawn, so the checks above could see one.
    await page.clock.fastForward(45 * 1000);
    await page.clock.runFor(5600);
    await page.locator('.rate-btn[data-feel="ok"]').click();
    await page.clock.runFor(1500);
    expect(await adShown(page)).toBe(true);
  });
});
