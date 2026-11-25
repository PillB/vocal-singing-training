// One address per language, for search engines (index.html's hreflang links, js/boot-head.js window.VTLangPref).
//
// The app opens in the browser's language when the visitor has chosen none. Google renders a page with an English
// browser and empty storage (Search Central: no Accept-Language, storage cleared between loads; measured en-US
// during rendering), so the one bare address would be indexed in English and Spanish searches in Peru would get an
// English title or nothing. Google's documented answer is one URL per language with reciprocal hreflang, and the
// adapting address as x-default. Wrong behaviours rejected here:
//   - an alternate missing, duplicated, relative, outside <head> (where a script would have to put it: not a
//     documented method), or for a language the page cannot show;
//   - an address Google is told is Spanish that the app opens in English for a crawler (?lang= not read, or read
//     below the stored choice or the browser's language);
//   - hreflang on the bilingual pages, whose two halves share one URL (a #fragment is not a URL to Google);
//   - footer links, or a bilingual page's "back to the app", that lead to an address no alternate names, or to the
//     other language's;
//   - the language kept for the tab (vt_lang_link) outranking a choice, outliving the tab, or holding anything else;
//   - a code that names no language (und) taken for one; Chrome's and Safari's lists for one person disagreeing.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const SITE = "https://pillb.github.io/vocal-singing-training/";
const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
/** index.html's <title>: its own text and the English it keeps beside it (data-en). */
const TITLE = (() => {
  const m = read("index.html").match(/<title data-en="([^"]*)">([^<]*)<\/title>/) || [];
  const text = (v) => String(v ?? "").replace(/&amp;/g, "&");
  return { en: text(m[1]), es: text(m[2]) };
})();
/** js/i18n.js's strings, as the app has them. */
const STRINGS = (() => {
  const win = { addEventListener() {} };
  vm.runInNewContext(read("js/i18n.js"), { window: win });
  return win.VTI18n.strings;
})();
/** Markup without its comments: a tag commented out is not on the page. */
const uncommented = (html) => html.replace(/<!--[\s\S]*?-->/g, "");

/** The rel=alternate links in a page's <head>: [{ lang, href }]. */
export function alternates(html) {
  const src = uncommented(html);
  const end = src.indexOf("</head>");
  const head = end === -1 ? "" : src.slice(0, end);
  const out = [];
  for (const [tag] of head.matchAll(/<link\b[^>]*>/g)) {
    if (!/\brel="alternate"/.test(tag)) continue;
    out.push({ lang: (tag.match(/\bhreflang="([^"]*)"/) || [])[1], href: (tag.match(/\bhref="([^"]*)"/) || [])[1] });
  }
  return out;
}

/** What is wrong with a page's set against the one it must carry; [] when nothing. */
export function problems(list, site = SITE) {
  const want = { es: `${site}?lang=es`, en: `${site}?lang=en`, "x-default": site };
  const out = [];
  for (const [lang, href] of Object.entries(want)) {
    const got = list.filter((a) => a.lang === lang);
    if (got.length !== 1) out.push(`${lang}: ${got.length} links`);
    else if (got[0].href !== href) out.push(`${lang}: ${got[0].href}, not ${href}`);
  }
  for (const a of list) if (!Object.hasOwn(want, a.lang)) out.push(`unexpected hreflang ${a.lang}`);
  return out;
}

/** The footer's language links in a page: [{ hreflang, lang, href }]. */
export function languageLinks(html) {
  const out = [];
  for (const [tag] of uncommented(html).matchAll(/<a\b[^>]*\bdata-lang-link\b[^>]*>/g)) {
    const attr = (name) => (tag.match(new RegExp(`\\s${name}="([^"]*)"`)) || [])[1];
    out.push({ hreflang: attr("hreflang"), lang: attr("lang"), href: attr("href") });
  }
  return out;
}

/**
 * What is wrong with a page's language links: one per alternate language, in that language, leading (from the
 * site's root and from index.html, the two addresses the app is served at) to the address its hreflang names.
 */
