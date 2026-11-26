// The copy's promises, read from the code. tests/marketing-claims.spec.js proves them for the visitors it plays,
// and the third red team (docs/48 section 11) showed what that cannot reach: 27 changes that broke a promise
// on a path no visitor there walks. A take uploaded when it is rated, when the clock runs out on its own, on
// a singing exercise, on the second save, on the third visit, two minutes later, by the account sync, to the
// window that opened the site, in a streamed body, over DNS; a cap on the routine's second step, on '+30 s',
// on the class and the goal sets, past a trial, in another time zone, on a phone, on a take with no microphone.
//
// A browser test can only walk paths. These read the code, so they hold on every path:
//
// 1. Every way off the device is written down here, function by function, with why it is there. A new one,
//    on any path, fails until somebody writes down why, and says why it cannot carry the voice.
// 2. Only the files that make a take can hear the voice or read a take, and in each of them no function that
//    does leads to one that sends.
// 3. Start, Stop, Continue, the routines (their banner's pause, continue and end too), the take's own record
//    and stop, the welcome-back and reminder starts, the rating, Next and '+30 s' never reach the pricing
//    window, and read the plan only in the functions listed, to draw Pro's own extras. The path follows calls,
//    callbacks handed on, functions handed another (`proOnly(startDaily)`), callbacks set on a property (a
//    button's onclick, the engine's onFrame), each handler on its own element (one found by a computed
//    selector is named by its fixed text), and methods called on `this`. Each function on the path that reads
//    the plan, each that uses one's answer, and each one is handed to, is pinned by its code: a change to what
//    it does with the answer fails until somebody reads it again and writes down that it still only draws.
// 4. The plan is read only in the files listed, and in them only by the functions written down with why, as is
//    every function that asks about the account or opens the sign-in: a cap need not be on the path (a
//    page-wide capture listener swallows a Start and calls nothing in practice), and needs a plan or account
//    read or a window to open. The sale and the sign-in are known by their openers' names, the licence's, every
//    element bound to open them (derived from the code, through what a handler calls, and by a class only it
//    has on the page, so a new Pro button joins on its own), their dialogs shown by id or class, the marks the
//    readers paint (derived from what they write), and the keys they keep (derived from their files). A string
//    is read as a selector, so a mark or a door inside a compound selector counts.
// 5. Every event's props are the ones in the plan below: js/analytics.js sends only what the worker keeps
//    (tests/node/analytics-wire.test.mjs), and this keeps a new prop on a known event from riding out.
// 6. No account needed: nothing on the way to practising, saving a take, rating it or looking back at the
//    history touches the account module (or the older sign-in, VTAuth) or asks whether the visitor is signed
//    in, but headerPlanState (the header's label, the board's tag, the trial funnel) and the page's way out;
//    the code that keeps a guest's
//    progress never asks, never keeps it for the tab only, and keeps it under the names it always has.
// 7. No ad during practice: only the two ad files read the ad config, so no toast or card elsewhere can carry
//    an ad past its practice gate, and they ask Google for nothing but the units the page draws (no push, seed
//    or other array method puts anything else on its queue). Google's Auto ads (anchor
//    and vignette overlays) are not asked for by the page: they are a switch in the AdSense account, which no
//    test can see, so the go-live checklist keeps it off (docs/40 step 9c).
//
// What these do not do: see a sink spelt through a computed name, follow a value handed through a variable
// (between files, or kept at a file's top level), follow the plan's answer kept in state and read elsewhere,
// read the plan off an element's hidden state or label, know a door by a selector it shares with others, or
// see a cap that reads no plan and opens no window. The browser visitors walk every way into practice for
// those (tests/marketing-claims.spec.js). They are tripwires for honest changes, which is how the 27
// were written; the browser visitors and review are the rest.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { parse } from "espree";
import { analyze } from "eslint-scope";
import {
  ACCOUNT_HANDLES,
  ACCOUNT_KEYS,
  ACCOUNT_LITERALS,
  ACCOUNT_MARKS,
  ACCOUNT_NAMES,
  BILLING_HANDLES,
  BILLING_KEYS,
  BILLING_LITERALS,
  BILLING_MARKS,
  BILLING_NAMES,
  DIALOGS,
  accountNamesIn,
  acrossScripts,
  adPushes,
  billingNamesIn,
  functionNodes,
  functionsOf,
  openerHandles,
  practicePath,
  reachable,
  selectorWords,
  shippedScripts,
  sinksIn,
  usesByFunction,
  voiceSourcesIn
} from "../../qa/promise-scan.mjs";

/** Every way off the device: file → "function › kind" → [count, why]. */
export const EGRESS = {
  "js/account.js": {
    "request › fetch": [1, "every account call (sign-in, the progress sync, trial, licence): JSON to the worker, never a take"],
    "loadGoogleScript › createElement:script": [1, "Google's sign-in button, loaded when the account panel asks for it"],
    "loadGoogleScript › set:src": [1, "the same script's fixed address"]
  },
  "js/admin-layouts.js": {
    "load › VTAccount.request": [1, "the admin window's layout counts (GET)"],
    "loadGlance › VTAccount.request": [2, "the admin window's health and layout glance (GET)"]
  },
  "js/admin.js": { "api › VTAccount.request": [1, "the admin window's calls, for the owner's account only"] },
  "js/ads.js": {
    "renderNativeCard [data-ad-cta] › window.open": [1, "a house ad's link, opened when it is clicked"],
    "renderAdSensePlaceholder › createElement:script": [1, "AdSense's script, outside practice and never for Pro"],
    "renderAdSensePlaceholder › set:src": [1, "the same script's fixed address"]
  },
  "js/analytics.js": {
    "flush › sendBeacon": [1, "events, as the worker keeps them (wireEvent), on the way out of the page"],
    "flush › fetch": [1, "the same events, batched"],
    "forget › fetch": [1, "the request to delete this browser's events"]
  },
  "js/app.js": {
    "renderTourInvite › set:href": [1, "a link to the guide"],
    "syncGuideLinks › set:href": [1, "links to the guide"],
    "syncGuideLinks › setAttribute:href": [1, "links to the guide"],
    "renderExercise › html:input": [1, "the exercise's own sliders, no address"],
    "showPlayback › html:audio": [1, "the take played back from its blob: address, on the device"],
    "renderMetricsForm › html:input": [2, "the rating form's fields, no address"],
    "bindHistoryList btn › createElement:audio": [1, "a saved take played back, on the device"],
    "bindHistoryList btn › set:src": [1, "its blob: address"],
    "bindHistoryList btn › html:audio": [2, "the saved takes' players"],
    "bindAccount #gift-grant-form › VTAccount.request": [1, "the owner's grants, admin only"],
    "bindAccount #gift-code-form › VTAccount.request": [1, "the owner's gift codes, admin only"],
    "renderGiftCodes › VTAccount.request": [1, "the owner's gift codes (GET), admin only"],
    "renderFunnel › VTAccount.request": [1, "the owner's funnel (GET), admin only"],
    "renderAbResults › VTAccount.request": [2, "the owner's A/B results (GET), admin only"],
    "exportProgress › set:href": [2, "the progress file the visitor downloads, from a blob: address"]
  },
  "js/billing.js": {
    "openCustomerPortal › window.open": [1, "the payment provider's portal, when a subscriber asks for it"],
    "startCheckout › navigate": [1, "the checkout page, when a buyer presses buy"]
  },
  "js/boot-head.js": { "(top) › navigate": [1, "out of a frame another site put the page in"] },
  "js/frame-guard.js": { "(top) › navigate": [1, "out of a frame another site put the page in"] },
  "js/license.js": { "postJson › fetch": [1, "a licence key checked with the worker"] },
  "js/region-gate.js": {
    "askWorker › fetch": [1, "which country's consent rules apply, asked once"],
    "renderBar › setAttribute:href": [1, "the consent bar's link to the privacy page"]
  },
  "js/reminders.js": { "downloadIcs › set:href": [1, "the calendar file the visitor downloads, from a blob: address"] },
  "js/reports.js": {
    "mineSection button › VTAccount.request": [1, "the visitor's own bug reports (GET)"],
    "send › VTAccount.request": [1, "a bug report the visitor typed and pressed send on"]
  },
  "js/scenes/guided.js": {
    "attach › new Audio": [1, "the take played back in the guided review, on the device"],
    "attach › set:src": [1, "its blob: address"]
  },
  "js/sync.js": {
    "readAccount › VTAccount.request": [1, "the signed-in visitor's progress, read from their account"],
    "runCycle › VTAccount.request": [1, "their progress (days, ratings, minutes) written to their account; takes stay (sync.js header)"],
    "flush › VTAccount.request": [1, "the same, on the way out of the page"]
  },
  "js/tour.js": { "render › set:href": [1, "a link to the guide"] }
};

/** The files that hear the voice or read a take, and what they use to. */
export const VOICE_FILES = {
  "js/app.js": ["getRecordingBlob", "listRecordings", "saveRecording"],
  "js/piano.js": ["MediaRecorder", "getFloatTimeDomainData", "getUserMedia"],
  "js/pitch-visualizer.js": ["createMediaStreamSource", "getFloatTimeDomainData", "getUserMedia"],
  "js/practice-engine.js": [
    "MediaRecorder",
    "createMediaStreamSource",
    "getByteFrequencyData",
    "getFloatTimeDomainData",
    "getUserMedia",
    "ondataavailable",
    "recBlob"
  ],
  "js/recorder.js": ["MediaRecorder", "createMediaStreamSource", "getByteTimeDomainData", "getUserMedia", "ondataavailable"],
  "js/storage.js": ["getRecordingBlob", "listRecordings", "recordings", "saveRecording", "vt_recordings_db"]
};

/** Sinks that reach the network. An element's address and a player's blob: are left to the list above. */
const NETWORK = /› (fetch|fetchLater|sendBeacon|postMessage|window\.open|navigate|submit|cookie|share|VTAccount\.request|import|importScripts|serviceWorker\.register|hint|speech-recognition|new (?!Audio$))/;

/**
 * Where practice starts, goes on and ends, and where a take is saved and looked back at: the binders and what they
 * call. The routine's banner (pause, continue, end), the take's own record and stop (bindTakeTools) and the
 * welcome-back and reminder starts (startMicroSession) are wired in binders that also open other things, so their
 * practice handlers are roots by name: a click handler is a function of its own, "binder #selector".
 */
const PRACTICE_CORE = [
  "bindPracticeButtons",
  "bindTakeTools",
  "bindRating",
  "bindReferenceCues",
  "renderNextStepCard",
  "renderStartPanel",
  "openPlanExercise",
  "startDaily",
  "startStructured",
  "advanceStructured",
  "openExercise",
  "forceOpenExercise",
  "startPractice",
  "continuePractice",
  "stopPractice",
  "startPlan",
  "runLiveTake",
  "startTimer",
  "recordPracticeIfDue",
  "stepDoneChoice",
  "completeExercise",
  "rateFeel",
  "leaveUnrated",
  "showPlayback",
  "renderHistory",
  "bindHistoryList",
  "pauseStructured",
  "resumeStructured",
  "askEndStructured",
  "endStructured",
  "startMicroSession"
];

/**
 * And every other function that calls one of those, so that a cap ahead of the call is on the path too: each is
 * here, or in NOT_A_WAY_IN with why it is not a way in (the test "every function of js/app.js that calls...").
 */
export const PRACTICE_ROOTS = [
  ...PRACTICE_CORE,
  // Everything the page binds on load: the practice screen's own controls, the piano among them, and what keeps a
  // take when the page hides.
  "bind",
  // The welcome-back card and the reminder's "start now": each starts a short session from its click.
  "bindRetention #wb-micro",
  "bindRetention #wb-last",
  "bindRetention #rd-start",
  // A link that opens an exercise or the history, the tour's steps, the pitch view's own start, the daily loop's and
  // the goal sets' starts, and the redraws after a profile switch, a synced record or a new day.
  "reopenRoutedExercise",
  "applyInitialRoute",
  "tourShow",
  "startPitchViz",
  "init.startRoutine",
  "init.startSet",
  "init.refresh",
  "showActiveProfile",
  "showSyncedRecord",
  "catchUpDay"
];

/**
 * The functions of js/app.js that call into practice and are not on its path, what each may read of the plan or
 * the account (nothing, but where written), and why each is not a way in.
 */
export const NOT_A_WAY_IN = {
  init: ["", "the page's start: it hands startDaily to the daily loop and to the page's own hooks, and calls neither"],
  "init.onChange": ["", "the redraw after the language changes: it draws the price dialog too, and starts nothing"],
  "bindRetention document": ["", "when the tab comes back, it redraws the next step's card: it starts nothing"],
  "bindAuth #admin-clear-progress": ["VTAuth:1", "the owner's admin button: it asks the older sign-in whether this is the owner, clears the progress and redraws the history"]
};

/** The functions on that path that read the plan, what they read, and why: each draws, none stops practice. */
export const PLAN_READERS = {
  renderValuePulse: ["VTBilling:1 getEntitlement:1 trialDaysLeft:1", "the progress board's Pro panel and trial line"],
  headerPlanState: ["VTBilling:1 getEntitlement:1", "the header's plan label, the progress board's tag, and Start's trial funnel (it records trial_first_practice once, and starts nothing)"],
  renderProGoalPicker: ["#sel-week-goal:1 VTBilling:2", "Pro's goal picker, shown locked to a free visitor"],
  renderRetentionChrome: ["VTBilling:2 isPro:3", "the reminders card: Pro's second reminder"],
  renderReminderSettings: ["#rem-time-2:1 isPro:2", "the same card's second time field"],
  showValueMoment: ["VTBilling:1", "the note about the trial after a long hold, a saved or rated take, or opening the history"],
  putAwayValueBanner: ["#btn-profile-add:1 #btn-value-pro:1", "puts that note away, and hands the focus it held to the board's next control (Pro's button among them)"],
  valueMomentFor: ["getEntitlement:1 trialDaysLeft:2", "which note that is"],
  showValueBanner: ["dataset.momentId:1 trialDaysLeft:1", "the trial's days left on that note, and which note it is"],
  progressionKeysFor: ["VTBilling:1", "Pro's extra piano progressions, an extra on top of the exercise"]
};

/** The functions on that way that touch the account module or ask whether the visitor is signed in, and why. */
export const SIGN_IN_READERS = {
  headerPlanState: ["VTAccount:1 signedIn:1", "the header's plan label (Pro, trial, or signed in), the board's tag, and Start's trial funnel"],
  "bindPageLifecycle window": ["VTSync:1", "when the page hides, after the take is kept here, a signed-in visitor's copy is sent; a guest's is nothing"],
  "bindPageLifecycle document": ["VTSync:1", "the same, when the tab is hidden rather than closed"]
};

