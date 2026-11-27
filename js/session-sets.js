/**
 * Goal sets ("Rutinas por objetivo"): short prepared routines with one purpose
 * each, on both tracks. Today's basics (js/daily-loop.js) answer "what do I
 * practise today"; a set answers "I speak in ten minutes", "my voice is tired
 * after class", "I want to work on pitch".
 *
 * What a set is: an ordered list of catalog exercises with a timer each, run
 * by the same guided engine as the basics (js/session.js, path "set"). It
 * adds no measurement of its own and makes no promise: each card says what the
 * set is for, what kind of evidence stands behind it, and where that comes
 * from (docs/47-SESSION-SETS.md keeps the full reasoning and the sources).
 *
 * What it deliberately is not:
 * - not today's basics: finishing a set does not pick a size or draw a card.
 *   The practice inside it counts toward the day like any other practice;
 * - not a second store: nothing is saved beyond the running session, so there
 *   is nothing to sync, migrate or lose. "Hecho hoy" is read from the day's
 *   own ledger (js/practice-days.js).
 *
 * The same file draws the step trail on the session banner for every routine
 * (basics, the class, catalog routes, sets): one mark per step under the
 * line "Ejercicio 3 de 7". It is decoration for the eye; the words carry the
 * position, so it is hidden from assistive technology.
 */
