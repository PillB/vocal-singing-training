/**
 * Bug reports and ideas: what people tell us, and the window we read it in.
 *
 * The site is static and has no inbox, so until now the only way to report a
 * broken thing was to open a GitHub issue — which almost nobody practising
 * their voice on a phone is going to do. This module is the other end of a
 * form in the page: one short route that takes what somebody typed, and three
 * admin routes that list it, triage it and close it.
 *
 * What it deliberately does not do:
 * - No attachments. A screenshot upload needs R2 and a quota, and a report
 *   with "the piano button does nothing on my iPhone" is already actionable.
 * - No IP address and no fingerprint. The browser line and the screen size the
 *   client sends are what triage actually needs ("only on Safari", "only
 *   narrow"), they are what privacy.html says we keep, and nothing else is
 *   stored. The address is used for rate limiting and never written down.
 * - No free-form environment blob. `sanitizeEnvironment` keeps a closed list of
 *   keys with primitive values, so a client cannot turn this into a log sink.
 *
 * Writes are capped three ways, because a public POST that inserts a row is
 * the one thing on this worker that an abuser could use to spend the D1 free
 * tier's 100,000 daily writes: per address, per account, and a flat ceiling for
 * the whole deployment per day. Past the ceiling reports are refused with a
 * reason the page can translate, and nothing else on the worker is affected.
 *
 * Two things about that cap are easy to get wrong, and were:
 * - **The gates have to be atomic.** A limiter that reads the count, decides,
 *   and writes the new count back lets a burst through together, because each
 *   request reads the same count. `hitRateLimit` now carries the limit in its
 *   write and refuses when the write changes no row.
 * - **A refusal has to be free.** The order below matters: the deployment
 *   ceiling is read first and WITHOUT writing, because the per-address buckets
 *   each write a row, and a flood does not come from one address — an IPv6 /64
 *   hands out more addresses than anybody can use. Checked in the other order,
 *   every refusal still spent two writes, and the ceiling that exists to
 *   protect the day's writes was spending them.
 */

"use strict";

import { callerIp, ensureSchema, hitRateLimit, mintId, normalizeEmail, nowSec, peekRateLimit } from "./db.js";

/** What a reporter can be telling us. */
export const REPORT_KINDS = new Set(["bug", "idea"]);

/**
 * Which part of the site a report is about. A closed list, so the admin window
 * can filter and count; anything else becomes "other" rather than being
 * refused — a reporter must never lose a report over a dropdown.
 */
export const REPORT_AREAS = new Set([
  "practice",
  "audio",
  "exercises",
  "progress",
  "account",
  "payment",
  "site",
  "other"
]);

/** How bad it is, in the reporter's own judgement. Bugs only. */
export const REPORT_SEVERITIES = new Set(["blocks", "annoying", "cosmetic"]);

/** Where a report can be in our hands. `new` is where every report starts. */
export const REPORT_STATUSES = new Set(["new", "triaged", "fixed", "wontfix", "duplicate"]);

/** Statuses that mean we are done with a report; see `closedReportsOlderThan`. */
export const CLOSED_STATUSES = ["fixed", "wontfix", "duplicate"];

/** Largest body the report route accepts. Four thousand characters of text fits easily. */
export const MAX_REPORT_BODY_BYTES = 16384;

/** Per-field caps, applied by clamping rather than refusing. */
export const FIELD_LIMITS = {
  summary: 140,
  detail: 4000,
  steps: 1000,
  page: 200,
  build: 60,
  locale: 16,
  contact: 254,
  note: 1000,
  envValue: 120,
  env: 600
};

/** Rate limits as `[limit, windowSeconds]`. */
export const REPORT_LIMITS = {
  /** Per address: enough for a tester on a run, far too few to matter at scale. */
  perIp: [10, 3600],
  /** Per address per day, so an hour's gap does not reset an abuser's budget. */
  perIpDaily: [30, 86400],
  /** Per signed-in account per day. */
  perAccount: [40, 86400],
  /**
   * The whole deployment, per day. The ceiling exists so that no amount of
   * abuse from any number of addresses can spend the D1 daily write budget the
   * paying side of this worker needs. Raise it the day we have that problem.
   */
  perDeploymentDaily: [500, 86400]
};

/** How long a closed report is kept before `sweepExpired` drops it. */
export const CLOSED_REPORT_RETENTION_SECONDS = 180 * 86400;

/**
 * Alphabet for a reference somebody reads out over the phone: no 0/O, no
 * 1/I/L, no U (so nothing spells itself into a word by accident).
 */
const REF_ALPHABET = "23456789ABCDEFGHJKMNPQRSTVWXYZ";

/** How many characters a reference has. Ten of thirty is just under 50 bits. */
const REF_LENGTH = 10;

