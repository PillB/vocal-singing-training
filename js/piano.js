/**
 * Realistic multi-partial piano for mid-lower male practice range.
 * Roots and voicings sit roughly C2–E4 (baritone-friendly).
 */
(function (global) {
  "use strict";

  const NOTE_FREQ = {
    C2: 65.41, D2: 73.42, E2: 82.41, F2: 87.31, G2: 98.0, A2: 110.0, B2: 123.47,
    C3: 130.81, D3: 146.83, Eb3: 155.56, E3: 164.81, F3: 174.61, G3: 196.0,
    A3: 220.0, Bb3: 233.08, B3: 246.94, C4: 261.63, D4: 293.66, E4: 329.63,
    F4: 349.23, G4: 392.0, A4: 440.0
  };

  /** Chord progressions in mid-lower piano range for men */
  const PROGRESSIONS = {
    prog1: {
      name: "I – vi – IV – V (C)",
      description: "C – Am – F – G · classic pop",
      chords: [
        { name: "C", notes: ["C2", "C3", "E3", "G3"] },
        { name: "Am", notes: ["A2", "C3", "E3", "A3"] },
        { name: "F", notes: ["F2", "C3", "F3", "A3"] },
        { name: "G", notes: ["G2", "B2", "D3", "G3"] }
      ]
    },
    prog2: {
      name: "vi – IV – I – V (Am)",
      description: "Am – F – C – G",
      chords: [
        { name: "Am", notes: ["A2", "C3", "E3", "A3"] },
        { name: "F", notes: ["F2", "C3", "F3", "A3"] },
        { name: "C", notes: ["C2", "C3", "E3", "G3"] },
        { name: "G", notes: ["G2", "B2", "D3", "G3"] }
      ]
    },
    prog3: {
      name: "I – vi – IV – V (G)",
      description: "G – Em – C – D",
      chords: [
        { name: "G", notes: ["G2", "B2", "D3", "G3"] },
        { name: "Em", notes: ["E2", "B2", "E3", "G3"] },
        { name: "C", notes: ["C2", "C3", "E3", "G3"] },
        { name: "D", notes: ["D2", "A2", "D3", "F3"] }
      ]
    },
    prog4: {
      name: "IV – I – ii – bVII (F)",
      description: "F – C – Dm – Bb",
      chords: [
        { name: "F", notes: ["F2", "C3", "F3", "A3"] },
        { name: "C", notes: ["C2", "C3", "E3", "G3"] },
        { name: "Dm", notes: ["D2", "A2", "D3", "F3"] },
        { name: "Bb", notes: ["Bb2", "D3", "F3", "Bb3"] }
      ]
    },
    prog5: {
      name: "ii – bVII – IV – I (Dm)",
      description: "Dm – Bb – F – C",
      chords: [
        { name: "Dm", notes: ["D2", "A2", "D3", "F3"] },
        { name: "Bb", notes: ["Bb2", "D3", "F3", "Bb3"] },
        { name: "F", notes: ["F2", "C3", "F3", "A3"] },
        { name: "C", notes: ["C2", "C3", "E3", "G3"] }
      ]
    },
    songFeel: {
      name: "Feel-friendly (G area)",
      description: "G – Em – C – D · mid-low male",
      chords: [
        { name: "G", notes: ["G2", "B2", "D3", "G3"] },
        { name: "Em", notes: ["E2", "B2", "E3", "G3"] },
        { name: "C", notes: ["C2", "C3", "E3", "G3"] },
        { name: "D", notes: ["D2", "A2", "D3", "F3"] }
      ]
    },
    songBetter: {
      name: "Better Man-friendly (C area)",
      description: "C – G – Am – F · mid-low male",
      chords: [
        { name: "C", notes: ["C2", "G2", "C3", "E3"] },
        { name: "G", notes: ["G2", "B2", "D3", "G3"] },
        { name: "Am", notes: ["A2", "C3", "E3", "A3"] },
        { name: "F", notes: ["F2", "C3", "F3", "A3"] }
      ]
    }
  };

  class PianoEngine {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.comp = null;
      this.playing = [];
      this.loopTimer = null;
      this.loopActive = false;
      this.onChordChange = null;
    }

    async ensure() {
      if (!this.ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = 0.55;
        this.comp = this.ctx.createDynamicsCompressor();
        this.comp.threshold.value = -18;
        this.comp.knee.value = 12;
        this.comp.ratio.value = 4;
        this.comp.attack.value = 0.003;
        this.comp.release.value = 0.25;
        this.master.connect(this.comp);
        this.comp.connect(this.ctx.destination);
      }
      if (this.ctx.state === "suspended") await this.ctx.resume();
      return this.ctx;
    }

    /**
     * Additive piano-like partials with hammer noise burst + exponential decay.
     */
    playNote(freq, when, duration = 1.4, velocity = 0.45) {
      const ctx = this.ctx;
      const t0 = when;
      const partials = [
        { mul: 1, gain: 1.0, type: "sine" },
        { mul: 2, gain: 0.42, type: "sine" },
        { mul: 3, gain: 0.18, type: "sine" },
        { mul: 4, gain: 0.09, type: "sine" },
        { mul: 5, gain: 0.045, type: "sine" },
        { mul: 6, gain: 0.025, type: "triangle" },
        { mul: 0.5, gain: 0.12, type: "sine" } // sub for body
      ];

      const noteGain = ctx.createGain();
      noteGain.connect(this.master);
      noteGain.gain.setValueAtTime(0.0001, t0);
      noteGain.gain.exponentialRampToValueAtTime(velocity, t0 + 0.012);
      noteGain.gain.exponentialRampToValueAtTime(velocity * 0.55, t0 + 0.08);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);

      const nodes = [];
      for (const p of partials) {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        // slight inharmonicity like real piano strings
        const detune = (p.mul > 1 ? (p.mul - 1) * 0.8 : 0);
        osc.type = p.type;
        osc.frequency.setValueAtTime(freq * p.mul + detune, t0);
        g.gain.value = p.gain;
        osc.connect(g);
        g.connect(noteGain);
        osc.start(t0);
        osc.stop(t0 + duration + 0.05);
        nodes.push(osc);
      }

      // soft hammer noise
      const noiseDur = 0.03;
      const bufferSize = Math.floor(ctx.sampleRate * noiseDur);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufferSize, 3);
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const ng = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = Math.min(freq * 4, 4000);
      filter.Q.value = 1.2;
      ng.gain.value = velocity * 0.15;
      noise.connect(filter);
      filter.connect(ng);
      ng.connect(noteGain);
      noise.start(t0);
      noise.stop(t0 + noiseDur);

      this.playing.push(...nodes);
      return noteGain;
    }

    playChord(noteNames, duration = 1.6, when = null, velocity = 0.4) {
      const t = when != null ? when : this.ctx.currentTime + 0.02;
      noteNames.forEach((n, i) => {
        const f = NOTE_FREQ[n];
        if (!f) return;
        // slight roll from low to high for realism
        this.playNote(f, t + i * 0.012, duration, velocity * (1 - i * 0.04));
      });
    }

    async playRefPitch(noteName = "A2", duration = 2.0) {
      await this.ensure();
      const f = NOTE_FREQ[noteName] || NOTE_FREQ.A2;
      this.playNote(f, this.ctx.currentTime + 0.02, duration, 0.5);
    }

    async playInhaleTicks(seconds = 3) {
      await this.ensure();
      const t0 = this.ctx.currentTime + 0.05;
      for (let i = 0; i < seconds; i++) {
        this.playNote(NOTE_FREQ.C3, t0 + i, 0.12, 0.25);
      }
    }

    stopAll() {
      this.loopActive = false;
      if (this.loopTimer) {
        clearTimeout(this.loopTimer);
        this.loopTimer = null;
      }
      // fade master briefly
      if (this.ctx && this.master) {
        const now = this.ctx.currentTime;
        this.master.gain.cancelScheduledValues(now);
        this.master.gain.setValueAtTime(this.master.gain.value, now);
        this.master.gain.linearRampToValueAtTime(0.0001, now + 0.08);
        this.master.gain.setValueAtTime(0.55, now + 0.1);
      }
      this.playing = [];
    }

    getProgressions() {
      return PROGRESSIONS;
    }

    async playProgression(progId, { loop = false, chordSec = 2.0, arpeggio = false } = {}) {
      await this.ensure();
      this.stopAll();
      const prog = PROGRESSIONS[progId];
      if (!prog) return;

      const playOnce = () => {
        if (!this.loopActive && loop) return;
        const t0 = this.ctx.currentTime + 0.05;
        prog.chords.forEach((ch, idx) => {
          const when = t0 + idx * chordSec;
          if (arpeggio) {
            ch.notes.forEach((n, ni) => {
              const f = NOTE_FREQ[n];
              if (f) this.playNote(f, when + ni * 0.18, chordSec - ni * 0.1, 0.38);
            });
          } else {
            this.playChord(ch.notes, chordSec * 0.95, when, 0.42);
          }
          if (this.onChordChange) {
            const delay = Math.max(0, (when - this.ctx.currentTime) * 1000);
            setTimeout(() => {
              if (this.onChordChange) this.onChordChange(ch, idx, prog);
            }, delay);
          }
        });
        const total = prog.chords.length * chordSec * 1000 + 50;
        if (loop) {
          this.loopTimer = setTimeout(() => {
            if (this.loopActive) playOnce();
          }, total);
        }
      };

      this.loopActive = !!loop;
      playOnce();
      return prog;
    }
  }

  global.VTPiano = new PianoEngine();
  global.VT_PROGRESSIONS = PROGRESSIONS;
  global.VT_NOTE_FREQ = NOTE_FREQ;
})(window);
