// Red team round 9, dimension "audit-css": goal-based killers for rules of qa/audit/analyze-audit.mjs that no test pins.
// Each test models the right reading of a record (green on the shipped analyzer) and the wrong one (red under the named mutant).
// Every wrong reading is paired with a control in the same test that must still be reported, so a ledger that simply
// reports nothing (or everything) cannot pass.
// Usage: copy to tests/node/ and run  node --test tests/node/analyze-audit-r9.test.mjs
//        (ANALYZER=<path> overrides the module under test, as in analyze-audit-gaps.test.mjs)
import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const target = process.env.ANALYZER ? pathToFileURL(path.resolve(process.env.ANALYZER)).href : new URL("../../qa/audit/analyze-audit.mjs", import.meta.url).href;
const { findings } = await import(target);

const tick = (focus, hud = "", extra = {}) => ({ focus, hud, status: "", pitch: "", cue: "", ...extra });
const ctl = (o) => ({ kind: "control", inView: true, fold: "", hit: "self", small: false, w: 80, h: 40, text: "Start", id: "b", disabled: false, ...o });
const clean = (mode = "pitchMatch") => ({
  id: "x", mode, errors: [],
  focus: [{ id: "b", text: "Start", obscured: false, outline: true }],
  inventory: { overlaps: { controls: [], clipped: [] }, rows: [[ctl()]] },
  iterations: {
    1: { started: true, stopped: true, ticks: [tick("A 1"), tick("A 2")], gum: { live: 0 } },
    2: { started: true, stopped: true, ticks: [tick("A 1"), tick("A 2")], gum: { live: 0 } },
    3: { silent: { scenario: "silent", ticks: [tick("Reps 0"), tick("Reps 0")] }, noise: { scenario: "noise", ticks: [tick("Reps 0"), tick("Reps 0")] } },
    4: { afterDouble: { gum: { live: 1 } }, afterHidden: { live: true }, leavePrompt: true, afterStay: { view: "view-exercise" }, final: { gum: { live: 0 } } },
    5: { inventory: { overlaps: { controls: [], clipped: [] }, rows: [[ctl()]] } },
    6: { reopened: { live: false } }
  }
});
const cats = (rec) => findings(rec).map(([k]) => k);
const silent = (a, b) => { const r = clean(); r.iterations[3].silent.ticks = [a, b]; return r; };
const text = (o) => ({ kind: "text", inView: true, text: "Hola", contrast: 5, font: 16, ...o });
const withRow = (rec, ...items) => { rec.inventory.rows[0].push(...items); return rec; };

test("control: the baseline record is clean", () => assert.deepEqual(findings(clean()), []));

// Goal (the analyzer's own comment, WCAG 1.4.3): text of 24 px and up is large text and needs 3:1; below that, 4.5:1.
test("large text begins AT 24 px: 3,5:1 passes at exactly 24 px and fails at 23,9 px", () => {
  assert.deepEqual(findings(withRow(clean(), text({ contrast: 3.5, font: 24 }))), [], "24 px is large text");
  assert.deepEqual(cats(withRow(clean(), text({ contrast: 3.5, font: 23.9 }))), ["contrast"], "23,9 px is not");
});

// Goal: contrast is judged where the probe could measure it. The probe stores null when a gradient or image is behind the text
// (qa/audit/page-probes.js background(): backgroundImage !== "none" -> null); an unknown value is not a 0:1 finding.
test("text whose contrast the probe could not measure is not a contrast finding", () => {
  assert.deepEqual(findings(withRow(clean(), text({ contrast: null }))), []);
  assert.deepEqual(cats(withRow(clean(), text({ contrast: 2.0 }))), ["contrast"], "control: a measured 2:1 is reported");
});

// Goal: "no control is covered at its centre". The probe answers "offscreen" for a control that is partly in view with its
// centre outside the window: nothing covers it.
test("a control whose centre is off the window is not 'covered'", () => {
  assert.deepEqual(findings(withRow(clean(), ctl({ text: "Half out", hit: "offscreen" }))), []);
  assert.deepEqual(cats(withRow(clean(), ctl({ text: "Under", hit: "#toast.toast" }))), ["layout"], "control: a real coverer is reported");
});

// Goal (the analyzer's comment): a percentage "with or without decimals" is not a count, written with or without a space.
// The space is in the SECOND tick: the shipped test only has it in the first, where a mis-read count cannot rise.
test("a percentage written 'N %' is not a count when it is the line that changes", () => {
  assert.deepEqual(findings(silent(tick("En la zona 87%"), tick("En la zona 97,2 %"))), []);
  assert.deepEqual(findings(silent(tick("En la zona 87%"), tick("En la zona 97 %"))), []);
  assert.deepEqual(cats(silent(tick("En la zona 87% Aciertos 0"), tick("En la zona 97,2 % Aciertos 3"))), ["quiet"], "control");
});

