/**
 * Mutation check: does the test suite notice a planted defect?
 *
 * Each mutant replaces one exact snippet of shipped code with a plausible bug,
 * runs the tests that are supposed to guard it, and restores the file. A test
 * suite that stays green on a mutant is not testing that behaviour, however
 * high its coverage. Ported from the QA thread's mutate.py (2026-11-01).
 *
 *   node qa/mutate.mjs            # the Node sets (audio, lint)
 *   node qa/mutate.mjs audio      # one set
 *   node qa/mutate.mjs stage a11y flows billing scoring controls audit  # browser sets: need Playwright's Chromium
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
  "tests/node/safari-audio-contract.test.mjs",
  "tests/node/piano-range.test.mjs",
  "tests/node/microphone-race.test.mjs",
  "tests/node/engine-scoring.test.mjs"
];
const LINT_TESTS = ["qa/lint-gate.test.mjs", "tests/node/asset-versions.test.mjs", "tests/node/csp.test.mjs", "tests/node/env-noise.test.mjs", "tests/node/inline-script-pin.test.mjs"];
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
  mic: ["tests/safari-mobile-recovery.spec.js", "-g", "permission prompt is up"]
};

export const MUTANTS = {
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
    ["M26 one long gap between clock checks counts in full (PR #25 CI red)", "js/practice-engine.js", "const step = Math.min(AUDIO_CLOCK_MAX_STEP_MS, Math.max(0, now - (this._audioClockCheckedAt || now)));", "const step = Math.max(0, now - (this._audioClockCheckedAt || now));"],
    ["M27 a frozen clock never adds up to Retry", "js/practice-engine.js", "      this._audioClockStalledMs += step;\n", ""],
    ["M28 a resume keeps the stall from before the interruption", "js/practice-engine.js", "            this._resetAudioClockWatch(this._lastFrameAt);\n", ""],
    ["M29 the note table stops at C1 again (octave -2 plays chords without their bass, PR #24)", "js/piano.js", "for (let oct = 0; oct <= 8; oct++) {", "for (let oct = 1; oct <= 6; oct++) {"],
    ["M30 Stop no longer cancels a Start waiting on the permission prompt", "js/practice-engine.js", "      this._startGen++; // a Start still waiting on the mic or its graph is cancelled\n", ""],
    ["M31 a microphone granted after Stop goes live", "js/practice-engine.js", "      if (gen === this._startGen) return stream;", "      if (gen === gen) return stream;"],
    ["M32 a Stop during the graph's resume reported as a microphone failure", "js/practice-engine.js", "      if (gen !== this._startGen) {\n        // Stop or a newer Start came while the graph was built", "      if (false) {\n        // Stop or a newer Start came while the graph was built"],
    ["M33 a hold bridges the minute a hidden tab drew no frames", "js/practice-engine.js", "    if (this._lastFrameAt && performance.now() - this._lastFrameAt > this._silenceEndMs()) this._maybeEndHold(true);\n", ""],
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
    ["M48 octave -2 shows chord lanes at 16-31 Hz", "js/pitch-visualizer.js", "    const notes = chord?.notes?.filter((n) => !(map[n] < LANE_FLOOR_HZ));", "    const notes = chord?.notes;"]
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
    ["L14 any error from the worker's host is ignored (QA-14)", "qa/env-noise.cjs", "return url.startsWith(WORKER);", "return true;"],
    ["L15 a failed load of the app's own file counts as offline noise", "qa/env-noise.cjs", "return url !== \"\" && !LOCAL.test(url);", "return url !== \"\";"],
    ["L16 any inline script may ride on its CSP hash (QA-15)", "tests/node/inline-script-pin.test.mjs", "const unlisted = (html) => inlineScripts(html).filter((b) => !ALLOWED_INLINE.has(b));", "const unlisted = (html) => inlineScripts(html).filter(() => false);"],
    ["L7 empty wait-may-fail reason accepted", "qa/lint-playwright-waits.mjs", "/wait-may-fail:\\s*\\S/", "/wait-may-fail:/"]
  ].map(([name, file, from, to]) => ({ name, file, from, to, cmd: node(LINT_TESTS) })),
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
    ["R1 octave -2 shown without its caution", "js/app.js", "if (moved && !opts.silent && state.octaveShift === -2) cautionLowOctave();", "if (moved && !opts.silent && state.octaveShift === -9) cautionLowOctave();", "range"],
    ["R4 in a take the piano's restart toast replaces the caution at once", "js/app.js", "    if (state.practiceLive && state._hotApplyPromise) state._hotApplyPromise.then(say, say);\n    else say();", "    say();", "range"],
    ["R5 the label forgets octave -2 once the toast is gone", "js/app.js", "      lab.classList.toggle(\"oct-caution\", low);\n", "", "range"],
    ["R6 the label's title does not explain octave -2", "js/app.js", "      lab.title = low\n        ? tt(\"range.lowOctaveHint\")", "      lab.title = false\n        ? tt(\"range.lowOctaveHint\")", "range"],
    ["R2 the auto range reaches -2 without the caution", "js/app.js", "        shiftOctave(dec.shift, { source: \"auto\", decision: dec });", "        applyOctaveShift(dec.shift, { source: \"auto\", decision: dec });", "range"],
    ["R3 the - button reaches -2 without the caution", "js/app.js", "    shiftOctave(state.octaveShift + delta, { source: \"manual\" });", "    applyOctaveShift(state.octaveShift + delta, { source: \"manual\" });", "range"],
    ["G1 guided Next offered before Start", "js/scenes/guided.js", "        nextStep.disabled = true; //", "        nextStep.disabled = false; //", "guided"],
    ["G2 guided Next still offered after Stop", "js/scenes/guided.js", "      this.live = false;\n      this._nextStepDisabled(true);\n", "      this.live = false;\n", "guided"],
    ["C1 the Plan button says it starts a week it cannot start", "js/app.js", "      : tt(\"plan.chooseFocus\");", "      : tt(\"plan.startWith\", { n: plan.weekNumber, element: \"\" });", "copy"],
    ["C2 one saved session read as \"1 sesiones\"", "js/i18n.js", "\"pricing.personalHave\": \"Sesiones guardadas: {sessions} ·", "\"pricing.personalHave\": \"Hasta hoy: {sessions} sesiones ·", "copy"],
    ["C3 one saved session read as \"1 sessions\"", "js/i18n.js", "\"pricing.personalHave\": \"Saved sessions: {sessions} ·", "\"pricing.personalHave\": \"So far: {sessions} sessions ·", "copy"],
    ["MC1 leaving a take while the mic prompt is up leaves its Start pending", "js/app.js", "if (state.practiceLive || state.practice.running || state.practice.starting) {", "if (state.practiceLive || state.practice.running) {", "mic"]
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
    ["S5 the stage stays sticky over a panel it cannot sit beside", "css/styles.css", ".game-stage.piano-unstick .highway-stage {\n  position: relative;", ".game-stage.piano-unstick .highway-stage {\n  position: sticky;"]
  ].map(([name, file, from, to]) => ({ name, file, from, to, cmd: PIANO_SPEC })),
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
        ["A10 a two-line toast taller than the desktop row (CI's wider font)", "css/styles.css", "  padding: 0.15rem 0.75rem;\n  border-radius: 14px;\n  font-size: 0.8rem;\n  line-height: 1.2;", "  padding: 0.25rem 0.75rem;\n  border-radius: 14px;\n  font-size: 0.8rem;\n  line-height: 1.25;"]
      ].map(([name, file, from, to]) => ({
        name,
        file,
        from,
        to,
        specs: ["tests/focus-not-obscured.spec.js", "tests/bottom-rail.spec.js", "tests/target-size.spec.js", "tests/toast-placement.spec.js", "--workers=4"]
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
      name: "AU6 the ledger hides every failed load as environment noise (QA-14)",
      file: "qa/audit/analyze-audit.mjs",
      from: 'if (!isEnvNoise(e.replace(/^console: /, "")))',
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
  // Console routes to Pro (QA-05), each closed by one freeze.
  billing: [
    ["B1 the config object left writable", "js/billing-config.js", "    return Object.freeze(o);", "    return o;"],
    ["B2 only the config's top level frozen", "js/billing-config.js", '    Object.values(o).forEach((v) => v && typeof v === "object" && freeze(v));\n', ""],
    ["B3 the config binding left replaceable", "js/billing-config.js", '  Object.defineProperty(global, "VT_BILLING_CONFIG", { value: held, writable: false, configurable: false, enumerable: true });', ""],
    ["B4 VTBilling's answers left replaceable", "js/billing.js", "value: Object.freeze(global.VTBilling)", "value: global.VTBilling"],
    ["B5 VTLicense's claims left replaceable", "js/license.js", "value: Object.freeze(global.VTLicense)", "value: global.VTLicense"]
  ].map(([name, file, from, to]) => ({
    name,
    file,
    from,
    to,
    cmd: [...PIANO_SPEC.slice(0, 3), "tests/console-unlock.spec.js", "--project=chromium", "--workers=4", "--reporter=dot", "-g", "console:"]
  }))
};

export const DEFAULT_SETS = ["audio", "lint"];

/** What the last failing command printed, so a red baseline in CI says which test failed. */
let lastFailure = "";

