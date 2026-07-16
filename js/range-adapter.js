/**
 * VTRangeAdapter — adaptive vocal-range octave shifting.
 *
 * Problem: fixed chord/target octaves sit outside many singers' ranges.
 * Competitors (Yousician calibrate+transpose, Sing Sharp range personalisation)
 * move material into the voice instead of forcing strain.
 *
 * Detection (not silence):
 *  1. Voiced + energy (RMS) — must be producing pitched sound
 *  2. Directional attempt — pitch history moves toward the unreachable target
 *  3. Plateau short of target — stable pitch for ~1s while still ≥~5 semitones away
 *
 * Actions:
 *  - Target too high → shift material −1 octave
 *  - Target too low  → shift material +1 octave
 *
 * Safety: cooldown, max ±2 octaves, hysteresis, auto can be disabled.
 */
(function (global) {
  "use strict";

  const MAX_SHIFT = 2;
  const MIN_SHORTFALL_SEMI = 5; // must miss by ≥ this many semitones
  const PLATEAU_MS = 950;
  const ATTEMPT_MS = 2200;
  const MIN_ATTEMPT_MOVE = 1.0; // semitones of directed motion toward target
  const PLATEAU_STD_MAX = 1.35; // semi stddev = "stuck"
  const COOLDOWN_MS = 10000;
  const HISTORY_MS = 3200;
  const MIN_SAMPLES = 12;
  const NEAR_TARGET_SEMI = 3.2; // close enough → cancel pending

  function freqToMidi(f) {
    if (!f || f < 40 || f > 2000) return null;
    return 69 + 12 * Math.log2(f / 440);
  }

  function stddev(arr) {
    if (!arr.length) return 0;
    const m = arr.reduce((a, b) => a + b, 0) / arr.length;
    let s = 0;
    for (const v of arr) s += (v - m) * (v - m);
    return Math.sqrt(s / arr.length);
  }

  class RangeAdapter {
    constructor(opts = {}) {
      this.auto = opts.auto !== false;
      this.octaveShift = Number(opts.octaveShift) || 0;
      this.maxShift = opts.maxShift != null ? opts.maxShift : MAX_SHIFT;
      this.onShift = opts.onShift || null; // ({ shift, delta, reason, side })
      this._hist = [];
      // −Infinity so first session has no artificial cooldown (0 would block for COOLDOWN_MS)
      this._lastShiftAt = -Infinity;
      this._sessionMinMidi = null;
      this._sessionMaxMidi = null;
      this._pendingSide = null;
      this._pendingSince = 0;
      this.enabled = true;
    }

    resetSession() {
      this._hist = [];
      this._pendingSide = null;
      this._pendingSince = 0;
      this._sessionMinMidi = null;
      this._sessionMaxMidi = null;
      // keep octaveShift + auto preference
    }

    /** After a shift is applied externally (manual or auto). */
    notifyShifted(shift) {
      if (Number.isFinite(shift)) this.octaveShift = this._clamp(shift);
      this._hist = [];
      this._pendingSide = null;
      this._pendingSince = 0;
      this._lastShiftAt = performance.now();
    }

    setAuto(on) {
      this.auto = !!on;
      if (!this.auto) {
        this._pendingSide = null;
        this._pendingSince = 0;
      }
    }

    setShift(n) {
      this.octaveShift = this._clamp(n);
      this.notifyShifted(this.octaveShift);
    }

    _clamp(n) {
      const v = Math.round(Number(n) || 0);
      return Math.max(-this.maxShift, Math.min(this.maxShift, v));
    }

    getSnapshot() {
      return {
        auto: this.auto,
        octaveShift: this.octaveShift,
        sessionMinMidi: this._sessionMinMidi,
        sessionMaxMidi: this._sessionMaxMidi,
        pendingSide: this._pendingSide,
        coolingDown: performance.now() - this._lastShiftAt < COOLDOWN_MS
      };
    }

    /**
     * Feed one practice frame.
     * @param {{ voiceFreq?: number|null, targetFreq?: number|null, rms?: number, voiced?: boolean, holdSolid?: boolean }} frame
     * @returns {{ shift?: number, delta?: number, reason?: string, side?: string }|null}
     */
    feed(frame) {
      if (!this.enabled || !this.auto) return null;
      const now = performance.now();
      if (now - this._lastShiftAt < COOLDOWN_MS) return null;

      const voiceMidi = freqToMidi(frame?.voiceFreq);
      const targetMidi = freqToMidi(frame?.targetFreq);
      const rms = Number(frame?.rms) || 0;
      // Require real pitched voice — not silence, not grace-only
      const activelyVoiced =
        !!frame?.voiced &&
        voiceMidi != null &&
        rms >= 0.006 &&
        (frame.holdSolid !== false || rms >= 0.01);

      if (!activelyVoiced || targetMidi == null) {
        // Soft decay of pending (don't hard-reset on 1 frame glitch)
        if (this._hist.length && now - (this._hist[this._hist.length - 1]?.t || 0) > 450) {
          this._pendingSide = null;
          this._pendingSince = 0;
        }
        return null;
      }

      // Track observed vocal extremes (session range)
      if (this._sessionMinMidi == null || voiceMidi < this._sessionMinMidi) {
        this._sessionMinMidi = voiceMidi;
      }
      if (this._sessionMaxMidi == null || voiceMidi > this._sessionMaxMidi) {
        this._sessionMaxMidi = voiceMidi;
      }

      this._hist.push({ t: now, midi: voiceMidi, target: targetMidi, rms });
      // prune
      while (this._hist.length && now - this._hist[0].t > HISTORY_MS) this._hist.shift();
      if (this._hist.length < MIN_SAMPLES) return null;

      const shortfall = voiceMidi - targetMidi; // + = voice higher than target
      if (Math.abs(shortfall) < NEAR_TARGET_SEMI) {
        this._pendingSide = null;
        this._pendingSince = 0;
        return null;
      }

      // Side we might need to shift material
      // voice below high target → material too high → shift down
      // voice above low target  → material too low  → shift up
      const side = shortfall < 0 ? "high" : "low";
      const wantDelta = side === "high" ? -1 : 1;
      const nextShift = this._clamp(this.octaveShift + wantDelta);
      if (nextShift === this.octaveShift) {
        // already at max in that direction
        return null;
      }

      const attemptOk = this._hasDirectedAttempt(side, now);
      const plateauOk = this._isPlateauShort(now, targetMidi, side);

      if (!attemptOk || !plateauOk || Math.abs(shortfall) < MIN_SHORTFALL_SEMI) {
        if (this._pendingSide !== side) {
          this._pendingSide = null;
          this._pendingSince = 0;
        }
        return null;
      }

      if (this._pendingSide !== side) {
        this._pendingSide = side;
        this._pendingSince = now;
        return null;
      }
      // Confirm after sustained evidence (plateau already ~1s; extra 350ms confirms)
      if (now - this._pendingSince < 350) return null;

      const decision = {
        shift: nextShift,
        delta: wantDelta,
        reason:
          side === "high"
            ? "plateau_below_high_target"
            : "plateau_above_low_target",
        side,
        shortfallSemi: shortfall,
        voiceMidi,
        targetMidi
      };

      this.octaveShift = nextShift;
      this._lastShiftAt = now;
      this._hist = [];
      this._pendingSide = null;
      this._pendingSince = 0;

      if (typeof this.onShift === "function") {
        try {
          this.onShift(decision);
        } catch (e) {
          console.warn("[VTRangeAdapter] onShift", e);
        }
      }
      return decision;
    }

    /** Evidence user is trying to move pitch toward the unreachable target. */
    _hasDirectedAttempt(side, now) {
      const win = this._hist.filter((h) => now - h.t <= ATTEMPT_MS);
      if (win.length < 8) return false;
      const midis = win.map((h) => h.midi);
      const first = midis[0];
      const last = midis[midis.length - 1];
      const peak = Math.max(...midis);
      const trough = Math.min(...midis);
      const net = last - first;
      const climb = peak - first;
      const drop = first - trough;

      if (side === "high") {
        // Trying to go up: net up or climb ≥ MIN_ATTEMPT_MOVE
        return climb >= MIN_ATTEMPT_MOVE || net >= MIN_ATTEMPT_MOVE * 0.65;
      }
      // Trying to go down
      return drop >= MIN_ATTEMPT_MOVE || net <= -MIN_ATTEMPT_MOVE * 0.65;
    }

    /** Stable pitch short of target (plateau), not silence. */
    _isPlateauShort(now, targetMidi, side) {
      const win = this._hist.filter((h) => now - h.t <= PLATEAU_MS);
      if (win.length < 6) return false;
      const midis = win.map((h) => h.midi);
      const sd = stddev(midis);
      if (sd > PLATEAU_STD_MAX) return false;
      const mean = midis.reduce((a, b) => a + b, 0) / midis.length;
      const shortfall = mean - targetMidi;
      if (Math.abs(shortfall) < MIN_SHORTFALL_SEMI) return false;
      if (side === "high" && shortfall >= 0) return false; // should be below
      if (side === "low" && shortfall <= 0) return false; // should be above
      // Duration covered
      const span = win[win.length - 1].t - win[0].t;
      return span >= PLATEAU_MS * 0.75;
    }
  }

  /** Pure helpers for tests / external use */
  function simulateFeedSequence(adapter, samples) {
    const outs = [];
    for (const s of samples) {
      const r = adapter.feed(s);
      if (r) outs.push(r);
    }
    return outs;
  }

  global.VTRangeAdapter = RangeAdapter;
  global.VTRangeAdapterSim = simulateFeedSequence;
  global.VT_RANGE_MAX_SHIFT = MAX_SHIFT;
  global.VT_RANGE_COOLDOWN_MS = COOLDOWN_MS;
})(window);
