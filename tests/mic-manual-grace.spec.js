/**
 * Space manual sound grace — a11y continuous count after brief keyup.
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

test.describe("Manual Space grace (a11y)", () => {
  test("engine keeps manualSound during post-keyup grace", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => {
      const eng = new VTPracticeEngine();
      eng.sensitivity = 7;
      eng.setManualSound(true, "air");
      const midDown = eng.isManualEffective(performance.now());
      const stDown = eng.getManualSound();
      // Simulate keyup — should still be effective immediately
      eng.setManualSound(false, "air");
      const t0 = performance.now();
      const midGrace = eng.isManualEffective(t0 + 100);
      const stGrace = eng.getManualSound();
      // Past grace
      const graceMs = eng._manualGraceMs();
      const midAfter = eng.isManualEffective(t0 + graceMs + 80);
      // Re-press within grace continuous
      eng.setManualSound(true, "air");
      const t1 = performance.now();
      eng.setManualSound(false, "air");
      eng.setManualSound(true, "air"); // re-down
      const continuous = eng.isManualEffective(t1 + 50);
      return {
        midDown,
        keyDown: stDown.keyDown,
        midGrace,
        graceFlag: stGrace.grace,
        midAfter,
        continuous,
        graceMs,
        MANUAL: window.VT_MANUAL_GRACE_MS
      };
    });
    expect(r.MANUAL).toBeGreaterThanOrEqual(400);
    expect(r.midDown).toBe(true);
    expect(r.keyDown).toBe(true);
    expect(r.midGrace).toBe(true);
    expect(r.graceFlag).toBe(true);
    expect(r.midAfter).toBe(false);
    expect(r.continuous).toBe(true);
  });

  test("frame inject continues during grace (silent mic)", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const eng = new VTPracticeEngine();
      eng.running = true;
      eng.analyser = {
        getFloatTimeDomainData(buf) {
          for (let i = 0; i < buf.length; i++) buf[i] = 0;
        }
      };
      eng.buf = new Float32Array(2048);
      eng.audioCtx = { sampleRate: 48000 };
      eng._detectPitch = () => null;
      eng._rms = () => 0.001;
      const frames = [];
      eng.onFrame = (f) => frames.push(f);
      eng.setManualSound(true, "air");
      eng._loop();
      eng.running = false;
      if (eng.raf) cancelAnimationFrame(eng.raf);
      const fDown = frames[frames.length - 1];
      frames.length = 0;
      eng.setManualSound(false, "air");
      eng.running = true;
      eng._loop();
      eng.running = false;
      if (eng.raf) cancelAnimationFrame(eng.raf);
      const fGrace = frames[frames.length - 1];
      return {
        down: fDown && {
          manual: fDown.manualSound,
          grace: fDown.manualGrace,
          rms: fDown.rms,
          kind: fDown.manualKind
        },
        grace: fGrace && {
          manual: fGrace.manualSound,
          grace: fGrace.manualGrace,
          rms: fGrace.rms,
          kind: fGrace.manualKind
        }
      };
    });
    expect(r.down.manual).toBe(true);
    expect(r.down.grace).toBe(false);
    expect(r.down.rms).toBeGreaterThanOrEqual(0.05);
    expect(r.down.kind).toBe("air");
    expect(r.grace.manual).toBe(true);
    expect(r.grace.grace).toBe(true);
    expect(r.grace.rms).toBeGreaterThanOrEqual(0.05);
  });

  test("SH ladder cur does not reset during brief manual gap", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const Modes = window.VTPracticeModes;
      if (!Modes?.get) return { skip: true };
      const mode = Modes.get("shAirLadder");
      const host = document.createElement("div");
      document.body.appendChild(host);
      mode.mount(host, { rungs: [5, 10], mode: "shAirLadder" });
      mode.onStart?.();
      // 300ms of manual air
      for (let i = 0; i < 20; i++) {
        mode.onFrame({
          rms: 0.08,
          voiceFreq: null,
          dtMs: 16,
          manualSound: true,
          manualKind: "air"
        });
      }
      const mid = mode.state.cur;
      // brief gap with grace frames (manualSound still true)
      for (let i = 0; i < 5; i++) {
        mode.onFrame({
          rms: 0.08,
          voiceFreq: null,
          dtMs: 16,
          manualSound: true,
          manualGrace: true,
          manualKind: "air"
        });
      }
      const afterGrace = mode.state.cur;
      // real silence after grace would reset
      mode.onFrame({
        rms: 0.001,
        voiceFreq: null,
        dtMs: 16,
        manualSound: false
      });
      const afterSilent = mode.state.cur;
      mode.unmount?.();
      host.remove();
      return { mid, afterGrace, afterSilent, skip: false };
    });
    if (r.skip) {
      test.skip();
      return;
    }
    expect(r.mid).toBeGreaterThan(0.2);
    expect(r.afterGrace).toBeGreaterThan(r.mid);
    expect(r.afterSilent).toBe(0);
  });

  test("forceClear ends grace immediately", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const eng = new VTPracticeEngine();
      eng.setManualSound(true, "voice");
      eng.setManualSound(false, "voice");
      const during = eng.isManualEffective(performance.now());
      eng.setManualSound(false, "voice", { forceClear: true });
      const after = eng.isManualEffective(performance.now());
      return { during, after };
    });
    expect(r.during).toBe(true);
    expect(r.after).toBe(false);
  });
});
