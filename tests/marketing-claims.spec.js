/**
 * The promises the selling copy makes, proved by what the product does rather than by a line in a file
 * (docs/48 section 11: a string can stay while the behaviour behind it changes, AGENTS.md's rejected pattern).
 *
 *  - "sin límite de minutos" / "no time limit": takes of their full length start and run to their end, are
 *    counted, and open no Pro or account window, for three visitors: one on a first day with over an hour
 *    already practised today; a heavy one ten years on, on a Sunday night at the end of a month, in English,
 *    with forty days of eight hours, ten hours and three hundred takes today in both of the app's records,
 *    on the third page load, from the catalog and a routine; and one who first came 45 days ago. Single
 *    exercises, Start again after a rating, a pitch exercise, the catalog and a routine are each a way in.
 *  - "Tu voz se queda en tu dispositivo" / "your voice stays on your device": for a visitor the app treats as
 *    a person (so its analytics send), recording a take, saving it, a minute after, leaving the page and the
 *    next visit together send nothing the size of the take, by any request, header, cookie, WebSocket frame,
 *    worker or WebRTC connection in any frame. The same counter is shown to catch the saved take sent nine
 *    ways, and the take is still on the device on the next visit.
 *  - "No necesitas cuenta" / "no account needed": two takes, one rated, are there with the rating in a new tab,
 *    a minute later, and after the browser is restarted a month on, where Start still starts.
 *  - "nunca durante la práctica" (terms.html): with ads switched on, no ad of any kind (studio tip, preview or
 *    AdSense unit) is drawn at any moment of a guided routine, in any of the four ad modes, whatever is called
 *    and wherever the visitor goes in between, nor while a take starts or is live; the end-of-task card goes as
 *    a new take or a routine starts. Each check has a control that draws an ad in the same way when practice is
 *    over, so none of them passes because nothing could be drawn.
 *
 * Each has planted defects in qa/mutate.mjs ("promises" set: MK3, MK19 to MK22, MK26 to MK46) that turn it red.
 * MK26 to MK29 are what Codex's review showed the first version let through; MK30 to MK46 are what the second
 * red team showed the second version let through (docs/48 section 11).
 */
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const ROOT = path.resolve(__dirname, "..");

// The visitor's calendar is the test's, not the machine's: Lima keeps no daylight saving, so a day key is the
// same on a laptop in Madrid and on a CI runner in UTC (where 22:00 in Lima is already the next day).
test.use({ timezoneId: "America/Lima", locale: "es-PE" });

const NOW = "2026-09-23T10:00:00-05:00"; // a Wednesday morning
const LATER = "2036-08-31T22:00:00-05:00"; // a Sunday night, the last day of a month, ten years on
const DAY_MS = 86400000;
const dayOf = (iso) => iso.slice(0, 10);

/** YYYY-MM-DD, `n` days before `day`. */
function daysBefore(day, n) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * A free visitor with a fake microphone and the tour seen, on a clock the test owns. `days` seeds the practice
 * ledger on the first load. `person` drops every mark of a test run (the e2e flag and navigator.webdriver), so the
 * app does what it does for a person, analytics included. `holdMic` keeps the microphone answer back until
 * window.__vtReleaseMic() is called, so the start-up of a take can be looked at. MediaRecorder is wrapped to keep
 * count of what it records, so a test knows how big a take is.
 */
async function boot(page, { days = null, lang = "es", now = NOW, person = false, holdMic = false } = {}) {
  await page.clock.install({ time: new Date(now) });
  await page.addInitScript(
    ({ days, lang, person, holdMic }) => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_mic_primed_v1", "1");
        localStorage.setItem("vt_lang", lang);
        if (!localStorage.getItem("vt_settings_v1")) localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: "singing" }));
        if (!person) {
          sessionStorage.setItem("vt_e2e", "1");
          sessionStorage.setItem("vt_stepdone_e2e", "1");
          sessionStorage.setItem("vt_rate_e2e", "1");
        }
        if (days && !sessionStorage.getItem("vt_seeded")) {
          sessionStorage.setItem("vt_seeded", "1");
          localStorage.setItem("vt_days_v1", JSON.stringify({ v: 1, days, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true }));
        }
      } catch {
        /* ignore */
      }
      if (person) Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
      window.__vtHoldMic = holdMic;
      const AC = window.AudioContext || window.webkitAudioContext;
      async function fakeGUM() {
        if (window.__vtHoldMic) await new Promise((r) => (window.__vtReleaseMic = r));
        let ctx = window.VTSharedAudioCtx;
        if (!ctx || ctx.state === "closed") {
          ctx = new AC();
          window.VTSharedAudioCtx = ctx;
        }
        const dest = ctx.createMediaStreamDestination();
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.value = 0.05;
        osc.frequency.value = 220;
        osc.connect(g);
        g.connect(dest);
        osc.start();
        return dest.stream;
      }
      if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
      navigator.mediaDevices.getUserMedia = fakeGUM;
      if (typeof MediaDevices !== "undefined") MediaDevices.prototype.getUserMedia = fakeGUM;

      window.__vtTake = { bytes: 0 };
      const MR = window.MediaRecorder;
      if (MR) {
        window.MediaRecorder = class extends MR {
          constructor(...args) {
            super(...args);
            this.addEventListener("dataavailable", (e) => {
              if (e.data?.size) window.__vtTake.bytes += e.data.size;
            });
          }
        };
      }
    },
    { days, lang, person, holdMic }
  );
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await ready(page);
}

