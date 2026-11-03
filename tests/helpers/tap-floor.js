"use strict";
/**
 * The smallest size a control may measure and still clear a tap floor.
 *
 * getBoundingClientRect() and Playwright's boundingBox() return float32 geometry after the element's transform. A
 * 44 px box whose top sits on a fraction (a centred dialog) and that is mid-way through the 0.12 s hover lift
 * (`.btn:hover { transform: translateY(-1px) }`, the pointer rests where the last click was) measures 43.99999, so
 * `height < 44` calls it too small. This is measurement noise, not a defect: CSS gives the control 44 px.
 * A real shortfall (a 43 px control, a 43.5 px one) is far larger than the allowance.
 */
const TAP_FLOOR_EPSILON = 0.05;

/**
 * @param {number} floor The floor in CSS px (44 for the site's own rule, 24 for WCAG 2.5.8).
 * @returns {number} The value to compare a measured size against with `<` (too small) or `>=` (clears it).
 */
function tapFloorLimit(floor = 44) {
  return floor - TAP_FLOOR_EPSILON;
}

/**
 * @param {number} size A measured width or height in CSS px.
 * @param {number} [floor] The floor in CSS px.
 * @returns {boolean} Whether the size clears the floor.
 */
function clearsTapFloor(size, floor = 44) {
  return size >= tapFloorLimit(floor);
}

module.exports = { TAP_FLOOR_EPSILON, tapFloorLimit, clearsTapFloor };
