/**
 * Historial and Plan: what the red-team QA pass found, one case per finding.
 *
 * - Recordings belonged to the browser, not to the profile: a take saved in the
 *   main profile was listed in (and could be deleted from) every other one, and
 *   with site data blocked Historial said it could not load at all.
 * - The Pro banner drawn for one profile stayed up for the next, and closing it
 *   (or the Pro dialog it opened) dropped keyboard focus on the page body.
 * - A take's day was worked out again every time it was read, so a take rated
 *   just after midnight counted two days and a trip across time zones moved
 *   practice from one day to another.
 * - "Análisis Pro" and the coach summary: "sesiónes", a score out of 5 that was
 *   out of 10, an English focus name and a raw metric id.
 * - The Plan went on saying "esta semana" for a week that had ended, hid four
 *   of the twelve reviews, and counted minutes from a history capped at 50.
 * - Download file names used the UTC date.
 * - A recording was listed under its English catalogue title with the date
 *   twice, and its player showed no length.
 * - Cosmetics: a focus pill split across lines, a tile label cut with "…" and a
 *   calendar cell that read "hoy, hoy".
 *
 * Cases that record real audio use the synthetic voice and also run under the
 * browser lock. The cases that read a clock use Playwright's.
 */
const { test, expect } = require("@playwright/test");
const { useVoice, playVoice, stopVoice } = require("./helpers/voice");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const LIMA = "America/Lima";
const LAPTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };
/** Wednesday 23 September 2026, 10:00 in Lima: the week starts Monday the 21st. */
const NOW = "2026-09-23T10:00:00-05:00";

test.use({ timezoneId: LIMA, viewport: LAPTOP });

/** Local day key of a Date, from its own fields. */
function key(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A browser-local Pro trial that started `days` days before `from`. */
function trialSince(days, from = Date.now()) {
  return new Date(from - days * 86400000).toISOString();
}

/** One exercise's saved takes, all at `at`, each carrying `extra`. */
function takesRow(n, score, at, extra = {}) {
  const { prefix = "t", durationSec = 90, ...rest } = extra;
  return {
    completedCount: n,
    lastScore: score,
    lastAt: at,
    history: Array.from({ length: n }, (_, i) => ({
      id: `${prefix}-${i}`,
      at,
      metrics: {},
      score,
      notes: "",
      durationSec,
      ...rest
    }))
  };
}

/** Twelve saved takes over three exercises, a day ago. */
function twelveTakes() {
  const at = new Date(Date.now() - 86400000).toISOString();
  return {
    "s4-lip-trills": takesRow(5, 7, at, { prefix: "a" }),
    "s9-pitch-match": takesRow(4, 5, at, { prefix: "b" }),
    "v1-diction": takesRow(3, 6, at, { prefix: "c" })
  };
}

/** A practice-day ledger with `n`, `sec` and the exercise on each given day. */
function ledger(days, { sec = 240, n = 2, saved = false } = {}) {
  const out = {};
  days.forEach((k) => {
    out[k] = { sec, n, ex: ["s4-lip-trills"], ...(saved ? { saved: true } : {}) };
  });
  return { v: 1, days: out, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true };
}

/**
 * Load the app in a seeded state. Seeds go in once per browser context (a
 * reload keeps whatever the test did since). The site's automation flags are
 * left off unless asked for: the Pro banner, toasts and the rating card are
 * muted under them.
 * @param {import('@playwright/test').Page} page Page.
 * @param {{lang?: string, hash?: string, seed?: Object, now?: string, e2e?: boolean, session?: Object, init?: Function, initArg?: any, voice?: boolean}} [o] What to seed.
 */
async function boot(page, o = {}) {
  if (o.now) await page.clock.install({ time: new Date(o.now) });
  if (o.voice) await useVoice(page);
  await page.addInitScript(
    ({ lang, seed, e2e, session }) => {
      try {
        if (e2e) sessionStorage.setItem("vt_e2e", "1");
        Object.entries(session || {}).forEach(([k, v]) => sessionStorage.setItem(k, v));
        if (localStorage.getItem("vt_hp_seeded")) return;
        localStorage.setItem("vt_hp_seeded", "1");
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", lang);
        Object.entries(seed || {}).forEach(([k, v]) => localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)));
      } catch {
        /* ignore */
      }
    },
    { lang: o.lang || "es", seed: o.seed || {}, e2e: !!o.e2e, session: o.session || {} }
  );
  if (o.init) await page.addInitScript(o.init, o.initArg);
  await page.goto(BASE + "/" + (o.hash || ""), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && !!window.VTDays && !!window.VTStorage && !!window.VTLoop);
  if (o.now) await page.clock.runFor(500);
}

/** Open Historial from the address bar, as a link does. */
async function openHistory(page) {
  await page.evaluate(() => {
    location.hash = "#historial";
  });
  await expect(page.locator("#view-history")).toHaveClass(/active/);
  await expect(page.locator("#history-list")).not.toContainText("Cargando");
  await expect(page.locator("#history-list")).not.toContainText("Loading");
}

/** The ids of the recordings listed in Historial. */
const listedIds = (page) =>
  page.evaluate(() => [...document.querySelectorAll("#history-list .history-item[data-id]")].map((e) => e.dataset.id));