/**
 * The functions on that path whose code is pinned, and why each only draws: every one that reads the plan or asks
 * about the account, every one that uses the answer of one of those (a call whose value it keeps, tests or
 * returns), any number deep, and every one such a function hands an answer to (renderValuePulse hands
 * renderProStudio whether this is Pro), any number deep. A count of names cannot see what a function does with an
 * answer it already holds: `restQuickStarts(ent.pro)` in showValueMoment disables the routine's Continue past an
 * hour with no new name, `if (headerPlanState().kind === "free") return` in resumeStructured stops it with none,
 * and the same gate in renderProStudio, which is handed the answer, needs no call at all. So a change to one of
 * these, or a new one, fails until somebody reads it, checks it still only draws, and writes its new hash here.
 * The hash is of the code's tree, so a comment or the layout can change freely. The cost is a hash to bump with
 * each change to these 28 functions, renderExercise and the translator among them.
 */
export const REVIEWED = {
  accountDate: ["e115090f7375", "handed the plan's end: words it as a date"],
  accountPlanState: ["04ad386e9bd4", "handed the account's plan: names its kind, days left and end for the header"],
  "bindPageLifecycle document": ["34f1aa01e16c", "when the tab is hidden, a signed-in visitor's progress is sent; it touches no take and no control"],
  "bindPageLifecycle window": ["98854a941fd2", "the same when the page closes, after the take is kept here"],
  browserPlanState: ["a81248caa813", "handed the browser's plan: names its kind, days left and end for the header"],
  fillProgressionSelect: ["427d041d4d03", "handed the progressions the piano offers, Pro's among them: fills their picker"],
  headerPlanState: ["3cba7ff4a921", "names the plan for the header, the board's tag and the trial funnel; it gates nothing"],
  heldAccountPlan: ["f4f27ec0404a", "handed the plan and the account: which of the account's plans is held"],
  keysHaveProg: ["9ccada1cfbf8", "whether the exercise has piano progressions, Pro's among them"],
  planDaysLeft: ["dedfdfc67cb4", "handed a plan's end: the days left to it"],
  progressionKeysFor: ["8915126b1c58", "which progressions the piano offers: Pro's extras on top of the exercise's own"],
  putAwayValueBanner: ["d9f498db7a17", "puts the trial note away and hands its focus on (focus only: it presses nothing)"],
  renderExercise: ["20b94e94ce5f", "the exercise screen: an exercise with progressions starts the piano on one note at a time"],
  renderPianoControls: ["e001cc0ae102", "draws a button for each progression the piano offers"],
  renderProHoldTrend: ["77420a997edc", "handed whether this is Pro: the board's hold trend, or the line that unlocks it"],
  renderProInsights: ["16e25d761cf8", "handed whether this is Pro: the board's insights panel, locked or open"],
  renderProSpark: ["b70d065fe419", "handed whether this is Pro: the board's spark bars, dimmed or not"],
  renderProStudio: ["36bc138d2d7e", "handed whether this is Pro: draws the board's Pro panels, and Tu camino's card beside them (free, not handed the answer), and nothing else"],
  renderProGoalPicker: ["623363793da6", "Pro's goal picker, shown locked to a free visitor"],
  renderReminderSettings: ["ed9fb6c72da7", "the reminders card's second time field, Pro's"],
  renderRetentionChrome: ["7ad87c5e4427", "the reminders card: Pro's second reminder"],
  renderValuePulse: ["9b25f6afc411", "the progress board's Pro panel, its tag and the trial line"],
  showValueBanner: ["8a681379dce0", "the trial's days left on the note"],
  showValueMoment: ["d4d29b42fa1d", "the note about the trial: shown or put away, nothing else"],
  trackTrialFirstPractice: ["1662eabca5f5", "records trial_first_practice once for someone holding a trial; Start goes on either way"],
  tt: ["d75e0e6108f1", "the translator, handed the trial's days for the note's words"],
  valueMomentFor: ["0d7af863dfb7", "which note that is, from the plan and the progress"],
  valueMomentKey: ["b2f0d90d8d95", "handed the note and its days: the key of its words"]
};

/** The files that use the account module or ask whether the visitor is signed in, and why. */
export const SIGN_IN_FILES = {
  "js/account.js": "the account itself",
  "js/admin-layouts.js": "the owner's admin window, its layout counts",
  "js/admin.js": "the owner's admin window",
  "js/app.js": "the account panel, the header and the checkout's need of an account",
  "js/auth.js": "the older sign-in itself: the owner's and testers' accounts, never asked of a visitor",
  "js/billing.js": "a purchase tied to an account",
  "js/license.js": "the signed licence, whose claims name the account it was issued to",
  "js/reports.js": "a bug report's own list, for a signed-in reporter",
  "js/sync.js": "the progress sync, which runs only for a signed-in visitor",
  "js/tour.js": "the tour's step that points at the account button, which it does not press",
  "js/voice-path.js": "Tu camino: whose this tab's takes are (a fingerprint of the sign-in, never the session), and holding still while sync asks whose the practice is"
};

/** The files that keep a guest's progress: they never ask about an account and never keep anything for the tab only. */
export const GUEST_STORES = ["js/practice-days.js", "js/session.js", "js/storage.js"];
const NOT_IN_GUEST_STORES = new RegExp(`\\b(sessionStorage|${[...ACCOUNT_NAMES].join("|")})\\b`, "g");

/**
 * The names a guest's progress is kept under. With no account there is nothing to restore it from, so renaming one
 * loses every visitor's history (the third red team bumped vt_progress_v1 to v2 unseen): read the old name and move it
 * over first, then change this list.
 */
export const GUEST_KEYS = {
  progress: "vt_progress_v1",
  session: "vt_session_v1",
  weekPlan: "vt_week_plan_v1",
  settings: "vt_settings_v1",
  reviews: "vt_reviews_v1",
  holdLogs: "vt_hold_logs_v1",
  profiles: "vt_profiles_v1",
  goals: "vt_goals_v1",
  achievements: "vt_achievements_v1",
  days: "vt_days_v1",
  loop: "vt_loop_v1",
  DB_NAME: "vt_recordings_db",
  DB_STORE: "recordings"
};

/** The files that may read the ad config or talk to AdSense. */
export const AD_FILES = ["js/ads-config.js", "js/ads.js"];
const AD_NAMES = /\b(VT_ADS_CONFIG|adsbygoogle|nativeCards)\b/;

/** The files that read the plan, and why. */
export const PLAN_FILES = {
  "js/account.js": "the licence an account's plan comes with, adopted and cleared, and the first paid plan's mark",
  "js/ads.js": "no ads for Pro",
  "js/app.js": "the pricing window, the account panel, the Pro panels and the readers above",
  "js/auth.js": "the QA unlock of a test account",
  "js/billing.js": "the plan itself",
  "js/license.js": "the signed licence itself, the only proof of a paid plan billing trusts",
  "js/practice-days.js": "Pro's extra rest days for the streak",
  "js/reminders.js": "Pro's second reminder",
  "js/value-pulse.js": "the trial's days left on the progress board"
};

/**
 * Every function that reads the plan or opens the sale, file by file, with what it uses and why. A cap needs one
 * or the other, and it need not be on the way to practice to stop it: a page-wide capture listener that swallows
 * the welcome-back Start and opens the plans calls nothing in practice. So a new one, anywhere, fails here until
 * somebody writes down why, as a new way off the device does in EGRESS. "(top)" is the file's own top level.
 */
export const PLAN_USES = {
  "js/account.js": {
    adopt: ["VTLicense:4", "keeps the licence the worker signed for this account"],
    forget: ["VTLicense:1", "clears the licence on signing out"],
    refresh: ["VTLicense:1", "asks the worker for the account and its licence again"],
    getState: ["VTLicense:1", "the account's state: Pro when the account holds a signed licence"],
    init: ["VTLicense:1", "hands the licence its way to refresh itself"],
    followStoredSession: ["VTLicense:1", "a session another tab stored: hands the licence its way to refresh, as init does (QA-76)"],
    "(top)": ["vt_pro_paid_first_v1:1", "the key of the first paid plan's event, sent once"]
  },
  "js/ads.js": {
    isProUser: ["VTBilling:1 isPro:1", "no ads for Pro"],
    renderNativeCard: ["[data-ad-cta]:1", "draws the house card that sells Pro, and binds its button"],
    "renderNativeCard [data-ad-cta]": ["btn-pricing:1", "the house card that sells Pro opens the plans when it is pressed"]
  },
  "js/app.js": {
    progressionKeysFor: ["VTBilling:1", "Pro's extra piano progressions, an extra on top of the exercise"],
    isCheckoutPrelaunch: ["VTBilling:1", "whether checkout is open yet, for the pricing dialog's buttons"],
    headerPlanState: ["VTBilling:1 getEntitlement:1", "the header's plan label, the board's tag, and Start's trial funnel"],
    planLabel: ["btn-pro:1 plan-ending:2 plan-gift:1 plan-paid:1 plan-trial:1", "the header's Pro button: the class for each plan"],
    paintPlanButton: ["btn-pro:1 dataset.plan:1 plan-ending:1 plan-gift:1 plan-paid:1 plan-trial:1", "paints the header's Pro button with the plan it carries"],
    paintPlanSideButtons: ["#btn-account-pricing:1 #btn-export-progress:1", "the account panel's button to the plans, and the progress export, drawn for the plan"],
    trialSpent: ["VTBilling:1 trialStartedAt:1", "the pricing dialog's line on a trial already used"],
    updateBillingChrome: ["#btn-pricing:1 VTBilling:1 getEntitlement:1", "the header's Pro button's label"],
    renderValuePulse: ["VTBilling:1 getEntitlement:1 trialDaysLeft:1", "the progress board's Pro panel and trial line"],
    renderProGoalPicker: ["#sel-week-goal:1 VTBilling:2", "Pro's goal picker, shown locked to a free visitor"],
    renderReminderSettings: ["#rem-time-2:1 isPro:2", "the reminders card's second time field"],
    renderRetentionChrome: ["VTBilling:2 isPro:3", "the reminders card: Pro's second reminder"],
    saveTimes: ["#rem-time-2:2 VTBilling:1 isPro:2", "saving the reminders keeps the second time for Pro only"],
    bindRetention: ["#rem-time-2:1", "binds the reminders card's second time, Pro's"],
    bindProStudio: ["#btn-profile-add:1 #sel-week-goal:1", "binds Pro's second profile and weekly goal"],
    "bindRetention #rem-time-2": ["VTBilling:1 openPricing:1", "a free visitor setting a second reminder time is shown the plans"],
    "bindProStudio #btn-profile-add": ["VTBilling:1 openPricing:1", "a second singer's profile is Pro's"],
    "bindProStudio #sel-week-goal": ["VTBilling:1 openPricing:1", "the weekly goal picker is Pro's"],
    valueMomentFor: ["getEntitlement:1 trialDaysLeft:2", "which note follows a rated take"],
    showValueBanner: ["dataset.momentId:1 trialDaysLeft:1", "the trial's days left on that note, and which note it is"],
    showValueMoment: ["VTBilling:1", "the note about the trial after a long hold, a saved or rated take, or opening the history"],
    putAwayValueBanner: ["#btn-profile-add:1 #btn-value-pro:1", "puts that note away, and hands its focus to the board's next control"],
    relabelValueBanner: ["VTBilling:1 dataset.momentId:1 trialDaysLeft:1", "the same note, redrawn in the new language"],
    hideValueBanner: ["dataset.momentId:1", "puts the note away, remembering which one was dismissed"],
    renderPricingModal: ["VTBilling:1 getEntitlement:2", "the pricing dialog itself"],
    "renderPricingModal btn": ["dataset.plan:1 openAccount:1", "a plan button pressed: the plan it names, and the account first for someone not signed in"],
    pricingStatusLine: ["trialDaysLeft:1", "the pricing dialog's status line"],
    openPricing: ["#pricing-modal:open:1 openPricing:1", "the pricing dialog's own opener"],
    openAccount: ["openAccount:1", "the account panel's own opener"],
    bindAuth: ["#btn-account-pricing:1 openAccount:1", "the header's account button, and the account panel's button to the plans"],
    "bindAuth #btn-account-pricing": ["openPricing:1", "the account panel's button to the plans"],
    "bindAuth #admin-force-pro": ["VTBilling:1", "the owner's admin button that turns Pro on"],
    "bindAuth #admin-clear-billing": ["VTBilling:1", "the owner's admin button that clears the plan"],
    recheckPayment: ["VTBilling:1", "'I have paid': asks the worker again"],
    startAccountTrial: ["openAccount:1", "the account's trial: someone not signed in is sent to the panel"],
    startLocalTrial: ["VTBilling:3 trialDaysLeft:1", "the browser's own trial, for a deploy with no sign-in"],
    openBillingPortal: ["VTBilling:2", "the customer portal, from the pricing dialog"],
    exportProgress: ["VTBilling:2 openPricing:1", "the progress export is Pro's: a free visitor is shown the plans"],
    bindBillingEvents: ["VTBilling:3", "redraws when the plan changes, and the return from a checkout"],
    bindBilling: ["#btn-export-progress:1 #btn-pricing:1 #btn-value-pro:1 #value-banner-cta:1 VTBilling:1 openPricing:2", "binds the header's Pro button, the progress board's and the trial note's, and the progress export, Pro's"],
    "bindBilling #value-banner-cta": ["openPricing:1", "the trial note's button to the plans"],
    "bindBilling #btn-demo-pro": ["VTBilling:2", "the demo build's button that turns Pro on"],
    "(top)": ["openAccount:2 openPricing:2", "the page's exports of the two openers, for the other scripts"]
  },
  "js/auth.js": {
    login: ["VTBilling:3", "the QA unlock of a test account"]
  },
  "js/billing.js": {
    verificationConfigured: ["VTLicense:1", "the plan itself: whether a licence can be checked here"],
    licenseClaims: ["VTLicense:1", "the plan itself: the signed licence's claims"],
    getLicenseStatus: ["VTLicense:1", "the plan itself: whether the licence is being checked"],
    clearEntitlement: ["VTLicense:1", "the plan itself: clears it"],
    rememberCheckoutIntent: ["vt_billing_intent:1", "remembers which plan a checkout was started for"],
    claimLicense: ["VTLicense:1", "the plan itself: claims the licence a checkout paid for"],
    returnedPlanAndProvider: ["vt_billing_intent:2", "the plan a returning checkout was for"],
    refreshLicense: ["VTLicense:1", "the plan itself: asks the worker for the licence again"],
    trialStartedAt: ["trialStartedAt:1", "the plan itself: when the trial started"],
    ensureTrial: ["trialStartedAt:1", "the plan itself: the trial's start, once"],
    canStartTrial: ["trialStartedAt:1", "the plan itself: whether this browser still has its trial"],
    startTrial: ["trialActive:1 trialStartedAt:1", "the plan itself: starting the trial"],
    trialActive: ["trialActive:1", "the plan itself"],
    trialDaysLeft: ["trialActive:1 trialDaysLeft:1", "the plan itself"],
    getEntitlement: ["getEntitlement:1 trialActive:1", "the plan itself"],
    isPro: ["getEntitlement:1 isPro:1", "the plan itself"],
    emit: ["getEntitlement:1", "the plan itself: tells its listeners it changed"],
    can: ["isPro:1", "the plan itself: Pro's feature flags"],
    exportProgressJson: ["getEntitlement:1", "the progress export, Pro's"],
    "(top)": [
      "VTBilling:2 VTLicense:1 getEntitlement:2 isPro:2 trialActive:2 trialDaysLeft:2 trialStartedAt:2 vt_billing_trial_started_v1:1 vt_billing_v1:1",
      "the plan's storage keys and its exports"
    ]
  },
  "js/license.js": {
    "(top)": ["VTLicense:2 vt_license_v1:1", "the licence's storage key and its export"]
  },
  "js/practice-days.js": {
    isPro: ["VTBilling:2 isPro:2", "Pro's extra rest days for the streak"],
    restCap: ["isPro:1", "how many rest days the streak can bank"]
  },
  "js/reminders.js": {
    freezeAllowance: ["isPro:2", "the old name for that rest-day allowance"]
  },
  "js/value-pulse.js": {
    suggestUpgradeMoment: ["trialDaysLeft:6", "the trial's days left on the progress board"]
  }
};

