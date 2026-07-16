/**
 * Adaptive vocal range — octave shift helpers + plateau detector.
 * RCA: silence must NOT trigger shift; directed attempt + plateau must.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.VT_BASE || "http://127.0.0.1:8765";

async function boot(page) {
  await page.goto(BASE + "/?t=" + Date.now(), { waitUntil: "networkidle" });
  await page.waitForFunction(() => {
    return (
      typeof window.VTRangeAdapter === "function" &&
      typeof window.VTShiftNoteName === "function" &&
      typeof window.VTTransposeProgression === "function" &&
      window.VT_NOTE_FREQ?.C3
    );
  });
}

test.describe("Range adapter & octave helpers", () => {
  test("NOTE_FREQ covers shifted octaves C1–C6", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const m = window.VT_NOTE_FREQ;
      return {
        c2: m.C2,
        c3: m.C3,
        c4: m.C4,
        c5: m.C5,
        a4: m.A4,
        eb3: m.Eb3,
        bb2: m.Bb2,
        ratio: m.C4 / m.C3
      };
    });
    expect(r.c2).toBeGreaterThan(60);
    expect(r.c3).toBeGreaterThan(120);
    expect(r.c4).toBeGreaterThan(250);
    expect(r.c5).toBeGreaterThan(500);
    expect(r.a4).toBeCloseTo(440, 0);
    expect(r.eb3).toBeTruthy();
    expect(r.bb2).toBeTruthy();
    expect(r.ratio).toBeCloseTo(2, 1);
  });

  test("shiftNoteName and transposeProgression move material ±1 oct", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const s = window.VTShiftNoteName;
      const t = window.VTTransposeProgression;
      const base = window.VT_PROGRESSIONS.prog1;
      const up = t(base, 1);
      const down = t(base, -1);
      return {
        c3to4: s("C3", 1),
        a2to1: s("A2", -1),
        eb: s("Eb3", 1),
        baseFirst: base.chords[0].notes[0],
        upFirst: up.chords[0].notes[0],
        downFirst: down.chords[0].notes[0],
        upFreq: window.VT_NOTE_FREQ[up.chords[0].notes[0]],
        baseFreq: window.VT_NOTE_FREQ[base.chords[0].notes[0]]
      };
    });
    expect(r.c3to4).toBe("C4");
    expect(r.a2to1).toBe("A1");
    expect(r.eb).toBe("Eb4");
    expect(r.upFirst).not.toBe(r.baseFirst);
    expect(r.upFreq / r.baseFreq).toBeCloseTo(2, 1);
    expect(r.downFirst).toMatch(/1$/); // C2 base → C1 when −1
  });

  test("playProgression with octaveShift=+1 uses higher freqs", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => {
      const P = window.VTPiano;
      await P.unlock();
      const prog = await P.playProgression("prog1", {
        loop: false,
        sustain: true,
        sustainSec: 2,
        octaveShift: 1
      });
      await new Promise((res) => setTimeout(res, 150));
      return {
        firstNote: prog?.chords?.[0]?.notes?.[0],
        peak: P.outputPeak(),
        playing: P.playing?.length || 0,
        ctx: P.ctx?.state
      };
    });
    expect(r.ctx).toBe("running");
    expect(r.playing).toBeGreaterThan(0);
    expect(r.peak).toBeGreaterThan(0.005);
    // prog1 C chord starts C2 → +1 → C3
    expect(r.firstNote).toBe("C3");
  });

  test("silence / no attempt does NOT auto-shift", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const A = new window.VTRangeAdapter({ auto: true, octaveShift: 0 });
      // silence frames
      for (let i = 0; i < 40; i++) {
        A.feed({
          voiceFreq: null,
          targetFreq: 440,
          rms: 0.001,
          voiced: false,
          holdSolid: false
        });
      }
      // voiced but no motion, close enough (not a miss)
      for (let i = 0; i < 40; i++) {
        A.feed({
          voiceFreq: 220,
          targetFreq: 220,
          rms: 0.05,
          voiced: true,
          holdSolid: true
        });
      }
      return A.getSnapshot();
    });
    expect(r.octaveShift).toBe(0);
  });

  test("plateau below high target after climb → shift down", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const A = new window.VTRangeAdapter({ auto: true, octaveShift: 0 });
      const target = 440; // A4 — high
      // Use a synthetic timeline so cooldown / history windows are deterministic
      const t0 = 20_000;
      // Simulate climbing toward A4 but stalling around ~E4 (~330Hz)
      const samples = [];
      // climb from 220 → 330 over ~1.2s
      for (let i = 0; i < 30; i++) {
        const f = 220 + (i / 29) * 110;
        samples.push({
          t: t0 + i * 40,
          voiceFreq: f,
          targetFreq: target,
          rms: 0.04,
          voiced: true,
          holdSolid: true
        });
      }
      // plateau ~330 for ~1.2s
      for (let i = 0; i < 35; i++) {
        samples.push({
          t: t0 + 30 * 40 + i * 40,
          voiceFreq: 328 + (i % 3) * 0.8,
          targetFreq: target,
          rms: 0.045,
          voiced: true,
          holdSolid: true
        });
      }
      // Feed with controlled timestamps by patching performance via hist injection
      // Use real feed with small delays is hard in sync — inject hist then force
      let decision = null;
      // Override feed timing: push via direct hist + call internals isn't exported
      // Instead: monkey-patch performance.now sequence
      let fakeNow = t0;
      const realNow = performance.now.bind(performance);
      performance.now = () => fakeNow;
      try {
        for (const s of samples) {
          fakeNow = s.t;
          const d = A.feed({
            voiceFreq: s.voiceFreq,
            targetFreq: s.targetFreq,
            rms: s.rms,
            voiced: s.voiced,
            holdSolid: s.holdSolid
          });
          if (d) decision = d;
        }
      } finally {
        performance.now = realNow;
      }
      return {
        decision,
        shift: A.octaveShift,
        side: decision?.side
      };
    });
    expect(r.shift).toBe(-1);
    expect(r.side).toBe("high");
    expect(r.decision?.reason).toMatch(/high/);
  });

  test("plateau above low target after descent → shift up", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const A = new window.VTRangeAdapter({ auto: true, octaveShift: 0 });
      const target = 65.41; // C2 — low
      const t0 = 20_000;
      const samples = [];
      // descend from 180 → 110
      for (let i = 0; i < 30; i++) {
        samples.push({
          t: t0 + i * 40,
          voiceFreq: 180 - (i / 29) * 70,
          targetFreq: target,
          rms: 0.04,
          voiced: true,
          holdSolid: true
        });
      }
      // plateau ~110 (still far above C2)
      for (let i = 0; i < 35; i++) {
        samples.push({
          t: t0 + 30 * 40 + i * 40,
          voiceFreq: 109 + (i % 3) * 0.5,
          targetFreq: target,
          rms: 0.04,
          voiced: true,
          holdSolid: true
        });
      }
      let decision = null;
      let fakeNow = t0;
      const realNow = performance.now.bind(performance);
      performance.now = () => fakeNow;
      try {
        for (const s of samples) {
          fakeNow = s.t;
          const d = A.feed({
            voiceFreq: s.voiceFreq,
            targetFreq: s.targetFreq,
            rms: s.rms,
            voiced: s.voiced,
            holdSolid: s.holdSolid
          });
          if (d) decision = d;
        }
      } finally {
        performance.now = realNow;
      }
      return { decision, shift: A.octaveShift, side: decision?.side };
    });
    expect(r.shift).toBe(1);
    expect(r.side).toBe("low");
  });

  test("UI octave controls exist and applyOctaveShift updates label", async ({ page }) => {
    await boot(page);
    await page.click('.tab[data-tab="singing"]');
    await page.waitForTimeout(150);
    await page.locator("#exercise-list").getByText(/progres|solfeo|Solfège|Solfege/i).first().click();
    await page.waitForTimeout(300);
    await expect(page.locator("#oct-controls")).toBeVisible();
    await expect(page.locator("#btn-oct-up")).toBeVisible();
    await expect(page.locator("#chk-range-auto")).toBeChecked();

    await page.evaluate(() => window.VTApplyOctaveShift?.(1, { silent: true }));
    await expect(page.locator("#oct-label")).toHaveText("+1");

    const locked = await page.evaluate(() => {
      window.VTLockHighwayProg?.("prog1");
      const lanes = window.VTGetPitchViz?.()?.progressionLanes || [];
      return {
        shift: window.VTGetOctaveShift?.(),
        firstLane: lanes[0]?.name || null,
        hasC3: lanes.some((l) => l.name === "C3" || l.name === "C4")
      };
    });
    expect(locked.shift).toBe(1);
    // After +1, low roots move up (C2→C3 etc.)
    expect(locked.firstLane).toBeTruthy();
  });

  test("manual + then − returns to 0; auto toggle persists", async ({ page }) => {
    await boot(page);
    await page.click('.tab[data-tab="singing"]');
    await page.locator("#exercise-list").getByText(/progres|solfeo|Solfège|Solfege/i).first().click();
    await page.waitForTimeout(250);
    await page.click("#btn-oct-up");
    await page.waitForTimeout(80);
    await expect(page.locator("#oct-label")).toHaveText("+1");
    await page.click("#btn-oct-down");
    await page.waitForTimeout(80);
    await expect(page.locator("#oct-label")).toHaveText("0");
    await page.click("#chk-range-auto");
    await page.waitForTimeout(50);
    const auto = await page.evaluate(() => localStorage.getItem("vt_range_auto"));
    expect(auto).toBe("0");
  });
});
