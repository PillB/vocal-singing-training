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

test("a resume that timed out and a microphone that ended while Start built the graph each get their own message", async ({ page }) => {
  await boot(page, { lang: "en", tourDone: true, mic: "silent" });
  await openExercise(page, "v1-diction");
  const said = (reason) =>
    page.evaluate((r) => {
      window.VTApp.showMicBlocked(false, r);
      return document.getElementById("mic-blocked-text").textContent;
    }, reason);
  const t = (key) => page.evaluate((k) => window.VTI18n.t(k), key);
  // The engine's own errors (tests/node/start-recovery.test.mjs pins their names).
  expect(await said({ name: "AudioResumeTimeout", message: "Resuming the audio context took over 8000 ms" })).toBe(await t("mic.blocked.interrupted"));
  expect(await said({ name: "Error", message: "Microphone ended while Start built the audio graph" })).toBe(await t("mic.blocked.disconnected"));
  // A permission prompt left open is still the prompt's message.
  expect(await said({ name: "TimeoutError", message: "Microphone permission timed out" })).toBe(await t("mic.blocked.pending"));
});

/**
 * A getUserMedia whose every request is a permission prompt the test answers,
 * in any order: window.__prompts[i].grant() or .deny(). Granted tracks are
 * kept in window.__tracks.
 */
async function promptsAnsweredByTest(page) {
  await page.evaluate(() => {
    const md = navigator.mediaDevices;
    const goodMic = md.getUserMedia.bind(md);
    window.__prompts = [];
    window.__tracks = [];
    const ask = (constraints) =>
      new Promise((resolve, reject) => {
        window.__prompts.push({
          grant: () => goodMic(constraints).then((s) => {
            window.__tracks.push(...s.getTracks());
            resolve(s);
          }, reject),
          deny: () => reject(new DOMException("Permission denied", "NotAllowedError"))
        });
      });
    md.getUserMedia = ask;
    if (typeof MediaDevices !== "undefined") MediaDevices.prototype.getUserMedia = ask;
  });
}

/** Start (prompt 1 up), leave the take, Start again (prompt 2 up). */
async function twoPendingStarts(page) {
  await boot(page, { lang: "en", tourDone: true, mic: "silent" });
  await openExercise(page, "v1-diction");
  await promptsAnsweredByTest(page);
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => window.__prompts.length)).toBe(1);
  // Leaving the take (Back, another exercise, the next step) or Retry runs this Stop
  await page.evaluate(() => window.VTApp.stopPractice(true));
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => window.__prompts.length)).toBe(2);
}

const settleAWhile = (page) => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 400))));

// QA round 6 (F2, app_race declaredOpen): the older Start's clean-up stopped
// whatever take the engine ran, so its prompt answered late ended the newer,
// live take with no message (0 tracks, status "Time").
for (const answer of ["grant", "deny"]) {
  test(`an older prompt answered (${answer}) after the newer Start went live leaves that take running`, async ({ page }) => {
    test.setTimeout(60000);
    await twoPendingStarts(page);
    await page.evaluate(() => window.__prompts[1].grant());
    await expect.poll(() => page.evaluate(() => window.VTApp.getState().practiceLive), { timeout: 15000 }).toBe(true);
    await page.evaluate((a) => window.__prompts[0][a](), answer);
    if (answer === "grant") {
      await expect.poll(() => page.evaluate(() => window.__tracks[1]?.readyState), {
        message: "the older Start's own microphone is released"
      }).toBe("ended");
    }
    await settleAWhile(page);
    const after = await page.evaluate(() => ({
      live: window.VTApp.getState().practiceLive,
      running: window.VTApp.getState().practice.running,
      liveTracks: window.__tracks.filter((t) => t.readyState === "live").length
    }));
    expect(after, "the newer take runs on, on its own microphone").toEqual({ live: true, running: true, liveTracks: 1 });
    await expect(page.locator("#btn-practice-stop")).toBeVisible();
    await page.locator("#btn-practice-stop").click();
    await expect.poll(() => page.evaluate(() => window.__tracks.every((t) => t.readyState === "ended")), {
      message: "Stop ends that take and releases its microphone"
    }).toBe(true);
  });
}