async function ready(page) {
  await page.waitForFunction(() => !!window.VTApp && !!window.VTLoop && !!window.VTSession && !!window.VTAds && !!window.VTDays);
  await page.clock.runFor(500);
}

const live = (page) => page.evaluate(() => !!window.VTApp.getState().practiceLive);

async function start(page) {
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => live(page), { timeout: 10000 }).toBe(true);
}

/** Start the open exercise and run its clock out, shortened to `sec` (where the length is not what is tested). */
async function runOut(page, sec = 50) {
  await page.evaluate((n) => (window.VTApp.getState().timer.remaining = n), sec);
  await start(page);
  await page.clock.fastForward((sec - 5) * 1000);
  await page.clock.runFor(5600);
}

async function openSingle(page, id) {
  await page.evaluate((x) => window.VTApp.openExercise(x), id);
  await page.clock.runFor(300);
}

async function rate(page) {
  await page.locator('.rate-btn[data-feel="ok"]').click();
  await expect(page.locator("#score-result")).toBeVisible();
  await page.clock.runFor(1000);
}

/* ------------------------------------------------------------------ no time limit */

/** Seconds of practice the ledger holds for the app's own today (its day key, not one worked out here). */
const todaySec = (page) =>
  page.evaluate(() => JSON.parse(localStorage.getItem("vt_days_v1") || "{}").days?.[window.VTDays.dayKey()]?.sec || 0);

/** No window stands between the visitor and the next take. */
async function nothingInTheWay(page, label) {
  await expect(page.locator("#pricing-modal"), `${label}: no Pro window`).toBeHidden();
  await expect(page.locator("#account-modal"), `${label}: no account window`).toBeHidden();
}

/**
 * One take of its full length, `expected` seconds as a first visitor gets it: it starts with all of it on the
 * clock, is still live five seconds before its end, ends on its own, and is counted as practice. Most of it is
 * jumped over, but not shortened, so a cap that cuts the take is seen (the first version set every take to 50 s).
 */
async function fullTake(page, label, expected) {
  const before = await todaySec(page);
  expect(await page.evaluate(() => window.VTApp.getState().timer.total), `${label}: the take has its full length`).toBe(expected);
  await start(page);
  const left = await page.evaluate(() => (window.VTApp.getState().timer.endAt - performance.now()) / 1000);
  expect(left, `${label}: all of it is on the clock`).toBeGreaterThanOrEqual(expected - 3);
  await page.clock.fastForward((expected - 5) * 1000);
  expect(await live(page), `${label}: still live five seconds before its end`).toBe(true);
  await nothingInTheWay(page, label);
  await page.clock.runFor(5600);
  expect(await live(page), `${label}: it ends when its clock does`).toBe(false);
  expect((await todaySec(page)) - before, `${label}: the whole take is counted as practice`).toBeGreaterThanOrEqual(expected - 10);
  await nothingInTheWay(page, label);
}

/** The visitor's today, as the app keys it, must be the day the test seeded (else "over an hour today" is untrue). */
async function todayIs(page, day) {
  expect(await page.evaluate(() => window.VTDays.dayKey()), "control: the app's today is the seeded day").toBe(day);
}

const SINGLE_LENGTH = 300; // s4-lip-trills, s5-sirens and v1-diction, as a first visitor gets them

test("no time limit: a first-day visitor past an hour today takes three full takes, one a pitch exercise, one after Start again", async ({
  page
}) => {
  const today = dayOf(NOW);
  await boot(page, { person: true, days: { [today]: { sec: 3720, n: 24, ex: ["s4-lip-trills"] } } });
  await todayIs(page, today);
  expect(await todaySec(page), "control: over an hour today already").toBeGreaterThan(3600);
  await openSingle(page, "s4-lip-trills");
  await fullTake(page, "a single exercise", SINGLE_LENGTH);
  await rate(page);
  await nothingInTheWay(page, "after the rating");
  await fullTake(page, "Start again", SINGLE_LENGTH);
  await openSingle(page, "s5-sirens");
  expect(await page.evaluate(() => !!window.VTApp.getProfile(window.VTApp.getState().exercise).showPitch), "control: a pitch exercise").toBe(true);
  await fullTake(page, "a pitch exercise", SINGLE_LENGTH);
});