/** The functions that open the sign-in: the account panel's opener, Google's button and its sign-in, and an emailed code. */
const SIGN_IN_NAMES = /^(openAccount|signInWithGoogle|startEmailSignIn|renderGoogleButton)$/;
/**
 * What a click opens, for finding the buttons that open the sale or the sign-in: the opener or its dialog shown.
 * Google's button is drawn inside a panel already open (the owner's admin window draws it on any failed request,
 * and the account panel after a sign-out), so drawing it is not a door of its own; its uses are written down below.
 */
const OPENS_SALE = /^(openPricing|#pricing-modal:open)$/;
const OPENS_SIGN_IN = /^(openAccount|signInWithGoogle|startEmailSignIn|#account-modal:open)$/;
/** What opens the sign-in: one of those, the account panel shown by its own id, or an element bound to open it (not the keys it keeps). */
const opensSignIn = (use) => SIGN_IN_NAMES.test(use) || use === "#account-modal:open" || ACCOUNT_HANDLES.has(use);

/**
 * Every function that asks whether the visitor is signed in, or opens the sign-in, file by file, with what it uses
 * and why. A wall in front of practice can be the account as well as the plans, and it need not open anything or
 * be on the way to practice: a page-wide capture listener that swallows a guest's rating, on the account's word,
 * calls nothing in practice. So every reader is written down, as the plan's are, and a new one, anywhere, fails
 * here until somebody writes down why it cannot stand in front of practice.
 */
export const ACCOUNT_USES = {
  "js/account.js": {
    adopt: ["VTLicense:4", "the account itself: keeps the licence the worker signed for it"],
    forget: ["VTLicense:1", "the account itself: signing out clears the licence"],
    startEmailSignIn: ["startEmailSignIn:1", "the account itself: the emailed code"],
    renderGoogleButton: ["renderGoogleButton:1", "the account itself: Google's button"],
    "renderGoogleButton.callback": ["signInWithGoogle:1", "what Google's button does when pressed"],
    signInWithGoogle: ["signInWithGoogle:1", "the account itself"],
    refresh: ["VTLicense:1", "the account itself: asks the worker for the account and its licence again"],
    getState: ["VTLicense:1 signedIn:1", "the account itself: its state"],
    getSessionToken: ["getSessionToken:1", "the account itself: its session"],
    init: ["VTLicense:1", "the account itself: hands the licence its way to refresh"],
    followStoredSession: ["VTLicense:1", "the account itself: follows the session another tab stored, as init reads it (QA-76)"],
    "(top)": ["VTAccount:1 getSessionToken:2 renderGoogleButton:2 signInWithGoogle:2 startEmailSignIn:2 vt_account_plan_v1:1 vt_account_session_v1:1", "the account's storage keys and its exports"]
  },
  "js/admin-layouts.js": {
    load: ["VTAccount:2", "the owner's admin window: the layout counts, asked as the owner"],
    loadGlance: ["VTAccount:3", "the same window's summary"]
  },
  "js/admin.js": {
    api: ["VTAccount:1", "the owner's admin window: its requests, as the owner"],
    failureText: ["VTAccount:1", "the same window's error line"],
    drawSignIn: ["VTAccount:1 renderGoogleButton:1", "the owner's admin window asks its owner to sign in"],
    boot: ["VTAccount:1 signedIn:2", "the owner's admin window starts: is the owner signed in"],
    "bindSession #admin-signout": ["VTAccount:1", "the admin window's sign-out"],
    "bindSession #gate-retry": ["VTAccount:1", "the admin window's 'try again' at its sign-in"]
  },
  "js/app.js": {
    "bindPageLifecycle window": ["VTSync:1", "when the page hides, after the take is kept here, a signed-in visitor's copy is sent; a guest's is nothing"],
    "bindPageLifecycle document": ["VTSync:1", "the same, when the tab is hidden rather than closed"],
    headerPlanState: ["VTAccount:1 signedIn:1", "the header's plan label (Pro, trial, or signed in), the board's tag, and Start's trial funnel"],
    trialSpent: ["VTAccount:1 signedIn:1", "the pricing dialog's line on a trial already used, across an account's browsers"],
    updateBillingChrome: ["#btn-start-trial:1", "draws the pricing dialog's trial button"],
    paintPricingTrial: ["VTAccount:1 signedIn:1", "the pricing dialog's trial button: offered, and the length it names"],
    catchUpAccount: ["VTAccount:2 VTSync:1 signedIn:1", "the tab shown again, signed in: the account asked again and a sync at most once a minute"],
    "renderPricingModal btn": ["openAccount:1", "a plan button pressed by someone not signed in opens the account first"],
    openPricing: ["VTAccount:2", "the pricing dialog asks the account for its sign-in methods as it opens"],
    accountPanelState: ["VTAccount:1 signedIn:1", "what the account panel showed, for its own event"],
    noteTrialArmExposure: ["VTAccount:1 signedIn:1", "the trial test's arm, counted for a signed-in account once"],
    accountSyncLine: ["VTSync:1", "the account panel's line on when progress last synced"],
    accountSignIn: ["VTAccount:1", "which sign-in methods the account panel may draw"],
    accountInitialFocus: ["signedIn:2", "where the account panel puts the focus when it opens"],
    refreshAccountUI: ["#btn-account:1 VTAccount:1 VTAuth:1 signedIn:5", "redraws the account panel and the header's account button"],
    paintAccountLedes: ["signedIn:5", "the panel's lede, Start's step 3 and Historial's lede, worded for signed in or out"],
    paintAccountDoor: ["door-avatar:1 door-name:1 is-signed-in:1 signedIn:2", "the header's account button: a name and its mark when signed in"],
    accountDoorName: ["signedIn:1", "the name that button shows"],
    paintSignInControls: ["#account-email-form:1", "the account panel's email form, shown when the worker offers it"],
    paintAccountOffer: ["signedIn:2", "what an account is for, above the button that makes one"],
    paintAccountWho: ["signedIn:1", "who is signed in, inside the panel"],
    paintAccountPlanAndSync: ["signedIn:2", "the signed-in account's plan line and last sync"],
    paintOwnerQuestion: ["VTSync:1 signedIn:1", "the panel's question when this browser holds another account's practice"],
    paintAccountTrial: ["signedIn:1", "the panel's trial button, for an account that never used it"],
    paintAccountTools: ["signedIn:2", "the panel's redeem form and sync button, and the owner's gifting tools"],
    mountGoogleButton: ["VTAccount:3 renderGoogleButton:1 signedIn:1", "Google's button inside the account panel"],
    askWhoIsSignedIn: ["VTAccount:2 signedIn:1", "the panel opened: asks the worker who is signed in if it never answered"],
    openAccount: ["#account-modal:open:1 VTAccount:2 VTAuth:1 openAccount:1 signedIn:3", "the account panel's own opener"],
    bindAuth: ["#btn-account:1 VTAuth:1 openAccount:1", "the header's account button, and the owner's admin buttons"],
    "bindAuth #btn-logout": ["VTAccount:1 VTAuth:1 VTSync:1", "the panel's sign-out"],
    "bindAuth #account-retry": ["VTAccount:1", "the panel's 'try again' when Google's script did not load"],
    "bindAuth #login-form": ["VTAuth:2", "the older sign-in's form, for the owner and testers"],
    "bindAuth #admin-force-pro": ["VTAuth:1", "the owner's admin button that turns Pro on"],
    "bindAuth #admin-clear-billing": ["VTAuth:1", "the owner's admin button that clears the plan"],
    "bindAuth #admin-clear-progress": ["VTAuth:1", "the owner's admin button that clears the progress"],
    bindAccount: ["#account-code-form:1 #account-code-resend:1 #account-email-form:1", "binds the account panel's email and code steps"],
    showCodeStep: ["#account-code-form:1 #account-code-resend:1 #account-email-form:1", "the panel's step from the email to the code"],
    showEmailStep: ["#account-code-form:1 #account-code-resend:1 #account-email-form:1", "the panel's step back to the email"],
    "bindAccount #account-email-form": ["VTAccount:1 startEmailSignIn:1", "the account panel's email form"],
    "bindAccount #account-code-form": ["#account-code-form:1 #account-code-resend:1 VTAccount:1", "the code typed in: the sign-in's last step, inside the panel"],
    "bindAccount #account-code-resend": ["#account-code-form:1 VTAccount:1 startEmailSignIn:1", "the account panel's 'send the code again'"],
    "bindAccount #btn-owner-add": ["VTSync:1", "the panel's answer: add this browser's practice to the account"],
    "bindAccount #btn-owner-mine": ["VTSync:1", "the panel's answer: keep it as this browser's own"],
    "bindAccount #btn-account-trial": ["VTAccount:1", "the panel's trial button"],
    "bindAccount #account-redeem-form": ["VTAccount:1", "the panel's form for a gift code"],
    "bindAccount #btn-account-sync": ["VTSync:1", "the panel's 'sync now'"],
    "bindAccount #gift-grant-form": ["VTAccount:1", "the owner's gifting tool in the panel"],
    "bindAccount #gift-code-form": ["VTAccount:1", "the owner's gift-code tool in the panel"],
    renderGiftCodes: ["VTAccount:1 VTAuth:1", "the owner's list of gift codes"],
    renderFunnel: ["VTAccount:1 VTAuth:1", "the owner's funnel counts"],
    renderAbResults: ["VTAccount:2 VTAuth:1", "the owner's A/B results"],
    watchAccountChanges: ["VTAccount:1 VTSync:2", "redraws the panel, the header and the home card when the account or its record changes"],
    startTrialFromPricing: ["VTAccount:2", "the pricing dialog's trial button: an account's trial, or the browser's own"],
    startAccountTrial: ["VTAccount:1 openAccount:1 signedIn:1", "the account's trial: someone not signed in is sent to the panel"],
    linkReturnedCheckout: ["VTAccount:1", "a checkout paid while signed in is tied to the account"],
    bindBilling: ["#btn-start-trial:1", "binds the pricing dialog's trial button"],
    "(top)": ["#btn-start-trial:1 openAccount:2", "the trial buttons each dialog holds, and the page's export of the opener"]
  },
  "js/auth.js": {
    "(top)": ["VTAuth:1 vt_auth_session_v1:1", "the older sign-in itself, for the owner and testers: its key and its export"]
  },
  "js/billing.js": {
    accountState: ["VTAccount:1", "a purchase tied to an account: who is buying"],
    accountRails: ["VTAccount:1", "which ways to pay the account's worker offers"],
    verificationConfigured: ["VTLicense:1", "the plan itself: whether a licence can be checked here"],
    licenseClaims: ["VTLicense:1", "the plan itself: the signed licence's claims"],
    getLicenseStatus: ["VTLicense:1", "the plan itself: whether the licence is being checked"],
    clearEntitlement: ["VTLicense:1", "the plan itself: clears it"],
    checkoutRefusal: ["signedIn:1", "why a checkout cannot start: it needs an account"],
    claimLicense: ["VTLicense:1", "the plan itself: claims the licence a checkout paid for"],
    refreshLicense: ["VTLicense:1", "the plan itself: asks the worker for the licence again"],
    "(top)": ["VTLicense:1", "the plan's exports"]
  },
  "js/license.js": {
    "(top)": ["VTLicense:2", "the signed licence itself: its export"]
  },
  "js/reports.js": {
    environment: ["VTAccount:3 signedIn:2", "a bug report says whether its reporter was signed in"],
    failureText: ["VTAccount:3", "a bug report's error line"],
    signedInEmail: ["VTAccount:3", "a signed-in reporter's address, to answer them"],
    "mineSection button": ["VTAccount:4 signedIn:1", "a signed-in reporter's own list of reports"],
    send: ["VTAccount:4", "sends a report, with the reporter's session when signed in"]
  },
  "js/sync.js": {
    isAvailable: ["VTAccount:1 getSessionToken:1", "the progress sync, which runs only for a signed-in visitor"],
    sessionToken: ["VTAccount:1 getSessionToken:1", "the same: its session"],
    accountId: ["VTAccount:1 getState().account:1", "the same: whose progress it is"],
    noteOwner: ["VTAccount:1", "the same: which account this browser's practice belongs to"],
    ownerStop: ["VTAccount:1", "the same: stops for another account's practice"],
    readAccount: ["VTAccount:1", "the same: the account's copy"],
    runCycle: ["VTAccount:1", "the same: one sync"],
    flush: ["VTAccount:1", "the same, on the way out of the page"],
    "(top)": ["VTAccount:3 VTSync:1 signedIn:2 vt_sync_aside_v1:1 vt_sync_handover_v1:1 vt_sync_owner_v1:1 vt_sync_rev_v1:1", "the sync's storage keys and its export"]
  },
  "js/tour.js": {
    homeSteps: ["header-door:1", "the tour points at the account button; it does not press it"]
  },
  "js/voice-path.js": {
    whoPractises: ["VTAccount:1 getSessionToken:1", "Tu camino: a one-way fingerprint of the sign-in keys this tab's takes, so another sign-in's warm-up is not this one's"],
    handoverPending: ["VTSync:1", "Tu camino: writes nothing while sync asks whose this browser's practice is, so none of it is credited to the earlier owner"],
    "(top)": ["VTAccount:1 VTSync:1", "Tu camino redraws when the sign-in or that question changes"]
  }
};

/** Every event and the props it may carry. `x_*` is app_open's re-asserted arms. */
export const TRACKING_PLAN = {
  account_panel_open: ["state"],
  ad_click: ["id", "mode", "slot"],
  ad_dismiss: ["id", "slot"],
  ad_impression: ["id", "mode", "slot"],
  ad_suppressed_practice: ["slot"],
  ad_suppressed_pro: ["slot"],
  ad_unfilled: ["mode", "slot", "status"],
  app_open: ["day", "loop", "...reassertedArms"],
  audio_compare: [],
  basics_complete: ["comeback", "first", "practiceDays", "practiced", "steps", "surprise", "tier", "track"],
  basics_incomplete: ["practiced", "steps", "tier", "track"],
  basics_start: ["sec", "steps", "tier", "track"],
  comeback: ["daysAway", "restBank"],
  experiment_expose: ["enabled", "experiment", "forced", "variant"],
  experiment_forced_view: ["enabled", "experiment", "variant"],
  first_track_pick: ["track"],
  first_win: ["exerciseId"],
  first_win_micro: [],
  layout_session: ["n", "src", "ver"],
  layout_switch: ["from", "sec", "to", "via"],
  layout_time: ["sec", "ver"],
  loop_cards_open: ["n"],
  loop_goal_set: ["goal"],
  loop_remind_click: [],
  loop_tier_pick: ["tier"],
  mic_blocked: ["canRun", "exerciseId"],
  mic_primer_accept: [],
  mic_primer_decline: [],
  mic_primer_dismiss: [],
  mic_primer_show: [],
  milestone: ["n"],
  path_hide: ["off"],
  path_new: ["id"],
  path_open: ["from"],
  path_share: ["how"],
  practice_day: ["n", "source", "structured"],
  practice_recorded: ["durationSec", "exerciseId", "firstOfDay", "micro", "source", "structured"],
  practice_start: ["exerciseId", "micro", "mode"],
  pro_paid_first: [],
  remind_due_shown: [],
  reminder_enable: ["enabled"],
  rest_used: ["days"],
  session_save: ["durationSec", "exerciseId", "feel", "firstWin", "score"],
  set_complete: ["practiced", "set", "steps", "track"],
  set_start: ["sec", "set", "steps", "track"],
  sets_open: ["n", "track"],
  signin_fail: ["method", "reason"],
  signin_start: ["method"],
  signin_success: ["method"],
  step_done_choice: ["choice", "exerciseId"],
  step_done_shown: ["exerciseId", "mic"],
  surprise_shown: ["id", "kind", "reason"],
  tour_complete: ["lastStepId", "n", "pack", "total"],
  tour_dismiss: ["lastStepId", "n", "pack", "total"],
  tour_guide_open: ["pack", "stepId"],
  tour_invite_accept: [],
  tour_invite_dismiss: [],
  tour_skip: ["lastStepId", "n", "pack", "total"],
  tour_start: ["authored", "fromButton", "pack", "steps", "variant"],
  tour_step: ["n", "pack", "stepId", "total"],
  trial_click: ["where"],
  trial_cta_view: ["where"],
  trial_first_practice: ["kind"],
  trial_result: ["kind", "outcome", "where"],
  trial_started: ["kind", "where"]
};

/**
 * The functions that pass an event on without naming it: each module's own track(), and the funnel's. And the one
 * relay handed on as a value: js/analytics.js's own track, the sink every module calls through VTAnalytics.
 */
export const TRACK_RELAYS = [
  "js/ads.js › track",
  "js/analytics.js › track (handed on)",
  "js/app.js › trackFunnel",
  "js/daily-loop.js › track",
  "js/session-sets.js › track",
  "js/site-version.js › track",
  "js/tour.js › track",
  "js/voice-path.js › track"
];

const TRACKERS = new Set(["track", "trackFunnel"]);

/** What a function reads of the plan and the account, as "VTAuth:1 VTBilling:2" ("" for nothing). */
const bagsText = (fn) =>
  Object.entries({ ...fn.billing, ...fn.account })
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, n]) => `${k}:${n}`)
    .join(" ");

