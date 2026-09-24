/**
 * Synthetic voice for driving exercises without a person at the microphone.
 *
 * Injected with page.addInitScript. Replaces getUserMedia with a stream from a
 * small synth: a band-limited sawtooth (the voice), a band-passed noise source
 * (air: SH, S, breath) and two LFOs (vibrato on pitch, lip-trill flutter on
 * level). window.__VTVoice.play(name) runs one of the named scenarios below,
 * each written to look like a learner doing that kind of exercise reasonably
 * well; the "sloppy" variants drift and wobble so a visual can be judged on
 * what it shows when things go wrong.
 *
 * Nothing here ships to users: it lives in qa/ and is only read by
 * qa/drive-exercises.mjs and the exercise-visual specs.
 */
(function () {
  "use strict";
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC || !navigator.mediaDevices) return;

  const V = {
    ctx: null,
    nodes: null,
    timers: [],
    follow: null,
    followCents: 0,
    scenario: "silent",
    log: []
  };

  function build() {
    if (V.ctx) return V.nodes.dest.stream;
    const ctx = new AC();
    const dest = ctx.createMediaStreamDestination();
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.value = 130.81;
    const tone = ctx.createBiquadFilter();
    tone.type = "lowpass";
    tone.frequency.value = 2400;
    tone.Q.value = 0.7;
    const flutter = ctx.createGain(); // lip-trill amplitude flutter
    flutter.gain.value = 1;
    const voice = ctx.createGain();
    voice.gain.value = 0;
    osc.connect(tone).connect(flutter).connect(voice).connect(dest);

    const vib = ctx.createOscillator();
    vib.frequency.value = 5.5;
    const vibDepth = ctx.createGain();
    vibDepth.gain.value = 0; // cents
    vib.connect(vibDepth).connect(osc.detune);

    const trill = ctx.createOscillator();
    trill.frequency.value = 27;
    const trillDepth = ctx.createGain();
    trillDepth.gain.value = 0;
    trill.connect(trillDepth).connect(flutter.gain);

    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const hiss = ctx.createBiquadFilter();
    hiss.type = "bandpass";
    hiss.frequency.value = 4200;
    hiss.Q.value = 0.9;
    const air = ctx.createGain();
    air.gain.value = 0;
    noise.connect(hiss).connect(air).connect(dest);

    osc.start();
    vib.start();
    trill.start();
    noise.start();
    V.ctx = ctx;
    V.nodes = { dest, osc, voice, vibDepth, trillDepth, air, flutter, tone };
    return dest.stream;
  }

  navigator.mediaDevices.getUserMedia = async () => build();

  const now = () => V.ctx.currentTime;
  function ramp(param, value, sec) {
    const t = now();
    param.cancelScheduledValues(t);
    param.setValueAtTime(param.value, t);
    if (sec > 0) param.linearRampToValueAtTime(value, t + sec);
    else param.setValueAtTime(value, t);
  }
  function setPitch(hz, sec = 0.03) {
    if (!V.ctx || !hz) return;
    const p = V.nodes.osc.frequency;
    const t = now();
    p.cancelScheduledValues(t);
    p.setValueAtTime(p.value, t);
    p.exponentialRampToValueAtTime(hz, t + Math.max(0.01, sec));
  }
  function voiceOn(g = 0.3, sec = 0.05) {
    ramp(V.nodes.voice.gain, g, sec);
  }
  function voiceOff(sec = 0.08) {
    ramp(V.nodes.voice.gain, 0, sec);
  }
  function airOn(g = 0.35, sec = 0.1) {
    ramp(V.nodes.air.gain, g, sec);
  }
  function airOff(sec = 0.1) {
    ramp(V.nodes.air.gain, 0, sec);
  }
  function vibrato(cents) {
    V.nodes.vibDepth.gain.value = cents;
  }
  function trillOn(depth = 0.85) {
    V.nodes.trillDepth.gain.value = depth;
  }
  function at(ms, fn) {
    V.timers.push(setTimeout(fn, ms));
  }
  function every(ms, fn) {
    const id = setInterval(fn, ms);
    V.timers.push(id);
    return id;
  }

  function targetHz() {
    try {
      const st = window.VTApp?.getState?.();
      return st?.practice?.targetFreq || st?.pitchViz?.targetFreq || 130.81;
    } catch {
      return 130.81;
    }
  }
  /** Follow the app's current target, offset by `cents` (can be a function of time). */
  function startFollow(cents = 0) {
    V.followCents = cents;
    const t0 = performance.now();
    V.follow = every(40, () => {
      const c = typeof V.followCents === "function" ? V.followCents((performance.now() - t0) / 1000) : V.followCents;
      setPitch(targetHz() * Math.pow(2, c / 1200), 0.06);
    });
  }

  function stop() {
    V.timers.forEach((id) => {
      clearTimeout(id);
      clearInterval(id);
    });
    V.timers = [];
    if (V.ctx) {
      voiceOff(0.02);
      airOff(0.02);
      vibrato(0);
      V.nodes.trillDepth.gain.value = 0;
    }
  }

  /** Phrase loop: on for onMs, off for offMs, forever. */
  function phrases(onMs, offMs, onFn, offFn) {
    let on = false;
    const tick = () => {
      on = !on;
      if (on) onFn();
      else offFn();
      V.timers.push(setTimeout(tick, on ? onMs : offMs));
    };
    tick();
  }

  // Speech-like syllable train: ~4.5 syllables/s, intonation moves per syllable.
  function speech({ baseHz = 135, spreadSemis = 4, syllPerSec = 4.5, phraseMs = 3000, pauseMs = 1200, gain = 0.28, fillers = false } = {}) {
    let inPhrase = false;
    let phraseLeft = 0;
    const syllMs = 1000 / syllPerSec;
    let n = 0;
    const tick = () => {
      if (!inPhrase) {
        inPhrase = true;
        phraseLeft = phraseMs;
      }
      if (phraseLeft <= 0) {
        inPhrase = false;
        voiceOff(0.05);
        // filler: a flat "ehhh" of 600 ms in some pauses
        if (fillers && n % 2 === 0) {
          at(250, () => {
            setPitch(baseHz * 0.95, 0.02);
            voiceOn(gain * 0.7, 0.04);
          });
          at(850, () => voiceOff(0.05));
        }
        n++;
        V.timers.push(setTimeout(tick, pauseMs));
        return;
      }
      const semis = (Math.sin(phraseLeft / 400 + n) * 0.5 + (Math.random() - 0.5)) * spreadSemis;
      setPitch(baseHz * Math.pow(2, semis / 12), 0.04);
      voiceOn(gain * (0.75 + Math.random() * 0.25), 0.03);
      V.timers.push(setTimeout(() => ramp(V.nodes.voice.gain, gain * 0.15, 0.04), syllMs * 0.62));
      phraseLeft -= syllMs;
      V.timers.push(setTimeout(tick, syllMs));
    };
    tick();
  }

  const SCENARIOS = {
    silent() {},
    follow() {
      vibrato(12);
      startFollow(8);
      phrases(3600, 900, () => voiceOn(0.3, 0.12), () => voiceOff(0.15));
    },
    followSloppy() {
      vibrato(30);
      startFollow((t) => 55 * Math.sin(t * 0.7) + 25);
      phrases(2600, 1100, () => voiceOn(0.26, 0.2), () => voiceOff(0.1));
    },
    trill() {
      vibrato(8);
      trillOn(0.85);
      startFollow(20);
      phrases(4200, 1000, () => voiceOn(0.3, 0.1), () => voiceOff(0.12));
    },
    straw() {
      vibrato(6);
      startFollow(5);
      phrases(4200, 1000, () => voiceOn(0.18, 0.15), () => voiceOff(0.15));
    },
    siren() {
      vibrato(0);
      voiceOn(0.3, 0.1);
      let up = true;
      const glide = () => {
        setPitch(up ? 330 : 110, 2.8);
        up = !up;
        V.timers.push(setTimeout(glide, 3000));
      };
      setPitch(110, 0.01);
      glide();
    },
    air() {
      phrases(5200, 1600, () => airOn(0.35, 0.15), () => airOff(0.2));
    },
    breath() {
      // quiet inhale noise, long steady exhale hiss
      phrases(4000, 3000, () => airOn(0.18, 0.4), () => airOff(0.4));
    },
    speech() {
      speech({});
    },
    speechFillers() {
      speech({ fillers: true, pauseMs: 1000 });
    },
    speechMonotone() {
      speech({ spreadSemis: 0.4 });
    },
    count() {
      speech({ syllPerSec: 2, phraseMs: 5000, pauseMs: 1400, spreadSemis: 1.5 });
    },
    ladder() {
      let g = 0.06;
      speech({ syllPerSec: 2, phraseMs: 4000, pauseMs: 1000, spreadSemis: 1.5, gain: g });
      every(5000, () => {
        g = Math.min(0.5, g * 1.7);
      });
    },
    swell() {
      vibrato(10);
      startFollow(6);
      phrases(
        6000,
        1200,
        () => {
          const t = now();
          const gp = V.nodes.voice.gain;
          gp.cancelScheduledValues(t);
          gp.setValueAtTime(0.02, t);
          gp.linearRampToValueAtTime(0.45, t + 3);
          gp.linearRampToValueAtTime(0.02, t + 6);
        },
        () => voiceOff(0.05)
      );
    },
    staccato() {
      vibrato(4);
      startFollow(6);
      let k = 0;
      const tick = () => {
        k++;
        if (k % 12 < 8) {
          voiceOn(0.32, 0.01);
          V.timers.push(setTimeout(() => voiceOff(0.02), 180));
          V.timers.push(setTimeout(tick, 480));
        } else {
          voiceOn(0.3, 0.05);
          V.timers.push(setTimeout(tick, 900));
        }
      };
      tick();
    },
    onset() {
      vibrato(6);
      startFollow(4);
      let hard = true;
      const tick = () => {
        if (hard) {
          voiceOn(0.42, 0.003);
        } else {
          airOn(0.2, 0.2);
          V.timers.push(setTimeout(() => voiceOn(0.28, 0.35), 280));
          V.timers.push(setTimeout(() => airOff(0.2), 600));
        }
        V.timers.push(setTimeout(() => voiceOff(0.08), 1500));
        hard = !hard;
        V.timers.push(setTimeout(tick, 2600));
      };
      tick();
    }
  };

  V.play = (name) => {
    stop();
    V.scenario = name;
    if (!V.ctx) build();
    if (V.ctx.state === "suspended") V.ctx.resume();
    (SCENARIOS[name] || SCENARIOS.silent)();
  };
  V.stop = stop;
  V.scenarios = Object.keys(SCENARIOS);
  window.__VTVoice = V;
})();
