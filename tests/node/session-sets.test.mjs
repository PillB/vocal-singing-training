// Goal sets (js/session-sets.js): the data every set must satisfy, and the parts of the engine that need no
// browser. A set is run by the guided engine with the exercise ids and the seconds written here, so a wrong id
// is a step that silently disappears and a wrong number is a timer the exercise was never written for.
//
// Every check is a function over data, and every function has a control: the same check run on a planted
// defect, which must fail. A check that cannot fail on its own defect tests nothing (AGENTS.md).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

/** A page with only what the files under test touch when they load and when the checks call them. */
function page({ lang = "es", exercises = null } = {}) {
  const win = { console };
  win.window = win;
  win.document = { querySelector: () => null };
  win.addEventListener = () => {};
  win.sessionStorage = { getItem: () => null };
  runInNewContext(read("js/exercises-data.js"), win);
  const all = exercises || [...win.VT_EXERCISES.vocal, ...win.VT_EXERCISES.singing];
  let stored = null;
  win.VTStorage = { setSession: (s) => (stored = s ? JSON.parse(JSON.stringify(s)) : null), getSession: () => stored };
  // The key and its variables, so a label built from two keys is visible as two.
  win.VTI18n = { lang, t: (k, v) => (v ? `${k}${JSON.stringify(v)}` : k) };
  runInNewContext(read("js/session.js"), win);
  runInNewContext(read("js/session-sets.js"), win);
  const calls = [];
  win.VTSets.bind({
    getTab: () => "vocal",
    setTab: (t) => calls.push(["setTab", t]),
    findExercise: (id) => all.find((e) => e.id === id) || null,
    startSet: (r) => {
      calls.push(["startSet", r]);
      return win.VTSession.start(calls.some((c) => c[0] === "setTab") ? calls.find((c) => c[0] === "setTab")[1] : "vocal", "set", r);
    }
  });
  return { win, all, calls };
}

const { win, all } = page();
const SETS = win.VTSets.SETS;
const byId = new Map(all.map((e) => [e.id, e]));

/** Values made in the page's realm, as this realm's own (deepEqual compares prototypes). */
const plain = (x) => JSON.parse(JSON.stringify(x));
const vocalIds = () => plain(SETS.filter((s) => s.track === "vocal").map((s) => s.id));

const SLUG = /^(v|s)-[a-z]+(?:-[a-z]+)*$/;
// Words that promise what no study of healthy voices shows (docs/47): prevention, cure, guarantees, diagnosis.
// Whole words where a stem would catch an innocent one ("heal" in "healthy adults", "sana" in "voz sana").
const PROMISES = /\b(?:previene|prevenir|evita (?:la|las|el|los) (?:lesi|nódul|disfon)|garantiza|diagn[oó]s|guarantee|diagnos|(?:cura|curar|sanar|prevents?|cures?|heals?)\b)/i;

/** What is wrong with a list of sets against a catalogue, as readable lines. Empty when nothing is. */
export function problems(sets, catalogue) {
  const out = [];
  const seen = new Set();
  for (const s of sets) {
    const where = s.id || "(no id)";
    if (!SLUG.test(s.id || "")) out.push(`${where}: id is not v-… or s-… in lower case`);
    if (seen.has(s.id)) out.push(`${where}: id used twice`);
    seen.add(s.id);
    if (!["vocal", "singing"].includes(s.track)) out.push(`${where}: track ${s.track}`);
    else if ((s.id || "")[0] !== (s.track === "vocal" ? "v" : "s")) out.push(`${where}: id prefix does not match track ${s.track}`);
    if (!["mod", "lim", "trad"].includes(s.grade)) out.push(`${where}: grade ${s.grade}`);
    out.push(...stepProblems(s, catalogue).map((p) => `${where}: ${p}`));
    out.push(...wordProblems(s).map((p) => `${where}: ${p}`));
  }
  return out;
}

function stepProblems(s, catalogue) {
  const out = [];
  const steps = Array.isArray(s.steps) ? s.steps : [];
  if (steps.length < 2 || steps.length > 8) out.push(`${steps.length} steps (2 to 8)`);
  const ids = steps.map((x) => x[0]);
  if (new Set(ids).size !== ids.length) out.push("a step repeats");
  let total = 0;
  for (const [id, sec] of steps) {
    const ex = catalogue.get(id);
    total += Number(sec) || 0;
    if (!ex) {
      out.push(`step ${id} is not in the catalogue`);
      continue;
    }
    if (!Number.isInteger(sec) || sec < 30) out.push(`step ${id} runs ${sec}s (whole seconds, 30 or more)`);
    if (!(ex.timerDefaultSec > 0)) out.push(`step ${id} has no timer of its own to shorten`);
    else if (sec > ex.timerDefaultSec) out.push(`step ${id} runs ${sec}s, longer than the exercise's own ${ex.timerDefaultSec}s`);
  }
  if (total < 150 || total > 900) out.push(`runs ${total}s in all (2:30 to 15:00)`);
  return out;
}