/** Save a take straight into the recordings store, the way the app saves one. */
function saveTake(page, { exerciseId = "s4-lip-trills", label = "take" } = {}) {
  return page.evaluate(
    async ({ exerciseId: ex, label: lab }) => {
      const blob = new Blob([new Uint8Array(2048)], { type: "audio/webm" });
      const r = await window.VTStorage.saveRecording({ exerciseId: ex, blob, label: lab, meta: {} });
      return r.id;
    },
    { exerciseId, label }
  );
}

/** "+ Perfil", answering the name prompt. */
async function addProfile(page, name) {
  page.once("dialog", (d) => d.accept(name));
  await page.click("#btn-profile-add");
  await expect.poll(() => page.evaluate(() => window.VTStorage.getActiveProfileId())).not.toBe("default");
}

const PRO_HISTORY = () => ({
  vt_billing_trial_started_v1: trialSince(2),
  vt_progress_v1: twelveTakes(),
  vt_settings_v1: { lastTab: "singing" }
});

/* ------------------------------------------------------------------ recordings */

test.describe("Recordings belong to the profile they were made in", () => {
  test("a take saved in Principal is not listed, played or deleted from another profile", async ({ page }) => {
    await boot(page, { seed: PRO_HISTORY() });
    const mine = await saveTake(page, { label: "Principal take" });
    // An older take, saved before recordings knew about profiles.
    const legacy = await page.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const open = indexedDB.open("vt_recordings_db", 1);
          open.onerror = () => reject(open.error);
          open.onsuccess = () => {
            const tx = open.result.transaction("recordings", "readwrite");
            tx.objectStore("recordings").put({
              id: "legacy-take",
              exerciseId: "s4-lip-trills",
              label: "Old take",
              mimeType: "audio/webm",
              createdAt: "2026-01-05T10:00:00.000Z",
              size: 2048,
              meta: {},
              data: new ArrayBuffer(2048)
            });
            tx.oncomplete = () => resolve("legacy-take");
            tx.onerror = () => reject(tx.error);
          };
        })
    );
    await openHistory(page);
    expect((await listedIds(page)).sort()).toEqual([legacy, mine].sort());

    await addProfile(page, "Bea");
    await expect(page.locator("#history-list")).toContainText("Aún no has guardado ninguna sesión");
    expect(await listedIds(page)).toEqual([]);
    // Nor can Bea reach Principal's takes by id.
    const reach = await page.evaluate(
      async ({ mine, legacy }) => {
        const out = { blob: await window.VTStorage.getRecordingBlob(mine), legacyBlob: await window.VTStorage.getRecordingBlob(legacy) };
        await window.VTStorage.deleteRecording(mine);
        await window.VTStorage.deleteRecording(legacy);
        return { blob: out.blob === null, legacyBlob: out.legacyBlob === null };
      },
      { mine, legacy }
    );
    expect(reach).toEqual({ blob: true, legacyBlob: true });

    // Bea's own take is hers alone.
    const hers = await saveTake(page, { label: "Bea take" });
    await page.selectOption("#sel-profile", "default");
    await expect.poll(() => listedIds(page).then((l) => l.sort().join())).toBe([legacy, mine].sort().join());
    // Back in Principal both takes survived what Bea tried, and play.
    const blob = await page.evaluate(async (id) => (await window.VTStorage.getRecordingBlob(id))?.size || 0, mine);
    expect(blob).toBe(2048);
    const active = await page.evaluate(() => window.VTStorage.getProfiles().list.find((p) => p.name === "Bea").id);
    await page.selectOption("#sel-profile", active);
    await expect.poll(() => listedIds(page)).toEqual([hers]);
  });

  test("Delete in Historial removes only the take on that row", async ({ page }) => {
    await boot(page, { seed: PRO_HISTORY() });
    const a = await saveTake(page, { label: "first" });
    const b = await saveTake(page, { label: "second" });
    await openHistory(page);
    page.once("dialog", (d) => d.accept());
    await page.click(`[data-del="${a}"]`);
    await expect.poll(() => listedIds(page)).toEqual([b]);
  });

  for (const how of ["throws", "fails"]) {
    test(`Historial still shows the record when IndexedDB ${how}`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await boot(page, {
        seed: PRO_HISTORY(),
        hash: "#historial",
        initArg: how,
        init: (mode) => {
          const open =
            mode === "throws"
              ? () => {
                  throw new DOMException("The operation is insecure.", "SecurityError");
                }
              : () => {
                  const req = {};
                  setTimeout(() => {
                    req.error = new DOMException("The user denied permission to access the database.", "SecurityError");
                    if (req.onerror) req.onerror(new Event("error"));
                  }, 0);
                  return req;
                };
          try {
            indexedDB.open = open;
          } catch {
            /* ignore */
          }
        }
      });
      await expect(page.locator("#view-history")).toHaveClass(/active/);
      await expect(page.locator("#history-list")).not.toContainText("Cargando");
      await expect(page.locator("#history-list")).not.toContainText("No se pudo cargar el historial");
      await expect(page.locator("#history-list .hist-top")).toBeVisible();
      await expect(page.locator("#history-list .hist-recent .open-row")).toHaveCount(3);
      await expect(page.locator("#history-list .hist-rec-empty")).toBeVisible();
      expect(errors).toEqual([]);
    });
  }
});

