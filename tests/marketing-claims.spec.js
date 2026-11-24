/**
 * The promises the selling copy makes, proved by what the product does rather than by a line in a file
 * (docs/48 section 11: a string can stay while the behaviour behind it changes, AGENTS.md's rejected pattern).
 *
 *  - "sin límite de minutos" / "no time limit": takes of their full length start and run to their end, are
 *    counted, and open no Pro or account window, for three visitors: one on a first day with over an hour
 *    already practised today; a heavy one ten years on, on a Sunday night at the end of a month, in English,
 *    with forty days of eight hours, ten hours and three hundred takes today in both of the app's records,
 *    on the third page load, from the catalog and a routine; and one who first came 45 days ago. Single
 *    exercises, Start again after a rating, a pitch exercise, the catalog and a routine are each a way in.
 *    Third round: the longest exercise (20 minutes), a drill with no microphone, "+30 s" and Next in a routine,
 *    the daily class (started by its size chip and Start since the fifth round), and a visitor on a phone in Madrid
 *    whose trial has ended and whose basics are done. Every
 *    take played to its end, and the takes "+30 s" and Start right after Stop begin, check at their start and
 *    five seconds before their end that the microphone listens and its frames reach the take (the level meter
 *    moves), and that the piano sounds where its box is ticked; the take stopped half a minute in checks at its
 *    start. Sixth round, every way in no visit pressed, each a take that starts and hears with nothing in its way:
 *    past an hour today, Esencial picked and started, a paused routine's Continue on its bar (after the progress
 *    board is drawn again), Continuar práctica, a goal set, a catalog route, the 12-week plan, Historial's Abrir
 *    and a link to an exercise; and a guest back after six days, with eighty hours before, at the welcome-back
 *    card's ▶ 5 min and Último ejercicio and the reminder's ▶ 5 min (the classic home's: they are drawn only on a
 *    day not practised yet, so "past an hour today" cannot meet them; see MK87 in qa/mutate.mjs).
 *  - "Tu voz se queda en tu dispositivo" / "your voice stays on your device": for a visitor the app treats as
 *    a person (so its analytics send), recording a take, saving it, a minute after, leaving the page and the
 *    next visit together send nothing the size of the take, by any request, header, cookie, WebSocket frame,
 *    worker or WebRTC connection in any frame. The same counter is shown to catch the saved take sent nine
 *    ways, and the take is still on the device on the next visit. Third round: a rating, a singing take run to
 *    its end and saved (a second save), three minutes on, and two more visits.
 *  - "No necesitas cuenta" / "no account needed": takes on both tracks, a rating, a saved recording, a routine
 *    half done and a take made in a second tab open all along are there in both tabs a minute later, and after
 *    the browser is restarted 31 and 32 days on, where Historial shows the day and the recording, the recording
 *    plays, and a new take is kept, with no sign-in asked at the save or the play. Sixth round, past an hour today:
 *    a guest who has rated eleven takes today rates a twelfth, which is kept and in Historial; and one with five
 *    recordings saved saves a sixth and a seventh, each listed in Historial and played there.
 *  - "nunca durante la práctica" (terms.html): with ads switched on, no ad of any kind (studio tip, preview or
 *    AdSense unit) is drawn at any moment of a guided routine, in any of the four ad modes, whatever is called
 *    and wherever the visitor goes in between, nor while a take starts or is live; the end-of-task card goes as
 *    a new take or a routine starts, and is not drawn while a take is starting. A routine paused and then
 *    continued, or paused with its step taken anyway, is practice again. Each check has a control that draws an
 *    ad in the same way when practice is over, so none of them passes because nothing could be drawn.
 *
 * Each has planted defects in qa/mutate.mjs that turn it red (MK3, MK19 to MK22, MK26 to MK46, MK49 to MK102), in
 * five browser sets: "promises", "promises-time-2" and "promises-time-3" (the time limit's, in thirds),
 * "promises-voice" and "promises-account-ads". MK26 to MK29 are what Codex's review showed the first version let through; MK30 to MK46
 * are what the second red team showed the second version let through; MK49 to MK70 are the third red team's, on
 * paths the third version walks now; MK71 to MK75 the review of that round's: silent takes and a send on an
 * interval's later tick; MK76 to MK78 the review of those fixes: a cap after the level meter, a piano booked but not
 * heard, and a loop silent after its first pass; MK79 to MK81 the fourth red team's: a reference that stops
 * looping, a mode handed silence and a highway fed nothing; MK82 to MK86 the fifth's: a mode handed a copy with its
 * sound gate shut, a loop whose next pass is cancelled, a highway stopped for the take, the class chip turned back
 * into Esencial where the start panel picks the size, and a guest asked to sign in before a saved take plays;
 * MK87 to MK102 the sixth's: a cap, spelled where the static guards do not look, on each way in the sixth round
 * walks, a twelfth rating swallowed and a sixth recording refused (docs/48 section 11). What no scenario can walk is held in the code itself by tests/node/promise-guards.test.mjs
 * ("guards" set).
 */
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const ROOT = path.resolve(__dirname, "..");

// The visitor's calendar is the test's, not the machine's: Lima keeps no daylight saving, so a day key is the
// same on a laptop in Madrid and on a CI runner in UTC (where 22:00 in Lima is already the next day).
test.use({ timezoneId: "America/Lima", locale: "es-PE" });

const NOW = "2026-09-23T10:00:00-05:00"; // a Wednesday morning
const LATER = "2036-08-31T22:00:00-05:00"; // a Sunday night, the last day of a month, ten years on
const DAY_MS = 86400000;
const dayOf = (iso) => iso.slice(0, 10);

/** YYYY-MM-DD, `n` days before `day`. */
function daysBefore(day, n) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * A free visitor with a fake microphone and the tour seen, on a clock the test owns. `days` seeds the practice
 * ledger on the first load. `person` drops every mark of a test run (the e2e flag and navigator.webdriver), so the
 * app does what it does for a person, analytics included. `holdMic` keeps the microphone answer back until
 * window.__vtReleaseMic() is called, so the start-up of a take can be looked at. MediaRecorder is wrapped to keep
 * count of what it records, so a test knows how big a take is.
 */
async function boot(page, { days = null, lang = "es", now = NOW, person = false, holdMic = false, query = "" } = {}) {
  // The production worker's host answers here, so no run sends to it: the stability pass of the third red team
  // saw the "no time limit" visitors, whose analytics are on, post events to it on every run and every mutant.
  await page.route(/^https:\/\/vocal-studio-entitlements\.vocalstudio-pe\.workers\.dev\//, (route) => route.fulfill({ status: 204, body: "" }));
  await page.clock.install({ time: new Date(now) });
  await page.addInitScript(
    ({ days, lang, person, holdMic }) => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_mic_primed_v1", "1");
        localStorage.setItem("vt_lang", lang);
        if (!localStorage.getItem("vt_settings_v1")) localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: "singing" }));
        if (!person) {
          sessionStorage.setItem("vt_e2e", "1");
          sessionStorage.setItem("vt_stepdone_e2e", "1");
          sessionStorage.setItem("vt_rate_e2e", "1");
        }
        if (days && !sessionStorage.getItem("vt_seeded")) {
          sessionStorage.setItem("vt_seeded", "1");
          localStorage.setItem("vt_days_v1", JSON.stringify({ v: 1, days, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true }));
        }
      } catch {
        /* ignore */
      }
      if (person) Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
      window.__vtHoldMic = holdMic;
      const AC = window.AudioContext || window.webkitAudioContext;
      async function fakeGUM() {
        if (window.__vtHoldMic) await new Promise((r) => (window.__vtReleaseMic = r));
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

      window.__vtTake = { bytes: 0 };
      const MR = window.MediaRecorder;
      if (MR) {
        window.MediaRecorder = class extends MR {
          constructor(...args) {
            super(...args);
            this.addEventListener("dataavailable", (e) => {
              if (e.data?.size) window.__vtTake.bytes += e.data.size;
            });
          }
        };
      }
    },
    { days, lang, person, holdMic }
  );
  await page.goto(BASE + "/" + query, { waitUntil: "domcontentloaded" });
  await ready(page);
}

async function ready(page) {
  await page.waitForFunction(() => !!window.VTApp && !!window.VTLoop && !!window.VTSession && !!window.VTAds && !!window.VTDays);
  await page.clock.runFor(500);
}

const live = (page) => page.evaluate(() => !!window.VTApp.getState().practiceLive);

/**
 * Press Start: the take goes live, with no window opened in its place. The kill-reasons pass of the third red team
 * showed seven caps that opened the Pro window instead were reported only as "Timeout 10000ms exceeded", which
 * reads the same as a broken fake microphone; the poll now says which of the three it saw.
 */
async function start(page, label = "the take") {
  await page
    .locator("#btn-practice-start")
    .click({ timeout: 10000 })
    .catch((e) => {
      throw new Error(`${label}: Start cannot be pressed. ${e.message.split("\n").slice(0, 6).join(" ")}`);
    });
  await expect
    .poll(
      async () => ({
        live: await live(page),
        proWindow: await page.locator("#pricing-modal").isVisible(),
        accountWindow: await page.locator("#account-modal").isVisible()
      }),
      { message: `${label}: Start makes it live, with no Pro or account window in its place`, timeout: 10000 }
    )
    .toEqual({ live: true, proWindow: false, accountWindow: false });
}

/** Start the open exercise and run its clock out, shortened to `sec` (where the length is not what is tested). */
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

async function rate(page) {
  await page.locator('.rate-btn[data-feel="ok"]').click();
  await expect(page.locator("#score-result")).toBeVisible();
  await page.clock.runFor(1000);
}

/* ------------------------------------------------------------------ no time limit */

/** Seconds of practice the ledger holds for the app's own today (its day key, not one worked out here). */
const todaySec = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("vt_days_v1") || "{}").days?.[window.VTDays.dayKey()]?.sec || 0);

/** No window stands between the visitor and the next take. */
async function nothingInTheWay(page, label) {
  await expect(page.locator("#pricing-modal"), `${label}: no Pro window`).toBeHidden();
  await expect(page.locator("#account-modal"), `${label}: no account window`).toBeHidden();
}

/** Drills that never open the microphone (release and breathing), so a take of them is not expected to listen. */
const MIC_FREE = new Set(["s17-jaw-neck-release", "s18-costal-breath"]);

/**
 * The exercises these visits play whose reference progression loops for the whole take, written out rather than
 * read from the code: a reference that plays once and stops (MK79) leaves the piano booked and ringing for the
 * first seconds of a jumped take, so only the loop itself shows it.
 */
const LOOPS = new Set(["s4-lip-trills", "s3-song-stanzas"]);
/** The exercises whose loop was checked, so a visit can show its checks ran. */
const loopsChecked = new Set();
/** The looping exercises whose take outlasted the pass sounding at its start and was held to another, likewise. */
const passesChecked = new Set();

/** What a live take is doing for the visitor: is the microphone open, and does the reference piano sound. */
const heard = (page) =>
  page.evaluate(() => ({
    id: window.VTApp.getState().exercise?.id,
    mic: !!window.VTApp.getState().practice?.running,
    piano: !!(window.VTPiano?.loopActive || window.VTPiano?.playing?.length),
    loop: !!window.VTPiano?.loopActive,
    pianoOn: !!document.querySelector("#chk-auto-piano")?.checked
  }));

/** Seconds left on the live take's clock. */
const secondsLeft = (page) => page.evaluate(() => (window.VTApp.getState().timer.endAt - performance.now()) / 1000);

