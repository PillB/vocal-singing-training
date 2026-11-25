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
 * Events dispatched in the page reach its listeners, as in a browser, so the ledger's "vt:practice-recorded"
 * reaches the module that listens for it. `els` stands in for the few elements a test draws into.
 * `session` is the tab's sessionStorage: pass the same one to two pages for a reload of one tab.
 * `sync` loads the real js/sync.js over a localStorage holding these keys (the owner on file, a handover on
 * record), or over this Map, shared with other pages of the same browser; without it, VTSync is a stub whose
 * answer is `store.otherOwner`. `token` and `account` are the sign-in the page loads with (the account's id is
 * known once the server has answered). `heard("account")` and `heard("sync")` tell that module's listeners that
 * something changed, as the page's modules are told. `io` installs an IntersectionObserver that sees the card
 * on screen when it starts watching; `io.leave()` scrolls it away.
 * @param {{ days?: object, rest?: object, loop?: object, flags?: object, lang?: string, arm?: string|null, now?: number, els?: object, session?: object, sync?: object|Map, token?: string, account?: string, io?: boolean }} o
 */
function page(o = {}) {
  process.env.TZ = "America/Lima";
  const store = {
    days: { v: 1, days: o.days || {}, rest: o.rest || { bank: 1, earnedAt: 0, used: [] }, backfilled: true },
    loop: o.loop || null,
    flags: o.flags ? { ...o.flags } : {},
    token: o.token || null,
    account: o.account || null,
    bagReads: 0
  };
  const events = [];
  const win = { console, Math, JSON };
  win.window = win;
  win.Date = fixedDate(o.now || NOW);
  win.document = { querySelector: (sel) => (o.els && o.els[sel]) || null };
  if (o.session) win.sessionStorage = o.session;
  const listeners = {};
  win.addEventListener = (type, fn) => (listeners[type] = listeners[type] || []).push(fn);
  win.dispatchEvent = (e) => (listeners[e.type] || []).forEach((fn) => fn(e));
  win.CustomEvent = class {
    constructor(type, init = {}) {
      this.type = type;
      this.detail = init.detail;
    }
  };
  win.location = { origin: "https://example.test", pathname: "/index.html" };
  win.crypto = { getRandomValues: (b) => b.fill(7) };
  win.VTStorage = {
    getDays: () => JSON.parse(JSON.stringify(store.days)),
    setDays: (b) => (store.days = JSON.parse(JSON.stringify(b))),
    getLoop: () => (store.loop ? JSON.parse(JSON.stringify(store.loop)) : null),
    setLoop: (b) => (store.loop = JSON.parse(JSON.stringify(b))),
    getAchievementFlags: () => ({ ...store.flags }),
    getActiveProfile: () => ({ id: store.profile || "default" }),
    setAchievementFlags: (f) => (store.flags = { ...f }),
    getProgress: () => ({}),
    getHoldLogs: () => []
  };
  win.VTI18n = { lang: o.lang || "es", t: (k) => k };
  // A sign-in's token is known from the page's first moment; its account id only once the server answers.
  const listening = { account: [], sync: [] };
  win.VTAccount = {
    getSessionToken: () => store.token || null,
    getState: () => ({ signedIn: !!store.token, account: store.account ? { id: store.account } : null }),
    onChange: (fn) => listening.account.push(fn)
  };
  const io = { watching: [], leave: () => io.watching.forEach((w) => w.cb([{ isIntersecting: false }])) };
  if (o.io) {
    win.IntersectionObserver = class {
      constructor(cb) {
        this.cb = cb;
      }
      observe() {
        io.watching.push(this);
        this.cb([{ isIntersecting: true }]);
      }
      disconnect() {
        io.watching = io.watching.filter((w) => w !== this);
      }
    };
  }
  if (o.sync) {
    const ls = o.sync instanceof Map ? o.sync : new Map(Object.entries(o.sync));
    win.localStorage = { getItem: (k) => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: (k) => ls.delete(k) };
    Object.assign(win.VTStorage, {
      getActiveProfileId: () => store.profile || "default",
      getProfiles: () => ({ list: [{ id: store.profile || "default" }] }),
      readSyncBag: () => {
        store.bagReads += 1;
        return { v: 1, progress: {}, days: JSON.parse(JSON.stringify(store.days)), achievements: { ...store.flags } };
      }
    });
    // Sync's timers never fire here: no request leaves the page.
    win.setTimeout = () => 0;
    win.clearTimeout = () => {};
    runInNewContext(read("js/sync.js"), win);
  } else {
    win.VTSync = { getStatus: () => ({ otherOwner: !!store.otherOwner }), onChange: (fn) => listening.sync.push(fn) };
  }
  win.VTAnalytics = { track: (name, props) => events.push([name, props]) };
  win.VTExperiments = { variant: () => (o.arm === undefined ? null : o.arm), exposeOnce: () => {} };
  runInNewContext(read("js/practice-days.js"), win);
  runInNewContext(read("js/daily-loop.js"), win);
  runInNewContext(read("js/voice-path.js"), win);
  // Each module tells its own listeners what it tells on the page: the account its state, sync its status.
  const heard = (from) => listening[from].forEach((fn) => fn(from === "sync" ? win.VTSync.getStatus() : win.VTAccount.getState()));
  return { win, P: win.VTPath, store, events, heard, io };
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

/** A tab's sessionStorage. */
function tabSession() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
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

test("warming up before the song is judged when the song's take is recorded, through the ledger", () => {
  // The real ledger records the takes and announces each one; the module hears it.
  const before = page();
  before.win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
  before.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  before.P.evaluate();
  assert.ok(plain(before.P.earned()).includes("warmfirst"), "trills, then the song: warmed up first");
  const after = page();
  after.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  after.win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
  after.P.evaluate();
  assert.ok(!plain(after.P.earned()).includes("warmfirst"), "the song, then trills: the trills warmed up nothing");
  const breath = page();
  breath.win.VTDays.record({ exerciseId: "s18-costal-breath", sec: 120 });
  breath.win.VTDays.record({ exerciseId: "s5-sirens", sec: 60 });
  breath.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  breath.P.evaluate();
  assert.ok(plain(breath.P.earned()).includes("warmfirst"), "breath work counts as warming up, with other work between");
});

test("a row's order is not a timeline: backfilled or synced rows never earn the warm-up logro", () => {
  // Backfill lists a day's exercises in the order the history was stored, and a sync puts one device's list
  // before the other's: trills listed first prove nothing about when they were sung.
  const listed = page({ days: { "2026-11-17": row(["s4-lip-trills", "s3-song-stanzas"]), "2026-11-18": row(["s6-straw", "s3-song-stanzas"]) } });
  listed.P.evaluate();
  assert.ok(!plain(listed.P.earned()).includes("warmfirst"), "no take was heard, so there is no evidence");
  // A warm-up that reached today's row from another device or tab: when it was sung is unknown.
  const synced = page({ days: { "2026-11-18": row(["s4-lip-trills"]) } });
  synced.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  synced.P.evaluate();
  assert.ok(!plain(synced.P.earned()).includes("warmfirst"), "a warm-up this tab did not record is no evidence");
});

test("a song stopped here, trills recorded in another tab, then the song rated: the trills came after", () => {
  // Tab 1 stops the song after 30 s: under the credit threshold, so nothing is recorded until it is rated.
  // Tab 2 (same storage, its own events) records trills. Tab 1 then rates the song: a new take today, with
  // trills in the row, sung after it.
  const tab1 = page();
  const tab2Store = tab1.store; // one browser: the same localStorage
  tab2Store.days.days["2026-11-18"] = row(["s4-lip-trills"]); // what tab 2's record wrote
  tab1.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 30, saved: true, bump: true, source: "save" });
  tab1.P.evaluate();
  assert.ok(!plain(tab1.P.earned()).includes("warmfirst"));
  assert.equal(tab1.store.flags["g:ev:warmfirst"], undefined);
});

