// Falsifiable additions for qa/audit/analyze-audit.mjs (round 4, key "falsify").
// Part 1 (rules): every rule the existing test leaves unpinned gets a record that breaks ONLY that rule.
//   Green on the current analyzer; red under each of the 17 rule mutants listed in mutate-analyzer.py.
// Part 2 (blind spots): defects the ledger should report and does not today. RED on the current analyzer.
// Usage: copy to tests/node/ and run  node --test tests/node/analyze-audit-gaps.test.mjs
//        (ANALYZER=<path> overrides the module under test, used by the mutation driver)
import test from "node:test";
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import path from "node:path";

const target = process.env.ANALYZER ? pathToFileURL(path.resolve(process.env.ANALYZER)).href : new URL("../../qa/audit/analyze-audit.mjs", import.meta.url).href;
const { findings, QUIET_COUNTS_BY_DESIGN } = await import(target);

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
const only = (rec, k) => { const got = cats(rec); assert.ok(got.includes(k), `expected ${k}, got ${JSON.stringify(findings(rec))}`); };

test("control: the baseline record is clean", () => assert.deepEqual(findings(clean()), []));

// ---- Part 1: one record per rule ----
test("rule: a small target is reported (and a disabled one is not)", () => {
  const r = clean(); r.inventory.rows[0].push(ctl({ text: "Tiny", small: true, w: 14, h: 14 })); only(r, "layout");
  const d = clean(); d.inventory.rows[0].push(ctl({ text: "Tiny", small: true, disabled: true })); assert.deepEqual(findings(d), []);
});
test("rule: low contrast is reported, with 3:1 only for text of 24 px and up", () => {
  const r = clean(); r.inventory.rows[0].push({ kind: "text", inView: true, text: "pale", contrast: 2.0, font: 16 }); only(r, "contrast");
  const ok = clean(); ok.inventory.rows[0].push({ kind: "text", inView: true, text: "big", contrast: 3.5, font: 28 }); assert.deepEqual(findings(ok), []);
  const bad = clean(); bad.inventory.rows[0].push({ kind: "text", inView: true, text: "big", contrast: 2.5, font: 28 }); only(bad, "contrast");
  const mid = clean(); mid.inventory.rows[0].push({ kind: "text", inView: true, text: "small", contrast: 3.5, font: 16 }); only(mid, "contrast");
});
test("rule: clipped text and overlapping controls are reported", () => {
  const a = clean(); a.inventory.overlaps.clipped.push("cut"); only(a, "layout");
  const b = clean(); b.inventory.overlaps.controls.push(["A", "B"]); only(b, "layout");
});
test("rule: a covered Tab stop is reported on its own", () => {
  const r = clean(); r.focus[0].obscured = true; r.focus[0].by = "#toast"; only(r, "focus");
});
test("rule: a mic left live after Stop is reported (mouse and keyboard iterations)", () => {
  const a = clean(); a.iterations[1].gum = { live: 2 }; only(a, "mic");
  const b = clean(); b.iterations[2].gum = { live: 2 }; only(b, "mic");
});
test("rule: a reopened exercise that is already live is a replay finding", () => {
  const r = clean(); r.iterations[6].reopened = { live: true }; only(r, "replay");
});
test("rule: the phone run is inspected too, and its throw is reported", () => {
  const r = clean(); r.iterations[5].inventory.overlaps.clipped.push("cut on phone"); only(r, "layout");
  const t = clean(); t.iterations[5].failure = "boom"; only(t, "start/stop");
});
test("rule: noise, not only silence, may not raise a count", () => {
  const r = clean(); r.iterations[3].noise.ticks = [tick("Reps 0"), tick("Reps 5")]; only(r, "quiet");
});
test("rule: Stay in the leave prompt must keep the exercise", () => {
  const r = clean(); r.iterations[4].afterStay = { view: "view-home" }; only(r, "leave");
});
test("rule: a percentage is not a count and a clock is not a count", () => {
  const r = clean(); r.iterations[3].silent.ticks = [tick("Score 40%"), tick("Score 90%")]; assert.deepEqual(findings(r), []);
});
test("rule: the exemption lists are exactly the reviewed ones", () => {
  assert.deepEqual(Object.keys(QUIET_COUNTS_BY_DESIGN), ["concisionGate"]);
  const g = clean("rhythmEcho"); g.iterations[3].silent.ticks = [tick("Reps 0"), tick("Reps 3")]; only(g, "quiet");
  const w = clean("rhythmEcho"); w.iterations[1] = { started: false, stopped: false }; only(w, "start/stop");
});