export function linkProblems(links, list) {
  const out = [];
  for (const alt of list.filter((a) => a.lang !== "x-default")) {
    const got = links.filter((l) => l.hreflang === alt.lang);
    if (got.length !== 1) {
      out.push(`${alt.lang}: ${got.length} links`);
      continue;
    }
    if (got[0].lang !== alt.lang) out.push(`${alt.lang}: its name is marked lang=${got[0].lang}`);
    for (const from of [SITE, `${SITE}index.html`]) {
      const to = new URL(got[0].href, from).href;
      if (to !== alt.href) out.push(`${alt.lang}: from ${from} leads to ${to}, not ${alt.href}`);
    }
  }
  return out;
}

/** A bilingual page's links back to the app (./...) below its header: [{ half, href, hreflang }]. */
export function backLinks(html) {
  const src = uncommented(html);
  const main = src.slice(Math.max(0, src.indexOf("<main")));
  const split = main.indexOf('<section lang="en"');
  const out = [];
  for (const m of main.matchAll(/<a\b[^>]*\shref="(\.\/[^"]*)"[^>]*>/g)) {
    out.push({ half: split !== -1 && m.index > split ? "en" : "es", href: m[1], hreflang: (m[0].match(/\shreflang="([^"]*)"/) || [])[1] });
  }
  return out;
}

/** What is wrong with a page's ways back: one per half, to that half's language's address (from the page itself). */
export function backProblems(links, page, list) {
  const out = [];
  for (const half of ["es", "en"]) {
    const got = links.filter((l) => l.half === half);
    if (got.length !== 1) {
      out.push(`${page} ${half} half: ${got.length} ways back`);
      continue;
    }
    const want = list.find((a) => a.lang === half)?.href;
    const to = new URL(got[0].href, SITE + page).href;
    if (to !== want) out.push(`${page} ${half} half leads to ${to}, not ${want}`);
    if (got[0].hreflang !== half) out.push(`${page} ${half} half: hreflang=${got[0].hreflang}`);
  }
  return out;
}

/** A Storage over a plain object, which it writes through. */
function memory(mem) {
  const keys = () => Object.keys(mem);
  return {
    getItem: (k) => (Object.hasOwn(mem, k) ? mem[k] : null),
    setItem: (k, v) => void (mem[k] = String(v)),
    removeItem: (k) => void delete mem[k],
    key: (i) => keys()[i] ?? null,
    get length() {
      return keys().length;
    }
  };
}

/**
 * js/boot-head.js run in a bare browser: an address, a browser language list, what is stored and what this tab
 * keeps. Returns the language it resolves, whether it held the page for English, and what it stored in each.
 */
export function boot({ search = "", languages = ["en-US"], language = languages?.[0], store = {}, session = {} }) {
  const mem = { ...store };
  const tab = { ...session };
  const storage = memory(mem);
  const tabStorage = memory(tab);
  const classes = new Set();
  // index.html's <title>, with the English one it keeps beside its own
  const attrs = { "data-en": TITLE.en };
  const title = { textContent: TITLE.es, getAttribute: (k) => attrs[k] ?? null, setAttribute: (k, v) => void (attrs[k] = String(v)) };
  const html = { lang: "es", style: { setProperty() {} }, classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), contains: (c) => classes.has(c) }, appendChild() {}, removeChild() {} };
  const win = { navigator: { languages: languages ?? undefined, language }, addEventListener() {}, localStorage: storage, sessionStorage: tabStorage };
  win.top = win;
  win.self = win;
  const ctx = {
    window: win,
    navigator: win.navigator,
    localStorage: storage,
    sessionStorage: tabStorage,
    document: {
      documentElement: html,
      body: null,
      createElement: () => ({ style: {}, offsetWidth: 0, clientWidth: 0 }),
      querySelector: (sel) => (sel === "title[data-en]" ? title : null),
      addEventListener() {},
      removeEventListener() {}
    },
    MutationObserver: function () {
      this.observe = () => {};
      this.disconnect = () => {};
    },
    performance: { now: () => 0, getEntriesByType: () => [] },
    history: { state: null },
    location: { hash: "", search, href: SITE + search },
    URLSearchParams,
    setTimeout: () => 0
  };
  vm.runInNewContext(read("js/boot-head.js"), ctx);
  return { lang: win.VTLangPref.resolve(), held: classes.has("vt-i18n-pending"), htmlLang: html.lang, title: title.textContent, store: mem, session: tab };
}

