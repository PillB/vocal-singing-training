/* BreathFlow evidence/status audit. Source validity and clinical efficacy still need HUMAN review.
 * This only checks that authored claims remain traceable and that a draft path has
 * not silently become a published-main claim after a merge.
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const STATUS = new Set(["main", "draft", "proposal"]);

function sourceProblems(source, ids) {
  const failures = [];
  if (!/^E\d{2}$/.test(source.id || "") || ids.has(source.id)) {
    failures.push("duplicate/invalid evidence identifier: " + source.id);
  }
  ids.add(source.id);
  try {
    if (new URL(source.url).protocol !== "https:") failures.push(source.id + ": reference must be HTTPS");
  } catch { failures.push(source.id + ": invalid source URL"); }
  return failures;
}

/** Keep authoring statuses separate from content/evidence checks: no baseline exemptions. */
function releaseStatusProblems(feature, hasPath) {
  const errors = [];
  const loc = feature.id || "?";
  if (!STATUS.has(feature.status)) errors.push(loc + ": unknown release status");
  if (feature.status === "main" && (!feature.path || !hasPath(feature.path))) {
    errors.push(loc + ": claims main but path is missing");
  }
  if (feature.status === "draft" && (!feature.path || hasPath(feature.path) ||
      !Number.isInteger(feature.pr))) {
    errors.push(loc + ": draft/source drift: check PR, path and main merge status");
  }
  if (feature.status === "proposal" && feature.path) {
    errors.push(loc + ": proposed exercise must not claim a shipped source path");
  }
  return errors;
}

function featureProblems(feature, references, hasPath, doc) {
  const failures = [];
  const loc = feature.id || "?";
  if (!/^BF-F\\d{2}$/.test(loc)) failures.push("invalid feature ID: " + loc);
  if (!Array.isArray(feature.evidence) || feature.evidence.length === 0 ||
      feature.evidence.some(id => !references.has(id))) {
    failures.push(loc + ": missing or unknown evidence");
  }
  if (!feature.observable || !feature.counterexample) {
    failures.push(loc + ": no independent observable success/failure oracle");
  }
  if (!doc.includes("[" + loc + "]")) failures.push(loc + ": not linked from design document");
  return failures.concat(releaseStatusProblems(feature, hasPath));
}

export function auditEvidenceMatrix(matrix, doc, hasPath) {
  const failures = [];
  if (matrix.version !== 1) failures.push("unsupported evidence schema version");
  const ids = new Set();
  for (const source of matrix.sources || []) failures.push(...sourceProblems(source, ids));
  const features = new Set();
  for (const feature of matrix.features || []) {
    if (features.has(feature.id)) failures.push("duplicate feature: " + feature.id);
    features.add(feature.id);
    failures.push(...featureProblems(feature, ids, hasPath, doc));
  }
  if (!features.size) failures.push("missing feature registry");
  for (const id of ids) if (!doc.includes("[" + id + "]")) failures.push(id + ": unused/missing source in document");
  return failures;
}

export function repositoryHasPath(path) {
  return existsSync(resolve(process.cwd(), path));
}