test("a reload keeps the tab's order of takes; a new tab starts without it", () => {
  const session = tabSession();
  const first = page({ session });
  first.win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
  const reloaded = page({ session, days: first.store.days.days });
  reloaded.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  reloaded.P.evaluate();
  assert.ok(plain(reloaded.P.earned()).includes("warmfirst"), "the same tab after a reload remembers the trills");
  const other = page({ session: tabSession(), days: first.store.days.days });
  other.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  other.P.evaluate();
  assert.ok(!plain(other.P.earned()).includes("warmfirst"), "control: a new tab does not know when the trills were sung");
  const tomorrow = page({ session, days: first.store.days.days, now: Date.parse("2026-11-19T15:00:00Z") });
  tomorrow.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  tomorrow.P.evaluate();
  assert.ok(!plain(tomorrow.P.earned()).includes("warmfirst"), "yesterday's trills warm up nothing today");
});

test("a tab's takes belong to whoever practised them: another profile or account in the same tab starts without them", () => {
  // The ledger and the flags are per profile; the tab's list of takes must be too, or Ana's trills warm up Luis.
  const profile = page();
  profile.win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
  profile.store.profile = "luis";
  profile.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  assert.equal(profile.store.flags["g:ev:warmfirst"], undefined, "Luis did not warm up");
  // After a reload of the tab, the inherited list is checked the same way.
  const session = tabSession();
  const ana = page({ session });
  ana.win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
  const reloaded = page({ session });
  reloaded.store.profile = "luis";
  reloaded.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  assert.equal(reloaded.store.flags["g:ev:warmfirst"], undefined, "nor after a reload");
  // Another account signing in on the same tab and profile.
  const account = page();
  Object.assign(account.store, { token: "tok-1", account: "acc-1" });
  account.win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
  Object.assign(account.store, { token: "tok-2", account: "acc-2" });
  account.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  assert.equal(account.store.flags["g:ev:warmfirst"], undefined, "the next account did not warm up");
  // Control: the same two takes by one person are evidence.
  const one = page();
  Object.assign(one.store, { token: "tok-1", account: "acc-1" });
  one.win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
  one.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  assert.equal(one.store.flags["g:ev:warmfirst"], true);
});

test("one sign-in stays one practiser while the account's id is still on its way", () => {
  // Signed in from the first moment (the token), but the server's answer with the id comes later, or not at
  // all on a page that loaded offline.
  const late = page();
  late.store.token = "tok-1";
  late.win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
  late.store.account = "acc-1";
  late.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  assert.equal(late.store.flags["g:ev:warmfirst"], true, "the id arriving between the takes changes nothing");
  const session = tabSession();
  const online = page({ session });
  Object.assign(online.store, { token: "tok-1", account: "acc-1" });
  online.win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
  const offline = page({ session });
  offline.store.token = "tok-1";
  offline.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  assert.equal(offline.store.flags["g:ev:warmfirst"], true, "nor a reload whose server answer has not come");
  assert.doesNotMatch(JSON.stringify(session.getItem("vt_path_takes_v1")), /tok-1/, "the token itself is never copied");
});

