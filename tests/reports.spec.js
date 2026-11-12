/**
 * Telling us something is broken: the dialog, the draft, the fallback, and the
 * QA page that sends testers to it.
 *
 * The 2026-10-28 audit found no way at all for a visitor to report a bug: the
 * only channel was a GitHub issue. These tests drive the real client code with
 * the worker's route stubbed, so nothing leaves the machine, and they pin the
 * two behaviours that matter more than the happy path:
 *
 * - a report is never lost — the fallback panel holds what was typed when our
 *   route refuses, and a draft survives closing the dialog;
 * - nothing is attached that privacy.html does not say is attached.
 */
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

/**
 * Open a page with the tour out of the way, and the worker's routes stubbed.
 *
 * `reports` decides what POST /v1/reports answers: "ok" stores it, "off"
 * refuses the way a worker with reports switched off does, "dead" never
 * answers at all (an aborted request, which is what no network looks like).
 *
 * @param {import('@playwright/test').Page} page Page.
 * @param {{url?: string, lang?: string, reports?: string, configured?: boolean, health?: Object}} [options]
 *   Options; `health` replaces the /v1/health body.
 * @returns {Promise<{posted: Object[]}>} The bodies the page posted.
 */
async function boot(page, options) {
  const opts = options || {};
  const posted = [];
  await page.addInitScript((lang) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", lang || "es");
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
  }, opts.lang || "es");
  // Registered first on purpose: Playwright tries the most recently added
  // route first, so this catch-all must go in before the specific ones or it
  // swallows them. Nothing else should reach the worker's host from here.
  await page.route("**/v1/**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false }) })
  );
  // The account layer asks the worker what this deploy offers on every load.
  await page.route("**/v1/auth/methods", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, email: false, google: true, googleClientId: "x", trialDays: 7 })
    })
  );
  await page.route("**/v1/health", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(opts.health || {
        ok: true,
        accountsConfigured: true,
        eventsEnabled: false,
        reportsEnabled: true,
        authMethods: { email: false, google: true, googleClientId: "x", trialDays: 7 },
        siteOrigin: BASE
      })
    })
  );
  await page.route("**/v1/reports", async (route) => {
    try {
      posted.push(JSON.parse(route.request().postData() || "{}"));
    } catch {
      posted.push({ unparsable: true });
    }
    const mode = opts.reports || "ok";
    if (mode === "dead") {
      await route.abort("failed");
      return;
    }
    if (mode === "off") {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, reason: "reports_disabled" })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        ok: true,
        reference: "VS-7F3KQ2MXNP",
        report: { reference: "VS-7F3KQ2MXNP", status: "new", summary: "x", kind: "bug" }
      })
    });
  });
  await page.goto(BASE + (opts.url || "/index.html"), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTReports);
  if (opts.configured === false) {
    await page.evaluate(() => {
      window.VT_BILLING_CONFIG.verification.apiBaseUrl = "";
      // account.js read the base at parse time for its own state, so stand in
      // for the one answer reports.js asks it for.
      window.VTAccount = { ...(window.VTAccount || {}), isConfigured: () => false, getState: () => ({ configured: false, signedIn: false }) };
    });
  }
  return { posted };
}

/** Fill the dialog in. */
async function fill(page, values) {
  if (values.summary !== undefined) await page.fill("#vt-report-summary", values.summary);
  if (values.detail !== undefined) await page.fill("#vt-report-detail", values.detail);
  if (values.steps !== undefined) await page.fill("#vt-report-steps", values.steps);
  if (values.contact !== undefined) await page.fill("#vt-report-contact", values.contact);
}

