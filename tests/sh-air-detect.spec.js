/**
 * SH / unvoiced air auto-detection (HF energy + grace) — no real mic.
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

test.describe("SH air auto-detect", () => {
  test("HF noise triggers airDetected without Space", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const eng = new VTPracticeEngine();
      eng.sensitivity = 7;
      eng.running = true;
      eng.buf = new Float32Array(2048);
      // Synthetic SH-like buffer
      for (let i = 0; i < eng.buf.length; i++) {
        eng.buf[i] =
          (i % 2 === 0 ? 1 : -1) * 0.045 + (Math.random() - 0.5) * 0.02;
      }
      eng.analyser = {
        getFloatTimeDomainData(buf) {
          for (let i = 0; i < buf.length; i++) buf[i] = eng.buf[i];
        }
      };
      eng.audioCtx = { sampleRate: 48000 };
      // Pitch false-positive on fricatives is common — still must detect air
      eng._detectPitch = () => 180;
      let frame = null;
      eng.onFrame = (f) => {
        frame = f;
      };
      eng._loop();
      eng.running = false;
      if (eng.raf) cancelAnimationFrame(eng.raf);
      return {
        airDetected: frame && frame.airDetected,
        airRaw: frame && frame.airRaw,
        manual: frame && frame.manualSound,
        hfRms: frame && frame.hfRms,
        rms: frame && frame.rms,
        thr: frame && frame.airRmsThreshold,
        AIR_GRACE: window.VT_AIR_GRACE_MS
      };
    });
    expect(r.AIR_GRACE).toBeGreaterThanOrEqual(600);
    expect(r.manual).toBeFalsy();
    expect(r.hfRms).toBeGreaterThan(0.01);
    expect(r.airRaw).toBe(true);
    expect(r.airDetected).toBe(true);
  });

  test("soft broadband + false pitch still airDetects (real-mic SH bug)", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const eng = new VTPracticeEngine();
      eng.sensitivity = 7;
      eng.running = true;
      eng.buf = new Float32Array(2048);
      // Soft broadband noise (not alternating) — like quiet SH after AGC
      for (let i = 0; i < eng.buf.length; i++) {
        eng.buf[i] = (Math.random() - 0.5) * 0.04; // rms ~0.01–0.015
      }
      eng.analyser = {
        getFloatTimeDomainData(buf) {
          for (let i = 0; i < buf.length; i++) buf[i] = eng.buf[i];
        },
        getByteFrequencyData(bytes) {
          bytes.fill(8); // weak spectrum
        },
        frequencyBinCount: 1024,
        fftSize: 2048
      };
      eng.audioCtx = { sampleRate: 48000 };
      // Autocorr often locks on soft fricatives
      eng._detectPitch = () => 200;
      let frame = null;
      eng.onFrame = (f) => {
        frame = f;
      };
      eng._loop();
      eng.running = false;
      if (eng.raf) cancelAnimationFrame(eng.raf);
      // v1 clearVoice at voiceRms*0.8 would often block this
      return {
        airDetected: frame.airDetected,
        airRaw: frame.airRaw,
        rms: frame.rms,
        thr: frame.airRmsThreshold,
        voiceRms: eng._voiceRms()
      };
    });
    expect(r.rms).toBeGreaterThan(0.005);
    expect(r.airRaw).toBe(true);
    expect(r.airDetected).toBe(true);
  });

  test("FFT sibilant band alone can trigger air", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const eng = new VTPracticeEngine();
      eng.sensitivity = 7;
      eng.running = true;
      eng.buf = new Float32Array(2048);
      // Very soft time-domain
      for (let i = 0; i < eng.buf.length; i++) eng.buf[i] = (Math.random() - 0.5) * 0.004;
      eng.analyser = {
        getFloatTimeDomainData(buf) {
          for (let i = 0; i < buf.length; i++) buf[i] = eng.buf[i];
        },
        getByteFrequencyData(bytes) {
          bytes.fill(0);
          // Peak in upper sibilant half (~4–8 kHz at 48k / 2048)
          // bin ≈ hz * 2048 / 48000 → 4000 Hz ≈ bin 170
          for (let i = 160; i < 340; i++) bytes[i] = 90;
        },
        frequencyBinCount: 1024,
        fftSize: 2048
      };
      eng.audioCtx = { sampleRate: 48000 };
      eng._detectPitch = () => null;
      let frame = null;
      eng.onFrame = (f) => {
        frame = f;
      };
      eng._loop();
      eng.running = false;
      if (eng.raf) cancelAnimationFrame(eng.raf);
      return {
        airDetected: frame.airDetected,
        airBand: frame.airBand,
        airRaw: frame.airRaw
      };
    });
    expect(r.airBand).toBeGreaterThan(0.2);
    expect(r.airRaw).toBe(true);
    expect(r.airDetected).toBe(true);
  });

  test("sibilant path works even with false pitch + modest RMS", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const eng = new VTPracticeEngine();
      eng.sensitivity = 7;
      eng.running = true;
      eng.buf = new Float32Array(2048);
      // High HF ratio, lower broadband (soft SH)
      for (let i = 0; i < eng.buf.length; i++) {
        eng.buf[i] = (i % 2 === 0 ? 1 : -1) * 0.028;
      }
      eng.analyser = {
        getFloatTimeDomainData(buf) {
          for (let i = 0; i < buf.length; i++) buf[i] = eng.buf[i];
        }
      };
      eng.audioCtx = { sampleRate: 48000 };
      eng._detectPitch = () => 220;
      let frame = null;
      eng.onFrame = (f) => {
        frame = f;
      };
      eng._loop();
      eng.running = false;
      if (eng.raf) cancelAnimationFrame(eng.raf);
      // Old mode gate: rms > thr && !voiceFreq would FAIL here
      const thr = frame.airRmsThreshold;
      const oldGate = frame.rms > thr && !frame.voiceFreq;
      return {
        airDetected: frame.airDetected,
        voiceFreq: frame.voiceFreq,
        oldGate,
        hfRms: frame.hfRms,
        rms: frame.rms
      };
    });
    expect(r.airDetected).toBe(true);
    // Demonstrate old gate would have blocked (pitch sticky on frameFreq path)
    // voiceFreq may still be set on frame if not manual-air cleared — airDetected still true
    expect(r.hfRms).toBeGreaterThan(r.rms * 0.4);
  });

  test("near-silence does not auto air-detect", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const eng = new VTPracticeEngine();
      eng.sensitivity = 7;
      eng.running = true;
      eng.buf = new Float32Array(2048);
      eng.analyser = {
        getFloatTimeDomainData(buf) {
          for (let i = 0; i < buf.length; i++) buf[i] = (Math.random() - 0.5) * 0.0008;
        }
      };
      eng.audioCtx = { sampleRate: 48000 };
      eng._detectPitch = () => null;
      let frame = null;
      eng.onFrame = (f) => {
        frame = f;
      };
      eng._loop();
      eng.running = false;
      if (eng.raf) cancelAnimationFrame(eng.raf);
      return { airDetected: frame.airDetected, airRaw: frame.airRaw, rms: frame.rms };
    });
    expect(r.airRaw).toBe(false);
    expect(r.airDetected).toBe(false);
  });

  test("SH ladder cur advances on airDetected without manualSound", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const Modes = window.VTPracticeModes;
      if (!Modes?.get) return { skip: true };
      const mode = Modes.get("shAirLadder");
      const host = document.createElement("div");
      document.body.appendChild(host);
      mode.mount(host, { rungs: [5, 10], mode: "shAirLadder" });
      mode.onStart?.();
      for (let i = 0; i < 30; i++) {
        mode.onFrame({
          rms: 0.03,
          voiceFreq: 180, // old gate would reject
          dtMs: 16,
          airDetected: true,
          manualSound: false,
          airRmsThreshold: 0.01
        });
      }
      const cur = mode.state.cur;
      mode.unmount?.();
      host.remove();
      return { cur, skip: false };
    });
    if (r.skip) {
      test.skip();
      return;
    }
    expect(r.cur).toBeGreaterThan(0.35);
  });

  test("silence / low rms alone does not start SH count", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const Modes = window.VTPracticeModes;
      const mode = Modes.get("shAirLadder");
      const host = document.createElement("div");
      document.body.appendChild(host);
      mode.mount(host, { rungs: [5, 10], mode: "shAirLadder" });
      mode.onStart?.();
      // Ambient-like frames: modest rms, no airDetected, no Space
      for (let i = 0; i < 40; i++) {
        mode.onFrame({
          rms: 0.012,
          voiceFreq: null,
          dtMs: 16,
          airDetected: false,
          manualSound: false,
          airRmsThreshold: 0.01
        });
      }
      const silentCur = mode.state.cur;
      // Onset gate: first 4 positive frames must not count yet
      for (let i = 0; i < 4; i++) {
        mode.onFrame({
          rms: 0.05,
          dtMs: 16,
          airDetected: true,
          manualSound: false
        });
      }
      const beforeLatch = mode.state.cur;
      // 5th+ latch
      for (let i = 0; i < 10; i++) {
        mode.onFrame({
          rms: 0.05,
          dtMs: 16,
          airDetected: true,
          manualSound: false
        });
      }
      const afterLatch = mode.state.cur;
      mode.unmount?.();
      host.remove();
      return { silentCur, beforeLatch, afterLatch };
    });
    expect(r.silentCur).toBe(0);
    expect(r.beforeLatch).toBe(0);
    expect(r.afterLatch).toBeGreaterThan(0.1);
  });

  test("air grace keeps airDetected after brief dropout", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const eng = new VTPracticeEngine();
      eng.sensitivity = 7;
      eng.running = true;
      let phase = "hf";
      eng.buf = new Float32Array(2048);
      eng.analyser = {
        getFloatTimeDomainData(buf) {
          if (phase === "hf") {
            for (let i = 0; i < buf.length; i++) {
              buf[i] = (i % 2 === 0 ? 1 : -1) * 0.05;
            }
          } else {
            for (let i = 0; i < buf.length; i++) buf[i] = 0;
          }
        }
      };
      eng.audioCtx = { sampleRate: 48000 };
      eng._detectPitch = () => null;
      const frames = [];
      eng.onFrame = (f) => frames.push({ air: f.airDetected, raw: f.airRaw });
      eng._loop();
      eng.running = false;
      if (eng.raf) cancelAnimationFrame(eng.raf);
      const during = frames[frames.length - 1];
      // Silence immediately after — still inside grace
      phase = "silent";
      frames.length = 0;
      eng.running = true;
      eng._loop();
      eng.running = false;
      if (eng.raf) cancelAnimationFrame(eng.raf);
      const after = frames[frames.length - 1];
      return {
        during,
        after,
        graceMs: eng._airGraceMs()
      };
    });
    expect(r.during.air).toBe(true);
    expect(r.during.raw).toBe(true);
    expect(r.after.raw).toBe(false);
    expect(r.after.air).toBe(true); // grace keeps detected
    expect(r.graceMs).toBeGreaterThanOrEqual(600);
  });

  test("mode keeps cur across brief air miss (hysteresis)", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const Modes = window.VTPracticeModes;
      if (!Modes?.get) return { skip: true };
      const mode = Modes.get("shAirLadder");
      const host = document.createElement("div");
      document.body.appendChild(host);
      mode.mount(host, { rungs: [30], mode: "shAirLadder" });
      mode.onStart?.();
      for (let i = 0; i < 20; i++) {
        mode.onFrame({
          rms: 0.02,
          dtMs: 16,
          airDetected: true,
          manualSound: false,
          airRmsThreshold: 0.01
        });
      }
      const mid = mode.state.cur;
      // miss frames — hysteresis should keep counting briefly
      for (let i = 0; i < 8; i++) {
        mode.onFrame({
          rms: 0.001,
          dtMs: 16,
          airDetected: false,
          manualSound: false,
          airRmsThreshold: 0.01
        });
      }
      const after = mode.state.cur;
      mode.unmount?.();
      host.remove();
      return { mid, after, skip: false };
    });
    if (r.skip) {
      test.skip();
      return;
    }
    expect(r.mid).toBeGreaterThan(0.15);
    expect(r.after).toBeGreaterThan(r.mid);
  });
});
