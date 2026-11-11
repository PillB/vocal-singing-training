/**
 * Site layouts: which design of the site visitors use, read for an admin.
 *
 * The site offers its designs side by side behind one control at the top of
 * the page (js/site-version.js). A visitor picks one, so this is a record of
 * preference and use, **not a randomised experiment**: people who choose a
 * design differ from people who never touch the control, and most never touch
 * it, so "share on A" mostly measures which design was the default. Nothing
 * here computes a winner or a p-value. The unbiased comparison is the
 * registered experiment `site_layout_2026_11` (events.js), which randomises the
 * default and is read by first-assigned arm through the experiment results.
 *
 * Three events feed it, all sent through the same code whatever the design:
 *   layout_session {ver, src, n}    one per visit (30 minutes without activity
 *                                   ends a visit); `src` is default, chosen or
 *                                   link; `n` is the visit's number on that
 *                                   browser.
 *   layout_switch  {from, to, sec}  the control was used; `sec` is how long the
 *                                   visit had lasted.
 *   layout_time    {ver, sec}       seconds the page was open and in use on a
 *                                   design since the last report.
 *
 * Everything a browser sends is treated as a claim, not a fact: a design id
 * outside LAYOUT_VERSIONS is counted as ignored and shown as such, seconds are
 * clamped per report, and no browser id ever leaves this file.
 */

import { wilson } from "./stats.js";

/** The designs the site can show. Keep in step with VERSIONS in js/site-version.js. */
export const LAYOUT_VERSIONS = ["a", "b"];

/** The events above. events.js adds them to the allowlist. */
export const LAYOUT_EVENTS = ["layout_session", "layout_switch", "layout_time"];

/** How a visit came to be on its design. */
export const LAYOUT_SOURCES = ["default", "chosen", "link"];

/**
 * The most seconds one layout_time report may add. The page reports when it is
 * hidden, and stops counting after five idle minutes, so a longer claim than
 * a long practice session is a clock change or somebody posting at the route.
 */
export const MAX_REPORT_SECONDS = 3600;

/** A visit count per browser beyond this is one browser shouting; it counts as this many. */
export const MAX_SESSIONS_PER_BROWSER = 400;

const MAX_DAYS = 180;
const DEFAULT_DAYS = 28;

/**
 * SQL for a text prop, null when the row's props are not JSON or the value is
 * not a string. The path comes from this file's constants, never a request.
 * @param {string} prop Prop name.
 * @returns {string} SQL expression.
 */
function textProp(prop) {
  return `CASE WHEN json_valid(props) AND json_type(props, '$.${prop}') = 'text'
               THEN json_extract(props, '$.${prop}') END`;
}

/**
 * SQL for a numeric prop clamped to [0, max], 0 when absent or not a number.
 * @param {string} prop Prop name.
 * @param {number} max Ceiling.
 * @returns {string} SQL expression.
 */
function clampedNumberProp(prop, max) {
  return `CASE WHEN json_valid(props) AND json_type(props, '$.${prop}') IN ('integer', 'real')
               THEN MIN(MAX(json_extract(props, '$.${prop}'), 0), ${Number(max)}) ELSE 0 END`;
}

const DAY_SQL = "COALESCE(day, date(received_at, 'unixepoch'))";

/**
 * The window asked for, in days.
 * @param {URL} url Request URL.
 * @returns {number} Days, 1 to 180.
 */
export function windowDays(url) {
  const raw = Number.parseInt(url.searchParams.get("days") || "", 10);
  return Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_DAYS) : DEFAULT_DAYS;
}

/**
 * @param {unknown} ver A design id from a row.
 * @returns {boolean} Whether it is one the site has.
 */
function known(ver) {
  return typeof ver === "string" && LAYOUT_VERSIONS.includes(ver);
}

/**
 * @param {Object} env Worker env bindings.
 * @param {string} sql Statement with ?1 as the window start.
 * @param {number} since Unix seconds.
 * @returns {Promise<Object[]>} Rows.
 */
async function rowsSince(env, sql, since) {
  const res = await env.DB.prepare(sql).bind(since).all();
  return res.results || [];
}

/**
 * Visits and browsers per design. One inner row per (design, browser), so a
 * browser with forty visits is one browser and forty visits, and "came back"
 * is asked of the browser, not of the visit.
 * @param {Object} env Worker env bindings.
 * @param {number} since Unix seconds.
 * @returns {Promise<Object[]>} Rows `{ver, browsers, sessions, repeat, multiday}`.
 */
