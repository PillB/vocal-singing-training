/**
 * Shared Playwright helpers for max-effort / red-team suites.
 */
const { execSync } = require("child_process");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

/**
 * Alert the human when mic permission may need a manual click.
 * Plays a system beep, waits `waitMs` (default 5s), beeps again.
 * Env: MIC_HELP_WAIT_MS=5000 · MIC_HELP=0 to skip · REAL_MIC=1 forces help cue
 */
async function alertMicHelp(reason = "microphone permission", waitMs) {
  if (process.env.MIC_HELP === "0" || process.env.MIC_HELP === "false") return;
  const ms = Number(
    waitMs != null ? waitMs : process.env.MIC_HELP_WAIT_MS || 5000
  );
  const play = (sound) => {
    try {
      execSync(
        `afplay ${sound} 2>/dev/null || osascript -e 'beep 2' 2>/dev/null || printf '\\a'`,
        { stdio: "ignore", timeout: 4000 }
      );
    } catch {
      try {
        process.stdout.write("\x07\x07\x07");
      } catch {
        /* ignore */
      }
    }
  };
  console.log(`\n🔔 MIC HELP: ${reason} — allow mic in the browser if prompted (${ms}ms)…\n`);
  play("/System/Library/Sounds/Glass.aiff");
  await new Promise((r) => setTimeout(r, Math.max(0, ms)));
  play("/System/Library/Sounds/Ping.aiff");
  console.log("🔔 MIC HELP: wait done\n");
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ lang?: 'es'|'en', tourDone?: boolean, mic?: 'silent'|'tone'|'deny'|'real', clearBilling?: boolean, micHelp?: boolean }} [opts]
 */
async function boot(page, opts = {}) {
  const lang = opts.lang || "es";
  const tourDone = opts.tourDone !== false;
  const mic = opts.mic || "silent";
  const clearBilling = opts.clearBilling !== false;
  const headed =
    process.env.HEADED === "1" ||
    process.env.HEADED === "true" ||
    process.argv.includes("--headed");
  const wantRealMic = mic === "real" || process.env.REAL_MIC === "1";
  // Headed runs: always cue the human (beep + 5s) so they can click Allow on mic.
  // Skip with MIC_HELP=0. Force with MIC_HELP=1 even headless.
  const wantHelp =
    opts.micHelp === true ||
    process.env.MIC_HELP === "1" ||
    (headed && process.env.MIC_HELP !== "0" && process.env.MIC_HELP !== "false");

  if (wantHelp) {
    await alertMicHelp("Chrome may ask for microphone — click Allow if prompted");
  }

  await page.context().grantPermissions(["microphone"]).catch(async () => {
    if (wantHelp) {
      await alertMicHelp("mic still blocked — please Allow microphone, then tests continue");
    }
  });

  await page.addInitScript(
    ({ lang, tourDone, mic, clearBilling }) => {
      try {
        if (tourDone) localStorage.setItem("vt_tour_v1", "1");
        else localStorage.removeItem("vt_tour_v1");
        localStorage.setItem("vt_lang", lang);
        sessionStorage.setItem("vt_e2e", "1");
        if (clearBilling) localStorage.removeItem("vt_billing_v1");
      } catch {
        /* ignore */
      }

      if (mic === "deny") {
        if (navigator.mediaDevices) {
          navigator.mediaDevices.getUserMedia = async () => {
            const err = new Error("Permission denied");
            err.name = "NotAllowedError";
            throw err;
          };
        }
        return;
      }

      // Real mic (browser prompt) — do not mock getUserMedia
      if (mic === "real") return;

      const AC = window.AudioContext || window.webkitAudioContext;
      if (!navigator.mediaDevices || !AC) return;
      navigator.mediaDevices.getUserMedia = async () => {
        const ctx = new AC();
        const dest = ctx.createMediaStreamDestination();
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.value = mic === "tone" ? 0.02 : 0.00001;
        osc.frequency.value = mic === "tone" ? 220 : 440;
        osc.connect(g);
        g.connect(dest);
        osc.start();
        return dest.stream;
      };
    },
    { lang, tourDone, mic: wantRealMic ? "real" : mic, clearBilling }
  );

  await page.goto(BASE + "/?t=" + Date.now(), { waitUntil: "domcontentloaded" });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} exerciseId
 */
async function openExercise(page, exerciseId) {
  const ok = await page.evaluate(async (id) => {
    if (window.VTApp?.openExercise) {
      await window.VTApp.openExercise(id);
      return true;
    }
    const all = [
      ...(window.VT_EXERCISES?.vocal || []),
      ...(window.VT_EXERCISES?.singing || [])
    ];
    const found = all.find((e) => e.id === id);
    if (!found) return false;
    const tab = document.querySelector(`.tab[data-tab="${found.track}"]`);
    tab?.click();
    const chip = document.querySelector('.tier-chip[data-tier="all"]');
    chip?.click();
    await new Promise((r) => setTimeout(r, 50));
    for (const c of document.querySelectorAll("#exercise-list .card-ex")) {
      if (c.querySelector(".num")?.textContent?.trim() === String(found.number)) {
        c.click();
        return true;
      }
    }
    return false;
  }, exerciseId);
  if (!ok) throw new Error("openExercise failed: " + exerciseId);
  await page.waitForSelector("#view-exercise.active", { timeout: 8000 });
  // Wait until Start has real layout (not 0×0) — critical after format/fullscreen reflow
  await page
    .waitForFunction(
      () => {
        const b = document.getElementById("btn-practice-start");
        if (!b) return false;
        const r = b.getBoundingClientRect();
        return r.width >= 8 && r.height >= 8;
      },
      { timeout: 10000 }
    )
    .catch(() => {});
  await page.evaluate(() => {
    window.VTApp?.syncHeaderHeightVar?.();
    window.VTApp?.fitHighwayToViewport?.();
  });
  await page.waitForTimeout(50);
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function startPractice(page) {
  await page.locator("#btn-practice-start").click();
  await page.waitForFunction(
    () => {
      const st = document.querySelector("#practice-status")?.textContent || "";
      return /vivo|live|listening|escuch/i.test(st) || !document.querySelector("#btn-practice-stop")?.hidden;
    },
    { timeout: 12000 }
  );
}

/**
 * @param {import('@playwright/test').Page} page
 */
async function stopPractice(page) {
  const stop = page.locator("#btn-practice-stop");
  if (await stop.isVisible().catch(() => false)) {
    await stop.click();
  }
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} sel
 */
async function centerHitsSelf(page, sel) {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, reason: "missing" };
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return { ok: false, reason: "zero-size" };
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const ok = !!(top && (top === el || el.contains(top)));
    return {
      ok,
      top: top && { id: top.id, tag: top.tagName, cls: String(top.className).slice(0, 40) }
    };
  }, sel);
}

module.exports = {
  BASE,
  boot,
  openExercise,
  startPractice,
  stopPractice,
  centerHitsSelf,
  alertMicHelp
};
