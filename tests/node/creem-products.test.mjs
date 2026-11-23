// The Creem links pasted in js/billing-config.js against the product ids the worker admits (wrangler.toml), so a
// buyer can never pay through a pasted link for a product the webhook then refuses as not ours (VG-85: the euro
// products are the new way in; VG-88's "continue to payment" is the path with nothing else checking it).
//
// The first test is the gate, on the repository's own two files. The rest change copies of those files, one fact at a
// time, and say what the gate must answer: the controls that show it can fail, and that it does not fail on a
// configuration that is right.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { productTable, creemRail, productMismatches } from "../../qa/creem-products.mjs";

const TOML = readFileSync("workers/entitlements/wrangler.toml", "utf8");
const CONFIG = readFileSync("js/billing-config.js", "utf8");
const LINK = (id) => `https://www.creem.io/payment/${id}`;

/** wrangler.toml with some product ids filled in, by variable name. */
function tomlWith(ids) {
  let text = TOML;
  for (const [name, id] of Object.entries(ids)) {
    const line = `${name} = ""`;
    assert.equal(text.split(line).length - 1, 1, `${line} is in wrangler.toml once`);
    text = text.replace(line, `${name} = "${id}"`);
  }
  return text;
}

/** What the gate says of the repository's config with these links pasted, against this wrangler.toml. */
function check(toml, links, linksEur) {
  const creem = creemRail(CONFIG, (c) => {
    c.providers.creem.links = { ...c.providers.creem.links, ...(links || {}) };
    c.providers.creem.linksEur = { ...c.providers.creem.linksEur, ...(linksEur || {}) };
  });
  return productMismatches(productTable(toml), creem);
}

const ALL_FOUR = {
  CREEM_PRODUCT_PRO_MONTHLY: "prod_usd_m",
  CREEM_PRODUCT_PRO_YEARLY: "prod_usd_y",
  CREEM_PRODUCT_PRO_MONTHLY_EUR: "prod_eur_m",
  CREEM_PRODUCT_PRO_YEARLY_EUR: "prod_eur_y"
};
const DOLLAR_LINKS = { pro_monthly: LINK("prod_usd_m"), pro_yearly: LINK("prod_usd_y") };
const EURO_LINKS = { pro_monthly: LINK("prod_eur_m"), pro_yearly: LINK("prod_eur_y") };

test("gate: every Creem link pasted in js/billing-config.js sells a product wrangler.toml admits for its plan and money", () => {
  assert.deepEqual(productMismatches(productTable(TOML), creemRail(CONFIG)), []);
  // The four variables are where the gate reads them, so an empty table above is the file's, not a misread.
  assert.deepEqual(Object.keys(productTable(TOML)).sort(), Object.keys(ALL_FOUR).sort());
});

test("euro links pasted while the table holds only the dollar ids: each euro link is refused, and said so", () => {
  // The defect: the euro checkout charges 7,99 €, the webhook finds a product outside the allow-list, and the buyer
  // has paid for nothing.
  const dollarsOnly = tomlWith({ CREEM_PRODUCT_PRO_MONTHLY: "prod_usd_m", CREEM_PRODUCT_PRO_YEARLY: "prod_usd_y" });
  const problems = check(dollarsOnly, DOLLAR_LINKS, EURO_LINKS);
  assert.equal(problems.length, 2, problems.join("\n"));
  assert.match(problems[0], /linksEur\.pro_monthly sells prod_eur_m, but CREEM_PRODUCT_PRO_MONTHLY_EUR is ""/);
  assert.match(problems[1], /linksEur\.pro_yearly sells prod_eur_y, but CREEM_PRODUCT_PRO_YEARLY_EUR is ""/);
  // Control: the same links with all four ids set agree.
  assert.deepEqual(check(tomlWith(ALL_FOUR), DOLLAR_LINKS, EURO_LINKS), []);
});

test("a link sold under the other plan's or the other money's id is refused", () => {
  const swapped = tomlWith({ ...ALL_FOUR, CREEM_PRODUCT_PRO_MONTHLY_EUR: "prod_eur_y", CREEM_PRODUCT_PRO_YEARLY_EUR: "prod_eur_m" });
  assert.equal(check(swapped, DOLLAR_LINKS, EURO_LINKS).length, 2);
  // The dollar link pasted where the euro one belongs: the worker would admit it, but as the dollar product.
  assert.match(check(tomlWith(ALL_FOUR), DOLLAR_LINKS, { pro_monthly: LINK("prod_usd_m") }).join("\n"),
    /linksEur\.pro_monthly sells prod_usd_m, but CREEM_PRODUCT_PRO_MONTHLY_EUR is "prod_eur_m"/);
  // The dollar table checked too, not only the euro one.
  assert.match(check(tomlWith(ALL_FOUR), { pro_yearly: LINK("prod_other") }).join("\n"),
    /links\.pro_yearly sells prod_other, but CREEM_PRODUCT_PRO_YEARLY is "prod_usd_y"/);
});

test("a link whose product cannot be read is refused while the table is on, rather than waved through", () => {
  const problems = check(tomlWith(ALL_FOUR), {}, { pro_yearly: "https://www.creem.io/checkout/abc" });
  assert.equal(problems.length, 1);
  assert.match(problems[0], /linksEur\.pro_yearly .* names no prod_ id/);
});

test("controls: no table, no allow-list; and an id is compared trimmed, as the worker compares it", () => {
  // No id set: the worker admits any product of the account, so a pasted euro link is not refused.
  assert.deepEqual(check(TOML, DOLLAR_LINKS, EURO_LINKS), []);
  // A stray space in the variable: the worker trims it (src/creem.js), so the gate does too.
  assert.deepEqual(check(tomlWith({ ...ALL_FOUR, CREEM_PRODUCT_PRO_YEARLY_EUR: " prod_eur_y " }), DOLLAR_LINKS, EURO_LINKS), []);
  // Euro ids alone switch the allow-list on (CK44), so a dollar link is then checked, and refused.
  const euroOnly = tomlWith({ CREEM_PRODUCT_PRO_MONTHLY_EUR: "prod_eur_m", CREEM_PRODUCT_PRO_YEARLY_EUR: "prod_eur_y" });
  assert.deepEqual(check(euroOnly, {}, EURO_LINKS), []);
  assert.equal(check(euroOnly, DOLLAR_LINKS, EURO_LINKS).length, 2);
});
