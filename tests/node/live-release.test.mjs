import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkLiveRelease } from "../helpers/live-release.mjs";

test("actual HTTP release check rejects stale HTML, stale same-version assets and missing files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "live-release-test-"));
  mkdirSync(join(dir, "qa"));
  const html = "<!doctype html><title>current release</title>";
  const asset = "window.release = 2;";
  const sha = createHash("sha256").update(asset).digest("hex").slice(0, 16);
  writeFileSync(join(dir, "index.html"), html);
  writeFileSync(join(dir, "qa/asset-manifest.json"), JSON.stringify({ "js/app.js": { v: "2", sha } }));
  let scenario = "valid";
  const requested = [];
  const server = createServer((req, res) => {
    requested.push(req.url);
    if (req.url === "/") return res.end(scenario === "html" ? "old release" : html);
    if (scenario === "missing") return res.writeHead(404).end("missing");
    res.end(scenario === "asset" ? "window.release = 1;" : asset);
  });
  await new Promise((done) => server.listen(0, "127.0.0.1", done));
  const url = `http://127.0.0.1:${server.address().port}/`;
  try {
    assert.equal((await checkLiveRelease(dir, url)).assets, 1);
    assert.ok(requested.includes("/js/app.js?v=2"));
    scenario = "html"; await assert.rejects(checkLiveRelease(dir, url), /index.html differs/);
    scenario = "asset"; await assert.rejects(checkLiveRelease(dir, url), /app.js\?v=2 hash differs/);
    scenario = "missing"; await assert.rejects(checkLiveRelease(dir, url), /HTTP 404/);
  } finally {
    await new Promise((done) => server.close(done));
    rmSync(dir, { recursive: true, force: true });
  }
});
