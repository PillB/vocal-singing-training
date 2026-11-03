const { devices } = require("@playwright/test");

// Visible browser when HEADED=1 / --headed. Slow pointer when SLOWMO=ms (e.g. 120).
const headed =
  process.env.HEADED === "1" ||
  process.env.HEADED === "true" ||
  process.argv.includes("--headed");
const slowMo = Number(process.env.SLOWMO || (headed ? 80 : 0)) || 0;
const requestedPort = Number(process.env.VT_TEST_PORT);
const testPort = Number.isInteger(requestedPort) && requestedPort >= 1024 && requestedPort <= 65535
  ? requestedPort : 8765;
// Specs and helpers build absolute URLs from BASE_URL or VT_BASE (both fall
// back to :8765), so a custom port must reach them too, not only `baseURL` and
// the server; and a base given under one name is the base under the other
// (else half the specs test the app at :8765). The config is evaluated in the
// runner and in every worker.
const givenBase = process.env.BASE_URL || process.env.VT_BASE || (testPort !== 8765 ? `http://127.0.0.1:${testPort}` : "");
for (const key of ["BASE_URL", "VT_BASE"]) {
  if (!process.env[key] && givenBase) process.env[key] = givenBase;
}

// Headed "watch" sweeps: real windows, slowMo pointer paths, screenshots and
// report files written into qa/ and docs/. They are forensic tools for a human
// (or a nightly job) to watch, not pull-request gates: run together they take
// ~40 minutes and pushed PR #22's shard 4 past its 50-minute budget so 220
// deterministic tests never ran. The `chromium` project is the PR gate; these
// run in the `sweep` project (npm run test:sweep, nightly CI).
const SWEEP_SPECS =
  /(?:click-ui-formats|click-ui-live-log|exercise-live-forensics|exercise-ui-forensics|fullscreen-all-clicks|headed-exercise-forensics|headed-formats-clicks|live-mouse-demo)\.spec\.js$/;

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  // Exported for tests/node/playwright-projects.test.mjs
  metadata: { sweepSpecs: SWEEP_SPECS.source },
  testDir: "./tests",
  timeout: 60000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries, in CI either. A retry re-runs a timeout at full cost (PR #22's
  // shard 1 spent 31.7 min on one 15-minute test, twice) and turns a flaky
  // test green, which hides exactly the races these suites exist to catch.
  // A failure keeps its trace instead, so it can be diagnosed from one run.
  retries: 0,
  use: {
    headless: !headed,
    baseURL: process.env.BASE_URL || `http://127.0.0.1:${testPort}`,
    launchOptions: {
      slowMo,
      // Keep window on top of other apps so pointer path is visible
      args: headed ? ["--start-maximized"] : []
    },
    viewport: headed ? null : { width: 1280, height: 720 },
    trace: process.env.CI ? "retain-on-failure" : "off"
  },
  // Default suite = Chromium (covers Chrome/Edge/Opera).
  // Firefox + WebKit (+ mobile) run focused audio and interruption contracts;
  // the full UI matrix remains Chromium-only for CI resource control.
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
      testIgnore: SWEEP_SPECS
    },
    {
      name: "sweep",
      use: { browserName: "chromium" },
      testMatch: SWEEP_SPECS
    },
    {
      name: "firefox",
      use: { browserName: "firefox" },
      testMatch: /(cross-browser-audio|safari-mobile-recovery|exercise-start-visibility)\.spec\.js/
    },
    {
      name: "webkit",
      use: { browserName: "webkit" },
      testMatch: /(cross-browser-audio|safari-mobile-recovery|exercise-start-visibility)\.spec\.js/
    },
    {
      name: "mobile-chrome",
      use: {
        browserName: "chromium",
        ...devices["Pixel 7"]
      },
      testMatch: /(cross-browser-audio|safari-mobile-recovery|exercise-start-visibility)\.spec\.js/
    },
    {
      name: "mobile-safari",
      use: {
        browserName: "webkit",
        ...devices["iPhone 14"]
      },
      testMatch: /(cross-browser-audio|safari-mobile-recovery|exercise-start-visibility)\.spec\.js/
    }
  ],
  reporter: [["list"]],
  webServer: {
    command: testPort === 8765 ? "npm run serve" : `python3 -m http.server ${testPort}`,
    url: `http://127.0.0.1:${testPort}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
};
