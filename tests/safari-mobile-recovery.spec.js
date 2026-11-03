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

test("busy, denied, missing, and delayed microphones show distinct guidance before Retry succeeds", async ({ page }) => {
  test.setTimeout(60000);
  await boot(page, { lang: "en", tourDone: true, mic: "silent" });
  await openExercise(page, "v1-diction");
  await page.evaluate(() => {
    const md = navigator.mediaDevices;
    const goodMic = md.getUserMedia.bind(md);
    window.__captureFailure = "NotReadableError";
    window.__captureAttempts = 0;
    const failOrRecover = async (constraints) => {
      window.__captureAttempts++;
      if (!window.__captureFailure) return goodMic(constraints);
      const error = new Error("device already in use");
      error.name = window.__captureFailure;
      throw error;
    };
    md.getUserMedia = failOrRecover;
    if (typeof MediaDevices !== "undefined") MediaDevices.prototype.getUserMedia = failOrRecover;
  });
  await page.locator("#btn-practice-start").click();
  await expect(page.locator("#mic-blocked-text")).toContainText("other apps");
  expect(await page.evaluate(() => window.__captureAttempts)).toBe(1);
  await page.evaluate(() => { window.__captureFailure = "NotAllowedError"; });
  await page.locator("#btn-mic-retry").click();
  await expect(page.locator("#mic-blocked-text")).toContainText("address bar");
  expect(await page.evaluate(() => window.__captureAttempts)).toBe(2);
  await page.evaluate(() => { window.__captureFailure = "NotFoundError"; });
  await page.locator("#btn-mic-retry").click();
  await expect(page.locator("#mic-blocked-text")).toContainText("No microphone is available");
  expect(await page.evaluate(() => window.__captureAttempts)).toBe(3);
  await page.evaluate(() => { window.__captureFailure = "TimeoutError"; });
  await page.locator("#btn-mic-retry").click();
  await expect(page.locator("#mic-blocked-text")).toContainText("permission prompt is still open");
  expect(await page.evaluate(() => window.__captureAttempts)).toBe(4);
  await page.evaluate(() => { window.__captureFailure = null; });
  await page.locator("#btn-mic-retry").click();
  await expect.poll(() => page.evaluate(() => window.VTApp.getState().practiceLive), {
    timeout: 12000
  }).toBe(true);
  expect(await page.evaluate(() => window.__captureAttempts)).toBe(5);
  await page.locator("#btn-practice-stop").click();
});

test("Stop while the permission prompt is up cancels that Start; the microphone granted later is released", async ({ page }) => {
  test.setTimeout(60000);
  await boot(page, { lang: "en", tourDone: true, mic: "silent" });
  await openExercise(page, "v1-diction");
  await page.evaluate(() => {
    const md = navigator.mediaDevices;
    const goodMic = md.getUserMedia.bind(md);
    window.__grants = [];
    window.__tracks = [];
    const askAndWait = (constraints) =>
      new Promise((resolve, reject) => {
        window.__grants.push(() => goodMic(constraints).then((s) => {
          window.__tracks.push(...s.getTracks());
          resolve(s);
        }, reject));
      });
    md.getUserMedia = askAndWait;
    if (typeof MediaDevices !== "undefined") MediaDevices.prototype.getUserMedia = askAndWait;
  });
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => window.__grants.length)).toBe(1);
  expect(await page.evaluate(() => window.VTApp.getState().practice.starting)).toBe(true);
  // Leaving the take (Back, another exercise, the next step) runs this Stop.
  await page.evaluate(() => window.VTApp.stopPractice(true));
  expect(await page.evaluate(() => window.VTApp.getState().practice.starting), "Stop cancels the pending Start").toBe(false);
  // Whatever the engine says or draws after the late grant is a take nobody started.
  await page.evaluate(() => {
    const p = window.VTApp.getState().practice;
    const said = p.onStatus;
    const drew = p.onFrame;
    window.__afterStop = { statuses: [], frames: 0 };
    p.onStatus = function (s, ...rest) {
      window.__afterStop.statuses.push(s);
      return said?.call(this, s, ...rest);
    };
    p.onFrame = function (...args) {
      window.__afterStop.frames++;
      return drew?.apply(this, args);
    };
  });
  await page.evaluate(() => window.__grants[0]());
  await expect.poll(() => page.evaluate(() => window.__tracks.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__tracks.every((t) => t.readyState === "ended")), {
    message: "the microphone granted after Stop is released"
  }).toBe(true);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 250))));
  const heard = await page.evaluate(() => window.__afterStop);
  expect(heard.statuses, "nothing says it is listening").not.toContain("listening");
  expect(heard.frames, "no frame reaches the drill").toBe(0);
  const after = await page.evaluate(() => ({
    running: window.VTApp.getState().practice.running,
    stream: !!window.VTApp.getState().practice.stream,
    live: window.VTApp.getState().practiceLive
  }));
  expect(after).toEqual({ running: false, stream: false, live: false });
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

