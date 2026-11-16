// What a card says about a study against what the study's record says (qa/evidence-ledger.json).
//
// The goal-set cards and the guided drills name their studies. An independent fact-check on 2026-11-12 found
// the names right and several sentences beyond them: a count that was another study's, "controlled trials"
// for a trial with no untreated group, "no study shows" for "the reviews found no reliable evidence".
// So the record of each study is written down once, with where it was read, and the copy is held to it:
// - a study named on a card or in a drill's text has a record, with a locator and the date it was read;
// - a number beside a study is one of that study's numbers;
// - a set graded "moderate" names a review or a controlled trial; a set graded "tradition" names no study;
// - "randomised" needs a randomised trial among the studies named, and "controlled trials" needs two;
// - nothing is said about all research ("no study shows", "nadie ha mostrado"): only about the studies named.
//
// A second independent reading the same day, of each sentence against its abstract, found faults of other kinds,
// and two of them are rules here:
// - nothing ranks the evidence ("the best studied"): one record cannot say what is best studied;
// - a number stated in one language is stated in the other.
//
// Every rule is a function over text, and has a control: the same rule on a planted defect, which must fail.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

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

const win = load();
const plain = (x) => JSON.parse(JSON.stringify(x));
const SETS = plain(win.VTSets.SETS);
const EXERCISES = plain([...win.VT_EXERCISES.vocal, ...win.VT_EXERCISES.singing]);
const ES = plain(win.VT_EXERCISE_LOCALE_ES);
const LEDGER = JSON.parse(read("qa/evidence-ledger.json"));
const RECORDS = new Map(LEDGER.sources.map((s) => [s.key, s]));

