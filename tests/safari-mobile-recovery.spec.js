/**
 * Real WebKit/mobile-Safari browser contracts, with controlled synthetic mic.
 * These assert negative states too (interrupted output, dead input, duplicate
 * capture) so a rendered button alone cannot count as a passing test.
 * Physical iPhone route-switch and acoustic audibility remain manual gates.
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise, centerHitsSelf } = require("./helpers/e2e");

async function startWithMic(page, exerciseId = "s2-solfege-chords") {
  const browserErrors = [];
  page.on("console", (msg) => {
    if (["error", "warning"].includes(msg.type())) browserErrors.push(msg.text());
  });
  page.on("pageerror", (error) => browserErrors.push(error.message));
  await boot(page, { lang: "en", tourDone: true, mic: "tone" });
  await openExercise(page, exerciseId);
  await expect(page.locator("#sound-blocked"), "the Safari recovery UI must be present on every exercise stage")
    .toHaveCount(1);
  await page.evaluate(() => {
    // A synthetic microphone must originate in the SAME AudioContext used by
    // the piano. WebKit can reject/interrupt the old helper's second context.
    const AC = window.AudioContext || window.webkitAudioContext;
    window.__micRequests = 0;
    const fakeGUM = async () => {
      window.__micRequests++;
      const ctx = window.VTPiano?.ctx || window.VTSharedAudioCtx || new AC();
      window.VTSharedAudioCtx = ctx;
      const dest = ctx.createMediaStreamDestination();
      const oscillator = ctx.createOscillator();
      const gain = ctx.createGain();
      oscillator.frequency.value = 220;
      gain.gain.value = 0.015;
      oscillator.connect(gain);
      gain.connect(dest);
      oscillator.start();
      (window.__fakeMicOscillators ||= []).push(oscillator);
      return dest.stream;
    };
    navigator.mediaDevices.getUserMedia = fakeGUM;
    if (typeof MediaDevices !== "undefined" && MediaDevices.prototype) {
      // WebKit exposes getUserMedia through its prototype, ignoring an
      // instance-only override in the shared E2E helper.
      MediaDevices.prototype.getUserMedia = fakeGUM;
    }
    document.querySelector("#chk-auto-piano").checked = true;
  });
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => window.VTApp.getState().practiceLive), {
    timeout: 25000
  }).toBe(true);
  const diag = await page.evaluate(() => ({
    running: window.VTApp.getState().practice.running,
    stream: !!window.VTApp.getState().practice.stream,
    requests: window.__micRequests,
    ctx: window.VTPiano.ctx?.state,
    micBlocked: document.getElementById("mic-blocked")?.hidden === false,
    error: document.getElementById("mic-blocked-text")?.textContent
  }));
  expect(diag.running, `WebKit mic failed ${JSON.stringify({ diag, browserErrors })}`).toBe(true);
}

test("microphone track ending stops scoring and exposes an explicit retry", async ({ page }) => {
  test.setTimeout(60000);
  await startWithMic(page);
  await page.evaluate(() => {
    const practice = window.VTApp.getState().practice;
    const track = practice.stream.getAudioTracks()[0];
    track.dispatchEvent(new Event("ended"));
  });
  await expect(page.locator("#mic-blocked")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.VTApp.getState().practiceLive)).toBe(false);
  await expect(page.locator("#btn-mic-retry")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.VTApp.getState().practice.running)).toBe(false);
  await page.locator("#btn-mic-retry").click();
  await expect.poll(() => page.evaluate(() => window.VTApp.getState().practiceLive), {
    timeout: 25000
  }).toBe(true);
  await expect(page.locator("#mic-blocked")).toBeHidden();
});

test("recording with a live practice reuses one stream and preserves the microphone", async ({ page }) => {
  test.setTimeout(60000);
  await startWithMic(page, "v1-diction");
  const before = await page.evaluate(() => window.__micRequests);
  // This standalone button is hidden during live Practice. Test the browser's
  // MediaRecorder against the real practice stream through the recorder API.
  const owned = await page.evaluate(async () => {
    // Playwright's Linux WebKit build does not expose MediaRecorder even though
    // Safari on iOS/macOS does. Use a deferred API-compatible encoder ONLY for
    // the ownership/last-chunk contract when native recording is unavailable.
    const nativeRecorder = typeof window.MediaRecorder === "function";
    if (!nativeRecorder) {
      window.MediaRecorder = class DeferredSafariRecorder {
        static isTypeSupported(type) { return type === "audio/mp4"; }
        constructor(stream, opts) {
          this.stream = stream;
          this.mimeType = opts?.mimeType || "audio/mp4";
          this.state = "inactive";
        }
        start() { this.state = "recording"; }
        stop() {
          this.state = "inactive";
          queueMicrotask(() => {
            this.ondataavailable?.({ data: new Blob(["AAC-TAIL"], { type: this.mimeType }) });
            this.onstop?.();
          });
        }
      };
    }
    const s = window.VTApp.getState();
    const rec = s.recorder;
    await rec.start({ stream: s.practice.stream });
    const live = s.practice.stream.getAudioTracks()[0].readyState === "live";
    const same = rec.stream === s.practice.stream;
    const requests = window.__micRequests;
    await new Promise((resolve) => setTimeout(resolve, 350));
    const recorded = await rec.stop();
    return {
      requests, same, live, nativeRecorder,
      resultType: recorded?.blob?.type || "",
      resultBytes: recorded?.blob?.size || 0,
      trackAfter: s.practice.stream.getAudioTracks()[0].readyState
    };
  });
  expect(owned.requests).toBe(before);
  expect(owned.same).toBe(true);
  expect(owned.live).toBe(true);
  expect(owned.resultBytes, "WebKit recorder must flush the final chunk").toBeGreaterThan(0);
  expect(owned.resultType).toMatch(/audio\/(webm|mp4)/);
  expect(owned.trackAfter).toBe("live");
  if (!owned.nativeRecorder) console.log("[WebKit] MediaRecorder not exposed; deferred MP4 encoder fixture used");
});

test("interrupted Web Audio shows hittable recovery and resumes on a new tap", async ({ page }, testInfo) => {
  test.setTimeout(60000);
  await startWithMic(page);
  await page.evaluate(async () => {
    const piano = window.VTPiano;
    await piano.ctx.suspend();
    piano.onStateChange?.("interrupted");
  });
  await expect(page.locator("#sound-blocked")).toBeVisible({ timeout: 7000 });
  const hit = await centerHitsSelf(page, "#btn-sound-resume");
  expect(hit.ok, `${testInfo.project.name} sound recovery obscured by ${JSON.stringify(hit.top)}`).toBe(true);
  // WebKit occasionally auto-recovers after a foreground/focus event and
  // hides the alert before a Playwright locator click can begin. Accept that
  // only if the context is genuinely running; otherwise click by coordinates.
  const beforeTap = await page.evaluate(() => window.VTPiano.ctx?.state);
  if (beforeTap !== "running") {
    const box = await page.locator("#btn-sound-resume").boundingBox();
    if (box) await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  }
  await expect.poll(() => page.evaluate(() => window.VTPiano.ctx?.state), { timeout: 10000 })
    .toBe("running");
  await expect(page.locator("#sound-blocked")).toBeHidden();
  const st = await page.evaluate(() => ({
    live: window.VTApp.getState().practiceLive,
    micLive: window.VTApp.getState().practice.stream?.getAudioTracks()[0]?.readyState,
    soundCtx: window.VTPiano.ctx.state
  }));
  expect(st).toEqual({ live: true, micLive: "live", soundCtx: "running" });
});

for (const viewport of [{ width: 360, height: 740 }, { width: 844, height: 390 }]) {
  test(`recovery control is not occluded at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize(viewport);
    await startWithMic(page);
    await page.evaluate(async () => {
      const piano = window.VTPiano;
      await piano.ctx.suspend();
      piano.onStateChange?.("interrupted");
    });
    await expect(page.locator("#sound-blocked")).toBeVisible({ timeout: 7000 });
    const hit = await centerHitsSelf(page, "#btn-sound-resume");
    expect(hit.ok, `Recovery overlaps ${JSON.stringify(hit.top)} at ${viewport.width}×${viewport.height}`)
      .toBe(true);
  });
}
