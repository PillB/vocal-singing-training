/**
 * Do the Creem links pasted in js/billing-config.js sell the products the worker admits?
 *
 * Once any CREEM_PRODUCT_PRO_* id is set in workers/entitlements/wrangler.toml, the worker's webhook admits those
 * products and no other (workers/entitlements/src/creem.js planFromProductId): a purchase of anything else is
 * suspended as not ours. A pasted link (`providers.creem.links`, and `linksEur` for the euro products, VG-85) sells
 * the product its URL names. So a link to a product the table does not hold, or holds for another plan or currency,
 * takes the buyer's money and never makes them Pro. On the worker path /v1/health guards this (creemEurConfigured
 * needs both euro ids); the pasted path, VG-88's "continue to payment" included, has nothing else that checks it.
 *
 * Read by tests/node/creem-products.test.mjs, against the repository's own two files (the gate) and against changed
 * copies of them (the controls that prove it can fail).
 */
import vm from "node:vm";

/** The worker's product variable for each plan and link table. */
export const PRODUCT_VARS = Object.freeze({
  links: { pro_monthly: "CREEM_PRODUCT_PRO_MONTHLY", pro_yearly: "CREEM_PRODUCT_PRO_YEARLY" },
  linksEur: { pro_monthly: "CREEM_PRODUCT_PRO_MONTHLY_EUR", pro_yearly: "CREEM_PRODUCT_PRO_YEARLY_EUR" }
});

/**
 * The CREEM_PRODUCT_PRO_* values of wrangler.toml's [vars] table, trimmed as the worker compares them.
 * @param {string} toml The file's text.
 * @returns {Record<string, string>} Variable name to value ("" when unset).
 */
export function productTable(toml) {
  const vars = /^\[vars\]\s*$([\s\S]*?)(?=^\[)/m.exec(String(toml) + "\n[end]") || [];
  const out = {};
  for (const [, name, value] of String(vars[1] || "").matchAll(/^\s*(CREEM_PRODUCT_PRO_\w+)\s*=\s*"([^"]*)"/gm)) {
    out[name] = value.trim();
  }
  return out;
}

/**
 * The Creem rail of js/billing-config.js, as the page assigns it, after an optional change.
 * @param {string} source The file's text.
 * @param {(cfg: object) => void} [patch] A change made to the config as the page assigns it.
 * @returns {object} `providers.creem`.
 */
export function creemRail(source, patch) {
  const win = {};
  win.window = win;
  let held;
  Object.defineProperty(win, "VT_BILLING_CONFIG", {
    configurable: true,
    get: () => held,
    set: (value) => {
      if (patch) patch(value);
      held = value;
    }
  });
  vm.createContext(win);
  vm.runInContext(source, win);
  return held?.providers?.creem || {};
}

/**
 * What is wrong between the pasted Creem links and the worker's product table, one line per problem.
 * @param {Record<string, string>} table From productTable.
 * @param {object} creem From creemRail.
 * @returns {string[]} Empty when every pasted link sells a product the worker admits for that plan and currency.
 */
export function productMismatches(table, creem) {
  // No id set: the worker admits any product of the Creem account, so no pasted link can be refused as not ours.
  if (!Object.values(table).some(Boolean)) return [];
  const problems = [];
  for (const [key, byPlan] of Object.entries(PRODUCT_VARS)) {
    for (const [plan, name] of Object.entries(byPlan)) {
      const problem = linkProblem(String(creem?.[key]?.[plan] || "").trim(), table[name] || "", `${key}.${plan}`, name);
      if (problem) problems.push(problem);
    }
  }
  return problems;
}

/** One pasted link against its variable: null when they agree or nothing is pasted. */
function linkProblem(link, admitted, where, name) {
  if (!link) return null;
  const id = /\/payment\/(prod_[A-Za-z0-9_]+)/.exec(link)?.[1];
  if (!id) return `providers.creem.${where} (${link}) names no prod_ id to check against ${name}`;
  if (id === admitted) return null;
  return `providers.creem.${where} sells ${id}, but ${name} is "${admitted}": the webhook refuses it as not ours, and the buyer pays without becoming Pro`;
}