/** `n` days of `sec` seconds each before `day`, and `day` itself. */
function heavyLedger(day, n, sec, todayRow) {
  return Object.fromEntries([
    ...Array.from({ length: n }, (_, i) => [daysBefore(day, i + 1), { sec, n: 40, ex: ["s4-lip-trills", "v1-diction"], basics: 1 }]),
    [day, todayRow]
  ]);
}

test("no time limit: a heavy visitor ten years on, on a Sunday night at the month's end, in English, from the catalog and a routine", async ({
  page
}) => {
  const today = dayOf(LATER);
  await boot(page, { person: true, lang: "en", now: LATER, days: heavyLedger(today, 40, 8 * 3600, { sec: 10 * 3600, n: 300, ex: ["s4-lip-trills", "v1-diction"] }) });
  await todayIs(page, today);
  expect(await page.evaluate(() => new Date().getDay()), "control: a Sunday").toBe(0);
  // Today's takes in the other record too, so a cap that adds up the history is met as well as one that reads the ledger.
  await page.evaluate(() => {
    for (const id of ["s4-lip-trills", "v1-diction", "s5-sirens"]) {
      for (let i = 0; i < 50; i++) window.VTStorage.saveExerciseResult(id, { score: 7, durationSec: 600, metrics: {} });
    }
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  const fromHistory = await page.evaluate((day) => {
    const all = window.VTStorage.getProgress();
    return Object.values(all).reduce((n, row) => n + row.history.filter((h) => h.day === day).reduce((s, h) => s + h.durationSec, 0), 0);
  }, today);
  expect(fromHistory, "control: the history holds 25 hours today").toBe(150 * 600);
  expect(await todaySec(page), "control: the ledger holds 10 hours today").toBeGreaterThanOrEqual(10 * 3600);

  await page.locator('#exercise-list .card-ex[data-id="s4-lip-trills"]').click();
  await page.clock.runFor(300);
  await expect(page.locator("#view-exercise"), "control: the catalog opened the exercise").toHaveClass(/active/);
  await fullTake(page, "from the catalog", SINGLE_LENGTH);

  await page.reload({ waitUntil: "domcontentloaded" }); // the third page load, which reopens the exercise
  await ready(page);
  await page.locator("#btn-nav-home").click();
  await page.clock.runFor(300);
  await page.locator("#btn-next-step").click();
  await page.clock.runFor(400);
  const step = await page.evaluate(() => {
    const s = window.VTSession.get();
    return { status: s?.status, id: s?.order?.[s.index], sec: s?.sec?.[s?.order?.[s.index]] };
  });
  expect(step.status, "control: a routine is under way").toBe("active");
  await fullTake(page, "a routine's step", step.sec);
});

test("no time limit: a visitor who first came 45 days ago, past an hour today, takes two full takes", async ({ page }) => {
  const first = new Date(new Date(NOW).getTime() - 45 * DAY_MS);
  await boot(page, { person: true, now: first.toISOString() });
  await openSingle(page, "v1-diction");
  await fullTake(page, "45 days ago", SINGLE_LENGTH);
  await page.clock.setSystemTime(new Date(NOW));
  const today = dayOf(NOW);
  await page.evaluate((today) => {
    const bag = JSON.parse(localStorage.getItem("vt_days_v1"));
    bag.days[today] = { sec: 3720, n: 24, ex: ["v1-diction"] };
    localStorage.setItem("vt_days_v1", JSON.stringify(bag));
  }, today);
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  await todayIs(page, today);
  await openSingle(page, "v1-diction");
  await fullTake(page, "today", SINGLE_LENGTH);
  await rate(page);
  await fullTake(page, "today, Start again", SINGLE_LENGTH);
});

/* ------------------------------------------------------------------ your voice stays on your device */

/** Request headers the browser sets by itself. The page may set some of them too, so their values are watched. */
const BROWSER_HEADERS =
  /^(accept|accept-encoding|accept-language|cache-control|connection|content-length|content-type|host|if-[a-z-]+|origin|pragma|priority|range|referer|sec-[a-z-]+|upgrade-insecure-requests|user-agent)$/i;

/** Characters a browser-set header may hold, in a value the browser did not send while the page loaded, before they count. */
const HEADER_ROOM = 64;

/** What the page may send while a take is recorded, saved, left and come back to: a few small requests. */
const EGRESS_BUDGET = 4096;
const REQUEST_BUDGET = 24;
/** How long nothing must be sent before a count is read. */
const QUIET_MS = 1500;

/** A same-origin GET for a file in this repository, with no query or only the page's ?v= stamp. */
function isRepoFile(url) {
  const u = new URL(url);
  if (u.origin !== new URL(BASE).origin) return false;
  if (u.search && !/^\?v=[\w.-]{1,32}$/.test(u.search)) return false;
  const p = decodeURIComponent(u.pathname);
  const file = path.join(ROOT, p.endsWith("/") ? p + "index.html" : p);
  return file.startsWith(ROOT) && fs.existsSync(file) && fs.statSync(file).isFile();
}

/**
 * In every frame of every page, the ways out that the network events cannot see: WebRTC connections (whose
 * traffic is UDP) and workers (whose own sockets are not routed here). Counted through a binding the test
 * holds, so a reload does not reset them; a frame made with no address is reached through the window it
 * hands back, which is patched before the page can use it.
 */
function countHidden() {
  const note = (kind) => {
    try {
      (window.__vtNote || window.top.__vtNote)(kind);
    } catch {
      /* ignore */
    }
  };
  const COUNTED = [
    ["RTCPeerConnection", "peers"],
    ["webkitRTCPeerConnection", "peers"],
    ["Worker", "workers"],
    ["SharedWorker", "workers"]
  ];
  const wrapConstructors = (w) => {
    for (const [name, kind] of COUNTED) {
      const C = w[name];
      if (typeof C !== "function") continue;
      w[name] = class extends C {
        constructor(...args) {
          super(...args);
          note(kind);
        }
      };
    }
    const sw = w.navigator?.serviceWorker;
    if (!sw?.register) return;
    const reg = sw.register.bind(sw);
    sw.register = (...args) => {
      note("workers");
      return reg(...args);
    };
  };
  // A child window is patched as the page first reaches it, through either door.
  const wrapGetter = (proto, prop, toWindow) => {
    const d = proto && Object.getOwnPropertyDescriptor(proto, prop);
    if (!d?.get) return;
    Object.defineProperty(proto, prop, {
      configurable: true,
      get() {
        const value = d.get.call(this);
        patch(toWindow(value));
        return value;
      }
    });
  };
  const patch = (w) => {
    if (!w || w.__vtPatched) return;
    try {
      w.__vtPatched = true;
      wrapConstructors(w);
      for (const proto of [w.HTMLIFrameElement?.prototype, w.HTMLFrameElement?.prototype, w.HTMLObjectElement?.prototype]) {
        wrapGetter(proto, "contentWindow", (x) => x);
      }
      wrapGetter(w.HTMLIFrameElement?.prototype, "contentDocument", (d) => d?.defaultView);
    } catch {
      /* a frame of another origin: its own copy of this script runs in it */
    }
  };
  patch(window);
}

/**
 * Every byte the page could use to send a take out, counted from reset(): each request's address, body and
 * headers, from any page or worker in the context, whatever its method, type or size; every WebSocket frame,
 * on sockets answered here so that none leaves the machine; and the requests themselves, so a take cut into
 * many small pieces is seen. Requests to other hosts are counted and answered here, for the same reason.
 * What the page fetched while it first loaded is learnt, and a later GET of the same file is not counted by
 * its address (a reload asks for them all again), though its headers are.
 */
async function countEgress(page) {
  const out = { gen: 0, bytes: 0, requests: 0, statics: 0, items: [], pending: [], lastAt: Date.now(), learning: true };
  const known = new Set();
  const seenValues = new Set();
  const hidden = { peers: 0, workers: 0 };
  await page.exposeBinding("__vtNote", (_src, kind) => {
    if (kind in hidden) hidden[kind] += 1;
  });
  await page.context().addInitScript(countHidden);

  const headerBytes = (h) =>
    Object.entries(h).reduce((n, [k, v]) => {
      const s = String(v);
      if (!BROWSER_HEADERS.test(k)) return n + k.length + s.length;
      if (out.learning) seenValues.add(k + ":" + s);
      return seenValues.has(k + ":" + s) ? n : n + Math.max(0, s.length - HEADER_ROOM);
    }, 0);
  const add = (gen, kind, url, n, isStatic) => {
    if (gen !== out.gen || out.learning) return;
    out.bytes += n;
    if (isStatic) out.statics += 1;
    else out.requests += 1;
    out.items.push({ kind, url: url.slice(0, 90), n });
  };

  page.context().on("request", (req) => {
    out.lastAt = Date.now();
    const url = req.url();
    if (/^(blob|data):/.test(url)) return;
    const gen = out.gen;
    const body = req.postDataBuffer()?.length ?? 0;
    const repoFile = req.method() === "GET" && !body && isRepoFile(url);
    if (out.learning && repoFile) known.add(url);
    const isStatic = repoFile && known.has(url);
    const base = isStatic ? 0 : url.length + body;
    out.pending.push(
      req
        .allHeaders()
        .catch(() => ({}))
        .then((h) => add(gen, req.resourceType(), url, base + headerBytes(h), isStatic))
    );
  });
  await page.route(
    (u) => !u.href.startsWith(BASE),
    (route) => route.fulfill({ status: 204, body: "" })
  );
  await page.routeWebSocket(/.*/, (ws) => {
    const gen = out.gen;
    add(gen, "websocket-open", ws.url(), ws.url().length, false);
    ws.onMessage((m) => add(gen, "websocket", ws.url(), typeof m === "string" ? Buffer.byteLength(m) : m.length, false));
  });
  return {
    hidden,
    known,
    /** Start counting afresh; the first call ends the learning of the page's own files. */
    reset() {
      out.learning = false;
      out.gen += 1;
      out.bytes = 0;
      out.requests = 0;
      out.statics = 0;
      out.items = [];
    },
    /**
     * Wait until nothing has been sent for a while, counted from this call too: a beacon is handed to the
     * network after the call that queued it returns, so a wait that began from the last request seen could
     * end before it (a control here once reported 0 bytes for eleven beacons that way).
     */
    async settle() {
      const t0 = Date.now();
      while (Date.now() - Math.max(out.lastAt, t0) < QUIET_MS && Date.now() - t0 < 15000) await page.waitForTimeout(100);
      await Promise.all(out.pending.splice(0));
      return { bytes: out.bytes, requests: out.requests, statics: out.statics, items: out.items.slice(), hidden: { ...hidden } };
    }
  };
}

/** Whether what was sent could have carried a take: too many bytes, too many requests, or a file fetched far too often. */
const couldCarry = (sent, staticBudget) => sent.bytes >= EGRESS_BUDGET || sent.requests > REQUEST_BUDGET || sent.statics > staticBudget;

/**
 * The saved take, cut into base64 pieces, sent one way. The shapes are the ones that slip under a per-request
 * size, type or address rule. `file` is a file the page loaded, for the ways that ride on an ordinary request.
 */
const sendTake = (page, how, file) =>
  page.evaluate(
    async ({ how, file }) => {
      const [rec] = await window.VTStorage.listRecordings();
      const buf = new Uint8Array(await (await window.VTStorage.getRecordingBlob(rec.id)).arrayBuffer());
      let s = "";
      for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
      s = btoa(s);
      const cut = (size) => {
        const pieces = [];
        for (let i = 0; i < s.length; i += size) pieces.push(s.slice(i, i + size));
        return pieces;
      };
      const each = async (size, fn) => {
        for (const p of cut(size)) await fn(p).catch(() => {});
      };
      const ways = {
        fetchText: () => each(3000, (p) => fetch("/__probe_text", { method: "POST", headers: { "content-type": "text/plain" }, body: p })),
        beacon: () => each(3000, async (p) => navigator.sendBeacon("/__probe_beacon", new Blob([p], { type: "text/plain" }))),
        queryOnAFile: () => each(3000, (p) => fetch(file + "?d=" + encodeURIComponent(p))),
        header: () => each(3000, (p) => fetch("/__probe_header", { headers: { "x-take": p } })),
        acceptOnAFile: () => each(3000, (p) => fetch(file, { headers: { accept: p } })),
        smallPiecesOnAFile: () => each(60, (p) => fetch(file, { headers: { accept: p } })),
        cookie: () =>
          each(3000, async (p) => {
            document.cookie = "t=" + p + "; path=/";
            await fetch(file);
          }).then(() => (document.cookie = "t=; max-age=0; path=/")),
        elsewhere: () =>
          // The one foreign host the page's CSP lets it connect to (others are refused before any request).
          each(3000, (p) => fetch("https://vocal-studio-entitlements.vocalstudio-pe.workers.dev/v1/voice", { method: "POST", body: p, mode: "no-cors" })),
        async websocket() {
          const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/__probe_ws");
          await new Promise((ok, no) => {
            ws.onopen = ok;
            ws.onerror = no;
          });
          for (const p of cut(3000)) ws.send(p);
          await new Promise((r) => setTimeout(r, 300));
          ws.close();
        }
      };
      await ways[how]();
      return s.length;
    },
    { how, file }
  );

test("your voice stays on your device: recording, saving, a minute after, leaving and the next visit send nothing the size of the take", async ({
  page
}) => {
  test.setTimeout(90000);
  const egress = await countEgress(page); // before the page loads: Playwright routes WebSockets from a script it injects
  await boot(page, { person: true });
  const sending = await page.evaluate(() => window.VTAnalytics.remoteState());
  expect(sending, "control: the app treats this visitor as a person, so its analytics send").toMatchObject({ sending: true });
  await openSingle(page, "v10-power-pause");
  await expect(page.locator("#chk-auto-record"), "control: this exercise records every take").toBeChecked();

  // Recorded, saved, a minute later (a send put off with a timer or to an idle moment), and the page hidden
  // and left (a send on the way out). The take is stopped at a size a beacon or a keepalive request can carry.
  egress.reset();
  await start(page);
  const target = 4 * EGRESS_BUDGET + 4096;
  await expect.poll(() => page.evaluate(() => window.__vtTake.bytes), { timeout: 20000, intervals: [100] }).toBeGreaterThanOrEqual(target);
  await page.locator("#btn-practice-stop").click();
  await expect(page.locator("#btn-save-rec"), "control: there is a recording to send").toBeVisible();
  await page.locator("#btn-save-rec").click();
  await expect(page.locator("#btn-save-rec"), "control: the save finished").toBeDisabled();
  await page.clock.runFor(60000);
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false }));
  });
  const during = await egress.settle();

  // Left and come back: the next visit, and a minute of it, where a take kept back from the last one would go.
  egress.reset();
  await page.reload({ waitUntil: "domcontentloaded" });
  await ready(page);
  await page.clock.runFor(60000);
  const after = await egress.settle();

  const take = await page.evaluate(async () => {
    const list = await window.VTStorage.listRecordings();
    return { n: list.length, bytes: list[0] ? (await window.VTStorage.getRecordingBlob(list[0].id)).size : 0 };
  });
  const files = egress.known.size;
  test.info().annotations.push({
    type: "egress",
    description: `take ${take.bytes} B; during: ${during.bytes} B in ${during.requests} requests; next visit: ${after.bytes} B in ${after.requests} requests and ${after.statics} of the page's ${files} files`
  });
  expect(take.n, "the take is kept on the device, on the next visit too").toBe(1);
  expect(take.bytes, "control: the take is at least four times the budget, so sending it would show").toBeGreaterThanOrEqual(4 * EGRESS_BUDGET);
  const both = { bytes: during.bytes + after.bytes, requests: during.requests + after.requests, statics: after.statics };
  expect(both.bytes, `bytes sent: ${JSON.stringify([...during.items, ...after.items])}`).toBeLessThan(EGRESS_BUDGET);
  expect(both.requests, "requests sent other than the page's own files").toBeLessThanOrEqual(REQUEST_BUDGET);
  expect(both.statics, "the page's own files fetched again, at most twice each").toBeLessThanOrEqual(2 * files);
  expect(after.hidden, "no WebRTC connection or worker, which the network events cannot see").toEqual({ peers: 0, workers: 0 });

  // Controls: the same counter catches the saved take sent each way that slipped past a per-request size, type
  // or address rule, a worker, and a WebRTC connection in the page or in a frame made with no address. The
  // page's CSP refuses every other host before a request is made, so the cross-origin and WebSocket controls
  // use the ones it allows: those are where a leak could go.
  const file = new URL([...egress.known].find((u) => /\/js\/app\.js/.test(u))).pathname;
  for (const how of ["fetchText", "beacon", "queryOnAFile", "header", "acceptOnAFile", "smallPiecesOnAFile", "cookie", "elsewhere", "websocket"]) {
    egress.reset();
    const chars = await sendTake(page, how, file);
    const caught = await egress.settle();
    expect(
      couldCarry(caught, 2 * files),
      `control: the take sent by ${how} (${chars} characters) is caught: ${caught.bytes} B, ${caught.requests} requests, ${caught.statics} files`
    ).toBe(true);
  }
  await page.evaluate(() => {
    new RTCPeerConnection().close();
    const f = document.createElement("iframe");
    document.body.appendChild(f);
    new f.contentWindow.RTCPeerConnection().close();
    f.remove();
    new Worker(URL.createObjectURL(new Blob(["close()"], { type: "text/javascript" }))).terminate();
  });
  await expect
    .poll(() => ({ ...egress.hidden }), { message: "control: WebRTC connections, in a frame too, and a worker are counted" })
    .toEqual({ peers: 2, workers: 1 });
});

