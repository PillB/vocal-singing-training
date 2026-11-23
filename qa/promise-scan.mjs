/**
 * The copy's promises read from the code, by parsing rather than by running. tests/marketing-claims.spec.js
 * proves them for the visitors it plays; tests/node/promise-guards.test.mjs uses this to prove what no set of
 * visitors can: that no other path could break them, signed in or not, on any day, after any number of takes.
 *
 * - sinksIn: the places a script can send something off the device, in their ordinary spellings. A fetch
 *   (called, deferred with fetchLater, bound, or handed on as a value), a beacon, a socket, WebTransport, a
 *   message to another window, a worker, a WebRTC connection, speech recognition (Chrome streams the
 *   microphone to Google's servers for it), an element given an address that it then loads (by property,
 *   setAttribute(NS) or Object.assign), a navigation, a form submit, a cookie (document.cookie or
 *   cookieStore), a call into the account module's request, a resource hint (DNS prefetch and preconnect send
 *   a name out with no request the page can see), a module import, and an HTML or CSS string that loads a URL.
 * - voiceSourcesIn: every place a script can hear the voice or read a take, by name or by the takes' store.
 * - billingNamesIn / practicePath: where the plan is read, and whether Start, Stop, the routines, the rating
 *   and the step buttons can reach any of it.
 *
 * It finds the ordinary spellings, which is what an honest change uses. It is not a sandbox: a sink reached
 * through a computed name (`w["fe" + "tch"]`), an alias made through a variable that is not a sink's own name,
 * or a value handed from one file to another is not seen, and the review of the change is what catches that.
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
  "BroadcastChannel",
  "WebTransport"
]);
/** Speech recognition: in Chrome it streams the microphone to a web service, so naming it at all is a way off the device. */
const SPEECH = new Set(["SpeechRecognition", "webkitSpeechRecognition"]);
/** Properties that, when set, make the browser fetch or go somewhere. */
const URL_PROPS = new Set(["src", "srcset", "href", "action", "formAction", "ping", "poster", "location"]);
/** Parts of the location that, when set, load a new page. */
const LOCATION_PARTS = new Set(["href", "search", "pathname", "host", "hostname", "port", "protocol"]);
/** Elements that fetch as soon as they have an address (an anchor waits for a click, so it is not here). SVG's are lower-cased. */
const FETCHING_TAGS = new Set(["img", "script", "iframe", "frame", "link", "form", "object", "embed", "video", "audio", "source", "track", "input", "image", "use", "feimage"]);
/** Names a window goes by, for `.open(` and friends. */
const WINDOW_NAMES = new Set(["window", "global", "globalThis", "self", "top", "parent", "opener", "w", "win"]);
const HINT = /\b(dns-prefetch|preconnect|prefetch|prerender|modulepreload)\b/;
const HTML_TAG = new RegExp(`<(${[...FETCHING_TAGS].join("|")})\\b`, "i");
const CSS_URL = /\burl\(/i;
const CSS_IMPORT = /@import\b/i;
const ANCHOR_PING = /<a\b[^>]*\bping\s*=/i;

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
  "createMediaElementSource",
  "decodeAudioData",
  "webkitGetUserMedia",
  "mozGetUserMedia",
  ...SPEECH,
  "recBlob",
  "saveRecording",
  "getRecordingBlob",
  "listRecordings"
]);
/** The takes' own store, opened by its name rather than through js/storage.js. */
const VOICE_LITERALS = new Set(["vt_recordings_db", "recordings"]);
/** What reads the plan or opens the sale. */
export const BILLING_NAMES = new Set(["VTBilling", "openPricing", "openAccount", "isPro", "trialActive", "trialStartedAt", "trialDaysLeft", "getEntitlement"]);
/** What asks whether the visitor is signed in. */
export const ACCOUNT_NAMES = new Set(["VTAccount", "VTSync", "signedIn", "getSessionToken", "openAccount", "signInWithGoogle", "startEmailSignIn", "renderGoogleButton"]);
/** What `VTAccount.getState()` says about the visitor: `.account` is who is signed in, `.entitlement` what they bought. */
const ACCOUNT_STATE = new Set(["account", "entitlement"]);