// ---- Part 2: blind spots (RED today) ----
test("blind spot: a count that first appears while the room is silent is a rise", () => {
  const r = clean(); r.iterations[3].silent.ticks = [tick("", ""), tick("", "Reps 3")]; only(r, "quiet");
  const s = clean(); s.iterations[3].silent.ticks = [tick("", "Hits 0"), tick("", "Hits 3 Streak 3")]; only(s, "quiet");
});
test("blind spot: a count that rose and fell back is still a count that moved on silence", () => {
  const r = clean(); r.iterations[3].silent.ticks = [tick("Reps 0"), tick("Reps 9"), tick("Reps 0")]; only(r, "quiet");
});
test("blind spot: counts in the status and pitch lines count too", () => {
  const a = clean(); a.iterations[3].silent.ticks = [tick("", "", { status: "Hits 0" }), tick("", "", { status: "Hits 4" })]; only(a, "quiet");
  const b = clean(); b.iterations[3].silent.ticks = [tick("", "", { pitch: "Hits 0" }), tick("", "", { pitch: "Hits 4" })]; only(b, "quiet");
});
test("blind spot: '3 sílabas' is a count, not '3 s' (seconds)", () => {
  const r = clean(); r.iterations[3].silent.ticks = [tick("", "3 sílabas"), tick("", "9 sílabas")]; only(r, "quiet");
});
test("blind spot: the plan page has no Start, but a mic left on there is still a finding", () => {
  const w = clean("weekPlan"); w.iterations[1] = { started: false, stopped: false, gum: { live: 2 } }; w.iterations[4].final.gum.live = 1; only(w, "mic");
});
test("blind spot: the concision gate may open on silence, but a harness failure or a rise on noise is still a finding", () => {
  const g = clean("concisionGate"); g.iterations[3].failure = "boundary run threw"; only(g, "quiet");
  const n = clean("concisionGate"); n.iterations[3].noise.ticks = [tick("Puertas 0/5"), tick("Puertas 4/5")]; only(n, "quiet");
});

// ---- Part 3: false alarms the red team found in a real ledger (round 4e) ----
// Each test pairs the line the learner sees (must stay quiet) with a control that must still be reported,
// so a counter that stopped counting would turn the control red.
const silentRun = (a, b) => { const r = clean(); r.iterations[3].silent.ticks = [a, b]; return r; };
const quietOnly = (a, b) => assert.deepEqual(findings(silentRun(a, b)), [], `${JSON.stringify(a)} → ${JSON.stringify(b)} must not be a count`);

