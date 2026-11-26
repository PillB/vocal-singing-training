/**
 * Two things the privacy notice got wrong once euros and round two met
 * (found reviewing the merge, 2026-11-23).
 *
 * - The euro question. A visitor in the European Union, once Pro is on sale,
 *   has the page ask the worker at idle whether it can charge euros
 *   (js/app.js prefetchRailsForPrices, an unauthenticated GET /v1/health).
 *   The notice lists every time the browser writes to us, and did not list
 *   this one, in either half.
 * - The pointer. The English account paragraph sent the reader to the
 *   recipients "named below", and they are above it: the English half puts
 *   "Who else receives any of it" first. The Spanish half puts its list
 *   below, so "abajo" is right there.
 *
 * Read from privacy.html itself. Which words say "below" and "above" in each
 * language is written out by hand; where the anchor sits is read from the file.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const HTML = readFileSync(new URL("../../privacy.html", import.meta.url), "utf8");
const flat = (s) => s.replace(/\s+/g, " ");

/** The half of the page in one language: Spanish up to the English section, English after it. */
function half(lang) {
  const at = HTML.indexOf('id="en"');
  assert.notEqual(at, -1, "the page has an English section");
  return lang === "es" ? HTML.slice(0, at) : HTML.slice(at);
}

test("each half names the euro question the page asks at idle", () => {
  // Wrong (before): neither half said it; the request went out unlisted.
  assert.match(flat(half("es")), /Si estás en la Unión Europea y Pro ya está a la venta, también nos pregunta, cuando la página queda en reposo, si podemos cobrar en euros/);
  assert.match(flat(half("en")), /If you are in the European Union and Pro is on sale, it also asks us, once the page is idle, whether we can charge in euros/);
});

for (const [lang, href, below, above] of [
  ["es", "#quien-recibe", "nombrados abajo", "nombrados arriba"],
  ["en", "#who-receives", "named below", "named above"]
]) {
  test(`the ${lang} account paragraph points the way its recipients list really is`, () => {
    const link = HTML.indexOf(`<a href="${href}">`);
    const target = HTML.indexOf(`id="${href.slice(1)}"`);
    assert.ok(link !== -1 && target !== -1, "the link and its target are both on the page");
    const before = flat(HTML.slice(Math.max(0, link - 120), link));
    const said = before.includes(below) ? "below" : before.includes(above) ? "above" : null;
    // Wrong (before), in English: "named below" for a list placed above the paragraph.
    assert.equal(said, target > link ? "below" : "above");
  });
}
