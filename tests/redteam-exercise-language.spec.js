/**
 * Red-team QA, batch "exercise-language": one language on the exercise screen.
 *
 *  - The start toast names the practice mode ("En vivo · Afinar nota"), never
 *    its internal id ("En vivo · trill Solfege").
 *  - A language switch during a take reaches the mode's panel once the take
 *    stops (its headings and review text), not only the chrome around it.
 *  - Accessible names and tooltips follow the page language: the loop panel,
 *    the progression and piano-mode selects, Arpegio, Piano automático, the
 *    octave number, the hold readout, the Pro sparkline, the payment rails.
 *  - The Spanish piano panel has no English: song cards, progression names
 *    and descriptions, chip titles. The hot-apply toasts (octave, sustain,
 *    auto piano, seconds) say what changed, not a key.
 *  - A language switch on an exercise that has not started keeps its open
 *    panels and the scroll position.
 *  - s3's A/B stanza tally is visible next to the +1 buttons.
 *  - The cut exercise title carries its full name as a tooltip.
 *  - s26's "altura de A" label does not run into the instruction text.
 *  - The microphone notice follows a language switch.
 *
 * Titles marked [L] depend on audio or timers: run them inside the browser
 * lock as well. Toast cases leave sessionStorage.vt_e2e unset (toast() is
 * silent under it).
 */
const { test, expect } = require("@playwright/test");
const { voiceSource } = require("./helpers/voice");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const PHONE = { width: 390, height: 844 };
const LAPTOP = { width: 1280, height: 800 };
const LOCAL = /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:)/;

/* ------------------------------------------------------------------ setup */

/** Language and tour seen, before the app loads. */
async function seed(page, { lang = "es", storage = {} } = {}) {
  await page.addInitScript(
    ({ lang, storage }) => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", lang);
        Object.entries(storage).forEach(([k, v]) => (v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v)));
      } catch {
        /* ignore */
      }
    },
    { lang, storage }
  );
  await page.route((url) => !LOCAL.test(url.href), (route) => route.abort("blockedbyclient"));
}

/** A microphone that gives a fresh near-silent stream on every request. */
async function silentMic(page) {
  await page.addInitScript(() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    async function fakeGUM() {
      const ctx = new AC();
      const dest = ctx.createMediaStreamDestination();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.00001;
      osc.connect(g);
      g.connect(dest);
      osc.start();
      return dest.stream;
    }
    if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
    navigator.mediaDevices.getUserMedia = fakeGUM;
  });
}

/** getUserMedia fails as a browser does: NotAllowedError (refused) or NotFoundError (no device). */
async function failingMic(page, kind) {
  const name = kind === "deny" ? "NotAllowedError" : "NotFoundError";
  await page.addInitScript((name) => {
    if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
    navigator.mediaDevices.getUserMedia = async () => {
      const e = new Error(name === "NotAllowedError" ? "Permission denied" : "Requested device not found");
      e.name = name;
      throw e;
    };
  }, name);
}

/** The synthetic singer/speaker of qa/synthetic-voice.js as the microphone. */
async function voiceMic(page) {
  await page.addInitScript({ content: voiceSource() });
}

/** Every toast shown, in order. */
async function watchToasts(page) {
  await page.addInitScript(() => {
    window.__toasts = [];
    const hook = () => {
      const t = document.getElementById("toast");
      if (!t) return;
      new MutationObserver(() => {
        const s = (t.textContent || "").trim();
        if (s && t.classList.contains("show") && window.__toasts[window.__toasts.length - 1] !== s) window.__toasts.push(s);
      }).observe(t, { attributes: true, childList: true, characterData: true, subtree: true });
    };
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hook);
    else hook();
  });
}

async function settle(page, ms = 350) {
  await page.waitForTimeout(ms);
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
}

async function ready(page) {
  await page.waitForFunction(() => !!window.VTApp && !!window.VTI18n && !!document.querySelector("#exercise-list .card-ex"), null, { timeout: 15000 });
}

/** Open an exercise by its address (no tour, no primer). */
async function openEx(page, id) {
  await page.goto(`${BASE}/#ejercicio/${id}`, { waitUntil: "domcontentloaded" });
  await waitEx(page, id);
}

async function waitEx(page, id) {
  await page.waitForFunction(
    (x) => {
      const b = document.getElementById("btn-practice-start");
      return window.VTApp?.getState?.().exercise?.id === x && b && b.getBoundingClientRect().width > 8;
    },
    id,
    { timeout: 15000 }
  );
  await settle(page, 400);
}

const waitLive = (page, ms = 8000) =>
  page.waitForFunction(() => document.body.classList.contains("practice-live"), null, { timeout: ms });

