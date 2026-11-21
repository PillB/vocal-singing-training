/**
 * CXSS-3 (red team, Nov 2026; VG-90 was the subject-only half). Anyone can
 * send a report, anonymously, and its contact is stored as typed once it
 * passes a loose address check, which takes "?", "&", "=" and "%40". The
 * admin panel concatenated it after "mailto:", so "Responder a" opened the
 * admin's mail client with a hidden bcc to a stranger, a cc to anyone and a
 * body written by the reporter: RFC 6068 reads everything after "?" in a
 * mailto: URI as header fields, and a "," in the address part as a second
 * recipient.
 *
 * Wrong behaviour rejected: a reply link that carries any header field, or
 * addresses anyone but the one person in the contact. Expected: a plain
 * address gets a link that addresses only that person (its local part
 * percent-encoded, RFC 6068 section 2), and any other contact is shown as
 * text, with no link, and a note saying why. Control: plain addresses,
 * including one with "+", still get their link.
 *
 * The worker host is routed and admin.html runs under its real CSP; the
 * reports come back as the worker would hand back contacts already stored,
 * so the test holds whatever the worker's own check accepts later.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const WORKER = "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev";
const AT = 1800000000;

const HFIELDS =
  "reporter@example.test?cc=boss%40studio.example&bcc=collector%40evil.example&subject=re%3a%20tu%20pago&body=confirma%20tu%20tarjeta%3a%20https%3a%2f%2fevil.example%2fpay";
const CONTACTS = [
  ["hfields", HFIELDS, null],
  ["second recipient", "ana,collector@evil.example", null],
  ["fragment", "ana@mail.pe#bcc=collector@evil.example", null],
  // Controls: plain addresses keep their link, addressed to exactly that person
  ["plus", "ana.p+voz@mail.pe", "ana.p+voz@mail.pe"],
  ["plain", "o'brien@studio.example", "o'brien@studio.example"],
  // atext allows "#", which a URI reads as the start of a fragment: only percent-encoding keeps it in the address
  ["hash", "ana#voz@mail.pe", "ana#voz@mail.pe"]
];

const report = ([label, contact], i) => ({
  reference: `VS-${i + 1}`,
  kind: "bug",
  area: "other",
  severity: "low",
  status: "new",
  summary: `report ${label}`,
  detail: "detail",
  steps: "",
  page: "/",
  build: "b",
  contact,
  accountId: null,
  environment: { ua: "ua", viewport: "390x844" },
  adminNote: "",
  createdAt: AT - i,
  updatedAt: AT - i
});

async function openReports(page) {
  await page.route(`${WORKER}/**`, async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    const headers = {
      "access-control-allow-origin": req.headers()["origin"] || "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
      vary: "Origin"
    };
    const json = (body) => route.fulfill({ status: 200, contentType: "application/json", headers, body: JSON.stringify(body) });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (p === "/v1/auth/methods") return json({ ok: true, email: true, google: false, trialDays: 7 });
    if (p === "/v1/me") {
      return json({ ok: true, account: { id: "acct_admin", email: "admin@example.test", role: "admin" }, entitlement: { pro: false, status: "free" }, grants: [], paid: [] });
    }
    if (p === "/v1/admin/reports") return json({ ok: true, more: false, counts: { new: CONTACTS.length }, reports: CONTACTS.map(report) });
    return json({ ok: true });
  });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_lang", "es");
      localStorage.setItem("vt_account_session_v1", JSON.stringify({ token: "admin-session", expiresAt: 4102444800 }));
    } catch {
      /* the gate assertion below fails if the session did not land */
    }
  });
  await page.goto(`${BASE}/admin.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).toHaveAttribute("data-gate", "admin", { timeout: 15000 });
  await expect(page.locator("#reports-list .admin-report")).toHaveCount(CONTACTS.length);
}

/** Who a mailto: href would write to, and which header fields it carries. */
function parseMailto(href) {
  const u = new URL(href);
  return { to: decodeURIComponent(u.pathname), fields: [...new URLSearchParams(u.search).keys()], fragment: u.hash };
}

test.describe("CXSS-3: a report's reply link addresses one person and carries nothing else", () => {
  test("IJ17 a contact with header fields, a second recipient or a fragment gets no link; a plain address does", async ({ page }) => {
    await openReports(page);
    for (const [label, contact, to] of CONTACTS) {
      const card = page.locator("#reports-list .admin-report", { has: page.locator("h4", { hasText: `report ${label}` }) });
      await expect(card, `the ${label} report is listed once`).toHaveCount(1);
      // The admin still sees what the reporter typed, as text
      await expect(card).toContainText(contact);
      const links = card.locator('a[href^="mailto:"]');
      if (to === null) {
        await expect(links, `${label}: no reply link`).toHaveCount(0);
        await expect(card, `${label}: the admin is told why there is no link`).toContainText("no es una dirección simple");
        continue;
      }
      await expect(links, `control (${label}): a plain address keeps its reply link`).toHaveCount(1);
      const mail = parseMailto(await links.getAttribute("href"));
      expect(mail, `${label}: one recipient, no header field, no fragment`).toEqual({ to, fields: [], fragment: "" });
    }
    // Nothing on the page writes to anyone the reports did not name, or carries a header field
    const all = await page.locator('#reports-list a[href^="mailto:"]').evaluateAll((as) => as.map((a) => a.getAttribute("href")));
    expect(all.length, "control: links were drawn").toBe(3);
    for (const href of all) expect(new URL(href).search).toBe("");
  });
});
