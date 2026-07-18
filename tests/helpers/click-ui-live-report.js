/**
 * Living report writer for headed click-vs-UI validation.
 * JSON: qa/geometry/click-ui-live-report.json
 * MD:   docs/28-CLICK-UI-VALIDATION-LOG.md
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const REPORT_JSON = path.join(ROOT, "qa", "geometry", "click-ui-live-report.json");
const ISSUES_JSON = path.join(ROOT, "qa", "geometry", "click-ui-issues.json");
const REPORT_MD = path.join(ROOT, "docs", "28-CLICK-UI-VALIDATION-LOG.md");
const SHOT_ROOT = path.join(ROOT, "qa", "screenshots", "click-ui-live");

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function emptyReport() {
  return {
    generatedAt: new Date().toISOString(),
    mode: "headed-click-ui-live",
    updatedAt: new Date().toISOString(),
    formats: [],
    dualReviews: [],
    summary: {
      controls: 0,
      centerHitOk: 0,
      centerHitFail: 0,
      effectOk: 0,
      effectFail: 0,
      logOk: 0,
      logFail: 0,
      offsetOnlyHits: 0
    },
    issues: []
  };
}

function loadReport() {
  if (fs.existsSync(REPORT_JSON)) {
    try {
      return JSON.parse(fs.readFileSync(REPORT_JSON, "utf8"));
    } catch {
      /* fallthrough */
    }
  }
  return emptyReport();
}

function saveReport(report) {
  report.updatedAt = new Date().toISOString();
  ensureDir(path.dirname(REPORT_JSON));
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  fs.writeFileSync(ISSUES_JSON, JSON.stringify(report.issues || [], null, 2));
  writeMarkdown(report);
  return REPORT_JSON;
}

function relShot(abs) {
  if (!abs) return "";
  return path.relative(ROOT, abs).replace(/\\/g, "/");
}

/**
 * Append one control result; keep formats[] nested structure.
 */
function appendControl(report, { format, exercise, control }) {
  let fmt = report.formats.find((f) => f.name === format.name);
  if (!fmt) {
    fmt = {
      name: format.name,
      width: format.width,
      height: format.height,
      fullscreen: !!format.fs,
      exercises: []
    };
    report.formats.push(fmt);
  }
  let ex = fmt.exercises.find((e) => e.id === exercise);
  if (!ex) {
    ex = { id: exercise, controls: [] };
    fmt.exercises.push(ex);
  }
  // replace if same control retested
  const idx = ex.controls.findIndex((c) => c.control === control.control);
  if (idx >= 0) ex.controls[idx] = control;
  else ex.controls.push(control);

  // summary recount
  let controls = 0,
    centerHitOk = 0,
    centerHitFail = 0,
    effectOk = 0,
    effectFail = 0,
    logOk = 0,
    logFail = 0,
    offsetOnlyHits = 0;
  for (const f of report.formats) {
    for (const e of f.exercises) {
      for (const c of e.controls) {
        controls++;
        if (c.centerHit) centerHitOk++;
        else centerHitFail++;
        if (c.effectOk) effectOk++;
        else if (c.effectOk === false) effectFail++;
        if (c.logOk) logOk++;
        else if (c.logOk === false) logFail++;
        if (c.offsetOnly) offsetOnlyHits++;
      }
    }
  }
  report.summary = {
    controls,
    centerHitOk,
    centerHitFail,
    effectOk,
    effectFail,
    logOk,
    logFail,
    offsetOnlyHits
  };
  saveReport(report);
  return report;
}

function addIssue(report, issue) {
  report.issues = report.issues || [];
  report.issues.push({
    id: `ISS-${String(report.issues.length + 1).padStart(3, "0")}`,
    at: new Date().toISOString(),
    ...issue
  });
  saveReport(report);
  return report.issues[report.issues.length - 1];
}

function addDualReview(report, entry) {
  report.dualReviews = report.dualReviews || [];
  report.dualReviews.push({ at: new Date().toISOString(), ...entry });
  saveReport(report);
}

