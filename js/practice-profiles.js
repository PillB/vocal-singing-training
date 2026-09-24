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
      cue: "Over-articulate the same page. The first rung measures your own pace; each next rung is a step faster. Rungs advance on their own.",
      cueEs: "Sobre-articula la misma página. El primer peldaño mide tu propio ritmo; cada peldaño sube un poco. Avanzan solos.",
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
      cue: "Count 1→10 on one breath at one level: the end as strong as the start. Keep the same distance from the mic.",
      cueEs: "Cuenta del 1 al 10 en una respiración a un mismo nivel: el final tan firme como el inicio. Misma distancia al micrófono.",
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
      cue: "Curiosity loops: ask in your turn, stay quiet in theirs and imagine the answer. Leave with one real fact.",
      cueEs: "Bucles de curiosidad: pregunta en tu turno, calla en el suyo e imagina la respuesta. Llévate un dato real.",
      metricHints: {}
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
      cue: "3 rounds on one topic: in round 1 tap “Caught a filler”; in rounds 2–3 close your mouth, pause, and tap “Paused instead”.",
      cueEs: "3 rondas sobre un tema: en la 1 toca «Noté un relleno»; en la 2 y la 3 cierra la boca, pausa y toca «Pausé en su lugar».",
      metricHints: {}
    },
    "v12-melodic-speech": {
      mode: "pitchContour",
      // Speech melody is drawn relative to your own usual pitch in the stage,
      // not as notes on the singing highway (and so in the first screen)
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      cue: "Flat baseline first, then melody: lift key words, land each ending. Variety, not note-matching.",
      cueEs: "Primero una toma plana, luego melodía: eleva palabras clave y cierra cada final. Variedad, no notas exactas.",
      metricHints: {}
    },
    "v13-volume-ladder": {
      mode: "volumeLadder",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: false,
      // Levels are relative to the learner (dB against their own treads), so
      // there are no absolute targets here: only the order of the steps.
      ladder: [
        { label: "1 Whisper", labelEs: "1 Susurro" },
        { label: "2 Soft", labelEs: "2 Suave" },
        { label: "3 Conversational", labelEs: "3 Conversación" },
        { label: "4 Projected", labelEs: "4 Proyectada" },
        { label: "5 Full room", labelEs: "5 Sala llena" }
      ],
      // Up 1→5, back down 5→3→1 (the exercise's steps), then a 60 s story
      sequence: [0, 1, 2, 3, 4, 2, 0],
      stepSec: 8,
      reps: 3,
      storySec: 60,
      cue: "Climb 1→5 and back 5→3→1 with the same sentence: each step clearly louder than the last, same distance from the mic. Then a 60 s story with 3+ levels.",
      cueEs: "Sube del 1 al 5 y baja 5→3→1 con la misma frase: cada escalón claramente más fuerte, misma distancia al micrófono. Luego una historia de 60 s con 3 niveles o más.",
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
      keyPoints: 3,
      minPauseSec: 0.7,
      cue: "3 takes: one even pace · slow on each key idea (tap “Key point”) · a brake (pause) before it. Aim for 3 anchors.",
      cueEs: "3 tomas: un solo ritmo · lento en cada idea clave (toca «Punto clave») · un freno (pausa) antes. Busca 3 anclas.",
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
      // A silence this long after speaking closes the answer
      closeSilenceSec: 2,
      // A soft time guide for "≤3 sentences", never a limit
      answerGuideSec: [20, 30],
      cue: "Receive → breathe (~2.5s silence) → answer in ≤3 sentences.",
      cueEs: "Recibe → respira (~2,5s de silencio) → responde en ≤3 oraciones.",
      metricHints: { questions: "questionCount" }
    },
    "v18-story-peak": {
      mode: "storyTimer",
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      // Context → tension → peak → point in ~90 s, as the steps lay it out.
      // A guide: "Next part" moves on early; running over is shown, not scolded.
      phases: [
        { key: "context", label: "Context", labelEs: "Contexto", sec: 20, hint: "Context: who, where — keep it short", hintEs: "Contexto: quién y dónde, corto" },
        { key: "tension", label: "Tension", labelEs: "Tensión", sec: 25, hint: "Tension: what was at stake", hintEs: "Tensión: qué estaba en juego" },
        { key: "peak", label: "Peak", labelEs: "Pico", sec: 30, hint: "The peak: a little slower, a little stronger, a pause", hintEs: "El pico: un poco más lento, más intenso, una pausa" },
        { key: "point", label: "Point", labelEs: "Aprendizaje", sec: 15, hint: "The point in one still sentence", hintEs: "El aprendizaje en una frase quieta" }
      ],
      // The parts are a pacer: they still run if the microphone is refused
      timeDriven: true,
      cue: "Context short · peak vivid · land the point. Mark the peak when you reach it.",
      cueEs: "Contexto corto · pico vivo · cierra con el aprendizaje. Marca el pico cuando llegues.",
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
      // Low → Medium → High → Lead (+10 % over Medium); "Next take" moves on early
      stepSec: 30,
      cue: "Same message Low → Medium → High, then lead 10% above Medium. The mic hears volume, pace and melody; face and gesture are in the recording.",
      cueEs: "El mismo mensaje en Baja → Media → Alta y luego guía un 10 % sobre la media. El micrófono oye volumen, ritmo y melodía; cara y gestos, en la grabación.",
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
      cue: "Fry → clear /A/. The highway shows when the tone turns steady; 2 s clear holds count. No note-challenge game.",
      cueEs: "Fry → /A/ clara. La autopista muestra cuándo el tono se vuelve estable; cuentan los sostenidos claros de 2 s. No es un juego de notas.",
      metricHints: { maxHold: "bestClearHold" }
    },
    "s2-solfege-chords": {
      mode: "pitchChord",
      showPitch: true,
      showHold: true,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      cue: "Sing /A/ on the note the piano plays. A note counts when held 1 s inside the band; the next ones wait to the right. Goal ~25.",
      cueEs: "Canta /A/ en la nota que toca el piano. Cuenta al sostenerla 1 s dentro de la banda; las siguientes esperan a la derecha. Meta ~25.",
      metricHints: { reps: "landedNotes" }
    },
    "s3-song-stanzas": {
      mode: "pitchSong",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoArpeggio: true,
      autoRecord: true,
      cue: "Finish each phrase without a mid-breath. Each phrase is measured against the goal you pick; tap +1 per stanza.",
      cueEs: "Termina cada frase sin respirar a mitad. Cada frase se mide contra la meta que eliges; marca +1 por estrofa.",
      metricHints: { repsFeel: "stanzaTaps", repsBetter: "stanzaTaps" }
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
      cue: "Nose inhale → even SH, no voice. Climb 5→10→20→25→30 s, resting between tries. Raise Mic or hold Space if the timer doesn’t move.",
      cueEs: "Inhala por la nariz → SH pareja, sin voz. Sube 5→10→20→25→30 s, descansando entre intentos. Si el contador no se mueve, sube Mic o mantén Espacio.",
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
      /** The mode walks its own notes (three roots, C3 → D3 → E3) and sounds each step */
      ownsTarget: true,
      /** Read by a proposed app.js change: no chord loop or progression window under the steps */
      noProgression: true,
      roots: [48, 50, 52],
      holdMs: 900,
      tolCents: 40,
      cue: "Major scale on /A/: listen, then sing each step. The next steps wait to the right; the root moves up after each pass.",
      cueEs: "Escala mayor en /A/: escucha, luego canta cada paso. Los siguientes esperan a la derecha; la raíz sube tras cada pasada.",
      metricHints: { roots: "rootCount", intonation: "medianCents" }
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
      cue: "Brrr without voice, then a trill on the piano's note. The zig-zag is your bubble; a flat line means the lips stopped. Last, /A/ on the same note.",
      cueEs: "Brrr sin voz y luego trino en la nota del piano. El zigzag es tu burbuja; una línea plana, que los labios se pararon. Al final, /A/ en la misma nota.",
      metricHints: {}
    },
    "s5-sirens": {
      mode: "sirenRange",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      // Free range: no reference drone and no target lane; the mode draws the span you covered
      autoPiano: false,
      ownsTarget: true,
      /** Read by a proposed app.js change: no auto octave shift under a siren */
      freeRange: true,
      autoRecord: false,
      cue: "Glide low to high and back. The line shows your range and where the voice jumps — there is no note to hit.",
      cueEs: "Desliza de grave a agudo y vuelve. La línea muestra tu rango y dónde salta la voz — no hay nota que acertar.",
      metricHints: { sirens: "sirenCount" }
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
      cue: "A soft tone through the straw on the piano's note, cheeks soft. The bar is your tone; dots mean air only. Then, without the straw: /u/, then /A/.",
      cueEs: "Un tono suave por la pajita en la nota del piano, mejillas sueltas. La barra es tu tono; los puntos, solo aire. Después, sin pajita: /u/ y luego /A/.",
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
      /** The mode walks its own ten notes and sounds each one */
      ownsTarget: true,
      /** Read by a proposed app.js change: no chord loop or progression window under the notes */
      noProgression: true,
      cue: "Hum ten soft targets: each counts when held ~1.5 s near the centre. Lip buzz is yours to feel — not scored.",
      cueEs: "Tararea diez objetivos suaves: cada uno cuenta al sostenerlo ~1,5 s cerca del centro. El zumbido lo sientes tú — no se puntúa.",
      metricHints: { targets: "notesHeld" }
    },
    "s8-breath-support": {
      mode: "breathS",
      // The two lanes (S, then /A/) are the picture; the highway would push
      // them out of the first screen
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      /** Space / air assist for unvoiced S phase (a11y) — allowed even with pitch canvas */
      manualSoundKind: "air",
      allowManualSound: true,
      cue: "Step 1: a long, even S with no voice. Step 2: the same easy length on a sung /A/. We time both; how it feels is yours to rate.",
      cueEs: "Paso 1: una S larga y pareja, sin voz. Paso 2: la misma duración tranquila en una /A/ cantada. Medimos ambas; cómo se siente lo valoras tú.",
      metricHints: { maxS: "bestS" }
    },
    "s9-pitch-match": {
      mode: "pitchMatch",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: true,
      /** Read by a proposed app.js change: no score/combo words; the mode patches accuracy on Stop */
      noGameScore: true,
      ownsMetrics: true,
      autoPiano: true,
      autoRecord: false,
      cue: "Listen to the whole note first, then match it. Lock 8 notes in the green band; an octave up counts.",
      cueEs: "Escucha la nota entera primero, luego afínala. Fija 8 notas en la banda verde; una octava arriba también vale.",
      metricHints: { matches: "locks", accuracy: "medianCents", precision: "medianSpread" }
    },
    "s10-five-note": {
      mode: "scaleSteps",
      showPitch: true,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      /** The mode walks its own notes (three roots, C3 → D3 → E3) and sounds each step */
      ownsTarget: true,
      /** Read by a proposed app.js change: no chord loop or progression window under the steps */
      noProgression: true,
      roots: [48, 50, 52],
      holdMs: 700,
      tolCents: 40,
      cue: "1–2–3–4–5–4–3–2–1 on three roots. Each step locks when held in the band; the next steps wait to the right.",
      cueEs: "1–2–3–4–5–4–3–2–1 en tres raíces. Cada paso se fija al sostenerlo en la banda; los siguientes esperan a la derecha.",
      metricHints: { roots: "rootCount" }
    },
    "s11-dynamics": {
      mode: "dynamicSwell",
      // The skill is the level shape; pitch is its second line, drawn under
      // it in cents against your own start — so the picture lives in the
      // stage, not below the fold under a one-lane highway
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      // Space-as-sound would draw a swell nobody sang
      allowManualSound: false,
      autoPiano: true,
      autoRecord: false,
      targetSwells: 6,
      swellSec: 7,
      cue: "Soft → grow → back to soft along the band. The pitch line underneath should stay flat while the level moves.",
      cueEs: "Suave → crece → vuelve a suave siguiendo la banda. La línea de afinación de abajo debe quedarse plana mientras cambia el volumen.",
      metricHints: { swells: "swellCount", pitchStable: "pitchAtPeakCents" }
    },
    "s12-easy-onset": {
      mode: "onsetReps",
      // The skill is the first 100 ms of each note, drawn after it; the
      // highway only showed detector spikes at every start
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      // Space-as-sound would be an onset nobody made
      allowManualSound: false,
      autoPiano: true,
      autoRecord: false,
      targetReps: 10,
      cue: "First your own examples: 2 abrupt 'uh', 2 breathy 'ha', 2 easy. Then easy onsets from silence; each one is drawn once it's over.",
      cueEs: "Primero tus ejemplos: 2 «uh» bruscos, 2 «ha» soplados, 2 fáciles. Luego inicios fáciles desde el silencio; cada uno se dibuja al terminar.",
      metricHints: { easyOnsets: "balancedOnsetCount" }
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
      cue: "Arpeggio + sustain. Sing each chord 1 → 3 → 5 → 8 in order; a full pass counts when every chord is complete.",
      cueEs: "Arpegio + sostenido. Canta cada acorde 1 → 3 → 5 → 8 en orden; una vuelta cuenta cuando todos los acordes están completos.",
      metricHints: { progressions: "fullPasses", intervalAccuracy: "medianIntervalCents" }
    },
    "s14-staccato-legato": {
      mode: "staccatoLegato",
      // The skill is note length and the gaps between notes; the highway
      // bridged every staccato rest into one line and chased the chord loop
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      // Space-as-sound would draw notes nobody sang
      allowManualSound: false,
      // A chord loop through the speakers fills the rests the picture measures;
      // the piano stays one tap away
      autoPiano: false,
      autoRecord: false,
      phases: [
        { label: "Staccato rounds", labelEs: "Staccato", sec: 90, kind: "staccato" },
        { label: "Legato line", labelEs: "Legato", sec: 90, kind: "legato" },
        { label: "Staccato again", labelEs: "Staccato otra vez", sec: 60, kind: "staccato" },
        { label: "Legato again", labelEs: "Legato otra vez", sec: 60, kind: "legato" },
        { label: "Song phrase · legato", labelEs: "Frase de canción · legato", sec: 30, kind: "legato", round: false }
      ],
      cue: "Same 3-note pattern: short notes with silence between, then one joined line. Each note is drawn as long as it sounded. With the piano on speakers, use headphones.",
      cueEs: "El mismo patrón de 3 notas: notas cortas con silencio entre ellas, luego una sola línea unida. Cada nota se dibuja tan larga como sonó. Con el piano por altavoz, usa auriculares.",
      metricHints: { rounds: "phasesSungInTheirWay" }
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
      // A pacer: the mic cannot hear a nose breath or see the ribs, so it is
      // not opened (no permission prompt, no level pill reacting to the room)
      timeDriven: true,
      showPitch: false,
      showHold: false,
      showLevel: false,
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
      // The mode draws its own one-note lane (a column per vowel) in the panel
      showPitch: false,
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
      // The mode draws its own zone lane in the panel (no pitch highway)
      showPitch: false,
      focus: "body",
      // Only what the microphone measures is scored: the picture measures level and tone clarity; body and comfort stay self-rated
      stabilityMetric: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: false,
      refPitch: "A2",
      zones: [
        {
          key: "low",
          label: "Low · chest voice",
          labelEs: "Graves · voz de pecho",
          notes: ["C3", "B2", "A2", "G2", "A2", "B2"],
          cue: "Low and easy, space in the mouth. Do not press the voice down.",
          cueEs: "Grave y fácil, espacio en la boca. No empujes la voz hacia abajo."
        }
      ],
      cue: "Low targets with body, never pressed. Stop where the tone stops being clear.",
      cueEs: "Objetivos graves con cuerpo, sin apretar. Para donde el tono deja de ser claro.",
      metricHints: { zoneTargets: "targets" }
    },
    "s22-mid-voice-hola": {
      mode: "resonanceZone",
      // The mode walks its own note list; keep the generic refPitch off the target
      ownsTarget: true,
      // The mode draws its own zone lane in the panel (no pitch highway)
      showPitch: false,
      focus: "speech",
      // Only what the microphone measures is scored: pitch steadiness over the holds is measured; speech-likeness stays self-rated
      stabilityMetric: "steadiness",
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
      // The mode draws its own zone lane in the panel (no pitch highway)
      showPitch: false,
      focus: "bright",
      // Only what the microphone measures is scored: the picture shows brightness against loudness; buzz and balance stay self-rated
      stabilityMetric: false,
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
          cue: "'YA, YA' deliberately nasal and bright. Notice where you feel the buzz.",
          cueEs: "«YA, YA» a propósito nasal y brillante. Nota dónde sientes el zumbido."
        }
      ],
      cue: "Normal 'YA', then exaggerate it, keep it on the notes, then balance the colour back.",
      cueEs: "«YA» normal, luego exagéralo, mantenlo en las notas y equilibra el color.",
      metricHints: { zoneTargets: "targets" }
    },
    "s24-nana-high": {
      mode: "resonanceZone",
      // The mode walks its own note list; keep the generic refPitch off the target
      ownsTarget: true,
      // The mode draws its own zone lane in the panel (no pitch highway)
      showPitch: false,
      focus: "soft",
      // Only what the microphone measures is scored: pitch steadiness over the holds sung soft is measured; pushing stays self-rated
      stabilityMetric: "stability",
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
      // The mode draws its own zone lane in the panel (no pitch highway)
      showPitch: false,
      focus: "seams",
      // Only what the microphone measures is scored: the picture shows each seam; transitions and comfort stay self-rated
      stabilityMetric: false,
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
      // No piano on Start: a looping accompaniment would be recorded into
      // take A and not B (or both, differently), and the comparison is the
      // point. The piano stays one tap away to find a starting note.
      autoPiano: false,
      autoRecord: true,
      phases: [
        {
          label: "Take A · plain",
          labelEs: "Toma A · sin intención",
          sec: 45,
          cue: "Sing the phrase the way it comes out. The take starts when you sing and ends after two seconds of quiet.",
          cueEs: "Canta la frase como te salga. La toma empieza al cantar y acaba tras dos segundos de silencio."
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
          cue: "Play A and B. Not which is prettier: which sounds fuller and rings more to you.",
          cueEs: "Escucha A y B. No cuál es más bonita: cuál te suena más llena y con más brillo."
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
