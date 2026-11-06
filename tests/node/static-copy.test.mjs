// Labels the page paints before app.js runs must say what app.js says after.
// The Plan button used to read "Empezar…" until the script swapped it for a
// choice it could not yet make (PR #24's copy fix, ported in PR #27).
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const win = {};
vm.runInNewContext(fs.readFileSync(new URL("../../js/i18n.js", import.meta.url), "utf8"), {
  window: win,
  document: { documentElement: {}, querySelectorAll: () => [], addEventListener() {} },
  localStorage: { getItem: () => null, setItem() {} },
  navigator: { language: "es" },
  console
});
const es = win.VTI18n.strings.es;
const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");

test("the Plan button's first paint says what the script will say: choose what to improve", () => {
  const label = html.match(/<button\b[^>]*\bid="btn-plan-start"[^>]*>([^<]*)<\/button>/)?.[1]?.trim();
  assert.ok(label, "index.html has the Plan start button");
  assert.equal(label, es["plan.chooseFocus"]);
  assert.equal(win.VTI18n.strings.en["plan.chooseFocus"], "Choose what to improve");
});
