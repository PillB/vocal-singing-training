/**
 * The operator's inventory: what the code reads, what the README promises, and
 * what this public repository must never carry.
 *
 * Three different ways a setting goes wrong without any test noticing, and none
 * of them shows up as a failure anywhere else:
 *
 *   - **A key the code reads and nobody documented.** The operator never sets
 *     it, the feature it governs is silently off, and nothing says why.
 *     `REPORTS_ENABLED` was in this state until this file was written.
 *   - **A key the README promises and the code ignores.** The operator sets it,
 *     watches nothing happen, and has no way to tell a typo from a lie.
 *   - **An address or a key committed to `wrangler.toml`.** The repository is
 *     public. A value in that file is published in the commit that adds it and
 *     stays in the history after any later edit, so deleting it later does not
 *     take it back. `ADMIN_EMAILS` is the one that invites this, because it is
 *     not a credential and the worker reads it from `env` either way — the
 *     README and the Peru runbook both told the operator to put it there.
 *
 * The first two are a single bidirectional comparison; the third is a grep over
 * the committed config, written to fail on an address or a provider key no
 * matter which setting carries it.
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

const here = (rel) => new URL(rel, import.meta.url);
const read = (rel) => readFileSync(here(rel), "utf8");

const WRANGLER = read("../wrangler.toml");
const README = read("../README.md");

/** Bindings, not settings: they are declared in `wrangler.toml` and documented as tables. */
const BINDINGS = new Set(["DB", "ENTITLEMENTS"]);

/**
 * Every `env.NAME` the worker's source reads.
 * @returns {Set<string>} Upper-snake setting names, bindings excluded.
 */
function keysTheCodeReads() {
  const dir = here("../src/");
  const found = new Set();
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".js")) continue;
    const src = readFileSync(new URL(name, dir), "utf8");
    for (const match of src.matchAll(/\benv\.([A-Z][A-Z0-9_]*)\b/g)) {
      if (!BINDINGS.has(match[1])) found.add(match[1]);
    }
    // `env && env.X` reads through a destructure or a helper are the same thing
    // to an operator, so count those too.
    for (const match of src.matchAll(/\(env\s*&&\s*env\.([A-Z][A-Z0-9_]*)\)/g)) {
      if (!BINDINGS.has(match[1])) found.add(match[1]);
    }
  }
  return found;
}

/**
 * Every setting named in the first cell of a row in the README's "Bindings"
 * section. Rows naming two interchangeable keys (`A` / `B`) count as both.
 * D1 table names live in the same shape in that section and are lower case,
 * which is what separates them.
 * @returns {Set<string>} Upper-snake setting names.
 */
function keysTheReadmeNames() {
  const start = README.indexOf("\n## Bindings\n");
  assert.notEqual(start, -1, "the README still has a Bindings section");
  const rest = README.slice(start + 1);
  const end = rest.indexOf("\n## ", 1);
  const section = end === -1 ? rest : rest.slice(0, end);
  const found = new Set();
  for (const line of section.split("\n")) {
    if (!line.startsWith("|")) continue;
    const firstCell = line.split("|")[1] || "";
    for (const match of firstCell.matchAll(/`([A-Z][A-Z0-9_]*)`/g)) {
      if (!BINDINGS.has(match[1])) found.add(match[1]);
    }
  }
  return found;
}

test("every setting the code reads is in the README's table, and every one in the table is read", () => {
  const code = keysTheCodeReads();
  const docs = keysTheReadmeNames();
  assert.ok(code.size > 15, `expected the worker to read many settings, found ${code.size}`);

  const undocumented = [...code].filter((k) => !docs.has(k)).sort();
  assert.deepEqual(
    undocumented,
    [],
    `read by src/ but absent from the README's Bindings tables, so the operator never sets them: ${undocumented.join(", ")}`
  );

  const unread = [...docs].filter((k) => !code.has(k)).sort();
  assert.deepEqual(
    unread,
    [],
    `promised by the README but never read by src/, so setting them does nothing: ${unread.join(", ")}`
  );
});

test("wrangler.toml carries no email address, in any setting", () => {
  // Not a regex over addresses in prose: the comments explain *why* the admin
  // list is a secret and the word "emails" belongs there. Only assignments are
  // checked, which is the only place a value can actually be published.
  const assignments = WRANGLER.split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*\s*=/.test(line));
  assert.ok(assignments.length > 5, "expected wrangler.toml to assign something");

  for (const line of assignments) {
    const [name, ...valueParts] = line.split("=");
    const value = valueParts.join("=");
    assert.ok(
      !/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(value),
      `${name.trim()} assigns what looks like an email address in a public repository: ${line}`
    );
  }
});

test("ADMIN_EMAILS is not assigned in wrangler.toml, and the README says so", () => {
  const assigned = WRANGLER.split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .some((line) => /^ADMIN_EMAILS\s*=/.test(line));
  assert.equal(
    assigned,
    false,
    "ADMIN_EMAILS assigned in a public file: `wrangler secret put ADMIN_EMAILS` instead, " +
      "because git keeps the value after any later edit"
  );

  // And the inventory an operator reads has to send them to `secret put`, or the
  // check above only moves the mistake to the next person who follows the docs.
  const row = README.split("\n").find((line) => /^\|\s*`ADMIN_EMAILS`/.test(line));
  assert.ok(row, "the README still has a row for ADMIN_EMAILS");
  assert.match(row, /secret put/, `the README's ADMIN_EMAILS row must point at \`secret put\`: ${row}`);
});

test("no provider key or private key is assigned in wrangler.toml", () => {
  // The shapes that would be catastrophic rather than merely careless. Each is
  // the real prefix of the thing it names, so a comment showing the shape as
  // `sk_live_…` does not trip it; only an assignment with a plausible body does.
  const shapes = [
    [/sk_(live|test)_[A-Za-z0-9]{8,}/, "a Stripe secret key"],
    [/whsec_[A-Za-z0-9]{8,}/, "a Stripe webhook secret"],
    [/rk_(live|test)_[A-Za-z0-9]{8,}/, "a Stripe restricted key"],
    [/re_[A-Za-z0-9]{12,}/, "a Resend API key"],
    [/xkeysib-[A-Za-z0-9]{12,}/, "a Brevo API key"],
    [/mlsn\.[A-Za-z0-9]{12,}/, "a MailerSend API key"],
    [/APP_USR-[A-Za-z0-9-]{12,}/, "a Mercado Pago access token"],
    [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, "a private key"]
  ];
  for (const [shape, what] of shapes) {
    assert.equal(shape.test(WRANGLER), false, `wrangler.toml appears to contain ${what}`);
  }
});

test("the secrets wrangler.toml tells the operator to set are the ones the code reads", () => {
  // The comment block at the bottom of wrangler.toml is the only list an
  // operator sees before their first deploy; a secret missing from it is a
  // feature that answers 503 for a reason nobody can find.
  const code = keysTheCodeReads();
  for (const name of [
    "STRIPE_WEBHOOK_SECRET",
    "MP_WEBHOOK_SECRET",
    "MP_ACCESS_TOKEN",
    "LICENSE_PRIVATE_KEY_PKCS8_B64",
    "ADMIN_EMAILS",
    "LICENSE_ID_KEY"
  ]) {
    assert.ok(code.has(name), `${name} is in the expected list but src/ never reads it`);
    assert.ok(
      WRANGLER.includes(name),
      `${name} is read by src/ but wrangler.toml never tells the operator about it`
    );
  }
});
