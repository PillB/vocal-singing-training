/**
 * Mutation check: does the test suite notice a planted defect?
 *
 * Each mutant replaces one exact snippet of shipped code with a plausible bug,
 * runs the tests that are supposed to guard it, and restores the file. A test
 * suite that stays green on a mutant is not testing that behaviour, however
 * high its coverage. Ported from the QA thread's mutate.py (2026-11-01).
 *
 *   node qa/mutate.mjs            # the Node sets (audio, lint, coaching)
 *   node qa/mutate.mjs audio      # one set
 *   node qa/mutate.mjs stage a11y flows regress billing audit toast designs  # browser sets: need Playwright's Chromium
 *
 * Exit code 1 when any mutant survives or an anchor no longer matches (so a
 * refactor that moves the code cannot silently retire its mutant).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const AUDIO_TESTS = [
  "tests/node/audio-contract.test.mjs",
  "tests/node/audio-mutant-killers.test.mjs",
  "tests/node/hold-duration.test.mjs",
  "tests/node/attack-rise.test.mjs",
  "tests/node/sync-late-signin.test.mjs",
  "tests/node/envelope-killers.test.mjs"
];
const LINT_TESTS = ["qa/lint-gate.test.mjs", "tests/node/asset-versions.test.mjs", "tests/node/csp.test.mjs", "tests/node/env-noise.test.mjs", "tests/node/env-noise-killers.test.mjs", "tests/node/inline-script-pin.test.mjs", "tests/node/csp-pins.test.mjs", "tests/node/i18n-duplicate-keys.test.mjs", "tests/node/exercise-parity.test.mjs", "tests/node/playwright-projects.test.mjs"];
const PAGES = ["index.html", "guide.html", "privacy.html", "admin.html"];
const node = (tests) => [process.execPath, "--test", ...tests];
const PIANO_SPEC = [
  process.execPath,
  "node_modules/@playwright/test/cli.js",
  "test",
  "tests/production-contracts.spec.js",
  "--project=chromium",
  "--workers=2",
  "--reporter=dot",
  "-g",
  "expanded piano"
];
// The 15 s rule for a rated take, on a clock the test owns (production-contracts "short of 15 seconds").
const TAKE_SPEC = [...PIANO_SPEC.slice(0, -1), "short of 15 seconds"];
// QA-66. The tap-floor allowance for float32 geometry (tests/helpers/tap-floor.js), judged by its own spec.
const TAP_SPEC = [...PIANO_SPEC.slice(0, 3), "tests/tap-floor.spec.js", "--project=chromium", "--workers=2", "--reporter=dot"];
const FLOW_SPEC = [
  ...PIANO_SPEC.slice(0, 3),
  "tests/all-flows-robust.spec.js",
  "--project=chromium",
  "--workers=4",
  "--reporter=dot",
  "-g",
  "^.*(v1-diction|s9-pitch-match|s15-sh-air-ladder|s4-lip-trills): layout"
];

// QA-45. Every a11y mutant (A6 on) used to be judged by all six browser specs together, ~70 s each; 21 of them
// pushed the CI job past its 30 min limit. A mutant is now judged by the spec written to catch it, which is what
// AGENTS.md asks for anyway ("a test for every contract, a mutant for every test"). MUTATE_WIDE=1 (or --wide) puts
// the whole group back for the nightly run, so a mutant that dies of the wrong test, or a killer spec that
// stopped killing it, shows up there. A mutant with no entry here is a build error.
const A11Y_WIDE = ["tests/focus-not-obscured.spec.js", "tests/bottom-rail.spec.js", "tests/target-size.spec.js", "tests/toast-placement.spec.js", "tests/take-summary.spec.js", "tests/toast-and-h1-gaps.spec.js", "tests/toast-follows-view.spec.js"];
const A11Y_KILLER = {
  A6: "focus-not-obscured", A7: "bottom-rail", A8: "target-size",
  A9: "toast-placement", A10: "toast-placement", A11: "take-summary", A12: "take-summary", A13: "take-summary",
  A14: "toast-placement", A15: "toast-placement", A16: "toast-placement", A17: "toast-placement", A18: ["toast-and-h1-gaps", "toast-follows-view"],
  A19: "toast-and-h1-gaps", A20: "toast-and-h1-gaps", A22: "toast-placement", A23: "toast-placement", A24: "toast-placement",
  A25: "toast-and-h1-gaps", A26: "toast-and-h1-gaps", A27: "toast-and-h1-gaps",
  A28: "toast-and-h1-gaps", A29: "toast-and-h1-gaps", A30: "toast-and-h1-gaps",
  A31: "toast-placement", A32: "toast-placement", A33: "toast-placement", A34: "toast-placement"
};
export const WIDE = process.env.MUTATE_WIDE === "1" || process.argv.slice(2).includes("--wide");
function a11yKillers(name) {
  const id = name.split(" ")[0];
  if (!A11Y_KILLER[id]) throw new Error(`a11y mutant ${id} names no killer spec (A11Y_KILLER in qa/mutate.mjs)`);
  return WIDE ? A11Y_WIDE : [].concat(A11Y_KILLER[id]).map((k) => `tests/${k}.spec.js`);
}

export const MUTANTS = {
  coaching: [
    ["C1 the breath mode silently adds 2s when hold is omitted", "js/practice-modes.js", "this.state.holdSec = p.hold != null ? p.hold : 0;", "this.state.holdSec = p.hold != null ? p.hold : 2;"],
    ["C2 the exercise prescribes a 2s breath hold", "js/practice-profiles.js", "pattern: { in: 4, hold: 0, out: 6 },", "pattern: { in: 4, hold: 2, out: 6 },"],
    ["C3 an entire SH ladder is required for passing", "js/exercises-data.js", 'labelEs: "Peldaños cómodos (1 basta)", type: "number", target: 1, unit: ""', 'labelEs: "Peldaños cómodos (1 basta)", type: "number", target: 5, unit: ""'],
    ["C4 the first straw exercise asks for nasal humming", "js/exercises-data.js", "Phonate a soft /u/-like tone with lips gently sealed around the straw; let air exit through it, not through the nose.", "Hum through the straw and keep your lips sealed."],
    ["C5 starter straw dose is raised from 2 to 5 minutes", "js/exercises-data.js", 'labelEs: "Fonación cómoda con cañita (minutos)", type: "number", target: 2, unit: "min"', 'labelEs: "Fonación cómoda con cañita (minutos)", type: "number", target: 5, unit: "min"']
  ].map(([name, file, from, to]) => ({ name, file, from, to, cmd: node(["tests/node/technical-coaching.test.mjs"]) })),
  audio: [
    ["M1 YIN voicing threshold 0.18 -> 0.60 (noise accepted as pitch)", "js/pitch-visualizer.js", "if (cmnd[lag] < 0.18) {", "if (cmnd[lag] < 0.60) {"],
    ["M2 above-band alias guard dropped (1500 Hz read as 750)", "js/pitch-visualizer.js", "for (let shortLag = 2; shortLag < minLag; shortLag++) {", "for (let shortLag = 2; shortLag < 2; shortLag++) {"],
    ["M4 parabolic interpolation removed", "js/pitch-visualizer.js", "const freq = rate / (lag + offset);", "const freq = rate / lag;"],
    ["M5 silence gate removed", "js/pitch-visualizer.js", "if (Math.sqrt(power / n) < 0.01) return null;", ""],
    ["M6 +150c (adjacent semitone) accepted as in tune", "js/practice-modes.js", "const hi = this.profile.centsHi == null ? 50 : this.profile.centsHi;", "const hi = this.profile.centsHi == null ? 150 : this.profile.centsHi;"],
    ["M7 -140c accepted as in tune", "js/practice-modes.js", "const lo = this.profile.centsLo == null ? -40 : this.profile.centsLo;", "const lo = this.profile.centsLo == null ? -140 : this.profile.centsLo;"],
    ["M8 stale take may publish after a newer take", "js/practice-engine.js", "if (epoch !== this._recordingEpoch) return;", ""],
    ["M9 stale callback instead of take-bound callback", "js/practice-engine.js", "onReady?.({", "this.onRecordingReady?.({"],
    ["M10 mic tracks released while the recorder flushes", "js/practice-engine.js", "if (this.stream && !recorderStopping) {", "if (this.stream) {"],
    ["M11 empty take published", "js/practice-engine.js", "if (!chunks.length) return;", ""],
    ["M12 trill hold accrues at 2x (QA-09)", "js/practice-modes.js", "        this.state.acc += dt;", "        this.state.acc += dt * 2;"],
    ["M13 NoteGate hold accrues at 2x (every pitch-hold mode)", "js/scenes/pitch.js", "        this.acc += dt;\n        this.outMs = 0;", "        this.acc += dt * 2;\n        this.outMs = 0;"],
    ["M14 NoteGate counts the reference note's blank", "js/scenes/pitch.js", "        this.blank -= dt;\n        this.cents = null;\n        return false;", "        this.blank -= dt;"],
    ["M15 NoteGate band ignores its tolerance", "js/scenes/pitch.js", "      if (Math.abs(best.c) <= this.o.tol) {", "      if (Math.abs(best.c) <= this.o.tol * 2) {"],
    ["M16 s14 rise against the loudest moment again (CI red, PR #23)", "js/practice-modes.js", "      const rise = top != null && top > noise * 1.5 ? F.riseTime(seg, noise, top, rate, n) : null;", "      const rise = F.riseTime(seg, noise, peak, rate, n);"],
    ["M17 rise crossings rounded to 2,5 ms samples", "js/voice-features.js", "ms: ((at(i, hi) - at(i10, lo)) * 1000) / rate", "ms: ((i - i10) * 1000) / rate"],
    ["M18 attack level taken at the steepest step", "js/voice-features.js", "return seg[i - 1];", "return seg[steep];"],
    ["M19 hammer threshold doubled", "js/practice-modes.js", "run.riseMs <= 14;", "run.riseMs <= 28;"],
    ["M20 envelope counts each frame's time again, not its new audio", "js/voice-features.js", "const k = this._newSince(buf, est);", "const k = null;"],
    ["M21 audio lost inside an attack goes unnoticed", "js/voice-features.js", "return this._gaps.last(this._gaps.count).some((at) => at >= idx && at < to);", "return false;"],
    ["M23 a sign-in announced before sync.js loaded is never synced", "js/sync.js", "    if (global.VTAccount.getState?.().signedIn) schedule();\n", ""],
    ["M22 the first match in a periodic tail, not the nearest", "js/voice-features.js", "if (j === K && (best == null || Math.abs(k - est) < Math.abs(best - est))) best = k;", "if (j === K && best == null) best = k;"],
    ["M24 s12 ignores audio lost in the rise", "js/practice-modes.js", "return res.lost != null ? res.lost : st.maxDt > (st.bufMs || 43) + 6;", "return st.maxDt > (st.bufMs || 43) + 6;"],
    ["M25 lost audio after the note settled spoils the onset", "js/voice-features.js", "some((at) => at >= idx && at < to)", "some((at) => at >= idx)"],
    ["M26 lostSince: a gap exactly at the start no longer counts (QA-37 E2)", "js/voice-features.js", "some((at) => at >= idx && at < to)", "some((at) => at > idx && at < to)"],
    ["M27 lostSince: a gap exactly at the end now counts (QA-37 E3)", "js/voice-features.js", "some((at) => at >= idx && at < to)", "some((at) => at >= idx && at <= to)"],
    ["M28 a frame whose tail is nowhere in the buffer counts the frame time, not the whole buffer (QA-37 E6)", "js/voice-features.js", "return best == null ? N : best;", "return best == null ? 0 : best;"],
    ["M29 only the latest lost stretch is remembered (QA-37 E10)", "js/voice-features.js", "this._gaps = new Ring(16);", "this._gaps = new Ring(1);"],
    ["M30 a new take inherits the last take's lost audio (QA-37 E11)", "js/voice-features.js", "      this._gaps.clear();\n      this.total = 0;", "      this.total = 0;"]
  ].map(([name, file, from, to]) => ({ name, file, from, to, cmd: node(AUDIO_TESTS) })),
  lint: [
    ["L1 folders skipped by name again", "qa/lint-complexity.mjs", "if (!EXCLUDED_PATHS.has(name)) visit(name);", "if (!EXCLUDED_PATHS.has(name) && !/^(?:fixtures|geometry)$/.test(item.name)) visit(name);"],
    ["L2 .cjs not scanned", "qa/lint-complexity.mjs", "export const SCANNED = /\\.(?:js|mjs|cjs)$/;", "export const SCANNED = /\\.(?:js|mjs)$/;"],
    ["L3 prune blesses current debt", "qa/lint-complexity.mjs", "return baseline.filter((v) => !stale.has(v));", "return current;"],
    ["L4 baseline growth not checked", "qa/lint-complexity.mjs", "return surplus(next, prev);", "return [];"],
    ["L5 edited exemption kept", "qa/lint-complexity.mjs", "newDebt: surplus(current, baseline),", "newDebt: surplus(current, baseline).filter((v) => !baseline.some((b) => b.file === v.file && b.name === v.name)),"],
    ["L8 signature ignores multiplicity (QA-07)", "qa/lint-complexity.mjs", "      left.set(k, n - 1);\n", ""],
    ["L9 unresolvable --baseline-ref skips the check (QA-08)", "qa/lint-complexity.mjs", "    return null;\n  }\n  try {\n    return JSON.parse", "    return \"none\";\n  }\n  try {\n    return JSON.parse"],
    ["L10 empty --baseline-ref skips the check", "qa/lint-complexity.mjs", "if (args.includes(\"--baseline-ref\") && !ref) {", "if (false) {"],
    ["L6 misplaced wait options not flagged", "qa/lint-playwright-waits.mjs", "if (node.arguments.length !== 2) return false;", "if (node.arguments.length !== 99) return false;"],
    ["L11 an edited asset keeps its cached version", "qa/asset-versions.mjs", "else if (rec.sha !== hashOf(text) && rec.v === v) {", "else if (false) {"],
    ["L12 pages may disagree on an asset's version", "qa/asset-versions.mjs", "if (seen && seen.v !== v) problems.push", "if (false) problems.push"],
    ["L13 an inline script without its CSP hash passes", "tests/node/csp.test.mjs", "    if (!scripts.includes(sha256(body))) problems.push", "    if (false) problems.push"],
    ["L14 a failed load from any host is ignored (QA-14, QA-16 N1)", "qa/env-noise.cjs", "if (/Failed to load resource: net::ERR_FAILED\\b/.test(line)) return local && host === WORKER_HOST;", "if (/Failed to load resource: net::ERR_FAILED\\b/.test(line)) return true;"],
    ["L15 a failed load of the app's own file counts as offline noise", "qa/env-noise.cjs", "return host !== \"\" && !LOCAL_HOSTS.has(host) &&", "return host !== \"\" &&"],
    ["L17 a look-alike host counts as the worker (QA-16)", "qa/env-noise.cjs", "(host === WORKER_HOST || !host.includes(\"vocal-studio-entitlements\"))", "true"],
    ["L18 a CORS refusal from any host is ignored (QA-16)", "qa/env-noise.cjs", "if (refused) return local && hostOf(refused[1]) === WORKER_HOST;", "if (refused) return true;"],
    ["L23 the worker's refusal is noise for a deployed page too (red-team 9)", "qa/env-noise.cjs", "if (refused) return local && hostOf(refused[1]) === WORKER_HOST;", "if (refused) return hostOf(refused[1]) === WORKER_HOST;"],
    ["L24 a failed worker call is noise for a deployed page too (red-team 9)", "qa/env-noise.cjs", "return local && host === WORKER_HOST;", "return host === WORKER_HOST;"],
    ["L19 ERR_INTERNET_DISCONNECTED no longer counts as offline (QA-16 N3)", "qa/env-noise.cjs", "NAME_NOT_RESOLVED|INTERNET_DISCONNECTED", "NAME_NOT_RESOLVED"],
    ["L20 every page loses its frame-src (blank sign-in button; QA-17)", PAGES, " frame-src https://accounts.google.com/gsi/;", ""],
    ["L21 every page loses media-src blob: (a recorded take cannot play; QA-17)", PAGES, "media-src 'self' blob:;", "media-src 'self';"],
    ["L22 script-src gains another host on every page (QA-18)", PAGES, "script-src 'self' ", "script-src 'self' https://cdnjs.cloudflare.com "],
    ["L16 any inline script may ride on its CSP hash (QA-15)", "tests/node/inline-script-pin.test.mjs", "const unlisted = (html) => inlineScripts(html).filter((b) => !ALLOWED_INLINE.has(b));", "const unlisted = (html) => inlineScripts(html).filter(() => false);"],
    ["L25 a string key written twice in one table: the later wins silently (red-team 1)", "js/i18n.js", '      "rate.takeSum": "Esta toma:",\n', '      "rate.takeSum": "Esta toma:",\n      "rate.takeSum": "Tu grabación",\n', ["tests/node/i18n-duplicate-keys.test.mjs"]],
    ["L27 a PR-gate spec whose name ends like a sweep's is dropped from the gate (FAL-09)", "playwright.config.js", "const SWEEP_SPECS =\n  /[\\\\/](?:click-ui-formats", "const SWEEP_SPECS =\n  /(?:click-ui-formats"],
    ["L28 the English pace drill asks for one key idea again, against three anchors (red-team 4e)", "js/exercises-data.js", "Pick a message of about 90 s with 3 key ideas.", "Pick a message of about 90 s with one key idea.", ["tests/node/exercise-parity.test.mjs"]],
    ["L29 the Spanish pace drill asks for one key idea again, against three anchors (red-team 4e)", "js/exercises-locale-es.js", "Elige un mensaje de ~90 s con 3 ideas clave.", "Elige un mensaje de ~90 s con una idea clave.", ["tests/node/exercise-parity.test.mjs"]],
    ["L30 the Spanish pace drill puts one brake before the idea again, not before each (red-team 4e)", "js/exercises-locale-es.js", "pon un «freno» (una pausa) antes de cada idea clave y luego ralentiza.", "marca 2 “frenos” intencionales antes de la idea clave.", ["tests/node/exercise-parity.test.mjs"]],
    ["L31 the pace mode scores four anchors while the steps ask for three (red-team 4e)", "js/practice-profiles.js", "      keyPoints: 3,\n      minPauseSec: 0.7,", "      keyPoints: 4,\n      minPauseSec: 0.7,", ["tests/node/exercise-parity.test.mjs"]],
    ["L32 the no-skips reporter never fails the run (QA-57)", "qa/no-skips-reporter.cjs", 'return { status: "failed" };', "return undefined;", ["tests/node/no-skips-reporter.test.mjs"]],
    ["L33 an allow-list entry excuses every test of its file, not the one named (QA-57)", "qa/no-skips-reporter.cjs", "a.file === file && a.title.test(title)", "a.file === file", ["tests/node/no-skips-reporter.test.mjs"]],
    ["L34 a skip is read from the attempt's status only (QA-57)", "qa/no-skips-reporter.cjs", 'if (result.status !== "skipped" && test.outcome() !== "skipped") return;', 'if (result.status !== "skipped") return;', ["tests/node/no-skips-reporter.test.mjs"]],
    ["L35 no skip is ever seen (QA-57)", "qa/no-skips-reporter.cjs", 'if (result.status !== "skipped" && test.outcome() !== "skipped") return;', "if (true) return;", ["tests/node/no-skips-reporter.test.mjs"]],
    ["L36 the allow-list excuses a test because the page API it drives is missing (QA-57)", "qa/no-skips-reporter.cjs", "const ALLOWED = [\n", 'const ALLOWED = [\n  { file: "i18n-copy.spec.js", title: /./, why: "the page API is missing, so the test cannot run it" },\n', ["tests/node/no-skips-reporter.test.mjs"]],
    ["L37 the no-skips reporter is written and never registered (QA-57)", "playwright.config.js", 'reporter: [["list"], ["./qa/no-skips-reporter.cjs"]],', 'reporter: [["list"]],', ["tests/node/no-skips-reporter.test.mjs"]],
    ["L38 the sloppy voice's slide is back on the detector's line, 0,4 s measuring 0,26 s against 0,25 (CI flake: one run in twelve never saw it)", "qa/voices/dynamics.js", "const SLIDE_SEC = 0.7;", "const SLIDE_SEC = 0.4;", ["tests/node/slide-detect.test.mjs"]],
    ["L39 the slide line is raised so that a real slide of 0,7 s is missed", "js/practice-modes.js", "arrive - leave > 0.25", "arrive - leave > 0.6", ["tests/node/slide-detect.test.mjs"]],
    ["L40 the slide line is lowered so that an easy change of note counts as a slide", "js/practice-modes.js", "arrive - leave > 0.25", "arrive - leave > 0.03", ["tests/node/slide-detect.test.mjs"]],
    ["L41 a step that took long enough is never recorded as a slide", "js/practice-modes.js", "steps.push({ A, B, leave, arrive })", "void 0", ["tests/node/slide-detect.test.mjs"]],
    ["L42 a wider connect-src written first: the browser enforces it, both CSP gates read the later, narrower one (QA-68)","index.html","connect-src ","connect-src *; connect-src ",["tests/node/csp-effective-policy.test.mjs"]],
    ["L26 an English drill loses its fifth step: two languages, two drills (QA-34)", "js/exercises-data.js", '        "Then tell a 60 s story using at least 3 levels, on purpose.",\n        "Keep the same clarity and diction at every level."\n      ],', '        "Then tell a 60 s story using at least 3 levels, on purpose."\n      ],', ["tests/node/exercise-parity.test.mjs"]],
    ["L7 empty wait-may-fail reason accepted", "qa/lint-playwright-waits.mjs", "/wait-may-fail:\\s*\\S/", "/wait-may-fail:/"]
  // A mutant that edits a hashed asset (js/css) turns "every versioned asset matches its recorded content" red whatever
  // else is wrong, so it names the one test it is meant to be judged by (red-team: L25 and L26 were killed by the manifest).
  ].map(([name, file, from, to, only]) => ({ name, file, from, to, cmd: node(only || LINT_TESTS) })),
  // The open piano and the sticky stage (production-contracts "expanded piano").
  stage: [
    ["S1 opened panel never scrolled into view", "js/app.js", "revealBelowStickyRows(block, scrollBehavior());", ""],
    ["S2 focus in the panel may stay under the stage", "js/app.js", '$("#piano-block")?.addEventListener("focusin", (e) => revealBelowStickyRows(e.target));', ""],
    ["S3 stage never shrinks or steps aside for the panel", "js/app.js", "const unstick = open && room < stageFloor(stage);", "const unstick = false; room = Infinity;"],
    ["S4 long song list scrolls inside the panel again", "css/styles.css", ".piano-inline.is-open.is-settled {\n  max-height: none;", ".piano-inline.is-open.is-settled {\n  max-height: 420px;"],
    ["S6 a share of the screen as the floor again (64px of lanes on a phone)", "js/app.js", "return Math.max(260, Math.ceil(railT + railH + Math.max(MIN_LANES_PX, shown ? panel.scrollHeight : 0)));", "return Math.max(260, Math.round(innerHeight * 0.45));"],
    ["S5 the stage stays sticky over a panel it cannot sit beside", "css/styles.css", ".game-stage.piano-unstick .highway-stage {\n  position: relative;", ".game-stage.piano-unstick .highway-stage {\n  position: sticky;"],
    ["S7 a take of 14,999 s is long enough to rate (the line moved a tick down)", "js/app.js", "const RATED_MIN_TAKE_SEC = 15;", "const RATED_MIN_TAKE_SEC = 14;", TAKE_SPEC],
    ["S8 a take of exactly 15 s is not long enough to rate (the line moved a tick up)", "js/app.js", "if (state.sessionPractice.everStarted && practiced >= required) return true;", "if (state.sessionPractice.everStarted && practiced > required) return true;", TAKE_SPEC],
    ["S9 the tap-floor allowance is zero again: a 44 px box 43,99999 mid hover lift is too small (QA-66, CI red on be702cf)", "tests/helpers/tap-floor.js", "const TAP_FLOOR_EPSILON = 0.05;", "const TAP_FLOOR_EPSILON = 0;", TAP_SPEC],
    ["S10 the tap-floor allowance is 0,6 px: a 43,5 px control clears the 44 px floor (QA-66)", "tests/helpers/tap-floor.js", "const TAP_FLOOR_EPSILON = 0.05;", "const TAP_FLOOR_EPSILON = 0.6;", TAP_SPEC],
    ["S11 the tap-floor allowance is a whole pixel: a 43 px control clears the 44 px floor (QA-66)", "tests/helpers/tap-floor.js", "const TAP_FLOOR_EPSILON = 0.05;", "const TAP_FLOOR_EPSILON = 1;", TAP_SPEC]
  ].map(([name, file, from, to, cmd]) => ({ name, file, from, to, cmd: cmd || PIANO_SPEC })),
  // Accessibility contracts that only a browser can see.
  a11y: [
    ["A1 the narrow-phone header removes the page's h1 (QA-04)", "css/styles.css", "  body .app-header:has(#btn-more) .brand {\n    position: absolute;", "  body .app-header:has(#btn-more) .brand {\n    display: none;"],
    ["A2 privacy's English half read with Spanish rules", "privacy.html", '<section lang="en" aria-labelledby="en">', '<section aria-labelledby="en">'],
    ["A3 privacy's English title a second h1 again", "privacy.html", '<h2 id="en" class="part-title">Privacy (English)</h2>', '<h1 id="en" class="part-title">Privacy (English)</h1>'],
    ["A4 the phone rule empties privacy's header", "privacy.html", "      body:not(.view-exercise) .app-header .brand .brand-name {\n        display: block;\n      }\n", ""],
    ["A5 privacy's English link lands under the header", "privacy.html", "        scroll-margin-top: 6.5rem;\n", ""]
  ]
    .map(([name, file, from, to]) => ({ name, file, from, to, specs: ["tests/home-design.spec.js", "tests/page-headings.spec.js", "-g", "one h1"] }))
    .concat(
      [
        ["A6 Tab leaves focus under the sticky rows (WCAG 2.4.11)", "css/styles.css", "html:has(body.view-exercise) {\n  scroll-padding-top", "html:has(body.view-exercise-off) {\n  scroll-padding-top"],
        ["A7 the bottom rail cannot wrap again (v12's mic box crushed)", "css/styles.css", "  flex-wrap: wrap;\n  align-items: center;\n  gap: 0.45rem;\n  max-height: none;", "  flex-wrap: nowrap;\n  align-items: center;\n  gap: 0.45rem;\n  max-height: none;"],
        ["A8 \"Reto\" back to a 13 px target", "css/styles.css", "  min-height: 24px;\n  font-size: 0.68rem;", "  font-size: 0.68rem;"],
        ["A9 the Stop toast centred over ← Back again", "js/app.js", "    placeToast(el);\n", ""],
        ["A10 a two-line toast taller than the desktop row (CI's wider font)", "css/styles.css", "  padding: 0.15rem 0.75rem;\n  border-radius: 14px;\n  font-size: 0.8rem;\n  line-height: 1.2;", "  padding: 0.25rem 0.75rem;\n  border-radius: 14px;\n  font-size: 0.8rem;\n  line-height: 1.25;"],
        // Round-4 red team: the take's summary and a toast that follows the page
        ["A11 the take's summary introduced as the recording again (\"Tu grabación Sin ritmo…\")", "js/app.js", 'el.textContent = summary ? `${tt("rate.takeSum")} ${summary}` : "";', 'el.textContent = summary ? `${tt("rate.take")} ${summary}` : "";'],
        ["A12 a new take leaves the last take's numbers on the card", "js/app.js", "      clearTakeSummary();\n    }\n    paintPracticeControls(live);", "    }\n    paintPracticeControls(live);"],
        ["A13 a take ended without the Stop announcement keeps the last take's numbers", "js/app.js", "    state.rate.summary = modeResult?.summary || null;\n    if (!silent) announceStop(modeResult);", "    if (!silent) state.rate.summary = modeResult?.summary || null;\n    if (!silent) announceStop(modeResult);"],
        ["A14 a toast is placed once and never again", "js/app.js", "    watchToastPlace();\n    const span", "    const span"],
        ["A15 no 2,8 s floor: a short message goes in under 2 s", "js/app.js", "Math.max(2800, 1500 + text.length * 50)", "Math.max(0, 1500 + text.length * 50)"],
        ["A16 the title stays hidden after the toast has gone", "js/app.js", '    $("#toast")?.classList.remove("show");\n    $(".exercise-header-compact")?.classList.remove("toast-over");', '    $("#toast")?.classList.remove("show");'],
        ["A17 a shown toast ignores the window turning", "js/app.js", '    window.addEventListener("resize", again);\n', ""],
        ["A18 a shown toast ignores the view changing under it", "js/app.js", '    new MutationObserver(again).observe(document.body, { attributes: true, attributeFilter: ["class"] });\n', ""],
        // Round-4 part B (QA UIA-01 to UIA-07)
        ["A19 the toast squeezed into a gap under 120 px, or left on Help (UIA-01)", "js/app.js", "const TOAST_MIN_ROOM = 120;", "const TOAST_MIN_ROOM = 0;"],
        ["A20 with no room the toast stands on the row, not under it (UIA-01)", "js/app.js", "if (span) el.style.top = `${Math.round(span.r.bottom + 4)}px`;", "if (span) el.style.top = `${Math.round(span.r.top)}px`;"],
        ["A22 a toast placed mid-animation stays 2 to 6 px off (UIA-06)", "js/app.js", '    document.addEventListener("animationend", again, true);\n', ""],
        ["A23 a faded toast keeps its message in the accessibility tree (UIA-07)", "js/app.js", '      if (el && !el.classList.contains("show")) el.textContent = "";', ""],
        ["A24 an earlier toast's clearing timer wipes a message raised after it (UIA-07)", "js/app.js", '      if (el && !el.classList.contains("show")) el.textContent = "";', '      if (el) el.textContent = "";'],
        ["A25 the landscape exercise has no h1 in the accessibility tree again (UIA-04)", "css/styles.css", "  body.view-exercise .app-header .brand h1 {\n    visibility: visible;", "  body.view-exercise .app-header .brand h1 {\n    visibility: hidden;"],
        ["A26 the hidden landscape header still counts 40 px in the sticky offsets (UIA-04)", "js/app.js", 'cs.display === "none" || cs.position === "absolute" ? 0', 'cs.display === "none" ? 0'],
        ["A27 the brand is hidden from 360 px, not 374 px (UIA-05)", "css/styles.css", "@media (max-width: 374px) {\n  /* Below 375px the row cannot hold", "@media (max-width: 360px) {\n  /* Below 375px the row cannot hold"],
        // Round 4e: UIA-01 at its edge, judged by the span sweep in toast-and-h1-gaps
        ["A28 the toast under the row stands 60 px down, not 4 (UIA-01)", "js/app.js", "if (span) el.style.top = `${Math.round(span.r.bottom + 4)}px`;", "if (span) el.style.top = `${Math.round(span.r.bottom + 60)}px`;"],
        ["A29 the toast squeezed into a span of 100 px (UIA-01)", "js/app.js", "const TOAST_MIN_ROOM = 120;", "const TOAST_MIN_ROOM = 100;"],
        ["A30 the toast leaves the row while a span of 120 to 139 px would still hold it (UIA-01)", "js/app.js", "const TOAST_MIN_ROOM = 120;", "const TOAST_MIN_ROOM = 140;"],
        // Round 4e: a message that two lines would cut stands under the row, whole
        ["A31 any message may be cut to two lines in the row, not only the take's summary", "js/app.js", 'if (cut && !el.classList.contains("toast-kept")) return false;', "if (false) return false;"],
        ["A32 the take's summary is not marked as kept, so a long one leaves the row", "js/app.js", 'tt("toast.stopped"), { kept: !!summary });', 'tt("toast.stopped"));'],
        ["A33 a wrapped toast has the 999 px pill corners again", "css/styles.css", "  border-radius: 1.4rem;\n  box-shadow: var(--shadow);", "  border-radius: 999px;\n  box-shadow: var(--shadow);"],
        ["A34 a summary's kept flag outlives it: the next message is cut too", "js/app.js", 'el.classList.toggle("toast-kept", !!opts.kept);', 'if (opts.kept) el.classList.add("toast-kept");']
      ].map(([name, file, from, to]) => ({
        name,
        file,
        from,
        to,
        specs: [...a11yKillers(name), "--workers=4"]
      }))
    )
    .map(({ specs, ...m }) => ({ ...m, cmd: [...PIANO_SPEC.slice(0, 3), ...specs, "--project=chromium", "--reporter=dot"] })),
  // The forensic audit's own probes: a wrong instrument fills the ledger with noise or hides defects.
  audit: [
    ["AU1 a label no longer counts as its control's target", "qa/audit/page-probes.js", "return ![...(el.labels || [])].some((l) => visible(l) && !tooSmall(l.getBoundingClientRect()));", "return true;"],
    ["AU2 any label excuses a small box", "qa/audit/page-probes.js", ".some((l) => visible(l) && !tooSmall(l.getBoundingClientRect()))", ".some((l) => visible(l))"],
    ["AU3 a checkbox named by its value again", "qa/audit/page-probes.js", 'const own = el.labels && el.labels.length ? el.labels[0].innerText : "";', 'const own = "";'],
    ["AU5 a screen-reader-only live region counted as clipped text", "qa/audit/page-probes.js", "if (r.width <= 1 || r.height <= 1) return false;", "if (r.width < 1 || r.height < 1) return false;"],
    ["AU4 a covered control reported as itself", "qa/audit/page-probes.js", '    return (top.id ? "#" + top.id : top.tagName.toLowerCase()) + "." + String(top.className || "").split(" ")[0];\n  }', '    return "self";\n  }']
  ].map(([name, file, from, to]) => ({
    name,
    file,
    from,
    to,
    cmd: [...PIANO_SPEC.slice(0, 3), "tests/audit-probes.spec.js", "--project=chromium", "--reporter=dot"]
  })).concat([
    {
      name: "AU7 an exempt mode's crashed run is dropped with its exemption (red-team 5, 11)",
      file: "qa/audit/analyze-audit.mjs",
      from: '    if (it.failure) out.push(["start/stop", `iteration ${n} (${how}) threw: ${it.failure}`]);\n    if (!NO_TAKE.has(rec.mode)) takeIssues(it, how, out);',
      to: '    if (NO_TAKE.has(rec.mode)) continue;\n    if (it.failure) out.push(["start/stop", `iteration ${n} (${how}) threw: ${it.failure}`]);\n    takeIssues(it, how, out);',
      cmd: node(["tests/node/analyze-audit.test.mjs"])
    },
    {
      name: "AU9 concisionGate's crashed boundary run is dropped with its exemption (red-team 5, 11)",
      file: "qa/audit/analyze-audit.mjs",
      from: '  if (it.failure) out.push(["quiet", `boundary run threw: ${it.failure}`]);\n  for (const run of [it.silent, it.noise].filter(Boolean)) {',
      to: '  if (QUIET_COUNTS_BY_DESIGN[rec.mode]) return;\n  if (it.failure) out.push(["quiet", `boundary run threw: ${it.failure}`]);\n  for (const run of [it.silent, it.noise].filter(Boolean)) {',
      cmd: node(["tests/node/analyze-audit.test.mjs"])
    },
    {
      name: "AU8 the ledger ignores that the page under test is a deployed one (red-team 9)",
      file: "qa/audit/analyze-audit.mjs",
      from: "const local = rec.local !== false;",
      to: "const local = true;",
      cmd: node(["tests/node/analyze-audit.test.mjs"])
    },
    ...[
      ["AU10 the small-target rule is off (FAL-03)", 'if (c.small && !c.disabled) out.push(["layout"', 'if (false && c.small && !c.disabled) out.push(["layout"'],
      ["AU11 the contrast check is dropped (FAL-03)", "  checkContrast(where, inv.rows || [], out);\n", ""],
      ["AU12 the clipped-text rule is dropped (FAL-03)", 'for (const t of inv.overlaps?.clipped || []) out.push(["layout", `${where}: clipped text "${t}"`]);', ""],
      ["AU13 the control-overlap rule is dropped (FAL-03)", 'for (const [a, b] of inv.overlaps?.controls || []) out.push(["layout", `${where}: controls overlap: "${a}" × "${b}"`]);', ""],
      ["AU14 large text needs 1:1 (FAL-03)", "t.font >= 24 ? 3 : 4.5", "t.font >= 24 ? 1 : 4.5"],
      ["AU15 the covered-Tab-stop rule is dropped (FAL-03)", 'if (f.obscured) out.push(["focus"', 'if (false && f.obscured) out.push(["focus"'],
      ["AU16 a mic left live after Stop is not reported (FAL-03)", "it.gum.live > 0 && it.stopped", "it.gum.live > 99 && it.stopped"],
      ["AU17 the replay check is dropped (FAL-03)", "  checkReplay(rec, out);\n", ""],
      ["AU18 the phone layout is not checked (FAL-03)", '  checkLayout("phone", rec.iterations?.[5]?.inventory, out);\n', ""],
      ["AU19 the keyboard take is not checked (FAL-03)", '[[1, "mouse"], [2, "keyboard"]]', '[[1, "mouse"]]'],
      ["AU20 a thrown phone run is not reported (FAL-03)", 'if (rec.iterations?.[5]?.failure) out.push(["start/stop", `phone run threw: ${rec.iterations[5].failure}`]);', ""],
      ["AU21 the noise run is not examined (FAL-03)", "for (const run of [it.silent, it.noise].filter(Boolean)) {", "for (const run of [it.silent].filter(Boolean)) {"],
      ["AU22 Stay in the leave prompt is not checked (FAL-03)", 'if (it.afterStay && it.afterStay.view !== "view-exercise") out.push(["leave", "Stay in the leave prompt did not keep the exercise"]);', ""],
      ["AU23 counts in the status line are not counted (FAL-04)", 'const COUNT_FIELDS = ["focus", "hud", "status", "pitch"];', 'const COUNT_FIELDS = ["focus", "hud", "pitch"];'],
      ["AU24 a count that rose and fell back is not a rise (FAL-04)", "for (const t of ticks.slice(1)) {", "for (const t of ticks.slice(-1)) {"],
      ["AU25 '3 sílabas' is read as seconds, not a count (FAL-04)", "const NOT_WORD = String.raw`(?![\\p{L}\\d])`;", "const NOT_WORD = String.raw`\\b`;"],
      ["AU26 a count that first appears on silence began at 99, not 0 (FAL-04)", "(high.get(k) ?? first.get(k) ?? 0)", "(high.get(k) ?? first.get(k) ?? 99)"],
      ["AU27 a mic left on at the plan page is not a finding (FAL-04)", "if (!NO_TAKE.has(rec.mode)) checkLeave(it, out);\n  const live = (g) => g?.live || 0;", "if (NO_TAKE.has(rec.mode)) return;\n  checkLeave(it, out);\n  const live = (g) => g?.live || 0;"],
      ["AU28 the concision gate's exemption covers the noise run too (FAL-05)", "if (QUIET_COUNTS_BY_DESIGN[rec.mode] && run === it.silent) continue;", "if (QUIET_COUNTS_BY_DESIGN[rec.mode]) continue;"],
      ["AU29 one more mode has no take to start (FAL-05)", 'new Set(["weekPlan"])', 'new Set(["weekPlan", "rhythmEcho"])'],
      ["AU30 one more mode may count on silence (FAL-05)", 'concisionGate: "the gate opens', 'rhythmEcho: "x",\n  concisionGate: "the gate opens'],
      // Round 4e: what a learner reads that is not a count (note names, cents, decimals, units, ranges, case) and the plan page's throw
      ["AU31 a note name with its octave is a count (round 4e)", "(?:[A-G]|Do|Re|Mi|Fa|Sol|La|Si)[#b♯♭]?-?", "(?:Z)[#b♯♭]?-?"],
      ["AU32 a solfège note name is a count (round 4e)", "|Do|Re|Mi|Fa|Sol|La|Si)", ")"],
      ["AU33 a sharp or a flat note name is a count (round 4e)", "[#b♯♭]?-?", "-?"],
      ["AU34 a bare +offset is a count (round 4e)", "[+\\-−±]", "[\\-−±]"],
      ["AU50 a bare -offset (hyphen) is a count (round 4e)", "[+\\-−±]", "[+−±]"],
      ["AU51 a bare −offset (minus sign) is a count (round 4e)", "[+\\-−±]", "[+\\-±]"],
      ["AU52 a bare ±offset is a count (round 4e)", "[+\\-−±]", "[+\\-−]"],
      ["AU35 a decimal percentage is a count (round 4e)", "`${NUM}\\\\s?%`", "`\\\\d+\\\\s?%`"],
      ["AU36 milliseconds and minutes are counts (round 4e)", "ms|min|kHz", "kHz"],
      ["AU37 hertz is a count (round 4e)", "kHz|Hz|", "kHz|"],
      ["AU38 beats per minute is a count (round 4e)", "bpm|BPM|", ""],
      ["AU39 decibels are a count (round 4e)", "|dB|s|h|", "|s|h|"],
      ["AU40 the number after DEL and AL is a count (round 4e)", '"del", "al", ', ""],
      ["AU41 the number after 'de' is a count (round 4e)", '"de", "a", ', '"a", '],
      ["AU42 the number after 'a' is a count (round 4e)", '"de", "a", ', '"de", '],
      ["AU43 the number after 'to' and 'from' is a count (round 4e)", '"to", "from", ', ""],
      ["AU44 the number after 'hasta', 'of' and 'entre' is a count (round 4e)", '"hasta", "of", "entre", ', ""],
      ["AU45 the number after 'y' and 'and' is a count (round 4e)", '"y", "and", ', ""],
      ["AU46 the number after 'at', 'en' and 'in' is a count (round 4e)", '"at", "en", "in"', ""],
      ["AU47 a count in another case is another count (round 4e)", "const word = m[1].toLowerCase();", "const word = m[1];"],
      ["AU48 a thousands separator splits a count in two (round 4e)", '\n      .replace(THOUSANDS, (n) => n.replace(/\\D/g, ""));', ";"],
      ["AU49 a thrown interruption run is not reported (round 4e)", 'if (it.failure) out.push(["leave", `interruption run threw: ${it.failure}`]);\n  // The plan page', "// The plan page"],
    // QA round 9: eleven survivors of the audit ledger, killed by tests/node/analyze-audit-r9.test.mjs
      ["AU53 large text begins above 24 px, not at it (X1)","t.font >= 24","t.font > 24"],
      ["AU54 text whose contrast could not be measured is judged as 0:1 (X2)","x.kind === \"text\" && x.inView && x.contrast != null","x.kind === \"text\" && x.inView"],
      ["AU55 a control whose centre is off the window counts as covered (X3)","c.hit !== \"self\" && c.hit !== \"offscreen\"","c.hit !== \"self\""],
      ["AU56 a percentage written 'N %' is a count (X4)","`${NUM}\\\\s?%`","`${NUM}%`"],
      ["AU57 only the dot is a thousands separator (X5)","(?:[.,\\u202f\\u00a0]\\d{3})+","(?:[.]\\d{3})+"],
      ["AU58 an uncaught exception during the phone run is ignored (X6)","...(rec.iterations?.[5]?.errors || [])",""],
      ["AU59 folded and aria-hidden controls are judged (X7)","x.kind === \"control\" && x.inView && !x.fold","x.kind === \"control\" && x.inView"],
      ["AU60 a take whose only moving line is the cue is 'nothing changed' (X8)","[\"focus\", \"hud\", \"status\", \"pitch\", \"cue\"]","[\"focus\", \"hud\", \"status\", \"pitch\"]"],
      ["AU61 focus resting on the page itself is a stop without a ring (X9)","if (f.id === \"body\") continue;",""],
      ["AU62 a clock past ten minutes is a count (X10)","String.raw`\\d+:\\d\\d`","String.raw`\\d:\\d\\d`"],
      ["AU63 '1 cent' is not a quantity with a unit (X11)","s|h|¢|cents?)${NOT_WORD}","s|h|¢|cents)${NOT_WORD}"]
    ].map(([name, from, to]) => ({
      name,
      file: "qa/audit/analyze-audit.mjs",
      from,
      to,
      cmd: node(["tests/node/analyze-audit.test.mjs", "tests/node/analyze-audit-gaps.test.mjs", "tests/node/analyze-audit-r9.test.mjs"])
    })),
    {
      name: "AU6 the ledger hides every failed load as environment noise (QA-14)",
      file: "qa/audit/analyze-audit.mjs",
      from: 'if (!isEnvNoise(e.replace(/^console: /, ""), { local }))',
      to: 'if (!/Failed to load resource|CORS/.test(e))',
      cmd: node(["tests/node/analyze-audit.test.mjs"])
    }
  ]),
  // The per-exercise flow test (QA-10: FM2, FM4 and FM5 survived it before).
  flows: [
    ["FM1 Start does nothing", "js/app.js", '$("#btn-practice-start")?.addEventListener("click", startPractice);', '$("#btn-practice-start")?.addEventListener("click", () => {});'],
    ["FM2 the first Start click is swallowed", "js/app.js", '$("#btn-practice-start")?.addEventListener("click", startPractice);', '{ let n = 0; $("#btn-practice-start")?.addEventListener("click", () => { if (++n > 1) startPractice(); }); }'],
    ["FM3 Stop does nothing", "js/app.js", '$("#btn-practice-stop")?.addEventListener("click", () => stopPractice(false));', '$("#btn-practice-stop")?.addEventListener("click", () => {});'],
    ["FM4 an uncaught exception on every Start", "js/app.js", "async function startPractice() {\n    const ex = state.exercise;", 'async function startPractice() {\n    setTimeout(() => { throw new Error("planted"); }, 0);\n    const ex = state.exercise;'],
    ["FM5 the mic slider is disconnected", "js/app.js", "const applyMicSens = (raw) => {\n", "const applyMicSens = (raw) => {\n      if (micRange?.dataset.ready) return;\n      if (micRange) micRange.dataset.ready = '1';\n"]
  ].map(([name, file, from, to]) => ({ name, file, from, to, cmd: FLOW_SPEC })),
  // Round 4 in the browser: storage of the wrong kind, a full or refused storage, the learner's day, the rail on a
  // phone on its side, the consent bar. A set of its own so that no CI job outgrows its 30 minutes (QA-45).
  regress: [].concat(
    // Round-4 part C: valid JSON of the wrong kind in storage, and the learner's own day
    [
      ["C1 a stored value of another kind (null, 42, an array) is used as it is (QA-35)", "js/storage.js", "return kindOf(value) === kindOf(fallback === null ? {} : fallback) ? value : fallback;", "return value;"],
      ["C2 a stored event log of another kind is used as it is (QA-35)", "js/analytics.js", 'if (bag && typeof bag === "object" && Array.isArray(bag.events)) return bag;', "if (bag) return bag;"],
      ["C3 the export is named for the UTC day again (QA-36)", "js/app.js", "const day = dayKeyLocal();", "const day = new Date().toISOString().slice(0, 10);"],
      ["C4 the metronome-speech deck turns over at UTC midnight again (QA-36)", "js/practice-modes.js", "const day = Math.floor(Date.parse(`${dayKey}T00:00:00Z`) / 86400000);", "const day = Math.floor(Date.now() / 86400000);"],
      ["C17 the coach summary .txt is named for the UTC day again, beside a JSON named for the learner's (QA-36)", "js/app.js", "at.download = `vocal-studio-coach-summary-${day}.txt`;", "at.download = `vocal-studio-coach-summary-${new Date().toISOString().slice(0, 10)}.txt`;"],
      // QA-44: an object is not yet a session; the fields the callers dereference must be there
      ["C13 a stored session with no order array is used (QA-44)", "js/session.js", "!Array.isArray(s.order) || !Number.isFinite(s.index)", "!Number.isFinite(s.index)"],
      ["C14 a stored session with no numeric index is used (QA-44)", "js/session.js", "!Array.isArray(s.order) || !Number.isFinite(s.index)", "!Array.isArray(s.order)"],
      ["C15 a stored session without completedIds throws on the next step (QA-44)", "js/session.js", "    if (!Array.isArray(s.completedIds)) s.completedIds = [];\n", ""],
      ["C16 the session reader hands back whatever is stored (QA-44)", "js/session.js", "return usable(global.VTStorage.getSession());", "return global.VTStorage.getSession();"]
    ].map(([name, file, from, to]) => ({
      name,
      file,
      from,
      to,
      cmd: [...PIANO_SPEC.slice(0, 3), "tests/corrupt-storage.spec.js", "tests/analytics-reader.spec.js", "tests/local-day.spec.js", "--project=chromium", "--workers=4", "--reporter=dot"]
    }))
  ).concat(
    // QA-47: a browser that refuses writes must not stop the app, and must tell the learner
    [
      ["C5 a refused write throws out of init again (QA-47)", "js/storage.js", "      unsaved.set(key, raw);\n      noteUnsaved();", '      throw new Error("quota");'],
      ["C6 the kept copy of a refused value is never read (QA-47)", "js/storage.js", "const raw = unsaved.has(key) ? unsaved.get(key) : localStorage.getItem(key);", "const raw = localStorage.getItem(key);"],
      ["C7 removing a session leaves the kept copy behind (QA-47)", "js/storage.js", "  function remove(key) {\n    unsaved.delete(key);\n", "  function remove(key) {\n"],
      ["C8 a write the browser accepts again leaves a stale kept copy in front of it (QA-47)", "js/storage.js", "      localStorage.setItem(key, raw);\n      unsaved.delete(key);", "      localStorage.setItem(key, raw);"],
      ["C9 the learner is never told that nothing will be saved (QA-47)", "js/storage.js", '      global.dispatchEvent(new CustomEvent("vt:storage-unsaved"));', ""],
      ["C10 the notice repeats on every refused write (QA-47)", "js/storage.js", "    if (unsavedAnnounced) return;\n", ""],
      ["C11 a refusal during init (before the app listens) is never announced (QA-47)", "js/app.js", "    if (window.VTStorage?.isUnsaved?.()) say();\n", ""],
      ["C12 the page does not say it is running from memory (QA-47)", "js/storage.js", '      global.document.documentElement.dataset.storage = "memory";', ""]
    ].map(([name, file, from, to]) => ({
      name,
      file,
      from,
      to,
      cmd: [...PIANO_SPEC.slice(0, 3), "tests/storage-full.spec.js", "--project=chromium", "--workers=4", "--reporter=dot"]
    }))
  ).concat(
    // QA round 9 (storage): the wrong kind inside a right container, storage switched off rather than full, the cap's
    // direction, and the learner's day across DST and month edges. Each mutant is judged by the spec written for it.
    [
      ["C18 a list stored where a bag belongs (or the reverse) is accepted: kindOf loses the array kind (S1)","js/storage.js","return Array.isArray(value) ? \"array\" : typeof value;","return typeof value;","tests/storage-kinds.spec.js"],
      ["C19 a refused write is kept in memory only for QuotaExceededError (S2)","js/storage.js","    } catch {\n      unsaved.set(key, raw);","    } catch (err) {\n      if (!err || err.name !== \"QuotaExceededError\") throw err;\n      unsaved.set(key, raw);","tests/storage-off.spec.js"],
      ["C20 remove() loses its guard when storage is switched off (S3)","js/storage.js","    try {\n      localStorage.removeItem(key);\n    } catch {\n      /* storage is off: there is nothing stored to remove */\n    }","    localStorage.removeItem(key);","tests/storage-off.spec.js"],
      ["C21 a session's completedIds is repaired only when falsy, not when it is not a list (S4)","js/session.js","if (!Array.isArray(s.completedIds)) s.completedIds = [];","if (!s.completedIds) s.completedIds = [];","tests/session-fields.spec.js"],
      ["C22 the 500-event cap keeps the OLDEST events (S5)","js/analytics.js","    if (bag.events.length > MAX) bag.events = bag.events.slice(-MAX);\n    write(bag);","    if (bag.events.length > MAX) bag.events = bag.events.slice(0, MAX);\n    write(bag);","tests/analytics-cap.spec.js"],
      ["C23 a refused analytics write throws out of track() before the event is queued (S6)","js/analytics.js","    try {\n      localStorage.setItem(LS_KEY, JSON.stringify(bag));\n    } catch {\n      /* ignore */\n    }","    localStorage.setItem(LS_KEY, JSON.stringify(bag));","tests/analytics-write-refused.spec.js"],
      ["C24 noon to noon across the spring-forward night is 23 h: diffDays floors (S7)","js/practice-days.js","return Math.round((db - da) / 86400000);","return Math.floor((db - da) / 86400000);","tests/practice-days-dst.spec.js"],
      ["C25 noon to noon across the fall-back night is 25 h: diffDays ceils (S7b)","js/practice-days.js","return Math.round((db - da) / 86400000);","return Math.ceil((db - da) / 86400000);","tests/practice-days-dst.spec.js"],
      ["C26 an old take is filed under the UTC date of its timestamp (S8)","js/practice-days.js","const k = dayKey(new Date(iso));","const k = String(iso).slice(0, 10);","tests/practice-days-backfill.spec.js"],
      ["C27 an unreadable date becomes the day NaN-NaN-NaN (S9)","js/practice-days.js","    if (!Number.isFinite(x.getTime())) return null;\n","","tests/practice-days-backfill.spec.js"],
      ["C28 the month of a day key is read in UTC while the year and date stay local (S10)","js/practice-days.js","pad(x.getMonth() + 1)","pad(x.getUTCMonth() + 1)","tests/local-day-zones.spec.js"],
      ["C29 a ledger whose days is not an object is kept (S11)","js/practice-days.js","    if (!b.days || typeof b.days !== \"object\" || Array.isArray(b.days)) b.days = {};\n","","tests/ledger-shapes.spec.js"],
      ["C30 a ledger whose rest.used is not a list is kept (S12)","js/practice-days.js","    if (!Array.isArray(b.rest.used)) b.rest.used = [];\n    b.rest.bank","    b.rest.bank","tests/ledger-shapes.spec.js"],
      ["C31 a ledger whose days is an ARRAY is kept and every practice is lost (BUG-1)","js/practice-days.js"," || Array.isArray(b.days)) b.days = {};",") b.days = {};","tests/ledger-days-array.spec.js"],
      ["C32 exactly a minute of practice with no counted take is no practice day (S13)","js/practice-days.js","(Number(row.sec) || 0) >= 60","(Number(row.sec) || 0) > 60","tests/practice-days-minute.spec.js"]
    ].map(([name, file, from, to, spec]) => ({
      name,
      file,
      from,
      to,
      cmd: [...PIANO_SPEC.slice(0, 3), spec, "--project=chromium", "--workers=4", "--reporter=dot"]
    }))
  ).concat(
    // Round-4 part D: the rail on a phone on its side, the 24 px target below the fold, focus and the consent bar
    [
      ["D1 a phone on its side keeps one rail row: the mic slider lies on the octave button (UIB-03)", "css/styles.css", "@media (max-height: 500px) and (max-width: 799.98px) {\n  .hud-bottom-rail {\n    flex-wrap: wrap;", "@media (max-height: 500px) and (max-width: 799.98px) {\n  .hud-bottom-rail {\n    flex-wrap: nowrap;", "tests/rail-small-screens.spec.js"],
      ["D2 the 'Paso listo' target is 13 px again, below the fold (FAL-01)", "css/styles.css", ".review-step label {\n  min-height: 24px;", ".review-step label {\n  min-height: 0;", "tests/target-size-below-fold.spec.js"],
      ["D3 focus keeps no room above the consent bar (UIB-01)", "js/region-gate.js", '    root.style.setProperty("scroll-padding-bottom", room);\n', "", "tests/focus-consent-bar.spec.js"],
      ["D4 the page cannot scroll its last controls clear of the consent bar (UIB-01)", "js/region-gate.js", '    root.style.setProperty("padding-bottom", room);\n', "", "tests/focus-consent-bar.spec.js"],
      ["D5 the room for the consent bar stays after it is answered (UIB-01)", "js/region-gate.js", "    barShown = false;\n    reserveBarRoom();\n  }", "    barShown = false;\n  }", "tests/focus-consent-bar.spec.js"],
      ["D6 scroll padding forgets the exercise's Back row: Shift+Tab leaves a control under it (UIB-04)", "css/styles.css", "scroll-padding-top: calc(var(--header-h, 58px) + var(--ex-chrome-h, 0px) + 0.5rem);", "scroll-padding-top: calc(var(--header-h, 58px) + 0.5rem);", "tests/focus-reverse.spec.js"],
      ["D7 phones 742 to 799 px wide get one rail row again: the landscape bound moved to 741 px (C1)","css/styles.css","@media (max-height: 500px) and (max-width: 799.98px)","@media (max-height: 500px) and (max-width: 741px)","tests/rail-landscape-bounds.spec.js"],
      ["D8 phones 381 to 500 px tall get one rail row again: the height bound moved to 380 px (C2)","css/styles.css","@media (max-height: 500px) and (max-width: 799.98px)","@media (max-height: 380px) and (max-width: 799.98px)","tests/rail-landscape-bounds.spec.js"]
    ].map(([name, file, from, to, spec]) => ({
      name,
      file,
      from,
      to,
      cmd: [...PIANO_SPEC.slice(0, 3), spec, "--project=chromium", "--workers=4", "--reporter=dot"]
    }))
  ).concat([
    // QA-57: the specs that drive the practice-mode registry fail by name when it is not there; they used to skip.
    // Judged by exactly the four tests whose guards were skips (the rest of those specs already fail without the registry,
    // which would kill the mutant even with the old guards).
    {
      name: "R1 VTPracticeModes.get is renamed, its callers updated: the specs that drive it skip instead of failing (QA-57)",
      file: "js/practice-modes.js",
      from: "global.VTPracticeModes = Registry;",
      to: "global.VTPracticeModes = { create: Registry.get, ids: Registry.ids };",
      cmd: [
        ...PIANO_SPEC.slice(0, 3),
        "tests/i18n-copy.spec.js",
        "tests/sh-air-detect.spec.js",
        "tests/mic-manual-grace.spec.js",
        "--project=chromium",
        "--workers=3",
        "--reporter=dot",
        "-g",
        "breathS mode HUD uses localized phase labels|SH ladder cur does not reset during brief manual gap|SH ladder cur advances on airDetected without manualSound|mode keeps cur across brief air miss"
      ]
    }
  ]),
  // Console routes to Pro (QA-05), each closed by one freeze.
  billing: [
    ["B1 the config object left writable", "js/billing-config.js", "    return Object.freeze(o);", "    return o;"],
    ["B2 only the config's top level frozen", "js/billing-config.js", '    Object.values(o).forEach((v) => v && typeof v === "object" && freeze(v));\n', ""],
    ["B3 the config binding left replaceable", "js/billing-config.js", '  Object.defineProperty(global, "VT_BILLING_CONFIG", { value: held, writable: false, configurable: false, enumerable: true });', ""],
    ["B4 VTBilling's answers left replaceable", "js/billing.js", "value: Object.freeze(global.VTBilling)", "value: global.VTBilling"],
    ["B5 VTLicense's claims left replaceable", "js/license.js", "value: Object.freeze(global.VTLicense)", "value: global.VTLicense"],
    ["B6 the config frozen one level deep: the license public key stays writable (QA-26)", "js/billing-config.js", 'Object.values(o).forEach((v) => v && typeof v === "object" && freeze(v));', 'Object.values(o).forEach((v) => v && typeof v === "object" && Object.freeze(v));'],
    ["B7 window.VTBilling left writable (QA-26)", "js/billing.js", 'Object.defineProperty(global, "VTBilling", { value: Object.freeze(global.VTBilling), writable: false,', 'Object.defineProperty(global, "VTBilling", { value: Object.freeze(global.VTBilling), writable: true,'],
    ["B8 window.VTLicense left writable (QA-26)", "js/license.js", 'Object.defineProperty(global, "VTLicense", { value: Object.freeze(global.VTLicense), writable: false,', 'Object.defineProperty(global, "VTLicense", { value: Object.freeze(global.VTLicense), writable: true,'],
    ["B9 a trial that starts in the year 2999 grants Pro (QA-24)", "js/billing.js", "    if (t0 > nowMs() + 300000) return false; // a start date in the future is not a start\n", ""],
    ["B10 the signature check reads SubtleCrypto at call time again (QA-23)", "js/license.js", 'return !!(await APPLY(VERIFY, SUBTLE, [\n        { name: "ECDSA", hash: "SHA-256" },\n        key,\n        signature,\n        new TextEncoder().encode(parts[0] + "." + parts[1])\n      ]));', 'return !!(await crypto.subtle.verify(\n        { name: "ECDSA", hash: "SHA-256" },\n        key,\n        signature,\n        new TextEncoder().encode(parts[0] + "." + parts[1])\n      ));'],
    ["B12 the public key is imported through SubtleCrypto at call time again (red-team rt1)", "js/license.js", 'return await APPLY(IMPORT_KEY, SUBTLE, [\n          "jwk",\n          jwk,\n          { name: "ECDSA", namedCurve: "P-256" },\n          false,\n          ["verify"]\n        ]);', 'return await crypto.subtle.importKey(\n          "jwk",\n          jwk,\n          { name: "ECDSA", namedCurve: "P-256" },\n          false,\n          ["verify"]\n        );'],
    ["B13 the signature check is invoked as VERIFY.call, which a console stub of Function.prototype.call reaches (red-team rt1)", "js/license.js", 'return !!(await APPLY(VERIFY, SUBTLE, [\n        { name: "ECDSA", hash: "SHA-256" },\n        key,\n        signature,\n        new TextEncoder().encode(parts[0] + "." + parts[1])\n      ]));', 'return !!(await VERIFY.call(\n        SUBTLE,\n        { name: "ECDSA", hash: "SHA-256" },\n        key,\n        signature,\n        new TextEncoder().encode(parts[0] + "." + parts[1])\n      ));'],
    ["B14 the key import is invoked as IMPORT_KEY.call (red-team rt1)", "js/license.js", 'return await APPLY(IMPORT_KEY, SUBTLE, [\n          "jwk",\n          jwk,\n          { name: "ECDSA", namedCurve: "P-256" },\n          false,\n          ["verify"]\n        ]);', 'return await IMPORT_KEY.call(\n          SUBTLE,\n          "jwk",\n          jwk,\n          { name: "ECDSA", namedCurve: "P-256" },\n          false,\n          ["verify"]\n        );'],
    ["B11 the plan chip and insights follow the worker's unsigned reply (QA-25)", "js/app.js", "if (acct.pro && acct.entitlement && acct.entitlement.pro) return acct.entitlement;", "if (acct.entitlement && acct.entitlement.pro) return acct.entitlement;"],
    // QA round 9 (trust): what no test observed, each judged by the spec written for it
    ["B15 the invoking primitive is looked up per call again: a console `Reflect.apply = ...` reaches the signature check and the key import (A1)","js/license.js","const APPLY = Reflect.apply;","const APPLY = (f, t, a) => Reflect.apply(f, t, a);",["tests/trust-reflect-apply.spec.js"]],
    ["B16 an exception in the signature check is read as 'valid' (fail open) (A2)","js/license.js","    } catch {\n      return false;\n    }\n  }\n\n  /** Issuer, audience, validity window","    } catch {\n      return true;\n    }\n  }\n\n  /** Issuer, audience, validity window",["tests/trust-fail-closed.spec.js"]],
    ["B17 a token verified at boot grants Pro for ever in an open tab: the in-session expiry test is gone (A3)","js/license.js","if (typeof verified.exp === \"number\" && verified.exp + CLOCK_SKEW_S < now) {","if (false) {",["tests/trust-claims-expire.spec.js"]]
  ].map(([name, file, from, to, only]) => ({
    name,
    file,
    from,
    to,
    cmd: [...PIANO_SPEC.slice(0, 3), ...(only || ["tests/console-unlock.spec.js", "tests/trust-console-gaps.spec.js"]), "--project=chromium", "--workers=4", "--reporter=dot"]
  })),
  // QA round 9 (toast): twelve behaviours of the message that appears over the page, each pinned by the one spec written for it.
  // Its own set so that the longer sets (a11y, regress) do not grow: CI runs it as a seventh job.
  toast: [
    ["TA the toast's z-index falls back to 100: a dialog (z 125) and the tour (10000) draw over a message","css/styles.css","  z-index: 10010;\n  opacity: 0;\n  transition: transform 0.25s ease, opacity 0.25s ease;","  z-index: 100;\n  opacity: 0;\n  transition: transform 0.25s ease, opacity 0.25s ease;","tests/toast-above-dialogs.spec.js"],
    ["TB1 a message moved from the row to under it keeps the row's max-width","js/app.js","    el.style.removeProperty(\"max-width\");\n    if (span) el.style.top","    if (span) el.style.top","tests/toast-leaves-row.spec.js"],
    ["TB2 a message moved from the row to under it keeps the row's top","js/app.js","    else el.style.removeProperty(\"top\");\n","\n","tests/toast-leaves-row.spec.js"],
    ["TC the toast loses pointer-events: none: it steals the tap meant for what is under it","css/styles.css","  pointer-events: none;\n}\n\n.toast.show {\n  transform","\n}\n\n.toast.show {\n  transform","tests/toast-no-click-steal.spec.js"],
    ["TE a new toast does not restart the timer: the second message leaves with the first one's clock","js/app.js","    el.classList.add(\"show\");\n    clearTimeout(toast._t);\n","    el.classList.add(\"show\");\n","tests/toast-replaced.spec.js"],
    ["TF the toast loses width: max-content: a short message stands in a wide empty pill","css/styles.css","  width: max-content;\n  max-width: min(90vw, 420px);","  max-width: min(90vw, 420px);","tests/toast-shrink-wrap.spec.js"],
    ["TG1 a faded toast is emptied at 200 ms, before its 0,25 s fade is over","js/app.js","      if (el && !el.classList.contains(\"show\")) el.textContent = \"\";\n    }, 400);","      if (el && !el.classList.contains(\"show\")) el.textContent = \"\";\n    }, 200);","tests/toast-timing.spec.js"],
    ["TG2 the 8 s cap is raised to 80 s","js/app.js","Math.min(8000, Math.max(2800,","Math.min(80000, Math.max(2800,","tests/toast-timing.spec.js"],
    ["TG3 durationMs is ignored","js/app.js","opts.durationMs || readMs","readMs","tests/toast-timing.spec.js"],
    ["TH a hidden toast is placed again on resize, so its title comes back hidden","js/app.js","if (el && el.classList.contains(\"show\")) placeToast(el);","if (el) placeToast(el);","tests/toast-title-returns.spec.js"],
    ["TI a toast raised at home stands on the header's navigation","css/styles.css",".toast.show {\n  top: max(calc(var(--header-h, 58px) + 0.35rem), var(--safe-top, 0px));\n}","","tests/toast-under-header.spec.js"],
    ["TJ the in-row cap of 560 px is raised to 800 px","js/app.js","Math.min(560, span.right - span.left)","Math.min(800, span.right - span.left)","tests/toast-width-cap.spec.js"]
  ].map(([name, file, from, to, spec]) => ({
    name,
    file,
    from,
    to,
    cmd: [...PIANO_SPEC.slice(0, 3), spec, "--project=chromium", "--workers=4", "--reporter=dot"]
  })),
  // The two site designs (A · Clásico, B · Enfocado): the control, what it reports, design B's own
  // behaviour, the worker's reading and the admin card. Each mutant names the spec written to catch it;
  // a path under workers/ is a Node test, anything else a browser spec, with an optional title filter.
  designs: [
    ["DS1 a visit lasts 30 seconds, not 30 quiet minutes: every reload is a new visit", "js/site-version.js", "const SESSION_GAP_MS = 30 * 60 * 1000;", "const SESSION_GAP_MS = 30 * 1000;", "tests/site-version.spec.js", "visit"],
    ["DS2 a page left open keeps counting: the five-minute idle cap is gone", "js/site-version.js", "const end = practising() ? now : Math.min(now, clock.lastInput + IDLE_MS);", "const end = now;", "tests/site-version.spec.js", "nobody at it"],
    ["DS3 a visit is reported on every page load, not once", "js/site-version.js", "if (first) track(\"layout_session\"", "track(\"layout_session\"", "tests/site-version.spec.js", "reported once"],
    ["DS4 a switch reports the new design as where it came from", "js/site-version.js", "      from,\n      to: ver,", "      from: ver,\n      to: ver,", "tests/site-version.spec.js", "a switch reports"],
    ["DS5 the old design's time is not closed on a switch, so it is credited to the new one", "js/site-version.js", "    const from = live.ver;\n    closeStretch(now);", "    const from = live.ver;", "tests/site-version.spec.js", "a switch reports"],
    ["DS6 a diagonal drag counts as a flick: scrolling the page changes the tab", "js/site-layout.js", "Math.abs(dx) < Math.abs(dy) * 2 || ", "", "tests/site-version.spec.js", "sideways flick"],
    ["DS7 folding a catalogue group shows its exercises and opening it hides them", "js/site-layout.js", "card.classList.toggle(\"sv-folded\", !open)", "card.classList.toggle(\"sv-folded\", open)", "tests/site-version.spec.js", "catalogue groups fold"],
    ["DS8 a tablet's header buttons lose the 44px hit area", "css/styles.css", "    inset: -4px 0;", "    inset: 0;", "tests/site-version-devices.spec.js", "iPad Air \\(820x1180\\)"],
    ["DS9 a phone's Progreso tabs keep the wide padding: the last tab hides behind a swipe", "css/site-version.css", "    padding-inline: 0.45rem;\n    font-size: 0.82rem;", "    padding-inline: 1.3rem;", "tests/site-version-devices.spec.js", "iPhone SE 2nd-3rd gen"],
    ["DS10 the worker counts a switch from a design to itself", "workers/entitlements/src/layouts.js", " || row.src === row.dst) continue;", ") continue;", "workers/entitlements/test/layouts.test.mjs"],
    ["DS11 the worker's cap on one time report is a hundred hours", "workers/entitlements/src/layouts.js", "export const MAX_REPORT_SECONDS = 3600;", "export const MAX_REPORT_SECONDS = 360000;", "workers/entitlements/test/layouts.test.mjs"],
    ["DS12 the worker drops the design events as unknown names", "workers/entitlements/src/events.js", "  ...LAYOUT_EVENTS\n", "\n", "workers/entitlements/test/layouts.test.mjs"],
    ["DS13 an old server's 404 reads as a generic error, with no word about redeploying", "js/admin-layouts.js", "    if (res.status === 404) return t(\"missing\");\n", "", "tests/admin-layouts.spec.js", "before this change"],
    ["DS14 the CSV gives design B the visits of design A", "js/admin-layouts.js", "d[ver].sessions, d[ver].seconds].join", "d.a.sessions, d[ver].seconds].join", "tests/admin-layouts.spec.js", "CSV"],
    ["DS15 the tiles show design A's visits in both", "js/admin-layouts.js", "VERSIONS.map((ver) => tile(versionOf(data, ver)))", "VERSIONS.map((ver) => tile({ ...versionOf(data, \"a\"), ver }))", "tests/admin-layouts.spec.js", "CSV"],
    ["DS16 the design control takes focus behind the sticky header and stays there", "js/site-version.js", "    select.addEventListener(\"focus\", () => revealBelowHeader(select));\n", "", "tests/site-version.spec.js", "390x844: no focused control"]
  ].map(([name, file, from, to, spec, grep]) => ({
    name,
    file,
    from,
    to,
    cmd: spec.startsWith("workers/")
      ? node([spec])
      : [...PIANO_SPEC.slice(0, 3), spec, "--project=chromium", "--workers=4", "--reporter=dot", ...(grep ? ["-g", grep] : [])]
  }))
};

