/**
 * Tour behaviour: what it points at, what it remembers, what it leaves behind,
 * plus the microphone primer and the variant assignment behind it.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page, init = {}) {
  await page.addInitScript((cfg) => {
    try {
      localStorage.clear();
      localStorage.setItem("vt_lang", cfg.lang || "es");
      if (cfg.tour) localStorage.setItem("vt_tour_v1", cfg.tour);
      if (cfg.micPrimed) localStorage.setItem("vt_mic_primed_v1", "1");
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
  }, init);
  await page.goto(BASE + (init.query || ""), { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(300);
}

const progressNumbers = (text) => {
  const m = String(text).match(/(\d+)\D+(\d+)/);
  return m ? { n: Number(m[1]), total: Number(m[2]) } : null;
};

test.describe("Tour targets", () => {
  test("every home step points at something really on screen", async ({ page }) => {
    await boot(page);
    // This is the assertion that would have caught `.continue-toolbar`, which
    // was deleted from the markup and left behind in the tour for three days.
    const report = await page.evaluate(() => {
      const steps = window.VTTour.__homeSteps ? window.VTTour.__homeSteps() : null;
      return steps;
    });
    // Steps are private; walk the real tour instead and check each highlight.
    await page.evaluate(() => window.VTTour.start(true));
    const seen = [];
    for (let i = 0; i < 10; i += 1) {
      await page.waitForTimeout(400);
      const s = await page.evaluate(() => {
        const hl = document.querySelector(".tour-highlight");
        const r = hl && hl.getBoundingClientRect();
        return {
          progress: document.querySelector("[data-tour-progress]").textContent,
          hasTarget: !!hl,
          onScreen: r ? r.width > 2 && r.height > 2 && r.bottom > 0 && r.top < innerHeight : null
        };
      });
      seen.push(s);
      const p = progressNumbers(s.progress);
      if (p && p.n === p.total) break;
      await page.locator("[data-tour-next]").click();
    }
    expect(report).toBeNull();
    // First step is a centred welcome; the rest must all be anchored and visible.
    for (const s of seen.slice(1)) {
      expect(s.hasTarget, `${s.progress} is anchored to an element`).toBe(true);
      expect(s.onScreen, `${s.progress} target is on screen`).toBe(true);
    }
  });

  test("the counter matches the steps that actually run", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.VTTour.start(true));
    await page.waitForTimeout(400);
    const first = progressNumbers(
      await page.locator("[data-tour-progress]").textContent()
    );
    expect(first.n).toBe(1);
    for (let i = 1; i < first.total; i += 1) {
      await page.locator("[data-tour-next]").click();
      await page.waitForTimeout(350);
    }
    const last = progressNumbers(await page.locator("[data-tour-progress]").textContent());
    // It read "Paso 1 de 11" against twelve authored steps, because one was
    // silently dropped for pointing at an element that no longer existed.
    expect(last.n, "the last step is the one the counter promised").toBe(last.total);
  });

  test("hold steps appear only on exercises that show a hold readout", async ({ page }) => {
    await boot(page, { tour: "finished", micPrimed: true });
    const titlesFor = async (id) => {
      await page.evaluate((x) => window.VTApp.openExercise(x, false), id);
      await page.waitForTimeout(600);
      await page.evaluate(() => window.VTTour.startUiPack("highway", { force: true }));
      const out = [];
      for (let i = 0; i < 16; i += 1) {
        await page.waitForTimeout(280);
        const s = await page.evaluate(() => ({
          title: document.querySelector("[data-tour-title]").textContent,
          progress: document.querySelector("[data-tour-progress]").textContent
        }));
        out.push(s.title);
        const p = progressNumbers(s.progress);
        if (p && p.n === p.total) break;
        await page.locator("[data-tour-next]").click();
      }
      await page.locator("[data-tour-skip]").click();
      await page.waitForTimeout(200);
      await page.evaluate(() => window.VTTour.clearUiSeen("highway"));
      return out;
    };
    // s2 sets showHold; s9 does not. detectUiFamily calls both "highway", which
    // is why the hold copy lived in a pack that could never run.
    const withHold = await titlesFor("s2-solfege-chords");
    await page.evaluate(() => document.getElementById("btn-back-home")?.click());
    await page.waitForTimeout(300);
    const withoutHold = await titlesFor("s9-pitch-match");
    const holdRe = /contador|hold counter/i;
    expect(withHold.some((t) => holdRe.test(t)), "s2 explains its hold counter").toBe(true);
    expect(withoutHold.some((t) => holdRe.test(t)), "s9 has no hold counter to explain").toBe(
      false
    );
  });
});

test.describe("Tour memory", () => {
  test("skipping the home tour also declines the per-screen coach-marks", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.VTTour.start(true));
    await page.waitForTimeout(400);
    await page.locator("[data-tour-next]").click();
    await page.waitForTimeout(250);
    await page.locator("[data-tour-skip]").click();
    await page.waitForTimeout(200);
    const state = await page.evaluate(() => ({
      stored: localStorage.getItem("vt_tour_v1"),
      done: window.VTTour.isDone(),
      finished: window.VTTour.isFinished()
    }));
    expect(state.stored).toBe("dismissed");
    expect(state.done, "it will not open itself again").toBe(true);
    expect(state.finished, "but it was not completed, so packs stay off").toBe(false);
  });

  test("finishing the home tour is recorded as finished", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.VTTour.start(true));
    await page.waitForTimeout(400);
    for (let i = 0; i < 8; i += 1) {
      const p = progressNumbers(await page.locator("[data-tour-progress]").textContent());
      await page.locator("[data-tour-next]").click();
      await page.waitForTimeout(280);
      if (p && p.n === p.total) break;
    }
    expect(await page.evaluate(() => localStorage.getItem("vt_tour_v1"))).toBe("finished");
  });

  test("the legacy '1' flag still counts as finished", async ({ page }) => {
    // ~15 specs and QA scripts write "1" to suppress the tour. They must keep working.
    await boot(page, { tour: "1" });
    const s = await page.evaluate(() => ({
      done: window.VTTour.isDone(),
      finished: window.VTTour.isFinished()
    }));
    expect(s).toEqual({ done: true, finished: true });
  });

  test("replaying from the header does not re-arm the first-visit tour", async ({ page }) => {
    await boot(page, { tour: "finished" });
    await page.locator("#btn-tour").click();
    await page.waitForTimeout(400);
    await page.locator("[data-tour-skip]").click();
    await page.waitForTimeout(200);
    // It used to clear the flag before replaying, so skipping a replay made the
    // tour open itself again on the next visit.
    expect(await page.evaluate(() => localStorage.getItem("vt_tour_v1"))).toBeTruthy();
  });

  test("the tour does not open itself, it offers itself", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.clear();
        localStorage.setItem("vt_lang", "es");
      } catch {
        /* ignore */
      }
    });
    // No vt_e2e here: the auto-start block must not be what keeps it closed.
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1600);
    await expect(page.locator("#tour-root")).toBeHidden();
    await expect(page.locator("#home-tour-invite")).toBeVisible();
    await page.locator("[data-tour-invite-start]").click();
    await expect(page.locator("#tour-root")).toBeVisible();
  });
});

