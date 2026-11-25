// "Nunca durante la práctica" for a guided routine: js/ads.js treats a routine that is under way as practice from
// its first step to its last, wherever the visitor is looking (docs/48 section 11). The third red team narrowed that
// in four one-line ways the browser tests did not reach: only while the routine's own exercise is open, only for
// thirty minutes after it started (the daily class runs thirty-two), only once its first step is done, and only on
// its own track's catalog. Each lets Historial, the home page or a single exercise taken in between draw an ad in
// the middle of a routine. This holds the gate to the rule itself, in the states those ways narrowed it to.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const NOW = Date.parse("2026-09-23T15:00:00Z");

/** js/ads.js with the app, the routine and the page it reads stood in for. */
function loadGate({ session, app = {}, exerciseView = false }) {
  const el = (id) => {
    if (id === "view-exercise") return { classList: { contains: (c) => c === "active" && exerciseView } };
    if (id === "btn-practice-stop") return { hidden: true };
    return null;
  };
  const win = {
    VT_ADS_CONFIG: { adsEnabled: true, mode: "preview" },
    VTSession: { get: () => session },
    VTApp: { getState: () => ({ practiceLive: false, practiceStarting: false, structured: false, tab: "singing", view: "home", ...app }) },
    document: { getElementById: el, documentElement: { lang: "es" }, head: { appendChild() {} }, createElement: () => ({}) },
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    Date: class extends Date {
      static now() {
        return NOW;
      }
    },
    Math,
    JSON,
    String,
    Number,
    Object,
    Array
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(readFileSync("js/ads.js", "utf8"), win);
  return win.VTAds;
}

/** A routine of the singing track, `minutes` after it started, with `done` of its steps done. */
const routine = (status, { minutes = 5, done = 0, track = "singing" } = {}) => ({
  status,
  track,
  path: "daily",
  order: ["s17-jaw-neck-release", "s18-costal-breath", "s4-lip-trills"],
  index: done,
  completedIds: ["s17-jaw-neck-release", "s18-costal-breath"].slice(0, done),
  startedAt: new Date(NOW - minutes * 60000).toISOString()
});

test("a routine under way is practice wherever the visitor is, however long it has run, before its first step and on any catalog", () => {
  const cases = [
    ["Historial in the middle, its own exercise not open", routine("active", { done: 1 }), { view: "history" }],
    ["a single exercise taken in between", routine("active", { done: 1 }), { view: "exercise", structured: false }],
    ["the class's last step, thirty-five minutes in", routine("active", { minutes: 35, done: 2 }), { view: "history" }],
    ["before its first step is done", routine("active", { done: 0 }), { view: "history" }],
    ["the other track's catalog", routine("active", { done: 1 }), { view: "home", tab: "vocal" }]
  ];
  for (const [label, session, app] of cases) {
    assert.equal(loadGate({ session, app }).isPracticeActive(), true, label);
  }
});

test("control: no routine, a paused one and a finished one are not practice, so the gate is not simply always shut", () => {
  for (const [label, session] of [
    ["no routine", null],
    ["paused", routine("paused", { done: 1 })],
    ["finished", routine("completed", { done: 3 })]
  ]) {
    assert.equal(loadGate({ session, app: { view: "history" } }).isPracticeActive(), false, label);
  }
  assert.equal(loadGate({ session: null, app: { practiceStarting: true } }).isPracticeActive(), true, "control: a take starting is practice");
});
