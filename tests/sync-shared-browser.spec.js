/**
 * One browser, two accounts: the sync keeps each account's practice its own.
 *
 * RES-1. Ana's sync is still waiting on the account when she presses Salir and
 * Bruno signs in on the same laptop. The cycle used to carry on with whichever
 * session was current when each request went out, so Ana's takes were written
 * into Bruno's account (over his own copy when the two revisions matched), and
 * the laptop was recorded as Bruno's, so he was never asked about it.
 *
 * The worker is a fake at the network boundary that knows two accounts by
 * their session tokens, keeps one document per account and profile, ends a
 * session at /v1/auth/logout, and refuses a write on a stale revision, like
 * workers/entitlements/src/progress.js.
 */
const { test, expect } = require("@playwright/test");
// The fake worker answers at https://entitlements.test, which the page's
// Content Security Policy rightly refuses; the policy itself is tested in
// tests/csp.spec.js. Bypassed here, as in tests/sync.spec.js.
test.use({ bypassCSP: true });
const { patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://entitlements.test";
const PEOPLE = {
  "ana@example.test": { id: "acct_ana", token: "tok-ana", email: "ana@example.test" },
  "bruno@example.test": { id: "acct_bruno", token: "tok-bruno", email: "bruno@example.test" }
};
const CODE = "424242";

/** One take as storage.js keeps it. */
function takeRow(id, notes, at) {
  return { completedCount: 1, history: [{ id, at, notes, score: 5, durationSec: 60, metrics: {} }], lastScore: 5, lastAt: at };
}

/** The account side: documents per account and profile, live sessions, and what was asked. */
function createWorker() {
  return {
    live: new Set([PEOPLE["ana@example.test"].token]),
    docs: {},
    revs: {},
    puts: [],
    gets: [],
    // A promise a progress GET waits on before answering, for the token it names.
    hold: null
  };
}

/** Who a request's session belongs to, or null. */
function whoIs(worker, request) {
  const token = (request.headers().authorization || "").replace(/^Bearer /, "");
  if (!worker.live.has(token)) return null;
  return Object.values(PEOPLE).find((p) => p.token === token) || null;
}

/** The answers for sign-in and /v1/me. */
function accountRoute(worker, path, request, body) {
  if (path === "/v1/auth/methods") return [200, { ok: true, email: true, google: false, trialDays: 7 }];
  if (path === "/v1/auth/email/start") return [200, { ok: true, sent: true, expiresInSeconds: 900 }];
  const me = (person) => ({
    ok: true,
    account: { id: person.id, email: person.email, role: "member", trialUsed: true, createdAt: 1 },
    entitlement: { pro: false, plan: null, status: "free", source: null, periodEnd: null, provider: null },
    grants: [],
    paid: [],
    licenseId: null,
    token: null
  });
  if (path === "/v1/auth/email/verify") {
    const person = PEOPLE[body.email];
    if (!person || body.code !== CODE) return [401, { ok: false, reason: "bad_code" }];
    worker.live.add(person.token);
    return [200, { ...me(person), sessionToken: person.token, expiresAt: 4102444800 }];
  }
  if (path === "/v1/auth/logout") {
    const person = whoIs(worker, request);
    if (person) worker.live.delete(person.token);
    return [200, { ok: true }];
  }
  if (path === "/v1/me") {
    const person = whoIs(worker, request);
    return person ? [200, me(person)] : [401, { ok: false, reason: "no_session" }];
  }
  return null;
}

/** The progress routes, per account. */
async function progressRoute(worker, url, request, body) {
  const person = whoIs(worker, request);
  if (!person) return [401, { ok: false, reason: "no_session" }];
  if (request.method() === "GET") {
    const key = `${person.id}:${url.searchParams.get("profileId")}`;
    worker.gets.push({ token: person.token, key });
    if (worker.hold && worker.hold.token === person.token) await worker.hold.promise;
    return [200, { ok: true, rev: worker.revs[key] || 0, doc: worker.docs[key] || null, updatedAt: 1 }];
  }
  const key = `${person.id}:${body.profileId}`;
  worker.puts.push({ token: person.token, key, doc: body.doc });
  if (Number(body.baseRev || 0) !== (worker.revs[key] || 0)) return [409, { ok: false, reason: "conflict" }];
  worker.revs[key] = (worker.revs[key] || 0) + 1;
  worker.docs[key] = body.doc;
  return [200, { ok: true, rev: worker.revs[key], updatedAt: 2 }];
}

/** Point the site at the fake worker. */
async function installWorker(page, worker) {
  await patchBillingConfig(page, { verification: { apiBaseUrl: API } });
  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS"
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers }).catch(() => {});
    let body = {};
    try {
      body = request.postDataJSON() || {};
    } catch {
      body = {};
    }
    const answer =
      accountRoute(worker, url.pathname, request, body) ||
      (url.pathname === "/v1/me/progress" ? await progressRoute(worker, url, request, body) : [404, { ok: false, reason: "not_found" }]);
    return route
      .fulfill({ status: answer[0], contentType: "application/json", headers, body: JSON.stringify(answer[1]) })
      .catch(() => {});
  });
}