/** Switch the page language with the header button (through "Más" on a phone). */
async function switchLang(page) {
  const lang = await page.evaluate(() => window.VTI18n.lang);
  if (await page.locator("#btn-lang").isVisible().catch(() => false)) await page.click("#btn-lang");
  else {
    if (await page.locator("#btn-more").isVisible().catch(() => false)) await page.click("#btn-more");
    if (await page.locator("#btn-lang").isVisible().catch(() => false)) await page.click("#btn-lang");
    else await page.evaluate(() => document.getElementById("btn-lang").click());
  }
  await page.waitForFunction((l) => window.VTI18n.lang !== l, lang, { timeout: 5000 });
  await settle(page, 500);
}

/** Texts (text nodes, aria-label, title) inside the mode's panel and cue. */
function panelStrings(page) {
  return page.evaluate(() => {
    const out = new Set();
    const add = (s) => {
      const v = String(s || "").replace(/\s+/g, " ").trim();
      if (v.length >= 3 && !/^[\d\s.,:%/·×+−-]+$/.test(v)) out.add(v);
    };
    document.querySelectorAll(".mode-panel, #mode-cue").forEach((root) => {
      const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      while (w.nextNode()) add(w.currentNode.nodeValue);
      root.querySelectorAll("[aria-label],[title]").forEach((e) => {
        add(e.getAttribute("aria-label"));
        add(e.getAttribute("title"));
      });
    });
    return [...out];
  });
}

/* ------------------------------------------------------------------ B1: mode names in the start toast */

// Exercises whose mode had no entry in modeDisplayName (23 exercises, 19 modes).
const UNNAMED_MODE_EXERCISES = [
  "v3-soft-palate", "v4-articulation-pen", "v6-connect", "v7-record-review", "v8-fluency-metaphors", "v14-pace-variation",
  "v15-gestures", "v16-facial-expression", "v17-strategic-concision", "v18-story-peak", "v19-authority-close", "v20-energy-match",
  "s17-jaw-neck-release", "s18-costal-breath", "s19-soft-palate-surprise", "s20-five-vowels", "s21-chest-resonance",
  "s22-mid-voice-hola", "s23-mask-ya", "s24-nana-high", "s25-zone-tour", "s26-placement-compare", "s27-lip-trill-solfege"
];

test.describe("the start toast names the mode", () => {
  test.describe.configure({ timeout: 360000 });

  for (const lang of ["es", "en"]) {
    test(`[L] no practice-mode id reaches the toast (${lang})`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await seed(page, { lang });
      await silentMic(page);
      await watchToasts(page);
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await ready(page);
      const all = await page.evaluate(() => [...(window.VT_EXERCISES.vocal || []), ...(window.VT_EXERCISES.singing || [])].map((e) => e.id));
      const bad = [];
      const seen = [];
      for (const id of all) {
        await page.evaluate((i) => {
          window.__toasts.length = 0;
          return window.VTApp.openExercise(i);
        }, id);
        await waitEx(page, id);
        // The piano is not what this case is about (and s19's silent first step cannot start it)
        await page.evaluate(() => {
          const c = document.getElementById("chk-auto-piano");
          if (c) c.checked = false;
        });
        await page.click("#btn-practice-start");
        const live = await waitLive(page, 6000).then(() => true, () => false);
        const info = await page.evaluate(() => {
          const ex = window.VTApp.getState().exercise;
          const mode = (window.VT_PRACTICE_PROFILES && window.VT_PRACTICE_PROFILES[ex.id]?.mode) || "";
          return { toasts: window.__toasts.slice(), mode };
        });
        if (live) {
          const t = info.toasts.find((s) => /^(En vivo|Live) · /.test(s));
          seen.push(id);
          if (!t) bad.push(`${id}: no "En vivo/Live" toast in ${JSON.stringify(info.toasts)}`);
          else {
            const name = t.replace(/^(En vivo|Live) · /, "").replace(/ · (grabando|recording)$/, "");
            if (/[a-z] [A-Z][a-z]/.test(name) || (info.mode && name === info.mode.replace(/([A-Z])/g, " $1").trim()))
              bad.push(`${id} (${info.mode}): "${t}"`);
          }
          await page.click("#btn-practice-stop").catch(() => {});
          await settle(page, 150);
        }
      }
      expect(bad, bad.join("\n")).toEqual([]);
      // The ones that had no name must all have started
      for (const stem of UNNAMED_MODE_EXERCISES) {
        expect(seen, `${stem} started live`).toContain(stem);
      }
    });
  }
});

