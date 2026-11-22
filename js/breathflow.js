/**
 * BreathFlow: local-first breathing and phrasing practice, not a spirometer.
 * Authoritative practice days: VTDays -> VTStorage -> account sync.
 * Separate finite-state machines for the learning round and microphone.
 */
(function (global) {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const EXERCISE_ID = "bf-breathflow";
  const PRESETS = {
    starter: ["Aquí empieza mi historia.", "La cuento con calma y con intención.", "Y dejo que cada frase llegue al público."],
    story: ["Durante mucho tiempo pensé que tenía que decirlo todo sin detenerme.", "Después descubrí que el silencio también puede contar una historia.", "Cuando llega una idea importante, dejo que tenga su propio espacio.", "Y vuelvo a hablar sin perder mi energía ni mi comodidad."],
    song: ["Esta noche miro las luces de la ciudad.", "Busco una palabra para decir lo que siento.", "Dejo que el silencio termine la canción."]
  };
  const state = {
    phase: "setup", lines: [], plan: [], actual: [], mid: [],
    idx: 0, start: 0, owner: "", saved: false,
    mic: "off", epoch: 0, stream: null, context: null, source: null, analyser: null,
    samples: null, bands: null, raf: 0, floor: 0.008, calibration: [],
    heardVoiceAt: 0, breathTicks: 0, candidateLatch: false, candidates: 0
  };

  function note(text, isError = true) {
    const el = $("flow-notice");
    el.hidden = !text;
    el.textContent = text || "";
    el.style.borderLeftColor = isError ? "#b34e38" : "#217b5e";
  }

  function show(phase) {
    state.phase = phase;
    ["setup", "run", "review", "done"].forEach((s) => {
      $("flow-" + s).hidden = phase !== (s === "run" ? "active" : s);
    });
  }

  function readLines() {
    const s = $("flow-lines").value.trim();
    const lines = s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    if (lines.length < 2 || lines.length > 6) return null;
    if (lines.some((s) => s.length > 160)) return null;
    return lines;
  }

  function planView() {
    const lines = readLines();
    const list = $("flow-plan");
    list.replaceChildren();
    if (!lines) {
      const p = document.createElement("p");
      p.textContent = "Escribe entre 2 y 6 frases, máximo 160 caracteres por frase.";
      p.className = "muted";
      list.appendChild(p);
      $("flow-start").disabled = true;
      return;
    }
    $("flow-start").disabled = false;
    const choices = state.plan.slice();
    state.plan = lines.map((_, i) => i !== 0 && (choices[i] ?? true));
    lines.forEach((line, i) => {
      const label = document.createElement("label");
      label.className = "check";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.checked = !!state.plan[i];
      checkbox.disabled = i === 0;
      checkbox.addEventListener("change", () => { state.plan[i] = checkbox.checked; });
      const span = document.createElement("span");
      span.textContent = i ? "Antes de «" + line + "»" : "Primera frase · respira naturalmente al comenzar";
      label.append(checkbox, span);
      list.appendChild(label);
    });
  }

  function setPreset() {
    const level = $("flow-level").value;
    $("flow-lines").value = PRESETS[level].join("\n");
    state.plan = [];
    planView();
  }

  function selectPeriod(period, focus = false) {
    ["day", "week", "month"].forEach((id) => {
      const selected = id === period;
      $("flow-tab-" + id).setAttribute("aria-selected", String(selected));
      $("flow-tab-" + id).tabIndex = selected ? 0 : -1;
      $("flow-" + id).hidden = !selected;
    });
    if (focus) $("flow-tab-" + period).focus();
  }

  function menuSummary() {
    const daysAPI = global.VTDays;
    if (!daysAPI?.read) {
      ["day", "week", "month"].forEach((x) => { $("flow-" + x).textContent = "El calendario no está disponible. Puedes practicar sin registro."; });
      return;
    }
    const bag = daysAPI.read();
    const today = daysAPI.dayKey();
    const start = daysAPI.weekStart(today);
    const end = daysAPI.addDays(start, 6);
    const week = daysAPI.countDays(start, end);
    const monthKeys = Object.keys(bag.days || {}).filter((k) => k.startsWith(today.slice(0, 7) + "-") && k <= today);
    const month = monthKeys.filter((k) => daysAPI.counts(bag.days[k])).length;
    const dayDone = daysAPI.counts(bag.days[today]);
    const goal = String(global.VTStorage?.getLoop?.()?.goal || "3-5");
    const weeklyLow = Number(goal.split("-")[0]) || 3;
    const fmt = (n) => String(n) + (n === 1 ? " día" : " días");
    $("flow-day").textContent = dayDone ? "Hoy ya tienes un día de práctica registrado. Puedes seguir sin presión." : "Hoy aún no has registrado práctica. Completa y guarda este recorrido si te sirve.";
    $("flow-week").textContent = "Esta semana: " + fmt(week) + ". Tu rango de referencia: " + goal + " días. " + (week >= weeklyLow ? "Ya llegaste al mínimo de tu rango." : "No hace falta practicar todos los días.");
    $("flow-month").textContent = "Este mes: " + fmt(month) + " de práctica en Vocal Studio. El calendario cuenta días distintos, no repeticiones ni minutos.";
  }

  function runView() {
    $("flow-counter").textContent = "Frase " + (state.idx + 1) + " de " + state.lines.length;
    $("flow-phrase").textContent = state.lines[state.idx];
    $("flow-breath").setAttribute("aria-pressed", String(!!state.actual[state.idx]));
    $("flow-breath").textContent = state.actual[state.idx] ? "✓ Aire registrado antes de esta frase" : "✓ Tomé aire antes de esta frase";
    $("flow-next").textContent = state.idx === state.lines.length - 1 ? "Terminar y revisar →" : "Siguiente frase →";
    $("flow-run-status").textContent = state.plan[state.idx] ? "Aquí habías planeado una pausa para respirar." : "Aquí no habías marcado una pausa obligatoria; respira cuando lo necesites.";
  }

  function start() {
    if (state.phase !== "setup") return;
    const lines = readLines();
    if (!lines) { note("Revisa las frases antes de comenzar."); return; }
    note("");
    state.owner = global.VTStorage?.getActiveProfileId?.() || "default";
    state.lines = lines;
    state.plan = lines.map((_, i) => i !== 0 && !!state.plan[i]);
    state.actual = lines.map(() => false);
    state.mid = lines.map(() => 0);
    state.idx = 0;
    state.start = performance.now();
    state.saved = false;
    state.candidates = 0;
    show("active");
    runView();
    $("flow-phrase").focus();
  }

  function next() {
    if (state.phase !== "active") return;
    if (state.idx < state.lines.length - 1) {
      state.idx++;
      runView();
      $("flow-phrase").focus();
      return;
    }
    stopMic();
    const planned = state.plan.filter(Boolean).length;
    const confirmed = state.actual.filter(Boolean).length;
    const inside = state.mid.reduce((a, b) => a + b, 0);
    $("flow-review-text").textContent = "Pausas planeadas: " + planned + " · respiraciones entre frases que marcaste: " + confirmed + " · dentro de frase: " + inside + ". " +
      "El micrófono sugirió " + state.candidates + " posibles sonidos de aire, sin verificarlos. La meta es reconocer qué frases necesitan respirar, no conseguir cero respiraciones.";
    $("flow-comfort").value = "";
    show("review");
  }

  function reset() {
    stopMic();
    show("setup");
    state.saved = false;
    state.owner = "";
    note("");
    planView();
    menuSummary();
  }

  function save() {
    if (state.phase !== "review" || state.saved) return;
    const comfort = $("flow-comfort").value;
    if (!["easy", "mixed", "strain"].includes(comfort)) {
      note("Antes de guardar, indica cómo se sintió tu voz.");
      $("flow-comfort").focus();
      return;
    }
    const current = global.VTStorage?.getActiveProfileId?.() || "default";
    if (current !== state.owner) {
      note("Cambió el perfil mientras practicabas. No se registró para evitar mezclar cuentas. Vuelve a comenzar en el perfil correcto.");
      return;
    }
    if (!global.VTDays?.record) {
      note("No está disponible el calendario de práctica. No se ha registrado nada.");
      return;
    }
    const sec = Math.max(0, Math.min(900, Math.round((performance.now() - state.start) / 1000)));
    try {
      const rec = global.VTDays.record({ exerciseId: EXERCISE_ID, sec, saved: true, source: "breathflow" });
      if (global.VTStorage?.isUnsaved?.()) {
        note("El navegador rechazó guardar el progreso. Queda visible solo mientras esta pestaña siga abierta.");
        return;
      }
      state.saved = true;
      $("flow-done-text").textContent = rec.becameDay
        ? "Sumaste un nuevo día de práctica al calendario compartido. Tu comodidad: " + comfortLabel(comfort) + "."
        : "Tu día ya estaba registrado; esta ronda también quedó anotada. Tu comodidad: " + comfortLabel(comfort) + ".";
      show("done");
      note("");
      menuSummary();
    } catch {
      note("No se pudo confirmar el guardado. Revisa el almacenamiento del navegador antes de intentarlo de nuevo.");
    }
  }

  function comfortLabel(c) {
    return ({ easy: "cómoda", mixed: "variable", strain: "incómoda" })[c] || "sin calificar";
  }

  function micStatus(s) { $("flow-mic-status").textContent = s; }

  function releaseStream(stream) {
    try { stream?.getTracks?.().forEach((t) => t.stop()); } catch { /* already ended */ }
  }

  function stopMic() {
    state.epoch++;
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = 0;
    releaseStream(state.stream);
    state.stream = null;
    try { state.source?.disconnect?.(); } catch { /* disconnected */ }
    state.source = null;
    state.analyser = null;
    if (state.context) { const ctx = state.context; state.context = null; ctx.onstatechange = null; ctx.close().catch(() => {}); }
    state.mic = "off";
    $("flow-mic").textContent = "Usar micrófono (opcional)";
    micStatus("Micrófono apagado. Puedes continuar sin audio.");
    $("flow-audio-candidate").textContent = "";
  }

  /** Observed amplitude, not calibrated voice intensity or airflow. */
  function amplitude(analyser) {
    analyser.getByteTimeDomainData(state.samples);
    let power = 0;
    for (const sample of state.samples) {
      const x = (sample - 128) / 128;
      power += x * x;
    }
    return Math.sqrt(power / state.samples.length);
  }

  /** Coarse upper/lower spectrum ratio. Neither band verifies respiration. */
  function spectralRatio(analyser) {
    analyser.getByteFrequencyData(state.bands);
    const split = Math.round(state.bands.length * 0.13);
    const highEnd = Math.round(state.bands.length * 0.38);
    let low = 0;
    let high = 0;
    for (let i = 2; i < split; i++) low += state.bands[i];
    for (let i = split; i < highEnd; i++) high += state.bands[i];
    return (high / Math.max(1, highEnd - split)) / Math.max(1, low / Math.max(1, split - 2));
  }

  function calibrate(rms) {
    state.calibration.push(rms);
    const sorted = state.calibration.slice().sort((a, b) => a - b);
    state.floor = Math.max(0.006, sorted[Math.floor(sorted.length / 2)] || 0.006);
    micStatus("Calibrando sonido ambiente… " + Math.min(100, Math.round(state.calibration.length * 100 / 45)) + "%");
  }

  /** A candidate is only a cue; no inference of actual inhalation is made. */
  function candidateAt(rms, now, ratio, voiced) {
    const possibleAir = !voiced && now - state.heardVoiceAt < 2200 &&
      rms > Math.max(0.010, state.floor * 1.6) && ratio > 0.7;
    state.breathTicks = possibleAir ? state.breathTicks + 1 : 0;
    if (voiced) state.candidateLatch = false;
    if (state.breathTicks >= 4 && !state.candidateLatch) {
      state.candidateLatch = true;
      if (state.phase === "active") state.candidates++;
    }
    return possibleAir;
  }

  function renderAudioHint(possibleAir, voiced) {
    micStatus(voiced ? "Se oye voz; el volumen no se califica." : possibleAir ? "Posible aire o ruido; confírmalo tú." : "Pausa o sonido suave. Una pausa no demuestra una inhalación.");
    $("flow-audio-candidate").textContent = state.phase === "active"
      ? "Indicaciones acústicas no verificadas: " + state.candidates + ". No se usan para decidir tus resultados."
      : "Calibrado. Habla a tu volumen habitual.";
  }

  function analyseFrame(rms) {
    const now = performance.now();
    const voiced = rms > Math.max(0.025, state.floor * 4);
    if (voiced) state.heardVoiceAt = now;
    const ratio = spectralRatio(state.analyser);
    renderAudioHint(candidateAt(rms, now, ratio, voiced), voiced);
  }

  function micFrame() {
    if (state.mic !== "live" || !state.analyser || document.hidden) return;
    const rms = amplitude(state.analyser);
    if (state.calibration.length < 45) calibrate(rms);
    else analyseFrame(rms);
    state.raf = requestAnimationFrame(micFrame);
  }

  /** Reject permission responses from a cancelled or no-longer-active round. */
  function micRequestValid(token, ctx) {
    return token === state.epoch && ["setup", "active"].includes(state.phase) &&
      (!ctx || ctx.state === "running");
  }

  async function enableMic() {
    if (state.mic === "requesting") return;
    if (state.mic === "live") { stopMic(); return; }
    if (!navigator.mediaDevices?.getUserMedia || !global.AudioContext) {
      micStatus("Este navegador no ofrece audio en esta página. Sigue con los botones manuales.");
      return;
    }
    const token = ++state.epoch;
    state.mic = "requesting";
    $("flow-mic").textContent = "Solicitando permiso…";
    $("flow-mic").disabled = true;
    micStatus("Esperando permiso del navegador…");
    let stream = null;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }, video: false });
      if (!micRequestValid(token)) { releaseStream(stream); return; }
      const ctx = new AudioContext();
      state.stream = stream;
      state.context = ctx;
      state.source = ctx.createMediaStreamSource(stream);
      state.analyser = ctx.createAnalyser();
      state.analyser.fftSize = 1024;
      state.source.connect(state.analyser);
      state.samples = new Uint8Array(state.analyser.fftSize);
      state.bands = new Uint8Array(state.analyser.frequencyBinCount);
      state.calibration = [];
      state.floor = 0.008;
      state.heardVoiceAt = 0;
      state.breathTicks = 0;
      state.candidateLatch = false;
      ctx.onstatechange = () => {
        if (ctx.state !== "running" && state.mic === "live") {
          stopMic();
          micStatus("Audio interrumpido (Safari o sistema). Puedes seguir manualmente o reactivar el micrófono.");
        }
      };
      stream.getAudioTracks().forEach((track) => {
        track.onended = () => {
          if (state.stream === stream) { stopMic(); micStatus("El dispositivo de entrada se desconectó. Puedes continuar manualmente."); }
        };
        track.onmute = () => { if (state.stream === stream) micStatus("El micrófono fue silenciado por el sistema. Marca las respiraciones manualmente."); };
        track.onunmute = () => { if (state.stream === stream) micStatus("Volvió el micrófono. Confirma tus respiraciones manualmente."); };
      });
      if (ctx.state !== "running") await ctx.resume();
      if (!micRequestValid(token, ctx)) { stopMic(); return; }
      state.mic = "live";
      $("flow-mic").textContent = "Apagar micrófono";
      micStatus("Micrófono activo. Calibrando ambiente…");
      state.raf = requestAnimationFrame(micFrame);
    } catch (err) {
      if (token === state.epoch) {
        stopMic();
        micStatus(err?.name === "NotAllowedError" ? "Permiso denegado. Sigue sin micrófono." : "No se pudo abrir el micrófono. Sigue sin micrófono.");
      } else releaseStream(stream);
    } finally {
      $("flow-mic").disabled = false;
    }
  }

  function bind() {
    $("flow-level").addEventListener("change", setPreset);
    $("flow-lines").addEventListener("input", () => { state.plan = []; planView(); });
    $("flow-start").addEventListener("click", start);
    $("flow-mic").addEventListener("click", enableMic);
    $("flow-mic-off").addEventListener("click", stopMic);
    $("flow-breath").addEventListener("click", () => {
      if (state.phase !== "active") return;
      state.actual[state.idx] = !state.actual[state.idx];
      runView();
    });
    $("flow-mid").addEventListener("click", () => {
      if (state.phase !== "active") return;
      state.mid[state.idx] = Math.min(20, state.mid[state.idx] + 1);
      $("flow-run-status").textContent = "Respiración dentro de la frase registrada (" + state.mid[state.idx] + "). Está bien adaptar la frase.";
    });
    $("flow-next").addEventListener("click", next);
    $("flow-abort").addEventListener("click", reset);
    $("flow-restart").addEventListener("click", reset);
    $("flow-save").addEventListener("click", save);
    $("flow-again").addEventListener("click", reset);
    ["day", "week", "month"].forEach((id) => {
      $("flow-tab-" + id).addEventListener("click", () => selectPeriod(id));
      $("flow-tab-" + id).addEventListener("keydown", (e) => {
        if (!["ArrowRight", "ArrowLeft", "Home", "End"].includes(e.key)) return;
        const tabs = ["day", "week", "month"];
        let n = tabs.indexOf(id);
        if (e.key === "Home") n = 0;
        else if (e.key === "End") n = 2;
        else n = (n + (e.key === "ArrowRight" ? 1 : 2)) % 3;
        e.preventDefault();
        selectPeriod(tabs[n], true);
      });
    });
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && ["live", "requesting"].includes(state.mic)) {
        stopMic();
        micStatus("Se cerró el micrófono al salir de la pestaña. Retoma manualmente o actívalo otra vez.");
      }
      if (!document.hidden) menuSummary();
    });
    window.addEventListener("pagehide", stopMic);
    window.addEventListener("storage", (e) => {
      if (e.key?.includes("vt_days") || e.key?.includes("vt_loop")) menuSummary();
    });
    setPreset();
    selectPeriod("day");
    menuSummary();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
  global.VTBreathFlow = { state: () => ({ phase: state.phase, mic: state.mic, index: state.idx, candidates: state.candidates }) };
})(window);
