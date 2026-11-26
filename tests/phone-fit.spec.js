/**
 * Phone fit: what a person can reach and see at the page sizes real phones give
 * a web page (docs/57-PHONE-FIT.md). The sizes are from Playwright's device
 * registry: the page inside the browser's bars, not the screen.
 *
 *  - stage-relief: during a take Detener stays on the page. In the song
 *    exercise, in Spanish, on an iPhone mini (375x629) the top rail gains a row
 *    at Empezar; the stage grew 33 px past the page and took Detener with it.
 *    The coach strip's cue now gives its lines up for the take, and comes back.
 *    Whether a rail gains that row depends on how wide the font draws the
 *    words, so the tests that carry the regression build the case for the font
 *    they run with (tightestPage) and the tests at the phones' own sizes judge
 *    the outcome only.
 *  - landscape-beside: on a phone on its side a picture starts beside the
 *    status corner instead of under it, so it is whole. It was cut by 9 to
 *    47 px in 15 exercises on pages 293 to 327 px high.
 *
 * Each test says which wrong behaviour it is there to catch. qa/mutate.mjs (set
 * "phones") plants those defects and expects this file to turn red.
 */
const { test, expect } = require("@playwright/test");
const { boot } = require("./helpers/e2e");

const SONG = "s3-song-stanzas";

/** The page with the app ready and nothing over it. */
async function ready(page, lang = "es") {
  await boot(page, { lang });
  await page.waitForFunction(() => !!window.VTApp && !!window.VTLoop && !!window.VTSession);
}

/**
 * A page in a context of its own, for one take: a take leaves a recording, a rating card and a clock
 * behind. Not a second page of one context: boot() asks for the microphone permission, which WebKit
 * does not know by that name, and a context that was asked refuses to open another page.
 */
async function freshPage(browser, { width, height }) {
  const context = await browser.newContext({ viewport: { width, height }, hasTouch: true });
  return context.newPage();
}

/** Every exercise with what its stage shows: lanes (a pitch exercise) or a panel. */
function catalogue(page) {
  return page.evaluate(() =>
    [...(window.VT_EXERCISES.vocal || []), ...(window.VT_EXERCISES.singing || [])].map((e) => {
      const p = window.VTApp.getProfile(e) || {};
      return { id: e.id, pitch: !!p.showPitch, takes: p.mode !== "weekPlan" };
    })
  );
}

/**
 * The app fits the stage on the frame after a change and once more 60 ms later
 * (enterLivePractice), and its observers answer on the next frame. Two frames
 * and 200 ms cover both; the facts below are read after that, never during.
 */
function settle(page) {
  return page.evaluate(
    () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 200))))
  );
}

async function open(page, id) {
  await page.evaluate((x) => window.VTApp.openExercise(x), id);
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  await settle(page);
}

/** Press Empezar where it is, as a thumb would: a click that had to scroll first is a different journey. */
async function startTake(page) {
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => !!window.VTApp.getState().practiceLive), { timeout: 12000 }).toBe(true);
  await settle(page);
}

async function stopTake(page) {
  await page.locator("#btn-practice-stop").click();
  await expect.poll(() => page.evaluate(() => !!window.VTApp.getState().practiceLive), { timeout: 12000 }).toBe(false);
  await settle(page);
}