test.describe("Tour manners", () => {
  test("it leaves the page exactly as it found it", async ({ page }) => {
    await boot(page);
    const snapshot = () =>
      page.evaluate(() => ({
        tab: document.querySelector(".tab.active")?.dataset.tab || null,
        tier: document.querySelector(".tier-chip.selected")?.dataset.tier || null,
        cards: document.querySelectorAll("#exercise-list .card-ex").length,
        nextStep: document.getElementById("next-step-title")?.textContent || null
      }));
    const before = await snapshot();
    await page.evaluate(() => window.VTTour.start(true));
    await page.waitForTimeout(400);
    for (let i = 0; i < 8; i += 1) {
      const p = progressNumbers(await page.locator("[data-tour-progress]").textContent());
      await page.locator("[data-tour-next]").click();
      await page.waitForTimeout(280);
      if (p && p.n === p.total) break;
    }
    // It used to switch track and tier to open a sample exercise and never put
    // them back: Vocal/Todos/20 cards went in, Canto/Básico/16 came out.
    expect(await snapshot()).toEqual(before);
  });

  test("Enter on Skip closes the tour instead of advancing it", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.VTTour.start(true));
    await page.waitForTimeout(400);
    const before = progressNumbers(
      await page.locator("[data-tour-progress]").textContent()
    );
    await page.locator("[data-tour-skip]").focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
    await expect(page.locator("#tour-root")).toBeHidden();
    expect(before.n).toBe(1);
  });

  // Was: "clicking the dim dismisses it". Deliberately reversed. The dim used
  // to end the tour, and because the backdrop also covers the spotlight hole and
  // .tour-highlight cannot take a click, the one thing the tour was pointing at
  // was the worst thing to touch — it closed the tour, wrote "dismissed", and
  // took the per-screen coach-marks with it. On a phone the dim is most of the
  // screen, so a stray tap did all that by accident with no way back.
  test("clicking the dim does nothing — leaving takes a deliberate act", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.VTTour.start(true));
    await page.waitForTimeout(400);
    await page.locator(".tour-backdrop").click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(250);
    await expect(page.locator("#tour-root")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("vt_tour_v1"))).toBeNull();
  });

  test("clicking the element being spotlighted moves the tour on", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.VTTour.start(true));
    await page.waitForTimeout(400);
    await page.locator("[data-tour-next]").click(); // step 2 rings #next-step-card
    await page.waitForTimeout(450);
    const before = await page.evaluate(
      () => document.querySelector("[data-tour-progress]").textContent
    );
    const spot = await page.evaluate(() => {
      const r = document.querySelector("[data-tour-spot]").getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    });
    await page.mouse.click(spot.x, spot.y);
    await page.waitForTimeout(450);
    await expect(page.locator("#tour-root")).toBeVisible();
    expect(
      await page.evaluate(() => document.querySelector("[data-tour-progress]").textContent)
    ).not.toBe(before);
  });

  test("the last step's guide link is not the same one step 1 uses", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.VTTour.start(true));
    await page.waitForTimeout(400);
    const hrefs = [];
    for (let i = 0; i < 4; i += 1) {
      hrefs.push(await page.locator("[data-tour-guide]").getAttribute("href"));
      if (i < 3) {
        await page.locator("[data-tour-next]").click();
        await page.waitForTimeout(420);
      }
    }
    expect(new Set(hrefs).size, `each step points somewhere useful: ${hrefs}`).toBe(4);
  });

  test("ending the tour puts the page back where it found it", async ({ page }) => {
    await boot(page, { tour: "finished" });
    // Scrolling down renders the lower sections, which makes the document
    // taller, and Chromium's scroll anchoring then moves scrollY along with it
    // — in one run the page went 1462 -> 2368px and scrollY drifted 662 -> 933
    // with nobody touching it. So scroll to the bottom repeatedly until the
    // position holds still; measuring before that compares two different pages.
    let before = 0;
    for (let i = 0; i < 12; i += 1) {
      await page.evaluate(() =>
        window.scrollTo(0, document.documentElement.scrollHeight - window.innerHeight)
      );
      await page.waitForTimeout(300);
      const now = await page.evaluate(() => Math.round(window.scrollY));
      if (now === before) break;
      before = now;
    }
    expect(before, "the home page is tall enough for this test to mean anything").toBeGreaterThan(
      200
    );
    await page.locator("#btn-tour").click();
    await page.waitForTimeout(500);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(400);
    const after = await page.evaluate(() => Math.round(window.scrollY));
    expect(Math.abs(after - before), `scroll restored (${before} -> ${after})`).toBeLessThan(40);
  });

  test("the page behind is inert while it is open, and released after", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.VTTour.start(true));
    await page.waitForTimeout(400);
    expect(
      await page.evaluate(() => document.querySelector(".app-header")?.hasAttribute("inert"))
    ).toBe(true);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    expect(
      await page.evaluate(() => document.querySelector(".app-header")?.hasAttribute("inert"))
    ).toBe(false);
  });

  test("an open tour follows a language switch", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.VTTour.start(true));
    await page.waitForTimeout(400);
    const es = await page.locator("[data-tour-next]").textContent();
    await page.evaluate(() => window.VTI18n.setLang("en"));
    await page.waitForTimeout(350);
    const en = await page.evaluate(() => ({
      next: document.querySelector("[data-tour-next]").textContent,
      progress: document.querySelector("[data-tour-progress]").textContent,
      guide: document.querySelector("[data-tour-guide]").getAttribute("href")
    }));
    expect(en.next).not.toBe(es);
    expect(en.progress).toMatch(/step/i);
    expect(en.guide, "the guide link follows the language too").toMatch(/-en$/);
  });

  test("every guide link in the tour resolves to a real section", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.VTTour.start(true));
    await page.waitForTimeout(400);
    const hrefs = [];
    for (let i = 0; i < 8; i += 1) {
      const s = await page.evaluate(() => ({
        href: document.querySelector("[data-tour-guide]").getAttribute("href"),
        progress: document.querySelector("[data-tour-progress]").textContent
      }));
      hrefs.push(s.href);
      const p = progressNumbers(s.progress);
      if (p && p.n === p.total) break;
      await page.locator("[data-tour-next]").click();
      await page.waitForTimeout(280);
    }
    const guide = await page.request.get(BASE + "/guide.html");
    expect(guide.ok()).toBe(true);
    const html = await guide.text();
    for (const href of hrefs) {
      const anchor = href.split("#")[1];
      expect(html, `guide.html has a section #${anchor}`).toContain(`id="${anchor}"`);
    }
  });
});

