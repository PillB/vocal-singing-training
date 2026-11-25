/** Historical repertoire prompts, not a pitch-scoring model or a new audio player.
 * Source editions are linked rather than bundling modern lyrics/arrangements.
 * The existing piano supplies starting notes; its chord loops are accompaniment,
 * never represented as these melodies. No recording leaves the existing flow.
 */
(function (global) {
  "use strict";
  const SONGS = [
    {
      id: "frere-jacques",
      title: "Frère Jacques",
      source: "https://hdl.handle.net/1802/13550",
      edition: "Lebouc / Augener, ca. 1885",
      es: { focus: "Afinación y memoria", task: "Elige la primera frase repetida en la partitura. Escucha o toca sus notas despacio; cántala en una vocal y repítela sin la referencia. Compara si ambas repeticiones conservan las mismas notas." },
      en: { focus: "Pitch and memory", task: "Choose the first repeated phrase in the score. Listen to or play its notes slowly; sing it on a vowel and repeat without the reference. Compare whether both repetitions keep the same notes." }
    },
    {
      id: "auld-lang-syne",
      title: "Auld Lang Syne",
      source: "https://www.loc.gov/item/2014568161/",
      edition: "John Cole, 1800",
      es: { focus: "Pulso y entrada", task: "Ubica la primera entrada respecto al pulso fuerte en la partitura. Marca el pulso, di tu propio texto y canta una frase despacio. Escucha si la entrada y las notas largas conservan su lugar." },
      en: { focus: "Pulse and entry", task: "Locate the first entry relative to the strong beat in the score. Tap the pulse, speak your own words and sing one phrase slowly. Listen for the placement of the entry and long notes." }
    },
    {
      id: "aura-lea",
      title: "Aura Lea",
      source: "https://levysheetmusic.mse.jhu.edu/collection/024/002",
      edition: "Poulton / Fosdick, 1861",
      es: { focus: "Legato y respiración", task: "Elige una frase corta de la melodía y cántala en una vocal. Decide una pausa cómoda y escucha la continuidad entre notas. Esta edición tiene contexto histórico de minstrel; aquí se propone solo la melodía sin letra." },
      en: { focus: "Legato and breathing", task: "Choose a short melody phrase and sing it on a vowel. Choose a comfortable breathing pause and listen for continuity between notes. This edition has a historical minstrel context; this task uses only the wordless melody." }
    }
  ];
  const COPY = {
    es: {
      title: "Canciones para aplicar lo practicado",
      intro: "Para cualquier voz: elige una tonalidad y octava cómodas con el piano. Una tonalidad baja no garantiza comodidad. Si no lees partitura, empieza con una canción propia que conozcas.",
      method: "Elige una frase y un solo foco. Escucha → canta en una vocal → repite sin referencia → graba y escucha. Descansa o acorta la frase cuando lo necesites; no fuerces para acabarla.",
      source: "Abrir partitura histórica",
      rights: "Fuentes históricas de dominio público en EE. UU.; las normas locales pueden variar. No se incluyen grabaciones, letras modernas ni arreglos recientes. Los acordes A/B de arriba son acompañamientos genéricos, no estas melodías.",
      limits: "Son propuestas de práctica, no canciones con eficacia clínica demostrada. El gráfico ayuda con notas sostenidas; no califica texto, ritmo ni expresión. Detente si aparece dolor, mareo o ronquera."
    },
    en: {
      title: "Songs to apply your practice",
      intro: "For any voice: choose a comfortable key and octave with the piano. A low key does not guarantee comfort. If you do not read music, start with a song of your own that you know.",
      method: "Choose one phrase and one focus. Listen → sing on a vowel → repeat without the reference → record and listen. Rest or shorten the phrase whenever needed; do not force its ending.",
      source: "Open historical score",
      rights: "Historical sources in the US public domain; local rules may differ. No recordings, modern lyrics or recent arrangements are included. The A/B chords above are generic accompaniments, not these melodies.",
      limits: "These are practice suggestions, not songs with demonstrated clinical efficacy. The graph helps with sustained notes; it does not grade text, rhythm or expression. Stop for pain, dizziness or hoarseness."
    }
  };
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

  function html(lang) {
    const l = lang === "en" ? "en" : "es";
    const c = COPY[l];
    const cards = SONGS.map((song) => `<article class="card song-study" data-song-study="${song.id}"><h4>${esc(song.title)} · ${esc(song[l].focus)}</h4><p>${esc(song[l].task)}</p><a href="${esc(song.source)}" target="_blank" rel="noopener noreferrer">${esc(c.source)}: ${esc(song.title)}</a><p class="muted">${esc(song.edition)}</p></article>`).join("");
    return `<section class="song-library" aria-labelledby="song-library-title"><h3 id="song-library-title">${esc(c.title)}</h3><p>${esc(c.intro)}</p><p>${esc(c.method)}</p>${cards}<p class="muted">${esc(c.rights)}</p><p>${esc(c.limits)}</p></section>`;
  }
  global.VTSongLibrary = Object.freeze({ SONGS, html });
})(window);
