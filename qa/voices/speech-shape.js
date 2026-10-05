/**
 * Synthetic speakers for the speech-shape pictures (melody, landings,
 * concision gate, story arc). Loaded after qa/synthetic-voice.js by the drive
 * harness and the specs. The stock "speech" voice moves ±4 st at random and
 * never ends a phrase on purpose, so nothing about an ending can be checked
 * with it; these voices end their phrases deliberately (a fall, a rise, a
 * level ending), add a tag question, hold the thinking silence, and raise
 * their loudness and slow down for a story's peak.
 */
(function () {
  "use strict";
  const V = window.__VTVoice;
  if (!V || !V.define) return;

  /** Deterministic "random": a scenario sounds the same on every run. */
  function rng(seed) {
    let s = seed >>> 0 || 1;
    return () => {
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /**
   * One phrase starting at `at0` ms: syllables around baseHz (±spread/2
   * semitones), then a last word of `endMs` that glides `endSemis` semitones
   * (negative = a fall). Returns its length in ms.
   */
  function phrase(h, at0, o) {
    const base = o.baseHz || 150;
    const syllMs = 1000 / (o.syll || 4.5);
    const endMs = o.endMs != null ? o.endMs : 450;
    const bodyMs = Math.max(syllMs, (o.ms || 2000) - endMs);
    const n = Math.max(1, Math.round(bodyMs / syllMs));
    const g = o.gain || 0.28;
    const rnd = o.rnd || Math.random;
    const spread = o.spread != null ? o.spread : 3;
    for (let i = 0; i < n; i++) {
      const s = (rnd() - 0.5) * spread;
      const gi = g * (0.8 + rnd() * 0.2);
      h.at(at0 + i * syllMs, () => {
        h.setPitch(base * Math.pow(2, s / 12), 0.04);
        h.voiceOn(gi, 0.03);
      });
      h.at(at0 + i * syllMs + syllMs * 0.62, () => h.ramp(h.nodes().voice.gain, gi * 0.15, 0.04));
    }
    const t0 = at0 + n * syllMs;
    const endHz = base * Math.pow(2, (o.endSemis || 0) / 12);
    h.at(t0, () => {
      h.setPitch(base, 0.03);
      h.voiceOn(g * 0.9, 0.03);
    });
    h.at(t0 + 40, () => h.setPitch(endHz, Math.max(0.05, (endMs - 60) / 1000)));
    h.at(t0 + endMs * 0.5, () => h.ramp(h.nodes().voice.gain, g * 0.7, 0.05));
    h.at(t0 + endMs * 0.5 + 60, () => h.voiceOn(g * 0.85, 0.04));
    h.at(t0 + endMs, () => h.voiceOff(0.06));
    return n * syllMs + endMs;
  }

  /** A held, flat "eeh" of `ms`. */
  function filler(h, at0, ms, hz, gain) {
    h.at(at0, () => {
      h.setPitch(hz, 0.02);
      h.voiceOn(gain, 0.04);
    });
    h.at(at0 + ms, () => h.voiceOff(0.05));
  }

  /** Run `plan` ([ms, endSemis, pauseMs, extra]) over and over for `totalMs`. */
  function loop(h, plan, o, totalMs = 120000) {
    const rnd = rng(o.seed || 7);
    let t = o.startMs || 0;
    while (t < totalMs) {
      for (const [ms, end, pause, extra] of plan) {
        t += phrase(h, t, Object.assign({ rnd }, o, { ms, endSemis: end }, extra || {}));
        t += pause;
      }
    }
  }

  // Melodic speech: wide melody, endings that fall, rise and stay level
  V.define("cadence", (h) => {
    loop(
      h,
      [
        [2200, -4.5, 1300],
        [2000, 3.5, 1000],
        [2600, -3.5, 1500],
        [1800, 0, 900],
        [2400, -5, 1400],
        [2000, 3, 1100]
      ],
      { baseHz: 150, spread: 6, seed: 11 }
    );
  });

  // The flat baseline: almost no melody, level endings
  V.define("cadenceFlat", (h) => {
    loop(h, [[2400, 0, 1200], [2000, 0, 1000]], { baseHz: 150, spread: 0.6, seed: 5 });
  });

  // Claims: a fall with a full pause; a rise; a fall with a "¿no?" tag; a
  // fall with too short a pause; a fall with a full pause
  V.define("claims", (h) => {
    const rnd = rng(3);
    const base = 150;
    let t = 300;
    for (let rep = 0; rep < 8; rep++) {
      t += phrase(h, t, { rnd, baseHz: base, ms: 1900, endSemis: -4.5, spread: 3 }) + 1500;
      t += phrase(h, t, { rnd, baseHz: base, ms: 2000, endSemis: 3.5, spread: 3 }) + 1400;
      t += phrase(h, t, { rnd, baseHz: base, ms: 1800, endSemis: -4, spread: 3 }) + 350;
      t += phrase(h, t, { rnd, baseHz: base, ms: 400, endMs: 330, syll: 8, endSemis: 5, spread: 0, gain: 0.24 }) + 1500;
      t += phrase(h, t, { rnd, baseHz: base, ms: 2100, endSemis: -4, spread: 3 }) + 600;
      t += phrase(h, t, { rnd, baseHz: base, ms: 1900, endSemis: -5, spread: 3 }) + 1500;
    }
  });

  // Every claim rises at the end (the anti-pattern round)
  V.define("claimsRising", (h) => {
    loop(h, [[2000, 4, 1500]], { baseHz: 150, spread: 3, seed: 9, startMs: 300 });
  });

  // Question and answer: think in silence, answer with pauses, stop;
  // then an "eeh" in the thinking time; then an answer that starts early
  V.define("qaGate", (h) => {
    const rnd = rng(21);
    const o = { rnd, baseHz: 150, spread: 4 };
    let t = 0;
    for (let rep = 0; rep < 6; rep++) {
      t += 3000;
      t += phrase(h, t, Object.assign({}, o, { ms: 2400, endSemis: 0 })) + 700;
      t += phrase(h, t, Object.assign({}, o, { ms: 2200, endSemis: 0 })) + 700;
      t += phrase(h, t, Object.assign({}, o, { ms: 2600, endSemis: -4 })) + 2600;
      t += 800;
      filler(h, t, 550, 143, 0.2);
      t += 550 + 2300;
      t += phrase(h, t, Object.assign({}, o, { ms: 2200, endSemis: 0 })) + 700;
      t += phrase(h, t, Object.assign({}, o, { ms: 2400, endSemis: -4 })) + 2600;
      t += 600;
      t += phrase(h, t, Object.assign({}, o, { ms: 2600, endSemis: 0 })) + 600;
      t += phrase(h, t, Object.assign({}, o, { ms: 2200, endSemis: -4 })) + 2600;
    }
  });

  // A story: a quiet, quick context (0–10.2 s); a 1.5 s pause; a louder,
  // slower peak (11.7–21.1 s); a falling last sentence (21.6–23.8 s) and silence
  V.define("story", (h) => {
    const rnd = rng(31);
    const ctx = { rnd, baseHz: 150, endSemis: 0, spread: 2, syll: 4.8, gain: 0.13 };
    let t = 0;
    for (const ms of [2400, 2400, 2400]) t += phrase(h, t, Object.assign({}, ctx, { ms })) + 600;
    t += phrase(h, t, Object.assign({}, ctx, { ms: 1200 }));
    t += 1500;
    for (let i = 0; i < 3; i++) {
      t += phrase(h, t, { rnd, baseHz: 160, ms: 2800, endSemis: -2, spread: 5, syll: 3.2, gain: 0.42 }) + 500;
    }
    t += phrase(h, t, { rnd, baseHz: 150, ms: 2200, endSemis: -5, spread: 2, gain: 0.25 });
  });
})();
