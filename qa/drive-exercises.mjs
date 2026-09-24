/**
 * Drive every exercise with a synthetic voice and capture what a learner sees.
 *
 * For each exercise and viewport: open it, press Start, play the scenario that
 * fits its practice mode (qa/synthetic-voice.js), take viewport screenshots at
 * three moments, press Stop, take one more, and record where the exercise's
 * own visual sits relative to the first screen.
 *
 * Usage:
 *   python3 -m http.server 8765 &
 *   CHROME_PATH=/opt/pw-browsers/chromium OUT=/tmp/drive node qa/drive-exercises.mjs
 * Env:
 *   IDS=s4-lip-trills,s5-sirens   only these exercises
 *   VIEWPORTS=desktop,phone,land  subset of viewports
 *   SECS=9                        seconds of practice per run
 *   SLOPPY=1                      also run the "sloppy" variant for pitch modes
 *   CONC=4                        concurrent pages
 *   LANG=es|en
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const OUT = process.env.OUT || path.join(HERE, "screenshots", "drive");
const SECS = Number(process.env.SECS || 9);
const CONC = Number(process.env.CONC || 4);
const LANG = process.env.LANG_UI || process.env.LANG_APP || (process.env.LANG === "en" ? "en" : "es");
// The synthetic voice plus any extra scenarios in qa/voices/*.js
const VOICES_DIR = path.join(HERE, "voices");
const VOICE_SRC = [
  fs.readFileSync(path.join(HERE, "synthetic-voice.js"), "utf8"),
  ...(fs.existsSync(VOICES_DIR)
    ? fs.readdirSync(VOICES_DIR).filter((f) => f.endsWith(".js")).sort().map((f) => fs.readFileSync(path.join(VOICES_DIR, f), "utf8"))
    : [])
].join("\n;\n");

const VIEWPORTS = {
  desktop: { width: 1280, height: 720 },
  phone: { width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
  land: { width: 844, height: 390, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
};

/** Which synthetic performance fits each practice mode. */
export const SCENARIO_BY_MODE = {
  rateLadder: "speech",
  volumeSteady: "count",
  countPace: "count",
  articulationContrast: "speech",
  recordOnly: "speech",
  speechEnergy: "speech",
  reviewSession: "speech",
  metronomeSpeech: "speech",
  weekPlan: "silent",
  pauseDetect: "speech",
  fillerDetect: "speechFillers",
  pitchContour: "speech",
  volumeLadder: "ladder",
  keyPointPace: "speech",
  gestureReps: "speech",
  facePhases: "speech",
  concisionGate: "speech",
  storyTimer: "speech",
  authorityLand: "speech",
  energyMatch: "ladder",
  pitchHold: "follow",
  pitchChord: "follow",
  pitchSong: "follow",
  shAirLadder: "air",
  scaleSteps: "follow",
  releaseFlow: "silent",
  breathCycle: "breath",
  openSpace: "follow",
  vowelLadder: "vowels",
  resonanceZone: "zones",
  placementAB: "abTakes",
  trillSolfege: "trill",
  sovtFlow: "trill",
  sirenRange: "siren",
  humTargets: "follow",
  breathS: "air",
  pitchMatch: "follow",
  dynamicSwell: "swell",
  onsetReps: "onset",
  staccatoLegato: "staccato"
};
const SLOPPY_OK = new Set(["follow", "trill"]);

function scenarioFor(ex) {
  // SCENARIO=name runs every exercise with that voice (e.g. a new failure case)
  if (process.env.SCENARIO) return process.env.SCENARIO;
  if (ex.id === "s6-straw") return "straw";
  return SCENARIO_BY_MODE[ex.mode] || "speech";
}

async function probe(page) {
  return page.evaluate(() => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const box = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const visible = !el.hidden && cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0;
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        left: Math.round(r.left),
        right: Math.round(r.right),
        h: Math.round(r.height),
        visible,
        inFirstScreen: visible && r.top < vh && r.bottom > 0,
        fullyInScreen: visible && r.top >= 0 && r.bottom <= vh + 1
      };
    };
    const panel = document.querySelector("#mode-focus .mode-panel, #mode-hud .mode-panel");
    const st = window.VTApp?.getState?.();
    return {
      vw,
      vh,
      scrollY: Math.round(window.scrollY),
      stage: box("#highway-stage"),
      pitchBlock: box("#pitch-block"),
      modePanel: panel
        ? { ...box(panel.parentElement.id === "mode-focus" ? "#mode-focus .mode-panel" : "#mode-hud .mode-panel"), host: panel.parentElement.id }
        : null,
      stageGuide: box("#stage-guide"),
      cue: box("#mode-cue"),
      start: box("#btn-practice-start"),
      stopBtn: box("#btn-practice-stop"),
      panelText: panel ? panel.innerText.replace(/\s+/g, " ").trim().slice(0, 600) : "",
      cueText: document.querySelector("#mode-cue")?.innerText?.trim()?.slice(0, 300) || "",
      status: document.querySelector("#practice-status")?.innerText || "",
      target: st?.practice?.targetFreq || null,
      pitchStats: document.querySelector("#pitch-stats")?.innerText?.replace(/\s+/g, " ").slice(0, 200) || "",
      hudTr: document.querySelector("#pitch-game-hud")?.innerText?.replace(/\s+/g, " ").slice(0, 160) || ""
    };
  });
}

