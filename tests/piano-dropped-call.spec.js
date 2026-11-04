/**
 * A piano call that is still waiting for a held AudioContext when the learner stops (or asks for another progression) must
 * leave the shared piano alone when its context finally settles. From QA round 10 on PR #27.
 *
 * Goal. iOS can hold every AudioContext.resume() for seconds (a call, Siri). Start A waits inside VTPiano.playProgression;
 * the learner taps Stop and starts B, whose context runs and whose chords play. When A's wait ends, A is dropped (it
 * returns null), and B must go on playing.
 * The defect. `_readyToPlay` ended with `_silence()` and the staleness check came after it: A's late continuation
 * stopped every voice and the loop of B and bumped the pass counter, so B's chord timers announced nothing. B's take
 * went on with no piano and no moving target, and nothing said why.
 */
const { test, expect } = require("@playwright/test");
const { boot } = require("./helpers/e2e");

/** Hold the next `n` resume() calls until released; returns the release function's name on window. */
async function holdResumes(page) {
  await page.evaluate(() => {
    const AC = window.AudioContext || window.webkitAudioContext;
    const real = AC.prototype.resume;
    window.__hold = 0;
    window.__held = [];
    window.__realResume = real;
    AC.prototype.resume = function () {
      if (window.__hold > 0) {
        window.__hold -= 1;
        return new Promise((done) => window.__held.push(() => real.call(this).then(done, done)));
      }
      return real.call(this);
    };
    window.__releaseResumes = () => window.__held.splice(0).map((f) => f()).length;
  });
}

const state = () => {
  const P = window.VTPiano;
  return { loop: P.loopActive, playing: (P.playing || []).length, ctx: P.ctx && P.ctx.state };
};

test("A stopped while its context was held does not silence B when the context settles", async ({ page }) => {
  await boot(page, { lang: "en" });
  await holdResumes(page);
  const r = await page.evaluate(async (stateSrc) => {
    const snap = new Function(`return (${stateSrc})()`);
    const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
    const P = window.VTPiano;
    await P.ensure();
    await P.ctx.suspend();
    window.__hold = 99;
    const A = P.playProgression("prog1", { loop: true, chordSec: 2 });
    await sleep(300);
    P.stopAll(); // the learner's Stop
    window.__hold = 0; // the context B asks about is fine
    const B = await P.playProgression("prog1", { loop: true, chordSec: 2 });
    await sleep(400);
    const bPlaying = snap();
    const released = window.__releaseResumes();
    const aResult = await Promise.race([A.then((v) => (v ? "played" : "dropped")), sleep(3000).then(() => "still waiting")]);
    await sleep(500);
    return { bResult: !!B, bPlaying, released, aResult, afterARuns: snap() };
  }, state.toString());
  expect(r.bResult, "control: B was accepted").toBe(true);
  expect(r.bPlaying.loop && r.bPlaying.playing > 0, `control: B is playing before A's context settles ${JSON.stringify(r.bPlaying)}`).toBe(true);
  expect(r.released, "control: A really was waiting on a held resume").toBeGreaterThan(0);
  expect(r.aResult, "A is dropped").toBe("dropped");
  expect(r.afterARuns.loop, `B's chord loop is still running ${JSON.stringify(r.afterARuns)}`).toBe(true);
  expect(r.afterARuns.playing, "B's voices are still sounding").toBeGreaterThan(0);
});

test("an older progression still waiting for a held context does not silence the newer one", async ({ page }) => {
  await boot(page, { lang: "en" });
  await holdResumes(page);
  const r = await page.evaluate(async (stateSrc) => {
    const snap = new Function(`return (${stateSrc})()`);
    const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
    const P = window.VTPiano;
    await P.ensure();
    await P.ctx.suspend();
    window.__hold = 99;
    const older = P.playProgression("prog1", { loop: true, chordSec: 2 });
    await sleep(300);
    window.__hold = 0;
    const newer = await P.playProgression("prog2", { loop: true, chordSec: 2 });
    await sleep(400);
    const newerPlaying = snap();
    const released = window.__releaseResumes();
    const olderResult = await Promise.race([older.then((v) => (v ? "played" : "dropped")), sleep(3000).then(() => "still waiting")]);
    await sleep(500);
    return { newerResult: !!newer, newerPlaying, released, olderResult, after: snap() };
  }, state.toString());
  expect(r.newerResult).toBe(true);
  expect(r.newerPlaying.loop && r.newerPlaying.playing > 0, `control: the newer one is playing ${JSON.stringify(r.newerPlaying)}`).toBe(true);
  expect(r.released).toBeGreaterThan(0);
  expect(r.olderResult, "the older one is dropped").toBe("dropped");
  expect(r.after.loop, `the newer loop is still running ${JSON.stringify(r.after)}`).toBe(true);
  expect(r.after.playing).toBeGreaterThan(0);
});

test("CONTROL: with nothing stale, the progression that was asked for plays after a held context settles", async ({ page }) => {
  await boot(page, { lang: "en" });
  await holdResumes(page);
  const r = await page.evaluate(async (stateSrc) => {
    const snap = new Function(`return (${stateSrc})()`);
    const sleep = (ms) => new Promise((done) => setTimeout(done, ms));
    const P = window.VTPiano;
    await P.ensure();
    await P.ctx.suspend();
    window.__hold = 99;
    const only = P.playProgression("prog1", { loop: true, chordSec: 2 });
    await sleep(300);
    const waiting = snap();
    window.__releaseResumes();
    const result = await Promise.race([only.then((v) => (v ? "played" : "dropped")), sleep(4000).then(() => "still waiting")]);
    await sleep(300);
    return { waiting, result, after: snap() };
  }, state.toString());
  expect(r.waiting.loop || r.waiting.playing > 0, "it did not play while the context was held").toBe(false);
  expect(r.result).toBe("played");
  expect(r.after.loop).toBe(true);
  expect(r.after.playing).toBeGreaterThan(0);
});