/* ------------------------------------------------------------------ no account needed */

/** The visitor's takes of one exercise, newest first: which day, and the rating. */
const takesOf = (page, id) =>
  page.evaluate((id) => (window.VTStorage.getProgress()?.[id]?.history || []).map((h) => ({ day: h.day, score: h.score ?? null })), id);

test("no account needed: two takes, one rated, are there in a new tab, a minute later, and after a restart a month on", async ({ page, browser }) => {
  await boot(page);
  await openSingle(page, "s4-lip-trills");
  await runOut(page);
  await rate(page);
  await runOut(page); // Start again: a second take, left unrated
  const mine = await takesOf(page, "s4-lip-trills");
  expect(mine.length, "two takes kept in this tab").toBe(2);
  expect(mine[1].score, "the first take kept with its rating").not.toBeNull();

  const second = await page.context().newPage();
  await second.clock.install({ time: new Date(NOW) });
  await second.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await second.waitForFunction(() => !!window.VTStorage && !!window.VTApp);
  expect(await second.evaluate(() => sessionStorage.length), "control: the new tab shares no session storage").toBe(0);
  await second.clock.runFor(65000);
  expect(await takesOf(second, "s4-lip-trills"), "both takes and the rating, in a new tab a minute later").toEqual(mine);
  await second.locator("#btn-history").click();
  await expect(second.locator('#history-list [data-open-ex="s4-lip-trills"]').first(), "in Historial").toBeVisible();

  // A restart: what the browser keeps on disk, without the session's cookies and storage, a month on.
  const kept = await page.context().storageState({ indexedDB: true });
  kept.cookies = kept.cookies.filter((c) => c.expires > 0);
  const restarted = await browser.newContext({ storageState: kept, timezoneId: "America/Lima", locale: "es-PE" });
  try {
    const third = await restarted.newPage();
    await boot(third, { now: new Date(new Date(NOW).getTime() + 31 * DAY_MS).toISOString() });
    expect(await takesOf(third, "s4-lip-trills"), "both takes and the rating, after a restart a month on").toEqual(mine);
    await third.locator("#btn-history").click();
    await third.locator('#history-list [data-open-ex="s4-lip-trills"]').first().click();
    await third.clock.runFor(300);
    await start(third);
    await nothingInTheWay(third, "Start after the restart");
  } finally {
    await restarted.close();
  }
});

