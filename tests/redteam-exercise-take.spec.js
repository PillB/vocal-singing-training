/**
 * Red-team QA, batch "exercise-take": what happens during and around a take.
 *
 *  - The piano's pending note callbacks no longer outlive Detener or the
 *    exercise: the chord badge and the practice target stay still after a stop
 *    and a new exercise opens with "—".
 *  - "↻ Otra vez" after a rated take starts a new take: an unanswered card,
 *    its own history entry and its own seconds on today's row.
 *  - Chrome's benign "ResizeObserver loop" notice no longer reads as
 *    "Algo falló / Something failed".
 *  - The bottom rail fits on laptops (v12's mic slider sat over the octave
 *    "−") and on short landscape screens, with the piano options behind
 *    "Piano ▾" there.
 *  - The microphone notice can be put away when the exercise runs without the
 *    mic, says "no microphone found" when there is none, and the start toast
 *    does not say "grabando" when nothing records.
 *  - "1 nota" walks the tones to sing, not the left hand's doubled bass.
 *  - Speaking drills log no held notes.
 *  - The chord badge keeps its note name on a phone; no lone "Tiempo" pill.
 *
 * Titles marked [L] depend on audio or timers: run them inside the browser
 * lock as well (flock …/browser.lock npx playwright test … -g "\[L\]").
 * Toast cases leave sessionStorage.vt_e2e unset (toast() is silent under it).
 */
const { test, expect } = require("@playwright/test");
const { voiceSource } = require("./helpers/voice");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const PHONE = { width: 390, height: 844 };
const LAPTOP = { width: 1280, height: 800 };
const LOCAL = /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:)/;
// The primer and the coach-marks only run for a person, not a headless browser.
const HUMAN_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

/* ------------------------------------------------------------------ setup */

/** Language, tour seen, optional e2e quiet and storage, before the app loads. */
async function seed(page, { lang = "es", e2e = false, rate = false, tab = null, days = false, storage = {} } = {}) {
  await page.addInitScript(
    ({ lang, e2e, rate, tab, days, storage }) => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", lang);
        if (tab) localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: tab }));
        Object.entries(storage).forEach(([k, v]) => (v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v)));
        if (e2e) sessionStorage.setItem("vt_e2e", "1");
        if (rate) sessionStorage.setItem("vt_rate_e2e", "1");
        // Practised the three days before today, written once per tab
        if (days && !sessionStorage.getItem("vt_seeded_days")) {
          sessionStorage.setItem("vt_seeded_days", "1");
          const pad = (n) => String(n).padStart(2, "0");
          const rows = {};
          [-3, -2, -1].forEach((off) => {
            const d = new Date();
            d.setHours(12, 0, 0, 0);
            d.setDate(d.getDate() + off);
            rows[`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`] = { sec: 240, n: 2, ex: ["s4-lip-trills"] };
          });
          localStorage.setItem("vt_days_v1", JSON.stringify({ v: 1, days: rows, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true }));
        }
      } catch {
        /* ignore */
      }
    },
    { lang, e2e, rate, tab, days, storage }
  );
  // Only this server: the worker and Google are not part of these cases.
  await page.route((url) => !LOCAL.test(url.href), (route) => route.abort("blockedbyclient"));
}

/** A microphone that gives a fresh silent stream on every request, as a real one does. */
async function silentMic(page) {
  await page.addInitScript(() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    async function fakeGUM() {
      const ctx = new AC();
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
    navigator.mediaDevices.getUserMedia = fakeGUM;
  });
}

/** getUserMedia fails as a browser does: NotAllowedError (refused) or NotFoundError (no device). */
async function failingMic(page, kind) {
  const name = kind === "deny" ? "NotAllowedError" : "NotFoundError";
  await page.addInitScript((name) => {
    if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
    navigator.mediaDevices.getUserMedia = async () => {
      const e = new Error(name === "NotAllowedError" ? "Permission denied" : "Requested device not found");
      e.name = name;
      throw e;
    };
  }, name);
}

/** The synthetic singer/speaker of qa/synthetic-voice.js as the microphone. */
async function voiceMic(page) {
  await page.addInitScript({ content: voiceSource() });
}

/** Every toast shown, and every ResizeObserver loop notice the window reports. */
async function watchToasts(page) {
  await page.addInitScript(() => {
    window.__toasts = [];
    window.__roErrors = [];
    window.addEventListener("error", (e) => {
      if (/ResizeObserver loop/.test(String(e && e.message))) window.__roErrors.push(String(e.message));
    });
    const hook = () => {
      const t = document.getElementById("toast");
      if (!t) return;
      new MutationObserver(() => {
        const s = (t.textContent || "").trim();
        if (s && t.classList.contains("show") && window.__toasts[window.__toasts.length - 1] !== s) window.__toasts.push(s);
      }).observe(t, { attributes: true, childList: true, characterData: true, subtree: true });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hook);
    else hook();
  });
}

