/**
 * Unified Practice Engine
 * One mic stream powers: level meter, pitch detection, auto-hold logging,
 * optional MediaRecorder, and drives the pitch visualizer.
 */
(function (global) {
  "use strict";

  const HOLD_MIN_SEC = 2.0; // auto-log only if voiced continuously ≥ 2s
  /** Gap allowed mid-hold before ending (retroactive grace for pitch/RMS dropouts) */
  const SILENCE_END_MS = 900;
  /** Brief dropouts under this ms never end the hold; timer keeps running */
  const HOLD_GRACE_MS = 700;
  const VOICE_RMS = 0.016;
  const HOLD_RMS = 0.012; // looser once a hold has started
  const PITCH_MIN = 60;
  const PITCH_MAX = 500;

  class PracticeEngine {
    constructor() {
      this.running = false;
      this.audioCtx = null;
      this.stream = null;
      this.source = null;
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

      // Callbacks
      this.onFrame = null; // { rms, voiceFreq, holdSec, voiced, holds }
      this.onHoldLogged = null; // seconds
      this.onStatus = null;
      this.onRecordingReady = null;

      this.startedAt = 0;
    }

    async start({ record = false } = {}) {
      if (this.running) return;
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false
        }
      });
      const AC = window.AudioContext || window.webkitAudioContext;
      this.audioCtx = new AC();
      if (this.audioCtx.state === "suspended") await this.audioCtx.resume();
      this.source = this.audioCtx.createMediaStreamSource(this.stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 2048;
      this.analyser.smoothingTimeConstant = 0.15;
      this.source.connect(this.analyser);
      this.buf = new Float32Array(this.analyser.fftSize);

      this.voiced = false;
      this.holdStart = null;
      this.currentHoldSec = 0;
      this.lastVoiceAt = 0;
      this.holds = []; // clear prior session holds on restart
      this.startedAt = performance.now();
      this.running = true;
      this._lastFrameAt = performance.now();

      if (record) await this._startRecorder();

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
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";
      this.mediaRecorder = mime
        ? new MediaRecorder(this.stream, { mimeType: mime })
        : new MediaRecorder(this.stream);
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

      const hasPitch =
        freq != null && freq >= PITCH_MIN && freq <= PITCH_MAX;
      // Start a hold only with energy + pitch; continue a hold with energy alone
      // (pitch detectors flake mid-sustain — competitors punish that; we give grace)
      const strongVoice = rms >= VOICE_RMS && hasPitch;
      const continueVoice =
        this.holdStart != null &&
        (rms >= HOLD_RMS || hasPitch || now - this.lastVoiceAt < HOLD_GRACE_MS);

      if (strongVoice || continueVoice) {
        if (hasPitch) this.voiceFreq = freq;
        // Retroactive bridge: if we were in a short gap, do NOT reset holdStart
        if (strongVoice || rms >= HOLD_RMS) {
          this.lastVoiceAt = now;
          this._gapStart = null;
        } else if (!this._gapStart) {
          this._gapStart = now;
        }
        if (!this.holdStart) {
          this.holdStart = now;
          this.voiced = true;
        }
        // Hold clock keeps running through brief dropouts (grace)
        this.currentHoldSec = (now - this.holdStart) / 1000;
      } else {
        if (now - this.lastVoiceAt > 180) this.voiceFreq = null;
        if (this.holdStart && now - this.lastVoiceAt >= SILENCE_END_MS) {
          this._maybeEndHold(false);
        } else if (this.holdStart) {
          // Still inside outer silence window — keep counting for UX continuity
          this.currentHoldSec = (now - this.holdStart) / 1000;
        }
      }

      const dtMs = Math.min(50, now - (this._lastFrameAt || now));
      this._lastFrameAt = now;
      const activelyHolding =
        !!this.holdStart && now - this.lastVoiceAt < HOLD_GRACE_MS;
      if (this.onFrame) {
        this.onFrame({
          rms,
          voiceFreq: this.voiceFreq,
          targetFreq: this.targetFreq,
          holdSec: this.currentHoldSec,
          voiced: activelyHolding || strongVoice,
          holds: this.holds,
          recording: this.recording,
          elapsedMs: now - this.startedAt,
          dtMs,
          holdGrace: !!this.holdStart && !strongVoice && activelyHolding
        });
      }

      this.raf = requestAnimationFrame(() => this._loop());
    }
  }

  global.VTPracticeEngine = PracticeEngine;
  global.VT_HOLD_MIN_SEC = HOLD_MIN_SEC;
  global.VT_HOLD_GRACE_MS = HOLD_GRACE_MS;
  global.VT_SILENCE_END_MS = SILENCE_END_MS;
})(window);
