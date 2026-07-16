/**
 * Exercise-specific practice modes — HUD + detectors + metric patches.
 * Each mode is pedagogically distinct (not a renamed pitch game).
 */
(function (global) {
  "use strict";

  function el(html) {
    const d = document.createElement("div");
    d.innerHTML = html.trim();
    return d.firstChild;
  }

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  /** Shared phase runner for multi-step timers */
  function createPhaseRunner(phases, onPhase) {
    let idx = 0;
    let remaining = phases[0]?.sec || 0;
    let lastTick = performance.now();
    return {
      get index() {
        return idx;
      },
      get label() {
        return phases[idx]?.label || "—";
      },
      get remaining() {
        return remaining;
      },
      get count() {
        return phases.length;
      },
      tick(now) {
        if (idx >= phases.length) return;
        const dt = (now - lastTick) / 1000;
        lastTick = now;
        remaining -= dt;
        if (remaining <= 0) {
          idx++;
          if (idx < phases.length) {
            remaining = phases[idx].sec;
            if (onPhase) onPhase(idx, phases[idx]);
          } else remaining = 0;
        }
      },
      reset() {
        idx = 0;
        remaining = phases[0]?.sec || 0;
        lastTick = performance.now();
      }
    };
  }

  const Modes = {};

  /** Base helpers for all modes */
  function baseMode(spec) {
    return {
      id: spec.id,
      state: {},
      profile: null,
      hud: null,
      mount(container, profile) {
        this.profile = profile;
        this.state = { startedAt: performance.now(), patches: {}, extras: {} };
        container.innerHTML = "";
        this.hud = el(`<div class="mode-panel mode-${spec.id}"></div>`);
        container.appendChild(this.hud);
        if (spec.render) spec.render.call(this);
        return this;
      },
      unmount() {
        if (this.hud && this.hud.parentNode) this.hud.parentNode.removeChild(this.hud);
        this.hud = null;
      },
      onStart() {
        if (spec.onStart) spec.onStart.call(this);
      },
      onFrame(frame) {
        if (spec.onFrame) spec.onFrame.call(this, frame);
      },
      onStop() {
        if (spec.onStop) return spec.onStop.call(this) || { patches: this.state.patches };
        return { patches: this.state.patches || {}, summary: "" };
      },
      $(sel) {
        return this.hud ? this.hud.querySelector(sel) : null;
      }
    };
  }

  // ——— VOCAL ———

  Modes.rateLadder = baseMode({
    id: "rateLadder",
    render() {
      const phases = this.profile.phases || [];
      this.state.runner = createPhaseRunner(phases, (i, p) => {
        if (global.VTToast) global.VTToast(`Phase: ${p.label}`);
      });
      this.hud.innerHTML = `
        <div class="mode-title">Rate ladder</div>
        <div class="mode-phase" data-phase>—</div>
        <div class="mode-big" data-remain>—</div>
        <div class="mode-bar"><span data-bar style="width:0%"></span></div>
        <p class="mode-meta">Speech activity: <strong data-act>0%</strong> · Phases done: <strong data-done>0</strong>/${phases.length}</p>
      `;
    },
    onFrame(frame) {
      const r = this.state.runner;
      if (!r) return;
      r.tick(performance.now());
      const phase = this.profile.phases[r.index];
      const total = phase?.sec || 1;
      const pct = phase ? clamp(((total - r.remaining) / total) * 100, 0, 100) : 100;
      if (this.$("[data-phase]"))
        this.$("[data-phase]").textContent =
          r.index < r.count ? r.label : "Ladder complete";
      if (this.$("[data-remain]"))
        this.$("[data-remain]").textContent =
          r.index < r.count ? `${Math.ceil(r.remaining)}s` : "✓";
      if (this.$("[data-bar]")) this.$("[data-bar]").style.width = `${pct}%`;
      // activity
      this.state.samples = (this.state.samples || 0) + 1;
      if (frame.voiced || frame.rms > 0.02) this.state.active = (this.state.active || 0) + 1;
      const act = Math.round(((this.state.active || 0) / this.state.samples) * 100);
      if (this.$("[data-act]")) this.$("[data-act]").textContent = `${act}%`;
      if (this.$("[data-done]")) this.$("[data-done]").textContent = String(Math.min(r.index, r.count));
      this.state.patches.phaseCount = Math.min(r.index + (r.remaining <= 0 ? 0 : 0), r.count);
      if (r.index >= r.count) this.state.patches.phaseCount = r.count;
    },
    onStop() {
      const r = this.state.runner;
      const done = r ? Math.min(r.index + (r.remaining < (this.profile.phases[r.index]?.sec || 1) * 0.5 ? 1 : 0), r.count) : 0;
      return {
        patches: {
          duration: Math.round((performance.now() - this.state.startedAt) / 60000) || 1,
          metaphorCount: done,
          rounds: done,
          phaseCount: done
        },
        summary: `Completed ${done} phase(s)`
      };
    }
  });

  Modes.metronomeSpeech = Modes.rateLadder; // same runner, different labels from profile

  Modes.volumeSteady = baseMode({
    id: "volumeSteady",
    render() {
      this.state.breathCycles = 0;
      this.state.inBreath = false;
      this.state.peakRms = 0;
      this.state.samples = [];
      this.hud.innerHTML = `
        <div class="mode-title">Volume lane · steady energy</div>
        <div class="volume-lane">
          <div class="volume-band"></div>
          <div class="volume-needle" data-needle style="left:50%"></div>
        </div>
        <p class="mode-meta">Live level · aim for the center band · breath cycles: <strong data-cyc>0</strong></p>
        <p class="mode-meta" data-fade>—</p>
      `;
    },
    onFrame(frame) {
      const rms = frame.rms || 0;
      // smooth
      this.state.smooth = (this.state.smooth || 0.2) * 0.85 + rms * 0.15;
      const x = clamp(this.state.smooth * 180, 2, 98);
      if (this.$("[data-needle]")) this.$("[data-needle]").style.left = `${x}%`;
      // breath cycle: voice then silence
      if (frame.voiced || rms > 0.025) {
        if (!this.state.inBreath) {
          this.state.inBreath = true;
          this.state.breathStartPeak = this.state.smooth;
          this.state.breathSamples = [];
        }
        this.state.breathSamples.push(this.state.smooth);
        this.state.peakRms = Math.max(this.state.peakRms, this.state.smooth);
      } else if (this.state.inBreath && rms < 0.015) {
        this.state.inBreath = false;
        this.state.breathCycles++;
        const arr = this.state.breathSamples || [];
        if (arr.length > 8) {
          const first = arr.slice(0, Math.floor(arr.length / 3));
          const last = arr.slice(-Math.floor(arr.length / 3));
          const fAvg = first.reduce((a, b) => a + b, 0) / first.length;
          const lAvg = last.reduce((a, b) => a + b, 0) / last.length;
          this.state.lastFade = lAvg < fAvg * 0.7;
        }
        if (this.$("[data-cyc]")) this.$("[data-cyc]").textContent = String(this.state.breathCycles);
        if (this.$("[data-fade]"))
          this.$("[data-fade]").textContent = this.state.lastFade
            ? "Last breath: faded at the end — start slightly softer next time."
            : "Last breath: solid evenness.";
      }
    },
    onStop() {
      const cyc = this.state.breathCycles || 0;
      const consistency = this.state.lastFade === false ? 4 : this.state.lastFade ? 2 : 3;
      return {
        patches: { cycles: Math.max(cyc, 1), consistency },
        summary: `${cyc} breath cycles logged`
      };
    }
  });

  Modes.volumeLadder = baseMode({
    id: "volumeLadder",
    render() {
      const ladder = this.profile.ladder || [];
      this.state.step = 0;
      this.state.stepStarted = performance.now();
      this.state.cycles = 0;
      this.hud.innerHTML = `
        <div class="mode-title">Volume / energy ladder</div>
        <div class="mode-phase" data-phase>${ladder[0]?.label || "—"}</div>
        <div class="volume-lane">
          <div class="volume-band" data-band></div>
          <div class="volume-needle" data-needle style="left:10%"></div>
        </div>
        <div class="mode-big" data-remain>${this.profile.stepSec || 8}s</div>
        <p class="mode-meta">Step <strong data-step>1</strong>/${ladder.length} · Full climbs: <strong data-cyc>0</strong></p>
      `;
    },
    onFrame(frame) {
      const ladder = this.profile.ladder || [];
      const stepSec = (this.profile.stepSec || 8) * 1000;
      const elapsed = performance.now() - this.state.stepStarted;
      const left = Math.max(0, (stepSec - elapsed) / 1000);
      if (this.$("[data-remain]")) this.$("[data-remain]").textContent = `${Math.ceil(left)}s`;
      const target = ladder[this.state.step]?.target || 0.35;
      this.state.smooth = (this.state.smooth || 0) * 0.8 + (frame.rms || 0) * 0.2;
      const x = clamp(this.state.smooth * 160, 2, 98);
      if (this.$("[data-needle]")) this.$("[data-needle]").style.left = `${x}%`;
      if (this.$("[data-band]")) {
        const bandLeft = clamp(target * 160 - 8, 5, 85);
        this.$("[data-band]").style.left = `${bandLeft}%`;
        this.$("[data-band]").style.width = "16%";
      }
      if (elapsed >= stepSec) {
        this.state.step++;
        if (this.state.step >= ladder.length) {
          this.state.cycles++;
          this.state.step = 0;
          if (this.$("[data-cyc]")) this.$("[data-cyc]").textContent = String(this.state.cycles);
        }
        this.state.stepStarted = performance.now();
        if (this.$("[data-phase]"))
          this.$("[data-phase]").textContent = ladder[this.state.step]?.label || "—";
        if (this.$("[data-step]")) this.$("[data-step]").textContent = String(this.state.step + 1);
      }
    },
    onStop() {
      return {
        patches: {
          ladderReps: Math.max(1, this.state.cycles),
          flexibility: clamp(this.state.cycles + 2, 1, 5),
          control: clamp(2 + this.state.cycles, 1, 5)
        },
        summary: `${this.state.cycles} full ladder climb(s)`
      };
    }
  });

  Modes.countPace = baseMode({
    id: "countPace",
    render() {
      this.hud.innerHTML = `
        <div class="mode-title">Count pace</div>
        <div class="mode-big" data-t>0:00</div>
        <p class="mode-meta">Keep a tall oral space. Nudge every 15s.</p>
        <p class="mode-meta" data-nudge>Ready when you are.</p>
      `;
      this.state.lastNudge = 0;
    },
    onFrame() {
      const sec = Math.floor((performance.now() - this.state.startedAt) / 1000);
      const m = Math.floor(sec / 60);
      const s = sec % 60;
      if (this.$("[data-t]"))
        this.$("[data-t]").textContent = `${m}:${String(s).padStart(2, "0")}`;
      if (sec > 0 && sec % 15 === 0 && sec !== this.state.lastNudge) {
        this.state.lastNudge = sec;
        if (this.$("[data-nudge]"))
          this.$("[data-nudge]").textContent =
            sec < 60 ? "Keep counting — soft palate lifted." : "Almost there — stay free in the jaw.";
      }
    },
    onStop() {
      return { patches: {}, summary: "Count session complete" };
    }
  });

  Modes.articulationContrast = baseMode({
    id: "articulationContrast",
    render() {
      const phases = this.profile.phases || [
        { label: "Phase A", sec: 90 },
        { label: "Phase B", sec: 45 }
      ];
      this.state.runner = createPhaseRunner(phases, (i, p) => {
        if (global.VTToast) global.VTToast(p.label);
      });
      this.hud.innerHTML = `
        <div class="mode-title">Contrast phases</div>
        <div class="mode-phase" data-phase>${phases[0].label}</div>
        <div class="mode-big" data-remain>${phases[0].sec}s</div>
        <div class="mode-bar"><span data-bar style="width:0%"></span></div>
      `;
    },
    onFrame() {
      const r = this.state.runner;
      r.tick(performance.now());
      const phase = this.profile.phases[r.index];
      if (this.$("[data-phase]"))
        this.$("[data-phase]").textContent =
          r.index < r.count ? r.label : "Contrast complete";
      if (this.$("[data-remain]"))
        this.$("[data-remain]").textContent =
          r.index < r.count ? `${Math.ceil(r.remaining)}s` : "✓";
      if (phase && this.$("[data-bar]")) {
        const pct = clamp(((phase.sec - r.remaining) / phase.sec) * 100, 0, 100);
        this.$("[data-bar]").style.width = `${pct}%`;
      }
    },
    onStop() {
      const r = this.state.runner;
      return {
        patches: { rounds: Math.min(r.count, r.index + 1), phaseCount: r.index },
        summary: "Contrast phases done"
      };
    }
  });

  Modes.recordOnly = baseMode({
    id: "recordOnly",
    render() {
      this.hud.innerHTML = `
        <div class="mode-title">Performance take</div>
        <div class="mode-big" data-t>0:00</div>
        <p class="mode-meta">Recording is the practice. One clean take beats five anxious ones.</p>
      `;
    },
    onFrame() {
      const sec = Math.floor((performance.now() - this.state.startedAt) / 1000);
      if (this.$("[data-t]"))
        this.$("[data-t]").textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    },
    onStop() {
      return { patches: {}, summary: "Take captured" };
    }
  });

  Modes.speechEnergy = baseMode({
    id: "speechEnergy",
    render() {
      const phases = this.profile.phases;
      if (phases) {
        this.state.runner = createPhaseRunner(phases, (i, p) => {
          if (global.VTToast) global.VTToast(p.label);
        });
      }
      this.state.voice = 0;
      this.state.silent = 0;
      this.hud.innerHTML = `
        <div class="mode-title">Speaking vs listening</div>
        <div class="mode-phase" data-phase>${phases?.[0]?.label || "Conversation practice"}</div>
        <div class="listen-bars">
          <div class="listen-speak" data-speak style="width:50%"></div>
        </div>
        <p class="mode-meta">You speaking <strong data-sp>50%</strong> · silence/listen <strong data-si>50%</strong></p>
        <p class="mode-meta muted">For connection drills, lean toward more silence.</p>
      `;
    },
    onFrame(frame) {
      if (frame.voiced || frame.rms > 0.025) this.state.voice++;
      else this.state.silent++;
      const t = this.state.voice + this.state.silent || 1;
      const sp = Math.round((this.state.voice / t) * 100);
      const si = 100 - sp;
      if (this.$("[data-speak]")) this.$("[data-speak]").style.width = `${sp}%`;
      if (this.$("[data-sp]")) this.$("[data-sp]").textContent = `${sp}%`;
      if (this.$("[data-si]")) this.$("[data-si]").textContent = `${si}%`;
      if (this.state.runner) {
        this.state.runner.tick(performance.now());
        if (this.$("[data-phase]") && this.state.runner.index < this.state.runner.count)
          this.$("[data-phase]").textContent = this.state.runner.label;
      }
    },
    onStop() {
      const t = this.state.voice + this.state.silent || 1;
      const listenBias = this.state.silent / t;
      const presence = listenBias >= 0.55 ? 5 : listenBias >= 0.4 ? 4 : 3;
      return { patches: { presence }, summary: `Listen/silence share ~${Math.round(listenBias * 100)}%` };
    }
  });

  Modes.reviewSession = baseMode({
    id: "reviewSession",
    render() {
      this.hud.innerHTML = `
        <div class="mode-title">Record &amp; review take</div>
        <div class="mode-big" data-t>0:00</div>
        <p class="mode-meta mode-warn">Leave <strong>1 full day</strong> before Auditory → Visual → Transcription.</p>
      `;
    },
    onFrame() {
      const sec = Math.floor((performance.now() - this.state.startedAt) / 1000);
      if (this.$("[data-t]"))
        this.$("[data-t]").textContent = `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    },
    onStop() {
      // focus review block
      const rev = document.getElementById("review-block");
      if (rev) {
        rev.hidden = false;
        rev.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
      return { patches: {}, summary: "Take ready — schedule review tomorrow" };
    }
  });

  Modes.weekPlan = baseMode({
    id: "weekPlan",
    render() {
      this.hud.innerHTML = `
        <div class="mode-title">12-week focus</div>
        <p class="mode-meta">Practice lives in the weekly dashboard. Open it to pick an element and check in.</p>
        <button type="button" class="btn btn-primary btn-sm" data-open-plan>Open 12-week plan</button>
      `;
      this.$("[data-open-plan]")?.addEventListener("click", () => {
        document.getElementById("btn-plan")?.click();
      });
    },
    onStart() {
      // soft redirect path — user can still record a check-in if they stay
    },
    onStop() {
      return { patches: {}, summary: "Use plan dashboard for week logic" };
    }
  });

  Modes.pauseDetect = baseMode({
    id: "pauseDetect",
    render() {
      this.state.pauses = 0;
      this.state.inSilence = false;
      this.state.silenceStart = 0;
      this.state.minP = (this.profile.minPauseSec || 0.8) * 1000;
      this.state.timeline = [];
      this.hud.innerHTML = `
        <div class="mode-title">Pause detector</div>
        <div class="mode-big" data-p>0</div>
        <p class="mode-meta">Intentional silences ≥ ${this.profile.minPauseSec || 0.8}s</p>
        <div class="silence-timeline" data-tl></div>
        <p class="mode-meta" data-status>Speak… then pause on purpose.</p>
      `;
    },
    onFrame(frame) {
      const now = performance.now();
      const quiet = !frame.voiced && (frame.rms || 0) < 0.02;
      if (quiet) {
        if (!this.state.inSilence) {
          this.state.inSilence = true;
          this.state.silenceStart = now;
        } else if (now - this.state.silenceStart >= this.state.minP && !this.state.countedThis) {
          this.state.pauses++;
          this.state.countedThis = true;
          this.state.timeline.push(1);
          if (this.$("[data-p]")) this.$("[data-p]").textContent = String(this.state.pauses);
          if (this.$("[data-status]")) this.$("[data-status]").textContent = "Pause counted ✓";
          if (this.$("[data-tl]")) {
            const bit = document.createElement("span");
            bit.className = "tl-pause";
            this.$("[data-tl]").appendChild(bit);
          }
        }
      } else {
        this.state.inSilence = false;
        this.state.countedThis = false;
        if (this.$("[data-status]")) this.$("[data-status]").textContent = "Speaking…";
      }
    },
    onStop() {
      const n = this.state.pauses || 0;
      return {
        patches: {
          pauseCount: n,
          replacement: clamp(1 + Math.floor(n / 2), 1, 5),
          fillerReduction: clamp(1 + Math.floor(n / 2), 1, 5)
        },
        summary: `${n} intentional pauses detected`
      };
    }
  });

  Modes.keyPointPace = baseMode({
    id: "keyPointPace",
    render() {
      this.state.keys = 0;
      this.hud.innerHTML = `
        <div class="mode-title">Pace for impact</div>
        <div class="mode-big" data-k>0 / 3</div>
        <button type="button" class="btn btn-primary btn-sm" data-key>Mark key point (slow down)</button>
        <p class="mode-meta">Tap when you deliberately slow for a key idea.</p>
      `;
      this.$("[data-key]")?.addEventListener("click", () => {
        this.state.keys++;
        if (this.$("[data-k]")) this.$("[data-k]").textContent = `${this.state.keys} / 3`;
      });
    },
    onStop() {
      return {
        patches: { keySlowdowns: this.state.keys, paceCraft: clamp(this.state.keys + 1, 1, 5) },
        summary: `${this.state.keys} key slow-downs marked`
      };
    }
  });

  Modes.gestureReps = baseMode({
    id: "gestureReps",
    render() {
      this.state.reps = { size: 0, count: 0, location: 0 };
      this.hud.innerHTML = `
        <div class="mode-title">Gesture reps</div>
        <div class="controls-row">
          <button type="button" class="btn btn-sm" data-g="size">Size +</button>
          <button type="button" class="btn btn-sm" data-g="count">Count +</button>
          <button type="button" class="btn btn-sm" data-g="location">Location +</button>
        </div>
        <p class="mode-meta">Size <strong data-s>0</strong> · Count <strong data-c>0</strong> · Location <strong data-l>0</strong></p>
        <p class="mode-meta">After stop: review the take muted first.</p>
      `;
      this.hud.querySelectorAll("[data-g]").forEach((b) => {
        b.addEventListener("click", () => {
          const k = b.getAttribute("data-g");
          this.state.reps[k]++;
          if (this.$("[data-s]")) this.$("[data-s]").textContent = this.state.reps.size;
          if (this.$("[data-c]")) this.$("[data-c]").textContent = this.state.reps.count;
          if (this.$("[data-l]")) this.$("[data-l]").textContent = this.state.reps.location;
        });
      });
    },
    onStop() {
      const t = this.state.reps.size + this.state.reps.count + this.state.reps.location;
      return {
        patches: { purposeful: clamp(1 + Math.floor(t / 2), 1, 5) },
        summary: `${t} gesture reps`
      };
    }
  });

  Modes.concisionGate = baseMode({
    id: "concisionGate",
    render() {
      this.state.q = 1;
      this.state.maxQ = this.profile.questions || 5;
      this.state.phase = "receive"; // receive | silence | answer
      this.state.silenceNeed = (this.profile.preSilenceSec || 2.5) * 1000;
      this.state.silenceAcc = 0;
      this.state.gates = 0;
      this.hud.innerHTML = `
        <div class="mode-title">Concision gate</div>
        <div class="mode-phase" data-phase>Q1 · Receive the question</div>
        <div class="mode-big" data-g>Breathe</div>
        <p class="mode-meta">Gates passed: <strong data-ok>0</strong>/${this.state.maxQ}</p>
        <button type="button" class="btn btn-sm" data-next>Next question</button>
      `;
      this.$("[data-next]")?.addEventListener("click", () => {
        if (this.state.q < this.state.maxQ) {
          this.state.q++;
          this.state.phase = "receive";
          this.state.silenceAcc = 0;
          if (this.$("[data-phase]"))
            this.$("[data-phase]").textContent = `Q${this.state.q} · Receive the question`;
          if (this.$("[data-g]")) this.$("[data-g]").textContent = "Breathe";
        }
      });
    },
    onFrame(frame) {
      const quiet = !frame.voiced && (frame.rms || 0) < 0.02;
      if (this.state.phase === "receive" || this.state.phase === "silence") {
        if (quiet) {
          this.state.phase = "silence";
          this.state.silenceAcc += 16;
          const left = Math.max(0, (this.state.silenceNeed - this.state.silenceAcc) / 1000);
          if (this.$("[data-g]"))
            this.$("[data-g]").textContent =
              left > 0 ? `Silence ${left.toFixed(1)}s` : "Answer now";
          if (this.state.silenceAcc >= this.state.silenceNeed && this.state.phase === "silence") {
            this.state.phase = "answer";
            this.state.gates++;
            if (this.$("[data-ok]")) this.$("[data-ok]").textContent = String(this.state.gates);
            if (this.$("[data-g]")) this.$("[data-g]").textContent = "Answer ≤3 sentences";
          }
        } else if (this.state.phase === "silence") {
          this.state.silenceAcc = Math.max(0, this.state.silenceAcc - 40);
        }
      }
    },
    onStop() {
      return {
        patches: {
          questions: this.state.q,
          pauseBefore: clamp(this.state.gates, 1, 5),
          concision: clamp(2 + this.state.gates, 1, 5)
        },
        summary: `${this.state.gates} pre-answer silence gates`
      };
    }
  });

  Modes.storyTimer = baseMode({
    id: "storyTimer",
    render() {
      const phases = this.profile.phases || [];
      this.state.runner = createPhaseRunner(phases);
      this.state.peakMarked = false;
      this.hud.innerHTML = `
        <div class="mode-title">Story arc</div>
        <div class="mode-phase" data-phase>${phases[0]?.label}</div>
        <div class="mode-big" data-remain>—</div>
        <button type="button" class="btn btn-singing btn-sm" data-peak>Mark PEAK now</button>
        <p class="mode-meta" data-peak-st>Peak not marked yet</p>
      `;
      this.$("[data-peak]")?.addEventListener("click", () => {
        this.state.peakMarked = true;
        if (this.$("[data-peak-st]"))
          this.$("[data-peak-st]").textContent = `Peak marked in “${this.state.runner.label}”`;
      });
    },
    onFrame() {
      const r = this.state.runner;
      r.tick(performance.now());
      if (this.$("[data-phase]"))
        this.$("[data-phase]").textContent =
          r.index < r.count ? r.label : "Story complete";
      if (this.$("[data-remain]"))
        this.$("[data-remain]").textContent =
          r.index < r.count ? `${Math.ceil(r.remaining)}s` : "✓";
    },
    onStop() {
      return {
        patches: {
          peakClarity: this.state.peakMarked ? 4 : 2,
          structure: this.state.runner.index >= 2 ? 4 : 3
        },
        summary: this.state.peakMarked ? "Peak marked" : "Consider marking the peak next time"
      };
    }
  });

  Modes.authorityLand = baseMode({
    id: "authorityLand",
    render() {
      this.state.lands = 0;
      this.state.need = (this.profile.landSilenceSec || 1) * 1000;
      this.state.waitingLand = false;
      this.state.silenceAcc = 0;
      this.hud.innerHTML = `
        <div class="mode-title">Authority landings</div>
        <div class="mode-big" data-l>0 / ${this.profile.claims || 5}</div>
        <button type="button" class="btn btn-primary btn-sm" data-claim>I stated a claim — now land</button>
        <p class="mode-meta" data-st>State claim, then hold silence ~1s</p>
      `;
      this.$("[data-claim]")?.addEventListener("click", () => {
        this.state.waitingLand = true;
        this.state.silenceAcc = 0;
        if (this.$("[data-st]")) this.$("[data-st]").textContent = "Hold silence to land…";
      });
    },
    onFrame(frame) {
      if (!this.state.waitingLand) return;
      const quiet = !frame.voiced && (frame.rms || 0) < 0.02;
      if (quiet) {
        this.state.silenceAcc += 16;
        if (this.state.silenceAcc >= this.state.need) {
          this.state.lands++;
          this.state.waitingLand = false;
          if (this.$("[data-l]"))
            this.$("[data-l]").textContent = `${this.state.lands} / ${this.profile.claims || 5}`;
          if (this.$("[data-st]")) this.$("[data-st]").textContent = "Landed ✓";
        }
      } else this.state.silenceAcc = 0;
    },
    onStop() {
      return {
        patches: {
          landed: this.state.lands,
          authority: clamp(1 + this.state.lands, 1, 5),
          noTag: 4
        },
        summary: `${this.state.lands} clean landings`
      };
    }
  });

  Modes.pitchContour = baseMode({
    id: "pitchContour",
    render() {
      this.state.minM = 999;
      this.state.maxM = 0;
      this.hud.innerHTML = `
        <div class="mode-title">Melodic range (speech)</div>
        <div class="mode-big" data-r>— st</div>
        <p class="mode-meta">Min–max pitch span while you speak. Variety without note drills.</p>
        <p class="mode-meta" data-d>Start speaking with color…</p>
      `;
    },
    onFrame(frame) {
      if (frame.voiceFreq && global.VTPitchUtils) {
        const m = global.VTPitchUtils.freqToMidi(frame.voiceFreq);
        this.state.minM = Math.min(this.state.minM, m);
        this.state.maxM = Math.max(this.state.maxM, m);
        const span = this.state.maxM - this.state.minM;
        if (this.$("[data-r]")) this.$("[data-r]").textContent = `${span.toFixed(1)} st`;
        if (this.$("[data-d]"))
          this.$("[data-d]").textContent =
            span < 2 ? "Still flat — paint more highs/lows on meaning." : "Nice contour range.";
      }
    },
    onStop() {
      const span = Math.max(0, this.state.maxM - this.state.minM);
      return {
        patches: { variety: span >= 5 ? 5 : span >= 3 ? 4 : span >= 1.5 ? 3 : 2 },
        summary: `Pitch span ~${span.toFixed(1)} semitones`
      };
    }
  });

  // ——— SINGING ———

  Modes.pitchHold = baseMode({
    id: "pitchHold",
    render() {
      this.hud.innerHTML = `
        <div class="mode-title">Sustain &amp; hold</div>
        <div class="mode-big" data-h>0.0s</div>
        <p class="mode-meta">Best: <strong data-best>0s</strong> · Holds logged: <strong data-n>0</strong></p>
        <p class="mode-meta">Auto-logs when you sustain ≥2s then release. Not a note-challenge game.</p>
      `;
    },
    onFrame(frame) {
      if (this.$("[data-h]")) this.$("[data-h]").textContent = `${(frame.holdSec || 0).toFixed(1)}s`;
      if (this.$("[data-n]")) this.$("[data-n]").textContent = String((frame.holds || []).length);
      const best = (frame.holds || []).reduce((m, h) => Math.max(m, h.seconds), 0);
      this.state.best = Math.max(this.state.best || 0, best, frame.holdSec >= 2 ? frame.holdSec : 0);
      if (this.$("[data-best]")) this.$("[data-best]").textContent = `${(this.state.best || 0).toFixed(1)}s`;
    },
    onStop() {
      const best = Math.round((this.state.best || 0) * 10) / 10;
      return {
        patches: {
          maxHold: best,
          holdCount: 1,
          targets: Math.max(1, Math.floor(best / 2))
        },
        summary: `Best hold ${best}s`
      };
    }
  });

  Modes.pitchChord = baseMode({
    id: "pitchChord",
    render() {
      this.state.reps = 0;
      this.hud.innerHTML = `
        <div class="mode-title">Chord / solfège track</div>
        <div class="mode-big" data-r>0</div>
        <p class="mode-meta">Reps (tap when you finish a progression loop)</p>
        <button type="button" class="btn btn-sm btn-singing" data-rep>+1 rep</button>
        <p class="mode-meta">Pitch follows the piano chord. Challenge game is off.</p>
      `;
      this.$("[data-rep]")?.addEventListener("click", () => {
        this.state.reps++;
        if (this.$("[data-r]")) this.$("[data-r]").textContent = String(this.state.reps);
      });
    },
    onStop() {
      return {
        patches: { reps: this.state.reps, progressions: this.state.reps },
        summary: `${this.state.reps} reps`
      };
    }
  });

  Modes.pitchSong = baseMode({
    id: "pitchSong",
    render() {
      this.state.feel = 0;
      this.state.better = 0;
      this.hud.innerHTML = `
        <div class="mode-title">Song stanza reps</div>
        <div class="controls-row">
          <button type="button" class="btn btn-sm" data-feel>Feel +1</button>
          <button type="button" class="btn btn-sm" data-better>Better Man +1</button>
        </div>
        <p class="mode-meta">Feel <strong data-f>0</strong>/5 · Better Man <strong data-b>0</strong>/5</p>
      `;
      this.$("[data-feel]")?.addEventListener("click", () => {
        this.state.feel++;
        if (this.$("[data-f]")) this.$("[data-f]").textContent = this.state.feel;
      });
      this.$("[data-better]")?.addEventListener("click", () => {
        this.state.better++;
        if (this.$("[data-b]")) this.$("[data-b]").textContent = this.state.better;
      });
    },
    onStop() {
      return {
        patches: { repsFeel: this.state.feel, repsBetter: this.state.better },
        summary: `Feel ${this.state.feel} · Better Man ${this.state.better}`
      };
    }
  });

  Modes.pitchMatch = baseMode({
    id: "pitchMatch",
    render() {
      this.hud.innerHTML = `
        <div class="mode-title">Pitch match game</div>
        <p class="mode-meta">Full highway + score + lock 8 notes. Stay in the green lane.</p>
        <p class="mode-meta" data-s>Score updates in the pitch HUD above.</p>
      `;
    },
    onStop() {
      const g = global.VTAppPitchGameSnap || null;
      if (!g) return { patches: {}, summary: "Pitch match session" };
      return {
        patches: {
          matches: g.challengeCleared || 0,
          accuracy: g.accuracyPct >= 80 ? 5 : g.accuracyPct >= 60 ? 4 : 3,
          precision: g.maxCombo >= 30 ? 5 : 3
        },
        summary: `Score ${g.score} · ${g.accuracyPct}% in-lane`
      };
    }
  });

  Modes.sovtFlow = baseMode({
    id: "sovtFlow",
    render() {
      this.state.samples = [];
      this.hud.innerHTML = `
        <div class="mode-title">SOVT · steady air</div>
        <div class="mode-bar thick"><span data-bar style="width:0%"></span></div>
        <p class="mode-meta">Evenness: <strong data-ev>—</strong> (lower variance = steadier air)</p>
        <p class="mode-meta">No pitch scoring — flow and ease first.</p>
      `;
    },
    onFrame(frame) {
      const rms = frame.rms || 0;
      if (rms > 0.01) {
        this.state.samples.push(rms);
        if (this.state.samples.length > 120) this.state.samples.shift();
      }
      const arr = this.state.samples;
      if (arr.length > 10) {
        const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
        const v = arr.reduce((a, b) => a + (b - mean) ** 2, 0) / arr.length;
        const steady = clamp(1 - Math.sqrt(v) * 8, 0, 1);
        if (this.$("[data-bar]")) this.$("[data-bar]").style.width = `${steady * 100}%`;
        if (this.$("[data-ev]"))
          this.$("[data-ev]").textContent = steady > 0.7 ? "steady" : steady > 0.4 ? "ok" : "uneven";
        this.state.steadyScore = steady;
      }
    },
    onStop() {
      const s = this.state.steadyScore || 0.4;
      const scale = s > 0.75 ? 5 : s > 0.55 ? 4 : 3;
      return {
        patches: { ease: scale, steadiness: scale, steadyAir: scale },
        summary: "SOVT flow session"
      };
    }
  });

  Modes.sirenRange = baseMode({
    id: "sirenRange",
    render() {
      this.state.minM = 999;
      this.state.maxM = 0;
      this.state.sirens = 0;
      this.state.voicedLong = 0;
      this.hud.innerHTML = `
        <div class="mode-title">Siren range rope</div>
        <div class="mode-big" data-r>— st</div>
        <p class="mode-meta">Sirens counted: <strong data-s>0</strong> (long glides ≥1.5s)</p>
        <p class="mode-meta">Not a single-note lock game — ride the rope smooth.</p>
      `;
    },
    onFrame(frame) {
      if (frame.voiceFreq && global.VTPitchUtils) {
        const m = global.VTPitchUtils.freqToMidi(frame.voiceFreq);
        this.state.minM = Math.min(this.state.minM, m);
        this.state.maxM = Math.max(this.state.maxM, m);
        const span = this.state.maxM - this.state.minM;
        if (this.$("[data-r]")) this.$("[data-r]").textContent = `${span.toFixed(1)} st`;
      }
      if (frame.voiced) {
        this.state.voicedLong += 16;
        if (this.state.voicedLong >= 1500 && !this.state.counted) {
          this.state.sirens++;
          this.state.counted = true;
          if (this.$("[data-s]")) this.$("[data-s]").textContent = String(this.state.sirens);
        }
      } else {
        this.state.voicedLong = 0;
        this.state.counted = false;
      }
    },
    onStop() {
      const span = Math.max(0, this.state.maxM - this.state.minM);
      return {
        patches: {
          sirens: this.state.sirens,
          smoothness: span >= 4 ? 4 : 3
        },
        summary: `${this.state.sirens} sirens · ${span.toFixed(1)} st range`
      };
    }
  });

  Modes.breathS = baseMode({
    id: "breathS",
    render() {
      this.state.phase = "S"; // S | A
      this.state.bestS = 0;
      this.state.bestA = 0;
      this.state.cur = 0;
      this.hud.innerHTML = `
        <div class="mode-title">Breath support · S then /A/</div>
        <div class="mode-phase" data-phase>Phase 1 · even S (unvoiced)</div>
        <div class="mode-big" data-h>0.0s</div>
        <p class="mode-meta">Best S <strong data-s>0</strong>s · Best /A/ <strong data-a>0</strong>s</p>
        <button type="button" class="btn btn-sm" data-sw>Switch to /A/ phase</button>
      `;
      this.$("[data-sw]")?.addEventListener("click", () => {
        this.state.phase = this.state.phase === "S" ? "A" : "S";
        if (this.$("[data-phase]"))
          this.$("[data-phase]").textContent =
            this.state.phase === "S" ? "Phase 1 · even S (unvoiced)" : "Phase 2 · /A/ with same support";
      });
    },
    onFrame(frame) {
      // S phase: unvoiced but air (rms without solid pitch)
      const air =
        this.state.phase === "S"
          ? (frame.rms || 0) > 0.02 && !frame.voiceFreq
          : frame.voiced || (frame.rms || 0) > 0.025;
      if (air) {
        this.state.cur += 0.016;
        if (this.state.phase === "S") this.state.bestS = Math.max(this.state.bestS, this.state.cur);
        else this.state.bestA = Math.max(this.state.bestA, this.state.cur);
      } else this.state.cur = 0;
      if (this.$("[data-h]")) this.$("[data-h]").textContent = `${this.state.cur.toFixed(1)}s`;
      if (this.$("[data-s]")) this.$("[data-s]").textContent = this.state.bestS.toFixed(1);
      if (this.$("[data-a]")) this.$("[data-a]").textContent = this.state.bestA.toFixed(1);
    },
    onStop() {
      return {
        patches: {
          maxS: Math.round(this.state.bestS),
          maxHold: Math.round(this.state.bestA),
          transferA: this.state.bestA > 3 ? 4 : 3
        },
        summary: `S ${this.state.bestS.toFixed(1)}s · A ${this.state.bestA.toFixed(1)}s`
      };
    }
  });

  Modes.scaleSteps = baseMode({
    id: "scaleSteps",
    render() {
      this.state.pattern = [0, 2, 4, 5, 7, 5, 4, 2, 0]; // semitone steps from root
      this.state.i = 0;
      this.state.roots = 0;
      this.hud.innerHTML = `
        <div class="mode-title">Five-note scale steps</div>
        <div class="mode-big" data-step>Step 1 / 9</div>
        <button type="button" class="btn btn-sm btn-singing" data-next>Next step (locked)</button>
        <p class="mode-meta">Roots completed: <strong data-r>0</strong></p>
      `;
      this.$("[data-next]")?.addEventListener("click", () => {
        this.state.i++;
        if (this.state.i >= this.state.pattern.length) {
          this.state.i = 0;
          this.state.roots++;
          if (this.$("[data-r]")) this.$("[data-r]").textContent = String(this.state.roots);
        }
        if (this.$("[data-step]"))
          this.$("[data-step]").textContent = `Step ${this.state.i + 1} / ${this.state.pattern.length}`;
      });
    },
    onStop() {
      return { patches: { roots: Math.max(1, this.state.roots) }, summary: `${this.state.roots} roots` };
    }
  });

  Modes.dynamicSwell = baseMode({
    id: "dynamicSwell",
    render() {
      this.state.swells = 0;
      this.state.phase = 0; // 0 soft 1 med 2 soft
      this.state.phaseT = performance.now();
      this.state.centsVar = [];
      this.hud.innerHTML = `
        <div class="mode-title">Dynamic swell</div>
        <div class="mode-phase" data-phase>Soft</div>
        <div class="volume-lane"><div class="volume-band"></div><div class="volume-needle" data-n style="left:20%"></div></div>
        <p class="mode-meta">Swells: <strong data-s>0</strong> · Keep pitch steady while level moves</p>
      `;
    },
    onFrame(frame) {
      const elapsed = performance.now() - this.state.phaseT;
      if (elapsed > 2500) {
        this.state.phase = (this.state.phase + 1) % 3;
        this.state.phaseT = performance.now();
        if (this.state.phase === 0) this.state.swells++;
        if (this.$("[data-phase]"))
          this.$("[data-phase]").textContent = ["Soft", "Medium", "Soft"][this.state.phase];
        if (this.$("[data-s]")) this.$("[data-s]").textContent = String(this.state.swells);
      }
      const rms = frame.rms || 0;
      if (this.$("[data-n]")) this.$("[data-n]").style.left = `${clamp(rms * 160, 2, 98)}%`;
    },
    onStop() {
      return {
        patches: {
          swells: Math.max(1, this.state.swells),
          pitchStable: 3,
          dynamicControl: clamp(2 + this.state.swells, 1, 5)
        },
        summary: `${this.state.swells} swells`
      };
    }
  });

  Modes.onsetReps = baseMode({
    id: "onsetReps",
    render() {
      this.state.easy = 0;
      this.state.hard = 0;
      this.state.wasQuiet = true;
      this.hud.innerHTML = `
        <div class="mode-title">Easy onset reps</div>
        <div class="mode-big" data-e>0 / ${this.profile.targetReps || 10}</div>
        <p class="mode-meta">Hard attacks flagged: <strong data-h>0</strong></p>
        <p class="mode-meta">Start from silence; spikey onsets count as hard.</p>
      `;
    },
    onFrame(frame) {
      const quiet = (frame.rms || 0) < 0.015;
      if (quiet) {
        this.state.wasQuiet = true;
        return;
      }
      if (this.state.wasQuiet && (frame.rms || 0) > 0.02) {
        this.state.wasQuiet = false;
        // hard if sudden high rms without gradual
        if ((frame.rms || 0) > 0.12) {
          this.state.hard++;
          if (this.$("[data-h]")) this.$("[data-h]").textContent = String(this.state.hard);
        } else {
          this.state.easy++;
          if (this.$("[data-e]"))
            this.$("[data-e]").textContent = `${this.state.easy} / ${this.profile.targetReps || 10}`;
        }
      }
    },
    onStop() {
      return {
        patches: {
          easyOnsets: this.state.easy,
          balance: this.state.easy >= 8 && this.state.hard <= 2 ? 5 : 3
        },
        summary: `${this.state.easy} easy / ${this.state.hard} hard onsets`
      };
    }
  });

  // API
  const Registry = {
    get(modeId) {
      const M = Modes[modeId] || Modes.recordOnly;
      // fresh instance
      return Object.assign(Object.create(Object.getPrototypeOf(M)), M, {
        state: {},
        hud: null,
        profile: null
      });
    },
    ids() {
      return Object.keys(Modes);
    }
  };

  global.VTPracticeModes = Registry;
})(window);
