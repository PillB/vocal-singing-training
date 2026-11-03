const { devices } = require("@playwright/test");

// Visible browser when HEADED=1 / --headed. Slow pointer when SLOWMO=ms (e.g. 120).
const headed =
  process.env.HEADED === "1" ||
  process.env.HEADED === "true" ||
  process.argv.includes("--headed");
const slowMo = Number(process.env.SLOWMO || (headed ? 80 : 0)) || 0;

// Headed "watch" sweeps: real windows, slowMo pointer paths, screenshots and
// report files written into qa/ and docs/. They are forensic tools for a human
// (or a nightly job) to watch, not pull-request gates: run together they take
// ~40 minutes and pushed PR #22's shard 4 past its 50-minute budget so 220
// deterministic tests never ran. The `chromium` project is the PR gate; these
// run in the `sweep` project (npm run test:sweep, nightly CI).
// Anchored on the directory separator: a gate spec whose name merely ENDS like a sweep's
// (`my-live-mouse-demo.spec.js`) must stay in the gate, not drop out of it unseen (QA FAL-09).
const SWEEP_SPECS =
  /[\\/](?:click-ui-formats|click-ui-live-log|exercise-live-forensics|exercise-ui-forensics|fullscreen-all-clicks|headed-exercise-forensics|headed-formats-clicks|live-mouse-demo)\.spec\.js$/;

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
    baseURL: process.env.BASE_URL || "http://127.0.0.1:8765",
    launchOptions: {
      slowMo,
      // Keep window on top of other apps so pointer path is visible
      args: headed ? ["--start-maximized"] : []
    },
    viewport: headed ? null : { width: 1280, height: 720 },
    trace: process.env.CI ? "retain-on-failure" : "off"
  },
  // Default suite = Chromium (covers Chrome/Edge/Opera).
  // Firefox + WebKit (+ mobile) only run cross-browser-audio for CI speed.
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
      testMatch: /cross-browser-audio\.spec\.js/
    },
    {
      name: "webkit",
      use: { browserName: "webkit" },
      testMatch: /cross-browser-audio\.spec\.js/
    },
    {
      name: "mobile-chrome",
      use: {
        browserName: "chromium",
        ...devices["Pixel 7"]
      },
      testMatch: /cross-browser-audio\.spec\.js/
    },
    {
      name: "mobile-safari",
      use: {
        browserName: "webkit",
        ...devices["iPhone 14"]
      },
      testMatch: /cross-browser-audio\.spec\.js/
    }
  ],
  reporter: [["list"]],
  webServer: {
    command: "npm run serve",
    url: "http://127.0.0.1:8765",
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
};
