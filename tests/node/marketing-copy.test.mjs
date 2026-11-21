// The marketing copy: what a search result, a shared link and a first visit say, held to the research that chose
// the words (docs/48-CUSTOMER-RESEARCH-AND-MESSAGING.md) and to the code that makes each promise true.
//
// Four rules, each with a control that shows the rule can fail:
//  1. A shared link and a search result show the words the page shows: the markup's <title>, description and
//     Open Graph tags are js/i18n.js's meta.title and meta.desc (WhatsApp and search engines never run the script).
//  2. No claim the evidence rules out (docs/48 section 8): no "AI", no health or memory promise, no outcome in a
//     number of days, no superlative, no age label, no promise that everyone sings in tune.
//  3. A claim the copy does make is backed by the code that keeps it true: "never an ad while you practise" by the
//     ads gate, "nothing to install" by a page that needs no install, "no time limit" by a free tier with no cap.
//  4. The words nine of nine think-aloud testers stumbled on stay out of the first visit, in both languages.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const ROOT = process.env.COPY_ROOT ? new URL(`file://${process.env.COPY_ROOT.replace(/\/?$/, "/")}`) : new URL("../../", import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, ROOT), "utf8");

function strings() {
  const win = {};
  vm.runInNewContext(read("js/i18n.js"), {
    window: win,
    document: { documentElement: {}, querySelectorAll: () => [], addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
    navigator: { language: "es" },
    console
  });
  return win.VTI18n.strings;
}
const S = strings();
const html = read("index.html");

/** The keys that sell: search and share text, the first visit's hero, and the Pro window's promises. */
export function marketingKeys(table) {
  return Object.keys(table).filter((k) =>
    /^(meta\.(title|desc)|start\.(kickerNew|subNew|step\d(sub)?(Offer)?)|first\.|pricing\.(sub|dream|proof\d|feat\.)|value\.anchor$)/.test(k)
  );
}

const attr = (src, re) => src.match(re)?.[1]?.replace(/\s+/g, " ").trim();

/** What the markup tells a crawler, before any script. */
export function shareText(src) {
  return {
    title: attr(src, /<title>([^<]*)<\/title>/),
    description: attr(src, /<meta\s+name="description"\s+content="([^"]*)"/),
    ogTitle: attr(src, /<meta\s+property="og:title"\s+content="([^"]*)"/),
    ogDescription: attr(src, /<meta\s+property="og:description"\s+content="([^"]*)"/)
  };
}

test("a shared link and a search result say what the page says (markup = meta.title and meta.desc, Spanish first paint)", () => {
  const es = S.es;
  assert.deepEqual(shareText(html), {
    title: es["meta.title"],
    description: es["meta.desc"],
    ogTitle: es["meta.title"],
    ogDescription: es["meta.desc"]
  });
});

test("control: a description edited in the markup alone is caught", () => {
  const drifted = html.replace(/(<meta\s+name="description"\s+content=")[^"]*/, "$1Práctica en casa");
  assert.equal(shareText(drifted).description, "Práctica en casa", "control: the edit is read");
  assert.notEqual(shareText(drifted).description, S.es["meta.desc"]);
});

test("search and share text fit before a results page cuts it (title 60, description 160 characters), in both languages", () => {
  for (const lang of ["es", "en"]) {
    assert.ok(S[lang]["meta.title"].length <= 60, `${lang} meta.title is ${S[lang]["meta.title"].length} characters`);
    assert.ok(S[lang]["meta.desc"].length <= 160, `${lang} meta.desc is ${S[lang]["meta.desc"].length} characters`);
    assert.ok(S[lang]["meta.desc"].length >= 70, `${lang} meta.desc says something (${S[lang]["meta.desc"].length})`);
  }
});

/*
 * Claims the evidence rules out. Each line names why (docs/48 section 8, and the desk research it cites).
 * Spanish and English are both checked, and every key that sells.
 */
