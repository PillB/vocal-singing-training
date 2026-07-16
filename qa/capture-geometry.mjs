/**
 * Playwright forensic capture: screenshots + element geometry for all views/exercises.
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const OUT = path.join(__dirname, "geometry");
const SHOTS = path.join(__dirname, "screenshots");
const VIEWPORT = { width: 1280, height: 800 };

fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

const SELECTORS = [
  "header.app-header",
  ".header-actions",
  "#btn-lang",
  "#btn-tour",
  "#btn-history",
  "#btn-plan",
  "#view-home",
  "#view-exercise",
  "#view-history",
  "#view-plan",
  ".tabs",
  ".tier-filters",
  "#btn-continue",
  "#btn-structured",
  "#exercise-list",
  "#session-banner",
  ".practice-cockpit",
  "#highway-stage",
  ".hud-tl",
  ".hud-tr",
  ".hud-bl",
  ".hud-br",
  ".hud-bc",
  "#mic-sensitivity",
  "#btn-practice-start",
  "#btn-practice-stop",
  "#timer-display",
  "#hold-display",
  "#chord-now",
  "#pitch-block",
  "#pitch-canvas",
  "#mode-hud",
  "#mode-cue",
  "#piano-block",
  "#prog-buttons",
  "#level-meter-wrap",
  ".guide-card",
  "#metrics-form",
  "#btn-complete",
  "#btn-back-home",
  "#ex-title"
];

async function dumpGeometry(page, label) {
  const data = await page.evaluate((sels) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const items = [];
    const seen = new Set();

    function pushEl(el, sel) {
      if (!el || seen.has(el)) return;
      seen.add(el);
      const r = el.getBoundingClientRect();
      const st = window.getComputedStyle(el);
      const z = st.zIndex === "auto" ? 0 : parseInt(st.zIndex, 10) || 0;
      items.push({
        sel: sel || el.id || el.className?.toString?.().slice(0, 80) || el.tagName,
        tag: el.tagName,
        id: el.id || "",
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        x2: r.x + r.width,
        y2: r.y + r.height,
        z,
        visible:
          st.display !== "none" &&
          st.visibility !== "hidden" &&
          st.opacity !== "0" &&
          !el.hasAttribute("hidden") &&
          r.width > 0 &&
          r.height > 0,
        position: st.position,
        overflow: st.overflow,
        pointerEvents: st.pointerEvents
      });
    }

    sels.forEach((sel) => {
      document.querySelectorAll(sel).forEach((el) => pushEl(el, sel));
    });

    // Interactive peers that often collide
    document
      .querySelectorAll(
        "button:not([hidden]), .hud-corner, .status-pill, .timer-display, .card.card-ex"
      )
      .forEach((el) => pushEl(el, "interactive"));

    return { label: "", vw, vh, scrollY: window.scrollY, items, ts: Date.now() };
  }, SELECTORS);
  data.label = label;
  const file = path.join(OUT, `${label.replace(/[^a-z0-9_-]+/gi, "_")}.json`);
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  return data;
}

async function shot(page, name) {
  await page.screenshot({
    path: path.join(SHOTS, `${name}.png`),
    fullPage: true
  });
}

async function main() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: VIEWPORT });
  page.on("pageerror", (e) => console.error("PAGEERROR", e.message));

  // Force Spanish clean; suppress intro tour for stable geometry
  await page.goto(BASE);
  await page.evaluate(() => {
    localStorage.setItem("vt_lang", "es");
    localStorage.setItem("vt_tour_v1", "1");
    sessionStorage.setItem("vt_e2e", "1");
  });
  await page.goto(BASE, { waitUntil: "networkidle" });
  // Close tour if it still appeared
  await page.evaluate(() => {
    const root = document.getElementById("tour-root");
    if (root) root.hidden = true;
    document.body.classList.remove("tour-active");
  });

  const pages = [];

  // Home vocal
  await shot(page, "01_home_vocal_es");
  pages.push(await dumpGeometry(page, "01_home_vocal_es"));

  // Tiers
  await page.click('.tier-chip[data-tier="basic"]');
  await shot(page, "02_home_vocal_basic");
  pages.push(await dumpGeometry(page, "02_home_vocal_basic"));

  // Singing tab
  await page.click('.tab[data-tab="singing"]');
  await page.waitForTimeout(200);
  await shot(page, "03_home_singing_es");
  pages.push(await dumpGeometry(page, "03_home_singing_es"));

  // History
  await page.click("#btn-history");
  await page.waitForTimeout(200);
  await shot(page, "04_history");
  pages.push(await dumpGeometry(page, "04_history"));
  await page.click("#btn-history-back");

  // Plan
  await page.click("#btn-plan");
  await page.waitForTimeout(200);
  await shot(page, "05_plan");
  pages.push(await dumpGeometry(page, "05_plan"));
  await page.click("#btn-plan-back");

  // English toggle home
  await page.click("#btn-lang");
  await page.waitForTimeout(150);
  await shot(page, "06_home_en");
  pages.push(await dumpGeometry(page, "06_home_en"));
  await page.click("#btn-lang"); // back to ES

  // All exercises via evaluate
  const exerciseIds = await page.evaluate(() => {
    return [...VT_EXERCISES.vocal, ...VT_EXERCISES.singing].map((e) => ({
      id: e.id,
      track: e.track,
      tier: e.tier || "basic",
      title: e.title,
      n: e.number
    }));
  });

  for (const ex of exerciseIds) {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.evaluate((t) => {
      localStorage.setItem("vt_lang", "es");
      // open via app state
      const all = [...window.VT_EXERCISES.vocal, ...window.VT_EXERCISES.singing];
      const found = all.find((e) => e.id === t);
      if (!found) return;
    }, ex.id);
    // Navigate UI
    await page.click(`.tab[data-tab="${ex.track}"]`);
    await page.click(`.tier-chip[data-tier="${ex.tier}"]`);
    await page.waitForTimeout(100);
    // Click card by number badge + open first matching - use evaluate click
    const opened = await page.evaluate((id) => {
      const all = [...VT_EXERCISES.vocal, ...VT_EXERCISES.singing];
      const found = all.find((e) => e.id === id);
      if (!found) return false;
      // trigger same as card click via DOM
      const cards = [...document.querySelectorAll("#exercise-list .card-ex")];
      const card = cards.find((c) => c.querySelector("h3")?.textContent);
      // better: find by number
      for (const c of cards) {
        const num = c.querySelector(".num")?.textContent?.trim();
        if (num === String(found.number)) {
          c.click();
          return true;
        }
      }
      if (cards[0]) {
        cards[0].click();
        return "fallback";
      }
      return false;
    }, ex.id);
    await page.waitForTimeout(250);
    const active = await page.locator("#view-exercise").evaluate((el) =>
      el.classList.contains("active")
    );
    const label = `ex_${ex.track}_${ex.n}_${ex.id}`;
    if (active) {
      await shot(page, label);
      pages.push(await dumpGeometry(page, label));
    } else {
      console.warn("skip", ex.id, opened);
    }
  }

  // Index
  fs.writeFileSync(
    path.join(OUT, "_index.json"),
    JSON.stringify(
      {
        base: BASE,
        viewport: VIEWPORT,
        count: pages.length,
        labels: pages.map((p) => p.label)
      },
      null,
      2
    )
  );

  await browser.close();
  console.log("Captured", pages.length, "pages");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
