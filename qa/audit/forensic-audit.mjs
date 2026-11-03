/**
 * Forensic audit: every screen and every exercise, six iterations each.
 *
 * For each exercise it records a Z-order inventory of what is on screen
 * (qa/audit/page-probes.js), overlaps and clipped text, the keyboard focus
 * path, and six runs that each vary one dimension:
 *   1 default        mouse Start, the mode's synthetic voice, mouse Stop
 *   2 keyboard       Tab to Start + Enter, Space, Escape/Enter to stop
 *   3 boundary       a silent microphone, then pink noise: nothing may count
 *   4 interruption   double Start, Back mid-take (leave prompt), tab hidden
 *   5 phone          360×780 touch, the default run
 *   6 replay         run, Back, reopen: the second open starts clean
 * Each run keeps a tick timeline (every 500 ms) of the state a learner sees,
 * console errors, analytics events and getUserMedia calls.
 *
 *   BASE_URL=https://pillb.github.io/vocal-singing-training/ \
 *   OUT=/tmp/audit node qa/audit/forensic-audit.mjs
 * Env: IDS=a,b  ITER=1,3  SECS=8  CONC=4  CHROME_PATH=…
 * Do not edit the served files while it runs: it reads whatever is on disk, and
 * a stylesheet changed mid-run put six Tab stops in the ledger that the final
 * build does not have.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SCENARIO_BY_MODE } from "../drive-exercises.mjs";
import envNoise from "../env-noise.cjs";

const { errorLine } = envNoise;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const QA = path.join(HERE, "..");
const BASE = (process.env.BASE_URL || "http://127.0.0.1:8765").replace(/\/$/, "");
/** Whether the page under test is served from this machine (the worker refuses such an origin; a deployed page it must not refuse). */
const LOCAL = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::|\/|$)/.test(BASE);
const OUT = process.env.OUT || path.join(QA, "geometry", "audit");
const SECS = Number(process.env.SECS || 8);
const CONC = Number(process.env.CONC || 4);
const ITERS = (process.env.ITER || "1,2,3,4,5,6").split(",").map(Number);

const VOICE_SRC = [
  fs.readFileSync(path.join(QA, "synthetic-voice.js"), "utf8"),
  ...fs
    .readdirSync(path.join(QA, "voices"))
    .filter((f) => f.endsWith(".js"))
    .sort()
    .map((f) => fs.readFileSync(path.join(QA, "voices", f), "utf8")),
  // Boundary run: steady unpitched air, the room noise no exercise may count
  'window.__VTVoice && window.__VTVoice.define("noise", (h) => h.airOn(0.12, 0.3));'
].join("\n;\n");
const PROBES_SRC = fs.readFileSync(path.join(HERE, "page-probes.js"), "utf8");

// Counts getUserMedia calls and live tracks, and copies analytics events.
const HOOKS_SRC = `(() => {
  window.__gum = { calls: 0, live: 0 };
  const md = navigator.mediaDevices;
  if (md && md.getUserMedia) {
    const orig = md.getUserMedia.bind(md);
    md.getUserMedia = async (c) => {
      window.__gum.calls++;
      const s = await orig(c);
      s.getTracks().forEach((t) => { window.__gum.live++; t.addEventListener("ended", () => window.__gum.live--);
        const stop = t.stop.bind(t); t.stop = () => { if (t.readyState !== "ended") window.__gum.live--; stop(); }; });
      return s;
    };
  }
})();`;

const PHONE = { width: 360, height: 780, isMobile: true, hasTouch: true, deviceScaleFactor: 2 };
const DESKTOP = { width: 1280, height: 800 };

function scenarioFor(ex) {
  if (ex.id === "s6-straw") return "straw";
  return SCENARIO_BY_MODE[ex.mode] || "speech";
}

async function newPage(browser, vp, lang) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor || 1,
    isMobile: !!vp.isMobile,
    hasTouch: !!vp.hasTouch,
    ignoreHTTPSErrors: true
  });
  await ctx.grantPermissions(["microphone"]).catch(() => {});
  await ctx.addInitScript((l) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", l);
    } catch {
      /* private mode */
    }
  }, lang);
  await ctx.addInitScript({ content: VOICE_SRC });
  await ctx.addInitScript({ content: HOOKS_SRC });
  await ctx.addInitScript({ content: PROBES_SRC });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push("pageerror: " + String(e.message || e).slice(0, 240)));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push("console: " + errorLine(m.text().slice(0, 240), m.location()?.url));
  });
  return { ctx, page, errors };
}

