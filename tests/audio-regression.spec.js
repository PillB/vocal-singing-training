/**
 * Piano audio regression — catch "silent piano" after mic / restart.
 * Asserts real non-zero signal on the master bus, not just that APIs were called.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.VT_BASE || "http://127.0.0.1:8765";

async function openSolfege(page) {
  await page.goto(BASE + "/?t=" + Date.now(), { waitUntil: "networkidle" });
  await page.click('.tab[data-tab="singing"]');
  await page.waitForTimeout(200);
  await page.locator("#exercise-list").getByText(/progres|solfeo|Solfège|Solfege/i).first().click();
  await page.waitForTimeout(400);
  await expect(page.locator("#btn-practice-start")).toBeVisible();
}

async function installFakeMic(page) {
  await page.context().grantPermissions(["microphone"]);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const dest = ctx.createMediaStreamDestination();
      const g = ctx.createGain();
      g.gain.value = 0.00001;
      osc.connect(g);
      g.connect(dest);
      osc.start();
      return dest.stream;
    };
  });
}

async function masterPeak(page) {
  return page.evaluate(async () => {
    const P = window.VTPiano;
    if (!P) return { peak: 0, error: "no VTPiano" };
    await P.ensure();
    // Wait a bit for scheduled oscillators to start
    await new Promise((r) => setTimeout(r, 180));
    const peak = typeof P.outputPeak === "function" ? P.outputPeak() : 0;
    return {
      peak,
      ctx: P.ctx?.state || "none",
      master: P.master?.gain?.value ?? null,
      loop: !!P.loopActive,
      playing: P.playing?.length ?? 0,
      live: typeof P.isLive === "function" ? P.isLive() : null
    };
  });
}

test.describe("Piano audio regression", () => {
  test("playProgression produces non-zero master signal", async ({ page }) => {
    await installFakeMic(page);
    await openSolfege(page);
    const r = await page.evaluate(async () => {
      const P = window.VTPiano;
      await P.unlock();
      await P.playProgression("prog1", {
        loop: false,
        sustain: true,
        sustainSec: 3,
        chordSec: 3,
        oneNote: false
      });
      await new Promise((res) => setTimeout(res, 200));
      return {
        peak: P.outputPeak(),
        ctx: P.ctx.state,
        playing: P.playing.length
      };
    });
    expect(r.ctx).toBe("running");
    expect(r.playing).toBeGreaterThan(0);
    expect(r.peak).toBeGreaterThan(0.01);
  });

  test("Start practice after mic still has piano signal", async ({ page }) => {
    await installFakeMic(page);
    await openSolfege(page);
    await page.evaluate(() => {
      const auto = document.querySelector("#chk-auto-piano");
      if (auto) auto.checked = true;
      const sus = document.querySelector("#chk-sustain");
      if (sus) sus.checked = true;
    });
    await page.click("#btn-practice-start");
    await page.waitForTimeout(600);
    await expect(page.locator("#btn-practice-stop")).toBeVisible();
    const r = await masterPeak(page);
    expect(r.ctx).toBe("running");
    expect(r.playing + (r.loop ? 1 : 0)).toBeGreaterThan(0);
    expect(r.peak).toBeGreaterThan(0.01);
  });

  test("Stop then Start again restores piano (no closed-context silence)", async ({ page }) => {
    await installFakeMic(page);
    await openSolfege(page);
    await page.click("#btn-practice-start");
    await page.waitForTimeout(500);
    await page.click("#btn-practice-stop");
    await page.waitForTimeout(300);
    // After stop, shared context must still be usable (not closed)
    const mid = await page.evaluate(() => ({
      ctx: window.VTPiano?.ctx?.state,
      shared: window.VTSharedAudioCtx?.state
    }));
    expect(mid.ctx).not.toBe("closed");
    if (mid.shared) expect(mid.shared).not.toBe("closed");

    await page.click("#btn-practice-start");
    await page.waitForTimeout(600);
    const r = await masterPeak(page);
    expect(r.ctx).toBe("running");
    expect(r.peak).toBeGreaterThan(0.01);
  });

  test("one-note mode still produces audio at combobox duration", async ({ page }) => {
    await installFakeMic(page);
    await openSolfege(page);
    await page.evaluate(() => {
      const one = document.querySelector("#chk-one-note");
      if (one) {
        one.checked = true;
        one.dispatchEvent(new Event("change", { bubbles: true }));
      }
      const sec = document.querySelector("#sustain-sec");
      if (sec) sec.value = "3";
      const auto = document.querySelector("#chk-auto-piano");
      if (auto) auto.checked = true;
    });
    await page.click("#btn-practice-start");
    await page.waitForTimeout(500);
    const r = await masterPeak(page);
    expect(r.ctx).toBe("running");
    expect(r.peak).toBeGreaterThan(0.01);
  });

  test("top progression dropdown hot-applies mode + chords while live", async ({ page }) => {
    await installFakeMic(page);
    await openSolfege(page);
    await expect(page.locator("#hud-prog-bar")).toBeVisible();
    await expect(page.locator("#sel-progression")).toBeVisible();
    await expect(page.locator("#sel-play-mode")).toBeVisible();
    await page.click("#btn-practice-start");
    await page.waitForTimeout(400);
    // Switch to 1 note via top Mode select
    await page.selectOption("#sel-play-mode", "oneNote");
    await page.waitForTimeout(400);
    const one = await page.evaluate(() => ({
      mode: document.querySelector("#sel-play-mode")?.value,
      one: !!document.querySelector("#chk-one-note")?.checked,
      peak: window.VTPiano?.outputPeak?.() ?? 0,
      loop: !!window.VTPiano?.loopActive
    }));
    expect(one.mode).toBe("oneNote");
    expect(one.one).toBe(true);
    expect(one.loop).toBe(true);
    expect(one.peak).toBeGreaterThan(0.01);
    // Switch progression while still live
    const vals = await page.locator("#sel-progression option").evaluateAll((os) => os.map((o) => o.value));
    const next = vals.find((v) => v !== "prog1") || vals[0];
    await page.selectOption("#sel-progression", next);
    await page.waitForTimeout(400);
    const prog = await page.evaluate(() => ({
      sel: document.querySelector("#sel-progression")?.value,
      peak: window.VTPiano?.outputPeak?.() ?? 0,
      loop: !!window.VTPiano?.loopActive
    }));
    expect(prog.sel).toBe(next);
    expect(prog.loop).toBe(true);
    expect(prog.peak).toBeGreaterThan(0.01);
    // Back to stacked chords
    await page.selectOption("#sel-play-mode", "chords");
    await page.waitForTimeout(300);
    const chords = await page.evaluate(() => ({
      one: !!document.querySelector("#chk-one-note")?.checked,
      arp: !!document.querySelector("#chk-arpeggio")?.checked,
      peak: window.VTPiano?.outputPeak?.() ?? 0
    }));
    expect(chords.one).toBe(false);
    expect(chords.arp).toBe(false);
    expect(chords.peak).toBeGreaterThan(0.01);
  });

  test("ensure() recovers after a forced closed context", async ({ page }) => {
    await installFakeMic(page);
    await openSolfege(page);
    const r = await page.evaluate(async () => {
      const P = window.VTPiano;
      await P.ensure();
      // Simulate catastrophic close (old PracticeEngine bug)
      try {
        await P.ctx.close();
      } catch {
        /* ignore */
      }
      const afterClose = P.ctx?.state;
      await P.ensure();
      await P.unlock();
      await P.playRefPitch("C3", 1.5, true);
      await new Promise((res) => setTimeout(res, 150));
      return {
        afterClose,
        ctx: P.ctx?.state,
        peak: P.outputPeak(),
        playing: P.playing?.length
      };
    });
    expect(r.afterClose).toBe("closed");
    expect(r.ctx).toBe("running");
    expect(r.playing).toBeGreaterThan(0);
    expect(r.peak).toBeGreaterThan(0.005);
  });

  /**
   * Full hot-apply matrix: mode × sustain × hold-sec × progressions.
   * Asserts UI sync, live loop, non-zero master peak, and highway range lock.
   */
  test("hot-apply matrix: all mode × sustain × sec × prog combinations", async ({ page }) => {
    test.setTimeout(180_000);
    await installFakeMic(page);
    await openSolfege(page);

    await page.evaluate(() => {
      const auto = document.querySelector("#chk-auto-piano");
      if (auto) auto.checked = true;
    });
    await page.click("#btn-practice-start");
    await page.waitForTimeout(500);
    await expect(page.locator("#btn-practice-stop")).toBeVisible();

    const allProgs = await page
      .locator("#sel-progression option")
      .evaluateAll((os) => os.map((o) => o.value));
    expect(allProgs.length).toBeGreaterThanOrEqual(3);

    // Representative set: classic + wide-jump if present, else first 4
    const progs = [
      ...new Set(
        [
          allProgs[0],
          allProgs[1],
          allProgs.find((p) => /Jump|jump|progJump/i.test(p)),
          allProgs[allProgs.length - 1]
        ].filter(Boolean)
      )
    ].slice(0, 4);

    const modes = ["chords", "arpeggio", "oneNote"];
    const secs = ["3", "4", "5"];
    const sustains = [true, false];

    const failures = [];
    let combos = 0;

    async function awaitHotApply() {
      await page.evaluate(async () => {
        const p = window.VTApp?._hotApplyPromise;
        if (p && typeof p.then === "function") await p;
        // First scheduled note is ctx.currentTime + ~0.05s
        await new Promise((r) => setTimeout(r, 120));
      });
    }

    async function snapshot(label) {
      // Multi-sample peak (catch attack / analyser buffer lag)
      return page.evaluate(async (lab) => {
        const P = window.VTPiano;
        let peak = 0;
        for (let i = 0; i < 5; i++) {
          if (typeof P.outputPeak === "function") {
            peak = Math.max(peak, P.outputPeak());
          }
          await new Promise((r) => setTimeout(r, 40));
        }
        const one = !!document.querySelector("#chk-one-note")?.checked;
        const arp = !!document.querySelector("#chk-arpeggio")?.checked;
        const sus = !!document.querySelector("#chk-sustain")?.checked;
        const sec = document.querySelector("#sustain-sec")?.value;
        const modeSel = document.querySelector("#sel-play-mode")?.value;
        const progSel = document.querySelector("#sel-progression")?.value;
        const modeFromChecks = one ? "oneNote" : arp ? "arpeggio" : "chords";
        const viz = window.VTGetPitchViz?.();
        return {
          label: lab,
          peak,
          ctx: P?.ctx?.state,
          loop: !!P?.loopActive,
          playing: P?.playing?.length ?? 0,
          one,
          arp,
          sus,
          sec,
          modeSel,
          modeFromChecks,
          progSel,
          rangeMin: viz?.rangeMinMidi ?? null,
          rangeMax: viz?.rangeMaxMidi ?? null,
          master: P?.master?.gain?.value ?? null
        };
      }, label);
    }

    async function applyCombo({ mode, sustain, sec, prog }) {
      combos++;
      const label = `${mode}|sus=${sustain}|${sec}s|${prog}`;
      // Set all controls, then one explicit hot-apply so we can await settle
      await page.evaluate(
        ({ mode: m, sustain: s, sec: sc, prog: pr }) => {
          const modeSel = document.querySelector("#sel-play-mode");
          const progSel = document.querySelector("#sel-progression");
          const one = document.querySelector("#chk-one-note");
          const arp = document.querySelector("#chk-arpeggio");
          const sus = document.querySelector("#chk-sustain");
          const secEl = document.querySelector("#sustain-sec");
          if (m === "oneNote") {
            if (one) one.checked = true;
            if (arp) arp.checked = false;
          } else if (m === "arpeggio") {
            if (one) one.checked = false;
            if (arp) arp.checked = true;
          } else {
            if (one) one.checked = false;
            if (arp) arp.checked = false;
          }
          if (modeSel) modeSel.value = m;
          if (sus) sus.checked = s;
          if (secEl) secEl.value = sc;
          if (progSel) progSel.value = pr;
        },
        { mode, sustain, sec, prog }
      );
      const okApply = await page.evaluate(async (lab) => {
        // Prefer public hot-apply if exported; else fire change on progression
        if (typeof window.VTApp?.applyPianoOptionsHot === "function") {
          return !!(await window.VTApp.applyPianoOptionsHot(lab));
        }
        const progSel = document.querySelector("#sel-progression");
        progSel?.dispatchEvent(new Event("change", { bubbles: true }));
        const p = window.VTApp?._hotApplyPromise;
        if (p) return !!(await p);
        return false;
      }, label);
      await awaitHotApply();
      const snap = await snapshot(label);

      const okMode = snap.modeSel === mode && snap.modeFromChecks === mode;
      const okProg = snap.progSel === prog;
      const okSus = snap.sus === sustain;
      const okSec = snap.sec === sec;
      const okCtx = snap.ctx === "running";
      const okLoop = snap.loop === true;
      const okVoices = snap.playing > 0 || snap.loop;
      // Monophonic is quieter; multi-sample + lower floor for 1-nota
      const peakFloor = mode === "oneNote" ? 0.004 : 0.008;
      const okPeak = snap.peak > peakFloor;
      const okRange =
        snap.rangeMin == null ||
        snap.rangeMax == null ||
        (Number.isFinite(snap.rangeMin) &&
          Number.isFinite(snap.rangeMax) &&
          snap.rangeMax > snap.rangeMin);
      const okMaster = snap.master == null || snap.master >= 0.2;
      const okHot = okApply !== false;

      if (
        !okMode ||
        !okProg ||
        !okSus ||
        !okSec ||
        !okCtx ||
        !okLoop ||
        !okVoices ||
        !okPeak ||
        !okRange ||
        !okMaster ||
        !okHot
      ) {
        failures.push({
          label,
          snap,
          flags: {
            okMode,
            okProg,
            okSus,
            okSec,
            okCtx,
            okLoop,
            okVoices,
            okPeak,
            okRange,
            okMaster,
            okHot
          }
        });
      }
    }

    // Full matrix
    for (const mode of modes) {
      for (const sustain of sustains) {
        for (const sec of secs) {
          for (const prog of progs) {
            await applyCombo({ mode, sustain, sec, prog });
          }
        }
      }
    }

    // Checkbox path parity: toggle 1-nota / arpeggio checkboxes while live
    await page.evaluate(() => {
      const one = document.querySelector("#chk-one-note");
      if (one) {
        one.checked = true;
        one.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await awaitHotApply();
    let snap = await snapshot("checkbox-oneNote");
    if (snap.modeSel !== "oneNote" || snap.peak <= 0.004 || !snap.loop) {
      failures.push({ label: "checkbox-oneNote", snap, flags: { checkbox: true } });
    }

    await page.evaluate(() => {
      const arp = document.querySelector("#chk-arpeggio");
      if (arp) {
        arp.checked = true;
        arp.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await awaitHotApply();
    snap = await snapshot("checkbox-arpeggio");
    if (snap.modeSel !== "arpeggio" || snap.one !== false || snap.peak <= 0.004) {
      failures.push({ label: "checkbox-arpeggio", snap, flags: { checkbox: true } });
    }

    // Auto off stops loop; auto on restores
    await page.evaluate(() => {
      const auto = document.querySelector("#chk-auto-piano");
      if (auto) {
        auto.checked = false;
        auto.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await page.waitForTimeout(200);
    snap = await snapshot("auto-off");
    if (snap.loop === true) {
      failures.push({ label: "auto-off-should-stop-loop", snap, flags: { auto: true } });
    }

    await page.evaluate(() => {
      const auto = document.querySelector("#chk-auto-piano");
      if (auto) {
        auto.checked = true;
        auto.dispatchEvent(new Event("change", { bubbles: true }));
      }
    });
    await awaitHotApply();
    snap = await snapshot("auto-on");
    if (!snap.loop || snap.peak <= 0.004) {
      failures.push({ label: "auto-on-should-resume", snap, flags: { auto: true } });
    }

    // Still live after the whole matrix
    await expect(page.locator("#btn-practice-stop")).toBeVisible();

    if (failures.length) {
      const summary = failures
        .slice(0, 12)
        .map((f) => `${f.label} → ${JSON.stringify(f.flags)} peak=${f.snap?.peak} ctx=${f.snap?.ctx}`)
        .join("\n");
      throw new Error(
        `Hot-apply matrix: ${failures.length}/${combos + 4} failed\n${summary}${
          failures.length > 12 ? `\n…+${failures.length - 12} more` : ""
        }`
      );
    }

    expect(combos).toBe(modes.length * sustains.length * secs.length * progs.length);
    expect(combos).toBeGreaterThanOrEqual(36); // 3×2×3×≥2
  });
});
