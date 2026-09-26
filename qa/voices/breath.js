/**
 * Synthetic voices for the breath and SOVT pictures (js/scenes/breath.js):
 * lip trills that stall, an unvoiced "brrr", air through a straw with no
 * tone, an SH ladder with a long hold, a gap and pulses, and an S followed by
 * a sung /A/. Each is a failure case the default scenarios never produce.
 *
 * Loaded after qa/synthetic-voice.js by qa/drive-exercises.mjs and
 * tests/helpers/voice.js. Nothing here ships.
 */
(function () {
  "use strict";
  const V = window.__VTVoice;
  if (!V || !V.define) return;

  /**
   * An unvoiced lip trill is noise chopped 20–30 times a second with no pitch.
   * The shared synth only flutters the voiced path, so this builds its own
   * noise → low band → flutter → envelope chain once and reuses it. Every
   * "on" is scheduled with its own end on the audio clock, so a scenario cut
   * short by another one can never leave it sounding.
   */
  function brrr() {
    const n = V.h.nodes();
    if (!n) return null;
    if (V._brrr && V._brrr.ctx === n.dest.context) return V._brrr;
    const ctx = n.dest.context;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = true;
    const band = ctx.createBiquadFilter();
    band.type = "bandpass";
    band.frequency.value = 900;
    band.Q.value = 0.6;
    const flap = ctx.createGain();
    flap.gain.value = 0.5;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 24;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.48;
    lfo.connect(lfoDepth).connect(flap.gain);
    const env = ctx.createGain();
    env.gain.value = 0;
    src.connect(band).connect(flap).connect(env).connect(n.dest);
    src.start();
    lfo.start();
    V._brrr = { ctx, env, lfoDepth };
    return V._brrr;
  }

  /** Unvoiced brrr for `ms`, at level `g`. */
  function brrrFor(ms, g = 0.9) {
    const b = brrr();
    if (!b) return;
    const t = b.ctx.currentTime;
    const p = b.env.gain;
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.linearRampToValueAtTime(g, t + 0.08);
    p.setValueAtTime(g, t + ms / 1000 - 0.1);
    p.linearRampToValueAtTime(0, t + ms / 1000);
  }

  function silenceBrrr() {
    const b = V._brrr;
    if (!b) return;
    const t = b.ctx.currentTime;
    b.env.gain.cancelScheduledValues(t);
    b.env.gain.setValueAtTime(0, t);
  }

  // The harness stops a scenario with __VTVoice.stop(); make that silence the
  // brrr chain as well (a new play() starts from the synth's own stop()).
  const baseStop = V.stop;
  V.stop = () => {
    baseStop();
    silenceBrrr();
  };

  /**
   * s4 in one loop: 2.6 s of unvoiced brrr, then a voiced trill on the
   * piano's note whose lips stall for 0.9 s in the middle (the tone carries
   * on without its flutter), a breath, and a clean trill.
   */
  V.define("trillStops", (h) => {
    silenceBrrr();
    h.vibrato(8);
    h.startFollow(20);
    const loop = () => {
      brrrFor(2600);
      h.at(3000, () => {
        h.trillOn(0.85);
        h.voiceOn(0.3, 0.1);
      });
      h.at(5200, () => {
        h.nodes().trillDepth.gain.value = 0; // the lips stop, the voice does not
      });
      h.at(6100, () => h.trillOn(0.85));
      h.at(7600, () => h.voiceOff(0.12));
      h.at(8600, () => {
        h.trillOn(0.85);
        h.voiceOn(0.3, 0.1);
      });
      h.at(12600, () => h.voiceOff(0.12));
      h.at(13600, loop);
    };
    loop();
  });

  /** Only the unvoiced brrr: 3 s on, 1 s off. */
  V.define("airTrill", (h) => {
    silenceBrrr();
    h.phrases(3000, 1000, () => brrrFor(3000), () => {});
  });

  /**
   * s6's listed mistake: tone through the straw, then air only (no voice),
   * then a breath.
   */
  V.define("strawAir", (h) => {
    h.vibrato(6);
    h.startFollow(5);
    const loop = () => {
      h.voiceOn(0.18, 0.15);
      h.at(3200, () => {
        h.voiceOff(0.1);
        h.airOn(0.3, 0.1);
      });
      h.at(5600, () => h.airOff(0.1));
      h.at(6600, loop);
    };
    loop();
  });

  /**
   * The SH ladder: an 11 s even hiss (clears 5 s and 10 s), a rest, a hiss
   * with a 0.25 s gap in it (inside the hold-off, so one hold with a gap),
   * a rest, then a hiss that pulses four times a second.
   */
  V.define("airLadder", (h) => {
    h.airOn(0.35, 0.15);
    h.at(11000, () => h.airOff(0.2));
    h.at(14000, () => h.airOn(0.35, 0.15));
    h.at(17000, () => h.airOff(0.03));
    h.at(17250, () => h.airOn(0.35, 0.03));
    h.at(21000, () => h.airOff(0.2));
    h.at(23000, () => {
      h.airOn(0.35, 0.1);
      let up = false;
      const id = h.every(125, () => {
        up = !up;
        h.ramp(h.nodes().air.gain, up ? 0.35 : 0.05, 0.05);
      });
      h.at(6000, () => {
        clearInterval(id);
        h.airOff(0.2);
      });
    });
  });

  /** A single even hiss held for a long time (the 20–30 s rungs). */
  V.define("airHold", (h) => {
    h.airOn(0.35, 0.15);
  });

  /**
   * s8: an even S of 7 s, a breath, then a sung /A/ of 6 s on a comfortable
   * note, a breath, and again.
   */
  V.define("sThenA", (h) => {
    h.vibrato(6);
    const loop = () => {
      h.airOn(0.32, 0.15);
      h.at(7000, () => h.airOff(0.2));
      h.at(10000, () => {
        h.setPitch(150, 0.02);
        h.voiceOn(0.28, 0.12);
      });
      h.at(16000, () => h.voiceOff(0.15));
      h.at(19000, loop);
    };
    loop();
  });
})();
