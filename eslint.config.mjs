// Keep this focused on one enforceable, parser-backed engineering invariant.
// qa/lint-complexity.mjs compares exceptional legacy functions by source hash:
// all new/changed functions must meet the ceiling, without hiding old debt.
export default [
  {
    files: ["**/*.{js,mjs}"],
    ignores: ["node_modules/**", "tests/fixtures/**", "qa/design-test/site-review/**"],
    languageOptions: { ecmaVersion: "latest" },
    rules: {
      complexity: ["error", { max: 15, variant: "modified" }]
    }
  }
];
