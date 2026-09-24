#!/usr/bin/env node
/**
 * Re-take every screenshot in docs/ADMIN-GUIDE.md.
 *
 *   node qa/admin/capture-guide-shots.mjs
 *
 * Starts the sandbox (qa/admin/sandbox.mjs: the real worker code with made-up
 * people), walks through each procedure in the guide as the admin and as a
 * tester, and writes docs/admin-guide/*.png. Run it again whenever the account
 * panel or the admin page changes, so the guide keeps matching the screen.
 *
 * Needs Playwright's Chromium (`npx playwright install chromium` once). Set
 * PW_CHROMIUM to use a different Chromium binary.
 */

import { mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

import { startSandbox } from "./sandbox.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const OUT = join(ROOT, "docs/admin-guide");
const SITE_PORT = 8785;
const WORKER_PORT = 8795;

const sandbox = await startSandbox({ sitePort: SITE_PORT, workerPort: WORKER_PORT, quiet: true });
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
await mkdir(OUT, { recursive: true });
const shots = [];

/**
 * A browser profile signed in as one of the sandbox people.
 * @param {string|null} who Key in sandbox.people, or null for signed out.
 * @param {{phone?: boolean}} [options] Phone-sized viewport.
 */
async function as(who, options) {
  const phone = !!(options && options.phone);
  const context = await browser.newContext({
    // The phone is taller than a real one so a long card fits in one capture;
    // the width, which is what decides the layout, is an iPhone's.
    viewport: phone ? { width: 390, height: 1400 } : { width: 1180, height: 820 },
    deviceScaleFactor: phone ? 2 : 1,
    isMobile: phone,
    hasTouch: phone,
    locale: "es-PE",
    timezoneId: "America/Lima"
  });
  await context.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
    } catch {
      /* ignore */
    }
  });
  // Google's script is the one thing the sandbox has no copy of.
  await context.route("https://accounts.google.com/**", (route) => route.abort("failed"));
  const page = await context.newPage();
  if (who) {
    await page.goto(`${sandbox.site}/__sandbox/sign-in?as=${who}&next=/__sandbox/`);
    await page.waitForURL(/__sandbox\/$/);
  }
  return { context, page };
}

async function openAdmin(page) {
  await page.goto(`${sandbox.site}/admin.html`);
  await page.waitForFunction(() => document.body.dataset.gate && document.body.dataset.gate !== "checking");
}

async function openStudio(page) {
  await page.goto(`${sandbox.site}/`);
  await page.waitForFunction(() => !!window.VTAccount && !!window.VTBilling);
  await page.evaluate(() => window.VTAccount.refresh());
  await page.waitForTimeout(400);
}

async function openAccountPanel(page) {
  await page.click("#btn-account");
  await page.waitForSelector("#account-modal:not([hidden])");
  await page.waitForTimeout(300);
}

/**
 * Save a screenshot of the page or one element.
 * @param {import('playwright').Page} page Page.
 * @param {string} name File name without extension.
 * @param {string|Object|null} selector Element to capture, a clip rectangle,
 *   or null for the viewport.
 */
async function shot(page, name, selector) {
  const path = join(OUT, `${name}.png`);
  if (selector && typeof selector === "object") {
    await page.screenshot({ path, clip: selector, animations: "disabled" });
  } else if (selector) {
    await page.locator(selector).first().screenshot({ path, animations: "disabled" });
  } else {
    await page.screenshot({ path, animations: "disabled" });
  }
  shots.push(name);
}

async function lookUp(page, email) {
  await page.fill("#lookup-email", email);
  await page.click("#lookup-submit");
  await page.waitForFunction(() => !/Un momento/.test(document.querySelector("#lookup-result")?.textContent || ""));
}

