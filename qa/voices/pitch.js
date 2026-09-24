/**
 * Synthetic singers for the pitch family (qa only; loaded after
 * qa/synthetic-voice.js by qa/drive-exercises.mjs and the specs).
 *
 *   fryClear     s1: a jittery fry around 62 Hz that clears into a steady /A/
 *   sirenBreak   s5: glides low → high → low with a register jump on the way
 *                up, a short cut on the way down, a top above what the
 *                detector reads cleanly, and a breath between sirens
 *   matchListen  s9: silent while each new reference rings, then sings it,
 *                scooping from below and settling slightly sharp
 *   stoneFollow  scales / hum: legato, glides into each new target with a
 *                small scoop, a short breath every few seconds
 *   songPhrases  s3: phrases of 6.5, 4.2, 7 and 3 s around the target with
 *                breaths between; the long ones fade at the end
 */
(function () {
  const V = window.__VTVoice;
  if (!V || !V.define) return;

  V.define("fryClear", (h) => {
    const cycle = () => {
      // Fry: low, irregular, quiet
      h.vibrato(0);
      h.setPitch(62, 0.02);
      h.voiceOn(0.16, 0.08);
      const jitter = h.every(45, () => h.setPitch(62 * Math.pow(2, (Math.random() - 0.5) * 0.25), 0.02));
      h.at(1600, () => {
        clearInterval(jitter);
        // Clears into a steady /A/ near A2
        h.setPitch(110, 0.25);
        h.vibrato(10);
        h.voiceOn(0.3, 0.2);
      });
      h.at(4600, () => h.voiceOff(0.15));
      h.at(5700, cycle);
    };
    cycle();
  });

  V.define("sirenBreak", (h) => {
    h.vibrato(0);
    const cycle = () => {
      h.setPitch(110, 0.01);
      h.voiceOn(0.3, 0.08);
      h.setPitch(190, 1.8); // smooth up to the break
      h.at(1850, () => {
        h.setPitch(245, 0.012); // the jump
        h.at(40, () => h.setPitch(430, 1.3)); // on up, past where the detector reads cleanly
      });
      h.at(3500, () => h.setPitch(165, 1.6)); // down
      h.at(5150, () => h.voiceOff(0.01)); // a 110 ms cut mid-glide
      h.at(5260, () => {
        h.voiceOn(0.3, 0.01);
        h.setPitch(105, 1.1);
      });
      h.at(6450, () => h.voiceOff(0.1)); // breath
      h.at(7300, cycle);
    };
    cycle();
  });

  V.define("matchListen", (h) => {
    let last = 0;
    let singing = false;
    let token = 0;
    const cents = (a, b) => Math.abs(1200 * Math.log2(a / b));
    const sing = () => {
      const f = h.targetHz();
      h.setPitch(f * Math.pow(2, -60 / 1200), 0.01);
      h.vibrato(8);
      h.voiceOn(0.3, 0.08);
      h.setPitch(f * Math.pow(2, 6 / 1200), 0.35);
      singing = true;
    };
    h.every(40, () => {
      const f = h.targetHz();
      if (!last || cents(f, last) > 20) {
        last = f;
        // A new note: stop, listen to all of it, then sing
        if (singing) h.voiceOff(0.08);
        singing = false;
        const mine = ++token;
        h.at(2000, () => {
          if (mine === token) sing();
        });
      }
    });
  });

  V.define("stoneFollow", (h) => {
    let last = 0;
    let on = true;
    h.vibrato(10);
    h.voiceOn(0.3, 0.1);
    h.every(40, () => {
      if (!on) return;
      const f = h.targetHz();
      if (!last || Math.abs(1200 * Math.log2(f / last)) > 20) {
        last = f;
        // Glide in with a small scoop, then settle a little sharp
        h.setPitch(f * Math.pow(2, -35 / 1200), 0.12);
        h.at(160, () => h.setPitch(f * Math.pow(2, 5 / 1200), 0.25));
      }
    });
    h.every(6500, () => {
      on = false;
      h.voiceOff(0.1);
      h.at(550, () => {
        on = true;
        last = 0;
        h.voiceOn(0.3, 0.1);
      });
    });
  });

  V.define("songPhrases", (h) => {
    const lens = [6500, 4200, 7000, 3000];
    const tune = [0, 2, 4, 2, 0, -3, 0, 2, 5, 4, 2, 0];
    let p = 0;
    h.vibrato(14);
    const phrase = () => {
      const len = lens[p % lens.length];
      const fade = len >= 6000;
      const base = h.targetHz();
      h.voiceOn(0.3, 0.08);
      let k = 0;
      const step = () => {
        h.setPitch(base * Math.pow(2, tune[k % tune.length] / 12), 0.08);
        k++;
      };
      step();
      const id = h.every(520, step);
      if (fade) {
        h.at(len - 1400, () => {
          const g = h.nodes().voice.gain;
          const t = h.now();
          g.cancelScheduledValues(t);
          g.setValueAtTime(g.value, t);
          g.linearRampToValueAtTime(0.07, t + 1.3);
        });
      }
      h.at(len, () => {
        clearInterval(id);
        h.voiceOff(0.08);
      });
      p++;
      h.at(len + 1100, phrase);
    };
    phrase();
  });
})();