/**
 * Whether this deployment takes reports: it needs the database, and the var
 * can switch the route off without a code change. Unset means on, matching
 * EVENTS_ENABLED, because a deployment with a database and no opinion should
 * be able to hear from its users.
 * @param {Object} env Worker env bindings.
 * @returns {boolean} True when POST /v1/reports will store anything.
 */
export function reportsEnabled(env) {
  return Boolean(env && env.DB) && String((env && env.REPORTS_ENABLED) || "").trim().toLowerCase() !== "false";
}

/**
 * Mint a reference: `VS-` and ten characters from the readable alphabet, so it
 * is obvious in a message that it is ours and not a code to redeem.
 * @returns {string} e.g. `VS-7F3KQ2MXNP`.
 */
export function mintReference() {
  const raw = new Uint8Array(REF_LENGTH);
  crypto.getRandomValues(raw);
  let out = "";
  for (let i = 0; i < REF_LENGTH; i += 1) {
    out += REF_ALPHABET[raw[i] % REF_ALPHABET.length];
  }
  return `VS-${out}`;
}

/**
 * Whether a string is shaped like one of our references. Used by the admin
 * update route so a malformed id is a 400 and not a database round trip.
 * @param {unknown} value Candidate.
 * @returns {boolean} True when it could be a reference we minted.
 */
export function isReferenceShape(value) {
  return typeof value === "string" && new RegExp(`^VS-[${REF_ALPHABET}]{${REF_LENGTH}}$`).test(value);
}

/**
 * What is left between the digits of a card number somebody typed or pasted.
 *
 * Named classes rather than a hand-written list of code points, because the
 * list was the bug twice over. `\p{Zs}` is every space separator \u2014 the no-break
 * space off a web page, the narrow and figure spaces a formatter leaves, the
 * thin and hair spaces, the ideographic space off a CJK keyboard. `\p{Cf}` is
 * every format character, which is where the invisible ones live: the
 * zero-width space, the zero-width joiner and non-joiner, the word joiner, the
 * byte-order mark, the soft hyphen. A paste out of a PDF or a rich text field
 * carries these, and each one that is not in the set leaks the whole card
 * (QA round 5, then its re-attack, which found the thin and zero-width spaces
 * still walking through). Tab, carriage return and newline are controls rather
 * than separators, so they stay explicit.
 *
 * The dashes are `\p{Pd}`, the dash punctuation category, plus U+2212. That
 * paragraph used to say the dashes had to be a hand-written list, because
 * `\p{Pd}` does not hold U+2212 — the real minus sign, which is maths rather
 * than punctuation and is what a paste out of a spreadsheet carries — so a
 * class would be "a class plus a list and no shorter than the list". Measured,
 * that was wrong in both halves: `\p{Pd}.\u2212` is shorter than the four
 * dashes it replaced AND covers 27 code points instead of four. The four were
 * leaking the other twenty-three, and one of them is not exotic at all: U+2011,
 * the non-breaking hyphen, is what Word and Google Docs produce from a typed
 * hyphen inside a number, so a card pasted out of an order confirmation was
 * stored exactly as typed (QA round 7).
 *
 * U+0085, `\p{Zl}` and `\p{Zp}` are the three line breaks that are not
 * \r or \n: the C1 next-line, U+2028 and U+2029. A card broken across lines by
 * a paste out of a PDF arrives with one of them in it.
 */
const DIGIT_SEPARATORS =
  "\\t\\r\\n\\u0085\\p{Zs}\\p{Zl}\\p{Zp}\\p{Cf}\\p{Pd}.\\u2212";

/**
 * What counts as a digit: any decimal digit, not only the ASCII ones.
 *
 * It used to be `[0-9]`, with full-width digits folded to ASCII before the
 * match. That folded one script and left every other one through: the same
 * card in Arabic-Indic digits (U+0660…), in Devanagari, or in the mathematical
 * bold digits a copy out of styled text produces, was stored as typed (QA
 * round 6). `\p{Nd}` is the whole category, so there is nothing left to
 * enumerate and nothing to fold — the length rules below never need a digit's
 * VALUE, only to know it is one, which is why widening the class does the whole
 * job that mapping every script to ASCII would have done.
 *
 * `\p{No}` is deliberately not here. Superscripts, circled and parenthesised
 * digits are not how anybody writes a card, and they appear in ordinary text
 * (footnote markers, "①") where hiding the number around them would cost a
 * report its meaning.
 */
const DIGIT = "\\p{Nd}";

/** A run of digits and nothing but those separators between them. */
const DIGIT_RUN = new RegExp(`${DIGIT}(?:[${DIGIT}${DIGIT_SEPARATORS}]*${DIGIT})?`, "gu");

/** The marker a hidden number leaves behind. */
const HIDDEN = "[número oculto]";

