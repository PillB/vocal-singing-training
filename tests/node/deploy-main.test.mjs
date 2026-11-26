import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { validateTarget, verifyIdentity, verifyResources, verifySigning, verifyHealth, verifyEndpoint, parseJson } from "../../workers/entitlements/scripts/deploy-main.mjs";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const target = { email: "owner@example.com", accountId: "a".repeat(32), workerName: "vocal-studio-entitlements", workerUrl: "https://vocal-studio-entitlements.owner.workers.dev", kvId: "b".repeat(32), previewKvId: "c".repeat(32), databaseId: "12345678-1234-1234-1234-123456789abc", databaseName: "vocal-studio-accounts", publicKeyJwk: { kty: "EC", crv: "P-256", x: "expected-x", y: "expected-y", kid: "k1" } };
const identity = { loggedIn: true, email: target.email, accounts: [{ id: target.accountId }] };
const health = { ok: true, probe: { db: "ok", kv: "ok", writes: "ok" }, accountsConfigured: true, signingKeyConfigured: true, siteOrigin: "https://pillb.github.io", eventsEnabled: false, reportsEnabled: true, authMethods: { trialDays: 7 } };

test("operator gates reject misleading identity, bindings, keys and superficial health", () => {
  assert.equal(validateTarget(target).workerUrl, target.workerUrl);
  for (const bad of [{ ...target, vars: {} }, { ...target, previewKvId: target.kvId }, { ...target, accountId: "TODO" }, { ...target, workerUrl: target.workerUrl + "/other" }]) assert.throws(() => validateTarget(bad));
  verifyIdentity(identity, target);
  verifyEndpoint("owner", target);
  assert.throws(() => verifyEndpoint("source-account", target), /different account subdomain/);
  assert.throws(() => verifyIdentity({ ...identity, email: "other@example.com" }, target), /Wrong Cloudflare/);
  assert.throws(() => verifyIdentity({ ...identity, accounts: [] }, target), /pinned account/);
  const kv = [{ id: target.kvId }, { id: target.previewKvId }];
  const db = [{ uuid: target.databaseId, name: target.databaseName }];
  verifyResources(kv, db, target);
  assert.throws(() => verifyResources([], db, target), /KV namespace/);
  assert.throws(() => verifyResources(kv, [{ ...db[0], name: "other" }], target), /D1 database/);
  verifySigning({ keys: [target.publicKeyJwk] }, target);
  assert.throws(() => verifySigning({ keys: [{ ...target.publicKeyJwk, x: "new-key" }] }, target), /Signing identity changed/);
  const config = { vars: { SITE_ORIGIN: health.siteOrigin, TRIAL_DAYS: "7" } };
  verifyHealth(health, config, false);
  verifyHealth({ ...health, reportsEnabled: false }, { vars: { ...config.vars, REPORTS_ENABLED: "false" } }, false);
  for (const bad of [{ ...health, probe: undefined }, { ...health, probe: { db: "ok", kv: "skipped" } }, { ...health, siteOrigin: "https://evil.test" }, { ...health, authMethods: { trialDays: 30 } }]) assert.throws(() => verifyHealth(bad, config, false));
  assert.deepEqual(parseJson("[WARNING] banner\n[{\"name\":\"a\"}]"), [{ name: "a" }]);
  assert.throws(() => parseJson("API denied [not JSON]"), /malformed JSON/);
});