test("an older prompt answered while the newer one is still up brings no Start back under it", async ({ page }) => {
  test.setTimeout(60000);
  await twoPendingStarts(page);
  await page.evaluate(() => window.__prompts[0].grant());
  await expect.poll(() => page.evaluate(() => window.__tracks[0]?.readyState), {
    message: "the older Start's microphone is released"
  }).toBe("ended");
  await settleAWhile(page);
  await expect(page.locator("#btn-practice-start"), "no third Start while the newer prompt is up").toBeHidden();
  expect(await page.evaluate(() => window.VTApp.getState().practiceStarting)).toBe(true);
  await page.evaluate(() => window.__prompts[1].grant());
  await expect.poll(() => page.evaluate(() => window.VTApp.getState().practiceLive), { timeout: 15000 }).toBe(true);
  expect(await page.evaluate(() => window.__tracks.filter((t) => t.readyState === "live").length)).toBe(1);
  await page.locator("#btn-practice-stop").click();
});

/**
 * Hold the piano the way iOS holds a session through a call, and keep score of what it plays.
 * - `holdAt`: the nth resume a Start asks for in its piano step (its microphone up, the take not live yet) waits for
 *   window.__releasePiano(). window.__holdNext = "resume" or "ensure" holds the next such call made at any time.
 * - Once window.__stopped is set, each sound that actually starts is logged in __played, each chord or note the
 *   piano announces counts in __chords, and each toast is logged in __toasts (a toast that came and went still counts).
 * - window.__suspendOnce: after the next reference note, the context's state reads "suspended" once, as on an iPhone
 *   whose session was taken right after the note was scheduled (Start then runs its recovery).
 */
async function watchPiano(page, holdAt = 0) {
  await page.evaluate((n) => {
    const P = window.VTPiano;
    const st = () => window.VTApp.getState();
    const real = { resume: P.resume.bind(P), ensure: P.ensure.bind(P), prog: P.playProgression.bind(P), ref: P.playRefPitch.bind(P), ticks: P.playInhaleTicks.bind(P) };
    let seen = 0;
    let chordFn = P.onChordChange;
    Object.assign(window, { __played: [], __chords: 0, __toasts: [], __stopped: false, __suspendOnce: false, __holdNext: "" });
    const toastEl = document.querySelector("#toast");
    new MutationObserver(() => {
      if (window.__stopped && toastEl.textContent.trim()) window.__toasts.push(toastEl.textContent.trim());
    }).observe(toastEl, { childList: true, characterData: true, subtree: true });
    const held = (call) => new Promise((done) => {
      window.__releasePiano = () => done(call());
    });
    const suspendOnce = () => {
      window.__suspendOnce = false;
      const ctx = P.ctx;
      let proto = ctx;
      while (proto && !Object.getOwnPropertyDescriptor(proto, "state")) proto = Object.getPrototypeOf(proto);
      const realState = Object.getOwnPropertyDescriptor(proto, "state").get;
      let once = true;
      Object.defineProperty(ctx, "state", {
        configurable: true,
        get() {
          if (!once) return realState.call(ctx);
          once = false;
          return "suspended";
        }
      });
    };
    const log = (what) => (r) => {
      if (r && window.__stopped) window.__played.push(what);
      return r;
    };
    P.playProgression = (...a) => real.prog(...a).then(log(`chords ${a[0]}`));
    P.playRefPitch = (...a) => real.ref(...a).then(log(`note ${a[0]}`)).then((r) => {
      if (r && window.__suspendOnce) suspendOnce();
      return r;
    });
    P.playInhaleTicks = (...a) => real.ticks(...a).then(log("ticks"));
    Object.defineProperty(P, "onChordChange", {
      configurable: true,
      get: () => chordFn && ((...a) => {
        if (window.__stopped) window.__chords++;
        return chordFn(...a);
      }),
      set: (fn) => {
        chordFn = fn;
      }
    });
    P.ensure = () => {
      if (window.__holdNext !== "ensure") return real.ensure();
      window.__holdNext = "";
      return held(real.ensure);
    };
    P.resume = () => {
      if (window.__holdNext === "resume") {
        window.__holdNext = "";
        return held(real.resume);
      }
      const s = st();
      if (!(s.practiceStarting && s.practice.running) || ++seen !== n) return real.resume();
      return held(real.resume);
    };
  }, holdAt);
}

