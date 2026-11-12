/**
 * Exercise copy, the guide, the README and three stale specs: what the red-team
 * QA pass found, one case per finding.
 *
 * - s18 (breathing, in every Esencial routine and in the Vocal class) asked for
 *   a breath held "to set the fold closure" and a cough-like push, which is the
 *   hard onset s12 teaches against, and said the diaphragm cannot be controlled
 *   at will, with two percentages nobody could source.
 * - The guide said nothing about pain, hoarseness or when to see a doctor.
 * - Imagery stated as fact or as a promise: v4 "resistance training", s17
 *   "lowers resistance to muscle lengthening", s19 and s22 "goes flat" (English),
 *   s23 "sinuses, forehead" as a place the sound is made, v13 level 1 "almost
 *   whisper", a forced whisper being what a tired voice should not do.
 * - A typo (monotomía), "este" missing from v11's Spanish filler list, a
 *   teacher's name in a code comment, and a README that promised more than the
 *   privacy page (and still named Stripe as the global card rail).
 * - Three specs that failed for reasons of their own: a helper that sent an
 *   open exercise home, a wait with its timeout in the wrong slot, a check that
 *   expected options folded behind "Piano ▾" to be visible, and a forensics
 *   run that wrote into a folder a fresh checkout does not have and clicked
 *   "← Practicar" on a phone.
 */
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const ROOT = path.join(__dirname, "..");
const PHONE = { width: 390, height: 844 };
const LAPTOP = { width: 1280, height: 800 };

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

/** Open the site in `lang`, quiet room, tour done. */
async function boot(page, lang = "es") {
  await page.addInitScript((l) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", l);
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
  }, lang);
  await page.goto(BASE + "/?e2e", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise && !!window.VTI18n);
}

/** One exercise's learner-facing text in `lang`, the way the screen reads it (VTI18n.exField). */
async function exText(page, lang, id) {
  return page.evaluate(
    ([l, x]) => {
      const I = window.VTI18n;
      const prev = I.lang;
      I.lang = l;
      const ex = [...window.VT_EXERCISES.vocal, ...window.VT_EXERCISES.singing].find((e) => e.id === x);
      const out = {};
      for (const f of ["original", "research", "steps", "tips", "mistakes"]) out[f] = I.exField(ex, f);
      I.lang = prev;
      return out;
    },
    [lang, id]
  );
}

const flat = (t) => [t.original, t.research, ...t.steps, ...t.tips, ...t.mistakes].join("\n");

/** What a negated mention ("no susurro", "not a whisper") leaves out of a whisper check. */
const withoutNegatedWhisper = (s) => s.replace(/\(no susurro\)|, not a whisper/gi, "");

test.describe("s18: breathing without a held glottis, and an honest diaphragm line", () => {
  for (const lang of ["es", "en"]) {
    test(`${lang}: the pause keeps the throat open, no closed folds and no cough`, async ({ page }) => {
      await boot(page, lang);
      const t = await exText(page, lang, "s18-costal-breath");
      const all = flat(t);
      expect(all, "no cough-like push").not.toMatch(lang === "es" ? /\btos\b/i : /\bcough\b/i);
      expect(all, "no closing the folds").not.toMatch(lang === "es" ? /cierre de las cuerdas/i : /fold closure/i);
      expect(all, "no pressure to hold").not.toMatch(
        lang === "es" ? /se mantiene esa presión|empujón abdominal/i : /hold that pressure|abdominal push/i
      );
      expect(t.steps[3], "step 4 is a pause with the throat open").toMatch(
        lang === "es"
          ? /^Pausa 2 tiempos con la garganta abierta, sin cerrar: el aire queda en suspenso, no atrapado\.$/
          : /^Pause 2 counts with the throat open, not closed: the air waits, it is not trapped\.$/
      );
      expect(t.tips[2], "the exhale starts gently with no push; the wide ribs slow the air").toMatch(
        lang === "es" ? /sin empujar[\s\S]*costillas anchas/i : /no push[\s\S]*ribs wide/i
      );
    });

    test(`${lang}: the cue says pause, not hold`, async ({ page }) => {
      await boot(page, lang);
      await page.evaluate(() => window.VTApp.openExercise("s18-costal-breath"));
      await expect(page.locator("#view-exercise")).toHaveClass(/active/);
      const cue = (await page.locator("#mode-cue").textContent()) || "";
      expect(cue).toMatch(lang === "es" ? /pausa 2/i : /pause 2/i);
      expect(cue).not.toMatch(lang === "es" ? /ret[eé]n/i : /hold 2/i);
      expect(cue, "the 4-2-8 timing stays").toMatch(/4[\s\S]*2[\s\S]*8/);
    });

    test(`${lang}: the diaphragm line is true and carries no unsourced figures`, async ({ page }) => {
      await boot(page, lang);
      const t = await exText(page, lang, "s18-costal-breath");
      expect(t.research).not.toMatch(
        lang === "es"
          ? /no se controla de forma voluntaria|60\s?%|25\s?%/i
          : /not under direct voluntary control|60\s?%|25\s?%/i
      );
      expect(t.research).toMatch(
        lang === "es"
          ? /No puedes sentir el diafragma directamente \(tiene pocos receptores\) y solo trabaja al inhalar; lo que sí sientes y entrenas son las costillas y la pared abdominal, y eso es el apoyo\./
          : /You cannot feel the diaphragm directly \(it has few sensory receptors\) and it only works on the in-breath; what you can feel and train is the ribs and the abdominal wall, and that is the apoyo\./
      );
    });
  }

  test("the catalog still opens s18's summary the way catalog-design expects", async ({ page }) => {
    await boot(page, "es");
    const t = await exText(page, "es", "s18-costal-breath");
    expect(t.original).toMatch(/^Respiración costo-abdominal: inhala bajo por la nariz/);
    expect(t.original, "the summary does not ask for a hold either").not.toMatch(/ret[eé]n/i);
    const en = await exText(page, "en", "s18-costal-breath");
    expect(en.original).not.toMatch(/\bhold\b/i);
  });
});