function runTests([cmd, ...args], root) {
  try {
    execFileSync(cmd, args, { cwd: root, stdio: "pipe", timeout: 300000, maxBuffer: 64 * 1024 * 1024 });
    return true;
  } catch (e) {
    lastFailure = `${e.stdout || ""}${e.stderr || ""}`.split("\n").slice(-80).join("\n");
    return false;
  }
}

/** @returns {"KILLED"|"SURVIVED"|"ANCHOR"} */
export function tryMutant(m, root = process.cwd()) {
  const file = path.join(root, m.file);
  const src = readFileSync(file, "utf8");
  if (src.split(m.from).length !== 2) return "ANCHOR";
  writeFileSync(file, src.replace(m.from, m.to));
  try {
    return runTests(m.cmd, root) ? "SURVIVED" : "KILLED";
  } finally {
    writeFileSync(file, src);
  }
}

function main(sets) {
  let bad = 0;
  for (const set of sets) {
    // A suite that is already red "kills" every mutant: check it green first.
    const cmds = [...new Set(MUTANTS[set].map((m) => JSON.stringify(m.cmd)))];
    if (!cmds.every((c) => runTests(JSON.parse(c), process.cwd()))) {
      console.log(`RED      [${set}] the unmutated tests already fail; no mutant can be judged`);
      console.log(`--- last 80 lines of the failing run ---\n${lastFailure}\n--- end ---`);
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
  const want = process.argv.slice(2);
  main(want.length ? want : DEFAULT_SETS);
}
