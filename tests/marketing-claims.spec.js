/**
 * The promises the selling copy makes, proved by what the product does rather than by a line in a file
 * (docs/48 section 11: a string can stay while the behaviour behind it changes, AGENTS.md's rejected pattern).
 *
 *  - "sin límite de minutos" / "no time limit": after more than an hour practised today, Start still starts
 *    and no Pro window opens, both on a first day and for a visitor coming back after ten days of an hour
 *    each, so a cap that only starts on day two, or a weekly one, is caught too.
 *  - "Tu voz se queda en tu dispositivo" / "your voice stays on your device": while a take is recorded and
 *    saved, everything the page sends (every request's address, body and page-set headers, from the page or
 *    its workers, and every WebSocket frame) stays far below the size of the take, and no WebRTC connection is
 *    opened. The same counter is shown to catch the take sent in 3 KB pieces six ways.
 *  - "No necesitas cuenta" / "no account needed": a take rated without signing in is there in a new tab.
 *  - "nunca durante la práctica" (terms.html): with ads switched on, no ad of any kind (studio tip, preview or
 *    AdSense unit) is drawn anywhere between the steps of a guided routine, nor while a take is live, in any ad
 *    mode and from any entry point; after a single exercise one is, in both the preview and AdSense forms, so
 *    the check can see each.
 *
 * Each has planted defects in qa/mutate.mjs ("promises" set: MK3, MK19 to MK22, MK26 to MK29) that turn it red.
 * MK26 to MK29 are the ones Codex's review showed the first version of this file let through.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const NOW = "2026-09-23T10:00:00-05:00";
const TODAY = "2026-09-23";

/** YYYY-MM-DD, `n` days before TODAY. */
function daysBefore(n) {
  const d = new Date(TODAY + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

/**
 * A free visitor with a fake microphone, the tour seen, on a clock the test owns. `days` seeds the practice
 * ledger. MediaRecorder is wrapped to keep what it records, so a test knows how big a take is and can send it.
 * RTCPeerConnection is wrapped to count connections, which Playwright's network events cannot see.
 */
async function boot(page, { days = null } = {}) {
  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript(
    ({ days }) => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", "es");
        localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: "singing" }));
        sessionStorage.setItem("vt_e2e", "1");
        sessionStorage.setItem("vt_stepdone_e2e", "1");
        sessionStorage.setItem("vt_rate_e2e", "1");
        if (days && !sessionStorage.getItem("vt_seeded")) {
          sessionStorage.setItem("vt_seeded", "1");
          localStorage.setItem("vt_days_v1", JSON.stringify({ v: 1, days, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true }));
        }
      } catch {
        /* ignore */
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

      window.__vtTake = { bytes: 0, chunks: [] };
      const MR = window.MediaRecorder;
      if (MR) {
        window.MediaRecorder = class extends MR {
          constructor(...args) {
            super(...args);
            this.addEventListener("dataavailable", (e) => {
              if (!e.data?.size) return;
              window.__vtTake.bytes += e.data.size;
              window.__vtTake.chunks.push(e.data);
            });
          }
        };
      }
      window.__vtPeers = 0;
      for (const name of ["RTCPeerConnection", "webkitRTCPeerConnection"]) {
        const PC = window[name];
        if (typeof PC !== "function") continue;
        window[name] = class extends PC {
          constructor(...args) {
            super(...args);
            window.__vtPeers += 1;
          }
        };
      }
    },
    { days }
  );
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && !!window.VTLoop && !!window.VTSession && !!window.VTAds);
  await page.clock.runFor(500);
}

const live = (page) => page.evaluate(() => !!window.VTApp.getState().practiceLive);

async function start(page) {
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => live(page), { timeout: 10000 }).toBe(true);
}

/** Start the open exercise and run its clock out (shortened to `sec`, most of it jumped over). */
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

/* ------------------------------------------------------------------ no time limit */

const todaySec = (page) => page.evaluate((d) => JSON.parse(localStorage.getItem("vt_days_v1")).days[d]?.sec || 0, TODAY);

const OVER_AN_HOUR_TODAY = { sec: 3720, n: 24, ex: ["s4-lip-trills"] };
const VISITORS = [
  ["on their first day", { [TODAY]: OVER_AN_HOUR_TODAY }],
  [
    "coming back after ten days of an hour each",
    Object.fromEntries([
      ...Array.from({ length: 10 }, (_, i) => [daysBefore(i + 1), { sec: 3600, n: 20, ex: ["s4-lip-trills", "v1-diction"] }]),
      [TODAY, OVER_AN_HOUR_TODAY]
    ])
  ]
];

for (const [who, days] of VISITORS) {
  test(`no time limit: ${who}, past an hour today, Start still starts and no Pro window opens`, async ({ page }) => {
    await boot(page, { days });
    const before = await todaySec(page);
    expect(before, "control: today already holds over an hour").toBeGreaterThan(3600);
    const seeded = await page.evaluate(() => Object.keys(JSON.parse(localStorage.getItem("vt_days_v1")).days).length);
    expect(seeded, "control: the ledger holds the days this visitor has").toBe(Object.keys(days).length);
    for (const id of ["s4-lip-trills", "v1-diction"]) {
      await openSingle(page, id);
      await runOut(page, 50);
      await expect(page.locator("#pricing-modal")).toBeHidden();
    }
    expect(await todaySec(page), "both takes were counted as practice").toBeGreaterThan(before);
  });
}