/** Open the app with Ana signed in (her session in storage, as a sign-in leaves it). */
async function bootAsAna(page, worker) {
  await installWorker(page, worker);
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      if (!sessionStorage.getItem("vt_seeded")) {
        sessionStorage.setItem("vt_seeded", "1");
        sessionStorage.setItem("vt_e2e", "1");
        localStorage.setItem("vt_account_session_v1", JSON.stringify({ token: "tok-ana", expiresAt: 4102444800 }));
      }
    } catch {
      /* ignore */
    }
  });
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && !!window.VTSync && !!window.VTAccount);
  await page.waitForFunction(() => window.VTAccount.getState().account?.id === "acct_ana");
}

/** Open the account panel, from the phone menu when that is where the door is. */
async function openPanel(page) {
  if (await page.locator("#account-modal").isVisible()) return;
  if (!(await page.locator("#btn-account").isVisible()) && (await page.locator("#btn-more").isVisible())) {
    await page.click("#btn-more");
  }
  await page.click("#btn-account");
  await expect(page.locator("#account-modal")).toBeVisible();
}

/** Sign in through the panel's emailed-code form. */
async function signInByCode(page, email) {
  await openPanel(page);
  await expect(page.locator("#account-signin")).toBeVisible();
  await page.fill("#account-email", email);
  await page.click("#account-email-submit");
  await expect(page.locator("#account-code-form")).toBeVisible();
  await page.fill("#account-code", CODE);
  await page.click("#account-code-submit");
  await expect(page.locator("#account-logged-in")).toBeVisible();
}

/** Save one take on this browser, tagged with `marker` in its notes. */
async function saveTake(page, marker) {
  await page.evaluate((m) => window.VTStorage.saveExerciseResult("v2-volume", { score: 8, durationSec: 75, notes: m }), marker);
}

/** Every note of every take an account's copy holds. */
function accountTakes(worker, person) {
  const doc = worker.docs[`${person.id}:default`];
  return Object.values((doc && doc.progress) || {}).flatMap((r) => (r.history || []).map((h) => h.notes)).sort();
}

test.describe("A shared browser: a sync still out when the account changes", () => {
  test.use({ viewport: { width: 1280, height: 800 } });

  test("Ana's cycle, answered after Salir and Bruno's sign-in, writes nothing into Bruno's account and Bruno is asked", async ({ page }) => {
    const worker = createWorker();
    const ana = PEOPLE["ana@example.test"];
    const bruno = PEOPLE["bruno@example.test"];
    // Bruno's phone wrote his copy once: rev 1, the same revision Ana's copy will be at.
    worker.docs[`${bruno.id}:default`] = { v: 1, profileId: "default", progress: { "v1-diction": takeRow("b1", "bruno-own-1", "2026-11-10T10:00:00.000Z") } };
    worker.revs[`${bruno.id}:default`] = 1;

    await bootAsAna(page, worker);
    await saveTake(page, "ana-take-1");
    expect((await page.evaluate(() => window.VTSync.syncNow())).ok).toBe(true);
    expect(accountTakes(worker, ana)).toEqual(["ana-take-1"]);

    // Her next sync waits on a slow read.
    await saveTake(page, "ana-take-2");
    let release;
    worker.hold = { token: ana.token, promise: new Promise((r) => (release = r)) };
    const reads = worker.gets.length;
    await page.evaluate(() => {
      window.__anaCycle = window.VTSync.syncNow();
    });
    await expect.poll(() => worker.gets.length).toBeGreaterThan(reads);

    // Salir (it waits up to 3 s for the sync, then signs out anyway), and Bruno signs in.
    await openPanel(page);
    await page.click("#btn-logout");
    await expect(page.locator("#account-logged-out")).toBeVisible({ timeout: 8000 });
    await signInByCode(page, bruno.email);
    await page.waitForFunction(() => window.VTAccount.getState().account?.id === "acct_bruno");

    worker.hold = null;
    release();
    const result = await page.evaluate(() => window.__anaCycle);
    // Let whatever Bruno's sign-in asked for run out too.
    await expect.poll(() => page.evaluate(() => window.VTSync.getStatus().syncing)).toBe(false);

    // Nothing of Ana's went out with Bruno's session, and his own take is still in his account.
    expect(accountTakes(worker, bruno)).toEqual(["bruno-own-1"]);
    const brunoWrites = worker.puts.filter((p) => p.token === bruno.token);
    expect(brunoWrites.map((p) => JSON.stringify(p.doc)).filter((d) => d.includes("ana-take"))).toEqual([]);
    // Ana's cycle stopped when her session went.
    expect(result).toEqual({ ok: false, reason: "signed_out" });
    // Bruno is asked about the practice on this laptop before any of it goes to him.
    await openPanel(page);
    await expect(page.locator("#account-other-owner")).toBeVisible();
  });

  test("control: with nobody switching, the same slow cycle lands both of Ana's takes in her account", async ({ page }) => {
    const worker = createWorker();
    const ana = PEOPLE["ana@example.test"];
    await bootAsAna(page, worker);
    await saveTake(page, "ana-take-1");
    expect((await page.evaluate(() => window.VTSync.syncNow())).ok).toBe(true);
    await saveTake(page, "ana-take-2");
    let release;
    worker.hold = { token: ana.token, promise: new Promise((r) => (release = r)) };
    const reads = worker.gets.length;
    await page.evaluate(() => {
      window.__anaCycle = window.VTSync.syncNow();
    });
    await expect.poll(() => worker.gets.length).toBeGreaterThan(reads);
    worker.hold = null;
    release();
    expect((await page.evaluate(() => window.__anaCycle)).ok).toBe(true);
    expect(accountTakes(worker, ana)).toEqual(["ana-take-1", "ana-take-2"]);
  });
});