/* ------------------------------------------------------------------ B3: a switch during a take reaches the panel */

test.describe("a language switch during a take", () => {
  test.describe.configure({ timeout: 120000 });

  for (const id of ["v3-soft-palate", "s27-lip-trill-solfege", "s3-song-stanzas", "s2-solfege-chords"]) {
    test(`[L] the ${id} panel reads in the new language after Detener`, async ({ page, browser }) => {
      await page.setViewportSize(LAPTOP);
      await seed(page, { lang: "es" });
      await silentMic(page);
      await openEx(page, id);
      const es = await panelStrings(page);
      // The same exercise opened fresh in English: what the panel should read
      const p2 = await browser.newPage({ viewport: LAPTOP });
      await seed(p2, { lang: "en" });
      await silentMic(p2);
      await openEx(p2, id);
      const en = await panelStrings(p2);
      await p2.close();
      const esOnly = es.filter((s) => !en.includes(s));
      expect(esOnly.length, "the idle panel has Spanish text of its own").toBeGreaterThan(0);

      await page.click("#btn-practice-start");
      await waitLive(page);
      await page.waitForTimeout(1200);
      await switchLang(page);
      await page.click("#btn-practice-stop");
      await settle(page, 700);
      const after = await panelStrings(page);
      const left = after.filter((s) => esOnly.includes(s));
      expect(left, `Spanish left in the panel after Stop: ${JSON.stringify(left)}`).toEqual([]);
      // Its new-language words and its review text are there
      expect(after.filter((s) => en.includes(s)).length, "the panel's English headings").toBeGreaterThan(0);
      expect(after.join(" ").length, "the panel still has its text").toBeGreaterThan(20);
    });
  }
});

// The guided pictures' own buttons ("Siguiente →", "Guardar", "Tramo anterior") come from exercise-viz.js's
// L(). Their words reach the panel's swap table once that L() reports to VTModeRecord (see HANDOFF).
test.describe("a language switch during a take: guided pictures", () => {
  test.describe.configure({ timeout: 120000 });

  for (const id of ["v4-articulation-pen", "v15-gestures", "s17-jaw-neck-release", "s19-soft-palate-surprise"]) {
    test(`[L] the ${id} picture's buttons read in the new language after Detener`, async ({ page, browser }) => {
      await page.setViewportSize(LAPTOP);
      await seed(page, { lang: "es" });
      await silentMic(page);
      await openEx(page, id);
      const hooked = await page.evaluate(async () => (await (await fetch("js/exercise-viz.js")).text()).includes("VTModeRecord"));
      test.fixme(!hooked, "needs exercise-viz.js's L() to call VTModeRecord (exercise-take's file; edit in HANDOFF)");
      await page.evaluate(() => {
        const c = document.getElementById("chk-auto-piano");
        if (c) c.checked = false;
      });
      const es = await panelStrings(page);
      const p2 = await browser.newPage({ viewport: LAPTOP });
      await seed(p2, { lang: "en" });
      await silentMic(p2);
      await openEx(p2, id);
      const en = await panelStrings(p2);
      await p2.close();
      const esOnly = es.filter((x) => !en.includes(x));
      await page.click("#btn-practice-start");
      await waitLive(page);
      await page.waitForTimeout(1200);
      await switchLang(page);
      await page.click("#btn-practice-stop");
      await settle(page, 700);
      const left = (await panelStrings(page)).filter((x) => esOnly.includes(x));
      expect(left, `Spanish left in the picture after Stop: ${JSON.stringify(left)}`).toEqual([]);
    });
  }
});

/* ------------------------------------------------------------------ B4, B5: attributes in the page language */

/** aria-label and title values that exist only in the other language's table. */
function otherLanguageAttrs(page) {
  return page.evaluate(() => {
    const S = window.VTI18n.strings;
    const norm = (s) => String(s || "").replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    const set = (l) => new Set(Object.values(S[l]).map(norm));
    const es = set("es");
    const en = set("en");
    const here = window.VTI18n.lang;
    const other = here === "es" ? en : es;
    const mine = here === "es" ? es : en;
    const bad = [];
    document.querySelectorAll("[aria-label],[title]").forEach((el) => {
      for (const a of ["aria-label", "title"]) {
        const v = el.getAttribute(a);
        if (!v) continue;
        const n = norm(v);
        if (n.length >= 3 && other.has(n) && !mine.has(n)) bad.push(`${el.id ? "#" + el.id : el.tagName.toLowerCase() + (el.className ? "." + String(el.className).split(" ")[0] : "")} ${a}="${v}"`);
      }
    });
    return bad;
  });
}