test("the tab keeps every practiser's takes: one take by another profile does not wipe the first one's", () => {
  const session = tabSession();
  const first = page({ session });
  first.win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 }); // Ana
  first.store.profile = "luis";
  first.win.VTDays.record({ exerciseId: "s9-pitch-match", sec: 120 }); // Luis, one take
  const ana = page({ session }); // the tab reloads, back on Ana
  ana.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  assert.equal(ana.store.flags["g:ev:warmfirst"], true, "Ana's own trills, before her own song");
  const luis = page({ session });
  luis.store.profile = "luis";
  luis.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  assert.equal(luis.store.flags["g:ev:warmfirst"], undefined, "control: still not Luis's");
});

test("while a handover question waits, nothing is written: it would be credited to the earlier owner", () => {
  // Another account's practice is on this browser and the one signed in has not said whose it is. Sync keeps
  // the flags with the practice from before the handover.
  const waiting = page({ days: daysOf(["2026-11-10", "2026-11-11", "2026-11-12"]) });
  waiting.store.otherOwner = true;
  waiting.win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
  waiting.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  assert.equal(waiting.P.noteSet("s-cooldown", 3, 3), false);
  assert.deepEqual(plain(waiting.P.evaluate().fresh), []);
  assert.deepEqual(plain(waiting.store.flags), {}, "no evidence, no set, no logro, no first run");
  const answered = page({ days: daysOf(["2026-11-10", "2026-11-11", "2026-11-12"]) });
  answered.win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
  answered.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  assert.equal(answered.P.noteSet("s-cooldown", 3, 3), true);
  answered.P.evaluate();
  assert.ok(answered.store.flags["g:ev:warmfirst"] && answered.store.flags["g:set:s-cooldown"] && answered.store.flags["g:init"], "control");
});

/**
 * Sync's records of whose this browser's practice is: Ana's, and Ana's handover to Bea when Bea signed in, as a
 * build from before the record named the sign-in wrote it (beaSignsIn() has sync write one itself).
 */
const SINCE = "2026-11-18T14:00:00Z";
const owned = (owner, handover) => ({
  vt_sync_owner_v1: owner,
  ...(handover ? { vt_sync_handover_v1: JSON.stringify({ owner: "acc-ana", me: "acc-bea", since: SINCE }) } : {})
});
/** Ana's three days, a page reloaded with a sign-in whose account id the server has not answered yet. */
function reloadedBefore(sync, token = "tok-bea") {
  return page({ days: anaDays(), sync, token });
}
const anaDays = () => daysOf(["2026-11-10", "2026-11-11", "2026-11-12"]);

/**
 * Bea signs in on Ana's browser: sync's own listener hears the sign-in and notes the handover, as on the page.
 * Returns the page and the browser's localStorage, to load other pages of the same browser over it.
 */
function beaSignsIn() {
  const ls = new Map([["vt_sync_owner_v1", "acc-ana"]]);
  const pg = page({ days: anaDays(), sync: ls });
  Object.assign(pg.store, { token: "tok-bea", account: "acc-bea" });
  pg.heard("account");
  return { ...pg, ls };
}
/** A finished set and a warm-up before the song: what a page writes when nothing holds it back. */
function practises(pg) {
  pg.win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
  pg.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  return pg.P.noteSet("s-cooldown", 3, 3);
}

test("after a reload, the handover still waits until the account says who it is: nothing is written for Ana", () => {
  // Bea signed in on Ana's browser and has not answered whose the practice is. She reloads (or opens the app
  // offline): the token is back at once, the account's id only once the server answers, if it does.
  const bea = reloadedBefore(owned("acc-ana", true));
  assert.equal(bea.win.VTSync.getStatus().otherOwner, false, "control: sync cannot say \"other\" without the id");
  bea.win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
  bea.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  assert.equal(bea.P.noteSet("s-cooldown", 3, 3), false);
  assert.deepEqual(plain(bea.P.evaluate().fresh), []);
  assert.deepEqual(plain(bea.store.flags), {}, "nothing filed into the bag sync keeps as Ana's");
  // Control: Ana reloading her own page, no handover on record: her practice is filed as always.
  const ana = reloadedBefore(owned("acc-ana", false), "tok-ana");
  ana.win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
  ana.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  assert.equal(ana.P.noteSet("s-cooldown", 3, 3), true);
  ana.P.evaluate();
  assert.ok(ana.store.flags["g:ev:warmfirst"] && ana.store.flags["g:init"], "Ana's own page is not held back");
  // Control: Bea answered (she is the owner on file now; the record of the handover stays, for the split).
  const answered = reloadedBefore({ ...owned("acc-bea", true) });
  answered.win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
  answered.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  answered.P.evaluate();
  assert.ok(answered.store.flags["g:ev:warmfirst"] && answered.store.flags["g:init"], "an answered handover waits for nothing");
});

test("a handover is waited on for the sign-in it was noted for: across a reload, not for the owner's own sign-in", () => {
  const bea = beaSignsIn();
  const status = bea.win.VTSync.getStatus();
  assert.ok(status.otherOwner && status.handoverWaiting, "precondition: the question waits for Bea");
  assert.ok(bea.ls.get("vt_sync_handover_v1"), "and sync noted the handover");
  const reloaded = page({ days: anaDays(), sync: bea.ls, token: "tok-bea" });
  assert.equal(reloaded.win.VTSync.getStatus().otherOwner, false, "control: the id is not back yet");
  assert.equal(reloaded.win.VTSync.getStatus().handoverWaiting, true, "Bea's reload still waits");
  assert.equal(practises(reloaded), false);
  assert.deepEqual(plain(reloaded.store.flags), {});
  // Ana signs in again on admin.html, which has no sync to hear it, then opens the app before the server answers.
  const ana = page({ days: anaDays(), sync: bea.ls, token: "tok-ana" });
  assert.equal(ana.win.VTSync.getStatus().handoverWaiting, false, "the record is Bea's sign-in's, not Ana's");
  assert.equal(practises(ana), true, "Ana's own page is not held back");
  ana.P.evaluate();
  assert.ok(ana.store.flags["g:ev:warmfirst"] && ana.store.flags["g:init"]);
});

