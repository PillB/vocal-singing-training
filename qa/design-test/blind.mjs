/**
 * Turn each question's renders into blinded images for three judges, and
 * record the key and the guardrail measurements in a manifest.
 *
 * Usage:  node qa/design-test/blind.mjs <questions.json> [key,key...] [--renders <dir>] [--states-from a.mjs,b.mjs]
 *
 * Reads    <renders>/<key>/out-<arm>/  (run-all.mjs; <renders> defaults to $DT_WORK/renders)
 * Writes   $DT_WORK/blind/<key>/j<0..2>/NN.png and $DT_WORK/manifest.json
 *
 * Every judge sees the arms in a different order, and the images carry only
 * "Diseño 1..N". Three arms: a Latin square. Two arms: judges 1 and 3 share
 * an order and judge 2 sees it reversed, and the order flips from one
 * question to the next so today's design is not always on the same side.
 * Portrait phones: the arms side by side in one image. Landscape phones: the
 * arms stacked. Desktop and laptop: one image per arm. With "full": true, the
 * next screens down the page follow as extra tiles (two on a phone, one on a
 * desktop).
 *
 * The manifest holds, per question: the arms, the key (which design number is
 * which arm, per judge), the behaviour notes (captions), the arm names, the
 * guardrail measurements per arm and the image list per judge. Keep it away
 * from the judges.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { states as STATES, viewports as VP } from "./states.mjs";

const USAGE = "Usage: node qa/design-test/blind.mjs <questions.json> [key,key...] [--renders <dir>] [--states-from a.mjs,b.mjs]";
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
const CWD = process.env.INIT_CWD || process.cwd();
const WORK = process.env.DT_WORK || path.join(os.tmpdir(), "design-test");
const RENDERS = path.resolve(CWD, flag("--renders") || path.join(WORK, "renders"));
const statesFrom = flag("--states-from");
const [qArg, onlyArg] = argv;
if (!qArg) {
  console.error(`blind: a questions file is required\n${USAGE}`);
  process.exit(2);
}
if (statesFrom) {
  for (const f of statesFrom.split(",")) {
    const mod = await import(pathToFileURL(path.resolve(CWD, f)).href);
    if (mod.states) Object.assign(STATES, mod.states);
  }
}
const questions = JSON.parse(fs.readFileSync(path.resolve(CWD, qArg), "utf8"));
const ONLY = onlyArg ? onlyArg.split(",") : null;
const MAN = path.join(WORK, "manifest.json");
const manifest = fs.existsSync(MAN) ? JSON.parse(fs.readFileSync(MAN, "utf8")) : {};

// Orders per judge: a Latin square for three arms; for two arms the first and
// third judge share an order and the second sees the reverse, alternating by
// question so "today" is not always on the same side.
function orders(arms, qi) {
  if (arms.length === 3) return [[0, 1, 2], [1, 2, 0], [2, 0, 1]].map((o) => o.map((i) => arms[i]));
  const a = qi % 2 ? [arms[1], arms[0]] : [arms[0], arms[1]];
  return [a, [a[1], a[0]], a];
}

// Check everything before starting the browser.
const keys = Object.keys(questions).filter((k) => !ONLY || ONLY.includes(k));
if (ONLY) {
  const missing = ONLY.filter((k) => !questions[k]);
  if (missing.length) {
    console.error(`blind: not in ${qArg}: ${missing.join(", ")}`);
    process.exit(2);
  }
}
for (const key of keys) {
  const q = questions[key];
  const n = Object.keys(q.arms || {}).length;
  if (!q.arms?.A || n < 2 || n > 3) {
    console.error(`blind: ${key}: arms must be A (today) plus one or two challengers`);
    process.exit(2);
  }
  for (const v of q.vps.split(",")) {
    if (!VP[v]) {
      console.error(`blind: ${key}: unknown viewport "${v}"`);
      process.exit(2);
    }
  }
  for (const arm of Object.keys(q.arms).filter((a) => a !== "A")) {
    const f = path.join(RENDERS, key, `out-${arm}`, "metrics.json");
    if (!fs.existsSync(f)) {
      console.error(`blind: ${key}/${arm}: no renders at ${f} (run run-all.mjs first)`);
      process.exit(2);
    }
  }
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 400, height: 400 }, deviceScaleFactor: 1 });
const uri = (f) => "data:image/" + (f.endsWith(".jpg") ? "jpeg" : "png") + ";base64," + fs.readFileSync(f).toString("base64");

/** @param {{src:string, crop?:{y:number,h:number}, label:string}[]} cells */
async function compose(out, cells, dir, heading) {
  const fig = (c) => {
    const img = c.crop
      ? `<div style="height:${c.crop.h}px;overflow:hidden;border:3px solid #111"><img src="${uri(c.src)}" style="display:block;margin-top:-${c.crop.y}px"></div>`
      : `<img src="${uri(c.src)}" style="display:block;border:3px solid #111">`;
    return `<figure style="margin:0"><figcaption style="padding:0 0 8px">${c.label}</figcaption>${img}</figure>`;
  };
  const html = `<!doctype html><html><body style="margin:0;background:#fff;font:600 28px system-ui,sans-serif;color:#111">
  <div style="padding:14px 18px 0;font:500 22px system-ui,sans-serif;color:#333">${heading}</div>
  <div style="display:flex;flex-direction:${dir};gap:28px;padding:14px 18px 18px;align-items:flex-start">${cells.map(fig).join("")}</div></body></html>`;
  await page.setContent(html, { waitUntil: "load" });
  const size = await page.evaluate(() => ({ w: document.body.scrollWidth, h: document.body.scrollHeight }));
  await page.setViewportSize({ width: Math.min(size.w, 8000), height: Math.min(size.h, 8000) });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, fullPage: true });
}

