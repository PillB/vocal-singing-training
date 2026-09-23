/**
 * Experiment definitions — edit this file to run a test, no code change needed.
 *
 * Shape: each entry is `{ key, enabled, variants: [{ id, weight }] }`.
 * `variants[0]` is the control and is what everybody gets while `enabled` is
 * false, so the assignment code path runs in production from day one without
 * anybody being put in a treatment arm.
 *
 * Honest limit, recorded here because it decides whether flipping `enabled`
 * is worth it: this site has no analytics backend. Events land in
 * `localStorage` on the visitor's own device (js/analytics.js) and nobody but
 * that visitor can read them. Turning an experiment on splits the audience
 * but does not, on its own, produce a result anyone can look at. See
 * docs/36-TOUR-AND-USER-GUIDE.md for what reading a result would take.
 */
(function (global) {
  "use strict";

  global.VT_EXPERIMENTS = {
    /**
     * Does a first-time visitor do better when the tour opens itself, or when
     * it waits to be asked for?
     *
     * control "invite" — no auto-start. The start panel carries a dismissible
     *   line offering the tour or the written guide.
     * treatment "auto" — the tour opens itself ~600ms after a first visit.
     *
     * Compare `tour_complete` / `tour_start` between arms, and `first_win`
     * (js/app.js) as the outcome that actually matters.
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
     *
     * Primary: share who practise on some day in days 22-28 after their first
     * practice day (`practice_day` events). Guardrail: `basics_complete` per
     * person must not fall in the loop arm.
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
     * Surprises fire repeatedly, so this is a natural micro-randomised trial:
     * when an endpoint exists, randomise per finished routine instead of per
     * browser, and the outcome becomes "practised again within 48 hours".
     * That design needs roughly 40 people, not hundreds (Klasnja et al. 2015).
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
     * Primary: practice days in the first 28 days. Expect a small effect
     * either way; this is only worth running with an endpoint and ~500+
     * people per arm.
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