async function openEx(page, id) {
  await page.goto(BASE + "/?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise, null, { timeout: 20000 });
  await page.evaluate((x) => window.VTApp.openExercise(x), id);
  await page.waitForSelector("#view-exercise.active", { timeout: 10000 });
  await page.waitForTimeout(600);
}

const snap = (page) => page.evaluate(() => window.__audit.snapshot());
const events = (page) => page.evaluate(() => (window.VTAnalytics?.summary?.().recent || []).map((e) => e.name));
const gum = (page) => page.evaluate(() => ({ ...window.__gum }));
const isLive = (page) => page.evaluate(() => !document.getElementById("btn-practice-stop")?.hidden);

async function timeline(page, secs) {
  const ticks = [];
  for (let i = 0; i < secs * 2; i++) {
    await page.waitForTimeout(500);
    ticks.push(await snap(page));
  }
  return ticks;
}

/** Distinct values a field takes over a timeline: feedback that never changes is no feedback. */
function changes(ticks, key) {
  return new Set(ticks.map((t) => t[key])).size;
}

async function pressStart(page, how) {
  if (how === "keyboard") {
    await page.locator("#btn-practice-start").focus();
    await page.keyboard.press("Enter");
  } else {
    await page.locator("#btn-practice-start").click({ timeout: 5000 });
  }
  return page
    .waitForFunction(() => !document.getElementById("btn-practice-stop")?.hidden, null, { timeout: 5000 })
    .then(() => true)
    .catch(() => false);
}

async function pressStop(page, how) {
  if (!(await isLive(page))) return true;
  if (how === "keyboard") {
    await page.locator("#btn-practice-stop").focus();
    await page.keyboard.press("Enter");
  } else {
    await page.locator("#btn-practice-stop").click({ timeout: 5000 });
  }
  await page.waitForTimeout(900);
  return !(await isLive(page));
}

async function afterStop(page) {
  return page.evaluate(() => ({
    rating: !!document.querySelector("#rate-card:not([hidden]), .rate-card:not([hidden])"),
    note: (document.getElementById("rate-note")?.innerText || "").trim().slice(0, 200),
    toast: document.getElementById("toast")?.classList.contains("show")
      ? (document.getElementById("toast").innerText || "").trim().slice(0, 200)
      : "",
    practiced: window.VTApp?.getPracticedSec?.() || 0,
    view: document.querySelector(".view.active")?.id || ""
  }));
}

async function runDefault(page, ex, how) {
  const started = await pressStart(page, how);
  await page.evaluate((s) => window.__VTVoice?.play(s), scenarioFor(ex));
  const ticks = await timeline(page, SECS);
  await page.evaluate(() => window.__VTVoice?.stop());
  const stopped = await pressStop(page, how);
  return { started, stopped, ticks, after: await afterStop(page), gum: await gum(page) };
}

async function runBoundary(page, ex) {
  const silent = await runQuiet(page, "silent");
  await openEx(page, ex.id);
  const noise = await runQuiet(page, "noise");
  return { silent, noise };
}

async function runQuiet(page, scenario) {
  const started = await pressStart(page, "mouse");
  await page.evaluate((s) => {
    if (s === "noise") window.__VTVoice?.play?.("noise");
  }, scenario);
  const ticks = await timeline(page, Math.max(4, SECS / 2));
  const stopped = await pressStop(page, "mouse");
  return { scenario, started, stopped, ticks, after: await afterStop(page) };
}

async function runInterrupt(page, ex) {
  const out = {};
  await page.locator("#btn-practice-start").dblclick({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(800);
  out.afterDouble = { live: await isLive(page), gum: await gum(page) };
  await page.evaluate((s) => window.__VTVoice?.play(s), scenarioFor(ex));
  await page.waitForTimeout(2500);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(600);
  out.afterHidden = { live: await isLive(page), snap: await snap(page) };
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.locator("#btn-back-home").click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(600);
  out.leavePrompt = await page.evaluate(() => !document.getElementById("leave-modal")?.hidden);
  if (out.leavePrompt) {
    await page.locator("#leave-cancel").click().catch(() => {});
    await page.waitForTimeout(300);
    out.afterStay = { view: (await snap(page)).view, live: await isLive(page) };
    await page.locator("#btn-back-home").click().catch(() => {});
    await page.waitForTimeout(400);
    await page.locator("#leave-discard").click().catch(() => {});
  }
  await page.waitForTimeout(800);
  out.final = { view: (await snap(page)).view, gum: await gum(page) };
  return out;
}

async function runReplay(page, ex) {
  const first = await runDefault(page, ex, "mouse");
  await page.locator("#btn-back-home").click({ timeout: 4000 }).catch(() => {});
  await page.waitForTimeout(500);
  await page.locator("#leave-discard").click({ timeout: 1500 }).catch(() => {});
  await page.evaluate((x) => window.VTApp.openExercise(x), ex.id);
  await page.waitForSelector("#view-exercise.active", { timeout: 10000 });
  await page.waitForTimeout(600);
  const reopened = await snap(page);
  return { first: { started: first.started, stopped: first.stopped, last: first.ticks.at(-1) }, reopened };
}

async function focusPath(page, max = 45) {
  const path_ = [];
  await page.evaluate(() => document.activeElement?.blur());
  for (let i = 0; i < max; i++) {
    await page.keyboard.press("Tab");
    // The page scrolls smoothly: measure once the glide has stopped
    await page.evaluate(
      () =>
        new Promise((res) => {
          let y = scrollY;
          let still = 0;
          const t0 = performance.now();
          const tick = () => {
            still = scrollY === y ? still + 1 : 0;
            y = scrollY;
            if (still >= 6 || performance.now() - t0 > 2000) res();
            else requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        })
    );
    path_.push(
      await page.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return { id: "body" };
        const r = el.getBoundingClientRect();
        const by = window.__audit.coverer(el, r);
        return {
          id: el.id || el.tagName.toLowerCase(),
          text: window.__audit.label(el).slice(0, 50),
          inView: r.bottom > 0 && r.top < innerHeight && r.width > 0,
          obscured: by !== "self" && by !== "offscreen",
          by,
          outline: getComputedStyle(el).outlineStyle !== "none" || getComputedStyle(el).boxShadow !== "none"
        };
      })
    );
  }
  return path_;
}

async function inventory(page) {
  return page.evaluate(() => ({
    rows: window.__audit.zInventory("#view-exercise"),
    overlaps: window.__audit.overlaps("#view-exercise"),
    headerRows: window.__audit.zInventory("header")
  }));
}

const ITERATIONS = {
  1: async (page, ex) => runDefault(page, ex, "mouse"),
  2: async (page, ex) => runDefault(page, ex, "keyboard"),
  3: runBoundary,
  4: runInterrupt,
  6: runReplay
};

async function auditDesktop(browser, ex) {
  const { ctx, page, errors } = await newPage(browser, DESKTOP, "es");
  const rec = { id: ex.id, mode: ex.mode, title: ex.title, scenario: scenarioFor(ex), iterations: {}, errors, local: LOCAL };
  try {
    await openEx(page, ex.id);
    rec.inventory = await inventory(page);
    rec.focus = await focusPath(page);
    for (const n of ITERS.filter((k) => ITERATIONS[k])) {
      await openEx(page, ex.id);
      rec.iterations[n] = await ITERATIONS[n](page, ex).catch((e) => ({ failure: String(e.message || e).slice(0, 300) }));
    }
    rec.events = await events(page);
  } catch (e) {
    rec.failure = String(e.message || e).slice(0, 400);
  }
  await ctx.close();
  return rec;
}

async function auditPhone(browser, ex) {
  const { ctx, page, errors } = await newPage(browser, PHONE, "en");
  const rec = { errors, local: LOCAL };
  try {
    await openEx(page, ex.id);
    rec.inventory = await inventory(page);
    await page.screenshot({ path: path.join(OUT, "phone", ex.id + "-open.png") });
    if (ex.mode !== "weekPlan") rec.run = await runDefault(page, ex, "mouse");
    await page.screenshot({ path: path.join(OUT, "phone", ex.id + "-after.png") });
  } catch (e) {
    rec.failure = String(e.message || e).slice(0, 400);
  }
  await ctx.close();
  return rec;
}

async function catalog(browser) {
  const { ctx, page } = await newPage(browser, DESKTOP, "es");
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VT_EXERCISES && !!window.VTApp, null, { timeout: 20000 });
  const all = await page.evaluate(() =>
    Object.values(window.VT_EXERCISES)
      .flat()
      .map((e) => ({ id: e.id, track: e.track, title: e.title, mode: window.VTApp.getProfile(e)?.mode || null }))
  );
  await ctx.close();
  return all;
}

async function pool(items, fn) {
  const out = [];
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
      console.log(`[${i + 1}/${items.length}] ${items[i].id}${out[i].failure ? " FAILURE " + out[i].failure : ""}`);
    }
  }
  await Promise.all(Array.from({ length: CONC }, worker));
  return out;
}

async function main() {
  fs.mkdirSync(path.join(OUT, "phone"), { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    proxy: /^https:/.test(BASE) && process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY } : undefined,
    args: ["--autoplay-policy=no-user-gesture-required", "--use-fake-ui-for-media-stream"]
  });
  const ids = process.env.IDS ? new Set(process.env.IDS.split(",")) : null;
  const list = (await catalog(browser)).filter((e) => !ids || ids.has(e.id));
  const results = await pool(list, async (ex) => {
    const rec = await auditDesktop(browser, ex);
    if (ITERS.includes(5)) rec.iterations[5] = await auditPhone(browser, ex);
    return rec;
  });
  await browser.close();
  fs.writeFileSync(path.join(OUT, "audit.json"), JSON.stringify({ base: BASE, at: new Date().toISOString(), results }, null, 1));
  console.log("wrote", path.join(OUT, "audit.json"));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