async function settle(page, ms = 350) {
  await page.waitForTimeout(ms);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

/** Open an exercise by its address (no tour, no primer). */
async function openEx(page, id, { query = "?e2e=1" } = {}) {
  await page.goto(`${BASE}/${query}#ejercicio/${id}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(
    (x) => {
      const b = document.getElementById("btn-practice-start");
      return window.VTApp?.getState?.().exercise?.id === x && b && b.getBoundingClientRect().width > 8;
    },
    id,
    { timeout: 15000 }
  );
  await settle(page, 400);
}

const waitLive = (page, ms = 8000) =>
  page.waitForFunction(() => document.body.classList.contains("practice-live"), null, { timeout: ms });

/** End the step's clock in `ms` (the clock's own end, sooner). */
const timeUpIn = (page, ms = 600) =>
  page.evaluate((ms) => {
    const st = window.VTApp.getState();
    if (st.timer && st.timer.running) st.timer.endAt = performance.now() + ms;
  }, ms);

/** Log every change of the chord badge and of the practice target, with times. */
const startNoteLog = (page) =>
  page.evaluate(() => {
    window.__noteLog = [];
    const cn = document.getElementById("chord-now");
    new MutationObserver(() => window.__noteLog.push({ t: performance.now(), k: "badge", v: cn.textContent })).observe(cn, {
      childList: true,
      characterData: true,
      subtree: true
    });
    let last = window.VTApp.getState().practice?.targetFreq || null;
    setInterval(() => {
      const f = window.VTApp.getState().practice?.targetFreq || null;
      if (f !== last) {
        last = f;
        window.__noteLog.push({ t: performance.now(), k: "target", v: f && Math.round(f * 10) / 10 });
      }
    }, 50);
  });

/* ------------------------------------------------------------------ the piano after Stop */

test.describe("piano notes end with the take", () => {
  test.describe.configure({ timeout: 90000 });

  test("[L] after Detener the badge and the target stay still, and the next take plays one pass", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await seed(page, { lang: "es", e2e: true });
    await silentMic(page);
    await openEx(page, "s2-solfege-chords");
    await startNoteLog(page);
    await page.click("#btn-practice-start");
    await waitLive(page);
    await page.waitForTimeout(4500);
    await page.click("#btn-practice-stop");
    const stopAt = await page.evaluate(() => performance.now());
    await page.waitForTimeout(6500);
    const after = await page.evaluate((s) => window.__noteLog.filter((e) => e.t > s + 300).map((e) => `${e.k} ${e.v}`), stopAt);
    expect(after, "nothing moves once the take is stopped").toEqual([]);

    // The next take straight away: one note every ~4 s, so at most 3 badge steps in 8 s
    const t2 = await page.evaluate(() => performance.now());
    await page.click("#btn-practice-start");
    await waitLive(page);
    await page.waitForTimeout(8000);
    const take2 = await page.evaluate((s) => window.__noteLog.filter((e) => e.t > s && e.k === "badge").map((e) => e.v), t2);
    await page.click("#btn-practice-stop").catch(() => {});
    expect(take2.length, `badge steps in 8 s: ${JSON.stringify(take2)}`).toBeLessThanOrEqual(3);
  });

  test("[L] s1 opened right after s2 shows '—' and keeps its own target", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await seed(page, { lang: "es", e2e: true });
    await silentMic(page);
    await openEx(page, "s2-solfege-chords");
    await page.click("#btn-practice-start");
    await waitLive(page);
    await page.waitForTimeout(4500);
    await page.click("#btn-practice-stop");
    await settle(page, 300);
    await page.evaluate(() => window.VTApp.openExercise("s1-vocal-fry"));
    await settle(page, 200);
    const seen = await page.evaluate(async () => {
      const cn = document.getElementById("chord-now");
      const first = { badge: cn.textContent.trim(), f: window.VTApp.getState().practice?.targetFreq || 0 };
      const rows = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 6500) {
        const s = window.VTApp.getState();
        rows.push({ ex: s.exercise?.id, badge: cn.textContent.trim(), f: s.practice?.targetFreq || 0 });
        await new Promise((r) => setTimeout(r, 100));
      }
      return { first, rows };
    });
    expect(seen.first.badge).toBe("—");
    const moved = seen.rows.filter((r) => r.ex === "s1-vocal-fry" && (r.badge !== "—" || r.f !== seen.first.f));
    expect(moved.slice(0, 3), "s2's notes reach s1").toEqual([]);
  });
});

/* ------------------------------------------------------------------ "↻ Otra vez" */

test("[L] ↻ Otra vez after a rated take starts an unanswered take that is saved and counted", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize(PHONE);
  await seed(page, { lang: "es", e2e: true, rate: true });
  await silentMic(page);
  await openEx(page, "s4-lip-trills");
  const read = () =>
    page.evaluate(() => {
      const d = new Date();
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const row = ((window.VTStorage.getDays() || {}).days || {})[k] || {};
      const p = (window.VTStorage.getProgress() || {})["s4-lip-trills"] || {};
      return { daySec: row.sec || 0, entries: (p.history || []).length };
    });
  const card = () =>
    page.evaluate(() => ({
      note: (document.getElementById("rate-note")?.textContent || "").trim(),
      pressed: [...document.querySelectorAll(".rate-btn[aria-pressed=true]")].map((b) => b.textContent.trim())
    }));

  // Take 1: 20 s on its clock (a rating needs 15 s of practice), to the end of its time, then "Normal"
  await page.click("#btn-practice-start");
  await waitLive(page);
  await page.evaluate(() => {
    const sp = window.VTApp.getState().sessionPractice;
    if (sp.liveSince != null) sp.liveSince -= 20000;
  });
  await page.waitForTimeout(2000);
  await timeUpIn(page, 500);
  await page.locator('.rate-btn[data-feel="ok"]').waitFor({ state: "visible", timeout: 8000 });
  await page.click('.rate-btn[data-feel="ok"]');
  await settle(page, 800);
  const after1 = await read();
  expect((await card()).pressed.length, "take 1 is rated").toBe(1);

  // Take 2: "↻ Otra vez", 50 s of practice on its clock (a 5-minute step credits 45 s), Detener
  await page.click("#btn-practice-start");
  await waitLive(page);
  await page.evaluate(() => {
    const sp = window.VTApp.getState().sessionPractice;
    if (sp.liveSince != null) sp.liveSince -= 50000;
  });
  await page.waitForTimeout(1200);
  await page.click("#btn-practice-stop");
  await settle(page, 900);
  const c2 = await card();
  expect(c2.pressed, "the second take's card is not pre-answered").toEqual([]);
  expect(c2.note).not.toMatch(/Guardado|Saved/);

  // The learner leaves without rating: the practice still counts
  await page.click("#btn-back-home");
  await settle(page, 700);
  if (await page.locator("#leave-modal").isVisible().catch(() => false)) await page.click("#leave-discard");
  await settle(page, 700);
  const after2 = await read();
  expect(after2.entries, "a second history entry").toBe(after1.entries + 1);
  expect(after2.daySec - after1.daySec, "today's row grows by the second take").toBeGreaterThanOrEqual(45);
});

/* ------------------------------------------------------------------ false "Algo falló" */

test.describe("no false 'Algo falló / Something failed'", () => {
  /** The generic failure text in both languages, from the page's own table. */
  const failTexts = (page) => page.evaluate(() => [VTI18n.strings.es["toast.genericFail"], VTI18n.strings.en["toast.genericFail"]]);
  const failures = async (page) => {
    const texts = await failTexts(page);
    return page.evaluate((texts) => (window.__toasts || []).filter((s) => texts.some((t) => s.includes(t))), texts);
  };

  test("EN phone: s5, s10 and s13 opened from the catalog", async ({ browser }) => {
    test.setTimeout(90000);
    const bad = [];
    for (const id of ["s5-sirens", "s10-five-note", "s13-arpeggio-match"]) {
      const ctx = await browser.newContext({ viewport: PHONE });
      const page = await ctx.newPage();
      await seed(page, { lang: "en", tab: "singing" });
      await silentMic(page);
      await watchToasts(page);
      await page.goto(`${BASE}/?e2e=1`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !!window.VTApp && !!document.querySelector("#exercise-list .card-ex"));
      await settle(page, 400);
      const card = page.locator(`#exercise-list .card-ex[data-id="${id}"]`).first();
      await card.scrollIntoViewIfNeeded();
      await card.click();
      await settle(page, 1500);
      const r = await page.evaluate(() => ({ ex: window.VTApp.getState().exercise?.id, ro: window.__roErrors.length }));
      expect(r.ex).toBe(id);
      const f = await failures(page);
      if (f.length || r.ro) bad.push(`${id}: toasts ${JSON.stringify(f)}, ResizeObserver loop notices ${r.ro}`);
      await ctx.close();
    }
    expect(bad).toEqual([]);
  });

  test("[L] EN phone: a live routine step left with Back and come back to with Forward, twice", async ({ browser }) => {
    test.setTimeout(150000);
    const bad = [];
    for (let rep = 0; rep < 2; rep++) {
      const ctx = await browser.newContext({ viewport: PHONE });
      const page = await ctx.newPage();
      await seed(page, { lang: "en", tab: "singing", days: true });
      await voiceMic(page);
      await watchToasts(page);
      await page.goto(`${BASE}/?e2e=1`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !!window.VTApp && !!window.VTSession);
      await settle(page, 600);
      await page.click("#btn-more-ways");
      await page.selectOption("#session-path", "basic");
      await page.click("#btn-structured");
      await settle(page, 900);
      await page.click("#btn-practice-start");
      await waitLive(page);
      await page.evaluate(() => window.__VTVoice.play("airLadder"));
      await page.waitForTimeout(2000);
      await timeUpIn(page, 500);
      await page.locator("#btn-step-done-next").waitFor({ state: "visible", timeout: 8000 });
      await page.click("#btn-step-done-next");
      await settle(page, 900);
      await page.click("#btn-practice-start");
      await waitLive(page);
      await page.evaluate(() => window.__VTVoice.play("fryClear"));
      await page.waitForTimeout(17000);
      await page.goBack();
      await settle(page, 800);
      if (await page.locator("#leave-modal").isVisible().catch(() => false)) await page.click("#leave-discard");
      await page.evaluate(() => window.__VTVoice && window.__VTVoice.stop());
      await page.goForward();
      await settle(page, 1500);
      const f = await failures(page);
      const ro = await page.evaluate(() => window.__roErrors.length);
      if (f.length || ro) bad.push(`run ${rep + 1}: toasts ${JSON.stringify(f)}, ResizeObserver loop notices ${ro}`);
      await ctx.close();
    }
    expect(bad).toEqual([]);
  });

  test("EN phone: s9 started through the microphone primer", async ({ browser }) => {
    test.setTimeout(60000);
    const ctx = await browser.newContext({ viewport: PHONE, userAgent: HUMAN_UA });
    const page = await ctx.newPage();
    await seed(page, { lang: "en", tab: "singing", storage: { vt_mic_primed_v1: null, vt_ui_tour_off_v1: "1" } });
    await voiceMic(page);
    await watchToasts(page);
    await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTApp);
    await settle(page, 600);
    await page.evaluate(() => window.VTApp.openExercise("s9-pitch-match"));
    await settle(page, 1200);
    await page.click("#btn-practice-start");
    await page.locator("[data-primer-ok]").waitFor({ state: "visible", timeout: 8000 });
    await page.click("[data-primer-ok]");
    await waitLive(page);
    await page.waitForTimeout(2500);
    const f = await failures(page);
    const ro = await page.evaluate(() => window.__roErrors.length);
    await ctx.close();
    expect({ toasts: f, roLoopNotices: ro }).toEqual({ toasts: [], roLoopNotices: 0 });
  });
});

