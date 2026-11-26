/** Operator tool: exact-main deployment with local ownership and rollback records.
 * Run by hand via ./wrangler.sh; tests/node/deploy-main.test.mjs exercises it.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, rmSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const REPOSITORY = "https://github.com/PillB/vocal-singing-training.git";
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PIN = "4.144.0";
let diagnosticDirectory = join(ROOT, ".deployment-local");

export function parseJson(raw) {
  const text = String(raw).replace(/\x1b\[[0-9;]*m/g, "").trim();
  try { return JSON.parse(text); } catch { /* Wrangler may precede JSON with a banner. */ }
  for (let at = 0; at < text.length; at++) {
    if (!"[{".includes(text[at])) continue;
    try { return JSON.parse(text.slice(at)); } catch { /* Try the next JSON start. */ }
  }
  throw new Error("Wrangler returned malformed JSON; no deployment is safe.");
}

function validateIds(value) {
  if (!/^[a-f0-9]{32}$/i.test(value.accountId)) throw new Error("Invalid account ID.");
  if (![value.kvId, value.previewKvId].every((id) => /^[a-f0-9]{32}$/i.test(id))) throw new Error("Invalid KV IDs.");
  if (value.kvId === value.previewKvId) throw new Error("Live and preview KV must differ.");
  if (!/^[a-f0-9-]{36}$/i.test(value.databaseId)) throw new Error("Invalid D1 ID.");
  if (!/^[a-z0-9][a-z0-9-]*$/.test(value.workerName)) throw new Error("Invalid Worker name.");
}

function validateUrl(value) {
  const url = new URL(value.workerUrl);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) throw new Error("Worker URL must be a bare HTTPS origin.");
  if (!url.hostname.startsWith(value.workerName + ".") || !url.hostname.endsWith(".workers.dev")) throw new Error("Worker URL and name disagree.");
  return url.origin;
}

export function validateTarget(value) {
  const fields = ["email", "accountId", "workerName", "workerUrl", "kvId", "previewKvId", "databaseId", "databaseName", "publicKeyJwk"];
  if (!value || fields.some((key) => !value[key])) throw new Error("Local deployment record is incomplete.");
  if (Object.keys(value).some((key) => !fields.includes(key))) throw new Error("Unexpected local override; only ownership and resource fields are allowed.");
  validateIds(value);
  if (value.publicKeyJwk.kty !== "EC" || value.publicKeyJwk.crv !== "P-256" || !value.publicKeyJwk.x || !value.publicKeyJwk.y) throw new Error("Expected public signing key is missing.");
  return { ...value, workerUrl: validateUrl(value) };
}

export function verifyIdentity(identity, target) {
  if (identity.loggedIn !== true || identity.email?.toLowerCase() !== target.email.toLowerCase()) throw new Error("Wrong Cloudflare login; run Wrangler login for the email in the private deployment record.");
  if (!identity.accounts?.some((account) => account.id === target.accountId)) throw new Error("Cloudflare login cannot access the pinned account.");
}

export function verifyResources(kv, databases, target) {
  if (!Array.isArray(kv) || !Array.isArray(databases)) throw new Error("Resource inventory is incomplete.");
  for (const id of [target.kvId, target.previewKvId]) {
    if (!kv.some((row) => row.id === id)) throw new Error("Pinned KV namespace does not belong to this account.");
  }
  if (!databases.some((row) => row.uuid === target.databaseId && row.name === target.databaseName)) throw new Error("Pinned D1 database does not belong to this account or has a different name.");
}

export function verifySigning(keys, target) {
  if (!keys?.keys?.some((key) => key.kty === "EC" && key.crv === "P-256" && key.x === target.publicKeyJwk.x && key.y === target.publicKeyJwk.y && key.kid === target.publicKeyJwk.kid)) throw new Error("Signing identity changed; stop and recover the original key or plan an explicit key transition.");
}

export function verifyEndpoint(subdomain, target) {
  if (!/^[a-z0-9-]+$/.test(subdomain || "")) throw new Error("Cloudflare did not report an account subdomain.");
  if (target.workerUrl !== `https://${target.workerName}.${subdomain}.workers.dev`) throw new Error("Worker URL belongs to a different account subdomain; refusing to deploy one Worker and probe another.");
}