/* ------------------------------------------------------------------ Pro banner */

test.describe("The Pro banner", () => {
  test("a profile with no practice does not inherit the previous profile's banner", async ({ page }) => {
    await boot(page, { seed: PRO_HISTORY(), hash: "#historial" });
    await expect(page.locator("#value-banner")).toBeVisible();
    await expect(page.locator("#value-banner-text")).toContainText("Ya llevas 12 sesiones");
    await addProfile(page, "Bea");
    await expect(page.locator("#history-list")).toContainText("Aún no has guardado ninguna sesión");
    await expect(page.locator("#value-banner")).toBeHidden();
    // Hidden for Bea is not dismissed for Principal.
    await page.selectOption("#sel-profile", "default");
    await expect(page.locator("#value-banner")).toBeVisible();
    await expect(page.locator("#value-banner-text")).toContainText("Ya llevas 12 sesiones");
  });

  test("the Pro offer on the progress card comes back when the banner goes", async ({ page }) => {
    await boot(page, { seed: { vt_progress_v1: twelveTakes(), vt_settings_v1: { lastTab: "singing" } }, hash: "#historial" });
    await expect(page.locator("#value-banner")).toBeVisible();
    await expect(page.locator("#value-pulse-cta")).toBeHidden();
    await page.click("#value-banner-dismiss");
    await expect(page.locator("#value-banner")).toBeHidden();
    await expect(page.locator("#value-pulse-cta")).toBeVisible();
  });

  for (const [lang, want] of [
    ["es", "termina en 1 día. "],
    ["en", "ends in 1 day. "]
  ]) {
    test(`a trial with one day left says "1 ${lang === "es" ? "día" : "day"}" (${lang})`, async ({ page }) => {
      // Six and a half days into the browser's seven-day trial.
      await boot(page, { lang, seed: { vt_billing_trial_started_v1: trialSince(6.5), vt_progress_v1: twelveTakes(), vt_settings_v1: { lastTab: "singing" } }, hash: "#historial" });
      // The singular line is written by the accounts-and-profiles batch (it owns
      // js/i18n.js's trial lines); this case waits for it to be merged.
      const has = await page.evaluate(() => window.VTI18n.t("value.moment.trial_ending_one") !== "value.moment.trial_ending_one");
      test.skip(!has, "value.moment.trial_ending_one is added by the accounts-and-profiles batch");
      await page.evaluate(() => window.VTApp.showValueMoment("trial_ending"));
      await expect(page.locator("#value-banner")).toBeVisible();
      const text = (await page.locator("#value-banner-text").textContent()) + " ";
      expect(text).toContain(want);
      expect(text).not.toContain("(s)");
    });
  }

  for (const how of ["Escape", "close button", "dismiss"]) {
    test(`focus stays on a visible control after ${how === "dismiss" ? "Ahora no" : "Ver Pro and " + how}`, async ({ page }) => {
      await boot(page, { seed: PRO_HISTORY(), hash: "#historial" });
      await expect(page.locator("#value-banner")).toBeVisible();
      if (how === "dismiss") {
        await page.focus("#value-banner-dismiss");
        await page.keyboard.press("Enter");
        await expect(page.locator("#value-banner")).toBeHidden();
      } else {
        await page.focus("#value-banner-cta");
        await page.keyboard.press("Enter");
        await expect(page.locator("#pricing-modal")).toBeVisible();
        if (how === "Escape") await page.keyboard.press("Escape");
        else await page.click("#pricing-close");
        await expect(page.locator("#pricing-modal")).toBeHidden();
      }
      const focus = await page.evaluate(() => {
        const a = document.activeElement;
        const r = a && a.getBoundingClientRect();
        return {
          tag: a ? a.tagName : null,
          id: a ? a.id : null,
          visible: !!(r && r.width > 0 && r.height > 0),
          inHistory: !!a?.closest?.("#view-history")
        };
      });
      expect(focus.tag).not.toBe("BODY");
      expect(focus.visible).toBe(true);
      expect(focus.inHistory).toBe(true);
    });
  }
});

/* ------------------------------------------------------------------ a take's day */