test.describe("Microphone primer", () => {
  // The primer is suppressed under automation exactly as the tour is: by the
  // headless user agent and by `vt_e2e`. Both have to come off for the real
  // path to run. The user agent is set per-context here rather than patched in
  // the page, because tour.js reads it before any test code gets to run, and
  // the twelve specs that press Start without `vt_e2e` keep their headless
  // agent and so keep the suppression.
  test.use({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36"
  });

  test("it explains the prompt before the browser asks", async ({ page }) => {
    await boot(page, { tour: "finished" });
    let micCalls = 0;
    await page.exposeFunction("__micCalled", () => {
      micCalls += 1;
    });
    await page.evaluate(() => {
      const real = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (...a) => {
        window.__micCalled();
        return real(...a);
      };
    });
    await page.evaluate(() => window.VTApp.openExercise("v1-diction", false));
    await page.waitForTimeout(600);
    await page.evaluate(() => sessionStorage.removeItem("vt_e2e"));
    await page.locator("#btn-practice-start").click();
    await expect(page.locator("#mic-primer")).toBeVisible();
    // The whole point: the explanation lands before the permission dialog.
    expect(micCalls, "no microphone request before the primer is answered").toBe(0);
  });

  test("declining keeps you on the exercise, and it does not ask twice", async ({ page }) => {
    await boot(page, { tour: "finished" });
    await page.evaluate(() => window.VTApp.openExercise("v1-diction", false));
    await page.waitForTimeout(600);
    await page.evaluate(() => sessionStorage.removeItem("vt_e2e"));
    await page.locator("#btn-practice-start").click();
    await expect(page.locator("#mic-primer")).toBeVisible();
    await page.locator("[data-primer-no]").click();
    await page.waitForTimeout(250);
    await expect(page.locator("#mic-primer")).toBeHidden();
    await expect(page.locator("#view-exercise")).toBeVisible();
    await expect(page.locator("#btn-practice-start")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("vt_mic_primed_v1"))).toBe("1");
    await page.locator("#btn-practice-start").click();
    await page.waitForTimeout(300);
    await expect(page.locator("#mic-primer")).toBeHidden();
  });

  test("it never appears once the microphone has been primed", async ({ page }) => {
    await boot(page, { tour: "finished", micPrimed: true });
    await page.evaluate(() => window.VTApp.openExercise("v1-diction", false));
    await page.waitForTimeout(600);
    await page.evaluate(() => sessionStorage.removeItem("vt_e2e"));
    await page.locator("#btn-practice-start").click();
    await page.waitForTimeout(400);
    await expect(page.locator("#mic-primer")).toBeHidden();
  });
});

