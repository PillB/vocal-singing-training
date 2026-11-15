/**
 * Mutants the card scrub's own suite lets survive, from an independent QA pass,
 * adopted rather than rewritten.
 *
 * Every expected value here is hand-written, which is the whole point: a test
 * that asserts what the function returns cannot tell a consistent wrong answer
 * from a right one. Each case names the mutants it kills and carries a control
 * on the other side, so the file fails if the scrub ever hides everything or
 * nothing.
 *
 * Measured before adopting: of five mutants tried, four (clampText's ordering
 * three ways, and dropping DEL, VT and FF from the strip set) are caught here
 * and by nothing in `reports.test.mjs`. The fifth, counting UTF-16 units in the
 * early-out of `redactLongDigitRuns`, is caught by neither — and that is
 * correct, because that line is a guard rather than a decision. See the comment
 * on it in `src/reports.js`.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { clampText, redactLongDigitRuns } from "../src/reports.js";

const H = "[número oculto]";
// maps ONLY ASCII digits; separators pass through unchanged (a first draft used Number(" ")===0 and turned spaces into zeros: vacuous)
const script = (zero, ascii) => [...ascii].map((d) => (/[0-9]/.test(d) ? String.fromCodePoint(zero + Number(d)) : d)).join("");
const BOLD = 0x1d7ce, DEVA = 0x966, THAI = 0xe50, ARAB = 0x660;
const card = (sep, g = ["4111", "1111", "1111", "1111"]) => g.join(sep);
const r = redactLongDigitRuns;

test("K01 code points not UTF-16 units: kills M01 M01c (and shows what the early-out masks)", () => {
  const twelve = ["411", "111", "111", "111"].map((g) => script(BOLD, g)).join(" "); // 12 digits, 15 code points, 27 UTF-16 units
  assert.equal(r(twelve), twelve, "12 bold digits in groups of 3 are not a card (M01 counts 6,6,6,6)");
  const eight = script(BOLD, "41111111");
  assert.equal(r(eight), eight, "8 bold digits unbroken (M01c: early-out AND groups by .length -> 16)");
  assert.equal(r(script(BOLD, "411 111 111 111 1".replaceAll(" ", ""))), H, "control: 13 bold digits unbroken ARE a card");
  assert.equal(r(["411", "111", "111", "111", "1"].map((g) => script(BOLD, g)).join(" ")), H, "control: 13 bold digits in 3-3-3-3-1 are a card");
  assert.equal(r(twelve.replaceAll(/\p{Nd}/gu, "7")), twelve.replaceAll(/\p{Nd}/gu, "7"), "control: same shape in ASCII is not a card");
});

test("K02 lower boundary 13: kills M03 M20 (and M19 M21 on the other side)", () => {
  assert.equal(r("4111111111111"), H, "13 unbroken");
  assert.equal(r("4111 1111 1111 1"), H, "13 as 4-4-4-1 (M20: window threshold 14)");
  assert.equal(r("411111111111"), "411111111111", "12 unbroken is not a card");
  assert.equal(r("411 111 111 111"), "411 111 111 111", "12 as 3-3-3-3 is not a card (M21: window threshold 12)");
  assert.equal(r("411 111 111 111 1"), H, "control: 13 as 3-3-3-3-1 is");
});

test("K03 upper boundary 19/20 of a window: kills M22 M23", () => {
  assert.equal(r("123456789 1234567890"), H, "9+10 = 19 digits, window of two groups (M22: cap 18)");
  assert.equal(r("1234567890 1234567890"), "1234567890 1234567890", "10+10 = 20 digits: no 13..19 window (M23: cap 20, M35: order)");
  assert.equal(r("12345678 12345678"), H, "control: 8+8 = 16");
});

test("K04 unbroken group of 12 beside 10: kills M19; 20 and more unbroken: kills M18c M27", () => {
  assert.equal(r("123456789012 1234567890"), "123456789012 1234567890", "12 and 10 digits: neither group is 13, no window 13..19 (M19: >=12)");
  assert.equal(r("41111111111111111111"), H, "20 unbroken (M18c M27)");
  assert.equal(r("4111111111111111111111111"), H, "25 unbroken");
  assert.equal(r("12 41111111111111111111 12"), H, "long group among short ones: the unbroken rule alone catches it (M27)");
  assert.equal(r("1234567890123"), H, "control: 13 unbroken");
});

test("K05 per-group minimum of 3: kills M24 M25 M36", () => {
  assert.equal(r("41 1111 1111 1111"), "41 1111 1111 1111", "a 2-digit group at the front of a window (M24: min 2)");
  assert.equal(r("411 111 111 111 1"), H, "3-digit groups count (M25: min 4)");
  assert.equal(r("10.30 11.45 12.00 13.15"), "10.30 11.45 12.00 13.15", "four clock times, 16 digits in pairs (M36: no short-group break)");
  assert.equal(r("12 34 56 78 90 12 34"), "12 34 56 78 90 12 34", "seven pairs");
});

test("K06 the last group may be shorter: kills M26 M26b", () => {
  assert.equal(r("4111 1111 1111 1"), H, "last group of 1 (M26, M26b)");
  assert.equal(r("4111 1111 1111 11"), H, "last group of 2 (M26)");
  assert.equal(r("4111 1 1111 1111"), "4111 1 1111 1111", "control: a short group in the MIDDLE is not allowed (15 digits)");
});

test("K07 whole run goes, window narrowing: kills M28", () => {
  assert.equal(r("123456789 4111 1111 1111 1111"), H);
  assert.equal(r("4111 1111 1111 1111 12 34"), H, "short groups after the card go with it");
  assert.equal(r("12 34 4111 1111 1111 1111"), H, "short groups before the card go with it");
  assert.equal(r("a 12 34 b"), "a 12 34 b", "control: no card, nothing hidden");
});

test("K08 g flag, two cards: kills M30; first window: kills M31", () => {
  assert.equal(r("4111111111111111 y 5500000000000004"), `${H} y ${H}`);
  assert.equal(r("4111 1111 1111 1111"), H, "window at group 0 (M31 starts at 1)");
  assert.equal(r("12 4111 1111 1111 1111"), H, "window at group 1");
});

test("K09 separators one at a time, each alone: kills M07 M08 M09 M10 M10b M10c M11 M12 M13 M14 M15 M16 M17", () => {
  const seps = {
    "hyphen U+002D": "-", "en dash U+2013": "–", "em dash U+2014": "—", "minus U+2212": "−",
    "full-width hyphen U+FF0D": "－", dot: ".", tab: "\t", CR: "\r", LF: "\n",
    "space U+0020": " ", "NBSP U+00A0": " ", "thin space U+2009": " ", "figure space U+2007": " ",
    "narrow NBSP U+202F": " ", "ideographic space U+3000": "　",
    "ZWSP U+200B (Cf)": "​", "ZWNJ U+200C": "‌", "ZWJ U+200D": "‍", "word joiner U+2060": "⁠",
    "BOM U+FEFF": "﻿", "soft hyphen U+00AD": "­"
  };
  for (const [name, sep] of Object.entries(seps)) assert.equal(r(card(sep)), H, name);
  assert.equal(r(card("x")), card("x"), "control: a letter between groups is not a separator");
  assert.equal(r(card("/")), card("/"), "control: a slash is not a separator");
});

test("K10 digits of other scripts and classes: kills M05 M06 M39 M29a M29b", () => {
  for (const [name, z] of [["Devanagari", DEVA], ["Thai", THAI], ["Arabic-Indic", ARAB], ["bold", BOLD], ["full-width", 0xff10]]) {
    const g = script(z, card(" "));
    assert.equal([...g].filter((c) => c === " ").length, 3, `${name}: the spaces survived the mapping (guards the vacuous-test class)`);
    assert.equal(r(g), H, `${name} grouped`);
  }
  const sup = "⁴¹¹¹ ¹¹¹¹ ¹¹¹¹ ¹¹¹¹";
  assert.equal(r(sup), sup, "superscripts (\\p{No}) are not digits (M39)");
  const circled = "①②③④⑤⑥⑦⑧⑨①②③④";
  assert.equal(r(circled), circled, "circled digits are not digits");
});

test("K11 trailing and leading separators stay: kills M37", () => {
  assert.equal(r("tarjeta 4111111111111111 \nfalló"), `tarjeta ${H} \nfalló`);
  assert.equal(r("x \n 4111111111111111"), `x \n ${H}`);
});

test("K12 repeated separators inside a card: kills M34b (split without + and without filter)", () => {
  assert.equal(r("4111  1111   1111\n\n1111"), H);
  assert.equal(r("4111 ​ 1111 - 1111 − 1111"), H, "mixed multi-character separators");
});

test("K13 clampText order: kills M41 (slice first) M43 (redact before strip) M44 M45 and strip-char drops", () => {
  assert.equal(clampText("tarjeta 4111111111111111", 20), "tarjeta [número ocul", "card straddling the cap: redacted whole, then cut inside the marker (M41 leaves 12 digits)");
  assert.equal(clampText("tarjeta 4111111111111111", 20).match(/\d+/g), null, "no digit survives at all");
  for (const [name, c] of [["NUL", "\u0000"], ["BS U+0008", "\u0008"], ["DEL U+007F", "\u007f"], ["SOH", "\u0001"], ["VT", "\u000b"], ["FF", "\u000c"], ["US U+001F", "\u001f"], ["ESC", "\u001b"]]) {
    assert.equal(clampText(card(c), 100), H, `card split by ${name}`);
  }
  assert.equal(clampText("a\u0000b", 10), "a b", "control: stripped to a space, words not glued");
});

test("K14 trim then slice: kills M47 (slice first)", () => {
  assert.equal(clampText("  ab    cd", 4), "ab  ", "trim first, then cut at 4: trailing spaces inside the cap are kept");
});