test("once the account is known, only another account's practice here waits; signed out, nothing does", () => {
  const own = page({ days: anaDays(), sync: owned("acc-ana", false), token: "tok-ana", account: "acc-ana" });
  assert.deepEqual([own.win.VTSync.getStatus().otherOwner, own.win.VTSync.getStatus().handoverWaiting], [false, false], "Ana on her own browser");
  assert.equal(practises(own), true);
  // Bea, known, with Ana's practice here and no record (a sign-in from before records were kept).
  const other = page({ days: anaDays(), sync: owned("acc-ana", false), token: "tok-bea", account: "acc-bea" });
  assert.deepEqual([other.win.VTSync.getStatus().otherOwner, other.win.VTSync.getStatus().handoverWaiting], [true, true], "Bea is asked");
  assert.equal(practises(other), false);
  // Bea's session ended where sync could not hear it (a 401 answered before sync listened): the record stays,
  // nobody is signed in, and whoever practises here signed out is not held back. Either kind of record.
  for (const sync of [beaSignsIn().ls, owned("acc-ana", true)]) {
    const out = page({ days: anaDays(), sync });
    assert.equal(out.win.VTSync.getStatus().handoverWaiting, false);
    assert.equal(practises(out), true);
  }
});

test("sync looks at whose the practice is once per status: each look reads the profile's whole record", () => {
  const other = page({ days: anaDays(), sync: owned("acc-ana", false), token: "tok-bea", account: "acc-bea" });
  other.store.bagReads = 0;
  other.win.VTSync.getStatus();
  assert.equal(other.store.bagReads, 1, "one read of the record for both answers");
});

test("while a handover question waits, Ana's unseen logros are not told to Bea as new, nor marked seen", () => {
  // Ana rated a take; the completion card was full, so "Valoraste tu práctica" waits in Historial, unseen.
  const flags = { "g:init": true, "g:back": true, "g:seen:back": true, "g:rated": true };
  const days = { ...daysOf(["2026-11-10", "2026-11-11", "2026-11-12"]), "2026-11-18": row(["s4-lip-trills"]) };
  const btn = { hidden: false, dataset: {}, textContent: "", classList: { on: false, toggle(c, v) { this.on = !!v; } } };
  const bea = page({ days, flags, els: { "#path-home-btn": btn } });
  bea.store.otherOwner = true;
  assert.equal(bea.P.doneHtml(), "", "Bea's completion card announces nothing of Ana's");
  bea.P.renderHomeButton();
  assert.equal(btn.classList.on, false, "no dot on the home button");
  assert.equal(btn.textContent, "Tu camino · 2\u00a0logros", "the plain count, not \"1 nuevo\"");
  bea.P.markSeen({ logros: ["rated"] });
  assert.deepEqual(plain(bea.store.flags), flags, "Ana's news is still Ana's to see");
  // Control: the same flags with nobody waiting are news, said once and then seen.
  const ana = page({ days, flags, els: { "#path-home-btn": btn } });
  ana.P.renderHomeButton();
  assert.equal(btn.classList.on, true, "control: the dot");
  assert.match(ana.P.doneHtml(), /data-logro="rated"/);
  assert.equal(ana.store.flags["g:seen:rated"], true);
});

test("while a handover question waits, Historial's card shows nothing as new and marks nothing seen", () => {
  const flags = { "g:init": true, "g:back": true, "g:seen:back": true, "g:rated": true };
  const days = { ...daysOf(["2026-11-10", "2026-11-11", "2026-11-12"]), "2026-11-18": row(["s4-lip-trills"]) };
  const el = () => ({ hidden: false, textContent: "", innerHTML: "", dataset: {}, setAttribute() {}, classList: { toggle() {} } });
  const drawn = () => {
    const card = { ...el(), getClientRects: () => [1], querySelector: () => null, querySelectorAll: () => [] };
    return { "#path-card": card, "#path-title": el(), "#path-sub": el(), "#path-toggle": el(), "#path-body": el() };
  };
  const bea = page({ days, flags, els: drawn() });
  bea.store.otherOwner = true;
  bea.P.renderCard();
  const body = bea.win.document.querySelector("#path-body").innerHTML;
  assert.match(body, /data-logro="rated"|Valoraste/, "control: the card is drawn, with Ana's logros earned");
  assert.doesNotMatch(body, /is-new/, "none of them labelled new");
  assert.deepEqual(plain(bea.store.flags), flags);
  const ana = page({ days, flags, els: drawn() });
  ana.P.renderCard();
  assert.match(ana.win.document.querySelector("#path-body").innerHTML, /is-new/, "control: new for Ana");
  assert.equal(ana.store.flags["g:seen:rated"], true);
});

