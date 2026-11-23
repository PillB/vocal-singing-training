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
    // The app opens in the browser's language when the visitor has chosen none
    // (js/boot-head.js, window.VTLangPref), and Playwright's own default is
    // en-US, so every spec that means a Spanish-speaking visitor and stores no
    // vt_lang would see English. es-US, not es-PE, because it moves the
    // language and as little else as it can: js/billing.js prices an en-US and
    // an es-US browser alike (region US: USD on Creem; es-PE is Peru, in soles
    // on Mercado Pago), and js/region-gate.js reads neither as European. One
    // thing does move: the reminder clock (js/app.js clockTime) formats in the
    // browser's own locale, 6:00 PM in en-US and 6:00 p.m. in es-US, both the
    // 12-hour clock its specs accept. A spec that means someone else sets its
    // own locale (tests/browser-language.spec.js: en-US, en-GB, es-PE, pt-BR,
    // ...), and a context it makes with browser.newContext() gets this one
    // unless it names another.
    locale: "es-US",
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
      testMatch: /(cross-browser-audio|safari-mobile-recovery|exercise-start-visibility|piano-dropped-call)\.spec\.js/
    },
    {
      name: "webkit",
      use: { browserName: "webkit" },
      testMatch: /(cross-browser-audio|safari-mobile-recovery|exercise-start-visibility|piano-dropped-call)\.spec\.js/
    },
    {
      name: "webkit-layout",
      use: { browserName: "webkit" },
      testMatch: /(site-version|site-version-devices|touch-hover|session-sets|song-library)\.spec\.js/
    },
    {
      name: "mobile-chrome",
      use: {
        browserName: "chromium",
        ...devices["Pixel 7"]
      },
      testMatch: /(cross-browser-audio|safari-mobile-recovery|exercise-start-visibility|piano-dropped-call)\.spec\.js/
    },
    {
      name: "mobile-safari",
      use: {
        browserName: "webkit",
        ...devices["iPhone 14"]
      },
      testMatch: /(cross-browser-audio|safari-mobile-recovery|exercise-start-visibility|piano-dropped-call)\.spec\.js/
    }
  ],
  // The second reporter fails the run on a skipped test nobody reviewed (QA-57): a skip is reported as a success
  reporter: [["list"], ["./qa/no-skips-reporter.cjs"]],
  webServer: {
    // Avoid macOS getfqdn startup delays on a loopback-only test fixture.
    command: process.platform === "darwin"
      ? `python3 -c "import socket, runpy; socket.getfqdn = lambda name='': name; runpy.run_module('http.server', run_name='__main__')" ${testPort} --bind 127.0.0.1`
      : testPort === 8765 ? "npm run serve" : `python3 -m http.server ${testPort}`,
    url: `http://127.0.0.1:${testPort}`,
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  }
};