/** The app's toasts are quiet under e2e; these tests read them. */
async function bootWithToasts(page) {
  await page.addInitScript(() => sessionStorage.setItem("vt_debug", "1"));
  await boot(page, { lang: "en", tourDone: true, mic: "silent" });
}

const pianoScore = (page) => page.evaluate(() => ({
  played: window.__played,
  chords: window.__chords,
  loop: !!window.VTPiano.loopActive,
  voices: window.VTPiano.playing.length,
  live: window.VTApp.getState().practiceLive,
  exercise: window.VTApp.getState().exercise?.id
}));

/**
 * Start `first` until its piano step is held at its nth resume, leave it for the breathing pacer (no microphone,
 * no piano), Start that, then let the session go: what plays after the Stop.
 */
async function replaceHeldStart(page, first, nth, { suspendOnce = false } = {}) {
  await bootWithToasts(page);
  await openExercise(page, first);
  await watchPiano(page, nth);
  if (suspendOnce) await page.evaluate(() => { window.__suspendOnce = true; });
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => typeof window.__releasePiano), { timeout: 15000 }).toBe("function");
  await page.evaluate(() => { window.__stopped = true; });
  await openExercise(page, "s18-costal-breath"); // leaving the exercise runs Stop
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => window.VTApp.getState().practiceLive)).toBe(true);
  await page.evaluate(() => window.__releasePiano());
  await settleAWhile(page);
  return pianoScore(page);
}

const SILENT_AFTER_STOP = { played: [], chords: 0, loop: false, voices: 0, live: true, exercise: "s18-costal-breath" };

// Reviews of the startPractice split: a Start replaced while iOS held its piano went on asking for sound for the
// rest of its piano step (about 10 s on a held session), so its chord loop, or a fallback note, played under the
// next take and set that take's targets. The chord drill's piano step waits four times: its own resume, the
// sound's, the progression's and the piano's before it plays (dropped at the Stop).
for (const nth of [1, 2, 3, 4]) {
  test(`a chord drill's Start replaced at wait ${nth} of its piano step plays nothing after the Stop`, async ({ page }) => {
    test.setTimeout(60000);
    expect(await replaceHeldStart(page, "s2-solfege-chords", nth), "the breathing take runs on with no chords under it").toEqual(SILENT_AFTER_STOP);
    const toasts = await page.evaluate(() => window.__toasts.join(" | "));
    expect(toasts, "a dropped loop is not an audio failure, and no loop is announced").not.toMatch(/Could not start audio|Looping/);
  });
}

test("a reference-note Start replaced while its piano step waited sounds no note after the Stop", async ({ page }) => {
  test.setTimeout(60000);
  expect(await replaceHeldStart(page, "s1-vocal-fry", 2)).toEqual(SILENT_AFTER_STOP);
});

test("a reference-note Start replaced while its recovery waited does not replay the note after the Stop", async ({ page }) => {
  test.setTimeout(60000);
  // Its note scheduled, the session reads suspended, so Start recovers: unlock, resume (held here), play again
  expect(await replaceHeldStart(page, "s1-vocal-fry", 3, { suspendOnce: true })).toEqual(SILENT_AFTER_STOP);
});