/** The logros a card labels new. */
const labelledNew = (html) => [...html.matchAll(/is-new" data-logro="([a-z0-9]+)"/g)].map((m) => m[1]);

/** Bea's news held back on the home button while the handover waits: a placement take rated and kept. */
function heldBackHome() {
  const btn = { hidden: false, dataset: {}, textContent: "", classList: { on: false, toggle(c, v) { this.on = !!v; } } };
  const pg = page({ days: daysOf(every("2026-11-11", 1, 7)), els: { "#path-home-btn": btn } });
  settle(pg.P);
  const before = plain(pg.store.flags);
  pg.store.otherOwner = true;
  pg.win.VTDays.record({ exerciseId: "s26-placement-compare", sec: 120, saved: true });
  pg.P.renderHomeButton();
  assert.equal(btn.classList.on, false, "nothing is news while it waits");
  assert.deepEqual(plain(pg.store.flags), before, "nor filed");
  return { ...pg, btn };
}

test("once the handover is answered, or the account turns out to own the practice, what waited is drawn at once", () => {
  const answer = heldBackHome();
  answer.heard("account");
  assert.equal(answer.btn.classList.on, false, "control: still waiting, still nothing");
  answer.store.otherOwner = false; // Bea answered: sync says so
  answer.heard("sync");
  assert.equal(answer.btn.classList.on, true, "the home button tells Bea her news without a reload");
  assert.ok(answer.store.flags["g:listen"] && !answer.store.flags["g:seen:listen"], "and it is filed, as news");
  // After a reload: the account's id arrives, and the practice was this account's after all.
  const id = heldBackHome();
  id.store.otherOwner = false;
  id.heard("account");
  assert.equal(id.btn.classList.on, true, "the account's answer is enough");
});

test("once the handover is answered, Historial's card on screen is drawn again with the news; one off screen waits", () => {
  const el = () => ({ hidden: false, textContent: "", innerHTML: "", dataset: {}, setAttribute() {}, classList: { toggle() {} } });
  const held = (onScreen) => {
    const card = { ...el(), getClientRects: () => (onScreen ? [1] : []), querySelector: () => null, querySelectorAll: () => [] };
    const els = { "#path-card": card, "#path-title": el(), "#path-sub": el(), "#path-toggle": el(), "#path-body": el() };
    const pg = page({ days: daysOf(every("2026-11-11", 1, 7)), els });
    settle(pg.P);
    pg.store.otherOwner = true;
    pg.win.VTDays.record({ exerciseId: "s26-placement-compare", sec: 120, saved: true });
    pg.P.renderCard();
    assert.doesNotMatch(els["#path-body"].innerHTML, /is-new/, "nothing new while it waits");
    // Sync tells its listeners on every write; a redraw would close the logro the reader opened.
    els["#path-body"].innerHTML = "opened";
    pg.heard("sync");
    pg.heard("account");
    assert.equal(els["#path-body"].innerHTML, "opened", "nothing is drawn again while it still waits");
    pg.store.otherOwner = false;
    pg.heard("sync");
    return { ...pg, els, body: els["#path-body"].innerHTML };
  };
  const shown = held(true);
  assert.match(shown.body, /is-new/, "the card on screen shows Bea's news at once");
  shown.els["#path-body"].innerHTML = "opened";
  shown.heard("sync");
  shown.heard("account");
  assert.equal(shown.els["#path-body"].innerHTML, "opened", "and once drawn, not again on every write");
  const away = held(false);
  assert.doesNotMatch(away.body, /is-new/, "a card off screen is not drawn behind the reader's back");
  assert.equal(away.store.flags["g:seen:listen"], undefined, "so its news is still unseen when Historial opens");
});

test("when a wait begins under the page, the home button stops telling Ana's news at once", () => {
  // Ana's unseen logro is on the home button; Bea signs in on the same page and the question waits.
  const flags = { "g:init": true, "g:back": true, "g:seen:back": true, "g:rated": true };
  const days = { ...anaDays(), "2026-11-18": row(["s4-lip-trills"]) };
  const btn = { hidden: false, dataset: {}, textContent: "", classList: { on: false, toggle(c, v) { this.on = !!v; } } };
  const pg = page({ days, flags, els: { "#path-home-btn": btn } });
  pg.P.renderHomeButton();
  assert.equal(btn.classList.on, true, "control: Ana's news, before anybody signs in");
  const before = plain(pg.store.flags);
  pg.store.otherOwner = true;
  pg.heard("account");
  assert.equal(btn.classList.on, false, "Bea is not told Ana's news");
  assert.match(btn.textContent, /logros$/, "the plain count");
  assert.deepEqual(plain(pg.store.flags), before, "nothing written");
});

test("a card's 'Nuevo' labels stay with whoever saw them: not carried to the next sign-in, before or after the answer", () => {
  const el = () => ({ hidden: false, textContent: "", innerHTML: "", dataset: {}, setAttribute() {}, classList: { toggle() {} } });
  const card = { ...el(), getClientRects: () => [1], querySelector: () => null, querySelectorAll: () => [] };
  const els = { "#path-card": card, "#path-title": el(), "#path-sub": el(), "#path-toggle": el(), "#path-body": el() };
  const flags = { "g:init": true, "g:back": true, "g:seen:back": true, "g:rated": true };
  const pg = page({ days: { ...anaDays(), "2026-11-18": row(["s4-lip-trills"]) }, flags, els, io: true });
  const body = () => els["#path-body"].innerHTML;
  pg.P.renderCard(); // Ana, signed out: the card comes on screen and her news counts as seen
  assert.equal(pg.store.flags["g:seen:rated"], true);
  pg.P.renderCard(); // Historial draws it again on the way in
  assert.ok(labelledNew(body()).includes("rated"), "control: the label stays under Ana's eyes");
  // Bea signs in over the open card (the account panel is an overlay) and the question waits.
  Object.assign(pg.store, { token: "tok-bea", otherOwner: true });
  pg.P.renderCard();
  assert.deepEqual(labelledNew(body()), [], "Bea is not told Ana's logro as new");
  // She answers; her own account's logros come down, long seen.
  pg.store.otherOwner = false;
  pg.store.flags = { "g:init": true, "g:rated": true, "g:seen:rated": true };
  pg.P.renderCard();
  assert.ok(!labelledNew(body()).includes("rated"), `nor her own, seen weeks ago: ${labelledNew(body())}`);
});

test("while a handover waits, a card drawn on screen keeps nothing to label new once the wait ends", () => {
  // Ana's unseen logro on Bea's screen: nothing is marked seen, and nothing lingers for Bea afterwards.
  const el = () => ({ hidden: false, textContent: "", innerHTML: "", dataset: {}, setAttribute() {}, classList: { toggle() {} } });
  const card = { ...el(), getClientRects: () => [1], querySelector: () => null, querySelectorAll: () => [] };
  const els = { "#path-card": card, "#path-title": el(), "#path-sub": el(), "#path-toggle": el(), "#path-body": el() };
  const flags = { "g:init": true, "g:back": true, "g:seen:back": true, "g:rated": true };
  const pg = page({ days: { ...anaDays(), "2026-11-18": row(["s4-lip-trills"]) }, flags, els, io: true });
  Object.assign(pg.store, { token: "tok-bea", otherOwner: true });
  pg.P.renderCard();
  pg.P.renderCard();
  assert.deepEqual(labelledNew(els["#path-body"].innerHTML), []);
  assert.deepEqual(plain(pg.store.flags), flags);
  // "Usar solo la de mi cuenta": Bea's own flags, where "rated" was seen long ago.
  pg.store.otherOwner = false;
  pg.store.flags = { "g:init": true, "g:rated": true, "g:seen:rated": true };
  pg.P.renderCard();
  assert.ok(!labelledNew(els["#path-body"].innerHTML).includes("rated"), "Ana's logro does not come back labelled new for Bea");
});

test("while a handover waits, the hide switch is not offered: it is the earlier owner's setting", () => {
  const el = () => ({ hidden: false, textContent: "", innerHTML: "", dataset: {}, setAttribute() {}, classList: { toggle() {} } });
  const drawn = () => {
    const card = { ...el(), getClientRects: () => [1], querySelector: () => null, querySelectorAll: () => [] };
    return { "#path-card": card, "#path-title": el(), "#path-sub": el(), "#path-toggle": el(), "#path-body": el() };
  };
  // Ana hid it; Bea signs in and practises after a gap while the question waits.
  const hid = hiddenComeback({ els: drawn() });
  hid.store.otherOwner = true;
  hid.P.renderCard();
  const body = hid.win.document.querySelector("#path-body").innerHTML;
  assert.match(body, /oculto/, "control: the card says it is hidden");
  assert.doesNotMatch(body, /data-path-show/, "no way to show it that would change Ana's setting");
  assert.match(body, /pregunta de tu cuenta/, "and it says when it can be shown");
  assert.equal(hid.P.setHidden(false), false);
  assert.equal(hid.P.hidden(), true, "the switch did not turn");
  // Once answered, the same card offers it, and showing it again files the hidden weeks quietly.
  hid.store.otherOwner = false;
  hid.P.renderCard();
  assert.match(hid.win.document.querySelector("#path-body").innerHTML, /data-path-show/, "control");
  assert.equal(hid.P.setHidden(false), true);
  assert.deepEqual(plain(hid.P.evaluate().fresh), []);
  // Shown, the "Ocultar" switch waits the same way.
  const shownEls = drawn();
  const shown = page({ days: anaDays(), els: shownEls });
  shown.store.otherOwner = true;
  shown.P.renderCard();
  assert.equal(shownEls["#path-toggle"].hidden, true, "no Ocultar while it waits");
  shown.store.otherOwner = false;
  shown.P.renderCard();
  assert.equal(shownEls["#path-toggle"].hidden, false, "control: offered once answered");
});

test("a comeback the loop's card said during the wait is not said again by Tu camino once it ends", () => {
  const comeback = (said) => {
    const pg = page({ days: anaDays() });
    settle(pg.P);
    pg.store.otherOwner = true;
    pg.win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 }); // after a gap: a comeback
    assert.equal(pg.P.doneHtml(said ? { skip: ["back"] } : {}), "", "nothing of Tu camino on the card while it waits");
    pg.store.otherOwner = false;
    pg.heard("sync");
    pg.P.evaluate();
    return pg;
  };
  const said = comeback(true);
  assert.ok(plain(said.P.earned()).includes("back"), "earned");
  assert.ok(!plain(said.P.unseen().logros).includes("back"), "and counted as said: the card welcomed Bea back");
  const unsaid = comeback(false);
  assert.ok(plain(unsaid.P.unseen().logros).includes("back"), "control: a card that did not say it leaves it as news");
});

