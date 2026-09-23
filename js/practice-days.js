/**
 * Practice days — the ledger the daily loop stands on.
 *
 * One row per local calendar day on which anything was practised, kept apart
 * from `vt_progress_v1` for three reasons the old streak ran into:
 *
 * - Days are **local**. Everything before this counted UTC days, so in Lima
 *   (UTC−5) the day turned over at 19:00 and an evening singer who practised
 *   Monday at 18:00 and Tuesday at 20:00 had a one-day streak.
 * - The ledger is **not capped**. Progress history keeps the newest 50 takes per
 *   exercise, so a streak built from it could never pass about 50 days.
 * - Practice is recorded however it happened (a rated save, a guided step, a
 *   timer running out), not only when somebody pressed Save.
 *
 * Rest days replace the old "freeze", which spent itself on the day after any
 * practice and never actually protected the streak. A rest day is earned by
 * practising (one per six practice days), is spent only on a day that was
 * really missed, and is framed as what it is for a voice: rest.
 */
(function (global) {
  "use strict";

  /** Practice days that earn one rest day. */
  const DAYS_PER_REST = 6;
  /** Rest days a browser starts with, so a new habit survives its first bad day. */
  const STARTING_REST = 1;
  /** Most rest days that can be banked. Pro keeps one more (see restCap). */
  const REST_CAP_FREE = 2;
  const REST_CAP_PRO = 3;
  /** Exercise ids remembered per day — enough for a full class run. */
  const EX_PER_DAY = 24;
  /**
   * Lifetime practice-day counts worth marking. Close together early, when a
   * habit is fragile, and further apart once it is not.
   */
  const MILESTONES = [1, 3, 7, 14, 21, 30, 50, 75, 100, 150, 200, 250, 300, 365, 500, 730, 1000];

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  /** Local calendar day, `YYYY-MM-DD`. */
  function dayKey(d = new Date()) {
    const x = d instanceof Date ? d : new Date(d);
    if (!Number.isFinite(x.getTime())) return null;
    return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
  }

  /** Local noon of a day key. Noon keeps DST shifts from moving the date. */
  function parseDay(key) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ""));
    if (!m) return null;
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  }

  function addDays(key, n) {
    const d = parseDay(key);
    if (!d) return null;
    d.setDate(d.getDate() + n);
    return dayKey(d);
  }

  /** Whole days from `a` to `b` (positive when b is later). */
  function diffDays(a, b) {
    const da = parseDay(a);
    const db = parseDay(b);
    if (!da || !db) return 0;
    return Math.round((db - da) / 86400000);
  }

  /** Monday of the week holding `key` — the week a Peruvian calendar shows. */
  function weekStart(key) {
    const d = parseDay(key);
    if (!d) return null;
    const dow = (d.getDay() + 6) % 7; // Mon = 0
    d.setDate(d.getDate() - dow);
    return dayKey(d);
  }

  function emptyBag() {
    return {
      v: 1,
      days: {},
      rest: { bank: STARTING_REST, earnedAt: 0, used: [] },
      backfilled: false
    };
  }

  function normalize(bag) {
    const b = bag && typeof bag === "object" ? bag : emptyBag();
    if (!b.days || typeof b.days !== "object") b.days = {};
    if (!b.rest || typeof b.rest !== "object") b.rest = { bank: STARTING_REST, earnedAt: 0, used: [] };
    if (!Array.isArray(b.rest.used)) b.rest.used = [];
    b.rest.bank = Math.max(0, Number(b.rest.bank) || 0);
    b.rest.earnedAt = Math.max(0, Number(b.rest.earnedAt) || 0);
    b.v = 1;
    return b;
  }

  function readRaw() {
    return normalize(global.VTStorage?.getDays?.());
  }

  function write(bag) {
    try {
      global.VTStorage?.setDays?.(bag);
    } catch {
      /* quota or private mode: the ledger is a convenience, never a crash */
    }
  }

  function isPro() {
    try {
      return !!global.VTBilling?.can?.("extra_freezes") || !!global.VTBilling?.isPro?.();
    } catch {
      return false;
    }
  }

  function restCap() {
    return isPro() ? REST_CAP_PRO : REST_CAP_FREE;
  }

  /** A day counts once anything was practised or deliberately logged on it. */
  function counts(row) {
    return !!row && ((Number(row.n) || 0) > 0 || (Number(row.sec) || 0) >= 60 || !!row.saved);
  }

  /**
   * First read on a browser with history but no ledger: rebuild the days from
   * saved takes and held notes, so a returning singer keeps the days they
   * already practised. Runs once; its only job is not to lose the past.
   */
  function backfill(bag) {
    if (bag.backfilled) return false;
    const progress = global.VTStorage?.getProgress?.() || {};
    const holds = global.VTStorage?.getHoldLogs?.() || [];
    const touch = (iso, patch) => {
      const k = dayKey(new Date(iso));
      if (!k) return;
      const row = bag.days[k] || (bag.days[k] = { sec: 0, n: 0, ex: [] });
      if (patch.sec) row.sec += patch.sec;
      if (patch.n) row.n += patch.n;
      if (patch.saved) row.saved = true;
      if (patch.ex && !row.ex.includes(patch.ex) && row.ex.length < EX_PER_DAY) row.ex.push(patch.ex);
    };
    Object.keys(progress).forEach((exId) => {
      (progress[exId]?.history || []).forEach((h) => {
        if (!h?.at) return;
        touch(h.at, { sec: Math.max(0, Number(h.durationSec) || 0), n: 1, saved: true, ex: exId });
      });
    });
    holds.forEach((h) => {
      if (h?.at) touch(h.at, { sec: Math.max(0, Number(h.seconds) || 0), n: 1 });
    });
    // Rest days earned by the past are credited, so a long-time user does not
    // start the new system with less slack than a newcomer.
    const total = Object.values(bag.days).filter(counts).length;
    const earned = Math.floor(total / DAYS_PER_REST);
    bag.rest.bank = Math.min(REST_CAP_FREE, bag.rest.bank + earned);
    bag.rest.earnedAt = earned * DAYS_PER_REST;
    bag.backfilled = true;
    return true;
  }

  /**
   * Bank a rest day for every six practice days since the last one was earned.
   * Idempotent: `earnedAt` remembers where the count had reached.
   */
  function earnRest(bag) {
    const total = Object.values(bag.days).filter(counts).length;
    let changed = false;
    while (total - bag.rest.earnedAt >= DAYS_PER_REST) {
      bag.rest.earnedAt += DAYS_PER_REST;
      if (bag.rest.bank < restCap()) bag.rest.bank += 1;
      changed = true;
    }
    return changed;
  }

  function covered(bag, key) {
    return counts(bag.days[key]) || bag.rest.used.includes(key);
  }

  function lastPracticeBefore(bag, key) {
    let best = null;
    Object.keys(bag.days).forEach((k) => {
      if (k < key && counts(bag.days[k]) && (!best || k > best)) best = k;
    });
    return best;
  }

  /**
   * Spend rest days on the days that were really missed — and only when the
   * bank can cover every one of them. Half-covering a three-day gap would burn
   * two rest days on a streak that breaks anyway.
   *
   * Only past days are ever covered: today is still open.
   */
  function applyRest(bag, today) {
    const last = lastPracticeBefore(bag, today);
    if (!last) return false;
    const gap = [];
    for (let k = addDays(last, 1); k && k < today; k = addDays(k, 1)) {
      if (!covered(bag, k)) gap.push(k);
      if (gap.length > REST_CAP_PRO) break;
    }
    if (!gap.length || gap.length > bag.rest.bank) return false;
    gap.forEach((k) => bag.rest.used.push(k));
    bag.rest.bank -= gap.length;
    bag.rest.used = bag.rest.used.slice(-120);
    bag.restJustUsed = { days: gap.slice(), on: today };
    return true;
  }

  /**
   * Read the ledger, doing the once-per-read housekeeping (backfill, earning,
   * spending rest) and saving only if something changed.
   */
  function read(opts = {}) {
    const bag = readRaw();
    const today = opts.today || dayKey();
    let changed = backfill(bag);
    changed = earnRest(bag) || changed;
    changed = applyRest(bag, today) || changed;
    if (changed) write(bag);
    return bag;
  }

  /**
   * Record practice on today's row.
   * @param {{ exerciseId?: string, sec?: number, saved?: boolean, bump?: boolean, source?: string }} rec
   * @returns {{ day: string, becameDay: boolean, row: object }}
   *   `becameDay` is true for the record that turned today into a practice day —
   *   the moment worth marking.
   */
  function record(rec = {}) {
    const bag = read();
    const k = dayKey();
    const row = bag.days[k] || (bag.days[k] = { sec: 0, n: 0, ex: [] });
    const before = counts(row);
    row.sec = Math.round((Number(row.sec) || 0) + Math.max(0, Number(rec.sec) || 0));
    // `bump: false` adds time to a take already counted (a rated save of an
    // auto-recorded step), so one take is one take however often it is touched.
    if (rec.bump !== false) row.n = (Number(row.n) || 0) + 1;
    if (rec.saved) row.saved = true;
    if (!Array.isArray(row.ex)) row.ex = [];
    if (rec.exerciseId && !row.ex.includes(rec.exerciseId) && row.ex.length < EX_PER_DAY) {
      row.ex.push(rec.exerciseId);
    }
    earnRest(bag);
    write(bag);
    return { day: k, becameDay: !before && counts(row), row };
  }

  /**
   * Mark today's basics routine as finished.
   * @returns {{ first: boolean, day: string }} first — the first finish today.
   */
  function markBasics(meta = {}) {
    const bag = read();
    const k = dayKey();
    const row = bag.days[k] || (bag.days[k] = { sec: 0, n: 0, ex: [] });
    const first = !(Number(row.basics) > 0);
    row.basics = (Number(row.basics) || 0) + 1;
    if (meta.len) row.len = meta.len;
    if (meta.track) row.track = meta.track;
    write(bag);
    return { first, day: k };
  }

  function basicsDoneToday() {
    const row = readRaw().days[dayKey()];
    return Number(row?.basics) > 0;
  }

  /**
   * The whole picture the home page and the completion card need.
   */
  function summary(opts = {}) {
    const bag = read(opts);
    const today = opts.today || dayKey();
    const practiced = Object.keys(bag.days).filter((k) => counts(bag.days[k])).sort();
    const todayDone = counts(bag.days[today]);

    // Current run: today counts once practised; an unpractised today is still
    // "open", not a break. Rest days bridge the run but do not lengthen it.
    let streak = 0;
    let cursor = todayDone ? today : addDays(today, -1);
    let guard = 0;
    while (cursor && covered(bag, cursor) && guard < 5000) {
      if (counts(bag.days[cursor])) streak += 1;
      cursor = addDays(cursor, -1);
      guard += 1;
    }

    // Longest run ever, same rules.
    let best = 0;
    let run = 0;
    let prev = null;
    const coveredKeys = new Set([...practiced, ...bag.rest.used]);
    [...coveredKeys].sort().forEach((k) => {
      if (prev && diffDays(prev, k) === 1) {
        if (counts(bag.days[k])) run += 1;
      } else {
        run = counts(bag.days[k]) ? 1 : 0;
      }
      if (run > best) best = run;
      prev = k;
    });
    best = Math.max(best, streak);

    // This week, Monday to Sunday.
    const ws = weekStart(today);
    const week = [];
    for (let i = 0; i < 7; i += 1) {
      const k = addDays(ws, i);
      let st = "future";
      if (k < today) st = counts(bag.days[k]) ? "done" : bag.rest.used.includes(k) ? "rest" : "missed";
      else if (k === today) st = todayDone ? "done" : "today";
      week.push({ key: k, state: st, isToday: k === today, basics: Number(bag.days[k]?.basics) > 0 });
    }

    const totalSec = practiced.reduce((n, k) => n + (Number(bag.days[k].sec) || 0), 0);
    const lastDay = practiced.length ? practiced[practiced.length - 1] : null;
    const prevDay = lastPracticeBefore(bag, today);
    return {
      today,
      todayDone,
      basicsToday: Number(bag.days[today]?.basics) > 0,
      streak,
      best,
      practiceDays: practiced.length,
      weekDays: week.filter((d) => d.state === "done").length,
      week,
      rest: { bank: bag.rest.bank, cap: restCap(), justUsed: bag.restJustUsed || null },
      minutes: Math.round(totalSec / 60),
      lastDay,
      // Calendar days since the last practice before today: 1 = yesterday.
      daysAway: prevDay ? diffDays(prevDay, today) : null,
      // Back after a break the rest days could not cover. A gap they did cover
      // was rest, not a lapse, and the streak says so.
      comeback: !!prevDay && diffDays(prevDay, today) >= 2 && !covered(bag, addDays(today, -1)),
      firstDay: practiced[0] || null
    };
  }

  /** Clear the "rest day just used" note once it has been shown. */
  function ackRest() {
    const bag = readRaw();
    if (!bag.restJustUsed) return;
    delete bag.restJustUsed;
    write(bag);
  }

  /** Next milestone at or below `practiceDays` that has not been marked yet. */
  function pendingMilestone(practiceDays, celebrated) {
    const seen = new Set(celebrated || []);
    let hit = null;
    MILESTONES.forEach((m) => {
      if (m <= practiceDays && !seen.has(m)) hit = m;
    });
    return hit;
  }

  function nextMilestone(practiceDays) {
    return MILESTONES.find((m) => m > practiceDays) || null;
  }

  /**
   * Merge two ledgers from two devices. Days union with the larger figures,
   * rest days used union; the rest bank comes from whichever side has done
   * more (earned further, spent more), so a sync never mints a rest day.
   */
  function merge(a, b) {
    if (!b) return a;
    if (!a) return b;
    const A = normalize(JSON.parse(JSON.stringify(a)));
    const B = normalize(JSON.parse(JSON.stringify(b)));
    const days = {};
    new Set([...Object.keys(A.days), ...Object.keys(B.days)]).forEach((k) => {
      const x = A.days[k] || {};
      const y = B.days[k] || {};
      const ex = [...new Set([...(x.ex || []), ...(y.ex || [])])].slice(0, EX_PER_DAY);
      const row = {
        sec: Math.max(Number(x.sec) || 0, Number(y.sec) || 0),
        n: Math.max(Number(x.n) || 0, Number(y.n) || 0),
        ex
      };
      if (x.saved || y.saved) row.saved = true;
      const basics = Math.max(Number(x.basics) || 0, Number(y.basics) || 0);
      if (basics) row.basics = basics;
      if (x.len || y.len) row.len = x.len || y.len;
      if (x.track || y.track) row.track = x.track || y.track;
      days[k] = row;
    });
    const progressed = (r) => r.earnedAt + r.used.length;
    const lead = progressed(A.rest) >= progressed(B.rest) ? A.rest : B.rest;
    const used = [...new Set([...A.rest.used, ...B.rest.used])].sort().slice(-120);
    return {
      v: 1,
      days,
      rest: { bank: lead.bank, earnedAt: Math.max(A.rest.earnedAt, B.rest.earnedAt), used },
      backfilled: !!(A.backfilled || B.backfilled)
    };
  }

  global.VTDays = {
    DAYS_PER_REST,
    MILESTONES,
    dayKey,
    parseDay,
    addDays,
    diffDays,
    weekStart,
    counts,
    read,
    record,
    markBasics,
    basicsDoneToday,
    summary,
    ackRest,
    pendingMilestone,
    nextMilestone,
    merge
  };
})(window);
