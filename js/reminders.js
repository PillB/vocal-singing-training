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

  // {min} is the practice the button starts: the loop's Mínimo, or 5 minutes in
  // the classic arm. A number written here would disagree with the button.
  const GENTLE_MESSAGES_ES = [
    "Unos minutos de voz te esperan cuando quieras.",
    "Hoy también cuenta: {min} minutos bastan para mantener el hábito.",
    "Tu estudio está listo. Sin presión — solo un rato de práctica."
  ];
  const GENTLE_MESSAGES_EN = [
    "A few minutes of voice when you’re ready.",
    "Today counts too: {min} minutes is enough to keep the habit.",
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

  /** Local calendar day. It was the UTC date, which in Lima turns over at 19:00. */
  function dayKey(d = new Date()) {
    if (global.VTDays?.dayKey) return global.VTDays.dayKey(d);
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }

  function practicedToday() {
    if (global.VTDays?.summary) return !!global.VTDays.summary().todayDone;
    const pulse = global.VTValuePulse?.compute?.();
    if (!pulse?.lastAt) return false;
    return dayKey(new Date(pulse.lastAt)) === dayKey();
  }

  /**
   * Calendar days since the last practice: 0 today, 1 yesterday. It used to
   * count elapsed 24-hour blocks, so a singer who practised at 20:00 and came
   * back at 19:00 the next evening was "0 days away".
   */
  function daysSinceLastPractice() {
    if (global.VTDays?.summary) {
      const s = global.VTDays.summary();
      if (s.todayDone) return 0;
      return s.daysAway;
    }
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

  /**
   * Minutes of the practice a reminder asks for: the loop's Mínimo when the
   * loop is on (3, or 5 in the dormant five-minute arm), else the classic
   * micro-session's 5.
   */
  function practiceMinutes(track = "singing") {
    try {
      const loop = global.VTLoop;
      if (loop?.enabled?.() && loop.routine) {
        const r = loop.routine(track, "min");
        if (r && r.totalSec > 0) return Math.max(1, Math.round(r.totalSec / 60));
      }
    } catch {
      /* fall through to the classic 5 */
    }
    return 5;
  }

  /** Which of the gentle messages: an index, so the choice outlives a language switch. */
  function pickMessageIndex() {
    return Math.floor(Math.random() * GENTLE_MESSAGES_EN.length);
  }

  /** The message at `index` in a language, with its minutes. */
  function messageAt(index, isEs, min) {
    const list = isEs ? GENTLE_MESSAGES_ES : GENTLE_MESSAGES_EN;
    const i = Number.isInteger(index) && index >= 0 && index < list.length ? index : 0;
    const n = Number.isFinite(min) && min > 0 ? min : practiceMinutes();
    return list[i].replace("{min}", String(n));
  }

  function pickMessage(isEs, min) {
    return messageAt(pickMessageIndex(), isEs, min);
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
   * `messageIndex` names the sentence, so a caller that keeps it can say it
   * again in whatever language is on screen later.
   * @param {boolean} isEs
   * @param {number} [min] minutes the reminder's button starts (default: practiceMinutes())
   * @returns {{ due: boolean, message: string, messageIndex: number, daysAway: number|null }}
   */
  function evaluate(isEs, min) {
    const cfg = getConfig();
    const daysAway = daysSinceLastPractice();
    const due = isDue(cfg);
    const messageIndex = pickMessageIndex();
    const message = messageAt(messageIndex, !!isEs, min);
    if (due && cfg.browserNotify) {
      const title = isEs ? "Estudio de voz" : "Voice studio";
      maybeBrowserNotify(title, message);
      markNotified();
    } else if (due) {
      // In-app only still counts as notified so we don't re-spam each paint
      // Caller can choose not to mark — we mark when banner shown
    }
    return { due, message, messageIndex, daysAway, cfg };
  }

  // ——— Rest days (the old "streak freeze") ———
  //
  // The freeze used to live here, and it did not work: it spent itself when the
  // last practice was 24–48 hours old — the evening after any practice — and the
  // streak never read it, so "racha protegida" was shown over a streak of 0.
  // Rest days now live in the practice-day ledger (js/practice-days.js): earned
  // by practising, spent only on a day that was really missed. These wrappers
  // keep the old names working for callers and specs.

  function freezeAllowance(isPro) {
    return isPro ? 3 : 2;
  }

  function freezesLeft() {
    const s = global.VTDays?.summary?.();
    return s ? s.rest.bank : 0;
  }

  function getFreezeState() {
    const s = global.VTDays?.summary?.();
    return s ? { bank: s.rest.bank, cap: s.rest.cap, justUsed: s.rest.justUsed } : { bank: 0 };
  }

  /**
   * Report a rest day the ledger has just spent, once.
   * @returns {{ applied: boolean, left: number, days?: string[], messageKey?: string }}
   */
  function tryApplyFreeze() {
    const s = global.VTDays?.summary?.();
    if (!s) return { applied: false, left: 0 };
    const used = s.rest.justUsed;
    if (!used) return { applied: false, left: s.rest.bank };
    global.VTDays.ackRest();
    return { applied: true, left: s.rest.bank, days: used.days, messageKey: "retain.freezeUsed" };
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

  /** The first event: "HH:MM" today, or tomorrow once that time has passed. */
  function firstStart(time) {
    const [hh, mm] = time.split(":").map(Number);
    const start = new Date();
    // An hour of 0 is midnight, not "missing": `hh || 18` made 00:30 into 18:30.
    start.setHours(Number.isFinite(hh) ? hh : 18, Number.isFinite(mm) ? mm : 0, 0, 0);
    if (start < new Date()) start.setDate(start.getDate() + 1);
    return start;
  }

  /**
   * @param {{ time?: string, freq?: 'DAILY'|'WEEKLY', isEs?: boolean, min?: number }} opts
   *   min: minutes the event says (default: practiceMinutes())
   */
  function buildIcs(opts = {}) {
    const isEs = !!opts.isEs;
    const time = opts.time || getConfig().times[0] || "18:00";
    const start = firstStart(time);
    const end = new Date(start.getTime() + 15 * 60000);
    const freq = opts.freq === "WEEKLY" ? "WEEKLY" : "DAILY";
    const min = Number.isFinite(opts.min) && opts.min > 0 ? opts.min : practiceMinutes();
    const summary = isEs
      ? `Práctica de voz · Estudio Vocal (${min} min)`
      : `Voice practice · Vocal Studio (${min} min)`;
    const desc = isEs
      ? "Recordatorio amable: abre el estudio y haz una micro-sesión. Sin presión."
      : "Kind reminder: open the studio for a micro-session. No pressure.";
    // One UID per cadence, so importing the file again updates the event
    // instead of adding a second one.
    const uid = "vt-practice-" + freq.toLowerCase() + "@vocal-studio";
    const now = new Date();
    const stamp =
      now.getUTCFullYear() +
      pad(now.getUTCMonth() + 1) +
      pad(now.getUTCDate()) +
      "T" +
      pad(now.getUTCHours()) +
      pad(now.getUTCMinutes()) +
      pad(now.getUTCSeconds()) +
      "Z";
    const url = opts.url || (global.location ? global.location.origin + global.location.pathname : "");
    const lines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Vocal Studio//Practice//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      "BEGIN:VEVENT",
      "UID:" + uid,
      "DTSTAMP:" + stamp,
      "DTSTART:" + toIcsDateLocal(start),
      "DTEND:" + toIcsDateLocal(end),
      "RRULE:FREQ=" + freq,
      "SUMMARY:" + summary,
      "DESCRIPTION:" + desc + (url ? " " + url : ""),
      ...(url ? ["URL:" + url] : []),
      // Many calendars stay silent without an alarm of their own.
      "BEGIN:VALARM",
      "ACTION:DISPLAY",
      "DESCRIPTION:" + summary,
      "TRIGGER:PT0M",
      "END:VALARM",
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
    practiceMinutes,
    messageAt,
    getFreezeState,
    freezesLeft,
    freezeAllowance,
    tryApplyFreeze,
    buildIcs,
    downloadIcs,
    pickMessage
  };
})(window);
