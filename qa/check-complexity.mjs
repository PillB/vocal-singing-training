/**
 * ESLint complexity ceiling (20). Historical violations are a ratcheted,
 * individually identified debt baseline: new functions and increases fail.
 * Only a deliberate human-reviewed cleanup may rewrite the baseline.
 *
 * `node qa/check-complexity.mjs`                 verify
 * `node qa/check-complexity.mjs --write-baseline`  freeze reviewed legacy debt
 */
import { ESLint } from "eslint";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const baselinePath = path.join(root, "qa", "complexity-baseline.json");
const writeBaseline = process.argv.includes("--write-baseline");
const baseline = !writeBaseline && fs.existsSync(baselinePath)
  ? JSON.parse(fs.readFileSync(baselinePath, "utf8")) : {};
const eslint = new ESLint({ cwd: root });
const results = await eslint.lintFiles([
  "js/**/*.js", "workers/entitlements/src/**/*.js", "qa/**/*.mjs", "tests/**/*.js"
]);
const found = {};
const problems = [];
for (const result of results) {
  const file = path.relative(root, result.filePath).replaceAll(path.sep, "/");
  const counts = new Map();
  for (const message of result.messages) {
    if (message.ruleId !== "complexity") {
      if (message.severity >= 2) problems.push(`${file}:${message.line} ${message.message}`);
      continue;
    }
    const match = message.message.match(/^(.*?) has a complexity of (\d+)\./);
    if (!match) {
      problems.push(`${file}:${message.line} unknown complexity message: ${message.message}`);
      continue;
    }
    const signature = match[1];
    const occurrence = (counts.get(signature) || 0) + 1;
    counts.set(signature, occurrence);
    const id = `${signature} #${occurrence}`;
    const complexity = Number(match[2]);
    (found[file] ||= {})[id] = complexity;
    if (!writeBaseline && complexity > (baseline[file]?.[id] ?? 20)) {
      problems.push(`${file}:${message.line} ${id}: ${complexity} exceeds ceiling 20 / legacy ${baseline[file]?.[id] ?? "none"}`);
    }
  }
}

if (writeBaseline) {
  fs.writeFileSync(baselinePath, JSON.stringify(found, null, 2) + "\n");
  console.log(`Baseline frozen for ${Object.keys(found).length} files; review each exception before commit.`);
} else if (problems.length) {
  console.error(`LINT FAILED (${problems.length}):\n${problems.slice(0, 80).join("\n")}`);
  process.exitCode = 1;
} else {
  const debt = Object.values(found).reduce((n, entry) => n + Object.keys(entry).length, 0);
  console.log(`LINT PASS: cyclomatic ceiling 20 enforced; ${debt} frozen legacy exceptions did not grow.`);
}