/* ------------------------------------------------------------------ the bottom rail */

/**
 * The bottom rail of the open exercise: its visible groups must not overlap,
 * nothing may run past the stage's right edge, the mic box must hold its own
 * contents, and the octave "−" must get its own clicks.
 */
function probeRail() {
  // Runs in the page (page.evaluate(probeRail)): its helpers live inside it.
  const overlaps = (kids) => {
    const found = [];
    for (let i = 0; i < kids.length; i++)
      for (let j = i + 1; j < kids.length; j++) {
        const a = kids[i].b;
        const c = kids[j].b;
        const x = Math.min(a.right, c.right) - Math.max(a.left, c.left);
        const y = Math.min(a.bottom, c.bottom) - Math.max(a.top, c.top);
        if (x > 0.5 && y > 0.5) found.push(`${kids[i].n} overlaps ${kids[j].n} by ${Math.round(x)}x${Math.round(y)}px`);
      }
    return found;
  };
  const rail = document.getElementById("hud-bottom-rail");
  const stage = document.getElementById("highway-stage");
  if (!rail || !stage || !rail.offsetParent) return [];
  const shown = (e) => {
    const cs = getComputedStyle(e);
    const b = e.getBoundingClientRect();
    return cs.display !== "none" && cs.visibility !== "hidden" && b.width > 0 && b.height > 0 && !e.closest("[hidden]");
  };
  const kids = [...rail.children].filter(shown).map((e) => ({ n: e.id || e.className, b: e.getBoundingClientRect() }));
  const out = overlaps(kids);
  const sr = stage.getBoundingClientRect();
  let over = 0;
  rail.querySelectorAll("*").forEach((e) => {
    if (shown(e)) over = Math.max(over, e.getBoundingClientRect().right - sr.right);
  });
  if (over > 1) out.push(`runs ${Math.round(over)}px past the stage's right edge`);
  const mic = document.getElementById("mic-sens-hud");
  if (mic && shown(mic) && mic.scrollWidth - mic.clientWidth > 2) out.push(`the mic box needs ${mic.scrollWidth - mic.clientWidth}px more than it has`);
  const down = document.getElementById("btn-oct-down");
  if (down && shown(down)) {
    const b = down.getBoundingClientRect();
    const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
    if (at && !(at === down || down.contains(at))) out.push(`the octave "−" is covered by ${at.id || at.className}`);
  }
  return out;
}

