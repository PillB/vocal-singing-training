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
      // A count pacer; the take is recorded so the two counts can be compared
      timeDriven: true,
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      phases: [
        {
          label: "With pen · count 1–60",
          labelEs: "Con bolígrafo · cuenta 1–60",
          short: "With pen",
          shortEs: "Con bolígrafo",
          kind: "count",
          pen: true,
          from: 1,
          to: 60,
          pace: 1.5,
          sec: 90,
          cue: "Pen across the teeth, resting, not bitten. One number per beat: make every consonant land.",
          cueEs: "Bolígrafo entre los dientes, apoyado, sin morder. Un número por pulso: que cada consonante se oiga."
        },
        {
          label: "Take the pen out",
          labelEs: "Quita el bolígrafo",
          short: "Out",
          shortEs: "Fuera",
          kind: "penOff",
          sec: 5,
          cue: "Put it down. Same pace next.",
          cueEs: "Déjalo. Ahora, el mismo ritmo."
        },
        {
          label: "Pen off · count 1–20",
          labelEs: "Sin bolígrafo · cuenta 1–20",
          short: "Without",
          shortEs: "Sin bolígrafo",
          kind: "count",
          pen: false,
          from: 1,
          to: 20,
          pace: 1.5,
          sec: 30,
          cue: "The same numbers without the pen. Notice what changed: you will hear it after Stop.",
          cueEs: "Los mismos números sin el bolígrafo. Nota qué cambió: lo escucharás al detener."
        }
      ],
      cue: "Count with the pen, take it out, count the same numbers again. After Stop, listen to both.",
      cueEs: "Cuenta con el bolígrafo, quítalo y cuenta los mismos números otra vez. Al detener, escucha los dos.",
      metricHints: {}
    },
    "v5-neutral-ears": {
      mode: "recordOnly",
      // Paced cards; the take is recorded for a later listen with neutral ears
      timeDriven: true,
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      phases: [
        {
          label: "Motivator",
          labelEs: "Motivador",
          persona: "Motivator",
          personaEs: "Motivador",
          icon: "star",
          kind: "persona",
          sec: 20,
          intent: "Open with a specific, true compliment.",
          intentEs: "Abre con un cumplido concreto y verdadero.",
          cue: "Speak to one imagined person. No judging mid-take.",
          cueEs: "Háblale a una persona imaginada. Sin juzgarte a mitad."
        },
        {
          label: "Coach",
          labelEs: "Coach",
          persona: "Coach",
          personaEs: "Coach",
          icon: "flag",
          kind: "persona",
          sec: 20,
          intent: "Give one clear tip. Only one.",
          intentEs: "Da un consejo claro. Solo uno.",
          cue: "Same person, new energy: direct and kind.",
          cueEs: "La misma persona, otra energía: directo y amable."
        },
        {
          label: "Friend",
          labelEs: "Amigo",
          persona: "Friend",
          personaEs: "Amigo",
          icon: "heart",
          kind: "persona",
          sec: 20,
          intent: "Warm and unhurried: share a small moment.",
          intentEs: "Cálido y sin prisa: cuenta un momento pequeño.",
          cue: "Slower, closer, lighter.",
          cueEs: "Más lento, más cerca, más ligero."
        },
        {
          label: "Educator",
          labelEs: "Educador",
          persona: "Educator",
          personaEs: "Educador",
          icon: "check",
          kind: "persona",
          sec: 20,
          intent: "Explain one idea so it sticks.",
          intentEs: "Explica una idea para que se quede.",
          cue: "One example, then the idea in one line.",
          cueEs: "Un ejemplo y la idea en una línea."
        },
        {
          label: "Story · setup",
          labelEs: "Historia · inicio",
          short: "Setup",
          shortEs: "Inicio",
          kind: "story",
          sec: 25,
          cue: "Who, where, and what they wanted.",
          cueEs: "Quién, dónde y qué quería."
        },
        {
          label: "Story · turn",
          labelEs: "Historia · giro",
          short: "Turn",
          shortEs: "Giro",
          kind: "story",
          sec: 25,
          cue: "What changed, or went another way.",
          cueEs: "Qué cambió o salió de otra manera."
        },
        {
          label: "Story · point",
          labelEs: "Historia · punto",
          short: "Point",
          shortEs: "Punto",
          kind: "story",
          sec: 20,
          cue: "Land one takeaway, then stop.",
          cueEs: "Aterriza una sola idea y termina."
        }
      ],
      cue: "Four persona cards, then a 70-second story. Recording starts with practice: listen back later with neutral ears.",
      cueEs: "Cuatro tarjetas de persona y una historia de 70 s. La grabación empieza con la práctica: escúchala después con oídos neutrales.",
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
      minSec: 300,
      maxSec: 600,
      topics: [
        "The best thing you learned this year",
        "A place you would go back to",
        "Your work, explained to a child",
        "A habit that changed your week",
        "Something that made you laugh lately",
        "A meal that tastes like home"
      ],
      topicsEs: [
        "Lo mejor que aprendiste este año",
        "Un lugar al que volverías",
        "Tu trabajo, explicado a un niño",
        "Un hábito que cambió tu semana",
        "Algo que te hizo reír hace poco",
        "Una comida que sabe a casa"
      ],
      cue: "Record 5–10 min on one topic, without stopping to judge. Leave one full day before the 3-step review.",
      cueEs: "Graba 5–10 min sobre un tema, sin pararte a juzgar. Espera un día completo antes de la revisión en 3 pasos.",
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
      cue: "One element for the week, a few minutes a day, a short recording and review at the end.",
      cueEs: "Un elemento por semana, unos minutos al día, una grabación corta y revisión al final.",
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
        { label: "1 Very soft", labelEs: "1 Muy suave" },
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
      // Paced gestures (drawn: no camera here); the sound is recorded
      timeDriven: true,
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      phases: [
        {
          label: "Frame yourself",
          labelEs: "Encuádrate",
          short: "Camera",
          shortEs: "Cámara",
          pose: "frame",
          sec: 10,
          cue: "Prop your phone's camera at chest height: waist up, hands in shot. This page keeps time and records the sound.",
          cueEs: "Apoya la cámara del móvil a la altura del pecho: de cintura arriba, con las manos a la vista. Esta página lleva el tiempo y graba el sonido."
        },
        {
          label: "Hands still",
          labelEs: "Manos quietas",
          short: "Still",
          shortEs: "Quietas",
          pose: "base",
          sec: 60,
          cue: "Talk about your day with your hands together at the navel. Notice how it feels.",
          cueEs: "Habla de tu día con las manos juntas a la altura del ombligo. Nota cómo se siente."
        },
        {
          label: "Open palms on the key word",
          labelEs: "Palmas abiertas en la palabra clave",
          short: "Palms",
          shortEs: "Palmas",
          pose: "palms",
          sec: 30,
          line: "Here is what *matters*.",
          lineEs: "Esto es lo *importante*.",
          cue: "Palms open with the key word, one beat, then back to base.",
          cueEs: "Palmas abiertas con la palabra clave, un golpe y de vuelta a la base."
        },
        {
          label: "Size · a big idea",
          labelEs: "Tamaño · una idea grande",
          short: "Size",
          shortEs: "Tamaño",
          pose: "size",
          sec: 30,
          line: "It's a *huge* change.",
          lineEs: "Es un cambio *enorme*.",
          cue: "The hands open wide as the word arrives, not after it.",
          cueEs: "Las manos se abren cuando llega la palabra, no después."
        },
        {
          label: "Count · one, two, three",
          labelEs: "Cuenta · uno, dos, tres",
          short: "Count",
          shortEs: "Cuenta",
          pose: "count",
          sec: 30,
          line: "Three steps: *one*, *two*, *three*.",
          lineEs: "Tres pasos: *uno*, *dos*, *tres*.",
          cue: "One finger per point, raised with each number.",
          cueEs: "Un dedo por punto, que sube con cada número."
        },
        {
          label: "Location · here and there",
          labelEs: "Lugar · aquí y allá",
          short: "Place",
          shortEs: "Lugar",
          pose: "location",
          sec: 30,
          line: "We were *here*; now we're *there*.",
          lineEs: "Estábamos *aquí*; ahora, *allá*.",
          cue: "Place each idea in space and point back to it.",
          cueEs: "Coloca cada idea en un lugar y vuelve a señalarla."
        }
      ],
      cue: "Hands still, then open palms, size, count and location. Film yourself waist up and watch it muted first.",
      cueEs: "Manos quietas, luego palmas, tamaño, cuenta y lugar. Fílmate de cintura arriba y mírate primero sin sonido.",
      metricHints: {}
    },
    "v16-facial-expression": {
      mode: "facePhases",
      // Paced faces (drawn: no camera here); the sound is recorded
      timeDriven: true,
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      phases: [
        {
          label: "Resting face",
          labelEs: "Cara en reposo",
          short: "Rest",
          shortEs: "Reposo",
          face: "neutral",
          sec: 8,
          cue: "Look into your camera or a mirror. Soften the jaw and the brows: that is your resting face.",
          cueEs: "Mírate en la cámara o en un espejo. Suelta la mandíbula y las cejas: esa es tu cara en reposo."
        },
        {
          label: "Warm hello",
          labelEs: "Hola cálido",
          short: "Hello",
          shortEs: "Hola",
          face: "warm",
          sec: 10,
          line: "*Hello*, good to see you.",
          lineEs: "*Hola*, qué gusto verte.",
          cue: "Eyes first, then a slight smile, not a fixed grin.",
          cueEs: "Primero los ojos, luego una sonrisa leve, no una sonrisa fija."
        },
        {
          label: "Curiosity face",
          labelEs: "Curiosidad",
          short: "Curiosity",
          shortEs: "Curiosidad",
          face: "curious",
          sec: 20,
          cue: "Start a 60-second story with a question you want answered. The brows lift a little.",
          cueEs: "Empieza una historia de 60 s con una pregunta que quieras resolver. Las cejas suben un poco."
        },
        {
          label: "Surprise face",
          labelEs: "Sorpresa",
          short: "Surprise",
          shortEs: "Sorpresa",
          face: "surprise",
          sec: 20,
          cue: "The turn: eyes open and brows up with the word, not two seconds after it.",
          cueEs: "El giro: ojos abiertos y cejas arriba con la palabra, no dos segundos después."
        },
        {
          label: "Resolve / warmth",
          labelEs: "Resolución y calidez",
          short: "Resolve",
          shortEs: "Resolución",
          face: "resolve",
          sec: 20,
          cue: "Land the point with a settled, warm face.",
          cueEs: "Aterriza el punto con la cara tranquila y cálida."
        }
      ],
      cue: "Resting face, a warm hello, then a story told with curiosity, surprise and resolve. Watch your video muted after.",
      cueEs: "Cara en reposo, un hola cálido y una historia con curiosidad, sorpresa y resolución. Después mira tu video sin sonido.",
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
    /* —— Vocal · guided voice drills (Modes.voiceDrill; pictures in js/scenes/voice-drill.js) —— */
    "v21-straw-to-speech": {
      mode: "voiceDrill",
      // Guided on the clock. The microphone counts soft sounds; ease stays self-rated
      timeDriven: true,
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      title: "Straw to speech",
      titleEs: "De la pajita a la frase",
      minHoldMs: 1500,
      holdHint: "a soft “oo” through the straw",
      holdHintEs: "una “u” suave por la pajita",
      holdsMetric: "strawHolds",
      phases: [
        {
          label: "Straw ready",
          labelEs: "Pajita lista",
          short: "Ready",
          shortEs: "Lista",
          art: "straw",
          sec: 20,
          cue: "Your own clean straw between your lips, sealed. Cheeks loose. No sound yet.",
          cueEs: "Tu propia pajita, limpia, entre los labios, bien cerrados. Mejillas sueltas. Todavía sin sonido."
        },
        {
          label: "Soft “oo”",
          labelEs: "“U” suave",
          short: "Oo",
          shortEs: "U",
          sound: true,
          sec: 60,
          cue: "A soft “oo” through the straw at a comfortable speaking pitch. Hold 3 to 5 seconds, breathe, repeat.",
          cueEs: "Una “u” suave por la pajita, en un tono cómodo de tu voz hablada. Sostén de 3 a 5 segundos, respira y repite."
        },
        {
          label: "Small glides",
          labelEs: "Deslizamientos cortos",
          short: "Glides",
          shortEs: "Desliza",
          sound: true,
          art: "glide",
          glide: "updown",
          sec: 55,
          cue: "A little up and back down, like a small siren, still through the straw.",
          cueEs: "Un poco hacia arriba y de vuelta, como una sirena pequeña, siempre por la pajita."
        },
        {
          label: "Waves of loudness",
          labelEs: "Olas de volumen",
          short: "Waves",
          shortEs: "Olas",
          sound: true,
          sec: 50,
          cue: "On one breath: oo-OO-oo-OO. The push comes from the belly; the throat stays loose.",
          cueEs: "En un mismo aire: u-U-u-U. El impulso sale del abdomen; la garganta queda suelta."
        },
        {
          label: "The sentence through the straw",
          labelEs: "La frase por la pajita",
          short: "Straw line",
          shortEs: "Con pajita",
          sound: true,
          speech: true,
          art: "speak",
          say: "Good morning, everyone. / Today we will look at three ideas / and one example.",
          sayEs: "Buenos días a todos. / Hoy vamos a ver tres ideas / y un ejemplo.",
          sec: 50,
          cue: "“Say” your first sentence (or this one) through the straw: only its melody and rhythm come out.",
          cueEs: "“Di” tu primera frase (o esta) por la pajita: solo salen su melodía y su ritmo."
        },
        {
          label: "The same sentence, no straw",
          labelEs: "La misma frase, sin pajita",
          short: "No straw",
          shortEs: "Sin pajita",
          sound: true,
          speech: true,
          art: "speak",
          say: "Good morning, everyone. / Today we will look at three ideas / and one example.",
          sayEs: "Buenos días a todos. / Hoy vamos a ver tres ideas / y un ejemplo.",
          sec: 65,
          cue: "Take the straw away and say it with the same ease. Twice, then keep talking.",
          cueEs: "Quita la pajita y dila con la misma facilidad. Dos veces, y sigue hablando."
        }
      ],
      doneCue: "How does speaking feel now? Rate it in Metrics.",
      doneCueEs: "¿Cómo se siente hablar ahora? Valóralo en Métricas.",
      cue: "A soft sound through a straw, then a sentence with the same ease. The steps advance on their own; soft sounds of 1.5 s or more are counted.",
      cueEs: "Un sonido suave por una pajita y luego una frase con la misma facilidad. Los pasos avanzan solos; cuentan los sonidos suaves de 1,5 s o más.",
      metricHints: { strawHolds: "holds" }
    },
    "v22-voice-recovery": {
      mode: "voiceDrill",
      // Five quiet minutes, then five of soft straw sounds (Peng et al. 2026)
      timeDriven: true,
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      title: "Voice recovery",
      titleEs: "Recuperar la voz",
      // A soft tone at each step: the quiet minutes are done with the eyes off the screen
      chime: true,
      minHoldMs: 1500,
      holdHint: "a soft “oo” through the straw",
      holdHintEs: "una “u” suave por la pajita",
      holdsMetric: "strawHolds",
      restMetric: "quietMin",
      phases: [
        {
          label: "Quiet, with water",
          labelEs: "Silencio, con agua",
          short: "Quiet",
          shortEs: "Silencio",
          rest: true,
          art: "rest",
          sec: 300,
          cue: "No talking and no whispering. Sip water, breathe through your nose. A soft tone marks the end.",
          cueEs: "Sin hablar ni susurrar. Sorbos de agua, respira por la nariz. Un tono suave marca el final."
        },
        {
          label: "Soft “oo” through the straw",
          labelEs: "“U” suave por la pajita",
          short: "Oo",
          shortEs: "U",
          sound: true,
          sec: 120,
          cue: "A soft “oo” at a comfortable pitch. Hold 3 to 5 seconds, breathe, repeat. No hurry.",
          cueEs: "Una “u” suave en un tono cómodo. Sostén de 3 a 5 segundos, respira y repite. Sin prisa."
        },
        {
          label: "Slow glides down",
          labelEs: "Deslizamientos lentos hacia abajo",
          short: "Down",
          shortEs: "Bajar",
          sound: true,
          art: "glide",
          glide: "down",
          sec: 100,
          cue: "From a middle pitch slowly down to a low one, through the straw. Soft, never pushed.",
          cueEs: "De un tono medio, despacio, a uno grave, por la pajita. Suave, nunca empujado."
        },
        {
          label: "Low and soft to finish",
          labelEs: "Grave y suave para terminar",
          short: "Low",
          shortEs: "Grave",
          sound: true,
          sec: 80,
          cue: "A few soft, low “oo”s. Then one easy sentence without the straw.",
          cueEs: "Unas “u” suaves y graves. Luego una frase fácil sin la pajita."
        }
      ],
      doneText: "Done · the rest happens overnight",
      doneTextEs: "Listo · el resto pasa durante la noche",
      doneCue: "How comfortable is your voice now? Rate it in Metrics.",
      doneCueEs: "¿Qué tan cómoda está tu voz ahora? Valóralo en Métricas.",
      cue: "After a lot of talking: five quiet minutes with water, then five of soft sounds through a straw. A soft tone marks each step.",
      cueEs: "Después de hablar mucho: cinco minutos de silencio con agua y cinco de sonidos suaves por una pajita. Un tono suave marca cada paso.",
      metricHints: { quietMin: "quietSec", strawHolds: "holds" }
    },
    "v23-clear-speech": {
      mode: "voiceDrill",
      // A, your usual way; B, clear. The phone compares the two takes with each other
      timeDriven: true,
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      title: "Clear speech",
      titleEs: "Habla clara",
      pairA: "Usual",
      pairAEs: "Como siempre",
      pairB: "Clear",
      pairBEs: "Clara",
      pairYes: "B was slower or had more pauses ✓",
      pairYesEs: "B fue más despacio o con más pausas ✓",
      pairNo: "B came out much like A: try real pauses",
      pairNoEs: "B salió parecida a A: prueba pausas de verdad",
      pairLoud: "B was louder, not slower: try pauses instead",
      pairLoudEs: "B sonó más fuerte, no más despacio: prueba pausas",
      phases: [
        {
          label: "Your sentence",
          labelEs: "Tu frase",
          short: "Sentence",
          shortEs: "Frase",
          art: "speak",
          say: "The meeting is on Tuesday / at half past four / in room two.",
          sayEs: "La reunión es el martes / a las cuatro y media / en la sala dos.",
          sec: 20,
          cue: "Choose a sentence you will really say this week, or use this one. No sound yet.",
          cueEs: "Elige una frase que de verdad vayas a decir esta semana, o usa esta. Todavía sin sonido."
        },
        {
          label: "A · your usual way",
          labelEs: "A · como siempre",
          short: "A",
          shortEs: "A",
          sound: true,
          speech: true,
          compare: "a",
          sec: 30,
          cue: "Say it the way you usually do. Once or twice.",
          cueEs: "Dila como siempre. Una o dos veces."
        },
        {
          label: "B · clear",
          labelEs: "B · clara",
          short: "B",
          shortEs: "B",
          sound: true,
          speech: true,
          compare: "b",
          sec: 40,
          cue: "As if to someone who hears poorly: a little slower, every ending finished, a short pause between ideas. No need to push the volume.",
          cueEs: "Como a alguien que oye poco: un poco más despacio, cada final completo, una pausa corta entre ideas. Sin empujar el volumen."
        },
        {
          label: "Clear, with the pauses marked",
          labelEs: "Clara, con las pausas marcadas",
          short: "Pauses",
          shortEs: "Pausas",
          sound: true,
          speech: true,
          art: "speak",
          clear: true,
          say: "The meeting is on Tuesday / at half past four / in room two.",
          sayEs: "La reunión es el martes / a las cuatro y media / en la sala dos.",
          sec: 60,
          cue: "A short pause at each ‖. Give the day, the time and the place their full shape. Then your own sentence the same way.",
          cueEs: "Una pausa corta en cada ‖. Dale su forma completa al día, a la hora y al lugar. Luego tu propia frase igual."
        },
        {
          label: "Your normal pace, endings kept",
          labelEs: "A tu ritmo, con los finales",
          short: "Talk",
          shortEs: "Habla",
          sound: true,
          speech: true,
          art: "speak",
          say: "What I did today / what comes next / what I need",
          sayEs: "Qué hice hoy / qué sigue / qué necesito",
          sec: 90,
          cue: "Talk at your normal pace about these three. Keep the finished endings and the pauses between ideas.",
          cueEs: "Habla a tu ritmo normal de estas tres cosas. Conserva los finales completos y las pausas entre ideas."
        }
      ],
      doneCue: "Press Stop and listen to A and B back to back.",
      doneCueEs: "Pulsa Detener y escucha A y B una tras otra.",
      reviewNote: "Slower, with pauses and finished endings, is what clear speech is made of. Whether B was easier to understand is for you and your listener to judge.",
      reviewNoteEs: "Más despacio, con pausas y finales completos: de eso está hecha el habla clara. Si B se entendió mejor lo juzgan tú y quien te escucha.",
      cue: "The same sentence twice: your usual way, then as if to someone who hears poorly. After Stop you hear both and see what changed.",
      cueEs: "La misma frase dos veces: como siempre y luego como a alguien que oye poco. Al detener oyes las dos y ves qué cambió.",
      metricHints: {}
    },
    "v24-vocal-function": {
      mode: "voiceDrill",
      // Stemple's four exercises at a comfortable pitch, no piano; "as long as it stays easy"
      timeDriven: true,
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: true,
      title: "Vocal function exercises",
      titleEs: "Funciones vocales",
      minHoldMs: 3000,
      holdHint: "a soft sound, held",
      holdHintEs: "un sonido suave, sostenido",
      holdsMetric: "longHolds",
      longestMetric: "longestHold",
      phases: [
        {
          label: "Tall and loose",
          labelEs: "Espalda larga, hombros sueltos",
          short: "Posture",
          shortEs: "Postura",
          art: "stand",
          sec: 20,
          cue: "Stand or sit tall, shoulders down. Everything that follows is as soft as you can make it with the voice still clear.",
          cueEs: "De pie o en una silla, espalda larga, hombros bajos. Todo lo que sigue va lo más suave que puedas con la voz todavía clara."
        },
        {
          label: "Long soft “ee”",
          labelEs: "“I” larga y suave",
          short: "Ee",
          shortEs: "I",
          sound: true,
          sec: 70,
          cue: "A soft, bright “ee” on one comfortable note, for as long as it stays easy. Stop before you squeeze. Breathe, and once more.",
          cueEs: "Una “i” suave y brillante en una nota cómoda, mientras siga siendo cómodo. Para antes de apretar. Respira, y una vez más."
        },
        {
          label: "Glide up on “oh”",
          labelEs: "Desliza hacia arriba en “o”",
          short: "Up",
          shortEs: "Subir",
          sound: true,
          art: "glide",
          glide: "up",
          sec: 50,
          cue: "Lips rounded and almost closed. Slowly from your lowest easy note to your highest easy note. Twice.",
          cueEs: "Labios redondeados y casi cerrados. Despacio, de tu nota cómoda más grave a la más aguda. Dos veces."
        },
        {
          label: "Glide down on “oh”",
          labelEs: "Desliza hacia abajo en “o”",
          short: "Down",
          shortEs: "Bajar",
          sound: true,
          art: "glide",
          glide: "down",
          sec: 50,
          cue: "The same shape, slowly from high to low. Twice.",
          cueEs: "La misma forma, despacio, de agudo a grave. Dos veces."
        },
        {
          label: "Five soft notes, low to high",
          labelEs: "Cinco notas suaves, de grave a aguda",
          short: "Notes",
          shortEs: "Notas",
          sound: true,
          sec: 230,
          cue: "The same soft “oh” on five comfortable notes, from low to high, each while it stays easy. Breathe between them. Then the five again.",
          cueEs: "La misma “o” suave en cinco notas cómodas, de grave a aguda, cada una mientras sea cómodo. Respira entre ellas. Luego las cinco otra vez."
        }
      ],
      doneCue: "Did the voice stay easy? Rate it in Metrics.",
      doneCueEs: "¿La voz siguió cómoda? Valóralo en Métricas.",
      cue: "Four soft exercises: one long sound, a glide up, a glide down and five held notes. Sounds of 3 s or more are counted; never hold on past easy.",
      cueEs: "Cuatro ejercicios suaves: un sonido largo, un deslizamiento hacia arriba, otro hacia abajo y cinco notas sostenidas. Cuentan los sonidos de 3 s o más; nunca aguantes más allá de lo cómodo.",
      metricHints: { longHolds: "holds", longestHold: "longest" }
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
      cue: "Finish each phrase without a mid-phrase pause. Each phrase is measured against the goal you pick; tap +1 per stanza.",
      cueEs: "Termina cada frase sin pausa a mitad. Cada frase se mide contra la meta que eliges; marca +1 por estrofa.",
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
      cue: "Try 5 easy seconds of unvoiced SH; longer rungs (10–30s) are optional. Rest and transfer to a soft sung /A/. Mic/Space only times sound.",
      cueEs: "Prueba 5 s de SH suave, sin voz; los peldaños de 10–30 s son opcionales. Descansa y pasa a /A/ cantada. Mic/Espacio solo cronometra sonido.",
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
      /** Read by js/app.js: no chord loop or progression window under the steps */
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
      /** Read by js/app.js: no chord loop or progression window under the notes */
      noProgression: true,
      cue: "Hum five soft targets: each counts when held ~1.5 s near the centre. Lip buzz is yours to feel — not scored.",
      cueEs: "Tararea cinco objetivos suaves: cada uno cuenta al sostenerlo ~1,5 s cerca del centro. El zumbido lo sientes tú — no se puntúa.",
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
      cue: "Step 1: an easy S for ~4–6 seconds. Step 2: a comfortable /A/ for ~4–6 seconds. The mic/Space times sound, not breath support; rate how it feels.",
      cueEs: "Paso 1: una S cómoda de ~4–6 s. Paso 2: una /A/ cómoda de ~4–6 s. El micrófono/Espacio cronometra sonido, no mide el apoyo; valora cómo te sientes.",
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
      /** Read by js/app.js: no chord loop or progression window under the steps */
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
    "s28-vocal-function": {
      mode: "voiceDrill",
      // Stemple's four exercises on the piano's notes (F, then C to G), moved to
      // the singer's octave. Silent first step: the mode sounds its own notes
      timeDriven: true,
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: true,
      refPitch: "F3",
      title: "Vocal function exercises",
      titleEs: "Funciones vocales",
      minHoldMs: 3000,
      holdHint: "listen to the note, then hold it softly",
      holdHintEs: "escucha la nota y sostenla suave",
      holdsMetric: "longHolds",
      longestMetric: "longestHold",
      phases: [
        {
          label: "Tall and loose",
          labelEs: "Espalda larga, hombros sueltos",
          short: "Posture",
          shortEs: "Postura",
          art: "stand",
          sec: 15,
          cue: "Stand tall, shoulders down. Everything that follows is as soft as you can sing with the tone still clear.",
          cueEs: "De pie, espalda larga, hombros bajos. Todo lo que sigue va lo más suave que puedas cantar con el tono todavía claro."
        },
        {
          label: "Long soft “ee” on the note",
          labelEs: "“I” larga y suave en la nota",
          short: "Ee",
          shortEs: "I",
          sound: true,
          ref: "F3",
          sec: 65,
          cue: "The piano gives the note. A soft, bright “ee” on it for as long as it stays easy. Stop before you squeeze. Breathe, and once more.",
          cueEs: "El piano da la nota. Una “i” suave y brillante en ella mientras siga siendo cómodo. Para antes de apretar. Respira, y una vez más."
        },
        {
          label: "Glide up on “oh”",
          labelEs: "Desliza hacia arriba en “o”",
          short: "Up",
          shortEs: "Subir",
          sound: true,
          art: "glide",
          glide: "up",
          sec: 50,
          cue: "Lips rounded and almost closed. Slowly from your lowest easy note to your highest easy note. Twice.",
          cueEs: "Labios redondeados y casi cerrados. Despacio, de tu nota cómoda más grave a la más aguda. Dos veces."
        },
        {
          label: "Glide down on “oh”",
          labelEs: "Desliza hacia abajo en “o”",
          short: "Down",
          shortEs: "Bajar",
          sound: true,
          art: "glide",
          glide: "down",
          sec: 50,
          cue: "The same shape, slowly from high to low. Twice.",
          cueEs: "La misma forma, despacio, de agudo a grave. Dos veces."
        },
        {
          label: "Note 1 of 5 · soft “oh”",
          labelEs: "Nota 1 de 5 · “o” suave",
          short: "1",
          shortEs: "1",
          sound: true,
          ref: "C3",
          sec: 48,
          cue: "The first of five notes going up. Hold a soft “oh” on it, lips almost closed, while it stays easy. Breathe, and once more.",
          cueEs: "La primera de cinco notas que suben. Sostén en ella una “o” suave, labios casi cerrados, mientras sea cómodo. Respira, y otra vez."
        },
        {
          label: "Note 2 of 5 · soft “oh”",
          labelEs: "Nota 2 de 5 · “o” suave",
          short: "2",
          shortEs: "2",
          sound: true,
          ref: "D3",
          sec: 48,
          cue: "The next note up. The same soft “oh”, twice, while it stays easy.",
          cueEs: "La siguiente nota hacia arriba. La misma “o” suave, dos veces, mientras sea cómodo."
        },
        {
          label: "Note 3 of 5 · soft “oh”",
          labelEs: "Nota 3 de 5 · “o” suave",
          short: "3",
          shortEs: "3",
          sound: true,
          ref: "E3",
          sec: 48,
          cue: "The next note up. The same soft “oh”, twice, while it stays easy.",
          cueEs: "La siguiente nota hacia arriba. La misma “o” suave, dos veces, mientras sea cómodo."
        },
        {
          label: "Note 4 of 5 · soft “oh”",
          labelEs: "Nota 4 de 5 · “o” suave",
          short: "4",
          shortEs: "4",
          sound: true,
          ref: "F3",
          sec: 48,
          cue: "The next note up. The same soft “oh”, twice, while it stays easy.",
          cueEs: "La siguiente nota hacia arriba. La misma “o” suave, dos veces, mientras sea cómodo."
        },
        {
          label: "Note 5 of 5 · soft “oh”",
          labelEs: "Nota 5 de 5 · “o” suave",
          short: "5",
          shortEs: "5",
          sound: true,
          ref: "G3",
          sec: 48,
          cue: "The last note. The same soft “oh”, twice; stop before you squeeze.",
          cueEs: "La última nota. La misma “o” suave, dos veces; para antes de apretar."
        }
      ],
      doneCue: "Did the voice stay easy? Rate it in Metrics.",
      doneCueEs: "¿La voz siguió cómoda? Valóralo en Métricas.",
      cue: "Four soft exercises on the piano's notes: one long note, a glide up, a glide down and five held notes. Notes of 3 s or more are counted; never hold on past easy.",
      cueEs: "Cuatro ejercicios suaves en las notas del piano: una nota larga, un deslizamiento hacia arriba, otro hacia abajo y cinco notas sostenidas. Cuentan las notas de 3 s o más; nunca aguantes más allá de lo cómodo.",
      metricHints: { longHolds: "holds", longestHold: "longest" }
    },
    /* —— Singing · class course (placement & resonance) —— */
    "s17-jaw-neck-release": {
      mode: "releaseFlow",
      // Clock-driven and quiet: runs with or without a microphone
      timeDriven: true,
      showPitch: false,
      showHold: false,
      showLevel: false,
      pitchChallenge: false,
      autoPiano: false,
      autoRecord: false,
      // The exercise's five steps, in its words and order: stand tall first,
      // then the four releases (103 s, inside the daily session's 105 s)
      phases: [
        {
          label: "Stand tall, shoulders down",
          labelEs: "De pie, hombros bajos",
          short: "Stand",
          shortEs: "De pie",
          art: "stand",
          setup: true,
          sec: 6,
          cue: "Stand tall, shoulders down, nothing tight at the waist or the collar.",
          cueEs: "De pie, hombros bajos, nada apretado en la cintura ni en el cuello."
        },
        {
          label: "Jaw hangs",
          labelEs: "Mandíbula suelta",
          short: "Jaw",
          shortEs: "Mandíbula",
          art: "jaw",
          sec: 22,
          cue: "Two fingers on the hinge: let the mouth fall open with no push. Keep breathing.",
          cueEs: "Dos dedos en la bisagra: deja caer la boca sin empujar. Sigue respirando."
        },
        {
          label: "Slow neck half-circles",
          labelEs: "Medios círculos de cuello",
          short: "Neck",
          shortEs: "Cuello",
          art: "neck",
          sec: 30,
          cue: "Ear to shoulder, chin past the chest, to the other shoulder and back. Never roll the head back.",
          cueEs: "Oreja al hombro, la barbilla pasa por el pecho, al otro hombro y vuelta. Nunca eches la cabeza atrás."
        },
        {
          label: "Loose chewing hum",
          labelEs: "Masticar y tararear",
          short: "Chew",
          shortEs: "Masticar",
          art: "chew",
          sec: 25,
          cue: "Chew an imaginary gum, lips closed, with a soft hum (the only sound here). Tongue loose.",
          cueEs: "Mastica un chicle imaginario, labios cerrados, con un tarareo suave (el único sonido). Lengua floja."
        },
        {
          label: "Three silent pre-yawns",
          labelEs: "Tres pre-bostezos en silencio",
          short: "Pre-yawns",
          shortEs: "Pre-bostezos",
          art: "yawns",
          sec: 20,
          cue: "The inside grows, the face stays calm. Stop before the yawn.",
          cueEs: "El interior crece, la cara tranquila. Párate antes del bostezo."
        }
      ],
      cue: "Release before you sing: quiet except a soft hum while chewing. Steps advance on their own.",
      cueEs: "Soltar antes de cantar: en silencio, salvo un tarareo suave al masticar. Los pasos avanzan solos.",
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
      pattern: { in: 4, hold: 0, out: 6 },
      cue: "Optional fixed visual pace: inhale 4 · no hold · exhale 6. If too long, ignore the screen and breathe naturally or stop. Not a measurement.",
      cueEs: "Ritmo visual fijo y opcional: inhala 4 · sin retener · espira 6. Si incomoda, ignora la pantalla y respira natural o para. No es una medición.",
      metricHints: {}
    },
    "s19-soft-palate-surprise": {
      mode: "openSpace",
      // The skill is the space, not the note: its own picture replaces the
      // pitch highway, in the first screen. Silent steps run on the clock.
      timeDriven: true,
      showPitch: false,
      showHold: false,
      showLevel: true,
      pitchChallenge: false,
      autoPiano: true,
      autoRecord: true,
      refPitch: "C3",
      minHoldMs: 1500,
      phases: [
        {
          label: "Surprise face",
          labelEs: "Cara de sorpresa",
          short: "Surprise",
          shortEs: "Sorpresa",
          art: "surprise",
          sec: 20,
          cue: "Surprising news: the jaw drops on its own. No sound yet.",
          cueEs: "Una noticia sorprendente: la mandíbula cae sola. Todavía sin sonido."
        },
        {
          label: "Stop before the yawn",
          labelEs: "Párate antes del bostezo",
          short: "Pre-yawn",
          shortEs: "Pre-bostezo",
          art: "chapel",
          sec: 20,
          cue: "The instant before a yawn: the back of the mouth lifts. Hold that inner space, silently.",
          cueEs: "El instante antes de bostezar: el fondo de la boca se eleva. Sostén ese espacio, en silencio."
        },
        {
          label: "Sing in that space",
          labelEs: "Canta en ese espacio",
          short: "/A/",
          shortEs: "/A/",
          sound: true,
          ref: true,
          sec: 45,
          cue: "A comfortable /A/ from inside that space. Every hold of 1.5 s or more is counted.",
          cueEs: "Una /A/ cómoda desde dentro de ese espacio. Cuenta cada sostenido de 1,5 s o más."
        },
        {
          label: "Closed, then open",
          labelEs: "Cerrado, luego abierto",
          short: "A/B",
          shortEs: "A/B",
          sound: true,
          ab: true,
          sec: 25,
          cue: "One phrase with the space closed, then the same phrase open, at the same loudness.",
          cueEs: "Una frase con el espacio cerrado y luego la misma abierta, al mismo volumen."
        },
        {
          label: "Phrase with the space",
          labelEs: "Una frase con el espacio",
          short: "Phrase",
          shortEs: "Frase",
          sound: true,
          sec: 35,
          cue: "A line you know, keeping the pre-yawn space all the way through.",
          cueEs: "Una frase que sepas, manteniendo el espacio de pre-bostezo hasta el final."
        }
      ],
      cue: "Surprise, then the pre-yawn, in silence; then sing from that space. Sung holds of 1.5 s or more are counted.",
      cueEs: "Sorpresa y pre-bostezo, en silencio; luego canta desde ese espacio. Cuentan los sostenidos de 1,5 s o más.",
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