/* ------------------------------------------------------------------ no ad during practice */

/** Every form an ad takes in js/ads.js, wherever it is drawn, shown or not: a slot holding anything counts. */
const AD_FORMS = [
  ".ad-native-card",
  ".ad-preview-card",
  "ins.adsbygoogle",
  "iframe[src*='googlesyndication']",
  "iframe[src*='doubleclick']",
  "iframe[id^='aswift']",
  "[data-ad-cta]",
  "[data-ad-preview-cta]",
  ".ad-slot--native",
  ".ad-slot--adsense",
  ".ad-slot--preview",
  "[id^='ad-slot-']:not(:empty)"
].join(", ");

/** What ad forms are on the page now, by tag and first class. */
const adsDrawn = (page) =>
  page.evaluate(
    (sel) => [...document.querySelectorAll(sel)].map((el) => el.tagName.toLowerCase() + "." + String(el.className || el.id).split(" ")[0]),
    AD_FORMS
  );

/**
 * Every ad drawn from now on, even one taken away in the same moment: a MutationObserver sees each node and
 * class added, so an ad drawn and cleared before a check runs is still seen. Each sighting is filed under the
 * moment the test last named with `moment(page, name)`.
 */
async function watchAds(page) {
  await page.evaluate((sel) => {
    window.__vtMoment = "start";
    window.__vtAdsSeen = [];
    const seen = (el) => el.nodeType === 1 && (el.matches(sel) || el.querySelector(sel));
    new MutationObserver((records) => {
      for (const r of records) {
        const hits = r.type === "attributes" ? [r.target] : [...r.addedNodes];
        for (const el of hits) {
          if (seen(el)) window.__vtAdsSeen.push(window.__vtMoment + ": " + (el.id || el.className || el.tagName));
        }
      }
    }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ["class"] });
  }, AD_FORMS);
}
const moment = (page, name) => page.evaluate((n) => (window.__vtMoment = n), name);
const adsSeen = (page) => page.evaluate(() => window.__vtAdsSeen.slice());