function fixture(extra = "") {
  const dir = mkdtempSync(join(tmpdir(), "vocal-deploy-test-"));
  const repo = join(dir, "repo"), bin = join(dir, "bin");
  mkdirSync(join(repo, "workers/entitlements"), { recursive: true });
  mkdirSync(join(repo, ".deployment-local"));
  mkdirSync(bin);
  cpSync(join(ROOT, "workers/entitlements/wrangler.toml"), join(repo, "workers/entitlements/wrangler.toml"));
  if (extra) writeFileSync(join(repo, "workers/entitlements/wrangler.toml"), readFileSync(join(repo, "workers/entitlements/wrangler.toml"), "utf8") + extra);
  writeFileSync(join(repo, ".gitignore"), ".deployment-local/\n");
  const git = (args) => execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  git(["init", "-b", "main"]); git(["add", "."]);
  git(["-c", "user.name=Fixture", "-c", "user.email=fixture@example.com", "commit", "-m", "fixture main"]);
  const remote = join(dir, "remote.git"); git(["clone", "--bare", repo, remote]);
  // The dirty operator checkout must never become deployed source or policy.
  writeFileSync(join(repo, "workers/entitlements/wrangler.toml"), "BROKEN LOCAL CONFIG");
  writeFileSync(join(repo, ".deployment-local/cloudflare.json"), JSON.stringify(target));
  const realGit = execFileSync("which", ["git"], { encoding: "utf8" }).trim();
  writeFileSync(join(bin, "git"), `#!/usr/bin/env node\nconst{spawnSync}=require('node:child_process');let a=process.argv.slice(2);if(a[0]==='fetch'||a[0]==='ls-remote')a=a.map(x=>x.startsWith('https://github.com/')?process.env.FIXTURE_REMOTE:x);if(a[0]==='ls-remote'&&process.env.SCENARIO==='stale'){console.log('f'.repeat(40)+' refs/heads/main');process.exit(0)}const r=spawnSync(${JSON.stringify(realGit)},a,{stdio:'inherit'});process.exit(r.status??1);\n`, { mode: 0o700 });
  writeFileSync(join(bin, "wrangler"), `#!/usr/bin/env node
const fs=require('node:fs');const a=process.argv.slice(2);const t=JSON.parse(process.env.FIXTURE_TARGET);const scenario=process.env.SCENARIO;
fs.appendFileSync(process.env.FIXTURE_LOG,JSON.stringify(a)+'\\n');
if(a[0]==='whoami'){if(scenario==='json'){console.log('bad JSON');process.exit(0)}console.log(JSON.stringify({loggedIn:true,email:scenario==='account'?'wrong@example.com':t.email,accounts:[{id:t.accountId}]}));}
else if(a[0]==='kv')console.log(JSON.stringify([{id:t.kvId},{id:t.previewKvId}]));
else if(a[0]==='d1')console.log(JSON.stringify([{uuid:t.databaseId,name:t.databaseName}]));
else if(a[0]==='secret'){if(scenario==='secret-error'){console.error('API unavailable');process.exit(1)}console.log(JSON.stringify(scenario==='key-missing'?[]:[{name:'LICENSE_PRIVATE_KEY_PKCS8_B64'}]));}
else if(a[0]==='auth')console.log(JSON.stringify({type:'oauth',token:'fixture-token-never-log'}));
else if(a[0]==='deployments'){const calls=fs.readFileSync(process.env.FIXTURE_LOG,'utf8').split('\\n').filter(Boolean).map(JSON.parse);const count=calls.filter(x=>x[0]==='deploy'&&!x.includes('--dry-run')).length;const reads=calls.filter(x=>x[0]==='deployments').length;const concurrent=(scenario==='concurrent-before'&&reads>1)||(scenario==='between-phases'&&count===1&&reads>=4);console.log(JSON.stringify({versions:scenario==='rollback'?[]:[{version_id:concurrent?'other-version':count&&scenario!=='unchanged-version'?'new-version-'+count:'previous-version',percentage:100}]}));}
else if(a[0]==='versions'){const calls=fs.readFileSync(process.env.FIXTURE_LOG,'utf8').split('\\n').filter(Boolean).map(JSON.parse);const last=calls.filter(x=>x[0]==='deploy'&&!x.includes('--dry-run')).at(-1);console.log(JSON.stringify({id:a[2],annotations:{'workers/message':scenario==='concurrent-after'?'different source':last[last.indexOf('--message')+1]}}));}
else if(a[0]==='deploy'){const cfg=JSON.parse(fs.readFileSync('wrangler.deploy.json'));fs.writeFileSync(process.env.FIXTURE_CONFIG,JSON.stringify(cfg));}
else process.exit(2);
`, { mode: 0o700 });
  return { dir, repo, bin, remote, sha: git(["rev-parse", "HEAD"]) };
}

