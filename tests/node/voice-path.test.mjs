// Tu camino (js/voice-path.js): the areas and logros that sit on top of the daily loop.
//
// Each test models the right behaviour and the specific wrong one it must catch, and runs the real ledger
// (js/practice-days.js) under the module, on a fixed clock in Lima, with storage the test owns. Nothing here
// re-derives an expected value with the module's own code: every expected number is written out by hand from
// the ledger the test builds. qa/mutate.mjs (set "path") plants each defect named below and expects a red run.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

/** Wednesday 18 November 2026, 10:00 in Lima (UTC−5). The week starts Monday 16. */
const NOW = Date.parse("2026-11-18T15:00:00Z");

/** A Date whose "now" is fixed, in Lima's local time, for the page's realm. */
function fixedDate(now) {
  return class FixedDate extends Date {
    constructor(...a) {
      super(...(a.length ? a : [now]));
    }
    static now() {
      return now;
    }
  };
}

/**
 * A page holding the ledger, the loop's memory and the flags in plain objects, with the files under test loaded.
 * @param {{ days?: object, rest?: object, loop?: object, flags?: object, lang?: string, arm?: string|null, now?: number }} o
 */
function page(o = {}) {
  process.env.TZ = "America/Lima";
  const store = {
    days: { v: 1, days: o.days || {}, rest: o.rest || { bank: 1, earnedAt: 0, used: [] }, backfilled: true },
    loop: o.loop || null,
    flags: o.flags ? { ...o.flags } : {}
  };
  const events = [];
  const win = { console, Math, JSON };
  win.window = win;
  win.Date = fixedDate(o.now || NOW);
  win.document = { querySelector: () => null };
  win.addEventListener = () => {};
  win.location = { origin: "https://example.test", pathname: "/index.html" };
  win.crypto = { getRandomValues: (b) => b.fill(7) };
  win.VTStorage = {
    getDays: () => JSON.parse(JSON.stringify(store.days)),
    setDays: (b) => (store.days = JSON.parse(JSON.stringify(b))),
    getLoop: () => (store.loop ? JSON.parse(JSON.stringify(store.loop)) : null),
    setLoop: (b) => (store.loop = JSON.parse(JSON.stringify(b))),
    getAchievementFlags: () => ({ ...store.flags }),
    setAchievementFlags: (f) => (store.flags = { ...f }),
    getProgress: () => ({}),
    getHoldLogs: () => []
  };
  win.VTI18n = { lang: o.lang || "es", t: (k) => k };
  win.VTAnalytics = { track: (name, props) => events.push([name, props]) };
  win.VTExperiments = { variant: () => (o.arm === undefined ? null : o.arm), exposeOnce: () => {} };
  runInNewContext(read("js/practice-days.js"), win);
  runInNewContext(read("js/daily-loop.js"), win);
  runInNewContext(read("js/voice-path.js"), win);
  return { win, P: win.VTPath, store, events };
}

/** A practice row: the exercises in the order first practised that day. */
const row = (ex, extra = {}) => ({ sec: 200, n: ex.length || 1, ex, ...extra });

