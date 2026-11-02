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

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: "./tests",
  timeout: 60000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    headless: !headed,
    baseURL: process.env.BASE_URL || `http://127.0.0.1:${testPort}`,
    launchOptions: {
      slowMo,
      // Keep window on top of other apps so pointer path is visible
      args: headed ? ["--start-maximized"] : []
    },
    viewport: headed ? null : { width: 1280, height: 720 }
  },
  // Default suite = Chromium (covers Chrome/Edge/Opera).
  // Firefox + WebKit (+ mobile) run focused audio and interruption contracts;
  // the full UI matrix remains Chromium-only for CI resource control.
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" }
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