function runFixture(f, scenario, args = ["--deploy"]) {
  const entry = resolve(ROOT, "workers/entitlements/scripts/deploy-main.mjs");
  const log = join(f.dir, "calls.jsonl"); writeFileSync(log, "");
  const body = `import {main} from ${JSON.stringify(new URL("file://" + entry).href)};
import {readFileSync} from 'node:fs';
function liveHealth(){const h=JSON.parse(process.env.FIXTURE_HEALTH);const calls=readFileSync(process.env.FIXTURE_LOG,'utf8').split('\\n').filter(Boolean).map(JSON.parse);const count=calls.filter(a=>a[0]==='deploy'&&!a.includes('--dry-run')).length;h.eventsEnabled=count>1&&process.env.SCENARIO!=='phase2-health';return h;}
globalThis.fetch=async(url)=>({ok:!(process.env.SCENARIO==='probe-error'&&url.includes('health')),status:503,json:async()=>url.includes('subdomain')?{success:true,result:{subdomain:process.env.SCENARIO==='endpoint'?'old-source':'owner'}}:url.includes('jwks')?{keys:[{kty:'EC',crv:'P-256',x:process.env.SCENARIO==='key-changed'?'unexpected-new-key':'expected-x',y:'expected-y',kid:'k1'}]}:liveHealth()});
try{await main(${JSON.stringify(args)},${JSON.stringify(f.repo)})}catch(e){console.error(e.message);process.exitCode=1}`;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", body], { encoding: "utf8", timeout: 30000, env: { ...process.env, CLOUDFLARE_ENV: scenario === "environment" ? "preview" : "", WRANGLER_CI_OVERRIDE_NAME: scenario === "name-override" ? "other-worker" : "", CF_API_BASE_URL: scenario === "deprecated-api" ? "https://wrong.invalid" : "", PATH: f.bin + ":" + process.env.PATH, VT_WRANGLER_BIN: join(f.bin, "wrangler"), FIXTURE_REMOTE: f.remote, FIXTURE_LOG: log, FIXTURE_CONFIG: join(f.dir, "composed.json"), FIXTURE_TARGET: JSON.stringify(target), FIXTURE_HEALTH: JSON.stringify(health), SCENARIO: scenario } });
  return { ...result, calls: readFileSync(log, "utf8").split("\n").filter(Boolean).map(JSON.parse) };
}