/**
 * Whether a run of digits and separators has a card in it anywhere.
 *
 * A card is 13 to 19 digits in groups of three or more — 4-4-4-4, 4-6-5 for
 * Amex, or one unbroken number — so the run's groups are walked and every
 * window of whole groups is tried. Every group in a window must be three
 * digits or more, which is what keeps ordinary prose safe: "987 654 321 el 5 a
 * las 10.30" has groups of one and two in it, a Peruvian mobile is 9-3-3-3 off
 * a 2-digit country code, and four clock times in a row are groups of two. A
 * window's LAST group may be shorter, because a thirteen-digit card is typed
 * "4111 1111 1111 1".
 *
 * A single unbroken group of thirteen digits or more counts on its own, however
 * long it is. A card with the expiry and the CVV typed straight onto the end of
 * it is still a card, and there is no length at which that stops being true —
 * which is the one judgement here that changed: 20 unbroken digits used to be
 * "not a card" and be stored as typed.
 *
 * @param {string} run Digits and separators, nothing else.
 * @returns {boolean} True when the run must not be stored as typed.
 */
function runHasCard(run) {
  // Code points, not string length: a mathematical bold digit is a surrogate
  // pair, so `.length` counts each one twice and four of them would look like a
  // group of eight — hiding runs well short of a card.
  const groups = run
    .split(new RegExp(`[^${DIGIT}]+`, "u"))
    .filter(Boolean)
    .map((group) => [...group].length);
  if (groups.some((length) => length >= 13)) {
    return true;
  }
  for (let i = 0; i < groups.length; i += 1) {
    let digits = 0;
    for (let j = i; j < groups.length; j += 1) {
      digits += groups[j];
      if (digits > 19) {
        break;
      }
      if (digits >= 13) {
        return true;
      }
      // A group of one or two digits can only ever be a window's last, so
      // reaching one without having reached 13 digits ends this attempt.
      if (groups[j] < 3) {
        break;
      }
    }
  }
  return false;
}

/**
 * Long digit runs replaced with a marker.
 *
 * Somebody who hit a problem on the checkout page may well paste the card they
 * were paying with into "what happened".
 *
 * **What this does and does not catch, stated exactly, because a comment here
 * used to say "we never store a card number" and that was not true.** It
 * catches a card written in groups of three digits or more, in any decimal
 * script, separated by any space, any line break, any invisible format
 * character, a dot, any dash in Unicode's dash category, or the minus sign —
 * which is every way a card is pasted or typed out in practice. It does NOT
 * catch a card whose digits are written one or two at a time: "4 1 1 1 …" and
 * "41 11 11 …" are stored as typed (QA round 6).
 *
 * **A legitimate report does lose something, and this is what.** That sentence
 * used to read "a legitimate report loses nothing", on the reasoning that
 * nothing in a report about singing is a thirteen-to-nineteen digit number.
 * Two unrelated numbers with only separators between them are, together: a
 * ticket number beside a date ("pedido 1002345 2024-11-03"), a phone number
 * beside a date, a millisecond timestamp, a screenshot's own filename. Each of
 * those is hidden, whole, and the test suite pins the list so nobody has to
 * find it again.
 *
 * That is the side chosen to be wrong on, not an oversight: a hidden order
 * number costs a sentence of one report, and a stored card number cannot be
 * taken back. The reporter is not told, which is the part worth improving —
 * saying "we hid a long number in your message" would let them rephrase — and
 * it is recorded as such in docs/VALUE-GAP-REGISTRY.md rather than left as a
 * surprise.
 *
 * That gap is deliberate and it is the price of the group-of-three rule, which
 * is what keeps four clock times in a row, a list of three-digit numbers and a
 * phone number readable. The alternative on the table was to accept short
 * groups when the run passes a Luhn check and starts with a card brand's digit.
 * It was declined: one run in ten passes Luhn by chance — it passed on the clock
 * times pinned in the tests, which is why a brand-prefix filter had to be added
 * on top — and the measured cost was about one in twenty short-group runs hidden
 * without being a card. In a form whose entire purpose is for somebody to tell
 * us what went wrong, hiding their text costs a report, and the shapes it buys
 * are the least likely way a card ever reaches this field.
 *
 * The first version of this accepted one space or hyphen between digits, which
 * a paste very often is not: a line break, two spaces, a no-break space from a
 * web page, dots, " - ", or full-width digits from a CJK keyboard all walked
 * straight through it (QA round 5, QA-41). The separators are named Unicode
 * classes rather than a list, and a digit is `\p{Nd}` rather than `[0-9]`.
 *
 * **The whole run goes, not the card-shaped part of it.** Hiding only the
 * matching window left the rest of the run readable, and a number typed in
 * front of a card moves that window: "123456789 4111 1111 1111 1111" has a
 * thirteen-digit window across the join, so the card's first four digits were
 * hidden and its last twelve stored in order. Twelve consecutive digits of a
 * card is the card. A run is digits and separators with no letters in it, so
 * prose is not at risk — what the wider rule costs is a bare list of five or
 * more three-digit numbers, which is a fair price.
 * @param {string} text Text a person typed.
 * @returns {string} The same text with card-shaped runs removed.
 */
