// QA-49 (found on 20c5576, PR #23): mutant C2 survived in the `regress` job. The cases in corrupt-storage.spec.js that seed
// vt_analytics_v1 boot with sessionStorage vt_e2e=1, and track() answers "automated" before it reads the log, so they proved the
// boot and not the reader. summary() reads the log whatever the consent or automation state is, so this file judges the reader.
// Goal: a stored log of another kind reads as an empty log and does not throw; a valid log is read as it is.
// Wrong in one direction: events:5 -> "5.concat is not a function". Wrong in the other: a reader that returns an empty log for
// everything would pass the first half, so the control (a valid log is kept) is part of the file.
// The null, 42 and array cases are controls: summary() tolerates them even under C2, so they do not kill it.
const { test, expect } = require("@playwright/test");

async function boot(page, seed) {
  await page.addInitScript((s) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      sessionStorage.setItem("vt_e2e", "1");
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    } catch { /* storage blocked */ }
  }, seed);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTAnalytics, null, { timeout: 10000 });
}
// The page writes a few events of its own while it boots, so the oracle names the seeded events instead of counting.
const summary = (page) => page.evaluate(() => {
  try { const s = window.VTAnalytics.summary(); return { ok: true, s, names: s.recent.filter((e) => !e.held).map((e) => e.name) }; }
  catch (e) { return { ok: false, err: String(e.message) }; }
});

test("control: a valid stored log is read as it is", async ({ page }) => {
  await boot(page, { vt_analytics_v1: JSON.stringify({ events: [{ name: "a", props: {}, t: "2026-01-01T00:00:00Z" }, { name: "b", props: {}, t: "2026-01-01T00:00:01Z" }] }) });
  const r = await summary(page);
  expect(r.ok).toBe(true);
  expect(r.names).toEqual(expect.arrayContaining(["a", "b"]));
});

for (const [name, value] of [
  ["events is a number", '{"events":5}'],
  ["events is a string", '{"events":"abc"}'],
  ["events is an object", '{"events":{"0":1}}'],
  ["a bare number", "42"],
  ["null", "null"],
  ["an array", "[1,2,3]"]
]) {
  test(`a stored log where ${name} is read as an empty log and does not throw`, async ({ page }) => {
    await boot(page, { vt_analytics_v1: value });
    const r = await summary(page);
    expect(r.err || "").toBe("");
    expect(r.ok).toBe(true);
    expect(r.names.every((n) => typeof n === "string")).toBe(true);
    expect(r.names).not.toContain("a");
  });
}