test("index.html's head names one address per language, and the adapting one as x-default", () => {
  assert.deepEqual(problems(alternates(read("index.html"))), []);
});

test("the alternates' site is the deployed one the live check visits", () => {
  // A move to another domain has to move both; left behind, the hreflang links would point at the old site
  assert.ok(read("tests/live-pages.spec.js").includes(`"${SITE}"`), "tests/live-pages.spec.js no longer visits " + SITE);
});

test("each address renders the language it is announced in, for a crawler and over a stored choice", () => {
  for (const { lang, href } of alternates(read("index.html"))) {
    const search = new URL(href).search;
    // A crawler: English browser, nothing stored
    const crawler = boot({ search, languages: ["en-US"] });
    // A visitor whose stored choice and browser both say the other language
    const other = lang === "es" ? "en" : "es";
    const visitor = boot({ search, languages: [other === "en" ? "en-GB" : "es-PE"], store: { vt_lang: other } });
    if (lang === "x-default") {
      assert.equal(crawler.lang, "en", "x-default adapts: an English browser with nothing stored");
      assert.equal(visitor.lang, other, "x-default adapts: the stored choice");
      // The stored choice over a browser that says otherwise, so a rule that skips the choice cannot pass
      assert.equal(boot({ search, languages: ["en-US"], store: { vt_lang: "es" } }).lang, "es", "x-default: the choice over an English browser");
      continue;
    }
    assert.equal(crawler.lang, lang, `${href} for a crawler`);
    assert.equal(crawler.held, lang === "en", `${href}: held for its English strings exactly when it is English`);
    assert.equal(visitor.lang, lang, `${href} over a stored ${other}`);
    assert.equal(visitor.store.vt_lang, other, `${href} is shown, never stored`);
  }
});

test("an address naming another language, or none, decides nothing", () => {
  assert.equal(boot({ search: "?lang=fr", languages: ["en-US"] }).lang, "en");
  assert.equal(boot({ search: "?lang=", languages: ["es-PE"] }).lang, "es");
  assert.equal(boot({ search: "?lang=EN", languages: ["es-PE"] }).lang, "en");
  assert.equal(boot({ search: "?ab_layout=b&lang=es", languages: ["en-US"] }).lang, "es");
});

test("the bilingual pages carry no hreflang: their halves share one URL", () => {
  for (const page of ["guide.html", "privacy.html", "terms.html", "admin.html"]) {
    assert.deepEqual(alternates(read(page)), [], page);
  }
});

test("control: the checker sees a missing, relative, duplicated, misplaced or foreign alternate", () => {
  const link = (lang, href) => `<link rel="alternate" hreflang="${lang}" href="${href}" />`;
  const page = (...links) => `<html><head>${links.join("")}</head><body></body></html>`;
  const good = [link("es", `${SITE}?lang=es`), link("en", `${SITE}?lang=en`), link("x-default", SITE)];
  assert.deepEqual(problems(alternates(page(...good))), []);
  assert.notDeepEqual(problems(alternates(page(good[1], good[2]))), [], "es missing");
  assert.notDeepEqual(problems(alternates(page(link("es", "?lang=es"), good[1], good[2]))), [], "relative");
  assert.notDeepEqual(problems(alternates(page(...good, good[0]))), [], "duplicated");
  assert.notDeepEqual(problems(alternates(page(good[1], good[2]).replace("</body>", `${good[0]}</body>`))), [], "in the body");
  assert.notDeepEqual(problems(alternates(page(...good, link("es-419", `${SITE}?lang=es`)))), [], "a language variety it does not have");
  assert.notDeepEqual(problems(alternates(page(link("es", `${SITE}#es`), good[1], good[2]))), [], "a fragment");
  assert.notDeepEqual(problems(alternates(page(`<!-- ${good[0]} -->`, good[1], good[2]))), [], "commented out");
});

