/**
 * Entry point for `node --test workers/entitlements/test`.
 *
 * Node 22 treats positional arguments to `--test` as glob patterns, so a bare
 * directory resolves through this folder's package.json `main` instead of being
 * recursively searched. Importing every suite here keeps that command working
 * on Node 22 while `node --test workers/entitlements/test/*.test.mjs` (and the
 * directory recursion Node 20 does) still work unchanged.
 */

import "./license.test.mjs";
import "./stripe.test.mjs";
import "./mercadopago.test.mjs";
import "./store.test.mjs";
import "./router.test.mjs";
