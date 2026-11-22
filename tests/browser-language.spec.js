/**
 * Which language the app opens in (js/boot-head.js, window.VTLangPref).
 *
 * The defect (marketing research, 2026-11-21): a browser set to English, on a
 * first visit with nothing stored, was shown the whole site in Spanish, in
 * real Chromium with en-GB and en-US alike, and English-speaking test personas
 * said they would leave at once. The rule now, first match wins:
 *
 *   1. an address that names a language (?lang=es, ?lang=en: the URLs the
 *      hreflang links give search engines), shown and never stored as a choice;
 *   2. the visitor's own choice (vt_lang, written by the language button and
 *      the footer's language links);
 *   3. the language an address named earlier in this tab (vt_lang_link);
 *   4. the browser's languages, walked in order: Spanish or English, or a
 *      language whose readers read Spanish (CLDR's close matches, Portuguese);
 *   5. a browser that names only other languages: English;
 *   6. no language named at all: Spanish.
 * Someone who practised in Spanish before this rule keeps Spanish (once).
 *
 * Every test names the wrong behaviour it fails on. Playwright's own default
 * locale is en-US; playwright.config.js makes it es-US, so a test here that
 * means another browser says which (a locale, or a list of languages).
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const LOCAL = /^(?:https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d+)?\/|data:|blob:|about:)/;
const PHONE = { width: 360, height: 740 };

/** What the visitor reads, and what the page says about itself. */
const shown = () => ({
  lang: document.documentElement.lang,
  nav: document.getElementById("btn-history").textContent.trim(),
  title: document.title,
  hero: document.getElementById("start-title").textContent.trim(),
  button: document.getElementById("btn-lang").textContent.trim(),
  stored: localStorage.getItem("vt_lang")
});

const ENGLISH = { lang: "en", nav: "History", title: "Vocal & Singing Training", hero: "Train your voice 3 minutes a day.", button: "Español" };
const SPANISH = { lang: "es", nav: "Historial", title: "Entrenamiento vocal y de canto", hero: "Entrena tu voz 3 minutos al día.", button: "English" };
const UI = ["lang", "nav", "title", "hero", "button"];
// Someone with practice kept sees another hero ("3 minutes and you're back"); the rest is the same
const RETURNING = ["lang", "nav", "title", "button"];
const pick = (r, keys = UI) => Object.fromEntries(keys.map((k) => [k, r[k]]));
const nameOf = (want) => (want === ENGLISH ? "English" : "Spanish");

/** A day of practice in the ledger's shape (js/practice-days.js). */
const PRACTICE_DAYS = JSON.stringify({ v: 1, days: { "2026-11-10": { sec: 240, n: 2, ex: ["s4-lip-trills"] } }, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true });

/**
 * A browser of this locale, with only the page's own server reachable (the
 * account worker and Google are not part of these cases).
 * @param {import('@playwright/test').Browser} browser
 * @param {{ locale: string, languages?: string[], store?: Object<string, string>, viewport?: object, blocked?: boolean }} o
 */
async function visitor(browser, o) {
  const ctx = await browser.newContext({ locale: o.locale, viewport: o.viewport || { width: 1280, height: 720 } });
  // The context's, so a tab the page opens (or a test opens beside it) reaches no outside host either
  await ctx.route((url) => !LOCAL.test(url.href), (route) => route.abort("blockedbyclient"));
  const page = await ctx.newPage();
  await page.addInitScript(seed, { languages: o.languages || null, store: o.store || null, blocked: !!o.blocked });
  return { ctx, page };
}

/** Runs in the page before its own scripts: the browser's language list, what is stored (once), blocked site data. */
function seed({ languages, store, blocked }) {
  if (languages) {
    // What navigator.languages is on a browser whose settings list several, which a Playwright locale cannot express
    Object.defineProperty(Navigator.prototype, "languages", { configurable: true, get: () => Object.freeze(languages.slice()) });
    Object.defineProperty(Navigator.prototype, "language", { configurable: true, get: () => languages[0] });
  }
  if (blocked) {
    const boom = { configurable: true, get() { throw new DOMException("The operation is insecure.", "SecurityError"); } };
    Object.defineProperty(window, "localStorage", boom);
    Object.defineProperty(window, "sessionStorage", boom);
    return;
  }
  sessionStorage.setItem("vt_e2e", "1");
  if (store && !sessionStorage.getItem("vt_seeded")) {
    sessionStorage.setItem("vt_seeded", "1");
    for (const [k, v] of Object.entries(store)) localStorage.setItem(k, v);
  }
}

