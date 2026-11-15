/**
 * Two promises the account router has always made and no suite checked,
 * found by planting them back while splitting routeAccountApi into a route
 * table (main's complexity ceiling, on the merge of #26):
 *
 * - POST to /v1/me/progress is a write, exactly as PUT is. The site sends PUT
 *   today; the router's comment and code have accepted POST since the route
 *   was written, so a client that can only POST (a beacon) may rely on it.
 *   Wrong behaviour rejected: POST answered 405, so that save is lost.
 * - A method a path does not take is answered 405 with an `allow` header that
 *   names every method the path does take. Wrong behaviour rejected: /v1/me
 *   advertising GET only when POST works too, or progress dropping DELETE.
 *
 * The defects are registered in qa/mutate.mjs (set "splits"): WRT1 is the POST
 * save, WRT2 and WRT3 the two allow headers, so CI keeps proving these tests
 * still kill them.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "../src/index.js";
import { resetSchemaMemo } from "../src/db.js";
import { clearGoogleJwksCache } from "../src/google.js";
import { createAccountEnv } from "./fixtures.mjs";

const BASE = "https://entitlements.test";
const NOW = 1800000000;

const req = (method, path, { body, token } = {}) =>
  new Request(`${BASE}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(token ? { authorization: `Bearer ${token}` } : {})
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });

async function call(request, env, deps) {
  const response = await handleRequest(request, env, deps);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body, headers: response.headers };
}

function freshEnv() {
  resetSchemaMemo();
  clearGoogleJwksCache();
  return createAccountEnv();
}

/** Sign in by the emailed code, read from the email the fake transport was asked to send. */
async function signIn(env, email) {
  let code = null;
  const fetchImpl = async (url, init) => {
    code = (/\b(\d{6})\b/.exec(JSON.parse(init.body).text || "") || [])[1];
    return { ok: true, status: 200 };
  };
  await call(req("POST", "/v1/auth/email/start", { body: { email } }), env, { now: NOW, fetchImpl });
  const verified = await call(req("POST", "/v1/auth/email/verify", { body: { email, code } }), env, { now: NOW + 1 });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  return verified.body.sessionToken;
}

test("POST to /v1/me/progress saves, as PUT does", async () => {
  const env = freshEnv();
  const token = await signIn(env, "post@example.test");
  const saved = await call(
    req("POST", "/v1/me/progress", { token, body: { profileId: "default", doc: { streak: 4 }, baseRev: 0 } }),
    env,
    { now: NOW + 10 }
  );
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  const read = await call(req("GET", "/v1/me/progress?profileId=default", { token }), env, { now: NOW + 20 });
  assert.equal(read.status, 200);
  assert.deepEqual(read.body.doc, { streak: 4 });
  // control: a method the path does not take is still refused
  const patched = await call(req("PATCH", "/v1/me/progress", { token, body: {} }), env, { now: NOW + 30 });
  assert.equal(patched.status, 405);
});

test("a refused method is told every method the path does take", async () => {
  const env = freshEnv();
  const cases = [
    ["DELETE", "/v1/me", "GET, POST"],
    ["PATCH", "/v1/me/progress", "GET, PUT, DELETE"],
    ["DELETE", "/v1/admin/gift-codes", "GET, POST"],
    ["DELETE", "/v1/admin/grants", "GET, POST"],
    ["POST", "/v1/auth/methods", "GET"],
    ["GET", "/v1/me/trial", "POST"],
    ["GET", "/v1/admin/sweep", "POST"]
  ];
  for (const [method, path, allow] of cases) {
    const res = await call(req(method, path), env, { now: NOW });
    assert.equal(res.status, 405, `${method} ${path}`);
    assert.equal(res.body.reason, "method_not_allowed");
    assert.equal(res.headers.get("allow"), allow, `${method} ${path}`);
  }
  // control: an unknown path is a 404, not a 405
  assert.equal((await call(req("GET", "/v1/me/nothing-here"), env, { now: NOW })).status, 404);
});