test.describe("Voice-safety section in the guide", () => {
  for (const [lang, id, toc, otorrino, weeks] of [
    ["es", "voz", "#voz", /otorrino/i, /4 semanas/],
    ["en", "voz-en", "#voz-en", /\bENT\b/, /4 weeks/]
  ]) {
    test(`${lang}: section 15 exists, says when to stop and when to see an ENT`, async ({ page }) => {
      await page.goto(BASE + "/guide.html", { waitUntil: "domcontentloaded" });
      const h = page.locator(`h2#${id}`);
      await expect(h).toHaveCount(1);
      await expect(h).toContainText(lang === "es" ? "15 · Cuida tu voz" : "15 · Look after your voice");
      const text = await page.evaluate((x) => {
        let out = "";
        for (let el = document.getElementById(x).nextElementSibling; el && el.tagName !== "H2" && !el.classList.contains("guide-back"); el = el.nextElementSibling) out += ` ${el.textContent}`;
        return out.replace(/\s+/g, " ");
      }, id);
      expect(text, "stop if anything hurts").toMatch(lang === "es" ? /si (algo )?duele,? para/i : /if (anything )?hurts,? stop/i);
      expect(text, "hoarseness: ease off, do not push through").toMatch(lang === "es" ? /ronquera/i : /hoarse/i);
      expect(text).toMatch(otorrino);
      expect(text, "about four weeks").toMatch(weeks);
      expect(text, "red flags").toMatch(lang === "es" ? /tragar[\s\S]*respirar[\s\S]*sangre/i : /swallowing[\s\S]*breathing[\s\S]*blood/i);
      expect(text, "practice, not treatment").toMatch(lang === "es" ? /no (es|son) (un )?tratamiento/i : /not (a )?treatment/i);
    });

    test(`${lang}: the contents, the intro and section 2 all point to it`, async ({ page }) => {
      await page.goto(BASE + "/guide.html", { waitUntil: "domcontentloaded" });
      const counts = await page.evaluate(
        ([l, href]) => {
          // The Spanish half is everything outside <section lang="en">
          const en = document.querySelector("section[lang='en']");
          const inHalf = (a) => (l === "en" ? en.contains(a) : !en.contains(a));
          const nav = [...document.querySelectorAll("nav.guide-toc")].find(inHalf);
          const links = [...document.querySelectorAll(`main a[href="${href}"]`)].filter(inHalf);
          return {
            inToc: links.filter((a) => nav.contains(a)).length,
            elsewhere: links.filter((a) => !nav.contains(a)).length,
            lastTocItem: nav.querySelector("li:last-child a")?.getAttribute("href")
          };
        },
        [lang, toc]
      );
      expect(counts.inToc, "a contents entry").toBe(1);
      expect(counts.lastTocItem, "numbered 15, so last").toBe(toc);
      // one in the intro, one at the end of section 2
      expect(counts.elsewhere).toBeGreaterThanOrEqual(2);
    });
  }

  test("the privacy section still ends where the privacy cases read it", async ({ page }) => {
    // ab-events reads #privacidad up to the next H2 or the back link
    await page.goto(BASE + "/guide.html", { waitUntil: "domcontentloaded" });
    const order = await page.evaluate(() => {
      const ids = (a, b) => {
        const A = document.getElementById(a);
        const B = document.getElementById(b);
        return !!(A && B && A.compareDocumentPosition(B) & Node.DOCUMENT_POSITION_FOLLOWING);
      };
      const sw = [...document.querySelectorAll("[data-privacy-switch]")];
      const voz = document.getElementById("voz");
      const vozEn = document.getElementById("voz-en");
      return {
        esAfterPrivacy: ids("privacidad", "voz"),
        enAfterPrivacy: ids("privacidad-en", "voz-en"),
        esAfterSwitch: !!(sw[0] && voz && sw[0].compareDocumentPosition(voz) & Node.DOCUMENT_POSITION_FOLLOWING),
        enAfterSwitch: !!(sw[1] && vozEn && sw[1].compareDocumentPosition(vozEn) & Node.DOCUMENT_POSITION_FOLLOWING),
        backLinks: document.querySelectorAll(".guide-back").length
      };
    });
    expect(order).toEqual({ esAfterPrivacy: true, enAfterPrivacy: true, esAfterSwitch: true, enAfterSwitch: true, backLinks: 2 });
  });
});