test.describe("attributes follow the page language", () => {
  test.describe.configure({ timeout: 90000 });

  test("English: loop panel, selects and octave title are English", async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await seed(page, { lang: "en" });
    await openEx(page, "s2-solfege-chords");
    const r = await page.evaluate(() => ({
      today: document.getElementById("loop-today")?.getAttribute("aria-label"),
      prog: document.getElementById("sel-progression")?.getAttribute("aria-label"),
      mode: document.getElementById("sel-play-mode")?.getAttribute("aria-label"),
      oct: document.getElementById("oct-label")?.title,
      rails: document.getElementById("pricing-rails")?.getAttribute("aria-label")
    }));
    expect(r.today).toBe("Practice");
    expect(r.prog).toBe("Chord progression");
    expect(r.mode).toBe("Piano mode");
    expect(r.oct).toBe("Base octave (original material)");
    expect(r.rails).toBe("Payment method");
  });

  test("English loaded straight onto a lip-trill exercise shows the English octave title; a switch follows", async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await seed(page, { lang: "en" });
    await openEx(page, "s4-lip-trills");
    expect(await page.evaluate(() => document.getElementById("oct-label").title)).toBe("Base octave (original material)");
    await switchLang(page);
    expect(await page.evaluate(() => document.getElementById("oct-label").title)).toBe("Octava base (material original)");
    await switchLang(page);
    expect(await page.evaluate(() => document.getElementById("oct-label").title)).toBe("Base octave (original material)");
  });

  test("Spanish: Arpegio, Piano automático, hold readout, Pro sparkline and payment rails are Spanish", async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await seed(page, { lang: "es" });
    await openEx(page, "s1-vocal-fry");
    const r = await page.evaluate(() => ({
      arp: document.getElementById("chk-arpeggio")?.getAttribute("aria-label"),
      auto: document.getElementById("opt-auto-piano")?.getAttribute("title"),
      hold: document.getElementById("hold-display")?.getAttribute("title"),
      spark: document.getElementById("pro-spark")?.getAttribute("title"),
      rails: document.getElementById("pricing-rails")?.getAttribute("aria-label"),
      oneNote: document.getElementById("chk-one-note")?.closest("label")?.title,
      arpTitle: document.getElementById("chk-arpeggio")?.closest("label")?.title,
      sustain: document.getElementById("chk-sustain")?.closest("label")?.title
    }));
    // The visible "Arpegio" names the box: no English aria-label on top of it
    expect(r.arp == null || r.arp === "Arpegio", `arpeggio aria-label ${r.arp}`).toBe(true);
    expect(r.auto).toBe("Piano automático");
    expect(r.hold).toBe("Sostenido");
    expect(r.spark).toBe("28 días");
    expect(r.rails).toBe("Método de pago");
    for (const [k, v] of Object.entries({ oneNote: r.oneNote, arpTitle: r.arpTitle, sustain: r.sustain })) {
      expect(v, `${k} title is one language, not "A / B"`).not.toMatch(/ \/ /);
    }
    expect(r.oneNote).toBe("1 nota a la vez");
    // and the English page says the English
    await switchLang(page);
    const e = await page.evaluate(() => ({
      auto: document.getElementById("opt-auto-piano")?.getAttribute("title"),
      hold: document.getElementById("hold-display")?.getAttribute("title"),
      spark: document.getElementById("pro-spark")?.getAttribute("title"),
      oneNote: document.getElementById("chk-one-note")?.closest("label")?.title
    }));
    expect(e).toEqual({ auto: "Auto piano", hold: "Hold", spark: "28 days", oneNote: "One note at a time" });
  });

  for (const lang of ["es", "en"]) {
    test(`no aria-label or title is in the other language: Practicar, s4, s1, Historial, pricing (${lang})`, async ({ page }) => {
      await page.setViewportSize(LAPTOP);
      await seed(page, { lang });
      await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
      await ready(page);
      const bad = {};
      bad.home = await otherLanguageAttrs(page);
      for (const id of ["s4-lip-trills", "s1-vocal-fry"]) {
        await page.evaluate((i) => window.VTApp.openExercise(i), id);
        await waitEx(page, id);
        bad[id] = await otherLanguageAttrs(page);
      }
      // Historial with a few takes
      await page.evaluate(() => {
        const days = [0, 1, 2, 5];
        days.forEach((d, i) => {
          window.VTStorage.saveExerciseResult("s9-pitch-match", { score: 3 + (i % 3), metrics: {}, durationSec: 180 });
        });
      });
      await page.evaluate(() => window.VTApp.setView("history"));
      await settle(page, 600);
      bad.history = await otherLanguageAttrs(page);
      await page.evaluate(() => window.VTApp.openPricing());
      await settle(page, 600);
      bad.pricing = await otherLanguageAttrs(page);
      const flat = Object.entries(bad).flatMap(([k, v]) => v.map((x) => `${k}: ${x}`));
      expect(flat, flat.join("\n")).toEqual([]);
    });
  }
});

