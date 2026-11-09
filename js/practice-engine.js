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
  /**
   * After Space keyup (or apparent release), keep manual sound inject this long.
   * A11y: motor tremor, OS Filter/Sticky Keys, and missed key events should not
   * reset SH/speech counters. Re-press within grace = continuous hold.
   * Research: game key-state sets + hold grace (no reliable web keyboard poll).
   */
  const MANUAL_GRACE_MS = 550;
  /**
   * Unvoiced SH/S air detection grace: brief RMS dips / pitch false-positives
   * must not zero the ladder counter (same idea as HOLD_GRACE for voiced holds).
   * Longer than v1 (420) so soft real-mic SH can “catch” and hold the count.
   */
  const AIR_GRACE_MS = 700;
  /** Base thresholds at sensitivity = 5 (mid). Higher sensitivity lowers them. */
  const VOICE_RMS_BASE = 0.012;
  const HOLD_RMS_BASE = 0.008;
  const PITCH_MIN = 52;
  const PITCH_MAX = 1060;
  // WebKit can say AudioContext.state === "running" while currentTime is
  // frozen. In that state the analyser can repeat one stale voiced buffer.
  // These are watchdog engineering thresholds, not acoustic guarantees.
  // ~three rAFs at 60 Hz; bound potential unobserved audio to 60 ms rather
  // than counting an entire 300-ms stale note as genuine singing.
  const AUDIO_CLOCK_SUSPECT_MS = 60;
  const AUDIO_CLOCK_FAILED_MS = 1400;
  // The most stall one check can add. A check that follows a long gap (the
  // page was hidden or frozen, the main thread was blocked, a test jumped its
  // fake clock) saw nothing in between: it may skip its own frame, but only
  // checks that keep finding the clock still may add up to a failed input.
  const AUDIO_CLOCK_MAX_STEP_MS = 250;
  // How long Start waits for a suspended audio context to resume. iOS keeps
  // resume() pending through a call or an "interrupted" session, with the
  // microphone already granted and Start and Stop both hidden; past this the
  // Start fails with Retry. An iPhone resume after the prompt takes about a
  // second, so a rare slow one shows Retry instead of leaving the learner stuck.
  const RESUME_WAIT_MS = 8000;

  /**
   * `promise`, or a rejection named AudioResumeTimeout once `ms` pass first:
   * the app says the audio was interrupted, not that a permission prompt is
   * still open (that is the microphone request's TimeoutError).
   */
  function within(promise, ms, what) {
    let timer;
    const late = new Promise((_, reject) => {
      timer = setTimeout(() => reject(Object.assign(new Error(`${what} took over ${ms} ms`), { name: "AudioResumeTimeout" })), ms);
    });
    return Promise.race([Promise.resolve(promise), late]).finally(() => clearTimeout(timer));
  }
  /** Default 7/10 — more sensitive than legacy fixed 0.016 (fewer false cutoffs) */
  const DEFAULT_SENS = 7;

  /**
   * The analyser's frame: about 43 ms of samples at 44.1 kHz and up, 2048 at
   * 44.1–48 kHz, 4096 at 88.2–96 and 8192 at 176.4–192 (never fewer than 2048,
   * so longer at lower rates). A 96 kHz interface's 2048 samples last only
   * 21 ms: a fan's level wobbles 5 dB from one frame to the next, and two
   * periods of a low male voice no longer fit in it.
   */
  function frameSize(sampleRate) {
    let n = 2048;
    while (n < 32768 && n < (sampleRate || 48000) * 0.04) n *= 2;
    return n;
  }

  class PracticeEngine {
    constructor() {
      this.running = false;
      // Each Start takes a number; stop() moves it on, so a Start that Stop
      // cancelled while the permission prompt was up never goes live.
      this._startGen = 0;
      this._startingGen = 0;
      this.audioCtx = null;
      this._ownsAudioCtx = false;
      this.stream = null;
      this.source = null;
      this.inputGain = null;
      this.analyser = null;
      this.buf = null;
      /** Byte frequency data for sibilant band (2–8 kHz) */
      this._freqBytes = null;
      this.raf = null;
      this._resetAudioClockWatch(0);

      this.mediaRecorder = null;
      this.recChunks = [];
      this.recording = false;
      this.recBlob = null;
      this.recUrl = null;
      // A late MediaRecorder stop event must never attach an older take to a
      // newer session (or mix their timeslice chunks).
      this._recordingEpoch = 0;

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

      /**
       * Manual sound assist (Space hold) — supplements autodetection for non-highway modes.
       * kind: "voice" | "air" (air = unvoiced energy for SH/S ladders)
       * Grace: after keyup, inject continues for MANUAL_GRACE_MS (a11y continuous count).
       */
      this._manualKeyDown = false;
      this._lastManualActiveAt = 0;
      this._manualKind = "voice";
      this._manualRmsFloor = 0.06;
      /** Last time unvoiced-air (SH/S) was detected — for AIR_GRACE_MS */
      this._lastAirAt = 0;

      // Callbacks
      this.onFrame = null; // { rms, voiceFreq, holdSec, voiced, holds, sensitivity, manualSound, airDetected }
      this.onHoldLogged = null; // seconds
      this.onStatus = null;
      this.onRecordingReady = null;

      this.startedAt = 0;
    }

    /**
     * @param {number} level 1–10 (1 = least sensitive / quiet room noise rejection, 10 = softest air/voice)
     * Level 10 is ~3× more sensitive than the pre-2026 max (gain + lower RMS bars).
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

    _manualGraceMs() {
      // Slightly longer grace for soft-motor / high-sensitivity users
      return MANUAL_GRACE_MS + Math.max(0, this.sensitivity - 5) * 25;
    }

    /**
     * True if Space is down OR we are still inside the post-keyup grace window.
     * @param {number} [now]
     */
    isManualEffective(now) {
      const t = now != null ? now : performance.now();
      if (this._manualKeyDown) return true;
      if (this._lastManualActiveAt > 0 && t - this._lastManualActiveAt < this._manualGraceMs()) {
        return true;
      }
      return false;
    }

    /**
     * Hold-key assist API (level-triggered from app key state).
     * active=true  → key down (or re-down): refresh timestamp, inject immediately.
     * active=false → key up: do NOT cut inject; grace keeps counting until timeout.
     * forceClear=true → blur / stop: end key + grace immediately.
     * @param {boolean} active
     * @param {"voice"|"air"} [kind]
     * @param {{ forceClear?: boolean }} [opts]
     */
    setManualSound(active, kind, opts) {
      if (kind === "air" || kind === "voice") this._manualKind = kind;
      const now = performance.now();
      if (opts && opts.forceClear) {
        this._manualKeyDown = false;
        this._lastManualActiveAt = 0;
        return false;
      }
      if (active) {
        this._manualKeyDown = true;
        this._lastManualActiveAt = now;
        return true;
      }
      // keyup: start grace from last active moment (keep counting)
      this._manualKeyDown = false;
      if (this._lastManualActiveAt <= 0) this._lastManualActiveAt = now;
      // Do not zero _lastManualActiveAt — grace window uses it
      return this.isManualEffective(now);
    }

    /** Alias for clarity from app layer */
    setManualKeyDown(down, kind) {
      return this.setManualSound(!!down, kind);
    }

    getManualSound() {
      const now = performance.now();
      const effective = this.isManualEffective(now);
      return {
        active: effective,
        keyDown: !!this._manualKeyDown,
        grace: effective && !this._manualKeyDown,
        kind: this._manualKind || "voice",
        graceMs: this._manualGraceMs()
      };
    }

    /**
     * Input gain: ~0.7 at sens1 → ~7.8 at sens10 (~3× old max of ~2.6).
     * Slightly exponential in the upper half so 8–10 reach soft SH/air.
     */
    _gainFromSens(s) {
      const t = (s - 1) / 9; // 0..1
      // Old curve was 0.7 + t*1.9. New: triple the lift above baseline.
      const linear = 0.7 + t * 5.7; // 0.7 → 6.4
      const boost = t * t * 1.4; // extra at high end → ~7.8
      return Math.min(8, linear + boost);
    }

    /**
     * Threshold scale: higher sensitivity → lower RMS bar.
     * Old: ~1.55 → ~0.40. New max ~0.13 so soft air crosses hold/voice floors.
     */
    _threshScale() {
      const t = (this.sensitivity - 1) / 9; // 0..1
      return 1.55 - t * 1.42; // ~1.55 → ~0.13
    }

    /** Unvoiced-air detection floor (SH ladder); scales with sensitivity */
    _airRms() {
      // Soft SH on laptop mics after OS processing is quiet:
      // sens 7 ≈ 0.005; sens 10 ≈ 0.002; sens 1 ≈ 0.014
      return 0.011 * this._threshScale() * 0.85;
    }

    /** FFT byte mean threshold for 2–8 kHz band (0–1), scales with sensitivity */
    _airBandFloor() {
      // sens 7 ≈ 0.06; sens 10 ≈ 0.03; sens 1 ≈ 0.12 (byte/255)
      return 0.09 * this._threshScale() * 0.75;
    }

    _airGraceMs() {
      return AIR_GRACE_MS + Math.max(0, this.sensitivity - 5) * 40;
    }

    /**
     * High-frequency energy proxy (first-difference high-pass).
     * Unvoiced fricatives (SH/S) have strong HF; low-pitch vowels less so.
     */
    _hfRms(buf) {
      if (!buf || buf.length < 2) return 0;
      let sum = 0;
      const n = buf.length;
      for (let i = 1; i < n; i++) {
        const d = buf[i] - buf[i - 1];
        sum += d * d;
      }
      return Math.sqrt(sum / (n - 1));
    }

    /**
     * Mean energy in ~2–8 kHz (sibilant / fricative band), normalized 0–1.
     * Uses getByteFrequencyData on the existing AnalyserNode.
     */
    _bandHf(sampleRate) {
      if (!this.analyser || !sampleRate) return 0;
      const n = this.analyser.frequencyBinCount;
      if (!n) return 0;
      if (!this._freqBytes || this._freqBytes.length !== n) {
        this._freqBytes = new Uint8Array(n);
      }
      try {
        this.analyser.getByteFrequencyData(this._freqBytes);
      } catch {
        return 0;
      }
      // bin i ≈ i * sampleRate / fftSize
      const fftSize = this.analyser.fftSize || n * 2;
      const hzPerBin = sampleRate / fftSize;
      const i0 = Math.max(1, Math.floor(2000 / hzPerBin));
      const i1 = Math.min(n - 1, Math.ceil(8000 / hzPerBin));
      if (i1 <= i0) return 0;
      let sum = 0;
      let count = 0;
      // Prefer upper half of sibilant band (less vowel formant bleed)
      const mid = Math.floor((i0 + i1) / 2);
      for (let i = mid; i <= i1; i++) {
        sum += this._freqBytes[i];
        count++;
      }
      if (!count) return 0;
      return sum / count / 255;
    }

    /**
     * Raw unvoiced-air decision for one frame (no grace).
     * Prefer detecting soft SH; only exclude clear voiced singing/speech.
     * v1 bug: clearVoice at voiceRms*0.8 + false pitch blocked real SH.
     * @param {number} rms
     * @param {number} hfRms
     * @param {boolean} hasPitch
     * @param {boolean} manualAir
     * @param {number} [bandHf] 0–1 FFT sibilant band
     */
    _airRaw(rms, hfRms, hasPitch, manualAir, bandHf) {
      if (manualAir) return true;
      const floor = this._airRms();
      const bandFloor = this._airBandFloor();
      const band = bandHf != null ? bandHf : 0;
      // Reject pure ambient, but allow soft SH (laptop mics after AGC are quiet).
      // Space path uses manualAir and never reaches these gates.
      const minRms = Math.max(floor * 0.65, 0.0045);
      const minHf = Math.max(floor * 0.4, 0.0032);
      // Sibilant / fricative: FFT band OR first-diff HF (soft SH signature)
      const sibilant =
        band >= bandFloor ||
        (band >= bandFloor * 0.85 && rms >= minRms * 0.3) ||
        (hfRms >= minHf && (hfRms >= rms * 0.32 || hfRms >= floor * 0.45));
      // Steady air / soft SH — clear energy above noise floor
      const energy =
        rms >= minRms ||
        hfRms >= minHf * 1.05 ||
        (band >= bandFloor * 0.85 && rms >= minRms * 0.4);
      // Only exclude *loud* clear singing/speech (not soft SH + false pitch).
      const loudVoiced =
        hasPitch &&
        rms >= Math.max(this._voiceRms() * 2.2, floor * 5) &&
        !sibilant &&
        band < bandFloor * 0.65 &&
        hfRms < Math.max(floor * 0.45, rms * 0.32);
      return sibilant || (energy && !loudVoiced);
    }

    _voiceRms() {
      return VOICE_RMS_BASE * this._threshScale();
    }

    _holdRms() {
      return HOLD_RMS_BASE * this._threshScale();
    }

    /**
     * Cross-browser mic acquisition.
     * Safari/Firefox may reject advanced constraints; fall back to simple audio:true.
     * Do not fan out concurrent prompts: the user may simply be reading the
     * browser's permission dialog. Time out one prompt, then stop trying;
     * only a fast constraints failure can trigger a weaker request.
     */
    async _acquireMic() {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("getUserMedia not available");
      }
      const attempts = [
        {
          audio: {
            echoCancellation: false,
            noiseSuppression: false,
            autoGainControl: false
          }
        },
        {
          audio: {
            echoCancellation: { ideal: false },
            noiseSuppression: { ideal: false },
            autoGainControl: { ideal: false }
          }
        },
        { audio: true }
      ];
      let lastErr;
      const withTimeout = async (p, ms) => {
        let timer;
        try {
          return await Promise.race([
            p,
            new Promise((_, reject) => {
              timer = setTimeout(() => {
                const err = new Error("Microphone permission timed out");
                err.name = "TimeoutError";
                reject(err);
              }, ms);
            })
          ]);
        } finally {
          clearTimeout(timer);
        }
      };
      for (const constraints of attempts) {
        let pending;
        try {
          pending = Promise.resolve(navigator.mediaDevices.getUserMedia(constraints));
          return await withTimeout(
            pending,
            // Allow human-paced permissions, including assistive technology.
            30000
          );
        } catch (e) {
          lastErr = e;
          console.warn("[VT] getUserMedia attempt failed", e?.name || e?.message || e);
          // A prompt answered after the timeout would otherwise hand over a
          // live stream nobody owns, leaving the browser's mic indicator on.
          pending?.then((s) => s.getTracks().forEach((t) => t.stop())).catch(() => {});
          // A refusal is final: asking twice more with looser constraints only
          // repeats it (and, on some browsers, the prompt).
          // A busy/disconnected microphone is not a constraint-compatibility
          // problem. Retrying it can trigger a second Safari capture session.
          if (!["OverconstrainedError", "TypeError", "NotSupportedError"].includes(e?.name)) break;
        }
      }
      this.lastCaptureError = lastErr || new Error("getUserMedia failed");
      throw this.lastCaptureError;
    }

    /** The one audio context for piano and pitch analysis, and whether this engine made it. */
    _inputContext() {
      // Creating a second context after an iOS microphone prompt often
      // leaves it suspended, so the piano's (or the last shared one) is reused.
      const shared =
        (global.VTPiano?.ctx?.state !== "closed" ? global.VTPiano?.ctx : null) ||
        (global.VTSharedAudioCtx?.state !== "closed" ? global.VTSharedAudioCtx : null);
      if (shared) return { ctx: shared, owns: false };
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) throw new Error("AudioContext not available");
      const ctx = new AC();
      global.VTSharedAudioCtx = ctx;
      return { ctx, owns: true };
    }

    /**
     * Build the analysis graph on `stream` for Start number `gen`. The resume
     * can take a while on an iPhone; if Stop or a newer Start came meanwhile,
     * nothing is built, so this Start cannot replace or orphan the nodes of
     * the session that owns the engine now.
     */
    async _setupInputGraph(gen = this._startGen, stream = this.stream) {
      const { ctx, owns } = this._inputContext();
      if (["suspended", "interrupted"].includes(ctx.state)) {
        await within(ctx.resume(), RESUME_WAIT_MS, "Resuming the audio context");
      }
      await within(global.VTPiano?.resume?.(), RESUME_WAIT_MS, "Resuming the piano");
      if (gen !== this._startGen) return;
      this.audioCtx = ctx;
      this._ownsAudioCtx = owns;
      this.inputGain = ctx.createGain();
      this.inputGain.gain.value = this._gainFromSens(this.sensitivity);
      this.analyser = ctx.createAnalyser();
      this.analyser.fftSize = frameSize(ctx.sampleRate);
      this.analyser.smoothingTimeConstant = 0.12;
      // Never replace a failed microphone node with silence and report a
      // healthy session. A blank green 'live' state is worse than Retry.
      this.source = ctx.createMediaStreamSource(stream);
      this.source.connect(this.inputGain);
      this.inputGain.connect(this.analyser);
      this.buf = new Float32Array(this.analyser.fftSize);
      this._freqBytes = new Uint8Array(this.analyser.frequencyBinCount);
    }

    _discardFailedInput() {
      try { this.source?.disconnect(); } catch { /* no connected source */ }
      try { this.inputGain?.disconnect(); } catch { /* no connected gain */ }
      this.source = null;
      this.inputGain = null;
      this.analyser = null;
      this.stream?.getTracks?.().forEach((track) => track.stop());
      this.stream = null;
      this.audioCtx = null;
      this._ownsAudioCtx = false;
      this.running = false;
    }

    _watchMicTrack(track, stream) {
      const stillOwned = () => this.running && this.stream === stream;
      const reportLoss = (kind) => {
        if (stillOwned()) this._status(kind);
      };
      track.addEventListener?.("ended", () => reportLoss("mic-ended"));
      // The engine has one mute timer, and it is the live take's. A retired take's track keeps these listeners
      // (and is not even stopped while its recorder flushes), so a route switch that mutes or unmutes it beside
      // the new microphone must leave the new take's check alone, or a sustained mute is never reported.
      track.addEventListener?.("mute", () => {
        if (!stillOwned()) return;
        // iOS briefly mutes on focus/audio-route switches; don't stop a take
        // for one transient sample, but never score through a sustained mute.
        clearTimeout(this._micMuteTimer);
        this._micMuteTimer = setTimeout(() => {
          if (stillOwned() && track.muted) reportLoss("mic-muted");
        }, 1200);
      });
      track.addEventListener?.("unmute", () => {
        if (stillOwned()) clearTimeout(this._micMuteTimer);
      });
      if (track.muted) {
        this._micMuteTimer = setTimeout(() => {
          if (stillOwned() && track.muted) reportLoss("mic-muted");
        }, 1200);
      }
    }

    _watchAudioContext(ctx, stream) {
      if (!ctx?.addEventListener) return;
      const onState = () => {
        if (!this.running || this.stream !== stream) return;
        if (ctx.state === "running") {
          clearTimeout(this._ctxLossTimer);
          this._ctxLossTimer = null;
          if (this._analysisPaused) {
            this._analysisPaused = false;
            this._lastFrameAt = performance.now();
            // A real resume starts a new suspicion window; WebKit can still
            // say "running" over a frozen clock, and that is caught afresh.
            this._resetAudioClockWatch(this._lastFrameAt);
            this._loop();
          }
          return;
        }
        if (!["suspended", "interrupted"].includes(ctx.state)) return;
        if (!this._analysisPaused) {
          this._analysisPaused = true;
          if (this.raf) cancelAnimationFrame(this.raf);
          this.raf = null;
          this._maybeEndHold(true); // Close at last real sample, not at resume.
        }
        clearTimeout(this._ctxLossTimer);
        this._ctxLossTimer = setTimeout(() => {
          if (this.running && this.stream === stream && this._analysisPaused) {
            this._status("input-interrupted");
          }
        }, 1200);
      };
      ctx.addEventListener("statechange", onState);
      this._contextWatcher = { ctx, onState };
      onState();
    }

    async _startOptionalRecorder(record) {
      if (!record) return;
      try {
        await this._startRecorder();
      } catch (e) {
        console.warn("MediaRecorder unavailable; practice continues without file recording", e);
        this.recording = false;
        this.mediaRecorder = null;
      }
    }

    /** True while a Start waits on the microphone or its graph (stop() cancels it). */
    get starting() {
      return !this.running && this._startingGen !== 0 && this._startingGen === this._startGen;
    }

    async start({ record = false } = {}) {
      if (this.running) return;
      const gen = ++this._startGen;
      this._startingGen = gen;
      try {
        await this._startSession(gen, record);
      } finally {
        if (this._startingGen === gen) this._startingGen = 0;
      }
    }

    /**
     * The microphone for Start number `gen`, or null when Stop (or a newer
     * Start) came first. A stream granted that late is released here: no
     * graph, no "listening", no frame for a drill that never started (PR #24).
     */
    async _captureFor(gen) {
      const stream = await this._acquireMic();
      if (gen === this._startGen) return stream;
      stream?.getTracks?.().forEach((track) => track.stop());
      return null;
    }

    /**
     * A phone or headset may ignore the request to leave the input alone.
     * Automatic gain evens out exactly the loudness differences the volume
     * exercises train, so the pictures say so rather than draw a false flat.
     */
    _noteInputProcessing(track) {
      try {
        const st = track.getSettings?.() || {};
        this.processedInput = !!(st.autoGainControl || st.noiseSuppression);
      } catch {
        this.processedInput = false;
      }
    }

    /** A cancelled Start's own stream: stop its tracks, and drop it if the engine still points at it. */
    _releaseStale(stream) {
      stream.getTracks?.().forEach((track) => {
        if (track.readyState !== "ended") track.stop();
      });
      if (this.stream === stream) this.stream = null;
    }

    async _startSession(gen, record) {
      this.lastCaptureError = null;
      const stream = await this._captureFor(gen);
      if (!stream) return;
      this.stream = stream;
      const audioTrack = this.stream.getAudioTracks?.()[0];
      if (!audioTrack || audioTrack.readyState === "ended") {
        this._discardFailedInput();
        this.lastCaptureError = new Error("Microphone supplied no live audio track");
        throw this.lastCaptureError;
      }
      this._noteInputProcessing(audioTrack);
      let graphError = null;
      try {
        await this._setupInputGraph(gen, stream);
      } catch (e) {
        graphError = e;
      }
      if (gen !== this._startGen) {
        // Stop or a newer Start came while the graph was built: this Start
        // ends quietly (no mic failure) and gives its own microphone back.
        this._releaseStale(stream);
        return;
      }
      // A call or an unplugged headset can end the track while the graph is
      // built; its "ended" event came before anyone listened for it.
      if (!graphError && audioTrack.readyState === "ended") graphError = new Error("Microphone ended while Start built the audio graph");
      if (graphError) {
        this.lastCaptureError = graphError;
        this._discardFailedInput();
        throw graphError;
      }

      this.voiced = false;
      this.holdStart = null;
      this.currentHoldSec = 0;
      this.lastVoiceAt = 0;
      this._lastAirAt = 0;
      this.holds = []; // clear prior session holds on restart
      this.startedAt = performance.now();
      this.running = true;
      this._lastFrameAt = performance.now();
      this._resetAudioClockWatch(performance.now());
      this._watchMicTrack(audioTrack, this.stream);
      this._watchAudioContext(this.audioCtx, this.stream);
      await this._startOptionalRecorder(record);

      this._status("listening");
      if (!this._analysisPaused) this._loop();
    }

    async _startRecorder() {
      const chunks = [];
      this.recChunks = chunks;
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
      const recorder = this.mediaRecorder;
      const stream = this.stream;
      const epoch = ++this._recordingEpoch;
      const startedAt = this.startedAt;
      // The app may install a new callback for the next exercise before this
      // recorder's queued stop event fires. Bind delivery to the originating
      // take, never the mutable callback of the current exercise.
      const onReady = this.onRecordingReady;
      const releaseTracks = () => {
        stream?.getTracks?.().forEach((track) => track.stop());
        if (this.stream === stream) this.stream = null;
      };
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size) chunks.push(e.data);
      };
      // stop() only *queues* the final dataavailable event. A blob assembled
      // immediately after stop() loses the last slice (or an entire short
      // recording). The spec orders dataavailable BEFORE this stop event.
      recorder.onstop = () => {
        releaseTracks();
        if (epoch !== this._recordingEpoch) return;
        this.recording = false;
        if (this.mediaRecorder === recorder) this.mediaRecorder = null;
        if (!chunks.length) return;
        this.recBlob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
        this.recUrl = URL.createObjectURL(this.recBlob);
        onReady?.({
          blob: this.recBlob,
          url: this.recUrl,
          durationMs: Math.max(0, performance.now() - startedAt)
        });
      };
      recorder.start(250);
      this.recording = true;
    }

    stop() {
      this._startGen++; // a Start still waiting on the mic or its graph is cancelled
      // Finalize open hold if long enough
      this._maybeEndHold(true);
      // End Space assist immediately (no grace after stop)
      this._manualKeyDown = false;
      this._lastManualActiveAt = 0;
      this._lastAirAt = 0;

      if (this.raf) cancelAnimationFrame(this.raf);
      this.raf = null;
      this.running = false;
      clearTimeout(this._micMuteTimer);
      this._micMuteTimer = null;
      clearTimeout(this._ctxLossTimer);
      this._ctxLossTimer = null;
      this._contextWatcher?.ctx?.removeEventListener?.("statechange", this._contextWatcher.onState);
      this._contextWatcher = null;
      this._analysisPaused = false;
      this._resetAudioClockWatch(0);

      let recorderStopping = false;
      if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
        try {
          this.mediaRecorder.stop();
          recorderStopping = true;
        } catch {
          /* ignore */
        }
      }
      // The event handler owns the final slice and releases the stream after
      // that event. With no active recorder, release it immediately.
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
      // Never close AudioContext here. Even when PracticeEngine created it, the
      // piano may later adopt VTSharedAudioCtx — close() leaves VTPiano.ctx
      // permanently "closed" (silent piano until hard reload). Disconnect only.
      this.audioCtx = null;
      this._ownsAudioCtx = false;
      if (this.stream && !recorderStopping) {
        this.stream.getTracks().forEach((t) => t.stop());
        this.stream = null;
      }
      this.voiceFreq = null;
      this.currentHoldSec = 0;
      this._status("idle");
      // Recorded take (if any) is delivered asynchronously via onRecordingReady.
      return null;
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

    _resetAudioClockWatch(now) {
      this._audioClockTime = null;
      this._audioClockCheckedAt = now;
      this._audioClockStalledMs = 0;
      this._audioClockStalled = false;
    }

    /**
     * Never score cached samples from an audio render clock that stopped.
     * The stall is the time the checks themselves kept finding the clock
     * still, each check adding at most AUDIO_CLOCK_MAX_STEP_MS: one 28-second
     * gap between two checks is not 28 seconds of evidence.
     */
    _audioClockHealthy(now) {
      const clock = this.audioCtx?.currentTime;
      if (!Number.isFinite(clock)) return true;
      const step = Math.min(AUDIO_CLOCK_MAX_STEP_MS, Math.max(0, now - (this._audioClockCheckedAt || now)));
      this._audioClockCheckedAt = now;
      if (this._audioClockTime == null || clock > this._audioClockTime + 0.001 || clock < this._audioClockTime) {
        this._audioClockTime = clock;
        this._audioClockStalledMs = 0;
        this._audioClockStalled = false;
        return true;
      }
      this._audioClockStalledMs += step;
      const stalledFor = this._audioClockStalledMs;
      if (stalledFor < AUDIO_CLOCK_SUSPECT_MS) return true;
      if (!this._audioClockStalled) {
        this._audioClockStalled = true;
        // A partial note can be credited only through its *last real* sample.
        // Neither the visual grace clock nor the mode timer may extend it.
        this._maybeEndHold(true);
        this.voiceFreq = null;
        this._lastAirAt = 0;
      }
      if (stalledFor >= AUDIO_CLOCK_FAILED_MS) {
        this._analysisPaused = true;
        this.raf = null;
        this._status("input-interrupted");
      }
      return false;
    }

    _rms(buf) {
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const value = Math.sqrt(sum / buf.length);
      this._latestRms = value;
      return value;
    }

    _detectPitch(buf, sampleRate) {
      // Fresh evidence for pitch-game scoring. voiceFreq intentionally remains
      // a short visual/HUD grace value during a single detector dropout.
      if (global.VTPitchUtils && global.VTPitchUtils.detectPitch) {
        const measured = global.VTPitchUtils.detectPitch(buf, sampleRate);
        this._latestRawPitch = measured >= PITCH_MIN && measured <= PITCH_MAX ? measured : null;
        return measured;
      }
      this._latestRawPitch = null;
      return null;
    }

    /**
     * The pitch the latest analysed frame may score: the detector's own fresh
     * reading with real energy behind it. Never the grace-held display value
     * (voiceFreq bridges a dropout on screen), never the SH/S air assist.
     */
    scoringPitch() {
      const measured = this._latestRawPitch;
      if (!measured || this._latestRms < this._holdRms() * 0.55) return null;
      if (this.isManualEffective() && this._manualKind === "air") return null;
      return measured;
    }

    _clarity(buf, sampleRate) {
      if (global.VTPitchUtils && global.VTPitchUtils.clarity) {
        return global.VTPitchUtils.clarity(buf, sampleRate);
      }
      return null;
    }

    /** How long a silence ends a hold: the base window, longer at high sensitivity (as _loop counts it). */
    _silenceEndMs() {
      return SILENCE_END_MS + Math.max(0, this.sensitivity - 5) * 50;
    }

    _maybeEndHold(force) {
      if (!this.holdStart) return;
      const now = performance.now();
      const silenceLong = force || now - this.lastVoiceAt >= SILENCE_END_MS;
      if (!silenceLong && !force) return;
      // Credit through last real voice, not trailing silence window
      // A hold opens on a voiced frame, so lastVoiceAt >= holdStart while it
      // is open; never credit time after the last voice (a one-frame hold
      // before a hidden minute used to be logged as the minute).
      const endAt = this.lastVoiceAt >= this.holdStart ? this.lastVoiceAt : now;
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
      let rms = this._rms(this.buf);
      // HF / band before any manual RMS inject — true fricative signature from the mic
      const hfRms = this._hfRms(this.buf);
      const sampleRate = this.audioCtx.sampleRate || 48000;
      const bandHf = this._bandHf(sampleRate);
      let freq = this._detectPitch(this.buf, sampleRate);
      const clarity = this._clarity(this.buf, sampleRate);
      const now = performance.now();

      // Manual assist (Space): key down OR post-keyup grace (a11y continuous count)
      if (this._manualKeyDown) {
        this._lastManualActiveAt = now;
      }
      const manual = this.isManualEffective(now);
      const manualInGrace = manual && !this._manualKeyDown;
      const manualKind = this._manualKind === "air" ? "air" : "voice";
      if (manual) {
        rms = Math.max(rms, this._manualRmsFloor || 0.06);
        if (manualKind === "air") {
          // Unvoiced fricative assist (SH/S) — clear pitch so modes use air path
          freq = null;
        }
      }

      const voiceRms = this._voiceRms();
      const holdRms = this._holdRms();
      // Slightly longer grace when mic is very sensitive (soft voices drop more)
      const graceMs = HOLD_GRACE_MS + Math.max(0, this.sensitivity - 5) * 40;
      const silenceEndMs = SILENCE_END_MS + Math.max(0, this.sensitivity - 5) * 50;

      const hasPitch =
        freq != null && freq >= PITCH_MIN && freq <= PITCH_MAX;

      // Unvoiced SH/S air: FFT band + HF + lowered floor; grace bridges micro-gaps
      const manualAir = !!(manual && manualKind === "air");
      const airRaw = this._airRaw(rms, hfRms, hasPitch, manualAir, bandHf);
      if (airRaw) this._lastAirAt = now;
      const airDetected =
        airRaw ||
        (this._lastAirAt > 0 && now - this._lastAirAt < this._airGraceMs());
      // Start a hold only with energy + pitch; continue a hold with energy alone
      // (pitch detectors flake mid-sustain — we give grace + sensitivity)
      let strongVoice = rms >= voiceRms && hasPitch;
      // Soft-voice path: energy alone can open a hold at high sensitivity
      let softOpen =
        this.holdStart == null &&
        rms >= holdRms * 1.15 &&
        (hasPitch || this.sensitivity >= 7 || (manual && manualKind === "voice"));
      if (manual && manualKind === "voice") {
        strongVoice = true;
        softOpen = softOpen || this.holdStart == null;
      }
      // Manual air must not open pitched holds
      if (manual && manualKind === "air") {
        strongVoice = false;
        softOpen = false;
      }
      const continueVoice =
        this.holdStart != null &&
        (rms >= holdRms ||
          hasPitch ||
          (manual && manualKind === "voice") ||
          now - this.lastVoiceAt < graceMs);

      if (strongVoice || softOpen || continueVoice) {
        if (hasPitch) this.voiceFreq = freq;
        // Refresh lastVoiceAt on real energy OR clean pitch (not bare grace alone)
        if (
          strongVoice ||
          softOpen ||
          rms >= holdRms ||
          (hasPitch && rms >= holdRms * 0.55) ||
          (manual && manualKind === "voice")
        ) {
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

      // Frame pitch: air-manual forces null; else use detected
      const frameFreq =
        manual && manualKind === "air" ? null : this.voiceFreq;

      const dtMs = Math.min(50, now - (this._lastFrameAt || now));
      this._lastFrameAt = now;
      // Grace UI spans full silence window so green/amber doesn't drop before hold ends
      const inGraceWindow =
        !!this.holdStart && now - this.lastVoiceAt < silenceEndMs;
      const activelyHolding =
        !!this.holdStart && now - this.lastVoiceAt < graceMs;
      const voicedOut =
        (manual && manualKind === "voice") ||
        inGraceWindow ||
        strongVoice ||
        softOpen;
      if (this.onFrame) {
        this.onFrame({
          rms,
          voiceFreq: frameFreq,
          targetFreq: this.targetFreq,
          holdSec: this.currentHoldSec,
          voiced: voicedOut,
          holds: this.holds,
          recording: this.recording,
          elapsedMs: now - this.startedAt,
          dtMs,
          holdGrace: !!this.holdStart && !strongVoice && inGraceWindow,
          holdSolid:
            activelyHolding ||
            strongVoice ||
            softOpen ||
            (manual && manualKind === "voice"),
          sensitivity: this.sensitivity,
          manualSound: manual,
          manualGrace: manualInGrace,
          manualKind: manual ? manualKind : null,
          airRmsThreshold: this._airRms(),
          /** True when unvoiced SH/S air is detected (or inside air grace) */
          airDetected,
          airRaw,
          hfRms,
          airBand: bandHf,
          /**
           * This frame alone, with no grace. `voiced` and `voiceFreq` bridge
           * about a second of silence so a hold survives a flaky detector;
           * anything that measures a pause, a note's length or an onset needs
           * the raw edge instead, or a one-second pause reads as speech.
           */
          sounding: manual || rms >= holdRms || (hasPitch && rms >= holdRms * 0.55),
          rawFreq: manual && manualKind === "air" ? null : hasPitch ? freq : null,
          /**
           * How periodic the mic's own samples are, 0–1, at any level (null
           * without VTPitchUtils): a voice or a hum near 1, a fan or a hiss
           * under 0.5. `rawFreq` cannot tell them apart: it is null under
           * −40 dBFS, and above it noise gets a pitch too.
           */
          clarity,
          voiceRmsThreshold: voiceRms,
          holdRmsThreshold: holdRms,
          /** The input gain the MIC slider applies: rms / inputGain is the level the slider does not move. */
          inputGain: this.inputGain ? this.inputGain.gain.value : 1,
          processedInput: !!this.processedInput,
          /** Time-domain samples of this frame (about 43 ms at 44.1 kHz and up); valid only during the callback. */
          buf: this.buf,
          sampleRate
        });
      }

      this.raf = requestAnimationFrame(() => this._loop());
    }
  }

  // Protect the legacy analysis loop at its entry boundary. This small
  // decorator keeps the CC>15 legacy DSP method unchanged while the global
  // lint gate continues to prohibit new/modified overly complex functions.
  // Its own rAF reschedule is only for clock verification; no stale frame
  // reaches _loop(), a mode, a hold, or the pitch game.
  const analyseFrame = PracticeEngine.prototype._loop;
  /**
   * The frame's `dtMs` is capped at 50 ms for the signal features (a hold, a
   * pause, a pitch game must not jump after a stall). A timeline beside the
   * app's step timer, which runs on wall time, needs the real time as well
   * (a guided drill's steps: at 10 fps the capped time is half the wall
   * time, so the step ended with the guide half-way): `wallDtMs`, the
   * uncapped time since the frame before, from the same `_lastFrameAt` as
   * the cap, so dtMs is always min(50, wallDtMs). _loop() builds the frame;
   * its onFrame is relayed for that one call, and kept if the frame replaced it.
   */
  function analyseWithWallTime(engine) {
    const deliver = engine.onFrame;
    if (typeof deliver !== "function") return analyseFrame.call(engine);
    const since = engine._lastFrameAt;
    const relay = function relayFrame(frame) {
      const now = engine._lastFrameAt;
      if (frame) frame.wallDtMs = Math.max(0, now - (since || now));
      return deliver.call(this, frame);
    };
    engine.onFrame = relay;
    try {
      return analyseFrame.call(engine);
    } finally {
      if (engine.onFrame === relay) engine.onFrame = deliver;
    }
  }
  PracticeEngine.prototype._loop = function guardedAnalysisFrame() {
    if (!this.running || !this.analyser) return;
    // No voice for longer than the silence window, heard or not (a hidden
    // tab stops rAF while the mic stays open; a stall can fall inside a
    // silence the loop was bridging): close an open hold at its last real
    // sample instead of crediting the time nobody heard (PR #24).
    if (this.holdStart && performance.now() - this.lastVoiceAt > this._silenceEndMs()) this._maybeEndHold(true);
    if (!this._audioClockHealthy(performance.now())) {
      if (this.running && !this._analysisPaused) {
        this.raf = requestAnimationFrame(() => this._loop());
      }
      return;
    }
    return analyseWithWallTime(this);
  };

  PracticeEngine.frameSize = frameSize;
  global.VTPracticeEngine = PracticeEngine;
  global.VT_HOLD_MIN_SEC = HOLD_MIN_SEC;
  global.VT_HOLD_GRACE_MS = HOLD_GRACE_MS;
  global.VT_MANUAL_GRACE_MS = MANUAL_GRACE_MS;
  global.VT_AIR_GRACE_MS = AIR_GRACE_MS;
  global.VT_SILENCE_END_MS = SILENCE_END_MS;
  global.VT_DEFAULT_MIC_SENS = DEFAULT_SENS;
})(window);