export function redactLongDigitRuns(text) {
  // No folding step any more. Folding rewrote the reporter's own text — a
  // full-width number in a sentence came back as ASCII — to make a narrower
  // character class match, and it only ever covered the one script somebody had
  // thought of. The class covers every script instead, so what is stored is
  // what they typed, minus the cards.
  //
  // The `[...run].length < 13` below is a CHEAP GUARD, not a decision: it skips
  // `runHasCard` for a run too short to hold a card. Measured with a mutation,
  // changing it on its own alters no outcome, because `runHasCard` counts code
  // points too and reaches the same verdict either way. It is counted in code
  // points for consistency with that function rather than because anything
  // depends on it, and it is said here so a future reader does not take a
  // surviving mutant of this line as a hole in the tests. The counting that IS
  // load-bearing is the `[...group].length` inside `runHasCard`, and mutating
  // that turns two tests red.
  return String(text).replace(DIGIT_RUN, (run) => ([...run].length < 13 || !runHasCard(run) ? run : HIDDEN));
}

/**
 * One field of typed text, made safe to store and to show again: no control
 * characters, no runaway length, no card numbers, and whitespace collapsed at
 * the ends only (a reporter's line breaks are information).
 * @param {unknown} value Raw value.
 * @param {number} max Longest result.
 * @returns {string} Cleaned text, possibly "".
 */
export function clampText(value, max) {
  if (typeof value !== "string") {
    return "";
  }
  // eslint-disable-next-line no-control-regex
  const stripped = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ");
  return redactLongDigitRuns(stripped).trim().slice(0, max);
}

/**
 * The browser facts triage needs, and nothing else.
 *
 * A closed list of keys, each a short primitive. `ua` is the browser's own
 * user-agent line: it is the single most useful field in a bug report and the
 * reporter is told it is attached, in the dialog and on the privacy page.
 * @param {unknown} raw Whatever the client sent as `environment`.
 * @returns {Object} An object with only known keys.
 */
export function sanitizeEnvironment(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return out;
  }
  const keep = ["ua", "viewport", "screen", "dpr", "lang", "platform", "tz", "mic", "audio", "net", "signedIn"];
  for (const key of keep) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) {
      out[key] = clampText(value, FIELD_LIMITS.envValue);
    } else if (typeof value === "number" && Number.isFinite(value)) {
      out[key] = Math.round(value * 100) / 100;
    } else if (typeof value === "boolean") {
      out[key] = value;
    }
  }
  // A last ceiling on the stored JSON, so the keys above cannot add up to
  // something large. Dropping keys from the end is fine: they are ordered by
  // how much they help.
  let text = JSON.stringify(out);
  while (text.length > FIELD_LIMITS.env) {
    const keys = Object.keys(out);
    if (!keys.length) {
      break;
    }
    delete out[keys[keys.length - 1]];
    text = JSON.stringify(out);
  }
  return out;
}

/**
 * Turn a posted body into a row we are willing to store, or say why not.
 *
 * Only two things can make a report invalid: not saying what kind it is, and
 * not saying anything at all. Everything else is clamped, defaulted or
 * dropped, because a reporter who got one field wrong should not have to type
 * their report again.
 *
 * @param {Object} body Parsed request body.
 * @param {{accountId?: string|null, at: number}} context Who and when.
 * @returns {{ok: boolean, reason?: string, report?: Object}} Result.
 */
export function sanitizeReport(body, context) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, reason: "bad_request" };
  }
  const kind = REPORT_KINDS.has(body.kind) ? body.kind : "";
  if (!kind) {
    return { ok: false, reason: "bad_kind" };
  }
  const summary = clampText(body.summary, FIELD_LIMITS.summary);
  const detail = clampText(body.detail, FIELD_LIMITS.detail);
  if (!summary && !detail) {
    return { ok: false, reason: "empty" };
  }
  return {
    ok: true,
    report: {
      id: mintReference(),
      kind,
      ...reportText(body, summary, detail),
      ...reportContext(body, kind),
      accountId: (context && context.accountId) || null,
      status: "new",
      createdAt: context.at,
      updatedAt: context.at
    }
  };
}

/** The typed fields of a report, already clamped; `summary` or `detail` is non-empty. */
function reportText(body, summary, detail) {
  // A reporter who typed only the long field still gets a list that reads
  // well: the first line of what they wrote becomes the summary.
  const title = summary || detail.split("\n")[0].slice(0, FIELD_LIMITS.summary);
  return {
    summary: title,
    detail,
    steps: clampText(body.steps, FIELD_LIMITS.steps),
    contact: normalizeEmail(body.contact) || null
  };
}

