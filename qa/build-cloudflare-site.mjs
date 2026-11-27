/** Package an exact committed static release, never the operator's working directory. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const API = "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev";
const PAGES = ["index.html", "guide.html", "privacy.html", "terms.html", "admin.html", "qa/index.html"];
const DATA = "data/technical-coaching-protocol.v1.json";
const CONFIG = "js/billing-config.js";
const digest = (text) => createHash("sha256").update(text).digest("hex");
const NOTICE = `<aside role="note" style="margin:1rem;padding:1rem;border:2px solid currentColor;border-radius:8px">
<p lang="es"><strong>Vista previa de práctica local.</strong> Esta copia guarda el progreso solo en este navegador. Las cuentas, compras y sincronización existentes siguen en <a href="https://pillb.github.io/vocal-singing-training/">Vocal Studio actual</a>.</p>
<p lang="en"><strong>Local practice preview.</strong> This copy saves progress in this browser only. Existing accounts, purchases and sync remain on <a href="https://pillb.github.io/vocal-singing-training/">current Vocal Studio</a>.</p>
</aside>`;

function git(root, args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8", maxBuffer: 16 * 1024 * 1024 });
}

/** Git mode checking also rejects committed symlinks; untracked files cannot enter. */
function blob(root, sha, path) {
  const entry = git(root, ["ls-tree", sha, "--", path]);
  if (!entry.startsWith("100644 blob ")) throw new Error(`Static release: missing/non-regular committed file ${path}`);
  return git(root, ["show", `${sha}:${path}`]);
}

function publicAssets(root, sha) {
  const manifest = JSON.parse(blob(root, sha, "qa/asset-manifest.json"));
  const files = new Map();
  for (const [path, info] of Object.entries(manifest)) {
    if (!/^(?:js|css|qa)\/(?:[\w-][\w.-]*\/)*[\w-][\w.-]*\.(?:js|css)$/.test(path)) {
      throw new Error(`Static release: forbidden asset path ${path}`);
    }
    const content = blob(root, sha, path);
    if (digest(content).slice(0, 16) !== info.sha || typeof info.v !== "string") throw new Error(`Static release: stale manifest for ${path}`);
    files.set(path, content);
  }
  return { files, manifest };
}

function practiceOnly(files, manifest, sha) {
  const source = files.get(CONFIG);
  const needle = `apiBaseUrl: "${API}"`;
  if (typeof source !== "string" || source.split(needle).length !== 2) throw new Error("Static release: review changed backend configuration before publishing preview");
  const closed = source.replace(needle, 'apiBaseUrl: ""');
  const previous = manifest[CONFIG].v;
  const version = `${previous}-cf-preview-${sha.slice(0, 12)}`;
  files.set(CONFIG, closed);
  manifest[CONFIG] = { ...manifest[CONFIG], v: version, sha: digest(closed).slice(0, 16) };
  return { previous, version };
}

function previewPage(html, stamp, page) {
  if (!/<body(?:\s[^>]*)?>/.test(html)) throw new Error(`Static release: missing body in ${page}`);
  const old = `billing-config.js?v=${stamp.previous}`;
  const current = html.replaceAll(old, `billing-config.js?v=${stamp.version}`);
  return current.replace(/<body(?:\s[^>]*)?>/, (body) => body + NOTICE);
}

function previewHeaders(sha, html) {
  const hashes = [...new Set(html.match(/'sha256-[a-zA-Z0-9+/=]+'/g) || [])].join(" ");
  const csp = `default-src 'self'; script-src 'self' ${hashes}; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self'; frame-src 'none'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'`;
  return `/*\n  X-Robots-Tag: noindex, nofollow\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: microphone=(self), camera=(), geolocation=()\n  X-Vocal-Source: ${sha}\n  Content-Security-Policy: ${csp}\n`;
}

/** No API, signing key, data migration, account lookup or secret is part of this build. */
export function buildCloudflareSite(root, sha, output) {
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Static release: require an exact 40-character source commit");
  git(root, ["cat-file", "-e", `${sha}^{commit}`]);
  const { files, manifest } = publicAssets(root, sha);
  const stamp = practiceOnly(files, manifest, sha);
  for (const page of PAGES) files.set(page, previewPage(blob(root, sha, page), stamp, page));
  files.set(DATA, blob(root, sha, DATA));
  files.set("qa/asset-manifest.json", JSON.stringify(manifest, null, 2) + "\n");
  files.set("release.json", JSON.stringify({ sourceSha: sha, mode: "local-practice-preview", accounts: false, payments: false, sync: false, assets: Object.keys(manifest).length }, null, 2) + "\n");
  files.set("robots.txt", "User-agent: *\nDisallow: /\n");
  files.set("_headers", previewHeaders(sha, files.get("index.html")));
  // Refuse an existing destination, rather than deleting/copying over operator data.
  mkdirSync(output);
  for (const [path, content] of files) {
    const full = join(output, "public", path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, content);
  }
  writeFileSync(join(output, "wrangler.json"), JSON.stringify({ name: "vocal-studio", compatibility_date: "2026-11-26", workers_dev: true, assets: { directory: "./public", html_handling: "auto-trailing-slash", not_found_handling: "none" } }, null, 2) + "\n");
  return { sourceSha: sha, files: files.size, assets: Object.keys(manifest).length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = fileURLToPath(new URL("../", import.meta.url));
  try {
    if (process.argv.length !== 4) throw new Error("Usage: node qa/build-cloudflare-site.mjs <exact-main-sha> <new-output-directory>");
    console.log(JSON.stringify(buildCloudflareSite(root, process.argv[2], resolve(process.argv[3]))));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
