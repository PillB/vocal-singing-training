/**
 * Value pulse — aggregate practice proof for home + pricing + Pro insights.
 * Competence / investment signals (SDT + ethical “show progress before ask”).
 */
(function (global) {
  "use strict";

  function dayKey(iso) {
    try {
      return new Date(iso).toISOString().slice(0, 10);
    } catch {
      return null;
    }
  }

  function compute() {
    const progress = global.VTStorage?.getProgress?.() || {};
    const holds = global.VTStorage?.getHoldLogs?.() || [];
    const plan = global.VTStorage?.getWeekPlan?.() || null;

    let sessions = 0;
    let totalSec = 0;
    let exercisesTouched = 0;
    let lastScoreSum = 0;
    let lastScoreN = 0;
    const days = new Set();
    let lastAt = null;

    Object.keys(progress).forEach((exId) => {
      const row = progress[exId];
      if (!row) return;
      const count = Number(row.completedCount) || (row.history || []).length || 0;
      if (count > 0) exercisesTouched += 1;
      sessions += count;
      (row.history || []).forEach((h) => {
        totalSec += Number(h.durationSec) || 0;
        if (h.at) {
          const d = dayKey(h.at);
          if (d) days.add(d);
          if (!lastAt || h.at > lastAt) lastAt = h.at;
        }
        if (h.score != null && Number.isFinite(Number(h.score))) {
          lastScoreSum += Number(h.score);
          lastScoreN += 1;
        }
      });
      if (row.lastAt && (!lastAt || row.lastAt > lastAt)) lastAt = row.lastAt;
    });

    let bestHold = 0;
    holds.forEach((h) => {
      const s = Number(h.seconds) || 0;
      if (s > bestHold) bestHold = s;
      if (h.at) {
        const d = dayKey(h.at);
        if (d) days.add(d);
      }
    });

    // Streak: consecutive calendar days ending today or yesterday with activity
    const sortedDays = [...days].sort();
    let streak = 0;
    if (sortedDays.length) {
      const today = dayKey(new Date().toISOString());
      const yest = dayKey(new Date(Date.now() - 86400000).toISOString());
      let cursor = sortedDays.includes(today) ? today : sortedDays.includes(yest) ? yest : null;
      if (cursor) {
        const set = new Set(sortedDays);
        while (cursor && set.has(cursor)) {
          streak += 1;
          const prev = new Date(cursor + "T12:00:00Z");
          prev.setUTCDate(prev.getUTCDate() - 1);
          cursor = prev.toISOString().slice(0, 10);
        }
      }
    }

    const minutes = Math.round(totalSec / 60);
    const avgScore = lastScoreN ? lastScoreSum / lastScoreN : null;

    // Metric averages from recent history (for weakest-skill tip)
    const metricSums = {};
    const metricNs = {};
    Object.keys(progress).forEach((exId) => {
      (progress[exId].history || []).slice(0, 8).forEach((h) => {
        const m = h.metrics || {};
        Object.keys(m).forEach((k) => {
          const v = Number(m[k]);
          if (!Number.isFinite(v) || v < 1 || v > 5) return;
          metricSums[k] = (metricSums[k] || 0) + v;
          metricNs[k] = (metricNs[k] || 0) + 1;
        });
      });
    });
    let weakestMetric = null;
    let weakestAvg = 6;
    Object.keys(metricNs).forEach((k) => {
      const avg = metricSums[k] / metricNs[k];
      if (avg < weakestAvg) {
        weakestAvg = avg;
        weakestMetric = k;
      }
    });

    // 28-day sparkline buckets (sessions per day)
    const spark = [];
    const dayCounts = {};
    Object.keys(progress).forEach((exId) => {
      (progress[exId].history || []).forEach((h) => {
        const d = dayKey(h.at);
        if (d) dayCounts[d] = (dayCounts[d] || 0) + 1;
      });
    });
    for (let i = 27; i >= 0; i--) {
      const d = dayKey(new Date(Date.now() - i * 86400000).toISOString());
      spark.push(dayCounts[d] || 0);
    }

    const holdTrend = holds
      .slice(0, 5)
      .map((h) => Number(h.seconds) || 0)
      .reverse();

    // Sessions this ISO week (Mon-start approx via UTC day)
    const now = new Date();
    const day = (now.getUTCDay() + 6) % 7; // Mon=0
    const weekStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
    const weekKey = weekStart.toISOString().slice(0, 10);
    let sessionsThisWeek = 0;
    Object.keys(progress).forEach((exId) => {
      (progress[exId].history || []).forEach((h) => {
        if (h.at && h.at >= weekStart.toISOString()) sessionsThisWeek += 1;
      });
    });

    const goals = global.VTStorage?.getGoals?.() || { weeklySessionsTarget: 3 };
    const weeklyTarget = Math.max(1, Math.min(14, Number(goals.weeklySessionsTarget) || 3));

    return {
      sessions,
      minutes,
      totalSec,
      exercisesTouched,
      bestHoldSec: bestHold,
      activeDays: days.size,
      streak,
      lastAt,
      avgScore,
      planElement: plan?.element || null,
      planWeek: plan?.weekNumber || null,
      planStatus: plan?.status || "idle",
      checkIns: (plan?.checkIns || []).length,
      completedElements: (plan?.completedElements || []).length,
      spark,
      holdTrend,
      weakestMetric,
      weakestAvg: weakestMetric != null ? weakestAvg : null,
      sessionsThisWeek,
      weeklyTarget,
      weekKey,
      goalMet: sessionsThisWeek >= weeklyTarget
    };
  }

  function coachFocus(stats, isEs) {
    const s = stats || compute();
    if (s.sessions === 0) {
      return isEs
        ? "Empieza con un ejercicio básico y guarda la sesión para construir tu línea base."
        : "Start a basic exercise and save the session to build your baseline.";
    }
    if (s.streak < 2) {
      return isEs
        ? "Foco: practica 2 días seguidos — la consistencia supera la intensidad."
        : "Focus: practice 2 days in a row — consistency beats intensity.";
    }
    if (s.bestHoldSec > 0 && s.bestHoldSec < 5) {
      return isEs
        ? "Foco: sostenidos suaves ≥5s (aire libre, sin empujar)."
        : "Focus: easy holds ≥5s (free air, no push).";
    }
    if (s.weakestMetric) {
      return isEs
        ? `Foco: tu métrica más baja reciente es «${s.weakestMetric}» (~${s.weakestAvg.toFixed(1)}/5). Repite ese ejercicio con calma.`
        : `Focus: your lowest recent metric is “${s.weakestMetric}” (~${s.weakestAvg.toFixed(1)}/5). Revisit that drill calmly.`;
    }
    if (!s.goalMet) {
      return isEs
        ? `Foco: ${s.sessionsThisWeek}/${s.weeklyTarget} sesiones esta semana — completa el objetivo.`
        : `Focus: ${s.sessionsThisWeek}/${s.weeklyTarget} sessions this week — finish the goal.`;
    }
    return isEs
      ? "Buen ritmo. Exporta el pack coach o sube un peldaño (arpegio / progresión Pro)."
      : "Solid pace. Export the coach pack or step up (arpeggio / Pro progression).";
  }

  /**
   * Achievements — earned free; export/share is Pro.
   * @returns {{ id: string, unlocked: boolean, progress?: number }[]}
   */
  function achievements(stats) {
    const s = stats || compute();
    const plan = global.VTStorage?.getWeekPlan?.() || {};
    const flags = global.VTStorage?.getAchievementFlags?.() || {};
    const list = [
      { id: "first_save", unlocked: s.sessions >= 1 },
      { id: "sessions_5", unlocked: s.sessions >= 5 },
      { id: "streak_3", unlocked: s.streak >= 3 },
      { id: "hold_5", unlocked: s.bestHoldSec >= 5 },
      { id: "hold_10", unlocked: s.bestHoldSec >= 10 },
      { id: "exercises_5", unlocked: s.exercisesTouched >= 5 },
      { id: "plan_checkin", unlocked: (plan.checkIns || []).length >= 1 },
      { id: "goal_week", unlocked: !!s.goalMet },
      { id: "export_once", unlocked: !!flags.exported }
    ];
    return list;
  }

  /** Human narrative for Pro Insights / export (ES|EN via isEs flag). */
  function narrative(stats, isEs) {
    const s = stats || compute();
    if (!s.sessions && !s.bestHoldSec) {
      return isEs
        ? "Aún no hay sesiones guardadas. Completa un ejercicio y guarda métricas para ver tu progreso."
        : "No saved sessions yet. Finish an exercise and save metrics to see your progress.";
    }
    const parts = [];
    if (isEs) {
      parts.push(
        `Has completado ${s.sessions} sesión${s.sessions === 1 ? "" : "es"} en ${s.exercisesTouched} ejercicio${s.exercisesTouched === 1 ? "" : "s"}` +
          (s.minutes ? ` (~${s.minutes} min de práctica registrada)` : "") +
          "."
      );
      if (s.streak > 1) parts.push(`Racha activa: ${s.streak} días seguidos.`);
      else if (s.activeDays > 0) parts.push(`Días con práctica: ${s.activeDays}.`);
      if (s.bestHoldSec >= 2) {
        parts.push(`Mejor sostenido: ${s.bestHoldSec.toFixed(1)}s.`);
      }
      if (s.avgScore != null) {
        parts.push(`Puntaje medio reciente: ${s.avgScore.toFixed(1)}/5.`);
      }
      if (s.planElement) {
        parts.push(
          `Plan 12 semanas: semana ${s.planWeek || "—"}, foco «${s.planElement}» (${s.checkIns} registros).`
        );
      }
      parts.push(
        "Siguiente paso de coach: exporta este progreso o usa varios perfiles si entrenas a más de una voz."
      );
    } else {
      parts.push(
        `You've completed ${s.sessions} session${s.sessions === 1 ? "" : "s"} across ${s.exercisesTouched} exercise${s.exercisesTouched === 1 ? "" : "s"}` +
          (s.minutes ? ` (~${s.minutes} min logged)` : "") +
          "."
      );
      if (s.streak > 1) parts.push(`Active streak: ${s.streak} days.`);
      else if (s.activeDays > 0) parts.push(`Days with practice: ${s.activeDays}.`);
      if (s.bestHoldSec >= 2) parts.push(`Best hold: ${s.bestHoldSec.toFixed(1)}s.`);
      if (s.avgScore != null) parts.push(`Recent avg score: ${s.avgScore.toFixed(1)}/5.`);
      if (s.planElement) {
        parts.push(
          `12-week plan: week ${s.planWeek || "—"}, focus “${s.planElement}” (${s.checkIns} check-ins).`
        );
      }
      parts.push(
        "Coach next step: export this progress or use multi-profile if you train more than one voice."
      );
    }
    return parts.join(" ");
  }

  /**
   * Soft upgrade moment type after meaningful success.
   * Returns null if no prompt or already Pro / recently dismissed.
   */
  function suggestUpgradeMoment(stats, entitlement) {
    if (entitlement?.pro && entitlement?.source !== "trial") return null;
    const s = stats || compute();
    let trialDaysLeft = null;
    if (entitlement?.status === "trial" && entitlement.expiresAt) {
      trialDaysLeft = Math.max(
        0,
        Math.ceil((Date.parse(entitlement.expiresAt) - Date.now()) / 86400000)
      );
    }
    if (trialDaysLeft != null && trialDaysLeft <= 2) {
      return { id: "trial_ending", priority: 10, trialDaysLeft };
    }
    if (s.sessions >= 3 && s.sessions < 20) {
      return { id: "sessions_3", priority: 5, sessions: s.sessions };
    }
    if (s.bestHoldSec >= 8) {
      return { id: "hold_pr", priority: 4, bestHoldSec: s.bestHoldSec };
    }
    if (s.checkIns >= 2) {
      return { id: "plan_active", priority: 3 };
    }
    if (s.sessions === 1) {
      return { id: "first_save", priority: 2 };
    }
    return null;
  }

  function dismissedKey(id) {
    return `vt_value_prompt_${id}`;
  }

  function isDismissed(id) {
    try {
      return sessionStorage.getItem(dismissedKey(id)) === "1";
    } catch {
      return false;
    }
  }

  function dismiss(id) {
    try {
      sessionStorage.setItem(dismissedKey(id), "1");
    } catch {
      /* ignore */
    }
  }

  global.VTValuePulse = {
    compute,
    narrative,
    coachFocus,
    achievements,
    suggestUpgradeMoment,
    isDismissed,
    dismiss
  };
})(window);
