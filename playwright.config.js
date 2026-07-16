/** @type {import('@playwright/test').PlaywrightTestConfig} */
module.exports = {
  testDir: "./tests",
  timeout: 60000,
  // Journey / matrix tests set their own higher timeouts
  use: {
    headless: true,
    baseURL: process.env.BASE_URL || "http://127.0.0.1:8765"
  },
  reporter: [["list"]]
};
