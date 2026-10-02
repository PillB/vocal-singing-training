/**
 * Pitch Match Game layer — real-time pitch game patterns:
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
  // Everything below counts time, not frames: a 120 Hz screen used to build
  // combo and score twice as fast as a 60 Hz one. Combo stays in "frames at
  // 60 fps" so the rating thresholds read the same as before.
  const FRAME_MS = 1000 / 60;
  const SCORE_STEP_MS = 100; // score once per 100 ms in the zone
  // Vibrato swings ±50–100 cents several times a second, so one stray frame
  // (or half a vibrato cycle) outside the zone must not end a streak or flash
  // a new word. A quality has to hold this long before it counts as a change.
  const OFF_GRACE_MS = 200;
  const STABLE_MS = 180;
  const FLASH_MS = 300;
  // The ear hears the centre of a vibrato, not its peaks: classify the mean
  // deviation over about one vibrato cycle rather than each frame.
  const CENTRE_MS = 200;
  // Hysteresis at the zone edges: staying in a zone allows a few cents more
  // than entering it, so a note sung right on an edge doesn't flicker.
  const EDGE_CENTS = 6;
  const RANK = { perfect: 0, good: 1, close: 2, off: 3 };
  const NOTE_POOL = ["A2", "B2", "C3", "D3", "E3", "F3", "G3", "A3"];

  /**
   * Canvas flash words (perfect, good, close, off, locked, round) in the
   * interface language: js/i18n.js "game.flash.*".
   */
  function flashText(id) {
    const key = "game.flash." + id;
    const s = global.VTI18n?.t?.(key);
    return s && s !== key ? s : id.toUpperCase();
  }

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
      this.totalMs = 0;
      this.inZoneMs = 0;
      this._scoreMs = 0;
      this._lockMs = 0;
      this._offMs = 0;
      this._candQuality = null;
      this._candMs = 0;
      this._stableQuality = "—";
      this._win = [];
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
      const dt = Math.max(0, Math.min(100, Number(dtMs) || 0));
      if (!voiced || cents == null || Number.isNaN(cents)) {
        this._lockMs = 0;
        this.lockProgress = 0;
        // gentle decay while silent (0.02 per 60 fps frame, as before)
        this.combo = Math.max(0, this.combo - (0.02 * dt) / FRAME_MS);
        this.lastQuality = "—";
        this._candQuality = null;
        this._candMs = 0;
        this._stableQuality = "—";
        this._win = [];
        this._emit();
        return this.snapshot();
      }

      this._win.push({ c: cents, dt: Math.max(1, dt) });
      let span = 0;
      for (let i = this._win.length - 1; i >= 0; i--) {
        span += this._win[i].dt;
        if (span > CENTRE_MS) {
          this._win.splice(0, i);
          break;
        }
      }
      let sum = 0;
      let w = 0;
      for (const p of this._win) {
        sum += p.c * p.dt;
        w += p.dt;
      }
      const abs = Math.abs(sum / w);
      const prevRank = RANK[this.lastQuality] != null ? RANK[this.lastQuality] : 3;
      const edge = (z) => ZONES[z] + (prevRank <= RANK[z] ? EDGE_CENTS : 0);
      let quality = "off";
      let pts = 0;
      if (abs <= edge("perfect")) {
        quality = "perfect";
        pts = 10;
      } else if (abs <= edge("good")) {
        quality = "good";
        pts = 6;
      } else if (abs <= edge("close")) {
        quality = "close";
        pts = 2;
      }

      this.totalSamples++;
      this.totalMs += dt;
      if (quality === "perfect") this.perfects += dt / FRAME_MS;
      else if (quality === "good") this.goods += dt / FRAME_MS;

      if (quality === "perfect" || quality === "good") {
        this.inZoneSamples++;
        this.inZoneMs += dt;
        this._offMs = 0;
        this.combo += dt / FRAME_MS;
        this.maxCombo = Math.max(this.maxCombo, Math.floor(this.combo));
        this._scoreMs += dt;
        while (this._scoreMs >= SCORE_STEP_MS) {
          this._scoreMs -= SCORE_STEP_MS;
          const mult = 1 + Math.min(4, Math.floor(this.combo / 30)) * 0.25;
          this.score += Math.round(pts * mult);
        }
        // lock-on progress, counted in frame time
        this._lockMs += dt;
        this.lockProgress = Math.min(1, this._lockMs / LOCK_MS);
        if (this.lockProgress >= 1 && this.challengeMode) {
          this._clearChallengeNote();
        }
      } else if (quality === "off") {
        this._offMs += dt;
        if (this._offMs >= OFF_GRACE_MS) {
          this.combo = 0;
          this._lockMs = 0;
          this.lockProgress = 0;
        }
      } else {
        // close: the lock drains slowly instead of resetting
        this._offMs = 0;
        this._lockMs = Math.max(0, this._lockMs - dt * 0.5);
        this.lockProgress = Math.min(1, this._lockMs / LOCK_MS);
      }

      // A word only when the quality has settled, and never for "off": the
      // dot's position already shows which way to move.
      if (quality === this._candQuality) this._candMs += dt;
      else {
        this._candQuality = quality;
        this._candMs = dt;
      }
      if (this._candMs >= STABLE_MS && quality !== this._stableQuality) {
        this._stableQuality = quality;
        if (quality !== "off") {
          this.flash = {
            text: flashText(quality),
            color: quality === "perfect" ? "#7ddeb0" : quality === "good" ? "#9fd0f0" : "#e0a84a",
            until: performance.now() + FLASH_MS
          };
        }
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
      this._lockMs = 0;
      this.lockProgress = 0;
      this.flash = {
        text: flashText("locked"),
        color: "#7ddeb0",
        until: performance.now() + FLASH_MS
      };
      const note = this.currentChallengeNote();
      this.challengeIndex++;
      if (this.onLock) this.onLock(note, this.currentChallengeNote());
      if (this.challengeIndex >= this.challengeNotes.length) {
        this.challengeMode = false;
        this.flash = {
          text: flashText("round"),
          color: "#f0c9a0",
          until: performance.now() + 1500
        };
      }
    }

    accuracyPct() {
      if (!this.totalMs) return 0;
      return Math.round((this.inZoneMs / this.totalMs) * 100);
    }

    snapshot() {
      const flash =
        this.flash && performance.now() < this.flash.until ? this.flash : null;
      return {
        score: this.score,
        combo: Math.floor(this.combo),
        maxCombo: this.maxCombo,
        perfects: Math.round(this.perfects),
        goods: Math.round(this.goods),
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