/** Fake microphone for a take that is run out on a faked clock. */
function fakeMic() {
  const AC = window.AudioContext || window.webkitAudioContext;
  async function gum() {
    let ctx = window.VTSharedAudioCtx;
    if (!ctx || ctx.state === "closed") {
      ctx = new AC();
      window.VTSharedAudioCtx = ctx;
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
  if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
  navigator.mediaDevices.getUserMedia = gum;
  if (typeof MediaDevices !== "undefined") MediaDevices.prototype.getUserMedia = gum;
}

test.describe("A take belongs to the day it was sung", () => {
  test("a take rated just after midnight still counts one day", async ({ page }) => {
    // 23:58:40 on Tuesday 27 October in Lima.
    await boot(page, {
      now: "2026-10-27T23:58:40-05:00",
      e2e: true,
      session: { vt_rate_e2e: "1", vt_stepdone_e2e: "1" },
      seed: { vt_days_v1: ledger(["2026-10-24", "2026-10-25", "2026-10-26"]), vt_settings_v1: { lastTab: "singing" } },
      init: fakeMic
    });
    await page.evaluate(() => window.VTApp.openExercise("s4-lip-trills"));
    await page.clock.runFor(300);
    await page.evaluate(() => (window.VTApp.getState().timer.remaining = 50));
    await page.locator("#btn-practice-start").click();
    await expect.poll(() => page.evaluate(() => !!window.VTApp.getState().practiceLive)).toBe(true);
    await page.clock.fastForward(45000);
    await page.clock.runFor(5600); // the clock runs out at about 23:59:30 and records the take
    await expect(page.locator("#rate-q")).toBeVisible();
    // The rating is given 45 seconds later, on the 28th.
    await page.clock.fastForward(45000);
    await page.clock.runFor(500);
    expect(await page.evaluate(() => window.VTDays.dayKey())).toBe("2026-10-28");
    await page.locator('.rate-btn[data-feel="ok"]').click();
    await expect(page.locator("#score-result")).toBeVisible();
    const r = await page.evaluate(() => {
      const days = JSON.parse(localStorage.getItem("vt_days_v1")).days;
      const hist = window.VTStorage.getProgress()["s4-lip-trills"].history;
      const D = window.VTDays;
      return {
        takes: hist.length,
        takeDay: hist[0].day,
        d27: D.counts(days["2026-10-27"]),
        d28: D.counts(days["2026-10-28"]),
        row28: days["2026-10-28"] || null,
        todayDone: D.summary().todayDone
      };
    });
    expect(r.takes).toBe(1);
    // One take is one day: the 27th, where it was sung. The 28th has no practice yet.
    expect(r.d27).toBe(true);
    expect(r.d28, `the 28th counts as a practice day: ${JSON.stringify(r.row28)}`).toBe(false);
    expect(r.todayDone).toBe(false);
    expect(r.takeDay).toBe("2026-10-27");
  });

  test("a change of time zone does not move practice to another day", async ({ browser }) => {
    // Sung at 20:30 on Tuesday 27 October in Lima (01:30 UTC on the 28th) and the day before.
    const sung = {
      "s4-lip-trills": {
        completedCount: 2,
        lastScore: 6,
        lastAt: "2026-10-28T01:30:00.000Z",
        history: [
          { id: "a", at: "2026-10-28T01:30:00.000Z", day: "2026-10-27", metrics: {}, score: 6, notes: "", durationSec: 120 },
          { id: "b", at: "2026-10-27T01:30:00.000Z", day: "2026-10-26", metrics: {}, score: 6, notes: "", durationSec: 120 }
        ]
      }
    };
    const seen = {};
    for (const tz of [LIMA, "Europe/Madrid"]) {
      const ctx = await browser.newContext({ timezoneId: tz, viewport: LAPTOP, locale: "es-PE" });
      const page = await ctx.newPage();
      // The next morning, 09:00 in Madrid and 03:00 in Lima.
      await boot(page, {
        now: "2026-10-28T08:00:00Z",
        seed: {
          vt_days_v1: ledger(["2026-10-26", "2026-10-27"], { sec: 120, n: 1, saved: true }),
          vt_progress_v1: sung,
          vt_billing_trial_started_v1: trialSince(2, Date.parse("2026-10-28T08:00:00Z")),
          vt_settings_v1: { lastTab: "singing" }
        },
        hash: "#historial"
      });
      await page.clock.runFor(900);
      await expect(page.locator("#history-list .hist-recent .open-row")).toBeVisible();
      seen[tz] = await page.evaluate(() => {
        const heat = document.querySelector("#practice-heatmap")?.getAttribute("aria-label") || "";
        return {
          recent: document.querySelector("#history-list .hist-recent .open-row .meta")?.textContent.replace(/\s+/g, " ").trim() || "",
          count: Number(document.querySelector("#hist-days-count strong")?.textContent),
          heat: Number((/(\d+) días? con práctica/.exec(heat) || [])[1]),
          pulse: window.VTValuePulse.compute().practiceDays,
          todayDone: !!document.querySelector(".hist-cal td.is-today.is-done")
        };
      });
      await ctx.close();
    }
    for (const tz of Object.keys(seen)) {
      const r = seen[tz];
      expect(r.recent, `${tz}: the last take was yesterday`).toMatch(/ayer/);
      expect(r.todayDone, `${tz}: today is still open`).toBe(false);
      expect(r.count, `${tz}: calendar`).toBe(2);
      expect(r.heat, `${tz}: practice map`).toBe(2);
      expect(r.pulse, `${tz}: counter`).toBe(2);
    }
    expect(seen["Europe/Madrid"]).toEqual(seen[LIMA]);
  });

  test("a take's day travels with it through a sync merge", async ({ page }) => {
    await boot(page, { seed: {} });
    const merged = await page.evaluate(() => {
      const mk = (id, day) => ({
        "s4-lip-trills": {
          completedCount: 1,
          lastScore: 6,
          lastAt: "2026-10-28T01:30:00.000Z",
          history: [{ id, at: "2026-10-28T01:30:00.000Z", day, metrics: {}, score: 6, notes: "", durationSec: 60 }]
        }
      });
      const out = window.VTSync.mergeProgress(mk("a", "2026-10-27"), mk("b", "2026-10-26"));
      return out["s4-lip-trills"].history.map((h) => [h.id, h.day]).sort();
    });
    expect(merged).toEqual([
      ["a", "2026-10-27"],
      ["b", "2026-10-26"]
    ]);
  });

  test("a new take keeps the day it was saved on when it is rated again", async ({ page }) => {
    await boot(page, { now: "2026-10-27T23:50:00-05:00", seed: {} });
    const r = await page.evaluate(async () => {
      const first = window.VTStorage.saveExerciseResult("s4-lip-trills", { score: 6, durationSec: 60 });
      window.__first = first;
      return { day: first.day, key: window.VTDays.dayKey() };
    });
    expect(r.day).toBe(r.key);
    await page.clock.fastForward(30 * 60 * 1000); // 00:20 on the 28th
    const again = await page.evaluate(() => {
      const second = window.VTStorage.saveExerciseResult("s4-lip-trills", { replaceId: window.__first.id, score: 8, durationSec: 60 });
      return { day: second.day, now: window.VTDays.dayKey(), takes: window.VTStorage.getProgress()["s4-lip-trills"].history.length };
    });
    expect(again.takes).toBe(1);
    expect(again.day).toBe("2026-10-27");
    expect(again.now).toBe("2026-10-28");
  });
});

/* ------------------------------------------------------------------ Análisis Pro */

test.describe("Análisis Pro and the coach summary", () => {
  /** Twelve takes, the metrics of the pitch exercise low, and a plan on Pitch accuracy. */
  function analysisSeed() {
    // Three days in a row, so the coach has moved past "practise two days running".
    const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
    const progress = {
      "s4-lip-trills": takesRow(5, 7, ago(1), { prefix: "a" }),
      "s9-pitch-match": takesRow(4, 5, ago(2), { prefix: "b", metrics: { pitchComfort: 2, accuracy: 3 } }),
      "v1-diction": takesRow(3, 6, ago(3), { prefix: "c" })
    };
    return {
      vt_billing_trial_started_v1: trialSince(2),
      vt_progress_v1: progress,
      vt_settings_v1: { lastTab: "singing" },
      vt_week_plan_v1: {
        weekNumber: 1,
        element: "Pitch accuracy",
        status: "active",
        startedAt: new Date(Date.now() - 2 * 86400000).toISOString(),
        checkIns: [],
        reviews: [],
        completedElements: []
      }
    };
  }

  const shown = (page) =>
    page.evaluate(() => [document.querySelector("#value-insights"), document.querySelector("#pro-coach-focus")].map((e) => (e && !e.hidden ? e.textContent : "")).join(" || "));

  test("Spanish: plural, scale out of 10, Spanish focus and metric names", async ({ page }) => {
    await boot(page, { seed: analysisSeed(), hash: "#historial", lang: "es" });
    await expect(page.locator("#value-insights")).toBeVisible();
    const text = await shown(page);
    expect(text).not.toMatch(/sesiónes/);
    expect(text).toContain("12 sesiones");
    expect(text).toMatch(/Puntaje medio reciente: \d+\.\d\/10\./);
    expect(text).not.toMatch(/\/5\.\s/);
    expect(text).toContain("foco «Afinación»");
    expect(text).not.toContain("Pitch accuracy");
    expect(text).toContain("«Comodidad de tono»");
    expect(text).not.toMatch(/«[a-z]+[A-Z][A-Za-z]*»/);
  });

  test("English: scale out of 10, the same names the page shows", async ({ page }) => {
    await boot(page, { seed: analysisSeed(), hash: "#historial", lang: "en" });
    await expect(page.locator("#value-insights")).toBeVisible();
    const text = await shown(page);
    expect(text).toMatch(/Recent avg score: \d+\.\d\/10\./);
    expect(text).toContain("focus “Pitch accuracy”");
    expect(text).toContain("“Pitch comfort”");
    expect(text).not.toMatch(/“[a-z]+[A-Z][A-Za-z]*”/);
  });

  test("a first session is singular in both languages, in the exported summary too", async ({ page }) => {
    const at = new Date(Date.now() - 86400000).toISOString();
    await boot(page, { seed: { vt_progress_v1: { "s4-lip-trills": takesRow(1, 8, at) }, vt_settings_v1: { lastTab: "singing" } } });
    const out = await page.evaluate(() => {
      const s = window.VTValuePulse.compute();
      return { es: window.VTValuePulse.narrative(s, true), en: window.VTValuePulse.narrative(s, false) };
    });
    expect(out.es).toContain("Has completado 1 sesión en 1 ejercicio");
    expect(out.en).toContain("You've completed 1 session across 1 exercise");
    expect(out.es).toContain("8.0/10");
    expect(out.en).toContain("8.0/10");
  });
});

/* ------------------------------------------------------------------ Plan */

/** A 12-week plan, `startedDaysAgo` days into week `week`. */
function plan(o = {}) {
  const startedAt = new Date(Date.parse(NOW) - (o.startedDaysAgo ?? 3) * 86400000).toISOString();
  return {
    weekNumber: o.week || 1,
    element: o.element || "Volume",
    status: o.status || "active",
    startedAt,
    checkIns: [],
    reviews: o.reviews || [],
    completedElements: o.completed || []
  };
}

test.describe("Plan", () => {
  const dayKeys = (from, to) => {
    const out = [];
    for (let i = from; i <= to; i += 1) out.push(key(new Date(Date.parse(NOW) + i * 86400000)));
    return out;
  };

  test("a week that has ended says so, in the past tense", async ({ page }) => {
    await boot(page, {
      now: NOW,
      hash: "#plan",
      seed: { vt_week_plan_v1: plan({ startedDaysAgo: 30 }), vt_days_v1: ledger([...dayKeys(-30, -28), ...dayKeys(-2, -1)]), vt_settings_v1: { lastTab: "vocal" } }
    });
    await expect(page.locator("#plan-status")).toHaveText("Lista para revisar: Volumen");
    await expect(page.locator("#plan-days")).toHaveText("3 de 7 días practicados en esa semana");
    await expect(page.locator("#plan-review-body")).toBeVisible();
  });

  test("English: the same", async ({ page }) => {
    await boot(page, {
      now: NOW,
      hash: "#plan",
      lang: "en",
      seed: { vt_week_plan_v1: plan({ startedDaysAgo: 30 }), vt_days_v1: ledger([...dayKeys(-30, -28)]), vt_settings_v1: { lastTab: "vocal" } }
    });
    await expect(page.locator("#plan-status")).toHaveText("Ready to review: Volume");
    await expect(page.locator("#plan-days")).toHaveText("3 of 7 days practised that week");
  });

  test("a week under way still reads as this week", async ({ page }) => {
    await boot(page, {
      now: NOW,
      hash: "#plan",
      seed: { vt_week_plan_v1: plan({ startedDaysAgo: 3 }), vt_days_v1: ledger(dayKeys(-3, -1)), vt_settings_v1: { lastTab: "vocal" } }
    });
    await expect(page.locator("#plan-status")).toHaveText("Esta semana mejoras: Volumen");
    await expect(page.locator("#plan-days")).toHaveText("3 de 7 días practicados esta semana");
  });

  test("all twelve reviews are listed", async ({ page }) => {
    const els = ["Volume", "Diction", "Tonality", "Facial expression", "Pace / rate control", "Filler reduction", "Gestures / body language", "Story structure", "Resonance / soft palate", "Connection questions", "Breath support", "Strategic pause"];
    const reviews = els
      .map((e, i) => ({ week: i + 1, element: e, verdict: "improved", at: new Date(Date.parse(NOW) - (12 - i) * 7 * 86400000).toISOString(), notes: "" }))
      .reverse();
    await boot(page, {
      now: NOW,
      hash: "#plan",
      seed: { vt_week_plan_v1: plan({ week: 12, startedDaysAgo: 8, element: "Strategic pause", reviews, completed: els.slice(0, 11) }), vt_settings_v1: { lastTab: "vocal" } }
    });
    await expect(page.locator("#plan-reviews .history-item")).toHaveCount(12);
    await expect(page.locator("#plan-reviews .history-item").first()).toContainText("Semana 12");
    await expect(page.locator("#plan-reviews .history-item").last()).toContainText("Semana 1:");
  });

  test("a focus already improved is one word-pill that does not split", async ({ page }) => {
    const els = ["Volume", "Diction", "Tonality", "Facial expression", "Pace / rate control", "Filler reduction", "Gestures / body language", "Story structure", "Resonance / soft palate", "Connection questions", "Breath support"];
    for (const [lang, size] of [["es", PHONE], ["en", PHONE], ["es", LAPTOP]]) {
      await page.setViewportSize(size);
      await boot(page, {
        now: NOW,
        hash: "#plan",
        lang,
        seed: { vt_week_plan_v1: plan({ week: 12, status: "idle", completed: els }), vt_settings_v1: { lastTab: "vocal" } }
      });
      const pills = await page.evaluate(() =>
        [...document.querySelectorAll("#plan-completed-elements .pill")].map((p) => ({
          t: p.textContent,
          boxes: p.getClientRects().length,
          font: getComputedStyle(p).fontFamily,
          parentFont: getComputedStyle(p.parentElement).fontFamily,
          overflow: document.documentElement.scrollWidth - innerWidth
        }))
      );
      expect(pills.length, `${lang} ${size.width}`).toBe(11);
      expect(pills.filter((p) => p.boxes !== 1).map((p) => p.t), `${lang} ${size.width}: pills split across lines`).toEqual([]);
      expect(pills.filter((p) => p.font !== p.parentFont).map((p) => p.t), `${lang}: pills in the code font`).toEqual([]);
      expect(Math.max(...pills.map((p) => p.overflow))).toBeLessThanOrEqual(0);
      await page.evaluate(() => localStorage.removeItem("vt_hp_seeded"));
      await page.goto("about:blank");
    }
  });
});

/* ------------------------------------------------------------------ Historial */

test.describe("Historial", () => {
  test("Minutos counts every take, not the last 50 of each exercise", async ({ page }) => {
    // 60 two-minute takes of one exercise on 60 days: the history keeps 50.
    const days = [];
    const history = [];
    for (let i = 59; i >= 0; i -= 1) {
      const d = new Date(Date.parse(NOW) - i * 86400000);
      days.push(key(d));
      if (history.length < 50) history.unshift({ id: `h${i}`, at: d.toISOString(), metrics: {}, score: 6, notes: "", durationSec: 120 });
    }
    history.sort((a, b) => (a.at < b.at ? 1 : -1));
    await boot(page, {
      now: NOW,
      hash: "#historial",
      seed: {
        vt_days_v1: ledger(days, { sec: 120, n: 1, saved: true }),
        vt_progress_v1: { "s4-lip-trills": { completedCount: 60, lastScore: 6, lastAt: history[0].at, history } },
        vt_settings_v1: { lastTab: "singing" }
      }
    });
    await expect(page.locator("#vp-sessions")).toHaveText("60");
    await expect(page.locator("#vp-minutes")).toHaveText("120");
  });

  test("Minutos still reads the takes when there is no ledger", async ({ page }) => {
    const at = new Date(Date.parse(NOW) - 86400000).toISOString();
    await boot(page, {
      now: NOW,
      hash: "#historial",
      seed: { vt_progress_v1: { "s4-lip-trills": takesRow(4, 6, at, { durationSec: 150 }) }, vt_settings_v1: { lastTab: "singing" } }
    });
    // Four takes of 2.5 minutes; the ledger rebuilt from them says the same.
    await expect(page.locator("#vp-minutes")).toHaveText("10");
  });

  for (const lang of ["es", "en"]) {
    test(`the calendar does not say "today" twice (${lang})`, async ({ page }) => {
      await boot(page, {
        now: NOW,
        hash: "#historial",
        lang,
        seed: {
          vt_days_v1: ledger(["2026-09-21", "2026-09-22"]),
          vt_progress_v1: { "s4-lip-trills": takesRow(1, 6, "2026-09-22T15:00:00.000Z") },
          vt_settings_v1: { lastTab: "vocal" }
        }
      });
      const open = await page.locator(".hist-cal td.is-today .sr-only").textContent();
      expect(open).not.toMatch(/(hoy|today)\W+(hoy|today)/i);
      expect(open).toMatch(/hoy|today/i);
      // Today practised: the cell still says it is today, once, and that it was practised.
      await page.evaluate(() => window.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120, saved: true }));
      await page.evaluate(() => window.VTApp.setView("home"));
      await page.evaluate(() => {
        location.hash = "#historial";
      });
      const done = await page.locator(".hist-cal td.is-today.is-done .sr-only").textContent();
      expect(done.match(/hoy|today/gi) || []).toHaveLength(1);
    });
  }

  for (const lang of ["es", "en"]) {
    test(`no progress tile ends in an ellipsis on a phone (${lang})`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      const at = new Date(Date.parse(NOW) - 86400000).toISOString();
      await boot(page, {
        now: NOW,
        hash: "#historial",
        lang,
        seed: {
          vt_progress_v1: { "s4-lip-trills": takesRow(3, 7, at), "s9-pitch-match": takesRow(2, 5, at, { prefix: "p" }) },
          vt_hold_logs_v1: [{ at, seconds: 6.2 }],
          vt_settings_v1: { lastTab: "singing" }
        }
      });
      await expect(page.locator("#vp-hold-stat")).toBeVisible();
      const tiles = await page.evaluate(() =>
        [...document.querySelectorAll("#value-pulse-grid .value-stat:not([hidden]) > span")].map((s) => ({
          t: s.textContent,
          cut: s.scrollWidth > s.clientWidth + 1,
          overflow: getComputedStyle(s).textOverflow === "ellipsis" && getComputedStyle(s).overflow !== "visible"
        }))
      );
      expect(tiles.length).toBeGreaterThanOrEqual(4);
      expect(tiles.filter((t) => t.cut).map((t) => t.t), "tile labels cut short").toEqual([]);
      expect(tiles.filter((t) => t.overflow).map((t) => t.t), "tile labels that would end in an ellipsis").toEqual([]);
    });
  }
});

