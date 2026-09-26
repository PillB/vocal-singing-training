/**
 * Phone-viewport layout audit: home / plan / history / pricing / account, and
 * the practice screen (a lip trill, pitch match, and a guided session's first
 * step, at rest).
 *
 * Seeds realistic progress + week-plan data so the pages are rendered with
 * content (empty states hide most layout breaks), then reports for each
 * viewport:
 *   - horizontal page scroll (document.scrollWidth > clientWidth)
 *   - elements painted outside the viewport's right/left edge
 *   - text rendered below 12px (unreadable on a phone)
 *   - interactive controls below the 44px tap-target floor
 *   - visually overlapping sibling controls
 *
 * Usage:  npm run serve   (in another shell)
 *         node qa/capture-mobile.mjs            # writes qa/screenshots/mobile/<tag>
 *         TAG=after node qa/capture-mobile.mjs
 */
import { chromium } from "playwright";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const TAG = process.env.TAG || "before";
const SHOTS = process.env.SHOTS_DIR || path.join(__dirname, "screenshots", "mobile");
const OUT = path.join(SHOTS, TAG);
fs.mkdirSync(OUT, { recursive: true });

const MIN_FONT_PX = 12;
const MIN_TAP_PX = 44;

const VIEWPORTS = [
  { id: "phone_390x844", width: 390, height: 844 },
  { id: "phone_360x740", width: 360, height: 740 },
  { id: "narrow_320x640", width: 320, height: 640 }
];

/** On a phone, Pro and Cuenta sit in the header's "Más" menu. */
async function fromMenu(p, sel) {
  if (await p.locator("#btn-more").isVisible()) await p.click("#btn-more");
  await p.click(sel);
}

const PAGES = [
  { id: "home", open: async () => {} },
  { id: "menu", open: async (p) => p.click("#btn-more") },
  { id: "plan", open: async (p) => p.click("#btn-plan") },
  { id: "history", open: async (p) => p.click("#btn-history") },
  { id: "pricing", open: async (p) => fromMenu(p, "#btn-pricing") },
  { id: "account", open: async (p) => fromMenu(p, "#btn-account") },
  // The practice screen: the stage's controls meet the same floors (design:
  // start-floor). The guided one goes last: it starts today's routine.
  { id: "exercise", open: async (p) => p.evaluate(() => window.VTApp.openExercise("s4-lip-trills")) },
  { id: "exercise-pitch", open: async (p) => p.evaluate(() => window.VTApp.openExercise("s9-pitch-match")) },
  {
    id: "exercise-guided",
    open: async (p) => {
      await p.evaluate(() => window.VTApp.setView("home"));
      await p.click("#btn-next-step");
    }
  }
];

const MODAL_PAGES = new Set(["pricing", "account"]);

function seed() {
  const now = Date.now();
  const iso = (d) => new Date(d).toISOString();
  const progress = {};
  const ids = [
    "v1-diction",
    "v4-pausa-estrategica",
    "s9-pitch-match",
    "s15-sh-air-ladder",
    "v7-resonancia"
  ];
  ids.forEach((id, i) => {
    progress[id] = {
      completedCount: 3 + i,
      lastScore: 6 + (i % 4),
      lastAt: iso(now - i * 86400000),
      history: [
        {
          id: "h" + i,
          at: iso(now - i * 86400000),
          metrics: { accuracy: 72 + i, inTunePct: 61 + i, wpm: 128 + i },
          score: 6 + (i % 4),
          notes: "Nota de práctica larga para comprobar el ajuste del texto en pantallas angostas.",
          durationSec: 180 + i * 37
        }
      ]
    };
  });
  localStorage.setItem("vt_progress_v1", JSON.stringify(progress));
  localStorage.setItem(
    "vt_week_plan_v1",
    JSON.stringify({
      weekNumber: 4,
      element: "pace",
      status: "review",
      startedAt: iso(now - 7 * 86400000),
      checkIns: [iso(now - 5 * 86400000), iso(now - 3 * 86400000), iso(now - 86400000)],
      reviews: [
        {
          at: iso(now - 7 * 86400000),
          weekNumber: 3,
          element: "volume",
          improved: true,
          notes: "Más proyección sin forzar la garganta al final de la frase."
        }
      ],
      completedElements: ["volume", "tonality"]
    })
  );
}

