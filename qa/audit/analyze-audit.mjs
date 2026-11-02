/**
 * Turn qa/audit/forensic-audit.mjs's audit.json into a findings ledger.
 *
 * Each check names the expected behaviour and flags where the run differs:
 *   start/stop      every take starts and stops, by mouse and by keyboard
 *   feedback        a take that is being sung shows something that changes
 *   errors          no uncaught exception or console error (the account
 *                   worker refusing a localhost origin is the environment)
 *   quiet           on silence and on steady air, no count may go up
 *   mic             one stream after a double Start, none after leaving
 *   leave           leaving mid-take asks first; Stay keeps the take
 *   replay          a reopened exercise starts clean
 *   layout          no two controls overlap, no control is covered at its
 *                   centre, no clipped text, targets ≥ 24 px (WCAG 2.5.8)
 *   focus           every Tab stop is visible, not covered, outlined
 *
 *   node qa/audit/analyze-audit.mjs /tmp/audit/audit.json > ledger.md
 */
import fs from "node:fs";

const ENV_NOISE = /Access-Control-Allow-Origin|vocal-studio-entitlements|ERR_NAME_NOT_RESOLVED|net::ERR_|Failed to load resource|CORS/;

const changes = (ticks, key) => new Set((ticks || []).map((t) => t?.[key])).size;
const nums = (s) => (String(s || "").match(/\d+/g) || []).map(Number);

/** Counts that went up between the first and last tick (timers excluded by their ":" or "s"). */
function countsUp(ticks) {
  if (!ticks?.length) return [];
  const strip = (s) => String(s || "").replace(/\d+:\d\d|\d+(?:[.,]\d+)?\s?s\b|\d+\s?%/g, "");
  const a = nums(strip(ticks[0].focus) + " " + strip(ticks[0].hud));
  const b = nums(strip(ticks.at(-1).focus) + " " + strip(ticks.at(-1).hud));
  if (a.length !== b.length) return [];
  return b.map((v, i) => (v > a[i] ? `${a[i]}→${v}` : null)).filter(Boolean);
}

function checkTakes(rec, out) {
  for (const [n, how] of [[1, "mouse"], [2, "keyboard"]]) {
    const it = rec.iterations?.[n];
    if (!it) continue;
    if (it.failure) out.push(["start/stop", `iteration ${n} (${how}) threw: ${it.failure}`]);
    if (it.started === false) out.push(["start/stop", `${how} Start did not start the take`]);
    if (it.stopped === false) out.push(["start/stop", `${how} Stop did not stop the take`]);
    if (it.ticks && rec.mode !== "weekPlan") {
      const moving = ["focus", "hud", "status", "pitch", "cue"].some((k) => changes(it.ticks, k) > 1);
      if (!moving) out.push(["feedback", `${how}: nothing on screen changed in ${it.ticks.length / 2} s of singing`]);
    }
    if (it.gum && it.gum.live > 0 && it.stopped) out.push(["mic", `${how}: ${it.gum.live} mic track(s) still live after Stop`]);
  }
}

function checkQuiet(rec, out) {
  const it = rec.iterations?.[3];
  if (!it) return;
  if (it.failure) out.push(["quiet", `boundary run threw: ${it.failure}`]);
  for (const run of [it.silent, it.noise].filter(Boolean)) {
    const up = countsUp(run.ticks);
    if (up.length) out.push(["quiet", `${run.scenario}: on-screen counts rose (${up.join(", ")}) — review`]);
  }
}

function checkInterrupt(rec, out) {
  const it = rec.iterations?.[4];
  if (!it || rec.mode === "weekPlan") return;
  if (it.failure) out.push(["leave", `interruption run threw: ${it.failure}`]);
  const live = (g) => g?.live || 0;
  if (live(it.afterDouble?.gum) > 1) out.push(["mic", `double Start opened ${it.afterDouble.gum.live} mic tracks`]);
  if (it.leavePrompt === false && it.afterHidden?.live) out.push(["leave", "Back mid-take left without asking"]);
  if (it.afterStay && it.afterStay.view !== "view-exercise") out.push(["leave", "Stay in the leave prompt did not keep the exercise"]);
  if (live(it.final?.gum) > 0) out.push(["mic", `${it.final.gum.live} mic track(s) live after leaving the exercise`]);
}