/** Load the app (at this address) and wait until it has started. */
async function load(page, at = "/") {
  await page.goto(BASE + at, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && document.readyState !== "loading");
  return page.evaluate(shown);
}

/** Press the language button, opening the header's "More" menu first where it is folded there. */
async function pressLanguage(page) {
  const more = page.locator("#btn-more");
  if (await more.isVisible()) await more.click();
  await page.locator("#btn-lang").click();
}

test.describe("first visit, nothing stored: the browser's language", () => {
  for (const locale of ["en-US", "en-GB", "en"]) {
    // Wrong: the Spanish page (the defect), or the guess written to vt_lang as if it were a choice
    test(`a browser in ${locale} is shown English, and nothing is stored`, async ({ browser }) => {
      const { ctx, page } = await visitor(browser, { locale });
      const r = await load(page);
      expect(await page.evaluate(() => navigator.languages.join()), "control: the browser reports this locale").toBe(locale);
      expect(pick(r)).toEqual(ENGLISH);
      expect(r.stored, "a guess is not a choice").toBeNull();
      await ctx.close();
    });
  }

  for (const locale of ["es-PE", "es-MX", "es-419", "es", "pt-BR"]) {
    // Wrong: an English page for a Spanish browser (a rule that reads the wrong field, or defaults to English);
    // for pt-BR, Portuguese not taken for a reader of Spanish
    test(`a browser in ${locale} is shown Spanish`, async ({ browser }) => {
      const { ctx, page } = await visitor(browser, { locale });
      const r = await load(page);
      expect(await page.evaluate(() => navigator.language), "control: the browser reports this locale").toBe(locale);
      expect(pick(r)).toEqual(SPANISH);
      expect(r.stored).toBeNull();
      await ctx.close();
    });
  }

  // As Safari reports them, one language alone. Wrong: Spanish for a browser that names only other languages,
  // which Chrome (de-DE, de, en-US, en) shows in English: the same visitor's iPhone and laptop disagree
  test("a browser in another language (de-DE, fr-FR, ja-JP) is shown English", async ({ browser }) => {
    for (const locale of ["de-DE", "fr-FR", "ja-JP"]) {
      const { ctx, page } = await visitor(browser, { locale });
      expect(pick(await load(page)), locale).toEqual(ENGLISH);
      await ctx.close();
    }
  });
});

test.describe("the browser's list, in its order", () => {
  const cases = [
    // Firefox's Spanish builds and Android in-app browsers list English after Spanish: wrong is "any English wins"
    { languages: ["es-PE", "es", "en-US", "en"], want: SPANISH },
    // Wrong: only the first entry read (navigator.language), so a German who listed Spanish after it gets English
    { languages: ["de-DE", "de", "es"], want: SPANISH },
    // A bilingual reader who put English first
    { languages: ["en-US", "es-US"], want: ENGLISH },
    // Wrong: a language that reads Spanish passed over for the English the browser appended (an Android WebView in
    // Portuguese, a device in Quechua)
    { languages: ["pt-BR", "en-US"], want: SPANISH },
    { languages: ["qu-PE", "en-US", "en"], want: SPANISH },
    // ... but only where it stands: English first stays English
    { languages: ["en-US", "pt-BR"], want: ENGLISH }
  ];
  for (const c of cases) {
    test(`[${c.languages.join(", ")}] opens in ${nameOf(c.want)}`, async ({ browser }) => {
      const { ctx, page } = await visitor(browser, { locale: "en-US", languages: c.languages });
      const r = await load(page);
      expect(await page.evaluate(() => navigator.languages.join()), "control: the page saw this list").toBe(c.languages.join());
      expect(pick(r)).toEqual(c.want);
      await ctx.close();
    });
  }

  // The rule itself, on tag forms a Playwright locale cannot produce; each wrong answer names the bug that gives it
  test("language tags are matched on their primary subtag, case-blind, first match wins", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "en-US" });
    await load(page);
    const matrix = [
      [["EN-gb"], "en"], // a case-sensitive compare
      [["en_US"], "en"], // an underscore (some WebViews) not split
      [[" en-US"], "en"], // a hand-edited Firefox list, not trimmed
      [["es-419", "en"], "es"],
      [["zh-Hant-TW", "es"], "es"], // a script subtag
      [["enm", "es"], "es"], // a prefix compare: Middle English is not English
      [["eu-ES", "en"], "es"], // CLDR: Basque reads Spanish
      [["ca"], "es"],
      [["", "*", "en"], "en"], // empty and wildcard entries skipped, not fatal
      [["x-klingon"], "es"], // a private-use tag names no language
      [[], "es"],
      [["fr", "de"], "en"],
      ["en-GB", "en"] // one tag, not a list
    ];
    const got = await page.evaluate((m) => m.map(([tags]) => window.VTLangPref.fromBrowser(tags)), matrix);
    expect(got).toEqual(matrix.map(([, want]) => want));
    await ctx.close();
  });
});

