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
      rungs: [5, 10, 20, 25, 30],
      cue: "Nose inhale → even SH. Clear 5→10→20→25→30s rungs. Air only, no pitch.",
      cueEs: "Inhala nariz → SH pareja. Peldaños 5→10→20→25→30s. Solo aire, sin tono.",
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
      autoPiano: false,
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