test("the next take's own chords keep playing when the Start it replaced lets go of the piano", async ({ page }) => {
  test.setTimeout(60000);
  await bootWithToasts(page);
  await openExercise(page, "s2-solfege-chords");
  await watchPiano(page, 2);
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => typeof window.__releasePiano), { timeout: 15000 }).toBe("function");
  await page.evaluate(() => { window.__stopped = true; });
  await openExercise(page, "s4-lip-trills");
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => window.VTApp.getState().practiceLive), { timeout: 15000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__played.length), { message: "the lip trills play their own chords" }).toBe(1);
  await page.evaluate(() => window.__releasePiano());
  await settleAWhile(page);
  const after = await pianoScore(page);
  expect({ ...after, played: after.played.length, chords: undefined }, "the replaced Start stops nothing of the live take's and adds nothing").toEqual({
    played: 1, chords: undefined, loop: true, voices: after.voices, live: true, exercise: "s4-lip-trills"
  });
  expect(after.voices).toBeGreaterThan(0);
  await page.locator("#btn-practice-stop").click();
});

test("a Start replaced by a new Start of the same exercise asks for nothing once the session lets go", async ({ page }) => {
  test.setTimeout(60000);
  await bootWithToasts(page);
  await openExercise(page, "s2-solfege-chords");
  await watchPiano(page, 1);
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => typeof window.__releasePiano), { timeout: 15000 }).toBe("function");
  await page.evaluate(() => {
    window.__stopped = true;
    window.VTApp.stopPractice(true); // Retry, or Stop and Start again on the same exercise
  });
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => window.VTApp.getState().practiceLive), { timeout: 15000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => window.__played.length), { message: "the new take plays its chords" }).toBe(1);
  await page.evaluate(() => window.__releasePiano());
  await settleAWhile(page);
  const after = await pianoScore(page);
  expect({ played: after.played.length, loop: after.loop, live: after.live }, "the old Start neither replays nor replaces them").toEqual({ played: 1, loop: true, live: true });
  await page.locator("#btn-practice-stop").click();
});

test("a piano option changed just before Stop, while the session was held, leaves the stopped page silent", async ({ page }) => {
  test.setTimeout(60000);
  await bootWithToasts(page);
  await openExercise(page, "s2-solfege-chords");
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => window.VTApp.getState().practiceLive), { timeout: 15000 }).toBe(true);
  await watchPiano(page);
  await page.evaluate(() => { window.__holdNext = "resume"; });
  await page.evaluate(() => {
    window.VTApp.applyPianoOptionsHot("oneNote"); // its promise waits on the held session
  });
  await expect.poll(() => page.evaluate(() => typeof window.__releasePiano)).toBe("function");
  await page.evaluate(() => { window.__stopped = true; });
  await page.locator("#btn-practice-stop").click();
  await page.evaluate(() => window.__releasePiano());
  await settleAWhile(page);
  const after = await pianoScore(page);
  expect({ played: after.played, chords: after.chords, loop: after.loop, voices: after.voices, live: after.live }).toEqual({
    played: [], chords: 0, loop: false, voices: 0, live: false
  });
  expect(await page.evaluate(() => window.__toasts.join(" | "))).not.toContain("Options applied");
});

for (const [button, said] of [["#btn-ref-pitch", "Reference"], ["#btn-inhale-ticks", "inhale ticks"]]) {
  test(`${button} tapped on a held session and stopped before it sounded announces nothing`, async ({ page }) => {
    test.setTimeout(60000);
    await bootWithToasts(page);
    await openExercise(page, "s1-vocal-fry");
    await watchPiano(page);
    await page.evaluate(() => { window.__holdNext = "ensure"; });
    await page.evaluate((sel) => document.querySelector(sel).click(), button);
    await expect.poll(() => page.evaluate(() => typeof window.__releasePiano)).toBe("function");
    await page.evaluate(() => {
      window.__stopped = true;
      document.querySelector("#btn-stop-piano").click();
    });
    await page.evaluate(() => window.__releasePiano());
    await settleAWhile(page);
    expect(await page.evaluate(() => ({ played: window.__played, voices: window.VTPiano.playing.length }))).toEqual({ played: [], voices: 0 });
    const toasts = await page.evaluate(() => window.__toasts.join(" | "));
    expect(toasts, "the Stop's word is the last").toContain("Piano stopped");
    expect(toasts).not.toContain(said);
  });
}