function checkReplay(rec, out) {
  const it = rec.iterations?.[6];
  if (!it) return;
  if (it.failure) out.push(["replay", `replay run threw: ${it.failure}`]);
  if (it.reopened?.live) out.push(["replay", "reopened exercise is already live"]);
}

function checkControls(where, rows, out) {
  const controls = rows.flat().filter((x) => x.kind === "control" && x.inView && !x.fold);
  for (const c of controls) {
    const name = c.text || c.id;
    if (c.hit && c.hit !== "self" && c.hit !== "offscreen") out.push(["layout", `${where}: "${name}" is covered at its centre by ${c.hit}`]);
    if (c.small && !c.disabled) out.push(["layout", `${where}: "${name}" target ${c.w}×${c.h} px (< 24)`]);
  }
}

function checkContrast(where, rows, out) {
  // Large text (24 px, or bold 18,66 px) needs 3:1; weight is not recorded, so 24 px is the line
  const texts = rows.flat().filter((x) => x.kind === "text" && x.inView && x.contrast != null);
  for (const t of texts) {
    if (t.contrast < (t.font >= 24 ? 3 : 4.5)) out.push(["contrast", `${where}: "${t.text}" ${t.contrast}:1 at ${t.font}px`]);
  }
}

function checkLayout(where, inv, out) {
  if (!inv) return;
  for (const [a, b] of inv.overlaps?.controls || []) out.push(["layout", `${where}: controls overlap: "${a}" × "${b}"`]);
  for (const t of inv.overlaps?.clipped || []) out.push(["layout", `${where}: clipped text "${t}"`]);
  checkControls(where, inv.rows || [], out);
  checkContrast(where, inv.rows || [], out);
}

function checkFocus(rec, out) {
  for (const f of rec.focus || []) {
    if (f.id === "body") continue;
    if (f.obscured) out.push(["focus", `Tab stop "${f.text || f.id}" is covered`]);
    if (!f.outline) out.push(["focus", `Tab stop "${f.text || f.id}" shows no focus ring`]);
  }
}

function checkErrors(rec, out) {
  const all = [...(rec.errors || []), ...(rec.iterations?.[5]?.errors || [])];
  for (const e of new Set(all)) if (!ENV_NOISE.test(e)) out.push(["errors", e]);
}

export function findings(rec) {
  const out = [];
  if (rec.failure) out.push(["start/stop", `audit could not run: ${rec.failure}`]);
  checkTakes(rec, out);
  checkQuiet(rec, out);
  checkInterrupt(rec, out);
  checkReplay(rec, out);
  checkLayout("desktop", rec.inventory, out);
  checkLayout("phone", rec.iterations?.[5]?.inventory, out);
  if (rec.iterations?.[5]?.failure) out.push(["start/stop", `phone run threw: ${rec.iterations[5].failure}`]);
  checkFocus(rec, out);
  checkErrors(rec, out);
  // One line per distinct finding
  const seen = new Set();
  return out.filter(([k, v]) => !seen.has(k + v) && seen.add(k + v));
}

function main(file) {
  const audit = JSON.parse(fs.readFileSync(file, "utf8"));
  const byCat = {};
  const lines = [`# Forensic audit ledger`, ``, `Base: ${audit.base} · run ${audit.at} · ${audit.results.length} exercises`, ``];
  for (const rec of audit.results) {
    const f = findings(rec);
    f.forEach(([k]) => (byCat[k] = (byCat[k] || 0) + 1));
    lines.push(`## ${rec.id} (${rec.mode})${f.length ? "" : " — clean"}`);
    for (const [k, v] of f) lines.push(`- **${k}** ${v}`);
    lines.push("");
  }
  lines.splice(4, 0, "| check | findings |", "|---|---|", ...Object.entries(byCat).map(([k, n]) => `| ${k} | ${n} |`), "");
  process.stdout.write(lines.join("\n") + "\n");
}

if (process.argv[2]) main(process.argv[2]);
