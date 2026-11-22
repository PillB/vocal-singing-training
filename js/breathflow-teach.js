/**
 * BreathFlow technique studio: visual teaching and optional sound exemplars.
 * Visuals are schematic pedagogical aids; no body tracking or medical inference.
 * Independent machine: stage 0..3 -> self-check -> ready (or explicit skip).
 */
(function (global) {
  "use strict";

  const el = (id) => document.getElementById(id);
  const LESSONS = [
    {
      title: "1 · Hombros libres, cuello cómodo",
      caption: "Deja que los hombros se suelten. No los subas adrede para inhalar. Mantén cabeza y cuello alineados sin rigidez.",
      svg: "Hombros verdes se relajan hacia abajo; trazo naranja discontinuo representa la elevación que no debes forzar."
    },
    {
      title: "2 · Notar el movimiento de las costillas",
      caption: "Apoya una mano suavemente en el costado de las costillas bajas (o en el abdomen si te resulta más fácil). Nota un movimiento pequeño al tomar aire; no empujes la barriga ni infles al máximo.",
      svg: "Dos manos aparecen junto a las costillas bajas; las costillas se ensanchan ligeramente y vuelven."
    },
    {
      title: "3 · Boca, lengua y salida de aire",
      caption: "Para /sss/: dientes cercanos sin apretar, labios sueltos, lengua cerca de la zona detrás de los dientes superiores, dejando un canal estrecho para aire. No saques la lengua ni tenses la mandíbula.",
      svg: "Vista lateral de boca: la lengua se aproxima detrás de los dientes superiores; las flechas representan flujo de aire, no un chorro medido."
    },
    {
      title: "4 · Lleva el aire hasta la idea completa",
      caption: "Respira en la pausa que te ayuda y di la frase con intención. Si necesitas aire antes, adapta la frase: no compitas por quedarte sin respirar.",
      svg: "Una pausa para tomar aire aparece antes de una barra de frase; una marca recorre la línea sin imponer un tiempo de respiración."
    }
  ];
  const state = { stage: 0, sound: "hiss", paused: false, ready: false, soundEpoch: 0, context: null };

  function stopSound() {
    state.soundEpoch++;
    try { global.speechSynthesis?.cancel?.(); } catch { /* voice service unavailable */ }
    if (state.context) {
      const ctx = state.context;
      state.context = null;
      ctx.close().catch(() => {});
    }
  }

  function soundLabel(text) { el("coach-audio-status").textContent = text; }

  function readyLabel() {
    if (!state.ready) return;
    el("coach-status").textContent = "Guía revisada. Puedes pasar a tus frases o volver a mirar cualquier ejemplo.";
    global.VTBreathFlow?.refreshReadiness?.();
  }

  function render() {
    const n = state.stage, lesson = LESSONS[n];
    const box = el("flow-coach");
    box.dataset.stage = String(n);
    box.dataset.sound = state.sound;
    box.dataset.paused = String(state.paused);
    el("coach-position").textContent = "Paso " + (n + 1) + " de " + LESSONS.length;
    el("coach-stage").textContent = lesson.title;
    el("coach-caption").textContent = lesson.caption;
    el("coach-svg-desc").textContent = lesson.svg;
    el("coach-prev").disabled = n === 0;
    el("coach-next").hidden = n === LESSONS.length - 1;
    el("coach-sound-switch").hidden = n !== 2;
    el("coach-play").hidden = n < 2;
    el("coach-checks").hidden = n !== 3;
    el("coach-hiss").setAttribute("aria-pressed", String(state.sound === "hiss"));
    el("coach-vowel").setAttribute("aria-pressed", String(state.sound === "vowel"));
    el("coach-toggle").setAttribute("aria-pressed", String(state.paused));
    el("coach-toggle").textContent = state.paused ? "Reproducir animación" : "Pausar animación";
    el("coach-finish").hidden = state.ready;
    el("coach-skip").hidden = state.ready;
    if (state.ready) readyLabel();
    else el("coach-status").textContent = "Paso " + (n + 1) + " de 4. Puedes volver a ver cada demostración sin encender el micrófono.";
  }

  function setStage(n) {
    if (!Number.isInteger(n) || n < 0 || n >= LESSONS.length) return;
    stopSound();
    state.stage = n;
    soundLabel("Demostración visual: mira el cuerpo antes de practicar.");
    render();
  }

  function setSound(kind) {
    if (!["hiss", "vowel"].includes(kind)) return;
    state.sound = kind;
    const lesson = LESSONS[2];
    lesson.caption = kind === "hiss"
      ? "Para /sss/: dientes cercanos sin morder, labios flojos, lengua cerca de la zona detrás de dientes superiores. La salida de aire se mantiene cómoda, no máxima."
      : "Para /a/: labios y mandíbula se abren sin rigidez; la lengua descansa cómoda en la boca. Vocaliza suave y sin forzar el aire.";
    lesson.svg = kind === "hiss"
      ? "Lengua cercana detrás de dientes superiores, canal estrecho de aire, mandíbula libre."
      : "Mandíbula ligeramente abierta y lengua baja y libre, sin morder.";
    stopSound();
    render();
  }

  function finish() {
    if (state.ready || state.stage !== 3 || !checksComplete()) return;
    complete();
  }

  function complete() {
    stopSound();
    state.ready = true;
    render();
    const setup = el("flow-setup");
    setup?.scrollIntoView?.({ block: "start", behavior: "instant" });
    el("flow-level")?.focus?.({ preventScroll: true });
  }

  function checksComplete() {
    return ["shoulders", "ribs", "jaw"].every((key) => el("coach-check-" + key).checked);
  }

  function updateChecks() {
    el("coach-finish").disabled = !(state.stage === 3 && checksComplete());
  }

  /** Approximate hiss to illustrate the presence of continuous airflow: not a human reference recording. */
  function playHiss() {
    const AudioCtor = global.AudioContext || global.webkitAudioContext;
    if (!AudioCtor) { soundLabel("Este navegador no puede reproducir la muestra. Sigue la ilustración."); return; }
    const ctx = new AudioCtor();
    state.context = ctx;
    const dur = 0.8, size = Math.ceil(ctx.sampleRate * dur);
    const buffer = ctx.createBuffer(1, size, ctx.sampleRate), arr = buffer.getChannelData(0);
    for (let i = 0; i < arr.length; i++) arr[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource(), filter = ctx.createBiquadFilter(), gain = ctx.createGain();
    src.buffer = buffer;
    filter.type = "highpass";
    filter.frequency.value = 2500;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.08);
    gain.gain.setValueAtTime(0.06, ctx.currentTime + dur - 0.1);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + dur);
    src.connect(filter); filter.connect(gain); gain.connect(ctx.destination);
    src.onended = () => { if (state.context === ctx) state.context = null; ctx.close().catch(() => {}); };
    src.start();
    src.stop(ctx.currentTime + dur);
    ctx.resume().catch(() => { soundLabel("El sistema interrumpió el sonido. El ejercicio funciona sin audio."); stopSound(); });
    soundLabel("Muestra sintética de aire /sss/, no una pronunciación humana ni una puntuación.");
  }

  function playVoice() {
    if (!global.speechSynthesis || !global.SpeechSynthesisUtterance) {
      soundLabel("Sin voz del sistema disponible. Lee la frase en voz natural y apóyate en el esquema.");
      return;
    }
    const epoch = state.soundEpoch;
    const sample = state.stage === 2
      ? "Aaaa"
      : "Aquí empieza mi historia. La cuento con calma y con intención.";
    const u = new SpeechSynthesisUtterance(sample);
    u.lang = "es-PE";
    u.rate = 0.85;
    u.volume = 0.75;
    u.onerror = () => {
      if (epoch === state.soundEpoch) soundLabel("La voz del sistema no pudo reproducirse; sigue con la demostración visual.");
    };
    global.speechSynthesis.cancel();
    global.speechSynthesis.speak(u);
    soundLabel("Ejemplo generado por la voz del dispositivo: ilustra el sonido o las pausas, no certifica técnica vocal.");
  }

  function play() {
    stopSound();
    try {
      if (state.stage === 2 && state.sound === "hiss") playHiss();
      else playVoice();
    } catch {
      soundLabel("No se pudo reproducir el ejemplo. La guía visual y las comprobaciones siguen disponibles.");
      stopSound();
    }
  }

  function bind() {
    state.paused = !!global.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    el("coach-prev").addEventListener("click", () => setStage(state.stage - 1));
    el("coach-next").addEventListener("click", () => setStage(state.stage + 1));
    el("coach-toggle").addEventListener("click", () => { state.paused = !state.paused; render(); });
    el("coach-play").addEventListener("click", play);
    el("coach-hiss").addEventListener("click", () => setSound("hiss"));
    el("coach-vowel").addEventListener("click", () => setSound("vowel"));
    el("coach-finish").addEventListener("click", finish);
    el("coach-skip").addEventListener("click", complete);
    ["shoulders", "ribs", "jaw"].forEach((key) => {
      el("coach-check-" + key).addEventListener("change", updateChecks);
    });
    global.addEventListener("pagehide", stopSound);
    document.addEventListener("visibilitychange", () => { if (document.hidden) stopSound(); });
    render();
  }

  global.VTBreathTeach = {
    isReady: () => state.ready,
    state: () => ({ stage: state.stage, sound: state.sound, paused: state.paused, ready: state.ready }),
    stopSound
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
})(window);
