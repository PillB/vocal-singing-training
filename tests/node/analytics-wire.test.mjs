// "Tu voz se queda en tu dispositivo" holds for the analytics too. js/analytics.js sends events to the worker,
// and a change that put something derived from the voice in an event's props (a pitch contour, a loudness
// envelope, the take itself in base64) would send it, in pieces small enough to pass any size check. The
// worker keeps only the events it knows and flat, short, id-like props; the third red team (docs/48 section 11)
// showed a 1.5 KB contour leaving all the same, because the worker drops it only after it has arrived.
//
// So the browser applies the worker's own rules before anything leaves (wireEvent). These tests hold the two
// to each other: the same event names, and the same props kept from the same input, for hand-picked cases
// and for a few thousand generated ones. Because the rules are the worker's, the filter costs the funnel
// nothing it could read. And they show what it stops: the take, a contour, an unknown event.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { EVENT_NAMES, sanitizeProps } from "../../workers/entitlements/src/events.js";

/** js/analytics.js in a page of its own, sending to a recorded endpoint. `region` stands in for js/region-gate.js. */
export function loadAnalytics(region) {
  const sent = [];
  const store = new Map();
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k)
  };
  const win = {
    VT_ANALYTICS_ENDPOINT: "https://events.test/v1/events",
    navigator: { webdriver: false },
    localStorage: storage,
    sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    addEventListener() {},
    document: { addEventListener() {}, visibilityState: "visible" },
    setTimeout: () => 0,
    clearTimeout() {},
    fetch: (url, init) => {
      sent.push(String(init?.body || ""));
      return Promise.resolve({});
    },
    Date,
    JSON,
    Math,
    Number,
    Object,
    Array,
    Set,
    String,
    VTRegion: region
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(readFileSync("js/analytics.js", "utf8"), win);
  return { A: win.VTAnalytics, sent };
}

/** A small seeded generator, so a failure names a case that can be run again. */
function rng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

const KEYS = ["exerciseId", "mode", "where", "x_loop_home_2026_10", "a", "1bad", "bad key", "k".repeat(32), "k".repeat(33), "_x", "f0", "audio"];
const VALUES = (r) => [
  null,
  true,
  false,
  0,
  -0,
  1 / 3,
  12.34567,
  Number.NaN,
  Infinity,
  -Infinity,
  "s4-lip-trills",
  "",
  "a".repeat(64),
  "a".repeat(65),
  "with space",
  "a@b.c",
  "a/b",
  "UklGRi4A+/=",
  "220.5.221.0.223.4",
  [1, 2],
  { nested: 1 },
  undefined,
  () => 1,
  new Date(Date.UTC(2026, 10, 23, 10)),
  { toJSON: () => "s5-sirens" },
  Math.round(r() * 1e6) / 1e3
];

function randomProps(r) {
  const roll = r();
  if (roll < 0.04) return null;
  if (roll < 0.06) return [1, 2, 3];
  if (roll < 0.08) return "props";
  const out = {};
  const n = Math.floor(r() * 16);
  for (let i = 0; i < n; i++) {
    const key = r() < 0.7 ? KEYS[Math.floor(r() * KEYS.length)] : "k" + i;
    const values = VALUES(r);
    out[key] = values[Math.floor(r() * values.length)];
  }
  return out;
}

test("the browser sends only the events the worker keeps, every one of them", () => {
  const { A } = loadAnalytics();
  const client = new Set([...EVENT_NAMES, "take_shape", "take_saved", "voice_type", ""].filter((n) => A.wireEvent(n, {}) !== null));
  assert.deepEqual([...client].sort(), [...EVENT_NAMES].sort());
});

