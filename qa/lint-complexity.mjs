/**
 * chore(lint): parser-backed cyclomatic-complexity gate.
 *
 * ESLint's official `complexity` rule enforces McCabe modified CC <= 15
 * (eslint.config.mjs). Existing >15 functions are acknowledged by exact
 * source-content hashes in qa/complexity-baseline.json. Changing one
 * invalidates its exemption. New functions have no exemption. This pays debt
 * down without a blanket eslint-disable or an absurd threshold.
 *
 *   node qa/lint-complexity.mjs                      # the gate
 *   node qa/lint-complexity.mjs --prune-baseline     # drop exemptions for code that was fixed
 *   node qa/lint-complexity.mjs --baseline-ref origin/main
 *        # also fail if the baseline gained an exemption the ref did not have
 *   node qa/lint-complexity.mjs --no-baseline --file <path>   # fixtures
 *
 * The baseline can only shrink. `--prune-baseline` removes stale entries and
 * refuses to add any; there is deliberately no flag that blesses new debt.
 * A hand-edited baseline that grows is caught by `--baseline-ref` in CI.
 */
import { ESLint } from "eslint";
import { parse } from "espree";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const CEILING = 15;
// Excluded by exact repository path, never by folder name: a name-based skip
// let any function dodge the gate by living in a folder called "fixtures".
export const EXCLUDED_PATHS = new Set([
  "node_modules",
  "test-results",
  "playwright-report",
  "tests/fixtures", // JSON snapshots
  "qa/fixtures", // the deliberate good/bad controls, linted explicitly by qa/lint-gate.test.mjs
  "qa/design-test/site-review", // generated review renders, not shipped code
  "qa/screenshots",
  "qa/geometry"
]);
export const SCANNED = /\.(?:js|mjs|cjs)$/;
// Source the parser cannot read. Their presence fails the gate rather than
// being silently skipped, so a .ts or .jsx file is not a way around it.
export const UNSCANNABLE = /\.(?:ts|tsx|jsx|mts|cts)$/;

/** Every lintable file under js/ qa/ tests/ workers/ plus root modules. */
export function projectFiles(root) {
  const found = [];
  const unscannable = [];
  function visit(dir) {
    for (const item of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const name = dir + "/" + item.name;
      if (item.isDirectory()) {
        if (!EXCLUDED_PATHS.has(name)) visit(name);
      } else if (SCANNED.test(item.name)) found.push(name);
      else if (UNSCANNABLE.test(item.name)) unscannable.push(name);
    }
  }
  for (const dir of ["js", "qa", "tests", "workers"]) {
    if (existsSync(path.join(root, dir))) visit(dir);
  }
  // Root-level build/test configuration too: a new monolithic helper in
  // playwright.config.js or another root module must not bypass the gate.
  for (const item of readdirSync(root, { withFileTypes: true })) {
    if (item.isFile() && SCANNED.test(item.name)) found.push(item.name);
    else if (item.isFile() && UNSCANNABLE.test(item.name)) unscannable.push(item.name);
  }
  return { files: found.sort(), unscannable: unscannable.sort() };
}

const FUNCTION_NODE = /^(?:FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|MethodDefinition)$/;
const functionCache = new Map();

function collectFunctions(source) {
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "module", loc: true, range: true });
  const found = [];
  (function walk(node) {
    if (!node || typeof node !== "object") return;
    if (FUNCTION_NODE.test(node.type)) found.push(node);
    for (const [key, value] of Object.entries(node)) {
      if (key === "loc" || key === "range" || key === "tokens") continue;
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === "object") walk(value);
    }
  })(ast);
  return found;
}

function byProximity(column) {
  return (a, b) =>
    Math.abs(a.loc.start.column + 1 - column) - Math.abs(b.loc.start.column + 1 - column) ||
    a.range[1] - a.range[0] - (b.range[1] - b.range[0]);
}

function enclosingFunction(source, line, column) {
  let found = functionCache.get(source);
  if (!found) {
    found = collectFunctions(source);
    functionCache.set(source, found);
  }
  const onLine = found.filter((node) => node.loc.start.line === line);
  // The rule reports at the function/method head. On a line with several
  // arrows, column proximity disambiguates which source gets hashed.
  const candidates = onLine.length
    ? onLine
    : found.filter((node) => node.loc.start.line <= line && node.loc.end.line >= line);
  candidates.sort(byProximity(column));
  const node = candidates[0];
  if (!node) throw new Error(`No function at ${line}:${column}`);
  return source.slice(node.range[0], node.range[1]);
}

function toEntry(file, source, m) {
  const fnSource = enclosingFunction(source, m.line, m.column);
  return {
    file,
    sha: createHash("sha256").update(fnSource).digest("hex"),
    complexity: Number(m.message.match(/complexity of (\d+)/)?.[1] || 0),
    name: m.message.split(" has a complexity")[0]
  };
}

const entryOrder = (a, b) =>
  a.file.localeCompare(b.file) || a.name.localeCompare(b.name) || a.sha.localeCompare(b.sha);

/** Lint `files` and return one entry per function over the ceiling. */
export async function violations(files, root = process.cwd()) {
  const eslint = new ESLint({ cwd: root, overrideConfigFile: path.join(root, "eslint.config.mjs") });
  const results = await eslint.lintFiles(files);
  const entries = [];
  for (const result of results) {
    const errors = result.messages.filter((m) => m.severity === 2);
    if (!errors.length) continue;
    const file = path.relative(root, result.filePath).replaceAll(path.sep, "/");
    const source = readFileSync(result.filePath, "utf8");
    for (const m of errors) {
      if (m.ruleId !== "complexity") throw new Error(`${file}:${m.line} ${m.message}`);
      entries.push(toEntry(file, source, m));
    }
  }
  return entries.sort(entryOrder);
}