test("a page brought back from the back-forward cache does not read takes other pages recorded meanwhile", () => {
  // Page A: the song stopped under the credit threshold, nothing recorded yet. The tab moves on to page B,
  // which records trills. Back to A (restored from the cache, its memory intact), the song is rated.
  const session = tabSession();
  const a = page({ session });
  const b = page({ session });
  b.win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
  a.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 30, saved: true });
  assert.equal(a.store.flags["g:ev:warmfirst"], undefined, "the trills were sung after A's song");
  // Control: a page loaded after B (a reload, or a new page in the tab) inherits them.
  const c = page({ session });
  c.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  assert.equal(c.store.flags["g:ev:warmfirst"], true);
});

test("a long day in one page does not push the warm-up out of the tab's takes", () => {
  // Trills, then eighty records over eight other exercises (half of them only adding seconds), then the song.
  const others = ["s9-pitch-match", "s10-five-note", "s7-humming", "s20-five-vowels", "s21-chest-resonance", "s11-dynamics", "s12-easy-onset", "s2-solfege-chords"];
  const longDay = (warm, reload) => {
    const session = tabSession();
    const pg = page({ session });
    if (warm) pg.win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
    for (let i = 0; i < 80; i += 1) pg.win.VTDays.record({ exerciseId: others[i % 8], sec: 60, ...(i % 2 ? { bump: false } : {}) });
    const song = reload ? page({ session, days: pg.store.days.days }) : pg;
    song.win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
    return song.store.flags["g:ev:warmfirst"];
  };
  assert.equal(longDay(true), true, "the trills were sung first, however long the day");
  assert.equal(longDay(true, true), true, "and after a reload of the tab");
  assert.equal(longDay(false), undefined, "control: without them, eighty takes warm up nothing");
  assert.equal(longDay(false, true), undefined, "control, after a reload");
});