async function allExercises(page) {
  return page.evaluate(() => [...(window.VT_EXERCISES.vocal || []), ...(window.VT_EXERCISES.singing || [])].map((e) => e.id));
}

test.describe("bottom rail on a laptop", () => {
  for (const w of [1280, 1366, 1440]) {
    test(`every exercise at ${w}x800, ES and EN: no group over another, "−" gets its clicks`, async ({ browser }) => {
      test.setTimeout(240000);
      const bad = [];
      for (const lang of ["es", "en"]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: 800 } });
        const page = await ctx.newPage();
        await seed(page, { lang, e2e: true });
        await openEx(page, "v12-melodic-speech");
        for (const id of await allExercises(page)) {
          await page.evaluate((x) => window.VTApp.openExercise(x), id);
          await settle(page, 250);
          const r = await page.evaluate(probeRail);
          if (r.length) bad.push(`${lang} ${id}: ${r.join("; ")}`);
        }
        await ctx.close();
      }
      expect(bad).toEqual([]);
    });
  }
});

test.describe("bottom rail on a short landscape screen", () => {
  for (const [w, h] of [
    [640, 360],
    [640, 400],
    [667, 375],
    [740, 360]
  ]) {
    test(`every exercise at ${w}x${h}, ES and EN: one row that fits; Piano ▾ opens every option`, async ({ browser }) => {
      test.setTimeout(300000);
      const bad = [];
      for (const lang of ["es", "en"]) {
        const ctx = await browser.newContext({ viewport: { width: w, height: h } });
        const page = await ctx.newPage();
        await seed(page, { lang, e2e: true });
        await openEx(page, "v12-melodic-speech");
        for (const id of await allExercises(page)) {
          await page.evaluate((x) => window.VTApp.openExercise(x), id);
          await settle(page, 250);
          const r = await page.evaluate(probeRail);
          if (r.length) bad.push(`${lang} ${id}: ${r.join("; ")}`);
          const toggle = page.locator("#btn-toggle-piano");
          if (!(await toggle.isVisible())) continue;
          await toggle.click();
          await settle(page, 450);
          // Every option the open panel shows is on screen and gets its own click
          const opts = await page.evaluate(() => {
            const host = document.getElementById("piano-mini-opts");
            const sel = "#btn-oct-down, #btn-oct-up, #chk-range-auto, .piano-opt input, .piano-opt select, #btn-toggle-piano";
            return [...host.querySelectorAll(sel)]
              .filter((e) => getComputedStyle(e).display !== "none" && !e.closest("[hidden]") && e.closest(".piano-opt, .hud-oct, #btn-toggle-piano") && getComputedStyle(e.closest(".piano-opt, .hud-oct, #btn-toggle-piano")).display !== "none")
              .map((e) => e.id || e.closest("label")?.textContent.trim() || e.tagName);
          });
          const blocked = [];
          for (const name of opts) {
            const res = await page.evaluate((name) => {
              const host = document.getElementById("piano-mini-opts");
              const sel = "#btn-oct-down, #btn-oct-up, #chk-range-auto, .piano-opt input, .piano-opt select, #btn-toggle-piano";
              const el = [...host.querySelectorAll(sel)].find((e) => (e.id || e.closest("label")?.textContent.trim() || e.tagName) === name);
              if (!el) return "gone";
              // As a learner would: by scrolling the page, at once. Where the open
              // piano unsticks the stage (VG-30) the options scroll away with it.
              // scrollIntoView() also scrolls the stage's own clipped box, which
              // no finger can, and so hid an option cut at its edge; and with
              // the page's smooth scrolling it had not moved when this measured.
              const b0 = el.getBoundingClientRect();
              window.scrollBy({ top: b0.top + b0.height / 2 - innerHeight / 2, behavior: "instant" });
              const b = el.getBoundingClientRect();
              const stage = document.getElementById("highway-stage").getBoundingClientRect();
              if (b.width < 2 || b.height < 2) return "no size";
              if (b.left < stage.left - 1 || b.right > stage.right + 1 || b.right > innerWidth) return `cut at the edge (${Math.round(b.left)}-${Math.round(b.right)})`;
              const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
              const box = el.closest("label") || el;
              return at && (at === el || box.contains(at)) ? null : `covered by ${at ? at.id || at.className : "nothing"}`;
            }, name);
            if (res) blocked.push(`${name}: ${res}`);
          }
          if (blocked.length) bad.push(`${lang} ${id} after Piano ▾: ${blocked.join("; ")}`);
          await page.locator("#btn-toggle-piano").click();
          await settle(page, 300);
        }
        await ctx.close();
      }
      expect(bad).toEqual([]);
    });
  }
});