/**
 * In the page: from now on, count the frames the exercise's mode is handed that are the engine's own frame (the
 * object the microphone's engine handed the take, not a copy of it) with its sound gate open and a raw pitch, the
 * fields the modes decide on (a trill's tracker and the voice detector read `sounding`, a siren `rawFreq`; the
 * no-microphone ticker's frames are marked noMic). Not its exact pitch: an octave error or a speech drill may read
 * the tone another way, and that is not what this asks. Mark the time, so the highway's points drawn from now on
 * are told from older ones, and set the level meter to zero.
 */
function watchFrames() {
  const st = window.VTApp.getState();
  const el = document.querySelector("#level-fill");
  const mode = st.modeInstance;
  const engine = st.practice;
  window.__vtModeFrames = 0;
  // Each take wires the engine afresh, so its hand-off is watched again whenever it is a new one.
  if (engine?.onFrame && !engine.onFrame.__vtSeen) {
    const handOn = engine.onFrame;
    engine.onFrame = function (frame) {
      window.__vtEngineFrame = frame;
      return handOn.apply(this, arguments);
    };
    engine.onFrame.__vtSeen = true;
  }
  if (mode && !mode.__vtCounted) {
    const onFrame = mode.onFrame;
    mode.onFrame = function (frame) {
      const open = !!frame && frame === window.__vtEngineFrame && !frame.noMic && !!frame.sounding && frame.rawFreq > 0;
      if (open) window.__vtModeFrames++;
      return onFrame.apply(this, arguments);
    };
    mode.__vtCounted = true;
  }
  window.__vtPitchMark = performance.now();
  const showPitch = !!window.VTApp.getProfile(st.exercise)?.showPitch;
  const shown = !!el?.getClientRects().length;
  if (shown) el.style.width = "0%";
  return { shown, mode: !!mode, highway: !showPitch || !!window.VTGetPitchViz?.(), showPitch };
}

/**
 * In the page: what the watched half second did. `drawn` counts the points with a voice the highway kept since the
 * mark (what it draws), not the calls made to it: a stopped highway is called and keeps nothing.
 */
function readFrames() {
  const viz = window.VTGetPitchViz?.();
  const mark = window.__vtPitchMark;
  return {
    width: parseFloat(document.querySelector("#level-fill")?.style.width) || 0,
    frames: window.__vtModeFrames,
    drawn: (viz?.history || []).filter((h) => h && h.t > mark && h.voiceMidi != null).length,
    highwayRuns: !!viz?.running,
    paused: !!window.VTApp.getState().practice?._analysisPaused
  };
}

/**
 * The live take hears and plays: the microphone is open and its frames reach the take (the level meter, set to
 * zero here, moves again within half a second; the exercise's own mode is handed the engine's frames with their
 * sound gate open in that time; a pitch exercise's highway runs and keeps new points of the voice; and the
 * analysis is not paused), and the reference piano plays where its box is ticked (see pianoPlays). The third red
 * team showed a take could be live and counted while it heard nothing and played nothing; the review of that round
 * showed that an open microphone alone (`running`) stays true while every frame is dropped, that a piano checked
 * only at the start could fall silent after it; the review of the fix, that the meter is only the first thing a
 * frame feeds (a cap after it would drop the rest), and that a piano's books are not its sound; the fourth red
 * team, that a count of the mode's calls passes a mode handed silence (MK80) and leaves the pitch line unwatched
 * (MK81), and that a reference ringing from the take's start passes one that no longer loops (MK79); the fifth,
 * that a mode handed a copy with only its gate shut passes a check of level and pitch (MK82), and that a highway
 * stopped for the take passes a count of the calls made to it (MK84). `end` marks the check five seconds before a
 * take's end.
 */
async function hears(page, label, { mic = true, end = false } = {}) {
  const now = await heard(page);
  if (now.pianoOn && LOOPS.has(now.id)) {
    expect(now.loop, `${label}: the reference progression loops, as it does for the whole take`).toBe(true);
    loopsChecked.add(now.id);
  }
  if (now.pianoOn) await pianoPlays(page, label, { booked: now.piano, end, id: now.id });
  if (!mic) return;
  expect(now.mic, `${label}: the microphone is listening`).toBe(true);
  const meter = await page.evaluate(watchFrames);
  await page.clock.runFor(500);
  const after = await page.evaluate(readFrames);
  expect(after.paused, `${label}: the microphone's analysis is not paused`).toBe(false);
  expect(
    { shown: meter.shown, mode: meter.mode, highway: meter.highway },
    `control: ${label}: the level meter is on screen, a mode takes the frames, and a pitch exercise has its highway, so frames that stop would show`
  ).toEqual({ shown: true, mode: true, highway: true });
  expect(after.width, `${label}: the microphone's frames reach the take (the level meter moves)`).toBeGreaterThan(0);
  expect(after.frames, `${label}: the voice reaches the exercise itself (its mode is handed the engine's frames, sound gate open)`).toBeGreaterThan(0);
  if (!meter.showPitch) return;
  expect({ runs: after.highwayRuns, drawn: after.drawn > 0 }, `${label}: the pitch highway runs and draws the voice`).toEqual({ runs: true, drawn: true });
}

/**
 * The reference piano where its box is ticked: its notes are booked, and its output, as the piano's own monitor on
 * the master bus reads it, carries sound (silence reads 0, the unlock blips about 0.001, a note 0.2 to 0.9). The
 * audio runs on the real clock and the page's timers on the test's, so the check steps the page's clock 100 ms at a
 * time, up to three seconds, while it waits: a looping piano schedules each pass on a timer, and a jump leaves the
 * last pass to run out in real time while the next waits on the page's clock (CI caught this).
 *
 * A take's minutes are jumped in a second or two of real time, so near the end the start's notes may still be
 * ringing: sound there does not show that the piano still plays. So from the start's check on, every note the
 * piano schedules is counted, with whether it is wired to the master bus, and near the end every one must be
 * (MK78: a loop silent after its first pass). A pass can be longer than a short take (up to 20 notes of up to
 * 5.5 s in the one-note mode), so a take may schedule none in between; the long takes schedule several.
 *
 * A piano that cues (an exercise whose mode sounds each target once, for about a second and a half, when the
 * target changes) need not sound near the end: it sounds again only when the singer moves the mode on, which the
 * fake microphone's one tone does not. Any cue it did schedule must still be wired.
 *
 * And a looping reference whose take outlasts the pass that was sounding at its start (with three seconds to
 * spare) must have scheduled another pass by the end: the fifth red team kept the loop flagged on and cancelled its
 * next pass (MK83), so the take went silent after about 48 seconds while every note counted (none) was wired. A
 * short take inside one pass ("+30 s") is not held to it.
 */
async function pianoPlays(page, label, { booked, end, id }) {
  expect(booked, `${label}: the reference piano's notes are booked, as its tick says`).toBe(true);
  const loops = await page.evaluate(() => !!window.VTPiano.loopActive);
  if (end) {
    const notes = await page.evaluate(() => window.__vtPianoNotes && { ...window.__vtPianoNotes, pass: window.__vtPass });
    expect(notes, `control: ${label}: the piano's notes were counted since the take's start`).toBeTruthy();
    expect(notes.wired, `${label}: every note the piano scheduled since the start reaches its master bus`).toBe(notes.made);
    loopGoesOn(label, id, notes);
    if (!loops) return;
  }
  let stepped = 0;
  const peak = async () => {
    const p = await page.evaluate(() => window.VTPiano.outputPeak());
    if (p <= 0.01 && stepped < 3000) {
      await page.clock.runFor(100);
      stepped += 100;
    }
    return p;
  };
  await expect
    .poll(peak, { message: `${label}: the reference piano is heard: its output carries sound`, timeout: 10000, intervals: [50] })
    .toBeGreaterThan(0.01);
  if (!end) await countPianoNotes(page);
}

/** A looping reference whose take outlasts the pass sounding at its start scheduled another (see pianoPlays). */
function loopGoesOn(label, id, { made, pass }) {
  if (!LOOPS.has(id) || !(pass?.total > pass.left + 3)) return;
  expect(made, `${label}: the reference loop scheduled another pass, as the take outlasts the one sounding at its start`).toBeGreaterThan(0);
  passesChecked.add(id);
}

/**
 * From now on, count each note the piano schedules and whether its gain is wired to the piano's master bus. A
 * count only: the notes are made and wired by the piano's own code, as before. Keep how long the pass sounding now
 * has left (in the audio's time) and how long the take has left (on its clock's end, not its length: a '+30 s'
 * keeps the step's length).
 */
function countPianoNotes(page) {
  return page.evaluate(() => {
    window.__vtPianoNotes = { made: 0, wired: 0 };
    const P = window.VTPiano;
    const endAt = window.VTApp.getState().timer.endAt;
    window.__vtPass = { left: Math.max(0, (P.soundingUntil || 0) - (P.ctx?.currentTime || 0)), total: (endAt - performance.now()) / 1000 };
    if (P.__vtCounted) return;
    P.__vtCounted = true;
    const connect = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (dest, ...rest) {
      if (dest && dest === window.VTPiano.master) this.__vtToMaster = true;
      return connect.call(this, dest, ...rest);
    };
    const playNote = P.playNote;
    P.playNote = function (...args) {
      const gain = playNote.apply(this, args);
      if (gain) {
        window.__vtPianoNotes.made++;
        if (gain.__vtToMaster) window.__vtPianoNotes.wired++;
      }
      return gain;
    };
  });
}

/**
 * One take of its full length, `expected` seconds as a first visitor gets it: it starts with all of it on the
 * clock, hears and plays (see hears; no microphone for the MIC_FREE drills) at its start and five seconds before
 * its end, is still live then, ends on its own, and is counted as practice. Most of it is jumped over, but not
 * shortened, so a cap that cuts the take on the clock is seen (the first version set every take to 50 s).
 *
 * What the jump cannot show: Playwright's fastForward fires each due timer once and runs no frames in between, so
 * a take of minutes is analysed for about a second. A cap counted in heard audio, in frames or in a timer's ticks
 * ("stop after two minutes of singing") is not reached here; playing each take in real frames would cost its full
 * length in CPU. The guards hold the free-visitor form of it (a plan read in the engine's onFrame, PX2).
 */
async function fullTake(page, label, expected, { mic = null } = {}) {
  const id = await page.evaluate(() => window.VTApp.getState().exercise?.id);
  if (mic === null) mic = !MIC_FREE.has(id);
  const before = await todaySec(page);
  expect(await page.evaluate(() => window.VTApp.getState().timer.total), `${label}: the take has its full length`).toBe(expected);
  await start(page, label);
  const left = await page.evaluate(() => (window.VTApp.getState().timer.endAt - performance.now()) / 1000);
  expect(left, `${label}: all of it is on the clock`).toBeGreaterThanOrEqual(expected - 3);
  await hears(page, label, { mic });
  await page.clock.fastForward((await secondsLeft(page) - 5.5) * 1000);
  expect(await live(page), `${label}: still live five seconds before its end`).toBe(true);
  await hears(page, `${label}, five seconds before its end`, { mic, end: true });
  await nothingInTheWay(page, label);
  await page.clock.runFor(6500);
  expect(await live(page), `${label}: it ends when its clock does`).toBe(false);
  expect((await todaySec(page)) - before, `${label}: the whole take is counted as practice`).toBeGreaterThanOrEqual(expected - 10);
  await nothingInTheWay(page, label);
}

/** The visitor's today, as the app keys it, must be the day the test seeded (else "over an hour today" is untrue). */
async function todayIs(page, day) {
  expect(await page.evaluate(() => window.VTDays.dayKey()), "control: the app's today is the seeded day").toBe(day);
}