test("only a new take of the song, sung today, after a warm-up this tab recorded, is evidence", () => {
  const { P, store } = page();
  const take = (exerciseId, extra = {}) => P.noteTake({ exerciseId, day: "2026-11-18", isNew: true, ...extra });
  assert.equal(take("s5-sirens"), false);
  assert.equal(take("s3-song-stanzas"), false, "sirens are not a warm-up");
  assert.equal(take("s4-lip-trills"), false, "a warm-up is no evidence on its own");
  // From here on a warm-up is in this tab's takes, so each refusal below is for its own reason.
  assert.equal(take("s9-pitch-match"), false, "only the song is the song");
  assert.equal(take("s3-song-stanzas", { isNew: false }), false, "more seconds on a take already counted are not a new take");
  assert.equal(take("s3-song-stanzas", { day: "2026-11-17" }), false, "a take rated after midnight belongs to a day that is over");
  assert.equal(P.noteTake(null), false, "an event without a take");
  assert.deepEqual(plain(store.flags), {}, "control: nothing stored by the refusals");
  assert.equal(take("s3-song-stanzas"), true);
  assert.equal(take("s3-song-stanzas"), false, "stored once");
});

test("the ledger says when a take only adds seconds to one already counted", () => {
  // The song's take was counted before the trills (a rated save of it comes later, after the trills): the
  // rating adds seconds, not a take, so it is no evidence that the trills came first.
  const { P, win } = page();
  win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 60 });
  win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
  win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 30, bump: false, saved: true });
  P.evaluate();
  assert.ok(!plain(P.earned()).includes("warmfirst"));
  win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 90 });
  P.evaluate();
  assert.ok(plain(P.earned()).includes("warmfirst"), "control: a new take of the song after the trills is");
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

/** Today's takes, recorded through the ledger: trills, the song, a placement take rated and kept. Three logros. */
function threeToday(win) {
  win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
  win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  win.VTDays.record({ exerciseId: "s26-placement-compare", sec: 120, saved: true });
}

test("the completion card shows at most two lines and sends the rest to Historial", () => {
  // Every day from the 11th to yesterday (last week in range already), then today brings three.
  const { P, win } = page({ days: daysOf(every("2026-11-11", 1, 7)) });
  settle(P);
  threeToday(win);
  const r = P.evaluate();
  assert.ok(r.fresh.length === 3, `three logros today: ${plain(r.fresh)}`);
  const html = P.doneHtml();
  assert.equal((html.match(/data-logro=/g) || []).length, 2);
  assert.match(html, /Y 1 más en Historial/);
  assert.deepEqual(plain(P.unseen().logros).length, 1, "the third waits, unseen");
});