export const signature = (v) => `${v.file}:${v.sha}:${v.complexity}`;

/**
 * Entries of `a` beyond what `b` covers, counted per signature. A function
 * expression's hash does not include the name it is bound to, so two pasted
 * copies of one exempt arrow share a signature; a set would let the second
 * copy ride on the first's exemption (QA-07). A multiset does not.
 */
export function surplus(a, b) {
  const left = new Map();
  for (const v of b) left.set(signature(v), (left.get(signature(v)) || 0) + 1);
  return a.filter((v) => {
    const k = signature(v);
    const n = left.get(k) || 0;
    if (n > 0) {
      left.set(k, n - 1);
      return false;
    }
    return true;
  });
}

/**
 * Compare current violations with the exemption list.
 * newDebt: over the ceiling and not exempt (a new function, an exempt one
 * that was edited and so no longer matches its hash, or one more copy of an
 * exempt function than the baseline lists). stale: an exemption whose
 * function no longer exists in that exact form (or in that many copies).
 */
export function classify(current, baseline) {
  return {
    newDebt: surplus(current, baseline),
    stale: surplus(baseline, current)
  };
}

/** The baseline minus stale entries. Never adds anything. */
export function pruneBaseline(baseline, current) {
  const stale = new Set(surplus(baseline, current));
  return baseline.filter((v) => !stale.has(v));
}

/** Exemptions present in `next` beyond what `prev` had: debt being blessed. */
export function grownExemptions(prev, next) {
  return surplus(next, prev);
}

function readBaseline(file) {
  return JSON.parse(readFileSync(file, "utf8")).entries;
}

const git = (args, root) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });

/**
 * The baseline at `ref`: its entries; "none" when the ref exists but has no
 * baseline yet (the PR that introduces the gate); null when the ref itself
 * cannot be resolved, which must fail rather than skip (QA-08: a typo or an
 * unfetched branch silently turned the check off).
 */
export function baselineAtRef(ref, root) {
  try {
    git(["rev-parse", "--verify", "--quiet", `${ref}^{commit}`], root);
  } catch {
    return null;
  }
  try {
    return JSON.parse(git(["show", `${ref}:qa/complexity-baseline.json`], root)).entries;
  } catch {
    return "none";
  }
}

function argValue(args, flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

function report(newDebt, stale) {
  for (const v of newDebt.slice(0, 25)) {
    console.error(`NEW complexity ${v.complexity}>${CEILING} ${v.file} ${v.name}`);
  }
  for (const v of stale.slice(0, 15)) {
    console.error(`STALE exception ${v.file} ${v.name} (run: npm run lint:prune)`);
  }
  console.error(`FAIL: ${newDebt.length} unapproved violations, ${stale.length} stale exceptions.`);
}

function checkRef(ref, baseline, root) {
  const prev = baselineAtRef(ref, root);
  if (prev === null) {
    console.error(`FAIL: --baseline-ref ${JSON.stringify(ref)} does not resolve to a commit; the growth check cannot run.`);
    return false;
  }
  if (prev === "none") {
    // Bootstrap only: removing the file on the base branch cannot open this,
    // because the plain gate then fails every legacy violation as new debt.
    console.log(`NOTE: ${ref} has no complexity baseline yet; growth check starts once it does.`);
    return true;
  }
  const grown = grownExemptions(prev, baseline);
  for (const v of grown.slice(0, 25)) {
    console.error(`GROWN exemption not in ${ref}: ${v.file} ${v.name} (${v.complexity})`);
  }
  if (grown.length) console.error(`FAIL: the baseline gained ${grown.length} exemption(s); split the function instead.`);
  return grown.length === 0;
}

function writeBaseline(file, entries) {
  writeFileSync(file, JSON.stringify({ ceiling: CEILING, entries }, null, 2) + "\n");
}

export async function main(args, root = process.cwd()) {
  const baselinePath = path.join(root, "qa/complexity-baseline.json");
  const one = argValue(args, "--file");
  const scan = one ? { files: [one], unscannable: [] } : projectFiles(root);
  if (scan.unscannable.length) {
    for (const f of scan.unscannable) console.error(`UNSCANNABLE ${f}: the complexity gate cannot parse it`);
    return 1;
  }
  const current = await violations(scan.files, root);
  const baseline = args.includes("--no-baseline") ? [] : readBaseline(baselinePath);
  const { newDebt, stale } = classify(current, baseline);
  if (args.includes("--prune-baseline")) {
    writeBaseline(baselinePath, pruneBaseline(baseline, current));
    console.log(`Pruned ${stale.length} stale exemption(s); ${newDebt.length} new violation(s) still fail.`);
    return newDebt.length ? 1 : 0;
  }
  const ref = argValue(args, "--baseline-ref");
  if (args.includes("--baseline-ref") && !ref) {
    console.error("FAIL: --baseline-ref was given no ref (an empty base_ref?); the growth check cannot run.");
    return 1;
  }
  const refOk = ref ? checkRef(ref, baseline, root) : true;
  if (newDebt.length || stale.length) {
    report(newDebt, stale);
    return 1;
  }
  if (!refOk) return 1;
  console.log(
    `PASS: modified cyclomatic complexity <=${CEILING} for new/changed functions; ${baseline.length} unchanged legacy exceptions.`
  );
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main(process.argv.slice(2));
}