/* ------------------------------------------------------------------ the microphone notice */

test.describe("microphone notice", () => {
  /** Buttons, selects and the clock on the stage that the notice's box sits over. */
  const coveredByNotice = (page) =>
    page.evaluate(() => {
      const box = document.getElementById("mic-blocked");
      const out = [];
      for (const el of document.querySelectorAll("#view-exercise button, #view-exercise select, #timer-display, #practice-status")) {
        if (box.contains(el) || el.closest("[hidden]")) continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4 || r.bottom < 0 || r.top > innerHeight) continue;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        if (hit && box.contains(hit)) out.push(el.id || (el.innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30));
      }
      return out;
    });
  const stageNotice = (page) =>
    page.evaluate(() => {
      const box = document.getElementById("mic-blocked");
      const x = document.getElementById("btn-mic-close");
      const shown = (e) => !!e && !e.hidden && !e.closest("[hidden]") && e.getBoundingClientRect().width > 0;
      const bb = box.getBoundingClientRect();
      const xb = x ? x.getBoundingClientRect() : null;
      return {
        shown: shown(box),
        close: shown(x),
        inside: !!xb && xb.left >= bb.left - 0.5 && xb.right <= bb.right + 0.5 && xb.top >= bb.top - 0.5 && xb.bottom <= bb.bottom + 0.5,
        label: x ? x.getAttribute("aria-label") : null,
        retry: shown(document.getElementById("btn-mic-retry"))
      };
    });

  for (const [id, lang] of [
    ["v5-neutral-ears", "es"],
    ["s9-pitch-match", "en"]
  ]) {
    for (const mic of ["none", "deny"]) {
      test(`${id} (${lang}, mic ${mic}): the notice closes with ✕ and with Escape; then the stage's controls get their clicks`, async ({ page }) => {
        await page.setViewportSize(PHONE);
        await seed(page, { lang, e2e: true });
        await failingMic(page, mic);
        await openEx(page, id);
        await page.click("#btn-practice-start");
        await waitLive(page);
        await page.locator("#mic-blocked:not([hidden])").waitFor({ timeout: 8000 });
        await settle(page, 500);
        const before = await coveredByNotice(page);
        const n = await stageNotice(page);
        const close = await page.evaluate((l) => VTI18n.strings[l]["a11y.close"], lang);
        expect(n, "a ✕ inside the notice's own box").toMatchObject({ shown: true, close: true, inside: true, label: close });
        await page.click("#btn-mic-close");
        await settle(page, 300);
        expect((await stageNotice(page)).shown, "✕ puts the notice away").toBe(false);
        const focus = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
        expect(["btn-practice-start", "btn-practice-stop", "highway-stage"]).toContain(focus);
        const freed = await page.evaluate((ids) => {
          const out = [];
          for (const el of document.querySelectorAll("#view-exercise button, #view-exercise select, #timer-display, #practice-status")) {
            const name = el.id || (el.innerText || el.getAttribute("aria-label") || el.tagName).trim().slice(0, 30);
            if (!ids.includes(name) || el.closest("[hidden]")) continue;
            const r = el.getBoundingClientRect();
            const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
            if (!(hit && (hit === el || el.contains(hit)))) out.push(name);
          }
          return out;
        }, before);
        expect(freed, `still covered after ✕ (was over ${JSON.stringify(before)})`).toEqual([]);

        // A second take on the same visit: the notice comes back only if not put away... then Escape
        await page.click("#btn-practice-stop");
        await settle(page, 300);
        await page.evaluate(() => window.VTApp.openExercise(window.VTApp.getState().exercise.id));
        await settle(page, 400);
        await page.click("#btn-practice-start");
        await waitLive(page);
        await page.locator("#mic-blocked:not([hidden])").waitFor({ timeout: 8000 });
        await page.focus("#btn-mic-retry");
        await page.keyboard.press("Escape");
        await settle(page, 300);
        expect((await stageNotice(page)).shown, "Escape inside the notice puts it away").toBe(false);
        await page.click("#btn-practice-stop").catch(() => {});
      });
    }
  }

  test("v10 cannot run without the mic: the notice has no ✕, only Reintentar", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await seed(page, { lang: "es", e2e: true });
    await failingMic(page, "deny");
    await openEx(page, "v10-power-pause");
    await page.click("#btn-practice-start");
    await page.locator("#mic-blocked:not([hidden])").waitFor({ timeout: 8000 });
    const n = await stageNotice(page);
    expect(n).toMatchObject({ shown: true, close: false, retry: true });
    await page.keyboard.press("Escape");
    expect((await stageNotice(page)).shown).toBe(true);
  });
});

