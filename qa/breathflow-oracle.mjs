/* Behavior oracle shared by CI mutation runner and independent falsifiability tests.
 * Node 24's default spec reporter uses a ✖ glyph, not TAP 'not ok'. */
export function behaviorDetected(item, result, log) {
  if (result.status !== 1 || result.signal || result.error || log.includes("SyntaxError")) return false;
  if (item.node) return log.includes(item.name) &&
    log.includes("AssertionError [ERR_ASSERTION]") &&
    log.includes("webkit must run BreathFlow learning and two-tab storage tests") &&
    log.includes("tests/node/playwright-projects.test.mjs");
  // Playwright prints "Error: expect(locator)..." for matcher failures.
  // A custom assertion message (such as the BF-M13 layout dimensions)
  // instead prints "Error: {...}" then the "expect(received)" matcher.
  // Admit only this named, observable overflow regression, not any
  // arbitrary failed process or an unrelated assertion.
  const namedMatcher = log.includes("Error: expect(");
  const layoutAssertion = item.id === "BF-M13 phrase comparison ignores narrow viewports" &&
    log.includes("expect(received).toBe(expected)") &&
    log.includes('"overflow":true') &&
    log.includes("Error: {");
  return log.includes(item.name) && (namedMatcher || layoutAssertion) &&
    !log.includes("No tests found");
}

/** Keep assertion diagnostics instead of a tail filled with successful asset requests. */
export function diagnosticTail(log) {
  return String(log).split("\n").filter((line) =>
    !/^\[WebServer\].*"(?:GET|HEAD) [^"]+ HTTP\/1\.[01]" (?:200|304) /.test(line)
  ).slice(-100).join("\n");
}
