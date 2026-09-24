/**
 * Synthetic performances for the guided drills (js/scenes/guided.js).
 * Loaded after qa/synthetic-voice.js by the drive harness and the specs.
 */
(function () {
  "use strict";
  const V = window.__VTVoice;
  if (!V || !V.define) return;

  // v4: counting one number every 1.5 s — two short syllables per number
  V.define("countNumbers", (h) => {
    let k = 0;
    const say = () => {
      h.setPitch(128 + (k % 3) * 7, 0.03);
      h.voiceOn(0.28, 0.02);
      h.at(240, () => h.voiceOn(0.1, 0.03));
      h.at(300, () => {
        h.setPitch(122 + (k % 2) * 5, 0.03);
        h.voiceOn(0.24, 0.02);
      });
      h.at(560, () => h.voiceOff(0.05));
      k++;
    };
    say();
    h.every(1500, say);
  });

  // s19: sung phrases of 2.6 s; every second one 6 dB louder (the "open"
  // take pushed instead of opened — what the A/B card should point out)
  V.define("palateLouder", (h) => {
    let k = 0;
    h.vibrato(10);
    h.startFollow(5);
    h.phrases(
      2600,
      900,
      () => {
        h.voiceOn(k % 2 ? 0.36 : 0.18, 0.08);
        k++;
      },
      () => h.voiceOff(0.1)
    );
  });

  // s19: the same phrases at one loudness
  V.define("palateEven", (h) => {
    h.vibrato(10);
    h.startFollow(5);
    h.phrases(2600, 900, () => h.voiceOn(0.24, 0.08), () => h.voiceOff(0.1));
  });

  // s19: short sung blips (under 1.5 s) — nothing should count
  V.define("palateShort", (h) => {
    h.vibrato(6);
    h.startFollow(5);
    h.phrases(900, 900, () => h.voiceOn(0.26, 0.05), () => h.voiceOff(0.08));
  });

  // v7: a long improvised take — phrases with an occasional thinking pause
  V.define("longTake", (h) => {
    h.speech({ phraseMs: 5200, pauseMs: () => (Math.random() < 0.3 ? 2600 : 900) });
  });
})();