test.describe("no microphone at all", () => {
  const noticeText = (page) => page.evaluate(() => (document.getElementById("mic-blocked").hidden ? null : document.getElementById("mic-blocked-text").textContent));
  const PADLOCK = /candado|barra de direcciones|padlock|address bar/i;

  for (const lang of ["es", "en"]) {
    test(`v5 (${lang}): "no microphone found" with no padlock hint, a refused one keeps it; neither names a piano; no "recording" toast`, async ({ browser }) => {
      const texts = {};
      const toasts = {};
      for (const mic of ["none", "deny"]) {
        const ctx = await browser.newContext({ viewport: PHONE });
        const page = await ctx.newPage();
        await seed(page, { lang });
        await failingMic(page, mic);
        await watchToasts(page);
        await openEx(page, "v5-neutral-ears");
        await page.click("#btn-practice-start");
        await page.locator("#mic-blocked:not([hidden])").waitFor({ timeout: 8000 });
        await settle(page, 600);
        texts[mic] = await noticeText(page);
        toasts[mic] = await page.evaluate(() => window.__toasts.slice());
        await ctx.close();
      }
      expect(texts.none).toMatch(lang === "es" ? /No encontramos un micrófono/ : /No microphone found/);
      expect(texts.none).not.toMatch(PADLOCK);
      expect(texts.deny).toMatch(PADLOCK);
      expect(texts.none).not.toMatch(/piano/i);
      expect(texts.deny).not.toMatch(/piano/i);
      const rec = [...toasts.none, ...toasts.deny].filter((t) => /grabando|recording/i.test(t));
      expect(rec, "no stream, nothing records").toEqual([]);
    });
  }

  test("s9 on a laptop (en), no microphone: the missing text, and the piano that keeps going", async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await seed(page, { lang: "en", e2e: true });
    await failingMic(page, "none");
    await openEx(page, "s9-pitch-match");
    await page.click("#btn-practice-start");
    await page.locator("#mic-blocked:not([hidden])").waitFor({ timeout: 8000 });
    const t = await noticeText(page);
    expect(t).toMatch(/No microphone found/);
    expect(t).toMatch(/piano/);
    expect(t).not.toMatch(PADLOCK);
  });
});

