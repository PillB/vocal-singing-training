/**
 * The handful of statistics an A/B result needs, with no dependencies.
 *
 * Everything here is a pure function of counts, so it is tested on its own
 * (test/stats.test.mjs) against values published in the literature, and the
 * results route only has to get the counts right.
 *
 * Choices worth knowing:
 * - Rates carry a Wilson score interval, not the textbook Wald one. At the
 *   sample sizes a beta produces (tens to a few hundred per arm) Wald's
 *   interval undercovers badly and can run below 0 or above 1.
 * - The difference between two rates uses Newcombe's hybrid score interval
 *   (method 10 in Newcombe 1998), built from the two Wilson intervals, for the
 *   same reason.
 * - Means use a normal approximation. Below 30 people an arm the result says
 *   so rather than pretending to a precision it does not have.
 * - Sample-ratio mismatch is a chi-square goodness-of-fit test against the
 *   configured weights. A mismatch means assignment or exposure logging is
 *   broken, and no metric from that experiment should be read until it is
 *   fixed (Fabijan et al. 2019, "Diagnosing Sample Ratio Mismatch").
 */

"use strict";

/** Two-sided 95% critical value of the standard normal. */
export const Z95 = 1.959963984540054;

/**
 * Complementary error function, Numerical Recipes' Chebyshev fit
 * (fractional error below 1.2e-7 everywhere). Plenty for p-values.
 * @param {number} x Argument.
 * @returns {number} erfc(x).
 */
export function erfc(x) {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.5 * z);
  const r =
    t *
    Math.exp(
      -z * z -
        1.26551223 +
        t *
          (1.00002368 +
            t *
              (0.37409196 +
                t *
                  (0.09678418 +
                    t * (-0.18628806 + t * (0.27886807 + t * (-1.13520398 + t * (1.48851587 + t * (-0.82215223 + t * 0.17087277))))))))
    );
  return x >= 0 ? r : 2 - r;
}

/**
 * Standard normal cumulative distribution.
 * @param {number} z Argument.
 * @returns {number} P(Z <= z).
 */
export function normCdf(z) {
  return 0.5 * erfc(-z / Math.SQRT2);
}

/**
 * Two-sided p-value for a z statistic.
 * @param {number} z Statistic.
 * @returns {number} p.
 */
export function twoSidedP(z) {
  if (!Number.isFinite(z)) {
    return z === 0 ? 1 : 0;
  }
  return Math.min(1, erfc(Math.abs(z) / Math.SQRT2));
}

/**
 * Wilson score interval for k successes out of n.
 * @param {number} k Successes.
 * @param {number} n Trials.
 * @param {number} [z] Critical value.
 * @returns {{rate: number|null, lo: number|null, hi: number|null}} Interval.
 */
export function wilson(k, n, z) {
  const zz = z || Z95;
  if (!(n > 0)) {
    return { rate: null, lo: null, hi: null };
  }
  const p = k / n;
  const z2 = zz * zz;
  const denom = 1 + z2 / n;
  const centre = (p + z2 / (2 * n)) / denom;
  const half = (zz * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { rate: p, lo: Math.max(0, centre - half), hi: Math.min(1, centre + half) };
}

/**
 * Difference of two rates (treatment minus control) with Newcombe's hybrid
 * score interval and a pooled two-proportion z-test.
 * @param {number} kc Control successes.
 * @param {number} nc Control trials.
 * @param {number} kt Treatment successes.
 * @param {number} nt Treatment trials.
 * @returns {{diff: number|null, lo: number|null, hi: number|null, z: number|null, p: number|null}} Comparison.
 */
export function compareRates(kc, nc, kt, nt) {
  if (!(nc > 0) || !(nt > 0)) {
    return { diff: null, lo: null, hi: null, z: null, p: null };
  }
  const c = wilson(kc, nc);
  const t = wilson(kt, nt);
  const diff = t.rate - c.rate;
  const lo = diff - Math.sqrt((t.rate - t.lo) ** 2 + (c.hi - c.rate) ** 2);
  const hi = diff + Math.sqrt((t.hi - t.rate) ** 2 + (c.rate - c.lo) ** 2);
  const pooled = (kc + kt) / (nc + nt);
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / nc + 1 / nt));
  if (!(se > 0)) {
    // Both arms all-0 or all-1: no evidence of a difference either way.
    return { diff, lo, hi, z: 0, p: 1 };
  }
  const z = diff / se;
  return { diff, lo, hi, z, p: twoSidedP(z) };
}

/**
 * Mean and sample standard deviation from a count, a sum and a sum of squares
 * (what one GROUP BY can return without shipping every row).
 * @param {number} n Count.
 * @param {number} sum Sum of values.
 * @param {number} sumSq Sum of squared values.
 * @returns {{n: number, mean: number|null, sd: number|null, lo: number|null, hi: number|null}} Summary.
 */
export function meanFromSums(n, sum, sumSq) {
  if (!(n > 0)) {
    return { n: 0, mean: null, sd: null, lo: null, hi: null };
  }
  const mean = sum / n;
  const variance = n > 1 ? Math.max(0, (sumSq - n * mean * mean) / (n - 1)) : 0;
  const sd = Math.sqrt(variance);
  const half = (Z95 * sd) / Math.sqrt(n);
  return { n, mean, sd, lo: mean - half, hi: mean + half };
}

