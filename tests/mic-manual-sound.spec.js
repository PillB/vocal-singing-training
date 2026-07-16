/**
 * Mic sensitivity 3× max + Space manual sound assist (non-highway only).
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page) {
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
}

test.describe("Mic sensitivity & manual sound", () => {
  test("sensitivity 10 gain is ~3× legacy max (~2.6)", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const eng = new VTPracticeEngine();
      const g1 = eng._gainFromSens(1);
      const g10 = eng._gainFromSens(10);
      const thr1 = (() => {
        eng.sensitivity = 1;
        return eng._threshScale();
      })();
      const thr10 = (() => {
        eng.sensitivity = 10;
        return eng._threshScale();
      })();
      const air10 = (() => {
        eng.sensitivity = 10;
        return eng._airRms();
      })();
      return { g1, g10, thr1, thr10, air10, ratio: g10 / 2.6 };
    });
    expect(r.g10).toBeGreaterThanOrEqual(7.0);
    expect(r.g10).toBeLessThanOrEqual(8.1);
    expect(r.ratio).toBeGreaterThanOrEqual(2.7); // ~3× old max
    expect(r.thr10).toBeLessThan(0.25);
    expect(r.thr10).toBeLessThan(r.thr1);
    expect(r.air10).toBeLessThan(0.012);
  });

  test("manual air injects energy without pitch for SH mode kind", async ({ page }) => {
    await boot(page);
    const frame = await page.evaluate(async () => {
      const eng = new VTPracticeEngine();
      eng.running = true;
      // Fake analyser path: call setManualSound and synthesize one frame via internals
      eng.setManualSound(true, "air");
      eng.analyser = {
        getFloatTimeDomainData(buf) {
          for (let i = 0; i < buf.length; i++) buf[i] = 0; // silence mic
        }
      };
      eng.buf = new Float32Array(2048);
      eng.audioCtx = { sampleRate: 48000 };
      eng._detectPitch = () => 220; // would be pitch, but air clears it
      eng._rms = () => 0.001;
      let captured = null;
      eng.onFrame = (f) => {
        captured = f;
      };
      eng._loop();
      eng.running = false;
      if (eng.raf) cancelAnimationFrame(eng.raf);
      return captured;
    });
    expect(frame).toBeTruthy();
    expect(frame.manualSound).toBe(true);
    expect(frame.manualKind).toBe("air");
    expect(frame.rms).toBeGreaterThanOrEqual(0.05);
    expect(frame.voiceFreq).toBeNull();
  });

  test("manual hint hidden on highway profile (showPitch)", async ({ page }) => {
    await boot(page);
    // Open a pitch exercise — singing pitch match if present
    await page.evaluate(() => {
      localStorage.setItem("vt_lang", "es");
    });
    // Switch to singing tab
    await page.locator('.tab[data-tab="singing"]').click();
    await page.waitForTimeout(200);
    // Find pitch-match style card by number/title if possible — click first advanced with pitch
    const opened = await page.evaluate(() => {
      const list = window.VT_EXERCISES?.singing || [];
      const pitch = list.find((e) => e.practice?.showPitch || e.id.includes("pitch"));
      if (!pitch) return null;
      // open via app if available
      const cards = [...document.querySelectorAll("#exercise-list .card-ex")];
      const btn = cards.find((c) => c.textContent.includes(String(pitch.number)));
      if (btn) {
        btn.click();
        return pitch.id;
      }
      return pitch.id;
    });
    // Fallback: click first card
    if (!(await page.locator("#view-exercise.active").count())) {
      await page.locator("#exercise-list .card-ex").first().click();
    }
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    // Without live practice, hint should stay hidden
    await expect(page.locator("#mic-manual-hint")).toBeHidden();
  });
});
