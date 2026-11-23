/* Behavior oracle shared by CI mutation runner and independent falsifiability tests.
 * Node 24's default spec reporter uses a ✖ glyph, not TAP 'not ok'. */
export function behaviorDetected(item, result, log) {
  if (result.status !== 1 || result.signal || result.error || log.includes("SyntaxError")) return false;
  if (item.node) return log.includes(item.name) &&
    log.includes("AssertionError [ERR_ASSERTION]") &&
    log.includes("webkit must run BreathFlow learning and two-tab storage tests") &&
    log.includes("tests/node/playwright-projects.test.mjs");
  return log.includes(item.name) && log.includes("Error: expect(") &&
    !log.includes("No tests found");
}
