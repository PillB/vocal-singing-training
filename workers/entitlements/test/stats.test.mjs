/**
 * The statistics behind the experiment results route, checked against values
 * published in the literature rather than against themselves.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  chiSquareP,
  compareMeans,
  compareRates,
  gammaQ,
  lnGamma,
  meanFromSums,
  normCdf,
  homogeneity,
  sampleRatioMismatch,
  sampleSizePerArm,
  twoSidedP,
  wilson
} from "../src/stats.js";

/**
 * Assert two numbers agree to a tolerance.
 * @param {number} actual Actual.
 * @param {number} expected Expected.
 * @param {number} tol Absolute tolerance.
 * @returns {void}
 */
function near(actual, expected, tol) {
  assert.ok(Math.abs(actual - expected) <= tol, `${actual} is not within ${tol} of ${expected}`);
}

test("normal tail matches the textbook critical values", () => {
  near(normCdf(0), 0.5, 1e-7);
  near(normCdf(1.959963984540054), 0.975, 1e-6);
  near(twoSidedP(1.959963984540054), 0.05, 1e-6);
  near(twoSidedP(2.5758293035489), 0.01, 1e-6);
  near(twoSidedP(-1.959963984540054), 0.05, 1e-6);
});

test("Wilson intervals match Newcombe (1998) table I", () => {
  // 81/263 -> 0.2553 to 0.3662; 0/10 -> 0 to 0.2775; 15/148 -> 0.0624 to 0.1605.
  const a = wilson(81, 263);
  near(a.lo, 0.2553, 1e-4);
  near(a.hi, 0.3662, 1e-4);
  const b = wilson(0, 10);
  assert.equal(b.lo, 0);
  near(b.hi, 0.2775, 1e-4);
  const c = wilson(15, 148);
  near(c.lo, 0.0624, 1e-4);
  near(c.hi, 0.1605, 1e-4);
  assert.deepEqual(wilson(0, 0), { rate: null, lo: null, hi: null });
});

test("difference of rates uses Newcombe's hybrid score interval (method 10)", () => {
  // Newcombe (1998) example: 56/70 vs 48/80 -> +0.2000, 95% CI 0.0524 to 0.3339.
  const r = compareRates(48, 80, 56, 70);
  near(r.diff, 0.2, 1e-9);
  near(r.lo, 0.0524, 1e-4);
  near(r.hi, 0.3339, 1e-4);
  assert.ok(r.p < 0.01 && r.p > 0.005);
  // Identical arms: no difference and p = 1.
  const same = compareRates(30, 100, 30, 100);
  near(same.diff, 0, 1e-12);
  near(same.p, 1, 1e-9);
  // Degenerate arms do not divide by zero.
  assert.deepEqual(compareRates(0, 10, 0, 10).p, 1);
  assert.equal(compareRates(0, 0, 1, 1).diff, null);
});

test("means from sums give the sample standard deviation", () => {
  // 1, 2, 3, 4: mean 2.5, sample SD 1.2910.
  const m = meanFromSums(4, 10, 30);
  near(m.mean, 2.5, 1e-12);
  near(m.sd, 1.290994, 1e-6);
  const one = meanFromSums(1, 5, 25);
  assert.equal(one.sd, 0);
  assert.equal(meanFromSums(0, 0, 0).mean, null);
  const c = { n: 100, mean: 6, sd: 6 };
  const t = { n: 100, mean: 7.5, sd: 6 };
  const d = compareMeans(c, t);
  near(d.diff, 1.5, 1e-12);
  near(d.lo, 1.5 - 1.959964 * Math.sqrt(0.72), 1e-5);
  near(d.p, 0.0771, 1e-3);
});

test("gamma and chi-square tails match published tables", () => {
  near(lnGamma(5), Math.log(24), 1e-10);
  near(lnGamma(0.5), Math.log(Math.sqrt(Math.PI)), 1e-10);
  near(gammaQ(1, 2), Math.exp(-2), 1e-10);
  near(chiSquareP(3.841458820694124, 1), 0.05, 1e-7);
  near(chiSquareP(5.991464547107979, 2), 0.05, 1e-7);
  near(chiSquareP(11.070497693516351, 5), 0.05, 1e-7);
  near(chiSquareP(10.827566170662733, 1), 0.001, 1e-7);
  assert.equal(chiSquareP(0, 1), 1);
});

test("sample-ratio mismatch flags a broken split and passes a fair one", () => {
  const fair = sampleRatioMismatch([503, 497], [1, 1]);
  assert.equal(fair.flagged, false);
  assert.ok(fair.p > 0.8);
  // 550/450 is p ~ 0.0016: suspicious but under the 0.001 alarm.
  const edge = sampleRatioMismatch([550, 450], [1, 1]);
  near(edge.chi2, 10, 1e-12);
  assert.equal(edge.flagged, false);
  const broken = sampleRatioMismatch([600, 400], [1, 1]);
  assert.equal(broken.flagged, true);
  // Unequal weights are honoured: 900/100 is exactly a 9:1 design.
  assert.equal(sampleRatioMismatch([900, 100], [9, 1]).flagged, false);
  assert.equal(sampleRatioMismatch([0, 0], [1, 1]).p, null);
});

test("sample size matches the figures quoted in js/experiments-config.js", () => {
  // 30% -> 40% needs ~355 per arm (7.85 rounds to 354 there with 7.84).
  const n = sampleSizePerArm(0.3, 0.4);
  assert.ok(n >= 353 && n <= 356, String(n));
  const big = sampleSizePerArm(0.3, 0.45);
  assert.ok(big >= 158 && big <= 162, String(big));
  assert.equal(sampleSizePerArm(0.3, 0.3), null);
});

test("homogeneity compares arms' rates with a 2 x k chi-square", () => {
  // 10/30 vs 20/30: every expected cell is 15, chi2 = 4 * 25 / 15.
  const two = homogeneity([10, 20], [30, 30]);
  near(two.chi2, 20 / 3, 1e-12);
  assert.equal(two.df, 1);
  near(two.p, 0.009823, 1e-5);
  // The same rate everywhere, or nothing at all, is no evidence of a difference.
  assert.equal(homogeneity([30, 30, 30], [100, 100, 100]).chi2, 0);
  assert.equal(homogeneity([0, 0], [50, 50]).p, 1);
  // An arm with nobody cannot be compared.
  assert.equal(homogeneity([5, 0], [20, 0]).p, null);
  // An arm that never sends the event is overwhelming evidence.
  assert.ok(homogeneity([120, 0], [200, 200]).p < 1e-30);
});
