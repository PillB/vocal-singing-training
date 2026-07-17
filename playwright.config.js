const { devices } = require("@playwright/test");

// Visible browser when HEADED=1 / --headed. Slow pointer when SLOWMO=ms (e.g. 120).
const headed =
  process.env.HEADED === "1" ||
  process.env.HEADED === "true" ||
  process.argv.includes("--headed");
const slowMo = Number(process.env.SLOWMO || (headed ? 80 : 0)) || 0;

/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: "./tests",
  timeout: 60000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  use: {
    headless: !headed,
    baseURL: process.env.BASE_URL || "http://127.0.0.1:8765",
    launchOptions: {
      slowMo,
      // Keep window on top of other apps so pointer path is visible
      args: headed ? ["--start-maximized"] : []
    },
    viewport: headed ? null : { width: 1280, height: 720 }
  },
  // Default suite = Chromium (covers Chrome/Edge/Opera).
  // Firefox + WebKit (+ mobile) only run cross-browser-audio for CI speed.
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" }
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
  reporter: [["list"]]
};
