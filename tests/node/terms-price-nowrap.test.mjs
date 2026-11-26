/**
 * A price in the terms never breaks across lines between its money and its
 * number (the round-two aesthetic pass on the terms' price paragraph).
 *
 * The defect: on a 360 px phone the Spanish paragraph wrapped as "S/" at the
 * end of one line and "19.90 al mes" at the start of the next, and the
 * English one as "US$" / "7.99 a month": a reader scanning for the price met
 * a currency sign with no amount. A no-break space between sign and number
 * (and between number and € in Spanish, where the sign follows) keeps each
 * price on one line, as typographers and the RAE's Ortografía ask for
 * symbols beside figures.
 *
 * Read from terms.html itself. The expected count of prices in each half is
 * written out by hand: Mercado Pago's two, Creem's two in US$, the Union's two.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const HTML = readFileSync(new URL("../../terms.html", import.meta.url), "utf8");

/** The paragraph after the heading `title`, as written in the file. */
function paragraphAfter(title) {
  const at = HTML.indexOf(`<h2>${title}</h2>`);
  assert.notEqual(at, -1, `the terms have a "${title}" heading`);
  const open = HTML.indexOf("<p", at);
  return HTML.slice(open, HTML.indexOf("</p>", open));
}

for (const [title, glued, broken] of [
  // Spanish: S/ 19.90 and US$ 7.99 put the sign first, 7,99 € puts it after.
  ["Precios", /(?:S\/|US\$)&nbsp;\d|\d(?:,\d\d)?&nbsp;€/g, /(?:S\/|US\$)\s+\d|\d\s+€/g],
  // English: S/ 19.90, US$ 7.99, and €7.99 with no space at all.
  ["Prices", /(?:S\/|US\$)&nbsp;\d|€\d/g, /(?:S\/|US\$)\s+\d|€\s+\d/g]
]) {
  test(`the "${title}" paragraph keeps each of its six prices on one line`, () => {
    const para = paragraphAfter(title);
    // Wrong (before): "S/ 19.90" with a plain space, free to break after "S/".
    assert.deepEqual(para.match(broken) || [], [], "no price with a breakable space inside it");
    // Control: the six prices are there, so the check above is not passing on a paragraph with none.
    assert.equal((para.match(glued) || []).length, 6);
  });
}
