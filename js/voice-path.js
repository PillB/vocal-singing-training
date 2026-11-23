/**
 * Tu camino — the game layer on top of the daily loop.
 *
 * The loop (js/daily-loop.js) already holds the habit: a lifetime count of days
 * sung, the week, a streak bridged by rest days, a weekly range goal, sparse
 * fact cards. What it could not show is what the practice has been made of, or
 * acknowledge the behaviours that make a voice habit last. This file does both,
 * and nothing else:
 *
 * - **Áreas.** Every exercise belongs to one area of the voice (breath, pitch,
 *   resonance, diction…). An area counts the distinct days it was practised:
 *   one per day however long, so it rewards spacing, not cramming, and a second
 *   session the same day adds nothing. Its stage names say how familiar it is
 *   ("Lo probaste", "En tu rutina"), never how good the singer is: a phone
 *   cannot hear skill, and a count of days is not one.
 * - **Logros.** Acknowledgements of behaviours that are safe and valid to
 *   reward: weeks within your own range, a fixed weekday, coming back after a
 *   break, using a rest day, finishing your basics, trying every area, a
 *   cool-down, warming up before a song, rating or listening back to a take.
 *   Nothing for minutes, sessions, loudness, longest hold or a microphone
 *   score: those reward vocal load or the room, not practice (docs/48).
 *   They are **unannounced**: only earned ones are shown, with no list of
 *   locked ones and no "N of M", because an announced, completion-contingent
 *   reward is the kind that undermines doing a thing for its own sake.
 * - **Nothing withers.** An earned logro is stored and never taken back, even
 *   when what earned it would no longer be true (a goal changed, a ledger
 *   trimmed). The flags sync as a union.
 * - **Only news is news.** The first time this runs on a browser with history,
 *   everything already earned is filed as seen: a long-time singer is not told
 *   eleven things at once. A stage is announced only at its exact count.
 * - **Optional.** Anyone can hide the layer; the loop is untouched by it.
 * - **Your own week, to share.** A plain sentence of this week's days, sent
 *   only when the singer chooses, through the phone's own share sheet.
 *
 * Copy lives here, in both languages, as js/session-sets.js keeps its own.
 */