(function (global) {
  "use strict";

  /**
   * Evidence behind a set, in three plain grades. The grade describes the
   * research on the techniques in healthy voices, never the learner.
   *   mod  = controlled trials or reviews agree on a short-term effect
   *   lim  = few or small studies, or mixed results
   *   trad = taught by tradition; no good study either way
   */
  const GRADES = ["mod", "lim", "trad"];
  /** Filled marks out of three. "Moderate" is never drawn full: no technique here has strong long-term evidence. */
  const GRADE_MARKS = { mod: 2, lim: 1, trad: 0 };

  /** Short step names for exercises the loop's teasers do not name (js/daily-loop.js SHORT). */
  const SHORT = {
    "s3-song-stanzas": ["frase de canción", "song phrase"],
    "s12-easy-onset": ["inicio fácil", "easy onset"],
    "s20-five-vowels": ["cinco vocales", "five vowels"],
    "s6-straw": ["pajita", "straw"],
    "s8-breath-support": ["apoyo en S", "support on S"],
    "s13-arpeggio-match": ["arpegio", "arpeggio"],
    "s14-staccato-legato": ["staccato y legato", "staccato and legato"],
    "v11-kill-fillers": ["muletillas", "fillers"],
    "v17-strategic-concision": ["ir al grano", "getting to the point"],
    "v20-energy-match": ["energía", "energy"],
    "v21-straw-to-speech": ["pajita y frase", "straw to speech"],
    "v22-voice-recovery": ["silencio y pajita", "quiet, then straw"],
    "v23-clear-speech": ["habla clara", "clear speech"],
    "v24-vocal-function": ["función vocal", "vocal function"],
    "s28-vocal-function": ["función vocal", "vocal function"]
  };

  /* A step is [exerciseId, seconds]. Seconds never exceed the exercise's own
     timer (tests/node/session-sets.test.mjs). Content, not interface, so the
     words live here and not in js/i18n.js, as the voice cards do. */
  const SETS = [
    {
      id: "v-pretalk",
      focus: "coordination",
      track: "vocal",
      grade: "lim",
      steps: [
        ["s18-costal-breath", 60],
        ["v21-straw-to-speech", 300],
        ["v2-volume", 90]
      ],
      es: {
        name: "Antes de hablar",
        goal: "Para una clase, una reunión o una llamada larga.",
        why: "Los sonidos con la boca medio cerrada (una pajita, trinos, hum) bajaron la presión que hace falta para que la voz arranque y el esfuerzo que se siente, en una revisión de 53 estudios con adultos sin formación vocal. Cuánto dura se midió poco, y que calentar mejore cómo hablas después está poco probado.",
        tip: "Termina unos minutos antes de empezar: en un estudio con 26 adultos sanos, justo después de calentar la voz se sintió más esforzada, y a los cinco minutos de silencio ya no.",
        src: "Apfelbach y Guzmán 2024 (revisión de 53 estudios); Whitling et al. 2023"
      },
      en: {
        name: "Before you speak",
        goal: "For a class, a meeting or a long call.",
        why: "Sounds made with the mouth half closed (a straw, trills, humming) lowered the pressure it takes to start the voice and the effort people felt, in a review of 53 studies of adults without voice training. How long it lasts was rarely measured, and that warming up improves how you speak afterwards is barely tested.",
        tip: "Finish a few minutes before you start: in a study of 26 healthy adults the voice felt more effortful right after warming up, and no longer did after five quiet minutes.",
        src: "Apfelbach & Guzmán 2024 (review of 53 studies); Whitling et al. 2023"
      }
    },
    {
      id: "v-aftertalk",
      focus: "recovery",
      track: "vocal",
      grade: "mod",
      steps: [
        ["s17-jaw-neck-release", 105],
        ["v22-voice-recovery", 600]
      ],
      es: {
        name: "Después de hablar mucho",
        goal: "Para soltar la voz tras dar clase o una jornada de llamadas.",
        why: "En un ensayo con 114 adultos sanos, tras una hora de uso intenso de la voz, cinco minutos de silencio y cinco de sonido por una pajita recuperaron la voz mejor que diez de silencio. Es un resultado a corto plazo, de un solo estudio.",
        tip: "Ten a mano un vaso de agua y tu pajita. Los cinco minutos de silencio van dentro de la rutina: un tono suave te avisa cuando terminan.",
        src: "Peng et al. 2026, ensayo aleatorizado"
      },
      en: {
        name: "After a lot of talking",
        goal: "To ease the voice after teaching or a day of calls.",
        why: "In a trial with 114 healthy adults, after an hour of heavy voice use, five minutes of silence and five of sound through a straw brought the voice back better than ten of silence. It is a short-term result from one study.",
        tip: "Have a glass of water and your straw at hand. The five quiet minutes are inside the routine: a soft tone tells you when they end.",
        src: "Peng et al. 2026, randomised trial"
      }
    },
    {
      id: "v-clarity",
      focus: "speech",
      track: "vocal",
      grade: "lim",
      steps: [
        ["v23-clear-speech", 240],
        ["v1-diction", 150],
        ["v10-power-pause", 150]
      ],
      es: {
        name: "Que se te entienda",
        goal: "Para hablar claro ante un grupo o por videollamada.",
        why: "A quien habla claro a propósito se le entiende mejor: en el estudio clásico, 5 oyentes con pérdida auditiva entendieron unos 17 puntos porcentuales más, y una revisión describe la mejora en otros grupos de oyentes. Quienes hablaban iban más despacio, hacían más pausas y terminaban las consonantes finales. Esos estudios no midieron cuánto se aprende practicándolo en casa.",
        tip: "",
        src: "Picheny et al. 1985; Picheny et al. 1986; Smiljanić y Bradlow 2009 (revisión)"
      },
      en: {
        name: "Be understood",
        goal: "To speak clearly to a group or on a video call.",
        why: "People who speak clearly on purpose are easier to understand: in the classic study, 5 listeners with hearing loss understood about 17 percentage points more, and a review describes the gain for other groups of listeners. The speakers spoke more slowly, paused more and finished their final consonants. Those studies did not measure how much of it you learn by practising at home.",
        tip: "",
        src: "Picheny et al. 1985; Picheny et al. 1986; Smiljanić & Bradlow 2009 (review)"
      }
    },
    {
      id: "v-expression",
      focus: "speech",
      track: "vocal",
      grade: "lim",
      steps: [
        ["v12-melodic-speech", 180],
        ["v13-volume-ladder", 150],
        ["v19-authority-close", 120],
        ["v20-energy-match", 150]
      ],
      es: {
        name: "Voz con expresión",
        goal: "Para que tu voz suba, baje y cierre las frases con intención.",
        why: "En un estudio, 8 oyentes puntuaron con más carisma los fragmentos de discursos políticos con el tono más alto y más variado. En otro, 14 estudiantes de inglés variaron más el tono practicando con una señal visual de esa variación que solo de oído. Son estudios pequeños. La app mide tu tono y tu volumen contra los tuyos, no contra una norma.",
        tip: "",
        src: "Rosenberg y Hirschberg 2005; Hincks y Edlund 2009"
      },
      en: {
        name: "An expressive voice",
        goal: "So your voice rises, falls and closes sentences on purpose.",
        why: "In one study, 8 listeners rated clips of political speeches as more charismatic when the pitch was higher and more varied. In another, 14 learners of English varied their pitch more after practising with a visual signal of that variation than by ear alone. Both are small studies. The app measures your pitch and loudness against your own, not against a norm.",
        tip: "",
        src: "Rosenberg & Hirschberg 2005; Hincks & Edlund 2009"
      }
    },
    {
      id: "v-fillers",
      focus: "speech",
      track: "vocal",
      grade: "lim",
      steps: [
        ["v11-kill-fillers", 240],
        ["v10-power-pause", 180],
        ["v17-strategic-concision", 180]
      ],
      es: {
        name: "Pausas en vez de muletillas",
        goal: "Para cambiar el «eh…» por un silencio breve.",
        why: "Aprender a notar las propias muletillas las redujo en 7 estudios, la mayoría con universitarios. Dos de ellos enseñaron además una pausa en silencio y midieron su uso: tras el entrenamiento, solo 1 persona en cada uno la siguió usando a un nivel moderado o alto, y las muletillas bajaron de todos modos. Los seis que dan la cifra tuvieron entre 4 y 9 personas cada uno.",
        tip: "",
        src: "Luiselli 2022 (revisión de 7 estudios); Mancuso y Miltenberger 2016; Pawlik y Perrin 2020; Perrin et al. 2021"
      },
      en: {
        name: "Pauses instead of fillers",
        goal: "To swap the “um…” for a short silence.",
        why: "Learning to notice your own fillers reduced them in 7 studies, most with university students. Two of them also taught a silent pause and tracked its use: after training, only 1 person in each kept using it at a moderate or high level, and the fillers fell all the same. The six that give a number had 4 to 9 people each.",
        tip: "",
        src: "Luiselli 2022 (review of 7 studies); Mancuso & Miltenberger 2016; Pawlik & Perrin 2020; Perrin et al. 2021"
      }
    },
    {
      id: "v-voice",
      focus: "coordination",
      track: "vocal",
      grade: "mod",
      steps: [
        ["v21-straw-to-speech", 300],
        ["v24-vocal-function", 420]
      ],
      es: {
        name: "Voz en forma",
        goal: "Un plan de seis semanas que entrena la voz con sonidos suaves.",
        why: "En estudios pequeños, los Ejercicios de Función Vocal alargaron el tiempo que personas con la voz sana podían sostener un sonido; uno, con 35 mujeres, los comparó con un placebo y con no hacer nada. Esas mejoras fueron en tareas de voz (cuánto se sostiene un sonido, flujo de aire, rango de tono), que no es lo mismo que cómo suena la voz al hablar en el día a día.",
        tip: "En el estudio que comparó dosis, los ejercicios se hicieron dos veces al día. Todo suave: nunca aguantes un sonido más allá de lo cómodo.",
        src: "Stemple et al. 1994; Bane et al. 2019; Angadi et al. 2019 (revisión)"
      },
      en: {
        name: "A voice in shape",
        goal: "A six-week plan that trains the voice with soft sounds.",
        why: "In small trials, the Vocal Function Exercises lengthened how long people with healthy voices could sustain a sound; one, with 35 women, compared them with a placebo and with doing nothing. Those gains were in voice tasks (how long a sound is held, airflow, pitch range), which is not the same as how the voice sounds in everyday speech.",
        tip: "In the study that compared doses, the exercises were done twice a day. Keep it all soft: never hold a sound longer than is comfortable.",
        src: "Stemple et al. 1994; Bane et al. 2019; Angadi et al. 2019 (review)"
      }
    },
    {
      id: "s-warmup",
      focus: "coordination",
      track: "singing",
      grade: "lim",
      steps: [
        ["s17-jaw-neck-release", 60],
        ["s18-costal-breath", 60],
        ["s4-lip-trills", 90],
        ["s5-sirens", 90],
        ["s7-humming", 75],
        ["s10-five-note", 105]
      ],
      es: {
        name: "Calentar para cantar",
        goal: "Antes de un ensayo, una clase o tus canciones.",
        why: "En una revisión de estudios con adultos sin formación vocal, los sonidos con la boca medio cerrada, la familia de los trinos y el hum, tendieron a bajar la presión que hace falta para que la voz arranque; la revisión no incluyó cantantes. Tras calentar, las 12 cantantes de un estudio notaron cambios en su propia voz; quienes escuchaban notaron la diferencia solo en algunas.",
        tip: "",
        src: "Apfelbach y Guzmán 2024 (revisión); Moorcroft y Kenny 2013"
      },
      en: {
        name: "Warm up to sing",
        goal: "Before a rehearsal, a lesson or your songs.",
        why: "In a review of studies of adults without voice training, sounds made with the mouth half closed (the family that trills and humming belong to) tended to lower the pressure it takes to start the voice; the review did not include singers. After warming up, the 12 female singers in one study noticed changes in their own voice; listeners heard the difference in only some of them.",
        tip: "",
        src: "Apfelbach & Guzmán 2024 (review); Moorcroft & Kenny 2013"
      }
    },
    {
      id: "s-pitch",
      focus: "pitch",
      track: "singing",
      grade: "lim",
      steps: [
        ["s9-pitch-match", 180],
        ["s10-five-note", 150],
        ["s13-arpeggio-match", 180],
        ["s16-major-scale-coord", 150]
      ],
      es: {
        name: "Afinación",
        goal: "De una nota sola a la escala, viendo tu tono en pantalla.",
        why: "En un ensayo con adultos que desafinaban, 20 minutos de práctica viendo el tono además de oírlo mejoraron la afinación más que practicar solo de oído; se midió justo después. En otro, de 10 semanas, ver el tono no dio ventaja sobre practicar sin verlo: los dos grupos mejoraron.",
        tip: "",
        src: "Berglin, Pfordresher y Demorest 2022; Paney y Tharp 2021"
      },
      en: {
        name: "Pitch",
        goal: "From one note to the scale, with your pitch on screen.",
        why: "In a trial with adults who sang off pitch, 20 minutes of practice seeing the pitch as well as hearing it improved accuracy more than practising by ear alone; it was measured right afterwards. In another, over 10 weeks, seeing the pitch gave no advantage over practising without it: both groups improved.",
        tip: "",
        src: "Berglin, Pfordresher & Demorest 2022; Paney & Tharp 2021"
      }
    },
    {
      id: "s-technique",
      focus: "coordination",
      track: "singing",
      grade: "lim",
      steps: [
        ["s18-costal-breath", 90],
        ["s6-straw", 120],
        ["s8-breath-support", 150],
        ["s12-easy-onset", 120],
        ["s11-dynamics", 150],
        ["s14-staccato-legato", 150]
      ],
      es: {
        name: "Técnica en 13 minutos",
        goal: "Aire, arranque suave, volumen y articulación de las notas.",
        why: "La pajita pertenece a una familia de ejercicios que cuenta con una revisión de 53 estudios; esa revisión incluyó adultos sin formación vocal, no cantantes. El resto son ejercicios de coordinación que se enseñan en casi todas las clases de canto, con pocos estudios propios.",
        tip: "",
        src: "Apfelbach y Guzmán 2024 (revisión)"
      },
      en: {
        name: "Technique in 13 minutes",
        goal: "Air, a soft start, loudness and how notes are joined.",
        why: "The straw belongs to a family of exercises with a review of 53 studies behind it; that review covered adults without voice training, not singers. The rest are coordination exercises taught in nearly every singing class, with few studies of their own.",
        tip: "",
        src: "Apfelbach & Guzmán 2024 (review)"
      }
    },
    {
      id: "s-function",
      focus: "coordination",
      track: "singing",
      grade: "mod",
      steps: [
        ["s28-vocal-function", 420],
        ["s6-straw", 180]
      ],
      es: {
        name: "Función vocal",
        goal: "Un plan de seis semanas: notas largas y suaves, y la pajita.",
        why: "En estudios pequeños, los Ejercicios de Función Vocal alargaron el tiempo que personas con la voz sana podían sostener un sonido; en uno, 10 cantantes los hicieron cuatro semanas y otros 10 no. Esas mejoras fueron en el flujo de aire y en cuánto se sostiene un sonido, que no es lo mismo que cantar mejor.",
        tip: "En el estudio que comparó dosis, los ejercicios se hicieron dos veces al día. Si las notas te quedan incómodas, cambia la octava antes de empezar.",
        src: "Stemple et al. 1994; Sabol et al. 1995; Bane et al. 2019"
      },
      en: {
        name: "Vocal function",
        goal: "A six-week plan: long, soft notes, and the straw.",
        why: "In small trials, the Vocal Function Exercises lengthened how long people with healthy voices could sustain a sound; in one, 10 singers did them for four weeks and another 10 did not. Those gains were in airflow and in how long a sound is held, which is not the same as singing better.",
        tip: "In the study that compared doses, the exercises were done twice a day. If the notes sit uncomfortably, move the octave before you start.",
        src: "Stemple et al. 1994; Sabol et al. 1995; Bane et al. 2019"
      }
    },
    {
      id: "s-range",
      focus: "pitch",
      track: "singing",
      grade: "trad",
      steps: [
        ["s4-lip-trills", 90],
        ["s5-sirens", 120],
        ["s24-nana-high", 150],
        ["s25-zone-tour", 150]
      ],
      es: {
        name: "Graves, medios y agudos",
        goal: "Para pasear la voz por todo tu registro sin apretar.",
        why: "Las «zonas» de resonancia son una imagen de la clase de canto, útil para muchos. Aquí se usa como imagen, no como algo medido: el micrófono oye tu tono, no dónde resuena.",
        tip: "",
        src: "Tradición de clase"
      },
      en: {
        name: "Low, middle and high",
        goal: "To take the voice across your whole range without squeezing.",
        why: "Resonance “zones” are a singing-class image, useful to many. Here it is used as an image, not as something measured: the microphone hears your pitch, not where it resonates.",
        tip: "",
        src: "Class tradition"
      }
    },
    {
      id: "s-cooldown",
      focus: "recovery",
      track: "singing",
      grade: "lim",
      steps: [
        ["s5-sirens", 90],
        ["s6-straw", 150],
        ["s7-humming", 90]
      ],
      es: {
        name: "Enfriar la voz",
        goal: "Después de cantar: sonidos suaves, de agudo a grave.",
        why: "En un estudio con 20 cantantes, la mayoría dijo sentir la voz mejor tras enfriar, pero el cambio no fue estadísticamente significativo y quienes escuchaban no distinguieron la semana con enfriamiento. Es breve y suave: hazlo si te sienta bien.",
        tip: "",
        src: "Ragan 2016"
      },
      en: {
        name: "Cool the voice down",
        goal: "After singing: soft sounds, from high to low.",
        why: "In a study of 20 singers, most said the voice felt better after cooling down, but the change was not statistically significant and listeners could not tell which week had the cool-down. It is brief and gentle: do it if it feels good.",
        tip: "",
        src: "Ragan 2016"
      }
    },
    {
      "id": "s-breath-phrases",
      "track": "singing",
      "focus": "breath",
      "grade": "trad",
      "steps": [
        [
          "s18-costal-breath",
          60
        ],
        [
          "s15-sh-air-ladder",
          90
        ],
        [
          "s3-song-stanzas",
          150
        ]
      ],
      "es": {
        "name": "Aire para una frase",
        "goal": "Practica una salida de aire cómoda y elige dónde volver a respirar al cantar.",
        "why": "Esta secuencia es una propuesta de práctica, no una medición de capacidad pulmonar ni un tratamiento. El SH es una tarea distinta de cantar; comprueba después si la frase se siente cómoda.",
        "tip": "Puedes respirar dentro de una frase. Acórtala o cambia la tonalidad antes de forzar; detente si hay dolor, mareo o ronquera.",
        "src": "Diseño pedagógico; NIDCD, cuidado de la voz"
      },
      "en": {
        "name": "Breath for a phrase",
        "goal": "Practise comfortable airflow and choose where to breathe again in a song.",
        "why": "This sequence is a practice design, not a lung-capacity measurement or treatment. SH is a different task from singing; check afterwards whether the phrase feels comfortable.",
        "tip": "You can breathe within a phrase. Shorten it or change key before forcing; stop for pain, dizziness or hoarseness.",
        "src": "Teaching design; NIDCD voice care"
      }
    },
    {
      "id": "s-rhythm-phrasing",
      "track": "singing",
      "focus": "song",
      "grade": "trad",
      "steps": [
        [
          "s14-staccato-legato",
          90
        ],
        [
          "s16-major-scale-coord",
          90
        ],
        [
          "s3-song-stanzas",
          180
        ]
      ],
      "es": {
        "name": "Ritmo y fraseo",
        "goal": "Lleva un patrón lento a una frase de canción con pulso y pausas elegidas.",
        "why": "Un patrón y una canción piden cosas distintas. Aquí comparas duración de notas, sílabas y silencios en una frase; esta rutina concreta no es un programa clínicamente validado.",
        "tip": "Primero marca el pulso sin cantar. Luego canta despacio en una zona cómoda. Escucha una toma corta y elige un cambio para el siguiente intento.",
        "src": "Diseño pedagógico; práctica de repertorio"
      },
      "en": {
        "name": "Rhythm and phrasing",
        "goal": "Take a slow pattern into a song phrase with a pulse and chosen pauses.",
        "why": "A pattern and a song make different demands. Here you compare note lengths, syllables and silences in a phrase; this particular routine is not a clinically validated programme.",
        "tip": "First tap the pulse without singing. Then sing slowly in a comfortable range. Listen back to one short take, then choose one change for the next attempt.",
        "src": "Teaching design; repertoire practice"
      }
    },
    {
      "id": "s-onset-words",
      "track": "singing",
      "focus": "coordination",
      "grade": "trad",
      "steps": [
        [
          "s12-easy-onset",
          90
        ],
        [
          "s20-five-vowels",
          90
        ],
        [
          "s3-song-stanzas",
          150
        ]
      ],
      "es": {
        "name": "Inicio, vocal y palabra",
        "goal": "Pasa de una vocal cómoda a las consonantes y palabras de una canción.",
        "why": "Esta propuesta combina tareas del catálogo para comparar el inicio y la continuidad del sonido. El gráfico de afinación no mide cierre de los pliegues vocales ni calidad artística.",
        "tip": "Prueba una vocal, luego tu propio texto. No aprietes para buscar un cierre; cambia la frase si exige esfuerzo.",
        "src": "Diseño pedagógico; NIDCD, cuidado de la voz"
      },
      "en": {
        "name": "Onset, vowel and word",
        "goal": "Move from a comfortable vowel to a song’s consonants and words.",
        "why": "This design combines catalogue tasks to compare the onset and continuity of sound. The pitch graph does not measure vocal-fold closure or artistic quality.",
        "tip": "Try a vowel, then your own words. Do not squeeze to seek closure; change the phrase if it demands effort.",
        "src": "Teaching design; NIDCD voice care"
      }
    },
    {
      "id": "s-song-listening",
      "track": "singing",
      "focus": "song",
      "grade": "trad",
      "steps": [
        [
          "s9-pitch-match",
          90
        ],
        ["s7-humming", 60],
        ["s3-song-stanzas", 180]
      ],
      "es": {
        "name": "Escuchar y transferir",
        "goal": "Compara una nota de referencia con una frase y escucha una toma sin acompañamiento.",
        "why": "La canción añade texto, ritmo e intención a las notas aisladas. La grabación sirve para tu revisión; esta secuencia no demuestra por sí sola mejora duradera ni puntúa expresividad.",
        "tip": "Elige solo un foco: afinación, ritmo, palabra o pausa. Repite sin la referencia y comprueba qué recuerdas.",
        "src": "Diseño pedagógico; práctica de repertorio"
      },
      "en": {
        "name": "Listen and transfer",
        "goal": "Compare a reference note with a phrase and listen to a take without accompaniment.",
        "why": "A song adds text, rhythm and intention to isolated notes. Recording supports your own review; this sequence alone does not demonstrate lasting improvement or score expression.",
        "tip": "Choose just one focus: pitch, rhythm, word or pause. Repeat without the reference and check what you remember.",
        "src": "Teaching design; repertoire practice"
      }
    },
    {
      "id": "v-breath-pauses",
      "track": "vocal",
      "focus": "breath",
      "grade": "trad",
      "steps": [
        [
          "s18-costal-breath",
          60
        ],
        [
          "v10-power-pause",
          150
        ],
        [
          "v23-clear-speech",
          150
        ]
      ],
      "es": {
        "name": "Aire y pausas al hablar",
        "goal": "Practica una inhalación cómoda y pausas que ayuden a entender tu mensaje.",
        "why": "Esta secuencia aplica tareas del catálogo al habla. No mide función respiratoria: compara una grabación con pausas elegidas y otra a tu ritmo habitual.",
        "tip": "No aguantes el aire para acabar una oración. Divide la idea y respira antes si lo necesitas.",
        "src": "Diseño pedagógico; NIDCD, cuidado de la voz"
      },
      "en": {
        "name": "Breath and pauses in speech",
        "goal": "Practise a comfortable inhalation and pauses that help a listener follow your message.",
        "why": "This sequence applies catalogue tasks to speech. It does not measure respiratory function: compare a recording with chosen pauses against one at your usual pace.",
        "tip": "Do not hold your breath to finish a sentence. Split the idea and breathe sooner if needed.",
        "src": "Teaching design; NIDCD voice care"
      }
    },
    {
      "id": "v-text-phrasing",
      "track": "vocal",
      "focus": "speech",
      "grade": "trad",
      "steps": [
        [
          "v1-diction",
          90
        ],
        [
          "v10-power-pause",
          120
        ],
        [
          "v23-clear-speech",
          120
        ]
      ],
      "es": {
        "name": "Texto, pausa e intención",
        "goal": "Lleva la articulación a un mensaje corto con pausas elegidas.",
        "why": "Esta propuesta combina dicción, pausas y revisión de una grabación. Valora si se entiende el mensaje; las palabras por minuto no miden por sí solas claridad o intención.",
        "tip": "Usa tu propio texto. Elige un cambio concreto antes de repetir y permite respirar dentro de una oración.",
        "src": "Diseño pedagógico; práctica del habla"
      },
      "en": {
        "name": "Text, pause and intention",
        "goal": "Take articulation into a short message with chosen pauses.",
        "why": "This design combines diction, pauses and recording review. Judge whether the message is understandable; words per minute alone do not measure clarity or intention.",
        "tip": "Use your own text. Choose one specific change before repeating and allow breaths within a sentence.",
        "src": "Teaching design; speech practice"
      }
    },
    {
      "id": "v-listen-contrast",
      "track": "vocal",
      "focus": "speech",
      "grade": "trad",
      "steps": [
        [
          "v14-pace-variation",
          150
        ],
        [
          "v23-clear-speech",
          150
        ]
      ],
      "es": {
        "name": "Escuchar dos versiones",
        "goal": "Compara una frase habitual con otra dicha con claridad deliberada.",
        "why": "Esta secuencia propone comparar tus propias tomas; una grabación personal no equivale a una evaluación clínica ni a una prueba con oyentes.",
        "tip": "Mantén el mismo texto en ambas tomas y escucha una diferencia concreta: consonantes, pausas o velocidad.",
        "src": "Diseño pedagógico; práctica del habla"
      },
      "en": {
        "name": "Listen to two versions",
        "goal": "Compare a phrase at your usual pace with one spoken deliberately clearly.",
        "why": "This sequence proposes comparing your own takes; a personal recording is not a clinical evaluation or a test with listeners.",
        "tip": "Keep the same text in both takes and listen for one specific difference: consonants, pauses or pace.",
        "src": "Teaching design; speech practice"
      }
    },
    {
      "id": "v-easy-message",
      "track": "vocal",
      "focus": "coordination",
      "grade": "trad",
      "steps": [
        [
          "s7-humming",
          60
        ],
        [
          "v21-straw-to-speech",
          300
        ]
      ],
      "es": {
        "name": "De sonido cómodo a mensaje",
        "goal": "Compara un sonido suave con una frase hablada sin empujar el volumen.",
        "why": "Esta secuencia conecta dos tareas del catálogo. La comodidad es una valoración personal; un zumbido en la cara no demuestra dónde se produce la voz ni demuestra eficiencia.",
        "tip": "Usa una cañita limpia y una frase breve. Descansa o termina antes si lo necesitas; no busques más resistencia.",
        "src": "Diseño pedagógico; NIDCD, cuidado de la voz"
      },
      "en": {
        "name": "From easy sound to message",
        "goal": "Compare a soft sound with a spoken phrase without pushing volume.",
        "why": "This sequence connects two catalogue tasks. Comfort is a personal rating; facial vibration does not establish where voice is produced or demonstrate efficiency.",
        "tip": "Use a clean straw and a short phrase. Rest or finish early if needed; do not seek more resistance.",
        "src": "Teaching design; NIDCD voice care"
      }
    }
  ];

  /** Optional targeted skills; exercises, timers and day ledger remain unchanged. */
  const SKILL_SETS = [
  {
    "id": "s-skill-breath",
    "track": "singing",
    "focus": "breath",
    "steps": [
      [
        "s18-costal-breath",
        60
      ],
      [
        "s8-breath-support",
        120
      ],
      [
        "s3-song-stanzas",
        180
      ]
    ],
    "grade": "lim",
    "evidence": [
      "RMT26",
      "ASHA"
    ],
    "kind": "skill",
    "es": {
      "name": "Aire entre frases",
      "goal": "Respira por ideas, sin cortar cada palabra ni empujar.",
      "cue": "Señala una pausa de sentido en un texto propio.",
      "check": "Prueba una idea completa con hombros y cuello libres.",
      "transfer": "Canta otra frase nueva y elige dónde descansar.",
      "fallback": "Sin micrófono: acorta la frase. Para ante dolor o mareo.",
      "why": "Mejor fuerza respiratoria no equivale a mejor canto; la transferencia musical no es concluyente.",
      "tip": "Si falta aire, divide la frase en vez de aguantar.",
      "src": "RMT26, ASHA"
    },
    "en": {
      "name": "Breath between phrases",
      "goal": "Choose meaningful breaths without pushing.",
      "cue": "Mark a natural pause in your own sentence.",
      "check": "Sing a thought with a relaxed neck and shoulders.",
      "transfer": "Try a fresh phrase and choose a comfortable pause.",
      "fallback": "No mic: shorten the line. Stop for pain or dizziness.",
      "why": "Respiratory strength is not musical performance; transfer evidence remains inconclusive.",
      "tip": "Breathe sooner rather than force the line.",
      "src": "RMT26, ASHA"
    }
  },
  {
    "id": "s-skill-onset",
    "track": "singing",
    "focus": "coordination",
    "steps": [
      [
        "s7-humming",
        90
      ],
      [
        "s12-easy-onset",
        120
      ],
      [
        "s20-five-vowels",
        120
      ]
    ],
    "grade": "lim",
    "evidence": [
      "ASHA",
      "NIDCD"
    ],
    "kind": "skill",
    "es": {
      "name": "Iniciar sin apretar",
      "goal": "Explora el inicio suave de una vocal cómoda.",
      "cue": "Comienza con un tarareo ligero.",
      "check": "Alterna una vocal y una palabra sin apretar mandíbula.",
      "transfer": "Empieza otra frase sin buscar volumen máximo.",
      "fallback": "Descansa ante ronquera o dolor; evita ataques duros.",
      "why": "Fonación fluida orienta el ejercicio, no prescribe una dosis universal.",
      "tip": "La comodidad importa más que el volumen.",
      "src": "ASHA, NIDCD"
    },
    "en": {
      "name": "Gentle sound onset",
      "goal": "Explore an easy start on a comfortable vowel.",
      "cue": "Begin with a light hum.",
      "check": "Alternate a vowel and a word without jaw tension.",
      "transfer": "Start a fresh phrase without chasing loudness.",
      "fallback": "Rest for pain or hoarseness; avoid hard attacks.",
      "why": "Flow phonation informs this task but does not prescribe a universal dose.",
      "tip": "Comfort matters more than loudness.",
      "src": "ASHA, NIDCD"
    }
  },
  {
    "id": "s-skill-sovt",
    "track": "singing",
    "focus": "coordination",
    "steps": [
      [
        "s4-lip-trills",
        90
      ],
      [
        "s6-straw",
        120
      ],
      [
        "s7-humming",
        90
      ]
    ],
    "grade": "lim",
    "evidence": [
      "SOVT25",
      "SOVT26",
      "MAP26"
    ],
    "kind": "skill",
    "es": {
      "name": "Sonido fácil y SOVT",
      "goal": "Prueba hum, trino o pajita sin aumentar la fuerza.",
      "cue": "Compara un hum suave con un trino cómodo.",
      "check": "Pasa de un sonido semiocluido a una palabra breve.",
      "transfer": "Usa esa palabra en una frase no ensayada.",
      "fallback": "Si el trino no sale, elige hum; nunca soples fuerte.",
      "why": "Estudios de SOVT muestran algunos beneficios grupales, no una dosis universal.",
      "tip": "La vibración facial no mide tu anatomía.",
      "src": "SOVT25, SOVT26, MAP26"
    },
    "en": {
      "name": "Easy sound and SOVT",
      "goal": "Try humming, a trill or straw without force.",
      "cue": "Compare an easy hum with a gentle trill.",
      "check": "Move from a semi-occluded sound into a short word.",
      "transfer": "Use that word in an unfamiliar phrase.",
      "fallback": "If trilling fails, hum gently; never blow hard.",
      "why": "SOVT studies show some group outcomes, not universal doses.",
      "tip": "Facial buzzing does not measure anatomy.",
      "src": "SOVT25, SOVT26, MAP26"
    }
  },
  {
    "id": "s-skill-pitch",
    "track": "singing",
    "focus": "pitch",
    "steps": [
      [
        "s9-pitch-match",
        150
      ],
      [
        "s10-five-note",
        120
      ],
      [
        "s13-arpeggio-match",
        150
      ]
    ],
    "grade": "lim",
    "evidence": [
      "MOTOR26",
      "ASHA"
    ],
    "kind": "skill",
    "es": {
      "name": "Centro de afinación",
      "goal": "Encuentra una nota cómoda sin depender siempre del gráfico.",
      "cue": "Escucha una nota antes de verla en pantalla.",
      "check": "Iguala con la guía y repite sin mirarla.",
      "transfer": "Usa una nota nueva y escucha primero.",
      "fallback": "Sin pitch fiable, apóyate en oído y piano; no fuerces agudos.",
      "why": "El feedback variable puede apoyar aprendizaje; no prueba dominio musical.",
      "tip": "Una curva no es el juez de tu comodidad.",
      "src": "MOTOR26, ASHA"
    },
    "en": {
      "name": "Find pitch center",
      "goal": "Match comfortable notes without relying on a graph.",
      "cue": "Listen to a note before seeing its trace.",
      "check": "Try with feedback and once without it.",
      "transfer": "Use an unfamiliar note and listen first.",
      "fallback": "When pitch tracking fails, use ear and piano; no forced highs.",
      "why": "Variable feedback may aid learning, not certify competence.",
      "tip": "A pitch trace cannot judge comfort.",
      "src": "MOTOR26, ASHA"
    }
  },
  {
    "id": "s-skill-phrasing",
    "track": "singing",
    "focus": "song",
    "steps": [
      [
        "s14-staccato-legato",
        150
      ],
      [
        "s20-five-vowels",
        90
      ],
      [
        "s3-song-stanzas",
        180
      ]
    ],
    "grade": "trad",
    "evidence": [
      "MOTOR26",
      "NIDCD"
    ],
    "kind": "skill",
    "es": {
      "name": "Fraseo y legato",
      "goal": "Une sílabas y respira cuando cambia la idea.",
      "cue": "Compara notas separadas con legato fácil.",
      "check": "Une dos palabras sin morder consonantes.",
      "transfer": "Canta un fragmento propio con una pausa natural.",
      "fallback": "Acorta la línea antes de tensarte; usa texto propio.",
      "why": "Transferir un gesto a repertorio es una hipótesis de enseñanza.",
      "tip": "No hagas frases largas por competir.",
      "src": "MOTOR26, NIDCD"
    },
    "en": {
      "name": "Phrasing and legato",
      "goal": "Connect syllables and breathe where meaning shifts.",
      "cue": "Compare separated notes with easy legato.",
      "check": "Join two words without squeezing consonants.",
      "transfer": "Sing a new original line with a natural pause.",
      "fallback": "Shorten the line before strain; use your own words.",
      "why": "Transfer into repertoire is a teaching hypothesis.",
      "tip": "Longer is not automatically better.",
      "src": "MOTOR26, NIDCD"
    }
  },
  {
    "id": "v-skill-breath",
    "track": "vocal",
    "focus": "breath",
    "steps": [
      [
        "s18-costal-breath",
        60
      ],
      [
        "v10-power-pause",
        120
      ],
      [
        "v23-clear-speech",
        150
      ]
    ],
    "grade": "lim",
    "evidence": [
      "RMT26",
      "NIDCD"
    ],
    "kind": "skill",
    "es": {
      "name": "Aire para hablar",
      "goal": "Sostén una idea con pausas útiles.",
      "cue": "Marca pausas de sentido en un mensaje propio.",
      "check": "Di la idea y toma aire antes si hace falta.",
      "transfer": "Explica otro tema con pausas cómodas.",
      "fallback": "Sin mic: lee y marca pausas; no aguantes aire.",
      "why": "Fuerza respiratoria no equivale a claridad al hablar.",
      "tip": "Una pausa dentro de la oración es válida.",
      "src": "RMT26, NIDCD"
    },
    "en": {
      "name": "Breath for speaking",
      "goal": "Keep one idea clear with useful pauses.",
      "cue": "Mark natural breaks in your own message.",
      "check": "Say the idea and breathe sooner if needed.",
      "transfer": "Explain a new topic with comfortable pauses.",
      "fallback": "No mic: read and mark breaks; do not hold air.",
      "why": "Respiratory strength does not equal speech clarity.",
      "tip": "Breathing within a sentence is allowed.",
      "src": "RMT26, NIDCD"
    }
  },
  {
    "id": "v-skill-clarity",
    "track": "vocal",
    "focus": "speech",
    "steps": [
      [
        "v1-diction",
        120
      ],
      [
        "v23-clear-speech",
        150
      ],
      [
        "v10-power-pause",
        90
      ]
    ],
    "grade": "lim",
    "evidence": [
      "MOTOR26",
      "ASHA"
    ],
    "kind": "skill",
    "es": {
      "name": "Dicción entendible",
      "goal": "Que te entiendan sin exagerar la boca.",
      "cue": "Escucha primero una frase a tu ritmo habitual.",
      "check": "Repite con consonantes claras y pausas naturales.",
      "transfer": "Di otra idea y escucha si se entiende.",
      "fallback": "Sin grabación: lee y consulta a un oyente.",
      "why": "Claridad necesita oyentes, no solo velocidad o gráficos.",
      "tip": "No hay una sola forma obligatoria de boca.",
      "src": "MOTOR26, ASHA"
    },
    "en": {
      "name": "Understandable speech",
      "goal": "Be understood without exaggerated mouth shapes.",
      "cue": "Listen to one sentence at your usual pace.",
      "check": "Repeat with clear consonants and useful pauses.",
      "transfer": "Speak about a new topic and notice intelligibility.",
      "fallback": "No recording: read to another listener.",
      "why": "Intelligibility needs listeners, not only speed or graphs.",
      "tip": "No single compulsory mouth position.",
      "src": "MOTOR26, ASHA"
    }
  },
  {
    "id": "v-skill-ease",
    "track": "vocal",
    "focus": "coordination",
    "steps": [
      [
        "s7-humming",
        60
      ],
      [
        "v21-straw-to-speech",
        210
      ],
      [
        "v2-volume",
        120
      ]
    ],
    "grade": "lim",
    "evidence": [
      "SOVT25",
      "ASHA"
    ],
    "kind": "skill",
    "es": {
      "name": "Voz cómoda al hablar",
      "goal": "Busca una voz fácil sin empujar el volumen.",
      "cue": "Prueba un hum suave o pajita opcional.",
      "check": "Pasa del sonido a una frase breve.",
      "transfer": "Di otra frase con volumen habitual.",
      "fallback": "Ante ronquera/dolor, descansa; no fuerces una pajita.",
      "why": "SOVT tiene indicios en grupos estudiados; su transferencia diaria no está probada.",
      "tip": "La suavidad no exige susurrar.",
      "src": "SOVT25, ASHA"
    },
    "en": {
      "name": "Comfortable speech",
      "goal": "Explore easy voice without pushing loudness.",
      "cue": "Try gentle humming or an optional straw.",
      "check": "Move from sound to a short sentence.",
      "transfer": "Say a new sentence at normal loudness.",
      "fallback": "Rest for pain/hoarseness; never force straw work.",
      "why": "SOVT has evidence in studied groups, not proven daily transfer.",
      "tip": "Ease does not require whispering.",
      "src": "SOVT25, ASHA"
    }
  },
  {
    "id": "v-skill-expression",
    "track": "vocal",
    "focus": "speech",
    "steps": [
      [
        "v12-melodic-speech",
        120
      ],
      [
        "v14-pace-variation",
        120
      ],
      [
        "v19-authority-close",
        120
      ]
    ],
    "grade": "trad",
    "evidence": [
      "MOTOR26",
      "GAME24"
    ],
    "kind": "skill",
    "es": {
      "name": "Intención al hablar",
      "goal": "Haz que una idea destaque sin actuar de más.",
      "cue": "Escoge la palabra importante en una frase.",
      "check": "Dila con dos intenciones a un oyente imaginario.",
      "transfer": "Aplícala a un mensaje diferente sin gráfica.",
      "fallback": "Practica sin micrófono o descansa ante fatiga.",
      "why": "Variar más el tono no significa necesariamente ser mejor orador.",
      "tip": "Busca comunicación, no carisma puntuado.",
      "src": "MOTOR26, GAME24"
    },
    "en": {
      "name": "Expressive speech",
      "goal": "Highlight meaning without overacting.",
      "cue": "Choose one important word in a sentence.",
      "check": "Say it with two intentions for a listener.",
      "transfer": "Apply the choice to a new message without graphs.",
      "fallback": "No mic needed; rest if tired.",
      "why": "More pitch variation is not automatically better speaking.",
      "tip": "Communicate; do not chase a charisma score.",
      "src": "MOTOR26, GAME24"
    }
  },
  {
    "id": "v-skill-recovery",
    "track": "vocal",
    "focus": "recovery",
    "steps": [
      [
        "s17-jaw-neck-release",
        90
      ],
      [
        "v22-voice-recovery",
        600
      ]
    ],
    "grade": "lim",
    "evidence": [
      "NIDCD",
      "ASHA"
    ],
    "kind": "skill",
    "es": {
      "name": "Descanso de voz",
      "goal": "Decide si necesitas descanso después de hablar.",
      "cue": "Observa cansancio, ronquera o dolor antes de empezar.",
      "check": "Solo si es cómodo, prueba la rutina de pausa y sonido suave.",
      "transfer": "Después compara comodidad sin subir el volumen.",
      "fallback": "Si hay ronquera/dolor, descansa y consulta si persiste.",
      "why": "El cuidado vocal es prioritario; esta rutina no es terapia.",
      "tip": "Descansar no es perder una racha.",
      "src": "NIDCD, ASHA"
    },
    "en": {
      "name": "Rest your voice",
      "goal": "Choose rest after a lot of speaking.",
      "cue": "Notice fatigue, hoarseness or pain first.",
      "check": "Only if comfortable, try quiet and gentle sound.",
      "transfer": "Compare ease after rest, not loudness.",
      "fallback": "For pain/hoarseness rest and seek advice if persistent.",
      "why": "Vocal-care guidance is not a clinical treatment recipe.",
      "tip": "Rest is not a broken streak.",
      "src": "NIDCD, ASHA"
    }
  }
];

  let hooks = {};
  let bound = false;
  /** How to close the picker / the finishing card while open, as their own buttons do. */
  const closeOpen = { sheet: null, done: null };

  /* —— Small helpers —— */

  const $ = (sel) => document.querySelector(sel);

  function tt(key, vars) {
    return global.VTI18n?.t?.(key, vars) ?? key;
  }

  function lang() {
    return global.VTI18n?.lang === "en" ? "en" : "es";
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function track(name, props) {
    try {
      global.VTAnalytics?.track?.(name, props || {});
    } catch {
      /* analytics must never break practice */
    }
  }

  function exists(id) {
    return !hooks.findExercise || !!hooks.findExercise(id);
  }

  /** A step's short name: the loop's teaser name where it has one, else the exercise's title. */
  function stepName(id) {
    if (SHORT[id]) return SHORT[id][lang() === "en" ? 1 : 0];
    return global.VTLoop?.short?.(id) || id;
  }

  /** Automated specs run with vt_e2e set; a modal would sit over what they click next. Specs for the card opt in. */
  function quiet() {
    try {
      return sessionStorage.getItem("vt_e2e") === "1" && sessionStorage.getItem("vt_sets_e2e") !== "1";
    } catch {
      return false;
    }
  }

  /* —— The sets —— */

  /**
   * A set ready to run and to show, in the page's language. Steps whose
   * exercise this build does not have are left out, as the basics do; a set
   * left with fewer than two steps is no set.
   * @returns {{ id, track, grade, order: string[], sec: Object<string,number>, totalSec: number, minutes: number, name, goal, why, tip, src } | null}
   */
  function resolve(id) {
    const def = [...SETS, ...SKILL_SETS].find((s) => s.id === id);
    if (!def) return null;
    const order = [];
    const sec = {};
    def.steps.forEach(([exId, s]) => {
      if (!exists(exId) || order.includes(exId)) return;
      order.push(exId);
      sec[exId] = s;
    });
    if (order.length < 2) return null;
    const totalSec = order.reduce((n, exId) => n + sec[exId], 0);
    const words = def[lang()];
    return {
      id: def.id,
      track: def.track,
      grade: def.grade,
      focus: def.focus,
      kind: def.kind || "goal",
      evidence: def.evidence || [],
      order,
      sec,
      totalSec,
      minutes: Math.max(1, Math.round(totalSec / 60)),
      name: words.name,
      goal: words.goal,
      why: words.why,
      tip: words.tip,
      src: words.src,
      cue: words.cue || "",
      check: words.check || "",
      transfer: words.transfer || "",
      fallback: words.fallback || ""
    };
  }

  /** The sets of a track, in the order written. */
  function list(trackId) {
    return SETS.filter((s) => s.track === trackId)
      .map((s) => resolve(s.id))
      .filter(Boolean);
  }

  /** Separate skill repairs are optional; the original goal sets remain unchanged. */
  function skillList(trackId) {
    return SKILL_SETS.filter((s) => s.track === trackId).map((s) => resolve(s.id)).filter(Boolean);
  }

  /** The exercise ids practised today, from the day's ledger. */
  function practisedToday() {
    const D = global.VTDays;
    if (!D) return [];
    try {
      const row = D.read().days[D.summary().today];
      return Array.isArray(row?.ex) ? row.ex : [];
    } catch {
      return [];
    }
  }

  /** How many of a routine's steps were practised today. */
  function practisedCount(order) {
    const done = practisedToday();
    return (order || []).filter((id) => done.includes(id)).length;
  }

  /** Start a set from its first step, on its own track. */
  function start(id) {
    const set = resolve(id);
    if (!set) return null;
    closeDialogs();
    if (hooks.getTab?.() !== set.track) hooks.setTab?.(set.track);
    track("set_start", { set: set.id, track: set.track, steps: set.order.length, sec: set.totalSec });
    return (
      hooks.startSet?.({
        order: set.order,
        sec: set.sec,
        set: set.id,
        label: set.name,
        toast: tt("sets.startToast", { name: set.name, n: String(set.order.length) })
      }) || null
    );
  }

  /** The banner's name for a running set; null for any other routine. */
  function bannerName(session) {
    if (!session || session.path !== "set") return null;
    return resolve(session.set)?.name || tt("sets.banner");
  }

  /* —— The step trail on the banner —— */

  function trailMarks(session) {
    const now = Math.min(session.index, session.order.length - 1);
    return session.order
      .map((_, i) => `<i class="${i < session.index ? "is-done" : i === now ? "is-now" : ""}"></i>`)
      .join("");
  }

  /** Draw (or clear) the trail for the running routine. Called with every banner update. */
  function syncTrail(session) {
    const banner = $("#session-banner");
    if (!banner) return;
    let trail = $("#session-trail");
    const live = !!session && session.status !== "completed" && Array.isArray(session.order) && session.order.length > 1;
    if (!live) {
      if (trail) trail.hidden = true;
      return;
    }
    if (!trail) {
      trail = document.createElement("div");
      trail.id = "session-trail";
      trail.className = "session-trail";
      trail.setAttribute("aria-hidden", "true");
      banner.appendChild(trail);
    }
    trail.hidden = false;
    trail.classList.toggle("is-paused", session.status === "paused");
    trail.innerHTML = trailMarks(session);
  }

  /* —— The picker —— */

  function gradeHtml(grade) {
    const filled = GRADE_MARKS[grade] || 0;
    const dots = GRADES.map((_, i) => `<i class="${i < filled ? "is-on" : ""}"></i>`).join("");
    return `<span class="set-grade"><span class="set-grade-dots" aria-hidden="true">${dots}</span>${esc(tt("sets.grade." + grade))}</span>`;
  }

  function stepsHtml(set, done) {
    return set.order
      .map((id) => {
        const hit = done.includes(id);
        return `<li class="${hit ? "is-done" : ""}">${esc(stepName(id))}${hit ? `<span class="sr-only"> ${esc(tt("sets.stepDone"))}</span>` : ""}</li>`;
      })
      .join("");
  }

  /** A skill card explicitly distinguishes a cue, an attempt and transfer. */
  function skillPlanHtml(set) {
    if (set.kind !== "skill") return "";
    const items = [["sets.skillObserve", set.cue], ["sets.skillTry", set.check],
      ["sets.skillTransfer", set.transfer]];
    const steps = items.map(([label, message]) =>
      "<li><strong>" + esc(tt(label)) + ":</strong> " + esc(message) + "</li>").join("");
    return '<div class="set-skill-plan"><p class="set-skill-label">' +
      esc(tt("sets.skillPlan")) + "</p><ol>" + steps + "</ol>" +
      '<p class="set-skill-safe"><strong>' + esc(tt("sets.skillFallback")) +
      ":</strong> " + esc(set.fallback) + "</p></div>";
  }
  function cardHtml(set, done) {
    const all = set.order.every((id) => done.includes(id));
    const meta = tt("sets.meta", { min: String(set.minutes), n: String(set.order.length) });
    return `<li class="set-card${all ? " is-today" : ""}" data-set="${esc(set.id)}">
      <div class="set-head">
        <h4 id="set-name-${esc(set.id)}">${esc(set.name)}</h4>
        <span class="set-meta">${esc(meta)}</span>
      </div>
      <p class="set-goal">${esc(set.goal)}</p>
      ${skillPlanHtml(set)}
      <ol class="set-steps" aria-label="${esc(tt("sets.stepsAria"))}">${stepsHtml(set, done)}</ol>
      ${all ? `<p class="set-today">${esc(tt("sets.doneToday"))}</p>` : ""}
      <details class="set-why">
        <summary><span>${esc(tt("sets.why"))}</span>${gradeHtml(set.grade)}</summary>
        <p>${esc(set.why)}</p>
        ${set.tip ? `<p class="set-tip">${esc(set.tip)}</p>` : ""}
        <p class="set-src">${esc(tt("sets.src", { src: set.src }))}</p>
      </details>
      <button type="button" class="btn btn-primary set-start" data-set-start="${esc(set.id)}" aria-describedby="set-name-${esc(set.id)}">${esc(tt("sets.start"))}</button>
    </li>`;
  }

  function closeDialogs() {
    closeOpen.sheet?.();
    closeOpen.done?.();
  }

  /** Close on Escape, on a press outside the card, and trap the keyboard inside while open. */
  function wireModal(modal, finish) {
    modal.onkeydown = (e) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      finish();
    };
    modal.onclick = (e) => {
      if (e.target === modal) finish();
    };
  }

  /**
   * A touch drag down on the sheet's handle closes it (a phone habit); a short
   * drag springs back. The close button and Escape do the same without it.
   */
  function wireDrag(card, handle, finish) {
    let startY = null;
    const reset = () => {
      startY = null;
      card.style.transform = "";
      card.classList.remove("is-dragging");
    };
    handle.onpointerdown = (e) => {
      if (e.pointerType === "mouse") return;
      startY = e.clientY;
      card.classList.add("is-dragging");
      handle.setPointerCapture?.(e.pointerId);
    };
    handle.onpointermove = (e) => {
      if (startY == null) return;
      card.style.transform = `translateY(${Math.max(0, e.clientY - startY)}px)`;
    };
    handle.onpointerup = (e) => {
      if (startY == null) return;
      const far = e.clientY - startY > 72;
      reset();
      if (far) finish();
    };
    handle.onpointercancel = reset;
  }

  const FOCUS = {
    es: { all: "Todas las habilidades", breath: "Aire y respiración", pitch: "Afinación y rango cómodo", coordination: "Coordinación vocal", song: "Canción y escucha", speech: "Claridad y expresión", recovery: "Recuperación" },
    en: { all: "All skills", breath: "Breath and airflow", pitch: "Pitch and comfortable range", coordination: "Vocal coordination", song: "Song and listening", speech: "Clarity and expression", recovery: "Recovery" }
  };

  function filterFocus(sets, focus) {
    return Object.hasOwn(FOCUS.en, focus) && focus !== "all" ? sets.filter((set) => set.focus === focus) : sets;
  }

  function drawFocusPicker(sets, done) {
    const picker = $("#sets-focus");
    const words = FOCUS[lang()];
    const available = new Set(sets.map((set) => set.focus));
    picker.setAttribute("aria-label", lang() === "es" ? "Habilidad que quieres practicar" : "Skill you want to practise");
    picker.innerHTML = Object.entries(words).filter(([id]) => id === "all" || available.has(id)).map(([id, text]) => `<option value="${id}">${esc(text)}</option>`).join("");
    picker.value = "all";
    const paint = () => {
      $("#sets-list").innerHTML = filterFocus(sets, picker.value).map((set) => cardHtml(set, done)).join("");
      $("#sets-list").scrollTop = 0;
    };
    picker.onchange = paint;
    paint();
  }

  /** Keep label logic out of the eventful modal lifecycle (CC <= 15). */
  function sheetLabels(trackId, skills) {
    const title = skills ? "sets.skillTitle" : "sets.title";
    const sub = skills
      ? (trackId === "vocal" ? "sets.skillSubVocal" : "sets.skillSubSinging")
      : (trackId === "vocal" ? "sets.subVocal" : "sets.subSinging");
    return { title, sub };
  }

  function openSheet(opener, kind = "goal") {
    const modal = $("#sets-sheet");
    if (!modal) return;
    const trackId = hooks.getTab?.() === "vocal" ? "vocal" : "singing";
    const skills = kind === "skill";
    const sets = skills ? skillList(trackId) : list(trackId);
    const done = practisedToday();
    const labels = sheetLabels(trackId, skills);
    $("#sets-title").textContent = tt(labels.title);
    $("#sets-sub").textContent = tt(labels.sub);
    drawFocusPicker(sets, done);
    const close = $("#sets-close");
    close.setAttribute("aria-label", tt("sets.close"));
    hooks.hideToast?.();
    modal.hidden = false;
    modal.style.display = "";
    $("#sets-list").scrollTop = 0;
    global.VTFocusTrap?.activate?.(modal, { initialFocus: close, returnFocus: opener || null });
    const card = modal.querySelector(".sets-card");
    const handle = $("#sets-handle");
    const finish = () => {
      closeOpen.sheet = null;
      modal.hidden = true;
      global.VTFocusTrap?.release?.(modal);
      close.onclick = null;
      modal.onkeydown = null;
      modal.onclick = null;
      card.style.transform = "";
    };
    closeOpen.sheet = finish;
    close.onclick = finish;
    wireModal(modal, finish);
    if (handle) wireDrag(card, handle, finish);
    track("sets_open", { track: trackId, n: sets.length, kind: skills ? "skill" : "goal" });
  }

  /* —— The finishing card —— */

  function doneTrailHtml(set, done) {
    return set.order
      .map((id) => {
        const hit = done.includes(id);
        const state = tt(hit ? "sets.stepDone" : "sets.stepSkipped");
        return `<li class="${hit ? "is-done" : ""}"><span class="set-done-mark" aria-hidden="true">${hit ? "✓" : "·"}</span><span>${esc(stepName(id))}</span><span class="sr-only"> ${esc(state)}</span></li>`;
      })
      .join("");
  }

  /** What finishing the set brought on Tu camino (js/voice-path.js), if anything. */
  function pathLines() {
    const box = $("#set-done-path");
    if (!box) return;
    box.innerHTML = global.VTPath ? global.VTPath.doneHtml() : "";
    box.hidden = !box.innerHTML;
  }

  function showDone(set) {
    const modal = $("#set-done");
    if (!modal) return;
    const done = practisedToday();
    const n = practisedCount(set.order);
    $("#set-done-kicker").textContent = tt("sets.done.kicker");
    $("#set-done-title").textContent = set.name;
    const steps = $("#set-done-steps");
    steps.innerHTML = doneTrailHtml(set, done);
    steps.setAttribute("aria-label", tt("sets.stepsAria"));
    // The marks pop one after another, in the order practised.
    steps.querySelectorAll("li.is-done").forEach((li, i) => li.style.setProperty("--i", String(i)));
    // What happened, in numbers the learner can check; no score and no verdict.
    $("#set-done-line").textContent =
      n > 0 ? tt("sets.done.line", { n: String(n), total: String(set.order.length) }) : tt("sets.done.none");
    pathLines();
    const tip = $("#set-done-tip");
    tip.textContent = set.tip || "";
    tip.hidden = !set.tip;
    const close = $("#set-done-close");
    close.textContent = tt("sets.done.close");
    const more = $("#set-done-more");
    more.textContent = tt("sets.done.more");
    hooks.hideToast?.();
    modal.hidden = false;
    modal.style.display = "";
    global.VTFocusTrap?.activate?.(modal, { initialFocus: close });
    const finish = (then) => {
      closeOpen.done = null;
      modal.hidden = true;
      global.VTFocusTrap?.release?.(modal);
      close.onclick = null;
      more.onclick = null;
      modal.onkeydown = null;
      modal.onclick = null;
      if (typeof then === "function") then();
    };
    closeOpen.done = () => finish();
    close.onclick = () => finish();
    more.onclick = () => finish(() => openSheet(undefined, set.kind));
    wireModal(modal, () => finish());
  }

  /**
   * A guided routine has run to its last step. A goal set ends on its own
   * card; anything else is left to the loop or the plain toast.
   * @returns {boolean} true when this file handled the ending
   */
  function onComplete(session) {
    if (!session || session.path !== "set") return false;
    const set = resolve(session.set);
    if (!set) return false;
    const n = practisedCount(set.order);
    track("set_complete", { set: set.id, track: set.track, practiced: n, steps: set.order.length });
    // Sets keep no record of their own; Tu camino keeps the one that a set was finished.
    // Only established goal routines earn their existing set milestone.
    if (global.VTPath && set.kind !== "skill") global.VTPath.noteSet(set.id, n, set.order.length);
    hooks.refresh?.();
    if (quiet()) return true;
    showDone(set);
    return true;
  }

  /* —— Wiring —— */

  function bind(h) {
    hooks = h || {};
    if (bound) return;
    bound = true;
    $("#btn-sets")?.addEventListener("click", (e) => openSheet(e.currentTarget));
    $("#btn-skill-sets")?.addEventListener("click", (e) => openSheet(e.currentTarget, "skill"));
    $("#sets-list")?.addEventListener("click", (e) => {
      const b = e.target.closest?.("[data-set-start]");
      if (b) start(b.dataset.setStart);
    });
    // Both dialogs open over home. When home stops being the page under them
    // (the browser's Back into an exercise, an address typed), they close
    // unanswered, as their own close buttons do. Watching the view itself
    // rather than `popstate`: the app's own step back to home fires that event
    // too, right after a set's finishing card opens.
    const home = $("#view-home");
    if (home && global.MutationObserver) {
      new MutationObserver(() => {
        if (!home.classList.contains("active")) closeDialogs();
      }).observe(home, { attributes: true, attributeFilter: ["class"] });
    }
  }

  global.VTSets = {
    FOCUS,
    filterFocus,
    GRADES,
    GRADE_MARKS,
    SETS,
    SKILL_SETS,
    SHORT,
    bind,
    list,
    skillList,
    resolve,
    start,
    bannerName,
    syncTrail,
    onComplete,
    openSheet,
    showDone,
    closeDialogs,
    practisedCount
  };
})(window);