function wordProblems(s) {
  const out = [];
  for (const lang of ["es", "en"]) {
    const w = s[lang];
    if (!w) {
      out.push(`no ${lang} words`);
      continue;
    }
    for (const k of ["name", "goal", "why", "src"]) if (!String(w[k] || "").trim()) out.push(`${lang}.${k} is empty`);
    if (typeof w.tip !== "string") out.push(`${lang}.tip is not text`);
    if (String(w.name || "").length > 28) out.push(`${lang}.name is ${w.name.length} characters (28 fit the banner at 320px)`);
    const text = [w.name, w.goal, w.why, w.tip].join(" ");
    if (PROMISES.test(text)) out.push(`${lang} promises: "${text.match(PROMISES)[0]}"`);
  }
  if (s.es && s.en) {
    for (const k of ["name", "goal", "why"]) if (s.es[k] === s.en[k]) out.push(`${k} is the same text in both languages`);
    if (!!s.es.tip !== !!s.en.tip) out.push("a tip in one language only");
  }
  return out;
}

test("every set names real exercises, runs within their timers, and reads in both languages", () => {
  assert.ok(SETS.length >= 10, `control: the sets were read (${SETS.length})`);
  assert.ok(all.length >= 47, `control: the catalogue was read (${all.length})`);
  assert.deepEqual(problems(SETS, byId), []);
});

test("both tracks have their sets: speaking is not left with fewer than singing", () => {
  const count = (t) => SETS.filter((s) => s.track === t).length;
  assert.ok(count("vocal") >= 5, `speaking has ${count("vocal")}`);
  assert.ok(count("singing") >= 5, `singing has ${count("singing")}`);
  assert.ok(count("vocal") >= count("singing"), "the request was sets on the speaking side to match singing");
});

