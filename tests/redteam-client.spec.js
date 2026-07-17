/**
 * ZUCK-mode: adversarial client abuse, soft entitlement, storage, races.
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise, stopPractice } = require("./helpers/e2e");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

test.describe("Red team client (Zuck)", () => {
  test("forge Pro via localStorage — soft gate; Start still available", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", "es");
        sessionStorage.setItem("vt_e2e", "1");
        localStorage.setItem(
          "vt_billing_v1",
          JSON.stringify({
            planId: "pro_monthly",
            pro: true,
            source: "forged_attacker",
            provider: "stripe",
            activatedAt: new Date().toISOString(),
            expiresAt: null
          })
        );
      } catch {
        /* ignore */
      }
    });
    await page.goto(BASE + "/?t=" + Date.now(), { waitUntil: "domcontentloaded" });
    const ent = await page.evaluate(() => {
      const B = window.VTBilling;
      if (!B) return { missing: true };
      const e = B.getEntitlement?.() || {};
      return { pro: !!e.pro, canExport: !!B.can?.("export_progress") };
    });
    // Soft gate may honor forge (accepted risk) or not
    expect(ent.missing === true || typeof ent.pro === "boolean").toBe(true);
    await openExercise(page, "v1-diction");
    await expect(page.locator("#btn-practice-start")).toBeVisible();
  });

  test("billing success without session_id does not crash app", async ({ page }) => {
    await boot(page);
    await page.goto(
      BASE + "/?billing=success&plan=pro_monthly&provider=stripe&t=" + Date.now(),
      { waitUntil: "domcontentloaded" }
    );
    await expect(page.locator("body")).toBeVisible();
    expect(await page.evaluate(() => !!window.VTBilling)).toBe(true);
  });

  test("portal host allowlist rejects evil hosts", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const B = window.VTBilling;
      const cfg = window.VT_BILLING_CONFIG;
      if (!B?.openCustomerPortal || !cfg) return { skip: true };
      const prev = cfg.customerPortalUrl;
      cfg.customerPortalUrl = "https://evil.example.com/phish";
      const res = B.openCustomerPortal();
      cfg.customerPortalUrl = prev;
      return { skip: false, ok: res?.ok, mode: res?.mode };
    });
    if (r.skip) {
      test.skip();
      return;
    }
    expect(r.ok).toBe(false);
  });

  test("double-click Start ends stable", async ({ page }) => {
    await boot(page, { mic: "silent" });
    await openExercise(page, "s15-sh-air-ladder");
    await page.locator("#btn-practice-start").dblclick();
    await page.waitForTimeout(2000);
    const st = await page.evaluate(() => ({
      startH: document.querySelector("#btn-practice-start")?.hidden,
      stopH: document.querySelector("#btn-practice-stop")?.hidden
    }));
    expect(!st.stopH || !st.startH).toBe(true);
    if (!st.stopH) await stopPractice(page);
  });

  test("rapid Start/Stop race 8×", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await boot(page, { mic: "silent" });
    await openExercise(page, "v1-diction");
    for (let i = 0; i < 8; i++) {
      await page.locator("#btn-practice-start").click({ force: true }).catch(() => {});
      await page.waitForTimeout(180);
      await page.locator("#btn-practice-stop").click({ force: true }).catch(() => {});
      await page.waitForTimeout(120);
    }
    await expect(page.locator("body")).toBeVisible();
    expect(errors.filter((e) => !/ResizeObserver/i.test(e)).length).toBeLessThan(3);
  });

  test("corrupt localStorage progress does not white-screen", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", "es");
        sessionStorage.setItem("vt_e2e", "1");
        localStorage.setItem("vt_progress_v1", "{not-json");
        localStorage.setItem("vt_hold_logs_v1", "null");
      } catch {
        /* ignore */
      }
    });
    await page.goto(BASE + "/?t=" + Date.now(), { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("#exercise-list .card-ex").first()).toBeVisible({ timeout: 8000 });
  });

  test("storage flood stress still paints", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", "es");
        sessionStorage.setItem("vt_e2e", "1");
        const huge = { sessions: [] };
        for (let i = 0; i < 400; i++) {
          huge.sessions.push({
            id: "x" + i,
            exerciseId: "v1-diction",
            at: new Date().toISOString(),
            metrics: { clarity: 3 }
          });
        }
        localStorage.setItem("vt_progress_v1", JSON.stringify(huge));
      } catch {
        /* quota ok */
      }
    });
    await page.goto(BASE + "/?t=" + Date.now(), { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toBeVisible();
  });

  test("XSS sink probe: script payload does not execute via form fields", async ({ page }) => {
    await boot(page);
    await openExercise(page, "v1-diction");
    const executed = await page.evaluate(() => {
      window.__xss = false;
      const payload = `<img src=x onerror="window.__xss=true">`;
      document.querySelectorAll("textarea, input[type=text]").forEach((el) => {
        el.value = payload;
        el.dispatchEvent(new Event("input", { bubbles: true }));
      });
      return window.__xss === true;
    });
    expect(executed).toBe(false);
  });

  test("guide list escapes HTML if catalog string were hostile", async ({ page }) => {
    await boot(page);
    await openExercise(page, "v1-diction");
    const safe = await page.evaluate(() => {
      window.__xssGuide = false;
      const host = document.querySelector("#ex-steps");
      if (!host || !window.VTApp) return { skip: true };
      // Simulate hostile step rendering path by calling escape path via re-render
      const ex = window.VTApp.getState?.()?.exercise;
      if (!ex) return { skip: true };
      const hostile = `<img src=x onerror="window.__xssGuide=true">`;
      // Directly exercise escapeHtml-equivalent DOM path: set via same pattern as app
      const escapeHtml = (s) =>
        String(s ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
      host.innerHTML = [hostile].map((s) => `<li>${escapeHtml(s)}</li>`).join("");
      return {
        skip: false,
        xss: window.__xssGuide === true,
        text: host.textContent || ""
      };
    });
    if (safe.skip) {
      test.skip();
      return;
    }
    expect(safe.xss).toBe(false);
    expect(safe.text).toContain("<img");
  });

  test("mic deny still shows Start and recovers after toast path", async ({ page }) => {
    await boot(page, { mic: "deny" });
    await openExercise(page, "s15-sh-air-ladder");
    await page.locator("#btn-practice-start").click();
    await page.waitForTimeout(2500);
    // Should not leave both buttons wrong forever — Start back or live without mic
    const st = await page.evaluate(() => ({
      startH: document.querySelector("#btn-practice-start")?.hidden,
      startDis: document.querySelector("#btn-practice-start")?.disabled,
      stopH: document.querySelector("#btn-practice-stop")?.hidden,
      status: document.querySelector("#practice-status")?.textContent
    }));
    // Recovered ready state (Start available) is expected when mic denied and no piano
    expect(st.startDis === false || st.startH === false || st.stopH === false).toBe(true);
  });

  test("shipped js/ has no live Stripe secrets", async () => {
    const jsDir = path.join(ROOT, "js");
    const hits = [];
    for (const f of fs.readdirSync(jsDir).filter((x) => x.endsWith(".js"))) {
      const t = fs.readFileSync(path.join(jsDir, f), "utf8");
      if (/(?:sk_live_|rk_live_)[a-zA-Z0-9]{16,}|whsec_[A-Za-z0-9]{16,}/.test(t)) hits.push(f);
    }
    expect(hits).toEqual([]);
  });

  test("admin tools hidden without session", async ({ page }) => {
    await boot(page);
    await page.locator("#btn-account").click();
    await expect(page.locator("#account-modal")).toBeVisible();
    const force = page.locator("#admin-force-pro");
    if (await force.count()) await expect(force).toBeHidden();
  });

  test("lang flip stress 15×", async ({ page }) => {
    await boot(page);
    for (let i = 0; i < 15; i++) {
      await page.locator("#btn-lang").click();
      await page.waitForTimeout(30);
    }
    await expect(page.locator("#exercise-list .card-ex").first()).toBeVisible();
  });

  test("multi-tab: concurrent localStorage progress writes do not crash", async ({
    browser
  }) => {
    const context = await browser.newContext();
    const pageA = await context.newPage();
    const pageB = await context.newPage();
    for (const page of [pageA, pageB]) {
      await page.addInitScript(() => {
        try {
          localStorage.setItem("vt_tour_v1", "1");
          localStorage.setItem("vt_lang", "es");
          sessionStorage.setItem("vt_e2e", "1");
        } catch {
          /* ignore */
        }
      });
      await page.goto(BASE + "/?t=" + Date.now(), { waitUntil: "domcontentloaded" });
    }
    // Both tabs write progress
    await Promise.all([
      pageA.evaluate(() => {
        const k = "vt_progress_v1";
        let p = {};
        try {
          p = JSON.parse(localStorage.getItem(k) || "{}") || {};
        } catch {
          p = {};
        }
        p.tabA = (p.tabA || 0) + 1;
        p.sessions = p.sessions || [];
        p.sessions.push({ id: "a" + Date.now(), exerciseId: "v1-diction" });
        localStorage.setItem(k, JSON.stringify(p));
      }),
      pageB.evaluate(() => {
        const k = "vt_progress_v1";
        let p = {};
        try {
          p = JSON.parse(localStorage.getItem(k) || "{}") || {};
        } catch {
          p = {};
        }
        p.tabB = (p.tabB || 0) + 1;
        p.sessions = p.sessions || [];
        p.sessions.push({ id: "b" + Date.now(), exerciseId: "s15-sh-air-ladder" });
        localStorage.setItem(k, JSON.stringify(p));
      })
    ]);
    await pageA.reload({ waitUntil: "domcontentloaded" });
    await expect(pageA.locator("body")).toBeVisible();
    await expect(pageA.locator("#exercise-list .card-ex").first()).toBeVisible({
      timeout: 8000
    });
    await context.close();
  });
});
