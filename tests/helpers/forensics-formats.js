/**
 * The screen formats of the mouse-only forensics sweep
 * (tests/headed-exercise-forensics.spec.js), which of them a run covers, and
 * how many Starts may fail to go live in it. The nightly splits the six formats
 * over two jobs (FORENSICS_FORMATS in .github/workflows/quality.yml), since all
 * six took about 87 min against an 80 min suite timeout. This lives here, not in
 * the spec, so that tests/node/nightly-sweep-contract.test.mjs can check it on
 * every pull request: the spec itself runs only at night.
 */
const ALL_FORMATS = [
  { name: "desktop", width: 1280, height: 800, fullscreen: false },
  { name: "mobile", width: 390, height: 844, fullscreen: false },
  { name: "mobile-land", width: 844, height: 390, fullscreen: false },
  { name: "tablet", width: 768, height: 1024, fullscreen: false },
  { name: "short", width: 1280, height: 560, fullscreen: false },
  { name: "fullscreen", width: 1440, height: 900, fullscreen: true }
];

/**
 * The formats FORENSICS_FORMATS names (comma-separated), in ALL_FORMATS order,
 * or all six when it is unset or blank. An unknown name throws: a misspelt one
 * in the workflow would otherwise leave a format out of every job without a word.
 */
function selectFormats(env) {
  const raw = String(env.FORENSICS_FORMATS || "").trim();
  if (!raw) return ALL_FORMATS.slice();
  const names = raw.split(",").map((s) => s.trim()).filter(Boolean);
  const unknown = names.filter((n) => !ALL_FORMATS.some((f) => f.name === n));
  if (unknown.length) {
    throw new Error(`unknown FORENSICS_FORMATS: ${unknown.join(", ")} (known: ${ALL_FORMATS.map((f) => f.name).join(", ")})`);
  }
  return ALL_FORMATS.filter((f) => names.includes(f.name));
}

/** Starts that did not go live, tolerated across all six formats in one run (the gate before the split). */
const START_FAIL_BUDGET = 4;

/**
 * Starts that may fail to go live in a run of `n` of the six formats: the
 * whole budget rounded down to the run's share. Rounding down means the parts
 * of any split never add up to more than the whole (2 + 2 for the nightly's
 * 3 + 3). It also means a part is stricter than the whole was: three failures
 * in one half turn that half red, where one run of all six allowed four.
 */
function startFailBudget(n) {
  return Math.floor((START_FAIL_BUDGET * n) / ALL_FORMATS.length);
}

module.exports = { ALL_FORMATS, START_FAIL_BUDGET, selectFormats, startFailBudget };
