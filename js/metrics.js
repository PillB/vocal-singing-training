/**
 * Exercise scoring from rubrics — transparent & non-judgmental
 */
(function (global) {
  "use strict";

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  const Metrics = {
    /**
     * @param {Array} metricDefs from exercise
     * @param {Object} values user-entered values
     * @returns {{ score: number, max: number, pct: number, breakdown: Array, summary: string }}
     */
    compute(metricDefs, values) {
      if (!metricDefs || !metricDefs.length) {
        return {
          score: 0,
          max: 0,
          pct: 0,
          breakdown: [],
          summary: "No metrics for this exercise — reflection notes still count."
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

        if (m.type === "scale") {
          mMax = m.max || 5;
          const v = val == null ? 0 : clamp(val, m.min || 1, mMax);
          points = v;
          detail = val == null ? "Not rated" : `${v} / ${mMax}`;
        } else if (m.type === "number") {
          mMax = 5;
          const target = m.target != null ? Number(m.target) : 1;
          if (val == null || Number.isNaN(val)) {
            points = 0;
            detail = "Not logged";
          } else if (target <= 0) {
            // e.g. filler count: lower is better
            points = clamp(5 - Math.min(5, val / 2), 0, 5);
            detail = `${val}${m.unit ? " " + m.unit : ""} (lower is better)`;
          } else if (m.id === "breathiness") {
            // already scale-like if mis-typed
            points = clamp(val, 0, 5);
            detail = `${val}`;
          } else {
            const ratio = clamp(val / target, 0, 1.2);
            points = clamp(ratio * 5, 0, 5);
            detail = `${val}${m.unit ? " " + m.unit : ""} · target ${target}${m.unit ? " " + m.unit : ""}`;
          }
        }

        total += points;
        max += mMax;
        breakdown.push({
          id: m.id,
          label: m.label,
          points: Math.round(points * 10) / 10,
          max: mMax,
          detail
        });
      }

      const pct = max > 0 ? Math.round((total / max) * 100) : 0;
      const score = Math.round((total / (max || 1)) * 100) / 10; // 0–10 style

      let summary;
      if (pct >= 85) summary = "Strong session — keep this consistency.";
      else if (pct >= 65) summary = "Solid work. One small focus next time will lift this further.";
      else if (pct >= 40) summary = "Good start. Progress often looks like this before it clicks.";
      else summary = "You showed up — that matters. Try a shorter, clearer focus next round.";

      return {
        score: clamp(score, 0, 10),
        max: 10,
        pct,
        breakdown,
        summary,
        how:
          "Score is a friendly 0–10 derived from your self-ratings and logged numbers vs. exercise targets. It is a practice compass, not a talent grade."
      };
    },

    formatScore(result) {
      if (!result || result.max === 0) return "—";
      return `${result.score.toFixed(1)} / 10`;
    }
  };

  global.VTMetrics = Metrics;
})(window);
