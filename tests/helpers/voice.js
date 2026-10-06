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

/**
 * A fan in the room: steady white noise at −50 dBFS mixed into the synthetic
 * microphone from the first frame, loud enough to open the engine's gate at
 * the default sensitivity (−36 dBFS after its gain). Pass it to
 * page.addInitScript after useVoice(): it wraps the voice's getUserMedia.
 * A `gain` of 0.00055 is a quiet room's hiss instead (−70 dBFS), which opens
 * the gate only at sensitivity 10. `{ gain, hz, order }` is a fan's low
 * rumble instead: the noise through `order` one-pole low-passes at `hz`, at
 * the same level for the same gain.
 */
function fanInRoom(opts) {
  const o = typeof opts === "number" ? { gain: opts } : opts || {};
  const gain = o.gain;
  const gum = navigator.mediaDevices.getUserMedia;
  navigator.mediaDevices.getUserMedia = async (...args) => {
    const stream = await gum.apply(navigator.mediaDevices, args);
    const { dest } = window.__VTVoice.h.nodes();
    if (!window.__fan) {
      const ac = dest.context;
      const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      if (o.hz) {
        const lp = new Array(o.order || 1).fill(0);
        let sq = 0;
        for (let i = 0; i < d.length; i++) {
          let v = d[i];
          for (let j = 0; j < lp.length; j++) v = lp[j] += (v - lp[j]) * ((2 * Math.PI * o.hz) / ac.sampleRate);
          d[i] = v;
          sq += v * v;
        }
        // White noise's own level: an rms of 1/√3
        const k = 1 / Math.sqrt((3 * sq) / d.length);
        for (let i = 0; i < d.length; i++) d[i] *= k;
      }
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const g = ac.createGain();
      g.gain.value = gain || 0.0055;
      src.connect(g).connect(dest);
      src.start();
      window.__fan = src;
    }
    return stream;
  };
}

module.exports = { useVoice, playVoice, stopVoice, voiceSource, fanInRoom };