test("the footer links each language's address, from either address the app is served at", () => {
  const html = read("index.html");
  assert.deepEqual(linkProblems(languageLinks(html), alternates(html)), []);
});

test("control: the link checker sees a relative query, a missing link, a name in the wrong language", () => {
  const html = read("index.html");
  const links = languageLinks(html);
  const alts = alternates(html);
  const swap = (lang, change) => links.map((l) => (l.hreflang === lang ? { ...l, ...change } : l));
  // From index.html, "?lang=en" is index.html?lang=en: an address the hreflang links do not name
  assert.notDeepEqual(linkProblems(swap("en", { href: "?lang=en" }), alts), [], "a bare query");
  assert.notDeepEqual(linkProblems(swap("en", { href: "index.html?lang=en" }), alts), [], "index.html's own address");
  assert.notDeepEqual(linkProblems(links.filter((l) => l.hreflang !== "es"), alts), [], "es missing");
  assert.notDeepEqual(linkProblems(swap("es", { lang: "en" }), alts), [], "Español marked as English");
  assert.notDeepEqual(linkProblems(swap("es", { href: "./?lang=en" }), alts), [], "a link to the other language");
  const commented = html.replace(/(<a href="\.\/\?lang=en"[^>]*>English<\/a>)/, "<!-- $1 -->");
  assert.notEqual(commented, html, "control: the English footer link is where this control expects it");
  assert.notDeepEqual(linkProblems(languageLinks(commented), alts), [], "commented out");
});

test("an address's language holds for the rest of the tab, under a choice", () => {
  const spanishBrowser = { languages: ["es-PE", "es"] };
  const landed = boot({ ...spanishBrowser, search: "?lang=en" });
  assert.equal(landed.lang, "en");
  assert.equal(landed.session.vt_lang_link, "en", "the tab keeps the address's language");
  assert.equal(landed.store.vt_lang, undefined, "a link someone else wrote is not the visitor's choice");
  const tab = { session: landed.session };
  // The guide's and privacy page's "back to the app" (./), a checkout's return
  assert.equal(boot({ ...spanishBrowser, ...tab, search: "" }).lang, "en", "back to ./");
  assert.equal(boot({ ...spanishBrowser, ...tab, search: "?billing=success" }).lang, "en", "back from a checkout");
  assert.equal(boot({ ...spanishBrowser, ...tab, store: { vt_lang: "es" } }).lang, "es", "a choice outranks it");
  // The same browser's storage, a fresh tab's: only what the tab kept is gone
  assert.equal(boot({ ...spanishBrowser, store: landed.store, search: "" }).lang, "es", "a new tab asks the browser again");
  assert.equal(boot({ ...spanishBrowser, session: { vt_lang_link: "fr" } }).lang, "es", "only es or en is kept");
  // The other address, later in the same tab, is the one kept
  assert.equal(boot({ ...spanishBrowser, ...tab, search: "?lang=es" }).session.vt_lang_link, "es");
  // A guess is never kept, per tab or for good
  const guessed = boot({ languages: ["en-US"], search: "" });
  assert.deepEqual([guessed.session.vt_lang_link, guessed.store.vt_lang], [undefined, undefined]);
});

