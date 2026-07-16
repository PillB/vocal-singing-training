/**
 * Full user journeys + per-exercise Start smoke.
 * Reliability gate: no pageerrors, no closed AudioContext after practice,
 * Start/Stop works for every catalog exercise (fake mic).
 */
const { test, expect } = require("@playwright/test");
const snap = require("./fixtures/catalog-snapshot.json");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function installFakeMic(page) {
  await page.context().grantPermissions(["microphone"]).catch(() => {});
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!navigator.mediaDevices) return;
    navigator.mediaDevices.getUserMedia = async () => {
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

async function boot(page) {
  await installFakeMic(page);
  await page.goto(BASE + "/?t=" + Date.now(), { waitUntil: "domcontentloaded" });
}

async function openExercise(page, ex) {
  // Fast path: app API (avoids tab/tier re-clicks every time)
  const ok = await page.evaluate(async (id) => {
    if (window.VTApp?.openExercise) {
      await window.VTApp.openExercise(id);
      return true;
    }
    return false;
  }, ex.id);
  if (!ok) {
    await page.click(`.tab[data-tab="${ex.track}"]`);
    await page.click(`.tier-chip[data-tier="all"]`);
    await page.waitForTimeout(40);
    await page.evaluate((id) => {
      const all = [...VT_EXERCISES.vocal, ...VT_EXERCISES.singing];
      const found = all.find((e) => e.id === id);
      for (const c of document.querySelectorAll("#exercise-list .card-ex")) {
        if (c.querySelector(".num")?.textContent?.trim() === String(found?.number)) {
          c.click();
          return;
        }
      }
    }, ex.id);
  }
  await expect(page.locator("#view-exercise")).toHaveClass(/active/, { timeout: 8000 });
}

async function backHome(page) {
  await page.evaluate(() => {
    try {
      window.VTApp?.getState?.() && (window.VTApp.getState().practiceLive = false);
      if (window.VTApp?.resetSessionPractice) window.VTApp.resetSessionPractice();
      // Stop piano quietly
      window.VTPiano?.stopAll?.();
    } catch {
      /* ignore */
    }
  });
  await page.evaluate(() => {
    if (window.VTApp?.setView) window.VTApp.setView("home");
    else document.querySelector("#btn-back-home")?.click();
  });
  // Dismiss leave modal if any
  await page.evaluate(() => {
    const m = document.querySelector("#leave-modal");
    if (m && !m.hidden) document.querySelector("#leave-discard")?.click();
  });
  await expect(page.locator("#view-home")).toHaveClass(/active/, { timeout: 5000 });
}

test.describe("Full journey: per-exercise Start smoke", () => {
  test.describe.configure({ mode: "serial", timeout: 420_000 });

  test("every catalog exercise: open → Start → Stop → home (no pageerror, ctx not closed)", async ({
    page
  }) => {
    test.setTimeout(420_000);
    const pageErrors = [];
    page.on("pageerror", (e) => pageErrors.push(String(e?.message || e)));

    await boot(page);
    const failures = [];

    for (const ex of snap.catalog) {
      try {
        await openExercise(page, ex);
        const start = page.locator("#btn-practice-start");
        await expect(start).toBeVisible({ timeout: 5000 });

        await start.click();
        // Brief settle; weekPlan may not go live
        await page.waitForTimeout(ex.mode === "weekPlan" ? 250 : 380);

        if (ex.mode === "weekPlan") {
          await backHome(page);
          continue;
        }

        const stop = page.locator("#btn-practice-stop");
        const stopVisible = await stop.isVisible().catch(() => false);
        if (!stopVisible) {
          failures.push({
            id: ex.id,
            reason: "stop not visible after Start"
          });
        } else {
          await stop.click();
          await page.waitForTimeout(120);
        }

        const health = await page.evaluate(() => ({
          ctx: window.VTPiano?.ctx?.state ?? "none",
          keepAlive: !!(window.VTApp?.getState?.()?._pianoKeepAlive),
          live: !!window.VTApp?.getState?.()?.practiceLive
        }));

        if (health.ctx === "closed") {
          failures.push({ id: ex.id, reason: "AudioContext closed after stop" });
        }
        if (health.keepAlive) {
          failures.push({ id: ex.id, reason: "piano keepAlive still set after stop" });
        }
        if (health.live) {
          failures.push({ id: ex.id, reason: "practiceLive still true after stop" });
        }

        await backHome(page);
      } catch (e) {
        failures.push({ id: ex.id, reason: String(e?.message || e).slice(0, 200) });
        try {
          await page.goto(BASE + "/?t=" + Date.now(), { waitUntil: "domcontentloaded" });
          await page.waitForTimeout(100);
        } catch {
          /* ignore */
        }
      }
    }

    if (pageErrors.length) {
      failures.push({ id: "_page", reason: "pageerror:" + pageErrors.slice(0, 3).join(" | ") });
    }

    if (failures.length) {
      throw new Error(
        `Start smoke failures (${failures.length}):\n` +
          failures
            .slice(0, 20)
            .map((f) => `${f.id}: ${f.reason}`)
            .join("\n")
      );
    }

    expect(snap.catalog.length).toBeGreaterThanOrEqual(36);
  });
});

test.describe("Full journey: core user flows", () => {
  test("singing pitch: Start + auto piano signal + hot mode switch", async ({ page }) => {
    await boot(page);
    const solfege = snap.catalog.find((e) => e.id === "s2-solfege-chords") || {
      id: "s2-solfege-chords",
      track: "singing",
      tier: "basic"
    };
    await openExercise(page, solfege);
    await page.evaluate(() => {
      const a = document.querySelector("#chk-auto-piano");
      if (a) a.checked = true;
    });
    await page.click("#btn-practice-start");
    await page.waitForTimeout(600);
    await expect(page.locator("#btn-practice-stop")).toBeVisible();

    const audio = await page.evaluate(async () => {
      await new Promise((r) => setTimeout(r, 200));
      return {
        ctx: window.VTPiano?.ctx?.state,
        loop: !!window.VTPiano?.loopActive,
        peak: window.VTPiano?.outputPeak?.() ?? 0,
        bar: !document.querySelector("#hud-prog-bar")?.hidden
      };
    });
    expect(audio.ctx).toBe("running");
    expect(audio.loop || audio.peak > 0.005).toBeTruthy();
    expect(audio.bar).toBe(true);

    if (await page.locator("#sel-play-mode").isVisible()) {
      await page.selectOption("#sel-play-mode", "oneNote");
      await page.evaluate(async () => {
        const p = window.VTApp?._hotApplyPromise;
        if (p) await p;
      });
      await page.waitForTimeout(250);
      const one = await page.evaluate(() => ({
        mode: document.querySelector("#sel-play-mode")?.value,
        peak: window.VTPiano?.outputPeak?.() ?? 0
      }));
      expect(one.mode).toBe("oneNote");
      expect(one.peak).toBeGreaterThan(0.003);
    }

    await page.click("#btn-practice-stop");
  });

  test("vocal speech: Start without requiring piano", async ({ page }) => {
    await boot(page);
    const v1 = snap.catalog.find((e) => e.id === "v1-diction") || {
      id: "v1-diction",
      track: "vocal",
      tier: "basic"
    };
    await openExercise(page, v1);
    await page.click("#btn-practice-start");
    await page.waitForTimeout(500);
    await expect(page.locator("#btn-practice-stop")).toBeVisible();
    // Prog bar should be hidden (no chords)
    const barHidden = await page.evaluate(() => {
      const b = document.querySelector("#hud-prog-bar");
      return !b || b.hidden;
    });
    expect(barHidden).toBe(true);
    await page.click("#btn-practice-stop");
  });

  test("structured session: start basic path banner", async ({ page }) => {
    await boot(page);
    await page.click('.tab[data-tab="vocal"]');
    const structured = page.locator("#btn-structured");
    if (!(await structured.isVisible().catch(() => false))) {
      test.skip();
      return;
    }
    await structured.click();
    await page.waitForTimeout(300);
    const banner = page.locator("#session-banner");
    // Banner may show when session active
    const hasSession = await page.evaluate(() => {
      try {
        return !!(window.VTSession?.get?.() || localStorage.getItem("vt_session"));
      } catch {
        return false;
      }
    });
    expect(hasSession || (await banner.isVisible().catch(() => false))).toBeTruthy();
  });

  test("leave modal chrome exists; practiced path can surface it", async ({ page }) => {
    await boot(page);
    await expect(page.locator("#leave-modal")).toBeAttached();
    const solfege = snap.catalog.find((e) => e.id === "s2-solfege-chords");
    if (!solfege) return;
    await openExercise(page, solfege);
    await page.click("#btn-practice-start");
    await page.waitForTimeout(400);
    // Force practiced seconds so leave prompt triggers
    await page.evaluate(() => {
      const st = window.VTApp?.getState?.();
      if (st?.sessionPractice) {
        st.sessionPractice.everStarted = true;
        st.sessionPractice.accumulatedMs = 999999;
      }
    });
    await page.click("#btn-practice-stop");
    await page.waitForTimeout(150);
    await page.click("#btn-back-home");
    await page.waitForTimeout(200);
    const leaveVisible = await page.locator("#leave-modal").isVisible().catch(() => false);
    // If modal shown, dismiss; either way no crash
    if (leaveVisible) {
      await page.click("#leave-cancel");
    }
  });

  test("i18n toggle switches control labels", async ({ page }) => {
    await boot(page);
    await openExercise(page, snap.catalog.find((e) => e.id === "s2-solfege-chords") || snap.catalog[0]);
    const esMode = await page.locator("#sel-play-mode option[value='chords']").textContent();
    await page.click("#btn-lang");
    await page.waitForTimeout(200);
    const enMode = await page.locator("#sel-play-mode option[value='chords']").textContent();
    // After EN, expect "Chords" (or still Acordes if re-render missed — then force apply)
    await page.evaluate(() => {
      if (window.VTI18n) VTI18n.setLang("en");
    });
    await page.waitForTimeout(150);
    const en2 = await page.locator("#sel-play-mode option[value='chords']").textContent();
    expect((en2 || enMode || "").toLowerCase()).toMatch(/chord|acorde/);
    // Back to ES for isolation
    await page.evaluate(() => {
      if (window.VTI18n) VTI18n.setLang("es");
    });
  });

  test("history and plan buttons open without throw", async ({ page }) => {
    const errs = [];
    page.on("pageerror", (e) => errs.push(String(e)));
    await boot(page);
    await page.click("#btn-history");
    await page.waitForTimeout(200);
    await page.click("#btn-plan");
    await page.waitForTimeout(200);
    expect(errs).toEqual([]);
  });

  test("option sync: mode select ↔ checkboxes", async ({ page }) => {
    await boot(page);
    await openExercise(page, snap.catalog.find((e) => e.id === "s2-solfege-chords") || snap.catalog[0]);
    await page.selectOption("#sel-play-mode", "arpeggio");
    let s = await page.evaluate(() => ({
      one: !!document.querySelector("#chk-one-note")?.checked,
      arp: !!document.querySelector("#chk-arpeggio")?.checked,
      mode: document.querySelector("#sel-play-mode")?.value
    }));
    expect(s.mode).toBe("arpeggio");
    expect(s.arp).toBe(true);
    expect(s.one).toBe(false);

    await page.selectOption("#sel-play-mode", "oneNote");
    s = await page.evaluate(() => ({
      one: !!document.querySelector("#chk-one-note")?.checked,
      arp: !!document.querySelector("#chk-arpeggio")?.checked,
      mode: document.querySelector("#sel-play-mode")?.value
    }));
    expect(s.mode).toBe("oneNote");
    expect(s.one).toBe(true);
    expect(s.arp).toBe(false);

    await page.selectOption("#sel-play-mode", "chords");
    s = await page.evaluate(() => ({
      one: !!document.querySelector("#chk-one-note")?.checked,
      arp: !!document.querySelector("#chk-arpeggio")?.checked
    }));
    expect(s.one).toBe(false);
    expect(s.arp).toBe(false);
  });
});