/* ------------------------------------------------------------------ your voice stays on your device */

/** Request headers the browser sets by itself; any other header is something the page chose to send. */
const BROWSER_HEADERS =
  /^(accept|accept-encoding|accept-language|cache-control|connection|content-length|content-type|host|if-[a-z-]+|origin|pragma|priority|range|referer|sec-[a-z-]+|upgrade-insecure-requests|user-agent)$/i;

/**
 * Every byte the page could use to send a take out, counted from now: each request's address, body and
 * page-set headers (cookies included), from the page or its workers, whatever its method, type or size; and
 * every WebSocket frame, on sockets that are answered here so that none leaves the machine. Requests to other
 * hosts are counted and then refused, for the same reason.
 */
async function countEgress(page) {
  const out = { bytes: 0, items: [], gen: 0, pending: [] };
  const add = (gen, kind, url, n) => {
    if (gen !== out.gen) return;
    out.bytes += n;
    out.items.push({ kind, url: url.slice(0, 90), n });
  };
  page.context().on("request", (req) => {
    const url = req.url();
    if (/^(blob|data):/.test(url)) return;
    const gen = out.gen;
    const base = url.length + (req.postDataBuffer()?.length ?? 0);
    out.pending.push(
      req
        .allHeaders()
        .catch(() => ({}))
        .then((h) => {
          const extra = Object.entries(h).reduce((n, [k, v]) => (BROWSER_HEADERS.test(k) ? n : n + k.length + String(v).length), 0);
          add(gen, req.resourceType(), url, base + extra);
        })
    );
  });
  await page.route(
    (u) => !u.href.startsWith(BASE),
    (route) => route.abort()
  );
  await page.routeWebSocket(/.*/, (ws) => {
    const gen = out.gen;
    add(gen, "websocket-open", ws.url(), ws.url().length);
    ws.onMessage((m) => add(gen, "websocket", ws.url(), typeof m === "string" ? Buffer.byteLength(m) : m.length));
  });
  return {
    reset() {
      out.gen += 1;
      out.bytes = 0;
      out.items = [];
    },
    async settle() {
      await Promise.all(out.pending.splice(0));
      return { bytes: out.bytes, items: out.items.slice() };
    }
  };
}

/** What the page may send while a take is recorded and saved: a few small requests, nothing the size of a take. */
const EGRESS_BUDGET = 4096;

