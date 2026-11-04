#!/usr/bin/env node
/**
 * What is free and what is Pro, said once.
 *
 * Three hand-maintained lists have to agree or the product lies about itself:
 *
 *   1. `can()` in `js/billing.js` — the gate the code actually asks. This is
 *      what decides whether somebody gets a thing.
 *   2. the `features` arrays in `js/billing-config.js` — what the pricing
 *      cards promise.
 *   3. `pricing.feat.*` in `js/i18n.js` — the words each promise is printed in,
 *      in both languages.
 *
 * Nothing kept them in step, and two capabilities had already drifted out:
 * `priority_progressions` and `no_limits` were removed from the plan cards when
 * VG-02 was fixed in July 2026 and left behind in the gate and in both
 * dictionaries, so `can("no_limits")` answered yes to every Pro subscriber
 * while no feature in the product meant anything by it, and a marketing string
 * for something that was never built sat one config line away from being shown
 * again. That is the "feature museum" this project is written against, and the
 * only reliable way to not have one is a check that fails.
 *
 * The two aggregates are deliberate and are checked rather than exempted:
 * `all_free` on the Pro card means "everything on the Free card", and
 * `all_pro_monthly` on the Yearly card means "everything on the Pro monthly
 * card". They are the one place a list may name something other than a
 * capability of its own.
 *
 * **What this check cannot see, and what does.** It compares NAMES. It never
 * evaluates `can()`, because `can()` needs a browser, so a `map` that stops
 * overriding a key the Pro card sells, or overrides it with `false`, leaves
 * every name in place and passes here while a paying subscriber is refused.
 * Three such defects were planted on 3 November 2026 and all three passed.
 * `tests/tier-values.spec.js` closes that half: it asks the real `can()` in a
 * real browser, as a free visitor and as a subscriber, and holds the answers to
 * the plan cards. Both are in `npm test`; neither covers the other's half.
 *
 * This check is itself tested, in `qa/check-tiers.test.mjs`, because a check
 * nobody has tried to fool is a belief rather than a check.
 *
 * Run: `node qa/check-tiers.mjs` (part of `npm test`). Exit 1 on any
 * disagreement, naming it.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// TIERS_ROOT lets qa/check-tiers.test.mjs run this check against a copy of the
// four files it reads with one defect planted, which is the only way to know
// the check fails when it should. It defaults to the repository.
const ROOT = process.env.TIERS_ROOT || path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** The two keys that name another card's list rather than a capability. */
const AGGREGATES = new Set(["all_free", "all_pro_monthly"]);

/**
 * The capability keys `can()` answers for, read out of its own `free` table
 * (which lists every key, with the free answer) and its `map` override.
 * @param {string} src Contents of js/billing.js.
 * @returns {{ free: string[], pro: string[] }} Keys in each table.
 */
function capabilityKeys(src) {
  const block = (marker) => {
    const at = src.indexOf(marker);
    if (at < 0) {
      throw new Error(`js/billing.js no longer contains \`${marker}\`; this check needs updating`);
    }
    const rest = src.slice(at + marker.length);
    const end = rest.indexOf("\n    };");
    if (end < 0) {
      throw new Error(`could not find the end of \`${marker}\` in js/billing.js`);
    }
    return rest.slice(0, end);
  };
  const keysOf = (text) => [...text.matchAll(/^\s{6}([a-z_0-9]+):/gm)].map((m) => m[1]);
  return { free: keysOf(block("const free = {")), pro: keysOf(block("const map = {")) };
}

/**
 * Every feature each plan card promises.
 * @param {string} src Contents of js/billing-config.js.
 * @returns {Map<string, string[]>} Plan id to its feature keys.
 */
function planFeatures(src) {
  // Scoped to the `plans:` array: the providers above it carry an `id` too, and
  // a scan of the whole file paired the first provider's id with the first
  // plan's features and then found no plan called "free" at all.
  const at = src.indexOf("plans: [");
  if (at < 0) {
    throw new Error("js/billing-config.js no longer contains a `plans: [` array; this check needs updating");
  }
  const end = src.indexOf("\n    ],", at);
  if (end < 0) {
    throw new Error("could not find the end of the `plans: [` array in js/billing-config.js");
  }
  const block = src.slice(at, end);
  const plans = new Map();
  const re = /id:\s*"([a-z_0-9]+)"[\s\S]*?features:\s*\[([^\]]*)\]/g;
  let m;
  while ((m = re.exec(block))) {
    plans.set(m[1], [...m[2].matchAll(/"([^"]+)"/g)].map((f) => f[1]));
  }
  return plans;
}