/* ------------------------------------------------------------------ the ES piano panel, the hot-apply toasts */

const EN_ONLY =
  /\b(Song [AB]|mid-low|friendly key|Use stanzas|copyrighted|Play song progression|classic pop|root leaps|leap progression|horizontal jumps|Wide jumps|Octave span|Modal colors|Ladder leaps|color changes|open voicings|pop leap)\b/;

test.describe("the Spanish piano panel", () => {
  test.describe.configure({ timeout: 90000 });

  test("s3: song cards, progression names, descriptions and chip titles are Spanish", async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await seed(page, { lang: "es" });
    await openEx(page, "s3-song-stanzas");
    await page.click("#btn-toggle-piano");
    await settle(page, 700);
    const r = await page.evaluate(() => {
      const vis = (el) => el && !el.closest("[hidden]") && el.getBoundingClientRect().width > 0;
      const songs = document.getElementById("songs-row");
      const desc = document.getElementById("chord-desc");
      return {
        songs: vis(songs) ? songs.innerText.replace(/\s+/g, " ").trim() : null,
        desc: vis(desc) ? desc.textContent.trim() : null,
        chips: [...document.querySelectorAll("#prog-buttons .prog-btn")].filter(vis).map((b) => `${b.textContent} | ${b.title}`),
        options: [...document.querySelectorAll("#sel-progression option")].map((o) => `${o.textContent} | ${o.title}`),
        hold: document.getElementById("hold-display")?.getAttribute("title")
      };
    });
    expect(r.songs, "song cards are shown").toBeTruthy();
    expect(r.songs).not.toMatch(EN_ONLY);
    expect(r.songs).toMatch(/Canción A/);
    if (r.desc) expect(r.desc).not.toMatch(EN_ONLY);
    for (const c of r.chips) expect(c).not.toMatch(EN_ONLY);
    for (const o of r.options) expect(o).not.toMatch(EN_ONLY);
    expect(r.hold).not.toBe("Hold");
    // English still reads as it did
    await switchLang(page);
    const en = await page.evaluate(() => document.getElementById("songs-row").innerText.replace(/\s+/g, " ").trim());
    expect(en).toMatch(/Song A \(mid-low range\)/);
    expect(en).toMatch(/Play song progression/);
  });

  test("s2: the chips, the select and the description after playing are Spanish", async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await seed(page, { lang: "es" });
    await silentMic(page);
    await openEx(page, "s2-solfege-chords");
    await page.click("#btn-toggle-piano");
    await settle(page, 600);
    const r = await page.evaluate(() => ({
      chips: [...document.querySelectorAll("#prog-buttons .prog-btn")].map((b) => `${b.textContent} | ${b.title}`),
      options: [...document.querySelectorAll("#sel-progression option")].map((o) => `${o.textContent} | ${o.title}`),
      desc: document.getElementById("chord-desc")?.textContent || ""
    }));
    expect(r.chips.length).toBeGreaterThan(3);
    for (const c of [...r.chips, ...r.options, r.desc]) expect(c).not.toMatch(EN_ONLY);
    // Pick another chip: the description under the chips changes and stays Spanish
    await page.locator("#prog-buttons .prog-btn").nth(1).click();
    const d2 = await page.evaluate(() => document.getElementById("chord-desc").textContent);
    expect(d2).not.toMatch(EN_ONLY);
    // The language switch relabels the open select and the chips in place
    await switchLang(page);
    const en = await page.evaluate(() => ({
      chips: [...document.querySelectorAll("#prog-buttons .prog-btn")].map((b) => b.title),
      options: [...document.querySelectorAll("#sel-progression option")].map((o) => o.textContent),
      sel: document.getElementById("sel-progression").value
    }));
    expect(en.chips.join(" ")).toMatch(/classic pop/);
    expect(en.options.join(" ")).toMatch(/Wide jumps/);
    expect(en.sel, "the choice survives the relabel").toBeTruthy();
  });

  test("[L] the Spanish names do not widen the chord select: the live top rail stays one row, as in English", async ({ page, browser }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    const rail = async (pg, lang) => {
      await seed(pg, { lang });
      await silentMic(pg);
      await openEx(pg, "s3-song-stanzas");
      await pg.click("#btn-practice-start");
      await waitLive(pg);
      await pg.waitForTimeout(800);
      const h = await pg.evaluate(() => Math.round(document.getElementById("hud-top-rail").getBoundingClientRect().height));
      await pg.click("#btn-practice-stop").catch(() => {});
      return h;
    };
    const es = await rail(page, "es");
    const p2 = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const en = await rail(p2, "en");
    await p2.close();
    expect(es, `top rail height es ${es} / en ${en}`).toBeLessThanOrEqual(en + 2);
  });

  test("[L] the description after ▶ is Spanish (no 'sustain', 'one note')", async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await seed(page, { lang: "es" });
    await silentMic(page);
    await openEx(page, "s2-solfege-chords");
    await page.click("#btn-toggle-piano");
    await settle(page, 400);
    await page.click("#btn-play-prog");
    await page.waitForFunction(() => /·/.test(document.getElementById("chord-desc")?.textContent || "") && /\d+s/.test(document.getElementById("chord-desc").textContent), null, { timeout: 8000 });
    const d = await page.evaluate(() => document.getElementById("chord-desc").textContent);
    expect(d).not.toMatch(/sustain|one note|arpeggio|chords|per note/i);
    expect(d).not.toMatch(EN_ONLY);
    await page.evaluate(() => window.VTPiano && window.VTPiano.stopAll());
  });
});

