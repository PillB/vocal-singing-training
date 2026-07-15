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
    }

    async start() {
      if (this.recording) return;
      this.chunks = [];
      this.blob = null;
      if (this.audioUrl) {
        URL.revokeObjectURL(this.audioUrl);
        this.audioUrl = null;
      }

      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "";

      this.mediaRecorder = mime
        ? new MediaRecorder(this.stream, { mimeType: mime })
        : new MediaRecorder(this.stream);

      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size) this.chunks.push(e.data);
      };

      this.mediaRecorder.onstop = () => {
        this.blob = new Blob(this.chunks, {
          type: this.mediaRecorder.mimeType || "audio/webm"
        });
        this.audioUrl = URL.createObjectURL(this.blob);
        this._stopMeter();
        this._stopTracks();
      };

      this._startMeter(this.stream);
      this.mediaRecorder.start(250);
      this.recording = true;
      this.startedAt = performance.now();
      this.elapsedMs = 0;
    }

    stop() {
      return new Promise((resolve) => {
        if (!this.mediaRecorder || this.mediaRecorder.state === "inactive") {
          this.recording = false;
          resolve(null);
          return;
        }
        this.mediaRecorder.onstop = () => {
          this.blob = new Blob(this.chunks, {
            type: this.mediaRecorder.mimeType || "audio/webm"
          });
          this.audioUrl = URL.createObjectURL(this.blob);
          this.elapsedMs = performance.now() - (this.startedAt || performance.now());
          this.recording = false;
          this._stopMeter();
          this._stopTracks();
          resolve({ blob: this.blob, url: this.audioUrl, durationMs: this.elapsedMs });
        };
        this.mediaRecorder.stop();
      });
    }

    _startMeter(stream) {
      try {
        const AC = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AC();
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
      if (this.ctx) {
        this.ctx.close().catch(() => {});
        this.ctx = null;
      }
      this.analyser = null;
      if (this.onLevel) this.onLevel(0);
    }

    _stopTracks() {
      if (this.stream) {
        this.stream.getTracks().forEach((t) => t.stop());
        this.stream = null;
      }
    }

    clear() {
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
