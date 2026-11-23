/**
 * The copy's promises read from the code, by parsing rather than by running. tests/marketing-claims.spec.js
 * proves them for the visitors it plays; tests/node/promise-guards.test.mjs uses this to prove what no set of
 * visitors can: that no other path could break them, signed in or not, on any day, after any number of takes.
 *
 * - sinksIn: every place a script can send something off the device. A fetch, a beacon, a socket, a message
 *   to another window, a worker, a WebRTC connection, an element given an address that it then loads, a
 *   navigation, a form submit, a cookie, a call into the account module's request, a resource hint (DNS
 *   prefetch and preconnect send a name out with no request the page can see), and an HTML or CSS string that
 *   loads a URL.
 * - voiceSourcesIn: every place a script can hear the voice or read a take.
 * - billingNamesIn / practicePath: where the plan is read, and whether Start, Stop, the routines, the rating
 *   and the step buttons can reach any of it.
 *
 * It finds the ordinary spellings, which is what an honest change uses. It is not a sandbox: a sink reached
 * through a computed name (`w["fe" + "tch"]`) is not seen, and the review of the change is what catches that.
 */
import { parse } from "espree";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

/** Constructors that open a channel. */
const CHANNELS = new Set([
  "WebSocket",
  "XMLHttpRequest",
  "EventSource",
  "Worker",
  "SharedWorker",
  "RTCPeerConnection",
  "webkitRTCPeerConnection",
  "Image",
  "Audio",
  "Request",
  "BroadcastChannel"
]);
/** Properties that, when set, make the browser fetch or go somewhere. */
const URL_PROPS = new Set(["src", "srcset", "href", "action", "formAction", "ping", "poster", "location"]);
/** Elements that fetch as soon as they have an address (an anchor waits for a click, so it is not here). */
const FETCHING_TAGS = new Set(["img", "script", "iframe", "frame", "link", "form", "object", "embed", "video", "audio", "source", "track", "input"]);
/** Names a window goes by, for `.open(` and friends. */
const WINDOW_NAMES = new Set(["window", "global", "globalThis", "self", "top", "parent", "opener", "w", "win"]);
const HINT = /\b(dns-prefetch|preconnect|prefetch|prerender|modulepreload)\b/;
const HTML_TAG = new RegExp(`<(${[...FETCHING_TAGS].join("|")})\\b`, "i");
const CSS_URL = /\burl\(/i;

/** What hears the voice or reads a take: the microphone, the recorder, the analyser's data, the stored takes. */
export const VOICE_SOURCES = new Set([
  "getUserMedia",
  "MediaRecorder",
  "ondataavailable",
  "createMediaStreamSource",
  "createMediaStreamTrackSource",
  "MediaStreamTrackProcessor",
  "captureStream",
  "AudioWorkletNode",
  "createScriptProcessor",
  "getByteFrequencyData",
  "getFloatFrequencyData",
  "getByteTimeDomainData",
  "getFloatTimeDomainData",
  "recBlob",
  "saveRecording",
  "getRecordingBlob",
  "listRecordings"
]);
/** What reads the plan or opens the sale. */
export const BILLING_NAMES = new Set(["VTBilling", "openPricing", "openAccount", "isPro", "trialActive", "trialStartedAt", "trialDaysLeft", "getEntitlement"]);
/** What asks whether the visitor is signed in. */
export const ACCOUNT_NAMES = new Set(["signedIn", "getSessionToken", "openAccount"]);

const nameOf = (node) => {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal") return String(node.value);
  return "";
};
const propName = (member) => (member.computed && member.property.type !== "Literal" ? "" : nameOf(member.property));
const objName = (member) => (member.object.type === "MemberExpression" ? propName(member.object) : nameOf(member.object));

/** The name a function is known by: its own, the variable or property it is assigned to, or the method's key. */
function functionName(node, parent) {
  if (node.id?.name) return node.id.name;
  if (!parent) return "";
  if (parent.type === "VariableDeclarator") return nameOf(parent.id);
  if (parent.type === "AssignmentExpression") return parent.left.type === "MemberExpression" ? propName(parent.left) : nameOf(parent.left);
  if (parent.type === "Property" || parent.type === "MethodDefinition") return nameOf(parent.key);
  return "";
}

const isFunction = (n) => n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression";

/**
 * Walk a script, calling `fn(node, parent, owner)` for every node, where `owner` is the nearest named function
 * around it ("(top)" outside any): a sink in an unnamed callback is filed under the function that made it.
 */
function walk(source, fn) {
  const ast = parse(source, { ecmaVersion: "latest", sourceType: "script" });
  const visit = (node, parent, owner) => {
    if (!node || typeof node.type !== "string") return;
    const here = isFunction(node) ? functionName(node, parent) || owner : owner;
    fn(node, parent, here, isFunction(node) && here !== owner);
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) v.forEach((c) => visit(c, node, here));
      else if (v && typeof v.type === "string") visit(v, node, here);
    }
  };
  visit(ast, null, "(top)");
}