test("the props that leave are the ones the worker keeps, for every case tried", () => {
  const { A } = loadAnalytics();
  const r = rng(20261123);
  // Hand-picked first: the count limit with every key good, so the thirteenth is the only one to drop.
  const many = Object.fromEntries(Array.from({ length: 16 }, (_, i) => ["k" + i, i]));
  const picked = [many, { ...many, bad: [1] }, { at: new Date(Date.UTC(2026, 10, 23)), n: Number.NaN, own: { toJSON: () => "x" } }];
  for (let i = 0; i < 3000 + picked.length; i++) {
    const props = i < picked.length ? picked[i] : randomProps(r);
    // Through JSON, as the worker sees them: a function or undefined is not sent at all.
    const arrived = props && typeof props === "object" ? JSON.parse(JSON.stringify(props)) : props;
    assert.deepEqual(
      JSON.parse(JSON.stringify(A.wireEvent("practice_start", props).props)),
      sanitizeProps(arrived),
      `case ${i}: ${JSON.stringify(arrived)}`
    );
  }
});

test("what an event can no longer carry: the take, a pitch contour, an unknown event; and what it still does", async () => {
  const { A, sent } = loadAnalytics();
  const take = Buffer.from(new Uint8Array(24000).map((_, i) => (i * 37) % 256)).toString("base64");
  const contour = Array.from({ length: 120 }, (_, i) => (220 + 30 * Math.sin(i / 7)).toFixed(1)).join(".");
  A.track("take_saved", { audio: take });
  A.track("practice_recorded", { exerciseId: "v10-power-pause", audio: take, f0: contour, db: [1, 2, 3] });
  A.track("practice_start", { exerciseId: "s4-lip-trills", mode: "sustain" });
  A.flush();
  const events = sent.flatMap((b) => JSON.parse(b).events);
  // Control: sending works, so the absences below are the filter's doing.
  assert.deepEqual(
    events.map((e) => [e.name, e.props]),
    [
      ["practice_recorded", { exerciseId: "v10-power-pause" }],
      ["practice_start", { exerciseId: "s4-lip-trills", mode: "sustain" }]
    ]
  );
  const wire = sent.join("");
  assert.ok(!wire.includes(take.slice(0, 64)), "no piece of the take leaves");
  assert.ok(!wire.includes(contour.slice(0, 20)), "no piece of the contour leaves");
  // The log on the device keeps what was raised, as it always has: the filter is on the wire only.
  assert.equal(A.summary().recent.find((e) => e.name === "practice_recorded").props.f0, contour);
});

test("control: without the filter the same events would carry the take and the contour out", () => {
  // The worker's rules applied to nothing: what js/analytics.js sent before wireEvent existed.
  const take = "UklGRi4AAABXQVZF".repeat(8);
  const contour = "220.5.221.0.223.4.226.1";
  const raw = { exerciseId: "v10-power-pause", audio: take, f0: contour };
  assert.equal(JSON.stringify(raw).includes(contour), true);
  // And the worker's own rules keep the contour, which is why the event name is the browser's first gate:
  // a short dotted list is an id as far as the value rule can tell.
  assert.equal(sanitizeProps(raw).f0, contour);
  const { A } = loadAnalytics();
  assert.equal(A.wireEvent("take_shape", raw), null);
});

test("events held for a visitor's answer to the consent bar leave filtered too, once the answer is yes", () => {
  // Where the law asks first (js/region-gate.js), events wait in memory and are sent together on a yes: a second
  // way into the queue, which a filter on the first alone would leave open.
  let answer = "eu_pending";
  let onChange = null;
  const region = { blockedReason: () => answer, consent: () => (answer ? null : "granted"), onChange: (fn) => (onChange = fn) };
  const { A, sent } = loadAnalytics(region);
  assert.equal(A.track("practice_recorded", { exerciseId: "v10-power-pause", f0: "220.5.221.0.223.4", audio: "UklGRi4A+/=" }), "held");
  assert.equal(A.track("take_shape", { f0: "220.5" }), "held");
  assert.equal(sent.length, 0, "control: nothing leaves before the answer");
  answer = "";
  onChange();
  const events = sent.flatMap((b) => JSON.parse(b).events);
  assert.deepEqual(
    events.map((e) => [e.name, e.props]),
    [["practice_recorded", { exerciseId: "v10-power-pause", f0: "220.5.221.0.223.4" }]],
    "control: the yes sends what was held; the unknown event stays behind, and the take's base64 is not an id"
  );
});