test("a code that names no language is no language named", () => {
  // ISO 639-2 und (undetermined), mul, mis, zxx; a platform with no locale writes und (Java's Locale.ROOT)
  for (const code of ["und", "mul", "mis", "zxx"]) {
    assert.equal(boot({ languages: [code] }).lang, "es", `${code} alone: the site's own`);
    assert.equal(boot({ languages: [code, "de"] }).lang, "en", `${code}, then German: German was named`);
  }
  assert.equal(boot({ languages: ["und", "en-US"] }).lang, "en");
});

test("a browser with no language list falls back on its one language", () => {
  assert.equal(boot({ languages: null, language: "en-GB" }).lang, "en");
  assert.equal(boot({ languages: null, language: "es-PE" }).lang, "es");
  assert.equal(boot({ languages: [], language: "en-GB" }).lang, "en", "an empty list as well");
  assert.equal(boot({ languages: null, language: undefined }).lang, "es", "nothing at all: the site's own");
});

test("one person, two browsers: Chrome's default list and Safari's single language agree", () => {
  // Chrome's default Accept-Language for a UI language (IDS_ACCEPT_LANGUAGES in its locale files) appends
  // en-US,en to most; Safari exposes navigator.languages as the first preferred language alone
  const chrome = {
    "pt-BR": ["pt-BR", "pt", "en-US", "en"],
    "de-DE": ["de-DE", "de", "en-US", "en"],
    "fr-FR": ["fr-FR", "fr", "en-US", "en"],
    "hi-IN": ["hi-IN", "hi", "en-US", "en"],
    "fil-PH": ["fil", "fil-PH", "tl", "en-US", "en"],
    "ja-JP": ["ja", "en-US", "en"],
    "es-419": ["es-419", "es"],
    "en-GB": ["en-GB", "en-US", "en"]
  };
  for (const [tag, list] of Object.entries(chrome)) {
    assert.equal(boot({ languages: [tag] }).lang, boot({ languages: list }).lang, tag);
  }
  assert.equal(boot({ languages: ["pt-BR"] }).lang, "es", "Portuguese reads Spanish");
  assert.equal(boot({ languages: ["de-DE"] }).lang, "en");
});

test("each half of a bilingual page leads back to the app in its own language", () => {
  // A reader of the English half of the guide, opened beside an exercise in a tab of its own (which keeps nothing of
  // the first tab's), went back to the app in their browser's language
  const alts = alternates(read("index.html"));
  for (const page of ["guide.html", "privacy.html", "terms.html"]) {
    assert.deepEqual(backProblems(backLinks(read(page)), page, alts), [], page);
  }
});

test("control: the way-back checker sees a bare ./, a way back missing, the other language's address", () => {
  const alts = alternates(read("index.html"));
  const html = read("privacy.html");
  const swap = (from, to) => {
    const out = html.replace(from, to);
    assert.notEqual(out, html, `control: ${from} is in privacy.html`);
    return backProblems(backLinks(out), "privacy.html", alts);
  };
  assert.notDeepEqual(swap('href="./?lang=en" hreflang="en"', 'href="./" hreflang="en"'), [], "a bare ./");
  assert.notDeepEqual(swap('href="./?lang=en" hreflang="en"', 'href="./?lang=es" hreflang="es"'), [], "the other language");
  assert.notDeepEqual(swap(/<p class="privacy-back"><a href="\.\/\?lang=es"[^>]*>[^<]*<\/a><\/p>/, ""), [], "missing");
});

test("an English visitor's tab shows the English title while the page is held for its strings", () => {
  // The body is hidden while held; the tab strip is not
  assert.equal(TITLE.en, STRINGS.en["meta.title"], "index.html's data-en is the English title js/i18n.js writes");
  assert.equal(TITLE.es, STRINGS.es["meta.title"], "the markup's own title is the Spanish one");
  assert.equal(boot({ languages: ["en-US"] }).title, TITLE.en, "held: the English title");
  assert.equal(boot({ languages: ["es-PE"] }).title, TITLE.es, "not held: the markup's own");
  assert.equal(boot({ languages: ["es-PE"], search: "?lang=en" }).title, TITLE.en, "the English address on a Spanish browser");
});
