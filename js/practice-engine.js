/**
 * Unified Practice Engine
 * One mic stream powers: level meter, pitch detection, auto-hold logging,
 * optional MediaRecorder, and drives the pitch visualizer.
 */
(function (global) {
  "use strict";

  const HOLD_MIN_SEC = 2.0; // auto-log only if voiced continuously ≥ 2s
  /** Gap allowed mid-hold before ending (retroactive grace for pitch/RMS dropouts) */
  const SILENCE_END_MS = 1100;
  /** Brief dropouts under this ms never end the hold; timer keeps running */
  const HOLD_GRACE_MS = 900;
  /** Base thresholds at sensitivity = 5 (mid). Higher sensitivity lowers them. */
  const VOICE_RMS_BASE = 0.012;
  const HOLD_RMS_BASE = 0.008;
  const PITCH_MIN = 55;
  const PITCH_MAX = 520;
  /** Default 7/10 — more sensitive than legacy fixed 0.016 (fewer false cutoffs) */
  const DEFAULT_SENS = 7;

  class PracticeEngine {
    constructor() {
      this.running = false;
      this.audioCtx = null;
      this.stream = null;
      this.source = null;
      this.inputGain = null;
      this.analyser = null;
      this.buf = null;
      this.raf = null;

      this.mediaRecorder = null;
      this.recChunks = [];
      this.recording = false;
      this.recBlob = null;
      this.recUrl = null;

      // Auto-hold state
      this.voiced = false;
      this.holdStart = null;
      this.lastVoiceAt = 0;
      this.currentHoldSec = 0;
      this.holds = [];

      // Pitch
      this.voiceFreq = null;
      this.targetFreq = 130.81;

      /** 1–10 interactive mic sensitivity (persisted by app) */
      this.sensitivity = DEFAULT_SENS;

      // Callbacks
      this.onFrame = null; // { rms, voiceFreq, holdSec, voiced, holds, sensitivity }
      this.onHoldLogged = null; // seconds
      this.onStatus = null;
      this.onRecordingReady = null;

      this.startedAt = 0;
    }

    /**
     * @param {number} level 1–10 (1 = least sensitive / quiet room noise rejection, 10 = softest voices)
     */
    setSensitivity(level) {
      const n = Math.max(1, Math.min(10, Number(level) || DEFAULT_SENS));
      this.sensitivity = n;
      if (this.inputGain && this.audioCtx) {
        this.inputGain.gain.setTargetAtTime(this._gainFromSens(n), this.audioCtx.currentTime, 0.05);
      }
      return n;
    }

    getSensitivity() {
      return this.sensitivity;
    }

    /** Input gain: ~0.7 at sens1 → ~2.6 at sens10 */
    _gainFromSens(s) {
      const t = (s - 1) / 9;
      return 0.7 + t * 1.9;
    }

    /** Threshold scale: higher sensitivity → lower RMS bar */
    _threshScale() {
      const t = (this.sensitivity - 1) / 9; // 0..1
      return 1.55 - t * 1.15; // ~1.55 → ~0.40
    }

    _voiceRms() {
      return VOICE_RMS_BASE * this._threshScale();
    }

    _holdRms() {
      return HOLD_RMS_BASE * this._threshScale();
    }

    async start({ record = false } = {}) {
      if (this.running) return;
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          // Leave browser AGC off — we control gain via sensitivity slider
          autoGainControl: false
        }
      });
      const AC = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AC();
      if (this.audioCtx.state === "suspended") await this.audioCtx.resume();
      this.source = this.audioCtx.createMediaStreamSource(this.stream);
      this.inputGain = this.audioCtx.createGain();
      this.inputGain.gain.value = this._gainFromSens(this.sensitivity);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.12;
      this.source.connect(this.inputGain);
      this.inputGain.connect(this.analyser);
      this.buf = new Float32Array(this.analyser.fftSize);

      this.voiced = false;
      this.holdStart = null;
      this.currentHoldSec = 0;
      this.lastVoiceAt = 0;
      this.holds = []; // clear prior session holds on restart
      this.startedAt = performance.now();
      this.running = true;
      this._lastFrameAt = performance.now();

      // Recording is optional — never fail the whole practice session if MediaRecorder is unsupported
      if (record) {
        try {
          await this._startRecorder();
        } catch (e) {
          console.warn("MediaRecorder unavailable; practice continues without file recording", e);
          this.recording = false;
          this.mediaRecorder = null;
        }
      }

      this._status("listening");
      this._loop();
    }

    async _startRecorder() {
      this.recChunks = [];
      this.recBlob = null;
      if (this.recUrl) {
        URL.revokeObjectURL(this.recUrl);
        this.recUrl = null;
      }
      if (typeof MediaRecorder === "undefined") {
        throw new Error("MediaRecorder not available");
      }
      let mime = "";
      try {
        if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) mime = "audio/webm;codecs=opus";
        else if (MediaRecorder.isTypeSupported("audio/webm")) mime = "audio/webm";
        else if (MediaRecorder.isTypeSupported("audio/mp4")) mime = "audio/mp4";
      } catch {
        mime = "";
      }
      try {
        this.mediaRecorder = mime
          ? new MediaRecorder(this.stream, { mimeType: mime })
          : new MediaRecorder(this.stream);
      } catch (e) {
        // Last resort: no options
        this.mediaRecorder = new MediaRecorder(this.stream);
      }
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size) this.recChunks.push(e.data);
      };
      this.mediaRecorder.start(250);
      this.recording = true;
    }

    stop() {
      // Finalize open hold if long enough
      this._maybeEndHold(true);

      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
      this.running = false;

      let recResult = null;
      if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
        try {
          this.mediaRecorder.stop();
        } catch {
          /* ignore */
        }
      }
      if (this.recording && this.recChunks.length) {
        this.recBlob = new Blob(this.recChunks, {
          type: (this.mediaRecorder && this.mediaRecorder.mimeType) || "audio/webm"
        });
        this.recUrl = URL.createObjectURL(this.recBlob);
        recResult = {
          blob: this.recBlob,
          url: this.recUrl,
          durationMs: performance.now() - this.startedAt
        };
        if (this.onRecordingReady) this.onRecordingReady(recResult);
      }
      this.recording = false;
      this.mediaRecorder = null;

      if (this.source) {
        try {
          this.source.disconnect();
        } catch {
          /* ignore */
        }
      }
      if (this.inputGain) {
        try {
          this.inputGain.disconnect();
        } catch {
          /* ignore */
        }
        this.inputGain = null;
      }
      if (this.audioCtx) {
        this.audioCtx.close().catch(() => {});
        this.audioCtx = null;
      }
      if (this.stream) {
        this.stream.getTracks().forEach((t) => t.stop());
        this.stream = null;
      }
      this.voiceFreq = null;
      this.currentHoldSec = 0;
      this._status("idle");
      return recResult;
    }

    setTargetFreq(f) {
      if (f && f > 40 && f < 2000) this.targetFreq = f;
    }

    getHolds() {
      return this.holds.slice();
    }

    bestHold() {
      if (!this.holds.length) return 0;
      return Math.max(...this.holds.map((h) => h.seconds));
    }

    _status(s) {
      if (this.onStatus) this.onStatus(s);
    }

    _rms(buf) {
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      return Math.sqrt(sum / buf.length);
    }

    _detectPitch(buf, sampleRate) {
      if (global.VTPitchUtils && global.VTPitchUtils.detectPitch) {
        return global.VTPitchUtils.detectPitch(buf, sampleRate);
      }
      return null;
    }

    _maybeEndHold(force) {
      if (!this.holdStart) return;
      const now = performance.now();
      const silenceLong = force || now - this.lastVoiceAt >= SILENCE_END_MS;
      if (!silenceLong && !force) return;
      // Credit through last real voice, not trailing silence window
      const endAt = this.lastVoiceAt > this.holdStart ? this.lastVoiceAt : now;
      const sec = (endAt - this.holdStart) / 1000;
      if (sec >= HOLD_MIN_SEC) {
        const entry = {
          seconds: Math.round(sec * 10) / 10,
          at: new Date().toISOString()
        };
        this.holds.unshift(entry);
        this.holds = this.holds.slice(0, 40);
        if (this.onHoldLogged) this.onHoldLogged(entry.seconds);
      }
      this.holdStart = null;
      this.voiced = false;
      this.currentHoldSec = 0;
      this._gapStart = null;
    }

    _loop() {
      if (!this.running || !this.analyser) return;
      this.analyser.getFloatTimeDomainData(this.buf);
      const rms = this._rms(this.buf);
      const freq = this._detectPitch(this.buf, this.audioCtx.sampleRate);
      const now = performance.now();

      const voiceRms = this._voiceRms();
      const holdRms = this._holdRms();
      // Slightly longer grace when mic is very sensitive (soft voices drop more)
      const graceMs = HOLD_GRACE_MS + Math.max(0, this.sensitivity - 5) * 40;
      const silenceEndMs = SILENCE_END_MS + Math.max(0, this.sensitivity - 5) * 50;

      const hasPitch =
        freq != null && freq >= PITCH_MIN && freq <= PITCH_MAX;
      // Start a hold only with energy + pitch; continue a hold with energy alone
      // (pitch detectors flake mid-sustain — we give grace + sensitivity)
      const strongVoice = rms >= voiceRms && hasPitch;
      // Soft-voice path: energy alone can open a hold at high sensitivity
      const softOpen =
        this.holdStart == null &&
        rms >= holdRms * 1.15 &&
        (hasPitch || this.sensitivity >= 7);
      const continueVoice =
        this.holdStart != null &&
        (rms >= holdRms || hasPitch || now - this.lastVoiceAt < graceMs);

      if (strongVoice || softOpen || continueVoice) {
        if (hasPitch) this.voiceFreq = freq;
        // Refresh lastVoiceAt on real energy OR clean pitch (not bare grace alone)
        if (strongVoice || softOpen || rms >= holdRms || (hasPitch && rms >= holdRms * 0.55)) {
          this.lastVoiceAt = now;
        }
        if (!this.holdStart) {
          this.holdStart = now;
          this.voiced = true;
        }
        // Hold clock keeps running through brief dropouts (grace)
        this.currentHoldSec = (now - this.holdStart) / 1000;
      } else {
        if (now - this.lastVoiceAt > 180) this.voiceFreq = null;
        if (this.holdStart && now - this.lastVoiceAt >= silenceEndMs) {
          this._maybeEndHold(false);
        } else if (this.holdStart) {
          // Still inside outer silence window — keep counting for UX continuity
          this.currentHoldSec = (now - this.holdStart) / 1000;
        }
      }

      const dtMs = Math.min(50, now - (this._lastFrameAt || now));
      this._lastFrameAt = now;
      // Grace UI spans full silence window so green/amber doesn't drop before hold ends
      const inGraceWindow =
        !!this.holdStart && now - this.lastVoiceAt < silenceEndMs;
      const activelyHolding =
        !!this.holdStart && now - this.lastVoiceAt < graceMs;
      if (this.onFrame) {
        this.onFrame({
          rms,
          voiceFreq: this.voiceFreq,
          targetFreq: this.targetFreq,
          holdSec: this.currentHoldSec,
          voiced: inGraceWindow || strongVoice || softOpen,
          holds: this.holds,
          recording: this.recording,
          elapsedMs: now - this.startedAt,
          dtMs,
          holdGrace: !!this.holdStart && !strongVoice && inGraceWindow,
          holdSolid: activelyHolding || strongVoice || softOpen,
          sensitivity: this.sensitivity
        });
      }

      this.raf = requestAnimationFrame(() => this._loop());
    }
  }

  global.VTPracticeEngine = PracticeEngine;
  global.VT_HOLD_MIN_SEC = HOLD_MIN_SEC;
  global.VT_HOLD_GRACE_MS = HOLD_GRACE_MS;
  global.VT_SILENCE_END_MS = SILENCE_END_MS;
  global.VT_DEFAULT_MIC_SENS = DEFAULT_SENS;
})(window);