const nameOf = (node) => {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal") return String(node.value);
  return "";
};
const propName = (member) => (member.computed && member.property.type !== "Literal" ? "" : nameOf(member.property));
const objName = (member) => (member.object.type === "MemberExpression" ? propName(member.object) : nameOf(member.object));

/** A class's methods and fields: named by their own key, for `this.method()`. */
const CLASS_MEMBERS = new Set(["MethodDefinition", "PropertyDefinition"]);

/** The key a function is set under: the property it is assigned to, or its key in an object or class. */
function keyOf(parent) {
  if (parent.type === "AssignmentExpression") return propName(parent.left);
  return parent.type === "Property" || CLASS_MEMBERS.has(parent.type) ? nameOf(parent.key) : "";
}

/** The selector of the element a listener is added to: `$("#wb-last")?.addEventListener(...)` gives "#wb-last". */
function selectorOf(expr) {
  if (expr?.type === "ChainExpression") return selectorOf(expr.expression);
  if (expr?.type === "MemberExpression") return selectorOf(expr.object);
  if (expr?.type !== "CallExpression") return "";
  const arg = expr.arguments[0];
  return arg?.type === "Literal" && typeof arg.value === "string" ? arg.value : selectorOf(expr.callee);
}

/** " #wb-last" for a callback handed to `addEventListener` on an element found by its selector, or "". */
function listenerKey(node, parent) {
  const c = parent.type === "CallExpression" && parent.arguments.includes(node) ? parent.callee : null;
  if (c?.type !== "MemberExpression" || propName(c) !== "addEventListener") return "";
  const sel = selectorOf(c.object);
  return sel ? " " + sel : "";
}

/**
 * The name a function is known by: its own, the variable it is assigned to, its key, or the element it listens
 * on. A callback set on a property or in an object inside a named function (`btn.onclick = () => ...` in
 * renderNextStepCard) is named after both, "renderNextStepCard.onclick", so a file's many onclicks are not
 * merged into one; a listener on an element found by its selector, "bindRetention #wb-last", so each button's
 * handler can be a way into practice of its own. A class's methods and fields keep their own names.
 */
function functionName(node, parent, owner) {
  if (node.id?.name) return node.id.name;
  if (!parent) return "";
  if (parent.type === "VariableDeclarator") return nameOf(parent.id);
  if (parent.type === "AssignmentExpression" && parent.left.type !== "MemberExpression") return nameOf(parent.left);
  const listener = listenerKey(node, parent);
  if (listener) return owner + listener;
  const key = keyOf(parent);
  return key && owner !== "(top)" && !CLASS_MEMBERS.has(parent.type) ? `${owner}.${key}` : key;
}

/** A class field that holds a value, not a function (`send = fetch`): named by its key, as a method would be. */
const fieldName = (node) => (node.type === "PropertyDefinition" && node.value && !isFunction(node.value) ? nameOf(node.key) : "");

const isFunction = (n) => n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression";

/** A script, or a module when it imports or exports. */
function parseScript(source) {
  try {
    return parse(source, { ecmaVersion: "latest", sourceType: "script" });
  } catch (err) {
    try {
      return parse(source, { ecmaVersion: "latest", sourceType: "module" });
    } catch {
      throw err;
    }
  }
}

/**
 * Walk a script, calling `fn(node, parent, owner, outer, up)` for every node. `owner` is the nearest named
 * function around it ("(top)" outside any): a sink in an unnamed callback is filed under the function that made
 * it. `outer` is set on the node where a named function opens, to the function it opens in. `up` is the chain
 * of nodes above, nearest last.
 */
function walk(source, fn) {
  const up = [];
  const visit = (node, owner) => {
    if (!node || typeof node.type !== "string") return;
    const parent = up.at(-1) || null;
    const here = isFunction(node) ? functionName(node, parent, owner) || owner : fieldName(node) || owner;
    fn(node, parent, here, here !== owner ? owner : null, up);
    up.push(node);
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) v.forEach((c) => visit(c, here));
      else if (v && typeof v.type === "string") visit(v, here);
    }
    up.pop();
  };
  visit(parseScript(source), "(top)");
}

