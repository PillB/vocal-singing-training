/**
 * Cross-browser / mobile-engine audio smoke.
 * Run on chromium, firefox, webkit (+ mobile projects in playwright.config).
 *
 * Edge/Opera use Chromium — covered by chromium project.
 * Safari desktop/iOS covered by webkit + mobile-safari.
 */
const { test, expect, devices } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

function installFakeMicScript() {
  return () => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    async function fakeGUM() {
      if (!AC) throw new Error("no AudioContext");
      // Shared piano ctx required for WebKit MediaStreamSource
      let ctx = window.VTPiano?.ctx || window.VTSharedAudioCtx;
      if (!ctx || ctx.state === "closed") {
        ctx = new AC();
        window.VTSharedAudioCtx = ctx;
      }
      try {
        if (ctx.state === "suspended" || ctx.state === "interrupted") await ctx.resume();
      } catch {
        /* ignore */
      }
      try {
        await window.VTPiano?.ensure?.();
        ctx = window.VTPiano?.ctx || ctx;
      } catch {
        /* ignore */
      }
      const dest = ctx.createMediaStreamDestination();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.00001;
      osc.connect(g);
      g.connect(dest);
      osc.start();
      return dest.stream;
    }
    // Patch both instance + prototype (WebKit may call through prototype)
    try {
      if (!navigator.mediaDevices) {
        Object.defineProperty(navigator, "mediaDevices", {
          value: {},
          configurable: true,
          writable: true
        });
      }
      navigator.mediaDevices.getUserMedia = fakeGUM;
      if (typeof MediaDevices !== "undefined" && MediaDevices.prototype) {
        MediaDevices.prototype.getUserMedia = fakeGUM;
      }
    } catch (e) {
      console.warn("fakeGUM install failed", e);
    }
  };
}

