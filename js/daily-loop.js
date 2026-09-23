/**
 * Daily loop — the part of the app that is never finished.
 *
 * The 12-week plan and the catalog are an arc: people walk through them once
 * and, when they reach the end, leave. Singers who keep singing for decades do
 * the opposite: the same trills and solfège every day, forever. This module is
 * that loop.
 *
 * - **Básicos de hoy** in three sizes. The Mínimo is two exercises, three
 *   minutes, identical every day: the thing that becomes automatic, and on its
 *   own a full practice day. Esencial and Clase are optional and rotate, so the
 *   variety lives where it cannot erode the habit.
 * - **Días cantados** — a lifetime count that never resets — leads; the streak
 *   is secondary, and rest days (js/practice-days.js) keep one bad day from
 *   zeroing it.
 * - **A weekly range goal** (3–5 days by default), because a range survives a
 *   bad week that a fixed daily target does not.
 * - **Regreso.** Coming back after a gap gets the kindest screen in the app and
 *   a guaranteed surprise: rewarding the return was the strongest of 54
 *   interventions in the largest habit megastudy run so far.
 * - **Surprises** are sparse (about one finished routine in five, never more
 *   than one a day), informational — a voice fact to keep, something true
 *   about your own practice — and never paid, never taken away.
 * - **Listo por hoy.** Finishing ends the day on its best moment and says
 *   what tomorrow brings, instead of offering more to grind.
 *
 * The research behind each choice, and the patterns deliberately left out, are
 * in docs/37-DAILY-LOOP.md.
 */