test("false alarm: a note name with its octave is not a count (and a count beside it still is)", () => {
  quietOnly(tick("", "", { pitch: "Objetivo C3 Tú C3" }), tick("", "", { pitch: "Objetivo D4 Tú F#4" }));
  quietOnly(tick("", "", { pitch: "Objetivo Sib2" }), tick("", "", { pitch: "Objetivo Sol3" }));
  only(silentRun(tick("", "Aciertos 0", { pitch: "Objetivo C3" }), tick("", "Aciertos 2", { pitch: "Objetivo D4" })), "quiet");
});
test("false alarm: a pitch offset in cents is not a count (and a count beside it still is)", () => {
  quietOnly(tick("", "", { pitch: "afinado (+6¢) voz firme (±18¢)" }), tick("", "", { pitch: "afinado (+8¢) voz firme (±16¢)" }));
  quietOnly(tick("", "", { pitch: "−12 cents" }), tick("", "", { pitch: "+30 cents" }));
  // a signed offset with no unit written after it
  // one sign per record, the number growing, so that a sign dropped from the list turns exactly its record red
  for (const sign of ["+", "-", "−", "±"]) quietOnly(tick("", "", { pitch: `desvío ${sign}4` }), tick("", "", { pitch: `desvío ${sign}12` }));
  only(silentRun(tick("", "", { pitch: "(+6¢) Aciertos 0" }), tick("", "", { pitch: "(+8¢) Aciertos 3" })), "quiet");
});
test("false alarm: a percentage with decimals is not a count", () => {
  quietOnly(tick("En la zona 87,5 %"), tick("En la zona 97.2%"));
  only(silentRun(tick("En la zona 87,5 % Objetivos 0"), tick("En la zona 97,2 % Objetivos 4")), "quiet");
});
// One unit per record, each unsigned, so that dropping one unit from the list turns exactly its own record red
const UNITS = [["120 ms", "340 ms"], ["2 min", "3 min"], ["220 Hz", "233 Hz"], ["2 kHz", "3 kHz"], ["80 bpm", "84 bpm"], ["80 BPM", "84 BPM"], ["18 dB", "27 dB"], ["3 h", "4 h"], ["12 cents", "15 cents"]];
for (const [a, b] of UNITS) {
  test(`false alarm: "${a}" is a quantity with a unit, not a count`, () => {
    quietOnly(tick("", a), tick("", b));
    only(silentRun(tick("", `${a} Reps 0`), tick("", `${b} Reps 2`)), "quiet");
  });
}
// One range word per record, for the same reason
const RANGES = [["DEL 1 AL 10", "DEL 2 AL 11"], ["Paso 1 de 5", "Paso 1 de 6"], ["Notas 1 a 5", "Notas 1 a 6"], ["Sing from 2 to 8", "Sing from 3 to 9"], ["Hasta 5", "Hasta 6"], ["Of 5", "Of 6"], ["Entre 2 y 8", "Entre 3 y 9"], ["Rows 1 and 4", "Rows 1 and 5"], ["Compás at 4", "Compás at 5"], ["Sección en 3", "Sección en 4"], ["Row in 3", "Row in 4"]];
for (const [a, b] of RANGES) {
  test(`false alarm: the number in "${a}" is a position, not a count`, () => {
    quietOnly(tick("", a), tick("", b));
    only(silentRun(tick("", `${a} Aciertos 0`), tick("", `${b} Aciertos 2`)), "quiet");
  });
}
test("false alarm: the same word in another case is the same count, so its rise is still seen", () => {
  only(silentRun(tick("", "Reps 0"), tick("", "REPS 3")), "quiet");
  quietOnly(tick("", "Reps 2"), tick("", "REPS 2"));
});
test("a thousands separator joins a count and is named as one number", () => {
  const f = findings(silentRun(tick("", "Puntos 1.200"), tick("", "Puntos 1.300")));
  assert.deepEqual(f, [["quiet", "silent: on-screen counts rose (puntos 1200→1300) — review"]]);
  assert.deepEqual(findings(silentRun(tick("", "Puntos 1.200"), tick("", "Puntos 1.200"))), []);
});
test("a word that only starts like a unit is still a count ('5 hits' is not 5 h)", () => {
  only(silentRun(tick("", "5 hits"), tick("", "9 hits")), "quiet");
});
test("the plan page's thrown interruption run is reported, as every other mode's is", () => {
  const w = clean("weekPlan"); w.iterations[4].failure = "page closed"; only(w, "leave");
  const p = clean("pitchMatch"); p.iterations[4].failure = "page closed"; only(p, "leave");
  assert.equal(findings(clean("weekPlan")).length, 0);
});
