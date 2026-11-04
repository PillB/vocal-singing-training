/**
 * Trying to fool the tier check.
 *
 * `qa/check-tiers.mjs` is the guard that stops the three hand-maintained lists
 * of what is free and what is Pro drifting apart again, and it shipped on
 * 3 November 2026 without anything having tried to defeat it. QA round 10 tried,
 * planted twelve defects, and two classes of them survived:
 *
 *   - **The differentiator claim was one regex over the whole file**, so either
 *     language satisfied it. Replacing the English sentence left the check green;
 *     so did replacing the Spanish one. Both were reproduced before the fix. The
 *     two dictionaries are now read separately, with a third check that there are
 *     exactly two of those strings at all.
 *   - **It never evaluates `can()`**, and cannot: `can()` needs a browser. A
 *     `map` that stops overriding a key the Pro card sells, or overrides it with
 *     `false`, leaves every name in place. Three of those were planted and all
 *     three passed. That half is `tests/tier-values.spec.js`, where the four
 *     value mutants die.
 *
 * One QA claim did not survive checking and is recorded rather than repeated: a
 * `free` table that says no to a key the Free card promises was reported as
 * passing, and it does not. Each of the five Free-card keys was set to `false` in
 * turn and the check caught all five. What is genuinely dead code is the `free`
 * value of a key the `map` overrides, which is why planting `coach_pack: true`
 * there changes no answer and is not a mutant of anything.
 *
 * Each case below copies the four files the check reads, plants one defect, and
 * runs the check against the copy through TIERS_ROOT. Adopted from QA round 10
 * with its eight mutants unchanged; the ninth test is mine, and it is the VG-52
 * guard for this directory: a test file nobody runs is worse than no test.
 * VG-58.
 */
import assert from "node:assert/strict";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, "..");
// The four the check has always read, plus the three documents the
// trial-length citation guard reads (VG-68). The sandbox has to carry every
// input or the control case fails for want of a file rather than on its merits.
const FILES = [
  "js/billing.js",
  "js/billing-config.js",
  "js/i18n.js",
  "docs/35-PRICING.md",
  "docs/38-AB-TESTING.md",
  "docs/40-GO-LIVE-GATE.md",
  "docs/42-WHAT-THIS-BRANCH-CHANGED.md"
];

function runOn(mutate) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "tiers-"));
  for (const f of FILES) {
    mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    cpSync(path.join(ROOT, f), path.join(dir, f));
  }
  if (mutate) {
    const [file, from, to] = mutate;
    const p = path.join(dir, file);
    const src = readFileSync(p, "utf8");
    assert.equal(src.split(from).length, 2, `anchor for ${file} must occur exactly once: ${from.slice(0, 50)}`);
    writeFileSync(p, src.replace(from, to));
  }
  return spawnSync(process.execPath, [path.join(HERE, "check-tiers.mjs")], { env: { ...process.env, TIERS_ROOT: dir }, encoding: "utf8" });
}

test("control: the real files pass", () => {
  const r = runOn(null);
  assert.equal(r.status, 0, r.stderr);
});

const MUTANTS = [
  ["English proof1 loses its free-always claim", ["js/i18n.js", "Here every exercise, the mic and the piano are free, always.", "Here every exercise is free for your first week."]],
  ["Spanish proof1 loses its gratis-siempre claim", ["js/i18n.js", "son gratis, siempre.", "son gratis una semana."]],
  ["English words for a promised feature deleted", ["js/i18n.js", '      "pricing.feat.extra_freezes": "Save up to 3 rest days instead of 2",\n', ""]],
  ["Spanish words for a promised feature deleted", ["js/i18n.js", '      "pricing.feat.extra_freezes": "Guarda hasta 3 días de descanso en vez de 2",\n', ""]],
  ["a Pro card stops promising a capability can() still answers", ["js/billing-config.js", '          "extra_reminders",\n          "extra_freezes"\n', '          "extra_reminders"\n']],
  ["the Free card promises a capability the free table refuses", ["js/billing-config.js", '          "value_pulse"\n        ],\n        cta: "current"', '          "value_pulse",\n          "coach_pack"\n        ],\n        cta: "current"']],
  ["the yearly card stops naming the monthly card", ["js/billing-config.js", '          "all_pro_monthly",\n', ""]],
  ["a Pro override names a key the free table does not", ["js/billing.js", "      ad_free: pro\n    };", "      ad_free: pro,\n      invented_key: pro\n    };"]]
];
for (const [name, m] of MUTANTS) {
  test(`mutant: ${name}`, () => {
    const r = runOn(m);
    assert.notEqual(r.status, 0, "the check still passes with this defect planted");
    assert.match(r.stderr, /TIERS_CHECK_FAIL/);
  });
}

/**
 * Checkers that are run by hand on purpose, and why. Anything else in this
 * directory has to be in the `test` script.
 *
 * The rule below used to cover `*.test.mjs` only, which left the gap it exists
 * to close wide open: `check-cache-stamps.mjs` is a checker, not a node test,
 * and could have been written, committed and run by nothing. Widening it turned
 * up one genuine by-hand tool, so the exception is written down with its reason
 * rather than left as a hole in the pattern.
 */
const BY_HAND = {
  "check-header-hit-targets.mjs":
    "drives a real browser against a locally served site; a diagnostic that prints boxes, not a pass/fail gate"
};

test("every qa test and checker is named in package.json's test script, or is a by-hand tool with its reason", () => {
  const pkg = JSON.parse(readFileSync(path.join(ROOT, "package.json"), "utf8"));
  const script = String((pkg.scripts && pkg.scripts.test) || "");
  const files = readdirSync(HERE).filter(
    (name) => name.endsWith(".test.mjs") || (name.startsWith("check-") && name.endsWith(".mjs"))
  );
  assert.ok(files.length, "this directory holds no test files, which cannot be right");
  const missing = files.filter((name) => !script.includes(`qa/${name}`) && !BY_HAND[name]);
  assert.deepEqual(missing, [], "add these to the `test` script in package.json, or to BY_HAND with a reason");
  // An exception for a file that is gone is a comment pretending to be a rule.
  assert.deepEqual(
    Object.keys(BY_HAND).filter((name) => !files.includes(name)),
    [],
    "BY_HAND names a file that is not here any more"
  );
  // And a by-hand tool must not also be in the suite, or the reason is stale.
  assert.deepEqual(
    Object.keys(BY_HAND).filter((name) => script.includes(`qa/${name}`)),
    [],
    "BY_HAND names a file the test script runs"
  );
});