/** Where the report comes from: closed-list area and severity, page, build, locale, environment. */
function reportContext(body, kind) {
  return {
    area: REPORT_AREAS.has(body.area) ? body.area : "other",
    severity: kind === "bug" && REPORT_SEVERITIES.has(body.severity) ? body.severity : null,
    page: clampText(body.page, FIELD_LIMITS.page) || null,
    build: clampText(body.build, FIELD_LIMITS.build) || null,
    locale: clampText(body.locale, FIELD_LIMITS.locale) || null,
    environment: sanitizeEnvironment(body.environment)
  };
}

/**
 * Insert a report.
 * @param {Object} db D1 binding.
 * @param {Object} report A report from `sanitizeReport`.
 * @returns {Promise<Object>} The same report.
 */
export async function insertReport(db, report) {
  await db
    .prepare(
      `INSERT INTO reports
         (id, created_at, updated_at, kind, area, severity, summary, detail, steps,
          page, build, locale, env, contact, account_id, status)
       VALUES (?1, ?2, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, 'new')`
    )
    .bind(
      report.id,
      report.createdAt,
      report.kind,
      report.area,
      report.severity,
      report.summary,
      report.detail,
      report.steps,
      report.page,
      report.build,
      report.locale,
      JSON.stringify(report.environment || {}),
      report.contact,
      report.accountId
    )
    .run();
  return report;
}

/**
 * Parse the stored environment JSON without ever throwing: a row that somehow
 * holds broken JSON must still appear in the admin list.
 * @param {unknown} text Stored text.
 * @returns {Object} Parsed object, or {}.
 */
