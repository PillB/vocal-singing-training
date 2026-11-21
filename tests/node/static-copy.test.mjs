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

/*
 * The first load's hero. On this browser's first load the markup's hero shows
 * before the app has started (js/boot-head.js, html.vt-boot-hero); the app then
 * writes its own over it for someone new (js/daily-loop.js, renderFirst): the
 * line start.kickerNew and the title first.title with the Mínimo's minutes.
 * Words that change as the app starts are what the hold is there to prevent.
 */
function element(id) {
  const m = html.match(new RegExp(`<([a-z0-9]+)\\b([^>]*\\bid="${id}"[^>]*)>([^<]*)</\\1>`));
  assert.ok(m, `index.html has #${id}`);
  return { key: m[2].match(/\bdata-i18n="([^"]*)"/)?.[1], text: m[3].replace(/&nbsp;/g, " ").trim() };
}

test("the first load's hero in the markup carries the keys and words the app writes for someone new", () => {
  assert.deepEqual(element("start-kicker"), { key: "start.kickerNew", text: es["start.kickerNew"] });
  // first.titleMarkup, not first.title: its {min} would be shown as it is until the app fills it
  assert.deepEqual(element("start-title"), { key: "first.titleMarkup", text: es["first.titleMarkup"] });
  const min = es["first.titleMarkup"].match(/(\d+) minutos/)?.[1];
  assert.ok(min, "the markup's title names the minutes");
  for (const lang of ["es", "en"]) {
    assert.equal(win.VTI18n.strings[lang]["first.titleMarkup"], win.VTI18n.strings[lang]["first.title"].replace("{min}", min), `${lang}: first.title for the same Mínimo`);
  }
});

const cfg = {};
vm.runInNewContext(fs.readFileSync(new URL("../../js/experiments-config.js", import.meta.url), "utf8"), { window: cfg });

/*
 * Tripwire. The markup's hero is the control arms' (the loop's home, the
 * three-minute Mínimo). With either test switched on, a first visitor in the
 * other arm would see the title change as the app starts: the classic arm
 * writes "Tu primera práctica, en 5 minutos", the long Mínimo "5 minutos".
 * Before switching one on, make firstLoad() in js/boot-head.js false while it
 * runs (a first load is then held like any other), and update this test.
 */
test("tripwire: the experiments that rewrite the first visit's hero stay off while the first load shows the control arm's", () => {
  const exps = cfg.VT_EXPERIMENTS;
  const keys = ["loop_home_2026_10", "loop_minimo_len_2026_10"];
  assert.deepEqual(keys.filter((k) => !exps[k]), [], "control: both are in js/experiments-config.js, so a renamed one cannot pass for one switched off");
  assert.deepEqual(keys.filter((k) => exps[k].enabled), [], "switched on: hold the first load's hero in js/boot-head.js first");
});