async function runOne(browser, ex, vpName, variant) {
  const vp = VIEWPORTS[vpName];
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor || 1,
    isMobile: !!vp.isMobile,
    hasTouch: !!vp.hasTouch
  });
  await ctx.grantPermissions(["microphone"]).catch(() => {});
  await ctx.addInitScript((lang) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", lang);
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
  }, LANG);
  await ctx.addInitScript({ content: VOICE_SRC });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(m.text().slice(0, 300));
  });
  const dir = path.join(OUT, vpName, ex.id + (variant ? "-" + variant : ""));
  fs.mkdirSync(dir, { recursive: true });
  const rec = { id: ex.id, mode: ex.mode, viewport: vpName, scenario: variant || scenarioFor(ex), shots: [], probes: {}, errors };
  try {
    await page.goto(BASE + "/?e2e&t=" + Date.now(), { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTApp?.openExercise, null, { timeout: 15000 });
    await page.evaluate((id) => window.VTApp.openExercise(id), ex.id);
    await page.waitForSelector("#view-exercise.active", { timeout: 10000 });
    await page.waitForTimeout(700);
    rec.probes.open = await probe(page);
    await page.screenshot({ path: path.join(dir, "0-open.png") });
    rec.shots.push("0-open.png");
    const start = page.locator("#btn-practice-start");
    if (await start.isVisible().catch(() => false)) {
      await start.click({ timeout: 5000 }).catch(async () => {
        await page.evaluate(() => document.getElementById("btn-practice-start")?.click());
      });
    } else {
      await page.evaluate(() => document.getElementById("btn-practice-start")?.click());
    }
    await page.waitForTimeout(250);
    await page.evaluate((s) => window.__VTVoice?.play(s), rec.scenario);
    const marks = [2, Math.round(SECS / 2) + 0.5, SECS];
    let t = 0;
    for (const [i, m] of marks.entries()) {
      await page.waitForTimeout((m - t) * 1000);
      t = m;
      const name = `${i + 1}-live-${m}s.png`;
      await page.screenshot({ path: path.join(dir, name) });
      rec.shots.push(name);
      rec.probes[`live${i + 1}`] = await probe(page);
    }
    await page.evaluate(() => window.__VTVoice?.stop());
    const stopBtn = page.locator("#btn-practice-stop");
    if (await stopBtn.isVisible().catch(() => false)) {
      await stopBtn.click({ timeout: 4000 }).catch(() => page.evaluate(() => document.getElementById("btn-practice-stop")?.click()));
    } else {
      await page.evaluate(() => document.getElementById("btn-practice-stop")?.click());
    }
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(dir, "9-stopped.png") });
    rec.shots.push("9-stopped.png");
    rec.probes.stopped = await probe(page);
    rec.toast = await page.evaluate(() => [...document.querySelectorAll(".toast, #toast, [role=status]")].map((n) => n.innerText.trim()).filter(Boolean).join(" | ").slice(0, 400));
  } catch (e) {
    rec.failure = String(e.message || e).slice(0, 500);
  }
  await ctx.close();
  return rec;
}

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"]
  });
  // Read the catalog from the page so modes match what ships.
  const p0 = await browser.newPage();
  await p0.goto(BASE + "/?e2e", { waitUntil: "domcontentloaded" });
  await p0.waitForFunction(() => !!window.VT_EXERCISES && !!window.VTApp);
  const all = await p0.evaluate(() =>
    Object.values(window.VT_EXERCISES)
      .flat()
      .map((e) => ({ id: e.id, track: e.track, title: e.title, mode: (e.practice || {}).mode, showPitch: !!(e.practice || {}).showPitch }))
  );
  await p0.close();
  const ids = process.env.IDS ? new Set(process.env.IDS.split(",")) : null;
  const list = all.filter((e) => !ids || ids.has(e.id));
  const vps = (process.env.VIEWPORTS || "desktop,phone,land").split(",");
  const jobs = [];
  for (const ex of list)
    for (const vp of vps) {
      jobs.push([ex, vp, null]);
      if (process.env.SLOPPY === "1" && vp === "desktop" && SLOPPY_OK.has(scenarioFor(ex))) jobs.push([ex, vp, "followSloppy"]);
    }
  fs.mkdirSync(OUT, { recursive: true });
  const results = [];
  let next = 0;
  async function worker() {
    while (next < jobs.length) {
      const [ex, vp, variant] = jobs[next++];
      const r = await runOne(browser, ex, vp, variant);
      results.push(r);
      console.log(`${results.length}/${jobs.length} ${vp} ${ex.id}${variant ? " (" + variant + ")" : ""}${r.failure ? " FAIL " + r.failure : ""}${r.errors.length ? " errors:" + r.errors.length : ""}`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  await browser.close();
  results.sort((a, b) => (a.id + a.viewport).localeCompare(b.id + b.viewport));
  fs.writeFileSync(path.join(OUT, "report.json"), JSON.stringify({ base: BASE, secs: SECS, lang: LANG, catalog: all, results }, null, 2));
  console.log("wrote", path.join(OUT, "report.json"));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