function readEnvironment(text) {
  try {
    const parsed = JSON.parse(String(text || "{}"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

/**
 * A stored row as the reporter may see it: their own words and where it got
 * to, never our internal note and never another person's address.
 * @param {Object} row Database row.
 * @returns {Object} Public report.
 */
export function toPublicReport(row) {
  return {
    reference: row.id,
    kind: row.kind,
    area: row.area || "other",
    severity: row.severity || null,
    summary: row.summary,
    detail: row.detail || "",
    steps: row.steps || "",
    status: row.status,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at)
  };
}

/**
 * A stored row as an admin sees it: everything, including how to answer.
 * @param {Object} row Database row.
 * @returns {Object} Admin report.
 */
export function toAdminReport(row) {
  return {
    ...toPublicReport(row),
    page: row.page || null,
    build: row.build || null,
    locale: row.locale || null,
    environment: readEnvironment(row.env),
    contact: row.contact || null,
    accountId: row.account_id || null,
    adminNote: row.admin_note || null,
    handledBy: row.handled_by || null,
    handledAt: row.handled_at === null || row.handled_at === undefined ? null : Number(row.handled_at)
  };
}

/** Columns every read selects, so the two views above always have their fields. */
const REPORT_COLUMNS = `id, created_at, updated_at, kind, area, severity, summary, detail, steps,
          page, build, locale, env, contact, account_id, status, admin_note, handled_by, handled_at`;

/**
 * Reports for the admin window, newest first.
 *
 * `before` is the `created_at` of the oldest row the caller already has, which
 * is how the list pages without OFFSET. Ties on the same second are broken by
 * id so a page boundary cannot repeat or skip a row.
 *
 * @param {Object} db D1 binding.
 * @param {{status?: string, kind?: string, limit?: number, before?: number,
 *          beforeId?: string}} [options] Filters.
 * @returns {Promise<{reports: Object[], more: boolean}>} A page of reports.
 */
export async function listReports(db, options) {
  const opts = options || {};
  const limit = Math.min(Math.max(Math.floor(Number(opts.limit) || 50), 1), 200);
  const where = [];
  const binds = [];
  if (opts.status && REPORT_STATUSES.has(opts.status)) {
    binds.push(opts.status);
    where.push(`status = ?${binds.length}`);
  } else if (opts.status === "open") {
    where.push(`status IN ('new', 'triaged')`);
  }
  if (opts.kind && REPORT_KINDS.has(opts.kind)) {
    binds.push(opts.kind);
    where.push(`kind = ?${binds.length}`);
  }
  if (Number.isFinite(Number(opts.before)) && Number(opts.before) > 0) {
    binds.push(Math.floor(Number(opts.before)));
    const at = binds.length;
    if (typeof opts.beforeId === "string" && opts.beforeId) {
      binds.push(opts.beforeId);
      where.push(`(created_at < ?${at} OR (created_at = ?${at} AND id < ?${binds.length}))`);
    } else {
      where.push(`created_at < ?${at}`);
    }
  }
  binds.push(limit + 1);
  const sql = `SELECT ${REPORT_COLUMNS}
     FROM reports
     ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
     ORDER BY created_at DESC, id DESC
     LIMIT ?${binds.length}`;
  const res = await db.prepare(sql).bind(...binds).all();
  const rows = (res && res.results) || [];
  return { reports: rows.slice(0, limit).map(toAdminReport), more: rows.length > limit };
}

/**
 * How many reports sit in each status, so the admin window can say "4 new"
 * without reading every row.
 * @param {Object} db D1 binding.
 * @returns {Promise<Object<string, number>>} Status -> count.
 */
export async function countReportsByStatus(db) {
  const res = await db.prepare("SELECT status, COUNT(*) AS n FROM reports GROUP BY status").all();
  const out = {};
  for (const status of REPORT_STATUSES) {
    out[status] = 0;
  }
  for (const row of (res && res.results) || []) {
    out[row.status] = Number(row.n) || 0;
  }
  return out;
}

/**
 * One person's own reports, newest first.
 * @param {Object} db D1 binding.
 * @param {string} accountId Account id.
 * @param {number} [limit] How many.
 * @returns {Promise<Object[]>} Public reports.
 */
export async function listReportsForAccount(db, accountId, limit) {
  const take = Math.min(Math.max(Math.floor(Number(limit) || 20), 1), 50);
  const res = await db
    .prepare(
      `SELECT ${REPORT_COLUMNS} FROM reports WHERE account_id = ?1
       ORDER BY created_at DESC, id DESC LIMIT ?2`
    )
    .bind(accountId, take)
    .all();
  return ((res && res.results) || []).map(toPublicReport);
}

/**
 * Move a report along, and/or write a note on it.
 *
 * `handled_at` is set the first time the status leaves `new`, which is what
 * "how long until somebody looked at this" is measured from.
 *
 * @param {Object} db D1 binding.
 * @param {string} id Reference.
 * @param {{status?: string, note?: string, by: string}} change What to change.
 * @param {number} at Unix seconds.
 * @returns {Promise<{ok: boolean, reason?: string, report?: Object}>} Result.
 */
export async function updateReport(db, id, change, at) {
  const row = await db.prepare(`SELECT ${REPORT_COLUMNS} FROM reports WHERE id = ?1`).bind(id).first();
  if (!row) {
    return { ok: false, reason: "not_found" };
  }
  const next = nextReportState(row, change || {}, at);
  await db
    .prepare(
      `UPDATE reports SET status = ?2, admin_note = ?3, handled_by = ?4, handled_at = ?5, updated_at = ?6
       WHERE id = ?1`
    )
    .bind(id, next.status, next.admin_note, next.handled_by, next.handled_at, at)
    .run();
  return { ok: true, report: toAdminReport({ ...row, ...next, updated_at: at }) };
}

/** The triage columns after `change`: unknown statuses and an absent note leave the stored ones alone. */
function nextReportState(row, change, at) {
  const status = REPORT_STATUSES.has(change.status) ? change.status : row.status;
  const noteGiven = change.note !== undefined && change.note !== null;
  const note = noteGiven ? clampText(change.note, FIELD_LIMITS.note) || null : row.admin_note || null;
  const handledAt = status === "new" ? row.handled_at || null : row.handled_at || at;
  return { status, admin_note: note, handled_by: change.by || row.handled_by || null, handled_at: handledAt };
}

/**
 * POST /v1/reports — take a report.
 *
 * Answers 200 with the reference, so the page can show it and the reporter can
 * quote it. Every refusal has a `reason` the page translates into a sentence
 * that keeps the typed text on screen: nothing a person wrote is ever thrown
 * away by this route.
 *
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables `{json, cors, now, requireSession}`.
 * @returns {Promise<Response>} Response.
 */
export async function handleSubmitReport(request, env, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  const refusal = refuseReportRequest(request, env);
  if (refusal) {
    return json({ ok: false, reason: refusal.reason }, refusal.status, cors);
  }
  const read = await readReportBody(request);
  if (!read.ok) {
    return json({ ok: false, reason: read.reason }, read.status, cors);
  }

  await ensureSchema(env.DB);
  const accountId = await reporterAccountId(request, env, deps, at);

  // Validation first, because it writes nothing. A body this route would refuse
  // anyway must not spend one of the reporter's ten hourly slots, and must not
  // cost the database a row either (QA round 5, QA-43).
  const parsed = sanitizeReport(read.body, { accountId, at });
  if (!parsed.ok) {
    return json({ ok: false, reason: parsed.reason }, 400, cors);
  }

  const gate = await spendReportLimits(env.DB, callerIp(request), accountId, at);
  if (gate) {
    return json({ ok: false, reason: gate.reason, retryAfter: gate.retryAfter }, 429, {
      ...cors,
      "retry-after": String(gate.retryAfter)
    });
  }

  await insertReport(env.DB, parsed.report);
  console.log("report stored", parsed.report.kind, parsed.report.area, parsed.report.id);
  return json({ ok: true, reference: parsed.report.id, report: toPublicReport(rowShape(parsed.report)) }, 200, cors);
}

/**
 * The refusals a report gets before its body is read: `{ status, reason }`,
 * or null when the request may go on.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @returns {{status: number, reason: string}|null} Refusal.
 */
function refuseReportRequest(request, env) {
  if (!env.DB) {
    return { status: 503, reason: "accounts_not_configured" };
  }
  if (!reportsEnabled(env)) {
    return { status: 503, reason: "reports_disabled" };
  }
  // Browsers always send Origin on a cross-site POST, so this keeps other
  // sites' pages from writing here. It is not a defence against a script, and
  // the limits below are what actually bound the damage.
  const allowed = typeof env.SITE_ORIGIN === "string" ? env.SITE_ORIGIN.trim() : "";
  if (allowed && request.headers.get("Origin") !== allowed) {
    return { status: 403, reason: "origin_not_allowed" };
  }
  const declared = Number.parseInt(request.headers.get("content-length") || "", 10);
  if (Number.isFinite(declared) && declared > MAX_REPORT_BODY_BYTES) {
    return { status: 413, reason: "body_too_large" };
  }
  return null;
}

/**
 * The parsed JSON body, refused when it is over the cap whatever the
 * Content-Length header said, or when it does not parse.
 * @param {Request} request Incoming request.
 * @returns {Promise<{ok: true, body: *}|{ok: false, status: number, reason: string}>} Body.
 */
async function readReportBody(request) {
  try {
    const buffer = await request.arrayBuffer();
    if (buffer.byteLength > MAX_REPORT_BODY_BYTES) {
      return { ok: false, status: 413, reason: "body_too_large" };
    }
    return { ok: true, body: JSON.parse(new TextDecoder().decode(buffer)) };
  } catch {
    return { ok: false, status: 400, reason: "bad_request" };
  }
}

/** The signed-in reporter's account id, or null: a session is welcome but never required. */
async function reporterAccountId(request, env, deps, at) {
  // The commonest moment to report a bug is the moment it stopped you, and
  // that is rarely while signed in.
  if (!deps.requireSession) {
    return null;
  }
  const auth = await deps.requireSession(env, request, at);
  return auth && auth.ok && auth.account ? auth.account.id : null;
}

/**
 * Spend the report limits in the one order that keeps a refusal free:
 * `{ reason, retryAfter }` for the gate that refused, or null when every gate
 * let the report through and one of the day's reports has been spent.
 * @param {Object} db D1 binding.
 * @param {string} ip Caller address (rate limiting only, never stored).
 * @param {string|null} accountId Signed-in reporter, if any.
 * @param {number} at Unix seconds.
 * @returns {Promise<{reason: string, retryAfter: number}|null>} Refusal.
 */
async function spendReportLimits(db, ip, accountId, at) {
  const refused = (gate, reason) => ({ reason: reason || "rate_limited", retryAfter: gate.retryAfter });
  // The deployment ceiling first, read WITHOUT writing. This order is the whole
  // protection: the per-address buckets below each write a row, so checking
  // them first meant a flood from rotating addresses — an IPv6 /64 hands out
  // more than anyone can use — spent two writes per refusal even after the
  // ceiling was reached, which is exactly what the ceiling exists to prevent
  // (QA round 5, QA-40). Refused here, a request costs reads and nothing else.
  const room = await peekRateLimit(
    db,
    "rep:all",
    REPORT_LIMITS.perDeploymentDaily[0],
    REPORT_LIMITS.perDeploymentDaily[1],
    at
  );
  if (!room.ok) {
    // Deliberately its own reason: this is our ceiling, not the reporter's
    // fault, and the page says so and offers the copy-it-yourself way out.
    return refused(room, "too_busy");
  }

  const hourly = await hitRateLimit(db, `rep:ip:${ip}`, REPORT_LIMITS.perIp[0], REPORT_LIMITS.perIp[1], at);
  if (!hourly.ok) {
    return refused(hourly);
  }
  const daily = await hitRateLimit(
    db,
    `rep:ipd:${ip}`,
    REPORT_LIMITS.perIpDaily[0],
    REPORT_LIMITS.perIpDaily[1],
    at
  );
  if (!daily.ok) {
    return refused(daily);
  }
  if (accountId) {
    const perAccount = await hitRateLimit(
      db,
      `rep:acct:${accountId}`,
      REPORT_LIMITS.perAccount[0],
      REPORT_LIMITS.perAccount[1],
      at
    );
    if (!perAccount.ok) {
      return refused(perAccount);
    }
  }
  // The ceiling is spent last, so a request the limits above turned away does
  // not consume one of the day's five hundred.
  const ceiling = await hitRateLimit(
    db,
    "rep:all",
    REPORT_LIMITS.perDeploymentDaily[0],
    REPORT_LIMITS.perDeploymentDaily[1],
    at
  );
  if (!ceiling.ok) {
    return refused(ceiling, "too_busy");
  }

  return null;
}

/**
 * The just-inserted report in row shape, so the response goes through the same
 * `toPublicReport` the list routes use and cannot drift from it.
 * @param {Object} report Report from `sanitizeReport`.
 * @returns {Object} Row-shaped object.
 */
function rowShape(report) {
  return {
    id: report.id,
    created_at: report.createdAt,
    updated_at: report.updatedAt,
    kind: report.kind,
    area: report.area,
    severity: report.severity,
    summary: report.summary,
    detail: report.detail,
    steps: report.steps,
    status: report.status
  };
}

/**
 * GET /v1/reports/mine — what this account has told us, and where it got to.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {URL} url Parsed URL.
 * @param {Object} deps Injectables `{json, cors, now, requireSession}`.
 * @returns {Promise<Response>} Response.
 */
export async function handleMyReports(request, env, url, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  if (!env.DB) {
    return json({ ok: false, reason: "accounts_not_configured" }, 503, cors);
  }
  await ensureSchema(env.DB);
  const auth = await deps.requireSession(env, request, at);
  if (!auth.ok) {
    return json({ ok: false, reason: auth.reason }, 401, cors);
  }
  const reports = await listReportsForAccount(env.DB, auth.account.id, url.searchParams.get("limit"));
  return json({ ok: true, reports }, 200, cors);
}

/**
 * GET /v1/admin/reports — the window we read reports in.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {URL} url Parsed URL.
 * @param {Object} deps Injectables `{json, cors, now, requireAdmin}`.
 * @returns {Promise<Response>} Response.
 */
export async function handleAdminListReports(request, env, url, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  const admin = await deps.requireAdmin(env, request, at);
  if (!admin.ok) {
    return json({ ok: false, reason: admin.reason }, admin.status, cors);
  }
  const page = await listReports(env.DB, {
    status: url.searchParams.get("status") || "",
    kind: url.searchParams.get("kind") || "",
    limit: url.searchParams.get("limit"),
    before: url.searchParams.get("before"),
    beforeId: url.searchParams.get("beforeId") || ""
  });
  return json({ ok: true, ...page, counts: await countReportsByStatus(env.DB) }, 200, cors);
}

/**
 * POST /v1/admin/reports/update — triage one report.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables `{json, cors, now, requireAdmin, readJsonBody}`.
 * @returns {Promise<Response>} Response.
 */
export async function handleAdminUpdateReport(request, env, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  const admin = await deps.requireAdmin(env, request, at);
  if (!admin.ok) {
    return json({ ok: false, reason: admin.reason }, admin.status, cors);
  }
  const parsed = await deps.readJsonBody(request);
  if (!parsed.ok) {
    return json({ ok: false, reason: parsed.reason }, 400, cors);
  }
  const id = String((parsed.body && parsed.body.reference) || (parsed.body && parsed.body.id) || "");
  if (!isReferenceShape(id)) {
    return json({ ok: false, reason: "bad_reference" }, 400, cors);
  }
  if (parsed.body.status !== undefined && !REPORT_STATUSES.has(parsed.body.status)) {
    return json({ ok: false, reason: "bad_status" }, 400, cors);
  }
  const updated = await updateReport(
    env.DB,
    id,
    { status: parsed.body.status, note: parsed.body.note, by: admin.account.id },
    at
  );
  if (!updated.ok) {
    return json({ ok: false, reason: updated.reason }, 404, cors);
  }
  return json({ ok: true, report: updated.report, counts: await countReportsByStatus(env.DB) }, 200, cors);
}

/**
 * Route the report paths, or return null so the caller's own router carries on.
 *
 * This runs before the account router, which claims every `/v1/admin/` path
 * and would answer `/v1/admin/reports` with a 404.
 *
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {URL} url Parsed URL.
 * @param {string} path Normalized path.
 * @param {Object} deps Injectables `{json, cors, now, requireAdmin, requireSession, readJsonBody}`.
 * @returns {Promise<Response|null>} Response, or null when the path is not ours.
 */
export async function routeReportsApi(request, env, url, path, deps) {
  const { json, cors } = deps;
  const isOurs =
    path === "/v1/reports" ||
    path === "/v1/reports/mine" ||
    path === "/v1/admin/reports" ||
    path === "/v1/admin/reports/update";
  if (!isOurs) {
    return null;
  }
  const wants = path === "/v1/reports" || path === "/v1/admin/reports/update" ? "POST" : "GET";
  if (request.method !== wants) {
    return json({ ok: false, reason: "method_not_allowed" }, 405, { ...cors, allow: wants });
  }
  if (path === "/v1/reports") {
    return handleSubmitReport(request, env, deps);
  }
  if (!env.DB) {
    return json({ ok: false, reason: "accounts_not_configured" }, 503, cors);
  }
  await ensureSchema(env.DB);
  if (path === "/v1/reports/mine") {
    return handleMyReports(request, env, url, deps);
  }
  return path === "/v1/admin/reports"
    ? handleAdminListReports(request, env, url, deps)
    : handleAdminUpdateReport(request, env, deps);
}