/**
 * The `pricing.feat.*` keys each dictionary carries.
 * @param {string} src Contents of js/i18n.js.
 * @returns {{ es: Set<string>, en: Set<string> }} Keys per language.
 */
function featureStrings(src) {
  // The Spanish dictionary is first in the file and the English one second, so
  // the split is the one place a key can appear twice.
  const hits = [...src.matchAll(/"pricing\.feat\.([a-z_0-9]+)":/g)];
  const es = new Set();
  const en = new Set();
  for (const hit of hits) {
    (es.has(hit[1]) ? en : es).add(hit[1]);
  }
  return { es, en };
}

const failures = [];
let checks = 0;

/**
 * Record one check and its verdict.
 * @param {string} what What is being asserted.
 * @param {string[]} offenders The names that break it, if any.
 * @returns {void}
 */
function expectNone(what, offenders) {
  checks += 1;
  if (offenders.length) {
    failures.push(`${what}: ${offenders.join(", ")}`);
  }
}

const caps = capabilityKeys(read("js/billing.js"));
const plans = planFeatures(read("js/billing-config.js"));
const strings = featureStrings(read("js/i18n.js"));

const capSet = new Set(caps.free);
const promised = new Set([...plans.values()].flat());

expectNone(
  "`can()`'s free table and its Pro overrides must name the same keys",
  caps.pro.filter((k) => !capSet.has(k))
);
expectNone(
  "a plan card promises something `can()` cannot answer for",
  [...promised].filter((f) => !capSet.has(f) && !AGGREGATES.has(f))
);
expectNone(
  "`can()` answers for a capability no plan card promises, so it is a gate nobody is sold",
  caps.free.filter((k) => !promised.has(k) && !AGGREGATES.has(k))
);
expectNone(
  "a plan card promises something with no Spanish words",
  [...promised].filter((f) => !strings.es.has(f))
);
expectNone(
  "a plan card promises something with no English words",
  [...promised].filter((f) => !strings.en.has(f))
);
expectNone(
  "a `pricing.feat.*` string exists for something no plan promises, so it is copy for a feature nobody is sold",
  [...strings.es].filter((k) => !promised.has(k))
);
expectNone(
  "a Spanish feature string has no English counterpart",
  [...strings.es].filter((k) => !strings.en.has(k))
);
expectNone(
  "an English feature string has no Spanish counterpart",
  [...strings.en].filter((k) => !strings.es.has(k))
);

// The free card is the one list `can()` must answer yes to without a licence.
const freeCard = plans.get("free") || [];
expectNone(
  "js/billing-config.js has no `free` plan, so what a visitor gets is written nowhere",
  freeCard.length ? [] : ["free"]
);
const billing = read("js/billing.js");
expectNone(
  "the free card promises something `can()`'s free table answers no to",
  freeCard.filter((f) => !AGGREGATES.has(f) && !new RegExp(`^\\s{6}${f}: true,?$`, "m").test(billing))
);