/** What is where on the stage, in page px. Read in one go so the numbers belong to one layout. */
function facts(page) {
  return page.evaluate(() => {
    const shown = (el) => {
      if (!el || el.closest("[hidden]")) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return cs.display !== "none" && cs.visibility !== "hidden" && r.width > 0 && r.height > 0;
    };
    const box = (el) => {
      if (!shown(el)) return null;
      const r = el.getBoundingClientRect();
      return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width, h: r.height };
    };
    /** True when a tap at the element's centre lands on it: on the page and under nothing. */
    const tappable = (el) => {
      const b = box(el);
      if (!b) return false;
      const x = (b.left + b.right) / 2;
      const y = (b.top + b.bottom) / 2;
      if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
      const top = document.elementFromPoint(x, y);
      return !!top && el.contains(top);
    };
    const over = (a, b) =>
      a && b ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : 0;
    const stage = document.getElementById("highway-stage");
    const live = !!window.VTApp.getState().practiceLive;
    const button = document.getElementById(live ? "btn-practice-stop" : "btn-practice-start");
    const cue = document.getElementById("mode-cue");
    const wrap = document.getElementById("mode-focus-panel");
    const panel = shown(wrap) ? wrap.querySelector(".mode-panel") : null;
    const corner = document.querySelector("#hud-top-rail > .hud-tl");
    const rail = [...document.getElementById("hud-top-rail").children].filter(shown);
    const panelBox = box(panel);
    return {
      vh: innerHeight,
      scrollY: Math.round(scrollY),
      live,
      relief: stage.getAttribute("data-relief") || "",
      // Where the top rail ends, in px from the stage's top (the app's own measure, --rail-t)
      railTop: parseFloat(stage.style.getPropertyValue("--rail-t")) || 0,
      stage: box(stage),
      button: box(button),
      buttonTappable: tappable(button),
      cue: { text: (cue.textContent || "").trim(), h: box(cue)?.h || 0 },
      coachButtons: [...document.querySelectorAll("#stage-coach .btn")].filter(shown).map((b) => ({ label: b.textContent.trim(), tappable: tappable(b) })),
      picture: !!panel && panel.classList.contains("has-viz"),
      // A button of the panel whose words are wider than the button: the first or last letters are cut
      tightLabels: [...(panel?.querySelectorAll(".btn") || [])].filter((b) => shown(b) && b.scrollWidth > b.clientWidth + 1).map((b) => b.textContent.trim()),
      // Px of the panel's content that a box which clips leaves out (the app's own measure, panelShortfall)
      cut: panel ? Math.max(wrap.scrollHeight - wrap.clientHeight, panel.scrollHeight - panel.clientHeight) : 0,
      panel: panelBox,
      vz: box(panel?.querySelector(".vz")),
      corner: box(corner),
      cornerParts: [...(corner?.children || [])].filter(shown).map((el) => ({ id: el.id, tappable: tappable(el) })),
      panelOverCorner: Math.round(over(panelBox, box(corner))),
      panelOverRail: rail.map((el) => ({ id: el.id || el.className, px: Math.round(over(panelBox, box(el))) })).filter((x) => x.px > 0)
    };
  });
}

/** Detener (or Empezar) whole on the page, and a tap at its centre reaches it. */
function reachable(f) {
  return !!f.button && f.button.bottom <= f.vh && f.button.top >= 0 && f.buttonTappable;
}

/**
 * The shortest page, at this width, on which the take's button (Empezar, or Detener during a take) is
 * whole with everything on the stage shown: one px less and it is under the page. Found by halving,
 * so it is right for whatever font the machine gives the page: the words' widths decide how many rows
 * the rails take, and with them where the button ends (375x629 with one font is 375x655 with another).
 * On this page the stage is at its content floor, so a rail's new row has nowhere to come from but
 * the page under it.
 */
async function tightestPage(page, width) {
  const fits = async (height) => {
    await page.setViewportSize({ width, height });
    await settle(page);
    const f = await facts(page);
    return f.relief === "" && f.scrollY === 0 && reachable(f) && f.button.bottom <= f.vh - 2;
  };
  let hi = 900;
  let lo = 501; // a page of 500 px or less is "on its side": the stage has no content floor there
  expect(await fits(hi), `the button is on a ${width}x${hi} page`).toBe(true);
  expect(await fits(lo), `the button is under a ${width}x${lo} page`).toBe(false);
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (await fits(mid)) hi = mid;
    else lo = mid;
  }
  expect(await fits(hi), `the button is on the ${width}x${hi} page that was found`).toBe(true);
  return hi;
}