/**
 * Ads on, in `mode`, with an AdSense client and units configured and nothing throttled. Google's script is
 * refused by the page's CSP (docs/40, step 9), so the AdSense form is drawn with no request leaving the machine;
 * the checks are on what is drawn.
 */
async function adsOn(page, mode) {
  await page.evaluate((mode) => {
    const c = window.VT_ADS_CONFIG;
    c.adsEnabled = true;
    c.mode = mode;
    c.adsense = { client: "ca-pub-0000000000000000", slots: { home: "1111111111", history: "2222222222" } };
    localStorage.removeItem("vt_ads_last_post_v1");
    localStorage.removeItem("vt_ads_last_home_v1");
  }, mode);
}

const MODES = ["preview", "native", "adsense", "hybrid"];

/**
 * Every way js/ads.js can be asked to draw, in each mode, that draws something once practice is over: each is
 * checked during practice and, as its control, after it. The native mode has no card for the home slot (both
 * cards that name it have no link yet, js/ads.js pickNativeCard), and refreshAllSafe draws only on the home
 * page, so those pairs could not show a leak in the exercise view and are left out there.
 */
const ENTRY_POINTS = ["onPostSession", "renderSlot:home", "renderSlot:history", "renderSlot:post-session", "refreshAllSafe"];
const drawsHere = (mode, entry, onHome) => !(mode === "native" && entry === "renderSlot:home") && (onHome || entry !== "refreshAllSafe");