/** Methods that send whatever they are called on. */
const NAMED_CALLS = new Map([
  ["fetch", "fetch"],
  ["fetchLater", "fetchLater"],
  ["sendBeacon", "sendBeacon"],
  ["postMessage", "postMessage"],
  ["submit", "submit"],
  ["requestSubmit", "submit"],
  ["importScripts", "importScripts"]
]);
/** Functions that send when called bare. */
const BARE_CALLS = new Set(["fetch", "fetchLater", "importScripts"]);

/** Methods that send only on one object, as `object.method`, and the sink each makes. */
const OWNED_CALLS = new Map([
  ["serviceWorker.register", "serviceWorker.register"],
  ["location.assign", "navigate"],
  ["location.replace", "navigate"],
  ["navigation.navigate", "navigate"],
  ["navigator.share", "share"],
  ["cookieStore.set", "cookie"],
  ["VTAccount.request", "VTAccount.request"]
]);
/** Ways to call a function later or on another object: `fetch.call(...)`, `navigator.sendBeacon.bind(navigator)`. */
const BOUND = new Set(["call", "apply", "bind"]);

/** The sink a function is, as a value: `fetch`, `window.fetch`, `navigator.sendBeacon`, or "". */
function sinkValue(node) {
  if (node.type === "Identifier") return BARE_CALLS.has(node.name) ? node.name : "";
  return node.type === "MemberExpression" ? NAMED_CALLS.get(propName(node)) || "" : "";
}

/** The sink a call makes, or "". */
function callSink(node, ctx) {
  const c = node.callee;
  if (c.type === "Identifier") return BARE_CALLS.has(c.name) ? c.name : c.name === "open" && !ctx.ownsOpen() ? "window.open" : "";
  if (c.type !== "MemberExpression") return "";
  const prop = propName(c);
  if (BOUND.has(prop)) return sinkValue(c.object);
  const obj = objName(c);
  if (NAMED_CALLS.has(prop)) return NAMED_CALLS.get(prop);
  if (prop === "open" && WINDOW_NAMES.has(obj)) return "window.open";
  if (obj === "Object" && prop === "assign") return assignedAddress(node.arguments.slice(1));
  return OWNED_CALLS.get(`${obj}.${prop}`) || attributeSink(node, prop);
}

function attributeSink(node, prop) {
  const arg = node.arguments[prop.endsWith("NS") ? 1 : 0];
  const value = arg?.type === "Literal" && typeof arg.value === "string" ? arg.value.toLowerCase() : "";
  const attribute = URL_PROPS.has(value) || value === "formaction" || value === "xlink:href";
  if ((prop === "setAttribute" || prop === "setAttributeNS") && attribute) return "setAttribute:" + value;
  if ((prop === "createElement" || prop === "createElementNS") && FETCHING_TAGS.has(value)) return "createElement:" + value;
  return "";
}

/** `Object.assign(img, { src: url })`: the first address an object sets, as "set:src", or "". */
function assignedAddress(sources) {
  for (const o of sources) {
    const hit = o.type === "ObjectExpression" && o.properties.find((p) => p.type === "Property" && URL_PROPS.has(nameOf(p.key)) && !notAnAddress(p.value));
    if (hit) return "set:" + nameOf(hit.key);
  }
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
  if (prop === "location" || (obj === "location" && LOCATION_PARTS.has(prop))) return "navigate";
  return URL_PROPS.has(prop) ? "set:" + prop : "";
}

/** The sink a string carries: a resource hint, an HTML tag that fetches, an anchor that pings, or CSS that loads. */
function textSink(text) {
  if (HINT.test(text)) return "hint";
  if (HTML_TAG.test(text)) return "html:" + HTML_TAG.exec(text)[1].toLowerCase();
  if (ANCHOR_PING.test(text)) return "html:a-ping";
  if (CSS_IMPORT.test(text)) return "css-import";
  if (CSS_URL.test(text)) return "css-url";
  return "";
}