/** Methods that send whatever they are called on. */
const NAMED_CALLS = new Map([
  ["fetch", "fetch"],
  ["sendBeacon", "sendBeacon"],
  ["postMessage", "postMessage"],
  ["submit", "submit"],
  ["requestSubmit", "submit"]
]);

/** Methods that send only on one object, as `object.method`, and the sink each makes. */
const OWNED_CALLS = new Map([
  ["serviceWorker.register", "serviceWorker.register"],
  ["location.assign", "navigate"],
  ["location.replace", "navigate"],
  ["navigator.share", "share"],
  ["VTAccount.request", "VTAccount.request"]
]);

/** The sink a call makes, or "". */
function callSink(node) {
  const c = node.callee;
  if (c.type === "Identifier") return c.name === "fetch" || c.name === "importScripts" ? c.name : "";
  if (c.type !== "MemberExpression") return "";
  const prop = propName(c);
  const obj = objName(c);
  if (NAMED_CALLS.has(prop)) return NAMED_CALLS.get(prop);
  if (prop === "open" && WINDOW_NAMES.has(obj)) return "window.open";
  return OWNED_CALLS.get(`${obj}.${prop}`) || attributeSink(node, prop);
}

function attributeSink(node, prop) {
  const arg = node.arguments[0];
  const value = arg?.type === "Literal" && typeof arg.value === "string" ? arg.value.toLowerCase() : "";
  if (prop === "setAttribute" && (URL_PROPS.has(value) || value === "formaction")) return "setAttribute:" + value;
  if (prop === "createElement" && FETCHING_TAGS.has(value)) return "createElement:" + value;
  return "";
}

/** A value that cannot be an address: a word with no slash, colon, dot or query, a number, a boolean or null. */
function notAnAddress(v) {
  if (v.type === "ConditionalExpression") return notAnAddress(v.consequent) && notAnAddress(v.alternate);
  return v.type === "Literal" && (typeof v.value !== "string" || !/[/:.?]/.test(v.value));
}

/** The sink an assignment makes, or "". */
function assignSink(node) {
  const l = node.left;
  if (notAnAddress(node.right)) return "";
  if (l.type === "Identifier" && l.name === "location") return "navigate";
  if (l.type !== "MemberExpression") return "";
  const prop = propName(l);
  const obj = objName(l);
  if (prop === "cookie" && obj === "document") return "cookie";
  if (prop === "location" || (obj === "location" && prop === "href")) return "navigate";
  return URL_PROPS.has(prop) ? "set:" + prop : "";
}

/** The sink a string carries: a resource hint, an HTML tag that fetches, or a CSS url(). */
function textSink(text) {
  if (HINT.test(text)) return "hint";
  if (HTML_TAG.test(text)) return "html:" + HTML_TAG.exec(text)[1].toLowerCase();
  if (CSS_URL.test(text)) return "css-url";
  return "";
}

function nodeSink(node) {
  switch (node.type) {
    case "CallExpression":
      return callSink(node);
    case "ImportExpression":
      return "import()";
    case "NewExpression": {
      const name = node.callee.type === "MemberExpression" ? propName(node.callee) : nameOf(node.callee);
      return CHANNELS.has(name) ? "new " + name : "";
    }
    case "AssignmentExpression":
      return assignSink(node);
    case "Literal":
      return typeof node.value === "string" ? textSink(node.value) : "";
    case "TemplateElement":
      return textSink(node.value.cooked ?? node.value.raw);
    default:
      return "";
  }
}