/* ------------------------------------------------------------------ file names */

test.describe("Downloaded file names use the learner's own date", () => {
  for (const [tz, utc, local, name] of [
    ["Pacific/Kiritimati", "2026-10-27T19:00:00Z", "2026-10-28", "09:00 on the 28th (UTC+14)"],
    [LIMA, "2026-10-26T04:50:00Z", "2026-10-25", "23:50 on the 25th (UTC-5)"]
  ]) {
    test(`${tz}, ${name}`, async ({ browser }) => {
      const ctx = await browser.newContext({ timezoneId: tz, viewport: LAPTOP });
      const page = await ctx.newPage();
      await boot(page, {
        now: utc,
        seed: { vt_billing_trial_started_v1: trialSince(2, Date.parse(utc)), vt_progress_v1: twelveTakes(), vt_settings_v1: { lastTab: "singing" } }
      });
      await page.evaluate(() => {
        window.__dl = [];
        HTMLAnchorElement.prototype.click = function () {
          window.__dl.push(this.download);
        };
      });
      await page.evaluate(() => window.VTApp.openPricing());
      await page.clock.runFor(500);
      await page.click("#btn-export-progress");
      await page.clock.runFor(300);
      const names = await page.evaluate(() => window.__dl);
      expect(names).toEqual([`vocal-studio-progress-${local}.json`, `vocal-studio-coach-summary-${local}.txt`]);
      await ctx.close();
    });
  }
});