/** Whether a value reaches its parent's result: through `a || b` or `a ? b : c`, but not as `&&`'s left or a test. */
function flowsThrough(p, child) {
  if (p.type === "LogicalExpression") return p.operator !== "&&" || p.right === child;
  if (p.type === "ConditionalExpression") return p.test !== child;
  if (p.type === "SequenceExpression") return p.expressions.at(-1) === child;
  return p.type === "ChainExpression" || p.type === "AwaitExpression";
}

/** Where a value is kept, passed or returned. */
const HOLDS = {
  VariableDeclarator: (p, c) => p.init === c,
  AssignmentExpression: (p, c) => p.right === c,
  Property: (p, c) => p.value === c,
  ArrayExpression: () => true,
  CallExpression: (p, c) => p.arguments.includes(c),
  NewExpression: (p, c) => p.arguments.includes(c),
  ReturnStatement: () => true,
  ArrowFunctionExpression: (p, c) => p.body === c,
  AssignmentPattern: (p, c) => p.right === c,
  PropertyDefinition: (p, c) => p.value === c
};

/** Whether `node` is handed on as a value (`const f = fetch`, `go(fetch)`), rather than called or only tested. */
function handedOn(node, up) {
  let child = node;
  let i = up.length - 1;
  while (i >= 0 && flowsThrough(up[i], child)) child = up[i--];
  const holds = i >= 0 ? HOLDS[up[i].type] : null;
  return !!holds && holds(up[i], child);
}

/** A sink function handed on as a value, to be called later. */
function valueSink(node, up) {
  const v = sinkValue(node);
  return v && handedOn(node, up) ? v : "";
}

const ctorName = (callee) => {
  if (callee.type === "LogicalExpression") return ctorName(callee.left) || ctorName(callee.right);
  return callee.type === "MemberExpression" ? propName(callee) : nameOf(callee);
};

/** The sink each kind of node can make. */
const NODE_SINKS = {
  CallExpression: (n, up, ctx) => callSink(n, ctx),
  NewExpression: (n) => (CHANNELS.has(ctorName(n.callee)) ? "new " + ctorName(n.callee) : ""),
  AssignmentExpression: (n) => assignSink(n),
  Identifier: (n, up) => (SPEECH.has(n.name) ? "speech-recognition" : valueSink(n, up)),
  MemberExpression: (n, up) => valueSink(n, up),
  Literal: (n) => (typeof n.value === "string" ? textSink(n.value) : ""),
  TemplateElement: (n) => textSink(n.value.cooked ?? n.value.raw),
  ImportExpression: () => "import()",
  ImportDeclaration: () => "import",
  ExportAllDeclaration: () => "import",
  ExportNamedDeclaration: (n) => (n.source ? "import" : ""),
  // `const { fetch: send } = window` or `const { sendBeacon } = navigator`: the sink taken out of an object. A
  // bare `{ fetch }` is already its own value, found as an identifier handed on.
  Property: (n, up) => (up.at(-1)?.type === "ObjectPattern" && !(n.shorthand && BARE_CALLS.has(nameOf(n.key))) ? NAMED_CALLS.get(nameOf(n.key)) || "" : "")
};

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
  const own = ownOpens(source);
  const ctx = { owner: "(top)", ownsOpen: () => own.has(ctx.owner) || own.has("(top)") };
  walk(source, (node, _parent, owner, _outer, up) => {
    ctx.owner = owner;
    const kind = NODE_SINKS[node.type]?.(node, up, ctx);
    if (kind) bump(found, `${owner} › ${kind}`);
  });
  return found;
}

/** The functions that have an `open` of their own (a variable, a parameter or a function), so a bare `open(` there is not the window's. */
function ownOpens(source) {
  const own = new Set();
  walk(source, (node, _parent, owner, outer) => {
    if (node.type === "VariableDeclarator" && nameOf(node.id) === "open") own.add(owner);
    if (!isFunction(node)) return;
    if (node.id?.name === "open") own.add(outer || owner);
    if (node.params.some((p) => nameOf(p) === "open")) own.add(owner);
  });
  return own;
}

