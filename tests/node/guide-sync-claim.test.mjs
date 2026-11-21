// What the guide says an account keeps on the server must be what sign-in sync sends (red team PRIV-6).
// guide.html said "tu progreso y tus ajustes también se guardan en nuestro servidor" (and "progress and
// settings" in English), while js/storage.js readSyncBag carries progress, the plan, goals, reviews and logs,
// and no setting: the range, the language and the piano options stay in the browser. A privacy statement that
// names data the server never holds is wrong in the other direction from a leak, and just as untrue.
// Wrong behaviour rejected: the server sentence naming settings while the bag carries none. Control: the bag
// is read from the code, so the day a setting is synced this test asks for the guide to say so instead.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const guide = readFileSync(new URL("../../guide.html", import.meta.url), "utf8");
const storage = readFileSync(new URL("../../js/storage.js", import.meta.url), "utf8");

/** The keys readSyncBag returns, read from its object literal. */
function syncBagKeys(src) {
  const body = src.slice(src.indexOf("readSyncBag(profileId) {"));
  const literal = body.slice(body.indexOf("return {") + 8, body.indexOf("};"));
  return [...literal.matchAll(/^\s*([A-Za-z]+):/gm)].map((m) => m[1]);
}

/** The plain text of the paragraph after a heading id, whitespace folded. */
function paragraphAfter(id) {
  const from = guide.indexOf(`id="${id}"`);
  assert.ok(from > 0, `the guide has #${id}`);
  const p = guide.slice(guide.indexOf("<p>", from), guide.indexOf("</p>", from));
  return p.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
}

/** The clause that says what goes to the server: from "Si entras"/"Sign in" up to the semicolon. */
function serverClause(text, start) {
  const at = text.indexOf(start);
  assert.ok(at >= 0, `the paragraph says what signing in keeps ("${start}")`);
  return text.slice(at, text.indexOf(";", at));
}

const keys = syncBagKeys(storage);
const syncsSettings = keys.some((k) => /setting|pref|range|lang|piano/i.test(k));

test("control: the sync bag is read from js/storage.js", () => {
  assert.ok(keys.includes("progress") && keys.includes("weekPlan") && keys.includes("goals"), keys.join(", "));
});

for (const [id, start, word] of [
  ["privacidad", "Si entras", /ajustes/i],
  ["privacidad-en", "Sign in", /settings/i]
]) {
  test(`#${id}: the server keeps settings only if the sync bag carries them`, () => {
    const clause = serverClause(paragraphAfter(id), start);
    assert.equal(word.test(clause), syncsSettings, `"${clause}" against a bag of ${keys.join(", ")}`);
  });
}