const SINGLE_LENGTH = 300; // s4-lip-trills, s5-sirens and v1-diction, as a first visitor gets them
const LONGEST_LENGTH = 1200; // s3-song-stanzas, the longest exercise in the catalog
/**
 * The lengths a routine's steps are planned with (js/daily-loop.js ROUTINES, singing "min"; VT_DAILY_SESSION),
 * written out: the stability pass of the third red team cut every basics step to 30 s past an hour, and a test
 * that took the length from the session the code had built expected 30 and passed. (The five-minute Mínimo is a
 * dormant experiment; if it wakes, these fail and say so.)
 */
const PLANNED = { basics: { "s4-lip-trills": 90, "s27-lip-trill-solfege": 90 }, daily: { "s17-jaw-neck-release": 105 } };

test("no time limit: a first-day visitor past an hour today takes five full takes: a pitch exercise, Start again, the longest exercise and a drill with no microphone", async ({
  page
}) => {
  test.setTimeout(150000);
  loopsChecked.clear();
  passesChecked.clear();
  const today = dayOf(NOW);
  await boot(page, { person: true, days: { [today]: { sec: 3720, n: 24, ex: ["s4-lip-trills"] } } });
  await todayIs(page, today);
  expect(await todaySec(page), "control: over an hour today already").toBeGreaterThan(3600);
  await openSingle(page, "s4-lip-trills");
  await expect(page.locator("#chk-auto-piano"), "control: this exercise plays a reference, so a silent piano would show").toBeChecked();
  await fullTake(page, "a single exercise", SINGLE_LENGTH);
  await rate(page);
  await nothingInTheWay(page, "after the rating");
  await fullTake(page, "Start again", SINGLE_LENGTH);
  await openSingle(page, "s5-sirens");
  expect(await page.evaluate(() => !!window.VTApp.getProfile(window.VTApp.getState().exercise).showPitch), "control: a pitch exercise").toBe(true);
  await fullTake(page, "a pitch exercise", SINGLE_LENGTH);
  // The longest take there is, a song that records and plays: a cap at any length up to twenty minutes shows here,
  // which the five-minute takes above cannot show (the third red team cut every take to five minutes unseen).
  await openSingle(page, "s3-song-stanzas");
  await fullTake(page, "the longest exercise", LONGEST_LENGTH);
  // A drill that never opens the microphone, so its clock starts by the other branch of a take's start-up.
  await openSingle(page, "s17-jaw-neck-release");
  await fullTake(page, "a drill with no microphone", 120);
  expect([...loopsChecked].sort(), "control: both looping references had their loop checked").toEqual([...LOOPS].sort());
  expect([...passesChecked].sort(), "control: both looping references' takes outlasted a pass and were held to the next").toEqual([...LOOPS].sort());
});

/** The routine under way: its path, state, the step open now and that step's planned length (its own, or the class's). */
const stepNow = (page) =>
  page.evaluate(() => {
    const s = window.VTSession.get();
    const id = s?.order?.[s.index];
    const sec = Number(s?.sec?.[id]) || (s?.path === "daily" ? Number(window.VT_DAILY_SESSION?.sec?.[id]) : 0) || null;
    return { path: s?.path, status: s?.status, id, sec };
  });

/** '+30 s' on a finished routine step: thirty more seconds, hearing and playing, live to their end and counted. */
async function moreTake(page, label) {
  const before = await todaySec(page);
  await page.locator("#btn-step-done-more").click();
  await expect.poll(() => live(page), { timeout: 10000, message: `${label}: it starts` }).toBe(true);
  const left = await page.evaluate(() => (window.VTApp.getState().timer.endAt - performance.now()) / 1000);
  expect(left, `${label}: thirty seconds on the clock`).toBeGreaterThanOrEqual(27);
  await hears(page, label);
  await page.clock.fastForward((await secondsLeft(page) - 5.5) * 1000);
  expect(await live(page), `${label}: still live five seconds before its end`).toBe(true);
  await hears(page, `${label}, five seconds before its end`, { end: true });
  await nothingInTheWay(page, label);
  await page.clock.runFor(6500);
  expect(await live(page), `${label}: it ends when its clock does`).toBe(false);
  expect((await todaySec(page)) - before, `${label}: counted as practice`).toBeGreaterThanOrEqual(25);
}

/** `n` days of `sec` seconds each before `day`, and `day` itself. */
function heavyLedger(day, n, sec, todayRow) {
  return Object.fromEntries([
    ...Array.from({ length: n }, (_, i) => [daysBefore(day, i + 1), { sec, n: 40, ex: ["s4-lip-trills", "v1-diction"], basics: 1 }]),
    [day, todayRow]
  ]);
}

