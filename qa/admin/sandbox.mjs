#!/usr/bin/env node
/**
 * A private copy of the site and its account server, on this computer, with
 * made-up people in it — to practise the admin guide without touching anyone
 * real.
 *
 *   node qa/admin/sandbox.mjs
 *
 * then open http://127.0.0.1:8780/__sandbox/ and pick who to be.
 *
 * - The site is this checkout, served as-is, except that js/billing-config.js
 *   is pointed at the local server and its throwaway signing key.
 * - The account server is the real worker code (workers/entitlements/src) on a
 *   real SQLite database in memory. Stop the script and everything is gone.
 * - Google is the one thing it cannot do. "Sign in as" writes the same session
 *   the Google route writes once Google has vouched for an address.
 *
 * Needs Node 22 or newer (for node:sqlite). No install, no network. Both
 * servers listen on 127.0.0.1 only and answer only requests addressed to it,
 * and the site server never hands out dotfiles (.git, .env and the like).
 */

import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { createLocalWorker, seedBeta, PEOPLE } from "./local-worker.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const SITE_PORT = Number(arg("--port", process.env.SANDBOX_PORT || 8780));
const WORKER_PORT = Number(arg("--worker-port", process.env.SANDBOX_WORKER_PORT || 8781));
const HOST = "127.0.0.1";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".pdf": "application/pdf",
  ".md": "text/plain; charset=utf-8"
};

/**
 * Rewrite the shipped billing config to use the local worker and key.
 * @param {string} source js/billing-config.js as shipped.
 * @param {Object} jwk Local public key.
 * @returns {string} Rewritten source.
 */
export function pointConfigAt(source, apiBase, jwk) {
  let out = source.replace(/apiBaseUrl:\s*"[^"]*"/, `apiBaseUrl: ${JSON.stringify(apiBase)}`);
  out = out.replace(/publicKeyJwk:\s*\{[\s\S]*?\n\s*\},/, `publicKeyJwk: ${JSON.stringify(jwk)},`);
  if (out === source || !out.includes(apiBase) || !out.includes(jwk.x)) {
    throw new Error("could not point js/billing-config.js at the sandbox; has its shape changed?");
  }
  return out;
}

/**
 * Turn a Node request into a Fetch request.
 * @param {http.IncomingMessage} req Node request.
 * @param {string} base Base URL.
 * @returns {Promise<Request>} Fetch request.
 */
async function toFetchRequest(req, base) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const headers = new Headers();
  Object.entries(req.headers).forEach(([k, v]) => {
    if (Array.isArray(v)) v.forEach((item) => headers.append(k, item));
    else if (v !== undefined) headers.set(k, v);
  });
  return new Request(new URL(req.url, base), {
    method: req.method,
    headers,
    body: req.method === "GET" || req.method === "HEAD" ? undefined : body
  });
}

/**
 * Whether a request was addressed to this server by its loopback name, so a
 * web page that rebinds its own hostname to 127.0.0.1 cannot drive it.
 * @param {http.IncomingMessage} req Request.
 * @param {number} port Port this server listens on.
 * @returns {boolean} Allowed.
 */
function hostAllowed(req, port) {
  const host = String(req.headers.host || "").toLowerCase();
  return host === `${HOST}:${port}` || host === `localhost:${port}`;
}

/**
 * Wrap a handler so a thrown error answers 500 instead of leaving the
 * browser waiting, and so off-host requests are refused.
 * @param {number} port Port the server listens on.
 * @param {Function} handler Async (req, res) handler.
 * @returns {Function} Node request listener.
 */
function guarded(port, handler) {
  return async (req, res) => {
    if (!hostAllowed(req, port)) {
      res.writeHead(421, { "content-type": "text/plain; charset=utf-8" });
      return res.end("wrong host");
    }
    try {
      await handler(req, res);
    } catch (error) {
      console.error(error);
      if (!res.headersSent) res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("sandbox error");
    }
  };
}

function sandboxIndex(people) {
  const rows = Object.entries(people)
    .map(
      ([key, p]) =>
        `<li><strong>${p.email}</strong> — ${p.note}<br>` +
        `<a href="/__sandbox/sign-in?as=${key}&amp;next=/admin.html">entrar y abrir el panel de admin</a> · ` +
        `<a href="/__sandbox/sign-in?as=${key}&amp;next=/">entrar y abrir el estudio</a></li>`
    )
    .join("");
  return `<!doctype html><meta charset="utf-8"><title>Sandbox</title>
<link rel="stylesheet" href="/css/styles.css"><body style="padding:1.5rem;max-width:46rem;margin:auto;line-height:1.6">
<h1>Sandbox local</h1>
<p>Todo aquí es inventado y vive en la memoria de este proceso. Detén el script y desaparece.</p>
<ul>${rows}</ul>
<p><a href="/__sandbox/sign-out?next=/">Salir (olvidar la sesión en este navegador)</a></p>
</body>`;
}

