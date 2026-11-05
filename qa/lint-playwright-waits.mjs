/**
 * chore(lint): Playwright wait-signature gate.
 *
 * `page.waitForFunction(pageFunction, arg?, options?)` takes its options as the
 * THIRD argument. Passing `{ timeout }` second makes it the page function's
 * argument, so the timeout is silently ignored and the wait falls back to the
 * whole test's budget. In this repo that turned an 8 s layout wait into a
 * 15-minute CI hang (tests/all-flows-robust.spec.js, PR #22 shard 1).
 * Docs: https://playwright.dev/docs/api/class-page#page-wait-for-function
 *
 *   node qa/lint-playwright-waits.mjs            # scan tests/ and qa/
 *   node qa/lint-playwright-waits.mjs --fix      # insert the missing `null` arg
 *   node qa/lint-playwright-waits.mjs --file x   # scan one file (fixtures)
 *
 * Second rule: `waitFor*(...).catch(() => {})` swallows the wait's own failure,
 * so the test carries on against a page that never reached the state it waited
 * for. Allowed only with a `// wait-may-fail: <reason>` comment on the call or
 * the line above it, naming what checks the outcome instead.
 */
import { parse } from "espree";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const OPTION_KEYS = new Set(["timeout", "polling"]);

function parseAny(source) {
  const opts = { ecmaVersion: "latest", loc: true, range: true, comment: true };
  try {
    return parse(source, { ...opts, sourceType: "module" });
  } catch {
    return parse(source, { ...opts, sourceType: "script" });
  }
}

function isMisplacedWait(node) {
  if (node.type !== "CallExpression") return false;
  if (node.callee?.property?.name !== "waitForFunction") return false;
  if (node.arguments.length !== 2) return false;
  const second = node.arguments[1];
  if (second.type !== "ObjectExpression") return false;
  return second.properties.some((p) => OPTION_KEYS.has(p.key?.name));
}

function walk(node, visit) {
  if (!node || typeof node !== "object") return;
  visit(node);
  for (const [key, value] of Object.entries(node)) {
    if (key === "loc" || key === "range") continue;
    if (Array.isArray(value)) value.forEach((v) => walk(v, visit));
    else if (value && typeof value === "object") walk(value, visit);
  }
}

function isEmptyFn(node) {
  if (!node || !/Function/.test(node.type)) return false;
  return node.body.type === "BlockStatement" && node.body.body.length === 0;
}

function isSwallowedWait(node) {
  if (node.type !== "CallExpression" || node.callee?.property?.name !== "catch") return false;
  const inner = node.callee.object;
  if (inner?.type !== "CallExpression") return false;
  if (!/^waitFor/.test(inner.callee?.property?.name || "")) return false;
  return isEmptyFn(node.arguments[0]);
}

/** Comments inside the call, or in the comment block directly above it. */
function nearbyComments(comments, node) {
  const inside = comments.filter(
    (c) => c.loc.start.line >= node.loc.start.line && c.loc.start.line <= node.loc.end.line
  );
  const above = [];
  let line = node.loc.start.line - 1;
  for (let i = comments.length - 1; i >= 0; i--) {
    const c = comments[i];
    if (c.loc.end.line === line) {
      above.push(c);
      line = c.loc.start.line - 1;
    } else if (c.loc.end.line < line) break;
  }
  return [...inside, ...above];
}

function justified(comments, node) {
  return nearbyComments(comments, node).some((c) => /wait-may-fail:\s*\S/.test(c.value));
}

/** `waitFor*().catch(() => {})` without a `wait-may-fail:` justification. */
export function findSwallowedWaits(source) {
  const ast = parseAny(source);
  const hits = [];
  walk(ast, (node) => {
    if (isSwallowedWait(node) && !justified(ast.comments || [], node)) {
      hits.push({ line: node.loc.start.line });
    }
  });
  return hits;
}

/** @returns {{ line: number, insertAt: number }[]} */
export function findMisplacedWaits(source) {
  const hits = [];
  walk(parseAny(source), (node) => {
    if (isMisplacedWait(node)) {
      hits.push({ line: node.loc.start.line, insertAt: node.arguments[1].range[0] });
    }
  });
  return hits;
}

export function fixMisplacedWaits(source) {
  const hits = findMisplacedWaits(source).sort((a, b) => b.insertAt - a.insertAt);
  let out = source;
  for (const h of hits) out = out.slice(0, h.insertAt) + "null, " + out.slice(h.insertAt);
  return out;
}

function listFiles(root) {
  const found = [];
  const skip = new Set(["node_modules", "fixtures", "screenshots", "geometry", "site-review"]);
  (function visit(dir) {
    for (const item of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = dir + "/" + item.name;
      if (item.isDirectory() && !skip.has(item.name)) visit(rel);
      else if (item.isFile() && /\.(?:js|mjs)$/.test(item.name)) found.push(rel);
    }
  })("tests");
  return found;
}

function checkFile(abs, file, fix) {
  let source = readFileSync(abs, "utf8");
  const misplaced = findMisplacedWaits(source);
  if (misplaced.length && fix) {
    source = fixMisplacedWaits(source);
    writeFileSync(abs, source);
  }
  for (const h of misplaced) {
    console.error(`${fix ? "FIXED" : "MISPLACED"} waitForFunction options ${file}:${h.line}`);
  }
  const swallowed = findSwallowedWaits(source);
  for (const h of swallowed) {
    console.error(`SWALLOWED waitFor*().catch(() => {}) without "// wait-may-fail: <reason>" ${file}:${h.line}`);
  }
  return (fix ? 0 : misplaced.length) + swallowed.length;
}

function main(argv) {
  const root = process.cwd();
  const fileIndex = argv.indexOf("--file");
  const files = fileIndex >= 0 ? [argv[fileIndex + 1]] : listFiles(root);
  const fix = argv.includes("--fix");
  let total = 0;
  for (const file of files) {
    const abs = path.join(root, file);
    const source = readFileSync(abs, "utf8");
    total += checkFile(abs, file, fix);
  }
  if (total) {
    console.error(`FAIL: ${total} Playwright wait problem(s).`);
    process.exit(1);
  }
  console.log(`PASS: Playwright waits are bound and none is silently swallowed (${files.length} files).`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2));
}