test.describe("reporting a problem", () => {
  test("the footer opens the dialog, and Escape closes it", async ({ page }) => {
    await boot(page);
    const entry = page.locator('.app-footer [data-vt-report]');
    await expect(entry).toHaveCount(1);
    await expect(entry).toHaveText(/Reportar un problema/);
    await entry.click();
    await expect(page.locator("#vt-report-overlay")).toBeVisible();
    await expect(page.locator("#vt-report-title")).toHaveText(/Cuéntanos qué pasó/);
    await page.keyboard.press("Escape");
    await expect(page.locator("#vt-report-overlay")).toBeHidden();
  });

  test("the footer entry is a 44px target, like every other control", async ({ page }) => {
    await boot(page);
    const box = await page.locator(".app-footer [data-vt-report]").boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    // And it is reachable and operable from the keyboard alone.
    await page.locator(".app-footer [data-vt-report]").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#vt-report-overlay")).toBeVisible();
  });

  test("a report reaches the worker with everything triage needs and nothing else", async ({ page }) => {
    const { posted } = await boot(page);
    await page.locator(".app-footer [data-vt-report]").click();
    await fill(page, {
      summary: "el botón Empezar no hace nada",
      detail: "toco Empezar y la pantalla se queda igual",
      steps: "1. abrir el estudio\n2. tocar Empezar",
      contact: "Ana@Example.test"
    });
    await page.locator("#vt-report-form button[type=submit]").click();
    await expect(page.locator("#vt-report-title")).toHaveText(/Gracias/);
    await expect(page.locator(".vt-report-ref")).toHaveText("VS-7F3KQ2MXNP");

    expect(posted).toHaveLength(1);
    const body = posted[0];
    expect(body.kind).toBe("bug");
    expect(body.summary).toBe("el botón Empezar no hace nada");
    expect(body.steps).toContain("tocar Empezar");
    expect(body.contact).toBe("Ana@Example.test");
    expect(body.severity).toBe("annoying");
    expect(body.area).toBe("practice");
    expect(body.locale).toBe("es");
    expect(body.page).toContain("/index.html");
    expect(body.build).toBeTruthy();
    // Exactly the environment keys privacy.html lists, and no others.
    expect(Object.keys(body.environment).sort()).toEqual(
      ["dpr", "lang", "net", "platform", "screen", "signedIn", "tz", "ua", "viewport"].sort()
    );
    // Nothing from the practice side of the app can ride along.
    const text = JSON.stringify(body);
    expect(text).not.toMatch(/vt_account_session|localStorage|recording|progress":/i);
  });

  test("an idea asks for less: no severity and no steps", async ({ page }) => {
    const { posted } = await boot(page);
    await page.locator(".app-footer [data-vt-report]").click();
    await expect(page.locator("#vt-report-steps")).toBeVisible();
    await page.locator('input[name="vt-report-kind"][value="idea"]').check();
    // Hidden, not removed: the radio the keyboard is on has to survive the
    // switch, or arrow keys through the group throw focus out of it.
    await expect(page.locator("#vt-report-steps")).toBeHidden();
    await expect(page.locator('input[name="vt-report-severity"]').first()).toBeHidden();
    await expect(page.locator('input[name="vt-report-kind"][value="idea"]')).toBeChecked();
    await fill(page, { summary: "quiero repetir solo el último ejercicio" });
    await page.locator("#vt-report-form button[type=submit]").click();
    await expect(page.locator("#vt-report-title")).toHaveText(/Gracias/);
    expect(posted[0].kind).toBe("idea");
    expect(posted[0].severity).toBeUndefined();
    expect(posted[0].steps).toBe("");
  });

  test("the kind radios work from the keyboard", async ({ page }) => {
    await boot(page);
    await page.locator(".app-footer [data-vt-report]").click();
    await page.locator('input[name="vt-report-kind"][value="bug"]').focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.locator('input[name="vt-report-kind"][value="idea"]')).toBeChecked();
    // Focus stays in the group, so the choice can be changed back.
    await expect(page.locator('input[name="vt-report-kind"][value="idea"]')).toBeFocused();
    await page.keyboard.press("ArrowLeft");
    await expect(page.locator('input[name="vt-report-kind"][value="bug"]')).toBeChecked();
    await expect(page.locator("#vt-report-steps")).toBeVisible();
  });

  test("nothing typed is nothing sent, and the dialog says why", async ({ page }) => {
    const { posted } = await boot(page);
    await page.locator(".app-footer [data-vt-report]").click();
    await page.locator("#vt-report-form button[type=submit]").click();
    await expect(page.locator("#vt-report-form .vt-report-msg")).toHaveText(/al menos una línea/);
    expect(posted).toHaveLength(0);
    await expect(page.locator("#vt-report-overlay")).toBeVisible();
  });

  test("closing the dialog keeps the draft, so nothing has to be typed twice", async ({ page }) => {
    await boot(page);
    await page.locator(".app-footer [data-vt-report]").click();
    await fill(page, { summary: "a medio escribir", detail: "con más detalle" });
    await page.keyboard.press("Escape");
    await expect(page.locator("#vt-report-overlay")).toBeHidden();
    await page.locator(".app-footer [data-vt-report]").click();
    await expect(page.locator("#vt-report-summary")).toHaveValue("a medio escribir");
    await expect(page.locator("#vt-report-detail")).toHaveValue("con más detalle");
    // And it survives a reload, because it is the same browser session.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator(".app-footer [data-vt-report]").click();
    await expect(page.locator("#vt-report-summary")).toHaveValue("a medio escribir");
  });

  test("a sent report clears the draft", async ({ page }) => {
    await boot(page);
    await page.locator(".app-footer [data-vt-report]").click();
    await fill(page, { summary: "enviado y olvidado" });
    await page.locator("#vt-report-form button[type=submit]").click();
    await expect(page.locator(".vt-report-ref")).toBeVisible();
    await page.locator("#vt-report-overlay .btn-primary").click();
    await page.locator(".app-footer [data-vt-report]").click();
    await expect(page.locator("#vt-report-summary")).toHaveValue("");
  });

  test("when the worker refuses, the report comes back as copyable text", async ({ page }) => {
    await boot(page, { reports: "off" });
    await page.locator(".app-footer [data-vt-report]").click();
    await fill(page, { summary: "no se guarda", detail: "pero no quiero perderlo" });
    await page.locator("#vt-report-form button[type=submit]").click();
    await expect(page.locator("#vt-report-title")).toHaveText(/No pudimos guardarlo/);
    await expect(page.locator("#vt-report-overlay p").nth(0)).toContainText(/apagados en el servidor/);
    const text = await page.locator("#vt-report-overlay textarea").inputValue();
    expect(text).toContain("no se guarda");
    expect(text).toContain("pero no quiero perderlo");
    expect(text).toContain("Página:");
    expect(text).toContain("Navegador:");
    // The way out, and the way back in.
    await expect(page.locator('#vt-report-overlay a[href*="github.com"]')).toHaveCount(1);
    await page.locator("#vt-report-overlay .btn-ghost").first().click();
    await expect(page.locator("#vt-report-summary")).toHaveValue("no se guarda");
  });

  // js/reports.js drawForm was split under the complexity ceiling (merging #26
  // into main); these three mutants lived until these tests.
  test("C29 a drafted idea comes back as an idea when the dialog is opened without a kind", async ({ page }) => {
    // The footer entry is labelled "report a problem" and asks for a bug, so
    // it is the programmatic open (and the QA page's) that shows the restore.
    await boot(page);
    await page.locator(".app-footer [data-vt-report]").click();
    await page.locator('input[name="vt-report-kind"][value="idea"]').check();
    await fill(page, { summary: "más escalas menores" });
    await page.keyboard.press("Escape");
    await expect(page.locator("#vt-report-overlay")).toBeHidden();
    await page.evaluate(() => window.VTReports.open());
    await expect(page.locator('input[name="vt-report-kind"][value="idea"]')).toBeChecked();
    await expect(page.locator("#vt-report-steps")).toBeHidden();
    await expect(page.locator("#vt-report-summary")).toHaveValue("más escalas menores");
  });

  test("C30 a signed-in reporter's address is offered as the contact, and a typed one wins", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window.VTAccount = { ...window.VTAccount, getState: () => ({ configured: true, signedIn: true, account: { email: "cantante@example.test" } }) };
    });
    await page.locator(".app-footer [data-vt-report]").click();
    await expect(page.locator("#vt-report-contact")).toHaveValue("cantante@example.test");
    // A draft is only kept once something is typed in the report itself.
    await fill(page, { summary: "el metrónomo se adelanta", contact: "otra@example.test" });
    await page.keyboard.press("Escape");
    await page.locator(".app-footer [data-vt-report]").click();
    await expect(page.locator("#vt-report-contact")).toHaveValue("otra@example.test");
  });

  test("C31 back from the copy panel, the cursor is in the summary again, not lost on the page", async ({ page }) => {
    await boot(page, { reports: "off" });
    await page.locator(".app-footer [data-vt-report]").click();
    await fill(page, { summary: "no se guarda" });
    await page.locator("#vt-report-form button[type=submit]").click();
    await expect(page.locator("#vt-report-title")).toHaveText(/No pudimos guardarlo/);
    await page.locator("#vt-report-overlay .btn-ghost").first().click();
    await expect(page.locator("#vt-report-summary")).toBeFocused();
  });

  test("with no worker at all the dialog still works, and says so", async ({ page }) => {
    const { posted } = await boot(page, { configured: false });
    await page.locator(".app-footer [data-vt-report]").click();
    await fill(page, { summary: "sin servidor" });
    await page.locator("#vt-report-form button[type=submit]").click();
    await expect(page.locator("#vt-report-title")).toHaveText(/No pudimos guardarlo/);
    await expect(page.locator("#vt-report-overlay p").nth(0)).toContainText(/no tiene servidor/);
    expect(posted).toHaveLength(0);
    expect(await page.locator("#vt-report-overlay textarea").inputValue()).toContain("sin servidor");
  });

  test("a network that drops the request is not a lost report", async ({ page }) => {
    await boot(page, { reports: "dead" });
    await page.locator(".app-footer [data-vt-report]").click();
    await fill(page, { summary: "sin red" });
    await page.locator("#vt-report-form button[type=submit]").click();
    await expect(page.locator("#vt-report-title")).toHaveText(/No pudimos guardarlo/);
    expect(await page.locator("#vt-report-overlay textarea").inputValue()).toContain("sin red");
  });

  test("the dialog lists what it attaches before anything is sent", async ({ page }) => {
    await boot(page);
    await page.locator(".app-footer [data-vt-report]").click();
    const disclosure = page.locator("#vt-report-form details").first();
    await expect(disclosure.locator("summary")).toHaveText(/Qué adjuntamos/);
    await disclosure.locator("summary").click();
    const items = await disclosure.locator("li").allTextContents();
    expect(items.join(" ")).toMatch(/navegador/);
    expect(items.join(" ")).toMatch(/pantalla/);
    expect(items.join(" ")).toMatch(/idioma/);
    // And it promises what the code does: nothing about the voice or progress.
    await expect(disclosure.locator("p")).toContainText(/No adjuntamos tu nombre|grabación/);
  });

  test("in English the whole dialog is English", async ({ page }) => {
    await boot(page, { lang: "en" });
    await expect(page.locator(".app-footer [data-vt-report]")).toHaveText(/Report a problem/);
    await page.locator(".app-footer [data-vt-report]").click();
    await expect(page.locator("#vt-report-title")).toHaveText(/Tell us what happened/);
    const body = await page.locator("#vt-report-form").textContent();
    // The Spanish strings that would show if a key were missing.
    expect(body).not.toMatch(/Cuéntanos|En una línea|Enviar/);
    expect(body).toMatch(/In one line/);
  });

  test("the guide offers it in both of its halves", async ({ page }) => {
    await boot(page, { url: "/guide.html" });
    const entries = page.locator("[data-vt-report]");
    await expect(entries).toHaveCount(2);
    await expect(entries.nth(0)).toHaveText(/Reportar un problema/);
    await expect(entries.nth(1)).toHaveText(/Report a problem/);
    await entries.nth(0).click();
    await expect(page.locator("#vt-report-overlay")).toBeVisible();
  });

  test("the privacy page says what a report keeps, in both languages", async ({ page }) => {
    await page.goto(BASE + "/privacy.html", { waitUntil: "domcontentloaded" });
    const body = await page.locator("body").textContent();
    // Every field the client actually sends has to be named on this page.
    for (const phrase of ["página", "versión", "user-agent", "pantalla", "idioma", "cuenta"]) {
      expect(body, `privacy.html must say a report keeps: ${phrase}`).toContain(phrase);
    }
    expect(body).toMatch(/No guardamos tu dirección IP con el reporte/);
    expect(body).toMatch(/180 días/);
    expect(body).toMatch(/number of a card|número de tarjeta/);
    expect(body).toMatch(/If you report a problem/);
    expect(body).toMatch(/user-agent/);
  });
});