/* ------------------------------------------------------------------ recording labels and length */

test.describe("A recording is named in the language of the page", () => {
  test("the row heading is the exercise's own name, the date is said once, and it follows the language", async ({ page }) => {
    await boot(page, { seed: { vt_progress_v1: twelveTakes(), vt_settings_v1: { lastTab: "singing" } } });
    // Saved by an older version: the English catalogue title and the browser's date.
    const id = await saveTake(page, { label: "Lip Trills (SOVT Warm-up) · 28/10/2026, 6:59:31 a. m." });
    await openHistory(page);
    const row = () =>
      page.evaluate((id) => {
        const it = document.querySelector(`#history-list .history-item[data-id="${id}"]`);
        const ex = window.VT_EXERCISES.singing.find((e) => e.id === "s4-lip-trills");
        return {
          heading: it.querySelector("strong").textContent,
          meta: it.querySelector(".meta").textContent,
          name: window.VTI18n.exTitle(ex),
          lang: window.VTI18n.lang
        };
      }, id);
    const es = await row();
    expect(es.lang).toBe("es");
    expect(es.heading).toBe(es.name);
    expect(es.heading).not.toMatch(/Lip Trills/);
    expect(es.meta.match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || []).toHaveLength(1);
    expect(es.meta).toMatch(/\d+ KB/);
    await page.click("#btn-lang");
    await expect.poll(async () => (await row()).lang).toBe("en");
    const en = await row();
    expect(en.heading).toBe(en.name);
    expect(en.name).not.toBe(es.name);
    expect(en.meta.match(/\d{1,2}\/\d{1,2}\/\d{4}/g) || []).toHaveLength(1);
  });

  test("a label with markup, on a take whose exercise is gone, is shown as text", async ({ page }) => {
    await boot(page, { seed: { vt_progress_v1: twelveTakes(), vt_settings_v1: { lastTab: "singing" } } });
    const id = await saveTake(page, { exerciseId: "retired-exercise", label: "Warm-up <b>loud</b> · 1 Jan" });
    await openHistory(page);
    const heading = page.locator(`#history-list .history-item[data-id="${id}"] strong`);
    await expect(heading).toHaveText("Warm-up <b>loud</b> · 1 Jan");
    expect(await heading.locator("b").count()).toBe(0);
  });
});