/** The name a node uses from `names`: an identifier or property, a bracketed key (`m["getUserMedia"]`), or one of `literals` anywhere. */
function nameUsed(node, parent, names, literals) {
  if (node.type === "Identifier") return names.has(node.name) ? node.name : "";
  if (node.type !== "Literal" || typeof node.value !== "string") return "";
  if (literals?.has(node.value)) return node.value;
  return parent?.type === "MemberExpression" && parent.computed && parent.property === node && names.has(node.value) ? node.value : "";
}

/** `VTAccount.getState().account` (or `.entitlement`): who is signed in, read straight from the account module. */
function accountState(node) {
  if (node.type !== "MemberExpression" || !ACCOUNT_STATE.has(propName(node))) return "";
  const c = node.object.type === "CallExpression" ? node.object.callee : null;
  return c?.type === "MemberExpression" && propName(c) === "getState" && objName(c) === "VTAccount" ? "getState()." + propName(node) : "";
}

/** What a node uses that asks whether the visitor is signed in. */
const accountUsed = (node, parent) => nameUsed(node, parent, ACCOUNT_NAMES) || accountState(node);

/** Each name from `names` the script uses, with a count. */
function namesIn(source, used) {
  const found = {};
  walk(source, (node, parent) => {
    const name = used(node, parent);
    if (name) bump(found, name);
  });
  return found;
}

/** Where a script hears the voice or reads a take. */
export const voiceSourcesIn = (source) => namesIn(source, (n, p) => nameUsed(n, p, VOICE_SOURCES, VOICE_LITERALS));
/** Where a script reads the plan or opens the sale. */
export const billingNamesIn = (source) => namesIn(source, (n, p) => nameUsed(n, p, BILLING_NAMES));
/** Where a script asks whether the visitor is signed in. */
export const accountNamesIn = (source) => namesIn(source, accountUsed);

/** Bump what a node uses into its function's billing, voice and account bags. */
function tally(fn, node, parent) {
  const billing = nameUsed(node, parent, BILLING_NAMES);
  if (billing) bump(fn.billing, billing);
  const voice = nameUsed(node, parent, VOICE_SOURCES, VOICE_LITERALS);
  if (voice) bump(fn.voice, voice);
  const account = accountUsed(node, parent);
  if (account) bump(fn.account, account);
}

/** Marks a method called on `this`, resolved once every function is known. */
const THIS = "this.";

/** The function a node refers to: a name that is not a property, or a method called on `this`. */
function refOf(node, parent) {
  if (node.type !== "Identifier") return "";
  const isProperty = parent?.type === "MemberExpression" && parent.property === node && !parent.computed;
  if (!isProperty) return node.name;
  return parent.object.type === "ThisExpression" ? THIS + node.name : "";
}

/**
 * `this.x()` reaches every function of the file known by the key x: a method or field `x`, and a callback set as
 * `this.x = ...` inside a constructor or an object ("constructor.x"). Which object `this` is cannot be told from
 * the text, so all of them, which can only add paths.
 */
function resolveThis(fns) {
  const byKey = new Map();
  for (const name of Object.keys(fns)) {
    const key = name.slice(name.lastIndexOf(".") + 1);
    byKey.set(key, [...(byKey.get(key) || []), name]);
  }
  for (const fn of Object.values(fns)) {
    for (const ref of [...fn.refs].filter((r) => r.startsWith(THIS))) {
      fn.refs.delete(ref);
      for (const name of byKey.get(ref.slice(THIS.length)) || []) fn.refs.add(name);
    }
  }
}

/**
 * Each named function of a script: the names it refers to (a call, a function handed on as a callback, a method
 * called on `this`, and every named function made inside it, such as a callback it sets on a property), and the
 * billing names, voice sources and sign-in checks it uses. Functions that share a name are merged, and a
 * function reaches everything made inside it, which can only add paths. What it cannot follow is a call through
 * a computed name, a function kept in a variable or another object and called from there, or another file.
 */