test("no time limit: a heavy visitor ten years on, on a Sunday night at the month's end, in English, from the catalog and a routine", async ({
  page
}) => {
  test.setTimeout(150000);
  const today = dayOf(LATER);
  await boot(page, { person: true, lang: "en", now: LATER, days: heavyLedger(today, 40, 8 * 3600, { sec: 10 * 3600, n: 300, ex: ["s4-lip-trills", "v1-diction"] }) });
  await todayIs(page, today);
  expect(await page.evaluate(() => new Date().getDay()), "control: a Sunday").toBe(0);
  // Today's takes in the other record too, so a cap that adds up the history is met as well as one that reads the ledger.
  await page.evaluate(() => {
    for (const id of ["s4-lip-trills", "v1-diction", "s5-sirens"]) {
      for (let i = 0; i < 50; i++) window.VTStorage.saveExerciseResult(id, { score: 7, durationSec: 600, metrics: {} });
    }
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  const fromHistory = await page.evaluate((day) => {
    const all = window.VTStorage.getProgress();
    return Object.values(all).reduce((n, row) => n + row.history.filter((h) => h.day === day).reduce((s, h) => s + h.durationSec, 0), 0);
  }, today);
  expect(fromHistory, "control: the history holds 25 hours today").toBe(150 * 600);
  expect(await todaySec(page), "control: the ledger holds 10 hours today").toBeGreaterThanOrEqual(10 * 3600);

  await page.locator('#exercise-list .card-ex[data-id="s4-lip-trills"]').click();
  await page.clock.runFor(300);
  await expect(page.locator("#view-exercise"), "control: the catalog opened the exercise").toHaveClass(/active/);
  await fullTake(page, "from the catalog", SINGLE_LENGTH);

  await page.reload({ waitUntil: "domcontentloaded" }); // the third page load, which reopens the exercise
  await ready(page);
  await page.locator("#btn-nav-home").click();
  await page.clock.runFor(300);

  // Another routine than the basics: the daily class, started as a visitor starts it, by its size chip and then
  // Start. The chip only selects; the start panel then offers the size picked (offeredTier), and Start hands it to
  // the loop's startTier and on to the page's startDaily (the hand-off a cap could wrap: the fourth red team's
  // proOnly(startDaily) in init). The fifth red team turned the class back into Esencial past an hour where the panel
  // picks the size (MK85), which a call to startTier went round; so it is walked, before the basics, since the chips
  // are hidden while a routine is open.
  expect(await page.evaluate(() => !!window.VTLoop.routine(window.VTApp.getState().tab === "vocal" ? "vocal" : "singing", "class")?.daily), "control: the class size is the daily class").toBe(true);
  await pickAndStart(page, "class");
  const daily = await stepNow(page);
  expect(daily.path, "the daily class starts from its chip and Start: it is under way").toBe("daily");
  expect(await page.evaluate(() => window.VTApp.getState().exercise?.id), "the daily class starts: its first step is open").toBe(daily.id);
  expect(PLANNED.daily[daily.id], `control: ${daily.id} is the class's first step as planned`).toBeDefined();
  await fullTake(page, "the daily class's first step", PLANNED.daily[daily.id]);

  // The class is ended from its bar (on its first step it ends without asking), and the basics are picked and
  // started the same way.
  await page.locator("#btn-session-end").click();
  await page.clock.runFor(400);
  expect(await stepNow(page), "control: the class was ended").toEqual({ path: undefined, status: undefined, id: undefined, sec: null });
  await pickAndStart(page, "min");
  const step = await stepNow(page);
  expect(step.status, "control: a routine is under way").toBe("active");
  expect(PLANNED.basics[step.id], `control: ${step.id} is a step of the basics as planned`).toBeDefined();
  await fullTake(page, "a routine's step", PLANNED.basics[step.id]);

  // The step's done card: thirty seconds more, then on to the routine's second step.
  await expect(page.locator("#step-done"), "control: the step's done card").toBeVisible();
  await moreTake(page, "'+30 s' on a finished step");
  await expect(page.locator("#step-done"), "control: the card again after the thirty seconds").toBeVisible();
  await page.locator("#btn-step-done-next").click();
  await page.clock.runFor(400);
  const second = await stepNow(page);
  expect(second.id, "control: the routine has a second step").not.toBe(step.id);
  expect(await page.evaluate(() => window.VTApp.getState().exercise?.id), "Next opens the routine's second step").toBe(second.id);
  expect(PLANNED.basics[second.id], `control: ${second.id} is a step of the basics as planned`).toBeDefined();
  await fullTake(page, "the routine's second step", PLANNED.basics[second.id]);
});

/** On the home's start panel: press a routine size's chip, which the panel must then offer, and Start. */
async function pickAndStart(page, tier) {
  const chip = page.locator(`#loop-tiers [data-tier="${tier}"]`);
  await expect(chip, `control: the ${tier} chip is on the start panel`).toBeVisible();
  await chip.click();
  await page.clock.runFor(300);
  await expect(chip, `the ${tier} chip, pressed, is the size the panel offers`).toHaveAttribute("aria-pressed", "true");
  await page.locator("#btn-next-step").click();
  await page.clock.runFor(400);
}

test("no time limit: a visitor who first came 45 days ago, past an hour today, takes four takes of one exercise, the last started again right after Stop", async ({
  page
}) => {
  test.setTimeout(150000);
  const first = new Date(new Date(NOW).getTime() - 45 * DAY_MS);
  await boot(page, { person: true, now: first.toISOString() });
  await openSingle(page, "v1-diction");
  await fullTake(page, "45 days ago", SINGLE_LENGTH);
  await page.clock.setSystemTime(new Date(NOW));
  const today = dayOf(NOW);
  await page.evaluate((today) => {
    const bag = JSON.parse(localStorage.getItem("vt_days_v1"));
    bag.days[today] = { sec: 3720, n: 24, ex: ["v1-diction"] };
    localStorage.setItem("vt_days_v1", JSON.stringify(bag));
  }, today);
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  await todayIs(page, today);
  await openSingle(page, "v1-diction");
  await fullTake(page, "today", SINGLE_LENGTH);
  await rate(page);
  await fullTake(page, "today, Start again", SINGLE_LENGTH);
  await rate(page);
  await fullTake(page, "today, a third take of the same exercise", SINGLE_LENGTH);
  // Stopped half a minute in and started again at once, as somebody does who fluffed the opening.
  await rate(page);
  await start(page, "a take stopped half a minute in");
  await hears(page, "a take stopped half a minute in");
  await page.clock.runFor(29500);
  await page.locator("#btn-practice-stop").click();
  await page.clock.runFor(300);
  expect(await live(page), "control: the take stopped").toBe(false);
  await start(page, "Start right after Stop");
  await hears(page, "Start right after Stop");
  const rest = await page.evaluate(() => (window.VTApp.getState().timer.endAt - performance.now()) / 1000);
  await page.clock.fastForward(Math.max(0, rest - 5.5) * 1000);
  expect(await live(page), "Start right after Stop: still live five seconds before its end").toBe(true);
  await hears(page, "Start right after Stop, five seconds before its end", { end: true });
  await nothingInTheWay(page, "Start right after Stop");
  await page.clock.runFor(5600);
  expect(await live(page), "Start right after Stop: it ends when its clock does").toBe(false);
});

test.describe("on a phone in Madrid", () => {
  test.use({ timezoneId: "Europe/Madrid", locale: "es-ES", viewport: { width: 412, height: 839 }, hasTouch: true, isMobile: true });

  test("no time limit: a visitor on a phone in Madrid, whose trial ended, with today's basics done and over an hour today, takes an advanced speaking exercise and a breathing drill", async ({
    page
  }) => {
    test.setTimeout(150000);
    const today = dayOf(NOW); // 10:00 in Lima is 17:00 the same day in Madrid
    const trialStarted = new Date(Date.parse(NOW) - 53 * DAY_MS).toISOString();
    await page.addInitScript((at) => {
      if (!localStorage.getItem("vt_billing_trial_started_v1")) localStorage.setItem("vt_billing_trial_started_v1", at);
    }, trialStarted);
    await boot(page, { person: true, days: { [today]: { sec: 3720, n: 24, ex: ["s4-lip-trills"], basics: 1 } } });
    await todayIs(page, today);
    expect(
      await page.evaluate(() => ({
        trialEnded: !!window.VTBilling.trialStartedAt() && !window.VTBilling.trialActive(),
        pro: !!window.VTBilling.isPro(),
        basicsDone: !!window.VTDays.basicsDoneToday(),
        touch: matchMedia("(pointer: coarse)").matches,
        zone: Intl.DateTimeFormat().resolvedOptions().timeZone
      })),
      "control: a free visitor past a trial, basics done, on a touch screen in Madrid"
    ).toEqual({ trialEnded: true, pro: false, basicsDone: true, touch: true, zone: "Europe/Madrid" });
    await openSingle(page, "v11-kill-fillers");
    await fullTake(page, "an advanced speaking exercise", 480);
    await openSingle(page, "s18-costal-breath");
    await fullTake(page, "a breathing drill with no microphone", 240);
  });
});

/*
 * The ways in the visits above never press (the sixth red team: five more ways to spell a cap that the static guards
 * cannot see, each on one of these). Walking them in the page catches a cap however it is spelled. Each take here is
 * checked at its start (hears), not run to its end: the visits above already run takes of every kind to their end.
 */

/** Seconds of practice today's takes in the history add up to (the app's other day record). */
const historyTodaySec = (page) =>
  page.evaluate(() => {
    const day = window.VTDays.dayKey();
    return Object.values(window.VTStorage.getProgress() || {}).reduce(
      (n, row) => n + (row.history || []).filter((h) => h.day === day).reduce((s, h) => s + (Number(h.durationSec) || 0), 0),
      0
    );
  });

/**
 * Over an hour today in both of the app's day records, for a visitor booted with today's ledger row: `n` takes of
 * ten minutes each today in the history too (rated `score`, or left unrated), then a reload, so every board on the
 * page (the progress board's Pro panel among them) is drawn from both.
 */
async function hourInBothRecords(page, { n = 7, score = null } = {}) {
  await page.evaluate(
    ({ n, score }) => {
      for (let i = 0; i < n; i++) window.VTStorage.saveExerciseResult(i % 2 ? "v1-diction" : "s4-lip-trills", { score, durationSec: 600, metrics: {} });
    },
    { n, score }
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  expect(
    { ledger: (await todaySec(page)) > 3600, history: (await historyTodaySec(page)) > 3600 },
    "control: over an hour today in both of the app's day records"
  ).toEqual({ ledger: true, history: true });
}

/** A free guest: never signed in, no licence, the plan the page shows is free. */
async function aFreeGuest(page) {
  expect(
    await page.evaluate(() => ({
      signedIn: !!window.VTAccount?.getState?.().signedIn,
      licence: !!window.VTLicense?.getClaims?.(),
      pro: !!window.VTBilling?.isPro?.(),
      trial: !!window.VTBilling?.trialActive?.()
    })),
    "control: a free guest, never signed in, with no licence or trial"
  ).toEqual({ signedIn: false, licence: false, pro: false, trial: false });
}

/** Press a way in that opens a take: it must be on screen and pressable, which a cap that disables it is not. */
async function press(page, selector, label) {
  await page
    .locator(selector)
    .click({ timeout: 10000 })
    .catch((e) => {
      throw new Error(`${label}: it cannot be pressed. ${e.message.split("\n").slice(0, 6).join(" ")}`);
    });
  await page.clock.runFor(400);
}

/** The take the way in opened starts with `expected` seconds on its clock, hears and plays, with nothing in its way. */
async function takeStarts(page, label, expected) {
  expect(await page.evaluate(() => window.VTApp.getState().timer.total), `${label}: the take has its full length`).toBe(expected);
  await start(page, label);
  expect(await secondsLeft(page), `${label}: all of it is on the clock`).toBeGreaterThanOrEqual(expected - 3);
  await hears(page, label);
  await nothingInTheWay(page, label);
}

/** Esencial's steps as planned (js/daily-loop.js ROUTINES, singing "ess"), written out like PLANNED. */
const ESSENTIAL = { first: ["s18-costal-breath", 75], second: ["s4-lip-trills", 90] };

test("no time limit: past an hour today, a free guest picks Esencial and starts it, then pauses it and takes it up again from the routine's Continue", async ({
  page
}) => {
  test.setTimeout(90000);
  const today = dayOf(NOW);
  await boot(page, { person: true, days: { [today]: { sec: 3720, n: 24, ex: ["s4-lip-trills"] } } });
  await todayIs(page, today);
  await hourInBothRecords(page);
  await aFreeGuest(page);

  // Esencial, picked by its chip and started with Start: the size a visitor picks for more than the basics.
  await pickAndStart(page, "ess");
  const first = await stepNow(page);
  expect({ path: first.path, id: first.id, sec: first.sec }, "Esencial starts from its chip and Start: its first step, as planned").toEqual({
    path: "basics",
    id: ESSENTIAL.first[0],
    sec: ESSENTIAL.first[1]
  });
  expect(await page.evaluate(() => window.VTApp.getState().exercise?.id), "Esencial's first step is open").toBe(first.id);
  await fullTake(page, "Esencial's first step", ESSENTIAL.first[1]);
  await press(page, "#btn-step-done-next", "Next, to Esencial's second step");
  expect((await stepNow(page)).id, "Next opens Esencial's second step").toBe(ESSENTIAL.second[0]);

  // Paused from the routine's bar, left for the home page (whose progress board is drawn again), and taken up again
  // from the bar's Continue, which must open the step it was paused on.
  await press(page, "#btn-session-pause", "the routine's Pause");
  expect((await stepNow(page)).status, "control: the routine is paused").toBe("paused");
  await press(page, "#btn-nav-home", "Practicar, with the routine paused");
  await expect(page.locator("#view-home"), "control: the home page, where the progress board is drawn again").toHaveClass(/active/);
  await expect(page.locator("#value-pulse-tag"), "control: the board was drawn for a free visitor").toHaveClass(/is-free/);
  await expect(page.locator("#btn-session-resume"), "control: the bar offers Continue").toBeVisible();
  await press(page, "#btn-session-resume", "the routine's Continue");
  expect(await stepNow(page), "Continue takes the routine up again where it was paused").toEqual({
    path: "basics",
    status: "active",
    id: ESSENTIAL.second[0],
    sec: ESSENTIAL.second[1]
  });
  expect(await page.evaluate(() => window.VTApp.getState().exercise?.id), "Continue opens the step it was paused on").toBe(ESSENTIAL.second[0]);
  await takeStarts(page, "Esencial's second step, after Continue", ESSENTIAL.second[1]);
});

/** The micro-session the welcome-back card and the reminder start: five minutes (js/app.js forceOpenExercise). */
const MICRO_LENGTH = 300;

/**
 * Back from a take stopped at its start, too short to count (so the welcome-back card, which a day practised hides,
 * is still there for the next way in), by the exercise's way back, to the page it was opened from.
 */
async function stopAndGoBack(page, label, view = "home") {
  await page.locator("#btn-practice-stop").click();
  await page.clock.runFor(300);
  await press(page, "#btn-back-home", `${label}: the way back`);
  await expect(page.locator(`#view-${view}`), `control: ${label}: back on the page it was opened from`).toHaveClass(/active/);
}

test("no time limit: a guest back after six days away, with eighty hours practised before, starts five-minute takes from the welcome-back card's ▶ 5 min and Último ejercicio and from the reminder", async ({
  page
}) => {
  test.setTimeout(90000);
  // Ten days of eight hours, the last six days ago, in both records: the ledger seeded at the first load, and takes
  // in the history made that day (the last of them a pitch exercise, which Último ejercicio must open).
  const away = new Date(Date.parse(NOW) - 6 * DAY_MS).toISOString();
  const last = dayOf(away);
  const days = Object.fromEntries(Array.from({ length: 10 }, (_, i) => [daysBefore(last, i), { sec: 8 * 3600, n: 40, ex: ["s4-lip-trills", "s5-sirens"] }]));
  // The welcome-back card and the reminder's ▶ 5 min are the classic home's (the dormant loop_home_2026_10 test,
  // whose other arm is served by its own link); the loop's home has its start panel in their place.
  await boot(page, { person: true, now: away, days, query: "?ab_loop_home_2026_10=classic" });
  await page.evaluate(async () => {
    for (let i = 0; i < 6; i++) window.VTStorage.saveExerciseResult("s4-lip-trills", { score: 7, durationSec: 1200, metrics: {} });
  });
  await page.clock.runFor(2000);
  await page.evaluate(() => window.VTStorage.saveExerciseResult("s5-sirens", { score: 7, durationSec: 1200, metrics: {} }));
  await page.clock.setSystemTime(new Date(NOW));
  // A daily reminder at nine, which is due at ten.
  await page.evaluate(() => localStorage.setItem("vt_reminders_v1", JSON.stringify({ enabled: true, times: ["09:00"], days: [0, 1, 2, 3, 4, 5, 6], lastNotifiedDay: null, browserNotify: false })));
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  await todayIs(page, dayOf(NOW));
  await aFreeGuest(page);
  expect(
    await page.evaluate(() => ({ loop: !!window.VTLoop.enabled(), hours: Math.round(window.VTDays.summary().minutes / 60), away: window.VTDays.summary().daysAway })),
    "control: the classic home, eighty hours practised before, six days away"
  ).toEqual({ loop: false, hours: 80, away: 6 });
  expect(await historyTodaySec(page), "control: nothing practised today, which the welcome-back card asks for").toBe(0);

  const wb = page.locator("#welcome-back");
  await expect(wb, "control: the welcome-back card").toBeVisible();
  await press(page, "#wb-micro", "the welcome-back card's ▶ 5 min");
  expect(await page.evaluate(() => window.VTApp.getState().exercise?.id), "▶ 5 min opens its exercise").toBe("s15-sh-air-ladder");
  await takeStarts(page, "the welcome-back card's ▶ 5 min", MICRO_LENGTH);
  await stopAndGoBack(page, "▶ 5 min");

  await expect(wb, "control: the card is still there, as the take was too short to count").toBeVisible();
  await press(page, "#wb-last", "the welcome-back card's Último ejercicio");
  expect(await page.evaluate(() => window.VTApp.getState().exercise?.id), "Último ejercicio opens the exercise practised last").toBe("s5-sirens");
  await takeStarts(page, "Último ejercicio", MICRO_LENGTH);
  await stopAndGoBack(page, "Último ejercicio");

  await expect(page.locator("#remind-due"), "control: the reminder, due since nine").toBeVisible();
  await press(page, "#rd-start", "the reminder's ▶ 5 min");
  expect(await page.evaluate(() => window.VTApp.getState().exercise?.id), "the reminder's ▶ 5 min opens its exercise").toBe("s15-sh-air-ladder");
  await takeStarts(page, "the reminder's ▶ 5 min", MICRO_LENGTH);
});

/** The exercise open now, and the length the catalog gives it (its data, js/exercises-data.js, not the page's code). */
const openNow = (page) =>
  page.evaluate(() => {
    const id = window.VTApp.getState().exercise?.id;
    const ex = Object.values(window.VT_EXERCISES || {})
      .flat()
      .find((e) => e.id === id);
    return { id, length: ex?.timerDefaultSec ?? null };
  });

/** Home's other ways in, folded behind "Otras formas de practicar" once the loop owns the start panel. */
async function moreWays(page, selector) {
  if (!(await page.locator(selector).isVisible())) await press(page, "#btn-more-ways", "Otras formas de practicar");
}

/**
 * A routine's first step, opened by a way in: under way on its path, the step open, and its take as long as planned
 * (`sec`, the routine's own length for it; a catalog route plans none, and the take has the exercise's own `length`).
 */
async function routineOpens(page, label, path, { id, sec = null, length = sec }) {
  expect(await stepNow(page), `${label}: under way, on its first step as planned`).toEqual({ path, status: "active", id, sec });
  expect((await openNow(page)).id, `${label}: its first step is open`).toBe(id);
  await takeStarts(page, `${label}'s first step`, length);
  await page.locator("#btn-practice-stop").click();
  await page.clock.runFor(300);
  await press(page, "#btn-session-end", `${label}: Terminar`);
  expect((await stepNow(page)).path, `control: ${label} was ended`).toBeUndefined();
}

/**
 * The first steps these ways in open, written out: the pitch goal set's (js/session-sets.js SETS "s-pitch", planned at
 * three minutes) and the advanced catalog route's (VT_STRUCTURED "singing_advanced", which plans no length of its
 * own, so the take is the exercise's five minutes).
 */
const GOAL_SET = { id: "s9-pitch-match", sec: 180 };
const CATALOG_ROUTE = { id: "s4-lip-trills", length: SINGLE_LENGTH };

test("no time limit: past an hour today, a free guest starts takes from Practicar's other ways in: Continuar, a goal set, a catalog route, the 12-week plan, Historial and a link to an exercise", async ({
  page
}) => {
  test.setTimeout(90000);
  const today = dayOf(NOW);
  await boot(page, { person: true, days: { [today]: { sec: 3720, n: 24, ex: ["s4-lip-trills"] } } });
  await todayIs(page, today);
  await hourInBothRecords(page);
  await aFreeGuest(page);

  // "▶ Continuar práctica", with no routine open: the first basic exercise not practised yet.
  await moreWays(page, "#btn-continue");
  await press(page, "#btn-continue", "Continuar práctica");
  const next = await openNow(page);
  expect(next.id, "Continuar práctica opens the first basic exercise not practised yet").toBe("s1-vocal-fry");
  await takeStarts(page, "Continuar práctica", next.length);
  await stopAndGoBack(page, "Continuar práctica");

  // A goal set, from its sheet.
  await moreWays(page, "#btn-sets");
  await press(page, "#btn-sets", "Rutinas por objetivo");
  await press(page, `#sets-list [data-set-start="s-pitch"]`, "the pitch goal set's Start");
  await routineOpens(page, "the pitch goal set", "set", GOAL_SET);

  // A route through the catalog, from "Iniciar sesión guiada".
  await moreWays(page, "#btn-structured");
  await page.locator("#session-path").selectOption("advanced");
  await press(page, "#btn-structured", "Iniciar sesión guiada");
  await routineOpens(page, "the advanced route", "advanced", CATALOG_ROUTE);

  // One of the 12-week plan's exercises, its focus picked first.
  await press(page, "#btn-plan", "Plan de 12 semanas");
  await press(page, "#element-chips .chip:visible >> nth=0", "the plan's first focus");
  await press(page, '#plan-exercise-list [data-open-ex="s8-breath-support"]', "the plan's breath-support exercise");
  const planned = await openNow(page);
  expect(planned.id, "the plan opens its exercise").toBe("s8-breath-support");
  await takeStarts(page, "the 12-week plan's exercise", planned.length);
  await stopAndGoBack(page, "the 12-week plan's exercise", "plan");

  // Historial's "Abrir →" on an exercise practised today.
  await press(page, "#btn-history", "Historial");
  await press(page, '#history-list [data-open-ex="s4-lip-trills"] >> nth=0', "Historial's Abrir");
  expect((await openNow(page)).id, "Historial opens the exercise").toBe("s4-lip-trills");
  await takeStarts(page, "Historial's Abrir", SINGLE_LENGTH);
  await stopAndGoBack(page, "Historial's Abrir", "history");

  // A link to an exercise, opened in a new tab of the same browser (so with the same records).
  const tab = await page.context().newPage();
  await boot(tab, { person: true, query: "#ejercicio/s5-sirens" });
  await todayIs(tab, today);
  expect((await openNow(tab)).id, "a link to an exercise opens it").toBe("s5-sirens");
  await takeStarts(tab, "a link to an exercise", SINGLE_LENGTH);
  await tab.close();
});

/* ------------------------------------------------------------------ your voice stays on your device */

/** Request headers the browser sets by itself. The page may set some of them too, so their values are watched. */
const BROWSER_HEADERS =
  /^(accept|accept-encoding|accept-language|cache-control|connection|content-length|content-type|host|if-[a-z-]+|origin|pragma|priority|range|referer|sec-[a-z-]+|upgrade-insecure-requests|user-agent)$/i;

/** Characters a browser-set header may hold, in a value the browser did not send while the page loaded, before they count. */
const HEADER_ROOM = 64;

/** What the page may send while a take is recorded, saved, left and come back to: a few small requests. */
const EGRESS_BUDGET = 4096;
const REQUEST_BUDGET = 24;
/** How long nothing must be sent before a count is read. */
const QUIET_MS = 1500;

/** A same-origin GET for a file in this repository, with no query or only the page's ?v= stamp. */
function isRepoFile(url) {
  const u = new URL(url);
  if (u.origin !== new URL(BASE).origin) return false;
  if (u.search && !/^\?v=[\w.-]{1,32}$/.test(u.search)) return false;
  const p = decodeURIComponent(u.pathname);
  const file = path.join(ROOT, p.endsWith("/") ? p + "index.html" : p);
  return file.startsWith(ROOT) && fs.existsSync(file) && fs.statSync(file).isFile();
}

/**
 * In every frame of every page, the ways out that the network events cannot see: WebRTC connections (whose
 * traffic is UDP) and workers (whose own sockets are not routed here). Counted through a binding the test
 * holds, so a reload does not reset them; a frame made with no address is reached through the window it
 * hands back, which is patched before the page can use it.
 */
function countHidden() {
  const note = (kind) => {
    try {
      (window.__vtNote || window.top.__vtNote)(kind);
    } catch {
      /* ignore */
    }
  };
  const COUNTED = [
    ["RTCPeerConnection", "peers"],
    ["webkitRTCPeerConnection", "peers"],
    ["Worker", "workers"],
    ["SharedWorker", "workers"]
  ];
  const wrapConstructors = (w) => {
    for (const [name, kind] of COUNTED) {
      const C = w[name];
      if (typeof C !== "function") continue;
      w[name] = class extends C {
        constructor(...args) {
          super(...args);
          note(kind);
        }
      };
    }
    const sw = w.navigator?.serviceWorker;
    if (!sw?.register) return;
    const reg = sw.register.bind(sw);
    sw.register = (...args) => {
      note("workers");
      return reg(...args);
    };
  };
  // A child window is patched as the page first reaches it, through either door.
  const wrapGetter = (proto, prop, toWindow) => {
    const d = proto && Object.getOwnPropertyDescriptor(proto, prop);
    if (!d?.get) return;
    Object.defineProperty(proto, prop, {
      configurable: true,
      get() {
        const value = d.get.call(this);
        patch(toWindow(value));
        return value;
      }
    });
  };
  const patch = (w) => {
    if (!w || w.__vtPatched) return;
    try {
      w.__vtPatched = true;
      wrapConstructors(w);
      for (const proto of [w.HTMLIFrameElement?.prototype, w.HTMLFrameElement?.prototype, w.HTMLObjectElement?.prototype]) {
        wrapGetter(proto, "contentWindow", (x) => x);
      }
      wrapGetter(w.HTMLIFrameElement?.prototype, "contentDocument", (d) => d?.defaultView);
    } catch {
      /* a frame of another origin: its own copy of this script runs in it */
    }
  };
  patch(window);
}

/**
 * Every byte the page could use to send a take out, counted from reset(): each request's address, body and
 * headers, from any page or worker in the context, whatever its method, type or size; every WebSocket frame,
 * on sockets answered here so that none leaves the machine; and the requests themselves, so a take cut into
 * many small pieces is seen. Requests to other hosts are counted and answered here, for the same reason.
 * What the page fetched while it first loaded is learnt, and a later GET of the same file is not counted by
 * its address (a reload asks for them all again), though its headers are.
 */
async function countEgress(page) {
  const out = { gen: 0, bytes: 0, requests: 0, statics: 0, items: [], pending: [], lastAt: Date.now(), learning: true };
  const known = new Set();
  const seenValues = new Set();
  const hidden = { peers: 0, workers: 0 };
  await page.exposeBinding("__vtNote", (_src, kind) => {
    if (kind in hidden) hidden[kind] += 1;
  });
  await page.context().addInitScript(countHidden);

  const headerBytes = (h) =>
    Object.entries(h).reduce((n, [k, v]) => {
      const s = String(v);
      if (!BROWSER_HEADERS.test(k)) return n + k.length + s.length;
      if (out.learning) seenValues.add(k + ":" + s);
      return seenValues.has(k + ":" + s) ? n : n + Math.max(0, s.length - HEADER_ROOM);
    }, 0);
  const add = (gen, kind, url, n, isStatic) => {
    if (gen !== out.gen || out.learning) return;
    out.bytes += n;
    if (isStatic) out.statics += 1;
    else out.requests += 1;
    out.items.push({ kind, url: url.slice(0, 90), n });
  };

  page.context().on("request", (req) => {
    out.lastAt = Date.now();
    const url = req.url();
    if (/^(blob|data):/.test(url)) return;
    const gen = out.gen;
    const body = req.postDataBuffer()?.length ?? 0;
    const repoFile = req.method() === "GET" && !body && isRepoFile(url);
    if (out.learning && repoFile) known.add(url);
    const isStatic = repoFile && known.has(url);
    const base = isStatic ? 0 : url.length + body;
    out.pending.push(
      req
        .allHeaders()
        .catch(() => ({}))
        .then((h) => add(gen, req.resourceType(), url, base + headerBytes(h), isStatic))
    );
  });
  await page.route(
    (u) => !u.href.startsWith(BASE),
    (route) => route.fulfill({ status: 204, body: "" })
  );
  await page.routeWebSocket(/.*/, (ws) => {
    const gen = out.gen;
    add(gen, "websocket-open", ws.url(), ws.url().length, false);
    ws.onMessage((m) => add(gen, "websocket", ws.url(), typeof m === "string" ? Buffer.byteLength(m) : m.length, false));
  });
  return {
    hidden,
    known,
    /** Start counting afresh; the first call ends the learning of the page's own files. */
    reset() {
      out.learning = false;
      out.gen += 1;
      out.bytes = 0;
      out.requests = 0;
      out.statics = 0;
      out.items = [];
    },
    /**
     * Wait until nothing has been sent for a while, counted from this call too: a beacon is handed to the
     * network after the call that queued it returns, so a wait that began from the last request seen could
     * end before it (a control here once reported 0 bytes for eleven beacons that way).
     */
    async settle() {
      const t0 = Date.now();
      while (Date.now() - Math.max(out.lastAt, t0) < QUIET_MS && Date.now() - t0 < 15000) await page.waitForTimeout(100);
      await Promise.all(out.pending.splice(0));
      return { bytes: out.bytes, requests: out.requests, statics: out.statics, items: out.items.slice(), hidden: { ...hidden } };
    }
  };
}

/** Whether what was sent could have carried a take: too many bytes, too many requests, or a file fetched far too often. */
const couldCarry = (sent, staticBudget) => sent.bytes >= EGRESS_BUDGET || sent.requests > REQUEST_BUDGET || sent.statics > staticBudget;

/**
 * The smallest saved take of at least `min` bytes, cut into base64 pieces, sent one way. The shapes are the ones that slip under a per-request
 * size, type or address rule. `file` is a file the page loaded, for the ways that ride on an ordinary request.
 */
const sendTake = (page, how, file, min = 4 * EGRESS_BUDGET) =>
  page.evaluate(
    async ({ how, file, min }) => {
      const blobs = await Promise.all((await window.VTStorage.listRecordings()).map((r) => window.VTStorage.getRecordingBlob(r.id)));
      const take = blobs.filter((b) => b.size >= min).sort((a, b) => a.size - b.size)[0];
      const buf = new Uint8Array(await take.arrayBuffer());
      let s = "";
      for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
      s = btoa(s);
      const cut = (size) => {
        const pieces = [];
        for (let i = 0; i < s.length; i += size) pieces.push(s.slice(i, i + size));
        return pieces;
      };
      const each = async (size, fn) => {
        for (const p of cut(size)) await fn(p).catch(() => {});
      };
      const ways = {
        fetchText: () => each(3000, (p) => fetch("/__probe_text", { method: "POST", headers: { "content-type": "text/plain" }, body: p })),
        beacon: () => each(3000, async (p) => navigator.sendBeacon("/__probe_beacon", new Blob([p], { type: "text/plain" }))),
        queryOnAFile: () => each(3000, (p) => fetch(file + "?d=" + encodeURIComponent(p))),
        header: () => each(3000, (p) => fetch("/__probe_header", { headers: { "x-take": p } })),
        acceptOnAFile: () => each(3000, (p) => fetch(file, { headers: { accept: p } })),
        smallPiecesOnAFile: () => each(60, (p) => fetch(file, { headers: { accept: p } })),
        cookie: () =>
          each(3000, async (p) => {
            document.cookie = "t=" + p + "; path=/";
            await fetch(file);
          }).then(() => (document.cookie = "t=; max-age=0; path=/")),
        elsewhere: () =>
          // The one foreign host the page's CSP lets it connect to (others are refused before any request).
          each(3000, (p) => fetch("https://vocal-studio-entitlements.vocalstudio-pe.workers.dev/v1/voice", { method: "POST", body: p, mode: "no-cors" })),
        async websocket() {
          const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/__probe_ws");
          await new Promise((ok, no) => {
            ws.onopen = ok;
            ws.onerror = no;
          });
          for (const p of cut(3000)) ws.send(p);
          await new Promise((r) => setTimeout(r, 300));
          ws.close();
        }
      };
      await ways[how]();
      return s.length;
    },
    { how, file, min }
  );

test("your voice stays on your device: recording, saving, rating, a second take run to its end, three minutes on, leaving and two more visits send nothing the size of the take", async ({
  page
}) => {
  test.setTimeout(150000);
  const egress = await countEgress(page); // before the page loads: Playwright routes WebSockets from a script it injects
  await boot(page, { person: true });
  const sending = await page.evaluate(() => window.VTAnalytics.remoteState());
  expect(sending, "control: the app treats this visitor as a person, so its analytics send").toMatchObject({ sending: true });
  await openSingle(page, "v10-power-pause");
  await expect(page.locator("#chk-auto-record"), "control: this exercise records every take").toBeChecked();

  // Recorded, saved and rated (a send on the rating), then a singing take that runs to the end of its clock and is
  // saved too (a send on a natural end, on the singing track, on the second save), three minutes on (a send put
  // off with a timer), and the page hidden and left (a send on the way out). The first take is stopped at a size
  // a beacon or a keepalive request can carry.
  egress.reset();
  await start(page);
  const target = 4 * EGRESS_BUDGET + 4096;
  await expect.poll(() => page.evaluate(() => window.__vtTake.bytes), { timeout: 20000, intervals: [100] }).toBeGreaterThanOrEqual(target);
  await page.clock.fastForward(20000); // long enough on the clock to be rated (a take short of 15 s is not)
  await page.clock.runFor(500);
  await page.locator("#btn-practice-stop").click();
  await expect(page.locator("#btn-save-rec"), "control: there is a recording to send").toBeVisible();
  await page.locator("#btn-save-rec").click();
  await expect(page.locator("#btn-save-rec"), "control: the save finished").toBeDisabled();
  await rate(page);
  await openSingle(page, "s19-soft-palate-surprise");
  expect(await page.evaluate(() => window.VTApp.getState().exercise.track), "control: a singing exercise").toBe("singing");
  await expect(page.locator("#chk-auto-record"), "control: it records too").toBeChecked();
  await start(page);
  await page.clock.runFor(1500);
  const rest = await page.evaluate(() => (window.VTApp.getState().timer.endAt - performance.now()) / 1000);
  await page.clock.fastForward(Math.max(0, rest - 2) * 1000);
  await page.clock.runFor(3000);
  expect(await live(page), "control: the singing take ran to the end of its clock").toBe(false);
  await expect(page.locator("#btn-save-rec"), "control: and was recorded").toBeVisible();
  await page.locator("#btn-save-rec").click();
  await expect(page.locator("#btn-save-rec"), "control: the second save finished").toBeDisabled();
  // Three minutes on, in ten-second steps. One jump fires each timer once at most (an interval ticks once, and a
  // timer set during the jump waits past its end), so a send on an interval's later tick, or at the end of a
  // chain of timeouts, needs the steps: MK71 sends the takes on a minute interval's fourth tick, four minutes
  // after the page opens, which the single jump of 57a6f2c's version of this test never fired.
  for (let i = 0; i < 18; i++) await page.clock.fastForward(10000);
  await page.clock.runFor(2000);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  // A minute in the background before the page is left: the stability pass of the third red team sent the take
  // five seconds after the hide, which a reload straight after it never let fire.
  await page.clock.runFor(60000);
  await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
  const during = await egress.settle();

  // Left and come back, twice: the next visit and the third, a minute of each, where a take kept back from the
  // last one would go (the third red team sent the takes on a third visit, unseen by a test that came back once).
  const visits = [];
  for (let i = 0; i < 2; i++) {
    egress.reset();
    await page.reload({ waitUntil: "domcontentloaded" });
    await ready(page);
    await page.clock.runFor(60000);
    visits.push(await egress.settle());
  }

  const takes = await page.evaluate(async () =>
    Promise.all((await window.VTStorage.listRecordings()).map(async (r) => (await window.VTStorage.getRecordingBlob(r.id)).size))
  );
  const files = egress.known.size;
  const all = [during, ...visits];
  const sum = (k) => all.reduce((n, w) => n + w[k], 0);
  test.info().annotations.push({
    type: "egress",
    description: `takes ${takes.join(" and ")} B; ${all.map((w, i) => `${["during", "next visit", "third visit"][i]}: ${w.bytes} B in ${w.requests} requests and ${w.statics} of the page's ${files} files`).join("; ")}`
  });
  expect(takes.length, "both takes are kept on the device, on the third visit too").toBe(2);
  expect(Math.max(...takes), "control: the first take is at least four times the budget, so sending it would show").toBeGreaterThanOrEqual(4 * EGRESS_BUDGET);
  expect(sum("bytes"), `bytes sent: ${JSON.stringify(all.flatMap((w) => w.items))}`).toBeLessThan(EGRESS_BUDGET);
  expect(sum("requests"), "requests sent other than the page's own files").toBeLessThanOrEqual(REQUEST_BUDGET);
  // Every window's repeat fetches of the page's own files, the first one's too (the first version counted only
  // the next visit's, so a take could ride on hundreds of repeat fetches while it was being saved).
  expect(sum("statics"), "the page's own files fetched again: once a visit, and at most once more each").toBeLessThanOrEqual((visits.length + 1) * files);
  expect(all.at(-1).hidden, "no WebRTC connection or worker, which the network events cannot see").toEqual({ peers: 0, workers: 0 });

  // Controls: the same counter catches the saved take sent each way that slipped past a per-request size, type
  // or address rule, a worker, and a WebRTC connection in the page or in a frame made with no address. The
  // page's CSP refuses every other host before a request is made, so the cross-origin and WebSocket controls
  // use the ones it allows: those are where a leak could go.
  const file = new URL([...egress.known].find((u) => /\/js\/app\.js/.test(u))).pathname;
  for (const how of ["fetchText", "beacon", "queryOnAFile", "header", "acceptOnAFile", "smallPiecesOnAFile", "cookie", "elsewhere", "websocket"]) {
    egress.reset();
    const chars = await sendTake(page, how, file);
    const caught = await egress.settle();
    expect(
      couldCarry(caught, 2 * files),
      `control: the take sent by ${how} (${chars} characters) is caught: ${caught.bytes} B, ${caught.requests} requests, ${caught.statics} files`
    ).toBe(true);
  }
  await page.evaluate(() => {
    new RTCPeerConnection().close();
    const f = document.createElement("iframe");
    document.body.appendChild(f);
    new f.contentWindow.RTCPeerConnection().close();
    f.remove();
    new Worker(URL.createObjectURL(new Blob(["close()"], { type: "text/javascript" }))).terminate();
  });
  await expect
    .poll(() => ({ ...egress.hidden }), { message: "control: WebRTC connections, in a frame too, and a worker are counted" })
    .toEqual({ peers: 2, workers: 1 });
});

/* ------------------------------------------------------------------ no account needed */

/** Everything a guest has kept: every exercise's takes, the saved recordings, the days practised and the routine under way. */
const keptBy = (page) =>
  page.evaluate(async () => {
    const progress = window.VTStorage.getProgress() || {};
    const takes = Object.fromEntries(
      Object.entries(progress)
        .filter(([, row]) => row?.history?.length)
        .map(([id, row]) => [id, row.history.map((h) => ({ day: h.day, score: h.score ?? null }))])
        .sort(([a], [b]) => (a < b ? -1 : 1))
    );
    const s = window.VTSession.get();
    return {
      takes,
      recordings: (await window.VTStorage.listRecordings()).length,
      days: window.VTDays.summary().practiceDays,
      routine: s ? { status: s.status, index: s.index } : null
    };
  });

/** A restart: what the browser keeps on disk, without the session's cookies and storage, opened `days` after NOW. */
async function restart(browser, from, days) {
  const kept = await from.context().storageState({ indexedDB: true });
  kept.cookies = kept.cookies.filter((c) => c.expires > 0);
  const context = await browser.newContext({ storageState: kept, timezoneId: "America/Lima", locale: "es-PE" });
  const page = await context.newPage();
  await boot(page, { now: new Date(new Date(NOW).getTime() + days * DAY_MS).toISOString() });
  return { context, page };
}

test("no account needed: takes of two tracks, a rating, a saved recording, a routine half done and a second tab's take are there a minute later and after restarts a month on, where a new take is kept too", async ({
  page,
  browser
}) => {
  test.setTimeout(150000);
  await boot(page);
  await openSingle(page, "s4-lip-trills");
  await runOut(page);
  await rate(page);
  await runOut(page); // Start again: a second take, left unrated

  // A second tab, open from here on: its own take, saved later, must not write an old copy over this tab's.
  await page.evaluate(() => sessionStorage.setItem("vt_tab_mark", "1"));
  const second = await page.context().newPage();
  await boot(second);
  expect(await second.evaluate(() => sessionStorage.getItem("vt_tab_mark")), "control: the new tab shares no session storage").toBeNull();

  // The other track, with its recording saved and the take rated.
  await openSingle(page, "v4-articulation-pen");
  await expect(page.locator("#chk-auto-record"), "control: this exercise records").toBeChecked();
  await runOut(page);
  await expect(page.locator("#btn-save-rec"), "control: a recording to save").toBeVisible();
  await page.locator("#btn-save-rec").click();
  await page.clock.runFor(300);
  // A promise, not a control: the fifth red team asked a guest to sign in (the app's second sign-in, VTAuth) in
  // place of saving, which the scanner's account words did not cover.
  await expect(page.locator("#btn-save-rec"), "the recording is saved").toBeDisabled();
  await nothingInTheWay(page, "saving a recording");
  await rate(page);

  // Today's basics, one step of two done.
  await page.locator("#btn-back-home").click();
  await page.clock.runFor(400);
  await page.locator("#btn-next-step").click();
  await page.clock.runFor(400);
  const step1 = (await stepNow(page)).id;
  await runOut(page, 35);
  await page.locator("#btn-step-done-next").click();
  await page.clock.runFor(400);

  // The second tab's take, written after all of the above.
  await second.evaluate(() => window.VTApp.openExercise("v1-diction"));
  await second.clock.runFor(300);
  await runOut(second);
  await rate(second);

  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  const mine = await keptBy(page);
  expect(Object.keys(mine.takes), "every exercise's takes, the routine's and the second tab's too").toEqual(
    [...new Set(["s4-lip-trills", step1, "v1-diction", "v4-articulation-pen"])].sort()
  );
  expect(mine.takes["s4-lip-trills"].length, "two takes of the first exercise (and the routine's, if it is the same)").toBe(step1 === "s4-lip-trills" ? 3 : 2);
  // Newest first: the first take, the rated one, is the last.
  expect(mine.takes["s4-lip-trills"].at(-1).score, "the first take kept with its rating").not.toBeNull();
  expect(mine.recordings, "the saved recording").toBe(1);
  expect(mine.days, "the day practised").toBe(1);
  expect(mine.routine, "the routine, on its second step").toEqual({ status: "active", index: 1 });

  await second.clock.runFor(65000);
  expect(await keptBy(second), "all of it, in the other tab a minute later").toEqual(mine);
  await second.locator("#btn-history").click();
  await expect(second.locator('#history-list [data-open-ex="s4-lip-trills"]').first(), "in Historial").toBeVisible();
  await nothingInTheWay(second, "Historial in the other tab");

  const first = await restart(browser, page, 31);
  try {
    const third = first.page;
    await nothingInTheWay(third, "a month on, as the page opens");
    // Read a minute after it opens: a prune put off by a timer (the stability pass of the third red team) would be done.
    await third.clock.runFor(60000);
    expect(await keptBy(third), "all of it, a minute after a restart a month on").toEqual(mine);
    await third.locator("#btn-history").click();
    await third.clock.runFor(300);
    await nothingInTheWay(third, "Historial a month on");
    await expect(third.locator("#hist-days-count strong"), "the days practised, in Historial's calendar").toHaveText("1");
    await expect(third.locator("[data-play]"), "the recording, to play").toHaveCount(1);
    // And it plays for a guest a month on, with no sign-in in its way (the fifth red team's play gate, MK86).
    await third.locator("[data-play]").click();
    await third.clock.runFor(300);
    await expect(third.locator("#history-player audio"), "the saved recording plays a month on").toHaveCount(1);
    expect(await third.locator("#history-player audio").getAttribute("src"), "control: from the recording kept on the device").toMatch(/^blob:/);
    await nothingInTheWay(third, "playing the recording a month on");
    await third.locator('#history-list [data-open-ex="s4-lip-trills"]').first().click();
    await third.clock.runFor(300);
    await runOut(third);
    await nothingInTheWay(third, "a take a month on");
    await rate(third);
    const later = await keptBy(third);
    expect(later.takes["s4-lip-trills"].length, "the take a month on is kept with the others").toBe(mine.takes["s4-lip-trills"].length + 1);
    const others = (takes) => Object.fromEntries(Object.entries(takes).filter(([id]) => id !== "s4-lip-trills"));
    expect(others(later.takes), "the other exercises' takes, untouched").toEqual(others(mine.takes));

    const again = await restart(browser, third, 32);
    try {
      await again.page.clock.runFor(60000);
      expect((await keptBy(again.page)).takes, "and still there a minute after another restart").toEqual(later.takes);
    } finally {
      await again.context.close();
    }
  } finally {
    await first.context.close();
  }
});

/** A take of `sec` seconds (its length is not what these test) that hears at its start and runs to its end. */
async function shortTake(page, label, sec = 50) {
  await page.evaluate((n) => (window.VTApp.getState().timer.remaining = n), sec);
  await start(page, label);
  await hears(page, label);
  await page.clock.fastForward((sec - 5) * 1000);
  await page.clock.runFor(5600);
  expect(await live(page), `control: ${label}: it ran to its end`).toBe(false);
  await nothingInTheWay(page, label);
}

/** Every take kept today in the history that carries a rating. */
const ratedToday = (page) =>
  page.evaluate(() => {
    const day = window.VTDays.dayKey();
    return Object.values(window.VTStorage.getProgress() || {}).reduce((n, row) => n + (row.history || []).filter((h) => h.day === day && h.score != null).length, 0);
  });

test("no account needed: a guest past an hour today who has already rated eleven takes today rates another, and it is kept", async ({ page }) => {
  test.setTimeout(60000);
  const today = dayOf(NOW);
  await boot(page, { days: { [today]: { sec: 3720, n: 24, ex: ["s4-lip-trills"] } } });
  await hourInBothRecords(page, { n: 11, score: 7 });
  await aFreeGuest(page);
  expect(await ratedToday(page), "control: eleven takes rated today already").toBe(11);
  await openSingle(page, "s7-humming");
  expect(await page.evaluate(() => window.VTStorage.getProgress()["s7-humming"] ?? null), "control: an exercise with no take kept yet").toBeNull();
  await shortTake(page, "a take after eleven rated today");
  await page.locator('.rate-btn[data-feel="ok"]').click();
  await expect(page.locator("#score-result"), "the twelfth rating of the day is taken").toBeVisible();
  await nothingInTheWay(page, "the twelfth rating");
  await page.clock.runFor(1000);
  const kept = await page.evaluate(() => window.VTStorage.getProgress()["s7-humming"]?.history?.[0]?.score ?? null);
  expect(kept, "the rating is kept with the take").not.toBeNull();
  expect(await ratedToday(page), "twelve takes rated today").toBe(12);
  await page.locator("#btn-history").click();
  await page.clock.runFor(300);
  const row = page.locator('#history-list [data-open-ex="s7-humming"]').first();
  await expect(row, "Historial shows the rating").toContainText(`Último puntaje: ${Number(kept).toLocaleString("es-PE", { maximumFractionDigits: 1 })}/10`);
  await nothingInTheWay(page, "Historial after the twelfth rating");
});

/** The saved takes, newest first, with their sizes. */
const savedTakes = (page) => page.evaluate(async () => (await window.VTStorage.listRecordings()).map((r) => ({ id: r.id, size: r.size })));

/**
 * One take of a recording exercise, saved: the save takes, the take is listed in Historial with the others, and it
 * plays there, the player holding that take's own audio.
 */
async function saveAndPlay(page, label, count) {
  await openSingle(page, "v4-articulation-pen");
  await expect(page.locator("#chk-auto-record"), `control: ${label}: this exercise records`).toBeChecked();
  await shortTake(page, label);
  await expect(page.locator("#btn-save-rec"), `control: ${label}: a recording to save`).toBeVisible();
  await page.locator("#btn-save-rec").click();
  await page.clock.runFor(300);
  await expect(page.locator("#btn-save-rec"), `${label}: it is saved`).toBeDisabled();
  await nothingInTheWay(page, `${label}: saving it`);
  const takes = await savedTakes(page);
  expect(takes.length, `${label}: kept with the others`).toBe(count);
  const newest = takes[0];
  expect(newest.size, `control: ${label}: the newest is the take just made, not one of the five stand-ins`).toBeGreaterThan(SEEDED_TAKE_BYTES);
  await rate(page);
  await page.locator("#btn-history").click();
  await page.clock.runFor(300);
  await expect(page.locator("#history-list [data-play]"), `${label}: listed in Historial with the others`).toHaveCount(count);
  // The size of what each blob address the page makes holds, so the player's audio can be told to be this take.
  await page.evaluate(() => {
    if (window.__vtBlobSizes) return;
    window.__vtBlobSizes = {};
    const make = URL.createObjectURL;
    URL.createObjectURL = function (obj) {
      const url = make.call(URL, obj);
      window.__vtBlobSizes[url] = obj?.size;
      return url;
    };
  });
  await page.locator(`#history-list [data-play="${newest.id}"]`).click();
  await page.clock.runFor(300);
  await expect(page.locator("#history-player audio"), `${label}: a player opens`).toHaveCount(1);
  await nothingInTheWay(page, `${label}: playing it`);
  const player = () =>
    page.evaluate(() => {
      const a = document.querySelector("#history-player audio");
      return { size: window.__vtBlobSizes[a.src] ?? null, loaded: a.readyState >= 2, error: a.error?.code ?? null };
    });
  await expect.poll(player, { message: `${label}: it plays: the player holds that take's audio and loads it`, timeout: 10000 }).toEqual({
    size: newest.size,
    loaded: true,
    error: null
  });
}

/** The size of each of the five takes a guest has saved before the test, small enough to tell from a real take. */
const SEEDED_TAKE_BYTES = 2048;

test("no account needed: a guest past an hour today with five recordings saved saves a sixth and a seventh, and each is listed and plays", async ({ page }) => {
  test.setTimeout(60000);
  const today = dayOf(NOW);
  await boot(page, { days: { [today]: { sec: 3720, n: 24, ex: ["s4-lip-trills"] } } });
  await hourInBothRecords(page);
  await aFreeGuest(page);
  await page.evaluate(async (bytes) => {
    for (let i = 0; i < 5; i++) {
      await window.VTStorage.saveRecording({ exerciseId: "v1-diction", blob: new Blob([new Uint8Array(bytes)], { type: "audio/webm" }), label: "take " + i, meta: { durationMs: 1000 } });
    }
  }, SEEDED_TAKE_BYTES);
  expect((await savedTakes(page)).length, "control: five recordings saved already").toBe(5);
  await saveAndPlay(page, "the sixth recording", 6);
  await saveAndPlay(page, "the seventh recording", 7);
});

/* ------------------------------------------------------------------ no ad during practice */

/** Every form an ad takes in js/ads.js, wherever it is drawn, shown or not: a slot holding anything counts. */
const AD_FORMS = [
  ".ad-native-card",
  ".ad-preview-card",
  "ins.adsbygoogle",
  "iframe[src*='googlesyndication']",
  "iframe[src*='doubleclick']",
  "iframe[id^='aswift']",
  "[data-ad-cta]",
  "[data-ad-preview-cta]",
  ".ad-slot--native",
  ".ad-slot--adsense",
  ".ad-slot--preview",
  "[id^='ad-slot-']:not(:empty)"
].join(", ");

/** What ad forms are on the page now, by tag and first class. */
const adsDrawn = (page) =>
  page.evaluate(
    (sel) => [...document.querySelectorAll(sel)].map((el) => el.tagName.toLowerCase() + "." + String(el.className || el.id).split(" ")[0]),
    AD_FORMS
  );

/**
 * Every ad drawn from now on, even one taken away in the same moment: a MutationObserver sees each node and
 * class added, so an ad drawn and cleared before a check runs is still seen. Each sighting is filed under the
 * moment the test last named with `moment(page, name)`.
 */
async function watchAds(page) {
  await page.evaluate((sel) => {
    window.__vtMoment = "start";
    window.__vtAdsSeen = [];
    const seen = (el) => el.nodeType === 1 && (el.matches(sel) || el.querySelector(sel));
    new MutationObserver((records) => {
      for (const r of records) {
        const hits = r.type === "attributes" ? [r.target] : [...r.addedNodes];
        for (const el of hits) {
          // Labelled by the routine's own state as well as the test's moment: the end-of-task card comes 700 ms
          // after the last rating, and a runner that stalled that long before moment() ran would have put it in
          // the routine (the stability pass of the third red team).
          const over = window.VTSession?.get?.()?.status === "completed";
          if (seen(el)) window.__vtAdsSeen.push((over ? "after the routine" : window.__vtMoment) + ": " + (el.id || el.className || el.tagName));
        }
      }
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  }, AD_FORMS);
}
const moment = (page, name) => page.evaluate((n) => (window.__vtMoment = n), name);
const adsSeen = (page) => page.evaluate(() => window.__vtAdsSeen.slice());

/**
 * Ads on, in `mode`, with an AdSense client and units configured and nothing throttled. Google's script is
 * refused by the page's CSP (docs/40, step 9), so the AdSense form is drawn with no request leaving the machine;
 * the checks are on what is drawn.
 */
async function adsOn(page, mode) {
  await page.evaluate((mode) => {
    const c = window.VT_ADS_CONFIG;
    c.adsEnabled = true;
    c.mode = mode;
    c.adsense = { client: "ca-pub-0000000000000000", slots: { home: "1111111111", history: "2222222222" } };
    localStorage.removeItem("vt_ads_last_post_v1");
    localStorage.removeItem("vt_ads_last_home_v1");
  }, mode);
}

const MODES = ["preview", "native", "adsense", "hybrid"];

/**
 * Every way js/ads.js can be asked to draw, in each mode, that draws something once practice is over: each is
 * checked during practice and, as its control, after it. The native mode has no card for the home slot (both
 * cards that name it have no link yet, js/ads.js pickNativeCard), and refreshAllSafe draws only on the home
 * page, so those pairs could not show a leak in the exercise view and are left out there.
 */
const ENTRY_POINTS = ["onPostSession", "renderSlot:home", "renderSlot:history", "renderSlot:post-session", "refreshAllSafe"];
const drawsHere = (mode, entry, onHome) => !(mode === "native" && entry === "renderSlot:home") && (onHome || entry !== "refreshAllSafe");

/** Call every entry point that can draw here, in every mode, with nothing throttled; `after` runs after each. */
async function callEveryEntry(page, onHome, after = null) {
  for (const mode of MODES) {
    for (const entry of ENTRY_POINTS.filter((e) => drawsHere(mode, e, onHome))) {
      await adsOn(page, mode);
      await page.evaluate((entry) => {
        const [fn, slot] = entry.split(":");
        window.VTAds[fn](slot);
      }, entry);
      if (after) await after(mode, entry);
    }
  }
}

for (const mode of MODES) {
  test(`no ad during practice: none at any moment of a guided routine, wherever the visitor goes (${mode} mode)`, async ({ page }) => {
    test.setTimeout(60000);
    await boot(page);
    await adsOn(page, mode);
    await page.locator("#btn-next-step").click();
    await page.clock.runFor(400);
    await watchAds(page);

    await moment(page, "step 1");
    await runOut(page, 35);
    await moment(page, "step 1 done");
    await expect(page.locator("#btn-step-done-rate")).toBeVisible();
    await page.clock.runFor(1500);
    await page.locator("#btn-step-done-rate").click();
    await rate(page);
    await moment(page, "between the steps");
    await page.clock.runFor(1500);
    await expect(page.locator("#ps-routine-next"), "control: the routine goes on").toBeVisible();
    await callEveryEntry(page, false);
    await moment(page, "Historial, mid-routine");
    await page.locator("#btn-history").click();
    await page.clock.runFor(61000);
    await callEveryEntry(page, false);
    await moment(page, "home, mid-routine");
    await page.locator("#btn-nav-home").click();
    await page.clock.runFor(61000);
    await adsOn(page, mode);
    await page.locator("#btn-history").click();
    await page.locator("#btn-nav-home").click();
    await callEveryEntry(page, true);
    expect(await page.evaluate(() => window.VTSession.get().status), "control: the routine is still under way").toBe("active");

    await moment(page, "step 2");
    await adsOn(page, mode);
    await page.locator("#btn-next-step").click();
    await page.clock.runFor(400);
    await runOut(page, 35);
    await page.locator("#btn-step-done-rate").click();
    await page.locator('.rate-btn[data-feel="ok"]').click();
    await moment(page, "after the routine");
    await page.clock.runFor(1500);

    const seen = await adsSeen(page);
    expect(
      seen.filter((s) => !s.startsWith("after the routine")),
      "no ad of any form at any moment of the routine"
    ).toEqual([]);
    expect(await page.evaluate(() => window.VTSession.get()?.status), "control: the routine is over").toBe("completed");
    expect(
      seen.filter((s) => s.startsWith("after the routine")).length,
      "control: the end-of-task card once the routine is over, which the watch sees"
    ).toBeGreaterThan(0);
  });
}

test("no ad during practice: a routine paused and its step taken anyway, or paused and continued, is practice again; a paused one is not", async ({
  page
}) => {
  test.setTimeout(90000);
  await boot(page);
  await adsOn(page, "preview");
  await page.locator("#btn-next-step").click();
  await page.clock.runFor(400);
  await watchAds(page);
  const status = () => page.evaluate(() => window.VTSession.get()?.status);

  // Paused from the banner, then the step's own Start pressed anyway, run out, and Next: the third red team found
  // the routine went on to its second step still paused, and Historial drew its ad there.
  await page.locator("#btn-session-pause").click();
  await page.clock.runFor(300);
  expect(await status(), "control: paused").toBe("paused");
  await moment(page, "a paused routine's step taken anyway");
  await runOut(page, 35);
  await expect(page.locator("#btn-step-done-next")).toBeVisible();
  await page.locator("#btn-step-done-next").click();
  await page.clock.runFor(400);
  // The routine's state goes in the label, so a red says whether it was left paused; the promise is judged on the ads.
  await moment(page, `Historial, on the second step (routine ${await status()})`);
  await page.locator("#btn-history").click();
  await page.clock.runFor(61000);
  await adsOn(page, "preview");
  await page.evaluate(() => window.VTAds.renderSlot("history"));

  // Paused again, and continued from home's Continuar: that is the visitor taking the routine up again.
  await page.locator("#btn-nav-home").click();
  await page.clock.runFor(300);
  await page.evaluate(() => window.VTSession.pause());
  await page.locator("#btn-next-step").click();
  await page.clock.runFor(400);
  await moment(page, `Historial, after Continuar (routine ${await status()})`);
  await page.locator("#btn-history").click();
  await page.clock.runFor(61000);
  await adsOn(page, "preview");
  await page.evaluate(() => window.VTAds.renderSlot("history"));
  expect(await adsSeen(page), "no ad of any form while the routine was being practised").toEqual([]);

  // Control: a routine left paused is not practice, so the same Historial draws its ad.
  await page.evaluate(() => window.VTSession.pause());
  await moment(page, "paused, Historial");
  await adsOn(page, "preview");
  await page.evaluate(() => window.VTAds.renderSlot("history"));
  expect((await adsSeen(page)).filter((s) => s.startsWith("paused, Historial")).length, "control: the ad a paused routine allows").toBeGreaterThan(0);
});

test("no ad during practice: none while a take starts or is live, from any entry point in any mode; each draws one after", async ({ page }) => {
  test.setTimeout(60000);
  await boot(page, { holdMic: true });
  await openSingle(page, "v1-diction");
  await watchAds(page);
  await page.evaluate(() => (window.VTApp.getState().timer.remaining = 50));
  await moment(page, "starting");
  await page.locator("#btn-practice-start").click();
  await expect
    .poll(() => page.evaluate(() => !!window.VTApp.getState().practiceStarting), { message: "control: the take is starting, the microphone not yet answered" })
    .toBe(true);
  await callEveryEntry(page, false);
  await moment(page, "live");
  await page.evaluate(() => window.__vtReleaseMic());
  await expect.poll(() => live(page), { timeout: 10000 }).toBe(true);
  await callEveryEntry(page, false);
  expect(await live(page), "control: the take was live for every check above").toBe(true);
  expect(await adsSeen(page), "no ad of any form while the take started or was live").toEqual([]);

  // Controls: each pair above draws an ad once the single exercise is over.
  await page.clock.fastForward(45 * 1000);
  await page.clock.runFor(5600);
  await rate(page);
  const drew = [];
  await callEveryEntry(page, false, async (mode, entry) => {
    if ((await adsDrawn(page)).length) drew.push(`${mode} ${entry}`);
    await page.evaluate(() => ["home", "history", "post-session"].forEach((s) => window.VTAds.clearSlot(document.getElementById("ad-slot-" + s))));
    if ((await adsDrawn(page)).length) drew.push("a cleared slot still counted");
  });
  const pairs = MODES.flatMap((m) => ENTRY_POINTS.filter((e) => drawsHere(m, e, false)).map((e) => `${m} ${e}`));
  expect(drew, "control: every pair checked above draws an ad once practice is over").toEqual(pairs);
});

test("no ad during practice: the end-of-task card goes when Start again starts a take and when a routine starts", async ({ page }) => {
  await boot(page);
  await openSingle(page, "s4-lip-trills");
  await adsOn(page, "preview");
  await runOut(page);
  await rate(page);
  expect(await adsDrawn(page), "control: the card after a single exercise").toContain("div.ad-native-card");
  await page.evaluate(() => {
    window.VTApp.getState().timer.remaining = 50;
    window.__vtHoldMic = true;
  });
  // Start again, the microphone's answer held back: the card goes when Start is pressed, not when the take is live.
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => !!window.VTApp.getState().practiceStarting), { message: "control: the take is starting" }).toBe(true);
  expect(await adsDrawn(page), "no card while the next take starts").toEqual([]);
  await page.evaluate(() => window.__vtReleaseMic());
  await expect.poll(() => live(page), { timeout: 10000 }).toBe(true);
  expect(await adsDrawn(page), "no card while the next take is live").toEqual([]);
  await page.clock.fastForward(45 * 1000);
  await page.clock.runFor(5600);
  await adsOn(page, "preview");
  await rate(page);
  expect(await adsDrawn(page), "control: the card after the second take").toContain("div.ad-native-card");

  // From there into a routine, through the home page, where an ad may be drawn (no routine is under way yet).
  await page.locator("#btn-back-home").click();
  await page.clock.runFor(400);
  await page.locator("#btn-next-step").click();
  await page.clock.runFor(400);
  expect(await page.evaluate(() => window.VTSession.get()?.status), "control: a routine is under way").toBe("active");
  expect(await adsDrawn(page), "no card left over from the single exercise in the routine's first step").toEqual([]);
});