/** The recorded take in base64 pieces of `size` characters, the shape that slips under a per-request size rule. */
const sendTake = (page, how) =>
  page.evaluate(async (how) => {
    const buf = new Uint8Array(await new Blob(window.__vtTake.chunks).arrayBuffer());
    let s = "";
    for (let i = 0; i < buf.length; i++) s += String.fromCharCode(buf[i]);
    s = btoa(s);
    const pieces = [];
    for (let i = 0; i < s.length; i += 3000) pieces.push(s.slice(i, i + 3000));
    const ways = {
      async fetchText() {
        for (const p of pieces) await fetch("/__probe_text", { method: "POST", headers: { "content-type": "text/plain" }, body: p }).catch(() => {});
      },
      async beacon() {
        for (const p of pieces) navigator.sendBeacon("/__probe_beacon", new Blob([p], { type: "text/plain" }));
      },
      async query() {
        for (const p of pieces) await fetch("/__probe_query?d=" + encodeURIComponent(p)).catch(() => {});
      },
      async header() {
        for (const p of pieces) await fetch("/__probe_header", { headers: { "x-take": p } }).catch(() => {});
      },
      async elsewhere() {
        // The one foreign host the page's CSP lets it connect to (other hosts are refused before any request).
        const host = "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev/v1/voice";
        for (const p of pieces) await fetch(host, { method: "POST", body: p, mode: "no-cors" }).catch(() => {});
      },
      async websocket() {
        const ws = new WebSocket((location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/__probe_ws");
        await new Promise((ok, no) => {
          ws.onopen = ok;
          ws.onerror = no;
        });
        for (const p of pieces) ws.send(p);
        await new Promise((r) => setTimeout(r, 300));
        ws.close();
      }
    };
    await ways[how]();
    return s.length;
  }, how);

test("your voice stays on your device: recording and saving a take sends nothing the size of it, by any way out", async ({ page }) => {
  const egress = await countEgress(page); // before the page loads: Playwright routes WebSockets from a script it injects
  await boot(page);
  await openSingle(page, "v10-power-pause");
  await expect(page.locator("#chk-auto-record"), "control: this exercise records every take").toBeChecked();

  egress.reset();
  await start(page);
  await page.waitForTimeout(1500);
  await page.clock.runFor(2500);
  await page.locator("#btn-practice-stop").click();
  await expect(page.locator("#btn-save-rec"), "control: there is a recording to send").toBeVisible();
  await page.locator("#btn-save-rec").click();
  await page.clock.runFor(1500);
  await page.waitForTimeout(800);
  const sent = await egress.settle();
  const take = await page.evaluate(() => window.__vtTake.bytes);
  test.info().annotations.push({ type: "egress", description: `${sent.bytes} bytes sent in ${sent.items.length} requests; take ${take} bytes` });

  expect(take, "control: the take is at least four times the budget, so sending it would show").toBeGreaterThanOrEqual(4 * EGRESS_BUDGET);
  expect(sent.bytes, `what the page sent while recording and saving: ${JSON.stringify(sent.items)}`).toBeLessThan(EGRESS_BUDGET);
  expect(await page.evaluate(() => window.__vtPeers), "no WebRTC connection, which the network events cannot see").toBe(0);

  // Controls: the same counter catches the take sent in 3 KB pieces, each way that slipped past a per-request
  // size and type rule, and a WebRTC connection. The page's CSP refuses every other host before a request is
  // made, so the cross-origin and WebSocket controls use the ones it allows: those are where a leak could go.
  for (const how of ["fetchText", "beacon", "query", "header", "elsewhere", "websocket"]) {
    egress.reset();
    const chars = await sendTake(page, how);
    await page.waitForTimeout(300);
    const caught = await egress.settle();
    expect(caught.bytes, `control: the take sent by ${how} (${chars} characters) is caught`).toBeGreaterThan(EGRESS_BUDGET);
  }
  await page.evaluate(() => new RTCPeerConnection().close());
  expect(await page.evaluate(() => window.__vtPeers), "control: a WebRTC connection is counted").toBe(1);
});

/* ------------------------------------------------------------------ no account needed */

test("no account needed: a take rated without signing in is there in a new tab", async ({ page }) => {
  await boot(page);
  await openSingle(page, "s4-lip-trills");
  await runOut(page);
  await page.locator('.rate-btn[data-feel="ok"]').click();
  await expect(page.locator("#score-result")).toBeVisible();
  const second = await page.context().newPage();
  await second.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await second.waitForFunction(() => !!window.VTStorage);
  const there = await second.evaluate(() => ({
    takes: window.VTStorage.getProgress()?.["s4-lip-trills"]?.history?.length || 0,
    session: sessionStorage.length
  }));
  expect(there.session, "control: the new tab shares no session storage").toBe(0);
  expect(there.takes).toBe(1);
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

for (const mode of ["preview", "adsense"]) {
  test(`no ad during practice: none between a guided routine's steps (${mode} mode)`, async ({ page }) => {
    await boot(page);
    await adsOn(page, mode);
    await page.locator("#btn-next-step").click();
    await page.clock.runFor(400);
    await runOut(page, 35);
    await page.locator("#btn-step-done-rate").click();
    await page.locator('.rate-btn[data-feel="ok"]').click();
    await expect(page.locator("#score-result")).toBeVisible();
    await page.clock.runFor(1500);
    await expect(page.locator("#ps-routine-next"), "control: the routine goes on").toBeVisible();
    expect(await adsDrawn(page), "no ad of any form between the steps").toEqual([]);
  });
}

test("no ad during practice: none while a take is live, in any mode or from any entry point; one after a single exercise", async ({ page }) => {
  await boot(page);
  await openSingle(page, "v1-diction");
  await adsOn(page, "preview");
  await page.evaluate(() => (window.VTApp.getState().timer.remaining = 50));
  await start(page);
  // Each entry point is checked on its own: refreshAllSafe clears every slot, so calling it last would hide what
  // an earlier one drew (MK29 survived exactly that).
  const ENTRY_POINTS = ["onPostSession", "renderSlot:home", "renderSlot:history", "renderSlot:post-session", "refreshAllSafe"];
  for (const mode of ["preview", "native", "adsense", "hybrid"]) {
    for (const entry of ENTRY_POINTS) {
      await adsOn(page, mode);
      await page.evaluate((entry) => {
        const [fn, slot] = entry.split(":");
        window.VTAds[fn](slot);
      }, entry);
      expect(await adsDrawn(page), `no ad while the take is live (${mode} mode, ${entry})`).toEqual([]);
    }
  }
  expect(await live(page), "control: the take was live for every check above").toBe(true);

  // Controls: once the single exercise is over the end-of-task card is drawn, so the checks above could see one;
  // and the AdSense form, which has no studio-tip card in it, is seen too.
  await adsOn(page, "preview");
  await page.clock.fastForward(45 * 1000);
  await page.clock.runFor(5600);
  await page.locator('.rate-btn[data-feel="ok"]').click();
  await page.clock.runFor(1500);
  expect(await adsDrawn(page), "control: the preview card after a single exercise").toContain("div.ad-native-card");
  await adsOn(page, "adsense");
  await page.evaluate(() => window.VTAds.clearSlot(document.getElementById("ad-slot-post-session")));
  expect(await adsDrawn(page), "control: a cleared slot counts as no ad").toEqual([]);
  await page.evaluate(() => window.VTAds.onPostSession());
  expect(await adsDrawn(page), "control: the AdSense unit after a single exercise").toContain("ins.adsbygoogle");
});
