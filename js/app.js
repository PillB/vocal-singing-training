/**
 * Vocal & Singing Training — app shell
 */
(function () {
  "use strict";

  const state = {
    tab: "vocal",
    tierFilter: "all", // all | basic | advanced
    view: "home", // home | exercise | history | plan
    exercise: null,
    structured: false,
    timer: {
      remaining: 0,
      total: 0,
      running: false,
      handle: null,
      startedAt: null,
      pausedAccum: 0
    },
    recorder: new VTRecorder(),
    selectedProg: "prog1",
    holdSeconds: 0,
    holdTimer: null,
    holdRunning: false,
    reviewChecks: { auditory: false, visual: false, transcription: false },
    pitchViz: null,
    pitchRunning: false
  };

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove("show"), 2800);
  }

  function findExercise(id) {
    const all = [...VT_EXERCISES.vocal, ...VT_EXERCISES.singing];
    return all.find((e) => e.id === id) || null;
  }

  function progressFor(id) {
    return VTStorage.getProgress()[id] || null;
  }

  function formatTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function setView(name) {
    state.view = name;
    $$(".view").forEach((v) => v.classList.remove("active"));
    const map = {
      home: "#view-home",
      exercise: "#view-exercise",
      history: "#view-history",
      plan: "#view-plan"
    };
    const target = $(map[name]);
    if (target) target.classList.add("active");
    updateSessionBanner();
  }

  function setTab(tab) {
    state.tab = tab;
    $$(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
    const settings = VTStorage.getSettings();
    settings.lastTab = tab;
    VTStorage.setSettings(settings);
    renderExerciseList();
    setView("home");
  }

  function updateSessionBanner() {
    const banner = $("#session-banner");
    const s = VTSession.get();
    if (!s || s.status === "completed") {
      banner.classList.remove("visible");
      return;
    }
    banner.classList.add("visible");
    const trackLabel = s.track === "vocal" ? "Vocal" : "Singing";
    const status = s.status === "paused" ? "Paused" : "Active";
    $("#session-banner-text").textContent = `${trackLabel} structured session · ${status} · ${VTSession.progressLabel()}`;
    $("#btn-session-resume").hidden = s.status !== "paused";
    $("#btn-session-pause").hidden = s.status !== "active";
  }

  function filteredExercises() {
    const all = VT_EXERCISES[state.tab] || [];
    if (state.tierFilter === "all") return all;
    return all.filter((ex) => (ex.tier || "basic") === state.tierFilter);
  }

  function renderExerciseList() {
    const list = $("#exercise-list");
    const exercises = filteredExercises();
    list.innerHTML = "";
    list.className = `grid track-${state.tab}`;

    $$(".tier-chip").forEach((c) =>
      c.classList.toggle("selected", c.dataset.tier === state.tierFilter)
    );

    const basicCount = (VT_EXERCISES[state.tab] || []).filter((e) => (e.tier || "basic") === "basic")
      .length;
    const advCount = (VT_EXERCISES[state.tab] || []).filter((e) => e.tier === "advanced").length;
    const countEl = $("#tier-counts");
    if (countEl) {
      countEl.textContent = `${basicCount} basic · ${advCount} advanced · showing ${exercises.length}`;
    }

    exercises.forEach((ex) => {
      const prog = progressFor(ex.id);
      const tier = ex.tier || "basic";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "card card-ex";
      btn.innerHTML = `
        <div class="card-ex-top">
          <span class="num">${ex.number}</span>
          <span class="badge tier-${tier}">${tier}</span>
        </div>
        <h3>${ex.title}</h3>
        <p class="meta">~${ex.durationMin} min · ${ex.audio.piano ? "Piano · " : ""}${ex.audio.pitchViz ? "Pitch viz · " : ""}${ex.audio.record ? "Record" : "Practice"}</p>
        <span class="badge ${prog && prog.completedCount ? "done" : ""}">
          ${prog && prog.completedCount ? `✓ ${prog.completedCount} session${prog.completedCount > 1 ? "s" : ""}` : "Not yet practiced"}
        </span>
      `;
      btn.addEventListener("click", () => openExercise(ex.id, false));
      list.appendChild(btn);
    });

    $("#home-track-title").textContent =
      state.tab === "vocal" ? "Vocal Training" : "Singing Training";
    $("#home-track-sub").textContent =
      state.tab === "vocal"
        ? "Basic: Vinh Giang homework spine. Advanced: pause, fillers, tonality, gestures, storytelling, concision & more."
        : "Basic: Live Music School spine. Advanced: SOVT, sirens, pitch match, scales, dynamics & complementary technique.";
  }

  function openExercise(id, fromStructured) {
    const ex = findExercise(id);
    if (!ex) return;
    state.exercise = ex;
    state.structured = !!fromStructured;
    state.reviewChecks = { auditory: false, visual: false, transcription: false };
    stopTimer(false);
    stopHold();
    stopPitchViz();
    state.recorder.clear();
    VTPiano.stopAll();
    renderExercise();
    setView("exercise");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function renderExercise() {
    const ex = state.exercise;
    if (!ex) return;

    $("#ex-title").textContent = `${ex.number}. ${ex.title}`;
    const tier = ex.tier || "basic";
    $("#ex-track-badge").textContent = `${ex.track === "vocal" ? "Vocal" : "Singing"} · ${tier}`;
    $("#ex-track-badge").style.borderColor = ex.track === "vocal" ? "var(--vocal)" : "var(--singing)";
    $("#ex-original").textContent = ex.original;
    const researchEl = $("#ex-research");
    if (researchEl) {
      researchEl.textContent = ex.research || "";
      researchEl.hidden = !ex.research;
    }
    $("#ex-steps").innerHTML = ex.steps.map((s) => `<li>${s}</li>`).join("");
    $("#ex-tips").innerHTML = ex.tips.map((t) => `<li>${t}</li>`).join("");
    $("#ex-mistakes").innerHTML = ex.mistakes.map((m) => `<li>${m}</li>`).join("");

    // Timer
    const timerSec = ex.timerDefaultSec || 0;
    state.timer.total = timerSec;
    state.timer.remaining = timerSec;
    $("#timer-block").hidden = !ex.audio.timer || !timerSec;
    $("#timer-display").textContent = formatTime(timerSec);

    // Recording
    $("#record-block").hidden = !ex.audio.record;
    $("#playback-area").innerHTML = "";
    $("#level-fill").style.width = "0%";
    $("#btn-rec-start").disabled = false;
    $("#btn-rec-stop").disabled = true;

    // Piano
    const pianoBlock = $("#piano-block");
    pianoBlock.hidden = !ex.audio.piano;
    if (ex.audio.piano) {
      renderPianoControls(ex);
    }

    // Pitch visualizer
    const pitchBlock = $("#pitch-block");
    pitchBlock.hidden = !ex.audio.pitchViz;
    if (ex.audio.pitchViz) {
      ensurePitchViz();
      if (ex.audio.refPitch && window.VT_NOTE_FREQ) {
        state.pitchViz.setTargetNoteName(ex.audio.refPitch, VT_NOTE_FREQ);
      }
      updatePitchStatsLabel({
        targetName: ex.audio.refPitch || "C3",
        voiceName: "—",
        accuracyCents: 0,
        precisionCents: 0
      });
    }

    // Hold logger
    $("#hold-block").hidden = !ex.holdLogger;
    $("#hold-display").textContent = "0.0s";
    renderHoldHistory();

    // Review workflow
    const reviewBlock = $("#review-block");
    reviewBlock.hidden = !ex.audio.reviewWorkflow;
    if (ex.reviewSteps) {
      reviewBlock.innerHTML = `
        <h3>3-step review (wait 1 full day after recording)</h3>
        <p class="muted">Mark each step as you complete it. Be kind — note 3 strengths and 3 growth points first.</p>
        ${ex.reviewSteps
          .map(
            (step) => `
          <div class="review-step">
            <h4>${step.title}</h4>
            <ul>${step.prompts.map((p) => `<li>${p}</li>`).join("")}</ul>
            <label style="display:flex;gap:0.4rem;align-items:center;margin-top:0.55rem;font-size:0.9rem;">
              <input type="checkbox" data-review="${step.id}" /> Step complete
            </label>
          </div>`
          )
          .join("")}
      `;
      $$("[data-review]", reviewBlock).forEach((cb) => {
        cb.addEventListener("change", () => {
          state.reviewChecks[cb.dataset.review] = cb.checked;
          if (cb.dataset.review === "transcription" || true) {
            const stepsDone = Object.values(state.reviewChecks).filter(Boolean).length;
            const input = $('#metrics-form [name="stepsDone"]');
            if (input) input.value = stepsDone;
          }
        });
      });
    }

    // Week plan deep link
    if (ex.isWeekPlan) {
      $("#week-plan-cta").hidden = false;
    } else {
      $("#week-plan-cta").hidden = true;
    }

    // Metrics form
    renderMetricsForm(ex);

    // Structured nav
    $("#structured-nav").hidden = !state.structured;
    if (state.structured) {
      $("#structured-progress").textContent = VTSession.progressLabel();
    }

    $("#score-result").hidden = true;
  }

  function renderPianoControls(ex) {
    const progWrap = $("#prog-buttons");
    progWrap.innerHTML = "";
    const progs = VTPiano.getProgressions();

    let keys = [];
    if (ex.progressions) keys = ex.progressions;
    else if (ex.songs) keys = [...new Set(ex.songs.map((s) => s.prog).concat(["prog1", "prog2", "prog3"]))];
    else if (ex.audio.refPitch) keys = [];
    else keys = ["prog1", "prog2", "prog3", "prog4", "prog5"];

    keys.forEach((id) => {
      const p = progs[id];
      if (!p) return;
      const b = document.createElement("button");
      b.type = "button";
      b.className = "prog-btn" + (state.selectedProg === id ? " active" : "");
      b.textContent = p.name;
      b.title = p.description;
      b.addEventListener("click", () => {
        state.selectedProg = id;
        $$(".prog-btn", progWrap).forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        $("#chord-desc").textContent = p.description;
      });
      progWrap.appendChild(b);
    });

    if (keys[0]) {
      state.selectedProg = keys.includes(state.selectedProg) ? state.selectedProg : keys[0];
      $("#chord-desc").textContent = progs[state.selectedProg]?.description || "";
    }

    $("#ref-pitch-row").hidden = !ex.audio.refPitch;
    $("#songs-row").hidden = !ex.songs;
    if (ex.songs) {
      $("#songs-row").innerHTML = ex.songs
        .map(
          (s) => `
        <div class="card" style="padding:0.75rem;">
          <strong>${s.title}</strong>
          <p class="muted" style="margin:0.25rem 0 0.5rem;font-size:0.85rem;">${s.keyHint} · Use stanzas you know. Practice with piano, not full copyrighted tracks.</p>
          <button type="button" class="btn btn-sm btn-singing" data-song-prog="${s.prog}">Play song progression</button>
        </div>`
        )
        .join("");
      $$("[data-song-prog]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          state.selectedProg = btn.dataset.songProg;
          await playSelectedProgression(true);
        });
      });
    }
  }

  function pianoOptions() {
    const sustain = $("#chk-sustain")?.checked;
    const sustainSec = Number($("#sustain-sec")?.value || 4);
    return {
      arpeggio: $("#chk-arpeggio")?.checked,
      sustain: !!sustain,
      sustainSec: sustain ? sustainSec : 2.2,
      chordSec: sustain ? sustainSec : 2.2
    };
  }

  async function playSelectedProgression(loop) {
    try {
      const opts = pianoOptions();
      VTPiano.onChordChange = (ch) => {
        $("#chord-now").textContent = ch.name;
        if (state.pitchViz && state.exercise?.audio?.pitchViz) {
          state.pitchViz.setTargetFromChord(ch);
        }
      };
      const prog = await VTPiano.playProgression(state.selectedProg, {
        loop: !!loop,
        chordSec: opts.chordSec,
        arpeggio: opts.arpeggio,
        sustain: opts.sustain,
        sustainSec: opts.sustainSec
      });
      if (prog) {
        $("#chord-desc").textContent =
          prog.description +
          (opts.sustain ? ` · sustain ${opts.sustainSec}s per chord` : "");
        toast(
          loop
            ? opts.sustain
              ? `Looping with ${opts.sustainSec}s sustain…`
              : "Looping progression…"
            : opts.sustain
              ? `Playing with ${opts.sustainSec}s sustain`
              : "Playing progression once"
        );
      }
    } catch (e) {
      toast("Could not start audio — interact with the page and try again.");
      console.error(e);
    }
  }

  function ensurePitchViz() {
    const canvas = $("#pitch-canvas");
    if (!canvas) return null;
    if (!state.pitchViz) {
      state.pitchViz = new VTPitchVisualizer(canvas);
      state.pitchViz.onStats = updatePitchStatsLabel;
      state.pitchViz._drawIdle();
    }
    return state.pitchViz;
  }

  function updatePitchStatsLabel(stats) {
    const el = $("#pitch-stats");
    if (!el || !stats) return;
    const acc = stats.accuracyCents != null ? Math.round(stats.accuracyCents) : 0;
    const prec = stats.precisionCents != null ? Math.round(stats.precisionCents) : 0;
    const accWord =
      Math.abs(acc) <= 25 ? "on target" : acc > 0 ? "a bit sharp" : "a bit flat";
    const precWord = prec <= 30 ? "stable (precise)" : prec <= 60 ? "settling" : "variable";
    el.innerHTML = `
      <span><strong>Target</strong> ${stats.targetName || "—"}</span>
      <span><strong>You</strong> ${stats.voiceName || "—"}</span>
      <span><strong>Accuracy</strong> ${acc > 0 ? "+" : ""}${acc}¢ · ${accWord}</span>
      <span><strong>Precision</strong> ±${prec}¢ · ${precWord}</span>
    `;
    // Auto-fill metrics if present
    const accInput = $('#metrics-form [name="accuracy"]');
    const precInput = $('#metrics-form [name="precision"]');
    if (accInput && !accInput.dataset.touched) {
      const score = Math.abs(acc) <= 20 ? 5 : Math.abs(acc) <= 40 ? 4 : Math.abs(acc) <= 70 ? 3 : 2;
      // don't force range inputs constantly - only when stopping
    }
    if (precInput && !precInput.dataset.touched) {
      /* filled on stop */
    }
  }

  async function startPitchViz() {
    try {
      const viz = ensurePitchViz();
      if (!viz) return;
      await viz.start();
      state.pitchRunning = true;
      $("#btn-pitch-start").disabled = true;
      $("#btn-pitch-stop").disabled = false;
      toast("Pitch visualizer listening — sing toward the amber target");
    } catch (e) {
      console.error(e);
      toast("Microphone needed for pitch visualizer");
    }
  }

  function stopPitchViz() {
    if (state.pitchViz && state.pitchRunning) {
      const snap = state.pitchViz.getSnapshotMetrics();
      const accInput = $('#metrics-form [name="accuracy"]');
      const precInput = $('#metrics-form [name="precision"]');
      if (accInput && accInput.type === "range") {
        const a = Math.abs(snap.accuracyCents || 0);
        accInput.value = a <= 20 ? 5 : a <= 40 ? 4 : a <= 70 ? 3 : a <= 100 ? 2 : 1;
        accInput.dispatchEvent(new Event("input"));
      }
      if (precInput && precInput.type === "range") {
        const p = snap.precisionCents || 50;
        precInput.value = p <= 25 ? 5 : p <= 45 ? 4 : p <= 70 ? 3 : p <= 100 ? 2 : 1;
        precInput.dispatchEvent(new Event("input"));
      }
    }
    if (state.pitchViz) state.pitchViz.stop();
    state.pitchRunning = false;
    const startBtn = $("#btn-pitch-start");
    const stopBtn = $("#btn-pitch-stop");
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
  }

  function renderMetricsForm(ex) {
    const form = $("#metrics-form");
    form.innerHTML = "";
    (ex.metrics || []).forEach((m) => {
      const field = document.createElement("div");
      field.className = "field";
      if (m.type === "scale") {
        field.innerHTML = `
          <label for="m-${m.id}">${m.label} (1–${m.max || 5})</label>
          <input type="range" id="m-${m.id}" name="${m.id}" min="${m.min || 1}" max="${m.max || 5}" value="3" />
          <span class="muted scale-val" data-for="${m.id}">3</span>
        `;
      } else {
        field.innerHTML = `
          <label for="m-${m.id}">${m.label}${m.unit ? ` (${m.unit})` : ""}${m.target != null ? ` · target ${m.target}` : ""}</label>
          <input type="number" id="m-${m.id}" name="${m.id}" min="0" step="1" placeholder="0" />
        `;
      }
      form.appendChild(field);
    });

    const notes = document.createElement("div");
    notes.className = "field";
    notes.innerHTML = `
      <label for="m-notes">Session notes</label>
      <textarea id="m-notes" name="notes" placeholder="What felt good? What will you try next time?"></textarea>
    `;
    form.appendChild(notes);

    $$('input[type="range"]', form).forEach((r) => {
      const span = $(`.scale-val[data-for="${r.name}"]`, form);
      r.addEventListener("input", () => {
        if (span) span.textContent = r.value;
      });
    });
  }

  function collectMetrics() {
    const values = {};
    $$("#metrics-form [name]").forEach((el) => {
      if (el.name === "notes") return;
      values[el.name] = el.value;
    });
    const notes = $("#m-notes")?.value || "";
    return { values, notes };
  }

  function completeExercise() {
    const ex = state.exercise;
    if (!ex) return;
    if (state.pitchRunning) stopPitchViz();
    const { values, notes } = collectMetrics();
    if (ex.audio.reviewWorkflow) {
      values.stepsDone = Object.values(state.reviewChecks).filter(Boolean).length;
    }
    const result = VTMetrics.compute(ex.metrics, values);
    const elapsed =
      state.timer.total > 0 ? state.timer.total - state.timer.remaining : 0;

    VTStorage.saveExerciseResult(ex.id, {
      metrics: values,
      score: result.score,
      notes,
      durationSec: elapsed
    });

    const box = $("#score-result");
    box.hidden = false;
    box.innerHTML = `
      <div class="score-big">${VTMetrics.formatScore(result)}</div>
      <p>${result.summary}</p>
      <p class="muted" style="font-size:0.85rem;">${result.how}</p>
      <ul class="breakdown">
        ${result.breakdown
          .map(
            (b) =>
              `<li><span>${b.label}<br><small class="muted">${b.detail}</small></span><strong>${b.points}/${b.max}</strong></li>`
          )
          .join("")}
      </ul>
      <div class="encourage">You practiced with intention. Save that feeling — consistency beats intensity.</div>
    `;

    toast("Session saved to progress");

    if (state.structured) {
      VTSession.markCurrentComplete();
      updateSessionBanner();
    }
  }

  /* —— Timer —— */
  function startTimer() {
    if (state.timer.running) return;
    if (state.timer.remaining <= 0) state.timer.remaining = state.timer.total;
    state.timer.running = true;
    state.timer.startedAt = performance.now();
    tickTimer();
    state.timer.handle = setInterval(tickTimer, 200);
  }

  function tickTimer() {
    if (!state.timer.running) return;
    // countdown
    state.timer.remaining = Math.max(0, state.timer.remaining - 0.2);
    $("#timer-display").textContent = formatTime(state.timer.remaining);
    if (state.timer.remaining <= 0) {
      stopTimer(true);
      toast("Timer complete — nice work");
    }
  }

  function pauseTimer() {
    state.timer.running = false;
    if (state.timer.handle) clearInterval(state.timer.handle);
    state.timer.handle = null;
  }

  function stopTimer(keepDisplay) {
    pauseTimer();
    if (!keepDisplay && state.exercise) {
      state.timer.remaining = state.timer.total;
      $("#timer-display").textContent = formatTime(state.timer.remaining);
    }
  }

  function resetTimer() {
    stopTimer(false);
  }

  /* —— Hold logger —— */
  function startHold() {
    if (state.holdRunning) return;
    state.holdRunning = true;
    state.holdSeconds = 0;
    const t0 = performance.now();
    state.holdTimer = setInterval(() => {
      state.holdSeconds = (performance.now() - t0) / 1000;
      $("#hold-display").textContent = state.holdSeconds.toFixed(1) + "s";
    }, 50);
  }

  function stopHold() {
    if (!state.holdRunning) {
      if (state.holdTimer) clearInterval(state.holdTimer);
      state.holdTimer = null;
      return;
    }
    state.holdRunning = false;
    clearInterval(state.holdTimer);
    state.holdTimer = null;
    const sec = Math.round(state.holdSeconds * 10) / 10;
    if (sec > 0.3) {
      VTStorage.addHoldLog(sec);
      const input = $('#metrics-form [name="maxHold"]');
      if (input) {
        const prev = Number(input.value) || 0;
        if (sec > prev) input.value = sec;
      }
      renderHoldHistory();
      toast(`Logged hold: ${sec}s`);
    }
  }

  function renderHoldHistory() {
    const logs = VTStorage.getHoldLogs().slice(0, 8);
    $("#hold-history").innerHTML = logs.length
      ? logs.map((l) => `<span class="pill">${l.seconds}s</span>`).join("")
      : `<span class="muted">No holds logged yet</span>`;
  }

  /* —— Recording —— */
  async function startRecording() {
    try {
      state.recorder.onLevel = (lvl) => {
        $("#level-fill").style.width = `${Math.round(lvl * 100)}%`;
      };
      await state.recorder.start();
      $("#btn-rec-start").disabled = true;
      $("#btn-rec-stop").disabled = false;
      toast("Recording…");
    } catch (e) {
      console.error(e);
      toast("Microphone permission needed for recording");
    }
  }

  async function stopRecording() {
    const result = await state.recorder.stop();
    $("#btn-rec-start").disabled = false;
    $("#btn-rec-stop").disabled = true;
    $("#level-fill").style.width = "0%";
    if (!result) return;

    const area = $("#playback-area");
    area.innerHTML = `
      <audio class="audio-player" controls src="${result.url}"></audio>
      <div class="controls-row" style="margin-top:0.5rem;">
        <button type="button" class="btn btn-sm btn-success" id="btn-save-rec">Save to history</button>
        <button type="button" class="btn btn-sm btn-ghost" id="btn-discard-rec">Discard</button>
      </div>
    `;
    $("#btn-save-rec").addEventListener("click", async () => {
      try {
        await VTStorage.saveRecording({
          exerciseId: state.exercise.id,
          blob: result.blob,
          label: `${state.exercise.title} · ${new Date().toLocaleString()}`,
          meta: { durationMs: result.durationMs }
        });
        toast("Recording saved in this browser");
      } catch (e) {
        console.error(e);
        toast("Could not save recording");
      }
    });
    $("#btn-discard-rec").addEventListener("click", () => {
      state.recorder.clear();
      area.innerHTML = "";
    });
  }

  /* —— History —— */
  async function renderHistory() {
    setView("history");
    const list = $("#history-list");
    list.innerHTML = `<p class="muted">Loading…</p>`;
    try {
      const recs = await VTStorage.listRecordings();
      const progress = VTStorage.getProgress();
      const reviews = VTStorage.getReviews();

      let html = "<h3>Recordings (this device)</h3>";
      if (!recs.length) {
        html += `<p class="empty-state">No recordings yet. Open an exercise and use Record.</p>`;
      } else {
        html += `<div class="history-list">`;
        for (const r of recs) {
          const ex = findExercise(r.exerciseId);
          html += `
            <div class="history-item" data-id="${r.id}">
              <div>
                <strong>${r.label}</strong>
                <div class="meta">${ex ? ex.title : r.exerciseId} · ${new Date(r.createdAt).toLocaleString()} · ${Math.round((r.size || 0) / 1024)} KB</div>
              </div>
              <div class="controls-row">
                <button type="button" class="btn btn-sm" data-play="${r.id}">Play</button>
                <button type="button" class="btn btn-sm btn-danger" data-del="${r.id}">Delete</button>
              </div>
            </div>`;
        }
        html += `</div><div id="history-player"></div>`;
      }

      html += `<h3 style="margin-top:1.5rem;">Exercise completions</h3><div class="history-list">`;
      const entries = Object.entries(progress);
      if (!entries.length) html += `<p class="muted">No completed sessions yet.</p>`;
      else {
        entries.forEach(([id, p]) => {
          const ex = findExercise(id);
          html += `<div class="history-item">
            <div><strong>${ex ? ex.title : id}</strong>
            <div class="meta">${p.completedCount}× · last score ${p.lastScore != null ? p.lastScore + "/10" : "—"} · ${p.lastAt ? new Date(p.lastAt).toLocaleString() : ""}</div></div>
          </div>`;
        });
      }
      html += `</div>`;

      if (reviews.length) {
        html += `<h3 style="margin-top:1.5rem;">Saved reviews</h3>`;
      }

      list.innerHTML = html;

      $$("[data-play]", list).forEach((btn) => {
        btn.addEventListener("click", async () => {
          const blob = await VTStorage.getRecordingBlob(btn.dataset.play);
          if (!blob) return;
          const url = URL.createObjectURL(blob);
          const player = $("#history-player");
          player.innerHTML = `<audio class="audio-player" controls autoplay src="${url}"></audio>`;
        });
      });
      $$("[data-del]", list).forEach((btn) => {
        btn.addEventListener("click", async () => {
          if (!confirm("Delete this recording?")) return;
          await VTStorage.deleteRecording(btn.dataset.del);
          renderHistory();
          toast("Deleted");
        });
      });
    } catch (e) {
      console.error(e);
      list.innerHTML = `<p class="muted">Could not load history.</p>`;
    }
  }

  /* —— 12-week plan —— */
  function renderPlan() {
    setView("plan");
    const plan = VTStorage.getWeekPlan();
    $("#plan-week-num").textContent = `Week ${plan.weekNumber}`;
    $("#plan-status").textContent =
      plan.status === "idle"
        ? "Not started — pick an element to begin."
        : plan.status === "active"
          ? `Focus: ${plan.element}`
          : `Ready to review: ${plan.element}`;
    $("#plan-element-label").textContent = plan.element || "—";

    const chips = $("#element-chips");
    chips.innerHTML = "";
    VT_WEEK_ELEMENTS.forEach((el) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (plan.element === el ? " selected" : "");
      b.textContent = el;
      b.addEventListener("click", () => {
        const p = VTStorage.getWeekPlan();
        p.element = el;
        VTStorage.setWeekPlan(p);
        renderPlan();
      });
      chips.appendChild(b);
    });

    const checkins = $("#plan-checkins");
    const days = plan.checkIns || [];
    checkins.innerHTML = days.length
      ? days.map((d) => `<span class="pill">${d.date} ✓</span>`).join("")
      : `<span class="muted">No daily check-ins yet</span>`;

    const completed = $("#plan-completed-elements");
    completed.innerHTML = (plan.completedElements || []).length
      ? plan.completedElements.map((e) => `<span class="pill">${e}</span>`).join(" ")
      : `<span class="muted">None yet — finish a week review with “improved”</span>`;

    const reviews = $("#plan-reviews");
    reviews.innerHTML = (plan.reviews || [])
      .slice(0, 8)
      .map(
        (r) =>
          `<div class="history-item"><div><strong>Week ${r.week}: ${r.element}</strong><div class="meta">${r.verdict} · ${new Date(r.at).toLocaleDateString()} · ${r.notes || ""}</div></div></div>`
      )
      .join("") || `<p class="muted">No weekly reviews yet.</p>`;
  }

  function startWeekPlan() {
    const plan = VTStorage.getWeekPlan();
    if (!plan.element) {
      toast("Select a focus element first");
      return;
    }
    plan.status = "active";
    plan.startedAt = plan.startedAt || new Date().toISOString();
    VTStorage.setWeekPlan(plan);
    renderPlan();
    toast(`Week ${plan.weekNumber} started: ${plan.element}`);
  }

  function checkInDay() {
    const plan = VTStorage.getWeekPlan();
    if (plan.status === "idle") {
      toast("Start the week first");
      return;
    }
    const date = new Date().toISOString().slice(0, 10);
    plan.checkIns = plan.checkIns || [];
    if (plan.checkIns.some((c) => c.date === date)) {
      toast("Already checked in today");
      return;
    }
    plan.checkIns.push({ date });
    VTStorage.setWeekPlan(plan);
    renderPlan();
    toast("Daily check-in saved");
  }

  function submitWeekReview(improved) {
    const plan = VTStorage.getWeekPlan();
    if (!plan.element) {
      toast("Pick an element first");
      return;
    }
    const notes = $("#plan-review-notes")?.value || "";
    const review = {
      week: plan.weekNumber,
      element: plan.element,
      verdict: improved ? "improved" : "continue",
      notes,
      at: new Date().toISOString(),
      checkInCount: (plan.checkIns || []).length
    };
    plan.reviews = plan.reviews || [];
    plan.reviews.unshift(review);
    VTStorage.saveReview(review);

    if (improved) {
      plan.completedElements = plan.completedElements || [];
      if (!plan.completedElements.includes(plan.element)) {
        plan.completedElements.push(plan.element);
      }
      plan.weekNumber += 1;
      plan.element = null;
      plan.status = "idle";
      plan.checkIns = [];
      plan.startedAt = null;
      toast("Great — element improved. Pick a new focus for next week.");
    } else {
      plan.weekNumber += 1;
      plan.status = "active";
      plan.checkIns = [];
      plan.startedAt = new Date().toISOString();
      toast("Keep going on the same element — depth wins.");
    }
    VTStorage.setWeekPlan(plan);
    if ($("#plan-review-notes")) $("#plan-review-notes").value = "";
    renderPlan();
  }

  /* —— Structured session —— */
  function startStructured(path) {
    const p = path || $("#session-path")?.value || "basic";
    const session = VTSession.start(state.tab, p);
    updateSessionBanner();
    const id = VTSession.currentExerciseId();
    if (id) openExercise(id, true);
    toast(
      `${state.tab === "vocal" ? "Vocal" : "Singing"} · ${p} structured session (${session.order.length} exercises)`
    );
    return session;
  }

  function resumeStructured() {
    const s = VTSession.resume();
    updateSessionBanner();
    if (!s) return;
    if (s.status === "completed") {
      toast("Session already completed");
      return;
    }
    const id = VTSession.currentExerciseId();
    if (id) openExercise(id, true);
    else toast("No current exercise");
  }

  function pauseStructured() {
    VTSession.pause();
    pauseTimer();
    VTPiano.stopAll();
    updateSessionBanner();
    toast("Session paused — resume anytime");
  }

  function endStructured() {
    VTSession.clear();
    updateSessionBanner();
    setView("home");
    toast("Structured session cleared");
  }

  /* —— Bindings —— */
  function bind() {
    $$(".tab").forEach((t) => t.addEventListener("click", () => setTab(t.dataset.tab)));

    $$(".tier-chip").forEach((c) => {
      c.addEventListener("click", () => {
        state.tierFilter = c.dataset.tier;
        renderExerciseList();
      });
    });

    $("#btn-structured").addEventListener("click", () => startStructured());
    $("#btn-history").addEventListener("click", renderHistory);
    $("#btn-plan").addEventListener("click", renderPlan);
    $("#btn-session-pause").addEventListener("click", pauseStructured);
    $("#btn-session-resume").addEventListener("click", resumeStructured);
    $("#btn-session-end").addEventListener("click", endStructured);

    $("#btn-back-home").addEventListener("click", () => {
      VTPiano.stopAll();
      stopTimer(false);
      stopHold();
      stopPitchViz();
      state.recorder.clear();
      setView("home");
      renderExerciseList();
    });

    $("#btn-timer-start").addEventListener("click", startTimer);
    $("#btn-timer-pause").addEventListener("click", pauseTimer);
    $("#btn-timer-reset").addEventListener("click", resetTimer);

    $("#btn-rec-start").addEventListener("click", startRecording);
    $("#btn-rec-stop").addEventListener("click", stopRecording);

    $("#btn-play-prog").addEventListener("click", () => playSelectedProgression(false));
    $("#btn-loop-prog").addEventListener("click", () => playSelectedProgression(true));
    $("#btn-stop-piano").addEventListener("click", () => {
      VTPiano.stopAll();
      $("#chord-now").textContent = "—";
      toast("Piano stopped");
    });
    $("#btn-ref-pitch").addEventListener("click", async () => {
      const note = state.exercise?.audio?.refPitch || "A2";
      const sustain = $("#chk-sustain")?.checked;
      const sec = sustain ? Number($("#sustain-sec")?.value || 4) : 2.5;
      const f = await VTPiano.playRefPitch(note, sec, true);
      if (state.pitchViz && f) state.pitchViz.setTargetFreq(f);
      toast(`Reference ${note} (${sec}s)`);
    });
    $("#btn-inhale-ticks").addEventListener("click", async () => {
      await VTPiano.playInhaleTicks(3);
      toast("3-second inhale ticks");
    });
    $("#btn-pitch-start")?.addEventListener("click", startPitchViz);
    $("#btn-pitch-stop")?.addEventListener("click", stopPitchViz);

    $("#btn-hold-start").addEventListener("click", startHold);
    $("#btn-hold-stop").addEventListener("click", stopHold);

    $("#btn-complete").addEventListener("click", completeExercise);
    $("#btn-next-structured").addEventListener("click", () => {
      if (!state.structured) return;
      // save is optional — user may complete first
      const s = VTSession.get();
      if (!s) return;
      // if still on current, advance
      if (!s.completedIds.includes(state.exercise.id)) {
        VTSession.markCurrentComplete();
      }
      updateSessionBanner();
      const next = VTSession.currentExerciseId();
      if (next) openExercise(next, true);
      else {
        toast("Structured session complete — excellent work!");
        setView("home");
        renderExerciseList();
      }
    });

    $("#btn-open-plan").addEventListener("click", renderPlan);
    $("#btn-plan-start").addEventListener("click", startWeekPlan);
    $("#btn-plan-checkin").addEventListener("click", checkInDay);
    $("#btn-plan-improved").addEventListener("click", () => submitWeekReview(true));
    $("#btn-plan-continue").addEventListener("click", () => submitWeekReview(false));
    $("#btn-plan-back").addEventListener("click", () => {
      setView("home");
      renderExerciseList();
    });
    $("#btn-history-back").addEventListener("click", () => {
      setView("home");
      renderExerciseList();
    });
  }

  function init() {
    const settings = VTStorage.getSettings();
    state.tab = settings.lastTab || "vocal";
    bind();
    setTab(state.tab);
    updateSessionBanner();

    // Resume paused structured session hint
    const s = VTSession.get();
    if (s && s.status === "paused") {
      toast("You have a paused structured session — resume from the banner");
    }
  }

  document.addEventListener("DOMContentLoaded", init);
})();
