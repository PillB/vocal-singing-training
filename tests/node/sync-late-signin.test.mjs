// The sign-in sync must run even when the account announced the sign-in
// before js/sync.js was listening. account.js starts its check as it runs;
// when the answer lands while sync.js is still downloading, the
// announcement goes to nobody. Wrong behaviour rejected: no sync asked for
// on that load (the classic-arm sync test went red one run in three that
// way). Controls: a signed-out visitor is not synced, and a sign-in
// announced after sync.js listens still asks once.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const SRC = readFileSync(new URL("../../js/sync.js", import.meta.url), "utf8");

/** Load sync.js against an account that is (or is not) already signed in. */
function load(signedIn) {
  const acct = { signedIn };
  const listeners = [];
  const timers = [];
  const win = {
    VTAccount: {
      getState: () => ({ signedIn: acct.signedIn }),
      getSessionToken: () => (acct.signedIn ? "tok" : null),
      onChange: (fn) => listeners.push(fn),
      request: async () => ({ ok: false, status: 0 })
    },
    VTStorage: { onSyncedChange: () => {}, getActiveProfileId: () => "default" },
    addEventListener: () => {},
    localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} }
  };
  const setTimeout = (fn, ms) => timers.push(ms) && timers.length;
  runInNewContext(SRC, { window: win, document: {}, setTimeout, clearTimeout: () => {}, console, Date, JSON, Math, Map, Set, Promise, Number, Object, Array, String });
  const announce = (state) => {
    acct.signedIn = state.signedIn;
    listeners.forEach((fn) => fn(state));
  };
  return { timers, announce };
}

test("signed in before sync.js listened: the sync is asked for as it loads", () => {
  const { timers } = load(true);
  assert.equal(timers.length, 1, "one sync scheduled");
  assert.equal(timers[0], 8000, "after the usual quiet period");
});

test("controls: signed out, nothing is asked; a later sign-in still asks", () => {
  const out = load(false);
  assert.equal(out.timers.length, 0);
  out.announce({ signedIn: false });
  assert.equal(out.timers.length, 0);
  const late = load(false);
  late.announce({ signedIn: true });
  assert.equal(late.timers.length, 1, "a sign-in announced after sync.js listens asks once");
});
