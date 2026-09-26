/**
 * Render every challenger of every question against today's site, a few
 * harness runs at a time.
 *
 * Usage:  node qa/design-test/run-all.mjs <runs.json> [key,key...] [--jobs 2] [--states-from a.mjs,b.mjs]
 *
 * The runs file is a JSON object keyed by question. A questions file (see
 * README.md) works as a runs file as it is. Per question:
 *   states  "state,state"   (states.mjs)
 *   vps     "vp,vp"         (phone, small, land, desktop, laptop)
 *   full    true to also save full-page shots (blind.mjs turns them into
 *           "screen 2 / screen 3" tiles)
 *   arms    the challengers, either
 *             ["B", "C"]                      patches at <runs dir>/<key>/<arm>.mjs, or
 *             { "B": { "patch": "path.mjs" },  a patch module, relative to the runs file
 *               "C": { "url": "http://..." } } a challenger served from its own server
 *           An "A" entry (today's design) is skipped: every run renders it.
 *
 * Each challenger's run renders arm A too; the renders go to
 * $DT_WORK/renders/<key>/out-<arm>/ (DT_WORK defaults to <os temp dir>/design-test).
 * Arm A is BASE_URL, else http://127.0.0.1:8765.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const USAGE = "Usage: node qa/design-test/run-all.mjs <runs.json> [key,key...] [--jobs 2] [--states-from a.mjs,b.mjs]";

const argv = process.argv.slice(2);
if (argv.includes("--help") || argv.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}
const flag = (name) => {
  const i = argv.indexOf(name);
  if (i < 0) return null;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const JOBS = Math.max(1, Number(flag("--jobs") || 2));
const STATES_FROM = flag("--states-from");
const [runsArg, onlyArg] = argv;
if (!runsArg) {
  console.error(`run-all: a runs file is required\n${USAGE}`);
  process.exit(2);
}
const CWD = process.env.INIT_CWD || process.cwd();
const RUNS = path.resolve(CWD, runsArg);
const RUNS_DIR = path.dirname(RUNS);
const WORK = process.env.DT_WORK || path.join(os.tmpdir(), "design-test");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const runs = JSON.parse(fs.readFileSync(RUNS, "utf8"));
const only = onlyArg ? onlyArg.split(",") : null;
if (only) {
  const missing = only.filter((k) => !runs[k]);
  if (missing.length) {
    console.error(`run-all: not in ${runsArg}: ${missing.join(", ")}`);
    process.exit(2);
  }
}

/** The challenger arms of a question as [arm, { patch } | { url }]. */
function challengers(key, r) {
  const list = Array.isArray(r.arms) ? r.arms.map((a) => [a, {}]) : Object.entries(r.arms || {});
  return list
    .filter(([arm]) => arm !== "A")
    .map(([arm, spec]) => {
      if (spec.url) return [arm, { url: spec.url }];
      return [arm, { patch: path.resolve(RUNS_DIR, spec.patch || path.join(key, `${arm}.mjs`)) }];
    });
}

const jobs = [];
for (const [key, r] of Object.entries(runs)) {
  if (only && !only.includes(key)) continue;
  for (const [arm, spec] of challengers(key, r)) {
    if (spec.patch && !fs.existsSync(spec.patch)) {
      console.error(`run-all: ${key}/${arm}: patch module not found: ${path.relative(CWD, spec.patch)}`);
      process.exit(2);
    }
    const args = [path.join(HERE, "harness.mjs"), "--a", BASE];
    if (spec.url) args.push("--b", spec.url);
    else args.push("--inject", spec.patch);
    if (STATES_FROM) args.push("--states-from", STATES_FROM.split(",").map((f) => path.resolve(CWD, f)).join(","));
    args.push("--out", path.join(WORK, "renders", key, `out-${arm}`), "--states", r.states, "--vps", r.vps);
    if (r.full) args.push("--full");
    jobs.push({ key, arm, args });
  }
}
if (!jobs.length) {
  console.error("run-all: nothing to render (no challenger arms)");
  process.exit(2);
}

let next = 0;
let failed = 0;
async function worker() {
  while (next < jobs.length) {
    const j = jobs[next++];
    const t0 = Date.now();
    await new Promise((done) => {
      const p = spawn(process.execPath, j.args, { stdio: ["ignore", "pipe", "pipe"] });
      let err = "";
      p.stdout.resume();
      p.stderr.on("data", (d) => (err += d));
      p.on("close", (code) => {
        if (code !== 0) failed++;
        console.log(`${j.key}/${j.arm} exit ${code} ${Math.round((Date.now() - t0) / 1000)}s ${err.trim().slice(0, 300)}`);
        done();
      });
    });
  }
}
await Promise.all(Array.from({ length: Math.min(JOBS, jobs.length) }, worker));
console.log(`${jobs.length - failed} of ${jobs.length} runs done. Renders: ${path.join(WORK, "renders")}`);
if (failed) process.exit(1);