/** Call every entry point that can draw here, in every mode, with nothing throttled; `after` runs after each. */
async function callEveryEntry(page, onHome, after = null) {
  for (const mode of MODES) {
    for (const entry of ENTRY_POINTS.filter((e) => drawsHere(mode, e, onHome))) {
      await adsOn(page, mode);
      await page.evaluate((entry) => {
        const [fn, slot] = entry.split(":");
        window.VTAds[fn](slot);
      }, entry);
      if (after) await after(mode, entry);
    }
  }
}

for (const mode of MODES) {
  test(`no ad during practice: none at any moment of a guided routine, wherever the visitor goes (${mode} mode)`, async ({ page }) => {
    test.setTimeout(60000);
    await boot(page);
    await adsOn(page, mode);
    await page.locator("#btn-next-step").click();
    await page.clock.runFor(400);
    await watchAds(page);

    await moment(page, "step 1");
    await runOut(page, 35);
    await moment(page, "step 1 done");
    await expect(page.locator("#btn-step-done-rate")).toBeVisible();
    await page.clock.runFor(1500);
    await page.locator("#btn-step-done-rate").click();
    await rate(page);
    await moment(page, "between the steps");
    await page.clock.runFor(1500);
    await expect(page.locator("#ps-routine-next"), "control: the routine goes on").toBeVisible();
    await callEveryEntry(page, false);
    await moment(page, "Historial, mid-routine");
    await page.locator("#btn-history").click();
    await page.clock.runFor(61000);
    await callEveryEntry(page, false);
    await moment(page, "home, mid-routine");
    await page.locator("#btn-nav-home").click();
    await page.clock.runFor(61000);
    await adsOn(page, mode);
    await page.locator("#btn-history").click();
    await page.locator("#btn-nav-home").click();
    await callEveryEntry(page, true);
    expect(await page.evaluate(() => window.VTSession.get().status), "control: the routine is still under way").toBe("active");

    await moment(page, "step 2");
    await adsOn(page, mode);
    await page.locator("#btn-next-step").click();
    await page.clock.runFor(400);
    await runOut(page, 35);
    await page.locator("#btn-step-done-rate").click();
    await page.locator('.rate-btn[data-feel="ok"]').click();
    await moment(page, "after the routine");
    await page.clock.runFor(1500);

    const seen = await adsSeen(page);
    expect(
      seen.filter((s) => !s.startsWith("after the routine")),
      "no ad of any form at any moment of the routine"
    ).toEqual([]);
    expect(await page.evaluate(() => window.VTSession.get()?.status), "control: the routine is over").toBe("completed");
    expect(
      seen.filter((s) => s.startsWith("after the routine")).length,
      "control: the end-of-task card once the routine is over, which the watch sees"
    ).toBeGreaterThan(0);
  });
}