/** Day keys from `from`, every `step` days, `count` of them. */
function every(from, step, count) {
  const out = [];
  const d = new Date(`${from}T12:00:00`);
  for (let i = 0; i < count; i += 1) {
    const x = new Date(d);
    x.setDate(d.getDate() + i * step);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`);
  }
  return out;
}

const daysOf = (keys, ex = ["s4-lip-trills"], extra = {}) => Object.fromEntries(keys.map((k) => [k, row(ex, extra)]));
const plain = (x) => JSON.parse(JSON.stringify(x));
/** Run the first evaluation (the quiet one) so the next one can bring news. */
const settle = (P) => P.evaluate();

/* —— The areas —— */

test("every exercise in the catalogue belongs to exactly one area, and every area names real exercises", () => {
  const { win, P } = page();
  runInNewContext(read("js/exercises-data.js"), win);
  const catalogue = [...win.VT_EXERCISES.vocal, ...win.VT_EXERCISES.singing].map((e) => e.id);
  assert.ok(catalogue.length >= 52, `control: the catalogue was read (${catalogue.length})`);
  const listed = plain(P.AREAS.flatMap((a) => a.ex));
  const dupes = listed.filter((id, i) => listed.indexOf(id) !== i);
  assert.deepEqual(dupes, [], "an exercise in two areas is counted twice on one day");
  const missing = catalogue.filter((id) => !listed.includes(id) && !P.NO_AREA.includes(id));
  assert.deepEqual(missing, [], "an exercise in no area is practice the path never sees");
  const ghosts = listed.filter((id) => !catalogue.includes(id));
  assert.deepEqual(ghosts, [], "an area names an exercise the catalogue does not have");
  for (const t of ["singing", "vocal"]) {
    assert.ok(P.AREAS.filter((a) => a.tracks.includes(t)).length >= 6, `${t} shows at least six areas`);
  }
});

test("an area counts distinct days: a long day, a second session or two exercises of one area add nothing", () => {
  const days = {
    "2026-11-02": row(["s4-lip-trills", "s6-straw"]), // two warm-up exercises: one day of warm-up
    "2026-11-03": row(["s4-lip-trills"], { n: 9, sec: 3600 }), // an hour, nine takes: still one day
    "2026-11-05": row(["s27-lip-trill-solfege"])
  };
  const { P } = page({ days });
  const singing = Object.fromEntries(plain(P.areas("singing")).map((a) => [a.id, a.days]));
  assert.equal(singing.warm, 2, "warm-up: 2 days (not 3 for two exercises, not more for an hour)");
  assert.equal(singing.pitch, 1);
  assert.equal(singing.breath, 0);
  assert.equal(P.areaOf("s27-lip-trill-solfege"), "pitch");
});

test("stages fall at 1, 5, 15, 40 and 100 days", () => {
  const { P } = page();
  const at = [0, 1, 4, 5, 14, 15, 39, 40, 99, 100, 500].map((n) => P.stageOf(n));
  assert.deepEqual(at, [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5]);
});

test("an area practised this week says so; one practised only before Monday does not", () => {
  const days = { "2026-11-12": row(["s18-costal-breath"]), "2026-11-17": row(["s4-lip-trills"]) };
  const { P } = page({ days });
  const byId = Object.fromEntries(plain(P.areas("singing")).map((a) => [a.id, a.week]));
  assert.equal(byId.warm, true, "Tuesday 17 is this week");
  assert.equal(byId.breath, false, "Thursday 12 was last week");
});

/* —— Only news is news —— */

test("a first run on a browser with months of practice files everything as seen: no flood of news", () => {
  const keys = every("2026-08-03", 1, 100).filter((k, i) => i % 9 !== 4); // a gap now and then: comebacks
  const days = daysOf(keys, ["s4-lip-trills"], { basics: 1 });
  days["2026-11-18"] = row(["s4-lip-trills"], { basics: 1 });
  const { P, events } = page({ days });
  const r = P.evaluate();
  assert.deepEqual(plain(r.fresh), [], "nothing is news on the first run");
  const got = plain(P.earned());
  assert.ok(got.includes("basics30") && got.includes("week4") && got.includes("back"), `earned quietly: ${got}`);
  assert.deepEqual(plain(P.unseen()), { logros: [], stages: [] }, "and nothing waits to be announced");
  assert.equal(events.filter((e) => e[0] === "path_new").length, 0, "no news events either");
});

test("a first run with a short history is quiet too, not only one too long to announce", () => {
  // Two days, a gap between them, and today practised: one logro (De vuelta), well under the news limit, so
  // only the first-run rule keeps it quiet. A later run with the same day would announce it.
  const days = daysOf(["2026-11-05", "2026-11-18"]);
  const first = page({ days });
  const r = first.P.evaluate();
  assert.deepEqual(plain(first.P.earned()), ["back"], "control: exactly one logro, so the news limit is not what holds it");
  assert.deepEqual(plain(r.fresh), [], "the first run on this browser files it as seen");
  assert.deepEqual(plain(first.P.unseen().logros), []);
  const later = page({ days: daysOf(["2026-11-05"]) });
  settle(later.P);
  later.store.days.days["2026-11-18"] = row(["s4-lip-trills"]);
  assert.deepEqual(plain(later.P.evaluate().fresh), ["back"], "control: after the first run the same day is news");
});

test("after the first run, a logro earned by today's practice is news once, then seen", () => {
  // Practice up to the 14th, a gap, and back today (the 18th): a comeback today.
  const days = daysOf(["2026-11-10", "2026-11-11", "2026-11-12"]);
  const { P, store, events } = page({ days });
  settle(P);
  assert.ok(!plain(P.earned()).includes("back"), "control: no comeback yet");
  store.days.days["2026-11-18"] = row(["s4-lip-trills"]);
  const r = P.evaluate();
  assert.deepEqual(plain(r.fresh), ["back"]);
  assert.deepEqual(plain(P.unseen().logros), ["back"]);
  assert.deepEqual(events.filter((e) => e[0] === "path_new").map((e) => e[1].id), ["back"]);
  const html = P.doneHtml();
  assert.match(html, /De vuelta/, "the completion card names it");
  assert.equal(P.doneHtml(), "", "and the next card does not repeat it");
  assert.deepEqual(plain(P.unseen().logros), []);
});

test("many logros at once are history, not news (a sync that brought another device's days)", () => {
  const { P, store } = page({ days: { "2026-11-18": row(["s4-lip-trills"]) } });
  settle(P);
  // Another device's months arrive in one sync, with today practised.
  Object.assign(store.days.days, daysOf(every("2026-08-03", 2, 50), ["s4-lip-trills", "s3-song-stanzas"], { basics: 1, saved: true }));
  const r = P.evaluate();
  assert.deepEqual(plain(r.fresh), [], "more than three at once are filed as seen");
  assert.ok(plain(P.earned()).length >= 4, "but they are all earned");
});

test("a logro found on a day without practice is filed quietly (the practice that earned it was another day)", () => {
  const { P, store } = page({ days: daysOf(["2026-11-10", "2026-11-11"]) });
  settle(P);
  store.days.days["2026-11-14"] = row(["s4-lip-trills"]); // a return on Saturday, not seen until today
  const r = P.evaluate();
  assert.deepEqual(plain(r.fresh), [], "today was not practised, so nothing is announced");
  assert.ok(plain(P.earned()).includes("back"), "but the comeback is in the collection");
});

/* —— Nothing withers —— */

test("an earned logro is kept when what earned it is no longer true", () => {
  const { P, store } = page({ days: daysOf(["2026-11-16", "2026-11-17", "2026-11-18"]) });
  P.evaluate();
  assert.ok(plain(P.earned()).includes("week1"), "control: three days this week meet 3-5");
  // The goal is raised to 5-7 and two days are lost (a trimmed or merged ledger).
  store.loop = { ...(store.loop || {}), goal: "5-7", goalAt: "2026-11-18T15:00:00Z" };
  delete store.days.days["2026-11-16"];
  delete store.days.days["2026-11-17"];
  P.evaluate();
  assert.ok(plain(P.earned()).includes("week1"), "week1 stays earned");
});

/* —— What each logro acknowledges —— */

test("weeks in range use the low end of the singer's own goal", () => {
  const four = daysOf(["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"]);
  assert.ok(plain(page({ days: four }).P.weeks()).inRange === 1, "4 days meets 3-5");
  const hard = page({ days: four, loop: { goal: "5-7", seed: "x" } });
  assert.equal(plain(hard.P.weeks()).inRange, 0, "4 days does not meet 5-7");
  hard.P.evaluate();
  assert.ok(!plain(hard.P.earned()).includes("week1"));
  assert.equal(plain(hard.P.weeks()).best, 4, "the best week is four days either way");
});

test("four of the same weekday in a row is a fixed day; a skipped week breaks the run", () => {
  const mondays = every("2026-10-26", 7, 4); // 26 Oct, 2, 9, 16 Nov
  const yes = page({ days: daysOf(mondays) });
  yes.P.evaluate();
  assert.ok(plain(yes.P.earned()).includes("weekday"));
  assert.match(yes.P.logroText("weekday").body, /cuatro lunes seguidos/);
  const gap = page({ days: daysOf(["2026-10-19", "2026-10-26", "2026-11-09", "2026-11-16"]) });
  gap.P.evaluate();
  assert.ok(!plain(gap.P.earned()).includes("weekday"), "the 2 Nov Monday is missing");
  const three = page({ days: daysOf(every("2026-11-02", 7, 3)) }); // 2, 9, 16 Nov: one Monday short
  three.P.evaluate();
  assert.ok(!plain(three.P.earned()).includes("weekday"), "three Mondays in a row are not yet four");
});

test("a gap the rest days covered is rest, not a comeback; an uncovered one is a comeback", () => {
  const days = daysOf(["2026-11-10", "2026-11-12"]);
  const rested = page({ days, rest: { bank: 0, earnedAt: 0, used: ["2026-11-11"] } });
  rested.P.evaluate();
  assert.ok(!plain(rested.P.earned()).includes("back"), "11 Nov was a rest day");
  assert.ok(plain(rested.P.earned()).includes("rest"), "and using it is acknowledged");
  const lapsed = page({ days: daysOf(["2026-11-10", "2026-11-13"]), rest: { bank: 0, earnedAt: 0, used: [] } });
  lapsed.P.evaluate();
  assert.ok(plain(lapsed.P.earned()).includes("back"));
  assert.ok(!plain(lapsed.P.earned()).includes("rest"));
});

test("basics: seven finished days, not six; more than the minimum needs an Esencial or a Clase finished", () => {
  const six = page({ days: daysOf(every("2026-11-01", 1, 6), ["s4-lip-trills"], { basics: 1, len: "min" }) });
  six.P.evaluate();
  assert.ok(!plain(six.P.earned()).includes("basics7"));
  assert.ok(!plain(six.P.earned()).includes("more"), "a Mínimo is not more than the minimum");
  const seven = page({ days: daysOf(every("2026-11-01", 1, 7), ["s4-lip-trills"], { basics: 1, len: "ess" }) });
  seven.P.evaluate();
  assert.ok(plain(seven.P.earned()).includes("basics7"));
  assert.ok(plain(seven.P.earned()).includes("more"));
});

test("every area of singing needs a song too; the speaking Mínimo alone is not both voices", () => {
  const singing = ["s4-lip-trills", "s18-costal-breath", "s12-easy-onset", "s27-lip-trill-solfege", "s7-humming", "s5-sirens"];
  const noSong = page({ days: { "2026-11-17": row(singing) } });
  noSong.P.evaluate();
  assert.ok(!plain(noSong.P.earned()).includes("allSinging"), "six of seven areas");
  const all = page({ days: { "2026-11-17": row([...singing, "s3-song-stanzas"]) } });
  all.P.evaluate();
  assert.ok(plain(all.P.earned()).includes("allSinging"));
  const vocalMin = page({ days: { "2026-11-17": row(["s4-lip-trills", "v1-diction"]) } });
  vocalMin.P.evaluate();
  assert.ok(!plain(vocalMin.P.earned()).includes("both"), "lip trills are warm-up for both, not singing");
  const both = page({ days: { "2026-11-17": row(["s9-pitch-match", "v1-diction"]) } });
  both.P.evaluate();
  assert.ok(plain(both.P.earned()).includes("both"));
});

test("a goal set counts once half of its steps were practised; a cool-down set is a gentle ending", () => {
  const { P } = page({ days: daysOf(["2026-11-17"]) });
  assert.equal(P.noteSet("s-cooldown", 1, 3), false, "one of three steps is not half");
  P.evaluate();
  assert.ok(!plain(P.earned()).includes("set"));
  assert.equal(P.noteSet("s-cooldown", 2, 3), true);
  P.evaluate();
  assert.ok(plain(P.earned()).includes("set") && plain(P.earned()).includes("cool"));
  const recovery = page({ days: { "2026-11-17": row(["v22-voice-recovery"]) } });
  recovery.P.evaluate();
  assert.ok(plain(recovery.P.earned()).includes("cool"), "the recovery drill is a cool-down on its own");
});

test("warming up counts only before the song, in the order practised", () => {
  const before = page({ days: { "2026-11-17": row(["s4-lip-trills", "s3-song-stanzas"]) } });
  before.P.evaluate();
  assert.ok(plain(before.P.earned()).includes("warmfirst"));
  const after = page({ days: { "2026-11-17": row(["s3-song-stanzas", "s4-lip-trills"]) } });
  after.P.evaluate();
  assert.ok(!plain(after.P.earned()).includes("warmfirst"), "trills after the song are not a warm-up for it");
  // Something else first (sirens, a range exercise), then the song, then the trills: the song still came
  // before any warm-up, though it is not the first exercise of the day.
  const late = page({ days: { "2026-11-17": row(["s5-sirens", "s3-song-stanzas", "s4-lip-trills"]) } });
  late.P.evaluate();
  assert.ok(!plain(late.P.earned()).includes("warmfirst"), "a warm-up after the song, with sirens before it, is still after");
});

test("rating a take and recording to compare are acknowledged; neither is a score", () => {
  const { P } = page({ days: { "2026-11-17": row(["s26-placement-compare"], { saved: true }) } });
  P.evaluate();
  assert.ok(plain(P.earned()).includes("rated") && plain(P.earned()).includes("listen"));
});

test("no logro rewards minutes, loudness, a longest hold or a score", () => {
  // A ledger with an enormous day of everything except the behaviours the logros name.
  const { P } = page({ days: { "2026-11-17": row(["s8-breath-support", "s9-pitch-match"], { sec: 36000, n: 400 }) } });
  P.evaluate();
  assert.deepEqual(plain(P.earned()), [], "ten hours and 400 takes earn nothing by themselves");
  const ids = plain(P.LOGROS).join(" ");
  assert.doesNotMatch(ids, /hold|minute|session|loud|score|record|streak/i);
});

/* —— Stages —— */

test("a stage is news at its exact count; a jump past it is filed quietly", () => {
  const four = every("2026-11-10", 1, 4); // 10-13 Nov: four days of breath
  const { P, store } = page({ days: daysOf(four, ["s18-costal-breath"]) });
  settle(P);
  store.days.days["2026-11-18"] = row(["s18-costal-breath"]); // the fifth day, today
  P.evaluate();
  assert.deepEqual(plain(P.unseen().stages), [["breath", 5]]);
  assert.match(P.doneHtml(), /Aire: Lo practicas \(5 días\)/);
  const jump = page({ days: daysOf(four, ["s18-costal-breath"]) });
  settle(jump.P);
  Object.assign(jump.store.days.days, { "2026-11-16": row(["s18-costal-breath"]), "2026-11-18": row(["s18-costal-breath"]) });
  jump.P.evaluate();
  assert.deepEqual(plain(jump.P.unseen().stages), [], "4 to 6 skipped the exact count: no announcement");
});

test("the completion card shows at most two lines and sends the rest to Historial", () => {
  // Every day from the 11th to yesterday (last week in range already), then today brings three.
  const { P, store } = page({ days: daysOf(every("2026-11-11", 1, 7)) });
  settle(P);
  store.days.days["2026-11-18"] = row(["s4-lip-trills", "s3-song-stanzas", "s26-placement-compare"], { saved: true });
  const r = P.evaluate();
  assert.ok(r.fresh.length === 3, `three logros today: ${plain(r.fresh)}`);
  const html = P.doneHtml();
  assert.equal((html.match(/data-logro=/g) || []).length, 2);
  assert.match(html, /Y 1 más en Historial/);
  assert.deepEqual(plain(P.unseen().logros).length, 1, "the third waits, unseen");
});

test("a card already full gets one line, and a logro the card says in its own words is not repeated", () => {
  const { P, store } = page({ days: daysOf(every("2026-11-11", 1, 7)) });
  settle(P);
  store.days.days["2026-11-18"] = row(["s4-lip-trills", "s3-song-stanzas", "s26-placement-compare"], { saved: true });
  P.evaluate();
  const one = P.doneHtml({ max: 1 });
  assert.equal((one.match(/data-logro=/g) || []).length, 1, "max: 1 is one line");
  assert.match(one, /Y 2 más en Historial/);
  // A comeback: the loop's card already says welcome back.
  const back = page({ days: daysOf(["2026-11-10", "2026-11-11", "2026-11-12"]) });
  settle(back.P);
  back.store.days.days["2026-11-18"] = row(["s4-lip-trills"]);
  back.P.evaluate();
  assert.deepEqual(plain(back.P.unseen().logros), ["back"]);
  assert.equal(back.P.doneHtml({ skip: ["back"] }), "", "nothing else new: no lines at all");
  assert.deepEqual(plain(back.P.unseen().logros), [], "and it counts as said, not left waiting");
  assert.ok(plain(back.P.earned()).includes("back"), "still earned");
});

test("a first day in an area is not news; the fifth is", () => {
  const { P, store } = page({ days: daysOf(every("2026-11-11", 1, 7)) });
  settle(P);
  store.days.days["2026-11-18"] = row(["s4-lip-trills", "s21-chest-resonance"]); // first day of low, middle and high
  P.evaluate();
  assert.deepEqual(plain(P.unseen().stages), [], "one day of an area is filed without a word");
  assert.ok(plain(P.areas("singing")).find((a) => a.id === "range").stage === 1, "but the card shows it");
});

/* —— The singer's switch and the experiment —— */

test("hidden, the layer files quietly, so showing it again does not flood", () => {
  const { P, store } = page({ days: daysOf(["2026-11-10", "2026-11-11", "2026-11-12"]) });
  settle(P);
  P.setHidden(true);
  assert.equal(P.hidden(), true);
  store.days.days["2026-11-18"] = row(["s4-lip-trills"]);
  assert.deepEqual(plain(P.evaluate().fresh), []);
  assert.equal(P.doneHtml(), "", "nothing on the completion card while hidden");
  P.setHidden(false);
  assert.ok(plain(P.earned()).includes("back"));
  assert.equal(P.doneHtml(), "", "and nothing saved up for when it shows again");
});

test("the hide switch follows the latest choice across two devices", () => {
  const { win } = page();
  const L = win.VTLoop;
  const shownLater = plain(L.merge({ seed: "a", pathOff: true, pathOffAt: "2026-11-01T00:00:00Z" }, { seed: "b", pathOff: false, pathOffAt: "2026-11-05T00:00:00Z" }));
  assert.equal(shownLater.pathOff, false);
  const hiddenLater = plain(L.merge({ seed: "a", pathOff: true, pathOffAt: "2026-11-09T00:00:00Z" }, { seed: "b", pathOff: false, pathOffAt: "2026-11-05T00:00:00Z" }));
  assert.equal(hiddenLater.pathOff, true);
  const nobody = plain(L.merge({ seed: "a" }, { seed: "b" }));
  assert.equal(nobody.pathOff, false, "no choice on either side: shown");
});

test("the experiment's other arm evaluates and stores nothing", () => {
  const { P, store } = page({ days: daysOf(["2026-11-16", "2026-11-17", "2026-11-18"]), arm: "none" });
  assert.equal(P.served(), false);
  P.evaluate();
  assert.deepEqual(plain(store.flags), {});
  assert.equal(P.doneHtml(), "");
});

/* —— The week to share —— */

test("the week's sentence says days, the singer's range and the total, in either language and track", () => {
  const days = daysOf(["2026-11-02", "2026-11-16", "2026-11-17"]);
  const es = page({ days });
  assert.equal(
    es.P.shareText("singing"),
    "Esta semana practiqué mi voz 2 días (mi meta: 3 a 5). Llevo 3 días de práctica. Entreno con Entrenamiento vocal y de canto: https://example.test/index.html"
  );
  assert.match(es.P.shareText("vocal"), /^Esta semana practiqué mi voz 2 días .* 3 días de práctica\./);
  const en = page({ days: daysOf(["2026-11-18"]), lang: "en" });
  assert.match(en.P.shareText("singing"), /^This week I practised my voice on 1 day \(my goal: 3 to 5\)\. 1 day of practice so far\. I practise/);
  // A week with nothing in it yet: only the total, never "0 days".
  const empty = page({ days: daysOf(["2026-11-02", "2026-11-03"]) });
  assert.equal(
    empty.P.shareText("singing"),
    "Llevo 2 días de práctica. Entreno con Entrenamiento vocal y de canto: https://example.test/index.html"
  );
});

/* —— Red team: what storage and other devices can hand it —— */

test("stored flags of the wrong kind, rows of the wrong shape and keys made of markup are read as nothing", () => {
  // Rows: a day whose exercises are a string, one with an object, a key that is not a date.
  const days = {
    "2026-11-16": { sec: 200, n: 1, ex: "s4-lip-trills" },
    "2026-11-17": { sec: 200, n: 1, ex: { 0: "s18-costal-breath" } },
    "<img src=x onerror=alert(1)>": row(["s4-lip-trills"]),
    "2026-11-18": row(["s9-pitch-match"])
  };
  const { P, store } = page({ days, flags: { "g:st:<b>:5": false, "g:<script>": true, "__proto__": true, "g:week1": "yes" } });
  P.evaluate();
  // Only today's well-formed row has exercises an area can count.
  const warm = plain(P.areas("singing")).find((a) => a.id === "warm");
  assert.equal(warm.days, 0, "a day whose exercises are not a list counts in no area");
  assert.equal(plain(P.areas("singing")).find((a) => a.id === "pitch").days, 1);
  // A key that is not a logro or a well-formed stage is never shown.
  assert.ok(!plain(P.earned()).some((id) => /[<>]/.test(id)));
  assert.ok(!plain(P.unseen().stages).some(([a]) => /[<>]/.test(a)));
  // Three days in the ledger still make three practice days for the week, whatever their rows held.
  assert.ok(plain(P.earned()).includes("week1"));
  // Stored flags that are an array or a string do not throw, and evaluating writes a clean object.
  for (const bad of [[1, 2], "g:init", 42, null]) {
    const x = page({ days: { "2026-11-18": row(["s4-lip-trills"]) } });
    x.store.flags = bad;
    x.win.VTStorage.getAchievementFlags = () => x.store.flags;
    assert.doesNotThrow(() => x.P.evaluate(), `flags stored as ${JSON.stringify(bad)}`);
    assert.equal(typeof x.store.flags, "object");
    assert.ok(!Array.isArray(x.store.flags) && x.store.flags["g:init"] === true, `rewritten from ${JSON.stringify(bad)}`);
  }
  assert.equal(store.flags["g:init"], true);
});

test("five years of daily practice evaluate quickly enough to run on every home draw", () => {
  const keys = every("2021-11-18", 1, 5 * 365);
  const { P } = page({ days: daysOf(keys, ["s4-lip-trills", "s9-pitch-match", "s18-costal-breath", "s3-song-stanzas"], { basics: 1, saved: true }) });
  P.evaluate();
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 5; i += 1) P.evaluate();
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 5;
  assert.ok(ms < 60, `one evaluation of ${keys.length} days took ${ms.toFixed(1)} ms`);
  assert.equal(plain(P.areas("singing")).find((a) => a.id === "warm").stage, 5, "and the arithmetic holds at that size");
});

/* —— Copy —— */

test("the copy promises nothing, names no score, and reads in both languages", () => {
  const { P } = page();
  const PROMISES = /\b(?:previene|prevenir|garantiza|diagn[oó]s|cura|curar|guarantee|diagnos|prevents?|cures?)\b/i;
  const GUILT = /perdiste|perdist|lost your|you missed|no fallaste|racha rota|broken streak/i;
  for (const lang of ["es", "en"]) {
    const C = P.COPY[lang];
    for (const id of P.LOGROS) {
      assert.ok(C.logro[id], `${lang}: logro ${id} has words`);
      const text = C.logro[id].join(" ");
      assert.doesNotMatch(text, PROMISES, `${lang} ${id} promises`);
      assert.doesNotMatch(text, GUILT, `${lang} ${id} reads as guilt`);
      assert.ok(C.logro[id][0].length <= 34, `${lang} ${id} title fits a phone line: ${C.logro[id][0]}`);
    }
    for (const a of P.AREAS) assert.ok(C.area[a.id], `${lang}: area ${a.id} has a name`);
  }
  for (const id of P.LOGROS) assert.notEqual(P.COPY.es.logro[id][1], P.COPY.en.logro[id][1], `${id} is translated`);
});

// Regression: actual sync normalizes achievements to true-only before union.
test("pending stages survive real sync and a seen flag from either device wins", () => {
  const { P, store, win } = page({ flags: { "g:init": true, "g:st:breath:5": false } });
  assert.deepEqual(plain(P.unseen().stages), [["breath", 5]], "legacy pending stage migrates");
  assert.equal(store.flags["g:stage:breath:5"], true, "migration persists before an upload");
  runInNewContext(read("js/sync.js"), win);
  const merge = (a, b) => plain(win.VTSync.mergeBag({ v: 1, profileId: "default", achievements: a }, { v: 1, profileId: "default", achievements: b }).achievements);
  store.flags = merge(store.flags, {});
  P.evaluate();
  assert.deepEqual(plain(P.unseen().stages), [["breath", 5]], "sync must not silently consume pending news");
  const stale = { ...store.flags };
  P.markSeen({ stages: [["breath", 5]] });
  const seen = { ...store.flags };
  store.flags = merge(stale, seen);
  assert.deepEqual(plain(P.unseen().stages), [], "remote seen wins over stale pending");
  store.flags = merge(seen, stale);
  assert.deepEqual(plain(P.unseen().stages), [], "merge order cannot resurrect news");
});

test("a speaking-only day cannot be shared as a day sung", () => {
  const { P } = page({ days: { "2026-11-18": row(["v1-diction"]) }, lang: "en" });
  assert.match(P.shareText("singing"), /practised my voice on 1 day/);
  assert.doesNotMatch(P.shareText("singing"), /sang|sung/);
});

test("valid-looking unknown stages cannot fabricate milestones", () => {
  const { P } = page({ flags: { "g:stage:bogus:5": true, "g:stage:breath:999": true, "g:stage:breath:5": true } });
  assert.deepEqual(plain(P.unseen().stages), [["breath", 5]]);
});
