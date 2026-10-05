/**
 * A synthetic singer or speaker for specs: replaces the microphone with the
 * voice in qa/synthetic-voice.js (plus the extra scenarios in qa/voices/), so
 * an exercise can be run end to end without a person. Call before goto().
 *
 *   await useVoice(page);
 *   … open an exercise, click Start …
 *   await playVoice(page, "speech");
 *
 * The voice's AudioContext starts on the Start click (a user gesture); pass
 * --autoplay-policy=no-user-gesture-required to launch when a spec plays it
 * from page.evaluate before any click.
 */
const fs = require("fs");
const path = require("path");

const QA = path.join(__dirname, "..", "..", "qa");

function voiceSource() {
  const parts = [fs.readFileSync(path.join(QA, "synthetic-voice.js"), "utf8")];
  const dir = path.join(QA, "voices");
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir)
      .filter((f) => f.endsWith(".js"))
      .sort()
      .forEach((f) => parts.push(fs.readFileSync(path.join(dir, f), "utf8")));
  }
  return parts.join("\n;\n");
}

async function useVoice(page) {
  await page.addInitScript({ content: voiceSource() });
}

async function playVoice(page, name) {
  await page.evaluate((n) => window.__VTVoice.play(n), name);
}

async function stopVoice(page) {
  await page.evaluate(() => window.__VTVoice && window.__VTVoice.stop());
}

module.exports = { useVoice, playVoice, stopVoice, voiceSource };
