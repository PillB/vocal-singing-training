// The wording a learner sees about a study is the wording a second reader read.
//
// tests/node/evidence-ledger.test.mjs holds a card to the record of its studies: names, numbers, design words.
// It cannot tell whether a sentence says more than its abstract does. On 2026-11-12 a second, independent
// reading of every sentence against its abstract found 15 that did, in wording corrected that same morning
// and already on a pull request. So each text now carries the reading that covered it ("readings" in
// qa/evidence-ledger.json: who read it, when, and a hash of the words read), and this test fails when
// - a text has no reading, or its words changed after the reading;
// - a reading is by the author alone, or has no date;
// - a reading is left behind for a text the app no longer shows.
//
// This is a gate on process, and it says so: it proves the words were read, not that the reader was right.
// After a second reader has read new wording, `node qa/evidence-texts.mjs` prints the hashes to record.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evidenceTexts, hashOf } from "../../qa/evidence-texts.mjs";

const LEDGER = JSON.parse(readFileSync(new URL("../../qa/evidence-ledger.json", import.meta.url), "utf8"));
const TEXTS = evidenceTexts();
const keyOf = (x) => `${x.id} ${x.lang}`;

/** What a reading must be for the text it covers, each as [what is wrong, the check]. */
const READING_RULES = [
  ["changed since a second reader read it", (t, r) => r.sha === t.sha],
  ["its reading has no date", (t, r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date || "")],
  ["its reading names no reader", (t, r) => !!String(r.by || "").trim()],
  ["read only by its author", (t, r) => !/^(?:the )?authors?$/i.test(String(r.by || "").trim())]
];

/** The texts as they stand against the readings recorded, as readable lines. */
export function readingProblems(texts, readings) {
  const left = new Map(readings.map((r) => [keyOf(r), r]));
  const out = [];
  for (const t of texts) {
    const r = left.get(keyOf(t));
    left.delete(keyOf(t));
    const wrong = r ? READING_RULES.filter(([, ok]) => !ok(t, r)).map(([what]) => what) : ["never read by a second reader"];
    out.push(...wrong.map((what) => `${keyOf(t)}: ${what}`));
  }
  for (const key of left.keys()) out.push(`${key}: a reading of a text the app no longer shows`);
  return out;
}

test("every text about a study is the wording a second reader read", () => {
  assert.ok(TEXTS.length >= 34, `control: the cards and the drills that name studies were found (${TEXTS.length})`);
  assert.ok(TEXTS.every((t) => t.text.length > 40), "control: every text was read from the app");
  assert.deepEqual(readingProblems(TEXTS, LEDGER.readings || []), []);
});

test("control: a text that changed, was never read, or was read only by its author fails", () => {
  const readings = LEDGER.readings || [];
  const one = TEXTS.find((t) => t.id === "s-warmup" && t.lang === "es");
  assert.ok(one && /solo en algunas/.test(one.text), "control: the card says listeners heard it only in some singers");
  const mine = readings.filter((r) => keyOf(r) === keyOf(one));
  assert.equal(mine.length, 1, "control: the card has one reading");
  const problems = (text, reading) => readingProblems([{ ...one, text, sha: hashOf(text) }], reading).join(" | ");
  assert.equal(problems(one.text, mine), "", "the text as read is clean");
  // one word that no rule about names or numbers sees
  assert.match(problems(one.text.replace("solo en algunas", "en todas"), mine), /s-warmup es: changed since a second reader read it/);
  // an accent typed as two characters is the same word
  assert.equal(problems(one.text.normalize("NFD"), mine), "");
  assert.match(problems(one.text, []), /never read by a second reader/);
  assert.match(problems(one.text, [{ ...mine[0], by: "Author" }]), /read only by its author/);
  assert.match(problems(one.text, [{ ...mine[0], by: "the author" }]), /read only by its author/);
  assert.doesNotMatch(problems(one.text, [{ ...mine[0], by: "independent reader and author" }]), /read only by its author/);
  assert.match(problems(one.text, [{ ...mine[0], by: " " }]), /names no reader/);
  assert.match(problems(one.text, [{ ...mine[0], date: "today" }]), /has no date/);
  assert.match(problems(one.text, [...mine, { ...mine[0], id: "s-gone" }]), /s-gone es: a reading of a text the app no longer shows/);
});