test.describe("an address that names a language", () => {
  // What a search engine renders: an English browser, nothing stored. Wrong: ?lang= not read, so the address
  // the hreflang links announce as Spanish is indexed in English like the bare one
  test("a crawler's English browser is shown Spanish at ?lang=es and English at the bare address", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "en-US" });
    expect(pick(await load(page, "/?lang=es"))).toEqual(SPANISH);
    await ctx.close();
    const bare = await visitor(browser, { locale: "en-US" });
    expect(pick(await load(bare.page, "/"))).toEqual(ENGLISH);
    await bare.ctx.close();
  });

  // Wrong: the stored choice outranks the address, so a link to the English version opens in Spanish; or the
  // address's language is stored, so the visitor's own choice is lost on the next bare visit
  test("?lang=en is shown over a stored Spanish choice, which stays stored", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "es-PE", store: { vt_lang: "es" } });
    const r = await load(page, "/?lang=en");
    expect(pick(r)).toEqual(ENGLISH);
    expect(r.stored).toBe("es");
    expect(pick(await load(page, "/"))).toEqual(SPANISH);
    await ctx.close();
  });

  test("an address naming a language the site does not have decides nothing", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "en-US" });
    expect(pick(await load(page, "/?lang=fr"))).toEqual(ENGLISH);
    await ctx.close();
  });

  // Wrong: the address left at ?lang=en after a switch to Spanish, so the reload (and any link copied from it) shows
  // English again over the choice just made; or the view lost (#plan dropped)
  test("a switch at ?lang=en#plan names Spanish in the address, keeps the view, and a reload stays Spanish", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "en-US" });
    expect(pick(await load(page, "/?lang=en#plan"))).toEqual(ENGLISH);
    await pressLanguage(page);
    await expect(page.locator("#btn-history")).toHaveText("Historial");
    expect(await page.evaluate(() => [location.search, location.hash, localStorage.getItem("vt_lang")])).toEqual(["?lang=es", "#plan", "es"]);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTApp && document.readyState !== "loading");
    expect(pick(await page.evaluate(shown))).toEqual(SPANISH);
    await ctx.close();
  });

  // Wrong: every switch writes ?lang= into the address, so the bare address (the adapting x-default) is never kept
  test("a switch at the bare address leaves the address bare", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "en-US" });
    await load(page);
    await pressLanguage(page);
    await expect(page.locator("#btn-history")).toHaveText("Historial");
    expect(await page.evaluate(() => location.search)).toBe("");
    await ctx.close();
  });
});

