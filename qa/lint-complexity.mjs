/**
 * Parser-backed complexity gate.
 *
 * ESLint's official complexity rule enforces McCabe modified CC <= 15.
 * Existing >15 functions are acknowledged by exact source-content hashes in
 * qa/complexity-baseline.json. Changing one invalidates its exemption. New
 * functions have no exemption. This pays down debt without a fake all-green
 * blanket eslint-disable or an absurd threshold.
 *
 * To explicitly review existing debt: npm run lint:baseline
 * For CI negative-control fixtures: --no-baseline --file <path>
 */
import { ESLint } from "eslint";
import { parse } from "espree";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const baselinePath = path.join(root, "qa/complexity-baseline.json");
const args = process.argv.slice(2);
const update = args.includes("--update-baseline");
const noBaseline = args.includes("--no-baseline");
const fileIndex = args.indexOf("--file");

function projectFiles() {
  const found = [];
  function visit(dir) {
    for (const item of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const name = dir + "/" + item.name;
      if (item.isDirectory()) {
        if (!["fixtures", "node_modules", "test-results", "site-review", "screenshots", "geometry"].includes(item.name)) {
          visit(name);
        }
      } else if (/\.(?:js|mjs)$/.test(item.name)) {
        found.push(name);
      }
    }
  }
  for (const dir of ["js", "qa", "tests", "workers"]) visit(dir);
  // Include root-level build/test configuration too: a new monolithic helper
  // in playwright.config.js or another root module must not bypass the gate.
  for (const item of readdirSync(root, { withFileTypes: true })) {
    if (item.isFile() && /\.(?:js|mjs)$/.test(item.name)) found.push(item.name);
  }
  return found.sort();
}

const functionCache = new Map();

function enclosingFunction(source, line, column) {
  let found = functionCache.get(source);
  if (!found) {
    const ast = parse(source, { ecmaVersion: "latest", sourceType: "module", loc: true, range: true });
    found = [];
    function walk(node) {
      if (!node || typeof node !== "object") return;
      if (/^(?:FunctionDeclaration|FunctionExpression|ArrowFunctionExpression|MethodDefinition)$/.test(node.type)) {
        found.push(node);
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === "loc" || key === "range" || key === "tokens") continue;
        if (Array.isArray(value)) value.forEach(walk);
        else if (value && typeof value === "object") walk(value);
      }
    }
    walk(ast);
    functionCache.set(source, found);
  }
  const onLine = found.filter((node) => node.loc.start.line === line);
  // Rule reports at function/method declaration. On a line with multiple
  // arrows, column proximity disambiguates the source hash.
  const candidates = onLine.length ? onLine : found.filter((node) =>
    node.loc.start.line <= line && node.loc.end.line >= line);
  candidates.sort((a, b) =>
    Math.abs(a.loc.start.column + 1 - column) -
    Math.abs(b.loc.start.column + 1 - column) ||
    (a.range[1] - a.range[0]) - (b.range[1] - b.range[0]));
  const node = candidates[0];
  if (!node) throw new Error(`No function at ${line}:${column}`);
  return source.slice(node.range[0], node.range[1]);
}

async function violations(files) {
  const eslint = new ESLint({ overrideConfigFile: "eslint.config.mjs" });
  const results = await eslint.lintFiles(files);
  const entries = [];
  for (const result of results) {
    const file = path.relative(root, result.filePath).replaceAll(path.sep, "/");
    const errors = result.messages.filter((m) => m.severity === 2);
    if (!errors.length) continue;
    const source = readFileSync(result.filePath, "utf8");
    for (const m of errors) {
      if (m.ruleId !== "complexity") {
        throw new Error(`${file}:${m.line} ${m.message}`);
      }
      const fnSource = enclosingFunction(source, m.line, m.column);
      const sha = createHash("sha256").update(fnSource).digest("hex");
      const complexity = Number(m.message.match(/complexity of (\d+)/)?.[1] || 0);
      entries.push({ file, sha, complexity, name: m.message.split(" has a complexity")[0] });
    }
  }
  return entries.sort((a, b) =>
    a.file.localeCompare(b.file) || a.name.localeCompare(b.name) || a.sha.localeCompare(b.sha));
}

const files = fileIndex >= 0 ? [args[fileIndex + 1]] : projectFiles();
const current = await violations(files);
if (update) {
  writeFileSync(baselinePath, JSON.stringify({ ceiling: 15, entries: current }, null, 2) + "\n");
  console.log(`Recorded ${current.length} explicit legacy complexity exceptions.`);
  process.exit(0);
}
const baseline = noBaseline ? [] : JSON.parse(readFileSync(baselinePath, "utf8")).entries;
const sig = (v) => `${v.file}:${v.sha}:${v.complexity}`;
const exceptions = new Set(baseline.map(sig));
const active = new Set(current.map(sig));
const newDebt = current.filter((v) => !exceptions.has(sig(v)));
const stale = noBaseline ? [] : baseline.filter((v) => !active.has(sig(v)));
if (newDebt.length || stale.length) {
  for (const v of newDebt.slice(0, 25)) {
    console.error(`NEW complexity ${v.complexity}>15 ${v.file} ${v.name}`);
  }
  for (const v of stale.slice(0, 15)) {
    console.error(`STALE exception ${v.file} ${v.name} (refactor or update needed)`);
  }
  console.error(`FAIL: ${newDebt.length} unapproved violations, ${stale.length} stale exceptions.`);
  process.exit(1);
}
console.log(`PASS: modified cyclomatic complexity <=15 for new/changed functions; ${baseline.length} unchanged legacy exceptions.`);
