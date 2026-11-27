import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { buildCloudflareSite } from "../../qa/build-cloudflare-site.mjs";

function fixture(edit = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), "vocal-static-"));
  const repo = join(dir, "repo"); mkdirSync(repo);
  const git = (...args) => execFileSync("git", args, { cwd: repo, encoding: "utf8" });
  git("init", "-q");
  const put = (path, content) => { mkdirSync(join(repo, path, ".."), { recursive: true }); writeFileSync(join(repo, path), content); };
  const config = 'window.VT_BILLING_CONFIG = {verification:{apiBaseUrl: "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev",required:true},demoUnlockEnabled:false};';
  const manifest = { "js/billing-config.js": { v: "original", sha: createHash("sha256").update(config).digest("hex").slice(0, 16) } };
  put("js/billing-config.js", config);
  put("js/auth-users.generated.js", "window.fixtureGenerated = true;");
  manifest["js/auth-users.generated.js"] = { v: "generated", sha: createHash("sha256").update("window.fixtureGenerated = true;").digest("hex").slice(0, 16) };
  for (const page of ["index.html", "guide.html", "privacy.html", "terms.html", "admin.html", "qa/index.html"]) {
    put(page, '<!doctype html><html><body><script src="js/billing-config.js?v=original"></script></body></html>');
  }
  put("data/technical-coaching-protocol.v1.json", "{}");
  put("workers/private.json", "must not publish tracked server files");
  edit({ put, manifest });
  put("qa/asset-manifest.json", JSON.stringify(manifest));
  git("add", "."); git("-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-qm", "source");
  const sha = git("rev-parse", "HEAD").trim();
  put(".env", "must not publish untracked secrets");
  put("js/billing-config.js", "dirty working copy must not publish");
  return { dir, repo, sha, output: join(dir, "release") };
}

test("static package uses committed content, closes accounts, preserves signature checks and excludes private files", () => {
  const f = fixture();
  try {
    const result = buildCloudflareSite(f.repo, f.sha, f.output);
    const get = (p) => readFileSync(join(f.output, "public", p), "utf8");
    assert.equal(result.sourceSha, f.sha);
    assert.equal(get("js/auth-users.generated.js"), "window.fixtureGenerated = true;");
    const context = { window: {} }; vm.runInNewContext(get("js/billing-config.js"), context);
    assert.equal(context.window.VT_BILLING_CONFIG.verification.apiBaseUrl, "");
    assert.equal(context.window.VT_BILLING_CONFIG.verification.required, true);
    assert.equal(context.window.VT_BILLING_CONFIG.demoUnlockEnabled, false);
    assert.match(get("index.html"), /Local practice preview/);
    assert.match(get("index.html"), /Vista previa/);
    const m = JSON.parse(get("qa/asset-manifest.json"))["js/billing-config.js"];
    assert.equal(m.sha, createHash("sha256").update(get("js/billing-config.js")).digest("hex").slice(0, 16));
    assert.match(get("index.html"), new RegExp("billing-config.js\\?v=" + m.v));
    assert.notEqual(m.v, "original");
    assert.deepEqual(readdirSync(f.output).sort(), ["public", "wrangler.json"]);
    assert.ok(!readdirSync(join(f.output, "public")).includes("workers"));
    assert.ok(!readdirSync(join(f.output, "public")).includes(".env"));
    assert.equal(JSON.parse(readFileSync(join(f.output, "wrangler.json"))).assets.not_found_handling, "none");
    assert.match(get("_headers"), /noindex/);
    assert.match(get("_headers"), /connect-src 'self';/);
    assert.match(get("_headers"), /frame-src 'none';/);
    assert.equal(JSON.parse(get("release.json")).accounts, false);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("future unsafe manifest paths and stale content fail before output exists", () => {
  const cases = [
    ({ manifest }) => { manifest["workers/private.json"] = { v: "1", sha: createHash("sha256").update("must not publish tracked server files").digest("hex").slice(0, 16) }; },
    ({ manifest }) => { manifest["../.env"] = { v: "1", sha: "0".repeat(16) }; },
    ({ manifest }) => { manifest["js/billing-config.js"].sha = "0".repeat(16); },
    ({ put }) => { put("index.html", "no body after upstream drift"); }
  ];
  for (const change of cases) {
    const f = fixture(change);
    try { assert.throws(() => buildCloudflareSite(f.repo, f.sha, f.output), /Static release:/); }
    finally { rmSync(f.dir, { recursive: true, force: true }); }
  }
});

test("ambiguous source and existing output are refused without overwriting data", () => {
  const f = fixture();
  try {
    assert.throws(() => buildCloudflareSite(f.repo, "main", f.output), /exact.*source commit/);
    mkdirSync(f.output); writeFileSync(join(f.output, "keep"), "operator data");
    assert.throws(() => buildCloudflareSite(f.repo, f.sha, f.output), /EEXIST/);
    assert.equal(readFileSync(join(f.output, "keep"), "utf8"), "operator data");
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});
