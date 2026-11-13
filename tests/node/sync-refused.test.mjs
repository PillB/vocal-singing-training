// A write the worker turned down (HTTP 400: a fourth profile on the account)
// is not sent again by any automatic sync until the profile changes here: the
// same write would be turned down again. Wrong behaviour rejected: the save's
// own timer, still pending after "Sincronizar ahora" was refused, reads the
// account and sends the same write (the merge of PR #21; on #21's tree the
// browser spec only passed because its fake clock timed the request out).
// Controls: a new change is sent; "Sincronizar ahora" still asks; a change
// made while the refused write was out is sent; a sign-out forgets it; once
// the account takes the profile it syncs as before; and a profile that goes up
// in the same round does not hide why the other did not.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const SRC = readFileSync(new URL("../../js/sync.js", import.meta.url), "utf8");
const LIMIT = { ok: false, status: 400, data: { ok: false, reason: "profile_limit" } };

/**
 * Load sync.js against a signed-in account whose worker turns down every
 * write of the profiles in `refuse`, with timers the test fires by hand.
 * @param {{profiles?: string[], refuse?: string[]}} [opts] Profiles on this browser, and which the worker refuses.
 */
function load(opts = {}) {
  const profiles = opts.profiles || ["default"];
  const refuse = new Set(opts.refuse || ["default"]);
  const store = new Map();
  const localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
  const timers = new Map();
  let nextTimer = 1;
  const synced = [];
  const accountListeners = [];
  const bags = Object.fromEntries(profiles.map((id) => [id, { v: 1, profileId: id, progress: {} }]));
  const calls = [];
  const hooks = { onPut: null, refuse };
  const acct = { signedIn: true };
  const win = {
    VTAccount: {
      getState: () => ({ signedIn: acct.signedIn, account: acct.signedIn ? { id: "acct_1" } : null }),
      getSessionToken: () => (acct.signedIn ? "tok" : null),
      onChange: (fn) => accountListeners.push(fn),
      refresh: async () => ({ ok: true }),
      async request(method, path, body) {
        calls.push({ method, path, profileId: body?.profileId });
        if (method === "GET") return { ok: true, status: 200, data: { rev: 0, doc: null } };
        hooks.onPut?.();
        return refuse.has(body.profileId) ? LIMIT : { ok: true, status: 200, data: { ok: true, rev: 1 } };
      }
    },
    VTStorage: {
      getActiveProfileId: () => profiles[0],
      getProfiles: () => ({ activeId: profiles[0], list: profiles.map((id) => ({ id })) }),
      readSyncBag: (id) => JSON.parse(JSON.stringify(bags[id])),
      writeSyncBag: (bag, id) => {
        bags[id] = bag;
      },
      onSyncedChange: (fn) => synced.push(fn)
    },
    addEventListener: () => {}
  };
  const setTimeout = (fn, ms) => {
    timers.set(nextTimer, { fn, ms });
    return nextTimer++;
  };
  const clearTimeout = (id) => timers.delete(id);
  runInNewContext(SRC, { window: win, document: {}, localStorage, setTimeout, clearTimeout, console, Date, JSON, Math, Map, Set, Promise, Number, Object, Array, String });
  const sync = win.VTSync;

  /** Let every pending promise settle. */
  const settle = async () => {
    for (let i = 0; i < 50; i += 1) await new Promise((r) => setImmediate(r));
  };
  return {
    sync,
    calls,
    hooks,
    timers,
    /** A take saved on `id`: written, and announced as storage.js does. */
    save(id = profiles[0]) {
      bags[id].progress[`ex-${calls.length}-${synced.length}`] = { completedCount: 1, history: [] };
      synced.forEach((fn) => fn(id));
    },
    /** Every timer due now fires (the save's quiet period, a retry), then everything settles. */
    async fireTimers() {
      const due = [...timers.entries()];
      timers.clear();
      due.forEach(([, t]) => t.fn());
      await settle();
    },
    announce(signedIn) {
      acct.signedIn = signedIn;
      accountListeners.forEach((fn) => fn({ signedIn }));
    },
    settle
  };
}

/** Saved, synced at once and turned down: the save's own timer is still pending. */
async function refusedWithTimerPending(opts) {
  const h = load(opts);
  h.save();
  const res = await h.sync.syncNow();
  assert.equal(res.reason, "refused");
  assert.equal(h.calls.length, 2, "the refused cycle read and wrote once");
  assert.equal(h.timers.size, 1, "the save's timer is still pending");
  return h;
}

test("a refused write is not sent again by the save's timer that was still pending", async () => {
  const h = await refusedWithTimerPending();
  await h.fireTimers();
  assert.deepEqual(h.calls.slice(2), [], "nothing read or written again");
  const status = h.sync.getStatus();
  assert.equal(status.lastError, "refused");
  assert.equal(status.refusedReason, "profile_limit");
});

test("nor by the next automatic ask (connection back, tab shown again)", async () => {
  const h = await refusedWithTimerPending();
  await h.fireTimers();
  h.sync.schedule(0);
  await h.fireTimers();
  await h.sync.flush();
  assert.deepEqual(h.calls.slice(2), []);
});

test("control: a change made after the refusal is sent", async () => {
  const h = await refusedWithTimerPending();
  await h.fireTimers();
  const before = h.calls.length;
  h.save();
  await h.fireTimers();
  assert.deepEqual(h.calls.slice(before).map((c) => c.method), ["GET", "PUT"]);
});

test("control: Sincronizar ahora still asks", async () => {
  const h = await refusedWithTimerPending();
  await h.sync.syncNow();
  assert.deepEqual(h.calls.slice(2).map((c) => c.method), ["GET", "PUT"]);
});

test("control: a change made while the refused write was out is sent, not taken as refused", async () => {
  const h = load();
  h.save();
  // A take saved after the bag was read and before the worker answered: it is
  // not in what was turned down.
  h.hooks.onPut = () => {
    h.hooks.onPut = null;
    h.save();
  };
  await h.sync.syncNow();
  await h.fireTimers();
  assert.deepEqual(h.calls.slice(2).map((c) => c.method), ["GET", "PUT"]);
});

test("control: a sign-out forgets the refusal; the next sign-in tries once", async () => {
  const h = await refusedWithTimerPending();
  h.announce(false);
  h.announce(true);
  await h.fireTimers();
  assert.deepEqual(h.calls.slice(2).map((c) => c.method), ["GET", "PUT"]);
});

test("control: once the account takes the profile, it syncs like any other", async () => {
  const h = await refusedWithTimerPending();
  // Room was made on the account, and "Sincronizar ahora" put it up.
  h.hooks.refuse.clear();
  assert.equal((await h.sync.syncNow()).ok, true);
  const before = h.calls.length;
  h.sync.schedule(0);
  await h.fireTimers();
  assert.deepEqual(h.calls.slice(before).map((c) => c.method), ["GET", "PUT"], "the next pull reads the account again");
  assert.equal(h.sync.getStatus().lastError, null);
});

test("a profile that goes up in the same round does not hide why the refused one did not", async () => {
  const h = await refusedWithTimerPending({ profiles: ["default", "p2"], refuse: ["default"] });
  h.save("p2");
  await h.fireTimers();
  assert.deepEqual(
    h.calls.slice(2).map((c) => `${c.method} ${c.profileId || c.path}`),
    ["GET /v1/me/progress?profileId=p2", "PUT p2"],
    "only the profile with something new to send went out"
  );
  const status = h.sync.getStatus();
  assert.equal(status.lastError, "refused", "the panel does not say all is saved");
  assert.equal(status.refusedReason, "profile_limit", "and still says why");
});
