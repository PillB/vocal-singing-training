/**
 * Side-by-side design test harness.
 *
 * Renders the same states and viewports for two arms, saves a first-screen
 * screenshot of each and measures each render:
 *   arm A  today's site, at --a (default BASE_URL, else http://127.0.0.1:8765)
 *   arm B  a challenger: a second server (--b <url>), or arm A's site with a
 *          patch module applied at runtime (--inject <patch.mjs>)
 *
 * Measurements, all in the first screen unless noted: the primary action
 * (where it is, whether it is fully visible), controls under 44px tall,
 * smallest text, text that fails WCAG contrast, horizontal overflow of the
 * page, page errors, scroll position and page height.
 *
 * A patch module's default export is { css?, init?, ready?, after? }:
 *   css    a stylesheet added to every page of arm B
 *   init   runs before any site script (page.addInitScript), e.g. to wrap globals
 *   ready  runs in the page after load, before the state's action
 *   after  runs in the page after the action, just before measuring
 * init, ready and after are functions or strings of JavaScript. A function is
 * sent to the page as source text, so it cannot use variables from the module.
 * A patch module may also export `states` (same shape as states.mjs), which
 * both arms get, so a challenger can be shown in the moment it changes.
 *
 * Usage:  npm run serve   (in another shell)
 *         node qa/design-test/harness.mjs --inject my-patch.mjs --states home-returning,exercise --vps phone,desktop
 *         node qa/design-test/harness.mjs --b http://127.0.0.1:8801 --states pricing --vps phone --out /tmp/pricing
 *
 * Writes <out>/<state>__<vp>__<A|B>.png, metrics.json and summary.md.
 * <out> defaults to $DT_WORK/renders/harness; DT_WORK defaults to
 * <os temp dir>/design-test. CHROME_PATH picks the browser binary.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { states as STATES, viewports as VPS } from "./states.mjs";

const USAGE = `Usage: node qa/design-test/harness.mjs (--inject <patch.mjs> | --b <url>) [options]

  --a <url>            arm A, today's site (default: BASE_URL or http://127.0.0.1:8765)
  --b <url>            arm B served from a second server
  --inject <patch.mjs> arm B = arm A's site plus this patch module
  --states a,b         states to render (default: home-returning; see states.mjs)
  --vps a,b            viewports: ${Object.keys(VPS).join(", ")} (default: phone,desktop)
  --states-from a.mjs,b.mjs  extra modules exporting { states }
  --out <dir>          output folder (default: $DT_WORK/renders/harness)
  --lang es|en         site language to seed (default: es)
  --full               also save a full-page JPEG of every render

Environment: BASE_URL, CHROME_PATH, DT_WORK.`;

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}
const args = Object.fromEntries(
  argv.reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1] && !arr[i + 1].startsWith("--") ? arr[i + 1] : "1"]);
    return acc;
  }, [])
);
function fail(msg) {
  console.error(`harness: ${msg}\n\n${USAGE}`);
  process.exit(2);
}
if (!args.b && !args.inject) fail("--b <challenger url> or --inject <patch.mjs> is required");

// Paths on the command line are relative to where the command was typed
// (npm run changes the working directory to the repo root).
const CWD = process.env.INIT_CWD || process.cwd();
const here = (p) => path.resolve(CWD, p);
const WORK = process.env.DT_WORK || path.join(os.tmpdir(), "design-test");
const BASE = args.a || process.env.BASE_URL || "http://127.0.0.1:8765";
const ARMS = { A: BASE, B: args.b || BASE };
const OUT = args.out ? here(args.out) : path.join(WORK, "renders", "harness");
const LANG = args.lang || "es";
const FULL = !!args.full;

let INJECT = null;
if (args.inject) {
  const mod = await import(pathToFileURL(here(args.inject)).href);
  INJECT = mod.default || {};
  if (mod.states) Object.assign(STATES, mod.states);
}
if (args["states-from"]) {
  for (const f of args["states-from"].split(",")) {
    const mod = await import(pathToFileURL(here(f)).href);
    if (mod.states) Object.assign(STATES, mod.states);
  }
}
const states = (args.states || "home-returning").split(",");
const vps = (args.vps || "phone,desktop").split(",");
const unknown = [...states.filter((s) => !STATES[s]).map((s) => `state "${s}"`), ...vps.filter((v) => !VPS[v]).map((v) => `viewport "${v}"`)];
if (unknown.length) fail(`unknown ${unknown.join(", ")}`);
fs.mkdirSync(OUT, { recursive: true });

const UA = {
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  mobile: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36"
};

// Measurements taken in the page. Kept dependency-free.
function measure() {
  const vh = innerHeight;
  const vw = innerWidth;
  const vis = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) === 0) return null;
    return r;
  };
  const parse = (c) => {
    const m = c && c.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const lin = (c) => {
    c /= 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (fg, bg) => ({ r: fg.r * fg.a + bg.r * (1 - fg.a), g: fg.g * fg.a + bg.g * (1 - fg.a), b: fg.b * fg.a + bg.b * (1 - fg.a), a: 1 });
  const effBg = (el) => {
    const stack = [];
    let gradient = false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none") gradient = true;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) {
        stack.push(c);
        if (c.a >= 1) break;
      }
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) bg = over(stack[i], bg);
    return { bg, gradient };
  };
  const out = {
    vw,
    vh,
    scrollY: Math.round(scrollY),
    pageH: document.documentElement.scrollHeight,
    overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
  };
  const header = document.querySelector("header.app-header, .app-header, header");
  out.headerH = header ? Math.round(header.getBoundingClientRect().height) : null;

  // A dialog's primary wins over whatever is behind it.
  const primSel = ["#loop-done-close", "#pricing-modal:not([hidden]) .btn-primary", "#btn-practice-start", "#btn-next-step", ".btn-practice"];
  for (const s of primSel) {
    const el = [...document.querySelectorAll(s)].find((e) => vis(e));
    if (el) {
      const r = el.getBoundingClientRect();
      out.primary = {
        sel: s,
        text: el.textContent.trim().slice(0, 40),
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        h: Math.round(r.height),
        pctTop: Math.round((r.top / vh) * 100),
        inFirstScreen: r.top >= 0 && r.bottom <= vh
      };
      break;
    }
  }
  const ctrls = [...document.querySelectorAll("button, a.btn, [role=button], select, input:not([type=hidden])")]
    .map((e) => ({ e, r: vis(e) }))
    .filter((x) => x.r && x.r.top < vh && x.r.bottom > 0 && x.r.left < vw);
  out.controlsInFirstScreen = ctrls.length;
  out.minControlH = ctrls.length ? Math.round(Math.min(...ctrls.map((x) => x.r.height))) : null;
  out.controlsUnder44 = ctrls
    .filter((x) => x.r.height < 43.5)
    .map((x) => (x.e.id ? "#" + x.e.id : x.e.className?.toString().split(" ")[0] || x.e.tagName) + ":" + Math.round(x.r.height))
    .slice(0, 12);

  // Text nodes in the first screen: size, density and contrast.
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let chars = 0;
  let minFont = 99;
  let gradSkipped = 0;
  let n;
  const fails = [];
  const seen = new Set();
  while ((n = walker.nextNode())) {
    const t = n.textContent.trim();
    if (!t) continue;
    const el = n.parentElement;
    if (!el || seen.has(el)) continue;
    const r = vis(el);
    if (!r || r.bottom <= 0 || r.top >= vh || r.left >= vw) continue;
    seen.add(el);
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    chars += t.length;
    minFont = Math.min(minFont, fs);
    const fg = parse(cs.color);
    if (!fg) continue;
    const { bg, gradient } = effBg(el);
    if (gradient) {
      gradSkipped++;
      continue;
    }
    const fgc = over({ ...fg, a: fg.a * Number(cs.opacity || 1) }, bg);
    const l1 = L(fgc);
    const l2 = L(bg);
    const cr = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const large = fs >= 24 || (fs >= 18.66 && Number(cs.fontWeight) >= 700);
    if (cr < (large ? 3 : 4.5)) fails.push({ t: t.slice(0, 30), cr: Math.round(cr * 100) / 100, fs });
  }
  out.charsInFirstScreen = chars;
  out.minFontInFirstScreen = minFont === 99 ? null : minFont;
  out.contrastFails = fails.length;
  out.contrastFailSamples = fails.slice(0, 8);
  out.gradientTextSkipped = gradSkipped;
  return out;
}

async function renderOne(browser, arm, base, stateName, vpName) {
  const st = STATES[stateName];
  const vp = VPS[vpName];
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.deviceScaleFactor,
    userAgent: vp.mobile ? UA.mobile : UA.desktop,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    timezoneId: "America/Lima",
    locale: LANG === "en" ? "en-US" : "es-PE",
    permissions: ["microphone"]
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
  // A fixed clock, so the seeded days in states.mjs are "recent" every time.
  await page.clock.install({ time: new Date("2026-09-23T10:00:00-05:00") });
  // A bare state is a browser that has never been here: nothing seeded but
  // what the state asks for (the site picks its own language and track).
  const seeds = st.bare
    ? {}
    : {
        vt_lang: LANG,
        vt_settings_v1: JSON.stringify({ lastTab: st.tab || "singing" })
      };
  if (st.tour !== false && !st.bare) {
    seeds.vt_tour_v1 = "1";
    // A returning visitor has already met the exercise coach-marks and the
    // microphone primer; without these every exercise state is a tour overlay.
    seeds.vt_ui_tour_seen_v1 = JSON.stringify({ speech: 1, highway: 1, hold: 1 });
    seeds.vt_mic_primed_v1 = "1";
    seeds.vt_tour_auto_v1 = "1";
  }
  if (st.days) seeds.vt_days_v1 = JSON.stringify(st.days);
  if (st.loop) seeds.vt_loop_v1 = JSON.stringify(st.loop);
  if (st.seed) Object.assign(seeds, st.seed);
  await page.addInitScript((s) => {
    try {
      if (sessionStorage.getItem("__seeded")) return;
      sessionStorage.setItem("__seeded", "1");
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    } catch (e) {
      /* storage blocked: render unseeded */
    }
  }, seeds);
  const patch = arm === "B" ? INJECT : null;
  if (patch?.init) await page.addInitScript(patch.init);
  if (patch?.css) {
    await page.addInitScript((css) => {
      const add = () => {
        if (document.getElementById("__ab_patch")) return;
        const el = document.createElement("style");
        el.id = "__ab_patch";
        el.textContent = css;
        (document.head || document.documentElement).appendChild(el);
      };
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", add);
      else add();
    }, patch.css);
  }
  await page.goto(base + (st.url || "/"), { waitUntil: "load" });
  await page.waitForTimeout(900);
  if (patch?.ready) {
    try {
      await page.evaluate(patch.ready);
      await page.waitForTimeout(250);
    } catch (e) {
      errors.push("patch.ready: " + String(e).slice(0, 160));
    }
  }
  if (st.action) {
    try {
      await st.action(page);
    } catch (e) {
      errors.push("action: " + String(e).slice(0, 160));
    }
  }
  if (patch?.after) {
    try {
      await page.evaluate(patch.after);
      await page.waitForTimeout(250);
    } catch (e) {
      errors.push("patch.after: " + String(e).slice(0, 160));
    }
  }
  await page.evaluate(() => window.scrollTo(0, window.scrollY)).catch(() => {});
  const file = path.join(OUT, `${stateName}__${vpName}__${arm}.png`);
  await page.screenshot({ path: file });
  // Measure before the full-page shot: taking it resets the scroll position.
  const m = await page.evaluate(measure).catch((e) => ({ error: String(e) }));
  if (FULL) await page.screenshot({ path: file.replace(/\.png$/, "-full.jpg"), fullPage: true, type: "jpeg", quality: 60 });
  await ctx.close();
  return { file: path.basename(file), m, errors };
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]
});
const results = {};
for (const s of states) {
  for (const v of vps) {
    const key = `${s}__${v}`;
    results[key] = {};
    for (const arm of ["A", "B"]) results[key][arm] = await renderOne(browser, arm, ARMS[arm], s, v);
  }
}
await browser.close();
fs.writeFileSync(path.join(OUT, "metrics.json"), JSON.stringify(results, null, 2));

