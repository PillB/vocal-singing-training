// Observable DOM/session and clock boundaries for the real billing, session and skill modules.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (name) => readFileSync(new URL("../../js/" + name, import.meta.url), "utf8");
const plain = (value) => JSON.parse(JSON.stringify(value));

function element() {
  const tokens = new Set();
  const listeners = new Map();
  return {
    hidden: false, textContent: "", dataset: {},
    classList: {
      contains: (name) => tokens.has(name),
      remove: (name) => tokens.delete(name),
      toggle(name, force) {
        const on = force === undefined ? !tokens.has(name) : force;
        if (on) tokens.add(name); else tokens.delete(name);
        return on;
      }
    },
    setAttribute(name, value) { this[name] = String(value); },
    addEventListener: (name, fn) => listeners.set(name, fn),
    click: () => listeners.get("click")?.({})
  };
}

function storage(map, blocked = false) {
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => { if (blocked) throw Error("storage refused"); map.set(key, String(value)); },
    removeItem: (key) => map.delete(key)
  };
}

function page({ local = new Map(), session = new Map(), blocked = false, gated = true } = {}) {
  const nodes = new Map(["btn-skill-first", "btn-skill-sets", "skill-context", "skill-context-title", "skill-context-task", "skill-context-fallback", "skill-feedback-toggle", "view-exercise"].map((id) => [id, element()]));
  let now = 1800000000000;
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const win = {
    console, Date: Clock, navigator: { language: "en-US" },
    localStorage: storage(local, blocked), sessionStorage: storage(session),
    document: { querySelector: (selector) => nodes.get(selector.slice(1)) || null },
    VT_BILLING_CONFIG: { skillSetsRequirePro: !gated ? false : true, trialRequiresOptIn: true, freeTrialDays: 7 },
    VTI18n: { lang: "en", t: (key) => key },
    addEventListener: () => {}
  };
  win.window = win;
  let current = null;
  win.VTStorage = { getSession: () => current, setSession: (value) => { current = value; } };
  for (const file of ["billing.js", "exercises-data.js", "session.js", "session-sets.js"]) runInNewContext(read(file), win, { filename: file });
  const all = [...win.VT_EXERCISES.vocal, ...win.VT_EXERCISES.singing];
  win.VTSets.bind({ getTab: () => "singing", findExercise: (id) => all.find((ex) => ex.id === id), startSet: (routine) => win.VTSession.start("singing", "set", routine) });
  return { win, nodes, local, session, setTime: (value) => { now = value; } };
}

test("discovery counts new tab sessions, not reloads, and celebrates only the second session", () => {
  const local = new Map(), firstSession = new Map();
  const first = page({ local, session: firstSession });
  assert.equal(first.nodes.get("btn-skill-first").hidden, true);
  assert.equal(first.nodes.get("btn-skill-sets").hidden, true);
  assert.deepEqual(JSON.parse(local.get("vt_skill_discovery_v1")), { v: 1, visits: 1 });
  const reload = page({ local, session: firstSession });
  assert.equal(reload.nodes.get("btn-skill-first").hidden, true);
  assert.equal(JSON.parse(local.get("vt_skill_discovery_v1")).visits, 1);
  const secondSession = new Map();
  const second = page({ local, session: secondSession });
  assert.equal(second.nodes.get("btn-skill-first").hidden, false);
  assert.equal(second.nodes.get("btn-skill-first").classList.contains("is-new-skill"), true);
  const again = page({ local, session: secondSession });
  assert.equal(again.nodes.get("btn-skill-first").hidden, false);
  assert.equal(again.nodes.get("btn-skill-first").classList.contains("is-new-skill"), false);
  const third = page({ local });
  assert.equal(third.nodes.get("btn-skill-first").hidden, false);
  assert.equal(third.nodes.get("btn-skill-first").classList.contains("is-new-skill"), false);
  assert.equal(JSON.parse(local.get("vt_skill_discovery_v1")).visits, 2);
});

test("malformed or refused discovery storage cannot fabricate a returning-visit celebration", () => {
  for (const raw of ["{broken", JSON.stringify({ v: 1, visits: 999 }), JSON.stringify({ v: 9, visits: 2 })]) {
    const q = page({ local: new Map([["vt_skill_discovery_v1", raw]]) });
    assert.equal(q.nodes.get("btn-skill-first").hidden, true);
    assert.equal(q.nodes.get("btn-skill-first").classList.contains("is-new-skill"), false);
  }
  const refused = page({ blocked: true });
  assert.equal(refused.nodes.get("btn-skill-first").hidden, true);
  assert.equal(refused.nodes.get("btn-skill-first").classList.contains("is-new-skill"), false);
});

