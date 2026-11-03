/**
 * Red-team QA fixes for home and retention: the reminder dialog and its due
 * card, the welcome back and rest-day notices of the classic arm, the daily
 * loop's tier and week strip, the guided-session banner and its toasts.
 *
 * Most of this lives in the classic arm of loop_home_2026_10 (or the dormant
 * five-minute arm), which only a forced link reaches today, so every classic
 * case pins its arm with the query flag. Cases that read a toast leave
 * sessionStorage.vt_e2e unset (toasts are silent under it).
 *
 * Fixed clock: Wednesday 28 October 2026, 10:00 in Lima.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const NOW = "2026-10-28T10:00:00-05:00";
const TODAY = "2026-10-28";
const CLASSIC = "?ab_loop_home_2026_10=classic";
const FIVE = "?ab_loop_minimo_len_2026_10=five";

test.use({ timezoneId: "America/Lima", locale: "es-PE" });

const keyOf = (offset) => {
  const d = new Date(Date.UTC(2026, 9, 28 + offset));
  return d.toISOString().slice(0, 10);
};

/** A ledger with the days (offsets from today) practised, a rest bank, and optional today's basics. */
function ledger(offsets, o = {}) {
  const days = {};
  offsets.forEach((off) => {
    days[keyOf(off)] = { sec: 240, n: 2, ex: ["s4-lip-trills"] };
  });
  if (o.basicsToday) {
    const row = days[TODAY] || (days[TODAY] = { sec: 240, n: 2, ex: ["s4-lip-trills"] });
    row.basics = 1;
    row.len = o.len || "min";
  }
  return { v: 1, days, rest: { bank: o.bank == null ? 1 : o.bank, earnedAt: 0, used: [] }, backfilled: true };
}

const REMINDER_ON = (times = ["18:00"], extra = {}) => ({
  enabled: true,
  times,
  days: [0, 1, 2, 3, 4, 5, 6],
  lastNotifiedDay: null,
  browserNotify: false,
  ...extra
});

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ days?: object, loop?: object, session?: object, reminders?: object, lang?: string, query?: string,
 *   toasts?: boolean, cardOn?: boolean, notif?: boolean, noNotif?: boolean, now?: string }} o
 */
async function boot(page, o = {}) {
  await page.clock.install({ time: new Date(o.now || NOW) });
  await page.addInitScript(
    ({ days, loop, session, reminders, lang, toasts, cardOn, notif, noNotif }) => {
      try {
        // A second page of the same test shares localStorage: start clean, once.
        const first = !sessionStorage.getItem("vt_seeded");
        if (first) localStorage.clear();
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", lang);
        localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: "singing" }));
        if (!toasts) sessionStorage.setItem("vt_e2e", "1");
        if (cardOn) sessionStorage.setItem("vt_loop_e2e", "1");
        if (first) {
          sessionStorage.setItem("vt_seeded", "1");
          if (days) localStorage.setItem("vt_days_v1", JSON.stringify(days));
          if (loop) localStorage.setItem("vt_loop_v1", JSON.stringify(loop));
          if (session) localStorage.setItem("vt_session_v1", JSON.stringify(session));
          if (reminders) localStorage.setItem("vt_reminders_v1", JSON.stringify(reminders));
        }
      } catch {
        /* ignore */
      }
      window.__toasts = [];
      document.addEventListener("DOMContentLoaded", () => {
        const el = document.querySelector("#toast");
        if (!el) return;
        new MutationObserver((recs) => recs.forEach((r) => r.addedNodes.forEach((n) => window.__toasts.push(n.textContent || "")))).observe(el, {
          childList: true
        });
      });
      // Notification: a granted stub that counts, or none at all.
      window.__notifs = [];
      if (noNotif) {
        try {
          delete window.Notification;
        } catch {
          /* ignore */
        }
      } else if (notif) {
        const N = function (title) {
          window.__notifs.push(String(title));
          return {};
        };
        Object.defineProperty(N, "permission", { get: () => "granted" });
        N.requestPermission = async () => "granted";
        window.Notification = N;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      async function fakeGUM() {
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
      navigator.mediaDevices.getUserMedia = fakeGUM;
      if (typeof MediaDevices !== "undefined") MediaDevices.prototype.getUserMedia = fakeGUM;
    },
    {
      days: o.days || null,
      loop: o.loop || null,
      session: o.session || null,
      reminders: o.reminders || null,
      lang: o.lang || "es",
      toasts: !!o.toasts,
      cardOn: !!o.cardOn,
      notif: !!o.notif,
      noNotif: !!o.noNotif
    }
  );
  await page.goto(BASE + "/" + (o.query || ""), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && !!window.VTLoop && !!window.VTDays);
  await page.clock.runFor(500);
}

