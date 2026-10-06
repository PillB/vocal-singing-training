/**
 * Exercises whose mode picks its own notes (profile.ownsTarget: the zone
 * drills s21–s25, the five vowels s20, the lip-trill solfège s27, the hummed
 * targets s7…). The mode is the one source of the note: what the piano
 * sounds, what the highway and the readout name and what the mode waits for
 * must stay the same note when the octave moves during a take.
 *
 * Live runs use the synthetic singer (qa/synthetic-voice.js), which sings
 * whatever note the app is targeting, as a learner following the piano would.
 */
const { test, expect } = require("@playwright/test");
const { useVoice, playVoice, stopVoice } = require("./helpers/voice");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page, { auto = false } = {}) {
  await page.addInitScript((a) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      sessionStorage.setItem("vt_e2e", "1");
      // Every take starts at the written octave
      localStorage.setItem("vt_octave_shift", "0");
      localStorage.setItem("vt_range_auto", a ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, auto);
  await useVoice(page);
  await page.goto(BASE + "/?e2e", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
}

/** Open an exercise, press Start, and wait until the mode has its first note. */
async function openAndStart(page, id) {
  await page.evaluate((x) => window.VTApp.openExercise(x), id);
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  await page.locator("#btn-practice-start").click();
  await page.waitForFunction(() => {
    const st = window.VTApp.getState();
    return st.practiceLive && !!st.modeInstance?.state?.wantName;
  });
}

/** The note the mode waits for against the one the engine and highway target. */
function targets(page) {
  return page.evaluate(() => {
    const st = window.VTApp.getState();
    const ms = st.modeInstance.state;
    const midi = (f) => (f ? Math.round(69 + 12 * Math.log2(f / 440)) : null);
    return {
      shift: st.octaveShift,
      mode: midi(ms.wantFreq),
      engine: midi(st.practice.targetFreq),
      viz: midi(st.pitchViz?.targetFreq),
      held: ms.held,
      step: (ms.i || 0) + (ms.patterns || 0) * (ms.pattern?.length || 0)
    };
  });
}

/** Log every note the piano reference plays from now on. */
function spyPiano(page) {
  return page.evaluate(() => {
    window.__refPlayed = [];
    const P = window.VTPiano;
    if (P.__spied) return;
    P.__spied = true;
    const orig = P.playRefPitch.bind(P);
    P.playRefPitch = (note, sec, sustain) => {
      window.__refPlayed.push({ note, sec });
      return orig(note, sec, sustain);
    };
  });
}

const played = (page) => page.evaluate(() => window.__refPlayed.map((p) => p.note));

/**
 * Open the piano panel and wait until `sel` has stopped moving. The panel
 * opens with a max-height transition and a smooth scroll, and Playwright
 * checks only the first event of a click against the target: a press that
 * lands while the control slides under the pointer is a mousedown on it and
 * a mouseup beside it, which fires no click on it.
 */
async function openPianoPanel(page, sel) {
  await page.locator("#btn-toggle-piano").click();
  await expect(page.locator("#piano-block")).toHaveClass(/is-open/);
  await page.evaluate(
    (s) =>
      new Promise((resolve) => {
        const el = document.querySelector(s);
        let last = "";
        let since = 0;
        let frames = 0;
        const tick = (now) => {
          const r = el.getBoundingClientRect();
          const box = `${r.x},${r.y},${r.width},${r.height}`;
          if (box !== last) {
            last = box;
            since = now;
            frames = 0;
          } else frames++;
          // Still for a few frames and longer than the 0.25 s transition
          if (frames >= 5 && now - since >= 300) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    sel
  );
}

/** What the highway shows: its ghost lanes and any chord lanes. */
function highway(page) {
  return page.evaluate(() => {
    const v = window.VTGetPitchViz?.();
    return {
      lanes: (v?.progressionLanes || []).map((l) => l.name),
      chordLanes: (v?.chordLanes || []).map((l) => l.name)
    };
  });
}

/**
 * Every 40 ms from now on: the note on the mode's card against the one the
 * pitch readout calls the target ("Objetivo …").
 */
function logReadout(page) {
  return page.evaluate(() => {
    window.__readout = [];
    window.__readoutTimer = setInterval(() => {
      const m = /Objetivo\s+(\S+)/.exec(document.querySelector("#pitch-stats")?.innerText || "");
      window.__readout.push({
        note: document.querySelector("#mode-hud [data-note]")?.textContent,
        target: m ? m[1] : null
      });
    }, 40);
  });
}

/** The targets the readout named while the card showed `note`. */
async function readoutWhile(page, note) {
  const log = await page.evaluate(() => {
    clearInterval(window.__readoutTimer);
    return window.__readout;
  });
  return log.filter((r) => r.note === note).map((r) => r.target);
}

test.describe("modes that own their target", () => {
  test("zone drill: an octave change mid-take moves the mode's note with the piano and the engine", async ({ page }) => {
    test.setTimeout(60_000);
    await boot(page);
    await openAndStart(page, "s21-chest-resonance");
    const before = await targets(page);
    expect(before.mode, "the first zone note is C3").toBe(48);
    await spyPiano(page);
    // The learner presses the octave + in the bottom rail during the take
    await page.locator("#btn-oct-up").click();
    await expect.poll(async () => (await targets(page)).shift).toBe(1);
    await page.waitForTimeout(700);
    // The new note sounds once: two copies a few ms apart ring louder and
    // put more piano into the mic
    expect(await played(page), "C4, once").toEqual(["C4"]);
    // …and the learner sings the note the piano now plays
    await playVoice(page, "follow");
    await page.waitForTimeout(400);
    const after = await targets(page);
    expect(after.mode, "the mode waits for the note an octave up").toBe(60);
    expect(after.engine, "the same note the engine targets").toBe(after.mode);
    await page.waitForFunction(() => (window.VTApp.getState().modeInstance.state.held || 0) >= 1, null, { timeout: 15_000 });
    await stopVoice(page);
    await page.locator("#btn-practice-stop").click();
  });

  test("lip-trill solfège: an octave change mid-take moves the step, the lanes and the readout", async ({ page }) => {
    test.setTimeout(60_000);
    await boot(page);
    await openAndStart(page, "s27-lip-trill-solfege");
    expect((await targets(page)).mode).toBe(48);
    await spyPiano(page);
    await page.locator("#btn-oct-up").click();
    await expect.poll(async () => (await targets(page)).shift).toBe(1);
    await page.waitForTimeout(700);
    const after = await targets(page);
    expect(after.mode, "step 1 is C4 now").toBe(60);
    expect(after.engine).toBe(60);
    expect(after.viz, "the highway's target too").toBe(60);
    expect(await page.locator("#mode-hud [data-note]").textContent()).toBe("C4");
    const hw = await highway(page);
    expect(hw.lanes, "the lanes move with the octave").toEqual(["C4", "D4", "E4", "F4", "G4"]);
    // No default progression's chord: the readout would score against it
    expect(hw.chordLanes).toEqual([]);
    expect(await played(page), "C4, once").toEqual(["C4"]);
    // Singing the note the piano plays walks the scale, and the readout
    // names the step's note as it goes
    await logReadout(page);
    await playVoice(page, "trill");
    await page.waitForFunction(() => (window.VTApp.getState().modeInstance.state.i || 0) >= 3, null, { timeout: 15_000 });
    const atD4 = await readoutWhile(page, "D4");
    expect(atD4, "the readout's target while the step is D4").toContain("D4");
    expect(atD4, "not a note of the default progression").not.toContain("E4");
    expect((await highway(page)).chordLanes).toEqual([]);
    await stopVoice(page);
    await page.locator("#btn-practice-stop").click();
  });

  test("lip-trill solfège with 'A mi voz': the automatic octave change keeps the scale walking", async ({ page }) => {
    test.setTimeout(60_000);
    await boot(page, { auto: true });
    await page.evaluate(() => {
      // A voice that lives an octave above the written C3: a short glide down,
      // then a steady C4
      window.__VTVoice.define("highVoice", (h) => {
        h.vibrato(8);
        h.trillOn(0.85);
        h.setPitch(370, 0.01);
        h.voiceOn(0.3, 0.08);
        h.at(100, () => h.setPitch(261.63, 1.2));
        // Once the octave has moved, follow the target like the learner would
        const wait = h.every(50, () => {
          if (window.VTApp.getState().octaveShift !== 1) return;
          clearInterval(wait);
          h.startFollow(15);
        });
      });
    });
    await openAndStart(page, "s27-lip-trill-solfege");
    await spyPiano(page);
    await logReadout(page);
    await playVoice(page, "highVoice");
    await expect.poll(async () => (await targets(page)).shift, { timeout: 15_000 }).toBe(1);
    await page.waitForTimeout(300);
    const after = await targets(page);
    expect(after.mode, "the mode moved with the octave").toBe(after.engine);
    // The app's piano hot-apply runs after the mode has moved: it must not
    // put the default progression's lanes and chord back
    const hw = await highway(page);
    expect(hw.lanes, "the ladder at the new octave").toEqual(["C4", "D4", "E4", "F4", "G4"]);
    expect(hw.chordLanes).toEqual([]);
    expect((await played(page)).filter((n) => n === "C4"), "C4, once").toHaveLength(1);
    await page.waitForFunction(() => (window.VTApp.getState().modeInstance.state.i || 0) >= 3, null, { timeout: 15_000 });
    const atD4 = await readoutWhile(page, "D4");
    expect(atD4, "the readout's target while the step is D4").toContain("D4");
    expect(atD4, "not a note of the default progression").not.toContain("E4");
    await stopVoice(page);
    await page.locator("#btn-practice-stop").click();
  });

  test("lip-trill solfège with Auto piano off: an octave change sounds the step's new note once, from the mode", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.VTApp.openExercise("s27-lip-trill-solfege"));
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await page.evaluate(() => {
      document.getElementById("chk-auto-piano").checked = false;
    });
    await page.locator("#btn-practice-start").click();
    await page.waitForFunction(() => window.VTApp.getState().practiceLive);
    // At step 3 (E3), as singing would
    await page.evaluate(() => {
      const m = window.VTApp.getState().modeInstance;
      m.state.i = 2;
      m._pushTarget();
    });
    await spyPiano(page);
    await page.locator("#btn-oct-up").click();
    await expect.poll(async () => (await targets(page)).mode).toBe(64);
    await page.waitForTimeout(500);
    const after = await targets(page);
    expect(after.engine, "the engine follows the mode, not the shifted generic C3").toBe(64);
    expect(after.viz).toBe(64);
    // The app plays nothing with Auto piano off, so the mode cues its note
    expect(await played(page)).toEqual(["E4"]);
    expect(await page.locator("#mode-hud [data-note]").textContent()).toBe("E4");
    await expect(page.locator("#pitch-stats")).toContainText("Objetivo E4");
    // The row of stones is labelled with the root it is sung at now (C4)
    expect(await page.evaluate(() => window.VTApp.getState().modeInstance.state.rows.at(-1).rootName)).toBe("Do4");
    await page.locator("#btn-practice-stop").click();
  });

  test("lip-trill solfège: the piano panel's Sostener leaves the mode's lanes alone", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s27-lip-trill-solfege");
    await openPianoPanel(page, "#chk-sustain");
    const before = await highway(page);
    expect(before.lanes).toEqual(["C3", "D3", "E3", "F3", "G3"]);
    const sustain = page.locator("#chk-sustain");
    const was = await sustain.isChecked();
    await sustain.click();
    await expect(sustain, "the click reached Sostener").toBeChecked({ checked: !was });
    await page.evaluate(() => window.VTApp._hotApplyPromise);
    await page.waitForTimeout(300);
    const after = await highway(page);
    expect(after.lanes, "the mode's ladder, not the default progression's").toEqual(before.lanes);
    expect(after.chordLanes).toEqual([]);
    const t = await targets(page);
    expect(t.viz, "the highway still targets the step").toBe(t.mode);
    await page.locator("#btn-practice-stop").click();
  });

  test("the piano panel offers no chord progression to play over a mode that walks its own notes", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s27-lip-trill-solfege");
    await openPianoPanel(page, "#btn-stop-piano");
    // "Reproducir una vez" and "Bucle" played the default progression: its
    // lanes, chord and target replaced the mode's for the rest of the take
    await expect(page.locator("#btn-play-prog")).toBeHidden();
    await expect(page.locator("#btn-loop-prog")).toBeHidden();
    // The mode's own note is still a tap away, and the piano can be stopped
    await expect(page.locator("#btn-ref-pitch")).toBeVisible();
    await expect(page.locator("#btn-stop-piano")).toBeVisible();
    expect((await highway(page)).lanes).toEqual(["C3", "D3", "E3", "F3", "G3"]);
    const t = await targets(page);
    expect(t.engine).toBe(t.mode);
    expect(t.viz).toBe(t.mode);
    await page.locator("#btn-practice-stop").click();
    // The progression chips and their description go with the two buttons: a
    // chip toasted "Opciones aplicadas · <progression>" and played nothing
    const hidden = (id) =>
      page.evaluate((x) => {
        window.VTApp.openExercise(x);
        return ["#btn-play-prog", "#btn-loop-prog", "#prog-buttons", "#chord-desc"].map(
          (s) => document.querySelector(s).hidden
        );
      }, id);
    // The zone drills, the hummed targets, the siren and the scale walks pick
    // their notes too
    for (const id of [
      "s21-chest-resonance",
      "s7-humming",
      "s5-sirens",
      "s10-five-note",
      "s16-major-scale-coord"
    ]) {
      expect(await hidden(id), id).toEqual([true, true, true, true]);
    }
    // Exercises sung over chords still list their progressions and play them
    for (const id of ["s2-solfege-chords", "s13-arpeggio-match"]) {
      expect(await hidden(id), id).toEqual([false, false, false, false]);
      expect(await page.locator("#prog-buttons .prog-btn").count(), id).toBeGreaterThan(0);
    }
  });

  for (const c of [
    // s27 at step 3 (E3); its generic reference is C3
    { id: "s27-lip-trill-solfege", walk: "i", to: 2, want: "E3" },
    // s21 at its second target (B2); its generic reference is A2
    { id: "s21-chest-resonance", walk: "ni", to: 1, want: "B2" }
  ]) {
    test(`${c.id}: "Nota de referencia" mid-take sounds the mode's note and leaves its target`, async ({ page }) => {
      await boot(page);
      await openAndStart(page, c.id);
      // Walk the mode to a later note, as singing would
      await page.evaluate(({ key, to }) => {
        const m = window.VTApp.getState().modeInstance;
        m.state[key] = to;
        m._pushTarget();
      }, { key: c.walk, to: c.to });
      const before = await targets(page);
      expect(before.engine).toBe(before.mode);
      await page.evaluate(() => {
        window.__refPlayed = [];
        const P = window.VTPiano;
        const orig = P.playRefPitch.bind(P);
        P.playRefPitch = (note, sec, sustain) => {
          window.__refPlayed.push({ note, sec });
          return orig(note, sec, sustain);
        };
      });
      await openPianoPanel(page, "#btn-ref-pitch");
      await page.locator("#btn-ref-pitch").click();
      await expect.poll(() => page.evaluate(() => window.__refPlayed.length)).toBeGreaterThan(0);
      const played = await page.evaluate(() => window.__refPlayed[0]);
      expect(played.note, "the note the mode is waiting for").toBe(c.want);
      // A long piano note at the right pitch would be heard as the singer
      expect(played.sec).toBeLessThanOrEqual(1.5);
      const after = await targets(page);
      expect(after.mode, "the mode still waits for the same note").toBe(before.mode);
      expect(after.engine, "and the engine targets it").toBe(before.mode);
      if (after.viz != null) expect(after.viz, "and so does the highway").toBe(before.mode);
      await page.locator("#btn-practice-stop").click();
    });
  }

  test("a piano that will not wake replays the mode's note at Start, not the generic reference", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.VTApp.openExercise("s21-chest-resonance"));
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    // The audio context stays suspended whatever the app does, so Start takes
    // its hard-recover path and replays the reference once more
    await page.evaluate(async () => {
      const P = window.VTPiano;
      await P.ensure();
      P.ctx.resume = async () => {};
      await P.ctx.suspend();
      P.unlock = async () => {};
      window.__refPlayed = [];
      const orig = P.playRefPitch.bind(P);
      P.playRefPitch = (note, sec, sustain) => {
        window.__refPlayed.push({ note, sec });
        return orig(note, sec, sustain);
      };
    });
    await page.locator("#btn-practice-start").click();
    await expect.poll(() => page.evaluate(() => window.__refPlayed.length)).toBeGreaterThan(2);
    const played = await page.evaluate(() => window.__refPlayed);
    // s21 waits for C3 first; its generic reference is A2
    expect(played.map((p) => p.note).filter((n) => n !== "C3"), "only the mode's note sounds").toEqual([]);
    expect(Math.max(...played.map((p) => p.sec))).toBeLessThanOrEqual(1.5);
  });

  test("before Start, the readout names no target for a mode that picks its own", async ({ page }) => {
    await boot(page);
    const stats = page.locator("#pitch-stats");
    // s7's generic reference is D3, but the mode's first note is C3 ("Do3")
    await page.evaluate(() => window.VTApp.openExercise("s7-humming"));
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await expect(stats).toBeVisible();
    await expect(stats).toContainText("Objetivo —");
    await expect(stats).not.toContainText("D3");
    // Once the take starts, the mode's own note is the target
    await page.locator("#btn-practice-start").click();
    await expect(stats).toContainText("Objetivo C3", { timeout: 6000 });
    await page.locator("#btn-practice-stop").click();
    // A siren has no note to hit: the readout names the nearest note once you
    // sing, and nothing before
    await page.evaluate(() => window.VTApp.openExercise("s5-sirens"));
    await expect(stats).toContainText("Nota —");
    await expect(stats).not.toContainText("Objetivo");
    await expect(stats).not.toContainText("G2");
  });

  test("a siren names no note until it hears one, also after an octave change mid-take", async ({ page }) => {
    await boot(page);
    const stats = page.locator("#pitch-stats");
    await page.evaluate(() => window.VTApp.openExercise("s5-sirens"));
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await page.locator("#btn-practice-start").click();
    await page.waitForFunction(() => window.VTApp.getState().pitchRunning);
    // Nothing sung yet: the siren's G2 reference is not a note anybody is on
    await page.waitForTimeout(800);
    await expect(stats).toContainText("Nota —");
    await expect(stats).not.toContainText("G2");
    // The octave buttons move the reference (G3), not what the readout names
    await page.locator("#btn-oct-up").click();
    await page.waitForTimeout(800);
    await expect(stats).toContainText("Nota —");
    await expect(stats).not.toContainText(/G2|G3/);
    // Once a voice is heard, the readout names the note it is on
    await playVoice(page, "siren");
    await expect(stats).toContainText(/Nota [A-G]#?\d/, { timeout: 6000 });
    await stopVoice(page);
    await page.locator("#btn-practice-stop").click();
  });

  test("five vowels: an octave change mid-take moves the note the vowels are read against", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s20-five-vowels");
    const midi = () =>
      page.evaluate(() => {
        const ms = window.VTApp.getState().modeInstance.state;
        return Math.round(ms.targetMidi);
      });
    expect(await midi()).toBe(50); // D3
    await page.locator("#btn-oct-up").click();
    await expect.poll(midi, { message: "the vowels are read against D4 now" }).toBe(62);
    await page.locator("#btn-practice-stop").click();
  });
});
