import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
function page() {
  const values = new Map();
  const refused = new Set();
  const win = { console, CustomEvent: class {}, document: { documentElement: { dataset: {} } }, dispatchEvent: () => {}, addEventListener: () => {} };
  win.window = win;
  win.Date = class extends Date {
    constructor(...args) { super(...(args.length ? args : ["2026-11-22T15:00:00Z"])); }
    static now() { return Date.parse("2026-11-22T15:00:00Z"); }
  };
  win.localStorage = {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => { if (refused.has(key)) throw Error("quota"); values.set(key, value); },
    removeItem: (key) => values.delete(key)
  };
  for (const f of ["storage", "practice-days"]) runInNewContext(readFileSync(new URL(`../../js/${f}.js`, import.meta.url), "utf8"), win);
  return { win, values, refused };
}
test("retry flushes the original day write without counting another round", () => {
  const { win, values, refused } = page();
  refused.add("vt_days_v1");
  win.VTDays.record({ exerciseId: "bf-breathflow", sec: 30, saved: true });
  assert.equal(win.VTStorage.retryDaysSave(), false);
  refused.delete("vt_days_v1");
  assert.equal(win.VTStorage.retryDaysSave(), true);
  assert.equal(win.VTStorage.retryDaysSave(), true);
  const row = JSON.parse(values.get("vt_days_v1")).days[win.VTDays.dayKey()];
  assert.equal(row.n, 1);
  assert.equal(row.sec, 30);
});
test("unrelated refused storage cannot turn a persisted day into failure", () => {
  const { win, refused } = page();
  refused.add("vt_loop_v1");
  win.VTStorage.setLoop({ goal: "3-5" });
  win.VTDays.record({ exerciseId: "bf-breathflow", sec: 30, saved: true });
  assert.equal(win.VTStorage.isUnsaved(), true);
  assert.equal(win.VTStorage.retryDaysSave(), true);
});

test("a retry preserves a newer persisted day from another tab", () => {
  const { win, values, refused } = page();
  refused.add("vt_days_v1");
  win.VTDays.record({ exerciseId: "bf-breathflow", sec: 30, saved: true });
  const other = { v: 1, days: { "2026-11-01": { n: 1, sec: 70, ex: ["v1-diction"] } }, rest: { bank: 1, used: [] }, backfilled: true };
  values.set("vt_days_v1", JSON.stringify(other));
  refused.delete("vt_days_v1");
  assert.equal(win.VTStorage.retryDaysSave(), true);
  const persisted = JSON.parse(values.get("vt_days_v1"));
  assert.equal(persisted.days["2026-11-01"].sec, 70);
  assert.ok(persisted.days[win.VTDays.dayKey()].ex.includes("bf-breathflow"));
});