test.describe("Variant assignment", () => {
  test("a disabled experiment puts everybody in the control arm", async ({ page }) => {
    await boot(page, { tour: "finished" });
    const result = await page.evaluate(() => {
      const out = {};
      for (let i = 0; i < 200; i += 1) {
        localStorage.setItem("vt_ab_v1", JSON.stringify({ cid: `probe-${i}` }));
        const v = window.VTExperiments.variant("tour_shape_2026_10");
        out[v] = (out[v] || 0) + 1;
      }
      return out;
    });
    expect(Object.keys(result)).toEqual(["invite"]);
  });

  test("assignment is stable for a browser and evenly split when enabled", async ({ page }) => {
    await boot(page, { tour: "finished" });
    const result = await page.evaluate(() => {
      window.VT_EXPERIMENTS.tour_shape_2026_10.enabled = true;
      const counts = {};
      const repeats = [];
      for (let i = 0; i < 600; i += 1) {
        localStorage.setItem("vt_ab_v1", JSON.stringify({ cid: `probe-${i}` }));
        const a = window.VTExperiments.variant("tour_shape_2026_10");
        const b = window.VTExperiments.variant("tour_shape_2026_10");
        counts[a] = (counts[a] || 0) + 1;
        repeats.push(a === b);
      }
      return { counts, stable: repeats.every(Boolean) };
    });
    expect(result.stable, "the same browser always gets the same arm").toBe(true);
    expect(Object.keys(result.counts).sort()).toEqual(["auto", "invite"]);
    // 600 draws, two even arms: a fair split lands well inside these bounds.
    expect(result.counts.auto).toBeGreaterThan(240);
    expect(result.counts.auto).toBeLessThan(360);
  });

  test("a variant can be forced from the address bar, to look at both", async ({ page }) => {
    await boot(page, { tour: "finished", query: "?ab_tour_shape_2026_10=auto" });
    const a = await page.evaluate(() =>
      window.VTExperiments.assignment("tour_shape_2026_10")
    );
    expect(a.variant).toBe("auto");
    expect(a.forced).toBe(true);
  });

  test("nothing is sent anywhere — the privacy page stays true", async ({ page }) => {
    const external = [];
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (!url.startsWith(BASE)) external.push(url);
      return route.continue();
    });
    await boot(page);
    await page.evaluate(() => window.VTTour.start(true));
    await page.waitForTimeout(500);
    await page.locator("[data-tour-next]").click();
    await page.waitForTimeout(400);
    expect(external, "no beacon leaves the page").toEqual([]);
    const events = await page.evaluate(() => window.VTAnalytics.summary().counts);
    expect(events.tour_start, "the events exist, they just stay on the device").toBe(1);
  });
});

