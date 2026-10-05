/**
 * First-click test: can someone who has never seen the site find where to tap
 * for a task, on the first try?
 *
 * The blinded design test (README.md) asks judges which of several designs is
 * better. This asks something different and more direct: shown one design
 * only, with a task ("you want to see what you practised last week"), where
 * would you tap first? A first click on the right control is the best single
 * predictor of finishing a task in usability studies, and it can be scored
 * without anybody's opinion: the answer either is the right control or it is
 * not.
 *
 * Three steps, all writing under $DT_WORK/firstclick (default
 * <os temp>/design-test/firstclick):
 *
 *   render  For one site (an "arm"), open every state a task needs and save
 *           the first screen twice: clean, and with a numbered yellow badge
 *           on every control a person could tap (only controls that a tap
 *           would actually reach: nothing under a dialog or off screen). Also
 *           writes which numbers count as a right answer for which task.
 *             node qa/design-test/firstclick.mjs render tasks.json --arm r0 --base http://127.0.0.1:8765
 *   brief   Make one participant's brief: the tasks in order, the images of
 *           one arm under neutral file names, and the answer format. Nothing
 *           in the brief or the paths says which arm it is.
 *             node qa/design-test/firstclick.mjs brief tasks.json --arm r0 --pid p3 --persona beginner
 *   score   Score every participant's answers against the right numbers:
 *           success rate per task and per arm, and the mean ease (1-7).
 *             node qa/design-test/firstclick.mjs score tasks.json answers.json
 *
 * A tasks file:
 *   { "tasks": [ { "id": "history", "task": "Quieres ver lo que practicaste la semana pasada.",
 *                  "state": "home-returning", "vp": "phone",
 *                  "hit": ["#btn-history"], "near": ["#btn-more"] } ] }
 *   hit   selectors of the controls that do the task. A badge counts as a hit
 *         when its control matches, is inside, or contains a match.
 *   via   selectors of a closed menu that holds the control (the right first
 *         tap, but only if the person guesses what the menu holds). Scored as
 *         "on the path", apart from direct hits.
 *   near  selectors that are a reasonable first step without doing it yet.
 *         Scored apart from hits.
 *   scroll true when the control is not in the first screen and "I would
 *         scroll down" (answer 0) is the right first move.
 *
 * Answers, one object per participant (a list of them, or {"results": [...]}):
 *   { "pid": "p3", "arm": "r0", "persona": "beginner",
 *     "answers": [ { "id": "history", "choice": 7, "ease": 6, "confidence": "high", "why": "..." } ] }
 *   choice  the badge number; 0 = "I don't see it here, I would scroll";
 *           -1 = "I would give up / I don't know".
 *
 * Environment: CHROME_PATH (browser binary), DT_WORK.
 */
import { chromium } from "playwright";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { states as STATES, viewports as VPS } from "./states.mjs";

const USAGE = `Usage:
  node qa/design-test/firstclick.mjs render <tasks.json> --arm <name> [--base <url>] [--states-from a.mjs] [--lang es|en]
  node qa/design-test/firstclick.mjs brief  <tasks.json> --arm <name> --pid <id> [--persona <name>]
  node qa/design-test/firstclick.mjs score  <tasks.json> <answers.json> [more answers...]`;

const argv = process.argv.slice(2);
if (!argv.length || argv.includes("--help") || argv.includes("-h")) {
  console.log(USAGE);
  process.exit(argv.length ? 0 : 2);
}
const flag = (name, dflt = null) => {
  const i = argv.indexOf(name);
  if (i < 0) return dflt;
  const v = argv[i + 1];
  argv.splice(i, 2);
  return v;
};
const CWD = process.env.INIT_CWD || process.cwd();
const WORK = path.join(process.env.DT_WORK || path.join(os.tmpdir(), "design-test"), "firstclick");
const cmd = argv.shift();

const statesFrom = flag("--states-from");
if (statesFrom) {
  for (const f of statesFrom.split(",")) {
    const mod = await import(pathToFileURL(path.resolve(CWD, f)).href);
    if (mod.states) Object.assign(STATES, mod.states);
  }
}
const readJson = (f) => JSON.parse(fs.readFileSync(path.resolve(CWD, f), "utf8"));

