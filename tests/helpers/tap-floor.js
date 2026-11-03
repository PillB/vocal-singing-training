"use strict";
/**
 * The smallest a control may measure and still be counted as clearing a tap floor.
 *
 * `getBoundingClientRect()` returns float32 geometry *after* the element's
 * transform, and the site lifts a button on hover (`.btn:hover { transform:
 * translateY(-1px) }`, over 0.12 s, with the pointer resting wherever the last
 * click left it). Measured in this Chromium on 3 November 2026: a box CSS makes
 * exactly 44 px, stepped through 41 fractional positions of that lift, measures
 * 43.99999237060547 at 14 of them and 44.00000762939453 at others. So a strict
 * `height < 44` calls a compliant control too small about a third of the time,
 * depending on where the pointer happens to be.
 *
 * The allowance below is 0.05 px: about 6,500 times the error that was measured,
 * and ten times smaller than the smallest shortfall worth catching. A control
 * that really is 43.5 px, or 43 px, is nowhere near passing — `tests/tap-floor.spec.js`
 * asserts both halves of that, so the allowance cannot quietly widen into one
 * that hides a defect.
 *
 * Found by QA round 10 as QA-66, after a tap-floor case went red on geometry
 * that was never wrong. VG-59.
 */
const TAP_FLOOR_EPSILON = 0.05;

/**
 * The value to compare a measured size against with `<` (too small) or `>=` (clears it).
 * @param {number} floor The floor in CSS px (44 for the site's own rule, 24 for WCAG 2.5.8).
 * @returns {number} The comparison limit.
 */
function tapFloorLimit(floor = 44) {
  return floor - TAP_FLOOR_EPSILON;
}

/**
 * Whether a measured size clears a floor.
 * @param {number} size A measured width or height in CSS px.
 * @param {number} [floor] The floor in CSS px.
 * @returns {boolean} True when it clears it.
 */
function clearsTapFloor(size, floor = 44) {
  return size >= tapFloorLimit(floor);
}

module.exports = { TAP_FLOOR_EPSILON, tapFloorLimit, clearsTapFloor };