test.describe("the rest of a visit that came in through an address", () => {
  /** Wait for the app at this address (a navigation the page made itself), and say what it shows. */
  async function arrived(page, search) {
    await page.waitForURL((url) => url.pathname === "/" && url.search === search);
    await page.waitForFunction(() => !!window.VTApp && document.readyState !== "loading");
    return page.evaluate(shown);
  }

  // Each half's "back to the app" names its language. Wrong: someone who followed the English address on a browser
  // set to Spanish is switched to Spanish by the next page of their own visit
  test("the English address, then the privacy page and its way back: the English address again", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "es-PE" });
    expect(pick(await load(page, "/?lang=en"))).toEqual(ENGLISH);
    await page.locator('footer a[href^="privacy.html"]').click();
    await page.waitForURL(/privacy\.html#en$/);
    await page.locator('section[lang="en"] .privacy-back a').click();
    expect(pick(await arrived(page, "?lang=en"))).toEqual(ENGLISH);
    await ctx.close();
  });

  // The guide's header "← App" is ./ in both halves: only the tab's memory carries the language over it
  test("the English address, then the guide's \"← App\" in the same tab: English", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "es-PE" });
    await load(page, "/?lang=en");
    await page.locator("#footer-guide-link").click();
    await page.waitForURL(/guide\.html/);
    await page.locator('header a[href="./"]').click();
    expect(pick(await arrived(page, ""))).toEqual(ENGLISH);
    await ctx.close();
  });

  // The guide opens beside an exercise, in a tab of its own (noopener), which starts with nothing of this tab's.
  // Wrong: its "back to the app" is ./, and that tab opens the app in the browser's language, not the one read
  for (const [locale, at, want, back] of [
    ["es-PE", "/?lang=en", ENGLISH, 'section[lang="en"] .guide-back a'],
    ["en-US", "/?lang=es", SPANISH, ".guide-back a >> nth=0"]
  ]) {
    test(`the guide beside an exercise at ${at} (${locale}), then its way back: ${nameOf(want)}`, async ({ browser }) => {
      const { ctx, page } = await visitor(browser, { locale });
      await load(page, `${at}#ejercicio/s4-lip-trills`);
      const guide = page.locator("#link-guide");
      await expect(guide).toHaveAttribute("target", "_blank");
      const opened = ctx.waitForEvent("page", { timeout: 10000 });
      await guide.click();
      const tab = await opened;
      await tab.waitForURL(/guide\.html/);
      expect(await tab.evaluate(() => sessionStorage.getItem("vt_lang_link")), "control: the new tab kept nothing").toBeNull();
      await tab.locator(back).click();
      expect(pick(await arrived(tab, at.slice(1)))).toEqual(want);
      await ctx.close();
    });
  }

  // A checkout returns to /?billing=success, without the language
  test("back from a checkout, the address's language holds", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "es-PE" });
    await load(page, "/?lang=en");
    const r = await load(page, "/?billing=success");
    expect([r.lang, r.nav, r.button]).toEqual([ENGLISH.lang, ENGLISH.nav, ENGLISH.button]);
    await ctx.close();
  });

  // / in Spanish, then /?lang=en, then Back: the browser may bring the first page back from its back/forward cache,
  // as it was. Playwright's Chromium runs without that cache, so the browser's pageshow is dispatched here. Wrong: the
  // page keeps the language it was left in while the tab now remembers English, so the visit flips at its next page;
  // or what it shows is kept as a choice
  test("a page back from the back/forward cache shows what decides the language now, and keeps nothing", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "es-PE" });
    expect(pick(await load(page))).toEqual(SPANISH);
    const pageshow = (persisted) =>
      page.evaluate((persisted) => {
        sessionStorage.setItem("vt_lang_link", "en");
        window.dispatchEvent(new PageTransitionEvent("pageshow", { persisted }));
        return document.documentElement.lang;
      }, persisted);
    // Control: a page drawn anew decided at its own start, and is left alone
    expect(await pageshow(false)).toBe("es");
    await pageshow(true);
    await expect(page.locator("#btn-history")).toHaveText("History");
    expect(pick(await page.evaluate(shown))).toEqual(ENGLISH);
    expect(await page.evaluate(() => localStorage.getItem("vt_lang"))).toBeNull();
    await ctx.close();
  });

  // Wrong: the address's language kept for good (localStorage), so it becomes a choice the visitor never made and
  // the browser's language is never asked again
  test("a new tab asks the browser again, and nothing was stored", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "es-PE" });
    expect((await load(page, "/?lang=en")).stored).toBeNull();
    const other = await ctx.newPage();
    await other.addInitScript(seed, { languages: null, store: null, blocked: false });
    expect(pick(await load(other, "/"))).toEqual(SPANISH);
    await ctx.close();
  });
});

