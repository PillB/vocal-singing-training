// The texts the app shows about research: one per goal-set card and per drill that names a study, in each
// language, with a short hash of its wording.
//
// tests/node/evidence-readings.test.mjs holds each text to the reading recorded for it under "readings" in
// qa/evidence-ledger.json, so wording cannot change after a second reader has read it without the test saying so.
//
//   node qa/evidence-texts.mjs          prints "id lang hash" for every text as it stands now
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { fileURLToPath } from "node:url";

const read = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8");
const plain = (x) => JSON.parse(JSON.stringify(x));
// A study named in brackets with its year: "(Stemple et al., 1994)".
const NAMES_A_STUDY = /\([^()]*\b(?:19|20)\d\d[^()]*\)/;

/** Twelve hex characters of the text's SHA-256: enough to tell two wordings apart, short enough to read. */
export const hashOf = (text) => createHash("sha256").update(String(text).normalize("NFC")).digest("hex").slice(0, 12);

function load() {
  const win = { console };
  win.window = win;
  win.document = { querySelector: () => null };
  win.addEventListener = () => {};
  win.sessionStorage = { getItem: () => null };
  runInNewContext(read("js/exercises-data.js"), win);
  runInNewContext(read("js/exercises-locale-es.js"), win);
  win.VTI18n = { lang: "es", t: (k) => k };
  runInNewContext(read("js/session.js"), win);
  runInNewContext(read("js/session-sets.js"), win);
  return win;
}

/** Everything a card says about its evidence, in one language. */
const cardText = (w) => [w.goal, w.why, w.tip, w.src].join("\n");
/** A drill's research text and its tips, where the dose is stated. */
const drillText = (e) => [e.research, ...(e.tips || [])].join("\n");

/** [{ id, lang, text, sha }] for every card, and for every drill whose research text names a study. */
export function evidenceTexts() {
  const win = load();
  const es = plain(win.VT_EXERCISE_LOCALE_ES);
  const out = [];
  for (const set of plain(win.VTSets.SETS)) {
    for (const lang of ["es", "en"]) out.push({ id: set.id, lang, text: cardText(set[lang] || {}) });
  }
  for (const e of plain([...win.VT_EXERCISES.vocal, ...win.VT_EXERCISES.singing])) {
    if (!NAMES_A_STUDY.test(e.research || "")) continue;
    out.push({ id: e.id, lang: "es", text: drillText(es[e.id] || {}) });
    out.push({ id: e.id, lang: "en", text: drillText(e) });
  }
  return out.map((t) => ({ ...t, sha: hashOf(t.text) }));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  for (const t of evidenceTexts()) console.log(`${t.id} ${t.lang} ${t.sha}`);
}
