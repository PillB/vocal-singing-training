#!/usr/bin/env bash
# Run Playwright directly from the CI shell, as the successful layout suite does.
set -euo pipefail
record_dir="test-results/safari-selector-mutation"
mkdir -p "$record_dir"
selector_original=$(mktemp)
cp css/site-version.css "$selector_original"
trap 'cp "$selector_original" css/site-version.css; rm -f "$selector_original"' EXIT
run_case() {
  npx playwright test tests/site-version-devices.spec.js --project=webkit-layout --workers=1 --reporter=json -g 'iPhone 12-16'
}
# A clean baseline must pass; a server or browser failure cannot kill a mutant.
# Playwright clears test-results at startup, so keep reports outside that tree.
baseline_report=$(mktemp)
mutant_report=$(mktemp)
finish() {
  cp "$selector_original" css/site-version.css
  mkdir -p "$record_dir"
  cp "$baseline_report" "$record_dir/baseline.json"
  cp "$mutant_report" "$record_dir/mutant.json"
  rm -f "$selector_original" "$baseline_report" "$mutant_report"
}
trap finish EXIT
run_case > "$baseline_report"
node --input-type=module <<'JS'
import {readFileSync,writeFileSync} from 'node:fs';
import {MUTANTS} from './qa/mutate.mjs';
const m=MUTANTS['safari-layout'][0], source=readFileSync(m.file,'utf8');
if(source.split(m.from).length!==2)throw Error('SL1 lost its unique CSS anchor');
writeFileSync(m.file,source.replace(m.from,m.to));
JS
if run_case > "$mutant_report"; then
  echo 'SURVIVED: the original native selector rule was not detected'
  exit 1
fi
node --input-type=module - "$mutant_report" <<'JS'
import {readFileSync} from 'node:fs';
import {selectorSizeFailure} from './qa/safari-selector-result.mjs';
const report=JSON.parse(readFileSync(process.argv[2],'utf8'));
if(!selectorSizeFailure(report))throw Error('SL1 failed for something other than the measured selector tap size; inspect mutant.json');
console.log('KILLED: SL1 original native selector is below the touch target in both designs');
JS