test("interrupted shared AudioContext stops stale scoring and offers microphone Retry", async ({ page }) => {
  test.setTimeout(60000);
  await startWithMic(page);
  await page.evaluate(async () => window.VTPiano.ctx.suspend());
  await expect(page.locator("#mic-blocked")).toBeVisible({ timeout: 7000 });
  await expect.poll(() => page.evaluate(() => window.VTApp.getState().practiceLive)).toBe(false);
  await expect.poll(() => page.evaluate(() => window.VTApp.getState().practice.running)).toBe(false);
  await page.locator("#btn-mic-retry").click();
  await expect.poll(() => page.evaluate(() => window.VTApp.getState().practiceLive), { timeout: 10000 })
    .toBe(true);
  await expect.poll(() => page.evaluate(() => window.VTPiano.ctx?.state), { timeout: 10000 })
    .toBe("running");
  await expect(page.locator("#mic-blocked")).toBeHidden();
  const st = await page.evaluate(() => ({
    live: window.VTApp.getState().practiceLive,
    micLive: window.VTApp.getState().practice.stream?.getAudioTracks()[0]?.readyState,
    soundCtx: window.VTPiano.ctx.state
  }));
  expect(st).toEqual({ live: true, micLive: "live", soundCtx: "running" });
});

test("running-but-frozen audio clock rejects stale singing frames and requires a new gesture", async ({ page }) => {
  test.setTimeout(60000);
  await startWithMic(page);
  const initial = await page.evaluate(() => {
    const p = window.VTApp.getState().practice;
    return { clock: p.audioCtx.currentTime, state: p.audioCtx.state, holds: p.holds.length };
  });
  expect(initial.state).toBe("running");
  // Simulate the documented WebKit renderer stall: rAF and the last analyser
  // samples continue, the context claims running, but audio time cannot move.
  const frozen = await page.evaluate(() => {
    const ctx = window.VTApp.getState().practice.audioCtx;
    window.__frozenContext = ctx;
    const time = ctx.currentTime;
    Object.defineProperty(ctx, "currentTime", { configurable: true, get: () => time });
    return ctx.currentTime;
  });
  expect(frozen).toBeGreaterThanOrEqual(initial.clock);
  await expect.poll(() => page.evaluate(() => window.VTApp.getState().practice._audioClockStalled), {
    timeout: 4500
  }).toBe(true);
  const scoreTruth = () => page.evaluate(() => {
    const s = window.VTApp.getState();
    const game = s.pitchGame?.snapshot();
    return { lastVoiceAt: s.practice.lastVoiceAt, holdSec: s.practice.currentHoldSec,
      score: game?.score, cleared: game?.challengeCleared };
  });
  const atSuspicion = await scoreTruth();
  await page.waitForTimeout(230);
  expect(await scoreTruth(), "no score, hold or last-sample time advances on the frozen buffer")
    .toEqual(atSuspicion);
  await expect(page.locator("#mic-blocked")).toBeVisible({ timeout: 6000 });
  const stopped = await page.evaluate(() => {
    const s = window.VTApp.getState();
    return { live: s.practiceLive, running: s.practice.running, holds: s.practice.holds.length,
      paused: s.practice._analysisPaused, raf: s.practice.raf, ctxState: window.VTPiano.ctx.state };
  });
  expect(stopped).toMatchObject({ live: false, running: false, paused: false, raf: null, ctxState: "running" });
  expect(stopped.holds, "a frozen voiced buffer cannot invent a new hold").toBe(initial.holds);
  await page.locator("#btn-mic-retry").click();
  await expect.poll(() => page.evaluate(() => window.VTApp.getState().practiceLive), { timeout: 12000 })
    .toBe(true);
  await expect(page.locator("#mic-blocked")).toBeHidden();
  const replacement = await page.evaluate(async () => {
    const fresh = window.VTPiano.ctx;
    const before = fresh.currentTime;
    await new Promise((resolve) => setTimeout(resolve, 240));
    return { newContext: fresh !== window.__frozenContext, state: fresh.state,
      progress: fresh.currentTime - before,
      sameGraph: fresh === window.VTApp.getState().practice.audioCtx };
  });
  expect(replacement, "Retry must abandon the frozen graph and restart audio time")
    .toMatchObject({ newContext: true, state: "running", sameGraph: true });
  expect(replacement.progress, "new renderer must actually advance").toBeGreaterThan(0.05);
});