function audit({ minFont, minTap }) {
  const docEl = document.documentElement;
  const vpw = window.innerWidth;
  const res = {
    scrollW: docEl.scrollWidth,
    clientW: docEl.clientWidth,
    overflow: [],
    tinyText: [],
    smallTargets: [],
    overlaps: []
  };
  const label = (el) => {
    const cls =
      typeof el.className === "string" && el.className.trim()
        ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".")
        : "";
    return el.tagName.toLowerCase() + (el.id ? "#" + el.id : "") + cls;
  };
  const shown = (el, st) =>
    st.display !== "none" &&
    st.visibility !== "hidden" &&
    Number(st.opacity) !== 0 &&
    !el.closest("[hidden]");

  const boxes = [];
  for (const el of document.querySelectorAll("body *")) {
    const st = getComputedStyle(el);
    if (!shown(el, st)) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) continue;
    boxes.push({ el, r, st });

    if (r.right > vpw + 1 || r.left < -1) {
      let anc = el.parentElement;
      let scroller = false;
      while (anc && anc !== document.body) {
        const as = getComputedStyle(anc);
        if (as.overflowX === "auto" || as.overflowX === "scroll") {
          scroller = true;
          break;
        }
        anc = anc.parentElement;
      }
      if (!scroller) {
        res.overflow.push({
          sel: label(el),
          left: Math.round(r.left),
          right: Math.round(r.right)
        });
      }
    }

    const size = parseFloat(st.fontSize);
    const text = (el.textContent || "").trim();
    if (text && !el.children.length && size < minFont) {
      res.tinyText.push({ sel: label(el), px: +size.toFixed(1), text: text.slice(0, 36) });
    }

    const tag = el.tagName.toLowerCase();
    const tappable =
      tag === "button" ||
      tag === "select" ||
      (tag === "a" && el.hasAttribute("href")) ||
      (tag === "input" && !/hidden/.test(el.type));
    // A checkbox or radio inside a <label> is tapped via the label
    let hit = r;
    if (tag === "input" && /checkbox|radio/.test(el.type)) {
      const lab = el.closest("label");
      if (lab) hit = lab.getBoundingClientRect();
    }
    if (tappable && (hit.height < minTap || hit.width < minTap)) {
      // A control may hold several labels with only one displayed (nav-label-short)
      const visibleText = [...el.childNodes]
        .map((n) =>
          n.nodeType === 3
            ? n.textContent
            : n.nodeType === 1 && getComputedStyle(n).display !== "none"
              ? n.textContent
              : ""
        )
        .join("")
        .trim();
      res.smallTargets.push({
        sel: label(el),
        w: Math.round(hit.width),
        h: Math.round(hit.height),
        text: (visibleText || el.value || "").slice(0, 24)
      });
    }
  }

  // Overlapping interactive controls (a tap hits the wrong thing).
  // Controls in different stacking layers (an open modal over the page behind
  // it, or the phone header's open "Más" menu) overlap by design, so only
  // compare within the same layer.
  const layer = (el) => el.closest(".modal-overlay, .header-utils.is-open") || document.body;
  const taps = boxes.filter(
    (b) => /^(button|select)$/.test(b.el.tagName.toLowerCase()) && b.st.position !== "fixed"
  );
  for (let i = 0; i < taps.length; i++) {
    for (let j = i + 1; j < taps.length; j++) {
      const a = taps[i];
      const b = taps[j];
      if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
      if (layer(a.el) !== layer(b.el)) continue;
      const ox = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
      const oy = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
      if (ox > 2 && oy > 2) {
        res.overlaps.push({ a: label(a.el), b: label(b.el), area: Math.round(ox * oy) });
      }
    }
  }
  return res;
}

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || undefined
});
const findings = [];

for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true
  });
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.evaluate(seed);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForTimeout(500);
  await page.evaluate(() => {
    const root = document.getElementById("tour-root");
    if (root) root.hidden = true;
    document.body.classList.remove("tour-active");
  });

  for (const pg of PAGES) {
    await page.evaluate(() => {
      document.querySelectorAll(".modal-overlay").forEach((m) => {
        m.hidden = true;
      });
      document.body.classList.remove("modal-open");
      window.scrollTo(0, 0);
    });
    await page.waitForTimeout(120);
    await pg.open(page);
    await page.waitForTimeout(450);
    const res = await page.evaluate(audit, { minFont: MIN_FONT_PX, minTap: MIN_TAP_PX });
    findings.push({ vp: vp.id, page: pg.id, ...res });
    await page.screenshot({
      path: path.join(OUT, `${vp.id}__${pg.id}.png`),
      fullPage: !MODAL_PAGES.has(pg.id)
    });
  }
  await ctx.close();
}
await browser.close();

fs.writeFileSync(path.join(SHOTS, `${TAG}-findings.json`), JSON.stringify(findings, null, 2));

let issues = 0;
const uniq = (arr, key) => {
  const seen = new Set();
  return arr.filter((x) => {
    const k = key(x);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
};

for (const f of findings) {
  const hScroll = f.scrollW > f.clientW + 1;
  const tiny = uniq(f.tinyText, (t) => t.sel + t.px);
  const small = uniq(f.smallTargets, (t) => t.sel);
  const over = uniq(f.overflow, (o) => o.sel);
  const laps = uniq(f.overlaps, (o) => o.a + o.b);
  const n = (hScroll ? 1 : 0) + tiny.length + small.length + over.length + laps.length;
  issues += n;
  console.log(
    `\n### ${f.vp} / ${f.page} — ${n === 0 ? "clean" : n + " issue(s)"}` +
      (hScroll ? `  *** H-SCROLL ${f.scrollW} > ${f.clientW} ***` : "")
  );
  over.forEach((o) => console.log(`  overflow      ${o.sel}  [${o.left}..${o.right}]`));
  tiny.forEach((t) => console.log(`  text ${t.px}px   ${t.sel}  "${t.text}"`));
  small.forEach((t) => console.log(`  tap ${t.w}x${t.h}   ${t.sel}  "${t.text}"`));
  laps.forEach((o) => console.log(`  overlap       ${o.a}  ×  ${o.b}`));
}

console.log(`\nTotal: ${issues} issue(s) across ${findings.length} page/viewport pairs.`);
console.log(`Screenshots: ${OUT}`);