test.describe("Imagery that claimed more than the evidence", () => {
  for (const lang of ["es", "en"]) {
    test(`${lang}: v13 level 1 asks for a very soft voice, not a whisper, everywhere it shows`, async ({ page }) => {
      await page.addInitScript(() => {
        window.__texts = [];
        const f = CanvasRenderingContext2D.prototype.fillText;
        CanvasRenderingContext2D.prototype.fillText = function (t, ...a) {
          window.__texts.push(String(t));
          return f.apply(this, [t, ...a]);
        };
      });
      await boot(page, lang);
      const t = await exText(page, lang, "v13-volume-ladder");
      expect(withoutNegatedWhisper(flat(t)), "the exercise text").not.toMatch(/susurro|whisper/i);
      expect(t.steps[1]).toMatch(lang === "es" ? /1 voz muy suave \(no susurro\)/ : /level 1 \(very soft voice, not a whisper\)/);
      await page.evaluate(() => window.VTApp.openExercise("v13-volume-ladder"));
      await expect(page.locator("#view-exercise")).toHaveClass(/active/);
      await expect(page.locator("#mode-focus [data-phase]")).toHaveText(lang === "es" ? /^1 Muy suave$/ : /^1 Very soft$/);
      await expect(page.locator("#mode-focus .vz-canvas")).toBeVisible();
      await page.waitForTimeout(400);
      const seen = await page.evaluate(() => ({
        aria: document.querySelector("#mode-focus .vz-canvas")?.getAttribute("aria-label") || "",
        drawn: [...new Set(window.__texts)]
      }));
      expect(seen.aria, "the ladder's picture label").not.toMatch(/susurro|whisper/i);
      expect(seen.aria).toMatch(lang === "es" ? /de lo más suave a la sala llena/ : /from the softest to full room/);
      expect(seen.drawn.join(" | "), "the picture's own words").not.toMatch(/susurro|whisper/i);
      expect(seen.drawn.join(" | ")).toMatch(lang === "es" ? /la frase entera, aún con claridad/ : /the whole sentence, still clear/);
    });
  }

  for (const lang of ["es", "en"]) {
    test(`${lang}: v4's pen is not strength training, and a sore jaw is a reason to stop`, async ({ page }) => {
      await boot(page, lang);
      const t = await exText(page, lang, "v4-articulation-pen");
      expect(flat(t)).not.toMatch(/resistance training|strengthen speech muscles|entrenamiento de resistencia|La resistencia entrena/i);
      expect(t.research).toMatch(lang === "es" ? /no es entrenamiento de fuerza/i : /not strength training/i);
      expect(t.tips.join(" | ")).toMatch(lang === "es" ? /Si te duele la mandíbula, para\./ : /Stop if the jaw hurts\./);
    });
  }

  test("s17: no unsourced muscle physiology", async ({ page }) => {
    await boot(page, "en");
    for (const lang of ["es", "en"]) {
      const t = await exText(page, lang, "s17-jaw-neck-release");
      expect(t.research).not.toMatch(/resistance to muscle lengthening|motor commands|resistencia al alargamiento|órdenes motoras/i);
      expect(t.research).toMatch(lang === "es" ? /puede hacer que la tensión sea más fácil de notar/ : /can make tension easier to notice and let go of/);
    }
  });

  test("s19 and s22: English says dull, not flat (a flat note is an under-pitch one); Spanish keeps plano", async ({ page }) => {
    await boot(page, "en");
    for (const id of ["s19-soft-palate-surprise", "s22-mid-voice-hola"]) {
      expect(flat(await exText(page, "en", id)), id).not.toMatch(/\bflat\b/i);
      expect(flat(await exText(page, "en", id)), id).toMatch(/going dull|goes dull/);
      expect(flat(await exText(page, "es", id)), id).toMatch(/plano/);
    }
  });

  test("s23: sinuses and forehead are a sensation you may feel, not where the sound is made", async ({ page }) => {
    await boot(page, "en");
    for (const lang of ["es", "en"]) {
      const t = await exText(page, lang, "s23-mask-ya");
      expect(t.original).toMatch(lang === "es" ? /puedes sentir/ : /you may feel/);
      expect(t.original).not.toMatch(lang === "es" ? /para localizar la máscara superior: nariz/ : /to locate the upper mask: nose/);
      expect(t.steps[1]).toMatch(lang === "es" ? /dónde sientes/ : /where you feel/);
    }
  });
});