const PHONE = { width: 390, height: 844 };
const LAPTOP = { width: 1280, height: 800 };
const VIEWS = [
  ["es", "phone", PHONE],
  ["en", "laptop", LAPTOP]
];

/** What has focus, and whether a person could see it. */
const focusInfo = (page) =>
  page.evaluate(() => {
    const el = document.activeElement;
    const shown = !!el && el !== document.body && el.getClientRects().length > 0 && !el.closest("[hidden]");
    return { id: el === document.body ? "BODY" : el.id || el.tagName, shown, inModal: !!el.closest?.("#reminder-modal") };
  });

test.describe("Home and retention: red-team fixes", () => {
  // ---------------------------------------------------------------- home-02
  for (const [lang, name, vp] of VIEWS) {
    test(`home-02 classic arm: Tab reaches a control that opens the reminder dialog (${lang}, ${name})`, async ({ page }) => {
      await page.setViewportSize(vp);
      await boot(page, { lang, query: CLASSIC, days: ledger([-3, -2, -1]), reminders: REMINDER_ON() });
      expect(await page.evaluate(() => window.VTLoop.enabled())).toBe(false);
      let opened = null;
      for (let i = 0; i < 160 && !opened; i += 1) {
        await page.keyboard.press("Tab");
        const f = await page.evaluate(() => {
          const el = document.activeElement;
          const shown = !!el && el !== document.body && el.getClientRects().length > 0 && !el.closest("[hidden]");
          return { shown, text: ((el && el.innerText) || "") + " " + ((el && el.getAttribute && el.getAttribute("aria-label")) || ""), id: el && el.id };
        });
        if (f.shown && /recordatorio|reminder/i.test(f.text)) {
          await page.keyboard.press("Enter");
          await page.clock.runFor(300);
          if (await page.evaluate(() => !document.getElementById("reminder-modal").hidden)) opened = f.id || f.text.trim();
          else await page.keyboard.press("Escape");
        }
      }
      expect(opened, "a keyboard stop that opens #reminder-modal").toBeTruthy();
    });
  }

  test("home-02 the reminder opener of the classic arm is not shown in the loop arm", async ({ page }) => {
    await boot(page, { days: ledger([-3, -2, -1]) });
    await expect(page.locator("#btn-reminder")).toBeVisible();
    await expect(page.locator("#btn-reminder-classic")).toBeHidden();
    // and the classic one says whether a reminder is set
    const p2 = await page.context().newPage();
    await p2.setViewportSize(LAPTOP);
    await boot(p2, { lang: "en", query: CLASSIC, days: ledger([-3, -2, -1]), reminders: REMINDER_ON(["18:30"]) });
    await expect(p2.locator("#btn-reminder")).toBeHidden();
    await expect(p2.locator("#btn-reminder-classic")).toBeVisible();
    await expect(p2.locator("#btn-reminder-classic")).toContainText(/Reminder: (18:30|6:30\s?(PM|p\.\s?m\.))/i);
  });

  // ---------------------------------------------------------------- home-03
  for (const notify of [false, true]) {
    test(`home-03 turning the reminder on after its time does not fire it at once (browser notice ${notify ? "on" : "off"})`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await boot(page, { now: "2026-10-28T21:30:00-05:00", days: ledger([-3, -2, -1]), notif: true });
      await page.click("#btn-reminder");
      if (notify) await page.click("#chk-browser-notify");
      await page.click("#reminder-done"); // "Activar recordatorio", default 18:00
      await page.clock.runFor(500);
      const r = await page.evaluate(() => ({ due: !document.getElementById("remind-due").hidden, notifs: window.__notifs.length, cfg: VTReminders.getConfig() }));
      expect(r.cfg.enabled).toBe(true);
      expect(r.due, "the due card").toBe(false);
      expect(r.notifs, "notifications fired").toBe(0);
      // Tomorrow it is a normal reminder.
      await page.clock.setSystemTime(new Date("2026-10-29T18:05:00-05:00"));
      await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await page.clock.runFor(300);
      const next = await page.evaluate(() => ({ due: !document.getElementById("remind-due").hidden, notifs: window.__notifs.length }));
      expect(next.due, "the due card the next day").toBe(true);
      expect(next.notifs).toBe(notify ? 1 : 0);
    });
  }

  test("home-03 changing a reminder's time to one already past does not fire it either", async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await boot(page, { lang: "en", now: "2026-10-28T21:30:00-05:00", days: ledger([-3, -2, -1]), reminders: REMINDER_ON(["22:00"], { browserNotify: true }), notif: true });
    expect(await page.evaluate(() => document.getElementById("remind-due").hidden)).toBe(true);
    await page.click("#btn-reminder");
    await page.fill("#rem-time-1", "20:00");
    await page.locator("#rem-time-1").dispatchEvent("change");
    await page.keyboard.press("Escape");
    await page.clock.runFor(400);
    const r = await page.evaluate(() => ({ due: !document.getElementById("remind-due").hidden, notifs: window.__notifs.length, t: VTReminders.getConfig().times[0] }));
    expect(r.t).toBe("20:00");
    expect(r.due).toBe(false);
    expect(r.notifs).toBe(0);
  });

  // ---------------------------------------------------------------- home-01
  test("home-01 the due-reminder text follows the language when it is switched", async ({ page }) => {
    const ES = /^(Unos minutos de voz|Hoy también cuenta|Tu estudio está listo)/;
    const EN = /^(A few minutes of voice|Today counts too|Your studio is ready)/;
    for (const [from, to] of [
      ["es", "en"],
      ["en", "es"]
    ]) {
      const p = await page.context().newPage();
      await p.setViewportSize(LAPTOP);
      await boot(p, { lang: from, reminders: REMINDER_ON(["00:01"]), days: ledger([-3, -2, -1]) });
      const text = () => p.evaluate(() => document.getElementById("remind-due-text").textContent.trim());
      await expect(p.locator("#remind-due")).toBeVisible();
      expect(await text()).toMatch(from === "es" ? ES : EN);
      await p.evaluate((l) => window.VTI18n.setLang(l), to);
      await p.clock.runFor(300);
      expect(await text(), `${from} -> ${to}`).toMatch(to === "es" ? ES : EN);
      await p.evaluate((l) => window.VTI18n.setLang(l), from);
      await p.clock.runFor(300);
      expect(await text(), `back to ${from}`).toMatch(from === "es" ? ES : EN);
      await p.close();
    }
  });

  // ---------------------------------------------------------------- home-04
  for (const [lang, name, vp] of VIEWS) {
    test(`home-04 unticking the reminder keeps focus in the dialog and Escape still closes it (${lang}, ${name})`, async ({ page }) => {
      await page.setViewportSize(vp);
      await boot(page, { lang, days: ledger([-3, -2, -1]), reminders: REMINDER_ON() });
      await page.click("#btn-reminder");
      await page.clock.runFor(300);
      await page.focus("#chk-reminders");
      await page.keyboard.press("Space");
      await page.clock.runFor(300);
      const f = await focusInfo(page);
      expect(f.shown, `focus on ${f.id}`).toBe(true);
      expect(f.inModal, `focus on ${f.id}`).toBe(true);
      await page.keyboard.press("Escape");
      await page.clock.runFor(300);
      expect(await page.evaluate(() => document.getElementById("reminder-modal").hidden)).toBe(true);
      const g = await focusInfo(page);
      expect(g.shown, "focus after the dialog closed: " + g.id).toBe(true);
    });
  }

  // ---------------------------------------------------------------- home-15
  for (const [lang, name, vp] of VIEWS) {
    for (const how of ["Escape", "close"]) {
      test(`home-15 closing the done card leaves focus on a visible control (${how}, ${lang}, ${name})`, async ({ page }) => {
        await page.setViewportSize(vp);
        await boot(page, { lang, cardOn: true, days: ledger([-3, -2, -1]) });
        await page.click("#btn-next-step");
        await page.clock.runFor(800);
        for (let i = 0; i < 6 && (await page.evaluate(() => VTApp.getState().view)) === "exercise"; i += 1) {
          await page.click("#btn-practice-start");
          await page.clock.runFor(40000);
          await page.evaluate(() => window.VTApp.advanceStructured("next"));
          await page.clock.runFor(600);
        }
        await page.clock.runFor(800);
        expect(await page.evaluate(() => document.getElementById("loop-done").hidden), "the done card is open").toBe(false);
        if (how === "Escape") await page.keyboard.press("Escape");
        else await page.click("#loop-done-close");
        await page.clock.runFor(500);
        expect(await page.evaluate(() => document.getElementById("loop-done").hidden)).toBe(true);
        const f = await focusInfo(page);
        expect(f.shown, "focus is on " + f.id).toBe(true);
      });
    }
  }

  test("home-15 dismissing the welcome back or the due card does not drop focus on the body", async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    // welcome back (classic comeback)
    await boot(page, { lang: "en", query: CLASSIC, days: ledger([-9, -8, -7], { bank: 0 }) });
    await expect(page.locator("#welcome-back")).toBeVisible();
    await page.focus("#wb-dismiss");
    await page.keyboard.press("Enter");
    await page.clock.runFor(200);
    await expect(page.locator("#welcome-back")).toBeHidden();
    let f = await focusInfo(page);
    expect(f.shown, "after #wb-dismiss focus is on " + f.id).toBe(true);
    // due card. The first page is closed: another open tab that shares this
    // storage would see the reminder seeded here, be the one to announce it, and
    // mark it told (one announcement per day, in whichever tab sees it first).
    const ctx = page.context();
    await page.close();
    const p2 = await ctx.newPage();
    await p2.setViewportSize(LAPTOP);
    await boot(p2, { lang: "en", days: ledger([-3, -2, -1]), reminders: REMINDER_ON(["00:01"]) });
    await expect(p2.locator("#remind-due")).toBeVisible();
    await p2.focus("#rd-dismiss");
    await p2.keyboard.press("Enter");
    await p2.clock.runFor(200);
    await expect(p2.locator("#remind-due")).toBeHidden();
    f = await focusInfo(p2);
    expect(f.shown, "after #rd-dismiss focus is on " + f.id).toBe(true);
  });

  // ---------------------------------------------------------------- home-05
  test("home-05 a calendar reminder between 00:00 and 00:59 keeps its hour", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() =>
      ["00:00", "00:30", "00:45", "09:00", "18:00"].map((t) => [t, (VTReminders.buildIcs({ time: t, freq: "DAILY" }).match(/DTSTART:\d{8}T(\d{6})/) || [])[1]])
    );
    r.forEach(([t, got]) => expect(got, `time ${t}`).toBe(t.replace(":", "") + "00"));
  });

  // ---------------------------------------------------------------- home-06 / home-09
  for (const lang of ["es", "en"]) {
    test(`home-06 classic arm: two rest days spent are said as two (${lang})`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await boot(page, { lang, toasts: true, query: CLASSIC, days: ledger([-8, -7, -6, -5, -4, -3], { bank: 2 }) });
      const r = await page.evaluate(() => ({ toasts: window.__toasts, used: VTDays.read().rest.used.length }));
      expect(r.used).toBe(2);
      const t = r.toasts.find((x) => /descanso|rest day/i.test(x)) || "";
      expect(t).toMatch(lang === "es" ? /Usamos 2 días de descanso/ : /We used 2 rest days/);
    });
  }

  test("home-09 classic arm: a gap the rest days covered is not welcomed back", async ({ page }) => {
    await page.setViewportSize(PHONE);
    // Practised up to two days ago; yesterday missed and covered by a rest day.
    await boot(page, { toasts: true, query: CLASSIC, days: ledger([-7, -6, -5, -4, -3, -2], { bank: 1 }) });
    const r = await page.evaluate(() => ({ toasts: window.__toasts, comeback: VTDays.summary().comeback, away: VTDays.summary().daysAway }));
    expect(r.comeback).toBe(false);
    expect(r.away).toBeGreaterThanOrEqual(2);
    await expect(page.locator("#welcome-back")).toBeHidden();
  });

  // ---------------------------------------------------------------- home-07 / home-08
  for (const [lang, name, vp] of VIEWS) {
    test(`home-07 comeback: the size chips switch the offer (${lang}, ${name})`, async ({ page }) => {
      await page.setViewportSize(vp);
      await boot(page, { lang, days: ledger([-9, -8, -7], { bank: 0 }) });
      expect(await page.evaluate(() => document.getElementById("next-step-card").dataset.loop)).toBe("back");
      for (const tier of ["ess", "class"]) {
        await page.click(`#loop-tiers [data-tier="${tier}"]`);
        await page.clock.runFor(300);
        const r = await page.evaluate(() => ({
          pressed: document.querySelector('#loop-tiers [aria-pressed="true"]')?.dataset.tier,
          cta: document.getElementById("btn-next-step").innerText.replace(/\s+/g, " ")
        }));
        expect(r.pressed, r.cta).toBe(tier);
        expect(r.cta).toMatch(tier === "ess" ? /Esencial|Essential/ : /Clase|Class/);
      }
    });
  }

  for (const [lang, name, vp] of VIEWS) {
    test(`home-08 done today: another round of a different size does not rename what was done (${lang}, ${name})`, async ({ page }) => {
      await page.setViewportSize(vp);
      await boot(page, { lang, days: ledger([-2, -1], { basicsToday: true, len: "min" }) });
      const read = () =>
        page.evaluate(() => ({
          state: document.getElementById("next-step-card").dataset.loop,
          title: document.getElementById("next-step-title").innerText.trim(),
          cta: document.getElementById("btn-next-step").innerText.replace(/\s+/g, " ").trim()
        }));
      const before = await read();
      expect(before.state).toBe("done");
      expect(before.title).toMatch(lang === "es" ? /Mínimo/ : /Minimum/);
      await page.click('#loop-tiers [data-tier="ess"]');
      await page.clock.runFor(300);
      const after = await read();
      expect(after.state).toBe("done");
      expect(after.title).toBe(before.title);
      expect(after.cta).toMatch(lang === "es" ? /Esencial/ : /Essential/);
    });
  }

  // ---------------------------------------------------------------- home-10 / home-17
  test("home-10 classic arm: the welcome back is on the first screen and the start panel keeps the one primary", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await boot(page, { query: CLASSIC, days: ledger([-9, -8, -7], { bank: 0 }) });
    await expect(page.locator("#welcome-back")).toBeVisible();
    const r = await page.evaluate(() => {
      const wb = document.getElementById("welcome-back").getBoundingClientRect();
      const first = [...document.querySelectorAll("#view-home .btn-primary, #view-home .btn-practice")].filter((b) => {
        const rc = b.getBoundingClientRect();
        return rc.width > 0 && rc.height > 0 && !b.closest("[hidden]") && rc.top < innerHeight;
      });
      return { top: Math.round(wb.top + scrollY), vh: innerHeight, primaries: first.map((b) => b.id || b.className) };
    });
    expect(r.top).toBeLessThan(r.vh);
    expect(r.primaries, "primary buttons on the first screen").toHaveLength(1);
    // directly under the due-reminder slot, above the start panel
    const order = await page.evaluate(() => {
      const wb = document.getElementById("welcome-back");
      const rd = document.getElementById("remind-due");
      const sp = document.getElementById("start-panel");
      return { afterRd: !!(rd.compareDocumentPosition(wb) & Node.DOCUMENT_POSITION_FOLLOWING), beforePanel: !!(wb.compareDocumentPosition(sp) & Node.DOCUMENT_POSITION_FOLLOWING) };
    });
    expect(order).toEqual({ afterRd: true, beforePanel: true });
  });

  test("home-17 classic arm: only one welcome-back button starts the SH air ladder", async ({ page }) => {
    await boot(page, { query: CLASSIC, days: ledger([-9, -8, -7], { bank: 0 }) });
    await expect(page.locator("#wb-air")).toHaveCount(0);
    const labels = await page.locator("#welcome-back button:visible").allInnerTexts();
    expect(labels.length).toBe(3);
    await page.click("#wb-micro");
    await page.clock.runFor(700);
    expect(await page.evaluate(() => VTApp.getState().exercise?.id)).toBe("s15-sh-air-ladder");
  });

  // ---------------------------------------------------------------- home-11
  for (const [lang, name, vp] of VIEWS) {
    test(`home-11 no Notification support: the browser-notice row is not offered (${lang}, ${name})`, async ({ page }) => {
      await page.setViewportSize(vp);
      await boot(page, { lang, toasts: true, noNotif: true, days: ledger([-3, -2, -1]) });
      expect(await page.evaluate(() => "Notification" in window)).toBe(false);
      await page.click("#btn-reminder");
      await page.clock.runFor(300);
      await expect(page.locator("#chk-browser-notify")).toBeHidden();
      await expect(page.locator("#reminder-done")).toBeVisible();
    });
  }

  test("home-11 with notification support the row is still there", async ({ page }) => {
    await boot(page, { notif: true, days: ledger([-3, -2, -1]) });
    await page.click("#btn-reminder");
    await expect(page.locator("#chk-browser-notify")).toBeVisible();
  });

  // ---------------------------------------------------------------- home-13 / home-14
  for (const [lang, name, vp] of VIEWS) {
    test(`home-13 five-minute arm: the reminder button says 5 (${lang}, ${name})`, async ({ page }) => {
      await page.setViewportSize(vp);
      await boot(page, { lang, query: FIVE, reminders: REMINDER_ON(["00:01"]), days: ledger([-3, -2, -1]) });
      await expect(page.locator("#remind-due")).toBeVisible();
      const r = await page.evaluate(() => ({ btn: document.getElementById("rd-start").innerText.trim(), size: document.getElementById("btn-next-step").innerText.replace(/\s+/g, " ") }));
      expect(r.size).toMatch(/5 min/);
      expect(r.btn).toMatch(/5 min/);
      expect(r.btn).not.toMatch(/3 min/);
    });
  }

  for (const lang of ["es", "en"]) {
    test(`home-14 loop arm: the reminder text and the calendar event say the same minutes as the button (${lang})`, async ({ page }) => {
      await boot(page, { lang, reminders: REMINDER_ON(["00:01"]), days: ledger([-3, -2, -1]) });
      const r = await page.evaluate((isEs) => {
        const msgs = new Set();
        for (let i = 0; i < 80; i += 1) msgs.add(VTReminders.evaluate(isEs).message);
        const ics = VTReminders.buildIcs({ freq: "DAILY", time: "18:00", isEs });
        return { msgs: [...msgs], btn: document.getElementById("rd-start").innerText.trim(), summary: (ics.match(/SUMMARY:(.*)/) || [])[1] || "" };
      }, lang === "es");
      expect(r.btn).toMatch(/3 min/);
      r.msgs.forEach((m) => {
        expect(m).not.toMatch(/\{min\}/);
        if (/\d/.test(m)) expect(m).toMatch(/\b3\b/);
      });
      expect(r.msgs.some((m) => /\b3 minut/.test(m))).toBe(true);
      expect(r.summary).not.toMatch(/10.15/);
      expect(r.summary).toMatch(/\(3 min\)/);
    });
  }

  test("home-14 classic arm: the reminder and the calendar keep the 5-minute micro-session", async ({ page }) => {
    await boot(page, { query: CLASSIC, reminders: REMINDER_ON(["00:01"]), days: ledger([-3, -2, -1]) });
    const r = await page.evaluate(() => {
      const msgs = new Set();
      for (let i = 0; i < 80; i += 1) msgs.add(VTReminders.evaluate(true).message);
      return { msgs: [...msgs], summary: (VTReminders.buildIcs({ time: "18:00", isEs: true }).match(/SUMMARY:(.*)/) || [])[1] || "", btn: document.getElementById("rd-start").innerText.trim() };
    });
    expect(r.btn).toBe("▶ 5 min");
    expect(r.msgs.some((m) => /5 minutos/.test(m))).toBe(true);
    expect(r.summary).toMatch(/\(5 min\)/);
  });

  // ---------------------------------------------------------------- cross-10
  for (const lang of ["es", "en"]) {
    for (const exerciseId of ["s4-lip-trills", "v1-diction"]) {
      test(`cross-10 the first practice day is not "1 días" (${lang}, ${exerciseId})`, async ({ page }) => {
        await boot(page, { lang, toasts: true });
        const toast = await page.evaluate((id) => {
          const day = VTDays.record({ exerciseId: id, sec: 90 });
          VTLoop.onPractice({ exerciseId: id, source: "test", day });
          return { text: document.querySelector("#toast")?.textContent || "", n: VTDays.summary().practiceDays };
        }, exerciseId);
        expect(toast.n).toBe(1);
        expect(toast.text).not.toMatch(/(^|¡)1 (días|days|practice days)/);
        expect(toast.text).toMatch(lang === "es" ? /primer día/i : /first practice day|first day/i);
      });
    }
  }

  test("cross-10 later milestones keep the plural", async ({ page }) => {
    await boot(page, { lang: "en", toasts: true, days: ledger([-6, -5, -4, -3, -2, -1, 0].slice(0, 6)) });
    const t = await page.evaluate(() => {
      const day = VTDays.record({ exerciseId: "s4-lip-trills", sec: 90 });
      VTLoop.onPractice({ exerciseId: "s4-lip-trills", source: "test", day });
      return { n: VTDays.summary().practiceDays, text: document.querySelector("#toast")?.textContent || "" };
    });
    expect(t.n).toBe(7);
    expect(t.text).toMatch(/\b7\b/);
  });

  // ---------------------------------------------------------------- home-18
  for (const [lang, name, vp] of VIEWS) {
    test(`home-18 the days before the first practice day are not drawn as missed (${lang}, ${name})`, async ({ page }) => {
      await page.setViewportSize(vp);
      // The first day ever is today, a Wednesday.
      await boot(page, { lang, days: ledger([0], { bank: 0 }) });
      const r = await page.evaluate(() =>
        [...document.querySelectorAll("#loop-today .loop-day")].map((li) => ({ cls: li.className, label: li.getAttribute("aria-label") }))
      );
      expect(r).toHaveLength(7);
      expect(r.filter((d) => /is-missed/.test(d.cls)).map((d) => d.label)).toEqual([]);
      const monday = r[0];
      expect(monday.cls).toMatch(/is-before/);
      expect(monday.label).not.toMatch(/sin práctica|no practice/);
      expect(monday.label).toMatch(/26/);
      // a day missed after the first one still is
      expect(r[2].cls).toMatch(/is-today/);
    });
  }

  test("home-18 a gap after the first day is still a missed day, and the Historial span follows the same rule", async ({ page }) => {
    await boot(page, { days: ledger([-6, -3], { bank: 0 }) });
    const r = await page.evaluate(() => {
      const wk = VTDays.summary().week.map((d) => d.state);
      const span = VTDays.span("2026-10-20", "2026-10-28").map((d) => d.key + ":" + d.state);
      return { wk, span };
    });
    // First day sung: Fri 22. Tue 20 is before it; Fri 23 (between two days sung) and this week's Mon and Tue were missed.
    expect(r.span.find((s) => s.startsWith("2026-10-20"))).toMatch(/before/);
    expect(r.span.find((s) => s.startsWith("2026-10-23"))).toMatch(/missed/);
    expect(r.wk.includes("missed")).toBe(true);
  });

  // ---------------------------------------------------------------- banner
  const SESSION = (status) => ({
    mode: "structured",
    track: "singing",
    path: "basic",
    order: ["s4-lip-trills", "s27-lip-trill-solfege", "s5-sirens", "s7-humming", "s9-pitch-match"],
    index: 1,
    status,
    startedAt: "2026-10-28T14:00:00.000Z",
    pausedAt: status === "paused" ? "2026-10-28T14:02:00.000Z" : null,
    completedIds: ["s4-lip-trills"]
  });

  for (const lang of ["es", "en"]) {
    test(`exercise-routine-banner-text-under-buttons the banner text ends before its buttons at 390 px (${lang}, after reload)`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await boot(page, { lang, days: ledger([-3, -2, -1]), session: SESSION("active") });
      for (const when of ["first load", "after reload"]) {
        if (when === "after reload") {
          await page.reload({ waitUntil: "domcontentloaded" });
          await page.waitForFunction(() => !!window.VTApp);
          await page.clock.runFor(500);
        }
        await expect(page.locator("#session-banner")).toBeVisible();
        const m = await page.evaluate(() => {
          const t = document.getElementById("session-banner-text");
          const btns = [...document.querySelectorAll("#session-banner .controls-row .btn")].filter((b) => !b.hidden && b.getBoundingClientRect().width > 0);
          const rects = [];
          const walk = document.createTreeWalker(t, NodeFilter.SHOW_TEXT);
          for (let n = walk.nextNode(); n; n = walk.nextNode()) {
            const r = document.createRange();
            r.selectNodeContents(n);
            const clip = n.parentElement.getBoundingClientRect();
            const cs = getComputedStyle(n.parentElement);
            for (const b of r.getClientRects()) {
              const hidden = cs.overflow === "hidden" || cs.overflowX === "hidden";
              rects.push({ left: b.left, right: hidden ? Math.min(b.right, clip.right) : b.right, top: b.top, bottom: b.bottom });
            }
          }
          const hits = [];
          for (const b of btns) {
            const br = b.getBoundingClientRect();
            for (const r of rects) {
              const ix = Math.min(r.right, br.right) - Math.max(r.left, br.left);
              const iy = Math.min(r.bottom, br.bottom) - Math.max(r.top, br.top);
              if (ix > 1 && iy > 3) hits.push(b.textContent.trim() + " by " + Math.round(ix));
            }
          }
          const pos = t.querySelector(".session-banner-pos");
          const textRight = Math.max(...rects.map((r) => r.right));
          const btnLeft = Math.min(...btns.map((b) => b.getBoundingClientRect().left));
          return { text: t.textContent.trim(), pos: pos ? pos.textContent.trim() : "", hits, textRight: Math.round(textRight), btnLeft: Math.round(btnLeft) };
        });
        expect(m.hits, `${when}: "${m.text}" ${m.textRight} vs buttons at ${m.btnLeft}`).toEqual([]);
        expect(m.textRight).toBeLessThanOrEqual(m.btnLeft);
        // where you are is never cut: the position alone, then the route name
        expect(m.pos).toBe(lang === "es" ? "Ejercicio 2 de 5" : "Exercise 2 of 5");
        expect(m.text).toMatch(lang === "es" ? /Tareas de la clase/ : /Class homework/);
      }
    });
  }

  // ---------------------------------------------------------------- home-12
  for (const [lang, name, vp] of VIEWS) {
    test(`home-12 the paused-session toast sits under the banner it points at (${lang}, ${name})`, async ({ page }) => {
      await page.setViewportSize(vp);
      await boot(page, { lang, toasts: true, days: ledger([-3, -2, -1]), session: SESSION("paused") });
      await page.waitForFunction(() => document.getElementById("toast")?.classList.contains("show"));
      // The toast slides in with a CSS transition, which runs in real time.
      await page.waitForTimeout(450);
      const r = await page.evaluate(() => {
        const t = document.getElementById("toast").getBoundingClientRect();
        const b = document.getElementById("session-banner").getBoundingClientRect();
        const ix = Math.max(0, Math.min(t.right, b.right) - Math.max(t.left, b.left));
        const iy = Math.max(0, Math.min(t.bottom, b.bottom) - Math.max(t.top, b.top));
        return { overlap: Math.round(ix * iy), toast: [Math.round(t.top), Math.round(t.bottom)], banner: [Math.round(b.top), Math.round(b.bottom)], text: document.getElementById("toast").textContent };
      });
      expect(r.text).toMatch(/aviso superior|top banner/);
      expect(r.overlap, `toast ${r.toast} over banner ${r.banner}`).toBe(0);
    });
  }

  // ---------------------------------------------------------------- home-19
  test("home-19 the Spanish guided-session toast has its separators", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await boot(page, { toasts: true, query: CLASSIC, days: ledger([-3, -2, -1]) });
    await page.selectOption("#session-path", "basic");
    await page.click("#btn-structured");
    await page.clock.runFor(700);
    const t = await page.evaluate(() => window.__toasts.find((x) => /^Sesión guiada/.test(x)) || "");
    expect(t).toMatch(/^Sesión guiada · [^·]+ · .+ \(\d+ ejercicios\)$/);
    const keys = await page.evaluate(() => {
      const S = window.VTI18n.strings;
      const n = (s) => (String(s).match(/ · /g) || []).length;
      return { es: n(S.es["toast.structuredStart"]), en: n(S.en["toast.structuredStart"]) };
    });
    expect(keys.es).toBe(keys.en);
  });
});