test.describe("the hot-apply toasts", () => {
  test.describe.configure({ timeout: 120000 });

  for (const [vp, lang, size] of [["phone", "es", PHONE], ["laptop", "en", LAPTOP], ["laptop", "es", LAPTOP], ["phone", "en", PHONE]]) {
    test(`[L] octave, sustain, auto piano and seconds say what changed (${vp} ${lang})`, async ({ page }) => {
      await page.setViewportSize(size);
      await seed(page, { lang });
      await silentMic(page);
      await watchToasts(page);
      await openEx(page, "s2-solfege-chords");
      await page.click("#btn-practice-start");
      await waitLive(page);
      await page.waitForTimeout(2500);
      const act = async (fn) => {
        await page.evaluate(fn);
        await page.waitForTimeout(1600);
      };
      await act(() => document.getElementById("btn-oct-down").click());
      await act(() => {
        const c = document.getElementById("chk-sustain");
        c.checked = !c.checked;
        c.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await act(() => {
        const s = document.getElementById("sustain-sec");
        s.value = "5";
        s.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await act(() => {
        const c = document.getElementById("chk-auto-piano");
        c.checked = false;
        c.dispatchEvent(new Event("change", { bubbles: true }));
      });
      await act(() => {
        const c = document.getElementById("chk-auto-piano");
        c.checked = true;
        c.dispatchEvent(new Event("change", { bubbles: true }));
      });
      const toasts = await page.evaluate(() => window.__toasts);
      await page.click("#btn-practice-stop").catch(() => {});
      const applied = toasts.filter((s) => /^(Opciones aplicadas|Options applied) · /.test(s));
      expect(applied.length, `hot-apply toasts in ${JSON.stringify(toasts)}`).toBeGreaterThanOrEqual(3);
      for (const s of applied) {
        const what = s.replace(/^(Opciones aplicadas|Options applied) · /, "");
        expect(what, s).not.toMatch(/^(oct:|sustain$|auto$|\d+s$)/);
        expect(what, s).not.toMatch(/:/);
        if (lang === "es") expect(s, s).not.toMatch(/\b(sustain|options|applied|octave|seconds)\b/i);
      }
      expect(toasts.filter((s) => /\boct:/.test(s))).toEqual([]);
    });
  }
});

/* ------------------------------------------------------------------ the idle switch keeps panels and scroll */

test.describe("a language switch on an exercise that has not started", () => {
  test.describe.configure({ timeout: 90000 });

  for (const [name, size, panels] of [
    ["phone", PHONE, ["piano"]],
    ["laptop", LAPTOP, ["guide", "metrics", "piano"]]
  ]) {
    test(`${name}: open panels and the scroll position stay`, async ({ page }) => {
      await page.setViewportSize(size);
      await seed(page, { lang: "es" });
      await openEx(page, "s9-pitch-match");
      for (const p of panels) await page.click(`#btn-toggle-${p}`);
      await settle(page, 300);
      await page.evaluate(() => scrollTo({ top: 700, behavior: "instant" }));
      await settle(page, 300);
      const st = () =>
        page.evaluate(() => ({
          guide: document.querySelector("#btn-toggle-guide").getAttribute("aria-expanded"),
          metrics: document.querySelector("#btn-toggle-metrics").getAttribute("aria-expanded"),
          piano: document.querySelector("#btn-toggle-piano").getAttribute("aria-expanded"),
          y: Math.round(scrollY),
          lang: window.VTI18n.lang
        }));
      const a = await st();
      expect(a.y, "page is scrolled").toBeGreaterThan(300);
      await switchLang(page);
      await settle(page, 400);
      const b = await st();
      expect(b.lang).toBe("en");
      for (const p of panels) expect(b[p], `${p} panel stays open`).toBe("true");
      expect(Math.abs(a.y - b.y), `scroll ${a.y} -> ${b.y}`).toBeLessThanOrEqual(120);
      // and the panel's own words are now English
      expect(await page.evaluate(() => document.querySelector("#btn-toggle-guide").textContent.trim())).toMatch(/Hide|Show|steps|tips/i);
    });
  }
});

/* ------------------------------------------------------------------ cross-13: the stanza tally */

test.describe("s3 stanza tally", () => {
  test.describe.configure({ timeout: 90000 });

  for (const [vp, lang, size] of [["phone", "es", PHONE], ["laptop", "en", LAPTOP]]) {
    for (const live of [false, true]) {
      test(`${live ? "[L] live" : "idle"}: B +1 shows "B 1/5" next to the button (${vp} ${lang})`, async ({ page }) => {
        await page.setViewportSize(size);
        await seed(page, { lang });
        await silentMic(page);
        await openEx(page, "s3-song-stanzas");
        if (live) {
          await page.click("#btn-practice-start");
          await waitLive(page);
          await page.waitForTimeout(800);
        }
        const text = () => page.evaluate(() => document.getElementById("view-exercise").innerText.replace(/\s+/g, " "));
        expect(await text()).not.toMatch(/B\s*1\s*\/\s*5/);
        const btn = page.locator("#mode-hud [data-better]");
        await expect(btn).toBeVisible();
        await btn.click();
        await settle(page, 300);
        expect(await text()).toMatch(/B\s*1\s*\/\s*5/);
        // the tally sits in the buttons' row and is announced
        const near = await page.evaluate(() => {
          const lab = document.querySelector("#mode-hud .pz-lab[aria-live]");
          const b = document.querySelector("#mode-hud [data-better]");
          if (!lab || !b) return null;
          const r1 = lab.getBoundingClientRect();
          const r2 = b.getBoundingClientRect();
          return { w: r1.width, sameRow: lab.parentElement === b.parentElement, dy: Math.abs(r1.top + r1.height / 2 - (r2.top + r2.height / 2)) };
        });
        expect(near, "the tally is in the row of the buttons").toBeTruthy();
        expect(near.w).toBeGreaterThan(10);
        expect(near.sameRow).toBe(true);
        if (live) await page.click("#btn-practice-stop").catch(() => {});
      });
    }
  }
});

/* ------------------------------------------------------------------ B8: the cut title */

test.describe("the exercise title", () => {
  test.describe.configure({ timeout: 90000 });

  test("a title cut on a phone carries its full name, and follows a language switch", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await seed(page, { lang: "en" });
    await openEx(page, "s9-pitch-match");
    const read = () =>
      page.evaluate(() => {
        const t = document.getElementById("ex-title");
        const ex = window.VTApp.getState().exercise;
        return { text: t.textContent.trim(), title: t.getAttribute("title"), full: window.VTI18n.exTitle(ex), cut: t.scrollWidth > t.clientWidth + 1 };
      });
    const a = await read();
    expect(a.cut, "the title is cut on a 390 px phone").toBe(true);
    expect(a.title).toBe(a.full);
    await switchLang(page);
    const b = await read();
    expect(b.title).toBe(b.full);
    expect(b.title).not.toBe(a.title);
    // A second exercise opened from here
    await page.evaluate(() => window.VTApp.openExercise("s2-solfege-chords"));
    await waitEx(page, "s2-solfege-chords");
    const c = await read();
    expect(c.title).toBe(c.full);
  });
});

/* ------------------------------------------------------------------ s26 label overlap */

test.describe("s26 A/B", () => {
  test.describe.configure({ timeout: 120000 });

  for (const lang of ["es", "en"]) {
    test(`[L] "altura de A" does not run into the instruction (phone ${lang})`, async ({ page }) => {
      await page.setViewportSize(PHONE);
      await seed(page, { lang });
      await voiceMic(page);
      await openEx(page, "s26-placement-compare");
      await page.click("#btn-practice-start");
      await waitLive(page);
      await page.evaluate(() => window.__VTVoice.play("abTakes"));
      // Take A ends by itself after 2 s of quiet
      await page.waitForTimeout(7500);
      const res = await page.evaluate(async () => {
        const P = CanvasRenderingContext2D.prototype;
        const orig = P.fillText;
        // One draw = the texts written before the next microtask checkpoint, so two draws at
        // different canvas sizes are never mixed in one comparison
        let frame = 0;
        let open = false;
        const log = [];
        P.fillText = function (t, x, y, maxW) {
          if (!open) {
            open = true;
            frame++;
            queueMicrotask(() => {
              open = false;
            });
          }
          const m = this.measureText(String(t));
          let w = m.width;
          if (maxW != null && maxW < w) w = maxW;
          const left = this.textAlign === "center" ? x - w / 2 : this.textAlign === "right" || this.textAlign === "end" ? x - w : x;
          const asc = m.actualBoundingBoxAscent || 8;
          const desc = m.actualBoundingBoxDescent || 2;
          log.push({ frame, c: this.canvas, t: String(t), x0: left, x1: left + w, y0: y - asc, y1: y + desc });
          return orig.apply(this, arguments);
        };
        await new Promise((r) => setTimeout(r, 1500));
        P.fillText = orig;
        const label = log.filter((e) => /^(altura de A|A's pitch)$/.test(e.t));
        const hits = [];
        for (const L of label) {
          for (const o of log) {
            if (o === L || o.t === L.t || o.frame !== L.frame || o.c !== L.c || !o.t.trim()) continue;
            const ix = Math.min(L.x1, o.x1) - Math.max(L.x0, o.x0);
            const iy = Math.min(L.y1, o.y1) - Math.max(L.y0, o.y0);
            if (ix > 2 && iy > 2) hits.push(`"${L.t}" overlaps "${o.t}" by ${Math.round(ix)}x${Math.round(iy)} px`);
          }
        }
        return { labels: label.length, hits: [...new Set(hits)] };
      });
      await page.click("#btn-practice-stop").catch(() => {});
      expect(res.labels, "take A finished: the 'A's pitch' label is drawn").toBeGreaterThan(0);
      expect(res.hits).toEqual([]);
    });
  }
});

/* ------------------------------------------------------------------ the microphone notice follows a switch */

test.describe("the microphone notice", () => {
  test.describe.configure({ timeout: 90000 });

  /** Notice text as the other language's table would say it. */
  const noticeOpen = (page) =>
    page.evaluate(() => {
      const box = document.getElementById("mic-blocked");
      return { shown: !!box && !box.hidden, text: (document.getElementById("mic-blocked-text")?.textContent || "").trim(), retry: document.getElementById("btn-mic-retry")?.textContent.trim() };
    });

  for (const [id, label] of [["s2-solfege-chords", "the piano still plays"], ["v3-soft-palate", "nothing runs"]]) {
    test(`a refused mic: the notice reads in the new language (${label})`, async ({ page }) => {
      await page.setViewportSize(LAPTOP);
      await seed(page, { lang: "es" });
      await failingMic(page, "deny");
      await openEx(page, id);
      await page.click("#btn-practice-start");
      await page.waitForFunction(() => !document.getElementById("mic-blocked").hidden, null, { timeout: 8000 });
      const es = await noticeOpen(page);
      expect(es.text).toMatch(/micrófono/i);
      await switchLang(page);
      const en = await noticeOpen(page);
      expect(en.shown, "the notice stays open").toBe(true);
      expect(en.text).toMatch(/microphone/i);
      expect(en.text).not.toMatch(/micrófono|candado/i);
      expect(en.retry).toBe("Try again");
      await switchLang(page);
      const back = await noticeOpen(page);
      expect(back.shown).toBe(true);
      expect(back.text).toBe(es.text);
      expect(back.retry).toBe(es.retry);
    });
  }

  test("no microphone found: the notice reads in the new language", async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await seed(page, { lang: "es" });
    await failingMic(page, "missing");
    await openEx(page, "s2-solfege-chords");
    test.fixme(
      await page.evaluate(() => !window.VTI18n.strings.es["mic.missing.partial"]),
      "needs exercise-take's mic.missing.* and mic.runs.* keys (qa/exercise-take); runs once that branch is merged"
    );
    await page.click("#btn-practice-start");
    await page.waitForFunction(() => !document.getElementById("mic-blocked").hidden, null, { timeout: 8000 });
    const es = await noticeOpen(page);
    expect(es.text).toMatch(/No encontramos un micrófono/);
    await switchLang(page);
    const en = await noticeOpen(page);
    expect(en.shown).toBe(true);
    expect(en.text).toMatch(/^No microphone found/);
    expect(en.text).not.toMatch(/micrófono|piano sigue|reloj/i);
    await switchLang(page);
    expect((await noticeOpen(page)).text).toBe(es.text);
  });
});