test("a card already full gets one line, and a logro the card says in its own words is not repeated", () => {
  const { P, win } = page({ days: daysOf(every("2026-11-11", 1, 7)) });
  settle(P);
  threeToday(win);
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

/** A ledger with a gap, the layer hidden, and today's practice: a comeback earned while hidden. */
function hiddenComeback(o = {}) {
  const pg = page({ days: daysOf(["2026-11-10", "2026-11-11", "2026-11-12"]), ...o });
  settle(pg.P);
  pg.P.setHidden(true);
  pg.store.days.days["2026-11-18"] = row(["s4-lip-trills"]);
  return pg;
}
/** Another device's choice to show it again, arriving by sync: the switch turns without setHidden here. */
const shownElsewhere = (store) => (store.loop = { ...store.loop, pathOff: false, pathOffAt: "2026-11-18T16:00:00Z" });

test("shown again, what the hidden weeks earned is kept and is not news", () => {
  // Nothing evaluates while hidden here: the switch itself files what was earned before it turns.
  const { P } = hiddenComeback();
  P.setHidden(false);
  assert.deepEqual(plain(P.evaluate().fresh), [], "not announced: earned while hidden");
  assert.ok(plain(P.earned()).includes("back"), "but earned");
  assert.deepEqual(plain(P.unseen()), { logros: [], stages: [] });
  // Control: the same day with the layer shown all along is news.
  const shown = page({ days: daysOf(["2026-11-10", "2026-11-11", "2026-11-12"]) });
  settle(shown.P);
  shown.store.days.days["2026-11-18"] = row(["s4-lip-trills"]);
  assert.deepEqual(plain(shown.P.evaluate().fresh), ["back"]);
});

test("hidden, the completion card files quietly, so a device that shows it again brings no old news", () => {
  const { P, store } = hiddenComeback();
  assert.equal(P.doneHtml(), "", "nothing on the card while hidden");
  shownElsewhere(store);
  assert.equal(P.hidden(), false, "control: shown again");
  assert.deepEqual(plain(P.evaluate().fresh), []);
  assert.ok(plain(P.earned()).includes("back"));
});

test("hidden, the home button files quietly too", () => {
  const btn = { hidden: false, dataset: {}, textContent: "", classList: { toggle: () => {} } };
  const { P, store } = hiddenComeback({ els: { "#path-home-btn": btn } });
  P.renderHomeButton();
  assert.equal(btn.hidden, true, "control: the button is hidden while the layer is");
  shownElsewhere(store);
  assert.deepEqual(plain(P.evaluate().fresh), []);
  assert.ok(plain(P.earned()).includes("back"));
});

test("hidden, Historial's card files quietly too", () => {
  const el = () => ({ hidden: false, textContent: "", innerHTML: "", dataset: {}, setAttribute() {}, classList: { toggle() {} } });
  const card = { ...el(), getClientRects: () => [1], querySelector: () => null, querySelectorAll: () => [] };
  const els = { "#path-card": card, "#path-title": el(), "#path-sub": el(), "#path-toggle": el(), "#path-body": el() };
  const { P, store } = hiddenComeback({ els });
  P.renderCard();
  assert.match(els["#path-body"].innerHTML, /oculto/, "control: the card says it is hidden");
  shownElsewhere(store);
  assert.deepEqual(plain(P.evaluate().fresh), []);
  assert.ok(plain(P.earned()).includes("back"));
});

test("hidden, a take with nothing drawn after it is filed at once, so another device showing it brings no news", () => {
  // A second take of the day on the exercise screen: no card, no home, no Historial is drawn after it.
  const { P, win, store } = hiddenComeback();
  win.VTDays.record({ exerciseId: "s26-placement-compare", sec: 120, saved: true });
  shownElsewhere(store);
  assert.deepEqual(plain(P.evaluate().fresh), []);
  assert.ok(plain(P.earned()).includes("listen"), "earned");
  // Control: shown all along, the same take is news.
  const shown = page({ days: daysOf(["2026-11-10", "2026-11-11", "2026-11-12"]) });
  settle(shown.P);
  shown.win.VTDays.record({ exerciseId: "s26-placement-compare", sec: 120, saved: true });
  assert.ok(plain(shown.P.evaluate().fresh).includes("listen"));
});

test("hidden, a goal set finished is filed at once too", () => {
  const { P, store } = hiddenComeback();
  assert.equal(P.noteSet("s-cooldown", 3, 3), true);
  shownElsewhere(store);
  assert.deepEqual(plain(P.evaluate().fresh), []);
  assert.ok(plain(P.earned()).includes("set") && plain(P.earned()).includes("cool"));
});

test("hidden, a stage reached on its exact count is filed quietly as well", () => {
  // Four breath days, hidden, a fifth today: Aire reaches stage 5 while hidden.
  const fourBreath = () => daysOf(every("2026-11-10", 1, 4), ["s18-costal-breath"]);
  const hid = page({ days: fourBreath() });
  settle(hid.P);
  hid.P.setHidden(true);
  hid.store.days.days["2026-11-18"] = row(["s18-costal-breath"]);
  hid.P.setHidden(false);
  assert.deepEqual(plain(hid.P.unseen().stages), []);
  assert.doesNotMatch(hid.P.doneHtml(), /Aire/);
  const shown = page({ days: fourBreath() });
  settle(shown.P);
  shown.store.days.days["2026-11-18"] = row(["s18-costal-breath"]);
  shown.P.evaluate();
  assert.deepEqual(plain(shown.P.unseen().stages), [["breath", 5]], "control: shown, the same day is news");
});

test("hidden, a device in the other arm files quietly too, so the device that shows it again finds it seen", () => {
  // The profile hid the layer on a "path" device. This morning it practised on a "none" device (arms are per
  // device). The "path" device shows it again and pulls the morning's day and flags.
  const run = (hidden) => {
    const none = page({ days: daysOf(["2026-11-10", "2026-11-11", "2026-11-12"]), arm: "none" });
    if (hidden) none.P.setHidden(true);
    // One take today: a comeback, few enough logros at once to be news when shown.
    none.win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
    assert.equal(none.P.doneHtml(), "", "the other arm shows nothing either way");
    const shown = { ...none.store.loop, pathOff: false, pathOffAt: "2026-11-18T16:00:00Z" };
    const path = page({ days: none.store.days.days, flags: { "g:init": true, ...none.store.flags }, loop: shown });
    return plain(path.P.evaluate().fresh);
  };
  assert.deepEqual(run(true), [], "hidden while practised: filed as seen on the device that practised");
  assert.ok(run(false).includes("back"), "control: shown while practised, today's comeback is news on the other device");
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

test("the experiment's other arm earns and shows nothing, but keeps the facts only the moment gives", () => {
  const { P, win, store } = page({ days: daysOf(["2026-11-16", "2026-11-17"]), arm: "none" });
  assert.equal(P.served(), false);
  P.evaluate();
  assert.deepEqual(plain(store.flags), {}, "nothing earned, nothing marked");
  // A finished set and a warm-up before the song: nothing could rebuild them if the layer reaches this arm later.
  assert.equal(P.noteSet("s-cooldown", 3, 3), true);
  win.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
  win.VTDays.record({ exerciseId: "s3-song-stanzas", sec: 180 });
  P.evaluate();
  assert.deepEqual(Object.keys(plain(store.flags)).sort(), ["g:ev:warmfirst", "g:set:s-cooldown"], "facts only: no logro, no seen, no stage, no first run");
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

test("an unchanged milestone evaluation does not rebuild the whole calendar summary", () => {
  const { P, win } = page({ days: daysOf(["2026-11-17"]) });
  P.evaluate();
  const summary = win.VTDays.summary;
  let calls = 0;
  win.VTDays.summary = (...args) => { calls += 1; return summary(...args); };
  P.evaluate();
  assert.equal(calls, 0, "no news needs no second full-ledger summary");
});