/**
 * guide.html's headings are the destination of all 40 of its own contents
 * links, of every inline cross-reference, of the tour's four "full guide"
 * links and of any deep link anybody shares. `.app-header` is sticky at about
 * 74px, so without `scroll-margin-top` every one of them arrives with the
 * section title hidden behind the header and the reader dropped mid-paragraph.
 */
test.describe("The written guide's anchors", () => {
  test("every anchor lands clear of the sticky header", async ({ page }) => {
    await page.goto(`${BASE}/guide.html`);
    await page.waitForLoadState("domcontentloaded");
    const anchors = await page.$$eval('a[href^="#"]', (as) =>
      as.map((a) => a.getAttribute("href"))
    );
    expect(anchors.length, "the guide still has its contents links").toBeGreaterThan(20);
    const obscured = [];
    for (const href of anchors) {
      await page.evaluate((h) => {
        // -1 is a sentinel. `html { scroll-behavior: smooth }` makes a hash
        // change a real journey — up to 7000px here — so the poll below has to
        // start from a value the new scroll cannot already match, or it reads
        // the previous anchor's resting position as "settled" straight away.
        window.__ly = -1;
        window.location.hash = "";
        window.location.hash = h;
      }, href);
      await page.waitForFunction(
        () => {
          const y = Math.round(window.scrollY);
          const settled = window.__ly === y;
          window.__ly = y;
          return settled;
        },
        null,
        { polling: 120, timeout: 6000 }
      );
      const seen = await page.evaluate((h) => {
        const el = document.getElementById(h.slice(1));
        if (!el) return { missing: true };
        const b = el.getBoundingClientRect();
        const hit = document.elementFromPoint(Math.round(b.left + 4), Math.round(b.top + 4));
        return { top: Math.round(b.top), hit: hit ? hit.className || hit.tagName : null };
      }, href);
      if (seen.missing || seen.top < 0 || String(seen.hit).includes("app-header")) {
        obscured.push(`${href} (top ${seen.top}, hit ${seen.hit})`);
      }
    }
    expect(obscured, `every anchor clears the header: ${obscured.join(", ")}`).toEqual([]);
  });
});
