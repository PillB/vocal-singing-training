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
    const def = SETS.find((s) => s.id === id);
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
      order,
      sec,
      totalSec,
      minutes: Math.max(1, Math.round(totalSec / 60)),
      name: words.name,
      goal: words.goal,
      why: words.why,
      tip: words.tip,
      src: words.src
    };
  }

  /** The sets of a track, in the order written. */
  function list(trackId) {
    return SETS.filter((s) => s.track === trackId)
      .map((s) => resolve(s.id))
      .filter(Boolean);
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

  function cardHtml(set, done) {
    const all = set.order.every((id) => done.includes(id));
    const meta = tt("sets.meta", { min: String(set.minutes), n: String(set.order.length) });
    return `<li class="set-card${all ? " is-today" : ""}" data-set="${esc(set.id)}">
      <div class="set-head">
        <h4 id="set-name-${esc(set.id)}">${esc(set.name)}</h4>
        <span class="set-meta">${esc(meta)}</span>
      </div>
      <p class="set-goal">${esc(set.goal)}</p>
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

  function openSheet(opener) {
    const modal = $("#sets-sheet");
    if (!modal) return;
    const trackId = hooks.getTab?.() === "vocal" ? "vocal" : "singing";
    const sets = list(trackId);
    const done = practisedToday();
    $("#sets-title").textContent = tt("sets.title");
    $("#sets-sub").textContent = tt(trackId === "vocal" ? "sets.subVocal" : "sets.subSinging");
    $("#sets-list").innerHTML = sets.map((s) => cardHtml(s, done)).join("");
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
    track("sets_open", { track: trackId, n: sets.length });
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
    more.onclick = () => finish(() => openSheet());
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
    GRADES,
    GRADE_MARKS,
    SETS,
    SHORT,
    bind,
    list,
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