/**
 * Difference of two means (treatment minus control), Welch standard error,
 * normal approximation.
 * @param {{n: number, mean: number, sd: number}} c Control summary.
 * @param {{n: number, mean: number, sd: number}} t Treatment summary.
 * @returns {{diff: number|null, lo: number|null, hi: number|null, z: number|null, p: number|null}} Comparison.
 */
export function compareMeans(c, t) {
  if (!c || !t || !(c.n > 0) || !(t.n > 0) || c.mean === null || t.mean === null) {
    return { diff: null, lo: null, hi: null, z: null, p: null };
  }
  const diff = t.mean - c.mean;
  const se = Math.sqrt((c.sd * c.sd) / c.n + (t.sd * t.sd) / t.n);
  if (!(se > 0)) {
    return { diff, lo: diff, hi: diff, z: diff === 0 ? 0 : null, p: diff === 0 ? 1 : null };
  }
  const z = diff / se;
  return { diff, lo: diff - Z95 * se, hi: diff + Z95 * se, z, p: twoSidedP(z) };
}

/**
 * Natural log of the gamma function (Lanczos, g=7, n=9).
 * @param {number} x Positive argument.
 * @returns {number} ln Γ(x).
 */
export function lnGamma(x) {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059,
    12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - lnGamma(1 - x);
  }
  const xx = x - 1;
  let a = c[0];
  const t = xx + g + 0.5;
  for (let i = 1; i < g + 2; i += 1) {
    a += c[i] / (xx + i);
  }
  return 0.5 * Math.log(2 * Math.PI) + (xx + 0.5) * Math.log(t) - t + Math.log(a);
}

/**
 * Regularized upper incomplete gamma Q(a, x), by series below a+1 and by
 * Lentz's continued fraction above (Numerical Recipes 6.2).
 * @param {number} a Shape, > 0.
 * @param {number} x Argument, >= 0.
 * @returns {number} Q(a, x).
 */
export function gammaQ(a, x) {
  if (!(x > 0)) {
    return 1;
  }
  const gln = lnGamma(a);
  if (x < a + 1) {
    let ap = a;
    let sum = 1 / a;
    let del = sum;
    for (let n = 0; n < 500; n += 1) {
      ap += 1;
      del *= x / ap;
      sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) {
        break;
      }
    }
    return Math.max(0, 1 - sum * Math.exp(-x + a * Math.log(x) - gln));
  }
  const tiny = 1e-300;
  let b = x + 1 - a;
  let c = 1 / tiny;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i < 500; i += 1) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;
    if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < 1e-15) {
      break;
    }
  }
  return Math.min(1, Math.exp(-x + a * Math.log(x) - gln) * h);
}

/**
 * Upper tail of the chi-square distribution.
 * @param {number} x Statistic.
 * @param {number} df Degrees of freedom.
 * @returns {number} P(X >= x).
 */
export function chiSquareP(x, df) {
  if (!(df > 0)) {
    return 1;
  }
  return gammaQ(df / 2, x / 2);
}

/**
 * Sample-ratio mismatch: does the split of exposed people match the weights?
 * @param {number[]} counts Exposed people per arm.
 * @param {number[]} weights Configured weights per arm, same order.
 * @param {number} [alpha] Flag threshold; 0.001 is the usual choice because
 *   the test is run on every look and a false alarm only costs a check.
 * @returns {{chi2: number|null, df: number, p: number|null, expected: number[], flagged: boolean}} Result.
 */
export function sampleRatioMismatch(counts, weights, alpha) {
  const threshold = alpha || 0.001;
  const total = counts.reduce((n, c) => n + c, 0);
  const wsum = weights.reduce((n, w) => n + w, 0);
  const df = counts.length - 1;
  if (!(total > 0) || !(wsum > 0) || df < 1) {
    return { chi2: null, df: Math.max(0, df), p: null, expected: counts.map(() => 0), flagged: false };
  }
  const expected = weights.map((w) => (total * w) / wsum);
  let chi2 = 0;
  for (let i = 0; i < counts.length; i += 1) {
    if (expected[i] > 0) {
      chi2 += (counts[i] - expected[i]) ** 2 / expected[i];
    }
  }
  const p = chiSquareP(chi2, df);
  return { chi2, df, p, expected, flagged: p < threshold };
}

/**
 * People per arm needed to detect a change in a rate, two-sided alpha 0.05,
 * 80% power: n = 7.85 * (p1(1-p1) + p2(1-p2)) / (p1-p2)^2.
 * @param {number} p1 Baseline rate.
 * @param {number} p2 Rate to detect.
 * @returns {number|null} People per arm, rounded up.
 */
export function sampleSizePerArm(p1, p2) {
  if (!(p1 >= 0 && p1 <= 1 && p2 >= 0 && p2 <= 1) || p1 === p2) {
    return null;
  }
  return Math.ceil((7.85 * (p1 * (1 - p1) + p2 * (1 - p2))) / (p1 - p2) ** 2);
}
