/**
 * Experiment definitions — edit this file to run a test, no code change needed.
 *
 * Shape: each entry is `{ key, enabled, variants: [{ id, weight }] }`.
 * `variants[0]` is the control and is what everybody gets while `enabled` is
 * false, so the assignment code path runs in production from day one without
 * anybody being put in a treatment arm.
 *
 * Reading a result needs somewhere for events to land. Until
 * `VT_ANALYTICS_ENDPOINT` below is set, events stay in `localStorage` on each
 * visitor's own device (js/analytics.js) and nobody else can read them, so
 * turning an experiment on splits the audience without producing a result.
 * Once the entitlements worker is deployed, set the endpoint to
 * `<worker URL>/v1/events`; results are then in the account panel for an
 * admin, and at GET /v1/admin/experiments/results?experiment=<key>. Run
 * `aa_2026_10` first. The whole procedure is in docs/38-AB-TESTING.md.
 *
 * The worker keeps the other half of each entry: EXPERIMENT_PRESETS in
 * workers/entitlements/src/events.js lists the same keys, arm ids and weights
 * (a test fails if they differ), what each test is judged on, and its plan —
 * how many people per arm and how many days before the result opens. An
 * experiment missing there splits the audience but records no exposures.
 */
(function (global) {
  "use strict";

  /**
   * Where anonymous events are sent, e.g.
   * "https://vocal-studio-entitlements.<you>.workers.dev/v1/events".
   * Empty sends nothing. Visitors with Global Privacy Control, Do Not Track or
   * the guide's opt-out never send, whatever this says.
   */
  if (typeof global.VT_ANALYTICS_ENDPOINT !== "string") {
    global.VT_ANALYTICS_ENDPOINT = "";
  }

  global.VT_EXPERIMENTS = {
    /**
     * A/A check: two identical arms. Switch this on alone, first, after the
     * endpoint is live. Plan: 150 per arm, at least 14 days. The split should
     * be even (no SRM flag), no event should be flagged as counted differently,
     * and the arms should not differ; if any of that fails, assignment or
     * logging is broken and no real test result can be trusted yet. One A/A
     * in twenty shows p < 0.05 by chance: run it again before digging.
     */
    aa_2026_10: {
      enabled: false,
      variants: [
        { id: "a", weight: 1 },
        { id: "b", weight: 1 }
      ]
    },

    /**
     * Does a first-time visitor do better when the tour opens itself, or when
     * it waits to be asked for?
     *
     * control "invite" — no auto-start. The start panel carries a dismissible
     *   line offering the tour or the written guide.
     * treatment "auto" — the tour opens itself ~600ms after a first visit.
     *
     * Primary: share with a `first_win` (the first rated save, js/app.js) in
     * their first 7 days. Guardrails: share with a practice day in the first
     * 7 days, and on the first day. The tour's own events (`tour_start`,
     * `tour_dismiss`...) are what the arms change, so they are never compared.
     * Plan: 160 per arm, at least 14 days.
     */
    tour_shape_2026_10: {
      enabled: false,
      variants: [
        { id: "invite", weight: 1 },
        { id: "auto", weight: 1 }
      ]
    },

    /*
     * The daily loop's three tests (js/daily-loop.js, docs/37-DAILY-LOOP.md).
     *
     * Sample sizes are per arm, two-sided alpha 0.05, 80% power, for a share
     * of people: n = 7.84 * (p1(1-p1) + p2(1-p2)) / (p1 - p2)^2.
     *   30% -> 45% needs ~160;  30% -> 40% needs ~355;  30% -> 36% needs ~960.
     * For practice days in a person's first 28 days (a count; assume mean 6,
     * SD 6): +1.5 days needs ~250, +1 day needs ~565.
     * A friends-and-family beta of a few hundred can therefore only see big
     * effects. Run one test at a time, read it after 28 days per person, and
     * say "no detectable difference" rather than "no difference".
     */

    /**
     * The structural bet: does the loop bring people back?
     *
     * control "loop" — today's basics own the start panel once a day is sung.
     * treatment "classic" — the panel as it was: next exercise or daily class.
     *   The loop's data still records in both arms, and the bug fixes under it
     *   (practice kept on every exit, local days, rest days) apply to both.
     *   `practice_day` is sent in both arms too; the loop's own events
     *   (`basics_complete`...) exist only in the loop arm, so they are never
     *   compared.
     *
     * Primary: share with a `practice_day` in the fourth week after first
     * seeing the start panel (days 21-27). Guardrails: practice days in the
     * first 28, and the share who refuse the microphone.
     * Plan: 355 per arm (30% -> 40%), at least 28 days.
     * Control is listed first because it is what ships.
     */
    loop_home_2026_10: {
      enabled: false,
      variants: [
        { id: "loop", weight: 1 },
        { id: "classic", weight: 1 }
      ]
    },

    /**
     * Do sparse surprises help, or are they noise?
     *
     * control "surprises" — about one finished routine in five, guaranteed on
     *   a comeback and after seven without one.
     * treatment "none" — the same loop with no surprises at all.
     *
     * Primary: practice days in the 28 after the first finished routine.
     * Guardrail: finished routines (`basics_complete` days) in the same 28.
     * Plan: 250 per arm (+1.5 days), at least 28 days.
     *
     * Surprises fire repeatedly, so this is a natural micro-randomised trial:
     * randomising per finished routine instead of per browser, with the
     * outcome "practised again within 48 hours", would need roughly 40 people,
     * not hundreds (Klasnja et al. 2015). The worker does not do that yet.
     */
    loop_surprise_2026_10: {
      enabled: false,
      variants: [
        { id: "surprises", weight: 1 },
        { id: "none", weight: 1 }
      ]
    },

    /**
     * How small can the daily minimum be and still hold?
     *
     * control "three" — trills and trill solfège, 90 s each.
     * treatment "five" — the same two, 150 s each.
     *
     * Primary: practice days in the 28 after first starting the Mínimo.
     * Guardrail: the share who leave a Mínimo unfinished (`basics_incomplete`).
     * Plan: 565 per arm (+1 day), at least 28 days. Expect a small effect
     * either way; this is only worth running with that many people.
     */
    loop_minimo_len_2026_10: {
      enabled: false,
      variants: [
        { id: "three", weight: 1 },
        { id: "five", weight: 1 }
      ]
    }
  };
})(window);