// Review of QA round 10's fix (sibling hunt). Play once and Loop waited on a held session without the piano's
// Stop number, so they played after "Stop piano" (the reference and ticks buttons above did not).
for (const button of ["#btn-loop-prog", "#btn-play-prog"]) {
  test(`${button} tapped on a held session and stopped before it sounded plays nothing`, async ({ page }) => {
    test.setTimeout(60000);
    await bootWithToasts(page);
    await openExercise(page, "s2-solfege-chords");
    await watchPiano(page);
    await page.evaluate(() => { window.__holdNext = "ensure"; });
    await page.evaluate((sel) => document.querySelector(sel).click(), button);
    await expect.poll(() => page.evaluate(() => typeof window.__releasePiano)).toBe("function");
    await page.evaluate(() => {
      window.__stopped = true;
      document.querySelector("#btn-stop-piano").click();
    });
    await page.evaluate(() => window.__releasePiano());
    await settleAWhile(page);
    const after = await pianoScore(page);
    expect({ played: after.played, loop: after.loop, voices: after.voices }).toEqual({ played: [], loop: false, voices: 0 });
    const toasts = await page.evaluate(() => window.__toasts.join(" | "));
    expect(toasts, "the Stop's word is the last").toContain("Piano stopped");
    expect(toasts).not.toMatch(/Looping|Playing/);
  });
}

// A piano option changed during a take, with the session held, then "Stop piano": the option's restart used to
// play the loop again (Stop in its resume) or take the loop the piano dropped for silence and sound the fallback
// note (Stop in the progression's own wait), and to say "Options applied" after "Piano stopped".
for (const [where, holdIn] of [["its resume", "runner"], ["the progression's own wait", "progression"]]) {
  test(`a piano option changed on a held session, then Stop piano in ${where}, leaves the piano stopped`, async ({ page }) => {
    test.setTimeout(60000);
    await bootWithToasts(page);
    await openExercise(page, "s2-solfege-chords");
    await page.locator("#btn-practice-start").click();
    await expect.poll(() => page.evaluate(() => window.VTApp.getState().practiceLive), { timeout: 15000 }).toBe(true);
    await watchPiano(page);
    await page.evaluate((hold) => {
      const P = window.VTPiano;
      if (hold === "runner") window.__holdNext = "resume";
      else {
        const prog = P.playProgression;
        let armed = true;
        P.playProgression = (...a) => {
          if (armed) { armed = false; window.__holdNext = "ensure"; }
          return prog(...a);
        };
      }
      window.VTApp.applyPianoOptionsHot("sustain"); // its promise waits on the held session
    }, holdIn);
    await expect.poll(() => page.evaluate(() => typeof window.__releasePiano)).toBe("function");
    await page.evaluate(() => {
      window.__stopped = true;
      document.querySelector("#btn-stop-piano").click();
    });
    await page.evaluate(() => window.__releasePiano());
    const ok = await page.evaluate(() => window.VTApp._hotApplyPromise);
    await settleAWhile(page);
    const after = await pianoScore(page);
    expect({ ok, played: after.played, loop: after.loop, voices: after.voices, live: after.live }).toEqual({
      ok: false, played: [], loop: false, voices: 0, live: true
    });
    expect(await page.evaluate(() => window.__toasts.join(" | "))).not.toContain("Options applied");
    await page.locator("#btn-practice-stop").click();
  });
}