function sessionRows(env, since) {
  return rowsSince(
    env,
    `SELECT ver,
            COUNT(*) AS browsers,
            SUM(MIN(s, ${MAX_SESSIONS_PER_BROWSER})) AS sessions,
            SUM(s >= 2) AS repeat,
            SUM(d >= 2) AS multiday
       FROM (SELECT ${textProp("ver")} AS ver, cid, COUNT(*) AS s, COUNT(DISTINCT ${DAY_SQL}) AS d
               FROM events WHERE name = 'layout_session' AND received_at >= ?1
               GROUP BY ver, cid)
       GROUP BY ver`,
    since
  );
}

/**
 * @param {Object} env Worker env bindings.
 * @param {number} since Unix seconds.
 * @returns {Promise<Object[]>} Rows `{ver, src, n}`.
 */
function sourceRows(env, since) {
  return rowsSince(
    env,
    `SELECT ${textProp("ver")} AS ver, ${textProp("src")} AS src, COUNT(*) AS n
       FROM events WHERE name = 'layout_session' AND received_at >= ?1
       GROUP BY ver, src`,
    since
  );
}

/**
 * @param {Object} env Worker env bindings.
 * @param {number} since Unix seconds.
 * @returns {Promise<Object[]>} Rows `{ver, seconds, browsers}`.
 */
function timeRows(env, since) {
  return rowsSince(
    env,
    `SELECT ${textProp("ver")} AS ver,
            SUM(${clampedNumberProp("sec", MAX_REPORT_SECONDS)}) AS seconds,
            COUNT(DISTINCT cid) AS browsers
       FROM events WHERE name = 'layout_time' AND received_at >= ?1
       GROUP BY ver`,
    since
  );
}

/**
 * @param {Object} env Worker env bindings.
 * @param {number} since Unix seconds.
 * @returns {Promise<Object[]>} Rows `{src, dst, n, browsers}`.
 */
function switchRows(env, since) {
  return rowsSince(
    env,
    `SELECT ${textProp("from")} AS src, ${textProp("to")} AS dst,
            COUNT(*) AS n, COUNT(DISTINCT cid) AS browsers
       FROM events WHERE name = 'layout_switch' AND received_at >= ?1
       GROUP BY src, dst`,
    since
  );
}

/**
 * @param {Object} env Worker env bindings.
 * @param {number} since Unix seconds.
 * @returns {Promise<Object[]>} Rows `{d, ver, sessions, seconds}`.
 */
function dailyRows(env, since) {
  return rowsSince(
    env,
    `SELECT ${DAY_SQL} AS d, ${textProp("ver")} AS ver,
            SUM(name = 'layout_session') AS sessions,
            SUM(CASE WHEN name = 'layout_time' THEN ${clampedNumberProp("sec", MAX_REPORT_SECONDS)} ELSE 0 END) AS seconds
       FROM events
       WHERE name IN ('layout_session', 'layout_time') AND received_at >= ?1
       GROUP BY d, ver ORDER BY d`,
    since
  );
}

/**
 * How many browsers used the control at all.
 * @param {Object} env Worker env bindings.
 * @param {number} since Unix seconds.
 * @returns {Promise<number>} Distinct browsers with a switch.
 */
async function switcherCount(env, since) {
  const rows = await rowsSince(
    env,
    `SELECT COUNT(DISTINCT cid) AS n FROM events WHERE name = 'layout_switch' AND received_at >= ?1`,
    since
  );
  return Number(rows[0] && rows[0].n) || 0;
}

/**
 * An empty per-design record.
 * @param {string} ver Design id.
 * @returns {Object} Record with zeroes.
 */
function emptyVersion(ver) {
  const bySource = {};
  for (const src of LAYOUT_SOURCES) bySource[src] = 0;
  return { ver, browsers: 0, sessions: 0, repeatBrowsers: 0, multidayBrowsers: 0, seconds: 0, timeBrowsers: 0, bySource };
}

/**
 * Fold the session and time rows into one record per known design, counting
 * what was claimed for a design the site does not have.
 * @param {Object} parts Query results `{sessions, sources, times}`.
 * @returns {{versions: Object[], ignored: number}} Per-design records.
 */
