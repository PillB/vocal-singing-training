/**
 * Entry point for `node --test workers/entitlements/test`.
 *
 * Node 22 treats positional arguments to `--test` as glob patterns, so a bare
 * directory resolves through this folder's package.json `main` instead of being
 * recursively searched. Importing every suite here keeps that command working
 * on Node 22 while `node --test workers/entitlements/test/*.test.mjs` (and the
 * directory recursion Node 20 does) still work unchanged.
 */

import "./config.test.mjs";
import "./d1-fake.test.mjs";
import "./license.test.mjs";
import "./stripe.test.mjs";
import "./mercadopago.test.mjs";
import "./creem.test.mjs";
import "./own-period-end.test.mjs";
import "./plan-and-cancel.test.mjs";
import "./store.test.mjs";
import "./router.test.mjs";
import "./site-client.test.mjs";
import "./accounts.test.mjs";
import "./grants.test.mjs";
import "./trial-arm.test.mjs";
import "./trial-killers.test.mjs";
import "./progress.test.mjs";
import "./google.test.mjs";
import "./email.test.mjs";
import "./api.test.mjs";
import "./stats.test.mjs";
import "./events.test.mjs";
import "./reports.test.mjs";
import "./scrub-killers.test.mjs";
import "./refunds.test.mjs";
import "./price-table.test.mjs";
// QA round 4's five tests for mutants this suite let survive. Each one was
// checked to fail against the mutant it targets before being adopted.
import "./qa-round4-worker.test.mjs";
import "./qa-round4-defects.test.mjs";