// The option's restart replaced (Stop, Start) while its recovery waited: it read the next take's piano as its own
// sound, so it answered true and said "Options applied" over the next take.
test("a piano option changed, then a Start replaced while its recovery waited, says nothing on the next take", async ({ page }) => {
  test.setTimeout(60000);
  await bootWithToasts(page);
  await openExercise(page, "s2-solfege-chords");
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => window.VTApp.getState().practiceLive), { timeout: 15000 }).toBe(true);
  await watchPiano(page);
  await page.evaluate(() => {
    const P = window.VTPiano;
    const prog = P.playProgression;
    let armed = true;
    P.playProgression = (...a) => prog(...a).then((r) => {
      if (r && armed) {
        // The loop is scheduled, then the context reads suspended once: the restart runs its recovery, held
        armed = false;
        window.__holdNext = "resume";
        const ctx = P.ctx;
        let proto = ctx;
        while (proto && !Object.getOwnPropertyDescriptor(proto, "state")) proto = Object.getPrototypeOf(proto);
        const realState = Object.getOwnPropertyDescriptor(proto, "state").get;
        let once = true;
        Object.defineProperty(ctx, "state", { configurable: true, get() { if (!once) return realState.call(ctx); once = false; return "suspended"; } });
      }
      return r;
    });
    window.VTApp.applyPianoOptionsHot("sustain");
  });
  await expect.poll(() => page.evaluate(() => typeof window.__releasePiano)).toBe("function");
  await page.locator("#btn-practice-stop").click();
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => window.VTApp.getState().practiceLive), { timeout: 15000 }).toBe(true);
  await expect.poll(() => page.evaluate(() => !!window.VTPiano.loopActive), { timeout: 15000 }).toBe(true);
  await page.evaluate(() => { window.__stopped = true; });
  const ok = await page.evaluate(() => { const p = window.VTApp._hotApplyPromise; window.__releasePiano(); return p; });
  await settleAWhile(page);
  expect(ok, "the replaced take's option restart reports nothing").toBe(false);
  expect(await page.evaluate(() => window.__toasts.join(" | "))).not.toContain("Options applied");
  expect((await pianoScore(page)).loop, "control: the next take's own loop plays").toBe(true);
  await page.locator("#btn-practice-stop").click();
});

// A Start replaced by leaving its page (a Stop), answered late, stopped the piano: what the learner had asked for
// on the next page since (a Loop) was cut off, right after its "Looping" toast.
for (const waits of ["its permission prompt", "piano wait 1", "piano wait 3"]) {
  test(`a Loop on the next page keeps playing when a Start replaced at ${waits} lets go of the piano`, async ({ page }) => {
    test.setTimeout(60000);
    await bootWithToasts(page);
    await openExercise(page, "s2-solfege-chords");
    const nth = waits === "its permission prompt" ? 0 : Number(waits.slice(-1));
    if (!nth) {
      await page.evaluate(() => {
        const md = navigator.mediaDevices;
        const goodMic = md.getUserMedia.bind(md);
        window.__grants = [];
        const ask = (c) => new Promise((resolve, reject) => { window.__grants.push(() => goodMic(c).then(resolve, reject)); });
        md.getUserMedia = ask;
        if (typeof MediaDevices !== "undefined") MediaDevices.prototype.getUserMedia = ask;
      });
    } else await watchPiano(page, nth);
    await page.locator("#btn-practice-start").click();
    if (!nth) await expect.poll(() => page.evaluate(() => window.__grants.length), { timeout: 15000 }).toBe(1);
    else await expect.poll(() => page.evaluate(() => typeof window.__releasePiano), { timeout: 15000 }).toBe("function");
    await openExercise(page, "s4-lip-trills"); // leaving runs Stop
    if (!nth) await watchPiano(page);
    await page.evaluate(() => { window.__stopped = true; document.querySelector("#btn-loop-prog").click(); });
    await expect.poll(() => page.evaluate(() => !!window.VTPiano.loopActive), { timeout: 15000 }).toBe(true);
    await page.evaluate(() => (window.__grants ? window.__grants[0]() : window.__releasePiano()));
    await settleAWhile(page);
    await page.waitForTimeout(1500); // the late Start has answered and given up
    const after = await pianoScore(page);
    expect({ loop: after.loop, live: after.live }, "the loop the learner asked for on the new page still runs").toEqual({ loop: true, live: false });
    expect(after.voices).toBeGreaterThan(0);
  });
}