export function foldVersions(parts) {
  const byVer = new Map(LAYOUT_VERSIONS.map((ver) => [ver, emptyVersion(ver)]));
  const ignored = foldSessions(byVer, parts.sessions);
  for (const row of parts.sources) {
    const rec = byVer.get(row.ver);
    if (rec && LAYOUT_SOURCES.includes(row.src)) rec.bySource[row.src] = Number(row.n) || 0;
  }
  for (const row of parts.times) {
    const rec = byVer.get(row.ver);
    if (!rec) continue;
    rec.seconds = Math.round(Number(row.seconds) || 0);
    rec.timeBrowsers = Number(row.browsers) || 0;
  }
  return { versions: [...byVer.values()], ignored };
}

/**
 * Write the visit counts into the per-design records.
 * @param {Map<string, Object>} byVer Records by design id.
 * @param {Object[]} rows Rows from sessionRows.
 * @returns {number} Visits claimed for a design the site does not have.
 */
function foldSessions(byVer, rows) {
  let ignored = 0;
  for (const row of rows) {
    const rec = byVer.get(row.ver);
    if (!rec) {
      ignored += Number(row.sessions) || 0;
      continue;
    }
    rec.browsers = Number(row.browsers) || 0;
    rec.sessions = Number(row.sessions) || 0;
    rec.repeatBrowsers = Number(row.repeat) || 0;
    rec.multidayBrowsers = Number(row.multiday) || 0;
  }
  return ignored;
}

/**
 * Add the derived figures: share of all time, seconds per visit, and the share
 * of browsers that came back with its Wilson interval.
 * @param {Object[]} versions Records from foldVersions.
 * @returns {Object[]} The same records, completed.
 */
export function finishVersions(versions) {
  const totalSeconds = versions.reduce((n, v) => n + v.seconds, 0);
  const totalSessions = versions.reduce((n, v) => n + v.sessions, 0);
  return versions.map((v) => ({
    ...v,
    timeShare: totalSeconds > 0 ? v.seconds / totalSeconds : null,
    sessionShare: totalSessions > 0 ? v.sessions / totalSessions : null,
    secondsPerSession: v.sessions > 0 ? Math.round(v.seconds / v.sessions) : null,
    repeat: wilson(v.repeatBrowsers, v.browsers),
    multiday: wilson(v.multidayBrowsers, v.browsers)
  }));
}

/**
 * @param {Object[]} rows Rows from switchRows.
 * @returns {Object[]} `{from, to, count, browsers}` for known designs only.
 */
function foldSwitches(rows) {
  const out = [];
  for (const row of rows) {
    if (!known(row.src) || !known(row.dst) || row.src === row.dst) continue;
    out.push({ from: row.src, to: row.dst, count: Number(row.n) || 0, browsers: Number(row.browsers) || 0 });
  }
  return out.sort((x, y) => y.count - x.count);
}

/**
 * @param {Object[]} rows Rows from dailyRows.
 * @returns {Object[]} `{day, ver, sessions, seconds}` for known designs and real days.
 */
function foldDaily(rows) {
  const out = [];
  for (const row of rows) {
    if (!known(row.ver) || !/^\d{4}-\d{2}-\d{2}$/.test(String(row.d || ""))) continue;
    out.push({
      day: row.d,
      ver: row.ver,
      sessions: Number(row.sessions) || 0,
      seconds: Math.round(Number(row.seconds) || 0)
    });
  }
  return out;
}

/**
 * GET /v1/admin/layouts?days=N — admin only (events.js checks before calling).
 * @param {Object} env Worker env bindings.
 * @param {URL} url Request URL.
 * @param {Object} deps Injectables `{json, cors, now}`.
 * @param {number} now Unix seconds.
 * @returns {Promise<Response>} Response.
 */
export async function handleLayouts(env, url, deps, now) {
  const { json, cors } = deps;
  const days = windowDays(url);
  const since = now - days * 86400;
  const [sessions, sources, times, switches, daily, switchers] = await Promise.all([
    sessionRows(env, since),
    sourceRows(env, since),
    timeRows(env, since),
    switchRows(env, since),
    dailyRows(env, since),
    switcherCount(env, since)
  ]);
  const folded = foldVersions({ sessions, sources, times });
  return json(
    {
      ok: true,
      window: { days, since },
      versions: finishVersions(folded.versions),
      switches: foldSwitches(switches),
      switchers,
      daily: foldDaily(daily),
      ignoredSessions: folded.ignored,
      // Said by the route itself, so no reader of it can show these numbers as
      // an experiment's result by leaving a caveat out.
      readMe: "self_selected"
    },
    200,
    cors
  );
}