test.describe("stage-relief: Detener stays on the page during a take", () => {
  test.use({ hasTouch: true });

  for (const run of [
    { lang: "es", name: "Spanish" },
    { lang: "en", name: "English" }
  ]) {
    // Wrong behaviour: the stage grows with the top rail's new row and Detener ends a row under the page
    // (27 to 33 px in the song exercise, in Spanish, on an iPhone mini and an iPhone 11 Pro).
    test(`the top rail gains a row at Empezar, ${run.name}: Detener is on the page, the cue yields and comes back`, async ({ page }) => {
      await page.setViewportSize({ width: 375, height: 900 });
      await ready(page, run.lang);
      const ids = (await catalogue(page)).map((e) => e.id);
      expect(ids, `${SONG} left the catalogue: use the pitch exercise with the tallest coach strip`).toContain(SONG);
      await open(page, SONG);
      // The root cause, made certain: from Empezar on the readout takes a row of its own. It does so by
      // itself where "En vivo" and the note no longer fit beside it, which depends on the font.
      await page.addStyleTag({ content: "body.practice-live #pitch-game-hud { flex-basis: 100%; }" });
      await tightestPage(page, 375);

      const before = await facts(page);
      // The premise: nobody had to scroll to press Empezar, so nothing explains a Detener they cannot see.
      expect(reachable(before), "Empezar is on the page before the take").toBe(true);
      expect(before.vh - before.button.bottom, "and there is no page to spare under it").toBeLessThan(4);
      expect(before.cue.text.length, "the cue has words").toBeGreaterThan(20);
      expect(before.cue.h, "the cue is shown before the take").toBeGreaterThanOrEqual(12);
      expect(before.relief).toBe("");

      await startTake(page);
      const during = await facts(page);
      expect(during.railTop - before.railTop, "the premise: the top rail is a row taller than before the take").toBeGreaterThan(10 - before.cue.h);
      expect(during.scrollY, "the page did not scroll to get there").toBe(0);
      expect(during.button.bottom, "Detener ends on the page").toBeLessThanOrEqual(during.vh - 2);
      expect(during.buttonTappable, "a tap at Detener's centre reaches it").toBe(true);
      // What gave way is the cue and nothing else: the panel's own buttons are still there to tap.
      expect(during.relief).toBe("cue");
      expect(during.cue.h, "the cue takes no room during the take").toBeLessThanOrEqual(1);
      expect(during.coachButtons.length, "the song panel's buttons are still on the stage").toBeGreaterThanOrEqual(3);
      expect(during.coachButtons.filter((b) => !b.tappable)).toEqual([]);
      // Hidden to the eye only: a role locator matches what a screen reader is given, and nothing display:none.
      await expect(page.locator("#stage-coach").getByRole("paragraph").filter({ hasText: before.cue.text })).toHaveCount(1);

      await stopTake(page);
      const after = await facts(page);
      expect(after.relief, "the relief ends with the take").toBe("");
      expect(after.cue.h, "the cue is back after Detener").toBeGreaterThanOrEqual(12);
      expect(after.cue.text).toBe(before.cue.text);
    });
  }

  // Wrong behaviour: only the fit at Empezar looks. The readout and the chord change width as one sings,
  // so the row can come ten seconds into the take, and Detener goes under the page then.
  test("the top rail gains a row in the middle of a take: the cue yields then, and Detener stays on the page", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await ready(page, "es");
    await open(page, SONG);
    // The readout on a row of its own from the start, so that its changing width moves nothing during
    // this take: the one row that arrives is the one added below.
    await page.addStyleTag({ content: "#pitch-game-hud { flex-basis: 100%; }" });
    await settle(page);
    await startTake(page);
    await tightestPage(page, 375);
    const before = await facts(page);
    expect(before.live && reachable(before), "the take is running and Detener is on the page").toBe(true);
    expect(before.relief, "nothing has yielded yet").toBe("");
    expect(before.cue.h, "the cue is shown").toBeGreaterThanOrEqual(12);

    await page.evaluate(() => {
      const row = document.createElement("div");
      row.id = "drift-row";
      row.style.cssText = "flex: 1 1 100%; height: 8px;";
      document.getElementById("hud-top-rail").insertBefore(row, document.getElementById("stage-coach"));
    });
    await settle(page);
    const during = await facts(page);
    expect(during.scrollY).toBe(0);
    expect(during.relief, "the cue yields to the new row").toBe("cue");
    expect(during.button.bottom, "Detener ends on the page").toBeLessThanOrEqual(during.vh - 2);
    expect(during.buttonTappable, "a tap at Detener's centre reaches it").toBe(true);
  });

  for (const run of [
    { lang: "es", name: "Spanish" },
    { lang: "en", name: "English" }
  ]) {
    // Wrong behaviour: the cue is dropped during every take, also where the take fits with it.
    test(`a take that fits keeps its cue, ${run.name} (a tall page, 390x844)`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await ready(page, run.lang);
      await open(page, SONG);
      await startTake(page);
      const during = await facts(page);
      expect(during.scrollY).toBe(0);
      expect(reachable(during), "Detener is on the page").toBe(true);
      expect(during.relief).toBe("");
      expect(during.cue.h, "the cue is still shown").toBeGreaterThanOrEqual(12);
    });
  }

  // Wrong behaviour: the cue is dropped to lift Empezar too, before anyone has read it. A page this short
  // scrolls to Empezar (decision cross-01), as a 320 px wide phone does today.
  test("before a take nothing yields: on a page 12 px too short for Empezar the cue is still shown", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 900 });
    await ready(page, "es");
    await open(page, SONG);
    const tight = await tightestPage(page, 375);
    await page.setViewportSize({ width: 375, height: tight - 12 });
    await settle(page);
    const before = await facts(page);
    expect(before.button.bottom, "the premise: Empezar ends under this page").toBeGreaterThan(before.vh);
    expect(before.relief).toBe("");
    expect(before.cue.h, "the cue is shown").toBeGreaterThanOrEqual(12);
  });

  for (const run of [
    { lang: "es", name: "Spanish, iPhone mini (375x629)", width: 375, height: 629 },
    { lang: "en", name: "English, iPhone mini (375x629)", width: 375, height: 629 },
    { lang: "es", name: "Spanish, iPhone 11 Pro (375x635)", width: 375, height: 635 }
  ]) {
    // The sizes the fault was measured at, with the words as this machine's font draws them: which of
    // these takes need the relief differs from font to font, the outcome does not. Wrong behaviour: any
    // pitch exercise whose rail gains a row during the take loses Detener under the page.
    test(`every pitch exercise, ${run.name}: where Empezar was on the page, Detener is too`, async ({ browser, page: first }) => {
      test.setTimeout(240000);
      await ready(first, run.lang);
      const pitch = (await catalogue(first)).filter((e) => e.pitch && e.takes).map((e) => e.id);
      expect(pitch.length, "the catalogue has pitch exercises").toBeGreaterThanOrEqual(8);
      const lost = [];
      let judged = 0;
      for (const id of pitch) {
        const page = await freshPage(browser, run);
        await ready(page, run.lang);
        await open(page, id);
        const before = await facts(page);
        if (reachable(before)) {
          judged += 1;
          await startTake(page);
          let during = await facts(page);
          // A row that arrived this very frame is answered on the next one: look again before judging.
          if (!reachable(during)) {
            await settle(page);
            during = await facts(page);
          }
          if (during.scrollY !== 0 || !reachable(during)) {
            lost.push(`${id}: Detener ${Math.round(during.button?.top)}..${Math.round(during.button?.bottom)} on a ${during.vh} px page, scrolled ${during.scrollY}`);
          }
        }
        await page.context().close();
      }
      // Not vacuous: at these sizes Empezar is on the page in most pitch exercises, whatever the font.
      expect(judged, "pitch exercises whose Empezar was on the page").toBeGreaterThanOrEqual(Math.ceil(pitch.length / 2));
      expect(lost).toEqual([]);
    });
  }
});