test("control: each rule fails on its own planted defect", () => {
  const good = SETS.find((s) => s.id === "v-pretalk");
  const plant = (change) => {
    const copy = JSON.parse(JSON.stringify(good));
    change(copy);
    return problems([copy], byId).join(" | ");
  };
  assert.equal(problems([good], byId).length, 0, "the unplanted set is clean");
  assert.match(plant((s) => (s.steps[0][0] = "s99-not-there")), /not in the catalogue/);
  assert.match(plant((s) => (s.steps[0][1] = 9999)), /longer than the exercise's own/);
  assert.match(plant((s) => (s.steps[0][1] = 10)), /30 or more/);
  assert.match(plant((s) => (s.steps[1][0] = s.steps[0][0])), /a step repeats/);
  assert.match(plant((s) => (s.steps = s.steps.slice(0, 1))), /1 steps/);
  assert.match(plant((s) => (s.steps[0][0] = "v5-neutral-ears")), /no timer of its own/);
  assert.match(plant((s) => (s.id = "pretalk")), /id is not v-/);
  assert.match(plant((s) => (s.track = "singing")), /prefix does not match/);
  assert.match(plant((s) => (s.grade = "strong")), /grade strong/);
  assert.match(plant((s) => (s.en.name = "")), /en\.name is empty/);
  assert.match(plant((s) => (s.en.goal = s.es.goal)), /goal is the same text/);
  assert.match(plant((s) => (s.en.tip = "")), /a tip in one language only/);
  assert.match(plant((s) => (s.es.name = "Un nombre demasiado largo para caber")), /characters/);
  assert.match(plant((s) => (s.es.why = "Este calentamiento previene lesiones.")), /promises/);
  assert.match(plant((s) => (s.en.why = "This warm-up prevents injury.")), /promises/);
  assert.match(plant((s) => (s.en.why = "It heals a tired voice.")), /promises/);
  // …and the study's own words are not a promise
  assert.doesNotMatch(plant((s) => (s.en.why = "Tested in healthy adults.")), /promises/);
  assert.doesNotMatch(plant((s) => (s.es.why = "Probado en personas con la voz sana.")), /promises/);
  assert.match(problems([good, good], byId).join(" | "), /id used twice/);
});

test("no grade is drawn as the maximum: no technique here has strong long-term evidence", () => {
  const marks = win.VTSets.GRADE_MARKS;
  assert.deepEqual(Object.keys(marks).sort(), ["lim", "mod", "trad"]);
  assert.ok(marks.mod > marks.lim && marks.lim > marks.trad, "more support draws more marks");
  assert.ok(Math.max(...Object.values(marks)) < win.VTSets.GRADES.length, "the last mark stays empty");
});

test("a set is resolved in the page's language, with a timer for every step", () => {
  const es = win.VTSets.resolve("v-aftertalk");
  assert.equal(es.name, "Después de hablar mucho");
  assert.deepEqual(plain(es.order), ["s17-jaw-neck-release", "v22-voice-recovery"]);
  assert.deepEqual({ ...es.sec }, { "s17-jaw-neck-release": 105, "v22-voice-recovery": 600 });
  assert.equal(es.totalSec, 705);
  assert.equal(es.minutes, 12);
  const en = page({ lang: "en" }).win.VTSets.resolve("v-aftertalk");
  assert.equal(en.name, "After a lot of talking");
  assert.equal(win.VTSets.resolve("v-nothing"), null);
  assert.deepEqual(plain(win.VTSets.list("vocal").map((s) => s.id)), vocalIds());
});

test("a step this build does not have is left out, and a set left with one step is no set", () => {
  const without = (ids) => page({ exercises: all.filter((e) => !ids.includes(e.id)) }).win.VTSets;
  const one = without(["v21-straw-to-speech"]).resolve("v-pretalk");
  assert.deepEqual(plain(one.order), ["s18-costal-breath", "v2-volume"]);
  assert.equal(one.sec["v21-straw-to-speech"], undefined);
  assert.equal(one.totalSec, 150);
  assert.equal(without(["v22-voice-recovery"]).resolve("v-aftertalk"), null);
  assert.deepEqual(
    plain(without(["v22-voice-recovery"]).list("vocal").map((s) => s.id)),
    vocalIds().filter((id) => id !== "v-aftertalk")
  );
});

test("starting a set hands the engine its order, its timers and its id, on its own track", () => {
  const p = page();
  const session = p.win.VTSets.start("s-cooldown");
  // The page was on Hablar: the set is a singing one, so the tab follows before the session is made.
  assert.deepEqual(p.calls[0], ["setTab", "singing"]);
  const sent = p.calls.find((c) => c[0] === "startSet")[1];
  assert.deepEqual(plain(sent.order), ["s5-sirens", "s6-straw", "s7-humming"]);
  assert.deepEqual({ ...sent.sec }, { "s5-sirens": 90, "s6-straw": 150, "s7-humming": 90 });
  assert.equal(sent.set, "s-cooldown");
  assert.equal(sent.toast, 'sets.startToast{"name":"Enfriar la voz","n":"3"}');
  // What the engine stored is what a reload reads back.
  const stored = p.win.VTStorage.getSession();
  assert.equal(stored.path, "set");
  assert.equal(stored.set, "s-cooldown");
  assert.equal(stored.track, "singing");
  assert.deepEqual(stored.sec, { "s5-sirens": 90, "s6-straw": 150, "s7-humming": 90 });
  assert.equal(session.order.length, 3);
  assert.equal(p.win.VTSets.start("s-nothing"), null);
});

test("the banner names a running set, and nothing else", () => {
  const p = page();
  p.win.VTSets.start("v-clarity");
  const s = p.win.VTSession.get();
  assert.equal(p.win.VTSets.bannerName(s), "Que se te entienda");
  // The step count carries no route suffix: the banner already names the set.
  assert.equal(p.win.VTSession.progressLabel(), 'session.progress{"n":1,"total":3}');
  // A set this build no longer has keeps a name instead of the stored id.
  assert.equal(p.win.VTSets.bannerName({ ...s, set: "v-retired" }), "sets.banner");
  assert.equal(p.win.VTSets.bannerName({ ...s, path: "basics" }), null);
  assert.equal(p.win.VTSets.bannerName({ ...s, path: "daily" }), null);
  assert.equal(p.win.VTSets.bannerName(null), null);
});

test("control: a catalogue route still carries its route name after the step count", () => {
  const p = page();
  p.win.VTSession.start("vocal", "advanced");
  assert.match(p.win.VTSession.progressLabel(), /^session\.progress\{"n":1,"total":11\} · /);
});

test("only a finished set ends on the set's card", () => {
  const p = page();
  p.win.VTSets.start("v-pretalk");
  const s = p.win.VTSession.get();
  // No finishing card in this page (no #set-done): the ending is still claimed, so the loop's card and the
  // plain "sesión terminada" toast do not follow it.
  assert.equal(p.win.VTSets.onComplete(s), true);
  assert.equal(p.win.VTSets.onComplete({ ...s, path: "basics" }), false);
  assert.equal(p.win.VTSets.onComplete({ ...s, path: "daily" }), false);
  assert.equal(p.win.VTSets.onComplete({ ...s, set: "v-retired" }), false, "an unknown set falls back to the plain ending");
  assert.equal(p.win.VTSets.onComplete(null), false);
});