/* ------------------------------------------------------------------ one note at a time */

test("[L] 1 nota on s2 and s3: every target is a note to sing and is the badge's note", async ({ page }) => {
  test.setTimeout(90000);
  await page.setViewportSize(PHONE);
  await seed(page, { lang: "es", e2e: true });
  await silentMic(page);
  const bad = [];
  for (const id of ["s2-solfege-chords", "s3-song-stanzas"]) {
    await openEx(page, id);
    // s3 opens in arpeggio; "1 nota" is the learner's own pick there (s2 opens in it)
    await page.evaluate(() => {
      const sel = document.getElementById("sel-play-mode");
      sel.value = "oneNote";
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(await page.evaluate(() => document.getElementById("chk-one-note")?.checked)).toBe(true);
    await page.click("#btn-practice-start");
    await waitLive(page);
    const seen = await page.evaluate(async () => {
      const out = [];
      const t0 = performance.now();
      while (performance.now() - t0 < 9500) {
        const f = window.VTApp.getState().practice?.targetFreq || 0;
        const badge = (document.getElementById("chord-now")?.textContent || "").trim();
        const m = badge.match(/·\s*([A-G]#?-?\d)/);
        out.push({ t: Math.round(performance.now() - t0), f: Math.round(f * 10) / 10, badge, badgeHz: m ? window.VT_NOTE_FREQ[m[1]] || 0 : 0 });
        await new Promise((r) => setTimeout(r, 150));
      }
      return out;
    });
    const withNote = seen.filter((s) => s.badgeHz > 0);
    if (withNote.length < 2) bad.push(`${id}: the badge named only ${withNote.length} note(s)`);
    const off = withNote.filter((s) => s.f < 98 || s.f > 1000 || Math.abs(s.f - s.badgeHz) > 0.6);
    if (off.length) bad.push(`${id}: ${off.slice(0, 3).map((s) => `${s.t}ms target ${s.f} Hz, badge "${s.badge}"`).join(", ")}`);
    await page.click("#btn-practice-stop");
    await settle(page, 300);
  }
  expect(bad).toEqual([]);
});

/* ------------------------------------------------------------------ held notes */

test.describe("held notes", () => {
  test.describe.configure({ timeout: 90000 });

  const run = async (browser, { id, lang, voice, ms }) => {
    const ctx = await browser.newContext({ viewport: LAPTOP });
    const page = await ctx.newPage();
    await seed(page, { lang });
    await voiceMic(page);
    await watchToasts(page);
    await openEx(page, id);
    await page.click("#btn-practice-start");
    await waitLive(page);
    await page.evaluate((v) => window.__VTVoice.play(v), voice);
    await page.waitForTimeout(ms);
    await page.click("#btn-practice-stop");
    await settle(page, 1200);
    const r = await page.evaluate(() => ({
      holds: window.VTStorage.getHoldLogs().map((h) => h.seconds),
      toasts: window.__toasts.slice(),
      holdText: [VTI18n.strings.es["toast.hold"], VTI18n.strings.en["toast.hold"]].map((s) => s.split("{")[0].trim()),
      banner: (() => {
        const b = document.getElementById("value-banner");
        return b && !b.hidden ? (document.getElementById("value-banner-text")?.textContent || "").trim() : null;
      })()
    }));
    await ctx.close();
    r.holdToasts = r.toasts.filter((t) => r.holdText.some((h) => h && t.startsWith(h)));
    return r;
  };

  for (const [id, lang] of [
    ["v10-power-pause", "es"],
    ["v14-pace-variation", "en"],
    ["v2-volume", "es"]
  ]) {
    test(`[L] ${id} (${lang}): counting aloud logs no held note and raises no record banner`, async ({ browser }) => {
      const r = await run(browser, { id, lang, voice: "countNumbers", ms: 12000 });
      expect({ holds: r.holds, holdToasts: r.holdToasts, banner: r.banner }).toEqual({ holds: [], holdToasts: [], banner: null });
    });
  }

  test("[L] s1 (es): a sung /A/ still logs its held note", async ({ browser }) => {
    const r = await run(browser, { id: "s1-vocal-fry", lang: "es", voice: "follow", ms: 6000 });
    expect(r.holds.length).toBeGreaterThan(0);
  });
});

/* ------------------------------------------------------------------ the top-left corner */

test("chord badge on a 390px phone keeps the whole 'Am · A2 La', and every one-note label, ES and EN", async ({ browser }) => {
  const bad = [];
  for (const lang of ["es", "en"]) {
    const ctx = await browser.newContext({ viewport: PHONE });
    const page = await ctx.newPage();
    await seed(page, { lang, e2e: true });
    await silentMic(page);
    await openEx(page, "s2-solfege-chords");
    await page.click("#btn-practice-start");
    await waitLive(page);
    const cut = await page.evaluate(() => {
      const el = document.getElementById("chord-now");
      const labels = new Set(["Am · A2 La"]);
      Object.values(window.VT_PROGRESSIONS).forEach((p) =>
        p.chords.forEach((ch) => ch.notes.forEach((n) => labels.add(`${ch.name} · ${window.VTPitchUtils?.noteNameToDual ? window.VTPitchUtils.noteNameToDual(n) : n}`)))
      );
      window.VTPiano.onChordChange = null; // hold the label still while measuring
      const out = [];
      for (const t of labels) {
        el.textContent = t;
        if (el.scrollWidth > el.clientWidth + 1) out.push(`"${t}" needs ${el.scrollWidth}px, has ${el.clientWidth}px`);
      }
      return out;
    });
    if (cut.length) bad.push(`${lang}: ${cut.slice(0, 4).join(", ")}${cut.length > 4 ? ` (+${cut.length - 4})` : ""}`);
    await page.click("#btn-practice-stop").catch(() => {});
    await ctx.close();
  }
  expect(bad).toEqual([]);
});

test("[L] no lone 'Tiempo' / 'Time' pill on an exercise with no clock (v5 es, v9 en)", async ({ browser }) => {
  const bad = [];
  for (const [id, lang] of [
    ["v5-neutral-ears", "es"],
    ["v9-12-week", "en"]
  ]) {
    const ctx = await browser.newContext({ viewport: PHONE });
    const page = await ctx.newPage();
    await seed(page, { lang, e2e: true });
    await openEx(page, id);
    await settle(page, 400);
    const r = await page.evaluate(() => {
      const vis = (el) => !!el && !el.hidden && !el.closest("[hidden]") && getComputedStyle(el).display !== "none" && el.getBoundingClientRect().width > 0;
      const corner = document.querySelector(".hud-tl");
      return {
        pill: vis(document.getElementById("practice-status")) ? document.getElementById("practice-status").textContent.trim() : null,
        timer: vis(document.getElementById("timer-display")) ? document.getElementById("timer-display").textContent.trim() : null,
        emptyCorner: vis(corner) && ![...corner.children].some(vis)
      };
    });
    if (r.pill && !r.timer) bad.push(`${id} ${lang}: pill "${r.pill}" with no time beside it`);
    if (r.emptyCorner) bad.push(`${id} ${lang}: an empty corner box`);
    await ctx.close();
  }
  expect(bad).toEqual([]);
});