export function functionsOf(source) {
  const fns = Object.create(null);
  const entry = (name) => (fns[name] ||= { refs: new Set(), billing: {}, voice: {}, account: {} });
  walk(source, (node, parent, owner, outer) => {
    if (outer) {
      entry(owner);
      fns[outer]?.refs.add(owner);
    }
    if (!fns[owner]) return;
    tally(fns[owner], node, parent);
    const ref = refOf(node, parent);
    if (ref) fns[owner].refs.add(ref);
  });
  resolveThis(fns);
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

/** Inline script types the browser runs as code. Speculation rules are a prefetch, kept as a string so they read as a hint. */
const RUNS = /^(text\/javascript|application\/javascript|module)?$/;

/** The scripts a visitor's browser runs: everything under js/, and the inline scripts of every page. */
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
  for (const page of readdirSync(root).filter((f) => f.endsWith(".html")).sort()) {
    const html = readFileSync(path.join(root, page), "utf8");
    const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc\s*=)([^>]*)>([\s\S]*?)<\/script>/gi)];
    inline.forEach(([, attrs, code], i) => {
      const type = (/\btype\s*=\s*["']?([^"'\s>]*)/i.exec(attrs)?.[1] || "").toLowerCase();
      if (!code.trim()) return;
      if (RUNS.test(type)) out[`${page}#inline-${i + 1}`] = code;
      else if (type === "speculationrules") out[`${page}#inline-${i + 1}`] = JSON.stringify(code);
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

/** Whether an expression uses one of `names`, as an identifier, a property or a bracketed key (`window["adsbygoogle"]`). */
function mentions(node, names) {
  let hit = false;
  walkNode(node, (n) => {
    if (n.type === "Identifier" && names.has(n.name)) hit = true;
    if (n.type === "Literal" && names.has(n.value)) hit = true;
    if (n.type === "TemplateLiteral" && n.quasis.some((q) => names.has(q.value.cooked))) hit = true;
  });
  return hit;
}

function walkNode(node, fn) {
  if (!node || typeof node.type !== "string") return;
  fn(node);
  for (const v of Object.values(node)) {
    if (Array.isArray(v)) v.forEach((c) => walkNode(c, fn));
    else if (v && typeof v.type === "string") walkNode(v, fn);
  }
}

/**
 * A name made from AdSense's queue: a variable (`const q = (window.adsbygoogle = window.adsbygoogle || [])`) or a
 * function that returns it (`function adQueue() { return window.adsbygoogle; }`, called as `adQueue().push`).
 */
function queueAlias(node, queues, owner) {
  if (node.type === "VariableDeclarator" && node.init && mentions(node.init, queues)) return nameOf(node.id);
  if (node.type === "AssignmentExpression" && node.left.type === "Identifier" && mentions(node.right, queues)) return node.left.name;
  if (node.type === "ReturnStatement" && node.argument && owner !== "(top)" && mentions(node.argument, queues)) return owner;
  return "";
}

/**
 * Every push to AdSense's queue, by its name or by a variable or function made from it, as the number of keys in
 * each object pushed ("?" for anything else). `{}` asks for the unit the page drew, and nothing more.
 */
export function adPushes(source) {
  const queues = new Set(["adsbygoogle"]);
  // Until no new name turns up: a helper may be written below the push that uses it, and an alias may be made
  // from another alias, any number deep.
  let known = 0;
  while (queues.size > known) {
    known = queues.size;
    walk(source, (node, _parent, owner) => {
      const alias = queueAlias(node, queues, owner);
      if (alias) queues.add(alias);
    });
  }
  const pushes = [];
  walk(source, (node) => {
    const c = node.type === "CallExpression" ? node.callee : null;
    if (c?.type !== "MemberExpression" || propName(c) !== "push" || !mentions(c.object, queues)) return;
    pushes.push(node.arguments.map((a) => (a.type === "ObjectExpression" ? a.properties.length : "?")).join(","));
  });
  return pushes;
}
