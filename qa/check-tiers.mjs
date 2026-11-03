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
 * Run: `node qa/check-tiers.mjs` (part of `npm test`). Exit 1 on any
 * disagreement, naming it.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
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
expectNone(
  "the pricing panel's first proof line no longer says free practice is uncapped, which is the whole differentiator in docs/35-PRICING.md",
  /"pricing\.proof1":\s*"[^"]*(gratis, siempre|free, always)/.test(i18n) ? [] : ["pricing.proof1"]
);
const pricingDoc = read("docs/35-PRICING.md");
expectNone(
  "docs/35-PRICING.md no longer carries the free-tier comparison the panel's claim rests on",
  /Every verified competitor caps free practice/.test(pricingDoc) ? [] : ["docs/35-PRICING.md"]
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