test.describe("Small content fixes", () => {
  test("v12: monotonía is spelled right, everywhere in the Spanish copy", async ({ page }) => {
    await boot(page, "es");
    const hits = await page.evaluate(() => JSON.stringify(window.VT_EXERCISE_LOCALE_ES).match(/monotom/gi));
    expect(hits).toBeNull();
    const t = await exText(page, "es", "v12-melodic-speech");
    expect(t.research).toMatch(/La monotonía pierde atención/);
    expect(t.tips.join(" ")).toMatch(/caza monotonía/);
  });

  test("v11: the Spanish filler list has 'este', the most typical Peruvian one", async ({ page }) => {
    await boot(page, "es");
    const t = await exText(page, "es", "v11-kill-fillers");
    expect(t.steps.join(" | ")).toMatch(/eh, este, ah, o sea, digamos, entonces/);
  });
});

test.describe("Public files", () => {
  test("README: the privacy lines say what the privacy page says, and no promise beyond it", () => {
    const md = read("README.md");
    const priv = md.slice(md.indexOf("## Privacy"));
    expect(priv).not.toMatch(/stay in your browser on this device/i);
    expect(priv).not.toMatch(/All practice data and recordings/i);
    expect(priv, "progress lives in this browser").toMatch(/progress[^.]*this browser/i);
    expect(priv, "signed in: also in the account").toMatch(/sign in[^.]*account[^.]*another device/i);
    expect(priv, "recordings stay here").toMatch(/recordings stay in this browser/i);
    expect(priv, "statistics are sent unless switched off").toMatch(/anonymous usage statistics are sent/i);
    expect(priv, "EEA only after a yes").toMatch(/European Economic Area[^.]*only after you say yes/i);
    expect(priv).toMatch(/privacy\.html/);
    // nothing the page does not already say
    expect(priv).not.toMatch(/never|always|guarantee|we do not (store|collect|share)|no tracking/i);
  });

  test("README: the card rail is not 'Stripe (global)'", () => {
    const md = read("README.md");
    expect(md).not.toMatch(/Stripe \(global\)/);
    const line = md.split("\n").find((l) => /Subscriptions \(Pro\)/.test(l)) || "";
    expect(line).toMatch(/Mercado Pago \(Perú\/LATAM\)/);
    expect(line).toMatch(/merchant of record/);
    expect(line).toMatch(/Peru-registered seller cannot be a Stripe merchant/);
    expect(line).toMatch(/docs\/34-PERU-OPERATOR-RUNBOOK\.md/);
    expect(line).toMatch(/checkout is not public yet/);
    expect(fs.existsSync(path.join(ROOT, "docs/34-PERU-OPERATOR-RUNBOOK.md"))).toBe(true);
  });

  test("a teacher's name is not in the code comment on the class tier", () => {
    const js = read("js/exercises-data.js");
    const m = js.match(/CLASS TIER \(([^)]*)\)/);
    expect(m, "the comment is still there").toBeTruthy();
    expect(m[1]).toBe("a teacher's basic course, months 1–2");
  });
});