test("no ad during practice: none while a take starts or is live, from any entry point in any mode; each draws one after", async ({ page }) => {
  test.setTimeout(60000);
  await boot(page, { holdMic: true });
  await openSingle(page, "v1-diction");
  await watchAds(page);
  await page.evaluate(() => (window.VTApp.getState().timer.remaining = 50));
  await moment(page, "starting");
  await page.locator("#btn-practice-start").click();
  await expect
    .poll(() => page.evaluate(() => !!window.VTApp.getState().practiceStarting), { message: "control: the take is starting, the microphone not yet answered" })
    .toBe(true);
  await callEveryEntry(page, false);
  await moment(page, "live");
  await page.evaluate(() => window.__vtReleaseMic());
  await expect.poll(() => live(page), { timeout: 10000 }).toBe(true);
  await callEveryEntry(page, false);
  expect(await live(page), "control: the take was live for every check above").toBe(true);
  expect(await adsSeen(page), "no ad of any form while the take started or was live").toEqual([]);

  // Controls: each pair above draws an ad once the single exercise is over.
  await page.clock.fastForward(45 * 1000);
  await page.clock.runFor(5600);
  await rate(page);
  const drew = [];
  await callEveryEntry(page, false, async (mode, entry) => {
    if ((await adsDrawn(page)).length) drew.push(`${mode} ${entry}`);
    await page.evaluate(() => ["home", "history", "post-session"].forEach((s) => window.VTAds.clearSlot(document.getElementById("ad-slot-" + s))));
    if ((await adsDrawn(page)).length) drew.push("a cleared slot still counted");
  });
  const pairs = MODES.flatMap((m) => ENTRY_POINTS.filter((e) => drawsHere(m, e, false)).map((e) => `${m} ${e}`));
  expect(drew, "control: every pair checked above draws an ad once practice is over").toEqual(pairs);
});

test("no ad during practice: the end-of-task card goes when Start again starts a take and when a routine starts", async ({ page }) => {
  await boot(page);
  await openSingle(page, "s4-lip-trills");
  await adsOn(page, "preview");
  await runOut(page);
  await rate(page);
  expect(await adsDrawn(page), "control: the card after a single exercise").toContain("div.ad-native-card");
  await page.evaluate(() => (window.VTApp.getState().timer.remaining = 50));
  await start(page); // Start again
  expect(await adsDrawn(page), "no card while the next take is live").toEqual([]);
  await page.clock.fastForward(45 * 1000);
  await page.clock.runFor(5600);
  await adsOn(page, "preview");
  await rate(page);
  expect(await adsDrawn(page), "control: the card after the second take").toContain("div.ad-native-card");

  // From there into a routine, through the home page, where an ad may be drawn (no routine is under way yet).
  await page.locator("#btn-back-home").click();
  await page.clock.runFor(400);
  await page.locator("#btn-next-step").click();
  await page.clock.runFor(400);
  expect(await page.evaluate(() => window.VTSession.get()?.status), "control: a routine is under way").toBe("active");
  expect(await adsDrawn(page), "no card left over from the single exercise in the routine's first step").toEqual([]);
});