/* ── render ─────────────────────────────────────────────────────────────── */

const UA = {
  desktop: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36",
  mobile: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36"
};

/** In the page: number every control a tap in the first screen would reach. */
function markControls(tasks) {
  const SEL = 'button, a[href], [role="button"], [role="tab"], [role="link"], select, input:not([type="hidden"]), textarea, summary, label';
  const vw = innerWidth;
  const vh = innerHeight;
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) return null;
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return null;
    if (r.bottom <= 1 || r.top >= vh - 1 || r.right <= 1 || r.left >= vw - 1) return null;
    return r;
  };
  // A tap reaches it: some point of it, inside the screen, hits it or something inside it.
  const reachable = (el, r) => {
    const xs = [0.5, 0.25, 0.75, 0.1, 0.9];
    const ys = [0.5, 0.3, 0.7];
    for (const fy of ys)
      for (const fx of xs) {
        const x = Math.min(vw - 2, Math.max(1, r.left + r.width * fx));
        const y = Math.min(vh - 2, Math.max(1, r.top + r.height * fy));
        const hit = document.elementFromPoint(x, y);
        if (hit && (hit === el || el.contains(hit) || hit.closest("label") === el)) return true;
      }
    return false;
  };
  let els = [...document.querySelectorAll(SEL)].filter((el) => !el.closest("[data-fc-overlay]"));
  // A label only counts when it wraps a control and nothing inside it is numbered on its own.
  els = els.filter((el) => {
    if (el.tagName !== "LABEL") return true;
    const inner = el.querySelector("input, select, textarea");
    return !!inner && inner.type !== "range" && inner.tagName === "INPUT";
  });
  // An input inside a numbered label is the label's.
  const labels = new Set(els.filter((e) => e.tagName === "LABEL"));
  els = els.filter((el) => !(el.tagName === "INPUT" && el.closest("label") && labels.has(el.closest("label"))));
  // Nested controls (a button inside a [role=button]): keep the outermost.
  els = els.filter((el) => !els.some((o) => o !== el && o.contains(el) && o.tagName !== "LABEL" && !["SELECT"].includes(el.tagName) && o.matches('[role="button"], [role="tab"], a[href], button')));
  const picked = [];
  for (const el of els) {
    const r = visible(el);
    if (!r || !reachable(el, r)) continue;
    picked.push({ el, r });
  }
  // Reading order: rows top to bottom (within 12px), then left to right.
  picked.sort((a, b) => (Math.abs(a.r.top - b.r.top) > 12 ? a.r.top - b.r.top : a.r.left - b.r.left));
  const matchAny = (el, sels) =>
    (sels || []).some((s) => {
      try {
        return el.matches(s) || !!el.closest(s) || !!el.querySelector(s);
      } catch {
        return false;
      }
    });
  const overlay = document.createElement("div");
  overlay.setAttribute("data-fc-overlay", "1");
  overlay.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647;";
  const key = [];
  picked.forEach(({ el, r }, i) => {
    const n = i + 1;
    const box = document.createElement("div");
    box.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;outline:1.5px dashed #ffd400;outline-offset:1px;border-radius:4px;`;
    const badge = document.createElement("div");
    badge.textContent = String(n);
    const bx = Math.min(vw - 22, Math.max(0, r.left - 6));
    const by = Math.min(vh - 16, Math.max(0, r.top - 8));
    badge.style.cssText = `position:fixed;left:${bx}px;top:${by}px;min-width:16px;height:16px;padding:0 3px;box-sizing:border-box;background:#ffd400;color:#000;font:700 11px/16px Arial,sans-serif;text-align:center;border:1px solid #000;border-radius:8px;`;
    overlay.append(box, badge);
    const tag = {};
    for (const t of tasks) {
      if (matchAny(el, t.hit)) tag[t.id] = "hit";
      else if (matchAny(el, t.via)) tag[t.id] = "via";
      else if (matchAny(el, t.near)) tag[t.id] = "near";
    }
    key.push({
      n,
      sel: el.id ? "#" + el.id : el.tagName.toLowerCase() + (el.className && typeof el.className === "string" ? "." + el.className.trim().split(/\s+/)[0] : ""),
      text: (el.getAttribute("aria-label") || el.textContent || el.value || "").replace(/\s+/g, " ").trim().slice(0, 60),
      rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)],
      tasks: tag
    });
  });
  document.body.appendChild(overlay);
  return key;
}