test.describe("landscape-beside: a picture is whole on a phone on its side", () => {
  test.use({ hasTouch: true });

  /** What is wrong with a picture stage on a page on its side; empty when nothing is. */
  function pictureFaults(f, { takes }) {
    const bad = [];
    if (f.cut > 2) bad.push(`cut by ${f.cut} px`);
    if (f.panelOverCorner > 0) bad.push(`over the status corner (${f.panelOverCorner} px²)`);
    const covered = f.cornerParts.filter((p) => !p.tappable).map((p) => p.id);
    if (covered.length) bad.push(`covers ${covered.join(", ")}`);
    if (f.vz && f.vz.h < 83) bad.push(`picture ${Math.round(f.vz.h)} px high, under its 84`);
    if (f.tightLabels.length) bad.push(`words wider than their button: ${f.tightLabels.join(", ")}`);
    if (f.panel && f.panel.w < 0.75 * f.stage.w) bad.push(`panel ${Math.round(f.panel.w)} px of a ${Math.round(f.stage.w)} px stage`);
    if (takes && !reachable(f)) bad.push(`${f.live ? "Detener" : "Empezar"} off the page (${Math.round(f.button?.bottom)} of ${f.vh})`);
    return bad;
  }

  for (const size of [
    { name: "Pixel 5 (802x293)", width: 802, height: 293 },
    { name: "Pixel 9 (756x308)", width: 756, height: 308 },
    { name: "iPhone 12 mini (712x325)", width: 712, height: 325 },
    { name: "iPhone SE (568x320)", width: 568, height: 320 }
  ]) {
    // Wrong behaviour: the picture sits under the status row and loses 9 to 47 px; or it is whole but
    // squeezed beside a status row that kept its width; or it lies over the pill and the clock; or a
    // button beside it gives way to it and loses a letter ("oma lista" on the A/B exercise).
    test(`on opening, ${size.name} on its side: every picture is whole, beside the status corner, Empezar on the page`, async ({ page }) => {
      test.setTimeout(180000);
      await page.setViewportSize({ width: size.width, height: size.height });
      await ready(page, "es");
      const all = (await catalogue(page)).filter((e) => !e.pitch);
      const bad = [];
      let pictures = 0;
      let beside = 0;
      for (const ex of all) {
        await open(page, ex.id);
        const f = await facts(page);
        if (!f.picture) continue;
        pictures += 1;
        if (f.corner && f.panel.top < f.corner.bottom - 1) beside += 1;
        const faults = pictureFaults(f, ex);
        if (faults.length) bad.push(`${ex.id}: ${faults.join("; ")}`);
      }
      expect(pictures, "exercises that draw a picture").toBeGreaterThanOrEqual(30);
      // Not vacuous: the layout under test is the one on the page (two exercises have no clock, so no corner).
      expect(beside, "pictures that start beside the status corner").toBeGreaterThanOrEqual(pictures - 4);
      expect(bad).toEqual([]);
    });
  }

  for (const half of [0, 1]) {
    // Wrong behaviour: "En vivo" is wider than "Tiempo" and a take's picture is taller than the idle one,
    // so a layout that is whole on opening is cut, or over the status, once the take runs.
    test(`during a take, Pixel 5 (802x293) on its side, ${half ? "second" : "first"} half: every picture is whole, Detener on the page, whole again after it`, async ({ browser, page: first }) => {
      test.setTimeout(300000);
      await ready(first, "es");
      const mine = (await catalogue(first)).filter((e) => !e.pitch && e.takes).filter((_, i) => i % 2 === half);
      const bad = [];
      let pictures = 0;
      for (const ex of mine) {
        const page = await freshPage(browser, { width: 802, height: 293 });
        await ready(page, "es");
        await open(page, ex.id);
        if ((await facts(page)).picture) {
          pictures += 1;
          await startTake(page);
          const during = pictureFaults(await facts(page), ex);
          await stopTake(page);
          const f = await facts(page);
          const after = f.picture && f.cut > 2 ? [`cut by ${f.cut} px after Detener`] : [];
          if (during.length || after.length) bad.push(`${ex.id}: ${[...during, ...after].join("; ")}`);
        }
        await page.context().close();
      }
      expect(pictures, "exercises that draw a picture").toBeGreaterThanOrEqual(15);
      expect(bad).toEqual([]);
    });
  }

  // Wrong behaviour: the stage is fitted while the view is still sliding in, 5 px short, and only gets
  // its height at Empezar. On this page those 5 px are what the picture lacks on opening.
  test("on opening the stage has its resting height: nothing jumps at Empezar (Pixel 5 on its side)", async ({ page }) => {
    await page.setViewportSize({ width: 802, height: 293 });
    await ready(page, "es");
    await open(page, "s28-vocal-function");
    const before = await facts(page);
    expect(before.cut, "the picture's panel is whole on opening").toBeLessThanOrEqual(2);
    await startTake(page);
    const during = await facts(page);
    expect(Math.abs(during.stage.h - before.stage.h), `stage ${before.stage.h} px on opening, ${during.stage.h} during the take`).toBeLessThanOrEqual(0.5);
    expect(Math.abs(during.stage.top - before.stage.top)).toBeLessThanOrEqual(0.5);
  });

  // Drift: a status word longer than today's two ("Tiempo", "En vivo"). Wrong behaviour: the picture
  // keeps the edge measured at the last fit and lies over the pill.
  test("a longer status word moves the picture over, it does not go under it", async ({ page }) => {
    await page.setViewportSize({ width: 802, height: 293 });
    await ready(page, "es");
    await open(page, "s8-breath-support");
    const before = await facts(page);
    expect(before.panelOverCorner).toBe(0);
    await page.evaluate(() => {
      document.getElementById("practice-status").textContent = "Micrófono en pausa";
    });
    await settle(page);
    const after = await facts(page);
    expect(after.corner.w, "the corner grew with its word").toBeGreaterThan(before.corner.w + 40);
    expect(after.panelOverCorner, "the picture is not over the corner").toBe(0);
    expect(after.panel.left, "the picture moved right").toBeGreaterThan(before.panel.left + 40);
    expect(after.cornerParts.filter((p) => !p.tappable)).toEqual([]);
  });

  // Drift: something else is put in a picture stage's top rail. Wrong behaviour: the picture still starts
  // at the top and lies over it. Safe behaviour: it goes back under the rail, and this test says so.
  test("anything else in the top rail puts the picture back under it", async ({ page }) => {
    await page.setViewportSize({ width: 802, height: 293 });
    await ready(page, "es");
    await open(page, "s8-breath-support");
    const before = await facts(page);
    expect(before.panel.top, "beside the corner to begin with").toBeLessThan(before.corner.bottom - 1);
    await page.evaluate(() => {
      const chip = document.createElement("div");
      chip.id = "drift-chip";
      chip.className = "hud-corner";
      chip.textContent = "Racha 3";
      chip.style.cssText = "flex: 1 1 100%; min-height: 30px;";
      const rail = document.getElementById("hud-top-rail");
      rail.style.flexWrap = "wrap";
      rail.appendChild(chip);
    });
    await settle(page);
    const after = await facts(page);
    expect(after.panelOverRail, "the picture lies over nothing in the top rail").toEqual([]);
    expect(after.panel.top, "it starts under the status row").toBeGreaterThanOrEqual(after.corner.bottom);
    // Exactly the layout from before this design, not a taller rail with the picture under it.
    expect(after.corner.h, "the status corner is one row again").toBeLessThan(48);
  });

  // Wrong behaviour: the rule reaches a folded phone's cover screen, where a picture beside the corner
  // would be about 100 px wide.
  test("not on a folded phone's cover screen (Galaxy Z Flip 6, 360x298): the picture keeps the stage's width", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 298 });
    await ready(page, "es");
    await open(page, "s8-breath-support");
    const f = await facts(page);
    expect(f.picture).toBe(true);
    expect(f.corner.h, "the status corner is one row").toBeLessThan(48);
    expect(f.panel.left - f.stage.left, "the panel starts at the stage's left edge").toBeLessThan(16);
    expect(f.panel.top, "under the status row").toBeGreaterThanOrEqual(f.corner.bottom);
  });

  // Wrong behaviour: the rule leaks to an upright phone, or to a pitch exercise on its side, whose
  // lanes need the whole width and whose status row holds the chord and the hold clock.
  test("not on an upright phone, and not on a pitch exercise on its side", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await ready(page, "es");
    await open(page, "s8-breath-support");
    const upright = await facts(page);
    expect(upright.picture).toBe(true);
    expect(upright.corner.h, "upright: the status corner is one row").toBeLessThan(48);
    expect(upright.panel.top, "upright: the picture is under the status row").toBeGreaterThanOrEqual(upright.corner.bottom);

    await page.setViewportSize({ width: 802, height: 293 });
    await open(page, "s9-pitch-match");
    const lanes = await facts(page);
    expect(lanes.picture).toBe(false);
    expect(lanes.corner.h, "pitch, on its side: the status corner is one row").toBeLessThan(48);
    const canvas = await page.locator("#pitch-canvas").boundingBox();
    expect(canvas.y, "the lanes start under the status row").toBeGreaterThanOrEqual(lanes.corner.bottom);
    expect(reachable(lanes), "Empezar is on the page").toBe(true);
  });
});
