/**
 * The privacy page's account section must stay true when a recipient is added.
 *
 * Red team round two, truth-7: round one rewrote the account section to "solo
 * lo compartimos en un caso: ... Creem" / "we share it in one case only". Go-live
 * gate step 7 turns on emailed sign-in codes through Resend, Brevo or
 * MailerSend, which receive every address that asks for a code, and its
 * instruction named only the recipient list. Followed exactly, the list would
 * name the provider while the account section still said Creem was the only
 * case. A notice that keeps its own count beside the list goes out of date the
 * first time a processor is added (GDPR art. 13(1)(e) and Peru's Ley 29733 art.
 * 18 expect one complete list of recipients).
 *
 * So the account section points at the list instead of counting, and this file
 * reads `EMAIL_PROVIDER` from workers/entitlements/wrangler.toml: while it is
 * set, both halves must name the provider in the list and in the account
 * sentence (docs/40-GO-LIVE-GATE.md step 7); while it is empty, neither may name
 * one as a recipient. The checks are pure functions over the page's text, with
 * negative fixtures beside them, so each can be seen to fail.
 */
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const ROOT = path.join(__dirname, "..");

/** The company a reader meets for each EMAIL_PROVIDER value the worker accepts (workers/entitlements/src/email.js). */
const EMAIL_NAMES = { resend: "Resend", brevo: "Brevo", mailersend: "MailerSend" };

/** The provider wrangler.toml turns on, or "" while emailed codes are off. */
function emailProvider() {
  const toml = fs.readFileSync(path.join(ROOT, "workers", "entitlements", "wrangler.toml"), "utf8");
  const m = /^EMAIL_PROVIDER\s*=\s*"([^"]*)"/m.exec(toml);
  if (!m) throw new Error("wrangler.toml has no EMAIL_PROVIDER line; this check needs updating");
  return m[1].trim().toLowerCase();
}

/**
 * Every [half, place, problem] where the page and EMAIL_PROVIDER disagree.
 * "missing": the provider is on and that sentence does not name it. "stale":
 * it is off and the sentence names an email provider as a recipient. "counts":
 * the account sentence claims a number of cases instead of pointing at the list.
 * @param {string} provider EMAIL_PROVIDER, "" when off.
 * @param {{[half: string]: {account: string, list: string}}} halves The two sentences, per half.
 */
function recipientGaps(provider, halves) {
  const gaps = [];
  for (const [half, places] of Object.entries(halves)) {
    if (/\ben un caso\b|\bin one case\b|\bsolo lo compartimos\b|\bonly share\b/i.test(places.account)) gaps.push([half, "account", "counts"]);
    for (const [place, text] of Object.entries(places)) {
      for (const [id, name] of Object.entries(EMAIL_NAMES)) {
        const named = text.includes(name);
        if (id === provider && !named) gaps.push([half, place, "missing"]);
        if (id !== provider && named) gaps.push([half, place, "stale"]);
      }
    }
  }
  return gaps;
}

/** The account sentence and the recipient list, as the page shows them, in each half. */
async function privacySentences(page) {
  await page.goto(`${BASE}/privacy.html`, { waitUntil: "domcontentloaded" });
  return page.evaluate(() => {
    const flat = (el) => (el ? el.textContent.replace(/\s+/g, " ").trim() : "");
    const paras = [...document.querySelectorAll("main p")];
    const inEn = (p) => !!p.closest('section[lang="en"]');
    const es = paras.filter((p) => !inEn(p));
    const en = paras.filter(inEn);
    const listEs = document.getElementById("quien-recibe");
    return {
      es: {
        account: flat(es.find((p) => p.textContent.includes("Guardamos tu correo"))),
        list: flat(listEs && listEs.nextElementSibling)
      },
      en: {
        account: flat(en.find((p) => p.textContent.includes("Once signed in, we keep your email address"))),
        list: flat(document.getElementById("who-receives"))
      },
      // Where each account sentence points, and whether that is the list.
      links: [...document.querySelectorAll("main p a[href^='#']")]
        .filter((a) => /Guardamos tu correo|Once signed in, we keep/.test(a.closest("p").textContent))
        .map((a) => ({ href: a.getAttribute("href"), lands: !!document.querySelector(a.getAttribute("href")) }))
    };
  });
}

test.describe("the privacy page's account section stays true when a recipient is added", () => {
  test("it points at the list of recipients instead of counting them, in both halves", async ({ page }) => {
    const s = await privacySentences(page);
    // Precondition: the sentences were found, and the list names Creem.
    for (const half of ["es", "en"]) {
      expect(s[half].account.length, `${half}: the account paragraph`).toBeGreaterThan(80);
      expect(s[half].list, `${half}: the recipient list`).toMatch(/Creem/);
    }
    // Wrong (round one): "solo lo compartimos en un caso" / "we share it in one case only".
    expect(recipientGaps(emailProvider(), { es: s.es, en: s.en }).filter((g) => g[2] === "counts")).toEqual([]);
    expect(s.links).toEqual([
      { href: "#quien-recibe", lands: true },
      { href: "#who-receives", lands: true }
    ]);
  });

  test("the email provider wrangler.toml turns on is named in both halves, in the list and the account sentence, and none is named while it is off", async ({ page }) => {
    const provider = emailProvider();
    expect(provider === "" || provider in EMAIL_NAMES, `EMAIL_PROVIDER "${provider}" is one the worker accepts`).toBe(true);
    const s = await privacySentences(page);
    expect(recipientGaps(provider, { es: s.es, en: s.en })).toEqual([]);
  });

  test("control: the check catches a count, a provider left out and a provider named while off", () => {
    const fixed = {
      es: { account: "Solo lo reciben quienes lo necesitan, nombrados abajo: Creem y Resend.", list: "Creem y Resend. Nadie más recibe nada." },
      en: { account: "Only those who need it receive it, named below: Creem and Resend.", list: "Creem and Resend. Nobody else receives anything." }
    };
    expect(recipientGaps("resend", fixed)).toEqual([]);
    // Round one's sentence after step 7, followed as written: the list gained Resend, the count stayed.
    const stepSeven = {
      es: { account: "Solo lo compartimos en un caso: al abrir un pago con tarjeta, tu correo va a Creem.", list: "Creem y Resend. Nadie más recibe nada." },
      en: { account: "We share it in one case only: your email address goes to Creem.", list: "Creem and Resend. Nobody else receives anything." }
    };
    expect(recipientGaps("resend", stepSeven)).toEqual([
      ["es", "account", "counts"],
      ["es", "account", "missing"],
      ["en", "account", "counts"],
      ["en", "account", "missing"]
    ]);
    expect(recipientGaps("", fixed)).toEqual([
      ["es", "account", "stale"],
      ["es", "list", "stale"],
      ["en", "account", "stale"],
      ["en", "list", "stale"]
    ]);
  });
});