/** What a difference between two lists is, line by line, so a failure says what to write down. */
function diffCounts(found, expected) {
  const lines = [];
  for (const key of new Set([...Object.keys(found), ...Object.keys(expected)])) {
    if (found[key] !== expected[key]) lines.push(`${key}: found ${found[key] ?? 0}, written down ${expected[key] ?? 0}`);
  }
  return lines;
}

const flat = (bag) => Object.fromEntries(Object.entries(bag).flatMap(([file, rows]) => Object.entries(rows).map(([k, v]) => [`${file} :: ${k}`, v])));

/**
 * The events a script raises: [where, name, props keys] for each call, and the relays that pass one on. A name
 * made from a template (`tour_${reason}`) is each name the template can make: its one part must be a parameter of
 * the function it is in, that function must give it no other value, must be called only by its bare name in this
 * file (never handed on, bound or exported, where a call from elsewhere could pass anything), and every call of it
 * must pass a literal, a choice of two, or a parameter of its own that resolves the same way (a call that leaves
 * it out gives the parameter's default, or nothing). The functions and their calls are told apart by scope, not
 * by spelling, so another `end` or `reason` elsewhere in the file changes nothing. One that cannot be resolved is
 * listed, so no name is guessed by its prefix. A relay must pass on its own two parameters as they came
 * (`props || {}` at most), and name its props nowhere else (an alias, a helper or Object.assign could add to
 * them); one that does is listed as changing what it passes on. A relay handed on as a value (`report =
 * trackFunnel`) is listed too: what calls it then is not read here.
 */
export function eventsIn(source, file) {
  const found = { calls: [], relays: [], unresolved: [] };
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "script", loc: true, range: true });
  const scope = analyze(ast, { ecmaVersion: 2022, sourceType: "script" });
  const bound = new Map(scope.scopes.flatMap((sc) => sc.references.map((r) => [r.identifier, r.resolved])));
  const ctx = { callsTo: new Map(), escaping: new Set(), frames: new Map(), parents: new Map(), key: (id) => bound.get(id) ?? id.name };
  const templates = [];
  const visit = (node, owner, frame, parent) => {
    if (!node || typeof node.type !== "string") return;
    const here = /Function/.test(node.type) && node.id?.name ? node.id.name : owner;
    const own = frameOf(node, parent, scope);
    if (own?.name) ctx.frames.set(own.key, own);
    const inner = own || frame;
    if (node.type === "Identifier") noteName(node, parent, ctx);
    if (node.type === "CallExpression") noteCall(node, ctx, { owner: here, file, found, frame: inner }, templates);
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) v.forEach((c) => visit(c, here, inner, node));
      else if (v && typeof v.type === "string") visit(v, here, inner, node);
    }
  };
  visit(ast, "(top)", { name: "", key: "", params: [], node: null }, null);
  found.relays.push(...handedRelays(scope, ctx.parents, file));
  for (const { ev, keys, frame, where } of templates) {
    const [head, tail] = ev.quasis.map((q) => q.value.cooked);
    const part = ev.expressions.length === 1 ? ev.expressions[0] : null;
    const values = part ? valuesOf(part, frame, ctx, new Set()) : null;
    if (!values) found.unresolved.push(`${where} \`${ev.quasis.map((q) => q.value.raw).join("${}")}\``);
    else for (const v of values) found.calls.push([where, head + v + tail, keys]);
  }
  return found;
}

/** A name: kept with its parent (to tell a relay called from one handed on), and as escaping when it is used as a value. */
function noteName(node, parent, ctx) {
  ctx.parents.set(node, parent);
  if (escapesAt(node, parent)) ctx.escaping.add(ctx.key(node));
}

/** A call: kept by the function its bare name resolves to, for the templates' parameters, and read for an event it raises. */
function noteCall(node, ctx, where, templates) {
  const callee = node.callee.type === "Identifier" ? ctx.key(node.callee) : "";
  if (callee) ctx.callsTo.set(callee, [...(ctx.callsTo.get(callee) || []), { args: node.arguments, frame: where.frame }]);
  eventCall(node, where, (ev, keys) => templates.push({ ev, keys, frame: where.frame, where: `${where.file}:${node.loc.start.line}` }));
}

const paramName = (p) => (p.type === "AssignmentPattern" ? p.left.name : p.name) || "";

/**
 * A function's name (its own, or the variable it is kept in), the variable that name declares (its key: calls are
 * kept by the variable they resolve to), its parameters and its node, or null for any other node.
 */
function frameOf(node, parent, scope) {
  if (!/Function/.test(node.type)) return null;
  const name = node.id?.name || (parent?.type === "VariableDeclarator" ? parent.id.name : "");
  const decl = node.type === "FunctionDeclaration" ? node : parent?.type === "VariableDeclarator" ? parent : null;
  const key = (decl && scope.getDeclaredVariables(decl).find((v) => v.name === name)) || name;
  return { name, key, params: node.params.map(paramName), node };
}

/** Each node under `node`, with its parent, until `fn` returns true (then that node's children are skipped). */
function eachNode(node, fn, parent = null) {
  if (!node || typeof node.type !== "string" || fn(node, parent)) return;
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach((c) => eachNode(c, fn, node));
    else if (v && typeof v.type === "string") eachNode(v, fn, node);
  }
}

/**
 * A relay handed on as a value: a default parameter (`report = trackFunnel`), an argument, a property, `.bind`.
 * What calls it then, with what, is not read here, so it is listed. By scope: a parameter that happens to be called
 * track (daily-loop's `todayBasics(track)`) is not the relay.
 */
function handedRelays(scope, parents, file) {
  const out = new Set();
  const isFn = (d) => d.type === "FunctionName" || (d.type === "Variable" && /Function/.test(d.node.init?.type || ""));
  for (const v of scope.scopes.flatMap((sc) => sc.variables)) {
    if (!TRACKERS.has(v.name) || !v.defs.some(isFn)) continue;
    for (const r of v.references) {
      const p = parents.get(r.identifier);
      if (!(p?.type === "CallExpression" && p.callee === r.identifier)) out.add(`${file} › ${v.name} (handed on)`);
    }
  }
  return [...out];
}

/** Whether an identifier is used as a value here, where it can be handed on: anything but a call by it, its own declaration, or a property's name. */
function escapesAt(node, p) {
  if (!p) return true;
  if (p.type === "CallExpression" || p.type === "NewExpression") return p.callee !== node;
  if (/Function/.test(p.type)) return p.body === node;
  if (p.type === "VariableDeclarator") return p.init === node;
  if (p.type === "MemberExpression") return p.object === node || p.computed;
  if (p.type === "Property" || p.type === "MethodDefinition" || p.type === "PropertyDefinition") return p.value === node || p.computed;
  return true;
}

/** The names a pattern binds: `a`, `{ a, b: c }`, `[a, ...d]`, `a = 1`. */
function patternNames(p) {
  if (!p) return [];
  if (p.type === "Identifier") return [p.name];
  if (p.type === "AssignmentPattern") return patternNames(p.left);
  if (p.type === "RestElement") return patternNames(p.argument);
  if (p.type === "ArrayPattern") return p.elements.flatMap(patternNames);
  if (p.type === "ObjectPattern") return p.properties.flatMap((q) => patternNames(q.value ?? q.argument));
  return [];
}

/** The variable an assignment's target writes to or into: `x` for `x = 1`, `x.a = 1` and `x[k] = 1`. */
const rootOf = (n) => (n?.type === "MemberExpression" ? rootOf(n.object) : n?.type === "Identifier" ? n.name : "");

/** What one node does to `name`: gives it a new value, writes into it, or declares another of the same name. */
function rewritesAt(n, name) {
  if (n.type === "AssignmentExpression") return rootOf(n.left) === name || patternNames(n.left).includes(name);
  if (n.type === "UpdateExpression") return rootOf(n.argument) === name;
  if (n.type === "VariableDeclarator") return patternNames(n.id).includes(name);
  if (n.type === "CallExpression" && n.callee.type === "MemberExpression") return rootOf(n.callee.object) === "Object" && rootOf(n.arguments[0]) === name;
  return false;
}

/** Whether a function's body changes `name` anywhere: `reason = "skip_first"`, `props.view = ...`, `Object.assign(props, ...)`. */
function rewrites(fn, name) {
  let hit = false;
  // A function inside it with a parameter of that name has another `name` of its own (a `.catch((reason) => ...)`).
  const shadows = (n) => n !== fn && /Function/.test(n.type) && n.params.some((q) => patternNames(q).includes(name));
  eachNode(fn, (n) => {
    if (hit || shadows(n)) return true;
    hit = rewritesAt(n, name);
    return hit;
  });
  return hit;
}

/** How many times a function's body names `name` as a value, not as a property's name: a relay's own send is one. */
function timesNamed(fn, name) {
  let n = 0;
  eachNode(fn?.body, (x, p) => {
    const key = (p?.type === "MemberExpression" && p.property === x && !p.computed) || (p?.type === "Property" && p.key === x && !p.computed && !p.shorthand);
    if (x.type === "Identifier" && x.name === name && !key) n++;
  });
  return n;
}

/**
 * The strings an argument can be: a literal, either side of a choice, or a parameter, through every call of its
 * function. `false` or `null` make no name (the template's function returns first on them: tour.js's end(false)
 * closes the tour without recording it). null when it cannot be told.
 */
function valuesOf(arg, frame, ctx, seen) {
  if (arg?.type === "Literal") return literalValues(arg.value);
  if (arg?.type === "ConditionalExpression") {
    const [a, b] = [valuesOf(arg.consequent, frame, ctx, seen), valuesOf(arg.alternate, frame, ctx, seen)];
    return a && b ? [...a, ...b] : null;
  }
  const i = arg?.type === "Identifier" ? frame.params.indexOf(arg.name) : -1;
  if (i < 0 || !frame.name || seen.has(frame.key) || rewrites(frame.node, arg.name)) return null;
  return paramValues(frame.key, i, ctx, seen);
}

const literalValues = (v) => (typeof v === "string" ? [v] : v === false || v === null ? [] : null);

/** What the i-th parameter of the function `key` can be, through each of its calls; null if one cannot be told, none is seen, or the function escapes. */
function paramValues(key, i, ctx, seen) {
  const calls = ctx.callsTo.get(key) || [];
  if (!calls.length || ctx.escaping.has(key)) return null;
  const out = [];
  for (const call of calls) {
    const [arg, frame] = givenAt(call, ctx.frames.get(key), i);
    const v = valuesOf(arg, frame, ctx, new Set([...seen, key]));
    if (!v) return null;
    out.push(...v);
  }
  return [...new Set(out)];
}

/** What a call gives the i-th parameter: its argument, else the parameter's own default, else nothing (as null: no name, like `end(false)`). */
function givenAt(call, callee, i) {
  if (call.args[i]) return [call.args[i], call.frame];
  const p = callee?.node?.params[i];
  return p?.type === "AssignmentPattern" ? [p.right, callee] : [{ type: "Literal", value: null }, call.frame];
}