test.describe("the footer's language links", () => {
  const links = () =>
    [...document.querySelectorAll("footer a[data-lang-link]")].map((a) => ({
      text: a.textContent.trim(),
      href: a.getAttribute("href"),
      lang: a.lang,
      current: a.getAttribute("aria-current")
    }));

  // Wrong: the links missing, written in the page's language, or the language on screen not marked
  test("each language's address, named in its own language, the one on screen marked", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "en-US" });
    await load(page);
    expect(await page.evaluate(links)).toEqual([
      { text: "Español", href: "./?lang=es", lang: "es", current: null },
      { text: "English", href: "./?lang=en", lang: "en", current: "true" }
    ]);
    await ctx.close();
  });

  // Wrong: the click left to the link, so the page reloads at ?lang=es (one more load, the stored choice never
  // made, the address no longer the adapting one); or the marks not moved
  test("a click on Español switches like the button: no reload, kept, the address left bare", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "en-US" });
    await load(page);
    await page.evaluate(() => (window.__samePage = true));
    await page.getByRole("link", { name: "Español", exact: true }).click();
    await expect(page.locator("#btn-history")).toHaveText("Historial");
    expect(await page.evaluate(() => [window.__samePage, location.search, localStorage.getItem("vt_lang")])).toEqual([true, "", "es"]);
    expect((await page.evaluate(links)).map((l) => l.current)).toEqual(["true", null]);
    await ctx.close();
  });

  // Wrong: every click taken over, so "open in a new tab" switches this one instead
  test("a click for a new tab opens the address there and leaves this page as it was", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "en-US" });
    await load(page);
    const opened = ctx.waitForEvent("page", { timeout: 10000 });
    // Ctrl on Windows and Linux, Cmd on a Mac: the new-tab click where the test runs
    await page.getByRole("link", { name: "Español", exact: true }).click({ modifiers: ["ControlOrMeta"] });
    const tab = await opened;
    await tab.waitForURL((url) => url.pathname === "/" && url.search === "?lang=es");
    expect(await page.evaluate(() => [document.documentElement.lang, localStorage.getItem("vt_lang")])).toEqual(["en", null]);
    await ctx.close();
  });

  // Each of the browser's own clicks: Cmd (a Mac's new tab), Ctrl, Shift (a window), Alt (a download), a button
  // other than the main one. Wrong: one of them taken over, so it switches this page instead. A listener after the
  // app's records what it did, then stops the browser's own action, so no tab, window or download follows
  test("a click with a modifier, or another button, is left to the browser", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "en-US" });
    await load(page);
    const clickWith = (init) =>
      page.evaluate((init) => {
        let prevented = null;
        const spy = (e) => {
          prevented = e.defaultPrevented;
          e.preventDefault();
        };
        document.addEventListener("click", spy);
        const a = document.querySelector('footer a[data-lang-link][hreflang="es"]');
        a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, button: 0, ...init }));
        document.removeEventListener("click", spy);
        return { prevented, lang: document.documentElement.lang, stored: localStorage.getItem("vt_lang") };
      }, init);
    for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { button: 1 }]) {
      expect(await clickWith(init), JSON.stringify(init)).toEqual({ prevented: false, lang: "en", stored: null });
    }
    // Control: a plain click is the app's
    expect(await clickWith({})).toEqual({ prevented: true, lang: "es", stored: "es" });
    await ctx.close();
  });

  // Wrong: the click taken over with nothing to switch with (js/i18n.js failed to load), so the link does nothing
  test("without js/i18n.js a click still loads the language's address", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "es-PE" });
    await page.route("**/js/i18n.js*", (route) => route.abort("failed"));
    await load(page);
    expect(await page.evaluate(() => typeof window.VTI18n), "control: the strings never came").toBe("undefined");
    await page.locator('footer a[data-lang-link][hreflang="en"]').click();
    await page.waitForURL((url) => url.search === "?lang=en");
    await ctx.close();
  });

  // Wrong: the pair split over two lines on a phone (Español at the end of one, English starting the next), or the
  // language on screen marked for screen readers only
  for (const [locale, current] of [["es-PE", "es"], ["en-US", "en"]]) {
    test(`on a phone (${locale}) the pair stays on one line, the language on screen set apart`, async ({ browser }) => {
      const { ctx, page } = await visitor(browser, { locale, viewport: PHONE });
      await load(page);
      const look = () =>
        [...document.querySelectorAll("footer a[data-lang-link]")].map((a) => {
          const cs = getComputedStyle(a);
          return { lang: a.getAttribute("hreflang"), top: Math.round(a.getBoundingClientRect().top), style: `${cs.fontWeight} ${cs.textDecorationLine} ${cs.color}` };
        });
      const before = await page.evaluate(look);
      expect(before[0].top, "one line").toBe(before[1].top);
      const mine = before.find((l) => l.lang === current);
      const other = before.find((l) => l.lang !== current);
      expect(mine.style, "the language on screen looks like the current one").not.toBe(other.style);
      // The look follows the language: switched with the other link, the two swap
      await page.locator(`footer a[data-lang-link][hreflang="${other.lang}"]`).click();
      await expect(page.locator("html")).toHaveAttribute("lang", other.lang);
      const after = await page.evaluate(look);
      expect(after.find((l) => l.lang === other.lang).style).toBe(mine.style);
      expect(after.find((l) => l.lang === current).style).toBe(other.style);
      await ctx.close();
    });
  }

  // privacy.html and terms.html hold both languages. Wrong: the English reader sent to the Spanish half of the terms
  test("the privacy and terms links open the half in the language on screen", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "en-US" });
    await load(page);
    const hrefs = () => ["privacy", "terms"].map((p) => document.querySelector(`footer a[href^="${p}.html"]`).getAttribute("href"));
    expect(await page.evaluate(hrefs)).toEqual(["privacy.html#en", "terms.html#en"]);
    await pressLanguage(page);
    await expect(page.locator("#btn-history")).toHaveText("Historial");
    expect(await page.evaluate(hrefs)).toEqual(["privacy.html", "terms.html"]);
    await ctx.close();
  });
});

