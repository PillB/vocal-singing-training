#!/usr/bin/env node
/**
 * Static red-team scan for Vocal Studio SPA (no network).
 * Exit 1 on P0 patterns (live secrets). Warnings printed for review.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

const findings = [];

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    if (name === "node_modules" || name === ".git" || name === "test-results") continue;
    const p = path.join(dir, name);
    const st = fs.statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(js|html|mjs|css|json|md)$/i.test(name)) acc.push(p);
  }
  return acc;
}

const files = walk(ROOT).filter((f) => !f.includes("node_modules"));

// Real secrets only — exclude documentation patterns like "sk_live_…" placeholders
const SECRET = /(?:sk_live_|rk_live_)[a-zA-Z0-9]{16,}|whsec_[A-Za-z0-9]{16,}|-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/;
const DANGEROUS = /\beval\s*\(|new Function\s*\(|document\.write\s*\(/;

const SKIP =
  /^(docs\/|tests\/|qa\/redteam|workers\/.*README|node_modules)/;

for (const f of files) {
  const rel = path.relative(ROOT, f);
  if (SKIP.test(rel) || rel.includes("node_modules")) continue;
  if (rel.startsWith("docs/") && rel.includes("INTERNAL")) continue;
  let t;
  try {
    t = fs.readFileSync(f, "utf8");
  } catch {
    continue;
  }
  if (SECRET.test(t)) {
    findings.push({ sev: "P0", file: rel, kind: "secret-pattern" });
  }
  if (/\.js$/.test(f) && DANGEROUS.test(t) && !rel.includes("tests/")) {
    findings.push({ sev: "P2", file: rel, kind: "dangerous-api" });
  }
  // innerHTML with variable concatenation in app code — a review list, never a gate (P2 does not fail the run).
  // It cannot be one (red team CXSS-4, Nov 2026): it reads single lines of five files, and an AST walk over every
  // js/ file still could not tell the three CXSS-1 sinks from the rest. Measured on 09dd270: 120 HTML sinks carry
  // 340 template interpolations no escaper wraps, nearly all catalog or engine data; the walk finds the catalogue
  // card and hold-pill sinks among them, and misses the 12-week HUD, whose tainted string is built in
  // practice-modes.js and reaches innerHTML through a call in scenes/guided.js (taint across files). What does fail
  // on an unescaped sink fed by stored data is tests/synced-doc-injection.spec.js (mutation set `inject`).
  if (/js\/(app|billing|auth|ads|storage)\.js$/.test(rel) && /innerHTML\s*\+=|innerHTML\s*=\s*[^`'"]/.test(t)) {
    const lines = t.split("\n");
    lines.forEach((line, i) => {
      if (/innerHTML/.test(line) && (/\$\{/.test(line) || /\+/.test(line))) {
        findings.push({
          sev: "P2",
          file: rel,
          kind: "innerHTML-concat",
          line: i + 1
        });
      }
    });
  }
}

const p0 = findings.filter((f) => f.sev === "P0");
console.log(JSON.stringify({ ok: p0.length === 0, findings }, null, 2));
if (p0.length) process.exit(1);
