// What the privacy page says about the language, against what the code does (privacy.html, js/boot-head.js).
//
// The app opens in the browser's language when the visitor has chosen none, keeps a choice the visitor makes, keeps
// Spanish once for someone who practised before the rule, and remembers for the tab a language an address named.
// The privacy page says so in both halves, and says that the site neither keeps nor sends the browser's list, while
// the browser itself sends it with every request (Accept-Language) and our server does not use it. Wrong behaviours
// rejected here:
//   - a half of the page that leaves out the browser's own header, or the tab's memory of an address;
//   - the worker starting to read Accept-Language, which the page says it does not use;
//   - js/boot-head.js writing a key the page does not account for.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

/** privacy.html's two halves: the Spanish one before <section lang="en">, the English one inside it. */
function halves(html) {
  const at = html.indexOf('<section lang="en"');
  if (at < 0) throw new Error('privacy.html has no <section lang="en">; this check needs updating');
  return { es: html.slice(0, at), en: html.slice(at) };
}

/** Every file under a directory, by relative path. */
function files(dir) {
  const out = [];
  for (const entry of readdirSync(new URL(`../../${dir}`, import.meta.url), { withFileTypes: true })) {
    const rel = `${dir}/${entry.name}`;
    if (entry.isDirectory()) out.push(...files(rel));
    else if (/\.(?:m?js|ts)$/.test(entry.name)) out.push(rel);
  }
  return out;
}

const READS_ACCEPT_LANGUAGE = /accept-language/i;

/** The storage writes in a script: ["localStorage LANG_KEY", ...]. */
function writes(js) {
  return [...js.matchAll(/\b(localStorage|sessionStorage)\.setItem\(\s*([A-Za-z_$][\w$]*|"[^"]*")/g)].map((m) => `${m[1]} ${m[2]}`);
}

// What each half has to say: the browser's list read here and neither kept nor sent, the browser's own header, the
// choice kept, the carry-over, the tab's memory
const SAYS = {
  es: ["los idiomas configurados en tu navegador", "no la guarda ni nos la envía", "Accept-Language", "se guarda en este navegador", "se guardó español", "esta pestaña lo recuerda"],
  en: ["languages your browser is set to", "neither keeps it nor sends it to us", "Accept-Language", "kept in this browser", "Spanish was kept", "this tab remembers it"]
};

/** The phrases a half of the page leaves out, its line breaks read as spaces. */
function unsaid(text, phrases) {
  const flat = text.replace(/\s+/g, " ");
  return phrases.filter((p) => !flat.includes(p));
}

test("both halves of the privacy page say how the language is chosen, kept and sent", () => {
  const page = halves(read("privacy.html"));
  for (const half of ["es", "en"]) assert.deepEqual(unsaid(page[half], SAYS[half]), [], `${half} half`);
});

test("the worker does not read the browser's languages, as the privacy page says", () => {
  const found = files("workers/entitlements/src").filter((f) => READS_ACCEPT_LANGUAGE.test(read(f)));
  assert.deepEqual(found, []);
});

test("js/boot-head.js keeps only what the privacy page accounts for", () => {
  // vt_lang: the visitor's choice (and Spanish, once, for practice from before the rule); vt_lang_seen_v1: that the
  // once has happened ("1", nothing about the visitor); vt_lang_link: the tab's memory of an address
  const js = read("js/boot-head.js");
  assert.deepEqual(writes(js).sort(), ["localStorage LANG_KEY", "localStorage SEEN_KEY", "sessionStorage LINK_KEY"]);
  assert.match(js, /var LANG_KEY = "vt_lang";/);
  assert.match(js, /var SEEN_KEY = "vt_lang_seen_v1";/);
  assert.match(js, /var LINK_KEY = "vt_lang_link";/);
});

test("control: the checks see a header read, a new write, a half that lost its sentence", () => {
  assert.ok(READS_ACCEPT_LANGUAGE.test('const al = request.headers.get("Accept-Language");'));
  assert.deepEqual(writes('localStorage.setItem("vt_langs_v1", list); sessionStorage.setItem(LINK_KEY, v);'), ['localStorage "vt_langs_v1"', "sessionStorage LINK_KEY"]);
  const { en, es } = halves(read("privacy.html"));
  const flatEn = en.replace(/\s+/g, " ");
  assert.deepEqual(unsaid(flatEn.replace("this tab remembers it", "this tab forgets it"), SAYS.en), ["this tab remembers it"]);
  assert.deepEqual(unsaid(es.replace(/Accept-Language/g, "una cabecera"), SAYS.es), ["Accept-Language"]);
  assert.throws(() => halves("<main></main>"), /needs updating/);
});