function verifyEnvironment(env) {
  for (const key of ["CLOUDFLARE_ENV", "WRANGLER_ENV", "WRANGLER_CI_OVERRIDE_NAME", "CLOUDFLARE_API_BASE_URL", "CF_API_BASE_URL", "WRANGLER_API_BASE_URL", "WRANGLER_API_ENVIRONMENT", "CLOUDFLARE_COMPLIANCE_REGION", "WRANGLER_AUTH_DOMAIN", "WRANGLER_TOKEN_URL"]) {
    if (env[key]) throw new Error(`Unset ${key}; environment-based deployment retargeting is unsupported.`);
  }
}

export function verifyHealth(health, config, events) {
  if (health.ok !== true || health.probe?.db !== "ok" || health.probe?.kv !== "ok" || health.probe?.writes === "failing") throw new Error("Live D1/KV read probe did not pass.");
  if (!health.accountsConfigured || !health.signingKeyConfigured || health.siteOrigin !== config.vars.SITE_ORIGIN) throw new Error("Live account/signing/origin configuration differs from the intended deployment.");
  if (health.eventsEnabled !== events || health.reportsEnabled !== (config.vars.REPORTS_ENABLED !== "false") || health.authMethods?.trialDays !== Number(config.vars.TRIAL_DAYS)) throw new Error("Live events/reports/trial policy differs from main.");
}

function command(binary, args, options = {}) {
  try {
    return execFileSync(binary, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024, timeout: 180000, stdio: ["pipe", "pipe", "pipe"], ...options });
  } catch (error) {
    mkdirSync(diagnosticDirectory, { recursive: true, mode: 0o700 });
    const path = join(diagnosticDirectory, `command-error-${Date.now()}.log`);
    writeFileSync(path, String(error.stderr || error.message), { mode: 0o600 });
    throw new Error(`Command ${binary.split("/").pop()} ${args[0]} failed (exit ${error.status ?? "unknown"}). Private diagnostics: ${path}`);
  }
}

function wrangler(args, cwd, target) {
  const custom = process.env.VT_WRANGLER_BIN;
  return command(custom || "npx", custom ? args : ["--yes", `wrangler@${PIN}`, ...args], {
    cwd, env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: target.accountId, WRANGLER_SEND_METRICS: "false" }
  });
}

function snapshot(repository) {
  command("git", ["fetch", "--no-tags", REPOSITORY, "refs/heads/main"], { cwd: repository });
  const sha = command("git", ["rev-parse", "FETCH_HEAD"], { cwd: repository }).trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Cannot resolve freshly fetched main.");
  const folder = mkdtempSync(join(tmpdir(), "vocal-main-deploy-"));
  const archive = command("git", ["archive", "--format=tar", sha], { cwd: repository, encoding: "buffer" });
  command("tar", ["-xf", "-", "-C", folder], { input: archive });
  return { folder, sha };
}

function configuration(folder, target) {
  const cwd = join(folder, "workers/entitlements");
  const config = JSON.parse(command("python3", ["-c", "import sys,json,tomllib;print(json.dumps(tomllib.load(open(sys.argv[1],'rb'))))", join(cwd, "wrangler.toml")]));
  const keys = ["name", "main", "compatibility_date", "compatibility_flags", "kv_namespaces", "d1_databases", "vars", "triggers", "observability", "account_id", "workers_dev"];
  if (Object.keys(config).some((key) => !keys.includes(key))) throw new Error("main added unsupported Worker settings/resources; review before deployment.");
  if (config.env || config.name !== target.workerName || config.kv_namespaces?.length !== 1 || config.d1_databases?.length !== 1) throw new Error("main changed its environment/binding shape/name; review the deployment contract before proceeding.");
  if (config.kv_namespaces[0].binding !== "ENTITLEMENTS" || config.d1_databases[0].binding !== "DB") throw new Error("main changed its binding names.");
  config.account_id = target.accountId;
  config.workers_dev = true;
  config.kv_namespaces[0].id = target.kvId;
  config.kv_namespaces[0].preview_id = target.previewKvId;
  config.d1_databases[0].database_id = target.databaseId;
  config.d1_databases[0].database_name = target.databaseName;
  writeFileSync(join(cwd, "wrangler.deploy.json"), JSON.stringify(config), { mode: 0o600 });
  return { cwd, config };
}