test.describe("a choice the visitor made wins over the browser", () => {
  // Wrong: the browser's language put back over what the visitor pressed
  test("Spanish chosen on an English browser stays Spanish", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "en-US", store: { vt_lang: "es" } });
    expect(pick(await load(page))).toEqual(SPANISH);
    await ctx.close();
  });

  test("English chosen on a Spanish browser stays English", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "es-PE", store: { vt_lang: "en" } });
    expect(pick(await load(page))).toEqual(ENGLISH);
    await ctx.close();
  });

  // Wrong: any value kept under vt_lang read as Spanish, as before, so an English browser is shown Spanish
  test("a kept value that is not one of our languages is no choice", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "en-US", store: { vt_lang: "fr" } });
    expect(pick(await load(page))).toEqual(ENGLISH);
    await ctx.close();
  });

  // Wrong: the press not kept (the next load follows the browser again), or the guess kept on the first load
  test("pressing the button on an English first visit is kept, and wins on the next load", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "en-US" });
    const first = await load(page);
    expect(pick(first)).toEqual(ENGLISH);
    expect(first.stored).toBeNull();
    await pressLanguage(page);
    await expect(page.locator("#btn-history")).toHaveText("Historial");
    expect(await page.evaluate(() => [document.documentElement.lang, localStorage.getItem("vt_lang")])).toEqual(["es", "es"]);
    expect(pick(await load(page))).toEqual(SPANISH);
    await ctx.close();
  });

  // Wrong: the first load's guess persisted, so a visitor whose browser now says Spanish is kept in English
  test("with no choice made, the next load follows the browser again", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "en-US" });
    expect(pick(await load(page))).toEqual(ENGLISH);
    // The same profile, its browser now set to Spanish first (an init script added later runs after the first)
    await page.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, "languages", { configurable: true, get: () => ["es-PE", "es"] });
    });
    expect(pick(await load(page))).toEqual(SPANISH);
    await ctx.close();
  });

  // Wrong: the language read through storage only, so blocked site data (which throws on any read) means Spanish
  test("with site data blocked, an English browser is still shown English", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "en-GB", blocked: true });
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTApp && document.readyState !== "loading");
    const r = await page.evaluate(() => ({ lang: document.documentElement.lang, nav: document.getElementById("btn-history").textContent.trim() }));
    expect(r).toEqual({ lang: "en", nav: "History" });
    await ctx.close();
  });
});

test.describe("someone who practised in Spanish before this rule", () => {
  // Before it, nothing stored meant Spanish, and only the button wrote vt_lang. Wrong: a learner on a browser set to
  // English, practising in Spanish for weeks, wakes up to an English app
  test("practice kept in this browser keeps Spanish, and is taken for the choice it was", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "en-US", store: { vt_tour_v1: "1", vt_days_v1: PRACTICE_DAYS } });
    const r = await load(page);
    // The hero is the returning learner's own ("3 minutos y retomas"), not the first visit's
    expect(pick(r, RETURNING)).toEqual(pick(SPANISH, RETURNING));
    expect(r.stored).toBe("es");
    await ctx.close();
  });

  // Wrong: only the main profile's keys read, so a learner practising under a second profile is flipped
  test("practice under another profile counts too", async ({ browser }) => {
    const progress = JSON.stringify({ "s4-lip-trills": { completedCount: 1, lastScore: 7, history: [] } });
    const { ctx, page } = await visitor(browser, { locale: "en-US", store: { vt_tour_v1: "1", vt_prof_p2_vt_progress_v1: progress } });
    expect(pick(await load(page), RETURNING)).toEqual(pick(SPANISH, RETURNING));
    await ctx.close();
  });

  // Wrong: the carry-over judged by the app's keys being there (its first start writes several), so an English speaker
  // who opened the Spanish site once and left is held in Spanish: the visitor this change exists for
  test("a visit that left no practice is no reason for Spanish", async ({ browser }) => {
    const empty = JSON.stringify({ v: 1, days: {}, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true });
    const { ctx, page } = await visitor(browser, { locale: "en-US", store: { vt_tour_v1: "1", vt_settings_v1: "{}", vt_days_v1: empty, vt_progress_v1: "{}" } });
    const r = await load(page);
    expect(pick(r)).toEqual(ENGLISH);
    expect(r.stored).toBeNull();
    await ctx.close();
  });

  // Wrong: the carry-over run on every load, so an English first visitor who then practises is moved to Spanish
  test("practice made after the first load under this rule keeps the browser's language", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "en-US" });
    expect(pick(await load(page))).toEqual(ENGLISH);
    await page.evaluate((days) => localStorage.setItem("vt_days_v1", days), PRACTICE_DAYS);
    const again = await load(page);
    expect(pick(again, RETURNING)).toEqual(pick(ENGLISH, RETURNING));
    expect(again.stored).toBeNull();
    await ctx.close();
  });
});