/**
 * Whether a relay passes on its own first two parameters as they came: `track(name, props)` or `track(name, props
 * || {})`, with its props named nowhere else in it (`const p = props || {}; p.view = ...`, `withView(props)` and
 * `Object.assign(props || {}, ...)` each add to them unseen).
 */
function passesOn(ev, props, frame) {
  const own = (node, i) => node?.type === "Identifier" && frame.params[i] === node.name && !rewrites(frame.node, node.name) && (i === 0 || timesNamed(frame.node, node.name) === 1);
  const emptyOr = props?.type === "LogicalExpression" && props.operator === "||" && props.right.type === "ObjectExpression" && !props.right.properties.length;
  return own(ev, 0) && (!props || own(emptyOr ? props.left : props, 1));
}

function eventCall(node, { owner, file, found, frame }, template) {
  const c = node.callee;
  const name = c.type === "MemberExpression" ? c.property.name : c.type === "Identifier" ? c.name : "";
  if (!TRACKERS.has(name)) return;
  const [ev, props] = node.arguments;
  const named = ev?.type === "Literal" || ev?.type === "TemplateLiteral";
  if (!named || (props && props.type !== "ObjectExpression")) {
    found.relays.push(`${file} › ${owner}${passesOn(ev, props, frame) ? "" : " (changes what it passes on)"}`);
    return;
  }
  const keys = (props?.properties || []).map((p) => (p.type === "SpreadElement" ? "..." + (p.argument.callee?.name || "?") : (p.key.name ?? p.key.value)));
  if (ev.type === "TemplateLiteral") template(ev, keys);
  else found.calls.push([`${file}:${node.loc.start.line}`, ev.value, keys]);
}

test("every way off the device is written down, function by function, with why it is there", () => {
  const found = flat(acrossScripts(".", sinksIn));
  const expected = flat(Object.fromEntries(Object.entries(EGRESS).map(([f, rows]) => [f, Object.fromEntries(Object.entries(rows).map(([k, [n]]) => [k, n]))])));
  assert.deepEqual(
    diffCounts(found, expected),
    [],
    "a way off the device was added, moved or removed. Write it down in EGRESS with why it is there, and why it cannot carry the voice"
  );
});

test("only the files that make a take hear the voice or read a take", () => {
  const found = Object.fromEntries(Object.entries(acrossScripts(".", voiceSourcesIn)).map(([f, names]) => [f, Object.keys(names).sort()]));
  assert.deepEqual(found, VOICE_FILES);
});

/**
 * The ways off the device a script's hearers lead to: "function › kind, reached by a > b". A function made in the
 * same function as a hearer shares what it keeps (a take kept by Stop's handler, sent by the page's pagehide
 * handler), so the functions a hearer is made in hear too, up to the file's top: a take kept at the file's own
 * top level, or in a global, and sent from a function that never hears is a value handed through a variable,
 * which this does not follow.
 */
function leaksIn(source) {
  const fns = functionsOf(source);
  const hearers = new Set(Object.keys(fns).filter((n) => Object.keys(fns[n].voice).length));
  // A Set visits what is added while it is walked, once each: every function a hearer is made in, up to the top.
  for (const n of hearers) for (const o of fns[n].outers) hearers.add(o);
  const reach = reachable(fns, [...hearers]);
  return Object.keys(sinksIn(source))
    .filter((k) => NETWORK.test(k) && reach.has(k.split(" › ")[0]))
    .map((k) => `${k}, reached by ${reach.get(k.split(" › ")[0]).join(" > ")}`);
}

test("in those files, nothing that hears the voice leads to anything that sends", () => {
  const leaks = [];
  for (const [file, source] of Object.entries(shippedScripts("."))) {
    if (VOICE_FILES[file]) leaks.push(...leaksIn(source).map((l) => `${file}: ${l}`));
  }
  assert.deepEqual(leaks, []);
});

test("Start, Stop, the routines, the rating, Next and '+30 s' never reach the sale, and read the plan only to draw", () => {
  const source = readFileSync("js/app.js", "utf8");
  const fns = functionsOf(source);
  assert.deepEqual(
    PRACTICE_ROOTS.filter((r) => !fns[r]),
    [],
    "control: every root is a function of js/app.js (a rename would empty the path)"
  );
  assert.ok(reachable(fns, PRACTICE_ROOTS).size > 150, "control: the path covers the practice code, not a stub of it");
  const path = practicePath(source, PRACTICE_ROOTS);
  for (const [name, { uses, via }] of Object.entries(path)) {
    assert.ok(!/openPricing|openAccount|btn-pricing|:open:/.test(uses), `${name} opens the sale on the way to practice: ${via}`);
  }
  const found = Object.fromEntries(Object.entries(path).map(([n, { uses }]) => [n, uses]));
  const expected = Object.fromEntries(Object.entries(PLAN_READERS).map(([n, [uses]]) => [n, uses]));
  assert.deepEqual(
    diffCounts(found, expected),
    [],
    `the plan is read on the way to practice where it was not: ${JSON.stringify(Object.fromEntries(Object.entries(path).filter(([n]) => found[n] !== expected[n])), null, 1)}`
  );
});

/** A function's code without its layout and comments: what it does, not how it is spelt on the page. */
const codeHash = (nodes) =>
  createHash("sha256")
    .update(JSON.stringify(nodes, (k, v) => (["start", "end", "loc", "range", "raw"].includes(k) ? undefined : v)))
    .digest("hex")
    .slice(0, 12);

/** Whether a call's value is thrown away: a statement of its own, or an arrow's whole body (`setTimeout(() => f(), 9)`). */
const DROPS = {
  ExpressionStatement: () => true,
  ArrowFunctionExpression: (p, x) => p.body === x,
  UnaryExpression: (p) => p.operator === "void"
};

/** Whether a function's body calls one of `fns` (not itself) and keeps, tests or returns what it answers. */
function usesAnswer(body, fns, self) {
  let hit = false;
  const dropped = new Set();
  eachNode(body, (x, p) => {
    if (p && (DROPS[p.type]?.(p, x) || (dropped.has(p) && (p.type === "AwaitExpression" || p.type === "ChainExpression")))) dropped.add(x);
    hit ||= x.type === "CallExpression" && x.callee.type === "Identifier" && x.callee.name !== self && fns.has(x.callee.name) && !dropped.has(x);
    return hit;
  });
  return hit;
}

/** The plan's and the account's words, as names: a value made from one is an answer of the plan or the account. */
const ANSWER_WORDS = new Set([...BILLING_NAMES, ...ACCOUNT_NAMES]);

/** Whether an expression carries an answer: a name in `held`, a word of the plan or the account, or a call to one of `near`. */
function carries(expr, held, near) {
  let hit = false;
  eachNode(expr, (x) => {
    hit ||= (x.type === "Identifier" && (held.has(x.name) || ANSWER_WORDS.has(x.name))) || (x.type === "CallExpression" && x.callee.type === "Identifier" && near.has(x.callee.name));
    return hit;
  });
  return hit;
}

/** The names in a function that hold an answer: the parameters it is handed one in, and each variable made from one, any number deep. */
function heldIn(fn, given, near) {
  const held = new Set(given);
  for (let size = -1; held.size !== size; ) {
    size = held.size;
    eachNode(fn.body, (x) => {
      const [target, value] = x.type === "VariableDeclarator" ? [x.id, x.init] : x.type === "AssignmentExpression" && x.left.type !== "MemberExpression" ? [x.left, x.right] : [];
      if (value && carries(value, held, near)) patternNames(target).forEach((n) => held.add(n));
    });
  }
  return held;
}

/** The calls in a function that hand an answer on (`renderProStudio(pulse, isProUser)`), each as the function called and its parameters that receive it. */
function handsAnswer(fn, held, near, nodes, self) {
  const out = [];
  eachNode(fn.body, (x) => {
    const g = x.type === "CallExpression" && x.callee.type === "Identifier" ? x.callee.name : "";
    if (!g || g === self || !nodes[g]) return;
    x.arguments.forEach((a, i) => carries(a, held, near) && out.push([g, nodes[g].flatMap((f) => patternNames(f.params[i]))]));
  });
  return out;
}

/**
 * The functions on the path that read the plan or the account, and those that use one's answer (a call whose value
 * they keep, test or return), any number deep; and the functions those hand an answer to (a parameter given it, or
 * a value made from it), any number deep down. Each with its code's hash. A function handed an answer is not a
 * reader in its own right: `tt` words the trial's days, and the hundreds of lines that word other things with it
 * use nothing of the plan.
 */
function answerFlow(source, roots) {
  const fns = functionsOf(source);
  const nodes = functionNodes(source);
  const reach = reachable(fns, roots);
  const readers = new Set([...Object.keys(practicePath(source, roots)), ...Object.keys(practicePath(source, roots, "account"))]);
  const handed = new Map();
  const weight = () => readers.size + [...handed.values()].reduce((n, given) => n + 1 + given.size, 0);
  for (let w = -1; weight() !== w; ) {
    w = weight();
    for (const n of reach.keys()) if (!readers.has(n) && (nodes[n] || []).some((f) => usesAnswer(f.body, readers, n))) readers.add(n);
    for (const n of new Set([...readers, ...handed.keys()])) {
      for (const f of nodes[n] || []) {
        for (const [g, params] of handsAnswer(f, heldIn(f, handed.get(n) || [], readers), readers, nodes, n)) {
          if (reach.has(g) && !readers.has(g)) handed.set(g, new Set([...(handed.get(g) || []), ...params]));
        }
      }
    }
  }
  return { readers, handed, nodes };
}

/** Those functions, each with its code's hash. */
function planNeighbours(source, roots) {
  const { readers, handed, nodes } = answerFlow(source, roots);
  return Object.fromEntries([...readers, ...handed.keys()].sort().map((n) => [n, codeHash(nodes[n] || null)]));
}

test("the functions on the practice path that read the plan, or use what one answers, are the ones read and pinned: each only draws", () => {
  const found = planNeighbours(readFileSync("js/app.js", "utf8"), PRACTICE_ROOTS);
  assert.ok(found.headerPlanState && found.trackTrialFirstPractice && found.renderExercise, "control: a reader, Start's trial funnel that uses its answer, and the exercise screen that uses one two deep are found");
  const expected = Object.fromEntries(Object.entries(REVIEWED).map(([n, [hash]]) => [n, hash]));
  assert.deepEqual(
    diffCounts(found, expected),
    [],
    "a function on the practice path that reads the plan, or uses its answer, is new or changed: read it, check it still only draws and stops no practice, then write its hash and why in REVIEWED"
  );
});

test("every element bound to open the sale or the sign-in is a handle the scanner knows, so a new Pro button joins on its own", () => {
  const found = [];
  const missing = [];
  for (const [file, source] of Object.entries(shippedScripts("."))) {
    for (const [what, opens, known] of [
      ["the sale", OPENS_SALE, BILLING_HANDLES],
      ["the sign-in", OPENS_SIGN_IN, ACCOUNT_HANDLES]
    ]) {
      for (const sel of openerHandles(source, opens, known)) {
        found.push(sel);
        const id = /^#[\w-]+$/.test(sel) ? sel.slice(1) : sel;
        if (!known.has(sel) || !known.has(id)) missing.push(`${file}: ${sel} opens ${what}`);
      }
    }
  }
  assert.ok(["#btn-pricing", "#btn-value-pro", "#value-banner-cta", "#btn-account", "[data-ad-cta]"].every((h) => found.includes(h)), `control: the header's buttons, the board's, the trial note's and the house ad's are found (${found.join(" ")})`);
  assert.deepEqual(missing, [], "an element opens the sale or the sign-in and is not a handle: add it, and its bare id, to BILLING_HANDLES or ACCOUNT_HANDLES in qa/promise-scan.mjs");
});

/**
 * The classes and data attributes a reader of the plan or the account paints that are not marks of it, and why:
 * a mark is one that says which plan, or whether someone is signed in, so reading it back reads the plan.
 */
export const NOT_MARKS = {
  billing: {
    "ad-slot": "the ad card's own class, drawn the same whatever the plan",
    "ad-slot--native": "the same card's kind",
    "btn-ghost": "a style a hundred buttons share; on the header button it is one plan's look, but read alone it names no plan, and the button's id or plan-* class is a mark",
    "pricing-open": "set while the pricing dialog is open: it says the dialog is up, not which plan",
    "account-open": "set while the account panel is open",
    "pro-verb": "the span that holds the offer's verb on a phone",
    "value-pulse-tag": "the board's tag's own class, the same whatever the plan",
    "is-locked": "the board's insights panel, locked for a free visitor: read alone it names the panel's state, which the panel's own id would read too (see Trade-offs)",
    "is-dim": "the board's spark bars, dimmed for a free visitor: the same"
  },
  account: {
    "account-open": "set while the account panel is open: it says the panel is up, not who is signed in",
    "pricing-open": "set while the pricing dialog is open",
    "data-email": "the address typed at the code step, kept for its resend: someone signing in, not someone signed in",
    "data-i18n": "the panel's trial button's words key",
    "data-tone": "a bug report's message tone"
  }
};

/** Every string in an expression, a template's fixed parts too. */
function stringsIn(expr) {
  const out = [];
  eachNode(expr, (x) => {
    const t = x.type === "Literal" && typeof x.value === "string" ? x.value : x.type === "TemplateElement" ? x.value.cooked : null;
    if (t) out.push(t);
  });
  return out;
}

const propOf = (m) => (m.computed ? (m.property.type === "Literal" ? String(m.property.value) : "") : m.property.name || "");
const kebab = (k) => "data-" + k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
const CLASS_CALLS = /^(add|toggle|replace|remove)$/;

/** What an assignment paints: the classes of `el.className = ...`, or the attribute of `el.dataset.x = ...`. */
function assignedMarks(x) {
  const left = x.type === "AssignmentExpression" && x.left.type === "MemberExpression" ? x.left : null;
  if (left && propOf(left) === "className") return stringsIn(x.right).flatMap((t) => t.split(/\s+/).filter(Boolean));
  return left?.object.type === "MemberExpression" && propOf(left.object) === "dataset" ? [kebab(propOf(left))] : [];
}

/** What a call paints: the classes of `classList.add/toggle/remove/replace(...)`, or the attribute of `setAttribute("data-x", ...)`. */
function calledMarks(x) {
  const c = x.type === "CallExpression" && x.callee.type === "MemberExpression" ? x.callee : null;
  if (c?.object.type === "MemberExpression" && propOf(c.object) === "classList" && CLASS_CALLS.test(propOf(c))) return x.arguments.flatMap(stringsIn);
  return c && propOf(c) === "setAttribute" && /^data-/.test(x.arguments[0]?.value) ? [x.arguments[0].value] : [];
}