// The measurements that differ between the arms, one row each.
const rows = [["state/viewport", "metric", "A", "B"]];
const pick = (m) => ({
  "primary top px": m.primary ? m.primary.top : "none",
  "primary in first screen": m.primary ? m.primary.inFirstScreen : "none",
  "header px": m.headerH,
  "controls in first screen": m.controlsInFirstScreen,
  "controls < 44px": (m.controlsUnder44 || []).length,
  "min font px": m.minFontInFirstScreen,
  "chars in first screen": m.charsInFirstScreen,
  "contrast fails": m.contrastFails,
  "page height": m.pageH,
  "overflow-x": m.overflowX
});
for (const [k, v] of Object.entries(results)) {
  const a = pick(v.A.m || {});
  const b = pick(v.B.m || {});
  for (const metric of Object.keys(a)) if (String(a[metric]) !== String(b[metric])) rows.push([k, metric, a[metric], b[metric]]);
  if (v.A.errors.length || v.B.errors.length) rows.push([k, "page errors", v.A.errors.length, v.B.errors.length]);
}
const md = rows
  .map((r) => "| " + r.join(" | ") + " |")
  .join("\n")
  .replace(/^(\|[^\n]*\|)\n?/, "$1\n|---|---|---|---|\n");
fs.writeFileSync(path.join(OUT, "summary.md"), md.trimEnd() + "\n");
console.log(md.trimEnd());
console.log(`\nRenders: ${OUT}`);