test.describe("The three stale specs", () => {
  test("dismissBlockingOverlays leaves an open exercise open", async ({ page }) => {
    // layout-probe called VTTour.end() with no tour running; end() routes home.
    await page.setViewportSize(LAPTOP);
    await boot(page, "es");
    const { dismissBlockingOverlays } = require("./helpers/layout-probe");
    await page.evaluate(() => window.VTApp.openExercise("v1-diction"));
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    const startBefore = await page.locator("#btn-practice-start").boundingBox();
    expect(startBefore && startBefore.width).toBeGreaterThan(8);
    await dismissBlockingOverlays(page);
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => window.VTApp.getState().view)).toBe("exercise");
    const startAfter = await page.locator("#btn-practice-start").boundingBox();
    expect(startAfter && startAfter.width, "Start still has a box").toBeGreaterThan(8);
  });

  test("dismissBlockingOverlays still ends a tour that is running", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        sessionStorage.setItem("vt_e2e", "1");
        localStorage.setItem("vt_lang", "es");
        localStorage.removeItem("vt_tour_v1");
      } catch {
        /* ignore */
      }
    });
    await page.goto(BASE + "/?e2e", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTTour);
    const live = await page.evaluate(() => {
      window.VTTour.start?.({ force: true });
      return window.VTTour.isActive?.();
    });
    test.skip(!live, "the tour did not start in this build");
    const { dismissBlockingOverlays } = require("./helpers/layout-probe");
    await dismissBlockingOverlays(page);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.VTTour.isActive?.())).toBe(false);
  });

  test("all-flows-robust waits for the Start button with its timeout in the options", () => {
    const spec = read("tests/all-flows-robust.spec.js");
    expect(spec).not.toMatch(/waitForFunction\(\s*\(\)\s*=>\s*\{[\s\S]*?\n\s*\},\s*\{\s*timeout:\s*\d+\s*\}\s*\)/);
    expect(spec).toMatch(/\},\s*null,\s*\{\s*timeout:\s*8000\s*\}\s*\)/);
  });

  test("validation's sustain test opens Piano before it looks for the options inside it", () => {
    const spec = read("tests/validation.spec.js");
    const at = spec.indexOf('test("sustain checkbox still present');
    expect(at).toBeGreaterThan(0);
    const body = spec.slice(at, spec.indexOf("\n  });", at));
    const open = body.indexOf("#btn-toggle-piano");
    expect(open, "the test opens Piano ▾").toBeGreaterThan(0);
    for (const id of ["#chk-sustain", "#chk-arpeggio", "#chk-one-note"]) {
      expect(body.indexOf(id), `${id} is checked after Piano is opened`).toBeGreaterThan(open);
    }
  });

  test("the headed forensics spec makes its report folder and does not click a fixed corner", () => {
    const spec = read("tests/headed-exercise-forensics.spec.js");
    const firstWrite = spec.indexOf("fs.writeFileSync(REPORT_JSON");
    // fs.mkdirSync or the spec's own ensureDir (which wraps it), as main has it
    const mk = spec.search(/(?:mkdirSync|ensureDir)\(\s*path\.dirname\(\s*REPORT_JSON/);
    expect(mk, "creates the folder").toBeGreaterThan(0);
    expect(mk, "before the first write").toBeLessThan(firstWrite);
    expect(spec, "no click at a fixed point that is '← Practicar' on a phone").not.toMatch(/mouse\.click\(\s*Math\.min\(60/);
    expect(spec).toMatch(/highway-stage|pitch-canvas/);
  });

  test("at 390x844 the old fixed click point was the back button; the stage is somewhere safe to put focus", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await boot(page, "es");
    await page.evaluate(() => window.VTApp.openExercise("v1-diction"));
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    const hit = await page.evaluate(() => {
      const x = Math.min(60, 390 * 0.15);
      const y = Math.min(100, 844 * 0.2);
      const el = document.elementFromPoint(x, y);
      return el ? (el.closest("button,a")?.id || el.id || el.tagName) : null;
    });
    expect(hit, "the fixed point is the back button on a phone").toBe("btn-back-home");
    // what the spec now does instead: put focus on the stage, which stays on the exercise
    await page.evaluate(() => {
      const el = document.getElementById("pitch-canvas") || document.getElementById("highway-stage");
      if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      if (el && !el.hasAttribute("tabindex")) el.tabIndex = -1;
      el?.focus({ preventScroll: true });
    });
    expect(await page.evaluate(() => window.VTApp.getState().view)).toBe("exercise");
  });
});