/** The classes and data attributes a function writes on an element. */
function marksWritten(fnNode) {
  const out = new Set();
  eachNode(fnNode.body, (x) => [...assignedMarks(x), ...calledMarks(x)].forEach((m) => out.add(m)));
  return out;
}

/** What the readers of `kind` write, across every file, with who writes it; for the plan, the functions on the practice path handed its answer too (renderProStudio's panels). */
function marksOf(kind) {
  const found = new Map();
  const note = (file, name, nodes) => (nodes[name] || []).forEach((f) => marksWritten(f).forEach((m) => found.set(m, [...(found.get(m) || []), `${file} ${name}`])));
  for (const [file, source] of Object.entries(shippedScripts("."))) {
    const nodes = functionNodes(source);
    for (const name of Object.keys(usesByFunction(source, kind))) note(file, name, nodes);
    if (file === "js/app.js" && kind === "billing") for (const name of answerFlow(source, PRACTICE_ROOTS).handed.keys()) note(file, name, nodes);
  }
  return found;
}

test("every class or data attribute a reader of the plan or the account paints is a mark the scanner knows, or written down as none", () => {
  for (const [kind, marks, control] of [
    ["billing", BILLING_MARKS, "is-free"],
    ["account", ACCOUNT_MARKS, "is-signed-in"]
  ]) {
    const found = marksOf(kind);
    assert.ok(found.has(control) && found.has(kind === "billing" ? "data-plan" : "door-name"), `control: the ${kind} marks the board, the header button and the door paint are found`);
    const unknown = [...found].filter(([m]) => !marks.has(m) && !NOT_MARKS[kind][m]).map(([m, who]) => `${m} (${[...new Set(who)].join(", ")})`);
    assert.deepEqual(unknown, [], `a reader of the ${kind === "billing" ? "plan" : "account"} paints a class or data attribute that is not a mark: add it to ${kind === "billing" ? "BILLING_MARKS" : "ACCOUNT_MARKS"} in qa/promise-scan.mjs, or to NOT_MARKS with why it names no ${kind === "billing" ? "plan" : "sign-in"}`);
    const stale = Object.keys(NOT_MARKS[kind]).filter((m) => !found.has(m));
    assert.deepEqual(stale, [], "control: each mark written down as none is still painted by a reader");
  }
});

/** The files that keep the plan's and the account's records, and which of the scanner's key sets each one's keys belong to. */
const KEY_FILES = {
  "js/billing.js": [BILLING_KEYS],
  "js/license.js": [BILLING_KEYS],
  "js/account.js": [ACCOUNT_KEYS, BILLING_KEYS],
  "js/auth.js": [ACCOUNT_KEYS],
  "js/sync.js": [ACCOUNT_KEYS]
};

test("every key the plan's and the account's files keep in storage is a word the scanner knows", () => {
  const missing = [];
  let seen = 0;
  for (const [file, sets] of Object.entries(KEY_FILES)) {
    const keys = new Set(stringsIn(parse(readFileSync(file, "utf8"), { ecmaVersion: "latest", sourceType: "script" })).filter((t) => /^vt_[a-z0-9_]+$/.test(t)));
    seen += keys.size;
    for (const k of keys) if (!sets.some((set) => set.has(k))) missing.push(`${file}: ${k}`);
  }
  assert.ok(seen >= 12, "control: the files' keys are found");
  assert.deepEqual(missing, [], "a key the plan or the account keeps is not a word: reading it would read the plan or the sign-in unseen. Add it to BILLING_KEYS or ACCOUNT_KEYS in qa/promise-scan.mjs");
});

/** Each element of a page by id, with its classes, and how many elements of the page carry each class. */
function pageElements(html) {
  const byId = new Map();
  const count = new Map();
  for (const [tag] of html.matchAll(/<[a-zA-Z][^<>]*>/g)) {
    const cls = (/\sclass="([^"]*)"/.exec(tag)?.[1] || "").split(/\s+/).filter(Boolean);
    cls.forEach((c) => count.set(c, (count.get(c) || 0) + 1));
    const id = /\sid="([^"]+)"/.exec(tag)?.[1];
    if (id) byId.set(id, cls);
  }
  return { byId, count };
}