export const BANNED = [
  [/\bIA\b|inteligencia artificial|\bAI\b|artificial intelligence/i, "nothing here is AI: a crowded and untrue claim (FTC Operation AI Comply, 2024)"],
  [/\bcura\b|curar|terapia|therapy|\bcure\b|tratamiento|treatment|memoria|\bmemory\b|cerebro|\bbrain\b|demencia|dementia|parkinson|alzh/i, "no health or memory claim (FTC v. Lumosity, 2016)"],
  [/\ben \d+ d[ií]as\b|\bin \d+ days\b|profesional en|professional in/i, "no outcome in a number of days: habits take 18-254 days (Lally 2010)"],
  [/garantiza|guarantee|el mejor|the best|(?<!\p{L})únic[ao]s?(?!\p{L})|the only|#1|n[uú]mero 1/iu, "no superlative the product cannot prove (INDECOPI, EU UCPD)"],
  [/adictiv|addictive|racha|streak/i, "no streak pressure in the pitch: broken streaks cost engagement (Silverman & Barasch 2023)"],
  [/adulto mayor|personas mayores|para mayores|tercera edad|abuelit|nuestros mayores|\bsenior|elderly|ancian|jubilad|retiree|golden years/i, "no age label in the pitch: people 50+ feel younger than their age and turn down age-labelled offers (Tepper 1994; Rubin & Berntsen 2006)"],
  [/a tu edad|at your age|esp[ií]ritu joven|si[eé]ntete joven|voz joven|young voice|rejuvenec|rejuvenat|anti-?aging|antiedad/i, "no youth as the goal, no benevolent ageism (la Caixa ageism glossary; a health claim too)"],
  [/casi todas las apps|a diferencia de otras|almost every|unlike other apps/i, "no market-wide comparison the product cannot prove (Peru DL 1044 art. 8.3 and 12.2)"],
  [/clase particular ≈|lesson ≈|≈ (el|a) año/i, "no lesson-equals-a-year anchor: a Lima lesson is S/ 66 against S/ 119.90 a year (docs/35)"],
  [/ganaste|you won|solo hoy|today only|oferta termina|offer ends/i, "no prize or countdown wording: the scam patterns older adults are warned against (FTC, FBI IC3 2025)"],
  [/cualquiera puede cantar afinado|anyone can sing in tune|nadie (es )?desafina|nobody is tone-deaf/i, "about 1.5% are amusic and training does not help them (Peretz & Vuvan 2017)"]
];

/** Every [lang, key, why] where a selling string makes a ruled-out claim. */
export function bannedClaims(table, banned = BANNED) {
  const out = [];
  for (const lang of Object.keys(table)) {
    for (const k of marketingKeys(table[lang])) {
      for (const [re, why] of banned) if (re.test(String(table[lang][k]))) out.push([lang, k, why]);
    }
  }
  return out;
}

test("no selling string makes a claim the evidence rules out, in either language", () => {
  assert.ok(marketingKeys(S.es).length > 30, `control: the selling keys are found (${marketingKeys(S.es).length})`);
  assert.deepEqual(bannedClaims(S), []);
});

test("control: each ruled-out claim is caught, and plain copy is not", () => {
  const plant = (text) => bannedClaims({ es: { "meta.desc": text } }).map((x) => x[2]);
  assert.equal(plant("Tu coach con IA").length, 1);
  assert.equal(plant("Mejora tu memoria cantando").length, 1);
  assert.equal(plant("Canta afinado en 7 días").length, 1);
  assert.equal(plant("La única app de canto gratis").length, 1);
  assert.equal(plant("¡No rompas tu racha!").length, 1);
  assert.equal(plant("Pensado para el adulto mayor").length, 1);
  assert.equal(plant("Rejuvenece tu voz").length, 1);
  assert.equal(plant("Casi todas las apps de canto limitan la práctica").length, 1);
  assert.equal(plant("Una clase particular ≈ el año de Pro").length, 1);
  assert.equal(plant("¡Ganaste un mes gratis!").length, 1);
  assert.equal(plant("Casi nadie desafina").length, 1);
  assert.deepEqual(plant(S.es["meta.desc"]), [], "control: today's description passes");
  assert.equal(bannedClaims({ en: { "first.why": "An AI coach" } }).length, 1, "English is checked too");
  assert.equal(bannedClaims({ en: { "home.other": "An AI coach" } }).length, 0, "control: a key that does not sell is not");
});

/*
 * Claims the copy makes, and the code that keeps each true. If the code changes, the claim must go with it.
 */
export const BACKED = [
  {
    claim: /nunca ver[aá]s anuncios mientras practicas|never see ads while you practi[sc]e/i,
    file: "js/ads.js",
    proof: /function isPracticeActive\(\)[\s\S]*?if \(isPracticeActive\(\)\) return false;/,
    why: "the ads gate refuses a slot while practice is live (tests/ads.spec.js 'practiceLive blocks')"
  },
  {
    claim: /sin l[ií]mite de minutos|no daily time limit|sin l[ií]mite de tiempo|no time limit/i,
    file: "js/billing.js",
    proof: /all_exercises:\s*true/,
    why: "the free tier answers yes to every exercise (qa/check-tiers.mjs, tests/tier-values.spec.js)"
  },
  {
    claim: /sin instalar nada|nothing to install/i,
    file: "index.html",
    proof: /<meta name="viewport" content="width=device-width, initial-scale=1" \/>/,
    why: "the studio is a web page for phones; nothing is downloaded from a store"
  },
  {
    claim: /sin tarjeta|no card/i,
    file: "terms.html",
    proof: /El plan gratis no cuesta nada ni pide tarjeta/,
    why: "the terms say the free plan asks for no card; the copy may say so only while the terms do"
  },
  {
    claim: /tu voz se queda en tu dispositivo|your voice stays on your device/i,
    file: "privacy.html",
    proof: /El audio se procesa en\s+tu dispositivo\.\s+No enviamos tu voz a un servidor nuestro\./,
    why: "the privacy page says the audio is processed on the device and never sent to our server; the copy may say so only while it does"
  },
  {
    claim: /no necesitas cuenta|sin cuenta|no account needed/i,
    file: "js/storage.js",
    proof: /localStorage/,
    why: "progress is kept in the browser (js/storage.js); an account only carries it to other devices"
  }
];

/** Every [lang, key, why] whose claim has lost the code that backs it. */
export function unbackedClaims(table, read, backed = BACKED) {
  const out = [];
  for (const b of backed) {
    const src = read(b.file);
    for (const lang of Object.keys(table)) {
      for (const k of marketingKeys(table[lang])) {
        if (b.claim.test(String(table[lang][k])) && !b.proof.test(src)) out.push([lang, k, b.why]);
      }
    }
  }
  return out;
}

test("every promise the copy makes is backed by the code that keeps it true", () => {
  const made = BACKED.filter((b) => marketingKeys(S.es).some((k) => b.claim.test(S.es[k])));
  assert.equal(made.length, BACKED.length, "control: the copy makes each listed claim, so each check is live");
  assert.deepEqual(unbackedClaims(S, read), []);
});

test("control: a claim whose backing is removed is caught", () => {
  const noGate = (file) => (file === "js/ads.js" ? read(file).replace("if (isPracticeActive()) return false;", "") : read(file));
  assert.deepEqual(unbackedClaims({ es: { "pricing.sub": S.es["pricing.sub"] } }, noGate).map((x) => x[1]), ["pricing.sub"]);
  const capped = (file) => (file === "js/billing.js" ? read(file).replace(/all_exercises:\s*true/, "all_exercises: false") : read(file));
  assert.deepEqual(unbackedClaims({ es: { "meta.desc": S.es["meta.desc"] } }, capped).map((x) => x[1]), ["meta.desc"]);
});

/*
 * Plain words. In the think-aloud on today's screens (qa/customer-research/data/think-aloud-today.json) nine of nine
 * testers could not say what "Diseño del sitio · A · Clásico" or "Trinos de labios" meant, and four stumbled on
 * "afinador" and "sostenidos". The first visit and the Pro window keep the plain words the research chose.
 */
export function jargon(table) {
  const out = [];
  const say = (lang, key, test, why) => {
    const v = table[lang]?.[key];
    if (v != null && test(String(v))) out.push([lang, key, why]);
  };
  for (const lang of ["es", "en"]) {
    say(lang, "sv.label", (v) => /diseño del sitio|site design/i.test(v), "a site-builder word, not a view");
    for (const k of ["sv.a", "sv.b"]) say(lang, k, (v) => /^[AB] ·/.test(v), "an experiment's arm letter shown to visitors");
    say(lang, "first.trills", (v) => !/\(brrr\)/.test(v), "the exercise is named without saying what it sounds like");
    say(lang, "start.step2sub", (v) => /afinador|tuner/i.test(v), "'tuner' read as a gadget to buy");
    say(lang, "pricing.feat.pro_insights", (v) => /sostenidos|holds/i.test(v), "'holds' is a coach's word for long notes");
    say(lang, "start.step3sub", (v) => !/cuenta|account/i.test(v), "the first visit must say no account is needed");
  }
  return out;
}

test("the first visit and the Pro window keep the plain words the think-aloud chose, in both languages", () => {
  assert.deepEqual(jargon(S), []);
});

test("control: each stumbling word is caught when it comes back", () => {
  const back = { es: { ...S.es, "sv.a": "A · Clásico", "first.trills": "trinos de labios" }, en: { ...S.en, "pricing.feat.pro_insights": "how your holds are going" } };
  assert.deepEqual(
    jargon(back).map((x) => `${x[0]} ${x[1]}`),
    ["es sv.a", "es first.trills", "en pricing.feat.pro_insights"]
  );
});

test("each selling string is in both languages, and the English one is English", () => {
  const es = marketingKeys(S.es);
  const en = new Set(marketingKeys(S.en));
  assert.deepEqual(es.filter((k) => !en.has(k)), [], "a selling key with no English");
  const spanishLeft = [...en].filter((k) => /[áéíóúñ¿¡]|\b(gratis|tu voz|ejercicios)\b/i.test(S.en[k]) && !/solfège/.test(S.en[k]));
  assert.deepEqual(spanishLeft, [], "English selling strings with Spanish words left in");
});
