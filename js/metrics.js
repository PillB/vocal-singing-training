/**
 * Exercise scoring from rubrics — transparent & non-judgmental
 */
(function (global) {
  "use strict";

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  /** Score card copy in the interface language (js/i18n.js "metrics.*"). */
  function tt(key, vars) {
    return global.VTI18n?.t?.(key, vars) ?? key;
  }

  /** 90 → "1:30" */
  function clock(sec) {
    sec = Math.max(0, Math.round(sec));
    return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
  }

  const Metrics = {
    /** Practice time in minutes (duration, minutes with the straw): scored from the clock. */
    isTimeMetric(m) {
      return !!m && m.type === "number" && m.unit === "min";
    },

    /**
     * @param {Array} metricDefs from exercise
     * @param {Object} values user-entered values
     * @param {{ timeSec?: number, targetSec?: number }} [opts]
     *   timeSec: how long the take ran, used for a time metric left blank;
     *   targetSec: the length it was asked for (a guided step's own timer),
     *   which replaces the catalog's minutes. A 1:30 step used to be scored
     *   against 5 minutes and came out 2/5.
     * @returns {{ score: number, max: number, pct: number, breakdown: Array, summary: string }}
     */
    compute(metricDefs, values, opts = {}) {
      if (!metricDefs || !metricDefs.length) {
        return {
          score: 0,
          max: 0,
          pct: 0,
          breakdown: [],
          summary: tt("metrics.none")
        };
      }

      let total = 0;
      let max = 0;
      const breakdown = [];

      for (const m of metricDefs) {
        const raw = values[m.id];
        const val = raw === "" || raw == null ? null : Number(raw);
        let points = 0;
        let mMax = 5;
        let detail = "";
        let skipped = false;

        if (Metrics.isTimeMetric(m)) {
          const typed = val == null || Number.isNaN(val) ? null : val * 60;
          const sec = typed > 0 ? typed : opts.timeSec > 0 ? opts.timeSec : typed;
          const goal = opts.targetSec > 0 ? opts.targetSec : (m.target != null ? Number(m.target) : 1) * 60;
          if (sec == null) {
            skipped = true;
          } else {
            points = clamp((sec / goal) * 5, 0, 5);
            detail = tt("metrics.timeOf", { done: clock(sec), total: clock(goal) }) + (sec >= goal - 1 ? " ✓" : "");
          }
        } else if (m.type === "scale") {
          mMax = m.max || 5;
          const v = val == null ? 0 : clamp(val, m.min || 1, mMax);
          points = v;
          detail = val == null ? tt("metrics.notRated") : `${v} / ${mMax}`;
        } else if (m.type === "number") {
          mMax = 5;
          const target = m.target != null ? Number(m.target) : 1;
          if (val == null || Number.isNaN(val)) {
            // A count left blank was not counted, so it is not scored as a
            // zero: one tap on "Fácil" used to come out 5/10.
            skipped = true;
          } else if (target <= 0) {
            // e.g. filler count: lower is better
            points = clamp(5 - Math.min(5, val / 2), 0, 5);
            detail = tt("metrics.lowerBetter", { val: `${val}${m.unit ? " " + m.unit : ""}` });
          } else if (m.id === "breathiness") {
            // already scale-like if mis-typed
            points = clamp(val, 0, 5);
            detail = `${val}`;
          } else {
            const ratio = clamp(val / target, 0, 1.2);
            points = clamp(ratio * 5, 0, 5);
            const unit = m.unit ? " " + m.unit : "";
            detail = tt("metrics.vsTarget", { val: `${val}${unit}`, target: `${target}${unit}` });
          }
        }

        if (skipped) {
          points = 0;
          mMax = 0;
          detail = tt("metrics.notCounted");
        }
        total += points;
        max += mMax;
        breakdown.push({
          id: m.id,
          label: m.label,
          points: Math.round(points * 10) / 10,
          max: mMax,
          detail,
          skipped
        });
      }

      const pct = max > 0 ? Math.round((total / max) * 100) : 0;
      const score = Math.round((total / (max || 1)) * 100) / 10; // 0–10 style

      let summary;
      if (pct >= 85) summary = tt("metrics.sum.strong");
      else if (pct >= 65) summary = tt("metrics.sum.solid");
      else if (pct >= 40) summary = tt("metrics.sum.start");
      else summary = tt("metrics.sum.low");

      return {
        score: clamp(score, 0, 10),
        // Nothing scored (every count left blank) reads "—", not 0 / 10.
        max: max > 0 ? 10 : 0,
        pct,
        breakdown,
        summary,
        how: tt("metrics.how")
      };
    },

    clock,

    formatScore(result) {
      if (!result || result.max === 0) return "—";
      return `${result.score.toFixed(1)} / 10`;
    }
  };

  global.VTMetrics = Metrics;
})(window);
