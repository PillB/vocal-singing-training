/**
 * Synthetic singers for the dynamics family (s11 swells, s12 onsets, s14
 * staccato / legato). Loaded after qa/synthetic-voice.js by the drive harness
 * and the specs; each scenario is written to look like a learner doing the
 * drill, and the "sloppy" ones make the mistakes each picture must show.
 */
(function () {
  "use strict";
  const V = window.__VTVoice;
  if (!V || !V.define) return;

  /** The note the app is asking for, or a comfortable C3. */
  function base(h) {
    const f = h.targetHz();
    return f && f > 60 && f < 500 ? f : 130.81;
  }
  const cents = (hz, c) => hz * Math.pow(2, c / 1200);

  /**
   * One messa di voce: `riseDb` above a soft start and back over `sec`, the
   * pitch riding up `sharpC` cents at the peak (0 = steady). The gain follows
   * a raised cosine in dB, which is what the guide draws.
   */
  function swellOnce(h, { sec = 7, soft = 0.07, riseDb = 12, sharpC = 0 } = {}) {
    const hz = base(h);
    h.setPitch(hz, 0.02);
    const steps = Math.round(sec * 20);
    const g = h.nodes().voice.gain;
    const t0 = h.now() + 0.02;
    g.cancelScheduledValues(t0);
    g.setValueAtTime(0.0001, t0);
    g.linearRampToValueAtTime(soft, t0 + 0.12);
    for (let i = 1; i <= steps; i++) {
      const u = i / steps;
      const db = (riseDb * (1 - Math.cos(2 * Math.PI * u))) / 2;
      g.linearRampToValueAtTime(soft * Math.pow(10, db / 20), t0 + 0.12 + u * (sec - 0.12));
    }
    g.linearRampToValueAtTime(0.0001, t0 + sec + 0.1);
    if (sharpC) {
      // Pitch rides the level: up to +sharpC at the peak
      for (let i = 0; i <= 20; i++) {
        const u = i / 20;
        h.at(u * sec * 1000, () => h.setPitch(cents(hz, sharpC * Math.sin(Math.PI * u) ** 2), 0.08));
      }
    }
  }

  /** Swells with a rest between them, forever. */
  function swellLoop(h, opts, restMs = 2600, firstMs = 300) {
    h.vibrato(opts.vibrato != null ? opts.vibrato : 10);
    const loop = () => {
      swellOnce(h, opts);
      h.at(opts.sec * 1000 + restMs, loop);
    };
    h.at(firstMs, loop);
  }

  // A learner doing it well: 7 s, +12 dB, pitch within a few cents
  V.define("swellCoach", (h) => swellLoop(h, { sec: 7, riseDb: 12, sharpC: 6 }));
  // Pitch rides up with the volume (the exercise's named mistake)
  V.define("swellSharp", (h) => swellLoop(h, { sec: 7, riseDb: 16, sharpC: 38 }));
  // Hardly any swell (or a device that evens the level out)
  V.define("swellFlat", (h) => swellLoop(h, { sec: 7, riseDb: 3, sharpC: 0 }));

  /* —— Onsets —— */

  /** abrupt: a spike well above the level it settles at, from silence */
  function abrupt(h) {
    h.setPitch(base(h), 0.01);
    const g = h.nodes().voice.gain;
    const t = h.now() + 0.01;
    g.cancelScheduledValues(t);
    g.setValueAtTime(0.0001, t);
    g.linearRampToValueAtTime(0.62, t + 0.003);
    g.linearRampToValueAtTime(0.3, t + 0.07);
  }
  /** breathy: air first, the tone arrives late and slowly */
  function breathy(h) {
    h.setPitch(base(h), 0.01);
    h.airOn(0.22, 0.06);
    h.at(200, () => h.voiceOn(0.3, 0.26));
    h.at(560, () => h.airOff(0.2));
  }
  /** balanced: tone from the first moment, a smooth rise of ~60 ms, no spike */
  function balanced(h) {
    h.setPitch(base(h), 0.01);
    h.voiceOn(0.3, 0.06);
  }
  const KINDS = { abrupt, breathy, balanced };

  /** Play `seq` of onset kinds, each held `holdMs` then silence until `everyMs`. */
  function onsetSeq(h, seq, { everyMs = 1900, holdMs = 1000, firstMs = 900, loop = true } = {}) {
    h.vibrato(6);
    let i = 0;
    const tick = () => {
      if (i >= seq.length) {
        if (!loop) return;
        i = loop === true ? 0 : loop;
      }
      const k = seq[i++];
      KINDS[k](h);
      h.at(holdMs, () => h.voiceOff(0.08));
      h.at(everyMs, tick);
    };
    h.at(firstMs, tick);
  }

  // The drill as the exercise asks: two of each on purpose, then easy reps
  // with the odd breathy or abrupt one in between
  V.define("onsetContrast", (h) =>
    onsetSeq(
      h,
      ["abrupt", "abrupt", "breathy", "breathy", "balanced", "balanced", "balanced", "balanced", "breathy", "balanced", "balanced", "abrupt", "balanced", "balanced"],
      { loop: 6 }
    )
  );
  // Nothing but easy onsets (the reps without the contrast)
  V.define("onsetBalanced", (h) => onsetSeq(h, ["balanced"]));
  // Every start breathy: the chronic "h" the exercise names
  V.define("onsetBreathy", (h) => onsetSeq(h, ["breathy"]));

  /* —— Staccato / legato —— */

  /** The phase the practice mode is in: "staccato" or "legato". */
  function phaseKind() {
    try {
      return window.VTApp?.getState?.()?.modeInstance?.state?.phaseKind || "staccato";
    } catch {
      return "staccato";
    }
  }
  const PATTERN = [0, 2, 4, 2, 0];

  /**
   * A learner who follows the phase: staccato = short notes (~0.18 s) with
   * clean gaps; legato = the same pattern as one connected line. `sloppy`
   * lets staccato notes run long and breaks the legato line between notes.
   */
  function articulation(h, sloppy) {
    h.vibrato(5);
    const staccatoPattern = (done) => {
      const hz = base(h);
      let k = 0;
      const note = () => {
        if (k >= PATTERN.length) return h.at(520, done);
        h.setPitch(hz * Math.pow(2, PATTERN[k] / 12), 0.01);
        h.voiceOn(0.32, sloppy ? 0.004 : 0.03);
        const len = sloppy && k % 2 ? 420 : 180;
        h.at(len, () => h.voiceOff(0.02));
        k++;
        h.at(len + (sloppy ? 90 : 260), note);
      };
      note();
    };
    const legatoPattern = (done) => {
      const hz = base(h);
      let k = 0;
      h.setPitch(hz, 0.01);
      h.voiceOn(0.3, 0.08);
      const step = () => {
        if (k >= PATTERN.length) {
          h.voiceOff(0.1);
          return h.at(700, done);
        }
        h.setPitch(hz * Math.pow(2, PATTERN[k] / 12), 0.05);
        if (sloppy && k > 0) {
          // A break in the line: the tone stops for ~150 ms between notes
          h.voiceOff(0.02);
          h.at(150, () => h.voiceOn(0.3, 0.02));
        }
        k++;
        h.at(560, step);
      };
      step();
    };
    const loop = () => (phaseKind() === "legato" ? legatoPattern(loop) : staccatoPattern(loop));
    h.at(400, loop);
  }
  V.define("articulation", (h) => articulation(h, false));
  V.define("articulationSloppy", (h) => articulation(h, true));
})();