test.describe("the QA site", () => {
  test("says what is live, and draws the charters", async ({ page }) => {
    await boot(page, { url: "/qa/index.html" });
    await expect(page.locator("h1")).toHaveText(/Probar Estudio Vocal/);
    // The facts come from the health route the stub answers.
    await expect(page.locator("#qa-worker")).toHaveText(/responde/);
    await expect(page.locator("#qa-auth")).toHaveText(/Google/);
    await expect(page.locator("#qa-trial")).toHaveText(/7 días/);
    await expect(page.locator("#qa-reports")).toHaveText(/^sí$/);
    await expect(page.locator("#qa-events")).toHaveText(/^no$/);
    await expect(page.locator("#qa-ua")).not.toHaveText("…");
    const charters = page.locator(".qa-charter");
    expect(await charters.count()).toBeGreaterThanOrEqual(8);
    // Every charter must offer at least three things to look at, or it is not
    // a session, and must name an area the worker accepts.
    const areas = await page.evaluate(() => window.VTQa.CHARTERS.map((c) => [c.area, c.checks.length, c.checksEn.length]));
    const allowed = ["practice", "audio", "exercises", "progress", "account", "payment", "site", "other"];
    for (const [area, n, nEn] of areas) {
      expect(allowed).toContain(area);
      expect(n).toBeGreaterThanOrEqual(3);
      expect(nEn).toBe(n);
    }
  });

  test("ticking a check sticks, and the pass can be copied out", async ({ page }) => {
    await boot(page, { url: "/qa/index.html" });
    const first = page.locator(".qa-charter").first().locator('input[type="checkbox"]').first();
    await first.check();
    await expect(page.locator(".qa-charter").first().locator(".qa-count")).toHaveText(/^1\//);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTQa);
    await expect(page.locator(".qa-charter").first().locator('input[type="checkbox"]').first()).toBeChecked();
    const summary = await page.evaluate(() => window.VTQa.runText());
    expect(summary).toMatch(/Ronda de pruebas/);
    expect(summary).toMatch(/\[x\]/);
    expect(summary).toMatch(/\[ \]/);
    expect(summary).toMatch(/Navegador:/);
    // Starting over clears them.
    await page.locator("#qa-reset-run").click();
    await expect(page.locator(".qa-charter").first().locator('input[type="checkbox"]').first()).not.toBeChecked();
  });

  test("a failed check opens the report dialog already filled in", async ({ page }) => {
    await boot(page, { url: "/qa/index.html" });
    const charter = page.locator(".qa-charter").first();
    const check = charter.locator(".qa-checks li").first();
    const wording = (await check.locator("label span").textContent()).trim();
    await check.locator(".qa-report").click();
    await expect(page.locator("#vt-report-overlay")).toBeVisible();
    await expect(page.locator("#vt-report-summary")).toHaveValue(wording.slice(0, 140));
    // The area comes from the charter, so a finding files itself correctly.
    const area = await page.evaluate(() => window.VTQa.CHARTERS[0].area);
    await expect(page.locator("#vt-report-area")).toHaveValue(area);
  });

  test("it is kept out of search, and sends no statistics", async ({ page }) => {
    await boot(page, { url: "/qa/index.html" });
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
    const scripts = await page.evaluate(() =>
      [...document.querySelectorAll("script[src]")].map((s) => s.getAttribute("src"))
    );
    // The same rule admin.html follows: what a tester does must not enter the
    // funnel the admin panel reads.
    expect(scripts.some((src) => /analytics|experiments|region-gate/.test(src))).toBe(false);
    expect(await page.evaluate(() => !!window.VTAnalytics)).toBe(false);
  });

  // qa/qa.js loadHealth and stateText were split under the complexity ceiling
  // (merging #26 into main); these three mutants lived until these tests.
  test("C12 + C15 an older worker is called older, not 'off', and both ways in are named", async ({ page }) => {
    await boot(page, {
      url: "/qa/index.html",
      health: { ok: true, accountsConfigured: true, authMethods: { email: true, google: true, googleClientId: "x", trialDays: 14 } }
    });
    await expect(page.locator("#qa-worker")).toHaveText("responde");
    await expect(page.locator("#qa-auth")).toHaveText("Google y código por correo");
    await expect(page.locator("#qa-trial")).toHaveText("14 días");
    await expect(page.locator("#qa-reports")).toHaveText("este servidor es anterior a los reportes");
    await expect(page.locator("#qa-events")).toHaveText("este servidor es anterior a las estadísticas");
  });

  test("C14 the pasted state carries what the worker said", async ({ page }) => {
    await boot(page, { url: "/qa/index.html" });
    await expect(page.locator("#qa-worker")).toHaveText("responde");
    const state = await page.evaluate(() => window.VTQa.stateText());
    expect(state).toContain("Servidor: responde");
    expect(state).toContain("Cuentas: sí");
    expect(state).toContain("Entrar: google=sí email=no");
    expect(state).toContain("Días de prueba: 7");
    expect(state).toContain("Reportes: sí");
    expect(state).toContain("Estadísticas: no");
  });

  test("the QA page loads shared files at the same version the app does", async () => {
    // The root pages are checked by admin.spec.js; this page is in a folder, so
    // its ../ paths slip past that scan. A stale shared script here would mean a
    // tester testing a build nobody else is running.
    const root = path.join(__dirname, "..");
    /** Stamps for js/ and css/ files loaded by one HTML file. */
    const stamps = (file, prefix) => {
      const html = fs.readFileSync(path.join(root, file), "utf8");
      const out = {};
      for (const m of html.matchAll(/(?:src|href)\s*=\s*["']((?:\.\.\/|\.\/)?(?:js|css)\/[^"'\s>]+)["']/g)) {
        const [, link] = m;
        const at = link.indexOf("?");
        expect(at, `${file} loads ${link} with no ?v= stamp`).toBeGreaterThan(-1);
        const stamp = /^\?v=(\w+)$/.exec(link.slice(at));
        expect(stamp, `${file} loads ${link}, not <path>?v=<version>`).toBeTruthy();
        out[link.slice(0, at).replace(/^(\.\.\/|\.\/)/, "")] = stamp[1];
      }
      return out;
    };
    const qa = stamps("qa/index.html");
    const app = { ...stamps("index.html"), ...stamps("guide.html"), ...stamps("admin.html") };
    expect(Object.keys(qa).length).toBeGreaterThan(2);
    for (const [file, stamp] of Object.entries(qa)) {
      if (app[file] === undefined) continue;
      expect(stamp, `qa/index.html loads ${file} at ${stamp}, the app at ${app[file]}`).toBe(app[file]);
    }
  });
});