const bump = (bag, key) => {
  bag[key] = (Object.hasOwn(bag, key) ? bag[key] : 0) + 1;
};

/**
 * The sinks in one script, as `function › kind` with a count.
 * @param {string} source
 * @returns {Record<string, number>}
 */
export function sinksIn(source) {
  const found = Object.create(null);
  walk(source, (node, _parent, owner) => {
    const kind = nodeSink(node);
    if (kind) bump(found, `${owner} › ${kind}`);
  });
  return found;
}

/** Each name from `names` the script uses, as an identifier or a property, with a count. */
function namesIn(source, names) {
  const found = {};
  walk(source, (node) => {
    if (node.type === "Identifier" && names.has(node.name)) bump(found, node.name);
  });
  return found;
}

/** Where a script hears the voice or reads a take. */
export const voiceSourcesIn = (source) => namesIn(source, VOICE_SOURCES);
/** Where a script reads the plan or opens the sale. */
export const billingNamesIn = (source) => namesIn(source, BILLING_NAMES);

/**
 * Each named function of a script: the names it refers to (a call, or a function handed on as a callback),
 * and the billing names and voice sources it uses. Functions that share a name are merged, which can only add paths.
 */
export function functionsOf(source) {
  const fns = Object.create(null);
  const entry = (name) => (fns[name] ||= { refs: new Set(), billing: {}, voice: {}, account: {} });
  walk(source, (node, parent, owner, opens) => {
    if (opens) entry(owner);
    if (node.type !== "Identifier" || !fns[owner]) return;
    if (BILLING_NAMES.has(node.name)) bump(fns[owner].billing, node.name);
    if (VOICE_SOURCES.has(node.name)) bump(fns[owner].voice, node.name);
    if (ACCOUNT_NAMES.has(node.name)) bump(fns[owner].account, node.name);
    const isProperty = parent?.type === "MemberExpression" && parent.property === node && !parent.computed;
    if (!isProperty) fns[owner].refs.add(node.name);
  });
  return fns;
}

/**
 * The functions reachable from `roots`, each with the shortest path that reaches it.
 * @returns {Map<string, string[]>}
 */
export function reachable(fns, roots) {
  const seen = new Map();
  const queue = roots.filter((r) => fns[r]).map((r) => [r, [r]]);
  while (queue.length) {
    const [name, trail] = queue.shift();
    if (seen.has(name)) continue;
    seen.set(name, trail);
    for (const ref of fns[name].refs) if (fns[ref] && !seen.has(ref)) queue.push([ref, [...trail, ref]]);
  }
  return seen;
}

/**
 * Every function reachable from `roots` that uses a name of `kind` ("billing": reads the plan or opens the sale;
 * "account": asks whether the visitor is signed in), with what it uses and how it is reached:
 * { name: { uses: "VTBilling:2 getEntitlement:1", via: "startPractice > ... > name" } }.
 */
export function practicePath(source, roots, kind = "billing") {
  const fns = functionsOf(source);
  const out = {};
  for (const [name, trail] of reachable(fns, roots)) {
    const uses = Object.entries(fns[name][kind])
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([k, n]) => `${k}:${n}`)
      .join(" ");
    if (uses) out[name] = { uses, via: trail.join(" > ") };
  }
  return out;
}

/** The scripts a visitor's browser runs: everything under js/, and the inline scripts of the pages. */
export function shippedScripts(root) {
  const out = {};
  const visit = (dir) => {
    for (const item of readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const rel = dir + "/" + item.name;
      if (item.isDirectory()) visit(rel);
      else if (item.name.endsWith(".js")) out[rel] = readFileSync(path.join(root, rel), "utf8");
    }
  };
  visit("js");
  for (const page of ["index.html", "guide.html", "privacy.html", "terms.html"]) {
    const html = readFileSync(path.join(root, page), "utf8");
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
    inline.forEach((code, i) => {
      if (code.trim()) out[`${page}#inline-${i + 1}`] = code;
    });
  }
  return out;
}

/** `scan` over every shipped script, files where it finds nothing left out. */
export function acrossScripts(root, scan) {
  const out = {};
  for (const [file, source] of Object.entries(shippedScripts(root))) {
    const found = scan(source);
    if (Object.keys(found).length) out[file] = found;
  }
  return out;
}