test("future gated starts require explicit trial consent and stop exactly at its fixed expiry", () => {
  const q = page();
  assert.equal(q.win.VTSets.start("s-skill-breath"), null);
  assert.equal(q.win.VTBilling.trialStartedAt(), null);
  assert.equal(q.win.VTStorage.getSession(), null);
  assert.equal(q.win.VTBilling.startTrial().ok, true);
  const started = q.win.VTBilling.trialStartedAt();
  const end = Date.parse(q.win.VTBilling.trialEndsAt());
  const begun = q.win.VTSets.start("s-skill-breath");
  assert.equal(begun.set, "s-skill-breath");
  const saved = JSON.stringify(q.win.VTStorage.getSession());
  q.setTime(end - 1);
  assert.equal(q.win.VTSets.skillAccess().allowed, true);
  q.setTime(end);
  assert.deepEqual(plain(q.win.VTSets.skillAccess()), { allowed: false, mode: "expired", endsAt: null });
  assert.equal(q.win.VTSets.start("s-skill-pitch"), null);
  assert.equal(JSON.stringify(q.win.VTStorage.getSession()), saved, "denying a new start does not delete the existing session");
  assert.equal(q.win.VTBilling.startTrial().reason, "used");
  assert.equal(q.win.VTBilling.trialStartedAt(), started);
  assert.equal(q.win.VTSets.start("s-warmup").set, "s-warmup", "the existing goal routine still works without Pro");
});

test("launch preview permits skill starts without spending the optional trial", () => {
  const q = page({ gated: false });
  assert.equal(q.win.VTSets.start("s-skill-breath").set, "s-skill-breath");
  assert.equal(q.win.VTSets.skillAccess().mode, "preview");
  assert.equal(q.win.VTBilling.trialStartedAt(), null);
});

test("teaching follows the real session step and clears feedback quieting on the next step or individual practice", () => {
  const q = page({ gated: false });
  const s = q.win.VTSets.start("s-skill-pitch");
  q.win.VTSets.renderTeaching(s, "s9-pitch-match");
  assert.equal(q.nodes.get("skill-context").hidden, false);
  assert.equal(q.nodes.get("skill-context-task").textContent, "Listen to a note before seeing its trace.");
  q.nodes.get("skill-feedback-toggle").click();
  assert.equal(q.nodes.get("view-exercise").classList.contains("skill-feedback-quiet"), true);
  q.win.VTSets.renderTeaching(s, "s9-pitch-match");
  assert.equal(q.nodes.get("view-exercise").classList.contains("skill-feedback-quiet"), true, "relabeling the same step preserves the learner's choice");
  const next = q.win.VTSession.markCurrentComplete();
  q.win.VTSets.renderTeaching(next, "s10-five-note");
  assert.equal(q.nodes.get("view-exercise").classList.contains("skill-feedback-quiet"), false);
  assert.equal(q.nodes.get("skill-context-task").textContent, "Try with feedback and once without it.");
  q.nodes.get("skill-feedback-toggle").click();
  q.win.VTSets.renderTeaching(null, "s9-pitch-match");
  assert.equal(q.nodes.get("skill-context").hidden, true);
  assert.equal(q.nodes.get("view-exercise").classList.contains("skill-feedback-quiet"), false);
});

test("a persisted old set order never overlays the new curriculum's instructions on a different exercise", () => {
  const q = page({ gated: false });
  const stale = { path: "set", set: "v-skill-clarity", order: ["v1-diction", "v23-clear-speech", "v10-power-pause"], index: 0, status: "active", startedAt: "2026-11-27T12:00:00Z" };
  assert.equal(q.win.VTSets.teachingFor(stale, "v1-diction"), null, "the old over-articulation mode cannot inherit the new listen-first instruction");
  const current = q.win.VTSets.start("v-skill-clarity");
  assert.equal(current.order[0], "v7-record-review");
  assert.equal(q.win.VTSets.teachingFor(current, "v7-record-review").task, "Listen to one sentence at your usual pace.");
  assert.equal(q.win.VTSets.teachingFor({ ...current, status: "completed" }, "v7-record-review"), null);
  assert.equal(q.win.VTSets.teachingFor(current, "s9-pitch-match"), null);
});
