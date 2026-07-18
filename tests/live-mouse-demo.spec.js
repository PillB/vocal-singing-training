/**
 * Immediate headed mouse demo — pink cursor moves + clicks right away.
 * Run: HEADED=1 SLOWMO=120 npx playwright test tests/live-mouse-demo.spec.js --headed --project=chromium
 */
const { test } = require("@playwright/test");
const { boot, openExercise } = require("./helpers/e2e");
const {
  installClickLogInit,
  dismissBlockingOverlays,
  reflowStage
} = require("./helpers/layout-probe");

const SLOW = Number(process.env.SLOWMO || 120) || 120;

test.use({
  headless: false,
  launchOptions: {
    slowMo: SLOW,
    args: ["--start-maximized", "--window-position=80,40"]
  }
});

async function installPinkCursor(page) {
  await page.addStyleTag({
    content: `
      #vt-pink-cursor {
        position: fixed; z-index: 2147483647; width: 22px; height: 22px;
        margin: -11px 0 0 -11px; border-radius: 50%;
        background: radial-gradient(circle at 30% 30%, #fff, #ff2d55 55%);
        box-shadow: 0 0 0 3px #fff, 0 0 18px #ff2d55, 0 0 40px rgba(255,45,85,.6);
        pointer-events: none !important;
        transition: none !important;
      }
      #tour-root, .tour-backdrop {
        display: none !important;
        pointer-events: none !important;
        visibility: hidden !important;
      }
    `
  });
  await page.evaluate(() => {
    if (document.getElementById("vt-pink-cursor")) return;
    const d = document.createElement("div");
    d.id = "vt-pink-cursor";
    d.style.left = "40px";
    d.style.top = "40px";
    document.documentElement.appendChild(d);
    window.addEventListener(
      "mousemove",
      (e) => {
        d.style.left = e.clientX + "px";
        d.style.top = e.clientY + "px";
      },
      true
    );
  });
}

/** Sweep mouse so movement is obvious immediately. */
async function warmMouse(page) {
  await page.mouse.move(30, 30);
  await page.waitForTimeout(80);
  await page.mouse.move(400, 120, { steps: 18 });
  await page.waitForTimeout(80);
  await page.mouse.move(200, 360, { steps: 16 });
  await page.waitForTimeout(80);
  await page.mouse.move(640, 200, { steps: 14 });
  await page.waitForTimeout(100);
}

async function visibleClick(page, sel) {
  await dismissBlockingOverlays(page);
  await reflowStage(page);
  const loc = page.locator(sel).first();
  const visible = await loc.isVisible().catch(() => false);
  if (!visible) {
    console.log("skip (hidden):", sel);
    return false;
  }
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await reflowStage(page);
  const box = await loc.boundingBox();
  if (!box || box.width < 2) {
    console.log("skip (no box):", sel);
    return false;
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  console.log("→ click", sel, Math.round(x), Math.round(y));
  await page.mouse.move(Math.max(8, x - 50), Math.max(8, y - 30), { steps: 10 });
  await page.mouse.move(x, y, { steps: 14 });
  await page.waitForTimeout(60);
  await page.mouse.down();
  await page.waitForTimeout(40);
  await page.mouse.up();
  await page.waitForTimeout(120);
  return true;
}

const DEMO_IDS = (process.env.DEMO_IDS || "v1-diction,s15-sh-air-ladder").split(",").map((s) => s.trim());

test("LIVE: pink cursor moves and clicks Start + controls", async ({ page }) => {
  test.setTimeout(180000);

  await page.addInitScript(installClickLogInit);
  await page.setViewportSize({ width: 1280, height: 800 });

  // Navigate ASAP so Chrome shows content
  await boot(page, { lang: "es", tourDone: true, mic: "silent" });
  await page.evaluate(installClickLogInit);
  await dismissBlockingOverlays(page);
  await installPinkCursor(page);

  // Immediate visible motion on home
  console.log("▶ warm mouse on home…");
  await warmMouse(page);

  // Home chips / tabs if present
  for (const sel of ["#tab-vocal", "#tab-singing", ".tier-chip[data-tier='all']"]) {
    const n = page.locator(sel).first();
    if (await n.isVisible().catch(() => false)) {
      await visibleClick(page, sel);
    }
  }

  for (const id of DEMO_IDS) {
    console.log("▶ open exercise", id);
    await openExercise(page, id);
    await dismissBlockingOverlays(page);
    await reflowStage(page);
    await installPinkCursor(page);
    await warmMouse(page);

    // Click Start (main CTA)
    await visibleClick(page, "#btn-practice-start");
    await page.waitForTimeout(400);

    // Space assist hold
    console.log("→ Space hold");
    await page.keyboard.down(" ");
    await page.waitForTimeout(500);
    await page.keyboard.up(" ");
    await page.waitForTimeout(200);

    // Toggle a few practice controls
    for (const sel of [
      "#btn-toggle-guide",
      "#btn-toggle-metrics",
      "#btn-toggle-piano",
      "#btn-practice-stop"
    ]) {
      await visibleClick(page, sel);
    }

    // Back home
    await visibleClick(page, "#btn-back-home");
    await page.waitForTimeout(250);
    await warmMouse(page);
  }

  console.log("▶ demo done — holding window 3s");
  await page.waitForTimeout(3000);
});