let qi = 0;
for (const key of Object.keys(questions)) {
  // The question's position in the file sets its two-arm order, so a subset
  // run gives each question the same order as a full run.
  qi++;
  if (!keys.includes(key)) continue;
  const q = questions[key];
  const qdir = path.join(RENDERS, key);
  const challengers = Object.keys(q.arms).filter((a) => a !== "A");
  const runs = Object.fromEntries(challengers.map((a) => [a, JSON.parse(fs.readFileSync(path.join(qdir, `out-${a}`, "metrics.json"), "utf8"))]));
  // Every challenger's run rendered arm A too; the first challenger's A is used.
  const first = challengers[0];
  const shot = (arm, sv, full) => {
    const dir = path.join(qdir, `out-${arm === "A" ? first : arm}`);
    const side = arm === "A" ? "A" : "B";
    return path.join(dir, `${sv}__${side}${full ? "-full.jpg" : ".png"}`);
  };
  const meas = (arm, sv) => {
    const r = runs[arm === "A" ? first : arm][sv];
    return r ? r[arm === "A" ? "A" : "B"] : null;
  };
  const arms = ["A", ...challengers];
  const svs = [];
  for (const s of q.states.split(",")) for (const v of q.vps.split(",")) svs.push([s, v]);
  for (const arm of arms) {
    for (const [s, v] of svs) {
      for (const f of [shot(arm, `${s}__${v}`), ...(q.full ? [shot(arm, `${s}__${v}`, true)] : [])]) {
        if (!fs.existsSync(f)) {
          console.error(`blind: ${key}: missing render ${f}${q.full ? " (full-page shots need run-all with \"full\": true)" : ""}`);
          process.exit(2);
        }
      }
    }
  }

  const metrics = {};
  for (const arm of arms) {
    metrics[arm] = {};
    for (const [s, v] of svs) {
      const r = meas(arm, `${s}__${v}`);
      if (!r) continue;
      const m = r.m || {};
      metrics[arm][`${s}__${v}`] = {
        primaryTop: m.primary ? m.primary.top : null,
        primaryInFirstScreen: m.primary ? m.primary.inFirstScreen : null,
        primaryText: m.primary ? m.primary.text : null,
        headerH: m.headerH,
        controlsInFirstScreen: m.controlsInFirstScreen,
        controlsUnder44: (m.controlsUnder44 || []).length,
        minFont: m.minFontInFirstScreen,
        contrastFails: m.contrastFails,
        overflowX: m.overflowX,
        charsInFirstScreen: m.charsInFirstScreen,
        pageH: m.pageH,
        errors: (r.errors || []).length
      };
    }
  }

  fs.rmSync(path.join(WORK, "blind", key), { recursive: true, force: true });
  const judges = [];
  const ords = orders(arms, qi);
  for (let j = 0; j < 3; j++) {
    const order = ords[j];
    const images = [];
    let n = 0;
    const next = () => path.join(WORK, "blind", key, `j${j}`, String(++n).padStart(2, "0") + ".png");
    for (const [s, v] of svs) {
      const vp = VP[v];
      const perArm = !vp.mobile;
      const dir = vp.width > vp.height && vp.mobile ? "column" : "row";
      const where = `${vp.label} · ${STATES[s]?.label || s}`;
      const cells = order.map((arm, i) => ({ src: shot(arm, `${s}__${v}`), label: `Diseño ${i + 1}` }));
      if (perArm) {
        for (const c of cells) {
          const out = next();
          await compose(out, [c], "column", `${where} · primera pantalla`);
          images.push({ path: out, what: `${where}, primera pantalla, ${c.label}` });
        }
      } else {
        const out = next();
        await compose(out, cells, dir, `${where} · primera pantalla`);
        images.push({ path: out, what: `${where}, primera pantalla, diseños lado a lado` });
      }
      if (q.full) {
        const tiles = perArm ? 1 : 2;
        for (let t = 1; t <= tiles; t++) {
          const tcells = [];
          for (let i = 0; i < order.length; i++) {
            const arm = order[i];
            const r = meas(arm, `${s}__${v}`);
            const m = (r && r.m) || {};
            const start = (m.scrollY || 0) + t * vp.height;
            const avail = (m.pageH || 0) - start;
            if (avail <= 40) {
              tcells.push(null);
              continue;
            }
            tcells.push({
              src: shot(arm, `${s}__${v}`, true),
              crop: { y: start * vp.deviceScaleFactor, h: Math.min(vp.height, avail) * vp.deviceScaleFactor },
              label: `Diseño ${i + 1}`
            });
          }
          if (tcells.every((c) => !c)) continue;
          const shown = tcells.map(
            (c, i) => c || { src: shot(order[i], `${s}__${v}`), crop: { y: 0, h: 60 * vp.deviceScaleFactor }, label: `Diseño ${i + 1} (la página ya terminó)` }
          );
          if (perArm) {
            for (const c of shown) {
              const out = next();
              await compose(out, [c], "column", `${where} · pantalla ${t + 1} al desplazar`);
              images.push({ path: out, what: `${where}, pantalla ${t + 1}, ${c.label}` });
            }
          } else {
            const out = next();
            await compose(out, shown, dir, `${where} · pantalla ${t + 1} al desplazar`);
            images.push({ path: out, what: `${where}, pantalla ${t + 1}, diseños lado a lado` });
          }
        }
      }
    }
    judges.push({ order, images });
  }
  manifest[key] = {
    title: q.title,
    job: q.job,
    arms,
    captions: Object.fromEntries(arms.map((a) => [a, q.arms[a].caption || ""])),
    names: Object.fromEntries(arms.map((a) => [a, q.arms[a].name || (a === "A" ? "today" : a)])),
    metrics,
    judges
  };
  console.log(key, "judges", judges.map((j) => j.order.join("") + ":" + j.images.length).join(" "));
}
await browser.close();
fs.mkdirSync(WORK, { recursive: true });
fs.writeFileSync(MAN, JSON.stringify(manifest, null, 1));
console.log(`Blinded images: ${path.join(WORK, "blind")}\nManifest (the key; keep it from the judges): ${MAN}`);