// And the claim the pricing panel leads with has to be the claim the evidence
// supports, so the two cannot drift apart silently.
const i18n = read("js/i18n.js");
// One regex over the whole file was satisfied by EITHER language, so the claim
// could be deleted from one of them and nothing would notice. Measured both ways
// on 3 November 2026: with the English sentence replaced the check stayed green,
// and so did it with the Spanish one. The two dictionaries are read separately
// now, Spanish first and English second, which is the order `featureStrings`
// above already relies on. The value pattern allows an escaped quote so that a
// sentence with one in it does not silently read as empty.
const proof1 = [...i18n.matchAll(/"pricing\.proof1":\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
expectNone(
  "js/i18n.js does not carry exactly two `pricing.proof1` strings, so there is no saying which language is which",
  proof1.length === 2 ? [] : [`${proof1.length} found, expected 2`]
);
expectNone(
  "the Spanish pricing panel's first proof line no longer says free practice is uncapped, which is the whole differentiator in docs/35-PRICING.md",
  /gratis, siempre/.test(proof1[0] || "") ? [] : ["pricing.proof1 (es)"]
);
expectNone(
  "the English pricing panel's first proof line no longer says free practice is uncapped, which is the whole differentiator in docs/35-PRICING.md",
  /free, always/.test(proof1[1] || "") ? [] : ["pricing.proof1 (en)"]
);
const pricingDoc = read("docs/35-PRICING.md");
expectNone(
  "docs/35-PRICING.md no longer carries the free-tier comparison the panel's claim rests on",
  /Every verified competitor caps free practice/.test(pricingDoc) ? [] : ["docs/35-PRICING.md"]
);
// `pricing.proof3` is a specific comparative price claim about third-party
// services in a named city, and until 2026-11-04 it had no source anywhere. The
// evidence is now a dated table in the pricing doc, so the claim and the
// evidence have to disappear together or not at all.
const proof3 = [...i18n.matchAll(/"pricing\.proof3":\s*"((?:[^"\\]|\\.)*)"/g)].map((m) => m[1]);
expectNone(
  "js/i18n.js does not carry exactly two `pricing.proof3` strings",
  proof3.length === 2 ? [] : [`${proof3.length} found, expected 2`]
);
expectNone(
  "the Spanish pricing panel still compares a year of Pro with private lessons, but docs/35-PRICING.md no longer carries the Lima prices it rests on",
  /clases particulares/.test(proof3[0] || "") && !/S\/66 la hora/.test(pricingDoc)
    ? ["docs/35-PRICING.md"]
    : []
);


// The trial-length prior is the one external claim four documents lean on, and
// on 2026-11-04 three of them described it wrongly: they said a test "a
// thousand times larger" had called the 7-vs-14 comparison null, when the paper
// compares each arm with a 30-day control, never tests 7 against 14, and holds
// about 51,000 per arm against this site's 432. A reader cannot check a claim
// with no reference, so any document that asserts the prior has to be able to
// point at one, and the arithmetic has to stay with it.
//
// These documents are hard-wrapped, so a sentence is routinely split across a
// newline: matching the raw text found two of the four and silently passed the
// other two. Every test below runs on whitespace-collapsed text.
const trialDocs = ["docs/35-PRICING.md", "docs/38-AB-TESTING.md", "docs/40-GO-LIVE-GATE.md", "docs/42-WHAT-THIS-BRANCH-CHANGED.md"];
const flat = (rel) => read(rel).replace(/\s+/g, " ");
const asserts = trialDocs.filter((rel) => /randomised (test|experiment) (of|on) trial length/.test(flat(rel)));
expectNone(
  "no document asserts the trial-length prior any more, so this check has nothing left to guard and should go",
  asserts.length ? [] : ["qa/check-tiers.mjs"]
);
expectNone(
  "a document asserts the trial-length prior without naming the study a reader could check it against",
  asserts.filter((rel) => !/arXiv:2006\.13420/.test(flat(rel)))
);
expectNone(
  "docs/35-PRICING.md asserts the trial-length prior but no longer carries the per-arm size and the effect the paper actually reports",
  /randomised (test|experiment) (of|on) trial length/.test(flat("docs/35-PRICING.md"))
    && (!/51,000 in each/.test(flat("docs/35-PRICING.md")) || !/t = 1\.51/.test(flat("docs/35-PRICING.md")))
    ? ["docs/35-PRICING.md"]
    : []
);
expectNone(
  "a document still claims the study called the 7-vs-14 comparison null, which it never tested",
  trialDocs.filter((rel) => /thousand times larger already called/.test(flat(rel)))
);

if (failures.length) {
  for (const f of failures) {
    console.error(`FAIL  ${f}`);
  }
  console.error(`\nTIERS_CHECK_FAIL ${failures.length} of ${checks} checks`);
  process.exit(1);
}

console.log(
  `TIERS_CHECK_PASS ${checks} checks · ${capSet.size - AGGREGATES.size} capabilities · ${plans.size} plans · ${strings.es.size} strings in 2 languages`
);