async function render() {
  const tasksFile = argv.shift();
  const arm = flag("--arm");
  const base = flag("--base", process.env.BASE_URL || "http://127.0.0.1:8765");
  const lang = flag("--lang", "es");
  if (!tasksFile || !arm) throw new Error("render needs <tasks.json> and --arm");
  const { tasks } = readJson(tasksFile);
  const groups = new Map();
  for (const t of tasks) {
    if (!STATES[t.state]) throw new Error(`unknown state ${t.state} (task ${t.id})`);
    if (!VPS[t.vp]) throw new Error(`unknown viewport ${t.vp} (task ${t.id})`);
    const k = `${t.state}__${t.vp}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(t);
  }
  const out = path.join(WORK, "arms", arm);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || undefined,
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"]
  });
  const index = {};
  for (const [k, ts] of groups) {
    const [stateName, vpName] = k.split("__");
    const st = STATES[stateName];
    const vp = VPS[vpName];
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.deviceScaleFactor,
      userAgent: vp.mobile ? UA.mobile : UA.desktop,
      isMobile: vp.mobile,
      hasTouch: vp.mobile,
      timezoneId: "America/Lima",
      locale: lang === "en" ? "en-US" : "es-PE",
      permissions: ["microphone"]
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 200)));
    await page.clock.install({ time: new Date("2026-09-23T10:00:00-05:00") });
    // Same seeding as harness.mjs, so both tools show the same moment.
    const seeds = st.bare ? {} : { vt_lang: lang, vt_settings_v1: JSON.stringify({ lastTab: st.tab || "singing" }) };
    if (st.tour !== false && !st.bare) {
      seeds.vt_tour_v1 = "1";
      seeds.vt_ui_tour_seen_v1 = JSON.stringify({ speech: 1, highway: 1, hold: 1 });
      seeds.vt_mic_primed_v1 = "1";
      seeds.vt_tour_auto_v1 = "1";
    }
    if (st.days) seeds.vt_days_v1 = JSON.stringify(st.days);
    if (st.loop) seeds.vt_loop_v1 = JSON.stringify(st.loop);
    if (st.seed) Object.assign(seeds, st.seed);
    await page.addInitScript((s) => {
      try {
        if (sessionStorage.getItem("__seeded")) return;
        sessionStorage.setItem("__seeded", "1");
        for (const [k2, v] of Object.entries(s)) localStorage.setItem(k2, v);
      } catch {
        /* storage blocked */
      }
    }, seeds);
    await page.goto(base + (st.url || "/"), { waitUntil: "load" });
    await page.waitForTimeout(900);
    if (st.action) {
      try {
        await st.action(page);
      } catch (e) {
        errors.push("action: " + String(e).slice(0, 160));
      }
    }
    await page.waitForTimeout(300);
    const dir = path.join(out, k);
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, "clean.png") });
    const key = await page.evaluate(markControls, ts.map((t) => ({ id: t.id, hit: t.hit, via: t.via || [], near: t.near || [] })));
    await page.screenshot({ path: path.join(dir, "marked.png") });
    fs.writeFileSync(path.join(dir, "key.json"), JSON.stringify({ state: stateName, vp: vpName, errors, controls: key }, null, 1));
    const missing = ts.filter((t) => !t.scroll && !key.some((c) => ["hit", "via"].includes(c.tasks[t.id]))).map((t) => t.id);
    index[k] = { controls: key.length, errors: errors.length, tasksWithoutAVisibleHit: missing };
    console.log(`${k}: ${key.length} controls${missing.length ? `; no visible right answer for ${missing.join(", ")}` : ""}${errors.length ? `; ${errors.length} page errors` : ""}`);
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(out, "index.json"), JSON.stringify({ base, lang, index }, null, 1));
}

/* ── brief ──────────────────────────────────────────────────────────────── */

function brief() {
  const tasksFile = argv.shift();
  const arm = flag("--arm");
  const pid = flag("--pid");
  const persona = flag("--persona", "");
  if (!tasksFile || !arm || !pid) throw new Error("brief needs <tasks.json>, --arm and --pid");
  const { tasks } = readJson(tasksFile);
  const src = path.join(WORK, "arms", arm);
  const dir = path.join(WORK, "blind", pid);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const lines = [
    "# Prueba de primer clic",
    "",
    "Vas a ver pantallas de una aplicación web para practicar canto y voz hablada. Para cada tarea hay dos imágenes de la misma pantalla:",
    "",
    "1. **La pantalla tal cual**: mírala primero, como la verías en tu teléfono o tu ordenador.",
    "2. **La misma pantalla con números amarillos** sobre cada cosa que se puede tocar. Úsala solo para decir dónde tocarías.",
    "",
    "Para cada tarea, di dónde tocarías **primero**. Contesta con el número del sitio que tocarías. Si lo que buscas no está en la pantalla y te desplazarías hacia abajo para buscarlo, contesta 0. Si no sabrías qué hacer y te rendirías, contesta -1.",
    "",
    "Las tareas no dependen unas de otras: cada una empieza en la pantalla que se muestra.",
    ""
  ];
  tasks.forEach((t, i) => {
    const k = `${t.state}__${t.vp}`;
    const nn = String(i + 1).padStart(2, "0");
    for (const f of ["clean", "marked"]) {
      const from = path.join(src, k, `${f}.png`);
      if (!fs.existsSync(from)) throw new Error(`missing render ${from}; run render first`);
      fs.copyFileSync(from, path.join(dir, `${nn}-${f === "clean" ? "a" : "b"}.png`));
    }
    lines.push(`## Tarea ${i + 1} (id: ${t.id})`, "", `**${t.task}**`, "", `- Pantalla: ${VPS[t.vp].label}`, `- Imagen 1 (tal cual): ${path.join(dir, `${nn}-a.png`)}`, `- Imagen 2 (con números): ${path.join(dir, `${nn}-b.png`)}`, "");
  });
  lines.push(
    "## Tu respuesta",
    "",
    "Para cada tarea, en el mismo orden: `id`, `choice` (el número; 0 = me desplazaría; -1 = me rendiría), `ease` (de 1 = muy difícil a 7 = muy fácil: ¿qué tan fácil fue decidir dónde tocar?), `confidence` (low, medium o high) y `why` (una frase: qué te hizo elegir eso, o qué te confundió)."
  );
  fs.writeFileSync(path.join(dir, "brief.md"), lines.join("\n") + "\n");
  // The key to this participant stays out of their folder.
  const reg = path.join(WORK, "participants.json");
  const all = fs.existsSync(reg) ? JSON.parse(fs.readFileSync(reg, "utf8")) : {};
  all[pid] = { arm, persona, brief: path.join(dir, "brief.md") };
  fs.writeFileSync(reg, JSON.stringify(all, null, 1));
  console.log(path.join(dir, "brief.md"));
}

