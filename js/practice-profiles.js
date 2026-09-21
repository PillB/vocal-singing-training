/**
 * Per-exercise practice profiles — pedagogy-specific, not one-size-fits-all.
 * Applied onto VT_EXERCISES after load.
 */
(function (global) {
  "use strict";

  const P = {
    /* —— Vocal basic —— */
    "v1-diction": {
      mode: "rateLadder",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: false,
      phases: [
        { label: "Rate 5 · comfortable", sec: 75 },
        { label: "Rate 6 · slightly faster", sec: 75 },
        { label: "Rate 7 · brisk", sec: 75 },
        { label: "Rate 8 · challenge", sec: 75 }
      ],
      cue: "Over-articulate the same page. Rate phases advance automatically.",
      cueEs: "Sobre-articula la misma página. Las fases de ritmo avanzan solas.",
      metricHints: { duration: "fromTimerMin" }
    },
    "v2-volume": {
      mode: "volumeSteady",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: false,
      cue: "Keep energy even from 1→10. Watch the volume lane — avoid fading at the end.",
      cueEs: "Mantén la energía pareja del 1 al 10. Mira el carril de volumen — evita apagarte al final.",
      metricHints: { cycles: "breathCycles", consistency: "volumeConsistency" }
    },
    "v3-soft-palate": {
      mode: "countPace",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: false,
      cue: "Tongue out, tall space, count toward 60. Comfort over force.",
      cueEs: "Lengua afuera, espacio alto, cuenta hacia 60. Comodidad antes que fuerza.",
      metricHints: {}
    },
    "v4-articulation-pen": {
      mode: "articulationContrast",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      phases: [
        { label: "With pen · count 1–60", sec: 90 },
        { label: "Pen off · feel the ease", sec: 45 }
      ],
      cue: "Phase 1: pen in mouth. Phase 2: remove pen and notice clarity.",
      cueEs: "Fase 1: bolígrafo en la boca. Fase 2: quítalo y nota la claridad.",
      metricHints: {}
    },
    "v5-neutral-ears": {
      mode: "recordOnly",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      cue: "Deliver persona + story. Recording starts with practice — review later with neutral ears.",
      cueEs: "Entrega persona + historia. La grabación empieza con la práctica — revisa después con oídos neutrales.",
      metricHints: {}
    },
    "v6-connect": {
      mode: "speechEnergy",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: false,
      phases: [
        { label: "Scenario 1 · colleague", sec: 120 },
        { label: "Scenario 2 · acquaintance", sec: 120 },
        { label: "Scenario 3 · new contact", sec: 120 }
      ],
      cue: "Aim for more listening than speaking. Silence ratio is a friend.",
      cueEs: "Busca más escucha que habla. El silencio es tu aliado.",
      metricHints: { presence: "listenBias" }
    },
    "v7-record-review": {
      mode: "reviewSession",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      cue: "Record 5–10 min improv. Leave one full day before the 3-step review.",
      cueEs: "Graba 5–10 min de impro. Espera un día completo antes de la revisión en 3 pasos.",
      metricHints: {}
    },
    "v8-fluency-metaphors": {
      mode: "metronomeSpeech",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: false,
      phases: [
        { label: "Topic 1 · metaphor", sec: 60 },
        { label: "Topic 2 · metaphor", sec: 60 },
        { label: "Topic 3 · metaphor", sec: 60 },
        { label: "Topic 4 · metaphor", sec: 60 },
        { label: "Topic 5 · metaphor", sec: 60 }
      ],
      cue: "One fresh metaphor per topic. Speak it out loud.",
      cueEs: "Una metáfora nueva por tema. Dila en voz alta.",
      metricHints: { metaphorCount: "phaseCount" }
    },
    "v9-12-week": {
      mode: "weekPlan",
      showPitch: false,
      showHold: false,
      showLevel: false,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: false,
      cue: "Open the 12-week dashboard — one element, daily check-ins, weekly record/review.",
      cueEs: "Abre el panel de 12 semanas — un elemento, registro diario, grabación/revisión semanal.",
      metricHints: {}
    },
    /* —— Vocal advanced —— */
    "v10-power-pause": {
      mode: "pauseDetect",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      minPauseSec: 0.8,
      cue: "After key ideas, land in silence. We count pauses ≥0.8s — not filler sounds.",
      cueEs: "Después de ideas clave, aterriza en silencio. Contamos pausas ≥0,8s — no rellenos.",
      metricHints: { pauseCount: "pauseEvents" }
    },
    "v11-kill-fillers": {
      mode: "fillerDetect",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      minPauseSec: 0.7,
      cue: "Tap when you catch a filler. Prefer “Paused instead.” Auto pauses are secondary.",
      cueEs: "Toca al atrapar un relleno. Prefiere “Pausé en su lugar”. Las pausas auto son secundarias.",
      metricHints: {}
    },
    "v12-melodic-speech": {
      mode: "pitchContour",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      cue: "Use pitch range for musical speech — variety, not note-matching drills.",
      cueEs: "Usa el rango de tono para un habla musical — variedad, no ejercicios de nota exacta.",
      metricHints: { variety: "pitchRangeScale" }
    },
    "v13-volume-ladder": {
      mode: "volumeLadder",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: false,
      ladder: [
        { label: "1 Whisper", target: 0.12 },
        { label: "2 Soft", target: 0.22 },
        { label: "3 Conversational", target: 0.35 },
        { label: "4 Projected", target: 0.5 },
        { label: "5 Full room", target: 0.65 }
      ],
      stepSec: 8,
      cue: "Climb whisper → full room without strain. Match each level’s target band.",
      cueEs: "Sube de susurro a sala llena sin forzar. Entra en la franja de cada nivel.",
      metricHints: { ladderReps: "ladderCycles" }
    },
    "v14-pace-variation": {
      mode: "keyPointPace",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      cue: "Tap “Key point” when you slow down for impact. Log 3 intentional slow-downs.",
      cueEs: "Toca “Punto clave” cuando bajes el ritmo por impacto. Registra 3 bajadas intencionales.",
      metricHints: { keySlowdowns: "keyPoints" }
    },
    "v15-gestures": {
      mode: "gestureReps",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      cue: "3 gesture types: size · count · location. Record, then review muted first.",
      cueEs: "3 tipos de gesto: tamaño · cuenta · lugar. Graba y revisa primero en silencio.",
      metricHints: {}
    },
    "v16-facial-expression": {
      mode: "facePhases",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      phases: [
        { label: "Curiosity face", sec: 40 },
        { label: "Surprise face", sec: 40 },
        { label: "Resolve / warmth", sec: 40 }
      ],
      cue: "Curiosity → surprise → resolve on your face. Review muted after.",
      cueEs: "Curiosidad → sorpresa → resolución en la cara. Revisa en silencio después.",
      metricHints: {}
    },
    "v17-strategic-concision": {
      mode: "concisionGate",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      questions: 5,
      preSilenceSec: 2.5,
      cue: "Receive → breathe (~2.5s silence) → answer in ≤3 sentences.",
      cueEs: "Recibe → respira (~2,5s de silencio) → responde en ≤3 oraciones.",
      metricHints: { questions: "questionCount", pauseBefore: "gateSuccess" }
    },
    "v18-story-peak": {
      mode: "storyTimer",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      phases: [
        { label: "Setup", sec: 40 },
        { label: "Peak emotion", sec: 50 },
        { label: "Point / takeaway", sec: 30 }
      ],
      cue: "Setup short · peak vivid · land the point. Mark peak when you hit it.",
      cueEs: "Inicio corto · pico vivo · cierra el punto. Marca el pico cuando llegues.",
      metricHints: {}
    },
    "v19-authority-close": {
      mode: "authorityLand",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      claims: 5,
      landSilenceSec: 1.0,
      cue: "State a claim, land downward, hold ~1s silence. No ‘you know?’ tags.",
      cueEs: "Di una afirmación, cierra hacia abajo, guarda ~1s de silencio. Sin “¿sabes?”.",
      metricHints: { landed: "landCount" }
    },
    "v20-energy-match": {
      mode: "energyMatch",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      stepSec: 30,
      cue: "Same message at Low → Medium → High. Volume + pace + face — not just loudness.",
      cueEs: "El mismo mensaje en Bajo → Medio → Alto. Volumen + ritmo + cara — no solo gritar.",
      metricHints: {}
    },
    /* —— Singing basic —— */
    "s1-vocal-fry": {
      mode: "pitchHold",
      showPitch: true,
      showHold: true,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      refPitch: "A2",
      cue: "Fry → clear /A/. Hold ≥2s logs automatically. No note-challenge game.",
      cueEs: "Fry → /A/ clara. Sostenidos ≥2s se registran solos. No es un juego de notas.",
      metricHints: { maxHold: "bestHold" }
    },
    "s2-solfege-chords": {
      mode: "pitchChord",
      showPitch: true,
      showHold: true,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      cue: "Sing /A/ on chord tones. Piano loops with sustain. Track reps toward 25.",
      cueEs: "Canta /A/ en los tonos del acorde. El piano hace bucle con sostenido. Meta ~25 reps.",
      metricHints: { reps: "repCount" }
    },
    "s3-song-stanzas": {
      mode: "pitchSong",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: true,
      cue: "Finish each phrase without mid-breath. Dose air; piano under you; mark phrase-complete.",
      cueEs: "Termina cada frase sin respirar a mitad. Dosifica el aire; marca frase completa.",
      metricHints: { phraseBreath: "phraseOk" }
    },
    "s15-sh-air-ladder": {
      mode: "shAirLadder",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: false,
      /** Soft unvoiced SH — Space hold supplements air detection; max mic sens helps */
      allowManualSound: true,
      manualSoundKind: "air",
      rungs: [5, 10, 20, 25, 30],
      cue: "Nose inhale → even SH. Climb 5→10→20→25→30s. Air only. Raise Mic or hold Space if the timer doesn’t move.",
      cueEs: "Inhala por la nariz → SH pareja. Peldaños 5→10→20→25→30 s. Solo aire. Si el contador no se mueve, sube Mic o mantén Espacio.",
      metricHints: { rungs: "cleared", maxSH: "best" }
    },
    "s16-major-scale-coord": {
      mode: "scaleSteps",
      majorScale: true,
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      cue: "Major scale on /A/: listen, then sing each step. Coordinate air + closure + pitch.",
      cueEs: "Escala mayor en /A/: escucha, luego canta cada paso. Coordina aire + cierre + afinación.",
      metricHints: { roots: "rootCount" }
    },
    /* —— Singing advanced —— */
    "s4-lip-trills": {
      mode: "sovtFlow",
      variant: "trill",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      cue: "Steady air for lip bubbles. Evenness bar — mark transfer to /A/ after.",
      cueEs: "Aire estable para burbujas de labios. Barra de uniformidad — marca el paso a /A/ después.",
      metricHints: {}
    },
    "s5-sirens": {
      mode: "sirenRange",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      // Piano on so Empezar plays mid-range ref (G2) under the glide
      autoPiano: true,
      refPitch: "G2",
      autoRecord: false,
      cue: "Smooth glides. We track pitch range rope and siren count — not single-note locks.",
      cueEs: "Deslizamientos suaves. Seguimos el rango y el conteo de sirenas — no bloqueos de nota única.",
      metricHints: { sirens: "sirenCount", smoothness: "rangeSmooth" }
    },
    "s6-straw": {
      mode: "sovtFlow",
      variant: "straw",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      cue: "Straw only — steady air, soft cheeks. Mark transfer to open vowel after.",
      cueEs: "Solo pajita — aire estable, mejillas suaves. Marca el paso a vocal abierta después.",
      metricHints: {}
    },
    "s7-humming": {
      mode: "humTargets",
      showPitch: true,
      showHold: true,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      refPitch: "D3",
      modeCue: "hum",
      cue: "Hum through soft pitch targets. Lip buzz, no challenge scoring.",
      cueEs: "Tararea hacia objetivos suaves. Zumbido en labios, sin puntuación de reto.",
      metricHints: {}
    },
    "s8-breath-support": {
      mode: "breathS",
      showPitch: true,
      showHold: true,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      /** Space / air assist for unvoiced S phase (a11y) — allowed even with pitch canvas */
      manualSoundKind: "air",
      allowManualSound: true,
      cue: "Phase 1: even S (or SH). Phase 2: same support on /A/. Pair with SH ladder warm-up.",
      cueEs: "Fase 1: S (o SH) pareja. Fase 2: mismo soporte en /A/. Combina con escalera SH.",
      metricHints: { maxS: "bestS", transferA: "bestA" }
    },
    "s9-pitch-match": {
      mode: "pitchMatch",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: true,
      autoPiano: true,
      autoRecord: false,
      cue: "Listen first, then match. Lock 8 notes in the green lane — full pitch game.",
      cueEs: "Escucha primero, luego afina. Bloquea 8 notas en el carril verde.",
      metricHints: { matches: "locks", accuracy: "gameAccuracy", precision: "gameCombo" }
    },
    "s10-five-note": {
      mode: "scaleSteps",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      cue: "1–2–3–4–5–4–3–2–1 step targets. Short lock per step, not free challenge.",
      cueEs: "Objetivos 1–2–3–4–5–4–3–2–1. Bloqueo corto por paso, no reto libre.",
      metricHints: { roots: "rootCount" }
    },
    "s11-dynamics": {
      mode: "dynamicSwell",
      showPitch: true,
      showHold: true,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      cue: "Swell soft→medium→soft. Watch pitch stay stable while level moves.",
      cueEs: "Crescendo suave→medio→suave. Que la afinación se mantenga al mover el volumen.",
      metricHints: { swells: "swellCount", pitchStable: "pitchStableScale" }
    },
    "s12-easy-onset": {
      mode: "onsetReps",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      targetReps: 10,
      cue: "Easy onsets only. We flag hard attacks (RMS spikes) vs balanced starts.",
      cueEs: "Solo ataques suaves. Marcamos ataques duros (picos de energía) vs inicios equilibrados.",
      metricHints: { easyOnsets: "easyOnsetCount" }
    },
    "s13-arpeggio-match": {
      mode: "pitchChord",
      showPitch: true,
      showHold: true,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoArpeggio: true,
      autoRecord: false,
      cue: "Arpeggio + sustain. Match chord tones as they roll.",
      cueEs: "Arpegio + sostenido. Acompaña los tonos del acorde al salir.",
      metricHints: { progressions: "repCount" }
    },
    "s14-staccato-legato": {
      mode: "staccatoLegato",
      showPitch: true,
      showHold: true,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      phases: [
        { label: "Staccato rounds", sec: 90 },
        { label: "Legato line", sec: 90 },
        { label: "Staccato again", sec: 60 },
        { label: "Legato again", sec: 60 }
      ],
      cue: "Short bounce vs connected line — note lengths auto-classify after holds.",
      cueEs: "Rebote corto vs línea conectada — las duraciones se clasifican solas.",
      metricHints: {}
    },
    /* —— Singing · class course (placement & resonance) —— */
    "s17-jaw-neck-release": {
      mode: "releaseFlow",
      // Clock-driven and silent: runs with or without a microphone
      timeDriven: true,
      showPitch: false,
      showHold: false,
      showLevel: false,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: false,
      phases: [
        {
          label: "Jaw hangs",
          labelEs: "Mandíbula suelta",
          sec: 25,
          cue: "Two fingers on the hinge — let the mouth fall open with no push.",
          cueEs: "Dos dedos en la bisagra — deja caer la boca sin empujar."
        },
        {
          label: "Slow neck half-circles",
          labelEs: "Medios círculos de cuello",
          sec: 30,
          cue: "Half circles, one side then the other. Never roll the head back.",
          cueEs: "Medios círculos, un lado y luego el otro. Nunca eches la cabeza atrás."
        },
        {
          label: "Loose chewing hum",
          labelEs: "Masticar y tararear",
          sec: 25,
          cue: "Chew an imaginary gum, lips closed, soft hum, tongue loose.",
          cueEs: "Mastica un chicle imaginario, labios cerrados, tarareo suave, lengua floja."
        },
        {
          label: "Three silent pre-yawns",
          labelEs: "Tres pre-bostezos en silencio",
          sec: 20,
          cue: "The inside grows, the face stays calm. Stop before the yawn.",
          cueEs: "El interior crece, la cara tranquila. Párate antes del bostezo."
        }
      ],
      cue: "Silent release before you sing. Phases advance on their own.",
      cueEs: "Soltar en silencio antes de cantar. Las fases avanzan solas.",
      metricHints: {}
    },
    "s18-costal-breath": {
      mode: "breathCycle",
      // The level lane is feedback when a mic is there, never a requirement
      timeDriven: true,
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: false,
      pattern: { in: 4, hold: 2, out: 8 },
      cue: "Inhale 4 · hold 2 · even exhale 8. Low ribs and belly move, shoulders do not.",
      cueEs: "Inhala 4 · retén 2 · espira pareja 8. Costillas bajas y abdomen se mueven, los hombros no.",
      metricHints: {}
    },
    "s19-soft-palate-surprise": {
      mode: "openSpace",
      showPitch: true,
      showHold: true,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      refPitch: "C3",
      minHoldMs: 1500,
      phases: [
        {
          label: "Surprise face",
          labelEs: "Cara de sorpresa",
          sec: 20,
          cue: "Surprising news — the jaw drops on its own. No sound yet.",
          cueEs: "Una noticia sorprendente — la mandíbula cae sola. Todavía sin sonido."
        },
        {
          label: "Stop before the yawn",
          labelEs: "Párate antes del bostezo",
          sec: 20,
          cue: "The instant before a yawn. Hold that inner space.",
          cueEs: "El instante antes de bostezar. Sostén ese espacio interno."
        },
        {
          label: "Sing in that space",
          labelEs: "Canta en ese espacio",
          sec: 45,
          sound: true,
          cue: "Comfortable /A/ from inside the chapel. Hold ≥1.5s to log it.",
          cueEs: "/A/ cómoda desde dentro de la capilla. Sostén ≥1,5 s para registrarlo."
        },
        {
          label: "Closed, then open",
          labelEs: "Cerrado, luego abierto",
          sec: 25,
          sound: true,
          cue: "One phrase with the space closed, one with it open. Hear the difference.",
          cueEs: "Una frase con el espacio cerrado, otra abierto. Escucha la diferencia."
        },
        {
          label: "Phrase with the space",
          labelEs: "Una frase con el espacio",
          sec: 35,
          sound: true,
          cue: "A line you know, keeping the pre-yawn space all the way through.",
          cueEs: "Una frase que sepas, manteniendo el espacio de pre-bostezo hasta el final."
        }
      ],
      cue: "Surprise → pre-yawn → sound from that space. Holds log while a sounding phase runs.",
      cueEs: "Sorpresa → pre-bostezo → sonido desde ese espacio. Los sostenidos cuentan en las fases con sonido.",
      metricHints: { openHolds: "holds" }
    },
    "s20-five-vowels": {
      mode: "vowelLadder",
      ownsTarget: true,
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      refPitch: "D3",
      vowels: ["I", "E", "A", "O", "U"],
      secPerVowel: 4,
      cue: "I–E–A–O–U on one pitch. The vowel changes shape, not the space.",
      cueEs: "I–E–A–O–U en una sola nota. La vocal cambia de forma, no el espacio.",
      metricHints: { rounds: "roundCount" }
    },
    "s21-chest-resonance": {
      mode: "resonanceZone",
      // The mode walks its own note list; keep the generic refPitch off the target
      ownsTarget: true,
      qualityMetric: "body",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      refPitch: "A2",
      zones: [
        {
          key: "low",
          label: "Low · chest",
          labelEs: "Graves · pecho",
          notes: ["C3", "B2", "A2", "G2", "A2", "B2"],
          cue: "Aim the sound lower, soft palate open. Do not press the voice down.",
          cueEs: "Dirige el sonido más abajo, paladar blando abierto. No empujes la voz hacia abajo."
        }
      ],
      cue: "Low targets with body. Aim lower — never press.",
      cueEs: "Objetivos graves con cuerpo. Dirige más abajo — nunca aprietes.",
      metricHints: { zoneTargets: "targets" }
    },
    "s22-mid-voice-hola": {
      mode: "resonanceZone",
      // The mode walks its own note list; keep the generic refPitch off the target
      ownsTarget: true,
      qualityMetric: "steadiness",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      refPitch: "D3",
      zones: [
        {
          key: "mid",
          label: "Middle · speech",
          labelEs: "Medios · habla",
          notes: ["C3", "D3", "E3", "F3", "E3", "D3"],
          cue: "'Hola, hola' the way you would say it in the room. Nothing added.",
          cueEs: "«Hola, hola» como lo dirías en la sala. Sin añadir nada."
        }
      ],
      cue: "Middle zone on 'Hola'. It should feel as easy as talking.",
      cueEs: "Zona media con «Hola». Debe sentirse tan fácil como hablar.",
      metricHints: { zoneTargets: "targets" }
    },
    "s23-mask-ya": {
      mode: "resonanceZone",
      // The mode walks its own note list; keep the generic refPitch off the target
      ownsTarget: true,
      qualityMetric: "buzz",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      refPitch: "G3",
      zones: [
        {
          key: "mask",
          label: "Mask · bright",
          labelEs: "Máscara · brillante",
          notes: ["E3", "G3", "A3", "G3", "B3", "A3"],
          cue: "'YA, YA' deliberately nasal. Find the buzz in the nose and forehead.",
          cueEs: "«YA, YA» a propósito nasal. Encuentra el zumbido en nariz y frente."
        }
      ],
      cue: "Exaggerate the nasal 'YA' to find the mask, then balance the colour back.",
      cueEs: "Exagera el «YA» nasal para encontrar la máscara, luego equilibra el color.",
      metricHints: { zoneTargets: "targets" }
    },
    "s24-nana-high": {
      mode: "resonanceZone",
      // The mode walks its own note list; keep the generic refPitch off the target
      ownsTarget: true,
      qualityMetric: "stability",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      refPitch: "G3",
      zones: [
        {
          key: "high",
          label: "High · NANA",
          labelEs: "Agudos · NANA",
          notes: ["G3", "A3", "B3", "C4", "B3", "A3"],
          cue: "Lean on the N, start softer than you think. Position first, power later.",
          cueEs: "Apóyate en la N, empieza más suave de lo que crees. Primero el lugar, después la fuerza."
        }
      ],
      cue: "'NANA' on rising targets, minimum pressure. If a note misses, lean on the N.",
      cueEs: "«NANA» en objetivos ascendentes, mínima presión. Si falla una nota, apóyate en la N.",
      metricHints: { zoneTargets: "targets" }
    },
    "s25-zone-tour": {
      mode: "resonanceZone",
      // The mode walks its own note list; keep the generic refPitch off the target
      ownsTarget: true,
      qualityMetric: "transitions",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      refPitch: "C3",
      zones: [
        {
          key: "low",
          label: "Low",
          labelEs: "Graves",
          sec: 45,
          notes: ["C3", "B2", "A2", "G2"],
          cue: "Body and space. Aim lower without pressing.",
          cueEs: "Cuerpo y espacio. Dirige más abajo sin apretar."
        },
        {
          key: "mid",
          label: "Middle",
          labelEs: "Medios",
          sec: 45,
          notes: ["C3", "D3", "E3", "F3"],
          cue: "Back to the speaking voice. No extra weight.",
          cueEs: "Vuelve a la voz hablada. Sin peso extra."
        },
        {
          key: "high",
          label: "High",
          labelEs: "Agudos",
          sec: 45,
          notes: ["G3", "A3", "B3", "C4"],
          cue: "Light and forward on the N. Do not drag the middle up.",
          cueEs: "Ligero y adelante con la N. No arrastres la voz media hacia arriba."
        }
      ],
      cue: "Low → middle → high in one pass. The seam between zones is the exercise.",
      cueEs: "Graves → medios → agudos en una pasada. La costura entre zonas es el ejercicio.",
      metricHints: { zoneTargets: "targets" }
    },
    "s26-placement-compare": {
      mode: "placementAB",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: true,
      phases: [
        {
          label: "Take A · plain",
          labelEs: "Toma A · sin intención",
          sec: 45,
          cue: "Sing the phrase the way it comes out. Mark the take when you finish it.",
          cueEs: "Canta la frase como te salga. Marca la toma al terminarla."
        },
        {
          label: "Take B · placed",
          labelEs: "Toma B · colocada",
          sec: 45,
          cue: "Same melody, same key, now with the open space and the zone placement.",
          cueEs: "Misma melodía, misma tonalidad, ahora con el espacio abierto y la colocación de la zona."
        },
        {
          label: "Listen back",
          labelEs: "Escucha las dos",
          sec: 30,
          cue: "Not which is prettier — which has more ring and width.",
          cueEs: "No cuál es más bonita — cuál tiene más resonancia y amplitud."
        }
      ],
      cue: "Two takes of one phrase, plain then placed, then listen back and keep one.",
      cueEs: "Dos tomas de una frase, sin intención y colocada, luego escucha y quédate con una.",
      metricHints: {}
    },
    /*
     * The mode picks every target itself and walks the root, so `ownsTarget`
     * is not optional here: this exercise declares `audio.refPitch`, and
     * without the flag both the highway bootstrap and the reference sound in
     * js/app.js would pull the target back to C3 on every step.
     */
    "s27-lip-trill-solfege": {
      mode: "trillSolfege",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      refPitch: "C3",
      ownsTarget: true,
      rootMidi: 48,
      topRootMidi: 55,
      cue: "Trill 1-2-3-4-5-4-3-2-1 on the bubble. The root walks up after each clean pattern and back down at the top.",
      cueEs: "Trina 1-2-3-4-5-4-3-2-1 sobre el burbujeo. La raíz sube tras cada pasada limpia y baja al llegar arriba.",
      metricHints: { patterns: "patternCount" }
    }
  };

  function applyProfiles() {
    if (!global.VT_EXERCISES) return;
    ["vocal", "singing"].forEach((track) => {
      (global.VT_EXERCISES[track] || []).forEach((ex) => {
        const prof = P[ex.id];
        if (prof) {
          ex.practice = Object.assign(
            {
              showLevel: true,
              pitchChallenge: false,
              autoPiano: false,
              autoRecord: false,
              showPitch: false,
              showHold: false
            },
            prof
          );
        } else {
          // Safe fallback from audio flags
          ex.practice = {
            mode: ex.audio?.pitchViz ? "pitchHold" : "recordOnly",
            showPitch: !!ex.audio?.pitchViz,
            showHold: !!ex.holdLogger,
            showLevel: true,
            pitchChallenge: false,
            autoPiano: !!ex.audio?.piano,
            autoRecord: !!ex.audio?.record,
            cue: "Start practice to begin.",
      cueEs: "Pulsa Empezar para comenzar."
          };
        }
      });
    });
  }

  applyProfiles();
  global.VT_PRACTICE_PROFILES = P;
  global.VTApplyPracticeProfiles = applyProfiles;
})(window);
