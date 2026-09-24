/**
 * Synthetic voices for the resonance pictures (s20–s26): vowels with real
 * formants, a rough low voice, speech against singing, a brighter "YA", a
 * soft-then-loud NANA, and two A/B takes. Loaded after qa/synthetic-voice.js.
 *
 * The base voice is a sawtooth through a low-pass. For vowels the sawtooth is
 * re-routed through a cascade of three resonators (F1, F2, F3), which is
 * enough for the app's formant reader to find the first two resonances.
 */
(function () {
  "use strict";
  const V = window.__VTVoice;
  if (!V || !V.define) return;

  // Rough male-voice formants (Hz) for the five Spanish vowels
  const VOWEL_F = { I: [300, 2200, 2900], E: [450, 1900, 2600], A: [700, 1250, 2600], O: [480, 900, 2500], U: [320, 780, 2400] };

  /**
   * Route the oscillator through a cascade of three resonators (low-pass
   * biquads with a resonant peak: an all-pole formant filter, like a vocal
   * tract model) once; returns a setter for the vowel.
   */
  function formantBank(h) {
    const n = h.nodes();
    if (n._bank) return n._bank;
    const ctx = V.ctx;
    n.osc.disconnect();
    const bands = [0, 1, 2].map(() => {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      return f;
    });
    const out = ctx.createGain();
    out.gain.value = 0.5;
    n.osc.connect(bands[0]).connect(bands[1]).connect(bands[2]).connect(out).connect(n.tone);
    n.tone.frequency.value = 4500;
    const bw = [90, 110, 160];
    const set = (vowel, sec = 0.08) => {
      const f = VOWEL_F[vowel] || VOWEL_F.A;
      bands.forEach((b, i) => {
        h.ramp(b.frequency, f[i], sec);
        h.ramp(b.Q, 20 * Math.log10(f[i] / bw[i]), sec); // Q in dB for WebAudio low-pass
      });
    };
    n._bank = set;
    return set;
  }

  /** Broadband breath noise (the base voice's air is a narrow hiss). */
  let rough = null;
  function roughOn(g) {
    const ctx = V.ctx;
    if (!rough) {
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3000;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(lp).connect(gain).connect(V.nodes.dest);
      src.start();
      rough = gain;
    }
    V.h.ramp(rough.gain, g, 0.08);
  }
  function roughOff() {
    if (rough) V.h.ramp(rough.gain, 0, 0.05);
  }

  function panelFocus() {
    const p = document.querySelector("#mode-focus .mode-panel, #mode-hud .mode-panel");
    return (p && p.dataset.focus) || "";
  }

  /**
   * s20: follows the mode's current vowel ([data-cur]) on the reference note.
   * A is sung ~4 dB louder than the rest and U sits ~35 cents flat, so the
   * stamps have something to show; a short breath at each round's start.
   */
  V.define("vowels", (h) => {
    const set = formantBank(h);
    h.vibrato(10);
    let last = "";
    const tick = () => {
      const cur = (document.querySelector("[data-cur]")?.textContent || "A").trim();
      if (cur !== last) {
        set(cur, 0.12);
        if (cur === "I" && last) {
          h.voiceOff(0.05);
          h.at(260, () => h.voiceOn(0.26, 0.08));
        } else h.voiceOn(cur === "A" ? 0.41 : 0.26, 0.15);
        last = cur;
      }
      const c = cur === "U" ? -35 : cur === "E" ? 8 : 0;
      h.setPitch(h.targetHz() * Math.pow(2, c / 1200), 0.06);
    };
    set("I", 0);
    h.voiceOn(0.26, 0.08);
    h.every(40, tick);
  });

  /**
   * s21–s25: follows each target note in phrases, with a per-exercise twist
   * read from the panel's data-focus:
   * - body: every third phrase is rough (broadband breath noise, softer tone)
   * - speech: short spoken bursts between sung notes
   * - bright: follows the drill's phases; the first exaggerated phrase is
   *   only louder, the next ones brighter
   * - soft: starts soft, the third phrase is pushed ~6 dB louder
   * - seams / default: plain phrases
   */
  V.define("zones", (h) => {
    const focus = panelFocus();
    const n = h.nodes();
    h.vibrato(12);
    h.startFollow(6);
    let k = 0;
    if (focus === "speech") {
      // spoken "hola, hola" around the speaking pitch, then a sung note
      const cycle = () => {
        const base = h.targetHz();
        let s = 0;
        const syl = () => {
          if (s >= 8) {
            h.voiceOff(0.05);
            h.at(500, () => {
              h.voiceOn(0.3, 0.06);
              h.at(2600, () => {
                h.voiceOff(0.08);
                h.at(700, cycle);
              });
            });
            return;
          }
          V.follow && clearInterval(V.follow);
          const up = s % 2 ? 3 : -1;
          h.setPitch(base * Math.pow(2, (up + (s % 4 === 3 ? -3 : 0)) / 12), 0.05);
          h.voiceOn(0.24, 0.02);
          h.at(150, () => h.voiceOff(0.03));
          s++;
          h.at(s % 4 === 0 ? 420 : 230, syl);
        };
        syl();
        // back to following for the sung part
        h.at(8 * 250 + 500, () => h.startFollow(4));
      };
      cycle();
      return;
    }
    const modeState = () => {
      try {
        return window.VTApp?.getState?.()?.modeInstance?.state || {};
      } catch {
        return {};
      }
    };
    let eLouder = false;
    h.phrases(
      3600,
      900,
      () => {
        k++;
        let g = 0.28;
        if (focus === "soft") g = k === 3 || k === 4 ? 0.6 : 0.2;
        if (focus === "bright") {
          // Follows the drill's phase: normal, exaggerated (the first phrase
          // only louder — the usual mistake), kept bright, balanced back
          const p = modeState().br?.p || 0;
          n.tone.frequency.value = p === 0 ? 2400 : p === 1 ? 6500 : p === 2 ? 5000 : 3000;
          if (p === 1 && !eLouder) {
            eLouder = true;
            n.tone.frequency.value = 2400;
            g = 0.6;
          }
        }
        if (focus === "body" && k % 3 === 0) roughOn(0.3);
        else roughOff();
        h.voiceOn(focus === "body" && k % 3 === 0 ? 0.18 : g, 0.06);
      },
      () => {
        h.voiceOff(0.08);
        roughOff();
      }
    );
  });

  /**
   * s26: two takes of one short phrase. Take A plain; take B the same melody,
   * ~2 dB louder and brighter, so the facts show a level difference to fix.
   */
  V.define("abTakes", (h) => {
    const n = h.nodes();
    h.vibrato(10);
    const base = 146.83; // D3
    const tune = [0, 2, 4, 5, 4, 2, 0];
    const phrase = (gain, cutoff, done) => {
      n.tone.frequency.value = cutoff;
      let i = 0;
      h.setPitch(base, 0.01);
      h.voiceOn(gain, 0.06);
      const step = () => {
        if (i >= tune.length) {
          h.voiceOff(0.1);
          if (done) done();
          return;
        }
        h.setPitch(base * Math.pow(2, tune[i] / 12), 0.05);
        i++;
        h.at(620, step);
      };
      step();
    };
    h.at(300, () =>
      phrase(0.26, 2400, () =>
        h.at(2400, () => phrase(0.34, 3800, null))
      )
    );
  });
})();