/* ── score ──────────────────────────────────────────────────────────────── */

function score() {
  const tasksFile = argv.shift();
  const { tasks } = readJson(tasksFile);
  const reg = fs.existsSync(path.join(WORK, "participants.json")) ? JSON.parse(fs.readFileSync(path.join(WORK, "participants.json"), "utf8")) : {};
  let rows = [];
  for (const f of argv) {
    const raw = fs.readFileSync(path.resolve(CWD, f), "utf8").trim();
    let data;
    try {
      data = JSON.parse(raw);
    } catch {
      data = raw.split("\n").filter(Boolean).map((l) => JSON.parse(l));
    }
    rows = rows.concat(Array.isArray(data) ? data : data.results || [data]);
  }
  const keys = {};
  const keyFor = (arm, t) => {
    const k = `${arm}/${t.state}__${t.vp}`;
    if (!keys[k]) keys[k] = JSON.parse(fs.readFileSync(path.join(WORK, "arms", arm, `${t.state}__${t.vp}`, "key.json"), "utf8"));
    return keys[k];
  };
  const per = {}; // arm -> task -> {n, hit, near, scroll, wrong, giveup, ease[]}
  const detail = [];
  for (const p of rows) {
    if (!p || !p.answers) continue;
    const arm = p.arm || reg[p.pid]?.arm;
    if (!arm) continue;
    for (const a of p.answers) {
      const t = tasks.find((x) => x.id === a.id);
      if (!t) continue;
      const key = keyFor(arm, t);
      let outcome;
      if (a.choice === -1) outcome = "giveup";
      else if (a.choice === 0) outcome = t.scroll ? "hit" : "scroll";
      else {
        const c = key.controls.find((x) => x.n === a.choice);
        outcome = !c ? "wrong" : ["hit", "via", "near"].includes(c.tasks[t.id]) ? c.tasks[t.id] : "wrong";
      }
      per[arm] ??= {};
      const s = (per[arm][t.id] ??= { n: 0, hit: 0, via: 0, near: 0, scroll: 0, wrong: 0, giveup: 0, ease: [] });
      s.n++;
      s[outcome]++;
      if (typeof a.ease === "number") s.ease.push(a.ease);
      const c = a.choice > 0 ? key.controls.find((x) => x.n === a.choice) : null;
      detail.push({ arm, pid: p.pid, persona: p.persona || reg[p.pid]?.persona, task: t.id, choice: a.choice, picked: c ? `${c.sel} "${c.text}"` : a.choice === 0 ? "scroll" : "give up", outcome, ease: a.ease, why: a.why });
    }
  }
  const arms = Object.keys(per).sort();
  const lines = ["| task | " + arms.map((a) => `${a} direct + via menu (near) | ${a} ease`).join(" | ") + " |", "|---|" + arms.map(() => "---|---|").join("")];
  const tot = {};
  for (const t of tasks) {
    const cells = arms.map((a) => {
      const s = per[a][t.id];
      if (!s) return "— | —";
      (tot[a] ??= { n: 0, hit: 0, via: 0, near: 0, ease: [] }).n += s.n;
      tot[a].hit += s.hit;
      tot[a].via += s.via;
      tot[a].near += s.near;
      tot[a].ease.push(...s.ease);
      const e = s.ease.length ? (s.ease.reduce((x, y) => x + y, 0) / s.ease.length).toFixed(1) : "—";
      return `${s.hit}${s.via ? `+${s.via}` : ""}/${s.n}${s.near ? ` (${s.near})` : ""} | ${e}`;
    });
    lines.push(`| ${t.id} | ${cells.join(" | ")} |`);
  }
  const mean = (xs) => (xs.length ? (xs.reduce((x, y) => x + y, 0) / xs.length).toFixed(2) : "—");
  lines.push(
    `| **all** | ${arms
      .map((a) => `**direct ${Math.round((100 * tot[a].hit) / tot[a].n)}%, on the path ${Math.round((100 * (tot[a].hit + tot[a].via)) / tot[a].n)}%** (${tot[a].hit}+${tot[a].via}/${tot[a].n}) | **${mean(tot[a].ease)}**`)
      .join(" | ")} |`
  );
  const out = { arms: Object.fromEntries(arms.map((a) => [a, { ...tot[a], ease: Number(mean(tot[a].ease)), direct: tot[a].hit / tot[a].n, onPath: (tot[a].hit + tot[a].via) / tot[a].n }])), perTask: per, detail };
  fs.mkdirSync(WORK, { recursive: true });
  fs.writeFileSync(path.join(WORK, "scores.json"), JSON.stringify(out, null, 1));
  fs.writeFileSync(path.join(WORK, "scores.md"), lines.join("\n") + "\n");
  console.log(lines.join("\n"));
  console.log(`\n${path.join(WORK, "scores.json")}`);
}

try {
  if (cmd === "render") await render();
  else if (cmd === "brief") brief();
  else if (cmd === "score") score();
  else {
    console.error(USAGE);
    process.exit(2);
  }
} catch (e) {
  console.error(`firstclick: ${e.message}`);
  process.exit(1);
}