async function boot(page) {
  await page.context().grantPermissions(["microphone"]).catch(() => {});
  await page.addInitScript(installFakeMicScript());
  await page.goto(BASE + "/?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  // Re-apply after load (some engines reset mediaDevices)
  await page.evaluate(installFakeMicScript());
}

async function samplePeak(page) {
  return page.evaluate(async () => {
    const P = window.VTPiano;
    let peak = 0;
    for (let i = 0; i < 8; i++) {
      if (typeof P?.outputPeak === "function") peak = Math.max(peak, P.outputPeak());
      await new Promise((r) => setTimeout(r, 40));
    }
    return {
      peak,
      ctx: P?.ctx?.state || "none",
      loop: !!P?.loopActive,
      playing: P?.playing?.length || 0,
      caps: typeof P?.capabilities === "function" ? P.capabilities() : null,
      ua: navigator.userAgent.slice(0, 120)
    };
  });
}

test.describe("Cross-browser audio", () => {
  test("Web Audio unlock + playProgression produces signal", async ({ page, browserName }) => {
    test.setTimeout(90_000);
    await boot(page);

    const caps = await page.evaluate(() => {
      const AC = window.AudioContext || window.webkitAudioContext;
      return {
        hasAC: !!AC,
        hasGUM: !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia),
        piano: typeof window.VTPiano !== "undefined"
      };
    });
    expect(caps.hasAC, `${browserName}: AudioContext`).toBe(true);
    expect(caps.piano, `${browserName}: VTPiano`).toBe(true);

    const r = await page.evaluate(async () => {
      const P = window.VTPiano;
      const unlocked = await P.unlock();
      await P.ensure();
      // Force resume again (Safari)
      await P.resume();
      await P.playProgression("prog1", {
        loop: false,
        sustain: true,
        sustainSec: 3,
        chordSec: 3,
        oneNote: false
      });
      await new Promise((res) => setTimeout(res, 250));
      let peak = 0;
      for (let i = 0; i < 6; i++) {
        peak = Math.max(peak, P.outputPeak?.() || 0);
        await new Promise((r) => setTimeout(r, 50));
      }
      return {
        unlocked,
        ctx: P.ctx?.state,
        peak,
        playing: P.playing?.length || 0,
        caps: P.capabilities?.()
      };
    });

    // running preferred; suspended right after unlock can still play scheduled notes on some engines
    expect(["running", "suspended", "interrupted"]).toContain(r.ctx);
    expect(r.playing, `${browserName}: scheduled voices`).toBeGreaterThan(0);
    // Peak may be tiny on some headless WebKit builds — require voices OR peak
    const audible = r.peak >= 0.002 || r.playing >= 7;
    expect(audible, `${browserName}: peak=${r.peak} playing=${r.playing}`).toBe(true);
  });

  test("Solfege Empezar has piano activity", async ({ page, browserName }) => {
    test.setTimeout(90_000);
    await boot(page);

    await page.evaluate(async () => {
      await window.VTApp.openExercise("s2-solfege-chords");
    });
    await expect(page.locator("#view-exercise")).toHaveClass(/active/, { timeout: 10000 });
    await page.evaluate(() => {
      const a = document.querySelector("#chk-auto-piano");
      if (a) a.checked = true;
    });

    // User-gesture path (required for Safari unlock)
    await page.locator("#btn-practice-start").click({ timeout: 10000 });
    // Wait until live or fail with diagnostics
    await page.waitForFunction(
      () => {
        const s = window.VTApp?.getState?.();
        return !!(s?.practiceLive || !document.querySelector("#btn-practice-stop")?.hidden);
      },
      null,
      { timeout: 20000 }
    ).catch(async () => {
      const diag = await page.evaluate(() => ({
        live: window.VTApp?.getState?.()?.practiceLive,
        starting: window.VTApp?.getState?.()?.practiceStarting,
        toast: document.querySelector(".toast")?.textContent,
        ctx: window.VTPiano?.ctx?.state,
        wants: window.VTApp?.wantsSound?.()
      }));
      throw new Error(`${browserName}: practice never went live ${JSON.stringify(diag)}`);
    });

    const audio = await samplePeak(page);
    expect(["running", "suspended", "interrupted"]).toContain(audio.ctx);
    expect(
      audio.loop || audio.playing > 0 || audio.peak >= 0.002,
      `${browserName}: silent piano peak=${audio.peak} playing=${audio.playing} ctx=${audio.ctx}`
    ).toBeTruthy();

    if (await page.locator("#btn-practice-stop").isVisible()) {
      await page.locator("#btn-practice-stop").click();
    }
  });

  test("Stop does not permanently close AudioContext", async ({ page, browserName }) => {
    test.setTimeout(90_000);
    await boot(page);
    await page.evaluate(async () => {
      await window.VTApp.openExercise("v1-diction");
    });
    await page.locator("#btn-practice-start").click();
    await page.waitForTimeout(500);
    if (await page.locator("#btn-practice-stop").isVisible()) {
      await page.locator("#btn-practice-stop").click();
    }
    await page.waitForTimeout(200);
    const st = await page.evaluate(() => window.VTPiano?.ctx?.state || "none");
    expect(st, `${browserName}: ctx after speech stop`).not.toBe("closed");

    // Piano exercise still works after speech stop
    await page.evaluate(async () => {
      await window.VTApp.openExercise("s2-solfege-chords");
      const a = document.querySelector("#chk-auto-piano");
      if (a) a.checked = true;
    });
    await page.locator("#btn-practice-start").click();
    await page.waitForFunction(
      () => !!window.VTApp?.getState?.()?.practiceLive,
      null,
      { timeout: 20000 }
    );
    // Explicit unlock+ensure after live (WebKit sometimes needs second resume)
    await page.evaluate(async () => {
      await window.VTPiano?.unlock?.();
      await window.VTPiano?.resume?.();
      if (!window.VTPiano?.loopActive && window.VTApp?.applyPianoOptionsHot) {
        await window.VTApp.applyPianoOptionsHot("xbrowser-recover");
      }
    });
    await page.waitForTimeout(300);
    const audio = await samplePeak(page);
    expect(
      audio.playing > 0 || audio.loop || audio.peak >= 0.002,
      `${browserName}: piano after speech peak=${audio.peak} playing=${audio.playing} ctx=${audio.ctx}`
    ).toBeTruthy();
  });
});
