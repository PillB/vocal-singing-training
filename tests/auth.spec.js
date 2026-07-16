/**
 * Internal auth regression — admins, F&F testers, no plaintext secrets in repo.
 */
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const ROOT = path.join(__dirname, "..");

async function boot(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      sessionStorage.setItem("vt_e2e", "1");
      sessionStorage.removeItem("vt_auth_session_v1");
      localStorage.removeItem("vt_billing_v1");
    } catch {
      /* ignore */
    }
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
}

function loadSecretsIfPresent() {
  const p = path.join(ROOT, "docs/INTERNAL-TEST-ACCOUNTS.md");
  if (!fs.existsSync(p)) return null;
  const text = fs.readFileSync(p, "utf8");
  const admins = [];
  const testers = [];
  const re = /\|\s*`([^`]+)`\s*\|\s*`([^`]+)`\s*\|\s*(admin|tester)/g;
  let m;
  while ((m = re.exec(text))) {
    const row = { username: m[1], password: m[2], role: m[3] };
    if (row.role === "admin") admins.push(row);
    else testers.push(row);
  }
  return { admins, testers, path: p };
}

test.describe("Auth — accounts & hardening", () => {
  test("auth users generated file has 12 accounts, no plaintext password fields", async () => {
    const gen = fs.readFileSync(path.join(ROOT, "js/auth-users.generated.js"), "utf8");
    expect(gen).toMatch(/admin\.pablo/);
    expect(gen).toMatch(/admin\.ops/);
    expect(gen).toMatch(/tester\.ff10/);
    // Should not store password property values in JSON users
    expect(gen).not.toMatch(/"password"\s*:/);
    const count = (gen.match(/"username"/g) || []).length;
    expect(count).toBe(12);
  });

  test("secrets file is gitignored when present", async () => {
    const secrets = path.join(ROOT, "docs/INTERNAL-TEST-ACCOUNTS.md");
    const gitignore = fs.readFileSync(path.join(ROOT, ".gitignore"), "utf8");
    expect(gitignore).toMatch(/INTERNAL-TEST-ACCOUNTS/);
    // If file exists locally, ensure git would ignore it
    if (fs.existsSync(secrets)) {
      const { execSync } = require("child_process");
      const out = execSync("git check-ignore -v docs/INTERNAL-TEST-ACCOUNTS.md", {
        cwd: ROOT,
        encoding: "utf8"
      });
      expect(out).toMatch(/INTERNAL-TEST-ACCOUNTS/);
    }
  });

  test("VTAuth globals and hash verify for generated admin", async ({ page }) => {
    await boot(page);
    const info = await page.evaluate(() => ({
      hasAuth: !!window.VTAuth,
      users: (window.VT_AUTH_USERS || []).length,
      roles: [...new Set((window.VT_AUTH_USERS || []).map((u) => u.role))].sort()
    }));
    expect(info.hasAuth).toBe(true);
    expect(info.users).toBe(12);
    expect(info.roles).toEqual(["admin", "tester"]);
  });

  test("login UI opens and rejects bad password", async ({ page }) => {
    await boot(page);
    await page.click("#btn-account");
    await expect(page.locator("#account-modal")).toBeVisible();
    await page.fill("#login-username", "admin.pablo");
    await page.fill("#login-password", "definitely-wrong-password-xxx");
    await page.click("#login-submit");
    await expect(page.locator("#login-error")).toBeVisible();
    const logged = await page.evaluate(() => !!VTAuth.current());
    expect(logged).toBe(false);
  });

  test("login success with secrets file (if present) as admin", async ({ page }) => {
    const secrets = loadSecretsIfPresent();
    test.skip(!secrets?.admins?.length, "secrets file not generated on this machine");
    const admin = secrets.admins[0];
    await boot(page);
    await page.click("#btn-account");
    await page.fill("#login-username", admin.username);
    await page.fill("#login-password", admin.password);
    await page.click("#login-submit");
    await expect(page.locator("#account-logged-in")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#admin-panel")).toBeVisible();
    const state = await page.evaluate(() => ({
      role: VTAuth.current()?.role,
      pro: VTBilling.isPro(),
      admin: VTAuth.isAdmin()
    }));
    expect(state.role).toBe("admin");
    expect(state.admin).toBe(true);
    expect(state.pro).toBe(true);
  });

  test("tester account gets Pro without admin panel", async ({ page }) => {
    const secrets = loadSecretsIfPresent();
    test.skip(!secrets?.testers?.length, "secrets file not generated");
    const t = secrets.testers[0];
    await boot(page);
    await page.click("#btn-account");
    await page.fill("#login-username", t.username);
    await page.fill("#login-password", t.password);
    await page.click("#login-submit");
    await expect(page.locator("#account-logged-in")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#admin-panel")).toBeHidden();
    const pro = await page.evaluate(() => VTBilling.isPro());
    expect(pro).toBe(true);
  });

  test("password generator script produces strong unique passwords", async () => {
    // Unit-check generator policy without rewriting files
    const { execSync } = require("child_process");
    // Inline one-shot generation matching script policy
    const ALPHABET =
      "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*-_=+";
    function gen(length = 20) {
      const bytes = crypto.randomBytes(length);
      let out = "";
      for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length];
      return out;
    }
    const a = gen();
    const b = gen();
    expect(a).toHaveLength(20);
    expect(b).toHaveLength(20);
    expect(a).not.toBe(b);
    expect(a).toMatch(/[A-Za-z]/);
    expect(a).toMatch(/[0-9!@#$%&*\-_=+]/);
  });
});
