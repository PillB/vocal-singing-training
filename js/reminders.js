/**
 * Gentle practice reminders + calendar ICS + streak freeze helpers.
 * Research: users want consistency tools but hate guilt/shame notifications
 * (r/duolingo). Tone is always supportive. No forced social nudges.
 *
 * SPA limits: true closed-tab push needs a push server. We offer:
 * - In-app due banners when the site is opened
 * - Optional browser Notification when permission granted (on due check)
 * - ICS export into the OS calendar (most reliable offline habit)
 */
(function (global) {
  "use strict";

  const LS_KEY = "vt_reminders_v1";
  const FREEZE_KEY = "vt_streak_freeze_v1";

  const GENTLE_MESSAGES_ES = [
    "Unos minutos de voz te esperan cuando quieras.",
    "Hoy también cuenta: 5 minutos bastan para mantener el hábito.",
    "Tu estudio está listo. Sin presión — solo un rato de práctica."
  ];
  const GENTLE_MESSAGES_EN = [
    "A few minutes of voice when you’re ready.",
    "Today counts too: 5 minutes is enough to keep the habit.",
    "Your studio is ready. No pressure — just a short practice."
  ];

  function read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* ignore */
    }
  }

  function defaultReminders() {
    return {
      enabled: false,
      times: ["18:00"],
      days: [0, 1, 2, 3, 4, 5, 6], // 0=Sun
      lastNotifiedDay: null,
      browserNotify: false
    };
  }

  function getConfig() {
    const c = read(LS_KEY, null);
    if (!c || typeof c !== "object") return defaultReminders();
    return {
      ...defaultReminders(),
      ...c,
      times: Array.isArray(c.times) && c.times.length ? c.times.slice(0, 2) : ["18:00"],
      days: Array.isArray(c.days) ? c.days : defaultReminders().days
    };
  }

  function setConfig(partial) {
    const next = { ...getConfig(), ...partial };
    if (Array.isArray(next.times)) next.times = next.times.slice(0, 2);
    write(LS_KEY, next);
    return next;
  }

  function dayKey(d = new Date()) {
    return d.toISOString().slice(0, 10);
  }

  function practicedToday() {
    const pulse = global.VTValuePulse?.compute?.();
    if (!pulse?.lastAt) return false;
    return dayKey(new Date(pulse.lastAt)) === dayKey();
  }

  function daysSinceLastPractice() {
    const pulse = global.VTValuePulse?.compute?.();
    if (!pulse?.lastAt) return null;
    const t0 = Date.parse(pulse.lastAt);
    if (!Number.isFinite(t0)) return null;
    return Math.floor((Date.now() - t0) / 86400000);
  }

  function isDayEnabled(cfg, date = new Date()) {
    return (cfg.days || []).includes(date.getDay());
  }

  function timeToMinutes(hhmm) {
    const m = String(hhmm || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    return Number(m[1]) * 60 + Number(m[2]);
  }

  /** True if any configured time has passed today and we haven't notified yet. */
  function isDue(cfg, now = new Date()) {
    if (!cfg?.enabled) return false;
    if (!isDayEnabled(cfg, now)) return false;
    if (practicedToday()) return false;
    if (cfg.lastNotifiedDay === dayKey(now)) return false;
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const times = cfg.times || [];
    return times.some((t) => {
      const m = timeToMinutes(t);
      return m != null && nowMin >= m;
    });
  }

  function pickMessage(isEs) {
    const list = isEs ? GENTLE_MESSAGES_ES : GENTLE_MESSAGES_EN;
    return list[Math.floor(Math.random() * list.length)];
  }

  function markNotified() {
    const c = getConfig();
    c.lastNotifiedDay = dayKey();
    write(LS_KEY, c);
  }

  async function requestBrowserPermission() {
    if (!("Notification" in global)) return "unsupported";
    if (Notification.permission === "granted") return "granted";
    if (Notification.permission === "denied") return "denied";
    try {
      return await Notification.requestPermission();
    } catch {
      return "denied";
    }
  }

  function maybeBrowserNotify(title, body) {
    if (!("Notification" in global)) return false;
    if (Notification.permission !== "granted") return false;
    try {
      // eslint-disable-next-line no-new
      new Notification(title, { body, silent: false });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Evaluate due state; optionally fire browser notification once per day.
   * @returns {{ due: boolean, message: string, daysAway: number|null }}
   */
  function evaluate(isEs) {
    const cfg = getConfig();
    const daysAway = daysSinceLastPractice();
    const due = isDue(cfg);
    const message = pickMessage(!!isEs);
    if (due && cfg.browserNotify) {
      const title = isEs ? "Estudio de voz" : "Voice studio";
      maybeBrowserNotify(title, message);
      markNotified();
    } else if (due) {
      // In-app only still counts as notified so we don't re-spam each paint
      // Caller can choose not to mark — we mark when banner shown
    }
    return { due, message, daysAway, cfg };
  }

  // ——— Streak freeze (gentle, anti-guilt) ———

  function weekKey() {
    const now = new Date();
    const day = (now.getUTCDay() + 6) % 7;
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - day));
    return start.toISOString().slice(0, 10);
  }

  function getFreezeState() {
    const st = read(FREEZE_KEY, null) || { weekKey: weekKey(), used: 0 };
    if (st.weekKey !== weekKey()) return { weekKey: weekKey(), used: 0 };
    return st;
  }

  function freezeAllowance(isPro) {
    return isPro ? 3 : 1;
  }

  function freezesLeft(isPro) {
    const st = getFreezeState();
    return Math.max(0, freezeAllowance(isPro) - (st.used || 0));
  }

  /**
   * If user missed exactly 1 day and has freezes, consume one and treat streak as continuous.
   * @returns {{ applied: boolean, left: number, messageKey?: string }}
   */
  function tryApplyFreeze(isPro) {
    const days = daysSinceLastPractice();
    const left = freezesLeft(isPro);
    if (days !== 1 || left <= 0) return { applied: false, left };
    const st = getFreezeState();
    // Only one freeze per calendar day of application
    if (st.lastAppliedDay === dayKey()) return { applied: false, left };
    st.used = (st.used || 0) + 1;
    st.weekKey = weekKey();
    st.lastAppliedAt = new Date().toISOString();
    st.lastAppliedDay = dayKey();
    write(FREEZE_KEY, st);
    return { applied: true, left: freezesLeft(isPro), messageKey: "retain.freezeUsed" };
  }

  // ——— ICS calendar ———

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function toIcsDateLocal(d) {
    return (
      d.getFullYear() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) +
      "T" +
      pad(d.getHours()) +
      pad(d.getMinutes()) +
      "00"
    );
  }

  /**
   * @param {{ time?: string, freq?: 'DAILY'|'WEEKLY', isEs?: boolean }} opts
   */
  function buildIcs(opts = {}) {
    const isEs = !!opts.isEs;
    const time = opts.time || getConfig().times[0] || "18:00";
    const [hh, mm] = time.split(":").map(Number);
    const start = new Date();
    start.setHours(hh || 18, mm || 0, 0, 0);
    if (start < new Date()) start.setDate(start.getDate() + 1);
    const end = new Date(start.getTime() + 15 * 60000);
    const freq = opts.freq === "WEEKLY" ? "WEEKLY" : "DAILY";
    const summary = isEs
      ? "Práctica de voz · Estudio Vocal (10–15 min)"
      : "Voice practice · Vocal Studio (10–15 min)";
    const desc = isEs
      ? "Recordatorio amable: abre el estudio y haz una micro-sesión. Sin presión."
      : "Kind reminder: open the studio for a micro-session. No pressure.";
    const uid = "vt-practice-" + Date.now() + "@vocal-studio";
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Vocal Studio//Practice//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:" + uid,
      "DTSTAMP:" + toIcsDateLocal(new Date()) + "Z",
      "DTSTART:" + toIcsDateLocal(start),
      "DTEND:" + toIcsDateLocal(end),
      "RRULE:FREQ=" + freq,
      "SUMMARY:" + summary,
      "DESCRIPTION:" + desc,
      "END:VEVENT",
      "END:VCALENDAR"
    ];
    return lines.join("\r\n");
  }

  function downloadIcs(opts) {
    const body = buildIcs(opts);
    const blob = new Blob([body], { type: "text/calendar;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "vocal-studio-practice.ics";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  global.VTReminders = {
    getConfig,
    setConfig,
    evaluate,
    markNotified,
    isDue,
    practicedToday,
    daysSinceLastPractice,
    requestBrowserPermission,
    maybeBrowserNotify,
    getFreezeState,
    freezesLeft,
    freezeAllowance,
    tryApplyFreeze,
    buildIcs,
    downloadIcs,
    pickMessage
  };
})(window);