try {
  // 1. The way in: the account panel links admins to the admin page.
  {
    const { context, page } = await as("admin");
    await openStudio(page);
    await openAccountPanel(page);
    await page.locator("#account-admin-page").scrollIntoViewIfNeeded();
    await shot(page, "01-account-panel-admin-link", "#account-modal .modal-card");
    await context.close();
  }

  // 2. The admin page as the admin sees it on arrival.
  const admin = await as("admin");
  {
    const { page } = admin;
    await openAdmin(page);
    await shot(page, "02-admin-page-top", null);
  }

  // 3. Give Pro to Ana, who has never signed in.
  {
    const { page } = admin;
    await page.fill("#give-email", "ana.tester@example.com");
    await page.click('.admin-chips [data-days="30"]');
    await page.fill("#give-note", "Beta ronda 2");
    await shot(page, "03-give-form", "#give");
    await page.click("#give-submit");
    await page.waitForSelector("[data-testid=lookup-status]");
    await page.locator("#give-result").waitFor();
    await shot(page, "04-give-result", "#give");
    await page.locator("#lookup").scrollIntoViewIfNeeded();
    await shot(page, "05-lookup-after-give", "#lookup");
  }

  // 4. Ana signs in and sees Pro.
  {
    const { context, page } = await as("ana");
    await openStudio(page);
    await shot(page, "06-tester-header-pro", ".app-header");
    await openAccountPanel(page);
    await shot(page, "07-tester-account-pro", "#account-modal .modal-card");
    await context.close();
  }

  // 5. Look up Bruno, who is practising on a gifted month.
  {
    const { page } = admin;
    await lookUp(page, "bruno.tester@example.com");
    await shot(page, "08-lookup-bruno", "#lookup");
  }

  // 6. Remove Bruno's Pro. The browser's own confirm box cannot be captured,
  //    so the guide describes it in words.
  const bruno = await as("bruno");
  {
    const { page } = bruno;
    await openStudio(page);
    await shot(page, "09-bruno-before", ".app-header");
  }
  {
    const { page } = admin;
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("[data-testid=grants-table] tbody tr").first().getByRole("button", { name: "Quitar acceso" }).click();
    await page.waitForFunction(() => /se quitó el acceso/.test(document.querySelector("#lookup-result")?.textContent || ""));
    await shot(page, "10-lookup-after-remove", "#lookup");
  }
  {
    const { page, context } = bruno;
    await page.reload();
    await page.waitForFunction(() => !!window.VTBilling);
    await page.evaluate(() => window.VTAccount.refresh());
    await page.waitForTimeout(400);
    await shot(page, "11-bruno-after-reload", ".app-header");
    await openAccountPanel(page);
    await shot(page, "12-bruno-account-after", "#account-modal .modal-card");
    await context.close();
  }

  // 7. Gift codes: make one, a tester redeems it, cancel another.
  let code = "";
  {
    const { page } = admin;
    await page.fill("#code-days", "30");
    await page.fill("#code-uses", "1");
    await page.fill("#code-note", "Para Carla");
    await page.click("#code-submit");
    await page.waitForFunction(() => /^VOCAL-/.test(document.querySelector("#code-new-value")?.textContent || ""));
    code = (await page.locator("#code-new-value").textContent()).trim();
    await shot(page, "13-code-created", "#codes");
  }
  {
    const { context, page } = await as("carla");
    await openStudio(page);
    await openAccountPanel(page);
    await page.fill("#account-redeem-code", code);
    await page.locator("#account-redeem-form").scrollIntoViewIfNeeded();
    await shot(page, "14-tester-redeem", "#account-modal .modal-card");
    await page.click("#account-redeem-submit");
    await page.waitForFunction(() => window.VTBilling.isPro());
    await page.waitForTimeout(300);
    await shot(page, "15-tester-redeemed", "#account-modal .modal-card");
    await context.close();
  }
  {
    const { page } = admin;
    await page.reload();
    await page.waitForFunction(() => document.body.dataset.gate === "admin");
    await page.waitForSelector("[data-testid=codes-table]");
    const groupRow = page.locator(`[data-testid=codes-table] tbody tr:has(code:text-is("${sandbox.seeded.codes.group}"))`);
    page.once("dialog", (dialog) => dialog.accept());
    await groupRow.getByRole("button", { name: "Anular" }).click();
    await page.waitForFunction(() => /anulado/.test(document.querySelector("#code-result")?.textContent || ""));
    await shot(page, "16-codes-list", "#codes");
  }

  // 8. Maintenance.
  {
    const { page } = admin;
    await page.click("#sweep-run");
    await page.waitForFunction(() => !document.querySelector("#sweep-result")?.hidden);
    await shot(page, "17-maintenance", "#maintenance");
  }
  await admin.context.close();

  // 9. What a non-admin sees.
  {
    const { context, page } = await as("ana");
    await openAdmin(page);
    await shot(page, "18-not-admin", { x: 0, y: 0, width: 1180, height: 330 });
    await context.close();
  }

  // 10. Signed out, with Google's button unavailable here.
  {
    const { context, page } = await as(null);
    await openAdmin(page);
    await shot(page, "19-signed-out", "#admin-gate");
    await context.close();
  }

  // 11. The same look-up on a phone.
  {
    const { context, page } = await as("admin", { phone: true });
    await openAdmin(page);
    await lookUp(page, "diego@example.com");
    await page.locator("#lookup").scrollIntoViewIfNeeded();
    await shot(page, "20-phone-lookup", "#lookup");
    await context.close();
  }

  console.log(`Wrote ${shots.length} screenshots to ${OUT}`);
} finally {
  await browser.close();
  await sandbox.close();
}
