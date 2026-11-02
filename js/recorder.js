/**
 * Browser MediaRecorder with level meter via AnalyserNode
 */
(function (global) {
  "use strict";

  class VoiceRecorder {
    constructor() {
      this.stream = null;
      this.mediaRecorder = null;
      this.chunks = [];
      this.blob = null;
      this.audioUrl = null;
      this.recording = false;
      this.ctx = null;
      this.analyser = null;
      this.raf = null;
      this.onLevel = null;
      this.startedAt = null;
      this.elapsedMs = 0;
      this._starting = false;
      this._ownsStream = true;
      this._ownsContext = true;
      this._generation = 0;
      this._stopResolver = null;
      this._stopPending = null;
    }

    _chooseMime() {
      if (typeof MediaRecorder.isTypeSupported !== "function") return "";
      for (const type of ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"]) {
        if (MediaRecorder.isTypeSupported(type)) return type;
      }
      return "";
    }

    _onStopped(recorder, generation) {
      const valid = generation === this._generation;
      if (!valid) return; // An old final chunk must never tear down a new take.
      const mime = recorder.mimeType || this.chunks[0]?.type || "application/octet-stream";
      const result = valid && this.chunks.length
        ? {
          blob: new Blob(this.chunks, { type: mime }),
          durationMs: performance.now() - (this.startedAt || performance.now())
        }
        : null;
      if (result) {
        this.blob = result.blob;
        this.audioUrl = URL.createObjectURL(result.blob);
        result.url = this.audioUrl;
        this.elapsedMs = result.durationMs;
      }
      this.recording = false;
      this._stopMeter();
      this._stopTracks();
      const resolve = this._stopResolver;
      this._stopResolver = null;
      this._stopPending = null;
      resolve?.(result);
    }

    async start({ stream = null } = {}) {
      if (this.recording || this._starting) return;
      this._starting = true;
      this.chunks = [];
      this.blob = null;
      if (this.audioUrl) {
        URL.revokeObjectURL(this.audioUrl);
        this.audioUrl = null;
      }

      // The take is for listening back to your own voice, so ask for it as
      // the microphone heard it: auto gain flattens crescendos and swells,
      // noise suppression eats a held "sss" and soft onsets. (Plain false is
      // a preference, not a requirement, so browsers that can't comply still
      // hand over a stream.)
      this._ownsStream = !stream;
      const generation = ++this._generation;
      try {
        this.stream = stream || await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        });
        if (generation !== this._generation) {
          this._stopTracks();
          return;
        }
        if (!this.stream.getAudioTracks?.().some((t) => t.readyState !== "ended")) {
          throw new Error("Recorder has no live microphone track");
        }
        const mime = this._chooseMime();
        this.mediaRecorder = mime
          ? new MediaRecorder(this.stream, { mimeType: mime })
          : new MediaRecorder(this.stream);
        const recorder = this.mediaRecorder;
        recorder.ondataavailable = (e) => {
          if (generation === this._generation && e.data?.size) this.chunks.push(e.data);
        };
        recorder.onstop = () => this._onStopped(recorder, generation);
        // A borrowed practice stream already drives the main level meter.
        // Opening an extra AudioContext on iOS can suspend piano playback.
        if (this._ownsStream) this._startMeter(this.stream);
        recorder.start(250);
        this.recording = true;
        this.startedAt = performance.now();
        this.elapsedMs = 0;
      } catch (e) {
        this._stopMeter();
        this._stopTracks();
        this.mediaRecorder = null;
        throw e;
      } finally {
        this._starting = false;
      }
    }

    stop() {
      if (this._stopPending) return this._stopPending;
      if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
        this.recording = false;
        return Promise.resolve(null);
      }
      this._stopPending = new Promise((resolve) => {
        this._stopResolver = resolve;
        try { this.mediaRecorder.stop(); } catch { this._onStopped(this.mediaRecorder, this._generation); }
      });
      return this._stopPending;
    }

    _startMeter(stream) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = global.VTPiano?.ctx?.state !== "closed" ? global.VTPiano?.ctx : null;
        this._ownsContext = !this.ctx;
        if (!this.ctx) this.ctx = new AC();
        const source = this.ctx.createMediaStreamSource(stream);
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = 256;
        source.connect(this.analyser);
        const data = new Uint8Array(this.analyser.frequencyBinCount);
        const tick = () => {
          if (!this.analyser) return;
          this.analyser.getByteTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = (data[i] - 128) / 128;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          if (this.onLevel) this.onLevel(Math.min(1, rms * 3.2));
          this.raf = requestAnimationFrame(tick);
        };
        tick();
      } catch {
        /* meter optional */
      }
    }

    _stopMeter() {
      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
      if (this.ctx && this._ownsContext) {
        this.ctx.close().catch(() => {});
      }
      this.ctx = null;
      this.analyser = null;
      if (this.onLevel) this.onLevel(0);
    }

    _stopTracks() {
      if (this.stream && this._ownsStream) {
        this.stream.getTracks().forEach((t) => t.stop());
      }
      this.stream = null;
    }

    clear() {
      this._generation++;
      this._stopResolver?.(null);
      this._stopResolver = null;
      this._stopPending = null;
      if (this.recording) {
        try {
          this.mediaRecorder.stop();
        } catch {
          /* ignore */
        }
      }
      this._stopMeter();
      this._stopTracks();
      if (this.audioUrl) URL.revokeObjectURL(this.audioUrl);
      this.audioUrl = null;
      this.blob = null;
      this.chunks = [];
      this.recording = false;
    }
  }

  global.VTRecorder = VoiceRecorder;
})(window);