const YEAR = /\b(?:19|20)\d\d\b/;
const YEARS = /\b(?:19|20)\d\d\b/g;
const SURNAME = /\p{Lu}[\p{L}'’-]+/u;
// A review, or a trial with a comparison group. A dose comparison with no untreated group is neither.
const CONTROLLED = ["review", "rct", "controlled"];
// Sentences about all research, which no reading of a few studies can support.
const ABSOLUTE =
  /ning[uú]n estudio|nadie ha |sin estudios|no existen? estudios?|no se ha (?:probado|mostrado|medido|demostrado)|no está (?:probado|mostrado|demostrado)|falta medir|\bno stud(?:y|ies)\b|\bnobody has\b|\bno one has\b|\b(?:has|have) not been (?:shown|tested|measured|proven)\b|\bis not (?:shown|proven)\b|\bnot yet (?:measured|tested)\b|\bnever been\b|\bthere is no evidence\b|no hay (?:evidencia|pruebas|estudios)/i;

// A ranking of the evidence, which the record of one study cannot support.
const RANKING =
  /(?:mejor|m[aá]s) (?:estudiad|investigad|respaldad|comprobad|documentad)|la mejor evidencia|m[aá]s evidencia|mayor (?:respaldo|evidencia)|\b(?:best|most|better|more)[- ](?:widely[- ])?(?:studied|researched|supported|proven|documented)\b|\b(?:strongest|best|most) (?:evidence|support)\b/i;
// What no card or drill may say, each as [the pattern, what is wrong with it].
const BANNED = [
  [ABSOLUTE, "speaks for all research"],
  [RANKING, "ranks the evidence"]
];

/** "Stemple 1994" from "Stemple et al., 1994, 35 women": the first surname and the first year. */
function keyOf(part) {
  const year = part.match(YEAR);
  const name = part.match(SURNAME);
  return year && name ? `${name[0]} ${year[0]}` : null;
}

/** The studies a card's source line names. A part with no year ("Class tradition") names none. */
export function citedInSource(src) {
  return String(src || "")
    .split(";")
    .map((part) => keyOf(part.replace(/\([^()]*\)/g, " ")))
    .filter(Boolean);
}

/** The studies a longer text names in brackets: "(Stemple et al., 1994; Bane et al., 2019)". */
export function citedInText(text) {
  const out = [];
  for (const group of String(text || "").match(/\([^()]*\)/g) || []) {
    if (!YEAR.test(group)) continue;
    for (const part of group.slice(1, -1).split(";")) {
      const key = keyOf(part);
      if (key) out.push(key);
    }
  }
  return out;
}

/** A year written outside the brackets: a study named where the rules above do not look. */
export function looseYears(text) {
  return String(text || "").replace(/\([^()]*\)/g, " ").match(/\b(?:19|20)\d\d\b/g) || [];
}

/** Every number written in digits, years left out. */
export function numbersIn(text) {
  return (String(text || "").match(/\d+(?:[.,]\d+)?/g) || []).filter((n) => !/^(?:19|20)\d\d$/.test(n)).map((n) => Number(n.replace(",", ".")));
}

/** The numbers one language states and the other does not, as one readable line or none. */
export function parityProblems(a, b) {
  const stated = (t) => numbersIn(t).sort((x, y) => x - y).join(" ") || "no number";
  return stated(a) === stated(b) ? [] : [`states ${stated(a)} in one language and ${stated(b)} in the other`];
}

/** What a text claims beyond the records of the studies it names, as readable lines. */
export function claimProblems(text, keys, records) {
  const out = [];
  const allowed = new Set();
  for (const key of keys) {
    const rec = records.get(key);
    if (!rec) out.push(`names ${key}, which has no record`);
    else rec.numbers.forEach((n) => allowed.add(n));
  }
  for (const n of numbersIn(text)) if (!allowed.has(n)) out.push(`says ${n}, which is in no record of ${keys.join(", ") || "any study named"}`);
  for (const [pattern, wrong] of BANNED) {
    const hit = String(text || "").match(pattern);
    if (hit) out.push(`${wrong}: "${hit[0].trim()}"`);
  }
  out.push(...designProblems(text, keys, records));
  return out;
}

/** A design word in the text against the designs of the studies named. */
function designProblems(text, keys, records) {
  // A study named twice is one study.
  const count = (levels) => [...new Set(keys)].filter((k) => levels.includes(records.get(k)?.level)).length;
  const out = [];
  if (/aleatorizad|randomi[sz]ed/i.test(text) && count(["rct", "dose-comparison"]) < 1) out.push("says randomised and names no randomised trial");
  if (/ensayos controlados|controlled trials/i.test(text) && count(["rct", "controlled"]) < 2) out.push("says controlled trials and names fewer than two");
  else if (/ensayo controlado|controlled trial/i.test(text) && count(["rct", "controlled"]) < 1) out.push("says controlled trial and names none");
  return out;
}

/** Everything a card says in one language, with the years of its source line left out. */
const cardText = (w) => [w.goal, w.why, w.tip, String(w.src || "").replace(/\b(?:19|20)\d\d\b/g, " ")].join(" ");

/** A set's card in one language against the ledger. */
export function cardProblems(set, lang, records) {
  const w = set[lang] || {};
  const keys = citedInSource(w.src);
  const out = claimProblems(cardText(w), keys, records);
  const levels = keys.map((k) => records.get(k)?.level).filter(Boolean);
  if (set.grade === "mod" && !levels.some((l) => CONTROLLED.includes(l))) out.push("graded moderate without a review or a controlled trial");
  if (set.grade === "trad" && keys.length) out.push("graded tradition and names a study");
  if (set.grade !== "trad" && !keys.length) out.push("names no study and is not graded tradition");
  return out.map((p) => `${set.id} ${lang}: ${p}`);
}

const KEY = /^\p{Lu}[\p{L}'’-]+ (?:19|20)\d\d[ab]?$/u;
const located = (s) => /^\d{6,9}$/.test(s.pmid || "") || /^10\.\d{4,}\/\S+$/.test(s.doi || "") || /^https:\/\//.test(s.url || "");
/** What a record must have, each as [what is wrong, the check]. */
const RECORD_RULES = [
  ['key is not "Surname 2019"', (s) => KEY.test(s.key || "")],
  ["no PubMed id, DOI or address", located],
  ["no date read", (s) => /^\d{4}-\d{2}-\d{2}$/.test(s.date || "")],
  ["does not say what was read", (s) => /^(?:abstract|full text|abstract and full text)$/.test(s.checked || "")],
  ["level is not one the ledger defines", (s) => s.level in LEDGER.levels],
  ["numbers are not numbers", (s) => Array.isArray(s.numbers) && s.numbers.every((n) => typeof n === "number")],
  ...["cite", "population", "finding", "limits", "by"].map((k) => [`${k} is empty`, (s) => !!String(s[k] || "").trim()])
];

/** What is wrong with the ledger itself. */
export function ledgerProblems(sources) {
  const out = [];
  const seen = new Set();
  for (const s of sources) {
    const where = s.key || "(no key)";
    if (seen.has(s.key)) out.push(`${where}: recorded twice`);
    seen.add(s.key);
    for (const [wrong, ok] of RECORD_RULES) if (!ok(s)) out.push(`${where}: ${wrong}`);
  }
  return out;
}

/** The drills that name studies: their text in both languages. */
function citingTexts() {
  const out = [];
  for (const e of EXERCISES) {
    if (!citedInText(e.research).length) continue;
    out.push({ id: e.id, lang: "en", text: e.research });
    out.push({ id: e.id, lang: "es", text: ES[e.id]?.research || "" });
  }
  return out;
}

test("the ledger says where each study was read, when, and what it found", () => {
  assert.ok(LEDGER.sources.length >= 20, `control: the ledger was read (${LEDGER.sources.length})`);
  assert.deepEqual(ledgerProblems(LEDGER.sources), []);
});

test("every card says only what the studies it names say", () => {
  assert.ok(SETS.length >= 12, `control: the sets were read (${SETS.length})`);
  const named = new Set(SETS.flatMap((s) => citedInSource(s.en.src)));
  assert.ok(named.size >= 15, `control: the source lines were parsed (${[...named].join(", ")})`);
  assert.deepEqual(
    SETS.flatMap((s) => [...cardProblems(s, "es", RECORDS), ...cardProblems(s, "en", RECORDS)]),
    []
  );
});

test("a card names the same studies, and states the same numbers, in both languages", () => {
  for (const s of SETS) assert.deepEqual(citedInSource(s.es.src), citedInSource(s.en.src), s.id);
  assert.ok(SETS.some((s) => numbersIn(cardText(s.en)).length), "control: some card states a number");
  assert.deepEqual(
    SETS.flatMap((s) => parityProblems(cardText(s.es), cardText(s.en)).map((p) => `${s.id}: ${p}`)),
    []
  );
});

test("every drill that names a study says only what its record says, in both languages", () => {
  const texts = citingTexts();
  assert.ok(texts.length >= 10, `control: the drills that name studies were found (${texts.length / 2})`);
  const out = [];
  for (const t of texts) {
    assert.ok(t.text, `${t.id} has its ${t.lang} text`);
    out.push(...claimProblems(t.text, citedInText(t.text), RECORDS).map((p) => `${t.id} ${t.lang}: ${p}`));
    out.push(...looseYears(t.text).map((y) => `${t.id} ${t.lang}: names ${y} outside brackets, where no record is looked up`));
  }
  assert.deepEqual(out, []);
  for (let i = 0; i < texts.length; i += 2) {
    assert.deepEqual(new Set(citedInText(texts[i + 1].text)), new Set(citedInText(texts[i].text)), `${texts[i].id} names the same studies in both languages`);
    assert.deepEqual(parityProblems(texts[i + 1].text.replace(YEARS, " "), texts[i].text.replace(YEARS, " ")), [], `${texts[i].id} states the same numbers in both languages`);
  }
});

test("control: each rule fails on its own planted defect", () => {
  const good = SETS.find((s) => s.id === "v-aftertalk");
  const plant = (change, id = "v-aftertalk") => {
    const copy = plain(SETS.find((s) => s.id === id));
    change(copy);
    return [...cardProblems(copy, "es", RECORDS), ...cardProblems(copy, "en", RECORDS)].join(" | ");
  };
  assert.equal(plant(() => {}), "", "the unplanted card is clean");
  assert.match(good.es.why, /114/, "control: the card states the trial's size");
  // the count of another study
  assert.match(plant((s) => (s.es.why = s.es.why.replace("114", "141"))), /says 141/);
  // a study nobody recorded, and a year that is another paper's
  assert.match(plant((s) => (s.en.src = "Smith et al. 2020")), /names Smith 2020, which has no record/);
  assert.match(plant((s) => (s.en.src = s.en.src.replace("2026", "2016"))), /names Peng 2016/);
  // all of research
  assert.match(plant((s) => (s.en.why += " No study shows otherwise.")), /speaks for all research/);
  assert.match(plant((s) => (s.es.why += " Nadie ha mostrado lo contrario.")), /speaks for all research/);
  assert.match(plant((s) => (s.es.tip += " No está probado que dure.")), /speaks for all research/);
  // …and a sentence about the studies named is not one about all research
  assert.doesNotMatch(plant((s) => (s.en.why += " That trial did not test a later day.")), /speaks for all research/);
  assert.doesNotMatch(plant((s) => (s.es.why += " Ese ensayo no probó otro día.")), /speaks for all research/);
  // grades
  assert.match(plant((s) => (s.grade = "mod"), "s-cooldown"), /graded moderate without a review or a controlled trial/);
  assert.match(plant((s) => (s.grade = "trad")), /graded tradition and names a study/);
  assert.match(plant((s) => (s.es.src = s.en.src = "Tradición de clase")), /names no study and is not graded tradition/);
  // design words
  assert.match(plant((s) => (s.en.why += " Small controlled trials agree.")), /says controlled trials and names fewer than two/);
  assert.match(plant((s) => (s.es.why += " Lo dicen ensayos controlados.")), /says controlled trials and names fewer than two/);
  assert.match(plant((s) => (s.en.why += " It was randomised."), "s-cooldown"), /says randomised and names no randomised trial/);
  assert.doesNotMatch(plant((s) => (s.en.why += " Small controlled trials agree."), "s-function"), /controlled trials/);
  const twice = "Small controlled trials (Stemple et al., 1994) agree (Stemple et al., 1994; Bane et al., 2019).";
  assert.match(claimProblems(twice, citedInText(twice), RECORDS).join(" | "), /names fewer than two/, "a study named twice is one study");
  // a dose comparison is not a controlled trial
  const dose = new Map([...RECORDS].filter(([k]) => k === "Bane 2019"));
  assert.match(cardProblems({ id: "x", grade: "mod", en: { src: "Bane et al. 2019", why: "" } }, "en", dose).join(" | "), /graded moderate without/);
  // the drills' texts
  assert.match(claimProblems("In 36 women (Stemple et al., 1994).", citedInText("(Stemple et al., 1994)"), RECORDS).join(" | "), /says 36/);
  assert.deepEqual(plain(citedInText("Fine (Stemple et al., 1994, 35 women; Bane y otros, 2019) and (not a study).")), ["Stemple 1994", "Bane 2019"]);
  assert.deepEqual(plain(citedInSource("Berglin, Pfordresher y Demorest 2022; Kapsner-Smith et al. 2015 (ensayo); Tradición de clase")), ["Berglin 2022", "Kapsner-Smith 2015"]);
  assert.deepEqual(numbersIn("In 2019, 28 women did 2 rounds for 1,5 minutes (1994)."), [28, 2, 1.5]);
  assert.deepEqual(plain(looseYears("Smith showed in 2020 what (Stemple et al., 1994) did not.")), ["2020"]);
  assert.match(plant((s) => (s.en.why += " There is no evidence against it.")), /speaks for all research/);
  assert.match(plant((s) => (s.es.why += " No hay evidencia en contra.")), /speaks for all research/);
  // a ranking of the evidence
  assert.match(plant((s) => (s.en.why += " The straw is the best studied item here.")), /ranks the evidence: "best studied"/);
  assert.match(plant((s) => (s.es.why += " La pajita es lo mejor estudiado de la lista.")), /ranks the evidence/);
  assert.match(plant((s) => (s.es.why += " Es la técnica mejor estudiada.")), /ranks the evidence/);
  assert.match(plant((s) => (s.en.why += " It has the most evidence behind it.")), /ranks the evidence: "most evidence"/);
  assert.match(plant((s) => (s.en.why += " It is more widely studied than the rest.")), /ranks the evidence/);
  assert.doesNotMatch(plant((s) => (s.en.why += " It was studied in adults, who understood it better.")), /ranks the evidence/);
  assert.doesNotMatch(plant((s) => (s.es.why += " Se entiende mejor y se estudió en adultos.")), /ranks the evidence/);
  // a number in one language only
  assert.match(parityProblems("Las 12 cantantes de un estudio", "The singers in one study").join(" | "), /states 12 in one language and no number in the other/);
  assert.deepEqual(parityProblems("12 cantantes y 6 oyentes", "6 listeners and 12 singers"), []);
  // the ledger's own rules
  const rec = (change) => {
    const copy = plain(RECORDS.get("Peng 2026"));
    change(copy);
    return ledgerProblems([copy]).join(" | ");
  };
  assert.equal(rec(() => {}), "");
  assert.match(rec((s) => { s.pmid = ""; s.doi = ""; }), /no PubMed id, DOI or address/);
  assert.match(rec((s) => (s.date = "")), /no date read/);
  assert.match(rec((s) => (s.checked = "title")), /does not say what was read/);
  assert.match(rec((s) => (s.level = "strong")), /level is not one the ledger defines/);
  assert.match(rec((s) => (s.key = "peng 2026")), /key is not/);
  assert.match(rec((s) => (s.limits = "")), /limits is empty/);
  assert.match(rec((s) => (s.numbers = ["114"])), /numbers are not numbers/);
  assert.match(ledgerProblems([RECORDS.get("Peng 2026"), RECORDS.get("Peng 2026")]).join(" | "), /recorded twice/);
});
