/**
 * The forensic audit's in-page probes (qa/audit/page-probes.js) measure what
 * a learner can actually hit, and say what covers what.
 *
 * Wrong behaviours rejected (the first full audit ledger, 2026-11-02):
 * - 106 of its 132 layout findings were checkboxes inside a big label ("A mi
 *   voz", "Grabarme") measured as the 13–20 px box alone, and named "on",
 *   their value. A label activates its control, so the target is the label
 *   (WCAG 2.5.8).
 * - The opposite error: any label excusing any box. A label smaller than
 *   24 px is still a small target.
 * - "Tab stop is covered" without saying by what, which made 17 findings
 *   impossible to act on.
 * - Screen-reader-only live regions (1 × 1 px, clipped on purpose) reported
 *   as clipped text on screen: 8 of the 24 "clipped" findings.
 */
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");

const PROBES = fs.readFileSync(path.join(__dirname, "..", "qa", "audit", "page-probes.js"), "utf8");

const FIXTURE = `<!doctype html><meta charset="utf-8"><body style="font:16px sans-serif;margin:20px">
  <label id="big" style="display:inline-flex;align-items:center;gap:6px;padding:8px 10px">
    <input type="checkbox" id="chk-big" style="width:13px;height:13px;margin:0"> A mi voz
  </label>
  <br>
  <label id="tiny" style="display:inline-block;font-size:10px;line-height:12px">
    <input type="checkbox" id="chk-tiny" style="width:13px;height:13px;margin:0">x
  </label>
  <br>
  <input type="checkbox" id="chk-bare" aria-label="Arpeggio" style="width:13px;height:13px;margin:8px 0">
  <div style="position:relative;margin-top:10px">
    <button id="under" style="width:120px;height:40px">Siguiente →</button>
    <div id="cover" class="veil" style="position:absolute;inset:0;width:200px;height:40px"></div>
  </div>
  <button id="free" style="width:120px;height:40px;margin-top:10px">Libre</button>
  <div id="cut" style="width:60px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">Una frase visible y larga</div>
  <div id="live" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap">Metáforas 0 / 5, una frase larga que no cabe</div>
</body>`;

test("audit probes: a label is part of its control's target; small and covered are still found", async ({ page }) => {
  await page.setContent(FIXTURE);
  await page.addScriptTag({ content: PROBES });
  const got = await page.evaluate(() => {
    const A = window.__audit;
    const at = (id) => {
      const el = document.getElementById(id);
      const r = el.getBoundingClientRect();
      return { name: A.label(el), small: A.smallTarget(el, r), by: A.coverer(el, r) };
    };
    return {
      big: at("chk-big"),
      tiny: at("chk-tiny"),
      bare: at("chk-bare"),
      under: at("under"),
      free: at("free"),
      // A screen-reader-only live region is not clipped text on screen
      clipped: A.overlaps("body").clipped
    };
  });
  // The wrong reading of the first ledger: a 13 px box named "on"
  expect(got.big).toEqual({ name: "A mi voz", small: false, by: "self" });
  // Controls: a label too small to help, and no label at all, are still small
  expect(got.tiny.small, "a 12 px label does not make a 24 px target").toBe(true);
  expect(got.bare).toMatchObject({ name: "Arpeggio", small: true });
  // A covered control names its coverer; an uncovered one is itself
  expect(got.under.by).toBe("#cover.veil");
  expect(got.free.by).toBe("self");
  // Control: text cut on screen is still reported
  expect(got.clipped).toEqual(["Una frase visible y larga"]);
});
