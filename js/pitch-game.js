/**
 * Pitch Match Game layer — patterns from SingStar / Yousician / Singing Carrots:
 * - Hit zones (Perfect / Good / Close / Off)
 * - Score + combo streak
 * - "Lock-on" when held in zone
 * - Optional sequential note challenges (Vocal Match style)
 */
(function (global) {
  "use strict";

  const ZONES = {
    perfect: 15, // cents
    good: 35,
    close: 60
  };

  const LOCK_MS = 800; // hold in-zone to "clear" a challenge note
  const NOTE_POOL = ["A2", "B2", "C3", "D3", "E3", "F3", "G3", "A3"];

  class PitchGame {
    constructor() {
      this.reset();
      this.onUpdate = null;
      this.onHit = null; // { quality, points, combo }
      this.onLock = null; // note cleared
    }

    reset() {
      this.score = 0;
      this.combo = 0;
      this.maxCombo = 0;
      this.perfects = 0;
      this.goods = 0;
      this.totalSamples = 0;
      this.inZoneSamples = 0;
      this.lockProgress = 0; // 0–1
      this.lockStart = null;
      this.lastQuality = "—";
      this.challengeMode = false;
      this.challengeIndex = 0;
      this.challengeNotes = [];
      this.challengeCleared = 0;
      this.flash = null; // { text, color, until }
    }

    startChallenge(count = 8) {
      this.challengeMode = true;
      this.challengeNotes = [];
      for (let i = 0; i < count; i++) {
        this.challengeNotes.push(NOTE_POOL[i % NOTE_POOL.length]);
      }
      // mild shuffle of middle notes
      for (let i = this.challengeNotes.length - 1; i > 1; i--) {
        const j = 1 + Math.floor(Math.random() * i);
        [this.challengeNotes[i], this.challengeNotes[j]] = [
          this.challengeNotes[j],
          this.challengeNotes[i]
        ];
      }
      this.challengeIndex = 0;
      this.challengeCleared = 0;
      return this.currentChallengeNote();
    }

    currentChallengeNote() {
      if (!this.challengeMode) return null;
      return this.challengeNotes[this.challengeIndex] || null;
    }

    /**
     * @param {number|null} cents deviation (voice - target)
     * @param {boolean} voiced
     * @param {number} dtMs
     */
    tick(cents, voiced, dtMs = 16) {
      if (!voiced || cents == null || Number.isNaN(cents)) {
        this.lockStart = null;
        this.lockProgress = 0;
        this.combo = Math.max(0, this.combo - 0.02); // gentle decay only when silent long - skip
        this.lastQuality = "—";
        this._emit();
        return this.snapshot();
      }

      const abs = Math.abs(cents);
      let quality = "off";
      let pts = 0;
      if (abs <= ZONES.perfect) {
        quality = "perfect";
        pts = 10;
        this.perfects++;
      } else if (abs <= ZONES.good) {
        quality = "good";
        pts = 6;
        this.goods++;
      } else if (abs <= ZONES.close) {
        quality = "close";
        pts = 2;
      } else {
        quality = "off";
        pts = 0;
      }

      this.totalSamples++;
      if (quality === "perfect" || quality === "good") {
        this.inZoneSamples++;
        this.combo += 1;
        this.maxCombo = Math.max(this.maxCombo, Math.floor(this.combo));
        // score every ~6 frames to avoid inflation
        if (this.totalSamples % 6 === 0) {
          const mult = 1 + Math.min(4, Math.floor(this.combo / 30)) * 0.25;
          this.score += Math.round(pts * mult);
        }
        // lock-on progress
        if (!this.lockStart) this.lockStart = performance.now();
        const held = performance.now() - this.lockStart;
        this.lockProgress = Math.min(1, held / LOCK_MS);
        if (this.lockProgress >= 1 && this.challengeMode) {
          this._clearChallengeNote();
        }
      } else {
        if (quality === "off") {
          this.combo = 0;
          this.lockStart = null;
          this.lockProgress = 0;
        } else {
          // close — slow lock
          this.lockStart = null;
          this.lockProgress = Math.max(0, this.lockProgress - 0.05);
        }
      }

      if (quality !== this.lastQuality && quality !== "—") {
        this.flash = {
          text:
            quality === "perfect"
              ? "PERFECT"
              : quality === "good"
                ? "GOOD"
                : quality === "close"
                  ? "CLOSE"
                  : "FIND IT",
          color:
            quality === "perfect"
              ? "#7ddeb0"
              : quality === "good"
                ? "#9fd0f0"
                : quality === "close"
                  ? "#e0a84a"
                  : "#e06c75",
          until: performance.now() + 450
        };
        if (this.onHit) {
          this.onHit({ quality, points: pts, combo: Math.floor(this.combo) });
        }
      }
      this.lastQuality = quality;
      this._emit();
      return this.snapshot();
    }

    _clearChallengeNote() {
      this.challengeCleared++;
      this.score += 50 + Math.floor(this.combo / 10) * 5;
      this.lockStart = null;
      this.lockProgress = 0;
      this.flash = {
        text: "LOCKED ✓",
        color: "#7ddeb0",
        until: performance.now() + 700
      };
      const note = this.currentChallengeNote();
      this.challengeIndex++;
      if (this.onLock) this.onLock(note, this.currentChallengeNote());
      if (this.challengeIndex >= this.challengeNotes.length) {
        this.challengeMode = false;
        this.flash = {
          text: "ROUND CLEAR!",
          color: "#f0c9a0",
          until: performance.now() + 1500
        };
      }
    }

    accuracyPct() {
      if (!this.totalSamples) return 0;
      return Math.round((this.inZoneSamples / this.totalSamples) * 100);
    }

    snapshot() {
      const flash =
        this.flash && performance.now() < this.flash.until ? this.flash : null;
      return {
        score: this.score,
        combo: Math.floor(this.combo),
        maxCombo: this.maxCombo,
        perfects: this.perfects,
        goods: this.goods,
        accuracyPct: this.accuracyPct(),
        lockProgress: this.lockProgress,
        quality: this.lastQuality,
        flash,
        challengeMode: this.challengeMode,
        challengeNote: this.currentChallengeNote(),
        challengeIndex: this.challengeIndex,
        challengeTotal: this.challengeNotes.length,
        challengeCleared: this.challengeCleared,
        zones: ZONES
      };
    }

    _emit() {
      if (this.onUpdate) this.onUpdate(this.snapshot());
    }
  }

  global.VTPitchGame = PitchGame;
  global.VT_PITCH_ZONES = ZONES;
})(window);
