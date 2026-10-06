/**
 * Synthetic speakers for the pace and timing drills (js/scenes/speech.js,
 * part two). Loaded after qa/synthetic-voice.js by the drive harness and the
 * specs; each scenario is written to exercise one thing the picture has to
 * show, including the ways a learner goes wrong.
 *
 * Knobs a spec can set on window before or during a take:
 *   __VTRateStepSec   seconds per rung for "rateSteps" (default 12)
 *   __VTSlowUntil     performance.now() until which "keyPoints" slows down
 *   __VTWhisper       { gain, swingDb, phraseMs, bands, q, lp, lpOrder }
 *                     for "speechWhisper" (default 0.03, about −30 dBFS
 *                     after the MIC gain, 6 dB, 3000 ms, band-passes at
 *                     [900, 2400] Hz with a Q of 1.2, and no low-pass)
 */
(function () {
  "use strict";
  const V = window.__VTVoice;
  if (!V || !V.define) return;

  /** Reads a page faster and faster: 3.6 → 4.4 → 5.2 → 6.0 syllables/s. */
  V.define("rateSteps", (h) => {
    const steps = [3.6, 4.4, 5.2, 6.0];
    const t0 = performance.now();
    const step = () => {
      const sec = (performance.now() - t0) / 1000;
      return steps[Math.min(steps.length - 1, Math.floor(sec / (window.__VTRateStepSec || 12)))];
    };
    h.speech({ syllPerSec: step, phraseMs: 3200, pauseMs: 650, spreadSemis: 3 });
  });

  /** Reads at one pace throughout: the ladder should show no steps. */
  V.define("rateFlat", (h) => {
    h.speech({ syllPerSec: 4.4, phraseMs: 3200, pauseMs: 650, spreadSemis: 3 });
  });

  /**
   * Hesitation sounds of different lengths, some silent pauses: a flat
   * "eee" of 0.9 s after the first phrase, a silent 1.1 s pause after the
   * second, a short 0.25 s "e" (too short to flag) after the third, then
   * round again.
   */
  V.define("fillerTalk", (h) => {
    const base = 128;
    let k = 0;
    // speech() loops forever, so this scenario drives its own syllables
    const phrase = (ms, then) => {
      const syl = 1000 / 4.6;
      let left = ms;
      const tick = () => {
        if (left <= 0) {
          h.voiceOff(0.05);
          then();
          return;
        }
        const semis = (Math.random() - 0.5) * 5;
        h.setPitch(base * Math.pow(2, semis / 12), 0.04);
        h.voiceOn(0.26 + Math.random() * 0.06, 0.03);
        h.at(syl * 0.62, () => h.ramp(h.nodes().voice.gain, 0.04, 0.04));
        left -= syl;
        h.at(syl, tick);
      };
      tick();
    };
    const filler = (ms, then) => {
      h.setPitch(base * 0.94, 0.02);
      h.voiceOn(0.22, 0.05);
      h.at(ms, () => {
        h.voiceOff(0.06);
        h.at(260, then);
      });
    };
    const loop = () => {
      const kind = k % 3;
      k++;
      phrase(2800, () => {
        if (kind === 0) h.at(300, () => filler(900, loop));
        else if (kind === 1) h.at(1100, loop);
        else h.at(300, () => filler(250, loop));
      });
    };
    loop();
  });

  /**
   * Talks at ~4.8 syllables/s; while slowed it drops to ~2.6 and then
   * leaves a 1.2 s pause — a key point landed. A spec sets __VTSlowSpec and
   * drives it with __VTSlowUntil (performance.now() ms); left alone, it
   * lands one by itself every ~11 s.
   */
  V.define("keyPoints", (h) => {
    const t0 = performance.now();
    let pauseNext = false;
    let lastSlow = false;
    const slowNow = () => {
      const now = performance.now();
      if (window.__VTSlowSpec) return now < (window.__VTSlowUntil || 0);
      const u = ((now - t0) / 1000) % 11;
      return u > 6.5 && u < 9.5;
    };
    const base = 132;
    const tick = () => {
      const slow = slowNow();
      if (lastSlow && !slow) pauseNext = true;
      lastSlow = slow;
      if (pauseNext) {
        pauseNext = false;
        h.voiceOff(0.05);
        h.at(1200, tick);
        return;
      }
      const rate = slow ? 2.6 : 4.8;
      const syl = 1000 / rate;
      const semis = (Math.random() - 0.5) * 4;
      h.setPitch(base * Math.pow(2, semis / 12), 0.04);
      h.voiceOn(0.27, 0.03);
      h.at(syl * 0.62, () => h.ramp(h.nodes().voice.gain, 0.04, 0.04));
      h.at(syl, tick);
    };
    tick();
  });

  /**
   * Whispered talk: no voice, only breath shaped by the mouth (noise through
   * band-passes at 900 and 2400 Hz), 4.5 syllables/s whose level swings only
   * `swingDb`, phrases of `phraseMs` (3 s) with 1.2 s pauses. It has no
   * period, so to the pause floor it is as aperiodic as a fan, and it holds
   * about as still as a fan's low rumble: only how high it sits tells them
   * apart. `lp` sends it through `lpOrder` low-passes at that many Hz (a
   * narrowband headset), which brings it down toward a rumble; `bands`
   * [5000, 7000] with a 1 dB swing is a held "sss" instead.
   */
  V.define("speechWhisper", (h) => {
    const o = Object.assign({ gain: 0.03, swingDb: 6, phraseMs: 3000, bands: [900, 2400], q: 1.2, lp: 0, lpOrder: 2 }, window.__VTWhisper);
    const n = h.nodes();
    if (!n.whisper) {
      const ac = n.dest.context;
      const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      const src = ac.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      n.whisper = ac.createGain();
      n.whisper.gain.value = 0;
      o.bands.forEach((f) => {
        const bp = ac.createBiquadFilter();
        bp.type = "bandpass";
        bp.frequency.value = f;
        bp.Q.value = o.q;
        src.connect(bp).connect(n.whisper);
      });
      let out = n.whisper;
      for (let k = 0; o.lp && k < o.lpOrder; k++) {
        const lp = ac.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = o.lp;
        out = out.connect(lp);
      }
      out.connect(n.dest);
      src.start();
    }
    const low = Math.pow(10, -o.swingDb / 20);
    const syl = 1000 / 4.5;
    let inPhrase = false;
    let left = 0;
    const tick = () => {
      if (!inPhrase) {
        inPhrase = true;
        left = o.phraseMs;
      }
      if (left <= 0) {
        inPhrase = false;
        h.ramp(n.whisper.gain, 0, 0.05);
        h.at(1200, tick);
        return;
      }
      h.ramp(n.whisper.gain, o.gain * (0.8 + Math.random() * 0.2), 0.03);
      h.at(syl * 0.62, () => h.ramp(n.whisper.gain, o.gain * low, 0.04));
      left -= syl;
      h.at(syl, tick);
    };
    tick();
  });

  /**
   * A metaphor minute: 2.4 s before the first word, phrases, then a 2.2 s
   * search for words, more phrases.
   */
  V.define("topicTalk", (h) => {
    let k = 0;
    h.at(2400, () =>
      h.speech({
        syllPerSec: 4.2,
        phraseMs: () => (k++ % 3 === 2 ? 1800 : 3000),
        pauseMs: () => (k % 3 === 0 ? 2200 : 700),
        spreadSemis: 3
      })
    );
  });

  /**
   * Curiosity loops played solo: speaks through "your" 10 s, keeps quiet
   * through "their" 20 s — except for 2 s of interrupting in the second
   * listening window.
   */
  V.define("turnTaking", (h) => {
    const t0 = performance.now();
    h.speech({
      syllPerSec: 4.4,
      phraseMs: 2600,
      pauseMs: 500,
      gain: () => {
        const u = ((performance.now() - t0) / 1000) % 60;
        // your turns: 0–10 s and 30–40 s; an interruption at 52–54 s
        const talking = (u > 0.3 && u < 9.3) || (u > 30.3 && u < 39.3) || (u > 52 && u < 54);
        return talking ? 0.28 : 0;
      }
    });
  });

  /**
   * Counting aloud, one number per burst: eight at an unhurried ~1.2 s,
   * six rushed at ~0.55 s, then unhurried again.
   */
  V.define("countNumbers", (h) => {
    let n = 0;
    const base = 120;
    const next = () => {
      n++;
      const rushed = n > 8 && n <= 14;
      const on = rushed ? 300 : 440;
      const gap = rushed ? 250 : 760;
      h.setPitch(base * Math.pow(2, ((n % 4) - 1.5) / 12), 0.03);
      h.voiceOn(0.26, 0.03);
      h.at(on * 0.5, () => h.setPitch(base * 0.93, 0.08));
      h.at(on, () => h.voiceOff(0.04));
      h.at(on + gap, next);
    };
    h.at(300, next);
  });
})();
