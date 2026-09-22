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
    }
  };
})(window);