test.describe("the first seconds of an English first visit", () => {
  /** True when the visible page shows the Spanish interface. */
  const spanishShowing = () => {
    const body = document.body;
    if (!body || getComputedStyle(body).visibility === "hidden") return false;
    if (!document.styleSheets.length) return false;
    const nav = document.getElementById("btn-history");
    return !!nav && nav.textContent.trim() === "Historial";
  };

  // Wrong: the hold before the first paint still reads only a stored choice (or only the browser), so the Spanish
  // markup is painted under English until the strings arrive, then swapped (a flash and a layout shift)
  for (const [locale, at] of [["en-US", "/"], ["es-PE", "/?lang=en"]]) {
    test(`no frame shows the Spanish page while the English strings are on their way (${locale} at ${at})`, async ({ browser }) => {
      const { ctx, page } = await visitor(browser, { locale, viewport: PHONE });
      await page.addInitScript(`window.__frames = 0; window.__spanishFrames = 0; (function sample() { window.__frames++; if ((${spanishShowing.toString()})()) window.__spanishFrames++; if (!window.VTApp) requestAnimationFrame(sample); })();`);
      await page.route("**/js/i18n-early.js*", async (route) => {
        await new Promise((r) => setTimeout(r, 900));
        await route.continue();
      });
      const r = await load(page, at);
      const frames = await page.evaluate(() => ({ all: window.__frames, spanish: window.__spanishFrames }));
      expect(frames.all, "control: frames were sampled while the page loaded").toBeGreaterThan(10);
      expect(frames.spanish, "frames that showed the Spanish interface").toBe(0);
      expect(pick(r)).toEqual(ENGLISH);
      await ctx.close();
    });
  }

  // The body is hidden while the page is held; the tab's title is not. Wrong: the Spanish title in the tab strip,
  // over an English page, until the strings come
  test("the tab's title is English while the page is held", async ({ browser }) => {
    const { ctx, page } = await visitor(browser, { locale: "en-US", viewport: PHONE });
    await page.addInitScript(() => {
      window.__heldTitles = [];
      (function sample() {
        if (document.documentElement?.classList.contains("vt-i18n-pending")) window.__heldTitles.push(document.title);
        if (!window.VTApp) requestAnimationFrame(sample);
      })();
    });
    await page.route("**/js/i18n-early.js*", async (route) => {
      await new Promise((r) => setTimeout(r, 900));
      await route.continue();
    });
    expect(pick(await load(page))).toEqual(ENGLISH);
    const titles = await page.evaluate(() => window.__heldTitles);
    expect(titles.length, "control: frames were sampled while the page was held").toBeGreaterThan(10);
    expect([...new Set(titles)]).toEqual([ENGLISH.title]);
    await ctx.close();
  });

  // Wrong: the English title left over the Spanish page when the strings never come, or cannot start
  for (const [what, routes] of [
    ["never come", { "**/js/i18n.js*": (route) => route.abort("failed"), "**/js/i18n-early.js*": (route) => route.abort("failed") }],
    ["cannot start", { "**/js/i18n.js*": (route) => route.fulfill({ contentType: "text/javascript", body: 'window.VTI18n = { init() { throw new Error("broken strings"); } };' }) }]
  ]) {
    test(`when the English strings ${what}, the Spanish page has its Spanish title`, async ({ browser }) => {
      const { ctx, page } = await visitor(browser, { locale: "en-US", viewport: PHONE });
      for (const [glob, handler] of Object.entries(routes)) await page.route(glob, handler);
      await page.goto(BASE + "/", { waitUntil: "commit" });
      await page.waitForSelector("body", { state: "attached" });
      await expect.poll(() => page.evaluate(() => document.documentElement.classList.contains("vt-i18n-pending")), { timeout: 12000 }).toBe(false);
      expect(await page.evaluate(() => [document.documentElement.lang, document.title])).toEqual(["es", SPANISH.title]);
      await ctx.close();
    });
  }

  // js/boot-head.js decides the language. Wrong: the app cannot start without it (js/i18n.js leaning on
  // window.VTLangPref), or the visitor's stored choice is lost with it
  for (const [store, want] of [[null, SPANISH], [{ vt_lang: "en" }, ENGLISH]]) {
    test(`without js/boot-head.js the app still starts, in ${nameOf(want)} (${store ? "English chosen" : "nothing stored"})`, async ({ browser }) => {
      const { ctx, page } = await visitor(browser, { locale: "en-US", store });
      await page.route("**/js/boot-head.js*", (route) => route.fulfill({ status: 404, body: "" }));
      expect(pick(await load(page))).toEqual(want);
      expect(await page.evaluate(() => window.VTLangPref)).toBeUndefined();
      await ctx.close();
    });
  }

  // Wrong: the hold put on every visitor, so a Spanish browser waits for strings it does not need. Watched from
  // before the first script: the hold is let go once the strings come, before the page has even finished parsing
  for (const [locale, held] of [["es-PE", false], ["en-US", true]]) {
    test(`a ${locale} browser's page is ${held ? "" : "not "}held for the English strings`, async ({ browser }) => {
      const { ctx, page } = await visitor(browser, { locale, viewport: PHONE });
      await page.addInitScript(() => {
        window.__held = false;
        new MutationObserver(() => {
          if (document.documentElement?.classList.contains("vt-i18n-pending")) window.__held = true;
        }).observe(document, { attributes: true, attributeFilter: ["class"], childList: true, subtree: true });
      });
      await load(page);
      expect(await page.evaluate(() => window.__held)).toBe(held);
      await ctx.close();
    });
  }
});

