/**
 * Multi-viewport forensic capture: desktop / tablet / mobile / landscape.
 * Validates sticky highway stays within the visual viewport.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const OUT = path.join(__dirname, "geometry", "viewports");
const SHOTS = path.join(__dirname, "screenshots", "viewports");

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

const VIEWPORTS = [
  { id: "desk_1280x800", width: 1280, height: 800 },
  { id: "desk_1440x900", width: 1440, height: 900 },
  { id: "laptop_1024x768", width: 1024, height: 768 },
  { id: "tablet_768x1024", width: 768, height: 1024 },
  { id: "tablet_land_1024x768", width: 1024, height: 768 },
  { id: "phone_390x844", width: 390, height: 844 },
  { id: "phone_360x740", width: 360, height: 740 },
  { id: "phone_land_844x390", width: 844, height: 390 },
  { id: "narrow_320x640", width: 320, height: 640 }
];

async function measureStage(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const stage = document.getElementById("highway-stage");
    const canvas = document.getElementById("pitch-canvas");
    const header = document.querySelector("header.app-header");
    const start = document.getElementById("btn-practice-start");
    const bl = document.querySelector(".hud-bl");
    const br = document.querySelector(".hud-br");
    const bc = document.querySelector(".hud-bc");
    const tr = document.querySelector(".hud-tr");
    const tl = document.querySelector(".hud-tl");

    function box(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        x2: r.x + r.width,
        y2: r.y + r.height,
        visible:
          st.display !== "none" &&
          st.visibility !== "hidden" &&
          !el.hasAttribute("hidden") &&
          r.width > 0 &&
          r.height > 0
      };
    }

    const s = box(stage);
    const c = box(canvas);
    const h = box(header);
    const issues = [];

    if (s && s.visible) {
      // Sticky stage must not extend past viewport bottom
      if (s.y2 > vh + 2) {
        issues.push({
          code: "stage_bottom_overflow",
          msg: `stage.y2=${s.y2.toFixed(1)} > vh=${vh}`
        });
      }
      if (s.x < -2 || s.x2 > vw + 2) {
        issues.push({
          code: "stage_horizontal_overflow",
          msg: `stage x=${s.x.toFixed(1)} x2=${s.x2.toFixed(1)} vw=${vw}`
        });
      }
      // Stage should not sit under fold start with huge top clip
      if (s.y < -2) {
        issues.push({ code: "stage_top_clip", msg: `stage.y=${s.y.toFixed(1)}` });
      }
    }
    if (c && c.visible) {
      if (c.y2 > vh + 2) {
        issues.push({
          code: "canvas_bottom_overflow",
          msg: `canvas.y2=${c.y2.toFixed(1)} > vh=${vh}`
        });
      }
      if (s && s.visible && (c.y < s.y - 2 || c.y2 > s.y2 + 2)) {
        issues.push({
          code: "canvas_outside_stage",
          msg: `canvas [${c.y.toFixed(0)},${c.y2.toFixed(0)}] vs stage [${s.y.toFixed(0)},${s.y2.toFixed(0)}]`
        });
      }
    }

    // Critical controls must be fully inside viewport when on exercise
    for (const [name, el] of [
      ["start", start],
      ["hud-bl", bl],
      ["hud-br", br],
      ["hud-bc", bc],
      ["hud-tl", tl],
      ["hud-tr", tr]
    ]) {
      const b = box(el);
      if (!b || !b.visible) continue;
      if (b.y2 > vh + 3) {
        issues.push({
          code: "control_bottom_overflow",
          msg: `${name} y2=${b.y2.toFixed(1)} > vh=${vh}`
        });
      }
      if (b.x2 > vw + 3 || b.x < -3) {
        issues.push({
          code: "control_horizontal_overflow",
          msg: `${name} x=${b.x.toFixed(1)} x2=${b.x2.toFixed(1)} vw=${vw}`
        });
      }
    }

    // Pairwise HUD rail overlaps (explicit AABB)
    function overlap(a, b) {
      const ix1 = Math.max(a.x, b.x);
      const iy1 = Math.max(a.y, b.y);
      const ix2 = Math.min(a.x2, b.x2);
      const iy2 = Math.min(a.y2, b.y2);
      const w = ix2 - ix1;
      const h = iy2 - iy1;
      return w > 2 && h > 2 ? w * h : 0;
    }
    const peers = [
      ["tl", box(tl)],
      ["tr", box(tr)],
      ["bl", box(bl)],
      ["br", box(br)],
      ["bc", box(bc)]
    ].filter(([, b]) => b && b.visible);
    for (let i = 0; i < peers.length; i++) {
      for (let j = i + 1; j < peers.length; j++) {
        const area = overlap(peers[i][1], peers[j][1]);
        if (area > 4) {
          // bl/bc/br may share bottom rail intentionally — flag only if center-ish
          const pair = `${peers[i][0]}∩${peers[j][0]}`;
          const bottomRow = ["bl", "br", "bc"].includes(peers[i][0]) && ["bl", "br", "bc"].includes(peers[j][0]);
          if (bottomRow && area < 80) continue; // hairline gap
          if (pair === "tl∩tr" || pair === "tr∩tl" || area > 40) {
            issues.push({
              code: "hud_overlap",
              msg: `${pair} area=${area.toFixed(0)}`
            });
          }
        }
      }
    }

    return {
      vw,
      vh,
      header: h,
      stage: s,
      canvas: c,
      issues,
      ok: issues.length === 0
    };
  });
}

async function openPitchExercise(page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(() => {
    localStorage.setItem("vt_lang", "es");
    localStorage.setItem("vt_tour_v1", "1");
    sessionStorage.setItem("vt_e2e", "1");
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const root = document.getElementById("tour-root");
    if (root) root.hidden = true;
    document.body.classList.remove("tour-active");
    // Match production: sync sticky offset to real header height
    const h = document.querySelector("header.app-header");
    if (h) {
      const hh = Math.max(40, Math.ceil(h.getBoundingClientRect().height));
      document.documentElement.style.setProperty("--header-h", `${hh}px`);
    }
  });
  await page.click('.tab[data-tab="singing"]');
  await page.waitForTimeout(150);
  // Prefer pitch-match (showPitch)
  const opened = await page.evaluate(() => {
    const list = window.VT_EXERCISES?.singing || [];
    const pitch =
      list.find((e) => e.id === "s9-pitch-match") ||
      list.find((e) => e.practice?.showPitch) ||
      list[0];
    if (!pitch) return false;
    const cards = [...document.querySelectorAll("#exercise-list .card-ex")];
    for (const c of cards) {
      if (c.querySelector(".num")?.textContent?.trim() === String(pitch.number)) {
        c.click();
        return pitch.id;
      }
    }
    cards[0]?.click();
    return "fallback";
  });
  await page.waitForTimeout(350);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    window.VTApp?.syncHeaderHeightVar?.();
    window.VTApp?.fitHighwayToViewport?.();
  });
  await page.waitForTimeout(80);
  await page.evaluate(() => window.VTApp?.fitHighwayToViewport?.());
  await page.waitForTimeout(40);
  return opened;
}

async function openHome(page) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.evaluate(() => {
    localStorage.setItem("vt_lang", "es");
    localStorage.setItem("vt_tour_v1", "1");
    sessionStorage.setItem("vt_e2e", "1");
    const root = document.getElementById("tour-root");
    if (root) root.hidden = true;
    document.body.classList.remove("tour-active");
  });
  await page.waitForTimeout(100);
}

async function main() {
  const browser = await chromium.launch();
  const summary = { viewports: [], totalIssues: 0, failed: [] };

  for (const vp of VIEWPORTS) {
    const page = await browser.newPage({
      viewport: { width: vp.width, height: vp.height }
    });
    const entry = { id: vp.id, width: vp.width, height: vp.height, scenes: {} };

    // Home
    await openHome(page);
    await page.screenshot({
      path: path.join(SHOTS, `${vp.id}_home.png`),
      fullPage: false
    });
    entry.scenes.home = await page.evaluate(() => ({
      vw: innerWidth,
      vh: innerHeight,
      scrollW: document.documentElement.scrollWidth,
      clientW: document.documentElement.clientWidth
    }));
    if (entry.scenes.home.scrollW > entry.scenes.home.clientW + 2) {
      entry.scenes.home.issues = [
        {
          code: "page_horizontal_scroll",
          msg: `scrollW=${entry.scenes.home.scrollW} > clientW=${entry.scenes.home.clientW}`
        }
      ];
      summary.totalIssues += 1;
      summary.failed.push(`${vp.id}:home horizontal scroll`);
    }

    // Pitch exercise
    await openPitchExercise(page);
    await page.screenshot({
      path: path.join(SHOTS, `${vp.id}_pitch.png`),
      fullPage: false
    });
    const m = await measureStage(page);
    entry.scenes.pitch = m;
    if (!m.ok) {
      summary.totalIssues += m.issues.length;
      for (const iss of m.issues) {
        summary.failed.push(`${vp.id}:pitch ${iss.code} ${iss.msg}`);
      }
    }

    // Speech exercise (no highway)
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.evaluate(() => {
      localStorage.setItem("vt_tour_v1", "1");
      sessionStorage.setItem("vt_e2e", "1");
    });
    await page.goto(BASE, { waitUntil: "networkidle" });
    await page.click('.tab[data-tab="vocal"]');
    await page.waitForTimeout(100);
    await page.locator("#exercise-list .card-ex").first().click();
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      window.VTApp?.syncHeaderHeightVar?.();
      window.VTApp?.fitHighwayToViewport?.();
    });
    await page.waitForTimeout(60);
    await page.screenshot({
      path: path.join(SHOTS, `${vp.id}_speech.png`),
      fullPage: false
    });
    const speech = await measureStage(page);
    entry.scenes.speech = speech;
    // On speech, pitch canvas may be hidden — only flag stage overflow
    const speechIssues = (speech.issues || []).filter(
      (i) => i.code !== "canvas_bottom_overflow" && i.code !== "canvas_outside_stage"
    );
    if (speechIssues.length) {
      summary.totalIssues += speechIssues.length;
      for (const iss of speechIssues) {
        summary.failed.push(`${vp.id}:speech ${iss.code} ${iss.msg}`);
      }
    }

    summary.viewports.push(entry);
    fs.writeFileSync(path.join(OUT, `${vp.id}.json`), JSON.stringify(entry, null, 2));
    console.log(
      vp.id,
      "pitch_ok=",
      m.ok,
      "stage_h=",
      m.stage?.h?.toFixed?.(0),
      "stage_y2=",
      m.stage?.y2?.toFixed?.(0),
      "vh=",
      m.vh
    );
    await page.close();
  }

  fs.writeFileSync(path.join(OUT, "_summary.json"), JSON.stringify(summary, null, 2));
  console.log("\n=== Viewport summary ===");
  console.log("Viewports:", VIEWPORTS.length);
  console.log("Total issues:", summary.totalIssues);
  if (summary.failed.length) {
    console.log("Failures:");
    summary.failed.forEach((f) => console.log(" -", f));
  }
  await browser.close();
  process.exit(summary.totalIssues > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