export const DEFAULT_SETS = ["audio", "lint", "coaching"];

/** What the last failing command printed, so a red baseline in CI says which test failed. */
let lastFailure = "";

function runTests([cmd, ...args], root) {
  try {
    execFileSync(cmd, args, { cwd: root, stdio: "pipe", timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
    return true;
  } catch (e) {
    // The web server logs every request, and its lines come after the reporter's: without this filter the
    // last 80 lines were all "GET /js/..." and a red baseline in CI said nothing about which test failed.
    lastFailure = `${e.stdout || ""}${e.stderr || ""}`.split("\n").filter((l) => !l.includes("[WebServer]") && l.trim()).slice(-120).join("\n");
    return false;
  }
}

/**
 * A mutant changes one file, or the same text in every file of a list (a defect
 * made on all four pages at once, which a "the pages agree" check cannot see).
 * @returns {"KILLED"|"SURVIVED"|"ANCHOR"}
 */
export function tryMutant(m, root = process.cwd()) {
  const files = [].concat(m.file).map((f) => path.join(root, f));
  const sources = files.map((f) => readFileSync(f, "utf8"));
  if (sources.some((src) => src.split(m.from).length !== 2)) return "ANCHOR";
  files.forEach((f, i) => writeFileSync(f, sources[i].replace(m.from, m.to)));
  try {
    return runTests(m.cmd, root) ? "SURVIVED" : "KILLED";
  } finally {
    files.forEach((f, i) => writeFileSync(f, sources[i]));
  }
}

function main(sets) {
  let bad = 0;
  for (const set of sets) {
    // A suite that is already red "kills" every mutant: check it green first.
    const cmds = [...new Set(MUTANTS[set].map((m) => JSON.stringify(m.cmd)))];
    if (!cmds.every((c) => runTests(JSON.parse(c), process.cwd()))) {
      console.log(`RED      [${set}] the unmutated tests already fail; no mutant can be judged`);
      console.log(`--- last lines of the failing run (web-server request lines left out) ---\n${lastFailure}\n--- end ---`);
      bad++;
      continue;
    }
    for (const m of MUTANTS[set]) {
      const r = tryMutant(m);
      if (r !== "KILLED") bad++;
      console.log(`${r.padEnd(8)} [${set}] ${m.name}`);
    }
  }
  console.log(bad ? `FAIL: ${bad} mutant(s) survived or lost their anchor.` : "PASS: every mutant was killed.");
  process.exitCode = bad ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join("qa", "mutate.mjs"))) {
  const want = process.argv.slice(2).filter((a) => a !== "--wide");
  main(want.length ? want : DEFAULT_SETS);
}