test.describe("A recorded take has a length", () => {
  test.skip(({ browserName }) => browserName !== "chromium", "MediaRecorder WebM without a duration is a Chromium trait");
  test.setTimeout(120000);

  test("the take's player and Historial's player know how long it is, and the saved label is in Spanish", async ({ page }) => {
    await boot(page, { voice: true, seed: { vt_settings_v1: { lastTab: "vocal" } }, hash: "#ejercicio/v10-power-pause" });
    await page.waitForFunction(() => document.getElementById("btn-practice-start")?.getBoundingClientRect().width > 8);
    await page.click("#btn-practice-start");
    await page.waitForFunction(() => document.body.classList.contains("practice-live"));
    await playVoice(page, "speech");
    await page.waitForTimeout(5000);
    await page.click("#btn-practice-stop");
    await stopVoice(page);
    const audio = page.locator("#playback-area audio");
    await expect(audio).toHaveCount(1, { timeout: 10000 });
    const length = (loc) =>
      loc.evaluate(async (a) => {
        const done = () => Number.isFinite(a.duration) && a.duration > 0;
        for (let i = 0; i < 40 && !done(); i += 1) await new Promise((r) => setTimeout(r, 100));
        return { duration: a.duration, paused: a.paused, time: a.currentTime };
      });
    const mine = await length(audio);
    expect(Number.isFinite(mine.duration), `duration ${mine.duration}`).toBe(true);
    expect(mine.duration).toBeGreaterThan(3);
    expect(mine.duration).toBeLessThan(9);
    expect(mine.time).toBeLessThan(0.5);
    // Saved, then listed in Historial under the Spanish title with a player that knows its length.
    await page.click("#btn-save-rec");
    await expect(page.locator("#btn-save-rec")).toBeDisabled();
    const label = await page.evaluate(async () => (await window.VTStorage.listRecordings())[0].label);
    expect(label).toMatch(/^El poder de la pausa · /);
    expect(label).not.toMatch(/Power of the Pause/);
    await page.evaluate(() => {
      location.hash = "#historial";
    });
    await expect(page.locator("#history-list [data-play]")).toBeVisible();
    await page.click("#history-list [data-play]");
    const mineInHistory = await length(page.locator("#history-player audio"));
    expect(Number.isFinite(mineInHistory.duration), `Historial duration ${mineInHistory.duration}`).toBe(true);
    expect(mineInHistory.duration).toBeGreaterThan(3);
    // "Escuchar" still plays: finding the length must not leave it parked at the start.
    await expect
      .poll(() => page.locator("#history-player audio").evaluate((a) => !a.paused || a.currentTime > 0.2), { timeout: 4000 })
      .toBe(true);
  });
});
