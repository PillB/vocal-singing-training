/**
 * Mutation check: does the test suite notice a planted defect?
 *
 * Each mutant replaces one exact snippet of shipped code with a plausible bug,
 * runs the tests that are supposed to guard it, and restores the file. A test
 * suite that stays green on a mutant is not testing that behaviour, however
 * high its coverage. Ported from the QA thread's mutate.py (2026-11-01).
 *
 *   node qa/mutate.mjs            # the Node sets (audio, pitch, lint, coaching, sets, ledger)
 *   node qa/mutate.mjs audio      # one set
 *   node qa/mutate.mjs stage a11y flows regress boot billing scoring controls audit toast designs splits  # browser sets: need Playwright's Chromium
 *
 * Exit code 1 when any mutant survives or an anchor no longer matches (so a
 * refactor that moves the code cannot silently retire its mutant).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
// The pages the gates themselves check (every .html the site serves), so a defect made "on every page" is made on
// all of them: a hard-coded four missed #26's terms.html and qa/index.html, and a defect on four of six pages dies
// to the "pages agree" test instead of proving that csp-pins can see it on its own.
import { PAGES } from "./asset-versions.mjs";

const AUDIO_TESTS = [
  "tests/node/audio-contract.test.mjs",
  "tests/node/audio-mutant-killers.test.mjs",
  "tests/node/hold-duration.test.mjs",
  "tests/node/attack-rise.test.mjs",
  "tests/node/sync-late-signin.test.mjs",
  "tests/node/sync-refused.test.mjs",
  "tests/node/safari-audio-contract.test.mjs",
  "tests/node/piano-range.test.mjs",
  "tests/node/microphone-race.test.mjs",
  "tests/node/engine-scoring.test.mjs",
  "tests/node/guided-clock.test.mjs",
  "tests/node/envelope-killers.test.mjs",
  "tests/node/start-recovery.test.mjs",
  "tests/node/sound-recovery.test.mjs"
];
// The pitch set's tests: the detector on synthetic voices, its band contracts, and the engine's level gate
const PITCH_TESTS = ["tests/node/pitch-voices.test.mjs", "tests/node/audio-contract.test.mjs", "tests/node/audio-mutant-killers.test.mjs"];
const LINT_TESTS = ["qa/lint-gate.test.mjs", "tests/node/asset-versions.test.mjs", "tests/node/csp.test.mjs", "tests/node/env-noise.test.mjs", "tests/node/env-noise-killers.test.mjs", "tests/node/inline-script-pin.test.mjs", "tests/node/csp-pins.test.mjs", "tests/node/i18n-duplicate-keys.test.mjs", "tests/node/exercise-parity.test.mjs", "tests/node/playwright-projects.test.mjs"];
// A mutant can leave a promise that never settles. Node 22 cancels such a test once the event loop
// is empty; Node 24 (CI) waits on it until runTests' 5-minute timeout, so two of those ran the
// contracts job out of time. Each test gets 30 s, ten times the slowest unmutated one.
const node = (tests) => [process.execPath, "--test", "--test-timeout=30000", ...tests];
// A D1 batch (one transaction) replaced by the same statements run one by one, for the ledger set.
const SEQUENTIAL = "(async (list) => { const out = []; for (const s of list) out.push(await s.run()); return out; })([";
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
// The stage in a 1280x560 window: the picture whole, the stage on the window (stage-design).
const SHORT_SPEC = [...PIANO_SPEC.slice(0, 3), "tests/stage-design.spec.js", "--project=chromium", "--workers=1", "--reporter=dot", "-g", "short laptop window"];
// The nightly fullscreen sweep's mouse (tests/helpers/fullscreen-clicks.js), held by a spec that runs on every PR.
const HARNESS_SPEC = [...PIANO_SPEC.slice(0, 3), "tests/fullscreen-click-harness.spec.js", "--project=chromium", "--workers=2", "--reporter=dot"];
const START_POINT_SPEC = [...PIANO_SPEC.slice(0, 3), "tests/sweep-start-point.spec.js", "--project=chromium", "--workers=2", "--reporter=dot"];
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

const CONTROL_SPECS = {
  range: ["tests/range-adapter.spec.js", "-g", "octave −2"],
  guided: ["tests/exercise-viz-guided.spec.js", "-g", "s17 release paces"],
  copy: ["tests/plan-history-design.spec.js", "tests/billing.spec.js", "-g", "the start button waits on a choice|Choose what to improve|value pulse board"],
  mic: ["tests/safari-mobile-recovery.spec.js", "-g", "permission prompt is up"],
  micmsg: ["tests/safari-mobile-recovery.spec.js", "-g", "each get their own message"],
  micguide: ["tests/safari-mobile-recovery.spec.js", "-g", "show distinct guidance"],
  race: ["tests/safari-mobile-recovery.spec.js", "-g", "older prompt answered"],
  orphan: ["tests/safari-mobile-recovery.spec.js", "-g", "Start replaced|lets go of the piano|piano option changed|held session and stopped"],
  focus: ["tests/exercise-viz-guided.spec.js", "-g", "Enter on Next past the last step|ends while Next has keyboard focus"],
  banner: ["tests/safari-mobile-recovery.spec.js", "-g", "sound-paused banner"]
};

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

/** The worker tests that judge VG-84's Mercado Pago mutants. */
const MP_PAID_TESTS = ["mp-paid-first", "store", "license", "router", "mercadopago"].map((t) => `workers/entitlements/test/${t}.test.mjs`);

export const MUTANTS = {
  coaching: [
    ["VC1 the breath mode silently adds 2s when hold is omitted", "js/practice-modes.js", "this.state.holdSec = p.hold != null ? p.hold : 0;", "this.state.holdSec = p.hold != null ? p.hold : 2;"],
    ["VC2 the exercise prescribes a 2s breath hold", "js/practice-profiles.js", "pattern: { in: 4, hold: 0, out: 6 },", "pattern: { in: 4, hold: 2, out: 6 },"],
    ["VC3 an entire SH ladder is required for passing", "js/exercises-data.js", 'labelEs: "Peldaños cómodos (1 basta)", type: "number", target: 1, unit: ""', 'labelEs: "Peldaños cómodos (1 basta)", type: "number", target: 5, unit: ""'],
    ["VC4 the first straw exercise asks for nasal humming", "js/exercises-data.js", "Phonate a soft /u/-like tone with lips gently sealed around the straw; let air exit through it, not through the nose.", "Hum through the straw and keep your lips sealed."],
    ["VC5 starter straw dose is raised from 2 to 5 minutes", "js/exercises-data.js", 'labelEs: "Fonación cómoda con cañita (minutos)", type: "number", target: 2, unit: "min"', 'labelEs: "Fonación cómoda con cañita (minutos)", type: "number", target: 5, unit: "min"']
  ].map(([name, file, from, to]) => ({ name, file, from, to, cmd: node(["tests/node/technical-coaching.test.mjs"]) })),
  // Goal sets (js/session-sets.js, docs/47): the data rules and the parts of the engine that need no browser.
  sets: [
    ["GS1 the engine forgets which set is running (a reload shows a nameless routine)", "js/session.js", "      if (routine?.set) session.set = String(routine.set);\n", ""],
    ["GS2 the step count of a set carries the stored word \"set\"", "js/session.js", 'const NAMED_ON_BANNER = ["daily", "basics", "set"];', 'const NAMED_ON_BANNER = ["daily", "basics"];'],
    ["GS3 a set starts without its own timers (every step runs the exercise's full default)", "js/session-sets.js", "        sec: set.sec,\n        set: set.id,", "        set: set.id,"],
    ["GS4 a step whose exercise is missing is kept (the routine opens nothing on that step)", "js/session-sets.js", "if (!exists(exId) || order.includes(exId)) return;", "if (order.includes(exId)) return;"],
    ["GS5 a one-step leftover is offered as a set", "js/session-sets.js", "if (order.length < 2) return null;", "if (order.length < 1) return null;"],
    ["GS6 a set is started on whatever tab is open (a singing set stored as a speaking session)", "js/session-sets.js", "if (hooks.getTab?.() !== set.track) hooks.setTab?.(set.track);", ""],
    ["GS7 moderate support is drawn as the maximum", "js/session-sets.js", "const GRADE_MARKS = { mod: 2, lim: 1, trad: 0 };", "const GRADE_MARKS = { mod: 3, lim: 2, trad: 1 };"],
    ["GS8 a set's step runs longer than the exercise's own timer", "js/session-sets.js", '["s17-jaw-neck-release", 105],\n        ["v22-voice-recovery", 600]', '["s17-jaw-neck-release", 190],\n        ["v22-voice-recovery", 600]'],
    ["GS9 a set names an exercise the catalogue does not have", "js/session-sets.js", '["v11-kill-fillers", 240],', '["v11-kill-filers", 240],'],
    ["GS10 a card promises prevention", "js/session-sets.js", "Es breve y no hay señal de que haga daño.", "Es breve y previene lesiones."],
    ["GS11 the sets claim the ending of today's basics (no completion card, no day marked)", "js/session-sets.js", 'if (!session || session.path !== "set") return false;\n    const set = resolve(session.set);', "if (!session) return false;\n    const set = resolve(session.set || \"v-pretalk\");"],
    ["GS12 every routine's banner takes a set's name", "js/session-sets.js", 'if (!session || session.path !== "set") return null;', "if (!session) return null;"],
    ["GS13 the English name of a set is its Spanish one", "js/session-sets.js", 'name: "After a lot of talking",', 'name: "Después de hablar mucho",']
  ].map(([name, file, from, to]) => ({ name, file, from, to, cmd: node(["tests/node/session-sets.test.mjs"]) })),
  audio: [
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
    ["SYR1 a save's timer still pending sends the refused write again (PR #21 merge)", "js/sync.js", "      const res = standingRefusal(id) ? { ok: false, reason: \"refused\" } : await syncNow(id);", "      const res = await syncNow(id);"],
    ["SYR2 a change made while the refused write was out is taken as refused, and never sent", "js/sync.js", "      noteRefusal(profileId, result, before);", "      noteRefusal(profileId, result, version);"],
    ["SYR3 a refusal outlives every later change", "js/sync.js", "    return refusal && (changedAt.get(profileId) || 0) <= refusal.before ? refusal : null;", "    return refusal || null;"],
    ["SYR4 a sign-out keeps the last account's refusal", "js/sync.js", "    refusals.clear();\n", ""],
    ["SYR5 a profile that went up after a refused one hides why that one did not", "js/sync.js", "      refusedReason = failed.reason === \"refused\" ? refusals.get(failed.id)?.reason || null : null;\n", ""],
    ["SYR6 a profile the account took is still treated as refused", "js/sync.js", "    if (result && result.ok) refusals.delete(profileId);\n    else if", "    if (result && result.ok) return;\n    if"],
    ["M22 the first match in a periodic tail, not the nearest", "js/voice-features.js", "if (j === K && (best == null || Math.abs(k - est) < Math.abs(best - est))) best = k;", "if (j === K && best == null) best = k;"],
    ["M24 s12 ignores audio lost in the rise", "js/practice-modes.js", "return res.lost != null ? res.lost : st.maxDt > (st.bufMs || 43) + 6;", "return st.maxDt > (st.bufMs || 43) + 6;"],
    ["M25 lost audio after the note settled spoils the onset", "js/voice-features.js", "some((at) => at >= idx && at < to)", "some((at) => at >= idx)"],
    ["M26 one long gap between clock checks counts in full (PR #25 CI red)", "js/practice-engine.js", "const step = Math.min(AUDIO_CLOCK_MAX_STEP_MS, Math.max(0, now - (this._audioClockCheckedAt || now)));", "const step = Math.max(0, now - (this._audioClockCheckedAt || now));"],
    ["M27 a frozen clock never adds up to Retry", "js/practice-engine.js", "      this._audioClockStalledMs += step;\n", ""],
    ["M28 a resume keeps the stall from before the interruption", "js/practice-engine.js", "            this._resetAudioClockWatch(this._lastFrameAt);\n", ""],
    ["M29 the note table stops at C1 again (octave -2 plays chords without their bass, PR #24)", "js/piano.js", "for (let oct = 0; oct <= 8; oct++) {", "for (let oct = 1; oct <= 6; oct++) {"],
    ["M30 Stop no longer cancels a Start waiting on the permission prompt", "js/practice-engine.js", "      this._startGen++; // a Start still waiting on the mic or its graph is cancelled\n", ""],
    ["M31 a microphone granted after Stop goes live", "js/practice-engine.js", "      if (gen === this._startGen) return stream;", "      if (gen === gen) return stream;"],
    ["M32 a Stop during the graph's resume reported as a microphone failure", "js/practice-engine.js", "      if (gen !== this._startGen) {\n        // Stop or a newer Start came while the graph was built", "      if (false) {\n        // Stop or a newer Start came while the graph was built"],
    ["M33 a hold bridges the minute a hidden tab drew no frames", "js/practice-engine.js", "    if (this.holdStart && performance.now() - this.lastVoiceAt > this._silenceEndMs()) this._maybeEndHold(true);\n", ""],
    ["M34 a cancelled Start's late grant clears the newer Start's pending flag", "js/practice-engine.js", "        if (this._startingGen === gen) this._startingGen = 0;", "        this._startingGen = 0;"],
    ["M35 a cancelled Start keeps its microphone open", "js/practice-engine.js", "        this._releaseStale(stream);\n        return;", "        return;"],
    ["M36 a cancelled Start releases whatever microphone is current", "js/practice-engine.js", "      stream.getTracks?.().forEach((track) => {\n        if (track.readyState", "      (this.stream || stream).getTracks?.().forEach((track) => {\n        if (track.readyState"],
    ["M37 a cancelled Start still builds its graph over the live session's", "js/practice-engine.js", "      if (gen !== this._startGen) return;\n      this.audioCtx = ctx;", "      this.audioCtx = ctx;"],
    ["M38 the frame-gap guard waits 10x the silence window", "js/practice-engine.js", "> this._silenceEndMs()) this._maybeEndHold(true);", "> this._silenceEndMs() * 10) this._maybeEndHold(true);"],
    ["M39 the frame-gap guard only after a 30 s gap", "js/practice-engine.js", "> this._silenceEndMs()) this._maybeEndHold(true);", "> 30000) this._maybeEndHold(true);"],
    ["M40 the frame-gap guard ignores sensitivity (a short stall splits a note)", "js/practice-engine.js", "> this._silenceEndMs()) this._maybeEndHold(true);", "> SILENCE_END_MS) this._maybeEndHold(true);"],
    ["M41 a one-frame hold is credited up to now (the hidden minute)", "js/practice-engine.js", "const endAt = this.lastVoiceAt >= this.holdStart ? this.lastVoiceAt : now;", "const endAt = this.lastVoiceAt > this.holdStart ? this.lastVoiceAt : now;"],
    ["M42 a frozen audio clock does not close the open hold", "js/practice-engine.js", "        this._audioClockStalled = true;\n        // A partial note can be credited only through its *last real* sample.\n        // Neither the visual grace clock nor the mode timer may extend it.\n        this._maybeEndHold(true);", "        this._audioClockStalled = true;"],
    ["M43 the SH/S air assist scores a pitch", "js/practice-engine.js", "      if (this.isManualEffective() && this._manualKind === \"air\") return null;\n      return measured;", "      return measured;"],
    ["M44 the engine scores its grace-held display value", "js/practice-engine.js", "      const measured = this._latestRawPitch;\n      if (!measured", "      const measured = this.voiceFreq;\n      if (!measured"],
    ["M45 the voice assist also hides the pitch", "js/practice-engine.js", "if (this.isManualEffective() && this._manualKind === \"air\") return null;", "if (this.isManualEffective()) return null;"],
    ["M46 a pitch with no energy behind it scores", "js/practice-engine.js", "      if (!measured || this._latestRms < this._holdRms() * 0.55) return null;", "      if (!measured) return null;"],
    ["M47 octave -2 shows ghost lanes at 16-31 Hz and squashes the highway", "js/pitch-visualizer.js", "global.VTProgressionRange(prog, laneFreqs(global.VT_NOTE_FREQ));", "global.VTProgressionRange(prog, global.VT_NOTE_FREQ);"],
    ["M48 octave -2 shows chord lanes at 16-31 Hz", "js/pitch-visualizer.js", "    const kept = chord.notes.filter((n) => !(map[n] < LANE_FLOOR_HZ));", "    const kept = chord.notes;"],
    // Guided steps on wall time (PR #24's "guided phases use real elapsed time")
    ["M56 the engine's frame carries no wall time", "js/practice-engine.js", "      if (frame) frame.wallDtMs = Math.max(0, now - (since || now));\n", ""],
    ["M57 the engine keeps its relay as the app's onFrame", "js/practice-engine.js", "      if (engine.onFrame === relay) engine.onFrame = deliver;", "      if (false) engine.onFrame = deliver;"],
    ["M58 the engine puts back an onFrame the frame replaced", "js/practice-engine.js", "      if (engine.onFrame === relay) engine.onFrame = deliver;", "      engine.onFrame = deliver;"],
    ["M59 guided steps paced on the capped dtMs again", "js/scenes/guided.js", "    const ms = frame ? (frame.wallDtMs != null ? frame.wallDtMs : frame.dtMs) : 0;", "    const ms = frame ? frame.dtMs : 0;"],
    ["M60 a frame after a hidden tab skips steps (no per-frame cap)", "js/scenes/guided.js", "Math.min(ms / 1000, STEP_MAX_SEC) : 0;", "ms / 1000 : 0;"],
    ["M61 guided steps capped at 100 ms a frame again", "js/scenes/guided.js", "  const STEP_MAX_SEC = 1;", "  const STEP_MAX_SEC = 0.1;"],
    ["M62 a negative frame delta winds the guide back", "js/scenes/guided.js", "    return Number.isFinite(ms) && ms > 0 ? Math.min", "    return Number.isFinite(ms) ? Math.min"],
    ["M63 the drill's Vad left on the capped frame time", "js/scenes/guided.js", "new global.VTFeatures.Vad({ maxDt: STEP_MAX_SEC })", "new global.VTFeatures.Vad({})"],
    ["M64 the Vad ignores the wall time it was asked to keep", "js/voice-features.js", "    if (this.maxDt > 0) this.t += Math.max(0, wallDt(frame, this.maxDt) - frameDt(frame));\n", ""],
    ["M65 a Vad on wall time takes a hidden minute in one frame", "js/voice-features.js", "Math.min(ms / 1000, maxSec) : 0;", "ms / 1000 : 0;"],
    ["M66 every Vad moves to wall time", "js/voice-features.js", "this.maxDt = opts.maxDt > 0 ? opts.maxDt : 0;", "this.maxDt = opts.maxDt > 0 ? opts.maxDt : 1;"],
    ["M72 lostSince: a gap exactly at the start no longer counts (QA-37 E2)", "js/voice-features.js", "some((at) => at >= idx && at < to)", "some((at) => at > idx && at < to)"],
    ["M73 lostSince: a gap exactly at the end now counts (QA-37 E3)", "js/voice-features.js", "some((at) => at >= idx && at < to)", "some((at) => at >= idx && at <= to)"],
    ["M74 a frame whose tail is nowhere in the buffer counts the frame time, not the whole buffer (QA-37 E6)", "js/voice-features.js", "return best == null ? N : best;", "return best == null ? 0 : best;"],
    ["M75 only the latest lost stretch is remembered (QA-37 E10)", "js/voice-features.js", "this._gaps = new Ring(16);", "this._gaps = new Ring(1);"],
    ["M76 a new take inherits the last take's lost audio (QA-37 E11)", "js/voice-features.js", "      this._gaps.clear();\n      this.total = 0;", "      this.total = 0;"],
    // QA round 5 on PR #27 (qa/round4/pr27/micrace): Start and a live take when the phone takes the audio away.
    ["M77 a microphone that ended while Start built the graph is reported as listening", "js/practice-engine.js", "      if (!graphError && audioTrack.readyState === \"ended\") graphError = new Error(\"Microphone ended while Start built the audio graph\");\n", ""],
    ["M78 a context resume that never settles holds Start forever", "js/practice-engine.js", "await within(ctx.resume(), RESUME_WAIT_MS, \"Resuming the audio context\");", "await ctx.resume();"],
    ["M79 the piano's resume inside Start is unbounded", "js/practice-engine.js", "await within(global.VTPiano?.resume?.(), RESUME_WAIT_MS, \"Resuming the piano\");", "await global.VTPiano?.resume?.();"],
    ["M80 Start waits 80 s on a stuck resume", "js/practice-engine.js", "  const RESUME_WAIT_MS = 8000;", "  const RESUME_WAIT_MS = 80000;"],
    ["M81 Start gives a slow iPhone resume under a second", "js/practice-engine.js", "  const RESUME_WAIT_MS = 8000;", "  const RESUME_WAIT_MS = 800;"],
    ["M82 the piano waits 80 s on a stuck resume", "js/piano.js", "  const RESUME_WAIT_MS = 8000;", "  const RESUME_WAIT_MS = 80000;"],
    ["M83 the piano gives a slow iPhone resume under a second", "js/piano.js", "  const RESUME_WAIT_MS = 8000;", "  const RESUME_WAIT_MS = 800;"],
    ["M84 the piano's unlock waits on a resume that never settles", "js/piano.js", "if (resumed && !(await this._awaitResume(resumed, \"Piano gesture resume rejected\"))) return false;", "if (resumed) await resumed;"],
    ["M85 the piano's resume waits on a resume that never settles", "js/piano.js", "await this._awaitResume(this.ctx.resume(), \"Piano resume failed\");", "await this.ctx.resume();"],
    ["M86 a stall inside a bridged silence is measured from the last frame again (two notes, one hold)", "js/practice-engine.js", "    if (this.holdStart && performance.now() - this.lastVoiceAt > this._silenceEndMs()) this._maybeEndHold(true);", "    if (this._lastFrameAt && performance.now() - this._lastFrameAt > this._silenceEndMs()) this._maybeEndHold(true);"],
    ["M87 a sustained mute ends the take two minutes later (E13)", "js/practice-engine.js", "        }, 1200);\n      });\n      track.addEventListener?.(\"unmute\"", "        }, 120000);\n      });\n      track.addEventListener?.(\"unmute\""],
    ["M88 a context that stays suspended ends the take two minutes later (E16)", "js/practice-engine.js", "            this._status(\"input-interrupted\");\n          }\n        }, 1200);", "            this._status(\"input-interrupted\");\n          }\n        }, 120000);"],
    ["M89 the last take's microphone can end the new take (E15)", "js/practice-engine.js", "const stillOwned = () => this.running && this.stream === stream;", "const stillOwned = () => true;"],
    ["M90 Start on a running engine asks for a second microphone (E20)", "js/practice-engine.js", "    async start({ record = false } = {}) {\n      if (this.running) return;\n", "    async start({ record = false } = {}) {\n"],
    ["M91 a half-second audio-session interruption leaves the banner up", "js/audio-recovery.js", "          if (session.state === \"interrupted\") showSound();", "          showSound();"],
    ["M92 the audio-session banner shows at once (R18)", "js/audio-recovery.js", "if (session.state === \"interrupted\") showSound();\n        }, 1200);", "if (session.state === \"interrupted\") showSound();\n        }, 12);"],
    ["M93 the piano's banner shows at once (R14)", "js/audio-recovery.js", "piano.ctx?.state !== \"running\") showSound();\n      }, 1200);", "piano.ctx?.state !== \"running\") showSound();\n      }, 12);"],
    ["M94 a take that ended while the banner waited still shows it (R26)", "js/audio-recovery.js", "if (state().view !== \"exercise\" || !state().practiceLive) return;", "if (state().view !== \"exercise\") return;"],
    ["M95 a chord whose every tone is under C1 gets lanes at 16-31 Hz again, not an octave up", "js/pitch-visualizer.js", "const notes = kept.length ? kept : chord.notes.map(lift);", "const notes = kept.length ? kept : chord.notes;"],
    ["M96 a one-note target at octave -2 is drawn under C1", "js/pitch-visualizer.js", "noteName: lift(opts.noteName)", "noteName: opts.noteName"],
    ["M97 the piano's ensure waits on a resume that never settles", "js/piano.js", "await this._awaitResume(this.ctx.resume(), \"Piano ensure resume failed\");", "await this.ctx.resume();"],
    ["M98 each piano step waits its own 8 s on a held session (unlock then ensure: 16 s)", "js/piano.js", "const left = held ? Math.max(RESUME_RETRY_MS, held.until - now) : RESUME_WAIT_MS;", "const left = RESUME_WAIT_MS;"],
    ["M99 a resume asked for after the shared 8 s gets no time at all", "js/piano.js", "Math.max(RESUME_RETRY_MS, held.until - now)", "(held.until - now)"],
    ["M100 a progression on a held session waits forever on its last resume", "js/piano.js", "await this._awaitResume(this.ctx.resume(), \"Piano resume before playing failed\");", "await this.ctx.resume();"],
    ["M101 a session that ran again and is held again gets 250 ms, not 8 s", "js/piano.js", "if (ctx.state === \"running\") this._resumeWait = null;", "if (false) this._resumeWait = null;"],
    ["M102 a resume that timed out is named like a permission prompt left open", "js/practice-engine.js", "{ name: \"AudioResumeTimeout\" })), ms);", "{ name: \"TimeoutError\" })), ms);"],
    ["M103 a lifted lane is named for the octave drawn, so one-note mode at -2 never matches the piano's note", "js/pitch-visualizer.js", "      lane.name = played.get(lane.name);\n", ""],
    ["M104 feedback names a lifted lane for the note under C1 it is not drawn at", "js/pitch-visualizer.js", "best = { name: L.shown || L.name, freq: L.freq", "best = { name: L.name, freq: L.freq"],
    ["M105 a Stop no longer drops a progression still waiting for a held session (a replaced Start's chords play under the next take)", "js/piano.js", "const stale = () => asked.stop !== this._stopGen || asked.prog !== this._progGen;", "const stale = () => asked.prog !== this._progGen;"],
    ["M106 an older progression that settles last plays over the newer one", "js/piano.js", "const stale = () => asked.stop !== this._stopGen || asked.prog !== this._progGen;", "const stale = () => asked.stop !== this._stopGen;"],
    ["M107 a reference note asked for before a Stop sounds after it", "js/piano.js", "      if (asked !== this._stopGen) return null; // stopped while the context resumed\n", ""],
    ["M108 a Stop forgets the sounds still waiting for the context", "js/piano.js", "      this._stopGen += 1;\n", ""],
    ["M109 inhale ticks asked for before a Stop tick after it", "js/piano.js", "      if (asked !== this._stopGen) return false;\n", ""],
    ["M110 a stopped one-note pass still announces its notes (the next take's targets jump)", "js/piano.js", "                if (pass !== this._passGen) return;\n", ""],
    ["M111 a stopped pass still announces its chords", "js/piano.js", "if (pass === this._passGen && this.onChordChange) this.onChordChange", "if (this.onChordChange) this.onChordChange"],
    ["M112 a progression dropped while it waited still silences the one playing by then (QA round 10: the next take loses its chords and targets)", "js/piano.js", "      if (stale()) return false;\n      this._silence();", "      this._silence();"],
    ["M113 a Stop during a progression's last wait, after its silence, no longer drops it", "js/piano.js", "if (!(await this._readyToPlay(stale)) || stale()) return null;", "if (!(await this._readyToPlay(stale))) return null;"],
    ["M114 the check before the silence forgets a Stop: a progression a Stop dropped cuts the next reference note", "js/piano.js", "if (!(await this._readyToPlay(stale)) || stale()) return null;", "if (!(await this._readyToPlay(() => asked.prog !== this._progGen)) || stale()) return null;"],
    ["M115 the check before the silence runs right after ensure: a progression dropped in resume()'s wait silences the newer one", "js/piano.js", "      await this.ensure();\n      await this.resume();\n      // If still not running (autoplay policy), try unlock path once\n      if (this.ctx && this.ctx.state !== \"running\") {\n        await this.unlock();\n      }\n      // A Stop, or a newer progression, came while the context was held: the silence below\n      // would end the voices and the chord loop of whatever plays now\n      if (stale()) return false;\n", "      await this.ensure();\n      if (stale()) return false;\n      await this.resume();\n      // If still not running (autoplay policy), try unlock path once\n      if (this.ctx && this.ctx.state !== \"running\") {\n        await this.unlock();\n      }\n"],
    ["M116 the check before the silence runs before unlock: a progression dropped in unlock's wait silences the newer one", "js/piano.js", "      if (this.ctx && this.ctx.state !== \"running\") {\n        await this.unlock();\n      }\n      // A Stop, or a newer progression, came while the context was held: the silence below\n      // would end the voices and the chord loop of whatever plays now\n      if (stale()) return false;\n", "      if (stale()) return false;\n      if (this.ctx && this.ctx.state !== \"running\") {\n        await this.unlock();\n      }\n"],
    ["M117 a Stop leaves the hammer noise of the chords still to come ticking", "js/piano.js", "this.playing.push(...nodes, noise);", "this.playing.push(...nodes);"],
    ["M118 a retired take's microphone mutes beside the new one and replaces the new take's mute check (Codex on PR #32)", "js/practice-engine.js", "        if (!stillOwned()) return;\n        // iOS briefly mutes", "        // iOS briefly mutes"],
    ["M119 a retired take's microphone unmutes and cancels the new take's mute check (Codex on PR #32)", "js/practice-engine.js", "if (stillOwned()) clearTimeout(this._micMuteTimer);", "clearTimeout(this._micMuteTimer);"],
    ["SB8 the banner with no free band covers Stop like any other control", "js/audio-recovery.js", "weight: KEEP_CLEAR.includes(c.id) ? 100 : 1", "weight: 1"],
    ["SB9 the banner with no free band overflows the largest band again", "js/audio-recovery.js", "const y = band ? band.top + (band.h - h) / 2 : leastCovered(room, h);", "const y = band ? band.top + (band.h - h) / 2 : room.bands.reduce((a, b) => (b.h > a.h ? b : a)).top;"]
  ].map(([name, file, from, to]) => ({ name, file, from, to, cmd: node(AUDIO_TESTS) })),
  // The NSDF pitch detector (McLeod & Wyvill 2005; PR #21), one stage at a time. Each mutant runs only the test
  // written to catch it (its title pattern), so the set costs seconds a mutant, not the whole audio suite. The
  // YIN detector's mutants (M1, M2, M4, M5, M49-M55, M67-M71) left with the code they planted defects in.
  pitch: [
    ["PD1 the clarity floor 0.55 -> 0.3 (a fan or a hiss gets a pitch)", "js/pitch-visualizer.js", "const MIN_CLARITY = 0.55;", "const MIN_CLARITY = 0.3;", "give no pitch"],
    ["PD2 MPM's K 0.9 -> 0.6 (a harmonic on a formant passes for the period: a fifth up)", "js/pitch-visualizer.js", "const MPM_K = 0.9;", "const MPM_K = 0.6;", "harmonic on her second formant"],
    ["PD3 MPM's K 0.9 -> 1 (only the most periodic lag: octaves low)", "js/pitch-visualizer.js", "const MPM_K = 0.9;", "const MPM_K = 1;", "C5 to C6|resolves fundamentals"],
    ["PD4 no mains tolerance (a 60 Hz buzz named as B1)", "js/pitch-visualizer.js", "const MAINS_TOL = 0.01;", "const MAINS_TOL = 0;", "give no pitch|mains hum is not named"],
    ["PD5 mains tolerance 1 % -> 3 % (a bass's A#1 and B1 either side of 60 Hz read nothing)", "js/pitch-visualizer.js", "const MAINS_TOL = 0.01;", "const MAINS_TOL = 0.03;", "mains hum is not named"],
    ["PD6 the odd-harmonic test never takes the octave down under 320 Hz (a low-cut baritone with vibrato an octave up)", "js/pitch-visualizer.js", "const OCT_ODD = 0.6;", "const OCT_ODD = 2;", "cuts his fundamental"],
    ["PD7 the odd-harmonic test never takes the octave down from 320 Hz (a pressed /a/ with vibrato an octave up)", "js/pitch-visualizer.js", "const OCT_ODD_HI = 0.45;", "const OCT_ODD_HI = 2;", "pressed /a/ at C5"],
    ["PD8 the octave down from 320 Hz needs a line no voice has (a pressed /a/ an octave up)", "js/pitch-visualizer.js", "const LINE_H1 = 30;", "const LINE_H1 = 1e9;", "pressed /a/ at C5"],
    ["PD9 the octave down from 320 Hz without the spectrum's say (breath in F1 read an octave down)", "js/pitch-visualizer.js", "const LINE_H1 = 30;", "const LINE_H1 = 0;", "breathy high voice"],
    ["PD10 2L may be 1x as aperiodic as L from 320 Hz, not 1.8x (a pressed /a/ with vibrato an octave up)", "js/pitch-visualizer.js", "const OCT_ODD_A2_HI = 1.8;", "const OCT_ODD_A2_HI = 1;", "pressed /a/ at C5"],
    ["PD11 a lag under the search is the frame's own period whatever lies under it (a woman's /i/ at 940 Hz reads nothing)", "js/pitch-visualizer.js", "const SHORT_LOW = 0.005;", "const SHORT_LOW = 1;", "harmonic on her second formant"],
    ["PD12 a lag under the search must be perfectly periodic (a whistle with vibrato read an octave low)", "js/pitch-visualizer.js", "const SHORT_C = 1.5;", "const SHORT_C = 0;", "whistle over the top"],
    ["PD13 a lag under the search is never the frame's period (every whistle read an octave low)", "js/pitch-visualizer.js", "if (1 - q.n > SHORT_C * (1 - fr.best) + 1e-4) return false;", "return false;", "whistle over the top"],
    ["PD14 a candidate's line need not stand near the period's (a woman's /i/ a fifth up)", "js/pitch-visualizer.js", "const FUND_REL = 0.063;", "const FUND_REL = 0;", "harmonic on her second formant"],
    ["PD15 aperiodicity test 3x -> 100x (a part of the period passes for it)", "js/pitch-visualizer.js", "const APER_C = 3;", "const APER_C = 100;", "harmonic on her second formant"],
    ["PD16 the aperiodicity test spans one period, not three (a part of the period passes for it)", "js/pitch-visualizer.js", "const APER_SPAN = 3.06;", "const APER_SPAN = 1.01;", "harmonic on her second formant"],
    ["PD17 no clarity floor for a pitch from 400 Hz (speech reads its first formant)", "js/pitch-visualizer.js", "const HI_MIN_BEST = 0.7;", "const HI_MIN_BEST = 0;", "speech gliding"],
    ["PD18 no aperiodicity cap (speech reads its first formant)", "js/pitch-visualizer.js", "const APER_CAP = 0.25;", "const APER_CAP = 1;", "speech gliding"],
    ["PD19 a hum-pulled period never handed back to the voice (A2 over 60 Hz read as 55 Hz)", "js/pitch-visualizer.js", "const LOW_K = 0.85;", "const LOW_K = 1.1;", "sine 12 dB under him"],
    ["PD20 the hum rule only under 40 Hz, not 80 Hz", "js/pitch-visualizer.js", "const LOW_HZ = 80;", "const LOW_HZ = 40;", "sine 12 dB under him"],
    ["PD21 no fractional lag at the top of the band (a bright tone at 1175-1480 Hz an octave low)", "js/pitch-visualizer.js", "const REFINE_MINLAGS = 4;", "const REFINE_MINLAGS = 0;", "whistle over the top"],
    ["PD22 the silence gate removed (a hum under -40 dBFS scored as a note)", "js/pitch-visualizer.js", "    if (Math.sqrt(energy / N) < 0.01) return null; // silence\n", "", "below the level gate"],
    ["PD23 the lag rounded to the sample (up to 7 cents off at 300-380 Hz)", "js/pitch-visualizer.js", "const sh = den < 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0;", "const sh = 0;", "within 3 cents"],
    ["PD24 a voice over a hum is named at the hum", "js/pitch-visualizer.js", "      if (!alt) return null;\n      freq = fr.sr / alt.lag;", "      if (!alt) return null;", "three or four times the mains"],
    ["PD25 a hum alone is named as a note", "js/pitch-visualizer.js", "      if (!alt) return null;", "      if (!alt) return freq;", "give no pitch|mains hum is not named"],
    ["PD26 the band floor 50 -> 40 Hz (a rumble named as a note)", "js/pitch-visualizer.js", "const PITCH_LO_HZ = 50;", "const PITCH_LO_HZ = 40;", "uncertain pitch is withheld"],
    ["PD27 the band top 1500 -> 1000 Hz (a soprano's C6 an octave low)", "js/pitch-visualizer.js", "const PITCH_HI_HZ = 1500;", "const PITCH_HI_HZ = 1000;", "C5 to C6"],
    ["PD28 the engine drops every pitch over 1000 Hz", "js/practice-engine.js", "  const PITCH_MAX = 1600;", "  const PITCH_MAX = 1000;", "C5 to C6"]
  ].map(([name, file, from, to, only]) => ({ name, file, from, to, cmd: node([`--test-name-pattern=${only}`, ...PITCH_TESTS]) })),
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
    ["L44 a ?v= that once served other content passes (RT4 on #39: app.js at main's live stamp)", "qa/asset-versions.mjs", "    if (other.length) {\n      problems.push(`${file} is ?v=${v}, which once", "    if (false) {\n      problems.push(`${file} is ?v=${v}, which once"],
    ["L45 a merge's discarded side is not history (path-limited log simplifies merges)", "qa/asset-versions.mjs", "[\"log\", \"--full-history\", \"--format=%H\"", "[\"log\", \"--format=%H\""],
    ["L46 a bump keeps a stamp that once served other content", "qa/asset-versions.mjs", "const nv = freeVersion(targetVersion(seen, manifest[file], sha, today), history, file, sha, today);", "const nv = targetVersion(seen, manifest[file], sha, today);"],
    ["L47 a shallow CI clone passes the reuse check unverified", "qa/asset-versions.mjs", "if (history.shallow && env.CI) {", "if (false) {"],
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
    ["L43 the base branch's name is pasted into the complexity step's shell line again (QA round 11, CI-1)", ".github/workflows/quality.yml", "        env:\n          BASE_REF: ${{ github.base_ref }}\n        run: node qa/lint-complexity.mjs --baseline-ref \"origin/$BASE_REF\"", "        run: node qa/lint-complexity.mjs --baseline-ref \"origin/${{ github.base_ref }}\"", ["tests/node/workflow-injection.test.mjs"]],
    ["L26 an English drill loses its fifth step: two languages, two drills (QA-34)", "js/exercises-data.js", '        "Then tell a 60 s story using at least 3 levels, on purpose.",\n        "Keep the same clarity and diction at every level."\n      ],', '        "Then tell a 60 s story using at least 3 levels, on purpose."\n      ],', ["tests/node/exercise-parity.test.mjs"]],
    ["L48 the first paint's mutation set is left out of CI's matrix: its mutants never run", ".github/workflows/quality.yml", "regress, boot, billing", "regress, billing", ["tests/node/mutation-matrix.test.mjs"]],
    // The six-format mouse sweep in two jobs (nightly voice-and-live ran out of its 80 min from Nov 9 to 17).
    ["L49 the second half of the mouse sweep leaves the fullscreen format out: no nightly job runs it", ".github/workflows/quality.yml", 'formats: "tablet,short,fullscreen"', 'formats: "tablet,short"', ["tests/node/nightly-sweep-contract.test.mjs"]],
    ["L50 the mouse sweep's job does not hand its formats to the spec, so both halves run all six and time out", ".github/workflows/quality.yml", "        env:\n          FORENSICS_FORMATS: ${{ matrix.formats }}\n", "", ["tests/node/nightly-sweep-contract.test.mjs"]],
    // Exactly the old matrix: a valid partition, which only the alone-in-its-jobs check (mouseSweepAlone) catches.
    ["L51 the mouse sweep goes back into one job beside the live forensics, about 109 min against 80", ".github/workflows/quality.yml", 'specs: "tests/exercise-live-forensics.spec.js"\n          - group: formats-1-of-2\n            specs: "tests/headed-exercise-forensics.spec.js"\n            formats: "desktop,mobile,mobile-land"\n          - group: formats-2-of-2\n            specs: "tests/headed-exercise-forensics.spec.js"\n            formats: "tablet,short,fullscreen"', 'specs: "tests/exercise-live-forensics.spec.js tests/headed-exercise-forensics.spec.js"', ["tests/node/nightly-sweep-contract.test.mjs"]],
    ["L52 the live Pages smoke writes to the default test-results/ again, emptying it of a red fullscreen step's traces before the upload", ".github/workflows/quality.yml", ' --output="test-results/live-pages"', "", ["tests/node/nightly-sweep-contract.test.mjs"]],
    // What the mouse sweep does with its job's formats: the spec runs only at night, so the helper it reads them with is judged here.
    ["L53 the mouse sweep reads another name than the one its job sets, so both halves run all six formats and time out", "tests/helpers/forensics-formats.js", "String(env.FORENSICS_FORMATS || \"\")", "String(env.FORENSICS_FORMAT || \"\")", ["tests/node/nightly-sweep-contract.test.mjs"]],
    ["L54 a misspelt format is dropped without a word, so no job runs it", "tests/helpers/forensics-formats.js", "  if (unknown.length) {", "  if (false) {", ["tests/node/nightly-sweep-contract.test.mjs"]],
    ["L55 a part's Start budget rounds up, so three jobs of two formats tolerate six failed Starts where one run tolerated four", "tests/helpers/forensics-formats.js", "Math.floor((START_FAIL_BUDGET * n)", "Math.ceil((START_FAIL_BUDGET * n)", ["tests/node/nightly-sweep-contract.test.mjs"]],
    ["L56 the mouse sweep runs all six formats whatever its job names", "tests/headed-exercise-forensics.spec.js", "const formats = selectFormats(process.env);", "const formats = selectFormats({});", ["tests/node/nightly-sweep-contract.test.mjs"]],
    ["L57 each half of the mouse sweep tolerates four failed Starts again, eight in all", "tests/headed-exercise-forensics.spec.js", "const p0Budget = startFailBudget(formats.length);", "const p0Budget = 4;", ["tests/node/nightly-sweep-contract.test.mjs"]],
    ["L58 the mouse sweep presses Start's centre wherever it is again, under the sticky Back button", "tests/headed-exercise-forensics.spec.js", "const startPt = await clickablePoint(page, \"#btn-practice-start\");", "const startPt = await centerIfVisible(page, \"#btn-practice-start\");", ["tests/node/nightly-sweep-contract.test.mjs"]],
    ["L59 the mouse sweep presses a Start it was told is covered", "tests/headed-exercise-forensics.spec.js", "if (startPt && !startPt.covered) {", "if (startPt) {", ["tests/node/nightly-sweep-contract.test.mjs"]],
    // A red mutation set in CI is read from its traces (PR #46: the boot set's baseline failed on one frame of 500, and left nothing to read).
    ["L60 a red mutation job uploads nothing: a baseline that fails only in CI can be re-run, not read", ".github/workflows/quality.yml", "      - name: Preserve a red set's traces\n        if: failure()\n        uses: actions/upload-artifact@v4\n        with:\n          name: mutation-failures-${{ matrix.set }}\n          path: test-results/\n          if-no-files-found: ignore\n", "", ["tests/node/mutation-matrix.test.mjs"]],
    ["L61 a mutation job uploads its traces only when it is green", ".github/workflows/quality.yml", "      - name: Preserve a red set's traces\n        if: failure()\n", "      - name: Preserve a red set's traces\n", ["tests/node/mutation-matrix.test.mjs"]],
    ["L62 every mutation job uploads under one name: the second red set's traces are refused", ".github/workflows/quality.yml", "          name: mutation-failures-${{ matrix.set }}\n", "          name: mutation-failures\n", ["tests/node/mutation-matrix.test.mjs"]],
    ["L7 empty wait-may-fail reason accepted", "qa/lint-playwright-waits.mjs", "/wait-may-fail:\\s*\\S/", "/wait-may-fail:/"]
  // A mutant that edits a hashed asset (js/css) turns "every versioned asset matches its recorded content" red whatever
  // else is wrong, so it names the one test it is meant to be judged by (red-team: L25 and L26 were killed by the manifest).
  ].map(([name, file, from, to, only]) => ({ name, file, from, to, cmd: node(only || LINT_TESTS) })),
  // What a pitch frame may score (PR #25's grace-held label, the s9 challenge).
  scoring: [
    ["P1 a grace-held label earns points again", "js/pitch-visualizer.js", "      return practice.scoringPitch();\n", "      return displayFreq || null;\n"],
    ["P2 the engine scores its grace-held display value", "js/practice-engine.js", "      const measured = this._latestRawPitch;\n      if (!measured", "      const measured = this.voiceFreq;\n      if (!measured"],
    ["P3 a challenge scored against the nearest chord lane", "js/pitch-visualizer.js", "} else if (f && !challenge && d.chordLanes !== false && this.chordLanes", "} else if (f && this.chordLanes"]
  ].map(([name, file, from, to]) => ({
    name,
    file,
    from,
    to,
    cmd: [...PIANO_SPEC.slice(0, 3), "tests/safari-mobile-recovery.spec.js", "tests/stage-design.spec.js", "--project=chromium", "--workers=2", "--reporter=dot", "-g", "held pitch stays visible|Pitch match challenge"]
  })),
  // Controls ported from PR #24: each says what it does, or is off when it cannot act.
  controls: [
    ["R12 octave -2 shown without its caution", "js/app.js", "if (moved && !opts.silent && state.octaveShift === -2) cautionLowOctave();", "if (moved && !opts.silent && state.octaveShift === -9) cautionLowOctave();", "range"],
    ["R4 in a take the piano's restart toast replaces the caution at once", "js/app.js", "    if (state.practiceLive && state._hotApplyPromise) state._hotApplyPromise.then(say, say);\n    else say();", "    say();", "range"],
    ["R5 the label forgets octave -2 once the toast is gone", "js/app.js", "      lab.classList.toggle(\"oct-caution\", low);\n", "", "range"],
    ["R6 the label's title does not explain octave -2", "js/app.js", "      lab.title = low\n        ? tt(\"range.lowOctaveHint\")", "      lab.title = false\n        ? tt(\"range.lowOctaveHint\")", "range"],
    ["R2 the auto range reaches -2 without the caution", "js/app.js", "        shiftOctave(dec.shift, { source: \"auto\", decision: dec });", "        applyOctaveShift(dec.shift, { source: \"auto\", decision: dec });", "range"],
    ["R3 the - button reaches -2 without the caution", "js/app.js", "    shiftOctave(state.octaveShift + delta, { source: \"manual\" });", "    applyOctaveShift(state.octaveShift + delta, { source: \"manual\" });", "range"],
    // QA round 5 on PR #27 (PNO-04, -05, -07, -08; QA's N8, N9, N11, N19, N20)
    ["R7 a caution due for -2 still shows once the learner is back at -1", "js/app.js", "      if (state.octaveShift === -2) toast(tt(\"range.lowOctaveCaution\"));", "      toast(tt(\"range.lowOctaveCaution\"));", "range"],
    ["R8 the caution toast regrows to the long hint (over Back and Help on a phone)", "js/app.js", "toast(tt(\"range.lowOctaveCaution\"));", "toast(tt(\"range.lowOctaveHint\"));", "range"],
    ["R9 a silent octave move still toasts the caution", "js/app.js", "if (moved && !opts.silent && state.octaveShift === -2) cautionLowOctave();", "if (moved && state.octaveShift === -2) cautionLowOctave();", "range"],
    ["R10 a stored octave below -2 is restored as it is", "js/app.js", "savedShift = Math.max(-2, Math.min(2, parseInt(s, 10) || 0));", "savedShift = Math.max(-3, Math.min(2, parseInt(s, 10) || 0));", "range"],
    ["R11 the auto range may go a third octave down", "js/range-adapter.js", "  const MAX_SHIFT = 2;", "  const MAX_SHIFT = 3;", "range"],
    ["G1 guided Next offered before Start", "js/scenes/guided.js", "        nextStep.disabled = true; //", "        nextStep.disabled = false; //", "guided"],
    ["G2 guided Next still offered after Stop", "js/scenes/guided.js", "      this.live = false;\n      this._nextStepDisabled(true);\n", "      this.live = false;\n", "guided"],
    // QA round 5 on PR #27 (PNO-01, PNO-02)
    ["G3 keyboard focus falls to the page top when Next disables", "js/scenes/guided.js", "      const held = off && !b.disabled && document.activeElement === b;", "      const held = false;", "focus"],
    ["G5 a take that ends with Next focused leaves focus on the Stop it hides", "js/scenes/guided.js", "      setTimeout(refocusIfLost, 0);\n", "", "focus"],
    ["G4 focus handed to a hidden Start while the take is live", "js/scenes/guided.js", "    return [\"btn-practice-stop\", \"btn-practice-start\"]", "    return [\"btn-practice-start\"]", "focus"],
    ["SB1 the sound-paused banner stays centred over a phone's rails", "js/audio-recovery.js", "      el.hidden = false;\n      placeSound(el);\n", "      el.hidden = false;\n", "banner"],
    ["SB2 the banner never takes its one-line form", "js/audio-recovery.js", "      el.classList.add(\"is-compact\");\n", "", "banner"],
    ["SB3 the banner's free bands ignore selects and labels", "js/audio-recovery.js", "const CONTROLS = \"button, input, select, textarea, label, a[href], [role='button']\";", "const CONTROLS = \"button, input, textarea, a[href], [role='button']\";", "banner"],
    ["SB4 the one-line form drops the sentence for screen readers", "css/styles.css", ".sound-blocked.is-compact #sound-blocked-text {\n  position: absolute;", ".sound-blocked.is-compact #sound-blocked-text {\n  display: none;\n  position: absolute;", "banner"],
    ["SB5 the banner may sit under the sticky header", "js/audio-recovery.js", "const top = Math.max(s.top, 0, stickyChromeHeight());", "const top = Math.max(s.top, 0);", "banner"],
    ["SB6 a rail that changes under the banner leaves it where it was", "js/audio-recovery.js", "if (stage && typeof global.ResizeObserver === \"function\") {", "if (false) {", "banner"],
    ["SB7 a scroll leaves the banner where the stage took it", "js/audio-recovery.js", "    global.addEventListener?.(\"scroll\", nextFrame, { passive: true });\n", "", "banner"],
    ["CP1 the Plan button says it starts a week it cannot start", "js/app.js", "      : tt(\"plan.chooseFocus\");", "      : tt(\"plan.startWith\", { n: plan.weekNumber, element: \"\" });", "copy"],
    ["CP2 one saved session read as \"1 sesiones\"", "js/i18n.js", "\"pricing.personalHave\": \"Sesiones guardadas: {sessions} ·", "\"pricing.personalHave\": \"Hasta hoy: {sessions} sesiones ·", "copy"],
    ["CP3 one saved session read as \"1 sessions\"", "js/i18n.js", "\"pricing.personalHave\": \"Saved sessions: {sessions} ·", "\"pricing.personalHave\": \"So far: {sessions} sessions ·", "copy"],
    ["MC1 leaving a take while the mic prompt is up leaves its Start pending", "js/app.js", "if (state.practiceLive || state.practice.running || state.practice.starting) {", "if (state.practiceLive || state.practice.running) {", "mic"],
    // QA round 6 (F2, app_race declaredOpen)
    ["MC2 an older Start answered late ends the newer, live take with no word", "js/app.js", "    if (state.practiceStarting || state.practiceLive) return;\n    // Aborted mid-start", "    // Aborted mid-start", "race"],
    ["MC3 an older Start answered late brings Start back under the newer prompt", "js/app.js", "    if (state.practiceStarting || state.practiceLive) return;\n    // Aborted mid-start", "    if (state.practiceLive) return;\n    // Aborted mid-start", "race"],
    ["MC4 an older Start answered late stops the newer take's engine", "js/app.js", "    if (state.practiceStarting || state.practiceLive) return;\n    // Aborted mid-start", "    if (state.practiceStarting) return;\n    // Aborted mid-start", "race"],
    ["MC5 a Start replaced while its piano waited goes on to sound its note", "js/app.js", "    await readyPianoForSound();\n    if (!current()) return false;\n", "    await readyPianoForSound();\n", "orphan"],
    ["MC6 a loop the piano dropped at a Stop is taken for silence: the replaced Start sounds its fallback note", "js/app.js", "    // A loop the piano dropped at a Stop is not silence: no fallback note for a replaced take\n    if (!current()) return false;\n", "", "orphan"],
    ["MC7 a replaced Start asks for its progression after the Stop", "js/app.js", "      await VTPiano.resume?.();\n      if (!current()) return;\n      if (!state.selectedProg", "      await VTPiano.resume?.();\n      if (!state.selectedProg", "orphan"],
    ["MC8 the recovery replays a replaced Start\'s note after the Stop", "js/app.js", "      await VTPiano.resume?.();\n      if (!current()) return;\n      if (plan.hasProg)", "      await VTPiano.resume?.();\n      if (plan.hasProg)", "orphan"],
    ["MC9 a replaced Start stops the newer take's piano", "js/app.js", "    if (state.practiceStarting || state.practiceLive) return;\n    // Aborted mid-start", "    if (state.practiceStarting || state.practiceLive) return void VTPiano.stopAll();\n    // Aborted mid-start", "orphan"],
    ["MC10 a piano option applied after the Stop plays on the stopped page", "js/app.js", "        const ok = await startExerciseSound(ex, profile, current);", "        const ok = await startExerciseSound(ex, profile);", "orphan"],
    ["MC11 the reference button announces a note a Stop dropped", "js/app.js", "      if (!f) return; // a Stop while a held session resumed: nothing sounded, so nothing to announce\n", "", "orphan"],
    ["MC12 the inhale-ticks button announces ticks a Stop dropped", "js/app.js", "      if (await VTPiano.playInhaleTicks(3)) toast(tt(\"toast.inhaleTicks\"));", "      await VTPiano.playInhaleTicks(3);\n      toast(tt(\"toast.inhaleTicks\"));", "orphan"],
    ["MC13 the piano step does not hand its Start to the sound (a new Start of the same exercise is taken for it)", "js/app.js", "      const soundOk = await startExerciseSound(ex, profile, current);", "      const soundOk = await startExerciseSound(ex, profile);", "orphan"],
    ["MC14 the replay does not hand its Start to the sound", "js/app.js", "    return startExerciseSound(ex, profile, current);", "    return startExerciseSound(ex, profile);", "orphan"],
    ["MC15 a sound request outlives Stop piano: Loop, Play once and an option changed during a take play after it", "js/app.js", "return () => gen === state.practiceGen && state.exercise === ex && pianoStop === window.VTPiano?._stopGen;", "return () => gen === state.practiceGen && state.exercise === ex;", "orphan"],
    ["MC16 a take replaced while its fallback or recovery waited reads the next take's piano as its own sound", "js/app.js", "    // Replaced while the fallback or the recovery waited: the piano sounding now is the next take's\n    if (!current()) return false;\n", "", "orphan"],
    ["MC17 a Start answered after a Stop stops the piano again, cutting what the learner played since", "js/app.js", "if (pianoStop === VTPiano._stopGen) VTPiano.stopAll();", "VTPiano.stopAll();", "orphan"],
    ["MB1 a resume that timed out tells the learner a permission prompt is still open", "js/app.js", "if ([\"interrupted\", \"AudioResumeTimeout\"].includes(name))", "if (name === \"interrupted\")", "micmsg"],
    ["MB2 a microphone that ended during Start is called blocked, not disconnected", "js/app.js", "|MediaStreamSource|ended while Start built/i", "|MediaStreamSource/i", "micmsg"],
    ["MB3 an error handed to the notice is read as what keeps running (a resume that timed out reads as blocked)", "js/app.js", "return typeof why === \"string\" || (!!why && typeof why === \"object\" && (\"name\" in why || \"message\" in why));", "return typeof why === \"string\";", "micmsg"],
    ["MB4 no device reads as a refused microphone again", "js/app.js", "    if (isMicMissing(name)) return `mic.missing.${generic}`;\n", "", "micguide"]
  ].map(([name, file, from, to, area]) => ({
    name,
    file,
    from,
    to,
    cmd: [...PIANO_SPEC.slice(0, 3), ...CONTROL_SPECS[area], "--project=chromium", "--workers=2", "--reporter=dot"]
  })),
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
    ["S11 the tap-floor allowance is a whole pixel: a 43 px control clears the 44 px floor (QA-66)", "tests/helpers/tap-floor.js", "const TAP_FLOOR_EPSILON = 0.05;", "const TAP_FLOOR_EPSILON = 1;", TAP_SPEC],
    // A short laptop window (stage-design "short laptop window"): the guide gives its room up before the picture is cut or the stage grows.
    ["S12 the guide is fitted beside the room the picture was left, not the room it needs: the picture is cut under a guide that kept its steps", "js/app.js", "return { left, whole: left - (shown ? panelShortfall(panel) : 0) };", "return { left, whole: left };", SHORT_SPEC],
    ["S13 the stage grows past the window before the guide gives its steps back to the picture", "js/app.js", "const over = panelShortfall(wrap) - guideYield(wrap);", "const over = panelShortfall(wrap);", SHORT_SPEC],
    ["S14 the guide counts its button as room it can give back, so the stage does not grow and the picture stays cut", "js/app.js", "return Math.max(0, guide.offsetHeight - bare);", "return guide.offsetHeight;", SHORT_SPEC],
    // The fullscreen sweep's mouse: red every night from Nov 12 on a toggle 5 px under a 1080 px screen.
    ["S15 the click harness scrolls to a control under the window's edge, then fits the stage again, whose scrollTo(0, 0) puts it back under the edge", "tests/helpers/fullscreen-clicks.js", "    await page.locator(sel).scrollIntoViewIfNeeded().catch(() => {});\n    hit = await hitCenter(page, sel);", "    await page.locator(sel).scrollIntoViewIfNeeded().catch(() => {});\n    await fit(page);\n    hit = await hitCenter(page, sel);", HARNESS_SPEC],
    ["S16 the click harness never scrolls to a control under the window's edge", "tests/helpers/fullscreen-clicks.js", "    await page.locator(sel).scrollIntoViewIfNeeded().catch(() => {});\n", "", HARNESS_SPEC],
    ["S17 the click harness takes anything at a control's centre for the control, so a covered button passes", "tests/helpers/fullscreen-clicks.js", "const ok = !!(top && (top === el || el.contains(top)));", "const ok = !!top;", HARNESS_SPEC],
    ["S18 the click harness scrolls to a control with no box, and waits there until the test's timeout", "tests/helpers/fullscreen-clicks.js", "  if (!hit.ok && hit.reason !== \"zero\" && hit.reason !== \"missing\") {", "  if (!hit.ok) {", HARNESS_SPEC],
    ["S19 the sweep re-clicks the metrics toggle the open card hides, so the card stays open", "tests/helpers/fullscreen-clicks.js", "      if (wasOpen && id === \"btn-toggle-metrics\") card.classList.add(\"collapsed\");\n", "", HARNESS_SPEC],
    // The mouse sweep's Start, pressed at its centre under the sticky Back button in a 560 px window.
    ["S20 the mouse sweep takes whatever is at Start's centre for Start, and presses the Back button over it", "tests/helpers/ui-forensics.js", "mine: !!top && (top === el || el.contains(top))", "mine: !!top", START_POINT_SPEC],
    ["S21 the mouse sweep sees Start is covered and does not scroll to it", "tests/helpers/ui-forensics.js", "      el.scrollIntoView({ block: \"center\", behavior: \"instant\" });\n      p = at();\n", "", START_POINT_SPEC]
  ].map(([name, file, from, to, cmd]) => ({ name, file, from, to, cmd: cmd || PIANO_SPEC })),
  // Accessibility contracts that only a browser can see.
  a11y: [
    ["A1 the narrow-phone header removes the page's h1 (QA-04)", "css/styles.css", "  body .app-header:has(#btn-more) .brand {\n    position: absolute;", "  body .app-header:has(#btn-more) .brand {\n    display: none;"],
    ["A2 privacy's English half read with Spanish rules", "privacy.html", '<section lang="en" aria-labelledby="en">', '<section aria-labelledby="en">'],
    ["A3 privacy's English title a second h1 again", "privacy.html", '<h2 id="en" class="part-title">Privacy (English)</h2>', '<h1 id="en" class="part-title">Privacy (English)</h1>'],
    ["A4 the phone rule empties privacy's header", "privacy.html", "      body:not(.view-exercise) .app-header .brand .brand-name {\n        display: block;\n      }\n", ""],
    ["A5 privacy's English link lands under the header", "privacy.html", "        scroll-margin-top: 100px;\n", ""]
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
  ]
    .map(([name, file, from, to]) => ({ name, file, from, to, cmd: FLOW_SPEC }))
    .concat(
      // Goal sets in the browser (tests/session-sets.spec.js): what the node tests cannot see.
      [
        ["SS1 a set is started as today's basics (it picks a size and marks the day's basics)", "js/app.js", 'startSet: (r) => startStructured("set", r),', 'startSet: (r) => startStructured("basics", r),', "a set runs as a set|a finished set ends on its card"],
        ["SS2 the banner never asks the sets for a name (a set reads as \"Sesión guiada\")", "js/app.js", "    const set = window.VTSets?.bannerName(s);\n    if (set) return set;\n", "", "a set runs as a set"],
        ["SS3 the trail is never drawn", "js/app.js", "    window.VTSets?.syncTrail(s);\n", "", "a set runs as a set"],
        ["SS4 a borrowed step in a set carries the other track's label", "js/app.js", 'const BORROWING_PATHS = ["basics", "set"];', 'const BORROWING_PATHS = ["basics"];', "a set runs as a set"],
        ["SS5 a finished set falls through to the plain toast (no card)", "js/app.js", "    if (window.VTSets?.onComplete(done)) return;\n", "", "a finished set ends on its card"],
        ["SS6 the set's start line is replaced by the basics' (\"Básicos de hoy: , 2 ejercicios\")", "js/app.js", 'toast(routine.toast || tt("loop.startToast"', 'toast(tt("loop.startToast"', "a set runs as a set"],
        ["SS7 the trail takes a row of its own in the banner", "css/session-sets.css", ".session-trail {\n  position: absolute;", ".session-trail {\n  position: static;\n  width: 100%;", "the trail lies inside the banner"],
        ["SS8 on a phone the picker is a centred card again, cut by the screen edge", "css/session-sets.css", "    place-items: end stretch;\n    padding: 0;", "    place-items: center;", "the picker is a sheet on the bottom edge"],
        ["SS9 the picker stays open over another page", "js/session-sets.js", 'if (!home.classList.contains("active")) closeDialogs();', "void closeDialogs;", "it closes when the page under it changes"],
        ["SS10 a short drag closes the sheet", "js/session-sets.js", "const far = e.clientY - startY > 72;", "const far = e.clientY - startY > 2;", "a drag down on the handle"],
        ["SS11 the trail marks every step as the current one", "js/session-sets.js", 'i < session.index ? "is-done" : i === now ? "is-now" : ""', 'i < session.index ? "is-now" : i === now ? "is-now" : ""', "a set runs as a set"],
        ["SS12 a set counts steps practised on any day as practised today", "js/session-sets.js", "const row = D.read().days[D.summary().today];", "const row = Object.values(D.read().days)[0];", "practised today says so"],
        ["SS13 a new drill is filed in the class group: design B's closed group counts 14", "js/exercises-data.js", 'tier: "advanced",\n      number: 24,', 'tier: "basic",\n      number: 24,', "in design B"]
      ].map(([name, file, from, to, grep]) => ({
        name,
        file,
        from,
        to,
        // Each mutant is judged by the test written to catch it: thirteen runs of the whole spec, on top of
        // the fourteen below, would outlive the flows job's 30 minutes (QA-45).
        cmd: [...PIANO_SPEC.slice(0, 3), "tests/session-sets.spec.js", "--project=chromium", "--workers=4", "--reporter=dot", "-g", grep]
      }))
    )
    .concat(
      // Guided voice drills (tests/exercise-viz-voice-drill.spec.js): what the microphone may count, and what it may not.
      [
        ["VD1 a blip counts as a held sound", "js/practice-modes.js", "if (h.counted || h.len * 1000 < st.minHoldMs) return;", "if (h.counted) return;", "a sound counts once"],
        ["VD2 speech is counted as held sounds", "js/practice-modes.js", "      if (h.speech) return;\n      if (h.len > st.longest)", "      if (h.len > st.longest)", "a sound counts once"],
        ["VD3 the piano's own note is counted as the learner's", "js/practice-modes.js", "const heard = on && run.clock >= st.deafUntil;", "const heard = on;", "the piano's own note"],
        ["VD4 a clear take that is also louder is told off", "js/practice-modes.js", 'if (f.slower) return { text: profileText(p, "pairYes")', 'if (f.slower && !f.louder) return { text: profileText(p, "pairYes")', "B against A"],
        ["VD5 a take that only ran longer reads as slower", "js/practice-modes.js", "slower: (dRate != null && dRate <= PAIR_SLOWER.rate) || dShare >= PAIR_SLOWER.share,", "slower: b.voiced > a.voiced * 1.15,", "B against A"],
        ["VD6 the longest sound is rounded up to more than was held", "js/practice-modes.js", "patches[p.longestMetric] = Math.floor(st.longest);", "patches[p.longestMetric] = Math.round(st.longest);", "what the microphone counts"],
        ["VD7 quiet minutes are counted while the learner talks", "js/practice-modes.js", "if (phase.rest && !heard && st.mic) st.quietSec += tick;", "if (phase.rest && st.mic) st.quietSec += tick;", "the piano's own note"],
        ["VD8 Stop rates the learner's ease for them", "js/practice-modes.js", "      const patches = {};\n      // Only what was heard is written", "      const patches = { easeAfter: 5, comfortAfter: 5, clarityBack: 5, easyVoice: 5 };\n      // Only what was heard is written", "Stop never fills a self-rating"],
        ["VD9 the note drill plays the piano on Start, over its silent first step", "js/app.js", 'const OWN_REFERENCE_MODES = ["openSpace", "voiceDrill"];', 'const OWN_REFERENCE_MODES = ["openSpace"];', "s28 is silent on Start"],
        ["VD10 a take that was skipped is shown as still to come", "js/scenes/voice-drill.js", 'return key === "a" && asked === "b" ? "none" : "later";', 'return "later";', "the pictures' own rules"],
        ["VD11 a spoken step shows hold bars", "js/practice-modes.js", "    if (ph && ph.speech) return { draw: A.speak, aspect: DRILL_ASPECT.speak, plain: true };\n", "", "what the microphone counts|the five exercises"],
        ["VD12 a drill's steps run past its timer", "js/practice-profiles.js", "          sec: 230,", "          sec: 330,", "steps add up to the timer"],
        ["VD13 the note is not sounded when its step begins", "js/practice-modes.js", "      if (p && p.ref) this._playRef(p, run);\n", "", "s28 is silent on Start"],
        ["VD14 a glide down is drawn going up", "js/scenes/voice-drill.js", 'if (kind === "down") return 1 - ease(u);', 'if (kind === "down") return ease(u);', "the pictures' own rules"],
        ["VD15 five silent minutes are written down as four", "js/practice-modes.js", "const quietMin = Math.floor((st.quietSec + QUIET_SLACK_SEC) / 60);", "const quietMin = Math.floor(st.quietSec / 60);", "a silent step is its whole minutes"],
        ["VD16 a stuttering phone stretches a five-minute step into forty quiet minutes", "js/practice-modes.js", "else this._quietFrame(heard, tick, run, phase);", "else this._quietFrame(heard, dt, run, phase);", "a silent step is its whole minutes"],
        ["VD17 with the microphone refused the clock's frames count as silence heard", "js/practice-modes.js", "if (phase.rest && !heard && st.mic) st.quietSec += tick;", "if (phase.rest && !heard) st.quietSec += tick;", "a silent step is its whole minutes"],
        ["VD18 the app's clock-only frames do not say they carry no microphone", "js/app.js", "holdSec: 0, noMic: true });", "holdSec: 0 });", "with the microphone refused"],
        ["VD19 a step says Quiet to a microphone that is off", "js/practice-modes.js", "      if (!st.mic) return { text: L(\"Sin micrófono · aquí no se mide nada\", \"No microphone · nothing is measured here\"), color: C.warn };\n", "", "a silent step is its whole minutes"]
      ].map(([name, file, from, to, grep]) => ({
        name,
        file,
        from,
        to,
        cmd: [...PIANO_SPEC.slice(0, 3), "tests/exercise-viz-voice-drill.spec.js", "--project=chromium", "--workers=4", "--reporter=dot", "-g", grep]
      }))
    )
    .concat(
      // The screen stays on while a practice is live (js/wake-lock.js, tests/wake-lock.spec.js).
      [
        ["WL1 Stop leaves the phone awake for the rest of the visit", "js/wake-lock.js", "    state.refused = false;\n    release();\n", "    state.refused = false;\n", "Start asks for a screen lock once"],
        ["WL2 the screen is kept on before Start", "js/wake-lock.js", 'doc.body.classList.contains("practice-live") && doc.visibilityState === "visible"', 'doc.visibilityState === "visible"', "Start asks for a screen lock once"],
        ["WL3 back from another app the screen is no longer kept on", "js/wake-lock.js", '    doc.addEventListener("visibilitychange", sync);\n', "", "back from the background"],
        ["WL4 a hidden page asks for the screen", "js/wake-lock.js", 'doc.body.classList.contains("practice-live") && doc.visibilityState === "visible"', 'doc.body.classList.contains("practice-live")', "back from the background"],
        ["WL5 a lock that arrives after Stop is kept", "js/wake-lock.js", "    if (!wanted()) {\n      drop(lock);\n      return;\n    }\n", "", "arrives after Stop"],
        ["WL6 a browser that refuses is asked again on every restyle", "js/wake-lock.js", "      state.refused = true;\n      return;", "      return;", "a refusal is asked once"],
        ["WL7 a refusal is never asked again, even on the next Start", "js/wake-lock.js", "    state.refused = false;\n    release();\n", "    release();\n", "a refusal is asked once"],
        ["WL8 a second lock is asked for while one is held", "js/wake-lock.js", "if (state.lock || state.asking || !supported()) return;", "if (state.asking || !supported()) return;", "Start asks for a screen lock once"],
        ["WL9 a browser with no wake lock throws on Start", "js/wake-lock.js", "if (state.lock || state.asking || !supported()) return;", "if (state.lock || state.asking) return;", "no wake lock practises as before"]
      ].map(([name, file, from, to, grep]) => ({
        name,
        file,
        from,
        to,
        cmd: [...PIANO_SPEC.slice(0, 3), "tests/wake-lock.spec.js", "--project=chromium", "--workers=2", "--reporter=dot", "-g", grep]
      }))
    ),
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
      ["D1 a phone on its side keeps one rail row: the mic slider lies on the octave button (UIB-03)", "css/styles.css", "  .hud-bottom-rail {\n    flex-wrap: wrap;\n    row-gap: 0.3rem;", "  .hud-bottom-rail {\n    flex-wrap: nowrap;\n    row-gap: 0.3rem;", "tests/rail-small-screens.spec.js"],
      ["D2 the 'Paso listo' target is 13 px again, below the fold (FAL-01)", "css/styles.css", ".review-step label {\n  min-height: 24px;", ".review-step label {\n  min-height: 0;", "tests/target-size-below-fold.spec.js"],
      ["D3 focus keeps no room above the consent bar (UIB-01)", "js/region-gate.js", '    root.style.setProperty("scroll-padding-bottom", room);\n', "", "tests/focus-consent-bar.spec.js"],
      ["D4 the page cannot scroll its last controls clear of the consent bar (UIB-01)", "js/region-gate.js", '    root.style.setProperty("padding-bottom", room);\n', "", "tests/focus-consent-bar.spec.js"],
      ["D5 the room for the consent bar stays after it is answered (UIB-01)", "js/region-gate.js", "    barWatch = null;\n    reserveBarRoom();\n  }", "    barWatch = null;\n  }", "tests/focus-consent-bar.spec.js"],
      ["D6 scroll padding forgets the exercise's Back row: Shift+Tab leaves a control under it (UIB-04)", "css/styles.css", "scroll-padding-top: calc(var(--header-h, 58px) + var(--ex-chrome-h, 0px) + 0.5rem);", "scroll-padding-top: calc(var(--header-h, 58px) + 0.5rem);", "tests/focus-reverse.spec.js"],
      // D7 and D8 (the 800 px width bound and the 500 px height bound of the landscape rail rule moved in) are retired in
      // the merge of #21 (PR #39): both survived as equivalent. Since #21 the landscape block wraps the rail at every width,
      // and main's bounded copy of that rule was dropped as dead code; at 381 to 500 px tall without the landscape block the
      // rail still wraps through the 1100 px rule, and tests/rail-landscape-bounds.spec.js finds nothing wrong (tried with
      // the block's bound moved to 380 px). D1 above now plants the one-row rail in the rule that has the last word.
      // The merge of PR #21 (2026-11-12): the page under a language switch, and focus on the sticky rows' own controls
      ["D9 focus on a control of the sticky rows throws the page to near its top again (csswg-drafts #7930)", "css/styles.css", "  scroll-margin-top: calc(-1 * (var(--header-h, 58px) + var(--ex-chrome-h, 0px) + 0.5rem));\n", "", "tests/focus-not-obscured.spec.js", "sticky rows leaves the page"],
      ["D10 a language switch reopens the piano as if asked for: the page ends at the piano, not where the learner was", "js/app.js", 'if (keep.piano && !$("#btn-toggle-piano")?.hidden) togglePianoPanel({ reveal: false });', 'if (keep.piano && !$("#btn-toggle-piano")?.hidden) togglePianoPanel();', "tests/redteam-exercise-language.spec.js", "has not started"],
      // Piano ▾ on a phone on its side: the opened options wrap inside the stage, so each one can be reached and clicked
      ["D11 at 640 px and narrower the opened piano options keep one row and run past the stage's right edge", "css/styles.css", "  #piano-mini-opts.piano-opts-expanded {\n    flex: 1 1 100%;\n    flex-wrap: wrap;\n    justify-content: flex-start;\n    row-gap: 0.35rem;", "  #piano-mini-opts.piano-opts-expanded {\n    flex: 1 1 100%;\n    flex-wrap: nowrap;\n    justify-content: flex-start;\n    row-gap: 0.35rem;", "tests/redteam-exercise-take.spec.js", "640x360"],
      ["D12 wider than 640 px the opened piano options keep one row and run past the stage's right edge", "css/styles.css", "  #piano-mini-opts.piano-opts-expanded {\n    flex: 1 1 100%;\n    flex-wrap: wrap;\n    justify-content: flex-start;\n    max-width: none;", "  #piano-mini-opts.piano-opts-expanded {\n    flex: 1 1 100%;\n    flex-wrap: nowrap;\n    justify-content: flex-start;\n    max-width: none;", "tests/redteam-exercise-take.spec.js", "740x360"],
      // "↻ Otra vez" after a rated take: a new take with an unanswered card and its own history entry
      ["D13 \u21bb Otra vez keeps the last take's answer: the new take's card comes pre-answered", "js/app.js", "      resetSessionPractice();\n      resetRating();\n      const scored", "      resetSessionPractice();\n      const scored", "tests/redteam-exercise-take.spec.js", "Otra vez"],
      ["D14 \u21bb Otra vez keeps the saved flag: the second take is never recorded", "js/app.js", "    if (state.sessionPractice.saved) {\n      resetSessionPractice();\n", "    if (state.sessionPractice.saved) {\n", "tests/redteam-exercise-take.spec.js", "Otra vez"],
      // Site data blocked (cross-04): the boot shows the open tab's whole catalogue, counted from the catalogue (main's voice drills made it 24, not 20)
      ["D15 the exercise list leaves one exercise out: a boot with site data blocked shows 23 of 24", "js/app.js", "const exercises = catalogOrder(filteredExercises());", "const exercises = catalogOrder(filteredExercises()).slice(1);", "tests/redteam-boot-a11y-privacy.spec.js", "cross-04"],
      // PR #39 review (Codex, P1): "Usar solo la de mi cuenta" on the returning account's own browser
      ["D16 the returning account's put-aside takes are restored before its pull, which overwrites them: a take that never reached the account is lost", "js/sync.js", "    for (const id of ids.filter((x) => !kept[x])) {", "    restoreAside(me);\n    for (const id of ids.filter((x) => !kept[x])) {", "tests/redteam-accounts-profiles.spec.js", "never reached A's account"],
      ["D17 the put-aside takes are restored but nothing sends them: they wait on this shared browser for the account's next save", "js/sync.js", "    if (restoreAside(me)) schedule();\n", "    restoreAside(me);\n", "tests/redteam-accounts-profiles.spec.js", "never reached A's account"],
      // PR #39 review (RT3): a count against whichever tab is open let a blocked boot land on the wrong tab
      ["D18 a browser with no stored settings opens the singing tab: a blocked boot shows the wrong list, whole", "js/storage.js", '      return read(LS.settings, { lastTab: "vocal", maleRange: true });', '      return read(LS.settings, { lastTab: "singing", maleRange: true });', "tests/redteam-boot-a11y-privacy.spec.js", "cross-04"],
      ["D19 a page whose storage throws gets no store in memory: the boot runs on storage.js's guards alone", "js/boot-head.js", "      Object.defineProperty(window, name, { value: memoryStore(), configurable: true });", "      void memoryStore;", "tests/redteam-boot-a11y-privacy.spec.js", "cross-04"],
      // PR #39 review (RT4): the guide's report paragraph ran on from section 15, after the ENT red flags
      ["D20 the Spanish report paragraph loses its heading: \u00bfAlgo sigue roto? reads as part of Cuida tu voz", "guide.html", '      <h2 id="reportar">Fallos e ideas</h2>\n', "", "tests/redteam-content-specs.spec.js", "heading of its own"],
      ["D21 the English report paragraph loses its heading: Still broken? reads as part of Look after your voice", "guide.html", '      <h2 id="reportar-en">Bugs and ideas</h2>\n', "", "tests/redteam-content-specs.spec.js", "heading of its own"],
      // After the merge (review AE3/AE4): #21's no-grow mic box on main's wrapping rail
      ["D26 the mic box is held to its own width beside hidden options: half the rail empty on every speech exercise", "css/styles.css", ".hud-bottom-rail > .hud-bc {\n  overflow: hidden;\n}\n", ".hud-bottom-rail > .hud-bc {\n  overflow: hidden;\n}\n.hud-bottom-rail:has(> #piano-mini-opts.hud-br:not(.piano-opts-compact):not(.piano-opts-expanded)) > .hud-bc {\n  flex: 0 0 auto;\n}\n", "tests/bottom-rail.spec.js", "takes the rest of its row"],
      // After the merge (review RT4): main's relabel of the trial banner without #21's one-day line
      ["D27 the trial banner relabelled after a language switch says 1 days / 1 d\u00edas", "js/app.js", "    text.textContent = tt(valueMomentKey(id, vars.n), vars);", "    text.textContent = tt(\"value.moment.\" + id, vars);", "tests/redteam-accounts-profiles.spec.js", "through language switches"],
      // After the merge (review RT5): back from a routine, the home entry kept the place from before it
      ["D28 back from a routine the entry keeps the old place, and a reload jumps down to it", "js/app.js", "    else if (state.view !== \"exercise\" && !route.restoring) {", "    else if (false) {", "tests/redteam-router-tour.spec.js", "a reload stays where the page is"],
    ].map(([name, file, from, to, spec, grep]) => ({
      name,
      file,
      from,
      to,
      cmd: spec.startsWith("tests/node/")
        ? node([spec])
        : [...PIANO_SPEC.slice(0, 3), spec, "--project=chromium", "--workers=4", "--reporter=dot", ...(grep ? ["-g", grep] : [])]
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
  // The first paint and the hold around the app's start (PR #40, PR #42). A set of its own, out of regress: with them
  // regress took 28.3 of its job's 30 minutes on 9d03d8e, and was cancelled at the limit on cc0c80f (review 6 of
  // PR #42, rt4). Each runs the tests that catch it, not the whole "first paint" describe.
  boot: [
    // After the merge (review AE3/AE4): the markup's home painted first, then the app's, and the page jumped
    // Each runs the tests that catch it, not the whole "first paint" describe: 32 tests, timed ones among them, for
    // each of 45 mutants ran this set past CI's 30 minutes (cancelled on PR #42 at cc0c80f).
    ["D22 nothing is held below the header: the markup's hero is painted, then replaced, and the page under it jumps", "css/styles.css", "html.vt-boot-pending .main,\nhtml.vt-boot-pending .app-footer {\n  visibility: hidden;\n}\n", "", "tests/redteam-boot-a11y-privacy.spec.js", "a later load: the markup's home"],
    ["D23 the hold ends only when the last image has loaded, not when the app has started", "js/boot-ready.js", "    html.classList.remove(\"vt-boot-pending\");\n", "", "tests/redteam-boot-a11y-privacy.spec.js", "released when the app has started"],
    ["D24 with js/boot-ready.js missing the page stays blank for eight seconds after it has loaded", "js/boot-head.js", "  window.addEventListener(\"load\", function () {\n    html.classList.add(\"vt-boot-ready\");\n    if (document.body) document.body.removeAttribute(\"aria-busy\");\n    show();\n  });\n", "", "tests/redteam-boot-a11y-privacy.spec.js", "released when the page has loaded"],
    ["D25 a script that never arrives leaves the page blank for good", "js/boot-head.js", "  (function stalled() {\n", "  (function stalled() {\n    return;\n", "tests/redteam-boot-a11y-privacy.spec.js", "released eight seconds after the page stops arriving"],
    // PR #40 review (red team 2): the whole page held on a first load, when nothing is cached, showed nothing for seconds
    ["D29 a first load holds the hero too: nothing below the header for 5 s on a 4G phone", "js/boot-head.js", "  if (firstLoad()) html.classList.add(\"vt-boot-hero\");\n", "", "tests/redteam-boot-a11y-privacy.spec.js", "the hero's words show at once"],
    ["D30 every load shows the markup's hero, a later one too, where the app then writes another", "js/boot-head.js", "  if (firstLoad()) html.classList.add(\"vt-boot-hero\");", "  if (true) html.classList.add(\"vt-boot-hero\");", "tests/redteam-boot-a11y-privacy.spec.js", "a later load: the markup's home"],
    ["D31 a first load at another view's address flashes the home's hero", "js/boot-head.js", "    if (location.hash || String(nav.name || \"\").indexOf(\"#\") !== -1) return true;\n", "", "tests/redteam-boot-a11y-privacy.spec.js", "first load at #"],
    ["D32 the markup's hero title is not the one the app writes for someone new: it changes as the app starts", "js/i18n.js", "\"first.titleMarkup\": \"Entrena tu voz 3\\u00a0minutos", "\"first.titleMarkup\": \"Entrena tu voz 5\\u00a0minutos", "tests/redteam-boot-a11y-privacy.spec.js", "the hero's words show at once"],
    ["D33 the first load's hero shows buttons that do nothing yet", "css/styles.css", "html.vt-boot-hero:not(.vt-boot-ready) #more-ways {\n  display: none;\n}\n", "", "tests/redteam-boot-a11y-privacy.spec.js", "the hero's words show at once"],
    ["D34 the hold ends before the app has drawn the page, which then jumps", "js/boot-ready.js", "  if (document.readyState === \"loading\") document.addEventListener(\"DOMContentLoaded\", ready);\n  else ready();", "  ready();", "tests/redteam-boot-a11y-privacy.spec.js", "a later load: the markup's home|the hero's words show at once"],
    // PR #42 review: the first load's hero as the app draws it, at every width, arm and way in
    ["D35 a first load with an experiment's arm forced in the address shows a hero the app then rewrites", "js/boot-head.js", "      if (name.indexOf(\"ab_\") === 0) arm = true;", "      if (false) arm = true;", "tests/redteam-boot-a11y-privacy.spec.js", "first load at \\?"],
    ["D36 a person who read the guide first is held like a returning one: the guide's statistics id taken for the app's", "js/boot-head.js", "\"vt_tour_v1\", \"vt_mic_sens\"];", "\"vt_tour_v1\", \"vt_mic_sens\", \"vt_ab_v1\"];", "tests/redteam-boot-a11y-privacy.spec.js", "straight from the guide"],
    ["D37 the line over the first load's hero changes as the app starts", "index.html", 'data-i18n="start.kickerNew">Canto y oratoria \u00b7 gratis</p>', 'data-i18n="start.kickerNew">Empieza aqu\u00ed</p>', "tests/redteam-boot-a11y-privacy.spec.js", "the hero's words show at once"],
    ["D38 on a laptop the first load's title is laid out narrower and larger, and shrinks as the app starts", "css/styles.css", "  body.loop-first #start-panel .start-title,\n  html.vt-boot-hero:not(.vt-boot-ready) #start-panel .start-title {", "  body.loop-first #start-panel .start-title {", "tests/redteam-boot-a11y-privacy.spec.js", "the hero's words show at once"],
    ["D41 on a laptop the first load's title is laid out in the whole width, and its column narrows as the app starts", "css/styles.css", "  body.loop-first #start-panel.start-panel,\n  html.vt-boot-hero:not(.vt-boot-ready) #start-panel.start-panel {", "  body.loop-first #start-panel.start-panel {", "tests/redteam-boot-a11y-privacy.spec.js", "the hero's words show at once"],
    ["D42 the first load's hero is laid out and styled visible, but drawn at no opacity", "css/styles.css", "html.vt-boot-hero:not(.vt-i18n-pending) #start-panel {\n  visibility: visible;\n}\n", "html.vt-boot-hero:not(.vt-i18n-pending) #start-panel {\n  visibility: visible;\n  opacity: 0;\n}\n", "tests/redteam-boot-a11y-privacy.spec.js", "the hero's words show at once"],
    ["D43 a later load is told by a key the tests seed (the tour), not by what the app's first start keeps: every load shows the markup's hero", "js/boot-head.js", "  var APP_KEYS = [\"vt_settings_v1\", \"vt_days_v1\", \"vt_profiles_v1\", \"vt_progress_v1\", \"vt_tour_v1\", \"vt_mic_sens\"];", "  var APP_KEYS = [\"vt_tour_v1\"];", "tests/redteam-boot-a11y-privacy.spec.js", "the load after this browser's first"],
    ["D44 a reload below the top with site data blocked shows the hero, and the app then jumps to the place it kept", "js/boot-head.js", "    if (history.state && history.state.y > 0) return true;\n", "", "tests/redteam-boot-a11y-privacy.spec.js", "site data blocked"],
    ["D45 a search result's text link shows the hero, and the page scrolls it away", "js/boot-head.js", "    if (location.hash || String(nav.name || \"\").indexOf(\"#\") !== -1) return true;", "    if (location.hash) return true;", "tests/redteam-boot-a11y-privacy.spec.js", "first load at #"],
    ["D46 a forced arm spelt with an escape (%61b_) shows the control arm's hero, which the app rewrites", "js/boot-head.js", "    new URLSearchParams(location.search).forEach(function (_, name) {", "    location.search.slice(1).split(\"&\").forEach(function (name) {", "tests/redteam-boot-a11y-privacy.spec.js", "first load at \\?"],
    // Both lines: changing only the test, a timer that fired a fraction of a millisecond early (performance.now is not
    // the timers' clock) rescheduled by the stall's own clock and let go at 16 s, past the test's look at 9.5 s (CI, 30fa8c7).
    ["D47 the hold is let go eight seconds after the start: on a slow phone the markup's home shows under the hero and jumps", "js/boot-head.js", "    if (waited >= STALL_MS || now - began >= CAP_MS) return show();\n    setTimeout(stalled, Math.min(STALL_MS - waited, CAP_MS - (now - began)));", "    if (now - began >= STALL_MS) return show();\n    setTimeout(stalled, STALL_MS - (now - began));", "tests/redteam-boot-a11y-privacy.spec.js", "arrive one by one"],
    ["D48 on a first visit the home view never fades in again: its entrance is off for the page's life, not only while held", "css/styles.css", "html.vt-boot-pending.vt-boot-hero #view-home {\n  animation-duration: 0s !important;\n}\n", "html.vt-boot-hero #view-home {\n  animation: none;\n}\n", "tests/redteam-boot-a11y-privacy.spec.js", "fades in when it is opened again"],
    ["D49 the first load's hero shows without its kicker", "css/styles.css", "html.vt-boot-hero:not(.vt-i18n-pending) #start-panel {\n  visibility: visible;\n}\n", "html.vt-boot-hero:not(.vt-i18n-pending) #start-panel {\n  visibility: visible;\n}\nhtml.vt-boot-pending.vt-boot-hero #start-kicker {\n  visibility: hidden;\n}\n", "tests/redteam-boot-a11y-privacy.spec.js", "the hero's words show at once"],
    ["D50 the first load's title is drawn lighter, and turns bold as the app starts", "css/styles.css", "html.vt-boot-hero:not(.vt-i18n-pending) #start-panel {\n  visibility: visible;\n}\n", "html.vt-boot-hero:not(.vt-i18n-pending) #start-panel {\n  visibility: visible;\n}\nhtml.vt-boot-pending.vt-boot-hero #start-panel .start-title {\n  font-weight: 400;\n}\n", "tests/redteam-boot-a11y-privacy.spec.js", "the hero's words show at once"],
    ["D51 the first load's title is centred, and jumps to the left as the app starts", "css/styles.css", "html.vt-boot-hero:not(.vt-i18n-pending) #start-panel {\n  visibility: visible;\n}\n", "html.vt-boot-hero:not(.vt-i18n-pending) #start-panel {\n  visibility: visible;\n}\nhtml.vt-boot-pending.vt-boot-hero #start-panel .start-title {\n  text-align: center;\n}\n", "tests/redteam-boot-a11y-privacy.spec.js", "the hero's words show at once"],
    ["D52 the other ways in are hidden but keep their room: an empty band under the hero that closes as the app starts", "css/styles.css", "html.vt-boot-hero:not(.vt-boot-ready) #more-ways {\n  display: none;\n}\n", "html.vt-boot-hero:not(.vt-boot-ready) #more-ways {\n  visibility: hidden;\n}\n", "tests/redteam-boot-a11y-privacy.spec.js", "the hero's words show at once"],
    ["D53 the first load's hero shows without its intro line (the largest words on a phone, so the page's content waits for the app)", "css/styles.css", "html.vt-boot-hero:not(.vt-i18n-pending) #start-panel {\n  visibility: visible;\n}\n", "html.vt-boot-hero:not(.vt-i18n-pending) #start-panel {\n  visibility: visible;\n}\nhtml.vt-boot-pending.vt-boot-hero #start-sub {\n  display: none;\n}\n", "tests/redteam-boot-a11y-privacy.spec.js", "the hero's words show at once"],
    // Review 5 of PR #42: the scripts found one by one, and what the hold did around the app's start
    ["D54 a reload at the top is held whole: the hero the app draws there shows only seconds later", "js/boot-head.js", "    if (history.state && history.state.y > 0) return true;", "    if (nav.type === \"reload\" || nav.type === \"back_forward\") return true;", "tests/redteam-boot-a11y-privacy.spec.js", "site data blocked"],
    ["D55 app.js is preloaded at another address: it is asked for only once the scripts before it have run, and fetched twice", "index.html", "<link rel=\"preload\" href=\"js/app.js?v=", "<link rel=\"preload\" href=\"js/app.js?x=", "tests/redteam-boot-a11y-privacy.spec.js", "asks for every script at once"],
    ["D56 app.js is not preloaded where it runs (the static check)", "index.html", "<link rel=\"preload\" href=\"js/app.js?v=", "<link rel=\"preload\" href=\"js/app.js?x=", "tests/node/boot-preload.test.mjs", ""],
    ["D57 where scrollbars take room, the page keeps none for them: the header and the hero move 7.5 px sideways as the app starts, and between views", "css/styles.css", "html.vt-scrollbar-room {\n  scrollbar-gutter: stable;\n}\n", "", "tests/redteam-boot-a11y-privacy.spec.js", "scrollbars that take room"],
    ["D58 the hero is shown by its own rule only while held: under reduced motion it blinks out when its last resort lets the page go", "css/styles.css", "html.vt-boot-hero:not(.vt-i18n-pending) #start-panel {", "html.vt-boot-pending.vt-boot-hero:not(.vt-i18n-pending) #start-panel {", "tests/redteam-boot-a11y-privacy.spec.js", "reduced motion"],
    ["D59 the hero shows through the hidden body while the page waits for its English strings: the Spanish hero under lang=en", "css/styles.css", "html.vt-boot-hero:not(.vt-i18n-pending) #start-panel {", "html.vt-boot-hero #start-panel {", "tests/redteam-boot-a11y-privacy.spec.js", "only the English choice"],
    ["D60 the first load's hero fades and rises in with its view", "css/styles.css", "html.vt-boot-pending.vt-boot-hero #view-home {\n  animation-duration: 0s !important;\n}\n", "", "tests/redteam-boot-a11y-privacy.spec.js", "the hero's words show at once"],
    ["D61 what the app adds to the hero replaces the line under its words in one frame", "js/boot-ready.js", "    if (hero) reveal();\n", "", "tests/redteam-boot-a11y-privacy.spec.js", "fades in under its words"],
    ["D62 under reduced motion what the app adds to the hero fades in all the same", "js/boot-ready.js", "window.matchMedia(\"(prefers-reduced-motion: no-preference)\").matches", "window.matchMedia(\"all\").matches", "tests/redteam-boot-a11y-privacy.spec.js", "reduced motion"],
    ["D63 the kicker and title fade in again as the app starts, under the reader's eye", "js/boot-ready.js", "\"#start-panel .start-main > :not(#start-kicker, #start-title), #start-panel > :not(.start-main), #site-version-bar\"", "\"#start-panel .start-main > *, #start-panel > :not(.start-main), #site-version-bar\"", "tests/redteam-boot-a11y-privacy.spec.js", "fades in under its words"],
    ["D64 any edit of the page counts as a script read: one whose app never arrives is held the full twenty seconds", "js/boot-head.js", "    return !!node && node.nodeName === \"SCRIPT\" && !!node.src && !node.async && !node.defer && node.type !== \"module\";", "    return !!node;", "tests/redteam-boot-a11y-privacy.spec.js", "whatever the system clock does"],
    ["D65 the stall is timed by the system clock: set back during the load, it holds the page for good", "js/boot-head.js", "    return performance.now();", "    return Date.now();", "tests/redteam-boot-a11y-privacy.spec.js", "whatever the system clock does"],
    ["D66 the other ways in show when the hold is let go before the app, and fold away again as it starts", "css/styles.css", "html.vt-boot-hero:not(.vt-boot-ready) #more-ways {", "html.vt-boot-pending.vt-boot-hero #more-ways {", "tests/redteam-boot-a11y-privacy.spec.js", "early script stalls"],
    ["D67 from 861 px the hero's title grows when the hold is let go before the app, and shrinks again as it starts", "css/styles.css", "  html.vt-boot-hero:not(.vt-boot-ready) #start-panel .start-title {", "  html.vt-boot-pending.vt-boot-hero #start-panel .start-title {", "tests/redteam-boot-a11y-privacy.spec.js", "early script stalls"],
    ["D68 with js/boot-ready.js missing the hero's held layout lasts the page's life", "js/boot-head.js", "    html.classList.add(\"vt-boot-ready\");\n    if (document.body)", "    if (document.body)", "tests/redteam-boot-a11y-privacy.spec.js", "the hero's layout is the app's to decide"],
    ["D69 the hero's held layout lasts until the page has loaded, not until the app has started", "js/boot-ready.js", "    html.classList.add(\"vt-boot-ready\");\n", "", "tests/redteam-boot-a11y-privacy.spec.js", "the hero's layout is the app's to decide"],
    ["D70 the time since the last script read counts, waiting for one or not: a page whose markup arrives slowly is let go mid-stream, and its home jumps", "js/boot-head.js", "    var waited = waiting ? now - since : 0;", "    var waited = now - since;", "tests/redteam-boot-a11y-privacy.spec.js", "page itself arrives slowly"],
    ["D71 a script another script adds counts as the page's own: an extension that adds one every few seconds holds a page whose app never arrives for twenty seconds", "js/boot-head.js", " && !node.async && ", " && ", "tests/redteam-boot-a11y-privacy.spec.js", "whatever the system clock does"],
    ["D72 the failed request made ahead for a script lets go of an English visitor's hold: the Spanish page shows until the strings come", "js/boot-head.js", "    if (target && target !== window && target.nodeName !== \"SCRIPT\") return;\n", "", "tests/redteam-boot-a11y-privacy.spec.js", "guard holds when a script late in the page"],
    ["D73 with js/boot-ready.js missing the page says it is busy for its whole life", "js/boot-head.js", "    if (document.body) document.body.removeAttribute(\"aria-busy\");\n    show();", "    show();", "tests/redteam-boot-a11y-privacy.spec.js", "released when the page has loaded"],
    ["D74 an address is decoded whole: a malformed escape hides a forced arm, and a name in another one's value is taken for one", "js/boot-head.js", "    var arm = false;\n    new URLSearchParams(location.search).forEach(function (_, name) {\n      if (name.indexOf(\"ab_\") === 0) arm = true;\n    });\n    return arm;", "    try {\n      return /[?&]ab_/.test(decodeURIComponent(location.search));\n    } catch (e) {\n      return /[?&]ab_/.test(location.search);\n    }", "tests/redteam-boot-a11y-privacy.spec.js", "first load at \\?"],
    ["D75 on a fast first start the home view's entrance plays on at the release: the hero already read dims and rises", "js/boot-ready.js", "    settle();\n", "", "tests/redteam-boot-a11y-privacy.spec.js", "entrance does not play when the hold ends"],
    ["D76 what the app rebuilds in the hero as it starts fades in again from nothing", "css/styles.css", "html.vt-boot-pending.vt-boot-hero #view-home {\n  animation-duration: 0s !important;\n}\n", "html.vt-boot-pending.vt-boot-hero #view-home {\n  animation-duration: 0s !important;\n}\nhtml.vt-boot-hero #start-panel .start-main > :not(#start-kicker, #start-title) {\n  animation: fadeIn 0.2s;\n}\n", "tests/redteam-boot-a11y-privacy.spec.js", "language switch as the app starts"],
    ["D77 a scrollbar is forced on only while held: on a later load at a view that fits the window the header moves 7.5 px sideways as the app starts", "css/styles.css", "html.vt-scrollbar-room {\n  scrollbar-gutter: stable;\n}\n", "html.vt-boot-pending {\n  overflow-y: scroll;\n}\n", "tests/redteam-boot-a11y-privacy.spec.js", "does not move sideways as the app starts"],
    ["D78 only a first load's view is made whole at the release: a later load's home plays the tail of its entrance in sight", "js/boot-ready.js", "    settle();\n    if (hero) reveal();", "    if (hero) settle();\n    if (hero) reveal();", "tests/redteam-boot-a11y-privacy.spec.js", "view is whole when the hold ends"],
    ["D39 a loop experiment switched on while a first load shows the control arm's hero", "js/experiments-config.js", "    loop_home_2026_10: {\n      enabled: false,", "    loop_home_2026_10: {\n      enabled: true,", "tests/node/static-copy.test.mjs", ""],
    ["D40 the markup's hero title is not first.titleMarkup, so an English first load shows it in Spanish", "index.html", 'data-i18n="first.titleMarkup"', 'data-i18n="first.title"', "tests/node/static-copy.test.mjs", ""],
    // Review 6 of PR #42 (rt4): what the static check missed, read as the parser reads the page
    ["D79 a script that never runs (another type) is preloaded all the same: a wasted download", "index.html", "<script src=\"js/wake-lock.js?v=", "<script type=\"text/plain\" src=\"js/wake-lock.js?v=", "tests/node/boot-preload.test.mjs", ""],
    ["D80 a script fetched in another mode (a module) than its preload: fetched twice", "index.html", "<script src=\"js/wake-lock.js?v=", "<script type=\"module\" src=\"js/wake-lock.js?v=", "tests/node/boot-preload.test.mjs", ""],
    ["D81 the same, judged in the browser: a second download the parser does not wait for, seen once the page has loaded", "index.html", "<script src=\"js/wake-lock.js?v=", "<script type=\"module\" src=\"js/wake-lock.js?v=", "tests/redteam-boot-a11y-privacy.spec.js", "asks for every script at once"],
    ["D82 the preloads stand before the hero's end: the parser sets up 53 requests before the first paint's markup is read", "index.html", "        </section>\n\n        <!-- The scripts at the end of the body, asked for now", "        <!-- The scripts at the end of the body, asked for now", "tests/node/boot-preload.test.mjs", ""],
    ["D83 site-version.js deferred: the visitor's design is painted after the first frame", "index.html", "<script src=\"js/site-version.js?v=", "<script defer src=\"js/site-version.js?v=", "tests/node/boot-preload.test.mjs", ""],
    ["D84 a scrollbar's room is kept where scrollbars take none: a phone-wide page in a headless run is laid out 15 px narrower than the phone", "js/boot-head.js", "  if (probe.offsetWidth > probe.clientWidth) html.classList.add(\"vt-scrollbar-room\");", "  html.classList.add(\"vt-scrollbar-room\");", "tests/redteam-boot-a11y-privacy.spec.js", "keeps none of a scrollbar's room"],
    ["D85 no scrollbar's room is kept where scrollbars take room: the header moves sideways as the app starts", "js/boot-head.js", "  if (probe.offsetWidth > probe.clientWidth) html.classList.add(\"vt-scrollbar-room\");", "  if (probe.offsetWidth < probe.clientWidth) html.classList.add(\"vt-scrollbar-room\");", "tests/redteam-boot-a11y-privacy.spec.js", "does not move sideways as the app starts"],
    ["D86 under reduced motion the hold ends with its transitions: the page under the header turns visible a level per frame", "js/boot-ready.js", "    if (held) instant();\n", "", "tests/redteam-boot-a11y-privacy.spec.js", "arrives in one frame when the hold ends"],
    ["D87 the design row is drawn whole at once while the hero's content fades in under it", "js/boot-ready.js", ", #start-panel > :not(.start-main), #site-version-bar\";", ", #start-panel > :not(.start-main)\";", "tests/redteam-boot-a11y-privacy.spec.js", "fades in under its words"],
    ["D88 a scrollbar forced on only while held, at 1024 px: the title, sized by the window, grows 1.5 % as the app starts", "css/styles.css", "html.vt-scrollbar-room {\n  scrollbar-gutter: stable;\n}\n", "html.vt-boot-pending {\n  overflow-y: scroll;\n}\n", "tests/redteam-boot-a11y-privacy.spec.js", "nor does the title change size"],
  ].map(([name, file, from, to, spec, grep]) => ({
    name,
    file,
    from,
    to,
    cmd: spec.startsWith("tests/node/")
      ? node([spec])
      : [...PIANO_SPEC.slice(0, 3), spec, "--project=chromium", "--workers=4", "--reporter=dot", ...(grep ? ["-g", grep] : [])]
  })),
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
    ["B17 a token verified at boot grants Pro for ever in an open tab: the in-session expiry test is gone (A3)","js/license.js","if (typeof verified.exp === \"number\" && verified.exp + CLOCK_SKEW_S < now) {","if (false) {",["tests/trust-claims-expire.spec.js"]],
    // Merging #26 into main: its attacker-link test edited the config after main's freeze (QA-05), so the edit never
    // landed and the test passed with the allow-list matching by prefix. It now edits the config as it is assigned.
    ["B18 a checkout host is allowed by prefix, so creem.io.attacker.test passes as creem.io (#26 merge)","js/billing.js","      (h) => host === h || host.endsWith(\".\" + h)","      (h) => host === h || host.startsWith(h)",["tests/checkout-rail.spec.js"]],
    // The #26 merge review: three seams between the branch and main, each pinned by the test written for it.
    // A path under workers/ is a Node test.
    ["B19 Creem's return checkout_id is not read: every Creem buyer coming back is told the session is missing","js/billing.js","      params.get(\"checkout_id\") ||\n","",["tests/checkout-rail.spec.js"]],
    ["B20 a Creem return with no remembered intent is claimed on the region's rail","js/billing.js","(params.get(\"checkout_id\") ? \"creem\" : \"\")","\"\"",["tests/checkout-rail.spec.js"]],
    ["B21 Creem's return signature is left in the address bar","js/billing.js","        \"request_id\",\n        \"signature\"\n","        \"request_id\"\n",["tests/checkout-rail.spec.js"]],
    ["B22 a Creem product that is not ours names a plan and is sold as Pro (a buyer's metadata[plan] once got it past the allow-list; no metadata is read now)", "workers/entitlements/src/creem.js", "    return { plan: undefined, planSource: \"unlisted_product\", unlisted: true };", "    return { plan: \"pro_monthly\", planSource: \"unlisted_product\" };", ["workers/entitlements/test/creem.test.mjs"]],
    ["B23 the report limits name their buckets by the reporter's raw address, which the privacy page says is never stored","workers/entitlements/src/reports.js","await ipBucketKey(env, request, at, \"reports\")","request.headers.get(\"cf-connecting-ip\")",["workers/entitlements/test/reports.test.mjs"]],
    ["B24 a deployment with no key to pseudonymise addresses under still takes reports","workers/entitlements/src/reports.js","    ipKeyConfigured(env) &&\n","",["workers/entitlements/test/reports.test.mjs"]],
    ["B25 a full day of events still costs every request its per-address and per-browser writes","workers/entitlements/src/events.js","  if (shed) {\n    return shed;\n  }\n","",["workers/entitlements/test/events.test.mjs"]],
    ["B26 the events cap is read for one event, so a batch too big for what is left still writes its buckets","workers/entitlements/src/events.js","EVENTS_DAILY_CAP[1], at, clean.length);\n  if (room.ok) {","EVENTS_DAILY_CAP[1], at, 1);\n  if (room.ok) {",["workers/entitlements/test/events.test.mjs"]],
    // The #26 merge review, last passes: the report dialog as it would have gone live.
    ["B27 the guide loads no transport for the report dialog, so every report from it fails", "guide.html", "<script src=\"js/account.js?v=", "<script src=\"js/account-not-loaded.js?v=", ["tests/reports.spec.js"]],
    ["B28 a page with no way to send a report tells the visitor to check their connection", "js/reports.js", "return t(\"failNoTransport\");", "return t(\"failOffline\");", ["tests/reports.spec.js"]],
    ["B29 the report dialog's card turns white on a light-mode device while its buttons and focus ring stay tuned for dark", "js/reports.js", "  box-shadow:var(--shadow,0 12px 40px rgba(0,0,0,.35))}\n", "  box-shadow:var(--shadow,0 12px 40px rgba(0,0,0,.35))}\n@media (prefers-color-scheme: light){.vt-report{background:#fff;color:#0f172a}}\n", ["tests/reports.spec.js"]],
    ["B30 the report dialog's disclosures fall under the 44px floor", "js/reports.js", ".vt-report details summary{cursor:pointer;min-height:var(--min-tap,44px);", ".vt-report details summary{cursor:pointer;min-height:2.2rem;", ["tests/reports.spec.js"]],
    ["B31 the report dialog's choice pills fall under the 44px floor", "js/reports.js", "gap:.4rem;min-height:var(--min-tap,44px);\n  box-sizing:border-box;", "gap:.4rem;min-height:2.4rem;\n  box-sizing:border-box;", ["tests/reports.spec.js"]],
    ["B32 a disclosure in the report dialog shows no caret, so it reads as a line of text", "js/reports.js", ".vt-report details summary::before{content:\"▸\";color:var(--accent,#6eb4e8)}\n", "", ["tests/reports.spec.js"]],
    // The card button that still chose Stripe after #26 moved the markets to Creem.
    ["B33 the Pro dialog draws the retired Stripe and Mercado Pago pair, so its card button dead-ends on a rail no market sells on", "js/billing.js", "[...new Set([preferredRail(region), ...named])]", "[...new Set([\"stripe\", \"mercadopago\"])]", ["tests/checkout-rail.spec.js"]],
    ["B34 the Pro dialog marks no rail as the one in use", "js/app.js", "b.className = \"rail-btn\" + (rail === pricingRail ? \" active\" : \"\");", "b.className = \"rail-btn\";", ["tests/checkout-rail.spec.js"]],
    ["B35 the Pro dialog offers a rail with no checkout link once another can sell", "js/app.js", "row.replaceChildren(...(live.length ? live : rails).map(", "row.replaceChildren(...(rails).map(", ["tests/checkout-rail.spec.js"]],
    ["B36 the Pro dialog stays on the region's rail when it cannot sell and another can", "js/app.js", "    return sellable[0] || rails[0].rail;\n", "    return rails[0].rail;\n", ["tests/checkout-rail.spec.js"]],
    ["B37 the region's own rail is not drawn first", "js/billing.js", "[...new Set([preferredRail(region), ...named])]", "[...new Set([...named, preferredRail(region)])]", ["tests/checkout-rail.spec.js"]],
    // The copy pass on the merge: what the report dialog, the privacy page and the terms said.
    ["B38 the guide's English report button opens a Spanish dialog", "js/reports.js", "          lang: partLanguage(node)\n", "          lang: undefined\n", ["tests/reports.spec.js"]],
    ["B39 the report dialog does not say which language it is in", "js/reports.js", "    ui.overlay.lang = lang();\n", "", ["tests/reports.spec.js"]],
    ["B40 the text to paste on a public GitHub issue carries the reporter's address", "js/reports.js", "    // No contact line: the way out this text is for is a public GitHub issue,\n    // and the contact is prefilled with a signed-in reporter's own address.\n", "    if (form.contact) lines.push(`${t(\"labelContact\")}: ${form.contact}`);\n", ["tests/reports.spec.js"]],
    ["B41 the GitHub way out does not say GitHub is public", "js/reports.js", "      el(\"p\", { className: \"vt-report-hint\", text: t(\"failPublic\") }),\n", "", ["tests/reports.spec.js"]],
    ["B42 the dialog's list of what it attaches leaves out the time zone and the connection", "js/reports.js", "      el(\"li\", { text: t(\"envClock\") }),\n", "", ["tests/reports.spec.js"]],
    ["B43 a session that ran out while listing your reports reads as a failed send", "js/reports.js", "res && res.status === 401 ? t(\"mineNeedsAccount\") : failureText(res)", "failureText(res)", ["tests/reports.spec.js"]],
    ["B44 the report dialog's fields are under 16px, so an iPhone zooms into them", "js/reports.js", "\n  font-size:max(16px,1rem);color:inherit;", "\n  color:inherit;", ["tests/reports.spec.js"]],
    ["B45 the privacy page's list of what a report keeps leaves out the time zone", "privacy.html", "        <strong>zona horaria</strong> (solo la diferencia con UTC), si tu navegador\n", "        si tu navegador\n", ["tests/reports.spec.js"]],
    ["B46 the privacy page names Stripe, which no market sells on, instead of Creem", "privacy.html", "        país, <strong>Creem</strong> (Armitage", "        país, <strong>Stripe</strong> (Armitage", ["tests/node/privacy-rails.test.mjs"]],
    ["B47 the terms say \"Haces falta tener 13 años\"", "terms.html", "Hace falta tener 13 años", "Haces falta tener 13 años", ["tests/terms-page.spec.js"]],
    // The accessibility pass on the merge: what a keyboard and a screen reader got from the report dialog.
    ["B48 a screen reader is not told the report was saved, or its reference", "js/reports.js", "    announce(`${t(\"thanksTitle\")}. ${reference}`);\n", "", ["tests/reports.spec.js"]],
    ["B49 a screen reader is not told why the report was not saved", "js/reports.js", "    announce(`${t(\"failTitle\")}. ${failureText(res)}`);\n", "", ["tests/reports.spec.js"]],
    ["B50 the guide's report dialog lets Tab walk out to the page under it", "guide.html", "<script src=\"js/focus-trap.js?v=", "<script src=\"js/focus-trap-not-loaded.js?v=", ["tests/reports.spec.js"]],
    ["B51 the QA page's report dialog lets Tab walk out to the page under it", "qa/index.html", "<script src=\"../js/focus-trap.js?v=", "<script src=\"../js/focus-trap-not-loaded.js?v=", ["tests/reports.spec.js"]],
    // The price follows the rail: a Peruvian on the card rail pays Creem, which cannot charge soles.
    ["B52 the card rail shows a Peruvian soles that Creem never charges", "js/billing.js", "    if (rail === preferredRail(own)) return own;\n", "    return own;\n", ["tests/checkout-rail.spec.js"]],
    // Red-team round of 18 November 2026 on the payment rails (INPUT-1, WH-1 to WH-4), each killed by the test written for it.
    ["B53 an unsigned Mercado Pago request that breaks before its signature raises the write alarm again", "workers/entitlements/src/index.js", "    : handleMercadoPagoWebhook(request, env, url, options);", "    : recordingFailure(env, \"mercadopago\", options, () => handleMercadoPagoWebhook(request, env, url, options));", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B54 an unsigned Stripe request that breaks before its signature raises the write alarm again", "workers/entitlements/src/index.js", "    return handleStripeWebhook(request, env, options);", "    return recordingFailure(env, \"stripe\", options, () => handleStripeWebhook(request, env, options));", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B55 a signed Mercado Pago delivery whose write fails raises no alarm", "workers/entitlements/src/index.js", "  return recordingFailure(env, \"mercadopago\", options,", "  return ((_env, _rail, _options, run) => run())(env, \"mercadopago\", options,", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B56 a signed Stripe delivery whose write fails raises no alarm", "workers/entitlements/src/index.js", "  return recordingFailure(env, \"stripe\", options,", "  return ((_env, _rail, _options, run) => run())(env, \"stripe\", options,", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B57 a Mercado Pago id that is an object is converted, and {\"toString\":1} throws before the signature", "workers/entitlements/src/mercadopago.js", "  return typeof value === \"number\" && Number.isFinite(value) ? String(value) : null;", "  return value === null || value === undefined ? null : String(value);", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B58 the Mercado Pago signature is checked over the body's data.id, not the query's", "workers/entitlements/src/mercadopago.js", "  return idValue(query && query.get(\"data.id\"))\n    || bodyDataId(body)", "  return bodyDataId(body)\n    || idValue(query && query.get(\"data.id\"))", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B59 a Mercado Pago subscription's charge is filed under its receipt number again", "workers/entitlements/src/mercadopago.js", "    claimId: subscriptionId || unlinkedRecurring ? null : idValue(p.id),", "    claimId: idValue(p.id),", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B60 a Mercado Pago recurring charge is filed under its number again", "workers/entitlements/src/mercadopago.js", "    claimId: null,\n    subscriptionId: a.preapproval_id", "    claimId: idValue(a.id),\n    subscriptionId: a.preapproval_id", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B61 a claim the throttle refused answers 202 pending instead of 429", "workers/entitlements/src/index.js", "  if (found.refused) {\n    return json({ ok: false, reason: \"rate_limited\", retryAfter: found.refused.retryAfter }, 429, cors);", "  if (false) {\n    return json({ ok: false, reason: \"rate_limited\", retryAfter: found.refused.retryAfter }, 429, cors);", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B62 a link the throttle refused answers 202 pending instead of 429", "workers/entitlements/src/api.js", "    if (found.refused) {\n      return json({ ok: false, reason: \"rate_limited\", retryAfter: found.refused.retryAfter }, 429, cors);", "    if (false) {\n      return json({ ok: false, reason: \"rate_limited\", retryAfter: found.refused.retryAfter }, 429, cors);", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B63 every claim is throttled, Stripe's and Creem's random ids too", "workers/entitlements/src/api.js", "  if (provider !== \"mercadopago\" || !/^\\d+$/.test(sessionId) || !env.DB", "  if (!env.DB", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B64 the claim throttle names its bucket after the caller's raw address", "workers/entitlements/src/api.js", "    block: [`mpclaim:${await addressBlockKey(env, request, at, \"mpclaim\")}`, ...MP_CLAIM_IP_LIMIT],", "    block: [`mpclaim:${callerIp(request)}`, ...MP_CLAIM_IP_LIMIT],", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B65 the buyer's metadata[plan] on a Creem checkout names the plan again", "workers/entitlements/src/creem.js", "  const { plan, planSource, unlisted } = planForProduct(checkout && checkout.product, env);", "  const { plan, planSource, unlisted } = planForProduct(checkout && checkout.metadata && checkout.metadata.plan === \"pro_yearly\" ? { ...checkout.product, billing_period: \"every-year\" } : checkout && checkout.product, env);", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B66 with the Stripe price table filled in, a donation's one-time checkout is Pro", "workers/entitlements/src/stripe.js", "    return { ...update, plan: undefined, planSource: \"unlisted_one_time\", status: \"suspended\", paid: undefined };", "    return update;", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B67 with the Stripe price table filled in, a later checkout lifts an unlisted price's suspension", "workers/entitlements/src/stripe.js", "  return update.status === \"active\" ? { ...update, status: undefined, paid: undefined, timeless: true } : update;", "  return update;", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B68 with the Stripe price table empty, a one-time checkout is suspended too", "workers/entitlements/src/stripe.js", "  if (named || !stripePriceTableConfigured(env)) {", "  if (named) {", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B69 coming back from Mercado Pago with both ids, the site claims by the receipt number", "js/billing.js", "      params.get(\"preapproval_id\") ||\n      params.get(\"payment_id\") ||", "      params.get(\"payment_id\") ||\n      params.get(\"preapproval_id\") ||", ["workers/entitlements/test/site-client.test.mjs"]],
    ["B70 a gated Stripe subscription checkout moves the license's clock again, and a paid subscription delivered after it stays pending", "workers/entitlements/src/stripe.js", "  update.occurredAt = update.timeless ? null : unixOrNull(event.created);", "  update.occurredAt = unixOrNull(event.created);", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B71 the gate forgets to mark a stripped Stripe checkout as timeless", "workers/entitlements/src/stripe.js", "{ ...update, status: undefined, paid: undefined, timeless: true }", "{ ...update, status: undefined, paid: undefined }", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B72 a number that names a payment keeps the block's try, so payers behind one address spend each other's", "workers/entitlements/src/api.js", "  if (licenseId && tries.held.length) {", "  if (false) {", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B73 a refused number is looked up anyway and a hit passes, so a 429 only ever means miss", "workers/entitlements/src/api.js", "  if (tries.refused) {\n    return { licenseId: null, refused: tries.refused };\n  }", "  if (tries.refused) {\n    const hit = await getLicenseIdForClaim(ledgerReader(env), provider, sessionId);\n    return hit ? { licenseId: hit } : { licenseId: null, refused: tries.refused };\n  }", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B74 no deployment-wide ceiling on numbers looked up", "workers/entitlements/src/api.js", "  const tries = await reserveRateLimits(db, [number.record, number.block, number.ceiling], at);", "  const tries = await reserveRateLimits(db, [number.record, number.block], at);", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B75 the claim throttle counts by the full IPv6 address again", "workers/entitlements/src/events.js", "  return addressKey(env, addressBlock(callerIp(request)), at, scope);", "  return addressKey(env, callerIp(request), at, scope);", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B76 an IPv4-mapped address is masked to the /56 every IPv4 client shares (CVE-2026-30827)", "workers/entitlements/src/db.js", "  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {", "  if (false) {", ["workers/entitlements/test/address-block.test.mjs"]],
    ["B77 IPv6 is blocked by /64, not /56", "workers/entitlements/src/db.js", "${hex(groups[3] & 0xff00)}::/56`", "${hex(groups[3])}::/56`", ["workers/entitlements/test/address-block.test.mjs"]],
    ["B78 the compressed form is padded at the end, not where the :: stands", "workers/entitlements/src/db.js", "  const groups = [...head, ...new Array(halves.length === 2 ? missing : 0).fill(\"0\"), ...tail];", "  const groups = [...head, ...tail, ...new Array(halves.length === 2 ? missing : 0).fill(\"0\")];", ["workers/entitlements/test/address-block.test.mjs"]],
    ["B79 the claim throttle's window is a second, not an hour", "workers/entitlements/src/api.js", "`, ...MP_CLAIM_IP_LIMIT],", "`, MP_CLAIM_IP_LIMIT[0], 1],", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B80 one address gets nineteen misses, not the documented twenty", "workers/entitlements/src/api.js", "`, ...MP_CLAIM_IP_LIMIT],", "`, MP_CLAIM_IP_LIMIT[0] - 1, MP_CLAIM_IP_LIMIT[1]],", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B81 a link by payment number skips the throttle", "workers/entitlements/src/api.js", "    const found = await lookUpClaimId(env, request, provider, sessionId, nowSec(deps.now));", "    const found = { licenseId: await getLicenseIdForClaim(ledgerReader(env), provider, sessionId) };", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B82 a Mercado Pago body's falsy data stands in as the resource id", "workers/entitlements/src/mercadopago.js", "  return data && typeof data === \"object\" ? idValue(data.id) : null;", "  return idValue(data && data.id);", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B83 the throttle checks, looks up, and spends only after a miss, so a burst looks up every number", "workers/entitlements/src/api.js", "  const tries = number ? await takeTries(env.DB, number, at) : { held: [] };\n  if (tries.refused) {\n    return { licenseId: null, refused: tries.refused };\n  }\n  const licenseId = await getLicenseIdForClaim(ledgerReader(env), provider, sessionId);\n  if (licenseId && tries.held.length) {\n    await giveBlockTryBack(env.DB, number, tries.held);\n  }\n  return { licenseId };", "  for (const budget of number ? [number.record, number.block, number.ceiling] : []) {\n    const room = await peekRateLimit(env.DB, ...budget, at);\n    if (!room.ok) {\n      return { licenseId: null, refused: room };\n    }\n  }\n  const licenseId = await getLicenseIdForClaim(ledgerReader(env), provider, sessionId);\n  const tries = number && !licenseId ? await reserveRateLimits(env.DB, [number.record, number.block, number.ceiling], at) : { ok: true };\n  if (!tries.ok) {\n    return { licenseId: null, refused: tries };\n  }\n  return { licenseId };", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B84 the all-or-none statement checks only the first budget", "workers/entitlements/src/db.js", "  const full = limits.map((_, i) =>", "  const full = limits.slice(0, 1).map((_, i) =>", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B85 budgets are taken one statement each, and a request that loses one gives back the rest, writing rows for a 429", "workers/entitlements/src/db.js", "  const rows = limits.map((_, i) => `(?${3 * i + 1}, ?${3 * i + 2}, ?${3 * i + 3})`).join(\", \");\n  const full = limits.map((_, i) =>\n    `(bucket = ?${3 * i + 1} AND (window_start > ?${3 * i + 2} OR (window_start = ?${3 * i + 2} AND count >= ?${3 * i + 3})))`\n  ).join(\" OR \");\n  const taken = await db\n    .prepare(\n      `INSERT INTO rate_limits (bucket, count, window_start)\n       SELECT column1, 1, column2 FROM (VALUES ${rows})\n       WHERE NOT EXISTS (SELECT 1 FROM rate_limits WHERE ${full})\n       ON CONFLICT(bucket) DO UPDATE SET\n         count = CASE WHEN rate_limits.window_start = excluded.window_start THEN rate_limits.count + 1 ELSE 1 END,\n         window_start = excluded.window_start`\n    )\n    .bind(...limits.flatMap(([bucket, limit], i) => [bucket, windows[i], limit]))\n    .run();\n  return changedRows(taken) === limits.length;", "  const held = [];\n  for (const [i, [bucket, limit, windowSeconds]] of limits.entries()) {\n    const taken = await hitRateLimit(db, bucket, limit, windowSeconds, windows[i]);\n    if (!taken.ok) {\n      await releaseRateLimits(db, held);\n      return false;\n    }\n    held.push([bucket, windows[i]]);\n  }\n  return true;", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B86 a try is given back to whatever window the bucket is in now", "workers/entitlements/src/db.js", "WHERE bucket = ?1 AND window_start = ?2 AND count > 0", "WHERE bucket = ?1 AND ?2 = ?2 AND count > 0", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B87 a try given back twice goes below zero", "workers/entitlements/src/db.js", "WHERE bucket = ?1 AND window_start = ?2 AND count > 0", "WHERE bucket = ?1 AND window_start = ?2", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B88 a deleted Stripe subscription on an unlisted price keeps its whole period", "workers/entitlements/src/stripe.js", "    endsAt: (unpaid || unlisted) && endedAt !== null ? endedAt : undefined,", "    endsAt: unpaid && endedAt !== null ? endedAt : undefined,", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B89 the throttle gives its tries back before the lookup and takes them again after a miss", "workers/entitlements/src/api.js", "  const licenseId = await getLicenseIdForClaim(ledgerReader(env), provider, sessionId);\n  if (licenseId && tries.held.length) {\n    await giveBlockTryBack(env.DB, number, tries.held);\n  }", "  await releaseRateLimits(env.DB, tries.held);\n  const licenseId = await getLicenseIdForClaim(ledgerReader(env), provider, sessionId);\n  if (number && !licenseId && tries.held.length) {\n    const again = await reserveRateLimits(env.DB, [number.record, number.block, number.ceiling], at);\n    if (!again.ok) {\n      return { licenseId: null, refused: again };\n    }\n  }", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B90 a hit gives back the deployment ceiling's try too, so copies of a paid number write rows no budget caps", "workers/entitlements/src/api.js", "held.filter(([bucket]) => bucket === number.block[0])", "held.filter(([bucket]) => bucket !== number.record[0])", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B91 the per-block window is two hours", "workers/entitlements/src/api.js", "`, ...MP_CLAIM_IP_LIMIT],", "`, MP_CLAIM_IP_LIMIT[0], 7200],", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B92 the deployment ceiling's window is two hours", "workers/entitlements/src/limits.js", "export const MP_CLAIM_DEPLOYMENT_LIMIT = [50, 3600];", "export const MP_CLAIM_DEPLOYMENT_LIMIT = [50, 7200];", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B93 a number the block has already looked up this hour is refused once the block is spent", "workers/entitlements/src/api.js", "  return recorded.ok ? { held: [], refused: tries } : { held: [] };", "  return { held: [], refused: tries };", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B94 the block's marker is not per number, so one paid number makes every number free", "workers/entitlements/src/api.js", "addressBlockKey(env, request, at, `mpclaimn:${sessionId}`)", "addressBlockKey(env, request, at, \"mpclaimn\")", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B95 the number is recorded in a statement of its own before the tries, so a refused copy leaves its twin a free lookup", "workers/entitlements/src/api.js", "  const tries = await reserveRateLimits(db, [number.record, number.block, number.ceiling], at);", "  const marked = await reserveRateLimits(db, [number.record], at);\n  const tries = marked.ok ? await reserveRateLimits(db, [number.block, number.ceiling], at) : marked;", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B96 a number looked up is never recorded, so the payer's every poll spends a try", "workers/entitlements/src/api.js", "  const tries = await reserveRateLimits(db, [number.record, number.block, number.ceiling], at);", "  const tries = await reserveRateLimits(db, [number.block, number.ceiling], at);", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B97 the block's budget is left out of the statement, so one address walks the whole ceiling", "workers/entitlements/src/api.js", "  const tries = await reserveRateLimits(db, [number.record, number.block, number.ceiling], at);", "  const tries = await reserveRateLimits(db, [number.record, number.ceiling], at);", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B98 the record is read before the tries and not after a refusal, so the payer's twin is refused at the block's last try", "workers/entitlements/src/api.js", "  const tries = await reserveRateLimits(db, [number.record, number.block, number.ceiling], at);\n  if (tries.ok) {\n    return { held: tries.held };\n  }\n  if (tries.refusedAt === 0) {\n    return { held: [] };\n  }\n  const recorded = await peekRateLimit(db, ...number.record, at);\n  return recorded.ok ? { held: [], refused: tries } : { held: [] };", "  const recorded = await peekRateLimit(db, ...number.record, at);\n  if (!recorded.ok) {\n    return { held: [] };\n  }\n  const tries = await reserveRateLimits(db, [number.record, number.block, number.ceiling], at);\n  return tries.ok ? { held: tries.held } : { held: [], refused: tries };", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B99 a hit gives back the ceiling's try instead of the block's", "workers/entitlements/src/api.js", "held.filter(([bucket]) => bucket === number.block[0])", "held.filter(([bucket]) => bucket === number.ceiling[0])", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B100 a hit gives the number's record back too, so a payer's next poll pays again", "workers/entitlements/src/api.js", "held.filter(([bucket]) => bucket === number.block[0])", "held.filter(([bucket]) => bucket !== number.ceiling[0])", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B101 a straggler from the hour before drags a bucket back to its window", "workers/entitlements/src/db.js", "(window_start > ?${3 * i + 2} OR (window_start", "((window_start", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B102 a try is given back by resetting the bucket", "workers/entitlements/src/db.js", "SET count = count - 1 WHERE", "SET count = 0 WHERE", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B103 a give-back that fails fails the claim of a payment already found", "workers/entitlements/src/api.js", "  try {\n    await releaseRateLimits(db, held.filter(([bucket]) => bucket === number.block[0]));\n  } catch (error) {\n    console.error(\"claim throttle give-back failed\", error && error.message);\n  }", "  await releaseRateLimits(db, held.filter(([bucket]) => bucket === number.block[0]));", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B104 a request that loses the race twice is told to wait the hour out, when the hour has only just turned", "workers/entitlements/src/db.js", "      return { ok: false, held: [], retryAfter: 1 };", "      return { ok: false, held: [], retryAfter: limits[0][2] };", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B105 the deployment ceiling's window is ten minutes", "workers/entitlements/src/api.js", "    ceiling: [\"mpclaim:all\", ...MP_CLAIM_DEPLOYMENT_LIMIT]", "    ceiling: [\"mpclaim:all\", MP_CLAIM_DEPLOYMENT_LIMIT[0], 600]", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B106 a number's record lasts half an hour", "workers/entitlements/src/api.js", "    record: [`mpclaimn:${numberKey}`, 1, MP_CLAIM_IP_LIMIT[1]],", "    record: [`mpclaimn:${numberKey}`, 1, 1800],", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B107 a number's record lasts the whole day", "workers/entitlements/src/api.js", "    record: [`mpclaimn:${numberKey}`, 1, MP_CLAIM_IP_LIMIT[1]],", "    record: [`mpclaimn:${numberKey}`, 1, 86400],", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B108 a number's record is kept per address, not per block", "workers/entitlements/src/api.js", "addressBlockKey(env, request, at, `mpclaimn:${sessionId}`)", "addressBlockKey(env, request, at, `mpclaimn:${sessionId}:${callerIp(request)}`)", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B109 a recorded number's poll reads its record twice", "workers/entitlements/src/api.js", "  if (tries.refusedAt === 0) {\n    return { held: [] };\n  }\n", "", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B110 any budget found full is taken for the record, so a spent block looks up for free", "workers/entitlements/src/db.js", "retryAfter: room.retryAfter, refusedAt: i }", "retryAfter: room.retryAfter, refusedAt: 0 }", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B111 a request that loses its write to the turn of the hour is refused though it has room", "workers/entitlements/src/db.js", "    if (attempt >= 1) {", "    if (attempt >= 0) {", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B112 the link reads the throttle's clock before its body", "workers/entitlements/src/api.js", "lookUpClaimId(env, request, provider, sessionId, nowSec(deps.now));", "lookUpClaimId(env, request, provider, sessionId, at);", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B113 the throttle fails open when D1 refuses its writes", "workers/entitlements/src/api.js", "  const tries = number ? await takeTries(env.DB, number, at) : { held: [] };", "  const tries = number ? await takeTries(env.DB, number, at).catch(() => ({ held: [] })) : { held: [] };", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B114 the deployment ceiling goes back to 200 an hour, 38,400 billed rows a day", "workers/entitlements/src/limits.js", "export const MP_CLAIM_DEPLOYMENT_LIMIT = [50, 3600];", "export const MP_CLAIM_DEPLOYMENT_LIMIT = [200, 3600];", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B115 the deployment ceiling rises one try past the day budgeted for its writes", "workers/entitlements/src/limits.js", "export const MP_CLAIM_DEPLOYMENT_LIMIT = [50, 3600];", "export const MP_CLAIM_DEPLOYMENT_LIMIT = [51, 3600];", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    ["B116 the deployment ceiling is no more than one block's budget", "workers/entitlements/src/limits.js", "export const MP_CLAIM_DEPLOYMENT_LIMIT = [50, 3600];", "export const MP_CLAIM_DEPLOYMENT_LIMIT = [20, 3600];", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]],
    // Paying while signed in (VG-83, VG-86, VG-88), each pinned by the spec written for it.
    ["B118 the sign-in gate holds a payment for a sign-in this browser cannot show (VG-88)", "js/billing.js", "if (account && account.configured && !account.signedIn && signInOffered(account)) {", "if (account && account.configured && !account.signedIn) {", ["tests/checkout-signin.spec.js"]],
    ["B119 a 202 'pending' from the link is taken for the link: the reference is forgotten (VG-83)", "js/account.js", "if (res.ok && res.data?.ok === true) {", "if (res.ok && res.data) {", ["tests/checkout-bound.spec.js"]],
    ["B120 a paid licence the account does not show is dropped without a link being tried (VG-83)", "js/account.js", "} else if (global.VTLicense?.clear && !(await keptByLinking())) {", "} else if (global.VTLicense?.clear) {", ["tests/checkout-bound.spec.js"]],
    ["B121 the link waiting on the webhook is not kept across loads", "js/account.js", "    if (persist) writePendingLink(body);\n", "", ["tests/checkout-bound.spec.js"]],
    ["B122 a licence minted for the account is kept against the account's own answer", "js/account.js", "if (!claims || claims.accountId || !PAID_RAILS.has(claims.provider)) return null;", "if (!claims || !PAID_RAILS.has(claims.provider)) return null;", ["tests/checkout-bound.spec.js"]],
    ["B123 a worker that fails is taken as 'not yours': the paid licence is dropped", "js/account.js", "return res.ok || !LINK_FINAL_STATUSES.has(res.status);", "return res.ok;", ["tests/checkout-bound.spec.js"]],
    ["B124 the plan button is not held while the worker opens the checkout: a second press opens a second one", "js/app.js", "    setPlanButtonBusy(btn, true);\n    done.then((out) => {", "    done.then((out) => {", ["tests/checkout-bound.spec.js"]],
    ["B125 the page follows whatever address the worker's answer names", "js/billing.js", "const target = res && res.ok ? validateCheckoutUrl(res.url) : null;", "const target = res && res.ok ? { ok: true, url: res.url } : null;", ["tests/checkout-bound.spec.js"]],
    ["B126 nobody is told before paying that Creem sells the subscription", "js/app.js", "    paintMorNote(prelaunch);\n", "", ["tests/checkout-bound.spec.js"]],
    ["B127 a Creem subscriber has no button to cancel from (VG-86)", "js/app.js", "if (rail === \"creem\") return creemPortalOffered() ? \"creem\" : null;", "if (rail === \"creem\") return null;", ["tests/checkout-bound.spec.js"]],
    ["B128 a refused checkout says nothing", "js/app.js", "    if (res.mode === \"rate_limited\") {", "    if (false) {", ["tests/checkout-bound.spec.js", "-g", "a refusal or a failure keeps the page"]],
    ["B129 the claim landing does not link at once: the account waits for the next scheduled retry", "js/app.js", "      if (res?.ok) acct.retryPendingLink?.()?.then(settled).catch(() => {});\n", "", ["tests/checkout-bound.spec.js"]],
    ["B130 the return page and the load's retry each send the same link", "js/account.js", "    if (!linksInFlight.has(key)) {", "    if (true) {", ["tests/checkout-bound.spec.js"]],
    ["B131 the terms promise a management link that never appears, again (VG-86)", "terms.html", "el botón\n          «Gestionar o cancelar suscripción» de la ventana de Pro abre tu portal", "el enlace\n          de gestión que aparecerá en la ventana de Pro abre tu portal", ["tests/terms-page.spec.js"]],
    ["B132 pre-launch, 'no card, nothing charged' stays at the foot below every plan", "js/app.js", "      placePayNote(payNote, prelaunch);\n", "", ["tests/pricing-prelaunch.spec.js"]],
    ["B133 pre-launch, 'Pro will switch on when payments are ready' sits above 'Try Pro free'", "js/app.js", "tt(trialOffered ? \"pricing.prelaunchLead\" : \"pricing.toast.unconfigured\")", "tt(\"pricing.toast.unconfigured\")", ["tests/pricing-prelaunch.spec.js"]],
    ["B134 Pro is sold as taking away ads nobody is shown", "js/app.js", "const featList = (p.features || []).filter((f) => f !== \"ad_free\" || adsOn);", "const featList = p.features || [];", ["tests/pricing-prelaunch.spec.js"]],
    ["B135 the free plan's price is a bare 0, with no currency", "js/billing.js", "    return { text: priceText(cur, amount, m.code), currency: cur, amount };", "    return { text: amount === 0 ? \"0\" : priceText(cur, amount, m.code), currency: cur, amount };", ["tests/pricing-prelaunch.spec.js"]],
    ["B136 a dollar price outside the US is written with a bare $, read as pesos in Mexico", "js/billing.js", "    return marketCode === \"US\" ? \"$\" : \"US$ \";", "    return \"$\";", ["tests/pricing-prelaunch.spec.js"]],
    ["B137 the region line names the market's currency code, PEN or MXN, not the money on the cards", "js/app.js", "${tt(\"pricing.currency.\" + cur)}`;", "${B.marketFor(priceRegion).currency}`;", ["tests/pricing-prelaunch.spec.js", "tests/checkout-rail.spec.js"]],
    ["B138 'no ads' is Pro's second bullet again, on the card's face", "js/billing-config.js", "          \"all_free\",\n          \"pro_insights\",", "          \"all_free\",\n          \"ad_free\",\n          \"pro_insights\",", ["tests/pricing-prelaunch.spec.js"]],
    ["B139 the ad-free bullet says only 'no ads', against 'never while you practise'", "js/i18n.js", "\"pricing.feat.ad_free\": \"Sin anuncios ni consejos patrocinados en ninguna parte\"", "\"pricing.feat.ad_free\": \"Sin anuncios ni recomendaciones patrocinadas\"", ["tests/pricing-prelaunch.spec.js"]],
    // Red-team round one, a spec per group of fixes (checkout-link-owner, checkout-link-retry, checkout-press,
    // manage-cancel-route, pricing-markets); each mutant puts one fixed defect back.
    ["B140 a pending link written by one account is retried under the next one's session", "js/account.js", "if (!rec || !session?.token || !ownsPending(rec)) return Promise.resolve(null);", "if (!rec || !session?.token) return Promise.resolve(null);", ["tests/checkout-link-owner.spec.js"]],
    ["B141 a pending link names only the session that wrote it, so its own account never retries it after signing in again", "js/account.js", "const entry = { ...body, at, acct: snapshot?.account?.id || prev?.acct || null, sess: sessionTag() };", "const entry = { ...body, at, acct: null, sess: sessionTag() };", ["tests/checkout-link-owner.spec.js"]],
    ["B142 a checkout still waiting to be claimed outlives sign-out, for the next account's visit to claim and link", "js/account.js", "    forget();\n    dropPendingClaim();", "    forget();", ["tests/checkout-link-owner.spec.js"]],
    ["B143 sign-out drops only a checkout already given up on, not one still being claimed", "js/billing.js", "if (!st || (st.status !== \"pending\" && st.status !== \"unclaimed\")) return;", "if (!st || st.status !== \"unclaimed\") return;", ["tests/checkout-link-owner.spec.js"]],
    ["B144 a signed-out buyer's checkout still waiting to be claimed is dropped on their next visit", "js/account.js", "    if (!session?.token) {\n      emit();\n      return getState();\n    }", "    if (!session?.token) {\n      global.VTBilling?.forgetPendingClaim?.();\n      emit();\n      return getState();\n    }", ["tests/checkout-link-owner.spec.js"]],
    ["B145 an account's trial or gift token replaces a paid licence held in the browser, which is never linked", "js/account.js", "      linkHeldLicence(data.licenseId);\n", "", ["tests/checkout-link-owner.spec.js"]],
    ["B146 the held paid licence is looked for only after the account's own token has replaced it", "js/account.js", "      linkHeldLicence(data.licenseId);\n      await global.VTLicense.adopt(data.token, data.licenseId);", "      await global.VTLicense.adopt(data.token, data.licenseId);\n      linkHeldLicence(data.licenseId);", ["tests/checkout-link-owner.spec.js"]],
    ["B147 a licence the account already names is sent to /v1/me/link again at sign-in", "js/account.js", "if (!held || held === accountLicenceId || linkSettled.has(held)", "if (!held || linkSettled.has(held)", ["tests/checkout-link-owner.spec.js"]],
    ["B148 a pending link that names nobody (stored before the fix) is retried by whoever signs in", "js/account.js", "return !!rec.sess && rec.sess === sessionTag();", "return !rec.sess || rec.sess === sessionTag();", ["tests/checkout-link-owner.spec.js"]],
    ["B149 a pending link written before the page heard from the account is never retried, even by the session that wrote it", "js/account.js", "return !!rec.sess && rec.sess === sessionTag();", "return false;", ["tests/checkout-link-owner.spec.js"]],
    ["B150 a link answered 'pending' is never asked again while the page stays open", "js/account.js", "    } else if (persist) {\n      scheduleLinkRetry();\n    }", "    } else if (persist) {\n      /* no in-page retry */\n    }", ["tests/checkout-link-retry.spec.js"]],
    ["B151 signing in with the emailed code does not retry the account's pending link", "js/account.js", "      { auth: false }\n    );\n    if (!res.ok || !res.data?.sessionToken) {\n      if (res.status === 0) return { ok: false, reason: \"offline\" };\n      return { ok: false, reason: res.data?.reason || \"error\" };\n    }\n    session = { token: res.data.sessionToken, expiresAt: res.data.expiresAt };\n    writeSession(session);\n    await adopt(res.data);\n    retryPendingLink().catch(() => {});\n", "      { auth: false }\n    );\n    if (!res.ok || !res.data?.sessionToken) {\n      if (res.status === 0) return { ok: false, reason: \"offline\" };\n      return { ok: false, reason: res.data?.reason || \"error\" };\n    }\n    session = { token: res.data.sessionToken, expiresAt: res.data.expiresAt };\n    writeSession(session);\n    await adopt(res.data);\n", ["tests/checkout-link-retry.spec.js"]],
    ["B152 signing in with Google does not retry the account's pending link", "js/account.js", "    const res = await request(\"POST\", \"/v1/auth/google\", { idToken }, { auth: false });\n    if (!res.ok || !res.data?.sessionToken) {\n      if (res.status === 0) return { ok: false, reason: \"offline\" };\n      return { ok: false, reason: res.data?.reason || \"error\" };\n    }\n    session = { token: res.data.sessionToken, expiresAt: res.data.expiresAt };\n    writeSession(session);\n    await adopt(res.data);\n    retryPendingLink().catch(() => {});\n", "    const res = await request(\"POST\", \"/v1/auth/google\", { idToken }, { auth: false });\n    if (!res.ok || !res.data?.sessionToken) {\n      if (res.status === 0) return { ok: false, reason: \"offline\" };\n      return { ok: false, reason: res.data?.reason || \"error\" };\n    }\n    session = { token: res.data.sessionToken, expiresAt: res.data.expiresAt };\n    writeSession(session);\n    await adopt(res.data);\n", ["tests/checkout-link-retry.spec.js"]],
    ["B153 a final answer (409, 404, 400) on a checkout reference never clears it, so it is retried for a week", "js/account.js", "    if (LINK_FINAL_STATUSES.has(status)) {\n      dropPendingLink(body);", "    if (false) {\n      dropPendingLink(body);", ["tests/checkout-link-retry.spec.js"]],
    ["B154 a 404 (a checkout the worker does not know) is taken for a passing failure and kept", "js/account.js", "const LINK_FINAL_STATUSES = new Set([400, 404, 409]);", "const LINK_FINAL_STATUSES = new Set([400, 409]);", ["tests/checkout-link-retry.spec.js"]],
    ["B155 every retry re-dates the pending link, so one retried daily never reaches its week", "js/account.js", "    const at = prev ? prev.at : Date.now();", "    const at = Date.now();", ["tests/checkout-link-retry.spec.js"]],
    ["B156 with storage refusing writes, the retries read only storage and the in-memory copy is ignored", "js/account.js", "      rec = raw ? JSON.parse(raw) : pendingMemOnly ? pendingMem : null;", "      rec = raw ? JSON.parse(raw) : null;", ["tests/checkout-link-retry.spec.js"]],
    ["B157 with storage reads throwing (site data blocked after load), the in-memory copy is ignored", "js/account.js", "    } catch {\n      rec = pendingMem;\n    }", "    } catch {\n      rec = null;\n    }", ["tests/checkout-link-retry.spec.js"]],
    ["B158 the link request has no timeout, so a stalled one hangs refresh() and every later refresh", "js/account.js", "    const res = await request(\"POST\", \"/v1/me/link\", body, { timeoutMs: LINK_TIMEOUT_MS });", "    const res = await request(\"POST\", \"/v1/me/link\", body);", ["tests/checkout-link-retry.spec.js"]],
    ["B159 a 503 (the worker failing for a moment) is taken for a final answer and the reference forgotten", "js/account.js", "const LINK_FINAL_STATUSES = new Set([400, 404, 409]);", "const LINK_FINAL_STATUSES = new Set([400, 404, 409, 503]);", ["tests/checkout-link-retry.spec.js"]],
    ["B160 a 401 'revoked' or 'expired' on a Subscribe press is a failed checkout, and the dead session stays", "js/account.js", "    if (res.status === 401) return lostSession();\n    return refusalOf(res);", "    return refusalOf(res);", ["tests/checkout-press.spec.js"]],
    ["B161 a 401 on a Manage press leaves the dead session signed in", "js/account.js", "    if (res.status === 401) return lostSession();\n    return {\n      ok: false,", "    return {\n      ok: false,", ["tests/checkout-press.spec.js"]],
    ["B162 a 401 on a press asks them to sign in but keeps the dead session, so the panel still says signed in", "js/account.js", "  function lostSession() {\n    forget();\n", "  function lostSession() {\n", ["tests/checkout-press.spec.js"]],
    ["B163 any checkout the worker fails to open (a 502) signs the buyer out", "js/account.js", "    if (res.status === 401) return lostSession();\n    return refusalOf(res);", "    if (res.status >= 400) return lostSession();\n    return refusalOf(res);", ["tests/checkout-press.spec.js"]],
    ["B164 every press opens its own worker checkout and a redraw of the Pro dialog never hears one is out (the pre-fix code)", "js/billing.js", "    return workerOpening && openingSession === sessionNow() ? workerOpening : null;", "    return null;", ["tests/checkout-press.spec.js"]],
    ["B165 a second caller while a worker checkout opens asks the worker for another one (the workerOpening guard removed)", "js/billing.js", "    if (!checkoutOpening()) beginOpening(planId, rail);", "    beginOpening(planId, rail);", ["tests/checkout-press.spec.js"]],
    ["B166 the Pro dialog redrawn mid-request draws the pressed plan's button idle and pressable again", "js/app.js", "    if (busy) followOpening(busy, opening.done, true);\n", "", ["tests/checkout-press.spec.js"]],
    ["B167 the sign-in panel a Google-blocked buyer's press opens never offers to go on and pay (paintPayAnyway removed)", "js/app.js", "    paintPayAnyway(offer);\n", "", ["tests/checkout-press.spec.js"]],
    ["B168 the panel offers to pay without an account even where emailed codes are a way in", "js/app.js", "const show = !!(want && offer.blocked && window.VTBilling", "const show = !!(want && window.VTBilling", ["tests/checkout-press.spec.js", "tests/checkout-bound.spec.js"]],
    ["B169 with the worker checkout on, a signed-out buyer who cannot sign in is sent to sign in instead of to the link", "js/billing.js", "    if (!account.signedIn && !signInOffered(account) && checkoutUrl(planId, rail)) return null;\n", "", ["tests/checkout-press.spec.js"]],
    ["B170 a Mercado Pago payer's 'Manage or cancel subscription' button is not drawn (no Mercado Pago route in manageRoute)", "js/app.js", "if (rail === \"mercadopago\") return \"mercadopago\";", "", ["tests/manage-cancel-route.spec.js"]],
    ["B171 the page follows any portal URL the worker's answer names, Creem's or not", "js/app.js", "const target = res?.ok ? window.VTBilling.validateCheckoutUrl(res.url) : null;", "const target = res?.ok ? { ok: true, url: res.url } : null;", ["tests/manage-cancel-route.spec.js"]],
    ["B172 the Creem Manage button is drawn on a worker whose health says it cannot open the portal", "js/app.js", "return !!acct?.signedIn && rails?.creemPortal !== false;", "return !!acct?.signedIn;", ["tests/manage-cancel-route.spec.js"]],
    ["B173 the Creem cancel line names the Manage button where none is drawn (cancelNoteKey always pricing.cancel.<rail>)", "js/app.js", "    return rail === \"creem\" ? \"pricing.cancel.creemEmail\" : \"\";", "    return \"pricing.cancel.\" + rail;", ["tests/manage-cancel-route.spec.js"]],
    ["B174 a Creem renewal still being retried after the paid period loses its Manage button (billingRailFor ignores billingRails)", "js/app.js", "const rails = window.VTAccount?.getState?.()?.billingRails || [];", "const rails = [];", ["tests/manage-cancel-route.spec.js"]],
    ["B175 the Creem merchant-of-record notice is shown to a buyer on the Mercado Pago rail", "js/app.js", "const show = !prelaunch && pricingRail === \"creem\";", "const show = !prelaunch;", ["tests/manage-cancel-route.spec.js"]],
    ["B176 the Mercado Pago tab is opened with a handle back on the site's tab (no noopener)", "js/app.js", "window.open(MP_SUBSCRIPTIONS_URL, \"_blank\", \"noopener,noreferrer\");", "window.open(MP_SUBSCRIPTIONS_URL, \"_blank\");", ["tests/manage-cancel-route.spec.js"]],
    ["B177 the account layer drops the billingRails /v1/me reports, so a lapsed renewal loses its Manage button", "js/account.js", "billingRails: Array.isArray(snapshot?.billingRails) ? snapshot.billingRails : [],", "billingRails: [],", ["tests/manage-cancel-route.spec.js"]],
    ["B178 the page never learns from /v1/health that the worker cannot open the Creem portal", "js/account.js", "creemPortal: d.creemPortalConfigured === true,", "creemPortal: null,", ["tests/manage-cancel-route.spec.js"]],
    ["B179 the Creem cancel line checks only sign-in, so it names the button on a worker that cannot open the portal", "js/app.js", "    const drawn = manageRoute(B, ent, cfg) === rail;", "    const drawn = !!window.VTAccount?.getState?.()?.signedIn;", ["tests/manage-cancel-route.spec.js"]],
    ["B180 Argentina names Mercado Pago as its rail, so with its links live an Argentine is sold a Peruvian plan in soles under US$", "js/billing-config.js", "{ code: \"AR\", name: \"Argentina\", currency: \"ARS\", rail: \"creem\", priority: 2 },", "{ code: \"AR\", name: \"Argentina\", currency: \"ARS\", rail: \"mercadopago\", priority: 2 },", ["tests/pricing-markets.spec.js"]],
    ["B181 Chile names Mercado Pago as its rail, so with its links live a Chilean is sold a Peruvian plan in soles under US$", "js/billing-config.js", "{ code: \"CL\", name: \"Chile\", currency: \"CLP\", rail: \"creem\", priority: 2 },", "{ code: \"CL\", name: \"Chile\", currency: \"CLP\", rail: \"mercadopago\", priority: 2 },", ["tests/pricing-markets.spec.js"]],
    ["B182 Colombia names Mercado Pago as its rail, so with its links live a Colombian is sold a Peruvian plan in soles under US$", "js/billing-config.js", "{ code: \"CO\", name: \"Colombia\", currency: \"COP\", rail: \"creem\", priority: 2 },", "{ code: \"CO\", name: \"Colombia\", currency: \"COP\", rail: \"mercadopago\", priority: 2 },", ["tests/pricing-markets.spec.js"]],
    ["B183 pro_monthly loses its euro price again, so Spain is shown US$ 7.99 beside 49 € while the worker sells the euro product", "js/billing-config.js", "        priceEur: 7.99,\n", "", ["tests/pricing-markets.spec.js", "-g", "truth-4 under VG-85"]],
    ["B184 the Mercado Pago rail button says 'Perú / LATAM' for a seller account that only sells in Peru", "js/billing-config.js", "labelEs: \"Mercado Pago (Perú)\",", "labelEs: \"Mercado Pago (Perú / LATAM)\",", ["tests/pricing-markets.spec.js"]],
    ["B185 the Spanish busy toast for a 429 tells the buyer to wait a few minutes, where the window can have 59 left", "js/i18n.js", "\"pricing.toast.checkoutBusy\": \"Demasiados intentos seguidos. Vuelve a intentarlo dentro de una hora como mucho; no se cobró nada.\",", "\"pricing.toast.checkoutBusy\": \"Demasiados intentos seguidos. Espera unos minutos y vuelve a intentarlo; no se cobró nada.\",", ["tests/pricing-markets.spec.js"]],
    ["B186 the English busy toast for a 429 tells the buyer to wait a few minutes, where the window can have 59 left", "js/i18n.js", "\"pricing.toast.checkoutBusy\": \"Too many tries in a row. Wait an hour at most, then try again; nothing was charged.\",", "\"pricing.toast.checkoutBusy\": \"Too many tries in a row. Wait a few minutes and try again; nothing was charged.\",", ["tests/rt2-p2-lapsed.spec.js", "-g", "truth-8 .en."]],
    ["B187 the Spanish terms give the Creem price as a bare $7.99 / $49, the peso's sign in four of its markets", "terms.html", "<strong>US$ 7.99 al mes</strong> o <strong>US$ 49 al año</strong>, en dólares de EE. UU.", "<strong>$7.99 al mes</strong> o <strong>$49 al año</strong>.", ["tests/pricing-markets.spec.js", "-g", "Creem price"]],
    ["B188 the Spanish privacy notice says the account's email is never shared, while the worker passes it to Creem", "privacy.html", "No vendemos nada de\n        eso ni hay publicidad basada en ello.", "No vendemos ni\n        compartimos nada de eso, y no hay publicidad basada en ello.", ["tests/pricing-markets.spec.js", "-g", "privacy notice says where"]],
    ["B189 the English privacy notice says the account's email is never shared, while the worker passes it to Creem", "privacy.html", "We do not sell any of it and there is no\n          advertising based on it.", "We do not sell or share any of it and there is no\n          advertising based on it.", ["tests/pricing-markets.spec.js", "-g", "privacy notice says where"]],
    // The refusal cases in checkout-bound.spec.js once read a toast left from the case before.
    ["B190 a worker answer naming a page that is not a checkout is dropped without a word", "js/billing.js", "    const mode = WORKER_CHECKOUT_REFUSALS[res && res.reason] || \"checkout_failed\";", "    const mode = res && res.ok ? \"ignored\" : WORKER_CHECKOUT_REFUSALS[res && res.reason] || \"checkout_failed\";", ["tests/checkout-bound.spec.js"]],
    // Aesthetic pass, round one: a Manage button with no line saying why, and VG-88's offer under a toast saying the opposite.
    ["B191 a subscriber whose renewal is being retried gets the button with no line saying why", "js/app.js", "    if (drawn) return key;", "    if (drawn) return \"\";", ["tests/checkout-bound.spec.js", "-g", "a renewal still being retried"]],
    ["B192 without Pro the Manage button ignores the subscriptions /v1/me still lists", "js/app.js", "    return [\"creem\", \"mercadopago\"].find((r) => rails.includes(r)) || null;", "    return null;", ["tests/checkout-bound.spec.js"]],
    ["B193 the 'sign in first' toast stays over VG-88's offer to pay without signing in", "js/app.js", "    if (show && box.hidden) hideToast();\n", "", ["tests/checkout-bound.spec.js"]],
    ["B195 'Continue to payment' does nothing", "js/app.js", "    $(\"#account-pay-anyway-btn\")?.addEventListener(\"click\", payAnyway);\n", "", ["tests/checkout-bound.spec.js"]],
    // A worker older than the Creem route (the live one before its redeploy) answers health without the Creem fields.
    // Round two: what the new specs found in round one's fixes.
    ["B200 a claim already running when the buyer signs out goes on and stores their licence for the next account", "js/license.js", "    if (generation !== claimGeneration) return { ok: false, reason: \"cancelled\" };\n", "", ["tests/checkout-link-owner.spec.js"]],
    ["B201 signing out drops the stored claim but leaves the one already running", "js/billing.js", "    global.VTLicense?.cancelClaims?.();\n", "", ["tests/checkout-link-owner.spec.js"]],
    ["B202 a session the worker refused (401) drops the claim, stranding a purchase whose link names only that session", "js/account.js", "      global.VTLicense?.clear?.();\n    } catch {", "      global.VTLicense?.clear?.();\n      global.VTBilling?.forgetPendingClaim?.();\n    } catch {", ["tests/checkout-link-owner.spec.js"]],
    ["B203 Mercado Pago's Peruvian plan is shown in US dollars to a buyer outside Peru", "js/billing.js", "    return regions.length === 1 ? regions[0] : \"WW\";", "    return \"WW\";", ["tests/pricing-markets.spec.js", "--workers=1"]],
    ["B204 a Manage press answered 401 says the portal failed instead of asking them to sign in", "js/app.js", "        if (res?.reason === \"no_session\") {", "        if (false) {", ["tests/checkout-press.spec.js"]],
    ["B205 a stale Creem Manage press says billing is not open yet, false for a payer", "js/app.js", "    if (billingRailFor(ent) === \"creem\") {", "    if (false) {", ["tests/manage-cancel-route.spec.js"]],
    ["B206 the dialog is not drawn again when /v1/health answers, so its first opening keeps a portal button the worker cannot open", "js/app.js", "      else repaintPricingOnHealth();\n", "", ["tests/rt2-p2-lapsed.spec.js", "tests/manage-cancel-route.spec.js", "-g", "first opening"]],
    ["B207 Pro goes on sale while the terms still send cancellations and complaints to the public repository", "js/billing-config.js", "        apiCheckout: false", "        apiCheckout: true", ["tests/terms-page.spec.js", "-g", "once anything is on sale"]],
    // VG-84's copy: a Mercado Pago buyer waits about an hour for the first charge, and a turned-down card is told so.
    ["MPB1 every rail gets Mercado Pago's wait-an-hour wording", "js/app.js", "const mp = provider === \"mercadopago\";", "const mp = true;", ["tests/mp-first-charge-wait.spec.js"]],
    ["MPB2 «Comprobar mi pago» loses the rail, so a Mercado Pago buyer gets the generic wording", "js/app.js", "const provider = window.VTBilling?.getEntitlement?.()?.raw?.provider || null;", "const provider = null;", ["tests/mp-first-charge-wait.spec.js"]],
    ["MPB3 the return from the checkout loses the rail, so a Mercado Pago buyer gets the generic wording", "js/app.js", "claimResultToast(res, ret.provider);", "claimResultToast(res, null);", ["tests/mp-first-charge-wait.spec.js"]],
    ["MPB4 a turned-down Mercado Pago card gets the generic failure", "js/app.js", "} else if (mp && res?.reason === \"declined\") {", "} else if (false) {", ["tests/mp-first-charge-wait.spec.js"]],
    ["MPB5 a turned-down Mercado Pago card is told to wait about an hour", "js/app.js", "} else if (mp && res?.reason === \"pending\") {", "} else if (mp && (res?.reason === \"pending\" || res?.reason === \"declined\")) {", ["tests/mp-first-charge-wait.spec.js"]],
    ["MPB6 the wait copy goes back to 'cuota' and 'en cuanto entre'", "js/i18n.js", "Mercado Pago hace el primer cobro alrededor de una hora después de suscribirte. Cuando entre, Pro se activa al volver a abrir la app o al pulsar «Comprobar mi pago».", "Mercado Pago cobra la primera cuota alrededor de una hora después de suscribirte. Pro se activa en cuanto entre; lo comprobamos otra vez cuando vuelvas a abrir la app.", ["tests/mp-first-charge-wait.spec.js"]],
    ["MPB7 the English wait copy names a button the page does not have", "js/i18n.js", "Once it goes through, Pro switches on the next time you open the app, or when you tap “Check my payment”.", "Once it goes through, Pro switches on the next time you open the app, or when you tap “I paid”.", ["tests/mp-first-charge-wait.spec.js"]],
    // VG-85 decided 2026-11-22: euros in the European Union, US dollars elsewhere; the price shown is the price charged.
    ["B280 Austria's time zone is missing, so an en-US browser in Vienna is American and shown dollars", "js/billing.js", "[\"Europe/Vienna\", \"AT\"], ", "", ["tests/node/euro-pricing.test.mjs"]],
    ["B281 a European language overrules a zone outside the Union: de-AT in Lima is Austrian, de-DE in Zurich German", "js/billing.js", "    if (tz.includes(\"/\") && !tz.startsWith(\"Etc/\")) return \"\";\n", "", ["tests/node/euro-pricing.test.mjs"]],
    ["B282 the Union is read after the other markets, so an en-US browser in Warsaw is American again", "js/billing.js", "      const eu = euRegion(lang, tz);\n      if (eu) return eu;\n      const sign = REGION_SIGNS.find(([, zones, suffixes]) =>\n        zones.some((zone) => tz.includes(zone)) || suffixes.some((suffix) => lang.endsWith(suffix)));\n      if (sign) return sign[0];\n", "      const sign = REGION_SIGNS.find(([, zones, suffixes]) =>\n        zones.some((zone) => tz.includes(zone)) || suffixes.some((suffix) => lang.endsWith(suffix)));\n      if (sign) return sign[0];\n      const eu = euRegion(lang, tz);\n      if (eu) return eu;\n", ["tests/node/euro-pricing.test.mjs"]],
    ["B283 Etc/UTC is read as a place outside the Union, so a hardened Irish browser is never Irish", "js/billing.js", "    if (tz.includes(\"/\") && !tz.startsWith(\"Etc/\")) return \"\";", "    if (tz.includes(\"/\")) return \"\";", ["tests/node/euro-pricing.test.mjs"]],
    ["B284 a subtag after a private-use singleton is read as the region: en-x-fr is France", "js/billing.js", "      if (part.length === 1) return \"\";\n", "", ["tests/node/euro-pricing.test.mjs"]],
    ["B284b only the first subtag is read, so a script subtag hides the region: sr-Latn-HR is not Croatia", "js/billing.js", "    for (const part of String(lang || \"\").split(/[-_]/).slice(1)) {", "    for (const part of String(lang || \"\").split(/[-_]/).slice(1, 2)) {", ["tests/node/euro-pricing.test.mjs"]],
    ["B285 Sweden is missing from the member states, so an sv-SE browser on UTC is shown dollars", "js/billing.js", "\"RO\", \"SK\", \"SI\", \"ES\", \"SE\"", "\"RO\", \"SK\", \"SI\", \"ES\"", ["tests/node/euro-pricing.test.mjs"]],
    ["B285b Austria is missing from the markets, so the Austrian falls to Worldwide and dollars", "js/billing-config.js", "      { code: \"AT\", name: \"Austria\", currency: \"EUR\", rail: \"creem\", priority: 3 },\n", "", ["tests/node/euro-pricing.test.mjs"]],
    ["B285c the old link name 'Poland' is not read as Poland, so an en-US browser reporting it is American and shown dollars", "js/billing.js", "[\"Poland\", \"PL\"], ", "", ["tests/node/euro-pricing.test.mjs"]],
    ["B286 a euro market is shown euros whether or not the path can charge them", "js/billing.js", " && euroChargeable(preferredRail(m.code))) return \"EUR\";", ") return \"EUR\";", ["tests/node/euro-pricing.test.mjs"]],
    ["B286b the euro price is decided plan by plan, so a config missing one priceEur shows US$ 7.99 beside 49 €", "js/billing.js", " && euroPriced() && ", " && ", ["tests/node/euro-pricing.test.mjs"]],
    ["B286c a plan with no euro price is written in euros, 'undefined €', when the others have one", "js/billing.js", "m.currency === \"EUR\" && plan.priceEur != null && euroPriced()", "m.currency === \"EUR\" && euroPriced()", ["tests/node/euro-pricing.test.mjs"]],
    ["B287 any answer from /v1/health reads as euros on sale, the field unread", "js/billing.js", "    if (apiCheckoutEnabled(rail) && accountState()?.configured) return accountRails()?.creemEur === true;", "    if (apiCheckoutEnabled(rail) && accountState()?.configured) return !!accountRails();", ["tests/node/euro-pricing.test.mjs"]],
    ["B288 one euro link is enough, so the dialog shows euros with the yearly charged in dollars", "js/billing.js", "    return paidPlanIds().every((id) => validateCheckoutUrl(linkOf(id, rail, \"EUR\")).ok);", "    return paidPlanIds().some((id) => validateCheckoutUrl(linkOf(id, rail, \"EUR\")).ok);", ["tests/node/euro-pricing.test.mjs"]],
    ["B289 before launch the Union is shown dollars, not the planned euro price", "js/billing.js", "    if (salesClosed()) return true;", "    if (salesClosed()) return false;", ["tests/node/euro-pricing.test.mjs"]],
    ["B289b demo mode reads as pre-launch, so a European is shown 7,99 € and a press falls to the demo unlock while an American pays the dollar link", "js/billing.js", "    return !h.ok && !h.demoUnlock;", "    return !h.ok;", ["tests/node/euro-pricing.test.mjs"]],
    ["B290 with no account layer the worker's euro answer is read instead of the euro links the press will use", "js/billing.js", "    if (apiCheckoutEnabled(rail) && accountState()?.configured) return", "    if (apiCheckoutEnabled(rail)) return", ["tests/node/euro-pricing.test.mjs"]],
    ["B291 the Spanish page writes the euro the English way, €7.99", "js/billing.js", "return pageLang() === \"en\" ? \"€\" + money(amount) : money(amount).replace(\".\", \",\") + \"\\u00a0€\";", "return \"€\" + money(amount);", ["tests/node/euro-pricing.test.mjs"]],
    ["B292 the Spanish euro keeps the decimal point, 7.99 €", "js/billing.js", "money(amount).replace(\".\", \",\") + \"\\u00a0€\"", "money(amount) + \"\\u00a0€\"", ["tests/node/euro-pricing.test.mjs"]],
    ["B293 a breaking space between the number and €, so the sign can wrap to a line of its own", "js/billing.js", "money(amount).replace(\".\", \",\") + \"\\u00a0€\"", "money(amount).replace(\".\", \",\") + \" €\"", ["tests/node/euro-pricing.test.mjs"]],
    ["B294 the euro card shows the dollar amount", "js/billing.js", "{ PEN: plan.pricePen, EUR: plan.priceEur, USD: plan.priceUsd }[cur]", "{ PEN: plan.pricePen, EUR: plan.priceUsd, USD: plan.priceUsd }[cur]", ["tests/node/euro-pricing.test.mjs"]],
    ["B295 a pasted link is always the dollar product's, under a card in euros", "js/billing.js", "    const link = linkOf(planId, rail, checkoutCurrency(planId, rail));", "    const link = linkOf(planId, rail, \"USD\");", ["tests/node/euro-pricing.test.mjs"]],
    ["B295b euro links do not count as on sale, so the terms say nothing is sold while a European can pay", "js/billing.js", "[\"links\", \"linksEur\"].some(", "[\"links\"].some(", ["tests/node/euro-pricing.test.mjs"]],
    ["B296 the press asks the worker for dollars under a euro card", "js/billing.js", "returnPath: returnPathHere(), currency: checkoutCurrency(planId, rail) })", "returnPath: returnPathHere(), currency: \"USD\" })", ["tests/node/euro-pricing.test.mjs"]],
    ["B296b the worker's currency_unavailable reads as a failed checkout, not an unavailable rail", "js/billing.js", "    currency_unavailable: \"provider_unavailable\",\n", "", ["tests/node/euro-pricing.test.mjs"]],
    ["B297 the checkout body carries no currency, so the worker charges dollars under a euro card", "js/account.js", "      returnPath: String(input?.returnPath || \"/\"),\n      currency: String(input?.currency || \"USD\")\n", "      returnPath: String(input?.returnPath || \"/\")\n", ["tests/pricing-euro.spec.js", "-g", "a es-ES browser in Europe/Madrid"]],
    ["B298 euros are read from the bound-checkout field, so a worker with no euro products shows Spain 7,99 €", "js/account.js", "          creemEur: d.creemEurConfigured === true,", "          creemEur: d.creemCheckoutConfigured === true,", ["tests/pricing-euro.spec.js", "-g", "a es-ES browser in Europe/Madrid"]],
    ["B299 the health answer repaints only the chrome, so a dialog opened before it keeps the dollar cards", "js/app.js", "    repaintPricingPrices();\n    updateBillingChrome();", "    updateBillingChrome();", ["tests/pricing-euro.spec.js", "-g", "before the worker has said"]],
    ["B299b the health answer draws the dialog again, so the keyboard falls off the fold or rail button it was on and an open fold closes, for every visitor", "js/app.js", "      else repaintPricingOnHealth();", "      else renderPricingModal();", ["tests/pricing-euro.spec.js", "-g", "before the worker has said"]],
    ["B299c the region line names the market in the config's English on the Spanish page (Poland, Worldwide)", "js/app.js", "    if (market.code === \"WW\") return tt(\"pricing.regionElsewhere\");\n    try {\n      const named = new Intl.DisplayNames([es ? \"es\" : \"en\"], { type: \"region\", fallback: \"none\" }).of(market.code);\n      return named || market.name;", "    try {\n      return market.name;", ["tests/pricing-euro.spec.js", "-g", "pl-PL browser|de-CH browser"]],
    ["B299d the repaint in place skips the region line, so euro cards sit under 'precios en dólares'", "js/app.js", "    paintPricingRegion(B, plans, B.marketFor(region), priceRegion);\n    for (const p of plans) {", "    for (const p of plans) {", ["tests/pricing-euro.spec.js", "-g", "turns the prices from US"]],
    ["B299e the repaint in place keeps the badge, so a euro yearly saving 38% still says 'Ahorra 49%'", "js/app.js", "    if ((badge ? badge.outerHTML : \"\") === badgeHtml) return;", "    return;", ["tests/pricing-euro.spec.js", "-g", "repaints the yearly saving"]],
    ["B299f the repaint in place leaves the price text, so the cards keep US$ after the answer said euros", "js/app.js", "    if (shown?.nodeType === Node.TEXT_NODE && shown.data !== text) shown.data = text;\n", "", ["tests/pricing-euro.spec.js", "-g", "before the worker has said"]],
    ["B299g a European's page asks /v1/health only when the dialog opens, so its first paint is US$ and turns to € in front of them", "js/app.js", "    prefetchRailsForPrices();\n", "", ["tests/pricing-euro.spec.js", "-g", "has been open a moment"]],
    ["B299h every visitor's page asks /v1/health at load, the American whose cards it never changes too", "js/billing.js", "    if (m.currency !== \"EUR\" || !apiCheckoutEnabled(preferredRail(m.code))) return false;", "    if (!apiCheckoutEnabled(preferredRail(m.code))) return false;", ["tests/node/euro-pricing.test.mjs"]],
    ["B299i the Spanish euro line does not say VAT is included", "js/i18n.js", "\"pricing.currency.EUR\": \"precios en euros (€), IVA incluido\",", "\"pricing.currency.EUR\": \"precios en euros (€)\",", ["tests/pricing-euro.spec.js", "-g", "a es-ES browser in Europe/Madrid"]],
    ["B299j the English euro line does not say VAT is included", "js/i18n.js", "\"pricing.currency.EUR\": \"prices in euros (€), VAT included\",", "\"pricing.currency.EUR\": \"prices in euros (€)\",", ["tests/pricing-euro.spec.js", "-g", "a en-US browser in Europe/Warsaw"]],
    ["B299k the product gate checks only the dollar links, so a euro link the allow-list refuses passes", "qa/creem-products.mjs", "  linksEur: { pro_monthly: \"CREEM_PRODUCT_PRO_MONTHLY_EUR\", pro_yearly: \"CREEM_PRODUCT_PRO_YEARLY_EUR\" }\n", "", ["tests/node/creem-products.test.mjs"]],
    ["B299l the product gate reads an empty table as an allow-list, and refuses links a worker with no ids admits", "qa/creem-products.mjs", "  if (!Object.values(table).some(Boolean)) return [];\n", "", ["tests/node/creem-products.test.mjs"]],
    ["B299m the product gate compares ids untrimmed, where the worker trims them", "qa/creem-products.mjs", "    out[name] = value.trim();", "    out[name] = value;", ["tests/node/creem-products.test.mjs"]],
    ["B299n the product gate waves through a link whose product it cannot read", "qa/creem-products.mjs", "  if (!id) return `providers.creem.${where} (${link}) names no prod_ id to check against ${name}`;", "  if (!id) return null;", ["tests/node/creem-products.test.mjs"]],
    // Red-team round two on the page's checkout plumbing: openings, sessions, the pending link, regions.
    ["B208 a redirect that never navigates holds every plan button for the page's life (the hold is never let go)", "js/billing.js", "      if (out && out.mode === \"redirect\") holdWhileLeaving(entry);", "      if (out && out.mode === \"redirect\") return;", ["tests/rt2-p1-opening.spec.js", "-g", "Stop while"]],
    ["B209 the hold let go after a redirect that never happened does not redraw, so the pressed plan stays on 'Opening secure checkout…'", "js/billing.js", "      releaseOpening(entry, true);\n    }, LEAVE_GRACE_MS);", "      releaseOpening(entry, false);\n    }, LEAVE_GRACE_MS);", ["tests/rt2-p1-opening.spec.js", "-g", "Stop while"]],
    ["B210 a page that has left for the checkout is let go while it is away, as if the redirect had not happened (pagehide does not cancel the timer)", "js/billing.js", "    global.addEventListener?.(\"pagehide\", left, { once: true });\n", "", ["tests/rt2-p1-opening.spec.js", "-g", "back/forward cache"]],
    ["B211 a return through the back/forward cache keeps the checkout opening, so every plan press is ignored without a word", "js/billing.js", "      if (e && e.persisted) releaseOpening(null, true);", "      if (e && e.persisted) return;", ["tests/rt2-p1-opening.spec.js", "-g", "back/forward cache"]],
    ["B212 a return through the back/forward cache frees the next press but does not redraw, so the pressed plan stays disabled on 'Opening secure checkout…'", "js/billing.js", "      if (e && e.persisted) releaseOpening(null, true);", "      if (e && e.persisted) releaseOpening(null, false);", ["tests/rt2-p1-opening.spec.js", "-g", "back/forward cache"]],
    ["B213 while one plan's checkout opens, the other plan and the rails look pressable and a press does nothing", "js/app.js", "    others.forEach((b) => holdChoice(b, true));\n", "", ["tests/rt2-p1-opening.spec.js", "-g", "states-6"]],
    ["B214 the plan and rail buttons held while a checkout opened are not given back when it fails", "js/app.js", "      held.forEach((b) => holdChoice(b, false));\n", "", ["tests/rt2-p1-opening.spec.js", "-g", "states-6"]],
    ["B215 a rail button held while a checkout opens is not dimmed, so it looks pressable", "js/app.js", "    b.style.opacity = held ? \"0.5\" : \"\";", "    b.style.opacity = \"\";", ["tests/rt2-p1-opening.spec.js", "-g", "states-6"]],
    ["B216 a link answered after a sign-out is adopted for whoever signed in next: their page shows the last person's account, licence and rails", "js/account.js", "    if (session?.token !== token) return answeredTooLate();\n    // Only the account's own answer is a link.", "    // Only the account's own answer is a link.", ["tests/rt2-p1-session.spec.js", "-g", "link answered after a sign-out"]],
    ["B217 a checkout answered 401 after a sign-out signs out whoever signed in next", "js/account.js", "    // and a 401 for their ended session is not a reason to sign out whoever is here now.\n    if (session?.token !== token) return answeredTooLate();\n", "    // and a 401 for their ended session is not a reason to sign out whoever is here now.\n", ["tests/rt2-p1-session.spec.js", "-g", "a 401 for a session that has already gone"]],
    ["B218 a billing portal answered after a sign-out is acted on for whoever signed in next (a 401 signs them out)", "js/account.js", "    // The portal of whoever asked, as for a checkout above.\n    if (session?.token !== token) return answeredTooLate();\n", "    // The portal of whoever asked, as for a checkout above.\n", ["tests/rt2-p1-session.spec.js", "-g", "portal answered after a sign-out"]],
    ["B219 the page follows a checkout the account layer hands back after the person who asked signed out", "js/billing.js", "    if (answer && answer.ok && sessionNow() !== asker) return { ok: false, reason: \"signed_out\" };\n", "", ["tests/rt2-p1-session.spec.js", "-g", "own last check: a checkout URL"]],
    ["B220 the page opens a billing portal the account layer hands back after the person who pressed Manage signed out", "js/app.js", "const moved = res?.ok && (window.VTAccount.getSessionToken?.() || null) !== asker;", "const moved = false;", ["tests/rt2-p1-session.spec.js", "-g", "own last check on Manage"]],
    ["B221 a checkout still opening for a session lost to a 401 counts as opening for the next person, whose press joins it and asks nothing", "js/billing.js", "    return workerOpening && openingSession === sessionNow() ? workerOpening : null;", "    return workerOpening;", ["tests/rt2-p1-session.spec.js", "-g", "lost without a sign-out"]],
    ["B222 the pending link is one slot again: the next account's purchase overwrites the last buyer's only reference", "js/account.js", "    const rest = list.filter((rec) => rec !== prev);", "    const rest = [];", ["tests/rt2-p1-pending.spec.js", "-g", "keeps Ana's pending link beside his"]],
    ["B223 a pending link stored by the shipped page (one object, under the old key) is not read, so that buyer's purchase is lost", "js/account.js", "    const legacy = legacyPendingLinks();", "    const legacy = null;", ["tests/rt2-p1-pending.spec.js", "-g", "keeps Ana's pending link beside his"]],
    ["B224 the pending list grows without a cap", "js/account.js", "    storePendingLinks([...roomBeside(rest), entry]);", "    storePendingLinks([...rest, entry]);", ["tests/rt2-p1-pending.spec.js", "-g", "four at most"]],
    ["B225 a final answer to one person's link clears everybody's entry for that reference", "js/account.js", "    const rest = list.filter((rec) => !(samePendingLink(body, rec) && ownsPending(rec)));", "    const rest = list.filter((rec) => !samePendingLink(body, rec));", ["tests/rt2-p1-pending.spec.js", "-g", "return address opened again"]],
    ["B226 keptByLinking's linkAsking guard is gone: adopting a link's answer that grants nothing asks for the same link again and refresh never settles", "js/account.js", "    if (linkAsking.has(licenseId)) return true;\n", "", ["tests/rt2-p1-session.spec.js", "-g", "tests-3"]],
    ["B227 a link the worker made whose answer grants nothing keeps the licence until the next refresh", "js/account.js", "    if (res.ok && !res.granted) return false;\n", "", ["tests/rt2-p1-session.spec.js", "-g", "tests-3"]],
    ["B228 every Spanish locale with no market of its own is put in Peru again (Uruguay, Ecuador told 'Tu región: Perú' in soles)", "js/billing.js", "      if (sign) return sign[0];\n", "      if (sign) return sign[0];\n      if (lang.startsWith(\"es\")) return \"PE\";\n", ["tests/node/rt2-p1-region.test.mjs"]],
    ["B229m a Peruvian locale yields to a Union time zone, so es-PE in Madrid is sold euros and loses Mercado Pago", "js/billing.js", "      if (lang.endsWith(\"-pe\")) return \"PE\";\n", "", ["tests/node/rt2-p1-region.test.mjs"]],
    ["B229 the Mercado Pago (Perú) button is drawn for every market, one press from a Peruvian plan a buyer elsewhere cannot pay", "js/billing.js", ".filter((r) => CHECKOUT_RAILS.has(r) && railSellsIn(r, region));", ".filter((r) => CHECKOUT_RAILS.has(r));", ["tests/pricing-markets.spec.js", "-g", "money-6"]],
    ["B229a after Stop on a slow load, or back from the checkout, the same plan asks the worker for a second Creem checkout instead of going back to the one it opened", "js/billing.js", "    const done = reopenLastCheckout(planId, rail) || openWorkerCheckout(planId, rail);", "    const done = openWorkerCheckout(planId, rail);", ["tests/rt2-p1-opening.spec.js", "-g", "Stop while"]],
    ["B229b a checkout gone back to is gone back to on every press, so one that has expired is a dead end until it is half an hour old", "js/billing.js", "    lastRedirect = null;\n    if (last.session !== sessionNow()", "    if (last.session !== sessionNow()", ["tests/rt2-p1-opening.spec.js", "-g", "same plan pressed again"]],
    ["B229c a checkout is gone back to however old it is, though it may have expired", "js/billing.js", " || nowMs() - last.at >= REOPEN_CHECKOUT_MS) return null;", ") return null;", ["tests/rt2-p1-opening.spec.js", "-g", "same plan pressed again"]],
    ["B229d the checkout the last person was sent to is reopened for whoever signed in next, so if they pay the last person gets the Pro", "js/billing.js", "    if (last.session !== sessionNow() || nowMs()", "    if (nowMs()", ["tests/rt2-p1-session.spec.js", "-g", "not reopened for Bruno"]],
    ["B229e a press of the other plan is sent back to the checkout opened for the first", "js/billing.js", "    if (!last || last.plan !== planId || last.provider !== rail) return null;", "    if (!last) return null;", ["tests/rt2-p1-opening.spec.js", "-g", "same plan pressed again"]],
    ["B229f a late answer for the last person's checkout lets go of the next person's opening, so a second press opens another checkout (V1)", "js/billing.js", "    if (!workerOpening || (entry && workerOpening !== entry)) return;", "    if (!workerOpening) return;", ["tests/rt2-p1-session.spec.js", "-g", "late answer leaves Bruno's"]],
    ["B229g past the cap the entry evicted is the first stored, not the oldest (V3)", "js/account.js", "    const kept = [...list].sort((a, b) => Number(a.at) - Number(b.at));", "    const kept = [...list];", ["tests/rt2-p1-pending.spec.js", "-g", "four at most|writer's own"]],
    ["B229h past the cap somebody else's oldest purchase is evicted while the writer has entries of their own to give up", "js/account.js", "      kept.splice(own >= 0 ? own : 0, 1);", "      kept.splice(0, 1);", ["tests/rt2-p1-pending.spec.js", "-g", "writer's own"]],
    ["B229i the old key is left in place once merged, so a linked reference is read back from it and sent again", "js/account.js", "    if (changed && storePendingLinks(live)) forgetLegacyPendingLink();", "    if (changed) storePendingLinks(live);", ["tests/rt2-p1-pending.spec.js", "-g", "from before the list"]],
    ["B229j an old tab's object for a reference the list already holds is added again, one more entry each time", "js/account.js", "    const added = (legacy || []).filter((rec) => !kept.some((k) => samePendingEntry(k, rec)));", "    const added = legacy || [];", ["tests/rt2-p1-pending.spec.js", "-g", "from before the list"]],
    ["B229k the old key is removed though storage refused the list holding its entry, so the purchase is gone on the next load", "js/account.js", "    if (changed && storePendingLinks(live)) forgetLegacyPendingLink();", "    if (changed) {\n      storePendingLinks(live);\n      forgetLegacyPendingLink();\n    }", ["tests/rt2-p1-pending.spec.js", "-g", "will not take the list"]],
    ["B229l retryPendingLink reports the first answer, not the one that linked, so the page is not redrawn after a later entry links (V8)", "js/account.js", "      if (res && (!out || res.ok)) out = res;", "      if (res && !out) out = res;", ["tests/rt2-p1-pending.spec.js", "-g", "what retryPendingLink reports"]],
    // Red team round two, group P2: what a lapsed or open subscription, the terms and the privacy notice told a buyer.
    ["B230 a checkout refused because a subscription is already open is a plain failure: subscription_open is dropped from WORKER_CHECKOUT_REFUSALS", "js/billing.js", "    subscription_open: \"subscription_open\",\n", "", ["tests/rt2-p2-lapsed.spec.js", "-g", "subscription is already open"]],
    ["B231 the worker's retryAfter is dropped from a refused checkout's outcome, so the toast cannot say how many minutes", "js/billing.js", "    if (res && res.retryAfter) out.retryAfter = res.retryAfter;\n", "", ["tests/rt2-p2-lapsed.spec.js", "-g", "truth-8"]],
    ["B232 Pro off with a subscription still open reads as free: Try Pro in the header, Free plan in the window and on the home card", "js/app.js", "    const lapsed = ent.pro ? null : openRailAside(ent);", "    const lapsed = null;", ["tests/rt2-p2-lapsed.spec.js", "-g", "never sold again"]],
    ["B233 the paid plans say Subscribe and open a second checkout while a subscription is still open", "js/app.js", "    if (p.id !== \"free\" && !own.disabled && openSubscriptionRail()) return openSubscriptionCta(ctx);\n", "", ["tests/rt2-p2-lapsed.spec.js", "-g", "never sold again"]],
    ["B234 the Pro window offers a free trial to a subscriber whose subscription is still open", "js/app.js", "const canTrial = !openRailAside(ent) && (accounts", "const canTrial = (accounts", ["tests/rt2-p2-lapsed.spec.js", "-g", "never sold again"]],
    ["B235 the account panel offers a free trial to a subscriber whose subscription is still open", "js/app.js", "        headerPlanState().kind !== \"lapsed\"\n      );", "        true\n      );", ["tests/rt2-p2-lapsed.spec.js", "-g", "never sold again"]],
    ["B236 the account panel says Free plan to a subscriber whose subscription is still open", "js/app.js", "    if (plan.kind === \"lapsed\") return tt(\"auth.planLapsed\");\n", "", ["tests/rt2-p2-lapsed.spec.js", "-g", "never sold again"]],
    ["B237 a gift month over a subscription still being charged hides the Manage button (billingRailFor trusts any provider while Pro is on)", "js/app.js", "    if (ent?.pro && isPaidRail(own)) return own;", "    if (ent?.pro) return own;", ["tests/rt2-p2-lapsed.spec.js", "-g", "gift month"]],
    ["B238 a Mercado Pago subscription still open with Pro off loses its Manage button and line (billingRails' mercadopago ignored)", "js/app.js", "    return [\"creem\", \"mercadopago\"].find((r) => rails.includes(r)) || null;", "    return [\"creem\"].find((r) => rails.includes(r)) || null;", ["tests/rt2-p2-lapsed.spec.js", "-g", "Mercado Pago subscription still open"]],
    ["B239 a Stripe payer with no portal configured is told about a Manage button that is not drawn", "js/app.js", "    if (drawn) return \"pricing.cancel.\" + rail;\n    return rail === \"creem\" ? \"pricing.cancel.creemEmail\" : \"\";", "    if (drawn || rail !== \"creem\") return \"pricing.cancel.\" + rail;\n    return \"pricing.cancel.creemEmail\";", ["tests/rt2-p2-lapsed.spec.js", "-g", "Stripe payer"]],
    ["B240 Pro off with a Creem subscription open, on a worker without the portal, is told nothing about where to manage it", "js/app.js", "    return rail === \"creem\" ? key + \"Email\" : \"\";", "    return \"\";", ["tests/rt2-p2-lapsed.spec.js", "-g", "cannot open the portal"]],
    ["B241 the on-hold line guesses the cause again: usually a payment that did not go through, false after a refund", "js/i18n.js", "\"pricing.cancel.lapsed\": \"Tu suscripción sigue abierta, pero Pro no está activo. Puede ser un cobro de renovación que se está reintentando, un pago que se te devolvió o una pausa. Con «Gestionar o cancelar suscripción» cambias cómo pagas, o la cancelas para que no se renueve.\",", "\"pricing.cancel.lapsed\": \"Tu suscripción sigue abierta, pero Pro no está activo: suele ser un cobro que no pasó. Con «Gestionar o cancelar suscripción» cambias la tarjeta o la cancelas.\",", ["tests/rt2-p2-lapsed.spec.js", "-g", "on-hold line"]],
    ["B242 the rate-limit toast drops the worker's wait and always says an hour at most", "js/app.js", "    if (!Number.isFinite(s) || s <= 0) return tt(\"pricing.toast.checkoutBusy\");", "    return tt(\"pricing.toast.checkoutBusy\");", ["tests/rt2-p2-lapsed.spec.js", "-g", "truth-8"]],
    ["B243 the rate-limit toast rounds the wait down, so it says to come back before the window ends", "js/app.js", "Math.ceil(s / 60)", "Math.floor(s / 60)", ["tests/rt2-p2-lapsed.spec.js", "-g", "truth-8"]],
    ["B244 a checkout refused for an open Creem subscription does not take them to their Creem portal", "js/app.js", "    if (rail === \"creem\" && creemPortalOffered()) return openCreemPortal(\"pricing.toast.subscriptionOpenCreem\");\n", "", ["tests/rt2-p2-lapsed.spec.js", "-g", "subscription is already open"]],
    ["B245 a checkout refused for an open Mercado Pago subscription does not take them to their Mercado Pago subscriptions", "js/app.js", "      window.location.assign(MP_SUBSCRIPTIONS_URL);\n", "", ["tests/rt2-p2-lapsed.spec.js", "-g", "subscription is already open"]],
    ["B246 a checkout refused for an open subscription on a worker without the portal does not say where Creem's link is", "js/app.js", "rail === \"creem\" ? \"pricing.toast.subscriptionOpenEmail\" : \"pricing.toast.subscriptionOpen\"", "\"pricing.toast.subscriptionOpen\"", ["tests/rt2-p2-lapsed.spec.js", "-g", "subscription is already open"]],
    ["B247 a plan drawn as Manage my subscription opens a checkout when pressed", "js/app.js", "        if (btn.dataset.route === \"manage\") return openBillingPortal();\n", "", ["tests/rt2-p2-lapsed.spec.js", "-g", "never sold again"]],
    ["B248 with no Manage route on this page the plans stay a live Manage my subscription that can only answer with a toast", "js/app.js", "    if (manageRoute(ctx.B, ctx.ent, ctx.B.cfg?.() || {})) {", "    if (true) {", ["tests/rt2-p2-lapsed.spec.js", "-g", "no button, but a line"]],
    ["B249 on the first opening the plans drawn before the worker said no keep a live Manage beside a hidden Manage button", "js/app.js", "      if (openSubscriptionRail()) renderPricingModal();\n      else repaintPricingOnHealth();", "      repaintPricingOnHealth();", ["tests/rt2-p2-lapsed.spec.js", "-g", "first opening"]],
    ["B250 Pro paid on one rail with a subscription also open on another is told its Pro comes from a gift or a trial", "js/app.js", "    const paidHere = ent.source !== \"trial\" && (isPaidRail(own) || own === \"\");", "    const paidHere = own === open;", ["tests/rt2-p2-lapsed.spec.js", "-g", "Pro paid on Mercado Pago"]],
    ["B251 pre-launch, a subscriber whose subscription is still open is told they can subscribe once payments open", "js/app.js", "const show = prelaunch && headerPlanState().kind === \"free\" && trialSpent();", "const show = prelaunch && !ent.pro && trialSpent();", ["tests/rt2-p2-lapsed.spec.js", "-g", "pre-launch, a subscriber"]],
    ["B252 the Spanish terms price Creem only outside Peru, while the Pro window sells Creem in Peru in US$", "terms.html", "Con tarjeta a través de Creem, también en Perú: ", "Fuera de Perú: ", ["tests/rt2-p2-copy.spec.js", "-g", "truth-3"]],
    ["B253 the English terms price Creem only elsewhere than Peru, while the Pro window sells Creem in Peru in US$", "terms.html", "By card through Creem, in Peru too: ", "Elsewhere: ", ["tests/rt2-p2-copy.spec.js", "-g", "truth-3"]],
    ["B254 the Spanish offer to pay without an account promises the purchase follows any sign-in", "js/i18n.js", "Tu Pro quedará guardado solo en él: para pasarlo a tu cuenta, entra más adelante desde este mismo navegador, no desde otro navegador ni otro dispositivo. Para cancelar, usa el enlace que Creem", "Tu Pro quedará en él, y en cuanto puedas entrar lo pasamos a tu cuenta. Para cancelar, usa el enlace que Creem", ["tests/rt2-p2-copy.spec.js", "-g", "truth-4"]],
    ["B255 the English offer to pay by a Mercado Pago link without an account promises the purchase follows any sign-in", "js/i18n.js", "Your Pro will be kept only in it: to move it to your account, sign in later from this same browser, not from another browser or device. To cancel, go to your Mercado Pago", "Your Pro stays in it, and as soon as you can sign in we move it to your account. To cancel, go to your Mercado Pago", ["tests/rt2-p2-copy.spec.js", "-g", "truth-4"]],
    ["B256 the offer to pay by a Creem link without an account does not say how to cancel there", "js/app.js", "    if (rail === \"creem\") return \"auth.payWithoutAccountCreem\";\n", "", ["tests/rt2-p2-copy.spec.js", "-g", "truth-4"]],
    ["B257 the Spanish privacy account section counts its recipients again (one case only: Creem), false once step 7 adds an email provider", "privacy.html", "Solo lo reciben quienes lo\n        necesitan para darte el servicio, y todos están nombrados abajo, en\n        <a href=\"#quien-recibe\">«Quién más los recibe, y dónde están»</a>: por\n        ejemplo, al", "Solo lo compartimos en un caso: al", ["tests/rt2-p2-privacy-recipients.spec.js"]],
    ["B258 the English privacy account section counts its recipients again (one case only: Creem), false once step 7 adds an email provider", "privacy.html", "Only those who need it to provide the service\n          receive it, and every one of them is named below in\n          <a href=\"#who-receives\">\"Who else receives any of it\"</a>: for example,\n          when", "We share it in one case only: when", ["tests/rt2-p2-privacy-recipients.spec.js"]],
    ["B259 the home card's plan tag says Free to a subscriber whose subscription is still open", "js/app.js", "        return [tt(\"value.tagLapsed\"), \"is-hold\"];", "        return [tt(\"value.tagFree\"), \"is-free\"];", ["tests/rt2-p2-lapsed.spec.js", "-g", "never sold again"]],
    ["B259a a subscriber on hold (Pro off, a subscription still open) gets the home card's Pro analysis unlocked", "js/app.js", "    const isProUser = !!(ent.pro || ent.status === \"trial\" || (plan.kind !== \"free\" && plan.kind !== \"lapsed\"));", "    const isProUser = !!(ent.pro || ent.status === \"trial\" || plan.kind !== \"free\");", ["tests/rt2-p2-lapsed.spec.js", "-g", "never sold again"]],
    ["B259b a gift over an open Creem subscription, on a worker without the portal, is told Pro is off", "js/app.js", "    return rail === \"creem\" ? key + \"Email\" : \"\";", "    return rail === \"creem\" ? \"pricing.cancel.lapsedEmail\" : \"\";", ["tests/rt2-p2-lapsed.spec.js", "-g", "cannot open the portal"]],
    ["B259c a refusal because a subscription is open, with no route here, never asks the worker again, so the plans keep selling", "js/app.js", "    window.VTAccount?.refresh?.();\n", "", ["tests/rt2-p2-lapsed.spec.js", "-g", "subscription is already open"]],
    ["B259d a refusal because a Creem subscription is open says only Opening billing portal, never that no second one was opened", "js/app.js", "    if (saidKey) toast(tt(saidKey), { durationMs: 8000 });\n    else toast(tt(\"pricing.toast.portalOpened\"));", "    toast(tt(\"pricing.toast.portalOpened\"));", ["tests/rt2-p2-lapsed.spec.js", "-g", "subscription is already open"]],
    ["B259e a refusal because a Mercado Pago subscription is open leaves for Mercado Pago without saying why", "js/app.js", "      toast(tt(\"pricing.toast.subscriptionOpenMp\"), { durationMs: 8000 });\n", "", ["tests/rt2-p2-lapsed.spec.js", "-g", "subscription is already open"]],
    ["B259f a free trial in this browser over an open subscription reads as Pro paid on it: You paid by card through Creem", "js/app.js", "    const paidHere = ent.source !== \"trial\" && (isPaidRail(own) || own === \"\");", "    const paidHere = isPaidRail(own) || own === \"\";", ["tests/rt2-p2-lapsed.spec.js", "-g", "never sold again"]],
    ["B259g a licence older than the rail field over an open subscription is told its Pro comes from a gift or a trial", "js/app.js", "    const paidHere = ent.source !== \"trial\" && (isPaidRail(own) || own === \"\");", "    const paidHere = ent.source !== \"trial\" && isPaidRail(own);", ["tests/rt2-p2-lapsed.spec.js", "-g", "gift month"]],
    ["B259h the on-hold header wears the offer's gold, so Pro on hold reads as one more Buy Pro button", "js/app.js", "return { text: tt(\"nav.planLapsed\"), title: tt(\"nav.subscriptionTitle\"), cls: \"plan-hold\" };", "return { text: tt(\"nav.planLapsed\"), title: tt(\"nav.subscriptionTitle\"), cls: \"btn-pro\" };", ["tests/rt2-p2-lapsed.spec.js", "-g", "never sold again"]],
    ["B259i a paying subscriber's other plan says Subscribe again, a checkout the worker always refuses", "js/app.js", "!own.disabled && openSubscriptionRail()) return openSubscriptionCta(ctx);", "!own.disabled && openRailAside(ctx.ent)) return openSubscriptionCta(ctx);", ["tests/rt2-p2-lapsed.spec.js", "-g", "paying subscriber"]],
    ["B259j the home banner sells Pro to a subscriber on hold", "js/app.js", "    const held = (ent.pro && ent.source !== \"trial\") || headerPlanState().kind === \"lapsed\";", "    const held = ent.pro && ent.source !== \"trial\";", ["tests/rt2-p2-lapsed.spec.js", "-g", "banner"]],
    ["B259k a second subscription open on another rail, which can still renew, is mentioned nowhere", "js/app.js", "      paintAlsoOpenNote(ent, cancelNote);\n", "", ["tests/rt2-p2-lapsed.spec.js", "-g", "another rail"]],
    ["B259l the Spanish line for a second subscription open on Creem is missing, so a change to Spanish leaves it in English", "js/i18n.js", "      \"pricing.cancel.alsoOpenCreem\": \"También tienes una suscripción abierta con Creem, que puede renovarse aparte. Para gestionarla o cancelarla, usa el enlace que Creem te manda por correo después de cada pago, o escríbenos.\",\n", "", ["tests/rt2-p2-lapsed.spec.js", "-g", "change of language"]],
    ["B259m on the first opening a paying subscriber's other plan stays a live Manage beside a Manage button the worker hid", "js/app.js", "      if (openSubscriptionRail()) renderPricingModal();", "      if (openRailAside(window.VTBilling?.getEntitlement?.())) renderPricingModal();", ["tests/rt2-p2-lapsed.spec.js", "-g", "paying subscriber"]],
    ["B259n the pay-without-account offer follows the link's host again, so a Mercado Pago short link (mpago.la) says nothing on how to cancel", "js/app.js", "    if (rail === \"mercadopago\") return \"auth.payWithoutAccountMp\";", "    if (rail === \"mercadopago\" && /mercadopago\\.com/.test(window.VTBilling.checkoutUrl(\"pro_monthly\", rail) || \"\")) return \"auth.payWithoutAccountMp\";", ["tests/rt2-p2-copy.spec.js", "-g", "truth-4"]],
    ["B196 a worker with no Creem route is not a no, so a pasted Creem link takes money no licence follows", "js/account.js", "          creem: d.creemConfigured === true,", "          creem: typeof d.creemConfigured === \"boolean\" ? d.creemConfigured : null,", ["tests/checkout-rail.spec.js"]],
    ["B197 a worker with no bound-checkout route is not a no", "js/account.js", "          creemCheckout: d.creemCheckoutConfigured === true,", "          creemCheckout: typeof d.creemCheckoutConfigured === \"boolean\" ? d.creemCheckoutConfigured : null,", ["tests/checkout-rail.spec.js"]],
    ["B198 a worker with no portal route is not a no", "js/account.js", "          creemPortal: d.creemPortalConfigured === true,", "          creemPortal: typeof d.creemPortalConfigured === \"boolean\" ? d.creemPortalConfigured : null,", ["tests/checkout-rail.spec.js"]],
    ["B199 a health answer missing Mercado Pago's field closes Mercado Pago", "js/account.js", "          mercadopago: typeof d.mercadopagoConfigured === \"boolean\" ? d.mercadopagoConfigured : null,", "          mercadopago: d.mercadopagoConfigured === true,", ["tests/checkout-rail.spec.js"]],
    ["B117 the claim reads the throttle's clock before its body", "workers/entitlements/src/index.js", "async function handleClaim(request, env, cors, options) {\n  const body = await readRawBody(request);", "async function handleClaim(request, env, cors, options) {\n  options = { ...options, now: clockSeconds(options) };\n  const body = await readRawBody(request);", ["workers/entitlements/test/payment-rails-redteam.test.mjs"]]
  ].map(([name, file, from, to, only]) => ({
    name,
    file,
    from,
    to,
    cmd: only && /^(workers|tests\/node)\//.test(only[0])
      ? node(only)
      : [...PIANO_SPEC.slice(0, 3), ...(only || ["tests/console-unlock.spec.js", "tests/trust-console-gaps.spec.js"]), "--project=chromium", "--workers=4", "--reporter=dot"]
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
    ["DS12 the worker drops the design events as unknown names", "workers/entitlements/src/events.js", "  ...LAYOUT_EVENTS,\n", "", "workers/entitlements/test/layouts.test.mjs"],
    ["DS13 an old server's 404 reads as a generic error, with no word about redeploying", "js/admin-layouts.js", "    if (res.status === 404) return t(\"missing\");\n", "", "tests/admin-layouts.spec.js", "before this change"],
    ["DS14 the CSV gives design B the visits of design A", "js/admin-layouts.js", "d[ver].sessions, d[ver].seconds].join", "d.a.sessions, d[ver].seconds].join", "tests/admin-layouts.spec.js", "CSV"],
    ["DS15 the tiles show design A's visits in both", "js/admin-layouts.js", "VERSIONS.map((ver) => tile(versionOf(data, ver)))", "VERSIONS.map((ver) => tile({ ...versionOf(data, \"a\"), ver }))", "tests/admin-layouts.spec.js", "CSV"],
    ["DS16 the design control takes focus behind the sticky header and stays there", "js/app.js", "          window.scrollBy({ top: r.top - hdr.bottom - 8, behavior: \"instant\" });\n", "", "tests/site-version.spec.js", "comes out from under it"],
    ["DS17 high-contrast mode loses the border on the current Progreso tab", "css/site-version.css", "    outline: 2px solid Highlight;\n", "", "tests/site-version.spec.js", "high-contrast"],
    ["DS18 a tapped button stays lifted and outlined on a touch screen", "css/styles.css", "@media (hover: hover) {\n  .btn:hover {", "@media all {\n  .btn:hover {", "tests/touch-hover.spec.js"],
    ["DS19 a tapped account button keeps the accent border on a touch screen", "css/styles.css", "@media (hover: hover) {\n  .header-door:hover {", "@media all {\n  .header-door:hover {", "tests/touch-hover.spec.js"]
  ].map(([name, file, from, to, spec, grep]) => ({
    name,
    file,
    from,
    to,
    cmd: spec.startsWith("workers/")
      ? node([spec])
      : [...PIANO_SPEC.slice(0, 3), spec, "--project=chromium", "--workers=4", "--reporter=dot", ...(grep ? ["-g", grep] : [])]
  })),
  // Merging #26 into main split some forty functions under the complexity ceiling (qa/lint-complexity.mjs). Each
  // split was checked by planting defects back into the logic it moved; these are the ones that lived through the
  // existing suites, each now killed by a test written for it. The ids are the ones the tests carry: SP for the page
  // splits (a browser spec, with a title filter), and for the worker WC Creem, WR reports, WT Stripe and Mercado
  // Pago, WS the store, WRT the router and RG3 the progress race (a Node test file). PC, the Pro dialog's plan card,
  // is the exception: the specs that already pinned it kill all five, so they keep their own titles. WM is Mercado
  // Pago's payment mappers, split in the red-team round of 18 November 2026. CI runs this set as its own job.
  splits: [
    ["SP1 the home ad slot is never throttled, so it shows again inside its minimum interval", "js/ads.js", "    if (slotThrottled(slotId, c.frequency || {})) return", "    if (false) return", "tests/ads.spec.js", "SP1 "],
    ["SP2 in preview, the line for a slot no card names is English on a Spanish page", "js/ads.js", "        es ? \"Ninguna tarjeta nombra este espacio.\" : \"No card names this slot.\"", "        \"No card names this slot.\"", "tests/ads.spec.js", "SP2 "],
    ["SP3 the post-session slot asks AdSense for a unit of its own, which does not exist", "js/ads.js", "      const unit = c.adsense.slots?.[slotId === \"post-session\" ? \"home\" : slotId];", "      const unit = c.adsense.slots?.[slotId];", "tests/ads.spec.js", "SP3 "],
    ["SP4 the plan and rail chosen are not remembered across the trip to the checkout", "js/billing.js", "      rememberCheckoutIntent(planId, providerId);\n", "", "tests/checkout-rail.spec.js", "SP4 "],
    ["SP5 the QA page calls an older worker's missing report route 'off'", "qa/qa.js", "      h.reportsEnabled === undefined\n        ? inLang(", "      false\n        ? inLang(", "tests/reports.spec.js", "SP5 "],
    ["SP6 the QA page's pasted state leaves out what the worker said", "qa/qa.js", "    return lines.concat(healthLines(health)).join", "    return lines.join", "tests/reports.spec.js", "SP6 "],
    ["SP7 the QA page does not list the emailed code as a way in", "qa/qa.js", "    if (methods.email) ways.push(", "    if (false) ways.push(", "tests/reports.spec.js", "SP7 "],
    ["SP8 the admin page sends a gift code with any number of uses (0, 1001) to the worker", "js/admin.js", "    if (!Number.isInteger(uses) || uses < 1 || uses > 1000) return \"badUses\";", "    if (false) return \"badUses\";", "tests/admin.spec.js", "gift codes: create, redeem"],
    ["SP9 the admin report card does not show which build the reporter was on", "js/admin.js", "    if (report.build) where.push(", "    if (false) where.push(", "tests/admin.spec.js", "reports: read what somebody sent"],
    ["SP10 a drafted idea comes back as a bug when the dialog is opened without a kind", "js/reports.js", "    ui.kind = draft.kind === \"idea\" ? \"idea\" : \"bug\";", "    ui.kind = \"bug\";", "tests/reports.spec.js", "SP10 "],
    ["SP11 a signed-in reporter's address is not offered as the contact", "js/reports.js", "    return (account && account.account && account.account.email) || \"\";", "    return \"\";", "tests/reports.spec.js", "SP11 "],
    ["SP12 back from the copy panel, the cursor is lost on the page instead of in the summary", "js/reports.js", "    focusSummary();\n", "", "tests/reports.spec.js", "SP12 "],
    ["SP13 once checkout is live, an account whose trial is spent reads as plain free", "js/app.js", "    if (ent.status === \"expired\" || (!prelaunch && trialSpent())) {", "    if (false) {", "tests/account-pro-states.spec.js", "SP13 "],
    ["SP14 the header door shows a Google account's full name instead of the given name", "js/app.js", "    ? ((acc.displayName || \"\").trim().split(/\\s+/)[0] || (acc.email || \"\").split(\"@\")[0])", "    ? ((acc.displayName || \"\").trim() || (acc.email || \"\").split(\"@\")[0])", "tests/account-pro-states.spec.js", "SP14 "],
    ["SP15 the sign-in retry row shows beside a sign-in that works", "js/app.js", "      retryRow.hidden = !offer.configured || offer.offered || offer.checking;", "      retryRow.hidden = !offer.configured || offer.checking;", "tests/account-pro-states.spec.js", "SP15 "],
    ["SP16 the payment rails are named in the config's default language, whatever the page's", "js/app.js", "    return es\n      ? (cfg.providers?.[rail]?.labelEs || tt(fallbackKey))", "    return false\n      ? (cfg.providers?.[rail]?.labelEs || tt(fallbackKey))", "tests/account-pro-states.spec.js", "SP16 "],
    ["WC1 a transaction whose amount_paid is null reads as paid nothing, so a full refund of it keeps Pro", "workers/entitlements/src/creem.js", "transaction && transaction.amount_paid !== undefined && transaction.amount_paid !== null\n      ? transaction.amount_paid", "transaction && transaction.amount_paid !== undefined\n      ? transaction.amount_paid", "workers/entitlements/test/split-creem.test.mjs"],
    ["WC2 any order status but \"pending\" reads as paid, a refunded order included", "workers/entitlements/src/creem.js", "(orderStatus === \"\" || orderStatus === \"paid\")", "(orderStatus !== \"pending\")", "workers/entitlements/test/split-creem.test.mjs"],
    ["WC3 a checkout with no status of its own reads as completed", "workers/entitlements/src/creem.js", "String((checkout && checkout.status) || \"\") === \"completed\"", "String((checkout && checkout.status) || \"completed\") === \"completed\"", "workers/entitlements/test/split-creem.test.mjs"],
    ["WC4 a checkout's own status is not read at all, so a pending checkout is paid", "workers/entitlements/src/creem.js", "String((checkout && checkout.status) || \"\") === \"completed\"", "String((checkout && checkout.status) || \"\") !== \"expired\"", "workers/entitlements/test/split-creem.test.mjs"],
    ["WC7 an order that names no status (the documented paid shape) no longer counts as paid", "workers/entitlements/src/creem.js", "(orderStatus === \"\" || orderStatus === \"paid\")", "(orderStatus === \"paid\")", "workers/entitlements/test/split-creem.test.mjs"],
    ["WC8 a subscription that names its product only in its items falls to the monthly default", "workers/entitlements/src/creem.js", "(subscription && subscription.product) || (item && item.product_id)", "(subscription && subscription.product)", "workers/entitlements/test/split-creem.test.mjs"],
    ["WC9 a subscription's second item is read instead of its first", "workers/entitlements/src/creem.js", "subscription.items[0]", "subscription.items[1]", "workers/entitlements/test/split-creem.test.mjs"],
    ["WC10 a subscription.canceled event whose snapshot still says active stays active", "workers/entitlements/src/creem.js", "  if (eventType === \"subscription.canceled\") {\n    return \"canceled\";\n  }\n", "", "workers/entitlements/test/split-creem.test.mjs"],
    ["WC12 money going back is dated by the refund's own created_at, not the envelope", "workers/entitlements/src/creem.js", "update.reversedAt = update.occurredAt ?? epochSeconds(object.created_at);", "update.reversedAt = epochSeconds(object.created_at);", "workers/entitlements/test/split-creem.test.mjs"],
    ["WC13 a reversal with no envelope date has no date at all, so the store dates it \"now\"", "workers/entitlements/src/creem.js", "update.reversedAt = update.occurredAt ?? epochSeconds(object.created_at);", "update.reversedAt = update.occurredAt;", "workers/entitlements/test/split-creem.test.mjs"],
    ["WC14 a cancellation's own canceled_at is overwritten by the envelope date", "workers/entitlements/src/creem.js", "if (update.status === \"canceled\" && !Number.isFinite(update.endedAt)) {", "if (update.status === \"canceled\") {", "workers/entitlements/test/split-creem.test.mjs"],
    ["WC15 a paid checkout with no envelope date counts its month from nowhere", "workers/entitlements/src/creem.js", "      ?? update.occurredAt\n      ?? epochSeconds(object.created_at);", "      ?? update.occurredAt;", "workers/entitlements/test/split-creem.test.mjs"],
    ["WC16 the reversal stamping is inverted: purchases get a reversal date and refunds do not", "workers/entitlements/src/creem.js", "if (update.isReversal) {", "if (!update.isReversal) {", "workers/entitlements/test/split-creem.test.mjs"],
    ["WC17 a cancellation that names no date is left with no end at all", "workers/entitlements/src/creem.js", "    update.endedAt = update.occurredAt;\n", "", "workers/entitlements/test/split-creem.test.mjs"],
    ["WR1 a body whose Content-Length is over the cap is read anyway", "workers/entitlements/src/reports.js", "  if (Number.isFinite(declared) && declared > MAX_REPORT_BODY_BYTES) {\n    return { status: 413", "  if (false) {\n    return { status: 413", "workers/entitlements/test/split-reports.test.mjs"],
    ["WR2 a signed-in reporter's daily share resets on every new address", "workers/entitlements/src/reports.js", "    if (!perAccount.ok) {", "    if (false) {", "workers/entitlements/test/split-reports.test.mjs"],
    ["WR3 a report's environment is stored as sent, outside its closed list", "workers/entitlements/src/reports.js", "    environment: sanitizeEnvironment(body.environment)\n", "    environment: body.environment\n", "workers/entitlements/test/split-reports.test.mjs"],
    ["WR4 updateReport applies a status it does not know", "workers/entitlements/src/reports.js", "  const status = REPORT_STATUSES.has(change.status) ? change.status : row.status;", "  const status = change.status || row.status;", "workers/entitlements/test/split-reports.test.mjs"],
    ["WR5 a later change made without a handler forgets who handled the report", "workers/entitlements/src/reports.js", "handled_by: change.by || row.handled_by || null,", "handled_by: change.by || null,", "workers/entitlements/test/split-reports.test.mjs"],
    ["WR6 the reporter's steps to reproduce are dropped", "workers/entitlements/src/reports.js", "    steps: clampText(body.steps, FIELD_LIMITS.steps),", "    steps: \"\",", "workers/entitlements/test/split-reports.test.mjs"],
    ["WT1 a checkout whose price and metadata both name a plan records the metadata as the source, though the price decided", "workers/entitlements/src/stripe.js", "const planSource = byPrice ? \"price_id\" : (byMetadata ? \"metadata\" : (subscriptionId ? undefined : \"default\"));", "const planSource = byMetadata ? \"metadata\" : (byPrice ? \"price_id\" : (subscriptionId ? undefined : \"default\"));", "workers/entitlements/test/split-stripe-mp.test.mjs"],
    ["WT2 a checkout is priced by its second line item instead of its first", "workers/entitlements/src/stripe.js", "    ? session.line_items.data[0]\n", "    ? session.line_items.data[1]\n", "workers/entitlements/test/split-stripe-mp.test.mjs"],
    ["WT3 a checkout's line-item price is never passed on, so a yearly pass is recorded as a month", "workers/entitlements/src/stripe.js", "const byPrice = planFromPriceId(checkoutPriceId(session), env);", "const byPrice = planFromPriceId(undefined, env);", "workers/entitlements/test/split-stripe-mp.test.mjs"],
    ["WT4 an invoice line's price in the 2025+ pricing.price_details shape is not read, so a renewal of a price that is not ours is marked paid", "workers/entitlements/src/stripe.js", "  return idOf(line && line.price)\n    || idOf(line && line.pricing && line.pricing.price_details && line.pricing.price_details.price);\n", "  return idOf(line && line.price);\n", "workers/entitlements/test/split-stripe-mp.test.mjs"],
    ["WT5 an invoice that names its subscription only on its line is dropped as having no license identity", "workers/entitlements/src/stripe.js", "    || idOf(line && line.subscription)\n", "", "workers/entitlements/test/split-stripe-mp.test.mjs"],
    ["WT6 a paid checkout whose event carries no time gets no period bound from the session's own created, so one month sold is Pro for ever", "workers/entitlements/src/stripe.js", "update.periodEndFromCharge = update.occurredAt ?? unixOrNull(object.created);", "update.periodEndFromCharge = update.occurredAt;", "workers/entitlements/test/split-stripe-mp.test.mjs"],
    ["WT7 money going back is dated by when the webhook arrived instead of by its event, so a late refund keeps days of Pro", "workers/entitlements/src/stripe.js", "    update.reversedAt = update.occurredAt;\n", "", "workers/entitlements/test/split-stripe-mp.test.mjs"],
    ["WT8 the operator's monthly Mercado Pago plan id maps to a year, so every monthly charge grants twelve months", "workers/entitlements/src/mercadopago.js", "  if (planId && env && planId === env.MP_PLAN_PRO_MONTHLY) {\n    return { plan: \"pro_monthly\", planSource: \"preapproval_plan_id\" };", "  if (planId && env && planId === env.MP_PLAN_PRO_MONTHLY) {\n    return { plan: \"pro_yearly\", planSource: \"preapproval_plan_id\" };", "workers/entitlements/test/split-stripe-mp.test.mjs"],
    ["WS1 an out-of-date renewal invoice lengthens access though its payment failed", "workers/entitlements/src/store.js", "  if (update.periodEndIsFloor === true && update.paid === true && Number.isFinite(update.periodEnd)) {", "  if (update.periodEndIsFloor === true && Number.isFinite(update.periodEnd)) {", "workers/entitlements/test/split-store.test.mjs"],
    ["WS2 a deletion delivered again writes its ended: marker a second time", "workers/entitlements/src/store.js", "  if ((update.terminal && !stale) || restored) {", "  if (update.terminal || restored) {", "workers/entitlements/test/split-store.test.mjs"],
    ["WS3 reading a deleted, never-paid subscription reads its paid: key twice", "workers/entitlements/src/store.js", "  const readPayment = async () => {\n    if (payment === undefined) {\n      payment = await readPaid(kv, licenseId);\n    }\n    return payment;\n  };", "  const readPayment = () => readPaid(kv, licenseId);", "workers/entitlements/test/split-store.test.mjs"],
    ["WS4 a cancellation heard of first reads the new record's placeholder \"pending\" as unpaid and cuts the period", "workers/entitlements/src/store.js", "  const before = existing ? record.status : null;", "  const before = record.status;", "workers/entitlements/test/split-store.test.mjs"],
    ["WS5 a dispute of an already-refunded payment moves when access ended to the dispute's date", "workers/entitlements/src/store.js", "    && paymentId === record.periodPaymentId\n    && record.reversedPaymentId !== record.periodPaymentId;", "    && paymentId === record.periodPaymentId;", "workers/entitlements/test/split-store.test.mjs"],
    ["WS6 a period a payment restored after a deletion is not written to ended:, so an older copy's write loses it", "workers/entitlements/src/store.js", "  if ((update.terminal && !stale) || restored) {", "  if (update.terminal && !stale) {", "workers/entitlements/test/split-store.test.mjs"],
    ["WRT1 POST to /v1/me/progress is answered 405: the route table takes only PUT as a write, so a POST save is lost", "workers/entitlements/src/api.js", "      PUT: withoutUrl(handlePutProgress),\n      POST: withoutUrl(handlePutProgress),\n", "      PUT: withoutUrl(handlePutProgress),\n", "workers/entitlements/test/split-routes.test.mjs"],
    ["WRT2 a refused method on /v1/me is told GET only, though POST works too", "workers/entitlements/src/api.js", "[\"/v1/me\", accountRoute(\"GET, POST\", {", "[\"/v1/me\", accountRoute(\"GET\", {", "workers/entitlements/test/split-routes.test.mjs"],
    ["WRT3 a refused method on /v1/me/progress is told GET, PUT only: DELETE is dropped from its allow", "workers/entitlements/src/api.js", "accountRoute(\"GET, PUT, DELETE\", {", "accountRoute(\"GET, PUT\", {", "workers/entitlements/test/split-routes.test.mjs"],
    ["RG3 the progress UPDATE loses its rev = ?5 compare-and-swap: two devices writing from the same revision both win", "workers/entitlements/src/progress.js", "       WHERE account_id = ?1 AND profile_id = ?2 AND rev = ?5`", "       WHERE account_id = ?1 AND profile_id = ?2`", "workers/entitlements/test/progress-race.test.mjs"],
    // The Pro dialog's plan card, split out of a map callback of complexity 29 in the merge of #26.
    ["PC1 a trial holder's monthly card says it is the plan they hold, as if they had paid", "js/app.js", "    if (held === \"trialAccount\" || held === \"gift\") return offer;\n", "", "tests/account-pro-states.spec.js", "and the Pro dialog calls it a free trial"],
    ["PC2 the free card says it is the plan a trial holder holds", "js/app.js", "label: held === \"free\" ? tt(\"pricing.current\")", "label: true ? tt(\"pricing.current\")", "tests/account-pro-states.spec.js", "and the Pro dialog calls it a free trial"],
    ["PC3 before launch the plan buttons say Subscribe and answer with a toast", "js/app.js", "    if (ctx.prelaunch && !own.disabled) return", "    if (false) return", "tests/pricing-prelaunch.spec.js", "plan buttons say not available yet"],
    ["PC4 the annual card loses the saving its two prices give", "js/app.js", "    if (p.badge === \"saveAnnual\" && savingPct) {", "    if (false) {", "tests/billing.spec.js", "the annual badge states the saving"],
    ["PC5 the benefits past the first five are dropped, with no way to see them", "js/app.js", "    const restFeats = featList.slice(FEAT_MAX).map(item).join(\"\");", "    const restFeats = \"\";", "tests/pricing-prelaunch.spec.js", "benefit copy carries no internal jargon"],
    // Mercado Pago's payment mappers, split when the red-team round of 18 November 2026 changed their claim ids.
    ["WM1 a one-off Mercado Pago payment that names no plan says its text chose it", "workers/entitlements/src/mercadopago.js", "planSource: byText ? \"payment_text\" : \"default(payment)\" };", "planSource: \"payment_text\" };", "workers/entitlements/test/split-stripe-mp.test.mjs", null],
    ["WM2 a refunded recurring charge with no dates of its own is dated by the refund, and a later period is ended", "workers/entitlements/src/mercadopago.js", "reversedChargeAt: reversed ? chargeTime(payment, dueAt) : undefined,", "reversedChargeAt: reversed ? chargeTime(payment, occurredAt) : undefined,", "workers/entitlements/test/split-stripe-mp.test.mjs", null],
    ["WM3 a Mercado Pago payment's metadata.plan is ignored, and a yearly pass is sold as a month", "workers/entitlements/src/mercadopago.js", "    || planFromText(payment.metadata && payment.metadata.plan)\n", "", "workers/entitlements/test/split-stripe-mp.test.mjs", null]
  ].map(([name, file, from, to, spec, grep]) => ({
    name,
    file,
    from,
    to,
    cmd: spec.startsWith("workers/")
      ? node([spec])
      : [...PIANO_SPEC.slice(0, 3), spec, "--project=chromium", "--workers=4", "--reporter=dot", ...(grep ? ["-g", grep] : [])]
  })),
  // The learner's flows (red team 2026-11-18, FLOW-1 to FLOW-10): a take thrown away unasked, a paused step
  // restarted, focus lost in a dialog, no way to report from the exercise, a trial forgotten after sign-in.
  // Each mutant puts one defect back and is judged by the test in tests/learner-flows.spec.js written for it.
  learner: [
    ["LF1 a started short take is told to press Start first", "js/app.js", 'return tt(s === 1 ? "rate.practiceMore_one" : "rate.practiceMore", { s });', 'return tt("rate.practiceFirst", { s });', "FLOW-10"],
    ["LF2 one more second reads in the plural", "js/app.js", 'tt(s === 1 ? "rate.practiceMore_one" : "rate.practiceMore", { s })', 'tt("rate.practiceMore", { s })', "FLOW-10"],
    // FLOW-3: a dialog taller than a phone's window wrapped focus to a control scrolled out of sight.
    ["LF3 a trap's wrap focuses without bringing the control into view", "js/focus-trap.js", '    if (moved && typeof el.scrollIntoView === "function") el.scrollIntoView({ block: "nearest" });\n', "", "wrap brings the control into view", "tests/focus-trap.spec.js"],
    ["LF4 Tab past the last control wraps to a first one out of sight", "js/focus-trap.js", "      moveTo(first);\n", "      focus(first);\n", "wrap brings the control into view", "tests/focus-trap.spec.js"],
    ["LF5 Shift+Tab past the first control wraps to a last one out of sight", "js/focus-trap.js", "      moveTo(last);\n", "      focus(last);\n", "wrap brings the control into view", "tests/focus-trap.spec.js"]
  ].map(([name, file, from, to, grep, spec]) => ({
    name,
    file,
    from,
    to,
    cmd: [...PIANO_SPEC.slice(0, 3), spec || "tests/learner-flows.spec.js", "--project=chromium", "--workers=2", "--reporter=dot", "-g", grep]
  })),
  // The payment ledger in D1 (one optimistic transaction per webhook) and the account layer's
  // multi-step writes made single batches (audit WH-*, KV-*, D1-*, SW-1, SC-1). Node only, so it
  // runs in the contracts job with the default sets. "Sequential" mutants replace a D1 batch (one
  // transaction) with the same statements run one by one, which is what the code did before.
  // The client sync on a shared browser and against a malformed account copy (red-team round of 2026-11-18,
  // findings RES-1/2/4/5/6/7, FLOW-6/7, CXSS-1 part 2). Each mutant runs only the test written for it: a node test
  // against the real js/storage.js, js/account.js and js/sync.js and the real worker router (tests/node/sync-env.mjs),
  // or, for what the page shows, tests/sync-shared-browser.spec.js. The browser half puts the set in the CI matrix.
  syncing: [
    ["SY1 a write answered after the account changed is recorded as the next account's", "js/sync.js", "      // The write went to the account that made it; whoever is here now is not told it was theirs.\n      if (sessionMoved(token)) return sessionGone();\n", "", "sync-account-switch"],
    ["SY2 each request of a cycle goes out as whichever session is current, and nothing checks between them (RES-1)", "js/sync.js", "      const pulled = await readAccount(profileId, token);\n      if (sessionMoved(token)) return sessionGone();\n      const halt = pullStop(pulled, profileId);\n      if (halt) return halt;\n\n      const step = mergePulled(profileId, pulled);\n      const pushed = await global.VTAccount.request(\n        \"PUT\",\n        \"/v1/me/progress\",\n        { profileId, doc: step.merged, baseRev: step.serverRev },\n        { timeoutMs: REQUEST_TIMEOUT_MS, token }\n      );\n      // The write went to the account that made it; whoever is here now is not told it was theirs.\n      if (sessionMoved(token)) return sessionGone();\n", "      const pulled = await readAccount(profileId, null);\n      const halt = pullStop(pulled, profileId);\n      if (halt) return halt;\n\n      const step = mergePulled(profileId, pulled);\n      const pushed = await global.VTAccount.request(\n        \"PUT\",\n        \"/v1/me/progress\",\n        { profileId, doc: step.merged, baseRev: step.serverRev },\n        { timeoutMs: REQUEST_TIMEOUT_MS }\n      );\n", "sync-account-switch"],
    ["SY3 a read answered after the account changed is merged into this browser: the last account's other devices show to the next", "js/sync.js", "      const pulled = await readAccount(profileId, token);\n      if (sessionMoved(token)) return sessionGone();\n      const halt", "      const pulled = await readAccount(profileId, token);\n      const halt", "sync-account-switch"],
    ["SY4 'use my saved progress' answered after the account changed is kept with the last account's revision", "js/sync.js", "    const pulled = await readAccount(profileId, token);\n    if (sessionMoved(token)) return sessionGone();\n    if (!pulled.ok)", "    const pulled = await readAccount(profileId, token);\n    if (!pulled.ok)", "sync-account-switch"],
    ["SY5 the next account's sync is handed the result of the last account's cycle", "js/sync.js", "      if (sharedAs === sessionToken() && !(result", "      if (sharedAs !== undefined && !(result", "sync-account-switch"],
    ["SY6 a cycle that throws rejects past every caller, and the panel keeps saying saved (RES-4)", "js/sync.js", "    running = runCycle(profileId, token).catch(cycleThrew);", "    running = runCycle(profileId, token);", "sync-account-doc"],
    ["SY7 the account's copy is merged as it came, unchecked (CXSS-1)", "js/sync.js", "    const b = normalizeBag(remote);", "    const b = { ...normalizeBag({}), ...remote };", "sync-account-doc"],
    ["SY8 a count that is not a number is kept as it came", "js/sync.js", "      completedCount: Math.max(whole(r.completedCount), history.length),", "      completedCount: r.completedCount,", "sync-account-doc"],
    ["SY9 a hold's seconds and time are kept as they came", "js/sync.js", "    if (!e || !when(e.at) || seconds === null || seconds < 0) return null;\n    return { ...e, at: when(e.at), seconds };", "    if (!e) return null;\n    return e;", "sync-account-doc"],
    ["SY10 an entry dated 2099 is kept, first for ever", "js/sync.js", "    return t > 0 && t <= Date.now() + FUTURE_SLACK_MS ? String(value) : null;", "    return t > 0 ? String(value) : null;", "sync-account-doc"],
    ["SY11 a plan at any week is kept: week 99 beats a real plan", "js/sync.js", "    if (!p || week < 1 || week > MAX_PLAN_WEEK) return null;", "    if (!p || week < 1) return null;", "sync-account-doc"],
    ["SY12 a plan past week 12 is thrown away (the app keeps counting after the twelfth review)", "js/sync.js", "  const MAX_PLAN_WEEK = 52;", "  const MAX_PLAN_WEEK = 12;", "sync-account-doc"],
    ["SY13 a week element outside the catalogue's list is kept", "js/sync.js", "    return !Array.isArray(known) || known.includes(value) ? value : null;", "    return value;", "sync-account-doc"],
    ["SY14 two devices' takes count as the larger count alone (RES-5)", "js/sync.js", "      completedCount: Math.max(Number(a.completedCount) || 0, Number(b.completedCount) || 0, takes.length),", "      completedCount: Math.max(Number(a.completedCount) || 0, Number(b.completedCount) || 0),", "sync-account-doc"],
    ["SY15 a log stored as an object makes the merge throw", "js/sync.js", "    for (const entry of [...list(local), ...list(remote)]) {", "    for (const entry of [...(local || []), ...(remote || [])]) {", "sync-account-doc"],
    ["SY16 a history stored as an object makes the merge throw", "js/sync.js", "    for (const entry of [...list(b), ...list(a)]) {", "    for (const entry of [...(b || []), ...(a || [])]) {", "sync-account-doc"],
    ["SY17 a weekly goal written as text is kept as text", "js/sync.js", "    return { ...g, weeklySessionsTarget: target, ...present(g, \"updatedAt\", when) };", "    return { ...g, ...present(g, \"updatedAt\", when) };", "sync-account-doc"],
    ["SY18 a goal dated 2099 wins every later merge", "js/sync.js", "    return { ...g, weeklySessionsTarget: target, ...present(g, \"updatedAt\", when) };", "    return { ...g, weeklySessionsTarget: target };", "sync-account-doc"],
    ["SY19 a review's element outside the catalogue's list is kept", "js/sync.js", "      ...present(e, \"element\", element),\n", "", "sync-account-doc"],
    ["SY20 an owner storage refused is forgotten: the next account gets this practice unasked (RES-6)", "js/sync.js", "      ownerKept = id;\n    }", "    }", "sync-owner-quota"],
    ["SY21 the owner kept in memory is never read", "js/sync.js", "    if (ownerKept) return ownerKept;\n    try {\n      return localStorage.getItem(LS_OWNER) || null;", "    try {\n      return localStorage.getItem(LS_OWNER) || null;", "sync-owner-quota"],
    ["SY22 the status never says a change is waiting: the panel says saved over an unsent take (FLOW-6)", "js/sync.js", "      pending: hasUnpushed(),\n", "      pending: false,\n", "sync-status"],
    ["SY23 a sign-in waits out the 8 s quiet period before its first read (FLOW-7)", "js/sync.js", "        fetchingFor = token;\n        schedule(0);", "        fetchingFor = token;\n        schedule();", "sync-status"],
    ["SY24 'fetching' outlives the first read", "js/sync.js", "      if (fetchingFor && fetchingFor === asked) {", "      if (false) {", "sync-status"],
    ["SY25 a /v1/me answer after the sign-in pushes the first read back by the quiet period", "js/sync.js", "      } else if (token && !timer) {", "      } else if (token) {", "sync-status"],
    ["SY26 a take does not tell an open panel that something is waiting", "js/sync.js", "    // An open panel stops saying \"saved\" the moment there is something new.\n    emit();\n", "", "sync-status"],
    ["SY27 the panel says saved while a take waits to be sent (FLOW-6)", "js/app.js", "    if (status.pending) return tt(\"auth.syncPending\");\n", "", "sync-shared-browser.spec.js", "a take not yet sent"],
    ["SY28 the panel says 'Aún no guardado' while the account's copy is on its way (FLOW-7)", "js/app.js", "    if (status.fetching) return tt(\"auth.syncFetching\");\n", "", "sync-shared-browser.spec.js", "says it is fetching"],
    ["SY29 everything goes aside, the handover ignored: the newcomer's own takes go to the previous owner (RES-2)", "js/sync.js", "    const since = h && h.owner === owner ? ms(h.since) : 0;", "    const since = 0;", "sync-handover"],
    ["SY30 a sign-in does not note when the browser stopped being the last owner's", "js/sync.js", "        noteHandover();\n", "", "sync-handover"],
    ["SY31 the handover is never stored: a reload before answering forgets it", "js/sync.js", "      if (h) localStorage.setItem(LS_HANDOVER, JSON.stringify(h));", "      if (h) throw new Error(\"not kept\");", "sync-handover"],
    ["SY32 leaving without answering leaves the leaver's takes as the last owner's, for her next sync to send", "js/sync.js", "    setAsideLeaver();\n    writeHandover(null);", "    writeHandover(null);", "sync-handover"],
    ["SY33 what the newcomer keeps is overwritten by the account's copy instead of merged into it", "js/sync.js", "      note(await syncNow(id));", "      note(await pullOverwrite(id, token));", "sync-handover"],
    ["SY34 the last owner's row keeps the count of the newcomer's takes", "js/sync.js", "      const count = Math.max(early.length, row.completedCount - late.length);", "      const count = Math.max(early.length, row.completedCount);", "sync-handover"],
    ["SY35 the newcomer's part has no day ledger: the day they practised is not counted", "js/sync.js", "    after.days = daysOf(after);", "    after.days = null;", "sync-handover"],
    ["SY36 the last owner's day ledger keeps the newcomer's time", "js/sync.js", "      days: lessDays(b.days, after.days)", "      days: b.days", "sync-handover"],
    ["SY37 the leaver's part is taken from a browser that is already theirs", "js/sync.js", "    if (!h || !h.me || readOwner() !== h.owner) return;", "    if (!h || !h.me) return;", "sync-handover"],
    ["SY38 an owner signing in again on her own browser is a handover: signing out puts her practice aside", "js/sync.js", "    writeHandover(owner && owner !== me ? { owner, me, since: new Date().toISOString() } : null);", "    writeHandover(owner ? { owner, me, since: new Date().toISOString() } : null);", "sync-handover"],
    ["SY39 a recording set aside is still listed and played (RES-7)", "js/storage.js", "    return !!record && recordingProfile(record) === active && !record.asideFor;", "    return !!record && recordingProfile(record) === active;", "sync-shared-browser.spec.js", "recordings go with"],
    ["SY40 'Usar solo la de mi cuenta' leaves the last owner's recordings where they were", "js/sync.js", "    if (kept) await recordingsAside(owner, since ? { to: since } : {});\n", "", "sync-shared-browser.spec.js", "recordings go with"],
    ["SY41 the newcomer's own recordings go aside with the last owner's", "js/sync.js", "    if (kept) await recordingsAside(owner, since ? { to: since } : {});", "    if (kept) await recordingsAside(owner, {});", "sync-shared-browser.spec.js", "recordings go with"],
    ["SY42 recordings set aside never come back to their account", "js/sync.js", "    recordingsBack = giveRecordingsBack(me);\n", "", "sync-shared-browser.spec.js", "recordings go with"],
    ["SY43 leaving without answering leaves the leaver's recordings for the last owner to see", "js/sync.js", "    recordingsAside(h.me, { from: ms(h.since) });\n", "", "sync-shared-browser.spec.js", "recordings go with"],
    ["SY44 the leaver's recordings are taken with everything recorded before them", "js/storage.js", "        if (r.asideFor || (range.from && at < range.from) || (range.to && at >= range.to)) return null;", "        if (r.asideFor || (range.to && at >= range.to)) return null;", "sync-shared-browser.spec.js", "recordings go with"],
    ["SY45 a recording set aside still plays by its id", "js/storage.js", "          if (!shown(r, active)) return resolve(null);", "          if (!r || recordingProfile(r) !== active) return resolve(null);", "sync-shared-browser.spec.js", "recordings go with"],
    ["SY46 a profile the newcomer practised in syncs before the pulls: its cycle restores what was left aside, and a pull overwrites it", "js/sync.js", "    for (const id of ids.filter((x) => !kept[x])) {\n      note(await pullOverwrite(id, token));\n      if (sessionMoved(token)) return sessionGone();\n    }\n    if (restoreAside(me)) schedule();\n    for (const id of ids.filter((x) => kept[x])) {\n      note(await syncNow(id));\n      if (sessionMoved(token)) return sessionGone();\n    }\n", "    for (const id of ids.filter((x) => kept[x])) {\n      note(await syncNow(id));\n      if (sessionMoved(token)) return sessionGone();\n    }\n    for (const id of ids.filter((x) => !kept[x])) {\n      note(await pullOverwrite(id, token));\n      if (sessionMoved(token)) return sessionGone();\n    }\n    if (restoreAside(me)) schedule();\n", "sync-handover"]
  ].map(([name, file, from, to, test, grep]) => ({
    name,
    file,
    from,
    to,
    // A panel line is judged in the browser by the spec written for it; everything else by its node test.
    cmd: test.endsWith(".spec.js")
      ? [...PIANO_SPEC.slice(0, 3), `tests/${test}`, "--project=chromium", "--workers=2", "--reporter=dot", ...(grep ? ["-g", grep] : [])]
      : node([`tests/node/${test}.test.mjs`])
  })),
  // VG-84 (2026-11-21, review round 2026-11-22): Mercado Pago entitles for money that arrived, not for an
  // authorised mandate; a turned-down instalment ends Pro at the end of the period paid for and answers 402 so a
  // retry brings it back. Each mutant puts one defect back; the five worker files below are what kill them.
  mpPaid: [
    ["MP1 a mandate is not recorded unpaid", "src/mercadopago.js", "    paid: false,\n    // The next charge date is when", "    // The next charge date is when"],
    ["MP2 an approved charge on the authorized topic does not set paid", "src/mercadopago.js", "lets the subscription entitle (VG-84).\n    paid: approved || undefined,", "lets the subscription entitle (VG-84).\n    paid: undefined,"],
    ["MP3 an approved subscription charge on the payment topic does not set paid", "src/mercadopago.js", "this is what says so on the payment topic.\n    paid: approved || undefined,", "this is what says so on the payment topic.\n    paid: subscriptionId ? undefined : approved || undefined,"],
    ["MP4 an authorized subscription is not held to its paid period", "src/store.js", "  if (!ended && record.provider === \"mercadopago\") {\n    holdToPaidPeriod(record);", "  if (!ended && record.provider === \"mercadopago\" && record.status === \"canceled\") {\n    holdToPaidPeriod(record);"],
    ["MP5 a decline inside the paid month takes the rest of it", "src/store.js", "  if (paidThrough !== null) {\n    record.periodEnd = paidThrough;", "  if (paidThrough !== null) {\n    record.periodEnd = Number.isFinite(record.declinedAt) && !(record.chargedAt >= record.declinedAt) ? Math.min(paidThrough, record.declinedAt) : paidThrough;"],
    ["MP6 a decline caps the period even after a retry went through", "src/store.js", "  if (!ended && record.provider === \"mercadopago\") {\n    holdToPaidPeriod(record);", "  if (!ended && record.provider === \"mercadopago\") {\n    holdToPaidPeriod(record);\n    capPeriodEnd(record, record.declinedAt);"],
    ["MP7 isSuspended back to reversal-only, so a decline or a lapse is 403", "src/license.js", "  return entitlement.provider === \"mercadopago\" && entitlement.status === \"active\";", "  return entitlement.provider === \"mercadopago\" && entitlement.status === \"active\"\n    && Number.isFinite(entitlement.reversedAt) && entitlement.periodEnd === entitlement.reversedAt;"],
    ["MP8 an invoice's processed read as paid when it names no payment", "src/mercadopago.js", "  const approved = String(payment.status) === \"approved\";", "  const approved = payment.status\n    ? String(payment.status) === \"approved\"\n    : String(a.status) === \"processed\";"],
    ["MP9 the payment topic marks every payment unpaid", "src/mercadopago.js", "this is what says so on the payment topic.\n    paid: approved || undefined,", "this is what says so on the payment topic.\n    paid: false,"],
    ["MP10 a cancelled paid subscription loses the rest of its paid month", "src/store.js", "  if (paidThrough !== null) {\n    record.periodEnd = paidThrough;", "  if (paidThrough !== null) {\n    record.periodEnd = record.status === \"canceled\" && Number.isFinite(record.occurredAt) ? Math.min(paidThrough, record.occurredAt) : paidThrough;"],
    ["MP10b notePayment lets paid:false overwrite a confirmed payment", "src/store.js", "  } else if (update.paid === false && record.paid !== true) {", "  } else if (update.paid === false) {"],
    ["MPX1 authorized-topic approval with no date_approved (the documented shape) records no charge", "src/mercadopago.js", "periodEndFromCharge: approved ? (isoToUnixSeconds(payment.date_approved) || chargeDueAt(a, null)) : null,", "periodEndFromCharge: approved ? isoToUnixSeconds(payment.date_approved) : null,"],
    ["MPX2 declinedSinceLastCharge counts a charge at the same instant as a decline as not since", "src/license.js", "!(entitlement.chargedAt >= entitlement.declinedAt)", "!(entitlement.chargedAt > entitlement.declinedAt)"],
    ["MPX4 authorized-topic decline due on time dated by last_modified instead of its debit date", "src/mercadopago.js", "  if (!(dueAt > occurredAt)) {\n    return dueAt;", "  if (!(dueAt > occurredAt)) {\n    return occurredAt;"],
    ["MPX5 a declined subscription keeps Pro 40 days past the decline", "src/store.js", "  if (paidThrough !== null) {\n    record.periodEnd = paidThrough;", "  if (paidThrough !== null) {\n    record.periodEnd = Number.isFinite(record.declinedAt) ? Math.max(paidThrough, record.declinedAt + 40 * 86400) : paidThrough;"],
    ["MPN1 a next charge date past the paid period stands (hold never lowers)", "src/store.js", "  if (paidThrough !== null) {\n    record.periodEnd = paidThrough;", "  if (paidThrough !== null) {\n    record.periodEnd = Math.max(paidThrough, Number.isFinite(record.periodEnd) ? record.periodEnd : paidThrough);"],
    ["MPN2 a next charge date short of the paid period wins (hold never raises)", "src/store.js", "  if (paidThrough !== null) {\n    record.periodEnd = paidThrough;", "  if (paidThrough !== null) {\n    capPeriodEnd(record, paidThrough);"],
    ["MPN3 an authorized subscription whose period ran out with nothing turned down is 403", "src/license.js", "  return entitlement.provider === \"mercadopago\" && entitlement.status === \"active\";", "  return entitlement.provider === \"mercadopago\" && entitlement.status === \"active\"\n    && (Number.isFinite(entitlement.declinedAt) || Number.isFinite(entitlement.reversedAt));"],
    ["MPN4 a cancelled or paused subscription is 402 too", "src/license.js", "  return entitlement.provider === \"mercadopago\" && entitlement.status === \"active\";", "  return entitlement.provider === \"mercadopago\";"],
    ["MPN5 a decline whose debit date moved to the next retry is not recorded (the old rule)", "src/mercadopago.js", "  return tried ? occurredAt : undefined;", "  return undefined;"],
    ["MPN6 a charge never tried and not yet due counts as a decline", "src/mercadopago.js", "  return tried ? occurredAt : undefined;", "  return occurredAt;"],
    ["MPN7 payment status 'canceled' (one L) is not a decline", "src/mercadopago.js", "  return value === \"cancelled\" || value === \"canceled\";", "  return value === \"cancelled\";"],
    ["MPN8 a cancelled invoice (called off) counts as a decline", "src/mercadopago.js", "  if (!isDeclinedPayment(payment.status) || isCancelledStatus(authorized.status)) {", "  if (!isDeclinedPayment(payment.status)) {"],
    ["MPN9 a turned-down first charge still waits (202)", "src/license.js", "    && !(entitlement.provider === \"mercadopago\"\n      && (declinedSinceLastCharge(entitlement) || Number.isFinite(entitlement.reversedAt)));", "    && true;"],
    ["MPN10 a subscription first heard of already refunded still waits (202)", "src/license.js", "      && (declinedSinceLastCharge(entitlement) || Number.isFinite(entitlement.reversedAt)));", "      && declinedSinceLastCharge(entitlement));"],
    ["MPN11 the 402 never says declined", "src/index.js", "reason: isDeclined(record) ? \"declined\" : \"suspended\",", "reason: \"suspended\","],
    ["MPN12 isDeclined ignores the subscription's status", "src/license.js", "    && entitlement.status === \"active\" && declinedSinceLastCharge(entitlement);", "    && declinedSinceLastCharge(entitlement);"],
    ["MPN13 a subscription charge's text sets the plan again", "src/mercadopago.js", "  if (subscriptionId) {\n    return { plan: undefined, planSource: undefined };", "  if (subscriptionId) {\n    const said = planFromText(payment.description) || planFromText(payment.external_reference);\n    return { plan: said || undefined, planSource: said ? \"payment_text\" : undefined };"],
    ["MPN14 a recurring payment naming no subscription is filed as a one-off", "src/mercadopago.js", "    claimId: subscriptionId || unlinkedRecurring ? null : idValue(p.id),", "    claimId: subscriptionId ? null : idValue(p.id),"],
    ["MPN15 point_of_interaction.transaction_data.subscription_id is not read", "src/mercadopago.js", "    || idValue(p.metadata && p.metadata.preapproval_id)\n    || idValue(poi && poi.subscription_id);", "    || idValue(p.metadata && p.metadata.preapproval_id);"],
    ["MPN16 a turned-down first charge leaves the next charge date as its period", "src/store.js", "  } else {\n    capPeriodEnd(record, record.declinedAt);\n  }", "  }"],
    ["MPN17 the paid-period hold applies to one-off payments too, undoing their end", "src/store.js", "  if (!record.subscriptionId) {\n    return;\n  }\n  const paidThrough = periodEndForPlan(record.plan, record.chargedAt);", "  const paidThrough = periodEndForPlan(record.plan, record.chargedAt);"],
    ["MPN18 a subscription read back is not held to its paid period (KV lost write)", "src/store.js", "    if (record.provider === \"mercadopago\") {\n      holdToPaidPeriod(record);\n    }\n  }\n  // And money given back.", "  }\n  // And money given back."]
  ].map(([name, file, from, to]) => ({
    name,
    file: `workers/entitlements/${file}`,
    from,
    to,
    cmd: node(MP_PAID_TESTS)
  })),
  ledger: [
    ["LG1 the first validation chunk always passes: a stale read commits", "src/ledger.js", "SELECT ?1, ?3 WHERE NOT EXISTS (${changed})", "SELECT ?1, ?3 WHERE NOT EXISTS (${changed}) OR 1", "ledger"],
    ["LG2 later validation chunks are ignored", "src/ledger.js", "DELETE FROM ledger_tx WHERE tx_id = ?1 AND ?3 = ?3 AND EXISTS (${changed})", "DELETE FROM ledger_tx WHERE tx_id = ?1 AND ?3 = ?3 AND EXISTS (${changed}) AND 0", "ledger"],
    ["LG3 a transaction that failed validation still writes", "src/ledger.js", "SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM ledger_tx WHERE tx_id = ?3)", "SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM ledger_tx WHERE tx_id = ?3) OR 1", "ledger"],
    ["LG4 a conflict is taken for a commit", "src/ledger.js", "return Number(last && last.meta && last.meta.changes) === 1;", "return true;", "ledger"],
    ["LG5 one attempt only: a conflict is never retried", "src/ledger.js", "export const LEDGER_MAX_ATTEMPTS = 4;", "export const LEDGER_MAX_ATTEMPTS = 1;", "ledger"],
    ["LG6 a tombstone lets the old KV copy show through", "src/ledger.js", "const missing = keys.filter((key) => !rows.has(key));", "const missing = keys.filter((key) => !rows.has(key) || rows.get(key).value === null);\n  missing.forEach((key) => rows.delete(key));", "ledger"],
    ["LG7 an expired ledger key reads as live", "src/ledger.js", "return row.expires_at === null || row.expires_at === undefined || Number(row.expires_at) > at;", "return true;", "ledger"],
    ["LG8 the ledger never uses D1", "src/ledger.js", "return Boolean(env && env.DB && typeof env.DB.prepare === \"function\" && typeof env.DB.batch === \"function\");", "return false;", "ledger"],
    ["LG9 a transaction does not read its own writes", "src/ledger.js", "    if (this.writes.has(key)) {\n      return this.writes.get(key).value;\n    }\n", "", "ledger"],
    ["LG10 deletes are never written: no tombstone", "src/ledger.js", "return !(seen && seen.version === null && seen.value === null);", "return false;", "ledger"],
    ["LG11 the KV path reads the stored record only by the claim's id, not the derived one (KV-1)", "src/store.js", "const existing = await getEntitlement(kv, existingId || derived);", "const existing = await getEntitlement(kv, existingId);", "ledger"],
    ["LG12 a Mercado Pago notification without the access token is acknowledged and lost", "src/index.js", "  if (mapped.reason === \"access_token_not_configured\") {\n    throw new Error(\"MP_ACCESS_TOKEN is not configured\");\n  }\n", "", "ledger"],
    ["LG13 a D1 that refuses the flag leaves no trace for the probe", "src/db.js", "  await writeFlagKey(kv, name, at);\n", "", "cost"],
    ["LG14 the probe ignores the webhook-failed flag", "src/index.js", "      checks.writes = \"failing\";", "      checks.writes = \"ok\";", "cost"],
    ["DA1 the trial's grant and claim are two writes again (D1-5)", "src/grants.js", "const [granted] = await db.batch([", "const [granted] = await SEQ", "d1-atomicity"],
    ["DA2 the trial grant is written whether or not the trial is claimed", "src/grants.js", "insertGrant(db, row, \"EXISTS (SELECT 1 FROM accounts WHERE id = ?2 AND trial_used_at IS NULL)\")", "insertGrant(db, row)", "grants"],
    ["DA3 a gift redemption's three writes are separate again (D1-1)", "src/grants.js", "[claimed] = await db.batch([", "[claimed] = await SEQ", "d1-atomicity"],
    ["DA4 a code revoked after the first read still pays out", "src/grants.js", "WHERE code_normalized = ?5 AND revoked_at IS NULL AND redeemed_count < max_redemptions", "WHERE code_normalized = ?5 AND redeemed_count < max_redemptions", "d1-atomicity"],
    ["DA5 the last use of a code is given twice", "src/grants.js", "WHERE code_normalized = ?5 AND revoked_at IS NULL AND redeemed_count < max_redemptions", "WHERE code_normalized = ?5 AND revoked_at IS NULL", "grants"],
    ["DA6 a refused redemption still spends a use", "src/grants.js", "WHERE code_normalized = ?1 AND EXISTS (SELECT 1 FROM gift_redemptions WHERE id = ?2)", "WHERE code_normalized = ?1 AND ?2 = ?2", "grants"],
    ["DA7 a refused redemption still writes a grant", "src/grants.js", "insertGrant(db, grant, \"EXISTS (SELECT 1 FROM gift_redemptions WHERE id = ?11)\", [redemptionId])", "insertGrant(db, grant, \"?11 = ?11\", [redemptionId])", "grants"],
    ["DA8 any D1 failure is answered 'already redeemed'", "src/grants.js", "if (/UNIQUE/i.test(String(error && error.message))) {", "if (/UNIQUE/i.test(String(error && error.message)) || error) {", "d1-atomicity"],
    ["DA9 two admins revoking a grant: the second overwrites who did it", "src/grants.js", "WHERE id = ?1 AND revoked_at IS NULL\")\n    .bind(grantId, at, revokedBy || null)", "WHERE id = ?1\")\n    .bind(grantId, at, revokedBy || null)", "d1-atomicity"],
    ["DA10 two admins revoking a gift code: the second moves the time", "src/grants.js", "UPDATE gift_codes SET revoked_at = ?2 WHERE code_normalized = ?1 AND revoked_at IS NULL", "UPDATE gift_codes SET revoked_at = ?2 WHERE code_normalized = ?1", "d1-atomicity"],
    ["DA11 two tabs linking one license: the second hits the key and answers 500 (D1-3)", "src/grants.js", "VALUES (?1, ?2, ?3, ?4)\n       ON CONFLICT(license_id) DO NOTHING`", "VALUES (?1, ?2, ?3, ?4)`", "d1-atomicity"],
    ["DA12 a spent code still opens a session", "src/accounts.js", "\"EXISTS (SELECT 1 FROM login_codes WHERE id = ?6 AND consumed_at IS NULL)\"", "\"EXISTS (SELECT 1 FROM login_codes WHERE id = ?6)\"", "d1-atomicity"],
    ["DA13 the session and the spend are two writes again (D1-2)", "src/accounts.js", "const [opened] = await db.batch([", "const [opened] = await SEQ", "d1-atomicity"],
    ["DA14 retiring old codes and storing the new one are two writes again (D1-4)", "src/accounts.js", "  await db.batch([\n    db\n      .prepare(\"UPDATE login_codes SET consumed_at = ?2 WHERE email_normalized = ?1 AND consumed_at IS NULL\")", "  await SEQ\n    db\n      .prepare(\"UPDATE login_codes SET consumed_at = ?2 WHERE email_normalized = ?1 AND consumed_at IS NULL\")", "d1-atomicity"],
    ["DA15 the top-level 500 has no CORS headers (D1-8)", "src/index.js", "return json({ ok: false, reason: \"internal_error\" }, 500, corsHeaders(request, env));", "return json({ ok: false, reason: \"internal_error\" }, 500);", "d1-atomicity"],
    ["DA16 one table that fails stops the sweep (SW-1)", "src/db.js", "      report.failed.push(target[0]);\n", "      report.failed.push(target[0]);\n      break;\n", "d1-atomicity"],
    ["DA17 a failed sweep raises no flag", "src/db.js", "    await noteHealthFlag(db, SWEEP_FAILED_FLAG, report.failed.join(\",\"), at, kv);\n", "", "d1-atomicity"],
    ["DA18 the sweep stops after one chunk however much is left", "src/db.js", "if (n < SWEEP_CHUNK_ROWS) {", "if (n <= SWEEP_CHUNK_ROWS) {", "d1-atomicity"],
    ["DA19 a ledger key expiring this second is kept by the sweep though reads treat it as gone", "src/db.js", "[\"ledger_kv\", \"expires_at IS NOT NULL AND expires_at <= ?1\", at]", "[\"ledger_kv\", \"expires_at IS NOT NULL AND expires_at < ?1\", at]", "d1-atomicity"],
    ["DA20 the cron run passes in silence when a table was not swept", "src/index.js", "    if (report.failed.length) {\n      // Thrown after", "    if (false) {\n      // Thrown after", "d1-atomicity"],
    ["DA21 every cold isolate reruns the whole schema batch (SC-1)", "src/db.js", "    return Boolean(row);\n", "    return false;\n", "d1-atomicity"],
    ["DA22 older code lowers a newer schema's version", "src/db.js", "ON CONFLICT(key) DO UPDATE SET value = ?1 WHERE CAST(schema_meta.value AS INTEGER) < CAST(?1 AS INTEGER)", "ON CONFLICT(key) DO UPDATE SET value = ?1", "d1-atomicity"],
    ["DA23 the schema is skipped on its version number: another branch's same number hides a missing table", "src/db.js", "db.prepare(\"SELECT 1 AS ok FROM schema_meta WHERE key = ?1\").bind(SCHEMA_KEY)", "db.prepare(\"SELECT 1 AS ok FROM schema_meta WHERE key = 'version' AND CAST(value AS INTEGER) >= ?1\").bind(SCHEMA_VERSION)", "d1-atomicity"],
    ["DA24 the schema's record is never written: every cold isolate reruns the batch", "src/db.js", "    db.prepare(\"INSERT INTO schema_meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO NOTHING\").bind(SCHEMA_KEY, String(SCHEMA_VERSION)),\n", "", "d1-atomicity"],
    ["DA25 the fingerprint ignores what the statements say", "src/db.js", "hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;", "hash = hash >>> 0;", "d1-atomicity"],
    ["DL1 the login-code email has no deadline: a hung provider keeps the page spinning", "src/email.js", "response = await doFetch(url, { ...init, signal: AbortSignal.timeout(deadlineMs(options, EMAIL_SEND_TIMEOUT_MS)) });", "response = await doFetch(url, init);", "outbound-deadlines"],
    ["DL2 Google's key fetch has no deadline: a hung fetch holds the sign-in open", "src/google.js", "{ method: \"GET\", signal: AbortSignal.timeout(deadlineMs(opts, GOOGLE_JWKS_TIMEOUT_MS)) }", "{ method: \"GET\" }", "outbound-deadlines"],
    ["DL3 the login-code email carries a signal that never fires (Codex on PR #38)", "src/email.js", "signal: AbortSignal.timeout(deadlineMs(options, EMAIL_SEND_TIMEOUT_MS))", "signal: new AbortController().signal", "outbound-deadlines"],
    ["DL4 Google's key fetch carries a signal that never fires (Codex on PR #38)", "src/google.js", "signal: AbortSignal.timeout(deadlineMs(opts, GOOGLE_JWKS_TIMEOUT_MS))", "signal: new AbortController().signal", "outbound-deadlines"],
    ["DL5 the Mercado Pago API read carries a signal that never fires", "src/mercadopago.js", "signal: AbortSignal.timeout(deadlineMs(options, MP_API_TIMEOUT_MS))", "signal: new AbortController().signal", "outbound-deadlines"],
    ["DL6 the Mercado Pago API read outlives Mercado Pago's own 22 s wait", "src/mercadopago.js", "export const MP_API_TIMEOUT_MS = 8000;", "export const MP_API_TIMEOUT_MS = 30000;", "outbound-deadlines"],
    ["DR1 Stripe's unknown-license answer clears its marker in KV while the ledger commits it", "src/index.js", "return await answerUnknownLicense(kv, \"stripe\"", "return await answerUnknownLicense(env.ENTITLEMENTS, \"stripe\"", "d1-rails"],
    ["DR2 Creem's unknown-license answer clears its marker in KV while the ledger commits it", "src/index.js", "return await answerUnknownLicense(kv, \"creem\"", "return await answerUnknownLicense(env.ENTITLEMENTS, \"creem\"", "d1-rails"],
    ["DR3 Mercado Pago's unapplied answer clears its marker in KV while the ledger commits it", "src/index.js", "return await answerUnappliedNotification(kv, target, mapped, options);", "return await answerUnappliedNotification(env.ENTITLEMENTS, target, mapped, options);", "d1-rails"],
    ["DR4 Creem events bypass the D1 ledger", "src/index.js", "(kv) => applyCreemEvent(kv, event, env, options, outcome)", "(kv) => applyCreemEvent(env.ENTITLEMENTS, event, env, options, outcome)", "d1-rails"],
    ["DR5 Creem's record goes to KV while its marker goes to the ledger", "src/index.js", "const { record, missing } = await upsertEntitlement(kv, mapped.update, { idSecret: licenseIdSecret(env) });\n    if (missing) {\n      return await answerUnknownLicense(kv, \"creem\"", "const { record, missing } = await upsertEntitlement(env.ENTITLEMENTS, mapped.update, { idSecret: licenseIdSecret(env) });\n    if (missing) {\n      return await answerUnknownLicense(kv, \"creem\"", "d1-rails"],
    ["DR6 Mercado Pago notifications bypass the D1 ledger", "src/index.js", "(kv) => applyMercadoPagoNotification(kv, target, env, options)", "(kv) => applyMercadoPagoNotification(env.ENTITLEMENTS, target, env, options)", "d1-rails"],
    ["DR7 Mercado Pago's record goes to KV while its marker goes to the ledger", "src/index.js", "const { record } = await upsertEntitlement(kv, mapped.update,", "const { record } = await upsertEntitlement(env.ENTITLEMENTS, mapped.update,", "d1-rails"],
    ["DR8 a missing Mercado Pago token is answered 500 without a throw, so the probe never hears of it", "src/index.js", "    throw new Error(\"MP_ACCESS_TOKEN is not configured\");", "    await clearEventSeen(kv, \"mercadopago\", target.eventId);\n    return json({ ok: false, reason: mapped.reason }, 500);", "d1-rails"],
    ["DR9 without D1 a failure is not flagged in KV either", "src/db.js", "export async function noteHealthFlag(db, name, detail, now, kv) {\n  if (!name) {", "export async function noteHealthFlag(db, name, detail, now, kv) {\n  if (!db || !name) {", "d1-rails"],
    ["DR10 the KV flag expires long before the probe's hour is over", "src/db.js", "await kv.put(healthFlagKey(name), String(at), { expirationTtl: 86400 });", "await kv.put(healthFlagKey(name), String(at), { expirationTtl: 60 });", "d1-rails"],
    ["DR11 every KV flag is written under the webhook flag's key", "src/db.js", "await kv.put(healthFlagKey(name), String(at),", "await kv.put(healthFlagKey(WEBHOOK_FAILED_FLAG), String(at),", "d1-rails"],
    ["DR12 the KV flag still counts in the second after its hour, unlike the D1 row", "src/index.js", "clockSeconds(deps) - stamp < HEALTH_FLAG_WINDOW_SECONDS", "clockSeconds(deps) - stamp <= HEALTH_FLAG_WINDOW_SECONDS", "d1-rails"],
    ["DR13 /v1/license reads KV, not the ledger", "src/index.js", "const record = await getEntitlement(ledgerReader(env), licenseId);", "const record = await getEntitlement(env.ENTITLEMENTS, licenseId);", "d1-rails"],
    ["DR14 /v1/me/link looks the checkout up in KV, not the ledger", "src/api.js", "licenseId = await getLicenseIdForClaim(ledgerReader(env), provider, sessionId);", "licenseId = await getLicenseIdForClaim(env.ENTITLEMENTS, provider, sessionId);", "d1-rails"],
    ["DR15 /v1/me/link reads the license from KV, not the ledger", "src/api.js", "const record = await getEntitlement(ledgerReader(env), licenseId);", "const record = await getEntitlement(env.ENTITLEMENTS, licenseId);", "d1-rails"],
    ["DR16 /v1/me resolves the license from KV, not the ledger", "src/api.js", "const resolution = await resolveEntitlement(env.DB, ledgerReader(env), account.id, now);", "const resolution = await resolveEntitlement(env.DB, env.ENTITLEMENTS, account.id, now);", "d1-rails"],
    ["DR17 the admin lookup resolves the license from KV, not the ledger", "src/api.js", "const resolution = await resolveEntitlement(env.DB, ledgerReader(env), account.id, at);", "const resolution = await resolveEntitlement(env.DB, env.ENTITLEMENTS, account.id, at);", "d1-rails"],
    ["DR18 a rotated license-id key reads the record under the new id first, and rebuilds the license from one event", "src/store.js", "const existing = await getEntitlement(kv, existingId || derived);", "const existing = await getEntitlement(kv, derived || existingId);", "d1-rails"],
    ["GE1 revoking one gift code sets revoked_at on every live code in the deployment", "src/grants.js", "UPDATE gift_codes SET revoked_at = ?2 WHERE code_normalized = ?1 AND revoked_at IS NULL", "UPDATE gift_codes SET revoked_at = ?2 WHERE revoked_at IS NULL AND ?1 = ?1", "grants-edges"],
    ["GE2 one redemption adds a use to every gift code, so untouched single-use codes read as used up", "src/grants.js", "WHERE code_normalized = ?1 AND EXISTS (SELECT 1 FROM gift_redemptions WHERE id = ?2)`", "WHERE ?1 = ?1 AND EXISTS (SELECT 1 FROM gift_redemptions WHERE id = ?2)`", "grants-edges"],
    ["GE3 a gift grant is written whenever the account has any earlier redemption, so a code revoked or used up mid-redemption still pays out to the loser", "src/grants.js", "\"EXISTS (SELECT 1 FROM gift_redemptions WHERE id = ?11)\"", "\"EXISTS (SELECT 1 FROM gift_redemptions WHERE account_id = ?2 AND ?11 = ?11)\"", "grants-edges"],
    ["GE4 a grant's note and issued_by are stored in each other's columns, so every list shows the admin's id as the note", "src/grants.js", "row.note, row.issued_by, row.created_at", "row.issued_by, row.note, row.created_at", "grants-edges"],
    ["GE5 the admin who loses a concurrent grant revoke is answered ok:false, which the route turns into a 404", "src/grants.js", "return current ? { ok: true, reason: \"already_revoked\", grant: current }", "return current ? { ok: false, reason: \"already_revoked\", grant: current }", "grants-edges"],
    ["GE6 the losing admin's re-read fetches two columns, so the answer is a grant with no id, kind or dates", "src/grants.js", "    const current = await db.prepare(\"SELECT * FROM grants WHERE id = ?1\").bind(grantId).first();", "    const current = await db.prepare(\"SELECT revoked_at, revoked_by FROM grants WHERE id = ?1\").bind(grantId).first();", "grants-edges"],
    ["GE7 createGrant does not wait for its insert, so a grant D1 refused is answered 200", "src/grants.js", "  await insertGrant(db, row).run();\n  return row;", "  insertGrant(db, row).run();\n  return row;", "grants-edges"],
    ["GE8 the UNIQUE match is anchored at the start, so D1's prefixed constraint error becomes a 500 instead of already_redeemed", "src/grants.js", "if (/UNIQUE/i.test(String(error && error.message))) {", "if (/^UNIQUE/i.test(String(error && error.message))) {", "grants-edges"],
    ["GE9 a grant's note is neither cut to 200 characters nor turned into a string", "src/grants.js", "note: input.note ? String(input.note).slice(0, 200) : null,\n    issued_by", "note: input.note || null,\n    issued_by", "grants-edges"],
    ["GE10 a grant's note is cut at 201 characters instead of 200", "src/grants.js", "note: input.note ? String(input.note).slice(0, 200) : null,\n    issued_by", "note: input.note ? String(input.note).slice(0, 201) : null,\n    issued_by", "grants-edges"],
    ["GE11 createGrant answers with the uncut note while D1 stores the cut one", "src/grants.js", "  await insertGrant(db, row).run();\n  return row;", "  await insertGrant(db, row).run();\n  return { ...row, note: input.note || null };", "grants-edges"],
    ["GE12 the trial claim UPDATE loses its guard, so the losing concurrent request overwrites trial_used_at with its own clock", "src/grants.js", "`UPDATE accounts SET trial_used_at = ?2, updated_at = ?2\n         WHERE id = ?1 AND trial_used_at IS NULL`", "`UPDATE accounts SET trial_used_at = ?2, updated_at = ?2\n         WHERE id = ?1`", "grants-edges"],
    ["GE13 gift_redemptions.grant_id stores the redemption's own id, so no redemption leads to the grant it bought", "src/grants.js", "SELECT ?1, code_normalized, ?2, ?3, ?4 FROM gift_codes", "SELECT ?1, code_normalized, ?2, ?1, ?4 FROM gift_codes", "grants-edges"],
    ["GE14 a grant's note keeps the 200 cap but is not turned into a string, so a numeric note is answered as a number and stored as \"12345.0\"", "src/grants.js", "note: input.note ? String(input.note).slice(0, 200) : null,\n    issued_by", "note: input.note ? (input.note.slice ? input.note.slice(0, 200) : input.note) : null,\n    issued_by", "grants-edges"],
    ["GE15 revoking a gift code matches every code that sorts at or after it (a range key), not only its own row", "src/grants.js", "UPDATE gift_codes SET revoked_at = ?2 WHERE code_normalized = ?1 AND revoked_at IS NULL", "UPDATE gift_codes SET revoked_at = ?2 WHERE code_normalized >= ?1 AND revoked_at IS NULL", "grants-edges"],
    ["GE16 a redemption spends a use of every code that sorts at or before the redeemed one (a range key)", "src/grants.js", "WHERE code_normalized = ?1 AND EXISTS (SELECT 1 FROM gift_redemptions WHERE id = ?2)`", "WHERE code_normalized <= ?1 AND EXISTS (SELECT 1 FROM gift_redemptions WHERE id = ?2)`", "grants-edges"],
    ["GE17 a new gift code is answered with the note as sent, not as stored (the bug the sweep found)", "src/grants.js", "return { code: display, plan, days, maxRedemptions, redeemedCount: 0, note, expiresAt, createdAt: at };", "return { code: display, plan, days, maxRedemptions, redeemedCount: 0, note: input.note || null, expiresAt, createdAt: at };", "grants-edges"],
    ["HK1 email send deadline cut to 10 ms at the call site, so every real send is aborted and email sign-in answers 502", "src/email.js", "signal: AbortSignal.timeout(deadlineMs(options, EMAIL_SEND_TIMEOUT_MS))", "signal: AbortSignal.timeout(deadlineMs(options, EMAIL_SEND_TIMEOUT_MS / 1000))", "housekeeping-edges"],
    ["HK2 Google key-fetch deadline cut to 5 ms at the call site, so a cold-isolate Google sign-in is refused as jwks_unavailable", "src/google.js", "signal: AbortSignal.timeout(deadlineMs(opts, GOOGLE_JWKS_TIMEOUT_MS))", "signal: AbortSignal.timeout(deadlineMs(opts, GOOGLE_JWKS_TIMEOUT_MS / 1000))", "housekeeping-edges"],
    ["HK3 sweep deletes sessions by created_at, signing everybody out a day after they sign in", "src/db.js", "[\"sessions\", \"expires_at < ?1\", at - 86400]", "[\"sessions\", \"created_at < ?1\", at - 86400]", "housekeeping-edges"],
    ["HK4 closed reports aged from created_at instead of updated_at, so a bug fixed after four months is deleted two months later", "src/db.js", "AND updated_at < ?1\", at - CLOSED_REPORT_RETENTION_SECONDS]", "AND created_at < ?1\", at - CLOSED_REPORT_RETENTION_SECONDS]", "housekeeping-edges"],
    ["HK5 schema version compared as text, so older code lowers a stored '10' to '6'", "src/db.js", "WHERE CAST(schema_meta.value AS INTEGER) < CAST(?1 AS INTEGER)", "WHERE schema_meta.value < ?1", "housekeeping-edges"],
    ["HK6 one sweep chunk per table, so the daily run deletes 5,000 events and falls behind the 10,000-a-day intake", "src/db.js", "export const SWEEP_MAX_CHUNKS = 3;", "export const SWEEP_MAX_CHUNKS = 1;", "housekeeping-edges"],
    ["HK7 login-code cutoff an hour ahead of now, deleting every unused code so the right code answers 401 no_code", "src/db.js", "[\"login_codes\", \"expires_at < ?1 OR consumed_at IS NOT NULL\", at - 3600]", "[\"login_codes\", \"expires_at < ?1 OR consumed_at IS NOT NULL\", at + 3600]", "housekeeping-edges"],
    ["HK8 rate-limit cutoff at now, deleting every current bucket so a used-up allowance is handed back after a sweep", "src/db.js", "[\"rate_limits\", \"window_start < ?1\", at - 86400]", "[\"rate_limits\", \"window_start < ?1\", at]", "housekeeping-edges"],
    ["HK9 exposures age index led by cid, so each sweep chunk scans the whole table instead of a range", "src/schema.js", "idx_exposures_first ON exposures (first_at)", "idx_exposures_first ON exposures (cid, first_at)", "housekeeping-edges"],
    ["HK10 'duplicate' dropped from the closed statuses, so duplicate reports are kept for ever", "src/db.js", "status IN ('fixed', 'wontfix', 'duplicate') AND updated_at", "status IN ('fixed', 'wontfix') AND updated_at", "housekeeping-edges"],
    ["HK11 email send deadline raised to 60 s at the call site, so a hung provider holds Send code a minute", "src/email.js", "signal: AbortSignal.timeout(deadlineMs(options, EMAIL_SEND_TIMEOUT_MS))", "signal: AbortSignal.timeout(deadlineMs(options, EMAIL_SEND_TIMEOUT_MS * 6))", "housekeeping-edges"],
    ["HK12 Google key-fetch deadline hard-coded to 60 s at the call site, so a hung key server holds sign-in a minute", "src/google.js", "signal: AbortSignal.timeout(deadlineMs(opts, GOOGLE_JWKS_TIMEOUT_MS))", "signal: AbortSignal.timeout(deadlineMs(opts, 60000))", "housekeeping-edges"],
    ["HK13 session cutoff a day ahead of expiry instead of behind, ending sessions up to 24 hours early", "src/db.js", "[\"sessions\", \"expires_at < ?1\", at - 86400]", "[\"sessions\", \"expires_at < ?1\", at + 86400]", "housekeeping-edges"],
    ["HK14 ensureSchema skips the memo when the schema is already current, one extra D1 read on every request", "src/db.js", "  if (await schemaIsCurrent(db)) {\n    schemaReady.add(db);\n    return;", "  if (await schemaIsCurrent(db)) {\n    return;", "housekeeping-edges"],
    ["HK15 a chunk counts as the last only when empty: an extra DELETE per table and a false 'unfinished' on a short last chunk", "src/db.js", "    if (n < SWEEP_CHUNK_ROWS) {\n      return { deleted, done: true };", "    if (n === 0) {\n      return { deleted, done: true };", "housekeeping-edges"],
    ["HK16 seven sweep chunks per table: 57 queries in a backlogged cron run and 35,000 events (105,000 rows written) in one run", "src/db.js", "export const SWEEP_MAX_CHUNKS = 3;", "export const SWEEP_MAX_CHUNKS = 7;", "housekeeping-edges"],
    ["HK17 email send deadline hard-coded to 15 s at the call site, inside the old range check but not the module's default", "src/email.js", "signal: AbortSignal.timeout(deadlineMs(options, EMAIL_SEND_TIMEOUT_MS))", "signal: AbortSignal.timeout(deadlineMs(options, 15000))", "housekeeping-edges"],
    ["HK18 Google key-fetch deadline doubled at the call site, so a hung key server holds sign-in ten seconds", "src/google.js", "signal: AbortSignal.timeout(deadlineMs(opts, GOOGLE_JWKS_TIMEOUT_MS))", "signal: AbortSignal.timeout(deadlineMs(opts, GOOGLE_JWKS_TIMEOUT_MS * 2))", "housekeeping-edges"],
    ["HK19 session cutoff an hour ahead of expiry, signing people out an hour early", "src/db.js", "[\"sessions\", \"expires_at < ?1\", at - 86400]", "[\"sessions\", \"expires_at < ?1\", at + 3600]", "housekeeping-edges"],
    ["HK20 login-code cutoff ten minutes ahead of now, deleting codes asked 5 to 15 minutes before a sweep that are still valid", "src/db.js", "[\"login_codes\", \"expires_at < ?1 OR consumed_at IS NOT NULL\", at - 3600]", "[\"login_codes\", \"expires_at < ?1 OR consumed_at IS NOT NULL\", at + 600]", "housekeeping-edges"],
    ["HK21 rate-limit cutoff an hour back, so the 09:17 cron deletes the events route's daily cap bucket and the day's intake doubles", "src/db.js", "[\"rate_limits\", \"window_start < ?1\", at - 86400]", "[\"rate_limits\", \"window_start < ?1\", at - 3600]", "housekeeping-edges"],
    ["HK22 rate-limit cutoff twelve hours back, so a late-day sweep deletes the events route's daily cap bucket", "src/db.js", "[\"rate_limits\", \"window_start < ?1\", at - 86400]", "[\"rate_limits\", \"window_start < ?1\", at - 43200]", "housekeeping-edges"],
    ["HK23 closed reports kept 130 days instead of 180, breaking the privacy.html promise", "src/db.js", "AND updated_at < ?1\", at - CLOSED_REPORT_RETENTION_SECONDS]", "AND updated_at < ?1\", at - CLOSED_REPORT_RETENTION_SECONDS + 86400 * 50]", "housekeeping-edges"],
    ["HK24 two sweep chunks per table, so a run clears exactly one day's cap and never catches up after a missed cron", "src/db.js", "export const SWEEP_MAX_CHUNKS = 3;", "export const SWEEP_MAX_CHUNKS = 2;", "housekeeping-edges"],
    ["HK25 five sweep chunks per table: 25,000 events (75,000 rows) plus a day of capped intake is 105,000 rows, over D1's free daily writes", "src/db.js", "export const SWEEP_MAX_CHUNKS = 3;", "export const SWEEP_MAX_CHUNKS = 5;", "housekeeping-edges"],
    ["HK26 six sweep chunks per table: the admin's backlogged sweep needs 51 queries and 120,000 rows are written with the day's intake", "src/db.js", "export const SWEEP_MAX_CHUNKS = 3;", "export const SWEEP_MAX_CHUNKS = 6;", "housekeeping-edges"],
    ["HK27 10,000-row sweep chunks: 30,000 events (90,000 rows) plus a day of capped intake is 120,000 rows in one UTC day", "src/db.js", "export const SWEEP_CHUNK_ROWS = 5000;", "export const SWEEP_CHUNK_ROWS = 10000;", "housekeeping-edges"],
    ["HK28 reports status index led by created_at, so the closed-report sweep reads every report instead of searching by status", "src/schema.js", "idx_reports_status ON reports (status, created_at)", "idx_reports_status ON reports (created_at, status)", "housekeeping-edges"],
    ["SI1 the session is opened before the answer is built, so a read that fails while building it leaves an orphan session and a spent code", "src/api.js", "  const payload = await buildMePayload(env, account, at);\n  const session = await startSessionWithCode(env.DB, checked.codeId, account.id, at);", "  const session = await startSessionWithCode(env.DB, checked.codeId, account.id, at);\n  const payload = await buildMePayload(env, account, at);", "sign-in-edges"],
    ["SI2 the losing tab of a double submit reads a null session and answers 500 instead of 401 no_code", "src/api.js", "if (!session) {", "if (session === undefined) {", "sign-in-edges"],
    ["SI3 a wrong or missing code still creates the account and records an email sign-in method", "src/api.js", "  const checked = await checkLoginCode(env.DB, email, parsed.body.code, at);\n  if (!checked.ok) {\n    return json({ ok: false, reason: checked.reason }, 401, cors);\n  }\n\n  // Everything that can fail and is safe to repeat comes before the code is\n  // spent: the account and identity writes are idempotent and the payload is\n  // reads. The code is spent in the same transaction that opens the session,\n  // so a failure anywhere leaves the person a code that still works.\n  const { account } = await ensureAccount(\n    env.DB,\n    email,\n    { locale: parsed.body.locale, adminEmails: adminEmails(env) },\n    at\n  );\n  if (isDisabled(account)) {\n    // Before the code is spent and before any session or licence exists: a\n    // switched-off account gets nothing to hold on to (red team AUTHN-2).\n    return json({ ok: false, reason: \"disabled\" }, 403, cors);\n  }\n  await recordIdentity(env.DB, account.id, \"email\", email, at);\n", "  // Everything that can fail and is safe to repeat comes before the code is\n  // spent: the account and identity writes are idempotent and the payload is\n  // reads. The code is spent in the same transaction that opens the session,\n  // so a failure anywhere leaves the person a code that still works.\n  const { account } = await ensureAccount(\n    env.DB,\n    email,\n    { locale: parsed.body.locale, adminEmails: adminEmails(env) },\n    at\n  );\n  if (isDisabled(account)) {\n    // Before the code is spent and before any session or licence exists: a\n    // switched-off account gets nothing to hold on to (red team AUTHN-2).\n    return json({ ok: false, reason: \"disabled\" }, 403, cors);\n  }\n  await recordIdentity(env.DB, account.id, \"email\", email, at);\n\n  const checked = await checkLoginCode(env.DB, email, parsed.body.code, at);\n  if (!checked.ok) {\n    return json({ ok: false, reason: checked.reason }, 401, cors);\n  }\n", "sign-in-edges"],
    ["SI4 a wrong or missing code still creates the account (an admin one included)", "src/api.js", "  const checked = await checkLoginCode(env.DB, email, parsed.body.code, at);\n  if (!checked.ok) {\n    return json({ ok: false, reason: checked.reason }, 401, cors);\n  }\n\n  // Everything that can fail and is safe to repeat comes before the code is\n  // spent: the account and identity writes are idempotent and the payload is\n  // reads. The code is spent in the same transaction that opens the session,\n  // so a failure anywhere leaves the person a code that still works.\n  const { account } = await ensureAccount(\n    env.DB,\n    email,\n    { locale: parsed.body.locale, adminEmails: adminEmails(env) },\n    at\n  );\n  if (isDisabled(account)) {\n    // Before the code is spent and before any session or licence exists: a\n    // switched-off account gets nothing to hold on to (red team AUTHN-2).\n    return json({ ok: false, reason: \"disabled\" }, 403, cors);\n  }\n  await recordIdentity(env.DB, account.id, \"email\", email, at);\n", "  const { account } = await ensureAccount(\n    env.DB,\n    email,\n    { locale: parsed.body.locale, adminEmails: adminEmails(env) },\n    at\n  );\n  if (isDisabled(account)) {\n    // Before the code is spent and before any session or licence exists: a\n    // switched-off account gets nothing to hold on to (red team AUTHN-2).\n    return json({ ok: false, reason: \"disabled\" }, 403, cors);\n  }\n\n  const checked = await checkLoginCode(env.DB, email, parsed.body.code, at);\n  if (!checked.ok) {\n    return json({ ok: false, reason: checked.reason }, 401, cors);\n  }\n\n  // Everything that can fail and is safe to repeat comes before the code is\n  // spent: the account and identity writes are idempotent and the payload is\n  // reads. The code is spent in the same transaction that opens the session,\n  // so a failure anywhere leaves the person a code that still works.\n  await recordIdentity(env.DB, account.id, \"email\", email, at);\n", "sign-in-edges"],
    ["SI5 the verify answer names the moment of sign-in as the session's end, so the browser drops the session on reload", "src/accounts.js", "    return null;\n  }\n  return { token: session.token, sessionId: session.sessionId, expiresAt: session.expiresAt };", "    return null;\n  }\n  return { token: session.token, sessionId: session.sessionId, expiresAt: session.at };", "sign-in-edges"],
    ["SI6 sessions last a thousand times ninety days, so a leaked token never ages out", "src/accounts.js", "expiresAt: at + SESSION_TTL_SECONDS", "expiresAt: at + SESSION_TTL_SECONDS * 1000", "sign-in-edges"],
    ["SI7 the right code on the fifth try is refused and the code burned", "src/accounts.js", "EXISTS (SELECT 1 FROM login_codes WHERE id = ?6 AND consumed_at IS NULL)", "EXISTS (SELECT 1 FROM login_codes WHERE id = ?6 AND consumed_at IS NULL AND attempts < 5)", "sign-in-edges"],
    ["SI8 an admin sweep with a failed table answers 200 ok", "src/api.js", "if (report.failed.length) {", "if (false) {", "sign-in-edges"],
    ["SI9 an admin sweep with a failed table answers 200 with ok false, which the admin page shows as done", "src/api.js", "return json({ ok: false, reason: \"sweep_failed\", ...report }, 500, cors);", "return json({ ok: false, reason: \"sweep_failed\", ...report }, 200, cors);", "sign-in-edges"],
    ["SI10 the admin sweep judges unfinished tables as failed and failed ones as fine", "src/api.js", "if (report.failed.length) {", "if (report.unfinished.length) {", "sign-in-edges"],
    ["SI11 each new code re-stamps every unswept older code, so rows written grow with every code asked for", "src/accounts.js", "UPDATE login_codes SET consumed_at = ?2 WHERE email_normalized = ?1 AND consumed_at IS NULL", "UPDATE login_codes SET consumed_at = ?2 WHERE email_normalized = ?1", "sign-in-edges"],
    ["SI12 a read error while the answer is built is swallowed, so the sign-in answers 200 with a session but no account or entitlement, and spends the code", "src/api.js", "  const payload = await buildMePayload(env, account, at);\n  const session = await startSessionWithCode(env.DB, checked.codeId, account.id, at);", "  const payload = await buildMePayload(env, account, at).catch(() => ({ ok: true }));\n  const session = await startSessionWithCode(env.DB, checked.codeId, account.id, at);", "sign-in-edges"],
    ["SI13 a backlog excuses a failed table, so an admin sweep that failed a table during a backlog answers 200 and the admin page shows done", "src/api.js", "if (report.failed.length) {", "if (report.failed.length && !report.unfinished.length) {", "sign-in-edges"],
    ["LB1 the ledger's clock runs in milliseconds against TTLs in seconds (a 30-day marker lasts 43 minutes)", "src/ledger.js", ": Math.floor(Date.now() / 1000);", ": Date.now();", "ledger-boundaries"],
    ["LB2 writes are sent between validation chunks, so a stale attempt's writes land before a later chunk fails", "src/ledger.js", "    for (const [key, write] of writes) {\n      statements.push(", "    for (const [key, write] of writes) {\n      statements.splice(1, 0,", "ledger-boundaries"],
    ["LB3 the commit row is inserted by the last chunk, so changes in the first chunk are never seen", "src/ledger.js", "const sql = index === 0", "const sql = index === chunks.length - 1", "ledger-boundaries"],
    ["LB4 the last key of every validation chunk is left out", "src/ledger.js", "reads.slice(i, i + LEDGER_VALIDATE_CHUNK)", "reads.slice(i, i + LEDGER_VALIDATE_CHUNK - 1)", "ledger-boundaries"],
    ["LB5 a validation chunk binds more than D1's 100 parameters", "src/ledger.js", "export const LEDGER_VALIDATE_CHUNK = 40;", "export const LEDGER_VALIDATE_CHUNK = 50;", "ledger-boundaries"],
    ["LB6 a tombstone is read with no version, so a transaction that reads it conflicts for ever", "src/ledger.js", "version: String(row.version) };", "version: row.value === null || row.value === undefined ? null : String(row.version) };", "ledger-boundaries"],
    ["LB7 validation ignores expiry, so an expired unswept row conflicts for ever", "src/ledger.js", "AND (k.expires_at IS NULL OR k.expires_at > ?2)", "AND (k.expires_at IS NULL OR k.expires_at > ?2 OR ?2 = ?2)", "ledger-boundaries"],
    ["LB8 an expired row is read with its stored version, so rewriting it conflicts for ever", "src/ledger.js", "    return { value: null, version: null };\n  }\n  return { value: row.value", "    return { value: null, version: String(row.version) };\n  }\n  return { value: row.value", "ledger-boundaries"],
    ["LB9 validation and reads disagree on the second a key expires", "src/ledger.js", "AND (k.expires_at IS NULL OR k.expires_at > ?2)", "AND (k.expires_at IS NULL OR k.expires_at >= ?2)", "ledger-boundaries"],
    ["LB10 a key written again keeps its first expiry", "src/ledger.js", "expires_at = excluded.expires_at, updated_at = excluded.updated_at", "updated_at = excluded.updated_at", "ledger-boundaries"],
    ["LB11 a tombstone expires, and the sweep brings KV's copy back", "src/ledger.js", "this.writes.set(key, { value: null, expiresAt: null });", "this.writes.set(key, { value: null, expiresAt: this.at + 1 });", "ledger-boundaries"],
    ["LB12 an expired ledger row falls back to KV's older copy", "src/ledger.js", "const missing = keys.filter((key) => !rows.has(key));", "const missing = keys.filter((key) => !rows.has(key) || !isLive(rows.get(key), at));\n  missing.forEach((key) => rows.delete(key));", "ledger-boundaries"],
    ["LB13 a put through the read-only view is silently dropped", "src/ledger.js", "    async put() {\n      throw new Error(\"ledger writes go through runLedgerTransaction\");\n    },", "    async put() {},", "ledger-boundaries"],
    ["LB14 a delete through the read-only view is silently dropped", "src/ledger.js", "    async delete() {\n      throw new Error(\"ledger writes go through runLedgerTransaction\");\n    }", "    async delete() {}", "ledger-boundaries"],
    ["LB15 the backoff is not awaited, so retries run in step", "src/ledger.js", "await backoff(attempt, opts);", "backoff(attempt, opts);", "ledger-boundaries"],
    ["LB16 the jitter collapses to no wait at all", "src/ledger.js", "const ms = Math.floor(random() * ceiling);", "const ms = Math.floor(random()) * ceiling;", "ledger-boundaries"],
    ["LB17 the backoff cap becomes a floor", "src/ledger.js", "Math.min(LEDGER_BACKOFF_CAP_MS, LEDGER_BACKOFF_BASE_MS * 2 ** attempt)", "Math.max(LEDGER_BACKOFF_CAP_MS, LEDGER_BACKOFF_BASE_MS * 2 ** attempt)", "ledger-boundaries"],
    ["LB18 a wait follows the last attempt too", "src/ledger.js", "if (attempt < attempts) {", "if (attempt <= attempts) {", "ledger-boundaries"],
    ["LB19 an injected sleep is ignored", "src/ledger.js", "if (typeof options.sleep === \"function\") {", "if (false) {", "ledger-boundaries"],
    ["LB20 one attempt cannot be asked for", "src/ledger.js", "opts.maxAttempts >= 1", "opts.maxAttempts > 1", "ledger-boundaries"],
    ["LB21 a key written blind is read and validated, so a change to it is a false conflict", "src/ledger.js", "familyOf(key).filter((k) => !this.reads.has(k) && !this.writes.has(k));", "familyOf(key).filter((k) => !this.reads.has(k));", "ledger-boundaries"],
    ["LB22 a license's charged: key is fetched in a second query", "src/ledger.js", "const LICENSE_FAMILY = [\"lic:\", \"paid:\", \"ended:\", \"reversed:\", \"charged:\"];", "const LICENSE_FAMILY = [\"lic:\", \"paid:\", \"ended:\", \"reversed:\"];", "ledger-boundaries"],
    // Checkouts the worker opens for a signed-in account (VG-83) and the billing portal (VG-86), each id the
    // test in checkout-bound.test.mjs that kills it.
    ["CK1 the webhook never binds a checkout to the account that opened it (VG-83 back)", "src/index.js", "    await bindCreemCheckout(env, event, outcome, options);\n", "", "checkout-bound"],
    ["CK2 a webhook carrying our reference binds whatever checkout it names", "src/checkout.js", "if (!input.checkoutId || row.checkout_id !== input.checkoutId) {", "if (!input.checkoutId) {", "checkout-bound"],
    ["CK3 a duplicate delivery never retries a bind that failed", "src/index.js", "const licenseId = outcome.licenseId\n    || await getLicenseIdForClaim(ledgerReader(env), \"creem\", binding.checkoutId);", "const licenseId = outcome.licenseId;", "checkout-bound"],
    ["CK3b a bind D1 refused is acknowledged, so Creem never sends it again", "src/index.js", "    await bindCreemCheckout(env, event, outcome, options);\n", "    await bindCreemCheckout(env, event, outcome, options).catch(() => {});\n", "checkout-bound"],
    ["CK4 a reference moves a licence another account already holds", "src/checkout.js", "  const linked = await linkLicense(env.DB, row.account_id, input.licenseId, \"creem\", at);", "  await env.DB.prepare(\"DELETE FROM license_links WHERE license_id = ?1\").bind(input.licenseId).run();\n  const linked = await linkLicense(env.DB, row.account_id, input.licenseId, \"creem\", at);", "checkout-bound"],
    ["CK5 a plan with no product still calls Creem", "src/checkout.js", "  if (!productId) {\n    return { reason: \"plan_unavailable\", status: 503 };", "  if (false) {\n    return { reason: \"plan_unavailable\", status: 503 };", "checkout-bound"],
    ["CK6 the return address keeps a checkout id the caller forged", "src/checkout.js", "  RETURN_PARAMS.forEach((name) => url.searchParams.delete(name));\n", "", "checkout-bound"],
    ["CK7 a test key is sent to the live host, which refuses it", "src/checkout.js", "startsWith(CREEM_TEST_KEY_PREFIX) ? CREEM_TEST_API : CREEM_LIVE_API;", "startsWith(CREEM_TEST_KEY_PREFIX) ? CREEM_LIVE_API : CREEM_LIVE_API;", "checkout-bound"],
    ["CK8 any https page an answer names is handed to the browser", "src/checkout.js", "\n    && (host === \"creem.io\" || host.endsWith(\".creem.io\"));", ";", "checkout-bound"],
    ["CK8b Creem's own error message is forwarded to the page", "src/checkout.js", "return deps.json({ ok: false, reason: answer.reason || \"provider_error\" }, status, deps.cors);", "return deps.json({ ok: false, reason: answer.reason || \"provider_error\", detail }, status, deps.cors);", "checkout-bound"],
    ["CK9 no per-account budget on opening checkouts", "src/checkout.js", "export const CHECKOUT_RATE_LIMIT = [12, 3600];", "export const CHECKOUT_RATE_LIMIT = [1000, 3600];", "checkout-bound"],
    ["CK10 the portal forwards a link that is not Creem's", "src/checkout.js", "  const url = answer.body.customer_portal_link;\n  if (!isCreemPageUrl(url)) {", "  const url = answer.body.customer_portal_link;\n  if (!url) {", "checkout-bound"],
    ["CK11 health offers checkouts with no webhook secret, so a paid checkout can never become a licence", "src/checkout.js", "      && readVar(env, \"CREEM_WEBHOOK_SECRET\")\n", "", "checkout-bound"],
    ["CK12 checkout references are kept for years", "src/db.js", "[\"checkout_refs\", \"created_at < ?1\", at - CHECKOUT_REF_TTL_SECONDS]", "[\"checkout_refs\", \"created_at < ?1\", at - CHECKOUT_REF_TTL_SECONDS * 100]", "checkout-bound"],
    ["CK13 a GET reaches the checkout handler", "src/checkout.js", "  if (request.method !== \"POST\") {\n    return Promise.resolve(", "  if (false) {\n    return Promise.resolve(", "checkout-bound"],
    ["CK14 CREEM_API_KEY is read by the worker and missing from the README's settings", "README.md", "| `CREEM_API_KEY` | Creem API key,", "| (the Creem API key) | Creem API key,", "config"],
    // CK12 tested one row well inside and one well outside the 30 days; these move the boundary by a day.
    ["CK12b checkout references are kept 31 days, past the 30 the docs promise", "src/db.js", "export const CHECKOUT_REF_TTL_SECONDS = 30 * 86400;", "export const CHECKOUT_REF_TTL_SECONDS = 31 * 86400;", "checkout-bound"],
    ["CK12c checkout references are dropped after 29 days", "src/db.js", "export const CHECKOUT_REF_TTL_SECONDS = 30 * 86400;", "export const CHECKOUT_REF_TTL_SECONDS = 29 * 86400;", "checkout-bound"],
    ["CK15 /v1/me names no subscription, so a renewal in dunning has no Manage button", "src/api.js", "    billingRails: resolution.billingRails || [],", "    billingRails: [],", "checkout-bound"],
    ["CK15b a cancelled subscription is still offered for managing", "src/grants.js", "if (isManagedSubscription(record)) billingRails.add(record.provider);", "if (record.provider) billingRails.add(record.provider);", "checkout-bound"],
    ["CK16 health says nothing of which Creem key is set, so a test key goes live unnoticed", "src/index.js", "    creemKeyMode: creemKeyMode(env),", "    creemKeyMode: null,", "router"],
    ["CK16b every Creem key reads as live, test keys too", "src/checkout.js", "  return key.startsWith(CREEM_TEST_KEY_PREFIX) ? \"test\" : \"live\";", "  return \"live\";", "router"],
    // VG-85: the checkout's currency, and the euro products in the allow-list and health.
    ["CK40 the worker ignores the currency, so a euro checkout opens the dollar product", "src/checkout.js", "  const suffix = CURRENCY_SUFFIX.get(currency || \"USD\");", "  const suffix = \"\";", "checkout-currency"],
    ["CK41 a euro request with no euro product falls back to the dollar product", "src/checkout.js", "  const productId = creemProductFor(plan, env, currency);", "  const productId = creemProductFor(plan, env, currency) || creemProductFor(plan, env);", "checkout-currency"],
    ["CK41b a euro request with no euro product is a 503 'plan unavailable', not 409 currency_unavailable", "src/checkout.js", "  if (!productId && currency !== \"USD\") {", "  if (false) {", "checkout-currency"],
    ["CK42 any currency is accepted, so null reads as dollars and GBP as a missing euro", "src/checkout.js", "  return CURRENCY_SUFFIX.has(currency) ? currency : null;", "  return currency;", "checkout-currency"],
    ["CK42b a checkout that names no currency is read as euros, so a cached page is charged euros under a dollar card", "src/checkout.js", "  const currency = body.currency === undefined ? \"USD\" : body.currency;", "  const currency = body.currency === undefined ? \"EUR\" : body.currency;", "checkout-currency"],
    ["CK43 the euro monthly product is not in the allow-list, so a paid euro month is suspended and never Pro", "src/creem.js", "  if (names(env.CREEM_PRODUCT_PRO_MONTHLY) || names(env.CREEM_PRODUCT_PRO_MONTHLY_EUR)) {", "  if (names(env.CREEM_PRODUCT_PRO_MONTHLY)) {", "checkout-currency"],
    ["CK43b the euro yearly product is mapped to the monthly plan", "src/creem.js", "  if (names(env.CREEM_PRODUCT_PRO_MONTHLY) || names(env.CREEM_PRODUCT_PRO_MONTHLY_EUR)) {", "  if (names(env.CREEM_PRODUCT_PRO_MONTHLY) || names(env.CREEM_PRODUCT_PRO_MONTHLY_EUR) || names(env.CREEM_PRODUCT_PRO_YEARLY_EUR)) {", "checkout-currency"],
    ["CK44 a table of euro products alone is no allow-list, so a donation from the same Creem account entitles", "src/creem.js", "\n    || read(\"CREEM_PRODUCT_PRO_MONTHLY_EUR\") || read(\"CREEM_PRODUCT_PRO_YEARLY_EUR\")", "", "checkout-currency"],
    ["CK45 health says euros with one euro product, so the yearly euro card meets a 409", "src/checkout.js", "creemProductFor(\"pro_monthly\", env, \"EUR\") && creemProductFor(\"pro_yearly\", env, \"EUR\")", "creemProductFor(\"pro_monthly\", env, \"EUR\") || creemProductFor(\"pro_yearly\", env, \"EUR\")", "checkout-currency"],
    ["CK45b health says euros with no checkout to sell them through", "src/checkout.js", "  return creemCheckoutConfigured(env)\n    && Boolean(creemProductFor", "  return Boolean(creemProductFor", "checkout-currency"],
    ["CK45c health's euro field reports the dollar checkout", "src/index.js", "    creemEurConfigured: creemEurCheckoutConfigured(env),", "    creemEurConfigured: creemCheckoutConfigured(env),", "checkout-currency"],
    ["CK46 a product id is compared untrimmed, so a stray space opens a checkout whose webhook is refused as not ours", "src/creem.js", "  const names = (value) => typeof value === \"string\" && value.trim() === productId;", "  const names = (value) => typeof value === \"string\" && value === productId;", "checkout-currency"],
    ["CK47 the euro product variables are read by the worker and missing from the README's settings", "README.md", "| `CREEM_PRODUCT_PRO_MONTHLY_EUR` / `CREEM_PRODUCT_PRO_YEARLY_EUR` |", "| (the euro products) |", "config"],
    // Red-team round two on the worker: Creem's subscription.expired is dunning, not an ending (truth-1); one
    // test of an open subscription behind the checkout guard and billingRails (money-3, states-1, money-7).
    ["CK17 Creem's subscription.expired is read as a cancellation again, so a renewal Creem is retrying loses its Manage rail and the retry's payment gives no Pro", "src/creem.js", "  return eventType === \"subscription.expired\" && status === \"active\" ? \"past_due\" : status;", "  return eventType === \"subscription.expired\" ? \"canceled\" : status;", "rt2-creem-expired"],
    ["CK18 an expiry whose snapshot says active is kept as active, not as a renewal in dunning (past_due)", "src/creem.js", "  return eventType === \"subscription.expired\" && status === \"active\" ? \"past_due\" : status;", "  return status;", "split-creem"],
    ["CK19 a Creem cancellation is not terminal again, so a stray payment after it reopens the subscription", "src/creem.js", "    terminal: status === \"canceled\"\n", "    terminal: false\n", "rt2-creem-expired"],
    ["CK20 a Creem expiry is terminal again (the old unsourced belief), so the subscription in dunning is closed for good", "src/creem.js", "    terminal: status === \"canceled\"\n", "    terminal: status === \"canceled\" || eventType === \"subscription.expired\"\n", "rt2-creem-expired"],
    ["CK22 a one-off payment counts as an open subscription again, so a one-month buyer is told their subscription is still open and is refused a checkout", "src/license.js", "|| !entitlement.provider || !entitlement.subscriptionId) {", "|| !entitlement.provider) {", "rt2-open-subscription"],
    ["CK23 a preapproval nobody authorized (pending) counts as an open subscription", "src/license.js", "\n    && entitlement.status !== \"pending\"", "", "rt2-open-subscription"],
    ["CK24 a cancelled subscription with no ending on record (Mercado Pago's) counts as open", "src/license.js", "  return entitlement.status !== \"canceled\"\n    && ", "  return ", "rt2-open-subscription"],
    ["CK25 a deletion on record is ignored by the open-subscription test", "src/license.js", "\n    && !Number.isFinite(entitlement.endedAt);", ";", "rt2-open-subscription"],
    ["CK26 no open-subscription check on /v1/me/checkout: a second subscription is opened beside the first", "src/checkout.js", "  if (open) {\n    return deps.json({ ok: false, reason: \"subscription_open\"", "  if (false) {\n    return deps.json({ ok: false, reason: \"subscription_open\"", "rt2-open-subscription"],
    ["CK27 the refusal names Creem whatever rail the open subscription is on, so the page sends a Mercado Pago subscriber to the wrong place", "src/checkout.js", "provider: open.provider }, 409", "provider: \"creem\" }, 409", "rt2-open-subscription"],
    ["CK28 billingRails counts a subscription still waiting for its first charge, so a new subscriber is told a payment did not go through", "src/grants.js", "if (isManagedSubscription(record)) billingRails.add(record.provider);", "if (isOpenSubscription(record)) billingRails.add(record.provider);", "rt2-open-subscription"],
    ["CK29 the checkout guard skips a subscription waiting for its first charge, so a second checkout is charged beside it", "src/grants.js", "    if (isOpenSubscription(record)) return record;", "    if (isManagedSubscription(record)) return record;", "rt2-open-subscription"],
    ["CK30 a first charge that was turned down still reads as waiting, so it names no rail", "src/license.js", "return isOpenSubscription(entitlement) && !isAwaitingPayment(entitlement);", "return isOpenSubscription(entitlement) && entitlement.paid !== false;", "rt2-open-subscription"],
    ["CK31 the checkout guard reads only Creem's records, so an open Mercado Pago subscription does not stop a Creem checkout", "src/grants.js", "    if (isOpenSubscription(record)) return record;", "    if (isOpenSubscription(record) && record.provider === \"creem\") return record;", "rt2-open-subscription"],
    ["CK32 the checkout guard looks only at the newest linked licence, so a one-off month linked later hides an open subscription", "src/grants.js", "    if (isOpenSubscription(record)) return record;\n  }\n  return null;", "    return isOpenSubscription(record) ? record : null;\n  }\n  return null;", "rt2-open-subscription"],
    ["CK33 the open-subscription check runs after Creem is asked, so every refusal leaves an abandoned Creem checkout", "src/checkout.js", "  const open = await findOpenSubscription(env.DB, ledgerReader(env), gate.account.id);\n  if (open) {\n    return deps.json({ ok: false, reason: \"subscription_open\", provider: open.provider }, 409, deps.cors);\n  }\n  const ref = mintId(\"vtr\", 16);\n  const answer = await callCreem(env, \"/v1/checkouts\", {\n    product_id: asked.productId,\n    request_id: ref,\n    success_url: asked.successUrl,\n    // Prefilled so the receipt, the portal and the account share one address,\n    // and so the payer sees whose checkout this is.\n    customer: { email: gate.account.email }\n  }, deps);\n", "  const ref = mintId(\"vtr\", 16);\n  const answer = await callCreem(env, \"/v1/checkouts\", {\n    product_id: asked.productId,\n    request_id: ref,\n    success_url: asked.successUrl,\n    // Prefilled so the receipt, the portal and the account share one address,\n    // and so the payer sees whose checkout this is.\n    customer: { email: gate.account.email }\n  }, deps);\n  const open = await findOpenSubscription(env.DB, ledgerReader(env), gate.account.id);\n  if (open) {\n    return deps.json({ ok: false, reason: \"subscription_open\", provider: open.provider }, 409, deps.cors);\n  }\n", "rt2-open-subscription"],
    ["CK34 an expiry of a paused subscription is read as past_due instead of keeping its own status", "src/creem.js", "  return eventType === \"subscription.expired\" && status === \"active\" ? \"past_due\" : status;", "  return eventType === \"subscription.expired\" && status !== \"canceled\" ? \"past_due\" : status;", "split-creem"],
    ["CK35 an expiry whose snapshot says cancelled is read as a renewal in dunning, so a lost cancellation leaves the subscription open for ever", "src/creem.js", "  return eventType === \"subscription.expired\" && status === \"active\" ? \"past_due\" : status;", "  return eventType === \"subscription.expired\" ? \"past_due\" : status;", "split-creem"],
    ["CK37 the refusal is answered 400 instead of the 409 the page's contract names", "src/checkout.js", "provider: open.provider }, 409", "provider: open.provider }, 400", "rt2-open-subscription"],
    ["CK38 a renewal in dunning answers 403 again, so a browser without an account forgets its licence while Creem retries the card and never gets Pro back from the retry", "src/license.js", "  if (entitlement.status === \"suspended\" || entitlement.status === \"past_due\") {", "  if (entitlement.status === \"suspended\") {", "rt2-creem-expired"],
    ["CK39 an expiry of a cancellation the customer scheduled is read as dunning, so they are told a payment failed and refused a new checkout", "src/creem.js", "  if (eventType === \"subscription.expired\" && raw === \"scheduled_cancel\") {\n    return \"canceled\";\n  }\n", "", "rt2-creem-expired"],
    ["CK39b a refund or chargeback whose subscription Creem already cancelled leaves it open, so the refunded customer is refused a new checkout", "src/creem.js", "    reverseLatestCharge: true,\n    ...reversalEnding(object)\n", "    reverseLatestCharge: true\n", "rt2-creem-reversal"],
    ["CK39c the cancellation a refund carries is not terminal, so a late snapshot that still says active reopens the subscription", "src/creem.js", "return { status: \"canceled\", terminal: true, endedAt: isoSeconds(subscription.canceled_at) };", "return { status: \"canceled\", endedAt: isoSeconds(subscription.canceled_at) };", "rt2-creem-reversal"],
    ["CK39d any refund or chargeback cancels the subscription it names, even one Creem says is still active and charging", "src/creem.js", "    || mapCreemStatus(subscription.status) !== \"canceled\") {", "    ) {", "rt2-creem-reversal"],
    ["VW1a a Creem cancellation is not terminal (only an expiry whose snapshot says cancelled is), so a stray payment after a cancellation reopens it", "src/creem.js", "    terminal: status === \"canceled\"\n", "    terminal: status === \"canceled\" && eventType !== \"subscription.canceled\"\n", "rt2-creem-expired"],
  ].map(([name, file, from, to, test]) => ({
    name,
    file: `workers/entitlements/${file}`,
    from,
    to: to.replace("SEQ", SEQUENTIAL),
    cmd: node([`workers/entitlements/test/${test}.test.mjs`])
  })),
  // Red team, Nov 2026 (browser injection and framing). CXSS-1: three fields of the synced progress document reached
  // innerHTML raw, and a stored <meta http-equiv="refresh"> moved every device on the account off the site under the
  // shipped CSP; the worker stored any object. Each mutant puts one defect back and names the test written for it: a
  // path under workers/ is a Node test file, anything else a browser spec under the real CSP, with a title filter.
  inject: [
    ["IJ1 the catalogue card's session count is drawn as stored: markup in the synced count becomes elements", "js/app.js", "    const n = Number(row?.completedCount);\n    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;", "    return row?.completedCount || 0;", "tests/synced-doc-injection.spec.js", "IJ1 "],
    ["IJ2 the hold pills draw each stored entry's seconds as they are, markup and all", "js/app.js", "      .map(holdSeconds)\n      .filter((s) => s !== null)\n", "      .map((l) => l.seconds)\n", "tests/synced-doc-injection.spec.js", "IJ2 "],
    ["IJ3 the 12-week plan's HUD puts the stored focus into its HTML unescaped", "js/practice-modes.js", "<span data-week-head>${escText(model.head)}</span>", "<span data-week-head>${model.head}</span>", "tests/synced-doc-injection.spec.js", "IJ3 "],
    ["IJ4 the hold pills are raw again, judged by the sweep of every synced field with Pro's panels drawn", "js/app.js", "      .map(holdSeconds)\n      .filter((s) => s !== null)\n", "      .map((l) => l.seconds)\n", "tests/synced-doc-injection.spec.js", "IJ4 "],
    // IJ5 is the end-to-end case: since js/sync.js normalises the account's copy (the syncing set), markup in the
    // count no longer reaches the sink by sign-in sync, so the test can only go red with both layers gone at once.
    ["IJ5 the catalogue count is raw again and the merge keeps a stored count as it is, judged end to end: the worker's copy arrives by sign-in sync and its meta refresh navigates", "js/app.js", "    const n = Number(row?.completedCount);\n    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;", "    return row?.completedCount || 0;", "tests/synced-doc-injection.spec.js", "IJ5 ", [{ file: "js/sync.js", from: "      completedCount: Math.max(whole(r.completedCount), history.length),", to: "      completedCount: r.completedCount," }]],
    ["IJ6 the worker takes any number-shaped field: markup as a session count or a hold's seconds is stored", "workers/entitlements/src/progress.js", "  return value === undefined || (typeof value === \"number\" && Number.isFinite(value) && value >= 0);", "  return true;", "workers/entitlements/test/progress.test.mjs"],
    ["IJ7 the worker takes a history or a log that is not a list", "workers/entitlements/src/progress.js", "  return value === undefined || Array.isArray(value);", "  return true;", "workers/entitlements/test/progress.test.mjs"],
    ["IJ8 the worker no longer looks inside the exercise rows", "workers/entitlements/src/progress.js", "  return Object.values(doc.progress || {}).every(rowIsSound) && (doc.holdLogs || []).every(holdIsSound);", "  return (doc.holdLogs || []).every(holdIsSound);", "workers/entitlements/test/progress.test.mjs"],
    ["IJ9 the worker no longer looks inside the hold log", "workers/entitlements/src/progress.js", "  return Object.values(doc.progress || {}).every(rowIsSound) && (doc.holdLogs || []).every(holdIsSound);", "  return Object.values(doc.progress || {}).every(rowIsSound);", "workers/entitlements/test/progress.test.mjs"],
    ["IJ10 over-strict: a document that leaves a list out is refused, though the client may send one so", "workers/entitlements/src/progress.js", "  return value === undefined || Array.isArray(value);", "  return Array.isArray(value);", "workers/entitlements/test/progress.test.mjs"],
    ["IJ11 over-strict: a week plan of null, what a browser with no plan sends, is refused", "workers/entitlements/src/progress.js", "  return value === undefined || value === null || isRecord(value);", "  return value === undefined || isRecord(value);", "workers/entitlements/test/progress.test.mjs"],
    ["IJ12 the worker takes a list as the whole document", "workers/entitlements/src/progress.js", "  return value !== null && typeof value === \"object\" && !Array.isArray(value);", "  return value !== null && typeof value === \"object\";", "workers/entitlements/test/progress.test.mjs"],
    // CXSS-2: GitHub Pages cannot send frame-ancestors, so the first script of each page refuses a frame.
    ["IJ13 index.html renders in another origin's frame: boot-head.js no longer hides it", "js/boot-head.js", "  if (framed()) {\n", "  if (false) {\n", "tests/frame-guard.spec.js", "IJ13 "],
    ["IJ14 admin.html renders in another origin's frame: its guard no longer runs", "js/frame-guard.js", "  if (!framed()) return;\n", "  return;\n", "tests/frame-guard.spec.js", "IJ13 "],
    ["IJ15 framed by its own origin, neither page asks to be the top window", ["js/boot-head.js", "js/frame-guard.js"], "window.top.location.replace(window.location.href);", "void 0;", "tests/frame-guard.spec.js", "IJ14 "],
    ["IJ16 over-blocking: admin.html takes itself for framed when it is the top window, and never shows", "js/frame-guard.js", "      return window.top !== window.self;", "      return true;", "tests/frame-guard.spec.js", "IJ15 "],
    // CXSS-3: a report's contact, typed by anyone, became the admin's reply link as it was (mailto header fields).
    ["IJ17 the reply link is the contact as typed: ?bcc=, &body= and a second recipient reach the admin's mail client", "js/admin.js", "    const href = replyHref(contact);", "    const href = `mailto:${contact}`;", "tests/admin-reply-link.spec.js"],
    ["IJ18 any character but @ passes as the local part: a comma writes to a second recipient", "js/admin.js", "  const PLAIN_LOCAL = /^[A-Za-z0-9.!#$'*+^_`{|}~-]{1,64}$/;", "  const PLAIN_LOCAL = /^[^@\\s]{1,64}$/;", "tests/admin-reply-link.spec.js"],
    ["IJ19 any text passes as the domain: the header fields after it are kept", "js/admin.js", "  const PLAIN_DOMAIN = /^(?=.{1,253}$)", "  const PLAIN_DOMAIN = /^(?=.*$)|^(?=.{1,253}$)", "tests/admin-reply-link.spec.js"],
    ["IJ20 the local part is not percent-encoded: a # in it starts a fragment and the mail goes to the part before it", "js/admin.js", "    return `mailto:${encodeURIComponent(local)}@${domain}`;", "    return `mailto:${local}@${domain}`;", "tests/admin-reply-link.spec.js"],
    // CXSS-4: the spec that stood for this wrote #ex-steps with its own escapeHtml and passed on this mutant.
    ["IJ21 the exercise's steps are put into #ex-steps unescaped", "js/app.js", "      .map((s) => `<li>${escapeHtml(s)}</li>`)", "      .map((s) => `<li>${s}</li>`)", "tests/redteam-client.spec.js", "IJ21 "],
    ["IJ22 a stored count of \"1e400\" is drawn as Infinity sessions (coerced, but not checked finite)", "js/app.js", "    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;", "    return Math.max(0, Math.floor(n || 0));", "tests/synced-doc-injection.spec.js", "IJ1 "]
  ].map(([name, file, from, to, spec, grep, also]) => ({
    name,
    file,
    from,
    to,
    ...(also ? { also } : {}),
    cmd: spec.startsWith("workers/")
      ? node([spec])
      : [...PIANO_SPEC.slice(0, 3), spec, "--project=chromium", "--workers=4", "--reporter=dot", ...(grep ? ["-g", grep] : [])]
  })),
  // Red team, Nov 2026 (sign-in). AUTHN-1: Google sign-in found the account by the token's email and ignored `sub`, so
  // a second Google account with the same address entered the first one's account (admin included) and a Google
  // account whose address changed got an empty one. AUTHN-2: a switched-off account still got a session and a licence
  // from both sign-in routes. AUTHN-7: no response said nosniff. The last two mutants take the client's messages for
  // the new refusals away, which made both read "Algo falló — inténtalo de nuevo".
  authwall: [
    ["AW1 Google sign-in looks the account up by email only: a renamed Google account gets an empty account", "workers/entitlements/src/api.js", "  let account = await getAccountByIdentity(env.DB, \"google\", identity.subject);", "  let account = null;", "workers/entitlements/test/sign-in-identity.test.mjs"],
    ["AW2 a second Google account with a taken address walks into the first one's account", "workers/entitlements/src/api.js", "    if (known.length && !known.includes(identity.subject)) {", "    if (false) {", "workers/entitlements/test/sign-in-identity.test.mjs"],
    ["AW3 over-strict: an account no Google account owns yet can never be joined by Google", "workers/entitlements/src/api.js", "    if (known.length && !known.includes(identity.subject)) {", "    if (!known.includes(identity.subject)) {", "workers/entitlements/test/sign-in-identity.test.mjs"],
    ["AW4 Google sign-in hands a switched-off account a session and a licence", "workers/entitlements/src/api.js", "  if (isDisabled(account)) {\n    return { ok: false, status: 403, reason: \"disabled\" };", "  if (false) {\n    return { ok: false, status: 403, reason: \"disabled\" };", "workers/entitlements/test/sign-in-identity.test.mjs"],
    ["AW5 an emailed code hands a switched-off account a session and a licence", "workers/entitlements/src/api.js", "  if (isDisabled(account)) {\n    // Before the code is spent", "  if (false) {\n    // Before the code is spent", "workers/entitlements/test/sign-in-identity.test.mjs"],
    ["AW6 a Google account's sub is never recorded, so its next sign-in after an address change starts over", "workers/entitlements/src/api.js", "  await recordIdentity(env.DB, account.id, \"google\", identity.subject, at);\n  return { ok: true, account };", "  return { ok: true, account };", "workers/entitlements/test/sign-in-identity.test.mjs"],
    ["AW7 over-strict: an account that was never switched off reads as switched off", "workers/entitlements/src/accounts.js", "  return Boolean(account) && account.disabled_at !== null && account.disabled_at !== undefined;", "  return Boolean(account) && account.disabled_at !== undefined;", "workers/entitlements/test/sign-in-identity.test.mjs"],
    ["AW8 JSON answers lose nosniff", "workers/entitlements/src/index.js", "      \"x-content-type-options\": \"nosniff\",\n      ...(headers || {})", "      ...(headers || {})", "workers/entitlements/test/sign-in-identity.test.mjs"],
    ["AW9 the preflight loses nosniff", "workers/entitlements/src/index.js", "headers: { ...cors, \"x-content-type-options\": \"nosniff\" } });", "headers: cors });", "workers/entitlements/test/sign-in-identity.test.mjs"],
    ["AW10 a switched-off account is told \"something went wrong\" and retries", "js/app.js", "    disabled: \"auth.err.disabled\",\n", "", "tests/redteam-accounts-profiles.spec.js", "switched-off account is told so"],
    ["AW11 a Google account refused for a taken address is not told to use the emailed code", "js/app.js", "    identity_conflict: \"auth.err.identityConflict\"\n", "", "tests/redteam-accounts-profiles.spec.js", "address another Google account holds"],
    ["AW12 with no emailed code on offer, an identity conflict still sends the person to one", "js/app.js", "    if (reason === \"identity_conflict\" && !accountSignIn().canEmail) return", "    if (false) return", "tests/redteam-accounts-profiles.spec.js", "address another Google account holds"],
    ["AW13 an identity conflict always names a report, though an emailed code is on offer", "js/app.js", "    if (reason === \"identity_conflict\" && !accountSignIn().canEmail) return", "    if (reason === \"identity_conflict\") return", "tests/redteam-accounts-profiles.spec.js", "address another Google account holds"]
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

export const DEFAULT_SETS = ["audio", "pitch", "lint", "coaching", "sets", "ledger", "mpPaid"];

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

/** Every edit a mutant makes: its from/to in each of its files, then each of its `also` edits, in order. */
function mutantEdits(m, root) {
  const own = [].concat(m.file).map((f) => ({ file: path.join(root, f), from: m.from, to: m.to }));
  return own.concat((m.also || []).map((e) => ({ file: path.join(root, e.file), from: e.from, to: e.to })));
}

/**
 * A mutant changes one file, or the same text in every file of a list (a defect
 * made on all four pages at once, which a "the pages agree" check cannot see).
 * `also` adds further edits made together with it: a defect that only shows
 * when two layers of one defence are both gone (an end-to-end test behind a
 * sink escape and a normalisation upstream of it). Every anchor must occur
 * exactly once in the text it is applied to, or the result is ANCHOR.
 * @returns {"KILLED"|"SURVIVED"|"ANCHOR"}
 */
export function tryMutant(m, root = process.cwd()) {
  const edits = mutantEdits(m, root);
  const originals = new Map(edits.map((e) => [e.file, readFileSync(e.file, "utf8")]));
  const mutated = new Map(originals);
  for (const e of edits) {
    const src = mutated.get(e.file);
    if (src.split(e.from).length !== 2) return "ANCHOR";
    mutated.set(e.file, src.replace(e.from, e.to));
  }
  mutated.forEach((src, f) => writeFileSync(f, src));
  try {
    return runTests(m.cmd, root) ? "SURVIVED" : "KILLED";
  } finally {
    originals.forEach((src, f) => writeFileSync(f, src));
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