test("exact-main integration ignores dirty checkout and only overlays private bindings", () => {
  const f = fixture();
  try {
    const result = runFixture(f, "ok");
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, new RegExp(f.sha));
    assert.equal(result.calls.filter((a) => a[0] === "deploy" && !a.includes("--dry-run")).length, 1);
    const config = JSON.parse(readFileSync(join(f.dir, "composed.json")));
    assert.equal(config.vars.TRIAL_DAYS, "7");
    assert.equal(config.account_id, target.accountId);
    assert.equal(config.kv_namespaces[0].id, target.kvId);
    assert.equal(readFileSync(join(f.repo, "workers/entitlements/wrangler.toml"), "utf8"), "BROKEN LOCAL CONFIG");
    const receipts = readdirSync(join(f.repo, ".deployment-local")).filter((p) => p.startsWith("deploy-"));
    const receipt = JSON.parse(readFileSync(join(f.repo, ".deployment-local", receipts[0])));
    assert.equal(receipt.sourceSha, f.sha); assert.equal(receipt.previousVersion, "previous-version"); assert.equal(receipt.status, "deployed-events-off"); assert.equal(receipt.deployedVersion, "new-version-1");
    assert.doesNotMatch(result.stdout + result.stderr + JSON.stringify(receipt), /fixture-token-never-log/);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

for (const scenario of ["account", "json", "secret-error", "key-missing", "rollback", "stale", "endpoint", "environment", "name-override", "deprecated-api", "key-changed", "concurrent-before"]) {
  test(`failed ${scenario} preflight performs zero cloud mutations`, () => {
    const f = fixture();
    try {
      const result = runFixture(f, scenario);
      assert.equal(result.status, 1, result.stdout + result.stderr);
      assert.equal(result.calls.filter((a) => a[0] === "deploy" && !a.includes("--dry-run")).length, 0);
      assert.equal(result.calls.filter((a) => ["create", "put", "delete"].some((word) => a.includes(word))).length, 0);
      assert.notEqual(result.stderr.trim(), "");
    } finally { rmSync(f.dir, { recursive: true, force: true }); }
  });
}

test("new main resource shape fails before any deployment", () => {
  const f = fixture('\n[[r2_buckets]]\nbinding = "NEW_DATA"\nbucket_name = "new-data"\n');
  try {
    const result = runFixture(f, "ok");
    assert.equal(result.status, 1); assert.match(result.stderr, /unsupported Worker settings/);
    assert.equal(result.calls.length, 0);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

for (const scenario of ["unchanged-version", "concurrent-after"]) test(`unverified ${scenario} stops after one write with rollback evidence`, () => {
  const f = fixture();
  try {
    const result = runFixture(f, scenario);
    assert.equal(result.status, 1);
    assert.equal(result.calls.filter((a) => a[0] === "deploy" && !a.includes("--dry-run")).length, 1);
    const receipt = readdirSync(join(f.repo, ".deployment-local")).find((p) => p.startsWith("deploy-"));
    assert.equal(JSON.parse(readFileSync(join(f.repo, ".deployment-local", receipt))).previousVersion, "previous-version");
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("failed post-deploy probe preserves rollback receipt and never retries or enables events", () => {
  const f = fixture();
  try {
    const result = runFixture(f, "probe-error", ["--deploy", "--enable-events"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /HTTP 503/);
    assert.equal(result.calls.filter((a) => a[0] === "deploy" && !a.includes("--dry-run")).length, 1);
    const receipt = readdirSync(join(f.repo, ".deployment-local")).find((p) => p.startsWith("deploy-"));
    assert.equal(JSON.parse(readFileSync(join(f.repo, ".deployment-local", receipt))).previousVersion, "previous-version");
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

for (const scenario of ["ok", "phase2-health"]) test(`analytics ${scenario} records the actual second version before final probes`, () => {
  const f = fixture();
  try {
    const result = runFixture(f, scenario, ["--deploy", "--enable-events"]);
    assert.equal(result.status, scenario === "ok" ? 0 : 1, result.stdout + result.stderr);
    const file = readdirSync(join(f.repo, ".deployment-local")).find((p) => p.startsWith("deploy-"));
    const receipt = JSON.parse(readFileSync(join(f.repo, ".deployment-local", file)));
    assert.equal(receipt.eventsOffVersion, "new-version-1");
    assert.equal(receipt.deployedVersion, "new-version-2");
    assert.equal(receipt.status, scenario === "ok" ? "deployed-events-on" : "deploying-events-on");
    assert.equal(result.calls.filter((a) => a[0] === "deploy" && !a.includes("--dry-run")).length, 2);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});

test("another deployment during phase-one probes is never overwritten by phase two", () => {
  const f = fixture();
  try {
    const result = runFixture(f, "between-phases", ["--deploy", "--enable-events"]);
    assert.equal(result.status, 1); assert.match(result.stderr, /refusing to overwrite/);
    assert.equal(result.calls.filter((a) => a[0] === "deploy" && !a.includes("--dry-run")).length, 1);
  } finally { rmSync(f.dir, { recursive: true, force: true }); }
});