async function getJson(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20000), cache: "no-store" });
  if (!response.ok) throw new Error(`Live verification refused HTTP ${response.status} at ${new URL(url).pathname}.`);
  return response.json();
}

async function accountEndpoint(cwd, target) {
  // Capture credentials in memory only. Never print them, pass them as process
  // arguments, save them in a receipt or forward them through a redirect.
  const auth = parseJson(wrangler(["auth", "token", "--json"], cwd, target));
  if (!["oauth", "api_token"].includes(auth.type) || typeof auth.token !== "string") throw new Error("Use Wrangler OAuth or a scoped API token; global API keys are unsupported.");
  const response = await fetch(`https://api.cloudflare.com/client/v4/accounts/${target.accountId}/workers/subdomain`, {
    headers: { Authorization: `Bearer ${auth.token}` }, signal: AbortSignal.timeout(20000), redirect: "error"
  });
  if (!response.ok) throw new Error(`Cloudflare account subdomain inventory refused HTTP ${response.status}.`);
  const value = await response.json();
  if (value.success !== true) throw new Error("Cloudflare account subdomain inventory failed.");
  verifyEndpoint(value.result?.subdomain, target);
}

function currentVersion(cwd, target) {
  const deployment = parseJson(wrangler(["deployments", "status", "--json", "--config", "wrangler.deploy.json"], cwd, target));
  const version = deployment.versions?.[0]?.version_id;
  if (!version || deployment.versions.length !== 1 || deployment.versions[0].percentage !== 100) throw new Error("No single 100% rollback version; review deployment state before proceeding.");
  return version;
}

function verifiedVersion(cwd, target, message, previous) {
  const id = currentVersion(cwd, target);
  if (id === previous) throw new Error("Deployment did not publish a new live version. Inspect the rollback receipt before retrying.");
  const version = parseJson(wrangler(["versions", "view", id, "--json", "--config", "wrangler.deploy.json"], cwd, target));
  if (version.id !== id || version.annotations?.["workers/message"] !== message) throw new Error("Another deployment or a different source version is live; stop and inspect the private receipt.");
  return id;
}

async function publish(cwd, target, source, record, receipt, config, enableEvents) {
  const args = ["deploy", "--config", "wrangler.deploy.json"];
  const message = `main ${source.sha}; events off`;
  wrangler([...args, "--var", "EVENTS_ENABLED:false", "--message", message], cwd, target);
  record.eventsOffVersion = verifiedVersion(cwd, target, message, record.previousVersion);
  writeFileSync(receipt, JSON.stringify(record, null, 2), { mode: 0o600 });
  verifyHealth(await getJson(target.workerUrl + "/v1/health?probe=1"), config, false);
  verifySigning(await getJson(target.workerUrl + "/v1/jwks"), target);
  if (enableEvents) {
    const next = `main ${source.sha}; events on`;
    if (currentVersion(cwd, target) !== record.eventsOffVersion) throw new Error("Events-off version changed during verification; refusing to overwrite another deployment.");
    record.status = "deploying-events-on";
    writeFileSync(receipt, JSON.stringify(record, null, 2), { mode: 0o600 });
    wrangler([...args, "--message", next], cwd, target);
    record.deployedVersion = verifiedVersion(cwd, target, next, record.eventsOffVersion);
    writeFileSync(receipt, JSON.stringify(record, null, 2), { mode: 0o600 });
    verifyHealth(await getJson(target.workerUrl + "/v1/health?probe=1"), config, true);
    verifySigning(await getJson(target.workerUrl + "/v1/jwks"), target);
  }
  record.deployedVersion ||= record.eventsOffVersion;
}