(function (global) {
  "use strict";

  const TIERS = ["min", "ess", "class"];
  /** Weekly range goals on offer, as "low-high" days. */
  const GOALS = ["2-3", "3-5", "5-7"];
  const DEFAULT_GOAL = "3-5";
  /** Chance of a surprise on a finished routine: higher while the habit is young. */
  const P_EARLY = 0.25;
  const P_LATER = 0.15;
  /** Days after the first practice day that count as "early". */
  const EARLY_DAYS = 56;
  /** A surprise is guaranteed after this many finished routines without one. */
  const PITY = 7;

  /* —— Routines ——
   *
   * A step is [exerciseId, seconds] or [{ slot, pool }, seconds]. A slot takes
   * one exercise from its pool per day, walking the pool in order: every
   * exercise comes round, and the pools are sized differently so the day's
   * combination repeats only every few weeks. The rotation depends on the date
   * alone, so everybody gets the same Esencial on the same day and tomorrow's
   * can be announced today.
   */
  const ROUTINES = {
    singing: {
      min: [
        ["s4-lip-trills", 90],
        ["s27-lip-trill-solfege", 90]
      ],
      ess: [
        ["s18-costal-breath", 75],
        ["s4-lip-trills", 90],
        ["s27-lip-trill-solfege", 90],
        [{ slot: "voice", pool: ["s5-sirens", "s7-humming", "s11-dynamics", "s12-easy-onset"] }, 75],
        [{ slot: "shape", pool: ["s20-five-vowels", "s19-soft-palate-surprise", "s1-vocal-fry"] }, 90],
        [
          {
            slot: "zone",
            pool: [
              "s21-chest-resonance",
              "s22-mid-voice-hola",
              "s23-mask-ya",
              "s24-nana-high",
              "s25-zone-tour"
            ]
          },
          90
        ],
        [
          {
            slot: "scale",
            pool: ["s2-solfege-chords", "s16-major-scale-coord", "s10-five-note", "s9-pitch-match"]
          },
          90
        ]
      ],
      // The prepared class session (VT_DAILY_SESSION), run as it always was.
      class: "daily"
    },
    vocal: {
      min: [
        ["s4-lip-trills", 75],
        ["v1-diction", 105]
      ],
      ess: [
        ["s18-costal-breath", 75],
        ["s4-lip-trills", 75],
        ["s7-humming", 60],
        ["v3-soft-palate", 75],
        ["v1-diction", 105],
        [{ slot: "clarity", pool: ["v4-articulation-pen", "v13-volume-ladder", "v2-volume"] }, 90],
        [
          {
            slot: "expression",
            pool: ["v12-melodic-speech", "v19-authority-close", "v10-power-pause", "v14-pace-variation"]
          },
          120
        ]
      ],
      class: [
        ["s17-jaw-neck-release", 90],
        ["s18-costal-breath", 90],
        ["s15-sh-air-ladder", 90],
        ["s7-humming", 75],
        ["s4-lip-trills", 75],
        ["s5-sirens", 60],
        ["v3-soft-palate", 90],
        ["v1-diction", 180],
        ["v4-articulation-pen", 135],
        ["v2-volume", 120],
        [
          {
            slot: "expression",
            pool: ["v12-melodic-speech", "v19-authority-close", "v10-power-pause", "v14-pace-variation"]
          },
          120
        ]
      ]
    }
  };

  /** Short names for teasers and card text ("mañana: sirenas y agudos"). */
  const SHORT = {
    "s4-lip-trills": ["trinos", "lip trills"],
    "s27-lip-trill-solfege": ["solfeo en trino", "trill solfège"],
    "s18-costal-breath": ["respiración", "breathing"],
    "s17-jaw-neck-release": ["soltar mandíbula", "jaw release"],
    "s15-sh-air-ladder": ["escalera de aire", "air ladder"],
    "s5-sirens": ["sirenas", "sirens"],
    "s7-humming": ["hum", "humming"],
    "s11-dynamics": ["crescendo en una nota", "swells on one note"],
    "s12-easy-onset": ["ataque suave", "easy onset"],
    "s20-five-vowels": ["las cinco vocales", "the five vowels"],
    "s19-soft-palate-surprise": ["paladar blando", "soft palate"],
    "s1-vocal-fry": ["fry vocal", "vocal fry"],
    "s21-chest-resonance": ["graves de pecho", "chest resonance"],
    "s22-mid-voice-hola": ["voz media", "middle voice"],
    "s23-mask-ya": ["la máscara", "the mask"],
    "s24-nana-high": ["agudos", "high notes"],
    "s25-zone-tour": ["las tres zonas", "the three zones"],
    "s2-solfege-chords": ["solfeo con acordes", "solfège on chords"],
    "s16-major-scale-coord": ["escala mayor", "the major scale"],
    "s10-five-note": ["escala de cinco notas", "the five-note scale"],
    "s9-pitch-match": ["afinar una nota", "pitch matching"],
    "v1-diction": ["dicción", "diction"],
    "v2-volume": ["volumen", "volume"],
    "v3-soft-palate": ["velo del paladar", "soft palate"],
    "v4-articulation-pen": ["articulación", "articulation"],
    "v13-volume-ladder": ["escalera de volumen", "the volume ladder"],
    "v12-melodic-speech": ["habla melódica", "melodic speech"],
    "v19-authority-close": ["cierre con autoridad", "an authority close"],
    "v10-power-pause": ["pausas", "pauses"],
    "v14-pace-variation": ["ritmo", "pace"]
  };

  /* —— Cartas de la voz ——
   *
   * The collectible surprise. Each card is one true, useful thing about the
   * voice or about practising, worded to be checked: nothing here names a
   * person, sells anything, or claims more than the evidence does. Content,
   * not interface, so it lives with the loop rather than in js/i18n.js.
   */
  const CARDS = [
    {
      id: "c01",
      es: ["Por qué funcionan los trinos", "Los trinos cierran a medias la salida del aire. Esa contrapresión puede hacer que las cuerdas vibren con menos esfuerzo; por eso se usan en terapia de voz."],
      en: ["Why lip trills work", "A lip trill half closes the way out for the air. That back-pressure can make the vocal folds easier to set vibrating, which is why voice therapy uses it."],
      src: "Titze 2006, J Speech Lang Hear Res"
    },
    {
      id: "c02",
      es: ["Cuántas veces vibran", "Al hablar, las cuerdas vocales de un adulto vibran más o menos entre 80 y 250 veces por segundo, según la voz. Un La de 440 Hz son 440 vibraciones por segundo."],
      en: ["How fast they vibrate", "When an adult speaks, the vocal folds vibrate somewhere around 80 to 250 times a second, depending on the voice. An A at 440 Hz is 440 vibrations a second."],
      src: "Titze, Principles of Voice Production"
    },
    {
      id: "c03",
      es: ["El diafragma inhala", "El diafragma trabaja sobre todo al tomar aire. Al cantar, la salida del aire la dosifican el rebote elástico del pecho y los músculos de las costillas y del abdomen."],
      en: ["The diaphragm breathes in", "The diaphragm does its main work on the in-breath. When you sing, the air going out is metered by the chest's elastic recoil and the rib and abdominal muscles."],
      src: "Hixon, Respiratory Function in Speech and Song"
    },
    {
      id: "c04",
      es: ["Repartir rinde más", "En los estudios de habilidades motoras, la práctica repartida en varios días suele fijarse mejor que la misma práctica junta en una sola sesión larga."],
      en: ["Spread it out", "In studies of motor skills, practice spread across several days generally sticks better than the same practice done in one long session."],
      src: "Shea et al. 2000, Human Movement Science"
    },
    {
      id: "c05",
      es: ["Susurrar no descansa", "Un susurro forzado suele apretar la garganta por encima de las cuerdas. Si la voz está cansada, se recomienda silencio o una voz suave."],
      en: ["Whispering is not rest", "A forced whisper often squeezes the throat above the vocal folds. If your voice is tired, silence or a gentle soft voice is what is usually advised."],
      src: "Rubin et al. 2006, Journal of Voice"
    },
    {
      id: "c06",
      es: ["El agua no llega directo", "El agua que tragas no toca las cuerdas vocales: las hidrata el cuerpo a lo largo del día. Beber a menudo ayuda más que un trago justo antes de cantar."],
      en: ["Water takes the long way", "The water you swallow never touches your vocal folds: your body hydrates them over the day. Drinking often helps more than a sip just before singing."],
      src: "Leydon et al. 2009, Journal of Voice"
    },
    {
      id: "c07",
      es: ["La vocal es un filtro", "La nota la dan las cuerdas; la vocal la da la forma de tu boca, que filtra los armónicos. Por eso una /i/ suena más brillante que una /u/ en la misma nota."],
      en: ["A vowel is a filter", "The folds make the note; the shape of your mouth makes the vowel by filtering the harmonics. That is why /i/ sounds brighter than /u/ on the same note."],
      src: "Sundberg, The Science of the Singing Voice"
    },
    {
      id: "c08",
      es: ["Qué es un cent", "Un semitono son 100 cents, un 6% de frecuencia. Afinar a 20 cents es acercarte a una quinta parte de semitono."],
      en: ["What a cent is", "A semitone is 100 cents, about a 6% change in frequency. Being within 20 cents means within a fifth of a semitone."],
      src: { es: "Definición del cent (Ellis 1885)", en: "Definition of the cent (Ellis 1885)" }
    },
    {
      id: "c09",
      es: ["Tu voz grabada", "Te oyes distinto en una grabación en parte porque al cantar también te escuchas a través de los huesos de la cabeza, que refuerzan los graves. La grabación se parece más a como te oyen los demás."],
      en: ["Your recorded voice", "You sound different on a recording partly because while singing you also hear yourself through the bones of your head, which boost the lows. The recording is closer to how others hear you."],
      src: "Pörschmann 2000, Acta Acustica"
    },
    {
      id: "c10",
      es: ["Días con noches entre medio", "Practicar en días separados, con sueño entre medio, es una buena forma de que una habilidad se asiente. Cuánto aporta el sueño en sí todavía se discute."],
      en: ["Days with nights between", "Practising on separate days, with sleep in between, is a good way to let a skill settle. How much sleep itself adds is still debated."],
      src: "Pan & Rickard 2015, Psychological Bulletin"
    },
    {
      id: "c11",
      es: ["La sirena lo recorre todo", "Una sirena pasa por tu registro sin saltos. Es una buena forma de notar dónde cambia tu voz y de ir suavizando ese paso."],
      en: ["The siren covers it all", "A siren moves through your range without jumps. It is a good way to notice where your voice shifts, and to smooth that change over time."],
      src: { es: "Pedagogía vocal habitual", en: "Standard vocal pedagogy" }
    },
    {
      id: "c12",
      es: ["Por qué el solfeo", "Nombrar cada nota mientras la cantas une el sonido con su lugar en la escala. La idea es que el oído y la voz trabajen juntos."],
      en: ["Why solfège", "Naming each note as you sing it links the sound to its place in the scale. The idea is for ear and voice to work together."],
      src: { es: "Pedagogía vocal habitual", en: "Standard vocal pedagogy" }
    },
    {
      id: "c13",
      es: ["Calentar se siente", "Muchos cantantes notan que la voz sale con menos esfuerzo después de calentar. Las mediciones de laboratorio todavía no lo confirman del todo."],
      en: ["Warming up is felt", "Many singers find their voice comes more easily after a warm-up. Lab measurements do not fully confirm it yet."],
      src: "Elliot et al. 1995; Motel et al. 2003, Journal of Voice"
    },
    {
      id: "c14",
      es: ["Oírse sobre una orquesta", "Muchos cantantes líricos concentran energía entre unos 2.500 y 3.000 Hz, donde la orquesta suena menos. Así se les oye sin gritar."],
      en: ["Heard over an orchestra", "Many classical singers concentrate energy around 2,500 to 3,000 Hz, where the orchestra is quieter. That is how they carry without shouting."],
      src: "Sundberg 1974, J Acoust Soc Am"
    },
    {
      id: "c15",
      es: ["El vibrato no se fabrica", "El vibrato de muchos cantantes oscila unas 5 a 7 veces por segundo. Suele aparecer cuando la voz está libre, más que apretando."],
      en: ["Vibrato is not forced", "Many singers' vibrato wavers about 5 to 7 times a second. It tends to appear when the voice is free, rather than by squeezing."],
      src: "Sundberg, The Science of the Singing Voice"
    },
    {
      id: "c16",
      es: ["El bostezo abre espacio", "El inicio de un bostezo y la cara de sorpresa tienden a elevar el paladar blando. Por eso la clase usa la «pre-sorpresa» para abrir espacio."],
      en: ["A yawn makes room", "The start of a yawn and a look of surprise tend to lift the soft palate. That is why the class uses the 'pre-surprise' to make space."],
      src: { es: "Pedagogía vocal habitual", en: "Standard vocal pedagogy" }
    },
    {
      id: "c17",
      es: ["La voz avisa", "Carraspear seguido, ronquera o dolor son señales para bajar la carga. Si duele, para. Si la ronquera no se va en unas semanas, consulta a un otorrino."],
      en: ["Your voice tells you", "Frequent throat clearing, hoarseness or pain are signs to ease off. If it hurts, stop. If hoarseness has not gone in a few weeks, see an ear, nose and throat doctor."],
      src: { es: "Guía clínica sobre ronquera, AAO-HNS 2018", en: "Clinical guideline on hoarseness, AAO-HNS 2018" }
    },
    {
      id: "c18",
      es: ["Un día perdido no borra nada", "En un estudio sobre cómo se forman los hábitos, faltar un día suelto no frenó el hábito. Lo que cuenta es volver."],
      en: ["One missed day erases nothing", "In a study of how habits form, missing a single day did not set the habit back. What counts is coming back."],
      src: "Lally et al. 2010, European Journal of Social Psychology"
    }
  ];


  let hooks = {};
  let lastRest = null;
  let bound = false;

  /* —— Small helpers —— */

  const $ = (sel) => document.querySelector(sel);

  function tt(key, vars) {
    return global.VTI18n?.t?.(key, vars) ?? key;
  }

  function lang() {
    return global.VTI18n?.lang === "en" ? "en" : "es";
  }

  /** The track on screen: the home tab, which an open exercise also sets. */
  function currentTrack() {
    return hooks.getTab?.() === "vocal" ? "vocal" : "singing";
  }

  /**
   * Loop copy for a track. Vocal is speaking practice, so where a string says
   * "sang" the language's `.vocal` variant ("practicaste", "día de práctica")
   * wins. Only the current language's table is checked: an English page must
   * not pick up a Spanish-only variant through the fallback in t().
   */
  function tl(key, vars, trackId) {
    if ((trackId || currentTrack()) === "vocal") {
      const I = global.VTI18n;
      const table = I?.strings?.[I.lang];
      if (table && table[key + ".vocal"] != null) return tt(key + ".vocal", vars);
    }
    return tt(key, vars);
  }

  function esc(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function track(name, props) {
    try {
      global.VTAnalytics?.track?.(name, props || {});
    } catch {
      /* ignore */
    }
  }

  /** FNV-1a, 32-bit — the same hash js/experiments.js splits buckets with. */
  function hash(str) {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i += 1) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  function days() {
    return global.VTDays;
  }

  function today() {
    return days()?.dayKey?.() || new Date().toISOString().slice(0, 10);
  }

  /** Whole days since 2020-01-06 (a Monday): the rotation counter. */
  function dayNumber(key) {
    const D = days();
    return D ? D.diffDays("2020-01-06", key) : 0;
  }

  function short(id) {
    const s = SHORT[id];
    if (!s) {
      const ex = hooks.findExercise?.(id);
      return ex ? (global.VTI18n?.exTitle?.(ex) || ex.title || id) : id;
    }
    return s[lang() === "en" ? 1 : 0];
  }

  /** "a", "a y b", "a, b y c" in the current language. */
  function list(items) {
    const xs = items.filter(Boolean);
    if (xs.length <= 1) return xs[0] || "";
    const and = tt("loop.and");
    return `${xs.slice(0, -1).join(", ")} ${and} ${xs[xs.length - 1]}`;
  }

  function e2eQuiet() {
    // Automated specs run with vt_e2e set; the completion card is a modal and
    // would sit over whatever they click next. Specs that test the card opt in.
    try {
      return sessionStorage.getItem("vt_e2e") === "1" && sessionStorage.getItem("vt_loop_e2e") !== "1";
    } catch {
      return false;
    }
  }

  /* —— State (vt_loop_v1, per profile, synced) —— */

  function emptyLoop() {
    let seed = "";
    try {
      const buf = new Uint8Array(6);
      global.crypto.getRandomValues(buf);
      seed = Array.from(buf, (b) => b.toString(16).padStart(2, "0")).join("");
    } catch {
      seed = String(Math.floor(Math.random() * 1e12));
    }
    return {
      v: 1,
      seed,
      tier: null,
      goal: DEFAULT_GOAL,
      ms: [],
      cards: {},
      surprises: [],
      since: 0,
      comebacks: [],
      completions: 0
    };
  }

  function normalize(x) {
    const L = x && typeof x === "object" ? x : emptyLoop();
    if (!L.seed) L.seed = emptyLoop().seed;
    if (!TIERS.includes(L.tier)) L.tier = null;
    if (!GOALS.includes(L.goal)) L.goal = DEFAULT_GOAL;
    if (!Array.isArray(L.ms)) L.ms = [];
    if (!L.cards || typeof L.cards !== "object") L.cards = {};
    if (!Array.isArray(L.surprises)) L.surprises = [];
    if (!Array.isArray(L.comebacks)) L.comebacks = [];
    L.since = Math.max(0, Number(L.since) || 0);
    L.completions = Math.max(0, Number(L.completions) || 0);
    L.v = 1;
    return L;
  }

  function readLoop() {
    let raw = null;
    try {
      raw = global.VTStorage?.getLoop?.();
    } catch {
      raw = null;
    }
    const L = normalize(raw);
    if (!raw) writeLoop(L);
    return L;
  }

  function writeLoop(L) {
    try {
      global.VTStorage?.setLoop?.(L);
    } catch {
      /* quota or private mode: the loop degrades to a session, never a crash */
    }
  }

  /**
   * Merge two devices' loop state. Everything earned is a union — a card or a
   * milestone is never lost to a sync — and settings follow the local side.
   */
  function merge(a, b) {
    if (!b) return a;
    if (!a) return b;
    const A = normalize(JSON.parse(JSON.stringify(a)));
    const B = normalize(JSON.parse(JSON.stringify(b)));
    const cards = { ...B.cards };
    Object.keys(A.cards).forEach((id) => {
      if (!cards[id] || A.cards[id] < cards[id]) cards[id] = A.cards[id];
    });
    const byDay = new Map();
    [...B.surprises, ...A.surprises].forEach((s) => {
      if (s && s.day && !byDay.has(s.day)) byDay.set(s.day, s);
    });
    return {
      v: 1,
      seed: A.seed,
      tier: A.tier || B.tier,
      goal: A.goal,
      ms: [...new Set([...A.ms, ...B.ms])].sort((x, y) => x - y),
      cards,
      surprises: [...byDay.values()].sort((x, y) => (x.day < y.day ? -1 : 1)).slice(-60),
      since: Math.min(A.since, B.since),
      comebacks: [...new Set([...A.comebacks, ...B.comebacks])].sort().slice(-120),
      completions: Math.max(A.completions, B.completions)
    };
  }

  /* —— Experiments (all dormant; see js/experiments-config.js) —— */

  function arm(key) {
    try {
      return global.VTExperiments?.variant?.(key) || null;
    } catch {
      return null;
    }
  }

  function loopEnabled() {
    return arm("loop_home_2026_10") !== "classic";
  }

  /**
   * Record that this browser has now seen the arm it was given. Called where
   * the difference first shows, never at assignment: exposing on start alone
   * would hide a variant that puts people off starting.
   */
  function expose(key) {
    try {
      global.VTExperiments?.exposeOnce?.(key);
    } catch {
      /* ignore */
    }
  }

  /* —— Routines —— */

  function tierMinutes(track, tier) {
    const r = routine(track, tier);
    return r ? Math.max(1, Math.round(r.totalSec / 60)) : 0;
  }

  /**
   * The routine for a track and size on a given day.
   * @returns {{ track, tier, order: string[], sec: Object<string,number>, totalSec: number, slots: Object<string,string>, daily: boolean } | null}
   */
  function routine(track, tier, dayKey) {
    const def = ROUTINES[track]?.[tier];
    if (!def) return null;
    if (def === "daily") {
      const d = global.VT_DAILY_SESSION;
      const order = d && global.VT_STRUCTURED?.[d.id];
      if (!order?.length) return null;
      const sec = { ...(d.sec || {}) };
      const totalSec = order.reduce((n, id) => n + (Number(sec[id]) || 0), 0) || d.totalMin * 60;
      return { track, tier, order: order.slice(), sec, totalSec, slots: {}, daily: true };
    }
    let steps = def;
    // Dormant test: a five-minute Mínimo against the three-minute one.
    if (tier === "min" && arm("loop_minimo_len_2026_10") === "five") {
      steps = def.map(([id, s]) => [id, Math.round((s * 5) / 3)]);
    }
    const n = dayNumber(dayKey || today());
    const order = [];
    const sec = {};
    const slots = {};
    steps.forEach(([step, s], i) => {
      let id = step;
      if (step && typeof step === "object") {
        const pool = step.pool.filter((x) => !hooks.findExercise || hooks.findExercise(x));
        if (!pool.length) return;
        id = pool[(((n + i) % pool.length) + pool.length) % pool.length];
        slots[step.slot] = id;
      }
      if (hooks.findExercise && !hooks.findExercise(id)) return;
      if (order.includes(id)) return;
      order.push(id);
      sec[id] = s;
    });
    const totalSec = order.reduce((m, id) => m + sec[id], 0);
    return order.length ? { track, tier, order, sec, totalSec, slots, daily: false } : null;
  }

  /** What rotates in Esencial tomorrow, as a short phrase. */
  function tomorrowTeaser(track) {
    const D = days();
    if (!D) return "";
    const r = routine(track, "ess", D.addDays(today(), 1));
    if (!r) return "";
    const names = Object.values(r.slots).slice(0, 2).map(short);
    return list(names);
  }

  function preferredTier() {
    const L = readLoop();
    return L.tier || "min";
  }

  function setTier(tier) {
    if (!TIERS.includes(tier)) return;
    const L = readLoop();
    if (L.tier === tier) return;
    L.tier = tier;
    writeLoop(L);
    track("loop_tier_pick", { tier });
  }

  function setGoal(goal) {
    if (!GOALS.includes(goal)) return;
    const L = readLoop();
    L.goal = goal;
    writeLoop(L);
    track("loop_goal_set", { goal });
  }

  function goalRange(goal) {
    const [lo, hi] = String(goal || DEFAULT_GOAL).split("-").map(Number);
    return { lo: lo || 3, hi: hi || 5 };
  }

  /* —— Surprises —— */

  function statOptions(sum, trackId) {
    const D = days();
    const out = [];
    if (sum.minutes >= 20) out.push({ id: "minutes", text: tl("loop.stat.minutes", { n: sum.minutes }, trackId) });
    const bag = D?.read?.();
    if (bag) {
      const rows = Object.entries(bag.days).filter(([, r]) => D.counts(r));
      const trills = rows.filter(([, r]) => (r.ex || []).some((x) => x === "s4-lip-trills" || x === "s27-lip-trill-solfege")).length;
      if (trills >= 3) out.push({ id: "trills", text: tt("loop.stat.trills", { n: trills }) });
      if (rows.length >= 8) {
        const counts = [0, 0, 0, 0, 0, 0, 0];
        rows.forEach(([k]) => {
          const d = D.parseDay(k);
          if (d) counts[(d.getDay() + 6) % 7] += 1;
        });
        const best = counts.indexOf(Math.max(...counts));
        const names = tt("loop.weekdayNames").split(",");
        if (names[best]) out.push({ id: "weekday", text: tt("loop.stat.weekday", { day: names[best].trim() }) });
      }
    }
    return out;
  }

  /**
   * Draw today's surprise, at most once a day. Stable within the day: the roll
   * is a hash of this browser's seed and the date, so a reload does not reroll.
   *
   * @param {{ comeback?: boolean, summary: object, force?: string }} ctx
   * @returns {{ kind: "card"|"stat", id: string, reason: string, day: string } | null}
   */
  function drawSurprise(ctx) {
    const L = readLoop();
    const day = ctx.day || today();
    const had = L.surprises.find((s) => s.day === day);
    if (had) return null;
    const sum = ctx.summary;
    // A finished routine is the first moment the two arms can differ.
    expose("loop_surprise_2026_10");
    if (arm("loop_surprise_2026_10") === "none") {
      L.since += 1;
      writeLoop(L);
      return null;
    }
    const D = days();
    const early = sum.firstDay && D ? D.diffDays(sum.firstDay, day) < EARLY_DAYS : true;
    let p = early ? P_EARLY : P_LATER;
    let reason = "chance";
    if (sum.practiceDays < 3) p = 0; // the first days have milestones of their own
    if (L.since + 1 >= PITY) {
      p = 1;
      reason = "pity";
    }
    if (ctx.comeback) {
      p = 1;
      reason = "comeback";
    }
    if (ctx.force) {
      p = 1;
      reason = ctx.force;
    }
    const roll = hash(`${L.seed}:${day}:roll`) / 4294967296;
    if (roll >= p) {
      L.since += 1;
      writeLoop(L);
      return null;
    }
    const remaining = CARDS.filter((c) => !L.cards[c.id]);
    const stats = statOptions(sum);
    const wantStat = hash(`${L.seed}:${day}:kind`) % 10 < 3;
    let pick = null;
    if (remaining.length && (!wantStat || !stats.length)) {
      const ordered = remaining.slice().sort((a, b) => hash(`${L.seed}:${a.id}`) - hash(`${L.seed}:${b.id}`));
      pick = { kind: "card", id: ordered[0].id };
      L.cards[ordered[0].id] = day;
    } else if (stats.length) {
      const s = stats[hash(`${L.seed}:${day}:stat`) % stats.length];
      pick = { kind: "stat", id: s.id };
    }
    if (!pick) {
      L.since += 1;
      writeLoop(L);
      return null;
    }
    const out = { ...pick, reason, day };
    L.surprises.push(out);
    L.surprises = L.surprises.slice(-60);
    L.since = 0;
    writeLoop(L);
    track("surprise_shown", { kind: out.kind, id: out.id, reason });
    return out;
  }

  function cardText(id) {
    const c = CARDS.find((x) => x.id === id);
    if (!c) return null;
    const [title, body] = c[lang()] || c.es;
    const src = typeof c.src === "string" ? c.src : c.src?.[lang()] || c.src?.es || "";
    return { title, body, src, n: CARDS.indexOf(c) + 1 };
  }

  /* —— Practice events from js/app.js —— */

  /**
   * Called whenever practice is recorded. The first record of a day is the one
   * worth marking: it may be a comeback, it may cross a milestone.
   * @param {{ exerciseId?: string, source?: string, day?: { becameDay: boolean }, structured?: boolean }} ev
   */
  function onPractice(ev = {}) {
    if (!ev.day?.becameDay || !loopEnabled()) return;
    const D = days();
    if (!D) return;
    const sum = D.summary();
    const L = readLoop();
    if (sum.comeback && !L.comebacks.includes(sum.today)) {
      L.comebacks.push(sum.today);
      L.comebacks = L.comebacks.slice(-120);
      writeLoop(L);
      track("comeback", { daysAway: sum.daysAway, restBank: sum.rest.bank });
    }
    track("practice_day", { n: sum.practiceDays, source: ev.source || null, structured: !!ev.structured });
    // Inside a routine the completion card carries the moment; outside one,
    // a short line is enough.
    if (ev.structured) return;
    const trackId = hooks.findExercise?.(ev.exerciseId)?.track;
    const ms = milestoneToday(sum.practiceDays);
    if (ms) {
      markMilestone(ms);
      hooks.toast?.(tl("loop.msToast", { n: ms }, trackId), { durationMs: 3200 });
    } else {
      hooks.toast?.(tl("loop.dayToast", { n: sum.practiceDays }, trackId), { durationMs: 2600 });
    }
    refresh();
  }

  /**
   * The milestone reached by today's day, if it has not been marked. Only the
   * exact count: a browser that arrives with 40 days of history is not told
   * "you reached 30" as if it were news.
   */
  function milestoneToday(practiceDays) {
    const D = days();
    if (!D || !D.MILESTONES.includes(practiceDays)) return null;
    return readLoop().ms.includes(practiceDays) ? null : practiceDays;
  }

  /** Mark a milestone, and every one below it, as seen. */
  function markMilestone(n) {
    const L = readLoop();
    const below = (days()?.MILESTONES || []).filter((m) => m <= n && !L.ms.includes(m));
    if (!below.length) return;
    L.ms = [...L.ms, ...below].sort((a, b) => a - b);
    writeLoop(L);
    track("milestone", { n });
  }

  function noteRest(fr) {
    if (fr?.applied) {
      lastRest = { days: fr.days || [], on: today() };
      track("rest_used", { days: (fr.days || []).length });
    }
  }

  /**
   * A guided routine has run to its last step. Basics and the daily class end
   * on the completion card; anything else keeps the plain toast.
   * @returns {boolean} true when the loop handled the ending
   */
  function onRoutineComplete(session) {
    if (!session || (session.path !== "basics" && session.path !== "daily")) return false;
    if (!loopEnabled()) return false;
    const D = days();
    if (!D) return false;
    const before = D.summary();
    const row = D.read().days[before.today] || {};
    const done = (session.order || []).filter((id) => (row.ex || []).includes(id)).length;
    const need = Math.max(1, Math.ceil((session.order || []).length / 2));
    const tier = session.tier || (session.path === "daily" ? "class" : "min");
    if (!before.todayDone || done < need) {
      hooks.toast?.(tl("loop.notCounted", null, session.track), { durationMs: 4200 });
      track("basics_incomplete", { tier, track: session.track, practiced: done, steps: (session.order || []).length });
      return true;
    }
    const mb = D.markBasics({ len: tier, track: session.track });
    const L = readLoop();
    L.completions += 1;
    L.tier = tier;
    writeLoop(L);
    const sum = D.summary();
    const comeback = sum.comeback;
    const surprise = mb.first ? drawSurprise({ summary: sum, comeback, day: sum.today }) : null;
    const ms = milestoneToday(sum.practiceDays);
    if (ms) markMilestone(ms);
    track("basics_complete", {
      tier,
      track: session.track,
      first: mb.first,
      practiced: done,
      steps: (session.order || []).length,
      practiceDays: sum.practiceDays,
      comeback,
      surprise: surprise ? surprise.kind : null
    });
    refresh();
    if (e2eQuiet()) return true;
    showDone({ sum, tier, track: session.track, surprise, ms, comeback: comeback && mb.first, first: mb.first });
    return true;
  }

  /* —— Rendering: the week strip —— */

  function weekHtml(sum, trackId) {
    const letters = tt("loop.weekLetters").split(",");
    const names = tt("loop.weekdayFull").split(",");
    return sum.week
      .map((d, i) => {
        const label = `${(names[i] || "").trim()} ${Number(d.key.slice(8))}: ${tl("loop.dayState." + d.state, null, trackId)}`;
        return `<li class="loop-day is-${d.state}${d.isToday ? " is-today" : ""}${d.basics ? " has-basics" : ""}" aria-label="${esc(label)}" title="${esc(label)}"><span class="loop-day-l" aria-hidden="true">${esc((letters[i] || "").trim())}</span><span class="loop-day-dot" aria-hidden="true"></span></li>`;
      })
      .join("");
  }

  function streakLine(sum) {
    // Never a zero: a broken run reads as the start of the next one.
    const s =
      sum.streak === 0 ? tt("loop.streak0") : sum.streak === 1 ? tt("loop.streak1") : tt("loop.streakN", { n: sum.streak });
    const r =
      sum.rest.bank === 0 ? tt("loop.rest0") : sum.rest.bank === 1 ? tt("loop.rest1") : tt("loop.restN", { n: sum.rest.bank });
    return `${s} · ${r}`;
  }

  function goalText(sum, goal) {
    const { lo, hi } = goalRange(goal);
    if (sum.weekDays >= lo) return tt("loop.goalMet", { n: sum.weekDays });
    return tt("loop.goal", { n: sum.weekDays, lo, hi });
  }

  function goalBar(sum, goal) {
    const { lo, hi } = goalRange(goal);
    let html = "";
    for (let i = 1; i <= hi; i += 1) {
      const cls = [i <= sum.weekDays ? "on" : "", i <= lo ? "need" : "stretch"].join(" ");
      html += `<span class="${cls.trim()}"></span>`;
    }
    return html;
  }

  /* —— Rendering: home —— */

  function renderAside(sum, L) {
    const aside = $("#loop-today");
    if (!aside) return;
    aside.hidden = false;
    const dEl = $("#loop-days");
    if (dEl) dEl.textContent = String(sum.practiceDays);
    const dl = $("#loop-days-label");
    if (dl) dl.textContent = sum.practiceDays === 1 ? tl("loop.day1") : tl("loop.days");
    const next = days()?.nextMilestone?.(sum.practiceDays);
    const nm = $("#loop-next-ms");
    if (nm) nm.textContent = next ? tt("loop.nextMs", { n: next }) : "";
    const wk = $("#loop-week");
    if (wk) {
      wk.innerHTML = weekHtml(sum);
      wk.setAttribute("aria-label", tt("loop.weekAria"));
    }
    const st = $("#loop-streak");
    if (st) {
      st.textContent = streakLine(sum);
      st.title = tl("loop.restHelp");
    }
    const gt = $("#loop-goal-text");
    if (gt) gt.textContent = goalText(sum, L.goal);
    const gl = $("#loop-goal-label");
    if (gl) gl.textContent = tt("loop.goalLabel");
    const sel = $("#loop-goal-sel");
    if (sel) {
      sel.setAttribute("aria-label", tt("loop.goalLabel"));
      Array.from(sel.options).forEach((o) => {
        const { lo, hi } = goalRange(o.value);
        o.textContent = tt("loop.goalOpt", { lo, hi });
      });
      sel.value = L.goal;
    }
    const bar = $("#loop-goal-bar");
    if (bar) bar.innerHTML = goalBar(sum, L.goal);
    const cb = $("#loop-cards-btn");
    if (cb) {
      const n = Object.keys(L.cards).length;
      cb.hidden = n === 0;
      cb.textContent = tt("loop.cardsBtn", { n, total: CARDS.length });
    }
  }

  function renderTiers(active, track) {
    const wrap = $("#loop-tiers");
    if (!wrap) return;
    wrap.hidden = false;
    const lab = $("#loop-tiers-label");
    if (lab) lab.textContent = tt("loop.tiersLabel");
    wrap.querySelectorAll("[data-tier]").forEach((b) => {
      const tier = b.dataset.tier;
      const min = tierMinutes(track, tier);
      b.hidden = !min;
      b.textContent = tt("loop.tierChip", { name: tt("loop.tier." + tier), min });
      // The chip is where a longer Mínimo first shows: its minutes.
      if (tier === "min" && min) expose("loop_minimo_len_2026_10");
      b.setAttribute("aria-pressed", String(tier === active));
      b.classList.toggle("is-on", tier === active);
    });
  }

  /** A guided session that is open (active or paused) keeps the panel's own copy. */
  function guidedOpen() {
    const s = global.VTSession?.get?.();
    return !!(s && s.status !== "completed" && s.order?.length);
  }

  /** Re-render home the way the app does, so every part of the panel agrees. */
  function refresh() {
    if (hooks.refresh) hooks.refresh();
    else renderHome();
  }

  /**
   * Draw the loop into the start panel.
   * @returns {boolean} true when the loop took over the panel's main copy
   */
  function renderHome() {
    const D = days();
    const aside = $("#loop-today");
    const tiers = $("#loop-tiers");
    if (!D || !loopEnabled()) {
      if (aside) aside.hidden = true;
      if (tiers) tiers.hidden = true;
      document.body.classList.remove("loop-on");
      return false;
    }
    const sum = D.summary();
    const on = sum.practiceDays > 0;
    document.body.classList.toggle("loop-on", on);
    if (!on) {
      if (aside) aside.hidden = true;
      if (tiers) tiers.hidden = true;
      return false;
    }
    const L = readLoop();
    renderAside(sum, L);
    if (guidedOpen()) {
      if (tiers) tiers.hidden = true;
      return false;
    }
    const trackId = hooks.getTab?.() === "vocal" ? "vocal" : "singing";
    const comeback = !sum.todayDone && sum.comeback;
    // A comeback is always offered the smallest step back in.
    const tier = comeback ? "min" : preferredTier();
    const r = routine(trackId, tier);
    if (!r) return false;
    renderTiers(tier, trackId);

    const kicker = $("#start-kicker");
    const title = $("#start-title");
    const sub = $("#start-sub");
    const card = $("#next-step-card");
    const label = $("#next-step-label");
    const cardTitle = $("#next-step-title");
    const why = $("#next-step-why");
    const cta = $("#btn-next-step");
    if (!kicker || !title || !sub || !card || !cta) return false;
    card.hidden = false;
    const min = Math.max(1, Math.round(r.totalSec / 60));
    const what = list(r.order.slice(0, 2).map(short));
    // A short routine lists each step with its time; the headline already
    // names the steps, so the card says how long each one runs.
    const clock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
    const stepsTxt =
      r.order.length <= 3
        ? r.order.map((id) => `${short(id)} ${clock(r.sec[id] || 0)}`).join(" → ")
        : tt("loop.stepsN", { n: r.order.length, what: r.order.slice(0, 3).map(short).join(", ") });
    const tierName = tt("loop.tier." + tier);
    const minKey = tier === "min" ? "loop.titleMin" : tier === "ess" ? "loop.titleEss" : "loop.titleClass";

    let state = "go";
    if (sum.basicsToday) state = "done";
    else if (comeback) state = "back";
    else if (sum.todayDone) state = "sang";
    card.dataset.loop = state;
    card.classList.toggle("is-done", state === "done");

    if (state === "done") {
      kicker.textContent = tt("loop.kickerDone");
      title.textContent = tt("loop.titleDone");
      const teaser = tomorrowTeaser(trackId);
      sub.textContent = tl(
        "loop.subDone",
        {
          min: Math.max(1, Math.round((D.read().days[sum.today]?.sec || 0) / 60)),
          tomorrow: teaser ? tt("loop.tomorrowEss", { what: teaser }) : ""
        },
        trackId
      ).trim();
      if (label) label.textContent = tt("loop.labelDone");
      if (cardTitle) cardTitle.textContent = tt("loop.tierChip", { name: tierName, min });
      if (why) why.textContent = tt("loop.whyDone");
      cta.textContent = tt("loop.ctaAgain", { tier: tierName });
    } else {
      const kickerKey = state === "back" ? "loop.kickerBack" : state === "sang" ? "loop.kickerSang" : "loop.kicker";
      kicker.textContent = tl(kickerKey, null, trackId);
      title.textContent =
        state === "back" ? tt("loop.titleBack", { min }) : tt(minKey, { what: capitalize(what), min });
      let subTxt =
        state === "back"
          ? tt("loop.subBack")
          : state === "sang"
            ? tl("loop.subSang", null, trackId)
            : tt(trackId === "vocal" ? "loop.subVocal" : "loop.sub");
      const rest = lastRest && lastRest.on === sum.today ? lastRest : sum.rest.justUsed;
      if (rest?.days?.length) {
        subTxt = `${tt(rest.days.length === 1 ? "loop.subRest1" : "loop.subRestN", { n: rest.days.length, streak: sum.streak })} ${subTxt}`;
      }
      sub.textContent = subTxt;
      if (label) label.textContent = tt("loop.label." + tier, { min });
      if (cardTitle) cardTitle.textContent = capitalize(stepsTxt);
      const whyKey = tier === "min" ? "loop.whyMin" : tier === "ess" ? "loop.whyEss" : "loop.whyClass";
      if (why) why.textContent = tl(whyKey, null, trackId);
      cta.textContent = tt("loop.cta");
    }
    // Done for today: the button stays, quietly. Nothing on the page asks for more.
    cta.classList.toggle("btn-practice", state !== "done");
    cta.classList.toggle("btn-ghost", state === "done");
    cta.onclick = () => startTier(state === "done" ? preferredTier() : tier);
    return true;
  }

  function capitalize(s) {
    const x = String(s || "");
    return x ? x.charAt(0).toUpperCase() + x.slice(1) : x;
  }

  function startTier(tier) {
    const trackId = hooks.getTab?.() === "vocal" ? "vocal" : "singing";
    const r = routine(trackId, tier);
    if (!r) return null;
    setTier(tier);
    if (tier === "min") expose("loop_minimo_len_2026_10");
    track("basics_start", { tier, track: trackId, steps: r.order.length, sec: r.totalSec });
    if (r.daily) return hooks.startDaily?.();
    return hooks.startRoutine?.({ path: "basics", order: r.order, sec: r.sec, tier, label: tt("loop.tier." + tier) });
  }

  /* —— The completion card —— */

  function showDone(o) {
    const modal = $("#loop-done");
    if (!modal) return;
    const { sum } = o;
    const tierName = tt("loop.tier." + o.tier);
    $("#loop-done-kicker").textContent = tt("loop.done.kicker", { tier: tierName });
    $("#loop-done-title").textContent = tt(o.comeback ? "loop.done.titleBack" : "loop.done.title");
    const count = $("#loop-done-count");
    count.innerHTML = `<strong class="loop-pop">${sum.practiceDays}</strong><span>${esc(
      sum.practiceDays === 1 ? tl("loop.day1", null, o.track) : tl("loop.days", null, o.track)
    )}</span>`;
    const week = $("#loop-done-week");
    week.innerHTML = weekHtml(sum, o.track);
    week.setAttribute("aria-label", tt("loop.weekAria"));
    const L = readLoop();
    const { lo, hi } = goalRange(L.goal);
    $("#loop-done-line").innerHTML = `<span>${esc(streakLine(sum))}</span><span>${esc(
      sum.weekDays >= lo ? tt("loop.goalMet", { n: sum.weekDays }) : tt("loop.goal", { n: sum.weekDays, lo, hi })
    )}</span>`;

    const extra = [];
    if (o.comeback) {
      const n = L.comebacks.length;
      extra.push(`<p class="loop-note">${esc(n > 1 ? tt("loop.done.backN", { n }) : tt("loop.done.back"))}</p>`);
    }
    if (o.ms) {
      extra.push(
        `<p class="loop-note loop-ms">${esc(
          o.ms === 1 ? tl("loop.done.msFirst", null, o.track) : tl("loop.done.ms", { n: o.ms }, o.track)
        )}</p>`
      );
    }
    if (o.surprise?.kind === "card") {
      const c = cardText(o.surprise.id);
      if (c) {
        extra.push(`<div class="loop-reward" role="group" aria-label="${esc(c.title)}">
          <p class="loop-reward-k">${esc(tt("loop.done.newCard", { n: Object.keys(L.cards).length, total: CARDS.length }))}</p>
          <h4>${esc(c.title)}</h4>
          <p>${esc(c.body)}</p>
          <p class="loop-card-src">${esc(c.src)}</p>
        </div>`);
      }
    } else if (o.surprise?.kind === "stat") {
      const s = statOptions(sum, o.track).find((x) => x.id === o.surprise.id);
      if (s) {
        extra.push(`<div class="loop-reward is-stat" role="group">
          <p class="loop-reward-k">${esc(tt("loop.done.stat"))}</p>
          <p>${esc(s.text)}</p>
        </div>`);
      }
    }
    $("#loop-done-extra").innerHTML = extra.join("");
    const teaser = tomorrowTeaser(o.track);
    $("#loop-done-tomorrow").textContent =
      o.tier === "ess" && teaser
        ? tt("loop.tomorrowEss", { what: teaser })
        : tt("loop.tomorrowSame", { min: tierMinutes(o.track, "min") });

    const close = $("#loop-done-close");
    close.textContent = tt("loop.done.close");
    const remind = $("#loop-done-remind");
    const remindersOn = !!global.VTReminders?.getConfig?.()?.enabled;
    if (remind) {
      remind.hidden = remindersOn;
      remind.textContent = tt("loop.done.remind");
    }
    modal.hidden = false;
    modal.style.display = "";
    global.VTFocusTrap?.activate?.(modal, { initialFocus: close });
    const finish = (then) => {
      modal.hidden = true;
      global.VTFocusTrap?.release?.(modal);
      close.onclick = null;
      if (remind) remind.onclick = null;
      modal.onkeydown = null;
      modal.onclick = null;
      if (then) then();
    };
    close.onclick = () => finish();
    if (remind) {
      remind.onclick = () =>
        finish(() => {
          track("loop_remind_click", {});
          hooks.focusReminders?.();
        });
    }
    modal.onkeydown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      }
    };
    modal.onclick = (e) => {
      if (e.target === modal) finish();
    };
  }

  /* —— The collection —— */

  function openCards() {
    const modal = $("#loop-cards");
    if (!modal) return;
    const L = readLoop();
    $("#loop-cards-title").textContent = tt("loop.cardsTitle");
    $("#loop-cards-sub").textContent = tt("loop.cardsSub", { n: Object.keys(L.cards).length, total: CARDS.length });
    $("#loop-cards-grid").innerHTML = CARDS.map((c, i) => {
      if (!L.cards[c.id]) {
        return `<li class="loop-card is-locked"><span class="loop-card-n">${i + 1}</span><p class="muted">${esc(tt("loop.cardLocked"))}</p></li>`;
      }
      const t = cardText(c.id);
      return `<li class="loop-card"><span class="loop-card-n">${i + 1}</span><h4>${esc(t.title)}</h4><p>${esc(t.body)}</p><p class="loop-card-src">${esc(t.src)}</p></li>`;
    }).join("");
    const close = $("#loop-cards-close");
    close.textContent = tt("loop.close");
    modal.hidden = false;
    global.VTFocusTrap?.activate?.(modal, { initialFocus: close });
    track("loop_cards_open", { n: Object.keys(L.cards).length });
    const finish = () => {
      modal.hidden = true;
      global.VTFocusTrap?.release?.(modal);
      close.onclick = null;
      modal.onkeydown = null;
      modal.onclick = null;
    };
    close.onclick = finish;
    modal.onkeydown = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish();
      }
    };
    modal.onclick = (e) => {
      if (e.target === modal) finish();
    };
  }

  /* —— Wiring —— */

  /**
   * @param {{ getTab: () => string, findExercise: (id: string) => object|null,
   *   startRoutine: (opts: object) => object, startDaily: () => object,
   *   toast: (msg: string, opts?: object) => void, focusReminders?: () => void }} h
   */
  function bind(h) {
    hooks = h || {};
    if (bound) return;
    bound = true;
    $("#loop-tiers")?.addEventListener("click", (e) => {
      const b = e.target.closest?.("[data-tier]");
      if (!b) return;
      setTier(b.dataset.tier);
      refresh();
    });
    $("#loop-goal-sel")?.addEventListener("change", (e) => {
      setGoal(e.target.value);
      refresh();
    });
    $("#loop-cards-btn")?.addEventListener("click", openCards);
    track("app_open", { day: today(), loop: loopEnabled() });
    // Both arms see a start panel, which is the thing under test, so both are
    // exposed here. Exposing only the loop arm (as this once did) left the
    // classic arm with no exposures at all: a guaranteed sample-ratio
    // mismatch and an unreadable result.
    expose("loop_home_2026_10");
    // The A/A check: two identical arms, to prove the pipeline splits and
    // counts evenly before any real result is trusted.
    expose("aa_2026_10");
  }

  global.VTLoop = {
    TIERS,
    CARDS,
    ROUTINES,
    bind,
    routine,
    tomorrowTeaser,
    renderHome,
    startTier,
    onPractice,
    onRoutineComplete,
    noteRest,
    drawSurprise,
    openCards,
    showDone,
    readLoop,
    merge,
    setTier,
    setGoal,
    // Track-aware copy ("días cantados" / "días de práctica") for other pages.
    tl
  };
})(window);
