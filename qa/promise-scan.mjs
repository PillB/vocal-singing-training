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
 * - billingNamesIn / practicePath / usesByFunction: where the plan is read or the sale opened (by a name, the
 *   header button's id or the plan's storage key), whether Start, Stop, the routines, the rating and the step
 *   buttons can reach any of it, and which function of each file does it.
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
/** What reads the plan or opens the sale: the signed licence (VTLicense) is the only proof of a paid plan billing trusts. */
export const BILLING_NAMES = new Set(["VTBilling", "VTLicense", "openPricing", "openAccount", "isPro", "trialActive", "trialStartedAt", "trialDaysLeft", "getEntitlement"]);
/** An element's id as a selector and as getElementById's argument: "#btn-pricing" and "btn-pricing". */
const byId = (...ids) => ids.flatMap((id) => [id, "#" + id]);
/**
 * The elements bound to a listener that opens the plans (`$("#btn-value-pro").click()` opens them with no name
 * above in sight), by id, and by a class only that element has on the page. tests/node/promise-guards.test.mjs
 * derives these from the code (openerHandles, following a named handler through what it calls) and from the
 * page, and fails when a new one is missing here.
 */
export const BILLING_HANDLES = new Set([
  ...byId("sets-list", "btn-pricing", "btn-value-pro", "value-banner-cta", "btn-account-pricing", "btn-profile-add", "sel-week-goal", "rem-time-2", "btn-export-progress"),
  "[data-ad-cta]"
]);
/**
 * The marks a reader of the plan paints on the page, which read the plan back off it: the header's Pro button's
 * `data-plan` and its classes, the progress board's tag's classes, and the trial note's moment. Derived from the
 * code and checked as the handles are (every class or data attribute a reader of the plan writes is here, or
 * written down as no mark with why).
 */
export const BILLING_MARKS = new Set(["[data-plan]", "data-plan", "btn-pro", "plan-trial", "plan-gift", "plan-paid", "plan-ending", "is-free", "is-pro", "is-trial", "is-gift", "is-ending", "data-moment-id"]);
/** The plan's own keys in storage, which read it with no call into billing: checked against every key the plan's files keep. */
export const BILLING_KEYS = new Set(["vt_billing_v1", "vt_billing_trial_started_v1", "vt_billing_intent", "vt_license_v1", "vt_pro_paid_first_v1"]);
/** The plan's handles that are not names. A dialog of the sale shown by its own id or class is counted too ("#pricing-modal:open"; see dialogShown). */
export const BILLING_LITERALS = new Set([...BILLING_HANDLES, ...BILLING_MARKS, ...BILLING_KEYS]);
/** What asks whether the visitor is signed in: the account and its sync, the older sign-in (VTAuth) that app.js also trusts, and the licence, whose claims name the account. */
export const ACCOUNT_NAMES = new Set(["VTAccount", "VTSync", "VTAuth", "VTLicense", "signedIn", "getSessionToken", "openAccount", "signInWithGoogle", "startEmailSignIn", "renderGoogleButton"]);
/** Every element bound to open the sign-in, by id and by a class only it has (derived and checked as the plan's are). */
export const ACCOUNT_HANDLES = new Set([...byId("btn-account", "account-email-form", "account-code-form", "account-code-resend", "btn-start-trial"), "header-door"]);
/** The marks the header's account door carries when someone is signed in, derived and checked as the plan's marks are. */
export const ACCOUNT_MARKS = new Set(["is-signed-in", "door-avatar", "door-name"]);
/** The sessions, the plan and the sync's own records the account keeps: checked against every key the account's files keep. */
export const ACCOUNT_KEYS = new Set(["vt_account_session_v1", "vt_account_plan_v1", "vt_auth_session_v1", "vt_sync_aside_v1", "vt_sync_handover_v1", "vt_sync_owner_v1", "vt_sync_rev_v1"]);
/** The account's handles that are not names. */
export const ACCOUNT_LITERALS = new Set([...ACCOUNT_HANDLES, ...ACCOUNT_MARKS, ...ACCOUNT_KEYS]);
/** What `VTAccount.getState()` says about the visitor: `.account` is who is signed in, `.entitlement` what they bought. */
const ACCOUNT_STATE = new Set(["account", "entitlement"]);

