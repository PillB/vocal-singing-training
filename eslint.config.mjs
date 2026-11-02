// Cyclomatic complexity is enforced by qa/check-complexity.mjs. Existing
// >20-complexity functions are explicit, non-growing debt, not silent ignores.
export default [
  {
    linterOptions: { reportUnusedDisableDirectives: "off" },
    files: ["js/**/*.js", "workers/entitlements/src/**/*.js", "qa/**/*.mjs", "tests/**/*.js"],
    ignores: ["js/auth-users.generated.js"],
    languageOptions: { ecmaVersion: "latest" },
    rules: {
      complexity: ["error", { max: 20, variant: "classic" }],
      "no-unreachable": "error",
      "no-unsafe-finally": "error",
      "valid-typeof": "error"
    }
  }
];
