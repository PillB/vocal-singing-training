/**
 * Localization: Spanish (LatAm / Perú, clear international) default + English toggle.
 * Best practices: native language names, no flags, localStorage persistence, full UI parity.
 */
(function (global) {
  "use strict";

  const STRINGS = {
    es: {
      "meta.title": "Entrenamiento vocal y de canto",
      "meta.desc":
        "Práctica en casa: entrenamiento vocal y de canto, grabación, métricas, piano y plan de 12 semanas.",
      "brand.title": "Entrenamiento vocal y de canto",
      "brand.tag": "Práctica en casa · Grabar · Revisar · Crecer",
      "nav.history": "Historial",
      "nav.plan": "Plan de 12 semanas",
      "nav.lang": "English",
      "nav.tour": "Tour",
      "tour.skip": "Saltar tour",
      "tour.prev": "Atrás",
      "tour.next": "Siguiente",
      "tour.finish": "Empezar a practicar",
      "tour.progress": "Paso {n} de {total}",
      "tour.s1.title": "Bienvenido a tu estudio de voz",
      "tour.s1.body":
        "Aquí practicas oratoria y canto en casa: micrófono, piano, métricas y un plan de 12 semanas. Todo se guarda en este navegador.",
      "tour.s2.title": "Dos caminos de entrenamiento",
      "tour.s2.body":
        "Cambia entre Entrenamiento vocal (hablar con claridad y presencia) y Entrenamiento de canto (cierre, aire, afinación). Cada uno tiene su lista de ejercicios.",
      "tour.s3.title": "Básico y avanzado",
      "tour.s3.body":
        "Básico = la base de la tarea. Avanzado = ejercicios extra de investigación (pausas, rellenos, SOVT, sirenas, escalas…). Filtra cuando quieras enfocarte.",
      "tour.s4.title": "Elige un ejercicio",
      "tour.s4.body":
        "Cada tarjeta resume el objetivo y el tiempo. Toca una para abrir el «escenario de práctica» con instrucciones y herramientas.",
      "tour.s5.title": "Continuar o sesión guiada",
      "tour.s5.body":
        "Continuar retoma lo que dejaste. Sesión guiada recorre una ruta (básica, avanzada o completa) con pausa y progreso. Ideal si no quieres decidir el orden.",
      "tour.s6.title": "Historial, plan e idioma",
      "tour.s6.body":
        "Historial: grabaciones y puntajes. Plan de 12 semanas: un foco a la vez. English/Español: cambia el idioma de la interfaz. Tour: vuelve a ver esta guía cuando quieras.",
      "tour.s7.title": "Escenario de práctica",
      "tour.s7.body":
        "Arriba tienes el escenario (como un juego): estado, temporizador y controles. Abajo, la guía del ejercicio (pasos y consejos) y las métricas al terminar.",
      "tour.s8.title": "Un solo botón: Empezar",
      "tour.s8.body":
        "Empezar activa el micrófono, el medidor de nivel, la afinación (si aplica), los sostenidos automáticos y el piano cuando el ejercicio lo necesita. Detener lo apaga todo.",
      "tour.s9.title": "Autopista de afinación",
      "tour.s9.body":
        "En canto verás carriles de notas: grises = mapa de la progresión, ámbar = acorde activo, verde = nota principal. Tu voz es el punto que deja rastro. Apunta al carril correcto.",
      "tour.s10.title": "Controles en las esquinas",
      "tour.s10.body":
        "Como en un juego: arriba-izquierda estado y tiempo; abajo-izquierda Empezar/Detener; abajo-derecha piano (arpegio, sostener 3–5s, auto piano). Menos scroll, más práctica.",
      "tour.s11.title": "Reflexiona y guarda",
      "tour.s11.body":
        "Al terminar, califica con honestidad y pulsa Guardar sesión. Las notas son una brújula, no un juicio. Si sales tras practicar ≥10% del tiempo, te preguntaremos si guardar o descartar.",
      "tour.s12.title": "Listo: a practicar",
      "tour.s12.body":
        "Elige un ejercicio básico de vocal o de canto y pulsa Empezar. Permite el micrófono cuando el navegador lo pida. ¡Consistencia gana a intensidad!",
      "session.banner": "Sesión guiada",
      "session.pause": "Pausar",
      "session.resume": "Reanudar",
      "session.end": "Terminar",
      "home.vocalTitle": "Entrenamiento vocal",
      "home.vocalSub":
        "Básico: bases de oratoria clara. Avanzado: pausa, rellenos, tono, gestos, historias y más.",
      "home.singingTitle": "Entrenamiento de canto",
      "home.singingSub":
        "Básico: cierre y aire. Avanzado: SOVT, sirenas, afinación, escalas y dinámica.",
      "tab.vocal": "Entrenamiento vocal",
      "tab.singing": "Entrenamiento de canto",
      "tier.all": "Todos",
      "tier.basic": "Básico",
      "tier.advanced": "Avanzado",
      "tier.counts": "{basic} básico · {advanced} avanzado · mostrando {showing}",
      "home.continue": "▶ Continuar práctica",
      "home.structured": "Iniciar sesión guiada",
      "home.path": "Ruta",
      "home.path.basic": "Básica",
      "home.path.advanced": "Avanzada",
      "home.path.full": "Completa",
      "card.notPracticed": "Aún no practicado",
      "card.sessions": "✓ {n} sesión",
      "card.sessions_plural": "✓ {n} sesiones",
      "card.meta": "~{min} min · {tools}",
      "card.piano": "Piano · ",
      "card.pitch": "Afinación · ",
      "card.record": "Grabar",
      "card.practice": "Practicar",
      "ex.back": "← Todos los ejercicios",
      "ex.guide": "Cómo practicar",
      "ex.hideGuide": "Ocultar detalles",
      "ex.showGuide": "Mostrar pasos y consejos",
      "ex.steps": "Pasos",
      "ex.tips": "Consejos",
      "ex.avoid": "Evitar",
      "ex.original": "Espíritu original",
      "ex.research": "Investigación · ",
      "practice.title": "Práctica",
      "practice.hint":
        "Un botón inicia escucha, afinación, sostenidos, temporizador y piano cuando corresponde.",
      "practice.start": "▶ Empezar",
      "practice.stop": "■ Detener",
      "practice.ready": "Listo",
      "practice.live": "En vivo",
      "practice.recordAlso": "Grabar",
      "practice.hold": "Sostenido {s}s",
      "practice.focusCta": "Pulsa Empezar · el micrófono escucha solo",
      "mic.sens": "Mic",
      "mic.sensHint": "Sensibilidad del micrófono (1 baja · 10 alta)",
      "pitch.title": "Afinación · precisión y exactitud",
      "pitch.legend":
        "Carriles grises = notas de la progresión · Ámbar = acordes activos · Verde = nota principal · Tu voz se mueve entre carriles",
      "pitch.challenge": "Reto de notas (bloquear 8 objetivos)",
      "pitch.score": "Puntos",
      "pitch.combo": "Combo",
      "pitch.inLane": "En carril",
      "piano.title": "Piano · registro medio-bajo",
      "piano.arpeggio": "Arpegio",
      "piano.sustain": "Sostener",
      "piano.hold": "Duración",
      "piano.auto": "Auto piano",
      "piano.playOnce": "Reproducir una vez",
      "piano.loop": "Bucle",
      "piano.stop": "Detener piano",
      "piano.ref": "Nota de referencia",
      "piano.inhale": "Inspiración 3s",
      "piano.showPanel": "Mostrar piano y progresiones",
      "piano.hidePanel": "Ocultar piano",
      "hold.auto":
        "Se registra solo si sostienes la voz ≥ 2s y luego sueltas (con un poco de margen si hay cortes breves).",
      "metrics.title": "Reflexionar y guardar",
      "metrics.sub": "Califica después de practicar. Las notas son una brújula, no un juicio.",
      "metrics.save": "Guardar sesión y puntaje",
      "metrics.notes": "Notas de la sesión",
      "metrics.notesPh": "¿Qué salió bien? ¿Qué probarás la próxima vez?",
      "review.title": "Revisión en 3 pasos (espera 1 día completo tras grabar)",
      "week.cta": "Plan de 12 semanas",
      "week.ctaSub": "Elige el foco semanal, registra el día y revisa al final.",
      "week.open": "Abrir panel de 12 semanas",
      "history.title": "Historial",
      "history.sub": "Grabaciones y progreso guardados en este navegador.",
      "history.back": "← Volver",
      "plan.title": "Plan de mejora de 12 semanas",
      "plan.sub": "Un elemento a la vez. Graba y revisa cada semana. Continúa o avanza.",
      "plan.current": "Semana actual",
      "plan.pick": "Elige el elemento",
      "plan.start": "Iniciar / continuar semana",
      "plan.checkin": "Registro del día",
      "plan.checkins": "Registros",
      "plan.review": "Grabar y revisar al final de la semana",
      "plan.reviewSub":
        "Tras ~7 días de foco, graba una muestra corta, revísala y decide:",
      "plan.notes": "Notas de revisión",
      "plan.notesPh": "¿Qué mejoró? ¿Qué sigue pendiente?",
      "plan.improved": "Mejoró → nuevo elemento",
      "plan.continue": "Aún no → mismo elemento",
      "plan.completed": "Elementos mejorados",
      "plan.reviews": "Historial de revisiones",
      "footer.base": "Basado en",
      "footer.rest":
        "· Material de práctica personal · Piano en el navegador (registro medio-bajo) · Los datos se quedan en tu dispositivo.",
      "next": "Siguiente ejercicio →",
      "toast.mic": "Se necesita permiso de micrófono",
      "toast.pianoOnly": "Piano en marcha · permite el micrófono para escuchar tu voz",
      "toast.pianoFail": "No se pudo iniciar el piano · pulsa Empezar de nuevo",
      "toast.live": "En vivo · {mode}",
      "toast.liveRec": "En vivo · {mode} · grabando",
      "toast.stopped": "Práctica detenida",
      "leave.title": "¿Guardar esta práctica?",
      "leave.body":
        "Practicaste una parte importante de este ejercicio. ¿Quieres guardar el progreso o descartarlo?",
      "leave.stats": "Tiempo practicado: {done} de {total} ({pct}%)",
      "leave.save": "Guardar progreso",
      "leave.discard": "Descartar",
      "leave.stay": "Seguir practicando",
      "leave.scrollSave": "Revisa las métricas y pulsa Guardar sesión",
      "leave.discarded": "Práctica descartada",
      "toast.hold": "Sostenido registrado: {s}s",
      "toast.saved": "Sesión guardada",
      "toast.pianoStop": "Piano detenido",
      "badge.vocal": "Vocal",
      "badge.singing": "Canto",
      "badge.basic": "básico",
      "badge.advanced": "avanzado",
      "ex.v1-diction": "Mejor dicción",
      "ex.v2-volume": "Mantener el volumen",
      "ex.v3-soft-palate": "Elevar el velo del paladar",
      "ex.v4-articulation-pen": "Articulación (con bolígrafo)",
      "ex.v5-neutral-ears": "Oídos neutros (persona e historia)",
      "ex.v6-connect": "Cómo conectar",
      "ex.v7-record-review": "Grabar y revisar",
      "ex.v8-fluency-metaphors": "Fluidez (metáforas)",
      "ex.v9-12-week": "Plan de 12 semanas",
      "ex.v10-power-pause": "El poder de la pausa",
      "ex.v11-kill-fillers": "Eliminar rellenos",
      "ex.v12-melodic-speech": "Habla melódica y tono",
      "ex.v13-volume-ladder": "Escalera de volumen",
      "ex.v14-pace-variation": "Variar el ritmo",
      "ex.v15-gestures": "Gestos y lenguaje corporal",
      "ex.v16-facial-expression": "Expresión facial",
      "ex.v17-strategic-concision": "Concisión estratégica",
      "ex.v18-story-peak": "Historia: pico emocional",
      "ex.v19-authority-close": "Cierre con autoridad",
      "ex.v20-energy-match": "Energía y carisma",
      "ex.s1-vocal-fry": "Fry vocal → /A/ sostenida",
      "ex.s2-solfege-chords": "/A/ en progresiones (solfeo)",
      "ex.s3-song-stanzas": "Estrofas de canción",
      "ex.s4-lip-trills": "Trinos de labios (SOVT)",
      "ex.s5-sirens": "Sirenas / deslizamientos",
      "ex.s6-straw": "Fonación con pajita (SOVT)",
      "ex.s7-humming": "Resonancia con hum",
      "ex.s8-breath-support": "Apoyo del aire (S sostenida)",
      "ex.s9-pitch-match": "Afinar una nota",
      "ex.s10-five-note": "Escala de cinco notas (/A/)",
      "ex.s11-dynamics": "Crecendo en una nota",
      "ex.s12-easy-onset": "Ataque suave",
      "ex.s13-arpeggio-match": "Arpegios afinados",
      "ex.s14-staccato-legato": "Staccato vs legato"
    },
    en: {
      "meta.title": "Vocal & Singing Training",
      "meta.desc":
        "Self-paced vocal and singing practice with recording, metrics, piano chords, and a 12-week plan.",
      "brand.title": "Vocal & Singing Training",
      "brand.tag": "Home practice · Record · Review · Grow",
      "nav.history": "History",
      "nav.plan": "12-Week Plan",
      "nav.lang": "Español",
      "nav.tour": "Tour",
      "tour.skip": "Skip tour",
      "tour.prev": "Back",
      "tour.next": "Next",
      "tour.finish": "Start practicing",
      "tour.progress": "Step {n} of {total}",
      "tour.s1.title": "Welcome to your voice studio",
      "tour.s1.body":
        "Practice speaking and singing at home: mic, piano, metrics, and a 12-week plan. Everything stays in this browser.",
      "tour.s2.title": "Two training tracks",
      "tour.s2.body":
        "Switch between Vocal training (clarity and presence) and Singing training (closure, air, pitch). Each has its own exercise list.",
      "tour.s3.title": "Basic and advanced",
      "tour.s3.body":
        "Basic = homework spine. Advanced = research-backed extras (pauses, fillers, SOVT, sirens, scales…). Filter when you want focus.",
      "tour.s4.title": "Pick an exercise",
      "tour.s4.body":
        "Each card shows the goal and time. Tap one to open the practice stage with guidance and tools.",
      "tour.s5.title": "Continue or guided session",
      "tour.s5.body":
        "Continue resumes where you left off. Guided session walks a path (basic, advanced, or full) with pause and progress — great when you don’t want to choose the order.",
      "tour.s6.title": "History, plan, and language",
      "tour.s6.body":
        "History: recordings and scores. 12-week plan: one focus at a time. Language toggle for English/Spanish. Tour replays this guide anytime.",
      "tour.s7.title": "Practice stage",
      "tour.s7.body":
        "Up top is the game-like stage: status, timer, and controls. Below: how-to steps and post-practice metrics.",
      "tour.s8.title": "One button: Start",
      "tour.s8.body":
        "Start arms the mic, level meter, pitch (when needed), auto-hold logging, and piano when the exercise uses it. Stop ends everything.",
      "tour.s9.title": "Pitch highway",
      "tour.s9.body":
        "In singing you’ll see note lanes: gray = progression map, amber = active chord, green = primary note. Your voice is the trail dot — home in on the right lane.",
      "tour.s10.title": "Corner controls",
      "tour.s10.body":
        "Like a game HUD: top-left status and time; bottom-left Start/Stop; bottom-right piano (arpeggio, 3–5s sustain, auto piano). Less scrolling, more practice.",
      "tour.s11.title": "Reflect and save",
      "tour.s11.body":
        "When finished, rate honestly and tap Save session. Scores are a compass, not a judgment. If you leave after ≥10% of the exercise time, we’ll ask save or discard.",
      "tour.s12.title": "You’re ready",
      "tour.s12.body":
        "Pick a basic vocal or singing exercise and press Start. Allow the microphone when the browser asks. Consistency beats intensity!",
      "session.banner": "Structured session",
      "session.pause": "Pause",
      "session.resume": "Resume",
      "session.end": "End",
      "home.vocalTitle": "Vocal Training",
      "home.vocalSub":
        "Basic: clear speaking foundations. Advanced: pause, fillers, tonality, gestures, storytelling, and more.",
      "home.singingTitle": "Singing Training",
      "home.singingSub":
        "Basic: closure and air. Advanced: SOVT, sirens, pitch match, scales, and dynamics.",
      "tab.vocal": "Vocal Training",
      "tab.singing": "Singing Training",
      "tier.all": "All",
      "tier.basic": "Basic",
      "tier.advanced": "Advanced",
      "tier.counts": "{basic} basic · {advanced} advanced · showing {showing}",
      "home.continue": "▶ Continue practice",
      "home.structured": "Start structured session",
      "home.path": "Path",
      "home.path.basic": "Basic",
      "home.path.advanced": "Advanced",
      "home.path.full": "Full",
      "card.notPracticed": "Not yet practiced",
      "card.sessions": "✓ {n} session",
      "card.sessions_plural": "✓ {n} sessions",
      "card.meta": "~{min} min · {tools}",
      "card.piano": "Piano · ",
      "card.pitch": "Pitch · ",
      "card.record": "Record",
      "card.practice": "Practice",
      "ex.back": "← All exercises",
      "ex.guide": "How to practice",
      "ex.hideGuide": "Hide details",
      "ex.showGuide": "Show steps & tips",
      "ex.steps": "Steps",
      "ex.tips": "Tips",
      "ex.avoid": "Avoid",
      "ex.original": "Original spirit",
      "ex.research": "Research · ",
      "practice.title": "Practice",
      "practice.hint":
        "One button starts listening, pitch feedback, hold auto-log, timer, and piano when needed.",
      "practice.start": "▶ Start",
      "practice.stop": "■ Stop",
      "practice.ready": "Ready",
      "practice.live": "Live",
      "practice.recordAlso": "Record",
      "practice.hold": "Hold {s}s",
      "practice.focusCta": "Press Start · the mic listens for you",
      "mic.sens": "Mic",
      "mic.sensHint": "Microphone sensitivity (1 low · 10 high)",
      "pitch.title": "Pitch visualizer · accuracy & precision",
      "pitch.legend":
        "Gray lanes = full progression · Amber = active chord tones · Green = primary note · Your voice moves between lanes",
      "pitch.challenge": "Note challenge (lock 8 targets)",
      "pitch.score": "Score",
      "pitch.combo": "Combo",
      "pitch.inLane": "In-lane",
      "piano.title": "Piano · mid-lower male range",
      "piano.arpeggio": "Arpeggio",
      "piano.sustain": "Sustain",
      "piano.hold": "Hold",
      "piano.auto": "Auto piano",
      "piano.playOnce": "Play once",
      "piano.loop": "Loop",
      "piano.stop": "Stop piano",
      "piano.ref": "Ref pitch",
      "piano.inhale": "3s inhale",
      "piano.showPanel": "Show piano & progressions",
      "piano.hidePanel": "Hide piano",
      "hold.auto":
        "Auto-logs when you sustain voice ≥ 2s then stop (with short-dropout grace so holds don’t cut off early).",
      "metrics.title": "Reflect & save",
      "metrics.sub": "Rate after practice. Scores are a compass, not a judgment.",
      "metrics.save": "Save session & score",
      "metrics.notes": "Session notes",
      "metrics.notesPh": "What felt good? What will you try next time?",
      "review.title": "3-step review (wait 1 full day after recording)",
      "week.cta": "12-week plan",
      "week.ctaSub": "Pick weekly focus, check in daily, record & review.",
      "week.open": "Open 12-week dashboard",
      "history.title": "History / Audit",
      "history.sub": "Past recordings and completion stats stored locally in this browser.",
      "history.back": "← Back",
      "plan.title": "12-Week Improvement Plan",
      "plan.sub": "One element at a time. Record & review weekly. Continue or advance.",
      "plan.current": "Current week",
      "plan.pick": "Pick element",
      "plan.start": "Start / continue week",
      "plan.checkin": "Daily check-in",
      "plan.checkins": "Check-ins",
      "plan.review": "End-of-week record & review",
      "plan.reviewSub": "After ~7 days of focus, record a short sample, review it, then decide:",
      "plan.notes": "Review notes",
      "plan.notesPh": "What improved? What still needs work?",
      "plan.improved": "It improved → new element",
      "plan.continue": "Not yet → same element",
      "plan.completed": "Elements improved",
      "plan.reviews": "Review history",
      "footer.base": "Based on",
      "footer.rest":
        "· Personal practice material · In-browser piano (mid-lower range) · Data stays on your device.",
      "next": "Next exercise →",
      "toast.mic": "Microphone permission needed",
      "toast.pianoOnly": "Piano playing · allow the mic to hear your voice",
      "toast.pianoFail": "Could not start piano · press Start again",
      "toast.live": "Live · {mode}",
      "toast.liveRec": "Live · {mode} · recording",
      "toast.stopped": "Practice stopped",
      "leave.title": "Save this practice?",
      "leave.body":
        "You practiced a meaningful part of this exercise. Save your progress or discard it?",
      "leave.stats": "Time practiced: {done} of {total} ({pct}%)",
      "leave.save": "Save progress",
      "leave.discard": "Discard",
      "leave.stay": "Keep practicing",
      "leave.scrollSave": "Review the metrics and tap Save session",
      "leave.discarded": "Practice discarded",
      "toast.hold": "Hold logged: {s}s",
      "toast.saved": "Session saved",
      "toast.pianoStop": "Piano stopped",
      "badge.vocal": "Vocal",
      "badge.singing": "Singing",
      "badge.basic": "basic",
      "badge.advanced": "advanced",
      "ex.v1-diction": "Better Diction",
      "ex.v2-volume": "Maintain Volume",
      "ex.v3-soft-palate": "Lift Soft Palate",
      "ex.v4-articulation-pen": "Improve Articulation (Pen)",
      "ex.v5-neutral-ears": "Neutral Ears (Persona & Story)",
      "ex.v6-connect": "How to Connect",
      "ex.v7-record-review": "Record & Review",
      "ex.v8-fluency-metaphors": "Improve Fluency (Metaphors)",
      "ex.v9-12-week": "12-Week Improvement Plan",
      "ex.v10-power-pause": "Power of the Pause",
      "ex.v11-kill-fillers": "Kill the Fillers",
      "ex.v12-melodic-speech": "Melodic Speech & Tonality",
      "ex.v13-volume-ladder": "Volume Ladder",
      "ex.v14-pace-variation": "Pace Variation for Impact",
      "ex.v15-gestures": "Hand Gestures & Body Language",
      "ex.v16-facial-expression": "Facial Expressiveness",
      "ex.v17-strategic-concision": "Strategic Concision",
      "ex.v18-story-peak": "Storytelling Peak Emotion",
      "ex.v19-authority-close": "Authority Close (Cadence)",
      "ex.v20-energy-match": "Energy Match & Charisma",
      "ex.s1-vocal-fry": "Vocal Fry → Sustained /A/",
      "ex.s2-solfege-chords": "/A/ Solfège on Chord Progressions",
      "ex.s3-song-stanzas": "Song stanzas (your songs)",
      "ex.s4-lip-trills": "Lip Trills (SOVT Warm-up)",
      "ex.s5-sirens": "Sirens / Pitch Glides",
      "ex.s6-straw": "Straw Phonation (SOVT)",
      "ex.s7-humming": "Humming Resonance",
      "ex.s8-breath-support": "Breath Support (Sustained S)",
      "ex.s9-pitch-match": "Single-Note Pitch Match",
      "ex.s10-five-note": "Five-Note Scale (/A/)",
      "ex.s11-dynamics": "Dynamic Swells on One Note",
      "ex.s12-easy-onset": "Easy Onset Coordination",
      "ex.s13-arpeggio-match": "Arpeggio Pitch Match",
      "ex.s14-staccato-legato": "Staccato vs Legato Control"
    }
  };

  const I18n = {
    lang: "es",
    strings: STRINGS,
    t(key, vars) {
      const table = this.strings[this.lang] || this.strings.es;
      let s = table[key] ?? this.strings.en[key] ?? this.strings.es[key] ?? key;
      if (vars) {
        Object.keys(vars).forEach((k) => {
          s = s.replace(new RegExp(`\\{${k}\\}`, "g"), String(vars[k]));
        });
      }
      return s;
    },
    exTitle(ex) {
      if (!ex) return "";
      const key = "ex." + ex.id;
      const tr = this.t(key);
      return tr === key ? ex.title : tr;
    },
    setLang(lang) {
      this.lang = lang === "en" ? "en" : "es";
      try {
        localStorage.setItem("vt_lang", this.lang);
      } catch {
        /* ignore */
      }
      document.documentElement.lang = this.lang === "es" ? "es" : "en";
      this.applyDom();
      if (typeof this.onChange === "function") this.onChange(this.lang);
    },
    init() {
      let saved = "es";
      try {
        saved = localStorage.getItem("vt_lang") || "es";
      } catch {
        /* ignore */
      }
      this.lang = saved === "en" ? "en" : "es";
      document.documentElement.lang = this.lang === "es" ? "es" : "en";
      this.applyDom();
    },
    applyDom() {
      document.querySelectorAll("[data-i18n]").forEach((el) => {
        const key = el.getAttribute("data-i18n");
        if (!key) return;
        const val = this.t(key);
        if (el.tagName === "OPTION") {
          el.textContent = val;
        } else if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          if (el.hasAttribute("data-i18n-placeholder")) el.placeholder = val;
        } else if (el.hasAttribute("data-i18n-html")) {
          el.innerHTML = val;
        } else {
          el.textContent = val;
        }
      });
      document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
        const key = el.getAttribute("data-i18n-placeholder");
        if (key) el.placeholder = this.t(key);
      });
      document.querySelectorAll("[data-i18n-title]").forEach((el) => {
        const key = el.getAttribute("data-i18n-title");
        if (key) el.title = this.t(key);
      });
      const title = this.t("meta.title");
      if (title) document.title = title;
      const meta = document.querySelector('meta[name="description"]');
      if (meta) meta.setAttribute("content", this.t("meta.desc"));
      const langBtn = document.getElementById("btn-lang");
      if (langBtn) langBtn.textContent = this.t("nav.lang");
    }
  };

  global.VTI18n = I18n;
  global.t = (k, v) => I18n.t(k, v);
})(window);