function signInPage(session, next) {
  const rec = JSON.stringify({ token: session.token, expiresAt: session.expiresAt });
  // JSON.stringify does not escape "<", so a "</script>" in `next` would end
  // the script early; escape it for the inline-script context.
  const js = (value) => JSON.stringify(value).replace(/</g, "\\u003c");
  return `<!doctype html><meta charset="utf-8"><title>Entrando…</title><script>
localStorage.setItem("vt_account_session_v1", ${js(rec)});
localStorage.removeItem("vt_license_v1");
location.replace(${js(next)});
</script>`;
}

/**
 * Start the sandbox: the real worker on one port, the site on another.
 * @param {{sitePort?: number, workerPort?: number, quiet?: boolean}} [options] Ports.
 * @returns {Promise<{site: string, workerUrl: string, worker: Object, seeded: Object,
 *                    people: Object, close: () => Promise<void>}>} Handle.
 */
export async function startSandbox(options) {
  const opts = options || {};
  const sitePort = Number(opts.sitePort || SITE_PORT);
  const workerPort = Number(opts.workerPort || WORKER_PORT);
  const site = `http://${HOST}:${sitePort}`;
  const workerUrl = `http://${HOST}:${workerPort}`;

  const worker = await createLocalWorker({ origin: site });
  const seeded = await seedBeta(worker);
  const people = {
    admin: { ...PEOPLE.admin, note: "administradora (está en ADMIN_EMAILS)" },
    ana: { ...PEOPLE.ana, note: "tester nueva, sin Pro" },
    bruno: { ...PEOPLE.bruno, note: "tester con un mes regalado" },
    carla: { ...PEOPLE.carla, note: "usó su mes de prueba, ya venció" },
    diego: { ...PEOPLE.diego, note: "invitado con Pro, aún no ha entrado" }
  };

  const configSource = await readFile(join(ROOT, "js/billing-config.js"), "utf8");
  const config = pointConfigAt(configSource, workerUrl, worker.publicKeyJwk);

  const workerServer = http.createServer(guarded(workerPort, async (req, res) => {
    const response = await worker.fetch(await toFetchRequest(req, workerUrl));
    const headers = {};
    response.headers.forEach((v, k) => {
      headers[k] = v;
    });
    res.writeHead(response.status, headers);
    res.end(Buffer.from(await response.arrayBuffer()));
  }));

  const siteServer = http.createServer(guarded(sitePort, async (req, res) => {
    const url = new URL(req.url, site);
    let path;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      res.writeHead(400);
      return res.end();
    }
    if (path === "/__sandbox" || path === "/__sandbox/") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(sandboxIndex(people));
    }
    if (path === "/__sandbox/sign-in") {
      const key = url.searchParams.get("as") || "";
      const who = Object.hasOwn(people, key) ? people[key] : null;
      if (!who) {
        res.writeHead(404);
        return res.end("unknown person");
      }
      const session = await worker.signIn(who.email, { displayName: who.displayName });
      // Only ever go somewhere on this same sandbox site.
      let next = "/";
      try {
        const target = new URL(url.searchParams.get("next") || "/", site);
        if (target.origin === site) next = `${target.pathname}${target.search}${target.hash}`;
      } catch {
        next = "/";
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      return res.end(signInPage(session, next));
    }
    if (path === "/__sandbox/sign-out") {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(
        `<!doctype html><script>localStorage.removeItem("vt_account_session_v1");localStorage.removeItem("vt_license_v1");location.replace("/")</script>`
      );
    }
    if (path === "/js/billing-config.js") {
      res.writeHead(200, { "content-type": TYPES[".js"], "cache-control": "no-store" });
      return res.end(config);
    }
    if (path.split("/").some((segment) => segment.startsWith("."))) {
      res.writeHead(404);
      return res.end("not found");
    }
    const file = normalize(join(ROOT, path.endsWith("/") ? `${path}index.html` : path));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) {
      res.writeHead(403);
      return res.end();
    }
    try {
      const data = await readFile(file);
      res.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      res.end(data);
    } catch {
      res.writeHead(404);
      res.end("not found");
    }
  }));

  await new Promise((ok) => workerServer.listen(workerPort, HOST, ok));
  await new Promise((ok) => siteServer.listen(sitePort, HOST, ok));
  if (!opts.quiet) {
    console.log(`Sandbox site:    ${site}/__sandbox/`);
    console.log(`Sandbox worker:  ${workerUrl}  (real worker code, in-memory data)`);
    console.log(`Seeded gift code: ${seeded.codes.group}`);
    console.log("Ctrl+C stops it and forgets everything.");
  }
  const close = () =>
    Promise.all([
      new Promise((ok) => workerServer.close(() => ok())),
      new Promise((ok) => siteServer.close(() => ok()))
    ]).then(() => undefined);
  return { site, workerUrl, worker, seeded, people, close };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startSandbox().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