function preflight(cwd, target) {
  const args = ["--config", "wrangler.deploy.json"];
  verifyIdentity(parseJson(wrangler(["whoami", "--json"], cwd, target)), target);
  verifyResources(parseJson(wrangler(["kv", "namespace", "list", ...args], cwd, target)), parseJson(wrangler(["d1", "list", "--json", ...args], cwd, target)), target);
  const secrets = parseJson(wrangler(["secret", "list", ...args], cwd, target));
  if (!Array.isArray(secrets) || !secrets.some((row) => row.name === "LICENSE_PRIVATE_KEY_PKCS8_B64")) throw new Error("Existing signing secret is unverified; this command never provisions or rotates keys.");
  return currentVersion(cwd, target);
}

function freshMain(repository, sha) {
  const current = command("git", ["ls-remote", REPOSITORY, "refs/heads/main"], { cwd: repository }).split(/\s/)[0];
  if (current !== sha) throw new Error("main advanced during preflight. Re-run to build and validate the new revision.");
}

function options(argv, repository) {
  const opts = { deploy: false, events: false, file: join(repository, ".deployment-local/cloudflare.json") };
  while (argv.length) {
    const arg = argv.shift();
    if (arg === "--deploy") opts.deploy = true;
    else if (arg === "--plan") opts.deploy = false;
    else if (arg === "--enable-events") opts.events = true;
    else if (arg === "--config" && argv.length) opts.file = resolve(argv.shift());
    else throw new Error("Unknown option: " + arg);
  }
  return opts;
}

export async function main(argv = process.argv.slice(2), repository = ROOT) {
  if (argv.includes("--help")) { console.log("./wrangler.sh [--plan|--deploy] [--enable-events] [--config private.json]\nFetch exact main, verify account/resources/signing, build; --deploy writes an events-off version.\n--enable-events explicitly enables analytics after read probes. No setup, migration or key rotation."); return; }
  const opts = options(argv, repository);
  verifyEnvironment(process.env);
  const target = validateTarget(JSON.parse(readFileSync(opts.file, "utf8")));
  const state = join(repository, ".deployment-local");
  diagnosticDirectory = state;
  mkdirSync(state, { recursive: true, mode: 0o700 });
  const lock = join(state, "deploy.lock");
  if (opts.deploy) mkdirSync(lock);
  let source;
  try {
    source = snapshot(repository);
    const { cwd, config } = configuration(source.folder, target);
    if (opts.events && config.vars.EVENTS_ENABLED !== "true") throw new Error("main does not enable analytics; --enable-events cannot override its policy.");
    const previousVersion = preflight(cwd, target);
    await accountEndpoint(cwd, target);
    verifySigning(await getJson(target.workerUrl + "/v1/jwks"), target);
    wrangler(["deploy", "--dry-run", "--config", "wrangler.deploy.json", "--var", "EVENTS_ENABLED:false"], cwd, target);
    freshMain(repository, source.sha);
    if (currentVersion(cwd, target) !== previousVersion) throw new Error("Live deployment changed during preflight. Re-run to capture its actual rollback version.");
    const record = { checkedAt: new Date().toISOString(), sourceSha: source.sha, workerUrl: target.workerUrl, workerName: target.workerName, accountId: target.accountId, loginEmail: target.email, target, previousVersion, status: "plan-passed" };
    const receipt = join(state, `deploy-${Date.now()}.json`);
    writeFileSync(receipt, JSON.stringify(record, null, 2), { mode: 0o600 });
    console.log(`Verified main ${source.sha}; rollback ${previousVersion}.`);
    if (!opts.deploy) { console.log("Plan passed. Nothing deployed."); return; }
    record.status = "deploying-events-off";
    writeFileSync(receipt, JSON.stringify(record, null, 2), { mode: 0o600 });
    await publish(cwd, target, source, record, receipt, config, opts.events);
    record.status = opts.events ? "deployed-events-on" : "deployed-events-off";
    record.completedAt = new Date().toISOString();
    writeFileSync(receipt, JSON.stringify(record, null, 2), { mode: 0o600 });
    console.log(`Deployment verified; analytics ${opts.events ? "on" : "off"}. Receipt: ${receipt}`);
  } finally {
    if (source) rmSync(source.folder, { recursive: true, force: true });
    if (opts.deploy && existsSync(lock)) rmSync(lock, { recursive: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error("Deployment stopped: " + error.message + "\nCheck the private rollback receipt before any retry. No automatic retry or rollback was attempted."); process.exitCode = 1; });
}
