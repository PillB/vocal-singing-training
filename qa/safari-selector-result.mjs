/** Only the selector's measured tap-size failure counts as this regression. */
export function selectorSizeFailure(report) {
  if ((report.errors || []).length) return false;
  const specs = (suite) => [...(suite.specs || []), ...(suite.suites || []).flatMap(specs)];
  const tests = specs(report).flatMap((spec) => spec.tests || []);
  return tests.length === 2 && tests.every((test) => {
    const results = test.results || [];
    return results.length === 1 && results[0].status === "failed" &&
      (results[0].errors || []).length > 0 && results[0].errors.every((error) =>
        /the design choice is \d+x\d+, under [\d.]+px/.test(error.message || ""));
  });
}