function writeMarkdown(report) {
  ensureDir(path.dirname(REPORT_MD));
  const lines = [];
  lines.push("# 28 — Click vs UI validation log (headed, mouse-only)");
  lines.push("");
  lines.push(`**Updated:** ${report.updatedAt || report.generatedAt}`);
  lines.push(`**Mode:** ${report.mode}`);
  lines.push(
    "**Rules:** headed Chromium · human `mouse.move` paths · no programmatic control clicks · offset grid ±6–10px"
  );
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|------:|");
  const s = report.summary || {};
  for (const [k, v] of Object.entries(s)) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push("");

  if (report.issues?.length) {
    lines.push("## Issues");
    lines.push("");
    lines.push("| ID | Sev | Format | Exercise | Control | Code | Message |");
    lines.push("|----|-----|--------|----------|---------|------|---------|");
    for (const i of report.issues) {
      lines.push(
        `| ${i.id} | ${i.sev || "?"} | ${i.format || ""} | ${i.exercise || ""} | ${i.control || ""} | ${i.code || ""} | ${String(i.msg || "").replace(/\|/g, "/")} |`
      );
    }
    lines.push("");
  }

  if (report.dualReviews?.length) {
    lines.push("## Dual-agent reviews (Elon + Zuckerberg)");
    lines.push("");
    for (const d of report.dualReviews) {
      lines.push(`### ${d.format || "?"} / ${d.exercise || "batch"} — ${d.at || ""}`);
      lines.push("");
      if (d.elon) {
        lines.push("**Elon (product):**");
        lines.push("");
        lines.push(d.elon);
        lines.push("");
      }
      if (d.zuck) {
        lines.push("**Zuckerberg (architecture / hit geometry):**");
        lines.push("");
        lines.push(d.zuck);
        lines.push("");
      }
      if (d.actions?.length) {
        lines.push("**Follow-ups:**");
        for (const a of d.actions) lines.push(`- ${a}`);
        lines.push("");
      }
    }
  }

  lines.push("## Per-control log");
  lines.push("");
  for (const f of report.formats || []) {
    lines.push(
      `## Format \`${f.name}\` (${f.width}×${f.height}${f.fullscreen ? " fullscreen" : ""})`
    );
    lines.push("");
    for (const e of f.exercises || []) {
      lines.push(`### ${e.id}`);
      lines.push("");
      for (const c of e.controls || []) {
        lines.push(`#### \`${c.control}\``);
        lines.push("");
        lines.push(`- **Center hit (mouse over paint):** ${c.centerHit ? "PASS" : "FAIL"} — top=\`${c.hitTop || "?"}\``);
        lines.push(
          `- **Offset grid:** ${formatOffset(c.offsetGrid)} ${c.offsetOnly ? "⚠️ **OFFSET-ONLY** (center dead)" : ""}`
        );
        lines.push(
          `- **Press log:** ${c.logOk ? "PASS" : "FAIL"} — ${JSON.stringify(c.logMatch || {})}`
        );
        lines.push(
          `- **Effect:** ${c.effectOk ? "PASS" : "FAIL"} — expected: ${c.expected || "?"} · actual: ${c.actual || "?"}`
        );
        lines.push(`- **Click point:** (${c.x != null ? Math.round(c.x) : "?"}, ${c.y != null ? Math.round(c.y) : "?"})`);
        lines.push("");
        lines.push("| Stage | Path |");
        lines.push("|-------|------|");
        lines.push(`| before | \`${c.shots?.before || ""}\` |`);
        lines.push(`| hover | \`${c.shots?.hover || ""}\` |`);
        lines.push(`| click-moment | \`${c.shots?.down || ""}\` |`);
        lines.push(`| after | \`${c.shots?.after || ""}\` |`);
        lines.push("");
        if (c.elon) {
          lines.push(`- **Elon:** ${c.elon}`);
        }
        if (c.zuck) {
          lines.push(`- **Zuck:** ${c.zuck}`);
        }
        if (c.issueIds?.length) {
          lines.push(`- **Issues:** ${c.issueIds.join(", ")}`);
        }
        lines.push("");
      }
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(`Screenshots root: \`${path.relative(ROOT, SHOT_ROOT)}\``);
  lines.push(`JSON: \`${path.relative(ROOT, REPORT_JSON)}\``);
  lines.push(`Issues: \`${path.relative(ROOT, ISSUES_JSON)}\``);
  if (report.deploy) {
    lines.push("");
    lines.push("## Deploy");
    lines.push("");
    lines.push(JSON.stringify(report.deploy, null, 2));
  }
  lines.push("");
  fs.writeFileSync(REPORT_MD, lines.join("\n"));
  return REPORT_MD;
}

function formatOffset(grid) {
  if (!grid || typeof grid !== "object") return "n/a";
  return Object.entries(grid)
    .map(([k, v]) => `${k}:${v ? "✓" : "✗"}`)
    .join(" ");
}

module.exports = {
  ROOT,
  REPORT_JSON,
  ISSUES_JSON,
  REPORT_MD,
  SHOT_ROOT,
  ensureDir,
  emptyReport,
  loadReport,
  saveReport,
  appendControl,
  addIssue,
  addDualReview,
  writeMarkdown,
  relShot
};
