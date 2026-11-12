// QA r11: no workflow may paste a GitHub expression that someone else can write
// (a branch name, a PR title, a step output) into the shell. GitHub's own
// guidance ("Security hardening for GitHub Actions", script injection) says to
// pass such a value through `env:` and read it as "$VAR".
// Goal behaviour: a `run:` body contains only expressions from SAFE.
// Wrong behaviour: `run: x "origin/${{ github.base_ref }}"` (branch names may
// contain a double quote, `$(`, a backtick, `;`).
// From QA round 11 on PR #27 (CI-1). Runs with test:core.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WT = process.env.WT || fileURLToPath(new URL("../..", import.meta.url));
const SAFE = /^(matrix\.[\w-]+|github\.(run_id|run_number|sha|repository|server_url|workspace)|runner\.\w+)$/;

// Every `${{ expr }}` that sits in a run: body, with the line it is on.
export function runExpressions(text) {
  const out = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(\s*)(?:- )?run:\s*(.*)$/);
    if (!m) continue;
    const base = m[1].length;
    const body = [[i + 1, m[2]]];
    if (/^[|>][+-]?$/.test(m[2].trim())) {
      body.length = 0;
      for (let j = i + 1; j < lines.length; j++) {
        const ind = lines[j].match(/^(\s*)/)[1].length;
        if (lines[j].trim() && ind <= base) break;
        body.push([j + 1, lines[j]]);
      }
    }
    for (const [n, l] of body) for (const e of l.matchAll(/\$\{\{\s*([^}]*?)\s*\}\}/g)) out.push({ line: n, expr: e[1] });
  }
  return out;
}

const dir = path.join(WT, ".github", "workflows");
const files = fs.readdirSync(dir).filter((f) => /\.ya?ml$/.test(f));

for (const f of files) {
  const text = fs.readFileSync(path.join(dir, f), "utf8");
  test(`${f}: no run: step interpolates an expression someone else can write`, () => {
    const bad = runExpressions(text).filter((x) => !SAFE.test(x.expr));
    assert.deepEqual(bad, [], `${f}: pass these through env: and use "$VAR"`);
  });
  test(`${f}: declares permissions and never uses pull_request_target`, () => {
    assert.match(text, /^permissions:/m, "no top-level permissions: block (default token may be read-write)");
    assert.doesNotMatch(text, /pull_request_target/);
  });
}

// The detector itself must be able to fail (a test that cannot go red proves nothing).
test("control: the detector flags a planted injection and passes the env: form", () => {
  const planted = 'steps:\n  - run: echo "origin/${{ github.head_ref }}"\n';
  const fixed = 'steps:\n  - env:\n      B: ${{ github.base_ref }}\n    run: echo "origin/$B"\n';
  const block = 'steps:\n  - run: |\n      a\n      echo ${{ github.event.pull_request.title }}\n  - run: echo ${{ matrix.set }}\n';
  assert.deepEqual(runExpressions(planted).map((x) => x.expr), ["github.head_ref"]);
  assert.deepEqual(runExpressions(fixed), []);
  assert.deepEqual(runExpressions(block).map((x) => x.expr), ["github.event.pull_request.title", "matrix.set"]);
});