test("held pitch stays visible through a brief dropout but only fresh audio earns points", async ({ page }) => {
  test.setTimeout(60000);
  await startWithMic(page);
  const evidence = await page.evaluate(() => {
    const s = window.VTApp.getState();
    const p = s.practice;
    cancelAnimationFrame(p.raf); // Only the two deliberately modeled frame classes may enter.
    p.raf = null;
    const viz = s.pitchViz;
    const game = s.pitchGame;
    game.reset();
    // This exercise may begin with a listen-only overlay. Test the scoring
    // contract explicitly in an active score window, not in a held bar.
    viz.setDisplay({ game: true, gameHold: false, chordLanes: false, stats: "target" });
    const target = viz.targetFreq;
    const feed = () => {
      viz.lastIngestAt = performance.now() - 40;
      viz.pushFrame(target, target);
    };
    const silence = new Float32Array(2048);
    p.voiceFreq = target; // Last frame had a measured note.
    const noPitch = p._detectPitch(silence, p.audioCtx.sampleRate);
    p._rms(silence);
    for (let i = 0; i < 15; i++) feed();
    const afterSilence = game.snapshot();
    const heldDisplay = viz.voiceFreq;
    const tone = new Float32Array(2048);
    for (let i = 0; i < tone.length; i++) tone[i] = Math.sin(2 * Math.PI * target * i / p.audioCtx.sampleRate) * 0.3;
    const measured = p._detectPitch(tone, p.audioCtx.sampleRate);
    p._rms(tone);
    for (let i = 0; i < 15; i++) feed();
    return { noPitch, target, measured, heldDisplay,
      silenceScore: afterSilence.score, silenceCleared: afterSilence.challengeCleared,
      freshScore: game.snapshot().score };
  });
  expect(evidence.noPitch, "silence has no valid detector estimate").toBeNull();
  expect(evidence.heldDisplay, "a brief dropout retains a readable pitch marker").toBe(evidence.target);
  expect(evidence.silenceScore, "15 stale displayed notes must earn no points").toBe(0);
  expect(evidence.silenceCleared).toBe(0);
  expect(evidence.measured, "new pitched audio remains measurable").toBeGreaterThan(evidence.target * 0.98);
  expect(evidence.measured).toBeLessThan(evidence.target * 1.02);
  expect(evidence.freshScore, "15 real measured notes must earn points").toBeGreaterThan(0);
});

for (const viewport of [{ width: 360, height: 740 }, { width: 844, height: 390 }]) {
  test(`recovery control is not occluded at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize(viewport);
    await startWithMic(page);
    // Force exactly the UI state for a sound-only output interruption. The
    // functional shared-context interruption is tested independently above.
    await page.evaluate(() => { document.getElementById("sound-blocked").hidden = false; });
    await expect(page.locator("#sound-blocked")).toBeVisible({ timeout: 7000 });
    const hit = await centerHitsSelf(page, "#btn-sound-resume");
    expect(hit.ok, `Recovery overlaps ${JSON.stringify(hit.top)} at ${viewport.width}×${viewport.height}`)
      .toBe(true);
  });
}