test("a class only a sale or sign-in door, or its dialog, has on the page is a word the scanner knows", () => {
  const { byId, count } = pageElements(readFileSync("index.html", "utf8"));
  const doors = [
    ...[...BILLING_HANDLES].filter((h) => /^#[\w-]+$/.test(h)).map((h) => [h.slice(1), BILLING_LITERALS]),
    ...[...ACCOUNT_HANDLES].filter((h) => /^#[\w-]+$/.test(h)).map((h) => [h.slice(1), ACCOUNT_LITERALS])
  ];
  const dialogs = [...new Set([...DIALOGS.values()].map(([, id]) => id))];
  assert.ok(byId.has("btn-account") && byId.has("pricing-modal"), "control: the page's doors and dialogs are found");
  const missing = [];
  for (const [id, words] of doors) for (const c of byId.get(id) || []) if (count.get(c) === 1 && !words.has(c)) missing.push(`#${id} .${c}`);
  for (const id of dialogs) for (const c of byId.get(id) || []) if (count.get(c) === 1 && !DIALOGS.has(c)) missing.push(`#${id} .${c} (a dialog)`);
  assert.deepEqual(missing, [], "a class names a door or a dialog as well as its id does: add it to the handles or to DIALOGS in qa/promise-scan.mjs");
});

test("the plan is read only in the files that sell, draw Pro or keep its extras", () => {
  assert.deepEqual(Object.keys(acrossScripts(".", billingNamesIn)).sort(), Object.keys(PLAN_FILES).sort());
});

test("every function that reads the plan or opens the sale is written down, file by file, with why", () => {
  const found = {};
  for (const [file, source] of Object.entries(shippedScripts("."))) {
    for (const [fn, uses] of Object.entries(usesByFunction(source))) found[`${file} :: ${fn}`] = uses;
  }
  const expected = flat(Object.fromEntries(Object.entries(PLAN_USES).map(([f, rows]) => [f, Object.fromEntries(Object.entries(rows).map(([k, [u]]) => [k, u]))])));
  assert.ok(Object.keys(found).length > 40, "control: the plan's readers are found");
  assert.deepEqual(diffCounts(found, expected), [], "the plan is read, or the sale opened, where it was not: write it down in PLAN_USES with why, and why it cannot stop practice");
});

test("every function that asks whether the visitor is signed in, or opens the sign-in, is written down, file by file, with why", () => {
  const found = {};
  for (const [file, source] of Object.entries(shippedScripts("."))) {
    for (const [fn, uses] of Object.entries(usesByFunction(source, "account"))) found[`${file} :: ${fn}`] = uses;
  }
  const expected = flat(Object.fromEntries(Object.entries(ACCOUNT_USES).map(([f, rows]) => [f, Object.fromEntries(Object.entries(rows).map(([k, [u]]) => [k, u]))])));
  assert.ok(Object.values(found).some((u) => u.split(" ").some((w) => opensSignIn(w.slice(0, w.lastIndexOf(":"))))), "control: the sign-in's openers are among them");
  assert.deepEqual(diffCounts(found, expected), [], "the account is asked about, or the sign-in opened, where it was not: write it down in ACCOUNT_USES with why, and why it cannot stand in front of practice");
});

test("every event carries only the props in the plan, and nothing passes one on but the listed relays", () => {
  const calls = [];
  const relays = [];
  const unresolved = [];
  for (const [file, source] of Object.entries(shippedScripts("."))) {
    const found = eventsIn(source, file);
    calls.push(...found.calls);
    relays.push(...found.relays);
    unresolved.push(...found.unresolved);
  }
  assert.ok(calls.length > 50, "control: the call sites are found");
  assert.deepEqual(unresolved, [], "an event's name made from a template that cannot be told: write the name out");
  assert.ok(calls.some(([, n]) => n === "tour_skip") && calls.some(([, n]) => n === "mic_primer_decline"), "control: a name made from a template is found by each name it makes");
  const off = calls.filter(([, name, keys]) => !TRACKING_PLAN[name] || keys.some((k) => !TRACKING_PLAN[name].includes(k)));
  assert.deepEqual(off, [], "an event or a prop not in TRACKING_PLAN: add it there, and say it is not derived from the voice");
  assert.deepEqual([...new Set(relays)].sort(), [...TRACK_RELAYS].sort());
});

test("every event in the plan is one the worker keeps, with props it keeps: the wire filter cannot hide a drift", async () => {
  // js/analytics.js drops on the way out what the worker would drop on arrival, so the worker's count of unknown
  // events can no longer show a client that raises one. This is where that drift shows instead: before it ships.
  const { EVENT_NAMES, sanitizeProps } = await import("../../workers/entitlements/src/events.js");
  const missing = [];
  for (const [name, keys] of Object.entries(TRACKING_PLAN)) {
    if (!EVENT_NAMES.has(name)) missing.push(name);
    for (const k of keys.filter((k) => !k.startsWith("..."))) if (!Object.hasOwn(sanitizeProps({ [k]: "x" }), k)) missing.push(`${name}.${k}`);
  }
  assert.deepEqual(missing, [], "an event or a prop the worker drops: add it to workers/entitlements/src/events.js and js/analytics.js's WIRE_NAMES together");
});

test("nothing on the way to practising, saving, rating or the history asks whether the visitor is signed in, but the header's label and the page's way out", () => {
  const path = practicePath(readFileSync("js/app.js", "utf8"), PRACTICE_ROOTS, "account");
  const found = Object.fromEntries(Object.entries(path).map(([n, { uses }]) => [n, uses]));
  const expected = Object.fromEntries(Object.entries(SIGN_IN_READERS).map(([n, [uses]]) => [n, uses]));
  assert.deepEqual(diffCounts(found, expected), [], `asked on the way: ${JSON.stringify(path, null, 1)}`);
});

test("every function of js/app.js that calls into practice is on the path, or written down with why it is not a way in", () => {
  // A cap in a click handler, ahead of the call into practice ("if (!isPro()) return openPricing(); startMicroSession()"),
  // is checked only if the handler is on the path: here every caller of a root is, or is listed.
  const fns = functionsOf(readFileSync("js/app.js", "utf8"));
  const reach = reachable(fns, PRACTICE_ROOTS);
  const core = new Set(PRACTICE_CORE);
  const callers = Object.keys(fns).filter((n) => [...fns[n].refs].some((r) => r !== n && core.has(r)));
  assert.ok(callers.includes("bindRetention #wb-last") && callers.includes("init"), "control: click handlers and the page's start are found as callers");
  assert.deepEqual(callers.filter((n) => !reach.has(n) && !NOT_A_WAY_IN[n]), [], "a way into practice off the path: add it to PRACTICE_ROOTS");
  assert.deepEqual(Object.keys(NOT_A_WAY_IN).filter((n) => !callers.includes(n) || reach.has(n)), [], "control: each exception still calls into practice from off the path");
  // An exception is off the path, so nothing else reads it: a cap written in its own body would pass.
  const reads = Object.entries(NOT_A_WAY_IN)
    .filter(([n, [allowed]]) => bagsText(fns[n]) !== allowed)
    .map(([n]) => `${n}: ${bagsText(fns[n])}`);
  assert.deepEqual(reads, [], "a listed exception reads the plan, opens the sale or asks about the account beyond what is written down: a way in hidden in it");
});

test("only the files listed use the account module or ask whether the visitor is signed in", () => {
  assert.deepEqual(Object.keys(acrossScripts(".", accountNamesIn)).sort(), Object.keys(SIGN_IN_FILES).sort());
});

test("the code that keeps a guest's progress never asks about an account and never keeps anything for the tab only", () => {
  const scripts = shippedScripts(".");
  const found = GUEST_STORES.map((f) => [f, [...new Set([...scripts[f].matchAll(NOT_IN_GUEST_STORES)].map((m) => m[1]))]]).filter(([, n]) => n.length);
  assert.deepEqual(found, []);
});

test("a guest's progress is kept under the names it always was", () => {
  const src = readFileSync("js/storage.js", "utf8");
  const block = /const LS = \{([\s\S]*?)\n  \};/.exec(src)?.[1] || "";
  const keys = Object.fromEntries([...block.matchAll(/^\s*(\w+): "([^"]+)"/gm)].map((m) => [m[1], m[2]]));
  for (const name of ["DB_NAME", "DB_STORE"]) keys[name] = new RegExp(`const ${name} = "([^"]+)"`).exec(src)?.[1];
  assert.deepEqual(keys, GUEST_KEYS);
});

test("only the ad files read the ad config, and they ask AdSense for nothing but the units the page draws", () => {
  const readers = Object.entries(shippedScripts("."))
    .filter(([, src]) => AD_NAMES.test(src))
    .map(([f]) => f)
    .sort();
  assert.deepEqual(readers, AD_FILES);
  // Every file that may name the queue, not only the one that draws units: a push beside the ad config asks for
  // page-level ads the same way.
  const pushes = AD_FILES.flatMap((f) => adPushes(readFileSync(f, "utf8")));
  assert.ok(pushes.length >= 1, "control: the unit's own push is found");
  assert.deepEqual(
    [...new Set(pushes)],
    ["0"],
    "every push to adsbygoogle is an empty {}: the unit the page drew, never page-level ads asked for by the page (Auto ads are an AdSense account switch: docs/40 step 9c)"
  );
});

/* ------------------------------------------------------------------ controls: each finder sees the red team's changes */

test("control: the sinks the red team used are each found, and a word that is not an address is not", () => {
  const src = `
    function save(b) { setTimeout(() => fetch("/api/grade", { method: "POST", body: b.stream(), duplex: "half" }), 10); }
    function hand(b) { window.opener?.postMessage({ b }, "*"); }
    function hint(h) { const l = document.createElement("link"); l.rel = "dns-prefetch"; l.href = "//" + h + ".voice.example"; document.head.append(l); }
    function beacon(p) { navigator.sendBeacon("/v", p); }
    function img(d) { const i = new Image(); i.src = "/p?d=" + d; }
    function html(d) { el.innerHTML = '<img src="/p?d=' + d + '">'; }
    function cookie(p) { document.cookie = "t=" + p; }
    function go(d) { location.href = "https://x.example/?d=" + d; }
    function backup(t) { window.VTAccount.request("PUT", "/v1/me/takes", t); }
    function rtc() { new RTCPeerConnection(); new Worker("w.js"); }
    function word() { live.src = "chosen"; bag.src = x ? "default" : "link"; }
  `;
  assert.deepEqual({ ...sinksIn(src) }, {
    "save › fetch": 1,
    "hand › postMessage": 1,
    "hint › createElement:link": 1,
    "hint › hint": 1,
    "hint › set:href": 1,
    "beacon › sendBeacon": 1,
    "img › new Image": 1,
    "img › set:src": 1,
    "html › html:img": 1,
    "cookie › cookie": 1,
    "go › navigate": 1,
    "backup › VTAccount.request": 1,
    "rtc › new RTCPeerConnection": 1,
    "rtc › new Worker": 1
  });
});

test("control: a sync that reads a take, a helper that sends what a hearer hands it, and a cap behind a helper are caught", () => {
  assert.deepEqual(Object.keys(voiceSourcesIn("async function runCycle() { for (const r of await VTStorage.listRecordings()) put(r); }")), ["listRecordings"]);

  const app = `
    function onSave(result) { VTStorage.saveRecording(result.blob); later(result.blob); }
    function later(b) { setTimeout(() => upload(b), 120000); }
    function upload(b) { fetch("/api/backup", { method: "PUT", body: b }); }
    function startPractice() { if (capReached()) return; go(); }
    function capReached() { return !window.VTBilling?.isPro?.() && spent() > 3600; }
    function go() {}
  `;
  const fns = functionsOf(app);
  const reach = reachable(fns, ["onSave"]);
  assert.deepEqual(reach.get("upload"), ["onSave", "later", "upload"]);
  assert.match(Object.keys(sinksIn(app)).find((k) => NETWORK.test(k)), /^upload › fetch$/);
  assert.deepEqual(practicePath(app, ["startPractice"]), { capReached: { uses: "VTBilling:1 isPro:1", via: "startPractice > capReached" } });
});

test("control: a new prop on a known event, a new event and a new relay are each caught", () => {
  const src = `
    function recordPracticeIfDue() { window.VTAnalytics?.track?.("practice_recorded", { exerciseId: id, f0: contour }); }
    function shape() { window.VTAnalytics?.track?.("take_shape", { f0: contour }); }
    function relay(n, p) { window.VTAnalytics?.track?.(n, p); }
  `;
  const { calls, relays } = eventsIn(src, "x.js");
  const off = calls.filter(([, name, keys]) => !TRACKING_PLAN[name] || keys.some((k) => !TRACKING_PLAN[name].includes(k)));
  assert.deepEqual(
    off.map(([, n, k]) => [n, k]),
    [
      ["practice_recorded", ["exerciseId", "f0"]],
      ["take_shape", ["f0"]]
    ]
  );
  assert.deepEqual(relays, ["x.js › relay"]);

  // A name made from a template is each name its calls can make, through a parameter passed on; one that cannot be
  // told is listed rather than passed by its prefix.
  const made = eventsIn(
    `
    function end(reason) { if (active) finish(reason); }
    function finish(why) { if (!why) return; window.VTAnalytics?.track?.(\`tour_\${why}\`, { n: 1 }); }
    function wire(x) { a.onclick = () => end(x ? "complete" : "skip"); b.onclick = () => end(false); c.onclick = () => end("closed"); }
    function shape(contour) { window.VTAnalytics?.track?.(\`take_\${contour}\`, {}); }
  `,
    "x.js"
  );
  assert.deepEqual(made.calls.map(([, n]) => n), ["tour_complete", "tour_skip", "tour_closed"]);
  assert.deepEqual(made.unresolved, ["x.js:5 `take_${}`"]);

  // A relay that adds to what it passes on, or writes into it, is listed as changing it; one that passes its own
  // two parameters on as they came is not.
  const relayed = eventsIn(
    `
    function plain(n, p) { window.VTAnalytics?.track?.(n, p || {}); }
    function adds(n, p) { window.VTAnalytics?.track?.(n, { ...p, view: state.view }); }
    function writes(n, p) { p.heard = true; window.VTAnalytics?.track?.(n, p); }
    function renames(n, p) { n = "x_" + n; window.VTAnalytics?.track?.(n, p); }
    function assigns(n, p) { Object.assign(p || {}, { view: state.view }); window.VTAnalytics?.track?.(n, p || {}); }
    function aliases(n, props) { const q = props || {}; q.view = state.view; window.VTAnalytics?.track?.(n, props || {}); }
    function helps(n, p) { withView(p); window.VTAnalytics?.track?.(n, p); }
  `,
    "x.js"
  );
  assert.deepEqual(
    relayed.relays,
    ["plain", "adds", "writes", "renames", "assigns", "aliases", "helps"].map((r) => `x.js › ${r}${r === "plain" ? "" : " (changes what it passes on)"}`),
    "every way the review found to add to what a relay passes on, through `props || {}`, an alias or a helper, is listed"
  );
  // A relay handed on as a value is listed: what calls it then is not read. A parameter called track is not the relay.
  const handed = eventsIn(
    `
    function trackFunnel(n, p) { window.VTAnalytics?.track?.(n, p); }
    function note(where, report = trackFunnel) { report("trial_cta_view", { where, view: 1 }); }
    function basics(track) { return track.steps; }
  `,
    "x.js"
  );
  assert.deepEqual(handed.relays.sort(), ["x.js › trackFunnel", "x.js › trackFunnel (handed on)"]);
  // A template's part given another value in its own function, or a function called by any spelling but its bare
  // name (bound, or handed to another script), cannot be told from its calls here.
  const tour = (inside, outside = "") =>
    eventsIn(
      `
    function end(reason) { if (!reason) return; ${inside} window.VTAnalytics?.track?.(\`tour_\${reason}\`, { n: 1 }); }
    function wire() { a.onclick = () => end("skip"); ${outside} }
  `,
      "x.js"
    );
  assert.deepEqual([tour("").calls.map(([, n]) => n), tour("").unresolved], [["tour_skip"], []]);
  assert.deepEqual(
    [
      tour('if (reason === "skip" && i === 0) reason = "skip_first";'),
      tour("", "b.addEventListener('click', end.bind(null, 'close'));"),
      tour("", "window.VTTour = { end };"),
      tour("", "window.VTTour = { end: (r) => end(r ? 'dismiss' : false) };")
    ].map((r) => [r.calls.map(([, n]) => n), r.unresolved]),
    [
      [[], ["x.js:2 `tour_${}`"]],
      [[], ["x.js:2 `tour_${}`"]],
      [[], ["x.js:2 `tour_${}`"]],
      [["tour_skip", "tour_dismiss"], []]
    ],
    "reassigned, bound and exported are each unresolved; a wrapper that can pass only a known name is not"
  );
  // Told apart by scope, not by spelling: an end() with nothing (no name, as end(false)), another function's own
  // `end`, and a callback's own `reason` change nothing; a parameter's default is a value it can take.
  assert.deepEqual(
    [
      tour("", "b.onclick = () => end();"),
      tour("", "function place(top) { const end = top ? 8 : 10; return end + 1; }"),
      tour("hand.catch((reason) => console.warn(reason));")
    ].map((r) => [r.calls.map(([, n]) => n), r.unresolved]),
    [
      [["tour_skip"], []],
      [["tour_skip"], []],
      [["tour_skip"], []]
    ],
    "honest edits far from the event leave it resolved"
  );
  const dflt = eventsIn('function end(reason = "close") { window.VTAnalytics?.track?.(`tour_${reason}`, {}); } function wire() { a.onclick = () => end(); b.onclick = () => end("skip"); }', "x.js");
  assert.deepEqual([dflt.calls.map(([, n]) => n), dflt.unresolved], [["tour_close", "tour_skip"], []]);
});

test("control: the review's spellings of a way off the device are each found, and a module's own open or a test of beacon support is not", () => {
  const src = `
    function speak() { const r = new (window.SpeechRecognition || window.webkitSpeechRecognition)(); r.start(); }
    function later(b) { window.fetchLater?.("/api/backup", { method: "PUT", body: b, activateAfter: 120000 }); }
    function bound(b) { const send = navigator.sendBeacon.bind(navigator); send("/v", b); fetch.call(window, "/g", { body: b }); }
    function alias(b) { const f = window.fetch || polyfill; return f("/g", { body: b }); }
    function quic(u) { new WebTransport(u); }
    function crumb(p) { cookieStore.set("t", p); }
    function assign(u) { Object.assign(img, { src: u }); }
    function svg(u) { const i = document.createElementNS(NS, "image"); i.setAttributeNS(XLINK, "href", u); }
    function markup(u) { el.innerHTML = '<svg><image href="' + u + '"></image></svg>'; }
    function pinged(u) { el.innerHTML = '<a href="/x" ping="' + u + '">x</a>'; }
    function css(u) { style.textContent = "@import '" + u + "';"; }
    function search(q) { location.search = "?d=" + q; }
    function nav(u) { navigation.navigate(u); }
    function worker() { self.importScripts("/w.js"); }
    function popup(u) { open(u); }
    function tested() { if (navigator.sendBeacon && ok) go(); }
    function param(b, send = fetch) { return send("/p", { body: b }); }
    function picked(b) { const { sendBeacon } = navigator; const { fetch: get } = window; sendBeacon("/v", b); get("/g"); }
    class Uploader { send = fetch; post = (b) => this.send("/c", { body: b }); }
  `;
  assert.deepEqual({ ...sinksIn(src) }, {
    "speak › speech-recognition": 2,
    "later › fetchLater": 1,
    "bound › sendBeacon": 1,
    "bound › fetch": 1,
    "alias › fetch": 1,
    "quic › new WebTransport": 1,
    "crumb › cookie": 1,
    "assign › set:src": 1,
    "svg › createElement:image": 1,
    "svg › setAttribute:href": 1,
    "markup › html:image": 1,
    "pinged › html:a-ping": 1,
    "css › css-import": 1,
    "search › navigate": 1,
    "nav › navigate": 1,
    "worker › importScripts": 1,
    "popup › window.open": 1,
    "param › fetch": 1,
    "picked › sendBeacon": 1,
    "picked › fetch": 1,
    "send › fetch": 1
  });
  assert.deepEqual({ ...sinksIn("function open(o) {} function wire() { open({ kind: 'bug' }); }") }, {}, "a module's own open() is not the window's");
  // A name is the module's own only where it is declared: a sibling's `let open` leaves the window's open() as it was.
  assert.deepEqual(
    { ...sinksIn("function list() { let open = false; open = !open; } function leave(u) { open(u); }") },
    { "leave › window.open": 1 },
    "a sibling's own open does not hide the window's"
  );
});

test("control: the review's ways to hear the voice or read a take, and to ask about an account, are each found", () => {
  const voice = `
    function a() { return navigator.mediaDevices["getUserMedia"]({ audio: true }); }
    function b(el) { return ctx.createMediaElementSource(el); }
    async function c(blob) { return ctx.decodeAudioData(await blob.arrayBuffer()); }
    function d() { return indexedDB.open("vt_recordings_db"); }
    function e() { navigator.webkitGetUserMedia({ audio: true }, ok, no); }
    function f() { return new webkitSpeechRecognition(); }
  `;
  assert.deepEqual(Object.keys(voiceSourcesIn(voice)).sort(), [
    "createMediaElementSource",
    "decodeAudioData",
    "getUserMedia",
    "vt_recordings_db",
    "webkitGetUserMedia",
    "webkitSpeechRecognition"
  ]);
  const account = `
    function save() { if (!window.VTAccount?.getState?.()?.account) return window.VTAccount.signInWithGoogle?.(); }
  `;
  assert.deepEqual(practicePath(account, ["save"], "account"), {
    save: { uses: "VTAccount:2 getState().account:1 signInWithGoogle:1", via: "save" }
  });
  // The sale and the sign-in opened by their buttons' ids, and the plan read from its own key, with no name in sight;
  // a dialog's own id is not the sale (closing it is everywhere).
  // Another Pro button pressed, the dialogs shown by their own ids (directly or through a variable), the plan read
  // off the header button, and the older sign-in asked; a dialog closed is not the sale.
  const handles = `
    function a() { $("#btn-pricing").click(); }
    function b() { document.getElementById("btn-account")?.click(); }
    function c() { return JSON.parse(localStorage.getItem("vt_billing_v1") || "{}").plan; }
    function d() { $("#pricing-modal").hidden = true; }
    function e() { $("#btn-value-pro")?.click(); }
    function f() { $("#pricing-modal").hidden = false; }
    function g() { const modal = document.getElementById("account-modal"); modal.removeAttribute("hidden"); }
    function h() { return document.querySelector("[data-plan]")?.dataset.plan === "free"; }
    function i() { if (!window.VTAuth?.isLoggedIn?.()) return true; }
  `;
  assert.deepEqual(
    [usesByFunction(handles), usesByFunction(handles, "account")],
    [
      { a: "#btn-pricing:1", c: "vt_billing_v1:1", e: "#btn-value-pro:1", f: "#pricing-modal:open:1", h: "[data-plan]:1 dataset.plan:1" },
      { b: "btn-account:1", g: "#account-modal:open:1", i: "VTAuth:1" }
    ]
  );
  const shown = (how) => usesByFunction(`function x() { $("#pricing-modal")${how}; }`).x || "";
  const shows = [".hidden = false", ".hidden = !open", '.removeAttribute("hidden")', '.toggleAttribute("hidden")', ".showModal()", ".show()", '.classList.remove("is-hidden")', '.style.display = "flex"', ".open = true", '.setAttribute("open", "")'];
  const hides = [".hidden = true", '.setAttribute("hidden", "")', '.toggleAttribute("hidden", true)', '.style.display = "none"', ".open = false", ".close()"];
  assert.deepEqual([shows.map(shown), hides.map(shown)], [shows.map(() => "#pricing-modal:open:1"), hides.map(() => "")], "each way to show the dialog counts, and none to hide it");
  // The elements bound to open the sale or the sign-in, found from the listeners: by reference, by a callback that
  // calls an opener, or by one that presses a known handle.
  const bound = `
    function bind() {
      $("#btn-x").addEventListener("click", openPricing);
      $("#btn-y")?.addEventListener("click", () => { hide(); openPricing(); });
      document.getElementById("btn-z").onclick = () => $("#btn-pricing").click();
      $("#btn-w").addEventListener("click", () => draw());
      const k = $("#btn-k");
      k.addEventListener("click", openAccount);
    }
  `;
  assert.deepEqual([openerHandles(bound, /^openPricing$/, new Set(["#btn-pricing"])), openerHandles(bound, /^openAccount$/)], [["#btn-x", "#btn-y", "btn-z"], ["#btn-k"]]);
});

test("control: a cap in a callback set on a property, in a method called on this, and a hearer's method that sends are caught", () => {
  const app = `
    function renderNextStepCard() { btn.onclick = () => { if (overHour() && !window.VTBilling?.isPro?.()) return openPricing(); startDaily(); }; }
    function wireEngineForTake() { state.practice.onFrame = (f) => { if (overHour()) return; paint(f); }; }
    function overHour() { return spent() > 3600; }
    function showMicBlocked() { retry.onclick = () => go(); skip.onclick = () => openPricing(); }
  `;
  const path = practicePath(app, ["renderNextStepCard", "wireEngineForTake"]);
  assert.deepEqual(Object.keys(path), ["renderNextStepCard.onclick"], "the Start card's onclick is on the path; showMicBlocked's skip, not reached, is not");
  assert.equal(path["renderNextStepCard.onclick"].uses, "VTBilling:1 isPro:1 openPricing:1");
  assert.deepEqual(reachable(functionsOf(app), ["wireEngineForTake"]).get("overHour"), ["wireEngineForTake", "wireEngineForTake.onFrame", "overHour"]);

  const engine = `
    class Engine {
      start() { this.recorder = new MediaRecorder(this.stream); this.recorder.onstop = () => this._report(this.recBlob); }
      _report(b) { fetch("/api/grade", { method: "POST", body: b }); }
    }
  `;
  const fns = functionsOf(engine);
  const reach = reachable(fns, Object.keys(fns).filter((n) => Object.keys(fns[n].voice).length));
  assert.deepEqual(reach.get("_report"), ["start.onstop", "_report"], "the hearer that holds the take reaches the method it calls on this");

  // A callback set on this in the constructor, and a class field that holds an arrow, are reached by `this.x()` too.
  const fields = `
    class Engine {
      constructor() { this.send = (b) => navigator.sendBeacon("/v", b); }
      upload = (b) => fetch("/u", { body: b });
      stop() { this.recorder = new MediaRecorder(s); this.recorder.ondataavailable = (e) => { this.send(e.data); this.upload(e.data); }; }
    }
  `;
  const held = functionsOf(fields);
  const heard = reachable(held, Object.keys(held).filter((n) => Object.keys(held[n].voice).length));
  assert.deepEqual([heard.get("constructor.send")?.at(-1), heard.get("upload")?.at(-1)], ["constructor.send", "upload"]);
  assert.deepEqual({ ...sinksIn(fields) }, { "constructor.send › sendBeacon": 1, "upload › fetch": 1 });
});

test("control: a hearer's sibling, a store's own method, a private method, a held element's handler and a function handed another are followed", () => {
  // Stop's handler keeps the take; the page's pagehide handler, made beside it, sends it.
  const sibling = `
    function bindTakeTools() {
      let last = null;
      $("#btn-rec-stop").addEventListener("click", async () => { last = await VTStorage.getRecordingBlob(id); });
      window.addEventListener("pagehide", () => { if (last) navigator.sendBeacon("/api/backup", last); });
    }
    function report() { fetch("/api/report", { method: "POST" }); }
  `;
  assert.deepEqual(leaksIn(sibling), ["bindTakeTools window › sendBeacon, reached by bindTakeTools > bindTakeTools window"]);
  assert.deepEqual(leaksIn(sibling.replace("navigator.sendBeacon(\"/api/backup\", last)", "console.log(last)")), [], "a sibling that keeps the take on the device is not a leak, and a function made elsewhere that sends is not reached");
  // The same with Stop's handler kept under a name another function's helper has, written first: each function a
  // name is made in is one its hearer is made in. Two functions made in each other do not loop.
  const twice = `
    function wrapUp() { const finish = () => console.log("done"); finish(); }
    function bindTakeTools() {
      let last = null;
      const finish = async () => { last = await VTStorage.getRecordingBlob(id); };
      $("#btn-rec-stop").addEventListener("click", finish);
      window.onpagehide = () => { if (last) navigator.sendBeacon("/api/backup", last); };
    }
  `;
  assert.deepEqual(leaksIn(twice), ["bindTakeTools.onpagehide › sendBeacon, reached by bindTakeTools > bindTakeTools.onpagehide"]);
  assert.deepEqual(leaksIn("function a() { function b() { getUserMedia(); } } function b() { function a() {} }"), []);
  // The store's own method, named for what it reads, and a class's private method called on this.
  const store = `const VTStorage = { getRecordingBlob(id) { const r = tx.get(id); r.onsuccess = () => navigator.sendBeacon("/b", r.result); } };`;
  assert.deepEqual(leaksIn(store), ["getRecordingBlob.onsuccess › sendBeacon, reached by getRecordingBlob > getRecordingBlob.onsuccess"]);
  const engine = `class Engine { stop() { this.recorder = new MediaRecorder(s); this.recorder.onstop = () => this.#archive(this.recBlob); } #archive(b) { fetch("/a", { body: b }); } #draw() { fetch("/x"); } }`;
  assert.deepEqual(leaksIn(engine), ["#archive › fetch, reached by stop.onstop > #archive"], "the private method called is reached; one that is not called is not");
  // A handler on an element kept in a variable is its own function, named by the element's selector; one on the
  // document by the document. A function handed another as an argument reaches it.
  const app = `
    function bindRetention() {
      const again = $("#wb-again");
      again?.addEventListener("click", () => { if (!window.VTBilling?.isPro?.()) return openPricing(); startMicroSession(); });
      document.addEventListener("visibilitychange", () => renderNextStepCard());
    }
    function init() { VTLoop.bind({ startDaily: proOnly(startDaily) }); }
    function proOnly(fn) { return (...a) => (window.VTBilling?.isPro?.() ? fn(...a) : openPricing()); }
    function startDaily() {}
  `;
  const fns = functionsOf(app);
  const called = (n) => ["bindRetention #wb-again", "bindRetention document", "openPricing", "startMicroSession", "renderNextStepCard"].filter((r) => fns[n].refs.has(r));
  assert.deepEqual(
    Object.fromEntries(["bindRetention", "bindRetention #wb-again", "bindRetention document"].map((n) => [n, [called(n), fns[n].billing]])),
    {
      bindRetention: [["bindRetention #wb-again", "bindRetention document"], {}],
      "bindRetention #wb-again": [["openPricing", "startMicroSession"], { VTBilling: 1, isPro: 1, openPricing: 1 }],
      "bindRetention document": [["renderNextStepCard"], {}]
    }
  );
  assert.ok(fns.proOnly.refs.has("startDaily") && !fns.startDaily.refs.has("proOnly"), "proOnly(startDaily) makes proOnly a caller of startDaily, not the other way");
  // A handler on an element found by a computed selector is named by its fixed text, or by the call that found it.
  const computed = functionsOf('function bindProgress(name, id) { $(`#tabs [data-tab="${name}"]`)?.addEventListener("click", () => openTab(name)); document.getElementById(id).addEventListener("click", () => go()); }');
  assert.deepEqual(Object.keys(computed).filter((n) => n.startsWith("bindProgress ")).sort(), ['bindProgress #tabs [data-tab="${}"]', "bindProgress document.getElementById(id)"]);
});

test("control: an aliased push to AdSense's queue is found, and a page's JSON-LD or speculation rules do not break the scan", async () => {
  assert.deepEqual(adPushes("const q = (window.adsbygoogle = window.adsbygoogle || []); q.push({ google_ad_client: 'ca-pub-1', enable_page_level_ads: true }); (adsbygoogle = adsbygoogle || []).push({});"), ["2", "0"]);
  // By its name in brackets, through a helper that returns the queue, and through an alias of an alias of an alias.
  assert.deepEqual(adPushes("window['adsbygoogle'].push({ google_ad_client: 'ca-pub-1', enable_page_level_ads: true });"), ["2"]);
  assert.deepEqual(adPushes("adQueue().push({ a: 1 }); function adQueue() { return (window.adsbygoogle = window.adsbygoogle || []); }"), ["1"]);
  assert.deepEqual(adPushes("const a = window.adsbygoogle; const b = a; const c = b; c.push({ x: 1, y: 2, z: 3 }); [].push({ q: 1 });"), ["3"]);
  // Taken out of an object (with a default or not), as a default parameter, and as a class field pushed on this.
  const PAGE_ADS = "({ google_ad_client: 'ca-pub-1', enable_page_level_ads: true })";
  assert.deepEqual(
    [
      `const { adsbygoogle: q } = window; q.push${PAGE_ADS};`,
      `const { adsbygoogle: q = [] } = window; q.push${PAGE_ADS};`,
      `function f(q = window.adsbygoogle) { q.push${PAGE_ADS}; }`,
      `class Ads { queue = window.adsbygoogle; show() { this.queue.push${PAGE_ADS}; } }`
    ].map(adPushes),
    [["2"], ["2"], ["2"], ["2"]]
  );
  // Handed to a helper of the file, or kept in a property (on this, on a state object, in an object literal).
  assert.deepEqual(
    [
      `function cfg(c, q) { q.push${PAGE_ADS}; } cfg(client, window.adsbygoogle);`,
      `const ads = { start() { this.queue = window.adsbygoogle; }, show() { this.queue.push${PAGE_ADS}; } };`,
      `state.queue = window.adsbygoogle || []; state.queue.push${PAGE_ADS};`,
      `const s = { queue: window.adsbygoogle }; s.queue.push${PAGE_ADS};`
    ].map(adPushes),
    [["2"], ["2"], ["2"], ["2"]]
  );
  assert.deepEqual(adPushes("const { other: q } = window; q.push({ a: 1 }); function f(q = []) { q.push({ b: 1 }); } function g(c, q) { q.push({ c: 1 }); } g(window.adsbygoogle, []);"), [], "a holder of anything else is not the queue");
  const { mkdtempSync, mkdirSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const root = mkdtempSync(tmpdir() + "/vt-scan-");
  mkdirSync(root + "/js");
  writeFileSync(root + "/js/a.js", "function a() {}");
  writeFileSync(
    root + "/new-page.html",
    '<script type="application/ld+json">{"@context":"https://schema.org","@type":"WebApplication"}</script>' +
      '<script type="speculationrules">{"prerender":[{"urls":["/guide.html"]}]}</script>' +
      '<script type="module">import "./x.js";</script><script>window.VT_X = 1;</script>'
  );
  assert.deepEqual(JSON.parse(JSON.stringify(acrossScripts(root, sinksIn))), {
    "new-page.html#inline-2": { "(top) › hint": 1 },
    "new-page.html#inline-3": { "(top) › import": 1 }
  });
});

test("control: the sixth round's spellings of the plan, the sign-in and their doors are each found, and what names neither is not", () => {
  const uses = (src, kind = "billing") => usesByFunction(src, kind);
  // A selector read by its parts: a mark or a door inside a compound or descendant selector, or a template.
  assert.deepEqual(
    uses(`
      function a() { return document.querySelector('[data-plan="free"]'); }
      function b() { document.querySelector(".value-pulse-cta #btn-value-pro")?.click(); }
      function c() { return !document.querySelector("#btn-pricing.plan-paid, #btn-pricing.plan-trial"); }
      function d(k) { return document.querySelector(\`[data-plan="\${k}"]\`); }
      function e(el) { return el.matches(".btn-pro"); }
      function f() { return $("#value-pulse-tag")?.classList.contains("is-free"); }
      function g() { return document.getElementById("banner")?.dataset.momentId; }
      function h() { return window.VTLicense?.getClaims?.(); }
      function i() { return localStorage.getItem("vt_license_v1"); }
    `),
    { a: "[data-plan]:1", b: "#btn-value-pro:1", c: "#btn-pricing:1", d: "[data-plan]:1", e: "btn-pro:1", f: "is-free:1", g: "dataset.momentId:1", h: "VTLicense:1", i: "vt_license_v1:1" }
  );
  assert.deepEqual(
    uses(`
      function a() { return !document.querySelector(".header-door.is-signed-in"); }
      function b() { $(".header-door")?.click(); }
      function c() { return window.VTLicense?.getClaims?.()?.accountId; }
      function d() { return localStorage.getItem("vt_sync_owner_v1"); }
    `, "account"),
    { a: "header-door:1", b: "header-door:1", c: "VTLicense:1", d: "vt_sync_owner_v1:1" }
  );
  // A class many elements share names no door, and a word inside running text is not a selector.
  assert.deepEqual(uses(`function a() { $(".btn-ghost").focus(); $(".modal-overlay").hidden = true; toast("Pro: is-free text"); }`), {});
  // A dialog shown by its own class; a note inside it is not the dialog, and hiding it is not opening it.
  assert.deepEqual(uses(`function a() { $(".account-overlay").hidden = false; }`, "account"), { a: "#account-modal:open:1" });
  assert.deepEqual(uses(`function a() { document.querySelector(".pricing-overlay").showModal(); }`), { a: "#pricing-modal:open:1" });
  assert.deepEqual(uses(`function a() { $("#pricing-modal .note").hidden = false; $(".pricing-overlay").hidden = true; }`), {});

  // A door found through a handler of its own name, an inline handler that shows the dialog, or a helper it calls.
  // A function that makes a listener which opens is not a door itself (the listener runs on its own click), and a
  // handler that opens nothing is not one.
  const app = `
    function bind() {
      $("#a")?.addEventListener("click", showPlans);
      $("#b")?.addEventListener("click", () => { $("#pricing-modal").hidden = false; });
      $("#c")?.addEventListener("click", () => later());
      $("#d")?.addEventListener("click", wire);
      $("#e")?.addEventListener("click", () => toast("hi"));
    }
    function showPlans() { note("plans"); openPricing(); }
    function later() { showPlans(); }
    function wire() { $("#f")?.addEventListener("click", () => openPricing()); }
  `;
  assert.deepEqual(openerHandles(app, OPENS_SALE, BILLING_HANDLES), ["#a", "#b", "#c", "#f"]);

  // AdSense's queue seeded where it is made, or added to by any array method, a borrowed push or a whole array.
  assert.deepEqual(
    [
      "window.adsbygoogle = window.adsbygoogle || [{ google_ad_client: c, enable_page_level_ads: true }];",
      "(window.adsbygoogle ||= []).unshift({ enable_page_level_ads: true });",
      "Array.prototype.push.call(window.adsbygoogle, { enable_page_level_ads: true });",
      "Array.prototype.push.apply(window.adsbygoogle, [{ enable_page_level_ads: true }]);",
      "window.adsbygoogle.splice(0, 0, { enable_page_level_ads: true });",
      "window.adsbygoogle = window.adsbygoogle.concat([{ enable_page_level_ads: true }]);"
    ].map(adPushes),
    [["2"], ["1"], ["1"], ["1"], ["1"], ["1"]]
  );
  assert.deepEqual(adPushes("(window.adsbygoogle = window.adsbygoogle || []).push({}); const other = [{ a: 1 }]; other.push({ b: 2 });"), ["0"], "the empty unit's push, and nothing from another array");

  // The plan's answer handed down: a helper given it is pinned, any number deep, and one given something else is not.
  const flow = answerFlow(
    `
      function start() { const ent = VTBilling.getEntitlement(); draw(ent.pro); other(1, label); }
      function draw(paid) { const locked = !paid; deeper(locked); }
      function deeper(x) { if (x) $("#btn-session-resume").disabled = true; }
      function other(n, s) {}
      function label() {}
    `,
    ["start"]
  );
  assert.deepEqual([...flow.readers].sort(), ["start"]);
  assert.deepEqual([...flow.handed.keys()].sort(), ["deeper", "draw"]);
});