// Goal (the analyzer's comment): "1.200" and "1,200" are one thousand two hundred, one count. A count that passes 999 -> 1000
// on silence has risen; when the separator is not understood the thousand reads as 1 and 000 (0), and the rise is lost.
for (const [name, sep] of [["comma", ","], ["dot", "."], ["no-break space", " "], ["narrow no-break space", " "]]) {
  test(`a count that passes 999 to 1${sep === " " ? "<nbsp>" : sep === " " ? "<nnbsp>" : sep}000 (${name}) has risen`, () => {
    assert.deepEqual(findings(silent(tick("", "Puntos 999"), tick("", `Puntos 1${sep}000`))), [["quiet", "silent: on-screen counts rose (puntos 999→1000) — review"]]);
    assert.deepEqual(findings(silent(tick("", `Puntos 1${sep}000`), tick("", `Puntos 1${sep}000`))), [], "control: the same thousand twice is steady");
  });
}

// Goal: errors that the phone run raised are errors (check list in the header: "no uncaught exception or console error").
test("an uncaught exception during the phone run is a finding; the worker's refusal there is still the environment", () => {
  const bad = clean();
  bad.iterations[5].errors = ["pageerror: TypeError: x is undefined"];
  assert.deepEqual(findings(bad), [["errors", "pageerror: TypeError: x is undefined"]]);
  const noise = clean();
  noise.iterations[5].errors = ["console: Failed to load resource: net::ERR_FAILED <https://vocal-studio-entitlements.vocalstudio-pe.workers.dev/v1/auth/methods>"];
  assert.deepEqual(findings(noise), [], "control: environment noise on the phone run stays quiet");
});

// Goal: the ledger judges what is presented to a learner. A control inside a [hidden] subtree, a closed <details> or an
// aria-hidden branch is not on offer, so a small box there is not a 24 px finding (the browser specs filter the same way:
// tests/target-size.spec.js keeps `!x.fold`). Deliberately NOT asserted: "collapsed" and out-of-view controls, which
// tests/target-size-below-fold.spec.js argues should be measured.
test("a small control that is folded away is not a finding; a presented one is", () => {
  for (const fold of ["aria-hidden", "hidden-attr", "details-closed"]) {
    assert.deepEqual(findings(withRow(clean(), ctl({ text: "Tiny", small: true, w: 14, h: 14, fold }))), [], `folded: ${fold}`);
  }
  assert.deepEqual(cats(withRow(clean(), ctl({ text: "Tiny", small: true, w: 14, h: 14 }))), ["layout"], "control: presented and small");
});

// Goal: "feedback: a take that is being sung shows something that changes". The instruction line (#mode-cue) is on screen and
// changes between phases of a guided drill ("Inhala" -> "Sostén"): that is something that changes.
test("a take whose only moving line is the cue is not 'nothing changed'", () => {
  const rec = clean();
  rec.iterations[1] = { started: true, stopped: true, ticks: [tick("A", "", { cue: "Inhala" }), tick("A", "", { cue: "Sostén" })], gum: { live: 0 } };
  assert.deepEqual(findings(rec), []);
  rec.iterations[1].ticks = [tick("A", "", { cue: "Inhala" }), tick("A", "", { cue: "Inhala" })];
  assert.deepEqual(cats(rec), ["feedback"], "control: when nothing changes it is reported");
});

// Goal: a Tab stop is an element that had focus. When nothing but the page has it, the probe records {id:"body"} and the
// ledger has no ring to ask about (checkFocus: "if (f.id === 'body') continue").
test("focus resting on the page itself is not a Tab stop without a ring", () => {
  const rec = clean();
  rec.focus.push({ id: "body" });
  assert.deepEqual(findings(rec), []);
  rec.focus.push({ id: "btn-x", text: "X", obscured: false, outline: false });
  assert.deepEqual(cats(rec), ["focus"], "control: a real stop without a ring is reported");
});

// Goal: a clock is not a count. Minutes can have two digits ("9:59" -> "10:01"): the one of "10" is not a rising count.
test("a clock that passes ten minutes is not a count", () => {
  assert.deepEqual(findings(silent(tick("", "Tiempo 9:59"), tick("", "Tiempo 10:01"))), []);
  assert.deepEqual(findings(silent(tick("", "Tiempo 12:30"), tick("", "Tiempo 19:59"))), []);
  assert.deepEqual(cats(silent(tick("", "Tiempo 9:59 Reps 0"), tick("", "Tiempo 10:01 Reps 2"))), ["quiet"], "control");
});

// Goal: a pitch deviation in cents is not a count, singular or plural ("1 cent").
test("'1 cent' is a quantity with a unit, like '12 cents'", () => {
  assert.deepEqual(findings(silent(tick("", "1 cent"), tick("", "5 cent"))), []);
  assert.deepEqual(findings(silent(tick("", "12 cents"), tick("", "15 cents"))), []);
  assert.deepEqual(cats(silent(tick("", "1 cent Reps 0"), tick("", "5 cent Reps 2"))), ["quiet"], "control");
});