const nameOf = (node) => {
  if (!node) return "";
  if (node.type === "Identifier") return node.name;
  if (node.type === "Literal") return String(node.value);
  // A class's private member, `#archive`, is a name of its own: `this.#archive()` calls it.
  if (node.type === "PrivateIdentifier") return "#" + node.name;
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

/** A selector written as a string, or as a template by its fixed text (`#tabs [data-tab="${name}"]` gives `#tabs [data-tab="${}"]`). */
function literalSelector(arg) {
  if (arg?.type === "Literal" && typeof arg.value === "string") return arg.value;
  return arg?.type === "TemplateLiteral" ? arg.quasis.map((q) => q.value.cooked ?? q.value.raw).join("${}") : "";
}

/** The selector of the element a listener is added to: `$("#wb-last")?.addEventListener(...)` gives "#wb-last". */
function selectorOf(expr) {
  if (expr?.type === "ChainExpression") return selectorOf(expr.expression);
  if (expr?.type === "MemberExpression") return selectorOf(expr.object);
  if (expr?.type !== "CallExpression") return "";
  return literalSelector(expr.arguments[0]) || selectorOf(expr.callee);
}

/** An argument as text, for naming an element found by a call: a name, a literal, or "…". */
const argText = (a) => (a.type === "Identifier" ? a.name : a.type === "Literal" ? String(a.value) : "…");

/**
 * The element a listener is added to when no selector is in the call: a variable that was given one
 * (`const again = $("#wb-again")` names it "#wb-again"), or else the variable, `this`, the property it is held in,
 * or the call that found it ("again", "document", "ui.close", "els[]", "document.getElementById(id)"). "" for
 * anything else.
 */
function receiverText(expr, held) {
  if (expr.type === "ChainExpression") return receiverText(expr.expression, held);
  if (expr.type === "Identifier") return held.get(expr.name) || expr.name;
  if (expr.type === "ThisExpression") return "this";
  if (expr.type === "CallExpression") {
    const callee = receiverText(expr.callee, held);
    return callee && `${callee}(${expr.arguments.map(argText).join(", ")})`;
  }
  if (expr.type !== "MemberExpression") return "";
  const [object, prop] = [receiverText(expr.object, held), propName(expr)];
  return object && object + (prop ? "." + prop : "[]");
}

/** The variables of a script that hold an element found by one selector, and that selector. A name also used for a parameter is left out: it is another element there. */
function heldSelectors(ast) {
  const seen = new Map();
  const params = new Set();
  walkNode(ast, (n) => {
    if (isFunction(n)) n.params.forEach((p) => params.add(nameOf(p.type === "AssignmentPattern" ? p.left : p)));
    const sel = n.type === "VariableDeclarator" && n.id.type === "Identifier" && n.init ? selectorOf(n.init) : "";
    if (sel) seen.set(n.id.name, new Set([...(seen.get(n.id.name) || []), sel]));
  });
  return new Map([...seen].filter(([name, sels]) => sels.size === 1 && !params.has(name)).map(([name, sels]) => [name, [...sels][0]]));
}

/**
 * " #wb-last" for a callback handed to `addEventListener` on an element found by its selector, " #wb-again" for
 * one on a variable that holds it, " document" or " ui.close" for one on an element held any other way, or "".
 */
function listenerKey(node, parent, held) {
  const c = parent.type === "CallExpression" && parent.arguments.includes(node) ? parent.callee : null;
  if (c?.type !== "MemberExpression" || propName(c) !== "addEventListener") return "";
  const on = selectorOf(c.object) || receiverText(c.object, held);
  return on ? " " + on : "";
}

/**
 * The name a function is known by: its own, the variable it is assigned to, its key, or the element it listens
 * on. A callback set on a property or in an object inside a named function (`btn.onclick = () => ...` in
 * renderNextStepCard) is named after both, "renderNextStepCard.onclick", so a file's many onclicks are not
 * merged into one; a listener after the element it is added to, "bindRetention #wb-last" or "bindRetention
 * document", so each button's handler, and each page-wide one, is a way into practice of its own. A class's
 * methods and fields, private ones too ("#archive"), keep their own names.
 */
function functionName(node, parent, owner, held) {
  if (node.id?.name) return node.id.name;
  if (!parent) return "";
  if (parent.type === "VariableDeclarator") return nameOf(parent.id);
  if (parent.type === "AssignmentExpression" && parent.left.type !== "MemberExpression") return nameOf(parent.left);
  const listener = listenerKey(node, parent, held);
  if (listener) return owner + listener;
  const key = keyOf(parent);
  return key && owner !== "(top)" && !CLASS_MEMBERS.has(parent.type) ? `${owner}.${key}` : key;
}

/** A class field that holds a value, not a function (`send = fetch`): named by its key, as a method would be. */
const fieldName = (node) => (node.type === "PropertyDefinition" && node.value && !isFunction(node.value) ? nameOf(node.key) : "");

const isFunction = (n) => n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression";

/**
 * Each script's tree, its held selectors and its functions, kept by its text: the guards read every shipped
 * script a dozen ways, and each planted defect runs them all again in a process of its own. Nothing here changes
 * a tree or a function table once it is made, so the copies are shared: a caller must not change them either.
 */
const TREES = new Map();
const HELD = new WeakMap();
const FUNCTIONS = new Map();

/** A script, or a module when it imports or exports. */
function parseScript(source) {
  if (!TREES.has(source)) TREES.set(source, parseFresh(source));
  return TREES.get(source);
}

function parseFresh(source) {
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
 * Walk a script, calling `fn(node, parent, owner, outer, up, elementOf)` for every node. `owner` is the nearest
 * named function around it ("(top)" outside any): a sink in an unnamed callback is filed under the function that
 * made it. `outer` is set on the node where a named function opens, to the function it opens in. `up` is the
 * chain of nodes above, nearest last. `elementOf(expr)` is the selector the element `expr` was found by, or "".
 */
function walk(source, fn) {
  const up = [];
  const ast = parseScript(source);
  if (!HELD.has(ast)) HELD.set(ast, heldSelectors(ast));
  const held = HELD.get(ast);
  const local = new Map();
  // The selector an element was found by: in the expression, or a variable given one in this function (or, held
  // by one selector only, anywhere in the file). `const modal = $("#pricing-modal"); modal.hidden = false`.
  const elementOf = (expr, owner) => {
    const e = expr?.type === "ChainExpression" ? expr.expression : expr;
    return selectorOf(e) || (e?.type === "Identifier" ? local.get(owner + " " + e.name) || held.get(e.name) || "" : "");
  };
  const visit = (node, owner) => {
    if (!node || typeof node.type !== "string") return;
    const parent = up.at(-1) || null;
    const here = isFunction(node) ? functionName(node, parent, owner, held) || owner : fieldName(node) || owner;
    if (node.type === "VariableDeclarator" && node.id.type === "Identifier" && selectorOf(node.init)) local.set(here + " " + node.id.name, selectorOf(node.init));
    fn(node, parent, here, here !== owner ? owner : null, up, (expr) => elementOf(expr, here));
    up.push(node);
    for (const v of Object.values(node)) {
      if (Array.isArray(v)) v.forEach((c) => visit(c, here));
      else if (v && typeof v.type === "string") visit(v, here);
    }
    up.pop();
  };
  visit(ast, "(top)");
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

/**
 * The words a string names as a selector: the string itself, each id (`#x`, and `x` as getElementById takes it),
 * each attribute (`[x]` and `x`) and each class (`x`). So `'.value-pulse-cta #btn-value-pro'`,
 * `'#btn-pricing.plan-paid'` and `'[data-plan="free"]'` each name a handle or a mark, as the bare id does.
 */
export function selectorWords(text) {
  const words = [text];
  for (const [, id] of text.matchAll(/#([\w-]+)/g)) words.push("#" + id, id);
  for (const [, attr] of text.matchAll(/\[\s*([\w-]+)/g)) words.push(`[${attr}]`, attr);
  for (const [, cls] of text.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) words.push(cls);
  return words;
}

/** A string's text, a template's fixed part's too; null for anything else. */
const stringText = (node) => (node.type === "Literal" && typeof node.value === "string" ? node.value : node.type === "TemplateElement" ? (node.value.cooked ?? node.value.raw) : null);

/**
 * The name a node uses from `names`: an identifier or property, a bracketed key (`m["getUserMedia"]`), or one of
 * `literals` anywhere, in a string or a template's fixed part, as `wordsOf` reads it (the plan's and the
 * account's words are read as selectors, so a compound selector naming a handle or a mark counts).
 */
function nameUsed(node, parent, names, literals, wordsOf = (t) => [t]) {
  if (node.type === "Identifier") return names.has(node.name) ? node.name : "";
  const text = stringText(node);
  if (text === null) return "";
  const word = literals && wordsOf(text).find((w) => literals.has(w));
  if (word) return word;
  return node.type === "Literal" && parent?.type === "MemberExpression" && parent.computed && parent.property === node && names.has(text) ? text : "";
}

/** `VTAccount.getState().account` (or `.entitlement`): who is signed in, read straight from the account module. */
function accountState(node) {
  if (node.type !== "MemberExpression" || !ACCOUNT_STATE.has(propName(node))) return "";
  const c = node.object.type === "CallExpression" ? node.object.callee : null;
  return c?.type === "MemberExpression" && propName(c) === "getState" && objName(c) === "VTAccount" ? "getState()." + propName(node) : "";
}

/** The data marks a reader of the plan paints, as `dataset` reads them: the header button's plan and the trial note's moment. */
const DATASET_MARKS = new Set(["plan", "momentId"]);
/** `el.dataset.plan` (or `.momentId`): the plan read off the element that carries it. */
const planMark = (node) => (node.type === "MemberExpression" && DATASET_MARKS.has(propName(node)) && node.object.type === "MemberExpression" && propName(node.object) === "dataset" ? "dataset." + propName(node) : "");

/**
 * The dialogs of the sale and the sign-in, by their id and by the class only each has on the page (checked
 * against index.html), with the bag their showing is counted in and the id it is counted as.
 */
export const DIALOGS = new Map([
  ["pricing-modal", ["billing", "pricing-modal"]],
  ["pricing-overlay", ["billing", "pricing-modal"]],
  ["account-modal", ["account", "account-modal"]],
  ["account-overlay", ["account", "account-modal"]]
]);
const isLiteral = (n, v) => n?.type === "Literal" && n.value === v;

/** The element an assignment puts on screen: `el.hidden = x` (x not true), `el.inert = x` the same, `el.open = x` (x not false), `el.style.display = x` (x not "none"). */
function shownBySetting(n) {
  const l = n.left;
  const prop = l.type === "MemberExpression" ? propName(l) : "";
  if (prop === "hidden" || prop === "inert") return isLiteral(n.right, true) ? null : l.object;
  if (prop === "open") return isLiteral(n.right, false) ? null : l.object;
  const style = prop === "display" && l.object.type === "MemberExpression" && propName(l.object) === "style";
  return style && !isLiteral(n.right, "none") ? l.object.object : null;
}

/** The calls that put an element on screen, by method, and whether these arguments do. */
const SHOWN_BY_CALL = new Map([
  ["show", () => true],
  ["showModal", () => true],
  ["removeAttribute", ([a]) => isLiteral(a, "hidden") || isLiteral(a, "inert")],
  ["setAttribute", ([a]) => isLiteral(a, "open")],
  ["toggleAttribute", ([a, b]) => isLiteral(a, "hidden") && !isLiteral(b, true)]
]);

/** The element a call puts on screen: `show()`, `showModal()`, `removeAttribute("hidden")`, `setAttribute("open", ..)`, `toggleAttribute("hidden")` (not forced on), or a class changed on it. */
function shownByCall(n) {
  const c = n.callee.type === "MemberExpression" ? n.callee : null;
  const shows = c && SHOWN_BY_CALL.get(propName(c));
  if (shows) return shows(n.arguments) ? c.object : null;
  return c?.object.type === "MemberExpression" && propName(c.object) === "classList" ? c.object.object : null;
}

/**
 * "#pricing-modal:open" (or "#account-modal:open") where a node puts that dialog on screen by its own id, with no
 * opener's name in sight: `$("#pricing-modal").hidden = false`, or through a variable given it. Hiding it is not
 * opening it, so a node that closes the dialog counts nothing.
 */
function dialogShown(node, elementOf, kind) {
  const el = node.type === "AssignmentExpression" ? shownBySetting(node) : node.type === "CallExpression" ? shownByCall(node) : null;
  // The element is the selector's last part: `#pricing-modal .note` is a note inside the dialog.
  const subject = el ? elementOf(el).trim().split(/\s*[\s>+~]\s*/).at(-1) : "";
  const dialog = subject ? selectorWords(subject).map((w) => DIALOGS.get(w.replace(/^#/, ""))).find((d) => d?.[0] === kind) : null;
  return dialog ? `#${dialog[1]}:open` : "";
}

/** What a node uses that reads the plan or opens the sale. */
const billingUsed = (node, parent, elementOf) => nameUsed(node, parent, BILLING_NAMES, BILLING_LITERALS, selectorWords) || planMark(node) || dialogShown(node, elementOf, "billing");
/** What a node uses that hears the voice or reads a take. */
const voiceUsed = (node, parent) => nameUsed(node, parent, VOICE_SOURCES, VOICE_LITERALS);
/** What a node uses that asks whether the visitor is signed in, or opens the sign-in. */
const accountUsed = (node, parent, elementOf) => nameUsed(node, parent, ACCOUNT_NAMES, ACCOUNT_LITERALS, selectorWords) || accountState(node) || dialogShown(node, elementOf, "account");

/** Each name from `names` the script uses, with a count. */
function namesIn(source, used) {
  const found = {};
  walk(source, (node, parent, _owner, _outer, _up, elementOf) => {
    const name = used(node, parent, elementOf);
    if (name) bump(found, name);
  });
  return found;
}

/** Where a script hears the voice or reads a take. */
export const voiceSourcesIn = (source) => namesIn(source, voiceUsed);
/** Where a script reads the plan or opens the sale. */
export const billingNamesIn = (source) => namesIn(source, billingUsed);
/** Where a script asks whether the visitor is signed in. */
export const accountNamesIn = (source) => namesIn(source, accountUsed);

const BAGS = [
  ["billing", billingUsed],
  ["voice", voiceUsed],
  ["account", accountUsed]
];

/** Bump what a node uses into its function's billing, voice and account bags. */
function tally(fn, node, parent, elementOf) {
  for (const [bag, used] of BAGS) {
    const name = used(node, parent, elementOf);
    if (name) bump(fn[bag], name);
  }
}

/** Marks a method called on `this`, resolved once every function is known. */
const THIS = "this.";

/** The function a node refers to: a name that is not a property, or a method called on `this` (`this.#archive` too). */
function refOf(node, parent) {
  if (node.type === "PrivateIdentifier") return parent?.object?.type === "ThisExpression" ? THIS + "#" + node.name : "";
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
 * The function a method's or property's own key names, when the key is a function's (`getRecordingBlob(id) {...}`
 * in an object, or a class's `#archive(blob) {...}`), or "". The key is walked outside the function, so without
 * this a store's method named for what it reads would be filed under the file's top.
 */
function keyedFunction(node, parent, owner) {
  const keyed = (parent?.type === "Property" || parent?.type === "MethodDefinition") && parent.key === node;
  return keyed && parent.value && isFunction(parent.value) ? functionName(parent.value, parent, owner, new Map()) : "";
}

/** `g(f)`: a function of the file handed another as an argument, which it may call (`proOnly(startDaily)`). */
function handedTo(node) {
  if (node.type !== "CallExpression" || node.callee.type !== "Identifier") return [];
  return node.arguments.filter((a) => a.type === "Identifier").map((a) => [node.callee.name, a.name]);
}

/**
 * Each named function of a script: the names it refers to (a call, a function handed on as a callback, a method
 * called on `this`, and every named function made inside it, such as a callback it sets on a property), the
 * functions handed to it (`proOnly(startDaily)` reaches startDaily), the functions it is made in (`outers`: a
 * name made in two functions, such as two helpers both called finish, is made in both), and the billing names,
 * voice sources and sign-in checks it uses. Functions that share a name are merged, and a function reaches
 * everything made inside it. What it cannot follow is a call through a computed name, a function kept in a
 * variable or another object and called from there, or another file.
 */
export function functionsOf(source) {
  if (!FUNCTIONS.has(source)) FUNCTIONS.set(source, functionsFresh(source));
  return FUNCTIONS.get(source);
}

function functionsFresh(source) {
  const fns = Object.create(null);
  const entry = (name) => (fns[name] ||= { refs: new Set(), billing: {}, voice: {}, account: {}, outers: new Set() });
  const handed = [];
  walk(source, (node, parent, owner, outer, _up, elementOf) => {
    if (outer) {
      entry(owner);
      fns[outer]?.refs.add(owner);
      if (outer !== "(top)") fns[owner].outers.add(outer);
    }
    const keyed = keyedFunction(node, parent, owner);
    if (keyed) return void tally(entry(keyed), node, parent, elementOf);
    handed.push(...handedTo(node));
    if (!fns[owner]) return;
    tally(fns[owner], node, parent, elementOf);
    const ref = refOf(node, parent);
    if (ref) fns[owner].refs.add(ref);
  });
  for (const [g, f] of handed) if (fns[g] && g !== f) fns[g].refs.add(f);
  resolveThis(fns);
  return fns;
}

/** Each named function's own nodes, by the name functionsOf gives it (two of one name are both kept). */
export function functionNodes(source) {
  const out = Object.create(null);
  walk(source, (node, _parent, owner, outer) => {
    if (outer !== null && isFunction(node)) (out[owner] ||= []).push(node);
  });
  return out;
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
    const uses = bagText(fns[name][kind]);
    if (uses) out[name] = { uses, via: trail.join(" > ") };
  }
  return out;
}

/** A bag of names as "VTBilling:2 isPro:1", sorted. */
const bagText = (bag) =>
  Object.entries(bag)
    .filter(([, n]) => n > 0)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, n]) => `${k}:${n}`)
    .join(" ");

/**
 * Every function of a script that uses a name of `kind`, with what it uses, and "(top)" for what the script's own
 * top level uses: { openPricing: "openPricing:1", "bindBilling #value-banner-cta": "openPricing:1", ... }.
 */
export function usesByFunction(source, kind = "billing") {
  const fns = functionsOf(source);
  const top = { ...(kind === "billing" ? billingNamesIn : accountNamesIn)(source) };
  const out = {};
  for (const [name, fn] of Object.entries(fns)) {
    const uses = bagText(fn[kind]);
    if (uses) out[name] = uses;
    for (const [k, n] of Object.entries(fn[kind])) top[k] -= n;
  }
  if (bagText(top)) out["(top)"] = bagText(top);
  return out;
}

/** The element and the callback of a listener: `el.addEventListener("click", cb)` or `el.onclick = cb`; else null. */
function listenerOf(node) {
  const c = node.type === "CallExpression" && node.callee.type === "MemberExpression" ? node.callee : null;
  if (c && propName(c) === "addEventListener" && node.arguments[1]) return [c.object, node.arguments[1]];
  const l = node.type === "AssignmentExpression" && node.left.type === "MemberExpression" ? node.left : null;
  return l && /^on/.test(propName(l)) ? [l.object, node.right] : null;
}

/** Whether a callback's own code opens what `opens` names: it is one of those functions, or its body calls one or names one of `handles`. */
function callbackOpens(cb, opens, handles) {
  if (cb.type === "Identifier") return opens.test(cb.name);
  let hit = false;
  if (isFunction(cb)) walkNode(cb.body, (n) => (hit ||= (n.type === "Identifier" && opens.test(n.name)) || (stringText(n) !== null && selectorWords(stringText(n)).some((w) => handles.has(w)))));
  return hit;
}

/**
 * Whether a function, or anything it calls, uses a name or a dialog's opening that `opens` matches. A listener or
 * a callback made inside a function runs on its own event, not when the function runs, so it is not followed.
 */
function reachesOpener(fns, start, opens) {
  const seen = new Set();
  const queue = fns[start] ? [start] : [];
  while (queue.length) {
    const name = queue.shift();
    if (seen.has(name)) continue;
    seen.add(name);
    if ([...Object.keys(fns[name].billing), ...Object.keys(fns[name].account)].some((u) => opens.test(u))) return true;
    for (const ref of fns[name].refs) if (fns[ref] && !/[ .]/.test(ref)) queue.push(ref);
  }
  return false;
}

/**
 * The selectors of the elements a script binds to a listener that opens what `opens` names (the sale's opener and
 * its dialog shown, or the sign-in's), by its own code or through any function it calls (`exportProgress` opens the
 * plans for a free visitor), or that presses one of `handles`: a click on any of them opens it with no opener's
 * name in sight. The guards hold BILLING_HANDLES and ACCOUNT_HANDLES to these, so a new Pro or sign-in button
 * joins on its own, bound to the opener or to a function of the file that leads to it.
 */
export function openerHandles(source, opens, handles = new Set()) {
  const fns = functionsOf(source);
  const named = new Map();
  const bound = [];
  walk(source, (node, _parent, owner, outer, _up, elementOf) => {
    if (outer !== null && isFunction(node)) named.set(node, owner);
    const [el, cb] = listenerOf(node) || [];
    if (cb) bound.push([elementOf(el), cb]);
  });
  const out = new Set();
  for (const [sel, cb] of bound) {
    const start = cb.type === "Identifier" ? cb.name : named.get(cb);
    if (sel && (callbackOpens(cb, opens, handles) || reachesOpener(fns, start, opens))) out.add(sel);
  }
  return [...out].sort();
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
 * A name made from AdSense's queue: a variable (`const q = (window.adsbygoogle = window.adsbygoogle || [])`), a
 * function that returns it (`function adQueue() { return window.adsbygoogle; }`, called as `adQueue().push`), a
 * name taken out of an object (`const { adsbygoogle: q } = window`, with a default or not), a default parameter
 * (`function f(q = window.adsbygoogle)`), a class field (`queue = window.adsbygoogle`, pushed as `this.queue`), a
 * property it is kept in (`this.queue = ...`, `state.queue = ...`, `{ queue: window.adsbygoogle }`), or the
 * parameter of a function of the file it is handed to (`configure(window.adsbygoogle)` names configure's own).
 */
const QUEUE_HOLDERS = {
  VariableDeclarator: (n, q) => (n.init && mentions(n.init, q) ? nameOf(n.id) : ""),
  AssignmentExpression: (n, q) => (mentions(n.right, q) ? (n.left.type === "MemberExpression" ? propName(n.left) : nameOf(n.left)) : ""),
  Property: (n, q) => (mentions(n.key, q) ? nameOf(n.value.type === "AssignmentPattern" ? n.value.left : n.value) : mentions(n.value, q) ? nameOf(n.key) : ""),
  AssignmentPattern: (n, q) => (mentions(n.right, q) ? nameOf(n.left) : ""),
  PropertyDefinition: (n, q) => (n.value && mentions(n.value, q) ? nameOf(n.key) : ""),
  ReturnStatement: (n, q, owner) => (n.argument && owner !== "(top)" && mentions(n.argument, q) ? owner : ""),
  CallExpression: (n, q, _owner, params) => {
    const callee = n.callee.type === "MemberExpression" ? propName(n.callee) : nameOf(n.callee);
    const i = n.arguments.findIndex((a) => mentions(a, q));
    return i >= 0 ? params.get(callee)?.[i] || "" : "";
  }
};
const queueAlias = (node, queues, owner, params) => QUEUE_HOLDERS[node.type]?.(node, queues, owner, params) || "";

/** Each named function's parameters, by the last part of its name: a function handed the queue pushes through its own. */
function paramsByName(source) {
  const out = new Map();
  walk(source, (node, _parent, owner, outer) => {
    if (outer !== null && isFunction(node)) out.set(owner.slice(owner.lastIndexOf(".") + 1), node.params.map((p) => nameOf(p.type === "AssignmentPattern" ? p.left : p)));
  });
  return out;
}

/**
 * Every push to AdSense's queue, by its name or by a variable or function made from it, as the number of keys in
 * each object pushed ("?" for anything else). `{}` asks for the unit the page drew, and nothing more.
 */
export function adPushes(source) {
  const queues = new Set(["adsbygoogle"]);
  const params = paramsByName(source);
  // Until no new name turns up: a helper may be written below the push that uses it, and an alias may be made
  // from another alias, any number deep.
  let known = 0;
  while (queues.size > known) {
    known = queues.size;
    walk(source, (node, _parent, owner) => {
      const alias = queueAlias(node, queues, owner, params);
      if (alias) queues.add(alias);
    });
  }
  const pushes = [];
  walk(source, (node) => {
    const added = node.type === "CallExpression" ? queuedArgs(node, queues) : seeded(node, queues);
    if (added?.length) pushes.push(added.map((a) => (a?.type === "ObjectExpression" ? a.properties.length : "?")).join(","));
  });
  return pushes;
}

/** The array methods that add to the queue, and the first argument each adds (`splice(i, n, ...added)`). */
const QUEUE_METHODS = new Map([
  ["push", 0],
  ["unshift", 0],
  ["splice", 2],
  ["concat", 0]
]);

/** What a call adds to the queue: `q.push(a)`, `q.unshift(a)`, `q.splice(0, 0, a)`, `q.concat([a])`, `Array.prototype.push.call(q, a)` or `.apply(q, [a])`; null for any other call. */
function queuedArgs(node, queues) {
  const c = node.callee.type === "MemberExpression" ? node.callee : null;
  const method = c && propName(c);
  if (QUEUE_METHODS.has(method) && mentions(c.object, queues)) return spread(node.arguments.slice(QUEUE_METHODS.get(method)));
  const borrowed = (method === "call" || method === "apply") && c.object.type === "MemberExpression" && QUEUE_METHODS.has(propName(c.object));
  if (!borrowed || !node.arguments[0] || !mentions(node.arguments[0], queues)) return null;
  return spread(node.arguments.slice(QUEUE_METHODS.get(propName(c.object)) + 1));
}

/** An array handed whole (`concat([a])`, `apply(q, [a])`) adds its elements. */
const spread = (args) => args.flatMap((a) => (a.type === "ArrayExpression" ? a.elements : [a]));

/** What the queue is seeded with where it is made: `window.adsbygoogle = window.adsbygoogle || [{ ... }]`, or a name made from it the same way. */
function seeded(node, queues) {
  const [target, value] = node.type === "AssignmentExpression" ? [node.left, node.right] : node.type === "VariableDeclarator" ? [node.id, node.init] : [];
  return value && mentions(target, queues) ? arrayMade(value) : null;
}

/** The elements of an array a value is made as: the array itself, or either side of `||`, `??` or `? :`, or what a nested assignment gives. A call's argument is the call's business (queuedArgs). */
function arrayMade(v) {
  if (v.type === "ArrayExpression") return v.elements;
  if (v.type === "LogicalExpression") return [...arrayMade(v.left), ...arrayMade(v.right)];
  if (v.type === "ConditionalExpression") return [...arrayMade(v.consequent), ...arrayMade(v.alternate)];
  return v.type === "AssignmentExpression" ? arrayMade(v.right) : [];
}