(function (global) {
  "use strict";

  /** Distinct practice days at which an area reaches its next stage. */
  const STAGES = [1, 5, 15, 40, 100];

  /**
   * The areas of the voice. Every exercise in the catalogue belongs to exactly
   * one (tests/node/voice-path.test.mjs holds that), except the 12-week plan,
   * which is a plan and not an exercise. `tracks` says on which side an area is
   * shown; warm-up, breath and resonance belong to both.
   */
  const AREAS = [
    {
      id: "warm",
      tracks: ["singing", "vocal"],
      ex: ["s4-lip-trills", "s6-straw", "s17-jaw-neck-release", "s28-vocal-function", "v21-straw-to-speech", "v22-voice-recovery", "v24-vocal-function"]
    },
    { id: "breath", tracks: ["singing", "vocal"], ex: ["s8-breath-support", "s15-sh-air-ladder", "s18-costal-breath"] },
    { id: "onset", tracks: ["singing"], ex: ["s1-vocal-fry", "s11-dynamics", "s12-easy-onset", "s14-staccato-legato"] },
    {
      id: "pitch",
      tracks: ["singing"],
      ex: ["s2-solfege-chords", "s9-pitch-match", "s10-five-note", "s13-arpeggio-match", "s16-major-scale-coord", "s27-lip-trill-solfege"]
    },
    {
      id: "reso",
      tracks: ["singing", "vocal"],
      ex: ["s7-humming", "s19-soft-palate-surprise", "s20-five-vowels", "s23-mask-ya", "s26-placement-compare", "v3-soft-palate"]
    },
    { id: "range", tracks: ["singing"], ex: ["s5-sirens", "s21-chest-resonance", "s22-mid-voice-hola", "s24-nana-high", "s25-zone-tour"] },
    { id: "songs", tracks: ["singing"], ex: ["s3-song-stanzas"] },
    { id: "clarity", tracks: ["vocal"], ex: ["v1-diction", "v4-articulation-pen", "v23-clear-speech"] },
    { id: "volume", tracks: ["vocal"], ex: ["v2-volume", "v13-volume-ladder"] },
    { id: "pace", tracks: ["vocal"], ex: ["v10-power-pause", "v11-kill-fillers", "v14-pace-variation", "v17-strategic-concision"] },
    { id: "expr", tracks: ["vocal"], ex: ["v8-fluency-metaphors", "v12-melodic-speech", "v18-story-peak", "v19-authority-close", "v20-energy-match"] },
    { id: "presence", tracks: ["vocal"], ex: ["v5-neutral-ears", "v6-connect", "v7-record-review", "v15-gestures", "v16-facial-expression"] }
  ];
  /** Catalogue entries that are not practice of an area. */
  const NO_AREA = ["v9-12-week"];

  const AREA_OF = new Map();
  AREAS.forEach((a) => a.ex.forEach((id) => AREA_OF.set(id, a.id)));

  /** Areas only one side trains: a day with one of each is a day with both voices. */
  const SINGING_ONLY = AREAS.filter((a) => a.tracks.length === 1 && a.tracks[0] === "singing").map((a) => a.id);
  const VOCAL_ONLY = AREAS.filter((a) => a.tracks.length === 1 && a.tracks[0] === "vocal").map((a) => a.id);

  /** Goal sets whose finish is a gentle ending for the voice. */
  const COOL_SETS = ["s-cooldown", "v-aftertalk"];
  /** Exercises that are a cool-down or a recovery on their own. */
  const COOL_EX = ["v22-voice-recovery"];
  /** Exercises that record and compare, or record and review. */
  const LISTEN_EX = ["s26-placement-compare", "v7-record-review"];
  /** Warm-up areas: practised before a song on the same day, the song was warmed up for. */
  const WARM_AREAS = ["warm", "breath"];
  const SONG_EX = "s3-song-stanzas";

  /* —— Storage: flags in vt_achievements_v1 (per profile, synced as a union) —— */

  const P = "g:";
  const INIT = `${P}init`;
  const earnedKey = (id) => `${P}${id}`;
  const seenKey = (id) => `${P}seen:${id}`;
  const stageEarnedKey = (area, n) => `${P}stage:${area}:${n}`;
  const stageKey = (area, n) => `${P}st:${area}:${n}`;
  const setKey = (id) => `${P}set:${id}`;

  function readFlags() {
    try {
      const f = global.VTStorage?.getAchievementFlags?.();
      return migrateStages(f && typeof f === "object" && !Array.isArray(f) ? { ...f } : {});
    } catch {
      return {};
    }
  }

  // Sync deliberately unions true flags. Keep earned and seen separately; migrate
  // the draft's false pending flags before the next upload, preserving seen wins.
  function validStage(match) {
    return !!match && AREAS.some((area) => area.id === match[1]) && STAGES.includes(Number(match[2]));
  }

  function migrateStages(flags) {
    let changed = false;
    Object.keys(flags).forEach((key) => {
      const m = /^g:st:([a-z]+):(\d+)$/.exec(key);
      if (!validStage(m)) return;
      if (typeof flags[key] !== "boolean") return;
      if (!flags[stageEarnedKey(m[1], Number(m[2]))]) changed = true;
      flags[stageEarnedKey(m[1], Number(m[2]))] = true;
      if (flags[key] === false) changed = true;
      if (flags[key] === false) delete flags[key];
    });
    if (changed) writeFlags(flags);
    return flags;
  }

  function writeFlags(f) {
    try {
      global.VTStorage?.setAchievementFlags?.(f);
    } catch {
      /* quota or private mode: the layer degrades to this visit, never a crash */
    }
  }

  /* —— The ledger, read once per evaluation —— */

  function D() {
    return global.VTDays || null;
  }

  function today() {
    return D()?.dayKey?.() || null;
  }

  /** Practised day keys, oldest first, and their rows. */
  function ledger() {
    const bag = D()?.read?.() || {};
    const days = bag.days || {};
    const rest = bag.rest || { used: [] };
    const counts = D()?.counts || ((r) => Number(r?.n) > 0 || Number(r?.sec) >= 60 || !!r?.saved);
    const keys = Object.keys(days)
      .filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && counts(days[k]))
      .sort();
    return { days, keys, restUsed: Array.isArray(rest.used) ? rest.used : [] };
  }

  /** Every area's practised days, as sorted day keys. */
  function areaDays(lg) {
    const out = {};
    AREAS.forEach((a) => {
      out[a.id] = [];
    });
    lg.keys.forEach((k) => {
      const ex = Array.isArray(lg.days[k].ex) ? lg.days[k].ex : [];
      const hit = new Set(ex.map((id) => AREA_OF.get(id)).filter(Boolean));
      hit.forEach((a) => out[a].push(k));
    });
    return out;
  }

  /** The stage reached at `n` days: 0 before the first, then 1 to 5. */
  function stageOf(n) {
    let s = 0;
    STAGES.forEach((t, i) => {
      if (n >= t) s = i + 1;
    });
    return s;
  }

  /** The low end of the weekly goal the loop holds ("3-5" → 3). */
  function goalLow() {
    const g = String(global.VTLoop?.readLoop?.()?.goal || "3-5");
    const lo = Number(g.split("-")[0]);
    return Number.isFinite(lo) && lo > 0 ? lo : 3;
  }

  /** Practice days per week (Monday to Sunday), keyed by the week's Monday. */
  function perWeek(lg) {
    const out = new Map();
    const ws = D()?.weekStart;
    if (!ws) return out;
    lg.keys.forEach((k) => {
      const w = ws(k);
      out.set(w, (out.get(w) || 0) + 1);
    });
    return out;
  }

  /** Weeks with at least `lo` practice days. Not consecutive: a bad week takes nothing away. */
  function weeksInRange(lg, lo) {
    let n = 0;
    perWeek(lg).forEach((c) => {
      if (c >= lo) n += 1;
    });
    return n;
  }

  /**
   * The weekday (0 = Monday) of the first run of four of the same weekday in a
   * row, or -1. Regularity on the same weekday is among the best predictors of
   * a habit that lasts (Buyalskaya et al. 2023, PNAS).
   */
  function weekdayRun(lg) {
    const set = new Set(lg.keys);
    const add = D()?.addDays;
    const parse = D()?.parseDay;
    if (!add || !parse) return -1;
    for (const k of lg.keys) {
      if (set.has(add(k, -7)) && set.has(add(k, -14)) && set.has(add(k, -21))) {
        return (parse(k).getDay() + 6) % 7;
      }
    }
    return -1;
  }

  /**
   * Returns after a gap the rest days did not cover: two practice days two or
   * more calendar days apart, with the day before the return not a rest day.
   * Read from the ledger, so history from before the loop counts too.
   */
  function comebacks(lg) {
    const diff = D()?.diffDays;
    const add = D()?.addDays;
    if (!diff || !add) return 0;
    const rest = new Set(lg.restUsed);
    let n = 0;
    for (let i = 1; i < lg.keys.length; i += 1) {
      const b = lg.keys[i];
      if (diff(lg.keys[i - 1], b) >= 2 && !rest.has(add(b, -1))) n += 1;
    }
    return n;
  }

  const rowsOf = (lg) => lg.keys.map((k) => lg.days[k]);
  const exOf = (row) => (Array.isArray(row?.ex) ? row.ex : []);

  /** A day on which a warm-up or breath exercise came before the first song. */
  function warmedBeforeSong(lg) {
    return rowsOf(lg).some((row) => {
      const ex = exOf(row);
      const song = ex.indexOf(SONG_EX);
      return song > 0 && ex.slice(0, song).some((id) => WARM_AREAS.includes(AREA_OF.get(id)));
    });
  }

  function allAreas(track, byArea) {
    return AREAS.filter((a) => a.tracks.includes(track)).every((a) => byArea[a.id].length > 0);
  }

  function anyFlag(flags, ids) {
    return ids.some((id) => !!flags[setKey(id)]);
  }

  /**
   * The logros, in the order shown. `test` reads the evaluation context; the
   * group is the kind of behaviour each one acknowledges.
   */
  const LOGROS = [
    { id: "week1", group: "steady", test: (c) => c.weeks >= 1 },
    { id: "week4", group: "steady", test: (c) => c.weeks >= 4 },
    { id: "week12", group: "steady", test: (c) => c.weeks >= 12 },
    { id: "weekday", group: "steady", test: (c) => c.weekday >= 0 },
    { id: "back", group: "back", test: (c) => c.comebacks >= 1 },
    { id: "rest", group: "back", test: (c) => c.lg.restUsed.length >= 1 },
    { id: "basics7", group: "routine", test: (c) => c.basicsDays >= 7 },
    { id: "basics30", group: "routine", test: (c) => c.basicsDays >= 30 },
    { id: "more", group: "routine", test: (c) => rowsOf(c.lg).some((r) => Number(r.basics) > 0 && (r.len === "ess" || r.len === "class")) },
    { id: "allSinging", group: "explore", test: (c) => allAreas("singing", c.byArea) },
    { id: "allVocal", group: "explore", test: (c) => allAreas("vocal", c.byArea) },
    {
      id: "both",
      group: "explore",
      test: (c) => SINGING_ONLY.some((a) => c.byArea[a].length) && VOCAL_ONLY.some((a) => c.byArea[a].length)
    },
    { id: "set", group: "explore", test: (c) => Object.keys(c.flags).some((k) => k.startsWith(`${P}set:`) && c.flags[k]) },
    { id: "cool", group: "care", test: (c) => anyFlag(c.flags, COOL_SETS) || rowsOf(c.lg).some((r) => exOf(r).some((id) => COOL_EX.includes(id))) },
    { id: "warmfirst", group: "care", test: (c) => warmedBeforeSong(c.lg) },
    { id: "rated", group: "listen", test: (c) => rowsOf(c.lg).some((r) => !!r.saved) },
    { id: "listen", group: "listen", test: (c) => rowsOf(c.lg).some((r) => exOf(r).some((id) => LISTEN_EX.includes(id))) }
  ];
  const LOGRO_IDS = LOGROS.map((l) => l.id);

  /** Everything the logros are judged on, from the ledger and the flags. */
  function context(flags) {
    const lg = ledger();
    const byArea = areaDays(lg);
    return {
      lg,
      flags,
      byArea,
      weeks: flags[earnedKey("week12")] ? 12 : weeksInRange(lg, goalLow()),
      weekday: flags[earnedKey("weekday")] ? 0 : weekdayRun(lg),
      comebacks: flags[earnedKey("back")] ? 1 : comebacks(lg),
      basicsDays: rowsOf(lg).filter((r) => Number(r.basics) > 0).length
    };
  }

  function safeTest(l, c) {
    try {
      return !!l.test(c);
    } catch {
      return false;
    }
  }

  /* —— Experiment and the singer's own switch —— */

  const EXPERIMENT = "path_2026_12";

  /** The layer is served: the experiment's control arm, which is also what everybody gets while it is off. */
  function served() {
    try {
      return global.VTExperiments?.variant?.(EXPERIMENT) !== "none";
    } catch {
      return true;
    }
  }

  /** The singer hid the layer (kept in the loop's synced memory, per profile). */
  function hidden() {
    try {
      return !!global.VTLoop?.readLoop?.()?.pathOff;
    } catch {
      return false;
    }
  }

  function setHidden(off) {
    try {
      global.VTLoop?.setPathOff?.(!!off);
    } catch {
      /* ignore */
    }
    track("path_hide", { off: !!off });
  }

  /** Shown: served and not hidden. */
  function visible() {
    return served() && !hidden();
  }

  function track(name, props) {
    try {
      global.VTAnalytics?.track?.(name, props || {});
    } catch {
      /* ignore */
    }
  }

  function expose() {
    try {
      global.VTExperiments?.exposeOnce?.(EXPERIMENT);
    } catch {
      /* ignore */
    }
  }

  /* —— Evaluation —— */

  /**
   * File the stages each area has reached. An exact count is news, a jump past
   * it is not, and the first day in an area is not news at all: the Esencial
   * rotates through areas, so a new singer would be told about one most days.
   */
  function fileStages(flags, byArea, quiet) {
    let changed = false;
    AREAS.forEach((a) => {
      const n = byArea[a.id].length;
      STAGES.forEach((t) => {
        if (n < t || flags[stageEarnedKey(a.id, t)] === true) return;
        flags[stageEarnedKey(a.id, t)] = true;
        if (quiet || n !== t || t === STAGES[0]) flags[stageKey(a.id, t)] = true;
        changed = true;
      });
    });
    return changed;
  }

  /** File the logros earned now; returns the ids that are news. */
  function fileLogros(flags, ids, quiet) {
    ids.forEach((id) => {
      flags[earnedKey(id)] = true;
      if (quiet) flags[seenKey(id)] = true;
    });
    return quiet ? [] : ids;
  }

  /**
   * More logros than this arriving at once are history, not news: a first run
   * on a browser that already holds months of practice, or a sync that brought
   * another device's days. One practice day earns one or two.
   */
  const NEWS_MAX = 3;

  /**
   * Whether what is filed now is filed as already seen. News needs the layer
   * on screen, a browser that has been here before, practice today (what
   * earned it happened today), and only a few things at once.
   */
  function quietNow(flags, count) {
    if (!flags[INIT] || hidden()) return true;
    if (!D().summary?.().todayDone) return true;
    return count > NEWS_MAX;
  }

  /**
   * Bring the stored logros and stages up to date with the ledger.
   * The first run on a browser files everything already earned as seen.
   * @returns {{ fresh: string[] }} the logros earned by this call that are news
   */
  function evaluate() {
    if (!served() || !D()) return { fresh: [] };
    const flags = readFlags();
    const c = context(flags);
    const due = LOGROS.filter((l) => !flags[earnedKey(l.id)] && safeTest(l, c)).map((l) => l.id);
    const quiet = quietNow(flags, due.length);
    const fresh = fileLogros(flags, due, quiet);
    const stagesChanged = fileStages(flags, c.byArea, quiet);
    const first = !flags[INIT];
    flags[INIT] = true;
    if (due.length || stagesChanged || first) writeFlags(flags);
    fresh.forEach((id) => track("path_new", { id }));
    return { fresh };
  }

  /** The logros this profile holds, in display order. Stored, so never taken back. */
  function earned(flags = readFlags()) {
    return LOGRO_IDS.filter((id) => !!flags[earnedKey(id)]);
  }

  /** What has not been shown yet: logros, then stages as [area, n]. */
  function unseen(flags = readFlags()) {
    const logros = earned(flags).filter((id) => !flags[seenKey(id)]);
    const stages = [];
    Object.keys(flags).forEach((k) => {
      const m = /^g:stage:([a-z]+):(\d+)$/.exec(k);
      if (validStage(m) && flags[k] === true && !flags[stageKey(m[1], Number(m[2]))]) stages.push([m[1], Number(m[2])]);
    });
    return { logros, stages };
  }

  /** Mark logros and stages as shown. */
  function markSeen(items) {
    const flags = readFlags();
    (items.logros || []).forEach((id) => {
      flags[seenKey(id)] = true;
    });
    (items.stages || []).forEach(([a, n]) => {
      flags[stageKey(a, n)] = true;
    });
    writeFlags(flags);
  }

  /**
   * A goal set ran to its end with at least half of its steps practised (the
   * loop's own rule for a routine that counts). Sets store nothing of their
   * own, so this is the only record that one was finished.
   */
  function noteSet(id, practised, steps) {
    if (!id || !(practised >= Math.max(1, Math.ceil((Number(steps) || 0) / 2)))) return false;
    const flags = readFlags();
    if (flags[setKey(id)]) return false;
    flags[setKey(id)] = true;
    writeFlags(flags);
    return true;
  }

  /* —— Views of the ledger —— */

  /** A track's areas with their days and stage. */
  function areas(trackId) {
    const lg = ledger();
    const byArea = areaDays(lg);
    const ws = D()?.weekStart?.(today()) || "";
    return AREAS.filter((a) => a.tracks.includes(trackId)).map((a) => {
      const days = byArea[a.id];
      return { id: a.id, days: days.length, stage: stageOf(days.length), week: days.some((k) => k >= ws) };
    });
  }

  /**
   * Weeks within the goal so far, and the most days any one week has had.
   * Counted against today's goal (the ledger keeps no goal per week), so a
   * higher goal counts fewer weeks; the logros already earned stay.
   */
  function weeks() {
    const lg = ledger();
    let best = 0;
    perWeek(lg).forEach((c) => {
      if (c > best) best = c;
    });
    return { inRange: weeksInRange(lg, goalLow()), best };
  }

  /* —— Copy —— */

  const COPY = {
    es: {
      title: "Tu camino",
      sub: "Cuenta días, no talento: en qué has trabajado y lo que has conseguido. Nada de esto se pierde.",
      areasH: "Lo que has practicado",
      areasNote: "Un día por área, por mucho que practiques ese día.",
      daysN: "{n} días",
      day1: "1 día",
      days0: "aún no",
      thisWeek: "esta semana",
      logrosH: "Logros",
      logrosNone: "Aquí aparecen los logros cuando llegan. No hay lista que completar.",
      logrosN: "{n} logros",
      logros1: "1 logro",
      isNew: "Nuevo",
      weeks: "Semanas cumpliendo tu meta: {n} · Tu mejor semana: {b} días",
      weeks1: "Semanas cumpliendo tu meta: {n} · Tu mejor semana: 1 día",
      share: "Compartir mi semana",
      shareDone: "Copiado. Pégalo donde quieras.",
      shareFail: "No se pudo compartir. Este es el texto:",
      shareNote: "Este resumen se comparte solo cuando tú lo decides.",
      hide: "Ocultar",
      hideAria: "Ocultar Tu camino",
      show: "Mostrar Tu camino",
      hiddenNote: "Tu camino está oculto. Tus días y tu racha siguen igual.",
      homeBtn: "Tu camino · {n}\u00a0logros",
      homeBtn1: "Tu camino · 1\u00a0logro",
      homeBtn0: "Tu camino",
      homeNew: "Tu camino · {n}\u00a0nuevos",
      homeNew1: "Tu camino · 1\u00a0nuevo",
      doneLogro: "Nuevo logro",
      doneStage: "{area}: {stage} ({n} días)",
      doneStage1: "{area}: {stage} (1 día)",
      doneMore: "Y {n} más en Historial, en Tu camino.",
      doneMore1: "Y 1 más en Historial, en Tu camino.",
      shareWeek: {
        singing: ["Esta semana practiqué mi voz 1 día", "Esta semana practiqué mi voz {n} días"],
        vocal: ["Esta semana practiqué mi voz 1 día", "Esta semana practiqué mi voz {n} días"]
      },
      shareGoal: " (mi meta: {lo} a {hi}).",
      shareTotal: {
        singing: ["Llevo 1 día de práctica.", "Llevo {n} días de práctica."],
        vocal: ["Llevo 1 día de práctica.", "Llevo {n} días de práctica."]
      },
      shareTail: "Entreno con Entrenamiento vocal y de canto: {url}",
      weekdays: "lunes,martes,miércoles,jueves,viernes,sábados,domingos",
      stage: ["", "Lo probaste", "Lo practicas", "En tu rutina", "Es tuyo", "De siempre"],
      groups: {
        steady: "Constancia",
        back: "Volver",
        routine: "Rutina",
        explore: "Explorar",
        care: "Cuidar la voz",
        listen: "Escucharte"
      },
      area: {
        warm: "Calentar y cuidar",
        breath: "Aire",
        onset: "Inicio y control",
        pitch: "Afinación",
        reso: "Resonancia",
        range: "Graves, medios y agudos",
        songs: "Canciones",
        clarity: "Dicción y claridad",
        volume: "Volumen",
        pace: "Ritmo y pausas",
        expr: "Expresión",
        presence: "Presencia"
      },
      logro: {
        week1: ["Una semana en tu rango", "Cumpliste tu meta semanal. Una meta en rango aguanta mejor las semanas difíciles que un número fijo."],
        week4: ["Cuatro semanas en tu rango", "Cuatro semanas dentro de tu meta, seguidas o no. Un hábito se hace con semanas normales, no perfectas."],
        week12: [
          "Doce semanas en tu rango",
          "Un hábito tarda en volverse automático unos dos meses, con mucha diferencia entre personas. Llevas doce semanas cumpliendo tu meta."
        ],
        weekday: ["Tu día fijo", "Practicaste cuatro {day} seguidos. Repetir el mismo día de la semana es de lo que mejor predice un hábito que dura."],
        back: ["De vuelta", "Volviste después de una pausa. Para un hábito, volver cuenta más que no haber fallado nunca."],
        rest: ["Descanso a tiempo", "Un día de descanso guardado cubrió un día sin práctica. Descansar también es parte de entrenar la voz."],
        basics7: ["Tus básicos, 7 días", "Terminaste tus básicos siete días. Repetir lo mismo es lo que vuelve automático un hábito."],
        basics30: ["Tus básicos, 30 días", "Treinta días con tus básicos terminados. Lo que se repite sin pensarlo ya no cuesta decidirlo."],
        more: ["Más que el mínimo", "Terminaste un Esencial o una Clase. El Mínimo sigue bastando para un día: esto fue un extra."],
        allSinging: [
          "Todas las áreas del canto",
          "Has practicado cada área del canto al menos una vez. Variar a lo largo de las semanas está bien; el Mínimo puede seguir igual."
        ],
        allVocal: [
          "Todas las áreas de la voz hablada",
          "Has practicado cada área de la voz hablada al menos una vez. Variar a lo largo de las semanas está bien; el Mínimo puede seguir igual."
        ],
        both: ["Dos voces", "Practicaste canto y voz hablada. Muchas bases son las mismas: el aire, la resonancia, una voz sin esfuerzo."],
        set: ["Una rutina con objetivo", "Terminaste una rutina por objetivo. Saber para qué practicas algo ayuda a practicarlo con atención."],
        cool: ["Terminar suave", "Hiciste un enfriamiento o una recuperación de la voz. Mucha gente nota la voz más cómoda después; que proteja de lesiones no está probado."],
        warmfirst: ["Calentar antes de cantar", "Practicaste un calentamiento antes de tu canción. Hazlo con comodidad; la duración depende de tu voz y de la tarea."],
        rated: ["Valoraste tu práctica", "Puntuaste cómo te fue. Pararte a valorar lo que hiciste es parte de aprender a cantar."],
        listen: ["Grabar y escucharte", "Mientras cantas también te oyes por dentro, a través de los huesos; una grabación se parece más a lo que oyen los demás."]
      }
    },
    en: {
      title: "Your path",
      sub: "It counts days, not talent: what you have worked on and what you have done. None of it is ever lost.",
      areasH: "What you have practised",
      areasNote: "One day per area, however long you practise that day.",
      daysN: "{n} days",
      day1: "1 day",
      days0: "not yet",
      thisWeek: "this week",
      logrosH: "Milestones",
      logrosNone: "Milestones appear here when they happen. There is no list to complete.",
      logrosN: "{n} milestones",
      logros1: "1 milestone",
      isNew: "New",
      weeks: "Weeks within your goal: {n} · Your best week: {b} days",
      weeks1: "Weeks within your goal: {n} · Your best week: 1 day",
      share: "Share my week",
      shareDone: "Copied. Paste it wherever you like.",
      shareFail: "Could not share. Here is the text:",
      shareNote: "This summary is shared only when you choose.",
      hide: "Hide",
      hideAria: "Hide Your path",
      show: "Show Your path",
      hiddenNote: "Your path is hidden. Your days and your streak are unchanged.",
      homeBtn: "Your path · {n}\u00a0milestones",
      homeBtn1: "Your path · 1\u00a0milestone",
      homeBtn0: "Your path",
      homeNew: "Your path · {n}\u00a0new",
      homeNew1: "Your path · 1\u00a0new",
      doneLogro: "New milestone",
      doneStage: "{area}: {stage} ({n} days)",
      doneStage1: "{area}: {stage} (1 day)",
      doneMore: "And {n} more in History, under Your path.",
      doneMore1: "And 1 more in History, under Your path.",
      shareWeek: {
        singing: ["This week I practised my voice on 1 day", "This week I practised my voice on {n} days"],
        vocal: ["This week I practised my voice on 1 day", "This week I practised my voice on {n} days"]
      },
      shareGoal: " (my goal: {lo} to {hi}).",
      shareTotal: {
        singing: ["1 day of practice so far.", "{n} days of practice so far."],
        vocal: ["1 practice day so far.", "{n} practice days so far."]
      },
      shareTail: "I practise with Vocal & Singing Training: {url}",
      weekdays: "Mondays,Tuesdays,Wednesdays,Thursdays,Fridays,Saturdays,Sundays",
      stage: ["", "Tried", "Practising", "In your routine", "Your own", "Second nature"],
      groups: {
        steady: "Consistency",
        back: "Coming back",
        routine: "Routine",
        explore: "Exploring",
        care: "Voice care",
        listen: "Listening"
      },
      area: {
        warm: "Warm-up and care",
        breath: "Breath",
        onset: "Onset and control",
        pitch: "Pitch",
        reso: "Resonance",
        range: "Low, middle and high",
        songs: "Songs",
        clarity: "Diction and clarity",
        volume: "Volume",
        pace: "Pace and pauses",
        expr: "Expression",
        presence: "Presence"
      },
      logro: {
        week1: ["A week in your range", "You met your weekly goal. A goal that is a range survives a hard week better than a fixed number."],
        week4: ["Four weeks in your range", "Four weeks within your goal, in a row or not. A habit is built from ordinary weeks, not perfect ones."],
        week12: [
          "Twelve weeks in your range",
          "A habit takes about two months to become automatic, with large differences between people. You have met your goal for twelve weeks."
        ],
        weekday: ["Your fixed day", "You practised on four {day} in a row. Practising on the same weekday is among the best predictors of a habit that lasts."],
        back: ["Back again", "You came back after a break. For a habit, coming back counts for more than never missing."],
        rest: ["Rest well timed", "A saved rest day covered a day without practice. Rest is part of training a voice too."],
        basics7: ["Your basics, 7 days", "You finished your basics on seven days. Repeating the same thing is what makes a habit automatic."],
        basics30: ["Your basics, 30 days", "Thirty days with your basics finished. What you repeat without thinking no longer takes deciding."],
        more: ["More than the minimum", "You finished an Essential or a Class. The Minimum is still enough for a day: this was extra."],
        allSinging: [
          "Every area of singing",
          "You have practised every area of singing at least once. Varying over the weeks is good; the Minimum can stay the same."
        ],
        allVocal: [
          "Every area of the speaking voice",
          "You have practised every area of the speaking voice at least once. Varying over the weeks is good; the Minimum can stay the same."
        ],
        both: ["Two voices", "You practised singing and speaking. Many of the basics are the same: breath, resonance, an easy voice."],
        set: ["A routine with a purpose", "You finished a routine for a goal. Knowing what you practise something for helps you practise it with attention."],
        cool: ["Ending gently", "You did a cool-down or a voice recovery. Many people find the voice more comfortable afterwards; there is no proof that it protects the voice from injury."],
        warmfirst: ["Warming up before singing", "You practised a warm-up before your song. Keep it comfortable; the duration depends on your voice and task."],
        rated: ["You rated your practice", "You rated how it went. Stopping to judge what you did is part of learning to sing."],
        listen: ["Record and listen", "While you sing you also hear yourself from inside, through your bones; a recording is closer to what others hear."]
      }
    }
  };

  function lang() {
    return global.VTI18n?.lang === "en" ? "en" : "es";
  }

  function copy() {
    return COPY[lang()];
  }

  function fill(s, vars) {
    return String(s).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? String(vars[k]) : m));
  }

  /** A count's phrase: the `1` key for one, the `N` key otherwise. */
  function plural(n, one, many, vars) {
    const C = copy();
    return fill(n === 1 ? C[one] : C[many], { n, ...(vars || {}) });
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  }

  function areaName(id) {
    return copy().area[id] || id;
  }

  /** A logro's title and caption, with the weekday filled in where one is named. */
  function logroText(id) {
    const C = copy();
    const [title, body] = C.logro[id] || [id, ""];
    let day = "";
    if (id === "weekday") {
      const w = weekdayRun(ledger());
      day = (C.weekdays.split(",")[w >= 0 ? w : 0] || "").trim();
    }
    return { title, body: fill(body, { day }), group: C.groups[LOGROS.find((l) => l.id === id)?.group] || "" };
  }

  /**
   * The week's sentence to share. A week with no practice yet says only the
   * total: "this week I sang on 0 days" is not something anybody shares.
   */
  function shareText(trackId) {
    const C = copy();
    const sum = D()?.summary?.();
    const g = String(global.VTLoop?.readLoop?.()?.goal || "3-5").split("-");
    const n = sum?.weekDays || 0;
    const total = sum?.practiceDays || 0;
    const t = trackId === "vocal" ? "vocal" : "singing";
    const pick = (pair, k) => fill(pair[t][k === 1 ? 0 : 1], { n: k });
    const week = n ? `${pick(C.shareWeek, n)}${fill(C.shareGoal, { lo: g[0], hi: g[1] })} ` : "";
    const url = global.location ? `${global.location.origin}${global.location.pathname}` : "";
    return `${week}${pick(C.shareTotal, total)} ${fill(C.shareTail, { url })}`;
  }

  /* —— Rendering —— */

  let hooks = {};
  const $ = (sel) => global.document?.querySelector?.(sel) || null;

  function currentTrack() {
    return hooks.getTab?.() === "vocal" ? "vocal" : "singing";
  }

  function pipsHtml(stage) {
    let html = "";
    for (let i = 1; i <= STAGES.length; i += 1) html += `<span class="path-pip${i <= stage ? " on" : ""}"></span>`;
    return html;
  }

  function areaHtml(a) {
    const C = copy();
    const stage = C.stage[a.stage] || "";
    const n = a.days === 0 ? C.days0 : a.days === 1 ? C.day1 : fill(C.daysN, { n: a.days });
    // Read out as one sentence: "Aire: 7 días, Lo practicas, esta semana".
    const label = [`${areaName(a.id)}: ${n}`, stage, a.week ? C.thisWeek : ""].filter(Boolean).join(", ");
    return `<li class="path-area${a.days ? "" : " is-empty"}${a.week ? " is-week" : ""}" data-area="${esc(a.id)}" aria-label="${esc(label)}">
      <span class="path-area-name">${esc(areaName(a.id))}</span>
      <span class="path-pips" aria-hidden="true">${pipsHtml(a.stage)}</span>
      <span class="path-area-meta" aria-hidden="true">${esc(n)}${stage ? ` · ${esc(stage)}` : ""}${a.week ? ` · <span class="path-week">${esc(C.thisWeek)}</span>` : ""}</span>
    </li>`;
  }

  /**
   * A logro just earned shows whole, with why it matters; one already seen
   * folds to its title, the why a tap away, so twenty logros stay a list
   * and not a wall of text.
   */
  function logroHtml(id, isNew) {
    const t = logroText(id);
    const C = copy();
    // A span, not a <p>: <summary> takes phrasing content and headings only.
    const head = `<span class="path-logro-k">${esc(t.group)}${isNew ? ` · <span class="path-new">${esc(C.isNew)}</span>` : ""}</span>`;
    if (isNew) {
      return `<li class="path-logro is-new" data-logro="${esc(id)}">
      <span class="path-medal" aria-hidden="true"></span>
      <div class="path-logro-text">${head}<h4>${esc(t.title)}</h4><p>${esc(t.body)}</p></div>
    </li>`;
    }
    return `<li class="path-logro" data-logro="${esc(id)}">
      <span class="path-medal" aria-hidden="true"></span>
      <details class="path-logro-text"><summary>${head}<h4>${esc(t.title)}</h4></summary><p>${esc(t.body)}</p></details>
    </li>`;
  }

  function weeksHtml() {
    const w = weeks();
    if (!w.best) return "";
    const C = copy();
    return `<p class="path-weeks">${esc(fill(w.best === 1 ? C.weeks1 : C.weeks, { n: w.inRange, b: w.best }))}</p>`;
  }

  function cardHiddenHtml() {
    const C = copy();
    return `<p class="muted path-hidden-note">${esc(C.hiddenNote)}</p>
      <button type="button" class="btn btn-ghost btn-sm" data-path-show>${esc(C.show)}</button>`;
  }

  function cardHtml(trackId, flags) {
    const C = copy();
    const list = areas(trackId);
    const got = earned(flags);
    const fresh = new Set([...unseen(flags).logros, ...lingeringLogros()]);
    // What is new first, then the rest in the catalogue's order.
    const order = [...got.filter((id) => fresh.has(id)), ...got.filter((id) => !fresh.has(id))];
    const logros = got.length
      ? `<ul class="path-logros">${order.map((id) => logroHtml(id, fresh.has(id))).join("")}</ul>`
      : `<p class="muted path-none">${esc(C.logrosNone)}</p>`;
    const count = got.length ? `<span class="path-count">${esc(plural(got.length, "logros1", "logrosN"))}</span>` : "";
    return `${weeksHtml()}
      <h4 class="path-h">${esc(C.areasH)}</h4>
      <p class="muted path-note">${esc(C.areasNote)}</p>
      <ul class="path-areas">${list.map(areaHtml).join("")}</ul>
      <h4 class="path-h">${esc(C.logrosH)} ${count}</h4>
      ${logros}
      <div class="path-share">
        <button type="button" class="btn btn-ghost btn-sm" data-path-share>${esc(C.share)}</button>
        <p class="muted path-share-note">${esc(C.shareNote)}</p>
        <p class="path-share-status" role="status"></p>
      </div>`;
  }

  let seenWatch = null;
  // When the home button asked for the card; a few seconds later it no
  // longer explains a jump down the page.
  let focusWanted = 0;
  // Marked seen while the card was on screen, and still labelled "Nuevo"
  // until the card leaves the screen: Historial draws the card more than
  // once on the way in, and the label must not vanish under the reader.
  let lingering = { logros: [], who: null };

  /** Whose card this is: a profile switch must not carry one profile's "Nuevo" to another. */
  function profileId() {
    try {
      return global.VTStorage?.getActiveProfile?.()?.id || "default";
    } catch {
      return "default";
    }
  }

  /** What still wears its "Nuevo" label on this profile's card. */
  function lingeringLogros() {
    return lingering.who === profileId() ? lingering.logros : [];
  }

  /**
   * What the card shows as new counts as seen once the card is on screen,
   * not when it is drawn: Historial draws it behind Estadísticas in design
   * "b", and below the fold on a phone. Without IntersectionObserver it
   * counts when drawn.
   */
  function watchSeen(card, items) {
    seenWatch?.disconnect?.();
    seenWatch = null;
    const pending = items.logros.length + items.stages.length > 0;
    if (!pending && !lingeringLogros().length) return;
    const IO = global.IntersectionObserver;
    if (typeof IO !== "function") {
      if (pending) markSeen(items);
      return;
    }
    let wasOn = false;
    const watch = new IO((entries) => {
      const on = entries.some((e) => e.isIntersecting);
      if (on && !wasOn && pending) {
        markSeen(items);
        lingering = { logros: [...lingeringLogros(), ...items.logros], who: profileId() };
        renderHomeButton();
      }
      if (!on && wasOn) {
        lingering = { logros: [], who: null };
        watch.disconnect();
        if (seenWatch === watch) seenWatch = null;
      }
      wasOn = wasOn || on;
    });
    seenWatch = watch;
    watch.observe(card);
  }

  /** Arrived from the home button: bring the card into view once it is drawn and shown. */
  function focusIfWanted(card) {
    if (!focusWanted || Date.now() - focusWanted > 4000 || !card.getClientRects?.().length) return;
    focusWanted = 0;
    card.scrollIntoView?.({ block: "start" });
    $("#path-title")?.focus?.({ preventScroll: true });
  }

  /** Draw the card in Historial. */
  function renderCard() {
    const card = $("#path-card");
    if (!card) return;
    const practised = !!D() && (D().summary?.().practiceDays || 0) > 0;
    // Both arms differ from here on, so both count as exposed.
    if (practised) expose();
    const on = practised && served();
    card.hidden = !on;
    if (!on) return;
    const C = copy();
    $("#path-title").textContent = C.title;
    $("#path-sub").textContent = C.sub;
    const toggle = $("#path-toggle");
    const body = $("#path-body");
    if (hidden()) {
      if (toggle) toggle.hidden = true;
      body.innerHTML = cardHiddenHtml();
      watchSeen(card, { logros: [], stages: [] });
      return;
    }
    evaluate();
    const flags = readFlags();
    if (toggle) {
      toggle.hidden = false;
      toggle.textContent = C.hide;
      toggle.setAttribute("aria-label", C.hideAria);
    }
    body.innerHTML = cardHtml(currentTrack(), flags);
    watchSeen(card, unseen(flags));
    focusIfWanted(card);
  }

  /** The quiet way in from home, beside the fact cards: how many logros, or how many are new. */
  function renderHomeButton() {
    const b = $("#path-home-btn");
    if (!b) return;
    const sum = D()?.summary?.();
    const on = !!sum && sum.practiceDays > 0;
    if (on) expose();
    if (!on || !visible()) {
      b.hidden = true;
      return;
    }
    evaluate();
    const flags = readFlags();
    const n = earned(flags).length;
    const u = unseen(flags);
    const news = u.logros.length + u.stages.length;
    b.hidden = false;
    b.classList.toggle("has-new", news > 0);
    b.textContent = news ? plural(news, "homeNew1", "homeNew") : n ? plural(n, "homeBtn1", "homeBtn") : copy().homeBtn0;
  }

  /** At most this many lines on a completion card; the rest wait in Historial. */
  const DONE_MAX = 2;

  function stageLine(area, n) {
    const C = copy();
    return fill(n === 1 ? C.doneStage1 : C.doneStage, { area: areaName(area), stage: C.stage[stageOf(n)] || "", n });
  }

  function doneItemHtml(it) {
    const C = copy();
    if (it.logro) {
      const t = logroText(it.logro);
      return `<div class="path-done" data-logro="${esc(it.logro)}"><span class="path-medal" aria-hidden="true"></span><div><p class="path-done-k">${esc(C.doneLogro)}</p><p class="path-done-t">${esc(t.title)}</p><p class="path-done-b">${esc(t.body)}</p></div></div>`;
    }
    return `<p class="path-done is-stage" data-stage="${esc(it.stage[0])}"><span class="path-pip on" aria-hidden="true"></span>${esc(stageLine(it.stage[0], it.stage[1]))}</p>`;
  }

  /**
   * The lines a completion card adds for what today brought, already escaped,
   * and marks what it shows as seen. Empty when the layer is off or nothing is new.
   * @param {{ max?: number, skip?: string[] }} [opts] `max` lines at most (the
   *   card may already carry other news); `skip` logros the card already says
   *   in its own words, marked seen and not repeated.
   * @returns {string}
   */
  function doneHtml(opts = {}) {
    if (!visible()) return "";
    evaluate();
    const u = unseen();
    const skip = (opts.skip || []).filter((id) => u.logros.includes(id));
    if (skip.length) {
      markSeen({ logros: skip });
      renderHomeButton();
    }
    const items = [
      ...u.logros.filter((id) => !skip.includes(id)).map((id) => ({ logro: id })),
      ...u.stages.map((st) => ({ stage: st }))
    ];
    if (!items.length) return "";
    const shown = items.slice(0, Math.max(1, Math.min(DONE_MAX, Number(opts.max) || DONE_MAX)));
    const html = shown.map(doneItemHtml);
    const rest = items.length - shown.length;
    if (rest > 0) html.push(`<p class="path-done-more muted">${esc(plural(rest, "doneMore1", "doneMore"))}</p>`);
    markSeen({ logros: shown.filter((x) => x.logro).map((x) => x.logro), stages: shown.filter((x) => x.stage).map((x) => x.stage) });
    // Home is already drawn under the card, still counting these as new.
    renderHomeButton();
    return `<div class="path-done-list" role="group" aria-label="${esc(copy().title)}">${html.join("")}</div>`;
  }

  async function share(btn) {
    const text = shareText(currentTrack());
    const status = btn?.closest?.(".path-share")?.querySelector?.(".path-share-status");
    const say = (s) => {
      if (status) status.textContent = s;
    };
    const nav = global.navigator || {};
    try {
      if (typeof nav.share === "function") {
        await nav.share({ text });
        track("path_share", { how: "share" });
        return "share";
      }
    } catch (err) {
      // The singer closed the share sheet: nothing to say.
      if (err && err.name === "AbortError") return "abort";
    }
    try {
      await nav.clipboard.writeText(text);
      say(copy().shareDone);
      track("path_share", { how: "copy" });
      return "copy";
    } catch {
      say(`${copy().shareFail} ${text}`);
      track("path_share", { how: "shown" });
      return "shown";
    }
  }

  /**
   * @param {{ getTab: () => string, showHistory?: () => void }} h
   */
  function bind(h) {
    hooks = h || {};
    const card = $("#path-card");
    if (card && !card.dataset.bound) {
      card.dataset.bound = "1";
      card.addEventListener("click", (e) => {
        const t = e.target;
        if (t.closest?.("[data-path-share]")) share(t.closest("[data-path-share]"));
        else if (t.closest?.("[data-path-show]")) {
          setHidden(false);
          renderCard();
          $("#path-toggle")?.focus?.();
        } else if (t.closest?.("#path-toggle")) {
          setHidden(true);
          renderCard();
          card.querySelector("[data-path-show]")?.focus?.();
        }
      });
    }
    const b = $("#path-home-btn");
    if (b && !b.dataset.bound) {
      b.dataset.bound = "1";
      b.addEventListener("click", () => {
        track("path_open", { from: "home" });
        focusWanted = Date.now();
        // Historial draws the card again once its calendar is in (after the
        // recordings are read), and renderCard scrolls to it then. Scrolling
        // here would aim at where the card is before the calendar pushes it
        // down, and land a screen short of it at 200% zoom.
        hooks.showHistory?.();
      });
    }
  }

  global.VTPath = {
    EXPERIMENT,
    STAGES,
    AREAS,
    NO_AREA,
    LOGROS: LOGRO_IDS,
    COPY,
    areaOf: (id) => AREA_OF.get(id) || null,
    stageOf,
    areas,
    weeks,
    evaluate,
    earned,
    unseen,
    markSeen,
    noteSet,
    served,
    hidden,
    setHidden,
    visible,
    shareText,
    share,
    doneHtml,
    renderCard,
    renderHomeButton,
    logroText,
    bind
  };
})(window);
