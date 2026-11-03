/**
 * A D1-shaped adapter over Node's built-in SQLite.
 *
 * The account layer is mostly SQL, so a hand-written in-memory fake would end
 * up testing the fake rather than the queries. `node:sqlite` ships with Node,
 * needs no install, and speaks the same SQLite dialect D1 does — so these tests
 * run the worker's real statements against a real database.
 *
 * Only the surface the worker actually uses is implemented: `prepare`, `bind`,
 * `first`, `all`, `run`, `batch` and `exec`.
 *
 * Needs Node 22.13 or later, where `node:sqlite` loads without a flag.
 */

import { DatabaseSync } from "node:sqlite";

/**
 * SQLite cannot bind a JS boolean, undefined, or a bigint from `crypto`.
 * D1 coerces these itself, so the adapter has to as well or a test would fail
 * on something production never sees.
 * @param {unknown} value Bound value.
 * @returns {string|number|null|Uint8Array} A value SQLite accepts.
 */
function coerce(value) {
  if (value === undefined || value === null) {
    return null;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  return value;
}

/**
 * Rewrite a statement's numbered parameters (`?1`, `?2`, each as often as it
 * likes, which D1 accepts) as bare `?`s, with the bound values repeated in the
 * order the `?`s now come. `node:sqlite` binds numbered parameters only from
 * Node 22.20 on, and before that refuses them ("column index out of range"),
 * which would fail the tests on an older Node 22 over something production
 * never sees. A bare `?` takes the number after the largest one before it, as
 * in SQLite. Quoted text, quoted names and comments are left alone. As SQLite
 * does, a parameter with no value bound is NULL, and more values than the
 * largest parameter number is an error.
 * @param {string} sql SQL text.
 * @param {unknown[]} params Values bound to ?1, ?2, … in order.
 * @returns {{sql: string, params: unknown[]}} The statement with only bare
 *   `?`s, and one value for each.
 */
export function expandNumberedParameters(sql, params) {
  let text = "";
  const values = [];
  let largest = 0;
  let i = 0;
  while (i < sql.length) {
    const ch = sql[i];
    let end = i + 1;
    if (ch === "'" || ch === "\"" || ch === "`" || ch === "[") {
      const close = ch === "[" ? "]" : ch;
      end = sql.indexOf(close, i + 1);
      // A quote written twice is one quote inside the text.
      while (end !== -1 && close !== "]" && sql[end + 1] === close) {
        end = sql.indexOf(close, end + 2);
      }
      end = end === -1 ? sql.length : end + 1;
    } else if (ch === "-" && sql[i + 1] === "-") {
      end = sql.indexOf("\n", i);
      end = end === -1 ? sql.length : end;
    } else if (ch === "/" && sql[i + 1] === "*") {
      end = sql.indexOf("*/", i + 2);
      end = end === -1 ? sql.length : end + 2;
    } else if (ch === "?") {
      while (end < sql.length && sql[end] >= "0" && sql[end] <= "9") {
        end += 1;
      }
      const number = end > i + 1 ? Number(sql.slice(i + 1, end)) : largest + 1;
      largest = Math.max(largest, number);
      values.push(number <= params.length ? params[number - 1] : null);
      text += "?";
      i = end;
      continue;
    }
    text += sql.slice(i, end);
    i = end;
  }
  if (params.length > largest) {
    throw new RangeError(`column index out of range: ${params.length} values for ${largest} parameters`);
  }
  return { sql: text, params: values };
}

/** One prepared statement, optionally already bound. */
class FakeD1PreparedStatement {
  /**
   * @param {import('node:sqlite').DatabaseSync} db Underlying database.
   * @param {string} sql SQL text.
   * @param {unknown[]} params Bound parameters.
   */
  constructor(db, sql, params) {
    this.db = db;
    this.sql = sql;
    this.params = params || [];
  }

  /**
   * Bind parameters, returning a new statement (D1 statements are immutable).
   * @param {...unknown} values Parameter values in order.
   * @returns {FakeD1PreparedStatement} Bound statement.
   */
  bind(...values) {
    return new FakeD1PreparedStatement(this.db, this.sql, values.map(coerce));
  }

  /**
   * The statement as `node:sqlite` takes it on any Node 22.13 or later, with
   * its values.
   * @returns {{statement: import('node:sqlite').StatementSync, params: unknown[]}} Statement and values.
   */
  prepared() {
    const { sql, params } = expandNumberedParameters(this.sql, this.params);
    return { statement: this.db.prepare(sql), params };
  }

  /**
   * First row, or one column of it.
   * @param {string} [column] Column name.
   * @returns {Promise<Object|unknown|null>} Row, value, or null.
   */
  async first(column) {
    const { statement, params } = this.prepared();
    const row = statement.get(...params);
    if (row === undefined || row === null) {
      return null;
    }
    const plain = { ...row };
    return column === undefined ? plain : plain[column];
  }

  /**
   * All rows.
   * @returns {Promise<{results: Object[], success: boolean, meta: Object}>} D1-shaped result.
   */
  async all() {
    const { statement, params } = this.prepared();
    const rows = statement.all(...params).map((row) => ({ ...row }));
    return { results: rows, success: true, meta: { rows_read: rows.length } };
  }

  /**
   * Execute a write.
   * @returns {Promise<{success: boolean, meta: {changes: number, last_row_id: number}}>} D1-shaped result.
   */
  async run() {
    const { statement, params } = this.prepared();
    const info = statement.run(...params);
    return {
      success: true,
      meta: {
        changes: Number(info.changes || 0),
        last_row_id: Number(info.lastInsertRowid || 0)
      }
    };
  }
}

/** A D1-shaped database backed by an in-memory SQLite file. */
export class FakeD1Database {
  constructor() {
    this.db = new DatabaseSync(":memory:");
    // D1 enforces foreign keys; match it so a test cannot pass on a constraint
    // the real database would reject.
    this.db.exec("PRAGMA foreign_keys = ON");
  }

  /**
   * Prepare a statement.
   * @param {string} sql SQL text.
   * @returns {FakeD1PreparedStatement} Statement.
   */
  prepare(sql) {
    return new FakeD1PreparedStatement(this.db, sql, []);
  }

  /**
   * Run statements in order.
   *
   * D1's `batch` is one implicit transaction. `node:sqlite` has no nested
   * transactions, so this wraps the batch in one and rolls back on failure,
   * which is the behaviour the worker relies on.
   *
   * @param {FakeD1PreparedStatement[]} statements Prepared statements.
   * @returns {Promise<Object[]>} Per-statement results.
   */
  async batch(statements) {
    this.db.exec("BEGIN");
    try {
      const out = [];
      for (const statement of statements) {
        out.push(await statement.run());
      }
      this.db.exec("COMMIT");
      return out;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  /**
   * Execute raw SQL.
   * @param {string} sql One or more statements.
   * @returns {Promise<{count: number}>} D1-shaped result.
   */
  async exec(sql) {
    this.db.exec(sql);
    return { count: 0 };
  }

  /**
   * Close the underlying database.
   * @returns {void}
   */
  close() {
    this.db.close();
  }
}

/**
 * Build a fresh D1 fake.
 * @returns {FakeD1Database} Empty database.
 */
export function createD1() {
  return new FakeD1Database();
}