test.describe("the way out: the language button", () => {
  // Wrong: an aria-label ("Change language") as its name, so "click Español" (voice control) finds nothing and a
  // screen reader never says the one word a reader of the other language needs; or the word read in the page's voice
  for (const [locale, want, other] of [["en-US", "Español", "es"], ["es-PE", "English", "en"]]) {
    test(`on a ${locale} first visit it is named "${want}", in ${other}`, async ({ browser }) => {
      const { ctx, page } = await visitor(browser, { locale });
      await load(page);
      const more = page.locator("#btn-more");
      if (await more.isVisible()) await more.click();
      await expect(page.getByRole("button", { name: want, exact: true })).toBeVisible();
      expect(await page.locator("#btn-lang").getAttribute("lang")).toBe(other);
      await ctx.close();
    });
  }
});

test.describe("an English first visit on a phone", () => {
  /**
   * Every element drawn in the header and the start panel, with the part of it outside the window or its text
   * spilling out of its box. The stylesheet clips html and body sideways at 360 px and below, so the page's own
   * scroll width cannot show this: an element pushed off the edge is clipped, not scrollable.
   */
  const outside = () => {
    const out = [];
    const W = window.innerWidth;
    for (const el of document.querySelectorAll(".app-header *, #start-panel *")) {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      // Not drawn, or hidden for the eye and kept for screen readers (the brand's h1 on a phone: 1 px, clipped)
      if (r.width <= 1 || r.height <= 1 || cs.visibility !== "visible" || cs.clipPath === "inset(50%)") continue;
      const name = `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}.${String(el.className).split(" ")[0]} "${el.textContent.trim().slice(0, 24)}"`;
      if (r.left < -1 || r.right > W + 1) out.push(`${name} spans ${Math.round(r.left)}..${Math.round(r.right)} of ${W}`);
      const scrolls = /auto|scroll/.test(cs.overflowX);
      if (!scrolls && el.children.length === 0 && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0) out.push(`${name} text ${el.scrollWidth} in ${el.clientWidth}`);
    }
    return out;
  };

  for (const width of [320, 360, 390]) {
    // Wrong: an English word longer than the Spanish one pushes a header button, the hero or a track choice off the
    // window or out of its box, on the first screen a new English visitor sees
    test(`at ${width} px the header, the hero and the track choice fit`, async ({ browser }) => {
      for (const locale of ["en-US", "es-PE"]) {
        const { ctx, page } = await visitor(browser, { locale, viewport: { width, height: 740 } });
        await load(page);
        // The precondition: this is the first-visit screen, the track choice drawn
        await expect(page.locator("#track-pick")).toBeVisible();
        expect(await page.locator("#track-pick-q").textContent()).toBe(locale === "en-US" ? "What do you want to train?" : "¿Qué quieres entrenar?");
        expect(await page.evaluate(outside), `${locale} at ${width} px`).toEqual([]);
        // Control: the same oracle sees a track choice whose words do not fit
        await page.evaluate(() => {
          document.querySelector("#track-pick .track-pick-name").textContent = "Pneumonoultramicroscopicsilicovolcanoconiosis";
        });
        expect((await page.evaluate(outside)).length, "control: an unbreakable word is caught").toBeGreaterThan(0);
        await ctx.close();
      }
    });
  }
});
