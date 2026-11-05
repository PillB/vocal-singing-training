/**
 * Fail the run when a test was skipped that is not on the reviewed list (QA-57).
 *
 * Playwright reports a skipped test as a success, and nothing in CI counted them. Six specs ended in `test.skip()` when
 * the page API they drive was missing (`if (!Modes?.get) return { skip: true }`): rename that function with its callers
 * and the tests turn into skips, green for ever, checking nothing. The guards are now assertions that name what is
 * missing; this reporter is the backstop for the next guard anyone writes. A skip is a test that checks nothing, so it
 * fails the run unless a reviewer accepted it here, with the reason.
 *
 * Registered in playwright.config.js, so it runs wherever the config's reporter does (the PR gate, the nightly sweeps).
 * A command line that names its own `--reporter` (the mutation sets use --reporter=dot) does not run it, by design:
 * a mutant is judged by whether a test fails, not by how many were skipped.
 */
"use strict";

/** Tests that are skipped by design. A new entry needs a reason a reviewer accepts; "the page API is missing" is never one. */
const ALLOWED = [
  { file: "live-pages.spec.js", title: /./, why: "describe.skip unless LIVE_PAGES=1: it visits the deployed pages, so it runs in its own nightly step" },
  { file: "auth.spec.js", title: /login success with secrets file/, why: "needs the generated secrets file, which exists only on the machine that generated it" },
  { file: "auth.spec.js", title: /tester account gets Pro without admin panel/, why: "needs the generated secrets file, which exists only on the machine that generated it" }
];

const isAllowed = (file, title) => ALLOWED.some((a) => a.file === file && a.title.test(title));

class NoSkips {
  constructor() {
    this.skipped = [];
  }

  onTestEnd(test, result) {
    if (result.status !== "skipped" && test.outcome() !== "skipped") return;
    const file = String(test.location.file).split(/[\\/]/).pop();
    if (!isAllowed(file, test.title)) this.skipped.push(`${file}: ${test.title}`);
  }

  onEnd() {
    if (!this.skipped.length) return undefined;
    process.stderr.write(`\nno-skips: ${this.skipped.length} test(s) skipped outside the reviewed list in qa/no-skips-reporter.cjs (a skip is a test that checks nothing):\n`);
    for (const s of this.skipped.slice(0, 40)) process.stderr.write(`  - ${s}\n`);
    return { status: "failed" };
  }
}

module.exports = NoSkips;
module.exports.ALLOWED = ALLOWED;
