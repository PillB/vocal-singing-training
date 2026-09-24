/**
 * Synthetic voices for the volume exercises (steady count, volume ladder,
 * energy triad). Loaded after qa/synthetic-voice.js by the drive harness and
 * the specs. Like a learner reading the screen, the ladder and energy voices
 * follow the exercise's own step (the tread or take on screen), so a slow
 * machine cannot put the voice a step out of line with the picture.
 *
 *   countFade       counts 1–10 per breath, sinking ~8 dB by the end
 *   countLoudStart  counts with a blasted "1, 2" then even
 *   ladderSteps     five levels ~5 dB apart, following the ladder's tread;
 *                   the story varies level phrase by phrase
 *   ladderFlat      the same, but levels 3 and 4 come out the same
 *   energyTakes     low / medium / high / lead, following the take on screen:
 *                   louder, faster and wider in pitch as energy rises
 *   energyFlat      only the volume changes; pace and melody stay put
 */
(function () {
  "use strict";
  const V = window.__VTVoice;
  if (!V || !V.define) return;

  /** The practice mode's live state, when a page has one. */
  function modeState() {
    try {
      return window.VTApp?.getState?.()?.modeInstance?.state || null;
    } catch {
      return null;
    }
  }

  /**
   * Speech-like syllables; every option may be a function. `gain` gets the
   * fraction of the current phrase (0 → 1) so a phrase can fade or swell.
   */
  function talk(h, o) {
    const val = (v, ...a) => (typeof v === "function" ? v(...a) : v);
    let left = 0;
    let len = 1;
    let inPhrase = false;
    let n = 0;
    const tick = () => {
      if (!inPhrase) {
        inPhrase = true;
        len = left = val(o.phraseMs);
        if (o.onPhrase) o.onPhrase(n);
      }
      if (left <= 0) {
        inPhrase = false;
        h.voiceOff(0.05);
        n++;
        h.at(val(o.pauseMs), tick);
        return;
      }
      const frac = 1 - left / len;
      const g = val(o.gain, frac);
      const spread = val(o.spread);
      const semis = (Math.sin(left / 400 + n) * 0.5 + (Math.random() - 0.5)) * spread;
      h.setPitch((o.baseHz || 135) * Math.pow(2, semis / 12), 0.04);
      h.voiceOn(g * (0.82 + Math.random() * 0.18), 0.03);
      const syllMs = 1000 / val(o.rate);
      h.at(syllMs * 0.62, () => h.ramp(h.nodes().voice.gain, g * 0.15, 0.04));
      left -= syllMs;
      h.at(syllMs, tick);
    };
    tick();
  }

  // —— v2: counting 1 to 10 on one breath ——
  V.define("countFade", (h) => {
    talk(h, { rate: 2.2, phraseMs: 5000, pauseMs: 1400, spread: 1.5, gain: (f) => 0.28 * (1 - 0.62 * f) });
  });
  V.define("countLoudStart", (h) => {
    talk(h, { rate: 2.2, phraseMs: 5000, pauseMs: 1400, spread: 1.5, gain: (f) => (f < 0.2 ? 0.5 : 0.25) });
  });

  // —— v13: five levels about 5 dB apart ——
  const LADDER = [0.03, 0.055, 0.1, 0.18, 0.32];
  function ladderVoice(h, gains) {
    let storyLevel = 2;
    talk(h, {
      rate: 3.5,
      phraseMs: () => (modeState()?.phase === "story" ? 1800 : 2600),
      pauseMs: 500,
      spread: 2,
      onPhrase: (n) => {
        // In the story: a different level each phrase, all five in turn
        storyLevel = [2, 0, 4, 1, 3][n % 5];
      },
      gain: () => {
        const st = modeState();
        if (!st || !st.seq) return gains[2];
        if (st.phase === "story") return gains[storyLevel];
        const lv = st.seq[Math.min(st.pos, st.seq.length - 1)];
        return gains[lv] != null ? gains[lv] : gains[2];
      }
    });
  }
  V.define("ladderSteps", (h) => ladderVoice(h, LADDER));
  V.define("ladderFlat", (h) => ladderVoice(h, [0.03, 0.055, 0.1, 0.1, 0.32]));

  // —— v20: the same message at four energies ——
  const TAKES = [
    { gain: 0.09, rate: 3.0, spread: 1.5 },
    { gain: 0.17, rate: 4.0, spread: 3.5 },
    { gain: 0.33, rate: 5.2, spread: 7 },
    { gain: 0.2, rate: 4.4, spread: 4 }
  ];
  function energyVoice(h, takes) {
    const cur = () => takes[Math.min(takes.length - 1, modeState()?.i || 0)];
    talk(h, {
      rate: () => cur().rate,
      phraseMs: 3000,
      pauseMs: 800,
      spread: () => cur().spread,
      gain: () => cur().gain
    });
  }
  V.define("energyTakes", (h) => energyVoice(h, TAKES));
  V.define("energyFlat", (h) =>
    energyVoice(
      h,
      TAKES.map((t) => ({ gain: t.gain, rate: 4, spread: 3 }))
    )
  );
})();
