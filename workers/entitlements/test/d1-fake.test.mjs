/**
 * The D1 fake itself: it must take the worker's statements on every Node it
 * says it runs on (22.13 or later), the way D1 does.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { createD1, expandNumberedParameters } from "./d1-fake.mjs";

test("numbered parameters become bare ones with their values in order, as SQLite numbers them", () => {
  assert.deepEqual(expandNumberedParameters("SELECT ?1, ?1", ["a"]), { sql: "SELECT ?, ?", params: ["a", "a"] });
  assert.deepEqual(expandNumberedParameters("SELECT ?2, ?1, ?2", ["a", "b"]), { sql: "SELECT ?, ?, ?", params: ["b", "a", "b"] });
  // A bare ? takes the number after the largest one before it.
  assert.deepEqual(expandNumberedParameters("SELECT ?2, ?, ?1", ["a", "b", "c"]), { sql: "SELECT ?, ?, ?", params: ["b", "c", "a"] });
  assert.deepEqual(expandNumberedParameters("SELECT ?, ?", ["a", "b"]), { sql: "SELECT ?, ?", params: ["a", "b"] });
  assert.deepEqual(expandNumberedParameters("SELECT ?10", Array.from({ length: 10 }, (_, i) => i + 1)), { sql: "SELECT ?", params: [10] });
  assert.deepEqual(expandNumberedParameters("SELECT 1", []), { sql: "SELECT 1", params: [] });
});

test("quoted text, quoted names and comments keep their question marks", () => {
  const sql = "SELECT '?1 it''s ?2' AS \"a?1\", [b?1], `c?1` -- ?1 here\n/* ?2 */ , ?1";
  assert.deepEqual(expandNumberedParameters(sql, ["x"]), {
    sql: "SELECT '?1 it''s ?2' AS \"a?1\", [b?1], `c?1` -- ?1 here\n/* ?2 */ , ?",
    params: ["x"]
  });
});

test("a parameter with no value is NULL, and more values than parameters is an error, as in SQLite", () => {
  assert.deepEqual(expandNumberedParameters("SELECT ?1, ?2", ["a"]), { sql: "SELECT ?, ?", params: ["a", null] });
  assert.throws(() => expandNumberedParameters("SELECT ?1", ["a", "b"]), RangeError);
  assert.throws(() => expandNumberedParameters("SELECT 1", ["a"]), RangeError);
});

test("the fake runs a statement that uses a numbered parameter twice", async () => {
  const db = createD1();
  try {
    await db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT)");
    // The statement the schema setup runs on every new database.
    const upsert = "INSERT INTO meta (key, value) VALUES ('version', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1";
    await db.batch([db.prepare(upsert).bind("1")]);
    await db.prepare(upsert).bind("2").run();
    assert.deepEqual(await db.prepare("SELECT key, value FROM meta WHERE key = ?1 AND value = ?2").bind("version", "2").first(), { key: "version", value: "2" });
    const all = await db.prepare("SELECT ?2 AS b, ?1 AS a, ?1 AS c").bind("x", "y").all();
    assert.deepEqual(all.results, [{ b: "y", a: "x", c: "x" }]);
  } finally {
    db.close();
  }
});