test("Stop while the permission prompt is up cancels that Start; the microphone granted later is released", async ({ page }) => {
  test.setTimeout(60000);
  await bootWithToasts(page);
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

/** What the up "sound paused" banner covers, and whether its button is on screen. */
function bannerView() {
  const banner = document.getElementById("sound-blocked");
  const b = banner.getBoundingClientRect();
  const covered = [...document.querySelectorAll("button, input, select, textarea, label, a[href], [role='button']")]
    .filter((c) => !banner.contains(c))
    .map((c) => ({ id: c.id || String(c.className).slice(0, 30) || c.tagName, r: c.getBoundingClientRect() }))
    .filter(({ r }) => r.width > 0 && r.height > 0)
    .map(({ id, r }) => ({ id, w: Math.min(b.right, r.right) - Math.max(b.left, r.left), h: Math.min(b.bottom, r.bottom) - Math.max(b.top, r.top) }))
    .filter((o) => o.w > 0.5 && o.h > 0.5)
    .map((o) => o.id);
  const btn = document.getElementById("btn-sound-resume").getBoundingClientRect();
  return { covered, top: b.top, inView: btn.top >= 0 && btn.bottom <= innerHeight && btn.left >= 0 && btn.right <= innerWidth,
    said: banner.textContent.replace(/\s+/g, " ").trim() };
}

async function raiseSoundBanner(page) {
  await page.evaluate(() => {
    Object.defineProperty(window.VTPiano.ctx, "state", { get: () => "interrupted", configurable: true });
    window.VTPiano.onStateChange("interrupted");
  });
  await expect(page.locator("#sound-blocked")).toBeVisible({ timeout: 7000 });
}

/**
 * Keep the banner where it was put: every other path that shows it again
 * (Start's own check 2 s after its click, the 1.2 s check after any piano
 * state change) also places it again, and a test of one trigger must not
 * pass on another's placement.
 */
async function holdSoundBanner(page) {
  await page.evaluate(() => { window.VTPiano.onStateChange = () => {}; });
  await page.waitForTimeout(1300); // a check scheduled before this has run
}

// QA round 5 (PNO-02): centred on the stage, the banner hid the octave
// buttons, the range box and the piano toggle at 320 px, and Stop on a phone
// turned sideways. Raised the way a real interruption raises it.
for (const viewport of [{ width: 320, height: 568 }, { width: 568, height: 320 }, { width: 390, height: 844 }]) {
  test(`the sound-paused banner covers no control at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    test.setTimeout(60000);
    await page.setViewportSize(viewport);
    await startWithMic(page);
    await raiseSoundBanner(page);
    const out = await page.evaluate(bannerView);
    expect(out.covered, "every control stays free; Stop above all").toEqual([]);
    expect(out.inView, "Restore sound is on screen").toBe(true);
    expect(out.said, "the banner still holds the whole sentence").toContain("Audio was interrupted");
    // What a screen reader is given: the whole sentence, once, and not the short line drawn for the eye
    const aria = await page.locator("#sound-blocked").ariaSnapshot();
    expect(aria, aria).toContain("Audio was interrupted");
    expect(aria, aria).not.toContain("Sound paused");
    const hit = await centerHitsSelf(page, "#btn-sound-resume");
    expect(hit.ok, `Restore sound is under ${JSON.stringify(hit.top)}`).toBe(true);
  });
}

test("the sound-paused banner moves off the controls a rail brings up under it", async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 320, height: 568 });
  await startWithMic(page);
  await raiseSoundBanner(page);
  await holdSoundBanner(page);
  expect((await page.evaluate(bannerView)).covered).toEqual([]);
  // At 320 px the banner sits in the band over the status corner, above the
  // chord and mode selects. The corner goes (a row of the rail that hides),
  // and the selects come up to where the banner is.
  const before = await page.evaluate(() => {
    const sel = document.getElementById("sel-progression").getBoundingClientRect().top;
    document.querySelector("#hud-top-rail .hud-tl").style.display = "none";
    return { sel, banner: document.getElementById("sound-blocked").getBoundingClientRect().top };
  });
  const moved = await page.evaluate(() => document.getElementById("sel-progression").getBoundingClientRect().top);
  expect(moved, `the selects came up (${JSON.stringify(before)})`).toBeLessThan(before.sel - 20);
  await expect.poll(async () => (await page.evaluate(bannerView)).covered, { timeout: 2000 }).toEqual([]);
});

test("the sound-paused banner never sits under the sticky header when the stage has scrolled under it", async ({ page }) => {
  test.setTimeout(60000);
  await page.setViewportSize({ width: 320, height: 568 });
  await startWithMic(page);
  // An open piano panel unsticks the stage on a small phone; scrolling back
  // up takes the stage's top under the sticky header and exercise bar.
  const box = await page.locator("#btn-toggle-piano").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("#piano-block")).toHaveClass(/is-open.*is-settled|is-settled.*is-open/);
  await expect(page.locator(".game-stage")).toHaveClass(/piano-unstick/);
  const chrome = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return (parseFloat(root.getPropertyValue("--header-h")) || 0) + (parseFloat(root.getPropertyValue("--ex-chrome-h")) || 0);
  });
  await page.evaluate((c) => {
    const s = document.getElementById("highway-stage").getBoundingClientRect();
    window.scrollBy({ top: s.top - (c - 40), behavior: "instant" });
  }, chrome);
  await expect.poll(() => page.evaluate(() => document.getElementById("highway-stage").getBoundingClientRect().top),
    { message: "the stage's top is under the sticky chrome" }).toBeLessThan(chrome - 20);
  await raiseSoundBanner(page);
  const out = await page.evaluate(bannerView);
  expect(out.top, `the banner starts below the chrome (${chrome}px)`).toBeGreaterThanOrEqual(chrome - 0.5);
  // With the panel open no band of a 320 px stage holds even the one-line
  // form: it covers what it must, never Stop.
  expect(out.covered, `covers ${out.covered}`).not.toContain("btn-practice-stop");
  expect(out.covered.length, `the place that covers least: one control and its label, not ${out.covered}`).toBeLessThanOrEqual(2);
  expect(out.inView).toBe(true);
  const hit = await centerHitsSelf(page, "#btn-sound-resume");
  expect(hit.ok, `Restore sound is under ${JSON.stringify(hit.top)}`).toBe(true);
  // Scrolling further moves the stage under the chrome; the banner follows. The scroll is the
  // banner's distance from the chrome and 20 px more, so a banner left where it was put goes
  // 20 px under the chrome. (A fixed 60 px left it, placed low on the stage, clear without moving.)
  await holdSoundBanner(page);
  const scroll = Math.ceil(out.top - chrome + 20);
  const moved = await page.evaluate((by) => {
    const y = window.scrollY;
    window.scrollBy({ top: by, behavior: "instant" });
    return window.scrollY - y;
  }, scroll);
  expect(moved, "control: the page scrolled the whole way").toBe(scroll);
  await expect.poll(async () => (await page.evaluate(bannerView)).top, { timeout: 2000 }).toBeGreaterThanOrEqual(chrome - 0.5);
  const after = await page.evaluate(bannerView);
  expect(after.covered, `covers ${after.covered}`).not.toContain("btn-practice-stop");
  expect(after.inView, "Restore sound is still on screen").toBe(true);
});
